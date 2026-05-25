# Plugin Development Guide

## Getting Started

MythicForge plugins can add new game systems, UI panels, visual effects,
automation, dice modifiers, and more. This guide covers the full plugin API.

---

## Project Structure

```
my-plugin/
├── module.json          # Plugin manifest (required)
├── src/
│   └── index.ts         # Entry point
├── dist/
│   └── index.js         # Built output
├── styles/
│   └── module.css       # Optional styles
├── lang/
│   └── en.json          # English localization
├── packs/               # Compendium JSON files
│   ├── monsters.db
│   └── spells.db
└── README.md
```

---

## Module Manifest (`module.json`)

```json
{
  "id": "my-module",
  "title": "My Awesome Module",
  "description": "Adds cool stuff to MythicForge VTT",
  "version": "1.0.0",
  "author": "Your Name",
  "homepage": "https://github.com/you/my-module",
  "license": "MIT",
  "compatibility": {
    "minimum": "0.1.0",
    "verified": "0.1.0",
    "maximum": "1.0.0"
  },
  "dependencies": [
    { "id": "dnd5e", "version": "1.0.0", "type": "requires" }
  ],
  "esmodules": ["dist/index.js"],
  "styles": ["styles/module.css"],
  "languages": [
    { "lang": "en", "name": "English", "path": "lang/en.json" }
  ],
  "packs": [
    {
      "id": "my-module.monsters",
      "name": "My Monster Pack",
      "label": "My Monster Pack",
      "type": "Actor",
      "path": "packs/monsters.db"
    }
  ]
}
```

---

## Entry Point (`src/index.ts`)

```typescript
import { MythicForgePlugin, Hooks, HOOKS } from '@mythicforge/plugin-api';
import type { PluginManifest, Actor, DiceRoll } from '@mythicforge/shared';

class MyPlugin extends MythicForgePlugin {
  readonly manifest: PluginManifest = {
    id: 'my-module',
    title: 'My Module',
    description: 'Does cool stuff',
    version: '1.0.0',
    author: 'Me',
    license: 'MIT',
    compatibility: { minimum: '0.1.0', verified: '0.1.0' },
    esmodules: ['dist/index.js'],
  };

  protected registerSettings(): void {
    // Register configuration options that appear in Settings
    this.settings.register('my-module', 'feature-enabled', {
      name: 'Enable My Feature',
      hint: 'What this feature does',
      scope: 'world',        // 'world' = GM controls, 'client' = per player
      config: true,          // Show in settings UI
      type: Boolean,
      default: true,
      onChange: (value: boolean) => {
        console.log('Feature toggled:', value);
      },
    });
  }

  protected registerHooks(): void {
    // Listen for dice rolls
    Hooks.on(HOOKS.ROLL_COMPLETE, (roll: DiceRoll) => {
      if (roll.total === 20) {
        // Natural 20!
        console.log('CRITICAL HIT!');
      }
    });

    // Modify actor data before it's used
    Hooks.on(HOOKS.PRE_UPDATE_ACTOR, (actor: Actor, updateData: Partial<Actor>) => {
      // You can modify updateData here or return false to cancel
    });

    // React to combat turns
    Hooks.on(HOOKS.COMBAT_TURN_CHANGE, (combat, round, turn) => {
      // Auto-apply start-of-turn effects
    });

    // Add custom chat command
    Hooks.on(HOOKS.CREATE_CHAT_MESSAGE, (message) => {
      if (message.content?.startsWith('/mycommand')) {
        // Handle custom command
        return false; // prevent default chat
      }
    });
  }

  protected async onInit(): Promise<void> {
    console.log('[MyModule] Initialized!');
  }

  override onReady(): void {
    // Game is fully loaded — safe to access game.actors, game.canvas, etc.
    console.log('[MyModule] Ready! Actors:', game.actors.getAll().length);
  }
}

export default new MyPlugin();
```

---

## Hook Reference

### Lifecycle Hooks

| Hook | Arguments | Description |
|------|-----------|-------------|
| `init` | — | Plugin system initializing |
| `setup` | — | Systems loaded, UI not yet built |
| `ready` | — | Everything loaded, safe to use `game.*` |

