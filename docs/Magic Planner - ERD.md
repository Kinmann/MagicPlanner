# Magic Planner: ERD

생성자: 지수 김
생성 일시: 2026년 3월 29일 오후 3:48
카테고리: PLAN
최종 편집자:: 지수 김
최종 업데이트 시간: 2026년 3월 30일 오전 11:39

DBML형식으로 ERD작성

```json
// ==========================================
// DBML: Magic Planner ERD (Multi-Project & Error Handling)
// ==========================================

Table user_session {
  session_id varchar(36) [pk, not null]
  api_key_encrypted varchar(255)
  is_api_key_valid boolean [not null]
  created_at timestamp [not null]
  updated_at timestamp [not null]
  is_deleted boolean [not null]

  Note: '사용자 세션 (전역 인증 및 설정)'
}

Table project {
  project_id varchar(36) [pk, not null]
  session_id varchar(36) [not null]
  project_name varchar(100) [not null]
  pipeline_execution_mode varchar(20) [not null]
  raw_input_text text
  created_at timestamp [not null]
  updated_at timestamp [not null]
  is_deleted boolean [not null]

  Note: '개별 기획 프로젝트 워크스페이스'
}

Table document_node {
  node_id varchar(36) [pk, not null]
  project_id varchar(36) [not null]
  target_node_type varchar(50) [not null]
  node_state varchar(30) [not null]
  current_iteration integer [not null]
  max_iterations integer [not null]
  threshold_score integer [not null]
  current_best_score integer [not null]
  api_error_code integer
  api_error_message text
  created_at timestamp [not null]
  updated_at timestamp [not null]
  is_deleted boolean [not null]

  Note: '프로젝트 종속 문서 노드 (API 에러 메타데이터 포함)'
}

Table generation_iteration {
  iteration_id varchar(36) [pk, not null]
  node_id varchar(36) [not null]
  iteration_number integer [not null]
  generated_draft_json json [not null]
  calculated_score integer
  is_pass boolean
  critical_errors_array json
  actionable_feedback_text text
  created_at timestamp [not null]
  updated_at timestamp [not null]
  is_deleted boolean [not null]

  Note: '생성 반복 루프 이력'
}

Table final_document {
  document_id varchar(36) [pk, not null]
  node_id varchar(36) [not null]
  final_output_json json [not null]
  export_file_path varchar(500)
  is_exported boolean [not null]
  created_at timestamp [not null]
  updated_at timestamp [not null]
  is_deleted boolean [not null]

  Note: '최종 확정 산출물'
}

// ==========================================
// Relationships (관계 정의)
// ==========================================

Ref: user_session.session_id < project.session_id
Ref: project.project_id < document_node.project_id
Ref: document_node.node_id < generation_iteration.node_id
Ref: document_node.node_id - final_document.node_id
```