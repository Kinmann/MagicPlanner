import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useSettingsStore } from './settingsStore';
import { useProjectStore } from './projectStore';

export type UpdateStep = 'IDLE' | 'INPUT' | 'ANALYZING' | 'CONFIRMATION' | 'VALIDATING' | 'VALIDATION_RESULT' | 'CASCADING' | 'CASCADE_CONFIRMATION' | 'AWAITING_UPDATE' | 'REVIEWING_RESULT' | 'SUCCESS';

export interface EnrichedComment {
  comment_id: string;
  node_id: string;
  json_path: string;
  comment_text: string;
  node_type: string;
  node_category: string;
  module_name: string | null;
  created_at: string;
  original_content?: string | null;
}

export interface IntentItem {
  action_type: 'add' | 'modify' | 'delete';
  target_feature: string;
  search_keywords: string[];
  target_node_ids: string[];
  target_block_ids: string[];
  reasoning: string;
  action_description: string;
  key_considerations: string[];
  is_context_mismatch: boolean;
  mismatch_reason: string | null;
  impact_scope: 'local' | 'cross_module' | 'global';
  resolved_comment_ids: string[];
  conflict_resolution: string | null;
}


export interface IntentSchema {
  intents: IntentItem[];
}

export interface ValidationResult {
  decision: 'PASS' | 'FAIL' | 'REFACTORING';
  rationale: string;
  violations?: string[];
}

export interface RoutingSchema {
  target_nodes: string[];
  decision: 'PASS' | 'FAIL' | 'REFACTORING';
  rationale: string;
}

export interface TaintImpactItem {
  node_id: string;
  node_type: string;
  block_ids: string[];
  block_paths: string[];
  reason: string;
}

export interface TaintCascadeSchema {
  impacts: TaintImpactItem[];
  stale_count: number;
  impact_count: number;
}

export type MessageRole = 'user' | 'assistant';
export type MessageType = 'text' | 'thinking' | 'analysis' | 'validation' | 'cascade_analysis' | 'success' | 'error';

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
  confirmTaintCascade: (projectId: string) => Promise<void>;
  finalizeRefinement: (projectId: string) => Promise<void>;
  reset: () => void;
  setMode: (mode: 'PROPERTIES' | 'REFINEMENT') => void;
  addMessage: (message: Omit<RefinementMessage, 'id' | 'timestamp'>) => void;
  toggleCommentsList: (visible?: boolean) => void;
  initListeners: (projectId: string) => Promise<() => void>;
}

