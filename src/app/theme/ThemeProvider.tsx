import * as React from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "dividend-tracker:theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

function getSystemThemeSnapshot(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getSystemThemeServerSnapshot(): ResolvedTheme {
  return "light";
}

/**
 * Theme-Verwaltung (hell/dunkel/System, UX_AND_DESIGN_SYSTEM.md #8).
 * Die Praeferenz ist eine reine UI-Einstellung ohne Finanzdatenbezug und
 * darf deshalb in localStorage liegen (ARCHITECTURE.md §1 beschraenkt nur
 * die Speicherung fachlicher/finanzieller Daten, nicht UI-Praeferenzen).
 *
 * Die System-Praeferenz ist ein extern veraenderlicher Wert (Browser-API);
 * sie wird deshalb ueber useSyncExternalStore gelesen statt in einem Effect
 * per setState nachgezogen zu werden.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(readStoredTheme);
  const systemTheme = React.useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    getSystemThemeServerSnapshot,
  );
  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  React.useEffect(() => {
    window.document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setTheme = React.useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme muss innerhalb von <ThemeProvider> verwendet werden.");
  }
  return context;
}
