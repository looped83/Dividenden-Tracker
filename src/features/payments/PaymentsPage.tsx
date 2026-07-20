import * as React from "react";
import { Link, useSearchParams } from "react-router";
import {
  Ban,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  effectivePayDate,
  monthNameDe,
  monthOf,
  normalizePayoutMonths,
  yearOf,
} from "@/lib/statistics";
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
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  useAllPayments,
  useArchivePayment,
  useDeletePayment,
  useUnarchivePayment,
} from "@/features/payments/hooks";
import type { DividendPayment } from "@/lib/supabase/repositories/payments";
import {
  normalizeSearch,
  parseSort,
  parseSource,
  parseStatus,
  statusNeedsArchived,
} from "@/features/payments/listParams";
import { sortRows, type SortableRow } from "@/features/payments/sortRows";
import { formatDate, sourceLabel } from "@/features/payments/paymentDisplay";
import {
  DeleteDialog,
  StornoDialog,
  type PaymentSummaryData,
} from "@/features/payments/dialogs";
import { BulkBar } from "@/features/payments/BulkBar";

type Row = {
  payment: DividendPayment;
  effectiveDate: string;
  currency: ReturnType<typeof toCurrencyCode>;
} & SortableRow;

const PAGE_SIZE = 25;

export function PaymentsPage() {
  const { data: depots = [] } = useDepots();
  const { data: securities = [] } = useSecurities();

  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState(searchParams.get("q") ?? "");
  // Mehrfachauswahl (§14): früh deklariert, damit Filteränderungen die Auswahl
  // zurücksetzen können.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // --- URL-Zustand (§2/§4): Filter, Suche und Sortierung bleiben nach Reload,
  // Browser-Zurück/-Vorwärts erhalten. ---
  const depotId = searchParams.get("depot") ?? "";
  const securityId = searchParams.get("security") ?? "";
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");
  const status = parseStatus(searchParams.get("status"));
  const sourceFilter = parseSource(searchParams.get("source"));
  const sort = parseSort(searchParams.get("sort"), searchParams.get("direction"));
  const searchTerm = normalizeSearch(searchParams.get("q"));
  const filterYear =
    yearRaw && /^\d{4}$/.test(yearRaw) ? Number.parseInt(yearRaw, 10) : null;
  const filterMonth =
    monthRaw && /^(1[0-2]|[1-9])$/.test(monthRaw) ? Number.parseInt(monthRaw, 10) : null;

  const updateParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      setPage(1);
      setSelected(new Set());
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value) params.set(key, value);
          else params.delete(key);
        }
        return params;
      });
    },
    [setSearchParams],
  );

  const hasActiveFilters =
    depotId !== "" ||
    securityId !== "" ||
    filterYear !== null ||
    filterMonth !== null ||
    searchTerm !== "" ||
    status !== "active" ||
    sourceFilter !== "all";

  const resetFilters = () => {
    setSearchInput("");
    updateParams({
      depot: null,
      security: null,
      year: null,
      month: null,
      status: null,
      source: null,
      q: null,
    });
  };

  const { data: allPayments = [], isLoading } = useAllPayments(
    statusNeedsArchived(status),
  );

  // Ausschüttungsplan je Unternehmen → effektiver Monat je Zahlung (§10).
  const payoutBySecurity = React.useMemo(() => {
    const map = new Map<string, number[]>();
    for (const security of securities) {
      const months = normalizePayoutMonths(security.payout_months);
      if (months.length > 0) map.set(security.id, months);
    }
    return map;
  }, [securities]);
  const effectiveOf = React.useCallback(
    (payment: { pay_date: string; security_id: string }) =>
      effectivePayDate(payment.pay_date, payoutBySecurity.get(payment.security_id)),
    [payoutBySecurity],
  );

  const securityById = React.useMemo(
    () => new Map(securities.map((s) => [s.id, s])),
    [securities],
  );
  const depotById = React.useMemo(
    () => new Map(depots.map((d) => [d.id, d])),
    [depots],
  );

  const years = React.useMemo(() => {
    const set = new Set<number>();
    for (const payment of allPayments) set.add(yearOf(effectiveOf(payment)));
    return [...set].sort((a, b) => b - a);
  }, [allPayments, effectiveOf]);

  // --- Filtern → in sortierbare Zeilen abbilden → sortieren (§2/§3/§4). ---
  const rows = React.useMemo<Row[]>(() => {
    const mapped: Row[] = [];
    for (const payment of allPayments) {
      const isCancelled = Boolean(payment.archived_at);
      if (status === "active" && isCancelled) continue;
      if (status === "cancelled" && !isCancelled) continue;

      if (depotId && payment.depot_id !== depotId) continue;
      if (securityId && payment.security_id !== securityId) continue;
      if (sourceFilter !== "all" && payment.source !== sourceFilter) continue;

      const effectiveDate = effectiveOf(payment);
      if (filterYear && yearOf(effectiveDate) !== filterYear) continue;
      if (filterMonth && monthOf(effectiveDate) !== filterMonth) continue;

      const rel = (
        payment as unknown as { securities?: { name: string; ticker: string | null } }
      ).securities;
      const companyName = rel?.name ?? securityById.get(payment.security_id)?.name ?? "";
      const depot = depotById.get(payment.depot_id);
      const depotName = depot?.name ?? "";

      if (searchTerm) {
        const haystack = [
          companyName,
          rel?.ticker ?? "",
          payment.note ?? "",
          depotName,
          payment.source_file_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchTerm)) continue;
      }

      mapped.push({
        payment,
        effectiveDate,
        currency: toCurrencyCode(depot?.base_currency ?? "EUR"),
        id: payment.id,
        netAmount: payment.net_amount,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
        companyName,
        depotName,
      });
    }
    return sortRows(mapped, sort);
  }, [
    allPayments,
    status,
    depotId,
    securityId,
    sourceFilter,
    filterYear,
    filterMonth,
    searchTerm,
    effectiveOf,
    securityById,
    depotById,
    sort,
  ]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  // --- Mehrfachauswahl (§14). ---
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOnPage = pageRows.every((r) => next.has(r.id));
      for (const r of pageRows) {
        if (allOnPage) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  };
  const selectAllFiltered = () => {
    setSelected(new Set(rows.map((r) => r.id)));
  };
  const clearSelection = () => { setSelected(new Set()); };
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const selectedRows = rows.filter((r) => selected.has(r.id));

  // --- Einzelaktionen: Storno / Reaktivieren / Löschen. ---
  const archivePayment = useArchivePayment();
  const unarchivePayment = useUnarchivePayment();
  const deletePayment = useDeletePayment();
  const [stornoTarget, setStornoTarget] = React.useState<Row | null>(null);
  const [stornoReason, setStornoReason] = React.useState("");
  const [stornoError, setStornoError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Row | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const summaryOf = (row: Row): PaymentSummaryData => {
    const currency = toCurrencyCode(
      depotById.get(row.payment.depot_id)?.base_currency ?? "EUR",
    );
    return {
      company: row.companyName || "—",
      depot: row.depotName || "—",
      payDate: row.payment.pay_date,
      amount: <AmountText amount={Money.fromString(row.payment.net_amount, currency)} />,
      source: sourceLabel(row.payment.source),
    };
  };

  const handleStorno = async () => {
    if (!stornoTarget) return;
    setStornoError(null);
    try {
      await archivePayment.mutateAsync({
        id: stornoTarget.payment.id,
        reason: stornoReason || undefined,
      });
      setStornoTarget(null);
      setStornoReason("");
    } catch (error) {
      setStornoError(getErrorMessage(error, "Der Dividendeneingang konnte nicht storniert werden."));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(deleteTarget.payment.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.payment.id);
        return next;
      });
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        getErrorMessage(
          error,
          "Der Dividendeneingang konnte nicht gelöscht werden. Die Daten wurden nicht verändert.",
        ),
      );
    }
  };

  const listSearch = searchParams.toString();
  const listUrl = listSearch ? `/eingaenge?${listSearch}` : "/eingaenge";

  const sortValue = `${sort.field}:${sort.direction}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Dividenden</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/eingaenge/datenqualitaet">
              <ShieldCheck /> Datenqualität
            </Link>
          </Button>
          <Button asChild>
            <Link to="/eingaenge/neu" state={{ from: listUrl }}>
              <Plus /> Neue Dividende
            </Link>
          </Button>
        </div>
      </div>

      {/* Suche */}
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          updateParams({ q: searchInput.trim() || null });
        }}
        className="relative"
      >
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          className="pl-9"
          placeholder="Unternehmen, Depot, Notiz oder Importdatei suchen …"
          aria-label="Dividendeneingänge durchsuchen"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
          }}
          onBlur={() => { updateParams({ q: searchInput.trim() || null }); }}
        />
      </form>

      {/* Filter- und Sortierleiste */}
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          id="f-security"
          label="Unternehmen"
          value={securityId}
          onChange={(value) => { updateParams({ security: value }); }}
        >
          <option value="">Alle Unternehmen</option>
          {securities.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.archived_at ? " (archiviert)" : ""}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id="f-depot"
          label="Depot"
          value={depotId}
          onChange={(value) => { updateParams({ depot: value }); }}
        >
          <option value="">Alle Depots</option>
          {depots.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.archived_at ? " (archiviert)" : ""}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id="f-year"
          label="Jahr"
          value={filterYear ? String(filterYear) : ""}
          onChange={(value) =>
            { updateParams(value ? { year: value } : { year: null, month: null }); }
          }
        >
          <option value="">Alle Jahre</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id="f-month"
          label="Monat"
          value={filterMonth ? String(filterMonth) : ""}
          disabled={!filterYear}
          onChange={(value) => { updateParams({ month: value }); }}
        >
          <option value="">Alle Monate</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {monthNameDe(m)}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id="f-status"
          label="Status"
          value={status}
          onChange={(value) => { updateParams({ status: value === "active" ? null : value }); }}
        >
          <option value="active">Aktiv</option>
          <option value="cancelled">Storniert</option>
          <option value="all">Alle</option>
        </FilterSelect>

        <FilterSelect
          id="f-source"
          label="Datenquelle"
          value={sourceFilter}
          onChange={(value) => { updateParams({ source: value === "all" ? null : value }); }}
        >
          <option value="all">Alle Quellen</option>
          <option value="manual">Manuell</option>
          <option value="csv_import">CSV-Import</option>
          <option value="excel_import">Excel-Import</option>
        </FilterSelect>

        <FilterSelect
          id="f-sort"
          label="Sortierung"
          value={sortValue}
          onChange={(value) => {
            const [field, direction] = value.split(":");
            updateParams({ sort: field, direction });
          }}
        >
          <option value="payment_date:desc">Zahlungsdatum – neueste zuerst</option>
          <option value="payment_date:asc">Zahlungsdatum – älteste zuerst</option>
          <option value="amount:desc">Betrag – höchste zuerst</option>
          <option value="amount:asc">Betrag – niedrigste zuerst</option>
          <option value="company:asc">Unternehmen A–Z</option>
          <option value="depot:asc">Depot A–Z</option>
          <option value="updated:desc">Zuletzt geändert</option>
        </FilterSelect>

        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            <X /> Filter zurücksetzen
          </Button>
        )}
      </div>

      {hasActiveFilters && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Aktive Filter aktiv — {rows.length}{" "}
          {rows.length === 1 ? "Eingang" : "Eingänge"} gefunden.
        </p>
      )}

      {/* Massenaktionsleiste */}
      {selected.size > 0 && (
        <BulkBar
          selectedRows={selectedRows}
          totalFiltered={rows.length}
          onSelectAllFiltered={selectAllFiltered}
          onClear={clearSelection}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : allPayments.length === 0 && !hasActiveFilters ? (
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
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Keine Eingänge für die aktuelle Auswahl"
          description="Passe Suche, Filter oder Sortierung an, um Dividendeneingänge zu sehen."
        />
      ) : (
        <>
          {/* Desktop-Tabelle */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label="Diese Seite auswählen"
                      checked={pageAllSelected}
                      onChange={selectPage}
                    />
                  </TableHead>
                  <TableHead>Zahlungsdatum</TableHead>
                  <TableHead>Unternehmen</TableHead>
                  <TableHead>Depot</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead>Quelle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <PaymentRow
                    key={row.id}
                    row={row}
                    selected={selected.has(row.id)}
                    onToggle={() => { toggleSelected(row.id); }}
                    listUrl={listUrl}
                    onStorno={() => {
                      setStornoReason("");
                      setStornoError(null);
                      setStornoTarget(row);
                    }}
                    onReactivate={() => void unarchivePayment.mutateAsync(row.payment.id)}
                    onDelete={() => {
                      setDeleteError(null);
                      setDeleteTarget(row);
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Karten */}
          <ul className="space-y-3 md:hidden">
            {pageRows.map((row) => (
              <PaymentCard
                key={row.id}
                row={row}
                selected={selected.has(row.id)}
                onToggle={() => { toggleSelected(row.id); }}
                listUrl={listUrl}
                onStorno={() => {
                  setStornoReason("");
                  setStornoError(null);
                  setStornoTarget(row);
                }}
                onReactivate={() => void unarchivePayment.mutateAsync(row.payment.id)}
                onDelete={() => {
                  setDeleteError(null);
                  setDeleteTarget(row);
                }}
              />
            ))}
          </ul>
        </>
      )}

      {!isLoading && rows.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span aria-live="polite">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, rows.length)} von {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => { setPage((v) => Math.max(1, v - 1)); }}
            >
              Zurück
            </Button>
            <span aria-hidden>
              Seite {currentPage} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => { setPage((v) => Math.min(pageCount, v + 1)); }}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}

      <StornoDialog
        open={stornoTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStornoTarget(null);
        }}
        summary={stornoTarget ? summaryOf(stornoTarget) : null}
        reason={stornoReason}
        onReasonChange={setStornoReason}
        error={stornoError}
        isPending={archivePayment.isPending}
        onConfirm={() => void handleStorno()}
      />

      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        summary={deleteTarget ? summaryOf(deleteTarget) : null}
        error={deleteError}
        isPending={deletePayment.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-36 space-y-1.5">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.value); }}
      >
        {children}
      </Select>
    </div>
  );
}

function StatusBadge({ cancelled }: { cancelled: boolean }) {
  return cancelled ? (
    <Badge variant="warning">Storniert</Badge>
  ) : (
    <Badge variant="positive">Aktiv</Badge>
  );
}

interface RowActionProps {
  row: Row;
  selected: boolean;
  onToggle: () => void;
  listUrl: string;
  onStorno: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}

function PaymentRow({
  row,
  selected,
  onToggle,
  listUrl,
  onStorno,
  onReactivate,
  onDelete,
}: RowActionProps) {
  const { payment, effectiveDate, companyName, depotName, currency } = row;
  const shifted = effectiveDate !== payment.pay_date;
  const cancelled = Boolean(payment.archived_at);
  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <input
          type="checkbox"
          className="size-4"
          aria-label={`${companyName} auswählen`}
          checked={selected}
          onChange={onToggle}
        />
      </TableCell>
      <TableCell>
        <Link to={`/eingaenge/${payment.id}`} className="hover:underline">
          {formatDate(effectiveDate)}
        </Link>
        {shifted && (
          <span
            className="block text-xs text-muted-foreground"
            title="Tatsächliches Zahlungsdatum"
          >
            tatsächlich {formatDate(payment.pay_date)}
          </span>
        )}
      </TableCell>
      <TableCell className="font-medium">{companyName || "—"}</TableCell>
      <TableCell className="text-muted-foreground">{depotName || "—"}</TableCell>
      <TableCell className="text-right">
        <AmountText amount={Money.fromString(payment.net_amount, currency)} />
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {sourceLabel(payment.source)}
      </TableCell>
      <TableCell>
        <StatusBadge cancelled={cancelled} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {cancelled ? (
            <Button
              variant="outline"
              size="icon"
              aria-label="Reaktivieren"
              onClick={onReactivate}
            >
              <RotateCcw />
            </Button>
          ) : (
            <>
              <Button variant="outline" size="icon" aria-label="Bearbeiten" asChild>
                <Link
                  to={`/eingaenge/${payment.id}/bearbeiten`}
                  state={{ from: listUrl }}
                >
                  <Pencil />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Stornieren"
                onClick={onStorno}
              >
                <Ban />
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Dauerhaft löschen"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PaymentCard({
  row,
  selected,
  onToggle,
  listUrl,
  onStorno,
  onReactivate,
  onDelete,
}: RowActionProps) {
  const { payment, effectiveDate, companyName, depotName, currency } = row;
  const cancelled = Boolean(payment.archived_at);
  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4"
          aria-label={`${companyName} auswählen`}
          checked={selected}
          onChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/eingaenge/${payment.id}`}
              className="font-medium hover:underline"
            >
              {companyName || "—"}
            </Link>
            <AmountText amount={Money.fromString(payment.net_amount, currency)} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(effectiveDate)} · {depotName || "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge cancelled={cancelled} />
            <Badge variant="neutral">{sourceLabel(payment.source)}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {cancelled ? (
              <Button variant="outline" size="sm" onClick={onReactivate}>
                <RotateCcw /> Reaktivieren
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to={`/eingaenge/${payment.id}/bearbeiten`}
                    state={{ from: listUrl }}
                  >
                    <Pencil /> Bearbeiten
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={onStorno}>
                  <Ban /> Stornieren
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 /> Löschen
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
