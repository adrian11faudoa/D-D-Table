# ⚔ MythicForge VTT

**A professional, open-source Virtual Tabletop platform built for tabletop RPGs.**

MythicForge VTT is a modern, moddable, multiplayer-ready virtual tabletop designed to compete with Foundry VTT, Roll20, and Fantasy Grounds. Built on a TypeScript monorepo with a React frontend, Node.js/WebSocket backend, and PixiJS map rendering.

---

## ✨ Features

### Core Platform
- 🎮 **Real-time multiplayer** — WebSocket sync, sub-50ms latency
- 🗺 **PixiJS map rendering** — hardware-accelerated, infinite canvas
- 🌫 **Fog of War** — per-token vision with soft edges
- 💡 **Dynamic Lighting** — radius lights, wall occlusion, animated torches
- 🎲 **Full dice engine** — `2d20kh1+5`, advantage, exploding dice, macros
- 🔌 **Plugin system** — hot-reload, sandboxed, Hooks API

### GM Tools
- 🔒 Hidden GM layer (tokens, notes, drawings)
- 🎭 Secret dice rolls (gmroll, blindroll)
- ⚔ Encounter builder with CR calculator
- 📜 Campaign journal with rich text
- 🎵 Ambient audio playlists per scene
- 🌦 Weather effects (rain, snow, fog, storm)

### Player Experience
- 📋 Full editable character sheets (D&D 5e, Pathfinder 2e)
- 🗡 Click-to-roll ability checks, saves, skills
- 📦 Drag-and-drop inventory management
- ✨ Spell tracking with slot management
- 🎲 3D dice animations (Dice So Nice plugin)

### Game Systems (Included)
- ⚔ **D&D 5e** — Full character data, automation, compendium
- 🐉 **Pathfinder 2e** *(planned)*
- 🔧 **Custom System** — JSON schema builder

---

## 🏗 Architecture

```
mythicforge/
├── apps/
│   ├── server/          # Node.js + Express + WebSocket game server
│   ├── client/          # React + PixiJS frontend
│   └── desktop/         # Electron desktop shell (optional)
├── packages/
│   ├── shared/          # Types, constants, utilities (shared everywhere)
│   ├── dice-engine/     # Formula parser & roller (2d6kh1+3, etc.)
│   ├── network/         # WebSocket client/server protocol
│   ├── plugin-api/      # Full modding API surface
│   └── ui-components/   # Design system components
├── plugins/
│   ├── dnd5e/           # D&D 5th Edition game system
│   ├── pathfinder2e/    # Pathfinder 2e (planned)
│   └── example-module/  # Dice So Nice — 3D dice plugin
├── tools/
│   └── scripts/         # Build helpers, example campaigns
└── docs/
    ├── api/             # API reference
    └── guides/          # Developer guides
```

---

## 🚀 Quick Start

### Prerequisites

| Tool    | Version  |
|---------|----------|
| Node.js | ≥ 20.0   |
| npm     | ≥ 10.0   |

### Installation

```bash
# Clone the repository
git clone https://github.com/yourorg/mythicforge-vtt.git
cd mythicforge-vtt

# Install all workspace dependencies
npm install

# Set up environment
cp apps/server/.env.example apps/server/.env
# Edit .env with your JWT_SECRET and any custom settings
```

### Development

```bash
# Start everything in watch mode (server + client hot reload)
npm run dev

# Or individually:
npm run dev --filter=@mythicforge/server   # Backend on :3000
npm run dev --filter=@mythicforge/client   # Frontend on :5173
```

Open `http://localhost:5173` — create an account, start a session!

### Production Build

```bash
npm run build

# Start the production server
cd apps/server && npm start
```

### Desktop App (Electron)

```bash
cd apps/desktop
npm run dev          # Dev mode
npm run package:win  # Windows .exe
npm run package:mac  # macOS .dmg
npm run package:linux # Linux .AppImage
```

---

## 🎮 Hosting a Game

