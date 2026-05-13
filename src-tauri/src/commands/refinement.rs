use reqwest::Client;
use tauri::State;
use sqlx::SqlitePool;




use crate::services::intent_service::{parse_intent_logic, route_architecture_target_logic};
use crate::services::taint_cascade_service::{apply_taint_cascade_logic, confirm_taint_cascade_logic};
use crate::services::patch_service::generate_and_apply_patch_logic;
use crate::services::refinement_validation::{validate_refinement_node_logic, confirm_node_review_logic, finalize_refinement_update_logic};
use crate::services::artifact_mapping::{migrate_canonical_ids_command_logic, migrate_artifact_mappings_logic};

#[derive(serde::Deserialize)]
pub struct TaintCascadePayload {
    pub api_key: String,
    pub project_id: String,
    pub intent: crate::schemas::IntentSchema,
    pub targets: Vec<String>,
    pub router_decision: String,
}

#[tauri::command]
pub async fn parse_intent(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: State<'_, Client>,
    api_key: String,
    project_id: String,
    raw_input: String,
) -> Result<crate::schemas::IntentSchema, String> {
    parse_intent_logic(app_handle, pool, client, api_key, project_id, raw_input).await
}

#[tauri::command]
pub async fn route_architecture_target(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    intent: crate::schemas::IntentSchema,
) -> Result<crate::schemas::RoutingSchema, String> {
    route_architecture_target_logic(app_handle, pool, client, api_key, project_id, intent).await
}

#[tauri::command]
pub async fn apply_taint_cascade(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    payload: TaintCascadePayload,
) -> Result<crate::schemas::TaintCascadeSchema, String> {
    apply_taint_cascade_logic(app_handle, pool, client, payload).await
}

#[tauri::command]
pub async fn confirm_taint_cascade(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    intent: crate::schemas::IntentSchema,
    cascade_result: crate::schemas::TaintCascadeSchema,
) -> Result<(), String> {
    confirm_taint_cascade_logic(app_handle, pool, client, api_key, project_id, intent, cascade_result).await
}

#[tauri::command]
pub async fn generate_and_apply_patch(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    generate_and_apply_patch_logic(app_handle, pool, client, api_key, project_id, node_id).await
}

#[tauri::command]
pub async fn validate_refinement_node(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    node_id: String,
    patch_json: String,
) -> Result<(), String> {
    validate_refinement_node_logic(app_handle, pool, client, api_key, project_id, node_id, patch_json).await
}

#[tauri::command]
pub async fn confirm_node_review(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    confirm_node_review_logic(app_handle, pool, project_id, node_id).await
}

#[tauri::command]
pub async fn finalize_refinement_update(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<(), String> {
    finalize_refinement_update_logic(app_handle, pool, project_id).await
}

#[tauri::command]
pub async fn migrate_canonical_ids_command(
    project_id: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    migrate_canonical_ids_command_logic(project_id, pool).await
}

#[tauri::command]
pub async fn migrate_artifact_mappings(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    migrate_artifact_mappings_logic(app_handle, pool).await
}
