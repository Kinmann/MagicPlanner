use sqlx::SqlitePool;
use chrono::Utc;
use uuid::Uuid;
use reqwest::Client;
use tauri::Emitter;

use crate::models::{
    PipelineError, Project, DocumentNode, GenerationIteration,
    PipelineStatusPayload,
};

use crate::services::draft_generator::{generate_draft, evaluate_draft};
use crate::services::node_query::{get_approved_node_output, get_approved_module_node_output};

pub async fn is_node_stopped(pool: &SqlitePool, node_id: &str) -> bool {
    let state: Option<(String,)> = sqlx::query_as("SELECT node_state FROM document_node WHERE node_id = ?")
        .bind(node_id).fetch_optional(pool).await.unwrap_or(None);
    state.is_some_and(|(s,)| s == "PAUSED_STOPPED")
}

pub struct ExecutionResult {
    pub current_best_content: String,
    pub current_best_score: i32,
    pub final_iteration_count: i32,
    pub loop_error: Option<PipelineError>,
}

pub async fn run_execution_loop(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project: &Project,
    node: &DocumentNode,
    actual_node_type: &str,
    global_ctx_str: &str,
    module_ctx_str: &str,
    start_iter: i32,
) -> Result<ExecutionResult, String> {
    let max_iters = node.max_iterations;
    let mut current_best_content = String::new();
    let mut current_best_score = node.current_best_score;
    let mut final_iteration_count = node.current_iteration;
    let mut loop_error: Option<PipelineError> = None;

    // 이전 반복 컨텍스트 로드
    let latest_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
    )
    .bind(&node.node_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut previous_draft = String::new();
    let mut previous_feedback: Vec<String> = Vec::new();

    if let Some(it) = latest_iter {
        previous_draft = it.generated_draft_json;
        if let Some(errors_json) = it.critical_errors_array {
            if let Ok(issues) = serde_json::from_str::<Vec<crate::schemas::EvaluationIssue>>(&errors_json) {
                for issue in issues {
                    previous_feedback.push(format!("[위치: {}] {} : {}", issue.location, issue.code, issue.description));
                }
            }
        }
        if let Some(action_json) = it.actionable_feedback_text {
            if let Ok(issues) = serde_json::from_str::<Vec<crate::schemas::EvaluationIssue>>(&action_json) {
                for issue in issues {
                    previous_feedback.push(format!("[실행 가능 피드백 - 위치: {}] {} : {}", issue.location, issue.code, issue.description));
                }
            }
        }
    }

    for i in start_iter..=max_iters {
        final_iteration_count = i;
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "초안 생성 중".into(),
            node_type: actual_node_type.to_string(),
            level: "INFO".into(),
            current_iteration: Some(i),
            max_iterations: Some(max_iters),
            node_id: node.node_id.clone(),
            project_id: project.project_id.clone(),
            status: "IN_PROGRESS".into(),
            is_silent: None,
        });
        
        sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("초안 생성 중...").bind(Utc::now().to_rfc3339()).bind(&node.node_id)
            .execute(pool).await.map_err(|e| e.to_string())?;

        let input_text = gather_input_text(pool, project, node, actual_node_type, module_ctx_str).await;

        let draft_res = generate_draft(crate::services::draft_generator::DraftGenerationArgs {
            app_handle,
            pool,
            client,
            api_key,
            project_id: &project.project_id,
            node_category: &node.node_category,
            node_type: actual_node_type,
            input_text: &input_text,
            global_context: global_ctx_str,
            module_context: module_ctx_str,
            previous_draft: &previous_draft,
            previous_feedback: &previous_feedback,
            iteration: i,
            target_count: node.target_count,
            _exclude_node_ids: &[],
        }).await;

        let draft = match draft_res {
            Ok(d) => d,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        if is_node_stopped(pool, &node.node_id).await { break; }

        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "초안 평가 중".into(),
            node_type: actual_node_type.to_string(),
            level: "INFO".into(),
            current_iteration: Some(i),
            max_iterations: Some(max_iters),
            node_id: node.node_id.clone(),
            project_id: project.project_id.clone(),
            status: "IN_PROGRESS".into(),
            is_silent: None,
        });

        let eval_res = evaluate_draft(crate::services::draft_generator::DraftEvaluationArgs {
            app_handle,
            pool,
            client,
            api_key,
            project_id: &project.project_id,
            node_category: &node.node_category,
            node_type: actual_node_type,
            draft: &draft,
            input_text: Some(input_text.clone()),
            global_context: global_ctx_str,
            module_context: module_ctx_str,
            previous_feedback: &Vec::new(),
            iteration: i,
            _exclude_node_ids: &[],
        }).await;

        let eval = match eval_res {
            Ok(e) => e,
            Err(e) => {
                loop_error = Some(e);
                break;
            }
        };

        if is_node_stopped(pool, &node.node_id).await { break; }

        save_iteration(pool, node, i, &draft, &eval).await?;

        if eval.score >= current_best_score {
            current_best_score = eval.score;
            current_best_content = draft.clone();
        }

        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: "초안 생성 완료".into(),
            node_type: actual_node_type.to_string(),
            level: "SUCCESS".into(),
            current_iteration: Some(i),
            max_iterations: Some(max_iters),
            node_id: node.node_id.clone(),
            project_id: project.project_id.clone(),
            status: "ITERATION_COMPLETED".into(),
            is_silent: None,
        });
        
        previous_draft = draft;
        previous_feedback = eval.critical_errors.iter().map(|issue| format!("[위치: {}] {} : {}", issue.location, issue.code, issue.description)).collect();
        previous_feedback.extend(eval.feedback.iter().map(|issue| format!("[실행 가능 피드백 - 위치: {}] {} : {}", issue.location, issue.code, issue.description)));
    }

    Ok(ExecutionResult {
        current_best_content,
        current_best_score,
        final_iteration_count,
        loop_error,
    })
}

