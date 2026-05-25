// ============================================================
// @mythicforge/plugin-api
// The complete API surface available to all plugins & game systems
// ============================================================

import type {
  UUID, Actor, Item, Scene, Token, Combat, Combatant,
  ChatMessage, DiceRoll, JournalEntry, Playlist, Macro,
  CompendiumPack, PluginManifest, User, Session, ActiveEffect
} from '@mythicforge/shared';

// ─── Hook System ─────────────────────────────────────────────
// Plugins register hooks to intercept and modify game events

type HookCallback<T extends unknown[] = unknown[]> = (...args: T) => boolean | void | Promise<boolean | void>;

class HookRegistry {
  private hooks = new Map<string, Array<{ id: string; fn: HookCallback; priority: number }>>();

  /**
   * Register a hook callback. Lower priority runs first.
   * Return `false` from a callback to stop propagation.
   */
  on<T extends unknown[]>(hookName: string, fn: HookCallback<T>, priority = 0): string {
    const id = Math.random().toString(36).slice(2);
    if (!this.hooks.has(hookName)) this.hooks.set(hookName, []);
    this.hooks.get(hookName)!.push({ id, fn: fn as HookCallback, priority });
    this.hooks.get(hookName)!.sort((a, b) => a.priority - b.priority);
    return id;
  }

  once<T extends unknown[]>(hookName: string, fn: HookCallback<T>): string {
    const id = this.on(hookName, ((...args: T) => {
      this.off(id);
      return (fn as HookCallback<T>)(...args);
    }) as HookCallback<T>);
    return id;
  }

  off(id: string): void {
    for (const [, handlers] of this.hooks) {
      const idx = handlers.findIndex(h => h.id === id);
      if (idx !== -1) { handlers.splice(idx, 1); return; }
    }
  }

  async call<T extends unknown[]>(hookName: string, ...args: T): Promise<boolean> {
    const handlers = this.hooks.get(hookName) ?? [];
    for (const { fn } of handlers) {
      const result = await fn(...args);
      if (result === false) return false;
    }
    return true;
  }

  callSync<T extends unknown[]>(hookName: string, ...args: T): boolean {
    const handlers = this.hooks.get(hookName) ?? [];
    for (const { fn } of handlers) {
      const result = fn(...args);
      if (result === false) return false;
    }
    return true;
  }
}

// ─── Well-Known Hooks ────────────────────────────────────────
// Game systems and plugins listen to these

export const HOOKS = {
  // Init
  INIT: 'init',
  READY: 'ready',
  SETUP: 'setup',

  // Actor
  PRE_CREATE_ACTOR: 'preCreateActor',
  CREATE_ACTOR: 'createActor',
  PRE_UPDATE_ACTOR: 'preUpdateActor',
  UPDATE_ACTOR: 'updateActor',
  DELETE_ACTOR: 'deleteActor',

  // Item
  PRE_CREATE_ITEM: 'preCreateItem',
  CREATE_ITEM: 'createItem',
  PRE_UPDATE_ITEM: 'preUpdateItem',
  UPDATE_ITEM: 'updateItem',
  DELETE_ITEM: 'deleteItem',

  // Token
  CREATE_TOKEN: 'createToken',
  UPDATE_TOKEN: 'updateToken',
  DELETE_TOKEN: 'deleteToken',
  HOVER_TOKEN: 'hoverToken',
  SELECT_TOKEN: 'selectToken',
  DRAG_LEFT_DROP: 'dragLeftDrop',

  // Combat
  CREATE_COMBAT: 'createCombat',
  UPDATE_COMBAT: 'updateCombat',
  DELETE_COMBAT: 'deleteCombat',
  COMBAT_TURN_CHANGE: 'combatTurnChange',
  COMBAT_ROUND_CHANGE: 'combatRoundChange',

  // Dice
  PRE_ROLL: 'preRoll',
  DICE_SO_NICE: 'diceSoNice',   // for dice animation plugins
  ROLL_COMPLETE: 'rollComplete',

  // Chat
  PRE_CREATE_CHAT_MESSAGE: 'preCreateChatMessage',
  CREATE_CHAT_MESSAGE: 'createChatMessage',

  // Canvas
  CANVAS_INIT: 'canvasInit',
  CANVAS_READY: 'canvasReady',
  CANVAS_PAN: 'canvasPan',

  // Rendering
  DRAW_GRID: 'drawGrid',
  DRAW_TOKEN: 'drawToken',
  REFRESH_TOKEN: 'refreshToken',

  // UI
  GET_CHAT_LOG_ENTRY: 'getChatLogEntry',
  RENDER_ACTOR_SHEET: 'renderActorSheet',
  RENDER_ITEM_SHEET: 'renderItemSheet',
  CLOSE_ACTOR_SHEET: 'closeActorSheet',
} as const;

// ─── Document Collections ─────────────────────────────────────
// Unified CRUD interface for game documents

