use reqwest::Client;
use sqlx::{SqlitePool, Row};
use regex::Regex;
use std::collections::HashSet;
// ============================================================
// RAG Utilities
// ============================================================
pub use crate::services::gemini::call_gemini_embedding;


pub fn chunk_json_document(json_str: &str, node_type: &str) -> Vec<String> {
    let val: serde_json::Value = serde_json::from_str(json_str).unwrap_or_default();
    let mut chunks = Vec::new();
    
    match node_type.to_lowercase().replace(" ", "_").as_str() {
        // 1. Genesis PRD: 개요(컨텍스트 & 목표) / 페르소나 / 에픽 / 글로벌 제약사항 및 기술 스택 위주로 분할
        "genesis_prd" | "gprd_context_goal" | "gprd_capability_actor" | "gprd_architecture_schema" => {
            // 개요(메타데이터 & 비즈니스 컨텍스트)
            if let (Some(meta), Some(biz)) = (val.get("metadata"), val.get("business_context")) {
                chunks.push(format!("[GENESIS_PRD:OVERVIEW]\nmetadata: {}\nbusiness_context: {}",
                    serde_json::to_string_pretty(meta).unwrap_or_default(),
                    serde_json::to_string_pretty(biz).unwrap_or_default()));
            }
            // 사용자 페르소나/역할 정보 분할
            if let Some(roles) = val.get("user_roles").and_then(|v| v.as_array()) {
                for role in roles {
                    let role_name = role.get("role_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[GENESIS_PRD:ROLE:{}]\n{}",
                        role_name, serde_json::to_string_pretty(role).unwrap_or_default()));
                }
            }
            // 핵심 에픽 정보 분할
            if let Some(epics) = val.get("core_epics").and_then(|v| v.as_array()) {
                for epic in epics {
                    let epic_id = epic.get("epic_id").and_then(|e| e.as_str()).unwrap_or("unknown");
                    let title = epic.get("title").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[GENESIS_PRD:EPIC:{}:{}]\n{}",
                        epic_id, title, serde_json::to_string_pretty(epic).unwrap_or_default()));
                }
            }
            // 글로벌 제약사항 분할
            if let Some(constraints) = val.get("global_constraints") {
                chunks.push(format!("[GENESIS_PRD:CONSTRAINTS]\n{}",
                    serde_json::to_string_pretty(constraints).unwrap_or_default()));
            }
            // 기술 스택 분할
            if let Some(tech) = val.get("tech_stack") {
                chunks.push(format!("[GENESIS_PRD:TECH_STACK]\n{}",
                    serde_json::to_string_pretty(tech).unwrap_or_default()));
            }
        }

        // 2. PRD (모듈별): 개요 / 핵심 기능 / 사용자 시나리오 / 제약사항 위주로 분할
        "prd" => {
            // 프로젝트 개요
            if let Some(overview) = val.get("overview") {
                let name = val.get("project_name").and_then(|n| n.as_str()).unwrap_or("");
                chunks.push(format!("[PRD:OVERVIEW:{}]\n{}",
                    name, serde_json::to_string_pretty(overview).unwrap_or_default()));
            }
            // 핵심 기능 리스트 분할
            if let Some(features) = val.get("core_features").and_then(|v| v.as_array()) {
                for feat in features {
                    let fname = feat.get("feature_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    let priority = feat.get("priority").and_then(|p| p.as_str()).unwrap_or("P1");
                    chunks.push(format!("[PRD:FEATURE:{}:{}]\n{}",
                        fname, priority, serde_json::to_string_pretty(feat).unwrap_or_default()));
                }
            }
            // 사용자 시나리오/스토리
            if let Some(stories) = val.get("user_stories") {
                chunks.push(format!("[PRD:USER_STORIES]\n{}",
                    serde_json::to_string_pretty(stories).unwrap_or_default()));
            }
            // 모듈 제약사항
            if let Some(constraints) = val.get("constraints") {
                chunks.push(format!("[PRD:CONSTRAINTS]\n{}",
                    serde_json::to_string_pretty(constraints).unwrap_or_default()));
            }
        }

        // 3. FSD: 기능별 상세 명세 분할 (각 기능 단위로 검색 가능하게 처리)
        "fsd" => {
            if let Some(features) = val.get("features").and_then(|v| v.as_array()) {
                for feat in features {
                    let func_id = feat.get("func_id").and_then(|f| f.as_str()).unwrap_or("unknown");
                    let module = feat.get("module").and_then(|m| m.as_str()).unwrap_or("");
                    let summary = feat.get("summary").and_then(|s| s.as_str()).unwrap_or("");
                    chunks.push(format!("[FSD:{}:{}:{}]\n{}",
                        func_id, module, summary,
                        serde_json::to_string_pretty(feat).unwrap_or_default()));
                }
            }
        }

        // 4. User Flow: 스텝(노드) 및 엣지 정보 분할
        "user_flow" => {
            // 개별 노드/스텝 정보 분할
            if let Some(nodes) = val.get("nodes").and_then(|v| v.as_array()) {
                for node in nodes {
                    let id = node.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let ntype = node.get("node_type").and_then(|t| t.as_str()).unwrap_or("");
                    let label = node.get("label").and_then(|l| l.as_str()).unwrap_or("");
                    let func_ids = node.get("mapped_func_ids")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(","))
                        .unwrap_or_default();
                    chunks.push(format!("[USER_FLOW:STEP:{}:{}:{}] mapped_funcs=[{}]\n{}",
                        id, ntype, label, func_ids,
                        serde_json::to_string_pretty(node).unwrap_or_default()));
                }
            }
            // 엣지 정보 (흐름 관계)
            if let Some(edges) = val.get("edges") {
                chunks.push(format!("[USER_FLOW:EDGES]\n{}",
                    serde_json::to_string_pretty(edges).unwrap_or_default()));
            }
        }

        // 5. IA: 사이트 맵 계층 구조 + 화면별 구성 요소 명세 분할
        "ia" => {
            // 사이트 계층 구조 전체 (전역 탐색 시 중요)
            if let Some(hierarchy) = val.get("hierarchy") {
                chunks.push(format!("[IA:HIERARCHY]\n{}",
                    serde_json::to_string_pretty(hierarchy).unwrap_or_default()));
            }
            // 개별 화면 구성 요소 명세 분할
            if let Some(screens) = val.get("screen_elements").and_then(|v| v.as_array()) {
                for screen in screens {
                    let sid = screen.get("screen_id").and_then(|s| s.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[IA:SCREEN:{}]\n{}",
                        sid, serde_json::to_string_pretty(screen).unwrap_or_default()));
                }
            }
        }

        // 6. ERD: 엔티티 및 관계 명세 분할
        "erd" => {
            if let Some(tables) = val.get("tables").and_then(|v| v.as_array()) {
                for table in tables {
                    let tname = table.get("table_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[ERD:TABLE:{}]\n{}",
                        tname, serde_json::to_string_pretty(table).unwrap_or_default()));
                }
            }
            // 테이블 간 관계 정보 분할
            if let Some(rels) = val.get("relationships").and_then(|v| v.as_array()) {
                for rel in rels {
                    let src = rel.get("source_table").and_then(|s| s.as_str()).unwrap_or("");
                    let tgt = rel.get("target_table").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[ERD:REL:{}->{}]\n{}",
                        src, tgt, serde_json::to_string_pretty(rel).unwrap_or_default()));
                }
            }
        }

        // 7. Wireframe: 화면 레이아웃 및 컴포넌트 명세 분할
        "wireframe" => {
            if let Some(screens) = val.get("screens").and_then(|v| v.as_array()) {
                for screen in screens {
                    let sid = screen.get("screen_id").and_then(|s| s.as_str()).unwrap_or("unknown");
                    let sname = screen.get("screen_name").and_then(|n| n.as_str()).unwrap_or("");
                    // 화면 기본 정보 분할
                    chunks.push(format!("[WIREFRAME:SCREEN:{}:{}]\n{}",
                        sid, sname, serde_json::to_string_pretty(screen).unwrap_or_default()));
                    // 영역별 컴포넌트 정보 분할
                    if let Some(regions) = screen.get("layout_regions").and_then(|r| r.as_array()) {
                        for region in regions {
                            let rname = region.get("region_name").and_then(|r| r.as_str()).unwrap_or("unknown");
                            chunks.push(format!("[WIREFRAME:REGION:{}:{}:{}]\n{}",
                                sid, sname, rname,
                                serde_json::to_string_pretty(region).unwrap_or_default()));
                        }
                    }
                }
            }
        }

        // 8. API Spec: 엔드포인트 상세 명세 분할
        "api_spec" => {
            if let Some(endpoints) = val.get("endpoints").and_then(|v| v.as_array()) {
                for ep in endpoints {
                    let method = ep.get("method").and_then(|m| m.as_str()).unwrap_or("GET");
                    let path = ep.get("path").and_then(|p| p.as_str()).unwrap_or("/");
                    let summary = ep.get("summary").and_then(|s| s.as_str()).unwrap_or("");
                    // [RAG 검색 최적화] 필드명들을 명시적으로 포함하여 검색 시 가중치가 실리도록 함
                    chunks.push(format!("[API:{}:{}:{}] headers, path_params, query_params\n{}",
                        method, path, summary,
                        serde_json::to_string_pretty(ep).unwrap_or_default()));
                }
            }
        }

        // 9. TC: 테스트 케이스 명세 분할
        "tc" => {
            if let Some(cases) = val.get("test_cases").and_then(|v| v.as_array()) {
                for tc in cases {
                    let tc_id = tc.get("tc_id").and_then(|t| t.as_str()).unwrap_or("unknown");
                    let func_id = tc.get("mapped_func_id").and_then(|f| f.as_str()).unwrap_or("");
                    let title = tc.get("title").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[TC:{}:{}:{}]\n{}",
                        tc_id, func_id, title,
                        serde_json::to_string_pretty(tc).unwrap_or_default()));
                }
            }
        }

        // SAD Core ERD: 전역 엔티티 및 관계 분할
        "sad_core_erd" => {
            if let Some(entities) = val.get("entities").and_then(|v| v.as_array()) {
                for entity in entities {
                    let ename = entity.get("entity_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_ERD:ENTITY:{}]\n{}",
                        ename, serde_json::to_string_pretty(entity).unwrap_or_default()));
                }
            }
            if let Some(rels) = val.get("relationships").and_then(|v| v.as_array()) {
                for rel in rels {
                    let from = rel.get("from_entity").and_then(|f| f.as_str()).unwrap_or("");
                    let to = rel.get("to_entity").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_ERD:REL:{}->{}]\n{}",
                        from, to, serde_json::to_string_pretty(rel).unwrap_or_default()));
                }
            }
        }

        // SAD Auth & RBAC: 인증 전략 및 권한 체계 분할
        "sad_auth_rbac" => {
            // 인증 및 토큰 전략
            let auth = val.get("auth_method").and_then(|a| a.as_str()).unwrap_or("");
            let token = val.get("token_strategy").and_then(|t| t.as_str()).unwrap_or("");
            let policies = val.get("access_policies")
                .and_then(|p| serde_json::to_string_pretty(p).ok())
                .unwrap_or_default();
            chunks.push(format!("[SAD_AUTH:STRATEGY] auth={}, token={}\naccess_policies: {}",
                auth, token, policies));
            // 역할/권한 목록
            if let Some(roles) = val.get("roles").and_then(|v| v.as_array()) {
                for role in roles {
                    let rname = role.get("role_name").and_then(|r| r.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_AUTH:ROLE:{}]\n{}",
                        rname, serde_json::to_string_pretty(role).unwrap_or_default()));
                }
            }
        }

        // SAD Interface & Error: 통신 규약 및 공통 에러 명세 분할
        "sad_interface_error" => {
            // API 기본 인터페이스 명세
            let versioning = val.get("api_versioning_strategy").and_then(|v| v.as_str()).unwrap_or("");
            let format = val.get("response_format").and_then(|f| f.as_str()).unwrap_or("");
            let pagination = val.get("pagination_strategy").and_then(|p| p.as_str()).unwrap_or("");
            chunks.push(format!("[SAD_IFACE:STRATEGY] versioning={}, format={}, pagination={}",
                versioning, format, pagination));
            // 에러 코드 명세
            if let Some(codes) = val.get("error_codes").and_then(|v| v.as_array()) {
                for code in codes {
                    let c = code.get("code").and_then(|c| c.as_str()).unwrap_or("");
                    let status = code.get("http_status").and_then(|s| s.as_i64()).unwrap_or(0);
                    chunks.push(format!("[SAD_IFACE:ERROR:{}:{}]\n{}",
                        c, status, serde_json::to_string_pretty(code).unwrap_or_default()));
                }
            }
        }

        // SAD Tech Stack: 기술 스택 정보 분할
        "sad_tech_stack" => {
            chunks.push(format!("[SAD_TECH_STACK]\n{}",
                serde_json::to_string_pretty(&val).unwrap_or_default()));
        }

        // SAD Non-Tech: 비기술적 요구사항 분할
        "sad_non_tech" => {
            let categories = ["legal_constraints", "compliance_requirements",
                "performance_targets", "scalability_requirements", "budget_constraints"];
            for cat in categories {
                if let Some(items) = val.get(cat) {
                    let items_str = serde_json::to_string_pretty(items).unwrap_or_default();
                    if items_str.len() > 10 {
                        chunks.push(format!("[SAD_NON_TECH:{}]\n{}", cat.to_uppercase(), items_str));
                    }
                }
            }
        }

        // SAD Module List: 모듈 목록 정보 분할
        "sad_module_list" => {
            if let Some(modules) = val.get("modules").and_then(|v| v.as_array()) {
                for module in modules {
                    let mname = module.get("module_name").and_then(|n| n.as_str()).unwrap_or("unknown");
                    chunks.push(format!("[SAD_MODULE:{}]\n{}",
                        mname, serde_json::to_string_pretty(module).unwrap_or_default()));
                }
            }
        }

        // SAD Epic Mapping: 에픽 매핑 정보 분할
        "sad_epic_mapping" => {
            if let Some(mappings) = val.get("mappings").and_then(|v| v.as_array()) {
                for mapping in mappings {
                    let eid = mapping.get("epic_id").and_then(|e| e.as_str()).unwrap_or("unknown");
                    let ename = mapping.get("epic_name").and_then(|n| n.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_EPIC_MAP:{}:{}]\n{}",
                        eid, ename, serde_json::to_string_pretty(mapping).unwrap_or_default()));
                }
            }
        }

        // SAD Module Deps: 모듈 간 의존성 및 빌드 순서 분할
        "sad_module_deps" => {
            if let Some(deps) = val.get("dependencies").and_then(|v| v.as_array()) {
                for dep in deps {
                    let from = dep.get("from_module").and_then(|f| f.as_str()).unwrap_or("");
                    let to = dep.get("to_module").and_then(|t| t.as_str()).unwrap_or("");
                    chunks.push(format!("[SAD_DEP:{}->{}]\n{}",
                        from, to, serde_json::to_string_pretty(dep).unwrap_or_default()));
                }
            }
            if let Some(order) = val.get("recommended_build_order") {
                chunks.push(format!("[SAD_DEP:BUILD_ORDER]\n{}",
                    serde_json::to_string_pretty(order).unwrap_or_default()));
            }
        }

        // 기타 노드: 전체 오브젝트를 키 단위로 분할
        _ => {
            if let Some(obj) = val.as_object() {
                for (key, value) in obj {
                    let chunk_text = format!("[{}]\n{}", key, 
                        serde_json::to_string_pretty(value).unwrap_or_default());
                    if chunk_text.len() > 50 {
                        chunks.push(chunk_text);
                    }
                }
            }
        }
    }
    
    // 囹멱쎃占? ?占썹쑝 獄↑퀎占???밭깂 墉?占?(容뽩텈? 2000?? 獄↑퀓???葯몌옙??
    if let Ok(summary) = serde_json::to_string_pretty(&val) {
        if summary.len() > 100 {
            chunks.insert(0, format!("[FULL_DOCUMENT:{}]\n{}", node_type, 
                summary.chars().take(2000).collect::<String>()));
        }
    }
    chunks
}

