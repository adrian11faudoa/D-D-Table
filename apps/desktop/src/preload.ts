// ============================================================
// Electron Preload — Secure contextBridge between main and renderer
// Exposes only safe, typed APIs to the renderer process
// ============================================================

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// ─── Types ───────────────────────────────────────────────────
interface FileDialogOptions {
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
  defaultPath?: string;
  title?: string;
}

interface SaveDialogOptions {
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
  title?: string;
}

interface DialogResult {
  canceled: boolean;
  filePaths?: string[];
  filePath?: string;
}

interface MythicForgeAPI {
  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getServerPort: () => Promise<number>;
  getUserDataPath: () => Promise<string>;

  // File system
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  openFileDialog: (options?: FileDialogOptions) => Promise<DialogResult>;
  saveFileDialog: (options?: SaveDialogOptions) => Promise<DialogResult>;

  // Window controls (custom titlebar on Windows)
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  // External links
  openExternal: (url: string) => void;

  // Plugins
  listPlugins: () => Promise<string[]>;

  // Menu events
  onMenuEvent: (event: string, callback: () => void) => () => void;

  // Auto-update
  checkForUpdates: () => void;
}

// ─── API Implementation ───────────────────────────────────────
const mythicForgeAPI: MythicForgeAPI = {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  getPlatform: () => ipcRenderer.invoke('app:getPlatform') as Promise<string>,
  getServerPort: () => ipcRenderer.invoke('app:getServerPort') as Promise<number>,
  getUserDataPath: () => ipcRenderer.invoke('app:getUserData') as Promise<string>,

  // File system
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path) as Promise<string>,
  writeFile: (path, data) => ipcRenderer.invoke('fs:writeFile', path, data) as Promise<void>,
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options) as Promise<DialogResult>,
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options) as Promise<DialogResult>,

  // Window
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),

  // External
  openExternal: (url) => {
    // Validate URL before sending
    if (url.startsWith('https://') || url.startsWith('http://localhost')) {
      ipcRenderer.send('shell:openExternal', url);
    }
  },

  // Plugins
  listPlugins: () => ipcRenderer.invoke('plugins:list') as Promise<string[]>,

  // Menu events
  onMenuEvent: (event, callback) => {
    const listener = (_: IpcRendererEvent) => callback();
    ipcRenderer.on(`menu:${event}`, listener);
    return () => ipcRenderer.removeListener(`menu:${event}`, listener);
  },

  // Updates
  checkForUpdates: () => ipcRenderer.send('app:checkUpdates'),
};

// ─── Expose to renderer ───────────────────────────────────────
contextBridge.exposeInMainWorld('mythicforge', mythicForgeAPI);

// ─── Type augmentation for renderer ──────────────────────────
// (copy this to a .d.ts file in your renderer project)
declare global {
  interface Window {
    mythicforge: MythicForgeAPI;
  }
}
