# Wireframe 작성 원칙

생성일: 2026년 3월 29일 오후 1:46

## 1. 개요 및 위상 (Overview & Status)

- **위상**: 본 문서는 DAG(단방향 비순환 그래프) 파이프라인의 여섯 번째 노드임.
- **의존성**: 선행 [2] FSD(기능 명세서)의 `FUNC-{NNN}` 및 `data_requirements`, [3] User Flow의 시나리오 흐름, 그리고 [4] IA의 스크린 식별자(`SCR-{NNN}`) 및 계층 구조를 핵심 입력원으로 함.
- **목적**: 시스템의 논리적 기능과 데이터 요구사항을 사용자가 상호작용할 수 있는 시각적 UI(User Interface) 컴포넌트 및 레이아웃 구조로 변환하여 정의함.

## 2. Wireframe 특화 작성 통제 원칙 (Domain Principles)

### A. 스크린 식별자 절대 동기화 (Screen ID Synchronization)

- **식별자 매핑**: 작성되는 모든 화면 명세는 반드시 [4] IA에서 정의된 `SCR-{NNN}` 식별자와 1:1로 일치해야 함.
- **화면 창조 금지 (Zero-Hallucination)**: IA에 명시되지 않은 새로운 팝업, 모달, 또는 페이지를 임의로 창조하는 것을 엄격히 금지함. 화면 분리가 필요한 경우, 선행 노드(IA, User Flow)의 갱신을 통해서만 수행되어야 함.

### B. UI 컴포넌트와 기능 매핑 (Component-Function Mapping)

- **인터랙션 요소 정의**: 버튼(Button), 폼(Form), 링크(Link) 등 사용자의 액션이 발생하는 모든 상호작용 UI 컴포넌트에는 [2] FSD에 정의된 `FUNC-{NNN}` 식별자를 반드시 매핑할 것.
- **기능 누락 방지**: 해당 `SCR-{NNN}`에 할당된 모든 `FUNC` 식별자는 Wireframe 상의 최소 하나 이상의 UI 컴포넌트와 연결되어야 하며, 매핑되지 않은 고아(Orphan) 기능이 발생하지 않도록 교차 검증할 것.

### C. 데이터 노출 무결성 (Data Exposure Integrity)

- **노출 항목 통제**: 화면(List, Detail, Table 등)에 표시되는 모든 데이터 필드는 [2] FSD의 `data_requirements`에 명시된 항목 범위 내에서만 정의해야 함.
- **임의 데이터 표시 금지**: FSD에 정의되지 않은 더미(Dummy) 텍스트나 통계 지표, 부가 정보 등을 화면에 임의로 배치하는 행위를 금지함.

### D. 레이아웃의 구조적 분할 (Structural Layout Segmentation)

- **구역(Region) 분리**: 화면을 논리적인 레이아웃 영역(예: `Global Navigation Bar`, `Local Navigation Bar`, `Header`, `Main Content`, `Footer`, `Sidebar` 등)으로 명확히 분할하여 컴포넌트를 배치할 것.

## 3. 스키마 및 데이터 작성 규칙 (Data Rules)

### A. UI 상태(State) 명세화 (State-based UI Specification)

- **조건부 렌더링**: [3] User Flow의 분기 조건 및 [2] FSD의 `pre_condition`에 따라, 특정 컴포넌트의 노출 여부 또는 상태(`Default`, `Hover`, `Disabled`, `Error`, `Hidden`)를 명시할 것. (예: "권한이 없는 경우 버튼 Disabled 처리").

### B. 컴포넌트 명세의 원자성 (Atomic Component Description)

- **UI 타입 지정**: 각 구성 요소는 프론트엔드 개발자가 즉시 인지할 수 있는 표준 UI 타입(예: `TextInput`, `Dropdown`, `Checkbox`, `DataTable`, `Modal`, `Toast`)으로 명확히 지정할 것.
- **레이블링(Labeling)**: 버튼명, 입력창의 Placeholder, 테이블의 컬럼명 등 사용자에게 직접 노출되는 텍스트를 구체적이고 직관적인 명사형으로 기술할 것.

## 4. 스키마 매핑 주의사항 (Schema Mapping Notes)

- `screens` 배열: `screen_id`(`SCR-{NNN}`), `screen_name`, `layout_regions` 정보를 포함함.
- `layout_regions` 객체 내 `components` 배열: `type`, `label`, `mapped_func_id`, `mapped_data_fields`, `state_condition`, `description` 필드를 통해 UI 요소를 상세히 정의할 것.
- 모든 텍스트 서술은 공통 시스템 프롬프트의 '분석적이고 건조한 명사형 종결 문체' 규정을 엄격히 준수할 것.