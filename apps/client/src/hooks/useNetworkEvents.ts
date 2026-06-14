// ============================================================
// useNetworkEvents — Hook for subscribing to network events
// Used in App.tsx to register all socket event handlers
// ============================================================

import { useEffect, useRef } from 'react';
import type { NetworkClient } from '@mythicforge/network';
import { useStore } from '../stores/useStore';

export function useNetworkEvents(network: NetworkClient | null): void {
  const networkRef = useRef(network);
  networkRef.current = network;

  const {
    addMessage, setCombat, updateToken, addToken, removeToken,
    nextTurn, prevTurn, updateCombatant, setActiveScene, addNotification,
    setConnectedUsers, setConnectionState, setPing,
  } = useStore();

  useEffect(() => {
    const client = networkRef.current;
    if (!client) return;

    const unsubs: Array<() => void> = [];

    // Token events
    unsubs.push(client.on('token:create', (event) => {
      const { sceneId, token } = (event as { payload: { sceneId: string; token: Parameters<typeof addToken>[1] } }).payload;
      addToken(sceneId as Parameters<typeof addToken>[0], token);
    }));

    unsubs.push(client.on('token:move', (event) => {
      const { sceneId, tokenId, x, y } = (event as { payload: { sceneId: string; tokenId: string; x: number; y: number } }).payload;
      updateToken(sceneId as Parameters<typeof updateToken>[0], tokenId as Parameters<typeof updateToken>[1], { x, y });
    }));

    unsubs.push(client.on('token:update', (event) => {
      const { sceneId, tokenId, data } = (event as { payload: { sceneId: string; tokenId: string; data: Parameters<typeof updateToken>[2] } }).payload;
      updateToken(sceneId as Parameters<typeof updateToken>[0], tokenId as Parameters<typeof updateToken>[1], data);
    }));

    unsubs.push(client.on('token:delete', (event) => {
      const { sceneId, tokenId } = (event as { payload: { sceneId: string; tokenId: string } }).payload;
      removeToken(sceneId as Parameters<typeof removeToken>[0], tokenId as Parameters<typeof removeToken>[1]);
    }));

    // Chat events
    unsubs.push(client.on('chat:message', (event) => {
      const msg = (event as { payload: Parameters<typeof addMessage>[0] }).payload;
      addMessage(msg);
    }));

    // Dice
    unsubs.push(client.on('dice:roll', (event) => {
      const payload = (event as { payload: { formula: string; result: unknown } }).payload;
      addMessage({
        id: crypto.randomUUID() as import('@mythicforge/shared').UUID,
        sessionId: '' as import('@mythicforge/shared').UUID,
        type: 'roll',
        content: '',
        speaker: { userId: (event as { userId: string }).userId as import('@mythicforge/shared').UUID, alias: 'Player' },
        roll: payload.result as import('@mythicforge/shared').DiceRoll,
        timestamp: Date.now() as import('@mythicforge/shared').Timestamp,
        flags: {},
      });
    }));

    // Combat
    unsubs.push(client.on('combat:update', (event) => {
      const combat = (event as { payload: Parameters<typeof setCombat>[0] }).payload;
      setCombat(combat);
    }));
    unsubs.push(client.on('combat:next-turn', () => nextTurn()));
    unsubs.push(client.on('combat:prev-turn', () => prevTurn()));
    unsubs.push(client.on('combat:initiative', (event) => {
      const { combatantId, initiative } = (event as { payload: { combatantId: string; initiative: number } }).payload;
      if (combatantId) {
        updateCombatant(combatantId as import('@mythicforge/shared').UUID, { initiative });
      }
    }));

    // Scene
    unsubs.push(client.on('scene:activate', (event) => {
      const { sceneId } = (event as { payload: { sceneId: string } }).payload;
      setActiveScene(sceneId as import('@mythicforge/shared').UUID);
      addNotification('Scene changed by GM', 'info');
    }));

    // Users
    unsubs.push(client.on('user-join', (event) => {
      const { username } = (event as { payload: { username: string } }).payload;
      addNotification(`${username} joined the session`, 'info');
    }));
    unsubs.push(client.on('user-leave', (event) => {
      const { username } = (event as { payload: { username: string } }).payload;
      addNotification(`${username} left the session`, 'info');
    }));

    // Connection state changes
    const pingInterval = setInterval(() => {
      setPing(client.ping);
    }, 5000);

    return () => {
      unsubs.forEach(u => u());
      clearInterval(pingInterval);
    };
  }, [
    addMessage, setCombat, updateToken, addToken, removeToken,
    nextTurn, prevTurn, updateCombatant, setActiveScene, addNotification,
    setConnectedUsers, setConnectionState, setPing,
  ]);
}
