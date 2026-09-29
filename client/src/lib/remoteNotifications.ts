import { supabase } from "@/lib/supabase";

type RemoteNotification = {
  workspaceId: string;
  action: string;
  entity: string;
  title: string;
  body: string;
};

export async function sendRemoteNotification(notification: RemoteNotification) {
  if (!supabase) return false;

  const { error } = await supabase.functions.invoke("push-notification", {
    body: {
      workspace_id: notification.workspaceId,
      action: notification.action,
      entity: notification.entity,
      title: notification.title,
      body: notification.body,
    },
  });

  if (error) {
    console.error("[AleppoCenterCash] remote push failed", error);
    return false;
  }

  return true;
}
