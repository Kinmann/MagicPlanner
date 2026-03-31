# API 명세서 작성 원칙

생성일: 2026년 3월 29일 오후 1:46

## 1. 개요 및 위상 (Overview & Status)

- **위상**: 본 문서는 DAG(단방향 비순환 그래프) 파이프라인의 일곱 번째 노드임.
- **의존성**: 선행 [2] FSD(기능 명세서)의 `FUNC-{NNN}` 식별자 및 비즈니스 로직과 [5] ERD의 논리/물리 데이터 스키마를 핵심 입력원으로 함.
- **목적**: 클라이언트와 서버 간의 데이터 교환을 위한 RESTful 인터페이스 규격을 정의하며, 구현 단계에서 프론트엔드/백엔드 개발의 절대적 기준점(Contract)으로 작용함.

## 2. API 명세서 특화 작성 통제 원칙 (Domain Principles)

### A. RESTful 아키텍처 제약 (RESTful Design Constraints)

- **자원(Resource) 중심의 URI 설계**: URI는 동사가 아닌 **명사(복수형 권장)**로 구성하며, [5] ERD에서 정의된 `table_name`을 자원명으로 우선 차용할 것. (예: `/api/v1/users/{user_id}`).
- **행위와 메서드 분리**: 행위는 URI에 포함하지 않으며, 표준 HTTP Method(GET, POST, PUT, PATCH, DELETE)를 통해 정의함.
    - `POST`: 자원 생성 (Insert)
    - `GET`: 자원 조회 (Select)
    - `PUT/PATCH`: 자원 수정 (Update - 전체/부분)
    - `DELETE`: 자원 삭제 (Delete)

### B. 데이터 정합성 및 의존성 강제 (Data Consistency & Dependency)

- **기능 매핑 강제**: 모든 API 엔드포인트는 [2] FSD에 정의된 `FUNC-{NNN}` 식별자와 1:1 또는 N:1로 반드시 매핑되어야 함.
- **Zero-Hallucination 및 물리적 제약 동기화 (파라미터 통제)**:
    - 요청(Request) 및 응답(Response) 페이로드에 포함되는 모든 필드는 **[5] ERD에 명시된 `column_name`과 데이터 타입을 정확히 계승**해야 함.
    - **제약 조건 일치**: 데이터 타입뿐만 아니라 ERD에 정의된 `Nullable` 여부, 데이터 길이(`Length` 또는 `Max/Min`) 제약 사항을 API 요청의 유효성 검증(Validation) 규격으로 100% 일치시켜 설계할 것.
    - ERD나 FSD에 존재하지 않는 임의의 필드 창조를 엄격히 금지함. (예: ERD에 없는 `nickname` 필드를 API 응답에 임의 추가 불가).
- **명명 규칙 계승**: JSON 페이로드의 모든 Key는 ERD의 원칙을 따라 **영문 소문자 스네이크 케이스(snake_case)** 표기법을 유지할 것.

### C. 권한 및 보안 명세 (Auth & Security Specification)

- **인증 요건 동기화**: FSD의 `pre_condition`을 검토하여 시스템 접근 주체(Actor)의 인증이 필요한 기능인 경우, API 요청의 `Headers` 영역에 인증 토큰(예: Bearer Token) 요구 사항을 명시할 것.

### D. 예외 처리 및 상태 코드 표준화 (Exception & Status Codes)

- **예외 흐름 기반 응답 설계**: FSD의 `Exception Flow`에 기술된 예외 상황들을 분석하여, 각 상황에 부합하는 표준 HTTP Status Code와 에러 메시지 규격을 도출할 것.
    - `200/201/204`: 정상 처리 (Success)
    - `400`: 잘못된 요청 (Validation 실패, 파라미터 누락 등)
    - `401`: 인증 실패 (토큰 누락/만료)
    - `403`: 인가 실패 (권한 부족)
    - `404`: 자원 탐색 실패
    - `409`: 리소스 충돌 (중복 데이터 생성 시도 등)

## 3. 스키마 및 데이터 작성 규칙 (Data Rules)

### A. 파라미터 계층화 및 규격화 (Parameter Hierarchy & Standardization)

- 입력 데이터를 다음의 3가지 계층으로 명확히 분류하여 기재할 것.
    1. `Path Parameters`: URI 자원 식별용 (예: `/users/{id}`).
    2. `Query Parameters`: 검색, 필터링, 페이징 용도. **다건의 목록을 반환하는 GET 메서드의 경우, `limit`, `offset`(또는 `page`), `sort` 등의 페이징 및 정렬 파라미터를 명시적으로 포함시켜 규격화할 것.**
    3. `Request Body`: 리소스 생성 및 수정을 위한 복합 데이터 (POST/PUT/PATCH 요청 시 사용).

### B. 응답 객체 정규화 (Response Object Normalization)

- **통일된 응답 포맷**: 성공 및 실패 응답 모두 일관된 JSON 래퍼(Wrapper) 구조를 가질 것. (예: `status`, `message`, `data` 객체를 포함하는 형태).

## 4. 스키마 매핑 주의사항 (Schema Mapping Notes)

- `endpoints` 배열: `method`, `path`, `func_id`, `summary`, `description`, `headers`, `path_params`, `query_params`, `request_body`, `responses` 정보를 포함함.
- `responses` 객체: 상태 코드(Key)별로 반환되는 페이로드 구조와 예시(`example`)를 구체적으로 기술할 것.
- 모든 텍스트 서술(summary, description 등)은 공통 시스템 프롬프트의 '분석적이고 건조한 명사형 종결 문체' 규정을 엄격히 준수할 것.