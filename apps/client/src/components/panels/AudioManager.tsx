// ============================================================
// AudioManager — Playlist control, ambient audio, SFX
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Playlist, PlaylistSound } from '@mythicforge/shared';

// ─── Mock Playlists ───────────────────────────────────────────
const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-dungeon',
    campaignId: '',
    name: 'Dungeon Ambience',
    description: 'Dark atmospheric dungeon sounds',
    mode: 'sequential',
    playing: true,
    volume: 0.4,
    fade: 3000,
    sounds: [
      { id: 'snd-1', name: 'Dungeon Depths', src: '', volume: 1.0, repeat: true, playing: true },
      { id: 'snd-2', name: 'Ancient Halls', src: '', volume: 0.9, repeat: true, playing: false },
      { id: 'snd-3', name: 'The Catacombs', src: '', volume: 0.95, repeat: true, playing: false },
    ],
  },
  {
    id: 'pl-combat',
    campaignId: '',
    name: 'Combat — Epic Battles',
    description: 'High energy combat music',
    mode: 'shuffle',
    playing: false,
    volume: 0.7,
    fade: 1000,
    sounds: [
      { id: 'snd-4', name: 'Battle Fury', src: '', volume: 1.0, repeat: false, playing: false },
      { id: 'snd-5', name: 'Clash of Steel', src: '', volume: 0.9, repeat: false, playing: false },
      { id: 'snd-6', name: 'The Arena', src: '', volume: 0.95, repeat: false, playing: false },
    ],
  },
  {
    id: 'pl-tavern',
    campaignId: '',
    name: 'Tavern & Town',
    description: 'Light hearted music for towns',
    mode: 'shuffle',
    playing: false,
    volume: 0.5,
    fade: 2000,
    sounds: [
      { id: 'snd-7', name: 'The Prancing Pony', src: '', volume: 1.0, repeat: true, playing: false },
      { id: 'snd-8', name: 'Merchant Quarter', src: '', volume: 0.85, repeat: true, playing: false },
    ],
  },
  {
    id: 'pl-tension',
    campaignId: '',
    name: 'Tension & Drama',
    description: 'Tense investigation music',
    mode: 'sequential',
    playing: false,
    volume: 0.45,
    fade: 2500,
    sounds: [
      { id: 'snd-9', name: 'Something Stirs', src: '', volume: 1.0, repeat: true, playing: false },
      { id: 'snd-10', name: 'Dark Secrets', src: '', volume: 0.9, repeat: true, playing: false },
    ],
  },
];

const SFX_LIBRARY = [
  { id: 'sfx-1', name: 'Thunder Crack', icon: '⚡', category: 'Weather' },
  { id: 'sfx-2', name: 'Door Creak', icon: '🚪', category: 'Environment' },
  { id: 'sfx-3', name: 'Bell Tower', icon: '🔔', category: 'Environment' },
  { id: 'sfx-4', name: 'Sword Draw', icon: '⚔', category: 'Combat' },
  { id: 'sfx-5', name: 'Arrow Volley', icon: '🏹', category: 'Combat' },
  { id: 'sfx-6', name: 'Explosion', icon: '💥', category: 'Magic' },
  { id: 'sfx-7', name: 'Magic Spell', icon: '✨', category: 'Magic' },
  { id: 'sfx-8', name: 'Dragon Roar', icon: '🐉', category: 'Creatures' },
  { id: 'sfx-9', name: 'Wolf Howl', icon: '🐺', category: 'Creatures' },
  { id: 'sfx-10', name: 'Rain on Stone', icon: '🌧', category: 'Weather' },
  { id: 'sfx-11', name: 'Torch Flicker', icon: '🔥', category: 'Environment' },
  { id: 'sfx-12', name: 'Chains Rattle', icon: '⛓', category: 'Environment' },
];

