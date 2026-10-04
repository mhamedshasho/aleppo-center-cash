import React, { createContext, useContext, useEffect, useState } from "react";

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
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return stored === "dark" || stored === "gold" || stored === "red" || stored === "yellow-black" || stored === "light" ? stored : defaultTheme;
    }
    return defaultTheme;
  });

  const setTheme = (nextTheme: Theme) => setThemeState(nextTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("gold", theme === "gold");
    root.classList.toggle("red", theme === "red");
    root.classList.toggle("yellow-black", theme === "yellow-black");

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setThemeState(prev => prev === "light" ? "dark" : prev === "dark" ? "gold" : prev === "gold" ? "red" : prev === "red" ? "yellow-black" : "light");
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
