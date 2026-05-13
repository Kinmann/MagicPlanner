# 증분 수정(Incremental Refinement) 로직 분석 보고서

본 문서는 MagicPlanner의 현재 증분 수정 로직의 작동 원리와 주요 설정값을 상세히 기록하여, 향후 시스템 개편의 기초 자료로 활용하기 위해 작성되었습니다.

---

## 1. 파이프라인 아키텍처 (Workflow)

현재 시스템은 5단계의 정밀 파이프라인을 통해 사용자의 요청을 아키텍처에 반영합니다.

### Phase 1: 의도 분석 (Intent Parsing)
- **목적**: 사용자의 자연어 요청 및 선택된 코멘트를 분석하여 시스템이 처리 가능한 정형화된 수정 좌표(`IntentSchema`)로 변환.
- **입력 데이터**:
  - **User Request**: 사용자가 입력창에 직접 작성한 수정 요청 사항.
  - **Selected Comments Context**: 에디터에서 사용자가 선택한 코멘트들의 내용, 위치(JSON Path), 원본 데이터가 결합된 컨텍스트.
- **분석 프로세스 (Agentic Loop)**:
  - Gemini 에이전트가 최대 **5회(Max Iterations)**의 사고 루프를 돌며 도구를 호출합니다.
  - `search_artifacts`로 관련 도메인을 탐색하고, `get_artifact_detail`로 실제 JSON 구조를 확인하며 수정이 필요한 정밀 주소(`Canonical ID`)를 확정합니다.
- **핵심 로직**:
  - **자동 주소 교정 (Rule 11 - Redirection)**: 사용자가 기술-도메인이 불일치하는 엉뚱한 위치(예: 프론트엔드 섹션에 백엔드 DB 수정 요청)에 코멘트를 달았을 경우, 에이전트가 `is_context_mismatch: true`로 판단하고 아키텍처 탐색을 통해 **올바른 대상 노드로 주소를 자동 리다이렉션**합니다.
  - **다중 의도 분리 및 합성**: 여러 개의 코멘트나 복합적인 요청이 들어올 경우, 관심사별로 독립적인 `Intent` 항목으로 분리하거나 선후 관계에 따라 논리적으로 합성합니다.
  - **충돌 해결 (Conflict Resolution)**: 동일 블록에 상충하는 요청이 있을 경우 타임스탬프를 기반으로 최신성을 확인하거나 상위 설계 원칙에 부합하는 방향으로 의도를 조정합니다.
  - **영향 범위 진단 (Impact Scope)**: 수정의 성격을 `Local`(단일 노드), `Cross-Module`(인터페이스/연관 모듈), `Global`(전역 스키마/정책)로 분류하여 `IntentSchema`에 기록.
- **주요 도구**:
  - `search_artifacts`: 시맨틱 검색을 통한 관련 문서 추출.
  - `get_system_overview`: 시스템 전체 구조 및 모듈 책임 확인.
  - `get_artifact_detail`: 특정 식별자(`Canonical ID`)의 상세 설계 로드.

### Phase 2: 라우팅 및 상향 검증 (Routing & Upward Validation)
- **목적**: 수정의 성격에 따른 파이프라인 모드(PASS/REFACTORING) 확정 및 상위 설계 원칙과의 정합성 최종 검토.
- **작동 원리 (2-Stage Hierarchy)**:
  1. **Stage 1: 결정론적 휴리스틱 (Baseline Routing)**
     - Phase 1의 `impact_scope`와 `action_type`을 기반으로 보수적인 기본 모드를 설정합니다.
     - 구조적 변경(추가/삭제)이나 `Global` 범위 감지 시 우선적으로 `REFACTORING` 모드를 할당하여 안전망을 확보합니다.
  2. **Stage 2: AI 의미론적 검증 (Semantic Validation & Override)**
     - 타겟 노드가 참조하는 부모 블록(GPRD, SAD 등)을 핀포인트로 추출하여 Gemini 에이전트에게 전달합니다.
     - **전수 상향 검증 (Full Scan)**: 특정 타겟에서 결함이 발견되더라도 즉시 중단하지 않고 **모든 타겟 노드에 대한 검증을 완료**합니다. 이를 통해 사용자는 발생한 모든 설계 모순을 통합된 보고서 형태로 확인할 수 있습니다.
     - **최종 결정권(Decision Power)**: 검증 결과 중 가장 심각한 상태(FAIL > REFACTORING > PASS 순)를 최종 파이프라인 모드로 채택합니다.
     - **오버라이드 로직**: 로컬 수정(`PASS`)으로 판단되었더라도, AI가 상위 설계와의 모순을 감지하면 즉시 `REFACTORING`으로 격상하거나 `FAIL` 처리하여 파이프라인을 중단(`PAUSED_HITL`)시킵니다.
