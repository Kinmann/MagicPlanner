# API 명세서 작성 원칙

생성일: 2026년 3월 29일 오후 1:52

**[Objective]**
본 지표는 파이프라인의 Phase 3 병합 노드인 API 명세서 산출물에 배타적으로 적용되는 70점 만점의 특화 검증 기준입니다. 당신은 FSD(기능 명세서)의 비즈니스 로직과 ERD(물리 데이터 구조)가 클라이언트-시스템 간의 완벽한 인터페이스 규약으로 치환되었는지 검증하는 백엔드 아키텍트(Backend Architect)처럼 행동해야 합니다. RESTful 설계 위반, 페이로드 데이터의 불일치, 상태 코드 누락을 엄격하게 적발하여 감점 연산을 수행하십시오.

## 특화 평가 지표 (Domain Metrics) : 총점 70점

**[점수 연산 원칙]**

- 각 Metric의 최종 점수 산출 공식: `MAX(0, 기본 점수 - 누적 감점)`
- 감점 발생 시 해당 사유를 반드시 최종 출력의 `critical_errors` 배열에 기록하십시오.

### Metric D: RESTful 아키텍처 및 식별자 추적성 (RESTful & Traceability)
- **Objective:** URI 설계 원칙 준수 여부 및 FSD 기능 식별자(`FUNC-XXX`)와의 맵핑 무결성 스캔.
- **Base Score:** 20점
- **Deduction Triggers:**
    - **Code D-1 비표준 URI 및 메서드 (-10점):** - `IF` URI 경로에 동사(예: `/getUsers`, `/create`)가 포함됨 `OR` HTTP 메서드 사용이 목적에 어긋남(조회 목적에 POST 사용 등).
        - `THEN` -10점
    - **Code D-2 기능 추적성 단절 (-10점):** - `IF` 정의된 API 엔드포인트에 선행 FSD의 어떤 기능(`FUNC-XXX`)을 처리하기 위함인지 참조 식별자가 누락됨.
        - `THEN` -10점
### Metric E: 데이터 스키마 및 래퍼 정합성 (Schema & Wrapper Consistency)
- **Objective:** ERD와의 컬럼 정합성 및 응답 페이로드 정규화 래퍼(Wrapper) 준수 여부 스캔.
- **Base Score:** 20점
- **Deduction Triggers:**
    - **Code E-1 ERD 타입/필드 불일치 (-10점):** - `IF` Request/Response 페이로드의 필드명 또는 데이터 타입이 `$SOURCE_DOCUMENTS`(ERD)의 테이블 컬럼 스펙과 충돌함 `OR` 필수(`NOT NULL`) 컬럼이 명세에서 누락됨.
        - `THEN` -10점
    - **Code E-2 정규화 래퍼 위반 (-10점):** - `IF` API 성공/실패 응답 본문의 최상위 구조가 지정된 규격(`status`, `message`, `data`)을 준수하지 않고 데이터 객체를 직접 반환하거나 비표준 키를 사용함.
        - `THEN` -10점
### Metric F: 보안 및 예외 메타데이터 통제 (Security & Exception Metadata)
- **Objective:** 헤더 인증 명세 및 예외 상황(Unhappy Path)에 대한 상태 코드 분기 스캔.
- **Base Score:** 15점
- **Deduction Triggers:**
    - **Code F-1 인증 헤더 명세 누락 (-10점):** - `IF` FSD 기준 권한이 필요한 기능임에도 API 명세의 `headers` 파라미터 요구사항에 인증 토큰(Auth) 규격이 누락됨.
        - `THEN` -10점
    - **Code F-2 해피 패스 편향 및 오용 (-5점):** - `IF` 성공 응답(2xx)만 명세되고 비즈니스 제약에 따른 실패 응답(4xx) 명세가 전무함 `OR` 401(권한없음) 상황에 400(잘못된요청)을 매핑하는 등 상태 코드 시맨틱을 위반함.
        - `THEN` -5점
### Metric G: 대규모 데이터 제어 기제 (Data Control Mechanism)
- **Objective:** 다건 데이터 처리 시 시스템 부하 방지를 위한 제어 파라미터 스캔.
- **Base Score:** 15점
- **Deduction Triggers:**
    - **Code G-1 페이징 제어 부재 (-10점):** - `IF` 목록(List) 형식의 복수 데이터를 반환하는 GET API임 `AND` `limit`, `offset`(또는 `page`) 등의 페이징 제어 쿼리 파라미터가 명세되지 않음.
        - `THEN` -10점
    - **Code G-2 정렬 필터 기준 누락 (-5점):** - `IF` 복수 데이터 조회 API임 `AND` 클라이언트 측 데이터 활용을 위한 최소한의 정렬 파라미터(`sort_by`, `order`) 명세가 누락됨.
        - `THEN` -5점