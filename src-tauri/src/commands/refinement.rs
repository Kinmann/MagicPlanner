use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Emitter, State, Manager};
use sqlx::{SqlitePool, Row};
use json_patch::{patch, PatchOperation};
use serde_json::Value;

use regex::Regex;

// ============================================================
// models/ - Models and structures
// ============================================================
pub use crate::models::{
    Project, DocumentNode, GenerationIteration,
    GlobalContext, PipelineStatusPayload,
};

// Service functions
use crate::services::embedding::{get_rag_context, check_node_intersection};
use crate::services::gemini::{call_gemini, call_gemini_raw};

use crate::services::node_query::{
    resolve_node_by_canonical_id, 
    get_approved_output_by_canonical_id
};
use crate::services::embedding::store_document_embeddings;
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
            is_silent: Some(true),
        }).ok();

        // Gemini 호출 (도구 사용 시 스키마 충돌 방지를 위해 None 전달)
        let response_content = call_gemini_raw(
            &*client, 
            &api_key, 
            Some("You are a software requirement analyzer. Use tools to find precise canonical_ids when needed."), 
            messages.clone(), 
            Some(tools.clone()), 
            None
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
                        is_silent: Some(true),
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
                            let output_json = get_approved_output_by_canonical_id(&*pool, &project_id, canonical_id).await;
                            
                            if output_json == "{}" {
                                serde_json::json!({ "artifact": null, "error": format!("Artifact not found for id: {}", canonical_id) })
                            } else {
                                serde_json::json!({ 
                                    "artifact": {
                                        "canonical_id": canonical_id,
                                        "output_json": output_json
                                    }
                                })
                            }
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
    let raw_text = response_json["parts"].as_array()
        .and_then(|parts| {
            parts.iter().find_map(|p| p["text"].as_str())
        })
        .ok_or_else(|| format!("Expected final JSON output with text part, but got: {:?}", response_json))?;

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

    // ============================================================
    // [Phase 1] Target Selection (AI 추론 삭제)
    // ============================================================
    // Intent Parser가 이미 도구 탐색을 통해 정밀 좌표(target_node_ids, target_block_ids)를 찾아냈으므로
    // 추가적인 AI 추론 없이 해당 좌표를 직접 수정 타겟으로 사용합니다.
    let mut target_nodes_set = std::collections::HashSet::new();
    for i in &intent.intents {
        for nid in &i.target_node_ids {
            target_nodes_set.insert(nid.clone());
        }
        for bid in &i.target_block_ids {
            target_nodes_set.insert(bid.clone());
        }
    }

    // ============================================================
    // [Phase 2] Policy Decision (상향 전파 권한 부여)
    // ============================================================
    // 직접 타겟을 추가하지는 않으나, 인텐트의 성격을 분석하여 
    // Taint Cascade 단계에서 상향 전파(Upward)를 허용할지 결정합니다.
    let needs_refactoring = intent.intents.iter().any(|i| {
        let is_structural = matches!(i.action_type, crate::schemas::ActionType::Add | crate::schemas::ActionType::Delete);
        let is_wide_scope = matches!(i.impact_scope, crate::schemas::ImpactScope::Global | crate::schemas::ImpactScope::CrossModule);
        is_structural || is_wide_scope
    });

    let (decision, rationale) = if needs_refactoring {
        (
            crate::schemas::ValidationDecision::Refactoring,
            "구조적 변경(추가/삭제) 또는 광범위한 영향권이 감지되어 상위 설계 명세와의 정합성 검토가 필요합니다. 상향 전파가 활성화됩니다.".to_string()
        )
    } else {
        (
            crate::schemas::ValidationDecision::Pass,
            "변경 사항이 국부적이며 기존 설계 구조 내에서 처리가 가능합니다. 하향 전파 위주로 영향권을 분석합니다.".to_string()
        )
    };

    let mut routing = crate::schemas::RoutingSchema {
        target_nodes: target_nodes_set.into_iter().collect(),
        decision,
        rationale,
    };

    // ============================================================
    // [Phase 3] Pinpoint Virtual Upward Check (핀포인트 검증)
    // ============================================================
    let validator_prompt_tmpl = std::fs::read_to_string(prompts_dir.join("generator/upward_validator.txt"))
        .map_err(|e| format!("Failed to load upward validator prompt: {}", e))?;

    let intent_json = serde_json::to_string_pretty(&intent.intents).unwrap_or_default();

    for target_id in routing.target_nodes.clone() {
        // [Hyper-Precise Pinpoint Tracing]
        // 타겟 노드의 JSON을 파싱하여 mapped_ 식별자를 추출하고, 상위 노드에서 해당 블록만 가져옵니다.
        let mut pinpoint_context = Vec::new();

        // 1. 타겟 노드의 최신 승인된 내용 로드
        let target_json_str = get_approved_output_by_canonical_id(&*pool, &project_id, &target_id).await;

        if let Ok(target_json) = serde_json::from_str::<serde_json::Value>(&target_json_str) {
            // 2. mapped_ 식별자 추출
            let mapped_ids = extract_mapped_ids(&target_json);
            
            for m_id in mapped_ids {
                // 3. [Dynamic Definition Lookup] 
                // 하드코딩된 접두어 대신 artifact_mapping을 조회하여 해당 ID가 정의된 상위 노드를 찾습니다.
                if let Ok(Some(parent_node_id)) = find_definition_node_by_block_id(&*pool, &project_id, &m_id, &target_id).await {
                    let parent_json_str = get_approved_output_by_canonical_id(&*pool, &project_id, &parent_node_id).await;
                    if let Ok(parent_json) = serde_json::from_str::<serde_json::Value>(&parent_json_str) {
                        if let Some(block) = get_pinpoint_block(&parent_json, &m_id) {
                            pinpoint_context.push(format!("[Parent Block: {} (Node: {})]\n{}", m_id, parent_node_id, serde_json::to_string_pretty(&block).unwrap_or_default()));
                        }
                    }
                }
            }
        }

        // 기본 컨텍스트 (목표 및 제약사항) 추가
        if pinpoint_context.is_empty() {
            pinpoint_context.push(get_approved_output_by_canonical_id(&*pool, &project_id, "GENESIS:GPRD_Context_Goal").await);
        }

        let parent_context = pinpoint_context.join("\n\n---\n\n");

        let mut v_prompt = validator_prompt_tmpl.clone();
        v_prompt = v_prompt.replace("{{INTENT_JSON}}", &intent_json);
        v_prompt = v_prompt.replace("{{NODE_TYPE}}", &target_id);
        v_prompt = v_prompt.replace("{{BLOCK_ID}}", &target_id);
        v_prompt = v_prompt.replace("{{PARENT_JSON}}", &parent_context);

        let val_schema = schemars::schema_for!(crate::schemas::GlobalValidationSchema);
        let val_flattened = crate::schemas::flatten_schema(serde_json::to_value(val_schema).unwrap());

        let val_res = call_gemini(&*client, &api_key, "You are a senior architect auditing upward alignment.", &v_prompt, Some(val_flattened))
            .await.map_err(|e| e.to_string())?; // [Phase 2] Fail-Open 방지: 에러 발생 시 즉시 반환

        let validation: crate::schemas::GlobalValidationSchema = serde_json::from_str(&val_res).map_err(|e| format!("Failed to parse validation result: {}", e))?;

        println!("[UPWARD-CHECK] ⚖️ Result for {}: {:?} | Rationale: {}", target_id, validation.decision, validation.rationale);

        // 개별 검증 결과 실시간 발행
        let status_emoji = if matches!(validation.decision, crate::schemas::ValidationDecision::Pass) { "✅" } else { "⚠️" };
        app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: format!("[상향 검증: {}] {} {}", target_id, status_emoji, validation.rationale),
            node_id: "".into(),
            node_type: "UpwardValidator".into(),
            project_id: project_id.clone(),
            level: if matches!(validation.decision, crate::schemas::ValidationDecision::Pass) { "INFO".into() } else { "WARN".into() },
            status: "IN_PROGRESS".into(),
            current_iteration: None,
            max_iterations: None,
            is_silent: Some(true),
        }).ok();

        if matches!(validation.decision, crate::schemas::ValidationDecision::Refactoring | crate::schemas::ValidationDecision::Fail) {
            // 더 심각한 상태로 업데이트 (FAIL > REFACTORING > PASS)
            if matches!(validation.decision, crate::schemas::ValidationDecision::Fail) {
                routing.decision = crate::schemas::ValidationDecision::Fail;
            } else if matches!(routing.decision, crate::schemas::ValidationDecision::Pass) {
                routing.decision = crate::schemas::ValidationDecision::Refactoring;
            }

            let issue_msg = format!("[{}] {}", target_id, validation.rationale);
            if routing.rationale == "변경 사항이 국부적이며 기존 설계 구조 내에서 처리가 가능합니다. 하향 전파 위주로 영향권을 분석합니다." || 
               routing.rationale == "구조적 변경(추가/삭제) 또는 광범위한 영향권이 감지되어 상위 설계 명세와의 정합성 검토가 필요합니다. 상향 전파가 활성화됩니다." {
                routing.rationale = format!("상향 설계 모순 감지:\n- {}", issue_msg);
            } else {
                routing.rationale.push_str(&format!("\n- {}", issue_msg));
            }
            
            // 일시정지 상태 알림 (루프 끝에서 한 번만 보내도 되지만, 사용자 피드백을 위해 개별 발생 유지 여부 검토)
            // 여기서는 최종 결과 반환 직전에 한 번만 status를 PAUSED_HITL로 보내는 것이 더 깔끔함
        }
    }

    if matches!(routing.decision, crate::schemas::ValidationDecision::Refactoring | crate::schemas::ValidationDecision::Fail) {
        app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "상향 설계 모순이 발견되었습니다. 모든 검증 결과를 확인해 주세요.".into(),
            node_id: "".into(),
            node_type: "UpwardValidator".into(),
            project_id: project_id.clone(),
            level: "WARN".into(),
            status: "PAUSED_HITL".into(),
            current_iteration: None,
            max_iterations: None,
            is_silent: None,
        }).ok();
    }

    // ============================================================
    // [Phase 4] Dry-run & Result Return
    // ============================================================
    // DB 쓰기를 수행하지 않고 최종 스키마만 반환 (HITL 대기)
    app_handle.emit("requires-target-confirmation", &routing)
        .map_err(|e| format!("Failed to emit HITL event: {}", e))?;

    Ok(routing)
}