- **상향 검증 메커니즘**:
  - **동적 정의처 탐색 (Dynamic Lookup)**: `artifact_mapping`을 통해 `mapped_` 식별자가 실제로 정의된 노드를 실시간으로 추적하여 검증 컨텍스트를 구성합니다.
  - **컨텍스트 Fallback**: 특정 정의처를 찾을 수 없는 경우, 시스템 최상위 문서인 `GPRD_Context_Goal`을 기본 대조군으로 사용하여 최소한의 설계 방향성 정합성을 유지합니다.
- **결정 결과 (Outcomes)**:
  - **`PASS`**: 다음 단계(Phase 3) 자동 진행.
  - **`FAIL` / `REFACTORING`**: 파이프라인이 `PAUSED_HITL` 상태로 전환되며, 사용자가 AI의 분석 근거(`rationale`)를 검토한 후 수동으로 승인 또는 요청 수정을 결정해야 합니다. (requires-target-confirmation 이벤트 발행)
- **보안/안정성**: AI 검증 단계에서 에러 발생 시 'Fail-Open'을 방지하기 위해 전체 파이프라인을 즉시 중단합니다.

### Phase 3: 양방향 오염 전파 (Bidirectional Taint Cascade)
- **목적**: 직접 수정 대상(`Seed Nodes`)에서 시작하여 `artifact_mapping` 테이블을 유일한 진실의 원천(Source of Truth)으로 활용, 아키텍처 의존성 관계에 있는 모든 잠재적 오염 노드를 기계적으로 식별.
- **전파 메커니즘 (Table-Driven Deterministic Propagation)**:
  1. **식별자 소집 (ID Collection)**:
     - 직접 타겟 노드가 정의하는 모든 아티팩트 ID와 참조하고 있는 `mapped_xxx_id`를 소집합니다.
  2. **하향 전파 (Downward - Referrer Tracking)**:
     - `artifact_mapping` 테이블을 조인하여, 수집된 ID를 참조(`mapped_`)하고 있는 모든 하위/동료 설계 요소를 즉시 추출합니다.
     - 예: 특정 에픽(EPIC-001)이 수정되면, 이를 참조하는 모든 모듈의 PRD, FSD가 기계적으로 감지됩니다.
  3. **상향 전파 (Upward - Definition Tracking)**:
     - 타겟 노드가 참조하는 상위 ID의 '정의처' 노드를 `artifact_mapping` 조인을 통해 역추적합니다.
     - 기존의 하드코딩된 계층 Fallback 대신, 실제 ID 매핑 관계만을 사용하여 불필요한 과잉 오염을 방지합니다.
- **오염 제어 및 효율화 (Efficiency & Precision)**:
  *   **기계적 전파 (API-Free)**: 전파 단계에서 Embedding API 호출을 완전히 배제하고 순수 SQL 조인으로 처리하여, 수백 밀리초 내에 수만 개의 노드 관계를 분석합니다.
  *   **역할 분리**: `apply_taint_cascade`는 모든 가능성 있는 후보를 기계적으로 수집하는 데 집중하며, 실질적인 유사도 검증은 Phase 4(Confirm) 단계의 안전망으로 이관합니다.
- **기술 스택**: 인덱싱된 `artifact_mapping` 테이블과 `document_node` 간의 `DISTINCT` 조인 쿼리를 통해 `O(1)` 수준의 조회 성능으로 전체 오염 범위를 산출합니다.