### Actor Hooks

| Hook | Arguments | Return `false` to cancel |
|------|-----------|--------------------------|
| `preCreateActor` | `(data, options, userId)` | ✓ |
| `createActor` | `(actor, options, userId)` | — |
| `preUpdateActor` | `(actor, changes, options, userId)` | ✓ |
| `updateActor` | `(actor, changes, options, userId)` | — |
| `deleteActor` | `(actor, options, userId)` | — |

### Item Hooks

Same pattern as Actor: `preCreateItem`, `createItem`, `preUpdateItem`, `updateItem`, `deleteItem`.

### Token Hooks

| Hook | Arguments |
|------|-----------|
| `createToken` | `(token, options, userId)` |
| `updateToken` | `(token, changes, options, userId)` |
| `deleteToken` | `(token, options, userId)` |
| `hoverToken` | `(token, hovered)` |
| `selectToken` | `(token, selected)` |
| `dragLeftDrop` | `(token, event)` |

### Combat Hooks

| Hook | Arguments |
|------|-----------|
| `createCombat` | `(combat, options, userId)` |
| `updateCombat` | `(combat, changes, options, userId)` |
| `combatTurnChange` | `(combat, priorState, currentState)` |
| `combatRoundChange` | `(combat, priorState, currentState)` |

### Dice Hooks

| Hook | Arguments | Description |
|------|-----------|-------------|
| `preRoll` | `(rollData)` | Modify formula before rolling |
| `diceSoNice` | `(roll, rollMode)` | Trigger 3D dice animation |
| `rollComplete` | `(roll)` | After roll is resolved |

### Canvas Hooks

| Hook | Arguments |
|------|-----------|
| `canvasInit` | `(canvas)` |
| `canvasReady` | `(canvas)` |
| `canvasPan` | `(canvas, position)` |
| `drawGrid` | `(canvas)` |
| `drawToken` | `(token)` |
| `refreshToken` | `(token)` |

### UI Hooks

| Hook | Arguments |
|------|-----------|
| `renderActorSheet` | `(sheet, html, data)` |
| `closeActorSheet` | `(sheet, html)` |
| `renderItemSheet` | `(sheet, html, data)` |
| `getChatLogEntry` | `(message, html, data)` |

---

## Working with Actors

```typescript
// Get all actors in the campaign
const actors = game.actors.getAll();

// Find a specific actor
const aldric = game.actors.find(a => a.name === 'Aldric');

// Get actor data (D&D 5e example)
const data = aldric.data as DnD5eActorData;
const strMod = data.abilities.str.mod;
const hp = data.attributes.hp.value;

// Update actor data
await game.actors.update(aldric.id, {
  data: {
    attributes: {
      hp: { value: hp - 5 }
    }
  }
});

// Create a new actor
const newActor = await game.actors.create({
  name: 'Goblin King',
  type: 'npc',
  img: '/assets/tokens/goblin.webp',
  data: { /* system-specific data */ },
  ownership: {},
});
```

---

## Working with the Canvas

```typescript
// Get selected tokens
const selected = game.canvas.tokens.controlled;

// Move a token
const token = selected[0];
await game.canvas.tokens.get(token.id)?.document.update({ x: 400, y: 300 });

// Measure distance
const origin = { x: 0, y: 0 };
const target = { x: 500, y: 500 };
const distance = game.canvas.measureDistance(origin, target);
console.log(`Distance: ${distance} ft`);

// Get tokens in a radius
const tokensInArea = game.canvas.getAreaTokens(origin, 200);

// Show a ping on the map
game.canvas.ping(400, 300, 'pulse');

// Draw on the canvas (custom graphics)
Hooks.on(HOOKS.CANVAS_READY, (canvas) => {
  const graphics = new PIXI.Graphics();
  graphics.lineStyle(2, 0xc9a84c, 0.8);
  graphics.drawCircle(400, 300, 100);
  canvas.interface.addChild(graphics);
});
```

---

## Custom Chat Commands

