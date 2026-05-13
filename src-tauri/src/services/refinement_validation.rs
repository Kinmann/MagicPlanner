use reqwest::Client;
use chrono::Utc;
use tauri::{Emitter, Manager};
use sqlx::{SqlitePool, Row};

pub use crate::models::{
    Project, DocumentNode, GenerationIteration,
    GlobalContext, PipelineStatusPayload,
};

use crate::services::embedding::{get_rag_context, check_node_intersection};
use crate::services::gemini::call_gemini;
use crate::services::embedding::store_document_embeddings;
use crate::utils::get_prompts_dir;

use crate::services::artifact_mapping::sync_artifact_mappings_in_tx;

pub async fn validate_refinement_node_logic(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    node_id: String,
    patch_json: String,
) -> Result<(), String> {
    println!(">>> Starting Validation for Refined Node: {}", node_id);
    let now = Utc::now().to_rfc3339();

    // 1. 프로젝트 및 노드 정보 로드
    let project = sqlx::query_as::<_, Project>("SELECT * FROM project WHERE project_id = ?")
        .bind(&project_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let intent = project.increment_intent.ok_or("No refinement intent found.")?;
    
    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE node_id = ?")
        .bind(&node_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // [Sprint 2] ID 기반 오염 추적(Taint Cascade) 결과 확인
    let is_explicitly_tainted = node.last_action.as_ref().map(|a| a.contains("Tainted Blocks")).unwrap_or(false);

    if is_explicitly_tainted {
        println!(">>> [Taint-Validation-Bypass] Node {} marked as STALE via Taint Cascade.", node_id);
    }

    // 최신 생성 이터레이션 로드 (방금 생성된 패치 적용본)
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 이전 pass된 원본 데이터 로드 (Original)
    let original_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 AND iteration_id != ? ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id)
    .bind(&latest_iter.iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "No original version found to compare.".to_string())?;

    // SAD Global 컨텍스트 조회
    let contexts = sqlx::query_as::<_, GlobalContext>(
        "SELECT * FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let sad_global = contexts.iter()
        .filter(|c| c.context_type.to_lowercase().starts_with("sad_"))
        .map(|c| format!("[{}] {}", c.context_type, c.context_data_json))
        .collect::<Vec<_>>()
        .join("\n");

    // 2. RAG 컨텍스트 정보
    // 2. RAG 컨텍스트 정보
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "RAG 분석 중...".into(),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
        is_silent: Some(true),
    });

    let rag_context = get_rag_context(&pool, &client, &api_key, &project_id, &intent, 5, vec![node_id.clone()]).await
        .unwrap_or_else(|e| {
            println!(">>> [RAG] refinement search failed: {}", e);
            "No additional context found via RAG.".to_string()
        });
 
    // RAG 분석 완료 후 패치 검증 단계로 상태 업데이트
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "패치 검증 중...".into(),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
        is_silent: Some(true),
    });

    let prompts_dir = get_prompts_dir(&app_handle);
    let mut prompt_content = std::fs::read_to_string(prompts_dir.join("evaluator/refinement_evaluator.txt"))
        .map_err(|e| format!("Failed to load refinement evaluator prompt: {}", e))?;

    prompt_content = prompt_content.replace("{{INTENT_JSON}}", &intent);
    prompt_content = prompt_content.replace("{{NODE_TYPE}}", &node.target_node_type);
    prompt_content = prompt_content.replace("{{SAD_GLOBAL}}", &sad_global);
    prompt_content = prompt_content.replace("{{RAG_CONTEXT}}", &rag_context);
    prompt_content = prompt_content.replace("{{ORIGINAL_JSON}}", &original_iter.generated_draft_json);
    prompt_content = prompt_content.replace("{{PATCHED_DRAFT}}", &latest_iter.generated_draft_json);

    let schema_json = schemars::schema_for!(crate::schemas::EvaluationResult);
    let flattened_schema = crate::schemas::flatten_schema(serde_json::to_value(schema_json).unwrap());

    // 3. AI 호출 (검증 수행)
    let response = call_gemini(&client, &api_key, "You are a senior refinement validator.", &prompt_content, Some(flattened_schema))
        .await
        .map_err(|e| format!("Validation AI call failed: {:?}", e))?;

    let eval: crate::schemas::EvaluationResult = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse evaluation result: {} | Content: {}", e, response))?;

    // 4. 평가 결과 저장
    let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();
    let critical_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();

    // 80점 이상이면서 critical_errors가 없는 경우에만 최종 통과로 인정
    let is_pass = eval.is_pass && eval.score >= 80;

    sqlx::query(
        "UPDATE generation_iteration SET calculated_score = ?, critical_errors_array = ?, actionable_feedback_text = ?, is_pass = ?, updated_at = ? WHERE iteration_id = ?"
    )
    .bind(eval.score)
    .bind(&critical_json)
    .bind(&feedback_json)
    .bind(is_pass as i32)
    .bind(&now)
    .bind(&latest_iter.iteration_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 5. 자동 Stale 유지 검증 로직 (RAG 유사도 < 0.2 or AI 평가 실패 시)
    let similarity = check_node_intersection(&pool, &client, &api_key, &project_id, &node_id, &intent).await.unwrap_or(0.0);
    
    let final_state = "REVIEW_PENDING";
    let mut auto_stale_msg = String::new();

    if similarity < 0.2 {
        auto_stale_msg = format!("[Caution] Low Semantic Similarity ({:.2} < 0.2).", similarity);
    } else if !is_pass {
        auto_stale_msg = "[Warning] AI Evaluation Score is below threshold.".to_string();
    }

    let mut final_last_action = format!("Refined & Validated (Score: {})", eval.score);
    if !auto_stale_msg.is_empty() {
        final_last_action = format!("{} | {}", auto_stale_msg, final_last_action);
    }

    sqlx::query("UPDATE document_node SET node_state = ?, current_best_score = ?, last_action = ?, updated_at = ? WHERE node_id = ?")
        .bind(final_state)
        .bind(eval.score)
        .bind(&final_last_action)
        .bind(&now)
        .bind(&node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: format!("{} Validation Complete (Score: {})", node.target_node_type, eval.score),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "SUCCESS".into(),
        status: "COMPLETED".into(),
        current_iteration: None,
        max_iterations: None,
        is_silent: None,
    });
    
    // 리파인먼트 결과 수신 후 클라이언트에게 결과 패키지 전송 (결과 모달 표시)
    let _ = app_handle.emit("refinement-validation-result", serde_json::json!({
        "nodeId": node_id,
        "score": eval.score,
        "isPass": is_pass,
        "errors": eval.critical_errors,
        "feedback": eval.feedback,
        "originalJson": original_iter.generated_draft_json,
        "refinedJson": latest_iter.generated_draft_json,
        "nodeType": node.target_node_type,
        "patchOps": patch_json
    }));

    Ok(())
}

