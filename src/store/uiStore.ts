import { create } from 'zustand';
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
  
  // Persistence Actions
  setBoardViewState: (state: Partial<BoardViewState>) => void;
  setScrollPosition: (key: string, position: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'DASHBOARD',
  currentProjectId: null,
  selectedNodeId: null,
  selectedModuleId: null,
  workspaceViewMode: 'BOARD',
  isSettingsOpen: false,
  viewingPromptProjectId: null,
  isCreatingProject: false,
  activePhase: null,

  boardViewState: { zoom: 1, panX: 0, panY: 0 },
  scrollPositions: {},

  navigateTo: (view) => set({ 
    currentView: view,
    isCreatingProject: view === 'CREATE_PROJECT'
  }),

  openProject: (projectId) => set({
    currentProjectId: projectId,
    currentView: 'WORKSPACE',
    selectedNodeId: null,
    selectedModuleId: null,
    workspaceViewMode: 'BOARD',
    boardViewState: { zoom: 1, panX: 0, panY: 0 } // 프로젝트 오픈 시 보드 초기화
  }),

  closeProject: () => set({
    currentProjectId: null,
    currentView: 'DASHBOARD',
    selectedNodeId: null,
    selectedModuleId: null,
    scrollPositions: {}
  }),

  setWorkspaceViewMode: (mode) => set({ workspaceViewMode: mode }),

  setSelectedNode: (nodeId) => set((state) => ({
    selectedNodeId: nodeId,
    workspaceViewMode: nodeId ? 'CONTENT' : state.workspaceViewMode
  })),

  setSelectedModule: (moduleId) => set({
    selectedModuleId: moduleId,
    workspaceViewMode: 'BOARD',
    selectedNodeId: null
  }),

  toggleSettings: (open) => set({ isSettingsOpen: open }),

  setViewingPromptProject: (projectId) => set({
    viewingPromptProjectId: projectId,
    currentView: projectId ? 'PROMPT_VIEW' : 'WORKSPACE'
  }),

  setActivePhase: (phase) => set({ activePhase: phase }),

  setBoardViewState: (viewState) => set((state) => ({
    boardViewState: { ...state.boardViewState, ...viewState }
  })),

  setScrollPosition: (key, position) => set((state) => ({
    scrollPositions: { ...state.scrollPositions, [key]: position }
  })),
}));
