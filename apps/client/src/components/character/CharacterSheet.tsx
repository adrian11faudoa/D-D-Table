// ============================================================
// CharacterSheet — Editable D&D 5e character sheet
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import type { Actor, Item, ActiveEffect } from '@mythicforge/shared';
import type { DnD5eActorData } from '../../../plugins/dnd5e/src';
import { roll } from '@mythicforge/dice-engine';

// ─── Constants ───────────────────────────────────────────────
const ABILITIES = [
  { key: 'str', label: 'Strength', abbr: 'STR' },
  { key: 'dex', label: 'Dexterity', abbr: 'DEX' },
  { key: 'con', label: 'Constitution', abbr: 'CON' },
  { key: 'int', label: 'Intelligence', abbr: 'INT' },
  { key: 'wis', label: 'Wisdom', abbr: 'WIS' },
  { key: 'cha', label: 'Charisma', abbr: 'CHA' },
] as const;

const SKILLS = [
  { key: 'acr', label: 'Acrobatics', ability: 'dex' },
  { key: 'ani', label: 'Animal Handling', ability: 'wis' },
  { key: 'arc', label: 'Arcana', ability: 'int' },
  { key: 'ath', label: 'Athletics', ability: 'str' },
  { key: 'dec', label: 'Deception', ability: 'cha' },
  { key: 'his', label: 'History', ability: 'int' },
  { key: 'ins', label: 'Insight', ability: 'wis' },
  { key: 'inv', label: 'Investigation', ability: 'int' },
  { key: 'itm', label: 'Intimidation', ability: 'cha' },
  { key: 'med', label: 'Medicine', ability: 'wis' },
  { key: 'nat', label: 'Nature', ability: 'int' },
  { key: 'per', label: 'Persuasion', ability: 'cha' },
  { key: 'prc', label: 'Perception', ability: 'wis' },
  { key: 'prf', label: 'Performance', ability: 'cha' },
  { key: 'rel', label: 'Religion', ability: 'int' },
  { key: 'slt', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'ste', label: 'Stealth', ability: 'dex' },
  { key: 'sur', label: 'Survival', ability: 'wis' },
] as const;

const CONDITION_ICONS: Record<string, string> = {
  blinded: '🚫', charmed: '💕', deafened: '🔇', exhaustion: '😴',
  frightened: '😱', grappled: '✊', incapacitated: '💫', invisible: '👻',
  paralyzed: '⚡', petrified: '🪨', poisoned: '☠', prone: '⬇',
  restrained: '🕸', stunned: '💢', unconscious: '💤',
};

const SPELL_LEVELS = ['Cantrips', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const SLOT_KEYS = ['', 'spell1', 'spell2', 'spell3', 'spell4', 'spell5', 'spell6', 'spell7', 'spell8', 'spell9'];

type SheetTab = 'core' | 'skills' | 'spells' | 'inventory' | 'features' | 'biography' | 'effects';

// ─── Props ───────────────────────────────────────────────────
interface CharacterSheetProps {
  actor: Actor;
  isOwner: boolean;
  isGM: boolean;
  onUpdate: (path: string, value: unknown) => void;
  onRoll: (formula: string, flavor: string) => void;
  onUseItem: (itemId: string) => void;
}

// ─── Inline Stat Editor ───────────────────────────────────────
const EditableNumber: React.FC<{
  value: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
  className?: string;
  disabled?: boolean;
}> = ({ value, min, max, onChange, className = '', disabled = false }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const n = parseInt(draft);
    if (!isNaN(n)) {
      const clamped = min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : n;
      onChange(clamped);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className={`inline-edit ${className}`}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        min={min}
        max={max}
      />
    );
  }

  return (
    <span
      className={`editable-num ${className} ${disabled ? '' : 'editable'}`}
      onDoubleClick={disabled ? undefined : () => { setDraft(String(value)); setEditing(true); }}
      title={disabled ? undefined : 'Double-click to edit'}
    >
      {value}
    </span>
  );
};

