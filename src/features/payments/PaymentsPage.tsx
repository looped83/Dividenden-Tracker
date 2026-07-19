import * as React from "react";
import { Link } from "react-router";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AmountText } from "@/components/money/AmountText";
import { Money, toCurrencyCode } from "@/lib/money";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import { usePayments } from "@/features/payments/hooks";
import type { PaymentFilters } from "@/lib/supabase/repositories/payments";
import type { PaymentType } from "@/lib/supabase/database.types";

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  regular: "Regulär",
  special: "Sonderdividende",
  correction: "Korrektur",
  cancellation: "Storno",
  refund: "Erstattung",
  other: "Sonstiges",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function PaymentsPage() {
  const { data: depots = [] } = useDepots();
  const { data: securities = [] } = useSecurities();

  const [searchTerm, setSearchTerm] = React.useState("");
  const [depotId, setDepotId] = React.useState("");
  const [securityId, setSecurityId] = React.useState("");
  const [paymentType, setPaymentType] = React.useState<PaymentType | "">("");
  const [includeArchived, setIncludeArchived] = React.useState(false);

  const filters: PaymentFilters = {
    searchTerm: searchTerm || undefined,
    depotId: depotId || undefined,
    securityId: securityId || undefined,
    paymentType: paymentType || undefined,
    includeArchived,
  };

  const { data: payments = [], isLoading } = usePayments(filters);
  const depotById = new Map(depots.map((depot) => [depot.id, depot]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Dividendeneingänge</h1>
        <Button asChild>
          <Link to="/eingaenge/neu">
            <Plus /> Neuer Eingang
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <label htmlFor="payments-search" className="text-sm text-muted-foreground">
            Suche (Unternehmen/Ticker)
          </label>
          <Input
            id="payments-search"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
            }}
            placeholder="z. B. Apple oder AAPL"
          />
        </div>
        <div className="min-w-40 space-y-1.5">
          <label
            htmlFor="payments-depot-filter"
            className="text-sm text-muted-foreground"
          >
            Depot
          </label>
          <Select
            id="payments-depot-filter"
            value={depotId}
            onChange={(event) => {
              setDepotId(event.target.value);
            }}
          >
            <option value="">Alle Depots</option>
            {depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-40 space-y-1.5">
          <label
            htmlFor="payments-security-filter"
            className="text-sm text-muted-foreground"
          >
            Unternehmen
          </label>
          <Select
            id="payments-security-filter"
            value={securityId}
            onChange={(event) => {
              setSecurityId(event.target.value);
            }}
          >
            <option value="">Alle Unternehmen</option>
            {securities.map((security) => (
              <option key={security.id} value={security.id}>
                {security.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-40 space-y-1.5">
          <label htmlFor="payments-type-filter" className="text-sm text-muted-foreground">
            Art
          </label>
          <Select
            id="payments-type-filter"
            value={paymentType}
            onChange={(event) => {
              setPaymentType(event.target.value as PaymentType | "");
            }}
          >
            <option value="">Alle Arten</option>
            {Object.entries(PAYMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex h-11 items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4"
            checked={includeArchived}
            onChange={(event) => {
              setIncludeArchived(event.target.checked);
            }}
          />
          Archivierte anzeigen
        </label>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Noch kein Dividendeneingang erfasst"
          description="Erfasse deinen ersten Dividendeneingang."
          action={
            <Button asChild>
              <Link to="/eingaenge/neu">Ersten Eingang erfassen</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Unternehmen</TableHead>
              <TableHead>Depot</TableHead>
              <TableHead>Art</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead className="text-right">Netto</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const security = (
                payment as unknown as {
                  securities?: { name: string; ticker: string | null };
                }
              ).securities;
              const depot = depotById.get(payment.depot_id);
              const currency = toCurrencyCode(depot?.base_currency ?? "EUR");
              return (
                <TableRow key={payment.id}>
                  <TableCell>
                    <Link to={`/eingaenge/${payment.id}`} className="hover:underline">
                      {formatDate(payment.pay_date)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {security?.name ?? "—"}
                    {security?.ticker ? (
                      <span className="ml-1 text-muted-foreground">
                        ({security.ticker})
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {depot?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {PAYMENT_TYPE_LABELS[payment.payment_type]}
                  </TableCell>
                  <TableCell className="text-right">
                    <AmountText
                      amount={Money.fromString(payment.gross_amount, currency)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <AmountText amount={Money.fromString(payment.net_amount, currency)} />
                  </TableCell>
                  <TableCell>
                    {payment.archived_at ? (
                      <Badge variant="neutral">Archiviert</Badge>
                    ) : (
                      <Badge variant="positive">Aktiv</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
