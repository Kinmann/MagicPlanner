use serde::{Deserialize, Serialize};
use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Manager, Emitter};
use sqlx::{SqlitePool, FromRow, Row};

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

// ============================================================
// v2 新 구조체
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

    if node.node_state != "READY" && node.node_state != "PAUSED_HITL" && node.node_state != "PAUSED_API_ERROR" && node.node_state != "PAUSED_STOPPED" && node.node_state != "COMPLETED" {
          return Err("현재 상태에서는 실행할 수 없습니다. (READY, PAUSED_HITL, PAUSED_API_ERROR, PAUSED_STOPPED 또는 COMPLETED 필요)".to_string());
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
    let mut current_best_score = node.current_best_score;
    let mut final_iteration_count = node.current_iteration;

    // 2.5 [RETRY] 이전 회차 정보 가져오기 (컨텍스트 유지)
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
        
        // 피드백 복원 (Critical Errors + Actionable Feedback)
        if let Some(errors_json) = it.critical_errors_array {
            if let Ok(errors) = serde_json::from_str::<Vec<String>>(&errors_json) {
                previous_feedback.extend(errors);
            }
        }
        if let Some(action_json) = it.actionable_feedback_text {
            if let Ok(feedback) = serde_json::from_str::<Vec<String>>(&action_json) {
                for f in feedback {
                    previous_feedback.push(format!("보강 필요: {}", f));
                }
            }
        }
    }

    let start_iter = node.current_iteration + 1;
    for i in start_iter..=max_iters {
        final_iteration_count = i;
        println!(">>> Iteration {}/{} starting for {}", i, max_iters, node_type);
        let _ = app_handle.emit("pipeline-status", format!("{} 생성 중 (반복 {}/{})", node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("문서 생성 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let draft_res = generate_draft(&app_handle, &client, &api_key, &node_type, &project.raw_input_text, &previous_draft, &previous_feedback, i).await;
        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        // [STOP CHECK] AI 호출 후 중단 체크
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Pipeline stopped manually after generation (Node: {})", node.node_id);
            break;
        }

        println!(">>> Iteration {}: Draft generated, evaluating...", i);
        let _ = app_handle.emit("pipeline-status", format!("{} 품질 검증 중 (반복 {}/{})", node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("품질 검증 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        let input_text_for_eval = if node_type == "Genesis_PRD" { Some(project.raw_input_text.clone()) } else { None };
        let empty_feedback = Vec::new(); // run_pipeline에서는 개별 피드백 추적 안 하므로 빈 값 전달
        let eval_res = evaluate_draft(&app_handle, &client, &api_key, &node_type, &draft, input_text_for_eval, "", "", &empty_feedback, i).await;
        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        // [STOP CHECK] 평가 후 및 저장 직전 중단 체크
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Pipeline stopped manually before save (Node: {})", node.node_id);
            break;
        }

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
        .bind(false)
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
            "SAD_Global" => vec!["Genesis_PRD"],
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
    iteration: i32,
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
        "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}",
        node_type, iteration, input_text
    );

    if !previous_feedback.is_empty() {
        user_prompt = format!(
            "{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n$PREVIOUS_DRAFT\n{}",
            user_prompt, previous_feedback.join("\n"), previous_draft
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
    input_text: Option<String>,
    global_context: &str,
    module_context: &str,
    previous_feedback: &Vec<String>,
    iteration: i32,
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
    
    let combined_sys_prompt = format!("$COMMON_RUBRIC\n{}\n\n$DOMAIN_RUBRIC\n{}", common_rubric, domain_rubric);
    println!(">>> Evaluator Prompt Loaded! Length: {} chars", combined_sys_prompt.len());

    let mut user_prompt = format!(
        "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$GENERATED_DOCUMENT\n{}",
        node_type, iteration, draft
    );

    // 모듈 PRD가 아닐 때만 사용자 아이디어 참조
    if node_type == "Genesis_PRD" {
        if let Some(original_idea) = input_text {
            user_prompt = format!(
                "{}\n\n$SOURCE_DOCUMENTS\n{}",
                user_prompt, original_idea
            );
        }
    }

    if !global_context.is_empty() {
        user_prompt = format!(
            "{}\n\n$GLOBAL_CONTEXT\n{}",
            user_prompt, global_context
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
        "maxOutputTokens": 16384,
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

    // 마크다운 백틱 및 불필요한 공백 제거
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
        "SELECT context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at FROM global_context WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at DESC"
    )
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
pub async fn confirm_genesis_prd_iteration(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Confirming Genesis PRD iteration: {} for project: {}", iteration_id, project_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. 해당 노드의 모든 이터레이션 is_pass 초기화
    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = (SELECT node_id FROM document_node WHERE project_id = ? AND target_node_type = 'Genesis_PRD')")
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. 선택된 이터레이션만 is_pass = 1 설정
    sqlx::query("UPDATE generation_iteration SET is_pass = 1, updated_at = ? WHERE iteration_id = ?")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

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
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY is_pass DESC, calculated_score DESC LIMIT 1"
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

    // 3. SAD 글로벌 컨텍스트 노드 생성
    let global_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'SAD_Global', 'SAD', 'READY', 0, 5, 80, 0, ?, ?, 0)"
    )
    .bind(global_node_id)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 4. SAD 모듈 분할 노드 생성 (PENDING 상태로 생성하여 DAG 표현)
    let module_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'SAD_Module', 'SAD', 'PENDING', 0, 5, 80, 0, ?, ?, 0)"
    )
    .bind(module_node_id)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    println!(">>> Genesis PRD approved. Shifted to SAD Global phase for project: {}", project_id);
    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

/// SAD 글로벌 컨텍스트 파이프라인
#[tauri::command]
pub async fn run_sad_global_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> SAD Global Pipeline started for project: {}", project_id);
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
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 AND json_extract(generated_draft_json, '$.metadata.status') = 'HUMAN_APPROVED' ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&genesis_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .map(|it| it.generated_draft_json)
    .ok_or_else(|| "확정된 Genesis PRD가 없습니다. PRD 단계에서 'Approve'를 먼저 완료해주세요.".to_string())?;

    // SAD_Global 노드 상태 조회
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Global'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Global node not found".to_string())?;
    
    if sad_node.node_state != "READY" && sad_node.node_state != "PAUSED_HITL" && sad_node.node_state != "PAUSED_API_ERROR" && sad_node.node_state != "PAUSED_STOPPED" && sad_node.node_state != "COMPLETED" {
        return Err("현재 상태에서는 실행할 수 없습니다.".to_string());
    }

    // 상태를 RUNNING으로 변경
    sqlx::query("UPDATE document_node SET node_state = 'RUNNING', updated_at = ? WHERE node_id = ?")
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

    // [RETRY] 이전 회차 피드백 및 초안 가져오기
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

    let resource_dir = app_handle.path().resource_dir().map_err(|e| e.to_string())?;
    let common_prompt = std::fs::read_to_string(resource_dir.join("prompts/generator/common.txt")).unwrap_or_else(|_| {
        println!("!!! Failed to load common.txt generator prompt");
        String::new()
    });

    // Stage 1: 글로벌 컨텍스트 5종 생성 및 평가 루프
    while current_iter < max_iters && !is_global_success {
        current_iter += 1;
        let global_types = vec!["sad_non_tech", "sad_tech_stack", "sad_core_erd", "sad_auth_rbac", "sad_interface_error"];
        // 이전 회차의 번들이 있다면 초기값으로 사용, 없으면 빈 객체
        let mut stage_context_json = initial_stage_context.clone();

        for ctx_type in global_types {
            let _ = app_handle.emit("pipeline-status", format!("SAD Stage 1 (Iter {}): {} 생성 중...", current_iter, ctx_type));

            sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind(format!("{} 생성 중...", ctx_type)).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                .execute(&*pool).await.map_err(|e| e.to_string())?;
            
            // 의존성 데이터 추출
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
            let resource_path = resource_dir.join(format!("prompts/generator/{}.txt", ctx_type));
            let type_prompt = std::fs::read_to_string(&resource_path).unwrap_or_else(|_| {
                println!("!!! Missing prompt: {:?}", resource_path);
                String::new()
            });

            let sys_prompt = format!("$COMMON_RULES\n{}\n\n$DOMAIN_SPECIFIC_RULE\n{}", common_prompt, type_prompt);
            let user_prompt = format!(
                "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$PREVIOUS_ARCHITECTURAL_DECISIONS\n{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n위 정보를 기반으로 {}을(를) 작성하십시오.",
                ctx_type, current_iter, genesis_prd_content, prev_context_str, prev_draft_str, last_feedback, ctx_type
            );

            let result = call_gemini(&client, &api_key, &sys_prompt, &user_prompt, schema_obj).await;
            let part_json = match result {
                Ok(content) => {
                    serde_json::from_str::<serde_json::Value>(&content)
                        .map_err(|e| format!("SAD Part ({}) 파싱 오류: {} - 원본: {}", ctx_type, e, content))?
                }
                Err(e) => {
                    let (code, msg) = match e {
                        crate::commands::PipelineError::ApiError(c, m) => (c as i32, m),
                        crate::commands::PipelineError::Internal(m) => (0, m),
                    };
                    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                    .bind(code).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                    .execute(&*pool).await.map_err(|e| e.to_string())?;
                    return Err(format!("SAD Part ({}) 생성 오류: {}", ctx_type, msg));
                }
            };

            // 통합 객체에 삽입
            if let Some(obj) = stage_context_json.as_object_mut() {
                obj.insert(ctx_type.to_string(), part_json);
            }

            // [STOP CHECK] 개별 파트 생성 후 중단 체크
            if is_node_stopped(&*pool, &sad_node.node_id).await {
                println!(">>> SAD Global stopped manually during part generation ({})", ctx_type);
                return Ok("SAD global stopped manually".to_string());
            }
        }

        // 글로벌 컨텍스트 통합 평가
        let eval_schema = crate::schemas::get_evaluation_schema();
        let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| e.to_string())?;
        
        let common_rubric = std::fs::read_to_string(resource_dir.join("prompts/evaluator/common.txt")).unwrap_or_else(|_| String::new());
        let eval_rubric = std::fs::read_to_string(resource_dir.join("prompts/evaluator/sad_global.txt")).unwrap_or_default();
        
        let eval_sys_prompt = format!("$COMMON_RUBRIC\n{}\n\n$DOMAIN_RUBRIC\n{}", common_rubric, eval_rubric);
        let eval_user_prompt = format!(
            "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$GENERATED_DOCUMENT\n{}\n\n$EVALUATOR_FEEDBACK\n{}",
            "SAD_Global", current_iter, genesis_prd_content, serde_json::to_string_pretty(&stage_context_json).unwrap_or_default(), last_feedback
        );

        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("통합 품질 검증 중...").bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

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
                    _all_context_json = stage_context_json.clone();
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

                // 트랜잭션 사용: 부모(generation_iteration) 먼저 저장 후 자식(global_context) 저장
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                sqlx::query(
                    "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&iter_id)
                .bind(&sad_node.node_id)
                .bind(current_iter)
                .bind(stage_context_json.to_string())
                .bind(score)
                .bind(false)
                .bind(&critical_errors_text)
                .bind(&feedback_text)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                // 기계적 분할: 매 회차(Draft 포함)의 5종 컨텍스트를 각각 저장
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
        return Err(format!("SAD 글로벌 컨텍스트 생성 불가: {}", last_error));
    }

    // SAD_Global 노드 완료 처리 및 SAD_Module 노드 활성화(READY)
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
    let _ = app_handle.emit("pipeline-status", "SAD 글로벌 컨텍스트 생성 완료. 모듈 분할 노드를 실행해 주세요.");

    Ok("SAD global context pipeline completed".to_string())
}

/// SAD 모듈 분할 파이프라인
#[tauri::command]
pub async fn run_sad_module_pipeline(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    api_key: String,
) -> Result<String, String> {
    println!(">>> SAD Module Split Pipeline started for project: {}", project_id);
    let client = reqwest::Client::new();

    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM project WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    // Genesis PRD 조회
    let genesis_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'Genesis_PRD'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Genesis PRD node not found".to_string())?;

    let genesis_prd_content = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 AND json_extract(generated_draft_json, '$.metadata.status') = 'HUMAN_APPROVED' ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&genesis_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .map(|it| it.generated_draft_json)
    .ok_or_else(|| "확정된 Genesis PRD가 없습니다. PRD 단계에서 'Approve'를 먼저 완료해주세요.".to_string())?;

    // 앞 단계인 SAD_Global의 결과(글로벌 컨텍스트) 조회
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

    // SAD_Module 노드 상태 업데이트
    let sad_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module'"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "SAD_Module node not found".to_string())?;

    if sad_node.node_state != "READY" && sad_node.node_state != "PAUSED_HITL" && sad_node.node_state != "PAUSED_API_ERROR" && sad_node.node_state != "PAUSED_STOPPED" && sad_node.node_state != "COMPLETED" {
        return Err("현재 상태에서는 실행할 수 없습니다.".to_string());
    }

    sqlx::query("UPDATE document_node SET node_state = 'RUNNING', updated_at = ? WHERE node_id = ?")
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

    // [RETRY] 이전 회차 피드백 및 초안 가져오기
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
             if let Ok(fb_list) = serde_json::from_str::<Vec<String>>(&fb) {
                 last_feedback = fb_list.join("\n");
             }
        }
        if let Ok(prev_bundle) = serde_json::from_str::<serde_json::Value>(&it.generated_draft_json) {
            initial_stage_context = prev_bundle;
        }
    }
    let mut last_error = String::new();

    let resource_dir = app_handle.path().resource_dir().map_err(|e| e.to_string())?;
    let common_prompt = std::fs::read_to_string(resource_dir.join("prompts/generator/common.txt")).unwrap_or_else(|_| {
        println!("!!! Failed to load common.txt generator prompt");
        String::new()
    });

    while current_iter < max_iters && !is_module_success {
        current_iter += 1;
        let module_types = vec!["sad_module_list", "sad_epic_mapping", "sad_module_deps"];
        // 이전 회차 번들 유지
        let mut stage_module_json = initial_stage_context.clone();

        for ctx_type in module_types {
            let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 (Iter {}): {} 생성 중...", current_iter, ctx_type));

            let schema_obj = crate::schemas::get_schema_for_node(ctx_type);
            let resource_path = resource_dir.join(format!("prompts/generator/{}.txt", ctx_type));
            let type_prompt = std::fs::read_to_string(&resource_path).unwrap_or_else(|_| {
                println!("!!! Missing prompt: {:?}", resource_path);
                String::new()
            });

            // 의존성 정의: 사용자 요청에 따라 순차적 주입
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
            let user_prompt = format!(
                "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n$GLOBAL_CONTEXT\n{}\n\n$PREVIOUS_ARCHITECTURAL_DECISIONS\n{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n위 정보를 기반으로 {}을(를) 작성하십시오.",
                ctx_type, current_iter, genesis_prd_content, global_context_str, prev_context_str, prev_draft_str, last_feedback, ctx_type
            );

            let result = call_gemini(&client, &api_key, &sys_prompt, &user_prompt, schema_obj).await;
            let part_json = match result {
                Ok(content) => {
                    serde_json::from_str::<serde_json::Value>(&content)
                        .map_err(|e| format!("SAD Part ({}) 파싱 오류: {} - 원본: {}", ctx_type, e, content))?
                }
                Err(e) => {
                    let (code, msg) = match e {
                        crate::commands::PipelineError::ApiError(c, m) => (c as i32, m),
                        crate::commands::PipelineError::Internal(m) => (0, m),
                    };
                    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_API_ERROR', api_error_code = ?, api_error_message = ?, updated_at = ? WHERE node_id = ?")
                    .bind(code).bind(&msg).bind(Utc::now().to_rfc3339()).bind(&sad_node.node_id)
                    .execute(&*pool).await.map_err(|e| e.to_string())?;
                    return Err(format!("SAD Part ({}) 생성 오류: {}", ctx_type, msg));
                }
            };

            // 통합 객체에 삽입
            if let Some(obj) = stage_module_json.as_object_mut() {
                obj.insert(ctx_type.to_string(), part_json);
            }

            // [STOP CHECK] 개별 파트 생성 후 중단 체크
            if is_node_stopped(&*pool, &sad_node.node_id).await {
                println!(">>> SAD Module Split stopped manually during part generation ({})", ctx_type);
                return Ok("SAD module split stopped manually".to_string());
            }
        }

        let eval_schema = crate::schemas::get_evaluation_schema();
        let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| e.to_string())?;
        
        let common_rubric = std::fs::read_to_string(resource_dir.join("prompts/evaluator/common.txt")).unwrap_or_else(|_| String::new());
        let eval_rubric = std::fs::read_to_string(resource_dir.join("prompts/evaluator/sad_module.txt")).unwrap_or_default();
        
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
                let is_pass = eval["is_pass"].as_bool().unwrap_or(false);
                
                if is_pass || score >= threshold || (current_iter == max_iters) {
                    is_module_success = true;
                    if !is_pass && score < threshold {
                        let _ = app_handle.emit("pipeline-status", format!("SAD Stage 2 품질 미달이나 최대 횟수 도달로 강제 진행 (점수: {})", score));
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

                // 트랜잭션 사용: 부모(generation_iteration) 먼저 저장 후 자식(global_context) 저장
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                sqlx::query(
                    "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&iter_id)
                .bind(&sad_node.node_id)
                .bind(current_iter)
                .bind(combined_bundle.to_string())
                .bind(score)
                .bind(false)
                .bind(&critical_errors_text)
                .bind(&feedback_text)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                // 기계적 분할: 매 회차(Draft 포함)의 3종 컨텍스트를 각각 저장
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

    sqlx::query("UPDATE document_node SET node_state = 'PAUSED_HITL', current_iteration = ?, current_best_score = 100, updated_at = ? WHERE node_id = ?")
    .bind(current_iter)
    .bind(Utc::now().to_rfc3339())
    .bind(&sad_node.node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    let _ = app_handle.emit("pipeline-status", "SAD 모듈 분할 생성 완료. 모듈 생성을 승인해 주세요.");

    Ok("SAD module split pipeline completed".to_string())
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

    // SAD 모듈 분할 노드 완료 처리
    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module'")
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

    // 4-1. 해당 노드의 모든 이터레이션 is_pass 초기화 후 현재 회차만 1로 설정
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

    // 5. 새 컨텍스트 삽입
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

    // 6. 노드의 상태 및 최적 점수 업데이트
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&iteration.node_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE document_node SET current_best_score = ?, node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
    )
    .bind(iteration.calculated_score)
    .bind(&now)
    .bind(&iteration.node_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // 7. 다음 단계 활성화 처리
    if node.target_node_type == "SAD_Global" {
        // SAD_Module 노드를 READY로 전환
        sqlx::query(
            "UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module' AND node_state = 'PENDING'"
        )
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // 8. 만약 SAD_Module이 확정된 것이라면, 로컬 모듈 생성 트리거
    if node.target_node_type == "SAD_Module" {
        println!(">>> SAD_Module confirmed. Triggering local module creation...");
        // internal_create_local_modules 등을 호출하거나, 
        // 여기서 직접 create_local_modules에 필요한 데이터를 파싱해서 처리
        // (create_local_modules는 #[tauri::command]이므로 내부 로직을 분리하는게 좋지만, 
        // 여기서는 직접 로직을 수행하거나 간단히 trigger 함수를 호출)
        
        // stage_module_json (모듈 리스트)은 bundle 안에 "module_split" 키 등으로 들어있을 것임.
        // SAD_Module 단계의 산출물 구조를 확인해야 함.
        if let Some(modules_val) = bundle.get("module_split") {
            if let Some(modules_arr) = modules_val.as_array() {
                let modules_json = serde_json::to_string(modules_arr).unwrap_or_else(|_| "[]".to_string());
                create_local_modules(pool.clone(), project_id.clone(), modules_json, _app_handle.clone()).await?;
            }
        }
    }
    
    let _ = _app_handle.emit("nodes-updated", ());
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
        "SELECT context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at FROM global_context WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 모듈 정보 조회 (추가)
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
    let module_name = &module.module_name;

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
            
            // [특수 필터링] Stage 2 문서에서 해당 모듈 관련 정보만 추출
            match ctx.context_type.as_str() {
                "sad_module_list" => {
                    if let Some(modules) = val.get_mut("modules").and_then(|m| m.as_array_mut()) {
                        modules.retain(|m| m.get("module_name").and_then(|n| n.as_str()) == Some(module_name));
                    }
                },
                "sad_epic_mapping" => {
                    if let Some(mappings) = val.get_mut("mappings").and_then(|m| m.as_array_mut()) {
                        mappings.retain(|m| {
                            m.get("mapped_modules").and_then(|mm| mm.as_array())
                             .map_or(false, |mm| mm.iter().any(|name| name.as_str() == Some(module_name)))
                        });
                    }
                },
                "sad_module_deps" => {
                    if let Some(deps) = val.get_mut("dependencies").and_then(|d| d.as_array_mut()) {
                        deps.retain(|d| {
                            d.get("from_module").and_then(|n| n.as_str()) == Some(module_name) ||
                            d.get("to_module").and_then(|n| n.as_str()) == Some(module_name)
                        });
                    }
                },
                _ => {} // 다른 타입은 전체 주입
            }

            global_ctx[&ctx.context_type] = val;
        }
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

    if node.node_state != "READY" && node.node_state != "PAUSED_HITL" && node.node_state != "PAUSED_API_ERROR" && node.node_state != "PAUSED_STOPPED" && node.node_state != "COMPLETED" {
        return Err("현재 상태에서는 실행할 수 없습니다. (READY, PAUSED_HITL, PAUSED_API_ERROR, PAUSED_STOPPED 또는 COMPLETED 필요)".to_string());
    }



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

    // [RETRY] 이전 회차 정보 가져오기
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
                    previous_feedback.push(format!("보강 필요: {}", f));
                }
            }
        }
    }

    // 모듈 컨텍스트 구성
    let module_context = format!(
        "### [CURRENT MODULE: {}] ###\n\n[설명]\n{}\n\n[핵심 책임]\n{}\n\n[매핑된 Epic]\n{}\n\n[의존성 및 데이터 흐름]\n{}",
        module.module_name,
        module.module_description.as_deref().unwrap_or(""),
        module.core_responsibility.as_deref().unwrap_or(""),
        module.mapped_epics.as_deref().unwrap_or(""),
        module.dependency_spec.as_deref().unwrap_or("없음")
    );

    // 생성/평가용 통합 컨텍스트 구성 (글로벌 규칙 + 모듈 명세)
    let combined_context = format!(
        "{}\n\n{}",
        global_context_str, module_context
    );

    let start_iter = node.current_iteration + 1;
    for i in start_iter..=max_iters {
        final_iteration_count = i;
        let _ = app_handle.emit("pipeline-status", format!("[{}] {} 생성 중 (반복 {}/{})", module.module_name, node_type, i, max_iters));

        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("문서 생성 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 3. Draft 생성 (원본 아이디어 제외, 통합 컨텍스트 주입)
        let draft_res = generate_draft_with_context(&app_handle, &client, &api_key, &node_type, "", &previous_draft, &previous_feedback, &combined_context, i).await;
        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => { loop_error = Some(e); break; }
        };

        // [STOP CHECK] AI 호출 후 중단 체크
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Module Pipeline stopped manually after generation (Node: {})", node.node_id);
            break;
        }

        let _ = app_handle.emit("pipeline-status", format!("[{}] {} 검증 중 (반복 {}/{})", module.module_name, node_type, i, max_iters));
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("품질 검증 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 4. Draft 평가 (통합 컨텍스트 및 이전 피드백 주입)
        let eval_res = evaluate_draft(&app_handle, &client, &api_key, &node_type, &draft, None, &combined_context, &module_context, &previous_feedback, i).await;
        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => { loop_error = Some(e); break; }
        };

        // [STOP CHECK] 평가 후 및 저장 직전 중단 체크
        if is_node_stopped(&*pool, &node.node_id).await {
            println!(">>> Module Pipeline stopped manually before save (Node: {})", node.node_id);
            break;
        }

        let iter_id = Uuid::new_v4().to_string();
        let errors_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();
        let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();

        sqlx::query(
            "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
        )
        .bind(iter_id).bind(&node.node_id).bind(i).bind(&draft).bind(eval.score).bind(false)
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
    iteration: i32,
) -> Result<String, PipelineError> {
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let resource_dir = app_handle.path().resource_dir().map_err(|e: tauri::Error| PipelineError::Internal(e.to_string()))?;
    
    let common_prompt = std::fs::read_to_string(resource_dir.join("prompts/generator/common.txt")).unwrap_or_default();
    let domain_prompt = std::fs::read_to_string(resource_dir.join(format!("prompts/generator/{}.txt", node_normalized))).unwrap_or_default();
    
    let schema_obj = crate::schemas::get_schema_for_node(&node_normalized);
    let combined_sys_prompt = format!("$COMMON_RULES\n{}\n\n$DOMAIN_SPECIFIC_RULE\n{}", common_prompt, domain_prompt);
    
    let mut user_prompt = if node_type != "PRD" {
        format!(
            "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$SOURCE_DOCUMENTS\n{}\n\n위 정보를 바탕으로 기획서를 작성하십시오.",
            node_type, iteration, input_text
        )
    } else {
        format!(
            "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n제공된 글로벌 아키텍처 규칙과 모듈 명세를 바탕으로 상세 기획서(PRD)를 작성하십시오.",
            node_type, iteration
        )
    };

    // 글로벌 컨텍스트 주입
    if !global_context.is_empty() {
        let prefix = if user_prompt.is_empty() { "" } else { "\n\n" };
        user_prompt = format!(
            "{}{}$GLOBAL_CONTEXT\n{}",
            user_prompt, prefix, global_context
        );
    }

    if !previous_draft.is_empty() {
        let feedback_text = if previous_feedback.is_empty() {
            "없음".to_string()
        } else {
            previous_feedback.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
        };
        user_prompt = format!(
            "{}\n\n$PREVIOUS_DRAFT\n{}\n\n$EVALUATOR_FEEDBACK\n{}\n\n위 피드백을 반영하여 기존 설계를 계승하고 보완하여 최신 결과물을 도출하십시오.",
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

/// 파이프라인 수동 중단
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
    let _ = app_handle.emit("pipeline-status", "사용자에 의해 파이프라인이 중단되었습니다.");
    println!(">>> Pipeline manually stopped for node: {}", node_id);
    Ok(())
}

/// 중단된 파이프라인 재개 (READY 상태로 복구)
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

/// 노드가 중단 상태인지 확인하는 내부 헬퍼
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
