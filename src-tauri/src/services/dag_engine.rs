use chrono::Utc;
use sqlx::{SqlitePool, Row};
use tauri::{Manager, Emitter};
use crate::models::{DocumentNode, LocalModule};
use uuid::Uuid;

/// 전역(GPRD, SAD) 노드 의존성 맵: (부모, 자식들)
pub const GLOBAL_NEXT_MAP: &[(&str, &[&str])] = &[
    ("GPRD_Context_Goal", &["GPRD_Capability_Actor"]),
    ("GPRD_Capability_Actor", &["GPRD_Architecture_Schema"]),
    ("GPRD_Architecture_Schema", &["SAD_Non_Tech"]),
    ("Genesis_PRD", &["SAD_Non_Tech"]),
    ("SAD_Non_Tech", &["SAD_Tech_Stack", "SAD_Auth_RBAC", "SAD_Interface_Error"]),
    ("SAD_Tech_Stack", &["SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error"]),
    ("SAD_Auth_RBAC", &["SAD_Core_ERD", "SAD_Interface_Error"]),
    ("SAD_Core_ERD", &["SAD_Interface_Error"]),
    ("SAD_Interface_Error", &["SAD_Module_List"]),
    ("SAD_Module_List", &["SAD_Epic_Mapping"]),
    ("SAD_Epic_Mapping", &["SAD_Module_Deps"]),
];

/// 모듈 내 노드 의존성 맵: (부모, 자식들)
pub const MODULE_NEXT_MAP: &[(&str, &[&str])] = &[
    ("PRD", &["FSD"]),
    ("FSD", &["User Flow", "ERD", "Wireframe", "API_Spec", "TC"]),
    ("User Flow", &["IA", "Wireframe"]),
    ("IA", &["Wireframe"]),
    ("ERD", &["API_Spec"]),
    ("API_Spec", &["TC"]),
];

/// 증분수정 전파용 하향 의존성 맵 (전역 및 모듈 통합)
pub const DOWNSTREAM_PROPAGATION_MAP: &[(&str, &[&str])] = &[
    // Context & Goal -> 나머지 모든 GPRD, SAD, Module 노드들
    ("GPRD_Context_Goal", &["GPRD_Capability_Actor", "GPRD_Architecture_Schema", "SAD_Non_Tech", "SAD_Tech_Stack", "SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error", "SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"]),
    // Epics & Actors -> Architecture, SAD, Module 노드들
    ("GPRD_Capability_Actor", &["GPRD_Architecture_Schema", "SAD_Non_Tech", "SAD_Tech_Stack", "SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error", "SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"]),
    // Architecture Schema -> SAD, Module 노드들
    ("GPRD_Architecture_Schema", &["SAD_Non_Tech", "SAD_Tech_Stack", "SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error", "SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"]),
    // SAD 글로벌 항목들 -> SAD 모듈 분할 및 모든 개별 모듈 문서들
    ("SAD_Non_Tech", &["SAD_Tech_Stack", "SAD_Auth_RBAC", "SAD_Interface_Error", "SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"]),
    ("SAD_Tech_Stack", &["SAD_Core_ERD", "SAD_Auth_RBAC", "SAD_Interface_Error", "SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"]),
    ("SAD_Core_ERD", &["SAD_Interface_Error", "SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"]),
    ("SAD_Auth_RBAC", &["SAD_Core_ERD", "SAD_Interface_Error", "SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"]),
    ("SAD_Interface_Error", &["SAD_Module_List", "SAD_Epic_Mapping", "SAD_Module_Deps"]),
    // SAD 모듈 분할 항목들 -> 모든 개별 모듈 문서들
    ("SAD_Module_List", &["SAD_Epic_Mapping", "SAD_Module_Deps", "PRD", "FSD"]),
    ("SAD_Epic_Mapping", &["SAD_Module_Deps", "PRD", "FSD"]),
    ("SAD_Module_Deps", &[]),
    // 모듈 내 의존성
    ("PRD", &["FSD", "User Flow", "IA", "ERD", "Wireframe", "API_Spec", "TC"]),
    ("FSD", &["User Flow", "IA", "ERD", "Wireframe", "API_Spec", "TC"]),
    ("User Flow", &["IA", "Wireframe", "TC"]),
    ("IA", &["Wireframe", "TC"]),
    ("ERD", &["API_Spec", "TC"]),
    ("API_Spec", &["TC"]),
];

