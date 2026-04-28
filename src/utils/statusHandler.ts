import { PipelineStatusPayload } from '../types/pipeline';
import { LogEntry } from '../store/logStore';

export const normalizePipelineStatus = (payload: any): PipelineStatusPayload | null => {
  if (!payload) return null;

  if (typeof payload === 'string') {
    // 레거시 문자열 지원 (가급적 지양)
    return {
      message: payload,
      node_id: '',
      node_type: 'System',
      project_id: '',
      level: 'INFO',
      status: 'INFO',
    };
  }

  // 필드 정규화 (Snake Case to Camel Case 등 유연하게 처리)
  const normalized: PipelineStatusPayload = {
    message: payload.message || '',
    node_id: payload.node_id || payload.nodeId || '',
    node_type: payload.node_type || payload.target_node_type || payload.nodeType || '',
    project_id: payload.project_id || payload.projectId || '',
    level: (payload.level as any) || 'INFO',
    status: payload.status || '',
    current_iteration: payload.current_iteration ?? payload.iteration ?? payload.currentIteration ?? null,
    max_iterations: payload.max_iterations ?? payload.maxIterations ?? null,
  };

  return normalized;
};

export const formatStatusMessage = (status: PipelineStatusPayload): string => {
  let displayMessage = status.message || status.status || 'Processing...';
  
  if (status.current_iteration !== null && status.max_iterations !== null && status.current_iteration !== undefined && status.max_iterations !== undefined) {
    const iterText = ` (${status.current_iteration}/${status.max_iterations})`;
    if (!displayMessage.includes(iterText)) {
      displayMessage += iterText;
    }
  }
  
  return displayMessage;
};