pub async fn store_document_embeddings(
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    module_id: Option<&str>,
    node_id: &str,
    node_type: &str,
    iteration_id: &str,
    document_json: &str,
    score: i32,
) -> Result<(), String> {
    // [중복 방지] 동일 프로젝트 내의 동일 노드(node_id)에 대해 기존 임베딩 데이터 삭제 후 갱신
    // vec0 (벡터 테이블) 및 metadata 테이블의 기존 항목 제거
    sqlx::query("DELETE FROM document_embeddings WHERE rowid IN (SELECT rowid FROM embedding_metadata WHERE node_id = ?)")
        .bind(node_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Existing embeddings (vec0) cleanup error: {}", e))?;

    sqlx::query("DELETE FROM embedding_metadata WHERE node_id = ?")
        .bind(node_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Existing metadata cleanup error: {}", e))?;

    let chunks = chunk_json_document(document_json, node_type);
    
    for (idx, chunk) in chunks.iter().enumerate() {
        // 1. Gemini Embedding API 호출
        let embedding = call_gemini_embedding(client, api_key, chunk, "RETRIEVAL_DOCUMENT")
            .await
            .map_err(|e| format!("{:?}", e))?;
        let embedding_json = serde_json::to_string(&embedding).unwrap_or_default();
        
        // 2. embedding_metadata에 메타데이터 먼저 저장 후 생성된 rowid 확보
        let now = chrono::Utc::now().to_rfc3339();
        let result = sqlx::query(
            "INSERT INTO embedding_metadata (project_id, module_id, node_type, node_id, iteration_id, chunk_index, chunk_text, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(project_id)
        .bind(module_id)
        .bind(node_type)
        .bind(node_id)
        .bind(iteration_id)
        .bind(idx as i32)
        .bind(chunk)
        .bind(score)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("Metadata insert error: {}", e))?;
        
        let rowid = result.last_insert_rowid();
        
        println!(">>> [RAG] Inserting vector with size: {} for rowid: {}", embedding.len(), rowid);
        
        // 3. vec0 테이블에 벡터 데이터 저장 (생성된 rowid 연동)
        sqlx::query("INSERT INTO document_embeddings (rowid, embedding) VALUES (?, ?)")
            .bind(rowid)
            .bind(&embedding_json)
            .execute(pool)
            .await
            .map_err(|e| format!("Embedding insert error: {}", e))?;
    }
    
    println!("[RAG] Stored {} embedding chunks for node {} ({})", chunks.len(), node_id, node_type);
    Ok(())
}

pub async fn get_rag_context(
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    query_text: &str,
    limit: i32,
    exclude_node_ids: Vec<String>,
) -> Result<String, String> {
    // 1. 검색 쿼리 벡터화
    let query_vector = call_gemini_embedding(client, api_key, query_text, "RETRIEVAL_QUERY").await
        .map_err(|e| format!("Query embedding error: {}", e))?;
    let query_json = serde_json::to_string(&query_vector).unwrap_or_default();

    // 2. 유사도 검색 수행 (k-NN) - 모듈 정보와 카테고리 정보 포함
    let mut query_builder = sqlx::QueryBuilder::new(
        "SELECT m.chunk_text, m.node_type, v.distance, lm.module_name, dn.node_category, dn.node_id 
         FROM document_embeddings v
         JOIN embedding_metadata m ON v.rowid = m.rowid
         JOIN document_node dn ON m.node_id = dn.node_id
         LEFT JOIN local_module lm ON dn.module_id = lm.module_id
         WHERE v.embedding MATCH "
    );
    query_builder.push_bind(&query_json);
    query_builder.push(" AND k = ");
    query_builder.push_bind(limit);
    query_builder.push(" AND m.project_id = ");
    query_builder.push_bind(project_id);

    if !exclude_node_ids.is_empty() {
        query_builder.push(" AND m.node_id NOT IN (");
        let mut separated = query_builder.separated(", ");
        for id in exclude_node_ids {
            separated.push_bind(id);
        }
        query_builder.push(")");
    }

    query_builder.push(" ORDER BY v.distance ASC");

    let rows = query_builder
        .build()
        .fetch_all(pool)
        .await
        .map_err(|e| format!("RAG search error: {}", e))?;

    if rows.is_empty() {
        return Ok("".to_string());
    }

    let mut context = String::from("\n[REFERENCE_DOCUMENTS]\n(The following are relevant snippets retrieved from existing documentation. Use the Module and Type to construct Canonical IDs. Example: MODULE:TYPE:$.path.to.element)\n");
    for (i, row) in rows.iter().enumerate() {
        let text: String = row.get(0);
        let ntype: String = row.get(1);
        let dist: f64 = row.get(2);
        let mname: Option<String> = row.get(3);
        let cat: String = row.get(4);
        
        // 모듈명 또는 카테고리(GENESIS, SAD)를 접두어로 사용
        let module_prefix = mname.unwrap_or_else(|| cat.to_uppercase());
        
        context.push_str(&format!("\n-- REFERENCE {} (Address: {}:{}, NodeID: {}, Relevance: {:.2}%) --\n{}\n", 
            i + 1, module_prefix, ntype, row.get::<String, _>(5), (1.0 - dist) * 100.0, text));
    }

    Ok(context)
}


pub fn extract_artifact_ids(json_str: &str) -> HashSet<String> {
    // 패턴: 계층적 구조(module:type:id) 또는 단순 ID(ID-001) 지원
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)\b(?:[A-Z0-9_]+:[A-Z0-9_]+:)?[A-Z]{2,}-\w+\b").unwrap());
    re.find_iter(json_str)
        .map(|m| m.as_str().to_uppercase())
        .collect()
}

pub fn extract_artifact_ids_from_value(val: &serde_json::Value) -> HashSet<String> {
    let mut ids = HashSet::new();
    
    // 패턴: 계층적 구조(module:type:id) 또는 단순 ID(ID-001)
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)\b(?:[A-Z0-9_]+:[A-Z0-9_]+:)?[A-Z]{2,}-\w+\b").unwrap());

    match val {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                // 1. 명시적인 ID 필드인 경우 수집
                if k == "id" || k == "screen_id" || k == "table_id" || k == "module_id" || k == "api_id" || 
                   k == "artifact_id" || k == "func_id" || k == "role_id" || k == "table_name" || k == "entity_name" ||
                   k.starts_with("mapped_") {
                    if let Some(s) = v.as_str() {
                        ids.insert(s.to_uppercase());
                    }
                }
                
                // 2. 값 자체가 ID 패턴을 가졌는지 검사 (유연한 추출)
                if let Some(s) = v.as_str() {
                    if re.is_match(s) {
                        ids.insert(s.to_uppercase());
                    }
                }

                ids.extend(extract_artifact_ids_from_value(v));
            }
        },
        serde_json::Value::Array(arr) => {
            for v in arr {
                // 배열 내의 문자열 값이 ID 패턴인지 검사
                if let Some(s) = v.as_str() {
                    if re.is_match(s) {
                        ids.insert(s.to_uppercase());
                    }
                }
                ids.extend(extract_artifact_ids_from_value(v));
            }
        },
        _ => {}
    }
    ids
}