pub async fn confirm_node_review_logic(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    println!(">>> Confirming Node Review: {}", node_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. 해당 노드의 최신 이터레이션 조회
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // 2. 기존의 모든 통과 상태 무효화 (최신본만 유효하게 관리)
    sqlx::query("UPDATE generation_iteration SET is_pass = 0 WHERE node_id = ?")
        .bind(&node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 3. 이 이터레이션을 통과 상태로 설정
    sqlx::query("UPDATE generation_iteration SET is_pass = 1 WHERE iteration_id = ?")
        .bind(&latest_iter.iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 4. 노드 상태를 REVIEWED로 변경
    sqlx::query("UPDATE document_node SET node_state = 'REVIEWED', updated_at = ? WHERE node_id = ?")
        .bind(&now)
        .bind(&node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 5. Artifact Mapping 동기화
    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&latest_iter.generated_draft_json) {
        sync_artifact_mappings_in_tx(&mut tx, &project_id, &node_id, &json_value).await?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // 6. RAG 임베딩 갱신 (비동기)
    let node_type: String = sqlx::query_scalar("SELECT target_node_type FROM document_node WHERE node_id = ?")
        .bind(&node_id).fetch_one(&*pool).await.unwrap_or_default();

    let pool_clone = pool.inner().clone();
    let app_handle_clone = app_handle.clone();
    let project_id_clone = project_id.clone();
    let node_id_bg = node_id.clone();
    let node_type_bg = node_type.clone();
    let iter_id_bg = latest_iter.iteration_id.clone();
    let draft_bg = latest_iter.generated_draft_json.clone();
    let score_bg = latest_iter.calculated_score.unwrap_or(0);

    tauri::async_runtime::spawn(async move {
        let client = app_handle_clone.state::<Client>();
        
        // API 키 조회 (세션에서)
        let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
            .fetch_optional(&pool_clone).await;
        
        let actual_api_key = match session_res {
            Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
            _ => None,
        };

        if let Some(key) = actual_api_key {
            if !key.trim().is_empty() {
                let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                    message: "RAG 임베딩 갱신 중...".into(),
                    node_id: node_id_bg.clone(),
                    node_type: node_type_bg.clone(),
                    project_id: project_id_clone.clone(),
                    level: "INFO".into(),
                    status: "EMBEDDING_START".into(),
                    current_iteration: None,
                    max_iterations: None,
                    is_silent: Some(true),
                });

                let _ = store_document_embeddings(crate::services::embedding::EmbeddingStoreArgs { pool: &pool_clone, client: &client, api_key: &key, project_id: &project_id_clone, module_id: None, node_id: &node_id_bg, node_type: &node_type_bg, iteration_id: &iter_id_bg, document_json: &draft_bg, score: score_bg }).await;

                let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                    message: "RAG 임베딩 갱신 완료".into(),
                    node_id: node_id_bg.clone(),
                    node_type: node_type_bg.clone(),
                    project_id: project_id_clone.clone(),
                    level: "SUCCESS".into(),
                    status: "EMBEDDING_COMPLETE".into(),
                    current_iteration: None,
                    max_iterations: None,
                    is_silent: Some(true),
                });
            }
        }
    });

    // UI 이벤트 발행
    let _ = app_handle.emit("nodes-updated", ());

    // DAG 엔진 트리거
    let module_id: Option<String> = sqlx::query_scalar("SELECT module_id FROM document_node WHERE node_id = ?")
        .bind(&node_id).fetch_one(&*pool).await.unwrap_or_default();

    if let Some(mid) = module_id {
        let _ = crate::services::dag_engine::trigger_module_next_nodes(&app_handle, &mid, &node_type).await;
    } else {
        let _ = crate::services::dag_engine::trigger_next_nodes(app_handle.clone(), &project_id, &node_type).await;
    }

    // [Safety] 리파인먼트 승인 후 전역 컨텍스트 동기화
    let _ = crate::services::dag_engine::refresh_global_context(&pool, &project_id).await;

    Ok(())
}

