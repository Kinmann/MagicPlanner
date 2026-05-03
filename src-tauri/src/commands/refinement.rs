use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Emitter, State};
use sqlx::{SqlitePool, Row};
use json_patch::{patch, PatchOperation};
use serde_json::Value;

use regex::Regex;

// ============================================================
// models/ - Models and structures
// ============================================================
pub use crate::models::{
    PipelineError,
    Project, DocumentNode, GenerationIteration,
    GlobalContext, LocalModule, PipelineStatusPayload,
};

// Service functions
use crate::services::embedding::{get_rag_context, check_node_intersection};
use crate::services::gemini::{call_gemini, call_gemini_raw};

use crate::services::node_query::{get_approved_node_output};
use crate::utils::get_prompts_dir;

#[tauri::command]
pub async fn parse_intent(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: State<'_, Client>,
    api_key: String,
    project_id: String,
    raw_input: String,
) -> Result<crate::schemas::IntentSchema, String> {
    let prompts_dir = get_prompts_dir(&app_handle);
    let mut prompt = std::fs::read_to_string(prompts_dir.join("generator/intent_parser.txt"))
        .map_err(|e| format!("Failed to load intent parser prompt: {}", e))?;
    
    prompt = prompt.replace("{{RAW_INPUT}}", &raw_input);

    let schema_json = schemars::schema_for!(crate::schemas::IntentSchema);
    let flattened_schema = crate::schemas::flatten_schema(serde_json::to_value(schema_json).unwrap());

    // 도구 명세 정의
    let tools = serde_json::json!([{
        "function_declarations": [
            {
                "name": "search_artifacts",
                "description": "Perform semantic search across all architectural artifacts (PRD, SAD, API Spec, ERD, etc.) using a query string.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "The search query or keyword." }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "get_system_overview",
                "description": "Retrieve an overview of the current system architecture, including all modules and high-level SAD context.",
                "parameters": { "type": "object", "properties": {} }
            },
            {
                "name": "get_artifact_detail",
                "description": "Retrieve the full JSON content and metadata of a specific artifact by its canonical_id (e.g., 'AUTH:API:LOGIN').",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "canonical_id": { "type": "string", "description": "The unique canonical ID of the artifact." }
                    },
                    "required": ["canonical_id"]
                }
            }
        ]
    }]);

    // 초기 메시지 구성
    let mut messages = vec![serde_json::json!({
        "role": "user",
        "parts": [{ "text": prompt }]
    })];

    let mut iteration = 0;
    let max_iterations = 5;
    let mut final_response: Option<serde_json::Value> = None;

    while iteration < max_iterations {
        iteration += 1;
        
        app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: format!("사용자의 의도를 분석하며 해결 방법을 생각하고 있어요... (분석 단계 {})", iteration),
            node_id: "".into(),
            node_type: "IntentParser".into(),
            project_id: project_id.clone(),
            level: "INFO".into(),
            status: "IN_PROGRESS".into(),
            current_iteration: Some(iteration as i32),
            max_iterations: Some(max_iterations as i32),
        }).ok();

        // Gemini 호출 (마지막 턴에서만 schema 적용)
        let response_content = call_gemini_raw(
            &*client, 
            &api_key, 
            Some("You are a software requirement analyzer. Use tools to find precise canonical_ids when needed."), 
            messages.clone(), 
            Some(tools.clone()), 
            if iteration == max_iterations { Some(flattened_schema.clone()) } else { None }
        ).await.map_err(|e| e.to_string())?;

        // 응답을 기록에 추가
        messages.push(response_content.clone());

        // Function Call 확인
        let mut tool_results = Vec::new();
        if let Some(parts) = response_content["parts"].as_array() {
            for part in parts {
                if let Some(call) = part.get("functionCall") {
                    let name = call["name"].as_str().unwrap_or("");
                    let args = call["args"].clone();
                    
                    let friendly_msg = match name {
                        "search_artifacts" => {
                            let query = args["query"].as_str().unwrap_or("");
                            format!("'{}' 관련 내용을 아키텍처 문서에서 찾아볼게요! 🔍", query)
                        },
                        "get_system_overview" => {
                            "전체적인 시스템 구조와 모듈 구성을 살펴보고 있습니다... 🏗️".to_string()
                        },
                        "get_artifact_detail" => {
                            let cid = args["canonical_id"].as_str().unwrap_or("");
                            format!("'{}' 아티팩트의 상세 설계를 확인하고 있어요... 📄", cid)
                        },
                        _ => format!("{} 도구를 사용하여 분석 중입니다...", name)
                    };

                    app_handle.emit("pipeline-status", PipelineStatusPayload {
                        message: friendly_msg,
                        node_id: "".into(),
                        node_type: "ToolUse".into(),
                        project_id: project_id.clone(),
                        level: "INFO".into(),
                        status: "IN_PROGRESS".into(),
                        current_iteration: Some(iteration as i32),
                        max_iterations: Some(max_iterations as i32),
                    }).ok();

                    // 도구 실행
                    let result = match name {
                        "search_artifacts" => {
                            let query = args["query"].as_str().unwrap_or("");
                            let context = get_rag_context(&*pool, &*client, &api_key, &project_id, query, 5, Vec::new())
                                .await.unwrap_or_else(|_| "Search failed.".to_string());
                            serde_json::json!({ "content": context })
                        },
                        "get_system_overview" => {
                            let modules = sqlx::query("SELECT module_id, module_name as name, core_responsibility as responsibility FROM local_module WHERE project_id = ? AND is_deleted = 0")
                                .bind(&project_id)
                                .fetch_all(&*pool).await.ok()
                                .map(|rows| {
                                    rows.into_iter().map(|row| {
                                        serde_json::json!({
                                            "module_id": row.get::<String, _>("module_id"),
                                            "name": row.get::<String, _>("name"),
                                            "responsibility": row.get::<String, _>("responsibility")
                                        })
                                    }).collect::<Vec<_>>()
                                });
                            let sads = sqlx::query("SELECT context_type, context_data_json FROM global_context WHERE project_id = ? AND is_deleted = 0")
                                .bind(&project_id)
                                .fetch_all(&*pool).await.ok()
                                .map(|rows| {
                                    rows.into_iter().map(|row| {
                                        serde_json::json!({
                                            "context_type": row.get::<String, _>("context_type"),
                                            "context_data_json": row.get::<String, _>("context_data_json")
                                        })
                                    }).collect::<Vec<_>>()
                                });
                            serde_json::json!({ "modules": modules, "sad_context": sads })
                        },
                        "get_artifact_detail" => {
                            let canonical_id = args["canonical_id"].as_str().unwrap_or("");
                            let node = sqlx::query(
                                "SELECT dn.target_node_type as node_type, gi.generated_draft_json as output_json \
                                 FROM document_node dn \
                                 JOIN generation_iteration gi ON gi.node_id = dn.node_id \
                                 WHERE dn.project_id = ? AND dn.target_node_type = ? AND gi.is_pass = 1 AND dn.is_deleted = 0 \
                                 ORDER BY gi.iteration_number DESC LIMIT 1"
                            )
                            .bind(&project_id)
                            .bind(canonical_id)
                            .fetch_optional(&*pool).await.ok().flatten()
                            .map(|row| {
                                serde_json::json!({
                                    "node_type": row.get::<String, _>("node_type"),
                                    "output_json": row.get::<String, _>("output_json")
                                })
                            });
                            serde_json::json!({ "artifact": node })
                        },
                        _ => serde_json::json!({ "error": "Unknown tool" })
                    };

                    tool_results.push(serde_json::json!({
                        "functionResponse": {
                            "name": name,
                            "response": result
                        }
                    }));
                }
            }
        }

        if tool_results.is_empty() {
            // 더 이상 도구 호출이 없으면 종료
            final_response = Some(response_content);
            break;
        } else {
            // 도구 실행 결과를 메시지에 추가하고 다음 루프 진행
            messages.push(serde_json::json!({
                "role": "user",
                "parts": tool_results
            }));
        }
    }

    let response_json = final_response.ok_or("Agent failed to reach a conclusion within limits.")?;
    
    // 최종 텍스트 추출 및 파싱
    let raw_text = response_json["parts"][0]["text"].as_str()
        .ok_or_else(|| format!("Expected final JSON output, but got: {:?}", response_json))?;

    let cleaned_text = raw_text.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();

    let intent: crate::schemas::IntentSchema = serde_json::from_str(cleaned_text)
        .map_err(|e| format!("Failed to parse intent JSON: {} | Content: {}", e, cleaned_text))?;

    Ok(intent)
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
    let prompts_dir = get_prompts_dir(&app_handle);
    let mut prompt = std::fs::read_to_string(prompts_dir.join("generator/architecture_router.txt"))
        .map_err(|e| format!("Failed to load architecture router prompt: {}", e))?;

    // 1. Global architecture context (Genesis PRD)
    let out_1a = get_approved_node_output(&*pool, &project_id, "GPRD_Context_Goal").await;
    let out_1b = get_approved_node_output(&*pool, &project_id, "GPRD_Capability_Actor").await;
    let out_1c = get_approved_node_output(&*pool, &project_id, "GPRD_Architecture_Schema").await;
    let genesis_prd = format!("[Source Document: Genesis PRD Context]\n{}\n\n[Source Document: Genesis PRD Capability]\n{}\n\n[Source Document: Genesis PRD Architecture]\n{}", out_1a, out_1b, out_1c);
    
    let contexts = sqlx::query_as::<_, GlobalContext>(
        "SELECT * FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    let sad_global = contexts.iter()
        .filter(|c| c.context_type.to_lowercase().starts_with("sad_"))
        .map(|c| format!("[{}] {}", c.context_type, c.context_data_json))
        .collect::<Vec<_>>()
        .join("\n");

    let modules = sqlx::query_as::<_, LocalModule>(
        "SELECT * FROM local_module WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    let module_list = modules.iter()
        .map(|m| format!("- Module ID: {}, Name: {}, Priority: {}", m.module_id, m.module_name, m.priority_order))
        .collect::<Vec<_>>()
        .join("\n");

    // 2. 핵심 정보만 필터링하여 전달 (진단 상세 제외)
    let compact_intents = intent.intents.iter().map(|i| {
        serde_json::json!({
            "action_type": i.action_type,
            "target_feature": i.target_feature,
            "search_keywords": i.search_keywords,
            "suggested_target_node_ids": i.target_node_ids,
        })
    }).collect::<Vec<_>>();
    let intent_json = serde_json::to_string_pretty(&compact_intents).unwrap_or_default();
    prompt = prompt.replace("{{INTENT_JSON}}", &intent_json);
    prompt = prompt.replace("{{GENESIS_PRD}}", &genesis_prd);
    prompt = prompt.replace("{{SAD_GLOBAL}}", &sad_global);
    prompt = prompt.replace("{{MODULE_LIST}}", &module_list);

    let schema_json = schemars::schema_for!(crate::schemas::RoutingSchema);
    let flattened_schema = crate::schemas::flatten_schema(serde_json::to_value(schema_json).unwrap());

    // 3. Gemini API ?몄텧
    let response = call_gemini(&*client, &api_key, "You are a senior solution architect who determines the impact of changes.", &prompt, Some(flattened_schema))
        .await
        .map_err(|e| match e {
            PipelineError::ApiError(code, msg) => format!("API Error ({}): {}", code, msg),
            PipelineError::Internal(msg) => format!("Internal Error: {}", msg),
        })?;

    let routing: crate::schemas::RoutingSchema = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse routing JSON: {} | Content: {}", e, response))?;

    // [Sprint 1 HITL] 아키텍처 영향도 확인을 위한 사용자 확인 이벤트 발행
    app_handle.emit("requires-target-confirmation", &routing)
        .map_err(|e| format!("Failed to emit HITL event: {}", e))?;


    Ok(routing)
}


#[tauri::command]
pub async fn confirm_architecture_routing(
    app_handle: tauri::AppHandle,
    _pool: tauri::State<'_, SqlitePool>,
    _project_id: String,
    targets: Vec<String>,
) -> Result<(), String> {
    println!(">>> Architecture Routing Confirmed by User: {:?}", targets);
    
    // Sprint 2: Taint Cascade logic will start here.
    // 현재는 단순 확인 로그만 출력.
    
    let _ = app_handle.emit("routing-confirmed", &targets);
    
    Ok(())
}


#[tauri::command]
pub async fn validate_intent_globally(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    intent: crate::schemas::IntentSchema,
    targets: Vec<String>,
) -> Result<crate::schemas::GlobalValidationSchema, String> {
    let prompts_dir = get_prompts_dir(&app_handle);
    let mut prompt = std::fs::read_to_string(prompts_dir.join("generator/global_validator.txt"))
        .map_err(|e| format!("Failed to load global validator prompt: {}", e))?;

    // 1. SAD Global 전역 컨텍스트 조회
    let contexts = sqlx::query_as::<_, GlobalContext>(
        "SELECT * FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    let sad_global = contexts.iter()
        .filter(|c| c.context_type.to_lowercase().starts_with("sad_"))
        .map(|c| format!("[{}] {}", c.context_type, c.context_data_json))
        .collect::<Vec<_>>()
        .join("\n");

    // 2. 핵심 정보만 필터링하여 전달 (진단 상세 제외)
    let compact_intents = intent.intents.iter().map(|i| {
        serde_json::json!({
            "action_type": i.action_type,
            "target_feature": i.target_feature,
            "search_keywords": i.search_keywords,
        })
    }).collect::<Vec<_>>();
    let intent_json = serde_json::to_string_pretty(&compact_intents).unwrap_or_default();
    let targets_json = targets.join(", ");
    
    prompt = prompt.replace("{{INTENT_JSON}}", &intent_json);
    prompt = prompt.replace("{{TARGET_NODES}}", &targets_json);
    prompt = prompt.replace("{{SAD_GLOBAL}}", &sad_global);

    let schema_json = schemars::schema_for!(crate::schemas::GlobalValidationSchema);
    let flattened_schema = crate::schemas::flatten_schema(serde_json::to_value(schema_json).unwrap());

    // 3. Gemini API ?몄텧
    let response = call_gemini(&*client, &api_key, "You are a senior solution architect auditing system changes.", &prompt, Some(flattened_schema))
        .await
        .map_err(|e| match e {
            PipelineError::ApiError(code, msg) => format!("API Error ({}): {}", code, msg),
            PipelineError::Internal(msg) => format!("Internal Error: {}", msg),
        })?;

    let validation: crate::schemas::GlobalValidationSchema = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse validation JSON: {} | Content: {}", e, response))?;

    Ok(validation)
}


#[tauri::command]
pub async fn apply_taint_cascade(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    intent: crate::schemas::IntentSchema,
    targets: Vec<String>,
) -> Result<(), String> {
    println!(">>> Starting Taint Cascade for targets: {:?}", targets);
    let now = Utc::now().to_rfc3339();

    // 0. Intent 저장
    sqlx::query("UPDATE project SET increment_intent = ?, updated_at = ? WHERE project_id = ?")
        .bind(serde_json::to_string(&intent).unwrap_or_default())
        .bind(&now)
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // 1. Pre-load all nodes and artifact codes
    let all_nodes_data: Vec<(String, Option<String>, String, String, String)> = sqlx::query_as(
        "SELECT dn.node_id, dn.module_id, dn.target_node_type, dn.node_state, COALESCE(gi.generated_draft_json, '') \
         FROM document_node dn \
         LEFT JOIN generation_iteration gi ON gi.node_id = dn.node_id AND gi.is_pass = 1 \
         WHERE dn.project_id = ? AND dn.is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // Indexing and mapping
    let mut node_map = std::collections::HashMap::new(); // node_id -> (module_id, node_type, state, codes)
    let mut code_to_nodes: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    let mut module_to_nodes: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    let mut type_to_nodes: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for (node_id, module_id, node_type, state, draft_json) in all_nodes_data {
        let mid = module_id.as_deref().unwrap_or("global");
        let codes = crate::services::embedding::extract_canonical_ids(&draft_json, mid, &node_type);
        for code in &codes {
            code_to_nodes.entry(code.clone()).or_insert_with(Vec::new).push(node_id.clone());
        }
        if let Some(ref mid) = module_id {
            module_to_nodes.entry(mid.to_uppercase()).or_insert_with(Vec::new).push(node_id.clone());
        }
        type_to_nodes.entry(node_type.to_uppercase()).or_insert_with(Vec::new).push(node_id.clone());
        node_map.insert(node_id, (module_id, node_type, state, codes));
    }

    // 2. BFS search (Unlimited depth based on artifact codes)
    let mut queue = std::collections::VecDeque::new();
    let mut visited = std::collections::HashSet::new();
    let mut tainted_nodes = std::collections::HashMap::new(); // node_id -> reason

    // 초기 타겟 노드 식별 및 큐 주입
    let mut initial_targets = std::collections::HashSet::new();
    
    // 1. confirmed targets (from router/user)
    for t in &targets {
        initial_targets.insert(t.clone());
    }
    
    // 2. mandatory suggested targets from intent parser
    for item in &intent.intents {
        for t in &item.target_node_ids {
            initial_targets.insert(t.clone());
        }
    }

    for t in initial_targets {
        let t_upper = t.to_uppercase();
        // 1) module_id matching
        if let Some(nodes) = module_to_nodes.get(&t_upper) {
            for nid in nodes {
                if !visited.contains(nid) {
                    visited.insert(nid.clone());
                    queue.push_back(nid.clone());
                    tainted_nodes.insert(nid.clone(), format!("Direct Target: Module impact ({})", t));
                }
            }
        }
        // 2) target_node_type matching
        if let Some(nodes) = type_to_nodes.get(&t_upper) {
            for nid in nodes {
                if !visited.contains(nid) {
                    visited.insert(nid.clone());
                    queue.push_back(nid.clone());
                    tainted_nodes.insert(nid.clone(), format!("Direct Target: Type match ({})", t));
                }
            }
        }
        // 3) canonical_id matching
        if let Some(nodes) = code_to_nodes.get(&t_upper) {
            for nid in nodes {
                if !visited.contains(nid) {
                    visited.insert(nid.clone());
                    queue.push_back(nid.clone());
                    tainted_nodes.insert(nid.clone(), format!("Direct Target: Artifact ID ({})", t));
                }
            }
        }
        // 4) node_id direct matching
        if node_map.contains_key(&t) && !visited.contains(&t) {
            visited.insert(t.clone());
            queue.push_back(t.clone());
            tainted_nodes.insert(t.clone(), "Direct Target: Node ID match".into());
        }
    }

    println!(">>> Initial Taint Targets (Level 0): {:?}", visited);

    while let Some(current_node_id) = queue.pop_front() {
        let (_, _, _, codes) = match node_map.get(&current_node_id) {
            Some(info) => info,
            None => continue,
        };

        // Propagate based on artifact codes
        for code in codes {
            if let Some(sharing_nodes) = code_to_nodes.get(code) {
                for snid in sharing_nodes {
                    if !visited.contains(snid) {
                        let (_, _, state, _) = node_map.get(snid).unwrap();
                        if state == "COMPLETED" {
                            visited.insert(snid.clone());
                            tainted_nodes.insert(snid.clone(), format!("Shared Artifact: {}", code));
                            queue.push_back(snid.clone());
                        }
                    }
                }
            }
        }
    }

    println!(">>> Tainted Nodes to be marked STALE: {:?}", tainted_nodes);

    // 3. DB 업데이트: 영향받는 노드들을 STALE 상태로 전환 및 사유 기록
    if !tainted_nodes.is_empty() {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        for (nid, reason) in tainted_nodes {
            sqlx::query(
                "UPDATE document_node SET node_state = 'STALE', last_action = ?, updated_at = ? \
                 WHERE node_id = ? AND node_state = 'COMPLETED'"
            )
            .bind(&reason)
            .bind(&now)
            .bind(&nid)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
        tx.commit().await.map_err(|e| e.to_string())?;
    }


    // 3. UI ?낅뜲?댄듃 ?대깽??諛쒗뻾
    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "Taint Cascade 완료: 영향받는 노드들을 STALE 상태로 전환하였습니다.".into(),
        node_id: "".into(),
        node_type: "System".into(),
        project_id: project_id.clone(),
        level: "SUCCESS".into(),
        status: "COMPLETED".into(),
        current_iteration: None,
        max_iterations: None,
    });

    Ok(())
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

    // 2. 교집합 여부 판별 (Similarity Check)
    let similarity = check_node_intersection(&pool, &client, &api_key, &project_id, &node_id, &intent).await
        .unwrap_or(0.0);

    // 3. Load existing data
    let latest_pass_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to load original JSON for refinement: {}", e))?;

    if similarity < 0.2 {
        println!(">>> [RAG-Recovery] Similarity {:.4} < 0.2. Auto-restoring node {} to COMPLETED", similarity, node_id);
        
        sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("No intersection: Auto-restored")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: format!("노드 {} 복구: 변경 사항 없음", node.target_node_type),
            node_id: node_id.clone(),
            node_type: node.target_node_type.clone(),
            project_id: project_id.clone(),
            level: "SUCCESS".into(),
            status: "COMPLETED".into(),
            current_iteration: None,
            max_iterations: None,
        });


        return Ok(());
    }

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
    // 2. RAG 而⑦뀓?ㅽ듃 ?뺣낫
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "RAG 분석 중...".into(),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
    });
    sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
        .bind("RAG 분석 중...").bind(Utc::now().to_rfc3339()).bind(&node_id)
        .execute(&*pool).await.map_err(|e| e.to_string())?;

    let rag_context = get_rag_context(&pool, &client, &api_key, &project_id, &intent, 5, vec![node_id.clone()]).await
        .unwrap_or_else(|e| {
            println!(">>> [RAG] refinement search failed: {}", e);
            "No additional context found via RAG.".to_string()
        });

    // 2-B. Unresolved user comments and JSON paths
    let comments_data: Vec<(String, String)> = sqlx::query_as(
        "SELECT json_path, comment_text FROM node_comment WHERE node_id = ? AND is_resolved = 0 AND is_deleted = 0"
    )
    .bind(&node_id)
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

    // Original JSON parsing
    let original_json_value: Option<Value> = serde_json::from_str(&latest_pass_iter.generated_draft_json).ok();

    let comment_context = if comments_data.is_empty() {
        "None. No unresolved user comments for this node.".to_string()
    } else {
        comments_data.iter()
            .map(|(path, text)| {
                let mut context_parts = vec![format!("- [Path: {}]", path)];
                
                if let Some(ref root) = original_json_value {
                    // 1. 블록 내용 추출
                    if let Some(target) = root.pointer(path) {
                        let target_str = serde_json::to_string(target).unwrap_or_default();
                        context_parts.push(format!("  [Original Content: {}]", target_str));
                    }
                    
                    // 2. 가장 가까운 Artifact ID 검색 (id, screen_id, table_name 등)
                    let mut current_path = path.clone();
                    let mut found_id = None;
                    while !current_path.is_empty() && current_path != "/" {
                        if let Some(obj) = root.pointer(&current_path) {
                            if let Some(id) = obj.get("id").or(obj.get("screen_id")).or(obj.get("table_name")).and_then(|v| v.as_str()) {
                                found_id = Some(id.to_string());
                                break;
                            }
                        }
                        if let Some(last_slash) = current_path.rfind('/') {
                            current_path = current_path[..last_slash].to_string();
                        } else {
                            break;
                        }
                    }
                    if let Some(id) = found_id {
                        context_parts.push(format!("  [Artifact ID: {}]", id));
                    }
                }
                
                context_parts.push(format!("  [Comment: {}]", text));
                context_parts.join("\n")
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

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
    });
    let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
        .bind("Generating Patch...").bind(Utc::now().to_rfc3339()).bind(&node_id)
        .execute(&*pool).await;

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
    prompt_content = prompt_content.replace("{{COMMENT_CONTEXT}}", &comment_context);
    
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
    let response = call_gemini(&*client, &api_key, "You are a JSON Patch generation expert.", &prompt_content, None)
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

    sqlx::query("UPDATE document_node SET node_state = 'REFINING', current_iteration = ?, updated_at = ? WHERE node_id = ?")
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
    });

    // 6. 자동 검증 프로세스 시작 (Sprint 4)
    validate_refinement_node(app_handle, pool, client, api_key, project_id, node_id, response).await?;

    Ok(())
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
    println!(">>> Starting Validation for Refined Node: {}", node_id);
    let now = Utc::now().to_rfc3339();

    // 1. 프로젝트 및 노드 정보 로드
    let project = sqlx::query_as::<_, Project>("SELECT * FROM project WHERE project_id = ?")
        .bind(&project_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let intent = project.increment_intent.ok_or("No refinement intent found.")?;
    
    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE node_id = ?")
        .bind(&node_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // 2. 교집합 여부 판별 (Similarity Check)
    let similarity = check_node_intersection(&pool, &client, &api_key, &project_id, &node_id, &intent).await
        .unwrap_or(0.0);

    if similarity < 0.2 {
        println!(">>> [RAG-Validation-Recovery] Similarity {:.4} < 0.2. Auto-restoring node {} to COMPLETED", similarity, node_id);
        
        sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("No intersection: Auto-restored")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());
        return Ok(());
    }

    // 최신 생성 이터레이션 로드 (방금 생성된 패치 적용본)
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 이전 pass된 원본 데이터 로드 (Original)
    let original_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 AND iteration_id != ? ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id)
    .bind(&latest_iter.iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "No original version found to compare.".to_string())?;

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
    // 2. RAG 而⑦뀓?ㅽ듃 ?뺣낫
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "RAG 분석 중...".into(),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
    });
    sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
        .bind("RAG 분석 중...").bind(Utc::now().to_rfc3339()).bind(&node_id)
        .execute(&*pool).await.map_err(|e| e.to_string())?;

    let rag_context = get_rag_context(&pool, &client, &api_key, &project_id, &intent, 5, vec![node_id.clone()]).await
        .unwrap_or_else(|e| {
            println!(">>> [RAG] refinement search failed: {}", e);
            "No additional context found via RAG.".to_string()
        });
 
    // RAG 분석 완료 후 패치 검증 단계로 상태 업데이트
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "패치 검증 중...".into(),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
    });
    let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
        .bind("패치 검증 중...").bind(Utc::now().to_rfc3339()).bind(&node_id)
        .execute(&*pool).await;

    let prompts_dir = get_prompts_dir(&app_handle);
    let mut prompt_content = std::fs::read_to_string(prompts_dir.join("evaluator/refinement_evaluator.txt"))
        .map_err(|e| format!("Failed to load refinement evaluator prompt: {}", e))?;

    prompt_content = prompt_content.replace("{{INTENT_JSON}}", &intent);
    prompt_content = prompt_content.replace("{{NODE_TYPE}}", &node.target_node_type);
    prompt_content = prompt_content.replace("{{SAD_GLOBAL}}", &sad_global);
    prompt_content = prompt_content.replace("{{RAG_CONTEXT}}", &rag_context);
    prompt_content = prompt_content.replace("{{ORIGINAL_JSON}}", &original_iter.generated_draft_json);
    prompt_content = prompt_content.replace("{{PATCHED_DRAFT}}", &latest_iter.generated_draft_json);

    let schema_json = schemars::schema_for!(crate::schemas::EvaluationResult);
    let flattened_schema = crate::schemas::flatten_schema(serde_json::to_value(schema_json).unwrap());

    // 3. AI 호출 (검증 수행)
    let response = call_gemini(&*client, &api_key, "You are a senior refinement validator.", &prompt_content, Some(flattened_schema))
        .await
        .map_err(|e| format!("Validation AI call failed: {:?}", e))?;

    let eval: crate::schemas::EvaluationResult = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse evaluation result: {} | Content: {}", e, response))?;

    // 4. 평가 결과 저장
    let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();
    let critical_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();

    // 80점 이상이면서 critical_errors가 없는 경우에만 최종 통과로 인정 (아니면 추가 HITL이나 재시도)
    let is_pass = eval.is_pass && eval.score >= 80;

    sqlx::query(
        "UPDATE generation_iteration SET calculated_score = ?, critical_errors_array = ?, actionable_feedback_text = ?, is_pass = ?, updated_at = ? WHERE iteration_id = ?"
    )
    .bind(eval.score)
    .bind(&critical_json)
    .bind(&feedback_json)
    .bind(if is_pass { 1 } else { 0 })
    .bind(&now)
    .bind(&latest_iter.iteration_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_best_score = ?, updated_at = ? WHERE node_id = ?")
        .bind(eval.score)
        .bind(&now)
        .bind(&node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: format!("{} Validation Complete (Score: {})", node.target_node_type, eval.score),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "SUCCESS".into(),
        status: "COMPLETED".into(),
        current_iteration: None,
        max_iterations: None,
    });
    
    // 리파인먼트 결과 수신 후 클라이언트에게 결과 패키지 전송 (결과 모달 표시)
    let _ = app_handle.emit("refinement-validation-result", serde_json::json!({
        "nodeId": node_id,
        "score": eval.score,
        "isPass": is_pass,
        "errors": eval.critical_errors,
        "feedback": eval.feedback,
        "originalJson": original_iter.generated_draft_json,
        "refinedJson": latest_iter.generated_draft_json,
        "nodeType": node.target_node_type,
        "patchOps": patch_json
    }));

    Ok(())
}


