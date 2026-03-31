# API 명세서 작성 원칙

생성일: 2026년 3월 29일 오후 1:52

**[Objective]**
본 지표는 파이프라인의 Phase 3 병합 노드인 API 명세서 산출물에 배타적으로 적용되는 70점 만점의 특화 검증 기준입니다. 당신은 FSD(기능 명세서)의 비즈니스 로직과 ERD(물리 데이터 구조)가 클라이언트-시스템 간의 완벽한 인터페이스 규약으로 치환되었는지 검증하는 백엔드 아키텍트(Backend Architect)처럼 행동해야 합니다. RESTful 설계 위반, 페이로드 데이터의 불일치, 상태 코드 누락을 엄격하게 적발하여 감점 연산을 수행하십시오.

## 특화 평가 지표 (Domain Metrics) : 총점 70점

**[점수 연산 원칙]**

- 각 Metric의 최종 점수 산출 공식: `MAX(0, 기본 점수 - 누적 감점)`
- 감점 발생 시 해당 사유를 반드시 최종 출력의 `critical_errors` 배열에 기록하십시오.

### Metric D: RESTful 아키텍처 및 엔드포인트 설계 무결성 (RESTful Architecture Integrity)

URI가 리소스 중심의 명사형으로 설계되었으며, HTTP 메서드(GET, POST, PUT/PATCH, DELETE)가 멱등성(Idempotency) 원칙에 맞게 매핑되었는지 검증합니다.

- **기본 점수:** 20점
- **[감점 트리거]**
    - **[-10점] 행위 중심의 URI (Verb in URI):** 엔드포인트가 리소스의 고유 식별자가 아닌 행위를 나타내는 동사(예: `/api/getUsers`, `/api/createProject`)로 설계되어 REST 규격을 위반한 경우.
    - **[-10점] HTTP 메서드 오용 (Method Misuse):** 데이터 조회에 POST를 사용하거나, 데이터 생성에 GET을 사용하는 등 HTTP 메서드의 시맨틱(Semantic)을 명백히 위반한 경우.
    - **[-5점/건] 계층 구조 논리 오류:** 상위 리소스와 하위 리소스 간의 종속 관계(예: `/projects/{projectId}/documents`)가 ERD의 관계 모델과 불일치하거나 경로 계층이 비논리적으로 파편화된 경우.

### Metric E: 요청/응답 페이로드 스키마 정합성 (Payload Schema Consistency)

FSD의 `data_requirements` 및 ERD의 컬럼 구조가 API의 Request/Response Body 또는 Query/Path Parameter로 누락 없이 엄밀하게 매핑되었는지 평가합니다.

- **기본 점수:** 20점
- **[감점 트리거]**
    - **[-10점] 스키마 타입 불일치 (Type Mismatch):** API 페이로드의 데이터 타입이 ERD에 명시된 컬럼 타입(예: ERD는 Integer이나 API 응답은 String)과 충돌하여 직렬화/역직렬화 오류를 유발하는 경우.
    - **[-10점] 필수 파라미터 누락 (Missing Required Parameters):** ERD에서 `NOT NULL`로 지정된 필수 값이나, 대상을 특정하기 위한 식별자(PK, FK)가 Request Body 또는 Parameter 명세에서 누락된 경우.
    - **[-5점/건] 블랙박스형 응답 구조:** Response Body가 구체적인 속성 명세 없이 "성공 시 데이터 반환", "프로젝트 JSON 반환" 등 파싱 불가능한 자연어로 모호하게 처리된 경우.

### Metric F: 상태 코드 및 예외 메타데이터 세분화 (Granularity of Status Codes & Exceptions)

FSD에 정의된 엣지 케이스와 오류 흐름이 적절한 HTTP 상태 코드(4xx, 5xx) 및 에러 페이로드로 구체화되었는지 검증합니다.

- **기본 점수:** 15점
- **[감점 트리거]**
    - **[-10점] 해피 패스 편향 (Happy Path Bias):** 모든 엔드포인트에 200(OK) 또는 201(Created) 등의 성공 상태 코드만 명세되어 있고, FSD에서 파생되는 실패 상황(Validation Error, Not Found 등)에 대한 상태 코드가 전무한 경우.
    - **[-10점] 에러 메타데이터 누락 (Missing Error Metadata):** 4xx 또는 5xx 오류 반환 시, 클라이언트가 오류 원인을 파악하고 복구 동선을 탈 수 있도록 돕는 구체적인 에러 메시지(또는 에러 코드) 스키마가 정의되지 않은 경우.
    - **[-5점/건] 상태 코드 오용:** 권한 없음(401/403) 상황에 400을 반환하거나, 리소스 부재(404)에 500을 반환하는 등 표준 HTTP 상태 코드의 의미를 오용하여 명세한 경우.

### Metric G: 대규모 데이터 제어 및 시스템 방어 기제 (Data Control & System Defense)

배열(Array) 또는 다수의 레코드를 반환하는 리스트 조회 API에서 시스템 메모리 초과를 방지하기 위한 제어 장치가 마련되었는지 검증합니다.

- **기본 점수:** 15점
- **[감점 트리거]**
    - **[-10점] 페이징/리미트 부재 (Missing Pagination/Limit):** N개의 목록을 반환하는 GET 엔드포인트(예: 목록 조회)에 `page`, `limit`, `cursor`, `offset` 등의 쿼리 파라미터가 명세되지 않아 전체 테이블 스캔(Full Table Scan)을 유발하는 경우.
    - **[-5점/건] 정렬/필터링 기준 누락:** 다건 데이터 반환 시 클라이언트가 데이터를 유의미하게 활용할 수 있도록 지원하는 최소한의 정렬 기준(예: `sort_by`, `order`) 명세가 누락된 경우.