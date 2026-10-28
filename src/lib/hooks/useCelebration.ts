import * as React from "react";

/**
 * Welche Erfolge schon gefeiert wurden — eine Ansichtsvorliebe dieses Geräts
 * wie beim Meilenstein. Die neuesten zuerst, begrenzt, damit die Liste nicht
 * über Jahre wächst.
 */
const STORAGE_KEY = "dividend-tracker:celebrated";
const MAX_KEPT = 100;

function readCelebrated(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function storeCelebrated(key: string): void {
  try {
    const kept = readCelebrated().filter((item) => item !== key);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([key, ...kept].slice(0, MAX_KEPT)),
    );
  } catch {
    // Ohne Speicher feiert der Erfolg beim nächsten Besuch noch einmal.
  }
}

/**
 * `true` beim ersten Erscheinen eines Erfolgs auf diesem Gerät (seit 2.44.0),
 * danach nie wieder: Ein erreichtes Ziel soll einmal auffallen, nicht bei
 * jedem Besuch. `null` = gerade nichts zu feiern.
 */
export function useCelebration(key: string | null): boolean {
  const [celebrate] = React.useState(
    () => key !== null && !readCelebrated().includes(key),
  );
  React.useEffect(() => {
    if (celebrate && key !== null) storeCelebrated(key);
  }, [celebrate, key]);
  return celebrate;
}
