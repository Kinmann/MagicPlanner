import { create } from 'zustand';

export type ModalType = 'ALERT' | 'CONFIRM' | 'ERROR';

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm?: () => void;
  onCancel?: () => void;

  // Actions
  showAlert: (message: string, title?: string) => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
  showError: (message: string, title?: string) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isOpen: false,
  type: 'ALERT',
  title: '',
  message: '',
  confirmLabel: '확인',
  cancelLabel: '취소',

  showAlert: (message, title = '알림') => set({
    isOpen: true,
    type: 'ALERT',
    title,
    message,
    confirmLabel: '확인',
    onConfirm: undefined,
    onCancel: undefined
  }),

  showConfirm: (message, onConfirm, title = '확인') => set({
    isOpen: true,
    type: 'CONFIRM',
    title,
    message,
    confirmLabel: '확인',
    cancelLabel: '취소',
    onConfirm,
    onCancel: undefined
  }),

  showError: (message, title = '오류') => set({
    isOpen: true,
    type: 'ERROR',
    title,
    message,
    confirmLabel: '닫기',
    onConfirm: undefined,
    onCancel: undefined
  }),

  closeModal: () => set({ isOpen: false })
}));
