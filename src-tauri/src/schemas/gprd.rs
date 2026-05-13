use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdMetadata {
    pub project_name: String,
    #[schemars(regex(pattern = "^[0-9]+\\.[0-9]+\\.[0-9]+$"))]
    pub version: String,
    pub generated_at: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GprdSuccessMetric {
    #[schemars(regex(pattern = "^METRIC-[0-9]{3}$"))]
    pub metric_id: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GprdGlobalConstraint {
    #[schemars(regex(pattern = "^CONS-[0-9]{3}$"))]
    pub constraint_id: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GlobalConstraint {
    #[schemars(regex(pattern = "^CONS-[0-9]{3}$"))]
    pub constraint_id: String,
    pub description: String,
    pub mapped_cons_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GprdGlobalConstraints {
    pub compliance: Vec<GprdGlobalConstraint>,
    pub performance: Vec<GprdGlobalConstraint>,
    pub legacy_integrations: Vec<GprdGlobalConstraint>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GprdContextGoalSchema {
    pub metadata: GenesisPrdMetadata,
    pub product_vision: String,
    pub target_market: String,
    pub success_metrics: Vec<GprdSuccessMetric>,
    pub global_constraints: GprdGlobalConstraints,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GprdActor {
    #[schemars(regex(pattern = "^ROLE-[0-9]{3}$"))]
    pub role_id: String,
    pub role_name: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GprdEpic {
    #[schemars(regex(pattern = "^EPIC-[0-9]{3}$"))]
    pub epic_id: String,
    pub title: String,
    pub description: String,
    pub required_actors: Vec<String>,
    pub acceptance_criteria: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GprdCapabilityActorSchema {
    pub actors: Vec<GprdActor>,
    pub core_epics: Vec<GprdEpic>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdUserRole {
    #[schemars(regex(pattern = "^ROLE-[0-9]{3}$"))]
    pub role_id: String,
    pub role_name: String,
    pub permissions_level: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdFrontend {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub framework: String,
    pub state_management: String,
    pub ui_library: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdBackend {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub runtime: String,
    pub framework: String,
    pub language_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdDatabase {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub primary: String,
    pub vector_db: String,
    pub caching: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdInfrastructure {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub platform: String,
    pub containerization: String,
    pub ci_cd_tool: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdAiModelSpec {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub model_family: String,
    pub version: String,
    #[schemars(range(min = 0.0, max = 2.0))]
    pub temperature: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdInterfaceProtocols {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub api_type: String,
    pub auth_protocol: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdTechStack {
    pub frontend: GenesisPrdFrontend,
    pub backend: GenesisPrdBackend,
    pub database: GenesisPrdDatabase,
    pub infrastructure: GenesisPrdInfrastructure,
    pub ai_model_spec: GenesisPrdAiModelSpec,
    pub interface_protocols: GenesisPrdInterfaceProtocols,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GprdArchitectureSchema {
    pub user_roles: Vec<GenesisPrdUserRole>,
    pub tech_stack: GenesisPrdTechStack,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdBusinessContext {
    pub product_vision: String,
    pub target_market: String,
    pub success_metrics: Vec<GprdSuccessMetric>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdEpic {
    #[schemars(regex(pattern = "^EPIC-[0-9]{3}$"))]
    pub epic_id: String,
    pub title: String,
    pub description: String,
    pub target_roles: Vec<String>,
    #[schemars(description = "True/False 판별 가능한 객관적 명제 배열")]
    pub acceptance_criteria: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdGlobalConstraints {
    pub compliance: Vec<GprdGlobalConstraint>,
    pub performance: Vec<GprdGlobalConstraint>,
    pub legacy_integrations: Option<Vec<GprdGlobalConstraint>>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdSchema {
    pub metadata: GenesisPrdMetadata,
    pub business_context: GenesisPrdBusinessContext,
    pub user_roles: Vec<GenesisPrdUserRole>,
    pub core_epics: Vec<GenesisPrdEpic>,
    pub global_constraints: GenesisPrdGlobalConstraints,
    pub tech_stack: GenesisPrdTechStack,
}
