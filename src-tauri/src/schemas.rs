use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------
// Evaluator Schema
// ---------------------------------------------------------
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct EvaluationResult {
    pub score: i32,
    pub is_pass: bool,
    pub critical_errors: Vec<String>,
    pub feedback: Vec<String>,
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
    pub screen_id: String,
    pub title: String,
    pub actor: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct IaScreenElement {
    pub component_type: String, // mapped from "type"
    pub label: String,
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
    pub schema: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApiSpecEndpoint {
    pub method: String,
    pub path: String,
    pub summary: String,
    pub description: String,
    pub request_body: serde_json::Value,
    pub responses: Vec<ApiSpecResponse>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApiSpecSchema {
    pub endpoints: Vec<ApiSpecEndpoint>,
}

// 8. TC (Test Case)
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct TestCaseItem {
    pub tc_id: String,
    pub mapped_req_id: String,
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
    match &mut schema {
        serde_json::Value::Object(map) => {
            // 1. Resolve definitions if present at this level (usually only at root)
            let definitions = map.remove("definitions")
                .or_else(|| map.remove("$defs"));
            if let Some(defs) = definitions {
                resolve_refs(&mut schema, &defs);
                // Re-borrow map after schema might have changed
                if let Some(new_map) = schema.as_object_mut() {
                    // Continue with cleaning the newly resolved map
                    let cloned_val = serde_json::Value::Object(new_map.clone());
                    return flatten_schema(cloned_val);
                }
            }

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

            // 5. Recurse into properties, items, etc.
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
        _ => return None,
    };
    
    let val = serde_json::to_value(schema_val).ok()?;
    
    // Gemini API responseSchema requires a flattened, self-contained schema (no $ref/definitions)
    Some(flatten_schema(val))
}
