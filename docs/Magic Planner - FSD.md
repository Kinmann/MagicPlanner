# Magic Planner: FSD

생성자: 지수 김
생성 일시: 2026년 3월 29일 오후 1:32
카테고리: PLAN
최종 편집자:: 지수 김
최종 업데이트 시간: 2026년 3월 30일 오전 11:40

## 1. 요구사항 명세 (Functional Requirements)

### 1.1 [FUNC-INP-01] 환경 설정(BYOK) 및 전역 인증

- **설명 (Description):** 사용자 입력 Gemini API Key를 Tauri 보안 스토리지(Secure Storage)에 암호화 저장. 경량 API 호출로 유효성 1차 검증 수행. 실패 시 에러 반환 및 재입력 요구. (시스템 레벨의 단일 세션 유지)
- **사전 조건 (Pre-condition):** 시스템 최초 실행 및 전역 설정 미비 상태, 또는 런타임 API 오류 발생으로 인한 갱신 요청 상태.
- **사후 조건 (Post-condition):** API Key 로컬 암호화 저장 완료. 시스템 인증 상태 'Valid' 전환 및 워크스페이스(대시보드) 접근 권한 획득.
- **데이터 요구사항 (Data Requirements):**
    - `session_id`
    - `api_key_string` (Secure Storage)
    - `is_api_key_valid_boolean`
    - `auth_error_message`

### 1.2 [FUNC-PRJ-01] 다중 프로젝트 생성 및 관리

- **설명 (Description):** 독립적인 기획 단위를 식별하기 위한 신규 프로젝트(Project) 생성. 사용자로부터 프로젝트 명칭 및 해당 프로젝트에 종속될 파이프라인 실행 모드(AUTO/MANUAL) 설정값 수집. SQLite DB에 프로젝트 레코드 생성.
- **사전 조건 (Pre-condition):** FUNC-INP-01 API Key 유효성 검증 완료.
- **사후 조건 (Post-condition):** 신규 `project_id` 채번 및 내장형 DB 저장. 사용자 UI 대시보드 내 신규 프로젝트 워크스페이스 생성.
- **데이터 요구사항 (Data Requirements):**
    - `session_id`
    - `project_id`
    - `project_name_string`
    - `pipeline_execution_mode_enum` (AUTO / MANUAL)

### 1.3 [FUNC-INP-02] 초기 텍스트 입력 및 유효성 검증

- **설명 (Description):** 생성된 개별 프로젝트 컨텍스트 내에서 아이디어, 타겟 고객, 목표 텍스트 데이터 수집. 텍스트 최소 길이(50자) 유효성 검증. 성공 시 프로젝트에 종속된 문서 노드 파이프라인 가동.
- **사전 조건 (Pre-condition):** 특정 프로젝트(`project_id`)가 생성 및 선택된 상태. 전 문서 노드 상태 `PENDING`.
- **사후 조건 (Post-condition):** 텍스트 데이터 글로벌 상태 메모리 적재. 1차 노드(PRD) 상태 `PENDING`에서 `READY`로 전이 및 DB 기록.
- **데이터 요구사항 (Data Requirements):**
    - `project_id`
    - `raw_input_text`
    - `validation_passed_boolean`
    - `validation_error_message`

### 1.4 [FUNC-GEN-01] 작성 엔진(Generator) 초안 생성 및 스키마/프롬프트 동적 조립

- **설명 (Description):** 대상 문서 종류(`target_node_id`) 기반 Gemini 3.0 Flash API 로컬 호출 및 문서 초안 생성.
- **핵심 로직:**
    1. **스키마 동적 강제:** 대상 문서에 매핑된 '개별 도메인 스키마 파일' 주입, 100% JSON 출력 강제.
    2. **프롬프트 동적 조립:** 메인 프롬프트와 '개별 도메인 규칙 파일' 로컬 파일 시스템 읽기 후 LLM 컨텍스트 결합(Concatenation) 주입.
    3. **오류 제어:** 이전 회차 피드백 존재 시 프롬프트 포함. 네트워크 지연에 따른 타임아웃(30초) 시 최대 3회 자동 Retry 수행.
