// ============================================================
// CompendiumBrowser — Search monsters, spells, items, more
// ============================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';
import type { Actor, Item } from '@mythicforge/shared';

// ─── Types ───────────────────────────────────────────────────
type CompendiumTab = 'monsters' | 'spells' | 'items' | 'classes' | 'feats' | 'rules';

interface CompendiumEntry {
  id: string;
  name: string;
  type: string;
  img?: string;
  source?: string;
  tags: string[];
  data: Record<string, unknown>;
}

interface FilterState {
  search: string;
  cr?: string;
  school?: string;
  level?: string;
  source?: string;
  size?: string;
  type?: string;
}

// ─── Mock SRD Data ────────────────────────────────────────────
const MONSTERS: CompendiumEntry[] = [
  { id:'m1',name:'Aboleth',type:'Aberration',source:'MM',tags:['cr10','large','aberration'],img:'🦑',data:{cr:10,hp:135,ac:17,size:'large',speed:10,alignment:'lawful evil',str:21,dex:9,con:15,int:18,wis:15,cha:18,senses:'darkvision 120ft',legendary:true}},
  { id:'m2',name:'Adult Black Dragon',type:'Dragon',source:'MM',tags:['cr14','huge','dragon'],img:'🐉',data:{cr:14,hp:195,ac:19,size:'huge',speed:40,alignment:'chaotic evil',str:23,dex:14,con:21,int:14,wis:13,cha:17,legendary:true}},
  { id:'m3',name:'Animated Armor',type:'Construct',source:'MM',tags:['cr1','medium','construct'],img:'🛡',data:{cr:1,hp:33,ac:18,size:'medium',speed:25,alignment:'unaligned',str:14,dex:11,con:13,int:1,wis:3,cha:1,legendary:false}},
  { id:'m4',name:'Banshee',type:'Undead',source:'MM',tags:['cr4','medium','undead'],img:'👻',data:{cr:4,hp:58,ac:12,size:'medium',speed:0,alignment:'chaotic evil',str:1,dex:14,con:10,int:12,wis:11,cha:17,legendary:false}},
  { id:'m5',name:'Beholder',type:'Aberration',source:'MM',tags:['cr13','large','aberration'],img:'👁',data:{cr:13,hp:180,ac:18,size:'large',speed:0,alignment:'lawful evil',str:10,dex:14,con:18,int:17,wis:15,cha:17,legendary:true}},
  { id:'m6',name:'Bugbear',type:'Humanoid',source:'MM',tags:['cr1','medium','humanoid'],img:'👹',data:{cr:1,hp:27,ac:16,size:'medium',speed:30,alignment:'chaotic evil',str:15,dex:14,con:13,int:8,wis:11,cha:9,legendary:false}},
  { id:'m7',name:'Carrion Crawler',type:'Monstrosity',source:'MM',tags:['cr2','large','monstrosity'],img:'🐛',data:{cr:2,hp:51,ac:13,size:'large',speed:30,alignment:'unaligned',str:14,dex:13,con:16,int:1,wis:12,cha:5,legendary:false}},
  { id:'m8',name:'Death Knight',type:'Undead',source:'MM',tags:['cr17','medium','undead'],img:'💀',data:{cr:17,hp:180,ac:20,size:'medium',speed:30,alignment:'chaotic evil',str:20,dex:11,con:20,int:12,wis:16,cha:18,legendary:false}},
  { id:'m9',name:'Flumph',type:'Aberration',source:'MM',tags:['cr1/8','small','aberration'],img:'🪼',data:{cr:0.125,hp:7,ac:12,size:'small',speed:5,alignment:'lawful good',str:6,dex:15,con:10,int:14,wis:14,cha:11,legendary:false}},
  { id:'m10',name:'Gelatinous Cube',type:'Ooze',source:'MM',tags:['cr2','large','ooze'],img:'🟩',data:{cr:2,hp:84,ac:6,size:'large',speed:15,alignment:'unaligned',str:14,dex:3,con:20,int:1,wis:6,cha:1,legendary:false}},
  { id:'m11',name:'Goblin',type:'Humanoid',source:'MM',tags:['cr1/4','small','humanoid'],img:'🫑',data:{cr:0.25,hp:7,ac:15,size:'small',speed:30,alignment:'neutral evil',str:8,dex:14,con:10,int:10,wis:8,cha:8,legendary:false}},
  { id:'m12',name:'Lich',type:'Undead',source:'MM',tags:['cr21','medium','undead'],img:'🧙',data:{cr:21,hp:135,ac:17,size:'medium',speed:30,alignment:'any evil',str:11,dex:16,con:16,int:20,wis:14,cha:16,legendary:true}},
  { id:'m13',name:'Mind Flayer',type:'Aberration',source:'MM',tags:['cr7','medium','aberration'],img:'🐙',data:{cr:7,hp:71,ac:15,size:'medium',speed:30,alignment:'lawful evil',str:11,dex:12,con:12,int:19,wis:17,cha:17,legendary:false}},
  { id:'m14',name:'Owlbear',type:'Monstrosity',source:'MM',tags:['cr3','large','monstrosity'],img:'🦉',data:{cr:3,hp:59,ac:13,size:'large',speed:40,alignment:'unaligned',str:20,dex:12,con:17,int:3,wis:12,cha:7,legendary:false}},
  { id:'m15',name:'Tarrasque',type:'Monstrosity',source:'MM',tags:['cr30','gargantuan','monstrosity'],img:'🦕',data:{cr:30,hp:676,ac:25,size:'gargantuan',speed:40,alignment:'unaligned',str:30,dex:11,con:30,int:3,wis:11,cha:11,legendary:true}},
  { id:'m16',name:'Vampire',type:'Undead',source:'MM',tags:['cr13','medium','undead'],img:'🧛',data:{cr:13,hp:144,ac:16,size:'medium',speed:30,alignment:'lawful evil',str:18,dex:18,con:18,int:17,wis:15,cha:18,legendary:true}},
  { id:'m17',name:'Werewolf',type:'Humanoid',source:'MM',tags:['cr3','medium','humanoid'],img:'🐺',data:{cr:3,hp:58,ac:12,size:'medium',speed:30,alignment:'chaotic evil',str:15,dex:13,con:14,int:10,wis:11,cha:10,legendary:false}},
  { id:'m18',name:'Zombie',type:'Undead',source:'MM',tags:['cr1/4','medium','undead'],img:'🧟',data:{cr:0.25,hp:22,ac:8,size:'medium',speed:20,alignment:'neutral evil',str:13,dex:6,con:16,int:3,wis:6,cha:5,legendary:false}},
];

