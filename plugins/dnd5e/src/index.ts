// ============================================================
// Dungeons & Dragons 5th Edition — MythicForge Game System
// ============================================================

import type { Actor, Item, Combatant, PluginManifest } from '@mythicforge/shared';
import { BaseGameSystem, HOOKS, Hooks } from '@mythicforge/plugin-api';
import { roll, rollAdvantage, rollDisadvantage, isCriticalHit } from '@mythicforge/dice-engine';

// ─── D&D 5e Actor Data ────────────────────────────────────────
interface DnD5eAbilities {
  str: AbilityScore;
  dex: AbilityScore;
  con: AbilityScore;
  int: AbilityScore;
  wis: AbilityScore;
  cha: AbilityScore;
}

interface AbilityScore {
  value: number;
  proficient: number; // 0 | 0.5 | 1 | 2
  // Derived:
  mod?: number;
  save?: number;
}

interface DnD5eAttributes {
  hp: { value: number; min: number; max: number; temp: number; tempmax: number };
  ac: { value: number; calc: 'default' | 'mage-armor' | 'natural' | 'custom'; flat?: number };
  init: { value: number; bonus: number };
  speed: { value: number; burrow: number; climb: number; fly: number; swim: number; hover: boolean };
  prof: number;
  spellcasting: '' | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  spelldc: number;
  movement: { units: 'ft' | 'm' };
  exhaustion: number;
  concentration: { active: boolean };
  death: { success: number; failure: number };
}

interface DnD5eSkills {
  acr: Skill; ani: Skill; arc: Skill; ath: Skill;
  dec: Skill; his: Skill; ins: Skill; inv: Skill;
  itm: Skill; med: Skill; nat: Skill; per: Skill;
  prc: Skill; prf: Skill; rel: Skill; slt: Skill;
  ste: Skill; sur: Skill;
}

interface Skill {
  value: 0 | 0.5 | 1 | 2; // none | half | full | expert
  ability: keyof DnD5eAbilities;
  // Derived:
  total?: number;
  passive?: number;
}

interface DnD5eResources {
  primary: Resource;
  secondary: Resource;
  tertiary: Resource;
}

interface Resource {
  label: string;
  value: number;
  max: number;
  sr: boolean; // short rest recovery
  lr: boolean; // long rest recovery
}

interface DnD5eSpells {
  spell1: SpellSlots; spell2: SpellSlots; spell3: SpellSlots;
  spell4: SpellSlots; spell5: SpellSlots; spell6: SpellSlots;
  spell7: SpellSlots; spell8: SpellSlots; spell9: SpellSlots;
  pact: SpellSlots;
}

interface SpellSlots {
  value: number;
  max: number;
  override: number | null;
}

export interface DnD5eActorData {
  abilities: DnD5eAbilities;
  attributes: DnD5eAttributes;
  details: {
    biography: { value: string; public: string };
    alignment: string;
    race: string;
    background: string;
    originalClass: string;
    xp: { value: number; min: number; max: number };
    bonusXP: number;
    age: string;
    height: string;
    weight: string;
    eyes: string;
    skin: string;
    hair: string;
    appearance: string;
    ideal: string;
    bond: string;
    flaw: string;
    trait: string;
    cr: number;      // for NPCs
    type: { value: string; subtype: string; swarm: string };
    environment: string;
    source: string;
  };
  skills: DnD5eSkills;
  traits: {
    size: 'tiny' | 'sm' | 'med' | 'lg' | 'huge' | 'grg';
    di: string[];   // damage immunities
    dr: string[];   // damage resistances
    dv: string[];   // damage vulnerabilities
    ci: string[];   // condition immunities
    languages: { value: string[]; custom: string };
    senses: { darkvision: number; blindsight: number; tremorsense: number; truesight: number; units: 'ft'; special: string };
    weaponProf: { value: string[]; custom: string };
    armorProf: { value: string[]; custom: string };
    toolProf: { value: string[]; custom: string };
  };
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  resources: DnD5eResources;
  spells: DnD5eSpells;
  bonuses: {
    mwak: { attack: string; damage: string };
    rwak: { attack: string; damage: string };
    msak: { attack: string; damage: string };
    rsak: { attack: string; damage: string };
    abilities: { check: string; save: string; skill: string };
    spell: { dc: string };
  };
}

