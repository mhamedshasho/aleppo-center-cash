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

function makeUniqueRemoteId(used: Set<string>) {
  let id = makeRemoteId();
  while (used.has(id)) id = makeRemoteId();
  used.add(id);
  return id;
}

function normalizeLocalRemoteIds(accounts: LocalAccount[]) {
  const usedAccountIds = new Set<string>();
  const usedPaymentIds = new Set<string>();

  return accounts.map((account) => {
    let nextAccount = account;
    if (!account.remoteId || usedAccountIds.has(account.remoteId)) {
      const remoteId = makeUniqueRemoteId(usedAccountIds);
      console.warn("[AleppoCenterCash] duplicate/missing local account remoteId repaired", {
        oldRemoteId: account.remoteId,
        newRemoteId: remoteId,
        accountName: account.name,
      });
      nextAccount = { ...account, remoteId, version: 0 };
    } else {
      usedAccountIds.add(account.remoteId);
    }

    const payments = nextAccount.payments.map((payment) => {
      if (!payment.remoteId || usedPaymentIds.has(payment.remoteId)) {
        const remoteId = makeUniqueRemoteId(usedPaymentIds);
        console.warn("[AleppoCenterCash] duplicate/missing local payment remoteId repaired", {
          oldRemoteId: payment.remoteId,
          newRemoteId: remoteId,
          paymentName: payment.name,
        });
        return { ...payment, remoteId, version: 0 };
      }
      usedPaymentIds.add(payment.remoteId);
      return payment;
    });

    return { ...nextAccount, payments };
  });
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

async function pushAccount(
  workspaceId: string,
  userId: string,
  account: LocalAccount,
  existing?: CloudAccount,
) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  let remoteId = account.remoteId ?? makeRemoteId();
  const payload = {
    workspace_id: workspaceId,
    name: account.name.trim(),
    owner_name: account.owner.trim(),
    accent: account.accent,
    created_by: userId,
  };
  const updatePayload = {
    workspace_id: workspaceId,
    name: account.name.trim(),
    owner_name: account.owner.trim(),
    accent: account.accent,
  };

  if (!account.remoteId) {
    const { data, error } = await supabase
      .from("accounts")
      .insert({ id: remoteId, ...payload })
      .select("id, version")
      .single();
    if (error) {
      console.error("[AleppoCenterCash] account insert failed", error);
      if (error.code === "23505") {
        const { data: raced, error: raceError } = await supabase
          .from("accounts")
          .select("id, workspace_id, version")
          .eq("id", remoteId)
          .maybeSingle();
        if (!raceError && raced?.workspace_id === workspaceId) {
          return { remoteId: raced.id as string, version: raced.version as number };
        }
      }
      throw error;
    }
    return { remoteId: data.id as string, version: data.version as number };
  }

  // A locally-created row has version 0 until the first successful sync.
  // If that first insert succeeded but a later part of the sync failed, a
  // queued retry can still carry version 0 and the same remoteId. Reusing the
  // existing server row avoids inserting the same primary key twice.
  if (account.version === 0) {
    if (!existing) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase
          .from("accounts")
          .insert({ id: remoteId, ...payload })
          .select("id, version")
          .single();

        if (!error) {
          return { remoteId: data.id as string, version: data.version as number };
        }

        console.error("[AleppoCenterCash] account insert failed", error);

        if (error.code !== "23505") throw error;

        const { data: collided, error: collisionError } = await supabase
          .from("accounts")
          .select("id, workspace_id, name, owner_name, accent, version")
          .eq("id", remoteId)
          .maybeSingle();

        if (collisionError) throw collisionError;

        if (
          collided?.workspace_id === workspaceId &&
          collided.name === payload.name &&
          collided.owner_name === payload.owner_name &&
          collided.accent === payload.accent
        ) {
          return { remoteId: collided.id as string, version: collided.version as number };
        }

        remoteId = makeRemoteId();
      }

      throw new SyncConflictError("تعذر إنشاء معرف فريد للحساب بعد عدة محاولات");
    }
    return { remoteId: existing.id, version: existing.version };
  }

  if (!existing) throw new SyncConflictError("الحساب لم يعد موجوداً على السحابة");

  // Do not rewrite untouched rows. Rewriting every row on each mutation was
  // causing false version conflicts between devices.
  const unchanged =
    existing.name === payload.name &&
    existing.owner_name === payload.owner_name &&
    existing.accent === payload.accent;

  if (unchanged) return { remoteId: existing.id, version: existing.version };

  const expectedVersion = account.version ?? 1;
  const { data, error } = await supabase
    .from("accounts")
    .update(updatePayload)
    .eq("id", remoteId)
    .eq("version", expectedVersion)
    .select("id, version")
    .maybeSingle();
  if (error) {
    console.error("[AleppoCenterCash] account update failed", error);
    throw error;
  }
  if (!data) throw new SyncConflictError();
  return { remoteId: data.id as string, version: data.version as number };
}

