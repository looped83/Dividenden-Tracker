import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AmountText } from "@/components/money/AmountText";
import { DateText } from "@/components/DateText";
import { recentPayments, type AnalyticsPayment } from "@/lib/statistics";
import { formatIsoDate, type EntityInfo } from "./format";

interface RecentPaymentsProps {
  /** Gesamte aktive Historie (die letzten Eingaenge, unabhaengig vom Jahr, §11). */
  payments: AnalyticsPayment[];
  securities: Map<string, EntityInfo>;
  depots: Map<string, EntityInfo>;
}

/**
 * §11 Letzte Dividendeneingaenge: stets die tatsaechlich juengsten der Historie.
 *
 * Fuenf statt acht: Die Uebersicht soll den letzten Stand zeigen, nicht die
 * Liste ersetzen — dafuer steht der Weg zu allen Eingaengen daneben.
 */
export function RecentPayments({ payments, securities, depots }: RecentPaymentsProps) {
  const recent = recentPayments(payments, 5);

  return (
    <Card>
      {/* `items-baseline` statt `items-center`: Bricht die Ueberschrift auf
          schmalen Geraeten um, saesse der Knopf sonst auf der Mitte beider
          Zeilen und damit sichtbar zu hoch. */}
      <CardHeader className="flex flex-row items-baseline justify-between gap-3 space-y-0 pb-5">
        <CardTitle>Letzte Dividendeneingänge</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/eingaenge">Alle Dividenden</Link>
        </Button>
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
                      <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                        <DateText className="shrink-0">
                          {formatIsoDate(payment.payDate)}
                          {payment.payDate !== payment.actualPayDate && (
                            <span title="Tatsächliches Zahlungsdatum">
                              {" "}
                              (tatsächlich {formatIsoDate(payment.actualPayDate)})
                            </span>
                          )}
                        </DateText>
                        <span className="truncate">· {depot?.name ?? "Unbekannt"}</span>
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
