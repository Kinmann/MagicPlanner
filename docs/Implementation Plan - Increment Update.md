# Magic Planner: Increment Update 적용 상세 구현 계획

본 문서는 `Magic Planner - increment update.md`에 기술된 5단계 지능형 수정 파이프라인을 시스템에 구현하기 위한 **엔지니어링 명세서**입니다. 하위 에이전트가 본 계획을 읽고 즉시 코드를 작성할 수 있도록 DB 쿼리, 상태 전이, 파일 구조를 상세히 정의합니다.

## 확정된 기술 정책 (Architecture Decisions)

> [!NOTE]
> **트랜잭션(Transaction) 및 에러 복구 정책**
> 무조건적인 자동 롤백(`tx.rollback()`) 대신, 최대 에러 반복 한도 초과 시 즉각 롤백하지 않고 사용자에게 개입을 요청(HITL)하여 추가 루프(Loop)를 돌릴지 롤백할지 결정하도록 설계합니다.

> [!NOTE]
> **Tauri - 프론트엔드 상태 동기화 정책**
> 폴링(Polling) 방식 대신 Tauri의 Event Emission (`app.emit(...)`)을 사용하여 `STALE`, `COMPLETED` 등 노드의 아키텍처 상태 전이를 즉시 React UI에 푸시하고 렌더링합니다.

---

## Proposed Changes

### Sprint 1: 의도 추출 및 인텐트 파싱, 라우팅 엔진 구축
사용자의 자연어 "수정 요청"을 시스템이 이해할 수 있는 정형 데이터로 변환하고, 최소한의 수정 타겟을 도출하는 첫 관문입니다.

