// ============================================================
// CombatTracker — Initiative order, turn management, HP tracking
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import type { Combat, Combatant, Actor } from '@mythicforge/shared';
import { roll } from '@mythicforge/dice-engine';

// ─── Types ───────────────────────────────────────────────────
interface CombatTrackerProps {
  combat: Combat | null;
  actors: Map<string, Actor>;
  isGM: boolean;
  userId: string;
  onNextTurn: () => void;
  onPrevTurn: () => void;
  onRollInitiative: (combatantId: string) => void;
  onRollAllInitiative: () => void;
  onUpdateHP: (actorId: string, delta: number) => void;
  onToggleDefeated: (combatantId: string) => void;
  onRemoveCombatant: (combatantId: string) => void;
  onEndCombat: () => void;
}

interface CombatantRowProps {
  combatant: Combatant;
  actor: Actor | undefined;
  isActive: boolean;
  isGM: boolean;
  isOwner: boolean;
  onRollInit: () => void;
  onUpdateHP: (delta: number) => void;
  onToggleDefeated: () => void;
  onRemove: () => void;
}

// ─── HP Editor ───────────────────────────────────────────────
const HPEditor: React.FC<{
  current: number;
  max: number;
  temp: number;
  onChange: (delta: number) => void;
}> = ({ current, max, temp, onChange }) => {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'dmg' | 'heal'>('dmg');

  const pct = Math.max(0, Math.min(1, current / max));
  const hpColor = pct > 0.5 ? '#4aad78' : pct > 0.25 ? '#e09040' : '#e04040';

  const apply = () => {
    const val = parseInt(input);
    if (isNaN(val) || val <= 0) return;
    onChange(mode === 'dmg' ? -val : val);
    setInput('');
  };

  return (
    <div className="hp-editor">
      <div className="hp-display">
        <span className="hp-current" style={{ color: hpColor }}>{current}</span>
        <span className="hp-sep">/</span>
        <span className="hp-max">{max}</span>
        {temp > 0 && <span className="hp-temp">+{temp}</span>}
      </div>
      <div className="hp-bar-outer">
        <div className="hp-bar-fill" style={{ width: `${pct * 100}%`, background: hpColor }} />
      </div>
      <div className="hp-controls">
        <button
          className={`hp-mode-btn ${mode === 'dmg' ? 'active-dmg' : ''}`}
          onClick={() => setMode('dmg')}
        >⚔</button>
        <input
          type="number"
          className="hp-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && apply()}
          placeholder="0"
          min="0"
        />
        <button
          className={`hp-mode-btn ${mode === 'heal' ? 'active-heal' : ''}`}
          onClick={() => setMode('heal')}
        >+</button>
        <button className="hp-apply-btn" onClick={apply}>Apply</button>
      </div>
    </div>
  );
};

