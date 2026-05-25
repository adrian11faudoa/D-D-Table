// ============================================================
// Dice So Nice — MythicForge Plugin
// 3D animated dice rolling using Three.js physics
// ============================================================

import type { PluginManifest } from '@mythicforge/shared';
import { MythicForgePlugin, HOOKS, Hooks } from '@mythicforge/plugin-api';
import type { DiceRoll, RollTerm } from '@mythicforge/shared';
import * as THREE from 'three';

// ─── Config ──────────────────────────────────────────────────
interface DiceSoNiceConfig {
  enabled: boolean;
  theme: 'standard' | 'gemstone' | 'metal' | 'custom';
  colorset: string;
  labelColor: string;
  diceColor: string;
  outlineColor: string;
  speed: 1 | 2 | 3;    // slow | normal | fast
  shadows: boolean;
  sounds: boolean;
  soundVolume: number;
  hideAfterRoll: boolean;
  immersiveMode: boolean;
  animateOnGMroll: boolean;
  throwForce: number;
}

const DEFAULT_CONFIG: DiceSoNiceConfig = {
  enabled: true,
  theme: 'standard',
  colorset: 'default',
  labelColor: '#ffffff',
  diceColor: '#1a1d28',
  outlineColor: '#c9a84c',
  speed: 2,
  shadows: true,
  sounds: true,
  soundVolume: 0.8,
  hideAfterRoll: true,
  immersiveMode: false,
  animateOnGMroll: true,
  throwForce: 1.5,
};

// ─── Die Geometry ─────────────────────────────────────────────
const DIE_FACES: Record<number, () => THREE.BufferGeometry> = {
  4:   () => new THREE.TetrahedronGeometry(1.2),
  6:   () => new THREE.BoxGeometry(1.2, 1.2, 1.2),
  8:   () => new THREE.OctahedronGeometry(1.2),
  10:  () => createD10Geometry(),
  12:  () => new THREE.DodecahedronGeometry(1.2),
  20:  () => new THREE.IcosahedronGeometry(1.2),
  100: () => createD10Geometry(),
};

function createD10Geometry(): THREE.BufferGeometry {
  // Simplified d10 using a custom shape
  const geometry = new THREE.CylinderGeometry(0.8, 0.8, 1.6, 10, 1);
  return geometry;
}

// ─── Sound Manager ────────────────────────────────────────────
class DiceSoundManager {
  private context: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private volume = 0.8;

  async init(volume: number): Promise<void> {
    this.volume = volume;
    try {
      this.context = new AudioContext();
      await this.preloadSounds();
    } catch {
      console.warn('[DiceSoNice] Audio not available');
    }
  }

  private async preloadSounds(): Promise<void> {
    // In production, load actual audio files
    // For now, we generate synthetic click sounds
    const sounds = ['roll', 'hit', 'stop'];
    for (const sound of sounds) {
      const buffer = this.generateClickSound(sound);
      this.buffers.set(sound, buffer);
    }
  }

  private generateClickSound(type: string): AudioBuffer {
    if (!this.context) throw new Error('No audio context');
    const duration = type === 'roll' ? 0.3 : 0.1;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.2));
    }
    return buffer;
  }

  play(sound: string): void {
    if (!this.context || !this.buffers.has(sound)) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffers.get(sound)!;
    const gain = this.context.createGain();
    gain.gain.value = this.volume;
    source.connect(gain);
    gain.connect(this.context.destination);
    source.start();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }
}

// ─── 3D Scene Manager ─────────────────────────────────────────
class DiceScene3D {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private container: HTMLDivElement | null = null;
  private animationId: number | null = null;
  private dice: THREE.Mesh[] = [];
  private config: DiceSoNiceConfig;
  private sounds: DiceSoundManager;

  constructor(config: DiceSoNiceConfig, sounds: DiceSoundManager) {
    this.config = config;
    this.sounds = sounds;
  }

