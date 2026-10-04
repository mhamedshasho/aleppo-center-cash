import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Theme = "light" | "dark" | "gold" | "red" | "yellow-black";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
  workspaceId?: string | null;
}

const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark" || value === "gold" || value === "red" || value === "yellow-black";

export function ThemeProvider({ children, defaultTheme = "light", switchable = false, workspaceId: explicitWorkspaceId }: ThemeProviderProps) {
  const [sharedWorkspaceId, setSharedWorkspaceId] = useState<string | null>(() => explicitWorkspaceId ?? (typeof localStorage !== "undefined" ? localStorage.getItem("aleppo-shared-workspace-id") : null));
  const workspaceId = explicitWorkspaceId ?? sharedWorkspaceId;
  useEffect(() => { if (explicitWorkspaceId) return; const handler = () => setSharedWorkspaceId(localStorage.getItem("aleppo-shared-workspace-id")); window.addEventListener("aleppo-workspace-context", handler); return () => window.removeEventListener("aleppo-workspace-context", handler); }, [explicitWorkspaceId]);
  const [theme, setThemeState] = useState<Theme>(() => {
    if (switchable && typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("theme");
      return isTheme(stored) ? stored : defaultTheme;
    }
    return defaultTheme;
  });

  useEffect(() => {
    if (!switchable || !workspaceId || !supabase) return;
    let active = true;

    const load = async () => {
      const { data, error } = await supabase.from("workspace_settings").select("theme").eq("workspace_id", workspaceId).maybeSingle();
      if (error) {
        console.warn("[AleppoCenterCash] shared theme load failed", error);
        return;
      }
      if (active && isTheme(data?.theme)) setThemeState(data.theme);
      if (!data) {
        const { error: insertError } = await supabase.from("workspace_settings").insert({ workspace_id: workspaceId, theme });
        if (insertError && insertError.code !== "23505") console.warn("[AleppoCenterCash] shared theme initialize failed", insertError);
      }
    };

    void load();
    const channel = supabase.channel("workspace-theme-" + workspaceId)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_settings", filter: "workspace_id=eq." + workspaceId }, (payload) => {
        const next = (payload.new as { theme?: unknown } | null)?.theme;
        if (active && isTheme(next)) setThemeState(next);
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, switchable]);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    if (switchable && typeof localStorage !== "undefined") localStorage.setItem("theme", nextTheme);
    if (switchable && workspaceId && supabase) {
      void supabase.from("workspace_settings").upsert({ workspace_id: workspaceId, theme: nextTheme }, { onConflict: "workspace_id" })
        .then(({ error }) => { if (error) console.warn("[AleppoCenterCash] shared theme save failed", error); });
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("gold", theme === "gold");
    root.classList.toggle("red", theme === "red");
    root.classList.toggle("yellow-black", theme === "yellow-black");
  }, [theme]);

  const toggleTheme = switchable
    ? () => setTheme(theme === "light" ? "dark" : theme === "dark" ? "gold" : theme === "gold" ? "red" : theme === "red" ? "yellow-black" : "light")
    : undefined;

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, switchable }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
