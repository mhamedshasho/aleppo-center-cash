import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CloudAuthGate from "./components/CloudAuthGate";
import Home from "./pages/Home";
import Credits from "./pages/Credits";
import "./ui-enhancements.css";
import "./web-redesign.css";
import "./manual-upgrade.css";
import "./password-toggle.css";
import { checkForAppUpdateNotification, initializeNativeNotifications, scheduleUsageReminders } from "./lib/nativeNotifications";
import { initializeOneSignal } from "./lib/oneSignal";
type NavigationOptions = { replace?: boolean };
function useAppLocation(): [string, (to: string, options?: NavigationOptions) => void] {
  const isDesktopFile = window.location.protocol === "file:";
  const readLocation = () => {
    if (isDesktopFile) {
      const hash = window.location.hash.replace(/^#/, "");
      return hash ? decodeURIComponent(hash) : "/";
    }
    return window.location.pathname || "/";
  };
  const [location, setLocationState] = useState(readLocation);
  useEffect(() => {
    const sync = () => setLocationState(readLocation());
    const event = isDesktopFile ? "hashchange" : "popstate";
    window.addEventListener(event, sync);
    return () => window.removeEventListener(event, sync);
  }, [isDesktopFile]);
  const navigate = (to: string, options?: NavigationOptions) => {
    if (isDesktopFile) {
      const next = to.startsWith("/") ? to : "/" + to;
      if (options?.replace) window.location.replace("#" + next);
      else window.location.hash = next;
      return;
    }
    if (options?.replace) window.history.replaceState({}, "", to);
    else window.history.pushState({}, "", to);
    setLocationState(to);
  };
  return [location, navigate];
}
function Router() {
  return (<WouterRouter hook={useAppLocation}><Switch>
    <Route path={"/"} component={CloudAuthGate} />
    <Route path={"/credits"} component={Credits} />
    <Route path={"/:workspaceSlug"} component={CloudAuthGate} />
    <Route path={"/404"} component={NotFound} />
    <Route component={NotFound} />
  </Switch></WouterRouter>);
}
function App() {
  useEffect(() => { void initializeOneSignal(); void initializeNativeNotifications().then((ready) => { if (ready) { void scheduleUsageReminders(); void checkForAppUpdateNotification(); } }); }, []);
  useEffect(() => {
    const root = document.documentElement;
    const updateDeviceClass = () => { const isPhone = window.innerWidth <= 820; root.classList.toggle("device-phone", isPhone); root.classList.toggle("device-pc", !isPhone); };
    updateDeviceClass(); window.addEventListener("resize", updateDeviceClass, { passive: true });
    return () => window.removeEventListener("resize", updateDeviceClass);
  }, []);
  return (<ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider>
    <Toaster position="top-right" duration={3200} visibleToasts={3} closeButton expand={false} richColors={false} />
    <Router />
  </TooltipProvider></ThemeProvider></ErrorBoundary>);
}
export default App;