use tauri::{Manager, Emitter};
use sqlx::{SqlitePool, Row};
use crate::ActiveTasks;
use crate::models::DocumentNode;
use crate::services::pipeline::{
    run_pipeline_logic, handle_hitl_action_logic
};
use crate::services::dag_engine::{trigger_module_next_nodes, trigger_next_nodes};

#[tauri::command]
pub async fn run_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    node_type: String,
    api_key: String,
) -> Result<String, String> {
    run_pipeline_logic(&app_handle, &pool, &active_tasks, &project_id, &node_type, &api_key).await
}

#[tauri::command]
pub async fn handle_hitl_action(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    action: String,
    app_handle: tauri::AppHandle,
    api_key: Option<String>,
) -> Result<(), String> {
    handle_hitl_action_logic(&pool, &node_id, &action, &app_handle, api_key).await
}

#[tauri::command]
pub async fn run_genesis_prd_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    run_pipeline_logic(&app_handle, &pool, &active_tasks, &project_id, "Genesis_PRD", &api_key).await
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
        return crate::services::approval::approve_genesis_prd_logic(&app_handle, &pool, &project_id, None).await;
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
    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0")
        .bind(&module_id).bind(&node_type).fetch_optional(&*pool).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Node not found".to_string())?;

    run_pipeline_logic(&app_handle, &pool, &active_tasks, &project_id, &node.node_id, &api_key).await
}

#[tauri::command]
pub async fn stop_node_pipeline(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_STOPPED', updated_at = ? WHERE node_id = ?")
        .bind(chrono::Utc::now().to_rfc3339()).bind(&node_id).execute(&*pool).await.map_err(|e| e.to_string())?;
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
        .bind(chrono::Utc::now().to_rfc3339()).bind(&node_id).execute(&*pool).await.map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}
