use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    Add,
    Modify,
    Delete,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "snake_case")]
pub enum ImpactScope {
    Local,
    CrossModule,
    Global,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "snake_case")]
pub struct IntentItem {
    pub action_type: ActionType,
    pub target_feature: String,
    pub search_keywords: Vec<String>,
    pub target_node_ids: Vec<String>,
    pub target_block_ids: Vec<String>,
    pub reasoning: String,
    pub action_description: String,
    pub key_considerations: Vec<String>,
    pub is_context_mismatch: bool,
    pub mismatch_reason: Option<String>,
    pub impact_scope: ImpactScope,
    pub resolved_comment_ids: Vec<String>,
    pub conflict_resolution: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "snake_case")]
pub struct IntentSchema {
    pub intents: Vec<IntentItem>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ValidationDecision { 
    Pass, 
    Fail, 
    Refactoring 
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
pub struct GlobalValidationSchema {
    #[serde(default = "default_decision")]
    pub decision: ValidationDecision,
    #[serde(default)]
    pub rationale: String,
    #[serde(default)]
    pub violations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
pub struct RoutingSchema {
    pub target_nodes: Vec<String>,
    #[serde(default = "default_decision")]
    pub decision: ValidationDecision,
    #[serde(default)]
    pub rationale: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
pub struct TaintImpactItem {
    pub node_id: String,
    pub node_type: String,
    pub block_ids: Vec<String>,
    pub block_paths: Vec<String>,
    pub reason: String,
    pub similarity_score: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
pub struct TaintCascadeSchema {
    pub impacts: Vec<TaintImpactItem>,
    pub stale_count: i32,
    pub impact_count: i32,
}

pub fn default_decision() -> ValidationDecision {
    ValidationDecision::Pass
}