// ─── Ability Block ────────────────────────────────────────────
const AbilityBlock: React.FC<{
  label: string;
  abbr: string;
  abilityKey: string;
  data: DnD5eActorData;
  canEdit: boolean;
  onUpdate: (path: string, value: unknown) => void;
  onRoll: (formula: string, flavor: string) => void;
}> = ({ label, abbr, abilityKey, data, canEdit, onUpdate, onRoll }) => {
  const ability = data.abilities[abilityKey as keyof typeof data.abilities];
  const mod = ability?.mod ?? Math.floor(((ability?.value ?? 10) - 10) / 2);
  const save = ability?.save ?? mod;
  const modStr = mod >= 0 ? `+${mod}` : String(mod);
  const saveStr = save >= 0 ? `+${save}` : String(save);

  return (
    <div
      className="ability-block"
      onClick={() => onRoll(mod >= 0 ? `1d20+${mod}` : `1d20${mod}`, `${label} Check`)}
      title={`Click to roll ${label} check`}
    >
      <div className="ability-abbr">{abbr}</div>
      <div className="ability-mod">{modStr}</div>
      <EditableNumber
        value={ability?.value ?? 10}
        min={1} max={30}
        onChange={val => onUpdate(`data.abilities.${abilityKey}.value`, val)}
        className="ability-score"
        disabled={!canEdit}
      />
      <div
        className="ability-save"
        onClick={e => { e.stopPropagation(); onRoll(save >= 0 ? `1d20+${save}` : `1d20${save}`, `${label} Save`); }}
        title={`Roll ${label} Saving Throw`}
      >
        <span className={`save-prof ${ability?.proficient ? 'proficient' : ''}`} />
        <span className="save-val">{saveStr}</span>
      </div>
    </div>
  );
};

// ─── Skill Row ────────────────────────────────────────────────
const SkillRow: React.FC<{
  skillKey: string;
  label: string;
  ability: string;
  data: DnD5eActorData;
  canEdit: boolean;
  onUpdate: (path: string, value: unknown) => void;
  onRoll: (formula: string, flavor: string) => void;
}> = ({ skillKey, label, ability, data, canEdit, onUpdate, onRoll }) => {
  const skill = data.skills[skillKey as keyof typeof data.skills];
  const total = skill?.total ?? 0;
  const profLevel = skill?.value ?? 0;
  const totalStr = total >= 0 ? `+${total}` : String(total);

  const cycleProficiency = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const levels: Array<0 | 0.5 | 1 | 2> = [0, 0.5, 1, 2];
    const current = levels.indexOf(profLevel as 0 | 0.5 | 1 | 2);
    const next = levels[(current + 1) % levels.length];
    onUpdate(`data.skills.${skillKey}.value`, next);
  };

  return (
    <div
      className="skill-row"
      onClick={() => onRoll(total >= 0 ? `1d20+${total}` : `1d20${total}`, `${label} Check`)}
      title={`Roll ${label} (${ability.toUpperCase()}): ${totalStr}`}
    >
      <div
        className={`skill-prof prof-${profLevel === 0 ? 'none' : profLevel === 0.5 ? 'half' : profLevel === 1 ? 'full' : 'expert'}`}
        onClick={cycleProficiency}
        title={profLevel === 0 ? 'Not proficient' : profLevel === 0.5 ? 'Half proficiency' : profLevel === 1 ? 'Proficient' : 'Expertise'}
      />
      <span className="skill-label">{label}</span>
      <span className="skill-ability">{ability.toUpperCase()}</span>
      <span className="skill-bonus">{totalStr}</span>
      <span className="skill-passive" title="Passive score">({10 + total})</span>
    </div>
  );
};

