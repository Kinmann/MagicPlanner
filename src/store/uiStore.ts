import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PipelinePhase } from '../types/project';

export type AppView = 'SETUP' | 'DASHBOARD' | 'WORKSPACE' | 'PROMPT_VIEW' | 'CREATE_PROJECT';
export type WorkspaceViewMode = 'BOARD' | 'CONTENT';

interface BoardViewState {
  zoom: number;
  panX: number;
  panY: number;
}

interface UIState {
  currentView: AppView;
  currentProjectId: string | null;
  selectedNodeId: string | null;
  selectedModuleId: string | null;
  workspaceViewMode: WorkspaceViewMode;
  isSettingsOpen: boolean;
  viewingPromptProjectId: string | null;
  isCreatingProject: boolean;
  activePhase: PipelinePhase | null;
  dirtyNodes: string[];
  isRawMode: boolean;
  selectedIterationId: string | null; // 추가: 현재 선택된 리비전 ID
  openNodeIds: string[]; // 추가: 열려있는 탭들의 노드 ID
  isSidebarOpen: boolean;
  isRightPanelOpen: boolean;
  sidebarWidth: number; 
  metaPanelWidth: number;
  logPanelHeight: number;
  isProjectInfoOpen: boolean;


  // Persistence State
  boardViewState: BoardViewState;
  scrollPositions: Record<string, number>;

  // Actions
  navigateTo: (view: AppView) => void;
  openProject: (projectId: string) => void;
  closeProject: () => void;
  setWorkspaceViewMode: (mode: WorkspaceViewMode) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedModule: (moduleId: string | null) => void;
  toggleSettings: (open: boolean) => void;
  setViewingPromptProject: (projectId: string | null) => void;
  setActivePhase: (phase: PipelinePhase | null) => void;
  setNodeDirty: (nodeId: string, isDirty: boolean) => void;
  toggleRawMode: () => void;
  setSelectedIteration: (iterationId: string | null) => void; // 추가
  
  // Tab Actions
  openTab: (nodeId: string) => void; // 추가
  closeTab: (nodeId: string) => void; // 추가

  // Layout Actions
  toggleSidebar: () => void;
  toggleRightPanel: (open?: any) => void;
  setSidebarWidth: (width: number) => void;
  setMetaPanelWidth: (width: number) => void;
  setLogPanelHeight: (height: number) => void;
  toggleProjectInfo: (open: boolean) => void;

  
  // Persistence Actions
  setBoardViewState: (state: Partial<BoardViewState>) => void;
  setScrollPosition: (key: string, position: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'DASHBOARD',
      currentProjectId: null,
      selectedNodeId: null,
      selectedModuleId: null,
      workspaceViewMode: 'BOARD',
      isSettingsOpen: false,
      viewingPromptProjectId: null,
      isCreatingProject: false,
      activePhase: null,
      dirtyNodes: [],
      isRawMode: false,
      selectedIterationId: null,
      openNodeIds: [],
      isSidebarOpen: true,
      isRightPanelOpen: true,
      sidebarWidth: 20,
      metaPanelWidth: 20,
      logPanelHeight: 30,
      isProjectInfoOpen: false,


      boardViewState: { zoom: 1, panX: 0, panY: 0 },
      scrollPositions: {},

      navigateTo: (view: AppView) => set({ 
        currentView: view,
        isCreatingProject: view === 'CREATE_PROJECT',
        isSettingsOpen: false
      }),

      openProject: (projectId: string) => set({
        currentProjectId: projectId,
        currentView: 'WORKSPACE',
        selectedNodeId: null,
        selectedModuleId: null,
        workspaceViewMode: 'BOARD',
        isSettingsOpen: false,
        boardViewState: { zoom: 1, panX: 0, panY: 0 },
        dirtyNodes: [],
        isRawMode: false,
        selectedIterationId: null,
        openNodeIds: []
      }),

      closeProject: () => set({
        currentProjectId: null,
        currentView: 'DASHBOARD',
        selectedNodeId: null,
        selectedModuleId: null,
        scrollPositions: {},
        dirtyNodes: [],
        isRawMode: false,
        openNodeIds: []
      }),

      setWorkspaceViewMode: (mode: WorkspaceViewMode) => set({ workspaceViewMode: mode }),

      setSelectedNode: (nodeId: string | null) => set((state) => ({
        selectedNodeId: nodeId,
        workspaceViewMode: nodeId ? 'CONTENT' : state.workspaceViewMode,
        selectedIterationId: null,
        openNodeIds: nodeId && !state.openNodeIds.includes(nodeId) 
          ? [...state.openNodeIds, nodeId] 
          : state.openNodeIds
      })),

      setSelectedModule: (moduleId: string | null) => set({
        selectedModuleId: moduleId,
        workspaceViewMode: 'BOARD',
        selectedNodeId: null
      }),

      toggleSettings: (open: boolean) => set({ isSettingsOpen: open }),

      setViewingPromptProject: (projectId: string | null) => set({
        viewingPromptProjectId: projectId,
        currentView: projectId ? 'PROMPT_VIEW' : 'WORKSPACE'
      }),

      setActivePhase: (phase: PipelinePhase | null) => set({ activePhase: phase }),

      setNodeDirty: (nodeId: string, isDirty: boolean) => set((state) => ({
        dirtyNodes: isDirty 
          ? state.dirtyNodes.includes(nodeId) ? state.dirtyNodes : [...state.dirtyNodes, nodeId]
          : state.dirtyNodes.filter(id => id !== nodeId)
      })),

      toggleRawMode: () => set((state) => ({ isRawMode: !state.isRawMode })),

      setSelectedIteration: (iterationId: string | null) => set({ selectedIterationId: iterationId }),

      openTab: (nodeId: string) => set((state) => ({
        openNodeIds: state.openNodeIds.includes(nodeId) 
          ? state.openNodeIds 
          : [...state.openNodeIds, nodeId],
        selectedNodeId: nodeId,
        workspaceViewMode: 'CONTENT'
      })),

      closeTab: (nodeId: string) => set((state) => {
        const nextTabs = state.openNodeIds.filter(id => id !== nodeId);
        let nextSelected = state.selectedNodeId;
        
        if (state.selectedNodeId === nodeId) {
          nextSelected = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
        }
        
        return {
          openNodeIds: nextTabs,
          selectedNodeId: nextSelected,
          workspaceViewMode: nextSelected ? 'CONTENT' : 'BOARD'
        };
      }),

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      toggleRightPanel: (open?: any) => set((state) => ({ isRightPanelOpen: typeof open === 'boolean' ? open : !state.isRightPanelOpen })),
      setSidebarWidth: (width: number) => set({ sidebarWidth: width }),
      setMetaPanelWidth: (width: number) => set({ metaPanelWidth: width }),
      setLogPanelHeight: (height: number) => set({ logPanelHeight: height }),
      toggleProjectInfo: (open: boolean) => set({ isProjectInfoOpen: open }),


      setBoardViewState: (viewState: Partial<BoardViewState>) => set((state) => ({
        boardViewState: { ...state.boardViewState, ...viewState }
      })),

      setScrollPosition: (key: string, position: number) => set((state) => ({
        scrollPositions: { ...state.scrollPositions, [key]: position }
      })),
    }),
    {
      name: 'magic-planner-ui-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
