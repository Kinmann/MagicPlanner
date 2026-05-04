use crate::models::comment::NodeComment;
use uuid::Uuid;
use chrono::Local;

#[tauri::command]
pub async fn get_node_comments(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    node_id: String
) -> Result<Vec<NodeComment>, String> {
    sqlx::query_as::<_, NodeComment>(
        "SELECT * FROM node_comment WHERE node_id = ? AND is_deleted = 0 ORDER BY created_at ASC"
    )
    .bind(node_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_comment(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    project_id: String,
    node_id: String,
    iteration_id: String,
    json_path: String,
    comment_text: String
) -> Result<NodeComment, String> {
    // 0. iteration_id 유효성 검사
    if iteration_id.is_empty() {
        return Err("Missing Iteration ID: 코멘트를 작성할 이터레이션 정보가 없습니다.".to_string());
    }

    // 1. 해당 iteration이 확정 상태인지 확인 (숫자 1, 문자열 'true', 불리언 true 모두 허용)
    let it_status: i32 = sqlx::query_scalar(
        "SELECT CASE 
            WHEN is_pass = 1 OR is_pass = 'true' OR is_pass = '1' THEN 1 
            ELSE 0 
         END FROM generation_iteration WHERE iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("DB error: {}", e))?
    .unwrap_or(0);

    if it_status != 1 {
        return Err("Confirmed".to_string());
    }

    // 2. 코멘트 생성
    let comment_id = Uuid::new_v4().to_string();
    let now = Local::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO node_comment (
            comment_id, project_id, node_id, iteration_id, json_path, comment_text, author, is_resolved, created_at, updated_at, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
    )
    .bind(&comment_id)
    .bind(&project_id)
    .bind(&node_id)
    .bind(&iteration_id)
    .bind(&json_path)
    .bind(&comment_text)
    .bind("User")
    .bind(false)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. 생성된 객체 반환
    sqlx::query_as::<_, NodeComment>("SELECT * FROM node_comment WHERE comment_id = ?")
        .bind(&comment_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_comment(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    comment_id: String,
    comment_text: String,
    is_resolved: bool
) -> Result<NodeComment, String> {
    let now = Local::now().to_rfc3339();

    sqlx::query(
        "UPDATE node_comment SET comment_text = ?, is_resolved = ?, updated_at = ? WHERE comment_id = ?"
    )
    .bind(comment_text)
    .bind(is_resolved)
    .bind(&now)
    .bind(&comment_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, NodeComment>("SELECT * FROM node_comment WHERE comment_id = ?")
        .bind(comment_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_comment(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    comment_id: String
) -> Result<(), String> {
    // 하드 삭제 (사용자 요청: 확정 취소 시 하드 삭제이므로, 명시적 삭제도 하드로 처리하거나 소프트로 처리 가능하나 여기선 소프트로 일단 구현)
    // 하지만 "확정 취소 시 하드 삭제"가 핵심이므로 일반 삭제는 소프트로 유지하되, 확정 취소 시에는 하드로 명시하겠음.
    sqlx::query("UPDATE node_comment SET is_deleted = 1 WHERE comment_id = ?")
        .bind(comment_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct EnrichedComment {
    pub comment_id: String,
    pub node_id: String,
    pub json_path: String,
    pub comment_text: String,
    pub node_type: String,
    pub node_category: String,
    pub module_name: Option<String>,
    pub created_at: String,
    pub original_content: Option<String>,
}

#[tauri::command]
pub async fn get_project_comments(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    project_id: String
) -> Result<Vec<EnrichedComment>, String> {
    sqlx::query_as::<_, EnrichedComment>(
        "SELECT 
            c.comment_id, 
            c.node_id, 
            c.json_path, 
            c.comment_text, 
            n.target_node_type as node_type,
            n.node_category,
            m.module_name,
            c.created_at,
            json_extract(gi.generated_draft_json, c.json_path) as original_content
         FROM node_comment c
         JOIN document_node n ON c.node_id = n.node_id
         JOIN generation_iteration gi ON c.iteration_id = gi.iteration_id
         LEFT JOIN local_module m ON n.module_id = m.module_id
         WHERE c.project_id = ? AND c.is_deleted = 0
         ORDER BY c.created_at DESC"
    )
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn migrate_comment_paths(
    pool: tauri::State<'_, sqlx::SqlitePool>
) -> Result<String, String> {
    let result = sqlx::query(
        "UPDATE node_comment 
         SET json_path = '$' || SUBSTR(json_path, INSTR(json_path, '$') + 1) 
         WHERE json_path LIKE '%$%' AND json_path NOT LIKE '$%'"
    )
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(format!("Successfully migrated {} rows to new path format.", result.rows_affected()))
}