const SPELLS: CompendiumEntry[] = [
  { id:'s1',name:'Fireball',type:'Evocation',source:'PHB',tags:['level3','evocation','fire'],img:'🔥',data:{level:3,school:'evo',range:'150 ft',area:'20-ft radius sphere',damage:'8d6 fire',save:'DEX DC',components:'VSM',casting:'Action',duration:'Instantaneous'}},
  { id:'s2',name:'Magic Missile',type:'Evocation',source:'PHB',tags:['level1','evocation','force'],img:'✨',data:{level:1,school:'evo',range:'120 ft',area:'up to 3 targets',damage:'1d4+1 force each',components:'VS',casting:'Action',duration:'Instantaneous'}},
  { id:'s3',name:'Counterspell',type:'Abjuration',source:'PHB',tags:['level3','abjuration','reaction'],img:'🚫',data:{level:3,school:'abj',range:'60 ft',area:'1 creature',components:'S',casting:'Reaction',duration:'Instantaneous'}},
  { id:'s4',name:'Wish',type:'Conjuration',source:'PHB',tags:['level9','conjuration'],img:'⭐',data:{level:9,school:'con',range:'Self',components:'V',casting:'Action',duration:'Instantaneous'}},
  { id:'s5',name:'Healing Word',type:'Evocation',source:'PHB',tags:['level1','evocation','healing'],img:'💚',data:{level:1,school:'evo',range:'60 ft',damage:'1d4 + WIS heal',components:'V',casting:'Bonus Action',duration:'Instantaneous'}},
  { id:'s6',name:'Polymorph',type:'Transmutation',source:'PHB',tags:['level4','transmutation'],img:'🦎',data:{level:4,school:'trs',range:'60 ft',save:'WIS DC',components:'VSM',casting:'Action',duration:'1 hour (concentration)'}},
  { id:'s7',name:'Bless',type:'Enchantment',source:'PHB',tags:['level1','enchantment','buff'],img:'✞',data:{level:1,school:'enc',range:'30 ft',area:'3 creatures',components:'VSM',casting:'Action',duration:'1 minute (concentration)'}},
  { id:'s8',name:'Darkness',type:'Evocation',source:'PHB',tags:['level2','evocation'],img:'🌑',data:{level:2,school:'evo',range:'60 ft',area:'15-ft radius sphere',components:'VM',casting:'Action',duration:'10 minutes (concentration)'}},
  { id:'s9',name:'Eldritch Blast',type:'Evocation',source:'PHB',tags:['cantrip','evocation','force'],img:'⚡',data:{level:0,school:'evo',range:'120 ft',damage:'1d10 force per beam',components:'VS',casting:'Action',duration:'Instantaneous'}},
  { id:'s10',name:'Shield',type:'Abjuration',source:'PHB',tags:['level1','abjuration','reaction'],img:'🛡',data:{level:1,school:'abj',range:'Self',area:'+5 AC until next turn',components:'VS',casting:'Reaction',duration:'1 round'}},
  { id:'s11',name:'Misty Step',type:'Conjuration',source:'PHB',tags:['level2','conjuration','teleport'],img:'🌫',data:{level:2,school:'con',range:'Self',area:'30-ft teleport',components:'V',casting:'Bonus Action',duration:'Instantaneous'}},
  { id:'s12',name:'Power Word Kill',type:'Enchantment',source:'PHB',tags:['level9','enchantment'],img:'💀',data:{level:9,school:'enc',range:'60 ft',area:'1 creature ≤100 HP dies',components:'V',casting:'Action',duration:'Instantaneous'}},
];

