// The one live connection to the server. Reconnects on its own after a server or
// network restart, so the wall never needs a click.
import { useEffect, useRef, useState } from 'react';
import type { LiveSnapshot, Screen, ServerMessage } from '@lan-os/shared';

const RETRY_DELAYS_MS = [1000, 2000, 4000, 5000];
/** The server sends something at least every 20 s; silence for longer means the link is dead. */
const SILENCE_LIMIT_MS = 45_000;
const PING_EVERY_MS = 25_000;

export interface Live {
  snapshot: LiveSnapshot | null;
  connected: boolean;
  /** Server clock minus browser clock, so every screen counts the same time. */
  offsetMs: number;
}

export function useLive(screen: Screen): Live {
  const [live, setLive] = useState<Live>({ snapshot: null, connected: false, offsetMs: 0 });
  const themeVersion = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let attempt = 0;
    let retryTimer: number | undefined;
    let silenceTimer: number | undefined;
    let pingTimer: number | undefined;
    let stopped = false;

    const watchSilence = () => {
      window.clearTimeout(silenceTimer);
      silenceTimer = window.setTimeout(() => socket?.close(), SILENCE_LIMIT_MS);
    };

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws?screen=${screen}`);
      socket.onopen = () => {
        attempt = 0;
        watchSilence();
        pingTimer = window.setInterval(() => socket?.send(JSON.stringify({ type: 'ping' })), PING_EVERY_MS);
      };
      socket.onmessage = event => {
        watchSilence();
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type !== 'snapshot') return;
        const snapshot = message.snapshot;
        if (snapshot.themeVersion !== themeVersion.current) {
          themeVersion.current = snapshot.themeVersion;
          const link = document.getElementById('theme-css') as HTMLLinkElement | null;
          if (link) link.href = `/theme.css?v=${snapshot.themeVersion}-${Date.now()}`;
        }
        setLive({ snapshot, connected: true, offsetMs: Date.parse(snapshot.serverNow) - Date.now() });
      };
      socket.onclose = () => {
        window.clearInterval(pingTimer);
        window.clearTimeout(silenceTimer);
        setLive(current => ({ ...current, connected: false }));
        if (stopped) return;
        retryTimer = window.setTimeout(connect, RETRY_DELAYS_MS[Math.min(attempt++, RETRY_DELAYS_MS.length - 1)]);
      };
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(silenceTimer);
      window.clearInterval(pingTimer);
      socket?.close();
    };
  }, [screen]);

  return live;
}

/** The current time on the server's clock, refreshed every `everyMs`. */
export function useNow(offsetMs: number, everyMs = 1000): Date {
  const [now, setNow] = useState(() => new Date(Date.now() + offsetMs));
  useEffect(() => {
    setNow(new Date(Date.now() + offsetMs));
    const timer = window.setInterval(() => setNow(new Date(Date.now() + offsetMs)), everyMs);
    return () => window.clearInterval(timer);
  }, [offsetMs, everyMs]);
  return now;
}

/** Calls the LAN OS API. Throws an Error with the server's plain-English reason. */
export async function api<T = { ok: true }>(path: string, method = 'POST', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Something went wrong (${response.status}).`);
  return data as T;
}
