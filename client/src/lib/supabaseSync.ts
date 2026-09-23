import type { LocalAccount, LocalPayment } from "./localStore";
import { supabase } from "./supabase";

export class SyncConflictError extends Error {
  constructor(message = "تعارض بالتعديل: في جهاز تاني سبقك") {
    super(message);
    this.name = "SyncConflictError";
  }
}

type CloudAccount = {
  id: string;
  workspace_id: string;
  name: string;
  owner_name: string;
  accent: string;
  version: number;
};

type CloudPayment = {
  id: string;
  account_id: string;
  name: string;
  amount_minor: number;
  currency: "SYP" | "USD";
  payment_type: "credit" | "debit";
  occurred_on: string;
  version: number;
};

function localIdFromUuid(value: string) {
  const parsed = Number.parseInt(value.replaceAll("-", "").slice(0, 12), 16);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Date.now();
}

function makeRemoteId() {
  return crypto.randomUUID();
}

export async function pullCloudAccounts(workspaceId: string): Promise<LocalAccount[]> {
  if (!supabase) return [];
  const [accountsResult, paymentsResult] = await Promise.all([
    supabase.from("accounts").select("id, workspace_id, name, owner_name, accent, version").eq("workspace_id", workspaceId).eq("is_archived", false).order("updated_at", { ascending: false }),
    supabase.from("payments").select("id, account_id, name, amount_minor, currency, payment_type, occurred_on, version").eq("workspace_id", workspaceId).order("occurred_on", { ascending: false }),
  ]);
  if (accountsResult.error) throw accountsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  const payments = (paymentsResult.data ?? []) as CloudPayment[];
  return ((accountsResult.data ?? []) as CloudAccount[]).map((account) => ({
    id: localIdFromUuid(account.id),
    remoteId: account.id,
    version: account.version,
    name: account.name,
    owner: account.owner_name,
    accent: account.accent,
    payments: payments.filter((payment) => payment.account_id === account.id).map((payment) => ({
      id: localIdFromUuid(payment.id),
      remoteId: payment.id,
      version: payment.version,
      name: payment.name,
      amount: payment.amount_minor,
      currency: payment.currency,
      type: payment.payment_type,
      date: payment.occurred_on,
    })),
  }));
}

async function pushAccount(workspaceId: string, userId: string, account: LocalAccount) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  const remoteId = account.remoteId ?? makeRemoteId();
  const payload = { workspace_id: workspaceId, name: account.name.trim(), owner_name: account.owner.trim(), accent: account.accent, created_by: userId };
  if (!account.remoteId) {
    const { data, error } = await supabase.from("accounts").insert({ id: remoteId, ...payload }).select("id, version").single();
    if (error) throw error;
    return { remoteId: data.id as string, version: data.version as number };
  }
  const expectedVersion = account.version ?? 1;
  const { data, error } = await supabase.from("accounts").update(payload).eq("id", remoteId).eq("version", expectedVersion).select("id, version").maybeSingle();
  if (error) throw error;
  if (!data) throw new SyncConflictError();
  return { remoteId: data.id as string, version: data.version as number };
}

async function pushPayment(workspaceId: string, userId: string, accountRemoteId: string, payment: LocalPayment) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  const remoteId = payment.remoteId ?? makeRemoteId();
  const payload = {
    workspace_id: workspaceId,
    account_id: accountRemoteId,
    name: payment.name.trim(),
    amount_minor: Math.round(payment.amount),
    currency: payment.currency,
    payment_type: payment.type,
    occurred_on: payment.date,
    created_by: userId,
  };
  if (!payment.remoteId) {
    const { data, error } = await supabase.from("payments").insert({ id: remoteId, ...payload }).select("id, version").single();
    if (error) throw error;
    return { remoteId: data.id as string, version: data.version as number };
  }
  const expectedVersion = payment.version ?? 1;
  const { data, error } = await supabase.from("payments").update(payload).eq("id", remoteId).eq("version", expectedVersion).select("id, version").maybeSingle();
  if (error) throw error;
  if (!data) throw new SyncConflictError();
  return { remoteId: data.id as string, version: data.version as number };
}

export async function pushLocalAccounts(workspaceId: string, userId: string, accounts: LocalAccount[]) {
  const client = supabase;
  if (!client) throw new Error("Supabase غير مهيأ بعد");
  const nextAccounts: LocalAccount[] = [];
  for (const account of accounts) {
    const savedAccount = await pushAccount(workspaceId, userId, account);
    const nextPayments: LocalPayment[] = [];
    for (const payment of account.payments) {
      const savedPayment = await pushPayment(workspaceId, userId, savedAccount.remoteId, payment);
      nextPayments.push({ ...payment, remoteId: savedPayment.remoteId, version: savedPayment.version });
    }
    nextAccounts.push({ ...account, remoteId: savedAccount.remoteId, version: savedAccount.version, payments: nextPayments });
  }

  const localAccountIds = new Set(nextAccounts.flatMap((account) => account.remoteId ? [account.remoteId] : []));
  const localPaymentIds = new Set(nextAccounts.flatMap((account) => account.payments.flatMap((payment) => payment.remoteId ? [payment.remoteId] : [])));
  const { data: remoteAccounts, error: remoteAccountsError } = await client.from("accounts").select("id").eq("workspace_id", workspaceId);
  if (remoteAccountsError) throw remoteAccountsError;
  const orphanAccountIds = (remoteAccounts ?? []).map((row) => row.id as string).filter((id) => !localAccountIds.has(id));
  if (orphanAccountIds.length) {
    const { error } = await client.from("accounts").delete().in("id", orphanAccountIds).eq("workspace_id", workspaceId);
    if (error) throw error;
  }
  const { data: remotePayments, error: remotePaymentsError } = await client.from("payments").select("id").eq("workspace_id", workspaceId);
  if (remotePaymentsError) throw remotePaymentsError;
  const orphanPaymentIds = (remotePayments ?? []).map((row) => row.id as string).filter((id) => !localPaymentIds.has(id));
  if (orphanPaymentIds.length) {
    const { error } = await client.from("payments").delete().in("id", orphanPaymentIds).eq("workspace_id", workspaceId);
    if (error) throw error;
  }
  return nextAccounts;
}

export function subscribeToWorkspace(workspaceId: string, onChange: () => void) {
  if (!supabase) return () => undefined;
  const channel = supabase
    .channel(`workspace-sync-${workspaceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "accounts", filter: `workspace_id=eq.${workspaceId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `workspace_id=eq.${workspaceId}` }, onChange)
    .subscribe();
  return () => { void supabase?.removeChannel(channel); };
}
