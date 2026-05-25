// ============================================================
// LightingSystem — Ray-casting dynamic lighting & fog of war
// Uses polygon visibility algorithm (shadow casting)
// ============================================================

import type { LightSource, Wall, Scene, Token, Vector2 } from '@mythicforge/shared';

// ─── Types ───────────────────────────────────────────────────
export interface LightPolygon {
  points: Vector2[];
  sourceId: string;
  color: string;
  alpha: number;
  radius: number;
}

export interface VisibilityResult {
  visiblePolygon: Vector2[];
  lightPolygons: LightPolygon[];
  exploredRegions: ExploredRegion[];
}

export interface ExploredRegion {
  x: number;
  y: number;
  radius: number;
}

// ─── Ray ─────────────────────────────────────────────────────
interface Ray {
  origin: Vector2;
  direction: Vector2;
  angle: number;
}

interface Intersection {
  point: Vector2;
  distance: number;
  wall?: Wall;
}

// ─── Segment Intersection ────────────────────────────────────
function segmentsIntersect(
  a1: Vector2, a2: Vector2,
  b1: Vector2, b2: Vector2
): Vector2 | null {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null; // parallel

  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: a1.x + t * dx1,
      y: a1.y + t * dy1,
    };
  }

  return null;
}

// ─── Cast Ray ─────────────────────────────────────────────────
function castRay(
  origin: Vector2,
  angle: number,
  walls: Wall[],
  maxDistance: number
): Intersection {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const rayEnd: Vector2 = {
    x: origin.x + dx * maxDistance,
    y: origin.y + dy * maxDistance,
  };

  let closestDist = maxDistance;
  let closestPoint: Vector2 = rayEnd;
  let closestWall: Wall | undefined;

  for (const wall of walls) {
    if (wall.sense === 'none') continue;

    const p1 = wall.points[0];
    const p2 = wall.points[1];

    const intersection = segmentsIntersect(origin, rayEnd, p1, p2);
    if (intersection) {
      const dist = Math.hypot(intersection.x - origin.x, intersection.y - origin.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestPoint = intersection;
        closestWall = wall;
      }
    }
  }

  return {
    point: closestPoint,
    distance: closestDist,
    wall: closestWall,
  };
}

// ─── Compute Visibility Polygon ───────────────────────────────
export function computeVisibilityPolygon(
  origin: Vector2,
  walls: Wall[],
  radius: number,
  angle = 360,
  direction = 0
): Vector2[] {
  const startAngle = direction - angle / 2;
  const endAngle = direction + angle / 2;

  // Collect all unique angles to walls + slight offsets for soft edges
  const angles: number[] = [];

  // Boundary angles based on view angle
  if (angle >= 360) {
    // Full 360 vision: sample every few degrees + wall endpoints
    for (let a = 0; a < 360; a += 1) {
      angles.push((a * Math.PI) / 180);
    }
  } else {
    // Cone vision
    const start = (startAngle * Math.PI) / 180;
    const end = (endAngle * Math.PI) / 180;
    for (let a = start; a <= end; a += Math.PI / 180) {
      angles.push(a);
    }
    angles.push(start, end);
  }

  // Add angles to each wall endpoint
  for (const wall of walls) {
    if (wall.sense === 'none') continue;
    for (const point of wall.points) {
      const a = Math.atan2(point.y - origin.y, point.x - origin.x);
      angles.push(a - 0.0001, a, a + 0.0001);
    }
  }

  // Cast rays at each angle
  const intersections: Array<{ angle: number; point: Vector2 }> = [];

  for (const a of angles) {
    // Skip if outside view cone
    if (angle < 360) {
      const normalizedAngle = ((a * 180) / Math.PI + 360) % 360;
      const normalizedStart = (startAngle + 360) % 360;
      const normalizedEnd = (endAngle + 360) % 360;
      if (normalizedStart <= normalizedEnd) {
        if (normalizedAngle < normalizedStart || normalizedAngle > normalizedEnd) continue;
      } else {
        if (normalizedAngle < normalizedStart && normalizedAngle > normalizedEnd) continue;
      }
    }

    const hit = castRay(origin, a, walls, radius);
    intersections.push({ angle: a, point: hit.point });
  }

  // Sort by angle
  intersections.sort((a, b) => a.angle - b.angle);

  return intersections.map(i => i.point);
}

