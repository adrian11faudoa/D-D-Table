// ============================================================
// UI Components — StatusBar, NotificationStack, FloatingSheets,
//                 DiceRoller, ContextMenu, LoginScreen
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../../stores/useStore';
import { useFPS, useSessionTimer } from '../../hooks/useSessionTimer';
import { roll, rollAdvantage, rollDisadvantage } from '@mythicforge/dice-engine';
import type { NetworkClient } from '@mythicforge/network';

// ─── StatusBar ────────────────────────────────────────────────
export const StatusBar: React.FC = () => {
  const { activeScene, connectedUsers, ping, zoom, activeTool } = useStore();
  const fps = useFPS();
  const { formatted: sessionTime } = useSessionTimer();

  return (
    <div style={{
      height: 22, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-default)',
      display: 'flex', alignItems: 'center', padding: '0 12px', gap: 16,
      flexShrink: 0, fontSize: 10, color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
    }}>
      <span>👥 {connectedUsers.length} online</span>
      {activeScene && (
        <span>🗺 {activeScene.name} · {activeScene.grid.scale}/cell</span>
      )}
      <span>🔧 {activeTool}</span>
      <span>🔍 {Math.round(zoom * 100)}%</span>
      <span style={{ marginLeft: 'auto' }}>⏱ {sessionTime}</span>
      <span style={{ color: fps < 30 ? 'var(--text-error)' : 'var(--text-muted)' }}>
        {fps} fps
      </span>
      {ping > 0 && (
        <span style={{ color: ping > 200 ? 'var(--text-warning)' : 'var(--text-muted)' }}>
          📶 {ping}ms
        </span>
      )}
    </div>
  );
};

