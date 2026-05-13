use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
pub struct EvaluationIssue {
    pub code: String,       // 지표 코드 (예: Code D-1)
    pub location: String,   // 발생 위치 (JSON Path, 예: endpoints[0].path)
    pub description: String // 상세 설명
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
pub struct EvaluationResult {
    pub score: i32,
    pub is_pass: bool,
    pub critical_errors: Vec<EvaluationIssue>,
    pub feedback: Vec<EvaluationIssue>,
}
