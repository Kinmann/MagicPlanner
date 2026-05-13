const fs = require('fs');
const path = require('path');

const sourceFile = "src-tauri/src/commands/refinement.rs";
const content = fs.readFileSync(sourceFile, 'utf-8');

function extractFunction(name, content) {
    const attrPattern = "(#\\[tauri::command\\]\\r?\\n)?";
    
    // Attempt 1: with generic/lifetime params
    let pattern = new RegExp(attrPattern + "(pub\\s+(?:async\\s+)?fn\\s+" + name + "\\s*<.*?>\\s*\\([\\s\\S]*?\\)\\s*(?:->\\s*[\\s\\S]*?)?\\{)");
    let match = content.match(pattern);
    
    if (!match) {
        // Attempt 2: without generic/lifetime params
        pattern = new RegExp(attrPattern + "(pub\\s+(?:async\\s+)?fn\\s+" + name + "\\s*\\([\\s\\S]*?\\)\\s*(?:->\\s*[\\s\\S]*?)?\\{)");
        match = content.match(pattern);
        
        if (!match) {
            // Attempt 3: private function
            pattern = new RegExp(attrPattern + "((?:async\\s+)?fn\\s+" + name + "\\s*\\([\\s\\S]*?\\)\\s*(?:->\\s*[\\s\\S]*?)?\\{)");
            match = content.match(pattern);
            if (!match) return null;
        }
    }

    const startIdx = match.index;
    const sigEndIdx = startIdx + match[0].length;
    
    let openBraces = 1;
    let endIdx = sigEndIdx;
    
    while (openBraces > 0 && endIdx < content.length) {
        if (content[endIdx] === '{') openBraces++;
        else if (content[endIdx] === '}') openBraces--;
        endIdx++;
    }
    
    return content.substring(startIdx, endIdx);
}

const fileMap = {
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
};

const baseImports = `use reqwest::Client;
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

`;

if (!fs.existsSync("src-tauri/src/services")) {
    fs.mkdirSync("src-tauri/src/services", { recursive: true });
}

for (const [filePath, funcs] of Object.entries(fileMap)) {
    let fileContent = baseImports;
    
    if (filePath.includes("intent_service")) {
        fileContent += "use crate::services::artifact_mapping::{extract_mapped_ids, find_definition_node_by_block_id};\n";
        fileContent += "use crate::services::patch_service::get_pinpoint_block;\n\n";
    } else if (filePath.includes("patch_service")) {
        fileContent += "use crate::services::artifact_mapping::extract_mapped_ids;\n\n";
        fileContent += "use crate::services::refinement_validation::validate_refinement_node_logic;\n\n";
    } else if (filePath.includes("refinement_validation")) {
        fileContent += "use crate::services::artifact_mapping::sync_artifact_mappings_in_tx;\n\n";
    } else if (filePath.includes("taint_cascade_service")) {
        fileContent += "use crate::services::artifact_mapping::extract_mapped_ids;\n\n";
    }
    
    for (const func of funcs) {
        let funcCode = extractFunction(func, content);
        if (funcCode) {
            if (funcCode.includes("#[tauri::command]")) {
                funcCode = funcCode.replace(/#\[tauri::command\]\r?\n/, "");
                funcCode = funcCode.replace(new RegExp("pub\\s+(async\\s+)?fn\\s+" + func), "pub $1fn " + func + "_logic");
            }
            if (!funcCode.startsWith("pub ")) {
                funcCode = funcCode.replace("fn " + func, "pub fn " + func);
            }
            fileContent += funcCode + "\n\n";
        } else {
            console.log("Could not extract", func);
        }
    }
    
    fs.writeFileSync(filePath, fileContent, 'utf-8');
}

console.log("Successfully extracted functions and created service files.");

const newRefinementRs = baseImports + `
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
`;

fs.writeFileSync("src-tauri/src/commands/refinement.rs", newRefinementRs, 'utf-8');
console.log("Successfully replaced commands/refinement.rs");
