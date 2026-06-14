#!/usr/bin/env tsx
// ============================================================
// MythicForge VTT — Database Seed Script
// Populates the database with example campaign, characters,
// scenes, and journal entries for development/demo purposes
// Usage: npx tsx tools/scripts/seed.ts
// ============================================================

import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'file:./data/mythicforge.db';

const db = createClient({ url: DATABASE_URL });

// ─── IDs ──────────────────────────────────────────────────────
const GM_ID         = uuidv4();
const PLAYER1_ID    = uuidv4();
const PLAYER2_ID    = uuidv4();
const PLAYER3_ID    = uuidv4();
const CAMPAIGN_ID   = uuidv4();
const SCENE1_ID     = uuidv4();
const SCENE2_ID     = uuidv4();
const ACTOR1_ID     = uuidv4();  // Aldric (Wizard)
const ACTOR2_ID     = uuidv4();  // Kira (Rogue)
const ACTOR3_ID     = uuidv4();  // Vayne (Cleric)
const GOBLIN_ID     = uuidv4();  // NPC
const SESSION_ID    = uuidv4();

const now = Date.now();

async function seed(): Promise<void> {
  console.log('⚔  MythicForge VTT — Seeding database...');
  console.log(`Database: ${DATABASE_URL}\n`);

  // ── Users ────────────────────────────────────────────────────
  console.log('Creating users...');
  const gmHash = await bcrypt.hash('gmpassword', 12);
  const playerHash = await bcrypt.hash('password', 12);

  await db.executeMultiple(`
    INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, color, created_at, updated_at)
    VALUES ('${GM_ID}', 'gm_varek', '${gmHash}', 'GM Varek', 'gm', '#8b2635', ${now}, ${now});

    INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, color, created_at, updated_at)
    VALUES ('${PLAYER1_ID}', 'aldric', '${playerHash}', 'Aldric', 'player', '#5b3fa0', ${now}, ${now});

    INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, color, created_at, updated_at)
    VALUES ('${PLAYER2_ID}', 'kira', '${playerHash}', 'Kira', 'player', '#1a8f7f', ${now}, ${now});

    INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, color, created_at, updated_at)
    VALUES ('${PLAYER3_ID}', 'vayne', '${playerHash}', 'Brother Vayne', 'player', '#c9a84c', ${now}, ${now});
  `);
  console.log('  ✓ 4 users created');

  // ── Campaign ─────────────────────────────────────────────────
  console.log('Creating campaign...');
  const campaignSettings = JSON.stringify({
    worldTime: 1209600,
    experience: 'milestone',
    playerIds: [PLAYER1_ID, PLAYER2_ID, PLAYER3_ID],
  });

  await db.execute({
    sql: `INSERT OR IGNORE INTO campaigns (id, name, description, game_system_id, gm_user_id, settings, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      CAMPAIGN_ID,
      'Tomb of Annihilation',
      'The death curse has spread across the land. Resurrection magic fails, and the adventurers must travel to Chult to find the Soulmonger.',
      'dnd5e',
      GM_ID,
      campaignSettings,
      now, now,
    ],
  });
  console.log('  ✓ Campaign: Tomb of Annihilation');

  // ── Scenes ────────────────────────────────────────────────────
  console.log('Creating scenes...');

  const scene1Data = JSON.stringify({
    backgroundImageUrl: '/assets/scenes/omu-ruins.webp',
    width: 4000, height: 3000,
    grid: { type: 'square', size: 100, scale: '5 ft', color: '#c9a84c', alpha: 0.3, offsetX: 0, offsetY: 0, snap: true },
    tokens: [
      { id: uuidv4(), actorId: ACTOR1_ID, name: 'Aldric', img: '/assets/tokens/wizard.webp', x: 300, y: 200, width: 1, height: 1, rotation: 0, elevation: 0, scale: 1, alpha: 1, hidden: false, locked: false, disposition: 'friendly', displayName: 20, displayBars: 20, bar1: { attribute: 'attributes.hp.value' }, bar2: {}, light: { dim: 0, bright: 0, angle: 360, color: '#ffffff', alpha: 0.5 }, vision: { enabled: true, range: 60, angle: 360, visionMode: 'darkvision' }, effects: [], actorLink: true, actorData: {} },
      { id: uuidv4(), actorId: ACTOR2_ID, name: 'Kira', img: '/assets/tokens/rogue.webp', x: 500, y: 300, width: 1, height: 1, rotation: 0, elevation: 0, scale: 1, alpha: 1, hidden: false, locked: false, disposition: 'friendly', displayName: 20, displayBars: 20, bar1: { attribute: 'attributes.hp.value' }, bar2: {}, light: { dim: 0, bright: 0, angle: 360, color: '#ffffff', alpha: 0.5 }, vision: { enabled: true, range: 60, angle: 360, visionMode: 'basic' }, effects: [], actorLink: true, actorData: {} },
    ],
    lights: [
      { id: uuidv4(), x: 200, y: 200, config: { dim: 40, bright: 20, angle: 360, color: '#c17a20', alpha: 0.6, animation: { type: 'torch', speed: 2, intensity: 0.8 } }, hidden: false, walls: true },
    ],
    walls: [],
    notes: [],
    drawings: [],
    globalLightLevel: 0.6,
    darknessLevel: 0.3,
    tokenVision: true,
    weather: { type: 'rain', intensity: 0.4 },
    fogExplored: '',
  });

  const scene2Data = JSON.stringify({
    backgroundImageUrl: '/assets/scenes/tomb-chamber.webp',
    width: 3000, height: 2000,
    grid: { type: 'square', size: 100, scale: '5 ft', color: '#888888', alpha: 0.2, offsetX: 0, offsetY: 0, snap: true },
    tokens: [],
    lights: [],
    walls: [],
    notes: [],
    drawings: [],
    globalLightLevel: 0.0,
    darknessLevel: 0.95,
    tokenVision: true,
    weather: { type: 'none', intensity: 0 },
    fogExplored: '',
  });

  await db.execute({ sql: 'INSERT OR IGNORE INTO scenes (id,campaign_id,name,data,created_at,updated_at) VALUES (?,?,?,?,?,?)', args: [SCENE1_ID, CAMPAIGN_ID, 'Omu — The Ruins', scene1Data, now, now] });
  await db.execute({ sql: 'INSERT OR IGNORE INTO scenes (id,campaign_id,name,data,created_at,updated_at) VALUES (?,?,?,?,?,?)', args: [SCENE2_ID, CAMPAIGN_ID, 'Tomb — Chamber 3', scene2Data, now, now] });
  console.log('  ✓ 2 scenes created');

  // ── Actors ────────────────────────────────────────────────────
  console.log('Creating actors...');

  const aldricData = JSON.stringify({
    abilities: {
      str: { value: 8, proficient: 0 }, dex: { value: 14, proficient: 0 },
      con: { value: 13, proficient: 1 }, int: { value: 20, proficient: 1 },
      wis: { value: 14, proficient: 0 }, cha: { value: 10, proficient: 0 },
    },
    attributes: {
      hp: { value: 32, min: 0, max: 45, temp: 0, tempmax: 0 },
      ac: { value: 14, calc: 'mage-armor' },
      init: { value: 2, bonus: 0 },
      speed: { value: 35, burrow: 0, climb: 0, fly: 0, swim: 0, hover: false },
      prof: 3, spellcasting: 'int', spelldc: 16, movement: { units: 'ft' },
      exhaustion: 0, concentration: { active: false }, death: { success: 0, failure: 0 },
    },
    details: {
      biography: { value: '<p>A wood elf wizard who spent decades studying at the Arcane Brotherhood.</p>', public: '' },
      alignment: 'Lawful Neutral', race: 'Wood Elf', background: 'Sage',
      originalClass: 'Divination Wizard',
      xp: { value: 21500, min: 14000, max: 23000 },
      ideal: 'Knowledge is the greatest treasure.',
      bond: 'I have an ancient tome of prophecy I must decipher.',
      flaw: 'I become obsessed with problems and ignore everything else.',
      trait: 'I use many-syllabled words that convey the appearance of great erudition.',
    },
    skills: {
      arc: { value: 1, ability: 'int' }, his: { value: 1, ability: 'int' },
      inv: { value: 1, ability: 'int' }, prc: { value: 1, ability: 'wis' },
    },
    traits: {
      size: 'med', di: [], dr: [], dv: [], ci: [],
      languages: { value: ['common', 'elvish', 'draconic', 'deep-speech'], custom: '' },
      senses: { darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0, units: 'ft', special: 'Trance' },
    },
    currency: { cp: 0, sp: 45, ep: 0, gp: 127, pp: 3 },
    spells: {
      spell1: { value: 3, max: 4, override: null }, spell2: { value: 2, max: 3, override: null },
      spell3: { value: 2, max: 3, override: null }, spell4: { value: 1, max: 1, override: null },
      spell5: { value: 0, max: 0, override: null }, spell6: { value: 0, max: 0, override: null },
      spell7: { value: 0, max: 0, override: null }, spell8: { value: 0, max: 0, override: null },
      spell9: { value: 0, max: 0, override: null }, pact: { value: 0, max: 0, override: null },
    },
    resources: {
      primary: { label: 'Portent Dice', value: 1, max: 2, sr: false, lr: true },
      secondary: { label: '', value: 0, max: 0, sr: false, lr: false },
      tertiary: { label: '', value: 0, max: 0, sr: false, lr: false },
    },
    bonuses: { mwak: { attack: '', damage: '' }, rwak: { attack: '', damage: '' }, msak: { attack: '', damage: '' }, rsak: { attack: '', damage: '' }, abilities: { check: '', save: '', skill: '' }, spell: { dc: '' } },
  });

  const goblinData = JSON.stringify({
    abilities: {
      str: { value: 8 }, dex: { value: 14 }, con: { value: 10 },
      int: { value: 10 }, wis: { value: 8 }, cha: { value: 8 },
    },
    attributes: {
      hp: { value: 7, min: 0, max: 7, temp: 0, tempmax: 0 },
      ac: { value: 15, calc: 'natural' },
      speed: { value: 30 }, prof: 2, spellcasting: '',
    },
    details: { cr: 0.25, alignment: 'Neutral Evil', type: { value: 'humanoid', subtype: 'goblinoid', swarm: '' } },
    traits: {
      size: 'sm', di: [], dr: [], dv: [], ci: [],
      senses: { darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0, units: 'ft', special: '' },
    },
  });

  await db.execute({ sql: 'INSERT OR IGNORE INTO actors (id,campaign_id,type,name,img,data,ownership,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', args: [ACTOR1_ID, CAMPAIGN_ID, 'character', 'Aldric Stormveil', '/assets/tokens/wizard.webp', aldricData, JSON.stringify({ [PLAYER1_ID]: 3 }), now, now] });
  await db.execute({ sql: 'INSERT OR IGNORE INTO actors (id,campaign_id,type,name,img,data,ownership,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', args: [ACTOR2_ID, CAMPAIGN_ID, 'character', 'Kira Ashblade', '/assets/tokens/rogue.webp', JSON.stringify({ abilities: { str: { value: 12 }, dex: { value: 18 }, con: { value: 14 }, int: { value: 13 }, wis: { value: 14 }, cha: { value: 12 } }, attributes: { hp: { value: 41, min: 0, max: 48, temp: 0 }, ac: { value: 16, calc: 'default' }, speed: { value: 30 }, prof: 3 } }), JSON.stringify({ [PLAYER2_ID]: 3 }), now, now] });
  await db.execute({ sql: 'INSERT OR IGNORE INTO actors (id,campaign_id,type,name,img,data,ownership,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', args: [GOBLIN_ID, CAMPAIGN_ID, 'npc', 'Goblin Scout', '/assets/tokens/goblin.webp', goblinData, '{}', now, now] });
  console.log('  ✓ 3 actors created');

  // ── Journal ───────────────────────────────────────────────────
  console.log('Creating journal entries...');

  await db.execute({ sql: 'INSERT OR IGNORE INTO journal_entries (id,campaign_id,name,content,ownership,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', args: [uuidv4(), CAMPAIGN_ID, 'Session 12 Notes', '<h2>Session 12 — The Tomb Awaits</h2><p>The party descended into the Tomb of the Nine Gods after two days mapping the exterior.</p><h3>Key Events</h3><ul><li>Discovered the first puzzle chamber — the Scale of Moa</li><li>Kira disarmed the poison dart trap (DC 22)</li><li>Aldric detected three magical auras in the altar chamber</li></ul>', JSON.stringify({ [GM_ID]: 3 }), now, now] });
  await db.execute({ sql: 'INSERT OR IGNORE INTO journal_entries (id,campaign_id,name,content,ownership,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', args: [uuidv4(), CAMPAIGN_ID, 'The City of Omu — Lore', '<h2>Omu — The Forbidden City</h2><p>Once the greatest city in Chult, Omu was destroyed by the trickster gods. Nine shrines dedicated to the nine trickster gods lie scattered throughout the ruins.</p><h3>The Death Curse</h3><p>The Soulmonger is draining the life force of everyone who has ever been resurrected. It must be destroyed.</p>', JSON.stringify({ [GM_ID]: 3, [PLAYER1_ID]: 1, [PLAYER2_ID]: 1, [PLAYER3_ID]: 1 }), now, now] });
  console.log('  ✓ 2 journal entries created');

  // ── Session ───────────────────────────────────────────────────
  console.log('Creating session...');
  await db.execute({
    sql: 'INSERT OR IGNORE INTO sessions (id,campaign_id,name,host_user_id,active_scene_id,settings,started_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
    args: [SESSION_ID, CAMPAIGN_ID, 'Session 12 — The Tomb', GM_ID, SCENE1_ID, JSON.stringify({
      allowPlayerMacros: true, allowPlayerDrawing: false, showPlayerHpBars: true,
      showNpcNames: false, fogOfWarEnabled: true, dynamicLightingEnabled: true,
      gridEnabled: true, gridSize: 100, gridType: 'square', gridScale: '5 ft', rollMode: 'publicroll',
    }), now, now],
  });
  console.log('  ✓ Session created');

  // ── Chat seed ─────────────────────────────────────────────────
  console.log('Creating chat history...');
  const msgs = [
    { sender: 'System', alias: 'System', content: 'Session started. 3 players connected.', type: 'chat' },
    { sender: GM_ID, alias: 'GM Varek', content: 'You descend the spiraling staircase into a vast chamber. The air smells of ancient stone and something rotten.', type: 'chat' },
    { sender: PLAYER1_ID, alias: 'Aldric', content: 'I cast Detect Magic — does anything here radiate?', type: 'chat' },
    { sender: GM_ID, alias: 'GM Varek', content: 'Three objects pulse faintly: the obsidian altar, a golden serpent idol, and the sealed door to the north.', type: 'chat' },
    { sender: PLAYER2_ID, alias: 'Kira', content: 'I check the serpent idol for traps.', type: 'chat' },
  ];
  for (const m of msgs) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO chat_messages (id,session_id,campaign_id,type,content,speaker,timestamp,flags) VALUES (?,?,?,?,?,?,?,?)',
      args: [uuidv4(), SESSION_ID, CAMPAIGN_ID, m.type, m.content, JSON.stringify({ userId: m.sender, alias: m.alias }), now, '{}'],
    });
  }
  console.log('  ✓ 5 chat messages created');

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n✓ Seed complete!\n');
  console.log('Login credentials:');
  console.log('  GM:      username=gm_varek    password=gmpassword');
  console.log('  Player1: username=aldric      password=password');
  console.log('  Player2: username=kira        password=password');
  console.log('  Player3: username=vayne       password=password');
  console.log(`\nSession ID: ${SESSION_ID}`);
  console.log(`Campaign:   Tomb of Annihilation\n`);
}

seed().catch(err => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});
