use sqlx::SqlitePool;
use chrono::Utc;
use tauri::Emitter;
use crate::models::{DocumentNode, GenerationIteration};
use crate::services::dag_engine::refresh_global_context;

pub async fn cancel_refinement_update_logic(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
) -> Result<(), String> {
    println!(">>> Cancelling Refinement Update (Rollback) for project: {}", project_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. 리파인먼트 관련 상태의 노드들 조회
    // REVIEWED: 확정됨, STALE: 오염됨, REFINING: 수정 중, REVIEW_PENDING: 검토 대기, PAUSED_HITL: 수동 개입 대기
    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND node_state IN ('REVIEWED', 'STALE', 'REFINING', 'REVIEW_PENDING', 'PAUSED_HITL', 'READY')"
    )
    .bind(project_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for node in nodes {
        // 2. 현재 확정된(is_pass=1) 이터레이션이 있다면 무효화 및 아카이브
        let current_pass_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 AND is_deleted = 0"
        )
        .bind(&node.node_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(it) = current_pass_iter {
            // 현재 리파인먼트에서 생성된 것인지 확인 (단순하게 최신 이터레이션이면 취소 대상으로 간주)
            // 더 정밀하게 하려면 리파인먼트 시작 시점의 iteration_number를 저장해야 하나, 
            // 여기서는 '취소' 시점에 활성화된 모든 패치본을 무효화하는 것으로 처리.
            sqlx::query("UPDATE generation_iteration SET is_pass = 0, is_archived = 1, updated_at = ? WHERE iteration_id = ?")
                .bind(&now)
                .bind(&it.iteration_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }

        // 3. 이전 확정본 복구 (가장 최근에 pass가 아니었던 것 중 번호가 가장 높은 것)
        // 실제로는 리파인먼트 전의 is_pass=1을 찾아야 함.
        // 여기서는 현재 pass가 아닌 것 중 번호가 가장 높은 것을 복구 후보로 선정.
        let prev_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 0 AND is_deleted = 0 ORDER BY iteration_number DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(it) = prev_iter {
            sqlx::query("UPDATE generation_iteration SET is_pass = 1, is_archived = 0, updated_at = ? WHERE iteration_id = ?")
                .bind(&now)
                .bind(&it.iteration_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }

        // 4. 노드 상태를 COMPLETED로 복구
        sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', last_action = 'Refinement Cancelled', updated_at = ? WHERE node_id = ?")
            .bind(&now)
            .bind(&node.node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 5. 프로젝트 인텐트 초기화
    sqlx::query("UPDATE project SET increment_intent = NULL, updated_at = ? WHERE project_id = ?")
        .bind(&now)
        .bind(project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    // 6. 전역 컨텍스트 동기화 (복구된 데이터 기준)
    let _ = refresh_global_context(pool, project_id).await;

    let _ = app_handle.emit("nodes-updated", ());
    println!(">>> Refinement Update Cancelled and Rolled back for project: {}", project_id);

    Ok(())
}
