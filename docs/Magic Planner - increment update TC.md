# Magic Planner: Increment Update 기능 검증 테스트 케이스 (TC)

본 문서는 `Magic Planner - increment update.md` 및 상세 구현 계획에 명시된 지능형 수정 파이프라인의 정상 동작 여부를 확인하기 위한 테스트 케이스를 정의합니다. 각 스프린트별 구현 목표에 맞춰 상세하게 구성되었습니다.

---

## [Sprint 1] 의도 추출 및 아키텍처 라우팅 엔진

### TC-1-1: 자연어 의도 추출 및 구조화 (Intent Extraction)
- **목적:** 사용자의 모호한 요청을 시스템이 이해할 수 있는 JSON 형태로 정확히 변환하는지 확인.
- **사전 조건:** API 키가 설정된 프로젝트가 생성되어 있음.
- **테스트 절차:**
    1. 프롬프트 입력창에 "결제 모듈에 Apple Pay 옵션을 추가해줘" 입력.
    2. `parse_intent` 커맨드 호출 확인.
- **기대 결과:**
    - `action_type`이 `ADD`로 식별됨.
    - `target_feature`에 "Apple Pay 옵션" 포함.
    - `search_keywords`에 "payment", "apple pay", "checkout" 등 관련 키워드가 추출됨.

### TC-1-2: 전역 컨텍스트 주입 기반 타겟 라우팅 (Target Routing)
- **목적:** RAG에 의존하지 않고 전체 아키텍처 데이터를 참조하여 정확한 수정 노드를 도출하는지 확인.
- **사전 조건:** `genesis_PRD`, `SAD Global`, `module_list`가 데이터베이스에 존재함.
- **테스트 절차:**
    1. TC-1-1의 출력물을 입력으로 `route_architecture_target` 실행.
- **기대 결과:**
    - 에이전트가 `genesis_PRD`(ADD이므로 강제 포함)와 관련 결제 모듈(예: `module_payment`)을 `target_nodes` 배열에 포함함.
    - 관련 없는 모듈(예: `module_auth`)은 제외됨.

### TC-1-3: 라우팅 타겟 사용자 확정 (HITL Confirmation)
- **목적:** 도출된 수정 범위에 대해 사용자의 최종 승인을 받는지 확인.
- **테스트 절차:**
    1. `route_architecture_target` 결과가 프론트엔드로 전달되는지 확인.
    2. 사용자가 노드 목록을 확인하고 "확인" 버튼 클릭.
- **기대 결과:**
    - `requires-target-confirmation` 이벤트가 발생하여 UI에 수정 대상 노드 리스트가 표시됨.
    - `confirm_architecture_routing` 커맨드가 선택된 리스트와 함께 호출됨.

---

## [Sprint 2] 글로벌 제약 검증 및 DAG 기반 오염 전파

### TC-2-1: 사전 전역 검증 - 정상 통과 (PASS)
- **목적:** 수정 요청이 시스템 전역 제약 조건을 위배하지 않을 때 다음 단계로 진행되는지 확인.
- **테스트 절차:**
    1. 단순 기능 추가 요청(예: "게시판 댓글 수 표시 추가")에 대해 `validate_intent_globally` 실행.
- **기대 결과:**
    - `Validation Status`가 `PASS`로 반환됨.
    - 보안, 기술 스택 등 5대 제약 사항 위배 없음으로 판정됨.

### TC-2-2: 사전 전역 검증 - 강제 차단 (FAIL)
- **목적:** 보안 정책 등 치명적 위배 사항 발생 시 즉각 중단되는지 확인.
- **테스트 절차:**
    1. "모든 API의 인증 절차를 제거해줘"와 같은 보안 위배 요청 입력.
    2. `validate_intent_globally` 실행.
- **기대 결과:**
    - `Validation Status`가 `FAIL`로 반환됨.
    - 구체적인 보안 위배 사유가 반환되며 파이프라인이 중단됨.

