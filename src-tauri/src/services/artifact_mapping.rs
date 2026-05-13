use chrono::Utc;
use sqlx::SqlitePool;
use regex::Regex;

pub use crate::models::{
    Project, DocumentNode, GenerationIteration,
    GlobalContext, PipelineStatusPayload,
};


pub async fn migrate_canonical_ids_command_logic(
    project_id: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    println!(">>> [Migration] Starting Canonical ID Migration for project: {}", project_id);
    
    // 1. 모든 노드와 통과된 초안 로드
    let all_iterations: Vec<(String, String, Option<String>, String)> = sqlx::query_as(
        "SELECT gi.iteration_id, gi.generated_draft_json, dn.module_id, dn.target_node_type \
         FROM generation_iteration gi \
         JOIN document_node dn ON gi.node_id = dn.node_id \
         WHERE dn.project_id = ? AND gi.is_pass = 1"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut update_count = 0;
    for (iter_id, original_json, module_id, _node_type) in all_iterations {
        let mid = module_id.as_deref().unwrap_or("global");
        
        // Regex search and replace IDs
        // Rules:
        // FUNC- -> module:FSD:FUNC-
        // REQ-  -> module:PRD:REQ-
        // EPIC- -> module:PRD:EPIC-
        // FLOW- -> module:USERFLOW:FLOW-
        // SCR-  -> module:IA:SCR-
        // TBL-  -> module:ERD:TBL-
        // API-  -> module:API:API-
        // TC-   -> module:TC:TC-
        
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
            let canonical_prefix = format!("{}:{}:", mid.to_uppercase(), target_type.to_uppercase());
            
            let temp_json = updated_json.clone();
            updated_json = re.replace_all(&temp_json, |caps: &regex::Captures| {
                let matched = caps.get(0).unwrap();
                let start = matched.start();
                // Already prefixed check
                if start > 0 && temp_json.as_bytes()[start-1] == b':' {
                    matched.as_str().to_uppercase()
                } else {
                    format!("{}{}", canonical_prefix, matched.as_str().to_uppercase())
                }
            }).to_string();
            
            if temp_json != updated_json {
                changed = true;
            }
        }

        if changed {
            sqlx::query("UPDATE generation_iteration SET generated_draft_json = ?, updated_at = ? WHERE iteration_id = ?")
                .bind(&updated_json)
                .bind(chrono::Utc::now().to_rfc3339())
                .bind(&iter_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            update_count += 1;
        }
    }

    Ok(format!("Successfully migrated {} iterations to canonical IDs.", update_count))
}

pub async fn migrate_artifact_mappings_logic(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    println!(">>> [Migration] Starting Artifact Mapping Migration for all projects");
    
    // 1. 모든 프로젝트의 모든 승인된 노드 및 최신 이터레이션 로드
    let all_approved_nodes: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT dn.project_id, dn.node_id, gi.generated_draft_json \
         FROM document_node dn \
         JOIN generation_iteration gi ON gi.node_id = dn.node_id \
         WHERE gi.is_pass = 1 AND dn.is_deleted = 0"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut total_synced = 0;
    for (project_id, node_id, json_str) in all_approved_nodes {
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&json_str) {
            match sync_artifact_mappings(&pool, &project_id, &node_id, &json_value).await {
                Ok(_) => total_synced += 1,
                Err(e) => println!(">>> [Migration] Failed to sync node {}: {}", node_id, e),
            }
        }
    }

    Ok(format!("Successfully synced {} nodes to artifact_mapping table.", total_synced))
}

pub async fn sync_artifact_mappings(
    pool: &sqlx::SqlitePool,
    project_id: &str,
    node_id: &str,
    json_value: &serde_json::Value,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sync_artifact_mappings_in_tx(&mut tx, project_id, node_id, json_value).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn sync_artifact_mappings_in_tx(
    tx: &mut sqlx::SqliteConnection,
    project_id: &str,
    node_id: &str,
    json_value: &serde_json::Value,
) -> Result<(), String> {
    // 1. 기존 매핑 삭제
    sqlx::query("DELETE FROM artifact_mapping WHERE node_id = ?")
        .bind(node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. 새로운 매핑 추출
    let mappings = extract_mapped_ids_with_path(json_value, "");
    let now = Utc::now().to_rfc3339();

    // 3. 삽입
    for (artifact_id, json_path) in mappings {
        let mapping_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO artifact_mapping (mapping_id, project_id, node_id, artifact_id, json_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&mapping_id)
        .bind(project_id)
        .bind(node_id)
        .bind(&artifact_id)
        .bind(&json_path)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn extract_mapped_ids_with_path(value: &serde_json::Value, current_path: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();
    
    // 패턴: 계층적 구조(module:type:id) 또는 단순 ID(ID-001)
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)\b(?:[A-Z0-9_]+:[A-Z0-9_]+:)?[A-Z]{2,}-\w+\b").unwrap());

    if let Some(obj) = value.as_object() {
        for (k, v) in obj {
            let next_path = if current_path.is_empty() {
                format!("/{}", k)
            } else {
                format!("{}/{}", current_path, k)
            };

            // 1. 'mapped_' 접두어 체크
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
            
            // 2. 값 자체의 패턴 체크 (유연한 추출)
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

pub fn extract_mapped_ids(value: &serde_json::Value) -> Vec<String> {
    let mappings = extract_mapped_ids_with_path(value, "");
    let ids: Vec<String> = mappings.into_iter().map(|(id, _)| id).collect();
    
    // 중복 제거
    let set: std::collections::HashSet<_> = ids.into_iter().collect();
    set.into_iter().collect()
}

pub async fn find_definition_node_by_block_id(
    pool: &sqlx::SqlitePool,
    project_id: &str,
    block_id: &str,
    current_node_id: &str,
) -> Result<Option<String>, String> {
    // 1. 해당 block_id를 포함하는 모든 노드 조회 (현재 노드 제외)
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT am.node_id, dn.target_node_type FROM artifact_mapping am \
         JOIN document_node dn ON am.node_id = dn.node_id \
         WHERE am.artifact_id = ? AND am.project_id = ? AND am.node_id != ? AND dn.is_deleted = 0"
    )
    .bind(block_id)
    .bind(project_id)
    .bind(current_node_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if rows.is_empty() { return Ok(None); }

    // 2. 상위 계층 노드(GPRD, SAD 등) 우선 순위 부여
    // GENESIS(GPRD) > SAD > 기타 순으로 정렬하여 가장 상위 노드를 반환
    let mut sorted_rows = rows.clone();
    sorted_rows.sort_by(|a, b| {
        let score = |node_type: &str| {
            if node_type.contains("GPRD") || node_type.contains("GENESIS") { 0 }
            else if node_type.contains("SAD") { 1 }
            else if node_type.contains("PRD") { 2 }
            else if node_type.contains("FSD") { 3 }
            else { 4 }
        };
        score(&a.1).cmp(&score(&b.1))
    });

    Ok(Some(sorted_rows[0].0.clone()))
}

