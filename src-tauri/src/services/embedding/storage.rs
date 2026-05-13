use crate::services::embedding::{EmbeddingStoreArgs, call_gemini_embedding};

pub fn chunk_json_document(json_str: &str, node_type: &str) -> Vec<String> {
    let val: serde_json::Value = serde_json::from_str(json_str).unwrap_or_default();
    let mut chunks = Vec::new();
    
    match node_type.to_lowercase().replace(" ", "_").as_str() {
        "genesis_prd" | "gprd_context_goal" | "gprd_capability_actor" | "gprd_architecture_schema" => {
            if let (Some(meta), Some(biz)) = (val.get("metadata"), val.get("business_context")) {
                chunks.push(format!("[GENESIS_PRD:OVERVIEW]\nmetadata: {}\nbusiness_context: {}",
                    serde_json::to_string_pretty(meta).unwrap_or_default(),
                    serde_json::to_string_pretty(biz).unwrap_or_default()));
            }
            if let Some(roles) = val.get("user_roles").and_then(|v| v.as_array()) {
                for role in roles {
                    let role_name = role.get("role_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[GENESIS_PRD:ROLE:{}]\n{}", role_name, serde_json::to_string_pretty(role).unwrap_or_default()));
                }
            }
            if let Some(epics) = val.get("core_epics").and_then(|v| v.as_array()) {
                for epic in epics {
                    let epic_id = epic.get("epic_id").and_then(|e| e.as_str()).unwrap_or("unknown");
                    let title = epic.get("title").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[GENESIS_PRD:EPIC:{}:{}]\n{}", epic_id, title, serde_json::to_string_pretty(epic).unwrap_or_default()));
                }
            }
            if let Some(constraints) = val.get("global_constraints") {
                chunks.push(format!("[GENESIS_PRD:CONSTRAINTS]\n{}", serde_json::to_string_pretty(constraints).unwrap_or_default()));
            }
            if let Some(tech) = val.get("tech_stack") {
                chunks.push(format!("[GENESIS_PRD:TECH_STACK]\n{}", serde_json::to_string_pretty(tech).unwrap_or_default()));
            }
        }
        "prd" => {
            if let Some(overview) = val.get("overview") {
                let name = val.get("project_name").and_then(|n| n.as_str()).unwrap_or("");
                chunks.push(format!("[PRD:OVERVIEW:{}]\n{}", name, serde_json::to_string_pretty(overview).unwrap_or_default()));
            }
            if let Some(features) = val.get("core_features").and_then(|v| v.as_array()) {
                for feat in features {
                    let fname = feat.get("feature_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    let priority = feat.get("priority").and_then(|p| p.as_str()).unwrap_or("P1");
                    chunks.push(format!("[PRD:FEATURE:{}:{}]\n{}", fname, priority, serde_json::to_string_pretty(feat).unwrap_or_default()));
                }
            }
            if let Some(stories) = val.get("user_stories") {
                chunks.push(format!("[PRD:USER_STORIES]\n{}", serde_json::to_string_pretty(stories).unwrap_or_default()));
            }
            if let Some(constraints) = val.get("constraints") {
                chunks.push(format!("[PRD:CONSTRAINTS]\n{}", serde_json::to_string_pretty(constraints).unwrap_or_default()));
            }
        }
        "fsd" => {
            if let Some(features) = val.get("features").and_then(|v| v.as_array()) {
                for feat in features {
                    let func_id = feat.get("func_id").and_then(|f| f.as_str()).unwrap_or("unknown");
                    let module = feat.get("module").and_then(|m| m.as_str()).unwrap_or("");
                    let summary = feat.get("summary").and_then(|s| s.as_str()).unwrap_or("");
                    chunks.push(format!("[FSD:{}:{}:{}]\n{}", func_id, module, summary, serde_json::to_string_pretty(feat).unwrap_or_default()));
                }
            }
        }
        "user_flow" => {
            if let Some(nodes) = val.get("nodes").and_then(|v| v.as_array()) {
                for node in nodes {
                    let id = node.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let ntype = node.get("node_type").and_then(|t| t.as_str()).unwrap_or("");
                    let label = node.get("label").and_then(|l| l.as_str()).unwrap_or("");
                    let func_ids = node.get("mapped_func_ids").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(",")).unwrap_or_default();
                    chunks.push(format!("[USER_FLOW:STEP:{}:{}:{}] mapped_funcs=[{}]\n{}", id, ntype, label, func_ids, serde_json::to_string_pretty(node).unwrap_or_default()));
                }
            }
            if let Some(edges) = val.get("edges") {
                chunks.push(format!("[USER_FLOW:EDGES]\n{}", serde_json::to_string_pretty(edges).unwrap_or_default()));
            }
        }
        "ia" => {
            if let Some(hierarchy) = val.get("hierarchy") {
                chunks.push(format!("[IA:HIERARCHY]\n{}", serde_json::to_string_pretty(hierarchy).unwrap_or_default()));
            }
            if let Some(screens) = val.get("screen_elements").and_then(|v| v.as_array()) {
                for screen in screens {
                    let sid = screen.get("screen_id").and_then(|s| s.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[IA:SCREEN:{}]\n{}", sid, serde_json::to_string_pretty(screen).unwrap_or_default()));
                }
            }
        }
        "erd" => {
            if let Some(tables) = val.get("tables").and_then(|v| v.as_array()) {
                for table in tables {
                    let tname = table.get("table_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[ERD:TABLE:{}]\n{}", tname, serde_json::to_string_pretty(table).unwrap_or_default()));
                }
            }
            if let Some(rels) = val.get("relationships").and_then(|v| v.as_array()) {
                for rel in rels {
                    let src = rel.get("source_table").and_then(|s| s.as_str()).unwrap_or("");
                    let tgt = rel.get("target_table").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[ERD:REL:{}->{}]\n{}", src, tgt, serde_json::to_string_pretty(rel).unwrap_or_default()));
                }
            }
        }
        "wireframe" => {
            if let Some(screens) = val.get("screens").and_then(|v| v.as_array()) {
                for screen in screens {
                    let sid = screen.get("screen_id").and_then(|s| s.as_str()).unwrap_or("unknown");
                    let sname = screen.get("screen_name").and_then(|n| n.as_str()).unwrap_or("");
                    chunks.push(format!("[WIREFRAME:SCREEN:{}:{}]\n{}", sid, sname, serde_json::to_string_pretty(screen).unwrap_or_default()));
                    if let Some(regions) = screen.get("layout_regions").and_then(|r| r.as_array()) {
                        for region in regions {
                            let rname = region.get("region_name").and_then(|r| r.as_str()).unwrap_or("unknown");
                            chunks.push(format!("[WIREFRAME:REGION:{}:{}:{}]\n{}", sid, sname, rname, serde_json::to_string_pretty(region).unwrap_or_default()));
                        }
                    }
                }
            }
        }
        "api_spec" => {
            if let Some(endpoints) = val.get("endpoints").and_then(|v| v.as_array()) {
                for ep in endpoints {
                    let method = ep.get("method").and_then(|m| m.as_str()).unwrap_or("GET");
                    let path = ep.get("path").and_then(|p| p.as_str()).unwrap_or("/");
                    let summary = ep.get("summary").and_then(|s| s.as_str()).unwrap_or("");
                    chunks.push(format!("[API:{}:{}:{}] headers, path_params, query_params\n{}", method, path, summary, serde_json::to_string_pretty(ep).unwrap_or_default()));
                }
            }
        }
        "tc" => {
            if let Some(cases) = val.get("test_cases").and_then(|v| v.as_array()) {
                for tc in cases {
                    let tc_id = tc.get("tc_id").and_then(|t| t.as_str()).unwrap_or("unknown");
                    let func_id = tc.get("mapped_func_id").and_then(|f| f.as_str()).unwrap_or("");
                    let title = tc.get("title").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[TC:{}:{}:{}]\n{}", tc_id, func_id, title, serde_json::to_string_pretty(tc).unwrap_or_default()));
                }
            }
        }
        "sad_core_erd" => {
            if let Some(entities) = val.get("entities").and_then(|v| v.as_array()) {
                for entity in entities {
                    let ename = entity.get("entity_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_ERD:ENTITY:{}]\n{}", ename, serde_json::to_string_pretty(entity).unwrap_or_default()));
                }
            }
            if let Some(rels) = val.get("relationships").and_then(|v| v.as_array()) {
                for rel in rels {
                    let from = rel.get("from_entity").and_then(|f| f.as_str()).unwrap_or("");
                    let to = rel.get("to_entity").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_ERD:REL:{}->{}]\n{}", from, to, serde_json::to_string_pretty(rel).unwrap_or_default()));
                }
            }
        }
        "sad_auth_rbac" => {
            let auth = val.get("auth_method").and_then(|a| a.as_str()).unwrap_or("");
            let token = val.get("token_strategy").and_then(|t| t.as_str()).unwrap_or("");
            let policies = val.get("access_policies").and_then(|p| serde_json::to_string_pretty(p).ok()).unwrap_or_default();
            chunks.push(format!("[SAD_AUTH:STRATEGY] auth={}, token={}\naccess_policies: {}", auth, token, policies));
            if let Some(roles) = val.get("roles").and_then(|v| v.as_array()) {
                for role in roles {
                    let rname = role.get("role_name").and_then(|r| r.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_AUTH:ROLE:{}]\n{}", rname, serde_json::to_string_pretty(role).unwrap_or_default()));
                }
            }
        }
        "sad_interface_error" => {
            let versioning = val.get("api_versioning_strategy").and_then(|v| v.as_str()).unwrap_or("");
            let format = val.get("response_format").and_then(|f| f.as_str()).unwrap_or("");
            let pagination = val.get("pagination_strategy").and_then(|p| p.as_str()).unwrap_or("");
            chunks.push(format!("[SAD_IFACE:STRATEGY] versioning={}, format={}, pagination={}", versioning, format, pagination));
            if let Some(codes) = val.get("error_codes").and_then(|v| v.as_array()) {
                for code in codes {
                    let c = code.get("code").and_then(|c| c.as_str()).unwrap_or("");
                    let status = code.get("http_status").and_then(|s| s.as_i64()).unwrap_or(0);
                    chunks.push(format!("[SAD_IFACE:ERROR:{}:{}]\n{}", c, status, serde_json::to_string_pretty(code).unwrap_or_default()));
                }
            }
        }
        "sad_tech_stack" => {
            chunks.push(format!("[SAD_TECH_STACK]\n{}", serde_json::to_string_pretty(&val).unwrap_or_default()));
        }
        "sad_non_tech" => {
            let categories = ["legal_constraints", "compliance_requirements", "performance_targets", "scalability_requirements", "budget_constraints"];
            for cat in categories {
                if let Some(items) = val.get(cat) {
                    let items_str = serde_json::to_string_pretty(items).unwrap_or_default();
                    if items_str.len() > 10 { chunks.push(format!("[SAD_NON_TECH:{}]\n{}", cat.to_uppercase(), items_str)); }
                }
            }
        }
        "sad_module_list" => {
            if let Some(modules) = val.get("modules").and_then(|v| v.as_array()) {
                for module in modules {
                    let mname = module.get("module_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_MODULE:{}]\n{}", mname, serde_json::to_string_pretty(module).unwrap_or_default()));
                }
            }
        }
        "sad_epic_mapping" => {
            if let Some(mappings) = val.get("mappings").and_then(|v| v.as_array()) {
                for mapping in mappings {
                    let eid = mapping.get("epic_id").and_then(|e| e.as_str()).unwrap_or("unknown");
                    let ename = mapping.get("epic_name").and_then(|n| n.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_EPIC_MAP:{}:{}]\n{}", eid, ename, serde_json::to_string_pretty(mapping).unwrap_or_default()));
                }
            }
        }
        "sad_module_deps" => {
            if let Some(deps) = val.get("dependencies").and_then(|v| v.as_array()) {
                for dep in deps {
                    let from = dep.get("from_module").and_then(|f| f.as_str()).unwrap_or("");
                    let to = dep.get("to_module").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_DEP:{}->{}]\n{}", from, to, serde_json::to_string_pretty(dep).unwrap_or_default()));
                }
            }
            if let Some(order) = val.get("recommended_build_order") {
                chunks.push(format!("[SAD_DEP:BUILD_ORDER]\n{}", serde_json::to_string_pretty(order).unwrap_or_default()));
            }
        }
        _ => {
            if let Some(obj) = val.as_object() {
                for (key, value) in obj {
                    let chunk_text = format!("[{}]\n{}", key, serde_json::to_string_pretty(value).unwrap_or_default());
                    if chunk_text.len() > 50 { chunks.push(chunk_text); }
                }
            }
        }
    }
    
    if let Ok(summary) = serde_json::to_string_pretty(&val) {
        if summary.len() > 100 {
            chunks.insert(0, format!("[FULL_DOCUMENT:{}]\n{}", node_type, summary.chars().take(2000).collect::<String>()));
        }
    }
    chunks
}

