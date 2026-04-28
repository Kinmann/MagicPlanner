export interface PipelineStatusPayload {
  message: string;
  node_id: string;
  node_type: string;
  project_id: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  status: string;
  current_iteration?: number | null;
  max_iterations?: number | null;
}

export type PipelineEventStatus = 
  | 'START'
  | 'IN_PROGRESS'
  | 'ITERATION_COMPLETED'
  | 'COMPLETED'
  | 'STOPPED'
  | 'FAILED'
  | 'EMBEDDING_START'
  | 'EMBEDDING_COMPLETE'
  | 'EMBEDDING_FAILED';
