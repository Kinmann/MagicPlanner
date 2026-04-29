use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Manager, Emitter};
use sqlx::{SqlitePool, Row};
use crate::ActiveTasks;
use std::sync::Arc;

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================
pub use crate::models::{
    NodeState, PipelineError, RagErrorInfo,
    Project, DocumentNode, GenerationIteration,
    PipelineStatusPayload, LocalModule,
};

// 서비스 함수 임포트
use crate::services::embedding::{store_document_embeddings};
use crate::services::prd_merger::get_approved_node_output;
use crate::services::draft_generator::{generate_draft, evaluate_draft};
use crate::services::dag_engine::{trigger_next_nodes, trigger_module_next_nodes, is_node_locked};
use crate::commands::approval::actual_approve_genesis_prd;

#[tauri::command]
pub async fn run_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    node_type: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> run_pipeline started for project: {}, identifier: {}", project_id, node_type);

    // 1. 노드 정보 조회 (ID 또는 Type으로 조회 가능하도록 유연성 확보)
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND (target_node_type = ? OR node_id = ?)"
    )
    .bind(&project_id)
    .bind(&node_type)
    .bind(&node_type)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Node not found: {}", node_type))?;

    // 잠금 상태 확인
    if is_node_locked(&*pool, &node).await? {
        return Err("하위 노드가 이미 진행 중이거나 완료되어 이 노드를 다시 실행할 수 없습니다.".into());
    }

    let actual_node_type = node.target_node_type.clone();

    // 실행 중인 작업 확인
    {
        let mut tasks = active_tasks.0.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&node.node_id) {
            println!(">>> [ABORT] Node is already running: {}", node.node_id);
            return Err("이미 파이프라인이 실행 중입니다. (ActiveTask Detect)".to_string());
        }
        tasks.insert(node.node_id.clone());
    }

    // RAII 기반 가드
    struct TaskGuard {
        tasks: Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
        node_id: String,
    }
    impl Drop for TaskGuard {
        fn drop(&mut self) {
            if let Ok(mut t) = self.tasks.lock() {
                t.remove(&self.node_id);
            }
        }
    }
    let _guard = TaskGuard { tasks: active_tasks.0.clone(), node_id: node.node_id.clone() };

    if node.node_state != "READY" && node.node_state != "PAUSED_HITL" && node.node_state != "PAUSED_API_ERROR" && node.node_state != "PAUSED_STOPPED" && node.node_state != "COMPLETED" && node.node_state != "STALE" {
          return Err("현재 상태에서는 실행할 수 없는 노드입니다. (READY, PAUSED_HITL, PAUSED_API_ERROR, PAUSED_STOPPED 또는 COMPLETED 상태 필요)".to_string());
    }

    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // 2. 노드 상태 업데이트: IN_PROGRESS
    sqlx::query(
        "UPDATE document_node SET node_state = 'IN_PROGRESS', last_action = '작업 준비 중...', api_error_message = NULL, updated_at = ? WHERE node_id = ?"
    )
    .bind(Utc::now().to_rfc3339())
    .bind(&node.node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 후행 노드 상태 리셋 (부모가 다시 실행되므로 READY 상태였던 후행 노드들은 PENDING으로 전환)
    if let Some(mid) = &node.module_id {
        let _ = crate::services::dag_engine::reset_module_downstream_ready_nodes(&app_handle, mid, &actual_node_type).await;
    } else {
        let _ = crate::services::dag_engine::reset_downstream_ready_nodes(&app_handle, &project_id, &actual_node_type).await;
    }

    let _ = app_handle.emit("nodes-updated", ());

    let client = Client::new();
    let max_iters = node.max_iterations;
    let _threshold = node.threshold_score;
    let mut current_best_content = String::new();
    let mut current_best_score = node.current_best_score;
    let mut final_iteration_count = node.current_iteration;

    // 2.5 [RETRY] 이전 반복 컨텍스트 로드 (작업 생성 재개)
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut previous_draft = String::new();
    let mut previous_feedback: Vec<String> = Vec::new();
    let mut loop_error: Option<PipelineError> = None;

    if let Some(it) = latest_iter {
        println!(">>> Resuming from previous iteration context (Node: {})", actual_node_type);
        previous_draft = it.generated_draft_json;
        
        // 피드백 데이터 로드 (문자열 vs EvaluationIssue)
        if let Some(errors_json) = it.critical_errors_array {
            if let Ok(issues) = serde_json::from_str::<Vec<crate::schemas::EvaluationIssue>>(&errors_json) {
                for issue in issues {
                    previous_feedback.push(format!("[위치: {}] {} : {}", issue.location, issue.code, issue.description));
                }
            } else if let Ok(errors) = serde_json::from_str::<Vec<String>>(&errors_json) {
                // 레거시 피드백
                previous_feedback.extend(errors);
            }
        }
        if let Some(action_json) = it.actionable_feedback_text {
            if let Ok(issues) = serde_json::from_str::<Vec<crate::schemas::EvaluationIssue>>(&action_json) {
                for issue in issues {
                    previous_feedback.push(format!("[실행 가능 피드백 - 위치: {}] {} : {}", issue.location, issue.code, issue.description));
                }
            } else if let Ok(feedback) = serde_json::from_str::<Vec<String>>(&action_json) {
                // 레거시 피드백
                for f in feedback {
                    previous_feedback.push(format!("실행 가능 피드백: {}", f));
                }
            }
        }
    }

    let start_iter = node.current_iteration + 1;
    for i in start_iter..=max_iters {
        final_iteration_count = i;
        println!(">>> Iteration {}/{} starting for {}", i, max_iters, actual_node_type);
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "초안 생성 중".into(),
            node_type: actual_node_type.clone(),
            level: "INFO".into(),
            current_iteration: Some(i),
            max_iterations: Some(max_iters),
            node_id: node.node_id.clone(),
            project_id: project.project_id.clone(),
            status: "IN_PROGRESS".into(),
        });
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("초안 생성 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let input_text = if node.node_category == "SAD" {
            let out_1a = get_approved_node_output(&*pool, &project_id, "GPRD_Context_Goal").await;
            let out_1b = get_approved_node_output(&*pool, &project_id, "GPRD_Capability_Actor").await;
            let out_1c = get_approved_node_output(&*pool, &project_id, "GPRD_Architecture_Schema").await;
            
            let mut base_input = format!(
                "[GPRD_Context_Goal]\n{}\n\n[GPRD_Capability_Actor]\n{}\n\n[GPRD_Architecture_Schema]\n{}", 
                out_1a, out_1b, out_1c
            );

            // SAD 모듈 분할 단계인 경우 선행 노드 결과를 Source Documents에 명시적 주입 (SSOT 강조)
            if actual_node_type == "SAD_Epic_Mapping" || actual_node_type == "SAD_Module_Deps" {
                let out_module_list = get_approved_node_output(&*pool, &project_id, "SAD_Module_List").await;
                if !out_module_list.is_empty() {
                    base_input = format!("[Approved Module List (SSOT)]\n{}\n\n{}", out_module_list, base_input);
                }
            }
            if actual_node_type == "SAD_Module_Deps" {
                let out_epic_mapping = get_approved_node_output(&*pool, &project_id, "SAD_Epic_Mapping").await;
                if !out_epic_mapping.is_empty() {
                    base_input = format!("[Approved Epic Mapping (SSOT)]\n{}\n\n{}", out_epic_mapping, base_input);
                }
            }

            base_input
        } else if node.node_category == "MODULE" {
            // 모듈별 컨텍스트 주입
            if let Some(mid) = &node.module_id {
                let module_info = sqlx::query_as::<_, LocalModule>("SELECT * FROM local_module WHERE module_id = ?")
                    .bind(mid)
                    .fetch_optional(&*pool)
                    .await
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("Module not found for ID: {}", mid))?;

                format!(
                    "[Module Name]\n{}\n\n[Core Responsibility]\n{}\n\n[Description]\n{}\n\n[Mapped Epics]\n{}\n\n[Dependencies]\n{}\n\n[Project Overview]\n{}",
                    module_info.module_name,
                    module_info.core_responsibility.as_deref().unwrap_or("N/A"),
                    module_info.module_description.as_deref().unwrap_or("N/A"),
                    module_info.mapped_epics.as_deref().unwrap_or("N/A"),
                    module_info.dependency_spec.as_deref().unwrap_or("[]"),
                    project.raw_input_text
                )
            } else {
                project.raw_input_text.clone()
            }
        } else {
            project.raw_input_text.clone()
        };

        let draft_res = generate_draft(&app_handle, &pool, &client, &api_key, &project.project_id, &node.node_category, &actual_node_type, &input_text, &previous_draft, &previous_feedback, i, node.target_count, vec![]).await;
        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        // [STOP CHECK] AI 생성 후 중지 확인
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Pipeline stopped manually after generation (Node: {})", node.node_id);
            break;
        }

        println!(">>> Iteration {}: Draft generated, evaluating...", i);
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "초안 평가 중".into(),
            node_type: actual_node_type.clone(),
            level: "INFO".into(),
            current_iteration: Some(i),
            max_iterations: Some(max_iters),
            node_id: node.node_id.clone(),
            project_id: project.project_id.clone(),
            status: "IN_PROGRESS".into(),
        });
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("초안 평가 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let input_text_for_eval = Some(input_text.clone());
        let mut global_ctx_str = String::new();
        if node.node_category == "SAD" {
            use sqlx::Row;
            let contexts = sqlx::query("SELECT context_type, context_data_json FROM global_context WHERE project_id = ? AND is_deleted = 0")
                .bind(&project.project_id).fetch_all(&*pool).await.map_err(|e| e.to_string())?;
            for row in contexts {
                let t: String = row.get("context_type");
                let d: String = row.get("context_data_json");
                global_ctx_str.push_str(&format!("\n[{}]\n{}\n", t.to_lowercase(), d));
            }
        }

        let empty_feedback = Vec::new(); // run_pipeline에서는 이전 피드백을 사용하여 생성을 유도하므로 별도 피드백은 비움
        let eval_res = evaluate_draft(&app_handle, &pool, &client, &api_key, &project.project_id, &node.node_category, &actual_node_type, &draft, input_text_for_eval, &global_ctx_str, "", &empty_feedback, i, vec![]).await;
        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        // [STOP CHECK] 평가 후 저장 전 중지 확인
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Pipeline stopped manually before save (Node: {})", node.node_id);
            break;
        }

        // D. 반복 데이터 DB 저장 (ERD 기준)
        let iter_id = Uuid::new_v4().to_string();
        let errors_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();
        let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();
        
        let is_passed = false; // [FIX] 자동 통과 제거 (사용자 수동 확정 필수)

        // [주의] 통과 시 이전 통과 상태 무효화
        if is_passed {
            let _ = sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await;
        }

        sqlx::query(
            "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
        )
        .bind(iter_id)
        .bind(&node.node_id)
        .bind(i)
        .bind(&draft)
        .bind(eval.score)
        .bind(if is_passed { 1 } else { 0 })
        .bind(errors_json)
        .bind(feedback_json)
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        // 반복 횟수 업데이트
        sqlx::query(
            "UPDATE document_node SET current_iteration = ?, updated_at = ? WHERE node_id = ?"
        )
        .bind(i)
        .bind(Utc::now().to_rfc3339())
        .bind(&node.node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());

        if eval.score >= current_best_score {
            current_best_score = eval.score;
            current_best_content = draft.clone();
        }

        println!(">>> Iteration {}: Score = {}, Pass = {}", i, eval.score, eval.is_pass);

        // [LOG] 초안 생성 완료 이벤트 발행
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "초안 생성 완료".into(),
            node_type: actual_node_type.clone(),
            level: "SUCCESS".into(),
            current_iteration: Some(i),
            max_iterations: Some(max_iters),
            node_id: node.node_id.clone(),
            project_id: project.project_id.clone(),
            status: "ITERATION_COMPLETED".into(),
        });
        
        // 다음 반복을 위한 피드백 구성 (이전 초안 피드백 업데이트)
        previous_draft = draft;
        previous_feedback.clear();
        for issue in &eval.critical_errors {
            previous_feedback.push(format!("[위치: {}] {} : {}", issue.location, issue.code, issue.description));
        }
        for issue in &eval.feedback {
            previous_feedback.push(format!("[실행 가능 피드백 - 위치: {}] {} : {}", issue.location, issue.code, issue.description));
        }
    }

    // 반복문 종료 후 상태 확인 (PAUSED_STOPPED 상태 등 체크)
    if is_node_stopped(&pool, &node.node_id).await {
        println!(">>> Pipeline loop for node {} terminated due to manual stop signal.", node.node_id);
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "파이프라인 루프가 사용자에 의해 중단되었습니다.".into(),
            node_id: node.node_id.clone(),
            project_id: project.project_id.clone(),
            status: "STOPPED".into(),
            current_iteration: Some(final_iteration_count),
            max_iterations: Some(max_iters),
            node_type: actual_node_type.clone(),
            level: "WARN".into()
        });
        return Ok(current_best_content);
    }

    // 4. 최종 상태 업데이트
    let final_state = if let Some(e) = loop_error {
        match e {
            PipelineError::ApiError(code, msg) => {
                sqlx::query(
                    "UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?"
                )
                .bind(code as i32)
                .bind(&msg)
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
                return Err(format!("API Error ({}): {}", code, msg));
            },
            PipelineError::Internal(msg) => {
                sqlx::query(
                    "UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?"
                )
                .bind(500)
                .bind(&msg)
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
                return Err(msg);
            }
        }
    } else {
        NodeState::PausedHitl
    };

    sqlx::query(
        "UPDATE document_node SET node_state = ?, current_iteration = ?, current_best_score = ?, updated_at = ? WHERE node_id = ?"
    )
    .bind(final_state.to_string())
    .bind(final_iteration_count)
    .bind(current_best_score)
    .bind(Utc::now().to_rfc3339())
    .bind(&node.node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 5. [성공 시] 다음 노드 트리거 및 RAG 임베딩
    if final_state == NodeState::Completed {
        // [RAG] 성공한 최적의 이터레이션을 DB에서 조회
        let best_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
        if let Some(iter) = best_iter {
            if node.node_category != "GENESIS" {
                let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
                    message: "RAG 저장 중...".into(),
                    node_id: node.node_id.clone(),
                    node_type: actual_node_type.clone(),
                    project_id: project_id.clone(),
                    level: "INFO".into(),
                    status: "EMBEDDING_START".into(),
                    current_iteration: None,
                    max_iterations: None,
                });
                sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                    .bind("RAG 저장 중...")
                    .bind(Utc::now().to_rfc3339())
                    .bind(&node.node_id)
                    .execute(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
                let _ = app_handle.emit("nodes-updated", ());

                let embedding_res = store_document_embeddings(
                    &*pool, &client, &api_key,
                    &project_id, None,
                    &node.node_id, &actual_node_type,
                    &iter.iteration_id, &iter.generated_draft_json,
                    iter.calculated_score.unwrap_or(0),
                ).await;

                match embedding_res {
                    Ok(_) => {
                        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
                            message: "RAG 저장 완료".into(),
                            node_id: node.node_id.clone(),
                            node_type: actual_node_type.clone(),
                            project_id: project_id.clone(),
                            level: "SUCCESS".into(),
                            status: "EMBEDDING_COMPLETE".into(),
                            current_iteration: None,
                            max_iterations: None,
                        });
                    },
                    Err(e) => {
                        let err_msg = format!("RAG 임베딩 실패({}): {}", actual_node_type, e);
                        println!(">>> [RAG] {}", err_msg);
                        
                        let error_info = RagErrorInfo {
                            project_id: project_id.clone(),
                            node_id: node.node_id.clone(),
                            node_type: actual_node_type.clone(),
                            error_message: e.to_string(),
                        };
                        let _ = app_handle.emit("rag-error", error_info);
                        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
                            message: "RAG 저장 실패".into(),
                            node_id: node.node_id.clone(),
                            node_type: actual_node_type.clone(),
                            project_id: project_id.clone(),
                            level: "ERROR".into(),
                            status: "EMBEDDING_FAILED".into(),
                            current_iteration: None,
                            max_iterations: None,
                        });
                    }
                }

                let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                    .bind(Utc::now().to_rfc3339())
                    .bind(&node.node_id)
                    .execute(&*pool)
                    .await;
                let _ = app_handle.emit("nodes-updated", ());
            }
        }

        trigger_next_nodes(app_handle.clone(), &project_id, &actual_node_type).await?;
    }

    // 최종 상태가 반영되도록 항상 이벤트 발행
    let _ = app_handle.emit("nodes-updated", ());

    Ok(current_best_content)
}

