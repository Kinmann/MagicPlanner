use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Emitter, State};
use sqlx::{SqlitePool, Row};
// use serde_json::json;

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================
pub use crate::models::{
    Project, DocumentNode, GenerationIteration, PipelineStatusPayload,
};

// 서비스 함수 임포트
use crate::services::embedding::{call_gemini_embedding, store_document_embeddings};
use crate::services::prd_merger::{get_full_approved_prd};

// EvaluationResult is now imported from crate::schemas

// EvaluationResult is now imported from crate::schemas


#[tauri::command]
pub async fn get_project(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<Project, String> {
    let project = sqlx::query_as::<_, Project>(
        "SELECT 
            p.*,
            (SELECT COUNT(*) FROM embedding_metadata WHERE project_id = p.project_id) > 0 as is_indexed,
            (
                (SELECT COUNT(*) FROM embedding_metadata WHERE project_id = p.project_id) = 0
                OR
                EXISTS (
                    SELECT 1 FROM document_node dn
                    WHERE dn.project_id = p.project_id 
                    AND dn.node_state = 'COMPLETED'
                    AND dn.updated_at > (
                        SELECT COALESCE(MAX(created_at), '1970-01-01') 
                        FROM embedding_metadata 
                        WHERE project_id = p.project_id
                    )
                )
            ) as needs_indexing
         FROM project p 
         WHERE p.project_id = ? AND p.is_deleted = 0"
    )
    .bind(project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Project not found".to_string())?;

    Ok(project)
}


#[tauri::command]
pub async fn list_projects(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<Project>, String> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT 
            p.project_id, 
            p.session_id, 
            p.project_name, 
            p.pipeline_execution_mode, 
            p.pipeline_phase,
            p.raw_input_text, 
            p.increment_intent,
            p.created_at, 
            p.updated_at,
            (SELECT GROUP_CONCAT(target_node_type, ', ') 
             FROM (
                SELECT target_node_type 
                FROM document_node 
                WHERE project_id = p.project_id 
                  AND node_state IN ('READY', 'IN_PROGRESS', 'PAUSED_HITL', 'PAUSED_API_ERROR') 
                ORDER BY created_at ASC 
                LIMIT 2
             )) as current_node_type
         FROM project p 
         WHERE p.is_deleted = 0 
         ORDER BY p.created_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(projects)
}


#[tauri::command]
pub async fn create_project(
    pool: tauri::State<'_, SqlitePool>,
    name: String,
    mode: String,
    input_text: String,
) -> Result<String, String> {
    let project_id = Uuid::new_v4().to_string();
    let session_id = "default-session"; 
    let now = Utc::now().to_rfc3339();

    // 0. 影ｅ쐣???蘊꾬옙 ?屍귩쪟?獄???뽳옙 (FK ?帝같??邀썲쐦??容뷸떀짠)
    sqlx::query(
        "INSERT INTO user_session (session_id, is_api_key_valid, created_at, updated_at, is_deleted) 
         VALUES (?, 1, ?, ?, 0)
         ON CONFLICT(session_id) DO UPDATE SET updated_at = excluded.updated_at"
    )
    .bind(session_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1. 프로젝트 기본 정보 생성 (v2: pipeline_phase 반영)
    sqlx::query(
        "INSERT INTO project (project_id, session_id, project_name, pipeline_execution_mode, pipeline_phase, raw_input_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, 'GENESIS_PRD', ?, ?, ?, 0)"
    )
    .bind(&project_id)
    .bind(session_id)
    .bind(name)
    .bind(mode)
    .bind(input_text)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2. v2 파이프라인: Genesis PRD용 3개 초기 노드 생성 루프 대신 개별 생성
    let now = Utc::now().to_rfc3339();
    
    // 1-A: Context & Goal Builder (READY)
    let node_id_1a = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'GPRD_Context_Goal', 'GENESIS', 'READY', 0, 10, 85, 0, ?, ?, 0)"
    )
    .bind(node_id_1a)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1-B: Capability & Actor Brainstormer (PENDING)
    let node_id_1b = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'GPRD_Capability_Actor', 'GENESIS', 'PENDING', 0, 10, 85, 0, ?, ?, 0)"
    )
    .bind(node_id_1b)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1-C: Architecture & Schema Assembler (PENDING)
    let node_id_1c = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'GPRD_Architecture_Schema', 'GENESIS', 'PENDING', 0, 10, 85, 0, ?, ?, 0)"
    )
    .bind(node_id_1c)
    .bind(&project_id)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(project_id)
}


