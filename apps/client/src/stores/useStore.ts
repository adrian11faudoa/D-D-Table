// ============================================================
// MythicForge VTT — Zustand Global Store
// Manages session, scene, combat, chat, and UI state
// ============================================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Session, Scene, Token, Combat, Combatant, Actor,
  ChatMessage, User, DiceRoll, UUID
} from '@mythicforge/shared';
import { NetworkClient } from '@mythicforge/network';

// ─── UI State ────────────────────────────────────────────────
export type PanelId = 'combat' | 'chat' | 'character' | 'journal' | 'assets' | 'scenes' | 'audio' | 'settings' | 'plugins';
export type CanvasTool = 'select' | 'token' | 'measure' | 'draw' | 'fog' | 'light' | 'wall' | 'note' | 'template';
export type RollMode = 'publicroll' | 'gmroll' | 'blindroll' | 'selfroll';

interface UIState {
  activePanel: PanelId;
  activeTool: CanvasTool;
  rollMode: RollMode;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  rightPanelWidth: number;
  zoom: number;
  panX: number;
  panY: number;
  selectedTokenIds: Set<UUID>;
  hoveredTokenId: UUID | null;
  openSheets: UUID[];  // actor IDs with open sheets
  notifications: Notification[];
  keysDown: Set<string>;
}

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: number;
  permanent?: boolean;
}

// ─── Session State ────────────────────────────────────────────
interface SessionState {
  session: Session | null;
  user: User | null;
  connectedUsers: User[];
  isGM: boolean;
  isConnected: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  ping: number;
  sessionStartTime: number | null;
}

// ─── World State ──────────────────────────────────────────────
interface WorldState {
  scenes: Map<UUID, Scene>;
  actors: Map<UUID, Actor>;
  messages: ChatMessage[];
  combat: Combat | null;
  activeScene: Scene | null;
}

// ─── Combined Store ───────────────────────────────────────────
export interface MythicForgeStore extends UIState, SessionState, WorldState {
  // ── Network ──────────────────────────────────────────────
  network: NetworkClient | null;
  initNetwork: (config: Parameters<typeof NetworkClient.prototype.connect>[0] extends never ? never : object) => void;

  // ── Session Actions ──────────────────────────────────────
  setSession: (session: Session) => void;
  setUser: (user: User) => void;
  setConnectedUsers: (users: User[]) => void;
  setConnectionState: (state: SessionState['connectionState']) => void;
  setPing: (ms: number) => void;

  // ── Scene Actions ─────────────────────────────────────────
  setActiveScene: (sceneId: UUID) => void;
  updateScene: (sceneId: UUID, data: Partial<Scene>) => void;
  addScene: (scene: Scene) => void;
  removeScene: (sceneId: UUID) => void;

  // ── Token Actions ─────────────────────────────────────────
  addToken: (sceneId: UUID, token: Token) => void;
  updateToken: (sceneId: UUID, tokenId: UUID, data: Partial<Token>) => void;
  removeToken: (sceneId: UUID, tokenId: UUID) => void;
  moveToken: (sceneId: UUID, tokenId: UUID, x: number, y: number) => void;
  selectToken: (tokenId: UUID, additive?: boolean) => void;
  deselectAllTokens: () => void;

  // ── Actor Actions ─────────────────────────────────────────
  setActors: (actors: Actor[]) => void;
  updateActor: (actorId: UUID, data: Partial<Actor>) => void;
  updateActorPath: (actorId: UUID, path: string, value: unknown) => void;

  // ── Combat Actions ────────────────────────────────────────
  setCombat: (combat: Combat | null) => void;
  updateCombat: (data: Partial<Combat>) => void;
  nextTurn: () => void;
  prevTurn: () => void;
  updateCombatant: (combatantId: UUID, data: Partial<Combatant>) => void;
  addCombatant: (combatant: Combatant) => void;
  removeCombatant: (combatantId: UUID) => void;

  // ── Chat Actions ──────────────────────────────────────────
  addMessage: (message: ChatMessage) => void;
  deleteMessage: (messageId: UUID) => void;
  setMessages: (messages: ChatMessage[]) => void;

  // ── UI Actions ────────────────────────────────────────────
  setPanel: (panel: PanelId) => void;
  setTool: (tool: CanvasTool) => void;
  setRollMode: (mode: RollMode) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  openSheet: (actorId: UUID) => void;
  closeSheet: (actorId: UUID) => void;
  addNotification: (message: string, type?: Notification['type'], permanent?: boolean) => void;
  removeNotification: (id: string) => void;
  pressKey: (key: string) => void;
  releaseKey: (key: string) => void;
}

// ─── Deep path setter ─────────────────────────────────────────
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current[part] === undefined || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

