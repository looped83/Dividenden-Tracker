import * as React from "react";
import { KpiHero, TrendPill } from "@/components/domain/KpiHero";
import { PortfolioImportButton } from "@/features/securities/PortfolioImportDialog";
import { AmountText } from "@/components/money/AmountText";
import { formatPercent } from "@/lib/money";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { portfolioTotals, type SnapshotSum } from "@/features/securities/snapshots";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

/**
 * Kennzahlkopf des juengsten Depotstands (docs/PORTFOLIO_IMPORT.md) —
 * derselbe `KpiHero` wie in den anderen Bereichen, direkt unter der Kopfzeile.
 *
 * Diese Zahlen sind **Marktdaten einer fremden Quelle zu einem Stichtag**, kein
 * Ergebnis der eigenen Auswertungen. Deshalb traegt die Hauptzahl den Stand
 * sichtbar in ihrer Beschriftung: Ein Depotwert ohne Datum liest sich wie
 * „jetzt", und genau das ist er nicht. Gleich daneben liegt der Weg, ihn zu
 * erneuern — dort, wo man sieht, dass er alt ist. Am Ende der Assetliste stand
 * der Import hinter zwanzig Zeilen.
 *
 * Ohne importierten Stand erscheint hier nichts — eine leere Kennzahl waere
 * ein Versprechen auf Daten, die es nicht gibt. Der Import steht dann am Ende
 * der Liste.
 */
export function PortfolioSummary({
  snapshots,
  onImport,
}: {
  snapshots: readonly SecuritySnapshot[];
  /** Oeffnet den Import eines neuen Stands (Dialog der Seite). */
  onImport: () => void;
}) {
  const totals = React.useMemo(() => portfolioTotals(snapshots), [snapshots]);

  if (totals.asOf === null || totals.positions === 0) return null;

  const dividend = totals.annualDividend;
  const dividendGaps =
    dividend.kind === "amount" && dividend.counted < totals.positions
      ? `aus ${formatCountNumber(dividend.counted)} von ${formatCountNumber(totals.positions)} Positionen`
      : undefined;
  const { gain, gainPercent } = totals;

  return (
    <KpiHero
      label={`Depotwert · Stand ${formatCalendarDate(totals.asOf)}`}
      value={<SumValue sum={totals.marketValue} />}
      trend={
        gain && gainPercent ? (
          <TrendPill
            tone={gain.isNegative() ? "negative" : gain.isZero() ? "neutral" : "positive"}
            title="Kursgewinn gegenüber dem Einstand"
          >
            {formatPercent(gainPercent.abs(), 1)}
          </TrendPill>
        ) : undefined
      }
      caption={
        <span className="flex flex-wrap items-center gap-x-3">
          {totals.buyinTotal.kind === "amount" && (
            <span>
              Einstand <AmountText amount={totals.buyinTotal.value} />
            </span>
          )}
          <PortfolioImportButton variant="inline" onClick={onImport} />
        </span>
      }
      stats={[
        // „Erwartet p. a." statt „Erwartete Jahresdividende": dieselbe
        // Beschriftung wie in der Unternehmensstatistik.
        {
          label: "Erwartet p. a.",
          value: <SumValue sum={dividend} />,
          caption:
            dividendGaps ?? formatCountNoun(totals.positions, "Position", "Positionen"),
        },
        {
          label: "Rendite",
          value:
            totals.yieldPercent === null ? "—" : formatPercent(totals.yieldPercent, 2),
          caption:
            totals.yieldOnBuyinPercent === null
              ? undefined
              : `auf Einstand ${formatPercent(totals.yieldOnBuyinPercent, 2)}`,
        },
      ]}
    />
  );
}

/**
 * Eine Summe aus Snapshots. Verschiedene Waehrungen werden **nicht** addiert —
 * das waere eine Umrechnung zu einem erfundenen Kurs; die Kennzahl sagt es
 * stattdessen, wie es der Dividendenkalender an derselben Stelle tut.
 */
function SumValue({ sum }: { sum: SnapshotSum }) {
  if (sum.kind === "amount") return <AmountText amount={sum.value} />;
  if (sum.kind === "mixedCurrency")
    return <span className="text-base sm:text-lg">verschiedene Währungen</span>;
  return <span className="text-muted-foreground">—</span>;
}
