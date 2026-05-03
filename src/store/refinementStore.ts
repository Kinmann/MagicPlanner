import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useSettingsStore } from './settingsStore';
import { useProjectStore } from './projectStore';

export type UpdateStep = 'IDLE' | 'INPUT' | 'ANALYZING' | 'CONFIRMATION' | 'VALIDATING' | 'VALIDATION_RESULT' | 'CASCADING' | 'SUCCESS';

export interface EnrichedComment {
  comment_id: string;
  node_id: string;
  json_path: string;
  comment_text: string;
  node_type: string;
  node_category: string;
  module_name: string | null;
  created_at: string;
}

export interface IntentItem {
  action_type: 'add' | 'modify' | 'delete';
  target_feature: string;
  search_keywords: string[];
  reasoning: string;
  action_description: string;
  key_considerations: string[];
  target_node_ids?: string[];
  is_context_mismatch?: boolean;
  mismatch_reason?: string | null;
  impact_scope?: 'local' | 'cross_module' | 'global';
}

export interface IntentSchema {
  intents: IntentItem[];
}

export interface ValidationResult {
  decision: 'PASS' | 'FAIL' | 'REFACTORING';
  rationale: string;
  violations: string[];
}

export type MessageRole = 'user' | 'assistant';
export type MessageType = 'text' | 'thinking' | 'analysis' | 'validation' | 'success' | 'error';

export interface RefinementMessage {
  id: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  data?: any;
  timestamp: number;
}

interface RefinementState {
  step: UpdateStep;
  requestText: string;
  statusMessages: any[];
  error: string | null;
  targetNodes: string[];
  intent: IntentSchema | null;
  validationResult: ValidationResult | null;
  isLoading: boolean;
  thinkingDuration: number;
  comments: EnrichedComment[];
  selectedCommentIds: Set<string>;
  isFetchingComments: boolean;
  isPanelVisible: boolean;
  mode: 'PROPERTIES' | 'REFINEMENT';
  messages: RefinementMessage[];
  isCommentsListVisible: boolean;

  // Actions
  setStep: (step: UpdateStep) => void;
  setRequestText: (text: string) => void;
  setPanelVisible: (visible: boolean) => void;
  toggleComment: (id: string) => void;
  fetchComments: (projectId: string) => Promise<void>;
  startAnalysis: (projectId: string) => Promise<void>;
  confirmRouting: (projectId: string) => Promise<void>;
  approveValidation: (projectId: string) => Promise<void>;
  reset: () => void;
  setMode: (mode: 'PROPERTIES' | 'REFINEMENT') => void;
  addMessage: (message: Omit<RefinementMessage, 'id' | 'timestamp'>) => void;
  toggleCommentsList: (visible?: boolean) => void;
  initListeners: (projectId: string) => Promise<UnlistenFn>;
}

