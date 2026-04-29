use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct NodeComment {
    pub comment_id: String,
    pub project_id: String,
    pub node_id: String,
    pub iteration_id: String,
    pub json_path: String,
    pub comment_text: String,
    pub author: String,
    pub is_resolved: bool,
    pub created_at: String,
    pub updated_at: String,
}