#[tauri::command]
pub async fn handle_hitl_action(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    action: String,
    app_handle: tauri::AppHandle,
    api_key: Option<String>,
) -> Result<(), String> {
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    match action.as_str() {
        "APPROVE" => {
            sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&node_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;

            let _ = app_handle.emit("nodes-updated", ());

            let pool_clone = pool.inner().clone();
            let app_handle_clone = app_handle.clone();
            let node_id_clone = node_id.clone();
            let project_id_clone = node.project_id.clone();
            let module_id_clone = node.module_id.clone();
            let node_type_clone = node.target_node_type.clone();
            let node_category_for_bg = node.node_category.clone();

            let api_key_passed = api_key;
            tauri::async_runtime::spawn(async move {
                let client = app_handle_clone.state::<Client>();
                
                let mut actual_key = api_key_passed;
                if actual_key.as_deref().unwrap_or("").trim().is_empty() {
                    let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
                        .fetch_optional(&pool_clone).await;
                    
                    actual_key = match session_res {
                        Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
                        _ => None,
                    };
                }

                let final_api_key = match actual_key {
                    Some(key) if !key.trim().is_empty() => key,
                    _ => {
                        println!(">>> [RAG-BG] Failed to get API key");
                        let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                            message: "RAG 중단: API 키가 설정되지 않았습니다.".into(),
                            node_id: node_id_clone.clone(),
                            node_type: node_type_clone.clone(),
                            project_id: project_id_clone.clone(),
                            level: "ERROR".into(),
                            status: "EMBEDDING_FAILED".into(),
                            current_iteration: None,
                            max_iterations: None,
                        });
                        return;
                    }
                };

                let best_iter_res = sqlx::query_as::<_, GenerationIteration>(
                    "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
                )
                .bind(&node_id_clone)
                .fetch_optional(&pool_clone)
                .await;

                if let Ok(Some(iter)) = best_iter_res {
                    let mut embedding_success = true;
                    if node_category_for_bg != "GENESIS" {
                        // [LOG] RAG 시작 알림 및 DB 상태 업데이트
                        let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                            message: "RAG 저장 중...".into(),
                            node_id: node_id_clone.clone(),
                            node_type: node_type_clone.clone(),
                            project_id: project_id_clone.clone(),
                            level: "INFO".into(),
                            status: "EMBEDDING_START".into(),
                            current_iteration: None,
                            max_iterations: None,
                        });
                        let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                            .bind("RAG 저장 중...")
                            .bind(Utc::now().to_rfc3339())
                            .bind(&node_id_clone)
                            .execute(&pool_clone)
                            .await;
                        let _ = app_handle_clone.emit("nodes-updated", ());

                        let embedding_res = store_document_embeddings(
                            &pool_clone, &*client, &final_api_key,
                            &project_id_clone, module_id_clone.as_deref(),
                            &node_id_clone, &node_type_clone,
                            &iter.iteration_id, &iter.generated_draft_json,
                            iter.calculated_score.unwrap_or(0),
                        ).await;

                        match embedding_res {
                            Ok(_) => {
                                let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                                    message: "RAG 저장 완료".into(),
                                    node_id: node_id_clone.clone(),
                                    node_type: node_type_clone.clone(),
                                    project_id: project_id_clone.clone(),
                                    level: "SUCCESS".into(),
                                    status: "EMBEDDING_COMPLETE".into(),
                                    current_iteration: None,
                                    max_iterations: None,
                                });
                            },
                            Err(e) => {
                                embedding_success = false;
                                let err_msg = format!("RAG 임베딩 실패({}): {}", node_type_clone, e);
                                println!(">>> [RAG-BG] {}", err_msg);
                                
                                let error_info = RagErrorInfo {
                                    project_id: project_id_clone.clone(),
                                    node_id: node_id_clone.clone(),
                                    node_type: node_type_clone.clone(),
                                    error_message: e.to_string(),
                                };
                                let _ = app_handle_clone.emit("rag-error", error_info);
                                let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                                    message: "RAG 저장 실패".into(),
                                    node_id: node_id_clone.clone(),
                                    node_type: node_type_clone.clone(),
                                    project_id: project_id_clone.clone(),
                                    level: "ERROR".into(),
                                    status: "EMBEDDING_FAILED".into(),
                                    current_iteration: None,
                                    max_iterations: None,
                                });
                            }
                        }
                        
                        // DB 상태 초기화
                        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                            .bind(Utc::now().to_rfc3339())
                            .bind(&node_id_clone)
                            .execute(&pool_clone)
                            .await;
                        let _ = app_handle_clone.emit("nodes-updated", ());
                    }

                    if embedding_success {
                        if let Some(mid) = &module_id_clone {
                            let _ = trigger_module_next_nodes(&app_handle_clone, mid, &node_type_clone).await;
                        } else {
                            let _ = trigger_next_nodes(app_handle_clone, &project_id_clone, &node_type_clone).await;
                        }
                    }
                } else {
                    println!(">>> [RAG-BG] No iteration found for node: {}, triggering anyway", node_id_clone);
                    if let Some(mid) = &module_id_clone {
                        let _ = trigger_module_next_nodes(&app_handle_clone, mid, &node_type_clone).await;
                    } else {
                        let _ = trigger_next_nodes(app_handle_clone, &project_id_clone, &node_type_clone).await;
                    }
                }
            });
        }
        "RETRY" => {
            sqlx::query("UPDATE document_node SET node_state = 'READY', current_iteration = 0, current_best_score = 0, api_error_message = NULL, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339()).bind(&node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;
            let _ = app_handle.emit("nodes-updated", ());
        }
        _ => return Err("Invalid action".to_string()),
    }
    Ok(())
}

