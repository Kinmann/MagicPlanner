import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { NodeComment, CreateCommentParams } from '../types/comment';

interface CommentState {
  comments: NodeComment[];
  activeJsonPath: string | null;
  isCommentPanelOpen: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchComments: (nodeId: string) => Promise<void>;
  addComment: (params: CreateCommentParams) => Promise<void>;
  updateComment: (commentId: string, text: string, isResolved: boolean) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  setActiveJsonPath: (path: string | null) => void;
  setCommentPanelOpen: (isOpen: boolean) => void;
  
  // Helpers
  getCommentsForPath: (path: string) => NodeComment[];
  getCommentCountForPath: (path: string) => number;
}

export const useCommentStore = create<CommentState>((set, get) => ({
  comments: [],
  activeJsonPath: null,
  isCommentPanelOpen: false,
  isLoading: false,
  error: null,

  fetchComments: async (nodeId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<NodeComment[]>('get_node_comments', { nodeId });
      set({ comments: result, isLoading: false });
    } catch (err: any) {
      set({ error: err.toString(), isLoading: false });
    }
  },

  addComment: async (params: CreateCommentParams) => {
    set({ isLoading: true, error: null });
    try {
      const newComment = await invoke<NodeComment>('create_comment', {
        projectId: params.projectId,
        nodeId: params.nodeId,
        iterationId: params.iterationId,
        jsonPath: params.jsonPath,
        commentText: params.commentText,
      });
      set((state) => ({ 
        comments: [...state.comments, newComment],
        isLoading: false 
      }));
    } catch (err: any) {
      set({ error: err.toString(), isLoading: false });
      throw err; // UI에서 에러 처리를 위해 throw
    }
  },

  updateComment: async (commentId: string, text: string, isResolved: boolean) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await invoke<NodeComment>('update_comment', {
        commentId,
        commentText: text,
        isResolved,
      });
      set((state) => ({
        comments: state.comments.map((c) => 
          c.comment_id === commentId ? updated : c
        ),
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.toString(), isLoading: false });
    }
  },

  deleteComment: async (commentId: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('delete_comment', { commentId });
      set((state) => ({
        comments: state.comments.filter((c) => c.comment_id !== commentId),
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.toString(), isLoading: false });
    }
  },

  setActiveJsonPath: (path: string | null) => set({ activeJsonPath: path }),
  setCommentPanelOpen: (isOpen: boolean) => set({ isCommentPanelOpen: isOpen }),

  getCommentsForPath: (path: string) => {
    return get().comments.filter((c) => c.json_path === path);
  },

  getCommentCountForPath: (path: string) => {
    return get().comments.filter((c) => c.json_path === path).length;
  },
}));
