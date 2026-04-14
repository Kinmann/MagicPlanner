mod commands;
pub mod schemas;

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

pub struct ActiveTasks(pub Arc<Mutex<HashSet<String>>>);

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let active_tasks = ActiveTasks(Arc::new(Mutex::new(HashSet::new())));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // sqlx Pool 초기화 (tauri-plugin-sql과 동일한 경로 사용)
            let app_handle = app.handle();
            let app_dir = app_handle.path().app_config_dir().map_err(|e| e.to_string())?;
            if !app_dir.exists() {
                 std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
            }
            let db_path = app_dir.join("magic_planner.db");
            println!("Initializing database at: {:?}", db_path);
            
            let pool = tauri::async_runtime::block_on(async {
                use sqlx::sqlite::SqliteConnectOptions;
                
                let options = SqliteConnectOptions::new()
                    .filename(&db_path)
                    .create_if_missing(true);

                let pool = sqlx::SqlitePool::connect_with(options).await.map_err(|e| e.to_string())?;
                
                // ============================================================
                // v2 클린 슬레이트: 기존 테이블 DROP 후 새 스키마로 재생성
                // ============================================================
                sqlx::raw_sql("
                    -- 1. 유저 세션
                    CREATE TABLE IF NOT EXISTS user_session (
                        session_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        api_key_encrypted VARCHAR(255),
                        is_api_key_valid BOOLEAN NOT NULL,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL
                    );

                    -- 2. 프로젝트 (v2: pipeline_phase 추가)
                    CREATE TABLE IF NOT EXISTS project (
                        project_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        session_id VARCHAR(36) NOT NULL,
                        project_name VARCHAR(100) NOT NULL,
                        pipeline_execution_mode VARCHAR(20) NOT NULL,
                        pipeline_phase VARCHAR(30) NOT NULL DEFAULT 'GENESIS_PRD',
                        raw_input_text TEXT,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL,
                        FOREIGN KEY(session_id) REFERENCES user_session(session_id)
                    );

                    -- 3. 글로벌 컨텍스트 (SAD 산출물 저장소)
                    CREATE TABLE IF NOT EXISTS global_context (
                        context_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        project_id VARCHAR(36) NOT NULL,
                        iteration_id VARCHAR(36), -- Draft별 데이터 추적을 위해 추가
                        context_type VARCHAR(50) NOT NULL,
                        context_data_json TEXT NOT NULL,
                        version INTEGER NOT NULL DEFAULT 1,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL DEFAULT 0,
                        FOREIGN KEY(project_id) REFERENCES project(project_id),
                        FOREIGN KEY(iteration_id) REFERENCES generation_iteration(iteration_id)
                    );

                    -- 4. 로컬 모듈
                    CREATE TABLE IF NOT EXISTS local_module (
                        module_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        project_id VARCHAR(36) NOT NULL,
                        module_name VARCHAR(100) NOT NULL,
                        module_description TEXT,
                        core_responsibility TEXT,
                        mapped_epics TEXT,
                        dependency_spec TEXT,
                        priority_order INTEGER NOT NULL DEFAULT 0,
                        module_state VARCHAR(30) NOT NULL DEFAULT 'PENDING',
                        display_order INTEGER NOT NULL DEFAULT 0,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL DEFAULT 0,
                        FOREIGN KEY(project_id) REFERENCES project(project_id)
                    );

                    -- 5. 문서 노드 (v2: module_id FK 추가, node_category 추가)
                    CREATE TABLE IF NOT EXISTS document_node (
                        node_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        project_id VARCHAR(36) NOT NULL,
                        module_id VARCHAR(36),
                        target_node_type VARCHAR(50) NOT NULL,
                        node_category VARCHAR(30) NOT NULL DEFAULT 'MODULE',
                        node_state VARCHAR(30) NOT NULL,
                        current_iteration INTEGER NOT NULL,
                        max_iterations INTEGER NOT NULL,
                        threshold_score INTEGER NOT NULL,
                        current_best_score INTEGER NOT NULL,
                        api_error_code INTEGER,
                        api_error_message TEXT,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        last_action TEXT,
                        is_deleted BOOLEAN NOT NULL,
                        FOREIGN KEY(project_id) REFERENCES project(project_id),
                        FOREIGN KEY(module_id) REFERENCES local_module(module_id)
                    );

                    -- 6. 생성 반복
                    CREATE TABLE IF NOT EXISTS generation_iteration (
                        iteration_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        node_id VARCHAR(36) NOT NULL,
                        iteration_number INTEGER NOT NULL,
                        generated_draft_json TEXT NOT NULL,
                        calculated_score INTEGER,
                        is_pass BOOLEAN,
                        critical_errors_array TEXT,
                        actionable_feedback_text TEXT,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL,
                        FOREIGN KEY(node_id) REFERENCES document_node(node_id)
                    );

                    -- 7. 최종 문서
                    CREATE TABLE IF NOT EXISTS final_document (
                        document_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        node_id VARCHAR(36) NOT NULL,
                        final_output_json TEXT NOT NULL,
                        export_file_path VARCHAR(500),
                        is_exported BOOLEAN NOT NULL,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL,
                        FOREIGN KEY(node_id) REFERENCES document_node(node_id)
                    );
                ").execute(&pool).await.map_err(|e| e.to_string())?;

                // ============================================================
                // v2 마이그레이션: 기존 테이블에 누락된 컬럼 추가
                // ============================================================
                // 1. project 테이블
                let _ = sqlx::query("ALTER TABLE project ADD COLUMN pipeline_phase VARCHAR(30) NOT NULL DEFAULT 'GENESIS_PRD'").execute(&pool).await;
                
                // 2. global_context 테이블
                let _ = sqlx::query("ALTER TABLE global_context ADD COLUMN iteration_id VARCHAR(36)").execute(&pool).await;

                // 3. document_node 테이블
                let _ = sqlx::query("ALTER TABLE document_node ADD COLUMN module_id VARCHAR(36)").execute(&pool).await;
                let _ = sqlx::query("ALTER TABLE document_node ADD COLUMN node_category VARCHAR(30) NOT NULL DEFAULT 'MODULE'").execute(&pool).await;
                
                // last_action 컬럼 추가 시도
                match sqlx::query("ALTER TABLE document_node ADD COLUMN last_action TEXT").execute(&pool).await {
                    Ok(_) => println!(">>> Migration: last_action column added to document_node"),
                    Err(e) => {
                        if e.to_string().contains("duplicate column name") {
                            println!(">>> Migration: last_action column already exists");
                        } else {
                            println!(">>> Migration Error: Failed to add last_action column: {}", e);
                        }
                    }
                }


                // ============================================================
                // [HOTFIX] SAD/PRD 중복 번호 및 아이콘 오표시 긴급 보정
                // ============================================================
                println!(">>> Running DB Data Cleanup...");
                // [HOTFIX] 데이터 자동 보정 (SAD/PRD 제외, 모듈 내 노드만 자동 확정)
                let _ = sqlx::query("
                    -- 1. 이터레이션 번호 재부여 (생성순)
                    UPDATE generation_iteration
                    SET iteration_number = (
                        SELECT new_num 
                        FROM (
                            SELECT iteration_id, row_number() OVER (PARTITION BY node_id ORDER BY created_at ASC) as new_num
                            FROM generation_iteration
                        ) AS Ranked
                        WHERE Ranked.iteration_id = generation_iteration.iteration_id
                    );
                ").execute(&pool).await;

                let _ = sqlx::query("
                    -- 2. SAD/PRD를 제외한 모듈 내 노드들만 is_pass 초기화 후 최고점 리비전 자동 확정
                    UPDATE generation_iteration 
                    SET is_pass = 0 
                    WHERE node_id IN (
                        SELECT node_id FROM document_node 
                        WHERE target_node_type NOT IN ('Genesis_PRD', 'SAD_Global', 'SAD_Module')
                    );
                ").execute(&pool).await;

                let _ = sqlx::query("
                    UPDATE generation_iteration 
                    SET is_pass = 1
                    WHERE iteration_id IN (
                        SELECT it.iteration_id FROM (
                            SELECT iteration_id, node_id, row_number() OVER (PARTITION BY node_id ORDER BY calculated_score DESC, created_at DESC) as rank
                            FROM generation_iteration
                        ) it
                        JOIN document_node dn ON it.node_id = dn.node_id
                        WHERE it.rank = 1 
                        AND dn.target_node_type NOT IN ('Genesis_PRD', 'SAD_Global', 'SAD_Module')
                    );
                ").execute(&pool).await;

                let _ = sqlx::query("
                    -- 3. 노드 테이블의 current_iteration 동기화
                    UPDATE document_node
                    SET current_iteration = (
                        SELECT COUNT(*) 
                        FROM generation_iteration 
                        WHERE generation_iteration.node_id = document_node.node_id 
                        AND is_deleted = 0
                    );
                ").execute(&pool).await;

                let _ = sqlx::query("
                    -- 4. 확정된 문서(global_context)의 버전을 이터레이션 번호와 동기화
                    UPDATE global_context
                    SET version = (
                        SELECT iteration_number 
                        FROM generation_iteration 
                        WHERE generation_iteration.iteration_id = global_context.iteration_id
                    )
                    WHERE iteration_id IS NOT NULL;
                ").execute(&pool).await;
                println!(">>> DB Data Cleanup Completed.");
                
                Ok::<sqlx::SqlitePool, String>(pool)
            })?;
            app.manage(pool);
            app.manage(active_tasks);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::validate_api_key,
            commands::save_api_key,
            commands::list_projects,
            commands::create_project,
            commands::run_pipeline,
            commands::get_project,
            commands::get_project_nodes,
            commands::get_node_iterations,
            commands::get_latest_iteration,
            commands::handle_hitl_action,
            commands::update_node_max_iterations,
            commands::save_file,
            commands::delete_project,
            // v2 新 커맨드
            commands::get_project_modules,
            commands::get_module_nodes,
            commands::get_global_contexts,
            commands::run_genesis_prd_pipeline,
            commands::run_sad_global_pipeline,
            commands::run_sad_module_pipeline,
            commands::approve_genesis_prd,
            commands::create_local_modules,
            commands::run_module_pipeline,
            commands::confirm_sad_iteration,
            commands::confirm_genesis_prd_iteration,
            commands::stop_node_pipeline,
            commands::resume_node_pipeline,
            commands::get_all_active_nodes,
            commands::delete_generation_iteration,
            commands::approve_sad_node,
            commands::unconfirm_iteration,
        ])
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