#[tauri::command]
pub async fn run_genesis_prd_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    run_pipeline(app_handle, pool, active_tasks, project_id, "Genesis_PRD".to_string(), api_key).await
}

#[tauri::command]
pub async fn manually_trigger_next_nodes(
    app_handle: tauri::AppHandle,
    project_id: String,
    completed_node_type: String,
) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();
    let node = sqlx::query("SELECT module_id FROM document_node WHERE project_id = ? AND target_node_type = ?")
        .bind(&project_id).bind(&completed_node_type)
        .fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

    if let Some(row) = node {
        let module_id: Option<String> = row.get("module_id");
        if let Some(mid) = module_id {
             return trigger_module_next_nodes(&app_handle, &mid, &completed_node_type).await;
        }
    }

    if completed_node_type == "Genesis_PRD" || completed_node_type == "GPRD_Architecture_Schema" {
        return actual_approve_genesis_prd(&app_handle, &*pool, &project_id).await;
    }

    trigger_next_nodes(app_handle, &project_id, &completed_node_type).await
}



#[tauri::command]
pub async fn run_module_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    module_id: String,
    node_type: String,
    api_key: String,
) -> Result<String, String> {
    // run_pipeline으로 통합 관리하기 위해 run_pipeline 호출로 위임
    // 단, node_id를 정확히 식별하기 위해 조회가 필요함
    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0")
        .bind(&module_id).bind(&node_type).fetch_optional(&*pool).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Node not found".to_string())?;

    run_pipeline(app_handle, pool, active_tasks, project_id, node.node_id, api_key).await
}

#[tauri::command]
pub async fn stop_node_pipeline(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_STOPPED', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339()).bind(&node_id).execute(&*pool).await.map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn resume_node_pipeline(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339()).bind(&node_id).execute(&*pool).await.map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

async fn is_node_stopped(pool: &SqlitePool, node_id: &str) -> bool {
    let state: Option<(String,)> = sqlx::query_as("SELECT node_state FROM document_node WHERE node_id = ?")
        .bind(node_id).fetch_optional(pool).await.unwrap_or(None);
    state.map_or(false, |(s,)| s == "PAUSED_STOPPED")
}


