mod commands;
pub mod schemas;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
                use sqlx::ConnectOptions;
                
                let options = SqliteConnectOptions::new()
                    .filename(&db_path)
                    .create_if_missing(true);

                let pool = sqlx::SqlitePool::connect_with(options).await.map_err(|e| e.to_string())?;
                
                // 테이블 초기화 로직 (raw_sql을 사용하여 여러 문장을 한 번에 실행)
                sqlx::raw_sql("
                    CREATE TABLE IF NOT EXISTS user_session (
                        session_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        api_key_encrypted VARCHAR(255),
                        is_api_key_valid BOOLEAN NOT NULL,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS project (
                        project_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        session_id VARCHAR(36) NOT NULL,
                        project_name VARCHAR(100) NOT NULL,
                        pipeline_execution_mode VARCHAR(20) NOT NULL,
                        raw_input_text TEXT,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL,
                        FOREIGN KEY(session_id) REFERENCES user_session(session_id)
                    );
                    CREATE TABLE IF NOT EXISTS document_node (
                        node_id VARCHAR(36) PRIMARY KEY NOT NULL,
                        project_id VARCHAR(36) NOT NULL,
                        target_node_type VARCHAR(50) NOT NULL,
                        node_state VARCHAR(30) NOT NULL,
                        current_iteration INTEGER NOT NULL,
                        max_iterations INTEGER NOT NULL,
                        threshold_score INTEGER NOT NULL,
                        current_best_score INTEGER NOT NULL,
                        api_error_code INTEGER,
                        api_error_message TEXT,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        is_deleted BOOLEAN NOT NULL,
                        FOREIGN KEY(project_id) REFERENCES project(project_id)
                    );
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
                
                Ok::<sqlx::SqlitePool, String>(pool)
            })?;
            app.manage(pool);
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
            commands::delete_project
        ])
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
