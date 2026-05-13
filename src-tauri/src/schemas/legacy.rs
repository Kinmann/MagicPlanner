use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// 1. PRD
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct PrdOverview {
    pub problem_statement: String,
    pub solution_vision: String,
    pub target_audience: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct PrdCoreFeature {
    #[schemars(regex(pattern = "^EPIC-[0-9]{3}$"))]
    pub mapped_epic_id: String,
    #[schemars(regex(pattern = "^REQ-[0-9]{3}$"))]
    pub req_id: String,
    pub feature_name: String,
    pub description: String,
    /// Priority enum: P0, P1, P2
    pub priority: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct PrdSchema {
    pub project_name: String,
    pub overview: PrdOverview,
    pub goals: Vec<String>,
    pub core_features: Vec<PrdCoreFeature>,
    pub user_stories: Vec<String>,
    pub constraints: Vec<String>,
}

// 2. FSD
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct FsdFeature {
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub func_id: String,
    #[schemars(regex(pattern = "^REQ-[0-9]{3}$"))]
    pub mapped_req_id: String,
    pub module: String,
    pub summary: String,
    pub description: String,
    pub pre_condition: String,
    pub post_condition: String,
    pub flow: Vec<String>,
    pub exception_flow: Vec<String>,
    pub data_requirements: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct FsdSchema {
    pub project_id: String,
    pub features: Vec<FsdFeature>,
}

// 3. User Flow
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct UserFlowNode {
    #[schemars(regex(pattern = "^FLOW-[0-9]{3}$"))]
    pub id: String,
    pub node_type: String, // Action/Decision/Screen mapped from "type"
    pub actor: String,
    pub label: String,
    pub step: String,
    pub system_response: String,
    pub mapped_func_ids: Vec<String>, // We'll enforce pattern in generator/evaluator
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct UserFlowEdge {
    #[schemars(regex(pattern = "^EDGE-[0-9]{3}$"))]
    pub edge_id: String,
    pub from_id: String,
    pub to_id: String,
    pub condition: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct UserFlowSchema {
    pub nodes: Vec<UserFlowNode>,
    pub edges: Vec<UserFlowEdge>,
}

// 4. IA
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct IaHierarchy {
    pub depth: i32,
    pub parent_id: Option<String>,
    #[schemars(regex(pattern = "^SCR-[0-9]{3}$"))]
    pub screen_id: String,
    #[schemars(regex(pattern = "^FLOW-[0-9]{3}$"))]
    pub mapped_user_flow_id: Option<String>,
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub mapped_func_id: Option<String>,
    pub title: String,
    pub actor: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct IaScreenElement {
    #[schemars(regex(pattern = "^ELM-[0-9]{3}$"))]
    pub element_id: String,
    pub component_type: String, // mapped from "type"
    pub label: String,
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub mapped_func_id: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct IaScreenElementWrap {
    #[schemars(regex(pattern = "^SCR-[0-9]{3}$"))]
    pub screen_id: String,
    pub elements: Vec<IaScreenElement>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct IaSchema {
    pub hierarchy: Vec<IaHierarchy>,
    pub screen_elements: Vec<IaScreenElementWrap>,
}

// 5. ERD
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ErdColumn {
    #[schemars(regex(pattern = "^COL-[0-9]{3}$"))]
    pub column_id: String,
    pub name: String,
    pub data_type: String, // mapped from "type"
    pub is_pk: bool,
    pub is_fk: bool,
    pub ref_table: Option<String>,
    pub is_unique: bool,
    pub is_nullable: bool,
    pub description: String,
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub mapped_func_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ErdTable {
    #[schemars(regex(pattern = "^TBL-[0-9]{3}$"))]
    pub table_id: String,
    pub table_name: String,
    pub columns: Vec<ErdColumn>,
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub mapped_func_id: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ErdRelationship {
    #[schemars(regex(pattern = "^REL-[0-9]{3}$"))]
    pub rel_id: String,
    pub source_table: String,
    pub target_table: String,
    pub rel_type: String, // mapped from "type"
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ErdSchema {
    pub tables: Vec<ErdTable>,
    pub relationships: Vec<ErdRelationship>,
}

// 6. Wireframe
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct WireframeComponent {
    #[schemars(regex(pattern = "^CMP-[0-9]{3}$"))]
    pub component_id: String,
    pub component_type: String,
    pub label: String,
    #[schemars(regex(pattern = "^ELM-[0-9]{3}$"))]
    pub mapped_element_id: String,
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub mapped_func_id: String,
    pub mapped_data_fields: Vec<String>,
    pub state_condition: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct WireframeRegion {
    pub region_name: String,
    pub components: Vec<WireframeComponent>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct WireframeScreen {
    #[schemars(regex(pattern = "^SCR-[0-9]{3}$"))]
    pub screen_id: String,
    pub screen_name: String,
    pub layout_regions: Vec<WireframeRegion>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct WireframeSchema {
    pub screens: Vec<WireframeScreen>,
}

// 7. API Spec
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApiSpecResponse {
    pub status_code: i32,
    pub description: String,
    pub schema: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApiSpecEndpoint {
    #[schemars(regex(pattern = "^API-[0-9]{3}$"))]
    pub api_id: String,
    pub method: String,
    pub path: String,
    pub summary: String,
    pub description: String,
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub mapped_func_id: String,
    pub headers: String,
    pub path_params: String,
    pub query_params: String,
    pub request_body: String,
    pub responses: Vec<ApiSpecResponse>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApiSpecSchema {
    pub endpoints: Vec<ApiSpecEndpoint>,
}

// 8. TC (Test Case)
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct TestCaseItem {
    #[schemars(regex(pattern = "^TC-[0-9]{3}$"))]
    pub tc_id: String,
    #[schemars(regex(pattern = "^REQ-[0-9]{3}$"))]
    pub mapped_req_id: String,
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub mapped_func_id: String,
    pub tc_type: String,
    pub title: String,
    pub pre_conditions: Vec<String>,
    pub test_steps: Vec<String>,
    pub expected_result: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct TcSchema {
    pub test_cases: Vec<TestCaseItem>,
}