#[tauri::command]
pub async fn retry_patch_loop(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    node_id: String,
    retry_count: i32,
) -> Result<(), String> {
    println!(">>> Starting Retry Patch Loop for node: {}, count: {}", node_id, retry_count);
    
    for i in 0..retry_count {
        println!(">>> Retry Attempt {}/{}", i + 1, retry_count);
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: format!("Retrying patch... (Attempt {}/{})", i + 1, retry_count),
            node_id: node_id.clone(),
            node_type: "Refinement".into(), // Or query from DB
            project_id: project_id.clone(),
            level: "INFO".into(),
            status: "IN_PROGRESS".into(),
            current_iteration: Some(i + 1),
            max_iterations: Some(retry_count),
        });
        
        match generate_and_apply_patch(
            app_handle.clone(),
            pool.clone(),
            client.clone(),
            api_key.clone(),
            project_id.clone(),
            node_id.clone()
        ).await {
            Ok(_) => {
                // ?⑥튂 ?곸슜 ??validate_refinement_node?먯꽌 ?됯?源뚯? ?섑뻾??
                // 留뚯빟 ?됯? 寃곌낵媛 ?깃났?곸씠?쇰㈃ 猷⑦봽瑜?利됱떆 醫낅즺?섍퀬 ?ъ슜???뺤씤 ?湲?
                // ?대? generate_and_apply_patch?먯꽌 ?꾩슂???곹깭 蹂寃?REFINING -> PAUSED_HITL)???꾨즺??
                // ?곕씪???ш린??異붽??곸씤 ?먯닔 ?뺤씤 濡쒖쭅???듯빐 醫낅즺 ?щ? 寃곗젙
                
                // 若밸슈?怨ㅼ삕 ??醫묒삕 ?掠띻랭履?
                let score: i32 = sqlx::query_scalar("SELECT current_best_score FROM document_node WHERE node_id = ?")
                    .bind(&node_id)
                    .fetch_one(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
                
                if score >= 80 {
                    println!(">>> Target score reached. Ending retry loop.");
                    return Ok(());
                }
            },
            Err(e) => {
                println!(">>> Retry {} failed: {}", i + 1, e);
                // ?꾠끏??????삳굢??????귦떖 ??誘ｋ룿 ?꾩궍肄ゅ뜝?
                if i == retry_count - 1 {
                    return Err(format!("All retry attempts failed. Last error: {}", e));
                }
            }
        }
    }
    
    Ok(())
}


