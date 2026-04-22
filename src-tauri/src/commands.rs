use serde::{Deserialize, Serialize};
use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Manager, Emitter, State};
use sqlx::{SqlitePool, FromRow, Row};
use json_patch::{patch, PatchOperation};
use serde_json::Value;
use crate::ActiveTasks;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum NodeState {
    Pending,
    Ready,
    InProgress,
    Completed,
    PausedHitl,
    PausedApiError,
    PausedStopped,
    Refining,
}

impl ToString for NodeState {
    fn to_string(&self) -> String {
        match self {
            NodeState::Pending => "PENDING".to_string(),
            NodeState::Ready => "READY".to_string(),
            NodeState::InProgress => "IN_PROGRESS".to_string(),
            NodeState::Completed => "COMPLETED".to_string(),
            NodeState::PausedHitl => "PAUSED_HITL".to_string(),
            NodeState::PausedApiError => "PAUSED_API_ERROR".to_string(),
            NodeState::PausedStopped => "PAUSED_STOPPED".to_string(),
            NodeState::Refining => "REFINING".to_string(),
        }
    }
}

#[derive(Debug)]
pub enum PipelineError {
    ApiError(u16, String),
    Internal(String),
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct Project {
    pub project_id: String,
    pub session_id: String,
    pub project_name: String,
    pub pipeline_execution_mode: String,
    pub pipeline_phase: String,
    pub raw_input_text: String,
    #[sqlx(default)]
    pub increment_intent: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(default)]
    pub current_node_type: Option<String>,
    #[sqlx(default)]
    pub is_indexed: bool,
    #[sqlx(default)]
    pub needs_indexing: bool,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct DocumentNode {
    pub node_id: String,
    pub project_id: String,
    #[sqlx(default)]
    pub module_id: Option<String>,
    pub target_node_type: String,
    #[sqlx(default)]
    pub node_category: String,
    pub node_state: String,
    pub current_iteration: i32,
    pub max_iterations: i32,
    pub threshold_score: i32,
    pub current_best_score: i32,
    pub api_error_code: Option<i32>,
    pub api_error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(default)]
    pub last_action: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct GenerationIteration {
    pub iteration_id: String,
    pub node_id: String,
    pub iteration_number: i32,
    pub generated_draft_json: String,
    pub calculated_score: Option<i32>,
    pub is_pass: Option<bool>,
    pub critical_errors_array: Option<String>,
    pub actionable_feedback_text: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct RagErrorInfo {
    pub project_id: String,
    pub node_id: String,
    pub node_type: String,
    pub error_message: String,
}

// ============================================================
// v2 ??囹긺쭛?삯벽?
// ============================================================

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct GlobalContext {
    pub context_id: String,
    pub project_id: String,
    pub iteration_id: Option<String>,
    pub context_type: String,
    pub context_data_json: String,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct LocalModule {
    pub module_id: String,
    pub project_id: String,
    pub module_name: String,
    pub module_description: Option<String>,
    pub core_responsibility: Option<String>,
    pub mapped_epics: Option<String>,
    pub dependency_spec: Option<String>,
    pub priority_order: i32,
    pub module_state: String,
    pub display_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

// EvaluationResult is now imported from crate::schemas

#[tauri::command]
pub async fn get_project_nodes(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<Vec<DocumentNode>, String> {
    // [??? ?╊겘占? 辱뷂옙占썼쳺?100%?蘊덀ゲ ?占쏙옙??? ?劑눂? 獄덂댖占???占쏙옙辱뷂옙 ?屍귩쪟?獄?縕먩른占?
    let modules = sqlx::query_as::<_, LocalModule>(
        "SELECT * FROM local_module WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    for m in modules {
        if m.module_state != "COMPLETED" {
            // ?制？蜈??墉?르占?獄?縕먩른占?(emit?占?fetch ??玉붺쭜占???獄???껃쵋 令덌옙??
            let _ = sync_module_completion_status(&*pool, None, &m.module_id).await;
        }
    }

    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at ASC"
    )
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(nodes)
}

#[tauri::command]
pub async fn get_node_iterations(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
) -> Result<Vec<GenerationIteration>, String> {
    let iterations = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number ASC"
    )
    .bind(node_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(iterations)
}

#[tauri::command]
pub async fn get_latest_iteration(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
) -> Result<Option<GenerationIteration>, String> {
    let iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
    )
    .bind(node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(iteration)
}

#[tauri::command]
pub async fn validate_api_key(api_key: String) -> Result<bool, String> {
    let client = Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let response = client.get(&url).send().await.map_err(|e: reqwest::Error| e.to_string())?;

    if response.status().is_success() {
        Ok(true)
    } else {
        let status = response.status();
        let error_body: serde_json::Value = response.json().await.map_err(|e: reqwest::Error| e.to_string())?;
        let message = error_body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error")
            .to_string();
        Err(format!("API Key Validation Failed ({}): {}", status, message))
    }
}

#[tauri::command]
pub async fn save_api_key(
    pool: tauri::State<'_, SqlitePool>,
    api_key: String,
) -> Result<(), String> {
    let session_id = "default-session";
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO user_session (session_id, api_key_encrypted, is_api_key_valid, created_at, updated_at, is_deleted) 
         VALUES (?, ?, 1, ?, ?, 0)
         ON CONFLICT(session_id) DO UPDATE SET 
            api_key_encrypted = excluded.api_key_encrypted,
            is_api_key_valid = 1,
            updated_at = excluded.updated_at"
    )
    .bind(session_id)
    .bind(api_key)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// ?野?옙 ?蘊덌옙 ?占?占쏙옙 ?野?쪟??is_pass=1) 令덌옙??容뽴?곤옙 ?歷ｏ옙?占쏜쬃??囹뜹쐦?껇쳺?令덌옙?蘊꾭젅???燁믡?
async fn get_approved_node_output(pool: &SqlitePool, project_id: &str, node_type: &str) -> String {
    let res = sqlx::query(
        "SELECT generated_draft_json FROM generation_iteration 
         WHERE node_id = (SELECT node_id FROM document_node WHERE project_id = ? AND target_node_type = ?) 
         AND is_pass = 1 AND is_deleted = 0 
         ORDER BY created_at DESC LIMIT 1"
    )
    .bind(project_id)
    .bind(node_type)
    .fetch_optional(pool)
    .await;

    match res {
        Ok(Some(row)) => row.get::<String, _>("generated_draft_json"),
        _ => "{}".to_string(),
    }
}

/// v2: GPRD 3??뤄옙(1-A, 1-B, 1-C)??獄덂댖占??野?쪟???歷ι뭘??令덌옙?蘊? ??わ옙??令덂릸?쇠ア?縕먳짉숃쪛???ㄹ?獄삣콪占??섓옙??
async fn get_full_approved_prd(pool: &SqlitePool, project_id: &str) -> String {
    use crate::schemas::*;

    let out_1a = get_approved_node_output(pool, project_id, "GPRD_Context_Goal").await;
    let out_1b = get_approved_node_output(pool, project_id, "GPRD_Capability_Actor").await;
    let out_1c = get_approved_node_output(pool, project_id, "GPRD_Architecture_Schema").await;

    let res_1a: Result<GprdContextGoalSchema, _> = serde_json::from_str(&out_1a);
    let res_1b: Result<GprdCapabilityActorSchema, _> = serde_json::from_str(&out_1b);
    let res_1c: Result<GprdArchitectureSchema, _> = serde_json::from_str(&out_1c);

    // ???옙 ?縕뀐옙??墉?르占? 獄ㅵ돋???占쏙옙??囹긺쭛?삭ア??葯멥삖??蘊깍옙??鴉뺧옙??덂틬 囹긺┷占??Genesis_PRD ??곧쫱??蘊덌옙) ?蒻낉옙
    if res_1a.is_err() || res_1b.is_err() || res_1c.is_err() {
        let legacy = get_approved_node_output(pool, project_id, "Genesis_PRD").await;
        if legacy != "{}" {
            return legacy;
        }
        // 獄덂댖占???낂쇃令덌옙 ?占쏙옙 囹띈땃容?壅?令덂릸??獄삣콪占?
        if res_1a.is_err() && res_1b.is_err() && res_1c.is_err() {
            return "{}".to_string();
        }
    }

    // ??잟쬃??? ??わ옙?逆븝옙 ?占쏜졊삭グ?邀썲쐣黎??帝같占?
    let s1a = res_1a.unwrap_or_else(|_| GprdContextGoalSchema {
        metadata: GenesisPrdMetadata {
            project_name: "Unknown".to_string(),
            version: "1.0.0".to_string(),
            generated_at: Utc::now().to_rfc3339(),
            status: "DRAFT".to_string(),
        },
        product_vision: "".to_string(),
        target_market: "".to_string(),
        success_metrics: vec![],
        global_constraints: GprdGlobalConstraints { compliance: vec![], performance: vec![], legacy_integrations: vec![] },
    });
    let s1b = res_1b.unwrap_or_else(|_| GprdCapabilityActorSchema { actors: vec![], core_epics: vec![] });
    let s1c = res_1c.unwrap_or_else(|_| GprdArchitectureSchema { user_roles: vec![], tech_stack: GenesisPrdTechStack {
        frontend: GenesisPrdFrontend { framework: "REACT".to_string(), state_management: "ZUSTAND".to_string(), ui_library: None },
        backend: GenesisPrdBackend { runtime: "NODE_JS".to_string(), framework: "EXPRESS".to_string(), language_version: None },
        database: GenesisPrdDatabase { primary: "POSTGRESQL".to_string(), vector_db: "PINECONE".to_string(), caching: None },
        infrastructure: GenesisPrdInfrastructure { platform: "AWS".to_string(), containerization: "DOCKER".to_string(), ci_cd_tool: None },
        ai_model_spec: GenesisPrdAiModelSpec { model_family: "GEMINI".to_string(), version: "1.5 Pro".to_string(), temperature: Some(0.7) },
        interface_protocols: GenesisPrdInterfaceProtocols { api_type: "REST".to_string(), auth_protocol: "JWT".to_string() },
    }});

    // 1-C 影ｅ쐣占?Role Name -> ID 獄?囹긺쭛占?
    let mut role_map = std::collections::HashMap::new();
    for role in &s1c.user_roles {
        role_map.insert(role.role_name.clone(), role.role_id.clone());
    }

    // Epics 縕먲옙??(required_actors -> target_roles)
    let finalized_epics = s1b.core_epics.into_iter().map(|e| {
        let target_roles = e.required_actors.iter()
            .map(|name| role_map.get(name).cloned().unwrap_or_else(|| format!("ROLE-UNKNOWN-{}", name)))
            .collect();

        GenesisPrdEpic {
            epic_id: e.epic_id,
            title: e.title,
            description: e.description,
            target_roles,
            acceptance_criteria: Some(e.acceptance_criteria),
        }
    }).collect();

    let final_prd = GenesisPrdSchema {
        metadata: s1a.metadata,
        business_context: GenesisPrdBusinessContext {
            product_vision: s1a.product_vision,
            target_market: s1a.target_market,
            success_metrics: s1a.success_metrics,
        },
        user_roles: s1c.user_roles,
        core_epics: finalized_epics,
        global_constraints: GenesisPrdGlobalConstraints {
            compliance: s1a.global_constraints.compliance,
            performance: s1a.global_constraints.performance,
            legacy_integrations: Some(s1a.global_constraints.legacy_integrations),
        },
        tech_stack: s1c.tech_stack,
    };

    serde_json::to_string(&final_prd).unwrap_or_else(|_| "{}".to_string())
}

#[tauri::command]
pub async fn get_project(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<Project, String> {
    let project = sqlx::query_as::<_, Project>(
        "SELECT 
            p.*,
            (SELECT COUNT(*) FROM embedding_metadata WHERE project_id = p.project_id) > 0 as is_indexed,
            (
                (SELECT COUNT(*) FROM embedding_metadata WHERE project_id = p.project_id) = 0
                OR
                EXISTS (
                    SELECT 1 FROM document_node dn
                    WHERE dn.project_id = p.project_id 
                    AND dn.node_state = 'COMPLETED'
                    AND dn.updated_at > (
                        SELECT COALESCE(MAX(created_at), '1970-01-01') 
                        FROM embedding_metadata 
                        WHERE project_id = p.project_id
                    )
                )
            ) as needs_indexing
         FROM project p 
         WHERE p.project_id = ? AND p.is_deleted = 0"
    )
    .bind(project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    Ok(project)
}

#[tauri::command]
pub async fn list_projects(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<Project>, String> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT 
            p.project_id, 
            p.session_id, 
            p.project_name, 
            p.pipeline_execution_mode, 
            p.pipeline_phase,
            p.raw_input_text, 
            p.increment_intent,
            p.created_at, 
            p.updated_at,
            (SELECT GROUP_CONCAT(target_node_type, ', ') 
             FROM (
                SELECT target_node_type 
                FROM document_node 
                WHERE project_id = p.project_id 
                  AND node_state IN ('READY', 'IN_PROGRESS', 'PAUSED_HITL', 'PAUSED_API_ERROR') 
                ORDER BY created_at ASC 
                LIMIT 2
             )) as current_node_type
         FROM project p 
         WHERE p.is_deleted = 0 
         ORDER BY p.created_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(projects)
}

#[tauri::command]
pub async fn create_project(
    pool: tauri::State<'_, SqlitePool>,
    name: String,
    mode: String,
    input_text: String,
) -> Result<String, String> {
    let project_id = Uuid::new_v4().to_string();
    let session_id = "default-session"; 
    let now = Utc::now().to_rfc3339();

    // 0. 影ｅ쐣???蘊꾬옙 ?屍귩쪟?獄???뽳옙 (FK ?帝같??邀썲쐦??容뷸떀짠)
    sqlx::query(
        "INSERT INTO user_session (session_id, is_api_key_valid, created_at, updated_at, is_deleted) 
         VALUES (?, 1, ?, ?, 0)
         ON CONFLICT(session_id) DO UPDATE SET updated_at = excluded.updated_at"
    )
    .bind(session_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1. ?占쏙옙??틶????뽳옙 (v2: pipeline_phase ?燁믮쪡?
    sqlx::query(
        "INSERT INTO project (project_id, session_id, project_name, pipeline_execution_mode, pipeline_phase, raw_input_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, 'GENESIS_PRD', ?, ?, ?, 0)"
    )
    .bind(&project_id)
    .bind(session_id)
    .bind(name)
    .bind(mode)
    .bind(input_text)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2. v2 令덍쮥껆틨: Genesis PRD獄?3令덍?곤옙 ?蒻낉옙 ?蘊덌옙獄?蘊깍옙占???뽳옙
    let now = Utc::now().to_rfc3339();
    
    // 1-A: Context & Goal Builder (READY)
    let node_id_1a = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'GPRD_Context_Goal', 'GENESIS', 'READY', 0, 10, 85, 0, ?, ?, 0)"
    )
    .bind(node_id_1a)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1-B: Capability & Actor Brainstormer (PENDING)
    let node_id_1b = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'GPRD_Capability_Actor', 'GENESIS', 'PENDING', 0, 10, 85, 0, ?, ?, 0)"
    )
    .bind(node_id_1b)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1-C: Architecture & Schema Assembler (PENDING)
    let node_id_1c = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'GPRD_Architecture_Schema', 'GENESIS', 'PENDING', 0, 10, 85, 0, ?, ?, 0)"
    )
    .bind(node_id_1c)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(project_id)
}

#[tauri::command]
pub async fn delete_project(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<(), String> {
    println!(">>> Hard deleting project and all associated data: {}", project_id);
    
    // 1. 縕믠댃占???잟쬃????占?(virtual table??document_embeddings 獄잍쉼? 墉?겒??
    // rowid令덌옙 embedding_metadata?占??邕롨맻?塋억옙???占썲컧獄?옙獄??蒻낉옙?닸스???帝같埇?
    sqlx::query("DELETE FROM document_embeddings WHERE rowid IN (SELECT rowid FROM embedding_metadata WHERE project_id = ?)")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete vector embeddings: {}", e))?;

    sqlx::query("DELETE FROM embedding_metadata WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete embedding metadata: {}", e))?;

    // 2. ?占쏙옙 囹뜹쐦?껇ァ??歷ｏ옙?占쏜쬃?? ??占?- ?蘊덌옙 ?葯모쬃?납劑칳??邀썲윜劑샃 ?占쏙옙
    sqlx::query("DELETE FROM generation_iteration WHERE node_id IN (SELECT node_id FROM document_node WHERE project_id = ?)")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete generation iterations: {}", e))?;

    // 3. ???옙 ??뱄옙 ??占?(?蘊덌옙, 獄덂댖占? ?℡댃占?轝졽궩)
    sqlx::query("DELETE FROM document_node WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete document nodes: {}", e))?;

    sqlx::query("DELETE FROM local_module WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete local modules: {}", e))?;

    sqlx::query("DELETE FROM global_context WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete global contexts: {}", e))?;

    // 4. 容뽴?곤옙 ?占쏙옙??틶??縕먫퀎????占?(Hard Delete)
    sqlx::query("DELETE FROM project WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to hard delete project: {}", e))?;

    println!(">>> Project {} and all related data purged successfully.", project_id);
    Ok(())
}

