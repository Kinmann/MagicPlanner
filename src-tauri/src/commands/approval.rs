use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Manager, Emitter};
use sqlx::{SqlitePool, Row};

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================
pub use crate::models::{
    RagErrorInfo, DocumentNode, GenerationIteration,
};

// 서비스 함수 임포트
use crate::services::embedding::store_document_embeddings;
use crate::services::prd_merger::{get_full_approved_prd};
use crate::services::dag_engine::trigger_next_nodes;
use crate::commands::module::create_local_modules;

// EvaluationResult is now imported from crate::schemas

// EvaluationResult is now imported from crate::schemas


/// Genesis PRD HITL ?野?쪟???SAD ???쬃?킒占쏙옙 ?占쏙옙 + SAD ?蘊덌옙 ??뽳옙
#[tauri::command]
pub async fn confirm_genesis_prd_iteration(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Confirming Genesis PRD iteration: {} for project: {}", iteration_id, project_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. ?歷좈컾 ?歷ｏ옙?占쏜쬃???쬃??驛곻옙 ?蘊덌옙??獄덂댖占??歷ｏ옙?占쏜쬃??is_pass 容뺧옙???(??덃뼢 ?轝좑옙?歷? 令덌옙占?獄삥떀?)
    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = (SELECT node_id FROM generation_iteration WHERE iteration_id = ?)")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. ?靜쪊占???歷ｏ옙?占쏜쬃??わ옙 is_pass = 1 ??⑨옙
    sqlx::query("UPDATE generation_iteration SET is_pass = 1, updated_at = ? WHERE iteration_id = ?")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}


