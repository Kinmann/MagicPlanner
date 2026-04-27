use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// 프로젝트 메타데이터
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

/// DAG 파이프라인의 개별 문서 노드
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
    #[serde(default)]
    #[sqlx(default)]
    pub is_active: bool,
    #[serde(default)]
    #[sqlx(default)]
    pub is_locked: bool,
}

/// 생성 반복(iteration) 결과 - 초안 + 평가 점수
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
