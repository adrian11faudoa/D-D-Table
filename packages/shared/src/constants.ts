// ============================================================
// @mythicforge/shared — Constants
// ============================================================

export const MYTHICFORGE_VERSION = '0.1.0';
export const MIN_SUPPORTED_VERSION = '0.1.0';

// Grid
export const GRID_TYPES = ['square', 'hex-flat', 'hex-pointy', 'none'] as const;
export const DEFAULT_GRID_SIZE = 100; // px
export const DEFAULT_GRID_SCALE = '5 ft';

// Combat
export const INITIATIVE_DECIMALS = 2;
export const MAX_COMBATANTS = 64;

// Tokens
export const TOKEN_DISPOSITION = {
  HOSTILE:  -1,
  NEUTRAL:   0,
  FRIENDLY:  1,
  SECRET:    2,
} as const;

export const DISPLAY_MODES = {
  NEVER:            0,
  OWNER_HOVER:     10,
  ANYONE_HOVER:    20,
  OWNER_ALWAYS:    30,
  ALWAYS:          50,
} as const;

// Permissions
export const PERMISSION_LEVELS = {
  NONE:     0,
  LIMITED:  1,
  OBSERVER: 2,
  OWNER:    3,
} as const;

// Dice
export const STANDARD_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
export const DICE_FORMULA_REGEX = /^\s*(?:(\d+)?d(\d+)(?:([kd][hl])(\d+))?|(\d+))(?:\s*([+\-*\/])\s*(?:(\d+)?d(\d+)|(\d+)))*\s*$/i;

// Chat
export const ROLL_MODES = ['publicroll', 'gmroll', 'blindroll', 'selfroll'] as const;
export const MAX_CHAT_HISTORY = 500;

// Canvas
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5.0;
export const ZOOM_STEP = 0.1;
export const PAN_SPEED = 1.5;

// Lighting
export const DEFAULT_BRIGHT_RADIUS = 20;   // ft
export const DEFAULT_DIM_RADIUS = 40;       // ft
export const LIGHT_ANIMATION_TYPES = ['torch','pulse','chroma','wave','fog','sunburst','dome','none'] as const;

// WebSocket
export const WS_RECONNECT_DELAY = 2000;    // ms
export const WS_MAX_RECONNECTS = 10;
export const WS_PING_INTERVAL = 30_000;    // ms
export const WS_TIMEOUT = 5000;            // ms

// Server
export const DEFAULT_PORT = 3000;
export const DEFAULT_WS_PORT = 3001;
export const MAX_SESSION_PLAYERS = 16;

// Storage paths
export const DATA_DIR = 'data';
export const ASSETS_DIR = 'public/assets';
export const UPLOADS_DIR = 'public/uploads';
export const SYSTEMS_DIR = 'systems';
export const PLUGINS_DIR = 'plugins';
export const PACKS_DIR = 'packs';

// Media
export const SUPPORTED_IMAGE_TYPES = ['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'] as const;
export const SUPPORTED_VIDEO_TYPES = ['video/mp4','video/webm'] as const;
export const SUPPORTED_AUDIO_TYPES = ['audio/mp3','audio/mpeg','audio/ogg','audio/wav','audio/webm'] as const;
export const MAX_UPLOAD_SIZE_MB = 50;

// Keybindings defaults
export const DEFAULT_KEYBINDS = {
  'canvas.zoomIn':           { key: '+', modifiers: [] },
  'canvas.zoomOut':          { key: '-', modifiers: [] },
  'canvas.resetZoom':        { key: '0', modifiers: [] },
  'canvas.pan.up':           { key: 'ArrowUp', modifiers: [] },
  'canvas.pan.down':         { key: 'ArrowDown', modifiers: [] },
  'canvas.pan.left':         { key: 'ArrowLeft', modifiers: [] },
  'canvas.pan.right':        { key: 'ArrowRight', modifiers: [] },
  'tool.select':             { key: 's', modifiers: [] },
  'tool.token':              { key: 't', modifiers: [] },
  'tool.draw':               { key: 'd', modifiers: [] },
  'tool.measure':            { key: 'm', modifiers: [] },
  'tool.fog':                { key: 'f', modifiers: [] },
  'tool.light':              { key: 'l', modifiers: [] },
  'chat.focus':              { key: 'Enter', modifiers: [] },
  'combat.nextTurn':         { key: 'n', modifiers: ['Control'] },
  'token.delete':            { key: 'Delete', modifiers: [] },
  'token.copy':              { key: 'c', modifiers: ['Control'] },
  'token.paste':             { key: 'v', modifiers: ['Control'] },
  'dice.roll':               { key: 'r', modifiers: ['Control'] },
  'ui.toggle.sidebar':       { key: '\\', modifiers: [] },
  'ui.toggle.chat':          { key: 'c', modifiers: [] },
  'ui.toggle.combat':        { key: 'i', modifiers: [] },
} as const;
