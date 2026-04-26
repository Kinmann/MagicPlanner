import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow as tauriGetCurrentWindow } from '@tauri-apps/api/window';

/**
 * Check if the current environment is Tauri
 */
export const isTauri = () => {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
};

/**
 * Safe invoke that doesn't crash in browser
 */
export async function safeInvoke<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  if (isTauri()) {
    try {
      return await tauriInvoke<T>(cmd, args);
    } catch (err) {
      console.error(`[Tauri Error] invoke('${cmd}') failed:`, err);
      throw err;
    }
  }
  
  console.warn(`[Tauri Mock] invoke('${cmd}')`, args);
  
  // Basic mocks for common calls
  if (cmd === 'list_projects') return [] as any;
  if (cmd === 'get_project_nodes') return [] as any;
  if (cmd === 'get_project_modules') return [] as any;
  if (cmd === 'get_all_active_nodes') return [] as any;
  if (cmd === 'get_project') return null as any;
  
  return [] as any; // Default to empty array instead of null to prevent .map() crashes
}

/**
 * Safe listen that doesn't crash in browser
 */
export async function safeListen<T>(event: string, handler: (event: any) => void): Promise<UnlistenFn | void> {
  if (isTauri()) {
    return tauriListen<T>(event, handler);
  }
  
  console.warn(`[Tauri Mock] listen('${event}')`);
  return () => {};
}

/**
 * Safe window access
 */
export function safeWindow() {
  if (isTauri()) {
    try {
      return tauriGetCurrentWindow();
    } catch (e) {
      return null;
    }
  }
  return null;
}
