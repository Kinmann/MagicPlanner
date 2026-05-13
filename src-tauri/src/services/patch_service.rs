use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::Emitter;
use sqlx::SqlitePool;
use json_patch::{patch, PatchOperation};
use serde_json::Value;

pub use crate::models::{
    Project, DocumentNode, GenerationIteration,
    GlobalContext, PipelineStatusPayload,
};

use crate::services::embedding::get_rag_context;
use crate::services::gemini::call_gemini;
use crate::utils::get_prompts_dir;


use crate::services::refinement_validation::validate_refinement_node_logic;

pub async fn generate_and_apply_patch_logic(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    println!(">>> Starting Patch Generation for node: {}", node_id);
    let now = Utc::now().to_rfc3339();
    let prompts_dir = get_prompts_dir(&app_handle);

    // 1. 프로젝트 및 노드 정보 로드
    let project = sqlx::query_as::<_, Project>("SELECT * FROM project WHERE project_id = ?")
        .bind(&project_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let intent = project.increment_intent.ok_or("No refinement intent found for this project.")?;
    
    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE node_id = ?")
        .bind(&node_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // [Sprint 2] ID 기반 오염 추적(Taint Cascade) 결과 확인
    let is_explicitly_tainted = node.last_action.as_ref().map(|a| a.contains("Tainted Blocks")).unwrap_or(false);

    if is_explicitly_tainted {
        println!(">>> [Taint-Bypass] Node {} marked as STALE via Taint Cascade.", node_id);
    }

    // 3. Load existing data
    let latest_pass_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to load original JSON for refinement: {}", e))?;

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
    let rag_context = get_rag_context(&pool, &client, &api_key, &project_id, &intent, 5, vec![node_id.clone()]).await
        .unwrap_or_else(|e| {
            println!(">>> [RAG] refinement search failed: {}", e);
            "No additional context found via RAG.".to_string()
        });



    // RAG 분석 완료 후 패치 생성 단계로 상태 업데이트
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "Generating Patch...".into(),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
        is_silent: Some(true),
    });

    // 2-A. 프롬프트 로드 및 데이터 주입
    let mut prompt_content = std::fs::read_to_string(prompts_dir.join("generator/patch_generator.txt"))
        .map_err(|e| format!("Failed to load patch generator prompt: {}", e))?;

    // [Sprint 2] Path Pinpointing (Target Path Hints)
    // Search for artifact IDs extracted from intent
    let intent_artifact_ids = crate::services::embedding::extract_artifact_ids(&intent);
    let target_ids: Vec<String> = intent_artifact_ids.into_iter().collect();
    
    let original_val: Value = serde_json::from_str(&latest_pass_iter.generated_draft_json)
        .map_err(|e| format!("Failed to parse original JSON for pinpointing: {}", e))?;
    
    let path_hints = find_scoped_json_paths(&original_val, &target_ids);
    let path_hints_str = if path_hints.is_empty() {
        "No direct artifact ID matches found in this node. Please analyze the context to determine the best modification points.".to_string()
    } else {
        format!("Found relevant artifact IDs at the following JSON paths. Prioritize modifying these areas:\n- {}", path_hints.join("\n- "))
    };

    prompt_content = prompt_content.replace("{{PATH_HINTS}}", &path_hints_str);
    prompt_content = prompt_content.replace("{{INTENT_JSON}}", &intent);
    prompt_content = prompt_content.replace("{{NODE_TYPE}}", &node.target_node_type);
    prompt_content = prompt_content.replace("{{SAD_GLOBAL}}", &sad_global);
    prompt_content = prompt_content.replace("{{RAG_CONTEXT}}", &rag_context);
    prompt_content = prompt_content.replace("{{ORIGINAL_JSON}}", &latest_pass_iter.generated_draft_json);

    
    // 2-B. Previous failed attempts (Optimization)
    let latest_any_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .unwrap_or(None);

    let previous_attempt = if let Some(iter) = latest_any_iter {
        // 마지막 시도가 실패(is_pass=0)한 경우에만 피드백 전달
        if iter.is_pass == Some(false) {
            format!(
                "Failed Refined JSON: {}\nScore: {}\nFeedback: {}\nCritical Errors: {}",
                iter.generated_draft_json,
                iter.calculated_score.unwrap_or(0),
                iter.actionable_feedback_text.as_deref().unwrap_or("None"),
                iter.critical_errors_array.as_deref().unwrap_or("None")
            )
        } else {
            "None. This is the first attempt or the previous attempt passed.".to_string()
        }
    } else {
        "None. This is the first attempt.".to_string()
    };
    prompt_content = prompt_content.replace("{{PREVIOUS_ATTEMPT}}", &previous_attempt);

    // 3. AI Call (Patch Generation)
    let response = call_gemini(&client, &api_key, "You are a JSON Patch generation expert.", &prompt_content, None)
        .await
        .map_err(|e| format!("AI Generation failed: {:?}", e))?;

    // 4. Apply and merge patch
    let mut original_doc: Value = serde_json::from_str(&latest_pass_iter.generated_draft_json)
        .map_err(|e| format!("Failed to parse original JSON: {}", e))?;
    
    let patch_ops_result: Result<Vec<PatchOperation>, _> = serde_json::from_str(&response);
    
    if let Err(e) = patch_ops_result {
        let error_msg = format!("AI returned invalid JSON Patch format: {} | Content: {}", e, response);
        println!(">>> Patch Parsing Error: {}", error_msg);
        
        // 패치 파싱 실패 시 HITL로 전환
        sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', updated_at = ? WHERE node_id = ?")
            .bind(&now)
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            
        let _ = app_handle.emit("nodes-updated", ());
        return Err(error_msg);
    }

    let patch_ops = patch_ops_result.unwrap();

    if let Err(e) = patch(&mut original_doc, &patch_ops) {
        let error_msg = format!("Failed to apply JSON Patch: {}. This might be due to structure mismatch.", e);
        println!(">>> Patch Application Error: {}", error_msg);

        sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', updated_at = ? WHERE node_id = ?")
            .bind(&now)
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            
        let _ = app_handle.emit("nodes-updated", ());
        return Err(error_msg);
    }

    let merged_json = original_doc.to_string();

    // 5. 새로운 이터레이션 생성 (is_pass = 0, HITL 대기 상태)
    let new_iter_id = Uuid::new_v4().to_string();
    let next_iter_num = latest_pass_iter.iteration_number + 1;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, is_pass, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, 0, ?, ?, 0)"
    )
    .bind(&new_iter_id)
    .bind(&node_id)
    .bind(next_iter_num)
    .bind(&merged_json)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE document_node SET node_state = 'REFINING', last_action = 'Refining...', current_iteration = ?, updated_at = ? WHERE node_id = ?")
        .bind(next_iter_num)
        .bind(&now)
        .bind(&node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: format!("Patch applied to {}. Starting auto-validation...", node.target_node_type),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
        is_silent: Some(true),
    });

    // 6. 자동 검증 프로세스 시작 (Sprint 4)
    validate_refinement_node_logic(app_handle, pool, client, api_key, project_id, node_id, response).await?;

    Ok(())
}

