import { readSetting, writeSetting } from "./localStore";

const SALT = "aleppo-center-cash-v1";
const KEY_HASH_STORE_KEY = "app-key-hash";
const DEFAULT_KEY_HASH = "dc785422ca00feedf59507d3b7fa3d3ef1da858c37e98fc175c73f5db665b426";
const SESSION_KEY = "aleppo-center-auth";
const ATTEMPTS_KEY = "aleppo-center-auth-attempts";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 1000;

type AuthAttemptState = { count: number; windowStartedAt: number; lockedUntil?: number };

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashKey(rawKey: string) {
  return sha256Hex(`${SALT}:${rawKey}`);
}

export async function getStoredKeyHash() {
  return (await readSetting(KEY_HASH_STORE_KEY)) ?? DEFAULT_KEY_HASH;
}

export async function verifyKey(rawKey: string) {
  const [inputHash, storedHash] = await Promise.all([hashKey(rawKey), getStoredKeyHash()]);
  return inputHash === storedHash;
}

export async function setKey(newRawKey: string) {
  await writeSetting(KEY_HASH_STORE_KEY, await hashKey(newRawKey));
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

export function getLoginLockState() {
  const state = readAttempts();
  const remainingMs = Math.max(0, (state.lockedUntil ?? 0) - Date.now());
  return { locked: remainingMs > 0, remainingMs };
}

export async function authenticateKey(value: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const lockState = getLoginLockState();
  if (lockState.locked) return { ok: false, message: "المحاولات توقفت مؤقتاً. جرّب بعد شوي." };
  const ok = await verifyKey(value);
  if (!ok) {
    const state = readAttempts();
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
