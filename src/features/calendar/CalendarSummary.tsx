import { KpiHero } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { monthNameDe } from "@/lib/statistics";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { formatDayMonth } from "@/lib/utils/formatDate";
import { EVENT_KIND_TEXT, relativeDayLabel } from "@/lib/calendar/format";
import type { CalendarEventType } from "@/lib/calendar/types";
import type { CalendarSummary as Summary, ExpectedTotal } from "@/lib/calendar/summary";

/**
 * Kennzahlkopf des Kalenders — derselbe `KpiHero` wie auf der Übersicht und
 * in den anderen Bereichen. Die Hauptzahl beantwortet die Frage, mit der man
 * den Kalender öffnet: Was kommt in den nächsten 30 Tagen? Nächster Zahltag
 * und der laufende Monat stehen darunter. Die frühere Kachel „Unternehmen mit
 * kommenden Zahltagen" entfällt — die Liste darunter zeigt sie.
 *
 * Die Beträge sind die **angekündigten** der Kalenderquelle, nicht erhaltene
 * Zahlungen und keine Schätzung dieser App (PRODUCT_SPEC.md Grundsatz 8). Nennt
 * die Quelle für einen Termin keinen Betrag, fehlt er auch hier — die Kennzahl
 * fällt dann auf die Anzahl zurück, statt eine Lücke stillschweigend als Null
 * zu verrechnen.
 */
export function CalendarSummaryTiles({
  summary,
  type,
  today,
}: {
  summary: Summary;
  type: CalendarEventType;
  today: string;
}) {
  const month = monthNameDe(Number.parseInt(today.slice(5, 7), 10));
  const next = summary.next;

  return (
    <KpiHero
      label="Nächste 30 Tage"
      value={<TotalValue total={summary.next30Days} />}
      // Ohne Beträge ist die Hauptzahl die Anzahl — „erwartet 2 Termine"
      // wiederholte sie nur.
      caption={
        summary.next30Days.total
          ? `erwartet ${captionFor(summary.next30Days)}`
          : "angekündigte Termine"
      }
      stats={[
        {
          label: `Nächster ${EVENT_KIND_TEXT[type].one}`,
          value: next ? formatDayMonth(next.date) : "–",
          caption: next
            ? // Die Anzahl nur, wenn an diesem Tag mehr als ein Termin liegt.
              next.events.length > 1
              ? `${relativeDayLabel(next.daysAway)} · ${formatCountNumber(next.events.length)} Termine`
              : relativeDayLabel(next.daysAway)
            : "keine angekündigten Termine",
        },
        {
          label: `${month} gesamt`,
          value: <TotalValue total={summary.thisMonth} />,
          // Ohne Beträge ist der Wert schon die Anzahl — „3 · 3 Termine"
          // wiederholte ihn nur (wie bei der Hauptzahl).
          caption:
            summary.thisMonth.total || summary.thisMonth.mixedCurrencies
              ? captionFor(summary.thisMonth)
              : "angekündigte Termine",
        },
      ]}
    />
  );
}

/**
 * Die Summe, wenn die Quelle Beträge nennt — sonst die Anzahl der Termine.
 * So bleibt die Kennzahl auch dann aussagekräftig, wenn der Feed nur Namen
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
