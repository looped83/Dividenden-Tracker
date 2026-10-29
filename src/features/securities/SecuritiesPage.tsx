import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { useBackState } from "@/lib/hooks/useBackState";
import { useRowLink } from "@/lib/hooks/useRowLink";
import { Briefcase, Plus, Repeat, Undo2 } from "lucide-react";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { monthNameDeShort, normalizePayoutMonths } from "@/lib/statistics";
import { SecurityImportButton } from "@/features/securities/SecurityImportDialog";
import {
  PortfolioImportButton,
  PortfolioImportDialog,
} from "@/features/securities/PortfolioImportDialog";
import { PortfolioSummary } from "@/features/securities/PortfolioSummary";
import { SecurityFormDialog } from "@/features/securities/SecurityFormDialog";
import { DepotHeaderActions } from "@/features/securities/DepotHeaderActions";
import { AmountText } from "@/components/money/AmountText";
import { formatPercent, MoneyDecimal, type DecimalInstance } from "@/lib/money";
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
} from "@/components/ui/filter-bar";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { compareGerman } from "@/lib/utils/compareText";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ListGroup, ListRow } from "@/components/ui/list";
import { cn } from "@/lib/utils/cn";
import { useDepots } from "@/features/depots/hooks";
import { useSecuritiesByDepot } from "@/features/payments/hooks";
import {
  Table,
  TableBody,
  TableCell,
  SortableTableHead,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePositionCaps } from "@/features/planner/positionCaps";
import { useSavingsPlans } from "@/features/planner/savingsPlanHooks";
import { useSecurities, useSecuritySnapshots } from "@/features/securities/hooks";
import {
  buildAssetRows,
  hasPositions,
  type AssetRow,
} from "@/features/securities/assetRows";
import { latestAsOf } from "@/features/securities/snapshots";
import {
  DEFAULT_SECURITY_SORT,
  defaultDirectionFor,
  parseSecuritySort,
  securitySortOptions,
  sortAssetRows,
  type SecuritySort,
  type SecuritySortField,
  type SortDirection,
} from "@/features/securities/sortSecurities";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Unterbereich **Assets** des Depots: die Uebersicht aller Papiere — Aktien
 * ebenso wie ETFs, Fonds und Anleihen.
 *
 * Kopfzeile, Reiter und die Aktion „Neue Assets" traegt die Huelle
 * (`DepotPage`); hier stehen Kennzahlen des Depotstands, Filter und die Liste
 * selbst.
 *
 * **Die Liste zeigt, was eine Position ausmacht, nicht was sie heisst.** Sie
 * fuehrte lange nur Stammdaten (Ticker, ISIN, Land, Status) — Felder, die beim
 * Wiederfinden helfen, aber keine einzige Frage an ein Depot beantworten.
 * Sobald ein Depotstand importiert ist, stehen deshalb Wert, Anteil, erwartete
 * Jahresausschuettung, Rendite und Gewinn in der Zeile; Ticker und ISIN nennt
 * die Detailseite. Ohne importierten Stand entfallen diese Spalten ganz,
 * statt eine Wand aus Gedankenstrichen zu zeigen (wie in der
 * Unternehmensstatistik).
 *
 * Alles Weitere — Stueckzahl, Kurs, Einstand, Rhythmus, Verlauf und die
 * Zahlungshistorie — steht eine Ebene tiefer auf der Detailseite, die der Name
 * oeffnet. In der Tabelle stehen rechts die Zeilenaktionen (bearbeiten,
 * archivieren, nur archiviert endgueltig loeschen); auf dem Telefon traegt sie
 * der Kopf der Detailseite.
 */
