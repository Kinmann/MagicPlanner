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

/// Canonical ID (MODULE:TYPE:ID) 형식을 해석하여 해당하는 노드 정보를 반환합니다.
pub async fn resolve_node_by_canonical_id(pool: &SqlitePool, project_id: &str, canonical_id: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = canonical_id.split(':').collect();
    if parts.is_empty() { return None; }
    
    let (module, ntype) = match parts.len() {
        1 => (None, parts[0]),
        _ => (Some(parts[0]), parts[1]),
    };
    
    let query = if let Some(m_name) = module {
        sqlx::query(
            "SELECT dn.node_id, dn.target_node_type FROM document_node dn \
             LEFT JOIN local_module lm ON dn.module_id = lm.module_id \
             WHERE dn.project_id = ? AND dn.is_deleted = 0 \
             AND (UPPER(lm.module_name) = UPPER(?) OR UPPER(dn.node_category) = UPPER(?)) \
             AND UPPER(dn.target_node_type) = UPPER(?)"
        )
        .bind(project_id)
        .bind(m_name)
        .bind(m_name)
        .bind(ntype)
    } else {
        sqlx::query(
            "SELECT dn.node_id, dn.target_node_type FROM document_node dn \
             WHERE dn.project_id = ? AND dn.is_deleted = 0 \
             AND UPPER(dn.target_node_type) = UPPER(?)"
        )
        .bind(project_id)
        .bind(ntype)
    };
    
    query.fetch_optional(pool).await.ok().flatten().map(|row| (row.get(0), row.get(1)))
}

/// Canonical ID를 사용하여 승인된 최신 결과를 가져옵니다.
pub async fn get_approved_output_by_canonical_id(pool: &SqlitePool, project_id: &str, canonical_id: &str) -> String {
    if let Some((node_id, _)) = resolve_node_by_canonical_id(pool, project_id, canonical_id).await {
        let res = sqlx::query(
            "SELECT generated_draft_json FROM generation_iteration 
             WHERE node_id = ? AND is_pass = 1 AND is_deleted = 0 
             ORDER BY created_at DESC LIMIT 1",
        )
        .bind(&node_id)
        .fetch_optional(pool)
        .await;

        match res {
            Ok(Some(row)) => row.get::<String, _>("generated_draft_json"),
            _ => "{}".to_string(),
        }
    } else {
        // Fallback: node_type으로 직접 조회 시도 (레거시 대응)
        get_approved_node_output(pool, project_id, canonical_id).await
    }
}
