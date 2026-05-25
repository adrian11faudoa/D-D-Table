# MythicForge VTT — API Documentation

## Overview

The MythicForge VTT API is a REST + WebSocket API. All HTTP endpoints
return JSON. WebSocket events use a structured envelope format.

**Base URL:** `http://your-server:3000`

---

## Authentication

MythicForge uses JWT Bearer tokens.

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "aldric",
  "password": "your-secure-password",
  "displayName": "Aldric Stormveil"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "aldric",
  "password": "your-secure-password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "gm",
  "displayName": "Aldric Stormveil"
}
```

Include the token in all subsequent requests:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR...
```

---

## Campaigns

### List Campaigns

```http
GET /api/campaigns
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Tomb of Annihilation",
    "description": "...",
    "game_system_id": "dnd5e",
    "gm_user_id": "uuid",
    "created_at": 1716000000000,
    "updated_at": 1716000000000
  }
]
```

### Create Campaign

```http
POST /api/campaigns
Content-Type: application/json

{
  "name": "Curse of Strahd",
  "description": "Gothic horror in the land of Barovia",
  "gameSystemId": "dnd5e"
}
```

---

## Scenes

### List Scenes

```http
GET /api/campaigns/{campaignId}/scenes
```

### Get Full Scene

```http
GET /api/scenes/{sceneId}
```

**Response:** Full scene object including all tokens, walls, lights, drawings.

### Create Scene

```http
POST /api/campaigns/{campaignId}/scenes
Authorization: Bearer {token}   [GM only]
Content-Type: application/json

{
  "name": "The Catacombs",
  "width": 4000,
  "height": 3000,
  "backgroundImageUrl": "/uploads/maps/catacombs.webp",
  "grid": {
    "type": "square",
    "size": 100,
    "scale": "5 ft",
    "color": "#888888",
    "alpha": 0.3,
    "snap": true
  },
  "globalLightLevel": 0.0,
  "darknessLevel": 1.0,
  "tokenVision": true
}
```

### Update Scene

```http
PATCH /api/scenes/{sceneId}
Authorization: Bearer {token}   [GM only]
Content-Type: application/json

{
  "darknessLevel": 0.5,
  "weather": { "type": "fog", "intensity": 0.6 }
}
```

---

## Actors (Characters & NPCs)

### List Actors

```http
GET /api/campaigns/{campaignId}/actors
```

### Create Actor

```http
POST /api/campaigns/{campaignId}/actors
Content-Type: application/json

{
  "type": "character",
  "name": "Kira Ashblade",
  "img": "/uploads/tokens/rogue.webp",
  "data": {
    "abilities": {
      "str": { "value": 12, "proficient": 0 },
      "dex": { "value": 18, "proficient": 1 },
      "con": { "value": 14, "proficient": 0 },
      "int": { "value": 13, "proficient": 0 },
      "wis": { "value": 14, "proficient": 0 },
      "cha": { "value": 12, "proficient": 0 }
    },
    "attributes": {
      "hp": { "value": 41, "min": 0, "max": 48, "temp": 0 },
      "ac": { "value": 16, "calc": "default" },
      "speed": { "value": 30 },
      "prof": 3,
      "spellcasting": ""
    }
  },
  "ownership": {
    "user-uuid-here": 3
  }
}
```

### Update Actor

```http
PATCH /api/actors/{actorId}
Content-Type: application/json

{
  "data": {
    "attributes": {
      "hp": { "value": 35 }
    }
  }
}
```

---

## Chat Messages

### Get Recent Messages

```http
GET /api/sessions/{sessionId}/messages?limit=100
```

Messages are stored per-session and returned in chronological order.

---

## File Upload

```http
POST /api/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [binary file data]
```

**Supported types:** PNG, JPG, WEBP, GIF, SVG, MP4, WebM, MP3, OGG, WAV

**Max size:** 50MB

**Response:**
```json
{
  "url": "/uploads/user-id/filename.webp",
  "filename": "uuid.webp",
  "mimetype": "image/webp",
  "size": 1048576
}
```

---

## WebSocket Protocol

Connect to `ws://localhost:3000/ws` with query parameters:

```
ws://localhost:3000/ws?session=SESSION_ID&user=USER_ID&token=JWT_TOKEN
```

### Event Envelope

All events follow this structure:

```typescript
interface SocketEvent<T = unknown> {
  type: EventType;      // string event name
  payload: T;           // event-specific data
  userId: UUID;         // sender's user ID
  timestamp: number;    // Unix timestamp ms
}
```

### Token Events

**token:move** — Move a token
```json
{
  "type": "token:move",
  "payload": {
    "sceneId": "uuid",
    "tokenId": "uuid",
    "x": 400,
    "y": 300
  }
}
```

**token:create** — Add a token to the scene
```json
{
  "type": "token:create",
  "payload": {
    "sceneId": "uuid",
    "token": { /* full Token object */ }
  }
}
```

**token:update** — Update token properties
```json
{
  "type": "token:update",
  "payload": {
    "sceneId": "uuid",
    "tokenId": "uuid",
    "data": {
      "rotation": 45,
      "effects": ["icons/conditions/poisoned.webp"]
    }
  }
}
```

