// ============================================================
// MythicForge VTT — Game Server
// Express REST API + WebSocket real-time sync
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@libsql/client';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import type { SocketEvent, EventType, UUID } from '@mythicforge/shared';
import {
  DEFAULT_PORT, ASSETS_DIR, UPLOADS_DIR,
  MAX_UPLOAD_SIZE_MB, SUPPORTED_IMAGE_TYPES,
  SUPPORTED_VIDEO_TYPES, SUPPORTED_AUDIO_TYPES
} from '@mythicforge/shared';

// ─── Config ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? String(DEFAULT_PORT));
const JWT_SECRET = process.env.JWT_SECRET ?? 'mythicforge-dev-secret-change-in-prod';
const DB_URL = process.env.DATABASE_URL ?? 'file:./data/mythicforge.db';
const MAX_UPLOAD = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

// ─── Database ─────────────────────────────────────────────────
const db = createClient({ url: DB_URL });

async function initDatabase(): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT DEFAULT 'player',
      color TEXT DEFAULT '#888888',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      game_system_id TEXT NOT NULL,
      gm_user_id TEXT NOT NULL,
      settings JSON DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (gm_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      data JSON NOT NULL,
      thumbnail TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS actors (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      img TEXT,
      data JSON NOT NULL,
      ownership JSON DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      img TEXT,
      data JSON NOT NULL,
      actor_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS combats (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      scene_id TEXT NOT NULL,
      data JSON NOT NULL,
      active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      speaker JSON NOT NULL,
      roll JSON,
      whisper_to JSON,
      timestamp INTEGER NOT NULL,
      flags JSON DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT DEFAULT '',
      img TEXT,
      ownership JSON DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS macros (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      img TEXT,
      scope TEXT DEFAULT 'global',
      command TEXT NOT NULL,
      author TEXT NOT NULL,
      ownership JSON DEFAULT '{}',
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      host_user_id TEXT NOT NULL,
      active_scene_id TEXT,
      settings JSON DEFAULT '{}',
      started_at INTEGER,
      ended_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );

    CREATE TABLE IF NOT EXISTS fog_exploration (
      scene_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (scene_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_actors_campaign ON actors(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_scenes_campaign ON scenes(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_items_actor ON items(actor_id);
  `);
}

// ─── WebSocket Room Manager ───────────────────────────────────
interface WSClient {
  ws: WebSocket;
  userId: UUID;
  sessionId: UUID;
  username: string;
  isAlive: boolean;
}

const rooms = new Map<UUID, Map<UUID, WSClient>>();

function getRoom(sessionId: UUID): Map<UUID, WSClient> {
  if (!rooms.has(sessionId)) rooms.set(sessionId, new Map());
  return rooms.get(sessionId)!;
}

function broadcast<T>(
  sessionId: UUID,
  event: SocketEvent<T>,
  excludeUserId?: UUID
): void {
  const room = getRoom(sessionId);
  const message = JSON.stringify(event);
  for (const [userId, client] of room) {
    if (userId === excludeUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

function sendTo<T>(userId: UUID, sessionId: UUID, event: SocketEvent<T>): boolean {
  const client = getRoom(sessionId).get(userId);
  if (client?.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(event));
    return true;
  }
  return false;
}

// ─── Auth Middleware ──────────────────────────────────────────
interface AuthRequest extends Request {
  userId?: UUID;
  userRole?: string;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: UUID; role: string };
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function gmOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'gm' && req.userRole !== 'assistant-gm') {
    res.status(403).json({ error: 'GM access required' });
    return;
  }
  next();
}

// ─── File Upload ──────────────────────────────────────────────
const supportedTypes = new Set([
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_VIDEO_TYPES,
  ...SUPPORTED_AUDIO_TYPES,
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = (req as AuthRequest).userId ?? 'anonymous';
    const dir = path.join(UPLOADS_DIR, userId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD },
  fileFilter: (req, file, cb) => {
    if (supportedTypes.has(file.mimetype as typeof SUPPORTED_IMAGE_TYPES[number])) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ─── Express App ─────────────────────────────────────────────
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ── Auth Routes ──────────────────────────────────────────────
app.post('/api/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, displayName } = req.body as Record<string, string>;
    if (!username || !password) { res.status(400).json({ error: 'Missing fields' }); return; }

    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4() as UUID;
    const ts = Date.now();

    await db.execute({
      sql: `INSERT INTO users (id, username, password_hash, display_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, username.toLowerCase(), hash, displayName || username, ts, ts],
    });

    const token = jwt.sign({ sub: id, role: 'player' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: id });
  } catch (err) {
    if ((err as { message?: string }).message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Username already taken' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as Record<string, string>;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username?.toLowerCase()],
    });

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash as string))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id, role: user.role, displayName: user.display_name });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Campaign Routes ───────────────────────────────────────────
app.get('/api/campaigns', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT c.* FROM campaigns c
          LEFT JOIN sessions s ON s.campaign_id = c.id
          WHERE c.gm_user_id = ? OR JSON_EXTRACT(c.settings, '$.playerIds') LIKE ?`,
    args: [req.userId!, `%${req.userId}%`],
  });
  res.json(result.rows);
});

app.post('/api/campaigns', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, description, gameSystemId } = req.body as Record<string, string>;
  const id = uuidv4();
  const ts = Date.now();
  await db.execute({
    sql: `INSERT INTO campaigns (id, name, description, game_system_id, gm_user_id, settings, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
    args: [id, name, description ?? '', gameSystemId, req.userId!, ts, ts],
  });
  const result = await db.execute({ sql: 'SELECT * FROM campaigns WHERE id = ?', args: [id] });
  res.json(result.rows[0]);
});