```typescript
Hooks.on(HOOKS.PRE_CREATE_CHAT_MESSAGE, (message) => {
  const content = message.content?.toLowerCase() ?? '';

  if (content.startsWith('/polymorph')) {
    const targetName = content.replace('/polymorph', '').trim();
    const actor = game.actors.find(a => a.name === targetName);

    if (actor) {
      game.chat.create(`${actor.name} transforms!`);
      // Apply effect...
    }

    return false; // prevent original message from being sent
  }
});
```

---

## Socket Messaging (Plugin-to-Plugin)

For GM-only actions that clients need to trigger on the server:

```typescript
// Client: request the GM to do something
game.socket.emit('my-module.requestAction', {
  type: 'applyDamage',
  actorId: actor.id,
  amount: 15,
});

// GM client: receive and handle
game.socket.on('my-module.requestAction', async (data, userId) => {
  if (!game.isGM) return;
  const actor = game.actors.get(data.actorId);
  if (!actor) return;
  await game.system.applyDamage(actor, data.amount, 'fire');
});
```

---

## Settings with Menus

```typescript
// Register a settings submenu
game.settings.registerMenu('my-module', 'config', {
  name: 'Module Configuration',
  hint: 'Configure My Module settings',
  label: 'Open Settings',
  icon: 'fas fa-cogs',
  type: MyModuleSettings, // a React component or class
  restricted: true,
});
```

---

## Localization

`lang/en.json`:
```json
{
  "MyModule": {
    "name": "My Module",
    "settings": {
      "featureEnabled": {
        "name": "Enable Feature",
        "hint": "Enables the main feature of this module"
      }
    },
    "ui": {
      "rollButton": "Roll with Advantage",
      "applyDamage": "Apply {amount} {type} damage"
    }
  }
}
```

Usage:
```typescript
game.i18n.localize('MyModule.ui.rollButton');
game.i18n.format('MyModule.ui.applyDamage', { amount: 15, type: 'fire' });
```

---

## Compendium Packs

Include pre-made content in your plugin:

`packs/monsters.db` (newline-delimited JSON):
```json
{"_id":"abc123","name":"Goblin","type":"npc","img":"icons/goblin.webp","data":{"attributes":{"hp":{"value":7,"max":7}},"abilities":{"str":{"value":8},"dex":{"value":14}}}}
{"_id":"def456","name":"Orc","type":"npc","img":"icons/orc.webp","data":{"attributes":{"hp":{"value":15,"max":15}}}}
```

Access in code:
```typescript
const pack = game.packs.get('my-module.monsters');
const goblin = await pack.get('abc123');
```

---

## Building Your Plugin

```bash
# Install dependencies
npm install @mythicforge/plugin-api @mythicforge/shared

# Build
npm run build

# Watch mode
npm run dev
```

`package.json`:
```json
{
  "name": "my-mythicforge-module",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc && vite build",
    "dev": "vite build --watch"
  },
  "dependencies": {
    "@mythicforge/plugin-api": "*",
    "@mythicforge/shared": "*"
  }
}
```

---

## Publishing

1. Test thoroughly — use the sandbox mode (`/run-macro` console)
2. Write a `README.md` with screenshots
3. Submit to the MythicForge Marketplace via `mythicforge-cli publish`
4. Or distribute as a `.zip` for manual installation

```bash
npx mythicforge-cli publish --token YOUR_API_TOKEN
```

---

## TypeScript Tips

```typescript
// Extend system actor data with proper typing
import type { DnD5eActorData } from '@mythicforge/plugin-dnd5e';

function getHP(actor: Actor): number {
  // Type assertion with guard
  const data = actor.data as DnD5eActorData;
  return data.attributes?.hp?.value ?? 0;
}

// Use the shared UUID type
import type { UUID } from '@mythicforge/shared';
const tokenId: UUID = '550e8400-e29b-41d4-a716-446655440000' as UUID;

// Typed hook callbacks
Hooks.on<[Actor, Partial<Actor>]>(HOOKS.PRE_UPDATE_ACTOR, (actor, changes) => {
  // actor and changes are fully typed
});
```

---

*MythicForge Plugin API v0.1.0 — Happy forging!*
