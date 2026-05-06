# 증분 수정(Incremental Refinement) 로직 분석 보고서

본 문서는 MagicPlanner의 현재 증분 수정 로직의 작동 원리와 주요 설정값을 상세히 기록하여, 향후 시스템 개편의 기초 자료로 활용하기 위해 작성되었습니다.

---

## 1. 파이프라인 아키텍처 (Workflow)

현재 시스템은 5단계의 정밀 파이프라인을 통해 사용자의 요청을 아키텍처에 반영합니다.

### Phase 1: 의도 분석 (Intent Parsing)
- **목적**: 자연어 요청을 기술적인 수정 좌표(`IntentSchema`)로 변환.
- **방식**: Gemini 에이전트가 도구(Function Calling)를 사용하여 관련 아티팩트를 검색하고 수정 범위를 식별.
- **주요 도구**:
  - `search_artifacts`: 시맨틱 검색을 통한 관련 문서 추출.
  - `get_system_overview`: 시스템 전체 구조 및 모듈 책임 확인.
  - `get_artifact_detail`: 특정 식별자(`Canonical ID`)의 상세 설계 로드.

### Phase 2: 라우팅 및 상향 검증 (Routing & Upward Validation)
- **목적**: 수정의 성격을 규정하고 상위 설계 원칙과의 정합성 검토.
- **정책 결정**:
  - `REFACTORING` 모드: 구조적 변경(Add/Delete) 또는 광범위한 영향(Global) 감지 시 활성화. (상향 전파 허용)
  - `PASS` 모드: 국부적인 수정 시 활성화. (하향 전파 위주)
- **상향 검증**: 타겟 노드가 참조하는 부모 블록(GPRD 등)을 핀포인트로 추출하여 Gemini가 정합성 확인.

### Phase 3: 양방향 오염 전파 (Bidirectional Taint Cascade)
- **목적**: 직접 수정 대상 외에 간접적으로 영향을 받는 모든 노드 식별.
- **전파 방향**:
  - **하향(Downward)**: 수정된 블록을 참조하는 모든 하위 설계 노드 추적.
  - **상향(Upward)**: `REFACTORING` 모드일 때 모듈 목록이나 아키텍처 스키마로 영향 전파.
- **기술 기반**: `artifact_mapping` 테이블을 통한 `O(1)` 역참조 검색.

### Phase 4: 정밀 상태 전이 (Precision Staining)
- **목적**: 불필요한 오염 경보를 최소화하고 확실한 노드만 `STALE`로 전환.
- **검증 레이어**:
  1. **상태 기반**: 기존 `COMPLETED` 노드 여부.
  2. **식별자 매칭**: 인텐트의 `target_block_ids`가 노드 본문에 포함되었는지 확인.
  3. **시맨틱 유사도**: 임베딩 유사도가 **0.2** 이상인 경우 (RAG 기반 Fallback).

### Phase 5: 패치 생성 및 적용 (Patch Generation)
- **목적**: `STALE` 노드에 대해 구체적인 수정안(JSON Patch) 생성.
- **방식**: 기존 JSON 데이터와 분석된 인텐트를 대조하여 시각적 Diff로 사용자에게 제시.

---

## 2. 주요 설정 및 파라미터 (Settings)

| 항목 | 설정값 | 설명 |
| :--- | :--- | :--- |
| **Similarity Threshold** | `0.2` | 시맨틱 유사도 판정 기준 (RAG 검색 시 활용) |
| **Max LLM Iterations** | `5` | 의도 분석 시 에이전트의 최대 사고/도구 호출 횟수 |
| **RAG Top-K** | `5` | 아티팩트 검색 시 참조할 최상위 문서 조각 수 |
| **Canonical ID 포맷** | `MODULE:TYPE:ID` | 시스템 전반에서 사용하는 고유 식별자 주소 체계 |
| **Upward Trigger** | `Add`, `Delete` | 구조 변경 시 상향 전파를 자동 활성화하는 액션 타입 |

---

## 3. 핵심 데이터 구조 및 파일

### 백엔드 (Rust)
- `src-tauri/src/commands/refinement.rs`: 전체 파이프라인 오케스트레이션.
- `src-tauri/src/services/embedding.rs`: RAG 검색, ID 추출, 유사도 계산 로직.
- `src-tauri/prompts/generator/`:
  - `intent_parser.txt`: 의도 분석 프롬프트.
  - `upward_validator.txt`: 상향 정합성 검증 프롬프트.
  - `patch_generator.txt`: JSON 패치 생성 프롬프트.

### 프론트엔드 (TypeScript)
- `src/store/refinementStore.ts`: `UpdateStep` 기반 상태 머신 관리.
- `src/components/layout/RightPanel.tsx`: 파이프라인 시각화 및 단계별 버튼 제어.
- `src/components/Project/ImpactReportModal.tsx`: 상세 영향 분석 보고서 출력 및 승인 UI.

---

## 4. 프론트엔드 상태 머신 및 UI 로직 (Frontend Logic)

증분 수정은 사용자의 승인이 필요한 **HITL(Human-In-The-Loop)** 방식으로 설계되었습니다. 프론트엔드는 `UpdateStep` 상태에 따라 UI를 전환하고 백엔드 명령을 호출합니다.

### 4.1 파이프라인 단계별 상호작용 (HITL)

