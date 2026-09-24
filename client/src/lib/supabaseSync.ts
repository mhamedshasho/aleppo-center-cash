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
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  const [accountsResult, paymentsResult] = await Promise.all([
    supabase.from("accounts").select("id, workspace_id, name, owner_name, accent, version").eq("workspace_id", workspaceId).or("is_archived.eq.false,is_archived.is.null").order("updated_at", { ascending: false }),
    supabase.from("payments").select("id, account_id, name, amount_minor, currency, payment_type, occurred_on, version").eq("workspace_id", workspaceId).order("occurred_on", { ascending: false }),
  ]);
  if (accountsResult.error) {
    console.error("[AleppoCenterCash] pull accounts failed", accountsResult.error);
    throw accountsResult.error;
  }
  if (paymentsResult.error) {
    console.error("[AleppoCenterCash] pull payments failed", paymentsResult.error);
    throw paymentsResult.error;
  }
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
    if (error) {
      console.error("[AleppoCenterCash] account insert failed", error);
      throw error;
    }
    return { remoteId: data.id as string, version: data.version as number };
  }
  const expectedVersion = account.version ?? 1;
  const { data, error } = await supabase.from("accounts").update(payload).eq("id", remoteId).eq("version", expectedVersion).select("id, version").maybeSingle();
  if (error) {
    console.error("[AleppoCenterCash] account update failed", error);
    throw error;
  }
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
    if (error) {
      console.error("[AleppoCenterCash] payment insert failed", error);
      throw error;
    }
    return { remoteId: data.id as string, version: data.version as number };
  }
  const expectedVersion = payment.version ?? 1;
  const { data, error } = await supabase.from("payments").update(payload).eq("id", remoteId).eq("version", expectedVersion).select("id, version").maybeSingle();
  if (error) {
    console.error("[AleppoCenterCash] payment update failed", error);
    throw error;
  }
  if (!data) throw new SyncConflictError();
  return { remoteId: data.id as string, version: data.version as number };
}

