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
    GlobalContext, LocalModule,
};

// 서비스 함수 임포트
use crate::services::embedding::{store_document_embeddings};
use crate::services::gemini::call_gemini;
use crate::services::prd_merger::{get_full_approved_prd};
use crate::services::draft_generator::{generate_draft, evaluate_draft};
use crate::services::dag_engine::{trigger_next_nodes, trigger_module_next_nodes};
use crate::utils::get_prompts_dir;
use crate::commands::approval::actual_approve_genesis_prd;

// EvaluationResult is now imported from crate::schemas

// EvaluationResult is now imported from crate::schemas


#[tauri::command]
pub async fn run_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    node_type: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> run_pipeline started for project: {}, node: {}", project_id, node_type);

    // 1. 노드 정보 조회
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = ?"
    )
    .bind(&project_id)
    .bind(&node_type)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

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
    let _ = app_handle.emit("nodes-updated", ());

    let client = Client::new();
    let max_iters = node.max_iterations;
    let threshold = node.threshold_score;
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
        println!(">>> Resuming from previous iteration context (Node: {})", node_type);
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
        println!(">>> Iteration {}/{} starting for {}", i, max_iters, node_type);
        let _ = app_handle.emit("pipeline-status", format!("{} 초안 생성 중 (반복 {}/{})", node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("초안 생성 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let draft_res = generate_draft(&app_handle, &pool, &client, &api_key, &project.project_id, &node_type, &project.raw_input_text, &previous_draft, &previous_feedback, i, vec![]).await;
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
        let _ = app_handle.emit("pipeline-status", format!("{} 초안 평가 중 (반복 {}/{})", node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("초안 평가 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let input_text_for_eval = if node_type == "Genesis_PRD" { Some(project.raw_input_text.clone()) } else { None };
        let empty_feedback = Vec::new(); // run_pipeline에서는 이전 피드백을 사용하여 생성을 유도하므로 별도 피드백은 비움
        let eval_res = evaluate_draft(&app_handle, &pool, &client, &api_key, &project.project_id, &node_type, &draft, input_text_for_eval, "", "", &empty_feedback, i, vec![]).await;
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
        
        // [影ｅ쐦占????믮죫] ??좑옙?占??╊겒占????덌옙 ?堤솘??쳺?影ｅ쐣占?逆븝옙 ??쏃쟽 ?獵? 囹뜹윜占?
        let is_passed = eval.score >= threshold && eval.critical_errors.is_empty();

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
        .bind(is_passed)
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
    } else if node_type.starts_with("GPRD_") || node_type == "Genesis_PRD" || current_best_score < threshold {
        NodeState::PausedHitl
    } else {
        NodeState::Completed
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
                let _ = app_handle.emit("pipeline-status", "RAG 임베딩 중...");
                sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                    .bind("RAG 임베딩 중...")
                    .bind(Utc::now().to_rfc3339())
                    .bind(&node.node_id)
                    .execute(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
                let _ = app_handle.emit("nodes-updated", ());

                let embedding_res = store_document_embeddings(
                    &*pool, &client, &api_key,
                    &project_id, None,
                    &node.node_id, &node_type,
                    &iter.iteration_id, &iter.generated_draft_json,
                    iter.calculated_score.unwrap_or(0),
                ).await;

                match embedding_res {
                    Ok(_) => {
                        let _ = app_handle.emit("pipeline-status", "RAG 임베딩 완료");
                    },
                    Err(e) => {
                        let err_msg = format!("RAG 임베딩 실패({}): {}", node_type, e);
                        println!(">>> [RAG] {}", err_msg);
                        
                        let error_info = RagErrorInfo {
                            project_id: project_id.clone(),
                            node_id: node.node_id.clone(),
                            node_type: node_type.clone(),
                            error_message: e.to_string(),
                        };
                        let _ = app_handle.emit("rag-error", error_info);
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

        trigger_next_nodes(app_handle, &project_id, &node_type).await?;
    }

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
            // UI 승인 액션 완료 후 즉시 DB 상태 반영 및 COMPLETED로 변경
            sqlx::query(
                "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
            )
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            let _ = app_handle.emit("nodes-updated", ());

            // RAG 임베딩 등 백그라운드 작업 시작
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
                        println!(">>> [RAG-BG] Failed to get API key (passed was empty, DB was empty/failed)");
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

                    // [RAG] GENESIS 카테고리는 제외하고 RAG 임베딩 수행 (자동 승인 시)
                    if node_category_for_bg != "GENESIS" {
                        let _ = app_handle_clone.emit("pipeline-status", "RAG 임베딩 중...");
                        let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                            .bind("RAG 임베딩 중...")
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
                                let _ = app_handle_clone.emit("pipeline-status", "RAG 임베딩 완료");
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
                            }
                        }

                        // RAG 작업 완료 후 상태 업데이트 (Live Activity 종료)
                        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                            .bind(Utc::now().to_rfc3339())
                            .bind(&node_id_clone)
                            .execute(&pool_clone)
                            .await;
                        let _ = app_handle_clone.emit("nodes-updated", ());
                    }

                    // 임베딩 성공 시 다음 노드 트리거 (GENESIS 등)
                    if embedding_success {
                        if let Some(mid) = &module_id_clone {
                            let _ = trigger_module_next_nodes(&app_handle_clone, mid, &node_type_clone).await;
                        } else {
                            let _ = trigger_next_nodes(app_handle_clone, &project_id_clone, &node_type_clone).await;
                        }
                    }
                }
            });
        }
        "RETRY" => {
            sqlx::query(
                "UPDATE document_node SET node_state = 'READY', current_iteration = 0, current_best_score = 0, api_error_message = NULL, updated_at = ? WHERE node_id = ?"
            )
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            let _ = app_handle.emit("nodes-updated", ());
        }
        _ => return Err("Invalid action".to_string()),
    }

    Ok(())
}






/// Genesis PRD 생성을 수행하는 파이프라인. run_pipeline을 호출하여 Best-of-N 방식으로 생성.
#[tauri::command]
pub async fn run_genesis_prd_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    // Genesis_PRD 노드 정보를 조회하여 run_pipeline 호출
    run_pipeline(app_handle, pool, active_tasks, project_id, "Genesis_PRD".to_string(), api_key).await
}