async fn gather_input_text(
    pool: &SqlitePool,
    project: &Project,
    node: &DocumentNode,
    actual_node_type: &str,
    module_ctx_str: &str,
) -> String {
    if node.node_category == "SAD" {
        let out_1a = get_approved_node_output(pool, &project.project_id, "GPRD_Context_Goal").await;
        let out_1b = get_approved_node_output(pool, &project.project_id, "GPRD_Capability_Actor").await;
        let out_1c = get_approved_node_output(pool, &project.project_id, "GPRD_Architecture_Schema").await;
        
        let mut base_input = format!(
            "[GPRD_Context_Goal]\n{}\n\n[GPRD_Capability_Actor]\n{}\n\n[GPRD_Architecture_Schema]\n{}", 
            out_1a, out_1b, out_1c
        );

        if actual_node_type == "SAD_Epic_Mapping" || actual_node_type == "SAD_Module_Deps" {
            let out_module_list = get_approved_node_output(pool, &project.project_id, "SAD_Module_List").await;
            if !out_module_list.is_empty() {
                base_input = format!("[Approved Module List (SSOT)]\n{}\n\n{}", out_module_list, base_input);
            }
        }
        base_input
    } else if node.node_category == "MODULE" {
        let mut base_input = if !module_ctx_str.is_empty() {
            format!("{}\n\n[Project Overview]\n{}", module_ctx_str, project.raw_input_text)
        } else {
            project.raw_input_text.clone()
        };

        if let Some(mid) = &node.module_id {
            match actual_node_type {
                "FSD" => {
                    let out_prd = get_approved_module_node_output(pool, mid, "PRD").await;
                    if !out_prd.is_empty() { base_input = format!("[Source Module PRD]\n{}\n\n{}", out_prd, base_input); }
                },
                _ => {} // 다른 타입들도 유사하게 추가 가능
            }
        }
        base_input
    } else {
        project.raw_input_text.clone()
    }
}

async fn save_iteration(
    pool: &SqlitePool,
    node: &DocumentNode,
    iteration: i32,
    draft: &str,
    eval: &crate::schemas::EvaluationResult,
) -> Result<(), String> {
    let iter_id = Uuid::new_v4().to_string();
    let errors_json = serde_json::to_string(&eval.critical_errors).unwrap_or_default();
    let feedback_json = serde_json::to_string(&eval.feedback).unwrap_or_default();

    sqlx::query(
        "INSERT INTO generation_iteration (iteration_id, node_id, iteration_number, generated_draft_json, calculated_score, is_pass, critical_errors_array, actionable_feedback_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
    )
    .bind(iter_id)
    .bind(&node.node_id)
    .bind(iteration)
    .bind(draft)
    .bind(eval.score)
    .bind(0)
    .bind(errors_json)
    .bind(feedback_json)
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE document_node SET current_iteration = ?, updated_at = ? WHERE node_id = ?"
    )
    .bind(iteration)
    .bind(Utc::now().to_rfc3339())
    .bind(&node.node_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
