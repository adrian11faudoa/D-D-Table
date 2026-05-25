// ============================================================
// MythicForge VTT — Root App Component
// ============================================================

import React, { useEffect, useCallback, useRef } from 'react';
import { useStore } from './stores/useStore';
import { NetworkClient } from '@mythicforge/network';
import type { SocketEvent, UUID } from '@mythicforge/shared';

// Layout Components
import { Topbar } from './components/ui/Topbar';
import { Sidebar } from './components/ui/Sidebar';
import { RightPanel } from './components/ui/RightPanel';
import { StatusBar } from './components/ui/StatusBar';
import { MapCanvas } from './components/map/MapCanvas';
import { NotificationStack } from './components/ui/NotificationStack';
import { FloatingSheets } from './components/ui/FloatingSheets';
import { DiceRoller } from './components/ui/DiceRoller';
import { ContextMenu } from './components/ui/ContextMenu';
import { LoginScreen } from './components/ui/LoginScreen';

// Hooks
import { useKeybindings } from './hooks/useKeybindings';
import { useNetworkEvents } from './hooks/useNetworkEvents';
import { useSessionTimer } from './hooks/useSessionTimer';

import './styles/global.css';

// ─── App Shell ────────────────────────────────────────────────
const App: React.FC = () => {
  const {
    user,
    session,
    isConnected,
    connectionState,
    activeScene,
    activeTool,
    activePanel,
    isGM,
    network,
    setTool,
    setPanel,
    addNotification,
    addMessage,
    setCombat,
    updateToken,
    addToken,
    removeToken,
    nextTurn,
    prevTurn,
    updateCombatant,
    selectToken,
    deselectAllTokens,
    moveToken,
  } = useStore();

  const networkRef = useRef<NetworkClient | null>(null);

  // ── Network Setup ──────────────────────────────────────────
  useEffect(() => {
    if (!user || !session) return;

    const token = localStorage.getItem('mf-token') ?? '';
    const client = new NetworkClient({
      url: `ws://${window.location.hostname}:3000/ws`,
      sessionId: session.id,
      userId: user.id,
      token,
      onConnect: () => {
        useStore.getState().setConnectionState('connected');
        addNotification('Connected to session', 'success');
      },
      onDisconnect: (reason) => {
        useStore.getState().setConnectionState('disconnected');
        addNotification(`Disconnected: ${reason}`, 'warning');
      },
      onReconnecting: (attempt) => {
        useStore.getState().setConnectionState('reconnecting');
        addNotification(`Reconnecting... (attempt ${attempt})`, 'info');
      },
      onError: (err) => {
        addNotification(`Connection error: ${err.message}`, 'error');
      },
    });

    networkRef.current = client;

    // Register event handlers
    registerNetworkHandlers(client);

    client.connect().catch(err => {
      console.error('Failed to connect:', err);
      addNotification('Failed to connect to server', 'error');
    });

    return () => {
      client.disconnect();
      networkRef.current = null;
    };
  }, [user?.id, session?.id]);

  const registerNetworkHandlers = useCallback((client: NetworkClient) => {
    // Token events
    client.on('token:create', (event: SocketEvent<{ sceneId: UUID; token: unknown }>) => {
      addToken(event.payload.sceneId, event.payload.token as Parameters<typeof addToken>[1]);
    });

    client.on('token:move', (event: SocketEvent<{ sceneId: UUID; tokenId: UUID; x: number; y: number }>) => {
      const { sceneId, tokenId, x, y } = event.payload;
      moveToken(sceneId, tokenId, x, y);
    });

    client.on('token:update', (event: SocketEvent<{ sceneId: UUID; tokenId: UUID; data: unknown }>) => {
      const { sceneId, tokenId, data } = event.payload;
      updateToken(sceneId, tokenId, data as Parameters<typeof updateToken>[2]);
    });

    client.on('token:delete', (event: SocketEvent<{ sceneId: UUID; tokenId: UUID }>) => {
      removeToken(event.payload.sceneId, event.payload.tokenId);
    });

    // Chat events
    client.on('chat:message', (event: SocketEvent<Parameters<typeof addMessage>[0]>) => {
      addMessage(event.payload);
    });

    // Combat events
    client.on('combat:update', (event: SocketEvent<Parameters<typeof setCombat>[0]>) => {
      setCombat(event.payload);
    });

    client.on('combat:next-turn', () => nextTurn());
    client.on('combat:prev-turn', () => prevTurn());

    client.on('combat:initiative', (event: SocketEvent<{ combatantId: UUID; initiative: number }>) => {
      updateCombatant(event.payload.combatantId, { initiative: event.payload.initiative });
    });

    // User events
    client.on('user-join', (event: SocketEvent<{ userId: UUID; username: string }>) => {
      addNotification(`${event.payload.username} joined the session`, 'info');
    });

    client.on('user-leave', (event: SocketEvent<{ userId: UUID; username: string }>) => {
      addNotification(`${event.payload.username} left the session`, 'info');
    });

    // Ping events (map markers)
    client.on('canvas:ping', (event: SocketEvent<{ x: number; y: number; userId: UUID }>) => {
      // The canvas will render pings via its internal ping system
      document.dispatchEvent(new CustomEvent('mf:canvas-ping', { detail: event.payload }));
    });

    // Scene change
    client.on('scene:activate', (event: SocketEvent<{ sceneId: UUID }>) => {
      useStore.getState().setActiveScene(event.payload.sceneId);
      addNotification('Scene changed by GM', 'info');
    });
  }, [addToken, moveToken, updateToken, removeToken, addMessage, setCombat, nextTurn, prevTurn, updateCombatant, addNotification]);

  // ── Network emit helpers ──────────────────────────────────
  const emitTokenMove = useCallback((tokenId: UUID, x: number, y: number) => {
    if (!activeScene) return;
    networkRef.current?.emit('token:move', { sceneId: activeScene.id, tokenId, x, y });
    moveToken(activeScene.id, tokenId, x, y);
  }, [activeScene, moveToken]);

  const emitPing = useCallback((x: number, y: number) => {
    if (!activeScene) return;
    networkRef.current?.emit('canvas:ping', { x, y, userId: user?.id });
  }, [activeScene, user?.id]);

  // ── Keybindings ───────────────────────────────────────────
  useKeybindings({
    'escape': () => deselectAllTokens(),
    'ctrl+n': () => {
      if (isGM) {
        networkRef.current?.emit('combat:next-turn', {});
        nextTurn();
      }
    },
    'c': () => setPanel('chat'),
    'i': () => setPanel('combat'),
    'j': () => setPanel('journal'),
    's': () => setTool('select'),
    't': () => setTool('token'),
    'm': () => setTool('measure'),
    'd': () => setTool('draw'),
    'f': () => setTool('fog'),
    'l': () => setTool('light'),
    'w': () => setTool('wall'),
  });

  // ── Session Timer ─────────────────────────────────────────
  useSessionTimer();

  // ── Not logged in ─────────────────────────────────────────
  if (!user || !session) {
    return <LoginScreen />;
  }

  return (
    <div id="mythicforge-app" className="mf-app">
      {/* Top toolbar */}
      <Topbar
        activeTool={activeTool}
        onToolChange={setTool}
        isGM={isGM}
        session={session}
        connectionState={connectionState}
        onNextTurn={() => {
          networkRef.current?.emit('combat:next-turn', {});
          nextTurn();
        }}
        onRollInitiative={() => {
          networkRef.current?.emit('combat:initiative', { rollAll: true });
        }}
      />

      <div className="mf-main">
        {/* Left icon sidebar */}
        <Sidebar
          activePanel={activePanel}
          onPanelChange={setPanel}
          activeTool={activeTool}
          onToolChange={setTool}
          isGM={isGM}
        />

        {/* Map Canvas */}
        <div id="mythicforge-canvas" className="mf-canvas-wrap">
          <MapCanvas
            scene={activeScene}
            userId={user.id}
            isGM={isGM}
            tool={activeTool}
            onTokenSelect={(id) => id ? selectToken(id as UUID) : deselectAllTokens()}
            onTokenMove={emitTokenMove}
            onPing={emitPing}
            onFogUpdate={(data) => {
              if (!activeScene) return;
              networkRef.current?.emit('fog:update', { sceneId: activeScene.id, data });
            }}
          />
        </div>

        {/* Right panel */}
        <RightPanel
          activePanel={activePanel}
          onPanelChange={setPanel}
          network={networkRef.current}
          isGM={isGM}
          userId={user.id}
        />
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Floating elements */}
      <NotificationStack />
      <FloatingSheets isGM={isGM} userId={user.id} />
      <DiceRoller network={networkRef.current} userId={user.id} />
      <ContextMenu />

      <style>{`
        .mf-app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: var(--font-body);
        }

        .mf-main {
          display: flex;
          flex: 1;
          overflow: hidden;
          position: relative;
        }

        .mf-canvas-wrap {
          flex: 1;
          position: relative;
          overflow: hidden;
          background: #06070a;
        }
      `}</style>
    </div>
  );
};

export default App;
