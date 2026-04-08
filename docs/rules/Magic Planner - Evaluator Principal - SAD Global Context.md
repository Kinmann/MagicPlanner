## SAD 글로벌 컨텍스트 전용 도메인 평가지표 (총점 70점)
**점수 연산 원칙**
- 각 Metric의 최종 점수 산출 공식: `MAX(0, 기본 점수 - 누적 감점)`
- 감점 발생 시, 감점 사유와 위반된 영역을 `critical_errors` 배열에 명확히 기록하십시오.
### Metric D: 추상화 계층 통제 (Abstraction Layer Control)
매크로 아키텍처 설계의 제약을 위반하는 '오버엔지니어링(Layer Bypass)' 발생 여부를 기계적으로 검증합니다.
- **기본 점수:** 20점
- **감점 트리거: 발견 시 전액 삭감 (-20점):**
    - **마이크로 설계 개입 (Micro-Design Intrusion):** 전역 표준을 정의하는 범위를 넘어, 물리적 데이터베이스의 세부 테이블/컬럼 단위 설계, 특정 API의 엔드포인트 URL 및 파라미터 구조 등 하위 노드(Phase 3)의 산출 영역을 침범하여 명세한 경우 즉시 0점 처리.

### Metric E: 글로벌 컨텍스트 무결성 (Global Context Integrity)
Phase 3, 4에서 상수로 작용할 5대 글로벌 컨텍스트(ERD 표준, RBAC, 에러 규격, 기술 스택, 비기능 제약)의 결정론적 정의 여부를 검증합니다.
- **기본 점수:** 50점
- **감점 트리거: 건당 -10점 (최대 -50점):**
    - **모호성 방치 (Unresolved Ambiguity):** `$SOURCE_DOCUMENTS`(Genesis PRD)에서 `Option<String>`으로 주입된 기술 스택(프레임워크 버전, 캐싱, CI/CD 등)을 단일 상수값으로 고정하지 않고, 여전히 "선택적", "미정", "추후 결정" 등으로 모호하게 남겨둔 경우.
    - **RBAC 위계 누락 (Hierarchy Missing):** 주입된 `GenesisPrdUserRole`을 상속받았으나, 각 권한 식별자 간의 상하 관계(Hierarchy) 논리를 정립하지 않았거나 인증 프로토콜을 명시하지 않은 경우.
    - **통신 규격 불일치 (Protocol Mismatch):** 정의된 에러 페이로드 구조나 인증 프로토콜 규격이 Genesis PRD의 `interface_protocols`(REST, GraphQL, GRPC) 기반과 논리적으로 충돌하는 경우.
    - **정량화 실패 (Quantification Failure):** 비기능 제약(성능, 가용성, 처리량 등)을 측정 불가능한 자연어(예: "트래픽을 원활하게 처리", "빠른 속도")로 기술하여, 테스트 가능한 수치(Numeric Value)로 변환하지 못한 경우.
    - **ERD 메타 표준 누락 (Meta Standard Omission):** 시스템 전역에 적용될 공통 메타 컬럼(예: 생성일, 수정일, 삭제 여부) 및 네이밍 컨벤션 명세를 누락한 경우.