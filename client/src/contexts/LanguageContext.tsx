import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { englishTranslations } from "@/locales/en";

export type Language = "ar" | "en";
export type TextDirection = "rtl" | "ltr";

const LANGUAGE_STORAGE_KEY = "aleppo-center-cash-language";

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "ar";
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

let activeLanguage: Language = readStoredLanguage();

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function t(sourceText: string): string {
  const decoded = decodeHtmlEntities(sourceText);
  return activeLanguage === "en" ? englishTranslations[sourceText] ?? englishTranslations[decoded] ?? decoded : decoded;
}

export function tx(pattern: string, values: readonly unknown[]): string {
  return t(pattern).replace(/\{(\d+)\}/g, (placeholder, index: string) => {
    const value = values[Number(index)];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function getLanguage(): Language {
  return activeLanguage;
}

export function getDirection(): TextDirection {
  return activeLanguage === "ar" ? "rtl" : "ltr";
}

type LanguageContextValue = {
  language: Language;
  direction: TextDirection;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "ar",
  direction: "rtl",
  setLanguage: () => undefined,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((nextLanguage: Language) => {
    activeLanguage = nextLanguage;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // Keep the selection for this session even if browser storage is unavailable.
    }
    setLanguageState(nextLanguage);
  }, []);

  useEffect(() => {
    activeLanguage = language;
    const root = document.documentElement;
    root.lang = language;
    root.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    const syncFromAnotherTab = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY) return;
      const nextLanguage: Language = event.newValue === "en" ? "en" : "ar";
      activeLanguage = nextLanguage;
      setLanguageState(nextLanguage);
    };
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    direction: language === "ar" ? "rtl" : "ltr",
    setLanguage,
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
