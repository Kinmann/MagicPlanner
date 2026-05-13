use chrono::Utc;
use tauri::Emitter;
use sqlx::{SqlitePool, Row};
use reqwest::Client;
use crate::models::{DocumentNode, GenerationIteration, PipelineStatusPayload, RagErrorInfo};
use crate::services::embedding::store_document_embeddings;
use crate::services::dag_engine::{trigger_next_nodes, trigger_module_next_nodes};
use tauri::Manager;

pub async fn handle_hitl_action_logic(
    pool: &SqlitePool,
    node_id: &str,
    action: &str,
    app_handle: &tauri::AppHandle,
    api_key: Option<String>,
) -> Result<(), String> {
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(node_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    match action {
        "APPROVE" => {
            sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(node_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;

            let _ = app_handle.emit("nodes-updated", ());

            let pool_clone = pool.clone();
            let app_handle_clone = app_handle.clone();
            let node_id_clone = node_id.to_string();
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
                        println!(">>> [RAG-BG] Failed to get API key");
                        let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                            message: "RAG 중단: API 키가 설정되지 않았습니다.".into(),
                            node_id: node_id_clone.clone(),
                            node_type: node_type_clone.clone(),
                            project_id: project_id_clone.clone(),
                            level: "ERROR".into(),
                            status: "EMBEDDING_FAILED".into(),
                            current_iteration: None,
                            max_iterations: None,
                            is_silent: None,
                        });
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
                    if node_category_for_bg != "GENESIS" {
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

                        let embedding_res = store_document_embeddings(crate::services::embedding::EmbeddingStoreArgs {
                            pool: &pool_clone,
                            client: &client,
                            api_key: &final_api_key,
                            project_id: &project_id_clone,
                            module_id: module_id_clone.as_deref(),
                            node_id: &node_id_clone,
                            node_type: &node_type_clone,
                            iteration_id: &iter.iteration_id,
                            document_json: &iter.generated_draft_json,
                            score: iter.calculated_score.unwrap_or(0),
                        }).await;

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
                            }
                        }
                        
                        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                            .bind(Utc::now().to_rfc3339())
                            .bind(&node_id_clone)
                            .execute(&pool_clone)
                            .await;
                        let _ = app_handle_clone.emit("nodes-updated", ());
                    }

                    if embedding_success {
                        if let Some(mid) = &module_id_clone {
                            let _ = trigger_module_next_nodes(&app_handle_clone, mid, &node_type_clone).await;
                        } else {
                            let _ = trigger_next_nodes(app_handle_clone, &project_id_clone, &node_type_clone).await;
                        }
                    }
                } else {
                    println!(">>> [RAG-BG] No iteration found for node: {}, triggering anyway", node_id_clone);
                    if let Some(mid) = &module_id_clone {
                        let _ = trigger_module_next_nodes(&app_handle_clone, mid, &node_type_clone).await;
                    } else {
                        let _ = trigger_next_nodes(app_handle_clone, &project_id_clone, &node_type_clone).await;
                    }
                }
            });
        }
        "RETRY" => {
            sqlx::query("UPDATE document_node SET node_state = 'READY', current_iteration = 0, current_best_score = 0, api_error_message = NULL, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339()).bind(node_id)
                .execute(pool).await.map_err(|e| e.to_string())?;
            let _ = app_handle.emit("nodes-updated", ());
        }
        _ => return Err("Invalid action".to_string()),
    }
    Ok(())
}