// ─── Ability Helper ───────────────────────────────────────────
function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// ─── D&D 5e System Class ──────────────────────────────────────
export class DnD5eSystem extends BaseGameSystem {
  readonly id = 'dnd5e';
  readonly actorTypes = ['character', 'npc', 'vehicle'];
  readonly itemTypes = [
    'weapon', 'equipment', 'consumable', 'tool', 'loot', 'class',
    'subclass', 'background', 'race', 'feat', 'spell', 'backpack',
  ];

  readonly manifest: PluginManifest = {
    id: 'dnd5e',
    title: 'Dungeons & Dragons 5th Edition',
    description: 'Official D&D 5e game system for MythicForge VTT',
    version: '1.0.0',
    author: 'MythicForge Team',
    license: 'MIT',
    compatibility: { minimum: '0.1.0', verified: '0.1.0' },
    esmodules: ['dist/index.js'],
    styles: ['dist/dnd5e.css'],
  };

  // ─── Data Preparation ────────────────────────────────────────
  prepareActorData(actor: Actor): void {
    const data = actor.data as DnD5eActorData;
    const level = this.getActorLevel(actor);
    const prof = getProficiencyBonus(level);

    // Derive ability modifiers
    for (const [, ability] of Object.entries(data.abilities)) {
      ability.mod = getAbilityModifier(ability.value);
      ability.save = ability.mod + (ability.proficient ? Math.floor(prof * ability.proficient) : 0);
    }

    // Derive skill totals
    const skillAbilityMap: Record<string, keyof DnD5eAbilities> = {
      acr: 'dex', ani: 'wis', arc: 'int', ath: 'str',
      dec: 'cha', his: 'int', ins: 'wis', inv: 'int',
      itm: 'cha', med: 'wis', nat: 'int', per: 'cha',
      prc: 'wis', prf: 'cha', rel: 'int', slt: 'dex',
      ste: 'dex', sur: 'wis',
    };

    for (const [key, skill] of Object.entries(data.skills)) {
      const abilityKey = skillAbilityMap[key] ?? skill.ability;
      const abilityMod = data.abilities[abilityKey]?.mod ?? 0;
      const profBonus = Math.floor(prof * skill.value);
      skill.total = abilityMod + profBonus;
      skill.passive = 10 + (skill.total ?? 0);
    }

    // Derive AC
    if (data.attributes.ac.calc === 'default') {
      data.attributes.ac.value = 10 + (data.abilities.dex.mod ?? 0);
    }

    // Derive initiative
    data.attributes.init.value = (data.abilities.dex.mod ?? 0) + (data.attributes.init.bonus ?? 0);

    // Spell DC
    if (data.attributes.spellcasting) {
      const castingMod = data.abilities[data.attributes.spellcasting]?.mod ?? 0;
      data.attributes.spelldc = 8 + prof + castingMod;
    }
  }

  prepareItemData(item: Item): void {
    // Items prepare their own attack/damage bonuses, spell level slots, etc.
    // System-specific logic per item type
  }

  // ─── Rolling ─────────────────────────────────────────────────
  async rollAbilityCheck(
    actor: Actor,
    ability: string,
    options: { advantage?: boolean; disadvantage?: boolean; bonus?: string } = {}
  ) {
    const data = actor.data as DnD5eActorData;
    const abilityData = data.abilities[ability as keyof DnD5eAbilities];
    if (!abilityData) throw new Error(`Unknown ability: ${ability}`);

    const mod = abilityData.mod ?? getAbilityModifier(abilityData.value);
    const formula = mod >= 0 ? `1d20+${mod}` : `1d20${mod}`;
    const finalFormula = options.bonus ? `${formula}+${options.bonus}` : formula;

    if (options.advantage) return rollAdvantage(mod);
    if (options.disadvantage) return rollDisadvantage(mod);
    return roll(finalFormula, { flavor: `${ability.toUpperCase()} Check` });
  }

