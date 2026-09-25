import { supabase } from "@/lib/supabase";

export async function createCloudBackup(workspaceId: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  const { data, error } = await supabase.functions.invoke("workspace-backup", {
    body: { action: "backup", workspaceId },
  });
  if (error) throw error;
  return data as { path: string; savedAt: string; accounts: number; payments: number };
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
