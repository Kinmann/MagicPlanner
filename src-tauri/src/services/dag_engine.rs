use chrono::Utc;
use sqlx::SqlitePool;
use tauri::Manager;
use crate::models::{DocumentNode, LocalModule};

/// DAG 의존성에 따라 다음 노드를 READY 상태로 전환합니다.
/// Genesis PRD → SAD 단계의 노드 전환을 처리합니다.
pub async fn trigger_next_nodes(
    app_handle: tauri::AppHandle,
    project_id: &str,
    completed_node_type: &str,
) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    // 프로젝트 수준 DAG 의존성 맵 (선행 노드 → 후속 노드)
    let next_map = vec![
        ("GPRD_Context_Goal", vec!["GPRD_Capability_Actor"]),
        ("GPRD_Capability_Actor", vec!["GPRD_Architecture_Schema"]),
        ("GPRD_Architecture_Schema", vec!["SAD_Global"]),
        ("SAD_Global", vec!["SAD_Module"]),
        ("Genesis_PRD", vec!["SAD_Global"]),
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
            "SAD_Global" => {
                if completed_node_type == "Genesis_PRD" {
                    vec!["Genesis_PRD"]
                } else {
                    vec!["GPRD_Architecture_Schema"]
                }
            }
            "SAD_Module" => vec!["SAD_Global"],
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
                if n.node_state != "COMPLETED" {
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
                Some(n) if n.node_state == "COMPLETED" => {},
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

    if !all_module_nodes.is_empty() && all_module_nodes.iter().all(|n| n.node_state == "COMPLETED") {
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
                use tauri::Emitter;
                let _ = h.emit("nodes-updated", ());
            }
        }
    }
    Ok(())
}
