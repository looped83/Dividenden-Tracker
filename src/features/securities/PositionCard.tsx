import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { AmountText } from "@/components/money/AmountText";
import { Money, formatPercent, toCurrencyCode } from "@/lib/money";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import type { YearBucket } from "@/lib/statistics";
import { ratioToPercent, type SnapshotStatus } from "@/features/securities/snapshots";
import type { DividendFrequency } from "@/lib/supabase/database.types";

const FREQUENCY_LABELS: Readonly<Record<DividendFrequency, string>> = {
  none: "keine Ausschüttung",
  monthly: "monatlich",
  quarterly: "vierteljährlich",
  biannually: "halbjährlich",
  annually: "jährlich",
  irregular: "unregelmäßig",
};

/**
 * Der Depotstand eines Unternehmens (docs/PORTFOLIO_IMPORT.md).
 *
 * Die Karte traegt ihren **Stichtag in der Ueberschrift**, weil jede Zahl darin
 * nur an diesem Tag galt. Ist der Stand nicht der juengste, wird die Position
 * laut Quelle nicht mehr gehalten: Der Export beschreibt das ganze Depot, ein
 * fehlendes Papier ist also verkauft. Ohne diese Unterscheidung stuende hier
 * dauerhaft ein Bestand, den es nicht mehr gibt — still falsch, und das ist die
 * schlimmste Art falsch.
 *
 * **Oben vier Kennzahlen, der Rest zum Aufklappen.** Zuvor standen zehn Werte
 * untereinander und die Erwartung ganz unten — die hoechste Karte der App. Die
 * Frage einer Dividendenstrategie ist dieselbe wie bei den Zielen: Was erwarte
 * ich im Jahr, und was kam tatsaechlich? Beides steht jetzt nebeneinander vorn,
 * darunter Marktwert (mit Gewinn) und Rendite (mit Rendite auf Einstand).
 * Stueckzahl, Kurs, Einstand, Dividende je Aktie, Rhythmus und Wachstum stehen
 * unter „Alle Kennzahlen".
 *
 * Kein Wert dieser Karte fliesst in Statistik oder Ziele (PRODUCT_SPEC.md
 * Grundsatz 8); es sind Marktdaten und **erwartete** Ausschuettungen einer
 * fremden Quelle.
 */
export function PositionCard({
  status,
  perYear,
}: {
  status: SnapshotStatus;
  /** Tatsaechlich erhaltene Dividenden je Jahr — fuer die Gegenueberstellung. */
  perYear: readonly YearBucket[];
}) {
  const { snapshot, current } = status;

  // Verglichen wird mit dem letzten **abgeschlossenen** Kalenderjahr: Die
  // erwartete Jahresdividende gilt fuer zwoelf Monate, und ein laufendes Jahr
  // liesse sie zwangslaeufig zu hoch aussehen.
  const reference = React.useMemo(() => {
    if (snapshot === null) return null;
    const asOfYear = new Date(`${snapshot.as_of}T00:00:00Z`).getUTCFullYear();
    return (
      [...perYear]
        .filter((bucket) => bucket.year < asOfYear && bucket.count > 0)
        .sort((a, b) => b.year - a.year)
        .at(0) ?? null
    );
  }, [perYear, snapshot]);

  if (snapshot === null) return null;

  const currency = toCurrencyCode(snapshot.currency);
  const money = (value: string | null) =>
    value === null ? null : Money.fromString(value, currency);

  const price = money(snapshot.price);
  const marketValue = money(snapshot.market_value);
  const buyinTotal = money(snapshot.buyin_total);
  const gain = money(snapshot.gain_absolute);
  const dividendPerShare = money(snapshot.dividend_per_share);
  const annualDividend = money(snapshot.annual_dividend_total);
  const gainRelative = ratioToPercent(snapshot.gain_relative);
  const dividendYield = ratioToPercent(snapshot.dividend_yield);
  const yieldOnBuyin = ratioToPercent(snapshot.dividend_yield_on_buyin);
  const cagr = ratioToPercent(snapshot.dividend_cagr);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {current ? "Position" : "Letzter bekannter Bestand"}
          <Badge variant={current ? "neutral" : "warning"}>
            Stand {formatCalendarDate(snapshot.as_of)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Verkauft: Ueberschrift „Letzter bekannter Bestand" und die gelbe
            Datumsmarke sagen es; ein Satz darunter wiederholte es nur. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <KeyFigure
            label="Erwartet p. a."
            value={annualDividend ? <AmountText amount={annualDividend} /> : null}
          />
          {/* Verglichen wird mit dem letzten abgeschlossenen Kalenderjahr (s. o.). */}
          <KeyFigure
            label={reference ? `Erhalten ${String(reference.year)}` : "Erhalten"}
            value={reference ? <AmountText amount={reference.net} /> : null}
            caption={reference ? undefined : "noch kein volles Jahr"}
          />
          <KeyFigure
            label="Marktwert"
            value={marketValue ? <AmountText amount={marketValue} /> : null}
            caption={
              gain ? (
                <>
                  <AmountText amount={gain} showSign />
                  {gainRelative && ` (${formatPercent(gainRelative, 1)})`}
                </>
              ) : undefined
            }
          />
          <KeyFigure
            label="Rendite"
            value={dividendYield ? formatPercent(dividendYield, 2) : null}
            caption={
              yieldOnBuyin ? `auf Einstand ${formatPercent(yieldOnBuyin, 2)}` : undefined
            }
          />
        </dl>

        <Disclosure summary="Alle Kennzahlen">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <Row label="Stückzahl" value={formatQuantity(snapshot.quantity)} />
            <Row label="Kurs" value={price ? <AmountText amount={price} /> : null} />
            <Row
              label="Einstand"
              value={buyinTotal ? <AmountText amount={buyinTotal} /> : null}
            />
            <Row
              label="Dividende je Aktie"
              value={dividendPerShare ? <AmountText amount={dividendPerShare} /> : null}
            />
            <Row
              label="Rhythmus"
              value={
                snapshot.dividend_frequency
                  ? FREQUENCY_LABELS[snapshot.dividend_frequency]
                  : null
              }
            />
            <Row
              label="Wachstum"
              value={
                cagr
                  ? `${formatPercent(cagr, 1)} p. a.${
                      snapshot.dividend_cagr_period
                        ? ` über ${snapshot.dividend_cagr_period.replace("Y", " Jahre")}`
                        : ""
                    }`
                  : null
              }
            />
          </dl>
        </Disclosure>
      </CardContent>
    </Card>
  );
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

/**
 * Eine der vier Kennzahlen: Beschriftung, Wert, optional ein Zusatz darunter —
 * derselbe Satz wie die Betraege der Zieldetailseite.
 */
function KeyFigure({
  label,
  value,
  caption,
}: {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-amount">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
      {caption !== undefined && (
        <dd className="text-xs text-muted-foreground">{caption}</dd>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </>
  );
}