// ─── Light Animation ──────────────────────────────────────────
export function animateLightRadius(
  type: string,
  baseRadius: number,
  time: number,
  speed = 1,
  intensity = 1
): number {
  const t = time * speed * 0.001;

  switch (type) {
    case 'torch': {
      // Flickering torch — multiple sine waves for organic feel
      const flicker =
        Math.sin(t * 7.3) * 0.05 +
        Math.sin(t * 13.7) * 0.03 +
        Math.sin(t * 23.1) * 0.02;
      return baseRadius * (1 + flicker * intensity);
    }
    case 'pulse': {
      const pulse = (Math.sin(t * 2) + 1) / 2;
      return baseRadius * (0.85 + pulse * 0.15 * intensity);
    }
    case 'wave': {
      const wave = Math.sin(t * 3) * Math.cos(t * 2.1);
      return baseRadius * (1 + wave * 0.1 * intensity);
    }
    case 'chroma': {
      // Radius stays stable, color shifts (handled separately)
      return baseRadius;
    }
    case 'fog': {
      // Slow rolling fog-like pulsing
      return baseRadius * (0.9 + Math.sin(t * 0.8) * 0.1 * intensity);
    }
    case 'sunburst': {
      // Sharp pulse
      const sb = Math.pow(Math.sin(t * 1.5), 4);
      return baseRadius * (1 + sb * 0.25 * intensity);
    }
    default:
      return baseRadius;
  }
}

