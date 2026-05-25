// ============================================================
// PluginManager — Install, enable/disable, configure plugins
// ============================================================

import React, { useState, useCallback } from 'react';
import type { PluginManifest } from '@mythicforge/shared';

// ─── Types ───────────────────────────────────────────────────
interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  hasUpdate: boolean;
  hasErrors: boolean;
  loadTimeMs: number;
}

interface MarketplacePlugin {
  id: string;
  title: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  tags: string[];
  system?: string;
  img?: string;
  premium?: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────
const INSTALLED_PLUGINS: InstalledPlugin[] = [
  {
    manifest: {
      id: 'dnd5e', title: 'D&D 5th Edition', description: 'Official D&D 5e game system', version: '1.0.0',
      author: 'MythicForge Team', license: 'MIT', compatibility: { minimum: '0.1.0', verified: '0.1.0' },
      esmodules: ['dist/index.js'],
    },
    enabled: true, hasUpdate: false, hasErrors: false, loadTimeMs: 42,
  },
  {
    manifest: {
      id: 'dice-so-nice', title: 'Dice So Nice', description: '3D animated dice rolling', version: '1.0.0',
      author: 'MythicForge Community', license: 'MIT', compatibility: { minimum: '0.1.0', verified: '0.1.0' },
      esmodules: ['dist/index.js'],
    },
    enabled: true, hasUpdate: true, hasErrors: false, loadTimeMs: 118,
  },
  {
    manifest: {
      id: 'token-magic', title: 'Token Magic FX', description: 'Visual effects for tokens', version: '0.9.2',
      author: 'SecretFire', license: 'MIT', compatibility: { minimum: '0.1.0', verified: '0.1.0' },
      esmodules: ['dist/index.js'],
    },
    enabled: false, hasUpdate: false, hasErrors: false, loadTimeMs: 0,
  },
  {
    manifest: {
      id: 'monks-tb', title: "Monk's Little Details", description: 'Quality-of-life improvements', version: '1.2.1',
      author: 'ironmonk88', license: 'MIT', compatibility: { minimum: '0.1.0', verified: '0.1.0' },
      esmodules: ['dist/index.js'],
    },
    enabled: true, hasUpdate: false, hasErrors: true, loadTimeMs: 67,
  },
];

const MARKETPLACE_PLUGINS: MarketplacePlugin[] = [
  { id: 'pf2e', title: 'Pathfinder 2E', description: 'Complete Pathfinder 2e system with full automation, conditions, and spells', author: 'MythicForge Team', version: '1.0.0', downloads: 12400, rating: 4.9, tags: ['system', 'pf2e'], system: 'pathfinder2e' },
  { id: 'calendar-weather', title: 'Calendar & Weather', description: 'Track in-game time, weather, and seasons with a beautiful calendar UI', author: 'Rigby', version: '3.1.2', downloads: 8900, rating: 4.7, tags: ['calendar', 'weather', 'time'] },
  { id: 'encounter-builder', title: 'Encounter Builder Pro', description: 'Build balanced encounters, import monsters, and CR calculator', author: 'DMHelper', version: '2.4.0', downloads: 7200, rating: 4.6, tags: ['gm', 'encounter', 'monsters'] },
  { id: 'chat-portrait', title: 'Chat Portrait', description: 'Show character portraits next to chat messages', author: 'portals', version: '1.5.0', downloads: 6100, rating: 4.5, tags: ['chat', 'ui'] },
  { id: 'perfect-vision', title: 'Perfect Vision', description: 'Enhanced lighting modes: monochrome darkvision, dim light', author: 'dev7355608', version: '4.0.0', downloads: 5800, rating: 4.8, tags: ['lighting', 'vision'] },
  { id: 'combat-ready', title: 'Combat Ready!', description: 'Combat countdown timer, active turn notifications, auto-pause', author: 'arcanist', version: '1.9.0', downloads: 5400, rating: 4.4, tags: ['combat', 'ui', 'timer'] },
  { id: 'fumble-critical', title: 'Fumble & Critical', description: 'Custom critical hit and fumble tables with dramatic results', author: 'ironmonk88', version: '1.3.0', downloads: 4900, rating: 4.3, tags: ['dice', 'dnd5e'] },
  { id: 'background-volume', title: 'Background Volume', description: 'Per-scene ambient volume and audio zones', author: 'LevelUp', version: '2.1.0', downloads: 4200, rating: 4.2, tags: ['audio', 'ambient'] },
  { id: 'polyglot', title: 'Polyglot', description: 'Unknown languages appear scrambled to characters who can\'t read them', author: 'mclemente', version: '1.7.0', downloads: 3800, rating: 4.6, tags: ['roleplay', 'languages'] },
  { id: 'drag-ruler', title: 'Drag Ruler', description: 'Color-coded movement ruler showing speed, dash, and exceeded movement', author: 'manuelVo', version: '1.7.0', downloads: 3500, rating: 4.7, tags: ['movement', 'ui'] },
  { id: 'combat-tracker-plus', title: 'Combat Tracker+', description: 'Enhanced initiative with portraits, HP bars, and conditions', author: 'arcanist', version: '0.8.0', downloads: 3200, rating: 4.1, tags: ['combat', 'ui'] },
  { id: 'scene-packer', title: 'Scene Packer', description: 'Import/export complete scenes with all assets bundled', author: 'MercuryV', version: '2.2.0', downloads: 2900, rating: 4.5, tags: ['scenes', 'import'] },
];

type PluginTab = 'installed' | 'marketplace' | 'settings';

// ─── Star Rating ──────────────────────────────────────────────
const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="star-rating">
    {Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={`star ${i < Math.round(rating) ? 'filled' : ''}`}>★</span>
    ))}
    <span className="rating-num">{rating.toFixed(1)}</span>
  </div>
);

