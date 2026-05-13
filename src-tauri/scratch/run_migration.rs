
use sqlx::{SqlitePool, Row};
use std::collections::HashSet;
use regex::Regex;
use serde_json::Value;

// Mocks for the logic in refinement.rs
fn extract_mapped_ids_with_path(value: &Value, current_path: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    // FIXED REGEX (no space)
    let re = RE.get_or_init(|| Regex::new(r"(?i)\b(?:[A-Z0-9_]+:[A-Z0-9_]+:)?[A-Z]{2,}-\w+\b").unwrap());

    if let Some(obj) = value.as_object() {
        for (k, v) in obj {
            let next_path = if current_path.is_empty() {
                format!("/{}", k)
            } else {
                format!("{}/{}", current_path, k)
            };

            if k.starts_with("mapped_") {
                if let Some(s) = v.as_str() {
                    results.push((s.to_uppercase(), current_path.to_string()));
                } else if let Some(arr) = v.as_array() {
                    for item in arr {
                        if let Some(s) = item.as_str() {
                            results.push((s.to_uppercase(), current_path.to_string()));
                        }
                    }
                }
            }
            
            if let Some(s) = v.as_str() {
                if re.is_match(s) {
                    results.push((s.to_uppercase(), current_path.to_string()));
                }
            }

            results.extend(extract_mapped_ids_with_path(v, &next_path));
        }
    } else if let Some(arr) = value.as_array() {
        for (i, v) in arr.iter().enumerate() {
            let next_path = format!("{}/{}", current_path, i);
            if let Some(s) = v.as_str() {
                if re.is_match(s) {
                    results.push((s.to_uppercase(), current_path.to_string()));
                }
            }
            results.extend(extract_mapped_ids_with_path(v, &next_path));
        }
    }
    results
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = SqlitePool::connect("sqlite:src-tauri/storage.db").await?;
    
    let all_approved_nodes: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT dn.project_id, dn.node_id, gi.generated_draft_json \
         FROM document_node dn \
         JOIN generation_iteration gi ON gi.node_id = dn.node_id \
         WHERE gi.is_pass = 1 AND dn.is_deleted = 0"
    ).fetch_all(&pool).await?;

    println!("Starting migration for {} nodes...", all_approved_nodes.len());

    for (project_id, node_id, json_str) in all_approved_nodes {
        if let Ok(json_value) = serde_json::from_str::<Value>(&json_str) {
            let mappings = extract_mapped_ids_with_path(&json_value, "");
            
            let mut tx = pool.begin().await?;
            sqlx::query("DELETE FROM artifact_mapping WHERE node_id = ?")
                .bind(&node_id)
                .execute(&mut *tx)
                .await?;

            for (artifact_id, json_path) in mappings {
                let mapping_id = uuid::Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO artifact_mapping (mapping_id, project_id, node_id, artifact_id, json_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
                )
                .bind(&mapping_id).bind(&project_id).bind(&node_id).bind(&artifact_id).bind(&json_path).bind(chrono::Utc::now().to_rfc3339())
                .execute(&mut *tx).await?;
            }
            tx.commit().await?;
        }
    }

    println!("Migration complete.");
    Ok(())
}
