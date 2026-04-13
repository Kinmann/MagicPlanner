use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------
// Evaluator Schema
// ---------------------------------------------------------
#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
pub struct EvaluationIssue {
    pub code: String,       // 지표 코드 (예: Code D-1)
    pub location: String,   // 발생 위치 (JSON Path, 예: endpoints[0].path)
    pub description: String // 상세 설명
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
pub struct EvaluationResult {
    pub score: i32,
    pub is_pass: bool,
    pub critical_errors: Vec<EvaluationIssue>,
    pub feedback: Vec<EvaluationIssue>,
}

// ---------------------------------------------------------
// Generator Schemas
// ---------------------------------------------------------

// 1. PRD
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct PrdOverview {
    pub problem_statement: String,
    pub solution_vision: String,
    pub target_audience: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct PrdCoreFeature {
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
    #[schemars(regex(pattern = "^[A-Z0-9-]+$"))]
    pub id: String,
    pub node_type: String, // Action/Decision/Screen mapped from "type"
    pub actor: String,
    pub label: String,
    pub step: String,
    pub system_response: String,
    pub mapped_func_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct UserFlowEdge {
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
    pub title: String,
    pub actor: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct IaScreenElement {
    pub component_type: String, // mapped from "type"
    pub label: String,
    #[schemars(regex(pattern = "^FUNC-[0-9]{3}$"))]
    pub mapped_func_id: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct IaScreenElementWrap {
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
    pub name: String,
    pub data_type: String, // mapped from "type"
    pub is_pk: bool,
    pub is_fk: bool,
    pub ref_table: Option<String>,
    pub is_unique: bool,
    pub is_nullable: bool,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ErdTable {
    pub table_name: String,
    pub columns: Vec<ErdColumn>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ErdRelationship {
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
    pub component_type: String,
    pub label: String,
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
    pub schema: String, // Changed from serde_json::Value
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApiSpecEndpoint {
    pub method: String,
    pub path: String,
    pub summary: String,
    pub description: String,
    pub request_body: String, // Changed from serde_json::Value
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

// ---------------------------------------------------------
// Helper Function
// ---------------------------------------------------------

/// Recursively replaces `$ref` pointers with their actual definitions from the `definitions` or `$defs` section.
fn resolve_refs(value: &mut serde_json::Value, definitions: &serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(ref_val) = map.remove("$ref") {
                if let Some(ref_str) = ref_val.as_str() {
                    // Extract key from "#/definitions/Key" or "#/$defs/Key"
                    let key = ref_str.rsplit('/').next().unwrap_or("");
                    if let Some(def_content) = definitions.get(key) {
                        *value = def_content.clone();
                        // Resolved content might itself contain references
                        resolve_refs(value, definitions);
                        return;
                    }
                }
            }
            // If it wasn't a $ref, recurse into all fields
            for v in map.values_mut() {
                resolve_refs(v, definitions);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                resolve_refs(v, definitions);
            }
        }
        _ => {}
    }
}

/// Flattens a JSON Schema by inlining all definitions and removing unsupported metadata.
/// Recursively cleans and flattens a JSON Schema for Gemini's strict Structured Outputs API.
fn flatten_schema(mut schema: serde_json::Value) -> serde_json::Value {
    // 1. Resolve definitions if present at this level (usually only at root)
    let definitions = if let Some(map) = schema.as_object_mut() {
        map.remove("definitions").or_else(|| map.remove("$defs"))
    } else {
        None
    };

    if let Some(defs) = definitions {
        resolve_refs(&mut schema, &defs);
        // Resolve refs might have changed the structure, recurse to process the new structure
        return flatten_schema(schema);
    }

    match &mut schema {
        serde_json::Value::Object(map) => {
            // 2. Remove Gemini-unsupported keys
            map.remove("$schema");
            map.remove("title");
            map.remove("additionalProperties");
            // map.remove("description"); // Keep description as it helps the model

            // 3. Handle Option<T> (type: ["string", "null"])
            if let Some(type_val) = map.get_mut("type") {
                if let Some(arr) = type_val.as_array() {
                    let non_null_type = arr.iter()
                        .find(|v| v.as_str() != Some("null"))
                        .cloned()
                        .unwrap_or(serde_json::json!("string"));
                    *type_val = non_null_type;
                }
            }

            // 4. Handle anyOf (generated for complex options)
            if let Some(any_of) = map.remove("anyOf") {
                if let Some(arr) = any_of.as_array() {
                    let best_branch = arr.iter()
                        .find(|branch| {
                            branch.get("type").and_then(|t| t.as_str()) != Some("null")
                        })
                        .cloned();
                    
                    if let Some(branch) = best_branch {
                        if let Some(branch_obj) = branch.as_object() {
                            for (k, v) in branch_obj {
                                map.insert(k.clone(), v.clone());
                            }
                        }
                    }
                }
            }

            // 5. Recurse into properties and ensure all are listed in "required"
            let required_keys: Option<Vec<String>> = map.get("properties")
                .and_then(|p| p.as_object())
                .map(|p| p.keys().cloned().collect());

            if let Some(keys) = required_keys {
                map.insert("required".to_string(), serde_json::to_value(keys).unwrap_or(serde_json::json!([])));
            }

            if let Some(properties) = map.get_mut("properties") {
                if let Some(props_map) = properties.as_object_mut() {
                    for v in props_map.values_mut() {
                        *v = flatten_schema(v.clone());
                    }
                }
            }
            if let Some(items) = map.get_mut("items") {
                *items = flatten_schema(items.clone());
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                *v = flatten_schema(v.clone());
            }
        }
        _ => {}
    }
    schema
}
pub fn get_evaluation_schema() -> serde_json::Value {
    let schema = schemars::schema_for!(EvaluationResult);
    flatten_schema(serde_json::to_value(schema).unwrap())
}

pub fn get_schema_for_node(node_type: &str) -> Option<serde_json::Value> {
    let schema_val = match node_type.to_lowercase().replace(" ", "_").as_str() {
        "prd" => schemars::schema_for!(PrdSchema),
        "fsd" => schemars::schema_for!(FsdSchema),
        "user_flow" => schemars::schema_for!(UserFlowSchema),
        "ia" => schemars::schema_for!(IaSchema),
        "erd" => schemars::schema_for!(ErdSchema),
        "wireframe" => schemars::schema_for!(WireframeSchema),
        "api_spec" => schemars::schema_for!(ApiSpecSchema),
        "tc" => schemars::schema_for!(TcSchema),
        "evaluator" => schemars::schema_for!(EvaluationResult),
        // v2: Genesis PRD
        "genesis_prd" => schemars::schema_for!(GenesisPrdSchema),
        // v2: SAD 글로벌 5종
        "sad_core_erd" => schemars::schema_for!(SadCoreErdSchema),
        "sad_auth_rbac" => schemars::schema_for!(SadAuthRbacSchema),
        "sad_interface_error" => schemars::schema_for!(SadInterfaceErrorSchema),
        "sad_tech_stack" => schemars::schema_for!(SadTechStackSchema),
        "sad_non_tech" => schemars::schema_for!(SadNonTechSchema),
        // v2: SAD 모듈 분할 3종
        "sad_module_list" => schemars::schema_for!(SadModuleListSchema),
        "sad_epic_mapping" => schemars::schema_for!(SadEpicMappingSchema),
        "sad_module_deps" => schemars::schema_for!(SadModuleDepsSchema),
        // v2: SAD Batch
        "sad_global_batch" => schemars::schema_for!(SadGlobalBatchSchema),
        "sad_module_batch" => schemars::schema_for!(SadModuleBatchSchema),
        _ => return None,
    };
    
    let val = serde_json::to_value(schema_val).ok()?;
    
    // Gemini API responseSchema requires a flattened, self-contained schema (no $ref/definitions)
    Some(flatten_schema(val))
}

// ============================================================
// v2: Genesis PRD Schema
// ============================================================

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdMetadata {
    pub project_name: String,
    #[schemars(regex(pattern = "^[0-9]+\\.[0-9]+\\.[0-9]+$"))]
    pub version: String, // pattern: "^[0-9]+\.[0-9]+\.[0-9]+$"
    /// format: "date-time"
    pub generated_at: String,
    pub status: String, // enum: ["DRAFT", "AI_EVALUATED", "HUMAN_APPROVED"]
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdBusinessContext {
    pub product_vision: String,
    pub target_market: String,
    pub success_metrics: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdUserRole {
    #[schemars(regex(pattern = "^ROLE-[A-Z0-9-]+$"))]
    pub role_id: String, // pattern: "^ROLE-[A-Z0-9-]+$"
    pub role_name: String,
    pub permissions_level: String, // enum: ["GUEST", "USER", "ADMIN", "SYSTEM"]
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdEpic {
    #[schemars(regex(pattern = "^EPIC-[A-Z0-9-]+$"))]
    pub epic_id: String, // pattern: "^EPIC-[A-Z0-9-]+$"
    pub title: String,
    pub description: String,
    /// Each element must match pattern: "^ROLE-[A-Z0-9-]+$"
    pub target_roles: Vec<String>,
    #[schemars(description = "True/False 판별 가능한 객관적 명제 배열")]
    pub acceptance_criteria: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdGlobalConstraints {
    pub compliance: Vec<String>,
    pub performance: Vec<String>,
    pub legacy_integrations: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdFrontend {
    pub framework: String, // enum: ["REACT", "NEXT_JS", "VUE", "SVELTE"]
    pub state_management: String,
    pub ui_library: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdBackend {
    pub runtime: String, // enum: ["NODE_JS", "PYTHON", "GO", "RUST"]
    pub framework: String,
    pub language_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdDatabase {
    pub primary: String,
    pub vector_db: String,
    pub caching: Option<String>, // enum: ["REDIS", "MEMCACHED", "NONE"]
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdInfrastructure {
    pub platform: String, // enum: ["AWS", "AZURE", "GCP", "ON_PREMISE"]
    pub containerization: String, // enum: ["DOCKER", "KUBERNETES", "NONE"]
    pub ci_cd_tool: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdAiModelSpec {
    pub model_family: String,
    pub version: String,
    /// Range: 0.0 to 2.0 (Higher values like 1.0+ for more creativity)
    #[schemars(range(min = 0.0, max = 2.0))]
    pub temperature: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct GenesisPrdInterfaceProtocols {
    pub api_type: String, // enum: ["REST", "GRAPHQL", "GRPC"]
    pub auth_protocol: String, // enum: ["OAUTH2", "JWT", "SAML"]
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
pub struct GenesisPrdSchema {
    pub metadata: GenesisPrdMetadata,
    pub business_context: GenesisPrdBusinessContext,
    pub user_roles: Vec<GenesisPrdUserRole>,
    pub core_epics: Vec<GenesisPrdEpic>,
    pub global_constraints: GenesisPrdGlobalConstraints,
    pub tech_stack: GenesisPrdTechStack,
}

// ============================================================
// v2: SAD Global Context 5종
// ============================================================

// 1. Core ERD
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadEntity {
    pub entity_name: String,
    pub description: String,
    pub attributes: Vec<SadEntityAttribute>,
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
    pub from_entity: String,
    pub to_entity: String,
    pub relationship_type: String,
    pub description: String,
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
    pub role_name: String,
    pub description: String,
    pub permissions: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadAuthRbacSchema {
    pub auth_method: String,
    pub token_strategy: String,
    pub roles: Vec<SadRole>,
    pub access_policies: Vec<String>,
}

// 3. Interface & Error
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadErrorCode {
    pub code: String,
    pub http_status: i32,
    pub message: String,
    pub description: String,
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
pub struct SadTechStackSchema {
    pub frontend: String,
    pub backend: String,
    pub database: String,
    pub framework: String,
    pub infrastructure: String,
    pub ci_cd: String,
    pub monitoring: String,
    pub rationale: Vec<String>,
}

// 5. Non-technical
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadNonTechSchema {
    pub legal_constraints: Vec<String>,
    pub compliance_requirements: Vec<String>,
    pub performance_targets: Vec<String>,
    pub scalability_requirements: Vec<String>,
    pub budget_constraints: Vec<String>,
}

// v2: SAD Batch Wrapper Schemas
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


// ============================================================
// v2: SAD Module Split 3종
// ============================================================

// 6. Module List
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct SadModuleEntry {
    pub module_name: String,
    pub description: String,
    pub core_responsibility: String,
    pub priority_order: i32,
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
    pub from_module: String,
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
