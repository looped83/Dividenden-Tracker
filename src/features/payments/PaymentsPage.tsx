import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { Ban, Pencil, RotateCcw, ShieldCheck, Trash2, Wallet } from "lucide-react";
import {
  effectivePayDate,
  monthNameDe,
  monthOf,
  payoutMonthsBySecurity,
  yearOf,
} from "@/lib/statistics";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EntitySelect, type EntityOption } from "@/components/domain/EntitySelect";
import {
  FilterBar,
  FilterField,
  FilterReset,
  FilterSort,
  FilterToggle,
  useFilterDisclosure,
  type FilterSortOption,
} from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListSection } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AmountText } from "@/components/money/AmountText";
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
  parsePage,
  parseSort,
  parseStatus,
  statusNeedsArchived,
} from "@/features/payments/listParams";
import { sortRows, type SortableRow } from "@/features/payments/sortRows";
import { sourceLabel } from "@/features/payments/paymentDisplay";
import { formatCalendarDate } from "@/lib/utils/formatDate";
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
import { PaymentListItem } from "@/features/payments/PaymentListItem";
import { groupByMonth, monthTotals, totalOrNull } from "@/features/payments/monthGroups";
import { usePaymentComposer } from "@/features/payments/PaymentComposer";

type Row = {
  payment: PaymentListRow;
  effectiveDate: string;
} & SortableRow;

const PAGE_SIZE = 25;

// Auf Modulebene, damit die Referenzen stabil bleiben (Abhaengigkeiten der
// Memos unten).
const amountOf = (row: Row): Money => row.amount;
const effectiveDateOf = (row: Row): string => row.effectiveDate;

/** Sortierkriterien der Liste — dieselbe Benennung wie in der Unternehmensliste. */
const SORT_OPTIONS: readonly FilterSortOption[] = [
  { value: "payment_date", label: "Nach Datum" },
  { value: "amount", label: "Nach Betrag" },
  { value: "company", label: "Nach Asset" },
  { value: "depot", label: "Nach Depot" },
  { value: "updated", label: "Nach Änderung" },
];

