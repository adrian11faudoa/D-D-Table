// ============================================================
// @mythicforge/dice-engine
// Full dice formula parser & evaluator
// Supports: XdY, kh/kl (keep highest/lowest), cs/cf (crit),
//           r (reroll), x (explode), min/max, +/-/*/÷
// ============================================================

import type { DiceRoll, DieResult, RollTerm, UUID, Timestamp } from '@mythicforge/shared';
import { uuid, now } from '@mythicforge/shared';

// ─── Types ───────────────────────────────────────────────────
export interface RollOptions {
  rollMode?: DiceRoll['rollMode'];
  flavor?: string;
  speaker?: DiceRoll['speaker'];
  minimize?: boolean;   // all dice roll minimum
  maximize?: boolean;   // all dice roll maximum
}

export interface ParsedFormula {
  terms: ParsedTerm[];
  raw: string;
}

export type ParsedTerm =
  | { kind: 'die'; count: number; faces: number; modifiers: DieModifier[] }
  | { kind: 'constant'; value: number }
  | { kind: 'operator'; op: '+' | '-' | '*' | '/' };

export interface DieModifier {
  type: 'keep-highest' | 'keep-lowest' | 'drop-highest' | 'drop-lowest'
      | 'reroll' | 'reroll-once' | 'explode' | 'count-successes'
      | 'minimum' | 'maximum' | 'deduct-failures';
  value?: number;
  comparison?: '<' | '<=' | '>' | '>=' | '=';
}

// ─── Parser ──────────────────────────────────────────────────
const TOKEN_RE = /(\d+)?d(\d+)((?:[kd][hl]\d+|[rxcs][<>]=?\d+|min\d+|max\d+)*)|([+\-*\/])|(\d+(?:\.\d+)?)/gi;

function parseDieModifiers(raw: string): DieModifier[] {
  const mods: DieModifier[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw.startsWith('kh', i)) {
      const n = parseInt(raw.slice(i + 2)) || 1;
      mods.push({ type: 'keep-highest', value: n });
      i += 2 + String(n).length;
    } else if (raw.startsWith('kl', i)) {
      const n = parseInt(raw.slice(i + 2)) || 1;
      mods.push({ type: 'keep-lowest', value: n });
      i += 2 + String(n).length;
    } else if (raw.startsWith('dh', i)) {
      const n = parseInt(raw.slice(i + 2)) || 1;
      mods.push({ type: 'drop-highest', value: n });
      i += 2 + String(n).length;
    } else if (raw.startsWith('dl', i)) {
      const n = parseInt(raw.slice(i + 2)) || 1;
      mods.push({ type: 'drop-lowest', value: n });
      i += 2 + String(n).length;
    } else if (raw.startsWith('r', i)) {
      const n = parseInt(raw.slice(i + 1)) || 1;
      mods.push({ type: 'reroll', value: n });
      i += 1 + String(n).length;
    } else if (raw.startsWith('x', i)) {
      const n = parseInt(raw.slice(i + 1)) || 0;
      mods.push({ type: 'explode', value: n });
      i += 1 + (n ? String(n).length : 0);
    } else if (raw.startsWith('min', i)) {
      const n = parseInt(raw.slice(i + 3));
      mods.push({ type: 'minimum', value: n });
      i += 3 + String(n).length;
    } else if (raw.startsWith('max', i)) {
      const n = parseInt(raw.slice(i + 3));
      mods.push({ type: 'maximum', value: n });
      i += 3 + String(n).length;
    } else {
      i++;
    }
  }
  return mods;
}

export function parseFormula(formula: string): ParsedFormula {
  const terms: ParsedTerm[] = [];
  const normalized = formula.trim().toLowerCase().replace(/\s+/g, '');

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(normalized)) !== null) {
    const [, countStr, facesStr, modStr, operator, constant] = match;

    if (facesStr !== undefined) {
      const count = countStr ? parseInt(countStr) : 1;
      const faces = parseInt(facesStr);
      const modifiers = modStr ? parseDieModifiers(modStr) : [];
      terms.push({ kind: 'die', count, faces, modifiers });
    } else if (operator) {
      terms.push({ kind: 'operator', op: operator as '+' | '-' | '*' | '/' });
    } else if (constant !== undefined) {
      terms.push({ kind: 'constant', value: parseFloat(constant) });
    }
  }

  if (terms.length === 0) {
    throw new Error(`Invalid dice formula: "${formula}"`);
  }

  return { terms, raw: formula };
}

