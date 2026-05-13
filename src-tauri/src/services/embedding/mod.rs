use std::collections::HashSet;
use regex::Regex;
use reqwest::Client;
use sqlx::SqlitePool;

pub use crate::services::gemini::call_gemini_embedding;

pub struct EmbeddingStoreArgs<'a> {
    pub pool: &'a SqlitePool,
    pub client: &'a Client,
    pub api_key: &'a str,
    pub project_id: &'a str,
    pub module_id: Option<&'a str>,
    pub node_id: &'a str,
    pub node_type: &'a str,
    pub iteration_id: &'a str,
    pub document_json: &'a str,
    pub score: i32,
}

pub fn extract_artifact_ids(json_str: &str) -> HashSet<String> {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)\b(?:[A-Z0-9_]+:[A-Z0-9_]+:)?[A-Z]{2,}-\w+\b").unwrap());
    re.find_iter(json_str)
        .map(|m| m.as_str().to_uppercase())
        .collect()
}

pub fn extract_artifact_ids_from_value(val: &serde_json::Value) -> HashSet<String> {
    let mut ids = HashSet::new();
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)\b(?:[A-Z0-9_]+:[A-Z0-9_]+:)?[A-Z]{2,}-\w+\b").unwrap());

    match val {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                if k == "id" || k == "screen_id" || k == "table_id" || k == "module_id" || k == "api_id" || 
                   k == "artifact_id" || k == "func_id" || k == "role_id" || k == "table_name" || k == "entity_name" ||
                   k == "rel_id" || k == "edge_id" || k == "error_id" || k == "dep_id" || k == "metric_id" ||
                   k == "constraint_id" || k == "policy_id" || k == "rationale_id" || k == "tech_id" ||
                   k.starts_with("mapped_") {
                    if let Some(s) = v.as_str() { ids.insert(s.to_uppercase()); }
                }
                if let Some(s) = v.as_str() {
                    if re.is_match(s) { ids.insert(s.to_uppercase()); }
                }
                ids.extend(extract_artifact_ids_from_value(v));
            }
        },
        serde_json::Value::Array(arr) => {
            for v in arr {
                if let Some(s) = v.as_str() {
                    if re.is_match(s) { ids.insert(s.to_uppercase()); }
                }
                ids.extend(extract_artifact_ids_from_value(v));
            }
        },
        _ => {}
    }
    ids
}

pub fn extract_canonical_ids(json_str: &str, module_id: &str, node_type: &str) -> HashSet<String> {
    let raw_ids = extract_artifact_ids(json_str);
    let mid_up = module_id.to_uppercase();
    let type_up = node_type.to_uppercase();

    raw_ids.into_iter().map(|id| {
        if id.contains(':') {
            id.to_uppercase()
        } else {
            format!("{}:{}:{}", mid_up, type_up, id.to_uppercase())
        }
    }).collect()
}

pub mod storage;
pub mod query;

pub use storage::*;
pub use query::*;