// ─── Combatant Row ───────────────────────────────────────────
const CombatantRow: React.FC<CombatantRowProps> = ({
  combatant,
  actor,
  isActive,
  isGM,
  isOwner,
  onRollInit,
  onUpdateHP,
  onToggleDefeated,
  onRemove,
}) => {
  const [expanded, setExpanded] = useState(false);

  const actorData = actor?.data as {
    attributes?: { hp?: { value: number; max: number; temp?: number }; ac?: { value: number } };
    abilities?: { dex?: { mod?: number } };
  } | undefined;

  const hp = actorData?.attributes?.hp;
  const ac = actorData?.attributes?.ac?.value ?? '—';

  const hpPct = hp ? Math.max(0, Math.min(1, hp.value / hp.max)) : 1;
  const hpColor = hpPct > 0.5 ? '#4aad78' : hpPct > 0.25 ? '#e09040' : '#e04040';

  const canEdit = isGM || isOwner;
  const showHP = isGM || isOwner || !combatant.hidden;

  return (
    <div className={`combatant-row ${isActive ? 'active-turn' : ''} ${combatant.defeated ? 'defeated' : ''}`}>
      {/* Initiative Badge */}
      <div
        className={`init-badge ${isActive ? 'active' : ''}`}
        onClick={canEdit ? onRollInit : undefined}
        title={canEdit ? 'Click to reroll initiative' : undefined}
      >
        {combatant.initiative !== null
          ? Math.floor(combatant.initiative)
          : <span className="init-unknown">?</span>
        }
      </div>

      {/* Token Image */}
      <div className="comb-avatar" style={{ backgroundImage: `url(${combatant.img})` }}>
        {!combatant.img && <span className="comb-emoji">⚔</span>}
      </div>

      {/* Info */}
      <div className="comb-info" onClick={() => setExpanded(!expanded)}>
        <div className="comb-name">
          {combatant.hidden && isGM && <span className="hidden-indicator" title="Hidden">👁</span>}
          {combatant.name}
          {!isGM && combatant.hidden && <span className="comb-name-unknown">Unknown</span>}
        </div>

        {showHP && hp && (
          <div className="comb-hp-bar">
            <div className="comb-hp-fill" style={{ width: `${hpPct * 100}%`, background: hpColor }} />
          </div>
        )}
      </div>

      {/* AC */}
      <div className="comb-ac" title="Armor Class">
        <span className="ac-icon">🛡</span>
        {isGM || isOwner ? ac : '—'}
      </div>

      {/* Quick Actions */}
      {canEdit && (
        <div className="comb-quick-actions">
          <button
            className="quick-btn dmg"
            onClick={() => onUpdateHP(-5)}
            title="Apply 5 damage"
          >-5</button>
          <button
            className="quick-btn heal"
            onClick={() => onUpdateHP(5)}
            title="Heal 5 HP"
          >+5</button>
          {isGM && (
            <button
              className="quick-btn defeat"
              onClick={onToggleDefeated}
              title={combatant.defeated ? 'Mark alive' : 'Mark defeated'}
            >
              {combatant.defeated ? '↩' : '☠'}
            </button>
          )}
        </div>
      )}

      {/* Expanded HP Editor */}
      {expanded && canEdit && hp && (
        <div className="comb-expanded">
          <HPEditor
            current={hp.value}
            max={hp.max}
            temp={hp.temp ?? 0}
            onChange={onUpdateHP}
          />
          {isGM && (
            <div className="comb-gm-tools">
              <button className="gm-tool-btn" onClick={onToggleDefeated}>
                {combatant.defeated ? 'Revive' : 'Mark Defeated'}
              </button>
              <button className="gm-tool-btn danger" onClick={onRemove}>
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Round Timer ─────────────────────────────────────────────
const RoundTimer: React.FC<{ round: number; elapsedSeconds: number }> = ({ round, elapsedSeconds }) => {
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  // In D&D 5e, 1 round = 6 seconds
  const inGameTime = round * 6;
  const inGameMins = Math.floor(inGameTime / 60);
  const inGameSecs = inGameTime % 60;

  return (
    <div className="round-timer">
      <div className="round-number">
        <span className="round-label">ROUND</span>
        <span className="round-value">{round}</span>
      </div>
      <div className="round-time">
        <span className="time-real" title="Real time elapsed">
          ⏱ {mins}:{String(secs).padStart(2, '0')}
        </span>
        <span className="time-ingame" title="In-game time elapsed">
          ⚔ {inGameMins > 0 ? `${inGameMins}m ` : ''}{inGameSecs}s
        </span>
      </div>
    </div>
  );
};

// ─── Main Combat Tracker ──────────────────────────────────────
export const CombatTracker: React.FC<CombatTrackerProps> = ({
  combat,
  actors,
  isGM,
  userId,
  onNextTurn,
  onPrevTurn,
  onRollInitiative,
  onRollAllInitiative,
  onUpdateHP,
  onToggleDefeated,
  onRemoveCombatant,
  onEndCombat,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sortMode, setSortMode] = useState<'initiative' | 'manual'>('initiative');

  // Sort combatants by initiative (desc), then by name
  const sortedCombatants = useMemo(() => {
    if (!combat) return [];
    const list = [...combat.combatants];
    if (sortMode === 'initiative') {
      list.sort((a, b) => {
        if (a.initiative === null && b.initiative === null) return a.name.localeCompare(b.name);
        if (a.initiative === null) return 1;
        if (b.initiative === null) return -1;
        if (b.initiative !== a.initiative) return b.initiative - a.initiative;
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [combat, sortMode]);

  const activeCombatant = useMemo(() => {
    if (!combat || !sortedCombatants.length) return null;
    return sortedCombatants[combat.turn] ?? null;
  }, [combat, sortedCombatants]);

  const handleRollAllInitiative = useCallback(() => {
    if (!combat) return;
    const unrolled = combat.combatants.filter(c => !c.hasRolled);
    unrolled.forEach(c => {
      onRollInitiative(c.id);
    });
  }, [combat, onRollInitiative]);

  // Quick damage dialog
  const [damageDialog, setDamageDialog] = useState<{
    combatantId: string;
    name: string;
    actorId: string;
  } | null>(null);

  if (!combat || !combat.active) {
    return (
      <div className="combat-empty">
        <div className="combat-empty-icon">⚔</div>
        <div className="combat-empty-title">No Active Combat</div>
        <div className="combat-empty-sub">
          Select tokens and click "Begin Combat" to start initiative tracking
        </div>
        {isGM && (
          <button className="begin-combat-btn" onClick={() => {}}>
            Begin Combat
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="combat-tracker">
      {/* Header */}
      <RoundTimer round={combat.round} elapsedSeconds={elapsedSeconds} />

      {/* Turn Controls */}
      <div className="turn-controls">
        <button
          className="turn-btn prev"
          onClick={onPrevTurn}
          disabled={combat.round <= 1 && combat.turn <= 0}
          title="Previous Turn"
        >◀ Prev</button>

        <div className="active-combatant-label">
          {activeCombatant ? (
            <>
              <span className="act-icon">⚔</span>
              <span className="act-name">{activeCombatant.name}</span>
            </>
          ) : '—'}
        </div>

        <button
          className="turn-btn next"
          onClick={onNextTurn}
          title="Next Turn (Ctrl+N)"
        >Next ▶</button>
      </div>

      {/* GM Actions */}
      {isGM && (
        <div className="gm-combat-actions">
          <button className="gm-action-btn" onClick={handleRollAllInitiative} title="Roll initiative for all un-rolled combatants">
            🎲 Roll All
          </button>
          <button className="gm-action-btn" onClick={onRollAllInitiative} title="Re-roll all initiative">
            🔄 Re-roll
          </button>
          <button className="gm-action-btn" onClick={() => setSortMode(m => m === 'initiative' ? 'manual' : 'initiative')}>
            {sortMode === 'initiative' ? '📋 Manual Sort' : '📊 Auto Sort'}
          </button>
          <button className="gm-action-btn danger" onClick={onEndCombat} title="End combat">
            ✗ End
          </button>
        </div>
      )}

      {/* Combatant List */}
      <div className="combatant-list">
        {sortedCombatants.length === 0 && (
          <div className="no-combatants">No combatants. Drag tokens to the tracker or click Add.</div>
        )}

        {sortedCombatants.map((combatant, index) => {
          const actor = actors.get(combatant.actorId);
          const isActive = index === combat.turn;
          const isOwner = actor?.ownership?.[userId] === 3;

          // GM can see everything; players see their own tokens and non-hidden others
          if (combatant.hidden && !isGM && !isOwner) return null;

          return (
            <CombatantRow
              key={combatant.id}
              combatant={combatant}
              actor={actor}
              isActive={isActive}
              isGM={isGM}
              isOwner={isOwner}
              onRollInit={() => onRollInitiative(combatant.id)}
              onUpdateHP={delta => onUpdateHP(combatant.actorId, delta)}
              onToggleDefeated={() => onToggleDefeated(combatant.id)}
              onRemove={() => onRemoveCombatant(combatant.id)}
            />
          );
        })}
      </div>

      {/* Encounter Summary (GM only) */}
      {isGM && (
        <div className="encounter-summary">
          <div className="summary-row">
            <span>Alive</span>
            <span>{sortedCombatants.filter(c => !c.defeated).length}</span>
          </div>
          <div className="summary-row">
            <span>Defeated</span>
            <span>{sortedCombatants.filter(c => c.defeated).length}</span>
          </div>
          <div className="summary-row">
            <span>Players</span>
            <span>
              {sortedCombatants.filter(c => {
                const a = actors.get(c.actorId);
                return a?.type === 'character';
              }).length}
            </span>
          </div>
        </div>
      )}

      <style>{`
        .combat-tracker { display: flex; flex-direction: column; height: 100%; }
        .round-timer { display: flex; align-items: center; justify-content: space-between;
          padding: 8px 12px; border-bottom: 1px solid #2a2f45; background: #0f1117; }
        .round-number { display: flex; flex-direction: column; align-items: center; }
        .round-label { font-family: 'Cinzel', serif; font-size: 9px; letter-spacing: 1px; color: #555e78; }
        .round-value { font-family: 'Cinzel', serif; font-size: 22px; font-weight: 700; color: #c9a84c; line-height: 1; }
        .round-time { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .time-real, .time-ingame { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #555e78; }
        .turn-controls { display: flex; align-items: center; gap: 6px; padding: 8px;
          border-bottom: 1px solid #2a2f45; }
        .turn-btn { background: none; border: 1px solid #2a2f45; color: #8890a8; padding: 5px 10px;
          border-radius: 3px; cursor: pointer; font-family: 'Cinzel', serif; font-size: 11px;
          transition: all .15s; flex-shrink: 0; }
        .turn-btn:hover:not(:disabled) { border-color: #c9a84c; color: #c9a84c; }
        .turn-btn:disabled { opacity: .4; cursor: not-allowed; }
        .turn-btn.next { border-color: #c9a84c33; }
        .active-combatant-label { flex: 1; text-align: center; font-family: 'Cinzel', serif;
          font-size: 12px; color: #c9a84c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .act-icon { margin-right: 4px; }
        .gm-combat-actions { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px;
          border-bottom: 1px solid #2a2f45; }
        .gm-action-btn { background: none; border: 1px solid #2a2f45; color: #8890a8; padding: 4px 8px;
          border-radius: 3px; cursor: pointer; font-size: 11px; transition: all .12s; }
        .gm-action-btn:hover { border-color: #c9a84c; color: #c9a84c; }
        .gm-action-btn.danger:hover { border-color: #c13a50; color: #c13a50; }
        .combatant-list { flex: 1; overflow-y: auto; padding: 6px; }
        .combatant-list::-webkit-scrollbar { width: 3px; }
        .combatant-list::-webkit-scrollbar-thumb { background: #2a2f45; border-radius: 2px; }
        .combatant-row { display: flex; align-items: center; gap: 6px; padding: 5px 6px;
          border: 1px solid transparent; border-radius: 4px; margin-bottom: 3px;
          cursor: pointer; transition: all .12s; flex-wrap: wrap; }
        .combatant-row:hover { background: #1a1d28; border-color: #2a2f45; }
        .combatant-row.active-turn { background: rgba(201,168,76,.07); border-color: #a07830; }
        .combatant-row.defeated { opacity: .35; }
        .init-badge { width: 30px; height: 30px; border-radius: 50%; background: #1a1d28;
          border: 1px solid #2a2f45; display: flex; align-items: center; justify-content: center;
          font-family: 'Cinzel', serif; font-size: 12px; font-weight: 700; color: #8890a8;
          flex-shrink: 0; cursor: pointer; transition: all .12s; }
        .init-badge.active { border-color: #c9a84c; color: #c9a84c; background: rgba(201,168,76,.12); }
        .init-badge:hover { border-color: #c9a84c44; }
        .init-unknown { color: #555e78; font-size: 16px; }
        .comb-avatar { width: 28px; height: 28px; border-radius: 50%; background: #1f2335;
          border: 1.5px solid #2a2f45; flex-shrink: 0; background-size: cover; background-position: center;
          display: flex; align-items: center; justify-content: center; }
        .comb-emoji { font-size: 14px; }
        .comb-info { flex: 1; min-width: 0; }
        .comb-name { font-family: 'Cinzel', serif; font-size: 11px; color: #c8cce0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hidden-indicator { margin-right: 4px; font-size: 10px; opacity: .6; }
        .comb-hp-bar { height: 3px; background: #0a0b0e; border-radius: 2px; margin-top: 3px; overflow: hidden; }
        .comb-hp-fill { height: 100%; border-radius: 2px; transition: width .3s; }
        .comb-ac { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #8890a8;
          display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .ac-icon { font-size: 10px; }
        .comb-quick-actions { display: flex; gap: 3px; flex-shrink: 0; }
        .quick-btn { width: 24px; height: 20px; border-radius: 3px; border: 1px solid #2a2f45;
          background: none; font-size: 10px; cursor: pointer; transition: all .1s;
          display: flex; align-items: center; justify-content: center; color: #8890a8; }
        .quick-btn.dmg:hover { border-color: #c13a50; color: #c13a50; }
        .quick-btn.heal:hover { border-color: #4aad78; color: #4aad78; }
        .quick-btn.defeat:hover { border-color: #8890a8; }
        .comb-expanded { width: 100%; padding: 8px 6px 4px; border-top: 1px solid #2a2f45; margin-top: 4px; }
        .hp-editor { display: flex; flex-direction: column; gap: 6px; }
        .hp-display { display: flex; align-items: baseline; gap: 3px; font-family: 'Cinzel', serif; }
        .hp-current { font-size: 18px; font-weight: 700; }
        .hp-sep { color: #555e78; }
        .hp-max { font-size: 13px; color: #555e78; }
        .hp-temp { font-size: 11px; color: #2dc4b0; margin-left: 4px; }
        .hp-bar-outer { height: 5px; background: #0a0b0e; border-radius: 3px; overflow: hidden; }
        .hp-bar-fill { height: 100%; border-radius: 3px; transition: width .3s; }
        .hp-controls { display: flex; gap: 4px; align-items: center; }
        .hp-mode-btn { width: 24px; height: 24px; border: 1px solid #2a2f45; background: none;
          color: #8890a8; border-radius: 3px; cursor: pointer; font-size: 12px; transition: all .1s; }
        .hp-mode-btn.active-dmg { border-color: #c13a50; color: #c13a50; }
        .hp-mode-btn.active-heal { border-color: #4aad78; color: #4aad78; }
        .hp-input { flex: 1; background: #0f1117; border: 1px solid #2a2f45; color: #c8cce0;
          padding: 3px 6px; border-radius: 3px; font-size: 12px; font-family: 'JetBrains Mono', monospace;
          outline: none; text-align: center; }
        .hp-input:focus { border-color: #c9a84c; }
        .hp-apply-btn { background: rgba(201,168,76,.1); border: 1px solid #a07830; color: #c9a84c;
          padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
          font-family: 'Cinzel', serif; transition: all .12s; }
        .hp-apply-btn:hover { background: rgba(201,168,76,.2); }
        .comb-gm-tools { display: flex; gap: 4px; margin-top: 6px; }
        .gm-tool-btn { flex: 1; background: none; border: 1px solid #2a2f45; color: #8890a8;
          padding: 4px; border-radius: 3px; cursor: pointer; font-size: 11px; transition: all .12s; }
        .gm-tool-btn:hover { border-color: #c9a84c; color: #c9a84c; }
        .gm-tool-btn.danger:hover { border-color: #c13a50; color: #c13a50; }
        .encounter-summary { padding: 8px 12px; border-top: 1px solid #2a2f45;
          background: #0f1117; margin-top: auto; }
        .summary-row { display: flex; justify-content: space-between; font-size: 11px;
          color: #555e78; padding: 2px 0; font-family: 'JetBrains Mono', monospace; }
        .combat-empty { display: flex; flex-direction: column; align-items: center;
          justify-content: center; height: 100%; gap: 10px; color: #555e78; text-align: center; padding: 24px; }
        .combat-empty-icon { font-size: 36px; opacity: .4; }
        .combat-empty-title { font-family: 'Cinzel', serif; font-size: 14px; color: #8890a8; }
        .combat-empty-sub { font-size: 12px; line-height: 1.5; }
        .begin-combat-btn { background: rgba(201,168,76,.1); border: 1px solid #a07830;
          color: #c9a84c; padding: 8px 20px; border-radius: 4px; cursor: pointer;
          font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: .5px; margin-top: 8px;
          transition: all .15s; }
        .begin-combat-btn:hover { background: rgba(201,168,76,.2); }
        .no-combatants { text-align: center; color: #555e78; font-size: 12px; padding: 16px; }
      `}</style>
    </div>
  );
};

export default CombatTracker;
