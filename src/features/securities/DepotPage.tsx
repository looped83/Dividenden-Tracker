import * as React from "react";
import { Outlet } from "react-router";
import { DEPOT_TABS } from "@/app/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { TabNav } from "@/components/layout/TabNav";
import { NewAssetButton } from "@/features/securities/SecurityFormDialog";

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
 * Die Hauptaktion steht in der Kopfzeile und gilt fuer den ganzen Bereich: Ein
 * neues Asset anzulegen ist auch aus der Entwicklung heraus sinnvoll, und der
 * Knopf traegt seinen Dialog selbst.
 */
export function DepotPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Depot" actions={<NewAssetButton />} />

      <TabNav label="Depotbereiche" tabs={DEPOT_TABS} />

      {/* Eigener Ladezustand: Beim Reiterwechsel bleiben Kopfzeile und Reiter
          stehen, nur der Inhalt darunter wartet. */}
      <React.Suspense fallback={<PageSkeleton header={false} />}>
        <Outlet />
      </React.Suspense>
    </div>
  );
}
