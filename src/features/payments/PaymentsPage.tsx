import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronDown, ShieldCheck, Wallet } from "lucide-react";
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
import { LoadMore } from "@/components/ui/load-more";
import { ListGroup, ListSection } from "@/components/ui/list";
import { CollapsibleMonth, MonthSections } from "@/components/ui/month-section";
import { useOpenMonths } from "@/lib/hooks/useOpenMonths";
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
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useToday } from "@/lib/hooks/useToday";
import { useRowLink } from "@/lib/hooks/useRowLink";
import { cn } from "@/lib/utils/cn";
import { Money, toCurrencyCode } from "@/lib/money";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import { useAllPayments } from "@/features/payments/hooks";
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";
import {
  parsePage,
  parseSort,
  parseStatus,
  statusNeedsArchived,
} from "@/features/payments/listParams";
import { sortRows, type SortableRow } from "@/features/payments/sortRows";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatMonthYear } from "@/features/dashboard/format";
import {
  compareToPreviousYear,
  type YearOverYearComparison,
} from "@/features/payments/yearOverYear";
import {
  MonthChangeIndicator,
  YearOverYearIndicator,
} from "@/features/payments/YearOverYearIndicator";
import { ReinvestMark } from "@/components/domain/ReinvestMark";
import { PaymentListItem } from "@/features/payments/PaymentListItem";
import {
  groupByMonth,
  monthChanges,
  monthTotals,
  type MonthChange,
} from "@/features/payments/monthGroups";
import { usePaymentComposer } from "@/features/payments/PaymentComposer";

type Row = {
  payment: PaymentListRow;
  effectiveDate: string;
  /** Floss die Dividende zurueck ins Asset (`reinvest_since`, seit 2.53.0)? */
  reinvested: boolean;
} & SortableRow;