- **사전 조건 (Pre-condition):** 대상 문서 노드 상태 `IN_PROGRESS`.
- **사후 조건 (Post-condition):** 주입된 개별 스키마 및 작성 규격 준수 JSON 초안 객체 생성 및 임시 메모리 할당.
- **데이터 요구사항 (Data Requirements):**
    - `target_node_id`
    - `source_document_json`
    - `domain_specific_schema_json`
    - `generator_system_prompt_text`
    - `domain_specific_rule_text`
    - `evaluator_feedback_text`
    - `generated_draft_json`

### 1.5 [FUNC-EVAL-01] 검증 엔진(Evaluator) 정량적 품질 평가 및 프롬프트 동적 조립

- **설명 (Description):** FUNC-GEN-01 생성 JSON 초안 평가, 0~100점 점수 및 피드백 산출.
- **핵심 로직:**
    1. **평가 기준 동적 조립:** 메인 프롬프트, 대상 문서 매핑 '개별 도메인 스키마 파일', '개별 도메인 평가 지표 파일' 결합 주입.
    2. **감점 적용:** 스키마 규격 위반 여부, 환각 등 하드코딩 감점 요인 엄격 적용.
    3. **결과 반환:** 채점 결과 임계치(Threshold) 미달 시 상세 피드백 JSON 반환.
- **사전 조건 (Pre-condition):** FUNC-GEN-01 JSON 초안 반환 및 검증 파이프라인 주입 완료.
- **사후 조건 (Post-condition):** 점수, 통과 여부, 피드백 구조화 평가 결과 객체 생성 및 오케스트레이터 반환.
- **데이터 요구사항 (Data Requirements):**
    - `generated_draft_json`
    - `domain_specific_schema_json`
    - `evaluator_system_prompt_text`
    - `domain_specific_rubric_text`
    - `calculated_score_integer`
    - `is_pass_boolean`
    - `critical_errors_array`
    - `actionable_feedback_text`

### 1.6 [FUNC-ORC-01] Best-of-N 루프 및 DB 상태 전이 제어

- **설명 (Description):** 프로젝트별 DAG 구조 기반 노드 실행 순서 통제. 프로젝트에 설정된 모드(`pipeline_execution_mode_enum`)에 따른 전이 분기. Best-of-N 샘플링 루프 및 각 상태 전이 시 SQLite 내장 DB 즉시 커밋. UI 브로드캐스트 수행.
- **사전 조건 (Pre-condition):** 자동 모드 시 노드 상태 `READY` 도달. 수동 모드 시 사용자 승인 트리거 발생.
- **사후 조건 (Post-condition):** 노드 상태 `COMPLETED` 또는 `PAUSED_HITL` 변경 및 DB 커밋. 의존성 해결 후행 노드 상태 `READY` 전이.
- **데이터 요구사항 (Data Requirements):**
    - `project_id`
    - `pipeline_execution_mode_enum`
    - `current_iteration_integer`
    - `current_best_score_integer`
    - `node_state_enum`

### 1.7 [FUNC-ORC-02] 수동 제어 인터페이스 (HITL) 처리

- **설명 (Description):** 문서 품질 미달에 따른 인적 개입 상황 제어. 노드 품질 평가 미달 시 시스템을 일시 중단하고 `PAUSED_HITL` 상태를 DB에 기록. 프론트엔드 UI를 통한 피드백 확인 및 추가 N회 재실행 이벤트 리스너 활성화.
- **사전 조건 (Pre-condition):** 특정 노드 `READY` 대기 또는 품질 평가 미달에 따른 노드 `PAUSED_HITL` 상태 진입 및 DB 반영.
- **사후 조건 (Post-condition):** 사용자 수동 개입 신호(Approval / Retry) 수신. 상태 `READY` 경유 `IN_PROGRESS` 복구.
- **데이터 요구사항 (Data Requirements):**
    - `target_node_id`
    - `human_approval_signal_boolean`
    - `human_retry_signal_boolean`

