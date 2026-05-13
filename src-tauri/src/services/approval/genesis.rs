use sqlx::SqlitePool;
use chrono::Utc;
use uuid::Uuid;
use tauri::Emitter;
use crate::models::{DocumentNode, GenerationIteration};
use crate::services::dag_engine::{is_node_locked, trigger_next_nodes};
use crate::services::node_query::get_approved_node_output;
use crate::services::approval::common::trigger_rag_embedding_bg;

pub async fn confirm_genesis_prd_iteration_logic(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
    iteration_id: &str,
) -> Result<(), String> {
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = (SELECT node_id FROM generation_iteration WHERE iteration_id = ?)"
    )
    .bind(iteration_id).fetch_optional(pool).await.map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    if is_node_locked(pool, &node).await? {
        return Err("하위 파이프라인이 이미 진행 중이어서 선택을 변경할 수 없습니다.".into());
    }

    let now = Utc::now().to_rfc3339();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM global_context WHERE project_id = ? AND context_type = ?")
        .bind(project_id).bind(&node.target_node_type).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
        .bind(&now).bind(&node.node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 1, is_archived = 0, updated_at = ? WHERE iteration_id = ?")
        .bind(&now).bind(iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let iteration = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE iteration_id = ?")
        .bind(iteration_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let ctx_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
    )
    .bind(&ctx_id).bind(project_id).bind(iteration_id).bind(&node.target_node_type).bind(&iteration.generated_draft_json).bind(iteration.iteration_number).bind(&now).bind(&now)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&iteration.generated_draft_json) {
        crate::services::artifact_mapping::sync_artifact_mappings_in_tx(&mut tx, project_id, &node.node_id, &json_value).await?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    trigger_rag_embedding_bg(app_handle, pool, project_id.to_string(), node.node_id, node.target_node_type, iteration.iteration_id, iteration.generated_draft_json, iteration.calculated_score.unwrap_or(0), None).await;

    Ok(())
}

pub async fn approve_genesis_prd_node_logic(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    node_id: &str,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE node_id = ?")
        .bind(node_id).fetch_optional(pool).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Node not found".to_string())?;

    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?")
        .bind(&now).bind(node_id).execute(pool).await.map_err(|e| e.to_string())?;

    trigger_next_nodes(app_handle.clone(), &node.project_id, &node.target_node_type).await?;
    Ok(())
}

pub async fn approve_genesis_prd_logic(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
    api_key: Option<String>,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type IN ('Genesis_PRD', 'GPRD_Architecture_Schema')")
        .bind(&now).bind(project_id).execute(pool).await.map_err(|e| e.to_string())?;

    let out_1a = get_approved_node_output(pool, project_id, "GPRD_Context_Goal").await;
    let out_1b = get_approved_node_output(pool, project_id, "GPRD_Capability_Actor").await;
    let out_1c = get_approved_node_output(pool, project_id, "GPRD_Architecture_Schema").await;
    let full_prd = format!("[Genesis PRD - Context & Goal]\n{}\n\n[Genesis PRD - Capability & Actor]\n{}\n\n[Genesis PRD - Architecture Schema]\n{}", out_1a, out_1b, out_1c);
    
    let final_node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE project_id = ? AND target_node_type IN ('GPRD_Architecture_Schema', 'Genesis_PRD') ORDER BY created_at DESC LIMIT 1")
        .bind(project_id).fetch_optional(pool).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Final GPRD node not found".to_string())?;

    let latest_it = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY is_pass DESC, calculated_score DESC LIMIT 1")
        .bind(&final_node.node_id).fetch_optional(pool).await.map_err(|e| e.to_string())?;

    actual_approve_genesis_prd_init(app_handle, pool, project_id).await?;

    if let Some(it) = latest_it {
        trigger_rag_embedding_bg(app_handle, pool, project_id.to_string(), final_node.node_id, final_node.target_node_type, it.iteration_id, full_prd, it.calculated_score.unwrap_or(0), api_key).await;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

async fn actual_approve_genesis_prd_init(app_handle: &tauri::AppHandle, pool: &SqlitePool, project_id: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE project SET pipeline_phase = 'SAD', updated_at = ? WHERE project_id = ?")
        .bind(&now).bind(project_id).execute(pool).await.map_err(|e| e.to_string())?;

    let global_types = vec!["SAD_Non_Tech", "SAD_Tech_Stack", "SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error"];
    for t_type in global_types {
        let state = if t_type == "SAD_Non_Tech" { "READY" } else { "PENDING" };
        let exists = sqlx::query("SELECT 1 FROM document_node WHERE project_id = ? AND target_node_type = ?")
            .bind(project_id).bind(t_type).fetch_optional(pool).await.map_err(|e| e.to_string())?;
        if exists.is_none() {
            sqlx::query("INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, ?, 'SAD', ?, 0, 10, 80, 0, ?, ?, 0)")
                .bind(Uuid::new_v4().to_string()).bind(project_id).bind(t_type).bind(state).bind(&now).bind(&now).execute(pool).await.map_err(|e| e.to_string())?;
        } else if state == "READY" {
            sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = ? AND node_state = 'PENDING'")
                .bind(&now).bind(project_id).bind(t_type).execute(pool).await.map_err(|e| e.to_string())?;
        }
    }
    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}