async function pushPayment(
  workspaceId: string,
  userId: string,
  accountRemoteId: string,
  payment: LocalPayment,
  existing?: CloudPayment,
) {
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
  const updatePayload = {
    workspace_id: workspaceId,
    account_id: accountRemoteId,
    name: payment.name.trim(),
    amount_minor: Math.round(payment.amount),
    currency: payment.currency,
    payment_type: payment.type,
    occurred_on: payment.date,
  };

  if (!payment.remoteId) {
    const { data, error } = await supabase
      .from("payments")
      .insert({ id: remoteId, ...payload })
      .select("id, version")
      .single();
    if (error) {
      console.error("[AleppoCenterCash] payment insert failed", error);
      if (error.code === "23505") {
        const { data: raced, error: raceError } = await supabase
          .from("payments")
          .select("id, workspace_id, version")
          .eq("id", remoteId)
          .maybeSingle();
        if (!raceError && raced?.workspace_id === workspaceId) {
          return { remoteId: raced.id as string, version: raced.version as number };
        }
      }
      throw error;
    }
    return { remoteId: data.id as string, version: data.version as number };
  }

  // Same retry protection as accounts: version 0 means the local snapshot has
  // not yet received server metadata, not that the remote row does not exist.
  if (payment.version === 0) {
    if (!existing) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase
          .from("payments")
          .insert({ id: remoteId, ...payload })
          .select("id, version")
          .single();

        if (!error) {
          return { remoteId: data.id as string, version: data.version as number };
        }

        console.error("[AleppoCenterCash] payment insert failed", error);

        if (error.code !== "23505") throw error;

        const { data: collided, error: collisionError } = await supabase
          .from("payments")
          .select("id, workspace_id, account_id, name, amount_minor, currency, payment_type, occurred_on, version")
          .eq("id", remoteId)
          .maybeSingle();

        if (collisionError) throw collisionError;

        if (
          collided?.workspace_id === workspaceId &&
          collided.account_id === accountRemoteId &&
          collided.name === payload.name &&
          collided.amount_minor === payload.amount_minor &&
          collided.currency === payload.currency &&
          collided.payment_type === payload.payment_type &&
          collided.occurred_on === payload.occurred_on
        ) {
          return { remoteId: collided.id as string, version: collided.version as number };
        }

        remoteId = makeRemoteId();
      }

      throw new SyncConflictError("تعذر إنشاء معرف فريد للدفعة بعد عدة محاولات");
    }
    return { remoteId: existing.id, version: existing.version };
  }

  if (!existing) throw new SyncConflictError("الدفعة لم تعد موجودة على السحابة");

  const unchanged =
    existing.account_id === payload.account_id &&
    existing.name === payload.name &&
    existing.amount_minor === payload.amount_minor &&
    existing.currency === payload.currency &&
    existing.payment_type === payload.payment_type &&
    existing.occurred_on === payload.occurred_on;

  if (unchanged) return { remoteId: existing.id, version: existing.version };

  const expectedVersion = payment.version ?? 1;
  const { data, error } = await supabase
    .from("payments")
    .update(updatePayload)
    .eq("id", remoteId)
    .eq("version", expectedVersion)
    .select("id, version")
    .maybeSingle();
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
    if (error) throw error;
    if (!data?.length) {
      const { data: remaining, error: verifyError } = await client
        .from("payments")
        .select("id")
        .eq("id", deletion.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (!remaining) continue;
      throw new SyncConflictError("تعذر حذف الدفعة من السحابة: تغيرت قبل الحذف");
    }
  }

  for (const deletion of deletedAccountIds) {
    console.info("[AleppoCenterCash] deleting account", deletion);
    let query = client.from("accounts").delete().eq("id", deletion.id).eq("workspace_id", workspaceId);
    if (deletion.version !== undefined) query = query.eq("version", deletion.version);
    const { data, error } = await query.select("id");
    console.info("[AleppoCenterCash] account delete result", { id: deletion.id, data, error });
    if (error) throw error;
    if (!data?.length) {
      const { data: remaining, error: verifyError } = await client
        .from("accounts")
        .select("id")
        .eq("id", deletion.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (!remaining) continue;
      throw new SyncConflictError("تعذر حذف الحساب من السحابة: تغير قبل الحذف");
    }
  }

  // Read the current server snapshot once. This lets us skip untouched rows and
  // makes version checks meaningful instead of incrementing every row on every save.
  const [existingAccountsResult, existingPaymentsResult] = await Promise.all([
    client.from("accounts").select("id, workspace_id, name, owner_name, accent, version").eq("workspace_id", workspaceId),
    client.from("payments").select("id, account_id, name, amount_minor, currency, payment_type, occurred_on, version").eq("workspace_id", workspaceId),
  ]);
  if (existingAccountsResult.error) throw existingAccountsResult.error;
  if (existingPaymentsResult.error) throw existingPaymentsResult.error;

  const existingAccounts = (existingAccountsResult.data ?? []) as CloudAccount[];
  const existingPayments = (existingPaymentsResult.data ?? []) as CloudPayment[];
  const existingAccountsById = new Map(existingAccounts.map((account) => [account.id, account]));
  const existingPaymentsById = new Map(existingPayments.map((payment) => [payment.id, payment]));

  const nextAccounts: LocalAccount[] = [];
  const normalizedAccounts = normalizeLocalRemoteIds(accounts);

  for (const account of normalizedAccounts) {
    const existingAccount = account.remoteId ? existingAccountsById.get(account.remoteId) : undefined;
    const savedAccount = await pushAccount(workspaceId, userId, account, existingAccount);
    const nextPayments: LocalPayment[] = [];

    for (const payment of account.payments) {
      const existingPayment = payment.remoteId ? existingPaymentsById.get(payment.remoteId) : undefined;
      const savedPayment = await pushPayment(workspaceId, userId, savedAccount.remoteId, payment, existingPayment);
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

  if (error) throw error;

  const cloudAccounts = (data ?? []) as CloudAccount[];
  const cloudByRemoteId = new Map(cloudAccounts.map((account) => [account.id, account]));
  const paymentRows = await client
    .from("payments")
    .select("id, account_id, name, amount_minor, currency, payment_type, occurred_on, version")
    .eq("workspace_id", workspaceId)
    .order("occurred_on", { ascending: false });
  if (paymentRows.error) throw paymentRows.error;

  const payments = (paymentRows.data ?? []) as CloudPayment[];
  const paymentsByAccountId = new Map<string, CloudPayment[]>();
  for (const payment of payments) {
    const list = paymentsByAccountId.get(payment.account_id) ?? [];
    list.push(payment);
    paymentsByAccountId.set(payment.account_id, list);
  }

  console.info("[AleppoCenterCash] pushed result", { count: cloudAccounts.length, accounts: cloudAccounts });

  return nextAccounts.flatMap((account) => {
    if (!account.remoteId) return [];
    const serverAccount = cloudByRemoteId.get(account.remoteId);
    if (!serverAccount) return [];

    const serverPayments = paymentsByAccountId.get(serverAccount.id) ?? [];
    const serverPaymentsByRemoteId = new Map(serverPayments.map((payment) => [payment.id, payment.id]));
    return [{
      ...account,
      remoteId: serverAccount.id,
      version: serverAccount.version,
      name: serverAccount.name,
      owner: serverAccount.owner_name,
      accent: serverAccount.accent,
      payments: account.payments.flatMap((payment) => {
        if (!payment.remoteId) return [];
        if (!serverPaymentsByRemoteId.has(payment.remoteId)) return [];
        const saved = serverPayments.find((item) => item.id === payment.remoteId);
        return saved
          ? [{ ...payment, remoteId: saved.id, version: saved.version, name: saved.name, amount: saved.amount_minor, currency: saved.currency, type: saved.payment_type, date: saved.occurred_on }]
          : [];
      }),
    }];
  });
}
export async function deleteAccountFromCloud(workspaceId: string, accountId: string, expectedVersion?: number) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");

  console.info("[AleppoCenterCash] direct account delete", { workspaceId, accountId, expectedVersion });

  let query = supabase
    .from("accounts")
    .delete()
    .eq("id", accountId)
    .eq("workspace_id", workspaceId);

  if (expectedVersion !== undefined) query = query.eq("version", expectedVersion);

  const { data, error } = await query.select("id");

  console.info("[AleppoCenterCash] direct account delete result", { accountId, data, error });

  if (error) {
    console.error("[AleppoCenterCash] direct account delete failed", error);
    throw error;
  }

  if (!data?.length) {
    const { data: remaining, error: verifyError } = await supabase
      .from("accounts")
      .select("id, version")
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (verifyError) {
      console.error("[AleppoCenterCash] account delete verification failed", verifyError);
      throw verifyError;
    }

    if (!remaining) {
      console.info("[AleppoCenterCash] account already absent after delete attempt", { accountId });
      return accountId;
    }

    throw new SyncConflictError("تعذر حذف الحساب من السحابة: تغير قبل الحذف");
  }

  return data[0].id as string;
}

export async function deletePaymentFromCloud(workspaceId: string, paymentId: string, expectedVersion?: number) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");

  console.info("[AleppoCenterCash] direct payment delete", { workspaceId, paymentId, expectedVersion });

  let query = supabase
    .from("payments")
    .delete()
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId);

  if (expectedVersion !== undefined) query = query.eq("version", expectedVersion);

  const { data, error } = await query.select("id");

  console.info("[AleppoCenterCash] direct payment delete result", { paymentId, data, error });

  if (error) {
    console.error("[AleppoCenterCash] direct payment delete failed", error);
    throw error;
  }

  if (!data?.length) {
    throw new SyncConflictError("تعذر حذف الدفعة من السحابة: لم يتم العثور عليها أو لا تملك صلاحية حذفها");
  }

  return data[0].id as string;
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

export async function deleteWorkspaceFromCloud(workspaceId: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");

  const { error } = await supabase.rpc("delete_my_workspace", { target_workspace: workspaceId });
  if (error) throw error;

  const { data, error: verifyError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (verifyError) throw verifyError;
  if (data) throw new SyncConflictError("مساحة العمل ما انحذفت من السحابة.");
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