#[tauri::command]
pub async fn run_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    node_type: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> run_pipeline started for project: {}, node: {}", project_id, node_type);

    // 1. ?蘊덌옙 ??낂쇃 邀썲쟿占?
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = ?"
    )
    .bind(&project_id)
    .bind(&node_type)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    // 辱쀧궍???轝좑옙 墉?르占?
    {
        let mut tasks = active_tasks.0.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&node.node_id) {
            println!(">>> [ABORT] Node is already running: {}", node.node_id);
            return Err("?歷? ?占쏙옙?蘊꾣벆令덌옙 辱뷂옙占?辱쀰、억옙?占쏜졊? (ActiveTask Detect)".to_string());
        }
        tasks.insert(node.node_id.clone());
    }

    // RAII 令덌옙????뽳옙
    struct TaskGuard {
        tasks: Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
        node_id: String,
    }
    impl Drop for TaskGuard {
        fn drop(&mut self) {
            if let Ok(mut t) = self.tasks.lock() {
                t.remove(&self.node_id);
            }
        }
    }
    let _guard = TaskGuard { tasks: active_tasks.0.clone(), node_id: node.node_id.clone() };

    if node.node_state != "READY" && node.node_state != "PAUSED_HITL" && node.node_state != "PAUSED_API_ERROR" && node.node_state != "PAUSED_STOPPED" && node.node_state != "COMPLETED" && node.node_state != "STALE" {
          return Err("?占쏙옙 ?占쏙옙??좑옙???轝좑옙?????占쏜졐?占쏜졊? (READY, PAUSED_HITL, PAUSED_API_ERROR, PAUSED_STOPPED ??믭옙 COMPLETED ?占쏙옙)".to_string());
    }

    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // 2. ?占쏙옙 ?占썬ゲ?歷ｄ궩: IN_PROGRESS
    sqlx::query(
        "UPDATE document_node SET node_state = 'IN_PROGRESS', api_error_message = NULL, updated_at = ? WHERE node_id = ?"
    )
    .bind(Utc::now().to_rfc3339())
    .bind(&node.node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let client = Client::new();
    let max_iters = node.max_iterations;
    let threshold = node.threshold_score;
    let mut current_best_content = String::new();
    let mut current_best_score = node.current_best_score;
    let mut final_iteration_count = node.current_iteration;

    // 2.5 [RETRY] ?歷ο옙 ?葯면━ ??낂쇃 令덌옙?蘊꾭젅붺??(?℡댃占?轝졽궩 ?劑뵳?)
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut previous_draft = String::new();
    let mut previous_feedback: Vec<String> = Vec::new();
    let mut loop_error: Option<PipelineError> = None;

    if let Some(it) = latest_iter {
        println!(">>> Resuming from previous iteration context (Node: {})", node_type);
        previous_draft = it.generated_draft_json;
        
        // ?逆븝옙獄?縕먫썦占?(???옙 ?縕뀐옙?? String vs EvaluationIssue)
        if let Some(errors_json) = it.critical_errors_array {
            if let Ok(issues) = serde_json::from_str::<Vec<crate::schemas::EvaluationIssue>>(&errors_json) {
                for issue in issues {
                    previous_feedback.push(format!("[?占쏙옙: {}] {} : {}", issue.location, issue.code, issue.description));
                }
            } else if let Ok(errors) = serde_json::from_str::<Vec<String>>(&errors_json) {
                // 囹긺┷占???縕뀐옙
                previous_feedback.extend(errors);
            }
        }
        if let Some(action_json) = it.actionable_feedback_text {
            if let Ok(issues) = serde_json::from_str::<Vec<crate::schemas::EvaluationIssue>>(&action_json) {
                for issue in issues {
                    previous_feedback.push(format!("[縕먩퉲占??占쏙옙 - ?占쏙옙: {}] {} : {}", issue.location, issue.code, issue.description));
                }
            } else if let Ok(feedback) = serde_json::from_str::<Vec<String>>(&action_json) {
                // 囹긺┷占???縕뀐옙
                for f in feedback {
                    previous_feedback.push(format!("縕먩퉲占??占쏙옙: {}", f));
                }
            }
        }
    }

    let start_iter = node.current_iteration + 1;
    for i in start_iter..=max_iters {
        final_iteration_count = i;
        println!(">>> Iteration {}/{} starting for {}", i, max_iters, node_type);
        let _ = app_handle.emit("pipeline-status", format!("{} ??뽳옙 辱?(獄삡겒??{}/{})", node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("獄↑퀎占???뽳옙 辱?..").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let draft_res = generate_draft(&app_handle, &pool, &client, &api_key, &project.project_id, &node_type, &project.raw_input_text, &previous_draft, &previous_feedback, i, vec![]).await;
        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        // [STOP CHECK] AI ?蘊꾬옙 ??辱쀧궍靜? 墉?르占?
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Pipeline stopped manually after generation (Node: {})", node.node_id);
            break;
        }

        println!(">>> Iteration {}: Draft generated, evaluating...", i);
        let _ = app_handle.emit("pipeline-status", format!("{} ?占쏙옙 囹띰옙辱?辱?(獄삡겒??{}/{})", node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("?占쏙옙 囹띰옙辱?辱?..").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let input_text_for_eval = if node_type == "Genesis_PRD" { Some(project.raw_input_text.clone()) } else { None };
        let empty_feedback = Vec::new(); // run_pipeline??좑옙??令덂텈占??逆븝옙獄?容뷰눢占??????獄?壅?令??占쏜줎?
        let eval_res = evaluate_draft(&app_handle, &pool, &client, &api_key, &project.project_id, &node_type, &draft, input_text_for_eval, "", "", &empty_feedback, i, vec![]).await;
        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        // [STOP CHECK] ??? ??獄??占??辱뷂옙占?辱쀧궍靜? 墉?르占?
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Pipeline stopped manually before save (Node: {})", node.node_id);
            break;
        }

        // D. 囹뜹쐦??DB 影ｅ쐣占?(ERD 辱쀯옙??
        let iter_id = Uuid::new_v4().to_string();
        let errors_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();
        let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();
        
        // [影ｅ쐦占????믮죫] ??좑옙?占??╊겒占????덌옙 ?堤솘??쳺?影ｅ쐣占?逆븝옙 ??쏃쟽 ?獵? 囹뜹윜占?
        let is_passed = eval.score >= threshold && eval.critical_errors.is_empty();

        // [容븟??] 辱쀧궍???屍귨옙 獄삥떀?: ?歷좑옙 ?葯면━令덌옙 ??쏃쟽 影ｅ윜???獄ㅵ돋짠??ゅ틬 影ｅ윜???屍귨옙 ?占쏙옙??容뺧옙???
        if is_passed {
            let _ = sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await;
        }

        sqlx::query(
            "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
        )
        .bind(iter_id)
        .bind(&node.node_id)
        .bind(i)
        .bind(&draft)
        .bind(eval.score)
        .bind(is_passed)
        .bind(errors_json)
        .bind(feedback_json)
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        // 獄닷댃占??歷ο옙????⑨옙令?辱뷂옙占썼쳺?DB ?占썬ゲ?歷ｄ궩 獄??歷좂븼??獄삽?곤옙
        sqlx::query(
            "UPDATE document_node SET current_iteration = ?, updated_at = ? WHERE node_id = ?"
        )
        .bind(i)
        .bind(Utc::now().to_rfc3339())
        .bind(&node.node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());

        if eval.score >= current_best_score {
            current_best_score = eval.score;
            current_best_content = draft.clone();
        }

        println!(">>> Iteration {}: Score = {}, Pass = {}", i, eval.score, eval.is_pass);
        
        // ??⑨옙 ?葯면━ ?逆븝옙獄?獄삡겘占???占썬윸 獄닷댃占????逆븝옙獄?邀썲쟿蜈?
        previous_draft = draft;
        previous_feedback.clear();
        for issue in &eval.critical_errors {
            previous_feedback.push(format!("[?占쏙옙: {}] {} : {}", issue.location, issue.code, issue.description));
        }
        for issue in &eval.feedback {
            previous_feedback.push(format!("[縕먩퉲占??占쏙옙 - ?占쏙옙: {}] {} : {}", issue.location, issue.code, issue.description));
        }
    }

    // 獄닷댃占?饒덌옙占??? ?屍? ?占쏙옙?蘊? ??⑨옙 ?屍귩쪟?(PAUSED_STOPPED ?占쏙옙 ??弟릎??뗨맻 獄삥떀?)
    if is_node_stopped(&pool, &node.node_id).await {
        println!(">>> Pipeline loop for node {} terminated due to manual stop signal.", node.node_id);
        return Ok(current_best_content);
    }

    // 4. ?占쏙옙 囹뜹윜占?獄??占썬ゲ?歷ｄ궩
    let final_state = if let Some(e) = loop_error {
        match e {
            PipelineError::ApiError(code, msg) => {
                sqlx::query(
                    "UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?"
                )
                .bind(code as i32)
                .bind(&msg)
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
                return Err(format!("API Error ({}): {}", code, msg));
            },
            PipelineError::Internal(msg) => {
                sqlx::query(
                    "UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?"
                )
                .bind(500)
                .bind(&msg)
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
                return Err(msg);
            }
        }
    } else if node_type.starts_with("GPRD_") || node_type == "Genesis_PRD" || current_best_score < threshold {
        NodeState::PausedHitl
    } else {
        NodeState::Completed
    };

    sqlx::query(
        "UPDATE document_node SET node_state = ?, current_iteration = ?, current_best_score = ?, updated_at = ? WHERE node_id = ?"
    )
    .bind(final_state.to_string())
    .bind(final_iteration_count)
    .bind(current_best_score)
    .bind(Utc::now().to_rfc3339())
    .bind(&node.node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 5. [辱쀰、억옙] ?占쏙옙??囹띈땃容??믭옙 DAG ?占쏜쬃?墉?겒??
    if final_state == NodeState::Completed {
        // [RAG] ?占쏙옙????잞옙獄→쉼占?縕믠댃占?DB???占쏙옙???占??
        let best_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
        if let Some(iter) = best_iter {
            if node.node_category != "GENESIS" {
                let _ = app_handle.emit("pipeline-status", "RAG ?占쏙옙??辱?..");
                sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                    .bind("RAG ?占쏙옙??辱?..")
                    .bind(Utc::now().to_rfc3339())
                    .bind(&node.node_id)
                    .execute(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
                let _ = app_handle.emit("nodes-updated", ());

                let embedding_res = store_document_embeddings(
                    &*pool, &client, &api_key,
                    &project_id, None,
                    &node.node_id, &node_type,
                    &iter.iteration_id, &iter.generated_draft_json,
                    iter.calculated_score.unwrap_or(0),
                ).await;

                match embedding_res {
                    Ok(_) => {
                        let _ = app_handle.emit("pipeline-status", "RAG ?占쏙옙???占쏙옙");
                    },
                    Err(e) => {
                        let err_msg = format!("RAG ?占쏙옙???轝좒쨺?({}): {}", node_type, e);
                        println!(">>> [RAG] {}", err_msg);
                        
                        let error_info = RagErrorInfo {
                            project_id: project_id.clone(),
                            node_id: node.node_id.clone(),
                            node_type: node_type.clone(),
                            error_message: e.to_string(),
                        };
                        let _ = app_handle.emit("rag-error", error_info);
                    }
                }

                let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                    .bind(Utc::now().to_rfc3339())
                    .bind(&node.node_id)
                    .execute(&*pool)
                    .await;
                let _ = app_handle.emit("nodes-updated", ());
            }
        }

        trigger_next_nodes(app_handle, &project_id, &node_type).await?;
    }

    Ok(current_best_content)
}

#[tauri::command]
pub async fn update_node_max_iterations(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    max_iterations: i32,
) -> Result<(), String> {
    println!(">>> Updating max_iterations to {} for node: {}", max_iterations, node_id);
    sqlx::query(
        "UPDATE document_node SET max_iterations = ?, updated_at = ? WHERE node_id = ?"
    )
    .bind(max_iterations)
    .bind(Utc::now().to_rfc3339())
    .bind(node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn handle_hitl_action(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    action: String,
    app_handle: tauri::AppHandle,
    api_key: Option<String>,
) -> Result<(), String> {
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    match action.as_str() {
        "APPROVE" => {
            // UI 승인 액션 완료 후 즉시 DB 상태 반영 및 COMPLETED로 변경
            sqlx::query(
                "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
            )
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            let _ = app_handle.emit("nodes-updated", ());

            // RAG 임베딩 등 백그라운드 작업 시작
            let pool_clone = pool.inner().clone();
            let app_handle_clone = app_handle.clone();
            let node_id_clone = node_id.clone();
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
                        println!(">>> [RAG-BG] Failed to get API key (passed was empty, DB was empty/failed)");
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

                    // [RAG] GENESIS ??르占썹じ堤솘???令덂텈占??蘊덌옙 ??ｐ쪟????껃쵋??섓옙 容뽴?곤옙 ???쪛 ?帝같占????縕믭옙占??掠욑옙??
                    if node_category_for_bg != "GENESIS" {
                        let _ = app_handle_clone.emit("pipeline-status", "RAG ?占쏙옙??辱?..");
                        let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                            .bind("RAG ?占쏙옙??辱?..")
                            .bind(Utc::now().to_rfc3339())
                            .bind(&node_id_clone)
                            .execute(&pool_clone)
                            .await;
                        let _ = app_handle_clone.emit("nodes-updated", ());

                        let embedding_res = store_document_embeddings(
                            &pool_clone, &*client, &final_api_key,
                            &project_id_clone, module_id_clone.as_deref(),
                            &node_id_clone, &node_type_clone,
                            &iter.iteration_id, &iter.generated_draft_json,
                            iter.calculated_score.unwrap_or(0),
                        ).await;

                        match embedding_res {
                            Ok(_) => {
                                let _ = app_handle_clone.emit("pipeline-status", "RAG ?占쏙옙???占쏙옙");
                            },
                            Err(e) => {
                                embedding_success = false;
                                let err_msg = format!("RAG ?占쏙옙???轝좒쨺?({}): {}", node_type_clone, e);
                                println!(">>> [RAG-BG] {}", err_msg);
                                
                                let error_info = RagErrorInfo {
                                    project_id: project_id_clone.clone(),
                                    node_id: node_id_clone.clone(),
                                    node_type: node_type_clone.clone(),
                                    error_message: e.to_string(),
                                };
                                let _ = app_handle_clone.emit("rag-error", error_info);
                            }
                        }

                        // RAG ?靜♥占?饒덌옙占????占쏙옙 容뺧옙???(Live Activity ?帝걟????섓옙)
                        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                            .bind(Utc::now().to_rfc3339())
                            .bind(&node_id_clone)
                            .execute(&pool_clone)
                            .await;
                        let _ = app_handle_clone.emit("nodes-updated", ());
                    }

                    // ??ｐ쪟???歟볣솷?占썸렆?? ??ｐ쪟??占?占쏜쬃??占쏙옙 囹띈땃容?GENESIS) ??⑨옙 ?蘊덌옙 ?蘊덃뵸令?
                    if embedding_success {
                        if let Some(mid) = &module_id_clone {
                            let _ = trigger_module_next_nodes(&app_handle_clone, mid, &node_type_clone).await;
                        } else {
                            let _ = trigger_next_nodes(app_handle_clone, &project_id_clone, &node_type_clone).await;
                        }
                    }
                }
            });
        }
        "RETRY" => {
            sqlx::query(
                "UPDATE document_node SET node_state = 'READY', current_iteration = 0, current_best_score = 0, api_error_message = NULL, updated_at = ? WHERE node_id = ?"
            )
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            let _ = app_handle.emit("nodes-updated", ());
        }
        _ => return Err("Invalid action".to_string()),
    }

    Ok(())
}

async fn trigger_next_nodes(app_handle: tauri::AppHandle, project_id: &str, completed_node_type: &str) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    // ?占쏙옙??틶???占썹뼅 獄덌옙占?影ｅ쐣占????뿈??獄??屍귨옙 (?占쏜　??蘊덌옙獄??歷좈컾)
    let next_map = vec![
        ("GPRD_Context_Goal", vec!["GPRD_Capability_Actor"]),
        ("GPRD_Capability_Actor", vec!["GPRD_Architecture_Schema"]),
        ("GPRD_Architecture_Schema", vec!["SAD_Global"]),
        ("SAD_Global", vec!["SAD_Module"]),
        ("Genesis_PRD", vec!["SAD_Global"]),
    ];

    let mut nodes_to_check = Vec::new();
    for (parent, children) in next_map {
        if parent == completed_node_type {
            for child in children {
                nodes_to_check.push(child);
            }
        }
    }

    // 令??占썽쇃 ?蘊덌옙???占??獄덂댖占??靜쪊占?邀썲쐦???容뷸떀짠???옙??? ?屍귩쪟?
    for target in nodes_to_check {
        let prerequisites = match target {
            "GPRD_Capability_Actor" => vec!["GPRD_Context_Goal"],
            "GPRD_Architecture_Schema" => vec!["GPRD_Capability_Actor"],
            "SAD_Global" => {
                if completed_node_type == "Genesis_PRD" {
                    vec!["Genesis_PRD"]
                } else {
                    vec!["GPRD_Architecture_Schema"]
                }
            },
            "SAD_Module" => vec!["SAD_Global"],
            _ => vec![],
        };

        let mut all_done = true;
        for pre in prerequisites {
            let pre_node = sqlx::query_as::<_, DocumentNode>(
                "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = ?"
            )
            .bind(project_id)
            .bind(pre)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(n) = pre_node {
                if n.node_state != "COMPLETED" {
                    all_done = false;
                    break;
                }
            } else {
                all_done = false;
                break;
            }
        }

        if all_done {
            sqlx::query(
                "UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = ? AND node_state = 'PENDING'"
            )
            .bind(Utc::now().to_rfc3339())
            .bind(project_id)
            .bind(target)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn get_prompts_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    #[cfg(debug_assertions)]
    {
        // 令덂텈占???섊?(Debug 壅ю짆묕옙)??좑옙??target ?歷좑옙???ι윝占??玉붺쭛占???占????믧썿 ?葯멩벆 囹띈텫占썼쳺?容뽴?곈뺑????좑옙
        if let Ok(cwd) = std::env::current_dir() {
            let mut current = Some(cwd.as_path());
            while let Some(path) = current {
                let check_paths = vec![
                    path.join("src-tauri").join("prompts"),
                    path.join("prompts"),
                ];
                for p in check_paths {
                    if p.exists() {
                        return p;
                    }
                }
                current = path.parent();
            }
        }
    }

    // ?歷ο옙 ??섊?(Release 壅ю짆묕옙) ??믭옙 ?葯멩벆 囹띈텫占???좑옙 ?轝좒쨺???Tauri 玉붺쭛占??囹띈텫占??燁묌뭘
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let p = resource_dir.join("prompts");
        if p.exists() {
            return p;
        }
    }

    // 容뽴쮥껓옙????ゐ죫
    let fallback = app_handle.path().resource_dir().unwrap_or_default().join("prompts");
    println!(">>> [DEBUG] get_prompts_dir: No prompts directory found. Fallback to: {:?}", fallback);
    fallback
}

async fn generate_draft(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    node_type: &str,
    input_text: &str,
    previous_draft: &str,
    previous_feedback: &Vec<String>,
    iteration: i32,
    _exclude_node_ids: Vec<String>,
) -> Result<String, PipelineError> {
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let prompts_dir = get_prompts_dir(&app_handle);
    
    let common_prompt = std::fs::read_to_string(prompts_dir.join("generator/common.txt")).unwrap_or_else(|e| {
        println!("!!! ERROR loading common schema: {}", e);
        String::new()
    });
    let gen_path = prompts_dir.join("generator").join(format!("{}.txt", node_normalized));
    let mut domain_prompt = std::fs::read_to_string(&gen_path).unwrap_or_else(|e| {
        println!("!!! ERROR loading domain schema at {:?}: {}", gen_path, e);
        String::new()
    });
    
    // v2: GPRD ?蒻낉옙 ?蘊덌옙 ?邕ㅿ옙 縕먲옙??辱ζ쉼占?
    if node_type.starts_with("GPRD_") {
        domain_prompt = domain_prompt.replace("{{RAW_INPUT}}", input_text);
        
        if node_type == "GPRD_Capability_Actor" || node_type == "GPRD_Architecture_Schema" {
            let approved_1a = get_approved_node_output(pool, project_id, "GPRD_Context_Goal").await;
            domain_prompt = domain_prompt.replace("{{APPROVED_1A}}", &approved_1a);
        }
        
        if node_type == "GPRD_Architecture_Schema" {
            let approved_1b = get_approved_node_output(pool, project_id, "GPRD_Capability_Actor").await;
            domain_prompt = domain_prompt.replace("{{APPROVED_1B}}", &approved_1b);
        }

        let feedback_text = if previous_feedback.is_empty() {
            "?占쏙옙".to_string()
        } else {
            previous_feedback.join("\n")
        };
        domain_prompt = domain_prompt.replace("{{EVALUATOR_FEEDBACK}}", &feedback_text);
        domain_prompt = domain_prompt.replace("{{PREVIOUS_DRAFT}}", previous_draft);
    }

    let schema_obj = crate::schemas::get_schema_for_node(&node_normalized);
    
    let combined_sys_prompt = format!("{}\n\n[DOMAIN SPECIFIC RULE]\n{}", common_prompt, domain_prompt);
    println!(">>> System Prompt Loaded! Length: {} chars", combined_sys_prompt.len());
    
    let user_prompt = if node_type.starts_with("GPRD_") {
        // GPRD ?蘊덌옙???占쏙옙???占썩?占썰궩 ?歷ο옙 獄덂댖占?縕먲옙??? 辱ζ쉼占???옙?逆?獄?容뽴?곤옙?帝같占?囹긺┷占??믭옙 ?占쏜줎?
        format!("$DOCUMENT_TYPE: {}\n$ITERATION: {}", node_type, iteration)
    } else {
        let mut up = format!(
            "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}",
            node_type, iteration, input_text
        );

        if !previous_feedback.is_empty() {
            up = format!(
                "{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n$PREVIOUS_DRAFT\n{}",
                up, previous_feedback.join("\n"), previous_draft
            );
        }
        up
    };

    call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await
}

async fn evaluate_draft(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    node_type: &str,
    draft: &str,
    input_text: Option<String>,
    global_context: &str,
    module_context: &str,
    previous_feedback: &Vec<String>,
    iteration: i32,
    _exclude_node_ids: Vec<String>,
) -> Result<crate::schemas::EvaluationResult, PipelineError> {
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let prompts_dir = get_prompts_dir(&app_handle);

    let common_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/common.txt")).unwrap_or_else(|e| {
        println!("!!! ERROR loading common rubric: {}", e);
        String::new()
    });
    let eval_path = prompts_dir.join("evaluator").join(format!("{}.txt", node_normalized));
    let mut domain_rubric = std::fs::read_to_string(&eval_path).unwrap_or_else(|e| {
        println!("!!! ERROR loading domain rubric at {:?}: {}", eval_path, e);
        String::new()
    });

    // v2: GPRD ?蒻낉옙 ?蘊덌옙 獄닷댖占썼쵒?縕먲옙??辱ζ쉼占?
    if node_type.starts_with("GPRD_") {
        if let Some(input) = &input_text {
            domain_rubric = domain_rubric.replace("{{RAW_INPUT}}", input);
        }
        domain_rubric = domain_rubric.replace("{{GENERATED_1A}}", draft);
        domain_rubric = domain_rubric.replace("{{GENERATED_1B}}", draft);
        domain_rubric = domain_rubric.replace("{{GENERATED_1C}}", draft);

        if node_type == "GPRD_Capability_Actor" || node_type == "GPRD_Architecture_Schema" {
            let approved_1a = get_approved_node_output(pool, project_id, "GPRD_Context_Goal").await;
            domain_rubric = domain_rubric.replace("{{APPROVED_1A}}", &approved_1a);
        }
        
        if node_type == "GPRD_Architecture_Schema" {
            let approved_1b = get_approved_node_output(pool, project_id, "GPRD_Capability_Actor").await;
            domain_rubric = domain_rubric.replace("{{APPROVED_1B}}", &approved_1b);
        }
    }
    
    let combined_sys_prompt = format!("$COMMON_RUBRIC\n{}\n\n$DOMAIN_RUBRIC\n{}", common_rubric, domain_rubric);
    println!(">>> Evaluator Prompt Loaded! Length: {} chars", combined_sys_prompt.len());

    let target_schema = crate::schemas::get_schema_for_node(&node_normalized)
        .map(|s| serde_json::to_string_pretty(&s).unwrap_or_default())
        .unwrap_or_else(|| "No schema specification provided for this node type.".to_string());

    let mut user_prompt = format!(
        "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$TARGET_SCHEMA\n{}\n\n$GENERATED_DOCUMENT\n{}",
        node_type, iteration, target_schema, draft
    );

    // [V2.6] $SOURCE_DOCUMENTS: 囹띰옙辱욃릸占?辱뷂옙?뭘 囹멱솠占??SSOT) ??⑨옙
    let mut source_docs = String::new();
    if node_type == "Genesis_PRD" {
        if let Some(original_idea) = input_text {
            source_docs = original_idea;
        }
    } else {
        // 獄덂댖占?獄????옙 ?蘊덌옙: global_context???靜쪊占??蘊덌옙(PRD, FSD, API_Spec ??令덌옙 ?燁믮쪡???㈇??占쏜줎??
        if !global_context.is_empty() {
            source_docs = global_context.to_string();
        }
    }

    if !source_docs.is_empty() {
        user_prompt = format!(
            "{}\n\n$SOURCE_DOCUMENTS\n{}",
            user_prompt, source_docs
        );
    }

    if !module_context.is_empty() {
        user_prompt = format!(
            "{}\n\n$MODULE_CONTEXT\n{}",
            user_prompt, module_context
        );
    }

    if !previous_feedback.is_empty() {
        user_prompt = format!(
            "{}\n\n$EVALUATOR_FEEDBACK\n{}",
            user_prompt, previous_feedback.join("\n")
        );
    }

    let schema_obj = crate::schemas::get_schema_for_node("evaluator");
    let response_text = call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await?;
    
    // JSON 容뷰눢占?(?制？占?塋억옙 容뷴텈占?逆븝옙 ?縕꿔윸 獄사ゾ占??葯멥삖 ?蒻낉옙, Gemini 2.5 Flash Structured Output ?占??
    let json_str = response_text.trim_start_matches("```json").trim_end_matches("```").trim();
    
    let eval: crate::schemas::EvaluationResult = serde_json::from_str(json_str)
        .map_err(|e| PipelineError::Internal(format!("Eval Deserialization Error: {} - Content: {}", e, json_str)))?;

    Ok(eval)
}

async fn call_gemini(client: &Client, api_key: &str, sys_prompt: &str, user_prompt: &str, schema_opt: Option<serde_json::Value>) -> Result<String, PipelineError> {
    let model = "gemini-2.5-flash";
    println!(">>> Calling Gemini API ({})", model);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model,
        api_key
    );

    let mut generation_config = serde_json::json!({
        "temperature": 0.7,
        "topP": 0.95,
        "topK": 40,
        "maxOutputTokens": 65536,
        "responseMimeType": "application/json"
    });

    if let Some(schema) = schema_opt {
        generation_config.as_object_mut().unwrap().insert("responseSchema".to_string(), schema);
    }

    let body = serde_json::json!({
        "system_instruction": { "parts": [{ "text": sys_prompt }] },
        "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
        "generationConfig": generation_config
    });

    let resp = client.post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e: reqwest::Error| PipelineError::Internal(format!("API Request Send Error: {}", e)))?;

    let status = resp.status();
    if !status.is_success() {
        let err_json: serde_json::Value = resp.json().await.unwrap_or_else(|_| serde_json::json!({"error": {"message": "Could not parse error JSON"}}));
        let err_msg = err_json["error"]["message"].as_str().unwrap_or("Unknown Gemini Error");
        println!("!!! Gemini API Error ({}): {}", status, err_msg);
        return Err(PipelineError::ApiError(status.as_u16(), format!("{}: {}", status, err_msg)));
    }

    let result: serde_json::Value = resp.json().await.map_err(|e: reqwest::Error| PipelineError::Internal(e.to_string()))?;
    let raw_text = result["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| PipelineError::Internal("Empty response from Gemini".to_string()))?;

    // 獄ㅿ옙占??⑩쟼?獄삥《??獄?蘊깍옙占?映앾옙 囹멱썯???帝걟??
    let cleaned_text = raw_text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    Ok(cleaned_text.to_string())
}