/// 특정 노드 완료 후 후속 노드를 수동으로 트리거 (READY 상태로 변경)
#[tauri::command]
pub async fn manually_trigger_next_nodes(
    app_handle: tauri::AppHandle,
    project_id: String,
    completed_node_type: String,
) -> Result<(), String> {
    println!(">>> Manually triggering next nodes for: {}", completed_node_type);
    
    // 현재 노드 정보 조회하여 모듈 아이디 등 확인 (모듈 하위 노드인 경우 대응)
    let pool = app_handle.state::<SqlitePool>();
    let node = sqlx::query("SELECT module_id FROM document_node WHERE project_id = ? AND target_node_type = ?")
        .bind(&project_id)
        .bind(&completed_node_type)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = node {
        let module_id: Option<String> = row.get("module_id");
        if let Some(mid) = module_id {
             return trigger_module_next_nodes(&app_handle, &mid, &completed_node_type).await;
        }
    }

    // 제네시스 단계거나 PRD 승인 시 GPRD 생성 등을 위한 로직 트리거
    if completed_node_type == "Genesis_PRD" || completed_node_type == "GPRD_Architecture_Schema" {
        return actual_approve_genesis_prd(&app_handle, &*pool, &project_id).await;
    }

    trigger_next_nodes(app_handle, &project_id, &completed_node_type).await
}