#[tauri::command]
pub async fn delete_project(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<(), String> {
    println!(">>> Hard deleting project and all associated data: {}", project_id);
    
    // 1. 벡터 데이터베이스 및 임베딩 메타데이터 삭제 (virtual table인 document_embeddings 데이터 포함)
    // rowid가 embedding_metadata와 연결되어 있으므로 서브쿼리 사용 하여 삭제 수행
    sqlx::query("DELETE FROM document_embeddings WHERE rowid IN (SELECT rowid FROM embedding_metadata WHERE project_id = ?)")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete vector embeddings: {}", e))?;

    sqlx::query("DELETE FROM embedding_metadata WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete embedding metadata: {}", e))?;

    // 2. ?占쏙옙 囹뜹쐦?껇ァ??歷ｏ옙?占쏜쬃?? ??占?- ?蘊덌옙 ?葯모쬃?납劑칳??邀썲윜劑샃 ?占쏙옙
    sqlx::query("DELETE FROM generation_iteration WHERE node_id IN (SELECT node_id FROM document_node WHERE project_id = ?)")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete generation iterations: {}", e))?;

    // 3. 나머지 관련 데이터 삭제(노드, 모듈, 전역 컨텍스트)
    sqlx::query("DELETE FROM document_node WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete document nodes: {}", e))?;

    sqlx::query("DELETE FROM local_module WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete local modules: {}", e))?;

    sqlx::query("DELETE FROM global_context WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete global contexts: {}", e))?;

    // 4. 마지막으로 프로젝트 기본 정보 삭제 (Hard Delete)
    sqlx::query("DELETE FROM project WHERE project_id = ?")
        .bind(&project_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to hard delete project: {}", e))?;

    println!(">>> Project {} and all related data purged successfully.", project_id);
    Ok(())
}


#[tauri::command]
pub async fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(())
}

// ============================================================
// v2 RAG 관련 명령어
// ============================================================


/// Gemini Embedding API 호출

/// JSON 데이터를 벡터화하여 검색 가중치와 함께 저장합니다. (노드 및 전역 컨텍스트)

/// 프로젝트 내의 모든 성공 노드들을 순회하며 벡터 데이터를 DB에 동기화