/// Genesis PRD 令덂텈占??蘊덌옙 ?野?쪟?(SAD?占??邕ㆀ쫱????믭옙 ?帝걟??
#[tauri::command]
pub async fn approve_genesis_prd_node(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    node_id: String,
    api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving Genesis PRD node: {}, api_key_provided: {}", node_id, api_key.is_some());

    let now = Utc::now().to_rfc3339();

    // 1. ?蘊덌옙 ??낂쇃 邀썲쟿占?(project_id?占?target_node_type ??낂쇃)
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Node not found".to_string())?;

    // 2. ?蘊덌옙 ?占쏙옙獄?COMPLETED獄?縕먲옙囹?
    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
    )
    .bind(&now)
    .bind(&node_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. ??⑨옙 ?蘊덌옙 ?蘊덃뵸令?(Stage 1 -> Stage 2 ??
    trigger_next_nodes(app_handle, &node.project_id, &node.target_node_type).await?;

    Ok(())
}


#[tauri::command]
pub async fn approve_genesis_prd(
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    app_handle: tauri::AppHandle,
    api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving Genesis PRD for project: {}, api_key_provided: {}", project_id, api_key.is_some());

    let now = Utc::now().to_rfc3339();

    // 1. GPRD_Architecture_Schema (容뽴?곤옙 ??뤄옙) ??믭옙 影ｅ윜??Genesis_PRD ?蘊덌옙獄?COMPLETED獄?縕먲옙囹?
    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE project_id = ? AND target_node_type IN ('Genesis_PRD', 'GPRD_Architecture_Schema')"
    )
    .bind(&now)
    .bind(&project_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1.1 ???쪛 PRD ??잟쬃????뽳옙 (1-A + 1-B + 1-C 縕먳짉숃쪛)
    let full_prd = get_full_approved_prd(&*pool, &project_id).await;
    
    // 1.2 容뽴?곤옙 ?蘊덌옙 ??껓옙 (RAG ??뗧썟??
    let final_node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE project_id = ? AND target_node_type IN ('GPRD_Architecture_Schema', 'Genesis_PRD') ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&project_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Final GPRD node not found".to_string())?;

    let latest_it = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_deleted = 0 ORDER BY is_pass DESC, calculated_score DESC LIMIT 1"
    )
    .bind(&final_node.node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    println!(">>> Genesis PRD approved. Shifted to SAD Global phase for project: {}", project_id);
    let _ = app_handle.emit("nodes-updated", ());

    // [縕먲옙囹? RAG ?占쏙옙???占썹???占쏜쬃?辱욃맋占?SAD ??뤄옙獄??占쏙옙 (UI ??ｄ???令덍?곤옙)
    let _ = actual_approve_genesis_prd(&app_handle, &*pool, &project_id).await;

    // RAG ?占쏙옙??獄삥쥞繹?逆곧쟼??墉?겒?? ???쪛縕먫퀎占???곧쫱?獄↑퀎占썼ア???ｐ쪟?
    if let Some(it) = latest_it {
        let pool_clone = pool.inner().clone();
        let app_handle_clone = app_handle.clone();
        let project_id_clone = project_id.clone();
        let node_id_clone = final_node.node_id.clone();
        let node_type_clone = final_node.target_node_type.clone();
        let iteration_id_clone = it.iteration_id.clone();
        let score = it.calculated_score.unwrap_or(0);

        tauri::async_runtime::spawn(async move {
            let client = app_handle_clone.state::<Client>();
            
            // 1. ?蘊꾬옙獄????㈇??????잞옙 ?燁묌뭘, ?占썲컧獄?DB??좑옙 邀썲쟿占?
            let mut actual_api_key = api_key;
            if actual_api_key.as_deref().unwrap_or("").trim().is_empty() {
                let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
                    .fetch_optional(&pool_clone).await;
                
                actual_api_key = match session_res {
                    Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
                    _ => None,
                };
            }

            let api_key_str = match actual_api_key {
                Some(key) if !key.trim().is_empty() => key,
                _ => {
                    println!(">>> [RAG-BG] No API key found in args or DB. Aborting embedding.");
                    return;
                }
            };


            let _ = app_handle_clone.emit("pipeline-status", "전체 PRD RAG 임베딩 진행 중...");
            let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
                .bind("전체 RAG 임베딩 중...")
                .bind(Utc::now().to_rfc3339())
                .bind(&node_id_clone)
                .execute(&pool_clone)
                .await;
            let _ = app_handle_clone.emit("nodes-updated", ());

            // [??숎줎? get_full_approved_prd 囹뜹쐦?껇ァ?full_prd)????ｐ쪟???ㄹ?辱쀧궍???帝걟??
            let embedding_res = store_document_embeddings(
                &pool_clone, &*client, &api_key_str,

                &project_id_clone, None,
                &node_id_clone, &node_type_clone,
                &iteration_id_clone, &full_prd,
                score,
            ).await;

            match embedding_res {
                Ok(_) => {
                    let _ = app_handle_clone.emit("pipeline-status", "전체 PRD 임베딩 완료");
                    let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
                        .bind(Utc::now().to_rfc3339())
                        .bind(&node_id_clone)
                        .execute(&pool_clone)
                        .await;
                    let _ = app_handle_clone.emit("nodes-updated", ());
                },
                Err(e) => {
                    let err_msg = format!("전체 PRD RAG 임베딩 실패 {}", e);
                    println!(">>> [RAG-BG] {}", err_msg);
                    
                    let error_info = RagErrorInfo {
                        project_id: project_id_clone,
                        node_id: node_id_clone,
                        node_type: node_type_clone,
                        error_message: e.to_string(),
                    };
                    let _ = app_handle_clone.emit("rag-error", error_info);
                    let _ = app_handle_clone.emit("pipeline-status", "전체 PRD 임베딩 실패(수동 중단)");
                }
            }
        });
    }

    Ok(())
}

/// ??⑨옙 Genesis PRD ?野?쪟?墉?겒??獄??곤옙 (?占쏙옙???歟볣솷 ???蘊꾬옙)
pub async fn actual_approve_genesis_prd(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
    project_id: &str,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    // 1. ?占쏙옙??틶??pipeline_phase獄?SAD獄??占쏙옙
    sqlx::query(
        "UPDATE project SET pipeline_phase = 'SAD', updated_at = ? WHERE project_id = ?"
    )
    .bind(&now)
    .bind(project_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2. SAD 影ｏ옙獄℡텈占??℡댃占?轝졽궩 ?蘊덌옙 ??뽳옙
    let global_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'SAD_Global', 'SAD', 'READY', 0, 5, 80, 0, ?, ?, 0)"
    )
    .bind(global_node_id)
    .bind(project_id)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. SAD 獄덂댖占?蘊깍옙占??蘊덌옙 ??뽳옙 (PENDING ?占쏙옙獄???뽳옙???ㄹ?DAG ?帝굛占?
    let module_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO document_node (node_id, project_id, module_id, target_node_type, node_category, node_state, current_iteration, max_iterations, threshold_score, current_best_score, created_at, updated_at, is_deleted) VALUES (?, ?, NULL, 'SAD_Module', 'SAD', 'PENDING', 0, 5, 80, 0, ?, ?, 0)"
    )
    .bind(module_node_id)
    .bind(project_id)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}


