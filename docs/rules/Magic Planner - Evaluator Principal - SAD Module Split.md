**점수 연산 원칙**
- 각 Metric의 최종 점수 산출 공식: `MAX(0, 기본 점수 - 누적 감점)`
- 감점 발생 시, 감점 사유와 위반된 식별자(ID)를 `critical_errors` 배열에 명확히 기록하십시오.
### Metric D: 추상화 계층 통제 (Abstraction Layer Control)
모듈 분할 과정에서 내부 동작 원리까지 개입하는 오버엔지니어링(Layer Bypass) 발생 여부를 검증합니다.
- **기본 점수:** 15점
- **감점 트리거: 발견 시 전액 삭감 (-15점):**
    - **내부 로직 서술 (Internal Logic Description):** 모듈 간의 '관계(What/Connection)'에 집중하지 않고, 특정 모듈 내부의 구체적인 함수 호출 순서, DB 쿼리 방식 등 마이크로 구현 로직(How)을 침범하여 명세한 경우 즉시 0점 처리.
### Metric E: Bounded Context 응집도 및 에픽 완전 탐색 (Cohesion & Epic Exhaustion)
시스템이 과적합(Over-fragmentation) 없이 거시적 관점으로 분할되었으며, 주입된 요구사항을 100% 매핑했는지 검증합니다.
- **기본 점수:** 30점
- **감점 트리거: 건당 -5점 ~ -15점:**
    - **고아 에픽 발생 (Orphaned Epic): (-15점)** `$SOURCE_DOCUMENTS`(Genesis PRD)에 존재하는 `EPIC-XXX` 식별자 중, 어떠한 모듈(`MOD-XXX`)에도 할당되지 않고 누락된 에픽이 단 1건이라도 존재하는 경우. (치명적 결함)
    - **나노 서비스 파편화 (Nano-Service Fragmentation): (-10점)** 모듈이 논리적인 Bounded Context 단위로 병합되지 않고, 개별 DB 테이블(예: User, Post)이나 단순 CRUD 수준으로 지나치게 잘게 쪼개져 시스템 복잡도를 폭증시킨 경우.
    - **트랜잭션 바운더리 위반 (Transaction Boundary Violation): (-10점)** 강한 데이터 일관성과 동기적 처리가 필수적인 연관 에픽들이 서로 다른 모듈로 물리적으로 분산 할당되어, 구조적으로 불필요한 분산 트랜잭션을 유발하는 경우.
    - **식별자 규격 위반 (Invalid Module ID): (-5점)** 분할된 모듈에 부여된 식별자가 시스템 지정 패턴(`^MOD-[A-Z0-9-]+$`)을 준수하지 않은 경우.
### Metric F: 의존성 위상수학 검증 (Dependency Topological Verification)
각 모듈 간의 연결망(토폴로지)이 논리적으로 타당하며 런타임 결함 요소가 없는지 평가합니다.
- **기본 점수:** 25점
- **(감점 트리거: 건당 -5점 ~ -15점):**
    - **양방향 및 순환 참조 (Bidirectional & Circular Dependency): (-15점)** 모듈 간 `A <-> B` 형태의 직접적인 양방향 참조나, `A -> B -> A` 형태의 순환 고리가 도출된 경우. 이는 모듈 분할의 명백한 실패 증거이므로 즉각 병합(Consolidate) 대상으로 간주하여 중징계 처리함.
    - **통신 프로토콜 미지정 (Protocol Undefined): (-5점)** 선행 확정된 글로벌 통신 규격을 준수하지 않고, 모듈 간 의존성 링크에 통신 방식(예: `SYNC_REST`, `ASYNC_KAFKA`) Enum 값이 누락된 경우.
    - **미고립 모듈 (Isolated Module): (-5점)** 단독 실행되는 마이크로서비스가 아님에도 불구하고, 전체 시스템 토폴로지 내에서 다른 어떤 모듈과도 Inbound/Outbound 의존성을 맺지 않은 완벽한 고립 모듈이 존재하는 경우.