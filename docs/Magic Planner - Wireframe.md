# Magic Planner: Wireframe

생성자: 지수 김
생성 일시: 2026년 3월 30일 오전 11:04
카테고리: PLAN
최종 편집자:: 지수 김
최종 업데이트 시간: 2026년 3월 30일 오전 11:40

## 1. [SCR-001] 전역 인증 설정

- **연관 페이지 ID:** `PAGE-001`
- **레이아웃 명세:** 전역 인증 설정 화면. 중앙 정렬된 단일 카드 레이아웃. FSD의 FUNC-INP-01 및 ERD의 `user_session.api_key_encrypted` 데이터와 매핑됨.

| 컴포넌트 타입 | 레이블 | 행동 규칙 (Behavior) |
| --- | --- | --- |
| `TextInput` | Gemini API Key | **Empty:** 'AI Studio에서 발급받은 키를 입력하세요' Placeholder 노출. 타이핑 시 텍스트 마스킹(***) 처리. |
| `Button` | 저장 및 인증 | **Loading:** 경량 API 검증 호출 중 스피너 애니메이션 출력 및 버튼 비활성화.

**Error:** 검증 실패 시 버튼 하단에 `auth_error_message` 붉은색 텍스트 출력. |

## 2. [SCR-002] 글로벌 대시보드

- **연관 페이지 ID:** `PAGE-002`
- **레이아웃 명세:** 글로벌 대시보드 화면. 상단 GNB(Global Navigation Bar) 및 본문 그리드 뷰 레이아웃. ERD의 `project` 테이블 목록 데이터를 렌더링.

| 컴포넌트 타입 | 레이블 | 행동 규칙 (Behavior) |
| --- | --- | --- |
| `Header` | Magic Planner 대시보드 | 상단 고정 렌더링. 우측에 '설정' 아이콘 제공 (클릭 시 PAGE-001 라우팅). |
| `Button` | 새 프로젝트 생성 | 클릭 시 PAGE-002-M01(프로젝트 생성 모달)을 현재 화면 위에 오버레이 렌더링. |
| `GridList` | 프로젝트 목록 | **Empty:** '생성된 프로젝트가 없습니다' 텍스트 및 일러스트 노출.

**데이터 존재 시:** 프로젝트명 및 생성일 카드 타일 노출. 카드 클릭 시 PAGE-003 라우팅. |

## 3. [SCR-002-M01] 신규 프로젝트 생성 모달

- **연관 페이지 ID:** `PAGE-002-M01`
- **레이아웃 명세:** 신규 프로젝트 생성 모달. ERD의 `project.project_name` 및 `project.pipeline_execution_mode` 입력을 수집하여 FUNC-PRJ-01 기능으로 전달.

| 컴포넌트 타입 | 레이블 | 행동 규칙 (Behavior) |
| --- | --- | --- |
| `TextInput` | 프로젝트 명칭 | **Empty:** '예: AI 헬스케어 앱' Placeholder.

**Error:** 미입력 상태로 제출 시 붉은색 보더 라인 활성화 및 '필수 입력값입니다' 경고 출력. |
| `RadioGroup` | 파이프라인 실행 모드 | 항목: AUTO(자동), MANUAL(수동 승인). 기본값으로 AUTO가 선택된 상태 유지. |
| `Button` | 프로젝트 생성 | **Loading:** DB 레코드 커밋 중 스피너 표출. 완료 시 모달을 닫고 생성된 프로젝트의 PAGE-003으로 라우팅. |

## 4. [SCR-003] 프로젝트 워크스페이스

- **연관 페이지 ID:** `PAGE-003`
- **레이아웃 명세:** 프로젝트 워크스페이스 내 텍스트 수집 화면. 좌측 LNB(Local Navigation Bar)와 우측 메인 콘텐츠 분할. ERD `project.raw_input_text` 데이터 바인딩.

