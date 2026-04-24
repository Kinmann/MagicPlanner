use reqwest::Client;
use crate::models::PipelineError;

/// Gemini API를 호출하여 JSON 응답을 반환합니다.
/// schema_opt가 제공되면 Structured Output 모드로 동작합니다.
pub async fn call_gemini(
    client: &Client,
    api_key: &str,
    sys_prompt: &str,
    user_prompt: &str,
    schema_opt: Option<serde_json::Value>,
) -> Result<String, PipelineError> {
    let model = "gemini-2.5-flash";
    println!(">>> Calling Gemini API ({})", model);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    let mut generation_config = serde_json::json!({
        "temperature": 0.7,
        "topP": 0.95,
        "topK": 40,
        "maxOutputTokens": 65536,
        "responseMimeType": "application/json"
    });

    if let Some(schema) = schema_opt {
        generation_config
            .as_object_mut()
            .unwrap()
            .insert("responseSchema".to_string(), schema);
    }

    let body = serde_json::json!({
        "system_instruction": { "parts": [{ "text": sys_prompt }] },
        "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
        "generationConfig": generation_config
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e: reqwest::Error| {
            PipelineError::Internal(format!("API Request Send Error: {}", e))
        })?;

    let status = resp.status();
    if !status.is_success() {
        let err_json: serde_json::Value = resp
            .json()
            .await
            .unwrap_or_else(|_| serde_json::json!({"error": {"message": "Could not parse error JSON"}}));
        let err_msg = err_json["error"]["message"]
            .as_str()
            .unwrap_or("Unknown Gemini Error");
        println!("!!! Gemini API Error ({}): {}", status, err_msg);
        return Err(PipelineError::ApiError(
            status.as_u16(),
            format!("{}: {}", status, err_msg),
        ));
    }

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e: reqwest::Error| PipelineError::Internal(e.to_string()))?;
    let raw_text = result["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| PipelineError::Internal("Empty response from Gemini".to_string()))?;

    // 마크다운 코드블록 감싸기 제거 (Gemini가 가끔 추가)
    let cleaned_text = raw_text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    Ok(cleaned_text.to_string())
}

/// Gemini Embedding API를 호출하여 벡터를 반환합니다.
pub async fn call_gemini_embedding(
    client: &Client,
    api_key: &str,
    text: &str,
    task_type: &str,
) -> Result<Vec<f32>, PipelineError> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={}",
        api_key
    );

    let body = serde_json::json!({
        "model": "models/gemini-embedding-001",
        "content": {
            "parts": [{"text": text}]
        },
        "taskType": task_type
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| PipelineError::Internal(format!("Embedding API Request Error: {}", e)))?;

    let status = resp.status();
    if !status.is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        return Err(PipelineError::ApiError(
            status.as_u16(),
            format!("Embedding API Error ({}): {}", status, err_body),
        ));
    }

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| PipelineError::Internal(format!("Embedding response parse error: {}", e)))?;

    let values = result["embedding"]["values"]
        .as_array()
        .ok_or_else(|| PipelineError::Internal("No embedding values in response".to_string()))?;

    let vec: Vec<f32> = values
        .iter()
        .filter_map(|v| v.as_f64().map(|f| f as f32))
        .collect();

    if vec.is_empty() {
        return Err(PipelineError::Internal(
            "Empty embedding vector returned".to_string(),
        ));
    }

    Ok(vec)
}
