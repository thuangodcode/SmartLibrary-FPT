// Inspect expiry only to schedule refresh. The API remains responsible for JWT validation.
export function isAccessTokenExpiring(token: string, now = Date.now()): boolean {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { exp?: number };
    return typeof exp !== 'number' || exp * 1000 <= now + 60_000;
  } catch { return true; }
}
