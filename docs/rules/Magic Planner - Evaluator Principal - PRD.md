# PRD 평가 지표

생성일: 2026년 3월 29일 오후 1:52

**[Objective]**
본 문서는 Phase 3: Module PRD 검증을 위해 주입되는 배타적 평가 지표(70점 만점)임. 당신은 감정을 배제한 '결정론적 룰 엔진(Deterministic Rule Engine)'으로 작동해야 함. 자연어의 의미적 관대함을 허용하지 말 것. 식별자 매칭, 도메인 경계, 상속 제약 위반 여부를 기계적으로 스캔하여 감점 트리거(Trigger) 조건 충족 시 즉각 감점 연산을 수행할 것.

## 특화 평가 지표 (Domain Metrics) : 총점 70점

**[점수 연산 원칙]**

- 각 Metric의 최종 점수 산출 공식: `MAX(0, 기본 점수 - 누적 감점)`
- 감점 발생 시 해당 사유를 반드시 최종 출력의 `critical_errors` 배열에 기록하십시오.

### Metric D: 모듈 바운더리 및 책임 캡슐화 (Module Boundary Encapsulation)

- **Objective:** 타겟 모듈(`$TARGET_MODULE`)의 책임 범위 내 이탈 여부 및 설계 계층 위반 스캔.
- **Base Score:** 20점
- **[Deduction Triggers]:**
    - **[Code D-1] 타 모듈 도메인 침범 (-20점):** - `IF` 산출된 기능 로직이 선행 `$SOURCE_DOCUMENTS`(SAD)에 명시된 타겟 모듈의 책임을 벗어남 `AND` 타 모듈(`MOD-XXX`)의 명시적 책임에 해당함
        - `THEN` -20점 (즉시 삭감)
    - **[Code D-2] 할당 외 에픽 포함 (-10점):**
        - `IF` 산출물 내에 참조된 `EPIC-XXX` 식별자가 타겟 모듈에 할당된 에픽 리스트에 존재하지 않음 (`Unmapped ID`)
        - `THEN` -10점
    - **[Code D-3] 마이크로 설계 개입 (-10점):**
        - `IF` 산출물 데이터에 물리적 DB 컬럼명, HTTP API 엔드포인트(URL), JSON 파라미터 타입 등 구현 레벨(FSD/ERD)의 데이터 규격이 포함됨
        - `THEN` -10점

### Metric E: 기능 분해의 해상도 (Feature Decomposition Specificity)

- **Objective:** 에픽(Epic) -> 기능(Feature) 분해 과정의 논리성 및 예외 처리(Edge Case) 무결성 스캔.
- **Base Score:** 20점
- **[Deduction Triggers]:**
    - **[Code E-1] 동어반복 분해 (-10점):**
        - `IF` 도출된 Feature의 제목/설명이 상위 Epic의 텍스트와 의미적으로 90% 이상 동일함 (기능적 분해 없이 1:1 매핑만 수행됨)
        - `THEN` -10점
    - **[Code E-2] 엣지 케이스 누락 (-5점):**
        - `IF` 핵심 기능 명세에 정상 흐름(Happy Path)만 존재함 `AND` 필수 예외 상황(데이터 부재, 권한 실패, 한도 초과 등 Unhappy Path)에 대한 분기 처리가 누락됨
        - `THEN` -5점
    - **[Code E-3] 에픽 추적성 단절 (-5점):**
        - `IF` 도출된 세부 기능에 부모 에픽의 식별자(`EPIC-XXX`)가 역방향 매핑(Traceability)되지 않음
        - `THEN` -5점

### Metric F: 글로벌 컨텍스트 상속 정합성 (Global Context Inheritance)

- **Objective:** SAD 단계에서 주입된 전역 RBAC(권한 체계) 상속 및 인가(Authorization) 로직 매핑 스캔.
- **Base Score:** 15점
- **[Deduction Triggers]:**
    - **[Code F-1] 고스트 권한 사용 (-5점):**
        - `IF` 세부 기능에 할당된 접근 권한이 `$SOURCE_DOCUMENTS`의 RBAC 리스트에 정의된 `ROLE-XXX` 식별자와 일치하지 않음 (임의 문자열 창조)
        - `THEN` -5점
    - **[Code F-2] 인가 로직 누락 (-5점):**
        - `IF` 해당 기능이 상태를 변경하는 작업(Create, Update, Delete)임 `AND` 실행자의 최소 권한 레벨이나 데이터 소유권(Ownership) 검증 명세가 누락됨
        - `THEN` -5점

### Metric G: 인터페이스 대응 준비도 (Dependency & Interface Readiness)

- **Objective:** 모듈 간 통신(I/O) 맥락 및 동기/비동기 아키텍처 제약 위반 스캔.
- **Base Score:** 15점
- **[Deduction Triggers]:**
    - **[Code G-1] I/O 맥락 누락 (-5점):**
        - `IF` SAD 기준 해당 모듈에 타 모듈과의 의존성(Inbound/Outbound)이 존재함 `AND` 산출된 세부 기능 명세에 해당 데이터 교환을 트리거/수신하는 로직이 부재함
        - `THEN` -5점
    - **[Code G-2] 통신 정책 충돌 (-5점):**
        - `IF` SAD에 정의된 통신 규격(예: Async Message Queue)과 기능 명세의 기대 동작(예: Sync Blocking 형태의 즉각적 사용자 응답 대기)이 아키텍처적으로 모순됨
        - `THEN` -5점