use reqwest::Client;
use chrono::Utc;
use sqlx::SqlitePool;

// ============================================================
// models/ 모듈에서 구조체/열거형 재내보내기
// ============================================================

// 서비스 함수 임포트

// EvaluationResult is now imported from crate::schemas

// EvaluationResult is now imported from crate::schemas


#[tauri::command]
pub async fn validate_api_key(api_key: String) -> Result<bool, String> {
    let client = Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let response = client.get(&url).send().await.map_err(|e: reqwest::Error| e.to_string())?;

    if response.status().is_success() {
        Ok(true)
    } else {
        let status = response.status();
        let error_body: serde_json::Value = response.json().await.map_err(|e: reqwest::Error| e.to_string())?;
        let message = error_body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error")
            .to_string();
        Err(format!("API Key Validation Failed ({}): {}", status, message))
    }
}


#[tauri::command]
pub async fn save_api_key(
    pool: tauri::State<'_, SqlitePool>,
    api_key: String,
) -> Result<(), String> {
    let session_id = "default-session";
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO user_session (session_id, api_key_encrypted, is_api_key_valid, created_at, updated_at, is_deleted) 
         VALUES (?, ?, 1, ?, ?, 0)
         ON CONFLICT(session_id) DO UPDATE SET 
            api_key_encrypted = excluded.api_key_encrypted,
            is_api_key_valid = 1,
            updated_at = excluded.updated_at"
    )
    .bind(session_id)
    .bind(api_key)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}