// ─── Store Implementation ─────────────────────────────────────
export const useStore = create<MythicForgeStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // ── Initial State ──────────────────────────────────────
      // UI
      activePanel: 'combat',
      activeTool: 'select',
      rollMode: 'publicroll',
      sidebarCollapsed: false,
      rightPanelCollapsed: false,
      rightPanelWidth: 280,
      zoom: 1,
      panX: 0,
      panY: 0,
      selectedTokenIds: new Set(),
      hoveredTokenId: null,
      openSheets: [],
      notifications: [],
      keysDown: new Set(),

      // Session
      session: null,
      user: null,
      connectedUsers: [],
      isGM: false,
      isConnected: false,
      connectionState: 'disconnected',
      ping: 0,
      sessionStartTime: null,

      // World
      scenes: new Map(),
      actors: new Map(),
      messages: [],
      combat: null,
      activeScene: null,

      // Network
      network: null,

      // ── Network ───────────────────────────────────────────
      initNetwork: (config) => {
        // NetworkClient instantiation handled separately
      },

      // ── Session ───────────────────────────────────────────
      setSession: (session) => set(state => {
        state.session = session;
        state.sessionStartTime = Date.now();
      }),

      setUser: (user) => set(state => {
        state.user = user;
        state.isGM = user.role === 'gm' || user.role === 'assistant-gm';
      }),

      setConnectedUsers: (users) => set(state => {
        state.connectedUsers = users;
        state.isConnected = true;
      }),

      setConnectionState: (connectionState) => set(state => {
        state.connectionState = connectionState;
        state.isConnected = connectionState === 'connected';
      }),

      setPing: (ping) => set(state => { state.ping = ping; }),

      // ── Scene ─────────────────────────────────────────────
      setActiveScene: (sceneId) => set(state => {
        const scene = state.scenes.get(sceneId);
        if (scene) state.activeScene = scene;
      }),

      updateScene: (sceneId, data) => set(state => {
        const scene = state.scenes.get(sceneId);
        if (scene) {
          Object.assign(scene, data);
          if (state.activeScene?.id === sceneId) {
            Object.assign(state.activeScene, data);
          }
        }
      }),

      addScene: (scene) => set(state => {
        state.scenes.set(scene.id, scene);
      }),

      removeScene: (sceneId) => set(state => {
        state.scenes.delete(sceneId);
        if (state.activeScene?.id === sceneId) state.activeScene = null;
      }),

      // ── Token ─────────────────────────────────────────────
      addToken: (sceneId, token) => set(state => {
        const scene = state.scenes.get(sceneId);
        if (scene) scene.tokens.push(token);
        if (state.activeScene?.id === sceneId) state.activeScene?.tokens.push(token);
      }),

      updateToken: (sceneId, tokenId, data) => set(state => {
        const scene = state.scenes.get(sceneId);
        if (scene) {
          const token = scene.tokens.find(t => t.id === tokenId);
          if (token) Object.assign(token, data);
        }
        if (state.activeScene?.id === sceneId) {
          const token = state.activeScene.tokens.find(t => t.id === tokenId);
          if (token) Object.assign(token, data);
        }
      }),

      removeToken: (sceneId, tokenId) => set(state => {
        const filter = (tokens: Token[]) => tokens.filter(t => t.id !== tokenId);
        const scene = state.scenes.get(sceneId);
        if (scene) scene.tokens = filter(scene.tokens);
        if (state.activeScene?.id === sceneId) {
          state.activeScene.tokens = filter(state.activeScene.tokens);
        }
        state.selectedTokenIds.delete(tokenId);
      }),

      moveToken: (sceneId, tokenId, x, y) => {
        get().updateToken(sceneId, tokenId, { x, y });
      },

      selectToken: (tokenId, additive = false) => set(state => {
        if (!additive) state.selectedTokenIds.clear();
        if (state.selectedTokenIds.has(tokenId)) {
          state.selectedTokenIds.delete(tokenId);
        } else {
          state.selectedTokenIds.add(tokenId);
        }
      }),

      deselectAllTokens: () => set(state => {
        state.selectedTokenIds.clear();
      }),

      // ── Actor ─────────────────────────────────────────────
      setActors: (actors) => set(state => {
        state.actors.clear();
        actors.forEach(a => state.actors.set(a.id, a));
      }),

      updateActor: (actorId, data) => set(state => {
        const actor = state.actors.get(actorId);
        if (actor) Object.assign(actor, data);
      }),

      updateActorPath: (actorId, path, value) => set(state => {
        const actor = state.actors.get(actorId);
        if (actor) setPath(actor as unknown as Record<string, unknown>, path, value);
      }),

      // ── Combat ────────────────────────────────────────────
      setCombat: (combat) => set(state => { state.combat = combat; }),

      updateCombat: (data) => set(state => {
        if (state.combat) Object.assign(state.combat, data);
      }),

      nextTurn: () => set(state => {
        if (!state.combat) return;
        const alive = state.combat.combatants.filter(c => !c.defeated);
        state.combat.turn++;
        if (state.combat.turn >= alive.length) {
          state.combat.turn = 0;
          state.combat.round++;
        }
      }),

      prevTurn: () => set(state => {
        if (!state.combat) return;
        state.combat.turn--;
        if (state.combat.turn < 0) {
          if (state.combat.round > 1) {
            state.combat.round--;
            state.combat.turn = state.combat.combatants.filter(c => !c.defeated).length - 1;
          } else {
            state.combat.turn = 0;
          }
        }
      }),

      updateCombatant: (combatantId, data) => set(state => {
        if (!state.combat) return;
        const c = state.combat.combatants.find(c => c.id === combatantId);
        if (c) Object.assign(c, data);
      }),

      addCombatant: (combatant) => set(state => {
        state.combat?.combatants.push(combatant);
      }),

      removeCombatant: (combatantId) => set(state => {
        if (!state.combat) return;
        state.combat.combatants = state.combat.combatants.filter(c => c.id !== combatantId);
      }),

      // ── Chat ──────────────────────────────────────────────
      addMessage: (message) => set(state => {
        state.messages.push(message);
        if (state.messages.length > 500) state.messages.shift();
      }),

      deleteMessage: (messageId) => set(state => {
        state.messages = state.messages.filter(m => m.id !== messageId);
      }),

      setMessages: (messages) => set(state => { state.messages = messages; }),

      // ── UI ────────────────────────────────────────────────
      setPanel: (activePanel) => set(state => { state.activePanel = activePanel; }),
      setTool: (activeTool) => set(state => { state.activeTool = activeTool; }),
      setRollMode: (rollMode) => set(state => { state.rollMode = rollMode; }),
      setZoom: (zoom) => set(state => { state.zoom = zoom; }),
      setPan: (x, y) => set(state => { state.panX = x; state.panY = y; }),

      toggleSidebar: () => set(state => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      }),

      toggleRightPanel: () => set(state => {
        state.rightPanelCollapsed = !state.rightPanelCollapsed;
      }),

      setRightPanelWidth: (width) => set(state => {
        state.rightPanelWidth = Math.max(220, Math.min(480, width));
      }),

      openSheet: (actorId) => set(state => {
        if (!state.openSheets.includes(actorId)) state.openSheets.push(actorId);
      }),

      closeSheet: (actorId) => set(state => {
        state.openSheets = state.openSheets.filter(id => id !== actorId);
      }),

      addNotification: (message, type = 'info', permanent = false) => set(state => {
        const id = Math.random().toString(36).slice(2);
        state.notifications.push({ id, message, type, timestamp: Date.now(), permanent });
        // Auto-remove non-permanent after 3s
        if (!permanent) {
          setTimeout(() => get().removeNotification(id), 3000);
        }
      }),

      removeNotification: (id) => set(state => {
        state.notifications = state.notifications.filter(n => n.id !== id);
      }),

      pressKey: (key) => set(state => { state.keysDown.add(key); }),
      releaseKey: (key) => set(state => { state.keysDown.delete(key); }),
    }))
  )
);

// ─── Selectors ────────────────────────────────────────────────
export const selectActiveTokens = (state: MythicForgeStore) =>
  state.activeScene?.tokens ?? [];

export const selectSelectedActors = (state: MythicForgeStore) =>
  [...state.selectedTokenIds]
    .map(tid => state.activeScene?.tokens.find(t => t.id === tid))
    .filter(Boolean)
    .map(t => t && state.actors.get(t.actorId))
    .filter(Boolean) as Actor[];

export const selectActiveCombatant = (state: MythicForgeStore) => {
  if (!state.combat) return null;
  const alive = state.combat.combatants.filter(c => !c.defeated);
  return alive[state.combat.turn] ?? null;
};

export const selectIsMyTurn = (state: MythicForgeStore) => {
  const active = selectActiveCombatant(state);
  if (!active || !state.user) return false;
  const actor = state.actors.get(active.actorId);
  return actor?.ownership?.[state.user.id] === 3;
};

export const selectCanvasSize = (state: MythicForgeStore) => ({
  width: state.activeScene?.width ?? 4000,
  height: state.activeScene?.height ?? 3000,
});

// ─── Type helpers ─────────────────────────────────────────────
type Token = import('@mythicforge/shared').Token;
