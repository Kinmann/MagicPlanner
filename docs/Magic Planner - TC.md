# Magic Planner: TC

생성자: 지수 김
생성 일시: 2026년 3월 30일 오전 11:38
카테고리: PLAN
최종 편집자:: 지수 김
최종 업데이트 시간: 2026년 3월 30일 오전 11:46

## 1. 보안 및 인증 (Security)

### [TC-SEC-001] 유효한 API Key 입력 시 전역 인증 세션 생성 및 암호화 저장 검증

- **테스트 분류 (Category):** Security
- **연관 기능 (Linked Func):** `FUNC-INP-01`
- **연관 API (Linked API):** `API-INP-001`
- **사전 조건 (Pre-conditions):** 시스템의 로컬 SQLite DB가 초기화된 상태이며, 네트워크가 연결되어 있음. 유효한 Gemini API Key 확보.
- **테스트 스텝 (Test Steps):**
    1. `POST /sessions` 엔드포인트에 payload(`api_key_string="VALID_KEY_STRING"`) 전송.
    2. HTTP 응답 상태 코드 확인.
    3. 응답 payload 내 `is_api_key_valid` 속성값 검증.
- **예상 결과 (Expected Result):** HTTP 상태 코드 200 반환 및 `is_api_key_valid` 속성이 `true`로 응답됨.

### [TC-SEC-002] 유효하지 않은 API Key(만료/형식 오류) 입력 시 예외 처리 검증

- **테스트 분류 (Category):** Security
- **연관 기능 (Linked Func):** `FUNC-INP-01`
- **연관 API (Linked API):** `API-INP-001`
- **사전 조건 (Pre-conditions):** 시스템의 로컬 SQLite DB가 초기화된 상태. 만료되거나 변조된 API Key 확보.
- **테스트 스텝 (Test Steps):**
    1. `POST /sessions` 엔드포인트에 payload(`api_key_string="INVALID_KEY_STRING"`) 전송.
    2. HTTP 응답 상태 코드 확인.
    3. 응답 payload 내 `auth_error_message` 속성 존재 여부 검증.
- **예상 결과 (Expected Result):** HTTP 상태 코드 401(또는 400) 반환 및 `auth_error_message` 속성에 상세 에러 문자열이 반환됨.

## 2. API 및 기능 단위 검증 (API)

### [TC-API-001] 신규 프로젝트 생성 및 파이프라인 모드 데이터 무결성 검증

- **테스트 분류 (Category):** API
- **연관 기능 (Linked Func):** `FUNC-PRJ-01`
- **연관 API (Linked API):** `API-PRJ-001`
- **사전 조건 (Pre-conditions):** `FUNC-INP-01`을 통과하여 유효한 `session_id` 확보.
- **테스트 스텝 (Test Steps):**
    1. `POST /sessions/{session_id}/projects` 엔드포인트에 payload(`project_name="테스트 프로젝트"`, `pipeline_execution_mode="AUTO"`) 전송.
    2. 응답 payload의 데이터 타입 및 `project_id` 식별자 검증.
- **예상 결과 (Expected Result):** 응답 payload에 UUID 포맷의 `project_id`가 반환되고, `created_at` 속성이 타임스탬프로 기록됨.

### [TC-API-002] 초기 텍스트 입력 경계값(49자) 미달 시 유효성 검증 실패 동작 확인

- **테스트 분류 (Category):** API (Boundary Value Analysis)
- **연관 기능 (Linked Func):** `FUNC-INP-02`
- **연관 API (Linked API):** `API-INP-002`
- **사전 조건 (Pre-conditions):** 유효한 `project_id` 확보. 문서 노드들이 생성되지 않은 상태.
- **테스트 스텝 (Test Steps):**
    1. `PATCH /projects/{project_id}/init` 엔드포인트에 payload(`raw_input_text="49자 길이의 텍스트..............................................."`) 전송.
    2. 응답 payload의 `validation_passed_boolean` 상태 검증.
- **예상 결과 (Expected Result):** `validation_passed_boolean`이 `false`로 반환되고, 파이프라인 초기화가 거부됨.

