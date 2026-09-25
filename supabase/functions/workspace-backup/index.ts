import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const safeName = (value: string) => value
  .trim()
  .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 100) || "workspace";

const backupPath = (workspaceId: string) => `${workspaceId}.json`;
const legacyBackupPath = (workspaceName: string) => `${safeName(workspaceName)}.json`;

async function getUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function getWorkspace(workspaceId: string, userId: string) {
  const { data: member, error: memberError } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw new Error("not_workspace_member");

  const { data: workspace, error } = await admin
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();
  if (error) throw error;
  return workspace;
}

async function createBackup(workspaceId: string, userId: string) {
  const workspace = await getWorkspace(workspaceId, userId);
  const [members, profiles, accounts, payments, audit] = await Promise.all([
    admin.from("workspace_members").select("*").eq("workspace_id", workspaceId),
    admin.from("profiles").select("*"),
    admin.from("accounts").select("*").eq("workspace_id", workspaceId),
    admin.from("payments").select("*").eq("workspace_id", workspaceId),
    admin.from("audit_log").select("*").eq("workspace_id", workspaceId).order("id", { ascending: true }),
  ]);

  for (const result of [members, profiles, accounts, payments, audit]) {
    if (result.error) throw result.error;
  }

  const memberIds = new Set((members.data ?? []).map((item) => item.user_id));
  const snapshot = {
    format: "aleppo-center-cash-restoration",
    version: 1,
    saved_at: new Date().toISOString(),
    workspace,
    members: members.data ?? [],
    profiles: (profiles.data ?? []).filter((profile) => memberIds.has(profile.user_id)),
    accounts: accounts.data ?? [],
    payments: payments.data ?? [],
    audit_log: audit.data ?? [],
  };

  const path = backupPath(workspaceId);
  const body = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
  const { error } = await admin.storage
    .from("workspace-restorations")
    .upload(path, body, { contentType: "application/json", cacheControl: "0", upsert: true });
  if (error) throw error;

  return { path, savedAt: snapshot.saved_at, accounts: snapshot.accounts.length, payments: snapshot.payments.length };
}

async function setRestorePassword(workspaceId: string, userId: string, password: string) {
  await getWorkspace(workspaceId, userId);
  if (password.length < 8) throw new Error("restore_password_too_short");
  const { error } = await admin.rpc("set_workspace_restore_password", {
    target_workspace: workspaceId,
    new_password: password,
  });
  if (error) throw error;
  return { ok: true };
}

async function restore(workspaceId: string, userId: string, password: string) {
  const workspace = await getWorkspace(workspaceId, userId);
  const { data: valid, error: verifyError } = await admin.rpc("verify_workspace_restore_password", {
    target_workspace: workspaceId,
    candidate_password: password,
  });
  if (verifyError) throw verifyError;
  if (!valid) throw new Error("invalid_restore_password");

  const primaryPath = backupPath(workspaceId);
  let file: Blob | null = null;
  const primary = await admin.storage.from("workspace-restorations").download(primaryPath);
  if (!primary.error && primary.data) {
    file = primary.data;
  } else {
    const legacy = await admin.storage.from("workspace-restorations").download(legacyBackupPath(workspace.name));
    if (!legacy.error && legacy.data) file = legacy.data;
  }
  if (!file) throw new Error("backup_not_found");

  const snapshot = JSON.parse(await file.text());
  if (snapshot?.format !== "aleppo-center-cash-restoration" || snapshot?.version !== 1 || snapshot?.workspace?.id !== workspaceId) {
    throw new Error("invalid_backup");
  }

  const { error: restoreError } = await admin.rpc("restore_workspace_snapshot", {
    target_workspace: workspaceId,
    snapshot,
  });
  if (restoreError) throw restoreError;

  return {
    ok: true,
    savedAt: snapshot.saved_at,
    accounts: snapshot.accounts?.length ?? 0,
    payments: snapshot.payments?.length ?? 0,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await getUser(request);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const body = await request.json();
    const action = String(body.action ?? "");
    const workspaceId = String(body.workspaceId ?? "");
    if (!workspaceId) return json({ error: "workspace_required" }, 400);

    if (action === "backup") return json(await createBackup(workspaceId, user.id));
    if (action === "set_password") return json(await setRestorePassword(workspaceId, user.id, String(body.password ?? "")));
    if (action === "restore") return json(await restore(workspaceId, user.id, String(body.password ?? "")));

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "not_authenticated" ? 401 : message === "not_workspace_member" ? 403 : 400;
    return json({ error: message }, status);
  }
});
