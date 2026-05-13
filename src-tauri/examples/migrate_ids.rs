use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool};
use std::time::Duration;
use regex::Regex;
use chrono::Utc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Determine DB path - relative to the running environment or fixed for this specific user
    let db_path = if cfg!(windows) {
        let app_data = std::env::var("APPDATA").unwrap_or_default();
        format!("{}\\com.gamedex02.magicplanner\\magic_planner.db", app_data)
    } else {
        "/tmp/magic_planner.db".to_string() // Placeholder for non-windows
    };

    println!(">>> [Migration] Using database: {}", db_path);

    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePool::connect_with(options).await?;

    // 1. Get all projects
    let projects: Vec<String> = sqlx::query_scalar("SELECT project_id FROM project WHERE is_deleted = 0")
        .fetch_all(&pool)
        .await?;

    for project_id in &projects {
        println!(">>> [Migration] Starting Canonical ID Migration for project: {}", project_id);
        
        // 2. Load all iterations with pass state
        let all_iterations: Vec<(String, String, Option<String>, String)> = sqlx::query_as(
            "SELECT gi.iteration_id, gi.generated_draft_json, dn.module_id, dn.target_node_type \
             FROM generation_iteration gi \
             JOIN document_node dn ON gi.node_id = dn.node_id \
             WHERE dn.project_id = ? AND gi.is_pass = 1"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await?;

        let mut update_count = 0;
        for (iter_id, original_json, module_id, _node_type) in all_iterations {
            let mid = module_id.as_deref().unwrap_or("GLOBAL").to_uppercase();
            
            let mut updated_json = original_json.clone();
            let patterns = [
                ("FUNC-\\d+", "FSD"),
                ("REQ-\\d+", "PRD"),
                ("EPIC-\\d+", "PRD"),
                ("FLOW-\\d+", "USERFLOW"),
                ("SCR-\\d+", "IA"),
                ("TBL-\\d+", "ERD"),
                ("API-\\d+", "API"),
                ("TC-\\d+", "TC"),
            ];

            let mut changed = false;
            for (pattern, target_type) in patterns {
                let re = Regex::new(&format!(r"\b{}\b", pattern)).unwrap();
                let new_prefix = format!("{}:{}:", mid, target_type.to_uppercase());
                
                let temp_json = updated_json.clone();
                updated_json = re.replace_all(&temp_json, |caps: &regex::Captures| {
                    let matched = caps.get(0).unwrap();
                    let start = matched.start();
                    if start > 0 && temp_json.as_bytes()[start-1] == b':' {
                        matched.as_str().to_uppercase()
                    } else {
                        format!("{}{}", new_prefix, matched.as_str().to_uppercase())
                    }
                }).to_string();
                
                if temp_json != updated_json {
                    changed = true;
                }
            }

            if changed {
                sqlx::query("UPDATE generation_iteration SET generated_draft_json = ?, updated_at = ? WHERE iteration_id = ?")
                    .bind(&updated_json)
                    .bind(Utc::now().to_rfc3339())
                    .bind(&iter_id)
                    .execute(&pool)
                    .await?;
                update_count += 1;
            }
        }
        println!(">>> [Migration] Completed for project {}. Updated {} iterations.", project_id, update_count);
    }

    println!(">>> [Migration] ALL DONE!");
    Ok(())
}
