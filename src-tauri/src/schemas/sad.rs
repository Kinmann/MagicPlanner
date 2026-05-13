use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use crate::schemas::gprd::GlobalConstraint;

// 1. Core ERD
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadEntity {
    #[schemars(regex(pattern = "^ENT-[0-9]{3}$"))]
    pub entity_id: String,
    pub entity_name: String,
    pub description: String,
    pub attributes: Vec<SadEntityAttribute>,
    pub mapped_epic_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadEntityAttribute {
    pub name: String,
    pub data_type: String,
    pub is_primary_key: bool,
    pub is_nullable: bool,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadRelationship {
    #[schemars(regex(pattern = "^REL-[0-9]{3}$"))]
    pub rel_id: String,
    pub from_entity: String,
    pub to_entity: String,
    pub relationship_type: String,
    pub description: String,
    pub mapped_epic_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadCoreErdSchema {
    pub entities: Vec<SadEntity>,
    pub relationships: Vec<SadRelationship>,
}

// 2. Auth & RBAC
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadRole {
    #[schemars(regex(pattern = "^ROLE-[0-9]{3}$"))]
    pub role_id: String,
    pub role_name: String,
    pub description: String,
    pub permissions: Vec<String>,
    pub mapped_role_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadAccessPolicy {
    #[schemars(regex(pattern = "^POL-[0-9]{3}$"))]
    pub policy_id: String,
    pub description: String,
    pub mapped_epic_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadAuthRbacSchema {
    pub auth_method: String,
    pub token_strategy: String,
    pub roles: Vec<SadRole>,
    pub access_policies: Vec<SadAccessPolicy>,
}

// 3. Interface & Error
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadErrorCode {
    #[schemars(regex(pattern = "^ERR-[0-9]{3}$"))]
    pub error_id: String,
    pub code: String,
    pub http_status: i32,
    pub message: String,
    pub description: String,
    pub mapped_epic_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadInterfaceErrorSchema {
    pub api_versioning_strategy: String,
    pub response_format: String,
    pub pagination_strategy: String,
    pub error_codes: Vec<SadErrorCode>,
}

// 4. Tech Stack
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechRationale {
    #[schemars(regex(pattern = "^RATIO-[0-9]{3}$"))]
    pub rationale_id: String,
    pub description: String,
    pub mapped_tech_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechFrontend {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub framework: String,
    pub state_management: String,
    pub ui_library: Option<String>,
    pub mapped_tech_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechBackend {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub runtime: String,
    pub framework: String,
    pub language_version: Option<String>,
    pub mapped_tech_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechDatabase {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub primary: String,
    pub vector_db: String,
    pub caching: Option<String>,
    pub mapped_tech_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechInfrastructure {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub platform: String,
    pub containerization: String,
    pub ci_cd_tool: Option<String>,
    pub mapped_tech_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechAiModelSpec {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub model_family: String,
    pub version: String,
    #[schemars(range(min = 0.0, max = 2.0))]
    pub temperature: Option<f64>,
    pub mapped_tech_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechInterfaceProtocols {
    #[schemars(regex(pattern = "^TECH-[0-9]{3}$"))]
    pub tech_id: String,
    pub api_type: String,
    pub auth_protocol: String,
    pub mapped_tech_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechStack {
    pub frontend: SadTechFrontend,
    pub backend: SadTechBackend,
    pub database: SadTechDatabase,
    pub infrastructure: SadTechInfrastructure,
    pub ai_model_spec: SadTechAiModelSpec,
    pub interface_protocols: SadTechInterfaceProtocols,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadTechStackSchema {
    pub tech_stack: SadTechStack,
    pub rationale: Vec<SadTechRationale>,
}

// 5. Non-technical
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadNonTechSchema {
    pub legal_constraints: Vec<GlobalConstraint>,
    pub compliance_requirements: Vec<GlobalConstraint>,
    pub performance_targets: Vec<GlobalConstraint>,
    pub scalability_requirements: Vec<GlobalConstraint>,
    pub budget_constraints: Vec<GlobalConstraint>,
}

// 6. Module List
#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "snake_case")]
pub struct SadModuleEntry {
    #[schemars(regex(pattern = "^MOD-[0-9]{3}$"))]
    pub module_id: String,
    pub module_name: String,
    pub description: String,
    pub core_responsibility: String,
    pub priority_order: i32,
    pub mapped_epic_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadModuleListSchema {
    pub modules: Vec<SadModuleEntry>,
}

// 7. Epic Mapping
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadEpicModuleMapping {
    #[schemars(regex(pattern = "^EPIC-[0-9]{3}$"))]
    pub epic_id: String,
    pub epic_name: String,
    pub mapped_modules: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadEpicMappingSchema {
    pub mappings: Vec<SadEpicModuleMapping>,
}

// 8. Module Dependencies
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadModuleDependency {
    #[schemars(regex(pattern = "^DEP-[0-9]{3}$"))]
    pub dep_id: String,
    #[schemars(regex(pattern = "^MOD-[0-9]{3}$"))]
    pub from_module: String,
    #[schemars(regex(pattern = "^MOD-[0-9]{3}$"))]
    pub to_module: String,
    pub dependency_type: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadModuleDepsSchema {
    pub dependencies: Vec<SadModuleDependency>,
    pub recommended_build_order: Vec<String>,
}

// Batch Wrapper Schemas
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadGlobalBatchSchema {
    pub sad_core_erd: SadCoreErdSchema,
    pub sad_auth_rbac: SadAuthRbacSchema,
    pub sad_interface_error: SadInterfaceErrorSchema,
    pub sad_tech_stack: SadTechStackSchema,
    pub sad_non_tech: SadNonTechSchema,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadModuleBatchSchema {
    pub sad_module_list: SadModuleListSchema,
    pub sad_epic_mapping: SadEpicMappingSchema,
    pub sad_module_deps: SadModuleDepsSchema,
}