export function animateLightColor(
  type: string,
  baseColor: string,
  time: number,
  speed = 1
): string {
  if (type !== 'chroma') return baseColor;

  const t = time * speed * 0.001;
  const hue = (t * 60) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

// ─── Lighting Renderer ────────────────────────────────────────
export class LightingRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private animationId: number | null = null;
  private startTime = Date.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  renderFrame(
    scene: Scene,
    playerTokens: Token[],
    isGM: boolean,
    viewX: number,
    viewY: number,
    scale: number
  ): void {
    const { ctx } = this;
    const t = Date.now() - this.startTime;

    ctx.clearRect(0, 0, this.width, this.height);

    if (!scene.tokenVision && scene.globalLightLevel >= 1) return;

    ctx.save();
    ctx.translate(viewX, viewY);
    ctx.scale(scale, scale);

    // Draw darkness base layer
    const darkness = scene.darknessLevel;
    ctx.fillStyle = `rgba(0, 0, 0, ${darkness})`;
    ctx.fillRect(-viewX / scale, -viewY / scale, this.width / scale, this.height / scale);

    // Global ambient light
    if (scene.globalLightLevel > 0) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(255, 255, 255, ${scene.globalLightLevel})`;
      ctx.fillRect(-viewX / scale, -viewY / scale, this.width / scale, this.height / scale);
    }

    // Draw each light source
    for (const light of scene.lights) {
      if (light.hidden && !isGM) continue;

      const animRadius = animateLightRadius(
        light.config.animation?.type ?? 'none',
        light.config.bright * scene.grid.size,
        t,
        light.config.animation?.speed,
        light.config.animation?.intensity
      );

      const dimRadius = (light.config.dim / light.config.bright) * animRadius;

      const color = animateLightColor(
        light.config.animation?.type ?? 'none',
        light.config.color,
        t,
        light.config.animation?.speed
      );

      let lightPoly: Vector2[];

      if (light.walls && scene.walls.length > 0) {
        lightPoly = computeVisibilityPolygon(
          { x: light.x, y: light.y },
          scene.walls,
          animRadius,
          light.config.angle,
          0
        );
      } else {
        // Circular light, no wall occlusion
        lightPoly = Array.from({ length: 64 }, (_, i) => {
          const a = (i / 64) * Math.PI * 2;
          return {
            x: light.x + Math.cos(a) * animRadius,
            y: light.y + Math.sin(a) * animRadius,
          };
        });
      }

      if (lightPoly.length < 3) continue;

      // Bright zone gradient
      const brightGradient = ctx.createRadialGradient(
        light.x, light.y, 0,
        light.x, light.y, animRadius
      );

      const r = parseInt(color.slice(1, 3), 16) || 255;
      const g = parseInt(color.slice(3, 5), 16) || 200;
      const b = parseInt(color.slice(5, 7), 16) || 80;

      brightGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${light.config.alpha})`);
      brightGradient.addColorStop(light.config.bright / light.config.dim || 0.5, `rgba(${r}, ${g}, ${b}, ${light.config.alpha * 0.6})`);
      brightGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = brightGradient;

      ctx.beginPath();
      ctx.moveTo(lightPoly[0]!.x, lightPoly[0]!.y);
      for (let i = 1; i < lightPoly.length; i++) {
        ctx.lineTo(lightPoly[i]!.x, lightPoly[i]!.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Token vision
    if (scene.tokenVision) {
      for (const token of playerTokens) {
        if (!token.vision.enabled) continue;

        const visionRadius = token.vision.range > 0
          ? token.vision.range * scene.grid.size
          : Math.max(this.width, this.height) / scale;

        const cx = token.x + (token.width * scene.grid.size) / 2;
        const cy = token.y + (token.height * scene.grid.size) / 2;

        let visionPoly: Vector2[];

        if (scene.walls.length > 0) {
          visionPoly = computeVisibilityPolygon(
            { x: cx, y: cy },
            scene.walls,
            visionRadius,
            token.vision.angle,
            0
          );
        } else {
          visionPoly = Array.from({ length: 64 }, (_, i) => {
            const a = (i / 64) * Math.PI * 2;
            return {
              x: cx + Math.cos(a) * visionRadius,
              y: cy + Math.sin(a) * visionRadius,
            };
          });
        }

        if (visionPoly.length < 3) continue;

        // Apply darkvision tint
        const isDarkvision = token.vision.visionMode === 'darkvision';
        ctx.globalCompositeOperation = isDarkvision ? 'destination-out' : 'destination-out';

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, visionRadius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(visionPoly[0]!.x, visionPoly[0]!.y);
        for (let i = 1; i < visionPoly.length; i++) {
          ctx.lineTo(visionPoly[i]!.x, visionPoly[i]!.y);
        }
        ctx.closePath();
        ctx.fill();

        // Darkvision gets a subtle blue-gray overlay to indicate limited color
        if (isDarkvision) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(30, 40, 80, 0.15)';
          ctx.beginPath();
          ctx.moveTo(visionPoly[0]!.x, visionPoly[0]!.y);
          for (let i = 1; i < visionPoly.length; i++) {
            ctx.lineTo(visionPoly[i]!.x, visionPoly[i]!.y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  startAnimation(
    getScene: () => Scene | null,
    getTokens: () => Token[],
    isGM: boolean,
    getViewport: () => { x: number; y: number; scale: number }
  ): void {
    const frame = () => {
      const scene = getScene();
      if (scene) {
        const vp = getViewport();
        this.renderFrame(scene, getTokens(), isGM, vp.x, vp.y, vp.scale);
      }
      this.animationId = requestAnimationFrame(frame);
    };
    this.animationId = requestAnimationFrame(frame);
  }

  stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  destroy(): void {
    this.stopAnimation();
  }
}

// ─── Fog of War Persistence ───────────────────────────────────
export class FogOfWar {
  private exploredCanvas: HTMLCanvasElement;
  private exploredCtx: CanvasRenderingContext2D;
  private dirty = false;

  constructor(width: number, height: number) {
    this.exploredCanvas = document.createElement('canvas');
    this.exploredCanvas.width = width;
    this.exploredCanvas.height = height;
    this.exploredCtx = this.exploredCanvas.getContext('2d')!;
  }

  explore(x: number, y: number, radius: number): void {
    this.exploredCtx.globalCompositeOperation = 'source-over';

    const gradient = this.exploredCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    this.exploredCtx.fillStyle = gradient;
    this.exploredCtx.beginPath();
    this.exploredCtx.arc(x, y, radius, 0, Math.PI * 2);
    this.exploredCtx.fill();

    this.dirty = true;
  }

  getExploredData(): string {
    return this.exploredCanvas.toDataURL();
  }

  loadExploredData(dataUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.exploredCtx.clearRect(0, 0, this.exploredCanvas.width, this.exploredCanvas.height);
        this.exploredCtx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  reset(): void {
    this.exploredCtx.clearRect(0, 0, this.exploredCanvas.width, this.exploredCanvas.height);
    this.dirty = true;
  }

  get isDirty(): boolean { return this.dirty; }
  clearDirty(): void { this.dirty = false; }

  get canvas(): HTMLCanvasElement { return this.exploredCanvas; }
}

// ─── Wall Utilities ───────────────────────────────────────────
export function getWallsNear(walls: Wall[], x: number, y: number, radius: number): Wall[] {
  const radiusSq = radius * radius;
  return walls.filter(wall => {
    const midX = (wall.points[0].x + wall.points[1].x) / 2;
    const midY = (wall.points[0].y + wall.points[1].y) / 2;
    return (midX - x) ** 2 + (midY - y) ** 2 <= radiusSq;
  });
}

export function wallBlocksSight(wall: Wall): boolean {
  return wall.sense === 'normal' || wall.sense === 'limited';
}

export function wallBlocksMovement(wall: Wall): boolean {
  return wall.move === 'normal';
}

export function wallBlocksSound(wall: Wall): boolean {
  return wall.sound === 'normal' || wall.sound === 'limited';
}

export function testWallCollision(
  origin: Vector2,
  destination: Vector2,
  walls: Wall[]
): Wall | null {
  for (const wall of walls) {
    if (!wallBlocksMovement(wall)) continue;
    const intersection = segmentsIntersect(
      origin, destination,
      wall.points[0], wall.points[1]
    );
    if (intersection) return wall;
  }
  return null;
}