pub fn find_scoped_json_paths(json: &Value, target_ids: &[String]) -> Vec<String> {
    let mut paths = Vec::new();
    search_json_paths(json, "$", target_ids, &mut paths);
    paths
}

pub fn search_json_paths(value: &Value, current_path: &str, target_ids: &[String], paths: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, val) in map {
                let next_path = if current_path == "$" {
                    format!("$.{}", key)
                } else {
                    format!("{}.{}", current_path, key)
                };
                
                if let Some(s) = val.as_str() {
                    for tid in target_ids {
                        if s.to_uppercase().contains(&tid.to_uppercase()) {
                            paths.push(next_path.clone());
                            break;
                        }
                    }
                }
                search_json_paths(val, &next_path, target_ids, paths);
            }
        }
        Value::Array(arr) => {
            for (i, val) in arr.iter().enumerate() {
                let next_path = format!("{}[{}]", current_path, i);
                
                if let Some(s) = val.as_str() {
                    for tid in target_ids {
                        if s.to_uppercase().contains(&tid.to_uppercase()) {
                            paths.push(next_path.clone());
                            break;
                        }
                    }
                }
                search_json_paths(val, &next_path, target_ids, paths);
            }
        }
        _ => {}
    }
}

pub fn get_pinpoint_block(value: &serde_json::Value, block_id: &str) -> Option<serde_json::Value> {
    if let Some(obj) = value.as_object() {
        // ID 필드들 확인
        for id_key in ["id", "req_id", "func_id", "epic_id", "api_id", "tc_id", "screen_id", "table_id", "role_id"] {
            if let Some(v) = obj.get(id_key) {
                if v.as_str() == Some(block_id) {
                    return Some(value.clone());
                }
            }
        }
        // 자식 노드 탐색
        for v in obj.values() {
            if let Some(found) = get_pinpoint_block(v, block_id) {
                return Some(found);
            }
        }
    } else if let Some(arr) = value.as_array() {
        for v in arr {
            if let Some(found) = get_pinpoint_block(v, block_id) {
                return Some(found);
            }
        }
    }
    None
}

