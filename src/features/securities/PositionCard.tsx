import * as React from "react";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DetailRow } from "@/components/ui/detail-row";
import { KpiStats, type KpiStat } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Money, formatPercent, toCurrencyCode } from "@/lib/money";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { ratioToPercent, type SnapshotStatus } from "@/features/securities/snapshots";

/**
 * Der Depotstand eines Unternehmens (docs/PORTFOLIO_IMPORT.md).
 *
 * Der Abschnitt traegt seinen **Stichtag in der Ueberschrift**, weil jede Zahl
 * darin nur an diesem Tag galt. Ist der Stand nicht der juengste, wird die
 * Position laut Quelle nicht mehr gehalten: Der Export beschreibt das ganze
 * Depot, ein fehlendes Papier ist also verkauft. Ohne diese Unterscheidung
 * stuende hier dauerhaft ein Bestand, den es nicht mehr gibt — still falsch,
 * und das ist die schlimmste Art falsch.
 *
 * Seit 1.30.0 steht die Position **unter** den Dividenden: Die Seite beantwortet
 * zuerst „was bringt mir dieses Papier?" (Kopf, Verlauf), danach „was ist es
 * wert?". Die erwartete Jahresdividende steht im Kopf der Seite neben dem
 * zuletzt erhaltenen Jahr. Hier bleiben Marktwert und Rendite als Kennzahlen,
 * darunter alle Detailwerte offen als Zeilen — das Aufklappen „Alle
 * Kennzahlen" entfaellt, weil der Abschnitt ohnehin weit unten steht.
 *
 * Der Rhythmus steht seit 2.24.0 am Ausschuettungsplan, nicht mehr hier.
 *
 * Kein Wert dieses Abschnitts fliesst in Statistik oder Ziele (PRODUCT_SPEC.md
 * Grundsatz 8); es sind Marktdaten und **erwartete** Ausschuettungen einer
 * fremden Quelle.
 */
export function PositionCard({ status }: { status: SnapshotStatus }) {
  const { snapshot, current } = status;
  if (snapshot === null) return null;

  const currency = toCurrencyCode(snapshot.currency);
  const money = (value: string | null) =>
    value === null ? null : Money.fromString(value, currency);

  const price = money(snapshot.price);
  const marketValue = money(snapshot.market_value);
  const buyinTotal = money(snapshot.buyin_total);
  const gain = money(snapshot.gain_absolute);
  const dividendPerShare = money(snapshot.dividend_per_share);
  const gainRelative = ratioToPercent(snapshot.gain_relative);
  const dividendYield = ratioToPercent(snapshot.dividend_yield);
  const yieldOnBuyin = ratioToPercent(snapshot.dividend_yield_on_buyin);
  const cagr = ratioToPercent(snapshot.dividend_cagr);

  const stats: KpiStat[] = [
    {
      label: "Marktwert",
      value: marketValue ? <AmountText amount={marketValue} /> : "—",
      caption: gain ? (
        <>
          <AmountText amount={gain} showSign />
          {gainRelative && ` (${formatPercent(gainRelative, 1)})`}
        </>
      ) : undefined,
    },
    {
      label: "Rendite",
      value: dividendYield ? formatPercent(dividendYield, 2) : "—",
      caption: yieldOnBuyin
        ? `auf Einstand ${formatPercent(yieldOnBuyin, 2)}`
        : undefined,
    },
  ];

  return (
    <Section
      // Die Datumsmarke gehoert zur Ueberschrift: Jede Zahl galt nur an diesem Tag.
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {current ? "Position" : "Letzter bekannter Bestand"}
          <Badge variant={current ? "neutral" : "warning"}>
            Stand {formatCalendarDate(snapshot.as_of)}
          </Badge>
        </span>
      }
    >
      <div className="space-y-2">
        <KpiStats stats={stats} />
        <div>
          <DetailRow label="Stückzahl">{formatQuantity(snapshot.quantity)}</DetailRow>
          <DetailRow label="Kurs">
            {orDash(price && <AmountText amount={price} />)}
          </DetailRow>
          <DetailRow label="Einstand">
            {orDash(buyinTotal && <AmountText amount={buyinTotal} />)}
          </DetailRow>
          <DetailRow label="Dividende je Aktie">
            {orDash(dividendPerShare && <AmountText amount={dividendPerShare} />)}
          </DetailRow>
          <DetailRow label="Wachstum">
            {orDash(
              cagr &&
                `${formatPercent(cagr, 1)} p. a.${
                  snapshot.dividend_cagr_period
                    ? ` über ${snapshot.dividend_cagr_period.replace("Y", " Jahre")}`
                    : ""
                }`,
            )}
          </DetailRow>
        </div>
      </div>
    </Section>
  );
}

/** Fehlende Werte bleiben als gedaempfter Strich sichtbar. */
function orDash(value: React.ReactNode) {
  if (value === null || value === undefined || value === false || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  return value;
}

/**
 * Stueckzahl ohne bedeutungslose Nullen: „648" statt „648,000000",
 * „416,365226" bleibt vollstaendig.
 */
function formatQuantity(value: string): string {
  const trimmed = value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
  return trimmed.replace(".", ",");
}
