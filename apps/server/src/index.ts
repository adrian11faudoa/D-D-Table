// ============================================================
// MythicForge VTT — AWS-Aware Game Server
// Supports: PostgreSQL (RDS), Redis (ElastiCache), S3 (assets)
// Falls back to SQLite + local disk when AWS vars not set
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// ─── Config ──────────────────────────────────────────────────
const PORT         = parseInt(process.env['PORT'] ?? '3000');
const JWT_SECRET   = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';
const DATABASE_URL = process.env['DATABASE_URL'] ?? 'file:./data/mythicforge.db';
const REDIS_URL    = process.env['REDIS_URL'] ?? '';
const S3_BUCKET    = process.env['S3_BUCKET'] ?? '';
const AWS_REGION   = process.env['AWS_REGION'] ?? 'us-east-1';
const IS_AWS       = Boolean(S3_BUCKET && process.env['AWS_REGION']);
const IS_POSTGRES  = DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://');
const MAX_UPLOAD   = parseInt(process.env['MAX_UPLOAD_MB'] ?? '50') * 1024 * 1024;

console.log(`[Config] DB:${IS_POSTGRES?'postgres':'sqlite'} Redis:${REDIS_URL?'yes':'no'} S3:${S3_BUCKET||'no'} Mode:${IS_AWS?'AWS':'Local'}`);

// ─── Lazy AWS imports (only if needed) ───────────────────────
let s3Client: import('@aws-sdk/client-s3').S3Client | null = null;
let pgPool: import('pg').Pool | null = null;
let redis: import('ioredis').default | null = null;
let redisSub: import('ioredis').default | null = null;
let libsql: Awaited<ReturnType<typeof import('@libsql/client').createClient>> | null = null;

async function dbQuery(sql: string, args: unknown[] = []): Promise<{ rows: Record<string,unknown>[] }> {
  if (IS_POSTGRES && pgPool) {
    // pg uses $1 placeholders — already in correct format
    const r = await pgPool.query(sql, args as never[]);
    return { rows: r.rows };
  }
  if (libsql) {
    // libsql uses ? placeholders — convert from $N
    const sqlConverted = sql.replace(/\$(\d+)/g, '?');
    const r = await libsql.execute({ sql: sqlConverted, args: args as never[] });
    return { rows: r.rows as Record<string,unknown>[] };
  }
  throw new Error('No DB connection');
}

async function initDatabase(): Promise<void> {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT DEFAULT 'player', color TEXT DEFAULT '#888888', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', game_system_id TEXT NOT NULL, gm_user_id TEXT NOT NULL, settings TEXT DEFAULT '{}', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, name TEXT NOT NULL, data TEXT NOT NULL, thumbnail TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS actors (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, type TEXT NOT NULL, name TEXT NOT NULL, img TEXT, data TEXT NOT NULL, ownership TEXT DEFAULT '{}', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, img TEXT, data TEXT NOT NULL, actor_id TEXT REFERENCES actors(id) ON DELETE CASCADE, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, campaign_id TEXT NOT NULL, type TEXT NOT NULL, content TEXT, speaker TEXT NOT NULL, roll TEXT, whisper_to TEXT, timestamp BIGINT NOT NULL, flags TEXT DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS combats (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, scene_id TEXT NOT NULL, data TEXT NOT NULL, active INTEGER DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS journal_entries (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, name TEXT NOT NULL, content TEXT DEFAULT '', img TEXT, ownership TEXT DEFAULT '{}', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS fog_exploration (scene_id TEXT NOT NULL, user_id TEXT NOT NULL, data TEXT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (scene_id, user_id));
  `;

  if (IS_POSTGRES) {
    const { Pool } = await import('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      ssl: IS_AWS ? { rejectUnauthorized: false } : false,
    });
    await pgPool.query('SELECT NOW()');
    // Postgres uses BIGINT natively; run schema
    const pgSchema = schema
      .replace(/TEXT DEFAULT '\{\}'/g, "JSONB DEFAULT '{}'")
      .replace(/TEXT NOT NULL,\s*created_at BIGINT/g, 'JSONB NOT NULL, created_at BIGINT');
    for (const stmt of pgSchema.split(';').map(s => s.trim()).filter(Boolean)) {
      await pgPool.query(stmt).catch(() => {});
    }
    // Indexes
    await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_actors_campaign ON actors(campaign_id)`).catch(() => {});
    await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_scenes_campaign ON scenes(campaign_id)`).catch(() => {});
    await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id)`).catch(() => {});
    console.log('[DB] PostgreSQL ready');
  } else {
    fs.mkdirSync('./data', { recursive: true });
    const { createClient } = await import('@libsql/client');
    libsql = createClient({ url: DATABASE_URL });
    await libsql.executeMultiple(schema + `
      CREATE INDEX IF NOT EXISTS idx_actors_campaign ON actors(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_scenes_campaign ON scenes(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
    `);
    console.log('[DB] SQLite ready');
  }
}

