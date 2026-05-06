use chrono::Utc;
use sqlx::SqlitePool;
use tauri::{Manager, Emitter};
use crate::models::{DocumentNode, LocalModule};

/// DAG 의존성에 따라 다음 노드를 READY 상태로 전환합니다.
/// Genesis PRD → SAD 단계의 노드 전환을 처리합니다.
pub async fn trigger_next_nodes(
    app_handle: tauri::AppHandle,
    project_id: &str,
    completed_node_type: &str,
) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    let next_map = vec![
        ("GPRD_Context_Goal", vec!["GPRD_Capability_Actor"]),
        ("GPRD_Capability_Actor", vec!["GPRD_Architecture_Schema"]),
        ("GPRD_Architecture_Schema", vec!["SAD_Non_Tech"]),
        ("Genesis_PRD", vec!["SAD_Non_Tech"]),
        ("SAD_Non_Tech", vec!["SAD_Tech_Stack", "SAD_Auth_RBAC", "SAD_Interface_Error"]),
        ("SAD_Tech_Stack", vec!["SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error"]),
        ("SAD_Auth_RBAC", vec!["SAD_Core_ERD", "SAD_Interface_Error"]),
        ("SAD_Core_ERD", vec!["SAD_Interface_Error"]),
        ("SAD_Interface_Error", vec!["SAD_Module_List"]),
        ("SAD_Module_List", vec!["SAD_Epic_Mapping"]),
        ("SAD_Epic_Mapping", vec!["SAD_Module_Deps"]),
    ];

    let mut nodes_to_check = Vec::new();
    for (parent, children) in next_map {
        if parent == completed_node_type {
            for child in children {
                nodes_to_check.push(child);
            }
        }
    }

    // 각 후보 노드의 모든 선행 조건이 완료되었는지 확인
    for target in nodes_to_check {
        let prerequisites = match target {
            "GPRD_Capability_Actor" => vec!["GPRD_Context_Goal"],
            "GPRD_Architecture_Schema" => vec!["GPRD_Capability_Actor"],
            "SAD_Non_Tech" => {
                if completed_node_type == "Genesis_PRD" {
                    vec!["Genesis_PRD"]
                } else {
                    vec!["GPRD_Architecture_Schema"]
                }
            }
            "SAD_Tech_Stack" => vec!["SAD_Non_Tech"],
            "SAD_Auth_RBAC" => vec!["SAD_Non_Tech", "SAD_Tech_Stack"],
            "SAD_Core_ERD" => vec!["SAD_Tech_Stack", "SAD_Auth_RBAC"],
            "SAD_Interface_Error" => vec!["SAD_Non_Tech", "SAD_Tech_Stack", "SAD_Auth_RBAC", "SAD_Core_ERD"],
            "SAD_Module_List" => vec!["SAD_Interface_Error"],
            "SAD_Epic_Mapping" => vec!["SAD_Module_List"],
            "SAD_Module_Deps" => vec!["SAD_Epic_Mapping"],
            _ => vec![],
        };

        let mut all_done = true;
        for pre in prerequisites {
            let pre_node = sqlx::query_as::<_, DocumentNode>(
                "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = ?",
            )
            .bind(project_id)
            .bind(pre)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(n) = pre_node {
                if n.node_state != "COMPLETED" && n.node_state != "REVIEWED" {
                    all_done = false;
                    break;
                }
            } else {
                all_done = false;
                break;
            }
        }

        if all_done {
            sqlx::query(
                "UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = ? AND node_state = 'PENDING'",
            )
            .bind(Utc::now().to_rfc3339())
            .bind(project_id)
            .bind(target)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    let _ = app_handle.emit("nodes-updated", ());

    Ok(())
}

/// 특정 노드의 상태가 COMPLETED가 아니게 되었을 때, READY 상태인 하위 노드들을 PENDING으로 되돌립니다.
pub async fn reset_downstream_ready_nodes(
    app_handle: &tauri::AppHandle,
    project_id: &str,
    parent_node_type: &str,
) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    let next_map = vec![
        ("GPRD_Context_Goal", vec!["GPRD_Capability_Actor"]),
        ("GPRD_Capability_Actor", vec!["GPRD_Architecture_Schema"]),
        ("GPRD_Architecture_Schema", vec!["SAD_Non_Tech"]),
        ("Genesis_PRD", vec!["SAD_Non_Tech"]),
        ("SAD_Non_Tech", vec!["SAD_Tech_Stack", "SAD_Auth_RBAC", "SAD_Interface_Error"]),
        ("SAD_Tech_Stack", vec!["SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error"]),
        ("SAD_Auth_RBAC", vec!["SAD_Core_ERD", "SAD_Interface_Error"]),
        ("SAD_Core_ERD", vec!["SAD_Interface_Error"]),
        ("SAD_Interface_Error", vec!["SAD_Module_List"]),
        ("SAD_Module_List", vec!["SAD_Epic_Mapping"]),
        ("SAD_Epic_Mapping", vec!["SAD_Module_Deps"]),
    ];

    let mut nodes_to_check = Vec::new();
    for (parent, children) in next_map {
        if parent == parent_node_type {
            for child in children {
                nodes_to_check.push(child);
            }
        }
    }

    for target in nodes_to_check {
        // 하위 노드가 READY인 경우 PENDING으로 변경 (선행 조건이 깨졌으므로)
        let updated = sqlx::query(
            "UPDATE document_node SET node_state = 'PENDING', updated_at = ? WHERE project_id = ? AND target_node_type = ? AND node_state = 'READY'",
        )
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(project_id)
        .bind(target)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if updated.rows_affected() > 0 {
            println!(">>> [DAG] Reset downstream node {} to PENDING because parent {} is no longer COMPLETED", target, parent_node_type);
            // 재귀적으로 해당 노드의 하위 노드들도 체크
            Box::pin(reset_downstream_ready_nodes(app_handle, project_id, target)).await?;
        }
    }

    Ok(())
}

