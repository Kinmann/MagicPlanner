use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// SAD 단계에서 생성되는 글로벌 아키텍처 컨텍스트
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
    #[sqlx(default)]
    pub is_deleted: i32,
}

/// 프로젝트 내 개별 기능 모듈 (SAD Module Split에서 생성)
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
    #[sqlx(default)]
    pub is_deleted: i32,
}