| 단계 (`UpdateStep`) | UI 노출 내용 | 사용자 액션 (버튼) | 다음 단계 |
| :--- | :--- | :--- | :--- |
| **ANALYZING** | 에이전트 사고 로그 및 의도 분석 결과 | (진행 중 - 대기) | `CONFIRMATION` 또는 `VALIDATION_RESULT` |
| **CONFIRMATION** | 타겟 노드 및 수정 의도 요약 | **Validate Constraints** | `VALIDATING` -> `VALIDATION_RESULT` |
| **VALIDATION_RESULT** | 상향 설계 정합성 검증 보고서 | **Confirm & Cascade** | `CASCADING` -> `CASCADE_CONFIRMATION` |
| **CASCADE_CONFIRMATION** | 오염 전파 시뮬레이션 결과 (영향 범위) | **Approve Impact & Apply** | `AWAITING_UPDATE` |
| **AWAITING_UPDATE** | 에디터 내 노드 갱신 안내 메시지 | (에디터에서 각 노드 **Update** 실행) | `REVIEWING_RESULT` |
| **REVIEWING_RESULT** | 최종 결과물(Patch) 검토 상태 | **Acknowledge & Finalize** | `SUCCESS` |

### 4.2 노드 상태값에 따른 에디터 행동 제어

프론트엔드 파이프라인과 개별 노드의 `node_state`는 유기적으로 작동하며, 각 상태에 따라 UI 버튼 및 편집 권한이 동적으로 변경됩니다.

1.  **STALE (오염됨/수정 필요)**:
    - **발생 시점**: 백엔드의 `confirm_taint_cascade` 호출 시, 영향 범위 내의 노드들이 이 상태로 전환됩니다.
    - **UI 변화**: 에디터 상단에 `[Update]` 버튼이 나타나며, 기존 내용을 유지한 채 AI가 새로운 패치를 생성할 준비를 합니다.
2.  **REFINING (패치 생성 중)**:
    - **발생 시점**: `STALE` 상태에서 `[Update]` 버튼을 클릭하여 증분 수정 파이프라인이 실행 중일 때의 상태입니다.
    - **UI 변화**: 진행 상태 바가 표시되며, 에디터는 읽기 전용 상태가 됩니다.
3.  **REVIEW_PENDING (검토 대기)**:
    - **발생 시점**: 패치 생성이 완료되어 AI가 제안한 Diff가 에디터에 반영되었으나, 사용자가 아직 승인/반려 버튼을 누르지 않은 상태입니다.
    - **UI 변화**: 에디터 상단에 `[Approve]` 및 `[Discard]` 버튼이 활성화됩니다.
4.  **REVIEWED (검토 완료)**:
    - **발생 시점**: 사용자가 패치 결과를 확인하고 수락(`Approve`)했으나, 아직 전체 증분 수정 세션이 종료(`Finalize`)되지 않은 중간 상태입니다.
    - **UI 변화**: `[Finalize]` 세션 종료 전까지 유지되는 상태입니다.
5.  **COMPLETED (최종 승인)**:
    - **발생 시점**: 사용자가 에디터에서 AI의 제안을 최종 승인하거나, 신규 생성 시 최종 확정했을 때의 상태입니다. (세션 종료 후 최종 도달하는 상태)
6.  **PAUSED_HITL (사용자 확인 대기)**:
    - **발생 시점**: 파이프라인 도중 에이전트가 판단을 내리기 어렵거나, 상향 검증 결과에 충돌이 있어 사용자의 결정이 필요한 경우입니다.

---

## 5. 전체 노드 생애주기 및 상태값 상세 (Node Lifecycle & States)

MagicPlanner의 모든 노드는 아래와 같은 상태 전이를 거치며 관리됩니다.

| 상태 (`node_state`) | 설명 | 비고 |
| :--- | :--- | :--- |
| **PENDING** | 선행 작업 대기 중 | DAG 상의 부모 노드가 완료되지 않은 상태 |
| **READY** | 작업 실행 가능 | 모든 선행 조건이 충족되어 파이프라인을 돌릴 수 있는 상태 |
| **IN_PROGRESS** | 신규 생성 진행 중 | AI가 처음부터 초안을 작성하고 있는 상태 |
| **STALE** | **(증분 수정)** 내용 오염됨 | 상위 설계 변경에 의해 현재 내용의 정합성이 깨진 상태 |
| **REFINING** | **(증분 수정)** 정제 진행 중 | `STALE` 노드에 대해 AI가 변경 사항(Patch)을 적용 중인 상태 |
| **REVIEW_PENDING** | **(증분 수정)** 패치 검토 중 | AI가 제안한 패치가 투영되어 사용자의 승인/반려를 기다리는 상태 |
| **REVIEWED** | **(증분 수정)** 검토 완료 | 패치 적용 후 사용자가 내용을 확인했으나 아직 세션이 종료되지 않은 상태 |
| **COMPLETED** | 작업 완료 및 최종 승인 | 최종 결과물이 확정되어 하위 노드로 전파 가능한 상태 |
| **PAUSED_HITL** | 사용자 개입 대기 | 인간의 판단이 필요하여 일시 정지된 상태 |
| **PAUSED_API_ERROR** | API 오류 발생 | LLM 호출 실패 등으로 인해 중단된 상태 |
| **PAUSED_STOPPED** | 사용자에 의한 중단 | 사용자가 수동으로 파이프라인을 멈춘 상태 |

### 4.3 주요 UI 컴포넌트 역할

- **AnalysisMessage**: `Phase 1` 결과인 `IntentSchema`를 렌더링합니다. 수정 유형(Add/Delete/Modify)과 사유를 시각적으로 보여줍니다.
- **CascadeAnalysisMessage**: `Phase 3`의 시뮬레이션 결과를 요약하여 보여주며, 영향받는 아티팩트 목록을 카드 형태로 제시합니다.
- **ImpactReportModal**: 전체 영향 범위를 전수 조사할 수 있는 상세 모달로, 최종적으로 시스템 오염(Staining)을 승인하는 결정적인 HITL 지점입니다.