#[tauri::command]
pub async fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(())
}

// ============================================================
// v2 ???€쐢鸚??
// ============================================================

#[tauri::command]
pub async fn get_project_modules(
    pool: tauri::State<'_, SqlitePool>,
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
pub async fn get_module_nodes(
    pool: tauri::State<'_, SqlitePool>,
    module_id: String,
) -> Result<Vec<DocumentNode>, String> {
    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE module_id = ? AND is_deleted = 0 ORDER BY created_at ASC"
    )
    .bind(module_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(nodes)
}

#[tauri::command]
pub async fn get_global_contexts(
    pool: tauri::State<'_, SqlitePool>,
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

/// Genesis PRD ?葯모쬃?占쏜쫱?? 影ｅ윜??run_pipeline囹??邕ㆀ쫱??Best-of-N 獄닷댃占??燁묌뭘
#[tauri::command]
pub async fn run_genesis_prd_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    // Genesis_PRD ?蘊덌옙獄?影ｅ윜??run_pipeline ?占쏙옙
    run_pipeline(app_handle, pool, active_tasks, project_id, "Genesis_PRD".to_string(), api_key).await
}

/// Genesis PRD HITL ?野?쪟???SAD ???쬃?킒占쏙옙 ?占쏙옙 + SAD ?蘊덌옙 ??뽳옙
#[tauri::command]
pub async fn confirm_genesis_prd_iteration(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Confirming Genesis PRD iteration: {} for project: {}", iteration_id, project_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. ?歷좈컾 ?歷ｏ옙?占쏜쬃???쬃??驛곻옙 ?蘊덌옙??獄덂댖占??歷ｏ옙?占쏜쬃??is_pass 容뺧옙???(??덃뼢 ?轝좑옙?歷? 令덌옙占?獄삥떀?)
    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = (SELECT node_id FROM generation_iteration WHERE iteration_id = ?)")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. ?靜쪊占???歷ｏ옙?占쏜쬃??わ옙 is_pass = 1 ??⑨옙
    sqlx::query("UPDATE generation_iteration SET is_pass = 1, updated_at = ? WHERE iteration_id = ?")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Genesis PRD 令덂텈占??蘊덌옙 ?野?쪟?(SAD?占??邕ㆀ쫱????믭옙 ?帝걟??
#[tauri::command]
pub async fn approve_genesis_prd_node(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving Genesis PRD node: {}, api_key_provided: {}", node_id, api_key.is_some());

    let now = Utc::now().to_rfc3339();

    // 1. ?蘊덌옙 ??낂쇃 邀썲쟿占?(project_id?占?target_node_type ??낂쇃)
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    // 2. ?蘊덌옙 ?占쏙옙獄?COMPLETED獄?縕먲옙囹?
    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
    )
    .bind(&now)
    .bind(&node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. ??⑨옙 ?蘊덌옙 ?蘊덃뵸令?(Stage 1 -> Stage 2 ??
    trigger_next_nodes(app_handle, &node.project_id, &node.target_node_type).await?;

    Ok(())
}

#[tauri::command]
pub async fn approve_genesis_prd(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    app_handle: tauri::AppHandle,
    api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving Genesis PRD for project: {}, api_key_provided: {}", project_id, api_key.is_some());

    let now = Utc::now().to_rfc3339();

    // 1. GPRD_Architecture_Schema (容뽴?곤옙 ??뤄옙) ??믭옙 影ｅ윜??Genesis_PRD ?蘊덌옙獄?COMPLETED獄?縕먲옙囹?
    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type IN ('Genesis_PRD', 'GPRD_Architecture_Schema')"
    )
    .bind(&now)
    .bind(&project_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1.1 ???쪛 PRD ??잟쬃????뽳옙 (1-A + 1-B + 1-C 縕먳짉숃쪛)
    let full_prd = get_full_approved_prd(&*pool, &project_id).await;
    
    // 1.2 容뽴?곤옙 ?蘊덌옙 ??껓옙 (RAG ??뗧썟??
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

    println!(">>> Genesis PRD approved. Shifted to SAD Global phase for project: {}", project_id);
    let _ = app_handle.emit("nodes-updated", ());

    // [縕먲옙囹? RAG ?占쏙옙???占썹???占쏜쬃?辱욃맋占?SAD ??뤄옙獄??占쏙옙 (UI ??ｄ???令덍?곤옙)
    let _ = actual_approve_genesis_prd(&app_handle, &*pool, &project_id).await;

    // RAG ?占쏙옙??獄삥쥞繹?逆곧쟼??墉?겒?? ???쪛縕먫퀎占???곧쫱?獄↑퀎占썼ア???ｐ쪟?
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
            
            // 1. ?蘊꾬옙獄????㈇??????잞옙 ?燁묌뭘, ?占썲컧獄?DB??좑옙 邀썲쟿占?
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
                _ => {
                    println!(">>> [RAG-BG] No API key found in args or DB. Aborting embedding.");
                    return;
                }
            };


            let _ = app_handle_clone.emit("pipeline-status", "???쪛 PRD RAG ?占쏙옙??辱?..");
            let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind("???쪛 RAG ?占쏙옙??辱?..")
                .bind(Utc::now().to_rfc3339())
                .bind(&node_id_clone)
                .execute(&pool_clone)
                .await;
            let _ = app_handle_clone.emit("nodes-updated", ());

            // [??숎줎? get_full_approved_prd 囹뜹쐦?껇ァ?full_prd)????ｐ쪟???ㄹ?辱쀧궍???帝걟??
            let embedding_res = store_document_embeddings(
                &pool_clone, &*client, &api_key_str,

                &project_id_clone, None,
                &node_id_clone, &node_type_clone,
                &iteration_id_clone, &full_prd,
                score,
            ).await;

            match embedding_res {
                Ok(_) => {
                    let _ = app_handle_clone.emit("pipeline-status", "???쪛 PRD ?占쏙옙???占쏙옙");
                    let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                        .bind(Utc::now().to_rfc3339())
                        .bind(&node_id_clone)
                        .execute(&pool_clone)
                        .await;
                    let _ = app_handle_clone.emit("nodes-updated", ());
                },
                Err(e) => {
                    let err_msg = format!("???쪛 PRD RAG ?占쏙옙???轝좒쨺? {}", e);
                    println!(">>> [RAG-BG] {}", err_msg);
                    
                    let error_info = RagErrorInfo {
                        project_id: project_id_clone,
                        node_id: node_id_clone,
                        node_type: node_type_clone,
                        error_message: e.to_string(),
                    };
                    let _ = app_handle_clone.emit("rag-error", error_info);
                    let _ = app_handle_clone.emit("pipeline-status", "???쪛 PRD ?占쏙옙???轝좒쨺?(辱쀧궍靜?)");
                }
            }
        });
    }

    Ok(())
}

/// ??⑨옙 Genesis PRD ?野?쪟?墉?겒??獄??곤옙 (?占쏙옙???歟볣솷 ???蘊꾬옙)
async fn actual_approve_genesis_prd(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    // 1. ?占쏙옙??틶??pipeline_phase獄?SAD獄??占쏙옙
    sqlx::query(
        "UPDATE project SET pipeline_phase = 'SAD', updated_at = ? WHERE project_id = ?"
    )
    .bind(&now)
    .bind(project_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2. SAD 影ｏ옙獄℡텈占??℡댃占?轝졽궩 ?蘊덌옙 ??뽳옙
    let global_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'SAD_Global', 'SAD', 'READY', 0, 5, 80, 0, ?, ?, 0)"
    )
    .bind(global_node_id)
    .bind(project_id)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. SAD 獄덂댖占?蘊깍옙占??蘊덌옙 ??뽳옙 (PENDING ?占쏙옙獄???뽳옙???ㄹ?DAG ?帝굛占?
    let module_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'SAD_Module', 'SAD', 'PENDING', 0, 5, 80, 0, ?, ?, 0)"
    )
    .bind(module_node_id)
    .bind(project_id)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

/// ?劑뵳?令덌옙 ??わ옙?逆븝옙 ??⑨옙 ??뤄옙獄??帝같占??(READY ?占쏙옙獄??占쏙옙)
#[tauri::command]
pub async fn manually_trigger_next_nodes(
    app_handle: tauri::AppHandle,
    project_id: String,
    completed_node_type: String,
) -> Result<(), String> {
    println!(">>> Manually triggering next nodes for: {}", completed_node_type);
    
    // ?占쏙옙 ?蘊덌옙令덌옙 ?驛곻옙 獄덂댖占??占쏜쬃??墉녷㉬??(獄덂댖占??葯모쬃?占쏜쫱???占썽뭘)
    let pool = app_handle.state::<SqlitePool>();
    let node = sqlx::query("SELECT module_id FROM document_node WHERE project_id = ? AND target_node_type = ?")
        .bind(&project_id)
        .bind(&completed_node_type)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = node {
        let module_id: Option<String> = row.get("module_id");
        if let Some(mid) = module_id {
             return trigger_module_next_nodes(&app_handle, &mid, &completed_node_type).await;
        }
    }

    // ?蒻낉옙?帝같??PRD ??믭옙 GPRD 容뽴?곤옙 ?蘊덌옙??囹띈땃容??蒻??占쏜쬃??
    if completed_node_type == "Genesis_PRD" || completed_node_type == "GPRD_Architecture_Schema" {
        return actual_approve_genesis_prd(&app_handle, &*pool, &project_id).await;
    }

    trigger_next_nodes(app_handle, &project_id, &completed_node_type).await
}

