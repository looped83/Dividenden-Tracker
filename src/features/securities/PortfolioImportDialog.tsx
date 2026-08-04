import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { checkImportFile } from "@/lib/import/fileLimits";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import {
  parseDivvyDiaryCsv,
  parseExportDate,
  toIsoDay,
  type ParsedDivvyDiaryFile,
} from "@/features/securities/divvydiaryCsv";
import {
  FIELD_LABELS,
  MATCH_LABELS,
  matchPositions,
  type MatchedPosition,
  type SecurityField,
} from "@/features/securities/portfolioMatch";
import {
  useCreateSecurity,
  useImportSnapshotRun,
  useSecurities,
  useSecurityAliases,
  useUpdateSecurity,
} from "@/features/securities/hooks";
import type { SecuritySnapshotInsert } from "@/lib/supabase/repositories/securitySnapshots";
import { deriveDataQuality } from "@/features/securities/dataQuality";

const FIELD_ORDER: readonly SecurityField[] = [
  "isin",
  "ticker",
  "wkn",
  "country",
  "sector",
  "currency",
];

type DialogState =
  | { step: "select" }
  | { step: "preview" }
  | { step: "importing"; label: string }
  | {
      step: "done";
      asOf: string;
      imported: number;
      created: number;
      updated: number;
      skipped: number;
      /** Einzelne Unternehmen, die sich nicht anlegen/ergaenzen liessen. */
      failures: string[];
    }
  | { step: "error"; message: string };

interface ParsedState {
  file: ParsedDivvyDiaryFile;
  fileName: string;
}

/**
 * Import eines DivvyDiary-Portfolio-Exports (docs/PORTFOLIO_IMPORT.md).
 *
 * Bewusst ein **eigener** Dialog neben `SecurityImportDialog`: Der legt
 * Unternehmen an, dieser schreibt einen Depotstand fort und ergaenzt
 * Stammdaten. Zwei Verben, zwei Dialoge — die gemeinsamen Bausteine
 * (`checkImportFile`, `parseCsv`, `matchCompany`) teilen sie sich.
 *
 * Die Datei verlaesst den Browser nicht (ARCHITECTURE.md §5); zur Datenbank
 * gehen ausschliesslich die normalisierten Zeilen.
 */