async function initRedis(): Promise<void> {
  if (!REDIS_URL) return;
  const Redis = (await import('ioredis')).default;
  redis = new Redis(REDIS_URL, {
    tls: IS_AWS ? { rejectUnauthorized: false } : undefined,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  redisSub = new Redis(REDIS_URL, {
    tls: IS_AWS ? { rejectUnauthorized: false } : undefined,
    lazyConnect: true,
  });
  await redis.connect().catch(() => console.warn('[Redis] Connection failed — running without cache'));
  await redisSub.connect().catch(() => {});
  console.log('[Redis] Connected');
}

function initS3(): void {
  if (!S3_BUCKET) return;
  import('@aws-sdk/client-s3').then(({ S3Client }) => {
    s3Client = new S3Client({ region: AWS_REGION });
    console.log(`[S3] Ready: ${S3_BUCKET}`);
  }).catch(() => console.warn('[S3] SDK not installed'));
}

// ─── File Upload ──────────────────────────────────────────────
const SUPPORTED = new Set(['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','video/mp4','video/webm','audio/mp3','audio/mpeg','audio/ogg','audio/wav']);

function createUploader(userId: string) {
  const filter: multer.Options['fileFilter'] = (req, file, cb) =>
    SUPPORTED.has(file.mimetype) ? cb(null, true) : cb(new Error(`Unsupported: ${file.mimetype}`));

  if (s3Client && S3_BUCKET) {
    // Dynamic import multer-s3
    let storage: multer.StorageEngine;
    try {
      const multerS3 = require('multer-s3');
      storage = multerS3({
        s3: s3Client,
        bucket: S3_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req: Request, file: Express.Multer.File, cb: (err: Error | null, key: string) => void) => {
          cb(null, `uploads/${userId}/${uuidv4()}${path.extname(file.originalname)}`);
        },
      });
    } catch {
      // multer-s3 not installed, fall back to disk
      storage = diskStorage(userId);
    }
    return multer({ storage, limits: { fileSize: MAX_UPLOAD }, fileFilter: filter });
  }
  return multer({ storage: diskStorage(userId), limits: { fileSize: MAX_UPLOAD }, fileFilter: filter });
}

function diskStorage(userId: string): multer.StorageEngine {
  const dir = path.join(process.env['UPLOADS_DIR'] ?? './public/uploads', userId);
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  });
}

// ─── WebSocket rooms ──────────────────────────────────────────
interface WSClient { ws: WebSocket; userId: string; sessionId: string; username: string; isAlive: boolean; }
const rooms = new Map<string, Map<string, WSClient>>();
const getRoom = (id: string) => { if (!rooms.has(id)) rooms.set(id, new Map()); return rooms.get(id)!; };

