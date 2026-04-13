export type NodeState = 'PENDING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED_HITL' | 'PAUSED_API_ERROR' | 'PAUSED_STOPPED';

// v2: Pipeline Phase
export type PipelinePhase = 'GENESIS_PRD' | 'SAD' | 'MODULE_GENERATION' | 'COMPLETED';

// v2: Module State
export type ModuleState = 'PENDING' | 'ACTIVE' | 'COMPLETED';
 
 export interface EvaluationIssue {
   code: string;
   location: string;
   description: string;
 }

export interface DocumentNode {
  node_id: string;
  project_id: string;
  module_id?: string;
  target_node_type: string;
  node_category: string;
  node_state: NodeState;
  current_iteration: number;
  max_iterations: number;
  threshold_score: number;
  current_best_score: number;
  api_error_code?: number;
  api_error_message?: string;
  created_at: string;
  updated_at: string;
  last_action?: string;
}

export interface GenerationIteration {
  iteration_id: string;
  node_id: string;
  iteration_number: number;
  generated_draft_json: string;
  calculated_score?: number;
  is_pass?: boolean;
  critical_errors_array?: string;
  actionable_feedback_text?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  project_id: string;
  session_id: string;
  project_name: string;
  pipeline_execution_mode: string;
  pipeline_phase: PipelinePhase;
  raw_input_text: string;
  created_at: string;
  updated_at: string;
  current_node_type?: string;
}

// v2: Global Context
export interface GlobalContext {
  context_id: string;
  project_id: string;
  iteration_id?: string;
  context_type: string;
  context_data_json: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// v2: Local Module
export interface LocalModule {
  module_id: string;
  project_id: string;
  module_name: string;
  module_description?: string;
  core_responsibility?: string;
  mapped_epics?: string;
  dependency_spec?: string;
  priority_order: number;
  module_state: ModuleState;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// v2: Context type labels
export const CONTEXT_TYPE_LABELS: Record<string, string> = {
  sad_core_erd: '코어 ERD',
  sad_auth_rbac: 'Auth & RBAC',
  sad_interface_error: '인터페이스 & 에러',
  sad_tech_stack: '기술 스택',
  sad_non_tech: '비기술적 제약',
  sad_module_list: '모듈 목록',
  sad_epic_mapping: 'Epic 매핑',
  sad_module_deps: '모듈 의존성',
};

// v2: Phase labels
export const PHASE_LABELS: Record<PipelinePhase, string> = {
  GENESIS_PRD: 'Genesis PRD',
  SAD: '시스템 아키텍처',
  MODULE_GENERATION: '모듈 기획',
  COMPLETED: '완료',
};
