// ============================================================
// @mythicforge/network — Real-time networking layer
// Client-side WebSocket manager with reconnection, typing, room support
// ============================================================

import type { SocketEvent, EventType, UUID } from '@mythicforge/shared';
import { WS_RECONNECT_DELAY, WS_MAX_RECONNECTS, WS_PING_INTERVAL, WS_TIMEOUT } from '@mythicforge/shared';

// ─── Types ───────────────────────────────────────────────────
type EventHandler<T = unknown> = (event: SocketEvent<T>) => void;

export interface NetworkConfig {
  url: string;
  sessionId: UUID;
  userId: UUID;
  token: string;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onReconnecting?: (attempt: number) => void;
  onError?: (error: Error) => void;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// ─── MythicForge Network Client ───────────────────────────────
export class MythicForgeNetwork {
  private ws: WebSocket | null = null;
  private config: NetworkConfig;
  private handlers = new Map<EventType | '*', Set<EventHandler>>();
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private latency = 0;
  private lastPingSent = 0;
  private messageQueue: SocketEvent[] = [];

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  // ─── Connection ────────────────────────────────────────────
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === 'connected') {
        resolve();
        return;
      }

      this.setState('connecting');
      const url = new URL(this.config.url);
      url.searchParams.set('session', this.config.sessionId);
      url.searchParams.set('user', this.config.userId);
      url.searchParams.set('token', this.config.token);

      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, WS_TIMEOUT);

      this.ws = new WebSocket(url.toString());
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        clearTimeout(timeoutId);
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.startPing();
        this.flushQueue();
        this.config.onConnect?.();
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : this.decodeArrayBuffer(event.data as ArrayBuffer);
          this.handleMessage(data as SocketEvent);
        } catch (err) {
          console.error('[Network] Failed to parse message:', err);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        clearTimeout(timeoutId);
        this.stopPing();
        this.setState('disconnected');
        this.config.onDisconnect?.(event.reason || 'Connection closed');

        if (event.code !== 1000 && this.reconnectAttempts < WS_MAX_RECONNECTS) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        const err = new Error('WebSocket connection error');
        this.config.onError?.(err);
        reject(err);
      };
    });
  }

  disconnect(code = 1000, reason = 'Client disconnecting'): void {
    this.reconnectAttempts = WS_MAX_RECONNECTS; // prevent reconnect
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(code, reason);
    this.ws = null;
    this.setState('disconnected');
  }

  // ─── Sending ───────────────────────────────────────────────
  emit<T>(type: EventType, payload: T): boolean {
    const event: SocketEvent<T> = {
      type,
      payload,
      userId: this.config.userId,
      timestamp: Date.now() as import('@mythicforge/shared').Timestamp,
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
      return true;
    } else {
      // Queue for when we reconnect
      this.messageQueue.push(event as SocketEvent);
      return false;
    }
  }

  // ─── Receiving ─────────────────────────────────────────────
  on<T = unknown>(type: EventType | '*', handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler as EventHandler);
    };
  }

  once<T = unknown>(type: EventType, handler: EventHandler<T>): () => void {
    const unsub = this.on<T>(type, (event) => {
      unsub();
      handler(event);
    });
    return unsub;
  }

  off(type: EventType | '*', handler?: EventHandler): void {
    if (!handler) {
      this.handlers.delete(type);
    } else {
      this.handlers.get(type)?.delete(handler);
    }
  }

  // ─── Private ───────────────────────────────────────────────
  private handleMessage(event: SocketEvent): void {
    // Handle pong for latency measurement
    if ((event.type as string) === 'pong') {
      this.latency = Date.now() - this.lastPingSent;
      return;
    }

    // Dispatch to wildcard handlers
    this.handlers.get('*')?.forEach(h => h(event));

    // Dispatch to specific handlers
    this.handlers.get(event.type)?.forEach(h => h(event));
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    this.reconnectAttempts++;
    const delay = Math.min(WS_RECONNECT_DELAY * this.reconnectAttempts, 30_000);
    this.config.onReconnecting?.(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        if (this.reconnectAttempts < WS_MAX_RECONNECTS) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingSent = Date.now();
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: this.lastPingSent }));
      }
    }, WS_PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const event = this.messageQueue.shift();
      if (event && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(event));
      }
    }
  }

  private decodeArrayBuffer(buffer: ArrayBuffer): unknown {
    const text = new TextDecoder().decode(buffer);
    return JSON.parse(text);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
  }

  // ─── Public Getters ────────────────────────────────────────
  get connectionState(): ConnectionState { return this.state; }
  get isConnected(): boolean { return this.state === 'connected'; }
  get ping(): number { return this.latency; }
}

// ─── Server-side (Node.js) ────────────────────────────────────
// This runs in the Electron/Node backend or dedicated server

export interface ServerConfig {
  port: number;
  maxConnections?: number;
}

export interface ConnectedClient {
  userId: UUID;
  sessionId: UUID;
  username: string;
  role: string;
  ws: unknown; // WebSocket server instance
}

// Room manager — tracks which users are in which sessions
export class SessionRoomManager {
  private rooms = new Map<UUID, Set<UUID>>();
  private clients = new Map<UUID, ConnectedClient>();

  join(sessionId: UUID, userId: UUID, client: ConnectedClient): void {
    if (!this.rooms.has(sessionId)) {
      this.rooms.set(sessionId, new Set());
    }
    this.rooms.get(sessionId)!.add(userId);
    this.clients.set(userId, client);
  }

  leave(userId: UUID): void {
    this.clients.delete(userId);
    for (const [, members] of this.rooms) {
      members.delete(userId);
    }
  }

  getClients(sessionId: UUID): ConnectedClient[] {
    const userIds = this.rooms.get(sessionId) ?? new Set();
    return [...userIds].map(id => this.clients.get(id)).filter(Boolean) as ConnectedClient[];
  }

  broadcast<T>(sessionId: UUID, event: SocketEvent<T>, excludeUserId?: UUID): void {
    const clients = this.getClients(sessionId);
    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.userId === excludeUserId) continue;
      // In real implementation: client.ws.send(message)
      void message; // suppress unused warning
    }
  }

  getUserCount(sessionId: UUID): number {
    return this.rooms.get(sessionId)?.size ?? 0;
  }
}

// ─── Exports ──────────────────────────────────────────────────
export { MythicForgeNetwork as NetworkClient };