const ITEMS: CompendiumEntry[] = [
  { id:'i1',name:'Longsword +1',type:'Weapon',source:'DMG',tags:['weapon','magic','uncommon'],img:'⚔',data:{rarity:'uncommon',damage:'1d8+1 slashing',weight:3,value:'500 gp',attunement:false}},
  { id:'i2',name:'Staff of Power',type:'Staff',source:'DMG',tags:['staff','magic','very rare'],img:'🪄',data:{rarity:'very rare',damage:'1d6+2 bludgeoning',weight:4,value:'0 gp',attunement:true,charges:20,description:'+2 AC, saving throws, spell attacks'}},
  { id:'i3',name:'Bag of Holding',type:'Wondrous Item',source:'DMG',tags:['wondrous','uncommon'],img:'🎒',data:{rarity:'uncommon',weight:15,capacity:'500 lb / 64 cubic ft',attunement:false}},
  { id:'i4',name:'Potion of Healing',type:'Potion',source:'DMG',tags:['potion','common','consumable'],img:'🧪',data:{rarity:'common',healing:'2d4+2',weight:0.5,value:'50 gp',attunement:false}},
  { id:'i5',name:'Ring of Protection',type:'Ring',source:'DMG',tags:['ring','rare'],img:'💍',data:{rarity:'rare',bonus:'+1 AC and saving throws',weight:0,attunement:true}},
  { id:'i6',name:'Vorpal Sword',type:'Weapon',source:'DMG',tags:['weapon','legendary','sword'],img:'🗡',data:{rarity:'legendary',damage:'3d6 slashing + decapitation on 20',weight:3,attunement:true}},
  { id:'i7',name:'Cloak of Invisibility',type:'Wondrous Item',source:'DMG',tags:['wondrous','legendary'],img:'🧥',data:{rarity:'legendary',effect:'Invisible while worn and hood is up',weight:1,attunement:true}},
  { id:'i8',name:'Boots of Speed',type:'Wondrous Item',source:'DMG',tags:['wondrous','uncommon'],img:'👢',data:{rarity:'uncommon',effect:'Double speed, no opportunity attacks',weight:1,attunement:true}},
];