export const useRefinementStore = create<RefinementState>((set, get) => ({
  step: 'IDLE',
  requestText: '',
  statusMessages: [],
  error: null,
  targetNodes: [],
  intent: null,
  validationResult: null,
  taintCascadeResult: null,
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
      .map(c => {
        const modulePrefix = c.module_name || c.node_category;
        // 레거시 데이터 대응: json_path에 노드 타입이나 점이 섞여있을 경우 $로 시작하는 순수 경로만 추출
        const normalizedPath = (c.json_path.includes('$') 
          ? '$' + c.json_path.split('$')[1] 
          : c.json_path).replace(/,/g, '.');
          
        let text = `[${modulePrefix}:${c.node_type}:${normalizedPath}]`;
        if (c.original_content) {
          text += `\n  [Original Content: ${c.original_content}]`;
        }
        text += `\n  [Comment: ${c.comment_text}]`;
        return text;
      })
      .join('\n\n');
    
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
      
      // 1. Intent Analysis 결과 즉시 추가
      get().addMessage({
        role: 'assistant',
        type: 'analysis',
        content: 'I have parsed your intent and identified the target features.',
        data: { 
          intent: parsedIntent, 
          targets: [], // 아직 라우팅 전
          decision: 'PASS',
          rationale: 'Intent parsing complete. Proceeding to architectural routing...'
        }
      });
      
      // 2. Routing 단계를 위한 새로운 Thinking 메시지 추가 (로그 노출용)
      get().addMessage({
        role: 'assistant',
        type: 'thinking',
        content: 'Performing architectural routing and upward validation...',
        data: { hideLogs: false }
      });

      const routing = await invoke<RoutingSchema>('route_architecture_target', { apiKey, projectId, intent: parsedIntent });
      
      const validationResult: ValidationResult = {
        decision: routing.decision,
        rationale: routing.rationale,
        violations: []
      };

      set({ 
        targetNodes: routing.target_nodes, 
        validationResult: validationResult,
        step: routing.decision === 'PASS' ? 'CONFIRMATION' : 'VALIDATION_RESULT'
      });

      // 3. Routing 및 Validation 결과 추가 (중복 방지를 위해 type을 validation으로 설정)
      get().addMessage({
        role: 'assistant',
        type: 'validation',
        content: routing.decision === 'PASS' 
          ? 'Architectural alignment check passed.'
          : `Architecture check result: ${routing.decision}`,
        data: { 
          targets: routing.target_nodes,
          decision: routing.decision,
          rationale: routing.rationale
        }
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

  confirmRouting: async (_projectId) => {
    const { validationResult } = get();
    if (!validationResult) return;

    // 라우팅 단계에서 이미 검증이 완료되었으므로, 바로 결과 화면으로 전환
    set({ step: 'VALIDATION_RESULT' });
  },

  approveValidation: async (projectId) => {
    const { intent, targetNodes, validationResult, isLoading } = get();
    if (isLoading) return;

    set({ isLoading: true, error: null, step: 'CASCADING' });
    
    get().addMessage({
      role: 'assistant',
      type: 'thinking',
      content: 'Simulating impact of changes (Dry-run taint cascade)...'
    });

    const apiKey = useSettingsStore.getState().apiKey;

    try {
      const result = await invoke<TaintCascadeSchema>('apply_taint_cascade', { 
        apiKey,
        projectId, 
        intent, 
        targets: targetNodes,
        routerDecision: validationResult?.decision || 'PASS'
      });
      set({ taintCascadeResult: result, step: 'CASCADE_CONFIRMATION' });
      
      get().addMessage({
        role: 'assistant',
        type: 'cascade_analysis',
        content: `Impact analysis complete: ${result.stale_count} blocks will be marked as STALE, and ${result.impact_count} related blocks will be impacted.`,
        data: result
      });

    } catch (err: any) {
      set({ error: err.toString(), step: 'VALIDATION_RESULT' });
      get().addMessage({
        role: 'assistant',
        type: 'error',
        content: `Cascade simulation failed: ${err.toString()}`
      });
    } finally {
      set({ isLoading: false });
    }
  },

  confirmTaintCascade: async (projectId) => {
    const { intent, taintCascadeResult, isLoading } = get();
    if (isLoading || !taintCascadeResult) return;

    const apiKey = useSettingsStore.getState().apiKey;

    set({ isLoading: true, error: null, step: 'CASCADING' });

    try {
      await invoke('confirm_taint_cascade', { 
        apiKey,
        projectId, 
        intent, 
        cascadeResult: taintCascadeResult 
      });
      
      set({ step: 'AWAITING_UPDATE' });
      
      get().addMessage({
        role: 'assistant',
        type: 'success',
        content: 'Impact analysis confirmed. Please update the stale artifacts in the editor to see the changes.'
      });

      // Refresh nodes after cascade
      useProjectStore.getState().fetchNodes(projectId);
    } catch (err: any) {
      set({ error: err.toString(), step: 'CASCADE_CONFIRMATION' });
      get().addMessage({
        role: 'assistant',
        type: 'error',
        content: `Final application failed: ${err.toString()}`
      });
    } finally {
      set({ isLoading: false });
    }
  },

  finalizeRefinement: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('finalize_refinement_update', { projectId });
      set({ 
        step: 'SUCCESS',
        intent: null,
        taintCascadeResult: null,
        targetNodes: []
      });
      get().addMessage({
        role: 'assistant',
        type: 'success',
        content: 'Refinement session finalized. All changes have been acknowledged and synced.'
      });
      // 갱신된 노드 상태 반영
      useProjectStore.getState().fetchNodes(projectId);
    } catch (err: any) {
      set({ error: err.toString() });
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
    const unlistenStatus = await listen('pipeline-status', (event: any) => {
      const payload = event.payload;
      if (payload.project_id === projectId) {
        set((state) => ({
          statusMessages: [...state.statusMessages, payload]
        }));
      }
    });

    const unlistenNodes = await listen('nodes-updated', () => {
      const { step, targetNodes, taintCascadeResult } = get();
      
      // 업데이트 대기 중인 경우에만 체크
      if (step === 'AWAITING_UPDATE') {
        const currentNodes = useProjectStore.getState().nodes;
        
        // 대상 노드나 영향 범위 내의 노드 중 하나라도 STALE 상태를 벗어났는지 확인
        const impactedNodeIds = [
          ...targetNodes,
          ...(taintCascadeResult?.impacts.map(i => i.node_id) || [])
        ];

        const isAnyUpdated = impactedNodeIds.some(id => {
          const node = currentNodes.find(n => n.node_id === id);
          return node && node.node_state !== 'STALE';
        });

        if (isAnyUpdated) {
          set({ step: 'REVIEWING_RESULT' });
        }
      }
    });

    return () => {
      unlistenStatus();
      unlistenNodes();
    };
  }
}));
