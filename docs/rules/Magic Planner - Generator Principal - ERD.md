# ERD 작성 원칙

생성일: 2026년 3월 29일 오후 1:46

## 1. 개요 및 위상 (Overview & Status)

- **위상**: 본 문서는 DAG(단방향 비순환 그래프) 파이프라인의 다섯 번째 노드임.
- **의존성**: 선행 [2] FSD(기능 명세서)의 `data_requirements`를 핵심 입력원으로 하며, 기능의 `pre_condition` 및 `post_condition`에서 도출된 권한 및 상태 전이 요구사항을 데이터 모델로 수용함.
- **목적**: 시스템 기능 수행 및 권한 제어에 필요한 원자적 데이터 항목을 논리적/물리적 엔티티(Entity)와 속성(Attribute)으로 구조화하고, 무결성을 보장하는 관계(Relationship)를 정의함.

## 2. ERD 특화 작성 통제 원칙 (Domain Principles)

### A. 데이터 원자성 및 명명 규칙 강제 (Data Atomicity & Naming)

- **원칙**: FSD의 `data_requirements`에서 정의된 원자적 필드 레벨의 명칭과 용도를 계승하여 설계함.
- **표기법 엄격성**: 모든 `table_name`과 `column_name`은 **영문 소문자 스네이크 케이스(snake_case)** 표기법을 예외 없이 적용할 것. (예: `user_profile`, `auth_token_id`).

### B. 권한 모델링 강제 (RBAC Modeling)

- **권한 엔티티 분리**: FSD의 기능 정의 과정에서 시스템 접근 주체(예: `User`, `Admin`, `System`)가 다중으로 식별된 경우, 이를 데이터베이스 레벨에서 통제하기 위한 `Role` 또는 `Permission` 관련 엔티티를 독립적으로 설계할 것.
- **주체-데이터 매핑**: 모든 주체(Actor)는 고유의 식별자(PK)를 가져야 하며, 권한 레벨에 따른 접근 제어가 가능하도록 외래키(FK) 또는 매핑 테이블을 통해 관계를 명확히 구성할 것.

### C. 논리적 정규화 및 N:M 관계 분해 (Normalization & Junction Table)

- **제3정규형(3NF) 준수**: 데이터 중복 최소화 및 무결성 보장을 위해 3NF 이상의 설계를 수행함.
- **다대다(N:M) 관계 원천 금지**: 관계형 데이터베이스의 물리적 제약을 고려하여, 다대다 관계 발견 시 반드시 **매핑 테이블(Junction Table)**을 생성하여 두 개의 1:N 관계로 분해할 것.

### D. 메타데이터 정규화 및 상태 제어 (Metadata & State Control)

- **시스템 필수 속성(메타데이터) 적용 기준**: 데이터 추적성 및 관리 효율을 위해 다음 메타데이터를 포함하되, 엔티티의 성격에 따라 차등 적용함.
    - `created_at`: 레코드 생성 일시 (DateTime). 모든 엔티티에 기본 포함.
    - `updated_at`: 레코드 최종 수정 일시 (DateTime). 로그/이력(History) 등 Insert-Only 엔티티를 제외하고 포함.
    - `is_deleted`: 삭제 여부 (Boolean / Soft Delete 대응용). **마스터 데이터(Master Data) 및 비즈니스 핵심 트랜잭션 엔티티에 한정하여 적용**함. 다대다 해소용 매핑 테이블(Junction Table)이나 이력(Log) 테이블에는 물리적 삭제(Hard Delete) 또는 보존 정책을 따르므로 해당 컬럼 생성을 금지함.
- **상태 전이 속성 강제**: FSD에 명세된 예외 흐름(Exception Flow) 및 트랜잭션의 사후 조건(post_condition)을 데이터베이스가 추적할 수 있도록, 상태 변화가 일어나는 엔티티에는 반드시 `status` (예: PENDING, SUCCESS, FAILED) 컬럼을 배치하여 상태값을 관리할 것.

### E. 참조 무결성 및 생명주기 제어 (Referential Integrity & Lifecycle)

- **식별자 명명 규칙**:
    - Primary Key(PK): `id` 또는 `{table_name}_id` 형식 유지.
    - Foreign Key(FK): 참조 대상 테이블의 PK 명칭을 동일하게 사용하여 일관성 확보.
- **외래키 제약 조건(Constraint) 명시**: 모든 FK에 대해 참조 대상 레코드 삭제/수정 시의 데이터 생명주기 정책(`ON DELETE CASCADE`, `RESTRICT`, `SET NULL` 등)을 FSD의 비즈니스 로직에 근거하여 명확히 지정할 것.

### F. 기본 인덱싱 규칙 제한 (Basic Indexing Rule)

- **인덱스(Index) 지정 제한**: LLM의 과도한 추론(Hallucination)에 의한 오버엔지니어링 방지를 위해, 복합적인 검색 성능 최적화 대신 명확한 식별자에 한해서만 기본 인덱스를 지정함.
- **인덱스 대상 필드 한정**: 기본키(PK), 외래키(FK), 그리고 고유성(Unique)이 보장되어야 하는 대체 식별자(예: `email`, `user_name`)에 한정하여 `index_required` 여부를 명시할 것.

## 3. 스키마 및 데이터 작성 규칙 (Data Rules)

### A. 데이터 타입 추상화 (Logical Data Type)

- 특정 DBMS에 종속되지 않는 범용적 논리 타입(예: String, Integer, Boolean, DateTime, Float, JSON 등)을 사용하여 정의할 것.
- 복잡한 배열이나 비정형 데이터의 경우 `JSON` 타입을 활용하되, 검색 조건으로 자주 사용되는 필드는 별도 컬럼으로 분리(정규화)할 것.

### B. 엔티티 설명의 명료성 (Entity Description)

- 각 테이블 및 컬럼의 용도를 [2] FSD의 기능과 연계하여 명사형 종결 문체로 서술할 것. (예: "결제 트랜잭션의 현재 처리 상태 코드").

## 4. 스키마 매핑 주의사항 (Schema Mapping Notes)

- `entities` 배열: `table_name`, `columns` (name, type, pk, fk, nullable, default, index_required, comment) 정보를 포함함.
- `relationships` 배열: `from_table`, `to_table`, `cardinality`, `on_delete`, `description` 정보를 통해 관계도 구성.
- 모든 텍스트 서술은 공통 시스템 프롬프트의 '분석적이고 건조한 명사형 종결 문체' 규정을 엄격히 준수할 것.