// ─── CR Formatting ────────────────────────────────────────────
function formatCR(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

function crToXP(cr: number): number {
  const table: Record<number, number> = {
    0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
    1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
    6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
    11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
    16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
    21: 33000, 22: 41000, 23: 50000, 24: 62000,
    30: 155000,
  };
  return table[cr] ?? Math.floor(cr * 5000);
}

function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : String(m);
}

// ─── Monster Detail Panel ─────────────────────────────────────
const MonsterDetail: React.FC<{ entry: CompendiumEntry; onAddToScene: () => void }> = ({ entry, onAddToScene }) => {
  const d = entry.data as {
    cr: number; hp: number; ac: number; size: string; speed: number;
    alignment: string; str: number; dex: number; con: number;
    int: number; wis: number; cha: number; senses?: string; legendary?: boolean;
  };

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-icon">{entry.img}</div>
        <div className="detail-title-block">
          <div className="detail-name">{entry.name}</div>
          <div className="detail-meta">{d.size.charAt(0).toUpperCase() + d.size.slice(1)} {entry.type}, {d.alignment}</div>
          <div className="detail-source">{entry.source}</div>
        </div>
        {d.legendary && <div className="legendary-badge">Legendary</div>}
      </div>

      <div className="detail-stats">
        <div className="stat-row"><span>CR</span><span>{formatCR(d.cr)} ({crToXP(d.cr).toLocaleString()} XP)</span></div>
        <div className="stat-row"><span>HP</span><span>{d.hp}</span></div>
        <div className="stat-row"><span>AC</span><span>{d.ac}</span></div>
        <div className="stat-row"><span>Speed</span><span>{d.speed} ft</span></div>
        {d.senses && <div className="stat-row"><span>Senses</span><span>{d.senses}</span></div>}
      </div>

      <div className="ability-row">
        {(['str','dex','con','int','wis','cha'] as const).map(ab => (
          <div key={ab} className="ability-cell">
            <div className="ab-label">{ab.toUpperCase()}</div>
            <div className="ab-score">{d[ab]}</div>
            <div className="ab-mod">{abilityMod(d[ab])}</div>
          </div>
        ))}
      </div>

      <div className="detail-actions">
        <button className="detail-btn primary" onClick={onAddToScene}>Add to Scene</button>
        <button className="detail-btn" onClick={() => {}}>View Full Stats</button>
        <button className="detail-btn" onClick={() => {}}>Import to Campaign</button>
      </div>
    </div>
  );
};