**token:delete** — Remove a token
```json
{
  "type": "token:delete",
  "payload": { "sceneId": "uuid", "tokenId": "uuid" }
}
```

### Combat Events

**combat:next-turn** — Advance to the next turn
```json
{ "type": "combat:next-turn", "payload": { "combatId": "uuid" } }
```

**combat:initiative** — Set initiative values
```json
{
  "type": "combat:initiative",
  "payload": {
    "combatId": "uuid",
    "initiatives": [
      { "combatantId": "uuid", "initiative": 22 },
      { "combatantId": "uuid", "initiative": 17 }
    ]
  }
}
```

**combat:update** — Full combat state sync
```json
{
  "type": "combat:update",
  "payload": { /* full Combat object */ }
}
```

### Chat Events

**chat:message** — Send a chat message
```json
{
  "type": "chat:message",
  "payload": {
    "id": "uuid",
    "type": "chat",
    "content": "I cast Fireball!",
    "speaker": {
      "userId": "uuid",
      "actorId": "uuid",
      "alias": "Aldric Stormveil"
    }
  }
}
```

**chat:message** with roll — Message with embedded dice roll
```json
{
  "type": "chat:message",
  "payload": {
    "id": "uuid",
    "type": "roll",
    "content": "",
    "speaker": { "userId": "uuid", "alias": "Aldric" },
    "roll": {
      "formula": "1d20+9",
      "total": 24,
      "terms": [
        { "type": "die", "faces": 20, "number": 1, "results": [{ "result": 15, "active": true }] },
        { "type": "operator", "operator": "+" },
        { "type": "numeric", "number": 9 }
      ],
      "rollMode": "publicroll"
    }
  }
}
```

### Fog Events

**fog:update** — Update explored fog data (GM auto-broadcasts from client)
```json
{
  "type": "fog:update",
  "payload": {
    "sceneId": "uuid",
    "data": "data:image/png;base64,..."
  }
}
```

### Ping Events

**canvas:ping** — Visual map ping for everyone
```json
{
  "type": "canvas:ping",
  "payload": { "x": 1200, "y": 800 }
}
```

### Scene Events

**scene:activate** — GM changes the active scene (all players follow)
```json
{
  "type": "scene:activate",
  "payload": { "sceneId": "uuid" }
}
```

### Connection Events

These are server → client only:

**connect** — Sent to you when you join
```json
{
  "type": "connect",
  "payload": {
    "sessionId": "uuid",
    "userId": "uuid",
    "connectedUsers": [
      { "userId": "uuid", "username": "GM Varek" }
    ]
  }
}
```

**user-join** / **user-leave** — Broadcast when players join/leave
```json
{
  "type": "user-join",
  "payload": { "userId": "uuid", "username": "Kira", "role": "player" }
}
```

---

## Plugin API Reference

Plugins access the global `game` object:

```typescript
// Core collections
game.actors.get(id)
game.actors.getAll()
game.actors.create(data)
game.actors.update(id, data)
game.actors.delete(id)

// Active scene
game.canvas.scene           // current Scene
game.canvas.tokens.controlled  // selected tokens
game.canvas.ping(x, y)      // show a ping

// Settings
game.settings.register('my-module', 'key', config)
game.settings.get('my-module', 'key')
game.settings.set('my-module', 'key', value)

// i18n
game.i18n.localize('MODULE.label')
game.i18n.format('MODULE.template', { name: 'Aldric' })

// Roll dice
import { roll, rollAdvantage } from '@mythicforge/dice-engine';
const result = roll('2d6+3', { flavor: 'Sneak Attack' });

// Socket
game.socket.emit('my-module.myEvent', { data: 'value' });
game.socket.on('my-module.myEvent', (data, userId) => { });

// Notifications
import { UIHelpers } from '@mythicforge/plugin-api';
UIHelpers.notify('My plugin did something!', { type: 'info' });
```

### Hook Registration

```typescript
import { Hooks, HOOKS } from '@mythicforge/plugin-api';

// Listen to core hooks
const hookId = Hooks.on(HOOKS.CREATE_ACTOR, (actor) => {
  console.log('Actor created:', actor.name);
});

// One-time hook
Hooks.once(HOOKS.READY, () => {
  console.log('Game ready!');
});

// Unregister
Hooks.off(hookId);

// Block default behavior (return false)
Hooks.on(HOOKS.PRE_ROLL, (rollData) => {
  if (someCondition) return false; // cancels the roll
});
```

---

## System Template Format

Game systems define their data schema via a template:

```json
{
  "Actor": {
    "character": {
      "abilities": {
        "str": { "value": 10, "proficient": 0 },
        "dex": { "value": 10, "proficient": 0 }
      },
      "attributes": {
        "hp": { "value": 10, "min": 0, "max": 10, "temp": 0 }
      }
    },
    "npc": { }
  },
  "Item": {
    "weapon": {
      "damage": { "parts": [], "versatile": "" },
      "range": { "value": null, "long": null, "units": "" }
    },
    "spell": {
      "level": 0,
      "school": "abj",
      "components": { "vocal": false, "somatic": false, "material": false }
    }
  }
}
```

---

*MythicForge VTT API v0.1.0 — For the latest docs visit docs.mythicforge.io*
