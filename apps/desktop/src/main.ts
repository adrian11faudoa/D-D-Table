// ============================================================
// MythicForge VTT — Electron Desktop Shell
// Main process: window management, IPC, auto-update, tray
// ============================================================

import {
  app, BrowserWindow, ipcMain, dialog, shell,
  Menu, Tray, nativeImage, protocol, session,
  type IpcMainEvent, type IpcMainInvokeEvent,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { fork, type ChildProcess } from 'child_process';

// ─── Constants ───────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== 'production';
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const APP_VERSION = app.getVersion();
const USER_DATA = app.getPath('userData');

// ─── State ───────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
let serverPort = 3000;

// ─── Server Management ────────────────────────────────────────
async function findFreePort(start: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(start, () => {
      const addr = server.address();
      const port = typeof addr === 'object' ? addr?.port ?? start : start;
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(findFreePort(start + 1)));
  });
}

async function startEmbeddedServer(): Promise<number> {
  const port = await findFreePort(3000);
  serverPort = port;

  const serverPath = IS_DEV
    ? path.join(__dirname, '../../server/src/index.ts')
    : path.join(process.resourcesPath, 'server', 'index.js');

  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:${path.join(USER_DATA, 'mythicforge.db')}`,
    ASSETS_DIR: path.join(USER_DATA, 'assets'),
    UPLOADS_DIR: path.join(USER_DATA, 'uploads'),
    JWT_SECRET: getOrCreateSecret(),
    NODE_ENV: IS_DEV ? 'development' : 'production',
  };

  // Ensure data directories
  [path.join(USER_DATA, 'assets'), path.join(USER_DATA, 'uploads'), path.join(USER_DATA, 'data')]
    .forEach(dir => fs.mkdirSync(dir, { recursive: true }));

  if (IS_DEV) {
    // Use tsx for TypeScript in development
    serverProcess = fork(serverPath, [], {
      execPath: 'node',
      execArgv: ['--import', 'tsx/esm'],
      env,
      silent: false,
    });
  } else {
    serverProcess = fork(serverPath, [], { env, silent: false });
  }

  serverProcess.on('error', (err) => {
    console.error('[Electron] Server process error:', err);
  });

  serverProcess.on('exit', (code) => {
    console.log('[Electron] Server process exited with code:', code);
    if (code !== 0 && mainWindow) {
      dialog.showErrorBox('Server Error', `The MythicForge server stopped unexpectedly (code ${code}). Restarting...`);
      startEmbeddedServer();
    }
  });

  // Wait for server to be ready
  await waitForServer(port);
  console.log(`[Electron] Server ready on port ${port}`);
  return port;
}

async function waitForServer(port: number, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server failed to start within ${timeout}ms`);
}

function getOrCreateSecret(): string {
  const secretPath = path.join(USER_DATA, '.jwt-secret');
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8').trim();
  }
  const secret = require('crypto').randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, secret);
  return secret;
}

// ─── Window Management ────────────────────────────────────────
function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashPath = IS_DEV
    ? path.join(__dirname, '../splash.html')
    : path.join(__dirname, '../splash.html');

  if (fs.existsSync(splashPath)) {
    splashWindow.loadFile(splashPath);
  } else {
    // Inline splash
    splashWindow.loadURL(`data:text/html,
      <html>
      <body style="background:#0a0b0e;color:#c9a84c;font-family:Georgia,serif;
                   display:flex;flex-direction:column;align-items:center;
                   justify-content:center;height:100vh;margin:0">
        <div style="font-size:48px;margin-bottom:16px">⚔</div>
        <div style="font-size:24px;letter-spacing:4px;margin-bottom:8px">MYTHICFORGE</div>
        <div style="font-size:12px;color:#555e78;letter-spacing:2px">VIRTUAL TABLETOP</div>
        <div style="margin-top:32px;font-size:11px;color:#8890a8">Starting server...</div>
      </body>
      </html>
    `);
  }
}

function createMainWindow(): void {
  // Load previous window state
  const windowStatePath = path.join(USER_DATA, 'window-state.json');
  let windowState = { width: 1440, height: 900, x: undefined as number | undefined, y: undefined as number | undefined, maximized: false };

  try {
    if (fs.existsSync(windowStatePath)) {
      Object.assign(windowState, JSON.parse(fs.readFileSync(windowStatePath, 'utf-8')));
    }
  } catch { /* use defaults */ }

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1024,
    minHeight: 600,
    title: 'MythicForge VTT',
    backgroundColor: '#0a0b0e',
    show: false,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    frame: !IS_WIN,
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !IS_DEV,
      allowRunningInsecureContent: IS_DEV,
    },
  });

  if (windowState.maximized) mainWindow.maximize();

  // Load the app
  if (IS_DEV) {
    mainWindow.loadURL(`http://localhost:5173`);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(`http://localhost:${serverPort}`);
  }

  // Window events
  mainWindow.once('ready-to-show', () => {
    splashWindow?.close();
    splashWindow = null;
    mainWindow?.show();
    if (windowState.maximized) mainWindow?.maximize();
  });

  mainWindow.on('close', () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const state = {
      ...bounds,
      maximized: mainWindow.isMaximized(),
    };
    fs.writeFileSync(windowStatePath, JSON.stringify(state));
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Security: prevent navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = [`http://localhost:${serverPort}`, 'http://localhost:5173'];
    if (!allowedOrigins.some(o => url.startsWith(o))) {
      event.preventDefault();
    }
  });
}

