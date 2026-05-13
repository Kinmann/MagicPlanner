use reqwest::Client;
use sqlx::SqlitePool;
use crate::models::PipelineError;
use crate::services::gemini::call_gemini;
use crate::services::node_query::get_approved_node_output;
use crate::utils::get_prompts_dir;

/// AI 초안을 생성합니다.
/// 프롬프트 파일을 로드하고, 이전 피드백/초안을 반영하여 Gemini API를 호출합니다.
pub struct DraftGenerationArgs<'a> {
    pub app_handle: &'a tauri::AppHandle,
    pub pool: &'a SqlitePool,
    pub client: &'a Client,
    pub api_key: &'a str,
    pub project_id: &'a str,
    pub node_category: &'a str,
    pub node_type: &'a str,
    pub input_text: &'a str,
    pub global_context: &'a str,
    pub module_context: &'a str,
    pub previous_draft: &'a str,
    pub previous_feedback: &'a [String],
    pub iteration: i32,
    pub target_count: i32,
    pub _exclude_node_ids: &'a [String],
}

pub async fn generate_draft(
    args: DraftGenerationArgs<'_>,
) -> Result<String, PipelineError> {
    let DraftGenerationArgs {
        app_handle,
        pool,
        client,
        api_key,
        project_id,
        node_category,
        node_type,
        input_text,
        global_context,
        module_context,
        previous_draft,
        previous_feedback,
        iteration,
        target_count,
        _exclude_node_ids,
    } = args;
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let prompts_dir = get_prompts_dir(app_handle);

    let common_prompt =
        std::fs::read_to_string(prompts_dir.join("generator/common.txt")).unwrap_or_else(|e| {
            println!("!!! ERROR loading common schema: {}", e);
            String::new()
        });
    let gen_path = prompts_dir
        .join("generator")
        .join(format!("{}.txt", node_normalized));
    let mut domain_prompt = std::fs::read_to_string(&gen_path).unwrap_or_else(|e| {
        println!("!!! ERROR loading domain schema at {:?}: {}", gen_path, e);
        String::new()
    });

    // GPRD 서브 노드의 경우 템플릿 변수 치환
    if node_type.starts_with("GPRD_") {
        domain_prompt = domain_prompt.replace("{{RAW_INPUT}}", input_text);

        if node_type == "GPRD_Capability_Actor" || node_type == "GPRD_Architecture_Schema" {
            let approved_1a = get_approved_node_output(pool, project_id, "GPRD_Context_Goal").await;
            domain_prompt = domain_prompt.replace("{{APPROVED_1A}}", &approved_1a);
        }

        if node_type == "GPRD_Architecture_Schema" {
            let approved_1b =
                get_approved_node_output(pool, project_id, "GPRD_Capability_Actor").await;
            domain_prompt = domain_prompt.replace("{{APPROVED_1B}}", &approved_1b);
        }

        let feedback_text = if previous_feedback.is_empty() {
            "없음".to_string()
        } else {
            previous_feedback.join("\n")
        };
        domain_prompt = domain_prompt.replace("{{EVALUATOR_FEEDBACK}}", &feedback_text);
        domain_prompt = domain_prompt.replace("{{PREVIOUS_DRAFT}}", previous_draft);
    }

    // SAD 또는 MODULE 노드의 경우 외부에서 주입된 컨텍스트 사용
    if node_category == "SAD" || node_category == "MODULE" {
        domain_prompt = domain_prompt.replace("{{GLOBAL_CONTEXT}}", global_context);
        domain_prompt = domain_prompt.replace("{{PREVIOUS_DRAFT}}", previous_draft);
        let feedback_text = if previous_feedback.is_empty() { "없음".to_string() } else { previous_feedback.join("\n") };
        domain_prompt = domain_prompt.replace("{{EVALUATOR_FEEDBACK}}", &feedback_text);
    }

    let schema_obj = crate::schemas::get_schema_for_node(&node_normalized);

    let combined_sys_prompt = format!(
        "{}\n\n[DOMAIN SPECIFIC RULE]\n{}",
        common_prompt, domain_prompt
    );
    println!(
        ">>> System Prompt Loaded! Length: {} chars",
        combined_sys_prompt.len()
    );

    let user_prompt = if node_type.starts_with("GPRD_") {
        // GPRD 노드는 별도의 사용자 프롬프트 구조 사용
        format!("$DOCUMENT_TYPE: {}\n$ITERATION: {}", node_type, iteration)
    } else {
        let mut up = format!(
            "[Document Type]\n{}\n\n[Iteration Count]\n{}\n\n[Source Documents]\n{}",
            node_type, iteration, input_text
        );

        if !previous_feedback.is_empty() {
            up = format!(
                "{}\n\n[Evaluator Feedback]\n{}\n\n[Previous Draft]\n{}",
                up,
                previous_feedback.join("\n"),
                previous_draft
            );
        }

        // 전역 컨텍스트 및 모듈 컨텍스트 추가
        if !global_context.is_empty() {
            up = format!("{}\n\n[Global Context]\n{}", up, global_context);
        }
        if !module_context.is_empty() {
            up = format!("{}\n\n[Module Specification]\n{}", up, module_context);
        }

        if target_count > 0 {
            up = format!("{}\n\n[Target Count]\n{}", up, target_count);
        }
        up
    };

    call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await
}

