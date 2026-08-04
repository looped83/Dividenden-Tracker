import * as React from "react";
import { StatCard } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import { formatPercent } from "@/lib/money";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { portfolioTotals, type SnapshotSum } from "@/features/securities/snapshots";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

/**
 * Kennzahlen des juengsten Depotstands (docs/PORTFOLIO_IMPORT.md).
 *
 * Steht direkt unter der Kopfzeile — an derselben Stelle wie in jedem anderen
 * Bereich (Uebersicht, Kalender), damit die Seite sich nicht anders anfuehlt
 * als die Nachbarn.
 *
 * Diese Zahlen sind **Marktdaten einer fremden Quelle zu einem Stichtag**, kein
 * Ergebnis der eigenen Auswertungen. Deshalb traegt die erste Kachel den Stand
 * sichtbar mit: Ein Depotwert ohne Datum liest sich wie „jetzt", und genau das
 * ist er nicht.
 *
 * Ohne importierten Stand erscheint hier nichts — eine Reihe leerer Kacheln
 * waere ein Versprechen auf Daten, die es nicht gibt.
 */
export function PortfolioSummary({
  snapshots,
}: {
  snapshots: readonly SecuritySnapshot[];
}) {
  const totals = React.useMemo(() => portfolioTotals(snapshots), [snapshots]);

  if (totals.asOf === null || totals.positions === 0) return null;

  const dividend = totals.annualDividend;
  const dividendGaps =
    dividend.kind === "amount" && dividend.counted < totals.positions
      ? `aus ${formatCountNumber(dividend.counted)} von ${formatCountNumber(totals.positions)} Positionen`
      : undefined;

  return (
    // Dasselbe Raster wie die Kennzahlen des Kalenders (`CalendarSummary`):
    // zwei Kacheln je Zeile auf dem Telefon, vier ab `lg`. Einspaltig standen
    // sie hier als vier volle Bloecke untereinander und schoben die Liste weit
    // nach unten — und sahen anders aus als dieselben Kacheln zwei Bereiche
    // weiter.
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Depotwert"
        value={<SumValue sum={totals.marketValue} />}
        comparison={`Stand ${formatCalendarDate(totals.asOf)}`}
      />
      {/* „Erwartet p. a." statt „Erwartete Jahresdividende": Der laengere Name
          bricht in der Kachel auf zwei Zeilen um und schiebt seine Kennzahl
          gegenueber den Nachbarn nach unten — in einer Viererreihe faellt der
          Versatz sofort auf. Es ist ausserdem dieselbe Beschriftung wie in der
          Unternehmensstatistik. */}
      <StatCard
        label="Erwartet p. a."
        value={<SumValue sum={dividend} />}
        comparison={dividendGaps}
      />
      <StatCard
        label="Rendite"
        value={
          totals.yieldPercent === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span>{formatPercent(totals.yieldPercent, 2)}</span>
          )
        }
        comparison={
          totals.yieldOnBuyinPercent === null
            ? undefined
            : `auf den Einstand ${formatPercent(totals.yieldOnBuyinPercent, 2)}`
        }
      />
      <StatCard
        label="Positionen"
        value={<span>{formatCountNumber(totals.positions)}</span>}
        comparison={
          totals.buyinTotal.kind === "amount" ? (
            <span>
              Einstand <AmountText amount={totals.buyinTotal.value} />
            </span>
          ) : undefined
        }
      />
    </div>
  );
}

/**
 * Eine Summe aus Snapshots. Verschiedene Waehrungen werden **nicht** addiert —
 * das waere eine Umrechnung zu einem erfundenen Kurs; die Kachel sagt es
 * stattdessen, wie es der Dividendenkalender an derselben Stelle tut.
 */
function SumValue({ sum }: { sum: SnapshotSum }) {
  if (sum.kind === "amount") return <AmountText amount={sum.value} />;
  if (sum.kind === "mixedCurrency")
    return <span className="text-base sm:text-lg">verschiedene Währungen</span>;
  return <span className="text-muted-foreground">—</span>;
}
