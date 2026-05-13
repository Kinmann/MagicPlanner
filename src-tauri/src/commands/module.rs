use sqlx::SqlitePool;
use tauri::State;
use crate::models::{GlobalContext, LocalModule};
use crate::services::module_service::create_local_modules_logic;

#[tauri::command]
pub async fn get_project_modules(
    pool: State<'_, SqlitePool>,
    project_id: String,
) -> Result<Vec<LocalModule>, String> {
    let modules = sqlx::query_as::<_, LocalModule>(
        "SELECT module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, dependency_spec, priority_order, module_state, display_order, created_at, updated_at FROM local_module WHERE project_id = ? AND is_deleted = 0 ORDER BY priority_order ASC"
    )
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(modules)
}

#[tauri::command]
pub async fn get_global_contexts(
    pool: State<'_, SqlitePool>,
    project_id: String,
) -> Result<Vec<GlobalContext>, String> {
    let contexts = sqlx::query_as::<_, GlobalContext>(
        "SELECT context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at FROM global_context WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(contexts)
}

#[tauri::command]
pub async fn create_local_modules(
    pool: State<'_, SqlitePool>,
    project_id: String,
    modules_json: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    create_local_modules_logic(&pool, &project_id, &modules_json, &app_handle).await
}
