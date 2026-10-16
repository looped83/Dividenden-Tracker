import type * as React from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router";

/**
 * Aktion eines Depotreiters im Seitenkopf — rechts neben „Depot", wo auf der
 * Übersicht die Jahresauswahl steht.
 *
 * Der Kopf gehört zum Rahmen (`DepotPage`), seine Aktion aber zum Reiter: Assets
 * zeigen dort den Filterschalter, die Entwicklung die Assetauswahl. Der Rahmen
 * reicht dafür eine Stelle im Kopf als Outlet-Kontext herunter; außerhalb des
 * Rahmens (Tests) steht die Aktion an Ort und Stelle.
 */
export function DepotHeaderActions({ children }: { children: React.ReactNode }) {
  const slot = useOutletContext<HTMLElement | null | undefined>();
  if (slot === undefined) return children;
  return slot ? createPortal(children, slot) : null;
}