  async rollSavingThrow(
    actor: Actor,
    ability: string,
    options: { advantage?: boolean; disadvantage?: boolean } = {}
  ) {
    const data = actor.data as DnD5eActorData;
    const abilityData = data.abilities[ability as keyof DnD5eAbilities];
    if (!abilityData) throw new Error(`Unknown ability: ${ability}`);

    const save = abilityData.save ?? getAbilityModifier(abilityData.value);
    if (options.advantage) return rollAdvantage(save, { flavor: `${ability.toUpperCase()} Save` });
    if (options.disadvantage) return rollDisadvantage(save, { flavor: `${ability.toUpperCase()} Save` });
    return roll(save >= 0 ? `1d20+${save}` : `1d20${save}`, { flavor: `${ability.toUpperCase()} Save` });
  }

  async rollAttack(actor: Actor, item: Item) {
    const itemData = item.data as { attackBonus?: string | number; actionType?: string };
    const actorData = actor.data as DnD5eActorData;

    // Determine proficiency and attack mod
    const level = this.getActorLevel(actor);
    const prof = getProficiencyBonus(level);
    const attackBonus = Number(itemData.attackBonus ?? 0);

    let abilityMod = 0;
    if (itemData.actionType === 'mwak') {
      abilityMod = Math.max(actorData.abilities.str.mod ?? 0, actorData.abilities.dex.mod ?? 0);
    } else if (itemData.actionType === 'rwak') {
      abilityMod = actorData.abilities.dex.mod ?? 0;
    } else if (itemData.actionType === 'msak' || itemData.actionType === 'rsak') {
      const castingAbility = actorData.attributes.spellcasting;
      abilityMod = castingAbility ? (actorData.abilities[castingAbility]?.mod ?? 0) : 0;
    }

    const total = prof + abilityMod + attackBonus;
    const formula = total >= 0 ? `1d20+${total}` : `1d20${total}`;
    const result = roll(formula, { flavor: `${item.name} Attack` });

    const isCrit = isCriticalHit(result);
    await Hooks.call(HOOKS.ROLL_COMPLETE, result, { actor, item, isCrit });
    return result;
  }

  async rollDamage(actor: Actor, item: Item, options: { crit?: boolean } = {}) {
    const itemData = item.data as {
      damage?: { parts: Array<[string, string]>; versatile: string };
      actionType?: string;
    };
    if (!itemData.damage?.parts?.length) throw new Error('Item has no damage');

    const actorData = actor.data as DnD5eActorData;
    let abilityMod = 0;
    if (itemData.actionType === 'mwak') {
      abilityMod = Math.max(actorData.abilities.str.mod ?? 0, actorData.abilities.dex.mod ?? 0);
    } else if (itemData.actionType === 'rwak') {
      abilityMod = actorData.abilities.dex.mod ?? 0;
    }

    const parts = itemData.damage.parts.map(([formula]) => formula);
    let damageFormula = parts.join('+');
    if (abilityMod !== 0) damageFormula += abilityMod >= 0 ? `+${abilityMod}` : `${abilityMod}`;

    // Critical hit: double the dice
    if (options.crit) {
      damageFormula = damageFormula.replace(/(\d+)d(\d+)/g, (_, n, d) => `${Number(n) * 2}d${d}`);
    }

    return roll(damageFormula, { flavor: `${item.name} Damage${options.crit ? ' (Critical)' : ''}` });
  }

  async rollInitiative(combatants: Combatant[]): Promise<void> {
    // Roll initiative for all combatants simultaneously
    for (const combatant of combatants) {
      if (combatant.hasRolled) continue;
      const bonus = combatant.initiativeBonus;
      const result = roll(bonus >= 0 ? `1d20+${bonus}` : `1d20${bonus}`, {
        flavor: `${combatant.name} Initiative`,
      });
      combatant.initiative = result.total + bonus / 100; // tiebreaker
      combatant.hasRolled = true;
    }
  }

  async applyDamage(actor: Actor, amount: number, type = 'piercing'): Promise<void> {
    const data = actor.data as DnD5eActorData;

    // Check damage type modifiers
    const immunities = data.traits.di ?? [];
    const resistances = data.traits.dr ?? [];
    const vulnerabilities = data.traits.dv ?? [];

    let finalAmount = amount;
    if (immunities.includes(type)) {
      finalAmount = 0;
    } else if (resistances.includes(type)) {
      finalAmount = Math.floor(amount / 2);
    } else if (vulnerabilities.includes(type)) {
      finalAmount = amount * 2;
    }

    // Apply temp HP first
    const temp = data.attributes.hp.temp ?? 0;
    const tempAbsorbed = Math.min(temp, finalAmount);
    finalAmount -= tempAbsorbed;
    data.attributes.hp.temp = temp - tempAbsorbed;

    // Apply to HP
    data.attributes.hp.value = Math.max(0, (data.attributes.hp.value ?? 0) - finalAmount);

    await Hooks.call(HOOKS.UPDATE_ACTOR, actor, { 'data.attributes.hp': data.attributes.hp });
  }

