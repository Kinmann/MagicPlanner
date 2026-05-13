pub mod evaluator;
pub mod legacy;
pub mod gprd;
pub mod sad;
pub mod routing;

pub use evaluator::*;
pub use legacy::*;
pub use gprd::*;
pub use sad::*;
pub use routing::*;

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
pub fn flatten_schema(mut schema: serde_json::Value) -> serde_json::Value {
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
        "erd" => schemars::schema_for!(ErdSchema),
        "api_spec" => schemars::schema_for!(ApiSpecSchema),
        "user_flow" => schemars::schema_for!(UserFlowSchema),
        "ia" => schemars::schema_for!(IaSchema),
        "wireframe" => schemars::schema_for!(WireframeSchema),
        "tc" => schemars::schema_for!(TcSchema),
        "evaluator" => schemars::schema_for!(EvaluationResult),
        // v2: Genesis PRD
        "genesis_prd" => schemars::schema_for!(GenesisPrdSchema),
        // v2: GPRD Sub-nodes
        "gprd_context_goal" => schemars::schema_for!(GprdContextGoalSchema),
        "gprd_capability_actor" => schemars::schema_for!(GprdCapabilityActorSchema),
        "gprd_architecture_schema" => schemars::schema_for!(GprdArchitectureSchema),
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
        "routing_schema" => schemars::schema_for!(RoutingSchema),
        _ => return None,
    };
    
    let val = serde_json::to_value(schema_val).ok()?;
    Some(flatten_schema(val))
}
