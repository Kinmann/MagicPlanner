import { create } from 'zustand';
import { safeInvoke, safeListen } from '../utils/tauri';
import { normalizePipelineStatus, formatStatusMessage } from '../utils/statusHandler';
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
  isEmbedding: boolean;

  // Actions
  addRunningNode: (node: RunningNode) => void;
  removeRunningNode: (nodeId: string) => void;
  syncRunningNodes: () => Promise<void>;
  setLastError: (error: RagErrorInfo | null) => void;
  toggleErrorModal: (open: boolean) => void;
  setProcessing: (processing: boolean) => void;
  setEmbedding: (embedding: boolean) => void;
  initEngineEventListeners: () => Promise<() => void>;
}

export const useEngineStore = create<EngineState>((set, get) => ({
  runningNodes: [],
  lastError: null,
  isErrorModalOpen: false,
  isProcessing: false,
  isEmbedding: false,

  addRunningNode: (node) => set((state) => {
    if (state.runningNodes.some(n => n.nodeId === node.nodeId)) return state;
    return { runningNodes: [...state.runningNodes, node] };
  }),

  removeRunningNode: (nodeId) => set((state) => ({
    runningNodes: state.runningNodes.filter(n => n.nodeId !== nodeId)
  })),

  syncRunningNodes: async () => {
    try {
      const activeNodes = await safeInvoke<any[]>('get_all_active_nodes').catch(() => []);
      
      if (Array.isArray(activeNodes)) {
        const mappedNodes: RunningNode[] = activeNodes.map(n => ({
          nodeId: n.node_id,
          projectId: n.project_id,
          projectName: n.project_name,
          nodeType: n.target_node_type,
          lastAction: n.last_action
        }));
        set({ runningNodes: mappedNodes });
      } else {
        set({ runningNodes: [] });
      }
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
  setEmbedding: (embedding) => set({ isEmbedding: embedding }),

  initEngineEventListeners: async () => {
    if ((window as any).__engineEventListenersInitialized) {
      return () => {};
    }

    // 1. 노드 상태 변경 감지
    const unlistenNodes = await safeListen('nodes-updated', () => {
      get().syncRunningNodes();
    });

    // 2. 파이프라인 상세 상태 메시지 처리
    const unlistenStatus = await safeListen<any>('pipeline-status', (event) => {
      const status = normalizePipelineStatus(event.payload);
      if (!status) return;

      const { node_id, project_id, node_type, status: eventStatus } = status;
      const displayAction = formatStatusMessage(status);

      if (eventStatus === 'EMBEDDING_START') {
        set({ isEmbedding: true });
      } else if (eventStatus === 'EMBEDDING_COMPLETE' || eventStatus === 'EMBEDDING_FAILED') {
        set({ isEmbedding: false });
      }

      const isFinalIteration = status.current_iteration !== undefined && 
                               status.max_iterations !== undefined && 
                               status.current_iteration === status.max_iterations;

      const isRemovalStatus = ['COMPLETED', 'ERROR', 'FAILED', 'STOPPED', 'EMBEDDING_COMPLETE', 'EMBEDDING_FAILED'].includes(eventStatus) || 
                              (eventStatus === 'ITERATION_COMPLETED' && isFinalIteration);
      const isAdditionStatus = ['START', 'IN_PROGRESS', 'EMBEDDING_START'].includes(eventStatus) || 
                               (eventStatus === 'ITERATION_COMPLETED' && !isFinalIteration);

      if (isRemovalStatus) {
        get().removeRunningNode(node_id);
        const projectStore = useProjectStore.getState();
        if (projectStore.currentProject?.project_id === project_id) {
          projectStore.fetchNodes(project_id);
          projectStore.fetchModules(project_id);
          projectStore.fetchProject(project_id);
        }
      } else if (isAdditionStatus || (node_id && !get().runningNodes.some(n => n.nodeId === node_id))) {
        // 새 노드 추가 또는 상태 업데이트
        if (!get().runningNodes.some(n => n.nodeId === node_id)) {
          const projectName = useProjectStore.getState().currentProject?.project_name || 'System';
          get().addRunningNode({
            nodeId: node_id,
            projectId: project_id,
            projectName: projectName,
            nodeType: node_type,
            lastAction: displayAction
          });
        } else {
          // 상태 업데이트
          set(state => ({
            runningNodes: state.runningNodes.map(n => 
              n.nodeId === node_id ? { ...n, lastAction: displayAction } : n
            )
          }));
        }
      }
    });

    const unlistenError = await safeListen<RagErrorInfo>('rag-error', (event) => {
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
