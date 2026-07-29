import * as React from "react";
import { Outlet } from "react-router";
import { SETTINGS_TABS } from "@/app/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { TabNav } from "@/components/layout/TabNav";

/**
 * Rahmen der Einstellungen mit Unterbereichs-Navigation, analog zum
 * Statistikbereich. Depots, Importe und Datensicherung sind hierher
 * verschoben — Verwaltungsaufgaben, die die Hauptnavigation nicht taeglich
 * braucht. Ihre alten Pfade leiten dauerhaft hierher um (router.tsx).
 */
export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Einstellungen" />

      <TabNav label="Einstellungsbereiche" tabs={SETTINGS_TABS} />

      {/* Eigener Ladezustand: Beim Reiterwechsel bleiben Kopfzeile und Reiter
          stehen, nur der Inhalt darunter wartet. */}
      <React.Suspense fallback={<PageSkeleton header={false} />}>
        <Outlet />
      </React.Suspense>
    </div>
  );
}
