use tauri::Emitter;
use sqlx::SqlitePool;
use chrono::Utc;
use std::sync::Arc;
use std::collections::HashSet;
use reqwest::Client;

pub mod context;
pub mod execution;
pub mod hitl;

use crate::ActiveTasks;
use crate::models::{NodeState, Project, DocumentNode, PipelineStatusPayload, GenerationIteration};
use crate::services::dag_engine::{verify_and_refresh_context, trigger_next_nodes};
use crate::services::embedding::store_document_embeddings;
use crate::services::pipeline::context::{gather_global_context, get_filtered_local_module_context};
use crate::services::pipeline::execution::{run_execution_loop, is_node_stopped};
pub use hitl::handle_hitl_action_logic;

pub async fn run_pipeline_logic(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    active_tasks: &ActiveTasks,
    project_id: &str,
    node_type_or_id: &str,
    api_key: &str,
) -> Result<String, String> {
    println!(">>> run_pipeline started for project: {}, identifier: {}", project_id, node_type_or_id);

    // 1. 노드 정보 조회 및 상태 체크
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND (target_node_type = ? OR node_id = ?)"
    )
    .bind(project_id).bind(node_type_or_id).bind(node_type_or_id)
    .fetch_optional(pool).await.map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Node not found: {}", node_type_or_id))?;

    if crate::services::dag_engine::is_node_locked(pool, &node).await? {
        return Err("하위 노드가 이미 진행 중이거나 완료되어 이 노드를 다시 실행할 수 없습니다.".into());
    }

    // 중복 실행 방지 (ActiveTasks)
    let _guard = TaskGuard::new(active_tasks, node.node_id.clone())?;

    let project = sqlx::query_as::<_, Project>("SELECT * FROM project WHERE project_id = ?")
        .bind(project_id).fetch_optional(pool).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    // JIT Context 동기화
    verify_and_refresh_context(pool, project_id, &node).await?;

    // 상태 업데이트: IN_PROGRESS
    update_node_to_in_progress(app_handle, pool, &node, project_id).await?;

    // 2. 컨텍스트 수집
    let global_ctx = gather_global_context(pool, project_id, &node.node_category, &node.target_node_type).await?;
    let mut module_ctx = String::new();
    if let Some(mid) = &node.module_id {
        let module_info = sqlx::query_as::<_, crate::models::LocalModule>("SELECT * FROM local_module WHERE module_id = ?")
            .bind(mid).fetch_optional(pool).await.map_err(|e| e.to_string())?
            .ok_or_else(|| "Module not found".to_string())?;
        module_ctx = get_filtered_local_module_context(&node.target_node_type, &module_info);
    }

    // 3. 반복 실행 루프
    let client = Client::new();
    let exec_res = run_execution_loop(
        app_handle, pool, &client, api_key, &project, &node, &node.target_node_type,
        &global_ctx, &module_ctx, node.current_iteration + 1
    ).await?;

    // 4. 결과 마무리 및 후속 작업
    finalize_pipeline_result(app_handle, pool, &node, exec_res, api_key).await
}

async fn update_node_to_in_progress(app_handle: &tauri::AppHandle, pool: &SqlitePool, node: &DocumentNode, project_id: &str) -> Result<(), String> {
    sqlx::query("UPDATE document_node SET node_state = 'IN_PROGRESS', last_action = '작업 준비 중...', api_error_message = NULL, updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339()).bind(&node.node_id)
        .execute(pool).await.map_err(|e| e.to_string())?;

    if let Some(mid) = &node.module_id {
        let _ = crate::services::dag_engine::reset_module_downstream_ready_nodes(app_handle, mid, &node.target_node_type).await;
    } else {
        let _ = crate::services::dag_engine::reset_downstream_ready_nodes(app_handle, project_id, &node.target_node_type).await;
    }
    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

async fn finalize_pipeline_result(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    node: &DocumentNode,
    res: crate::services::pipeline::execution::ExecutionResult,
    api_key: &str,
) -> Result<String, String> {
    if is_node_stopped(pool, &node.node_id).await {
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "파이프라인 루프가 사용자에 의해 중단되었습니다.".into(),
            node_id: node.node_id.clone(),
            project_id: node.project_id.clone(),
            status: "STOPPED".into(),
            current_iteration: Some(res.final_iteration_count),
            max_iterations: Some(node.max_iterations),
            node_type: node.target_node_type.clone(),
            level: "WARN".into(),
            is_silent: None,
        });
        return Ok(res.current_best_content);
    }

    let final_state = match res.loop_error {
        Some(crate::models::PipelineError::ApiError(code, msg)) => {
            sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                .bind(code as i32).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
                .execute(pool).await.map_err(|e| e.to_string())?;
            return Err(format!("API Error ({}): {}", code, msg));
        },
        Some(crate::models::PipelineError::Internal(msg)) => {
            sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = 500, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                .bind(&msg).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
                .execute(pool).await.map_err(|e| e.to_string())?;
            return Err(msg);
        },
        None => NodeState::PausedHitl,
    };

    sqlx::query("UPDATE document_node SET node_state = ?, current_iteration = ?, current_best_score = ?, updated_at = ? WHERE node_id = ?")
        .bind(final_state.to_string()).bind(res.final_iteration_count).bind(res.current_best_score)
        .bind(Utc::now().to_rfc3339()).bind(&node.node_id)
        .execute(pool).await.map_err(|e| e.to_string())?;

    if final_state == NodeState::Completed {
        // RAG 저장 및 트리거 로직 (기존 로직 동일)
        let best_iter = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC LIMIT 1")
            .bind(&node.node_id).fetch_optional(pool).await.map_err(|e| e.to_string())?;
        if let Some(iter) = best_iter {
            if node.node_category != "GENESIS" {
                let client = Client::new();
                let _ = store_document_embeddings(crate::services::embedding::EmbeddingStoreArgs {
                    pool, client: &client, api_key, project_id: &node.project_id, module_id: node.module_id.as_deref(),
                    node_id: &node.node_id, node_type: &node.target_node_type, iteration_id: &iter.iteration_id,
                    document_json: &iter.generated_draft_json, score: iter.calculated_score.unwrap_or(0),
                }).await;
            }
        }
        trigger_next_nodes(app_handle.clone(), &node.project_id, &node.target_node_type).await?;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(res.current_best_content)
}

struct TaskGuard {
    tasks: Arc<std::sync::Mutex<HashSet<String>>>,
    node_id: String,
}
impl TaskGuard {
    fn new(active_tasks: &ActiveTasks, node_id: String) -> Result<Self, String> {
        let mut tasks = active_tasks.0.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&node_id) { return Err("이미 실행 중입니다.".to_string()); }
        tasks.insert(node_id.clone());
        Ok(Self { tasks: active_tasks.0.clone(), node_id })
    }
}
impl Drop for TaskGuard {
    fn drop(&mut self) {
        if let Ok(mut t) = self.tasks.lock() { t.remove(&self.node_id); }
    }
}
