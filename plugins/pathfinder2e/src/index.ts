// ============================================================
// Pathfinder 2nd Edition — MythicForge Game System (Stub)
// Full implementation pending; demonstrates system extensibility
// ============================================================

import type { Actor, Item, Combatant, PluginManifest } from '@mythicforge/shared';
import { BaseGameSystem, Hooks, HOOKS } from '@mythicforge/plugin-api';
import { roll } from '@mythicforge/dice-engine';

// ─── PF2e Ability Scores ─────────────────────────────────────
interface PF2eAbilities {
  str: { value: number; mod: number };
  dex: { value: number; mod: number };
  con: { value: number; mod: number };
  int: { value: number; mod: number };
  wis: { value: number; mod: number };
  cha: { value: number; mod: number };
}

// ─── PF2e Proficiency ─────────────────────────────────────────
export type PF2eProfRank = 0 | 2 | 4 | 6 | 8; // untrained | trained | expert | master | legendary

export function profBonus(rank: PF2eProfRank, level: number): number {
  if (rank === 0) return 0; // Untrained: no proficiency bonus in PF2e
  return rank + level;
}

// ─── PF2e Action Economy ─────────────────────────────────────
export type ActionCost = 1 | 2 | 3 | 'reaction' | 'free';

// ─── PF2e Conditions ─────────────────────────────────────────
export const PF2E_CONDITIONS = [
  'blinded', 'clumsy', 'confused', 'dazzled', 'deafened',
  'doomed', 'drained', 'dying', 'encumbered', 'enfeebled',
  'fascinated', 'fatigued', 'fleeing', 'frightened', 'grabbed',
  'hidden', 'immobilized', 'invisible', 'observed', 'paralyzed',
  'petrified', 'prone', 'quickened', 'restrained', 'sickened',
  'slowed', 'stunned', 'stupefied', 'unconscious', 'undetected',
  'unfriendly', 'unnoticed', 'wounded',
] as const;

export type PF2eCondition = typeof PF2E_CONDITIONS[number];

// ─── PF2e System ─────────────────────────────────────────────
export class PathfinderSystem extends BaseGameSystem {
  readonly id = 'pathfinder2e';
  readonly actorTypes = ['character', 'npc', 'hazard', 'loot', 'vehicle'];
  readonly itemTypes = [
    'action', 'ancestry', 'armor', 'background', 'backpack', 'book',
    'class', 'condition', 'consumable', 'deity', 'effect', 'equipment',
    'feat', 'formula', 'heritage', 'kit', 'lore', 'martial', 'melee',
    'ranged', 'shield', 'spell', 'spellcastingEntry', 'treasure', 'weapon',
  ];

  readonly manifest: PluginManifest = {
    id: 'pathfinder2e',
    title: 'Pathfinder 2nd Edition',
    description: 'Complete Pathfinder 2e system with full automation',
    version: '0.1.0',
    author: 'MythicForge Team',
    license: 'MIT',
    compatibility: { minimum: '0.1.0', verified: '0.1.0' },
    esmodules: ['dist/index.js'],
    styles: ['dist/pf2e.css'],
  };

  // ─── Stat Derivation ─────────────────────────────────────────
  prepareActorData(actor: Actor): void {
    const data = actor.data as {
      abilities?: PF2eAbilities;
      details?: { level?: { value: number } };
      attributes?: {
        ac?: { value: number };
        hp?: { value: number; max: number };
        speed?: { value: number };
      };
      saves?: {
        fortitude?: { rank: PF2eProfRank; totalModifier: number };
        reflex?: { rank: PF2eProfRank; totalModifier: number };
        will?: { rank: PF2eProfRank; totalModifier: number };
      };
    };

    const level = data.details?.level?.value ?? 1;

    // Derive ability modifiers
    if (data.abilities) {
      for (const [, ability] of Object.entries(data.abilities)) {
        ability.mod = Math.floor((ability.value - 10) / 2);
      }
    }

    // Derive saving throws
    if (data.saves && data.abilities) {
      const conMod = data.abilities.con?.mod ?? 0;
      const dexMod = data.abilities.dex?.mod ?? 0;
      const wisMod = data.abilities.wis?.mod ?? 0;

      if (data.saves.fortitude) {
        data.saves.fortitude.totalModifier = conMod + profBonus(data.saves.fortitude.rank, level);
      }
      if (data.saves.reflex) {
        data.saves.reflex.totalModifier = dexMod + profBonus(data.saves.reflex.rank, level);
      }
      if (data.saves.will) {
        data.saves.will.totalModifier = wisMod + profBonus(data.saves.will.rank, level);
      }
    }
  }

  prepareItemData(item: Item): void {
    // PF2e items: calculate damage dice, runes, striking/potency
    const data = item.data as {
      damage?: { die: string; dice: number; modifier: number };
      potencyRune?: number;
      strikingRune?: 'striking' | 'greaterStriking' | 'majorStriking';
    };

    if (data.damage && data.strikingRune) {
      const extraDice = {
        striking: 1,
        greaterStriking: 2,
        majorStriking: 3,
      }[data.strikingRune] ?? 0;
      data.damage.dice = 1 + extraDice;
    }
  }

  // ─── Rolling ─────────────────────────────────────────────────
  async rollInitiative(combatants: Combatant[]): Promise<void> {
    // PF2e uses Perception for initiative by default
    for (const combatant of combatants) {
      if (combatant.hasRolled) continue;
      const result = roll('1d20+3', { flavor: `${combatant.name} Initiative (Perception)` });
      combatant.initiative = result.total;
      combatant.hasRolled = true;
    }
  }

