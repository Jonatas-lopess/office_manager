import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionStatus, MessageListener, Peer, SendFn } from "./types";
import { deserializeMsg, serializeMsg, SYNC_TOKEN } from "./wire-protocol";

const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const JITTER_AMOUNT = 500;

/**
 * Owns the WebSocket connection lifecycle: Hub election (Tauri), open/close,
 * reconnection with backoff, and identity/presence bookkeeping. Knows
 * nothing about epoch or anti-entropy — it only moves bytes and lets other
 * hooks subscribe to inbound messages via `onMessage`.
 */
export function useHubConnection(
  initialHubUrl: string,
  isTauri: boolean,
  isolatedMode: boolean,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isUnmountingRef = useRef(false);
  const isConnectingRef = useRef(false);
  const messageListenersRef = useRef<Set<MessageListener>>(new Set());

  const [myId, setMyId] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<Peer[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");

  const send = useCallback<SendFn>((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMsg(msg));
    }
  }, []);

  const onMessage = useCallback((listener: MessageListener) => {
    messageListenersRef.current.add(listener);
    return () => {
      messageListenersRef.current.delete(listener);
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback(async () => {
    if (isUnmountingRef.current) return;
    if (isConnectingRef.current) {
      console.log(
        "⏳ [Network] Connection attempt already in progress. Skipping.",
      );
      return;
    }

    isConnectingRef.current = true;

    if (isolatedMode) {
      setConnectionStatus("disconnected");
      isConnectingRef.current = false;
      return;
    }

    try {
      // Clean up any existing connections or timers
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      setConnectionStatus(
        reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting",
      );

      let targetUrl: string = initialHubUrl;

      // On failover or initial connection as Tauri, we scan for a hub.
      if (isTauri && !isolatedMode) {
        console.log(`🔍 [Election] Scanning for an existing Hub...`);
        let hubIp = await invoke<string | null>("find_hub_ip");

        // Option B: Master Election retries
        if (!hubIp) {
          console.log(`⚠️ [Election] Scan 1 failed. Retrying...`);
          await new Promise((r) => setTimeout(r, 1000));
          hubIp = await invoke<string | null>("find_hub_ip");
        }
        if (!hubIp) {
          console.log(`⚠️ [Election] Scan 2 failed. Retrying...`);
          await new Promise((r) => setTimeout(r, 1000));
          hubIp = await invoke<string | null>("find_hub_ip");
        }

        if (isUnmountingRef.current) {
          isConnectingRef.current = false;
          return;
        }

        if (hubIp) {
          console.log(`✅ [Election] Found existing Hub at ${hubIp}`);
          targetUrl = `ws://${hubIp}:1234/ws`;
        } else {
          console.log(`❌ [Election] No Hub found. Electing SELF as Hub.`);
          try {
            await invoke("start_hub", { token: SYNC_TOKEN });
            // Wait briefly for Rust to bind port
            await new Promise((r) => setTimeout(r, 1500));
          } catch (err) {
            console.error("Failed to start local rust hub:", err);
          }
          targetUrl = `ws://localhost:1234/ws`;
        }
      }

      if (isUnmountingRef.current) {
        isConnectingRef.current = false;
        return;
      }

      const authedUrl = `${targetUrl}?token=${encodeURIComponent(SYNC_TOKEN)}`;
      console.log(`[Network] Attempting to connect to ${targetUrl}...`);
      const ws = new WebSocket(authedUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        if (isUnmountingRef.current) return;
        console.log(`🟢 [Network] Connected to Hub at ${targetUrl}`);
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      };

      ws.onerror = (err) => {
        console.error(`❌ [Network] Socket Error:`, err);
        isConnectingRef.current = false;
        // ws.onclose will be called next, which handles reconnection.
      };

      ws.onclose = () => {
        isConnectingRef.current = false;
        console.log(`⚠️ [Network] Disconnected from Hub.`);
        wsRef.current = null;

        // Do not attempt to reconnect if the component is unmounting.
        if (isUnmountingRef.current) {
          setConnectionStatus("disconnected");
          return;
        }

        setConnectionStatus("reconnecting");

        const attempts = reconnectAttemptsRef.current;
        // Exponential backoff with jitter
        const delay =
          Math.min(
            MAX_RECONNECT_DELAY,
            BASE_RECONNECT_DELAY * Math.pow(2, attempts),
          ) +
          Math.random() * JITTER_AMOUNT;

        console.log(
          `[Failover] Will attempt to reconnect in ${Math.round(
            delay / 1000,
          )}s (attempt #${attempts + 1})`,
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          connect();
        }, delay);
      };

      ws.onmessage = (event) => {
        const message = deserializeMsg(event.data);

        if (message.type === "identity") {
          setMyId(message.payload);
          return;
        }

        if (message.type === "presence") {
          setConnectedPeers(message.payload);
          return;
        }

        messageListenersRef.current.forEach((listener) => {
          try {
            listener(message, send);
          } catch (err) {
            console.error("[useHubConnection] Error in message listener:", err);
          }
        });
      };
    } catch (e) {
      console.error("❌ [Network] Unexpected error in connect():", e);
      isConnectingRef.current = false;

      // Trigger a retry manually if we didn't even reach the WebSocket
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        connect();
      }, BASE_RECONNECT_DELAY);
    }
  }, [initialHubUrl, isTauri, isolatedMode, send]);

  useEffect(() => {
    isUnmountingRef.current = false;
    connect();

    return () => {
      isUnmountingRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
      setConnectionStatus("disconnected");
    };
  }, [connect]);

  return {
    myId,
    connectedPeers,
    connectionStatus,
    send,
    disconnect,
    reconnect: connect,
    onMessage,
  };
}
