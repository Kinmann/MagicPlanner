## Genesis PRD 전용 도메인 평가지표 (총점 70점)
**점수 연산 원칙**
- 각 Metric의 최종 점수 산출 공식: `MAX(0, 기본 점수 - 누적 감점)`
- 감점 발생 시, 감점 사유와 위반된 JSON 블록 또는 식별자를 `critical_errors` 배열에 명확히 기록하십시오.
### Metric D: 요구사항 추출 완전성 및 메타데이터 통제 (Extraction Completeness & Meta Control)
사용자의 비정형 요구사항 원문(`$SOURCE_DOCUMENTS`)에 포함된 암시적/명시적 비즈니스 의도가 누락 없이 추출되었는지, 그리고 메타데이터가 초기화 규칙을 준수하는지 평가합니다.
- **기본 점수:** 15점
- **감점 트리거: 건당 -5점 ~ -10점:**
    - **핵심 컨텍스트 누락 (Core Context Missing): (-10점)** 원문에 명시적으로 언급된 주요 기능 요구사항이나 비즈니스 제약이 `core_epics` 또는 `global_constraints`로 전이되지 않고 파기된 경우.
    - **메타데이터 초기화 위반 (Metadata Init Violation): (-5점)** `version`이 "1.0.0"이 아니거나, `status`가 "DRAFT"로 고정되지 않은 경우.
    - **성공 지표 비정량화 (Unquantified Metric): (-5점)** `success_metrics` 항목이 측정 불가능한 추상적 서술(예: "사용자 만족도 향상")로 작성되어 정량적 수치(Numeric Value)를 포함하지 않은 경우.
### Metric E: 추상화 계층 통제 (Abstraction Layer Control)
Genesis 노드의 제약인 '에픽(Epic) 단위 설계'를 위반하여 마이크로 설계로 진입하는 오버엔지니어링을 기계적으로 검증합니다.
- **기본 점수:** 15점
- **감점 트리거: 발견 시 전액 삭감 (-15점):**
    - **마이크로 설계 개입 (Micro-Design Intrusion):** `core_epics`의 서술 시, UI 버튼 클릭, 세부 데이터베이스 컬럼명/타입, API 파라미터 구조 등 Phase 3(Module Level)에서 다루어야 할 화면 및 물리적 구현 레벨의 명세를 침범하여 작성한 경우 즉시 0점 처리.
### Metric F: 내부 참조 무결성 및 명제 객관화 (Internal Integrity & Objectification)
단일 문서 내에서 새롭게 창조된 식별자들 간의 참조 관계가 온전한지, 그리고 검증 조건이 참/거짓으로 판별 가능한지 검증합니다.
- **기본 점수:** 15점
- **감점 트리거: 건당 -5점:**
    - **고스트 역할 참조 (Ghost Role Reference):** `core_epics` 내 `target_roles` 배열에 포함된 `ROLE-XXX` 식별자가 `user_roles` 블록에서 정의되지 않은 존재하지 않는 역할인 경우 (내부 외래키 제약 위반).
    - **인수 조건 모호성 (Ambiguous Acceptance Criteria):** 에픽의 `acceptance_criteria`가 QA 테스트 엔지니어가 즉시 검증할 수 없는 주관적이고 모호한 서술(예: "UI가 직관적이어야 함")로 작성되어 True/False 판별이 불가능한 경우.
### Metric G: 결정론적 기술 스택 추론 (Deterministic Tech Stack Deduction)
아키텍트의 관점에서 시스템 제약과 비즈니스 목표에 부합하는 단일 기술 스택이 확정되었는지 평가합니다.
- **기본 점수:** 15점
- **감점 트리거: 건당 -5점 ~ -15점:**
    - **모호성 방치 (Unresolved Stack): (-15점)** `tech_stack` 하위 항목에 대해 단일 상수를 결정하지 않고 "TBD", "미정", "추후 결정" 등의 텍스트를 기재하거나, 원문에 명시되지 않았다는 이유로 최적 스택 추론을 포기한 경우. (치명적 결함)
    - **제약 조건 충돌 (Constraint Collision): (-5점)** 도출된 기술 스택이 `global_constraints`에 명시된 성능이나 레거시 연동 제약과 명백하게 기술적으로 충돌하는 경우.
### Metric H: 잠재 요구사항 발굴 및 설계 창의성 (Latent Requirement & Design Creativity)
초기 다단계 생성 모델(Phase I)의 목적에 부합하도록, 입력된 원문의 행간을 파악하여 도메인 특화된 비즈니스 엣지 케이스와 확장된 요구사항을 창의적으로 도출했는지 평가합니다.
- **기본 점수:** 10점
- **감점 트리거: 건당 -5점 ~ -10점:**
    - **1차원적 진부함 (Generic & Cliché Design): (-10점)** 원문의 비전이나 타겟 시장을 심도 있게 분석하지 않고, 어느 시스템에나 존재하는 보편적 기능(예: 단순 회원가입, 기본적인 게시판 CRUD 등)만을 기계적으로 나열하여 비즈니스적 차별성을 전혀 확보하지 못한 경우.
    - **도메인 특화 엣지 결여 (Lack of Domain Edge): (-5점)** 해당 서비스가 속한 특정 산업군(금융, 이커머스, 헬스케어 등)에서 필연적으로 수반되어야 할 필수 잠재 에픽(예: 결제 도메인의 '환불/정산 로직', 상거래 도메인의 '재고 동시성 처리')을 선제적으로 제안하고 발산하는 데 실패한 경우.