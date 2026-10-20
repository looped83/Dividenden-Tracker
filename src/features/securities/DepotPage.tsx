import * as React from "react";
import { Outlet } from "react-router";
import { DEPOT_TABS } from "@/app/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { TabNav } from "@/components/layout/TabNav";

/**
 * Rahmen des Depotbereichs mit Unterbereichs-Navigation, analog zu Statistik
 * und Einstellungen.
 *
 * **Der Bereich hiess „Unternehmen".** Er fuehrt aber nicht nur
 * Aktiengesellschaften, sondern alles, was im Depot liegt — ETFs, Fonds,
 * Anleihen. Der alte Name benannte einen Sonderfall als Ganzes; „Depot" nennt
 * die Sache. In der Oberflaeche heissen die Eintraege deshalb **Assets**, im
 * Datenmodell weiterhin `securities` (DATA_MODEL.md) — eine Umbenennung der
 * Tabellen brächte niemandem etwas und riskierte alles.
 *
 * **Die „Entwicklung" ist aus der Statistik hierher gewandert.** Sie war dort
 * der einzige Unterbereich, der auf den importierten Depotstaenden aufsetzt
 * statt auf den erfassten Zahlungen (docs/PORTFOLIO_IMPORT.md) — und damit der
 * einzige, der eine Frage des Depots beantwortete statt eine der Historie. Ihr
 * alter Pfad leitet dauerhaft hierher um (router.tsx).
 *
 * **Der Kopf traegt den Filter des Reiters** (seit 1.11.0), wie die
 * Jahresauswahl auf der Uebersicht: Assets den Filterschalter, die Entwicklung
 * die Assetauswahl (`DepotHeaderActions`). „Neues Asset" steht im Reiter Assets
 * neben der Ueberschrift der Liste — in der Entwicklung hat es keinen Bezug.
 */
export function DepotPage() {
  // Die Stelle im Kopf, in die der Reiter seine Aktion setzt.
  const [actions, setActions] = React.useState<HTMLDivElement | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bestand"
        actions={<div ref={setActions} className="contents" />}
      />

      <TabNav label="Depotbereiche" tabs={DEPOT_TABS} />

      {/* Eigener Ladezustand: Beim Reiterwechsel bleiben Kopfzeile und Reiter
          stehen, nur der Inhalt darunter wartet. */}
      <React.Suspense fallback={<PageSkeleton header={false} />}>
        <Outlet context={actions} />
      </React.Suspense>
    </div>
  );
}