// ─── Roller ──────────────────────────────────────────────────
function rollDie(faces: number, opts: RollOptions): number {
  if (opts.minimize) return 1;
  if (opts.maximize) return faces;
  return Math.floor(Math.random() * faces) + 1;
}

function applyModifiers(
  rolls: DieResult[],
  faces: number,
  mods: DieModifier[],
  opts: RollOptions
): DieResult[] {
  let results = [...rolls];

  for (const mod of mods) {
    switch (mod.type) {
      case 'keep-highest': {
        const keep = mod.value ?? 1;
        const sorted = [...results].sort((a, b) => b.result - a.result);
        const keepSet = new Set(sorted.slice(0, keep));
        results = results.map(r =>
          keepSet.has(r) ? r : { ...r, active: false, discarded: true }
        );
        break;
      }
      case 'keep-lowest': {
        const keep = mod.value ?? 1;
        const sorted = [...results].sort((a, b) => a.result - b.result);
        const keepSet = new Set(sorted.slice(0, keep));
        results = results.map(r =>
          keepSet.has(r) ? r : { ...r, active: false, discarded: true }
        );
        break;
      }
      case 'drop-highest': {
        const drop = mod.value ?? 1;
        const sorted = [...results].sort((a, b) => b.result - a.result);
        const dropSet = new Set(sorted.slice(0, drop));
        results = results.map(r =>
          dropSet.has(r) ? { ...r, active: false, discarded: true } : r
        );
        break;
      }
      case 'drop-lowest': {
        const drop = mod.value ?? 1;
        const sorted = [...results].sort((a, b) => a.result - b.result);
        const dropSet = new Set(sorted.slice(0, drop));
        results = results.map(r =>
          dropSet.has(r) ? { ...r, active: false, discarded: true } : r
        );
        break;
      }
      case 'reroll': {
        const threshold = mod.value ?? 1;
        results = results.map(r => {
          if (r.result <= threshold && r.active) {
            return { result: rollDie(faces, opts), active: true, rerolled: true };
          }
          return r;
        });
        break;
      }
      case 'explode': {
        const threshold = mod.value || faces;
        let exploding = results.filter(r => r.result >= threshold && r.active);
        let safetyLimit = 100;
        while (exploding.length > 0 && safetyLimit-- > 0) {
          const newRolls: DieResult[] = exploding.map(() => ({
            result: rollDie(faces, opts),
            active: true,
            exploded: true,
          }));
          results.push(...newRolls);
          exploding = newRolls.filter(r => r.result >= threshold);
        }
        break;
      }
      case 'minimum': {
        const min = mod.value ?? 1;
        results = results.map(r => ({
          ...r,
          result: r.active ? Math.max(r.result, min) : r.result,
        }));
        break;
      }
      case 'maximum': {
        const max = mod.value ?? faces;
        results = results.map(r => ({
          ...r,
          result: r.active ? Math.min(r.result, max) : r.result,
        }));
        break;
      }
    }
  }

  return results;
}

function evaluateTerms(evaluatedTerms: Array<{ value: number; term: ParsedTerm }>): number {
  // Build a flat list of values and operators, respecting precedence
  const values: number[] = [];
  const operators: string[] = [];

  for (const { value, term } of evaluatedTerms) {
    if (term.kind === 'operator') {
      operators.push(term.op);
    } else {
      values.push(value);
    }
  }

  // First pass: multiply and divide
  let i = 0;
  while (i < operators.length) {
    const op = operators[i];
    if (op === '*' || op === '/') {
      const left = values[i];
      const right = values[i + 1];
      if (left === undefined || right === undefined) break;
      const result = op === '*' ? left * right : left / right;
      values.splice(i, 2, result);
      operators.splice(i, 1);
    } else {
      i++;
    }
  }

  // Second pass: add and subtract
  let total = values[0] ?? 0;
  for (let j = 0; j < operators.length; j++) {
    const op = operators[j];
    const next = values[j + 1];
    if (next === undefined) break;
    if (op === '+') total += next;
    else if (op === '-') total -= next;
  }

  return Math.round(total * 100) / 100;
}

