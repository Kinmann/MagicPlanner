use tauri::State;
use sqlx::SqlitePool;
use crate::services::approval::{
    confirm_genesis_prd_iteration_logic,
    approve_genesis_prd_node_logic,
    approve_genesis_prd_logic,
    confirm_sad_iteration_logic,
    approve_sad_node_logic,
    unconfirm_iteration_logic,
};

/// Genesis PRD HITL 선택 (is_pass=1 설정)
#[tauri::command]
pub async fn confirm_genesis_prd_iteration(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    confirm_genesis_prd_iteration_logic(&app_handle, &pool, &project_id, &iteration_id).await
}

/// Genesis PRD 개별 노드 승인
#[tauri::command]
pub async fn approve_genesis_prd_node(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    node_id: String,
    _api_key: Option<String>,
) -> Result<(), String> {
    approve_genesis_prd_node_logic(&app_handle, &pool, &node_id).await
}

/// Genesis PRD 전체 승인 및 SAD 단계 진입
#[tauri::command]
pub async fn approve_genesis_prd(
    pool: State<'_, SqlitePool>,
    project_id: String,
    app_handle: tauri::AppHandle,
    api_key: Option<String>,
) -> Result<(), String> {
    approve_genesis_prd_logic(&app_handle, &pool, &project_id, api_key).await
}

/// SAD 노드 이터레이션 확정 (Global Context 저장)
#[tauri::command]
pub async fn confirm_sad_iteration(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    confirm_sad_iteration_logic(&app_handle, &pool, &project_id, &iteration_id).await
}

/// 이터레이션 확정 취소 (Generic)
#[tauri::command]
pub async fn unconfirm_iteration(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    unconfirm_iteration_logic(&app_handle, &pool, &project_id, &iteration_id).await
}

/// SAD 노드 승인 및 다음 단계 트리거
#[tauri::command]
pub async fn approve_sad_node(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    project_id: String,
    node_id: String,
    api_key: Option<String>,
) -> Result<(), String> {
    approve_sad_node_logic(&app_handle, &pool, &project_id, &node_id, api_key).await
}