/// AI 초안을 평가합니다.
/// 생성된 초안과 소스 문서를 비교하여 점수와 피드백을 반환합니다.
pub struct DraftEvaluationArgs<'a> {
    pub app_handle: &'a tauri::AppHandle,
    pub pool: &'a SqlitePool,
    pub client: &'a Client,
    pub api_key: &'a str,
    pub project_id: &'a str,
    pub node_category: &'a str,
    pub node_type: &'a str,
    pub draft: &'a str,
    pub input_text: Option<String>,
    pub global_context: &'a str,
    pub module_context: &'a str,
    pub previous_feedback: &'a [String],
    pub iteration: i32,
    pub _exclude_node_ids: &'a [String],
}

pub async fn evaluate_draft(
    args: DraftEvaluationArgs<'_>,
) -> Result<crate::schemas::EvaluationResult, PipelineError> {
    let DraftEvaluationArgs {
        app_handle,
        pool,
        client,
        api_key,
        project_id,
        node_category,
        node_type,
        draft,
        input_text,
        global_context,
        module_context,
        previous_feedback,
        iteration,
        _exclude_node_ids,
    } = args;
    let node_normalized = node_type.to_lowercase().replace(" ", "_");
    let prompts_dir = get_prompts_dir(app_handle);

    let common_rubric =
        std::fs::read_to_string(prompts_dir.join("evaluator/common.txt")).unwrap_or_else(|e| {
            println!("!!! ERROR loading common rubric: {}", e);
            String::new()
        });
    let eval_path = prompts_dir
        .join("evaluator")
        .join(format!("{}.txt", node_normalized));
    let mut domain_rubric = std::fs::read_to_string(&eval_path).unwrap_or_else(|e| {
        println!("!!! ERROR loading domain rubric at {:?}: {}", eval_path, e);
        String::new()
    });

    // GPRD 서브 노드의 경우 평가 기준에 템플릿 변수 치환
    if node_type.starts_with("GPRD_") {
        if let Some(input) = &input_text {
            domain_rubric = domain_rubric.replace("{{RAW_INPUT}}", input);
        }
        domain_rubric = domain_rubric.replace("{{GENERATED_1A}}", draft);
        domain_rubric = domain_rubric.replace("{{GENERATED_1B}}", draft);
        domain_rubric = domain_rubric.replace("{{GENERATED_1C}}", draft);

        if node_type == "GPRD_Capability_Actor" || node_type == "GPRD_Architecture_Schema" {
            let approved_1a = get_approved_node_output(pool, project_id, "GPRD_Context_Goal").await;
            domain_rubric = domain_rubric.replace("{{APPROVED_1A}}", &approved_1a);
        }

        if node_type == "GPRD_Architecture_Schema" {
            let approved_1b =
                get_approved_node_output(pool, project_id, "GPRD_Capability_Actor").await;
            domain_rubric = domain_rubric.replace("{{APPROVED_1B}}", &approved_1b);
        }
    }

    if node_category == "SAD" || node_category == "MODULE" {
        domain_rubric = domain_rubric.replace("{{GLOBAL_CONTEXT}}", global_context);
    }

    let combined_sys_prompt = format!(
        "$COMMON_RUBRIC\n{}\n\n$DOMAIN_RUBRIC\n{}",
        common_rubric, domain_rubric
    );
    println!(
        ">>> Evaluator Prompt Loaded! Length: {} chars",
        combined_sys_prompt.len()
    );

    let target_schema = crate::schemas::get_schema_for_node(&node_normalized)
        .map(|s| serde_json::to_string_pretty(&s).unwrap_or_default())
        .unwrap_or_else(|| "No schema specification provided for this node type.".to_string());

    let mut user_prompt = format!(
        "$DOCUMENT_TYPE\n{}\n\n$ITERATION_COUNT\n{}\n\n$TARGET_SCHEMA\n{}\n\n$GENERATED_DOCUMENT\n{}",
        node_type, iteration, target_schema, draft
    );

    // $SOURCE_DOCUMENTS: 평가에 필요한 원본 문서 참조
    let mut source_docs = String::new();
    
    // 1. 기본적으로 input_text(원본 입력 혹은 전달된 텍스트)를 베이스로 사용
    if let Some(itext) = input_text {
        source_docs = itext;
    }

    // 2. GPRD나 SAD 노드 등 상위 맥락이 필요한 경우 global_context를 추가하여 SSOT 확보
    if !global_context.is_empty() {
        if !source_docs.is_empty() {
            source_docs.push_str("\n\n$GLOBAL_CONTEXT (GPRD Sub-node Outputs)\n");
        }
        source_docs.push_str(global_context);
    }

    if !source_docs.is_empty() {
        user_prompt = format!("{}\n\n$SOURCE_DOCUMENTS\n{}", user_prompt, source_docs);
    }

    if !module_context.is_empty() {
        user_prompt = format!("{}\n\n$MODULE_CONTEXT\n{}", user_prompt, module_context);
    }

    if !previous_feedback.is_empty() {
        user_prompt = format!(
            "{}\n\n$EVALUATOR_FEEDBACK\n{}",
            user_prompt,
            previous_feedback.join("\n")
        );
    }

    let schema_obj = crate::schemas::get_schema_for_node("evaluator");
    let response_text =
        call_gemini(client, api_key, &combined_sys_prompt, &user_prompt, schema_obj).await?;

    // JSON 파싱 (Gemini Structured Output)
    let json_str = response_text
        .trim_start_matches("```json")
        .trim_end_matches("```")
        .trim();

    let eval: crate::schemas::EvaluationResult = serde_json::from_str(json_str).map_err(|e| {
        PipelineError::Internal(format!(
            "Eval Deserialization Error: {} - Content: {}",
            e, json_str
        ))
    })?;

    Ok(eval)
}
