## 1. SAD - Global Context 
**목적**: 하위 모든 파이프라인(Phase 3, 4)에서 불변의 상수로 작용할 시스템 전역 표준 규격(5종)의 결정론적 정의. **입력 스키마 제약**: `[Source Documents]`로 주입된 Genesis PRD 스키마 데이터를 절대적인 진실 공급원(SSOT)으로 상속받아야 함.
### 1.1. 추상화 및 제약 수준 (Level of Abstraction)
- **전역성 강제**: 특정 도메인 로직이나 개별 비즈니스 피처(Feature)에 종속된 설계를 엄격히 금지함. 시스템 전체를 관통하는 기반(Infrastructure) 및 공통 규칙만을 산출할 것.
- **테이블/API 명세 작성 불가**: 개별 물리 테이블 구조, 컬럼 타입, API 엔드포인트 경로 등 마이크로 설계 영역의 개입을 차단함.
### 1.2. 산출물별 데이터 통제 규칙
1. **ERD 표준 (Database Standards)**:
    - 명명 규칙(Naming Convention)을 정규식 또는 Enum(예: `snake_case`, `camelCase`) 형태로 확정할 것.
    - 시스템 내 모든 테이블이 필수적으로 상속받아야 할 메타 컬럼(예: `created_at`, `updated_at`, `is_deleted`)의 속성을 정의함.
2. **권한 (RBAC - Role Based Access Control)**:
    - **SSOT 상속**: `GenesisPrdUserRole` 배열에 정의된 `role_id`와 `permissions_level`을 누락이나 변형 없이 1:1로 상속할 것.
    - 각 권한의 위계(Hierarchy) 구조를 설정하고, `auth_protocol`에 부합하는 인증/인가 상수를 선언함.
3. **에러 통신 규격 (Error Standard)**:
    - `api_type`의 특성에 맞는 전역 에러 응답 객체의 표준 JSON 구조(Payload Schema)를 정의함.
    - 도메인별 예외가 아닌, 시스템 공통 예외에 대한 통신 프로토콜 표준 코드 매핑 기준을 명시함.
4. **기술 스택 (Tech Stack)**:
    - **SSOT 상속**: `GenesisPrdTechStack` 객체 하위의 프레임워크, 런타임, 인프라 Enum 값을 변경 없이 상수화할 것.
    - `Option<String>` 처리되어 누락된 세부 버전이 있다면, 아키텍트 판단하에 가장 안정적인 단일 메이저 버전을 고정값으로 확정함.
5. **비기능 제약 (Non-Functional Requirements)**:
    - **SSOT 상속**: `GenesisPrdGlobalConstraints`의 `compliance` 및 `performance` 텍스트를 파싱하여 가용성, 응답 속도, TPS 등을 정량적 수치(Numeric Value)로만 변환하여 기술함.