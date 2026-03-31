# User Flow 작성 원칙

생성일: 2026년 3월 29일 오후 1:45

## 1. 개요 및 위상 (Overview & Status)

- **위상**: 본 문서는 DAG(단방향 비순환 그래프) 파이프라인의 세 번째 노드임.
- **의존성**: 선행 [2] FSD(기능 명세서)의 `FUNC-{NNN}` 식별자와 `Flow/Logic` 데이터를 핵심 입력원으로 함.
- **목적**: 시스템 중심의 기능 명세를 사용자 시나리오 기반의 시퀀스(Sequence)로 재구성하여, 후행 [4] IA 및 [6] Wireframe의 구조적 토대를 마련함.

## 2. User Flow 특화 작성 통제 원칙 (Domain Principles)

### A. 기능 기반 경로 설계 및 추적성 (Function-Based Path Design)

- **식별자 매핑**: User Flow의 모든 액션(Action) 노드는 FSD에 정의된 `FUNC-{NNN}` 식별자와 1:1 또는 1:N으로 대응되어야 함.
- **추적성 유지**: 각 스텝(Step) 작성 시, 해당 스텝이 실행하는 `FUNC` ID를 데이터 필드 내에 명시하여 기능적 정합성을 증명할 것.

### B. 행위자(Actor) 식별 및 다중 역할 분리 (Swimlane Specification)

- **주체 명시**: 모든 `User Action` 노드는 해당 행위를 수행하는 주체(예: `Guest`, `User`, `Admin`, `System`)를 반드시 명시해야 함.
- **교차 흐름 제어**: 서로 다른 권한을 가진 Actor 간의 상호작용(예: 사용자의 승인 요청 -> 관리자의 승인)이 발생할 경우, 각 주체의 상태 전이를 독립적인 스텝으로 분할하여 기술할 것.

### C. 엣지 케이스 및 대체 흐름 독립 명세 (Alternative Path Specification)

- **정상/대체 흐름 분리**: 정상적인 진행 흐름(Happy Path)뿐만 아니라, 네트워크 오류, 권한 거부, 입력값 검증 실패 등 대체 흐름(Alternative Path)을 독립적인 스텝으로 명시할 것.
- **상태 기반 분기**: FSD의 `Exception Flow`를 기반으로 의사결정(Decision) 노드를 설계하며, 분기 조건은 이진(Binary) 또는 다중 분기 형태로 명확히 서술할 것.

### D. 흐름의 무결성 및 액션-반응의 필연성 (Action-Reaction Inevitability)

- **시스템 반응 강제**: 모든 사용자 액션(Action)은 상태 변화, 화면 이동, 혹은 에러 메시지 출력 등 명확한 시스템 반응(`system_response`)을 반드시 동반해야 함.
- **상태 전이 동기화**: `system_response`는 FSD의 `post_condition`에 명시된 시스템 상태 변화(DB 업데이트, 세션 변경 등)와 논리적으로 일치해야 함.

### E. 화면 단위의 식별 (Screen Discovery)

- **스크린 ID 예비 할당**: 각 단계에서 사용자에게 노출되는 인터페이스 단위를 `SCR-{NNN}` 형태의 임시 식별자로 관리할 것. 이는 후행 [4] IA 생성 시 화면 리스트의 직접적인 근거가 됨.

## 3. 스키마 및 데이터 작성 규칙 (Data Rules)

### A. 진입, 이탈 및 순환(Loop) 경로의 엄격한 정의

- **최초 진입 조건**: 흐름 시작 전 요구되는 시스템적/사용자적 전제 조건(Entry Point)을 명확히 정의할 것.
- **최종 완료 상태**: 흐름이 종료되는 시점의 최종 상태(Exit State/Success State)를 명시하여 경로의 완결성을 확보할 것.
- **재시도 루프(Retry Loop) 설계**: 예외(Exception) 분기 발생 시, 단순 종료가 아닌 '사용자 입력 수정 및 재시도'를 위한 순환 경로(`edges`의 역방향 참조)를 설계하여 데드락(Deadlock)을 방지할 것.

### B. 원자적 스텝 서술 (Atomic Step Description)

- **단일 책임 원칙**: 하나의 스텝(`step`) 필드에는 오직 하나의 의미 있는 액션 또는 반응만 기술함.
- **명사형 종결 문체**: 분석적 관점에서 '대상 + 행위' 조합의 건조한 문체를 유지할 것. (예: "검색 필터 적용", "결과 리스트 갱신").

## 4. 스키마 매핑 주의사항 (Schema Mapping Notes)

- `nodes` 배열: `id`, `type`(Action/Decision/Screen), `actor`(주체), `label` 필드를 통해 흐름의 각 지점을 정의함.
- `edges` 배열: `from_id`, `to_id`, `condition` 필드를 통해 노드 간의 전이 관계와 발생 조건을 기술함.
- 모든 필드는 공통 시스템 프롬프트의 '명사형 종결 문체' 조항을 준수하여 작성할 것.