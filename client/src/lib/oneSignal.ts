import { Capacitor } from "@capacitor/core";

const ONESIGNAL_APP_ID = "f6633fb2-0f0a-443e-a2af-c01f1251819e";

let initialized = false;

async function getOneSignal() {
  if (!Capacitor.isNativePlatform()) return null;
  const module = await import("onesignal-cordova-plugin");
  return module.default;
}

export async function initializeOneSignal() {
  const OneSignal = await getOneSignal();
  if (!OneSignal) return false;

  if (!initialized) {
    OneSignal.initialize(ONESIGNAL_APP_ID);
    initialized = true;
  }

  await OneSignal.Notifications.requestPermission(true).catch(() => false);
  return true;
}

export async function identifyOneSignalUser(userId: string) {
  const OneSignal = await getOneSignal();
  if (!OneSignal || !userId) return false;

  if (!initialized) {
    OneSignal.initialize(ONESIGNAL_APP_ID);
    initialized = true;
  }

  await OneSignal.login(userId);
  return true;
}