export function PortfolioImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: securities = [] } = useSecurities();
  const { data: aliases = [] } = useSecurityAliases();
  const createSecurity = useCreateSecurity();
  const updateSecurity = useUpdateSecurity();
  const importRun = useImportSnapshotRun();

  const [state, setState] = React.useState<DialogState>({ step: "select" });
  const [parsed, setParsed] = React.useState<ParsedState | null>(null);
  const [asOf, setAsOf] = React.useState("");
  const [createMissing, setCreateMissing] = React.useState(true);
  const [selectedFields, setSelectedFields] = React.useState<Set<SecurityField>>(
    new Set(FIELD_ORDER),
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setState({ step: "select" });
    setParsed(null);
    setAsOf("");
    setCreateMissing(true);
    setSelectedFields(new Set(FIELD_ORDER));
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const matched = React.useMemo<MatchedPosition[]>(
    () =>
      parsed === null ? [] : matchPositions(parsed.file.positions, securities, aliases),
    [parsed, securities, aliases],
  );

  const unmatched = matched.filter((entry) => entry.securityId === null);
  const archivedHits = matched.filter((entry) => entry.archived);

  /** Aenderungen je Stammdatenfeld — die Ebene, auf der abgewaehlt wird. */
  const changesByField = React.useMemo(() => {
    const grouped = new Map<
      SecurityField,
      { name: string; from: string | null; to: string }[]
    >();
    for (const entry of matched) {
      for (const change of entry.changes) {
        const list = grouped.get(change.field) ?? [];
        list.push({
          name: entry.securityName ?? entry.position.name,
          from: change.from,
          to: change.to,
        });
        grouped.set(change.field, list);
      }
    }
    return grouped;
  }, [matched]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const rejection = checkImportFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (rejection) {
      setState({ step: "error", message: rejection });
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setState({
        step: "error",
        message: "Der Portfolio-Export von DivvyDiary ist eine CSV-Datei.",
      });
      return;
    }

    try {
      const result = parseDivvyDiaryCsv(await file.arrayBuffer());
      if (result.positions.length === 0) {
        setState({
          step: "error",
          message:
            result.totalRows === 0
              ? "Die Datei enthält keine Datenzeilen."
              : "In der Datei steht keine Position mit Bestand. Es gibt damit keinen Depotstand zu speichern.",
        });
        return;
      }
      setParsed({ file: result, fileName: file.name });
      // Der Stichtag aus dem Dateinamen ist ein Vorschlag, kein Vertrag: Wer
      // die Datei umbenennt, bekommt das heutige Datum vorgelegt und kann es
      // ändern.
      setAsOf(parseExportDate(file.name) ?? toIsoDay(new Date()));
      setState({ step: "preview" });
    } catch (error) {
      setState({
        step: "error",
        message: getErrorMessage(error, "Die Datei konnte nicht gelesen werden."),
      });
    }
  };

  const toggleField = (field: SecurityField) => {
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const handleImport = async () => {
    if (parsed === null) return;

    try {
      const securityIdByRow = new Map<number, string>();
      let created = 0;
      let updated = 0;
      // Ein einzelnes Unternehmen darf den ganzen Lauf nicht abbrechen — etwa,
      // wenn eine ergaenzte ISIN mit einem anderen Eintrag kollidiert. Die
      // uebrigen Staende sind davon unberuehrt und sollen gespeichert werden;
      // was misslang, steht danach namentlich in der Zusammenfassung.
      const failures: string[] = [];

      // 1) Fehlende Unternehmen anlegen — die Snapshots brauchen sie als
      //    Fremdschluessel, bevor sie geschrieben werden koennen.
      if (createMissing) {
        setState({
          step: "importing",
          label: `Lege ${formatCountNoun(unmatched.length, "Unternehmen", "Unternehmen")} an …`,
        });
        for (const entry of unmatched) {
          const { position } = entry;
          try {
            const security = await createSecurity.mutateAsync({
              name: position.name,
              ticker: position.ticker,
              isin: position.isin,
              wkn: position.wkn,
              country: position.country,
              sector: position.sector,
              currency: position.dividendCurrency,
              data_quality: deriveDataQuality({
                ticker: position.ticker,
                isin: position.isin,
                wkn: position.wkn,
                country: position.country,
              }),
            });
            securityIdByRow.set(position.sourceRow, security.id);
            created += 1;
          } catch (error) {
            failures.push(
              `${position.name} konnte nicht angelegt werden: ${getErrorMessage(error, "unbekannter Fehler")}`,
            );
          }
        }
      }

      // 2) Stammdaten der getroffenen Unternehmen ergaenzen — nur die Felder,
      //    die in der Vorschau angehakt sind.
      const withUpdates = matched.filter(
        (entry) =>
          entry.securityId !== null &&
          entry.changes.some((change) => selectedFields.has(change.field)),
      );
      if (withUpdates.length > 0) {
        setState({ step: "importing", label: "Ergänze Stammdaten …" });
        for (const entry of withUpdates) {
          if (entry.securityId === null) continue;
          const input: Record<string, string> = {};
          for (const change of entry.changes) {
            if (selectedFields.has(change.field)) input[change.field] = change.to;
          }
          try {
            await updateSecurity.mutateAsync({ id: entry.securityId, input });
            updated += 1;
          } catch (error) {
            failures.push(
              `Stammdaten von ${entry.securityName ?? entry.position.name} unverändert: ${getErrorMessage(error, "unbekannter Fehler")}`,
            );
          }
        }
      }

      // 3) Den Depotstand als Ganzes schreiben.
      setState({ step: "importing", label: "Speichere den Depotstand …" });
      const snapshots: Omit<SecuritySnapshotInsert, "run_id" | "as_of">[] = [];
      for (const entry of matched) {
        const securityId =
          entry.securityId ?? securityIdByRow.get(entry.position.sourceRow) ?? null;
        if (securityId === null) continue;
        const { position } = entry;
        snapshots.push({
          security_id: securityId,
          quantity: position.quantity,
          buyin_per_share: position.buyinPerShare,
          buyin_total: position.buyinTotal,
          price: position.price,
          market_value: position.marketValue,
          gain_absolute: position.gainAbsolute,
          gain_relative: position.gainRelative,
          allocation: position.allocation,
          dividend_yield: position.dividendYield,
          dividend_yield_on_buyin: position.dividendYieldOnBuyin,
          annual_dividend_total: position.annualDividendTotal,
          dividend_per_share: position.dividendPerShare,
          dividend_frequency: position.dividendFrequency,
          dividend_cagr: position.dividendCagr,
          dividend_cagr_period: position.dividendCagrPeriod,
          next_ex_date: position.nextExDate,
          next_pay_date: position.nextPayDate,
          asset_type: position.assetType,
          currency: position.currency,
        });
      }

      const skipped =
        parsed.file.withoutHolding + (parsed.file.positions.length - snapshots.length);

      await importRun.mutateAsync({
        asOf,
        fileName: parsed.fileName,
        rowsTotal: parsed.file.totalRows,
        rowsImported: snapshots.length,
        rowsSkipped: skipped,
        rowsInvalid: parsed.file.invalid.length,
        snapshots,
      });

      setState({
        step: "done",
        asOf,
        imported: snapshots.length,
        created,
        updated,
        skipped,
        failures,
      });
    } catch (error) {
      setState({
        step: "error",
        message: getErrorMessage(
          error,
          "Der Depotstand konnte nicht gespeichert werden.",
        ),
      });
    }
  };

  const importable =
    matched.filter((entry) => entry.securityId !== null).length +
    (createMissing ? unmatched.length : 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Depotstand aus DivvyDiary importieren</DialogTitle>
          <DialogDescription>
            Liest den Portfolio-Export (CSV) und speichert je Position einen Stand zum
            gewählten Stichtag. Zeilen ohne Bestand werden übersprungen. Es entsteht kein
            Dividendeneingang — erhaltene Zahlungen bleiben unberührt.
          </DialogDescription>
        </DialogHeader>

        {state.step === "select" && (
          <div className="space-y-2">
            <Label htmlFor="portfolio-file">Portfolio-Export (.csv)</Label>
            <input
              id="portfolio-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFileChange(event)}
              className="w-full text-sm"
            />
          </div>
        )}

        {state.step === "error" && (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-negative">
              {state.message}
            </p>
            <Button variant="outline" onClick={reset}>
              Andere Datei wählen
            </Button>
          </div>
        )}

        {state.step === "preview" && parsed !== null && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="portfolio-as-of">Stichtag des Bestands</Label>
              <Input
                id="portfolio-as-of"
                type="date"
                value={asOf}
                max={toIsoDay(new Date())}
                onChange={(event) => {
                  setAsOf(event.target.value);
                }}
                className="max-w-48"
              />
              <p className="text-xs text-muted-foreground">
                Aus dem Dateinamen gelesen. Ein vorhandener Stand dieses Tages wird
                ersetzt.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <Balance label="Zeilen" value={parsed.file.totalRows} />
              <Balance label="Mit Bestand" value={parsed.file.positions.length} />
              <Balance label="Ohne Bestand" value={parsed.file.withoutHolding} />
              <Balance label="Ungültig" value={parsed.file.invalid.length} />
            </dl>

            {changesByField.size > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Stammdaten ergänzen</legend>
                <p className="text-xs text-muted-foreground">
                  Vorhandene Werte werden nur ersetzt, wenn die Quelle abweicht. Leere
                  Angaben der Quelle lassen deine Daten unangetastet. Die ISIN wird nur
                  ergänzt, nie geändert.
                </p>
                {/* Zweispaltig, sobald der Platz reicht: Sechs Felder mit je zwei
                    Zeilen fuellten sonst allein schon einen halben Bildschirm und
                    schoben die Bestaetigung aus dem Sichtfeld. */}
                <div className="grid gap-2 sm:grid-cols-2">
                  {FIELD_ORDER.filter((field) => changesByField.has(field)).map(
                    (field) => {
                      const entries = changesByField.get(field) ?? [];
                      return (
                        <label
                          key={field}
                          className="flex items-start gap-2 text-sm"
                          htmlFor={`field-${field}`}
                        >
                          <Checkbox
                            id={`field-${field}`}
                            checked={selectedFields.has(field)}
                            onChange={() => {
                              toggleField(field);
                            }}
                          />
                          <span className="min-w-0">
                            {FIELD_LABELS[field]} für{" "}
                            {formatCountNoun(
                              entries.length,
                              "Unternehmen",
                              "Unternehmen",
                            )}
                            <span className="block truncate text-xs text-muted-foreground">
                              {entries
                                .slice(0, 2)
                                .map(
                                  (entry) =>
                                    `${entry.name}: ${entry.from ?? "—"} → ${entry.to}`,
                                )
                                .join(" · ")}
                              {entries.length > 2 &&
                                ` · und ${formatCountNumber(entries.length - 2)} weitere`}
                            </span>
                          </span>
                        </label>
                      );
                    },
                  )}
                </div>
              </fieldset>
            )}

            {unmatched.length > 0 && (
              <label
                className="flex items-start gap-2 text-sm"
                htmlFor="create-missing-securities"
              >
                <Checkbox
                  id="create-missing-securities"
                  checked={createMissing}
                  onChange={(event) => {
                    setCreateMissing(event.target.checked);
                  }}
                />
                <span>
                  {formatCountNoun(unmatched.length, "Unternehmen", "Unternehmen")} neu
                  anlegen
                  <span className="block text-xs text-muted-foreground">
                    {unmatched
                      .slice(0, 4)
                      .map((entry) => entry.position.name)
                      .join(", ")}
                    {unmatched.length > 4 &&
                      ` und ${formatCountNumber(unmatched.length - 4)} weitere`}
                  </span>
                </span>
              </label>
            )}

            {archivedHits.length > 0 && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                {formatCountNoun(
                  archivedHits.length,
                  "Unternehmen ist",
                  "Unternehmen sind",
                )}{" "}
                archiviert, hält laut Datei aber Bestand. Der Stand wird gespeichert; die
                Archivierung bleibt unverändert.
              </p>
            )}

            {parsed.file.invalid.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  {formatCountNoun(parsed.file.invalid.length, "Zeile", "Zeilen")} konnte
                  nicht gelesen werden
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-negative">
                  {parsed.file.invalid.map((row) => (
                    <li key={row.sourceRow}>
                      Zeile {formatCountNumber(row.sourceRow)}: {row.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unternehmen</TableHead>
                    <TableHead>ISIN</TableHead>
                    <TableHead className="text-right">Stück</TableHead>
                    <TableHead>Zuordnung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matched.map((entry) => (
                    <TableRow key={entry.position.sourceRow}>
                      <TableCell className="font-medium">
                        {entry.securityName ?? entry.position.name}
                        {entry.securityName !== null &&
                          entry.securityName !== entry.position.name && (
                            <span className="block text-xs text-muted-foreground">
                              laut Quelle: {entry.position.name}
                            </span>
                          )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.position.isin}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {entry.position.quantity}
                      </TableCell>
                      <TableCell>
                        {entry.securityId === null ? (
                          <Badge variant={createMissing ? "positive" : "neutral"}>
                            {createMissing ? "Wird angelegt" : "Übersprungen"}
                          </Badge>
                        ) : (
                          <Badge variant="neutral">{MATCH_LABELS[entry.matchKind]}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {state.step === "importing" && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {state.label}
          </p>
        )}

        {state.step === "done" && (
          <div className="space-y-2 text-sm">
            <p>
              Depotstand vom {formatCalendarDate(state.asOf)} gespeichert:{" "}
              {formatCountNoun(state.imported, "Position", "Positionen")}.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {state.created > 0 && (
                <li>
                  {formatCountNoun(state.created, "Unternehmen", "Unternehmen")} neu
                  angelegt
                </li>
              )}
              {state.updated > 0 && (
                <li>
                  Stammdaten von{" "}
                  {formatCountNoun(state.updated, "Unternehmen", "Unternehmen")} ergänzt
                </li>
              )}
              <li>
                {formatCountNoun(state.skipped, "Zeile", "Zeilen")} ohne Bestand
                übersprungen
              </li>
            </ul>
            {state.failures.length > 0 && (
              <>
                <p className="text-negative">
                  Der Depotstand ist gespeichert. Bei den folgenden Unternehmen blieben
                  die Stammdaten unverändert:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-negative">
                  {state.failures.map((failure) => (
                    <li key={failure}>{failure}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {state.step === "preview" && (
            <Button onClick={() => void handleImport()} disabled={importable === 0}>
              {formatCountNoun(importable, "Position", "Positionen")} übernehmen
            </Button>
          )}
          {state.step === "done" && (
            <Button
              onClick={() => {
                handleClose(false);
              }}
            >
              Schließen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Eine Zahl der Importbilanz (IMPORT_SPEC.md §8). */
function Balance({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{formatCountNumber(value)}</dd>
    </div>
  );
}

export function PortfolioImportButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Upload /> Depotstand importieren
      </Button>
      <PortfolioImportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