### Phase 4: 정밀 상태 전이 (Precision Staining)
- **목적**: Phase 3에서 탐색된 영향권 노드 중 실질적 수정이 필요한 노드를 최종 확정하여 오염 피로도(Analysis Fatigue)를 최소화.
- **정밀 판별 로직 (Priority Discriminator)**:
  1. **[1순위] 결정론적 ID 매칭 (ID-Based Match)**:
     - 인텐트의 `target_block_ids` 또는 `target_node_ids`가 해당 노드 본문에 포함되어 있는지 아티팩트 코드를 검색합니다.
     - 매칭 성공 시 유사도 검사를 생략하고 즉시 `STALE`로 확정합니다. (가장 정확하고 빠른 경로)
  2. **[2순위] 의미론적 교차 검토 (Semantic Intersection)**:
     - ID 매칭이 실패한 경우, `Intent`의 벡터와 노드의 조각(Chunk) 벡터 간의 유사도를 측정합니다.
     - 임계값 **0.2 이상**일 경우 실질적인 내용 수정이 필요하다고 판단하여 `STALE`로 전환합니다.
- **상태의 이원화 (STALE vs Impacted)**:
  - **`STALE` (오염)**: 
    - 판별 로직을 통과한 노드. 에디터 UI에서 오염 상태로 강조되며, Phase 5의 자동 패치 생성 파이프라인에 투입됩니다.
  - **`Impacted` (단순 영향)**:
    - 영향권(Phase 3)에는 포함되나 판별 임계값을 넘지 못한 노드. 
    - 상태를 `STALE`로 바꾸지 않고 `last_action`에만 영향 경로를 기록하여 사용자가 나중에 참고할 수 있도록 합니다.
- **기록 및 투명성 (Audit Trail & Quality Gate)**:
  - 모든 상태 전이 결과는 노드의 `last_action` 필드에 기록됩니다.
  - **품질 피드백**: AI 평가 점수가 낮거나(80점 미만) 유사도가 경계선에 있는 경우, `[Warning] AI Evaluation Score is below threshold` 또는 `[Caution] Low Semantic Similarity`와 같은 경고가 명시적으로 기록되어 사용자 검토를 돕습니다.
  - **데이터 정합성**: `is_pass` 필드는 단순 하드코딩이 아닌, 실제 AI 검증 결과와 점수에 따라 동적으로 반영됩니다.

### Phase 5: 패치 생성 및 검증 (Patch Generation & Validation)
- **목적**: `STALE` 노드에 대해 구체적인 수정안(JSON Patch)을 생성하고, AI 평가를 통해 최소한의 품질을 보장합니다.
- **컨텍스트 합성 및 정밀 유도 (Context Synthesis)**:
  - **인텐트 기반 코멘트 반영**: Phase 1에서 사용자가 주입한 의도와 코멘트를 최우선 수정 지침으로 사용합니다.
  - **경로 핀포인팅(Path Pinpointing)**: 인텐트의 아티팩트 ID가 위치한 실제 JSON 경로를 계산하여 `{{PATH_HINTS}}`로 제공함으로써 AI가 수정 위치를 정확히 타격하도록 유도합니다.
  - **전역/주변 컨텍스트 주입**: `SAD Global`(전역 제약)과 `RAG Context`(연관 노드 스니펫)를 함께 제공하여 수정 사항이 전체 아키텍처와 정합성을 유지하게 합니다.
- **RFC 6902 기반 증분 수정 (Incremental Update)**:
  - **최소 변경 원칙**: 문서 전체를 재생성하는 대신 `replace`, `add`, `remove` 연산으로 구성된 **JSON Patch 배열**만 생성합니다.
  - **기술적 이점**: AI의 토큰 소모를 줄이고, 원본 데이터의 불필요한 훼손을 방지하며, 변경 이력을 코드 레벨에서 명확히 관리할 수 있습니다.
- **AI 평가 및 정합성 루프 (Evaluation Loop)**:
  - **점수제 검증 (Threshold: 80)**: 생성된 패치가 적용된 결과를 AI가 독립적으로 평가하여 80점 이상을 획득해야 통과됩니다.
  - **무결성 조건**: '치명적 오류(Critical Errors)'가 1건이라도 발생하면 즉시 반려하고 재수정을 시도합니다. (최대 3회)
  - **유연한 재시도 (State Flexibility)**: 재시도 루프 중에 노드 상태가 `REVIEW_PENDING`으로 변경되더라도 패치 생성을 허용하여 품질이 개선될 때까지 연속적인 수정을 지원합니다.
