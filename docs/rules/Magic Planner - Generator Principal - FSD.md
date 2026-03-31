# FSD 작성 원칙

생성일: 2026년 3월 29일 오후 1:44

## 1. 개요 및 위상 (Overview & Status)

- **위상**: 본 문서는 DAG(단방향 비순환 그래프) 파이프라인의 두 번째 노드이며, 후행되는 모든 기술/설계 문서(User Flow, ERD, Wireframe, API 명세서 등)의 핵심 데이터 허브(Hub) 역할을 수행함.
- **목적**: 선행 PRD에서 정의된 비즈니스 요구사항(What)을 시스템이 구체적으로 어떻게 동작해야 하는지(How)에 대한 논리적, 절차적 명세로 변환함.

## 2. FSD 특화 작성 통제 원칙 (Domain Principles)

### A. 절대적 추적성 보장 (Absolute Traceability)

- **식별자 매핑 강제**: 선행 문서(PRD)의 `Requirement ID`(`REQ-{NNN}`)를 누락 없이 1:1 또는 1:N으로 매핑하여 시스템 기능을 도출해야 함.
- **FSD 고유 식별자 발급**: 도출된 기능 단위마다 `FUNC-{NNN}` 형태의 고유 식별자를 부여함. 각 `FUNC` 객체는 반드시 `mapped_req_id` 필드를 통해 PRD의 원본 의도와 연결되어야 함.

### B. 환각 창조 통제 및 예외 처리 상세화 (Zero-Hallucination & Exception Logic)

- **권한 회수**: 선행 PRD에 명시되지 않은 새로운 비즈니스 목적의 기능이나 화면 뎁스의 임의 창조를 전면 금지함.
- **시스템적 대응 로직 포함**: 기능 설명(`description`) 필드 내에 데이터 입력 제한(길이, 포맷, 필수 여부), 중복 체크, 동시성 제어 등 예외 상황에 대한 시스템적 대응 로직을 반드시 포함하여 기술할 것.

### C. 시스템적 상태 전이 명세 (Systemic State Transition)

- 모든 기능(`FUNC`)의 `pre_condition`과 `post_condition`은 추상적 감정이나 사용자 심리 상태가 아닌, 다음의 시스템적 지표로 기술할 것.
    - **데이터베이스 상태**: 특정 레코드의 생성, 변경(Update), 삭제(Delete) 여부.
    - **인증 및 권한**: 특정 세션의 보유 여부, ACL(Access Control List) 권한 수준 등.
    - **시스템 플래그**: 특정 프로세스의 완료 상태, 에러 플래그 설정 여부 등.

### D. 원자적 데이터 요구사항 정의 (Atomic Data Requirements)

- **데이터 원자성(Atomicity) 확보**: `data_requirements` 기술 시 '사용자 정보', '결제 내역'과 같은 복합 명사 사용을 금지함.
- **필드 레벨 분할**: `user_id`, `email`, `encrypted_password`, `transaction_amount` 등 실제 DB 컬럼 및 API 파라미터로 치환 가능한 원자적(Atomic) 필드 단위로 분할하여 기재할 것. 이는 후행 ERD 및 API 명세서 생성의 직접적인 근거가 됨.

## 3. 스키마 매핑 주의사항 (Schema Mapping Notes)

- **로직의 분절화**: `flow` 및 `logic` 관련 배열 작성 시, "1. 사용자 식별자 검증", "2. DB 트랜잭션 시작" 등 개발자가 즉각적으로 코드로 변환할 수 있는 수준의 명확한 단문(명사형 종결)으로 기술할 것.
- **입출력 명시**: 각 기능 수행에 필요한 입력(Input) 및 출력(Output) 데이터의 매핑 관계를 `data_requirements`와 연동하여 정의할 것.
- **톤앤매너**: 공통 시스템 프롬프트의 '문체 강제' 조항에 따라 모든 필드를 건조하고 분석적인 명사형 종결 문체로 유지할 것.