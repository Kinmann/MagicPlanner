use serde::{Deserialize, Serialize};

/// 노드 상태 열거형 (DB TEXT 필드 매핑)
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum NodeState {
    Pending,
    Ready,
    InProgress,
    Completed,
    PausedHitl,
    PausedApiError,
    PausedStopped,
    Refining,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct PipelineStatusPayload {
    pub message: String,
    pub node_id: String,
    pub node_type: String,
    pub project_id: String,
    pub level: String, // "INFO", "SUCCESS", "WARN", "ERROR"
    pub status: String, // "START", "IN_PROGRESS", "ITERATION_COMPLETED", "COMPLETED", "STOPPED", "FAILED", "EMBEDDING_START", "EMBEDDING_COMPLETE", "EMBEDDING_FAILED"
    pub current_iteration: Option<i32>,
    pub max_iterations: Option<i32>,
    pub is_silent: Option<bool>,
}

impl std::fmt::Display for NodeState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            NodeState::Pending => "PENDING",
            NodeState::Ready => "READY",
            NodeState::InProgress => "IN_PROGRESS",
            NodeState::Completed => "COMPLETED",
            NodeState::PausedHitl => "PAUSED_HITL",
            NodeState::PausedApiError => "PAUSED_API_ERROR",
            NodeState::PausedStopped => "PAUSED_STOPPED",
            NodeState::Refining => "REFINING",
        };
        write!(f, "{}", s)
    }
}

/// 파이프라인 실행 중 발생하는 에러 타입
#[derive(Debug)]
pub enum PipelineError {
    /// API 호출 에러 (HTTP 상태 코드, 메시지)
    ApiError(u16, String),
    /// 내부 로직 에러
    Internal(String),
}

impl std::fmt::Display for PipelineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PipelineError::ApiError(code, msg) => write!(f, "API Error ({}): {}", code, msg),
            PipelineError::Internal(msg) => write!(f, "Internal Error: {}", msg),
        }
    }
}

/// RAG 임베딩 실패 시 프론트엔드에 전달되는 에러 정보
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct RagErrorInfo {
    pub project_id: String,
    pub node_id: String,
    pub node_type: String,
    pub error_message: String,
}

/// RAII 패턴 기반 작업 가드 - Drop 시 자동으로 ActiveTasks에서 제거
pub struct TaskGuard {
    pub tasks: std::sync::Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
    pub node_id: String,
}

impl Drop for TaskGuard {
    fn drop(&mut self) {
        if let Ok(mut t) = self.tasks.lock() {
            t.remove(&self.node_id);
        }
    }
}
