import re
import os

source_file = "src-tauri/src/commands/refinement.rs"

with open(source_file, 'r', encoding='utf-8') as f:
    content = f.read()

# We need to extract the exact text of the functions.
# The best way is to find the start of the function and the matching closing brace.
def extract_function(name, content, has_attr=False):
    attr_pattern = r"(#\[tauri::command\]\n)?"
    # regex to find the function signature
    pattern = attr_pattern + r"(pub\s+(?:async\s+)?fn\s+" + name + r"\s*<.*?>\s*\([\s\S]*?\)\s*(?:->\s*[\s\S]*?)?\{)"
    match = re.search(pattern, content)
    if not match:
        # try without generic/lifetime params if any
        pattern = attr_pattern + r"(pub\s+(?:async\s+)?fn\s+" + name + r"\s*\([\s\S]*?\)\s*(?:->\s*[\s\S]*?)?\{)"
        match = re.search(pattern, content)
        if not match:
            # try private function
            pattern = attr_pattern + r"((?:async\s+)?fn\s+" + name + r"\s*\([\s\S]*?\)\s*(?:->\s*[\s\S]*?)?\{)"
            match = re.search(pattern, content)
            if not match:
                return None

    start_idx = match.start()
    sig_end_idx = match.end()
    
    # Now find the matching closing brace
    open_braces = 1
    end_idx = sig_end_idx
    while open_braces > 0 and end_idx < len(content):
        if content[end_idx] == '{':
            open_braces += 1
        elif content[end_idx] == '}':
            open_braces -= 1
        end_idx += 1
        
    return content[start_idx:end_idx]

# Map of new file -> list of functions to put in it
file_map = {
    "src-tauri/src/services/intent_service.rs": [
        "parse_intent",
        "route_architecture_target"
    ],
    "src-tauri/src/services/taint_cascade_service.rs": [
        "apply_taint_cascade",
        "confirm_taint_cascade"
    ],
    "src-tauri/src/services/patch_service.rs": [
        "generate_and_apply_patch",
        "find_scoped_json_paths",
        "search_json_paths",
        "get_pinpoint_block"
    ],
    "src-tauri/src/services/refinement_validation.rs": [
        "validate_refinement_node",
        "confirm_node_review",
        "finalize_refinement_update"
    ],
    "src-tauri/src/services/artifact_mapping.rs": [
        "migrate_canonical_ids_command",
        "migrate_artifact_mappings",
        "sync_artifact_mappings",
        "sync_artifact_mappings_in_tx",
        "extract_mapped_ids_with_path",
        "extract_mapped_ids",
        "find_definition_node_by_block_id"
    ]
}

# Add necessary imports to the top of each file
imports = """use reqwest::Client;
use uuid::Uuid;
use chrono::Utc;
use tauri::{Emitter, State, Manager};
use sqlx::{SqlitePool, Row};
use json_patch::{patch, PatchOperation};
use serde_json::Value;
use regex::Regex;

pub use crate::models::{
    Project, DocumentNode, GenerationIteration,
    GlobalContext, PipelineStatusPayload,
};

use crate::services::embedding::{get_rag_context, check_node_intersection};
use crate::services::gemini::{call_gemini, call_gemini_raw};
use crate::services::node_query::{
    resolve_node_by_canonical_id, 
    get_approved_output_by_canonical_id
};
use crate::services::embedding::store_document_embeddings;
use crate::utils::get_prompts_dir;

"""

os.makedirs("src-tauri/src/services", exist_ok=True)

extracted_funcs = {}