/// SAD 글로벌 컨텍스트 생성 파이프라인.
#[tauri::command]
pub async fn run_sad_global_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> SAD Global Pipeline started for project: {}", project_id);
    let client = reqwest::Client::new();

    // SAD_Global 노드 정보 조회 (실행 중인 작업 확인용)
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Global'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Global node not found".to_string())?;

    // 실행 중인 작업 확인
    {
        let mut tasks = active_tasks.0.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&sad_node.node_id) {
            println!(">>> [ABORT] Node is already running: {}", sad_node.node_id);
            return Err("이미 파이프라인이 실행 중입니다. (ActiveTask Detect)".to_string());
        }
        tasks.insert(sad_node.node_id.clone());
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
    let _guard = TaskGuard { tasks: active_tasks.0.clone(), node_id: sad_node.node_id.clone() };

    let _project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // v2: GPRD 3개 노드가 모두 승인되었는지 확인 (1-A, 1-B, 1-C 노드)
    let genesis_prd_content = get_full_approved_prd(&*pool, &project_id).await;
    
    if genesis_prd_content == "{}" {
        return Err("승인된 Genesis PRD가 없습니다. 전체 승인된 PRD가 있어야 파이프라인 구동이 가능합니다.".to_string());
    }

    // SAD_Global 노드 정보 재조회 (상태 값 등)
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Global'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Global node not found".to_string())?;
    
    if sad_node.node_state != "READY" && sad_node.node_state != "PAUSED_HITL" && sad_node.node_state != "PAUSED_API_ERROR" && sad_node.node_state != "PAUSED_STOPPED" && sad_node.node_state != "COMPLETED" && sad_node.node_state != "STALE" {
        return Err("현재 상태에서는 실행할 수 없는 노드입니다.".to_string());
    }

    // 노드를 IN_PROGRESS로 업데이트
    sqlx::query("UPDATE document_node SET node_state = 'IN_PROGRESS', last_action = 'SAD 분석 준비 중...', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&sad_node.node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());

    let max_iters = sad_node.max_iterations.max(1);
    let threshold = sad_node.threshold_score;

    let mut current_iter = sad_node.current_iteration;
    let mut is_global_success = false;
    let mut _all_context_json = serde_json::json!({});
    let mut last_error = String::new();
    let mut last_feedback = String::new();

    // [RETRY] 이전 반복의 피드백 및 결과물 로드 (이터레이션 재개)
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&sad_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut initial_stage_context = serde_json::json!({});
    if let Some(it) = latest_iter {
        println!(">>> Resuming SAD Global from previous iteration feedback");
        if let Some(fb) = it.actionable_feedback_text {
             if let Ok(fb_list) = serde_json::from_str::<Vec<String>>(&fb) {
                 last_feedback = fb_list.join("\n");
             }
        }
        if let Ok(prev_bundle) = serde_json::from_str::<serde_json::Value>(&it.generated_draft_json) {
            initial_stage_context = prev_bundle;
        }
    }

    let prompts_dir = get_prompts_dir(&app_handle);
    let common_prompt = std::fs::read_to_string(prompts_dir.join("generator/common.txt")).unwrap_or_else(|_| {
        println!("!!! Failed to load common.txt generator prompt");
        String::new()
    });

    if current_iter >= max_iters && !is_global_success {
        last_error = "최대 시도 횟수를 초과했습니다. (Max Iterations). 실패 원인을 해결하고 다시 시도해주세요.".to_string();
    }

    // Stage 1: 글로벌 아키텍처 컨텍스트 5개 항목 순차 생성 및 평가 루프
    while current_iter < max_iters && !is_global_success {
        current_iter += 1;
        let global_types = vec!["sad_non_tech", "sad_tech_stack", "sad_core_erd", "sad_auth_rbac", "sad_interface_error"];
        // 이전 반복의 결과물을 컨텍스트로 활용하여 일관성 유지, 만약 없다면 빈 객체로 시작
        let mut stage_context_json = initial_stage_context.clone();

        for ctx_type in global_types {
            let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 (Iter {}): {} 생성 중...", current_iter, ctx_type));

            sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind(format!("{} 생성 중...", ctx_type)).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;
            
            // 의존성 노드 데이터 로드
            let dependencies = match ctx_type {
                "sad_non_tech" => vec![],
                "sad_tech_stack" => vec!["sad_non_tech"],
                "sad_core_erd" => vec!["sad_tech_stack"],
                "sad_auth_rbac" => vec!["sad_non_tech", "sad_core_erd"],
                "sad_interface_error" => vec!["sad_tech_stack", "sad_auth_rbac"],
                _ => vec![],
            };

            let mut prev_decisions = serde_json::Map::new();
            for dep in dependencies {
                if let Some(val) = stage_context_json.get(dep) {
                    prev_decisions.insert(dep.to_string(), val.clone());
                }
            }
            let prev_context_str = serde_json::to_string_pretty(&prev_decisions).unwrap_or_else(|_| "{}".to_string());

            let prev_draft_str = if let Some(prev_val) = initial_stage_context.get(ctx_type) {
                serde_json::to_string_pretty(prev_val).unwrap_or_else(|_| "{}".to_string())
            } else {
                "{}".to_string()
            };

            let schema_obj = crate::schemas::get_schema_for_node(ctx_type);
            let resource_path = prompts_dir.join(format!("generator/{}.txt", ctx_type));
            let type_prompt = std::fs::read_to_string(&resource_path).unwrap_or_else(|_| {
                println!("!!! Missing prompt: {:?}", resource_path);
                String::new()
            });

            let sys_prompt = format!("$COMMON_RULES\n{}\n\n$DOMAIN_SPECIFIC_RULE\n{}", common_prompt, type_prompt);
            let user_prompt = format!(
                "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$PREVIOUS_ARCHITECTURAL_DECISIONS\n{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n위 정보를 바탕으로 {}에 대한 상세 내용을 작성해 주세요.",
                ctx_type, current_iter, genesis_prd_content, prev_context_str, prev_draft_str, last_feedback, ctx_type
            );

            let result = call_gemini(&client, &api_key, &sys_prompt, &user_prompt, schema_obj).await;
            let part_json = match result {
                Ok(content) => {
                    serde_json::from_str::<serde_json::Value>(&content)
                        .map_err(|e| format!("SAD Part ({}) 파싱 에러: {} - 응답내용: {}", ctx_type, e, content))?
                }
                Err(e) => {
                    let (code, msg) = match e {
                        crate::models::PipelineError::ApiError(c, m) => (c as i32, m),
                        crate::models::PipelineError::Internal(m) => (0, m),
                    };
                    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                    .bind(code).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                    .execute(&*pool).await.map_err(|e| e.to_string())?;
                    return Err(format!("SAD Part ({}) 생성 중 에러 발생: {}", ctx_type, msg));
                }
            };

            // 현재 결과를 다음 항목 생성의 의존성으로 추가
            if let Some(obj) = stage_context_json.as_object_mut() {
                obj.insert(ctx_type.to_string(), part_json);
            }

            // [STOP CHECK] 각 개별 항목 생성 중 중지 요청 확인
            if is_node_stopped(&*pool, &sad_node.node_id).await {
                println!(">>> SAD Global stopped manually during part generation ({})", ctx_type);
                return Ok("SAD global stopped manually".to_string());
            }
        }

        // 글로벌 컨텍스트 통합 평가 수행
        let eval_schema = crate::schemas::get_evaluation_schema();
        let prompts_dir = get_prompts_dir(&app_handle);
        
        let common_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/common.txt")).unwrap_or_else(|_| String::new());
        let eval_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/sad_global.txt")).unwrap_or_default();
        
        let eval_sys_prompt = format!("$COMMON_RUBRIC\n{}\n\n$DOMAIN_RUBRIC\n{}", common_rubric, eval_rubric);
        let eval_user_prompt = format!(
            "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$GENERATED_DOCUMENT\n{}\n\n$EVALUATOR_FEEDBACK\n{}",
            "SAD_Global", current_iter, genesis_prd_content, serde_json::to_string_pretty(&stage_context_json).unwrap_or_default(), last_feedback
        );

        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("분석 및 평가 중...").bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let eval_result = call_gemini(&client, &api_key, &eval_sys_prompt, &eval_user_prompt, Some(eval_schema)).await;
        match eval_result {
            Ok(eval_json) => {
                let eval: serde_json::Value = serde_json::from_str(&eval_json).unwrap_or_default();
                let score = eval["score"].as_i64().unwrap_or(0) as i32;
                
                // [影ｅ쐦占????믮죫] AI??is_pass 令덍Ł놅옙 獄→른占??섓옙 獄삥×占?帝같占??辱뷂옙占?囹몌옙占?
                let has_critical_errors = eval["critical_errors"].as_array().map_or(false, |arr| !arr.is_empty());
                let is_passed = score >= threshold && !has_critical_errors;
                
                if is_passed || (current_iter == max_iters) {
                    is_global_success = is_passed;
                    if !is_passed && current_iter == max_iters {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 평가 실패 (점수: {})", score));
                    } else {
                        _all_context_json = stage_context_json.clone();
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 완료 (점수: {})", score));
                    }
                }

                // [이터레이션 저장] 평가 결과 및 이터레이션 관련 정보들을 데이터베이스에 저장
                let iter_id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();

                let feedback_text = if let Ok(issues) = serde_json::from_value::<Vec<crate::schemas::EvaluationIssue>>(eval["feedback"].clone()) {
                    issues.iter().map(|i| format!("[실행 가능 피드백 - 위치: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n")
                } else {
                    eval["feedback"].as_array().map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
                };

                let critical_errors_text = if let Ok(issues) = serde_json::from_value::<Vec<crate::schemas::EvaluationIssue>>(eval["critical_errors"].clone()) {
                    issues.iter().map(|i| format!("[결함: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n")
                } else {
                    eval["critical_errors"].as_array().map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
                };

                let feedback_json = serde_json::to_string(&eval["feedback"]).unwrap_or_default();
                let critical_json = serde_json::to_string(&eval["critical_errors"]).unwrap_or_default();

                // 데이터베이스 트랜잭션 시작
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                // [주의] 통과 시 이전 통과 상태 무효화 (최신 통과 이터레이션만 유효하게 관리)
                if is_passed {
                    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
                        .bind(&now)
                        .bind(&sad_node.node_id)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }

                sqlx::query(
                    "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&iter_id)
                .bind(&sad_node.node_id)
                .bind(current_iter)
                .bind(stage_context_json.to_string())
                .bind(score)
                .bind(is_passed)
                .bind(&critical_json)
                .bind(&feedback_json)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                // 데이터베이스 저장 및 업데이트 (Draft 반영된 5개 항목 순차 저장)
                let global_types = vec!["sad_core_erd", "sad_auth_rbac", "sad_interface_error", "sad_tech_stack", "sad_non_tech"];
                for ctx_type in global_types {
                    if let Some(data) = stage_context_json.get(ctx_type) {
                        let ctx_id = Uuid::new_v4().to_string();
                        sqlx::query(
                            "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
                        )
                        .bind(&ctx_id).bind(&project_id).bind(&iter_id).bind(ctx_type).bind(data.to_string()).bind(current_iter).bind(&now).bind(&now)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }

                tx.commit().await.map_err(|e| e.to_string())?;
                let _ = app_handle.emit("nodes-updated", ());

                // [피드백 업데이트] 다음 이터레이션을 위한 피드백 업데이트 (결함 및 실행 가능 피드백 통합)
                last_feedback = feedback_text.clone();
                if !critical_errors_text.is_empty() {
                    last_feedback = format!("{}\n{}", critical_errors_text, last_feedback);
                }

                if !is_global_success {
                    last_error = eval["feedback"].as_str().unwrap_or("평가 결과 미달").to_string();
                    let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 미달 (점수: {}), 재시도 중...", score));
                }
            }
            Err(_) => {
                last_error = "평가 중 에러 발생".to_string();
            }
        }
    }

    // 반복문 종료 후 상태 확인 (PAUSED_STOPPED 상태 등 체크)
    if is_node_stopped(&pool, &sad_node.node_id).await {
        println!(">>> SAD Global Pipeline loop for node {} terminated due to manual stop signal.", sad_node.node_id);
        return Ok("SAD global context pipeline stopped".to_string());
    }

    if !is_global_success {
        // [실패] 최종적으로 실패한 경우 노드 상태 업데이트
        sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, updated_at = ? WHERE node_id = ?")
            .bind(current_iter)
            .bind(Utc::now().to_rfc3339())
            .bind(&sad_node.node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());
        return Err(format!("SAD 글로벌 컨텍스트 생성 실패: {}", last_error));
    }

    // SAD_Global 노드 완료 처리 및 SAD_Module 노드 대기 상태로 변경 (READY)
    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, current_best_score = 100, updated_at = ? WHERE node_id = ?")
        .bind(current_iter)
        .bind(Utc::now().to_rfc3339())
        .bind(&sad_node.node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module'")
        .bind(Utc::now().to_rfc3339())
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "SAD 글로벌 컨텍스트 생성이 완료되었습니다. 이제 모듈 분할 노드를 실행해 주세요.");

    Ok("SAD global context pipeline completed".to_string())
}


/// SAD 모듈 분할을 수행하는 파이프라인.
#[tauri::command]
pub async fn run_sad_module_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    api_key: String,
    target_module_count: Option<i32>,
) -> Result<String, String> {
    println!(">>> SAD Module Split Pipeline started for project: {}, target_count: {:?}", project_id, target_module_count);
    let client = reqwest::Client::new();

    // SAD_Module 노드 정보 조회 (실행 중인 작업 확인용)
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Module node not found".to_string())?;

    // 실행 중인 작업 확인
    {
        let mut tasks = active_tasks.0.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&sad_node.node_id) {
            println!(">>> [ABORT] Node is already running: {}", sad_node.node_id);
            return Err("이미 파이프라인이 실행 중입니다. (ActiveTask Detect)".to_string());
        }
        tasks.insert(sad_node.node_id.clone());
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
    let _guard = TaskGuard { tasks: active_tasks.0.clone(), node_id: sad_node.node_id.clone() };

    let _project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // v2: GPRD 3개 노드가 모두 승인되었는지 확인 (1-A, 1-B, 1-C 노드)
    let genesis_prd_content = get_full_approved_prd(&*pool, &project_id).await;
    
    if genesis_prd_content == "{}" {
        return Err("승인된 Genesis PRD가 없습니다. 전체 승인된 PRD가 있어야 파이프라인 구동이 가능합니다.".to_string());
    }

    // 이전 단계의 글로벌 컨텍스트(SAD 글로벌) 로드
    let contexts = sqlx::query(
        "SELECT context_type, context_data_json FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut all_context_json = serde_json::json!({});
    for row in contexts {
        let ctx_type: String = row.get("context_type");
        let ctx_data: String = row.get("context_data_json");
        all_context_json[&ctx_type] = serde_json::from_str(&ctx_data).unwrap_or(serde_json::json!(ctx_data));
    }
    let global_context_str = serde_json::to_string_pretty(&all_context_json).unwrap_or_default();

    // SAD_Module 노드 정보 재조회
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Module node not found".to_string())?;

    if sad_node.node_state != "READY" && sad_node.node_state != "PAUSED_HITL" && sad_node.node_state != "PAUSED_API_ERROR" && sad_node.node_state != "PAUSED_STOPPED" && sad_node.node_state != "COMPLETED" && sad_node.node_state != "STALE" {
        return Err("현재 상태에서는 실행할 수 없는 노드입니다.".to_string());
    }

    sqlx::query("UPDATE document_node SET node_state = 'IN_PROGRESS', last_action = '준비 중...', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&sad_node.node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());

    let max_iters = sad_node.max_iterations.max(1);
    let threshold = sad_node.threshold_score;

    let mut current_iter = sad_node.current_iteration;
    let mut is_module_success = false;
    let mut last_feedback = String::new();

    // [RETRY] 이전 반복의 피드백 및 결과물 로드 (이터레이션 재개)
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&sad_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut initial_stage_context = serde_json::json!({});
    if let Some(it) = latest_iter {
        println!(">>> Resuming SAD Module Split from previous iteration feedback");
        if let Some(fb) = it.actionable_feedback_text {
             if let Ok(issues) = serde_json::from_str::<Vec<crate::schemas::EvaluationIssue>>(&fb) {
                 last_feedback = issues.iter().map(|i| format!("[縕먩퉲占??占쏙옙 - ?占쏙옙: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n");
             } else if let Ok(fb_list) = serde_json::from_str::<Vec<String>>(&fb) {
                 last_feedback = fb_list.join("\n");
             }
        }
        if let Ok(prev_bundle) = serde_json::from_str::<serde_json::Value>(&it.generated_draft_json) {
            initial_stage_context = prev_bundle;
        }
    }
    let mut last_error = String::new();

    let prompts_dir = get_prompts_dir(&app_handle);
    let common_prompt = std::fs::read_to_string(prompts_dir.join("generator/common.txt")).unwrap_or_else(|_| {
        println!("!!! Failed to load common.txt generator prompt");
        String::new()
    });

    if current_iter >= max_iters && !is_module_success {
        last_error = "최대 시도 횟수를 초과했습니다. (Max Iterations). 실패 원인을 해결하고 다시 시도해주세요.".to_string();
    }

    while current_iter < max_iters && !is_module_success {
        current_iter += 1;
        let module_types = vec!["sad_module_list", "sad_epic_mapping", "sad_module_deps"];
        // 이전 반복의 피드백 로드
        let mut stage_module_json = initial_stage_context.clone();

        for ctx_type in module_types {
            let action_msg = match ctx_type {
                "sad_module_list" => "모듈 목록 생성 중...",
                "sad_epic_mapping" => "에픽 매핑 중...",
                "sad_module_deps" => "의존성 분석 중...",
                _ => "생성 중...",
            };
            let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 (Iter {}): {}", current_iter, action_msg));
            
            sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind(action_msg).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;

            let schema_obj = crate::schemas::get_schema_for_node(ctx_type);
            let resource_path = prompts_dir.join(format!("generator/{}.txt", ctx_type));
            let type_prompt = std::fs::read_to_string(&resource_path).unwrap_or_else(|_| {
                println!("!!! Missing prompt: {:?}", resource_path);
                String::new()
            });

            // 의존성 노드 확인: 각 단계별 순차적인 생성을 위함
            let dependencies = match ctx_type {
                "sad_module_list" => vec![],
                "sad_epic_mapping" => vec!["sad_module_list"],
                "sad_module_deps" => vec!["sad_module_list", "sad_epic_mapping"],
                _ => vec![],
            };

            let mut prev_decisions = serde_json::Map::new();
            for dep in dependencies {
                if let Some(val) = stage_module_json.get(dep) {
                    prev_decisions.insert(dep.to_string(), val.clone());
                }
            }
            let prev_context_str = serde_json::to_string_pretty(&prev_decisions).unwrap_or_else(|_| "{}".to_string());

            let prev_draft_str = if let Some(prev_val) = initial_stage_context.get(ctx_type) {
                serde_json::to_string_pretty(prev_val).unwrap_or_else(|_| "{}".to_string())
            } else {
                "{}".to_string()
            };

            let sys_prompt = format!("$COMMON_RULES\n{}\n\n$DOMAIN_SPECIFIC_RULE\n{}", common_prompt, type_prompt);
            let mut user_prompt = format!(
                "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$GLOBAL_CONTEXT\n{}\n\n$PREVIOUS_ARCHITECTURAL_DECISIONS\n{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n위 정보를 바탕으로 {}에 대한 상세 내용을 작성해 주세요.",
                ctx_type, current_iter, genesis_prd_content, global_context_str, prev_context_str, prev_draft_str, last_feedback, ctx_type
            );

            // 모듈 목표 개수가 설정된 경우 프롬프트에 추가
            if let Some(count) = target_module_count {
                user_prompt = format!(
                    "{}\n\n[모듈 개수 제한 지침: 이번 생성 단계에서는 총 모듈의 개수가 {}개 내외가 되도록 설계해 주세요. 각 모듈은 충분히 독립적이어야 하며 비즈니스 로직을 명확히 분담해야 합니다.]",
                    user_prompt, count
                );
            }

            let result = call_gemini(&client, &api_key, &sys_prompt, &user_prompt, schema_obj).await;
            let part_json = match result {
                Ok(content) => {
                    serde_json::from_str::<serde_json::Value>(&content)
                        .map_err(|e| format!("SAD Part ({}) 파싱 에러: {} - 응답내용: {}", ctx_type, e, content))?
                }
                Err(e) => {
                    let (code, msg) = match e {
                        crate::models::PipelineError::ApiError(c, m) => (c as i32, m),
                        crate::models::PipelineError::Internal(m) => (0, m),
                    };
                    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                    .bind(code).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                    .execute(&*pool).await.map_err(|e| e.to_string())?;
                    return Err(format!("SAD Part ({}) 생성 중 에러 발생: {}", ctx_type, msg));
                }
            };

            // 결과물을 다음 단계 생성의 의존성으로 활용
            if let Some(obj) = stage_module_json.as_object_mut() {
                obj.insert(ctx_type.to_string(), part_json);
            }

            // [STOP CHECK] 개별 항목 생성 중 중지 요청 확인
            if is_node_stopped(&*pool, &sad_node.node_id).await {
                println!(">>> SAD Module Split stopped manually during part generation ({})", ctx_type);
                return Ok("SAD module split stopped manually".to_string());
            }
        }

        let eval_schema = crate::schemas::get_evaluation_schema();
        let prompts_dir = get_prompts_dir(&app_handle);
        
        let common_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/common.txt")).unwrap_or_else(|_| String::new());
        let eval_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/sad_module.txt")).unwrap_or_default();
        
        let eval_sys_prompt = format!("$COMMON_RUBRIC\n{}\n\n$DOMAIN_RUBRIC\n{}", common_rubric, eval_rubric);
        let eval_user_prompt = format!(
            "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$GLOBAL_CONTEXT\n{}\n\n$GENERATED_DOCUMENT\n{}\n\n$EVALUATOR_FEEDBACK\n{}",
            "SAD_Module", current_iter, genesis_prd_content, global_context_str, serde_json::to_string_pretty(&stage_module_json).unwrap_or_default(), last_feedback
        );

        let eval_result = call_gemini(&client, &api_key, &eval_sys_prompt, &eval_user_prompt, Some(eval_schema)).await;
        match eval_result {
            Ok(eval_json) => {
                let eval: serde_json::Value = serde_json::from_str(&eval_json).unwrap_or_default();
                let score = eval["score"].as_i64().unwrap_or(0) as i32;
                
                // [影ｅ쐦占????믮죫] AI??is_pass 令덍Ł놅옙 獄→른占??섓옙 獄삥×占?帝같占??辱뷂옙占?囹몌옙占?
                let has_critical_errors = eval["critical_errors"].as_array().map_or(false, |arr| !arr.is_empty());
                let is_passed = score >= threshold && !has_critical_errors;
                
                if is_passed || (current_iter == max_iters) {
                    is_module_success = is_passed;
                    if !is_passed && current_iter == max_iters {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 평가 실패 (점수: {})", score));
                    } else {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 완료 (점수: {})", score));
                    }
                }

                // [이터레이션 저장] Stage 2 반복 데이터 데이터베이스 저장
                let iter_id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();

                let feedback_text = if let Ok(issues) = serde_json::from_value::<Vec<crate::schemas::EvaluationIssue>>(eval["feedback"].clone()) {
                    issues.iter().map(|i| format!("[실행 가능 피드백 - 위치: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n")
                } else {
                    eval["feedback"].as_array().map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
                };

                let critical_errors_text = if let Ok(issues) = serde_json::from_value::<Vec<crate::schemas::EvaluationIssue>>(eval["critical_errors"].clone()) {
                    issues.iter().map(|i| format!("[결함: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n")
                } else {
                    eval["critical_errors"].as_array().map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
                };
                
                // Stage 2 결과물은 Stage 1 결과를 기반으로 생성됨 (통합 SAD 데이터 구성)
                let mut combined_bundle = all_context_json.clone();
                if let Some(obj) = combined_bundle.as_object_mut() {
                    for (k, v) in stage_module_json.as_object().unwrap() {
                        obj.insert(k.clone(), v.clone());
                    }
                }

                let feedback_json = serde_json::to_string(&eval["feedback"]).unwrap_or_default();
                let critical_json = serde_json::to_string(&eval["critical_errors"]).unwrap_or_default();

                // 데이터베이스 트랜잭션 시작
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                // [주의] 통과 시 이전 통과 상태 무효화 (최신 통과 이터레이션만 유효하게 관리)
                if is_passed {
                    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
                        .bind(&now)
                        .bind(&sad_node.node_id)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }

                sqlx::query(
                    "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&iter_id)
                .bind(&sad_node.node_id)
                .bind(current_iter)
                .bind(combined_bundle.to_string())
                .bind(score)
                .bind(is_passed)
                .bind(&critical_json)
                .bind(&feedback_json)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                // 데이터베이스 저장 및 업데이트 (Draft 반영된 3개 항목 순차 저장)
                let module_types = vec!["sad_module_list", "sad_epic_mapping", "sad_module_deps"];
                for ctx_type in module_types {
                    if let Some(data) = stage_module_json.get(ctx_type) {
                        let ctx_id = Uuid::new_v4().to_string();
                        sqlx::query(
                            "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
                        )
                        .bind(&ctx_id).bind(&project_id).bind(&iter_id).bind(ctx_type).bind(data.to_string()).bind(current_iter).bind(&now).bind(&now)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }

                tx.commit().await.map_err(|e| e.to_string())?;
                let _ = app_handle.emit("nodes-updated", ());

                // [피드백 업데이트] 다음 이터레이션을 위한 피드백 업데이트
                last_feedback = feedback_text.clone(); if !critical_errors_text.is_empty() { last_feedback = format!("{}\n{}", critical_errors_text, last_feedback); }

                if !is_module_success {
                    last_error = eval["feedback"].as_str().unwrap_or("평가 결과 미달").to_string();
                    let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 평가 미달 (점수: {}), 재시도 중...", score));
                }
            }
            Err(_) => {
                last_error = "평가 중 에러 발생".to_string();
            }
        }
    }

    // 반복문 종료 후 상태 확인 (PAUSED_STOPPED 상태 등 체크)
    if is_node_stopped(&pool, &sad_node.node_id).await {
        println!(">>> SAD Module Pipeline loop for node {} terminated due to manual stop signal.", sad_node.node_id);
        return Ok("SAD module context pipeline stopped".to_string());
    }

    if !is_module_success {
        // [???옙] ?轝좒쨺??帝같占???歷ｏ옙?占쏜쬃????낂쇃 獄삡겘占?
        sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, updated_at = ? WHERE node_id = ?")
            .bind(current_iter)
            .bind(Utc::now().to_rfc3339())
            .bind(&sad_node.node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());
        return Err(format!("SAD 獄덂댖占?蘊깍옙占???뽳옙 蘊깍옙?: {}", last_error));
    }

    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, current_best_score = 100, updated_at = ? WHERE node_id = ?")
    .bind(current_iter)
    .bind(Utc::now().to_rfc3339())
    .bind(&sad_node.node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "SAD 獄덂댖占?蘊깍옙占???뽳옙 ?占쏙옙. 獄덂댖占???뽳옙???野?쪟??辱ζ쉼占??");

    Ok("SAD module split pipeline completed".to_string())
}


/// 獄덂댖占????蘊덌옙 ?葯모쬃?占쏜쫱???轝좑옙 (影ｏ옙獄℡텈占??℡댃占?轝졽궩 辱ζ쉼占??燁믮쪡?
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
    // 影ｏ옙獄℡텈占??℡댃占?轝졽궩 ???옙
    let contexts = sqlx::query_as::<_, GlobalContext>(
        "SELECT context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 獄덂댖占???낂쇃 邀썲쟿占?(容븟??)
    let module = sqlx::query_as::<_, LocalModule>(
        "SELECT module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, dependency_spec, priority_order, module_state, display_order, created_at, updated_at FROM local_module WHERE module_id = ?"
    )
    .bind(&module_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Module not found for ID: {}", module_id))?;

    let normalized_node_type = node_type.to_lowercase().replace(" ", "_");
    let mut global_ctx = serde_json::json!({});

    for ctx in &contexts {
        let is_required = match normalized_node_type.as_str() {
            "prd" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_core_erd" | "sad_module_list" | "sad_epic_mapping" | "sad_module_deps"),
            "fsd" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_core_erd" | "sad_interface_error" | "sad_non_tech" | "sad_module_list" | "sad_module_deps"),
            "erd" => matches!(ctx.context_type.as_str(), "sad_tech_stack" | "sad_core_erd" | "sad_module_deps"),
            "api_spec" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_interface_error" | "sad_module_deps"),
            "user_flow" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_interface_error"),
            "ia" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_interface_error"),
            "wireframe" => matches!(ctx.context_type.as_str(), "sad_core_erd" | "sad_interface_error" | "sad_tech_stack"),
            "tc" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_interface_error" | "sad_non_tech" | "sad_module_deps"),
            _ => false,
        };

        if is_required {
            let mut val: serde_json::Value = serde_json::from_str(&ctx.context_data_json).unwrap_or(serde_json::json!({}));
            
            // [?野?옙 ?占쏙옙獄? Stage 2 獄↑퀎占??좑옙 ?歷좈컾 獄덂댖占?囹듸옙????낂쇃獄?容뷰눢占?
            match ctx.context_type.as_str() {
                "sad_module_list" => {
                    if let Some(modules) = val.get_mut("modules").and_then(|m| m.as_array_mut()) {
                        modules.retain(|m| m.get("module_id").and_then(|n| n.as_str()) == Some(&module_id));
                    }
                },

                "sad_epic_mapping" => {
                    if let Some(mappings) = val.get_mut("mappings").and_then(|m| m.as_array_mut()) {
                        mappings.retain(|m| {
                            m.get("mapped_modules").and_then(|mm| mm.as_array())
                             .map_or(false, |mm| mm.iter().any(|id| id.as_str() == Some(&module_id)))
                        });
                    }
                },

                "sad_module_deps" => {
                    if let Some(deps) = val.get_mut("dependencies").and_then(|d| d.as_array_mut()) {
                        deps.retain(|d| {
                            d.get("from_module").and_then(|n| n.as_str()) == Some(&module_id) ||
                            d.get("to_module").and_then(|n| n.as_str()) == Some(&module_id)
                        });
                    }
                },

                _ => {} // ??덃뼢 ?占?占? ?占썹쑝 辱ζ쉼占?
            }

            global_ctx[&ctx.context_type] = val;
        }
    }
    let global_context_str = serde_json::to_string_pretty(&global_ctx).unwrap_or_default();

    // ?歷좈컾 獄덂댖占???蘊덌옙 邀썲쟿占?
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0"
    )
    .bind(&module_id)
    .bind(&node_type)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found in module".to_string())?;

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
        return Err("?占쏙옙 ?占쏙옙??좑옙???轝좑옙?????占쏜졐?占쏜졊? (READY, PAUSED_HITL, PAUSED_API_ERROR, PAUSED_STOPPED ??믭옙 COMPLETED ?占쏙옙)".to_string());
    }



    // IN_PROGRESS ?占쏙옙
    sqlx::query("UPDATE document_node SET node_state = 'IN_PROGRESS', last_action = '모듈 분석 준비 중...', api_error_message = NULL, updated_at = ? WHERE node_id = ?")
    .bind(Utc::now().to_rfc3339()).bind(&node.node_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());

    let client = Client::new();
    let max_iters = node.max_iterations;
    let threshold = node.threshold_score;
    let mut current_best_content = String::new();
    let mut current_best_score = 0;
    let mut final_iteration_count = 0;
    let mut loop_error = None;

    // [RETRY] ?歷ο옙 ?葯면━ ??낂쇃 令덌옙?蘊꾭젅붺??
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut previous_draft = String::new();
    let mut previous_feedback: Vec<String> = Vec::new();

    if let Some(it) = latest_iter {
        println!(">>> Resuming Module Node context: {}", node_type);
        previous_draft = it.generated_draft_json;
        if let Some(errs) = it.critical_errors_array {
            if let Ok(elist) = serde_json::from_str::<Vec<String>>(&errs) {
                previous_feedback.extend(elist);
            }
        }
        if let Some(fbs) = it.actionable_feedback_text {
            if let Ok(flist) = serde_json::from_str::<Vec<String>>(&fbs) {
                for f in flist {
                    previous_feedback.push(format!("실행 가능 피드백: {}", f));
                }
            }
        }
    }

    // 獄덂댖占??℡댃占?轝졽궩 囹긺쭛占?
    let module_context = format!(
        "### [CURRENT MODULE: {}] ###\n\n[??덌옙]\n{}\n\n[??숎줎?墉뉛옙占?\n{}\n\n[獄ㅶ쵟占??Epic]\n{}\n\n[???뿈??獄???잟쬃????믭옙]\n{}",
        module.module_name,
        module.module_description.as_deref().unwrap_or(""),
        module.core_responsibility.as_deref().unwrap_or(""),
        module.mapped_epics.as_deref().unwrap_or(""),
        module.dependency_spec.as_deref().unwrap_or("?占쏙옙")
    );

    // [V2.5] ???뿈??影ｅ쐣占?蘊깍옙獄??蘊덌옙 ??잞옙獄?獄덌옙占??辱ζ쉼占?獄??곤옙
    let prerequisites = match node_type.as_str() {
        "FSD" => vec!["PRD"],
        "User Flow" => vec!["FSD"],
        "ERD" => vec!["FSD"],
        "IA" => vec!["FSD", "User Flow"],
        "Wireframe" => vec!["FSD", "User Flow", "IA"],
        "API_Spec" => vec!["FSD", "ERD"],
        "TC" => vec!["PRD", "FSD", "API_Spec"],
        _ => vec![],
    };

    let mut parent_docs_context = String::new();
    let mut exclude_node_ids = Vec::new();

    for pre_type in prerequisites {
        // node_id獄??占쏙옙???獄?query_as ?占??令덂텈占??占쏙옙 邀썲쟿占?
        let pre_node_id: Option<String> = sqlx::query_scalar(
            "SELECT node_id FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0"
        )
        .bind(&module_id).bind(pre_type)
        .fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

        if let Some(target_id) = pre_node_id {
            exclude_node_ids.push(target_id.clone());
            
            // generated_draft_json獄??占쏙옙???獄?query_scalar ?燁묌뭘
            let iter_content: Option<String> = sqlx::query_scalar(
                "SELECT generated_draft_json FROM generation_iteration WHERE node_id = ? AND is_pass = 1 AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
            )
            .bind(&target_id)
            .fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

            if let Some(content) = iter_content {
                parent_docs_context.push_str(&format!("\n[SOURCE_DOCUMENT: {}]\n{}\n", pre_type, content));
            }
        }
    }

    // ??뽳옙/????????쪛 ?℡댃占?轝졽궩 囹긺쭛占?(影ｏ옙獄℡텈占?影욒?곤옙 + 獄덂댖占?獄덌옙占?+ 蘊깍옙獄?獄↑퀎占?
    let combined_context = format!(
        "{}\n\n{}\n\n$PARENT_DOCUMENTS_CONTEXT\n{}",
        global_context_str, module_context, parent_docs_context
    );

    let start_iter = node.current_iteration + 1;
    let mut any_passed = false;
    for i in start_iter..=max_iters {
        final_iteration_count = i;
        let _ = app_handle.emit("pipeline-status", format!("[{}] {} 초안 생성 중 (반복 {}/{})", module.module_name, node_type, i, max_iters));

        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("초안 생성 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 3. Draft 생성 (RAG 검색 제외)
        let draft_res = generate_draft_with_context(&app_handle, &pool, &client, &api_key, &project_id, &node.node_id, &node_type, &parent_docs_context, &previous_draft, &previous_feedback, &combined_context, i, exclude_node_ids.clone()).await;
        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => { loop_error = Some(e); break; }
        };

        // [STOP CHECK] AI ?蘊꾬옙 ??辱쀧궍靜? 墉?르占?
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Module Pipeline stopped manually after generation (Node: {})", node.node_id);
            break;
        }

        let _ = app_handle.emit("pipeline-status", format!("[{}] {} 평가 중 (반복 {}/{})", module.module_name, node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("초안 평가 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 4. Draft ??? (???쪛 ?℡댃占?轝졽궩 獄??歷ο옙 ?逆븝옙獄?辱ζ쉼占?
        let eval_res = evaluate_draft(&app_handle, &pool, &client, &api_key, &project_id, &node_type, &draft, None, &combined_context, &module_context, &previous_feedback, i, exclude_node_ids.clone()).await;
        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => { loop_error = Some(e); break; }
        };

        // [STOP CHECK] ??? ??獄??占??辱뷂옙占?辱쀧궍靜? 墉?르占?
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Module Pipeline stopped manually before save (Node: {})", node.node_id);
            break;
        }

        let iter_id = Uuid::new_v4().to_string();
        let errors_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();
        let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();

        // [影ｅ쐦占????믮죫] AI??is_pass ?占??獄삥×占??囹멱썦占???燁묌뭘
        let is_passed = eval.score >= threshold && eval.critical_errors.is_empty();

        sqlx::query(
            "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
        )
        .bind(iter_id).bind(&node.node_id).bind(i).bind(&draft).bind(eval.score).bind(is_passed)
        .bind(errors_json).bind(feedback_json).bind(Utc::now().to_rfc3339()).bind(Utc::now().to_rfc3339())
        .execute(&*pool).await.map_err(|e| e.to_string())?;

        sqlx::query("UPDATE document_node SET current_iteration = ?, updated_at = ? WHERE node_id = ?")
        .bind(i).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
        .execute(&*pool).await.map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());

        if eval.score >= current_best_score {
            current_best_score = eval.score;
            current_best_content = draft.clone();
        }

        previous_draft = draft;
        previous_feedback = eval.critical_errors.iter().map(|i| format!("[?占쏙옙: {}] {} : {}", i.location, i.code, i.description)).collect();
        for i in eval.feedback { previous_feedback.push(format!("[縕먩퉲占??占쏙옙 - ?占쏙옙: {}] {} : {}", i.location, i.code, i.description)); }

        if is_passed {
            any_passed = true;
            break; 
        }
    }

    // 容뽴?곤옙 ?占쏙옙 囹뜹윜占?
    if let Some(e) = loop_error {
        match e {
            PipelineError::ApiError(code, msg) => {
                sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                .bind(code as i32).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;
                return Err(format!("API Error ({}): {}", code, msg));
            }
            PipelineError::Internal(msg) => {
                sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = 500, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                .bind(&msg).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;
                return Err(msg);
            }
        }
    }

    // 반복문 종료 후 상태 확인 (PAUSED_STOPPED 상태 등 체크)
    if is_node_stopped(&pool, &node.node_id).await {
        println!(">>> Pipeline loop for node {} terminated due to manual stop signal.", node.node_id);
        return Ok(current_best_content);
    }

    let final_state = if !any_passed { NodeState::PausedHitl } else { NodeState::Completed };

    sqlx::query("UPDATE document_node SET node_state = ?, current_iteration = ?, current_best_score = ?, updated_at = ? WHERE node_id = ?")
    .bind(final_state.to_string()).bind(final_iteration_count).bind(current_best_score).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    if final_state == NodeState::Completed {
        // [RAG] ?占쏙옙????잞옙獄→쉼占?縕믠댃占?DB???占쏙옙???占??
        let best_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
        if let Some(iter) = best_iter {
            let _ = app_handle.emit("pipeline-status", format!("[{}] RAG 임베딩 중...", module.module_name));
            sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind("RAG 임베딩 중...")
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            let _ = app_handle.emit("nodes-updated", ());

            let embedding_res = store_document_embeddings(
                &*pool, &client, &api_key,
                &module.project_id, Some(&module_id),
                &node.node_id, &node_type,
                &iter.iteration_id, &iter.generated_draft_json,
                iter.calculated_score.unwrap_or(0),
            ).await;

            match embedding_res {
                Ok(_) => {
                    let _ = app_handle.emit("pipeline-status", format!("[{}] 임베딩 완료", module.module_name));
                },
                Err(e) => {
                    println!(">>> [RAG] Embedding storage failed: {}", e);
                    // RAG 임베딩 저장 실패 시 로그만 출력하고 프로세스 유지
                }
            }

            let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await;
            let _ = app_handle.emit("nodes-updated", ());
        }

        trigger_module_next_nodes(&app_handle, &module_id, &node_type).await?;
    }

    Ok(current_best_content)
}

/// 影ｏ옙獄℡텈占??℡댃占?轝졽궩獄??燁믮쪡??generate_draft
async fn generate_draft_with_context(
    app_handle: &tauri::AppHandle,
    _pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    _project_id: &str,
    _node_id: &str,
    node_type: &str,
    input_text: &str,
    previous_draft: &str,
    previous_feedback: &Vec<String>,
    global_context: &str,
    iteration: i32,
    _exclude_node_ids: Vec<String>,
) -> Result<String, PipelineError> {
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let prompts_dir = get_prompts_dir(&app_handle);
    
    let common_prompt = std::fs::read_to_string(prompts_dir.join("generator/common.txt")).unwrap_or_default();
    let domain_prompt = std::fs::read_to_string(prompts_dir.join(format!("generator/{}.txt", node_normalized))).unwrap_or_default();
    
    let schema_obj = crate::schemas::get_schema_for_node(&node_normalized);
    let combined_sys_prompt = format!("$COMMON_RULES\n{}\n\n$DOMAIN_SPECIFIC_RULE\n{}", common_prompt, domain_prompt);
    
    let mut user_prompt = format!(
        "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n위의 입력 내용과 참고 문서를 바탕으로 다음 문서를 생성해 주세요.",
        node_type, iteration, input_text
    );

    if !global_context.is_empty() {
        let prefix = if user_prompt.is_empty() { "" } else { "\n\n" };
        user_prompt = format!(
            "{}{}$GLOBAL_CONTEXT\n{}",
            user_prompt, prefix, global_context
        );
    }

    if !previous_draft.is_empty() {
        let feedback_text = if previous_feedback.is_empty() {
            "없음".to_string()
        } else {
            previous_feedback.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
        };
        user_prompt = format!(
            "{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n이전 초안과 평가 피드백을 반영하여 내용을 보완하고 점수를 높일 수 있도록 수정된 문서를 생성해 주세요.",
            user_prompt, previous_draft, feedback_text
        );
    }

    call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await
}




/// ?葯모쬃?占쏜쫱????わ옙 辱쀧궍靜?
#[tauri::command]
pub async fn stop_node_pipeline(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_STOPPED', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "?燁묌뭘??좑옙 ?掠욁윸 ?葯모쬃?占쏜쫱?蘊꾭쬃?辱쀧궍靜????옙??잞옙??");
    println!(">>> Pipeline manually stopped for node: {}", node_id);
    Ok(())
}


/// 辱쀧궍靜????葯모쬃?占쏜쫱???獵뱄옙 (READY ?占쏙옙獄?縕먫솠嶺?
#[tauri::command]
pub async fn resume_node_pipeline(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    println!(">>> Pipeline resumed (set to READY) for node: {}", node_id);
    Ok(())
}

/// ?蘊덌옙令덌옙 辱쀧궍靜? ?占쏙옙?蘊? ?屍귩쪟??わ옙 ?歷? ?燁믡?
async fn is_node_stopped(pool: &SqlitePool, node_id: &str) -> bool {
    let state: Option<(String,)> = sqlx::query_as("SELECT node_state FROM document_node WHERE node_id = ?")
        .bind(node_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    
    if let Some((s,)) = state {
        return s == "PAUSED_STOPPED";
    }
    false
}