export const useRefinementStore = create<RefinementState>((set, get) => ({
  step: 'IDLE',
  requestText: '',
  statusMessages: [],
  error: null,
  targetNodes: [],
  intent: null,
  validationResult: null,
  isLoading: false,
  thinkingDuration: 0,
  comments: [],
  selectedCommentIds: new Set(),
  isFetchingComments: false,
  isPanelVisible: false,
  mode: 'PROPERTIES',
  messages: [],
  isCommentsListVisible: false,

  setStep: (step) => set({ step }),
  setRequestText: (text) => set({ requestText: text }),
  setPanelVisible: (visible) => set({ isPanelVisible: visible }),
  setMode: (mode) => set({ mode }),

  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    }]
  })),

  toggleCommentsList: (visible) => set((state) => ({
    isCommentsListVisible: visible !== undefined ? visible : !state.isCommentsListVisible
  })),

  toggleComment: (id) => set((state) => {
    const next = new Set(state.selectedCommentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedCommentIds: next };
  }),

  fetchComments: async (projectId) => {
    set({ isFetchingComments: true });
    try {
      const res = await invoke<EnrichedComment[]>('get_project_comments', { projectId });
      set({ comments: res });
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      set({ isFetchingComments: false });
    }
  },

  startAnalysis: async (projectId) => {
    const { requestText, comments, selectedCommentIds, isLoading } = get();
    if (!requestText.trim() || isLoading) return;

    const apiKey = useSettingsStore.getState().apiKey;
    if (!apiKey) {
      set({ error: 'Gemini API Key is not configured.' });
      return;
    }

    set({ 
      isLoading: true, 
      error: null, 
      step: 'ANALYZING', 
      statusMessages: [],
      thinkingDuration: 0 
    });

    const selectedComments = comments
      .filter(c => selectedCommentIds.has(c.comment_id))
      .map(c => `[${c.node_category}.${c.node_type}${c.module_name ? `(${c.module_name})` : ''}.${c.json_path}] ${c.comment_text}`)
      .join('\n');
    
    const fullPrompt = selectedComments 
      ? `Selected Comments Context:\n${selectedComments}\n\nUser Request: ${requestText}`
      : requestText;

    try {
      // Add User Message
      get().addMessage({
        role: 'user',
        type: 'text',
        content: fullPrompt
      });

      // Add Initial Assistant Thinking Message
      const thinkingId = crypto.randomUUID();
      get().addMessage({
        role: 'assistant',
        type: 'thinking',
        content: 'Analyzing your request and architectural context...',
        data: { hideLogs: true }
      });

      const parsedIntent = await invoke<any>('parse_intent', { apiKey, projectId, rawInput: fullPrompt });
      set({ intent: parsedIntent });
      
      const routing = await invoke<any>('route_architecture_target', { apiKey, projectId, intent: parsedIntent });
      set({ targetNodes: routing.target_nodes, step: 'CONFIRMATION' });

      // Add Analysis Result Message
      get().addMessage({
        role: 'assistant',
        type: 'analysis',
        content: 'I have analyzed the impact of your request.',
        data: { intent: parsedIntent, targets: routing.target_nodes }
      });

    } catch (err: any) {
      set({ error: err.toString(), step: 'INPUT' });
      get().addMessage({
        role: 'assistant',
        type: 'error',
        content: `Analysis failed: ${err.toString()}`
      });
    } finally {
      set({ isLoading: false });
    }
  },

  confirmRouting: async (projectId) => {
    const { intent, targetNodes, isLoading } = get();
    if (isLoading) return;

    const apiKey = useSettingsStore.getState().apiKey;
    set({ isLoading: true, error: null, step: 'VALIDATING' });

    get().addMessage({
      role: 'assistant',
      type: 'thinking',
      content: 'Validating proposed changes against global constraints...'
    });

    try {
      const result = await invoke<ValidationResult>('validate_intent_globally', {
        apiKey, projectId, intent, targets: targetNodes
      });
      set({ validationResult: result, step: 'VALIDATION_RESULT' });

      get().addMessage({
        role: 'assistant',
        type: 'validation',
        content: `Validation complete: ${result.decision}`,
        data: result
      });

    } catch (err: any) {
      set({ error: err.toString(), step: 'CONFIRMATION' });
      get().addMessage({
        role: 'assistant',
        type: 'error',
        content: `Validation failed: ${err.toString()}`
      });
    } finally {
      set({ isLoading: false });
    }
  },

  approveValidation: async (projectId) => {
    const { intent, targetNodes, isLoading } = get();
    if (isLoading) return;

    set({ isLoading: true, error: null, step: 'CASCADING' });
    
    get().addMessage({
      role: 'assistant',
      type: 'thinking',
      content: 'Applying changes and propagating taint cascade...'
    });

    try {
      await invoke('apply_taint_cascade', { projectId, intent, targets: targetNodes });
      set({ step: 'SUCCESS' });
      
      get().addMessage({
        role: 'assistant',
        type: 'success',
        content: 'Architectural refinement successfully applied. Impacted artifacts have been marked as STALE.'
      });

      // Refresh nodes after cascade
      useProjectStore.getState().fetchNodes(projectId);
    } catch (err: any) {
      set({ error: err.toString(), step: 'VALIDATION_RESULT' });
      get().addMessage({
        role: 'assistant',
        type: 'error',
        content: `Cascade failed: ${err.toString()}`
      });
    } finally {
      set({ isLoading: false });
    }
  },

  reset: () => set({
    step: 'IDLE',
    requestText: '',
    statusMessages: [],
    error: null,
    targetNodes: [],
    intent: null,
    validationResult: null,
    isLoading: false,
    thinkingDuration: 0,
    selectedCommentIds: new Set(),
    messages: []
  }),

  initListeners: async (projectId) => {
    return await listen('pipeline-status', (event: any) => {
      const payload = event.payload;
      if (payload.project_id === projectId) {
        set((state) => ({
          statusMessages: [...state.statusMessages, payload]
        }));
      }
    });
  }
}));
