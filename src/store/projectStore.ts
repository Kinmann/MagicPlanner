import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { Project, DocumentNode, LocalModule } from '../types/project';
import { useEngineStore } from './engineStore';
import { useSettingsStore } from './settingsStore';
import { convertToMarkdown } from '../utils/markdownConverter';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  nodes: DocumentNode[];
  modules: LocalModule[];
  
  isLoadingProjects: boolean;
  isLoadingNodes: boolean;
  isLoadingModules: boolean;
  error: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  fetchProject: (projectId: string) => Promise<void>;
  fetchNodes: (projectId: string) => Promise<void>;
  fetchModules: (projectId: string) => Promise<void>;
  
  // Engine Actions
  runNode: (nodeIdOrType: string) => Promise<{ status: 'SUCCESS' | 'STALE_REQUIRED' | 'ERROR', message?: string }>;
  stopNode: (nodeId: string) => Promise<void>;
  resumeNode: (nodeId: string) => Promise<void>;
  handleHITLAction: (nodeId: string, action: 'APPROVE' | 'RETRY') => Promise<void>;
  retryPatchLoop: (nodeId: string, retryCount: number) => Promise<void>;
  updateMaxIterations: (nodeId: string, maxIterations: number) => Promise<void>;
  deleteIteration: (iterationId: string) => Promise<void>;
  downloadSpecs: (nodeId: string, iterations: any[]) => Promise<void>;
  
  // Genesis Specific
  approveGenesisNode: (nodeId: string) => Promise<void>;
  approveGenesisPrd: () => Promise<void>;
  confirmGenesisIteration: (iterationId: string) => Promise<void>;
  unconfirmIteration: (iterationId: string) => Promise<void>;
  
  // SAD Specific
  runSadPipeline: (stage: 'GLOBAL' | 'MODULE', targetCount?: number) => Promise<void>;
  confirmSadIteration: (iterationId: string) => Promise<void>;
  approveSadNode: (nodeId: string) => Promise<void>;
  createLocalModules: (modulesJson: string) => Promise<void>;

  // Helpers
  setCurrentProject: (project: Project | null) => void;
  clearError: () => void;
  setError: (msg: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  nodes: [],
  modules: [],
  
  isLoadingProjects: false,
  isLoadingNodes: false,
  isLoadingModules: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoadingProjects: true, error: null });
    try {
      const list = await invoke<Project[]>('list_projects');
      set({ projects: list, isLoadingProjects: false });
    } catch (err: any) {
      set({ error: err.toString(), isLoadingProjects: false });
    }
  },

  fetchProject: async (projectId: string) => {
    try {
      const proj = await invoke<Project>('get_project', { projectId });
      set({ currentProject: proj });
    } catch (err: any) {
      console.error("Failed to fetch project:", err);
    }
  },

  fetchNodes: async (projectId: string) => {
    set({ isLoadingNodes: true });
    try {
      const result = await invoke<DocumentNode[]>('get_project_nodes', { projectId });
      set({ nodes: result, isLoadingNodes: false });
    } catch (err: any) {
      set({ error: err.toString(), isLoadingNodes: false });
    }
  },

  fetchModules: async (projectId: string) => {
    set({ isLoadingModules: true });
    try {
      const mods = await invoke<LocalModule[]>('get_project_modules', { projectId });
      set({ modules: mods, isLoadingModules: false });
    } catch (err: any) {
      set({ error: err.toString(), isLoadingModules: false });
    }
  },

  // Engine Actions Implementation
  runNode: async (nodeIdOrType) => {
    const { currentProject, nodes, fetchNodes } = get();
    if (!currentProject) return { status: 'ERROR', message: 'No project selected' };
    
    const apiKey = useSettingsStore.getState().apiKey;
    const engine = useEngineStore.getState();
    engine.setProcessing(true);
    
    const node = nodes.find(n => n.node_id === nodeIdOrType || n.target_node_type === nodeIdOrType);
    if (node?.node_state === 'STALE') {
      try {
        await invoke('generate_and_apply_patch', { 
          projectId: currentProject.project_id, 
          nodeId: node.node_id, 
          apiKey 
        });
        engine.setProcessing(false);
        return { status: 'SUCCESS' };
      } catch (err: any) {
        engine.setProcessing(false);
        return { status: 'STALE_REQUIRED', message: err.toString() };
      }
    }

    set(state => ({
      nodes: state.nodes.map(n => n.node_id === nodeIdOrType ? { ...n, node_state: 'IN_PROGRESS' } : n)
    }));

    try {
      await invoke('run_pipeline', { projectId: currentProject.project_id, nodeType: nodeIdOrType, apiKey });
      engine.setProcessing(false);
      return { status: 'SUCCESS' };
    } catch (err: any) {
      set({ error: err.toString() });
      fetchNodes(currentProject.project_id);
      engine.setProcessing(false);
      return { status: 'ERROR', message: err.toString() };
    }
  },

  stopNode: async (nodeId) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const engine = useEngineStore.getState();
    engine.setProcessing(true);
    try {
      await invoke('stop_node_pipeline', { nodeId });
    } catch (err: any) {
      set({ error: err.toString() });
    } finally {
      engine.setProcessing(false);
    }
  },

  resumeNode: async (nodeId) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const engine = useEngineStore.getState();
    engine.setProcessing(true);
    try {
      await invoke('resume_node_pipeline', { nodeId });
    } catch (err: any) {
      set({ error: err.toString() });
    } finally {
      engine.setProcessing(false);
    }
  },

  handleHITLAction: async (nodeId, action) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const apiKey = useSettingsStore.getState().apiKey;
    const engine = useEngineStore.getState();
    engine.setProcessing(true);
    try {
      await invoke('handle_hitl_action', { projectId: currentProject.project_id, nodeId, action, apiKey });
    } catch (err: any) {
      set({ error: err.toString() });
    } finally {
      engine.setProcessing(false);
    }
  },

  retryPatchLoop: async (nodeId, retryCount) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const apiKey = useSettingsStore.getState().apiKey;
    const engine = useEngineStore.getState();
    engine.setProcessing(true);
    try {
      await invoke('retry_patch_loop', { projectId: currentProject.project_id, nodeId, apiKey, retryCount });
    } catch (err: any) {
      set({ error: err.toString() });
    } finally {
      engine.setProcessing(false);
    }
  },

  updateMaxIterations: async (nodeId, maxIterations) => {
    const { currentProject, fetchNodes } = get();
    if (!currentProject) return;
    try {
      await invoke('update_node_max_iterations', { projectId: currentProject.project_id, nodeId, maxIterations });
      await fetchNodes(currentProject.project_id);
    } catch (err: any) {
      set({ error: err.toString() });
    }
  },

  deleteIteration: async (iterationId) => {
    const { currentProject, fetchNodes } = get();
    if (!currentProject) return;
    try {
      await invoke('delete_generation_iteration', { iterationId });
      await fetchNodes(currentProject.project_id);
    } catch (err: any) {
      set({ error: err.toString() });
    }
  },

  // Genesis Specific
  approveGenesisNode: async (nodeId) => {
    const apiKey = useSettingsStore.getState().apiKey;
    try {
      await invoke('approve_genesis_prd_node', { nodeId, apiKey });
    } catch (err: any) { set({ error: err.toString() }); }
  },

  approveGenesisPrd: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    const apiKey = useSettingsStore.getState().apiKey;
    try {
      await invoke('approve_genesis_prd', { projectId: currentProject.project_id, apiKey });
    } catch (err: any) { set({ error: err.toString() }); }
  },

  confirmGenesisIteration: async (iterationId) => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      await invoke('confirm_genesis_prd_iteration', { projectId: currentProject.project_id, iterationId });
    } catch (err: any) { set({ error: err.toString() }); }
  },

  unconfirmIteration: async (iterationId) => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      await invoke('unconfirm_iteration', { projectId: currentProject.project_id, iterationId });
    } catch (err: any) { set({ error: err.toString() }); }
  },

  // SAD Specific
  runSadPipeline: async (stage, targetCount) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const apiKey = useSettingsStore.getState().apiKey;
    const cmd = stage === 'GLOBAL' ? 'run_sad_global_pipeline' : 'run_sad_module_pipeline';
    try {
      await invoke(cmd, { projectId: currentProject.project_id, apiKey, targetModuleCount: targetCount });
    } catch (err: any) { set({ error: err.toString() }); }
  },

  confirmSadIteration: async (iterationId) => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      await invoke('confirm_sad_iteration', { projectId: currentProject.project_id, iterationId });
    } catch (err: any) { set({ error: err.toString() }); }
  },

  approveSadNode: async (nodeId) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const apiKey = useSettingsStore.getState().apiKey;
    try {
      await invoke('approve_sad_node', { projectId: currentProject.project_id, nodeId, apiKey });
    } catch (err: any) { set({ error: err.toString() }); }
  },

  createLocalModules: async (modulesJson) => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      await invoke('create_local_modules', { projectId: currentProject.project_id, modulesJson });
    } catch (err: any) { set({ error: err.toString() }); }
  },

  downloadSpecs: async (nodeId, iterations) => {
    const node = get().nodes.find(n => n.node_id === nodeId);
    if (!node) return;
    
    try {
      const it = iterations.find(i => i.is_pass) || iterations[iterations.length - 1];
      if (!it) return;

      const markdown = convertToMarkdown(node, it.content_json);
      const filePath = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: `${node.target_node_type}_spec.md`
      });

      if (filePath) {
        await invoke('save_file', { path: filePath, content: markdown });
      }
    } catch (err: any) {
      set({ error: err.toString() });
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),
  clearError: () => set({ error: null }),
  setError: (msg) => set({ error: msg }),
}));

// Global event listener
let isEventListenerRegistered = false;
export const initProjectEventListeners = () => {
  if (isEventListenerRegistered) return;
  
  listen('nodes-updated', () => {
    const { currentProject, fetchNodes, fetchProject, fetchModules } = useProjectStore.getState();
    if (currentProject) {
      const pid = currentProject.project_id;
      fetchNodes(pid);
      fetchProject(pid);
      fetchModules(pid);
    }
  });
  
  isEventListenerRegistered = true;
};