// ─── Spell Slot Tracker ───────────────────────────────────────
const SpellSlotTracker: React.FC<{
  level: number;
  slotKey: string;
  data: DnD5eActorData;
  canEdit: boolean;
  onUpdate: (path: string, value: unknown) => void;
}> = ({ level, slotKey, data, canEdit, onUpdate }) => {
  if (!slotKey) return null;
  const slots = data.spells?.[slotKey as keyof typeof data.spells];
  if (!slots?.max) return null;

  const toggleSlot = (index: number) => {
    if (!canEdit) return;
    const newValue = index < slots.value ? index : index + 1;
    onUpdate(`data.spells.${slotKey}.value`, Math.max(0, Math.min(slots.max, newValue)));
  };

  return (
    <div className="spell-slot-row">
      <span className="slot-level">{SPELL_LEVELS[level]}</span>
      <div className="slot-pips">
        {Array.from({ length: slots.max }, (_, i) => (
          <div
            key={i}
            className={`slot-pip ${i < slots.value ? 'used' : 'available'}`}
            onClick={() => toggleSlot(i)}
          />
        ))}
      </div>
      <span className="slot-count">{slots.value}/{slots.max}</span>
    </div>
  );
};

// ─── Item Row ─────────────────────────────────────────────────
const ItemRow: React.FC<{
  item: Item;
  canEdit: boolean;
  onUse: () => void;
  onDelete: () => void;
}> = ({ item, canEdit, onUse, onDelete }) => {
  const data = item.data as {
    quantity?: number;
    weight?: number;
    equipped?: boolean;
    rarity?: string;
    description?: { value?: string };
    damage?: { parts?: Array<[string, string]> };
    range?: { value?: number; long?: number; units?: string };
    activation?: { type?: string; cost?: number };
  };

  const rarityColors: Record<string, string> = {
    common: '#c8cce0', uncommon: '#4aad78', rare: '#5b3fa0',
    'very rare': '#8060d0', legendary: '#c9a84c', artifact: '#c13a50',
  };

  return (
    <div className="item-row">
      <div className="item-img">{item.img ? <img src={item.img} alt="" /> : '📦'}</div>
      <div className="item-details">
        <div className="item-name" style={{ color: rarityColors[data.rarity ?? 'common'] }}>
          {item.name}
        </div>
        <div className="item-meta">
          {item.type}
          {data.damage?.parts?.[0] && ` · ${data.damage.parts[0][0]} ${data.damage.parts[0][1]}`}
          {data.range?.value && ` · ${data.range.value}/${data.range.long ?? data.range.value}${data.range.units ?? 'ft'}`}
        </div>
      </div>
      <div className="item-qty">
        {data.quantity !== undefined && (
          <span className="item-quantity">×{data.quantity}</span>
        )}
      </div>
      {data.equipped !== undefined && (
        <div className={`item-equipped ${data.equipped ? 'equipped' : ''}`} title={data.equipped ? 'Equipped' : 'Unequipped'}>
          {data.equipped ? '✓' : '○'}
        </div>
      )}
      <div className="item-actions">
        {data.activation?.type && (
          <button className="item-use-btn" onClick={onUse} title="Use item">
            {data.activation.type === 'action' ? 'A' : data.activation.type === 'bonus' ? 'B' : 'R'}
          </button>
        )}
        {canEdit && (
          <button className="item-del-btn" onClick={onDelete} title="Remove">×</button>
        )}
      </div>
    </div>
  );
};

