// ============================================================
// MapCanvas — PixiJS-based rendering engine for MythicForge
// Handles: Map layers, tokens, fog of war, lighting, grid
// ============================================================

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { Scene, Token, LightSource, Wall, Vector2 } from '@mythicforge/shared';
import { ZOOM_MIN, ZOOM_MAX } from '@mythicforge/shared';

// ─── Types ───────────────────────────────────────────────────
export interface CanvasProps {
  scene: Scene | null;
  userId: string;
  isGM: boolean;
  tool: CanvasTool;
  onTokenSelect?: (tokenId: string | null) => void;
  onTokenMove?: (tokenId: string, x: number, y: number) => void;
  onPing?: (x: number, y: number) => void;
  onFogUpdate?: (data: string) => void;
  className?: string;
}

export type CanvasTool =
  | 'select' | 'token' | 'measure' | 'draw' | 'fog' | 'light' | 'wall' | 'note';

interface DragState {
  active: boolean;
  target: 'canvas' | 'token';
  tokenId?: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

interface MeasureState {
  active: boolean;
  startGrid: Vector2 | null;
  endGrid: Vector2 | null;
}

// ─── Layer Management ────────────────────────────────────────
class CanvasLayers {
  background!: PIXI.Container;
  grid!: PIXI.Graphics;
  drawings!: PIXI.Container;
  tokens!: PIXI.Container;
  lighting!: PIXI.Container;
  fog!: PIXI.Graphics;
  interface!: PIXI.Container;
  measurement!: PIXI.Graphics;
  pings!: PIXI.Container;

  static create(app: PIXI.Application): CanvasLayers {
    const l = new CanvasLayers();
    l.background = app.stage.addChild(new PIXI.Container());
    l.grid = app.stage.addChild(new PIXI.Graphics());
    l.drawings = app.stage.addChild(new PIXI.Container());
    l.tokens = app.stage.addChild(new PIXI.Container());
    l.lighting = app.stage.addChild(new PIXI.Container());
    l.fog = app.stage.addChild(new PIXI.Graphics());
    l.interface = app.stage.addChild(new PIXI.Container());
    l.measurement = l.interface.addChild(new PIXI.Graphics());
    l.pings = l.interface.addChild(new PIXI.Container());
    return l;
  }
}

// ─── Grid Renderer ───────────────────────────────────────────
function drawGrid(
  graphics: PIXI.Graphics,
  scene: Scene,
  viewport: { x: number; y: number; scale: number },
  canvasWidth: number,
  canvasHeight: number
): void {
  graphics.clear();
  const { type, size, color, alpha } = scene.grid;
  if (type === 'none' || alpha === 0) return;

  const gridColor = parseInt(color.replace('#', ''), 16);
  graphics.lineStyle(0.5, gridColor, alpha);

  const offsetX = (viewport.x % size + size) % size;
  const offsetY = (viewport.y % size + size) % size;

  if (type === 'square') {
    // Vertical lines
    for (let x = offsetX - size; x < canvasWidth + size; x += size) {
      graphics.moveTo(x, 0);
      graphics.lineTo(x, canvasHeight);
    }
    // Horizontal lines
    for (let y = offsetY - size; y < canvasHeight + size; y += size) {
      graphics.moveTo(0, y);
      graphics.lineTo(canvasWidth, y);
    }
  } else if (type === 'hex-flat') {
    drawHexGrid(graphics, size, offsetX, offsetY, canvasWidth, canvasHeight, true);
  } else if (type === 'hex-pointy') {
    drawHexGrid(graphics, size, offsetX, offsetY, canvasWidth, canvasHeight, false);
  }
}

function drawHexGrid(
  g: PIXI.Graphics,
  size: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  flat: boolean
): void {
  const w = flat ? size : size * Math.sqrt(3);
  const h = flat ? size * Math.sqrt(3) : size;
  const colWidth = flat ? size * 1.5 : w;
  const rowHeight = flat ? h : size * 1.5;

  for (let col = -1; col < width / colWidth + 1; col++) {
    for (let row = -1; row < height / rowHeight + 1; row++) {
      const cx = col * colWidth + offsetX + (flat ? 0 : row % 2 === 0 ? 0 : w / 2);
      const cy = row * rowHeight + offsetY + (flat ? col % 2 === 0 ? 0 : h / 2 : 0);

      g.moveTo(cx + (flat ? size : 0), cy);
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + (flat ? 0 : Math.PI / 6);
        g.lineTo(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
      }
    }
  }
}

// ─── Fog of War Renderer ──────────────────────────────────────
function renderFog(
  graphics: PIXI.Graphics,
  scene: Scene,
  tokens: Token[],
  isGM: boolean,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!scene.tokenVision && !isGM) return;

