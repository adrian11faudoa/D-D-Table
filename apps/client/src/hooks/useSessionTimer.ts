// ============================================================
// Utility hooks: useSessionTimer, useNetworkEvents
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../stores/useStore';

// ─── Session Timer ────────────────────────────────────────────
export function useSessionTimer(): { elapsed: number; formatted: string } {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const { sessionStartTime } = useStore();

  useEffect(() => {
    if (!sessionStartTime) return;
    startRef.current = sessionStartTime;

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStartTime]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const formatted = `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;

  return { elapsed, formatted };
}

// ─── Network Events Hook ──────────────────────────────────────
export function useNetworkEvents(): void {
  // Registered in App.tsx; this is a placeholder for
  // components that need direct network event access
}

// ─── FPS Counter ──────────────────────────────────────────────
export function useFPS(): number {
  const [fps, setFPS] = useState(60);
  const frames = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    let animId: number;
    const tick = () => {
      frames.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setFPS(frames.current);
        frames.current = 0;
        lastTime.current = now;
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  return fps;
}

// ─── Ping Monitor ─────────────────────────────────────────────
export function usePingMonitor(): number {
  const { ping } = useStore();
  return ping;
}

// ─── Drag & Drop ──────────────────────────────────────────────
export function useDraggable<T>(
  data: T,
  options: { onDragStart?: () => void; onDragEnd?: () => void } = {}
) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('application/json', JSON.stringify(data));
      e.dataTransfer.effectAllowed = 'copy';
      options.onDragStart?.();
    },
    onDragEnd: () => options.onDragEnd?.(),
  };
}

export function useDropTarget<T>(
  onDrop: (data: T) => void,
  options: { accepts?: string[] } = {}
) {
  return {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const raw = e.dataTransfer.getData('application/json');
        const data = JSON.parse(raw) as T;
        onDrop(data);
      } catch { /* ignore */ }
    },
  };
}