/// 모듈 내 DAG 의존성에 따라 다음 노드를 READY 상태로 전환합니다.
/// PRD → FSD → User Flow → IA → Wireframe, FSD → ERD/API_Spec → TC 순서를 처리합니다.
pub async fn trigger_module_next_nodes(
    app_handle: &tauri::AppHandle,
    module_id: &str,
    completed_node_type: &str,
) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    // 모듈 내 DAG 의존성 맵 (commands.rs 원본과 동일)
    let next_map = vec![
        ("PRD", vec!["FSD"]),
        ("FSD", vec!["User Flow", "ERD", "Wireframe", "API_Spec", "TC"]),
        ("User Flow", vec!["IA", "Wireframe"]),
        ("IA", vec!["Wireframe"]),
        ("ERD", vec!["API_Spec"]),
        ("API_Spec", vec!["TC"]),
    ];

    let mut nodes_to_check = Vec::new();
    for (parent, children) in &next_map {
        if *parent == completed_node_type {
            for child in children { nodes_to_check.push(*child); }
        }
    }

    for target in nodes_to_check {
        let prerequisites = match target {
            "FSD" => vec!["PRD"],
            "User Flow" => vec!["FSD"],
            "ERD" => vec!["FSD"],
            "IA" => vec!["FSD", "User Flow"],
            "Wireframe" => vec!["FSD", "User Flow", "IA"],
            "API_Spec" => vec!["FSD", "ERD"],
            "TC" => vec!["PRD", "FSD", "API_Spec"],
            _ => vec![],
        };

        let mut all_done = true;
        for pre in prerequisites {
            let pre_node = sqlx::query_as::<_, DocumentNode>(
                "SELECT node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, api_error_code, api_error_message, created_at, updated_at FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0",
            )
            .bind(module_id)
            .bind(pre)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            match pre_node {
                Some(n) if n.node_state == "COMPLETED" || n.node_state == "REVIEWED" => {},
                _ => { all_done = false; break; }
            }
        }

        if all_done {
            sqlx::query(
                "UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE module_id = ? AND target_node_type = ? AND node_state = 'PENDING'",
            )
            .bind(Utc::now().to_rfc3339())
            .bind(module_id)
            .bind(target)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // 모듈 완료 동기화
    sync_module_completion_status(&*pool, Some(app_handle), module_id).await?;

    // UI 이벤트 발행 (다음 노드 READY 상태 반영)
    let _ = app_handle.emit("nodes-updated", ());

    Ok(())
}

/// 특정 모듈 노드의 상태가 COMPLETED가 아니게 되었을 때, READY 상태인 하위 노드들을 PENDING으로 되돌립니다.
pub async fn reset_module_downstream_ready_nodes(
    app_handle: &tauri::AppHandle,
    module_id: &str,
    parent_node_type: &str,
) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    let next_map = vec![
        ("PRD", vec!["FSD"]),
        ("FSD", vec!["User Flow", "ERD", "Wireframe", "API_Spec", "TC"]),
        ("User Flow", vec!["IA", "Wireframe"]),
        ("IA", vec!["Wireframe"]),
        ("ERD", vec!["API_Spec"]),
        ("API_Spec", vec!["TC"]),
    ];

    let mut nodes_to_check = Vec::new();
    for (parent, children) in next_map {
        if parent == parent_node_type {
            for child in children {
                nodes_to_check.push(child);
            }
        }
    }

    for target in nodes_to_check {
        let updated = sqlx::query(
            "UPDATE document_node SET node_state = 'PENDING', updated_at = ? WHERE module_id = ? AND target_node_type = ? AND node_state = 'READY'",
        )
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(module_id)
        .bind(target)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if updated.rows_affected() > 0 {
            println!(">>> [DAG-Module] Reset downstream node {} to PENDING because parent {} is no longer COMPLETED", target, parent_node_type);
            Box::pin(reset_module_downstream_ready_nodes(app_handle, module_id, target)).await?;
        }
    }

    Ok(())
}

