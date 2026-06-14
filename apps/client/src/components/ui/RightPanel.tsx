// ============================================================
// RightPanel — Tabbed right-side panel container
// ============================================================

import React, { useState, useCallback } from 'react';
import { useStore, type PanelId } from '../../stores/useStore';
import { NetworkClient } from '@mythicforge/network';
import { CombatTracker } from '../combat/CombatTracker';
import { ChatPanel } from '../chat/ChatPanel';
import { CharacterSheet } from '../character/CharacterSheet';
import { CompendiumBrowser } from '../panels/CompendiumBrowser';
import { AudioManager } from '../panels/AudioManager';
import { MacroEditor } from '../panels/MacroEditor';
import { PluginManager } from '../panels/PluginManager';
import { SceneManager } from '../panels/SceneManager';

interface RightPanelProps {
  activePanel: PanelId;
  onPanelChange: (panel: PanelId) => void;
  network: NetworkClient | null;
  isGM: boolean;
  userId: string;
}

const TABS: { id: PanelId; label: string; gmOnly?: boolean }[] = [
  { id: 'combat',    label: 'Combat' },
  { id: 'chat',      label: 'Chat' },
  { id: 'character', label: 'Sheet' },
  { id: 'journal',   label: 'Journal' },
  { id: 'assets',    label: 'Assets' },
  { id: 'scenes',    label: 'Scenes',  gmOnly: true },
  { id: 'audio',     label: 'Audio' },
  { id: 'plugins',   label: 'Plugins', gmOnly: true },
  { id: 'settings',  label: 'Settings' },
];