pub async fn store_document_embeddings(
    args: EmbeddingStoreArgs<'_>,
) -> Result<(), String> {
    let EmbeddingStoreArgs {
        pool, client, api_key, project_id, module_id, node_id, node_type, iteration_id, document_json, score,
    } = args;
    
    sqlx::query("DELETE FROM document_embeddings WHERE rowid IN (SELECT rowid FROM embedding_metadata WHERE node_id = ?)")
        .bind(node_id).execute(pool).await.map_err(|e| format!("Existing embeddings cleanup error: {}", e))?;

    sqlx::query("DELETE FROM embedding_metadata WHERE node_id = ?")
        .bind(node_id).execute(pool).await.map_err(|e| format!("Existing metadata cleanup error: {}", e))?;

    let chunks = chunk_json_document(document_json, node_type);
    
    for (idx, chunk) in chunks.iter().enumerate() {
        let embedding = call_gemini_embedding(client, api_key, chunk, "RETRIEVAL_DOCUMENT").await
            .map_err(|e| format!("{:?}", e))?;
        let embedding_json = serde_json::to_string(&embedding).unwrap_or_default();
        
        let now = chrono::Utc::now().to_rfc3339();
        let result = sqlx::query("INSERT INTO embedding_metadata (project_id, module_id, node_type, node_id, iteration_id, chunk_index, chunk_text, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(project_id).bind(module_id).bind(node_type).bind(node_id).bind(iteration_id).bind(idx as i32).bind(chunk).bind(score).bind(&now).execute(pool).await
            .map_err(|e| format!("Metadata insert error: {}", e))?;
        
        let rowid = result.last_insert_rowid();
        sqlx::query("INSERT INTO document_embeddings (rowid, embedding) VALUES (?, ?)")
            .bind(rowid).bind(&embedding_json).execute(pool).await.map_err(|e| format!("Embedding insert error: {}", e))?;
    }
    
    println!("[RAG] Stored {} embedding chunks for node {} ({})", chunks.len(), node_id, node_type);
    Ok(())
}