export function SecuritiesPage() {
  const { data: securities = [], isLoading } = useSecurities();
  const { data: snapshots = [] } = useSecuritySnapshots();
  const { data: depots = [] } = useDepots();
  const depotById = React.useMemo(
    () => new Map(depots.map((depot) => [depot.id, depot])),
    [depots],
  );
  const { data: savingsPlans } = useSavingsPlans();
  // Assets mit laufendem Sparplan tragen ein Zeichen; pausierte zaehlen nicht.
  const withSavingsPlan = React.useMemo(
    () =>
      new Set(
        (savingsPlans ?? [])
          .filter((plan) => !plan.paused)
          .map((plan) => plan.securityId),
      ),
    [savingsPlans],
  );
  // Filter und Sortierung stehen in der Adresse — wie in der Dividendenliste.
  // Als lokaler Zustand waren sie weg, sobald man ein Asset oeffnete und
  // zurueckkam.
  const [searchParams, setSearchParams] = useSearchParams();
  const showArchived = searchParams.get("status") === "all";
  const sectorFilter = searchParams.get("sector") ?? "";
  const currencyFilter = searchParams.get("currency") ?? "";
  const depotFilter = searchParams.get("depot") ?? "";
  const sort = parseSecuritySort(searchParams.get("sort"), searchParams.get("direction"));
  const setParams = React.useCallback(
    (updates: Record<string, string | null>) => {
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
  const setShowArchived = (value: boolean) => {
    setParams({ status: value ? "all" : null });
  };
  // Wo Dividenden eines Assets gebucht sind — nur geladen, solange nach Depot
  // gefiltert wird (meist liegt die Historie ohnehin schon im Cache).
  const { data: bookedByDepot } = useSecuritiesByDepot(depotFilter !== "");
  // Nur noch fuers Anlegen: Bearbeiten, Archivieren und Loeschen stehen im
  // Kopf der Detailseite.
  const [createOpen, setCreateOpen] = React.useState(false);
  // Die ganze Tabellenzeile fuehrt zur Detailseite (`useRowLink`).
  const openRow = useRowLink();
  const backState = useBackState();
  // Ein Dialog fuer beide Ausloeser des Depotstand-Imports (Kennzahlkopf und
  // Seitenende), siehe `PortfolioImportButton`.
  const [portfolioImportOpen, setPortfolioImportOpen] = React.useState(false);
  const openPortfolioImport = React.useCallback(() => {
    setPortfolioImportOpen(true);
  }, []);

  // Listenzeilen statt Tabelle auf dem Telefon — dasselbe Muster wie in der
  // Dividendenliste. Sieben Spalten hinter einem seitlichen Bildlauf sind auf
  // 390px keine Uebersicht, sondern ein Versteck.
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);

  // Auswahlwerte aus dem Bestand ableiten: nur was vorkommt, ist waehlbar.
  // Basis sind stets alle Assets, damit die Auswahl nicht springt, wenn
  // "Archivierte anzeigen" umgeschaltet wird.
  const depotOptions = React.useMemo<EntityOption[]>(
    () => depots.map((d) => ({ id: d.id, name: d.name, archived: !!d.archived_at })),
    [depots],
  );

  const options = React.useMemo(() => {
    const uniqueSorted = (values: (string | null)[]) =>
      [...new Set(values.filter((v): v is string => Boolean(v)))].sort(compareGerman);
    return {
      sectors: uniqueSorted(securities.map((s) => s.sector)),
      currencies: uniqueSorted(securities.map((s) => s.currency)),
    };
  }, [securities]);

  // Stammdaten, Depotkonto und die Position aus dem juengsten Depotstand in
  // einer Zeile. Bewusst **ein** Aufbau fuer Tabelle und Liste: Beide zeigen
  // dieselben Zahlen, und zwei Ableitungen liefen frueher oder spaeter
  // auseinander.
  const { data: weights } = usePositionCaps();
  const rows = React.useMemo(
    () =>
      buildAssetRows(
        securities,
        snapshots,
        (depotId) => depotById.get(depotId)?.name ?? null,
        weights,
      ),
    [securities, snapshots, depotById, weights],
  );

  const withPositions = React.useMemo(() => hasPositions(rows), [rows]);
  const asOf = React.useMemo(() => latestAsOf(snapshots), [snapshots]);
  const sortOptions = React.useMemo(
    () => securitySortOptions(withPositions),
    [withPositions],
  );

  // Eine Sortierung nach Wert ergibt ohne Depotstand keine Reihenfolge. Faellt
  // der Stand weg (geloescht in den Einstellungen), greift wieder die Vorgabe,
  // statt die Liste unsortiert stehen zu lassen.
  const effectiveSort = React.useMemo<SecuritySort>(
    () =>
      sortOptions.some((option) => option.value === sort.field)
        ? sort
        : DEFAULT_SECURITY_SORT,
    [sortOptions, sort],
  );

  // Spaltenkoepfe sortieren wie die Auswahl der Filterleiste — beide schreiben
  // dieselben Adressparameter und bleiben so von selbst gleich. Erneutes
  // Antippen derselben Spalte dreht die Richtung.
  const sortedBy = (field: SecuritySortField): SortDirection | null =>
    effectiveSort.field === field ? effectiveSort.direction : null;
  const sortBy = (field: SecuritySortField) => {
    setParams({
      sort: field,
      direction:
        effectiveSort.field === field
          ? effectiveSort.direction === "asc"
            ? "desc"
            : "asc"
          : defaultDirectionFor(field),
    });
  };
  const sortHead = (
    field: SecuritySortField,
    label: string,
    align: "left" | "right" = "left",
    className?: string,
  ) => (
    <SortableTableHead
      sorted={sortedBy(field)}
      onSort={() => {
        sortBy(field);
      }}
      label={label}
      align={align}
      className={cn(align === "right" && "whitespace-nowrap", className)}
    >
      {label}
    </SortableTableHead>
  );

  const visible = React.useMemo(() => {
    const filtered = rows.filter(({ security }) => {
      if (!showArchived && security.archived_at) return false;
      if (sectorFilter && security.sector !== sectorFilter) return false;
      if (currencyFilter && security.currency !== currencyFilter) return false;
      // Ein Asset gehoert zu einem Depot, wenn dort Dividenden gebucht sind
      // oder es dort sein Standard-Depot hat — nicht nur im zweiten Fall: Sonst
      // zeigte „Scalable Capital" kein Asset, obwohl dort alles eingeht.
      if (
        depotFilter &&
        security.default_depot_id !== depotFilter &&
        !bookedByDepot?.get(depotFilter)?.has(security.id)
      )
        return false;
      return true;
    });
    return sortAssetRows(filtered, effectiveSort);
  }, [
    rows,
    showArchived,
    sectorFilter,
    currencyFilter,
    depotFilter,
    bookedByDepot,
    effectiveSort,
  ]);

  const activeFilterCount = [
    sectorFilter,
    currencyFilter,
    depotFilter,
    showArchived ? "archived" : "",
  ].filter((value) => value !== "").length;
  const hasActiveFilters = activeFilterCount > 0;
  const filterDisclosure = useFilterDisclosure(activeFilterCount);
  const shownTotal = showArchived
    ? rows.length
    : rows.filter(({ security }) => !security.archived_at).length;

  const resetFilters = () => {
    setParams({ sector: null, currency: null, depot: null, status: null });
  };

  return (
    <div className="space-y-10">
      {/* Kennzahlen des Depotstands, sofern einer importiert ist. Sie stehen
          bewusst ueber der Liste: Die Kacheln beantworten „wie steht mein Depot
          insgesamt", die Liste „woraus besteht es". */}
      <DepotHeaderActions>
        <FilterToggle disclosure={filterDisclosure} />
      </DepotHeaderActions>

      {/* Die Felder stehen oben unter den Reitern — wie bei Dividenden und
          Statistik, direkt unter dem Schalter im Kopf, der sie aufklappt.
          Zuvor klappten sie erst unter dem Kennzahlkopf auf, weit weg vom
          Schalter. Abstand nach unten wie dort (1,5rem). */}
      <FilterBar disclosure={filterDisclosure} className="mb-6!">
        <FilterField id="sec-sector" label="Branche" half>
          <Select
            id="sec-sector"
            value={sectorFilter}
            onChange={(event) => {
              setParams({ sector: event.target.value });
            }}
          >
            <option value="">Alle Branchen</option>
            {options.sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField id="sec-currency" label="Währung" half>
          <Select
            id="sec-currency"
            value={currencyFilter}
            onChange={(event) => {
              setParams({ currency: event.target.value });
            }}
          >
            <option value="">Alle Währungen</option>
            {options.currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField id="sec-depot" label="Depot">
          <EntitySelect
            id="sec-depot"
            options={depotOptions}
            value={depotFilter}
            onChange={(value) => {
              setParams({ depot: value });
            }}
            allLabel="Alle Depots"
          />
        </FilterField>

        {/* Archivierte sind ein Filter wie jeder andere — dieselbe Stelle wie
        „Stornierte" in der Dividendenliste. */}
        <FilterField id="sec-status" label="Status">
          <Select
            id="sec-status"
            value={showArchived ? "all" : ""}
            onChange={(event) => {
              setShowArchived(event.target.value === "all");
            }}
          >
            <option value="">Ohne Archivierte</option>
            <option value="all">Mit Archivierten</option>
          </Select>
        </FilterField>

        {/* Sortierung wie in der Dividendenliste: rechts in der Leiste, vor dem
        Zuruecksetzen. Mit importiertem Depotstand stehen die Zahlen des
        Bestands zur Wahl — Wert, Ausschuettung, Rendite, Gewinn. */}
        <FilterSort
          id="sec-sort"
          value={effectiveSort.field}
          direction={effectiveSort.direction}
          options={sortOptions}
          onValueChange={(value) => {
            const field = value as SecuritySortField;
            // Ein frisch gewaehltes Zahlenfeld beginnt absteigend: Die Frage an
            // „Nach Wert" ist „was ist meine groesste Position", nicht „meine
            // kleinste".
            setParams({ sort: field, direction: defaultDirectionFor(field) });
          }}
          onDirectionChange={(direction) => {
            setParams({ sort: effectiveSort.field, direction });
          }}
        />

        {/* Zuruecksetzen steht wie im Statistikbereich **in** der Leiste. */}
        {hasActiveFilters && <FilterReset onClick={resetFilters} />}
      </FilterBar>

      <PortfolioSummary snapshots={snapshots} onImport={openPortfolioImport} />

      {/* Die Liste ist ein Abschnitt wie auf der Uebersicht: Ueberschrift mit
          Anzahl (wenn ein Filter sie verkleinert). */}
      <Section
        title="Assets"
        // Die Anzahl nur, wenn ein Filter sie verkleinert: Ungefiltert nennt
        // der Kennzahlkopf die Positionen schon.
        {...(!isLoading &&
          visible.length !== shownTotal && {
            description: `${formatCountNumber(visible.length)} von ${formatCountNoun(shownTotal, "Asset", "Assets")}`,
          })}
        // „Neues Asset" steht bei der Liste, die es verlaengert; der
        // Filterschalter im Seitenkopf (`DepotHeaderActions`).
        action={
          <Button
            variant="outline"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            <Plus /> Neues Asset
          </Button>
        }
      >
        <div className="space-y-6">
          {isLoading ? (
            <SkeletonRows rows={6} label="Assets" />
          ) : visible.length === 0 && rows.length > 0 ? (
            // Assets gibt es, nur keine fuer diese Filter (oder alle archiviert):
            // „Noch kein Asset angelegt" stimmte dann nicht.
            <EmptyState
              icon={Briefcase}
              title="Keine Assets für diese Filter"
              action={
                hasActiveFilters ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Filter zurücksetzen
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowArchived(true);
                    }}
                  >
                    Archivierte zeigen
                  </Button>
                )
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="Noch kein Asset angelegt"
              description="Lege dein erstes Asset an — Aktie, ETF, Fonds oder Anleihe —, um Dividenden zu erfassen."
              action={
                <Button
                  onClick={() => {
                    setCreateOpen(true);
                  }}
                >
                  Erstes Asset anlegen
                </Button>
              }
            />
          ) : isWide ? (
            <Table>
              {/* Der Stichtag gehoert zu jeder Positionszahl der Tabelle; sichtbar
              traegt ihn die Kachel darueber. */}
              <caption className="sr-only">
                {withPositions && asOf
                  ? `Assets mit Position zum Depotstand vom ${formatCalendarDate(asOf)}`
                  : "Assets"}
              </caption>
              <TableHeader>
                <TableRow>
                  {sortHead("name", "Asset")}
                  {withPositions && (
                    <>
                      {sortHead("value", "Wert", "right")}
                      {/* Gewichtung (Ist, Anteil am Depot) folgt dem Wert —
                      dieselbe Reihenfolge. Daneben die Zielgewichtung des
                      Nachkaufs (ab lg). */}
                      {sortHead("value", "Gewichtung", "right")}
                      {sortHead(
                        "weight",
                        "Zielgewichtung",
                        "right",
                        "hidden lg:table-cell",
                      )}
                      {sortHead("expected", "Erwartet p. a.", "right")}
                      {sortHead("yield", "Rendite", "right")}
                      {sortHead("gain", "Gewinn", "right")}
                    </>
                  )}
                  {/* Ohne Positionen tragen Branche, Ausschuettungsplan und
                  Depotkonto die Zeile: Sie sind das, was ohne Depotstand
                  ueberhaupt bekannt ist. Mit Positionen genuegen Wert,
                  Erwartung und Gewinn: Den Plan zeigt die Detailseite, das
                  Depotkonto bleibt als Filter. */}
                  {!withPositions && (
                    <>
                      {sortHead("sector", "Branche", "left", "hidden lg:table-cell")}
                      <TableHead>Ausschüttung</TableHead>
                      {sortHead("depot", "Depot", "left", "hidden lg:table-cell")}
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const { security, position } = row;
                  return (
                    <TableRow
                      key={security.id}
                      className="cursor-pointer"
                      onClick={openRow(`/depot/${security.id}`, backState)}
                    >
                      <TableCell>
                        <AssetName
                          row={row}
                          savingsPlan={withSavingsPlan.has(row.security.id)}
                        />
                      </TableCell>
                      {withPositions && (
                        <>
                          <TableCell className="text-right">
                            <Metric
                              value={
                                position?.marketValue ? (
                                  <AmountText
                                    amount={position.marketValue}
                                    className="font-semibold"
                                  />
                                ) : null
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <PercentCell
                              value={position?.allocationPercent}
                              digits={1}
                              // Ueber der Zielgewichtung rot — wie auf der
                              // Asset-Seite: dort endet der Nachkauf. Eine
                              // bewusste 0 ist kein Ueberschreiten.
                              over={
                                row.targetWeight !== null &&
                                row.targetWeight > 0 &&
                                (position?.allocationPercent?.greaterThan(
                                  row.targetWeight,
                                ) ??
                                  false)
                              }
                            />
                          </TableCell>
                          {/* Erst ab lg: Auf dem Tablet hoch reicht der Platz
                          nicht fuer eine achte Spalte. */}
                          <TableCell className="hidden text-right lg:table-cell">
                            {row.targetWeight === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="whitespace-nowrap tabular-nums">
                                {formatPercent(new MoneyDecimal(row.targetWeight), 1)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Metric
                              value={
                                position?.annualDividend ? (
                                  <AmountText amount={position.annualDividend} />
                                ) : null
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <PercentCell value={position?.dividendYield} digits={2} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Metric
                              value={
                                position?.gain ? (
                                  <AmountText amount={position.gain} showSign />
                                ) : null
                              }
                              detail={percentDetail(position?.gainPercent, 1)}
                            />
                          </TableCell>
                        </>
                      )}
                      {!withPositions && (
                        <>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {security.sector ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {payoutLabel(security)}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {row.depotName ?? "—"}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <ListGroup>
              {visible.map((row) => (
                <AssetItem
                  key={row.security.id}
                  row={row}
                  savingsPlan={withSavingsPlan.has(row.security.id)}
                />
              ))}
            </ListGroup>
          )}
        </div>
      </Section>

      {/* Seltener gebrauchte Importe am Seitenende: die Liste selbst soll den
          oberen Bereich bestimmen. Ist schon ein Depotstand importiert, steht
          sein Import als „Aktualisieren" im Kennzahlkopf; hier nur, solange
          es keinen gibt. Archivierte blendet der Filter ein. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SecurityImportButton />
        {snapshots.length === 0 && (
          <PortfolioImportButton onClick={openPortfolioImport} />
        )}
      </div>

      <PortfolioImportDialog
        open={portfolioImportOpen}
        onOpenChange={setPortfolioImportOpen}
      />

      <SecurityFormDialog
        security={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

/**
 * Ausschuettungsmonate als Kurzform („Mär, Jun, Sep, Dez").
 *
 * Zwoelf Kuerzel sind keine Auskunft, sondern eine Zeile Rauschen — ein
 * monatlicher Zahler heisst hier deshalb „monatlich".
 */
function payoutLabel(security: Security): string {
  const months = normalizePayoutMonths(security.payout_months);
  if (months.length === 0) return "—";
  if (months.length === 12) return "monatlich";
  return months.map((month) => monthNameDeShort(month)).join(", ");
}

/**
 * Prozentangabe unter einem Betrag; `null`, wenn die Quelle keine liefert —
 * dann bleibt die Zeile leer statt eine 0 zu behaupten.
 */
function percentDetail(
  value: DecimalInstance | null | undefined,
  digits: number,
): string | null {
  if (value === null || value === undefined) return null;
  return formatPercent(value, digits);
}

/**
 * Anteil und Rendite in eigener Spalte: Unter Wert und Erwartung standen sie
 * als Nebenzeile und liessen sich nicht ueber die Zeilen hinweg vergleichen.
 * Ohne Wert ein Strich, wie bei den Betraegen.
 */
function PercentCell({
  value,
  digits,
  over = false,
}: {
  value: DecimalInstance | null | undefined;
  digits: number;
  over?: boolean;
}) {
  const formatted = percentDetail(value, digits);
  if (!formatted) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        over && "font-medium text-negative",
      )}
    >
      {formatted}
    </span>
  );
}

/**
 * Der Name fuehrt zur Detailseite — sie beantwortet die Frage nach Verlauf und
 * Zahlungen dieser Position, die die Uebersicht bewusst nicht stellt. Ticker
 * und ISIN stehen dort; in der Liste machten sie jede Zeile zweizeilig, ohne
 * beim Vergleichen zu helfen.
 */
function AssetName({ row, savingsPlan }: { row: AssetRow; savingsPlan: boolean }) {
  const { security } = row;
  const backState = useBackState();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link
        to={`/depot/${security.id}`}
        state={backState}
        className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {security.name}
      </Link>
      <AssetMarks savingsPlan={savingsPlan} reinvest={Boolean(security.reinvest_since)} />
      {/* Nur der Sonderfall traegt ein Etikett. „Aktiv" stand zuvor an fast
          jeder Zeile und sagte damit nichts. */}
      {security.archived_at && (
        <Badge variant="neutral" className="shrink-0">
          Archiviert
        </Badge>
      )}
    </span>
  );
}

/**
 * Eine Kapsel fuer „Sparplan laeuft" (↻, Planer › Sparplaene) und „Wird
 * reinvestiert" (↶, seit 2.56.0) — dieselben Zeichen wie im Kalender. Zwei lose
 * Pfeile nebeneinander liessen sich kaum auseinanderhalten; in einer Kapsel
 * mit Trennstrich lesen sie sich als ein Zustand des Assets. Nur das Ja traegt
 * ein Zeichen — wie „Archiviert".
 */
function AssetMarks({ savingsPlan, reinvest }: { savingsPlan: boolean; reinvest: boolean }) {
  if (!savingsPlan && !reinvest) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
      {savingsPlan && <AssetMark icon={Repeat} label="Sparplan läuft" />}
      {savingsPlan && reinvest && (
        <span className="h-3 w-px bg-muted-foreground/40" aria-hidden />
      )}
      {reinvest && <AssetMark icon={Undo2} label="Wird reinvestiert" />}
    </span>
  );
}

function AssetMark({ icon: Icon, label }: { icon: typeof Repeat; label: string }) {
  return (
    <span title={label} className="inline-flex">
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Eine Zahl, optional mit ihrer Erlaeuterung darunter (Gewinnquote). */
function Metric({ value, detail }: { value: React.ReactNode; detail?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end">
      {value}
      {detail && (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {detail}
        </span>
      )}
    </span>
  );
}

/**
 * Ein Asset auf dem Telefon: eine Zeile, die als Ganzes zur Detailseite
 * fuehrt. Oben Name und Wert, darunter erwartete Ausschuettung und Rendite
 * links, der Kursgewinn in Prozent rechts — dieselbe Form wie eine Zeile der
 * Statistiklisten: was es ist und was es wert ist oben, die Ableitungen
 * darunter.
 *
 * Der Gewinn steht nur als Prozent (den Betrag nennt die Detailseite), der
 * Ticker gar nicht (wie in der Tabelle): Mit beiden brach die zweite Zeile bei
 * laengeren Betraegen um. Ohne Pfeil am Rand, wie alle Listen (`ListItemBody`).
 *
 * Bearbeiten und Archivieren stehen auf der Detailseite. Als Symbole in jeder
 * Karte verlaengerten sie sie um eine Zeile, und die Karte hatte drei kleine
 * Ziele statt eines grossen — dasselbe Muster wie bei den Eingaengen. Der
 * Anteil am Depot steht in der Tabelle; auf dem Telefon traegt die Zeile nur,
 * was man beim Durchsehen vergleicht.
 */
function AssetItem({ row, savingsPlan }: { row: AssetRow; savingsPlan: boolean }) {
  const backState = useBackState();
  const { security, position } = row;
  const payout = payoutLabel(security);
  const gain = position?.gain ?? null;
  // In der zweiten Zeile: Im Titel liefe das Abzeichen mit dem Namen aus.
  const archivedBadge = security.archived_at && (
    <Badge variant="neutral" className="mr-2 align-middle">
      Archiviert
    </Badge>
  );

  return (
    <li>
      <ListRow asChild>
        <Link to={`/depot/${security.id}`} state={backState}>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="flex items-baseline justify-between gap-3">
              {/* Eine Zeile, lange Namen laufen vor der Kapsel aus
              (`truncate-fade-aside`, wie `ListItemBody`). */}
              <span className="@container flex min-w-0 flex-1 items-center gap-1.5">
                <span className="min-w-0 truncate-fade-aside font-medium">
                  {security.name}
                </span>
                <AssetMarks
                  savingsPlan={savingsPlan}
                  reinvest={Boolean(security.reinvest_since)}
                />
              </span>
              {position?.marketValue && (
                <AmountText
                  amount={position.marketValue}
                  className="shrink-0 font-semibold"
                />
              )}
            </span>
            <span className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
              {position ? (
                <>
                  <span className="min-w-0 truncate">
                    {archivedBadge}
                    {position.annualDividend ? (
                      <>
                        <AmountText amount={position.annualDividend} /> p. a.
                        {position.dividendYield &&
                          ` · ${formatPercent(position.dividendYield, 2)}`}
                      </>
                    ) : (
                      "keine Ausschüttung erwartet"
                    )}
                  </span>
                  {position.gainPercent && (
                    <span
                      className={cn(
                        "shrink-0 tabular-amount",
                        gain?.isPositive() && "text-positive",
                        gain?.isNegative() && "text-negative",
                      )}
                    >
                      {gain?.isPositive() ? "+" : ""}
                      {formatPercent(position.gainPercent, 1)}
                    </span>
                  )}
                </>
              ) : (
                <span className="min-w-0 truncate">
                  {archivedBadge}
                  {[row.depotName, payout === "—" ? null : payout]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              )}
            </span>
          </span>
        </Link>
      </ListRow>
    </li>
  );
}
