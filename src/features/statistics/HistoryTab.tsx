import { useSearchParams } from "react-router";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import { YearsTab } from "./YearsTab";
import { MonthsTab } from "./MonthsTab";
import { applyHistoryGrain, parseHistoryGrain, type HistoryGrain } from "./historyParams";

const OPTIONS: readonly SegmentOption<HistoryGrain>[] = [
  { value: "jahre", label: "Jahre" },
  { value: "monate", label: "Monate" },
];

/**
 * Reiter **Verlauf**: die Entwicklung ueber die Zeit, nach Jahren oder nach
 * Kalendermonaten. Zuvor waren das zwei Reiter mit derselben Form (Diagramm
 * und Tabelle) — sieben Reiter liefen auf dem Telefon aus dem Bild, und das
 * Jahresdiagramm stand zusaetzlich in der Uebersicht.
 *
 * Die Ebene steht in der Adresse (`historyParams.ts`). Die alten Pfade
 * `/statistiken/jahre` und `/statistiken/monate` leiten hierher um.
 */
export function HistoryTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const grain = parseHistoryGrain(searchParams);

  return (
    <div className="space-y-6">
      <SegmentedControl
        label="Verlauf nach"
        options={OPTIONS}
        value={grain}
        onChange={(next) => {
          setSearchParams((prev) => applyHistoryGrain(prev, next), { replace: true });
        }}
        className="w-full sm:w-auto"
      />
      {grain === "jahre" ? <YearsTab /> : <MonthsTab />}
    </div>
  );
}