// ─── Volume Knob Component ────────────────────────────────────
const VolumeSlider: React.FC<{
  value: number;
  onChange: (v: number) => void;
  label?: string;
}> = ({ value, onChange, label }) => (
  <div className="vol-control">
    {label && <span className="vol-label">{label}</span>}
    <input
      type="range"
      min={0} max={1} step={0.01}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="vol-slider"
    />
    <span className="vol-pct">{Math.round(value * 100)}%</span>
  </div>
);

// ─── Playlist Card ────────────────────────────────────────────
const PlaylistCard: React.FC<{
  playlist: Playlist;
  isGM: boolean;
  onToggle: () => void;
  onVolumeChange: (v: number) => void;
  onSoundToggle: (soundId: string) => void;
  onModeChange: (mode: Playlist['mode']) => void;
}> = ({ playlist, isGM, onToggle, onVolumeChange, onSoundToggle, onModeChange }) => {
  const [expanded, setExpanded] = useState(false);
  const activeSound = playlist.sounds.find(s => s.playing);

  return (
    <div className={`playlist-card ${playlist.playing ? 'playing' : ''}`}>
      <div className="playlist-header" onClick={() => setExpanded(!expanded)}>
        <div className="playlist-icon">{playlist.playing ? '🔊' : '🔈'}</div>
        <div className="playlist-info">
          <div className="playlist-name">{playlist.name}</div>
          <div className="playlist-status">
            {playlist.playing
              ? activeSound ? `▶ ${activeSound.name}` : '▶ Playing'
              : '⏸ Stopped'
            }
          </div>
        </div>
        <div className="playlist-controls">
          {isGM && (
            <button
              className={`pl-btn ${playlist.playing ? 'stop' : 'play'}`}
              onClick={e => { e.stopPropagation(); onToggle(); }}
              title={playlist.playing ? 'Stop' : 'Play'}
            >
              {playlist.playing ? '⏹' : '▶'}
            </button>
          )}
          <button className="pl-expand" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="playlist-expanded">
          <VolumeSlider
            value={playlist.volume}
            onChange={onVolumeChange}
            label="Volume"
          />

          {isGM && (
            <div className="mode-selector">
              {(['sequential', 'shuffle', 'simultaneous'] as const).map(m => (
                <button
                  key={m}
                  className={`mode-btn ${playlist.mode === m ? 'active' : ''}`}
                  onClick={() => onModeChange(m)}
                >
                  {m === 'sequential' ? '⏭ Seq' : m === 'shuffle' ? '🔀 Shuffle' : '◈ All'}
                </button>
              ))}
            </div>
          )}

          <div className="sound-list">
            {playlist.sounds.map(sound => (
              <div
                key={sound.id}
                className={`sound-row ${sound.playing ? 'active-sound' : ''}`}
                onClick={() => isGM && onSoundToggle(sound.id)}
              >
                <div className="sound-playing-ind">{sound.playing ? '▶' : '○'}</div>
                <div className="sound-name">{sound.name}</div>
                {sound.repeat && <div className="sound-loop" title="Looping">🔁</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SFX Button ───────────────────────────────────────────────
const SFXButton: React.FC<{
  sfx: typeof SFX_LIBRARY[0];
  isGM: boolean;
  onPlay: () => void;
}> = ({ sfx, isGM, onPlay }) => {
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    if (!isGM) return;
    setPlaying(true);
    onPlay();
    setTimeout(() => setPlaying(false), 1500);
  };

  return (
    <button
      className={`sfx-btn ${playing ? 'sfx-playing' : ''} ${!isGM ? 'disabled' : ''}`}
      onClick={handlePlay}
      title={sfx.name}
      disabled={!isGM}
    >
      <span className="sfx-icon">{sfx.icon}</span>
      <span className="sfx-name">{sfx.name}</span>
    </button>
  );
};

// ─── Main AudioManager ────────────────────────────────────────
export const AudioManager: React.FC<{
  isGM: boolean;
  onNotify?: (msg: string) => void;
}> = ({ isGM, onNotify }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>(DEFAULT_PLAYLISTS);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [ambientVolume, setAmbientVolume] = useState(0.5);
  const [sfxVolume, setSfxVolume] = useState(0.7);
  const [activeTab, setActiveTab] = useState<'playlists' | 'sfx' | 'settings'>('playlists');
  const [sfxSearch, setSfxSearch] = useState('');
  const [sfxCategory, setSfxCategory] = useState('');

  const togglePlaylist = useCallback((id: string) => {
    setPlaylists(pls => pls.map(pl => {
      if (pl.id !== id) return { ...pl, playing: false }; // stop others
      const newPlaying = !pl.playing;
      onNotify?.(newPlaying ? `▶ ${pl.name}` : `⏹ ${pl.name}`);
      return { ...pl, playing: newPlaying };
    }));
  }, [onNotify]);

  const updateVolume = useCallback((id: string, volume: number) => {
    setPlaylists(pls => pls.map(pl => pl.id === id ? { ...pl, volume } : pl));
  }, []);

  const toggleSound = useCallback((playlistId: string, soundId: string) => {
    setPlaylists(pls => pls.map(pl => {
      if (pl.id !== playlistId) return pl;
      return {
        ...pl,
        sounds: pl.sounds.map(s => ({
          ...s,
          playing: s.id === soundId ? !s.playing : false,
        })),
      };
    }));
  }, []);

  const updateMode = useCallback((id: string, mode: Playlist['mode']) => {
    setPlaylists(pls => pls.map(pl => pl.id === id ? { ...pl, mode } : pl));
  }, []);

  const sfxCategories = [...new Set(SFX_LIBRARY.map(s => s.category))];
  const filteredSFX = SFX_LIBRARY.filter(s => {
    if (sfxSearch && !s.name.toLowerCase().includes(sfxSearch.toLowerCase())) return false;
    if (sfxCategory && s.category !== sfxCategory) return false;
    return true;
  });

  const activePlaylist = playlists.find(p => p.playing);

  return (
    <div className="audio-manager">
      {/* Now Playing Bar */}
      <div className="now-playing">
        <div className="np-icon">{activePlaylist ? '🔊' : '🔇'}</div>
        <div className="np-info">
          <div className="np-label">{activePlaylist ? activePlaylist.name : 'No audio playing'}</div>
          {activePlaylist && (
            <div className="np-track">
              {activePlaylist.sounds.find(s => s.playing)?.name ?? 'Loading...'}
            </div>
          )}
        </div>
        {activePlaylist && isGM && (
          <button className="np-stop" onClick={() => togglePlaylist(activePlaylist.id)}>⏹</button>
        )}
      </div>

      {/* Master Volume */}
      <div className="master-vol">
        <VolumeSlider value={masterVolume} onChange={setMasterVolume} label="🔊 Master" />
      </div>

      {/* Tabs */}
      <div className="audio-tabs">
        {(['playlists', 'sfx', 'settings'] as const).map(t => (
          <button key={t} className={`audio-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'playlists' ? '🎵 Playlists' : t === 'sfx' ? '🎭 SFX' : '⚙ Settings'}
          </button>
        ))}
      </div>

      <div className="audio-body">
        {/* Playlists */}
        {activeTab === 'playlists' && (
          <div className="playlists-list">
            {playlists.map(pl => (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                isGM={isGM}
                onToggle={() => togglePlaylist(pl.id)}
                onVolumeChange={v => updateVolume(pl.id, v)}
                onSoundToggle={soundId => toggleSound(pl.id, soundId)}
                onModeChange={mode => updateMode(pl.id, mode)}
              />
            ))}
            {isGM && (
              <button className="add-playlist-btn" onClick={() => onNotify?.('Playlist creation — coming in v0.2')}>
                + New Playlist
              </button>
            )}
          </div>
        )}

        {/* SFX Library */}
        {activeTab === 'sfx' && (
          <div className="sfx-library">
            <div className="sfx-filters">
              <input
                className="sfx-search"
                placeholder="Search sounds..."
                value={sfxSearch}
                onChange={e => setSfxSearch(e.target.value)}
              />
              <select className="sfx-cat-select" value={sfxCategory} onChange={e => setSfxCategory(e.target.value)}>
                <option value="">All Categories</option>
                {sfxCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <VolumeSlider value={sfxVolume} onChange={setSfxVolume} label="SFX Volume" />
            <div className="sfx-grid">
              {filteredSFX.map(sfx => (
                <SFXButton
                  key={sfx.id}
                  sfx={sfx}
                  isGM={isGM}
                  onPlay={() => onNotify?.(`▶ ${sfx.name}`)}
                />
              ))}
            </div>
            {!isGM && (
              <div className="sfx-notice">Only the GM can play sound effects</div>
            )}
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="audio-settings">
            <div className="setting-group">
              <div className="setting-label">Audio Channels</div>
              <VolumeSlider value={ambientVolume} onChange={setAmbientVolume} label="Ambient Music" />
              <VolumeSlider value={sfxVolume} onChange={setSfxVolume} label="Sound Effects" />
            </div>
            <div className="setting-group">
              <div className="setting-label">Preferences</div>
              {[
                ['Mute when window unfocused', false],
                ['Fade between tracks', true],
                ['GM controls only', true],
                ['Positional audio', false],
              ].map(([label, checked]) => (
                <label key={label as string} className="setting-toggle">
                  <input type="checkbox" defaultChecked={checked as boolean} />
                  <span>{label as string}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .audio-manager { display:flex; flex-direction:column; height:100%; }
        .now-playing { display:flex; align-items:center; gap:8px; padding:10px 12px;
          background:var(--bg-secondary); border-bottom:1px solid var(--border-default); flex-shrink:0; }
        .np-icon { font-size:20px; }
        .np-info { flex:1; min-width:0; }
        .np-label { font-family:var(--font-display); font-size:11px; letter-spacing:.3px; color:var(--text-primary);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .np-track { font-size:10px; color:var(--text-muted); font-style:italic; margin-top:1px; }
        .np-stop { background:none; border:1px solid var(--border-default); color:var(--text-muted);
          width:24px; height:24px; border-radius:3px; cursor:pointer; transition:all .1s; }
        .np-stop:hover { border-color:var(--crimson-bright); color:var(--crimson-bright); }
        .master-vol { padding:8px 12px; border-bottom:1px solid var(--border-subtle); flex-shrink:0; }
        .vol-control { display:flex; align-items:center; gap:8px; }
        .vol-label { font-size:11px; color:var(--text-muted); white-space:nowrap; min-width:80px; }
        .vol-slider { flex:1; height:3px; accent-color:var(--gold-bright); cursor:pointer; }
        .vol-pct { font-family:var(--font-mono); font-size:10px; color:var(--text-muted); min-width:32px; text-align:right; }
        .audio-tabs { display:flex; border-bottom:1px solid var(--border-default); flex-shrink:0; }
        .audio-tab { flex:1; padding:7px 4px; font-size:10px; color:var(--text-muted); background:none;
          border:none; border-bottom:2px solid transparent; cursor:pointer; transition:all .12s; }
        .audio-tab:hover { color:var(--text-primary); }
        .audio-tab.active { color:var(--gold-bright); border-bottom-color:var(--gold-bright); }
        .audio-body { flex:1; overflow-y:auto; }
        .playlists-list { padding:8px; display:flex; flex-direction:column; gap:6px; }
        .playlist-card { border:1px solid var(--border-default); border-radius:4px; overflow:hidden;
          transition:border-color .15s; }
        .playlist-card.playing { border-color:var(--gold-default); }
        .playlist-header { display:flex; align-items:center; gap:8px; padding:8px 10px; cursor:pointer;
          background:var(--bg-elevated); transition:background .1s; }
        .playlist-header:hover { background:var(--bg-panel-2); }
        .playlist-icon { font-size:16px; }
        .playlist-info { flex:1; min-width:0; }
        .playlist-name { font-family:var(--font-display); font-size:11px; letter-spacing:.3px; color:var(--text-primary); }
        .playlist-status { font-size:10px; color:var(--text-muted); margin-top:1px; font-style:italic; }
        .playlist-controls { display:flex; gap:4px; align-items:center; }
        .pl-btn { width:26px; height:26px; border-radius:3px; border:1px solid var(--border-default);
          background:none; color:var(--text-muted); cursor:pointer; font-size:12px;
          display:flex; align-items:center; justify-content:center; transition:all .1s; }
        .pl-btn.play:hover { border-color:var(--teal-bright); color:var(--teal-bright); }
        .pl-btn.stop:hover { border-color:var(--crimson-bright); color:var(--crimson-bright); }
        .pl-expand { background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:10px; padding:4px; }
        .playlist-expanded { padding:8px 10px; background:var(--bg-panel); border-top:1px solid var(--border-subtle); }
        .mode-selector { display:flex; gap:4px; margin:6px 0; }
        .mode-btn { flex:1; background:none; border:1px solid var(--border-default); color:var(--text-muted);
          padding:3px 6px; border-radius:3px; cursor:pointer; font-size:10px; transition:all .1s; }
        .mode-btn.active { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
        .sound-list { display:flex; flex-direction:column; gap:2px; margin-top:6px; }
        .sound-row { display:flex; align-items:center; gap:6px; padding:4px 6px; border-radius:3px;
          cursor:pointer; transition:background .1s; font-size:11px; }
        .sound-row:hover { background:var(--bg-elevated); }
        .sound-row.active-sound { background:rgba(201,168,76,.08); }
        .sound-playing-ind { width:14px; font-size:10px; color:var(--gold-default); }
        .sound-name { flex:1; color:var(--text-secondary); }
        .sound-loop { font-size:10px; opacity:.6; }
        .add-playlist-btn { background:none; border:1px dashed var(--border-default); color:var(--text-muted);
          width:100%; padding:8px; border-radius:4px; cursor:pointer; font-size:11px; transition:all .12s; }
        .add-playlist-btn:hover { border-color:var(--gold-default); color:var(--gold-bright); }
        .sfx-library { padding:8px; }
        .sfx-filters { display:flex; gap:6px; margin-bottom:8px; }
        .sfx-search { flex:1; background:var(--bg-elevated); border:1px solid var(--border-default);
          color:var(--text-primary); padding:5px 8px; border-radius:3px; font-size:11px; outline:none; }
        .sfx-search:focus { border-color:var(--gold-default); }
        .sfx-cat-select { background:var(--bg-elevated); border:1px solid var(--border-default);
          color:var(--text-secondary); padding:4px 6px; border-radius:3px; font-size:10px; outline:none; }
        .sfx-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:8px; }
        .sfx-btn { background:var(--bg-elevated); border:1px solid var(--border-default);
          border-radius:4px; padding:8px 4px; cursor:pointer; transition:all .12s;
          display:flex; flex-direction:column; align-items:center; gap:3px; }
        .sfx-btn:hover:not(.disabled) { border-color:var(--gold-default); background:var(--gold-glow); }
        .sfx-btn.sfx-playing { border-color:var(--teal-bright); background:rgba(26,143,127,.15);
          animation:pulse .5s ease; }
        .sfx-btn.disabled { opacity:.4; cursor:not-allowed; }
        .sfx-icon { font-size:20px; }
        .sfx-name { font-size:9px; color:var(--text-muted); text-align:center; font-family:var(--font-display);
          letter-spacing:.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; }
        .sfx-notice { text-align:center; color:var(--text-muted); font-size:11px; padding:12px; font-style:italic; }
        .audio-settings { padding:12px; display:flex; flex-direction:column; gap:14px; }
        .setting-group { display:flex; flex-direction:column; gap:8px; }
        .setting-label { font-family:var(--font-display); font-size:10px; letter-spacing:1px;
          color:var(--gold-default); text-transform:uppercase; margin-bottom:2px; }
        .setting-toggle { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; color:var(--text-secondary); }
        .setting-toggle input { accent-color:var(--gold-bright); }
      `}</style>
    </div>
  );
};

export default AudioManager;
