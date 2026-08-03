import { StatCard } from "@/components/domain/StatCard";
import { monthNameDe } from "@/lib/statistics";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { relativeDayLabel } from "@/lib/calendar/format";
import type { CalendarSummary as Summary } from "@/lib/calendar/summary";

/**
 * Kennzahlen über der Liste — dieselbe `StatCard` wie auf der Übersicht, damit
 * Kacheln in der ganzen App gleich aussehen.
 *
 * Gezeigt wird ausschliesslich Abzaehlbares (Termine, Unternehmen, Tage). Der
 * Feed liefert keine Betraege; eine Kachel „Erwartete Summe" waere geraten und
 * stuende im Widerspruch zur Trennung von Prognose und Ist (PRODUCT_SPEC.md
 * Grundsatz 8).
 */
export function CalendarSummaryTiles({
  summary,
  today,
}: {
  summary: Summary;
  today: string;
}) {
  const month = monthNameDe(Number.parseInt(today.slice(5, 7), 10));

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Nächster Zahltag"
        value={summary.next ? formatCalendarDate(summary.next.date) : <span>–</span>}
        comparison={
          summary.next
            ? // Die Anzahl nur, wenn an diesem Tag mehr als ein Termin liegt —
              // sonst waere die Zeile dreizeilig und die Kachel hoeher als ihre
              // Nachbarn, ohne etwas zu sagen.
              summary.next.events.length > 1
              ? `${relativeDayLabel(summary.next.daysAway)} · ${formatCountNumber(summary.next.events.length)} Termine`
              : relativeDayLabel(summary.next.daysAway)
            : "keine angekündigten Termine"
        }
      />
      <StatCard
        label="Diesen Monat"
        value={formatCountNumber(summary.thisMonth)}
        comparison={month}
      />
      <StatCard
        label="Nächste 30 Tage"
        value={formatCountNumber(summary.next30Days)}
        comparison={`von ${formatCountNumber(summary.upcoming)} angekündigten`}
      />
      <StatCard
        label="Unternehmen"
        value={formatCountNumber(summary.companies)}
        comparison="mit kommenden Zahltagen"
      />
    </div>
  );
}