#[tauri::command]
pub async fn apply_taint_cascade(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    _client: tauri::State<'_, Client>,
    _api_key: String,
    project_id: String,
    _intent: crate::schemas::IntentSchema,
    targets: Vec<String>,
    _router_decision: String,
) -> Result<crate::schemas::TaintCascadeSchema, String> {
    println!("[TAINT-CASCADE] 🧪 Starting Table-Driven Cascade for targets: {:?}", targets);

    let mut impact_map: std::collections::HashMap<String, crate::schemas::TaintImpactItem> = std::collections::HashMap::new();
    let mut collected_artifact_ids = std::collections::HashSet::new();
    let mut target_node_ids = std::collections::HashSet::new();

    // 1. 초기 타겟 분석 및 직접 영향 기록
    for t in &targets {
        // targets 형식: "Module:Type:ID" 또는 "Module:Type"
        if let Some((node_id, node_type)) = resolve_node_by_canonical_id(&*pool, &project_id, t).await {
            target_node_ids.insert(node_id.clone());
            
            let parts: Vec<&str> = t.split(':').collect();
            let target_val = if parts.len() >= 3 { parts[2].to_uppercase() } else { "".to_string() };

            impact_map.entry(node_id.clone()).or_insert_with(|| crate::schemas::TaintImpactItem {
                node_id: node_id.clone(),
                node_type: node_type.clone(),
                block_ids: if target_val.is_empty() { Vec::new() } else { vec![target_val.clone()] },
                block_paths: Vec::new(),
                reason: "Direct Modification Target".to_string(),
                similarity_score: Some(1.0),
            });

            // 타겟 노드의 데이터에서 관련 ID 수집 (전파용 소스)
            let latest_json: Option<String> = sqlx::query_scalar(
                "SELECT generated_draft_json FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY iteration_number DESC LIMIT 1"
            ).bind(&node_id).fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

            if let Some(json_str) = latest_json {
                if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                    // 정의된 ID들 추출
                    for id in crate::services::embedding::extract_artifact_ids_from_value(&val) {
                        collected_artifact_ids.insert(id.to_uppercase());
                    }
                    // 참조된(mapped_) ID들 추출
                    for id in extract_mapped_ids(&val) {
                        collected_artifact_ids.insert(id.to_uppercase());
                    }
                }
            }
            
            // 명시적인 타겟 블록 ID가 있다면 추가 수집
            if !target_val.is_empty() {
                collected_artifact_ids.insert(target_val);
            }
        }
    }

    // 2. 기계적 전파 (artifact_mapping 활용)
    if !collected_artifact_ids.is_empty() {
        let id_list: Vec<String> = collected_artifact_ids.into_iter().collect();
        println!("[TAINT-CASCADE] 🔍 Propagating from {} artifact IDs", id_list.len());

        // 해당 ID들을 참조하거나 정의하는 모든 다른 노드들 조회
        let query = format!(
            "SELECT DISTINCT am.node_id, dn.target_node_type, am.artifact_id, am.json_path \
             FROM artifact_mapping am \
             JOIN document_node dn ON am.node_id = dn.node_id \
             WHERE am.artifact_id IN ({}) AND am.project_id = ? AND dn.is_deleted = 0",
            id_list.iter().map(|_| "?").collect::<Vec<_>>().join(",")
        );

        let mut q = sqlx::query(&query);
        for id in &id_list { q = q.bind(id); }
        q = q.bind(&project_id);

        let rows = q.fetch_all(&*pool).await.map_err(|e| e.to_string())?;

        for row in rows {
            let nid: String = row.get(0);
            let ntype: String = row.get(1);
            let aid: String = row.get(2);
            let path: String = row.get(3);

            // 자기 자신은 제외 (이미 직접 타겟으로 등록됨)
            if target_node_ids.contains(&nid) { continue; }

            let entry = impact_map.entry(nid.clone()).or_insert_with(|| crate::schemas::TaintImpactItem {
                node_id: nid,
                node_type: ntype,
                block_ids: Vec::new(),
                block_paths: Vec::new(),
                reason: "Cascaded via Artifact Mapping".to_string(),
                similarity_score: None, // 후처리(Confirm) 단계에서 필요 시 계산됨
            });

            if !entry.block_ids.contains(&aid) {
                entry.block_ids.push(aid);
                entry.block_paths.push(path);
            }
        }
    }

    // 3. 상태 요약 및 결과 반환
    let mut stale_count = 0;
    let mut impact_count = 0;
    let mut impacts = Vec::new();

    for (node_id, impact) in impact_map {
        let node_state: String = sqlx::query_scalar("SELECT node_state FROM document_node WHERE node_id = ?")
            .bind(&node_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?;
        
        if node_state == "COMPLETED" { stale_count += 1; }
        impact_count += (impact.block_ids.len().max(1)) as i32; 
        impacts.push(impact);
    }

    println!("[TAINT-CASCADE] ✅ Cascade complete. Stale: {}, Impacted Nodes: {}", stale_count, impacts.len());
    Ok(crate::schemas::TaintCascadeSchema { impacts, stale_count, impact_count })
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
    println!("[CONFIRM-CASCADE] 💾 Final Approval Received. Applying to DB with precision filtering...");
    let now = Utc::now().to_rfc3339();
    
    // 인텐트에서 모든 대상 블록 ID와 통합 설명 추출
    let mut intent_target_ids = std::collections::HashSet::new();
    for i in &intent.intents {
        for bid in &i.target_block_ids {
            intent_target_ids.insert(bid.to_uppercase());
        }
    }
    let intent_full_description = intent.intents.iter()
        .map(|i| i.action_description.as_str())
        .collect::<Vec<_>>()
        .join(" ");

    // 1. [Pre-Transaction Phase] 모든 상태 전이 여부를 트랜잭션 밖에서 미리 판별
    // 네트워크 호출(임베딩)이나 복잡한 연산을 tx 시작 전에 끝냄
    let mut transition_results = Vec::new();

    for impact in cascade_result.impacts {
        let mut should_transition = false;
        let mut transition_reason = String::new();

        // [Step 0] 기본 정보 로드
        let node_info: (String, Option<String>) = sqlx::query_as(
            "SELECT node_state, (SELECT generated_draft_json FROM generation_iteration WHERE node_id = dn.node_id AND is_pass = 1 ORDER BY iteration_number DESC LIMIT 1) \
             FROM document_node dn WHERE node_id = ?"
        )
        .bind(&impact.node_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let current_state = node_info.0;
        let node_json = node_info.1.unwrap_or_default();

        // [Step 1] 상태 기반 체크 (기존 COMPLETED 노드는 무조건 오염)
        if current_state == "COMPLETED" {
            should_transition = true;
            transition_reason = "[Stale: Completed Status]".to_string();
        }

        // [Step 2] ID 매칭 기반 체크 (본문에 인텐트 관련 ID가 포함되어 있는가?)
        if !should_transition && !node_json.is_empty() {
            let node_ids = crate::services::embedding::extract_artifact_ids(&node_json);
            let intersection: Vec<_> = intent_target_ids.intersection(&node_ids).collect();
            
            if !intersection.is_empty() {
                should_transition = true;
                transition_reason = format!("[Stale: ID Match ({:?})]", intersection);
            }
        }

        // [Step 3] 유사도 기반 체크 (ID 매칭 실패 시에만 수행 - 최적화)
        if !should_transition {
            // Taint Cascade 단계에서 이미 계산된 점수가 있다면 재사용
            let similarity = if let Some(score) = impact.similarity_score {
                score
            } else if !intent_full_description.is_empty() {
                // 점수가 없는 경우(예: 직접 타겟)에만 트랜잭션 밖에서 계산
                check_node_intersection(&*pool, &*client, &api_key, &project_id, &impact.node_id, &intent_full_description).await.unwrap_or(0.0)
            } else {
                0.0
            };

            if similarity > 0.2 {
                should_transition = true;
                transition_reason = format!("[Stale: Semantic Similarity ({:.2})]", similarity);
            }
        }

        let final_reason = format!("{} | Tainted: {:?} | Reason: {}", transition_reason, impact.block_ids, impact.reason);
        transition_results.push((impact.node_id, should_transition, final_reason));
    }

    // 2. [Transaction Phase] 확정된 결과만 DB에 일괄 반영
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Intent 저장
    sqlx::query("UPDATE project SET increment_intent = ?, updated_at = ? WHERE project_id = ?")
        .bind(serde_json::to_string(&intent).unwrap_or_default())
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let mut stale_nodes_for_reset = Vec::new();

    for (node_id, should_transition, final_reason) in transition_results {
        if should_transition {
            // 노드 타입과 모듈 ID 조회를 위해 미리 쿼리
            let node_info: (String, Option<String>) = sqlx::query_as("SELECT target_node_type, module_id FROM document_node WHERE node_id = ?")
                .bind(&node_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

            sqlx::query(
                "UPDATE document_node SET node_state = 'STALE', last_action = ?, updated_at = ? WHERE node_id = ?"
            )
            .bind(&final_reason)
            .bind(&now)
            .bind(&node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            stale_nodes_for_reset.push((node_info.0, node_info.1));
        } else {
            sqlx::query(
                "UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?"
            )
            .bind(format!("[Impacted] {}", final_reason))
            .bind(&now)
            .bind(&node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // [Safety] 오염된 노드들의 하위 READY 노드들을 PENDING으로 리셋
    for (node_type, module_id) in stale_nodes_for_reset {
        if let Some(mid) = module_id {
            let _ = crate::services::dag_engine::reset_module_downstream_ready_nodes(&app_handle, &mid, &node_type).await;
        } else {
            let _ = crate::services::dag_engine::reset_downstream_ready_nodes(&app_handle, &project_id, &node_type).await;
        }
    }

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

    // [Sprint 2] ID 기반 오염 추적(Taint Cascade) 결과 확인
    let is_explicitly_tainted = node.last_action.as_ref().map(|a| a.contains("Tainted Blocks")).unwrap_or(false);

    if is_explicitly_tainted {
        println!(">>> [Taint-Validation-Bypass] Node {} marked as STALE via Taint Cascade.", node_id);
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
    // 2. RAG 컨텍스트 정보
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "RAG 분석 중...".into(),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
        is_silent: Some(true),
    });

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
        is_silent: Some(true),
    });

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

    // 80점 이상이면서 critical_errors가 없는 경우에만 최종 통과로 인정
    let is_pass = eval.is_pass && eval.score >= 80;

    sqlx::query(
        "UPDATE generation_iteration SET calculated_score = ?, critical_errors_array = ?, actionable_feedback_text = ?, is_pass = ?, updated_at = ? WHERE iteration_id = ?"
    )
    .bind(eval.score)
    .bind(&critical_json)
    .bind(&feedback_json)
    .bind(is_pass as i32)
    .bind(&now)
    .bind(&latest_iter.iteration_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 5. 자동 Stale 유지 검증 로직 (RAG 유사도 < 0.2 or AI 평가 실패 시)
    let similarity = check_node_intersection(&*pool, &*client, &api_key, &project_id, &node_id, &intent).await.unwrap_or(0.0);
    
    let final_state = "REVIEW_PENDING";
    let mut auto_stale_msg = String::new();

    if similarity < 0.2 {
        auto_stale_msg = format!("[Caution] Low Semantic Similarity ({:.2} < 0.2).", similarity);
    } else if !is_pass {
        auto_stale_msg = "[Warning] AI Evaluation Score is below threshold.".to_string();
    }

    let mut final_last_action = format!("Refined & Validated (Score: {})", eval.score);
    if !auto_stale_msg.is_empty() {
        final_last_action = format!("{} | {}", auto_stale_msg, final_last_action);
    }

    sqlx::query("UPDATE document_node SET node_state = ?, current_best_score = ?, last_action = ?, updated_at = ? WHERE node_id = ?")
        .bind(final_state)
        .bind(eval.score)
        .bind(&final_last_action)
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
        is_silent: None,
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
pub async fn confirm_node_review(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    println!(">>> Confirming Node Review: {}", node_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. 해당 노드의 최신 이터레이션 조회
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // 2. 기존의 모든 통과 상태 무효화 (최신본만 유효하게 관리)
    sqlx::query("UPDATE generation_iteration SET is_pass = 0 WHERE node_id = ?")
        .bind(&node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 3. 이 이터레이션을 통과 상태로 설정
    sqlx::query("UPDATE generation_iteration SET is_pass = 1 WHERE iteration_id = ?")
        .bind(&latest_iter.iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 4. 노드 상태를 REVIEWED로 변경
    sqlx::query("UPDATE document_node SET node_state = 'REVIEWED', updated_at = ? WHERE node_id = ?")
        .bind(&now)
        .bind(&node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 5. Artifact Mapping 동기화
    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&latest_iter.generated_draft_json) {
        sync_artifact_mappings_in_tx(&mut *tx, &project_id, &node_id, &json_value).await?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // 6. RAG 임베딩 갱신 (비동기)
    let node_type: String = sqlx::query_scalar("SELECT target_node_type FROM document_node WHERE node_id = ?")
        .bind(&node_id).fetch_one(&*pool).await.unwrap_or_default();

    let pool_clone = pool.inner().clone();
    let app_handle_clone = app_handle.clone();
    let project_id_clone = project_id.clone();
    let node_id_bg = node_id.clone();
    let node_type_bg = node_type.clone();
    let iter_id_bg = latest_iter.iteration_id.clone();
    let draft_bg = latest_iter.generated_draft_json.clone();
    let score_bg = latest_iter.calculated_score.unwrap_or(0);

    tauri::async_runtime::spawn(async move {
        let client = app_handle_clone.state::<Client>();
        
        // API 키 조회 (세션에서)
        let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
            .fetch_optional(&pool_clone).await;
        
        let actual_api_key = match session_res {
            Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
            _ => None,
        };

        if let Some(key) = actual_api_key {
            if !key.trim().is_empty() {
                let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                    message: "RAG 임베딩 갱신 중...".into(),
                    node_id: node_id_bg.clone(),
                    node_type: node_type_bg.clone(),
                    project_id: project_id_clone.clone(),
                    level: "INFO".into(),
                    status: "EMBEDDING_START".into(),
                    current_iteration: None,
                    max_iterations: None,
                    is_silent: Some(true),
                });

                let _ = store_document_embeddings(
                    &pool_clone, &*client, &key, &project_id_clone, 
                    None, &node_id_bg, &node_type_bg, &iter_id_bg, &draft_bg, score_bg
                ).await;

                let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                    message: "RAG 임베딩 갱신 완료".into(),
                    node_id: node_id_bg.clone(),
                    node_type: node_type_bg.clone(),
                    project_id: project_id_clone.clone(),
                    level: "SUCCESS".into(),
                    status: "EMBEDDING_COMPLETE".into(),
                    current_iteration: None,
                    max_iterations: None,
                    is_silent: Some(true),
                });
            }
        }
    });

    // UI 이벤트 발행
    let _ = app_handle.emit("nodes-updated", ());

    // DAG 엔진 트리거
    let module_id: Option<String> = sqlx::query_scalar("SELECT module_id FROM document_node WHERE node_id = ?")
        .bind(&node_id).fetch_one(&*pool).await.unwrap_or_default();

    if let Some(mid) = module_id {
        let _ = crate::services::dag_engine::trigger_module_next_nodes(&app_handle, &mid, &node_type).await;
    } else {
        let _ = crate::services::dag_engine::trigger_next_nodes(app_handle.clone(), &project_id, &node_type).await;
    }

    // [Safety] 리파인먼트 승인 후 전역 컨텍스트 동기화
    let _ = crate::services::dag_engine::refresh_global_context(&*pool, &project_id).await;

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

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND node_state = 'REVIEWED'"
    )
    .bind(&project_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let mut modified_node_ids = Vec::new();
    for node in nodes {
        modified_node_ids.push(node.node_id.clone());
        let latest_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE generation_iteration SET is_pass = 0 WHERE node_id = ?")
            .bind(&node.node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE generation_iteration SET is_pass = 1 WHERE iteration_id = ?")
            .bind(&latest_iter.iteration_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?")
            .bind(&now)
            .bind(&node.node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&latest_iter.generated_draft_json) {
            sync_artifact_mappings_in_tx(&mut *tx, &project_id, &node.node_id, &json_value).await?;
        }
    }

    // 2. 인텐트 및 세션 상태 초기화
    sqlx::query("UPDATE project SET increment_intent = NULL, updated_at = ? WHERE project_id = ?")
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    // 3. 모든 승인된 노드의 RAG 임베딩 일괄 갱신 (비동기)
    let reviewed_nodes_to_sync: Vec<(String, String, String, String, i32)> = sqlx::query_as(
        "SELECT gi.node_id, dn.target_node_type, gi.iteration_id, gi.generated_draft_json, IFNULL(gi.calculated_score, 0) \
         FROM generation_iteration gi \
         JOIN document_node dn ON gi.node_id = dn.node_id \
         WHERE dn.project_id = ? AND dn.node_state = 'COMPLETED' AND gi.is_pass = 1"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

    let pool_clone = pool.inner().clone();
    let app_handle_clone = app_handle.clone();
    let project_id_clone = project_id.clone();

    tauri::async_runtime::spawn(async move {
        let client = app_handle_clone.state::<Client>();
        
        let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
            .fetch_optional(&pool_clone).await;
        
        let actual_api_key = match session_res {
            Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
            _ => None,
        };

        if let Some(key) = actual_api_key {
            if !key.trim().is_empty() {
                for (nid, ntype, itid, draft, score) in reviewed_nodes_to_sync {
                    let _ = store_document_embeddings(
                        &pool_clone, &*client, &key, &project_id_clone, 
                        None, &nid, &ntype, &itid, &draft, score
                    ).await;
                }

                let _ = app_handle_clone.emit("pipeline-status", PipelineStatusPayload {
                    message: "전역 RAG 동기화 완료".into(),
                    node_id: "".into(),
                    node_type: "System".into(),
                    project_id: project_id_clone.clone(),
                    level: "SUCCESS".into(),
                    status: "EMBEDDING_COMPLETE".into(),
                    current_iteration: None,
                    max_iterations: None,
                    is_silent: None,
                });
            }
        }
    });

    // [Safety] 리파인먼트 전체 커밋 후 전역 컨텍스트 동기화
    let _ = crate::services::dag_engine::refresh_global_context(&*pool, &project_id).await;

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
        is_silent: None,
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

#[tauri::command]
pub async fn migrate_artifact_mappings(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    println!(">>> [Migration] Starting Artifact Mapping Migration for all projects");
    
    // 1. 모든 프로젝트의 모든 승인된 노드 및 최신 이터레이션 로드
    let all_approved_nodes: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT dn.project_id, dn.node_id, gi.generated_draft_json \
         FROM document_node dn \
         JOIN generation_iteration gi ON gi.node_id = dn.node_id \
         WHERE gi.is_pass = 1 AND dn.is_deleted = 0"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut total_synced = 0;
    for (project_id, node_id, json_str) in all_approved_nodes {
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&json_str) {
            match sync_artifact_mappings(&*pool, &project_id, &node_id, &json_value).await {
                Ok(_) => total_synced += 1,
                Err(e) => println!(">>> [Migration] Failed to sync node {}: {}", node_id, e),
            }
        }
    }

    Ok(format!("Successfully synced {} nodes to artifact_mapping table.", total_synced))
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


// ============================================================
// Helper Functions for Pinpoint Tracing
// ============================================================

pub async fn sync_artifact_mappings(
    pool: &sqlx::SqlitePool,
    project_id: &str,
    node_id: &str,
    json_value: &serde_json::Value,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sync_artifact_mappings_in_tx(&mut *tx, project_id, node_id, json_value).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn sync_artifact_mappings_in_tx(
    tx: &mut sqlx::SqliteConnection,
    project_id: &str,
    node_id: &str,
    json_value: &serde_json::Value,
) -> Result<(), String> {
    // 1. 기존 매핑 삭제
    sqlx::query("DELETE FROM artifact_mapping WHERE node_id = ?")
        .bind(node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. 새로운 매핑 추출
    let mappings = extract_mapped_ids_with_path(json_value, "");
    let now = Utc::now().to_rfc3339();

    // 3. 삽입
    for (artifact_id, json_path) in mappings {
        let mapping_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO artifact_mapping (mapping_id, project_id, node_id, artifact_id, json_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&mapping_id)
        .bind(project_id)
        .bind(node_id)
        .bind(&artifact_id)
        .bind(&json_path)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn extract_mapped_ids_with_path(value: &serde_json::Value, current_path: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();
    
    // 패턴: 계층적 구조(module:type:id) 또는 단순 ID(ID-001)
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)\b(?:[A-Z0-9_]+:[A-Z0-9_]+:)?[A-Z]{2,}-\w+\b").unwrap());

    if let Some(obj) = value.as_object() {
        for (k, v) in obj {
            let next_path = if current_path.is_empty() {
                format!("/{}", k)
            } else {
                format!("{}/{}", current_path, k)
            };

            // 1. 'mapped_' 접두어 체크
            if k.starts_with("mapped_") {
                if let Some(s) = v.as_str() {
                    results.push((s.to_uppercase(), current_path.to_string()));
                } else if let Some(arr) = v.as_array() {
                    for item in arr {
                        if let Some(s) = item.as_str() {
                            results.push((s.to_uppercase(), current_path.to_string()));
                        }
                    }
                }
            }
            
            // 2. 값 자체의 패턴 체크 (유연한 추출)
            if let Some(s) = v.as_str() {
                if re.is_match(s) {
                    results.push((s.to_uppercase(), current_path.to_string()));
                }
            }

            results.extend(extract_mapped_ids_with_path(v, &next_path));
        }
    } else if let Some(arr) = value.as_array() {
        for (i, v) in arr.iter().enumerate() {
            let next_path = format!("{}/{}", current_path, i);
            
            if let Some(s) = v.as_str() {
                if re.is_match(s) {
                    results.push((s.to_uppercase(), current_path.to_string()));
                }
            }
            
            results.extend(extract_mapped_ids_with_path(v, &next_path));
        }
    }
    results
}

fn extract_mapped_ids(value: &serde_json::Value) -> Vec<String> {
    let mappings = extract_mapped_ids_with_path(value, "");
    let ids: Vec<String> = mappings.into_iter().map(|(id, _)| id).collect();
    
    // 중복 제거
    let set: std::collections::HashSet<_> = ids.into_iter().collect();
    set.into_iter().collect()
}

fn get_pinpoint_block(value: &serde_json::Value, block_id: &str) -> Option<serde_json::Value> {
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

/// [Phase 1] 특정 블록 ID가 정의된 '부모' 또는 '원천' 노드를 찾습니다.
/// 단순히 해당 ID를 포함하는 노드 중, 현재 타겟 노드와 다른 상위 계층의 노드를 우선합니다.
pub async fn find_definition_node_by_block_id(
    pool: &sqlx::SqlitePool,
    project_id: &str,
    block_id: &str,
    current_node_id: &str,
) -> Result<Option<String>, String> {
    // 1. 해당 block_id를 포함하는 모든 노드 조회 (현재 노드 제외)
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT am.node_id, dn.target_node_type FROM artifact_mapping am \
         JOIN document_node dn ON am.node_id = dn.node_id \
         WHERE am.artifact_id = ? AND am.project_id = ? AND am.node_id != ? AND dn.is_deleted = 0"
    )
    .bind(block_id)
    .bind(project_id)
    .bind(current_node_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if rows.is_empty() { return Ok(None); }

    // 2. 상위 계층 노드(GPRD, SAD 등) 우선 순위 부여
    // GENESIS(GPRD) > SAD > 기타 순으로 정렬하여 가장 상위 노드를 반환
    let mut sorted_rows = rows.clone();
    sorted_rows.sort_by(|a, b| {
        let score = |node_type: &str| {
            if node_type.contains("GPRD") || node_type.contains("GENESIS") { 0 }
            else if node_type.contains("SAD") { 1 }
            else if node_type.contains("PRD") { 2 }
            else if node_type.contains("FSD") { 3 }
            else { 4 }
        };
        score(&a.1).cmp(&score(&b.1))
    });

    Ok(Some(sorted_rows[0].0.clone()))
}
