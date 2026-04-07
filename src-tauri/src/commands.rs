use serde::{Deserialize, Serialize};
use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Manager, Emitter};
use sqlx::{SqlitePool, FromRow};

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum NodeState {
    Pending,
    Ready,
    InProgress,
    Completed,
    PausedHitl,
    PausedApiError,
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
        }
    }
}

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
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(default)]
    pub current_node_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct DocumentNode {
    pub node_id: String,
    pub project_id: String,
    #[sqlx(default)]
    pub module_id: Option<String>,
    pub target_node_type: String,
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

// ============================================================
// v2 新 구조체
// ============================================================

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct GlobalContext {
    pub context_id: String,
    pub project_id: String,
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
    .bind(api_key) // 암호화 없이 저장 (MVP 수준)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_project(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<Project, String> {
    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ? AND is_deleted = 0"
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

    // 0. 기본 세션 확인 및 생성 (FK 제약 조건 충족)
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

    // 1. 프로젝트 생성 (v2: pipeline_phase 포함)
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

    // 2. v2: Genesis PRD 노드 1개만 생성 (기존 8개 → 1개)
    let node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'Genesis_PRD', 'GENESIS', 'READY', 0, 10, 85, 0, ?, ?, 0)"
    )
    .bind(node_id)
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
    sqlx::query(
        "UPDATE project SET is_deleted = 1 WHERE project_id = ?"
    )
    .bind(project_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn run_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    node_type: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> Pipeline started for node: {} in project: {}", node_type, project_id);
    // 1. 노드 상태 조회 및 가드
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = ?"
    )
    .bind(&project_id)
    .bind(&node_type)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    if node.node_state != "READY" && node.node_state != "PAUSED_HITL" && node.node_state != "PAUSED_API_ERROR" {
          return Err("현재 상태에서는 실행할 수 없습니다. (READY, PAUSED_HITL 또는 PAUSED_API_ERROR 필요)".to_string());
    }

    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // 2. 상태 업데이트: IN_PROGRESS
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
    let mut current_best_score = 0;
    let mut final_iteration_count = 0;

    // 3. Best-of-N 루프 (Feedback Refinement 적용)
    let mut loop_error = None;
    let mut previous_draft = String::new();
    let mut previous_feedback: Vec<String> = Vec::new();

    for i in 1..=max_iters {
        final_iteration_count = i;
        println!(">>> Iteration {}/{} starting for {}", i, max_iters, node_type);
        let _ = app_handle.emit("pipeline-status", format!("{} 생성 중 (반복 {}/{})", node_type, i, max_iters));
        
        let draft_res = generate_draft(&app_handle, &client, &api_key, &node_type, &project.raw_input_text, &previous_draft, &previous_feedback).await;
        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        println!(">>> Iteration {}: Draft generated, evaluating...", i);
        let _ = app_handle.emit("pipeline-status", format!("{} 품질 검증 중 (반복 {}/{})", node_type, i, max_iters));
        let eval_res = evaluate_draft(&app_handle, &client, &api_key, &node_type, &draft).await;
        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        // D. 결과 DB 기록 (ERD 준수)
        let iter_id = Uuid::new_v4().to_string();
        let errors_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();
        let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();
        
        sqlx::query(
            "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
        )
        .bind(iter_id)
        .bind(&node.node_id)
        .bind(i)
        .bind(&draft)
        .bind(eval.score)
        .bind(eval.is_pass)
        .bind(errors_json)
        .bind(feedback_json)
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        // 루프 내에서 실시간 진행률 DB 업데이트 및 이벤트 발송
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
        
        // 다음 회차 피드백 반영을 위해 루프 내 피드백 조합
        previous_draft = draft;
        previous_feedback = eval.critical_errors.clone();
        // 리스트 형태의 피드백을 모두 추가
        for f in eval.feedback {
            previous_feedback.push(format!("보강 필요: {}", f));
        }
    }

    // 4. 상태 결정 및 업데이트
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
    } else if current_best_score < threshold {
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

    // 5. [중요] 완료된 경우에만 DAG 전이 처리
    if final_state == NodeState::Completed {
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
            sqlx::query(
                "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
            )
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            // 다음 노드 트리거
            trigger_next_nodes(app_handle, &node.project_id, &node.target_node_type).await?;
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
        }
        _ => return Err("Invalid action".to_string()),
    }

    Ok(())
}