const PAGE_SIZE = 25;
/** Eingeklappte Monate, die je Schritt dazukommen. */
const MONTHS_PER_STEP = 12;

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
      setParams({ ...updates, page: null, offen: null });
    },
    [setParams],
  );

  // Beim Scrollen kommen die naechsten Eingaenge dazu ({@link LoadMore}),
  // statt die Seite zu wechseln: Man bleibt im Lesefluss, und eine Monatsgruppe reisst nicht an
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

      const security = securityById.get(payment.security_id);
      const companyName = security?.name ?? "";
      const depot = depotById.get(payment.depot_id);
      // Wie im Kalender zaehlt das Zahlungsdatum: Ein Eingang vor dem
      // Einschalten kaufte nicht nach.
      const reinvestSince = security?.reinvest_since;
      const depotName = depot?.name ?? "";

      mapped.push({
        payment,
        effectiveDate,
        reinvested:
          !isCancelled &&
          typeof reinvestSince === "string" &&
          payment.pay_date >= reinvestSince,
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

  const visibleRows = React.useMemo(() => rows.slice(0, page * PAGE_SIZE), [rows, page]);
  const remaining = rows.length - visibleRows.length;

  // Anzahl und Summe der Auswahl — die Frage hinter fast jedem Filter („wie
  // viel kam von …?"). Ueber verschiedene Waehrungen wird nicht addiert.

  // Nach Datum sortiert gruppiert die Liste nach Monat, mit der Monatssumme im
  // Kopf — ueber alle Eingaenge des Monats, nicht nur die bereits geladenen.
  const groupedByMonth = sort.field === "payment_date";
  const totalsByMonth = React.useMemo(
    () => (groupedByMonth ? monthTotals(rows, effectiveDateOf, amountOf) : null),
    [groupedByMonth, rows],
  );

  // Veraenderung je Monat gegenueber dem Vorjahresmonat (seit 2.53.0), nicht
  // mit Assetfilter (`MonthAside`). Bezug sind alle aktiven Eingaenge unter
  // dem Depotfilter — nicht die
  // angezeigten Zeilen: Ein Jahres- oder Monatsfilter blendete den
  // Vorjahresmonat sonst aus, Stornierte zaehlen in keiner Summe mit.
  const today = useToday();
  const changesByMonth = React.useMemo(() => {
    if (!groupedByMonth || securityId) return null;
    const base: { date: string; amount: Money }[] = [];
    for (const payment of allPayments) {
      if (payment.archived_at) continue;
      if (depotId && payment.depot_id !== depotId) continue;
      base.push({
        date: effectiveOf(payment),
        amount: Money.fromString(
          payment.net_amount,
          toCurrencyCode(depotById.get(payment.depot_id)?.base_currency ?? "EUR"),
        ),
      });
    }
    return monthChanges(
      base,
      (item) => item.date,
      (item) => item.amount,
      today,
    );
  }, [groupedByMonth, allPayments, depotId, securityId, effectiveOf, depotById, today]);

  // Ohne Filter, neueste zuerst, klappen die Monate ein (seit 2.2.0): Offen
  // ist nur der aktuelle Monat — oder, solange er noch leer ist, der juengste
  // mit Zahlungen. Statt 25 Zahlungen kommen je Schritt zwoelf Monatskoepfe
  // dazu, beim Scrollen von selbst; so bleibt die Seite auch mit Zahlungen
  // ueber viele Jahre kurz. Mit Filter oder anderer Sortierung bleibt alles
  // offen, die Auswahl ist dann ohnehin klein oder nicht nach Zeit geordnet.
  // Welche Monate offen sind, steht in der Adresse (`offen`) — wie die
  // geladene Menge findet der Weg zurueck von einem Eingang sie wieder.
  const collapsible = groupedByMonth && sort.direction === "desc" && !hasActiveFilters;
  const allMonths = React.useMemo(
    () => (collapsible ? groupByMonth(rows, effectiveDateOf) : null),
    [collapsible, rows],
  );
  const currentMonth = `${String(today.year)}-${String(today.month).padStart(2, "0")}`;
  const { isOpen, toggle: toggleMonth } = useOpenMonths(
    allMonths ? allMonths.map((group) => group.key) : null,
    currentMonth,
  );

  // Gemerkt: Das Auf- und Zuklappen eines Monats aendert nur die Adresse,
  // nicht die Gruppen.
  const groups = React.useMemo(
    () =>
      allMonths
        ? allMonths.slice(0, page * MONTHS_PER_STEP)
        : groupedByMonth
          ? groupByMonth(visibleRows, effectiveDateOf)
          : [{ key: "", year: 0, month: 0, rows: visibleRows }],
    [allMonths, groupedByMonth, page, visibleRows],
  );
  const remainingMonths = allMonths ? allMonths.length - groups.length : 0;

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
      {/* Ab `lg` in einer Zeile: Die Felder schrumpfen (mit „…"), statt die
          Sortierung allein in eine zweite Zeile zu schieben. */}
      <FilterBar disclosure={filterDisclosure} className="lg:flex-nowrap">
        <FilterField id="f-year" label="Jahr" half>
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

        {/* Der Monat erst mit einem Jahr: Ausgegraut stand er ohne Erklaerung
            da und kostete auf dem Telefon eine Zeile. */}
        {filterYear !== null && (
          <FilterField id="f-month" label="Monat" half>
            <Select
              id="f-month"
              value={filterMonth ? String(filterMonth) : ""}
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
        )}

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
        // Anzahl und Summe stehen seit 2.2.0 nicht mehr sichtbar ueber der
        // Liste — die Monate tragen ihre Summen selbst. Die Trefferzahl wird
        // nach jedem Filtern weiter vorgelesen. Sichtbar bleibt sie nur bei
        // den Stornierten: Sie haben kein Feld in der Leiste, erreichbar sind
        // sie ueber die Datenqualitaet (`?status=cancelled`); die Zeile sagt,
        // was gezeigt wird.
        <p
          className={status === "cancelled" ? "text-sm text-muted-foreground" : "sr-only"}
          aria-live="polite"
        >
          {status === "cancelled"
            ? formatCountNoun(
                rows.length,
                "stornierte Dividende",
                "stornierte Dividenden",
              )
            : formatCountNoun(rows.length, "Dividende", "Dividenden")}
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
                </TableRow>
              </TableHeader>
              {/* Keine Linie unter der letzten Zeile eines Monats — wie in den
                  Listen trennt der Abstand zur naechsten Ueberschrift.
                  Eingeklappte Monatskoepfe behalten ihre Linie. */}
              <TableBody className="[&_tr:not([data-month]):has(+tr[data-month])]:border-0">
                {/* Nach Datum sortiert gruppiert auch die Tabelle nach Monat —
                    mit derselben Monatsueberschrift und -summe wie die Liste
                    auf dem Telefon. */}
                {groups.map((group, index) => {
                  const monthTotal = totalsByMonth?.get(group.key);
                  const change = changesByMonth?.get(group.key);
                  const open = isOpen(group.key);
                  // Nach einem offenen Monat Abstand wie zwischen Abschnitten.
                  const afterOpen = index > 0 && isOpen(groups[index - 1].key);
                  return (
                    <React.Fragment key={group.key}>
                      {allMonths ? (
                        // Die ganze Zeile klappt; die Schaltflaeche darin
                        // traegt Fokus und Zustand fuer Tastatur und
                        // Sprachausgabe, ihr Klick steigt zur Zeile auf.
                        <TableRow
                          data-month
                          className="cursor-pointer hover:bg-transparent"
                          onClick={() => {
                            toggleMonth(group.key);
                          }}
                        >
                          <th
                            scope="colgroup"
                            colSpan={3}
                            className={cn(
                              "py-3 text-left text-[1.0625rem] font-semibold",
                              afterOpen && "pt-8",
                            )}
                          >
                            <button
                              type="button"
                              aria-expanded={open}
                              className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {monthNameDe(group.month)} {group.year}
                            </button>
                          </th>
                          <td
                            className={cn(
                              "px-3 py-3 text-right text-[0.9375rem] font-medium text-muted-foreground tabular-amount",
                              afterOpen && "pt-8",
                            )}
                          >
                            {/* Summe links des Pfeils — wie im Monatskopf auf
                                dem Telefon. */}
                            <span className="inline-flex items-center justify-end gap-2">
                              <MonthAside
                                total={monthTotal}
                                change={change}
                                group={group}
                              />
                              <ChevronDown
                                aria-hidden
                                className={cn(
                                  "size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                                  open && "rotate-180",
                                )}
                              />
                            </span>
                          </td>
                        </TableRow>
                      ) : (
                        groupedByMonth && (
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
                              <MonthAside
                                total={monthTotal}
                                change={change}
                                group={group}
                              />
                            </td>
                          </TableRow>
                        )
                      )}
                      {open &&
                        group.rows.map((row) => (
                          <PaymentRow
                            key={row.id}
                            row={row}
                            comparison={yearOverYear.get(row.id)}
                            listUrl={listUrl}
                          />
                        ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          ) : allMonths ? (
            <MonthSections>
              {groups.map((group) => {
                const monthTotal = totalsByMonth?.get(group.key);
                return (
                  <CollapsibleMonth
                    key={group.key}
                    id={`monat-${group.key}`}
                    title={formatMonthYear(group.year, group.month)}
                    aside={
                      <MonthAside
                        total={monthTotal}
                        change={changesByMonth?.get(group.key)}
                        group={group}
                      />
                    }
                    open={isOpen(group.key)}
                    onToggle={() => {
                      toggleMonth(group.key);
                    }}
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
                  </CollapsibleMonth>
                );
              })}
            </MonthSections>
          ) : groupedByMonth ? (
            <div className="space-y-10">
              {groups.map((group) => {
                const monthTotal = totalsByMonth?.get(group.key);
                return (
                  <ListSection
                    key={group.key}
                    title={formatMonthYear(group.year, group.month)}
                    aside={
                      <MonthAside
                        total={monthTotal}
                        change={changesByMonth?.get(group.key)}
                        group={group}
                      />
                    }
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

      {!isLoading && remainingMonths > 0 && (
        <LoadMore shown={groups.length} onLoad={loadMore}>
          Ältere Monate anzeigen
        </LoadMore>
      )}

      {!isLoading && !allMonths && remaining > 0 && (
        <LoadMore shown={visibleRows.length} total={rows.length} onLoad={loadMore}>
          Weitere anzeigen
        </LoadMore>
      )}
    </div>
  );
}

/**
 * Kopf eines Monats: Veraenderung zum Vorjahresmonat links der Summe. Mit
 * Assetfilter steht sie nicht (seit 2.53.1): Ein Monat hat dann meist eine
 * Zahlung, der Kopf wiederholte nur ihren Vergleich.
 */
function MonthAside({
  total,
  change,
  group,
}: {
  total: Money | null | undefined;
  change: MonthChange | undefined;
  group: { year: number; month: number };
}) {
  if (!total && !change) return undefined;
  return (
    <span className="inline-flex items-baseline gap-2">
      {change && (
        <span className="text-xs">
          <MonthChangeIndicator change={change} year={group.year} month={group.month} />
        </span>
      )}
      {total && <AmountText amount={total} />}
    </span>
  );
}

interface PaymentRowProps {
  row: Row;
  comparison: YearOverYearComparison | undefined;
  listUrl: string;
}

/**
 * Eine Zeile der Tabelle ab `md`. Aktionen (bearbeiten, stornieren, löschen)
 * stehen nur auf der Detailseite — wie in der Liste auf dem Telefon. Die ganze
 * Zeile führt dorthin (`useRowLink`).
 */
function PaymentRow({ row, comparison, listUrl }: PaymentRowProps) {
  const { payment, effectiveDate, companyName, depotName, amount } = row;
  const shifted = effectiveDate !== payment.pay_date;
  const cancelled = Boolean(payment.archived_at);
  const to = `/eingaenge/${payment.id}`;
  const openRow = useRowLink();
  return (
    <TableRow className="cursor-pointer" onClick={openRow(to, { from: listUrl })}>
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
          to={to}
          state={{ from: listUrl }}
          className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {companyName || "—"}
        </Link>
        {/* Ohne die Statusspalte waeren stornierte Zeilen sonst nicht mehr von
            aktiven zu unterscheiden, sobald „Stornierte anzeigen" aktiv ist. */}
        {row.reinvested && <ReinvestMark className="ml-1.5 align-[-0.125em]" />}
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
        <span className="inline-flex items-baseline justify-end gap-1.5">
          {comparison && <YearOverYearIndicator comparison={comparison} />}
          <AmountText amount={amount} />
        </span>
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
      titleAside={row.reinvested ? <ReinvestMark /> : undefined}
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
