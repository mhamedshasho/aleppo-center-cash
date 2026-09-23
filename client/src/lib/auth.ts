const AUTH_SALT = "aleppo-center-cash-v1";
const AUTH_HASH = "dc785422ca00feedf59507d3b7fa3d3ef1da858c37e98fc175c73f5db665b426";
const SESSION_KEY = "aleppo-center-auth";
const ATTEMPTS_KEY = "aleppo-center-auth-attempts";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 1000;

type AuthAttemptState = { count: number; windowStartedAt: number; lockedUntil?: number };

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readAttempts(): AuthAttemptState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) ?? "null") as AuthAttemptState | null;
    if (!parsed || Date.now() - parsed.windowStartedAt > WINDOW_MS) return { count: 0, windowStartedAt: Date.now() };
    return parsed;
  } catch {
    return { count: 0, windowStartedAt: Date.now() };
  }
}

function writeAttempts(state: AuthAttemptState) {
  sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state));
}

export async function authenticateKey(value: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const state = readAttempts();
  if (state.lockedUntil && state.lockedUntil > Date.now()) return { ok: false, message: "المحاولات توقفت مؤقتاً. جرّب بعد شوي." };
  const hash = await digest(`${AUTH_SALT}:${value}`);
  if (hash !== AUTH_HASH) {
    const next = { ...state, count: state.count + 1 };
    if (next.count >= MAX_ATTEMPTS) next.lockedUntil = Date.now() + LOCKOUT_MS;
    writeAttempts(next);
    return { ok: false, message: next.lockedUntil ? "محاولات كتيرة. الحساب توقف ٣٠ ثانية." : "المفتاح مو صحيح" };
  }
  sessionStorage.removeItem(ATTEMPTS_KEY);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ authenticatedAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS }));
  return { ok: true };
}

export function hasAuthSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as { expiresAt?: number } | null;
    if (!session?.expiresAt || session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return false;
  }
}

export function clearAuthSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