async fn trigger_next_nodes(app_handle: tauri::AppHandle, project_id: &str, completed_node_type: &str) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    // Phase 1-4 명세 기반 의존성 맵 정의 (트리거 후보들)
    let next_map = vec![
        ("PRD", vec!["FSD"]),
        ("FSD", vec!["User Flow", "ERD", "Wireframe", "API_Spec", "TC"]),
        ("User Flow", vec!["IA", "Wireframe"]),
        ("IA", vec!["Wireframe"]),
        ("ERD", vec!["API_Spec"]),
        ("API_Spec", vec!["TC"]),
    ];

    let mut nodes_to_check = Vec::new();
    for (parent, children) in next_map {
        if parent == completed_node_type {
            for child in children {
                nodes_to_check.push(child);
            }
        }
    }

    // 각 후보 노드에 대해 모든 선행 조건이 충족되었는지 확인
    for target in nodes_to_check {
        let prerequisites = match target {
            "FSD" => vec!["PRD"],
            "User Flow" => vec!["FSD"],
            "ERD" => vec!["FSD"],
            "IA" => vec!["User Flow"],
            "Wireframe" => vec!["FSD", "User Flow", "IA"],
            "API_Spec" => vec!["FSD", "ERD"],
            "TC" => vec!["PRD", "FSD", "API_Spec"],
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

async fn generate_draft(
    app_handle: &tauri::AppHandle,
    client: &Client,
    api_key: &str,
    node_type: &str,
    input_text: &str,
    previous_draft: &str,
    previous_feedback: &Vec<String>,
) -> Result<String, PipelineError> {
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| PipelineError::Internal(e.to_string()))?;
    
    let common_prompt = std::fs::read_to_string(resource_dir.join("prompts/generator/common.txt")).unwrap_or_else(|e| {
        println!("!!! ERROR loading common schema: {}", e);
        String::new()
    });
    let domain_prompt = std::fs::read_to_string(resource_dir.join(format!("prompts/generator/{}.txt", node_normalized))).unwrap_or_else(|e| {
        println!("!!! ERROR loading domain schema: {}", e);
        String::new()
    });
    
    let schema_obj = crate::schemas::get_schema_for_node(&node_normalized);
    
    let combined_sys_prompt = format!("{}\n\n[DOMAIN SPECIFIC RULE]\n{}", common_prompt, domain_prompt);
    println!(">>> System Prompt Loaded! Length: {} chars", combined_sys_prompt.len());
    
    let mut user_prompt = format!(
        "다음 사용자의 아이디어를 바탕으로 기획서를 작성하십시오.\n\n[사용자 아이디어]\n{}",
        input_text
    );

    if !previous_draft.is_empty() && !previous_feedback.is_empty() {
        let feedback_text = previous_feedback.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n");
        user_prompt = format!(
            "{}\n\n[이전 회차 결과물]\n{}\n\n[이전 회차 피드백 (반드시 보완 및 반영할 것)]\n{}\n\n위 피드백에서 지적된 문제점들을 완벽하게 개선하여 새로운 기획서 초안을 작성하십시오.",
            user_prompt, previous_draft, feedback_text
        );
        println!(">>> Appending Previous Feedback to Generator Prompt");
    }

    call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await
}

async fn evaluate_draft(
    app_handle: &tauri::AppHandle,
    client: &Client,
    api_key: &str,
    node_type: &str,
    draft: &str,
) -> Result<crate::schemas::EvaluationResult, PipelineError> {
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| PipelineError::Internal(e.to_string()))?;

    let common_rubric = std::fs::read_to_string(resource_dir.join("prompts/evaluator/common.txt")).unwrap_or_else(|e| {
        println!("!!! ERROR loading common rubric: {}", e);
        String::new()
    });
    let domain_rubric = std::fs::read_to_string(resource_dir.join(format!("prompts/evaluator/{}.txt", node_normalized))).unwrap_or_else(|e| {
        println!("!!! ERROR loading domain rubric: {}", e);
        String::new()
    });
    
    let combined_sys_prompt = format!("{}\n\n[DOMAIN SPECIFIC RUBRIC]\n{}", common_rubric, domain_rubric);
    println!(">>> Evaluator Prompt Loaded! Length: {} chars", combined_sys_prompt.len());

    let user_prompt = format!(
        "다음 작성된 기획서 초안을 제공된 루브릭에 따라 정량적으로 평가하십시오.\n\n[기획서 초안]\n{}\n\n[평가 대상 문서 타입]\n{}",
        draft, node_type
    );

    let schema_obj = crate::schemas::get_schema_for_node("evaluator");
    let response_text = call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await?;
    
    // JSON 추출 (정형화된 출력으로 인해 바로 파싱 시도, Gemini 2.5 Flash Structured Output 대응)
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
        "maxOutputTokens": 8192,
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
    let text = result["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| PipelineError::Internal("Empty response from Gemini".to_string()))?
        .to_string();

    Ok(text)
}

#[tauri::command]
pub async fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(())
}

