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
pub struct Project {
    pub project_id: String,
    pub session_id: String,
    pub project_name: String,
    pub pipeline_execution_mode: String,
    pub raw_input_text: String,
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(default)]
    pub current_node_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct DocumentNode {
    pub node_id: String,
    pub project_id: String,
    pub target_node_type: String,
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
pub struct GenerationIteration {
    pub iteration_id: String,
    pub node_id: String,
    pub iteration_number: i32,
    pub generated_draft_json: String,
    pub calculated_score: Option<i32>,
    pub is_pass: Option<bool>,
    pub critical_errors_array: Option<String>, // JSON
    pub actionable_feedback_text: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EvaluationResult {
    pub score: i32,
    pub is_pass: bool,
    pub feedback: String,
    pub critical_errors: Vec<String>,
}

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
        let error_body: serde_json::Value = response.json().await.map_err(|e: reqwest::Error| e.to_string())?;
        let message = error_body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error")
            .to_string();
        Err(message)
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
pub async fn list_projects(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<Project>, String> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT 
            p.project_id, 
            p.session_id, 
            p.project_name, 
            p.pipeline_execution_mode, 
            p.raw_input_text, 
            p.created_at, 
            p.updated_at,
            (SELECT GROUP_CONCAT(target_node_type) 
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

    // 1. 프로젝트 생성
    sqlx::query(
        "INSERT INTO project (project_id, session_id, project_name, pipeline_execution_mode, raw_input_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
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

    // 2. 8개 노드 초기화 (FSD 명세 준수)
    let node_types = vec![
        "PRD", "FSD", "User Flow", "IA", "ERD", "Wireframe", "API_Spec", "TC"
    ];

    for node_type in &node_types {
        let node_id = Uuid::new_v4().to_string();
        let initial_state = if node_type == &"PRD" { NodeState::Ready } else { NodeState::Pending };
        
        sqlx::query(
            "INSERT INTO document_node (node_id, project_id, target_node_type, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, 0, 10, 85, 0, ?, ?, 0)"
        )
        .bind(node_id)
        .bind(&project_id)
        .bind(*node_type)
        .bind(initial_state.to_string())
        .bind(&now)
        .bind(&now)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(project_id)
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
        .bind(eval.feedback.clone())
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

        if eval.score > current_best_score {
            current_best_score = eval.score;
            current_best_content = draft.clone();
        }

        println!(">>> Iteration {}: Score = {}, Pass = {}", i, eval.score, eval.is_pass);
        
        // 조기 종료(Early Stop) 제거. Max Iterations (10회)를 전수 조사하여 최고점을 찾음.
        // 다음 회차 피드백 반영을 위해 무조건 현재 회차 데이터를 캐싱
        previous_draft = draft;
        previous_feedback = eval.critical_errors.clone();
        if !eval.feedback.is_empty() {
            previous_feedback.push(format!("총평: {}", eval.feedback));
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
    let schema = std::fs::read_to_string(resource_dir.join(format!("prompts/schemas/{}.json", node_normalized))).unwrap_or_else(|e| {
        println!("!!! ERROR loading schema JSON: {}", e);
        String::new()
    });
    
    let combined_sys_prompt = format!("{}\n\n[DOMAIN SPECIFIC RULE]\n{}", common_prompt, domain_prompt);
    println!(">>> System Prompt Loaded! Length: {} chars, Schema Length: {} chars", combined_sys_prompt.len(), schema.len());
    
    let mut user_prompt = format!(
        "다음 사용자의 아이디어를 바탕으로 기획서를 작성하십시오.\n\n[사용자 아이디어]\n{}\n\n[출력 형식 스키마]\n{}",
        input_text, schema
    );

    if !previous_draft.is_empty() && !previous_feedback.is_empty() {
        let feedback_text = previous_feedback.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n");
        user_prompt = format!(
            "{}\n\n[이전 회차 결과물]\n{}\n\n[이전 회차 피드백 (반드시 보완 및 반영할 것)]\n{}\n\n위 피드백에서 지적된 문제점들을 완벽하게 개선하여 새로운 기획서 초안을 작성하십시오.",
            user_prompt, previous_draft, feedback_text
        );
        println!(">>> Appending Previous Feedback to Generator Prompt");
    }

    call_gemini(client, api_key, &combined_sys_prompt, &user_prompt).await
}

async fn evaluate_draft(
    app_handle: &tauri::AppHandle,
    client: &Client,
    api_key: &str,
    node_type: &str,
    draft: &str,
) -> Result<EvaluationResult, PipelineError> {
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
        "다음 작성된 기획서 초안을 제공된 루브릭에 따라 정량적으로 평가하고 JSON으로 반환하십시오.\n\n[기획서 초안]\n{}\n\n[평가 대상 문서 타입]\n{}",
        draft, node_type
    );

    let response_text = call_gemini(client, api_key, &combined_sys_prompt, &user_prompt).await?;
    
    // JSON 추출 (Markdown Block 제거)
    let json_str = response_text.trim_start_matches("```json").trim_end_matches("```").trim();
    
    let parsed: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| PipelineError::Internal(format!("Eval Parsing Error: {} - Content: {}", e, json_str)))?;

    let score = parsed.get("score")
        .or_else(|| parsed.get("overall_score"))
        .or_else(|| parsed.pointer("/evaluation/overall_score"))
        .or_else(|| parsed.pointer("/evaluation/score"))
        .and_then(|v| v.as_f64())
        .map(|f| f as i32)
        .unwrap_or(0);

    let is_pass = parsed.get("is_pass")
        .or_else(|| parsed.pointer("/evaluation/is_pass"))
        .and_then(|v| v.as_bool())
        .unwrap_or(score >= 80);

    let feedback = parsed.get("feedback")
        .or_else(|| parsed.get("overall_comment"))
        .or_else(|| parsed.pointer("/evaluation/overall_comment"))
        .or_else(|| parsed.pointer("/evaluation/feedback"))
        .and_then(|v| v.as_str())
        .unwrap_or("No feedback provided.")
        .to_string();

    let critical_errors = parsed.get("critical_errors")
        .or_else(|| parsed.pointer("/evaluation/critical_errors"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|i| i.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_else(|| vec![]);

    Ok(EvaluationResult {
        score,
        is_pass,
        feedback,
        critical_errors,
    })
}

async fn call_gemini(client: &Client, api_key: &str, sys_prompt: &str, user_prompt: &str) -> Result<String, PipelineError> {
    let model = "gemini-2.5-flash";
    println!(">>> Calling Gemini API ({})", model);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model,
        api_key
    );

    let body = serde_json::json!({
        "system_instruction": { "parts": { "text": sys_prompt } },
        "contents": { "parts": { "text": user_prompt } },
        "generationConfig": {
            "temperature": 0.7,
            "topP": 0.95,
            "topK": 40,
            "maxOutputTokens": 8192,
            "responseMimeType": "text/plain"
        }
    });

    let resp = client.post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e: reqwest::Error| PipelineError::Internal(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(PipelineError::ApiError(status.as_u16(), err_text));
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