  init(container?: HTMLDivElement): void {
    // Create overlay container
    this.container = container ?? document.createElement('div');
    if (!container) {
      Object.assign(this.container.style, {
        position: 'fixed',
        top: '0', left: '0', right: '0', bottom: '0',
        pointerEvents: 'none',
        zIndex: '1000',
      });
      document.body.appendChild(this.container);
    }

    // Three.js setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.config.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(5, 10, 5);
    directional.castShadow = this.config.shadows;
    if (this.config.shadows) {
      directional.shadow.mapSize.width = 2048;
      directional.shadow.mapSize.height = 2048;
    }
    this.scene.add(directional);

    // Point light for dramatic effect
    const pointLight = new THREE.PointLight(0xc9a84c, 0.8, 20);
    pointLight.position.set(-3, 5, 3);
    this.scene.add(pointLight);

    // Ground plane (invisible, for shadows)
    if (this.config.shadows) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.ShadowMaterial({ opacity: 0.3 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -2;
      ground.receiveShadow = true;
      this.scene.add(ground);
    }

    // Start render loop
    this.animate();

    // Handle resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private onResize(): void {
    if (!this.renderer || !this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  async throwDice(
    dieType: number,
    count: number,
    results: number[],
    onComplete: (results: number[]) => void
  ): Promise<void> {
    if (!this.scene) return;

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.config.diceColor),
      roughness: 0.3,
      metalness: this.config.theme === 'metal' ? 0.8 : 0.1,
    });

    const getGeometry = DIE_FACES[dieType];
    if (!getGeometry) return;

    // Create dice meshes
    const newDice: THREE.Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(getGeometry(), material);
      mesh.castShadow = this.config.shadows;

      // Initial position — thrown from top
      const xOffset = (i - count / 2) * 2;
      mesh.position.set(xOffset + (Math.random() - 0.5) * 3, 8, (Math.random() - 0.5) * 2);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      // Velocity (stored as userData)
      const force = this.config.throwForce;
      mesh.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * force,
          -force * 2,
          (Math.random() - 0.5) * force
        ),
        angularVelocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3
        ),
        settled: false,
        result: results[i] ?? 1,
        dieType,
      };

      this.scene.add(mesh);
      newDice.push(mesh);
    }
    this.dice.push(...newDice);

    this.sounds.play('roll');

    // Simulate physics
    await this.simulatePhysics(newDice, results, onComplete);
  }

  private async simulatePhysics(
    dice: THREE.Mesh[],
    results: number[],
    onComplete: (results: number[]) => void
  ): Promise<void> {
    const speedMultiplier = [0.5, 1.0, 2.0][this.config.speed - 1] ?? 1.0;
    const groundY = -1.5;
    const bounceCoeff = 0.4;
    const friction = 0.85;
    const dt = 0.016 * speedMultiplier;

    return new Promise(resolve => {
      let frame = 0;
      const maxFrames = Math.floor(180 / speedMultiplier);

      const simulateFrame = () => {
        let allSettled = true;

        for (const die of dice) {
          if (die.userData.settled) continue;
          allSettled = false;

          const vel = die.userData.velocity as THREE.Vector3;
          const angVel = die.userData.angularVelocity as THREE.Vector3;

          // Gravity
          vel.y -= 9.8 * dt;

          // Move
          die.position.addScaledVector(vel, dt);
          die.rotation.x += angVel.x;
          die.rotation.y += angVel.y;
          die.rotation.z += angVel.z;

          // Ground collision
          if (die.position.y < groundY) {
            die.position.y = groundY;
            vel.y = -vel.y * bounceCoeff;
            vel.x *= friction;
            vel.z *= friction;
            angVel.multiplyScalar(friction);

            this.sounds.play('hit');

            if (Math.abs(vel.y) < 0.1 && Math.abs(vel.x) < 0.1) {
              die.userData.settled = true;
              this.sounds.play('stop');

              // Snap to result orientation
              // (In full implementation, rotate die to show correct face)
            }
          }

          // Wall bounds
          const bound = 6;
          if (Math.abs(die.position.x) > bound) {
            die.position.x = Math.sign(die.position.x) * bound;
            vel.x = -vel.x * bounceCoeff;
          }
          if (Math.abs(die.position.z) > bound) {
            die.position.z = Math.sign(die.position.z) * bound;
            vel.z = -vel.z * bounceCoeff;
          }
        }

        frame++;
        if (frame >= maxFrames || allSettled) {
          // Show result numbers
          onComplete(results);
          setTimeout(() => {
            if (this.config.hideAfterRoll) {
              this.clearDice(dice);
            }
          }, 2000);
          resolve();
        } else {
          requestAnimationFrame(simulateFrame);
        }
      };

      requestAnimationFrame(simulateFrame);
    });
  }

  private clearDice(dice: THREE.Mesh[]): void {
    for (const die of dice) {
      this.scene?.remove(die);
      die.geometry.dispose();
      (die.material as THREE.Material).dispose();
    }
    this.dice = this.dice.filter(d => !dice.includes(d));
  }

  clearAll(): void {
    this.clearDice([...this.dice]);
  }

  destroy(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize.bind(this));
    this.renderer?.dispose();
    this.container?.remove();
  }
}

