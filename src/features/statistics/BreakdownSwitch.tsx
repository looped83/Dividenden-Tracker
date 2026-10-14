import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { Briefcase, Landmark } from "lucide-react";
import { prefetchRoute } from "@/app/routeChunks";
import { SegmentedControl } from "@/components/ui/segmented";
import { useStatisticsContext } from "./context";
import { statisticsTabHref } from "./format";

type Breakdown = "unternehmen" | "depots";

const PATH: Record<Breakdown, string> = {
  unternehmen: "/statistiken/unternehmen",
  depots: "/statistiken/depots",
};

/**
 * Umschalter des Reiters „Aufteilung" (`STATISTICS_TABS`): nach Unternehmen
 * oder nach Depotkonto. Beide Seiten behalten ihre eigene Adresse — Direktlinks
 * und der Weg zurück funktionieren wie zuvor —, und der aktive Filter wandert
 * mit, wie bei jedem Sprung innerhalb der Statistik (`statisticsTabHref`).
 *
 * Die jeweils andere Seite wird beim Anzeigen vorgeladen: Ein Umschalter, der
 * erst nach dem Antippen ein Ladegerüst zeigt, fühlt sich nicht wie einer an.
 */
export function BreakdownSwitch() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { filter } = useStatisticsContext();
  const value: Breakdown = pathname.startsWith(PATH.depots) ? "depots" : "unternehmen";

  React.useEffect(() => {
    prefetchRoute(value === "depots" ? PATH.unternehmen : PATH.depots);
  }, [value]);

  return (
    <SegmentedControl<Breakdown>
      label="Aufteilung nach"
      className="w-full sm:w-auto"
      options={[
        { value: "unternehmen", label: "Assets", icon: Briefcase },
        { value: "depots", label: "Depotkonten", icon: Landmark },
      ]}
      value={value}
      onChange={(next) => {
        void navigate(statisticsTabHref(PATH[next], filter));
      }}
    />
  );
}