async function broadcast(sessionId: string, event: Record<string,unknown>, excludeId?: string): Promise<void> {
  const msg = JSON.stringify(event);
  if (redis && redisSub) {
    await redis.publish(`mf:${sessionId}`, msg).catch(() => {});
  } else {
    for (const [uid, c] of getRoom(sessionId)) {
      if (uid !== excludeId && c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
    }
  }
}

// ─── Express App ─────────────────────────────────────────────
const app = express();
app.set('trust proxy', IS_AWS ? 1 : false);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public', { maxAge: IS_AWS ? '7d' : 0 }));

interface AuthReq extends Request { userId?: string; userRole?: string; }
const auth = (req: AuthReq, res: Response, next: NextFunction) => {
  const t = req.headers.authorization?.replace('Bearer ','');
  if (!t) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const p = jwt.verify(t, JWT_SECRET) as { sub: string; role: string };
    req.userId = p.sub; req.userRole = p.role; next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};
const gmOnly = (req: AuthReq, res: Response, next: NextFunction) => {
  if (req.userRole !== 'gm' && req.userRole !== 'assistant-gm') {
    res.status(403).json({ error: 'GM only' }); return;
  }
  next();
};

// ── Auth ──────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res): Promise<void> => {
  try {
    const { username, password, displayName } = req.body as Record<string,string>;
    if (!username || !password || password.length < 8) { res.status(400).json({ error: 'username and password (8+ chars) required' }); return; }
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4(), ts = Date.now();
    await dbQuery('INSERT INTO users (id,username,password_hash,display_name,role,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, username.toLowerCase().trim(), hash, displayName || username, 'player', ts, ts]);
    const token = jwt.sign({ sub: id, role: 'player' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: id });
  } catch (e) {
    const msg = (e as { message?: string }).message ?? '';
    res.status(msg.includes('UNIQUE') || msg.includes('unique') ? 409 : 500)
       .json({ error: msg.includes('UNIQUE') || msg.includes('unique') ? 'Username taken' : 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res): Promise<void> => {
  try {
    const { username, password } = req.body as Record<string,string>;
    const r = await dbQuery('SELECT * FROM users WHERE username = $1', [username?.toLowerCase().trim()]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash as string))) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    const token = jwt.sign({ sub: u.id, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: u.id, role: u.role, displayName: u.display_name });
  } catch (e) { res.status(500).json({ error: 'Login failed' }); }
});

// ── Campaigns ─────────────────────────────────────────────────
app.get('/api/campaigns', auth, async (req: AuthReq, res): Promise<void> => {
  const r = await dbQuery('SELECT * FROM campaigns WHERE gm_user_id = $1 ORDER BY updated_at DESC', [req.userId]);
  res.json(r.rows);
});
app.post('/api/campaigns', auth, async (req: AuthReq, res): Promise<void> => {
  const { name, description, gameSystemId } = req.body as Record<string,string>;
  const id = uuidv4(), ts = Date.now();
  await dbQuery('INSERT INTO campaigns (id,name,description,game_system_id,gm_user_id,settings,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, name, description ?? '', gameSystemId ?? 'dnd5e', req.userId, '{}', ts, ts]);
  res.status(201).json({ id, name });
});
app.get('/api/campaigns/:id', auth, async (req, res): Promise<void> => {
  const r = await dbQuery('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  r.rows[0] ? res.json(r.rows[0]) : res.status(404).json({ error: 'Not found' });
});

// ── Scenes ────────────────────────────────────────────────────
app.get('/api/campaigns/:cid/scenes', auth, async (req, res): Promise<void> => {
  const r = await dbQuery('SELECT id,name,thumbnail,created_at,updated_at FROM scenes WHERE campaign_id=$1 ORDER BY created_at', [req.params.cid]);
  res.json(r.rows);
});
app.get('/api/scenes/:id', auth, async (req, res): Promise<void> => {
  const cached = redis ? await redis.get(`scene:${req.params.id}`).catch(() => null) : null;
  if (cached) { res.json(JSON.parse(cached)); return; }
  const r = await dbQuery('SELECT * FROM scenes WHERE id = $1', [req.params.id]);
  if (!r.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  const scene = { ...r.rows[0], data: typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data as string) : r.rows[0].data };
  if (redis) await redis.setex(`scene:${req.params.id}`, 60, JSON.stringify(scene)).catch(() => {});
  res.json(scene);
});
app.post('/api/campaigns/:cid/scenes', auth, gmOnly, async (req: AuthReq, res): Promise<void> => {
  const { name, ...data } = req.body as Record<string,unknown>;
  const id = uuidv4(), ts = Date.now();
  await dbQuery('INSERT INTO scenes (id,campaign_id,name,data,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, req.params.cid, name, JSON.stringify(data), ts, ts]);
  res.status(201).json({ id, name, data });
});
app.patch('/api/scenes/:id', auth, gmOnly, async (req, res): Promise<void> => {
  const r = await dbQuery('SELECT data FROM scenes WHERE id = $1', [req.params.id]);
  if (!r.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  const cur = typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data as string) : r.rows[0].data;
  const merged = { ...cur, ...req.body };
  await dbQuery('UPDATE scenes SET data=$1,updated_at=$2 WHERE id=$3', [JSON.stringify(merged), Date.now(), req.params.id]);
  if (redis) await redis.del(`scene:${req.params.id}`).catch(() => {});
  res.json({ id: req.params.id, data: merged });
});

// ── Actors ────────────────────────────────────────────────────
app.get('/api/campaigns/:cid/actors', auth, async (req, res): Promise<void> => {
  const r = await dbQuery('SELECT * FROM actors WHERE campaign_id=$1 ORDER BY name', [req.params.cid]);
  res.json(r.rows.map(row => ({
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data as string) : row.data,
    ownership: typeof row.ownership === 'string' ? JSON.parse(row.ownership as string) : row.ownership,
  })));
});
app.post('/api/campaigns/:cid/actors', auth, async (req: AuthReq, res): Promise<void> => {
  const { name, type, img, data, ownership } = req.body as Record<string,unknown>;
  const id = uuidv4(), ts = Date.now();
  await dbQuery('INSERT INTO actors (id,campaign_id,type,name,img,data,ownership,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, req.params.cid, type ?? 'character', name, img ?? null, JSON.stringify(data ?? {}), JSON.stringify(ownership ?? {}), ts, ts]);
  res.status(201).json({ id, name, type, img, data, ownership });
});
app.patch('/api/actors/:id', auth, async (req, res): Promise<void> => {
  const r = await dbQuery('SELECT data FROM actors WHERE id=$1', [req.params.id]);
  if (!r.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  const cur = typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data as string) : r.rows[0].data;
  const updated = req.body.data ? { ...cur, ...req.body.data } : cur;
  await dbQuery('UPDATE actors SET data=$1,updated_at=$2 WHERE id=$3', [JSON.stringify(updated), Date.now(), req.params.id]);
  res.json({ success: true, data: updated });
});

// ── Journal ───────────────────────────────────────────────────
app.get('/api/campaigns/:cid/journal', auth, async (req, res): Promise<void> => {
  const r = await dbQuery('SELECT * FROM journal_entries WHERE campaign_id=$1 ORDER BY name', [req.params.cid]);
  res.json(r.rows);
});
app.post('/api/campaigns/:cid/journal', auth, gmOnly, async (req: AuthReq, res): Promise<void> => {
  const { name, content } = req.body as Record<string,string>;
  const id = uuidv4(), ts = Date.now();
  await dbQuery('INSERT INTO journal_entries (id,campaign_id,name,content,ownership,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, req.params.cid, name, content ?? '', '{}', ts, ts]);
  res.status(201).json({ id, name, content });
});

// ── Chat ──────────────────────────────────────────────────────
app.get('/api/sessions/:sid/messages', auth, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 500);
  const r = await dbQuery('SELECT * FROM chat_messages WHERE session_id=$1 ORDER BY timestamp DESC LIMIT $2', [req.params.sid, limit]);
  res.json(r.rows.reverse().map(row => ({
    ...row,
    speaker: typeof row.speaker === 'string' ? JSON.parse(row.speaker as string) : row.speaker,
    roll: row.roll ? (typeof row.roll === 'string' ? JSON.parse(row.roll as string) : row.roll) : null,
    whisper_to: row.whisper_to ? (typeof row.whisper_to === 'string' ? JSON.parse(row.whisper_to as string) : row.whisper_to) : null,
    flags: typeof row.flags === 'string' ? JSON.parse(row.flags as string) : row.flags,
  })));
});

// ── Upload ────────────────────────────────────────────────────
app.post('/api/upload', auth, (req: AuthReq, res, next) => {
  createUploader(req.userId!).single('file')(req, res, err => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    if (!req.file) { res.status(400).json({ error: 'No file' }); return; }
    const f = req.file as Express.Multer.File & { location?: string };
    const url = f.location ?? `/uploads/${req.userId}/${f.filename}`;
    res.json({ url, mimetype: f.mimetype, size: f.size });
  });
});

// Presigned URL for direct S3 uploads (avoids proxying through server)
app.post('/api/upload/presign', auth, async (req: AuthReq, res): Promise<void> => {
  if (!s3Client || !S3_BUCKET) { res.status(400).json({ error: 'S3 not configured' }); return; }
  const { filename, contentType } = req.body as Record<string,string>;
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const key = `uploads/${req.userId}/${uuidv4()}${path.extname(filename ?? '')}`;
  const url = await getSignedUrl(s3Client, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
  res.json({ uploadUrl: url, publicUrl: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`, key });
});

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', async (req, res): Promise<void> => {
  let db = 'ok', cache = redis ? 'unchecked' : 'n/a';
  try { await dbQuery('SELECT 1 AS p', []); } catch { db = 'error'; }
  if (redis) { try { await redis.ping(); cache = 'ok'; } catch { cache = 'error'; } }
  res.status(db === 'ok' ? 200 : 503).json({
    status: db === 'ok' ? 'ok' : 'degraded',
    version: '0.1.0',
    uptime: Math.floor(process.uptime()),
    db, cache, s3: S3_BUCKET ? 'configured' : 'n/a',
    mode: IS_AWS ? 'aws' : 'local',
  });
});

// ─── WebSocket ────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const hb = setInterval(() => {
  wss.clients.forEach(ws => {
    const c = ws as WebSocket & { isAlive?: boolean };
    if (c.isAlive === false) { c.terminate(); return; }
    c.isAlive = false; c.ping();
  });
}, 30_000);

wss.on('connection', async (ws: WebSocket, req) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const sessionId = url.searchParams.get('session') ?? '';
  const userId    = url.searchParams.get('user') ?? '';
  const token     = url.searchParams.get('token') ?? '';

  try { jwt.verify(token, JWT_SECRET); }
  catch { ws.close(4001, 'Unauthorized'); return; }

  const ur = await dbQuery('SELECT * FROM users WHERE id=$1', [userId]).catch(() => ({ rows: [] }));
  const u = ur.rows[0];
  if (!u) { ws.close(4003, 'Not found'); return; }

  const client: WSClient = { ws, userId, sessionId, username: u.display_name as string, isAlive: true };
  getRoom(sessionId).set(userId, client);
  (ws as WebSocket & { isAlive: boolean }).isAlive = true;
  ws.on('pong', () => { (ws as WebSocket & { isAlive: boolean }).isAlive = true; });

  // Subscribe to Redis channel for this session (multi-instance)
  if (redisSub) {
    redisSub.subscribe(`mf:${sessionId}`).catch(() => {});
    redisSub.on('message', (ch: string, msg: string) => {
      if (ch === `mf:${sessionId}` && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    });
  }

  broadcast(sessionId, { type: 'user-join', payload: { userId, username: u.display_name, role: u.role }, userId, timestamp: Date.now() }).catch(() => {});

  ws.send(JSON.stringify({
    type: 'connect',
    payload: { sessionId, userId, username: u.display_name, connectedUsers: [...getRoom(sessionId).values()].map(c => ({ userId: c.userId, username: c.username })) },
    timestamp: Date.now(),
  }));

  ws.on('message', async (data: Buffer) => {
    try {
      const event = JSON.parse(data.toString()) as Record<string,unknown>;
      event.userId = userId;
      event.timestamp = Date.now();
      const { type, payload } = event as { type: string; payload: Record<string,unknown> };

      if (type === 'chat:message') {
        const msg = payload;
        const whisper = msg.whisper_to as string[] | undefined;
        await dbQuery('INSERT INTO chat_messages (id,session_id,campaign_id,type,content,speaker,roll,whisper_to,timestamp,flags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [msg.id ?? uuidv4(), sessionId, msg.campaignId ?? '', msg.type ?? 'chat', msg.content ?? '',
           JSON.stringify(msg.speaker), msg.roll ? JSON.stringify(msg.roll) : null,
           whisper ? JSON.stringify(whisper) : null, Date.now(), '{}']).catch(() => {});
        if (whisper?.length) {
          for (const tid of whisper) { const t = getRoom(sessionId).get(tid); if (t?.ws.readyState === WebSocket.OPEN) t.ws.send(JSON.stringify(event)); }
          ws.send(JSON.stringify(event));
        } else { await broadcast(sessionId, event); }
      } else if (type === 'fog:update') {
        await broadcast(sessionId, event, userId);
        const fp = payload as { sceneId?: string };
        if (fp.sceneId) await dbQuery('INSERT INTO fog_exploration (scene_id,user_id,data,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (scene_id,user_id) DO UPDATE SET data=$3,updated_at=$4',
          [fp.sceneId, userId, JSON.stringify(payload), Date.now()]).catch(() => {});
      } else if (type === 'dice:roll' && (payload.rollMode === 'gmroll' || payload.rollMode === 'blindroll')) {
        // Only to GMs and self
        for (const [,c] of getRoom(sessionId)) { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(event)); }
      } else {
        await broadcast(sessionId, event, type.startsWith('token:') || type === 'canvas:ping' ? undefined : userId);
      }
    } catch (e) { console.error('[WS] msg error:', e); }
  });

  ws.on('close', () => {
    getRoom(sessionId).delete(userId);
    broadcast(sessionId, { type: 'user-leave', payload: { userId, username: u.display_name }, userId, timestamp: Date.now() }).catch(() => {});
    if (getRoom(sessionId).size === 0) rooms.delete(sessionId);
  });
});

// ─── Start ────────────────────────────────────────────────────
async function shutdown() {
  console.log('[Server] Shutting down...');
  clearInterval(hb);
  httpServer.close();
  await (pgPool?.end().catch(() => {}));
  await (redis?.quit().catch(() => {}));
  await (redisSub?.quit().catch(() => {}));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function start() {
  console.log('⚔  MythicForge VTT Server starting...');
  ['./data','./public/assets','./public/uploads'].forEach(d => fs.mkdirSync(d, { recursive: true }));
  await initDatabase();
  await initRedis();
  initS3();
  if (redisSub) {
    // Re-broadcast from Redis to local WebSocket clients
    redisSub.on('message', (channel: string, message: string) => {
      const sessionId = channel.replace('mf:', '');
      try {
        const event = JSON.parse(message) as { excludeUserId?: string };
        const exclude = event.excludeUserId;
        delete event.excludeUserId;
        for (const [uid, c] of getRoom(sessionId)) {
          if (uid !== exclude && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(event));
        }
      } catch { /* ignore */ }
    });
  }
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Listening on :${PORT}`);
    console.log(`✓ DB: ${IS_POSTGRES ? 'PostgreSQL' : 'SQLite'} | Redis: ${REDIS_URL ? 'yes' : 'no'} | S3: ${S3_BUCKET || 'no'}`);
    console.log(`✓ Mode: ${IS_AWS ? '☁  AWS' : '🖥  Local'}\n`);
  });
}

start().catch(e => { console.error('[FATAL]', e); process.exit(1); });
