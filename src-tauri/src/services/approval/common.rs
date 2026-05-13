use sqlx::{SqlitePool, Row};
use chrono::Utc;
use tauri::Emitter;
use crate::models::{DocumentNode, PipelineStatusPayload};
use crate::services::embedding::store_document_embeddings;

pub async fn trigger_rag_embedding_bg(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: String,
    node_id: String,
    node_type: String,
    iteration_id: String,
    draft: String,
    score: i32,
    api_key: Option<String>,
) {
    let pool_clone = pool.clone();
    let app_handle_clone = app_handle.clone();
    
    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let mut actual_key = api_key;
        
        if actual_key.as_deref().unwrap_or("").trim().is_empty() {
            let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
                .fetch_optional(&pool_clone).await;
            actual_key = match session_res {
                Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
                _ => None,
            };
        }

        let key = match actual_key {
            Some(k) if !k.trim().is_empty() => k,
            _ => return,
        };

        // UI 알림
        let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
            message: "RAG 저장 중...".into(),
            node_id: node_id.clone(),
            node_type: node_type.clone(),
            project_id: project_id.clone(),
            level: "INFO".into(),
            status: "EMBEDDING_START".into(),
            current_iteration: None,
            max_iterations: None,
            is_silent: None,
        });

        let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("RAG 저장 중...").bind(Utc::now().to_rfc3339()).bind(&node_id).execute(&pool_clone).await;
        let _ = app_handle_clone.emit("nodes-updated", ());

        let res = store_document_embeddings(crate::services::embedding::EmbeddingStoreArgs {
            pool: &pool_clone, client: &client, api_key: &key, project_id: &project_id,
            module_id: None, node_id: &node_id, node_type: &node_type, iteration_id: &iteration_id,
            document_json: &draft, score,
        }).await;

        let (level, status, msg) = match res {
            Ok(_) => ("SUCCESS", "EMBEDDING_COMPLETE", "RAG 저장 완료"),
            Err(_) => ("ERROR", "EMBEDDING_FAILED", "RAG 저장 실패"),
        };

        let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
            message: msg.into(), node_id: node_id.clone(), node_type: node_type.clone(),
            project_id: project_id.clone(), level: level.into(), status: status.into(),
            current_iteration: None, max_iterations: None, is_silent: None,
        });

        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
            .bind(Utc::now().to_rfc3339()).bind(&node_id).execute(&pool_clone).await;
        let _ = app_handle_clone.emit("nodes-updated", ());
    });
}

pub async fn unconfirm_iteration_logic(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
    iteration_id: &str,
) -> Result<(), String> {
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = (SELECT node_id FROM generation_iteration WHERE iteration_id = ?)"
    )
    .bind(iteration_id).fetch_one(pool).await.map_err(|e| e.to_string())?;

    if crate::services::dag_engine::is_node_locked(pool, &node).await? {
        return Err("하위 파이프라인에 이미 결과물이 있어 확정을 취소할 수 없습니다.".into());
    }

    let now = Utc::now().to_rfc3339();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE iteration_id = ?")
        .bind(&now).bind(iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND iteration_id = ?")
        .bind(&now).bind(project_id).bind(iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM node_comment WHERE iteration_id = ?")
        .bind(iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', updated_at = ? WHERE node_id = ?")
        .bind(&now).bind(&node.node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    
    if let Some(mid) = &node.module_id {
        let _ = crate::services::dag_engine::reset_module_downstream_ready_nodes(app_handle, mid, &node.target_node_type).await;
    } else {
        let _ = crate::services::dag_engine::reset_downstream_ready_nodes(app_handle, project_id, &node.target_node_type).await;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}
