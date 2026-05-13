use reqwest::Client;
use tauri::{Emitter, State};
use sqlx::{SqlitePool, Row};

pub use crate::models::{
    Project, DocumentNode, GenerationIteration,
    GlobalContext, PipelineStatusPayload,
};

use crate::services::embedding::get_rag_context;
use crate::services::gemini::{call_gemini, call_gemini_raw};
use crate::services::node_query::get_approved_output_by_canonical_id;
use crate::utils::get_prompts_dir;

use crate::services::artifact_mapping::{extract_mapped_ids, find_definition_node_by_block_id};
use crate::services::patch_service::get_pinpoint_block;

pub async fn parse_intent_logic(
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
            current_iteration: Some(iteration),
            max_iterations: Some(max_iterations),
            is_silent: Some(true),
        }).ok();

        // Gemini 호출 (도구 사용 시 스키마 충돌 방지를 위해 None 전달)
        let response_content = call_gemini_raw(
            &client, 
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
                        current_iteration: Some(iteration),
                        max_iterations: Some(max_iterations),
                        is_silent: Some(true),
                    }).ok();

                    // 도구 실행
                    let result = match name {
                        "search_artifacts" => {
                            let query = args["query"].as_str().unwrap_or("");
                            let context = get_rag_context(&pool, &client, &api_key, &project_id, query, 5, Vec::new())
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
                            let output_json = get_approved_output_by_canonical_id(&pool, &project_id, canonical_id).await;
                            
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

pub async fn route_architecture_target_logic(
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
        let target_json_str = get_approved_output_by_canonical_id(&pool, &project_id, &target_id).await;

        if let Ok(target_json) = serde_json::from_str::<serde_json::Value>(&target_json_str) {
            // 2. mapped_ 식별자 추출
            let mapped_ids = extract_mapped_ids(&target_json);
            
            for m_id in mapped_ids {
                // 3. [Dynamic Definition Lookup] 
                // 하드코딩된 접두어 대신 artifact_mapping을 조회하여 해당 ID가 정의된 상위 노드를 찾습니다.
                if let Ok(Some(parent_node_id)) = find_definition_node_by_block_id(&pool, &project_id, &m_id, &target_id).await {
                    let parent_json_str = get_approved_output_by_canonical_id(&pool, &project_id, &parent_node_id).await;
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
            pinpoint_context.push(get_approved_output_by_canonical_id(&pool, &project_id, "GENESIS:GPRD_Context_Goal").await);
        }

        let parent_context = pinpoint_context.join("\n\n---\n\n");

        let mut v_prompt = validator_prompt_tmpl.clone();
        v_prompt = v_prompt.replace("{{INTENT_JSON}}", &intent_json);
        v_prompt = v_prompt.replace("{{NODE_TYPE}}", &target_id);
        v_prompt = v_prompt.replace("{{BLOCK_ID}}", &target_id);
        v_prompt = v_prompt.replace("{{PARENT_JSON}}", &parent_context);

        let val_schema = schemars::schema_for!(crate::schemas::GlobalValidationSchema);
        let val_flattened = crate::schemas::flatten_schema(serde_json::to_value(val_schema).unwrap());

        let val_res = call_gemini(&client, &api_key, "You are a senior architect auditing upward alignment.", &v_prompt, Some(val_flattened))
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

