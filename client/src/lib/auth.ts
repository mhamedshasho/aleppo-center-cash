import { readSetting, writeSetting } from "./localStore";

const SALT = "aleppo-center-cash-v1";
const KEY_HASH_STORE_KEY = "app-key-hash";
const DEFAULT_KEY_HASH = "dc785422ca00feedf59507d3b7fa3d3ef1da858c37e98fc175c73f5db665b426";
const SESSION_KEY = "aleppo-center-auth";
const APP_LOCK_KEY = "aleppo-center-app-lock-v1";
const ATTEMPTS_KEY = "aleppo-center-auth-attempts";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 1000;
const PBKDF2_ITERATIONS = 120_000;

export type AppLockType = "password" | "pin" | "pattern";
type AppLockRecord = {
  version: 1;
  type: AppLockType;
  salt: string;
  verifier: string;
  iterations: number;
  updatedAt: string;
};

type AuthAttemptState = { count: number; windowStartedAt: number; lockedUntil?: number };

function isAppLockType(value: unknown): value is AppLockType {
  return value === "password" || value === "pin" || value === "pattern";
}

function readAppLockRecord(): AppLockRecord | null {
  try {
    const raw = localStorage.getItem(APP_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppLockRecord>;
    if (
      parsed.version !== 1 ||
      !isAppLockType(parsed.type) ||
      typeof parsed.salt !== "string" ||
      typeof parsed.verifier !== "string" ||
      typeof parsed.iterations !== "number" ||
      parsed.iterations < 100_000
    ) return null;
    return parsed as AppLockRecord;
  } catch {
    return null;
  }
}

export function hasConfiguredAppLock() {
  return readAppLockRecord() !== null;
}

export function getConfiguredAppLockType(): AppLockType | null {
  return readAppLockRecord()?.type ?? null;
}

export function validateAppLockCredential(type: AppLockType, value: string): string | null {
  if (type === "pin") {
    return /^\\d{4}$/.test(value) ? null : "الرمز السري يجب أن يتكوّن من ٤ أرقام بالضبط.";
  }
  if (type === "pattern") {
    const nodes = value.split("-").filter(Boolean);
    if (nodes.length < 4) return "ارسم نمطاً باستخدام ٤ نقاط على الأقل.";
    if (nodes.some((node) => !/^[0-8]$/.test(node)) || new Set(nodes).size !== nodes.length) {
      return "النمط غير صالح. ارسمه من جديد.";
    }
    return null;
  }
  if (value.trim().length < 4) return "كلمة مرور القفل يجب أن تكون ٤ محارف على الأقل.";
  if (value.length > 128) return "كلمة المرور طويلة جداً.";
  return null;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function deriveLockVerifier(rawValue: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rawValue),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(derived));
}

export async function setAppLockCredential(type: AppLockType, value: string) {
  const validationMessage = validateAppLockCredential(type, value);
  if (validationMessage) throw new Error(validationMessage);
  if (!crypto?.subtle || typeof crypto.getRandomValues !== "function") {
    throw new Error("هذا المتصفح لا يدعم تخزين القفل الآمن. حدّث المتصفح ثم جرّب مرة أخرى.");
  }

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToHex(saltBytes);
  const verifier = await deriveLockVerifier(value, saltBytes, PBKDF2_ITERATIONS);
  const record: AppLockRecord = {
    version: 1,
    type,
    salt,
    verifier,
    iterations: PBKDF2_ITERATIONS,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(APP_LOCK_KEY, JSON.stringify(record));
    // Do not let an older legacy session silently bypass the new local lock.
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    throw new Error("تعذر حفظ إعداد القفل على هذا الجهاز.");
  }
}

export async function verifyAppLockCredential(value: string): Promise<boolean> {
  const record = readAppLockRecord();
  if (!record || !crypto?.subtle) return false;
  try {
    const candidate = await deriveLockVerifier(value, hexToBytes(record.salt), record.iterations);
    return candidate === record.verifier;
  } catch {
    return false;
  }
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

function registerFailedAttempt() {
  const state = readAttempts();
  const next = { ...state, count: state.count + 1 };
  if (next.count >= MAX_ATTEMPTS) next.lockedUntil = Date.now() + LOCKOUT_MS;
  writeAttempts(next);
  return next.lockedUntil
    ? "محاولات كتيرة. القفل توقف ٣٠ ثانية."
    : "رمز القفل مو صحيح.";
}

async function deriveLegacyKeyHash(rawKey: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${SALT}:${rawKey}`));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashKey(rawKey: string) {
  return deriveLegacyKeyHash(rawKey);
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

export async function authenticateKey(value: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const lockState = getLoginLockState();
  if (lockState.locked) return { ok: false, message: "المحاولات توقفت مؤقتاً. جرّب بعد شوي." };

  // If the user enabled a device lock, verify that credential instead of the
  // legacy shared app key. This preserves the existing unlock entry point.
  const ok = hasConfiguredAppLock()
    ? await verifyAppLockCredential(value)
    : await verifyKey(value);

  if (!ok) return { ok: false, message: registerFailedAttempt() };

  sessionStorage.removeItem(ATTEMPTS_KEY);
  if (!hasConfiguredAppLock()) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ authenticatedAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS }));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
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