// ── Scene Routes ──────────────────────────────────────────────
app.get('/api/campaigns/:campaignId/scenes', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const result = await db.execute({
    sql: 'SELECT id, name, thumbnail, created_at, updated_at FROM scenes WHERE campaign_id = ?',
    args: [req.params.campaignId],
  });
  res.json(result.rows);
});

app.get('/api/scenes/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const result = await db.execute({ sql: 'SELECT * FROM scenes WHERE id = ?', args: [req.params.id] });
  if (!result.rows[0]) { res.status(404).json({ error: 'Scene not found' }); return; }
  const row = result.rows[0];
  res.json({ ...row, data: JSON.parse(row.data as string) });
});

app.post('/api/campaigns/:campaignId/scenes', authMiddleware, gmOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = uuidv4();
  const ts = Date.now();
  const { name, ...data } = req.body as Record<string, unknown>;
  await db.execute({
    sql: `INSERT INTO scenes (id, campaign_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, req.params.campaignId, name, JSON.stringify(data), ts, ts],
  });
  res.json({ id, name, data });
});

app.patch('/api/scenes/:id', authMiddleware, gmOnly, async (req: Request, res: Response): Promise<void> => {
  const ts = Date.now();
  const existing = await db.execute({ sql: 'SELECT data FROM scenes WHERE id = ?', args: [req.params.id] });
  if (!existing.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  const merged = { ...JSON.parse(existing.rows[0].data as string), ...req.body };
  await db.execute({
    sql: 'UPDATE scenes SET data = ?, updated_at = ? WHERE id = ?',
    args: [JSON.stringify(merged), ts, req.params.id],
  });
  res.json({ id: req.params.id, data: merged });
});

// ── Actor Routes ──────────────────────────────────────────────
app.get('/api/campaigns/:campaignId/actors', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const result = await db.execute({
    sql: 'SELECT * FROM actors WHERE campaign_id = ?',
    args: [req.params.campaignId],
  });
  res.json(result.rows.map(r => ({ ...r, data: JSON.parse(r.data as string), ownership: JSON.parse(r.ownership as string) })));
});

app.post('/api/campaigns/:campaignId/actors', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = uuidv4();
  const ts = Date.now();
  const { name, type, img, data, ownership } = req.body as Record<string, unknown>;
  await db.execute({
    sql: `INSERT INTO actors (id, campaign_id, type, name, img, data, ownership, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, req.params.campaignId, type, name, img ?? null, JSON.stringify(data ?? {}), JSON.stringify(ownership ?? {}), ts, ts],
  });
  res.json({ id, name, type, img, data, ownership });
});