// ============================================================
// v2 新 커맨드
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
        "SELECT t1.context_id, t1.project_id, t1.context_type, t1.context_data_json, t1.version, t1.created_at, t1.updated_at FROM global_context t1 INNER JOIN (SELECT context_type, MAX(created_at) as max_created FROM global_context WHERE project_id = ? AND is_deleted = 0 GROUP BY context_type) t2 ON t1.context_type = t2.context_type AND t1.created_at = t2.max_created WHERE t1.project_id = ? AND t1.is_deleted = 0"
    )
    .bind(&project_id)
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(contexts)
}

/// Genesis PRD 파이프라인: 기존 run_pipeline과 동일한 Best-of-N 루프 사용
#[tauri::command]
pub async fn run_genesis_prd_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    // Genesis_PRD 노드로 기존 run_pipeline 위임
    run_pipeline(app_handle, pool, project_id, "Genesis_PRD".to_string(), api_key).await
}

/// Genesis PRD HITL 승인 → SAD 페이즈로 전환 + SAD 노드 생성
#[tauri::command]
pub async fn approve_genesis_prd(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!(">>> Approving Genesis PRD for project: {}", project_id);
    let now = Utc::now().to_rfc3339();

    // 1. Genesis PRD 노드를 COMPLETED로 변경
    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type = 'Genesis_PRD'"
    )
    .bind(&now)
    .bind(&project_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1.1 최적의 이터레이션 데이터를 찾아 status를 HUMAN_APPROVED로 업데이트
    let genesis_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'Genesis_PRD'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Genesis PRD node not found".to_string())?;

    let latest_it = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC LIMIT 1"
    )
    .bind(&genesis_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(it) = latest_it {
        let mut json: serde_json::Value = serde_json::from_str(&it.generated_draft_json)
            .map_err(|e| format!("Failed to parse PRD JSON for status update: {}", e))?;
        
        if let Some(metadata) = json.get_mut("metadata") {
            metadata["status"] = serde_json::json!("HUMAN_APPROVED");
            
            let updated_json = serde_json::to_string(&json)
                .map_err(|e| format!("Failed to serialize updated PRD JSON: {}", e))?;
            
            sqlx::query(
                "UPDATE generation_iteration SET generated_draft_json = ?, updated_at = ? WHERE iteration_id = ?"
            )
            .bind(updated_json)
            .bind(&now)
            .bind(it.iteration_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            println!(">>> PRD metadata.status updated to HUMAN_APPROVED for iteration: {}", it.iteration_number);
        }
    }

    // 2. 프로젝트 pipeline_phase를 SAD로 전환
    sqlx::query(
        "UPDATE project SET pipeline_phase = 'SAD', updated_at = ? WHERE project_id = ?"
    )
    .bind(&now)
    .bind(&project_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. SAD 노드 생성 (단일 노드, node_category='SAD')
    let sad_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'SAD', 'SAD', 'READY', 0, 5, 80, 0, ?, ?, 0)"
    )
    .bind(sad_node_id)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    println!(">>> Genesis PRD approved. Shifted to SAD phase for project: {}", project_id);
    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

/// SAD 파이프라인: 글로벌 컨텍스트 5종 + 모듈 분할 명세 3종을 2단계로 순차 생성
#[tauri::command]
pub async fn run_sad_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> SAD Pipeline started for project: {}", project_id);
    let client = reqwest::Client::new();

    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // Genesis PRD 최고 점수 결과 조회
    let genesis_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE project_id = ? AND target_node_type = 'Genesis_PRD'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Genesis PRD node not found".to_string())?;

    let genesis_prd_content = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC LIMIT 1"
    )
    .bind(&genesis_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .map(|it| it.generated_draft_json)
    .unwrap_or_default();

    // SAD 노드 상태 업데이트
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE project_id = ? AND target_node_type = 'SAD'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD node not found".to_string())?;

    let max_iters = sad_node.max_iterations.max(1);
    let threshold = sad_node.threshold_score;

    let mut current_iter = 0;
    let mut is_global_success = false;
    let mut all_context_json = serde_json::json!({});
    let mut last_error = String::new();
    let mut last_feedback = String::new();

    // Stage 1: 글로벌 컨텍스트 5종 생성 및 평가 루프
    while current_iter < max_iters && !is_global_success {
        current_iter += 1;
        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 (Iteration {}/{}): 글로벌 컨텍스트 5종 생성 중...", current_iter, max_iters));

        let global_types = vec!["sad_core_erd", "sad_auth_rbac", "sad_interface_error", "sad_tech_stack", "sad_non_tech"];
        let mut stage_context_json = serde_json::json!({});

        for ctx_type in &global_types {
            let schema_obj = crate::schemas::get_schema_for_node(ctx_type);
            let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| e.to_string())?;
            let domain_prompt = std::fs::read_to_string(resource_dir.join(format!("prompts/generator/{}.txt", ctx_type))).unwrap_or_default();

            let sys_prompt = format!("당신은 시스템 아키텍트입니다. Genesis PRD를 기반으로 시스템 아키텍처 문서(SAD)의 일부를 작성합니다.\n\n{}", domain_prompt);
            let user_prompt = if last_feedback.is_empty() {
                format!(
                    "다음 Genesis PRD를 기반으로 {} 명세를 작성하십시오.\n\n[Genesis PRD]\n{}\n\n[사용자 원본 아이디어]\n{}",
                    ctx_type, genesis_prd_content, project.raw_input_text
                )
            } else {
                format!(
                    "다음 Genesis PRD를 기반으로 {} 명세를 작성하십시오. 이전 회차의 피드백을 반영하여 내용을 개선하십시오.\n\n[Genesis PRD]\n{}\n\n[사용자 원본 아이디어]\n{}\n\n[이전 회차 피드백]\n{}",
                    ctx_type, genesis_prd_content, project.raw_input_text, last_feedback
                )
            };

            let result = call_gemini(&client, &api_key, &sys_prompt, &user_prompt, schema_obj).await;
            match result {
                Ok(content) => {
                    stage_context_json[ctx_type] = serde_json::from_str(&content).unwrap_or(serde_json::json!(content));
                }
                Err(e) => {
                    let (code, msg) = match e {
                        PipelineError::ApiError(c, m) => (c as i32, m),
                        PipelineError::Internal(m) => (0, m),
                    };
                    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                    .bind(code).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                    .execute(&*pool).await.map_err(|e| e.to_string())?;
                    return Err(format!("SAD Stage 1 생성 오류: {}", msg));
                }
            }
        }

        // 글로벌 컨텍스트 통합 평가
        let eval_schema = crate::schemas::get_evaluation_schema();
        let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| e.to_string())?;
        let eval_rubric = std::fs::read_to_string(resource_dir.join("prompts/evaluator/sad_global.txt")).unwrap_or_default();
        
        let eval_sys_prompt = format!("당신은 수석 시스템 설계자입니다. 다음 SAD 글로벌 컨텍스트 결과물을 평가하십시오.\n\n{}", eval_rubric);
        let eval_user_prompt = format!(
            "[Genesis PRD]\n{}\n\n[평가 대상 SAD 글로벌 컨텍스트]\n{}",
            genesis_prd_content, serde_json::to_string_pretty(&stage_context_json).unwrap_or_default()
        );

        let eval_result = call_gemini(&client, &api_key, &eval_sys_prompt, &eval_user_prompt, Some(eval_schema)).await;
        match eval_result {
            Ok(eval_json) => {
                let eval: serde_json::Value = serde_json::from_str(&eval_json).unwrap_or_default();
                let score = eval["score"].as_i64().unwrap_or(0) as i32;
                let is_pass = eval["is_pass"].as_bool().unwrap_or(false);
                
                if is_pass || score >= threshold || (current_iter == max_iters) {
                    is_global_success = true;
                    if !is_pass && score < threshold {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 품질 미달이나 최대 횟수 도달로 강제 진행 (점수: {})", score));
                    }
                    for (ctx_type, data) in stage_context_json.as_object().unwrap() {
                        let ctx_id = Uuid::new_v4().to_string();
                        let now = Utc::now().to_rfc3339();
                        sqlx::query(
                            "INSERT INTO global_context (context_id, project_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
                        )
                        .bind(&ctx_id).bind(&project_id).bind(ctx_type).bind(data.to_string()).bind(current_iter).bind(&now).bind(&now)
                        .execute(&*pool).await.map_err(|e| e.to_string())?;
                    }
                    all_context_json = stage_context_json.clone();
                    let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 통과 (점수: {})", score));
                }

                // [회차 저장] 모든 이터레이션 결과를 히스토리 테이블에 저장
                let iter_id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                let feedback_text = eval["feedback"].as_array()
                    .map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n"))
                    .unwrap_or_default();
                let critical_errors_text = eval["critical_errors"].as_array()
                    .map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n"))
                    .unwrap_or_default();

                sqlx::query(
                    "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&iter_id)
                .bind(&sad_node.node_id)
                .bind(current_iter)
                .bind(stage_context_json.to_string())
                .bind(score)
                .bind(is_pass)
                .bind(&critical_errors_text)
                .bind(&feedback_text)
                .bind(&now)
                .bind(&now)
                .execute(&*pool).await.map_err(|e| e.to_string())?;

                // [피드백 업데이트] 다음 회차를 위해 피드백 저장
                last_feedback = feedback_text.clone();

                if !is_global_success {
                    last_error = eval["feedback"].as_str().unwrap_or("품질 미달").to_string();
                    let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 품질 미달 (점수: {}), 재시도 중...", score));
                }
            }
            Err(_) => {
                last_error = "평가 중 오류 발생".to_string();
            }
        }
    }

    if !is_global_success {
        // 이미 위에서 current_iter == max_iters 일 때 이진화 처리를 했으므로 여기까지 오면 정말 심각한 문제
        return Err(format!("SAD 글로벌 컨텍스트 생성 불가: {}", last_error));
    }

    // Stage 2: 모듈 분할 명세 3종 생성 및 평가 루프
    current_iter = 0;
    let mut is_module_success = false;
    last_feedback = String::new(); // Stage 2 피드백 초기화
    let global_context_str = serde_json::to_string_pretty(&all_context_json).unwrap_or_default();

    while current_iter < max_iters && !is_module_success {
        current_iter += 1;
        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 (Iteration {}/{}): 모듈 분할 명세 3종 생성 중...", current_iter, max_iters));

        let module_types = vec!["sad_module_list", "sad_epic_mapping", "sad_module_deps"];
        let mut stage_module_json = serde_json::json!({});

        for ctx_type in &module_types {
            let schema_obj = crate::schemas::get_schema_for_node(ctx_type);
            let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| e.to_string())?;
            let domain_prompt = std::fs::read_to_string(resource_dir.join(format!("prompts/generator/{}.txt", ctx_type))).unwrap_or_default();

            let sys_prompt = format!("당신은 시스템 아키텍트입니다. Genesis PRD와 글로벌 컨텍스트를 기반으로 모듈 분할 명세를 작성합니다.\n\n{}", domain_prompt);
            let user_prompt = if last_feedback.is_empty() {
                format!(
                    "[Genesis PRD]\n{}\n\n[글로벌 시스템 아키텍처 컨텍스트]\n{}\n\n[사용자 원본 아이디어]\n{}\n\n위 정보를 기반으로 {} 명세를 작성하십시오.",
                    genesis_prd_content, global_context_str, project.raw_input_text, ctx_type
                )
            } else {
                format!(
                    "이전 회차의 피드백을 반영하여 내용을 개선해 주세요.\n\n[Genesis PRD]\n{}\n\n[글로벌 시스템 아키텍처 컨텍스트]\n{}\n\n[사용자 원본 아이디어]\n{}\n\n[이전 회차 피드백]\n{}\n\n위 정보를 기반으로 {} 명세를 작성하십시오.",
                    genesis_prd_content, global_context_str, project.raw_input_text, last_feedback, ctx_type
                )
            };

            let result = call_gemini(&client, &api_key, &sys_prompt, &user_prompt, schema_obj).await;
            match result {
                Ok(content) => {
                    stage_module_json[ctx_type] = serde_json::from_str(&content).unwrap_or(serde_json::json!(content));
                }
                Err(e) => {
                    let (_code, msg) = match e {
                        PipelineError::ApiError(c, m) => (c as i32, m),
                        PipelineError::Internal(m) => (0, m),
                    };
                    return Err(format!("SAD Stage 2 생성 오류: {}", msg));
                }
            }
        }

        let eval_schema = crate::schemas::get_evaluation_schema();
        let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| e.to_string())?;
        let eval_rubric = std::fs::read_to_string(resource_dir.join("prompts/evaluator/sad_module.txt")).unwrap_or_default();
        
        let eval_sys_prompt = format!("당신은 수석 시스템 설계자입니다. 다음 SAD 모듈 분할 명세 결과물을 평가하십시오.\n\n{}", eval_rubric);
        let eval_user_prompt = format!(
            "[Genesis PRD]\n{}\n\n[글로벌 컨텍스트]\n{}\n\n[평가 대상 모듈 분할 명세]\n{}",
            genesis_prd_content, global_context_str, serde_json::to_string_pretty(&stage_module_json).unwrap_or_default()
        );

        let eval_result = call_gemini(&client, &api_key, &eval_sys_prompt, &eval_user_prompt, Some(eval_schema)).await;
        match eval_result {
            Ok(eval_json) => {
                let eval: serde_json::Value = serde_json::from_str(&eval_json).unwrap_or_default();
                let score = eval["score"].as_i64().unwrap_or(0) as i32;
                let is_pass = eval["is_pass"].as_bool().unwrap_or(false);
                
                if is_pass || score >= threshold || (current_iter == max_iters) {
                    is_module_success = true;
                    if !is_pass && score < threshold {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 품질 미달이나 최대 횟수 도달로 강제 진행 (점수: {})", score));
                    }
                    for (ctx_type, data) in stage_module_json.as_object().unwrap() {
                        let ctx_id = Uuid::new_v4().to_string();
                        let now = Utc::now().to_rfc3339();
                        sqlx::query(
                            "INSERT INTO global_context (context_id, project_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
                        )
                        .bind(&ctx_id).bind(&project_id).bind(ctx_type).bind(data.to_string()).bind(current_iter).bind(&now).bind(&now)
                        .execute(&*pool).await.map_err(|e| e.to_string())?;
                    }
                    let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 통과 (점수: {})", score));
                }

                // [회차 저장] Stage 2 결과도 히스토리 테이블에 저장
                let iter_id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                let feedback_text = eval["feedback"].as_array()
                    .map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n"))
                    .unwrap_or_default();
                let critical_errors_text = eval["critical_errors"].as_array()
                    .map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("")).collect::<Vec<_>>().join("\n"))
                    .unwrap_or_default();
                
                // Stage 2 결과는 Stage 1 결과와 합쳐서 저장 (완결된 SAD 뷰 제공)
                let mut combined_bundle = all_context_json.clone();
                if let Some(obj) = combined_bundle.as_object_mut() {
                    for (k, v) in stage_module_json.as_object().unwrap() {
                        obj.insert(k.clone(), v.clone());
                    }
                }

                sqlx::query(
                    "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&iter_id)
                .bind(&sad_node.node_id)
                .bind(current_iter + 100) // Stage 2는 이터레이션 번호에 100을 더해 구분 (UI 편의성)
                .bind(combined_bundle.to_string())
                .bind(score)
                .bind(is_pass)
                .bind(&critical_errors_text)
                .bind(&feedback_text)
                .bind(&now)
                .bind(&now)
                .execute(&*pool).await.map_err(|e| e.to_string())?;

                // [피드백 업데이트] 다음 회차를 위해 저장
                last_feedback = feedback_text.clone();

                if !is_module_success {
                    last_error = eval["feedback"].as_str().unwrap_or("품질 미달").to_string();
                    let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 품질 미달 (점수: {}), 재시도 중...", score));
                }
            }
            Err(_) => {
                last_error = "평가 중 오류 발생".to_string();
            }
        }
    }

    if !is_module_success {
        return Err(format!("SAD 모듈 분할 생성 불가: {}", last_error));
    }

    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_best_score = 100, updated_at = ? WHERE node_id = ?")
    .bind(Utc::now().to_rfc3339())
    .bind(&sad_node.node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "SAD 8종 생성 완료. 모듈 생성을 승인해 주세요.");

    Ok("SAD pipeline completed successfully with evaluation".to_string())
}

