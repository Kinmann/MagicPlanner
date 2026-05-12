use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Manager, Emitter};
use sqlx::{SqlitePool, Row};

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================
pub use crate::models::{
    DocumentNode, GenerationIteration, PipelineStatusPayload,
};

// 서비스 함수 임포트
use crate::services::embedding::store_document_embeddings;
use crate::services::node_query::{get_approved_node_output};
use crate::services::dag_engine::{trigger_next_nodes, is_node_locked};
use crate::commands::module::create_local_modules;

/// Genesis PRD HITL 선택 (is_pass=1 설정)
#[tauri::command]
pub async fn confirm_genesis_prd_iteration(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Confirming Genesis PRD iteration: {} for project: {}", iteration_id, project_id);

    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = (SELECT node_id FROM generation_iteration WHERE iteration_id = ?)"
    )
    .bind(&iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    if is_node_locked(&*pool, &node).await? {
        return Err("하위 파이프라인이 이미 진행 중이어서 선택을 변경할 수 없습니다.".into());
    }

    let now = Utc::now().to_rfc3339();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 기존 해당 타입의 컨텍스트 삭제 (덮어쓰기 방지)
    sqlx::query("DELETE FROM global_context WHERE project_id = ? AND context_type = ?")
        .bind(&project_id)
        .bind(&node.target_node_type)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
        .bind(&now)
        .bind(&node.node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 1, is_archived = 0, updated_at = ? WHERE iteration_id = ?")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 확정된 초안 로드
    let iteration = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE iteration_id = ?")
        .bind(&iteration_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    // 새 컨텍스트 저장 (SAD 단계에서 참조 가능하도록)
    let ctx_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
    )
    .bind(&ctx_id).bind(&project_id).bind(&iteration_id).bind(&node.target_node_type).bind(&iteration.generated_draft_json).bind(iteration.iteration_number).bind(&now).bind(&now)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // artifact_mapping 동기화 (Phase 1)
    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&iteration.generated_draft_json) {
        crate::commands::refinement::sync_artifact_mappings_in_tx(&mut *tx, &project_id, &node.node_id, &json_value).await?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // RAG 임베딩 갱신 (비동기)
    let pool_clone = pool.inner().clone();
    let project_id_clone = project_id.clone();
    let node_id_bg = node.node_id.clone();
    let node_type_bg = node.target_node_type.clone();
    let iter_id_bg = iteration.iteration_id.clone();
    let draft_bg = iteration.generated_draft_json.clone();
    let score_bg = iteration.calculated_score.unwrap_or(0);

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
            .fetch_optional(&pool_clone).await;
        
        let actual_api_key = match session_res {
            Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
            _ => None,
        };

        if let Some(key) = actual_api_key {
            if !key.trim().is_empty() {
                let _ = store_document_embeddings(
                    &pool_clone, &client, &key, &project_id_clone, 
                    None, &node_id_bg, &node_type_bg, &iter_id_bg, &draft_bg, score_bg
                ).await;
            }
        }
    });

    Ok(())
}

/// Genesis PRD 개별 노드 승인
#[tauri::command]
pub async fn approve_genesis_prd_node(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    _api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving Genesis PRD node: {}", node_id);
    let now = Utc::now().to_rfc3339();

    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
    )
    .bind(&now)
    .bind(&node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    trigger_next_nodes(app_handle.clone(), &node.project_id, &node.target_node_type).await?;
    Ok(())
}

