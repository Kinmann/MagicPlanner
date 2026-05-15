mod commands;
pub mod schemas;
pub mod models;
pub mod services;
pub mod utils;
use sqlite_vec::sqlite3_vec_init;

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

pub struct ActiveTasks(pub Arc<Mutex<HashSet<String>>>);

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
// #[tauri::command]
// fn greet(name: &str) -> String {
//     format!("Hello, {}! You've been greeted from Rust!", name)
// }

use reqwest::Client;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let active_tasks = ActiveTasks(Arc::new(Mutex::new(HashSet::new())));
    let client = Client::new();

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
            
            // sqlite-vec 확장 등록 (Pool 생성 전 전역 등록)
            unsafe {
                libsqlite3_sys::sqlite3_auto_extension(Some(std::mem::transmute::<
                    *const (),
                    unsafe extern "C" fn(
                        *mut libsqlite3_sys::sqlite3,
                        *mut *mut i8,
                        *const libsqlite3_sys::sqlite3_api_routines,
                    ) -> i32,
                >(sqlite3_vec_init as *const ())));
            }

            let pool = tauri::async_runtime::block_on(async {
                use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
                use std::time::Duration;
                
                let options = SqliteConnectOptions::new()
                    .filename(&db_path)
                    .journal_mode(SqliteJournalMode::Wal)
                    .busy_timeout(Duration::from_secs(5))
                    .create_if_missing(true);

                let pool = sqlx::SqlitePool::connect_with(options).await.map_err(|e| e.to_string())?;

                // Migration: project 테이블에 increment_intent 컬럼 추가 (이미 있으면 무시되도록 별도 처리)
                let _ = sqlx::query("ALTER TABLE project ADD COLUMN increment_intent TEXT").execute(&pool).await;
                
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
                        increment_intent TEXT, -- Refinement 의도 저장용
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

                    -- 8. 노드 코멘트 (v2: 확정된 iteration에 대한 사용자 코멘트)
                    CREATE TABLE IF NOT EXISTS node_comment (
                        comment_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        project_id VARCHAR(36) NOT NULL,
                        node_id VARCHAR(36) NOT NULL,
                        iteration_id VARCHAR(36) NOT NULL,
                        json_path TEXT NOT NULL,
                        comment_text TEXT NOT NULL,
                        author VARCHAR(100) DEFAULT 'User',
                        is_resolved BOOLEAN NOT NULL DEFAULT 0,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL DEFAULT 0,
                        FOREIGN KEY(project_id) REFERENCES project(project_id),
                        FOREIGN KEY(node_id) REFERENCES document_node(node_id),
                        FOREIGN KEY(iteration_id) REFERENCES generation_iteration(iteration_id)
                    );

                    -- 8. 벡터 임베딩 저장 (vec0 가상 테이블)
                    -- Phase 2: 거리 측정 방식을 cosine으로 명시 (Gemini 임베딩 최적화)
                    -- v2.1: Gemini-embedding-001/004의 3072 차원 대응을 위해 차원 상향
                    -- [FIX] 데이터 영속성을 위해 앱 시작 시마다 DROP 하던 로직 제거
                    CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings USING vec0(
                        embedding float[3072] distance_metric=cosine
                    );

                    -- 9. 임베딩 메타데이터 (rowid로 vec0 테이블과 1:1 매핑)
                    CREATE TABLE IF NOT EXISTS embedding_metadata (
                        rowid INTEGER PRIMARY KEY,
                        project_id VARCHAR(36) NOT NULL,
                        module_id VARCHAR(36),
                        node_type VARCHAR(50) NOT NULL,
                        node_id VARCHAR(36) NOT NULL,
                        iteration_id VARCHAR(36) NOT NULL,
                        chunk_index INTEGER NOT NULL DEFAULT 0,
                        chunk_text TEXT NOT NULL,
                        score INTEGER,
                        created_at TIMESTAMP NOT NULL,
                        FOREIGN KEY(project_id) REFERENCES project(project_id),
                        FOREIGN KEY(node_id) REFERENCES document_node(node_id),
                        FOREIGN KEY(iteration_id) REFERENCES generation_iteration(iteration_id)
                    );

                    -- 10. 아티팩트 매핑 (증분 수정 의존성 추적용)
                    CREATE TABLE IF NOT EXISTS artifact_mapping (
                        mapping_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        project_id VARCHAR(36) NOT NULL,
                        node_id VARCHAR(36) NOT NULL,
                        artifact_id VARCHAR(255) NOT NULL,
                        json_path TEXT NOT NULL,
                        created_at TIMESTAMP NOT NULL,
                        FOREIGN KEY(project_id) REFERENCES project(project_id),
                        FOREIGN KEY(node_id) REFERENCES document_node(node_id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_artifact_mapping_id ON artifact_mapping(artifact_id);
                    CREATE INDEX IF NOT EXISTS idx_artifact_mapping_project ON artifact_mapping(project_id);
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
                let _ = sqlx::query("ALTER TABLE document_node ADD COLUMN target_count INTEGER DEFAULT 0").execute(&pool).await;
                
                // 4. is_pass 데이터 표준화 (BOOLEAN -> 0/1 INTEGER)
                let _ = sqlx::query("UPDATE generation_iteration SET is_pass = 1 WHERE is_pass = 'true' OR is_pass = '1' OR is_pass = 1").execute(&pool).await;
                let _ = sqlx::query("UPDATE generation_iteration SET is_pass = 0 WHERE is_pass = 'false' OR is_pass = '0' OR is_pass = 0 OR is_pass IS NULL").execute(&pool).await;

                // 5. generation_iteration 테이블: is_archived 컬럼 추가
                let _ = sqlx::query("ALTER TABLE generation_iteration ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0").execute(&pool).await;

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
                
                // 4. 버려진(Stale) RAG 상태 및 비정상 종료된 작업(IN_PROGRESS) 초기화 (앱 시작 시 오버레이 스턱 방지)
                let _ = sqlx::query("UPDATE document_node SET last_action = NULL WHERE last_action LIKE '%RAG%'").execute(&pool).await;
                let _ = sqlx::query("UPDATE document_node SET node_state = 'PAUSED_STOPPED' WHERE node_state IN ('IN_PROGRESS', 'REFINING')").execute(&pool).await;
                
                // 5. [NEW] Legacy Comment Path Migration
                let _ = sqlx::query(
                    "UPDATE node_comment 
                     SET json_path = '$' || SUBSTR(json_path, INSTR(json_path, '$') + 1) 
                     WHERE json_path LIKE '%$%' AND json_path NOT LIKE '$%'"
                ).execute(&pool).await;
                
                // 6. [NEW] Explicit Global Category Migration (GENESIS / SAD)
                // 모든 GLOBAL 카테고리를 폐기하고 성격에 맞게 분리
                let _ = sqlx::query(
                    "UPDATE document_node 
                     SET node_category = 'GENESIS' 
                     WHERE target_node_type LIKE 'GPRD_%' OR node_category = 'GLOBAL' AND target_node_type LIKE 'GPRD_%'"
                ).execute(&pool).await;

                let _ = sqlx::query(
                    "UPDATE document_node 
                     SET node_category = 'SAD' 
                     WHERE target_node_type LIKE 'SAD_%' OR node_category = 'GLOBAL' AND target_node_type LIKE 'SAD_%'"
                ).execute(&pool).await;
                
                Ok::<sqlx::SqlitePool, String>(pool)
            })?;
            app.manage(pool);
            app.manage(active_tasks);
            app.manage(client);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::validate_api_key,
            commands::settings::save_api_key,
            commands::project::list_projects,
            commands::project::create_project,
            commands::pipeline::run_pipeline,
            commands::project::get_project,
            commands::node::get_project_nodes,
            commands::node::get_node_iterations,
            commands::node::get_iteration_by_id,
            commands::node::get_latest_iteration,
            commands::node::get_latest_pass_iteration,
            commands::pipeline::handle_hitl_action,
            commands::node::update_node_max_iterations,
            commands::node::update_node_target_count,
            commands::project::index_project_embeddings,
            commands::project::save_file,
            commands::project::delete_project,
            // v2 新 커맨드
            commands::module::get_project_modules,
            commands::node::get_module_nodes,
            commands::module::get_global_contexts,
            commands::pipeline::run_genesis_prd_pipeline,
            commands::approval::approve_genesis_prd,
            commands::module::create_local_modules,
            commands::pipeline::run_module_pipeline,
            commands::approval::confirm_sad_iteration,
            commands::approval::confirm_genesis_prd_iteration,
            commands::approval::approve_genesis_prd_node,
            commands::pipeline::stop_node_pipeline,
            commands::pipeline::resume_node_pipeline,
            commands::node::get_all_active_nodes,
            commands::node::delete_generation_iteration,
            commands::node::archive_generation_iteration,
            commands::node::restore_generation_iteration,
            commands::node::get_archived_iterations,
            commands::approval::approve_sad_node,
            commands::approval::unconfirm_iteration,
            commands::project::search_similar_documents,
            commands::pipeline::manually_trigger_next_nodes,
            commands::refinement::parse_intent,
            commands::refinement::route_architecture_target,
            commands::refinement::apply_taint_cascade,
            commands::refinement::confirm_taint_cascade,
            commands::refinement::generate_and_apply_patch,
            commands::refinement::validate_refinement_node,
            commands::refinement::confirm_node_review,
            commands::refinement::finalize_refinement_update,
            // v2: Comment 커맨드
            commands::comment::get_node_comments,
            commands::comment::get_project_comments,
            commands::comment::create_comment,
            commands::comment::update_comment,
            commands::comment::delete_comment,
            commands::comment::migrate_comment_paths,
            commands::refinement::migrate_canonical_ids_command,
            commands::refinement::migrate_artifact_mappings,
            commands::refinement::cancel_refinement_update,
            commands::node::archive_all_non_confirmed_iterations,
        ])
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
