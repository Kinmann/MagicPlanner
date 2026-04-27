use chrono::Utc;
use tauri::{Manager, Emitter};
use sqlx::{SqlitePool, Row};
use uuid::Uuid;
use crate::ActiveTasks;

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================
pub use crate::models::{
    DocumentNode, GenerationIteration, ActiveNodeInfo, LocalModule,
};

// 서비스 함수 임포트
use crate::services::dag_engine::{sync_module_completion_status, is_node_locked};


#[tauri::command]
pub async fn get_project_nodes(
    pool: tauri::State<'_, SqlitePool>,
    active_tasks: tauri::State<'_, ActiveTasks>,
    project_id: String,
) -> Result<Vec<DocumentNode>, String> {
    // [??€? ?╊겘占? 辱뷂옙占썼쳺?100%?蘊덀ゲ ?占쏙옙??? ?劑눂? 獄덂댖占???占쏙옙辱뷂옙 ?屍귩쪟?獄?縕먩른占?
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
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // SAD 단계인데 노드가 누락된 경우 자동 보정 (레거시 대응)
    let project_phase = sqlx::query("SELECT pipeline_phase FROM project WHERE project_id = ?")
        .bind(&project_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?
        .get::<String, _>(0);

    if project_phase == "SAD" {
        let global_types = vec![
            "SAD_Non_Tech", "SAD_Tech_Stack", "SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error"
        ];
        let mut needed_fix = false;
        let now = Utc::now().to_rfc3339();

        for t_type in global_types {
            if !nodes.iter().any(|n| n.target_node_type == t_type) {
                needed_fix = true;
                let state = if t_type == "SAD_Non_Tech" { "READY" } else { "PENDING" };
                sqlx::query(
                    "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, ?, 'SAD', ?, 0, 10, 80, 0, ?, ?, 0)"
                )
                .bind(Uuid::new_v4().to_string())
                .bind(&project_id)
                .bind(t_type)
                .bind(state)
                .bind(&now)
                .bind(&now)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            }
        }

        if needed_fix {
            // 다시 조회
            nodes = sqlx::query_as::<_, DocumentNode>(
                "SELECT * FROM document_node WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at ASC"
            )
            .bind(&project_id)
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // 1. is_active 상태 업데이트 (락을 짧게 유지)
    {
        if let Ok(tasks) = active_tasks.0.lock() {
            let tasks: &std::collections::HashSet<String> = &*tasks;
            for node in &mut nodes {
                if tasks.contains(&node.node_id) {
                    node.is_active = true;
                }
            }
        }
    }

    // 2. 잠금 상태 계산 (await가 포함되므로 락 외부에서 수행)
    for node in &mut nodes {
        node.is_locked = is_node_locked(&*pool, node).await?;
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
pub async fn get_iteration_by_id(
    pool: tauri::State<'_, SqlitePool>,
    iteration_id: String,
) -> Result<Option<GenerationIteration>, String> {
    let iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE iteration_id = ? AND is_deleted = 0"
    )
    .bind(iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(iteration)
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
    let mut nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE module_id = ? AND is_deleted = 0 ORDER BY created_at ASC"
    )
    .bind(module_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    for node in &mut nodes {
        node.is_locked = is_node_locked(&*pool, node).await?;
    }

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
    let _node_type: String = iter_row.get(1);
    let _project_id: String = iter_row.get(3);

    // 2. Lock Policy 확인 (하위 노드에 결과물이 있으면 삭제 불가)
    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE node_id = ?")
        .bind(&node_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if is_node_locked(&*pool, &node).await? {
        return Err("하위 파이프라인에 이미 결과물이 생성되어 있어 이터레이션을 삭제할 수 없습니다.".into());
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

