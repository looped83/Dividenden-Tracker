import * as React from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Pencil,
  RotateCcw,
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
import { Select } from "@/components/ui/select";
import { EntitySelect, type EntityOption } from "@/components/domain/EntitySelect";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DateText } from "@/components/DateText";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useToast } from "@/components/ui/toast";
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
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";
import {
  parseSort,
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
import {
  compareToPreviousYear,
  type YearOverYearComparison,
} from "@/features/payments/yearOverYear";
import { YearOverYearIndicator } from "@/features/payments/YearOverYearIndicator";

type Row = {
  payment: PaymentListRow;
  effectiveDate: string;
  currency: ReturnType<typeof toCurrencyCode>;
} & SortableRow;

const PAGE_SIZE = 25;

export function PaymentsPage() {
  const { notify } = useToast();
  const { data: depots = [] } = useDepots();
  const { data: securities = [] } = useSecurities();

  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  // Mehrfachauswahl (§14): früh deklariert, damit Filteränderungen die Auswahl
  // zurücksetzen können.

  // --- URL-Zustand (§2/§4): Filter, Suche und Sortierung bleiben nach Reload,
  // Browser-Zurück/-Vorwärts erhalten. ---
  const depotId = searchParams.get("depot") ?? "";
  const securityId = searchParams.get("security") ?? "";
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");
  const status = parseStatus(searchParams.get("status"));
  const sort = parseSort(searchParams.get("sort"), searchParams.get("direction"));
  const filterYear =
    yearRaw && /^\d{4}$/.test(yearRaw) ? Number.parseInt(yearRaw, 10) : null;
  const filterMonth =
    monthRaw && /^(1[0-2]|[1-9])$/.test(monthRaw) ? Number.parseInt(monthRaw, 10) : null;

  const updateParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      setPage(1);
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
    status !== "active";

  const resetFilters = () => {
    updateParams({
      depot: null,
      security: null,
      year: null,
      month: null,
      status: null,
    });
  };

  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);

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
  const depotById = React.useMemo(() => new Map(depots.map((d) => [d.id, d])), [depots]);

  // Aktive zuerst, Archivierte darunter — als native Gruppen, damit die
  // Trennung auch auf mobilen Auswahlraedern und im Screenreader ankommt.
  const securityOptions = React.useMemo<EntityOption[]>(
    () => securities.map((s) => ({ id: s.id, name: s.name, archived: !!s.archived_at })),
    [securities],
  );
  const depotOptions = React.useMemo<EntityOption[]>(
    () => depots.map((d) => ({ id: d.id, name: d.name, archived: !!d.archived_at })),
    [depots],
  );

  // Wie viele Filter greifen — die Leiste zeigt es auch eingeklappt an.
  const activeFilterCount = [
    securityId,
    depotId,
    filterYear,
    filterMonth,
    status === "all" ? "status" : null,
  ].filter((value) => value !== null && value !== "").length;

  // Vergleich mit dem Vorjahr ueber den gesamten Bestand — nicht ueber die
  // gefilterte Liste: Ein Depot- oder Jahresfilter darf den Bezug nicht
  // verschieben.
  const yearOverYear = React.useMemo(
    () =>
      compareToPreviousYear(
        allPayments.map((payment) => ({
          id: payment.id,
          securityId: payment.security_id,
          effectiveDate: effectiveOf(payment),
          amount: Money.fromString(
            payment.net_amount,
            toCurrencyCode(depotById.get(payment.depot_id)?.base_currency ?? "EUR"),
          ),
          cancelled: Boolean(payment.archived_at),
        })),
      ),
    [allPayments, effectiveOf, depotById],
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

      const effectiveDate = effectiveOf(payment);
      if (filterYear && yearOf(effectiveDate) !== filterYear) continue;
      if (filterMonth && monthOf(effectiveDate) !== filterMonth) continue;

      const rel = (
        payment as unknown as { securities?: { name: string; ticker: string | null } }
      ).securities;
      const companyName = rel?.name ?? securityById.get(payment.security_id)?.name ?? "";
      const depot = depotById.get(payment.depot_id);
      const depotName = depot?.name ?? "";

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
    filterYear,
    filterMonth,
    effectiveOf,
    securityById,
    depotById,
    sort,
  ]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  // --- Einzelaktionen: Storno / Reaktivieren / Löschen. ---
  const archivePayment = useArchivePayment();
  const unarchivePayment = useUnarchivePayment();
  const deletePayment = useDeletePayment();
  // Reaktivieren laeuft ohne Bestaetigungsdialog — ohne Rueckmeldung bliebe
  // offen, ob es geklappt hat; ein Fehler ginge sogar voellig unter.
  const reactivate = async (id: string) => {
    try {
      await unarchivePayment.mutateAsync(id);
      notify("Dividendeneingang reaktiviert.");
    } catch (error) {
      notify(
        getErrorMessage(error, "Der Eingang konnte nicht reaktiviert werden."),
        "negative",
      );
    }
  };
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
      notify("Dividendeneingang storniert.");
    } catch (error) {
      setStornoError(
        getErrorMessage(error, "Der Dividendeneingang konnte nicht storniert werden."),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(deleteTarget.payment.id);
      setDeleteTarget(null);
      notify("Dividendeneingang dauerhaft gelöscht.");
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

  return (
    <div className="space-y-6">
      <PageHeader title="Dividenden" />

      {/* Filterleiste in der Optik des Statistikbereichs (geteiltes Primitive).
          Sortierrichtung als Symbolschalter statt langer Auswahltexte
          („Zahlungsdatum – neueste zuerst“), damit alles in eine Zeile passt. */}
      <FilterBar activeCount={activeFilterCount}>
        <FilterField id="f-security" label="Unternehmen">
          <EntitySelect
            id="f-security"
            options={securityOptions}
            value={securityId}
            onChange={(value) => {
              updateParams({ security: value });
            }}
            allLabel="Alle Unternehmen"
          />
        </FilterField>

        <FilterField id="f-depot" label="Depot">
          <EntitySelect
            id="f-depot"
            options={depotOptions}
            value={depotId}
            onChange={(value) => {
              updateParams({ depot: value });
            }}
            allLabel="Alle Depots"
          />
        </FilterField>

        <FilterField id="f-year" label="Jahr">
          <Select
            id="f-year"
            value={filterYear ? String(filterYear) : ""}
            onChange={(event) => {
              const value = event.target.value;
              updateParams(value ? { year: value } : { year: null, month: null });
            }}
          >
            <option value="">Alle Jahre</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField id="f-month" label="Monat">
          <Select
            id="f-month"
            value={filterMonth ? String(filterMonth) : ""}
            disabled={!filterYear}
            onChange={(event) => {
              updateParams({ month: event.target.value });
            }}
          >
            <option value="">Alle Monate</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthNameDe(m)}
              </option>
            ))}
          </Select>
        </FilterField>

        {/* Etwas breiter als die uebrigen Felder: Es traegt zusaetzlich den
            Richtungsschalter. Die Optionen benennen die Sortierung selbst
            („Nach Datum"), da die Beschriftung nur noch fuer Screenreader
            existiert. */}
        <FilterField id="f-sort" label="Sortierung" className="sm:basis-52">
          <div className="flex gap-2">
            <Select
              id="f-sort"
              value={sort.field}
              onChange={(event) => {
                updateParams({ sort: event.target.value, direction: sort.direction });
              }}
            >
              <option value="payment_date">Nach Datum</option>
              <option value="amount">Nach Betrag</option>
              <option value="company">Nach Unternehmen</option>
              <option value="depot">Nach Depot</option>
              <option value="updated">Nach Änderung</option>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={
                sort.direction === "desc"
                  ? "Absteigend sortiert — zu aufsteigend wechseln"
                  : "Aufsteigend sortiert — zu absteigend wechseln"
              }
              onClick={() => {
                updateParams({
                  sort: sort.field,
                  direction: sort.direction === "desc" ? "asc" : "desc",
                });
              }}
            >
              {sort.direction === "desc" ? <ArrowDown /> : <ArrowUp />}
            </Button>
          </div>
        </FilterField>

        {/* Zuruecksetzen steht wie im Statistikbereich **in** der Leiste, nicht
            darunter: Es gehoert zu den Filtern, nicht zur Liste. */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            onClick={resetFilters}
          >
            <X /> Filter zurücksetzen
          </Button>
        )}
      </FilterBar>

      {hasActiveFilters && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {formatCountNoun(rows.length, "Eingang", "Eingänge")} gefunden.
        </p>
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
          description="Passe die Filter an, um Dividendeneingänge zu sehen."
        />
      ) : (
        <>
          {/* Eine Darstellung statt zweier per CSS versteckter: Tabelle und
              Karten zeigen dieselben Zeilen, standen aber beide im DOM — jede
              Zeile wurde doppelt gerendert, samt doppelt gebauter
              Money-Objekte. */}
          {isWide ? (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zahlungsdatum</TableHead>
                    <TableHead>Unternehmen</TableHead>
                    <TableHead>Depot</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row) => (
                    <PaymentRow
                      key={row.id}
                      row={row}
                      comparison={yearOverYear.get(row.id)}
                      listUrl={listUrl}
                      onStorno={() => {
                        setStornoReason("");
                        setStornoError(null);
                        setStornoTarget(row);
                      }}
                      onReactivate={() => void reactivate(row.payment.id)}
                      onDelete={() => {
                        setDeleteError(null);
                        setDeleteTarget(row);
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <ul className="space-y-3">
              {pageRows.map((row) => (
                <PaymentCard
                  key={row.id}
                  row={row}
                  comparison={yearOverYear.get(row.id)}
                  listUrl={listUrl}
                  onStorno={() => {
                    setStornoReason("");
                    setStornoError(null);
                    setStornoTarget(row);
                  }}
                  onReactivate={() => void reactivate(row.payment.id)}
                  onDelete={() => {
                    setDeleteError(null);
                    setDeleteTarget(row);
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {!isLoading && rows.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span aria-live="polite">
            {formatCountNumber(pageStart + 1)}–
            {formatCountNumber(Math.min(pageStart + PAGE_SIZE, rows.length))} von{" "}
            {formatCountNumber(rows.length)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => {
                setPage((v) => Math.max(1, v - 1));
              }}
            >
              Zurück
            </Button>
            <span aria-hidden>
              Seite {formatCountNumber(currentPage)} / {formatCountNumber(pageCount)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => {
                setPage((v) => Math.min(pageCount, v + 1));
              }}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}

      {/* Seltener gebrauchte Nebenaktionen am Seitenende, abgesetzt durch eine
          Trennlinie (gleiches Muster wie bei den Unternehmen): oben bleibt die
          Primaeraktion, die Liste bestimmt den Rest. Stornierte sind sonst
          nirgends auffindbar — Reaktivieren geht nur aus dieser Liste oder per
          Direktlink. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={status === "all"}
            onChange={(event) => {
              updateParams({ status: event.target.checked ? "all" : null });
            }}
          />
          Stornierte anzeigen
        </label>
        <Button variant="outline" asChild>
          <Link to="/eingaenge/datenqualitaet">
            <ShieldCheck /> Datenqualität
          </Link>
        </Button>
      </div>

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

/** Aktiver Filter als Label mit eigener Entfernen-Schaltflaeche. */

interface RowActionProps {
  row: Row;
  comparison: YearOverYearComparison | undefined;
  listUrl: string;
  onStorno: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}

function PaymentRow({
  row,
  comparison,
  listUrl,
  onStorno,
  onReactivate,
  onDelete,
}: RowActionProps) {
  const { payment, effectiveDate, companyName, depotName, currency } = row;
  const shifted = effectiveDate !== payment.pay_date;
  const cancelled = Boolean(payment.archived_at);
  return (
    <TableRow>
      <TableCell>
        {formatDate(effectiveDate)}
        {shifted && (
          <span
            className="block text-xs text-muted-foreground"
            title="Tatsächliches Zahlungsdatum"
          >
            tatsächlich {formatDate(payment.pay_date)}
          </span>
        )}
      </TableCell>
      <TableCell className="font-medium">
        {/* Das Unternehmen fuehrt zur Detailansicht — es benennt den Eingang,
            das Datum tut das nicht. */}
        <Link
          to={`/eingaenge/${payment.id}`}
          className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {companyName || "—"}
        </Link>
        {/* Ohne die Statusspalte waeren stornierte Zeilen sonst nicht mehr von
            aktiven zu unterscheiden, sobald „Stornierte anzeigen" aktiv ist. */}
        {cancelled && (
          <Badge variant="warning" className="ml-2 align-middle">
            Storniert
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{depotName || "—"}</TableCell>
      <TableCell className="text-right">
        {/* Der Indikator steht links des Betrags, damit die Ziffern der Spalte
            buendig bleiben. */}
        <span className="inline-flex items-center justify-end gap-1.5">
          {comparison && <YearOverYearIndicator comparison={comparison} />}
          <AmountText amount={Money.fromString(payment.net_amount, currency)} />
        </span>
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
  comparison,
  listUrl,
  onStorno,
  onReactivate,
  onDelete,
}: RowActionProps) {
  const { payment, effectiveDate, companyName, currency } = row;
  const cancelled = Boolean(payment.archived_at);
  // Zwei Zeilen statt vier: Betrag neben dem Namen, Aktionen neben dem Datum.
  // Die Aktionen tragen dieselben Symbole und Namen wie in der Tabelle —
  // beschriftet nur fuer Hilfsmittel, da drei Wortschaltflaechen die Karte um
  // eine ganze Zeile verlaengerten. Alle Abstaende folgen einem Raster: 12px
  // Kachelrand (= Abstand zwischen den Karten), 8px zwischen den Zeilen und
  // zwischen den Elementen einer Zeile.
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          to={`/eingaenge/${payment.id}`}
          className="min-w-0 truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {companyName || "—"}
        </Link>
        {/* Der Betrag ist die Kernaussage der Karte und traegt deshalb mehr
            Gewicht als der Name. Der Indikator steht wie in der Tabelle links
            davon. */}
        <span className="flex shrink-0 items-center gap-1.5">
          {comparison && <YearOverYearIndicator comparison={comparison} />}
          <AmountText
            amount={Money.fromString(payment.net_amount, currency)}
            className="text-lg font-semibold"
          />
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {/* Ohne Depot: Wer die Liste nach Depot filtert oder nur eines
            fuehrt, gewinnt daraus nichts. Die Detailansicht nennt es. */}
        <div className="flex min-w-0 items-center gap-2">
          <DateText className="text-sm text-muted-foreground">
            {formatDate(effectiveDate)}
          </DateText>
          {cancelled && (
            <Badge variant="warning" className="shrink-0">
              Storniert
            </Badge>
          )}
        </div>
        {/* Die negativen Raender holen die Luft zurueck, die in den 44px-Touch-
            zielen ohnehin steckt: Die Schaltflaechenzeile misst optisch so viel
            wie die Textzeile daneben, oben und unten bleibt derselbe
            Kachelrand. */}
        <div className="-my-2 -mr-2 flex shrink-0 items-center gap-1">
          {cancelled ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reaktivieren"
              onClick={onReactivate}
            >
              <RotateCcw />
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="icon" aria-label="Bearbeiten" asChild>
                <Link
                  to={`/eingaenge/${payment.id}/bearbeiten`}
                  state={{ from: listUrl }}
                >
                  <Pencil />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Stornieren"
                onClick={onStorno}
              >
                <Ban />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dauerhaft löschen"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}