/// 프로젝트 내의 모든 성공 노드 및 변경된 노드들을 찾아 벡터 데이터를 DB에 업데이트 하거나 추가함
#[tauri::command]
pub async fn index_project_embeddings(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    client: State<'_, Client>,
    project_id: String,
    api_key: String,
) -> Result<i32, String> {
    // 0. API ??縕먩른占?(壅э옙弟릎?占쏙옙 囹띈땃容?DB??좑옙 邀썲쟿占?
    let mut actual_api_key = api_key;
    if actual_api_key.trim().is_empty() {
        println!(">>> [index_project_embeddings] API key is empty, fetching from DB...");
        let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
            .fetch_optional(&*pool).await.map_err(|e| e.to_string())?;
        
        actual_api_key = match session_res {
            Some(row) => row.get::<String, _>("api_key_encrypted"),
            None => return Err("API 키가 설정되지 않았습니다. 설정에서 API 키를 등록해 주세요.".to_string()),
        };
    }
    let api_key = actual_api_key; // 소유권 이전으로 인한 섀도잉

    // 1. 프로젝트 내의 모든 완료된 성공 노드들 조회
    // [주의] 인덱싱이 필요한 대상: 컴플리트 상태이면서 아직 인덱싱되지 않았거나 업데이트된 노드들
    let nodes = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node 
         WHERE project_id = ? 
         AND node_state = 'COMPLETED'
         AND (
            updated_at > (
                SELECT COALESCE(MAX(created_at), '1970-01-01') 
                FROM embedding_metadata 
                WHERE project_id = ?
            )
            OR
            node_id NOT IN (SELECT DISTINCT node_id FROM embedding_metadata WHERE project_id = ?)
         )"
    )
    .bind(&project_id)
    .bind(&project_id)
    .bind(&project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    let mut indexed_count = 0;
    let mut has_genesis = false;
    let mut genesis_node_id = None;
    
    for node in nodes {
        if node.node_category == "GENESIS" {
            has_genesis = true;
            // 1-C(Architecture_Schema) 노드를 제네시스의 대표 노드로 활용하여 ID 확보, 만약 없다면 첫 번째 GENESIS 노드 활용
            if genesis_node_id.is_none() || node.target_node_type == "GPRD_Architecture_Schema" {
                genesis_node_id = Some(node.node_id.clone());
            }
            continue;
        }

        // 현재 진행 상태 업데이트: 프론트엔드 통지용
        let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
            message: format!("[{}] RAG 저장 진행 중..", node.target_node_type),
            node_id: node.node_id.clone(),
            node_type: node.target_node_type.clone(),
            project_id: project_id.clone(),
            level: "INFO".into(),
            status: "EMBEDDING_START".into(),
            current_iteration: None,
            max_iterations: None,
        });
        let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("RAG 저장 중...")
            .bind(Utc::now().to_rfc3339())
            .bind(&node.node_id)
            .execute(&*pool)
            .await;
        let _ = app_handle.emit("nodes-updated", ());

        // 2. 해당 노드의 최적 이터레이션(베스트 스코어) 데이터 조회
        let best_iter = sqlx::query_as::<_, GenerationIteration>(
            "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY calculated_score DESC, created_at DESC LIMIT 1"
        )
        .bind(&node.node_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
        if let Some(iter) = best_iter {
            // 벡터화 진행
            let embedding_res = store_document_embeddings(
                &*pool, &*client, &api_key,
                &project_id, node.module_id.as_deref(),
                &node.node_id, &node.target_node_type,
                &iter.iteration_id, &iter.generated_draft_json,
                iter.calculated_score.unwrap_or(0),
            ).await;
            
            match embedding_res {
                Ok(_) => {
                    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
                        message: format!("[{}] RAG 저장 완료", node.target_node_type),
                        node_id: node.node_id.clone(),
                        node_type: node.target_node_type.clone(),
                        project_id: project_id.clone(),
                        level: "SUCCESS".into(),
                        status: "EMBEDDING_COMPLETE".into(),
                        current_iteration: None,
                        max_iterations: None,
                    });
                    indexed_count += 1;
                },
                Err(e) => {
                    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
                        message: format!("[{}] RAG 저장 실패", node.target_node_type),
                        node_id: node.node_id.clone(),
                        node_type: node.target_node_type.clone(),
                        project_id: project_id.clone(),
                        level: "ERROR".into(),
                        status: "EMBEDDING_FAILED".into(),
                        current_iteration: None,
                        max_iterations: None,
                    });
                    println!(">>> [RAG-Index] {} failed: {}", node.target_node_type, e);
                }
            }
        }

        // 상태 초기화
        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
            .bind(Utc::now().to_rfc3339())
            .bind(&node.node_id)
            .execute(&*pool)
            .await;
        let _ = app_handle.emit("nodes-updated", ());
    }

    // 3. GPRD 통합 문서 인덱싱 (개별 노드들과는 별개로 전역 맥락을 위해 처리)
    if has_genesis {
        let full_prd = get_full_approved_prd(&*pool, &project_id).await;
        if full_prd != "{}" && !full_prd.is_empty() {
            // 대표 ID가 여러 개일 수 있으나 하나를 지정하여 매핑하며 전체 문서 내용 로드
            let rep_id = match genesis_node_id {
                Some(id) => id,
                None => {
                    sqlx::query_scalar("SELECT node_id FROM document_node WHERE project_id = ? AND node_category = 'GENESIS' LIMIT 1")
                        .bind(&project_id).fetch_one(&*pool).await.map_err(|e| e.to_string())?
                }
            };

            // 현재 진행 상태 업데이트: 통합 PRD RAG 인덱싱 시작
            let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
                message: "통합 PRD RAG 저장 진행 중..".into(),
                node_id: rep_id.clone(),
                node_type: "Genesis_PRD".into(),
                project_id: project_id.clone(),
                level: "INFO".into(),
                status: "EMBEDDING_START".into(),
                current_iteration: None,
                max_iterations: None,
            });
            let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind("통합 RAG 저장 중...")
                .bind(Utc::now().to_rfc3339())
                .bind(&rep_id)
                .execute(&*pool)
                .await;
            let _ = app_handle.emit("nodes-updated", ());

            // [주의] hardcoded "integrated-prd" 타입으로 지정하여 임베딩 시 iteration_id를 조회하여 소유권 매핑 (FK 제약 조건 충족)
            let best_genesis_it: String = sqlx::query_scalar(
                "SELECT iteration_id FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY is_pass DESC, calculated_score DESC LIMIT 1"
            )
            .bind(&rep_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| format!("Genesis iteration lookup error: {}", e))?;

            let embedding_res = store_document_embeddings(
                &*pool, &*client, &api_key,
                &project_id, None,
                &rep_id, "Genesis_PRD",
                &best_genesis_it, &full_prd,
                100, // 통합본은 베스트 스코어로 임의 지정
            ).await;

            match embedding_res {
                Ok(_) => {
                    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
                        message: "통합 PRD RAG 저장 완료".into(),
                        node_id: rep_id.clone(),
                        node_type: "Genesis_PRD".into(),
                        project_id: project_id.clone(),
                        level: "SUCCESS".into(),
                        status: "EMBEDDING_COMPLETE".into(),
                        current_iteration: None,
                        max_iterations: None,
                    });
                    indexed_count += 1;
                },
                Err(e) => {
                    let _ = app_handle.emit("pipeline-status", PipelineStatusPayload {
                        message: "통합 PRD RAG 저장 실패".into(),
                        node_id: rep_id.clone(),
                        node_type: "Genesis_PRD".into(),
                        project_id: project_id.clone(),
                        level: "ERROR".into(),
                        status: "EMBEDDING_FAILED".into(),
                        current_iteration: None,
                        max_iterations: None,
                    });
                    println!(">>> [RAG-Index] Integrated PRD failed: {}", e);
                }
            }

            // 상태 초기화
            let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                .bind(Utc::now().to_rfc3339())
                .bind(&rep_id)
                .execute(&*pool)
                .await;
            let _ = app_handle.emit("nodes-updated", ());
        }
    }
    
    Ok(indexed_count as i32)
}


