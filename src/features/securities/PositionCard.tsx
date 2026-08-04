import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
 * Kein Wert dieser Karte fliesst in Statistik oder Ziele (PRODUCT_SPEC.md
 * Grundsatz 8); es sind Marktdaten und **erwartete** Ausschuettungen einer
 * fremden Quelle.
 */
export function PositionCard({
  status,
  perYear,
}: {
  status: SnapshotStatus;
  /** Tatsaechlich erhaltene Dividenden je Jahr — fuer den Soll-Ist-Vergleich. */
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
        {!current && (
          <p className="text-sm text-muted-foreground">
            Im jüngsten Depotstand kommt dieses Unternehmen nicht mehr vor — die Position
            ist verkauft. Die Zahlen unten sind der letzte bekannte Stand.
          </p>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Row label="Stückzahl" value={formatQuantity(snapshot.quantity)} />
          <Row label="Kurs" value={price ? <AmountText amount={price} /> : null} />
          <Row
            label="Marktwert"
            value={marketValue ? <AmountText amount={marketValue} /> : null}
          />
          <Row
            label="Einstand"
            value={buyinTotal ? <AmountText amount={buyinTotal} /> : null}
          />
          <Row
            label="Gewinn"
            value={
              gain ? (
                <span>
                  <AmountText amount={gain} showSign />
                  {gainRelative && (
                    <span className="ml-1 text-muted-foreground">
                      ({formatPercent(gainRelative, 1)})
                    </span>
                  )}
                </span>
              ) : null
            }
          />
        </dl>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
          <Row
            label="Rendite"
            value={dividendYield ? formatPercent(dividendYield, 2) : null}
          />
          <Row
            label="Rendite auf Einstand"
            value={yieldOnBuyin ? formatPercent(yieldOnBuyin, 2) : null}
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

        {annualDividend && (
          <div className="border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">Erwartet für zwölf Monate</p>
            <p className="text-lg font-semibold">
              <AmountText amount={annualDividend} />
            </p>
            {reference ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Tatsächlich erhalten {reference.year}:{" "}
                <AmountText amount={reference.net} className="font-medium" />
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Für einen Vergleich fehlt noch ein abgeschlossenes Kalenderjahr mit
                Eingängen.
              </p>
            )}
          </div>
        )}
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
