import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

async function clearLegacyServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cleanup is best-effort and must never block the app.
  }
}

void clearLegacyServiceWorkers().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
