# TC 작성 원칙

생성일: 2026년 3월 29일 오후 1:46

## 1. 개요 및 위상 (Overview & Status)

- **위상**: 본 문서는 DAG(단방향 비순환 그래프) 파이프라인의 여덟 번째 노드이자 최종 검증 명세서임.
- **의존성**: 선행 [1] PRD(요구사항 정의서)의 `REQ-{NNN}`, [2] FSD(기능 명세서)의 `FUNC-{NNN}`, 그리고 [7] API 명세서의 입출력 규격 및 상태 코드를 핵심 입력원으로 함.
- **목적**: 구현된 시스템이 설계된 논리적 명세와 100% 일치하게 동작하는지 검증하기 위한 원자적(Atomic)이고 기계적인 테스트 절차를 정의함.

## 2. TC 특화 작성 통제 원칙 (Domain Principles)

### A. 커버리지 균형 및 예외 테스팅 (Coverage Balance & Exception Testing)

- **부정 케이스 편입 강제**: 긍정 케이스(Happy Path / Positive Case)에 편향된 테스트 설계를 금지함.
- **경계값 분석(BVA) 적용**: FSD와 API 명세서에 정의된 데이터 제약 조건(Length, Nullable, Format)을 기반으로, 경계값 분석 및 동등 분할(Equivalence Partitioning) 기법을 적용한 부정 케이스(Negative/Edge Case)를 반드시 도출할 것.

### B. 단일 검증 원칙 (Single Verification Principle)

- **검증의 원자성**: 하나의 테스트 케이스(`tc_id`)는 오직 하나의 `expected_result`(예상 결과)만 검증하도록 원자적으로 분할할 것.
- **복합 검증 금지**: "로그인이 완료되고 대시보드로 이동하며 환영 이메일이 발송된다"와 같은 복합적인 결과 예측을 하나의 TC에 병합하는 것을 엄격히 금지함. 해당 시나리오는 3개의 독립된 TC로 분리되어야 함.

### C. 재현의 독립성 및 기계적 지시 (Reproduction Independence)

- **사전 지식 배제**: 시스템에 대한 사전 지식이 없는 제3자나 자동화 도구(Automated Test Runner)가 한 치의 오차 없이 동일한 환경을 구성하고 실행할 수 있도록 작성해야 함.
- **구체적 상태 명세**: `pre_conditions` 및 `test_steps`는 "적절한 값 입력"과 같은 모호한 표현을 배제하고, "email 필드에 'test@example.com' 입력"과 같이 명확하고 기계적인 지시어로 서술할 것.

### D. 추적성 및 의존성 매핑 (Traceability & Dependency Mapping)

- **식별자 교차 검증**: 모든 TC는 어느 요구사항(`REQ-{NNN}`)과 기능(`FUNC-{NNN}`)을 검증하는지 추적 가능하도록 매핑 식별자를 명시해야 함. 식별자가 매핑되지 않은 고아(Orphan) TC의 생성을 금지함.

## 3. 스키마 및 데이터 작성 규칙 (Data Rules)

### A. 예상 결과(Expected Result)의 공학적 명세

- **상태 전이 기반 검증**: 추상적인 UI 상태("화면이 예쁘게 나옴")가 아닌, 다음의 시스템적 지표로 결과를 기술할 것.
    - API 응답 코드 (예: `HTTP 200 OK`, `HTTP 400 Bad Request`).
    - 데이터베이스 상태 전이 (예: `user` 테이블에 레코드 1건 Insert 확인).
    - 명시적인 에러 메시지 (예: "비밀번호는 8자리 이상이어야 합니다" 출력).

### B. Setup 및 Teardown 고려

- 테스트 수행 전/후의 데이터 오염을 막기 위해, 데이터 세팅(Setup)과 복구(Teardown)에 필요한 논리적 요건을 `pre_conditions` 또는 독립적인 설명 필드에 포함할 것.

## 4. 스키마 매핑 주의사항 (Schema Mapping Notes)

- `test_cases` 배열: `tc_id`, `mapped_req_id`, `mapped_func_id`, `tc_type` (Positive/Negative), `title`, `pre_conditions`, `test_steps`, `expected_result` 정보를 포함함.
- `test_steps` 배열: 순차적인 실행 절차를 배열로 분리하여 명세할 것.
- 모든 텍스트 서술은 공통 시스템 프롬프트의 '분석적이고 건조한 명사형 종결 문체' 규정을 엄격히 준수할 것.