- **인간 개입(HITL) 강제 전이**:
  - 검증 결과가 완벽하더라도 시스템이 독단적으로 반영하지 않습니다. 모든 결과는 **`REVIEW_PENDING`** 상태로 저장되어 사용자가 디프(Diff)를 직접 확인하고 승인해야만 다음 단계로 진행됩니다. (사용자 주도권 보장)

### Phase 6: 최종 승인 및 동기화 (Finalization & Sync)
- **목적**: 개별 노드의 수정 사항을 프로젝트 전역 아키텍처 데이터베이스와 동기화하고, 다음 단계의 개발 라이프사이클을 활성화합니다.
- **용어 정의 (Terminology)**:
  - **DRAFT**: 노드가 처음 생성되었을 때의 초기 결과물.
  - **REFINED**: `STALE` 상태에서 수정 세션을 거쳐 생성된 증분 수정본.
  - 시스템은 노드의 상태(`STALE`, `REFINING`, `REVIEW_PENDING`, `REVIEWED`)에 따라 UI에서 이 레이블을 동적으로 변경하여 작업 성격을 명확히 구분합니다.
- **아티팩트 매핑 동기화 (Knowledge Sync)**:
  - **ID 추출 및 갱신**: 수정된 결과물에서 새롭게 생성되거나 변경된 모든 `Canonical ID`(식별자)를 추출하여 `artifact_mapping` 테이블에 즉시 반영합니다.
  - **연속성 보장**: 이 과정을 통해 시스템은 '최신 아키텍처 지도'를 보유하게 되며, 이는 차후 수행될 증분 수정의 정밀도를 보장하는 기반 지식이 됩니다.
- **아카이브 및 정합성 정책 (Archiving Policy)**:
  - **확정본 보호**: 하위 노드가 이미 완료된 경우, 확정된 이터레이션의 아카이브는 차단됩니다. (Locked State)
  - **아카이브 시 확정 해제**: 확정된 이터레이션을 아카이브하면 자동으로 `is_pass=0`으로 변경되며, 노드 상태는 `PAUSED_HITL`로 되돌아가 명시적인 재확정을 요구합니다.
  - **가시성 보장**: 확정된 이터레이션은 아카이브 여부와 상관없이 항상 목록에 표시되어 시스템의 최종 의사결정 이력을 추적할 수 있게 합니다.
- **DAG 기반 상태 전파 (State Propagation)**:
  - **후행 노드 활성화**: 완료된 노드에 의존성을 가진 하위 노드들을 식별하여 상태를 `READY`로 자동 전환합니다.
  - **흐름 자동화**: 부모 설계가 확정됨에 따라 하위 설계가 시작될 수 있도록 개발 흐름(Dependency Graph)을 자동으로 진행시킵니다.
- **수정 세션 종료 및 클린업 (Session Closure)**:
  - **인텐트 초기화**: 프로젝트의 `increment_intent` 필드를 비우고 세션 정보를 초기화하여 시스템을 다시 '대기 상태(Stable State)'로 전환합니다.
  - **최종본 동기화**: `generation_iteration`의 승인된 데이터를 `document_node` 테이블의 공식 버전으로 동기화하여 전체 시스템의 데이터 일관성을 확보합니다.
- **결과**: 수정 세션이 공식적으로 종료되며, 사용자는 갱신된 아키텍처 위에서 다음 작업을 시작할 수 있습니다. (SUCCESS 상태 도달)

---

## 2. 주요 설정 및 파라미터 (Settings)

| 항목 | 설정값 | 설명 |
| :--- | :--- | :--- |
파이프라인의 자동화와 정밀도 사이의 균형을 유지하기 위해 다음의 임계값들이 적용되어 있습니다.

| 구분 | 파라미터명 | 설정값 | 용도 |
| :--- | :--- | :--- | :--- |
| **Phase 1** | `MAX_ITERATIONS` | **5회** | Intent Parser의 도구 탐색 최대 횟수 |
| **Phase 3** | `CASCADE_SIMILARITY_CUTOFF` | **0.1** | 오염 전파 탐색 시 시맨틱 필터링 하한선 |
| **Phase 4** | `STAINING_SIMILARITY_THRESHOLD` | **0.2** | `STALE` 상태 전이를 위한 최소 유사도 점수 |
| **Phase 5** | `MIN_EVALUATION_SCORE` | **80점** | 패치 적용을 위한 최소 AI 평가 점수 |

---

## 3. 핵심 데이터 구조 및 파일 (Data & Files)

