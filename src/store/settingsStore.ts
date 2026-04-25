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
      const store = await Store.load('settings.json');
      const saved = await store.get<{ value: string }>('gemini_api_key');
      set({ apiKey: saved?.value || "", isLoaded: true });
    } catch (err) {
      console.error("Failed to load settings:", err);
      set({ isLoaded: true });
    }
  },

  setApiKey: async (key: string) => {
    try {
      const store = await Store.load('settings.json');
      await store.set('gemini_api_key', { value: key });
      await store.save();
      set({ apiKey: key });
    } catch (err) {
      console.error("Failed to save API key:", err);
    }
  }
}));
