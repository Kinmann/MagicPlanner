import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { useProjectStore } from './projectStore';
import { normalizePipelineStatus, formatStatusMessage } from '../utils/statusHandler';

export interface LogEntry {
  id: string;
  time: string;
  date: string; // YYYY-MM-DD
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  projectName?: string;
  nodeType?: string;
}

interface LogState {
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], message: string, nodeType?: string) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  addLog: (level, message, nodeType) => set((state) => {
    const now = new Date();
    const projectName = useProjectStore.getState().currentProject?.project_name || 'System';
    
    return {
      logs: [...state.logs, {
        id: Math.random().toString(36).substring(7),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        date: now.toISOString().split('T')[0],
        level,
        message,
        projectName,
        nodeType
      }].slice(-500) // 로그 개수 상한 상향
    };
  }),
  clearLogs: () => set({ logs: [] }),
}));

// 실시간 이벤트 리스너 등록
let isLogListenerRegistered = false;

export const initLogEventListeners = async () => {
  if (isLogListenerRegistered) return;
  isLogListenerRegistered = true;

  // 백엔드 파이프라인 상태 이벤트 리스너
  await listen<any>('pipeline-status', (event) => {
    const status = normalizePipelineStatus(event.payload);
    if (!status) return;

    const level = status.level;
    const nodeType = status.node_type;
    const message = formatStatusMessage(status);

    // Iteration 완료 감지 및 로그 기록
    const isCompletionStatus = status.status === 'ITERATION_COMPLETED';
    const isCompletionMessage = status.message?.includes('평가 완료') || 
                               status.message?.includes('검증 완료') || 
                               status.message?.includes('생성 완료') ||
                               status.message?.includes('Iteration 완료');

    if (isCompletionStatus || (isCompletionMessage && status.current_iteration !== null)) {
      const iterText = status.current_iteration !== null && status.max_iterations !== null 
        ? ` (${status.current_iteration}/${status.max_iterations})` : '';
      const successMsg = isCompletionStatus ? `초안 생성 완료${iterText}` : `Iteration${iterText} completed`;
      useLogStore.getState().addLog('SUCCESS', successMsg, nodeType);
    }
    // Stop 종료 감지 및 기타 상태 처리 (else if로 연결하여 중복 방지)
    else if (status.status === 'STOPPED') {
      useLogStore.getState().addLog('WARN', 'Node execution cancelled', nodeType);
    } else if (status.status === 'EMBEDDING_COMPLETE') {
      useLogStore.getState().addLog('SUCCESS', `RAG 임베딩 완료`, nodeType);
    } else if (status.status === 'EMBEDDING_FAILED') {
      useLogStore.getState().addLog('ERROR', `RAG 임베딩 실패`, nodeType);
    } else if (message && message !== 'Orchestrating...') {
      useLogStore.getState().addLog(level, message, nodeType);
    }
  });

};
