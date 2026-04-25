use sqlx::{SqlitePool, Row};

/// PRD 병합 유틸리티
/// GPRD 3단계(1-A, 1-B, 1-C) 승인된 결과를 하나의 통합 PRD로 조합합니다.
pub async fn get_full_approved_prd(pool: &SqlitePool, project_id: &str) -> String {
    use serde_json::Value;

    let out_1a = get_approved_node_output(pool, project_id, "GPRD_Context_Goal").await;
    let out_1b = get_approved_node_output(pool, project_id, "GPRD_Capability_Actor").await;
    let out_1c = get_approved_node_output(pool, project_id, "GPRD_Architecture_Schema").await;

    // 1. 개별 스테이지 파싱 (실패 시 빈 객체로 폴백하여 전체가 뭉개지는 것 방지)
    let v1a: Value = serde_json::from_str(&out_1a).unwrap_or_else(|_| serde_json::json!({}));
    let v1b: Value = serde_json::from_str(&out_1b).unwrap_or_else(|_| serde_json::json!({}));
    let v1c: Value = serde_json::from_str(&out_1c).unwrap_or_else(|_| serde_json::json!({}));

    // 만약 모든 단계가 비어있다면 레거시(Genesis_PRD) 시도
    if out_1a == "{}" && out_1b == "{}" && out_1c == "{}" {
        let legacy = get_approved_node_output(pool, project_id, "Genesis_PRD").await;
        if legacy != "{}" { return legacy; }
    }

    // 2. 통합 PRD 구조 생성
    // Stage 1 데이터 추출
    let product_vision = v1a["product_vision"].as_str().or(v1a["productVision"].as_str()).unwrap_or("").to_string();
    let target_market = v1a["target_market"].as_str().or(v1a["targetMarket"].as_str()).unwrap_or("").to_string();
    let success_metrics = v1a["success_metrics"].as_array().or(v1a["successMetrics"].as_array()).cloned().unwrap_or_default();
    
    let constraints = &v1a["global_constraints"];
    let compliance = constraints["compliance"].as_array().cloned().unwrap_or_default();
    let performance = constraints["performance"].as_array().cloned().unwrap_or_default();
    let legacy_integrations = constraints["legacy_integrations"].as_array().or(constraints["legacyIntegrations"].as_array()).cloned().unwrap_or_default();

    // Stage 2 데이터 추출
    let raw_epics = v1b["core_epics"].as_array().or(v1b["coreEpics"].as_array()).cloned().unwrap_or_default();

    // Stage 3 데이터 추출
    let user_roles = v1c["user_roles"].as_array().or(v1c["userRoles"].as_array()).cloned().unwrap_or_default();
    let tech_stack = v1c["tech_stack"].clone();

    // 3. 1-C의 Role Name → ID 매핑
    let mut role_map = std::collections::HashMap::new();
    for role in &user_roles {
        if let (Some(name), Some(id)) = (role["role_name"].as_str(), role["role_id"].as_str()) {
            role_map.insert(name.to_string(), id.to_string());
        }
    }

    // 4. Epics 변환 및 병합
    let finalized_epics: Vec<Value> = raw_epics.into_iter().map(|mut e| {
        let required_actors = e["required_actors"].as_array().or(e["requiredActors"].as_array());
        if let Some(actors_arr) = required_actors {
            let target_roles: Vec<Value> = actors_arr.iter().map(|actor_name| {
                let name_str = actor_name.as_str().unwrap_or("");
                let role_id = role_map.get(name_str).cloned().unwrap_or_else(|| format!("ROLE-UNKNOWN-{}", name_str));
                Value::String(role_id)
            }).collect();
            e["target_roles"] = Value::Array(target_roles);
        }
        e
    }).collect();

    // 5. 최종 PRD 객체 구성
    let final_prd = serde_json::json!({
        "metadata": v1a["metadata"],
        "business_context": {
            "product_vision": product_vision,
            "target_market": target_market,
            "success_metrics": success_metrics,
        },
        "user_roles": user_roles,
        "core_epics": finalized_epics,
        "global_constraints": {
            "compliance": compliance,
            "performance": performance,
            "legacy_integrations": legacy_integrations,
        },
        "tech_stack": tech_stack
    });

    serde_json::to_string(&final_prd).unwrap_or_else(|_| "{}".to_string())
}

/// 특정 노드의 승인된(is_pass=1) 최신 반복 결과 JSON을 반환합니다.
pub async fn get_approved_node_output(pool: &SqlitePool, project_id: &str, node_type: &str) -> String {
    let res = sqlx::query(
        "SELECT generated_draft_json FROM generation_iteration 
         WHERE node_id = (SELECT node_id FROM document_node WHERE project_id = ? AND target_node_type = ?) 
         AND is_pass = 1 AND is_deleted = 0 
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(node_type)
    .fetch_optional(pool)
    .await;

    match res {
        Ok(Some(row)) => row.get::<String, _>("generated_draft_json"),
        _ => "{}".to_string(),
    }
}
