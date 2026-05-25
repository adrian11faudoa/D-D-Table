// ============================================================
// MacroEditor — JavaScript macro scripting system
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import type { Macro } from '@mythicforge/shared';

// ─── Built-in Macro Templates ─────────────────────────────────
const MACRO_TEMPLATES = [
  {
    name: 'Attack Roll',
    type: 'script' as const,
    command: `// Attack Roll macro
// Replace "Longsword" with your weapon name
const actor = game.actors.find(a => a.name === token?.name);
if (!actor) return ui.notifications.warn("No token selected!");

const item = actor.items.find(i => i.name === "Longsword");
if (!item) return ui.notifications.warn("Item not found!");

await game.system.rollAttack(actor, item, { advantage: false });`,
  },
  {
    name: 'Healing Word',
    type: 'script' as const,
    command: `// Healing Word — Bonus Action
const actor = game.actors.find(a => a.name === token?.name);
if (!actor) return;

const roll = game.dice.roll("1d4 + @wis.mod", { actor });
const healing = roll.total;

await game.system.applyHealing(actor, healing);
game.chat.create(\`\${actor.name} is healed for \${healing} HP!\`);`,
  },
  {
    name: 'Initiative Roll',
    type: 'script' as const,
    command: `// Roll initiative for selected tokens
const tokens = canvas.tokens.controlled;
if (!tokens.length) return ui.notifications.warn("Select tokens first!");

for (const token of tokens) {
  await game.combat?.rollInitiative(token.id);
}`,
  },
  {
    name: 'Apply Condition',
    type: 'script' as const,
    command: `// Apply a condition to selected token
const CONDITION = "Prone"; // Change this
const token = canvas.tokens.controlled[0];
if (!token) return ui.notifications.warn("No token selected!");

const actor = game.actors.get(token.actorId);
const effect = {
  label: CONDITION,
  icon: \`icons/conditions/\${CONDITION.toLowerCase()}.webp\`,
  changes: [],
  disabled: false,
  duration: { rounds: 1 },
  origin: "Macro",
  transfer: false,
};

await actor.createEmbeddedDocuments("ActiveEffect", [effect]);
ui.notifications.info(\`\${CONDITION} applied to \${actor.name}\`);`,
  },
  {
    name: 'Area Damage',
    type: 'script' as const,
    command: `// Deal damage to all hostile tokens in 20ft
const origin = canvas.tokens.controlled[0];
if (!origin) return;

const radius = 20; // feet
const targets = canvas.getAreaTokens(origin.position, radius * canvas.scene.grid.size / 5);
const hostiles = targets.filter(t => t.disposition === "hostile");

const damage = await game.dice.roll("8d6");

for (const target of hostiles) {
  const actor = game.actors.get(target.actorId);
  await game.system.applyDamage(actor, damage.total, "fire");
}

game.chat.create(\`Fireball deals \${damage.total} fire damage to \${hostiles.length} targets!\`);`,
  },
  {
    name: 'Draw Token HP',
    type: 'chat' as const,
    command: `/roll 1d8 + @con.mod`,
  },
];