// ─── Main Character Sheet ─────────────────────────────────────
export const CharacterSheet: React.FC<CharacterSheetProps> = ({
  actor,
  isOwner,
  isGM,
  onUpdate,
  onRoll,
  onUseItem,
}) => {
  const [activeTab, setActiveTab] = useState<SheetTab>('core');
  const canEdit = isOwner || isGM;

  const data = actor.data as DnD5eActorData;
  const details = data?.details;
  const attributes = data?.attributes;
  const hp = attributes?.hp;

  const profBonus = attributes?.prof ?? 2;
  const level = details?.xp
    ? getLevelFromXP(details.xp.value)
    : 1;

  const conditions = (actor.effects ?? [])
    .filter(e => !e.disabled && CONDITION_ICONS[e.label?.toLowerCase() ?? '']);

  const spellsByLevel = useMemo(() => {
    const grouped: Record<number, Item[]> = {};
    for (const item of actor.items ?? []) {
      if (item.type !== 'spell') continue;
      const spellLevel = (item.data as { level?: number }).level ?? 0;
      if (!grouped[spellLevel]) grouped[spellLevel] = [];
      grouped[spellLevel].push(item);
    }
    return grouped;
  }, [actor.items]);

  const inventoryItems = useMemo(() =>
    (actor.items ?? []).filter(i => i.type !== 'spell' && i.type !== 'feat' && i.type !== 'class'),
    [actor.items]
  );

  const features = useMemo(() =>
    (actor.items ?? []).filter(i => ['feat', 'class', 'subclass', 'background', 'race'].includes(i.type)),
    [actor.items]
  );

  return (
    <div className="character-sheet">
      {/* Header */}
      <div className="sheet-header">
        <div className="sheet-portrait">
          {actor.img
            ? <img src={actor.img} alt={actor.name} />
            : <span className="portrait-placeholder">🧙</span>
          }
          <div className="portrait-level" title="Character Level">
            <span className="level-num">{level}</span>
            <span className="level-label">LVL</span>
          </div>
        </div>
        <div className="sheet-identity">
          <div className="sheet-name">{actor.name}</div>
          <div className="sheet-class">
            {details?.background ? `${details.background} · ` : ''}
            {details?.race ?? 'Unknown Race'}
          </div>
          <div className="sheet-xp">
            {details?.xp && (
              <>
                <span>{details.xp.value.toLocaleString()} XP</span>
                <span className="xp-sep">·</span>
                <span>Next: {details.xp.max.toLocaleString()}</span>
              </>
            )}
          </div>

          {/* Conditions */}
          {conditions.length > 0 && (
            <div className="condition-list">
              {conditions.map(e => (
                <span key={e.id} className="condition-tag" title={e.label}>
                  {CONDITION_ICONS[e.label?.toLowerCase() ?? ''] ?? '⚠'} {e.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Core Resources */}
      <div className="core-resources">
        <div className="resource-block">
          <div className="res-label">HP</div>
          <div className="res-values">
            <EditableNumber
              value={hp?.value ?? 0}
              min={0} max={hp?.max}
              onChange={val => onUpdate('data.attributes.hp.value', val)}
              className="res-current"
              disabled={!canEdit}
            />
            <span className="res-sep">/</span>
            <EditableNumber
              value={hp?.max ?? 0}
              min={0}
              onChange={val => onUpdate('data.attributes.hp.max', val)}
              className="res-max"
              disabled={!canEdit}
            />
          </div>
          {(hp?.temp ?? 0) > 0 && (
            <div className="res-temp">+{hp?.temp} temp</div>
          )}
        </div>
        <div className="resource-block">
          <div className="res-label">AC</div>
          <div className="res-values">
            <EditableNumber
              value={attributes?.ac?.value ?? 10}
              min={0} max={30}
              onChange={val => onUpdate('data.attributes.ac.value', val)}
              className="res-current ac-val"
              disabled={!canEdit}
            />
          </div>
        </div>
        <div className="resource-block">
          <div className="res-label">Initiative</div>
          <div className="res-values">
            <span className="res-current">
              {(attributes?.init?.value ?? 0) >= 0 ? '+' : ''}
              {attributes?.init?.value ?? 0}
            </span>
          </div>
        </div>
        <div className="resource-block">
          <div className="res-label">Speed</div>
          <div className="res-values">
            <EditableNumber
              value={attributes?.speed?.value ?? 30}
              min={0}
              onChange={val => onUpdate('data.attributes.speed.value', val)}
              className="res-current"
              disabled={!canEdit}
            />
            <span className="res-unit">ft</span>
          </div>
        </div>
        <div className="resource-block">
          <div className="res-label">Prof</div>
          <div className="res-values">
            <span className="res-current">+{profBonus}</span>
          </div>
        </div>
      </div>

      {/* Death Saves (if HP = 0) */}
      {hp?.value === 0 && actor.type === 'character' && (
        <div className="death-saves">
          <div className="death-label">Death Saves</div>
          <div className="death-row">
            <span>Successes</span>
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className={`death-pip success ${i < (attributes?.death?.success ?? 0) ? 'filled' : ''}`}
                onClick={() => canEdit && onUpdate('data.attributes.death.success',
                  i < (attributes?.death?.success ?? 0) ? i : i + 1)}
              />
            ))}
          </div>
          <div className="death-row">
            <span>Failures</span>
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className={`death-pip failure ${i < (attributes?.death?.failure ?? 0) ? 'filled' : ''}`}
                onClick={() => canEdit && onUpdate('data.attributes.death.failure',
                  i < (attributes?.death?.failure ?? 0) ? i : i + 1)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="sheet-tabs">
        {(['core', 'skills', 'spells', 'inventory', 'features', 'biography'] as SheetTab[]).map(tab => (
          <button
            key={tab}
            className={`sheet-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="sheet-body">

        {/* CORE — Abilities */}
        {activeTab === 'core' && (
          <div className="tab-core">
            <div className="section-label">Ability Scores</div>
            <div className="abilities-grid">
              {ABILITIES.map(ab => (
                <AbilityBlock
                  key={ab.key}
                  label={ab.label}
                  abbr={ab.abbr}
                  abilityKey={ab.key}
                  data={data}
                  canEdit={canEdit}
                  onUpdate={onUpdate}
                  onRoll={onRoll}
                />
              ))}
            </div>

            <div className="section-label" style={{ marginTop: 12 }}>Senses</div>
            <div className="senses-row">
              <span>Passive Perception: <strong>{10 + (data.skills?.prc?.total ?? 0)}</strong></span>
              {(data.traits?.senses?.darkvision ?? 0) > 0 && (
                <span>Darkvision: <strong>{data.traits.senses.darkvision}ft</strong></span>
              )}
            </div>

            <div className="section-label" style={{ marginTop: 12 }}>Resources</div>
            {['primary', 'secondary', 'tertiary'].map(r => {
              const res = data.resources?.[r as keyof typeof data.resources];
              if (!res?.max) return null;
              return (
                <div key={r} className="resource-row-custom">
                  <span className="res-row-label">{res.label || r}</span>
                  <EditableNumber
                    value={res.value}
                    min={0} max={res.max}
                    onChange={val => onUpdate(`data.resources.${r}.value`, val)}
                    disabled={!canEdit}
                    className="res-row-val"
                  />
                  <span className="res-row-sep">/</span>
                  <span className="res-row-max">{res.max}</span>
                  <div className="res-row-pips">
                    {Array.from({ length: Math.min(res.max, 10) }, (_, i) => (
                      <div key={i} className={`res-pip ${i < res.value ? 'filled' : ''}`}
                        onClick={() => canEdit && onUpdate(`data.resources.${r}.value`, i < res.value ? i : i + 1)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SKILLS */}
        {activeTab === 'skills' && (
          <div className="tab-skills">
            <div className="skills-header">
              <span>Skill</span>
              <span>Ability</span>
              <span>Bonus</span>
              <span>Passive</span>
            </div>
            {SKILLS.map(sk => (
              <SkillRow
                key={sk.key}
                skillKey={sk.key}
                label={sk.label}
                ability={sk.ability}
                data={data}
                canEdit={canEdit}
                onUpdate={onUpdate}
                onRoll={onRoll}
              />
            ))}
          </div>
        )}

        {/* SPELLS */}
        {activeTab === 'spells' && (
          <div className="tab-spells">
            <div className="spell-meta">
              <div className="spell-meta-item">
                <span>Spellcasting</span>
                <strong>{attributes?.spellcasting?.toUpperCase() || 'None'}</strong>
              </div>
              <div className="spell-meta-item">
                <span>Save DC</span>
                <strong>{attributes?.spelldc ?? '—'}</strong>
              </div>
              <div className="spell-meta-item">
                <span>Attack</span>
                <strong>
                  {attributes?.spellcasting
                    ? `+${(data.abilities[attributes.spellcasting]?.mod ?? 0) + profBonus}`
                    : '—'}
                </strong>
              </div>
            </div>

            <div className="spell-slots">
              {SLOT_KEYS.map((key, level) => (
                <SpellSlotTracker
                  key={level}
                  level={level}
                  slotKey={key}
                  data={data}
                  canEdit={canEdit}
                  onUpdate={onUpdate}
                />
              ))}
            </div>

            {Object.entries(spellsByLevel).map(([level, spells]) => (
              <div key={level} className="spell-level-group">
                <div className="spell-level-header">
                  {SPELL_LEVELS[Number(level)]}
                  <span className="spell-count">{spells.length}</span>
                </div>
                {spells.map(spell => (
                  <ItemRow
                    key={spell.id}
                    item={spell}
                    canEdit={canEdit}
                    onUse={() => onUseItem(spell.id)}
                    onDelete={() => onUpdate('items', actor.items?.filter(i => i.id !== spell.id))}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* INVENTORY */}
        {activeTab === 'inventory' && (
          <div className="tab-inventory">
            <div className="currency-row">
              {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map(coin => (
                <div key={coin} className="coin-block">
                  <EditableNumber
                    value={data.currency?.[coin] ?? 0}
                    min={0}
                    onChange={val => onUpdate(`data.currency.${coin}`, val)}
                    disabled={!canEdit}
                    className="coin-value"
                  />
                  <span className="coin-label">{coin.toUpperCase()}</span>
                </div>
              ))}
            </div>

            <div className="inventory-weight">
              Carrying: {inventoryItems.reduce((sum, i) => sum + (((i.data as { weight?: number; quantity?: number }).weight ?? 0) * ((i.data as { quantity?: number }).quantity ?? 1)), 0).toFixed(1)} / {(data.abilities?.str?.value ?? 10) * 15} lbs
            </div>

            {inventoryItems.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                canEdit={canEdit}
                onUse={() => onUseItem(item.id)}
                onDelete={() => onUpdate('items', actor.items?.filter(i => i.id !== item.id))}
              />
            ))}
          </div>
        )}

        {/* FEATURES */}
        {activeTab === 'features' && (
          <div className="tab-features">
            {features.map(feat => {
              const d = feat.data as { description?: { value?: string }; requirements?: string };
              return (
                <div key={feat.id} className="feature-entry">
                  <div className="feature-name">{feat.name}</div>
                  {d.requirements && <div className="feature-source">{d.requirements}</div>}
                  {d.description?.value && (
                    <div
                      className="feature-desc"
                      dangerouslySetInnerHTML={{ __html: d.description.value }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* BIOGRAPHY */}
        {activeTab === 'biography' && (
          <div className="tab-bio">
            {([
              ['Personality Traits', 'trait'],
              ['Ideals', 'ideal'],
              ['Bonds', 'bond'],
              ['Flaws', 'flaw'],
              ['Appearance', 'appearance'],
            ] as const).map(([label, key]) => (
              <div key={key} className="bio-section">
                <div className="bio-label">{label}</div>
                <textarea
                  className="bio-textarea"
                  value={details?.[key] ?? ''}
                  onChange={e => onUpdate(`data.details.${key}`, e.target.value)}
                  disabled={!canEdit}
                  rows={2}
                  placeholder={`${label}...`}
                />
              </div>
            ))}
            <div className="bio-section">
              <div className="bio-label">Biography</div>
              <textarea
                className="bio-textarea"
                value={details?.biography?.value ?? ''}
                onChange={e => onUpdate('data.details.biography.value', e.target.value)}
                disabled={!canEdit}
                rows={6}
                placeholder="Character backstory..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function getLevelFromXP(xp: number): number {
  const thresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  return thresholds.filter(t => xp >= t).length;
}

export default CharacterSheet;