/// RAG 검색 및 검색된 컨텍스트를 프롬프트에 결합하기 위한 보조 함수 (백엔드 내부용)

/// 특정 노드의 기존 데이터와 변경 의도 간의 교집합(유사도)을 판별합니다.

/// RAG 검색을 수행하는 Tauri 명령어
#[tauri::command]
pub async fn search_similar_documents(
    pool: State<'_, SqlitePool>,
    client: State<'_, Client>,
    project_id: String,
    api_key: String,
    query: String,
    limit: i32,
) -> Result<Vec<serde_json::Value>, String> {
    let query_vector: Vec<f32> = call_gemini_embedding(&*client, &api_key, &query, "RETRIEVAL_QUERY").await
        .map_err(|e| format!("Query embedding error: {:?}", e))?;
    let query_json = serde_json::to_string(&query_vector).unwrap_or_default();

    let rows = sqlx::query(
        "SELECT m.chunk_text, m.node_type, m.node_id, v.distance 
         FROM document_embeddings v
         JOIN embedding_metadata m ON v.rowid = m.rowid
         WHERE v.embedding MATCH ? AND k = ? AND m.project_id = ?
         ORDER BY v.distance ASC"
    )
    .bind(&query_json)
    .bind(limit)
    .bind(project_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Search error: {}", e))?;

    let results = rows.into_iter().map(|row| {
        let text: String = row.get(0);
        let ntype: String = row.get(1);
        let nid: String = row.get(2);
        let dist: f64 = row.get(3);
        serde_json::json!({
            "text": text,
            "node_type": ntype,
            "node_id": nid,
            "similarity": 1.0 - dist
        })
    }).collect();


    Ok(results)
}

