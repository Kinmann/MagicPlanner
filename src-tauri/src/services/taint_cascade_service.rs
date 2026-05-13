use reqwest::Client;
use chrono::Utc;
use sqlx::{SqlitePool, Row};
use serde_json::Value;

pub use crate::models::{
    Project, DocumentNode, GenerationIteration,
    GlobalContext, PipelineStatusPayload,
};

use crate::services::embedding::check_node_intersection;
use crate::services::node_query::resolve_node_by_canonical_id;

use crate::services::artifact_mapping::extract_mapped_ids;

pub async fn apply_taint_cascade_logic(_app_handle: tauri::AppHandle, pool: tauri::State<'_, sqlx::SqlitePool>, _client: tauri::State<'_, reqwest::Client>, payload: crate::commands::refinement::TaintCascadePayload) -> Result<crate::schemas::TaintCascadeSchema, String> { let crate::commands::refinement::TaintCascadePayload { api_key: _api_key, project_id, intent: _intent, targets, router_decision: _router_decision } = payload;
    println!("[TAINT-CASCADE] 🧪 Starting Table-Driven Cascade for targets: {:?}", targets);

    let mut impact_map: std::collections::HashMap<String, crate::schemas::TaintImpactItem> = std::collections::HashMap::new();
    let mut collected_artifact_ids = std::collections::HashSet::new();
    let mut target_node_ids = std::collections::HashSet::new();

    // 1. 초기 타겟 분석 및 직접 영향 기록
    for t in &targets {
        // targets 형식: "Module:Type:ID" 또는 "Module:Type"
        if let Some((node_id, node_type)) = resolve_node_by_canonical_id(&pool, &project_id, t).await {
            target_node_ids.insert(node_id.clone());
            
            let parts: Vec<&str> = t.split(':').collect();
            let target_val = if parts.len() >= 3 { parts[2].to_uppercase() } else { "".to_string() };

            impact_map.entry(node_id.clone()).or_insert_with(|| crate::schemas::TaintImpactItem {
                node_id: node_id.clone(),
                node_type: node_type.clone(),
                block_ids: if target_val.is_empty() { Vec::new() } else { vec![target_val.clone()] },
                block_paths: Vec::new(),
                reason: "Direct Modification Target".to_string(),
                similarity_score: Some(1.0),
            });

            // 타겟 노드의 데이터에서 관련 ID 수집 (전파용 소스)
            let latest_json: Option<String> = sqlx::query_scalar(
                "SELECT generated_draft_json FROM generation_iteration WHERE node_id = ? AND is_pass = 1 ORDER BY iteration_number DESC LIMIT 1"
            ).bind(&node_id).fetch_optional(&*pool).await.map_err(|e| e.to_string())?;

            if let Some(json_str) = latest_json {
                if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                    // 정의된 ID들 추출
                    for id in crate::services::embedding::extract_artifact_ids_from_value(&val) {
                        collected_artifact_ids.insert(id.to_uppercase());
                    }
                    // 참조된(mapped_) ID들 추출
                    for id in extract_mapped_ids(&val) {
                        collected_artifact_ids.insert(id.to_uppercase());
                    }
                }
            }
            
            // 명시적인 타겟 블록 ID가 있다면 추가 수집
            if !target_val.is_empty() {
                collected_artifact_ids.insert(target_val);
            }
        }
    }

    // 2. 기계적 전파 (artifact_mapping 활용)
    if !collected_artifact_ids.is_empty() {
        let id_list: Vec<String> = collected_artifact_ids.into_iter().collect();
        println!("[TAINT-CASCADE] 🔍 Propagating from {} artifact IDs", id_list.len());

        // 해당 ID들을 참조하거나 정의하는 모든 다른 노드들 조회
        let query = format!(
            "SELECT DISTINCT am.node_id, dn.target_node_type, am.artifact_id, am.json_path \
             FROM artifact_mapping am \
             JOIN document_node dn ON am.node_id = dn.node_id \
             WHERE am.artifact_id IN ({}) AND am.project_id = ? AND dn.is_deleted = 0",
            id_list.iter().map(|_| "?").collect::<Vec<_>>().join(",")
        );

        let mut q = sqlx::query(&query);
        for id in &id_list { q = q.bind(id); }
        q = q.bind(&project_id);

        let rows = q.fetch_all(&*pool).await.map_err(|e| e.to_string())?;

        for row in rows {
            let nid: String = row.get(0);
            let ntype: String = row.get(1);
            let aid: String = row.get(2);
            let path: String = row.get(3);

            // 자기 자신은 제외 (이미 직접 타겟으로 등록됨)
            if target_node_ids.contains(&nid) { continue; }

            let entry = impact_map.entry(nid.clone()).or_insert_with(|| crate::schemas::TaintImpactItem {
                node_id: nid,
                node_type: ntype,
                block_ids: Vec::new(),
                block_paths: Vec::new(),
                reason: "Cascaded via Artifact Mapping".to_string(),
                similarity_score: None, // 후처리(Confirm) 단계에서 필요 시 계산됨
            });

            if !entry.block_ids.contains(&aid) {
                entry.block_ids.push(aid);
                entry.block_paths.push(path);
            }
        }
    }

    // 3. 상태 요약 및 결과 반환
    let mut stale_count = 0;
    let mut impact_count = 0;
    let mut impacts = Vec::new();

    for (node_id, impact) in impact_map {
        let node_state: String = sqlx::query_scalar("SELECT node_state FROM document_node WHERE node_id = ?")
            .bind(&node_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?;
        
        if node_state == "COMPLETED" { stale_count += 1; }
        impact_count += (impact.block_ids.len().max(1)) as i32; 
        impacts.push(impact);
    }

    println!("[TAINT-CASCADE] ✅ Cascade complete. Stale: {}, Impacted Nodes: {}", stale_count, impacts.len());
    Ok(crate::schemas::TaintCascadeSchema { impacts, stale_count, impact_count })
}

