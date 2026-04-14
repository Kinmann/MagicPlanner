# Magic Planner 파이프라인 상태 변환 분석 보고서

이 보고서는 Magic Planner의 3단계 파이프라인에서 각 노드가 취하는 상태값(`NodeState`)과 그 변환 기준(Transition Criteria)을 백엔드 비즈니스 로직 기반으로 분석한 결과입니다.

---

## 1. 공통 상태 정의 (Common Node States)

모든 파이프라인 노드는 `document_node` 테이블의 `node_state` 필드를 통해 관리되며, 다음과 같은 의미를 가집니다.

| 상태값 | 의미 | 전이 조건 (Typical) |
| :------- | :------- | :------- |
| `PENDING` | 대기 중 | 선행 노드 또는 상위 단계가 아직 완료되지 않음 |
| `READY` | 실행 대기 | 모든 의존성이 충족되어 AI 생성을 시작할 수 있음 |
| `IN_PROGRESS` | 생성 중 | `run_pipeline` 계열 함수가 호출되어 AI 루프가 작동 중 |
| `COMPLETED` | 완료 | AI 평가 점수 통과 또는 사용자의 최종 승인이 완료됨 |
| `PAUSED_HITL` | 사용자 개입 대기 | 점수 미달로 인한 검토 대기 또는 수동 승인이 필요한 단계 |
| `PAUSED_API_ERROR`| API 에러 발생 | Gemini API 호출 중 오류 발생으로 인한 일시 중단 |
| `PAUSED_STOPPED` | 강제 중단 | 사용자가 UI에서 직접 중단 버튼을 클릭함 |

---

## 2. Phase 1: Genesis PRD

프로젝트의 초기 아이디어를 기반으로 전체적인 요구사항(PRD)을 정의하는 단계입니다.

### 상태 전이 로직
1.  **초기화**: 프로젝트 생성 시 `Genesis_PRD` 노드는 즉시 `READY` 상태가 됩니다.
2.  **실행**: `run_genesis_prd_pipeline` 호출 시 `IN_PROGRESS`로 변경됩니다.
3.  **루프 및 평가**:
    - AI가 `max_iterations` 만큼 생성을 반복하며 점수가 가장 높은 '최선의 리비전'을 추적합니다.
    - 점수 도달 여부와 상관없이 모든 생성이 끝난 후 상태는 항상 `PAUSED_HITL`로 변경되며 사용자의 최종 확인을 기다립니다.
4.  **수동 승인**: 사용자가 `approve_genesis_prd` 명령을 실행하면 상태가 `COMPLETED`로 확정됩니다.
5.  **페이즈 전이**: `Genesis_PRD` 완료 시 프로젝트의 `pipeline_phase`가 `SAD`로 업데이트되며, `SAD_Global` 노드가 `READY`로 활성화됩니다.

---

## 3. Phase 2: SAD (Architectural Design)

전체 시스템 아키텍처 정의 및 모듈 분할을 수행하는 단계입니다.

### SAD_Global 노드
-   **활성화**: `Genesis_PRD`가 `COMPLETED` 되면 `PENDING` → `READY`.
-   **완료 기준**: 5가지 글로벌 컨텍스트(비기술, 기술스택, ERD, 권한, 인터페이스) 생성이 끝나면 `PAUSED_HITL` 상태가 되며, 사용자의 `confirm_sad_iteration` 호출 시 `COMPLETED`로 전이됩니다.

### SAD_Module 노드
-   **활성화**: `SAD_Global`이 `COMPLETED` 되면 `PENDING` → `READY`.
-   **완료 기준**: 모듈 목록 및 명세 분할이 완료되면 `PAUSED_HITL` 상태가 됩니다. 사용자가 `confirm_sad_iteration`을 통해 최종 확정하면 `COMPLETED`로 전이됩니다.
-   **결과**: 이 시점에서 `create_local_modules`가 실행되어 실제 DB에 모듈들이 생성되고, 프로젝트 페이즈는 `MODULE_GENERATION`으로 넘어갑니다.

---

## 4. Phase 3: Module Generation (Detailed Design)

분할된 각 모듈 내에서 8개의 세부 설계 노드를 생성하는 단계입니다. 이 단계는 **DAG(Directed Acyclic Graph)** 기반의 의존성 전이를 따릅니다.

### 모듈 및 노드 활성화 순서
-   모듈은 `priority_order`에 따라 하나씩 `ACTIVE` 상태가 됩니다.
-   `ACTIVE` 모듈 내에서 `PRD` 노드가 가장 먼저 `READY`가 됩니다.

### 노드별 의존성 맵 (trigger_module_next_nodes)

