use sqlx::{SqlitePool, Row};

/// 특정 노드의 승인된(is_pass=1) 최신 반복 결과 JSON을 반환합니다.
pub async fn get_approved_node_output(pool: &SqlitePool, project_id: &str, node_type: &str) -> String {
    let res = sqlx::query(
        "SELECT generated_draft_json FROM generation_iteration 
         WHERE node_id = (SELECT node_id FROM document_node WHERE project_id = ? AND target_node_type = ?) 
         AND is_pass = 1 AND is_deleted = 0 
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(node_type)
    .fetch_optional(pool)
    .await;

    match res {
        Ok(Some(row)) => row.get::<String, _>("generated_draft_json"),
        _ => "{}".to_string(),
    }
}

/// 특정 모듈 내에서 승인된(is_pass=1) 특정 노드 타입의 결과물을 가져옵니다.
pub async fn get_approved_module_node_output(pool: &SqlitePool, module_id: &str, node_type: &str) -> String {
    let res = sqlx::query(
        "SELECT generated_draft_json FROM generation_iteration 
         WHERE node_id = (SELECT node_id FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0) 
         AND is_pass = 1 AND is_deleted = 0 
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(module_id)
    .bind(node_type)
    .fetch_optional(pool)
    .await;

    match res {
        Ok(Some(row)) => row.get::<String, _>("generated_draft_json"),
        _ => "{}".to_string(),
    }
}