export interface DocumentCollection<T extends { id: UUID }> {
  get(id: UUID): T | undefined;
  getAll(): T[];
  create(data: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<T>;
  update(id: UUID, data: Partial<T>): Promise<T>;
  delete(id: UUID): Promise<void>;
  find(predicate: (doc: T) => boolean): T[];
  getName(name: string): T | undefined;
}

// ─── The Game Object ─────────────────────────────────────────
// `game` is the global singleton — accessible everywhere in plugins

export interface MythicForgeGame {
  // Metadata
  readonly version: string;
  readonly system: GameSystemAPI;
  readonly user: User;
  readonly users: DocumentCollection<User>;
  readonly settings: SettingsManager;
  readonly i18n: I18nManager;

  // Collections
  readonly scenes: DocumentCollection<Scene>;
  readonly actors: DocumentCollection<Actor>;
  readonly items: DocumentCollection<Item>;
  readonly messages: DocumentCollection<ChatMessage>;
  readonly journal: DocumentCollection<JournalEntry>;
  readonly macros: DocumentCollection<Macro>;
  readonly playlists: DocumentCollection<Playlist>;
  readonly combats: DocumentCollection<Combat>;
  readonly packs: CompendiumManager;

  // Active state
  readonly combat: Combat | null;
  readonly canvas: CanvasAPI;
  readonly audio: AudioAPI;
  readonly keybindings: KeybindingManager;
  readonly socket: SocketAPI;

  // Permissions
  isGM: boolean;
  isAssistantGM: boolean;
}

// ─── System API ───────────────────────────────────────────────
export interface GameSystemAPI {
  id: string;
  title: string;
  version: string;
  model: Record<string, unknown>;
  template: Record<string, unknown>;

  // System-provided methods
  rollAbilityCheck?(actor: Actor, ability: string, options?: unknown): Promise<DiceRoll>;
  rollSavingThrow?(actor: Actor, ability: string, options?: unknown): Promise<DiceRoll>;
  rollAttack?(actor: Actor, item: Item, options?: unknown): Promise<DiceRoll>;
  rollDamage?(actor: Actor, item: Item, options?: unknown): Promise<DiceRoll>;
  rollInitiative?(combatants: Combatant[]): Promise<void>;
  applyDamage?(actor: Actor, amount: number, type?: string): Promise<void>;
  applyHealing?(actor: Actor, amount: number): Promise<void>;
  getAttackBonus?(actor: Actor, item: Item): number;
  getDamageBonus?(actor: Actor, item: Item): string;
  getMoveSpeed?(actor: Actor): number;
}

// ─── Canvas API ───────────────────────────────────────────────
export interface CanvasAPI {
  readonly scene: Scene | null;
  readonly stage: unknown;        // PixiJS Application
  readonly tokens: TokenLayer;
  readonly lighting: LightingLayer;
  readonly fog: FogLayer;
  readonly drawings: DrawingLayer;
  readonly grid: GridLayer;
  readonly sounds: SoundsLayer;
  readonly controls: ControlsLayer;
  readonly walls: WallsLayer;

  pan(x: number, y: number, scale?: number): Promise<void>;
  animatePan(options: { x?: number; y?: number; scale?: number; duration?: number }): Promise<void>;
  zoomTo(scale: number): void;
  recenter(): void;

  // Coordinate transforms
  gridToPixels(gx: number, gy: number): { x: number; y: number };
  pixelsToGrid(px: number, py: number): { x: number; y: number };
  getGlobalPosition(localX: number, localY: number): { x: number; y: number };

  // Measurement
  measureDistance(origin: { x: number; y: number }, target: { x: number; y: number }): number;
  getAreaTokens(origin: { x: number; y: number }, range: number): Token[];