| 대상 노드 (Target) | 선행 조건 (Prerequisites) |
| :--- | :--- |
| **PRD** (상세 기획) | 모듈 활성화 시 즉시 실행 가능 |
| **FSD** (기능 설계) | `PRD` 완료 |
| **User Flow** | `FSD` 완료 |
| **ERD** (데이터 모델링) | `FSD` 완료 |
| **IA** (정보 구조) | `User Flow` 완료 |
| **Wireframe** (화면 설계) | `FSD`, `User Flow`, `IA` **모두 완료** |
| **API_Spec** | `FSD`, `ERD` **모두 완료** |
| **TC** (테스트 케이스) | `PRD`, `FSD`, `API_Spec` **모두 완료** |

### 상태 전이 메커니즘
1.  **트리거**: 선행 노드가 `COMPLETED` 되면 `trigger_module_next_nodes`가 실행되어 후행 노드를 `PENDING` → `READY`로 변경합니다.
2.  **자동 패스**: 루프 내에서 에디터 피드백의 `is_pass`가 `true`이면 즉시 `COMPLETED`.
3.  **HITL**: 반복 횟수 초과 시 `PAUSED_HITL`로 변경되며 사용자의 승인(`handle_hitl_action`)을 기다립니다.
4.  **모듈 완료**: 한 모듈의 8개 노드가 모두 `COMPLETED` 되면 해당 모듈은 완료되고, 다음 순서의 모듈이 활성화됩니다. 모든 모듈 완료 시 프로젝트가 최종 `COMPLETED` 됩니다.

---

## 5. 특수 상태 및 예외 상황 처리

### 5.1 사용자에 의한 제어
-   **중단 (`stop_node_pipeline`)**: 실행 중인 노드를 `PAUSED_STOPPED`로 강제 전이시킵니다.
-   **재개 (`resume_node_pipeline`)**: 중단되거나 에러가 발생한 노드를 다시 `READY`로 변경하여 파이프라인을 재시작합니다.

### 5.2 리비전 삭제 (`delete_generation_iteration`)
-   노드의 모든 리비전이 삭제되면 상태가 `READY`로 리셋되고 진행 카운트가 0이 됩니다.
-   **Lock Policy**: 후행 작업(예: PRD 완료 후 SAD 진행 중)이 이미 시작된 경우 데이터 무결성을 위해 삭제가 제한됩니다.

### 5.3 재시도 (Retry)
-   `PAUSED_HITL` 상태에서 사용자가 수동으로 수정하거나 설정을 변경한 뒤 다시 실행하면 `READY` → `IN_PROGRESS` 흐름을 다시 타게 됩니다. 이때 `$PREVIOUS_DRAFT`와 피드백이 AI 프롬프트에 주입되어 점진적 개선(Iterative Refinement)이 이루어집니다.

---

## 6. 리비전 선택 및 확정 로직 (Revision Selection Logic)

Magic Planner는 여러 번의 AI 생성 결과(Revision) 중 가장 적절한 것을 선택하고 이를 다음 단계의 공식 컨텍스트로 사용하는 메커니즘을 가지고 있습니다.

### 6.1 Phase 1 (Genesis PRD)
- **선택 방식**: 사용자가 UI에서 특정 리비전을 선택하면 `confirm_genesis_prd_iteration`이 호출됩니다. 승인(`approve_genesis_prd`) 전이라면 언제든 다른 리비전을 선택하여 변경할 수 있습니다.
- **DB 반영**: 해당 이터레이션의 `is_pass` 값을 `1`로 설정하고 나머지를 `0`으로 초기화하여 중복 선택을 방지합니다.
- **확정 로직**: 사용자가 'Approve' 버튼을 누르면 `is_pass=1`인 리비전을 최우선으로, 없으면 최고 점수 기록을 바탕으로 공식 PRD가 확정되며 노드가 `COMPLETED`로 전이됩니다.

### 6.2 Phase 2 (SAD Global / Module)
- **선택 방식**: 사용자가 SAD의 특정 회차를 검토 후 '확정'하면 `confirm_sad_iteration`이 호출됩니다.
- **DB 반영**: 
    1. 해당 회차를 `is_pass=1`로 마킹합니다.
    2. **컨텍스트 평면화**: 회차에 번들링된 JSON 데이터를 파싱하여 `global_context` 테이블에 공식 레코드로 개별 저장합니다.
- **의의**: 이 과정을 통해 생성된 `global_context` 데이터가 Phase 3의 모든 모듈 생성 시 공통 규칙으로 주입됩니다.

### 6.3 Phase 3 (Module Nodes)
- **선택 방식**: 자동 또는 수동.
    - **자동**: AI 평가 결과가 `is_pass: true`인 경우 해당 회차가 자동으로 유효한 리비전이 됩니다.
    - **수동**: `PAUSED_HITL` 상태에서 사용자가 특정 리비전을 승인(`handle_hitl_action`)할 수 있습니다.
- **의존성 전이 로직**: 후행 노드(예: FSD -> ERD)가 실행될 때, 부모 노드의 리비전 중 `is_pass DESC, created_at DESC` 우선순위로 데이터를 조회합니다. 즉, **사용자가 승인하거나 평가를 통과한 최신 데이터**가 설계의 기준점이 됩니다.
