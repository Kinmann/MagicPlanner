# Magic Planner: PRD

생성자: 지수 김
생성 일시: 2026년 3월 29일 오후 1:31
카테고리: PLAN
최종 편집자:: 지수 김
최종 업데이트 시간: 2026년 3월 30일 오후 5:39

## 1. 개요 (Product Overview)

- **프로덕트 명칭:** Magic Planner
- **프로덕트 형태:** 로컬 설치형 데스크톱 소프트웨어
- **목표:** 사용자 초기 입력 기반 8종 기획 문서(PRD, FSD, User Flow, IA, Wireframe, ERD, API 명세, TC) 자동 생성 및 검증용 Tauri 기반 자율형 에이전트 구축.
- **핵심 가치:**
    1. **데이터 정합성:** 선행 산출물의 후행 산출물 입력 강제.
    2. **자가 검증:** 다중 샘플링 및 점수 기반 평가 루프 적용.
    3. **보안 및 프라이버시 (BYOK):** 사용자 API 키 로컬 처리 및 중앙 서버 유출 차단.

## 2. 시스템 아키텍처 설계 원칙

- **프롬프트 체이닝 (Prompt Chaining):** 문서 단위 노드 분할 및 순차 실행. 선행 문서 컨텍스트 전달.
- **Best-of-N 최적화:** 노드별 고정 N회 생성-평가 루프 반복 및 최고 점수 산출물 채택.
- **내장형 로컬 DB (Embedded DB):** Rust 백엔드 내 SQLite 정적 링크. 상태 머신 및 이력 영구 보존.
- **로직/프롬프트 분리:** 코어 실행 로직(TypeScript)과 시스템 지침(JSON/Markdown) 물리적 분리.
- **무상태 클라이언트 (Stateless):** 중앙 서버 배제. 로컬 PC와 LLM API 엔드포인트 직접 통신.

## 3. 핵심 모듈 요구사항 (Functional Requirements)

### 3.1 환경 설정 및 입력 모듈 (Config & Input)

- **BYOK 인증:** 사용자 입력 Gemini API Key를 Tauri 보안 스토리지에 암호화 저장.
- **유효성 검증:** API 키 정상 작동 여부 1차 테스트 수행.
- **정보 수집:** 프로젝트 아이디어, 타겟 고객, 비즈니스 목표 수집용 React 기반 UI 제공.

### 3.2 작성 엔진 (Generator Worker)

- **초안 생성:** 할당 문서 종류 및 선행 데이터 기반 문서 초안 작성.
- **피드백 수용:** 이전 회차 평가 점수 및 피드백 반영하여 문서 개선.
- **출력 포맷 강제:** API `response_schema` 활용하여 100% JSON 출력 강제 (단, 서술형 필드 내 Markdown 허용).

### 3.3 검증 엔진 (Evaluator Worker)

- **품질 평가:** 작성 엔진 산출물(JSON) 대상 사전 정의 지표(Rubric) 기반 평가.
- **결과 산출:** 100점 만점 기준 점수(Score) 및 개선 피드백(Feedback) 반환. 최소 통과 임계치(Threshold) 적용.

### 3.4 오케스트레이터 (Orchestrator / Controller)

- **상태 제어:** 상태 머신 기반 문서 생성 순서 제어. 노드 상태(Pending, Ready, In_Progress, Completed, Paused_HITL) SQLite DB 즉시 커밋.
- **루프 제어:** Best-of-N 루프 강제 실행 및 최적 산출물 후행 단계 전달.
- **수동 제어 (HITL):** 임계치 미달로 파이프라인 중단 시, DB 이력 기반 '추가 N회 재실행' 트리거 인터페이스 제공.
- **데이터 내보내기 (Exporter):** 최종 통과 JSON 데이터 대상 템플릿 변환. 로컬 스토리지 내 마크다운(.md) 포맷 파일 저장 및 다운로드 지원.

## 4. 데이터 흐름 및 의존성 (DAG Specification)

단방향 비순환 그래프(DAG) 형태 파이프라인 설계. 데이터 무결성 확보 목적 UI/UX 트랙 순차 도출 강제.

- **Phase 1 (핵심 요구사항 정의):** 초기 입력값 → **[1] PRD** → **[2] FSD**
- **Phase 2 (구조 설계):**
    - Track A (UI/UX): `[2] FSD` → **[3] User Flow** → **[4] IA**
    - Track B (Data): `[2] FSD` → **[5] ERD**
- **Phase 3 (상세 명세):**
    - `[2] FSD` + `[3] User Flow` + `[4] IA` → **[6] Wireframe**
    - `[2] FSD` + `[5] ERD` → **[7] API 명세서**
- **Phase 4 (검증 설계):** `[1] PRD` + `[2] FSD` + `[7] API 명세서` → **[8] TC**

## 5. 비기능 요구사항 (Non-Functional Requirements)

- **보안 (Security):** API 키 외부 전송 아키텍처 단 원천 차단.
- **수동 제어 대기 (HITL Fallback):** N회 반복 후 최고 점수 미달 시 DB 내 노드 상태 `PAUSED_HITL` 기록. 파이프라인 중단 및 사용자 제어 대기.
- **상태 저장 (ACID Persistence):** 앱 강제 종료 대비 생성-평가 루프 및 최종 상태 SQLite 트랜잭션 커밋. 앱 재시작 시 DB 레코드 기반 파이프라인 복구(Resume) 지원.
- **UI 응답성:** LLM API 호출 병목 시 UI 스레드 블로킹 방지. DB 상태 구독 기반 진행 상태 시각적 피드백 제공.

## 6. 개발 및 실행 환경 (Environment Constraints)

- **실행 환경:** 사용자 로컬 PC (Windows, macOS 정적 배포)
- **프레임워크:** Tauri
- **프론트엔드:** TypeScript, React (또는 Vue.js), SCSS
- **백엔드/DB:** Rust, SQLite (단일 물리 파일 관리)
- **LLM 모델 / SDK:** Google Gemini 3.0 Flash, `@google/genai`
- **프롬프트 관리:** 프롬프트 템플릿 및 스키마 프로젝트 에셋 폴더 내 별도 파일 분리. 빌드 시 앱 번들 포함.