### 1.8 [FUNC-ORC-03] 런타임 API 오류 복구 처리 (Runtime Error Fallback)

- **설명 (Description):** 시스템 런타임 중 발생하는 외부 API 장애(할당량 초과, 토큰 만료 등) 통제. 해당 예외(Exception) 감지 시 즉각 현재 파이프라인 루프를 중단하고 상태를 `PAUSED_API_ERROR`로 DB에 커밋. UI에 전역 에러 모달을 강제 렌더링하여 전역 환경 설정(`FUNC-INP-01`)으로 라우팅. 키 갱신 성공 시 중단된 노드(`IN_PROGRESS`)부터 파이프라인 재가동.
- **사전 조건 (Pre-condition):** 노드 상태 `IN_PROGRESS` 진행 중 Gemini API HTTP Error(401, 429 등) 예외 반환.
- **사후 조건 (Post-condition):** API Key 갱신 완료 후 오류 상태 해제 및 기존 파이프라인 루프 복구(Resume).
- **데이터 요구사항 (Data Requirements):**
    - `api_error_code_integer`
    - `api_error_message_string`
    - `node_state_enum`

### 1.9 [FUNC-EXP-01] 개별 문서 마크다운(.md) 렌더링 및 다운로드 지원

- **설명 (Description):** `COMPLETED` 상태 도달 노드 대상 React UI 다운로드 상호작용 활성화. 최종 JSON 데이터 템플릿 매핑 및 마크다운 변환. Tauri 네이티브 Save Dialog 호출 및 로컬 지정 경로 저장.
- **사전 조건 (Pre-condition):** 대상 노드 최종 JSON 확정.
- **사후 조건 (Post-condition):** 사용자 지정 로컬 디렉토리 내 `.md` 파일 생성 완료.
- **데이터 요구사항 (Data Requirements):**
    - `target_node_id`
    - `final_output_json`
    - `markdown_template_string`
    - `user_selected_file_path_string`

## 2. 문서 노드 상태 정의 (Node State Definitions)

오케스트레이터의 DAG 내 개별 기획 문서 노드 생명주기 통제용 열거형(Enum) 상태값 규격.

- **`PENDING` (대기):** 파이프라인 구동 시점 기본 상태. 선행 산출물 미완성으로 인한 실행 불가 대기 상태.
- **`READY` (실행 가능):** 의존성 선행 노드 전원 `COMPLETED` 도달. 실행 큐 진입. 자동/수동 모드에 따른 전이 대기.
- **`IN_PROGRESS` (진행 중):** 작성 엔진 및 검증 엔진 호출. Best-of-N 생성 및 평가 루프 실제 동작 상태.
- **`COMPLETED` (완료):** 평가 결과 임계치 이상 점수 획득. 최종 산출물 확정 및 다운로드 가능 상태.
- **`PAUSED_HITL` (수동 제어 대기):** 품질 미달 사유 시스템 중단. 관리자 강제 승인 또는 재실행 명령 대기.
- **`PAUSED_API_ERROR` (API 장애 대기):** 할당량 초과, 인증 만료 등 외부 API 통신 장애로 인한 시스템 강제 중단. 인증 갱신 대기.

## 3. 파이프라인 의존성 및 실행 순서 (DAG Specification)

- **[1] PRD** (선행: 없음)
- **[2] FSD** (선행: PRD)
- **[3] User Flow** (선행: FSD)
- **[4] IA** (선행: User Flow)
- **[5] ERD** (선행: FSD)
- **[6] Wireframe** (선행: FSD, User Flow, IA)
- **[7] API 명세서** (선행: FSD, ERD)
- **[8] TC** (선행: PRD, FSD, API 명세서)