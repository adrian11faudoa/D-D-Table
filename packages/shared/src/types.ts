// ============================================================
// @mythicforge/shared — Core type definitions
// ============================================================

// ─── Identity ────────────────────────────────────────────────
export type UUID = string & { readonly __brand: 'UUID' };
export type Timestamp = number & { readonly __brand: 'Timestamp' };

export function uuid(): UUID {
  return crypto.randomUUID() as UUID;
}

export function now(): Timestamp {
  return Date.now() as Timestamp;
}

// ─── Geometry ────────────────────────────────────────────────
export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 extends Vector2 {
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

// ─── Color ───────────────────────────────────────────────────
export type HexColor = `#${string}`;

export interface RGBA {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

// ─── Users & Sessions ────────────────────────────────────────
export type UserRole = 'gm' | 'assistant-gm' | 'player' | 'spectator';

export interface User {
  id: UUID;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  color: HexColor;
  connectedAt: Timestamp;
  isOnline: boolean;
}

export interface Session {
  id: UUID;
  name: string;
  campaignId: UUID;
  hostUserId: UUID;
  users: User[];
  createdAt: Timestamp;
  startedAt?: Timestamp;
  gameSystemId: string;
  activeSceneId?: UUID;
  settings: SessionSettings;
}

export interface SessionSettings {
  allowPlayerMacros: boolean;
  allowPlayerDrawing: boolean;
  showPlayerHpBars: boolean;
  showNpcNames: boolean;
  fogOfWarEnabled: boolean;
  dynamicLightingEnabled: boolean;
  gridEnabled: boolean;
  gridSize: number; // px per grid unit
  gridType: 'square' | 'hex-flat' | 'hex-pointy' | 'none';
  gridScale: string; // e.g. "5 ft"
  rollMode: 'publicroll' | 'gmroll' | 'blindroll' | 'selfroll';
}

// ─── Campaign ─────────────────────────────────────────────────
export interface Campaign {
  id: UUID;
  name: string;
  description: string;
  gameSystemId: string;
  gmUserId: UUID;
  players: UUID[];
  sceneIds: UUID[];
  journalIds: UUID[];
  actorIds: UUID[];
  itemIds: UUID[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  coverImageUrl?: string;
  settings: CampaignSettings;
}

export interface CampaignSettings {
  worldTime: number; // in-game seconds
  calendar?: CalendarConfig;
  experience: 'milestone' | 'xp';
}

export interface CalendarConfig {
  daysPerWeek: number;
  monthsPerYear: number;
  daysPerMonth: number[];
  weekdayNames: string[];
  monthNames: string[];
}

// ─── Scene ────────────────────────────────────────────────────
export type GridType = 'square' | 'hex-flat' | 'hex-pointy' | 'none';

export interface Scene {
  id: UUID;
  name: string;
  campaignId: UUID;
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  width: number;   // pixels
  height: number;  // pixels
  grid: GridConfig;
  tokens: Token[];
  lights: LightSource[];
  walls: Wall[];
  notes: MapNote[];
  drawings: Drawing[];
  weather?: WeatherEffect;
  ambient?: AmbientConfig;
  fogExplored: string; // base64 encoded explored regions
  globalLightLevel: number; // 0-1
  darknessLevel: number;    // 0-1
  tokenVision: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  thumbnail?: string; // base64
}

export interface GridConfig {
  type: GridType;
  size: number;       // pixels per cell
  scale: string;      // "5 ft", "10 ft" etc.
  color: HexColor;
  alpha: number;
  offsetX: number;
  offsetY: number;
  snap: boolean;
}

export interface Wall {
  id: UUID;
  points: [Vector2, Vector2];
  type: 'wall' | 'door' | 'secret-door' | 'window' | 'invisible';
  sense: 'normal' | 'limited' | 'none';
  move: 'normal' | 'none';
  sound: 'normal' | 'limited' | 'none';
  dir: 'both' | 'left' | 'right';
  ds: number; // door state: 0=closed, 1=open, 2=locked
}

export interface MapNote {
  id: UUID;
  position: Vector2;
  text: string;
  icon: string;
  fontSize: number;
  textAnchor: 'left' | 'center' | 'right';
  visible: boolean;
  gmOnly: boolean;
}

export interface Drawing {
  id: UUID;
  type: 'freehand' | 'rect' | 'ellipse' | 'polygon' | 'text';
  points: Vector2[];
  fillColor: HexColor;
  fillAlpha: number;
  strokeColor: HexColor;
  strokeWidth: number;
  strokeAlpha: number;
  text?: string;
  fontSize?: number;
  author: UUID;
  hidden: boolean;
  locked: boolean;
}

export interface WeatherEffect {
  type: 'none' | 'rain' | 'snow' | 'fog' | 'blizzard' | 'storm';
  intensity: number; // 0-1
}

export interface AmbientConfig {
  playlistId?: UUID;
  volume: number;
}

// ─── Token ────────────────────────────────────────────────────
export type TokenDisposition = 'friendly' | 'neutral' | 'hostile' | 'secret';

export interface Token {
  id: UUID;
  sceneId: UUID;
  actorId: UUID;
  name: string;
  img: string;
  x: number;
  y: number;
  width: number;   // in grid units
  height: number;
  rotation: number; // degrees
  elevation: number;
  scale: number;
  alpha: number;
  hidden: boolean;
  locked: boolean;
  disposition: TokenDisposition;
  displayName: 0 | 10 | 20 | 30 | 40 | 50; // CONST: never, hovered-by-owner, hovered-by-anyone, owned, always-for-owner, always
  displayBars: 0 | 10 | 20 | 30 | 40 | 50;
  bar1: TokenBar;
  bar2: TokenBar;
  light: TokenLightConfig;
  vision: TokenVisionConfig;
  effects: string[]; // status effect icon paths
  overlayEffect?: string;
  actorLink: boolean; // linked to actor data or independent
  actorData: Partial<ActorData>; // override data when unlinked
}

export interface TokenBar {
  attribute?: string; // dot-path to actor attribute e.g. "attributes.hp.value"
}

export interface TokenLightConfig {
  dim: number;       // radius in grid units
  bright: number;
  angle: number;     // cone angle degrees, 360 = omnidirectional
  color: HexColor;
  alpha: number;
  animation?: LightAnimation;
}

export interface LightAnimation {
  type: 'torch' | 'pulse' | 'chroma' | 'wave' | 'fog' | 'sunburst' | 'dome' | 'none';
  speed: number;
  intensity: number;
}

export interface TokenVisionConfig {
  enabled: boolean;
  range: number;     // grid units, -1 = unlimited
  angle: number;
  visionMode: 'basic' | 'darkvision' | 'tremorsense' | 'blindsight' | 'truesight';
}

// ─── Light ────────────────────────────────────────────────────
export interface LightSource {
  id: UUID;
  x: number;
  y: number;
  config: TokenLightConfig;
  hidden: boolean;
  walls: boolean; // respects walls
}

// ─── Actor ────────────────────────────────────────────────────
export type ActorType = 'character' | 'npc' | 'vehicle' | 'hazard' | 'loot';

export interface Actor {
  id: UUID;
  campaignId: UUID;
  type: ActorType;
  name: string;
  img: string;
  data: ActorData;
  items: Item[];
  effects: ActiveEffect[];
  ownership: Record<UUID, 0 | 1 | 2 | 3>; // 0=none,1=limited,2=observer,3=owner
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ActorData is system-specific — game systems extend this
export interface ActorData {
  [key: string]: unknown;
}

// ─── Item ─────────────────────────────────────────────────────
export interface Item {
  id: UUID;
  type: string;        // system-defined e.g. "weapon", "spell", "feat"
  name: string;
  img: string;
  data: ItemData;
  effects: ActiveEffect[];
}

export interface ItemData {
  [key: string]: unknown;
}

// ─── Active Effect ────────────────────────────────────────────
export interface ActiveEffect {
  id: UUID;
  label: string;
  icon: string;
  changes: EffectChange[];
  disabled: boolean;
  duration: EffectDuration;
  origin?: string; // source item/feature
  tint?: HexColor;
  transfer: boolean; // transfers to actor when item is equipped
}

export interface EffectChange {
  key: string;       // dot-path to attribute
  value: string;
  mode: 0 | 1 | 2 | 3 | 4 | 5; // custom,multiply,add,downgrade,upgrade,override
  priority?: number;
}

export interface EffectDuration {
  startTurn?: number;
  startRound?: number;
  turns?: number;
  rounds?: number;
  seconds?: number;
  label?: string;
}

// ─── Combat ───────────────────────────────────────────────────
export interface Combat {
  id: UUID;
  sceneId: UUID;
  combatants: Combatant[];
  round: number;
  turn: number;
  started: boolean;
  active: boolean;
}

export interface Combatant {
  id: UUID;
  tokenId: UUID;
  actorId: UUID;
  name: string;
  img: string;
  initiative: number | null;
  initiativeBonus: number;
  hidden: boolean;
  defeated: boolean;
  hasRolled: boolean;
}

// ─── Dice ─────────────────────────────────────────────────────
export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface DiceRoll {
  id: UUID;
  formula: string;        // e.g. "2d6+1d4+5"
  terms: RollTerm[];
  total: number;
  flavor?: string;
  rollMode: 'publicroll' | 'gmroll' | 'blindroll' | 'selfroll';
  speaker: {
    userId: UUID;
    actorId?: UUID;
    alias: string;
  };
  timestamp: Timestamp;
}

export type RollTerm =
  | { type: 'die'; faces: number; number: number; results: DieResult[] }
  | { type: 'operator'; operator: '+' | '-' | '*' | '/' }
  | { type: 'numeric'; number: number };

export interface DieResult {
  result: number;
  active: boolean;      // kept (not discarded by kh/kl)
  discarded?: boolean;
  exploded?: boolean;
  rerolled?: boolean;
  count?: boolean;      // counted for count-successes
}

// ─── Chat Message ─────────────────────────────────────────────
export type ChatMessageType = 'chat' | 'roll' | 'whisper' | 'emote' | 'system';

export interface ChatMessage {
  id: UUID;
  sessionId: UUID;
  type: ChatMessageType;
  content: string;
  speaker: {
    userId: UUID;
    actorId?: UUID;
    tokenId?: UUID;
    alias: string;
  };
  roll?: DiceRoll;
  whisperTo?: UUID[];
  timestamp: Timestamp;
  flavor?: string;
  flags: Record<string, unknown>;
}

// ─── Audio / Playlist ─────────────────────────────────────────
export interface Playlist {
  id: UUID;
  campaignId: UUID;
  name: string;
  description: string;
  sounds: PlaylistSound[];
  mode: 'sequential' | 'shuffle' | 'simultaneous';
  playing: boolean;
  volume: number;
  fade: number; // ms
}

export interface PlaylistSound {
  id: UUID;
  name: string;
  src: string;
  volume: number;
  repeat: boolean;
  playing: boolean;
  pausedTime?: number;
}

// ─── Journal ──────────────────────────────────────────────────
export interface JournalEntry {
  id: UUID;
  campaignId: UUID;
  name: string;
  content: string; // HTML
  ownership: Record<UUID, 0 | 1 | 2 | 3>;
  img?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Compendium ───────────────────────────────────────────────
export type CompendiumType = 'Actor' | 'Item' | 'Scene' | 'JournalEntry' | 'Macro' | 'Playlist' | 'RollTable';

export interface CompendiumPack {
  id: string;          // e.g. "dnd5e.monsters"
  name: string;
  label: string;
  type: CompendiumType;
  system?: string;
  path: string;
  private: boolean;
}

// ─── Macro ────────────────────────────────────────────────────
export type MacroType = 'script' | 'chat';

export interface Macro {
  id: UUID;
  campaignId: UUID;
  name: string;
  type: MacroType;
  img: string;
  scope: 'global' | 'actors';
  command: string;
  author: UUID;
  ownership: Record<UUID, 0 | 1 | 2 | 3>;
}

// ─── WebSocket Events ─────────────────────────────────────────
export type EventType =
  // Connection
  | 'connect' | 'disconnect' | 'user-join' | 'user-leave'
  // Scene
  | 'scene:create' | 'scene:update' | 'scene:delete' | 'scene:activate'
  // Token
  | 'token:create' | 'token:update' | 'token:delete' | 'token:move'
  // Combat
  | 'combat:create' | 'combat:update' | 'combat:delete'
  | 'combat:next-turn' | 'combat:prev-turn' | 'combat:initiative'
  // Chat
  | 'chat:message' | 'chat:delete'
  // Dice
  | 'dice:roll'
  // Drawing
  | 'drawing:create' | 'drawing:update' | 'drawing:delete'
  // Fog
  | 'fog:update'
  // Ping
  | 'canvas:ping'
  // Audio
  | 'playlist:update' | 'audio:play' | 'audio:stop'
  // GM
  | 'gm:hidden-roll' | 'gm:scene-transition';

export interface SocketEvent<T = unknown> {
  type: EventType;
  payload: T;
  userId: UUID;
  timestamp: Timestamp;
}

// ─── Plugin System ────────────────────────────────────────────
export interface PluginManifest {
  id: string;
  title: string;
  description: string;
  version: string;
  author: string;
  homepage?: string;
  license: string;
  compatibility: {
    minimum: string;
    verified: string;
    maximum?: string;
  };
  dependencies?: Array<{ id: string; version: string; type: 'requires' | 'recommends' }>;
  esmodules: string[];
  styles?: string[];
  languages?: LanguagePack[];
  packs?: CompendiumPack[];
  system?: string; // if this is a game system
  media?: MediaDeclaration[];
}

export interface LanguagePack {
  lang: string;
  name: string;
  path: string;
}

export interface MediaDeclaration {
  type: 'icon' | 'cover' | 'background' | 'video';
  url: string;
  loop?: boolean;
}

// ─── Game System ──────────────────────────────────────────────
export interface GameSystem {
  id: string;
  title: string;
  description: string;
  version: string;
  author: string;
  actorTypes: string[];
  itemTypes: string[];
  template: SystemTemplate;
}

export interface SystemTemplate {
  Actor: Record<string, ActorTemplate>;
  Item: Record<string, ItemTemplate>;
}

export interface ActorTemplate {
  [key: string]: unknown;
}

export interface ItemTemplate {
  [key: string]: unknown;
}

// ─── Exports ──────────────────────────────────────────────────
export * from './constants';
export * from './utils';
