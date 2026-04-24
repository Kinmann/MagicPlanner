use chrono::Utc;
use tauri::{Manager, Emitter};
use sqlx::{SqlitePool, Row};
use crate::ActiveTasks;

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================
pub use crate::models::{
    DocumentNode, GenerationIteration, ActiveNodeInfo, LocalModule,
};

// 서비스 함수 임포트
use crate::services::dag_engine::sync_module_completion_status;

// EvaluationResult is now imported from crate::schemas

// EvaluationResult is now imported from crate::schemas


#[tauri::command]
pub async fn get_project_nodes(
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
) -> Result<Vec<DocumentNode>, String> {
    // [??? ?╊겘占? 辱뷂옙占썼쳺?100%?蘊덀ゲ ?占쏙옙??? ?劑눂? 獄덂댖占???占쏙옙辱뷂옙 ?屍귩쪟?獄?縕먩른占?
    let modules = sqlx::query_as::<_, LocalModule>(
        "SELECT * FROM local_module WHERE project_id = ? AND is_deleted = 0"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    for m in modules {
        if m.module_state != "COMPLETED" {
            // 하위 노드 완료 상태를 체크하여 모듈 상태 업데이트 (emit 시점에 fetch가 늦을 수 있어 여기서 동기화)
            let _ = sync_module_completion_status(&*pool, None, &m.module_id).await;
        }
    }

    let mut nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at ASC"
    )
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // ActiveTasks 기반으로 is_active 상태 업데이트
    if let Ok(tasks) = active_tasks.0.lock() {
        let tasks: &std::collections::HashSet<String> = &*tasks;
        for node in &mut nodes {
            if tasks.contains(&node.node_id) {
                node.is_active = true;
            }
        }
    }

    Ok(nodes)
}


#[tauri::command]
pub async fn get_node_iterations(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
) -> Result<Vec<GenerationIteration>, String> {
    let iterations = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number ASC"
    )
    .bind(node_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(iterations)
}


#[tauri::command]
pub async fn get_latest_iteration(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
) -> Result<Option<GenerationIteration>, String> {
    let iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
    )
    .bind(node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(iteration)
}