// ─── Spell Detail Panel ───────────────────────────────────────
const SpellDetail: React.FC<{ entry: CompendiumEntry; onAdd: () => void }> = ({ entry, onAdd }) => {
  const d = entry.data as {
    level: number; school: string; range: string; components: string;
    casting: string; duration: string; damage?: string; save?: string; area?: string;
  };

  const schoolNames: Record<string, string> = {
    abj:'Abjuration',con:'Conjuration',div:'Divination',enc:'Enchantment',
    evo:'Evocation',ill:'Illusion',nec:'Necromancy',trs:'Transmutation',
  };

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-icon">{entry.img}</div>
        <div className="detail-title-block">
          <div className="detail-name">{entry.name}</div>
          <div className="detail-meta">
            {d.level === 0 ? 'Cantrip' : `${d.level}th-level`} {schoolNames[d.school] ?? d.school}
          </div>
        </div>
      </div>

      <div className="detail-stats">
        <div className="stat-row"><span>Casting</span><span>{d.casting}</span></div>
        <div className="stat-row"><span>Range</span><span>{d.range}</span></div>
        {d.area && <div className="stat-row"><span>Area</span><span>{d.area}</span></div>}
        <div className="stat-row"><span>Duration</span><span>{d.duration}</span></div>
        <div className="stat-row"><span>Components</span><span>{d.components}</span></div>
        {d.damage && <div className="stat-row"><span>Effect</span><span>{d.damage}</span></div>}
        {d.save && <div className="stat-row"><span>Save</span><span>{d.save}</span></div>}
      </div>

      <div className="detail-actions">
        <button className="detail-btn primary" onClick={onAdd}>Add to Spellbook</button>
        <button className="detail-btn" onClick={() => {}}>Cast (Template)</button>
      </div>
    </div>
  );
};

// ─── Item Detail Panel ────────────────────────────────────────
const ItemDetail: React.FC<{ entry: CompendiumEntry; onAdd: () => void }> = ({ entry, onAdd }) => {
  const d = entry.data as {
    rarity: string; weight?: number; value?: string; damage?: string;
    healing?: string; attunement: boolean; effect?: string; description?: string;
    charges?: number; capacity?: string;
  };

  const rarityColors: Record<string, string> = {
    common: '#c8cce0', uncommon: '#4aad78', rare: '#8060d0',
    'very rare': '#a060f0', legendary: '#c9a84c', artifact: '#c13a50',
  };

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-icon">{entry.img}</div>
        <div className="detail-title-block">
          <div className="detail-name" style={{ color: rarityColors[d.rarity] ?? '#c8cce0' }}>
            {entry.name}
          </div>
          <div className="detail-meta">{entry.type}</div>
        </div>
        <div className="rarity-badge" style={{ color: rarityColors[d.rarity] ?? '#888' }}>
          {d.rarity.charAt(0).toUpperCase() + d.rarity.slice(1)}
        </div>
      </div>

      <div className="detail-stats">
        {d.damage && <div className="stat-row"><span>Damage</span><span>{d.damage}</span></div>}
        {d.healing && <div className="stat-row"><span>Healing</span><span>{d.healing}</span></div>}
        {d.effect && <div className="stat-row"><span>Effect</span><span>{d.effect}</span></div>}
        {d.description && <div className="stat-row"><span>Notes</span><span>{d.description}</span></div>}
        {d.charges !== undefined && <div className="stat-row"><span>Charges</span><span>{d.charges}</span></div>}
        {d.capacity && <div className="stat-row"><span>Capacity</span><span>{d.capacity}</span></div>}
        {d.weight !== undefined && <div className="stat-row"><span>Weight</span><span>{d.weight} lb</span></div>}
        {d.value && <div className="stat-row"><span>Value</span><span>{d.value}</span></div>}
        <div className="stat-row">
          <span>Attunement</span>
          <span>{d.attunement ? 'Required' : 'None'}</span>
        </div>
      </div>

      <div className="detail-actions">
        <button className="detail-btn primary" onClick={onAdd}>Add to Inventory</button>
        <button className="detail-btn" onClick={() => {}}>Import to Campaign</button>
      </div>
    </div>
  );
};