export function PaymentsPage() {
  const { notify } = useToast();
  const newPayment = usePaymentComposer();
  const { data: depots = [] } = useDepots();
  const { data: securities = [], isLoading: securitiesLoading } = useSecurities();

  const [searchParams, setSearchParams] = useSearchParams();

  // --- URL-Zustand (§2/§4): Filter, Sortierung und Seite bleiben nach Reload,
  // Browser-Zurück/-Vorwärts und dem Weg über einen Eingang zurück erhalten. ---
  const depotId = searchParams.get("depot") ?? "";
  const securityId = searchParams.get("security") ?? "";
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");
  const status = parseStatus(searchParams.get("status"));
  const sort = parseSort(searchParams.get("sort"), searchParams.get("direction"));
  const page = parsePage(searchParams.get("page"));
  const filterYear =
    yearRaw && /^\d{4}$/.test(yearRaw) ? Number.parseInt(yearRaw, 10) : null;
  const filterMonth =
    monthRaw && /^(1[0-2]|[1-9])$/.test(monthRaw) ? Number.parseInt(monthRaw, 10) : null;

  const setParams = React.useCallback(
    (updates: Record<string, string | null>, options?: { replace: boolean }) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value) params.set(key, value);
          else params.delete(key);
        }
        return params;
      }, options);
    },
    [setSearchParams],
  );

  // Jede Filter- oder Sortieränderung zeigt wieder die ersten Eingänge.
  const updateParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      setParams({ ...updates, page: null });
    },
    [setParams],
  );

  // „Mehr laden" haengt die naechsten Eingaenge an, statt die Seite zu
  // wechseln: Man bleibt im Lesefluss, und eine Monatsgruppe reisst nicht an
  // einer Seitengrenze ab. Wie viel geladen ist, steht in der Adresse — der
  // Weg zurueck von einem Eingang findet dieselbe Liste samt Position wieder.
  // Ersetzt statt angehaengt: „Zurück" im Browser soll die vorige Seite
  // oeffnen, nicht die Liste Schritt fuer Schritt wieder kuerzen.
  const loadMore = () => {
    setParams({ page: String(page + 1) }, { replace: true });
  };

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

  const { data: allPayments = [], isLoading: paymentsLoading } = useAllPayments();
  // Die Namen der Unternehmen kommen aus den Stammdaten, nicht aus der
  // Zahlungsabfrage — ohne sie waeren Spalte und Sortierung „Asset" leer.
  const isLoading = paymentsLoading || securitiesLoading;

  // Geladen werden immer alle Zeilen; was der Statusfilter ausblendet, zaehlt
  // auch fuer Jahresauswahl und Leerzustand nicht.
  const statusPayments = React.useMemo(
    () =>
      statusNeedsArchived(status)
        ? allPayments
        : allPayments.filter((payment) => !payment.archived_at),
    [allPayments, status],
  );

  // Ausschüttungsplan je Unternehmen → effektiver Monat je Zahlung (§10).
  const payoutBySecurity = React.useMemo(
    () => payoutMonthsBySecurity(securities),
    [securities],
  );
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
    status === "active" ? null : status,
  ].filter((value) => value !== null && value !== "").length;
  const filterDisclosure = useFilterDisclosure(activeFilterCount);

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
    for (const payment of statusPayments) set.add(yearOf(effectiveOf(payment)));
    return [...set].sort((a, b) => b - a);
  }, [statusPayments, effectiveOf]);

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

      const companyName = securityById.get(payment.security_id)?.name ?? "";
      const depot = depotById.get(payment.depot_id);
      const depotName = depot?.name ?? "";

      mapped.push({
        payment,
        effectiveDate,
        id: payment.id,
        // Einmal geparst, fuer Sortierung, Summen und alle Darstellungen.
        amount: Money.fromString(
          payment.net_amount,
          toCurrencyCode(depot?.base_currency ?? "EUR"),
        ),
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

  const visibleRows = rows.slice(0, page * PAGE_SIZE);
  const remaining = rows.length - visibleRows.length;

  // Anzahl und Summe der Auswahl — die Frage hinter fast jedem Filter („wie
  // viel kam von …?"). Ueber verschiedene Waehrungen wird nicht addiert.
  const total = React.useMemo(() => totalOrNull(rows.map(amountOf)), [rows]);

  // Nach Datum sortiert gruppiert die Liste nach Monat, mit der Monatssumme im
  // Kopf — ueber alle Eingaenge des Monats, nicht nur die bereits geladenen.
  const groupedByMonth = sort.field === "payment_date";
  const totalsByMonth = React.useMemo(
    () => (groupedByMonth ? monthTotals(rows, effectiveDateOf, amountOf) : null),
    [groupedByMonth, rows],
  );

  // --- Einzelaktionen: Storno / Reaktivieren / Löschen. ---
  const archivePayment = useArchivePayment();
  const unarchivePayment = useUnarchivePayment();
  const deletePayment = useDeletePayment();
  // Reaktivieren laeuft ohne Bestaetigungsdialog — ohne Rueckmeldung bliebe
  // offen, ob es geklappt hat; ein Fehler ginge sogar voellig unter.
  const reactivate = async (id: string) => {
    try {
      await unarchivePayment.mutateAsync(id);
      notify("Dividende reaktiviert.");
    } catch (error) {
      notify(
        getErrorMessage(error, "Die Dividende konnte nicht reaktiviert werden."),
        "negative",
      );
    }
  };
  const [stornoTarget, setStornoTarget] = React.useState<Row | null>(null);
  const [stornoError, setStornoError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Row | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const summaryOf = (row: Row): PaymentSummaryData => ({
    company: row.companyName || "—",
    depot: row.depotName || "—",
    payDate: row.payment.pay_date,
    amount: <AmountText amount={row.amount} />,
    source: sourceLabel(row.payment.source),
  });

  const handleStorno = async (stornoReason: string) => {
    if (!stornoTarget) return;
    setStornoError(null);
    try {
      await archivePayment.mutateAsync({
        id: stornoTarget.payment.id,
        reason: stornoReason || undefined,
      });
      setStornoTarget(null);
      notify("Dividende storniert.");
    } catch (error) {
      setStornoError(
        getErrorMessage(error, "Die Dividende konnte nicht storniert werden."),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(deleteTarget.payment.id);
      setDeleteTarget(null);
      notify("Dividende dauerhaft gelöscht.");
    } catch (error) {
      setDeleteError(
        getErrorMessage(
          error,
          "Die Dividende konnte nicht gelöscht werden. Die Daten wurden nicht verändert.",
        ),
      );
    }
  };

  const listSearch = searchParams.toString();
  const listUrl = listSearch ? `/eingaenge?${listSearch}` : "/eingaenge";

  return (
    <div className="space-y-6">
      {/* Erfassen steht in der Navigation (Seitenleiste bzw. Bottom-
          Navigation) und damit auf jeder Seite an derselben Stelle — wie auf
          der Uebersicht traegt der Kopf nur, was allein diese Seite betrifft. */}
      <PageHeader
        title="Dividenden"
        actions={
          <>
            {/* Auf dem Telefon steht der Filter rechts im Kopf — dort, wo auf
                der Uebersicht die Jahresauswahl steht. */}
            <FilterToggle disclosure={filterDisclosure} />
            {/* Die Pruefung der Daten gehoert zur Liste, steht aber nicht in
                ihrem Weg: oben als Symbol, ab `md` beschriftet. Zuvor lag sie
                am Seitenende, hinter allen Eingaengen. */}
            <Button variant="outline" asChild className="w-11 px-0 md:w-auto md:px-4">
              <Link to="/eingaenge/datenqualitaet" aria-label="Datenqualität">
                <ShieldCheck />
                <span className="hidden md:inline">Datenqualität</span>
              </Link>
            </Button>
          </>
        }
      />

      {/* Filterleiste in der Optik des Statistikbereichs (geteiltes Primitive).
          Sortierrichtung als Symbolschalter statt langer Auswahltexte
          („Zahlungsdatum – neueste zuerst“), damit alles in eine Zeile passt. */}
      <FilterBar disclosure={filterDisclosure}>
        <FilterField id="f-security" label="Asset">
          <EntitySelect
            id="f-security"
            options={securityOptions}
            value={securityId}
            onChange={(value) => {
              updateParams({ security: value });
            }}
            allLabel="Alle Assets"
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

        {/* Stornierte sind ein Filter wie jeder andere und stehen deshalb in
            der Leiste — nicht mehr als Kontrollkaestchen unter 25 Eingaengen
            und dem Blaettern am Seitenende. */}
        <FilterField id="f-status" label="Status">
          <Select
            id="f-status"
            value={status === "active" ? "" : status}
            onChange={(event) => {
              updateParams({ status: event.target.value || null });
            }}
          >
            <option value="">Ohne Stornierte</option>
            <option value="all">Mit Stornierten</option>
            <option value="cancelled">Nur Stornierte</option>
          </Select>
        </FilterField>

        {/* Die Optionen benennen die Sortierung selbst („Nach Datum"), da die
            Beschriftung nur noch fuer Screenreader existiert. */}
        <FilterSort
          id="f-sort"
          value={sort.field}
          direction={sort.direction}
          options={SORT_OPTIONS}
          onValueChange={(value) => {
            updateParams({ sort: value, direction: sort.direction });
          }}
          onDirectionChange={(direction) => {
            updateParams({ sort: sort.field, direction });
          }}
        />

        {/* Zuruecksetzen steht wie im Statistikbereich **in** der Leiste, nicht
            darunter: Es gehoert zu den Filtern, nicht zur Liste. */}
        {hasActiveFilters && <FilterReset onClick={resetFilters} />}
      </FilterBar>

      {!isLoading && rows.length > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {formatCountNoun(rows.length, "Dividende", "Dividenden")}
          {total && (
            <>
              {" · "}
              <AmountText amount={total} className="font-medium text-foreground" />
            </>
          )}
        </p>
      )}

      {isLoading ? (
        <SkeletonRows rows={8} label="Dividenden" />
      ) : statusPayments.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={Wallet}
          title="Noch keine Dividende erfasst"
          description="Erfasse deine erste Dividende."
          action={
            <Button aria-haspopup="dialog" {...newPayment}>
              Erste Dividende erfassen
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Keine Dividenden für die aktuelle Auswahl"
          description="Passe die Filter an, um Dividenden zu sehen."
        />
      ) : (
        <>
          {/* Eine Darstellung statt zweier per CSS versteckter: Tabelle und
              Liste zeigen dieselben Zeilen, standen aber beide im DOM — jede
              Zeile wurde doppelt gerendert, samt doppelt gebauter
              Money-Objekte. */}
          {isWide ? (
            // Schrift wie die Listen der Uebersicht (15px statt 14px): Die
            // Tabelle ist hier die Liste der Eingaenge, keine dichte Auswertung.
            <Table className="text-[0.9375rem]">
              {/* Spaltenkoepfe nur fuer Hilfsmittel: Datum, Name, Depot und
                  Betrag erklaeren sich wie in den Listen der Uebersicht selbst,
                  sortiert wird ueber die Filterleiste. Sichtbar gliedern die
                  Monate. */}
              <TableHeader className="sr-only">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Zahlungsdatum</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Depot</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              {/* Keine Linie unter der letzten Zeile eines Monats — wie in den
                  Listen trennt der Abstand zur naechsten Ueberschrift. */}
              <TableBody className="[&_tr:has(+tr[data-month])]:border-0">
                {/* Nach Datum sortiert gruppiert auch die Tabelle nach Monat —
                    mit derselben Monatsueberschrift und -summe wie die Liste
                    auf dem Telefon. */}
                {(groupedByMonth
                  ? groupByMonth(visibleRows, effectiveDateOf)
                  : [{ key: "", year: 0, month: 0, rows: visibleRows }]
                ).map((group) => {
                  const monthTotal = totalsByMonth?.get(group.key);
                  return (
                    <React.Fragment key={group.key}>
                      {groupedByMonth && (
                        <TableRow
                          data-month
                          className="group/month border-0 hover:bg-transparent"
                        >
                          <th
                            scope="colgroup"
                            colSpan={3}
                            className="pb-2 pt-10 text-left text-[1.1875rem] font-bold leading-tight tracking-[-0.015em] group-first/month:pt-2"
                          >
                            {monthNameDe(group.month)} {group.year}
                          </th>
                          <td className="px-3 pb-2 pt-10 text-right text-[0.9375rem] font-medium text-muted-foreground tabular-amount group-first/month:pt-2">
                            {monthTotal && <AmountText amount={monthTotal} />}
                          </td>
                          <td aria-hidden />
                        </TableRow>
                      )}
                      {group.rows.map((row) => (
                        <PaymentRow
                          key={row.id}
                          row={row}
                          comparison={yearOverYear.get(row.id)}
                          listUrl={listUrl}
                          onStorno={() => {
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
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          ) : groupedByMonth ? (
            <div className="space-y-10">
              {groupByMonth(visibleRows, effectiveDateOf).map((group) => {
                const monthTotal = totalsByMonth?.get(group.key);
                return (
                  <ListSection
                    key={group.key}
                    title={`${monthNameDe(group.month)} ${String(group.year)}`}
                    aside={monthTotal ? <AmountText amount={monthTotal} /> : undefined}
                  >
                    <ListGroup>
                      {group.rows.map((row) => (
                        <PaymentItem
                          key={row.id}
                          row={row}
                          comparison={yearOverYear.get(row.id)}
                          listUrl={listUrl}
                          dayOnly
                        />
                      ))}
                    </ListGroup>
                  </ListSection>
                );
              })}
            </div>
          ) : (
            <ListGroup>
              {visibleRows.map((row) => (
                <PaymentItem
                  key={row.id}
                  row={row}
                  comparison={yearOverYear.get(row.id)}
                  listUrl={listUrl}
                />
              ))}
            </ListGroup>
          )}
        </>
      )}

      {!isLoading && remaining > 0 && (
        <div className="space-y-2 text-center">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={loadMore}
          >
            {formatCountNumber(Math.min(PAGE_SIZE, remaining))} weitere laden
          </Button>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {formatCountNumber(visibleRows.length)} von {formatCountNumber(rows.length)}{" "}
            angezeigt
          </p>
        </div>
      )}

      <StornoDialog
        open={stornoTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStornoTarget(null);
        }}
        summary={stornoTarget ? summaryOf(stornoTarget) : null}
        error={stornoError}
        isPending={archivePayment.isPending}
        onConfirm={(reason) => void handleStorno(reason)}
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

interface RowActionProps {
  row: Row;
  comparison: YearOverYearComparison | undefined;
  listUrl: string;
  onStorno: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}

/**
 * Wen eine Zeilenaktion betrifft — fuer die Namen der Symbolschaltflaechen.
 * Nur „Bearbeiten" hiesse auf jeder Zeile gleich: Wer die Liste per
 * Screenreader oder Sprachsteuerung durchgeht, koennte die 25 Schaltflaechen
 * einer Seite nicht auseinanderhalten.
 */
function actionSubject({ companyName, effectiveDate }: Row): string {
  return `${companyName || "Dividende"} vom ${formatCalendarDate(effectiveDate)}`;
}

function PaymentRow({
  row,
  comparison,
  listUrl,
  onStorno,
  onReactivate,
  onDelete,
}: RowActionProps) {
  const { payment, effectiveDate, companyName, depotName, amount } = row;
  const shifted = effectiveDate !== payment.pay_date;
  const cancelled = Boolean(payment.archived_at);
  const subject = actionSubject(row);
  const edit = usePaymentComposer({ paymentId: payment.id });
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-muted-foreground tabular-amount">
        {formatCalendarDate(effectiveDate)}
        {shifted && (
          <span
            className="block text-xs text-muted-foreground"
            title="Tatsächliches Zahlungsdatum"
          >
            tatsächlich {formatCalendarDate(payment.pay_date)}
          </span>
        )}
      </TableCell>
      <TableCell className="font-medium">
        {/* Das Unternehmen fuehrt zur Detailansicht — es benennt den Eingang,
            das Datum tut das nicht. */}
        <Link
          to={`/eingaenge/${payment.id}`}
          state={{ from: listUrl }}
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
      <TableCell className="text-right font-semibold">
        {/* Der Indikator steht links des Betrags, damit die Ziffern der Spalte
            buendig bleiben. */}
        <span className="inline-flex items-center justify-end gap-1.5">
          {comparison && <YearOverYearIndicator comparison={comparison} />}
          <AmountText amount={amount} />
        </span>
      </TableCell>
      <TableCell className="py-1 text-right">
        {/* Ohne Rahmen: Drei umrandete Knoepfe je Zeile machten aus der Liste
            ein Raster aus Kaesten. Die Symbole bleiben sichtbar (keine
            Hover-Abhaengigkeit), die Flaeche erscheint beim Zeigen. */}
        <div className="flex justify-end gap-0.5 text-muted-foreground">
          {cancelled ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${subject} reaktivieren`}
              onClick={onReactivate}
            >
              <RotateCcw />
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${subject} bearbeiten`}
                aria-haspopup="dialog"
                {...edit}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${subject} stornieren`}
                onClick={onStorno}
              >
                <Ban />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${subject} dauerhaft löschen`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Ein Eingang auf dem Telefon — die gemeinsame Zeile aus `PaymentListItem`,
 * dieselbe wie auf der Uebersicht und der Assetseite. Aktionen stehen auf der
 * Detailseite: Die Zeile ist eine Tippflaeche, keine Sammlung kleiner Ziele.
 */
function PaymentItem({
  row,
  comparison,
  listUrl,
  dayOnly = false,
}: {
  row: Row;
  comparison: YearOverYearComparison | undefined;
  listUrl: string;
  /** In Monatsgruppen: Monat und Jahr stehen schon in der Überschrift. */
  dayOnly?: boolean;
}) {
  const { payment, effectiveDate, companyName, depotName, amount } = row;
  return (
    <PaymentListItem
      to={`/eingaenge/${payment.id}`}
      state={{ from: listUrl }}
      title={companyName || "—"}
      date={effectiveDate}
      // Ohne Monatsgruppen steht das Jahr sonst nirgends.
      showYear={!dayOnly}
      depot={depotName}
      amount={amount}
      cancelled={Boolean(payment.archived_at)}
      indicator={comparison && <YearOverYearIndicator comparison={comparison} />}
    />
  );
}