#[tauri::command]
pub async fn update_node_max_iterations(
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    max_iterations: i32,
) -> Result<(), String> {
    println!(">>> Updating max_iterations to {} for node: {}", max_iterations, node_id);
    sqlx::query(
        "UPDATE document_node SET max_iterations = ?, updated_at = ? WHERE node_id = ?"
    )
    .bind(max_iterations)
    .bind(Utc::now().to_rfc3339())
    .bind(node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}


#[tauri::command]
pub async fn get_module_nodes(
    pool: tauri::State<'_, SqlitePool>,
    module_id: String,
) -> Result<Vec<DocumentNode>, String> {
    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE module_id = ? AND is_deleted = 0 ORDER BY created_at ASC"
    )
    .bind(module_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(nodes)
}


#[tauri::command]
pub async fn get_all_active_nodes(
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
) -> Result<Vec<ActiveNodeInfo>, String> {
    let mut active_nodes = sqlx::query_as::<_, ActiveNodeInfo>(
        "SELECT 
            n.node_id, 
            n.project_id, 
            p.project_name, 
            n.module_id, 
            m.module_name, 
            n.target_node_type, 
            n.node_state, 
            n.last_action 
         FROM document_node n
         JOIN project p ON n.project_id = p.project_id
         LEFT JOIN local_module m ON n.module_id = m.module_id
         WHERE (n.node_state IN ('IN_PROGRESS', 'STALE', 'REFINING') OR n.last_action LIKE '%RAG%') AND n.is_deleted = 0
         ORDER BY n.updated_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // ActiveTasks 기반으로 is_active 및 누락된 활성 노드 추가
    let extra_tasks: Vec<String> = if let Ok(tasks) = active_tasks.0.lock() {
        let tasks: &std::collections::HashSet<String> = &*tasks;
        for node in &mut active_nodes {
            if tasks.contains(&node.node_id) {
                node.is_active = true;
            }
        }
        
        let existing_ids: std::collections::HashSet<String> = active_nodes.iter().map(|n| n.node_id.clone()).collect();
        tasks.iter().filter(|id| !existing_ids.contains(*id)).cloned().collect()
    } else {
        Vec::new()
    };

    // 락을 해제한 후 추가 정보 조회를 위해 DB 쿼리
    for active_id in extra_tasks {
        let extra_node: Option<ActiveNodeInfo> = sqlx::query_as(
            "SELECT 
                n.node_id, n.project_id, p.project_name, 
                n.module_id, m.module_name, n.target_node_type, 
                n.node_state, n.last_action
             FROM document_node n
             JOIN project p ON n.project_id = p.project_id
             LEFT JOIN local_module m ON n.module_id = m.module_id
             WHERE n.node_id = ?"
        )
        .bind(&active_id)
        .fetch_optional(&*pool)
        .await
        .unwrap_or(None);

        if let Some(mut en) = extra_node {
            en.is_active = true;
            active_nodes.push(en);
        }
    }

    Ok(active_nodes)
}


/// 생성된 이터레이션을 삭제하고 관련된 점수 정보를 업데이트합니다.
#[tauri::command]
pub async fn delete_generation_iteration(
    handle: tauri::AppHandle,
    iteration_id: String,
) -> Result<(), String> {
    let pool = handle.state::<SqlitePool>();

    // 1. 삭제할 이터레이션 정보 조회 (노드 및 프로젝트 정보 포함)
    let iter_row = sqlx::query(
        "SELECT i.node_id, n.target_node_type, i.is_pass, n.project_id 
         FROM generation_iteration i 
         JOIN document_node n ON i.node_id = n.node_id 
         WHERE i.iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let node_id: String = iter_row.get(0);
    let node_type: String = iter_row.get(1);
    let project_id: String = iter_row.get(3);

    // 2. Lock Policy 墉?르占?(?占쏙옙 ?靜♥占?辱뷂옙占?辱쀰、언쬃?グ???占?蘊깍옙?)
    // - Genesis PRD: SAD 생성 이후에는 삭제 금지
    if node_type == "Genesis_PRD" || node_type.starts_with("GPRD_") {
        let sad_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM document_node WHERE project_id = ? AND target_node_type LIKE 'SAD_%' AND node_state != 'PENDING'")
            .bind(&project_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        if sad_count > 0 { return Err("SAD 파이프라인이 이미 진행 중이거나 완료되었습니다. PRD 이터레이션을 삭제할 수 없습니다.".into()); }
    }
    // - SAD_Global: SAD_Module 생성 이후에는 삭제 금지
    else if node_type == "SAD_Global" {
         let mod_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module' AND node_state != 'PENDING'")
            .bind(&project_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        if mod_count > 0 { return Err("모듈 분할 단계가 진행 중이거나 완료되었습니다. SAD Global 이터레이션을 삭제할 수 없습니다.".into()); }
    }
    // - SAD_Module: 하위 모듈 문서 생성 이후에는 삭제 금지
    else if node_type == "SAD_Module" {
         let sub_mod_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM document_node WHERE project_id = ? AND target_node_type NOT LIKE 'SAD_%' AND target_node_type NOT LIKE 'GPRD_%' AND target_node_type != 'Genesis_PRD' AND node_state != 'PENDING'")
            .bind(&project_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        if sub_mod_count > 0 { return Err("하위 모듈의 개별 문서들이 이미 생성되었습니다. 모듈 목록 이터레이션을 삭제할 수 없습니다.".into()); }
    }

    // 3. 소프트 삭제(is_deleted = 1) 처리
    sqlx::query("UPDATE generation_iteration SET is_deleted = 1, updated_at = ? WHERE iteration_id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&iteration_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // 4. ?蘊덌옙 ?占쏙옙 獄?容뽴?곤옙 ??낂쇃 ?占썬ゲ?歷ｄ궩
    let remaining_iters: Vec<(String, i32)> = sqlx::query_as::<_, (String, i32)>(
        "SELECT iteration_id, calculated_score FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY iteration_number DESC"
    )
    .bind(&node_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if remaining_iters.is_empty() {
        // 남은 이터레이션이 없으면 READY 상태로 되돌림
        sqlx::query("UPDATE document_node SET node_state = 'READY', current_iteration = 0, current_best_score = 0, updated_at = ? WHERE node_id = ?")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        // ??? 囹?辱?容뽴쮤덌옙??獄?令덍?곤옙 ?占썬ゲ?歷ｄ궩
        let best_score = remaining_iters.iter().map(|(_, s)| *s).max().unwrap_or(0);
        let count = remaining_iters.len() as i32;
        sqlx::query("UPDATE document_node SET current_iteration = ?, current_best_score = ?, updated_at = ? WHERE node_id = ?")
            .bind(count)
            .bind(best_score)
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    let _ = handle.emit("nodes-updated", ());
    Ok(())
}

// ============================================================
// RAG Utilities (Phase 1)
// ============================================================