### Local (LAN)

```bash
# Server starts automatically at http://localhost:3000
# Share your local IP with players: http://192.168.x.x:3000
npm run start:server
```

### Online (Self-Hosted)

```bash
# Set environment variables
export PORT=3000
export JWT_SECRET=your-secret-key-here
export DATABASE_URL=file:./data/mythicforge.db

# Or with PostgreSQL:
export DATABASE_URL=postgresql://user:pass@host:5432/mythicforge

# With HTTPS (recommended for online play):
export SSL_CERT=/path/to/cert.pem
export SSL_KEY=/path/to/key.pem
```

**Docker:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
```

```bash
docker build -t mythicforge-vtt .
docker run -p 3000:3000 -v ./data:/app/data mythicforge-vtt
```

---

## 🔌 Plugin Development

MythicForge has a powerful plugin/module system. Plugins can add game systems, UI panels, visual effects, automation, and more.

### Plugin Manifest (`module.json`)

```json
{
  "id": "my-awesome-plugin",
  "title": "My Awesome Plugin",
  "description": "Adds cool stuff to MythicForge",
  "version": "1.0.0",
  "author": "YourName",
  "license": "MIT",
  "compatibility": {
    "minimum": "0.1.0",
    "verified": "0.1.0"
  },
  "esmodules": ["dist/index.js"],
  "styles": ["dist/styles.css"]
}
```

### Plugin Code

```typescript
import { MythicForgePlugin, HOOKS, Hooks } from '@mythicforge/plugin-api';

export class MyPlugin extends MythicForgePlugin {
  readonly manifest = { /* ... */ };

  protected registerSettings() {
    this.settings.register('my-plugin', 'enabled', {
      name: 'Enable Feature',
      scope: 'client',
      config: true,
      type: Boolean,
      default: true,
    });
  }

  protected registerHooks() {
    // Run code when a new actor is created
    Hooks.on(HOOKS.CREATE_ACTOR, (actor) => {
      console.log(`New actor: ${actor.name}`);
    });

    // Intercept dice rolls
    Hooks.on(HOOKS.PRE_ROLL, (rollData) => {
      // Modify formula before rolling
      // Return false to cancel the roll
    });

    // React to combat turn changes
    Hooks.on(HOOKS.COMBAT_TURN_CHANGE, (combat, round, turn) => {
      // Auto-apply start-of-turn effects
    });
  }

  protected async onInit() {
    console.log('My plugin is ready!');
  }
}

export default new MyPlugin();
```

### Available Hooks

| Hook | When |
|------|------|
| `init` | Application initializing |
| `ready` | Everything loaded |
| `createActor` | Actor created |
| `updateActor` | Actor data changed |
| `createToken` | Token added to scene |
| `updateToken` | Token moved/modified |
| `combatTurnChange` | Turn advances |
| `combatRoundChange` | New round |
| `preRoll` | Before dice roll |
| `rollComplete` | After dice roll |
| `createChatMessage` | Chat message sent |
| `renderActorSheet` | Sheet opened |
| `canvasReady` | Map canvas initialized |
| `drawToken` | Token being drawn |

---

## 🎲 Dice Formula Reference

MythicForge supports a full dice expression language:

| Formula | Meaning |
|---------|---------|
| `1d20` | Roll 1d20 |
| `2d6+5` | Roll 2d6, add 5 |
| `2d20kh1` | Roll with Advantage (keep highest 1) |
| `2d20kl1` | Roll with Disadvantage (keep lowest 1) |
| `4d6kh3` | D&D ability score method |
| `1d6x6` | Exploding die (reroll on 6) |
| `4d6r1` | Reroll 1s |
| `1d20min10` | Minimum result of 10 |
| `3d6+2d4-1` | Complex multi-die formula |
| `10d10cs8` | Count successes ≥ 8 (Storyteller System) |

**Chat commands:**
```
/roll 2d20kh1+5          — Public roll
/gmroll 1d20+3           — GM-only roll
/blindroll 1d20          — Hidden from everyone
/r 4d6kh3                — Short form
/initiative              — Roll initiative for your token
```

---

## 🌐 REST API Reference

All endpoints require `Authorization: Bearer <token>` unless noted.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |

### Campaigns
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/campaigns` | List your campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id` | Get campaign |
| PATCH | `/api/campaigns/:id` | Update campaign |
| DELETE | `/api/campaigns/:id` | Delete campaign |

### Scenes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/campaigns/:id/scenes` | List scenes |
| POST | `/api/campaigns/:id/scenes` | Create scene |
| GET | `/api/scenes/:id` | Get scene (full) |
| PATCH | `/api/scenes/:id` | Update scene |

