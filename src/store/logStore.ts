import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';

export interface LogEntry {
  id: string;
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

interface LogState {
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], message: string) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  logs: [
    { id: 'init', time: new Date().toLocaleTimeString(), level: 'INFO', message: 'System log initialized.' }
  ],
  addLog: (level, message) => set((state) => ({
    logs: [...state.logs, {
      id: Math.random().toString(36).substring(7),
      time: new Date().toLocaleTimeString(),
      level,
      message
    }].slice(-200) // 최근 200개만 유지
  })),
  clearLogs: () => set({ logs: [] }),
}));

// 실시간 이벤트 리스너 등록
export const initLogEventListeners = async () => {
  // 백엔드 파이프라인 상태 이벤트 리스너
  await listen<{ message: string; level?: string }>('pipeline-status', (event) => {
    const { message, level = 'INFO' } = event.payload;
    useLogStore.getState().addLog(level as any, message);
  });

  // 노드 업데이트 이벤트 리스너
  await listen('nodes-updated', () => {
    useLogStore.getState().addLog('INFO', 'Project nodes updated and synchronized.');
  });
};
