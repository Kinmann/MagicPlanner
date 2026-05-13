import { create } from 'zustand';
import { Store } from '@tauri-apps/plugin-store';

interface SettingsState {
  apiKey: string;
  isLoaded: boolean;
  
  // Actions
  loadSettings: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  apiKey: '',
  isLoaded: false,

  loadSettings: async () => {
    try {
      const isTauri = !!(window as any).__TAURI_INTERNALS__;
      if (isTauri) {
        const store = await Store.load('settings.json');
        const saved = await store.get<{ value: string }>('gemini_api_key');
        set({ apiKey: saved?.value || "", isLoaded: true });
      } else {
        const saved = localStorage.getItem('gemini_api_key');
        set({ apiKey: saved || "", isLoaded: true });
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      // Fallback for any other error
      const saved = localStorage.getItem('gemini_api_key');
      set({ apiKey: saved || "", isLoaded: true });
    }
  },

  setApiKey: async (key: string) => {
    try {
      const isTauri = !!(window as any).__TAURI_INTERNALS__;
      if (isTauri) {
        const store = await Store.load('settings.json');
        await store.set('gemini_api_key', { value: key });
        await store.save();
      }
      localStorage.setItem('gemini_api_key', key);
      set({ apiKey: key });
    } catch (err) {
      console.error("Failed to save API key:", err);
      localStorage.setItem('gemini_api_key', key);
      set({ apiKey: key });
    }
  }
}));