for file_path, funcs in file_map.items():
    file_content = imports
    
    # Special imports per file
    if "intent_service" in file_path:
        file_content += "use crate::services::artifact_mapping::{extract_mapped_ids, find_definition_node_by_block_id};\n"
        file_content += "use crate::services::patch_service::get_pinpoint_block;\n\n"
    elif "patch_service" in file_path:
        file_content += "use crate::services::artifact_mapping::extract_mapped_ids;\n\n"
        file_content += "use crate::services::refinement_validation::validate_refinement_node_logic;\n\n"
    elif "refinement_validation" in file_path:
        file_content += "use crate::services::artifact_mapping::sync_artifact_mappings_in_tx;\n\n"
    elif "taint_cascade_service" in file_path:
        file_content += "use crate::services::artifact_mapping::extract_mapped_ids;\n\n"
    
    for func in funcs:
        func_code = extract_function(func, content)
        if func_code:
            # Change #[tauri::command] to nothing, and rename function to have _logic if it's a command
            if "#[tauri::command]" in func_code:
                func_code = func_code.replace("#[tauri::command]\n", "")
                
                # Replace function signature to not need app_handle etc wrapped in State if we don't want to, 
                # but it's easier to just rename it to _logic and pass same args.
                func_code = re.sub(r"pub\s+(async\s+)?fn\s+" + func, r"pub \1fn " + func + "_logic", func_code)
                
            # If function is not pub, make it pub so it can be used across services
            if not func_code.startswith("pub "):
                func_code = func_code.replace("fn " + func, "pub fn " + func)
                
            file_content += func_code + "\n\n"
            extracted_funcs[func] = True
        else:
            print(f"Could not extract {func}")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(file_content)
        
print("Successfully extracted functions and created service files.")

# Also generate the new commands/refinement.rs file
new_refinement_rs = imports + """
use crate::services::intent_service::{parse_intent_logic, route_architecture_target_logic};
use crate::services::taint_cascade_service::{apply_taint_cascade_logic, confirm_taint_cascade_logic};
use crate::services::patch_service::generate_and_apply_patch_logic;
use crate::services::refinement_validation::{validate_refinement_node_logic, confirm_node_review_logic, finalize_refinement_update_logic};
use crate::services::artifact_mapping::{migrate_canonical_ids_command_logic, migrate_artifact_mappings_logic};

#[derive(serde::Deserialize)]
pub struct TaintCascadePayload {
    pub api_key: String,
    pub project_id: String,
    pub intent: crate::schemas::IntentSchema,
    pub targets: Vec<String>,
    pub router_decision: String,
}

#[tauri::command]
pub async fn parse_intent(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: State<'_, Client>,
    api_key: String,
    project_id: String,
    raw_input: String,
) -> Result<crate::schemas::IntentSchema, String> {
    parse_intent_logic(app_handle, pool, client, api_key, project_id, raw_input).await
}

#[tauri::command]
pub async fn route_architecture_target(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    intent: crate::schemas::IntentSchema,
) -> Result<crate::schemas::RoutingSchema, String> {
    route_architecture_target_logic(app_handle, pool, client, api_key, project_id, intent).await
}

#[tauri::command]
pub async fn apply_taint_cascade(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    payload: TaintCascadePayload,
) -> Result<crate::schemas::TaintCascadeSchema, String> {
    apply_taint_cascade_logic(app_handle, pool, client, payload).await
}

#[tauri::command]
pub async fn confirm_taint_cascade(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    intent: crate::schemas::IntentSchema,
    cascade_result: crate::schemas::TaintCascadeSchema,
) -> Result<(), String> {
    confirm_taint_cascade_logic(app_handle, pool, client, api_key, project_id, intent, cascade_result).await
}

#[tauri::command]
pub async fn generate_and_apply_patch(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    generate_and_apply_patch_logic(app_handle, pool, client, api_key, project_id, node_id).await
}

#[tauri::command]
pub async fn validate_refinement_node(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    client: tauri::State<'_, Client>,
    api_key: String,
    project_id: String,
    node_id: String,
    patch_json: String,
) -> Result<(), String> {
    validate_refinement_node_logic(app_handle, pool, client, api_key, project_id, node_id, patch_json).await
}

#[tauri::command]
pub async fn confirm_node_review(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    confirm_node_review_logic(app_handle, pool, project_id, node_id).await
}

#[tauri::command]
pub async fn finalize_refinement_update(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    project_id: String,
) -> Result<(), String> {
    finalize_refinement_update_logic(app_handle, pool, project_id).await
}

#[tauri::command]
pub async fn migrate_canonical_ids_command(
    project_id: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    migrate_canonical_ids_command_logic(project_id, pool).await
}

#[tauri::command]
pub async fn migrate_artifact_mappings(
    app_handle: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    migrate_artifact_mappings_logic(app_handle, pool).await
}
"""

with open("src-tauri/src/commands/refinement.rs", 'w', encoding='utf-8') as f:
    f.write(new_refinement_rs)

print("Successfully replaced commands/refinement.rs")