/// 노드 컨텍스트(모듈, 타입)를 바탕으로 단순 ID를 Canonical ID로 변환하여 추출 (대문자 정규화)
pub fn extract_canonical_ids(json_str: &str, module_id: &str, node_type: &str) -> HashSet<String> {
    let raw_ids = extract_artifact_ids(json_str);
    let mid_up = module_id.to_uppercase();
    let type_up = node_type.to_uppercase();

    raw_ids.into_iter().map(|id| {
        if id.contains(':') {
            id.to_uppercase() // 이미 계층적 포맷인 경우 대문자로 정규화
        } else {
            // 단순 ID인 경우 현재 컨텍스트 결합 후 대문자화
            format!("{}:{}:{}", mid_up, type_up, id.to_uppercase())
        }
    }).collect()
}

pub async fn check_node_intersection(
    pool: &SqlitePool,
    client: &Client,
    api_key: &str,
    project_id: &str,
    node_id: &str,
    query_text: &str,
) -> Result<f64, String> {
    // 의도(Intent) 벡터화
    let query_vector = call_gemini_embedding(client, api_key, query_text, "RETRIEVAL_QUERY").await
        .map_err(|e| format!("Intersection query embedding error: {:?}", e))?;
    
    check_node_intersection_with_vector(pool, project_id, node_id, query_text, &query_vector).await
}