/// ?靜쪊占??SAD ?歷ｏ옙?占쏜쬃???옙 囹멱썦占??℡댃占?轝졽궩獄??屍귨옙
#[tauri::command]
pub async fn confirm_sad_iteration(
    _app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Confirming SAD iteration: {} for project: {}", iteration_id, project_id);
    
    // 1. ?葯면━ ??낂쇃 邀썲쟿占?
    let iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "?葯면━ ??낂쇃獄?墉녷㉩占????占쏜졐?占쏜졊?".to_string())?;

    // 2. 縕믭옙褶⑵イ占쏙옙 JSON ?葯멥삖
    let bundle: serde_json::Value = serde_json::from_str(&iteration.generated_draft_json)
        .map_err(|e| format!("??잟쬃???葯멥삖 ??덌옙: {}", e))?;

    let now = Utc::now().to_rfc3339();
    let it_number = iteration.iteration_number;

    // 3. ?蘊덌옙??占??帝같占?
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 4. 影ｅ윜???℡댃占?轝졽궩 ??占?(?逆뷸뵸 ??占?
    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ?")
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 4-1. ?歷좈컾 ?蘊덌옙??獄덂댖占??歷ｏ옙?占쏜쬃??is_pass 容뺧옙??????占쏙옙 ?葯면━獄?1獄???⑨옙
    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE node_id = ?")
        .bind(&now)
        .bind(&iteration.node_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE generation_iteration SET is_pass = 1, updated_at = ? WHERE iteration_id = ?")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 5. ???℡댃占?轝졽궩 ?擁ｏ옙
    if let Some(obj) = bundle.as_object() {
        for (ctx_type, data) in obj {
            let ctx_id = Uuid::new_v4().to_string();
            let data_str = if data.is_string() { data.as_str().unwrap().to_string() } else { data.to_string() };
            
            sqlx::query(
                "INSERT INTO global_context (context_id, project_id, iteration_id, context_type, context_data_json, version, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
            )
            .bind(&ctx_id).bind(&project_id).bind(&iteration_id).bind(ctx_type).bind(data_str).bind(it_number).bind(&now).bind(&now)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    // 6. ?蘊덌옙??容뽴?곤옙 ??좑옙 ?占썬ゲ?歷ｄ궩 (?占쏙옙??PAUSED_HITL ?劑뵳????ㄹ?獄덌옙占???野?쪟??占썹??
    let _node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&iteration.node_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE document_node SET current_best_score = ?, updated_at = ? WHERE node_id = ?"
    )
    .bind(iteration.calculated_score)
    .bind(&now)
    .bind(&iteration.node_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = _app_handle.emit("nodes-updated", ());
    println!(">>> SAD Iteration {} confirmed (is_pass=1) for project: {}", iteration_id, project_id);
    Ok(())
}


/// ?屍귨옙???歷ｏ옙?占쏜쬃???옙 庸믣댆占?
#[tauri::command]
pub async fn unconfirm_iteration(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    iteration_id: String,
) -> Result<(), String> {
    println!(">>> Unconfirming iteration: {} for project: {}", iteration_id, project_id);
    let now = Utc::now().to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. ?歷좈컾 ?歷ｏ옙?占쏜쬃????낂쇃 邀썲쟿占?
    let _iteration = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE iteration_id = ?"
    )
    .bind(&iteration_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "?葯면━ ??낂쇃獄?墉녷㉩占????占쏜졐?占쏜졊?".to_string())?;

    // 2. is_pass獄?0?逆븝옙 縕먲옙囹?
    sqlx::query("UPDATE generation_iteration SET is_pass = 0, updated_at = ? WHERE iteration_id = ?")
        .bind(&now)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 3. SAD 囹듸옙??玉붺┷占?占쏜쫱?囹띈땃容???뗧썟??global_context ?逆뷸뵸 ??占?
    // version(iteration_number)?占?iteration_id獄?影ｅ쐣占?逆븝옙 ??占?
    sqlx::query("UPDATE global_context SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND iteration_id = ?")
        .bind(&now)
        .bind(&project_id)
        .bind(&iteration_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = app_handle.emit("nodes-updated", ());
    println!(">>> Iteration {} unconfirmed (is_pass=0) for project: {}", iteration_id, project_id);
    Ok(())
}


/// SAD ??뤄옙???蘊덌옙(Global ??믭옙 Module)獄?容뽴?곤옙 ?野?쪟?墉?겒??
#[tauri::command]
pub async fn approve_sad_node(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    node_id: String,
    api_key: Option<String>,
) -> Result<(), String> {
    println!(">>> Approving SAD node: {} for project: {}, api_key_provided: {}", node_id, project_id, api_key.is_some());

    let now = Utc::now().to_rfc3339();

    // 1. ?蘊덌옙 ??낂쇃 邀썲쟿占?
    let node = sqlx::query_as::<_, DocumentNode>(
        "SELECT * FROM document_node WHERE node_id = ?"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "?蘊덌옙 ??낂쇃獄?墉녷㉩占????占쏜졐?占쏜졊?".to_string())?;

    // 2. ?屍귨옙??is_pass=1) ?歷ｏ옙?占쏜쬃???쬃??占쏙옙辱뷂옙 ?屍귩쪟?
    let confirmed_iter = sqlx::query_as::<_, GenerationIteration>(
        "SELECT * FROM generation_iteration WHERE node_id = ? AND is_pass = 1 AND is_deleted = 0 LIMIT 1"
    )
    .bind(&node_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "?屍귨옙??玉붺┷占?占쏜쬃??占쏜졐?占쏜졊? 獄잍쉼? 玉붺┷占?占쏙옙 ?屍귨옙??辱ζ쉼占??".to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 3. ?蘊덌옙 ?占쏙옙獄?COMPLETED獄?縕먲옙囹?
    sqlx::query(
        "UPDATE document_node SET node_state = 'COMPLETED', updated_at = ? WHERE node_id = ?"
    )
    .bind(&now)
    .bind(&node_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // [RAG] ?野?쪟??SAD ?蘊덌옙 ?占쏙옙??獄??곤옙??獄삥쥞繹?逆곧쟼?蒻낉옙 ?占쏙옙 (DB Lock 獄삥떀?)
    let pool_clone = pool.inner().clone();
    let app_handle_clone = app_handle.clone();
    let project_id_clone = project_id.clone();
    let node_id_for_bg = node.node_id.clone();
    let node_type_for_bg = node.target_node_type.clone();
    let iteration_id_for_bg = confirmed_iter.iteration_id.clone();
    let draft_json_for_bg = confirmed_iter.generated_draft_json.clone();
    let score_for_bg = confirmed_iter.calculated_score.unwrap_or(0);

    tauri::async_runtime::spawn(async move {
        let client = app_handle_clone.state::<Client>();
        
        // 1. ?蘊꾬옙獄????㈇??????잞옙 ?燁묌뭘, ?占썲컧獄?DB??좑옙 邀썲쟿占?
        let mut actual_api_key = api_key;
        if actual_api_key.as_deref().unwrap_or("").trim().is_empty() {
            let session_res = sqlx::query("SELECT api_key_encrypted FROM user_session WHERE session_id = 'default-session' AND is_deleted = 0")
                .fetch_optional(&pool_clone).await;
            
            actual_api_key = match session_res {
                Ok(Some(row)) => Some(row.get::<String, _>("api_key_encrypted")),
                _ => None,
            };
        }

        let api_key_str = match actual_api_key {
            Some(key) if !key.trim().is_empty() => key,
            _ => {
                println!(">>> [RAG-BG] No API key found in args or DB. Aborting embedding for SAD node.");
                return;
            }
        };


        let _ = app_handle_clone.emit("pipeline-status", "SAD RAG 임베딩 진행 중...");
        let _ = sqlx::query("UPDATE document_node SET last_action = ?, updated_at = ? WHERE node_id = ?")
            .bind("RAG 임베딩 중...")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id_for_bg)
            .execute(&pool_clone)
            .await;
        let _ = app_handle_clone.emit("nodes-updated", ());

        let embedding_res = store_document_embeddings(
            &pool_clone, &*client, &api_key_str,

            &project_id_clone, None,
            &node_id_for_bg, &node_type_for_bg,
            &iteration_id_for_bg, &draft_json_for_bg,
            score_for_bg,
        ).await;

        match embedding_res {
            Ok(_) => {
                let _ = app_handle_clone.emit("pipeline-status", "SAD ?占쏙옙???占쏙옙");
            },
            Err(e) => {
                let err_msg = format!("SAD RAG 임베딩 실패({}): {}", node_type_for_bg, e);
                println!(">>> [RAG-BG] {}", err_msg);
                
                let error_info = RagErrorInfo {
                    project_id: project_id_clone,
                    node_id: node_id_for_bg.clone(),
                    node_type: node_type_for_bg,
                    error_message: e.to_string(),
                };
                let _ = app_handle_clone.emit("rag-error", error_info);
            }
        }

        // ?占쏙옙 容뺧옙???
        let _ = sqlx::query("UPDATE document_node SET last_action = NULL, updated_at = ? WHERE node_id = ?")
            .bind(Utc::now().to_rfc3339())
            .bind(&node_id_for_bg)
            .execute(&pool_clone)
            .await;
        let _ = app_handle_clone.emit("nodes-updated", ());
    });

    // 4. ??⑨옙 ??뤄옙 ?帝같占??墉?겒??
    if node.target_node_type == "SAD_Global" {
        // SAD_Module ?蘊덌옙獄?READY獄??占쏙옙
        sqlx::query(
            "UPDATE document_node SET node_state = 'READY', updated_at = ? WHERE project_id = ? AND target_node_type = 'SAD_Module' AND node_state = 'PENDING'"
        )
        .bind(&now)
        .bind(&project_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        println!(">>> SAD_Global approved. SAD_Module is now READY.");
    } else if node.target_node_type == "SAD_Module" {
        println!(">>> SAD_Module approved. Triggering local module creation...");
        // ?屍귨옙???歷ｏ옙?占쏜쬃???옙 ??잟쬃??? ?葯멥삖???ㄹ?獄??계퀝 獄덂댖占???뽳옙 ?蘊꾬옙
        let bundle: serde_json::Value = serde_json::from_str(&confirmed_iter.generated_draft_json)
            .map_err(|e| format!("??잟쬃???葯멥삖 ??덌옙: {}", e))?;

        if let Some(modules_val) = bundle.get("sad_module_list") {
            let modules_json = if modules_val.is_array() {
                serde_json::to_string(modules_val).unwrap_or_else(|_| "[]".to_string())
            } else if let Some(arr) = modules_val.get("modules") {
                serde_json::to_string(arr).unwrap_or_else(|_| "[]".to_string())
            } else {
                modules_val.to_string()
            };
            
            // 6. sad_epic_mapping??蘊깍옙占???ㄹ?獄덂댖占썼쾺??堤솘欲??劑뫊制첉 容뷰눢占?
            let epic_mappings: Vec<serde_json::Value> = bundle.get("sad_epic_mapping")
                .and_then(|em| em.get("mappings"))
                .and_then(|m| m.as_array())
                .cloned().unwrap_or_default();

            // create_local_modules???占쏙옙????잟쬃????獄ㅶ쵟占??燁묅??(name, description, responsibility, mapped_epics)
            let raw_modules: Vec<serde_json::Value> = serde_json::from_str(&modules_json).unwrap_or_default();
            let modules_to_create: Vec<serde_json::Value> = raw_modules.iter().map(|m| {
                let current_mid = m.get("module_id").and_then(|v| v.as_str()).unwrap_or("");
                
                // ?歷좈컾 獄덂댖占?ID令덌옙 ?燁믮쪡??獄덂댖占??劑뫊制첉 ID ???옙
                let assigned_epics: Vec<String> = epic_mappings.iter()
                    .filter(|em| em.get("mapped_modules").and_then(|mm| mm.as_array())
                        .map_or(false, |mm| mm.iter().any(|mid| mid.as_str() == Some(current_mid))))
                    .filter_map(|em| em.get("epic_id").and_then(|e| e.as_str()).map(|e| e.to_string()))
                    .collect();

                serde_json::json!({
                    "module_id": current_mid,
                    "name": m.get("module_name").or(m.get("name")),
                    "description": m.get("description"),
                    "responsibility": m.get("core_responsibility").or(m.get("responsibility")),
                    "mapped_epics": assigned_epics.join(", "), // ?逆ㅿ옙獄?囹긺┷占??獄↑퀎占??
                    "priority_order": m.get("priority_order")
                })
            }).collect();

            let _final_json = serde_json::to_string(&modules_to_create).unwrap_or_else(|_| "[]".to_string());
            
            // 辱ζ쉼占? create_local_modules ?歷???좑옙 ?蘊덌옙??占????⑨옙 ?帝같占?????占썲컧獄?옙獄?
            // ?獵배맻?蒻낉옙 ?蘊덌옙??占??€쐢占????蘊꾬옙??섉렆?? 獄??곤옙???蘊덍쫱?縕뀐옙?歷η꽚 ??
            // ?逆븟죫 ?屍귨옙 ???蘊꾬옙??わ옙 獄삥떀占?逆븝옙 辱뷂옙占?
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // Module ??뽳옙 ?蘊덃뵸令?(?蘊덌옙??占?獄삥퓳占???轝좑옙)
    if node.target_node_type == "SAD_Module" {
         let bundle: serde_json::Value = serde_json::from_str(&confirmed_iter.generated_draft_json).unwrap_or_default();
         if let Some(modules_val) = bundle.get("sad_module_list") {
            let modules_json = if modules_val.is_array() {
                serde_json::to_string(modules_val).unwrap_or_else(|_| "[]".to_string())
            } else if let Some(arr) = modules_val.get("modules") {
                serde_json::to_string(arr).unwrap_or_else(|_| "[]".to_string())
            } else {
                "[]".to_string()
            };

            // ?劑뫊制첉 獄ㅶ쵟占???낂쇃 容뷰눢占?
            let epic_mappings: Vec<serde_json::Value> = bundle.get("sad_epic_mapping")
                .and_then(|em| em.get("mappings"))
                .and_then(|m| m.as_array())
                .cloned().unwrap_or_default();

            let raw_modules: Vec<serde_json::Value> = serde_json::from_str(&modules_json).unwrap_or_default();
            let modules_to_create: Vec<serde_json::Value> = raw_modules.iter().map(|m| {
                let current_mid = m.get("module_id").and_then(|v| v.as_str()).unwrap_or("");
                
                let assigned_epics: Vec<String> = epic_mappings.iter()
                    .filter(|em| em.get("mapped_modules").and_then(|mm| mm.as_array())
                        .map_or(false, |mm| mm.iter().any(|mid| mid.as_str() == Some(current_mid))))
                    .filter_map(|em| em.get("epic_id").and_then(|e| e.as_str()).map(|e| e.to_string()))
                    .collect();

                serde_json::json!({
                    "module_id": current_mid,
                    "name": m.get("module_name").or(m.get("name")),
                    "description": m.get("description"),
                    "responsibility": m.get("core_responsibility").or(m.get("responsibility")),
                    "mapped_epics": assigned_epics.join(", "),
                    "priority_order": m.get("priority_order")
                })
            }).collect();

            let final_json = serde_json::to_string(&modules_to_create).unwrap_or_else(|_| "[]".to_string());
            create_local_modules(pool, project_id, final_json, app_handle.clone()).await?;
         }
    }

    let _ = app_handle.emit("nodes-updated", ());
    Ok(())
}