  graphics.clear();

  // Draw full fog mask
  graphics.beginFill(0x000000, isGM ? 0.4 : 0.95);
  graphics.drawRect(0, 0, canvasWidth, canvasHeight);
  graphics.endFill();

  if (tokens.length === 0) return;

  // Cut out revealed areas using blendMode
  graphics.blendMode = PIXI.BLEND_MODES.ERASE;

  for (const token of tokens) {
    const { x, y } = token;
    const visionRange = token.vision.range > 0
      ? token.vision.range * scene.grid.size
      : Math.max(canvasWidth, canvasHeight);

    // Soft-edge gradient reveal
    for (let r = visionRange; r > 0; r -= visionRange / 16) {
      const alpha = 1 - (r / visionRange) * 0.3;
      graphics.beginFill(0xffffff, alpha);
      graphics.drawCircle(x + token.width * scene.grid.size / 2, y + token.height * scene.grid.size / 2, r);
      graphics.endFill();
    }
  }

  graphics.blendMode = PIXI.BLEND_MODES.NORMAL;
}

// ─── Token Renderer ───────────────────────────────────────────
function createTokenSprite(
  token: Token,
  scene: Scene,
  isSelected: boolean,
  isActiveTurn: boolean
): PIXI.Container {
  const container = new PIXI.Container();
  const cellSize = scene.grid.size;
  const w = token.width * cellSize;
  const h = token.height * cellSize;

  container.x = token.x;
  container.y = token.y;
  container.eventMode = 'static';
  container.cursor = 'pointer';

  // Selection ring
  const ring = new PIXI.Graphics();
  if (isSelected) {
    ring.lineStyle(3, 0xc9a84c, 1);
    ring.drawCircle(w / 2, h / 2, w / 2 + 4);
  } else if (isActiveTurn) {
    ring.lineStyle(3, 0xffd700, 0.8);
    ring.drawCircle(w / 2, h / 2, w / 2 + 4);
  }
  container.addChild(ring);

  // Token background
  const bg = new PIXI.Graphics();
  bg.beginFill(0x1a1d28, 1);
  bg.drawCircle(w / 2, h / 2, w / 2);
  bg.endFill();
  bg.lineStyle(2, parseInt(token.disposition === 'friendly' ? '1a8f7f' : token.disposition === 'hostile' ? '8b2635' : '888', 16), 1);
  bg.drawCircle(w / 2, h / 2, w / 2);
  container.addChild(bg);

  // Token image (if URL) or emoji placeholder
  if (token.img && !token.img.startsWith('icons/')) {
    const texture = PIXI.Texture.from(token.img);
    const sprite = new PIXI.Sprite(texture);
    sprite.width = w;
    sprite.height = h;
    sprite.anchor.set(0.5);
    sprite.x = w / 2;
    sprite.y = h / 2;
    // Circular clip
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawCircle(w / 2, h / 2, w / 2 - 2);
    mask.endFill();
    container.addChild(mask);
    sprite.mask = mask;
    container.addChild(sprite);
  }

  // HP Bar (bar1)
  if (token.displayBars >= 20) {
    const barWidth = w;
    const barHeight = 4;
    const barY = h + 2;

    const barBg = new PIXI.Graphics();
    barBg.beginFill(0x000000, 0.8);
    barBg.drawRoundedRect(0, barY, barWidth, barHeight, 2);
    barBg.endFill();
    container.addChild(barBg);

    // Compute HP percentage from actor data if linked
    const hpPct = 0.75; // placeholder — real implementation reads actor data
    const hpColor = hpPct > 0.5 ? 0x4aad78 : hpPct > 0.25 ? 0xe09040 : 0xe04040;
    const barFill = new PIXI.Graphics();
    barFill.beginFill(hpColor, 1);
    barFill.drawRoundedRect(0, barY, barWidth * hpPct, barHeight, 2);
    barFill.endFill();
    container.addChild(barFill);
  }

  // Name
  if (token.displayName >= 20) {
    const nameText = new PIXI.Text(token.name, {
      fontFamily: 'Cinzel, serif',
      fontSize: 10,
      fill: 0xc8cce0,
      align: 'center',
    });
    nameText.anchor.set(0.5, 0);
    nameText.x = w / 2;
    nameText.y = h + 8;
    container.addChild(nameText);
  }

  // Status effects
  token.effects.forEach((icon, i) => {
    const effectSprite = PIXI.Sprite.from(icon);
    effectSprite.width = 12;
    effectSprite.height = 12;
    effectSprite.x = i * 14;
    effectSprite.y = h - 14;
    container.addChild(effectSprite);
  });

  container.name = `token-${token.id}`;
  return container;
}