/// SAD 결과 기반 로컬 모듈 자동 생성 (최대 10개)
#[tauri::command]
pub async fn create_local_modules(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    modules_json: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let now = Utc::now().to_rfc3339();

    // modules_json 파싱: [{name, description, responsibility, mapped_epics, priority_order}]
    let modules: Vec<serde_json::Value> = serde_json::from_str(&modules_json)
        .map_err(|e| format!("모듈 JSON 파싱 오류: {}", e))?;

    if modules.len() > 10 {
        return Err("최대 모듈 수는 10개입니다.".to_string());
    }

    // SAD 노드 완료 처리
    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD'")
    .bind(&now).bind(&project_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    // 프로젝트 phase 전환
    sqlx::query("UPDATE project SET pipeline_phase = 'MODULE_GENERATION', updated_at = ? WHERE project_id = ?")
    .bind(&now).bind(&project_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    let mut module_ids = Vec::new();
    let node_types = vec!["PRD", "FSD", "User Flow", "IA", "ERD", "Wireframe", "API_Spec", "TC"];

    for (idx, module) in modules.iter().enumerate() {
        let module_id = Uuid::new_v4().to_string();
        let default_name = format!("Module-{}", idx+1);
        let m_name = module["name"].as_str().unwrap_or(&default_name);
        let m_desc = module["description"].as_str().unwrap_or("");
        let m_resp = module["responsibility"].as_str().unwrap_or("");
        let m_epics = module.get("mapped_epics").map(|v| v.to_string()).unwrap_or_default();
        let priority = module["priority_order"].as_i64().unwrap_or(idx as i64) as i32;

        sqlx::query(
            "INSERT INTO local_module (module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, priority_order, module_state, display_order, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, 0)"
        )
        .bind(&module_id).bind(&project_id).bind(m_name).bind(m_desc).bind(m_resp).bind(&m_epics)
        .bind(priority).bind(idx as i32).bind(&now).bind(&now)
        .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 각 모듈에 8개 노드 생성
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

    // 첫 번째 모듈(우선순위 최고)을 활성화
    if let Some(first_id) = module_ids.first() {
        sqlx::query("UPDATE local_module SET module_state = 'ACTIVE' WHERE module_id = ?")
        .bind(first_id).execute(&*pool).await.map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(module_ids)
}

/// 선택한 SAD 이터레이션을 공식 컨텍스트로 확정
#[tauri::command]
pub async fn confirm_sad_iteration(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Confirming SAD iteration: {} for project: {}", iteration_id, project_id);
    
    // 1. 회차 정보 조회
    let iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "회차 정보를 찾을 수 없습니다.".to_string())?;

    // 2. 번들링된 JSON 파싱
    let bundle: serde_json::Value = serde_json::from_str(&iteration.generated_draft_json)
        .map_err(|e| format!("데이터 파싱 오류: {}", e))?;

    let now = Utc::now().to_rfc3339();
    let it_number = iteration.iteration_number;

    // 3. 트랜잭션 시작
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 4. 기존 컨텍스트 삭제 (논리 삭제)
    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ?")
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 5. 새 컨텍스트 삽입
    if let Some(obj) = bundle.as_object() {
        for (ctx_type, data) in obj {
            let ctx_id = Uuid::new_v4().to_string();
            let data_str = if data.is_string() { data.as_str().unwrap().to_string() } else { data.to_string() };
            
            sqlx::query(
                "INSERT INTO global_context (context_id, project_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
            )
            .bind(&ctx_id).bind(&project_id).bind(ctx_type).bind(data_str).bind(it_number).bind(&now).bind(&now)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    // 6. 노드의 최적 점수 업데이트
    sqlx::query(
        "UPDATE document_node SET current_best_score = ?, updated_at = ? WHERE node_id = ?"
    )
    .bind(iteration.calculated_score)
    .bind(&now)
    .bind(&iteration.node_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    
    println!(">>> SAD Iteration {} confirmed for project: {}", iteration_id, project_id);
    Ok(())
}

/// 모듈 내 노드 파이프라인 실행 (글로벌 컨텍스트 주입 포함)
#[tauri::command]
pub async fn run_module_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    module_id: String,
    node_type: String,
    api_key: String,
) -> Result<String, String> {
    // 글로벌 컨텍스트 수집
    let contexts = sqlx::query_as::<_, GlobalContext>(
        "SELECT context_id, project_id, context_type, context_data_json, version, created_at, updated_at FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut global_ctx = serde_json::json!({});
    for ctx in &contexts {
        let parsed: serde_json::Value = serde_json::from_str(&ctx.context_data_json).unwrap_or(serde_json::json!(ctx.context_data_json));
        global_ctx[&ctx.context_type] = parsed;
    }
    let global_context_str = serde_json::to_string_pretty(&global_ctx).unwrap_or_default();

    // 모듈 정보 조회
    let module = sqlx::query_as::<_, LocalModule>(
        "SELECT module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, dependency_spec, priority_order, module_state, display_order, created_at, updated_at FROM local_module WHERE module_id = ?"
    )
    .bind(&module_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Module not found".to_string())?;

    // 해당 모듈의 노드 조회
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0"
    )
    .bind(&module_id)
    .bind(&node_type)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found in module".to_string())?;

    if node.node_state != "READY" && node.node_state != "PAUSED_HITL" && node.node_state != "PAUSED_API_ERROR" {
        return Err("현재 상태에서는 실행할 수 없습니다.".to_string());
    }

    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // IN_PROGRESS 상태
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
    let mut previous_draft = String::new();
    let mut previous_feedback: Vec<String> = Vec::new();

    // 모듈 컨텍스트 = 글로벌 컨텍스트 + 모듈 메타
    let module_context = format!(
        "{}\n\n[현재 모듈 정보]\n모듈명: {}\n설명: {}\n핵심 책임: {}\n매핑된 Epic: {}",
        global_context_str,
        module.module_name,
        module.module_description.as_deref().unwrap_or(""),
        module.core_responsibility.as_deref().unwrap_or(""),
        module.mapped_epics.as_deref().unwrap_or("")
    );

    for i in 1..=max_iters {
        final_iteration_count = i;
        let _ = app_handle.emit("pipeline-status", format!("[{}] {} 생성 중 (반복 {}/{})", module.module_name, node_type, i, max_iters));

        let draft_res = generate_draft_with_context(&app_handle, &client, &api_key, &node_type, &project.raw_input_text, &previous_draft, &previous_feedback, &module_context).await;
        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => { loop_error = Some(e); break; }
        };

        let _ = app_handle.emit("pipeline-status", format!("[{}] {} 검증 중 (반복 {}/{})", module.module_name, node_type, i, max_iters));
        let eval_res = evaluate_draft(&app_handle, &client, &api_key, &node_type, &draft).await;
        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => { loop_error = Some(e); break; }
        };

        let iter_id = Uuid::new_v4().to_string();
        let errors_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();
        let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();

        sqlx::query(
            "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
        )
        .bind(iter_id).bind(&node.node_id).bind(i).bind(&draft).bind(eval.score).bind(eval.is_pass)
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
        previous_feedback = eval.critical_errors.clone();
        for f in eval.feedback { previous_feedback.push(format!("보강 필요: {}", f)); }

        if eval.score >= threshold { break; }
    }

    // 최종 상태 결정
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

    let final_state = if current_best_score < threshold { NodeState::PausedHitl } else { NodeState::Completed };

    sqlx::query("UPDATE document_node SET node_state = ?, current_iteration = ?, current_best_score = ?, updated_at = ? WHERE node_id = ?")
    .bind(final_state.to_string()).bind(final_iteration_count).bind(current_best_score).bind(Utc::now().to_rfc3339()).bind(&node.node_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    if final_state == NodeState::Completed {
        trigger_module_next_nodes(&app_handle, &module_id, &node_type).await?;
    }

    Ok(current_best_content)
}

/// 글로벌 컨텍스트를 포함한 generate_draft
async fn generate_draft_with_context(
    app_handle: &tauri::AppHandle,
    client: &Client,
    api_key: &str,
    node_type: &str,
    input_text: &str,
    previous_draft: &str,
    previous_feedback: &Vec<String>,
    global_context: &str,
) -> Result<String, PipelineError> {
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| PipelineError::Internal(e.to_string()))?;
    
    let common_prompt = std::fs::read_to_string(resource_dir.join("prompts/generator/common.txt")).unwrap_or_default();
    let domain_prompt = std::fs::read_to_string(resource_dir.join(format!("prompts/generator/{}.txt", node_normalized))).unwrap_or_default();
    
    let schema_obj = crate::schemas::get_schema_for_node(&node_normalized);
    let combined_sys_prompt = format!("{}\n\n[DOMAIN SPECIFIC RULE]\n{}", common_prompt, domain_prompt);
    
    let mut user_prompt = format!(
        "다음 사용자의 아이디어를 바탕으로 기획서를 작성하십시오.\n\n[사용자 아이디어]\n{}",
        input_text
    );

    // 글로벌 컨텍스트 주입
    if !global_context.is_empty() {
        user_prompt = format!(
            "{}\n\n[글로벌 시스템 아키텍처 컨텍스트 (반드시 준수)]\n{}",
            user_prompt, global_context
        );
    }

    if !previous_draft.is_empty() && !previous_feedback.is_empty() {
        let feedback_text = previous_feedback.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n");
        user_prompt = format!(
            "{}\n\n[이전 회차 결과물]\n{}\n\n[이전 회차 피드백]\n{}\n\n위 피드백을 반영하여 새로운 기획서를 작성하십시오.",
            user_prompt, previous_draft, feedback_text
        );
    }

    call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await
}

/// 모듈 내 DAG 전이 (module_id 기준)
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
            "IA" => vec!["User Flow"],
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

    // 모든 노드 완료 체크하여 모듈 및 프로젝트 상태 업데이트
    let all_module_nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE module_id = ? AND is_deleted = 0"
    )
    .bind(module_id).fetch_all(&*pool).await.map_err(|e| e.to_string())?;

    if !all_module_nodes.is_empty() && all_module_nodes.iter().all(|n| n.node_state == "COMPLETED") {
        let now = Utc::now().to_rfc3339();
        
        // 현재 모듈 완료 처리
        sqlx::query("UPDATE local_module SET module_state = 'COMPLETED', updated_at = ? WHERE module_id = ?")
        .bind(&now).bind(module_id).execute(&*pool).await.map_err(|e| e.to_string())?;

        // 프로젝트 ID 조회
        let project_id = all_module_nodes[0].project_id.clone();

        // 다음 모듈 탐색 (priority_order 기준)
        let next_module = sqlx::query_as::<_, LocalModule>(
            "SELECT * FROM local_module WHERE project_id = ? AND module_state = 'PENDING' AND is_deleted = 0 ORDER BY priority_order ASC LIMIT 1"
        )
        .bind(&project_id).fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

        if let Some(nm) = next_module {
            // 다음 모듈 활성화
            sqlx::query("UPDATE local_module SET module_state = 'ACTIVE', updated_at = ? WHERE module_id = ?")
            .bind(&now).bind(&nm.module_id).execute(&*pool).await.map_err(|e| e.to_string())?;
            
            // 다음 모듈의 PRD 노드를 READY로 전환
            sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE module_id = ? AND target_node_type = 'PRD' AND node_state = 'PENDING'")
            .bind(&now).bind(&nm.module_id).execute(&*pool).await.map_err(|e| e.to_string())?;
        } else {
            // 더 이상 남은 모듈이 없으면 프로젝트 전체 완료
            sqlx::query("UPDATE project SET pipeline_phase = 'COMPLETED', updated_at = ? WHERE project_id = ?")
            .bind(&now).bind(&project_id).execute(&*pool).await.map_err(|e| e.to_string())?;
        }
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}