/// 모듈의 모든 노드가 완료되었는지 확인하고, 완료 시 모듈 상태를 업데이트합니다.
/// 다음 모듈 활성화 및 프로젝트 완료 처리도 수행합니다.
pub async fn sync_module_completion_status(
    pool: &SqlitePool,
    app_handle: Option<&tauri::AppHandle>,
    module_id: &str,
) -> Result<(), String> {
    let all_module_nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE module_id = ? AND is_deleted = 0",
    )
    .bind(module_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if !all_module_nodes.is_empty() && all_module_nodes.iter().all(|n| n.node_state == "COMPLETED" || n.node_state == "REVIEWED") {
        let module = sqlx::query_as::<_, LocalModule>(
            "SELECT * FROM local_module WHERE module_id = ?",
        )
        .bind(module_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(m) = module {
            // 이미 완료 상태이면 스킵
            if m.module_state == "COMPLETED" {
                return Ok(());
            }

            let now = Utc::now().to_rfc3339();

            // 1. 모듈 상태를 COMPLETED로 변경
            sqlx::query("UPDATE local_module SET module_state = 'COMPLETED', updated_at = ? WHERE module_id = ?")
                .bind(&now).bind(module_id).execute(pool).await.map_err(|e| e.to_string())?;

            // 2. 다음 대기 모듈(PENDING)을 활성화하여 파이프라인 자동 진행
            let next_module = sqlx::query_as::<_, LocalModule>(
                "SELECT * FROM local_module WHERE project_id = ? AND module_state = 'PENDING' AND is_deleted = 0 ORDER BY priority_order ASC LIMIT 1",
            )
            .bind(&m.project_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(nm) = next_module {
                sqlx::query("UPDATE local_module SET module_state = 'ACTIVE', updated_at = ? WHERE module_id = ?")
                    .bind(&now).bind(&nm.module_id).execute(pool).await.map_err(|e| e.to_string())?;

                // 다음 모듈의 첫 노드(PRD)를 READY로 변경
                sqlx::query("UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE module_id = ? AND target_node_type = 'PRD' AND node_state = 'PENDING'")
                    .bind(&now).bind(&nm.module_id).execute(pool).await.map_err(|e| e.to_string())?;
            } else {
                // 모든 모듈 완료 시 프로젝트 상태를 COMPLETED로 변경
                sqlx::query("UPDATE project SET pipeline_phase = 'COMPLETED', updated_at = ? WHERE project_id = ?")
                    .bind(&now).bind(&m.project_id).execute(pool).await.map_err(|e| e.to_string())?;
            }

            // UI 이벤트 발행
            if let Some(h) = app_handle {
                let _ = h.emit("nodes-updated", ());
            }
        }
    }
    Ok(())
}

/// 노드 잠금 여부를 확인합니다.
/// 하위 노드 중 하나라도 COMPLETED 상태이거나 이터레이션 결과(score > 0)가 있다면 상위 노드는 잠금 상태입니다.
pub async fn is_node_locked(
    pool: &sqlx::SqlitePool,
    node: &DocumentNode,
) -> Result<bool, String> {
    // 1. 전역 의존성 맵 (모든 노드 타입은 소문자로 관리)
    let next_map = vec![
        // Context & Goal -> 나머지 모든 GPRD, SAD, Module 노드들
        ("gprd_context_goal", vec![
            "gprd_capability_actor", "gprd_architecture_schema", 
            "sad_non_tech", "sad_tech_stack", "sad_core_erd", "sad_auth_rbac", "sad_interface_error",
            "sad_module_list", "sad_epic_mapping", "sad_module_deps"
        ]),
        // Epics & Actors -> Architecture, SAD, Module 노드들
        ("gprd_capability_actor", vec![
            "gprd_architecture_schema", 
            "sad_non_tech", "sad_tech_stack", "sad_core_erd", "sad_auth_rbac", "sad_interface_error",
            "sad_module_list", "sad_epic_mapping", "sad_module_deps"
        ]),
        // Architecture Schema -> SAD, Module 노드들
        ("gprd_architecture_schema", vec![
            "sad_non_tech", "sad_tech_stack", "sad_core_erd", "sad_auth_rbac", "sad_interface_error",
            "sad_module_list", "sad_epic_mapping", "sad_module_deps"
        ]),
        // SAD 글로벌 항목들 -> SAD 모듈 분할 및 모든 개별 모듈 문서들
        ("sad_non_tech", vec!["sad_tech_stack", "sad_auth_rbac", "sad_interface_error", "sad_module_list", "sad_epic_mapping", "sad_module_deps"]),
        ("sad_tech_stack", vec!["sad_core_erd", "sad_auth_rbac", "sad_interface_error", "sad_module_list", "sad_epic_mapping", "sad_module_deps"]),
        ("sad_core_erd", vec!["sad_interface_error", "sad_module_list", "sad_epic_mapping", "sad_module_deps"]),
        ("sad_auth_rbac", vec!["sad_core_erd", "sad_interface_error", "sad_module_list", "sad_epic_mapping", "sad_module_deps"]),
        ("sad_interface_error", vec!["sad_module_list", "sad_epic_mapping", "sad_module_deps"]),
        
        // SAD 모듈 분할 항목들 -> 모든 개별 모듈 문서들
        ("sad_module_list", vec!["sad_epic_mapping", "sad_module_deps"]),
        ("sad_epic_mapping", vec!["sad_module_deps"]),
        ("sad_module_deps", vec![]),
    ];

    // 2. 모듈 내 의존성 맵 (PRD -> FSD -> Flow/ERD/IA -> Wireframe/API -> TC)
    let module_next_map = vec![
        ("prd", vec!["fsd", "user flow", "ia", "erd", "wireframe", "api_spec", "tc"]),
        ("fsd", vec!["user flow", "ia", "erd", "wireframe", "api_spec", "tc"]),
        ("user flow", vec!["ia", "wireframe", "tc"]),
        ("ia", vec!["wireframe", "tc"]),
        ("erd", vec!["api_spec", "tc"]),
        ("api_spec", vec!["tc"]),
    ];

    let target_type = node.target_node_type.to_lowercase();
    let mut children_types = Vec::new();
    

    for (parent, children) in next_map {
        if parent == target_type { 
            for c in children { children_types.push(c.to_string()); }
        }
    }
    for (parent, children) in module_next_map {
        if parent == target_type { 
            for c in children { children_types.push(c.to_string()); }
        }
    }


    // SAD_Module 관련 노드이거나 SAD_Module 자체인 경우
    let is_sad_module_related = target_type == "sad_module_list" || target_type == "sad_epic_mapping" || target_type == "sad_module_deps" || target_type == "sad_module";

    if is_sad_module_related {
        // SAD_Module 하위에는 모든 개별 모듈 노드들이 포함됨
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM document_node WHERE project_id = ? AND module_id IS NOT NULL AND (node_state = 'COMPLETED' OR current_best_score > 0) AND is_deleted = 0"
        )
        .bind(&node.project_id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
        
        if count > 0 { 
            return Ok(true); 
        }
    }

    if !children_types.is_empty() {
        let mut query_builder = sqlx::QueryBuilder::new("SELECT COUNT(*) FROM document_node WHERE project_id = ");
        query_builder.push_bind(&node.project_id);
        query_builder.push(" AND is_deleted = 0 AND (node_state = 'COMPLETED' OR current_best_score > 0) ");
        
        if let Some(mid) = &node.module_id {
            query_builder.push(" AND module_id = ").push_bind(mid);
        } else {
            query_builder.push(" AND module_id IS NULL ");
        }

        query_builder.push(" AND LOWER(target_node_type) IN (");
        let mut sep = query_builder.separated(", ");
        for t in children_types {
            sep.push_bind(t.to_lowercase());
        }
        query_builder.push(")");

        let count: i64 = query_builder.build_query_scalar()
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

        if count > 0 { 
            return Ok(true); 
        }
    }

    Ok(false)
}