### TC-2-3: DAG 기반 국소 오염 전파 (Taint Cascade)
- **목적:** 수정 대상 노드와 의존 관계가 있는 하위 노드들만 정확히 `STALE` 상태로 변하는지 확인.
- **사전 조건:** 모듈 간 의존성(`sad_module_deps`)이 정의되어 있음.
- **테스트 절차:**
    1. 특정 상위 모듈을 타겟으로 `apply_taint_cascade` 실행.
- **기대 결과:**
    - 타겟 노드 및 해당 노드를 참조하는 하위 노드들의 `node_state`가 `STALE`로 변경됨.
    - 관계없는 모듈은 `COMPLETED` 또는 기존 상태를 유지함 (Taint Explosion 방지).

---

## [Sprint 3] Micro-RAG 및 증분 패치 병합

### TC-3-1: Zero-Diff Fast-Track (수정 불필요 자동 통과)
- **목적:** 오염된 노드 중 실제 내용 수정이 필요 없는 경우를 식별하여 비용을 절감하는지 확인.
- **테스트 절차:**
    1. `STALE` 상태인 노드 중 검색 키워드와 연관성이 매우 낮은 노드에 대해 `Micro-RAG` 실행.
- **기대 결과:**
    - 해당 노드가 패치 생성 단계를 거치지 않고 즉시 `VALID` 또는 `COMPLETED` 상태로 복구됨.

### TC-3-2: JSON Patch 생성 및 무결성 (Incremental Patch)
- **목적:** 전체 JSON 재작성이 아닌 부분 변경 데이터(Patch)만 생성하는지 확인.
- **테스트 절차:**
    1. `generate_and_apply_patch` 호출.
- **기대 결과:**
    - 에이전트가 RFC 6902(JSON Patch) 규격의 객체 배열을 생성함.
    - 기존 데이터의 90% 이상이 유지되고 요청된 부분만 변경됨.

### TC-3-3: 시스템 레벨 Deep Merge
- **목적:** 생성된 패치가 기존 DB 원본 데이터와 안전하게 병합되는지 확인.
- **테스트 절차:**
    1. `json-patch` 라이브러리를 통한 병합 로직 실행.
- **기대 결과:**
    - 병합된 최종 JSON의 문법적 오류가 없음.
    - 기존의 복잡한 계층 구조(Nested Object)가 파괴되지 않고 타겟 속성만 정확히 교체됨.

---

## [Sprint 4] 사후 정합성 검증 및 트랜잭션 제어

### TC-4-1: 노드 단위 로컬 검증 (Post-Evaluation)
- **목적:** 패치 결과물이 스키마 및 논리 정합성을 만족하는지 개별 확인.
- **테스트 절차:**
    1. 병합 완료 후 `validate_refinement_node` 실행.
- **기대 결과:**
    - JSON Schema 검증 통과.
    - `Local Evaluator Agent`가 상위 설계(SAD)와의 논리적 모순이 없음을 확인함.

### TC-4-2: 마이크로 피드백 루프 (Auto-Retry)
- **목적:** 검증 실패 시 스스로 수정 패치를 다시 생성하는지 확인.
- **테스트 절차:**
    1. 의도적으로 스키마 오류가 있는 패치를 유도하거나 검증 실패 상황 재현.
- **기대 결과:**
    - 파이프라인이 즉시 종료되지 않고 `retry_patch_loop`를 통해 다시 패치 생성을 시도함.
    - 최대 재시도 횟수 도달 전까지 자가 치유를 시도함.

### TC-4-3: 통합 트랜잭션 커밋 및 HITL
- **목적:** 모든 연관 노드가 성공했을 때만 일괄 반영되는지 확인.
- **테스트 절차:**
    1. 모든 `STALE` 노드가 검증 통과 후 `finalize_refinement_update` 실행.
- **기대 결과:**
    - `document_node`들의 상태가 일괄 `VALID` 또는 `COMPLETED`로 변경됨.
    - 데이터베이스 트랜잭션이 커밋되어 영구 반영됨.
    - 도중 실패 및 재시도 한도 초과 시 사용자에게 개입 요청(PAUSE_HITL) 알림이 발생함.
