export type LocalPayment = {
  id: number;
  remoteId?: string;
  version?: number;
  name: string;
  amount: number;
  currency: "SYP" | "USD";
  type: "credit" | "debit";
  date: string;
};

export type LocalAccount = {
  id: number;
  remoteId?: string;
  version?: number;
  name: string;
  owner: string;
  accent: string;
  payments: LocalPayment[];
};

export type AuditEntry = {
  id: number;
  action: "create" | "update" | "delete" | "import" | "export";
  entity: "account" | "payment" | "backup";
  label: string;
  createdAt: string;
};

export type SyncQueueItem = {
  id: string;
  workspaceId: string;
  userId: string;
  accounts: LocalAccount[];
  createdAt: string;
};

const DB_NAME = "aleppo-center-cash";
const DB_VERSION = 1;
const DATA_STORE = "app-data";
const AUDIT_STORE = "audit-log";
const ACCOUNTS_KEY = "accounts";
const SNAPSHOT_KEY = "accounts-before-import";
const SYNC_QUEUE_KEY = "sync-queue";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DATA_STORE)) database.createObjectStore(DATA_STORE);
      if (!database.objectStoreNames.contains(AUDIT_STORE)) database.createObjectStore(AUDIT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح التخزين المحلي"));
  });
}

export async function readAccounts(): Promise<LocalAccount[] | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(DATA_STORE, "readonly").objectStore(DATA_STORE).get(ACCOUNTS_KEY);
    request.onsuccess = () => resolve((request.result as LocalAccount[] | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function writeAccounts(accounts: LocalAccount[]) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DATA_STORE, "readwrite");
    transaction.objectStore(DATA_STORE).put(accounts, ACCOUNTS_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function readSetting(key: string): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(DATA_STORE, "readonly").objectStore(DATA_STORE).get(`setting:${key}`);
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function writeSetting(key: string, value: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DATA_STORE, "readwrite");
    transaction.objectStore(DATA_STORE).put(value, `setting:${key}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function snapshotAccounts(accounts: LocalAccount[]) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DATA_STORE, "readwrite");
    transaction.objectStore(DATA_STORE).put(structuredClone(accounts), SNAPSHOT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function restoreSnapshot(): Promise<LocalAccount[] | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(DATA_STORE, "readonly").objectStore(DATA_STORE).get(SNAPSHOT_KEY);
    request.onsuccess = () => resolve((request.result as LocalAccount[] | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function readSyncQueue(): Promise<SyncQueueItem[]> {
  if (typeof indexedDB === "undefined") return [];
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(DATA_STORE, "readonly").objectStore(DATA_STORE).get(SYNC_QUEUE_KEY);
    request.onsuccess = () => resolve((request.result as SyncQueueItem[] | undefined) ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueSyncSnapshot(item: Omit<SyncQueueItem, "id" | "createdAt">) {
  if (typeof indexedDB === "undefined") return;
  const queue = await readSyncQueue();
  queue.push({ ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DATA_STORE, "readwrite");
    transaction.objectStore(DATA_STORE).put(queue.slice(-10), SYNC_QUEUE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function removeSyncQueueItem(id: string) {
  if (typeof indexedDB === "undefined") return;
  const queue = (await readSyncQueue()).filter((item) => item.id !== id);
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DATA_STORE, "readwrite");
    transaction.objectStore(DATA_STORE).put(queue, SYNC_QUEUE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function addAuditEntry(entry: Omit<AuditEntry, "id" | "createdAt">) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  const auditEntry: AuditEntry = { ...entry, id: Date.now() + Math.floor(Math.random() * 1000), createdAt: new Date().toISOString() };
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(AUDIT_STORE, "readwrite");
    transaction.objectStore(AUDIT_STORE).put(auditEntry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function readAuditEntries(): Promise<AuditEntry[]> {
  if (typeof indexedDB === "undefined") return [];
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(AUDIT_STORE, "readonly").objectStore(AUDIT_STORE).getAll();
    request.onsuccess = () => resolve((request.result as AuditEntry[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error);
  });
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPng(filename: string, title: string, lines: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = Math.max(780, 220 + lines.length * 48);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#f5f6f3";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#173f47";
  context.fillRect(60, 60, canvas.width - 120, 120);
  context.fillStyle = "#f4fbf8";
  context.font = "700 38px Arial";
  context.fillText(title, 100, 132);
  context.fillStyle = "#274b50";
  context.font = "24px Arial";
  lines.forEach((line, index) => context.fillText(line, 100, 255 + index * 48));
  const anchor = document.createElement("a");
  anchor.href = canvas.toDataURL("image/png");
  anchor.download = filename;
  anchor.click();
}