// ─── Simple Syntax Highlighter ────────────────────────────────
function highlight(code: string): string {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
    .replace(/(`[^`]*`)/g, '<span class="string">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="string">$1</span>')
    .replace(/('(?:[^'\\]|\\.)*')/g, '<span class="string">$1</span>')
    .replace(/\b(const|let|var|function|async|await|return|if|else|for|of|in|new|this|true|false|null|undefined)\b/g, '<span class="keyword">$1</span>')
    .replace(/\b(game|canvas|token|actor|item|ui|roll)\b/g, '<span class="global">$1</span>')
    .replace(/(\d+)/g, '<span class="number">$1</span>');
}

// ─── Execution Sandbox ────────────────────────────────────────
async function executeMacro(command: string, context: Record<string, unknown>): Promise<{ output: string; error?: string }> {
  const logs: string[] = [];

  const mockGame = {
    actors: {
      find: (pred: (a: { name: string }) => boolean) => ({ name: 'Test Actor', items: [] }),
      get: (id: string) => null,
      getAll: () => [],
    },
    dice: {
      roll: (formula: string) => {
        const match = formula.match(/(\d+)d(\d+)/);
        if (match) {
          const n = parseInt(match[1]!), d = parseInt(match[2]!);
          const rolls = Array.from({ length: n }, () => Math.floor(Math.random() * d) + 1);
          const total = rolls.reduce((a, b) => a + b, 0);
          logs.push(`🎲 Rolled ${formula} → [${rolls.join(', ')}] = ${total}`);
          return { total, rolls, formula };
        }
        return { total: 0, rolls: [], formula };
      },
    },
    chat: {
      create: (msg: string) => logs.push(`💬 Chat: ${msg}`),
    },
    combat: null,
    system: {
      rollAttack: async () => logs.push('⚔ Attack rolled'),
      applyDamage: async (actor: unknown, amt: number) => logs.push(`💔 ${amt} damage applied`),
      applyHealing: async (actor: unknown, amt: number) => logs.push(`💚 ${amt} healing applied`),
    },
    ui: { notifications: { warn: (m: string) => logs.push(`⚠ ${m}`), info: (m: string) => logs.push(`ℹ ${m}`) } },
  };

  const mockCanvas = {
    tokens: { controlled: [{ name: 'Test Token', actorId: '1', position: { x: 0, y: 0 }, disposition: 'friendly' }] },
    scene: { grid: { size: 100 } },
    getAreaTokens: () => [],
  };

  try {
    const fn = new Function('game', 'canvas', 'token', 'ui', `
      "use strict";
      return (async () => {
        ${command}
      })();
    `);
    await fn(mockGame, mockCanvas, mockCanvas.tokens.controlled[0], mockGame.ui);
    return { output: logs.length > 0 ? logs.join('\n') : '✓ Macro executed successfully (no output)' };
  } catch (err) {
    return {
      output: logs.join('\n'),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Macro Editor Component ───────────────────────────────────
export const MacroEditor: React.FC<{
  macros: Macro[];
  isGM: boolean;
  userId: string;
  onSave: (macro: Omit<Macro, 'id'>) => void;
  onDelete: (id: string) => void;
  onExecute: (command: string) => void;
}> = ({ macros, isGM, userId, onSave, onDelete, onExecute }) => {
  const [editMode, setEditMode] = useState<'list' | 'edit'>('list');
  const [selected, setSelected] = useState<Macro | null>(null);
  const [draft, setDraft] = useState({ name: '', type: 'script' as Macro['type'], command: '', img: '' });
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const openNew = () => {
    setDraft({ name: 'New Macro', type: 'script', command: '// Your macro code here\n', img: '' });
    setSelected(null);
    setOutput('');
    setEditMode('edit');
  };

  const openEdit = (macro: Macro) => {
    setDraft({ name: macro.name, type: macro.type, command: macro.command, img: macro.img });
    setSelected(macro);
    setOutput('');
    setEditMode('edit');
  };

  const applyTemplate = (tmpl: typeof MACRO_TEMPLATES[0]) => {
    setDraft(d => ({ ...d, name: tmpl.name, type: tmpl.type, command: tmpl.command }));
    setShowTemplates(false);
  };

  const save = () => {
    if (!draft.name.trim()) return;
    onSave({
      name: draft.name,
      type: draft.type,
      command: draft.command,
      img: draft.img || '🎲',
      scope: 'global',
      author: userId as import('@mythicforge/shared').UUID,
      ownership: {},
      campaignId: '' as import('@mythicforge/shared').UUID,
    });
    setEditMode('list');
  };

  const run = useCallback(async () => {
    setRunning(true);
    setOutput('Running...');
    try {
      const result = await executeMacro(draft.command, {});
      setOutput(result.error
        ? `❌ Error:\n${result.error}${result.output ? '\n\nOutput:\n' + result.output : ''}`
        : result.output
      );
    } finally {
      setRunning(false);
    }
  }, [draft.command]);

  const insertSnippet = (snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = draft.command.slice(0, start) + snippet + draft.command.slice(end);
    setDraft(d => ({ ...d, command: newVal }));
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + snippet.length;
      ta.focus();
    }, 0);
  };

  // ── Macro List ───────────────────────────────────────────────
  if (editMode === 'list') {
    return (
      <div className="macro-manager">
        <div className="macro-toolbar">
          <button className="macro-tool-btn primary" onClick={openNew}>+ New Macro</button>
          <div className="macro-count">{macros.length} macros</div>
        </div>

        <div className="macro-grid">
          {macros.map(macro => (
            <div key={macro.id} className="macro-card">
              <div className="macro-card-icon">{macro.img || '🎲'}</div>
              <div className="macro-card-name">{macro.name}</div>
              <div className="macro-card-type">{macro.type}</div>
              <div className="macro-card-actions">
                <button className="mc-btn run" onClick={() => onExecute(macro.command)} title="Execute">▶</button>
                <button className="mc-btn edit" onClick={() => openEdit(macro)} title="Edit">✏</button>
                {(isGM || macro.author === userId) && (
                  <button className="mc-btn del" onClick={() => onDelete(macro.id)} title="Delete">×</button>
                )}
              </div>
            </div>
          ))}

          {/* Quick-access hotbar macro slots */}
          {Array.from({ length: Math.max(0, 10 - macros.length) }, (_, i) => (
            <div key={`empty-${i}`} className="macro-card empty" onClick={openNew}>
              <div className="macro-empty-slot">{macros.length + i + 1}</div>
            </div>
          )).slice(0, 10 - macros.length)}
        </div>

        <div className="macro-hotbar-hint">
          💡 Drag macros to the hotbar for quick access (1–0 keys)
        </div>

        <style>{`
          .macro-manager { display:flex; flex-direction:column; height:100%; padding:10px; gap:10px; }
          .macro-toolbar { display:flex; align-items:center; gap:8px; }
          .macro-tool-btn { background:none; border:1px solid var(--border-default); color:var(--text-secondary);
            padding:5px 12px; border-radius:3px; cursor:pointer; font-family:var(--font-display); font-size:11px;
            letter-spacing:.3px; transition:all .12s; }
          .macro-tool-btn.primary { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
          .macro-tool-btn:hover { border-color:var(--gold-default); color:var(--gold-bright); }
          .macro-count { font-size:11px; color:var(--text-muted); margin-left:auto; font-family:var(--font-mono); }
          .macro-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; }
          .macro-card { background:var(--bg-elevated); border:1px solid var(--border-default); border-radius:4px;
            padding:8px 4px; display:flex; flex-direction:column; align-items:center; gap:3px;
            cursor:pointer; transition:all .12s; min-height:70px; position:relative; }
          .macro-card:hover { border-color:var(--gold-default); }
          .macro-card.empty { border-style:dashed; opacity:.4; cursor:pointer; }
          .macro-card.empty:hover { opacity:.7; border-color:var(--gold-dim); }
          .macro-card-icon { font-size:20px; }
          .macro-card-name { font-size:9px; font-family:var(--font-display); letter-spacing:.2px;
            color:var(--text-secondary); text-align:center; overflow:hidden; text-overflow:ellipsis;
            white-space:nowrap; width:100%; }
          .macro-card-type { font-size:8px; color:var(--text-muted); font-family:var(--font-mono); }
          .macro-card-actions { display:flex; gap:2px; margin-top:auto; }
          .mc-btn { width:18px; height:18px; border:1px solid var(--border-default); background:none;
            color:var(--text-muted); border-radius:2px; cursor:pointer; font-size:9px;
            display:flex; align-items:center; justify-content:center; transition:all .1s; }
          .mc-btn.run:hover { border-color:var(--teal-bright); color:var(--teal-bright); }
          .mc-btn.edit:hover { border-color:var(--gold-default); color:var(--gold-bright); }
          .mc-btn.del:hover { border-color:var(--crimson-bright); color:var(--crimson-bright); }
          .macro-empty-slot { font-family:var(--font-display); font-size:16px; color:var(--text-disabled); margin:auto; }
          .macro-hotbar-hint { font-size:10px; color:var(--text-disabled); text-align:center; padding-top:4px; }
        `}</style>
      </div>
    );
  }

  // ── Macro Editor ─────────────────────────────────────────────
  return (
    <div className="macro-editor">
      {/* Editor Header */}
      <div className="editor-header">
        <button className="back-btn" onClick={() => setEditMode('list')}>← Back</button>
        <input
          className="macro-name-input"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Macro name..."
        />
        <select
          className="type-select"
          value={draft.type}
          onChange={e => setDraft(d => ({ ...d, type: e.target.value as Macro['type'] }))}
        >
          <option value="script">Script</option>
          <option value="chat">Chat</option>
        </select>
      </div>

      {/* Snippets toolbar */}
      {draft.type === 'script' && (
        <div className="snippets-bar">
          <button className="snip-btn" onClick={() => setShowTemplates(!showTemplates)}>
            📋 Templates
          </button>
          <button className="snip-btn" onClick={() => insertSnippet('game.dice.roll("1d20")')}>
            🎲 Roll
          </button>
          <button className="snip-btn" onClick={() => insertSnippet('canvas.tokens.controlled[0]')}>
            🎭 Token
          </button>
          <button className="snip-btn" onClick={() => insertSnippet('game.actors.find(a => a.name === token?.name)')}>
            👤 Actor
          </button>
          <button className="snip-btn" onClick={() => insertSnippet('game.chat.create("")')}>
            💬 Chat
          </button>
          <button className="snip-btn" onClick={() => insertSnippet('await game.system.applyDamage(actor, 0, "fire")')}>
            ⚔ Damage
          </button>
        </div>
      )}

      {/* Templates dropdown */}
      {showTemplates && (
        <div className="templates-dropdown">
          {MACRO_TEMPLATES.map(tmpl => (
            <div key={tmpl.name} className="template-item" onClick={() => applyTemplate(tmpl)}>
              <span className="tmpl-type">{tmpl.type}</span>
              <span className="tmpl-name">{tmpl.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Code editor */}
      <div className="code-area">
        <textarea
          ref={textareaRef}
          className="code-textarea"
          value={draft.command}
          onChange={e => setDraft(d => ({ ...d, command: e.target.value }))}
          spellCheck={false}
          onKeyDown={e => {
            if (e.key === 'Tab') {
              e.preventDefault();
              insertSnippet('  ');
            }
            if (e.ctrlKey && e.key === 'Enter') run();
          }}
          placeholder={draft.type === 'chat' ? '/roll 1d20+5 or any chat command...' : '// JavaScript macro code'}
        />
      </div>

      {/* Output panel */}
      <div className="output-panel">
        <div className="output-header">
          <span>Output</span>
          <button className="clear-output" onClick={() => setOutput('')}>Clear</button>
        </div>
        <pre className="output-content">{output || '// Run your macro to see output here'}</pre>
      </div>

      {/* Action bar */}
      <div className="editor-actions">
        <button className="action-btn run-btn" onClick={run} disabled={running}>
          {running ? '⟳ Running...' : '▶ Run (Ctrl+Enter)'}
        </button>
        <button className="action-btn save-btn" onClick={save}>
          💾 Save Macro
        </button>
        <button className="action-btn cancel-btn" onClick={() => setEditMode('list')}>
          Cancel
        </button>
      </div>

      <style>{`
        .macro-editor { display:flex; flex-direction:column; height:100%; }
        .editor-header { display:flex; align-items:center; gap:6px; padding:8px;
          border-bottom:1px solid var(--border-default); flex-shrink:0; background:var(--bg-secondary); }
        .back-btn { background:none; border:1px solid var(--border-default); color:var(--text-muted);
          padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px; transition:all .1s; }
        .back-btn:hover { border-color:var(--gold-default); color:var(--gold-bright); }
        .macro-name-input { flex:1; background:var(--bg-elevated); border:1px solid var(--border-default);
          color:var(--text-primary); padding:4px 8px; border-radius:3px; font-family:var(--font-display);
          font-size:12px; letter-spacing:.3px; outline:none; }
        .macro-name-input:focus { border-color:var(--gold-default); }
        .type-select { background:var(--bg-elevated); border:1px solid var(--border-default);
          color:var(--text-secondary); padding:4px 6px; border-radius:3px; font-size:11px; outline:none; }
        .snippets-bar { display:flex; gap:4px; padding:5px 8px; background:var(--bg-elevated);
          border-bottom:1px solid var(--border-subtle); flex-wrap:wrap; flex-shrink:0; }
        .snip-btn { background:none; border:1px solid var(--border-default); color:var(--text-muted);
          padding:3px 8px; border-radius:3px; cursor:pointer; font-size:10px; transition:all .1s; }
        .snip-btn:hover { border-color:var(--gold-default); color:var(--gold-bright); }
        .templates-dropdown { position:absolute; z-index:100; background:var(--bg-elevated);
          border:1px solid var(--border-strong); border-radius:4px; left:8px; margin-top:-1px;
          min-width:200px; box-shadow:var(--shadow-lg); }
        .template-item { display:flex; align-items:center; gap:8px; padding:8px 10px;
          cursor:pointer; transition:background .1s; font-size:11px; }
        .template-item:hover { background:var(--bg-panel-2); }
        .tmpl-type { font-size:9px; font-family:var(--font-mono); color:var(--gold-default);
          background:rgba(201,168,76,.1); padding:1px 4px; border-radius:2px; }
        .tmpl-name { color:var(--text-primary); }
        .code-area { flex:1; min-height:0; position:relative; }
        .code-textarea { width:100%; height:100%; background:#0d0f18; color:#c8cce0;
          border:none; border-bottom:1px solid var(--border-subtle); padding:10px 12px;
          font-family:var(--font-mono); font-size:12px; line-height:1.6; outline:none; resize:none;
          tab-size:2; }
        .output-panel { height:120px; flex-shrink:0; display:flex; flex-direction:column;
          border-top:1px solid var(--border-default); }
        .output-header { display:flex; justify-content:space-between; align-items:center;
          padding:4px 8px; background:var(--bg-secondary); border-bottom:1px solid var(--border-subtle); }
        .output-header span { font-family:var(--font-display); font-size:10px; letter-spacing:.5px;
          color:var(--text-muted); text-transform:uppercase; }
        .clear-output { background:none; border:none; color:var(--text-muted); cursor:pointer;
          font-size:10px; transition:color .1s; }
        .clear-output:hover { color:var(--crimson-bright); }
        .output-content { flex:1; overflow-y:auto; padding:8px 10px; font-family:var(--font-mono);
          font-size:11px; color:var(--teal-bright); background:#060708; white-space:pre-wrap;
          word-break:break-word; line-height:1.5; }
        .editor-actions { display:flex; gap:6px; padding:8px; border-top:1px solid var(--border-default);
          background:var(--bg-secondary); flex-shrink:0; }
        .action-btn { padding:6px 14px; border-radius:3px; cursor:pointer; font-family:var(--font-display);
          font-size:11px; letter-spacing:.3px; transition:all .12s; border:1px solid var(--border-default); background:none; }
        .run-btn { border-color:var(--teal-default); color:var(--teal-bright); background:rgba(26,143,127,.1); }
        .run-btn:hover:not(:disabled) { background:rgba(26,143,127,.2); }
        .run-btn:disabled { opacity:.5; cursor:not-allowed; }
        .save-btn { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
        .save-btn:hover { background:var(--gold-glow-strong); }
        .cancel-btn { color:var(--text-muted); }
        .cancel-btn:hover { border-color:var(--text-muted); color:var(--text-secondary); }
      `}</style>
    </div>
  );
};

export default MacroEditor;