  // Ping
  ping(x: number, y: number, style?: 'pulse' | 'alert' | 'chevron'): void;
}

export interface TokenLayer {
  tokens: Token[];
  controlled: Token[];
  get(tokenId: UUID): Token | undefined;
  selectAll(options?: { releaseOthers?: boolean }): void;
  releaseAll(): void;
  draw(): Promise<void>;
}

export interface LightingLayer {
  update(): void;
  refresh(): void;
  initialize(): Promise<void>;
}

export interface FogLayer {
  explore(position: { x: number; y: number }, radius: number): void;
  reset(): Promise<void>;
  save(): Promise<void>;
  load(): Promise<void>;
}

export interface DrawingLayer {
  createShape(config: unknown): Promise<unknown>;
  deleteShape(id: UUID): Promise<void>;
}

export interface GridLayer {
  type: string;
  size: number;
  draw(): void;
  measureDistance(a: { x: number; y: number }, b: { x: number; y: number }): number;
  highlightPosition(layerId: string, pos: { x: number; y: number }, color?: number): void;
  clearHighlightLayer(layerId: string): void;
  addHighlightLayer(layerId: string): unknown;
}

export interface SoundsLayer {
  sounds: unknown[];
  refresh(): void;
}

export interface ControlsLayer {
  draw(): void;
}

export interface WallsLayer {
  walls: unknown[];
  getRayCollisions(ray: unknown): unknown[];
  testVisibility(point: { x: number; y: number }): boolean;
}

// ─── Settings Manager ─────────────────────────────────────────
export interface SettingConfig<T = unknown> {
  name: string;
  hint?: string;
  scope: 'world' | 'client';
  config: boolean;     // show in settings UI
  default: T;
  type: BooleanConstructor | NumberConstructor | StringConstructor;
  choices?: Record<string, string>;
  range?: { min: number; max: number; step: number };
  onChange?: (value: T) => void;
}

export interface SettingsManager {
  register<T>(pluginId: string, key: string, config: SettingConfig<T>): void;
  get<T>(pluginId: string, key: string): T;
  set<T>(pluginId: string, key: string, value: T): Promise<void>;
}

// ─── I18n ─────────────────────────────────────────────────────
export interface I18nManager {
  lang: string;
  localize(key: string, data?: Record<string, unknown>): string;
  has(key: string): boolean;
  format(key: string, data: Record<string, unknown>): string;
}

// ─── Audio API ────────────────────────────────────────────────
export interface AudioAPI {
  play(src: string, options?: AudioPlayOptions): Promise<void>;
  stop(src?: string): void;
  preload(src: string): Promise<void>;
  setVolume(volume: number): void;
}

export interface AudioPlayOptions {
  volume?: number;
  loop?: boolean;
  offset?: number;
  fade?: number;
}

// ─── Socket API ───────────────────────────────────────────────
export interface SocketAPI {
  emit<T>(type: string, data: T, userId?: UUID | 'all' | 'gm'): void;
  on<T>(type: string, handler: (data: T, userId: UUID) => void): () => void;
}

// ─── Keybinding Manager ───────────────────────────────────────
export interface KeybindingAction {
  name: string;
  hint: string;
  editable: Array<{ key: string; modifiers: string[] }>;
  restricted: boolean;
  reservedModifiers?: string[];
  precedence?: number;
  onDown?: (ctx: { event: KeyboardEvent; action: string }) => boolean | void;
  onUp?: (ctx: { event: KeyboardEvent; action: string }) => boolean | void;
}

export interface KeybindingManager {
  register(pluginId: string, key: string, action: KeybindingAction): void;
  get(pluginId: string, key: string): KeybindingAction | undefined;
  activeKeys: Set<string>;
}

// ─── Compendium Manager ───────────────────────────────────────
export interface CompendiumManager {
  packs: CompendiumPack[];
  get(packId: string): CompendiumCollection | undefined;
  search(options: { query?: string; types?: string[]; fields?: string[] }): Promise<unknown[]>;
}

export interface CompendiumCollection {
  metadata: CompendiumPack;
  index: Map<UUID, { _id: UUID; name: string; img?: string }>;
  get(id: UUID): Promise<unknown>;
  getDocuments(): Promise<unknown[]>;
  importAll(): Promise<void>;
}

// ─── UI Helpers ───────────────────────────────────────────────
export interface DialogConfig {
  title: string;
  content: string;
  buttons?: Record<string, {
    label: string;
    icon?: string;
    callback?: (html: HTMLElement) => unknown;
  }>;
  default?: string;
  close?: () => void;
  render?: (html: HTMLElement) => void;
}

export interface NotificationOptions {
  permanent?: boolean;
  type?: 'info' | 'warning' | 'error';
  localize?: boolean;
}

export class UIHelpers {
  static notify(message: string, options?: NotificationOptions): void {
    console.log(`[UI Notification] ${options?.type ?? 'info'}: ${message}`);
  }

  static async dialog(config: DialogConfig): Promise<unknown> {
    return new Promise((resolve) => {
      console.log('[UI Dialog]', config.title);
      resolve(null);
    });
  }

  static async confirm(title: string, content: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('[UI Confirm]', title, content);
      resolve(true);
    });
  }
}

// ─── Base Plugin Class ────────────────────────────────────────
export abstract class MythicForgePlugin {
  abstract readonly manifest: PluginManifest;
  protected hooks = new HookRegistry();
  protected settings: SettingsManager | null = null;
  protected game: MythicForgeGame | null = null;

  async initialize(game: MythicForgeGame): Promise<void> {
    this.game = game;
    this.settings = game.settings;
    this.registerSettings();
    this.registerHooks();
    await this.onInit();
  }

  protected abstract registerSettings(): void;
  protected abstract registerHooks(): void;
  protected abstract onInit(): Promise<void>;

  onReady(): void {}
  onSetup(): void {}
}

// ─── Base Game System ─────────────────────────────────────────
export abstract class BaseGameSystem extends MythicForgePlugin {
  abstract readonly id: string;
  abstract readonly actorTypes: string[];
  abstract readonly itemTypes: string[];

  abstract prepareActorData(actor: Actor): void;
  abstract prepareItemData(item: Item): void;
  abstract rollInitiative(combatants: Combatant[]): Promise<void>;
}

// ─── Global Registration ──────────────────────────────────────
export const Hooks = new HookRegistry();

// These would be populated by the core application at runtime
export let game: MythicForgeGame;

export function setGame(g: MythicForgeGame): void {
  (globalThis as Record<string, unknown>).game = g;
  (module as Record<string, unknown>).game = g;
}

// ─── Exports ──────────────────────────────────────────────────
export { HookRegistry };