| 컴포넌트 타입 | 레이블 | 행동 규칙 (Behavior) |
| --- | --- | --- |
| `TextArea` | 초기 아이디어 및 타겟 고객 입력 | **Empty:** 최소 50자 이상 요구하는 안내 Placeholder. 하단에 실시간 글자 수 카운터(0/50 최소) 렌더링. |
| `Button` | 파이프라인 가동 | **Error:** 글자 수가 50자 미만일 때 클릭 시 비활성화 진동(Shake) 애니메이션 및 `validation_error_message` 툴팁 노출. 성공 시 FUNC-INP-02 호출 및 PAGE-003-V01 뷰 전환. |

## 5. [SCR-003-V01] 파이프라인 모니터링 보드

- **연관 페이지 ID:** `PAGE-003-V01`
- **레이아웃 명세:** DAG 기반 파이프라인 모니터링 보드. 각 블록은 ERD `document_node` 및 `generation_iteration` 테이블의 상태/점수 데이터와 실시간 매핑됨.

| 컴포넌트 타입 | 레이블 | 행동 규칙 (Behavior) |
| --- | --- | --- |
| `ProgressBar` | 전체 파이프라인 진행률 | COMPLETED 노드 개수 / 전체 노드 개수의 비율을 가로 막대 형태로 렌더링. |
| `CardList` | 문서 노드(PRD, FSD 등) 블록 8종 | 상태별 렌더링 변화.

**PENDING:** 회색 반투명

**READY:** 대기 아이콘

**IN_PROGRESS (Loading):** 맥박(Pulse) 애니메이션 및 실시간 최고 점수 표출

**COMPLETED:** 녹색 체크표시

**Error (PAUSED_HITL/API):** 붉은색 경고 강조. |
| `Button` | 마크다운 다운로드 (Export) | 해당 노드 블록 내에 위치. 노드 상태가 COMPLETED일 때만 활성화. 클릭 시 FUNC-EXP-01 호출(Save Dialog 실행). |

## 6. [SCR-003-M01] 수동 개입(HITL) 경고 모달

- **연관 페이지 ID:** `PAGE-003-M01`
- **레이아웃 명세:** 수동 개입(HITL) 경고 모달. ERD `generation_iteration` 내 `critical_errors_array` 및 `actionable_feedback_text` 필드의 평가 데이터 표출.

| 컴포넌트 타입 | 레이블 | 행동 규칙 (Behavior) |
| --- | --- | --- |
| `TextBlock` | 미달 사유 및 상세 피드백 | **Error** 상태 표출. JSON 배열로 수신된 에러 로그를 리스트(ul/li) 형태로 렌더링. |
| `NumberInput` | 추가 실행 횟수 (N) | 기본값 '3'. 1~10 사이의 정수만 입력 가능하도록 폼 제약 적용. |
| `ButtonGroup` | 액션 컨트롤 (승인 / 재실행) | '강제 승인' 클릭 시 상태 무시 완료 처리.

'재실행' 클릭 시 FUNC-ORC-02 API 페이로드 전송, **Loading** 스피너 후 모달 닫힘. |

## 7. [SCR-003-M02] 런타임 API 통신 장애 알림 모달

- **연관 페이지 ID:** `PAGE-003-M02`
- **레이아웃 명세:** 런타임 API 통신 장애 알림 모달. 최상단 z-index에 렌더링되며 사용자 행동을 강제(Blocking). `document_node.api_error_code` 매핑.

| 컴포넌트 타입 | 레이블 | 행동 규칙 (Behavior) |
| --- | --- | --- |
| `TextBlock` | API 오류 상세 정보 | **Error** 상태 강제 표출. '할당량 초과(429)' 등 코드와 메세지를 붉은색 배경 박스에 렌더링. |
| `Button` | API Key 갱신 | 클릭 시 현재 진행 상태 파이프라인을 일시 멈춤으로 DB 커밋(`FUNC-ORC-03`) 후, 즉시 PAGE-001(환경 설정) 페이지로 라우팅. |