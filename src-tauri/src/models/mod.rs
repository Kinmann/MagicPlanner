// models/ 모듈 - DB 모델 구조체 정의
//
// 기존 commands.rs에서 분리된 데이터 모델들.
// 모든 구조체는 sqlx::FromRow + serde 직렬화를 지원합니다.

pub mod project;
pub mod module;
pub mod common;
pub mod comment;

// 재내보내기 (re-export) - 외부에서 crate::models::Project 형태로 접근 가능
pub use project::*;
pub use module::*;
pub use common::*;
pub use comment::*;

use sqlx::FromRow;
#[derive(serde::Serialize, serde::Deserialize, FromRow)]
pub struct ActiveNodeInfo {
    pub node_id: String,
    pub project_id: String,
    pub project_name: String,
    pub module_id: Option<String>,
    pub module_name: Option<String>,
    pub target_node_type: String,
    pub node_state: String,
    pub last_action: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub is_active: bool,
}