export const RightPanel: React.FC<RightPanelProps> = ({
  activePanel, onPanelChange, network, isGM, userId,
}) => {
  const {
    combat, actors, scenes, activeScene, addNotification,
    nextTurn, prevTurn, updateCombatant, addMessage,
    messages, updateActorPath, openSheet,
  } = useStore();

  const [panelWidth, setPanelWidth] = useState(280);
  const [resizing, setResizing] = useState(false);

  // Resize handle
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(240, Math.min(520, startW + delta)));
    };
    const onUp = () => { setResizing(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  const visibleTabs = TABS.filter(t => !t.gmOnly || isGM);

  const renderPanel = () => {
    switch (activePanel) {
      case 'combat':
        return (
          <CombatTracker
            combat={combat}
            actors={actors}
            isGM={isGM}
            userId={userId}
            onNextTurn={() => {
              nextTurn();
              network?.emit('combat:next-turn', { combatId: combat?.id });
            }}
            onPrevTurn={() => {
              prevTurn();
              network?.emit('combat:prev-turn', { combatId: combat?.id });
            }}
            onRollInitiative={(id) => {
              const bonus = 2;
              const init = Math.floor(Math.random() * 20) + 1 + bonus;
              updateCombatant(id as import('@mythicforge/shared').UUID, { initiative: init, hasRolled: true });
              network?.emit('combat:initiative', { combatantId: id, initiative: init });
            }}
            onRollAllInitiative={() => {
              combat?.combatants.forEach(c => {
                const init = Math.floor(Math.random() * 20) + 1 + c.initiativeBonus;
                updateCombatant(c.id, { initiative: init, hasRolled: true });
              });
              network?.emit('combat:initiative', { rollAll: true });
            }}
            onUpdateHP={(actorId, delta) => {
              const actor = actors.get(actorId as import('@mythicforge/shared').UUID);
              if (!actor) return;
              const data = actor.data as { attributes?: { hp?: { value: number; max: number } } };
              const hp = data.attributes?.hp;
              if (!hp) return;
              const newVal = Math.max(0, Math.min(hp.max, hp.value + delta));
              updateActorPath(actorId as import('@mythicforge/shared').UUID, 'data.attributes.hp.value', newVal);
              network?.emit('token:update', { actorId, data: { 'data.attributes.hp.value': newVal } });
            }}
            onToggleDefeated={(id) => {
              const c = combat?.combatants.find(x => x.id === id);
              if (c) updateCombatant(id as import('@mythicforge/shared').UUID, { defeated: !c.defeated });
            }}
            onRemoveCombatant={(id) => {
              useStore.getState().removeCombatant(id as import('@mythicforge/shared').UUID);
            }}
            onEndCombat={() => useStore.getState().setCombat(null)}
          />
        );

      case 'chat':
        return (
          <ChatPanel
            messages={messages}
            userId={userId}
            isGM={isGM}
            onSend={(content, rollMode) => {
              const msg = {
                id: crypto.randomUUID() as import('@mythicforge/shared').UUID,
                sessionId: '' as import('@mythicforge/shared').UUID,
                type: 'chat' as const,
                content,
                speaker: { userId: userId as import('@mythicforge/shared').UUID, alias: 'Player' },
                timestamp: Date.now() as import('@mythicforge/shared').Timestamp,
                flags: {},
              };
              addMessage(msg);
              network?.emit('chat:message', { ...msg, rollMode });
            }}
            onRoll={(formula, rollMode) => {
              network?.emit('dice:roll', { formula, rollMode });
            }}
          />
        );

      case 'character': {
        const selectedActorId = [...useStore.getState().selectedTokenIds][0];
        const token = activeScene?.tokens.find(t => t.id === selectedActorId);
        const actor = token ? actors.get(token.actorId) : [...actors.values()].find(a => a.ownership?.[userId] === 3);
        if (!actor) return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8, padding: 24 }}>
            <div style={{ fontSize: 32, opacity: .3 }}>👤</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>No character selected</div>
            <div style={{ fontSize: 11 }}>Select a token to view its sheet</div>
          </div>
        );
        return (
          <CharacterSheet
            actor={actor}
            isOwner={actor.ownership?.[userId] === 3}
            isGM={isGM}
            onUpdate={(path, value) => {
              updateActorPath(actor.id, path, value);
              network?.emit('token:update', { actorId: actor.id, path, value });
            }}
            onRoll={(formula, flavor) => {
              network?.emit('dice:roll', { formula, flavor, rollMode: 'publicroll' });
            }}
            onUseItem={(itemId) => {
              network?.emit('chat:message', { type: 'chat', content: `uses item ${itemId}` });
            }}
          />
        );
      }

      case 'assets':
        return (
          <CompendiumBrowser
            isGM={isGM}
            onAddMonster={(entry) => addNotification(`${entry.name} added to scene`, 'success')}
            onAddSpell={(entry) => addNotification(`${entry.name} added to spellbook`, 'success')}
            onAddItem={(entry) => addNotification(`${entry.name} added to inventory`, 'success')}
          />
        );

      case 'scenes':
        return (
          <SceneManager
            scenes={[...(activeScene ? [activeScene] : [])]}
            activeSceneId={activeScene?.id ?? null}
            isGM={isGM}
            onActivate={(id) => {
              useStore.getState().setActiveScene(id as import('@mythicforge/shared').UUID);
              network?.emit('scene:activate', { sceneId: id });
            }}
            onCreate={(data) => {
              addNotification('Scene created', 'success');
            }}
            onDelete={(id) => {
              useStore.getState().removeScene(id as import('@mythicforge/shared').UUID);
              addNotification('Scene deleted', 'info');
            }}
            onUpdate={(id, data) => {
              useStore.getState().updateScene(id as import('@mythicforge/shared').UUID, data);
            }}
            onNotify={(msg) => addNotification(msg, 'info')}
          />
        );

      case 'audio':
        return <AudioManager isGM={isGM} onNotify={(msg) => addNotification(msg, 'info')} />;

      case 'plugins':
        return <PluginManager isGM={isGM} onNotify={(msg) => addNotification(msg, 'info')} />;

      case 'settings':
        return (
          <div style={{ padding: 16, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontSize: 12 }}>
            <div style={{ marginBottom: 12, color: 'var(--gold-bright)', letterSpacing: 1 }}>SETTINGS</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Full settings panel coming in v0.2</div>
          </div>
        );

      default:
        return (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
            Panel: {activePanel}
          </div>
        );
    }
  };

  return (
    <div style={{
      width: panelWidth, minWidth: 240, maxWidth: 520,
      background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-default)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
      position: 'relative', cursor: resizing ? 'col-resize' : 'default',
    }}>
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          cursor: 'col-resize', zIndex: 10,
          background: resizing ? 'var(--gold-default)' : 'transparent',
          transition: 'background .15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--border-strong)'; }}
        onMouseLeave={e => { if (!resizing) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      />

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-secondary)', overflowX: 'auto', flexShrink: 0,
      }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onPanelChange(tab.id)}
            style={{
              flex: 1, minWidth: 48, padding: '7px 4px',
              fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.3px',
              color: activePanel === tab.id ? 'var(--gold-bright)' : 'var(--text-muted)',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${activePanel === tab.id ? 'var(--gold-bright)' : 'transparent'}`,
              cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {renderPanel()}
      </div>
    </div>
  );
};

export default RightPanel;