// ─── Installed Plugin Row ─────────────────────────────────────
const InstalledRow: React.FC<{
  plugin: InstalledPlugin;
  onToggle: () => void;
  onSettings: () => void;
  onUninstall: () => void;
  onUpdate?: () => void;
}> = ({ plugin, onToggle, onSettings, onUninstall, onUpdate }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`plugin-row ${plugin.enabled ? 'enabled' : 'disabled'} ${plugin.hasErrors ? 'has-error' : ''}`}>
      <div className="pr-main" onClick={() => setExpanded(!expanded)}>
        <div className="pr-toggle-wrap">
          <button
            className={`pr-toggle ${plugin.enabled ? 'on' : 'off'}`}
            onClick={e => { e.stopPropagation(); onToggle(); }}
            title={plugin.enabled ? 'Disable' : 'Enable'}
          />
        </div>

        <div className="pr-icon">
          {plugin.manifest.id === 'dnd5e' ? '⚔' :
           plugin.manifest.id === 'dice-so-nice' ? '🎲' :
           plugin.manifest.id === 'token-magic' ? '✨' : '🔌'}
        </div>

        <div className="pr-info">
          <div className="pr-name">
            {plugin.manifest.title}
            {plugin.manifest.id === 'dnd5e' && <span className="tag-system">System</span>}
            {plugin.hasErrors && <span className="tag-error">⚠ Error</span>}
            {plugin.hasUpdate && <span className="tag-update">Update</span>}
          </div>
          <div className="pr-meta">
            v{plugin.manifest.version} · {plugin.manifest.author}
            {plugin.enabled && plugin.loadTimeMs > 0 && (
              <span className="pr-load-time"> · {plugin.loadTimeMs}ms</span>
            )}
          </div>
        </div>

        <div className="pr-chevron">{expanded ? '▲' : '▼'}</div>
      </div>

      {expanded && (
        <div className="pr-expanded">
          <p className="pr-description">{plugin.manifest.description}</p>
          <div className="pr-compat">
            Compatibility: {plugin.manifest.compatibility.minimum}–{plugin.manifest.compatibility.maximum ?? 'latest'}
          </div>
          <div className="pr-actions">
            {plugin.hasUpdate && (
              <button className="pr-btn update" onClick={onUpdate}>⬆ Update to latest</button>
            )}
            <button className="pr-btn" onClick={onSettings}>⚙ Settings</button>
            {plugin.manifest.id !== 'dnd5e' && (
              <button className="pr-btn danger" onClick={onUninstall}>🗑 Uninstall</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Marketplace Card ─────────────────────────────────────────
const MarketplaceCard: React.FC<{
  plugin: MarketplacePlugin;
  installed: boolean;
  onInstall: () => void;
}> = ({ plugin, installed, onInstall }) => (
  <div className="market-card">
    <div className="mc-header">
      <div className="mc-icon">
        {plugin.system ? '🎲' : plugin.tags.includes('lighting') ? '💡' :
         plugin.tags.includes('combat') ? '⚔' : plugin.tags.includes('audio') ? '🎵' : '🔌'}
      </div>
      <div className="mc-info">
        <div className="mc-name">
          {plugin.title}
          {plugin.system && <span className="tag-system">System</span>}
          {plugin.premium && <span className="tag-premium">★ Premium</span>}
        </div>
        <div className="mc-author">by {plugin.author} · v{plugin.version}</div>
      </div>
    </div>

    <p className="mc-desc">{plugin.description}</p>

    <div className="mc-tags">
      {plugin.tags.slice(0, 3).map(t => (
        <span key={t} className="mc-tag">{t}</span>
      ))}
    </div>

    <div className="mc-footer">
      <StarRating rating={plugin.rating} />
      <span className="mc-downloads">↓ {(plugin.downloads / 1000).toFixed(1)}k</span>
      <button
        className={`mc-install-btn ${installed ? 'installed' : ''}`}
        onClick={onInstall}
        disabled={installed}
      >
        {installed ? '✓ Installed' : 'Install'}
      </button>
    </div>
  </div>
);

// ─── Main Plugin Manager ──────────────────────────────────────
export const PluginManager: React.FC<{
  isGM: boolean;
  onNotify: (msg: string) => void;
}> = ({ isGM, onNotify }) => {
  const [tab, setTab] = useState<PluginTab>('installed');
  const [plugins, setPlugins] = useState<InstalledPlugin[]>(INSTALLED_PLUGINS);
  const [installedIds, setInstalledIds] = useState(new Set(INSTALLED_PLUGINS.map(p => p.manifest.id)));
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sortBy, setSortBy] = useState<'downloads' | 'rating' | 'name'>('downloads');
  const [settingsPlugin, setSettingsPlugin] = useState<InstalledPlugin | null>(null);
  const [pendingReload, setPendingReload] = useState(false);

  const togglePlugin = useCallback((id: string) => {
    if (!isGM) return;
    setPlugins(ps => ps.map(p =>
      p.manifest.id === id ? { ...p, enabled: !p.enabled } : p
    ));
    setPendingReload(true);
    onNotify(`Plugin ${id} ${plugins.find(p => p.manifest.id === id)?.enabled ? 'disabled' : 'enabled'}. Reload to apply.`);
  }, [isGM, plugins, onNotify]);

  const installPlugin = useCallback((plugin: MarketplacePlugin) => {
    if (!isGM) return;
    const newPlugin: InstalledPlugin = {
      manifest: {
        id: plugin.id, title: plugin.title, description: plugin.description,
        version: plugin.version, author: plugin.author, license: 'MIT',
        compatibility: { minimum: '0.1.0', verified: '0.1.0' },
        esmodules: ['dist/index.js'],
      },
      enabled: true, hasUpdate: false, hasErrors: false, loadTimeMs: 0,
    };
    setPlugins(ps => [...ps, newPlugin]);
    setInstalledIds(ids => new Set([...ids, plugin.id]));
    setPendingReload(true);
    onNotify(`Installing ${plugin.title}...`);
    setTimeout(() => onNotify(`${plugin.title} installed! Reload to activate.`), 1500);
  }, [isGM, onNotify]);

  const uninstall = useCallback((id: string) => {
    if (!isGM) return;
    setPlugins(ps => ps.filter(p => p.manifest.id !== id));
    setInstalledIds(ids => { const next = new Set(ids); next.delete(id); return next; });
    setPendingReload(true);
    onNotify(`Plugin uninstalled. Reload to apply.`);
  }, [isGM, onNotify]);

  const allTags = [...new Set(MARKETPLACE_PLUGINS.flatMap(p => p.tags))].sort();

  const filteredMarket = MARKETPLACE_PLUGINS
    .filter(p => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase()) &&
          !p.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTag && !p.tags.includes(filterTag)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'downloads') return b.downloads - a.downloads;
      if (sortBy === 'rating') return b.rating - a.rating;
      return a.title.localeCompare(b.title);
    });

  const enabledCount = plugins.filter(p => p.enabled).length;
  const errorCount = plugins.filter(p => p.hasErrors).length;

  return (
    <div className="plugin-manager">
      {/* Header Stats */}
      <div className="pm-stats">
        <div className="pm-stat"><span className="ps-val">{plugins.length}</span><span className="ps-label">Installed</span></div>
        <div className="pm-stat"><span className="ps-val">{enabledCount}</span><span className="ps-label">Enabled</span></div>
        {errorCount > 0 && <div className="pm-stat error"><span className="ps-val">{errorCount}</span><span className="ps-label">Errors</span></div>}
        {pendingReload && (
          <button className="reload-btn" onClick={() => { setPendingReload(false); onNotify('Reloading...'); }}>
            ↻ Reload Required
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="pm-tabs">
        {(['installed', 'marketplace', 'settings'] as PluginTab[]).map(t => (
          <button key={t} className={`pm-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'installed' ? '🔌 Installed' : t === 'marketplace' ? '🛒 Browse' : '⚙ Settings'}
          </button>
        ))}
      </div>

      <div className="pm-body">
        {/* Installed Tab */}
        {tab === 'installed' && (
          <div className="installed-list">
            {plugins.map(plugin => (
              <InstalledRow
                key={plugin.manifest.id}
                plugin={plugin}
                onToggle={() => togglePlugin(plugin.manifest.id)}
                onSettings={() => setSettingsPlugin(plugin)}
                onUninstall={() => uninstall(plugin.manifest.id)}
                onUpdate={() => onNotify(`Updating ${plugin.manifest.title}...`)}
              />
            ))}

            {!isGM && (
              <div className="pm-gm-notice">Only the GM can manage plugins</div>
            )}
          </div>
        )}

        {/* Marketplace Tab */}
        {tab === 'marketplace' && (
          <div className="marketplace">
            <div className="market-filters">
              <input
                className="market-search"
                placeholder="Search plugins..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              <select className="market-select" value={filterTag} onChange={e => setFilterTag(e.target.value)}>
                <option value="">All Tags</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="market-select" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                <option value="downloads">Popular</option>
                <option value="rating">Top Rated</option>
                <option value="name">A–Z</option>
              </select>
            </div>

            <div className="market-count">{filteredMarket.length} plugins found</div>

            <div className="market-grid">
              {filteredMarket.map(plugin => (
                <MarketplaceCard
                  key={plugin.id}
                  plugin={plugin}
                  installed={installedIds.has(plugin.id)}
                  onInstall={() => installPlugin(plugin)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {tab === 'settings' && (
          <div className="pm-settings">
            <div className="pms-group">
              <div className="pms-label">Plugin Behavior</div>
              {[
                ['Auto-update compatible plugins', false],
                ['Show load times in plugin list', true],
                ['Sandbox untrusted plugins', true],
                ['Allow player-visible plugin data', false],
                ['Hot reload on file change (dev)', false],
              ].map(([label, checked]) => (
                <label key={label as string} className="pms-toggle">
                  <input type="checkbox" defaultChecked={checked as boolean} disabled={!isGM} />
                  <span>{label as string}</span>
                </label>
              ))}
            </div>

            <div className="pms-group">
              <div className="pms-label">Data & Storage</div>
              <div className="pms-info-row">
                <span>Plugin data directory</span>
                <code className="pms-code">~/.mythicforge/plugins/</code>
              </div>
              <div className="pms-info-row">
                <span>Cache size</span>
                <span className="pms-val">12.4 MB</span>
              </div>
              {isGM && (
                <button className="pms-btn" onClick={() => onNotify('Cache cleared')}>
                  Clear Plugin Cache
                </button>
              )}
            </div>

            <div className="pms-group">
              <div className="pms-label">Developer Tools</div>
              <div className="pms-info-row">
                <span>Load from local path</span>
                <button className="pms-btn" onClick={() => onNotify('Browse for local plugin folder...')}>Browse...</button>
              </div>
              <div className="pms-info-row">
                <span>Plugin API version</span>
                <code className="pms-code">0.1.0</code>
              </div>
              <div className="pms-info-row">
                <span>Plugin documentation</span>
                <a href="#" className="pms-link">docs.mythicforge.io/plugins</a>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .plugin-manager { display:flex; flex-direction:column; height:100%; }
        .pm-stats { display:flex; align-items:center; gap:12px; padding:8px 12px;
          background:var(--bg-secondary); border-bottom:1px solid var(--border-default); flex-shrink:0; }
        .pm-stat { display:flex; flex-direction:column; align-items:center; }
        .pm-stat.error .ps-val { color:var(--text-error); }
        .ps-val { font-family:var(--font-display); font-size:16px; font-weight:700; color:var(--gold-bright); line-height:1; }
        .ps-label { font-size:9px; color:var(--text-muted); letter-spacing:.5px; text-transform:uppercase; font-family:var(--font-display); }
        .reload-btn { margin-left:auto; background:rgba(193,58,80,.15); border:1px solid var(--crimson-bright);
          color:var(--crimson-bright); padding:4px 10px; border-radius:3px; cursor:pointer;
          font-size:11px; font-family:var(--font-display); letter-spacing:.3px; transition:all .12s; }
        .reload-btn:hover { background:rgba(193,58,80,.3); }
        .pm-tabs { display:flex; border-bottom:1px solid var(--border-default); flex-shrink:0; }
        .pm-tab { flex:1; padding:8px 4px; font-size:10px; color:var(--text-muted); background:none;
          border:none; border-bottom:2px solid transparent; cursor:pointer; transition:all .12s; }
        .pm-tab:hover { color:var(--text-primary); }
        .pm-tab.active { color:var(--gold-bright); border-bottom-color:var(--gold-bright); }
        .pm-body { flex:1; overflow-y:auto; }
        .installed-list { padding:8px; display:flex; flex-direction:column; gap:4px; }
        .plugin-row { border:1px solid var(--border-default); border-radius:4px; overflow:hidden;
          transition:border-color .15s; }
        .plugin-row.enabled { border-color:var(--border-default); }
        .plugin-row.disabled { opacity:.6; }
        .plugin-row.has-error { border-color:var(--crimson-default); }
        .pr-main { display:flex; align-items:center; gap:8px; padding:8px 10px; cursor:pointer;
          background:var(--bg-elevated); transition:background .1s; }
        .pr-main:hover { background:var(--bg-panel-2); }
        .pr-toggle-wrap { flex-shrink:0; }
        .pr-toggle { width:32px; height:16px; border-radius:8px; border:none; cursor:pointer;
          position:relative; transition:background .2s; }
        .pr-toggle.on { background:var(--teal-default); }
        .pr-toggle.off { background:var(--border-strong); }
        .pr-toggle::after { content:''; position:absolute; top:2px; width:12px; height:12px;
          border-radius:50%; background:white; transition:left .2s; }
        .pr-toggle.on::after { left:18px; }
        .pr-toggle.off::after { left:2px; }
        .pr-icon { font-size:18px; flex-shrink:0; }
        .pr-info { flex:1; min-width:0; }
        .pr-name { font-family:var(--font-display); font-size:11px; letter-spacing:.3px;
          color:var(--text-primary); display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .pr-meta { font-size:10px; color:var(--text-muted); margin-top:1px; }
        .pr-load-time { color:var(--text-disabled); }
        .pr-chevron { font-size:9px; color:var(--text-muted); flex-shrink:0; }
        .tag-system { background:rgba(26,143,127,.2); border:1px solid var(--teal-default);
          color:var(--teal-bright); font-size:8px; padding:1px 5px; border-radius:10px; letter-spacing:.3px; }
        .tag-error { background:rgba(193,58,80,.15); border:1px solid var(--crimson-default);
          color:var(--crimson-bright); font-size:8px; padding:1px 5px; border-radius:10px; }
        .tag-update { background:rgba(201,168,76,.15); border:1px solid var(--gold-default);
          color:var(--gold-bright); font-size:8px; padding:1px 5px; border-radius:10px; }
        .tag-premium { background:rgba(201,168,76,.2); border:1px solid var(--gold-bright);
          color:var(--gold-light); font-size:8px; padding:1px 5px; border-radius:10px; }
        .pr-expanded { padding:10px 12px; background:var(--bg-panel); border-top:1px solid var(--border-subtle); }
        .pr-description { font-size:12px; color:var(--text-secondary); margin-bottom:6px; line-height:1.4; }
        .pr-compat { font-size:10px; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:8px; }
        .pr-actions { display:flex; gap:5px; flex-wrap:wrap; }
        .pr-btn { background:none; border:1px solid var(--border-default); color:var(--text-muted);
          padding:4px 10px; border-radius:3px; cursor:pointer; font-size:11px; transition:all .1s; }
        .pr-btn:hover { border-color:var(--gold-default); color:var(--gold-bright); }
        .pr-btn.update { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
        .pr-btn.danger:hover { border-color:var(--crimson-bright); color:var(--crimson-bright); }
        .pm-gm-notice { text-align:center; color:var(--text-muted); font-size:11px; padding:16px; font-style:italic; }
        .marketplace { display:flex; flex-direction:column; height:100%; }
        .market-filters { display:flex; gap:5px; padding:8px; border-bottom:1px solid var(--border-subtle); flex-shrink:0; }
        .market-search { flex:1; background:var(--bg-elevated); border:1px solid var(--border-default);
          color:var(--text-primary); padding:5px 8px; border-radius:3px; font-size:11px; outline:none; }
        .market-search:focus { border-color:var(--gold-default); }
        .market-select { background:var(--bg-elevated); border:1px solid var(--border-default);
          color:var(--text-secondary); padding:4px 6px; border-radius:3px; font-size:10px; outline:none; }
        .market-count { font-size:10px; color:var(--text-muted); padding:4px 8px; font-family:var(--font-mono);
          flex-shrink:0; }
        .market-grid { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px; }
        .market-card { background:var(--bg-elevated); border:1px solid var(--border-default);
          border-radius:6px; padding:10px; transition:border-color .15s; }
        .market-card:hover { border-color:var(--border-strong); }
        .mc-header { display:flex; align-items:flex-start; gap:8px; margin-bottom:6px; }
        .mc-icon { font-size:24px; flex-shrink:0; }
        .mc-info { flex:1; min-width:0; }
        .mc-name { font-family:var(--font-display); font-size:12px; letter-spacing:.3px; color:var(--text-primary);
          display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .mc-author { font-size:10px; color:var(--text-muted); margin-top:1px; }
        .mc-desc { font-size:11px; color:var(--text-secondary); margin-bottom:6px; line-height:1.4; }
        .mc-tags { display:flex; gap:3px; flex-wrap:wrap; margin-bottom:8px; }
        .mc-tag { font-size:9px; padding:1px 6px; border-radius:10px; background:rgba(136,144,168,.1);
          border:1px solid var(--border-default); color:var(--text-muted); font-family:var(--font-display); }
        .mc-footer { display:flex; align-items:center; gap:8px; }
        .star-rating { display:flex; align-items:center; gap:2px; }
        .star { font-size:10px; color:var(--border-strong); }
        .star.filled { color:var(--gold-bright); }
        .rating-num { font-size:10px; color:var(--text-muted); font-family:var(--font-mono); margin-left:2px; }
        .mc-downloads { font-size:10px; color:var(--text-muted); margin-left:auto; font-family:var(--font-mono); }
        .mc-install-btn { background:none; border:1px solid var(--gold-default); color:var(--gold-bright);
          padding:4px 12px; border-radius:3px; cursor:pointer; font-family:var(--font-display);
          font-size:10px; letter-spacing:.3px; transition:all .12s; }
        .mc-install-btn:hover:not(:disabled) { background:var(--gold-glow); }
        .mc-install-btn.installed { border-color:var(--teal-default); color:var(--teal-bright); cursor:default; }
        .mc-install-btn:disabled { opacity:.7; }
        .pm-settings { padding:12px; display:flex; flex-direction:column; gap:14px; }
        .pms-group { display:flex; flex-direction:column; gap:8px; }
        .pms-label { font-family:var(--font-display); font-size:10px; letter-spacing:1px;
          color:var(--gold-default); text-transform:uppercase; }
        .pms-toggle { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; color:var(--text-secondary); }
        .pms-toggle input { accent-color:var(--gold-bright); }
        .pms-info-row { display:flex; align-items:center; justify-content:space-between; font-size:11px; color:var(--text-secondary); }
        .pms-code { font-family:var(--font-mono); font-size:10px; color:var(--teal-bright);
          background:rgba(26,143,127,.1); padding:2px 6px; border-radius:3px; }
        .pms-val { color:var(--text-primary); font-family:var(--font-mono); font-size:11px; }
        .pms-btn { background:none; border:1px solid var(--border-default); color:var(--text-muted);
          padding:4px 10px; border-radius:3px; cursor:pointer; font-size:11px; transition:all .1s; }
        .pms-btn:hover { border-color:var(--gold-default); color:var(--gold-bright); }
        .pms-link { color:var(--gold-bright); font-size:11px; }
      `}</style>
    </div>
  );
};

export default PluginManager;
