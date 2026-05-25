// ============================================================
// SceneManager — Create, manage, and transition scenes
// ============================================================

import React, { useState, useCallback } from 'react';
import type { Scene } from '@mythicforge/shared';

interface SceneManagerProps {
  scenes: Scene[];
  activeSceneId: string | null;
  isGM: boolean;
  onActivate: (sceneId: string) => void;
  onCreate: (data: Partial<Scene>) => void;
  onDelete: (sceneId: string) => void;
  onUpdate: (sceneId: string, data: Partial<Scene>) => void;
  onNotify: (msg: string) => void;
}

interface NewSceneForm {
  name: string;
  width: number;
  height: number;
  gridType: Scene['grid']['type'];
  gridSize: number;
  gridScale: string;
  globalLightLevel: number;
  darknessLevel: number;
  tokenVision: boolean;
  weather: Scene['weather'];
}

const DEFAULT_FORM: NewSceneForm = {
  name: '',
  width: 4000,
  height: 3000,
  gridType: 'square',
  gridSize: 100,
  gridScale: '5 ft',
  globalLightLevel: 0.6,
  darknessLevel: 0.3,
  tokenVision: true,
  weather: { type: 'none', intensity: 0 },
};

const SCENE_PRESETS = [
  { name: 'Dungeon Chamber', icon: '⚰', width: 3000, height: 2000, darkness: 0.95, globalLight: 0, vision: true, weather: 'none' as const },
  { name: 'Outdoor Forest', icon: '🌲', width: 5000, height: 4000, darkness: 0.1, globalLight: 0.9, vision: true, weather: 'none' as const },
  { name: 'Town Square', icon: '🏛', width: 4000, height: 4000, darkness: 0, globalLight: 1.0, vision: false, weather: 'none' as const },
  { name: 'Cave System', icon: '🕳', width: 3500, height: 3000, darkness: 1.0, globalLight: 0, vision: true, weather: 'none' as const },
  { name: 'Castle Interior', icon: '🏰', width: 4500, height: 3500, darkness: 0.7, globalLight: 0.1, vision: true, weather: 'none' as const },
  { name: 'Coastal Docks', icon: '⚓', width: 5000, height: 3000, darkness: 0, globalLight: 0.8, vision: false, weather: 'rain' as const },
];

