import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CloudAuthGate from "./components/CloudAuthGate";
import Home from "./pages/Home";
import Credits from "./pages/Credits";
import "./ui-enhancements.css";
import "./manual-upgrade.css";
import { checkForAppUpdateNotification, initializeNativeNotifications, scheduleUsageReminders } from "./lib/nativeNotifications";
import { initializeOneSignal } from "./lib/oneSignal";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={CloudAuthGate} />
      <Route path={"/credits"} component={Credits} />
      <Route path={"/:workspaceSlug"} component={CloudAuthGate} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    void initializeOneSignal();
    void initializeNativeNotifications().then((ready) => {
      if (ready) {
        void scheduleUsageReminders();
        void checkForAppUpdateNotification();
      }
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    const updateDeviceClass = () => {
      const isPhone = window.innerWidth <= 820;

      root.classList.toggle("device-phone", isPhone);
      root.classList.toggle("device-pc", !isPhone);
    };

    updateDeviceClass();
    window.addEventListener("resize", updateDeviceClass, { passive: true });

    return () => window.removeEventListener("resize", updateDeviceClass);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster
            position="top-right"
            duration={3200}
            visibleToasts={3}
            closeButton
            expand={false}
            richColors={false}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
