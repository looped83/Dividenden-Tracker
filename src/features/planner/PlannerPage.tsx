import * as React from "react";
import { createPortal } from "react-dom";
import { Outlet, useOutletContext } from "react-router";
import { PLANNER_TABS } from "@/app/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { TabNav } from "@/components/layout/TabNav";

/**
 * Rahmen des **Planers** (seit 2.20.0): alles, was durchrechnet, was wäre,
 * wenn du kaufst oder sparst — Nachkauf, Monatslücken, Schneeball. Der
 * Bestand zeigt, was ist und was voraussichtlich kommt; der Planer, was du
 * daran ändern kannst. Monatslücken und Schneeball standen bis 2.19 in
 * Bestand › Prognose.
 *
 * Wie beim Bestand trägt der Kopf die Aktion des Reiters (Nachkauf: der
 * Umschalter Einmalkauf | Sparpläne).
 */
export function PlannerPage() {
  const [actions, setActions] = React.useState<HTMLDivElement | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Planer"
        actions={<div ref={setActions} className="contents" />}
      />

      <TabNav label="Planerbereiche" tabs={PLANNER_TABS} />

      <React.Suspense fallback={<PageSkeleton header={false} />}>
        <Outlet context={actions} />
      </React.Suspense>
    </div>
  );
}

/** Aktion eines Planerreiters im Seitenkopf (wie `DepotHeaderActions`). */
export function PlannerHeaderActions({ children }: { children: React.ReactNode }) {
  const slot = useOutletContext<HTMLElement | null | undefined>();
  if (slot === undefined) return children;
  return slot ? createPortal(children, slot) : null;
}