/// SAD 影ｏ옙獄℡텈占??℡댃占?轝졽궩 ?葯모쬃?占쏜쫱??
#[tauri::command]
pub async fn run_sad_global_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> SAD Global Pipeline started for project: {}", project_id);
    let client = reqwest::Client::new();

    // SAD_Global ?蘊덌옙 ??낂쇃 邀썲쟿占?(辱쀧궍???轝좑옙 墉?르占??
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Global'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Global node not found".to_string())?;

    // 辱쀧궍???轝좑옙 墉?르占?
    {
        let mut tasks = active_tasks.0.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&sad_node.node_id) {
            println!(">>> [ABORT] Node is already running: {}", sad_node.node_id);
            return Err("?歷? ?占쏙옙?蘊꾣벆令덌옙 辱뷂옙占?辱쀰、억옙?占쏜졊? (ActiveTask Detect)".to_string());
        }
        tasks.insert(sad_node.node_id.clone());
    }

    // RAII 令덌옙????뽳옙
    struct TaskGuard {
        tasks: Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
        node_id: String,
    }
    impl Drop for TaskGuard {
        fn drop(&mut self) {
            if let Ok(mut t) = self.tasks.lock() {
                t.remove(&self.node_id);
            }
        }
    }
    let _guard = TaskGuard { tasks: active_tasks.0.clone(), node_id: sad_node.node_id.clone() };

    let _project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // v2: GPRD 3??뤄옙 ???쪛 ??잟쬃??1-A, 1-B, 1-C)獄?令덌옙?蘊꾤뙋?占쏜졊?
    let genesis_prd_content = get_full_approved_prd(&*pool, &project_id).await;
    
    if genesis_prd_content == "{}" {
        return Err("?屍귨옙??Genesis PRD令덌옙 ?占썸렆?????쪛?????占쏜졐?占쏜졊? PRD ????뤄옙獄?獄잍쉼? ?野?쪟?歷Λ?蘊꾬옙.".to_string());
    }

    // SAD_Global ?蘊덌옙 ?占쏙옙 邀썲쟿占?
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Global'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Global node not found".to_string())?;
    
    if sad_node.node_state != "READY" && sad_node.node_state != "PAUSED_HITL" && sad_node.node_state != "PAUSED_API_ERROR" && sad_node.node_state != "PAUSED_STOPPED" && sad_node.node_state != "COMPLETED" && sad_node.node_state != "STALE" {
        return Err("?占쏙옙 ?占쏙옙??좑옙???轝좑옙?????占쏜졐?占쏜졊?".to_string());
    }

    // ?占쏙옙獄?IN_PROGRESS獄?縕먲옙囹?
    sqlx::query("UPDATE document_node SET node_state = 'IN_PROGRESS', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&sad_node.node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());

    let max_iters = sad_node.max_iterations.max(1);
    let threshold = sad_node.threshold_score;

    let mut current_iter = sad_node.current_iteration;
    let mut is_global_success = false;
    let mut _all_context_json = serde_json::json!({});
    let mut last_error = String::new();
    let mut last_feedback = String::new();

    // [RETRY] ?歷ο옙 ?葯면━ ?逆븝옙獄?獄?容뺧옙占?令덌옙?蘊꾭젅붺??
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&sad_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut initial_stage_context = serde_json::json!({});
    if let Some(it) = latest_iter {
        println!(">>> Resuming SAD Global from previous iteration feedback");
        if let Some(fb) = it.actionable_feedback_text {
             if let Ok(fb_list) = serde_json::from_str::<Vec<String>>(&fb) {
                 last_feedback = fb_list.join("\n");
             }
        }
        if let Ok(prev_bundle) = serde_json::from_str::<serde_json::Value>(&it.generated_draft_json) {
            initial_stage_context = prev_bundle;
        }
    }

    let prompts_dir = get_prompts_dir(&app_handle);
    let common_prompt = std::fs::read_to_string(prompts_dir.join("generator/common.txt")).unwrap_or_else(|_| {
        println!("!!! Failed to load common.txt generator prompt");
        String::new()
    });

    if current_iter >= max_iters && !is_global_success {
        last_error = "容뽩텈? 獄삡겒???悌솆占?Max Iterations)???占쏜줎?占쏜졐?占쏜졊? ??⑨옙??縕먲옙囹띈릊占???悌솆占썼쳺???ゐ㉧백뇰逆곤옙??".to_string();
    }

    // Stage 1: 影ｏ옙獄℡텈占??℡댃占?轝졽궩 5饒???뽳옙 獄???? 獄닷댃占?
    while current_iter < max_iters && !is_global_success {
        current_iter += 1;
        let global_types = vec!["sad_non_tech", "sad_tech_stack", "sad_core_erd", "sad_auth_rbac", "sad_interface_error"];
        // ?歷ο옙 ?葯면━??縕믭옙褶???占쏜졊삭グ?容뺧옙?쇘찄帝찂弱먫ア??燁묌뭘, ?占썲컧獄?壅?令덂릸??
        let mut stage_context_json = initial_stage_context.clone();

        for ctx_type in global_types {
            let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 (Iter {}): {} ??뽳옙 辱?..", current_iter, ctx_type));

            sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind(format!("{} ??뽳옙 辱?..", ctx_type)).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;
            
            // ???뿈????잟쬃??容뷰눢占?
            let dependencies = match ctx_type {
                "sad_non_tech" => vec![],
                "sad_tech_stack" => vec!["sad_non_tech"],
                "sad_core_erd" => vec!["sad_tech_stack"],
                "sad_auth_rbac" => vec!["sad_non_tech", "sad_core_erd"],
                "sad_interface_error" => vec!["sad_tech_stack", "sad_auth_rbac"],
                _ => vec![],
            };

            let mut prev_decisions = serde_json::Map::new();
            for dep in dependencies {
                if let Some(val) = stage_context_json.get(dep) {
                    prev_decisions.insert(dep.to_string(), val.clone());
                }
            }
            let prev_context_str = serde_json::to_string_pretty(&prev_decisions).unwrap_or_else(|_| "{}".to_string());

            let prev_draft_str = if let Some(prev_val) = initial_stage_context.get(ctx_type) {
                serde_json::to_string_pretty(prev_val).unwrap_or_else(|_| "{}".to_string())
            } else {
                "{}".to_string()
            };

            let schema_obj = crate::schemas::get_schema_for_node(ctx_type);
            let resource_path = prompts_dir.join(format!("generator/{}.txt", ctx_type));
            let type_prompt = std::fs::read_to_string(&resource_path).unwrap_or_else(|_| {
                println!("!!! Missing prompt: {:?}", resource_path);
                String::new()
            });

            let sys_prompt = format!("$COMMON_RULES\n{}\n\n$DOMAIN_SPECIFIC_RULE\n{}", common_prompt, type_prompt);
            let user_prompt = format!(
                "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$PREVIOUS_ARCHITECTURAL_DECISIONS\n{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n????낂쇃獄?影ｅ쐣占?逆븝옙 {}??獄? ?靜♥占???쨫?帝같?닎.",
                ctx_type, current_iter, genesis_prd_content, prev_context_str, prev_draft_str, last_feedback, ctx_type
            );

            let result = call_gemini(&client, &api_key, &sys_prompt, &user_prompt, schema_obj).await;
            let part_json = match result {
                Ok(content) => {
                    serde_json::from_str::<serde_json::Value>(&content)
                        .map_err(|e| format!("SAD Part ({}) ?葯멥삖 ??덌옙: {} - ??믧썿: {}", ctx_type, e, content))?
                }
                Err(e) => {
                    let (code, msg) = match e {
                        crate::commands::PipelineError::ApiError(c, m) => (c as i32, m),
                        crate::commands::PipelineError::Internal(m) => (0, m),
                    };
                    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                    .bind(code).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                    .execute(&*pool).await.map_err(|e| e.to_string())?;
                    return Err(format!("SAD Part ({}) ??뽳옙 ??덌옙: {}", ctx_type, msg));
                }
            };

            // ???쪛 令덂릸????擁ｏ옙
            if let Some(obj) = stage_context_json.as_object_mut() {
                obj.insert(ctx_type.to_string(), part_json);
            }

            // [STOP CHECK] 令덂텈占??榕꿜궩 ??뽳옙 ??辱쀧궍靜? 墉?르占?
            if is_node_stopped(&*pool, &sad_node.node_id).await {
                println!(">>> SAD Global stopped manually during part generation ({})", ctx_type);
                return Ok("SAD global stopped manually".to_string());
            }
        }

        // 影ｏ옙獄℡텈占??℡댃占?轝졽궩 ???쪛 ???
        let eval_schema = crate::schemas::get_evaluation_schema();
        let prompts_dir = get_prompts_dir(&app_handle);
        
        let common_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/common.txt")).unwrap_or_else(|_| String::new());
        let eval_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/sad_global.txt")).unwrap_or_default();
        
        let eval_sys_prompt = format!("$COMMON_RUBRIC\n{}\n\n$DOMAIN_RUBRIC\n{}", common_rubric, eval_rubric);
        let eval_user_prompt = format!(
            "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$GENERATED_DOCUMENT\n{}\n\n$EVALUATOR_FEEDBACK\n{}",
            "SAD_Global", current_iter, genesis_prd_content, serde_json::to_string_pretty(&stage_context_json).unwrap_or_default(), last_feedback
        );

        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("???쪛 ?占쏙옙 囹띰옙辱?辱?..").bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let eval_result = call_gemini(&client, &api_key, &eval_sys_prompt, &eval_user_prompt, Some(eval_schema)).await;
        match eval_result {
            Ok(eval_json) => {
                let eval: serde_json::Value = serde_json::from_str(&eval_json).unwrap_or_default();
                let score = eval["score"].as_i64().unwrap_or(0) as i32;
                
                // [影ｅ쐦占????믮죫] AI??is_pass 令덍Ł놅옙 獄→른占??섓옙 獄삥×占?帝같占??辱뷂옙占?囹몌옙占?
                let has_critical_errors = eval["critical_errors"].as_array().map_or(false, |arr| !arr.is_empty());
                let is_passed = score >= threshold && !has_critical_errors;
                
                if is_passed || (current_iter == max_iters) {
                    is_global_success = is_passed;
                    if !is_passed && current_iter == max_iters {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 ?占쏙옙 獄?퀓靜졋?歷좑옙 容뽩텈? ?悌솆占??占쏜줎븃ア?辱쀧궍靜? (??좑옙: {})", score));
                    } else {
                        _all_context_json = stage_context_json.clone();
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 ??쏃쟽 (??좑옙: {})", score));
                    }
                }

                // [?葯면━ ?占?? 獄덂댖占??歷ｏ옙?占쏜쬃??囹뜹쐦?껇쳺??占썸벆?堤솘???葯모쬃?납?뱄옙 ?占??
                let iter_id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();

                let feedback_text = if let Ok(issues) = serde_json::from_value::<Vec<crate::schemas::EvaluationIssue>>(eval["feedback"].clone()) {
                    issues.iter().map(|i| format!("[縕먩퉲占??占쏙옙 - ?占쏙옙: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n")
                } else {
                    eval["feedback"].as_array().map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
                };

                let critical_errors_text = if let Ok(issues) = serde_json::from_value::<Vec<crate::schemas::EvaluationIssue>>(eval["critical_errors"].clone()) {
                    issues.iter().map(|i| format!("[?占쏙옙: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n")
                } else {
                    eval["critical_errors"].as_array().map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
                };

                let feedback_json = serde_json::to_string(&eval["feedback"]).unwrap_or_default();
                let critical_json = serde_json::to_string(&eval["critical_errors"]).unwrap_or_default();

                // ?蘊덌옙??占??帝같占?
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                // [容븟??] 辱쀧궍???屍귨옙 獄삥떀?: ?歷좑옙 ?葯면━令덌옙 ??쏃쟽 影ｅ윜???獄ㅵ돋짠??ゅ틬 ?歷좈컾 ?蘊덌옙??影ｅ윜???屍귨옙 ?占쏙옙??容뺧옙???
                if is_passed {
                    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
                        .bind(&now)
                        .bind(&sad_node.node_id)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }

                sqlx::query(
                    "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&iter_id)
                .bind(&sad_node.node_id)
                .bind(current_iter)
                .bind(stage_context_json.to_string())
                .bind(score)
                .bind(is_passed)
                .bind(&critical_json)
                .bind(&feedback_json)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                // 影ｅ쐦占??蘊깍옙占? 獄??葯면━(Draft ?燁믮쪡???5饒??℡댃占?轝졽궩獄?令덌옙占??占??
                let global_types = vec!["sad_core_erd", "sad_auth_rbac", "sad_interface_error", "sad_tech_stack", "sad_non_tech"];
                for ctx_type in global_types {
                    if let Some(data) = stage_context_json.get(ctx_type) {
                        let ctx_id = Uuid::new_v4().to_string();
                        sqlx::query(
                            "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
                        )
                        .bind(&ctx_id).bind(&project_id).bind(&iter_id).bind(ctx_type).bind(data.to_string()).bind(current_iter).bind(&now).bind(&now)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }

                tx.commit().await.map_err(|e| e.to_string())?;

                // [?逆븝옙獄??占썬ゲ?歷ｄ궩] ??⑨옙 ?葯면━獄??占썬윸 ?逆븝옙獄??占??(辱뷂옙??辱ζ쉼占???鼎퐗???
                last_feedback = feedback_text.clone();
                if !critical_errors_text.is_empty() {
                    last_feedback = format!("{}\n{}", critical_errors_text, last_feedback);
                }

                if !is_global_success {
                    last_error = eval["feedback"].as_str().unwrap_or("?占쏙옙 獄?퀓靜졋").to_string();
                    let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 ?占쏙옙 獄?퀓靜졋 (??좑옙: {}), ?燁묕옙??辱?..", score));
                }
            }
            Err(_) => {
                last_error = "??? 辱???덌옙 獄삽?곤옙".to_string();
            }
        }
    }

    // 獄닷댃占?饒덌옙占??? ?屍? ?占쏙옙?蘊? ??⑨옙 ?屍귩쪟?(PAUSED_STOPPED ?占쏙옙 ??弟릎??뗨맻 獄삥떀?)
    if is_node_stopped(&pool, &sad_node.node_id).await {
        println!(">>> SAD Global Pipeline loop for node {} terminated due to manual stop signal.", sad_node.node_id);
        return Ok("SAD global context pipeline stopped".to_string());
    }

    if !is_global_success {
        // [???옙] ?轝좒쨺??帝같占???歷ｏ옙?占쏜쬃????낂쇃???占썬ゲ?歷ｄ궩
        sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, updated_at = ? WHERE node_id = ?")
            .bind(current_iter)
            .bind(Utc::now().to_rfc3339())
            .bind(&sad_node.node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());
        return Err(format!("SAD 影ｏ옙獄℡텈占??℡댃占?轝졽궩 ??뽳옙 蘊깍옙?: {}", last_error));
    }

    // SAD_Global ?蘊덌옙 ?占쏙옙 墉?겒??獄?SAD_Module ?蘊덌옙 ?帝같占??READY)
    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, current_best_score = 100, updated_at = ? WHERE node_id = ?")
        .bind(current_iter)
        .bind(Utc::now().to_rfc3339())
        .bind(&sad_node.node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module'")
        .bind(Utc::now().to_rfc3339())
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "SAD 影ｏ옙獄℡텈占??℡댃占?轝졽궩 ??뽳옙 ?占쏙옙. 獄덂댖占?蘊깍옙占??蘊덌옙獄??轝좑옙??辱ζ쉼占??");

    Ok("SAD global context pipeline completed".to_string())
}

/// SAD 獄덂댖占?蘊깍옙占??葯모쬃?占쏜쫱??
#[tauri::command]
pub async fn run_sad_module_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    api_key: String,
    target_module_count: Option<i32>,
) -> Result<String, String> {
    println!(">>> SAD Module Split Pipeline started for project: {}, target_count: {:?}", project_id, target_module_count);
    let client = reqwest::Client::new();

    // SAD_Module ?蘊덌옙 ??낂쇃 邀썲쟿占?(辱쀧궍???轝좑옙 墉?르占??
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Module node not found".to_string())?;

    // 辱쀧궍???轝좑옙 墉?르占?
    {
        let mut tasks = active_tasks.0.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&sad_node.node_id) {
            println!(">>> [ABORT] Node is already running: {}", sad_node.node_id);
            return Err("?歷? ?占쏙옙?蘊꾣벆令덌옙 辱뷂옙占?辱쀰、억옙?占쏜졊? (ActiveTask Detect)".to_string());
        }
        tasks.insert(sad_node.node_id.clone());
    }

    // RAII 令덌옙????뽳옙
    struct TaskGuard {
        tasks: Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
        node_id: String,
    }
    impl Drop for TaskGuard {
        fn drop(&mut self) {
            if let Ok(mut t) = self.tasks.lock() {
                t.remove(&self.node_id);
            }
        }
    }
    let _guard = TaskGuard { tasks: active_tasks.0.clone(), node_id: sad_node.node_id.clone() };

    let _project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // v2: GPRD 3??뤄옙 ???쪛 ??잟쬃??1-A, 1-B, 1-C)獄?令덌옙?蘊꾤뙋?占쏜졊?
    let genesis_prd_content = get_full_approved_prd(&*pool, &project_id).await;
    
    if genesis_prd_content == "{}" {
        return Err("?屍귨옙??Genesis PRD令덌옙 ?占썸렆?????쪛?????占쏜졐?占쏜졊? PRD ????뤄옙獄?獄잍쉼? ?野?쪟?歷Λ?蘊꾬옙.".to_string());
    }

    // ????뤄옙??SAD_Global??囹뜹쐦??影ｏ옙獄℡텈占??℡댃占?轝졽궩) 邀썲쟿占?
    let contexts = sqlx::query(
        "SELECT context_type, context_data_json FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut all_context_json = serde_json::json!({});
    for row in contexts {
        let ctx_type: String = row.get("context_type");
        let ctx_data: String = row.get("context_data_json");
        all_context_json[&ctx_type] = serde_json::from_str(&ctx_data).unwrap_or(serde_json::json!(ctx_data));
    }
    let global_context_str = serde_json::to_string_pretty(&all_context_json).unwrap_or_default();

    // SAD_Module ?蘊덌옙 ?占쏙옙 ?占썬ゲ?歷ｄ궩
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Module node not found".to_string())?;

    if sad_node.node_state != "READY" && sad_node.node_state != "PAUSED_HITL" && sad_node.node_state != "PAUSED_API_ERROR" && sad_node.node_state != "PAUSED_STOPPED" && sad_node.node_state != "COMPLETED" && sad_node.node_state != "STALE" {
        return Err("?占쏙옙 ?占쏙옙??좑옙???轝좑옙?????占쏜졐?占쏜졊?".to_string());
    }

    sqlx::query("UPDATE document_node SET node_state = 'IN_PROGRESS', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&sad_node.node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());

    let max_iters = sad_node.max_iterations.max(1);
    let threshold = sad_node.threshold_score;

    let mut current_iter = sad_node.current_iteration;
    let mut is_module_success = false;
    let mut last_feedback = String::new();

    // [RETRY] ?歷ο옙 ?葯면━ ?逆븝옙獄?獄?容뺧옙占?令덌옙?蘊꾭젅붺??
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&sad_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut initial_stage_context = serde_json::json!({});
    if let Some(it) = latest_iter {
        println!(">>> Resuming SAD Module Split from previous iteration feedback");
        if let Some(fb) = it.actionable_feedback_text {
             if let Ok(issues) = serde_json::from_str::<Vec<crate::schemas::EvaluationIssue>>(&fb) {
                 last_feedback = issues.iter().map(|i| format!("[縕먩퉲占??占쏙옙 - ?占쏙옙: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n");
             } else if let Ok(fb_list) = serde_json::from_str::<Vec<String>>(&fb) {
                 last_feedback = fb_list.join("\n");
             }
        }
        if let Ok(prev_bundle) = serde_json::from_str::<serde_json::Value>(&it.generated_draft_json) {
            initial_stage_context = prev_bundle;
        }
    }
    let mut last_error = String::new();

    let prompts_dir = get_prompts_dir(&app_handle);
    let common_prompt = std::fs::read_to_string(prompts_dir.join("generator/common.txt")).unwrap_or_else(|_| {
        println!("!!! Failed to load common.txt generator prompt");
        String::new()
    });

    if current_iter >= max_iters && !is_module_success {
        last_error = "容뽩텈? 獄삡겒???悌솆占?Max Iterations)???占쏜줎?占쏜졐?占쏜졊? ??⑨옙??縕먲옙囹띈릊占???悌솆占썼쳺???ゐ㉧백뇰逆곤옙??".to_string();
    }

    while current_iter < max_iters && !is_module_success {
        current_iter += 1;
        let module_types = vec!["sad_module_list", "sad_epic_mapping", "sad_module_deps"];
        // ?歷ο옙 ?葯면━ 縕믭옙褶??劑뵳?
        let mut stage_module_json = initial_stage_context.clone();

        for ctx_type in module_types {
            let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 (Iter {}): {} ??뽳옙 辱?..", current_iter, ctx_type));

            let schema_obj = crate::schemas::get_schema_for_node(ctx_type);
            let resource_path = prompts_dir.join(format!("generator/{}.txt", ctx_type));
            let type_prompt = std::fs::read_to_string(&resource_path).unwrap_or_else(|_| {
                println!("!!! Missing prompt: {:?}", resource_path);
                String::new()
            });

            // ???뿈???屍귨옙: ?燁묌뭘????밭뿆????됶쫱??帝같腰??辱ζ쉼占?
            let dependencies = match ctx_type {
                "sad_module_list" => vec![],
                "sad_epic_mapping" => vec!["sad_module_list"],
                "sad_module_deps" => vec!["sad_module_list", "sad_epic_mapping"],
                _ => vec![],
            };

            let mut prev_decisions = serde_json::Map::new();
            for dep in dependencies {
                if let Some(val) = stage_module_json.get(dep) {
                    prev_decisions.insert(dep.to_string(), val.clone());
                }
            }
            let prev_context_str = serde_json::to_string_pretty(&prev_decisions).unwrap_or_else(|_| "{}".to_string());

            let prev_draft_str = if let Some(prev_val) = initial_stage_context.get(ctx_type) {
                serde_json::to_string_pretty(prev_val).unwrap_or_else(|_| "{}".to_string())
            } else {
                "{}".to_string()
            };

            let sys_prompt = format!("$COMMON_RULES\n{}\n\n$DOMAIN_SPECIFIC_RULE\n{}", common_prompt, type_prompt);
            let mut user_prompt = format!(
                "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$GLOBAL_CONTEXT\n{}\n\n$PREVIOUS_ARCHITECTURAL_DECISIONS\n{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n????낂쇃獄?影ｅ쐣占?逆븝옙 {}??獄? ?靜♥占???쨫?帝같?닎.",
                ctx_type, current_iter, genesis_prd_content, global_context_str, prev_context_str, prev_draft_str, last_feedback, ctx_type
            );

            // 獄덂댖占?令덍?곤옙 ?帝같??邀썲쐦??辱ζ쉼占?
            if let Some(count) = target_module_count {
                user_prompt = format!(
                    "{}\n\n[?帝같???燁믮Ŋ? ?帝같??帝같占??占썹쑝 獄덂댖占?令덍?곤옙獄?獄삡겒占??{}令??歷η꺏獄?囹긺쭛占???쨫?帝같?닎. 辱쀰、억옙?占? ??? 影ｅ쐣劑걩?占???덃뼢 獄덂댖占??縕먳짉숃쪛???ㄹ?令덍?곤옙獄?獄ㆀ첃댐옙??占??]",
                    user_prompt, count
                );
            }

            let result = call_gemini(&client, &api_key, &sys_prompt, &user_prompt, schema_obj).await;
            let part_json = match result {
                Ok(content) => {
                    serde_json::from_str::<serde_json::Value>(&content)
                        .map_err(|e| format!("SAD Part ({}) ?葯멥삖 ??덌옙: {} - ??믧썿: {}", ctx_type, e, content))?
                }
                Err(e) => {
                    let (code, msg) = match e {
                        crate::commands::PipelineError::ApiError(c, m) => (c as i32, m),
                        crate::commands::PipelineError::Internal(m) => (0, m),
                    };
                    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                    .bind(code).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                    .execute(&*pool).await.map_err(|e| e.to_string())?;
                    return Err(format!("SAD Part ({}) ??뽳옙 ??덌옙: {}", ctx_type, msg));
                }
            };

            // ???쪛 令덂릸????擁ｏ옙
            if let Some(obj) = stage_module_json.as_object_mut() {
                obj.insert(ctx_type.to_string(), part_json);
            }

            // [STOP CHECK] 令덂텈占??榕꿜궩 ??뽳옙 ??辱쀧궍靜? 墉?르占?
            if is_node_stopped(&*pool, &sad_node.node_id).await {
                println!(">>> SAD Module Split stopped manually during part generation ({})", ctx_type);
                return Ok("SAD module split stopped manually".to_string());
            }
        }

        let eval_schema = crate::schemas::get_evaluation_schema();
        let prompts_dir = get_prompts_dir(&app_handle);
        
        let common_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/common.txt")).unwrap_or_else(|_| String::new());
        let eval_rubric = std::fs::read_to_string(prompts_dir.join("evaluator/sad_module.txt")).unwrap_or_default();
        
        let eval_sys_prompt = format!("$COMMON_RUBRIC\n{}\n\n$DOMAIN_RUBRIC\n{}", common_rubric, eval_rubric);
        let eval_user_prompt = format!(
            "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$GLOBAL_CONTEXT\n{}\n\n$GENERATED_DOCUMENT\n{}\n\n$EVALUATOR_FEEDBACK\n{}",
            "SAD_Module", current_iter, genesis_prd_content, global_context_str, serde_json::to_string_pretty(&stage_module_json).unwrap_or_default(), last_feedback
        );

        let eval_result = call_gemini(&client, &api_key, &eval_sys_prompt, &eval_user_prompt, Some(eval_schema)).await;
        match eval_result {
            Ok(eval_json) => {
                let eval: serde_json::Value = serde_json::from_str(&eval_json).unwrap_or_default();
                let score = eval["score"].as_i64().unwrap_or(0) as i32;
                
                // [影ｅ쐦占????믮죫] AI??is_pass 令덍Ł놅옙 獄→른占??섓옙 獄삥×占?帝같占??辱뷂옙占?囹몌옙占?
                let has_critical_errors = eval["critical_errors"].as_array().map_or(false, |arr| !arr.is_empty());
                let is_passed = score >= threshold && !has_critical_errors;
                
                if is_passed || (current_iter == max_iters) {
                    is_module_success = is_passed;
                    if !is_passed && current_iter == max_iters {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 ?占쏙옙 獄?퀓靜졋?歷좑옙 容뽩텈? ?悌솆占??占쏜줎븃ア?辱쀧궍靜? (??좑옙: {})", score));
                    } else {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 ??쏃쟽 (??좑옙: {})", score));
                    }
                }

                // [?葯면━ ?占?? Stage 2 囹뜹쐦????占썸벆?堤솘???葯모쬃?납?뱄옙 ?占??
                let iter_id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();

                let feedback_text = if let Ok(issues) = serde_json::from_value::<Vec<crate::schemas::EvaluationIssue>>(eval["feedback"].clone()) {
                    issues.iter().map(|i| format!("[縕먩퉲占??占쏙옙 - ?占쏙옙: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n")
                } else {
                    eval["feedback"].as_array().map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
                };

                let critical_errors_text = if let Ok(issues) = serde_json::from_value::<Vec<crate::schemas::EvaluationIssue>>(eval["critical_errors"].clone()) {
                    issues.iter().map(|i| format!("[?占쏙옙: {}] {} : {}", i.location, i.code, i.description)).collect::<Vec<_>>().join("\n")
                } else {
                    eval["critical_errors"].as_array().map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n")).unwrap_or_default()
                };
                
                // Stage 2 囹뜹쐦???Stage 1 囹뜹쐦??占???뽳옙???占??(?占썹썟??SAD 蘊??帝걟??
                let mut combined_bundle = all_context_json.clone();
                if let Some(obj) = combined_bundle.as_object_mut() {
                    for (k, v) in stage_module_json.as_object().unwrap() {
                        obj.insert(k.clone(), v.clone());
                    }
                }

                let feedback_json = serde_json::to_string(&eval["feedback"]).unwrap_or_default();
                let critical_json = serde_json::to_string(&eval["critical_errors"]).unwrap_or_default();

                // ?蘊덌옙??占??帝같占?
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                // [容븟??] 辱쀧궍???屍귨옙 獄삥떀?: ?歷좑옙 ?葯면━令덌옙 ??쏃쟽 影ｅ윜???獄ㅵ돋짠??ゅ틬 ?歷좈컾 ?蘊덌옙??影ｅ윜???屍귨옙 ?占쏙옙??容뺧옙???
                if is_passed {
                    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
                        .bind(&now)
                        .bind(&sad_node.node_id)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }

                sqlx::query(
                    "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&iter_id)
                .bind(&sad_node.node_id)
                .bind(current_iter)
                .bind(combined_bundle.to_string())
                .bind(score)
                .bind(is_passed)
                .bind(&critical_json)
                .bind(&feedback_json)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                // 影ｅ쐦占??蘊깍옙占? 獄??葯면━(Draft ?燁믮쪡???3饒??℡댃占?轝졽궩獄?令덌옙占??占??
                let module_types = vec!["sad_module_list", "sad_epic_mapping", "sad_module_deps"];
                for ctx_type in module_types {
                    if let Some(data) = stage_module_json.get(ctx_type) {
                        let ctx_id = Uuid::new_v4().to_string();
                        sqlx::query(
                            "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
                        )
                        .bind(&ctx_id).bind(&project_id).bind(&iter_id).bind(ctx_type).bind(data.to_string()).bind(current_iter).bind(&now).bind(&now)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }

                tx.commit().await.map_err(|e| e.to_string())?;

                // [?逆븝옙獄??占썬ゲ?歷ｄ궩] ??⑨옙 ?葯면━獄??占썬윸 ?占??(???옙辱붺몗占??鼎퐗???
                last_feedback = feedback_text.clone(); if !critical_errors_text.is_empty() { last_feedback = format!("{}\n{}", critical_errors_text, last_feedback); }

                if !is_module_success {
                    last_error = eval["feedback"].as_str().unwrap_or("?占쏙옙 獄?퀓靜졋").to_string();
                    let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 ?占쏙옙 獄?퀓靜졋 (??좑옙: {}), ?燁묕옙??辱?..", score));
                }
            }
            Err(_) => {
                last_error = "??? 辱???덌옙 獄삽?곤옙".to_string();
            }
        }
    }

    // 獄닷댃占?饒덌옙占??? ?屍? ?占쏙옙?蘊? ??⑨옙 ?屍귩쪟?(PAUSED_STOPPED ?占쏙옙 ??弟릎??뗨맻 獄삥떀?)
    if is_node_stopped(&pool, &sad_node.node_id).await {
        println!(">>> SAD Module Pipeline loop for node {} terminated due to manual stop signal.", sad_node.node_id);
        return Ok("SAD module context pipeline stopped".to_string());
    }

    if !is_module_success {
        // [???옙] ?轝좒쨺??帝같占???歷ｏ옙?占쏜쬃????낂쇃 獄삡겘占?
        sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, updated_at = ? WHERE node_id = ?")
            .bind(current_iter)
            .bind(Utc::now().to_rfc3339())
            .bind(&sad_node.node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());
        return Err(format!("SAD 獄덂댖占?蘊깍옙占???뽳옙 蘊깍옙?: {}", last_error));
    }

    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, current_best_score = 100, updated_at = ? WHERE node_id = ?")
    .bind(current_iter)
    .bind(Utc::now().to_rfc3339())
    .bind(&sad_node.node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "SAD 獄덂댖占?蘊깍옙占???뽳옙 ?占쏙옙. 獄덂댖占???뽳옙???野?쪟??辱ζ쉼占??");

    Ok("SAD module split pipeline completed".to_string())
}

/// SAD 囹뜹쐦??影ｅ쐣占?獄??계퀝 獄덂댖占???믭옙 ??뽳옙 (容뽩텈? 10令?
#[tauri::command]
pub async fn create_local_modules(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    modules_json: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let now = Utc::now().to_rfc3339();

    // modules_json ?葯멥삖: [{name, description, responsibility, mapped_epics, priority_order}]
    let modules: Vec<serde_json::Value> = serde_json::from_str(&modules_json)
        .map_err(|e| format!("獄덂댖占?JSON ?葯멥삖 ??덌옙: {}", e))?;

    if modules.len() > 10 {
        return Err("容뽩텈? 獄덂댖占???わ옙 10令덍?곤옙?占쏜졊?".to_string());
    }

    // SAD 獄덂댖占?蘊깍옙占??蘊덌옙 ?占쏙옙 墉?겒??
    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module'")
    .bind(&now).bind(&project_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    // ?占쏙옙??틶??phase ?占쏙옙
    sqlx::query("UPDATE project SET pipeline_phase = 'MODULE_GENERATION', updated_at = ? WHERE project_id = ?")
    .bind(&now).bind(&project_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    let mut module_ids = Vec::new();
    let node_types = vec!["PRD", "FSD", "User Flow", "IA", "ERD", "Wireframe", "API_Spec", "TC"];

    for (idx, module) in modules.iter().enumerate() {
        // AI令덌옙 ?帝같占??ID令덌옙 ?占썲컧獄??燁묌뭘, ?占썲컧獄?UUID ??뽳옙 (??????옙)
        let module_id = module["module_id"].as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
            
        let default_name = format!("Module-{}", idx+1);
        let m_name = module["name"].as_str().unwrap_or(&default_name);
        let m_desc = module["description"].as_str().unwrap_or("");
        let m_resp = module["responsibility"].as_str().unwrap_or("");
        let m_epics = module["mapped_epics"].as_str().unwrap_or(""); // 獄덌옙占?占썲컧獄?獄↑퀎占??容뷰눢占?
        let priority = module["priority_order"].as_i64().unwrap_or(idx as i64) as i32;

        sqlx::query(
            "INSERT INTO local_module (module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, priority_order, module_state, display_order, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, 0)"
        )
        .bind(&module_id).bind(&project_id).bind(m_name).bind(m_desc).bind(m_resp).bind(m_epics)
        .bind(priority).bind(idx as i32).bind(&now).bind(&now)
        .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 令?獄덂댖占??8令??蘊덌옙 ??뽳옙
        for node_type in &node_types {
            let node_id = Uuid::new_v4().to_string();
            let initial_state = if node_type == &"PRD" { "READY" } else { "PENDING" };
            sqlx::query(
                "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, 'MODULE', ?, 0, 10, 85, 0, ?, ?, 0)"
            )
            .bind(&node_id).bind(&project_id).bind(&module_id).bind(*node_type).bind(initial_state).bind(&now).bind(&now)
            .execute(&*pool).await.map_err(|e| e.to_string())?;
        }

        module_ids.push(module_id);
    }

    // 墉?縕믭옙耶?獄덂댖占???잞옙?帝같占?容뽴쮤덌옙)???帝같占??
    if let Some(first_id) = module_ids.first() {
        sqlx::query("UPDATE local_module SET module_state = 'ACTIVE' WHERE module_id = ?")
        .bind(first_id).execute(&*pool).await.map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(module_ids)
}

/// ?靜쪊占??SAD ?歷ｏ옙?占쏜쬃???옙 囹멱썦占??℡댃占?轝졽궩獄??屍귨옙
#[tauri::command]
pub async fn confirm_sad_iteration(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Confirming SAD iteration: {} for project: {}", iteration_id, project_id);
    
    // 1. ?葯면━ ??낂쇃 邀썲쟿占?
    let iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "?葯면━ ??낂쇃獄?墉녷㉩占????占쏜졐?占쏜졊?".to_string())?;

    // 2. 縕믭옙褶⑵イ占쏙옙 JSON ?葯멥삖
    let bundle: serde_json::Value = serde_json::from_str(&iteration.generated_draft_json)
        .map_err(|e| format!("??잟쬃???葯멥삖 ??덌옙: {}", e))?;

    let now = Utc::now().to_rfc3339();
    let it_number = iteration.iteration_number;

    // 3. ?蘊덌옙??占??帝같占?
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 4. 影ｅ윜???℡댃占?轝졽궩 ??占?(?逆뷸뵸 ??占?
    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ?")
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 4-1. ?歷좈컾 ?蘊덌옙??獄덂댖占??歷ｏ옙?占쏜쬃??is_pass 容뺧옙??????占쏙옙 ?葯면━獄?1獄???⑨옙
    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
        .bind(&now)
        .bind(&iteration.node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 1, updated_at = ? WHERE iteration_id = ?")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 5. ???℡댃占?轝졽궩 ?擁ｏ옙
    if let Some(obj) = bundle.as_object() {
        for (ctx_type, data) in obj {
            let ctx_id = Uuid::new_v4().to_string();
            let data_str = if data.is_string() { data.as_str().unwrap().to_string() } else { data.to_string() };
            
            sqlx::query(
                "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
            )
            .bind(&ctx_id).bind(&project_id).bind(&iteration_id).bind(ctx_type).bind(data_str).bind(it_number).bind(&now).bind(&now)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    // 6. ?蘊덌옙??容뽴?곤옙 ??좑옙 ?占썬ゲ?歷ｄ궩 (?占쏙옙??PAUSED_HITL ?劑뵳????ㄹ?獄덌옙占???野?쪟??占썹??
    let _node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&iteration.node_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE document_node SET current_best_score = ?, updated_at = ? WHERE node_id = ?"
    )
    .bind(iteration.calculated_score)
    .bind(&now)
    .bind(&iteration.node_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = _app_handle.emit("nodes-updated", ());
    println!(">>> SAD Iteration {} confirmed (is_pass=1) for project: {}", iteration_id, project_id);
    Ok(())
}

/// ?屍귨옙???歷ｏ옙?占쏜쬃???옙 庸믣댆占?
#[tauri::command]
pub async fn unconfirm_iteration(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Unconfirming iteration: {} for project: {}", iteration_id, project_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. ?歷좈컾 ?歷ｏ옙?占쏜쬃????낂쇃 邀썲쟿占?
    let _iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "?葯면━ ??낂쇃獄?墉녷㉩占????占쏜졐?占쏜졊?".to_string())?;

    // 2. is_pass獄?0?逆븝옙 縕먲옙囹?
    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE iteration_id = ?")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 3. SAD 囹듸옙??玉붺┷占?占쏜쫱?囹띈땃容???뗧썟??global_context ?逆뷸뵸 ??占?
    // version(iteration_number)?占?iteration_id獄?影ｅ쐣占?逆븝옙 ??占?
    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND iteration_id = ?")
        .bind(&now)
        .bind(&project_id)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    println!(">>> Iteration {} unconfirmed (is_pass=0) for project: {}", iteration_id, project_id);
    Ok(())
}

/// SAD ??뤄옙???蘊덌옙(Global ??믭옙 Module)獄?容뽴?곤옙 ?野?쪟?墉?겒??
#[tauri::command]
pub async fn approve_sad_node(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    node_id: String,
    api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving SAD node: {} for project: {}, api_key_provided: {}", node_id, project_id, api_key.is_some());

    let now = Utc::now().to_rfc3339();

    // 1. ?蘊덌옙 ??낂쇃 邀썲쟿占?
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "?蘊덌옙 ??낂쇃獄?墉녷㉩占????占쏜졐?占쏜졊?".to_string())?;

    // 2. ?屍귨옙??is_pass=1) ?歷ｏ옙?占쏜쬃???쬃??占쏙옙辱뷂옙 ?屍귩쪟?
    let confirmed_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 AND is_deleted = 0 LIMIT 1"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "?屍귨옙??玉붺┷占?占쏜쬃??占쏜졐?占쏜졊? 獄잍쉼? 玉붺┷占?占쏙옙 ?屍귨옙??辱ζ쉼占??".to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 3. ?蘊덌옙 ?占쏙옙獄?COMPLETED獄?縕먲옙囹?
    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
    )
    .bind(&now)
    .bind(&node_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // [RAG] ?野?쪟??SAD ?蘊덌옙 ?占쏙옙??獄??곤옙??獄삥쥞繹?逆곧쟼?蒻낉옙 ?占쏙옙 (DB Lock 獄삥떀?)
    let pool_clone = pool.inner().clone();
    let app_handle_clone = app_handle.clone();
    let project_id_clone = project_id.clone();
    let node_id_for_bg = node.node_id.clone();
    let node_type_for_bg = node.target_node_type.clone();
    let iteration_id_for_bg = confirmed_iter.iteration_id.clone();
    let draft_json_for_bg = confirmed_iter.generated_draft_json.clone();
    let score_for_bg = confirmed_iter.calculated_score.unwrap_or(0);

    tauri::async_runtime::spawn(async move {
        let client = app_handle_clone.state::<Client>();
        
        // 1. ?蘊꾬옙獄????㈇??????잞옙 ?燁묌뭘, ?占썲컧獄?DB??좑옙 邀썲쟿占?
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
            _ => {
                println!(">>> [RAG-BG] No API key found in args or DB. Aborting embedding for SAD node.");
                return;
            }
        };


        let _ = app_handle_clone.emit("pipeline-status", "SAD RAG ?占쏙옙??辱?..");
        let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("RAG ?占쏙옙??辱?..")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id_for_bg)
            .execute(&pool_clone)
            .await;
        let _ = app_handle_clone.emit("nodes-updated", ());

        let embedding_res = store_document_embeddings(
            &pool_clone, &*client, &api_key_str,

            &project_id_clone, None,
            &node_id_for_bg, &node_type_for_bg,
            &iteration_id_for_bg, &draft_json_for_bg,
            score_for_bg,
        ).await;

        match embedding_res {
            Ok(_) => {
                let _ = app_handle_clone.emit("pipeline-status", "SAD ?占쏙옙???占쏙옙");
            },
            Err(e) => {
                let err_msg = format!("SAD RAG ?占쏙옙???轝좒쨺?({}): {}", node_type_for_bg, e);
                println!(">>> [RAG-BG] {}", err_msg);
                
                let error_info = RagErrorInfo {
                    project_id: project_id_clone,
                    node_id: node_id_for_bg.clone(),
                    node_type: node_type_for_bg,
                    error_message: e.to_string(),
                };
                let _ = app_handle_clone.emit("rag-error", error_info);
            }
        }

        // ?占쏙옙 容뺧옙???
        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id_for_bg)
            .execute(&pool_clone)
            .await;
        let _ = app_handle_clone.emit("nodes-updated", ());
    });

    // 4. ??⑨옙 ??뤄옙 ?帝같占??墉?겒??
    if node.target_node_type == "SAD_Global" {
        // SAD_Module ?蘊덌옙獄?READY獄??占쏙옙
        sqlx::query(
            "UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module' AND node_state = 'PENDING'"
        )
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        println!(">>> SAD_Global approved. SAD_Module is now READY.");
    } else if node.target_node_type == "SAD_Module" {
        println!(">>> SAD_Module approved. Triggering local module creation...");
        // ?屍귨옙???歷ｏ옙?占쏜쬃???옙 ??잟쬃??? ?葯멥삖???ㄹ?獄??계퀝 獄덂댖占???뽳옙 ?蘊꾬옙
        let bundle: serde_json::Value = serde_json::from_str(&confirmed_iter.generated_draft_json)
            .map_err(|e| format!("??잟쬃???葯멥삖 ??덌옙: {}", e))?;

        if let Some(modules_val) = bundle.get("sad_module_list") {
            let modules_json = if modules_val.is_array() {
                serde_json::to_string(modules_val).unwrap_or_else(|_| "[]".to_string())
            } else if let Some(arr) = modules_val.get("modules") {
                serde_json::to_string(arr).unwrap_or_else(|_| "[]".to_string())
            } else {
                modules_val.to_string()
            };
            
            // 6. sad_epic_mapping??蘊깍옙占???ㄹ?獄덂댖占썼쾺??堤솘欲??劑뫊制첉 容뷰눢占?
            let epic_mappings: Vec<serde_json::Value> = bundle.get("sad_epic_mapping")
                .and_then(|em| em.get("mappings"))
                .and_then(|m| m.as_array())
                .cloned().unwrap_or_default();

            // create_local_modules???占쏙옙????잟쬃????獄ㅶ쵟占??燁묅??(name, description, responsibility, mapped_epics)
            let raw_modules: Vec<serde_json::Value> = serde_json::from_str(&modules_json).unwrap_or_default();
            let modules_to_create: Vec<serde_json::Value> = raw_modules.iter().map(|m| {
                let current_mid = m.get("module_id").and_then(|v| v.as_str()).unwrap_or("");
                
                // ?歷좈컾 獄덂댖占?ID令덌옙 ?燁믮쪡??獄덂댖占??劑뫊制첉 ID ???옙
                let assigned_epics: Vec<String> = epic_mappings.iter()
                    .filter(|em| em.get("mapped_modules").and_then(|mm| mm.as_array())
                        .map_or(false, |mm| mm.iter().any(|mid| mid.as_str() == Some(current_mid))))
                    .filter_map(|em| em.get("epic_id").and_then(|e| e.as_str()).map(|e| e.to_string()))
                    .collect();

                serde_json::json!({
                    "module_id": current_mid,
                    "name": m.get("module_name").or(m.get("name")),
                    "description": m.get("description"),
                    "responsibility": m.get("core_responsibility").or(m.get("responsibility")),
                    "mapped_epics": assigned_epics.join(", "), // ?逆ㅿ옙獄?囹긺┷占??獄↑퀎占??
                    "priority_order": m.get("priority_order")
                })
            }).collect();

            let _final_json = serde_json::to_string(&modules_to_create).unwrap_or_else(|_| "[]".to_string());
            
            // 辱ζ쉼占? create_local_modules ?歷???좑옙 ?蘊덌옙??占????⑨옙 ?帝같占?????占썲컧獄?옙獄?
            // ?獵배맻?蒻낉옙 ?蘊덌옙??占??€쐢占????蘊꾬옙??섉렆?? 獄??곤옙???蘊덍쫱?縕뀐옙?歷η꽚 ??
            // ?逆븟죫 ?屍귨옙 ???蘊꾬옙??わ옙 獄삥떀占?逆븝옙 辱뷂옙占?
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // Module ??뽳옙 ?蘊덃뵸令?(?蘊덌옙??占?獄삥퓳占???轝좑옙)
    if node.target_node_type == "SAD_Module" {
         let bundle: serde_json::Value = serde_json::from_str(&confirmed_iter.generated_draft_json).unwrap_or_default();
         if let Some(modules_val) = bundle.get("sad_module_list") {
            let modules_json = if modules_val.is_array() {
                serde_json::to_string(modules_val).unwrap_or_else(|_| "[]".to_string())
            } else if let Some(arr) = modules_val.get("modules") {
                serde_json::to_string(arr).unwrap_or_else(|_| "[]".to_string())
            } else {
                "[]".to_string()
            };

            // ?劑뫊制첉 獄ㅶ쵟占???낂쇃 容뷰눢占?
            let epic_mappings: Vec<serde_json::Value> = bundle.get("sad_epic_mapping")
                .and_then(|em| em.get("mappings"))
                .and_then(|m| m.as_array())
                .cloned().unwrap_or_default();

            let raw_modules: Vec<serde_json::Value> = serde_json::from_str(&modules_json).unwrap_or_default();
            let modules_to_create: Vec<serde_json::Value> = raw_modules.iter().map(|m| {
                let current_mid = m.get("module_id").and_then(|v| v.as_str()).unwrap_or("");
                
                let assigned_epics: Vec<String> = epic_mappings.iter()
                    .filter(|em| em.get("mapped_modules").and_then(|mm| mm.as_array())
                        .map_or(false, |mm| mm.iter().any(|mid| mid.as_str() == Some(current_mid))))
                    .filter_map(|em| em.get("epic_id").and_then(|e| e.as_str()).map(|e| e.to_string()))
                    .collect();

                serde_json::json!({
                    "module_id": current_mid,
                    "name": m.get("module_name").or(m.get("name")),
                    "description": m.get("description"),
                    "responsibility": m.get("core_responsibility").or(m.get("responsibility")),
                    "mapped_epics": assigned_epics.join(", "),
                    "priority_order": m.get("priority_order")
                })
            }).collect();

            let final_json = serde_json::to_string(&modules_to_create).unwrap_or_else(|_| "[]".to_string());
            create_local_modules(pool, project_id, final_json, app_handle.clone()).await?;
         }
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

/// 獄덂댖占????蘊덌옙 ?葯모쬃?占쏜쫱???轝좑옙 (影ｏ옙獄℡텈占??℡댃占?轝졽궩 辱ζ쉼占??燁믮쪡?
#[tauri::command]
pub async fn run_module_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
    module_id: String,
    node_type: String,
    api_key: String,
) -> Result<String, String> {
    // 影ｏ옙獄℡텈占??℡댃占?轝졽궩 ???옙
    let contexts = sqlx::query_as::<_, GlobalContext>(
        "SELECT context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 獄덂댖占???낂쇃 邀썲쟿占?(容븟??)
    let module = sqlx::query_as::<_, LocalModule>(
        "SELECT module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, dependency_spec, priority_order, module_state, display_order, created_at, updated_at FROM local_module WHERE module_id = ?"
    )
    .bind(&module_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Module not found for ID: {}", module_id))?;

    let normalized_node_type = node_type.to_lowercase().replace(" ", "_");
    let mut global_ctx = serde_json::json!({});

    for ctx in &contexts {
        let is_required = match normalized_node_type.as_str() {
            "prd" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_core_erd" | "sad_module_list" | "sad_epic_mapping" | "sad_module_deps"),
            "fsd" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_core_erd" | "sad_interface_error" | "sad_non_tech" | "sad_module_list" | "sad_module_deps"),
            "erd" => matches!(ctx.context_type.as_str(), "sad_tech_stack" | "sad_core_erd" | "sad_module_deps"),
            "api_spec" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_interface_error" | "sad_module_deps"),
            "user_flow" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_interface_error"),
            "ia" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_interface_error"),
            "wireframe" => matches!(ctx.context_type.as_str(), "sad_core_erd" | "sad_interface_error" | "sad_tech_stack"),
            "tc" => matches!(ctx.context_type.as_str(), "sad_auth_rbac" | "sad_interface_error" | "sad_non_tech" | "sad_module_deps"),
            _ => false,
        };

        if is_required {
            let mut val: serde_json::Value = serde_json::from_str(&ctx.context_data_json).unwrap_or(serde_json::json!({}));
            
            // [?野?옙 ?占쏙옙獄? Stage 2 獄↑퀎占??좑옙 ?歷좈컾 獄덂댖占?囹듸옙????낂쇃獄?容뷰눢占?
            match ctx.context_type.as_str() {
                "sad_module_list" => {
                    if let Some(modules) = val.get_mut("modules").and_then(|m| m.as_array_mut()) {
                        modules.retain(|m| m.get("module_id").and_then(|n| n.as_str()) == Some(&module_id));
                    }
                },

                "sad_epic_mapping" => {
                    if let Some(mappings) = val.get_mut("mappings").and_then(|m| m.as_array_mut()) {
                        mappings.retain(|m| {
                            m.get("mapped_modules").and_then(|mm| mm.as_array())
                             .map_or(false, |mm| mm.iter().any(|id| id.as_str() == Some(&module_id)))
                        });
                    }
                },

                "sad_module_deps" => {
                    if let Some(deps) = val.get_mut("dependencies").and_then(|d| d.as_array_mut()) {
                        deps.retain(|d| {
                            d.get("from_module").and_then(|n| n.as_str()) == Some(&module_id) ||
                            d.get("to_module").and_then(|n| n.as_str()) == Some(&module_id)
                        });
                    }
                },

                _ => {} // ??덃뼢 ?占?占? ?占썹쑝 辱ζ쉼占?
            }

            global_ctx[&ctx.context_type] = val;
        }
    }
    let global_context_str = serde_json::to_string_pretty(&global_ctx).unwrap_or_default();

    // ?歷좈컾 獄덂댖占???蘊덌옙 邀썲쟿占?
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0"
    )
    .bind(&module_id)
    .bind(&node_type)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found in module".to_string())?;

    // 辱쀧궍???轝좑옙 墉?르占?
    {
        let mut tasks = active_tasks.0.lock().map_err(|e| e.to_string())?;
        if tasks.contains(&node.node_id) {
            println!(">>> [ABORT] Node is already running: {}", node.node_id);
            return Err("?歷? ?占쏙옙?蘊꾣벆令덌옙 辱뷂옙占?辱쀰、억옙?占쏜졊? (ActiveTask Detect)".to_string());
        }
        tasks.insert(node.node_id.clone());
    }

    // RAII 令덌옙????뽳옙
    struct TaskGuard {
        tasks: Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
        node_id: String,
    }
    impl Drop for TaskGuard {
        fn drop(&mut self) {
            if let Ok(mut t) = self.tasks.lock() {
                t.remove(&self.node_id);
            }
        }
    }
    let _guard = TaskGuard { tasks: active_tasks.0.clone(), node_id: node.node_id.clone() };

    if node.node_state != "READY" && node.node_state != "PAUSED_HITL" && node.node_state != "PAUSED_API_ERROR" && node.node_state != "PAUSED_STOPPED" && node.node_state != "COMPLETED" && node.node_state != "STALE" {
        return Err("?占쏙옙 ?占쏙옙??좑옙???轝좑옙?????占쏜졐?占쏜졊? (READY, PAUSED_HITL, PAUSED_API_ERROR, PAUSED_STOPPED ??믭옙 COMPLETED ?占쏙옙)".to_string());
    }



    // IN_PROGRESS ?占쏙옙
    sqlx::query("UPDATE document_node SET node_state = 'IN_PROGRESS', api_error_message = NULL, updated_at = ? WHERE node_id = ?")
    .bind(Utc::now().to_rfc3339()).bind(&node.node_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    let client = Client::new();
    let max_iters = node.max_iterations;
    let threshold = node.threshold_score;
    let mut current_best_content = String::new();
    let mut current_best_score = 0;
    let mut final_iteration_count = 0;
    let mut loop_error = None;

    // [RETRY] ?歷ο옙 ?葯면━ ??낂쇃 令덌옙?蘊꾭젅붺??
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut previous_draft = String::new();
    let mut previous_feedback: Vec<String> = Vec::new();

    if let Some(it) = latest_iter {
        println!(">>> Resuming Module Node context: {}", node_type);
        previous_draft = it.generated_draft_json;
        if let Some(errs) = it.critical_errors_array {
            if let Ok(elist) = serde_json::from_str::<Vec<String>>(&errs) {
                previous_feedback.extend(elist);
            }
        }
        if let Some(fbs) = it.actionable_feedback_text {
            if let Ok(flist) = serde_json::from_str::<Vec<String>>(&fbs) {
                for f in flist {
                    previous_feedback.push(format!("縕먩퉲占??占쏙옙: {}", f));
                }
            }
        }
    }

    // 獄덂댖占??℡댃占?轝졽궩 囹긺쭛占?
    let module_context = format!(
        "### [CURRENT MODULE: {}] ###\n\n[??덌옙]\n{}\n\n[??숎줎?墉뉛옙占?\n{}\n\n[獄ㅶ쵟占??Epic]\n{}\n\n[???뿈??獄???잟쬃????믭옙]\n{}",
        module.module_name,
        module.module_description.as_deref().unwrap_or(""),
        module.core_responsibility.as_deref().unwrap_or(""),
        module.mapped_epics.as_deref().unwrap_or(""),
        module.dependency_spec.as_deref().unwrap_or("?占쏙옙")
    );

    // [V2.5] ???뿈??影ｅ쐣占?蘊깍옙獄??蘊덌옙 ??잞옙獄?獄덌옙占??辱ζ쉼占?獄??곤옙
    let prerequisites = match node_type.as_str() {
        "FSD" => vec!["PRD"],
        "User Flow" => vec!["FSD"],
        "ERD" => vec!["FSD"],
        "IA" => vec!["FSD", "User Flow"],
        "Wireframe" => vec!["FSD", "User Flow", "IA"],
        "API_Spec" => vec!["FSD", "ERD"],
        "TC" => vec!["PRD", "FSD", "API_Spec"],
        _ => vec![],
    };

    let mut parent_docs_context = String::new();
    let mut exclude_node_ids = Vec::new();

    for pre_type in prerequisites {
        // node_id獄??占쏙옙???獄?query_as ?占??令덂텈占??占쏙옙 邀썲쟿占?
        let pre_node_id: Option<String> = sqlx::query_scalar(
            "SELECT node_id FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0"
        )
        .bind(&module_id).bind(pre_type)
        .fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

        if let Some(target_id) = pre_node_id {
            exclude_node_ids.push(target_id.clone());
            
            // generated_draft_json獄??占쏙옙???獄?query_scalar ?燁묌뭘
            let iter_content: Option<String> = sqlx::query_scalar(
                "SELECT generated_draft_json FROM generation_iteration WHERE node_id = ? AND is_pass = 1 AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
            )
            .bind(&target_id)
            .fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

            if let Some(content) = iter_content {
                parent_docs_context.push_str(&format!("\n[SOURCE_DOCUMENT: {}]\n{}\n", pre_type, content));
            }
        }
    }

    // ??뽳옙/????????쪛 ?℡댃占?轝졽궩 囹긺쭛占?(影ｏ옙獄℡텈占?影욒?곤옙 + 獄덂댖占?獄덌옙占?+ 蘊깍옙獄?獄↑퀎占?
    let combined_context = format!(
        "{}\n\n{}\n\n$PARENT_DOCUMENTS_CONTEXT\n{}",
        global_context_str, module_context, parent_docs_context
    );

    let start_iter = node.current_iteration + 1;
    let mut any_passed = false;
    for i in start_iter..=max_iters {
        final_iteration_count = i;
        let _ = app_handle.emit("pipeline-status", format!("[{}] {} ??뽳옙 辱?(獄삡겒??{}/{})", module.module_name, node_type, i, max_iters));

        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("獄↑퀎占???뽳옙 辱?..").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 3. Draft ??뽳옙 (??믧썿 ?占쏜쬃??뱅㈇??帝같?? ???쪛 ?℡댃占?轝졽궩 辱ζ쉼占?
        let draft_res = generate_draft_with_context(&app_handle, &pool, &client, &api_key, &project_id, &node_type, &parent_docs_context, &previous_draft, &previous_feedback, &combined_context, i, exclude_node_ids.clone()).await;
        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => { loop_error = Some(e); break; }
        };

        // [STOP CHECK] AI ?蘊꾬옙 ??辱쀧궍靜? 墉?르占?
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Module Pipeline stopped manually after generation (Node: {})", node.node_id);
            break;
        }

        let _ = app_handle.emit("pipeline-status", format!("[{}] {} 囹띰옙辱?辱?(獄삡겒??{}/{})", module.module_name, node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("?占쏙옙 囹띰옙辱?辱?..").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 4. Draft ??? (???쪛 ?℡댃占?轝졽궩 獄??歷ο옙 ?逆븝옙獄?辱ζ쉼占?
        let eval_res = evaluate_draft(&app_handle, &pool, &client, &api_key, &project_id, &node_type, &draft, None, &combined_context, &module_context, &previous_feedback, i, exclude_node_ids.clone()).await;
        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => { loop_error = Some(e); break; }
        };

        // [STOP CHECK] ??? ??獄??占??辱뷂옙占?辱쀧궍靜? 墉?르占?
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Module Pipeline stopped manually before save (Node: {})", node.node_id);
            break;
        }

        let iter_id = Uuid::new_v4().to_string();
        let errors_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();
        let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();

        // [影ｅ쐦占????믮죫] AI??is_pass ?占??獄삥×占??囹멱썦占???燁묌뭘
        let is_passed = eval.score >= threshold && eval.critical_errors.is_empty();

        sqlx::query(
            "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
        )
        .bind(iter_id).bind(&node.node_id).bind(i).bind(&draft).bind(eval.score).bind(is_passed)
        .bind(errors_json).bind(feedback_json).bind(Utc::now().to_rfc3339()).bind(Utc::now().to_rfc3339())
        .execute(&*pool).await.map_err(|e| e.to_string())?;

        sqlx::query("UPDATE document_node SET current_iteration = ?, updated_at = ? WHERE node_id = ?")
        .bind(i).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
        .execute(&*pool).await.map_err(|e| e.to_string())?;

        let _ = app_handle.emit("nodes-updated", ());

        if eval.score >= current_best_score {
            current_best_score = eval.score;
            current_best_content = draft.clone();
        }

        previous_draft = draft;
        previous_feedback = eval.critical_errors.iter().map(|i| format!("[?占쏙옙: {}] {} : {}", i.location, i.code, i.description)).collect();
        for i in eval.feedback { previous_feedback.push(format!("[縕먩퉲占??占쏙옙 - ?占쏙옙: {}] {} : {}", i.location, i.code, i.description)); }

        if is_passed {
            any_passed = true;
            break; 
        }
    }

    // 容뽴?곤옙 ?占쏙옙 囹뜹윜占?
    if let Some(e) = loop_error {
        match e {
            PipelineError::ApiError(code, msg) => {
                sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                .bind(code as i32).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;
                return Err(format!("API Error ({}): {}", code, msg));
            }
            PipelineError::Internal(msg) => {
                sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = 500, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                .bind(&msg).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;
                return Err(msg);
            }
        }
    }

    // 獄닷댃占?饒덌옙占??? ?屍? ?占쏙옙?蘊? ??⑨옙 ?屍귩쪟?(PAUSED_STOPPED ?占쏙옙 ??弟릎??뗨맻 獄삥떀?)
    if is_node_stopped(&pool, &node.node_id).await {
        println!(">>> Pipeline loop for node {} terminated due to manual stop signal.", node.node_id);
        return Ok(current_best_content);
    }

    let final_state = if !any_passed { NodeState::PausedHitl } else { NodeState::Completed };

    sqlx::query("UPDATE document_node SET node_state = ?, current_iteration = ?, current_best_score = ?, updated_at = ? WHERE node_id = ?")
    .bind(final_state.to_string()).bind(final_iteration_count).bind(current_best_score).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    if final_state == NodeState::Completed {
        // [RAG] ?占쏙옙????잞옙獄→쉼占?縕믠댃占?DB???占쏙옙???占??
        let best_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
        if let Some(iter) = best_iter {
            let _ = app_handle.emit("pipeline-status", format!("[{}] RAG ?占쏙옙??辱?..", module.module_name));
            sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind("RAG ?占쏙옙??辱?..")
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            let _ = app_handle.emit("nodes-updated", ());

            let embedding_res = store_document_embeddings(
                &*pool, &client, &api_key,
                &module.project_id, Some(&module_id),
                &node.node_id, &node_type,
                &iter.iteration_id, &iter.generated_draft_json,
                iter.calculated_score.unwrap_or(0),
            ).await;

            match embedding_res {
                Ok(_) => {
                    let _ = app_handle.emit("pipeline-status", format!("[{}] ?占쏙옙???占쏙옙", module.module_name));
                },
                Err(e) => {
                    println!(">>> [RAG] Embedding storage failed: {}", e);
                    // 獄덂댖占??葯모쬃?占쏜쫱?蘊꾬옙?蒻낉옙 RAG ?轝좒쨺낁쳺?壅э옙占썼쳢占쏙옙 ??믣돰獄?墉?겒??(獄?쮤덃벚獄????)
                }
            }

            let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&node.node_id)
                .execute(&*pool)
                .await;
            let _ = app_handle.emit("nodes-updated", ());
        }

        trigger_module_next_nodes(&app_handle, &module_id, &node_type).await?;
    }

    Ok(current_best_content)
}

/// 影ｏ옙獄℡텈占??℡댃占?轝졽궩獄??燁믮쪡??generate_draft
async fn generate_draft_with_context(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    node_type: &str,
    input_text: &str,
    previous_draft: &str,
    previous_feedback: &Vec<String>,
    global_context: &str,
    iteration: i32,
    exclude_node_ids: Vec<String>,
) -> Result<String, PipelineError> {
    // Phase 2: RAG ?℡댃占썽섹?囹띰옙??
    let rag_query = format!("{} : {} : {}", node_type, input_text, global_context);
    let rag_context = get_rag_context(pool, client, api_key, project_id, &rag_query, 3, exclude_node_ids).await
        .unwrap_or_else(|e| {
            println!(">>> [RAG] Search failed (non-fatal): {}", e);
            String::new()
        });
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let prompts_dir = get_prompts_dir(&app_handle);
    
    let common_prompt = std::fs::read_to_string(prompts_dir.join("generator/common.txt")).unwrap_or_default();
    let domain_prompt = std::fs::read_to_string(prompts_dir.join(format!("generator/{}.txt", node_normalized))).unwrap_or_default();
    
    let schema_obj = crate::schemas::get_schema_for_node(&node_normalized);
    let combined_sys_prompt = format!("$COMMON_RULES\n{}\n\n$DOMAIN_SPECIFIC_RULE\n{}", common_prompt, domain_prompt);
    
    let mut user_prompt = format!(
        "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}{}\n\n????낂쇃獄?獄사콨占?逆븝옙 影ｅ쟿占?蒻? ?靜♥占???쨫?帝같?닎.",
        node_type, iteration, input_text, rag_context
    );

    // 影ｏ옙獄℡텈占??℡댃占?轝졽궩 辱ζ쉼占?
    if !global_context.is_empty() {
        let prefix = if user_prompt.is_empty() { "" } else { "\n\n" };
        user_prompt = format!(
            "{}{}$GLOBAL_CONTEXT\n{}",
            user_prompt, prefix, global_context
        );
    }

    if !previous_draft.is_empty() {
        let feedback_text = if previous_feedback.is_empty() {
            "?占쏙옙".to_string()
        } else {
            previous_feedback.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
        };
        user_prompt = format!(
            "{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n???逆븝옙獄삥×占?獄삡겘占???ㄹ?影ｅ윜????곤옙獄?囹몌옙???섓옙 縕먩른占???ㄹ?容뽴?곤옙 囹뜹쐦?껇ァ逆곤옙 ?占쏙옙???쨫?帝같?닎.",
            user_prompt, previous_draft, feedback_text
        );
    }

    call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await
}

/// 獄덂댖占??獄덂댖占??蘊덌옙令덌옙 ?占쏙옙???옙??? ?屍귩쪟??섓옙 獄덂댖占??占쏙옙??틶???占쏙옙獄??邕롨맻?映앾옙???燁믡?
async fn sync_module_completion_status(
    pool: &SqlitePool,
    app_handle: Option<&tauri::AppHandle>,
    module_id: &str,
) -> Result<(), String> {
    let all_module_nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE module_id = ? AND is_deleted = 0"
    )
    .bind(module_id).fetch_all(pool).await.map_err(|e| e.to_string())?;

    if !all_module_nodes.is_empty() && all_module_nodes.iter().all(|n| n.node_state == "COMPLETED") {
        let module = sqlx::query_as::<_, LocalModule>(
            "SELECT * FROM local_module WHERE module_id = ?"
        )
        .bind(module_id).fetch_optional(pool).await.map_err(|e| e.to_string())?;

        if let Some(m) = module {
            // ?歷? ?占쏙옙 ?占쏙옙?逆뷴틬 ?轝좑옙
            if m.module_state == "COMPLETED" {
                return Ok(());
            }

            let now = Utc::now().to_rfc3339();

            // 1. ?占쏙옙 獄덂댖占??占쏙옙 墉?겒??
            sqlx::query("UPDATE local_module SET module_state = 'COMPLETED', updated_at = ? WHERE module_id = ?")
            .bind(&now).bind(module_id).execute(pool).await.map_err(|e| e.to_string())?;

            // 2. ??⑨옙 ?占썹??辱쀰、언쪟?PENDING) 獄덂댖占???占쏙옙辱뷂옙 ?屍귩쪟???ㄹ??帝같占??
            let next_module = sqlx::query_as::<_, LocalModule>(
                "SELECT * FROM local_module WHERE project_id = ? AND module_state = 'PENDING' AND is_deleted = 0 ORDER BY priority_order ASC LIMIT 1"
            )
            .bind(&m.project_id).fetch_optional(pool).await.map_err(|e| e.to_string())?;

            if let Some(nm) = next_module {
                sqlx::query("UPDATE local_module SET module_state = 'ACTIVE', updated_at = ? WHERE module_id = ?")
                .bind(&now).bind(&nm.module_id).execute(pool).await.map_err(|e| e.to_string())?;
                
                // ??⑨옙 獄덂댖占??墉?縕믭옙耶??蘊덌옙(PRD)獄?READY獄??占쏙옙
                sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE module_id = ? AND target_node_type = 'PRD' AND node_state = 'PENDING'")
                .bind(&now).bind(&nm.module_id).execute(pool).await.map_err(|e| e.to_string())?;
            } else {
                // ???歷ο옙 ??? 獄덂댖占???占썲컧獄??占쏙옙??틶???占썹쑝 ?占쏙옙 墉?겒??
                sqlx::query("UPDATE project SET pipeline_phase = 'COMPLETED', updated_at = ? WHERE project_id = ?")
                .bind(&now).bind(&m.project_id).execute(pool).await.map_err(|e| e.to_string())?;
            }

            // UI 令덃×占?獄삥떀占?
            if let Some(h) = app_handle {
                let _ = h.emit("nodes-updated", ());
            }
        }
    }
    Ok(())
}

/// 獄덂댖占???DAG ?占쏜쬃?(module_id 影ｅ윜?)
async fn trigger_module_next_nodes(app_handle: &tauri::AppHandle, module_id: &str, completed_node_type: &str) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    let next_map = vec![
        ("PRD", vec!["FSD"]),
        ("FSD", vec!["User Flow", "ERD", "Wireframe", "API_Spec", "TC"]),
        ("User Flow", vec!["IA", "Wireframe"]),
        ("IA", vec!["Wireframe"]),
        ("ERD", vec!["API_Spec"]),
        ("API_Spec", vec!["TC"]),
    ];

    let mut nodes_to_check = Vec::new();
    for (parent, children) in &next_map {
        if *parent == completed_node_type {
            for child in children { nodes_to_check.push(*child); }
        }
    }

    for target in nodes_to_check {
        let prerequisites = match target {
            "FSD" => vec!["PRD"],
            "User Flow" => vec!["FSD"],
            "ERD" => vec!["FSD"],
            "IA" => vec!["FSD", "User Flow"],
            "Wireframe" => vec!["FSD", "User Flow", "IA"],
            "API_Spec" => vec!["FSD", "ERD"],
            "TC" => vec!["PRD", "FSD", "API_Spec"],
            _ => vec![],
        };

        let mut all_done = true;
        for pre in prerequisites {
            let pre_node = sqlx::query_as::<_, DocumentNode>(
                "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0"
            )
            .bind(module_id).bind(pre)
            .fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

            match pre_node {
                Some(n) if n.node_state == "COMPLETED" => {},
                _ => { all_done = false; break; }
            }
        }

        if all_done {
            sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE module_id = ? AND target_node_type = ? AND node_state = 'PENDING'")
            .bind(Utc::now().to_rfc3339()).bind(module_id).bind(target)
            .execute(&*pool).await.map_err(|e| e.to_string())?;
        }
    }

    // 獄덂댖占??蘊덌옙 ?占쏙옙 墉?르占???ㄹ?獄덂댖占?獄??占쏙옙??틶???占쏙옙 ?占썬ゲ?歷ｄ궩 (囹멱쎃占??燁믡? ?燁묌뭘)
    sync_module_completion_status(&*pool, Some(app_handle), module_id).await?;

    Ok(())
}

/// ?葯모쬃?占쏜쫱????わ옙 辱쀧궍靜?
#[tauri::command]
pub async fn stop_node_pipeline(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_STOPPED', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "?燁묌뭘??좑옙 ?掠욁윸 ?葯모쬃?占쏜쫱?蘊꾭쬃?辱쀧궍靜????옙??잞옙??");
    println!(">>> Pipeline manually stopped for node: {}", node_id);
    Ok(())
}

/// 辱쀧궍靜????葯모쬃?占쏜쫱???獵뱄옙 (READY ?占쏙옙獄?縕먫솠嶺?
#[tauri::command]
pub async fn resume_node_pipeline(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE node_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&node_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    println!(">>> Pipeline resumed (set to READY) for node: {}", node_id);
    Ok(())
}

/// ?蘊덌옙令덌옙 辱쀧궍靜? ?占쏙옙?蘊? ?屍귩쪟??わ옙 ?歷? ?燁믡?
async fn is_node_stopped(pool: &SqlitePool, node_id: &str) -> bool {
    let state: Option<(String,)> = sqlx::query_as("SELECT node_state FROM document_node WHERE node_id = ?")
        .bind(node_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    
    if let Some((s,)) = state {
        return s == "PAUSED_STOPPED";
    }
    false
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct ActiveNodeInfo {
    pub node_id: String,
    pub project_id: String,
    pub project_name: String,
    pub module_id: Option<String>,
    pub module_name: Option<String>,
    pub target_node_type: String,
    pub node_state: String,
    pub last_action: Option<String>,
}

#[tauri::command]
pub async fn get_all_active_nodes(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<ActiveNodeInfo>, String> {
    let active_nodes = sqlx::query_as::<_, ActiveNodeInfo>(
        "SELECT 
            n.node_id, 
            n.project_id, 
            p.project_name, 
            n.module_id, 
            m.module_name, 
            n.target_node_type, 
            n.node_state, 
            n.last_action 
         FROM document_node n
         JOIN project p ON n.project_id = p.project_id
         LEFT JOIN local_module m ON n.module_id = m.module_id
         WHERE (n.node_state = 'IN_PROGRESS' OR (n.node_state = 'COMPLETED' AND n.last_action LIKE '%RAG ?占쏙옙??辱?')) AND n.is_deleted = 0
         ORDER BY n.updated_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(active_nodes)
}

/// ??뽳옙???野?옙 玉붺┷占???歷ｏ옙?占쏜쬃??????占??섓옙 ?蘊덌옙 ?占쏙옙獄??邕롨맻?映앲쪛?占쏜졊?
#[tauri::command]
pub async fn delete_generation_iteration(
    handle: tauri::AppHandle,
    iteration_id: String,
) -> Result<(), String> {
    let pool = handle.state::<SqlitePool>();

    // 1. ?歷좈컾 ?歷ｏ옙?占쏜쬃????낂쇃 邀썲쟿占?(?蘊덌옙 獄??占???屍귩쪟??
    let iter_row = sqlx::query(
        "SELECT i.node_id, n.target_node_type, i.is_pass, n.project_id 
         FROM generation_iteration i 
         JOIN document_node n ON i.node_id = n.node_id 
         WHERE i.iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let node_id: String = iter_row.get(0);
    let node_type: String = iter_row.get(1);
    let project_id: String = iter_row.get(3);

    // 2. Lock Policy 墉?르占?(?占쏙옙 ?靜♥占?辱뷂옙占?辱쀰、언쬃?グ???占?蘊깍옙?)
    // - Genesis PRD: SAD ??뤄옙 ?歷ο옙 辱뷂옙占??屍귩쪟?
    if node_type == "Genesis_PRD" || node_type.starts_with("GPRD_") {
        let sad_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM document_node WHERE project_id = ? AND target_node_type LIKE 'SAD_%' AND node_state != 'PENDING'")
            .bind(&project_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        if sad_count > 0 { return Err("SAD ??뤄옙令덌옙 ?歷? 辱뷂옙占?辱쀰、언쬃?ク占썼ア?PRD 玉붺┷占?占쏙옙 ??占?????占쏜졐?占쏜졊?".into()); }
    }
    // - SAD_Global: SAD_Module 辱뷂옙占??屍귩쪟?
    else if node_type == "SAD_Global" {
         let mod_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module' AND node_state != 'PENDING'")
            .bind(&project_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        if mod_count > 0 { return Err("獄덂댖占?蘊깍옙占???뤄옙令덌옙 ?歷? 辱뷂옙占?辱쀰、언쬃?ク占썼ア?SAD Global 玉붺┷占?占쏙옙 ??占?????占쏜졐?占쏜졊?".into()); }
    }
    // - SAD_Module: ???옙 獄덂댖占???⑨옙 ??잟쬃????뽳옙 ?屍귩쪟?
    else if node_type == "SAD_Module" {
         let sub_mod_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM document_node WHERE project_id = ? AND target_node_type NOT LIKE 'SAD_%' AND target_node_type NOT LIKE 'GPRD_%' AND target_node_type != 'Genesis_PRD' AND node_state != 'PENDING'")
            .bind(&project_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        if sub_mod_count > 0 { return Err("??⑨옙 獄덂댖占?影ｅ쟿占???歷? 辱뷂옙占?辱쀰、언쬃?ク占썼ア?獄덂댖占?蘊깍옙占?玉붺┷占?占쏙옙 ??占?????占쏜졐?占쏜졊?".into()); }
    }

    // 3. Soft Delete ?掠욑옙
    sqlx::query("UPDATE generation_iteration SET is_deleted = 1, updated_at = ? WHERE iteration_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&iteration_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // 4. ?蘊덌옙 ?占쏙옙 獄?容뽴?곤옙 ??낂쇃 ?占썬ゲ?歷ｄ궩
    let remaining_iters: Vec<(String, i32)> = sqlx::query_as::<_, (String, i32)>(
        "SELECT iteration_id, calculated_score FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC"
    )
    .bind(&node_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if remaining_iters.is_empty() {
        // 獄덂댖占?玉붺┷占?占쏜쬃???占??-> READY ?占쏙옙獄?玉붺쭛占?
        sqlx::query("UPDATE document_node SET node_state = 'READY', current_iteration = 0, current_best_score = 0, updated_at = ? WHERE node_id = ?")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        // ??? 囹?辱?容뽴쮤덌옙??獄?令덍?곤옙 ?占썬ゲ?歷ｄ궩
        let best_score = remaining_iters.iter().map(|(_, s)| *s).max().unwrap_or(0);
        let count = remaining_iters.len() as i32;
        sqlx::query("UPDATE document_node SET current_iteration = ?, current_best_score = ?, updated_at = ? WHERE node_id = ?")
            .bind(count)
            .bind(best_score)
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    let _ = handle.emit("nodes-updated", ());
    Ok(())
}

// ============================================================
// RAG Utilities (Phase 1)
// ============================================================

/// Gemini Embedding API ?蘊꾬옙
async fn call_gemini_embedding(
    client: &Client,
    api_key: &str,
    text: &str,
    task_type: &str, // "RETRIEVAL_DOCUMENT" or "RETRIEVAL_QUERY"
) -> Result<Vec<f32>, String> {
    if api_key.trim().is_empty() {
        return Err("API key is empty. Please configure it in settings.".to_string());
    }

    // [縕먩른占?令덍ㄳ울옙] URL ?닸스???鼎븨啼돇獄?께占??占????덌옙 獄삥떀占???燁묌뭘???ㄹ?API ???蘊꾬옙 容뽴?곤옙??
    let url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

    let body = serde_json::json!({
        "model": "models/gemini-embedding-001",
        "content": { "parts": [{ "text": text }] },
        "taskType": task_type,
    });
    
    let resp = client.post(url)
        .header("x-goog-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;


    
    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Embedding API Error: {} - {}", status, err_text));
    }
    
    let result: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let values = result["embedding"]["values"]
        .as_array()
        .ok_or("No embedding values in response")?
        .iter()
        .map(|v| v.as_f64().unwrap_or(0.0) as f32)
        .collect();
    
    Ok(values)
}

/// JSON ??잞옙獄→쉼占???? ??곤옙 墉?占썼ア?蘊깍옙占?(?蘊덌옙 ?占?占쏙옙 ?野ㅿ옙 ?占썲쵋)
fn chunk_json_document(json_str: &str, node_type: &str) -> Vec<String> {
    let val: serde_json::Value = serde_json::from_str(json_str).unwrap_or_default();
    let mut chunks = Vec::new();
    
    match node_type.to_lowercase().replace(" ", "_").as_str() {
        // ?占?占?Genesis PRD: 壅э옙占?占썸벆 ?℡댃占?轝졽궩 / ??占?/ ?劑뫊制첉 / 影ｅ윜占?轝좑옙 蘊깍옙???占?占?
        "genesis_prd" | "gprd_context_goal" | "gprd_capability_actor" | "gprd_architecture_schema" => {
            // 壅э옙占?占썸벆 ?℡댃占?轝졽궩 + 獄곁콨???잟쬃??(?占쏙옙??틶??令덍?곤옙)
            if let (Some(meta), Some(biz)) = (val.get("metadata"), val.get("business_context")) {
                chunks.push(format!("[GENESIS_PRD:OVERVIEW]\nmetadata: {}\nbusiness_context: {}",
                    serde_json::to_string_pretty(meta).unwrap_or_default(),
                    serde_json::to_string_pretty(biz).unwrap_or_default()));
            }
            // ?燁묌뭘????占썼쾺?令덂텈占?墉?占?
            if let Some(roles) = val.get("user_roles").and_then(|v| v.as_array()) {
                for role in roles {
                    let role_name = role.get("role_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[GENESIS_PRD:ROLE:{}]\n{}",
                        role_name, serde_json::to_string_pretty(role).unwrap_or_default()));
                }
            }
            // ?劑뫊制첉縕?令덂텈占?墉?占?(令덌옙????숎줎?占쏜쪟?囹띰옙????곤옙)
            if let Some(epics) = val.get("core_epics").and_then(|v| v.as_array()) {
                for epic in epics {
                    let epic_id = epic.get("epic_id").and_then(|e| e.as_str()).unwrap_or("unknown");
                    let title = epic.get("title").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[GENESIS_PRD:EPIC:{}:{}]\n{}",
                        epic_id, title, serde_json::to_string_pretty(epic).unwrap_or_default()));
                }
            }
            // 影ｏ옙獄℡텈占??帝같??燁믮Ŋ?
            if let Some(constraints) = val.get("global_constraints") {
                chunks.push(format!("[GENESIS_PRD:CONSTRAINTS]\n{}",
                    serde_json::to_string_pretty(constraints).unwrap_or_default()));
            }
            // 影ｅ윜占??轝좑옙 ?占썹쑝
            if let Some(tech) = val.get("tech_stack") {
                chunks.push(format!("[GENESIS_PRD:TECH_STACK]\n{}",
                    serde_json::to_string_pretty(tech).unwrap_or_default()));
            }
        }

        // ?占?占?PRD (獄덂댖占?: 令덍?곤옙 / 影ｅ쐣劑걩縕?/ ?燁묌뭘???轝좑옙玉?/ ?帝같??燁믮Ŋ?蘊깍옙???占?占?
        "prd" => {
            // ?占쏙옙??틶??令덍?곤옙
            if let Some(overview) = val.get("overview") {
                let name = val.get("project_name").and_then(|n| n.as_str()).unwrap_or("");
                chunks.push(format!("[PRD:OVERVIEW:{}]\n{}",
                    name, serde_json::to_string_pretty(overview).unwrap_or_default()));
            }
            // ??숎줎?影ｅ쐣劑걩縕?令덂텈占?墉?占?
            if let Some(features) = val.get("core_features").and_then(|v| v.as_array()) {
                for feat in features {
                    let fname = feat.get("feature_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    let priority = feat.get("priority").and_then(|p| p.as_str()).unwrap_or("P1");
                    chunks.push(format!("[PRD:FEATURE:{}:{}]\n{}",
                        fname, priority, serde_json::to_string_pretty(feat).unwrap_or_default()));
                }
            }
            // ?燁묌뭘???轝좑옙玉?獄▼죷占?
            if let Some(stories) = val.get("user_stories") {
                chunks.push(format!("[PRD:USER_STORIES]\n{}",
                    serde_json::to_string_pretty(stories).unwrap_or_default()));
            }
            // ?帝같??燁믮Ŋ?
            if let Some(constraints) = val.get("constraints") {
                chunks.push(format!("[PRD:CONSTRAINTS]\n{}",
                    serde_json::to_string_pretty(constraints).unwrap_or_default()));
            }
        }

        // ?占?占?FSD: 影ｅ쐣劑걩 獄덌옙占???곤옙 蘊깍옙??(令덂텈占?FUNC-ID令덌옙 囹띰옙????곤옙) ?占?占?
        "fsd" => {
            if let Some(features) = val.get("features").and_then(|v| v.as_array()) {
                for feat in features {
                    let func_id = feat.get("func_id").and_then(|f| f.as_str()).unwrap_or("unknown");
                    let module = feat.get("module").and_then(|m| m.as_str()).unwrap_or("");
                    let summary = feat.get("summary").and_then(|s| s.as_str()).unwrap_or("");
                    chunks.push(format!("[FSD:{}:{}:{}]\n{}",
                        func_id, module, summary,
                        serde_json::to_string_pretty(feat).unwrap_or_default()));
                }
            }
        }

        // ?占?占?User Flow: ?蒻낉옙玉붺쭛?닎(?蘊덌옙 影욆퀓?? ??곤옙 蘊깍옙???占?占?
        "user_flow" => {
            // 令??蘊덌옙獄?令덂텈占??蒻낉옙玉붺쭛?닎 ?轝좑옙?逆븝옙 墉?占?
            if let Some(nodes) = val.get("nodes").and_then(|v| v.as_array()) {
                for node in nodes {
                    let id = node.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let ntype = node.get("node_type").and_then(|t| t.as_str()).unwrap_or("");
                    let label = node.get("label").and_then(|l| l.as_str()).unwrap_or("");
                    let func_ids = node.get("mapped_func_ids")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(","))
                        .unwrap_or_default();
                    chunks.push(format!("[USER_FLOW:STEP:{}:{}:{}] mapped_funcs=[{}]\n{}",
                        id, ntype, label, func_ids,
                        serde_json::to_string_pretty(node).unwrap_or_default()));
                }
            }
            // ?占?(?占쏜쬃? ??낂쇃????わ옙??墉?占썼ア?獄▼죷弟릎 囹듸옙囹?獄??帝걟??
            if let Some(edges) = val.get("edges") {
                chunks.push(format!("[USER_FLOW:EDGES]\n{}",
                    serde_json::to_string_pretty(edges).unwrap_or_default()));
            }
        }

        // ?占?占?IA: ?塋얍틬 囹몌옙??+ ?塋얍틬縕???ゆ뵸獄잍숴??蘊깍옙???占?占?
        "ia" => {
            // ?占썹쑝 ?塋얍틬 囹몌옙???蘊덃뵸 (??덌옙囹뜹돋啼슣??囹긺쭛??囹띰옙??ｉ뭘)
            if let Some(hierarchy) = val.get("hierarchy") {
                chunks.push(format!("[IA:HIERARCHY]\n{}",
                    serde_json::to_string_pretty(hierarchy).unwrap_or_default()));
            }
            // 令??塋얍틬????ゆ뵸獄잍숴?삭쳺??塋얍틬 ??곤옙獄?墉?占?
            if let Some(screens) = val.get("screen_elements").and_then(|v| v.as_array()) {
                for screen in screens {
                    let sid = screen.get("screen_id").and_then(|s| s.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[IA:SCREEN:{}]\n{}",
                        sid, serde_json::to_string_pretty(screen).unwrap_or_default()));
                }
            }
        }

        // ?占?占?ERD: ?葯모쬃?납塋억옙 + 囹듸옙囹몌옙占?蘊깍옙???占?占?
        "erd" => {
            if let Some(tables) = val.get("tables").and_then(|v| v.as_array()) {
                for table in tables {
                    let tname = table.get("table_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[ERD:TABLE:{}]\n{}",
                        tname, serde_json::to_string_pretty(table).unwrap_or_default()));
                }
            }
            // 令?囹듸옙囹몌옙占?令덂텈占?墉?占?(?葯모쬃?납?令?墉녻퀎??囹듸옙囹?囹띰옙??ｉ뭘)
            if let Some(rels) = val.get("relationships").and_then(|v| v.as_array()) {
                for rel in rels {
                    let src = rel.get("source_table").and_then(|s| s.as_str()).unwrap_or("");
                    let tgt = rel.get("target_table").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[ERD:REL:{}->{}]\n{}",
                        src, tgt, serde_json::to_string_pretty(rel).unwrap_or_default()));
                }
            }
        }

        // ?占?占?Wireframe: ?塋얍틬 ??곤옙 + 玉붺쭛占??€르靜⇔?榕꿜궩 囹몌옙??蘊깍옙???占?占?
        "wireframe" => {
            if let Some(screens) = val.get("screens").and_then(|v| v.as_array()) {
                for screen in screens {
                    let sid = screen.get("screen_id").and_then(|s| s.as_str()).unwrap_or("unknown");
                    let sname = screen.get("screen_name").and_then(|n| n.as_str()).unwrap_or("");
                    // ?塋얍틬 ?占썹쑝獄???わ옙??墉?占썼ア?(玉붺쭛占??燁믮쪡?
                    chunks.push(format!("[WIREFRAME:SCREEN:{}:{}]\n{}",
                        sid, sname, serde_json::to_string_pretty(screen).unwrap_or_default()));
                    // 容븟??獄?令?玉붺쭛占??令덂텈占?墉?占썼ア?(?蘊????€르靜⇔?榕꿜궩 囹띰옙??ｉ뭘)
                    if let Some(regions) = screen.get("layout_regions").and_then(|r| r.as_array()) {
                        for region in regions {
                            let rname = region.get("region_name").and_then(|r| r.as_str()).unwrap_or("unknown");
                            chunks.push(format!("[WIREFRAME:REGION:{}:{}:{}]\n{}",
                                sid, sname, rname,
                                serde_json::to_string_pretty(region).unwrap_or_default()));
                        }
                    }
                }
            }
        }

        // ?占?占?API Spec: ?塋억옙?燁묖쪟?蘊덌옙 蘊깍옙??(獄겻눢占??囹띈텫占??帝걟占? ?占?占?
        "api_spec" => {
            if let Some(endpoints) = val.get("endpoints").and_then(|v| v.as_array()) {
                for ep in endpoints {
                    let method = ep.get("method").and_then(|m| m.as_str()).unwrap_or("GET");
                    let path = ep.get("path").and_then(|p| p.as_str()).unwrap_or("/");
                    let summary = ep.get("summary").and_then(|s| s.as_str()).unwrap_or("");
                    // [RAG 縕먩른占? 囹띰옙??令덌옙辱쀰、억옙獄??占썬윸 ?帝걟繹???蘊꾬옙/?鼎븨啼돇獄?께占??獵? ??껓옙??容븟??
                    chunks.push(format!("[API:{}:{}:{}] headers, path_params, query_params\n{}",
                        method, path, summary,
                        serde_json::to_string_pretty(ep).unwrap_or_default()));
                }
            }
        }

        // ?占?占?TC: ?葯멩벆???ㅿ옙?歷ζ벆縕?蘊깍옙??(TC-ID + 獄ㅶ쵟占??影ｅ쐣劑걩 ?帝걟占? ?占?占?
        "tc" => {
            if let Some(cases) = val.get("test_cases").and_then(|v| v.as_array()) {
                for tc in cases {
                    let tc_id = tc.get("tc_id").and_then(|t| t.as_str()).unwrap_or("unknown");
                    let func_id = tc.get("mapped_func_id").and_then(|f| f.as_str()).unwrap_or("");
                    let title = tc.get("title").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[TC:{}:{}:{}]\n{}",
                        tc_id, func_id, title,
                        serde_json::to_string_pretty(tc).unwrap_or_default()));
                }
            }
        }

        // ?占?占?SAD Core ERD: ?映앭돣??됵옙 + 囹듸옙囹??占썹쑝 ?占?占?
        "sad_core_erd" => {
            if let Some(entities) = val.get("entities").and_then(|v| v.as_array()) {
                for entity in entities {
                    let ename = entity.get("entity_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_ERD:ENTITY:{}]\n{}",
                        ename, serde_json::to_string_pretty(entity).unwrap_or_default()));
                }
            }
            if let Some(rels) = val.get("relationships").and_then(|v| v.as_array()) {
                for rel in rels {
                    let from = rel.get("from_entity").and_then(|f| f.as_str()).unwrap_or("");
                    let to = rel.get("to_entity").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_ERD:REL:{}->{}]\n{}",
                        from, to, serde_json::to_string_pretty(rel).unwrap_or_default()));
                }
            }
        }

        // ?占?占?SAD Auth & RBAC: ?蘊꾬옙 ?占썲쵋 + ??占썼쾺?蘊깍옙???占?占?
        "sad_auth_rbac" => {
            // ?蘊꾬옙/?靜쪊占??占썲쵋 令덍?곤옙
            let auth = val.get("auth_method").and_then(|a| a.as_str()).unwrap_or("");
            let token = val.get("token_strategy").and_then(|t| t.as_str()).unwrap_or("");
            let policies = val.get("access_policies")
                .and_then(|p| serde_json::to_string_pretty(p).ok())
                .unwrap_or_default();
            chunks.push(format!("[SAD_AUTH:STRATEGY] auth={}, token={}\naccess_policies: {}",
                auth, token, policies));
            // 令???占썼쾺?墉?占?
            if let Some(roles) = val.get("roles").and_then(|v| v.as_array()) {
                for role in roles {
                    let rname = role.get("role_name").and_then(|r| r.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_AUTH:ROLE:{}]\n{}",
                        rname, serde_json::to_string_pretty(role).unwrap_or_default()));
                }
            }
        }

        // ?占?占?SAD Interface & Error: ?占썲쵋 令덍?곤옙 + ??믣돰 ?좂ゾ占썼쾺?蘊깍옙???占?占?
        "sad_interface_error" => {
            // API 影욒?곤옙 ?占썲쵋 ??밭깂
            let versioning = val.get("api_versioning_strategy").and_then(|v| v.as_str()).unwrap_or("");
            let format = val.get("response_format").and_then(|f| f.as_str()).unwrap_or("");
            let pagination = val.get("pagination_strategy").and_then(|p| p.as_str()).unwrap_or("");
            chunks.push(format!("[SAD_IFACE:STRATEGY] versioning={}, format={}, pagination={}",
                versioning, format, pagination));
            // ??믣돰 ?좂ゾ占썼쾺?墉?占?
            if let Some(codes) = val.get("error_codes").and_then(|v| v.as_array()) {
                for code in codes {
                    let c = code.get("code").and_then(|c| c.as_str()).unwrap_or("");
                    let status = code.get("http_status").and_then(|s| s.as_i64()).unwrap_or(0);
                    chunks.push(format!("[SAD_IFACE:ERROR:{}:{}]\n{}",
                        c, status, serde_json::to_string_pretty(code).unwrap_or_default()));
                }
            }
        }

        // ?占?占?SAD Tech Stack: ?占썹쑝獄???わ옙??墉?占?(??????占쏙옙) ?占?占?
        "sad_tech_stack" => {
            chunks.push(format!("[SAD_TECH_STACK]\n{}",
                serde_json::to_string_pretty(&val).unwrap_or_default()));
        }

        // ?占?占?SAD Non-Tech: ??르占썹じ堤솘?띈쾺?蘊깍옙???占?占?
        "sad_non_tech" => {
            let categories = ["legal_constraints", "compliance_requirements",
                "performance_targets", "scalability_requirements", "budget_constraints"];
            for cat in categories {
                if let Some(items) = val.get(cat) {
                    let items_str = serde_json::to_string_pretty(items).unwrap_or_default();
                    if items_str.len() > 10 {
                        chunks.push(format!("[SAD_NON_TECH:{}]\n{}", cat.to_uppercase(), items_str));
                    }
                }
            }
        }

        // ?占?占?SAD Module List: 獄덂댖占썼쾺?墉?占??占?占?
        "sad_module_list" => {
            if let Some(modules) = val.get("modules").and_then(|v| v.as_array()) {
                for module in modules {
                    let mname = module.get("module_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_MODULE:{}]\n{}",
                        mname, serde_json::to_string_pretty(module).unwrap_or_default()));
                }
            }
        }

        // ?占?占?SAD Epic Mapping: 獄ㅶ쵟占썼쾺?墉?占??占?占?
        "sad_epic_mapping" => {
            if let Some(mappings) = val.get("mappings").and_then(|v| v.as_array()) {
                for mapping in mappings {
                    let eid = mapping.get("epic_id").and_then(|e| e.as_str()).unwrap_or("unknown");
                    let ename = mapping.get("epic_name").and_then(|n| n.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_EPIC_MAP:{}:{}]\n{}",
                        eid, ename, serde_json::to_string_pretty(mapping).unwrap_or_default()));
                }
            }
        }

        // ?占?占?SAD Module Deps: ???뿈 囹듸옙囹몌옙占?+ 壅ю짆묕옙 ?帝같占?蘊깍옙???占?占?
        "sad_module_deps" => {
            if let Some(deps) = val.get("dependencies").and_then(|v| v.as_array()) {
                for dep in deps {
                    let from = dep.get("from_module").and_then(|f| f.as_str()).unwrap_or("");
                    let to = dep.get("to_module").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_DEP:{}->{}]\n{}",
                        from, to, serde_json::to_string_pretty(dep).unwrap_or_default()));
                }
            }
            if let Some(order) = val.get("recommended_build_order") {
                chunks.push(format!("[SAD_DEP:BUILD_ORDER]\n{}",
                    serde_json::to_string_pretty(order).unwrap_or_default()));
            }
        }

        // ?占?占??歷졾걶: 容뽴?곤옙????影ｅ윜? 蘊깍옙占??占?占?
        _ => {
            if let Some(obj) = val.as_object() {
                for (key, value) in obj {
                    let chunk_text = format!("[{}]\n{}", key, 
                        serde_json::to_string_pretty(value).unwrap_or_default());
                    if chunk_text.len() > 50 {
                        chunks.push(chunk_text);
                    }
                }
            }
        }
    }
    
    // 囹멱쎃占? ?占썹쑝 獄↑퀎占???밭깂 墉?占?(容뽩텈? 2000?? 獄↑퀓???葯몌옙??
    if let Ok(summary) = serde_json::to_string_pretty(&val) {
        if summary.len() > 100 {
            chunks.insert(0, format!("[FULL_DOCUMENT:{}]\n{}", node_type, 
                summary.chars().take(2000).collect::<String>()));
        }
    }
    chunks
}

/// ?占쏙옙???蘊덌옙????잞옙獄→쉼占??占쏙옙??쀯옙??縕믠댃占?DB???占??
async fn store_document_embeddings(
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    module_id: Option<&str>,
    node_id: &str,
    node_type: &str,
    iteration_id: &str,
    document_json: &str,
    score: i32,
) -> Result<(), String> {
    // [辱쀧궍??獄삥떀?] ?占쏙옙???占쏙옙??뽳옙 ?占?鴉뺧옙影??? ?歷좈컾 ?蘊덌옙(node_id)??影ｅ윜????잟쬃??? 獄잍쉼? ??占?
    // vec0 ?葯모쬃?납劑칳??metadata ?葯모쬃?납?獄덂댖占??좑옙 ??占?墉?겒??
    sqlx::query("DELETE FROM document_embeddings WHERE rowid IN (SELECT rowid FROM embedding_metadata WHERE node_id = ?)")
        .bind(node_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Existing embeddings (vec0) cleanup error: {}", e))?;

    sqlx::query("DELETE FROM embedding_metadata WHERE node_id = ?")
        .bind(node_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Existing metadata cleanup error: {}", e))?;

    let chunks = chunk_json_document(document_json, node_type);
    
    for (idx, chunk) in chunks.iter().enumerate() {
        // 1. Gemini Embedding API ?蘊꾬옙
        let embedding = call_gemini_embedding(client, api_key, chunk, "RETRIEVAL_DOCUMENT").await?;
        let embedding_json = serde_json::to_string(&embedding).unwrap_or_default();
        
        // 2. embedding_metadata??獄곁콨? ??낂쇃 獄잍쉼? ?擁ｏ옙 ??rowid ??낂쇃
        let now = chrono::Utc::now().to_rfc3339();
        let result = sqlx::query(
            "INSERT INTO embedding_metadata (project_id, module_id, node_type, node_id, iteration_id, chunk_index, chunk_text, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(project_id)
        .bind(module_id)
        .bind(node_type)
        .bind(node_id)
        .bind(iteration_id)
        .bind(idx as i32)
        .bind(chunk)
        .bind(score)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("Metadata insert error: {}", e))?;
        
        let rowid = result.last_insert_rowid();
        
        // 3. vec0 令덌옙???葯모쬃?납?뱄옙 ?占쏙옙???擁ｏ옙 (令덅빱? rowid)
        sqlx::query("INSERT INTO document_embeddings (rowid, embedding) VALUES (?, ?)")
            .bind(rowid)
            .bind(&embedding_json)
            .execute(pool)
            .await
            .map_err(|e| format!("Embedding insert error: {}", e))?;
    }
    
    println!("[RAG] Stored {} embedding chunks for node {} ({})", chunks.len(), node_id, node_type);
    Ok(())
}

/// ?占쏙옙??틶???獄덂댖占??占쏙옙??獄↑퀎占썼쳺?縕믠댃占?DB????わ옙 ??ｐ쪟?
#[tauri::command]
pub async fn index_project_embeddings(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    client: State<'_, Client>,
    project_id: String,
    api_key: String,
) -> Result<i32, String> {
    // 0. API ??縕먩른占?(壅э옙弟릎?占쏙옙 囹띈땃容?DB??좑옙 邀썲쟿占?
    let mut actual_api_key = api_key;
    if actual_api_key.trim().is_empty() {
        println!(">>> [index_project_embeddings] API key is empty, fetching from DB...");
        let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
            .fetch_optional(&*pool).await.map_err(|e| e.to_string())?;
        
        actual_api_key = match session_res {
            Some(row) => row.get::<String, _>("api_key_encrypted"),
            None => return Err("API ??? 墉녷㉩占????占쏜졐?占쏜졊? ??⑨옙??좑옙 API ??? 獄잍쉼? ?歟듸옙??辱ζ쉼占??".to_string()),
        };
    }
    let api_key = actual_api_key; // ?占?占쏙옙???ㄹ??歷ｏ옙 獄??곤옙??좑옙 ?燁묌뭘

    // 1. ?歷좈컾 ?占쏙옙??틶???獄덂댖占??占쏙옙???蘊덌옙 邀썲쟿占?
    // [容뽴?곤옙?? 獄ㅿ옙?獄??蘊덃쉾???帝같占??歷ｏ옙??縕먲옙囹띈텫占??蘊덌옙獄?邀썲쟿占?
    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node 
         WHERE project_id = ? 
         AND node_state = 'COMPLETED'
         AND (
            updated_at > (
                SELECT COALESCE(MAX(created_at), '1970-01-01') 
                FROM embedding_metadata 
                WHERE project_id = ?
            )
            OR
            node_id NOT IN (SELECT DISTINCT node_id FROM embedding_metadata WHERE project_id = ?)
         )"
    )
    .bind(&project_id)
    .bind(&project_id)
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    let mut indexed_count = 0;
    let mut has_genesis = false;
    let mut genesis_node_id = None;
    
    for node in nodes {
        if node.node_category == "GENESIS" {
            has_genesis = true;
            // 1-C(Architecture_Schema) ?蘊덌옙令덌옙 ?占쏜졊삭グ??歷? ?占??ID獄??燁묌뭘, ?占썲컧獄??占썹궘 GENESIS ?蘊덌옙???燁묌뭘
            if genesis_node_id.is_none() || node.target_node_type == "GPRD_Architecture_Schema" {
                genesis_node_id = Some(node.node_id.clone());
            }
            continue;
        }

        // ?占쏙옙 ?占썬ゲ?歷ｄ궩: ??덌옙?占쏜쬃??帝같占??堤솘占?
        let _ = app_handle.emit("pipeline-status", format!("[{}] RAG 분석 진행 중..", node.target_node_type));
        let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("RAG ?占쏙옙??辱?..")
            .bind(Utc::now().to_rfc3339())
            .bind(&node.node_id)
            .execute(&*pool)
            .await;
        let _ = app_handle.emit("nodes-updated", ());

        // 2. 令??蘊덌옙??容뽴쮤덌옙 ??좑옙(容뽴쮤덃퍋) 玉붺┷占??邀썲쟿占?
        let best_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
        if let Some(iter) = best_iter {
            // ??ｐ쪟??轝좑옙
            store_document_embeddings(
                &*pool, &*client, &api_key,
                &project_id, node.module_id.as_deref(),
                &node.node_id, &node.target_node_type,
                &iter.iteration_id, &iter.generated_draft_json,
                iter.calculated_score.unwrap_or(0),
            ).await?;
            
            indexed_count += 1;
        }

        // ?占쏙옙 容뺧옙???
        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
            .bind(Utc::now().to_rfc3339())
            .bind(&node.node_id)
            .execute(&*pool)
            .await;
        let _ = app_handle.emit("nodes-updated", ());
    }

    // 3. GPRD ???쪛縕???ｐ쪟?(辱뷂옙占???歷ι뭘???占쏙옙 囹띈땃容?
    if has_genesis {
        let full_prd = get_full_approved_prd(&*pool, &project_id).await;
        if full_prd != "{}" && !full_prd.is_empty() {
            // ?占??ID令덌옙 辱뷂옙??낉옙辱뷂옙 ?劑눂占??덂틬 ??⑨옙 ??縕?邀썲쟿占??蒻낉옙
            let rep_id = match genesis_node_id {
                Some(id) => id,
                None => {
                    sqlx::query_scalar("SELECT node_id FROM document_node WHERE project_id = ? AND node_category = 'GENESIS' LIMIT 1")
                        .bind(&project_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?
                }
            };

            // ?占쏙옙 ?占썬ゲ?歷ｄ궩: ???쪛 PRD ??ｐ쪟??鼎븨黎?
            let _ = app_handle.emit("pipeline-status", "???쪛 PRD RAG ?占쏙옙??辱?..");
            let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind("???쪛 RAG ?占쏙옙??辱?..")
                .bind(Utc::now().to_rfc3339())
                .bind(&rep_id)
                .execute(&*pool)
                .await;
            let _ = app_handle.emit("nodes-updated", ());

            // [???옙] hardcoded "integrated-prd" ?占????⑨옙 邀썸른占??わ옙 iteration_id獄?邀썲쟿占???ㄹ??燁묌뭘 (FK ?帝같??邀썲쐦??辱쀯옙??
            let best_genesis_it: String = sqlx::query_scalar(
                "SELECT iteration_id FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY is_pass DESC, calculated_score DESC LIMIT 1"
            )
            .bind(&rep_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| format!("Genesis iteration lookup error: {}", e))?;

            store_document_embeddings(
                &*pool, &*client, &api_key,
                &project_id, None,
                &rep_id, "Genesis_PRD",
                &best_genesis_it, &full_prd,
                100, // ???쪛縕먫퀎? ??좑옙 ?占쏙옙 蘊깍옙??
            ).await?;

            indexed_count += 1;

            // ?占쏙옙 容뺧옙???
            let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&rep_id)
                .execute(&*pool)
                .await;
            let _ = app_handle.emit("nodes-updated", ());
        }
    }
    
    Ok(indexed_count as i32)
}

/// RAG 囹띰옙??囹뜹쐦?껇쳺??屍귨옙???鼎퐗????졾콪占?轝졽궩獄?獄삣콪占?(?歷???
async fn get_rag_context(
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    query_text: &str,
    limit: i32,
    exclude_node_ids: Vec<String>,
) -> Result<String, String> {
    // 1. ?占쏙옙??獄덂댖旅??蘊꾬옙 (RETRIEVAL_QUERY ?屍귨옙)
    let query_vector = call_gemini_embedding(client, api_key, query_text, "RETRIEVAL_QUERY").await
        .map_err(|e| format!("Query embedding error: {}", e))?;
    let query_json = serde_json::to_string(&query_vector).unwrap_or_default();

    // 2. ?劑뵳占??囹띰옙??(k-NN) - ?帝같??邀썲쐦??獄삡겘占?
    let mut query_builder = sqlx::QueryBuilder::new(
        "SELECT m.chunk_text, m.node_type, v.distance 
         FROM document_embeddings v
         JOIN embedding_metadata m ON v.rowid = m.rowid
         WHERE v.embedding MATCH "
    );
    query_builder.push_bind(&query_json);
    query_builder.push(" AND k = ");
    query_builder.push_bind(limit);
    query_builder.push(" AND m.project_id = ");
    query_builder.push_bind(project_id);

    if !exclude_node_ids.is_empty() {
        query_builder.push(" AND m.node_id NOT IN (");
        let mut separated = query_builder.separated(", ");
        for id in exclude_node_ids {
            separated.push_bind(id);
        }
        query_builder.push(")");
    }

    query_builder.push(" ORDER BY v.distance ASC");

    let rows = query_builder
        .build()
        .fetch_all(pool)
        .await
        .map_err(|e| format!("RAG search error: {}", e))?;

    if rows.is_empty() {
        return Ok("".to_string());
    }

    let mut context = String::from("\n[REFERENCE_DOCUMENTS]\n(The following are relevant snippets retrieved from existing documentation and past requirements. Use them for consistency and context.)\n");
    for (i, row) in rows.iter().enumerate() {
        let text: String = row.get(0);
        let ntype: String = row.get(1);
        let dist: f64 = row.get(2);
        context.push_str(&format!("\n-- REFERENCE {} (Type: {}, Relevance: {:.2}%) --\n{}\n", 
            i + 1, ntype, (1.0 - dist) * 100.0, text));
    }

    Ok(context)
}

/// 특정 노드의 기존 데이터와 변경 의도 간의 교집합(유사도)을 판별합니다.
async fn check_node_intersection(
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    node_id: &str,
    query_text: &str,
) -> Result<f64, String> {
    // 1. 의도(Intent) 벡터화
    let query_vector = call_gemini_embedding(client, api_key, query_text, "RETRIEVAL_QUERY").await
        .map_err(|e| format!("Intersection query embedding error: {}", e))?;
    let query_json = serde_json::to_string(&query_vector).unwrap_or_default();

    // 2. 해당 노드에 속한 조각들 중 가장 높은 유사도 검색
    let row = sqlx::query(
        "SELECT v.distance 
         FROM document_embeddings v
         JOIN embedding_metadata m ON v.rowid = m.rowid
         WHERE m.node_id = ? AND m.project_id = ? AND v.embedding MATCH ? AND k = 1
         ORDER BY v.distance ASC LIMIT 1"
    )
    .bind(node_id)
    .bind(project_id)
    .bind(&query_json)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Intersection search error: {}", e))?;

    if let Some(r) = row {
        let dist: f64 = r.get(0);
        let similarity = 1.0 - dist;
        println!(">>> [RAG-Intersection] Node: {}, Similarity: {:.4}", node_id, similarity);
        Ok(similarity)
    } else {
        println!(">>> [RAG-Intersection] Node: {}, No embeddings found", node_id);
        Ok(0.0)
    }
}

/// RAG 囹띰옙???葯멩벆?蘊꾦뭘 Tauri ?€쐢鸚??
#[tauri::command]
pub async fn search_similar_documents(
    pool: State<'_, SqlitePool>,
    client: State<'_, Client>,
    project_id: String,
    api_key: String,
    query: String,
    limit: i32,
) -> Result<Vec<serde_json::Value>, String> {
    let query_vector = call_gemini_embedding(&*client, &api_key, &query, "RETRIEVAL_QUERY").await
        .map_err(|e| format!("Query embedding error: {}", e))?;
    let query_json = serde_json::to_string(&query_vector).unwrap_or_default();

    let rows = sqlx::query(
        "SELECT m.chunk_text, m.node_type, m.node_id, v.distance 
         FROM document_embeddings v
         JOIN embedding_metadata m ON v.rowid = m.rowid
         WHERE v.embedding MATCH ? AND k = ? AND m.project_id = ?
         ORDER BY v.distance ASC"
    )
    .bind(&query_json)
    .bind(limit)
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Search error: {}", e))?;

    let results = rows.into_iter().map(|row| {
        let text: String = row.get(0);
        let ntype: String = row.get(1);
        let nid: String = row.get(2);
        let dist: f64 = row.get(3);
        serde_json::json!({
            "text": text,
            "node_type": ntype,
            "node_id": nid,
            "similarity": 1.0 - dist
        })
    }).collect();


    Ok(results)
}

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

    // 1. ?占쏙옙????잟쬃??獄℡텈占?(God's Eye View獄??占쏙옙 ?占쏜　??℡댃占?轝졽궩)
    let genesis_prd = get_full_approved_prd(&*pool, &project_id).await;
    
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

    // 3. Gemini API ?蘊꾬옙
    let response = call_gemini(&*client, &api_key, "You are a senior solution architect who determines the impact of changes.", &prompt, Some(flattened_schema))
        .await
        .map_err(|e| match e {
            PipelineError::ApiError(code, msg) => format!("API Error ({}): {}", code, msg),
            PipelineError::Internal(msg) => format!("Internal Error: {}", msg),
        })?;

    let routing: crate::schemas::RoutingSchema = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse routing JSON: {} | Content: {}", e, response))?;

    // [Sprint 1 HITL] ?燁묌뭘??좑옙囹??占???蘊덌옙 ?℡댃占????밭뿆??わ옙 ?歷좂븼??獄삽?곤옙
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
    
    // Sprint 2??좑옙 囹긺쭜占??Taint Cascade(??ⓨ㈈ ?占쏙옙) 獄??곤옙???帝같占??좒쬃???섓옙??
    // ?占쏙옙??獄?쮤덃벚獄???룩맻囹??歟볣솷 獄삣콪占?
    
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

    // 1. SAD Global ?℡댃占?轝졽궩 獄℡텈占?
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

    // 3. Gemini API ?蘊꾬옙
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

    // 0. Intent ?占??
    sqlx::query("UPDATE project SET increment_intent = ?, updated_at = ? WHERE project_id = ?")
        .bind(serde_json::to_string(&intent).unwrap_or_default())
        .bind(&now)
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // 1. ???뿈????잟쬃??獄℡텈占?(SAD_module_deps)
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
            // BFS獄???ⓨ㈈ ?屍귨옙 容뷰눢占?
            let mut queue: std::collections::VecDeque<String> = targets.clone().into();
            while let Some(current) = queue.pop_front() {
                for dep in &deps_schema.dependencies {
                    if dep.to_module == current { // current令덌옙 縕먲옙囹띈텫占썼グ?current獄????뿈??わ옙 from_module????ⓨ㈈??
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

    // 2. DB ?占썬ゲ?歷ｄ궩: 囹듸옙???蘊덌옙??⑨옙 STALE ?占쏙옙獄??占쏜쬃?
    // module_id ??믭옙 target_node_type??獄ㅶ쑉???わ옙 囹띈땃容?墉?겒??
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for mid in impacted_modules {
        // [令덍ㄳ울옙] ?歷좑옙 邀썲쟿占썼쳺??帝걟???섓옙 ??⑨옙 ID獄℡텈占?獄ㅶ쑉??(?制？蜈????낂쇃)
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

    // 3. UI 令덃×占??歷좂븼??獄삽?곤옙
    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "Taint Cascade ?占쏙옙: ??? ?蘊덌옙??⑩쬃?STALE ?占쏙옙獄??占쏙옙???옙??잞옙??");

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
        let _ = app_handle.emit("pipeline-status", format!("노드 {} 복구: 변경 사항 없음", node.target_node_type));


        return Ok(());
    }

    // SAD Global 獄℡텈占?
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
    let rag_context = get_rag_context(&pool, &client, &api_key, &project_id, &intent, 5, vec![node_id.clone()]).await
        .unwrap_or_else(|e| {
            println!(">>> [RAG] refinement search failed: {}", e);
            "No additional context found via RAG.".to_string()
        });

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

    // 3. AI ?蘊꾬옙
    let response = call_gemini(&*client, &api_key, "You are a JSON Patch generation expert.", &prompt_content, None)
        .await
        .map_err(|e| format!("AI Generation failed: {:?}", e))?;

    // 4. ??곤옙 ?占썽뭘
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
    let _ = app_handle.emit("pipeline-status", format!("Patch applied to {}. Starting auto-validation...", node.target_node_type));

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

    // 令덌옙??容뽴?곤옙 ?歷ｏ옙?占쏜쬃??(獄삥뒻占??占썽뭘????곤옙)
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // ?歷ο옙 pass 縕믭옙占?(Original)
    let original_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 AND iteration_id != ? ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node_id)
    .bind(&latest_iter.iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "No original version found to compare.".to_string())?;

    // SAD Global 獄℡텈占?
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
    let rag_context = get_rag_context(&pool, &client, &api_key, &project_id, &intent, 5, vec![node_id.clone()]).await
        .unwrap_or_else(|e| {
            println!(">>> [RAG] refinement search failed: {}", e);
            "No additional context found via RAG.".to_string()
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

    // 3. AI ?蘊꾬옙
    let response = call_gemini(&*client, &api_key, "You are a senior refinement validator.", &prompt_content, Some(flattened_schema))
        .await
        .map_err(|e| format!("Validation AI call failed: {:?}", e))?;

    let eval: crate::schemas::EvaluationResult = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse evaluation result: {} | Content: {}", e, response))?;

    // 4. 囹뜹쐦???占??
    let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();
    let critical_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();

    // 80???歷ο옙?疫딉옙 critical_errors令덌옙 ?占썲컧獄???믭옙 ??쏃쟽 令덌옙?鴉딉옙 囹띰옙??(???獄??占쏙옙????占?HITL ?堤솘占??屍귨옙)
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
    let _ = app_handle.emit("pipeline-status", format!("{} Validation Complete (Score: {})", node.target_node_type, eval.score));
    
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
        let _ = app_handle.emit("pipeline-status", format!("Retrying patch... (Attempt {}/{})", i + 1, retry_count));
        
        match generate_and_apply_patch(
            app_handle.clone(),
            pool.clone(),
            client.clone(),
            api_key.clone(),
            project_id.clone(),
            node_id.clone()
        ).await {
            Ok(_) => {
                // ??곤옙 ?歟볣솷 ?? validate_refinement_node令덌옙 ?歷???좑옙 ?蘊꾬옙??
                // 囹띰옙辱?囹뜹쐦?껇쳺??屍귩쪟???ㄹ???좑옙令덌옙 ?帝찂弱먫グ?獄닷댃占?辱쀧궍靜? 令덌옙?鴉뺧옙辱뷂옙獄? 
                // ?獵배맻?蒻낉옙 ??곤옙??generate_and_apply_patch令덌옙 ?歟볣솷(??믣돰 ?占쏜쬃???껓옙)?占쏜졊??囹띰옙占??屍귩쪟?
                // ??⑨옙 ??좑옙 影ｅ쐣占?辱쀧궍靜??占?validate_refinement_node ?歷ｏ옙??囹뜹쐦?껇쳺??獵배맻??墉?르占?歷η꽚 ??
                
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

    let _ = app_handle.emit("pipeline-status", "Global Refinement: Committing all changes...");

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. 獄덂댖占?STALE ??믭옙 Refined(PAUSED_HITL) ?蘊덌옙 墉녷㉬??
    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND (node_state = 'PAUSED_HITL' OR node_state = 'STALE')"
    )
    .bind(&project_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for node in nodes {
        // 容뽴?곤옙 ?歷ｏ옙?占쏜쬃???옙 ?屍귨옙?逆븝옙 ?野?쪟?
        let latest_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? ORDER BY iteration_number DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // 影ｅ윜???野?쪟??囹띰옙褶?容뺧옙???
        sqlx::query("UPDATE generation_iteration SET is_pass = 0 WHERE node_id = ?")
            .bind(&node.node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // ??縕믭옙占??野?쪟?
        sqlx::query("UPDATE generation_iteration SET is_pass = 1 WHERE iteration_id = ?")
            .bind(&latest_iter.iteration_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // ?蘊덌옙 ?占쏙옙 ?占쏙옙墉?겒??
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
    let _ = app_handle.emit("pipeline-status", "Global Refinement Committed Successfully.");

    Ok(())
}
