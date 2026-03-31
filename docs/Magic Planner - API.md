# Magic Planner: API

생성자: 지수 김
생성 일시: 2026년 3월 29일 오후 4:12
카테고리: PLAN
최종 편집자:: 지수 김
최종 업데이트 시간: 2026년 3월 30일 오전 11:40

```json
{
  "endpoints": [
    {
      "api_id": "API-INP-001",
      "linked_func_id": "FUNC-INP-01",
      "linked_tables": ["user_session"],
      "method": "POST",
      "path": "/sessions",
      "description": "사용자 API Key를 검증하고 전역 인증 세션을 생성하거나 갱신한다. (오류 복구 시 재호출)",
      "request_payload": {
        "api_key_string": "string"
      },
      "response_format": {
        "session_id": "string",
        "is_api_key_valid": "boolean",
        "auth_error_message": "string",
        "created_at": "timestamp"
      }
    },
    {
      "api_id": "API-PRJ-001",
      "linked_func_id": "FUNC-PRJ-01",
      "linked_tables": ["project"],
      "method": "POST",
      "path": "/sessions/{session_id}/projects",
      "description": "해당 세션 하위에 신규 기획 프로젝트를 생성하고 파이프라인 모드를 설정한다.",
      "request_payload": {
        "project_name": "string",
        "pipeline_execution_mode": "string"
      },
      "response_format": {
        "project_id": "string",
        "created_at": "timestamp"
      }
    },
    {
      "api_id": "API-INP-002",
      "linked_func_id": "FUNC-INP-02",
      "linked_tables": ["project", "document_node"],
      "method": "PATCH",
      "path": "/projects/{project_id}/init",
      "description": "프로젝트에 초기 아이디어 텍스트를 업데이트 및 검증하고 문서 파이프라인(DAG 노드)을 초기화한다.",
      "request_payload": {
        "raw_input_text": "string"
      },
      "response_format": {
        "project_id": "string",
        "validation_passed_boolean": "boolean",
        "validation_error_message": "string"
      }
    },
    {
      "api_id": "API-ORC-001",
      "linked_func_id": "FUNC-ORC-01",
      "linked_tables": ["document_node"],
      "method": "GET",
      "path": "/projects/{project_id}/nodes",
      "description": "특정 프로젝트에 속한 기획 문서 노드들의 상태 및 점수 정보를 목록으로 조회한다. (API 에러 메타데이터 포함)",
      "request_payload": {
        "limit": "integer",
        "offset": "integer",
        "sort": "string"
      },
      "response_format": {
        "data": [
          {
            "node_id": "string",
            "target_node_type": "string",
            "node_state": "string",
            "current_iteration": "integer",
            "max_iterations": "integer",
            "current_best_score": "integer",
            "api_error_code": "integer",
            "api_error_message": "string"
          }
        ],
        "total_count": "integer"
      }
    },
    {
      "api_id": "API-ORC-002",
      "linked_func_id": "FUNC-ORC-02",
      "linked_tables": ["document_node"],
      "method": "PATCH",
      "path": "/nodes/{node_id}/action",
      "description": "수동 제어(HITL) 모드에서 특정 문서 노드에 대한 실행 승인(APPROVAL) 또는 재실행(RETRY) 명령을 인가한다.",
      "request_payload": {
        "action_type": "string",
        "additional_iterations": "integer"
      },
      "response_format": {
        "node_id": "string",
        "node_state": "string",
        "max_iterations": "integer",
        "updated_at": "timestamp"
      }
    },
    {
      "api_id": "API-EVAL-001",
      "linked_func_id": "FUNC-EVAL-01",
      "linked_tables": ["generation_iteration"],
      "method": "GET",
      "path": "/nodes/{node_id}/iterations",
      "description": "특정 노드의 Best-of-N 루프에서 발생한 초안 생성 및 평가 이력을 조회한다.",
      "request_payload": {
        "limit": "integer",
        "offset": "integer",
        "sort": "string"
      },
      "response_format": {
        "data": [
          {
            "iteration_id": "string",
            "iteration_number": "integer",
            "calculated_score": "integer",
            "is_pass": "boolean",
            "critical_errors_array": "array",
            "actionable_feedback_text": "string"
          }
        ],
        "total_count": "integer"
      }
    },
    {
      "api_id": "API-EXP-001",
      "linked_func_id": "FUNC-EXP-01",
      "linked_tables": ["final_document"],
      "method": "GET",
      "path": "/nodes/{node_id}/document",
      "description": "완료된 단일 노드에 대한 최종 확정 기획 문서(JSON) 데이터를 조회한다.",
      "request_payload": {},
      "response_format": {
        "document_id": "string",
        "node_id": "string",
        "final_output_json": "object",
        "is_exported": "boolean",
        "export_file_path": "string"
      }
    },
    {
      "api_id": "API-EXP-002",
      "linked_func_id": "FUNC-EXP-01",
      "linked_tables": ["final_document"],
      "method": "POST",
      "path": "/documents/{document_id}/exports",
      "description": "확정된 문서 데이터를 마크다운 포맷으로 변환하여 로컬 디스크에 영구 저장 처리 이벤트를 발생시킨다.",
      "request_payload": {
        "export_file_path": "string"
      },
      "response_format": {
        "document_id": "string",
        "is_exported": "boolean",
        "export_file_path": "string",
        "updated_at": "timestamp"
      }
    }
  ]
}
```