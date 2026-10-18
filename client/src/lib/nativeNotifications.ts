import { Capacitor } from "@capacitor/core";

type NativeNotification = {
  title: string;
  body: string;
  id?: number;
};

const REMINDER_BASE_ID = 700000;
const REMINDER_COUNT = 48; // Keep the queue compact; reschedule it whenever the app opens.
const LEGACY_REMINDER_COUNT = 84; // Clear every reminder ID created by the older scheduler.
const NOTIFICATION_CHANNEL_ID = "aleppo-center-cash-alerts-v2";

async function getLocalNotifications() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const module = await import("@capacitor/local-notifications");
    return module.LocalNotifications;
  } catch (error) {
    console.error("[AleppoCenterCash] local notifications plugin could not load", error);
    return null;
  }
}

export async function initializeNativeNotifications(options: { requestPermission?: boolean } = {}) {
  const notifications = await getLocalNotifications();
  if (!notifications) return false;

  try {
    // Use a fresh channel ID so Android can apply the high-importance settings
    // even if an older install already created the previous channel at low priority.
    await notifications.createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: "إشعارات Aleppo Center Cash",
      description: "تنبيهات الحسابات والدفعات والتحديثات والتذكير",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
    }).catch((error) => console.warn("[AleppoCenterCash] notification channel setup failed", error));

    let permission = await notifications.checkPermissions();
    if (permission.display !== "granted" && options.requestPermission !== false) {
      permission = await notifications.requestPermissions();
    }
    return permission.display === "granted";
  } catch (error) {
    console.error("[AleppoCenterCash] native notification initialization failed", error);
    return false;
  }
}

export async function showNativeNotification(notification: NativeNotification) {
  const notifications = await getLocalNotifications();
  if (!notifications) return;

  try {
    // Ensure the channel exists even if an action fires before app startup
    // has finished initializing notifications.
    await notifications.createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: "إشعارات Aleppo Center Cash",
      description: "تنبيهات الحسابات والدفعات والتحديثات والتذكير",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
    }).catch((error) => console.warn("[AleppoCenterCash] notification channel setup failed", error));

    const permission = await notifications.checkPermissions();
    if (permission.display !== "granted") return;

    await notifications.schedule({
      notifications: [{
        id: notification.id ?? Math.floor(Date.now() % 2000000000),
        title: notification.title,
        body: notification.body,
        channelId: NOTIFICATION_CHANNEL_ID,
        sound: "default",
        extra: { source: "aleppo-center-cash" },
      }],
    });
  } catch (error) {
    // A denied permission or OEM-specific notification failure must not break
    // the account/payment operation that triggered this notification.
    console.error("[AleppoCenterCash] displaying native notification failed", error);
  }
}

export async function scheduleUsageReminders() {
  const notifications = await getLocalNotifications();
  if (!notifications) return;

  const permission = await notifications.checkPermissions();
  if (permission.display !== "granted") return;

  const ids = Array.from({ length: LEGACY_REMINDER_COUNT }, (_, index) => REMINDER_BASE_ID + index); // Clear old v1 schedules as well.
  await notifications.cancel({ notifications: ids.map((id) => ({ id })) }).catch(() => undefined);

  const now = Date.now();
  const reminders = ids.slice(0, REMINDER_COUNT).map((id, index) => ({
    id,
    title: "Aleppo Center Cash",
    body: "تذكير سريع: افتح البرنامج وتابع حساباتك وحركاتك.",
    channelId: NOTIFICATION_CHANNEL_ID,
    sound: "default",
    schedule: {
      at: new Date(now + (index + 1) * 2 * 60 * 60 * 1000),
      allowWhileIdle: true,
    },
    extra: { source: "usage-reminder" },
  }));

  await notifications.schedule({ notifications: reminders });
}


const UPDATE_KEY = "aleppo-center-cash-last-update-sha";

export async function checkForAppUpdateNotification() {
  const notifications = await getLocalNotifications();
  if (!notifications) return;

  const permission = await notifications.checkPermissions();
  if (permission.display !== "granted") return;

  try {
    const response = await fetch("https://api.github.com/repos/mhamedshasho/aleppo-center-cash/commits/main", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;

    const data = await response.json() as { sha?: string };
    if (!data.sha) return;

    const previous = localStorage.getItem(UPDATE_KEY);
    if (!previous) {
      localStorage.setItem(UPDATE_KEY, data.sha);
      return;
    }

    if (previous !== data.sha) {
      localStorage.setItem(UPDATE_KEY, data.sha);
      await showNativeNotification({
        title: "تحديث جديد متوفر",
        body: "في تحديث جديد لـ Aleppo Center Cash. افتح التطبيق لمراجعة آخر التحديثات.",
        id: 600001,
      });
    }
  } catch {
    // Update checks are best-effort and must never affect accounting.
  }
}