  async applyHealing(actor: Actor, amount: number): Promise<void> {
    const data = actor.data as DnD5eActorData;
    const maxHp = data.attributes.hp.max + (data.attributes.hp.tempmax ?? 0);
    data.attributes.hp.value = Math.min(maxHp, (data.attributes.hp.value ?? 0) + amount);
    await Hooks.call(HOOKS.UPDATE_ACTOR, actor, { 'data.attributes.hp': data.attributes.hp });
  }

  getAttackBonus(actor: Actor, item: Item): number {
    const actorData = actor.data as DnD5eActorData;
    const level = this.getActorLevel(actor);
    return getProficiencyBonus(level) + (actorData.abilities.str.mod ?? 0);
  }

  getDamageBonus(actor: Actor, item: Item): string {
    const actorData = actor.data as DnD5eActorData;
    const mod = actorData.abilities.str.mod ?? 0;
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  getMoveSpeed(actor: Actor): number {
    const data = actor.data as DnD5eActorData;
    return data.attributes.speed.value ?? 30;
  }

  // ─── Helpers ─────────────────────────────────────────────────
  private getActorLevel(actor: Actor): number {
    const data = actor.data as { details?: { level?: number; cr?: number } };
    return data.details?.level ?? 1;
  }

  // ─── Plugin Lifecycle ────────────────────────────────────────
  protected registerSettings(): void {
    this.settings?.register('dnd5e', 'initiativeDexTiebreaker', {
      name: 'Initiative Dexterity Tiebreaker',
      hint: 'Use Dexterity as tiebreaker for equal initiative rolls',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });

    this.settings?.register('dnd5e', 'criticalDamageModifier', {
      name: 'Critical Hit Damage',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        'double-dice': 'Double Dice',
        'double-total': 'Double Total',
        'max-plus-roll': 'Max + Roll',
      },
      default: 'double-dice',
    });
  }

  protected registerHooks(): void {
    Hooks.on(HOOKS.PRE_ROLL, (rollData: { formula: string }) => {
      // Pre-roll hook: modify formula before rolling
      void rollData;
    });

    Hooks.on(HOOKS.COMBAT_TURN_CHANGE, async (combat: { combatants: Combatant[] }) => {
      // Auto-apply effects at start/end of turn
      void combat;
    });

    Hooks.on(HOOKS.UPDATE_ACTOR, async (actor: Actor) => {
      // Check for incapacitation, death saves, etc.
      const data = actor.data as DnD5eActorData;
      if (data.attributes?.hp?.value === 0) {
        console.log(`[D&D5e] ${actor.name} has fallen unconscious!`);
      }
    });
  }

  protected async onInit(): Promise<void> {
    console.log('[D&D5e] System initialized');
  }
}

// ─── Template: Default D&D 5e Character Data ─────────────────
export const DEFAULT_DND5E_CHARACTER: Partial<DnD5eActorData> = {
  abilities: {
    str: { value: 10, proficient: 0 },
    dex: { value: 10, proficient: 0 },
    con: { value: 10, proficient: 0 },
    int: { value: 10, proficient: 0 },
    wis: { value: 10, proficient: 0 },
    cha: { value: 10, proficient: 0 },
  },
  attributes: {
    hp: { value: 8, min: 0, max: 8, temp: 0, tempmax: 0 },
    ac: { value: 10, calc: 'default' },
    init: { value: 0, bonus: 0 },
    speed: { value: 30, burrow: 0, climb: 0, fly: 0, swim: 0, hover: false },
    prof: 2,
    spellcasting: '',
    spelldc: 8,
    movement: { units: 'ft' },
    exhaustion: 0,
    concentration: { active: false },
    death: { success: 0, failure: 0 },
  },
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
};

export default DnD5eSystem;
