import { supabase } from "@/lib/supabase";

type RestorationSnapshot = {
  format: "aleppo-center-cash-restoration";
  version: 1;
  saved_at: string;
  workspace: { id: string; name?: string };
  members: unknown[];
  profiles: unknown[];
  accounts: unknown[];
  payments: unknown[];
  audit_log: unknown[];
};

type EncryptedRestorationFile = {
  format: "aleppo-center-cash-restoration-file";
  version: 1;
  encrypted: true;
  algorithm: "AES-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const MAX_RESTORATION_FILE_BYTES = 25 * 1024 * 1024;
const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 500_000;

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createCloudBackup(workspaceId: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  const { data, error } = await supabase.functions.invoke("workspace-backup", {
    body: { action: "backup", workspaceId },
  });
  if (error) throw error;
  return data as { path: string; savedAt: string; accounts: number; payments: number };
}

export async function exportRestorationSnapshot(workspaceId: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  const { data, error } = await supabase.functions.invoke("workspace-backup", {
    body: { action: "export", workspaceId },
  });
  if (error) throw error;
  return data as RestorationSnapshot;
}

export async function createEncryptedRestorationFile(
  workspaceId: string,
  workspaceName: string,
  password: string,
) {
  if (password.length < 8) throw new Error("restore_password_too_short");
  const snapshot = await exportRestorationSnapshot(workspaceId);
  const iterations = 250000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const plaintext = textEncoder.encode(JSON.stringify(snapshot));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));

  const file: EncryptedRestorationFile = {
    format: "aleppo-center-cash-restoration-file",
    version: 1,
    encrypted: true,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    workspaceId,
    workspaceName,
    createdAt: new Date().toISOString(),
  };

  return file;
}

export async function restoreEncryptedRestorationFile(
  workspaceId: string,
  password: string,
  file: File,
) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  if (password.length < 8) throw new Error("restore_password_too_short");
  if (file.size > MAX_RESTORATION_FILE_BYTES) throw new Error("restoration_file_too_large");

  let envelope: Partial<EncryptedRestorationFile>;
  try {
    envelope = JSON.parse(await file.text()) as Partial<EncryptedRestorationFile>;
  } catch {
    throw new Error("invalid_restoration_file");
  }
  if (
    envelope.format !== "aleppo-center-cash-restoration-file" ||
    envelope.version !== 1 ||
    envelope.encrypted !== true ||
    envelope.algorithm !== "AES-GCM" ||
    envelope.kdf !== "PBKDF2-SHA-256" ||
    typeof envelope.iterations !== "number" ||
    !Number.isInteger(envelope.iterations) ||
    envelope.iterations < MIN_PBKDF2_ITERATIONS ||
    envelope.iterations > MAX_PBKDF2_ITERATIONS ||
    typeof envelope.salt !== "string" ||
    fromBase64(envelope.salt).length !== 16 ||
    typeof envelope.iv !== "string" ||
    fromBase64(envelope.iv).length !== 12 ||
    typeof envelope.ciphertext !== "string" ||
    envelope.ciphertext.length < 1 ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("invalid_restoration_file");
  }

  try {
    const key = await deriveKey(password, fromBase64(envelope.salt), envelope.iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      key,
      fromBase64(envelope.ciphertext),
    );
    const snapshot = JSON.parse(textDecoder.decode(plaintext)) as RestorationSnapshot;

    if (
      snapshot?.format !== "aleppo-center-cash-restoration" ||
      snapshot?.version !== 1 ||
      snapshot?.workspace?.id !== workspaceId
    ) {
      throw new Error("invalid_backup");
    }

    const { data, error } = await supabase.functions.invoke("workspace-backup", {
      body: { action: "restore_file", workspaceId, password, snapshot },
    });
    if (error) throw error;
    return data as { ok: true; savedAt: string; accounts: number; payments: number };
  } catch (error) {
    if (error instanceof Error && ["invalid_backup", "invalid_restore_password"].includes(error.message)) throw error;
    throw new Error("invalid_restoration_password_or_file");
  }
}

export async function setCloudRestorePassword(workspaceId: string, password: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  const { data, error } = await supabase.functions.invoke("workspace-backup", {
    body: { action: "set_password", workspaceId, password },
  });
  if (error) throw error;
  return data as { ok: true };
}

export async function restoreCloudBackup(workspaceId: string, password: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  const { data, error } = await supabase.functions.invoke("workspace-backup", {
    body: { action: "restore", workspaceId, password },
  });
  if (error) throw error;
  return data as { ok: true; savedAt: string; accounts: number; payments: number };
}
