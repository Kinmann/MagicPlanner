# IA 작성 원칙

생성일: 2026년 3월 29일 오후 1:46

## 1. 개요 및 위상 (Overview & Status)

- **위상**: 본 문서는 DAG(단방향 비순환 그래프) 파이프라인의 네 번째 노드임.
- **의존성**: 선행 [3] User Flow에서 식별된 스크린 식별자(`SCR-{NNN}`), 행위자(`Actor`), 그리고 [2] FSD의 기능 명세(`FUNC-{NNN}`)를 핵심 입력원으로 함.
- **목적**: 프로덕트의 전체 화면 구조(Hierarchy)를 정의하고, 주체별(Actor) 진입 경로 및 각 화면에 배치될 기능적 구성 요소를 논리적으로 구조화함.

## 2. IA 특화 작성 통제 원칙 (Domain Principles)

### A. 스크린 식별자 동기화 (Screen ID Synchronization)

- **식별자 계승**: IA에서 정의되는 모든 화면은 반드시 선행 [3] User Flow에서 도출된 `SCR-{NNN}` 식별자를 1:1로 매핑하여 사용해야 함.
- **환각 및 누락 통제**: User Flow에 존재하지 않는 화면의 임의 창조를 엄격히 금지함. 단일 `SCR` 식별자가 여러 경로에서 호출될 경우, 객체를 중복 생성하지 않고 참조 경로(Path)만 다중으로 명시할 것.

### B. 다중 주체별 계층 분리 (Actor-based Separation)

- **진입점 분리**: User Flow에서 다수의 주체(예: `User`, `Admin`, `System`)가 식별된 경우, IA의 최상위 계층(Root)에서 각 주체별 진입점(Portal/Workspace)을 논리적으로 분리하여 설계할 것.
- **접근 권한 매핑(RBAC)**: FSD의 `pre_condition` 및 User Flow의 분기 로직을 참조하여, 각 화면(`SCR`) 단위에 접근 가능한 주체와 최소 권한 레벨을 데이터 필드에 명시할 것.

### C. 계층적 구조 설계 및 예외 화면 편입 (Hierarchical Depth & Exception)

- **3단계 뎁스(Depth) 구조화**:
    1. **Depth 1 (L1)**: 주체별 최상위 메뉴 또는 핵심 서비스 영역 (예: 대시보드, 프로젝트 관리).
    2. **Depth 2 (L2)**: L1 하위의 개별 화면 단위.
    3. **Depth 3 (L3/Elements)**: 화면 내의 주요 탭(Tab), 모달(Modal), 또는 독립적인 기능 블록.
- **예외/순환 경로 화면 반영**: User Flow의 '대체 흐름(Alternative Path)' 및 '재시도 루프(Retry Loop)' 과정에서 파생되는 전용 에러 화면, 인증 만료 모달 등도 누락 없이 L3 요소 또는 독립 스크린으로 IA 구조 내에 편입할 것.

### D. 기능 및 데이터 매핑 (Functional Component Mapping)

- **기능 단위 배치**: 각 화면(`SCR`)에 [2] FSD의 기능 식별자(`FUNC-{NNN}`)를 매핑하여, 해당 화면 내에서 실행 가능한 '원자적 동작'을 명세함.
- **데이터 노출 항목 정의**: FSD의 `data_requirements`를 참조하여, 각 화면에서 사용자에게 노출되어야 할 핵심 데이터 필드를 리스트업할 것.

## 3. 스키마 및 데이터 작성 규칙 (Data Rules)

### A. 화면 명칭의 명사형 강제 (Noun-based Naming)

- **상태/대상 중심 명명**: 모든 메뉴 및 화면명은 동작(Verb)이 아닌 상태 또는 대상을 나타내는 명사형으로 기술할 것. (예: "회원가입 처리" -> "회원가입 폼 화면").

### B. 논리적 경로의 명확성 (Path Clarification)

- **URL/Path 매핑**: 웹/앱 환경을 상정하여, 구조의 종속성을 나타내는 논리적 가상 경로(예: `/admin/users/detail`)를 각 노드에 부여하여 계층의 적합성을 증명할 것.

## 4. 스키마 매핑 주의사항 (Schema Mapping Notes)

- `hierarchy` 배열: `depth`, `parent_id`, `screen_id`, `title`, `actor`, `path` 필드를 통해 트리 구조를 완벽하게 형성할 것.
- `screen_elements` 객체: 해당 화면에 포함된 구성 요소(UI Components)를 FSD의 `FUNC`와 연동하여 정의할 것.
- 모든 텍스트 서술은 공통 시스템 프롬프트의 '분석적이고 건조한 명사형 종결 문체' 규정을 엄격히 준수할 것.