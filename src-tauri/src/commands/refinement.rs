use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Emitter, State};
use sqlx::SqlitePool;
use json_patch::{patch, PatchOperation};
use serde_json::Value;

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================
pub use crate::models::{
    PipelineError,
    Project, DocumentNode, GenerationIteration,
    GlobalContext, LocalModule, PipelineStatusPayload,
};

// 서비스 함수 임포트
use crate::services::embedding::{get_rag_context, check_node_intersection};
use crate::services::gemini::call_gemini;
use crate::services::node_query::{get_approved_node_output};
use crate::utils::get_prompts_dir;

// EvaluationResult is now imported from crate::schemas

// EvaluationResult is now imported from crate::schemas


#[tauri::command]
pub async fn parse_intent(
    app_handle: tauri::AppHandle,
    client: State<'_, Client>,
    api_key: String,
    raw_input: String,
) -> Result<crate::schemas::IntentSchema, String> {
    let prompts_dir = get_prompts_dir(&app_handle);
    let mut prompt = std::fs::read_to_string(prompts_dir.join("generator/intent_parser.txt"))
        .map_err(|e| format!("Failed to load intent parser prompt: {}", e))?;
    
    prompt = prompt.replace("{{RAW_INPUT}}", &raw_input);

    let schema_json = schemars::schema_for!(crate::schemas::IntentSchema);
    let flattened_schema = crate::schemas::flatten_schema(serde_json::to_value(schema_json).unwrap());

    let response = call_gemini(&*client, &api_key, "You are a software requirement analyzer.", &prompt, Some(flattened_schema))
        .await
        .map_err(|e| match e {
            PipelineError::ApiError(code, msg) => format!("API Error ({}): {}", code, msg),
            PipelineError::Internal(msg) => format!("Internal Error: {}", msg),
        })?;

    let intent: crate::schemas::IntentSchema = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse intent JSON: {} | Content: {}", e, response))?;


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

    // 1. 전체 아키텍처 맥락 조회 (개별 노드 분리 주입)
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

    // 2. 縕먲옙??辱ζ쉼占?
    let intent_json = serde_json::to_string_pretty(&intent).unwrap_or_default();
    prompt = prompt.replace("{{INTENT_JSON}}", &intent_json);
    prompt = prompt.replace("{{GENESIS_PRD}}", &genesis_prd);
    prompt = prompt.replace("{{SAD_GLOBAL}}", &sad_global);
    prompt = prompt.replace("{{MODULE_LIST}}", &module_list);

    let schema_json = schemars::schema_for!(crate::schemas::RoutingSchema);
    let flattened_schema = crate::schemas::flatten_schema(serde_json::to_value(schema_json).unwrap());

    // 3. Gemini API 호출
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
    
    // Sprint 2에서 연동될 Taint Cascade(영향도 전파) 로직이 여기서 시작될 예정입니다.
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

    // 2. 縕먲옙??辱ζ쉼占?
    let intent_json = serde_json::to_string_pretty(&intent).unwrap_or_default();
    let targets_json = targets.join(", ");
    
    prompt = prompt.replace("{{INTENT_JSON}}", &intent_json);
    prompt = prompt.replace("{{TARGET_NODES}}", &targets_json);
    prompt = prompt.replace("{{SAD_GLOBAL}}", &sad_global);

    let schema_json = schemars::schema_for!(crate::schemas::GlobalValidationSchema);
    let flattened_schema = crate::schemas::flatten_schema(serde_json::to_value(schema_json).unwrap());

    // 3. Gemini API 호출
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

    // 1. 모듈 간 의존성 정보 조회 (SAD_module_deps)
    let deps_context = sqlx::query_as::<_, GlobalContext>(
        "SELECT * FROM global_context WHERE project_id = ? AND context_type = 'sad_module_deps' AND is_deleted = 0 ORDER BY version DESC LIMIT 1"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut impacted_modules = std::collections::HashSet::new();
    for t in &targets { impacted_modules.insert(t.clone()); }

    if let Some(ctx) = deps_context {
        if let Ok(deps_schema) = serde_json::from_str::<crate::schemas::SadModuleDepsSchema>(&ctx.context_data_json) {
            // BFS로 영향 받는 모듈들 탐색 (역방향 전파)
            let mut queue: std::collections::VecDeque<String> = targets.clone().into();
            while let Some(current) = queue.pop_front() {
                for dep in &deps_schema.dependencies {
                    if dep.to_module == current { // current가 변경되었으므로 current를 의존하는 from_module로 영향 전파
                        if !impacted_modules.contains(&dep.from_module) {
                            impacted_modules.insert(dep.from_module.clone());
                            queue.push_back(dep.from_module.clone());
                        }
                    }
                }
            }
        }
    }

    println!(">>> Impacted Modules: {:?}", impacted_modules);

    // 2. DB 업데이트: 영향받는 노드들을 STALE 상태로 전환
    // module_id 및 target_node_type에 해당하는 모든 노드 처리
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for mid in impacted_modules {
        // [주의] 모듈 아이디가 여러 개일 수 있으므로 정확한 ID 조회 (삭제되지 않은 것만)
        let module_ids: Vec<String> = sqlx::query_scalar(
            "SELECT module_id FROM local_module WHERE project_id = ? AND module_id = ? AND is_deleted = 0"
        )
        .bind(&project_id)
        .bind(&mid)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        for found_id in module_ids {
            sqlx::query(
                "UPDATE document_node SET node_state = 'STALE', updated_at = ? WHERE module_id = ? AND project_id = ?"
            )
            .bind(&now)
            .bind(&found_id)
            .bind(&project_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
        
        // ?占쏜　??蘊덌옙(SAD_Global, SAD_Module, Genesis_PRD ?? 獄ㅶ쵟占?墉?겒??
        let target_types = match mid.to_lowercase().as_str() {
            "sad_non_tech" | "sad_tech_stack" | "sad_core_erd" | "sad_auth_rbac" | "sad_interface_error" | "sad_global" => 
                vec!["SAD_Global".to_string()],
            "sad_module_list" | "sad_epic_mapping" | "sad_module_deps" | "sad_module" => 
                vec!["SAD_Module".to_string()],
            "genesis_prd" | "prd" | "integrated-prd" => 
                vec!["Genesis_PRD".to_string(), "GPRD_Architecture_Schema".to_string()],
            _ => vec![mid.clone(), format!("SAD_{}", mid)],
        };

        for t_type in target_types {
            sqlx::query(
                "UPDATE document_node SET node_state = 'STALE', updated_at = ? WHERE project_id = ? AND (target_node_type = ? OR LOWER(target_node_type) = LOWER(?))"
            )
            .bind(&now)
            .bind(&project_id)
            .bind(&t_type)
            .bind(&t_type)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // 3. UI 업데이트 이벤트 발행
    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "Taint Cascade 완료: 영향받는 노드들을 STALE 상태로 전환했습니다.".into(),
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

    // 2. 교집합 판별 (Similarity Check)
    let similarity = check_node_intersection(&pool, &client, &api_key, &project_id, &node_id, &intent).await
        .unwrap_or(0.0);

    // 3. 기존 데이터 로드 (회복 및 패치 공통 필요)
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
            .bind("교집합 없음: 자동 복구됨")
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

    // 2. ?占썩?占썰궩 辱쀯옙壅?
    // 2. RAG 컨텍스트 확보
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

    // RAG 분석 완료 후 패치 생성 단계로 상태 업데이트
    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
        message: "패치 생성 중...".into(),
        node_id: node_id.clone(),
        node_type: node.target_node_type.clone(),
        project_id: project_id.clone(),
        level: "INFO".into(),
        status: "IN_PROGRESS".into(),
        current_iteration: None,
        max_iterations: None,
    });
    let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
        .bind("패치 생성 중...").bind(Utc::now().to_rfc3339()).bind(&node_id)
        .execute(&*pool).await;

    let prompts_dir = get_prompts_dir(&app_handle);
    let mut prompt_content = std::fs::read_to_string(prompts_dir.join("generator/patch_generator.txt"))
        .map_err(|e| format!("Failed to load patch generator prompt: {}", e))?;

    prompt_content = prompt_content.replace("{{INTENT_JSON}}", &intent);
    prompt_content = prompt_content.replace("{{NODE_TYPE}}", &node.target_node_type);
    prompt_content = prompt_content.replace("{{SAD_GLOBAL}}", &sad_global);
    prompt_content = prompt_content.replace("{{RAG_CONTEXT}}", &rag_context);
    prompt_content = prompt_content.replace("{{ORIGINAL_JSON}}", &latest_pass_iter.generated_draft_json);
    
    // 2-B. 이전 실패 시도 로드 (반복 최적화용)
    let latest_any_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .unwrap_or(None);

    let previous_attempt = if let Some(iter) = latest_any_iter {
        // 마지막 시도가 실패(is_pass=0)인 경우에만 피드백 전달
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

    // 3. AI 호출 (패치 생성)
    let response = call_gemini(&*client, &api_key, "You are a JSON Patch generation expert.", &prompt_content, None)
        .await
        .map_err(|e| format!("AI Generation failed: {:?}", e))?;

    // 4. 패치 적용 및 병합
    let mut original_doc: Value = serde_json::from_str(&latest_pass_iter.generated_draft_json)
        .map_err(|e| format!("Failed to parse original JSON: {}", e))?;
    
    let patch_ops_result: Result<Vec<PatchOperation>, _> = serde_json::from_str(&response);
    
    if let Err(e) = patch_ops_result {
        let error_msg = format!("AI returned invalid JSON Patch format: {} | Content: {}", e, response);
        println!(">>> Patch Parsing Error: {}", error_msg);
        
        // ?葯멥삖 ?轝좒쨺??帝같占??HITL獄???섊뼅???燁묌뭘??? ?屍귩쪟??섓옙 ??
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

    // 2. 교집합 판별 (Similarity Check)
    let similarity = check_node_intersection(&pool, &client, &api_key, &project_id, &node_id, &intent).await
        .unwrap_or(0.0);

    if similarity < 0.2 {
        println!(">>> [RAG-Validation-Recovery] Similarity {:.4} < 0.2. Auto-restoring node {} to COMPLETED", similarity, node_id);
        
        sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("교집합 없음: 자동 복구됨")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());
        return Ok(());
    }

    // 최신 생성 이터레이션 로드 (방금 생성한 패치 적용본)
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

    // 2. ?占썩?占썰궩 辱쀯옙壅?
    // 2. RAG 컨텍스트 확보
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
    
    // 리파인먼트 결과 수신 시, 클라이언트에게 결과 패키지 전송 (결과 모달 표시용)
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
                // 패치 적용 후 validate_refinement_node에서 평가까지 수행됨
                // 만약 평가 결과가 성공적이라면 루프를 즉시 종료하고 사용자 확인 대기
                // 이미 generate_and_apply_patch에서 필요한 상태 변경(REFINING -> PAUSED_HITL)이 완료됨
                // 따라서 여기서 추가적인 점수 확인 로직을 통해 종료 여부 결정
                
                // 容뽴?곤옙 ??좑옙 ?屍귩쪟?
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
                // 獄ㅿ옙?獄??蒻낉옙?占??덂틬 ??믣돰 獄삣콪占?
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

    // 1. 모든 STALE 또는 Refined(PAUSED_HITL) 노드들 조회
    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND (node_state = 'PAUSED_HITL' OR node_state = 'STALE')"
    )
    .bind(&project_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for node in nodes {
        // 현재 생성된 최신 이터레이션(가장 마지막 피드백 반영본) 조회
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

        // 새 이터레이션을 통과 상태로 설정
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

    // 2. ?占쏙옙??틶???縕뀐옙??容뺧옙???獄????쬃?킒???끾뵸 (?占쏙옙??
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

