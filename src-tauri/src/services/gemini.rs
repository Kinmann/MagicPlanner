use reqwest::Client;
use crate::models::PipelineError;

/// Gemini API를 호출하여 원본 응답(Content)을 반환합니다.
/// Agentic 루프나 복잡한 대화 기록 처리에 적합합니다.
pub async fn call_gemini_raw(
    client: &Client,
    api_key: &str,
    system_instruction: Option<&str>,
    messages: Vec<serde_json::Value>,
    tools: Option<serde_json::Value>,
    schema_opt: Option<serde_json::Value>,
) -> Result<serde_json::Value, PipelineError> {
    let model = "gemini-2.5-flash";
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    let mut generation_config = serde_json::json!({
        "temperature": 0.7,
        "topP": 0.95,
        "topK": 40,
        "maxOutputTokens": 65536,
    });

    if let Some(schema) = schema_opt {
        generation_config.as_object_mut().unwrap().insert("responseMimeType".to_string(), serde_json::json!("application/json"));
        generation_config.as_object_mut().unwrap().insert("responseSchema".to_string(), schema);
    }

    let mut body = serde_json::json!({
        "contents": messages,
        "generationConfig": generation_config
    });

    if let Some(sys) = system_instruction {
        body.as_object_mut().unwrap().insert("system_instruction".to_string(), serde_json::json!({
            "parts": [{ "text": sys }]
        }));
    }

    if let Some(t) = tools {
        body.as_object_mut().unwrap().insert("tools".to_string(), t);
    }

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

    let content = result["candidates"][0]["content"].clone();
    if content.is_null() {
        return Err(PipelineError::Internal("Empty response from Gemini".to_string()));
    }

    Ok(content)
}

/// 기존 코드와의 호환성을 위한 래퍼 함수입니다.
/// 단일 턴 질의에 최적화되어 있으며, 텍스트 응답에서 JSON 마크다운을 제거하여 반환합니다.
pub async fn call_gemini(
    client: &Client,
    api_key: &str,
    sys_prompt: &str,
    user_prompt: &str,
    schema_opt: Option<serde_json::Value>,
) -> Result<String, PipelineError> {
    let messages = vec![serde_json::json!({
        "role": "user",
        "parts": [{ "text": user_prompt }]
    })];

    let content = call_gemini_raw(client, api_key, Some(sys_prompt), messages, None, schema_opt).await?;
    
    let raw_text = content["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| PipelineError::Internal("Empty text response from Gemini".to_string()))?;

    // 마크다운 코드블록 감싸기 제거
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
