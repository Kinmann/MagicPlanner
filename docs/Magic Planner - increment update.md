# Magic Planner: increment update

생성자: 지수 김
생성 일시: 2026년 4월 19일 오후 8:30
카테고리: PLAN
최종 편집자:: 지수 김
최종 업데이트 시간: 2026년 4월 19일 오후 8:31

## 1. 개요 (Overview)

본 명세서는 프로젝트 진행 중 발생하는 기능의 추가, 수정, 삭제 요구사항을 처리하기 위한 지능형 파이프라인의 아키텍처를 정의한다. 전체 노드를 재생성하는 비효율을 제거하고, JSON Patch 및 방향성 비순환 그래프(DAG) 기반의 의존성 추적을 통해 **시스템의 정합성을 유지하면서 국소적 수정(Differential Update)**을 수행하는 것을 목표로 한다.

## 2. 핵심 아키텍처: 하이브리드 컨텍스트 관리 (Hybrid Context Management)

데이터의 성격과 계층에 따라 LLM에 컨텍스트를 제공하는 방식을 분리하여 정확도와 효율성을 극대화한다.

- **전역 컨텍스트 직접 주입 (Global Context Injection):**
    - **대상:** 플랫폼 레벨 노드 3종 (`genesis_PRD` 요약, `SAD Global` 전체, `sad_module_list` 메타데이터)
    - **방식:** RAG 검색을 거치지 않고, 라우터 에이전트의 프롬프트에 전체 데이터를 하드코딩하여 직접 주입한다. 이를 통해 에이전트가 검색 누락(False Negative) 없이 시스템 전체 아키텍처를 조망(God's Eye View)하여 타겟 노드를 결정론적으로 확정할 수 있게 한다.
- **미시적 검색 (Micro-RAG):**
    - **대상:** 라우팅이 확정된 특정 모듈 내의 상세 JSON 산출물 (FSD, API Spec, ERD 등)
    - **목적:** 방대한 세부 산출물을 모두 주입할 수 없으므로, 식별된 수정 사항이 모듈 내부의 어떤 속성(Property)에 영향을 미치는지 벡터 검색으로 계산하여 오염(Taint) 범위를 확정하고 패치 대상을 특정한다.

## 3. 5단계 다중 에이전트 수정 파이프라인 (5-Step Decoupled Pipeline)

단일 에이전트의 인지 과부하를 방지하고 처리 속도(Latency)를 최적화하기 위해, 의도 추출 후 **라우팅과 사전 검증을 비동기 병렬(Asynchronous Parallel)로 처리**한다.

### Step 1: 의도 추출 및 구조화 (Intent Extraction)

- **주체:** Intent Parser Agent (순수 NLP 에이전트)
- **입력:** 사용자의 자연어 수정 요청 프롬프트 (데이터베이스 연결 없음)
- **프로세스:**
    1. 모호한 자연어 프롬프트를 분석하여 변경하고자 하는 대상과 목표를 분할. (단, 시스템의 기존 상태는 추측하지 않음)
    2. 시스템 하위 검색을 위한 범용적/기술적 키워드(Search Keywords) 생성.
- **출력 (JSON):**
    - `action_type`: `ADD` | `MODIFY` | `DELETE`
    - `parsed_intent`: `{ target_feature, to_be_state, explicit_constraints }`
    - `search_keywords`: Micro-RAG 검색용 키워드 배열

**[비동기 병렬 처리 구간 (Asynchronous Parallel Execution)]**
Step 1 완료 후, Step 2(라우팅)와 Step 3(사전 검증)는 상호 데이터 의존성이 없으므로 각각 독립된 스레드에서 동시에 실행된다. 둘 중 하나라도 실패(Fail)할 경우 전체 프로세스는 즉각 중단(Abort)된다.

### Step 2: 아키텍처 라우팅 (Architecture Target Routing)

- **주체:** Architecture Router Agent
- **입력:** Step 1의 출력물(`parsed_intent`) 및 **플랫폼 레벨 노드 3종의 전체 데이터**
- **프로세스 (타겟 노드 도출 알고리즘):**
    1. **물리적 컨텍스트 대조:** RAG를 배제하고, 직접 주입된 `genesis_PRD` 요약본, `SAD Global` 전체, `sad_module_list` 데이터를 바탕으로 `to_be_state`의 요구사항을 통합 스캔한다.
    2. **논리적 타겟 도출 연산 (Logical Target Derivation):** 다음 3가지 기준으로 최종 타겟을 확정한다.
        - **계층 심도 판별 (Hierarchical Level Assessment):** 수정의 최상단 진입점 결정. 비즈니스 로직 변경(Level 0) 시 `genesis_PRD`, 전역 아키텍처 변경(Level 1) 시 `SAD Global` 산출물, 모듈 내부 로직 변경(Level 2) 시 특정 모듈로 진입점을 제한한다.
        - **책임 소재 매핑 (Responsibility Mapping):** `sad_module_list`의 메타데이터(책임 범위, 포함된 에픽)를 분석하여 목표 상태를 논리적으로 수행해야 할 책임이 있는 특정 모듈만을 타겟으로 채택한다.
        - **SSOT 강제 할당 (SSOT Enforcement):** 기능의 `ADD` 또는 `DELETE` 액션이 감지된 경우, 아키텍처의 하향식 정합성을 보장하기 위해 `genesis_PRD`를 타겟 노드 배열 최상단에 강제 삽입(Force Append)한다.
    3. **최종 좌표 확정 (Output Generation):** 시스템의 방향성 비순환 그래프(DAG) 구조상 수정이 시작되어야 할 최소 타겟 집합(Minimum Target Set)을 결정론적 식별자 배열로 구성한다.
- **출력:** `target_nodes` (1차 수정을 시작할 시스템 노드 식별자 목록, 예: `["genesis_PRD", "module_crm"]`)

### Step 3: 사전 검증 (Pre-flight Check)

- **주체:** Global Validator Agent
- **입력:** Step 1의 출력물(`parsed_intent.to_be_state`) 및 전역 제약조건(SAD Global 산출물 5종)
- **프로세스:**
    1. 요구되는 목표 상태(`to_be_state`)가 시스템의 절대적인 **전역 제약 조건(Global Constraints)**을 위배하는지 다음 5가지 카테고리로 기계적 교차 검증을 수행한다.
        - **비기능적/규제 제약 (`sad_non_tech`):** 법적 컴플라이언스(개인정보보호 등), 성능 및 확장성 목표 위배 여부.
        - **보안/인증 아키텍처 제약 (`sad_auth_rbac`):** 전사적 인증 프로토콜(JWT, OAuth 등) 및 역할 기반 접근 제어(RBAC) 위배 여부.
        - **기술 스택 일관성 제약 (`sad_tech_stack`):** 단일 진실 공급원(SSOT)으로 고정된 인프라, 언어, 프레임워크 규격 위배 여부.
        - **인터페이스 표준 제약 (`sad_interface_error`):** 글로벌 에러 코드 체계 및 통신 응답 포맷 위배 여부.
        - **데이터 무결성 및 구조적 제약 (`sad_core_erd`):** 최상위 핵심 엔티티의 식별자 체계 및 엔티티 간 필수 참조 무결성(Relationship) 위배 여부.
    2. 항목 위배 및 수정 성격(의도)에 따라 3항 상태(Ternary State) 중 하나로 라우팅을 결정한다.
- **출력:** `Validation Status` (PASS / FAIL / REFACTORING)
    - **PASS:** 제약 조건 통과. 국소적 오염 전파(Step 4) 진행.
    - **FAIL (Hard Block):** 국소적 기능 수정 요청이 전역 제약 조건(보안, 데이터 무결성 등)을 명백히 위배함. 아키텍처의 파편화 및 보안 결함을 막기 위해, 전역 정책 변경 제안 없이 **즉각 롤백(Fail-Fast) 및 위배 사유 반환**.
    - **REFACTORING (Global Change):** 사용자의 요청 자체가 전역 제약 조건(인프라 교체, 인증 체계 개편 등)의 수정을 의도함. 대규모 연쇄 오염 전파 및 승인(HITL) 단계로 이관.

### Step 4: 상태 전이 및 부분 수정 프로세스 (State Transition & Targeted Modification)

이 단계는 Step 3의 검증 결과에 따라 시스템 노드들의 상태를 변경(Taint)한 뒤, 오염된 노드에 한하여 물리적인 JSON 수정 및 병합을 수행하는 핵심 실행 구간이다.

- **Phase 4-1: 3항 상태 기반 분기 및 제한적 오염 전파 (Branching & Bounded Taint Cascade)**
    - **주체:** System Router & State Manager
    - **조건 A (상태가 PASS인 경우 - 국소 오염):**
        1. **오염 경계 설정 (Taint Boundary):** Step 2에서 산출된 `target_nodes` 배열을 오염 전파의 절대적인 경계선으로 설정한다.
        2. **제한적 그래프 순회 (Bounded DAG Traversal):** 루트 노드(`genesis_PRD`)가 타겟에 포함되어 있더라도, 기계적인 전체 하향 순회로 인한 '오염 폭발(Taint Explosion)'을 방지하기 위해 가지치기(Pruning)를 수행한다. 의존성 그래프 순회 시 `target_nodes`에 명시적으로 포함된 특정 모듈(예: `module_user`)을 향하는 경로만 개방하며, 명시되지 않은 타 모듈은 오염 대상에서 원천 배제한다.
        3. **방어적 상태 변경 (Defensive Tainting):** 개방된 경로를 따라 식별된 특정 모듈 내의 하위 세부 산출물(FSD, API Spec 등) 전체의 데이터베이스 상태를 우선 `STALE`(재생성 대기)로 일괄 업데이트하여 무결성 통제선을 구축한다.
        4. **위상 정렬 기반 실행 통제 (Topological Execution Control):** `STALE` 상태로 마킹된 노드 그룹에 대해 DAG 기반의 위상 정렬을 수행한다. 완전히 독립적인 노드들은 비동기 병렬 처리의 대상이 되지만, 강한 의존성을 가지는 노드 간(예: ERD → API Spec → FSD)에는 실행 순서를 강제한다. 상위 노드가 Step 5에서 `VALID` 상태를 획득하기 전까지 하위 노드의 Phase 4-2 진입을 시스템 레벨에서 블로킹(Blocking)함으로써, 비동기 검증 시 발생할 수 있는 상태 진동(State Oscillation)을 원천 차단한다.
    - **조건 B (상태가 REFACTORING인 경우 - 대규모 오염 및 HITL):**
        1. **HITL 인터럽트:** 전역 정책 변경에 따른 대규모 연쇄 오염 범위를 사전 계산하여, 오염 전파를 일시 중단하고 사용자에게 파급력(예: "인증 방식 변경으로 15개 모듈의 API Spec이 재생성됩니다")을 고지한다.
        2. **사용자 승인 (Approve):** 시스템 내 연관된 다수의 하위 모듈 상태를 `STALE`로 전면 업데이트한다. (이후 위상 정렬 기반 실행 통제 규칙이 동일하게 적용됨)
        3. **사용자 취소 (Abort):** 사용자가 파급력을 인지하고 작업을 취소할 경우, 시스템 오염 없이 파이프라인을 즉각 종료(FAIL)하고 원상 복구한다.
- **Phase 4-2: 미시적 검색 및 교집합 판별 (Micro-RAG & Intersection Check)**
    - **주체:** Micro-RAG Engine
    1. **정밀 탐색:** 시스템은 `STALE` 상태로 마킹된 개별 하위 노드에 대해 **Micro-RAG**를 실행한다. (단, Phase 4-1의 위상 정렬에 따라 블로킹이 해제된 노드만 진입 가능)
    2. **Zero-Diff 판별:** 사용자의 수정 의도(`parsed_intent.target_feature`)와 각 개별 노드의 데이터 간 물리적 교집합 유무를 기계적으로 계산한다.
    3. **컨텍스트 주입:** 교집합이 존재하여 실제 수정이 필요한 노드에 한해 특정 JSON 속성(Property) 구역만을 추출하고, 이를 Patch Generator Agent의 프롬프트에 **[기존 JSON 스니펫(AS-IS)]**과 **[구조화된 수정 의도(TO-BE)]**의 쌍(Pair)으로 주입한다.
- **Phase 4-3: 증분 패치 생성 및 병합 (Incremental Patch Generation & Merge)**
    - **주체:** Patch Generator Agent & Merge Engine
    1. **Zero-Diff Fast-Track (오염 즉각 해제):** Phase 4-2에서 물리적 교집합이 없다고 판별된 노드(수정 불필요 노드)는 AI 텍스트 생성 연산을 전면 생략하고 즉시 `VALID` 상태로 복구(Fast-Track)하여 오버헤드를 방지한다.
    2. **물리적 상태 대조:** 교집합이 확인된 노드에 대해, 에이전트는 주입된 AS-IS 데이터를 읽고 실제 시스템의 현재 상태를 인지한다.
    3. **패치 생성:** 에이전트는 전체 JSON을 다시 작성하지 않고, 오직 수정/추가/삭제가 필요한 하위 객체에 대한 부분 데이터(예: RFC 6902 JSON Patch 포맷 또는 특정 구조체)만을 생성한다.
    4. **시스템 병합:** 데스크톱 런타임(Tauri) 환경 내의 병합 엔진이 에이전트가 반환한 신규 데이터를 기존 JSON 트리에 프로그래밍 방식으로 안전하게 병합(Merge)한다.

### Step 5: 개별 노드 단위 사후 정합성 검사 및 통합 커밋 (Node-by-Node Evaluation & Global Commit)

이 단계는 프로젝트 전체에 대한 일괄 검사가 아닌, Phase 4-3을 마친 **개별 노드 단위로 비동기 실행**되는 엄격한 마이크로 단위 테스트(Unit Test) 구간이다. 단, 제어되지 않은 동시성을 제한하기 위해 Phase 4-1에 명시된 위상 정렬(Topological Sorting) 제어 규칙을 상속받는다.

- **주체:** Local Evaluator Agent, System Schema Validator, Transaction Manager
- **Phase 5-1: 로컬 구문 검사 (기계적 검증)**
    1. 병합이 완료된 개별 노드의 최종 JSON이 사전에 정의된 데이터 구조(JSON Schema, Zod/Ajv)를 엄격히 준수하는지 기계적으로 검증한다. (타입 오류, 필수 키 누락 등 확인)
- **Phase 5-2: 글로벌 논리 검사 (AI 검증)**
    1. 구문 검사를 통과한 개별 노드에 대해, Local Evaluator Agent가 병합된 결과물과 상위 설계 지침(SAD Global 등)을 대조하여 논리적 모순 없이 통합되었는지 AI 검증을 수행한다.
- **결과 처리 및 트랜잭션 제어 (State Management & Commit):**
    - **Local FAIL (국소적 재시도):** 특정 노드가 검증에 실패할 경우, 전체 파이프라인을 멈추지 않고 해당 노드만 사유(스키마 오류 또는 논리 모순)를 첨부하여 Phase 4-2로 반환, 마이크로 피드백 루프(Micro-Feedback Loop)를 실행한다. (최대 재시도 횟수 초과 시 전체 트랜잭션 롤백)
    - **Local PASS (원자적 해제):** 개별 노드가 검증을 통과하면 데이터베이스 상태를 `STALE`에서 `VALID`로 즉각 변경하여 다른 백그라운드 프로세스(및 위상 정렬로 대기 중이던 하위 노드)의 시스템 자원 잠금(Lock)을 해제한다.
    - **Global Commit (통합 트랜잭션 반영):** Phase 4-1에서 `STALE`로 마킹되었던 **모든 연관 노드가 성공적으로 검증을 통과하여 `VALID` 상태를 획득하는 시점**에 통합 트랜잭션(Commit)을 발생시켜, 전체 시스템의 버전을 일괄 갱신하고 수정 사항을 영구 반영한다.

## 4. 핵심 시스템 제약 및 예외 처리 정책

1. **단일 진실 공급원(SSOT) 원칙 유지:**
비즈니스 요구사항(기능의 추가/삭제) 변경은 **반드시 루트 노드인 `genesis_PRD` 수정을 선행**해야 한다. PRD 레벨의 변경은 자동 생성 파이프라인 진입 전 HITL(Human-In-The-Loop) 방식을 통해 사용자의 명시적 승인(Approve)을 요구한다.
2. **데이터 처리 비대칭성 (Add vs. Delete):**
기능 추가(ADD)는 기존 구조에 병합되므로 리스크가 제한적이나, 기능 삭제(DELETE)는 참조 무결성 파괴(Orphan Node 발생) 위험이 극도로 높다. DELETE 연산 시 Step 4의 의존성 역추적 알고리즘을 최우선으로 엄격하게 적용하여 연관 하위 노드를 강제 `STALE` 처리한다.
3. **전역 제약 조건 수정 및 대규모 재생성 통제 (Massive Regeneration Control):**`sad_tech_stack`, `sad_auth_rbac`, `sad_non_tech` 등 `SAD Global` 산출물에 해당하는 전역 제약 조건 자체를 수정하는 것은 단순 기능 업데이트가 아닌 '아키텍처 리팩토링'으로 간주한다. 이 경우 해당 정책을 참조하는 시스템 내 다수의 하위 모듈에 대규모 연쇄 오염(Massive Taint Cascade)이 발생한다. 토큰 비용 폭증 및 시스템 오작동 방지를 위해, 파이프라인은 Step 4(오염 전파) 진입 직전 작업을 일시 중지하고 사용자에게 예상되는 파급 범위(재생성 대상 노드 수 등)를 명확히 고지한 후 명시적 승인(Approve)을 요구하는 HITL 인터럽트를 강제한다.