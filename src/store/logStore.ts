import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { useProjectStore } from './projectStore';

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
export const initLogEventListeners = async () => {
  // 백엔드 파이프라인 상태 이벤트 리스너
  await listen<any>('pipeline-status', (event) => {
    const payload = event.payload;
    let message = '';
    let level: LogEntry['level'] = 'INFO';
    let nodeType = undefined;

    if (typeof payload === 'string') {
      message = payload;
    } else if (payload && typeof payload === 'object') {
      message = payload.message || JSON.stringify(payload);
      level = (payload.level as any) || 'INFO';
      nodeType = payload.node_type || payload.target_node_type;
    }

    if (message) {
      useLogStore.getState().addLog(level, message, nodeType);
    }
  });

  // 노드 업데이트 이벤트 리스너
  await listen('nodes-updated', () => {
    useLogStore.getState().addLog('SUCCESS', 'Project nodes updated and synchronized.');
  });
};
