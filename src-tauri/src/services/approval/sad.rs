use sqlx::SqlitePool;
use chrono::Utc;
use uuid::Uuid;
use tauri::Emitter;
use crate::models::{DocumentNode, GenerationIteration};
use crate::services::dag_engine::{is_node_locked, trigger_next_nodes};
use crate::services::approval::common::trigger_rag_embedding_bg;
use crate::services::module_service::create_local_modules_logic;

pub async fn confirm_sad_iteration_logic(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
    iteration_id: &str,
) -> Result<(), String> {
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = (SELECT node_id FROM generation_iteration WHERE iteration_id = ?)"
    )
    .bind(iteration_id).fetch_one(pool).await.map_err(|e| e.to_string())?;

    if is_node_locked(pool, &node).await? {
        return Err("하위 파이프라인이 진행 중이어서 선택을 변경할 수 없습니다.".into());
    }

    let iteration = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE iteration_id = ?")
        .bind(iteration_id).fetch_one(pool).await.map_err(|e| e.to_string())?;

    let now = Utc::now().to_rfc3339();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND context_type = ?")
        .bind(&now).bind(project_id).bind(&node.target_node_type).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
        .bind(&now).bind(&node.node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 1, is_archived = 0, updated_at = ? WHERE iteration_id = ?")
        .bind(&now).bind(iteration_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let ctx_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
    )
    .bind(&ctx_id).bind(project_id).bind(iteration_id).bind(&node.target_node_type).bind(&iteration.generated_draft_json).bind(iteration.iteration_number).bind(&now).bind(&now)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE document_node SET current_best_score = ?, updated_at = ? WHERE node_id = ?")
        .bind(iteration.calculated_score).bind(&now).bind(&node.node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&iteration.generated_draft_json) {
        crate::services::artifact_mapping::sync_artifact_mappings_in_tx(&mut tx, project_id, &node.node_id, &json_value).await?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    trigger_rag_embedding_bg(app_handle, pool, project_id.to_string(), node.node_id, node.target_node_type, iteration.iteration_id, iteration.generated_draft_json, iteration.calculated_score.unwrap_or(0), None).await;

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

pub async fn approve_sad_node_logic(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
    node_id: &str,
    api_key: Option<String>,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE node_id = ?")
        .bind(node_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let confirmed_iter = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY iteration_number DESC LIMIT 1")
        .bind(node_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?")
        .bind(&now).bind(node_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    trigger_rag_embedding_bg(app_handle, pool, project_id.to_string(), node.node_id.clone(), node.target_node_type.clone(), confirmed_iter.iteration_id, confirmed_iter.generated_draft_json.clone(), confirmed_iter.calculated_score.unwrap_or(0), api_key).await;

    let t_type = node.target_node_type.clone();
    if t_type == "SAD_Interface_Error" {
        trigger_module_split_nodes(pool, project_id).await?;
    } else if t_type == "SAD_Module_Deps" {
        trigger_module_creation(app_handle, pool, project_id, &confirmed_iter.generated_draft_json).await?;
    } else {
        trigger_next_nodes(app_handle.clone(), project_id, &t_type).await?;
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

async fn trigger_module_split_nodes(pool: &SqlitePool, project_id: &str) -> Result<(), String> {
    let module_types = vec!["SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"];
    let now = Utc::now().to_rfc3339();
    for mt in module_types {
        let state = if mt == "SAD_Module_List" { "READY" } else { "PENDING" };
        let exists = sqlx::query("SELECT 1 FROM document_node WHERE project_id = ? AND target_node_type = ?")
            .bind(project_id).bind(mt).fetch_optional(pool).await.map_err(|e| e.to_string())?;
        if exists.is_none() {
            sqlx::query("INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, ?, 'SAD', ?, 0, 10, 80, 0, ?, ?, 0)")
                .bind(Uuid::new_v4().to_string()).bind(project_id).bind(mt).bind(state).bind(&now).bind(&now).execute(pool).await.map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

async fn trigger_module_creation(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
    deps_draft: &str,
) -> Result<(), String> {
    let list_node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Module_List'")
        .bind(project_id).fetch_one(pool).await.map_err(|e| e.to_string())?;
    let list_iter = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY created_at DESC LIMIT 1")
        .bind(&list_node.node_id).fetch_one(pool).await.map_err(|e| e.to_string())?;
    let list_data: serde_json::Value = serde_json::from_str(&list_iter.generated_draft_json).unwrap_or_default();
    let modules_val = list_data.get("modules").unwrap_or(&list_data);

    let mapping_node = sqlx::query_as::<_, DocumentNode>("SELECT * FROM document_node WHERE project_id = ? AND target_node_type = 'SAD_Epic_Mapping'")
        .bind(project_id).fetch_one(pool).await.map_err(|e| e.to_string())?;
    let mapping_iter = sqlx::query_as::<_, GenerationIteration>("SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY created_at DESC LIMIT 1")
        .bind(&mapping_node.node_id).fetch_one(pool).await.map_err(|e| e.to_string())?;
    let mapping_data: serde_json::Value = serde_json::from_str(&mapping_iter.generated_draft_json).unwrap_or_default();
    let epic_mappings: Vec<serde_json::Value> = mapping_data.get("mappings").and_then(|m| m.as_array()).cloned().unwrap_or_default();

    let deps_data: serde_json::Value = serde_json::from_str(deps_draft).unwrap_or_default();
    let all_dependencies = deps_data.get("dependencies").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    let build_order = deps_data.get("recommended_build_order").and_then(|b| b.as_array()).cloned().unwrap_or_default();

    let raw_modules = modules_val.as_array().cloned().unwrap_or_default();
    let modules_to_create: Vec<serde_json::Value> = raw_modules.iter().map(|m| {
        let mid = m.get("module_id").and_then(|v| v.as_str()).unwrap_or("");
        let assigned_epics: Vec<String> = epic_mappings.iter()
            .filter(|em| em.get("mapped_modules").and_then(|mm| mm.as_array()).is_some_and(|mm| mm.iter().any(|val| val.as_str() == Some(mid))))
            .filter_map(|em| em.get("epic_id").and_then(|e| e.as_str()).map(|e| e.to_string())).collect();
        let my_deps: Vec<serde_json::Value> = all_dependencies.iter().filter(|d| d.get("from_module").and_then(|f| f.as_str()) == Some(mid)).cloned().collect();
        let dependency_spec = serde_json::to_string(&my_deps).unwrap_or_else(|_| "[]".to_string());
        let priority = build_order.iter().position(|b| b.as_str() == Some(mid)).map(|pos| pos as i64).or_else(|| m.get("priority_order").and_then(|p| p.as_i64())).unwrap_or(0);

        serde_json::json!({
            "module_id": mid, "name": m.get("module_name").or(m.get("name")), "description": m.get("description"),
            "responsibility": m.get("core_responsibility").or(m.get("responsibility")),
            "mapped_epics": assigned_epics.join(", "), "dependency_spec": dependency_spec, "priority_order": priority
        })
    }).collect();

    let final_json = serde_json::to_string(&modules_to_create).unwrap_or_else(|_| "[]".to_string());
    create_local_modules_logic(pool, project_id, &final_json, app_handle).await?;
    Ok(())
}