pub async fn check_node_intersection_with_vector(
    pool: &SqlitePool,
    project_id: &str,
    node_id: &str,
    query_text: &str,
    query_vector: &[f32],
) -> Result<f64, String> {
    // 1. 아티팩트 코드 기반 연관도 체크 (1순위)
    let query_codes = extract_artifact_ids(query_text);
    
    // 노드 데이터 로드 (코드 추출을 위해)
    let node_data: Option<String> = sqlx::query_scalar(
        "SELECT gi.generated_draft_json FROM generation_iteration gi \
         JOIN document_node dn ON dn.node_id = gi.node_id \
         WHERE dn.node_id = ? AND dn.project_id = ? AND gi.is_pass = 1 LIMIT 1"
    )
    .bind(node_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(json_str) = node_data {
        let node_codes = extract_artifact_ids(&json_str);
        let intersection: Vec<_> = query_codes.intersection(&node_codes).collect();
        
        if !intersection.is_empty() {
            // 코드가 하나라도 일치하면 100% 연관된 것으로 간주 (조기 반환)
            println!(">>> [Artifact-Match] Node: {}, Matches: {:?}", node_id, intersection);
            return Ok(1.0);
        }
    }

    // 2. 연관된 코드가 없는 경우에만 임베딩 유사도 체크 (2순위 Fallback)
    let query_json = serde_json::to_string(&query_vector).unwrap_or_default();

    // 해당 노드에 속한 조각들 중 가장 높은 유사도 검색
    let embedding_row = sqlx::query(
        "SELECT v.distance 
         FROM document_embeddings v
         JOIN embedding_metadata m ON v.rowid = m.rowid
         WHERE m.node_id = ? AND m.project_id = ? AND v.embedding MATCH ? AND k = 1
         ORDER BY v.distance ASC LIMIT 1"
    )
    .bind(node_id)
    .bind(project_id)
    .bind(&query_json)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Intersection search error: {}", e))?;

    let embedding_similarity = if let Some(r) = embedding_row {
        let dist: f64 = r.get(0);
        1.0 - dist
    } else {
        0.0
    };

    println!(">>> [RAG-Intersection] Node: {}, EmbedSim: {:.4}", 
        node_id, embedding_similarity);

    Ok(embedding_similarity)
}
