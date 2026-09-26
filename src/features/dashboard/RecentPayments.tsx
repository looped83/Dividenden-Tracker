import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListGroup } from "@/components/ui/list";
import { PaymentListItem } from "@/features/payments/PaymentListItem";
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
      {/* „Letzte Eingänge" statt „Letzte Dividendeneingänge": Der lange Titel
          brach neben „Alle Dividenden" auf zwei Zeilen um. Dieselbe
          Ueberschrift traegt die Liste auf der Assetseite. */}
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Letzte Eingänge</CardTitle>
        {/* `-mr-3` hebt den waagerechten Innenabstand des Knopfes auf: Erst
            damit endet seine Beschriftung auf derselben Linie wie die Betraege
            der Liste darunter. `-my-2` haelt die Kopfzeile so hoch wie die
            Ueberschrift (UX_AND_DESIGN_SYSTEM.md §1). */}
        <Button asChild variant="ghost" size="sm" className="-my-2 -mr-3 shrink-0">
          <Link to="/eingaenge">Alle Dividenden</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Noch keine Dividendeneingänge vorhanden.
          </p>
        ) : (
          <ListGroup inset>
            {recent.map((payment) => {
              const security = securities.get(payment.securityId);
              const shifted = payment.payDate !== payment.actualPayDate;
              return (
                <PaymentListItem
                  key={payment.id}
                  to={`/eingaenge/${payment.id}`}
                  title={security?.name ?? "Unbekannt"}
                  badge={
                    security?.archived ? (
                      <Badge variant="neutral" className="ml-2 align-middle">
                        Archiviert
                      </Badge>
                    ) : undefined
                  }
                  date={
                    shifted
                      ? `${formatIsoDate(payment.payDate)} (tatsächlich ${formatIsoDate(payment.actualPayDate)})`
                      : formatIsoDate(payment.payDate)
                  }
                  depot={depots.get(payment.depotId)?.name ?? "Unbekannt"}
                  amount={payment.netAmount}
                />
              );
            })}
          </ListGroup>
        )}
      </CardContent>
    </Card>
  );
}
