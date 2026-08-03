import { StatCard } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import { monthNameDe } from "@/lib/statistics";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { relativeDayLabel } from "@/lib/calendar/format";
import type { CalendarSummary as Summary, ExpectedTotal } from "@/lib/calendar/summary";

/**
 * Kennzahlen über der Liste — dieselbe `StatCard` wie auf der Übersicht, damit
 * Kacheln in der ganzen App gleich aussehen.
 *
 * Die Beträge sind die **angekündigten** der Kalenderquelle, nicht erhaltene
 * Zahlungen und keine Schätzung dieser App (PRODUCT_SPEC.md Grundsatz 8). Nennt
 * die Quelle für einen Termin keinen Betrag, fehlt er auch hier — die Kachel
 * fällt dann auf die Anzahl zurück, statt eine Lücke stillschweigend als Null
 * zu verrechnen.
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
        value={<TotalValue total={summary.thisMonth} />}
        comparison={`${month} · ${captionFor(summary.thisMonth)}`}
      />
      <StatCard
        label="Nächste 30 Tage"
        value={<TotalValue total={summary.next30Days} />}
        comparison={captionFor(summary.next30Days)}
      />
      <StatCard
        label="Unternehmen"
        value={formatCountNumber(summary.companies)}
        comparison="mit kommenden Zahltagen"
      />
    </div>
  );
}

/**
 * Die Summe, wenn die Quelle Beträge nennt — sonst die Anzahl der Termine.
 * So bleibt die Kachel auch dann aussagekräftig, wenn der Feed nur Namen
 * liefert.
 */
function TotalValue({ total }: { total: ExpectedTotal }) {
  if (total.total) return <AmountText amount={total.total} />;
  return <>{formatCountNumber(total.count)}</>;
}

function captionFor(total: ExpectedTotal): string {
  if (total.mixedCurrencies) {
    return `${formatCountNoun(total.count, "Termin", "Termine")} · verschiedene Währungen`;
  }
  if (total.total === null) {
    return formatCountNoun(total.count, "Termin", "Termine");
  }
  // Nennt die Quelle nicht fuer jeden Termin einen Betrag, gehoert das dazu:
  // Die Summe waere sonst als vollstaendig zu lesen.
  return total.withAmount === total.count
    ? `aus ${formatCountNoun(total.count, "Termin", "Terminen")}`
    : `aus ${formatCountNumber(total.withAmount)} von ${formatCountNoun(total.count, "Termin", "Terminen")}`;
}
