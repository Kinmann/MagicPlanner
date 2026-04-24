const fs = require('fs');
const path = 'd:\\\\동영상\\\\vibeCoding\\\\MagicPlanner\\\\src-tauri\\\\src\\\\commands.rs';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const rangesToDelete = [
    [1, 146],
    [264, 281],
    [283, 369],
    [1099, 1173],
    [1175, 1208],
    [1210, 1283],
    [1285, 1389],
    [1391, 1446],
    [3431, 3486],
    [3488, 3545],
];

let keepIndices = new Set();
for(let i=1; i<=lines.length; i++) {
    let keep = true;
    for(let [start, end] of rangesToDelete) {
        if(i >= start && i <= end) {
            keep = false;
            break;
        }
    }
    if(keep) keepIndices.add(i);
}

const newHeader = [
  'use serde::{Deserialize, Serialize};',
  'use reqwest::Client;',
  'use uuid::Uuid;',
  'use chrono::Utc;',
  'use tauri::{Manager, Emitter, State};',
  'use sqlx::{SqlitePool, FromRow, Row};',
  'use json_patch::{patch, PatchOperation};',
  'use serde_json::Value;',
  'use crate::ActiveTasks;',
  'use std::sync::Arc;',
  '',
  '// ============================================================',
  '// models/ 모듈에서 구조체/열거형 재내보내기',
  '// ============================================================',
  'pub use crate::models::{',
  '    NodeState, PipelineError, RagErrorInfo, TaskGuard,',
  '    Project, DocumentNode, GenerationIteration,',
  '    GlobalContext, LocalModule,',
  '};',
  '',
  '// 서비스 함수 임포트',
  'use crate::services::gemini::call_gemini;',
  'use crate::services::prd_merger::{get_approved_node_output, get_full_approved_prd};',
  'use crate::services::draft_generator::{generate_draft, evaluate_draft};',
  'use crate::services::dag_engine::{trigger_next_nodes, trigger_module_next_nodes, sync_module_completion_status};',
  'use crate::utils::get_prompts_dir;',
  '',
  '// EvaluationResult is now imported from crate::schemas',
];

let finalLines = [...newHeader];
for(let i=1; i<=lines.length; i++) {
    if(keepIndices.has(i)) {
        finalLines.push(lines[i-1]);
    }
}

fs.writeFileSync(path, finalLines.join('\n'), 'utf8');
console.log('Successfully refactored commands.rs! New line count:', finalLines.length);

