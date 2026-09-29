import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "gold" | "red" | "custom";

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
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return stored === "dark" || stored === "gold" || stored === "red" || stored === "custom" || stored === "light" ? stored : defaultTheme;
    }
    return defaultTheme;
  });

  const setTheme = (nextTheme: Theme) => setThemeState(nextTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("gold", theme === "gold");
    root.classList.toggle("red", theme === "red");
    root.classList.toggle("custom", theme === "custom");

    if (theme === "custom") {
      const customColor = localStorage.getItem("custom-theme-color");
      if (/^#[0-9a-fA-F]{6}$/.test(customColor ?? "")) {
        root.style.setProperty("--custom-primary", customColor!);
        root.style.setProperty("--custom-primary-foreground", "#ffffff");
        root.style.setProperty("--custom-accent-soft", `color-mix(in srgb, ${customColor} 12%, white)`);
        root.style.setProperty("--custom-border", `color-mix(in srgb, ${customColor} 22%, #d8d8d8)`);
        root.style.setProperty("--custom-page", `color-mix(in srgb, ${customColor} 3%, white)`);
        root.style.setProperty("--custom-surface", "#ffffff");
        root.style.setProperty("--custom-text", "#263238");
        root.style.setProperty("--custom-muted", "#68777d");
      }
    }

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setThemeState(prev => prev === "light" ? "dark" : prev === "dark" ? "gold" : prev === "gold" ? "red" : prev === "red" ? "custom" : "light");
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
