import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AmountText } from "@/components/money/AmountText";
import { recentPayments, type AnalyticsPayment } from "@/lib/statistics";
import { describeSource, formatIsoDate, type EntityInfo } from "./format";

interface RecentPaymentsProps {
  /** Gesamte aktive Historie (die letzten Eingaenge, unabhaengig vom Jahr, §11). */
  payments: AnalyticsPayment[];
  securities: Map<string, EntityInfo>;
  depots: Map<string, EntityInfo>;
}

/** §11 Letzte Dividendeneingaenge: stets die tatsaechlich juengsten der Historie. */
export function RecentPayments({ payments, securities, depots }: RecentPaymentsProps) {
  const recent = recentPayments(payments, 8);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Letzte Dividendeneingänge</CardTitle>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Noch keine Dividendeneingänge vorhanden.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((payment) => {
              const security = securities.get(payment.securityId);
              const depot = depots.get(payment.depotId);
              return (
                <li key={payment.id}>
                  <Link
                    to={`/eingaenge/${payment.id}`}
                    className="flex items-center justify-between gap-3 rounded-sm py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium">
                        <span className="truncate" title={security?.name}>
                          {security?.name ?? "Unbekannt"}
                        </span>
                        {security?.archived && (
                          <Badge variant="neutral" className="shrink-0">
                            Archiviert
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatIsoDate(payment.payDate)}
                        {payment.payDate !== payment.actualPayDate && (
                          <span title="Tatsächliches Zahlungsdatum">
                            {" "}
                            (tatsächlich {formatIsoDate(payment.actualPayDate)})
                          </span>
                        )}{" "}
                        · {depot?.name ?? "Unbekannt"} · {describeSource(payment.source)}
                      </p>
                    </div>
                    <AmountText amount={payment.netAmount} className="shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
