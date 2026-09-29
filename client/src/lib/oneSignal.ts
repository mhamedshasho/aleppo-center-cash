import { Capacitor } from "@capacitor/core";

const ONESIGNAL_APP_ID = "f6633fb2-0f0a-443e-a2af-c01f1251819e";

let initialized = false;

async function getOneSignal() {
  if (!Capacitor.isNativePlatform()) return null;
  const module = await import("onesignal-cordova-plugin");
  return module.default;
}

async function getReadyOneSignal() {
  const OneSignal = await getOneSignal();
  if (!OneSignal) return null;

  if (!initialized) {
    OneSignal.initialize(ONESIGNAL_APP_ID);
    initialized = true;
  }

  return OneSignal;
}

export async function initializeOneSignal() {
  const OneSignal = await getReadyOneSignal();
  if (!OneSignal) return false;

  try {
    await OneSignal.Notifications.requestPermission(true);
  } catch {}

  try {
    await OneSignal.User.pushSubscription.optIn();
  } catch (error) {
    console.warn("[AleppoCenterCash] OneSignal opt-in failed", error);
  }

  return true;
}

export async function identifyOneSignalUser(userId: string) {
  const OneSignal = await getReadyOneSignal();
  if (!OneSignal || !userId) return false;

  await OneSignal.login(userId);

  try {
    await OneSignal.User.pushSubscription.optIn();
  } catch (error) {
    console.warn("[AleppoCenterCash] OneSignal post-login opt-in failed", error);
  }

  return true;
}