// ─── NotificationStack ────────────────────────────────────────
export const NotificationStack: React.FC = () => {
  const { notifications, removeNotification } = useStore();

  return (
    <div style={{
      position: 'fixed', top: 50, right: 16, zIndex: 300,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      {notifications.slice(-5).map(n => (
        <div
          key={n.id}
          onClick={() => removeNotification(n.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', background: 'var(--bg-elevated)',
            border: `1px solid ${n.type === 'error' ? 'var(--crimson-default)' : n.type === 'success' ? 'var(--teal-default)' : n.type === 'warning' ? 'var(--amber-default)' : 'var(--border-strong)'}`,
            borderLeft: `3px solid ${n.type === 'error' ? 'var(--crimson-bright)' : n.type === 'success' ? 'var(--teal-bright)' : n.type === 'warning' ? 'var(--amber-bright)' : 'var(--gold-bright)'}`,
            borderRadius: 5, fontSize: 12, color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-md)', pointerEvents: 'auto', cursor: 'pointer',
            maxWidth: 320, animation: 'slideInRight .2s ease',
          }}
        >
          <span>{n.type === 'error' ? '✗' : n.type === 'success' ? '✓' : n.type === 'warning' ? '⚠' : 'ℹ'}</span>
          <span style={{ flex: 1 }}>{n.message}</span>
        </div>
      ))}
    </div>
  );
};

// ─── FloatingSheets ───────────────────────────────────────────
export const FloatingSheets: React.FC<{ isGM: boolean; userId: string }> = ({ isGM, userId }) => {
  const { openSheets, closeSheet, actors } = useStore();
  // Floating sheets are rendered as lightweight overlays
  if (openSheets.length === 0) return null;

  return (
    <>
      {openSheets.map((actorId, i) => {
        const actor = actors.get(actorId);
        if (!actor) return null;
        return (
          <div
            key={actorId}
            style={{
              position: 'fixed', top: 60 + i * 30, left: 60 + i * 30,
              width: 480, height: 600, zIndex: 150 + i,
              background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
              borderRadius: 8, boxShadow: 'var(--shadow-lg)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', padding: '8px 12px',
              background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)',
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--gold-bright)', flex: 1 }}>
                {actor.name}
              </span>
              <button
                onClick={() => closeSheet(actorId)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
              >×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              Actor: {actor.name} (full sheet — use RightPanel for editing)
            </div>
          </div>
        );
      })}
    </>
  );
};

// ─── DiceRoller ───────────────────────────────────────────────
const DICE = ['d4','d6','d8','d10','d12','d20','d100'];

export const DiceRoller: React.FC<{ network: NetworkClient | null; userId: string }> = ({ network, userId }) => {
  const [visible, setVisible] = useState(false);
  const [formula, setFormula] = useState('1d20');
  const [history, setHistory] = useState<Array<{ formula: string; total: number; crit: boolean; fail: boolean }>>([]);
  const { addMessage } = useStore();

  const doRoll = useCallback((f: string) => {
    try {
      const result = roll(f);
      const isCrit = result.terms.some(t => t.type === 'die' && t.faces === 20 && t.results.some(r => r.active && r.result === 20));
      const isFail = result.terms.some(t => t.type === 'die' && t.faces === 20 && t.results.some(r => r.active && r.result === 1));
      setHistory(h => [{ formula: f, total: result.total, crit: isCrit, fail: isFail }, ...h].slice(0, 8));
      network?.emit('dice:roll', { formula: f, result, rollMode: 'publicroll' });
      addMessage({
        id: crypto.randomUUID() as import('@mythicforge/shared').UUID,
        sessionId: '' as import('@mythicforge/shared').UUID,
        type: 'roll', content: '',
        speaker: { userId: userId as import('@mythicforge/shared').UUID, alias: 'You' },
        roll: result,
        timestamp: Date.now() as import('@mythicforge/shared').Timestamp,
        flags: {},
      });
    } catch (e) {
      console.error('Roll error:', e);
    }
  }, [network, userId, addMessage]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'r') { e.preventDefault(); setVisible(v => !v); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!visible) return (
    <button
      onClick={() => setVisible(true)}
      style={{
        position: 'fixed', bottom: 32, right: 16, zIndex: 100,
        width: 44, height: 44, borderRadius: '50%', fontSize: 22,
        background: 'var(--bg-elevated)', border: '1px solid var(--gold-default)',
        cursor: 'pointer', boxShadow: 'var(--shadow-gold)', transition: 'all .15s',
      }}
      title="Dice Roller (Ctrl+R)"
    >🎲</button>
  );

  return (
    <div style={{
      position: 'fixed', bottom: 32, right: 16, zIndex: 200,
      width: 240, background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', padding: '8px 12px',
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)',
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 1, color: 'var(--gold-bright)', flex: 1 }}>⬡ DICE ROLLER</span>
        <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ padding: 10 }}>
        {/* Quick dice */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
          {DICE.map(d => (
            <button key={d} onClick={() => doRoll(`1${d}`)} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', padding: '5px 2px', borderRadius: 3,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 11, transition: 'all .1s',
            }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--gold-default)'; (e.target as HTMLButtonElement).style.color = 'var(--gold-bright)'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
            >{d}</button>
          ))}
          <button onClick={() => doRoll('2d20kh1')} style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', padding: '5px 2px', borderRadius: 3,
            cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 10,
          }}>ADV</button>
        </div>

        {/* Formula input */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <input
            value={formula}
            onChange={e => setFormula(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doRoll(formula)}
            style={{
              flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', padding: '5px 8px', borderRadius: 3,
              fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none',
            }}
            placeholder="2d6+3"
          />
          <button onClick={() => doRoll(formula)} style={{
            background: 'rgba(201,168,76,.15)', border: '1px solid var(--gold-default)',
            color: 'var(--gold-bright)', padding: '5px 10px', borderRadius: 3, cursor: 'pointer',
            fontFamily: 'var(--font-display)', fontSize: 11,
          }}>Roll</button>
        </div>

        {/* History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {history.map((h, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '2px 4px', borderBottom: '1px solid var(--border-subtle)',
              fontSize: 11, fontFamily: 'var(--font-mono)',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{h.formula}</span>
              <span style={{
                fontWeight: 700, fontFamily: 'var(--font-display)',
                color: h.crit ? 'var(--text-success)' : h.fail ? 'var(--text-error)' : 'var(--gold-bright)',
              }}>{h.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── ContextMenu ──────────────────────────────────────────────
interface ContextMenuItem {
  label: string;
  icon?: string;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
}

export const ContextMenu: React.FC = () => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tokenEl = target.closest('[data-token-id]') as HTMLElement | null;
      if (tokenEl) {
        e.preventDefault();
        const tokenId = tokenEl.dataset.tokenId;
        setMenu({
          x: e.clientX, y: e.clientY,
          items: [
            { label: 'View Sheet', icon: '👤', action: () => { tokenId && useStore.getState().openSheet(tokenId as import('@mythicforge/shared').UUID); setMenu(null); } },
            { label: 'Add to Combat', icon: '⚔', action: () => setMenu(null) },
            { separator: true, label: '', action: () => {} },
            { label: 'Delete Token', icon: '🗑', danger: true, action: () => setMenu(null) },
          ],
        });
      }
    };
    const dismiss = () => setMenu(null);
    window.addEventListener('contextmenu', handler);
    window.addEventListener('click', dismiss);
    return () => { window.removeEventListener('contextmenu', handler); window.removeEventListener('click', dismiss); };
  }, []);

  if (!menu) return null;

  return (
    <div style={{
      position: 'fixed', left: menu.x, top: menu.y, zIndex: 500,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
      borderRadius: 6, padding: '4px 0', minWidth: 160, boxShadow: 'var(--shadow-lg)',
      animation: 'fadeIn .1s ease',
    }}>
      {menu.items.map((item, i) =>
        item.separator ? (
          <div key={i} style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />
        ) : (
          <div
            key={i}
            onClick={() => { item.action(); setMenu(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', cursor: 'pointer', fontSize: 13,
              color: item.danger ? 'var(--crimson-bright)' : 'var(--text-primary)',
              transition: 'background .1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = item.danger ? 'var(--crimson-glow)' : 'var(--bg-panel-2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            {item.icon && <span style={{ fontSize: 13, width: 16, textAlign: 'center', opacity: .7 }}>{item.icon}</span>}
            {item.label}
          </div>
        )
      )}
    </div>
  );
};

// ─── LoginScreen ──────────────────────────────────────────────
export const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setSession } = useStore();

  const submit = async () => {
    if (!username || !password) { setError('Username and password required'); return; }
    setLoading(true); setError('');
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
      });
      const data = await res.json() as { error?: string; token?: string; userId?: string; role?: string; displayName?: string };
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      if (data.token) localStorage.setItem('mf-token', data.token);

      setUser({
        id: data.userId as import('@mythicforge/shared').UUID,
        username,
        displayName: data.displayName ?? displayName ?? username,
        role: (data.role ?? 'player') as import('@mythicforge/shared').UserRole,
        color: '#c9a84c' as import('@mythicforge/shared').HexColor,
        connectedAt: Date.now() as import('@mythicforge/shared').Timestamp,
        isOnline: true,
      });
      setSession({
        id: crypto.randomUUID() as import('@mythicforge/shared').UUID,
        name: 'My Campaign',
        campaignId: '' as import('@mythicforge/shared').UUID,
        hostUserId: data.userId as import('@mythicforge/shared').UUID,
        users: [],
        createdAt: Date.now() as import('@mythicforge/shared').Timestamp,
        gameSystemId: 'dnd5e',
        settings: {
          allowPlayerMacros: true, allowPlayerDrawing: false,
          showPlayerHpBars: true, showNpcNames: false,
          fogOfWarEnabled: true, dynamicLightingEnabled: true,
          gridEnabled: true, gridSize: 100, gridType: 'square',
          gridScale: '5 ft', rollMode: 'publicroll',
        },
      });
    } catch (e) {
      setError('Connection failed — is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Background decoration */}
      <div style={{ position: 'absolute', inset: 0, opacity: .03, backgroundImage: 'repeating-linear-gradient(45deg, var(--gold-bright) 0, var(--gold-bright) 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />

      <div style={{
        position: 'relative', width: 380, background: 'var(--bg-panel)',
        border: '1px solid var(--border-strong)', borderRadius: 12,
        padding: 32, boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚔</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--gold-bright)', letterSpacing: 3 }}>MYTHICFORGE</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 2, marginTop: 2 }}>VIRTUAL TABLETOP</div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', marginBottom: 20, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
          {(['login','register'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '8px 0', background: mode === m ? 'rgba(201,168,76,.12)' : 'none',
              border: 'none', color: mode === m ? 'var(--gold-bright)' : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 11,
              letterSpacing: 1, transition: 'all .12s', textTransform: 'uppercase',
            }}>
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'register' && (
            <input
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none' }}
              placeholder="Display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          )}
          <input
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none' }}
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoFocus
          />
          <input
            type="password"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none' }}
            placeholder="Password (8+ characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>

        {error && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--crimson-glow)', border: '1px solid var(--crimson-default)', borderRadius: 4, color: 'var(--crimson-bright)', fontSize: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: '100%', marginTop: 16, padding: '11px 0',
            background: 'rgba(201,168,76,.15)', border: '1px solid var(--gold-default)',
            color: 'var(--gold-bright)', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: 2,
            transition: 'all .15s', opacity: loading ? .7 : 1,
          }}
        >
          {loading ? 'Connecting...' : mode === 'login' ? 'Enter the Realm' : 'Create Account'}
        </button>

        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: 'var(--text-disabled)' }}>
          MythicForge VTT v0.1.0 — Forge your legend
        </div>
      </div>
    </div>
  );
};
