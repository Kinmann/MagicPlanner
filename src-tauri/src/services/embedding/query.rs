use reqwest::Client;
use sqlx::{SqlitePool, Row};
use crate::services::embedding::{call_gemini_embedding, extract_artifact_ids};

pub async fn get_rag_context(
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    query_text: &str,
    limit: i32,
    exclude_node_ids: Vec<String>,
) -> Result<String, String> {
    let query_vector = call_gemini_embedding(client, api_key, query_text, "RETRIEVAL_QUERY").await
        .map_err(|e| format!("Query embedding error: {}", e))?;
    let query_json = serde_json::to_string(&query_vector).unwrap_or_default();

    let mut query_builder = sqlx::QueryBuilder::new(
        "SELECT m.chunk_text, m.node_type, v.distance, lm.module_name, dn.node_category, dn.node_id 
         FROM document_embeddings v
         JOIN embedding_metadata m ON v.rowid = m.rowid
         JOIN document_node dn ON m.node_id = dn.node_id
         LEFT JOIN local_module lm ON dn.module_id = lm.module_id
         WHERE v.embedding MATCH "
    );
    query_builder.push_bind(&query_json);
    query_builder.push(" AND k = ");
    query_builder.push_bind(limit);
    query_builder.push(" AND m.project_id = ");
    query_builder.push_bind(project_id);

    if !exclude_node_ids.is_empty() {
        query_builder.push(" AND m.node_id NOT IN (");
        let mut separated = query_builder.separated(", ");
        for id in exclude_node_ids { separated.push_bind(id); }
        query_builder.push(")");
    }

    query_builder.push(" ORDER BY v.distance ASC");

    let rows = query_builder.build().fetch_all(pool).await.map_err(|e| format!("RAG search error: {}", e))?;
    if rows.is_empty() { return Ok("".to_string()); }

    let mut context = String::from("\n[REFERENCE_DOCUMENTS]\n(The following are relevant snippets retrieved from existing documentation. Use the Module and Type to construct Canonical IDs. Example: MODULE:TYPE:$.path.to.element)\n");
    for (i, row) in rows.iter().enumerate() {
        let text: String = row.get(0);
        let ntype: String = row.get(1);
        let dist: f64 = row.get(2);
        let mname: Option<String> = row.get(3);
        let cat: String = row.get(4);
        let module_prefix = mname.unwrap_or_else(|| cat.to_uppercase());
        context.push_str(&format!("\n-- REFERENCE {} (Address: {}:{}, NodeID: {}, Relevance: {:.2}%) --\n{}\n", 
            i + 1, module_prefix, ntype, row.get::<String, _>(5), (1.0 - dist) * 100.0, text));
    }
    Ok(context)
}

pub async fn check_node_intersection(
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    node_id: &str,
    query_text: &str,
) -> Result<f64, String> {
    let query_vector = call_gemini_embedding(client, api_key, query_text, "RETRIEVAL_QUERY").await
        .map_err(|e| format!("Intersection query embedding error: {:?}", e))?;
    check_node_intersection_with_vector(pool, project_id, node_id, query_text, &query_vector).await
}

pub async fn check_node_intersection_with_vector(
    pool: &SqlitePool,
    project_id: &str,
    node_id: &str,
    query_text: &str,
    query_vector: &[f32],
) -> Result<f64, String> {
    let query_codes = extract_artifact_ids(query_text);
    let node_data: Option<String> = sqlx::query_scalar(
        "SELECT gi.generated_draft_json FROM generation_iteration gi JOIN document_node dn ON dn.node_id = gi.node_id WHERE dn.node_id = ? AND dn.project_id = ? AND gi.is_pass = 1 LIMIT 1"
    ).bind(node_id).bind(project_id).fetch_optional(pool).await.map_err(|e| e.to_string())?;

    if let Some(json_str) = node_data {
        let node_codes = extract_artifact_ids(&json_str);
        let intersection: Vec<_> = query_codes.intersection(&node_codes).collect();
        if !intersection.is_empty() { return Ok(1.0); }
    }

    let query_json = serde_json::to_string(&query_vector).unwrap_or_default();
    let embedding_row = sqlx::query("SELECT v.distance FROM document_embeddings v JOIN embedding_metadata m ON v.rowid = m.rowid WHERE m.node_id = ? AND m.project_id = ? AND v.embedding MATCH ? AND k = 1 ORDER BY v.distance ASC LIMIT 1")
        .bind(node_id).bind(project_id).bind(&query_json).fetch_optional(pool).await.map_err(|e| format!("Intersection search error: {}", e))?;

    let embedding_similarity = if let Some(r) = embedding_row {
        let dist: f64 = r.get(0);
        1.0 - dist
    } else {
        0.0
    };
    Ok(embedding_similarity)
}
