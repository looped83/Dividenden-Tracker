import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountText } from "@/components/money/AmountText";
import { historicalSummary, type AnalyticsPayment } from "@/lib/statistics";
import { formatIsoDate } from "./format";

const countFormatter = new Intl.NumberFormat("de-DE");

interface HistoricalOverviewProps {
  payments: AnalyticsPayment[];
}

function Item({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * §12 Historische Uebersicht: kompakte Eckdaten der gesamten aktiven Historie,
 * immer unabhaengig von der Jahresauswahl.
 */
export function HistoricalOverview({ payments }: HistoricalOverviewProps) {
  const summary = historicalSummary(payments);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Historische Übersicht</CardTitle>
        <p className="text-sm text-muted-foreground">
          Gesamte erhaltene Dividenden über alle Jahre.
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Item label="Gesamtsumme" value={<AmountText amount={summary.net} />} />
          <Item label="Zahlungen" value={countFormatter.format(summary.count)} />
          <Item
            label="Erster Eingang"
            value={summary.firstPayDate ? formatIsoDate(summary.firstPayDate) : "—"}
          />
          <Item
            label="Letzter Eingang"
            value={summary.lastPayDate ? formatIsoDate(summary.lastPayDate) : "—"}
          />
          <Item
            label="Unternehmen"
            value={countFormatter.format(summary.distinctSecurities)}
          />
          <Item label="Depots" value={countFormatter.format(summary.distinctDepots)} />
        </dl>
      </CardContent>
    </Card>
  );
}
