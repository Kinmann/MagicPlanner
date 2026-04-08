## 1. SAD - Module Split
**목적**: 시스템을 독립적인 관점(Concern)으로 분할하여, 하위 마이크로 설계 에이전트들의 작업 바운더리를 캡슐화하고 오버엔지니어링을 방지함.
### 1.1. 추상화 및 제약 수준 (Level of Abstraction)
- **정보 디커플링 (Information Decoupling)**: 모듈 내부의 동작 원리(How)를 기술하지 않음. 해당 모듈이 '무엇(What)'을 책임지는지, 그리고 외부와 '어떻게 연결(Connection)'되는지에만 집중할 것.
- **식별자 기반 토폴로지**: 모듈을 정의할 때 반드시 시스템 고유 식별자 패턴(예: `^MOD-[A-Z0-9-]+$`)을 부여하며, 모든 의존성 및 에픽 매핑은 해당 식별자와 Genesis PRD의 식별자 간 관계로만 표현함. 자연어 서술에 의한 관계 정의를 금지함.
### 1.2. 산출물별 데이터 통제 규칙
1. **모듈 목록 및 책임 (Module List & Responsibility)**:
    - 단일 책임 원칙(SRP)에 의거하여 시스템을 분할하고, 각각 고유한 `MOD-XXX` 식별자를 할당함.
    - 각 모듈의 책임(Responsibility)은 최대 2문장 이내의 명사형 문체로 제한하여 기술함.
2. **에픽(Epic) 매핑 (Epic-to-Module Mapping)**:
    - **완전 탐색 원칙**: 주입된 `GenesisPrdSchema.core_epics` 배열 내의 모든 `epic_id` (`^EPIC-[A-Z0-9-]+$`)는 단 1건의 누락도 없이 타겟 모듈 ID(`MOD-XXX`)에 할당되어야 함.
    - 특정 에픽이 여러 모듈에 걸쳐 있는 경우 (N:M 매핑), 주 책임(Primary) 모듈과 보조(Secondary) 모듈을 명확한 속성값으로 구분하여 데이터화할 것.
3. **모듈 간 의존성/통신망 (Inter-Module Dependency)**:
    - 모듈 식별자 간의 참조 방향성(예: `MOD-ORDER` -> `MOD-PAYMENT`)을 정의하여 의존성 그래프(DAG) 구조를 산출함.
    - 각 의존성 링크에는 선행 산출된 '글로벌 컨텍스트'의 기준 및 `GenesisPrdInterfaceProtocols`에 맞춰 통신 방식(예: `SYNC_REST`, `ASYNC_KAFKA`, `GRPC`)을 Enum 형태로 반드시 매핑할 것. 순환 참조(Circular Dependency) 구조가 도출되지 않도록 구조적 결함을 사전 검증함.