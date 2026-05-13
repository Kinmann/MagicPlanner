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

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. 해당 프로젝트의 모든 모듈 관련 데이터 및 mock 노드 완전 삭제 (Aggressive Hard Delete)
    // 1-1. 삭제 대상 노드 ID 목록 확보 (MODULE 카테고리 또는 module_id가 있거나 mock-으로 시작하는 노드)
    let target_node_ids: Vec<String> = sqlx::query_scalar(
        "SELECT node_id FROM document_node WHERE project_id = ? AND (node_category = 'MODULE' OR module_id IS NOT NULL OR node_id LIKE 'mock-%')"
    )
    .bind(&project_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if !target_node_ids.is_empty() {
        // 이터레이션 삭제
        sqlx::query("DELETE FROM generation_iteration WHERE node_id IN (SELECT node_id FROM document_node WHERE project_id = ? AND (node_category = 'MODULE' OR module_id IS NOT NULL OR node_id LIKE 'mock-%'))")
            .bind(&project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

        // 임베딩 메타데이터 및 벡터 삭제
        sqlx::query("DELETE FROM document_embeddings WHERE rowid IN (SELECT rowid FROM embedding_metadata WHERE node_id IN (SELECT node_id FROM document_node WHERE project_id = ? AND (node_category = 'MODULE' OR module_id IS NOT NULL OR node_id LIKE 'mock-%')))")
            .bind(&project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

        sqlx::query("DELETE FROM embedding_metadata WHERE node_id IN (SELECT node_id FROM document_node WHERE project_id = ? AND (node_category = 'MODULE' OR module_id IS NOT NULL OR node_id LIKE 'mock-%'))")
            .bind(&project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

        // 노드 삭제
        sqlx::query("DELETE FROM document_node WHERE project_id = ? AND (node_category = 'MODULE' OR module_id IS NOT NULL OR node_id LIKE 'mock-%')")
            .bind(&project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // 모듈 삭제
    sqlx::query("DELETE FROM local_module WHERE project_id = ?")
        .bind(&project_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // SAD 모듈 상태 업데이트
    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module'")
    .bind(&now).bind(&project_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // 프로젝트 단계 변경
    sqlx::query("UPDATE project SET pipeline_phase = 'MODULE_GENERATION', updated_at = ? WHERE project_id = ?")
    .bind(&now).bind(&project_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let mut module_ids = Vec::new();
    let node_blueprints = vec![
        ("PRD", "READY"),
        ("FSD", "PENDING"),
        ("ERD", "PENDING"),
        ("API_Spec", "PENDING"),
        ("User Flow", "PENDING"),
        ("IA", "PENDING"),
        ("Wireframe", "PENDING"),
        ("TC", "PENDING"),
    ];

    for (idx, module) in modules.iter().enumerate() {
        let module_id = module["module_id"].as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
            
        let default_name = format!("Module-{}", idx+1);
        let m_name = module["name"].as_str().unwrap_or(&default_name);
        let m_desc = module["description"].as_str().unwrap_or("");
        let m_resp = module["responsibility"].as_str().unwrap_or("");
        let m_epics = module["mapped_epics"].as_str().unwrap_or(""); 
        let m_deps = module["dependency_spec"].as_str().unwrap_or("[]");
        let priority = module["priority_order"].as_i64().unwrap_or(idx as i64) as i32;

        sqlx::query(
            "INSERT INTO local_module (module_id, project_id, module_name, module_description, core_responsibility, mapped_epics, dependency_spec, priority_order, module_state, display_order, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, 0)"
        )
        .bind(&module_id).bind(&project_id).bind(m_name).bind(m_desc).bind(m_resp).bind(m_epics).bind(m_deps)
        .bind(priority).bind(idx as i32).bind(&now).bind(&now)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

        for (node_type, initial_state) in &node_blueprints {
            let node_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, 'MODULE', ?, 0, 10, 85, 0, ?, ?, 0)"
            )
            .bind(&node_id).bind(&project_id).bind(&module_id).bind(*node_type).bind(*initial_state).bind(&now).bind(&now)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }

        module_ids.push(module_id);
    }

    if let Some(first_id) = module_ids.first() {
        sqlx::query("UPDATE local_module SET module_state = 'ACTIVE' WHERE module_id = ?")
        .bind(first_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    Ok(module_ids)
}