pub async fn finalize_refinement_update_logic(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<(), String> {
    println!(">>> Finalizing Refinement Update (Global Commit) for project: {}", project_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND node_state = 'REVIEWED'"
    )
    .bind(&project_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let mut modified_node_ids = Vec::new();
    for node in nodes {
        modified_node_ids.push(node.node_id.clone());
        let latest_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE generation_iteration SET is_pass = 0 WHERE node_id = ?")
            .bind(&node.node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE generation_iteration SET is_pass = 1 WHERE iteration_id = ?")
            .bind(&latest_iter.iteration_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?")
            .bind(&now)
            .bind(&node.node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&latest_iter.generated_draft_json) {
            sync_artifact_mappings_in_tx(&mut tx, &project_id, &node.node_id, &json_value).await?;
        }
    }

    // 2. 인텐트 및 세션 상태 초기화
    sqlx::query("UPDATE project SET increment_intent = NULL, updated_at = ? WHERE project_id = ?")
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    // 3. 모든 승인된 노드의 RAG 임베딩 일괄 갱신 (비동기)
    let reviewed_nodes_to_sync: Vec<(String, String, String, String, i32)> = sqlx::query_as(
        "SELECT gi.node_id, dn.target_node_type, gi.iteration_id, gi.generated_draft_json, IFNULL(gi.calculated_score, 0) \
         FROM generation_iteration gi \
         JOIN document_node dn ON gi.node_id = dn.node_id \
         WHERE dn.project_id = ? AND dn.node_state = 'COMPLETED' AND gi.is_pass = 1"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

    let pool_clone = pool.inner().clone();
    let app_handle_clone = app_handle.clone();
    let project_id_clone = project_id.clone();

    tauri::async_runtime::spawn(async move {
        let client = app_handle_clone.state::<Client>();
        
        let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
            .fetch_optional(&pool_clone).await;
        
        let actual_api_key = match session_res {
            Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
            _ => None,
        };

        if let Some(key) = actual_api_key {
            if !key.trim().is_empty() {
                for (nid, ntype, itid, draft, score) in reviewed_nodes_to_sync {
                    let _ = store_document_embeddings(crate::services::embedding::EmbeddingStoreArgs { pool: &pool_clone, client: &client, api_key: &key, project_id: &project_id_clone, module_id: None, node_id: &nid, node_type: &ntype, iteration_id: &itid, document_json: &draft, score }).await;
                }

                let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                    message: "전역 RAG 동기화 완료".into(),
                    node_id: "".into(),
                    node_type: "System".into(),
                    project_id: project_id_clone.clone(),
                    level: "SUCCESS".into(),
                    status: "EMBEDDING_COMPLETE".into(),
                    current_iteration: None,
                    max_iterations: None,
                    is_silent: None,
                });
            }
        }
    });

    // [Safety] 리파인먼트 전체 커밋 후 전역 컨텍스트 동기화
    let _ = crate::services::dag_engine::refresh_global_context(&pool, &project_id).await;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "Global Refinement Committed Successfully.".into(),
        node_id: "".into(),
        node_type: "System".into(),
        project_id: project_id.clone(),
        level: "SUCCESS".into(),
        status: "COMPLETED".into(),
        current_iteration: None,
        max_iterations: None,
        is_silent: None,
    });

    Ok(())
}