#[tauri::command]
pub async fn finalize_refinement_update(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<(), String> {
    println!(">>> Finalizing Refinement Update (Global Commit) for project: {}", project_id);
    let now = Utc::now().to_rfc3339();

    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "Global Refinement: Committing all changes...".into(),
        node_id: "".into(),
        node_type: "System".into(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
    });

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. Query all STALE or Refined (PAUSED_HITL) nodes
    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND (node_state = 'PAUSED_HITL' OR node_state = 'STALE')"
    )
    .bind(&project_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for node in nodes {
        // ?꾩옱 ?앹꽦??理쒖떊 ?댄꽣?덉씠??媛??留덉?留??쇰뱶諛?諛섏쁺蹂? 議고쉶
        let latest_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // 기존의 모든 통과 상태 무효화 (최신본만 유효하게 관리)
        sqlx::query("UPDATE generation_iteration SET is_pass = 0 WHERE node_id = ?")
            .bind(&node.node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // 이 이터레이션을 통과 상태로 설정
        sqlx::query("UPDATE generation_iteration SET is_pass = 1 WHERE iteration_id = ?")
            .bind(&latest_iter.iteration_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // 노드 상태를 완료로 업데이트
        sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?")
            .bind(&now)
            .bind(&node.node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 2. ??좎룞???????潁뺣먯삕??若밸벨?????????弛??????얜돋 (??좎룞???
    sqlx::query("UPDATE project SET increment_intent = NULL, updated_at = ? WHERE project_id = ?")
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "Global Refinement Committed Successfully.".into(),
        node_id: "".into(),
        node_type: "System".into(),
        project_id: project_id.clone(),
        level: "SUCCESS".into(),
        status: "COMPLETED".into(),
        current_iteration: None,
        max_iterations: None,
    });

    Ok(())
}


// ---------------------------------------------------------
// Migration: Canonical ID (Sprint 1)
// ---------------------------------------------------------

#[tauri::command]
pub async fn migrate_canonical_ids_command(
    project_id: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    println!(">>> [Migration] Starting Canonical ID Migration for project: {}", project_id);
    
    // 1. 모든 노드와 통과된 초안 로드
    let all_iterations: Vec<(String, String, Option<String>, String)> = sqlx::query_as(
        "SELECT gi.iteration_id, gi.generated_draft_json, dn.module_id, dn.target_node_type \
         FROM generation_iteration gi \
         JOIN document_node dn ON gi.node_id = dn.node_id \
         WHERE dn.project_id = ? AND gi.is_pass = 1"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut update_count = 0;
    for (iter_id, original_json, module_id, _node_type) in all_iterations {
        let mid = module_id.as_deref().unwrap_or("global");
        
        // Regex search and replace IDs
        // Rules:
        // FUNC- -> module:FSD:FUNC-
        // REQ-  -> module:PRD:REQ-
        // EPIC- -> module:PRD:EPIC-
        // FLOW- -> module:USERFLOW:FLOW-
        // SCR-  -> module:IA:SCR-
        // TBL-  -> module:ERD:TBL-
        // API-  -> module:API:API-
        // TC-   -> module:TC:TC-
        
        let mut updated_json = original_json.clone();
        let patterns = [
            ("FUNC-\\d+", "FSD"),
            ("REQ-\\d+", "PRD"),
            ("EPIC-\\d+", "PRD"),
            ("FLOW-\\d+", "USERFLOW"),
            ("SCR-\\d+", "IA"),
            ("TBL-\\d+", "ERD"),
            ("API-\\d+", "API"),
            ("TC-\\d+", "TC"),
        ];

        let mut changed = false;
        for (pattern, target_type) in patterns {
            let re = Regex::new(&format!(r"\b{}\b", pattern)).unwrap();
            let canonical_prefix = format!("{}:{}:", mid.to_uppercase(), target_type.to_uppercase());
            
            let temp_json = updated_json.clone();
            updated_json = re.replace_all(&temp_json, |caps: &regex::Captures| {
                let matched = caps.get(0).unwrap();
                let start = matched.start();
                // Already prefixed check
                if start > 0 && temp_json.as_bytes()[start-1] == b':' {
                    matched.as_str().to_uppercase()
                } else {
                    format!("{}{}", canonical_prefix, matched.as_str().to_uppercase())
                }
            }).to_string();
            
            if temp_json != updated_json {
                changed = true;
            }
        }

        if changed {
            sqlx::query("UPDATE generation_iteration SET generated_draft_json = ?, updated_at = ? WHERE iteration_id = ?")
                .bind(&updated_json)
                .bind(chrono::Utc::now().to_rfc3339())
                .bind(&iter_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            update_count += 1;
        }
    }

    Ok(format!("Successfully migrated {} iterations to canonical IDs.", update_count))
}

// ---------------------------------------------------------
// Utility: JSON Scoped Path Finder (Sprint 2)
// ---------------------------------------------------------

pub fn find_scoped_json_paths(json: &Value, target_ids: &[String]) -> Vec<String> {
    let mut paths = Vec::new();
    search_json_paths(json, "$", target_ids, &mut paths);
    paths
}

fn search_json_paths(value: &Value, current_path: &str, target_ids: &[String], paths: &mut Vec<String>) {
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

