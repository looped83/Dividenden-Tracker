import { useLocation } from "react-router";

/** Was eine Liste einem Link zur Detailseite mitgibt: woher man kam. */
export interface BackState {
  from: string;
}

/**
 * Der Link-Zustand für eine Detailseite: die Adresse samt Suchteil, von der
 * aus man sie öffnet. `DetailBackLink` führt dorthin zurück — mit Filtern und
 * aufgeklappten Abschnitten.
 */
export function useBackState(): BackState {
  const { pathname, search } = useLocation();
  return { from: pathname + search };
}

/** Die Herkunft aus dem Link-Zustand der aktuellen Seite, sonst `undefined`. */
export function useBackFrom(): string | undefined {
  const state: unknown = useLocation().state;
  if (state !== null && typeof state === "object" && "from" in state) {
    const { from } = state;
    if (typeof from === "string" && from.startsWith("/")) return from;
  }
  return undefined;
}