/// Genesis PRD 전체 승인 및 SAD 단계 진입
#[tauri::command]
pub async fn approve_genesis_prd(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    app_handle: tauri::AppHandle,
    api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving Genesis PRD for project: {}", project_id);
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type IN ('Genesis_PRD', 'GPRD_Architecture_Schema')"
    )
    .bind(&now)
    .bind(&project_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let out_1a = get_approved_node_output(&*pool, &project_id, "GPRD_Context_Goal").await;
    let out_1b = get_approved_node_output(&*pool, &project_id, "GPRD_Capability_Actor").await;
    let out_1c = get_approved_node_output(&*pool, &project_id, "GPRD_Architecture_Schema").await;
    let full_prd = format!("[Genesis PRD - Context & Goal]\n{}\n\n[Genesis PRD - Capability & Actor]\n{}\n\n[Genesis PRD - Architecture Schema]\n{}", out_1a, out_1b, out_1c);
    
    let final_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type IN ('GPRD_Architecture_Schema', 'Genesis_PRD') ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Final GPRD node not found".to_string())?;

    let latest_it = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY is_pass DESC, calculated_score DESC LIMIT 1"
    )
    .bind(&final_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    actual_approve_genesis_prd(&app_handle, &*pool, &project_id).await?;

    if let Some(it) = latest_it {
        let pool_clone = pool.inner().clone();
        let app_handle_clone = app_handle.clone();
        let project_id_clone = project_id.clone();
        let node_id_clone = final_node.node_id.clone();
        let node_type_clone = final_node.target_node_type.clone();
        let iteration_id_clone = it.iteration_id.clone();
        let score = it.calculated_score.unwrap_or(0);

        tauri::async_runtime::spawn(async move {
            let client = app_handle_clone.state::<Client>();
            let mut actual_api_key = api_key;
            if actual_api_key.as_deref().unwrap_or("").trim().is_empty() {
                let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
                    .fetch_optional(&pool_clone).await;
                actual_api_key = match session_res {
                    Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
                    _ => None,
                };
            }

            let api_key_str = match actual_api_key {
                Some(key) if !key.trim().is_empty() => key,
                _ => return,
            };

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
                is_silent: None,
            });
            let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind("RAG 저장 중...")
                .bind(Utc::now().to_rfc3339())
                .bind(&node_id_clone)
                .execute(&pool_clone)
                .await;
            let _ = app_handle_clone.emit("nodes-updated", ());

            let embedding_res = store_document_embeddings(
                &pool_clone, &*client, &api_key_str,
                &project_id_clone, None,
                &node_id_clone, &node_type_clone,
                &iteration_id_clone, &full_prd,
                score,
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
                        is_silent: None,
                    });
                },
                Err(e) => {
                    let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                        message: "RAG 저장 실패".into(),
                        node_id: node_id_clone.clone(),
                        node_type: node_type_clone.clone(),
                        project_id: project_id_clone.clone(),
                        level: "ERROR".into(),
                        status: "EMBEDDING_FAILED".into(),
                        current_iteration: None,
                        max_iterations: None,
                        is_silent: None,
                    });
                    println!(">>> [RAG] Genesis PRD Embedding Failed: {}", e);
                }
            }

            // DB 상태 초기화
            let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&node_id_clone)
                .execute(&pool_clone)
                .await;
            let _ = app_handle_clone.emit("nodes-updated", ());
        });
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