### [TC-API-003] PAUSED_HITL 상태의 노드에 대한 수동 재실행(RETRY) 명령 인가 및 상태 복구 검증

- **테스트 분류 (Category):** API
- **연관 기능 (Linked Func):** `FUNC-ORC-02`
- **연관 API (Linked API):** `API-ORC-002`
- **사전 조건 (Pre-conditions):** 특정 문서 노드가 품질 미달로 인해 `PAUSED_HITL` 상태로 DB에 기록됨.
- **테스트 스텝 (Test Steps):**
    1. `PATCH /nodes/{node_id}/action` 엔드포인트에 payload(`action_type="RETRY"`, `additional_iterations=3`) 전송.
    2. 응답 payload의 갱신된 노드 상태 확인.
- **예상 결과 (Expected Result):** 해당 노드의 `node_state`가 `READY` 또는 `IN_PROGRESS`로 갱신되고, `max_iterations`가 기존 대비 3 증가하여 반환됨.

## 3. 엔드투엔드 및 오케스트레이션 (E2E)

### [TC-E2E-001] 오케스트레이터 N회 루프 종료 후 평가 임계치 미달 시 PAUSED_HITL 상태 전이 검증

- **테스트 분류 (Category):** E2E
- **연관 기능 (Linked Func):** `FUNC-ORC-01`
- **연관 API (Linked API):** `API-ORC-001`
- **사전 조건 (Pre-conditions):** 특정 프로젝트 내 PRD 노드가 `IN_PROGRESS` 상태. 검증 엔진(Evaluator)의 Mock 응답 점수가 `threshold_score`(예: 80점) 미만으로 고정된 상태.
- **테스트 스텝 (Test Steps):**
    1. 오케스트레이터의 `max_iterations` 루프 실행 완료 대기.
    2. `GET /projects/{project_id}/nodes` 요청 전송 (`limit=10, offset=0`).
    3. 응답 목록 중 `target_node_type`이 "PRD"인 객체의 `node_state` 속성 확인.
- **예상 결과 (Expected Result):** 해당 노드의 `node_state`가 `PAUSED_HITL`로 반환됨.

### [TC-E2E-002] 런타임 통신 장애(HTTP 429) 발생 시 시스템 강제 중단 및 에러 메타데이터 커밋 검증

- **테스트 분류 (Category):** E2E
- **연관 기능 (Linked Func):** `FUNC-ORC-03`
- **연관 API (Linked API):** `API-ORC-001`
- **사전 조건 (Pre-conditions):** 문서 노드가 `IN_PROGRESS` 상태. 외부 API 호출 시 HTTP 429 예외를 발생시키도록 Mocking 된 환경.
- **테스트 스텝 (Test Steps):**
    1. 오케스트레이터 실행 루프 내 작성/검증 엔진 API 호출 트리거.
    2. 예외 감지 후 파이프라인 일시 중단 대기.
    3. `GET /projects/{project_id}/nodes` 요청 전송 및 에러 메타데이터 확인.
- **예상 결과 (Expected Result):** 노드의 `node_state`가 `PAUSED_API_ERROR`로 갱신되며, `api_error_code` 속성에 `429`가 명시적으로 기록되어 반환됨.

### [TC-E2E-003] COMPLETED 상태의 최종 산출물 대상 로컬 파일 다운로드(Export) 이벤트 트리거 무결성 검증

- **테스트 분류 (Category):** E2E
- **연관 기능 (Linked Func):** `FUNC-EXP-01`
- **연관 API (Linked API):** `API-EXP-002`
- **사전 조건 (Pre-conditions):** 특정 문서가 `COMPLETED` 상태에 도달하였으며, `final_document` 테이블에 JSON 데이터가 적재됨.
- **테스트 스텝 (Test Steps):**
    1. `POST /documents/{document_id}/exports` 엔드포인트에 payload(`export_file_path="/local/path/export.md"`) 전송.
    2. 응답 payload의 Export 상태 변이 여부 확인.
- **예상 결과 (Expected Result):** 응답 payload의 `is_exported` 값이 `true`로 반환되고, `export_file_path` 속성이 입력값과 일치하게 반환됨.