### 3.1 주요 데이터베이스 테이블
- **`project.increment_intent`**: 현재 세션의 의도 분석 결과(`IntentSchema`)를 저장.
- **`artifact_mapping`**: `Canonical ID`와 참조 관계를 저장하는 인덱스 테이블 (Phase 3의 핵심).
- **`document_embeddings` (vec0)**: 노드별 벡터 데이터를 저장하여 시맨틱 검색 지원.
- **`generation_iteration`**: AI 생성 패치 드래프트 및 평가 점수 저장.

### 3.2 핵심 파일 구성
- **백엔드 (Rust)**:
  - `src-tauri/src/commands/refinement.rs`: 파이프라인 오케스트레이션 및 상태 전이 제어.
  - `src-tauri/src/services/embedding.rs`: 벡터 검색 및 ID 추출 로직.
- **프롬프트 (Prompts)**:
  - `intent_parser.txt`: 의도 분석 및 아키텍처 탐색 지침.
  - `upward_validator.txt`: 상향 정합성 검증 및 정책 결정.
  - `patch_generator.txt`: RFC 6902 기반 증분 수정안 생성.
- **프론트엔드 (TypeScript)**:
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

### 4.2 노드 상태(`node_state`)와 UI 동기화
프론트엔드 파이프라인과 개별 노드의 상태는 유기적으로 작동하며, 각 상태에 따라 UI 버튼 및 편집 권한이 동적으로 변경됩니다.

- **`STALE` (오염됨/수정 필요)**: 
  - **UI**: 노드 타이틀 옆에 주황색 오염 아이콘(`AlertTriangle`)이 노출됩니다.
  - **액션**: 에디터 하단에 `Update (AI Patch)` 버튼이 활성화되어 Phase 5(패치 생성) 실행을 유도합니다.
- **`REVIEW_PENDING` (검토 대기)**: 
  - **UI**: 에디터에 **'기존 내용 vs AI 제안 내용'**의 디프(Diff) 뷰가 노출됩니다.
  - **액션**: `Confirm Change` 및 `Discard` 버튼이 활성화됩니다. 사용자가 `Confirm`을 눌러야만 `REVIEWED`로 전이됩니다.
- **`REVIEWED` (검토 완료)**: 
  - **UI**: 수정 사항이 임시 반영된 상태로 표시됩니다.
  - **동기화 로직**: 모든 관련 노드가 이 상태가 되어야만 사이드바의 **`Acknowledge & Finalize`** 버튼이 활성화되어 Phase 6(지식 동기화)로 진입할 수 있습니다.
- **`PAUSED_HITL` (사용자 확인 대기)**:
  - **발생**: Phase 2에서 설계 모순이 발견되거나 Phase 5에서 패치 생성 실패 시 전환됩니다.
  - **액션**: 에이전트의 중단 사유(Rationale)가 노출되며, 사용자가 직접 내용을 수정하거나 파이프라인을 강제 진행해야 합니다.

### 4.3 주요 UI 컴포넌트 역할
- **`AnalysisMessage`**: `Phase 1` 결과인 `IntentSchema`를 렌더링하며, 수정 유형(Add/Delete/Modify)과 사유를 시각적으로 보여줍니다.
- **`CascadeAnalysisMessage`**: `Phase 3`의 오염 전파 시뮬레이션 결과를 요약하여 보여주며, 영향받는 아티팩트 목록을 카드 형태로 제시합니다.
- **`ImpactReportModal`**: 전체 영향 범위를 전수 조사할 수 있는 상세 모달로, 최종적으로 시스템 오염(Staining)을 승인하는 결정적인 HITL 지점입니다.

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
| **REVIEWED** | **(증분 수정)** 검토 완료 | 패치 확인 후 사용자가 승인한 상태. 하위 노드 트리거 가능. |
| **COMPLETED** | 작업 완료 및 최종 승인 | 세션 종료 시 최종 확정된 상태. |
| **PAUSED_HITL** | 사용자 개입 대기 | 인간의 판단이 필요하여 일시 정지된 상태 |
| **PAUSED_API_ERROR** | API 오류 발생 | LLM 호출 실패 등으로 인해 중단된 상태 |
| **PAUSED_STOPPED** | 사용자에 의한 중단 | 사용자가 수동으로 파이프라인을 멈춘 상태 |