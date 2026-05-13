use uuid::Uuid;
use chrono::Utc;
use tauri::Emitter;
use sqlx::SqlitePool;

pub async fn create_local_modules_logic(
    pool: &SqlitePool,
    project_id: &str,
    modules_json: &str,
    app_handle: &tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let now = Utc::now().to_rfc3339();
    let modules: Vec<serde_json::Value> = serde_json::from_str(modules_json)
        .map_err(|e| format!("모듈 데이터 JSON 파싱 오류: {}", e))?;

    if modules.len() > 10 {
        return Err("모듈 개수 제한(10개)을 초과했습니다.".to_string());
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 기존 모듈 데이터 및 노드 완전 삭제
    let target_node_ids: Vec<String> = sqlx::query_scalar(
        "SELECT node_id FROM document_node WHERE project_id = ? AND (node_category = 'MODULE' OR module_id IS NOT NULL OR node_id LIKE 'mock-%')"
    )
    .bind(project_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;

    if !target_node_ids.is_empty() {
        sqlx::query("DELETE FROM generation_iteration WHERE node_id IN (SELECT node_id FROM document_node WHERE project_id = ? AND (node_category = 'MODULE' OR module_id IS NOT NULL OR node_id LIKE 'mock-%'))")
            .bind(project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM document_node WHERE project_id = ? AND (node_category = 'MODULE' OR module_id IS NOT NULL OR node_id LIKE 'mock-%')")
            .bind(project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    sqlx::query("DELETE FROM local_module WHERE project_id = ?").bind(project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE project SET pipeline_phase = 'MODULE_GENERATION', updated_at = ? WHERE project_id = ?")
        .bind(&now).bind(project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let mut module_ids = Vec::new();
    let node_blueprints = vec![
        ("PRD", "READY"), ("FSD", "PENDING"), ("ERD", "PENDING"), ("API_Spec", "PENDING"),
        ("User Flow", "PENDING"), ("IA", "PENDING"), ("Wireframe", "PENDING"), ("TC", "PENDING"),
    ];

    for (idx, module) in modules.iter().enumerate() {
        let module_id = module["module_id"].as_str().map(|s| s.to_string()).unwrap_or_else(|| Uuid::new_v4().to_string());
        let m_name = module["name"].as_str().or(module["module_name"].as_str()).unwrap_or("Unnamed Module");
        let m_desc = module["description"].as_str().unwrap_or("");
        let m_resp = module["responsibility"].as_str().or(module["core_responsibility"].as_str()).unwrap_or("");
        let m_epics = module["mapped_epics"].as_str().unwrap_or(""); 
        let m_deps = module["dependency_spec"].as_str().unwrap_or("[]");
        let priority = module["priority_order"].as_i64().unwrap_or(idx as i64) as i32;

        sqlx::query("INSERT INTO local_module (module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, dependency_spec, priority_order, module_state, display_order, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, 0)")
            .bind(&module_id).bind(project_id).bind(m_name).bind(m_desc).bind(m_resp).bind(m_epics).bind(m_deps)
            .bind(priority).bind(idx as i32).bind(&now).bind(&now).execute(&mut *tx).await.map_err(|e| e.to_string())?;

        for (node_type, initial_state) in &node_blueprints {
            sqlx::query("INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, 'MODULE', ?, 0, 10, 85, 0, ?, ?, 0)")
                .bind(Uuid::new_v4().to_string()).bind(project_id).bind(&module_id).bind(*node_type).bind(*initial_state).bind(&now).bind(&now).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
        module_ids.push(module_id);
    }

    if let Some(first_id) = module_ids.first() {
        sqlx::query("UPDATE local_module SET module_state = 'ACTIVE' WHERE module_id = ?").bind(first_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    let _ = app_handle.emit("nodes-updated", ());
    Ok(module_ids)
}