// ─── Main Compendium Browser ──────────────────────────────────
export const CompendiumBrowser: React.FC<{
  isGM: boolean;
  onAddMonster?: (entry: CompendiumEntry) => void;
  onAddSpell?: (entry: CompendiumEntry) => void;
  onAddItem?: (entry: CompendiumEntry) => void;
}> = ({ isGM, onAddMonster, onAddSpell, onAddItem }) => {
  const [tab, setTab] = useState<CompendiumTab>('monsters');
  const [filters, setFilters] = useState<FilterState>({ search: '' });
  const [selected, setSelected] = useState<CompendiumEntry | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(f => ({ ...f, [key]: value }));
    setSelected(null);
  }, []);

  const entries = useMemo(() => {
    let source: CompendiumEntry[] = [];
    if (tab === 'monsters') source = MONSTERS;
    else if (tab === 'spells') source = SPELLS;
    else if (tab === 'items') source = ITEMS;

    return source.filter(e => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!e.name.toLowerCase().includes(q) &&
            !e.type.toLowerCase().includes(q) &&
            !e.tags.some(t => t.toLowerCase().includes(q))) return false;
      }
      if (tab === 'monsters' && filters.cr) {
        const data = e.data as { cr: number };
        if (formatCR(data.cr) !== filters.cr) return false;
      }
      if (tab === 'spells' && filters.level !== undefined && filters.level !== '') {
        const data = e.data as { level: number };
        if (String(data.level) !== filters.level) return false;
      }
      if (tab === 'monsters' && filters.type) {
        if (e.type.toLowerCase() !== filters.type.toLowerCase()) return false;
      }
      return true;
    });
  }, [tab, filters]);

  const monsterTypes = useMemo(() =>
    [...new Set(MONSTERS.map(m => m.type))].sort(), []);

  const crOptions = ['1/8','1/4','1/2','1','2','3','4','5','6','7','8','9','10',
    '11','12','13','14','15','16','17','18','19','20','21','22','23','24','30'];

  return (
    <div className="compendium-browser">
      {/* Tab Bar */}
      <div className="comp-tabs">
        {(['monsters','spells','items','classes','feats','rules'] as CompendiumTab[]).map(t => (
          <button
            key={t}
            className={`comp-tab ${tab === t ? 'active' : ''}`}
            onClick={() => { setTab(t); setFilters({ search: '' }); setSelected(null); }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="comp-filters">
        <input
          ref={searchRef}
          className="comp-search"
          type="text"
          placeholder={`Search ${tab}...`}
          value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          autoFocus
        />

        {tab === 'monsters' && (
          <>
            <select className="comp-select" value={filters.cr ?? ''} onChange={e => updateFilter('cr', e.target.value || undefined)}>
              <option value="">All CR</option>
              {crOptions.map(cr => <option key={cr} value={cr}>CR {cr}</option>)}
            </select>
            <select className="comp-select" value={filters.type ?? ''} onChange={e => updateFilter('type', e.target.value || undefined)}>
              <option value="">All Types</option>
              {monsterTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        )}

        {tab === 'spells' && (
          <select className="comp-select" value={filters.level ?? ''} onChange={e => updateFilter('level', e.target.value || undefined)}>
            <option value="">All Levels</option>
            <option value="0">Cantrips</option>
            {[1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{l}st–{l}th</option>)}
          </select>
        )}
      </div>

      {/* Results + Detail split */}
      <div className="comp-body">
        {/* List */}
        <div className="comp-list">
          <div className="comp-count">{entries.length} results</div>
          {(tab === 'monsters' || tab === 'spells' || tab === 'items') && entries.map(entry => (
            <div
              key={entry.id}
              className={`comp-row ${selected?.id === entry.id ? 'selected' : ''}`}
              onClick={() => setSelected(entry)}
              onDoubleClick={() => {
                if (tab === 'monsters') onAddMonster?.(entry);
                else if (tab === 'spells') onAddSpell?.(entry);
                else if (tab === 'items') onAddItem?.(entry);
              }}
            >
              <div className="comp-row-icon">{entry.img}</div>
              <div className="comp-row-info">
                <div className="comp-row-name">{entry.name}</div>
                <div className="comp-row-meta">
                  {entry.type}
                  {tab === 'monsters' && ` · CR ${formatCR((entry.data as { cr: number }).cr)}`}
                  {tab === 'spells' && ` · ${(entry.data as { level: number }).level === 0 ? 'Cantrip' : `Level ${(entry.data as { level: number }).level}`}`}
                  {tab === 'items' && ` · ${(entry.data as { rarity: string }).rarity}`}
                </div>
              </div>
              <div className="comp-row-source">{entry.source}</div>
            </div>
          ))}

          {(tab === 'classes' || tab === 'feats' || tab === 'rules') && (
            <div className="comp-placeholder">
              <div className="placeholder-icon">📚</div>
              <div className="placeholder-text">{tab.charAt(0).toUpperCase() + tab.slice(1)} compendium</div>
              <div className="placeholder-sub">Coming in v0.2 — Install the full D&D 5e SRD module</div>
            </div>
          )}

          {entries.length === 0 && (tab === 'monsters' || tab === 'spells' || tab === 'items') && (
            <div className="comp-empty">No results for "{filters.search}"</div>
          )}
        </div>

        {/* Detail */}
        <div className="comp-detail">
          {!selected ? (
            <div className="detail-placeholder">
              <div className="placeholder-icon">⚔</div>
              <div className="placeholder-text">Select an entry</div>
              <div className="placeholder-sub">Click a result to view details.<br/>Double-click to add instantly.</div>
            </div>
          ) : tab === 'monsters' ? (
            <MonsterDetail entry={selected} onAddToScene={() => onAddMonster?.(selected)} />
          ) : tab === 'spells' ? (
            <SpellDetail entry={selected} onAdd={() => onAddSpell?.(selected)} />
          ) : tab === 'items' ? (
            <ItemDetail entry={selected} onAdd={() => onAddItem?.(selected)} />
          ) : null}
        </div>
      </div>

      <style>{`
        .compendium-browser { display:flex; flex-direction:column; height:100%; background:var(--bg-panel); }
        .comp-tabs { display:flex; border-bottom:1px solid var(--border-default); background:var(--bg-secondary); flex-shrink:0; }
        .comp-tab { flex:1; padding:7px 4px; font-family:var(--font-display); font-size:10px;
          letter-spacing:.3px; color:var(--text-muted); background:none; border:none;
          border-bottom:2px solid transparent; cursor:pointer; transition:all .12s; }
        .comp-tab:hover { color:var(--text-primary); }
        .comp-tab.active { color:var(--gold-bright); border-bottom-color:var(--gold-bright); }
        .comp-filters { display:flex; gap:6px; padding:8px; border-bottom:1px solid var(--border-subtle); flex-shrink:0; }
        .comp-search { flex:1; background:var(--bg-elevated); border:1px solid var(--border-default);
          color:var(--text-primary); padding:5px 10px; border-radius:3px; font-size:12px;
          font-family:var(--font-body); outline:none; }
        .comp-search:focus { border-color:var(--gold-default); }
        .comp-select { background:var(--bg-elevated); border:1px solid var(--border-default);
          color:var(--text-secondary); padding:4px 6px; border-radius:3px; font-size:11px;
          outline:none; cursor:pointer; }
        .comp-body { display:flex; flex:1; overflow:hidden; }
        .comp-list { width:220px; flex-shrink:0; overflow-y:auto; border-right:1px solid var(--border-subtle); }
        .comp-count { font-size:10px; color:var(--text-muted); padding:6px 10px;
          font-family:var(--font-mono); border-bottom:1px solid var(--border-subtle); }
        .comp-row { display:flex; align-items:center; gap:8px; padding:7px 10px;
          cursor:pointer; transition:background .1s; border-bottom:1px solid var(--border-subtle); }
        .comp-row:hover { background:var(--bg-elevated); }
        .comp-row.selected { background:rgba(201,168,76,.08); border-left:2px solid var(--gold-default); }
        .comp-row-icon { font-size:18px; width:24px; text-align:center; flex-shrink:0; }
        .comp-row-info { flex:1; min-width:0; }
        .comp-row-name { font-family:var(--font-display); font-size:11px; color:var(--text-primary);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .comp-row-meta { font-size:10px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .comp-row-source { font-size:9px; color:var(--text-disabled); flex-shrink:0; font-family:var(--font-mono); }
        .comp-empty { padding:20px; text-align:center; color:var(--text-muted); font-size:12px; }
        .comp-detail { flex:1; overflow-y:auto; }
        .detail-placeholder { display:flex; flex-direction:column; align-items:center;
          justify-content:center; height:100%; gap:8px; color:var(--text-muted); text-align:center; padding:24px; }
        .placeholder-icon { font-size:36px; opacity:.3; }
        .placeholder-text { font-family:var(--font-display); font-size:13px; color:var(--text-secondary); }
        .placeholder-sub { font-size:11px; line-height:1.5; }
        .detail-panel { padding:14px; }
        .detail-header { display:flex; align-items:flex-start; gap:10px; margin-bottom:12px; }
        .detail-icon { font-size:32px; line-height:1; flex-shrink:0; }
        .detail-title-block { flex:1; }
        .detail-name { font-family:var(--font-display); font-size:15px; color:var(--gold-bright); line-height:1.2; margin-bottom:3px; }
        .detail-meta { font-size:12px; color:var(--text-secondary); }
        .detail-source { font-size:10px; color:var(--text-muted); margin-top:2px; font-family:var(--font-mono); }
        .legendary-badge { background:rgba(201,168,76,.15); border:1px solid var(--gold-default);
          color:var(--gold-bright); font-size:9px; padding:2px 6px; border-radius:10px;
          font-family:var(--font-display); letter-spacing:.5px; white-space:nowrap; align-self:flex-start; }
        .rarity-badge { font-family:var(--font-display); font-size:10px; letter-spacing:.5px; align-self:flex-start; }
        .detail-stats { border:1px solid var(--border-default); border-radius:4px;
          background:var(--bg-elevated); margin-bottom:10px; overflow:hidden; }
        .stat-row { display:flex; justify-content:space-between; padding:5px 10px;
          border-bottom:1px solid var(--border-subtle); font-size:12px; }
        .stat-row:last-child { border-bottom:none; }
        .stat-row span:first-child { color:var(--text-muted); font-family:var(--font-display); font-size:10px; letter-spacing:.5px; text-transform:uppercase; }
        .stat-row span:last-child { color:var(--text-primary); font-family:var(--font-mono); }
        .ability-row { display:grid; grid-template-columns:repeat(6,1fr); gap:4px; margin-bottom:10px; }
        .ability-cell { background:var(--bg-elevated); border:1px solid var(--border-default);
          border-radius:3px; padding:5px 2px; text-align:center; }
        .ab-label { font-family:var(--font-display); font-size:8px; letter-spacing:.5px; color:var(--text-muted); text-transform:uppercase; }
        .ab-score { font-size:13px; font-weight:700; color:var(--text-primary); font-family:var(--font-display); line-height:1.2; }
        .ab-mod { font-family:var(--font-mono); font-size:10px; color:var(--gold-bright); }
        .detail-actions { display:flex; flex-direction:column; gap:5px; }
        .detail-btn { background:none; border:1px solid var(--border-default); color:var(--text-secondary);
          padding:6px 12px; border-radius:3px; cursor:pointer; font-family:var(--font-display);
          font-size:11px; letter-spacing:.3px; transition:all .12s; text-align:center; }
        .detail-btn:hover { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
        .detail-btn.primary { border-color:var(--gold-default); color:var(--gold-bright); background:var(--gold-glow); }
        .detail-btn.primary:hover { background:var(--gold-glow-strong); }
        .comp-placeholder { display:flex; flex-direction:column; align-items:center;
          justify-content:center; height:100%; gap:10px; color:var(--text-muted); text-align:center; padding:32px; }
      `}</style>
    </div>
  );
};

export default CompendiumBrowser;
