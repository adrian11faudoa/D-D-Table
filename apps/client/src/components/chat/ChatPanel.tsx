// ============================================================
// ChatPanel — Real-time chat with dice roll display
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '@mythicforge/shared';

interface ChatPanelProps {
  messages: ChatMessage[];
  userId: string;
  isGM: boolean;
  onSend: (content: string, rollMode: string) => void;
  onRoll: (formula: string, rollMode: string) => void;
}

const ROLL_MODES = [
  { id: 'publicroll', label: '🌐 Public',  hint: 'Everyone sees' },
  { id: 'gmroll',     label: '🔒 GM Roll', hint: 'Only GM sees' },
  { id: 'blindroll',  label: '👁 Blind',   hint: 'Hidden from all' },
  { id: 'selfroll',   label: '🎭 Self',    hint: 'Only you see' },
];

function RollCard({ roll }: { roll: NonNullable<ChatMessage['roll']> }) {
  const isCrit = roll.terms.some(t => t.type === 'die' && t.faces === 20 && t.results.some(r => r.active && r.result === 20));
  const isFail = roll.terms.some(t => t.type === 'die' && t.faces === 20 && t.results.some(r => r.active && r.result === 1));

  const breakdown = roll.terms
    .filter((t): t is Extract<typeof t, { type: 'die' }> => t.type === 'die')
    .map(t => {
      const active = t.results.filter(r => r.active).map(r => r.result);
      const dropped = t.results.filter(r => !r.active).map(r => r.result);
      const parts = [
        ...active.map(r => `<span style="color:var(--gold-bright)">${r}</span>`),
        ...dropped.map(r => `<span style="color:var(--text-disabled);text-decoration:line-through">${r}</span>`),
      ];
      return `[${parts.join(', ')}]`;
    })
    .join(' + ');

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: `1px solid ${isCrit ? 'var(--teal-default)' : isFail ? 'var(--crimson-default)' : 'var(--gold-dim)'}`,
      borderRadius: 5, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 10, marginTop: 4,
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, lineHeight: 1, minWidth: 40, textAlign: 'center',
        color: isCrit ? 'var(--teal-bright)' : isFail ? 'var(--crimson-bright)' : 'var(--gold-bright)',
      }}>
        {roll.total}
        {isCrit && <div style={{ fontSize: 8, letterSpacing: 1, color: 'var(--teal-bright)', marginTop: 1 }}>CRIT!</div>}
        {isFail && <div style={{ fontSize: 8, letterSpacing: 1, color: 'var(--crimson-bright)', marginTop: 1 }}>FUMBLE</div>}
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
          {roll.formula}{roll.flavor ? ` — ${roll.flavor}` : ''}
        </div>
        <div
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}
          dangerouslySetInnerHTML={{ __html: breakdown }}
        />
      </div>
    </div>
  );
}

function MessageBubble({ msg, isMine }: { msg: ChatMessage; isMine: boolean }) {
  const roleColors: Record<string, string> = {
    gm: 'var(--crimson-bright)', player: 'var(--teal-bright)',
  };
  const isSystem = msg.type === 'system' || msg.speaker.alias === 'System';

  if (isSystem) return (
    <div style={{
      textAlign: 'center', fontSize: 10, color: 'var(--text-disabled)',
      fontFamily: 'var(--font-mono)', padding: '2px 0', fontStyle: 'italic',
    }}>
      {msg.content}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: isMine ? 'flex-end' : 'flex-start' }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: '.5px', color: roleColors['player'] ?? 'var(--text-muted)', paddingLeft: 2 }}>
        {msg.speaker.alias}
        <span style={{ color: 'var(--text-disabled)', marginLeft: 6, fontFamily: 'var(--font-mono)', letterSpacing: 0, fontSize: 9 }}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {msg.content && (
        <div style={{
          maxWidth: '85%', background: isMine ? 'rgba(26,143,127,.12)' : 'var(--bg-elevated)',
          border: `1px solid ${isMine ? 'var(--teal-dim, var(--border-default))' : 'var(--border-default)'}`,
          borderRadius: isMine ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
          padding: '6px 10px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45,
        }}>
          {msg.content}
        </div>
      )}
      {msg.roll && <div style={{ maxWidth: '90%', width: '100%' }}><RollCard roll={msg.roll} /></div>}
    </div>
  );
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, userId, isGM, onSend, onRoll }) => {
  const [input, setInput] = useState('');
  const [rollMode, setRollMode] = useState('publicroll');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = useCallback(() => {
    const val = input.trim();
    if (!val) return;

    if (val.startsWith('/roll ') || val.startsWith('/r ')) {
      const formula = val.replace(/^\/(roll|r)\s+/, '');
      onRoll(formula, rollMode);
    } else if (val.startsWith('/gmroll ') || val.startsWith('/gr ')) {
      const formula = val.replace(/^\/(gmroll|gr)\s+/, '');
      onRoll(formula, 'gmroll');
    } else if (val.startsWith('/blindroll ') || val.startsWith('/br ')) {
      const formula = val.replace(/^\/(blindroll|br)\s+/, '');
      onRoll(formula, 'blindroll');
    } else {
      onSend(val, rollMode);
    }
    setInput('');
  }, [input, rollMode, onSend, onRoll]);

  const currentMode = ROLL_MODES.find(m => m.id === rollMode) ?? ROLL_MODES[0]!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 12, marginTop: 32, fontStyle: 'italic' }}>
            No messages yet. Say hello!
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isMine={msg.speaker.userId === userId} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick commands hint */}
      <div style={{ padding: '3px 12px', fontSize: 10, color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border-subtle)' }}>
        /roll 1d20+5 · /gmroll · /blindroll
      </div>

      {/* Input area */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-default)', display: 'flex', gap: 6, flexShrink: 0, position: 'relative' }}>
        {/* Roll mode picker */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowModeMenu(m => !m)}
            title={currentMode?.hint}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              color: 'var(--text-muted)', padding: '5px 8px', borderRadius: 3,
              cursor: 'pointer', fontSize: 13, height: 34,
            }}
          >
            {currentMode?.label.split(' ')[0]}
          </button>
          {showModeMenu && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
              borderRadius: 5, overflow: 'hidden', zIndex: 50, minWidth: 140,
              boxShadow: 'var(--shadow-lg)',
            }}>
              {ROLL_MODES.map(m => (
                <div
                  key={m.id}
                  onClick={() => { setRollMode(m.id); setShowModeMenu(false); }}
                  style={{
                    padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                    color: rollMode === m.id ? 'var(--gold-bright)' : 'var(--text-secondary)',
                    background: rollMode === m.id ? 'rgba(201,168,76,.08)' : 'none',
                    display: 'flex', justifyContent: 'space-between', gap: 12,
                  }}
                >
                  <span>{m.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.hint}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Text input */}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            if (e.key === 'Escape') setShowModeMenu(false);
          }}
          placeholder={`Message or /roll 2d6+3…`}
          style={{
            flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 3,
            fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none', height: 34,
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--gold-dim)'; }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border-default)'; }}
        />

        {/* Send */}
        <button
          onClick={send}
          style={{
            background: 'rgba(201,168,76,.12)', border: '1px solid var(--gold-dim)',
            color: 'var(--gold-bright)', width: 34, height: 34, borderRadius: 3,
            cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .12s',
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