// ── Chat Routes ───────────────────────────────────────────────
app.get('/api/sessions/:sessionId/messages', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const limit = parseInt(req.query['limit'] as string) || 100;
  const result = await db.execute({
    sql: `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?`,
    args: [req.params.sessionId, limit],
  });
  res.json(result.rows.reverse().map(r => ({
    ...r,
    speaker: JSON.parse(r.speaker as string),
    roll: r.roll ? JSON.parse(r.roll as string) : null,
    whisper_to: r.whisper_to ? JSON.parse(r.whisper_to as string) : null,
    flags: JSON.parse(r.flags as string),
  })));
});

// ── File Upload ───────────────────────────────────────────────
app.post('/api/upload', authMiddleware, upload.single('file'), (req: AuthRequest, res: Response): void => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const url = `/uploads/${req.userId}/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, mimetype: req.file.mimetype, size: req.file.size });
});

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req: Request, res: Response): void => {
  res.json({ status: 'ok', version: '0.1.0', uptime: process.uptime() });
});

// ─── WebSocket Server ────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Heartbeat
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const client = ws as WebSocket & { isAlive?: boolean };
    if (client.isAlive === false) { client.terminate(); return; }
    client.isAlive = false;
    client.ping();
  });
}, 30_000);

wss.on('connection', async (ws: WebSocket, req) => {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const sessionId = url.searchParams.get('session') as UUID | null;
  const userId = url.searchParams.get('user') as UUID | null;
  const token = url.searchParams.get('token');

  // Validate token
  if (!token || !sessionId || !userId) {
    ws.close(4001, 'Missing credentials');
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    ws.close(4002, 'Invalid token');
    return;
  }

  // Get user info
  const userResult = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
  const user = userResult.rows[0];
  if (!user) { ws.close(4003, 'User not found'); return; }

  const client: WSClient = {
    ws,
    userId,
    sessionId,
    username: user.display_name as string,
    isAlive: true,
  };

  // Join room
  getRoom(sessionId).set(userId, client);

  // Heartbeat
  (ws as WebSocket & { isAlive: boolean }).isAlive = true;
  ws.on('pong', () => { (ws as WebSocket & { isAlive: boolean }).isAlive = true; });

  // Notify others
  broadcast(sessionId, {
    type: 'user-join',
    payload: { userId, username: user.display_name, role: user.role },
    userId,
    timestamp: Date.now() as unknown as import('@mythicforge/shared').Timestamp,
  }, userId);

  // Send ack
  ws.send(JSON.stringify({
    type: 'connect',
    payload: {
      sessionId,
      userId,
      username: user.display_name,
      connectedUsers: [...getRoom(sessionId).values()].map(c => ({
        userId: c.userId,
        username: c.username,
      })),
    },
    userId,
    timestamp: Date.now(),
  }));

  // Message handler
  ws.on('message', async (data: Buffer) => {
    try {
      const event = JSON.parse(data.toString()) as SocketEvent;
      event.userId = userId;
      event.timestamp = Date.now() as unknown as import('@mythicforge/shared').Timestamp;
      await handleSocketEvent(client, event, sessionId);
    } catch (err) {
      console.error('[WS] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    getRoom(sessionId).delete(userId);
    broadcast(sessionId, {
      type: 'user-leave',
      payload: { userId, username: user.display_name },
      userId,
      timestamp: Date.now() as unknown as import('@mythicforge/shared').Timestamp,
    });
    if (getRoom(sessionId).size === 0) rooms.delete(sessionId);
  });
});

async function handleSocketEvent(
  client: WSClient,
  event: SocketEvent,
  sessionId: UUID
): Promise<void> {
  const { type, payload, userId } = event;

  switch (type as EventType) {
    case 'token:move':
    case 'token:update':
    case 'token:create':
    case 'token:delete':
      broadcast(sessionId, event, undefined); // broadcast to all including sender
      break;

    case 'combat:update':
    case 'combat:next-turn':
    case 'combat:prev-turn':
    case 'combat:initiative':
      broadcast(sessionId, event);
      // Persist combat state
      await persistCombat(payload, sessionId);
      break;

    case 'chat:message': {
      const msg = payload as { id: string; content: string; type: string; speaker: unknown; roll?: unknown; whisper_to?: UUID[] };
      // Persist
      await db.execute({
        sql: `INSERT INTO chat_messages (id, session_id, campaign_id, type, content, speaker, roll, whisper_to, timestamp, flags)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
        args: [
          msg.id ?? uuidv4(),
          sessionId,
          (payload as { campaignId?: string }).campaignId ?? '',
          msg.type ?? 'chat',
          msg.content ?? '',
          JSON.stringify(msg.speaker),
          msg.roll ? JSON.stringify(msg.roll) : null,
          msg.whisper_to ? JSON.stringify(msg.whisper_to) : null,
          Date.now(),
        ],
      });

      // Handle whispers
      if (msg.whisper_to && msg.whisper_to.length > 0) {
        for (const targetId of msg.whisper_to) {
          sendTo(targetId, sessionId, event);
        }
        sendTo(userId, sessionId, event); // echo to sender
      } else {
        broadcast(sessionId, event);
      }
      break;
    }

    case 'dice:roll': {
      const roll = payload as { rollMode?: string };
      if (roll.rollMode === 'gmroll') {
        // Send only to GM and roller
        sendTo(userId, sessionId, event);
        for (const [uid, c] of getRoom(sessionId)) {
          if (c.username === 'GM' || uid === userId) sendTo(uid, sessionId, event);
        }
      } else if (roll.rollMode === 'blindroll') {
        // Send only to GM
        for (const [, c] of getRoom(sessionId)) {
          if (c.username === 'GM') sendTo(c.userId, sessionId, event);
        }
      } else {
        broadcast(sessionId, event);
      }
      break;
    }

    case 'fog:update':
      broadcast(sessionId, event, userId); // exclude sender
      await saveFogData(userId, (payload as { sceneId: UUID }).sceneId, payload);
      break;

    case 'canvas:ping':
      broadcast(sessionId, event); // everyone sees pings
      break;

    case 'drawing:create':
    case 'drawing:update':
    case 'drawing:delete':
      broadcast(sessionId, event, userId);
      break;

    case 'scene:activate':
      broadcast(sessionId, event); // GM broadcasts scene change to all
      break;

    default:
      broadcast(sessionId, event, userId);
      break;
  }
}

