// ============================================================
// Topbar — Tool selector, session info, GM HUD
// ============================================================

import React from 'react';
import type { CanvasTool } from '../../stores/useStore';
import type { Session } from '@mythicforge/shared';

interface TopbarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  isGM: boolean;
  session: Session | null;
  connectionState: string;
  onNextTurn: () => void;
  onRollInitiative: () => void;
}

const TOOLS: { id: CanvasTool; label: string; key: string; gmOnly?: boolean }[] = [
  { id: 'select',  label: 'Select',  key: 'S' },
  { id: 'token',   label: 'Token',   key: 'T',  gmOnly: true },
  { id: 'measure', label: 'Measure', key: 'M' },
  { id: 'draw',    label: 'Draw',    key: 'D' },
  { id: 'fog',     label: 'Fog',     key: 'F',  gmOnly: true },
  { id: 'light',   label: 'Light',   key: 'L',  gmOnly: true },
  { id: 'wall',    label: 'Walls',   key: 'W',  gmOnly: true },
  { id: 'note',    label: 'Notes',   key: 'N' },
];

const STATE_COLORS: Record<string, string> = {
  connected:    '#4aad78',
  reconnecting: '#e09040',
  disconnected: '#e04040',
  connecting:   '#8890a8',
};

export const Topbar: React.FC<TopbarProps> = ({
  activeTool, onToolChange, isGM, session, connectionState, onNextTurn, onRollInitiative,
}) => {
  const visibleTools = TOOLS.filter(t => !t.gmOnly || isGM);

  return (
    <div style={{
      height: 40, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)',
      display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6,
      flexShrink: 0, zIndex: 100, userSelect: 'none',
    }}>
      {/* Logo */}
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
        color: 'var(--gold-bright)', letterSpacing: 2, marginRight: 8, flexShrink: 0,
      }}>
        ⚔ MYTHICFORGE
      </div>

      {/* Tool Buttons */}
      <div style={{ display: 'flex', gap: 3 }}>
        {visibleTools.map(tool => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            title={`${tool.label} (${tool.key})`}
            style={{
              background: activeTool === tool.id ? 'rgba(201,168,76,.12)' : 'none',
              border: `1px solid ${activeTool === tool.id ? 'var(--gold-default)' : 'var(--border-default)'}`,
              color: activeTool === tool.id ? 'var(--gold-bright)' : 'var(--text-secondary)',
              padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.5px',
              transition: 'all .12s',
            }}
          >
            {tool.label}
          </button>
        ))}
      </div>

      {/* GM Combat Controls */}
      {isGM && (
        <>
          <div style={{ width: 1, height: 20, background: 'var(--border-default)', margin: '0 6px' }} />
          <button
            onClick={onRollInitiative}
            style={{
              background: 'none', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', padding: '3px 10px', borderRadius: 3,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 11,
              letterSpacing: '.5px', transition: 'all .12s',
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--gold-default)'; (e.target as HTMLButtonElement).style.color = 'var(--gold-bright)'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
          >
            🎲 Roll Initiative
          </button>
          <button
            onClick={onNextTurn}
            style={{
              background: 'rgba(201,168,76,.08)', border: '1px solid var(--gold-default)',
              color: 'var(--gold-bright)', padding: '3px 10px', borderRadius: 3,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 11,
              letterSpacing: '.5px', transition: 'all .12s',
            }}
          >
            ⏭ Next Turn
          </button>
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Session Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: STATE_COLORS[connectionState] ?? '#888',
            boxShadow: `0 0 5px ${STATE_COLORS[connectionState] ?? '#888'}`,
          }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            {session?.name ?? 'No Session'}
          </span>
        </div>
        <span>|</span>
        <span>{session?.users?.length ?? 0} Players</span>
      </div>
    </div>
  );
};

export default Topbar;
