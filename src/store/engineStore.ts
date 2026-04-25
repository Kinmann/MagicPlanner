import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useProjectStore } from './projectStore';

export interface RunningNode {
  nodeId: string;
  projectId: string;
  projectName: string;
  nodeType: string;
  lastAction?: string | null;
}

export interface RagErrorInfo {
  project_id: string;
  node_id: string;
  node_type: string;
  error_message: string;
}

interface EngineState {
  runningNodes: RunningNode[];
  lastError: RagErrorInfo | null;
  isErrorModalOpen: boolean;
  isProcessing: boolean;

  // Actions
  addRunningNode: (node: RunningNode) => void;
  removeRunningNode: (nodeId: string) => void;
  syncRunningNodes: () => Promise<void>;
  setLastError: (error: RagErrorInfo | null) => void;
  toggleErrorModal: (open: boolean) => void;
  setProcessing: (processing: boolean) => void;
  initEngineEventListeners: () => Promise<() => void>;
}

export const useEngineStore = create<EngineState>((set, get) => ({
  runningNodes: [],
  lastError: null,
  isErrorModalOpen: false,
  isProcessing: false,

  addRunningNode: (node) => set((state) => {
    if (state.runningNodes.some(n => n.nodeId === node.nodeId)) return state;
    return { runningNodes: [...state.runningNodes, node] };
  }),

  removeRunningNode: (nodeId) => set((state) => ({
    runningNodes: state.runningNodes.filter(n => n.nodeId !== nodeId)
  })),

  syncRunningNodes: async () => {
    try {
      const activeNodes = await invoke<any[]>('get_all_active_nodes').catch(() => []);
      const mappedNodes: RunningNode[] = activeNodes.map(n => ({
        nodeId: n.node_id,
        projectId: n.project_id,
        projectName: n.project_name,
        nodeType: n.target_node_type,
        lastAction: n.last_action
      }));
      
      set({ runningNodes: mappedNodes });
    } catch (err) {
      console.error('Failed to sync running nodes:', err);
    }
  },

  setLastError: (error) => set({ 
    lastError: error,
    isErrorModalOpen: !!error 
  }),

  toggleErrorModal: (open) => set({ isErrorModalOpen: open }),

  setProcessing: (processing) => set({ isProcessing: processing }),

  initEngineEventListeners: async () => {
    if ((window as any).__engineEventListenersInitialized) {
      return () => {};
    }

    // 1. 노드 상태 변경 감지
    const unlistenNodes = await listen('nodes-updated', () => {
      get().syncRunningNodes();
    });

    // 2. 파이프라인 상세 상태 메시지 처리 (문자열 또는 객체 지원)
    const unlistenStatus = await listen<any>('pipeline-status', (event) => {
      const payload = event.payload;
      
      if (typeof payload === 'string') {
        // 모든 실행 중인 노드 중 관련 있는 노드의 lastAction 업데이트 (보통 현재 워크스페이스 노드)
        set(state => ({
          runningNodes: state.runningNodes.map(n => ({
            ...n,
            lastAction: payload // 일단 모든 활성 노드에 메시지 전파 (상세 매칭 로직은 추후 보강 가능)
          }))
        }));
      } else if (payload && typeof payload === 'object') {
        const { node_id, project_id, project_name, node_type, status } = payload;
        if (status === 'START') {
          get().addRunningNode({ 
            nodeId: node_id, 
            projectId: project_id, 
            projectName: project_name || 'Unknown Project',
            nodeType: node_type 
          });
        } else {
          get().removeRunningNode(node_id);
          const projectStore = useProjectStore.getState();
          if (projectStore.currentProject?.project_id === project_id) {
            projectStore.fetchNodes(project_id);
            projectStore.fetchModules(project_id);
            projectStore.fetchProject(project_id);
          }
        }
      }
    });

    const unlistenError = await listen<RagErrorInfo>('rag-error', (event) => {
      get().setLastError(event.payload);
    });

    (window as any).__engineEventListenersInitialized = true;
    get().syncRunningNodes();

    return () => {
      unlistenNodes();
      unlistenStatus();
      unlistenError();
      (window as any).__engineEventListenersInitialized = false;
    };
  },
}));