#### Step 1: 의도 추출 및 구조화 (Intent Extraction)
- **상세 설명:** 사용자가 자연어로 입력한 모호한 수정 요청(예: "결제 모듈에 포인트 기능 추가해줘")을 시스템이 처리가능한 파라미터로 변환합니다. `Intent Parser Agent`는 DB 조회 없이 순수 NLP 추론을 통해 행위(`action_type`: ADD/MODIFY/DELETE)와 방향성, 그리고 시스템 연관부 스캔 목적의 범용적 검색 키워드(search_keywords)를 도출합니다.
- **[MODIFY] [commands.rs](file:///d:/Experiments/MagicPlanner/src-tauri/src/commands.rs)**
  - **추가할 Command:** `parse_intent`
  - **구현 로직:** 시스템 프롬프트 작성 및 Gemini API 연동. `{ "action_type": "...", "target_feature": "...", "search_keywords": ["..."] }` 객체 100% JSON 반환 보장 설계.

#### Step 2: 아키텍처 타겟 라우팅 (Architecture Target Routing)
- **상세 설명:** 파싱된 범용 의도를 바탕으로, 단편적인 벡터 검색(RAG)의 정보 누락을 방지하기 위해 `genesis_PRD`와 `SAD_Global`, `sad_module_list` 등 전체 아키텍처 윤곽 데이터를 라우터 에이전트 프롬프트에 통째로 직접 주입(Global Context Injection)합니다. 이를 통해 에이전트가 단편이 아닌 앱 전체를 조망하여(God's Eye View), 수정이 직접적으로 발생해야 할 최소 시작 노드들의 식별자 배열(`target_nodes`)을 정확히 짚어냅니다.
- **[MODIFY] [commands.rs](file:///d:/Experiments/MagicPlanner/src-tauri/src/commands.rs)**
  - **추가할 Command:** `route_architecture_target`
  - **구현 로직:** `global_context` 테이블에서 대상 컨텍스트를 로드한 뒤 프롬프팅. 반환된 `target_nodes` 목록을 프론트엔드 라우터로 넘겨 사용자 1차 확인 유도.

### Sprint 2: 글로벌 제약 검증 및 DAG 기반 국소 오염(STALE) 전파 체계
도출된 타겟 노드의 변경이 전사 아키텍처 정책을 위배하지 않는지 검사하고, DAG(방향성 비순환 그래프)를 따라 오염 상태를 전파하여 통제선을 칩니다.

#### Step 3: 사전 검증 (Pre-flight Check)
- **상세 설명:** 타겟으로 지목된 노드들과 새로운 수정 의도가 `SAD_Global` 명세 5종(비기능제약, 보안, 기술스택 등) 구조를 위반하는지 `Global Validator Agent`를 통해 사전 검증합니다. 위반 성격에 따라 파이프라인을 완전히 중단(FAIL)시킬지, 아키텍처 차원의 대규모 재설계(REFACTORING)로 유도할지, 아니면 안전한 국소 수정(PASS)으로 넘길지 결정하는 삼중 라우팅 허브 역할을 합니다.
- **[MODIFY] [commands.rs](file:///d:/Experiments/MagicPlanner/src-tauri/src/commands.rs)**
  - **추가할 Command:** `validate_intent_globally`

#### Phase 4-1: 상태 전이 및 부분 수정 프로세스 (Taint Cascade)
- **상세 설명:** 사전 검증이 통과(PASS)되면 실제 DB 쓰기에 앞서 데이터 락(Lock)에 진입합니다. `target_nodes`를 기점으로 의존성 그래프를 타고 연관 하위 모듈들을 탐색합니다. 연관도 높은 모듈들의 DB 상태를 강제로 `STALE`로 전이시킴으로써 시스템 내부적으로는 재생성 대기 상태에 돌입하게 하고, 프론트엔드에는 경고 색상으로 즉각 시각화 처리되도록 제어권을 뺏습니다.
- **[MODIFY] [commands.rs](file:///d:/Experiments/MagicPlanner/src-tauri/src/commands.rs)**
  - **추가할 Command:** `apply_taint_cascade`
  - **구현 로직:** `local_module` 의존도를 메모리에 올려 가지치기 탐색. 연관된 `document_node`들에 대해 `UPDATE document_node SET node_state = 'STALE' WHERE module_id IN (...)` 쿼리 실행.

### Sprint 3: Micro-RAG 연동 및 증분 패치(JSON Patch) 기반 병합
전체 JSON 문서를 재생성하는 토큰 낭비(Regenerate from Scratch)를 극도로 제한하고, 오직 건드려야 할 데이터 계층만 교묘하게 교체하는 부분 수정 핵심 구현 영역입니다.

#### Phase 4-2: 미시적 검색 및 교집합 판별 (Micro-RAG & Zero-Diff)
- **상세 설명:** 파일 명세가 아닌 `STALE` 마크가 찍힌 노드 내부의 디테일한 데이터 청크들과 사용자의 `search_keywords` 간 벡터 유사도 탐색을 내부 통신으로 정밀 수행합니다. 만일 물리적 교집합이 전혀 없는 청크라면("이 파일에는 결제 모듈이 없음"), 굳이 AI에 올려 스캔할 필요조차 없으므로 즉각 상태를 `COMPLETED`로 단독 복귀시키는 우회로(Zero-Diff Fast-Track)를 적용하여 처리 비용을 절감합니다.
- **[MODIFY] [commands.rs](file:///d:/Experiments/MagicPlanner/src-tauri/src/commands.rs)**
  - **추가/수정 로직:** `sqlite-vec(vec0)`의 `document_embeddings` 가상 테이블 조회로 Threshold 미달 노드 즉시 필터링 로직 구현.

#### Phase 4-3: 증분 패치 생성 및 시스템 병합 (Patch Generation & Merge)
- **상세 설명:** 교집합(수정점)이 실재하는 파일에 대해서는 `Patch Generator Agent`가 부분만 학습합니다. 에이전트는 결코 전체 JSON을 리턴하지 않으며, 단지 JSON Patch 문법(`[{"op": "replace", "path": "/...", "value": "..."}]`) 객체 집합만 반환합니다. 이를 기존 로컬 시스템의 데이터베이스 원본과 러스트 레벨에서 깊은 병합(Deep Merge)해 넣습니다.
- **[MODIFY] [Cargo.toml](file:///d:/Experiments/MagicPlanner/src-tauri/Cargo.toml)**
  - `json-patch = "1.0"` 크레이트 등록.
- **[MODIFY] [commands.rs](file:///d:/Experiments/MagicPlanner/src-tauri/src/commands.rs)**
  - **추가할 Command:** `generate_and_apply_patch`
  - **로직:** 에이전트 Patch 데이터를 파싱하여 로컬 `final_output_json`에 `json_patch::patch(&mut doc, &patch_ops)`를 덮어쓰기 형태로 적용 후 저장.

### Sprint 4: 사후 정합성 마이크로 검증 및 트랜잭션/HITL 제어
수백 줄이 넘는 JSON 산출물들의 패치가 무사히 무결성을 지켰는지 최종 검사하고, 오류 시 트랜잭션 폐쇄 모드로 자동 록백하거나 인간에게 결정권을 넘기는(HITL) 제어망입니다.

#### Step 5: 개별 노드 단위 검증 및 통합 트랜잭션 (Node-by-Node Evaluation)
- **상세 설명:** 부분 패치된 JSON이 기존의 데이터 타입, 필수 키, 참조 규격을 무참히 깨버리지 않았는지 Zod 구문 검사와 `Local Evaluator Agent` 기반 논리 오류 검출을 가동합니다. 오류 발생 시 마이크로 피드백 루프를 돌아 자체 치유를 도모하지만, 한계치 오버 시 더 나아가지 않고 `requires-hitl-decision` 이벤트로 유저에게 마지막 수동 개입 권한을 넘깁니다. 반대로 모든 데이터가 `COMPLETED` 고지에 다다르면 트랜잭션을 한 번에 커밋(Global Commit) 반영합니다.
- **[MODIFY] [commands.rs](file:///d:/Experiments/MagicPlanner/src-tauri/src/commands.rs)**
  - **수정할 Command:** 신규 `confirm_differential_iteration` 파이프라인.
  - **트랜잭션(Transaction) 통제:** 최초 오염 전파 직전에 `let mut tx = pool.begin().await?`로 명시적 선언. 성공 판독 시 `tx.commit().await?` 트리거.
  - **에러 피드백 및 HITL:** 최대 반복 루프 종료 조건에서 즉시 에러를 토하지 않고 `app.emit(...)` 이벤트 호출, 대기 상태(PAUSE) 락 통제.

---

## Verification Plan

### Automated Tests
- `run_cmd: cargo test --package magic_planner` (명령어 예시)
- **DAG Pruning Test:** `dependency_spec` 모의 데이터 환경에서 연관 모듈들만 정확히 `STALE` 노드 캐스케이딩이 일어나는지 Unit 테스트 작성.
- **JSON Patch Merge Test:** 특정 노드의 깊은 JSON 트리(`path: /endpoints/1/schema/properties`) 깊은 병합 무결성 검증.

### Manual Verification
- 클라이언트 UI 파이프라인에서 'Apple Pay 추가 업데이트' 프롬프트 제출.
- 의도 분석 -> 전파 계산 단계까지 즉각 진행 여부 확인.
- 도출된 모듈(예: Auth, Payment 모듈)의 UI 상태가 일시적으로 주황색(`STALE`)으로 변경되는지 렌더링 검사.
