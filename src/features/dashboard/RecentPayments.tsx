import * as React from "react";
import { Section, SectionLink } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { ListGroup } from "@/components/ui/list";
import { PaymentListItem } from "@/features/payments/PaymentListItem";
import { recentPayments, type AnalyticsPayment } from "@/lib/statistics";
import { formatDayMonth } from "@/lib/utils/formatDate";
import type { EntityInfo } from "./format";

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
  const recent = React.useMemo(() => recentPayments(payments, 5), [payments]);

  return (
    // „Letzte Eingänge" statt „Letzte Dividendeneingänge": Dieselbe Überschrift
    // trägt die Liste auf der Assetseite. „Alle" führt zur ganzen Liste.
    <Section
      title="Letzte Dividenden"
      action={<SectionLink to="/eingaenge">Alle</SectionLink>}
    >
      {recent.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Noch keine Dividenden vorhanden.
        </p>
      ) : (
        <ListGroup>
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
                    <Badge variant="neutral" className="mr-2 shrink-0">
                      Archiviert
                    </Badge>
                  ) : undefined
                }
                date={payment.payDate}
                note={
                  shifted
                    ? `tatsächlich ${formatDayMonth(payment.actualPayDate)}`
                    : undefined
                }
                depot={depots.get(payment.depotId)?.name ?? "Unbekannt"}
                amount={payment.netAmount}
              />
            );
          })}
        </ListGroup>
      )}
    </Section>
  );
}