/// SAD 단계 노드 초기화 및 생성
pub async fn actual_approve_genesis_prd(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "UPDATE project SET pipeline_phase = 'SAD', updated_at = ? WHERE project_id = ?"
    )
    .bind(&now)
    .bind(project_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // SAD 글로벌 항목 (5종) 생성
    let global_types = vec![
        "SAD_Non_Tech",
        "SAD_Tech_Stack",
        "SAD_Core_ERD",
        "SAD_Auth_RBAC",
        "SAD_Interface_Error"
    ];

    for t_type in global_types {
        let state = if t_type == "SAD_Non_Tech" { "READY" } else { "PENDING" };
        let exists = sqlx::query("SELECT 1 FROM document_node WHERE project_id = ? AND target_node_type = ?")
            .bind(project_id).bind(t_type).fetch_optional(pool).await.map_err(|e| e.to_string())?;

        if exists.is_none() {
            sqlx::query(
                "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, ?, 'SAD', ?, 0, 10, 80, 0, ?, ?, 0)"
            )
            .bind(Uuid::new_v4().to_string())
            .bind(project_id)
            .bind(t_type)
            .bind(state)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        } else if state == "READY" {
            sqlx::query(
                "UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = ? AND node_state = 'PENDING'"
            )
            .bind(&now)
            .bind(project_id)
            .bind(t_type)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

/// SAD 노드 이터레이션 확정 (Global Context 저장)
#[tauri::command]
pub async fn confirm_sad_iteration(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Confirming SAD iteration: {}", iteration_id);
    
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = (SELECT node_id FROM generation_iteration WHERE iteration_id = ?)"
    )
    .bind(&iteration_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if is_node_locked(&*pool, &node).await? {
        return Err("하위 파이프라인이 진행 중이어서 선택을 변경할 수 없습니다.".into());
    }

    let iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let now = Utc::now().to_rfc3339();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 기존 해당 타입의 컨텍스트 삭제 (덮어쓰기)
    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND context_type = ?")
        .bind(&now).bind(&project_id).bind(&node.target_node_type).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
        .bind(&now).bind(&node.node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 1, is_archived = 0, updated_at = ? WHERE iteration_id = ?")
        .bind(&now).bind(&iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // 새 컨텍스트 저장
    let ctx_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
    )
    .bind(&ctx_id).bind(&project_id).bind(&iteration_id).bind(&node.target_node_type).bind(&iteration.generated_draft_json).bind(iteration.iteration_number).bind(&now).bind(&now)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE document_node SET current_best_score = ?, updated_at = ? WHERE node_id = ?")
        .bind(iteration.calculated_score).bind(&now).bind(&node.node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // artifact_mapping 동기화 (Phase 1)
    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&iteration.generated_draft_json) {
        crate::commands::refinement::sync_artifact_mappings_in_tx(&mut *tx, &project_id, &node.node_id, &json_value).await?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // RAG 임베딩 갱신 (비동기)
    let pool_clone = pool.inner().clone();
    let project_id_clone = project_id.clone();
    let node_id_bg = node.node_id.clone();
    let node_type_bg = node.target_node_type.clone();
    let iter_id_bg = iteration.iteration_id.clone();
    let draft_bg = iteration.generated_draft_json.clone();
    let score_bg = iteration.calculated_score.unwrap_or(0);

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
            .fetch_optional(&pool_clone).await;
        
        let actual_api_key = match session_res {
            Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
            _ => None,
        };

        if let Some(key) = actual_api_key {
            if !key.trim().is_empty() {
                let _ = store_document_embeddings(
                    &pool_clone, &client, &key, &project_id_clone, 
                    None, &node_id_bg, &node_type_bg, &iter_id_bg, &draft_bg, score_bg
                ).await;
            }
        }
    });

    let _ = _app_handle.emit("nodes-updated", ());
    Ok(())
}

/// 이터레이션 확정 취소 (Generic)
#[tauri::command]
pub async fn unconfirm_iteration(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Unconfirming iteration: {}", iteration_id);

    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = (SELECT node_id FROM generation_iteration WHERE iteration_id = ?)"
    )
    .bind(&iteration_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if is_node_locked(&*pool, &node).await? {
        return Err("하위 파이프라인에 이미 결과물이 있어 확정을 취소할 수 없습니다.".into());
    }

    let now = Utc::now().to_rfc3339();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE iteration_id = ?")
        .bind(&now).bind(&iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND iteration_id = ?")
        .bind(&now).bind(&project_id).bind(&iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // [USER FEEDBACK] 확정 취소 시 해당 이터레이션의 코멘트 하드 삭제
    sqlx::query("DELETE FROM node_comment WHERE iteration_id = ?")
        .bind(&iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', updated_at = ? WHERE node_id = ?")
        .bind(&now).bind(&node.node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    
    if let Some(mid) = &node.module_id {
        let _ = crate::services::dag_engine::reset_module_downstream_ready_nodes(&app_handle, mid, &node.target_node_type).await;
    } else {
        let _ = crate::services::dag_engine::reset_downstream_ready_nodes(&app_handle, &project_id, &node.target_node_type).await;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

/// SAD 노드 승인 및 다음 단계 트리거
#[tauri::command]
pub async fn approve_sad_node(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    node_id: String,
    api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving SAD node: {}", node_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE node_id = ?")
        .bind(&node_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let confirmed_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?")
        .bind(&now).bind(&node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // RAG 임베딩 (비동기)
    let pool_clone = pool.inner().clone();
    let app_handle_clone = app_handle.clone();
    let project_id_clone = project_id.clone();
    let node_id_bg = node.node_id.clone();
    let node_type_bg = node.target_node_type.clone();
    let iter_id_bg = confirmed_iter.iteration_id.clone();
    let draft_bg = confirmed_iter.generated_draft_json.clone();
    let score_bg = confirmed_iter.calculated_score.unwrap_or(0);

    tauri::async_runtime::spawn(async move {
        let client = app_handle_clone.state::<Client>();
        let mut actual_api_key = api_key;
        if actual_api_key.as_deref().unwrap_or("").trim().is_empty() {
            let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
                .fetch_optional(&pool_clone).await;
            actual_api_key = match session_res {
                Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
                _ => None,
            };
        }
        if let Some(key) = actual_api_key {
            // [LOG] RAG 시작 알림 및 DB 상태 업데이트
            let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                message: "RAG 저장 중...".into(),
                node_id: node_id_bg.clone(),
                node_type: node_type_bg.clone(),
                project_id: project_id_clone.clone(),
                level: "INFO".into(),
                status: "EMBEDDING_START".into(),
                current_iteration: None,
                max_iterations: None,
                is_silent: None,
            });
            let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind("RAG 저장 중...")
                .bind(Utc::now().to_rfc3339())
                .bind(&node_id_bg)
                .execute(&pool_clone)
                .await;
            let _ = app_handle_clone.emit("nodes-updated", ());

            let embedding_res = store_document_embeddings(&pool_clone, &*client, &key, &project_id_clone, None, &node_id_bg, &node_type_bg, &iter_id_bg, &draft_bg, score_bg).await;

            match embedding_res {
                Ok(_) => {
                    let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                        message: "RAG 저장 완료".into(),
                        node_id: node_id_bg.clone(),
                        node_type: node_type_bg.clone(),
                        project_id: project_id_clone.clone(),
                        level: "SUCCESS".into(),
                        status: "EMBEDDING_COMPLETE".into(),
                        current_iteration: None,
                        max_iterations: None,
                        is_silent: None,
                    });
                },
                Err(e) => {
                    let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                        message: "RAG 저장 실패".into(),
                        node_id: node_id_bg.clone(),
                        node_type: node_type_bg.clone(),
                        project_id: project_id_clone.clone(),
                        level: "ERROR".into(),
                        status: "EMBEDDING_FAILED".into(),
                        current_iteration: None,
                        max_iterations: None,
                        is_silent: None,
                    });
                    println!(">>> [RAG] SAD Node Embedding Failed: {}", e);
                }
            }

            // DB 상태 초기화
            let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&node_id_bg)
                .execute(&pool_clone)
                .await;
            let _ = app_handle_clone.emit("nodes-updated", ());
        }
    });

    let t_type = node.target_node_type.clone();
    tx.commit().await.map_err(|e| e.to_string())?;

    // SAD_Interface_Error 승인 시 모듈 분할 노드들 생성
    if t_type == "SAD_Interface_Error" {
        let module_types = vec!["SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"];
        let now = chrono::Utc::now().to_rfc3339();
        for mt in module_types {
            let state = if mt == "SAD_Module_List" { "READY" } else { "PENDING" };
            let exists = sqlx::query("SELECT 1 FROM document_node WHERE project_id = ? AND target_node_type = ?")
                .bind(&project_id).bind(mt).fetch_optional(&*pool).await.map_err(|e| e.to_string())?;
            if exists.is_none() {
                sqlx::query(
                    "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, ?, 'SAD', ?, 0, 10, 80, 0, ?, ?, 0)"
                )
                .bind(Uuid::new_v4().to_string())
                .bind(&project_id)
                .bind(mt)
                .bind(state)
                .bind(&now)
                .bind(&now)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // SAD_Module_Deps인 경우 모듈 생성 트리거
    if t_type == "SAD_Module_Deps" {
        // 모듈 생성 로직 (데이터 로드를 위해 별도 조회 필요)
        let list_node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module_List'")
            .bind(&project_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?;
        let list_iter = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY created_at DESC LIMIT 1")
            .bind(&list_node.node_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?;
        let list_data: serde_json::Value = serde_json::from_str(&list_iter.generated_draft_json).unwrap_or_default();
        let modules_val = list_data.get("modules").or(Some(&list_data)).unwrap();

        let mapping_node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Epic_Mapping'")
            .bind(&project_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?;
        let mapping_iter = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY created_at DESC LIMIT 1")
            .bind(&mapping_node.node_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?;
        let mapping_data: serde_json::Value = serde_json::from_str(&mapping_iter.generated_draft_json).unwrap_or_default();
        let epic_mappings: Vec<serde_json::Value> = mapping_data.get("mappings").and_then(|m| m.as_array()).cloned().unwrap_or_default();

        // SAD_Module_Deps 데이터 파싱 (의존성 및 빌드 순서)
        let deps_data: serde_json::Value = serde_json::from_str(&confirmed_iter.generated_draft_json).unwrap_or_default();
        let all_dependencies = deps_data.get("dependencies").and_then(|d| d.as_array()).cloned().unwrap_or_default();
        let build_order = deps_data.get("recommended_build_order").and_then(|b| b.as_array()).cloned().unwrap_or_default();

        let raw_modules = modules_val.as_array().cloned().unwrap_or_default();
        let modules_to_create: Vec<serde_json::Value> = raw_modules.iter().map(|m| {
            let mid = m.get("module_id").and_then(|v| v.as_str()).unwrap_or("");
            
            // 해당 모듈의 에픽 매핑 추출
            let assigned_epics: Vec<String> = epic_mappings.iter()
                .filter(|em| em.get("mapped_modules").and_then(|mm| mm.as_array())
                    .map_or(false, |mm| mm.iter().any(|val| val.as_str() == Some(mid))))
                .filter_map(|em| em.get("epic_id").and_then(|e| e.as_str()).map(|e| e.to_string()))
                .collect();

            // 해당 모듈의 의존성(dependency_spec) 추출
            let my_deps: Vec<serde_json::Value> = all_dependencies.iter()
                .filter(|d| d.get("from_module").and_then(|f| f.as_str()) == Some(mid))
                .cloned()
                .collect();
            let dependency_spec = serde_json::to_string(&my_deps).unwrap_or_else(|_| "[]".to_string());

            // 빌드 순서에 따른 우선순위 결정
            let priority = build_order.iter()
                .position(|b| b.as_str() == Some(mid))
                .map(|pos| pos as i64)
                .or_else(|| m.get("priority_order").and_then(|p| p.as_i64()))
                .unwrap_or(0);

            serde_json::json!({
                "module_id": mid,
                "name": m.get("module_name").or(m.get("name")),
                "description": m.get("description"),
                "responsibility": m.get("core_responsibility").or(m.get("responsibility")),
                "mapped_epics": assigned_epics.join(", "),
                "dependency_spec": dependency_spec,
                "priority_order": priority
            })
        }).collect();

        let final_json = serde_json::to_string(&modules_to_create).unwrap_or_else(|_| "[]".to_string());
        create_local_modules(pool.clone(), project_id, final_json, app_handle.clone()).await?;
    } else {
        // 그 외 노드는 DAG 서비스 호출하여 다음 노드 트리거
        trigger_next_nodes(app_handle.clone(), &project_id, &t_type).await?;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}
