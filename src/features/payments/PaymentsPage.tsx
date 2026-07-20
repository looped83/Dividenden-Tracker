import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { Archive as ArchiveIcon, Plus, RotateCcw, Wallet } from "lucide-react";
import {
  availableYears,
  isoDate,
  lastDayOfMonth,
  monthNameDe,
  yearRange,
} from "@/lib/statistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  useArchivePayment,
  usePayments,
  useUnarchivePayment,
} from "@/features/payments/hooks";
import { useDashboardPayments } from "@/features/dashboard/hooks";
import type { PaymentFilters } from "@/lib/supabase/repositories/payments";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function PaymentsPage() {
  const { data: depots = [] } = useDepots();
  const { data: securities = [] } = useSecurities();

  const [searchParams, setSearchParams] = useSearchParams();
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const archivePayment = useArchivePayment();
  const unarchivePayment = useUnarchivePayment();
  const [archiveTargetId, setArchiveTargetId] = React.useState<string | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  // Filter aus der URL: Depot, Unternehmen, Jahr und Monat. So funktionieren
  // Reload, Browser-Zurück und die Drill-downs vom Dashboard (§13).
  const depotId = searchParams.get("depot") ?? "";
  const securityId = searchParams.get("security") ?? "";
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");
  const filterYear =
    yearRaw && /^\d{4}$/.test(yearRaw) ? Number.parseInt(yearRaw, 10) : null;
  const filterMonth =
    monthRaw && /^(1[0-2]|[1-9])$/.test(monthRaw) ? Number.parseInt(monthRaw, 10) : null;

  // Verfügbare Jahre aus der aktiven Historie (geteilter Dashboard-Cache).
  const { data: activeHistory = [] } = useDashboardPayments();
  const years = availableYears(activeHistory);

  const updateParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (value) params.set(key, value);
      else params.delete(key);
      return params;
    });
  };
  // Wird das Jahr geleert, entfällt auch der Monatsfilter (Monat braucht ein Jahr).
  const setYear = (value: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (value) {
        params.set("year", value);
      } else {
        params.delete("year");
        params.delete("month");
      }
      return params;
    });
  };

  let fromDate: string | undefined;
  let toDate: string | undefined;
  if (filterYear && filterMonth) {
    fromDate = isoDate(filterYear, filterMonth, 1);
    toDate = isoDate(filterYear, filterMonth, lastDayOfMonth(filterYear, filterMonth));
  } else if (filterYear) {
    const range = yearRange(filterYear);
    fromDate = range.start;
    toDate = range.end;
  }

  const filters: PaymentFilters = {
    depotId: depotId || undefined,
    securityId: securityId || undefined,
    fromDate,
    toDate,
    includeArchived,
  };

  const { data: payments = [], isLoading } = usePayments(filters);
  const depotById = new Map(depots.map((depot) => [depot.id, depot]));

  const handleArchive = async () => {
    if (!archiveTargetId) return;
    setArchiveError(null);
    try {
      await archivePayment.mutateAsync({
        id: archiveTargetId,
        reason: archiveReason || undefined,
      });
      setArchiveTargetId(null);
      setArchiveReason("");
    } catch (error) {
      setArchiveError(getErrorMessage(error, "Archivieren fehlgeschlagen."));
    }
  };

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
              updateParam("security", event.target.value);
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
        <div className="min-w-32 space-y-1.5">
          <label htmlFor="payments-year-filter" className="text-sm text-muted-foreground">
            Jahr
          </label>
          <Select
            id="payments-year-filter"
            value={filterYear ? String(filterYear) : ""}
            onChange={(event) => {
              setYear(event.target.value);
            }}
          >
            <option value="">Alle Jahre</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-32 space-y-1.5">
          <label
            htmlFor="payments-month-filter"
            className="text-sm text-muted-foreground"
          >
            Monat
          </label>
          <Select
            id="payments-month-filter"
            value={filterMonth ? String(filterMonth) : ""}
            disabled={!filterYear}
            onChange={(event) => {
              updateParam("month", event.target.value);
            }}
          >
            <option value="">Alle Monate</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {monthNameDe(month)}
              </option>
            ))}
          </Select>
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
              updateParam("depot", event.target.value);
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
              <TableHead className="text-right">Netto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
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
                  <TableCell className="text-right">
                    {payment.archived_at ? (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Reaktivieren"
                        onClick={() => void unarchivePayment.mutateAsync(payment.id)}
                      >
                        <RotateCcw />
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Archivieren"
                        onClick={() => {
                          setArchiveReason("");
                          setArchiveError(null);
                          setArchiveTargetId(payment.id);
                        }}
                      >
                        <ArchiveIcon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={archiveTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTargetId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eingang archivieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="payments-archive-reason">Grund (optional)</Label>
            <Input
              id="payments-archive-reason"
              value={archiveReason}
              onChange={(event) => {
                setArchiveReason(event.target.value);
              }}
            />
          </div>
          {archiveError && (
            <p role="alert" className="text-sm text-negative">
              {archiveError}
            </p>
          )}
          <DialogFooter>
            <Button variant="destructive" onClick={() => void handleArchive()}>
              Archivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
