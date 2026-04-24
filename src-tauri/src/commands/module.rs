use uuid::Uuid;
use chrono::Utc;
use tauri::Emitter;
use sqlx::SqlitePool;

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================
pub use crate::models::{
    GlobalContext, LocalModule,
};

// 서비스 함수 임포트

// EvaluationResult is now imported from crate::schemas

// EvaluationResult is now imported from crate::schemas


#[tauri::command]
pub async fn get_project_modules(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<Vec<LocalModule>, String> {
    let modules = sqlx::query_as::<_, LocalModule>(
        "SELECT module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, dependency_spec, priority_order, module_state, display_order, created_at, updated_at FROM local_module WHERE project_id = ? AND is_deleted = 0 ORDER BY priority_order ASC"
    )
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(modules)
}


#[tauri::command]
pub async fn get_global_contexts(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<Vec<GlobalContext>, String> {
    let contexts = sqlx::query_as::<_, GlobalContext>(
        "SELECT context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at FROM global_context WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(contexts)
}


/// SAD 囹뜹쐦??影ｅ쐣占?獄??계퀝 獄덂댖占???믭옙 ??뽳옙 (容뽩텈? 10令?
#[tauri::command]
pub async fn create_local_modules(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    modules_json: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let now = Utc::now().to_rfc3339();

    // modules_json ?葯멥삖: [{name, description, responsibility, mapped_epics, priority_order}]
    let modules: Vec<serde_json::Value> = serde_json::from_str(&modules_json)
        .map_err(|e| format!("獄덂댖占?JSON ?葯멥삖 ??덌옙: {}", e))?;

    if modules.len() > 10 {
        return Err("容뽩텈? 獄덂댖占???わ옙 10令덍?곤옙?占쏜졊?".to_string());
    }

    // SAD 獄덂댖占?蘊깍옙占??蘊덌옙 ?占쏙옙 墉?겒??
    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module'")
    .bind(&now).bind(&project_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    // ?占쏙옙??틶??phase ?占쏙옙
    sqlx::query("UPDATE project SET pipeline_phase = 'MODULE_GENERATION', updated_at = ? WHERE project_id = ?")
    .bind(&now).bind(&project_id)
    .execute(&*pool).await.map_err(|e| e.to_string())?;

    let mut module_ids = Vec::new();
    let node_types = vec!["PRD", "FSD", "User Flow", "IA", "ERD", "Wireframe", "API_Spec", "TC"];

    for (idx, module) in modules.iter().enumerate() {
        // AI令덌옙 ?帝같占??ID令덌옙 ?占썲컧獄??燁묌뭘, ?占썲컧獄?UUID ??뽳옙 (??????옙)
        let module_id = module["module_id"].as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
            
        let default_name = format!("Module-{}", idx+1);
        let m_name = module["name"].as_str().unwrap_or(&default_name);
        let m_desc = module["description"].as_str().unwrap_or("");
        let m_resp = module["responsibility"].as_str().unwrap_or("");
        let m_epics = module["mapped_epics"].as_str().unwrap_or(""); // 獄덌옙占?占썲컧獄?獄↑퀎占??容뷰눢占?
        let priority = module["priority_order"].as_i64().unwrap_or(idx as i64) as i32;

        sqlx::query(
            "INSERT INTO local_module (module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, priority_order, module_state, display_order, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, 0)"
        )
        .bind(&module_id).bind(&project_id).bind(m_name).bind(m_desc).bind(m_resp).bind(m_epics)
        .bind(priority).bind(idx as i32).bind(&now).bind(&now)
        .execute(&*pool).await.map_err(|e| e.to_string())?;

        // 令?獄덂댖占??8令??蘊덌옙 ??뽳옙
        for node_type in &node_types {
            let node_id = Uuid::new_v4().to_string();
            let initial_state = if node_type == &"PRD" { "READY" } else { "PENDING" };
            sqlx::query(
                "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, 'MODULE', ?, 0, 10, 85, 0, ?, ?, 0)"
            )
            .bind(&node_id).bind(&project_id).bind(&module_id).bind(*node_type).bind(initial_state).bind(&now).bind(&now)
            .execute(&*pool).await.map_err(|e| e.to_string())?;
        }

        module_ids.push(module_id);
    }

    // 墉?縕믭옙耶?獄덂댖占???잞옙?帝같占?容뽴쮤덌옙)???帝같占??
    if let Some(first_id) = module_ids.first() {
        sqlx::query("UPDATE local_module SET module_state = 'ACTIVE' WHERE module_id = ?")
        .bind(first_id).execute(&*pool).await.map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(module_ids)
}

