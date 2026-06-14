// ============================================================
// Sidebar — Left icon navigation panel
// ============================================================

import React from 'react';
import type { PanelId, CanvasTool } from '../../stores/useStore';

interface SidebarProps {
  activePanel: PanelId;
  onPanelChange: (panel: PanelId) => void;
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  isGM: boolean;
}

interface SidebarItem {
  panel?: PanelId;
  icon: string;
  label: string;
  gmOnly?: boolean;
  action?: () => void;
}

const PANEL_ITEMS: SidebarItem[] = [
  { panel: 'combat',    icon: '⚔',  label: 'Combat Tracker' },
  { panel: 'chat',      icon: '💬',  label: 'Chat & Dice' },
  { panel: 'character', icon: '👤',  label: 'Characters' },
  { panel: 'journal',   icon: '📜',  label: 'Journal' },
  { panel: 'assets',    icon: '🖼',   label: 'Assets' },
  { panel: 'scenes',    icon: '🗺',   label: 'Scenes' },
  { panel: 'audio',     icon: '🎵',  label: 'Audio' },
  { panel: 'plugins',   icon: '🔌',  label: 'Plugins', gmOnly: true },
  { panel: 'settings',  icon: '⚙',   label: 'Settings' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activePanel, onPanelChange, isGM,
}) => {
  const visible = PANEL_ITEMS.filter(item => !item.gmOnly || isGM);

  return (
    <div style={{
      width: 44, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-default)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 0', gap: 3, flexShrink: 0, zIndex: 50, overflowY: 'auto',
    }}>
      {visible.map((item, i) => {
        const isActive = item.panel && activePanel === item.panel;
        return (
          <React.Fragment key={item.panel ?? i}>
            {i > 0 && i === visible.findIndex(v => v.panel === 'settings') && (
              <div style={{ width: 24, height: 1, background: 'var(--border-default)', margin: '4px 0', marginTop: 'auto' }} />
            )}
            <div
              title={item.label}
              onClick={() => item.panel && onPanelChange(item.panel)}
              style={{
                width: 32, height: 32, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 15, transition: 'all .12s',
                border: `1px solid ${isActive ? 'var(--gold-default)' : 'transparent'}`,
                background: isActive ? 'rgba(201,168,76,.12)' : 'none',
                color: isActive ? 'var(--gold-bright)' : 'var(--text-muted)',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)';
                  (e.currentTarget as HTMLDivElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLDivElement).style.background = 'none';
                  (e.currentTarget as HTMLDivElement).style.color = 'var(--text-muted)';
                }
              }}
            >
              {item.icon}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Sidebar;