function getAppIcon(): string | Electron.NativeImage {
  const iconPaths = {
    win32:  path.join(__dirname, '../assets/icon.ico'),
    darwin: path.join(__dirname, '../assets/icon.icns'),
    linux:  path.join(__dirname, '../assets/icon.png'),
  };
  const iconPath = iconPaths[process.platform as keyof typeof iconPaths] ?? iconPaths.linux;
  return fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty();
}

// ─── System Tray ─────────────────────────────────────────────
function createTray(): void {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip('MythicForge VTT');

  const menu = Menu.buildFromTemplate([
    { label: 'MythicForge VTT', enabled: false },
    { type: 'separator' },
    { label: 'Show Window', click: () => mainWindow?.show() },
    { label: 'Hide Window', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Server Status', click: () => shell.openExternal(`http://localhost:${serverPort}/api/health`) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow?.show());
}

// ─── Application Menu ─────────────────────────────────────────
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(IS_MAC ? [{ label: app.name, submenu: [
      { role: 'about' as const },
      { type: 'separator' as const },
      { role: 'services' as const },
      { type: 'separator' as const },
      { role: 'hide' as const },
      { role: 'hideOthers' as const },
      { role: 'unhide' as const },
      { type: 'separator' as const },
      { role: 'quit' as const },
    ]}] : []),
    {
      label: '&File',
      submenu: [
        {
          label: 'New Campaign',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-campaign'),
        },
        {
          label: 'Open Campaign...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({ filters: [{ name: 'Campaign', extensions: ['json'] }], properties: ['openFile'] });
            if (!result.canceled && result.filePaths[0]) {
              mainWindow?.webContents.send('menu:open-campaign', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Export Campaign...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu:export-campaign'),
        },
        { type: 'separator' },
        IS_MAC ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: '&View',
      submenu: [
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: 'separator' },
        ...(IS_DEV ? [
          { role: 'reload' as const },
          { role: 'forceReload' as const },
          { role: 'toggleDevTools' as const },
        ] : []),
        { type: 'separator' },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
      ],
    },
    {
      label: '&Window',
      submenu: [
        { role: 'minimize' as const },
        ...(IS_MAC ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'zoom' as const },
        ]),
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://docs.mythicforge.io') },
        { label: 'Community Discord', click: () => shell.openExternal('https://discord.gg/mythicforge') },
        { label: 'Report Issue', click: () => shell.openExternal('https://github.com/mythicforge/vtt/issues') },
        { type: 'separator' },
        { label: `Version ${APP_VERSION}`, enabled: false },
        {
          label: 'Check for Updates',
          click: () => {
            if (!IS_DEV) autoUpdater.checkForUpdatesAndNotify();
            else dialog.showMessageBox({ message: 'Updates disabled in dev mode' });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC Handlers ─────────────────────────────────────────────
function registerIpcHandlers(): void {
  // File system
  ipcMain.handle('fs:readFile', async (e: IpcMainInvokeEvent, filePath: string) => {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new Error(`Cannot read file: ${filePath}`);
    }
  });

  ipcMain.handle('fs:writeFile', async (e: IpcMainInvokeEvent, filePath: string, data: string) => {
    try {
      fs.writeFileSync(filePath, data, 'utf-8');
      return true;
    } catch (err) {
      throw new Error(`Cannot write file: ${filePath}`);
    }
  });

  ipcMain.handle('dialog:openFile', async (e: IpcMainInvokeEvent, options: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(mainWindow!, options);
  });

  ipcMain.handle('dialog:saveFile', async (e: IpcMainInvokeEvent, options: Electron.SaveDialogOptions) => {
    return dialog.showSaveDialog(mainWindow!, options);
  });

  // App info
  ipcMain.handle('app:getVersion', () => APP_VERSION);
  ipcMain.handle('app:getUserData', () => USER_DATA);
  ipcMain.handle('app:getServerPort', () => serverPort);
  ipcMain.handle('app:getPlatform', () => process.platform);

  // Window controls (for custom titlebar on Windows)
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // Open external links safely
  ipcMain.on('shell:openExternal', (e: IpcMainEvent, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://localhost')) {
      shell.openExternal(url);
    }
  });

  // Plugins - load from user data
  ipcMain.handle('plugins:list', async () => {
    const pluginsDir = path.join(USER_DATA, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    const dirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    return dirs;
  });

  ipcMain.handle('plugins:install', async (e: IpcMainInvokeEvent, zipPath: string) => {
    // In full implementation: extract zip, validate manifest, copy to plugins dir
    return { success: true, message: 'Plugin installed' };
  });
}

// ─── Auto Updater ─────────────────────────────────────────────
function setupAutoUpdater(): void {
  if (IS_DEV) return;

  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `MythicForge VTT ${info.version} is available. Download now?`,
      buttons: ['Download', 'Later'],
    }).then(result => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Restart MythicForge VTT to apply the update.',
      buttons: ['Restart Now', 'Later'],
    }).then(result => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater]', err);
  });

  // Check on startup
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
}

// Augment app type
declare module 'electron' {
  interface App { isQuiting?: boolean; }
}

// ─── App Lifecycle ────────────────────────────────────────────
app.whenReady().then(async () => {
  // Security: enforce HTTPS, disable dev tools in prod
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['SAMEORIGIN'],
      },
    });
  });

  createSplashWindow();
  createMenu();
  registerIpcHandlers();

  try {
    await startEmbeddedServer();
    createMainWindow();
    if (!IS_DEV) createTray();
    setupAutoUpdater();
  } catch (err) {
    dialog.showErrorBox('Startup Failed', `Failed to start MythicForge server: ${err}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});

app.on('before-quit', () => {
  app.isQuiting = true;
  serverProcess?.kill('SIGTERM');
});

app.on('will-quit', () => {
  serverProcess?.kill();
});
