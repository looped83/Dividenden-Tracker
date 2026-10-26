import * as React from "react";
import { Outlet } from "react-router";
import { PLANNER_TABS } from "@/app/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { TabNav } from "@/components/layout/TabNav";

/**
 * Rahmen des **Planers** (seit 2.20.0): alles, was durchrechnet, was wäre,
 * wenn du kaufst oder sparst — Nachkauf, Sparpläne, Optimierungen,
 * Schneeball. Der Bestand zeigt, was ist und was voraussichtlich kommt; der
 * Planer, was du daran ändern kannst. Monatslücken und Schneeball standen
 * bis 2.19 in Bestand › Prognose. Der Umschalter Einmalkauf | Sparpläne im
 * Kopf entfiel mit 2.33.0.
 */
export function PlannerPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Planer" />

      <TabNav label="Planerbereiche" tabs={PLANNER_TABS} />

      <React.Suspense fallback={<PageSkeleton header={false} />}>
        <Outlet />
      </React.Suspense>
    </div>
  );
}