/// DAG 의존성에 따라 다음 노드를 READY 상태로 전환합니다.
pub async fn trigger_next_nodes(
    app_handle: tauri::AppHandle,
    project_id: &str,
    completed_node_type: &str,
) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    let mut nodes_to_check = Vec::new();
    for (parent, children) in GLOBAL_NEXT_MAP {
        if *parent == completed_node_type {
            for child in *children {
                nodes_to_check.push(*child);
            }
        }
    }

    // 각 후보 노드의 모든 선행 조건이 완료되었는지 확인
    for target in nodes_to_check {
        let prerequisites = get_global_prerequisites(target, completed_node_type);

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

    let mut nodes_to_check = Vec::new();
    for (parent, children) in GLOBAL_NEXT_MAP {
        if *parent == parent_node_type {
            for child in *children {
                nodes_to_check.push(*child);
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
        let prerequisites = get_module_prerequisites(target);

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
    sync_module_completion_status(&pool, Some(app_handle), module_id).await?;

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

    let mut nodes_to_check = Vec::new();
    for (parent, children) in MODULE_NEXT_MAP {
        if *parent == parent_node_type {
            for child in *children {
                nodes_to_check.push(*child);
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
    let target_type = node.target_node_type.to_lowercase();
    let mut children_types = Vec::new();
    
    for (parent, children) in DOWNSTREAM_PROPAGATION_MAP {
        if parent.to_lowercase() == target_type { 
            for c in *children { children_types.push(c.to_string()); }
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

/// 노드 타입별 전역 선행 노드 목록을 반환합니다.
pub fn get_global_prerequisites(target: &str, completed_hint: &str) -> Vec<&'static str> {
    match target {
        "GPRD_Capability_Actor" => vec!["GPRD_Context_Goal"],
        "GPRD_Architecture_Schema" => vec!["GPRD_Capability_Actor"],
        "SAD_Non_Tech" => {
            if completed_hint == "Genesis_PRD" { vec!["Genesis_PRD"] } 
            else { vec!["GPRD_Architecture_Schema"] }
        }
        "SAD_Tech_Stack" => vec!["SAD_Non_Tech"],
        "SAD_Auth_RBAC" => vec!["SAD_Non_Tech", "SAD_Tech_Stack"],
        "SAD_Core_ERD" => vec!["SAD_Tech_Stack", "SAD_Auth_RBAC"],
        "SAD_Interface_Error" => vec!["SAD_Non_Tech", "SAD_Tech_Stack", "SAD_Auth_RBAC", "SAD_Core_ERD"],
        "SAD_Module_List" => vec!["SAD_Interface_Error"],
        "SAD_Epic_Mapping" => vec!["SAD_Module_List"],
        "SAD_Module_Deps" => vec!["SAD_Epic_Mapping"],
        _ => vec![],
    }
}

/// 노드 타입별 모듈 내 선행 노드 목록을 반환합니다.
pub fn get_module_prerequisites(target: &str) -> Vec<&'static str> {
    match target {
        "FSD" => vec!["PRD"],
        "User Flow" => vec!["FSD"],
        "ERD" => vec!["FSD"],
        "IA" => vec!["FSD", "User Flow"],
        "Wireframe" => vec!["FSD", "User Flow", "IA"],
        "API_Spec" => vec!["FSD", "ERD"],
        "TC" => vec!["PRD", "FSD", "API_Spec"],
        _ => vec![],
    }
}

/// 실행 전 선행 노드의 상태를 검증하고, 정상인 경우 전역 컨텍스트를 최신화합니다.
pub async fn verify_and_refresh_context(
    pool: &SqlitePool,
    project_id: &str,
    node: &DocumentNode,
) -> Result<(), String> {
    let target_type = &node.target_node_type;
    
    // 1. 선행 노드 목록 추출
    let prerequisites = if node.node_category == "MODULE" {
        get_module_prerequisites(target_type)
    } else {
        get_global_prerequisites(target_type, "")
    };

    // 2. 선행 노드 상태 검사
    for pre in prerequisites {
        let pre_node = match (node.node_category.as_str(), &node.module_id) {
            ("MODULE", Some(mid)) => {
                sqlx::query_as::<_, DocumentNode>(
                    "SELECT * FROM document_node WHERE module_id = ? AND target_node_type = ? AND is_deleted = 0"
                )
                .bind(mid)
                .bind(pre)
                .fetch_optional(pool)
                .await
            }
            _ => {
                sqlx::query_as::<_, DocumentNode>(
                    "SELECT * FROM document_node WHERE project_id = ? AND target_node_type = ? AND is_deleted = 0"
                )
                .bind(project_id)
                .bind(pre)
                .fetch_optional(pool)
                .await
            }
        }.map_err(|e| e.to_string())?;

        if let Some(n) = pre_node {
            if n.node_state == "STALE" || n.node_state == "REFINING" || n.node_state == "REVIEW_PENDING" {
                return Err(format!("선행 설계 문서 '{}'가 현재 수정 중이거나 오염된 상태입니다. 해당 문서를 먼저 승인(Approve)해 주세요.", pre));
            }
            if n.node_state != "COMPLETED" && n.node_state != "REVIEWED" {
                return Err(format!("선행 설계 문서 '{}'가 완료되지 않았습니다.", pre));
            }
        }
    }

    // 3. [JIT Refresh] 전역 컨텍스트 동기화
    refresh_global_context(pool, project_id).await?;

    Ok(())
}

/// GPRD 및 SAD 글로벌 노드들의 최신 승인된 결과를 global_context 테이블에 반영합니다.
pub async fn refresh_global_context(
    pool: &SqlitePool,
    project_id: &str,
) -> Result<(), String> {
    let global_source_types = vec![
        "GPRD_Context_Goal", "GPRD_Capability_Actor", "GPRD_Architecture_Schema", "Genesis_PRD",
        "SAD_Non_Tech", "SAD_Tech_Stack", "SAD_Auth_RBAC", "SAD_Core_ERD", "SAD_Interface_Error"
    ];

    for g_type in global_source_types {
        let row = sqlx::query(
            "SELECT it.iteration_id, it.generated_draft_json, it.iteration_number \
             FROM generation_iteration it \
             JOIN document_node dn ON it.node_id = dn.node_id \
             WHERE dn.project_id = ? AND dn.target_node_type = ? AND dn.is_deleted = 0 \
             AND it.is_pass = 1 AND it.is_deleted = 0 \
             ORDER BY it.created_at DESC LIMIT 1"
        )
        .bind(project_id)
        .bind(g_type)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(row) = row {
            let iter_id: String = row.get("iteration_id");
            let json: String = row.get("generated_draft_json");
            let version: i32 = row.get("iteration_number");
            let now = chrono::Utc::now().to_rfc3339();
            
            println!("[JIT-REFRESH] Found latest approved for {}: Iteration {} (ID: {})", g_type, version, iter_id);

            let existing: Option<(String, i32)> = sqlx::query(
                "SELECT context_id, is_deleted FROM global_context WHERE project_id = ? AND context_type = ?"
            )
            .bind(project_id)
            .bind(g_type)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .map(|r| (r.get::<String, _>("context_id"), r.get::<i32, _>("is_deleted")));

            if let Some((ctx_id, _)) = existing {
                sqlx::query(
                    "UPDATE global_context SET iteration_id = ?, context_data_json = ?, version = ?, updated_at = ?, is_deleted = 0 WHERE context_id = ?"
                )
                .bind(&iter_id).bind(&json).bind(version).bind(&now).bind(&ctx_id)
                .execute(pool).await.map_err(|e| e.to_string())?;
                println!("[JIT-REFRESH] Updated global_context for {}", g_type);
            } else {
                let new_id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .bind(&new_id).bind(project_id).bind(&iter_id).bind(g_type).bind(&json).bind(version).bind(&now).bind(&now)
                .execute(pool).await.map_err(|e| e.to_string())?;
                println!("[JIT-REFRESH] Inserted new global_context for {}", g_type);
            }
        }
    }
    Ok(())
}

/// 특정 노드 타입의 하위 노드 타입 목록을 반환합니다. (증분수정 전파용)
pub fn get_downstream_types(parent_type: &str) -> Vec<&'static str> {
    let parent_upper = parent_type.to_uppercase();
    for (parent, children) in DOWNSTREAM_PROPAGATION_MAP {
        if parent.to_uppercase() == parent_upper {
            return children.to_vec();
        }
    }
    vec![]
}