// ─── Main Roll Function ───────────────────────────────────────
export function roll(formula: string, opts: RollOptions = {}): DiceRoll {
  const parsed = parseFormula(formula);
  const rollTerms: RollTerm[] = [];
  const evalTerms: Array<{ value: number; term: ParsedTerm }> = [];

  for (const term of parsed.terms) {
    if (term.kind === 'die') {
      const rawRolls: DieResult[] = Array.from({ length: term.count }, () => ({
        result: rollDie(term.faces, opts),
        active: true,
      }));
      const finalRolls = applyModifiers(rawRolls, term.faces, term.modifiers, opts);
      const total = finalRolls.filter(r => r.active).reduce((sum, r) => sum + r.result, 0);

      rollTerms.push({
        type: 'die',
        faces: term.faces,
        number: term.count,
        results: finalRolls,
      });
      evalTerms.push({ value: total, term });
    } else if (term.kind === 'constant') {
      rollTerms.push({ type: 'numeric', number: term.value });
      evalTerms.push({ value: term.value, term });
    } else {
      rollTerms.push({ type: 'operator', operator: term.op });
      evalTerms.push({ value: 0, term });
    }
  }

  const total = evaluateTerms(evalTerms);

  return {
    id: uuid(),
    formula,
    terms: rollTerms,
    total,
    flavor: opts.flavor,
    rollMode: opts.rollMode ?? 'publicroll',
    speaker: opts.speaker ?? { userId: 'system' as UUID, alias: 'System' },
    timestamp: now(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────
export function rollD20(modifier = 0, opts: RollOptions = {}): DiceRoll {
  return roll(modifier >= 0 ? `1d20+${modifier}` : `1d20${modifier}`, opts);
}

export function rollAdvantage(modifier = 0, opts: RollOptions = {}): DiceRoll {
  return roll(modifier >= 0 ? `2d20kh1+${modifier}` : `2d20kh1${modifier}`, opts);
}

export function rollDisadvantage(modifier = 0, opts: RollOptions = {}): DiceRoll {
  return roll(modifier >= 0 ? `2d20kl1+${modifier}` : `2d20kl1${modifier}`, opts);
}

export function rollAbilityScore(): DiceRoll {
  return roll('4d6kh3');
}

export function formatRoll(rollResult: DiceRoll): string {
  const dieSummaries = rollResult.terms
    .filter((t): t is Extract<RollTerm, { type: 'die' }> => t.type === 'die')
    .map(t => {
      const active = t.results.filter(r => r.active).map(r => r.result);
      const discarded = t.results.filter(r => !r.active).map(r => r.result);
      const parts = [...active.map(r => `${r}`), ...discarded.map(r => `~~${r}~~`)];
      return `[${parts.join(', ')}]`;
    });
  return `${rollResult.formula} → ${dieSummaries.join(' ')} = **${rollResult.total}**`;
}

export function isCriticalHit(rollResult: DiceRoll, target = 20): boolean {
  return rollResult.terms
    .filter((t): t is Extract<RollTerm, { type: 'die' }> => t.type === 'die' && t.faces === 20)
    .some(t => t.results.some(r => r.active && r.result >= target));
}

export function isCriticalFail(rollResult: DiceRoll): boolean {
  return rollResult.terms
    .filter((t): t is Extract<RollTerm, { type: 'die' }> => t.type === 'die' && t.faces === 20)
    .some(t => t.results.some(r => r.active && r.result === 1));
}

// ─── Macro Support ────────────────────────────────────────────
export class DicePool {
  private formulas: string[] = [];

  add(formula: string): this {
    this.formulas.push(formula);
    return this;
  }

  roll(opts: RollOptions = {}): DiceRoll[] {
    return this.formulas.map(f => roll(f, opts));
  }

  total(opts: RollOptions = {}): number {
    return this.roll(opts).reduce((sum, r) => sum + r.total, 0);
  }
}

// ─── Exports ──────────────────────────────────────────────────
export { uuid, now };
