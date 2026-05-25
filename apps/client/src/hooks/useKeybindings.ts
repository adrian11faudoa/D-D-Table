// ============================================================
// useKeybindings — Global keyboard shortcut system
// ============================================================

import { useEffect, useCallback, useRef } from 'react';

type Modifier = 'ctrl' | 'shift' | 'alt' | 'meta';
type KeyCombo = string; // e.g. "ctrl+n", "shift+d", "escape", "f5"

interface KeybindingMap {
  [combo: KeyCombo]: (event: KeyboardEvent) => void;
}

function parseCombo(combo: KeyCombo): { key: string; mods: Set<Modifier> } {
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1] ?? '';
  const mods = new Set<Modifier>(parts.slice(0, -1) as Modifier[]);
  return { key, mods };
}

function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const { key, mods } = parseCombo(combo);

  const evKey = event.key.toLowerCase();
  const evMods: Set<Modifier> = new Set();
  if (event.ctrlKey || event.metaKey) evMods.add('ctrl');
  if (event.shiftKey) evMods.add('shift');
  if (event.altKey) evMods.add('alt');

  if (evKey !== key) return false;
  if (mods.size !== evMods.size) return false;
  for (const mod of mods) {
    if (!evMods.has(mod)) return false;
  }
  return true;
}

export function useKeybindings(
  bindings: KeybindingMap,
  options: {
    enabled?: boolean;
    preventDefault?: boolean;
    target?: HTMLElement | Window;
  } = {}
): void {
  const { enabled = true, preventDefault = true, target = window } = options;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const handleKeyDown = useCallback((event: Event) => {
    const e = event as KeyboardEvent;

    // Skip if typing in an input
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // Only allow Escape from inputs
      if (e.key !== 'Escape') return;
    }

    for (const [combo, handler] of Object.entries(bindingsRef.current)) {
      if (matchesCombo(e, combo)) {
        if (preventDefault) e.preventDefault();
        handler(e);
        return;
      }
    }
  }, [preventDefault]);

  useEffect(() => {
    if (!enabled) return;
    const el = target as EventTarget;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [enabled, target, handleKeyDown]);
}

// ─── Key Press State ──────────────────────────────────────────
export function useKeyDown(key: string): boolean {
  const pressed = useRef(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === key) pressed.current = true; };
    const onUp = (e: KeyboardEvent) => { if (e.key === key) pressed.current = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [key]);

  return pressed.current;
}

// ─── Hotbar Keybindings (1–0) ─────────────────────────────────
export function useHotbarKeys(onPress: (slot: number) => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const n = parseInt(e.key);
      if (n >= 1 && n <= 9) onPress(n);
      if (e.key === '0') onPress(10);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPress]);
}