// ─── Ping Effect ──────────────────────────────────────────────
function createPing(x: number, y: number, color = 0xc9a84c): PIXI.Container {
  const container = new PIXI.Container();
  container.x = x;
  container.y = y;

  let frame = 0;
  const maxFrame = 60;

  const graphics = new PIXI.Graphics();
  container.addChild(graphics);

  const ticker = new PIXI.Ticker();
  ticker.add(() => {
    frame++;
    const progress = frame / maxFrame;
    const radius = progress * 60;
    const alpha = 1 - progress;

    graphics.clear();
    graphics.lineStyle(3, color, alpha);
    graphics.drawCircle(0, 0, radius);

    if (frame >= maxFrame) {
      ticker.destroy();
      container.destroy();
    }
  });
  ticker.start();

  return container;
}

// ─── Main Canvas Component ────────────────────────────────────
export const MapCanvas: React.FC<CanvasProps> = ({
  scene,
  userId,
  isGM,
  tool,
  onTokenSelect,
  onTokenMove,
  onPing,
  onFogUpdate,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const layersRef = useRef<CanvasLayers | null>(null);
  const viewportRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<DragState>({ active: false, target: 'canvas', startX: 0, startY: 0, lastX: 0, lastY: 0 });
  const measureRef = useRef<MeasureState>({ active: false, startGrid: null, endGrid: null });
  const [zoom, setZoom] = useState(1);

  // ── Initialize PIXI ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new PIXI.Application({
      resizeTo: containerRef.current,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    containerRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;
    layersRef.current = CanvasLayers.create(app);

    // Setup stage interactivity
    app.stage.eventMode = 'static';
    app.stage.hitArea = new PIXI.Rectangle(0, 0, app.screen.width, app.screen.height);

    return () => {
      app.destroy(true);
      appRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // ── Render Scene ─────────────────────────────────────────────
  useEffect(() => {
    if (!scene || !appRef.current || !layersRef.current) return;

    const app = appRef.current;
    const layers = layersRef.current;
    const viewport = viewportRef.current;

    // Background
    layers.background.removeChildren();
    if (scene.backgroundImageUrl) {
      const bg = PIXI.Sprite.from(scene.backgroundImageUrl);
      bg.width = scene.width;
      bg.height = scene.height;
      layers.background.addChild(bg);
    }

    // Grid
    drawGrid(layers.grid, scene, viewport, app.screen.width, app.screen.height);

    // Tokens
    layers.tokens.removeChildren();
    for (const token of scene.tokens) {
      if (token.hidden && !isGM) continue;
      const sprite = createTokenSprite(token, scene, false, false);
      sprite.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        onTokenSelect?.(token.id);
        handleTokenDragStart(token, e);
      });
      layers.tokens.addChild(sprite);
    }

    // Fog
    renderFog(layers.fog, scene, scene.tokens.filter(t => !t.hidden || isGM), isGM, app.screen.width, app.screen.height);

  }, [scene, isGM, onTokenSelect]);

  // ── Token Drag ───────────────────────────────────────────────
  const handleTokenDragStart = useCallback((token: Token, e: PIXI.FederatedPointerEvent) => {
    if (tool !== 'select') return;
    dragRef.current = {
      active: true,
      target: 'token',
      tokenId: token.id,
      startX: e.globalX,
      startY: e.globalY,
      lastX: e.globalX,
      lastY: e.globalY,
    };
  }, [tool]);

  // ── Mouse Wheel Zoom ─────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewportRef.current.scale * delta));
    viewportRef.current.scale = newScale;
    setZoom(Math.round(newScale * 100));

    if (appRef.current) {
      appRef.current.stage.scale.set(newScale);
    }
  }, []);

  // ── Pointer Events ───────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (dragRef.current.active) return;
    dragRef.current = {
      active: true,
      target: 'canvas',
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    if (drag.target === 'canvas') {
      viewportRef.current.x += dx;
      viewportRef.current.y += dy;
      if (appRef.current) {
        appRef.current.stage.x = viewportRef.current.x;
        appRef.current.stage.y = viewportRef.current.y;
      }
    } else if (drag.target === 'token' && drag.tokenId && layersRef.current) {
      const tokenSprite = layersRef.current.tokens.getChildByName(`token-${drag.tokenId}`);
      if (tokenSprite) {
        tokenSprite.x += dx / viewportRef.current.scale;
        tokenSprite.y += dy / viewportRef.current.scale;
      }
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    if (drag.target === 'token' && drag.tokenId && layersRef.current) {
      const tokenSprite = layersRef.current.tokens.getChildByName(`token-${drag.tokenId}`);
      if (tokenSprite) {
        // Snap to grid
        const gridSize = scene?.grid.size ?? 100;
        const snappedX = Math.round(tokenSprite.x / gridSize) * gridSize;
        const snappedY = Math.round(tokenSprite.y / gridSize) * gridSize;
        tokenSprite.x = snappedX;
        tokenSprite.y = snappedY;
        onTokenMove?.(drag.tokenId, snappedX, snappedY);
      }
    }

    dragRef.current = { active: false, target: 'canvas', startX: 0, startY: 0, lastX: 0, lastY: 0 };
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, [scene, onTokenMove]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!appRef.current || !layersRef.current || !scene) return;

    const rect = containerRef.current!.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - viewportRef.current.x) / viewportRef.current.scale;
    const worldY = (e.clientY - rect.top - viewportRef.current.y) / viewportRef.current.scale;

    switch (tool) {
      case 'select':
        onTokenSelect?.(null);
        break;
      case 'measure': {
        const gx = Math.floor(worldX / scene.grid.size);
        const gy = Math.floor(worldY / scene.grid.size);
        if (!measureRef.current.startGrid) {
          measureRef.current.startGrid = { x: gx, y: gy };
        } else {
          measureRef.current.endGrid = { x: gx, y: gy };
          measureRef.current.startGrid = null;
          layersRef.current.measurement.clear();
        }
        break;
      }
      default:
        onPing?.(worldX, worldY);
        if (layersRef.current) {
          const ping = createPing(worldX, worldY);
          layersRef.current.pings.addChild(ping);
        }
    }
  }, [tool, scene, onTokenSelect, onPing]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      {/* Zoom indicator */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(15,17,23,0.7)', border: '1px solid #2a2f45',
        color: '#555e78', fontSize: 11, padding: '3px 10px', borderRadius: 12,
        fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none', zIndex: 20,
      }}>
        {zoom}%
      </div>
    </div>
  );
};

export default MapCanvas;
