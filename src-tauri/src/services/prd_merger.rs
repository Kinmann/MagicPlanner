use sqlx::{SqlitePool, Row};
use chrono::Utc;

/// PRD 병합 유틸리티
/// GPRD 3단계(1-A, 1-B, 1-C) 승인된 결과를 하나의 통합 PRD로 조합합니다.
pub async fn get_full_approved_prd(pool: &SqlitePool, project_id: &str) -> String {
    use crate::schemas::*;

    let out_1a = get_approved_node_output(pool, project_id, "GPRD_Context_Goal").await;
    let out_1b = get_approved_node_output(pool, project_id, "GPRD_Capability_Actor").await;
    let out_1c = get_approved_node_output(pool, project_id, "GPRD_Architecture_Schema").await;

    let res_1a: Result<GprdContextGoalSchema, _> = serde_json::from_str(&out_1a);
    let res_1b: Result<GprdCapabilityActorSchema, _> = serde_json::from_str(&out_1b);
    let res_1c: Result<GprdArchitectureSchema, _> = serde_json::from_str(&out_1c);

    // 새로운 3단계 스키마 파싱 실패 시, 레거시(Genesis_PRD 단일 노드) 폴백
    if res_1a.is_err() || res_1b.is_err() || res_1c.is_err() {
        let legacy = get_approved_node_output(pool, project_id, "Genesis_PRD").await;
        if legacy != "{}" {
            return legacy;
        }
        // 모든 단계가 실패하면 빈 객체 반환
        if res_1a.is_err() && res_1b.is_err() && res_1c.is_err() {
            return "{}".to_string();
        }
    }

    // 각 단계를 기본값으로 조합
    let s1a = res_1a.unwrap_or_else(|_| GprdContextGoalSchema {
        metadata: GenesisPrdMetadata {
            project_name: "Unknown".to_string(),
            version: "1.0.0".to_string(),
            generated_at: Utc::now().to_rfc3339(),
            status: "DRAFT".to_string(),
        },
        product_vision: "".to_string(),
        target_market: "".to_string(),
        success_metrics: vec![],
        global_constraints: GprdGlobalConstraints {
            compliance: vec![],
            performance: vec![],
            legacy_integrations: vec![],
        },
    });
    let s1b = res_1b.unwrap_or_else(|_| GprdCapabilityActorSchema {
        actors: vec![],
        core_epics: vec![],
    });
    let s1c = res_1c.unwrap_or_else(|_| GprdArchitectureSchema {
        user_roles: vec![],
        tech_stack: GenesisPrdTechStack {
            frontend: GenesisPrdFrontend {
                framework: "REACT".to_string(),
                state_management: "ZUSTAND".to_string(),
                ui_library: None,
            },
            backend: GenesisPrdBackend {
                runtime: "NODE_JS".to_string(),
                framework: "EXPRESS".to_string(),
                language_version: None,
            },
            database: GenesisPrdDatabase {
                primary: "POSTGRESQL".to_string(),
                vector_db: "PINECONE".to_string(),
                caching: None,
            },
            infrastructure: GenesisPrdInfrastructure {
                platform: "AWS".to_string(),
                containerization: "DOCKER".to_string(),
                ci_cd_tool: None,
            },
            ai_model_spec: GenesisPrdAiModelSpec {
                model_family: "GEMINI".to_string(),
                version: "1.5 Pro".to_string(),
                temperature: Some(0.7),
            },
            interface_protocols: GenesisPrdInterfaceProtocols {
                api_type: "REST".to_string(),
                auth_protocol: "JWT".to_string(),
            },
        },
    });

    // 1-C의 Role Name → ID 매핑
    let mut role_map = std::collections::HashMap::new();
    for role in &s1c.user_roles {
        role_map.insert(role.role_name.clone(), role.role_id.clone());
    }

    // Epics 변환 (required_actors → target_roles)
    let finalized_epics = s1b
        .core_epics
        .into_iter()
        .map(|e| {
            let target_roles = e
                .required_actors
                .iter()
                .map(|name| {
                    role_map
                        .get(name)
                        .cloned()
                        .unwrap_or_else(|| format!("ROLE-UNKNOWN-{}", name))
                })
                .collect();

            GenesisPrdEpic {
                epic_id: e.epic_id,
                title: e.title,
                description: e.description,
                target_roles,
                acceptance_criteria: Some(e.acceptance_criteria),
            }
        })
        .collect();

    let final_prd = GenesisPrdSchema {
        metadata: s1a.metadata,
        business_context: GenesisPrdBusinessContext {
            product_vision: s1a.product_vision,
            target_market: s1a.target_market,
            success_metrics: s1a.success_metrics,
        },
        user_roles: s1c.user_roles,
        core_epics: finalized_epics,
        global_constraints: GenesisPrdGlobalConstraints {
            compliance: s1a.global_constraints.compliance,
            performance: s1a.global_constraints.performance,
            legacy_integrations: Some(s1a.global_constraints.legacy_integrations),
        },
        tech_stack: s1c.tech_stack,
    };

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