export async function pushLocalAccounts(
  workspaceId: string,
  userId: string,
  accounts: LocalAccount[],
  deletedAccountIds: { id: string; version?: number }[] = [],
  deletedPaymentIds: { id: string; version?: number }[] = [],
) {
  const client = supabase;
  if (!client) throw new Error("Supabase غير مهيأ بعد");

  for (const deletion of deletedPaymentIds) {
    console.info("[AleppoCenterCash] deleting payment", deletion);
    let query = client.from("payments").delete().eq("id", deletion.id).eq("workspace_id", workspaceId);
    if (deletion.version !== undefined) query = query.eq("version", deletion.version);
    const { data, error } = await query.select("id");
    console.info("[AleppoCenterCash] payment delete result", { id: deletion.id, data, error });
    if (error) {
      console.error("[AleppoCenterCash] payment delete failed", error);
      throw error;
    }
    if (!data?.length) throw new SyncConflictError("تعذر حذف الدفعة من السحابة: لم يتم العثور عليها أو لا تملك صلاحية حذفها");
  }

  for (const deletion of deletedAccountIds) {
    console.info("[AleppoCenterCash] deleting account", deletion);
    let query = client.from("accounts").delete().eq("id", deletion.id).eq("workspace_id", workspaceId);
    if (deletion.version !== undefined) query = query.eq("version", deletion.version);
    const { data, error } = await query.select("id");
    console.info("[AleppoCenterCash] account delete result", { id: deletion.id, data, error });
    if (error) {
      console.error("[AleppoCenterCash] account delete failed", error);
      throw error;
    }
    if (!data?.length) throw new SyncConflictError("تعذر حذف الحساب من السحابة: لم يتم العثور عليه أو لا تملك صلاحية حذفه");
  }

  const nextAccounts: LocalAccount[] = [];

  for (const account of accounts) {
    const savedAccount = await pushAccount(workspaceId, userId, account);
    const nextPayments: LocalPayment[] = [];

    for (const payment of account.payments) {
      const savedPayment = await pushPayment(workspaceId, userId, savedAccount.remoteId, payment);
      nextPayments.push({ ...payment, remoteId: savedPayment.remoteId, version: savedPayment.version });
    }

    nextAccounts.push({
      ...account,
      remoteId: savedAccount.remoteId,
      version: savedAccount.version,
      payments: nextPayments,
    });
  }

  const { data, error } = await client
    .from("accounts")
    .select("id, workspace_id, name, owner_name, accent, version")
    .eq("workspace_id", workspaceId)
    .or("is_archived.eq.false,is_archived.is.null")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[AleppoCenterCash] fetch after push failed", error);
    throw error;
  }

  const cloudAccounts = (data ?? []) as CloudAccount[];
  console.info("[AleppoCenterCash] pushed result", {
    count: cloudAccounts.length,
    accounts: cloudAccounts,
  });

  const paymentRows = await client
    .from("payments")
    .select("id, account_id, name, amount_minor, currency, payment_type, occurred_on, version")
    .eq("workspace_id", workspaceId)
    .order("occurred_on", { ascending: false });

  if (paymentRows.error) {
    console.error("[AleppoCenterCash] fetch payments after push failed", paymentRows.error);
    throw paymentRows.error;
  }

  const payments = (paymentRows.data ?? []) as CloudPayment[];

  const cloudByRemoteId = new Map(cloudAccounts.map((account) => [account.id, account]));
  const paymentsByAccountId = new Map<string, CloudPayment[]>();
  for (const payment of payments) {
    const list = paymentsByAccountId.get(payment.account_id) ?? [];
    list.push(payment);
    paymentsByAccountId.set(payment.account_id, list);
  }

  // Preserve each candidate's local numeric ID. Newly-created local rows cannot
  // be matched by localIdFromUuid until the server ID exists, so matching by
  // remoteId here is what makes the next edit/delete target the same cloud row.
  return nextAccounts.flatMap((account) => {
    if (!account.remoteId) return [];
    const serverAccount = cloudByRemoteId.get(account.remoteId);
    if (!serverAccount) return [];

    const serverPayments = paymentsByAccountId.get(serverAccount.id) ?? [];
    const serverPaymentsByRemoteId = new Map(serverPayments.map((payment) => [payment.id, payment]));

    return [{
      ...account,
      remoteId: serverAccount.id,
      version: serverAccount.version,
      name: serverAccount.name,
      owner: serverAccount.owner_name,
      accent: serverAccount.accent,
      payments: account.payments.flatMap((payment) => {
        if (!payment.remoteId) {
          const saved = serverPayments.find((item) =>
            item.name === payment.name &&
            item.amount_minor === Math.round(payment.amount) &&
            item.currency === payment.currency &&
            item.payment_type === payment.type &&
            item.occurred_on === payment.date,
          );
          if (!saved) return [];
          return [{ ...payment, remoteId: saved.id, version: saved.version }];
        }
        const saved = serverPaymentsByRemoteId.get(payment.remoteId);
        return saved
          ? [{ ...payment, remoteId: saved.id, version: saved.version, name: saved.name, amount: saved.amount_minor, currency: saved.currency, type: saved.payment_type, date: saved.occurred_on }]
          : [];
      }),
    }];
  });
}

export async function resetWorkspaceData(workspaceId: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");

  const paymentsResult = await supabase.from("payments").delete().eq("workspace_id", workspaceId).select("id");
  if (paymentsResult.error) throw paymentsResult.error;

  const accountsResult = await supabase.from("accounts").delete().eq("workspace_id", workspaceId).select("id");
  if (accountsResult.error) throw accountsResult.error;

  const remaining = await supabase.from("accounts").select("id").eq("workspace_id", workspaceId);
  if (remaining.error) throw remaining.error;
  if ((remaining.data ?? []).length > 0) {
    throw new SyncConflictError("لم يتم حذف كل حسابات مساحة العمل. تأكد أنك المالك.");
  }

  return {
    deletedPayments: paymentsResult.data?.length ?? 0,
    deletedAccounts: accountsResult.data?.length ?? 0,
  };
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
