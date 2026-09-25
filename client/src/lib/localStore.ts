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
  deletedAccountIds?: { id: string; version?: number }[];
  deletedPaymentIds?: { id: string; version?: number }[];
  createdAt: string;
};

const DB_NAME = "aleppo-center-cash";

export async function readAccounts(): Promise<LocalAccount[] | null> {
  return null;
}

export async function writeAccounts(_accounts: LocalAccount[]) {
  return;
}

export async function readSetting(_key: string): Promise<string | null> {
  return null;
}

export async function writeSetting(_key: string, _value: string): Promise<void> {
  return;
}

export async function snapshotAccounts(_accounts: LocalAccount[]) {
  return;
}

export async function restoreSnapshot(): Promise<LocalAccount[] | null> {
  return null;
}

export async function readSyncQueue(): Promise<SyncQueueItem[]> {
  return [];
}

export async function enqueueSyncSnapshot(_item: Omit<SyncQueueItem, "id" | "createdAt">) {
  return;
}

export async function removeSyncQueueItem(_id: string) {
  return;
}

export async function addAuditEntry(_entry: Omit<AuditEntry, "id" | "createdAt">) {
  return;
}

export async function readAuditEntries(): Promise<AuditEntry[]> {
  return [];
}

export async function clearAllLocalData() {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
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