export const SceneManager: React.FC<SceneManagerProps> = ({
  scenes,
  activeSceneId,
  isGM,
  onActivate,
  onCreate,
  onDelete,
  onUpdate,
  onNotify,
}) => {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [form, setForm] = useState<NewSceneForm>(DEFAULT_FORM);
  const [editTarget, setEditTarget] = useState<Scene | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const applyPreset = (preset: typeof SCENE_PRESETS[0]) => {
    setForm(f => ({
      ...f,
      name: preset.name,
      width: preset.width,
      height: preset.height,
      globalLightLevel: preset.globalLight,
      darknessLevel: preset.darkness,
      tokenVision: preset.vision,
      weather: { type: preset.weather, intensity: preset.weather === 'rain' ? 0.5 : 0 },
    }));
  };

  const submitCreate = useCallback(() => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name,
      width: form.width,
      height: form.height,
      grid: {
        type: form.gridType,
        size: form.gridSize,
        scale: form.gridScale,
        color: '#888888',
        alpha: 0.3,
        offsetX: 0,
        offsetY: 0,
        snap: true,
      },
      tokens: [],
      lights: [],
      walls: [],
      notes: [],
      drawings: [],
      globalLightLevel: form.globalLightLevel,
      darknessLevel: form.darknessLevel,
      tokenVision: form.tokenVision,
      weather: form.weather,
      fogExplored: '',
    } as Partial<Scene>);
    onNotify(`Scene "${form.name}" created`);
    setForm(DEFAULT_FORM);
    setView('list');
  }, [form, onCreate, onNotify]);

  const field = <K extends keyof NewSceneForm>(key: K, value: NewSceneForm[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  // ── Scene List ───────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="scene-manager">
        {isGM && (
          <div className="sm-toolbar">
            <button className="sm-btn primary" onClick={() => setView('create')}>+ New Scene</button>
            <span className="sm-count">{scenes.length} scenes</span>
          </div>
        )}

        <div className="scene-list">
          {scenes.length === 0 && (
            <div className="scene-empty">
              <div className="se-icon">🗺</div>
              <div className="se-text">No scenes yet</div>
              {isGM && <div className="se-sub">Create your first scene to get started</div>}
            </div>
          )}

          {scenes.map(scene => (
            <div
              key={scene.id}
              className={`scene-card ${scene.id === activeSceneId ? 'active' : ''}`}
            >
              {/* Thumbnail */}
              <div className="scene-thumb">
                {scene.thumbnail
                  ? <img src={scene.thumbnail} alt={scene.name} />
                  : <div className="scene-thumb-placeholder">🗺</div>
                }
                {scene.id === activeSceneId && <div className="active-badge">● ACTIVE</div>}
                {scene.weather?.type !== 'none' && (
                  <div className="weather-badge">
                    {scene.weather?.type === 'rain' ? '🌧' : scene.weather?.type === 'snow' ? '❄' : '🌫'}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="scene-info">
                <div className="scene-name">{scene.name}</div>
                <div className="scene-meta">
                  <span>{Math.round(scene.width / scene.grid.size)} × {Math.round(scene.height / scene.grid.size)} {scene.grid.scale}</span>
                  <span>·</span>
                  <span>{scene.tokens.length} tokens</span>
                  {scene.lights.length > 0 && <><span>·</span><span>🔦 {scene.lights.length}</span></>}
                </div>
                <div className="scene-tags">
                  {scene.tokenVision && <span className="s-tag">👁 Vision</span>}
                  {scene.darknessLevel > 0.5 && <span className="s-tag dark">🌑 Dark</span>}
                  {scene.grid.type !== 'square' && <span className="s-tag">{scene.grid.type}</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="scene-actions">
                {isGM && scene.id !== activeSceneId && (
                  <button
                    className="scene-action-btn activate"
                    onClick={() => { onActivate(scene.id); onNotify(`Scene: ${scene.name}`); }}
                    title="Activate scene (all players follow)"
                  >
                    ▶ Activate
                  </button>
                )}
                {isGM && (
                  <>
                    <button
                      className="scene-action-btn"
                      onClick={() => { setEditTarget(scene); setView('edit'); }}
                      title="Edit scene settings"
                    >
                      ✏ Edit
                    </button>
                    {deleteConfirm === scene.id ? (
                      <div className="delete-confirm">
                        <button className="scene-action-btn danger" onClick={() => { onDelete(scene.id); setDeleteConfirm(null); }}>
                          Confirm Delete
                        </button>
                        <button className="scene-action-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button
                        className="scene-action-btn danger"
                        onClick={() => setDeleteConfirm(scene.id)}
                        title="Delete scene"
                      >
                        🗑
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <style>{`
          .scene-manager { display:flex; flex-direction:column; height:100%; }
          .sm-toolbar { display:flex; align-items:center; gap:8px; padding:8px;
            border-bottom:1px solid var(--border-default); flex-shrink:0; }
          .sm-btn { background:none; border:1px solid var(--border-default); color:var(--text-secondary);
            padding:5px 12px; border-radius:3px; cursor:pointer; font-family:var(--font-display);
            font-size:11px; letter-spacing:.3px; transition:all .12s; }
          .sm-btn.primary { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
          .sm-btn:hover { border-color:var(--gold-default); color:var(--gold-bright); }
          .sm-count { font-size:11px; color:var(--text-muted); margin-left:auto; font-family:var(--font-mono); }
          .scene-list { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:8px; }
          .scene-card { border:1px solid var(--border-default); border-radius:6px; overflow:hidden;
            background:var(--bg-elevated); transition:border-color .15s; }
          .scene-card.active { border-color:var(--gold-default); box-shadow:0 0 8px var(--gold-glow); }
          .scene-thumb { height:80px; background:var(--bg-panel); display:flex; align-items:center;
            justify-content:center; position:relative; overflow:hidden; }
          .scene-thumb img { width:100%; height:100%; object-fit:cover; }
          .scene-thumb-placeholder { font-size:32px; opacity:.3; }
          .active-badge { position:absolute; top:6px; left:6px; background:rgba(201,168,76,.9);
            color:#0a0b0e; font-family:var(--font-display); font-size:9px; letter-spacing:.5px;
            padding:2px 6px; border-radius:10px; }
          .weather-badge { position:absolute; top:6px; right:6px; font-size:14px; }
          .scene-info { padding:8px 10px; }
          .scene-name { font-family:var(--font-display); font-size:12px; color:var(--text-primary); margin-bottom:3px; }
          .scene-meta { font-size:10px; color:var(--text-muted); display:flex; gap:4px; flex-wrap:wrap; margin-bottom:4px; }
          .scene-tags { display:flex; gap:4px; flex-wrap:wrap; }
          .s-tag { font-size:9px; padding:1px 5px; border-radius:10px; background:rgba(136,144,168,.1);
            border:1px solid var(--border-default); color:var(--text-muted); font-family:var(--font-display); letter-spacing:.2px; }
          .s-tag.dark { border-color:var(--purple-default); color:var(--purple-bright); background:rgba(91,63,160,.1); }
          .scene-actions { display:flex; gap:4px; padding:6px 10px; border-top:1px solid var(--border-subtle);
            background:var(--bg-panel); flex-wrap:wrap; }
          .scene-action-btn { background:none; border:1px solid var(--border-default); color:var(--text-muted);
            padding:3px 8px; border-radius:3px; cursor:pointer; font-size:10px;
            font-family:var(--font-display); letter-spacing:.2px; transition:all .1s; }
          .scene-action-btn.activate { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
          .scene-action-btn:hover:not(.activate) { border-color:var(--gold-default); color:var(--gold-bright); }
          .scene-action-btn.danger:hover { border-color:var(--crimson-bright); color:var(--crimson-bright); }
          .delete-confirm { display:flex; gap:4px; }
          .scene-empty { display:flex; flex-direction:column; align-items:center; justify-content:center;
            height:160px; gap:8px; color:var(--text-muted); text-align:center; }
          .se-icon { font-size:36px; opacity:.3; }
          .se-text { font-family:var(--font-display); font-size:14px; color:var(--text-secondary); }
          .se-sub { font-size:12px; }
        `}</style>
      </div>
    );
  }

  // ── Create / Edit Form ───────────────────────────────────────
  return (
    <div className="scene-form">
      <div className="sf-header">
        <button className="sf-back" onClick={() => { setView('list'); setEditTarget(null); }}>← Back</button>
        <div className="sf-title">{view === 'create' ? 'New Scene' : `Edit: ${editTarget?.name}`}</div>
      </div>

      <div className="sf-body">
        {view === 'create' && (
          <>
            <div className="sf-section-label">Quick Presets</div>
            <div className="preset-grid">
              {SCENE_PRESETS.map(p => (
                <button key={p.name} className="preset-btn" onClick={() => applyPreset(p)}>
                  <span className="preset-icon">{p.icon}</span>
                  <span className="preset-name">{p.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sf-section-label">Basic Info</div>
        <div className="sf-field">
          <label>Name</label>
          <input className="sf-input" value={form.name} onChange={e => field('name', e.target.value)} placeholder="Scene name..." />
        </div>
        <div className="sf-row">
          <div className="sf-field">
            <label>Width (px)</label>
            <input className="sf-input" type="number" value={form.width} onChange={e => field('width', parseInt(e.target.value))} min={1000} max={20000} step={100} />
          </div>
          <div className="sf-field">
            <label>Height (px)</label>
            <input className="sf-input" type="number" value={form.height} onChange={e => field('height', parseInt(e.target.value))} min={1000} max={20000} step={100} />
          </div>
        </div>

        <div className="sf-section-label">Grid</div>
        <div className="sf-row">
          <div className="sf-field">
            <label>Grid Type</label>
            <select className="sf-select" value={form.gridType} onChange={e => field('gridType', e.target.value as Scene['grid']['type'])}>
              <option value="square">Square</option>
              <option value="hex-flat">Hex (Flat-top)</option>
              <option value="hex-pointy">Hex (Pointy-top)</option>
              <option value="none">None</option>
            </select>
          </div>
          <div className="sf-field">
            <label>Grid Size (px)</label>
            <input className="sf-input" type="number" value={form.gridSize} onChange={e => field('gridSize', parseInt(e.target.value))} min={40} max={300} />
          </div>
          <div className="sf-field">
            <label>Scale</label>
            <input className="sf-input" value={form.gridScale} onChange={e => field('gridScale', e.target.value)} placeholder="5 ft" />
          </div>
        </div>

        <div className="sf-section-label">Lighting & Vision</div>
        <div className="sf-row">
          <div className="sf-field">
            <label>Global Light ({Math.round(form.globalLightLevel * 100)}%)</label>
            <input className="sf-range" type="range" min={0} max={1} step={0.05} value={form.globalLightLevel} onChange={e => field('globalLightLevel', parseFloat(e.target.value))} />
          </div>
          <div className="sf-field">
            <label>Darkness ({Math.round(form.darknessLevel * 100)}%)</label>
            <input className="sf-range" type="range" min={0} max={1} step={0.05} value={form.darknessLevel} onChange={e => field('darknessLevel', parseFloat(e.target.value))} />
          </div>
        </div>
        <label className="sf-checkbox">
          <input type="checkbox" checked={form.tokenVision} onChange={e => field('tokenVision', e.target.checked)} />
          Enable Token Vision (fog of war based on token sight)
        </label>

        <div className="sf-section-label">Weather</div>
        <div className="sf-row">
          <div className="sf-field">
            <label>Weather Effect</label>
            <select className="sf-select"
              value={form.weather?.type ?? 'none'}
              onChange={e => field('weather', { type: e.target.value as Scene['weather']['type'], intensity: form.weather?.intensity ?? 0.5 })}
            >
              {['none','rain','snow','fog','blizzard','storm'].map(w => (
                <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
              ))}
            </select>
          </div>
          {form.weather?.type !== 'none' && (
            <div className="sf-field">
              <label>Intensity ({Math.round((form.weather?.intensity ?? 0) * 100)}%)</label>
              <input className="sf-range" type="range" min={0} max={1} step={0.1}
                value={form.weather?.intensity ?? 0.5}
                onChange={e => field('weather', { ...form.weather!, intensity: parseFloat(e.target.value) })}
              />
            </div>
          )}
        </div>

        <div className="sf-actions">
          <button className="sf-btn primary" onClick={view === 'create' ? submitCreate : () => {
            if (editTarget) onUpdate(editTarget.id, { name: form.name, darknessLevel: form.darknessLevel, globalLightLevel: form.globalLightLevel, weather: form.weather });
            setView('list');
            onNotify('Scene updated');
          }}>
            {view === 'create' ? 'Create Scene' : 'Save Changes'}
          </button>
          <button className="sf-btn" onClick={() => { setView('list'); setEditTarget(null); }}>Cancel</button>
        </div>
      </div>

      <style>{`
        .scene-form { display:flex; flex-direction:column; height:100%; }
        .sf-header { display:flex; align-items:center; gap:8px; padding:8px 10px;
          border-bottom:1px solid var(--border-default); flex-shrink:0; background:var(--bg-secondary); }
        .sf-back { background:none; border:1px solid var(--border-default); color:var(--text-muted);
          padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px; transition:all .1s; }
        .sf-back:hover { border-color:var(--gold-default); color:var(--gold-bright); }
        .sf-title { font-family:var(--font-display); font-size:12px; color:var(--gold-bright); letter-spacing:.5px; }
        .sf-body { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; }
        .sf-section-label { font-family:var(--font-display); font-size:10px; letter-spacing:1px;
          color:var(--gold-default); text-transform:uppercase; margin-top:4px; }
        .sf-field { display:flex; flex-direction:column; gap:3px; flex:1; }
        .sf-field label { font-size:10px; color:var(--text-muted); font-family:var(--font-display); letter-spacing:.3px; }
        .sf-input { background:var(--bg-elevated); border:1px solid var(--border-default); color:var(--text-primary);
          padding:5px 8px; border-radius:3px; font-size:12px; outline:none; }
        .sf-input:focus { border-color:var(--gold-default); }
        .sf-select { background:var(--bg-elevated); border:1px solid var(--border-default); color:var(--text-secondary);
          padding:5px 8px; border-radius:3px; font-size:12px; outline:none; }
        .sf-range { width:100%; accent-color:var(--gold-bright); }
        .sf-row { display:flex; gap:8px; flex-wrap:wrap; }
        .sf-checkbox { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-secondary); cursor:pointer; }
        .sf-checkbox input { accent-color:var(--gold-bright); }
        .preset-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
        .preset-btn { background:var(--bg-elevated); border:1px solid var(--border-default);
          border-radius:4px; padding:8px 4px; cursor:pointer; transition:all .12s;
          display:flex; flex-direction:column; align-items:center; gap:3px; }
        .preset-btn:hover { border-color:var(--gold-default); background:var(--gold-glow); }
        .preset-icon { font-size:20px; }
        .preset-name { font-size:9px; color:var(--text-muted); font-family:var(--font-display); letter-spacing:.2px; text-align:center; }
        .sf-actions { display:flex; gap:6px; padding-top:8px; border-top:1px solid var(--border-subtle); margin-top:4px; }
        .sf-btn { flex:1; background:none; border:1px solid var(--border-default); color:var(--text-secondary);
          padding:7px 12px; border-radius:3px; cursor:pointer; font-family:var(--font-display);
          font-size:11px; letter-spacing:.3px; transition:all .12s; }
        .sf-btn.primary { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
        .sf-btn.primary:hover { background:var(--gold-glow-strong); }
        .sf-btn:hover:not(.primary) { border-color:var(--text-muted); color:var(--text-primary); }
      `}</style>
    </div>
  );
};

export default SceneManager;
