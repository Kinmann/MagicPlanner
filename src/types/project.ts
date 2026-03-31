export type NodeState = 'PENDING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED_HITL' | 'PAUSED_API_ERROR';

export interface DocumentNode {
  node_id: string;
  project_id: string;
  target_node_type: string;
  node_state: NodeState;
  current_iteration: number;
  max_iterations: number;
  threshold_score: number;
  current_best_score: number;
  api_error_code?: number;
  api_error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface GenerationIteration {
  iteration_id: string;
  node_id: string;
  iteration_number: number;
  generated_draft_json: string;
  calculated_score?: number;
  is_pass?: boolean;
  critical_errors_array?: string; // JSON string
  actionable_feedback_text?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  project_id: string;
  session_id: string;
  project_name: string;
  pipeline_execution_mode: string;
  raw_input_text: string;
  created_at: string;
  updated_at: string;
}