  async rollSave(
    actor: Actor,
    save: 'fortitude' | 'reflex' | 'will',
    dc: number,
    options: { heroPoint?: boolean } = {}
  ): Promise<{ degree: 'critSuccess' | 'success' | 'failure' | 'critFailure'; total: number }> {
    const data = actor.data as { saves?: Record<string, { totalModifier?: number }> };
    const mod = data.saves?.[save]?.totalModifier ?? 0;

    const formula = options.heroPoint ? `2d20kh1+${mod}` : `1d20+${mod}`;
    const result = roll(formula, { flavor: `${save.charAt(0).toUpperCase() + save.slice(1)} Save vs DC ${dc}` });

    const diff = result.total - dc;
    let degree: 'critSuccess' | 'success' | 'failure' | 'critFailure';

    if (diff >= 10) degree = 'critSuccess';
    else if (diff >= 0) degree = 'success';
    else if (diff >= -10) degree = 'failure';
    else degree = 'critFailure';

    return { degree, total: result.total };
  }

  async applyDamage(actor: Actor, amount: number, type = 'physical'): Promise<void> {
    const data = actor.data as {
      attributes?: { hp?: { value: number; max: number; temp?: number } };
      traits?: { dr?: string[]; di?: string[]; dv?: string[] };
      details?: { level?: { value: number } };
    };

    const hp = data.attributes?.hp;
    if (!hp) return;

    // Apply weaknesses/resistances
    const resistances = data.traits?.dr ?? [];
    const immunities = data.traits?.di ?? [];
    const weaknesses = data.traits?.dv ?? [];

    let finalDamage = amount;
    if (immunities.includes(type)) finalDamage = 0;
    else if (resistances.includes(type)) finalDamage = Math.max(0, amount - 5); // simplified
    else if (weaknesses.includes(type)) finalDamage = amount + 5; // simplified

    // Temp HP first
    const tempAbsorbed = Math.min(hp.temp ?? 0, finalDamage);
    finalDamage -= tempAbsorbed;
    if (hp.temp !== undefined) hp.temp -= tempAbsorbed;

    hp.value = Math.max(0, hp.value - finalDamage);

    // PF2e dying/wounded
    if (hp.value === 0 && actor.type === 'character') {
      console.log(`[PF2e] ${actor.name} is dying!`);
    }

    await Hooks.call(HOOKS.UPDATE_ACTOR, actor);
  }

  async applyHealing(actor: Actor, amount: number): Promise<void> {
    const data = actor.data as { attributes?: { hp?: { value: number; max: number } } };
    const hp = data.attributes?.hp;
    if (!hp) return;
    hp.value = Math.min(hp.max, hp.value + amount);
    await Hooks.call(HOOKS.UPDATE_ACTOR, actor);
  }

  getAttackBonus(actor: Actor, item: Item): number {
    const data = actor.data as {
      abilities?: PF2eAbilities;
      details?: { level?: { value: number } };
    };
    const level = data.details?.level?.value ?? 1;
    const strMod = data.abilities?.str?.mod ?? 0;
    return strMod + level + 2; // trained proficiency simplified
  }

  getDamageBonus(actor: Actor, item: Item): string {
    const data = actor.data as { abilities?: PF2eAbilities };
    const strMod = data.abilities?.str?.mod ?? 0;
    return strMod >= 0 ? `+${strMod}` : String(strMod);
  }

  getMoveSpeed(actor: Actor): number {
    const data = actor.data as { attributes?: { speed?: { value: number } } };
    return data.attributes?.speed?.value ?? 25;
  }

  // ─── PF2e-specific ───────────────────────────────────────────
  getMaxActions(actor: Actor): ActionCost {
    // Check for slowed/quickened
    return 3;
  }

  protected registerSettings(): void {
    this.settings?.register('pathfinder2e', 'critSpecialization', {
      name: 'Critical Specialization Effects',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });
  }

  protected registerHooks(): void {
    Hooks.on(HOOKS.COMBAT_TURN_CHANGE, async () => {
      // PF2e: reset actions at start of turn, handle ongoing effects
    });
  }

  protected async onInit(): Promise<void> {
    console.log('[PF2e] Pathfinder 2e system initialized');
  }
}

// ─── PF2e Ancestry Templates ──────────────────────────────────
export const PF2E_ANCESTRIES = {
  human:    { hp: 8, size: 'medium', speed: 25, boosts: 2, heritages: ['versatile', 'skilled'] },
  elf:      { hp: 6, size: 'medium', speed: 30, darkvision: false, boosts: 2, heritages: ['ancient-elf', 'arctic-elf', 'cavern-elf', 'seer-elf', 'whisper-elf', 'woodland-elf'] },
  dwarf:    { hp: 10, size: 'medium', speed: 20, darkvision: true, boosts: 2, heritages: ['ancient-blooded', 'anvil', 'death-warden', 'forge', 'strong-blooded', 'oathkeeper'] },
  gnome:    { hp: 8, size: 'small', speed: 25, darkvision: false, boosts: 2, heritages: ['chameleon', 'fey-touched', 'sensate', 'umbral', 'wellspring'] },
  halfling: { hp: 6, size: 'small', speed: 25, boosts: 2, heritages: ['gutsy', 'hillock', 'jinxed', 'nomadic', 'twilight', 'wildwood'] },
  goblin:   { hp: 6, size: 'small', speed: 25, darkvision: true, boosts: 2, heritages: ['charhide', 'irongut', 'razortooth', 'snow', 'unbreakable', 'tailed'] },
  orc:      { hp: 10, size: 'medium', speed: 25, darkvision: true, boosts: 2, heritages: ['badlands', 'battle-ready', 'deep', 'grave', 'hold-scarred', 'rainfall', 'winter'] },
} as const;

export default new PathfinderSystem();
