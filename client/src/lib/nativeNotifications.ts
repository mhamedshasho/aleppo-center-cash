import { Capacitor } from "@capacitor/core";

type NativeNotification = {
  title: string;
  body: string;
  id?: number;
};

const REMINDER_BASE_ID = 700000;

async function getLocalNotifications() {
  if (!Capacitor.isNativePlatform()) return null;
  const module = await import("@capacitor/local-notifications");
  return module.LocalNotifications;
}

export async function initializeNativeNotifications() {
  const notifications = await getLocalNotifications();
  if (!notifications) return false;

  const permission = await notifications.checkPermissions();
  if (permission.display !== "granted") {
    const requested = await notifications.requestPermissions();
    if (requested.display !== "granted") return false;
  }

  await notifications.createChannel({
    id: "aleppo-center-cash",
    name: "Aleppo Center Cash",
    description: "إشعارات الحسابات والتحديثات والتذكير",
    importance: 5,
    visibility: 1,
    sound: "default",
    vibration: true,
  }).catch(() => undefined);

  return true;
}

export async function showNativeNotification(notification: NativeNotification) {
  const notifications = await getLocalNotifications();
  if (!notifications) return;

  const permission = await notifications.checkPermissions();
  if (permission.display !== "granted") return;

  await notifications.schedule({
    notifications: [{
      id: notification.id ?? Math.floor(Date.now() % 2000000000),
      title: notification.title,
      body: notification.body,
      channelId: "aleppo-center-cash",
      sound: "default",
      smallIcon: "ic_stat_icon_config_sample",
      extra: { source: "aleppo-center-cash" },
    }],
  });
}

export async function scheduleUsageReminders() {
  const notifications = await getLocalNotifications();
  if (!notifications) return;

  const permission = await notifications.checkPermissions();
  if (permission.display !== "granted") return;

  const ids = Array.from({ length: 84 }, (_, index) => REMINDER_BASE_ID + index);
  await notifications.cancel({ notifications: ids.map((id) => ({ id })) }).catch(() => undefined);

  const now = Date.now();
  const reminders = ids.map((id, index) => ({
    id,
    title: "Aleppo Center Cash",
    body: "تذكير سريع: افتح البرنامج وتابع حساباتك وحركاتك.",
    channelId: "aleppo-center-cash",
    sound: "default",
    schedule: {
      at: new Date(now + (index + 1) * 2 * 60 * 60 * 1000),
      allowWhileIdle: true,
    },
    extra: { source: "usage-reminder" },
  }));

  await notifications.schedule({ notifications: reminders });
}