### Actors
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/campaigns/:id/actors` | List actors |
| POST | `/api/campaigns/:id/actors` | Create actor |
| GET | `/api/actors/:id` | Get actor |
| PATCH | `/api/actors/:id` | Update actor |

### Files
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload asset (PNG/MP4/MP3) |

---

## 📡 WebSocket Events

Connect to `ws://host:3000/ws?session=<id>&user=<id>&token=<jwt>`

### Client → Server
```json
{ "type": "token:move", "payload": { "tokenId": "...", "x": 400, "y": 300 } }
{ "type": "dice:roll", "payload": { "formula": "1d20+5", "rollMode": "publicroll" } }
{ "type": "chat:message", "payload": { "content": "Hello!", "type": "chat" } }
{ "type": "combat:next-turn", "payload": { "combatId": "..." } }
{ "type": "fog:update", "payload": { "sceneId": "...", "data": "..." } }
{ "type": "canvas:ping", "payload": { "x": 500, "y": 400 } }
```

### Server → Client (broadcast)
```json
{ "type": "token:move", "payload": { "tokenId": "...", "x": 400, "y": 300 }, "userId": "..." }
{ "type": "user-join", "payload": { "userId": "...", "username": "Kira" } }
{ "type": "user-leave", "payload": { "userId": "...", "username": "Kira" } }
{ "type": "combat:update", "payload": { ... } }
```

---

## 🎨 UI Customization

### CSS Variables

```css
:root {
  --bg-primary:     #0a0b0e;
  --bg-secondary:   #0f1117;
  --bg-panel:       #161924;
  --color-gold:     #c9a84c;
  --color-crimson:  #8b2635;
  --color-teal:     #1a8f7f;
  --color-text:     #c8cce0;
  --color-text-dim: #8890a8;
  --color-border:   #2a2f45;
}
```

Override these in your plugin's CSS to theme the entire application.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the [TypeScript strict mode](tsconfig.json) — no `any` types
4. Add tests for new features
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Philosophy
- **Hooks over monkey-patching** — use the Hook system to extend behavior
- **Immer for state** — all state mutations through the Zustand/Immer store
- **Type-safe** — no `any`, exact optional property types enforced
- **Performance** — profile before optimizing; keep the canvas at 60fps

---

## 📋 Roadmap

### v0.2 (Q3 2025)
- [ ] Pathfinder 2e game system
- [ ] Wall editor UI
- [ ] Mobile companion app (React Native)
- [ ] Compendium browser with search

### v0.3 (Q4 2025)
- [ ] Voice chat integration (WebRTC)
- [ ] Session recording & replay
- [ ] Cloud save sync
- [ ] Marketplace for plugins/modules

### v1.0
- [ ] 3D tabletop mode (Three.js)
- [ ] AI NPC dialogue (local LLM via Ollama)
- [ ] AI dungeon generation
- [ ] VR support

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

Inspired by [Foundry VTT](https://foundryvtt.com), [Roll20](https://roll20.net), and [TaleSpire](https://talespire.com).

Built with: TypeScript · React · PixiJS · Three.js · Zustand · Express · WebSocket · SQLite (libsql) · Turbo

---

*MythicForge VTT — Forge your legend.*
