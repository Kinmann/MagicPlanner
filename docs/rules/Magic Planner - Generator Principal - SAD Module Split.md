## 1. SAD - Module Split
**목적**: 시스템을 거시적인 관점(Macro Concern)으로 분할하되, 과도한 파편화를 억제하고 Bounded Context 단위의 높은 응집도를 갖춘 아키텍처 바운더리를 확립함.
### 2.1. 추상화 및 제약 수준 (Level of Abstraction)
- **과적합 및 나노 서비스 분할 엄격 금지 (Anti-Fragmentation)**:
    - 개별 데이터베이스 테이블(예: User, Post, Comment)이나 단순 CRUD 단위로 모듈을 잘게 쪼개는 행위를 엄격히 금지함.
    - 도메인 주도 설계(DDD)의 **Bounded Context** 단위로 모듈을 병합(Consolidate)할 것. (예: `MOD-POST`, `MOD-COMMENT`로 분리하지 말고 `MOD-CONTENT`로 병합).
- **트랜잭션 바운더리 강제 (Transaction Boundary)**: 강한 데이터 일관성(Strong Consistency)과 동기적 트랜잭션 묶음이 필수적인 에픽들은 물리적으로 분산되지 않도록 반드시 단일 모듈 내로 통합할 것.
- **정보 디커플링 (Information Decoupling)**: 모듈 내부의 동작 원리(How)를 기술하지 않음. 해당 모듈이 외부와 '어떻게 연결(Connection)'되는지에만 집중할 것.
### 2.2. 산출물별 데이터 통제 규칙
1. **모듈 목록 및 책임 (Module List & Responsibility)**:
    - 시스템 복잡도를 고려하여 전체 모듈 개수가 불필요하게 팽창하지 않도록 통제함 (일반적인 MVP/중소규모 시스템 기준 1~3개 내외 권장).
    - 각 모듈은 고유한 `MOD-XXX` 식별자를 가지며, 책임(Responsibility)은 해당 Bounded Context 내의 도메인 응집도를 명확히 나타내도록 2문장 이내의 명사형 문체로 제한함.
2. **에픽(Epic) 매핑 (Epic-to-Module Mapping)**:
    - **완전 탐색 원칙**: `core_epics` 배열 내의 모든 `epic_id`는 누락 없이 타겟 모듈 ID에 할당되어야 함.
    - 높은 결합도가 요구되는 여러 개의 연관 에픽을 단일 모듈에 1:N으로 과감히 매핑하여 시스템 통신 비용을 최소화할 것.
3. **모듈 간 의존성/통신망 (Inter-Module Dependency)**:
    - 모듈 간 참조 방향성(A -> B)을 정의할 때 양방향 참조(Bidirectional Dependency)가 발생한다면, 이는 모듈이 잘못 분리되었다는 증거임. 해당 모듈들을 즉시 하나로 병합하여 의존성을 제거할 것.
    - 불가피한 외부 참조의 경우, 통신 방식(예: `SYNC_REST`, `ASYNC_KAFKA`) Enum을 명시하여 순환 참조(Circular Dependency) 없는 단방향 의존성 그래프(DAG)를 확립함.