async function persistCombat(payload: unknown, sessionId: UUID): Promise<void> {
  const data = payload as { id?: string; campaignId?: string };
  if (!data.id) return;
  const ts = Date.now();
  await db.execute({
    sql: `INSERT INTO combats (id, campaign_id, scene_id, data, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [data.id, data.campaignId ?? '', sessionId, JSON.stringify(payload), ts, ts],
  });
}

async function saveFogData(userId: UUID, sceneId: UUID, data: unknown): Promise<void> {
  await db.execute({
    sql: `INSERT INTO fog_exploration (scene_id, user_id, data, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(scene_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [sceneId, userId, JSON.stringify(data), Date.now()],
  });
}

// ─── Startup ─────────────────────────────────────────────────
async function start(): Promise<void> {
  console.log('⚔  MythicForge VTT Server starting...');

  // Ensure directories exist
  [ASSETS_DIR, UPLOADS_DIR, 'data', 'public'].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });

  await initDatabase();
  console.log('✓  Database initialized');

  httpServer.listen(PORT, () => {
    console.log(`✓  HTTP server listening on port ${PORT}`);
    console.log(`✓  WebSocket server on ws://localhost:${PORT}/ws`);
    console.log(`✓  API available at http://localhost:${PORT}/api`);
    console.log('⚔  MythicForge VTT ready!\n');
  });

  process.on('SIGTERM', () => {
    console.log('Shutting down...');
    clearInterval(heartbeatInterval);
    httpServer.close(() => process.exit(0));
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
