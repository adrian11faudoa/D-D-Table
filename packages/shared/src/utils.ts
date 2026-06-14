// ============================================================
// @mythicforge/shared — Utility functions
// ============================================================

import type { UUID, Timestamp, HexColor, RGBA, Vector2 } from './types';

// ─── Identity ────────────────────────────────────────────────
export function uuid(): UUID {
  return crypto.randomUUID() as UUID;
}

export function now(): Timestamp {
  return Date.now() as Timestamp;
}

// ─── Color utilities ──────────────────────────────────────────
export function hexToRGBA(hex: HexColor, alpha = 1): RGBA {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return { r, g, b, a: alpha };
}

export function rgbaToHex({ r, g, b }: RGBA): HexColor {
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}` as HexColor;
}

export function rgbaToCSSString({ r, g, b, a }: RGBA): string {
  return `rgba(${r},${g},${b},${a})`;
}

export function lerpColor(a: HexColor, b: HexColor, t: number): HexColor {
  const ca = hexToRGBA(a);
  const cb = hexToRGBA(b);
  return rgbaToHex({
    r: Math.round(ca.r + (cb.r - ca.r) * t),
    g: Math.round(ca.g + (cb.g - ca.g) * t),
    b: Math.round(ca.b + (cb.b - ca.b) * t),
    a: 1,
  });
}

// ─── Math / Geometry ──────────────────────────────────────────
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angleBetween(a: Vector2, b: Vector2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapVector(v: Vector2, gridSize: number): Vector2 {
  return { x: snapToGrid(v.x, gridSize), y: snapToGrid(v.y, gridSize) };
}

export function gridDistance(a: Vector2, b: Vector2, gridSize: number, useDiagonal = true): number {
  const dx = Math.abs(b.x - a.x) / gridSize;
  const dy = Math.abs(b.y - a.y) / gridSize;
  if (useDiagonal) {
    // 5-10-5 diagonal rule (D&D 5e)
    const diag = Math.min(dx, dy);
    const straight = Math.abs(dx - dy);
    return straight + diag;
  }
  return dx + dy; // Manhattan
}

export function pointInCircle(point: Vector2, center: Vector2, radius: number): boolean {
  return distance(point, center) <= radius;
}

export function pointInRect(point: Vector2, x: number, y: number, w: number, h: number): boolean {
  return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
}

// ─── String utilities ─────────────────────────────────────────
export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncate(str: string, max: number, suffix = '…'): string {
  return str.length <= max ? str : str.slice(0, max - suffix.length) + suffix;
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

// ─── Object utilities ─────────────────────────────────────────
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sv = source[key];
    const tv = result[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) &&
        tv && typeof tv === 'object' && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>) as T[keyof T];
    } else if (sv !== undefined) {
      result[key] = sv as T[keyof T];
    }
  }
  return result;
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
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

// ─── Array utilities ──────────────────────────────────────────
export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k]!.push(item);
    return acc;
  }, {});
}

export function sortBy<T>(arr: T[], key: (item: T) => number | string, dir: 'asc' | 'desc' = 'asc'): T[] {
  return [...arr].sort((a, b) => {
    const va = key(a), vb = key(b);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function unique<T>(arr: T[], key?: (item: T) => unknown): T[] {
  if (!key) return [...new Set(arr)];
  const seen = new Set();
  return arr.filter(item => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── Async utilities ──────────────────────────────────────────
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Validation ───────────────────────────────────────────────
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export function isValidHexColor(str: string): str is HexColor {
  return /^#[0-9a-fA-F]{3,8}$/.test(str);
}

export function isValidFormula(formula: string): boolean {
  return /\d*d\d+/i.test(formula);
}
