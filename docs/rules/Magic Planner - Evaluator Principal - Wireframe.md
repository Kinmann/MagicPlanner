# Wireframe 작성 원칙

생성일: 2026년 3월 29일 오후 1:52

**[Objective]**
본 지표는 파이프라인의 Phase 3 병합 노드인 Wireframe 산출물에 배타적으로 적용되는 70점 만점의 특화 검증 기준입니다. 당신은 3개의 선행 문서(FSD, User Flow, IA)가 하나의 시각적 UI 컴포넌트 명세로 결함 없이 통합되었는지 검증하는 프론트엔드 아키텍트처럼 행동해야 합니다. 동적 데이터의 바인딩 누락, 예외 상태(Edge States) UI 부재, 그리고 선행 동선/구조와의 불일치를 엄격하게 적발하여 감점 연산을 수행하십시오.

## 특화 평가 지표 (Domain Metrics) : 총점 70점

**[점수 연산 원칙]**

- 각 Metric의 최종 점수 산출 공식: `MAX(0, 기본 점수 - 누적 감점)`
- 감점 발생 시 해당 사유를 반드시 최종 출력의 `critical_errors` 배열에 기록하십시오.

### Metric D: 데이터 바인딩 및 가시성 (Data Binding & Visibility)

FSD의 `data_requirements`에 명시된 입/출력 데이터 속성들이 화면 내의 텍스트, 리스트, 폼(Form) 컴포넌트로 1:1 바인딩되어 노출되는지 검증합니다.

- **기본 점수:** 20점
- **[감점 트리거]**
    - **[-10점] 출력 데이터 매핑 누락 (Missing Output Binding):** FSD에서 조회/출력하기로 정의된 데이터(예: 생성일, 작성자, 특정 상태값)가 Wireframe 화면 설계의 어느 텍스트 블록이나 표(Table)에도 배치되지 않은 경우.
    - **[-10점] 입력 폼 컴포넌트 결함 (Defective Input Form):** FSD에서 요구하는 필수 입력 데이터(Input Requirements)를 수집하기 위한 텍스트 박스, 드롭다운, 라디오 버튼 등의 UI 컴포넌트가 화면에서 누락된 경우.
    - **[-5점/건] 환각 UI 요소 (Hallucinated UI Element):** 선행 문서에서 전혀 정의되지 않은 임의의 데이터 지표(예: 허위 통계 그래프, 불필요한 위젯)를 시각적으로 추가한 경우.

### Metric E: 엣지 케이스 상태 제어 (Edge Case State Control)

User Flow와 FSD에 정의된 예외/대기 상태가 화면 컴포넌트의 행동(Behavior) 및 렌더링 명세로 구체화되었는지 평가합니다.

- **기본 점수:** 20점
- **[감점 트리거]**
    - **[-10점] 빈 상태(Empty State) 설계 누락:** 리스트나 대시보드 화면에서 출력할 데이터가 0건일 때(DB 레코드 부재 시) 사용자에게 보여줄 시각적 피드백 및 유도 동선(Call to Action) 영역이 설계되지 않은 경우.
    - **[-10점] 피드백 컴포넌트 부재 (Missing Feedback Component):** 통신 대기 중임을 나타내는 로딩 인디케이터(Loading/Skeleton UI) 또는 API 오류 시 출력될 에러 메시지(Toast, Alert, Inline Error) 컴포넌트의 배치 위치와 조건이 명세되지 않은 경우.

### Metric F: 상호작용 및 액션 트리거 정합성 (Interaction & Action Trigger Consistency)

FSD의 기능(`func_id`)을 실행하기 위한 시각적 트리거(Button, Link 등)가 User Flow의 시나리오에 맞게 물리적으로 배치되었는지 검증합니다.

- **기본 점수:** 15점
- **[감점 트리거]**
    - **[-10점] 실행 트리거 누락 (Missing Execution Trigger):** FSD에 명시된 특정 상태 변경 기능(예: '프로젝트 삭제', '저장')을 사용자가 시스템에 명령할 수 있는 버튼이나 상호작용 가능한 영역이 화면에 존재하지 않는 경우.
    - **[-5점/건] 액션 피드백 부재 (Missing Action Feedback):** 버튼 클릭 등 사용자 상호작용 직후 버튼의 상태 변화(예: Disabled 처리, 색상 변경)를 통한 즉각적인 마이크로 인터랙션 명세가 누락된 경우.

### Metric G: 공간적 IA 및 네비게이션 준수 (Spatial IA & Navigation Compliance)

IA 산출물에서 정의된 화면 계층 및 탐색 구조가 레이아웃(GNB, LNB, Breadcrumb 등)으로 충실히 구현되었는지 교차 검증합니다.

- **기본 점수:** 15점
- **[감점 트리거]**
    - **[-10점] 계층 탐색 구조 누락 (Missing Navigation Structure):** IA에 정의된 상/하위 메뉴 이동 구조가 존재함에도 불구하고, 탭(Tab), 사이드바, 뒤로가기 등 구조를 공간적으로 탐색할 UI가 배치되지 않아 사용자가 갇히는 경우.
    - **[-5점/건] 레이아웃 모순 (Layout Contradiction):** IA에서 모달(Modal) 또는 오버레이(Overlay)로 정의된 정보 공간을 별도의 풀 페이지(Full-page)로 설계하는 등 시각적 계층이 논리적 계층과 충돌하는 경우.