// ─── Plugin Class ─────────────────────────────────────────────
export class DiceSoNicePlugin extends MythicForgePlugin {
  readonly manifest: PluginManifest = {
    id: 'dice-so-nice',
    title: 'Dice So Nice',
    description: '3D animated dice rolling for MythicForge VTT',
    version: '1.0.0',
    author: 'MythicForge Community',
    license: 'MIT',
    compatibility: { minimum: '0.1.0', verified: '0.1.0' },
    esmodules: ['dist/index.js'],
  };

  private diceScene: DiceScene3D | null = null;
  private sounds = new DiceSoundManager();
  private config = { ...DEFAULT_CONFIG };

  protected registerSettings(): void {
    this.settings?.register<boolean>('dice-so-nice', 'enabled', {
      name: 'Enable 3D Dice',
      hint: 'Show 3D dice animations when rolling',
      scope: 'client',
      config: true,
      type: Boolean,
      default: true,
      onChange: val => { this.config.enabled = val; },
    });

    this.settings?.register<string>('dice-so-nice', 'theme', {
      name: 'Dice Theme',
      scope: 'client',
      config: true,
      type: String,
      choices: {
        standard: 'Standard',
        gemstone: 'Gemstone',
        metal: 'Metallic',
        custom: 'Custom',
      },
      default: 'standard',
    });

    this.settings?.register<number>('dice-so-nice', 'speed', {
      name: 'Animation Speed',
      scope: 'client',
      config: true,
      type: Number,
      range: { min: 1, max: 3, step: 1 },
      default: 2,
    });

    this.settings?.register<boolean>('dice-so-nice', 'sounds', {
      name: 'Dice Sounds',
      scope: 'client',
      config: true,
      type: Boolean,
      default: true,
    });
  }

  protected registerHooks(): void {
    Hooks.on(HOOKS.DICE_SO_NICE, async (roll: DiceRoll) => {
      if (!this.config.enabled) return;
      await this.animateRoll(roll);
    });

    Hooks.on(HOOKS.ROLL_COMPLETE, async (roll: DiceRoll) => {
      if (!this.config.enabled) return;
      // Trigger animation for public rolls
      if (roll.rollMode === 'publicroll' ||
          (roll.rollMode === 'gmroll' && this.config.animateOnGMroll)) {
        await this.animateRoll(roll);
      }
    });
  }

  protected async onInit(): Promise<void> {
    await this.sounds.init(this.config.soundVolume);
    console.log('[DiceSoNice] Plugin initialized');
  }

  override onReady(): void {
    const canvas = document.querySelector('#mythicforge-canvas') as HTMLDivElement;
    this.diceScene = new DiceScene3D(this.config, this.sounds);
    this.diceScene.init(canvas ?? undefined);
    console.log('[DiceSoNice] 3D scene ready');
  }

  private async animateRoll(rollResult: DiceRoll): Promise<void> {
    if (!this.diceScene) return;

    const dieParts = rollResult.terms.filter(
      (t): t is Extract<typeof t, { type: 'die' }> => t.type === 'die'
    );

    for (const part of dieParts) {
      const activeResults = part.results
        .filter(r => r.active)
        .map(r => r.result);

      await this.diceScene.throwDice(
        part.faces,
        activeResults.length,
        activeResults,
        (results) => {
          console.log(`[DiceSoNice] Rolled ${results.length}d${part.faces}: [${results.join(', ')}]`);
        }
      );
    }
  }

  getConfig(): DiceSoNiceConfig {
    return { ...this.config };
  }

  setConfig(partial: Partial<DiceSoNiceConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}

export default new DiceSoNicePlugin();
