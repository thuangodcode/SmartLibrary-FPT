import { HubConnectionState, LogLevel, type HubConnection, type ILogger } from '@microsoft/signalr';
import { ApiError, apiRequest, getSessionAccessToken } from './api';

// Recoverable transport/auth errors belong in connection state, not Expo's
// uncaught-error overlay. Keep diagnostics visible without using console.error.
export const realtimeLogger: ILogger = {
  log(level, message) { if (level >= LogLevel.Warning) console.warn(`[Realtime] ${message}`); },
};

export function startRealtime(hub: HubConnection, connected: () => void | Promise<void>, unavailable: () => void = () => {}) {
  let disposed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = async () => {
    if (disposed || hub.state !== HubConnectionState.Disconnected) return;
    try {
      await hub.start();
      if (disposed) { await hub.stop(); return; }
      attempt = 0;
      await connected();
    } catch (error) {
      if (disposed) return;
      unavailable();
      if (error instanceof ApiError && error.status === 401) return;
      if (/\b401\b|unauthorized/i.test(error instanceof Error ? error.message : String(error))) {
        // An unexpected 401 (e.g. revoked session) also goes through the same
        // refresh/ownership validation used by ordinary HTTP requests.
        try { await apiRequest('/api/v1/auth/me', {}, await getSessionAccessToken()); }
        catch (authError) { if (authError instanceof ApiError && authError.status === 401) return; }
      }
      if (!disposed && hub.state === HubConnectionState.Disconnected)
        timer = setTimeout(() => { void start(); }, Math.min(30_000, 3_000 * ++attempt));
    }
  };
  // withAutomaticReconnect covers interruptions after a successful start only.
  hub.onclose(() => { if (!disposed) { unavailable(); void start(); } });
  void start();
  return () => { disposed = true; clearTimeout(timer); void hub.stop(); };
}