pub async fn confirm_taint_cascade_logic(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    intent: crate::schemas::IntentSchema,
    cascade_result: crate::schemas::TaintCascadeSchema,
) -> Result<(), String> {
    println!("[CONFIRM-CASCADE] 💾 Final Approval Received. Applying to DB with precision filtering...");
    let now = Utc::now().to_rfc3339();
    
    // 인텐트에서 모든 대상 블록 ID와 통합 설명 추출
    let mut intent_target_ids = std::collections::HashSet::new();
    for i in &intent.intents {
        for bid in &i.target_block_ids {
            intent_target_ids.insert(bid.to_uppercase());
        }
    }
    let intent_full_description = intent.intents.iter()
        .map(|i| i.action_description.as_str())
        .collect::<Vec<_>>()
        .join(" ");

    // 1. [Pre-Transaction Phase] 모든 상태 전이 여부를 트랜잭션 밖에서 미리 판별
    // 네트워크 호출(임베딩)이나 복잡한 연산을 tx 시작 전에 끝냄
    let mut transition_results = Vec::new();

    for impact in cascade_result.impacts {
        let mut should_transition = false;
        let mut transition_reason = String::new();

        // [Step 0] 기본 정보 로드
        let node_info: (String, Option<String>) = sqlx::query_as(
            "SELECT node_state, (SELECT generated_draft_json FROM generation_iteration WHERE node_id = dn.node_id AND is_pass = 1 ORDER BY iteration_number DESC LIMIT 1) \
             FROM document_node dn WHERE node_id = ?"
        )
        .bind(&impact.node_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let current_state = node_info.0;
        let node_json = node_info.1.unwrap_or_default();

        // [Step 1] 상태 기반 체크 (기존 COMPLETED 노드는 무조건 오염)
        if current_state == "COMPLETED" {
            should_transition = true;
            transition_reason = "[Stale: Completed Status]".to_string();
        }

        // [Step 2] ID 매칭 기반 체크 (본문에 인텐트 관련 ID가 포함되어 있는가?)
        if !should_transition && !node_json.is_empty() {
            let node_ids = crate::services::embedding::extract_artifact_ids(&node_json);
            let intersection: Vec<_> = intent_target_ids.intersection(&node_ids).collect();
            
            if !intersection.is_empty() {
                should_transition = true;
                transition_reason = format!("[Stale: ID Match ({:?})]", intersection);
            }
        }

        // [Step 3] 유사도 기반 체크 (ID 매칭 실패 시에만 수행 - 최적화)
        if !should_transition {
            // Taint Cascade 단계에서 이미 계산된 점수가 있다면 재사용
            let similarity = if let Some(score) = impact.similarity_score {
                score
            } else if !intent_full_description.is_empty() {
                // 점수가 없는 경우(예: 직접 타겟)에만 트랜잭션 밖에서 계산
                check_node_intersection(&pool, &client, &api_key, &project_id, &impact.node_id, &intent_full_description).await.unwrap_or(0.0)
            } else {
                0.0
            };

            if similarity > 0.2 {
                should_transition = true;
                transition_reason = format!("[Stale: Semantic Similarity ({:.2})]", similarity);
            }
        }

        let final_reason = format!("{} | Tainted: {:?} | Reason: {}", transition_reason, impact.block_ids, impact.reason);
        transition_results.push((impact.node_id, should_transition, final_reason));
    }

    // 2. [Transaction Phase] 확정된 결과만 DB에 일괄 반영
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Intent 저장
    sqlx::query("UPDATE project SET increment_intent = ?, updated_at = ? WHERE project_id = ?")
        .bind(serde_json::to_string(&intent).unwrap_or_default())
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let mut stale_nodes_for_reset = Vec::new();

    for (node_id, should_transition, final_reason) in transition_results {
        if should_transition {
            // 노드 타입과 모듈 ID 조회를 위해 미리 쿼리
            let node_info: (String, Option<String>) = sqlx::query_as("SELECT target_node_type, module_id FROM document_node WHERE node_id = ?")
                .bind(&node_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

            sqlx::query(
                "UPDATE document_node SET node_state = 'STALE', last_action = ?, updated_at = ? WHERE node_id = ?"
            )
            .bind(&final_reason)
            .bind(&now)
            .bind(&node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            stale_nodes_for_reset.push((node_info.0, node_info.1));
        } else {
            sqlx::query(
                "UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?"
            )
            .bind(format!("[Impacted] {}", final_reason))
            .bind(&now)
            .bind(&node_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // [Safety] 오염된 노드들의 하위 READY 노드들을 PENDING으로 리셋
    for (node_type, module_id) in stale_nodes_for_reset {
        if let Some(mid) = module_id {
            let _ = crate::services::dag_engine::reset_module_downstream_ready_nodes(&app_handle, &mid, &node_type).await;
        } else {
            let _ = crate::services::dag_engine::reset_downstream_ready_nodes(&app_handle, &project_id, &node_type).await;
        }
    }

    Ok(())
}

