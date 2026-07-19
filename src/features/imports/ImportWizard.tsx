import * as React from "react";
import { UploadCloud, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/lib/money/money";
import { EUR } from "@/lib/money/currency";
import { formatMoney } from "@/lib/money/format";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useSecurities } from "@/features/securities/hooks";
import { useDepots } from "@/features/depots/hooks";
import { useCommitImport } from "@/features/imports/hooks";
import {
  createImport,
  findCommittedImportByHash,
  fetchSecurityAliases,
  type Import,
} from "@/lib/supabase/repositories/imports";
import {
  analyzeWorkbook,
  readSheet,
  type SheetInfo,
  type ImportCellValue,
} from "@/lib/import/parseWorkbook";
import { parseCsv } from "@/lib/import/parseCsv";
import { hashFile } from "@/lib/import/fingerprint";
import {
  suggestColumnMapping,
  missingRequiredFields,
  REQUIRED_FIELDS,
  FIELD_LABELS,
  type ColumnMapping,
} from "@/lib/import/columnMapping";
import { detectDateFormat, type DateFormat } from "@/lib/import/parseDate";
import { normalizeRows, groupCompanies, groupBrokers } from "@/lib/import/pipeline";
import { computeChecksums } from "@/lib/import/checksums";
import { buildCommitPayload } from "@/lib/import/buildCommitPayload";
import { normalizeCompareName } from "@/lib/import/normalizeName";
import type {
  NormalizedRow,
  CompanyGroup,
  BrokerGroup,
  CompanyDecision,
  BrokerDecision,
} from "@/lib/import/types";

function eur(canonical: string): string {
  return formatMoney(Money.fromString(canonical, EUR));
}

type Phase =
  | "select"
  | "analyzing"
  | "mapping"
  | "review"
  | "preview"
  | "importing"
  | "done"
  | "error";

interface WizardData {
  fileName: string;
  fileSize: number;
  fileType: "csv" | "xlsx" | "xls";
  fileHash: string;
  buffer: ArrayBuffer;
  sheets: SheetInfo[];
  date1904: boolean;
  selectedSheet: string;
  rows: ImportCellValue[][];
  header: string[];
  mapping: ColumnMapping;
  dateFormat: DateFormat;
}

const REVIEW_ROW_LIMIT = 300;

export function ImportWizard({ onFinished }: { onFinished: () => void }) {
  const { data: existingSecurities = [] } = useSecurities();
  const { data: existingDepots = [] } = useDepots();
  const commit = useCommitImport();

  const [phase, setPhase] = React.useState<Phase>("select");
  const [error, setError] = React.useState<string>("");
  const [data, setData] = React.useState<WizardData | null>(null);
  const [priorImport, setPriorImport] = React.useState<Import | null>(null);
  const [eurConfirmed, setEurConfirmed] = React.useState(false);

  const [rows, setRows] = React.useState<NormalizedRow[]>([]);
  const [companyGroups, setCompanyGroups] = React.useState<CompanyGroup[]>([]);
  const [brokerGroups, setBrokerGroups] = React.useState<BrokerGroup[]>([]);
  const [companyDecisions, setCompanyDecisions] = React.useState<
    Map<string, CompanyDecision>
  >(new Map());
  const [brokerDecisions, setBrokerDecisions] = React.useState<
    Map<string, BrokerDecision>
  >(new Map());
  const [result, setResult] = React.useState<Import | null>(null);
  const [detailFilter, setDetailFilter] = React.useState("");
  const dragRef = React.useRef<HTMLLabelElement>(null);

  const fail = (message: string) => {
    setError(message);
    setPhase("error");
  };

  // ---- Phase A: Datei auswaehlen und analysieren -------------------------
  async function handleFile(file: File) {
    setPhase("analyzing");
    setError("");
    try {
      const buffer = await file.arrayBuffer();
      const fileHash = await hashFile(buffer);
      const lower = file.name.toLowerCase();
      const fileType: "csv" | "xlsx" | "xls" = lower.endsWith(".csv")
        ? "csv"
        : lower.endsWith(".xls")
          ? "xls"
          : "xlsx";

      const prior = await findCommittedImportByHash(fileHash);
      setPriorImport(prior);

      let sheets: SheetInfo[];
      let date1904 = false;
      if (fileType === "csv") {
        sheets = [
          {
            name: "CSV",
            state: "visible",
            hidden: false,
            rowCount: 0,
            columnCount: 0,
            hasMergedCells: false,
          },
        ];
      } else {
        const analysis = await analyzeWorkbook(buffer);
        sheets = analysis.sheets;
        date1904 = analysis.date1904;
      }
      const firstVisible = sheets.find((s) => !s.hidden) ?? sheets.at(0);
      if (!firstVisible) throw new Error("Die Datei enthält kein Arbeitsblatt.");

      const partial: WizardData = {
        fileName: file.name,
        fileSize: file.size,
        fileType,
        fileHash,
        buffer,
        sheets,
        date1904,
        selectedSheet: firstVisible.name,
        rows: [],
        header: [],
        mapping: {},
        dateFormat: "iso",
      };
      await loadSheet(partial, firstVisible.name);
    } catch (err) {
      fail(getErrorMessage(err, "Datei konnte nicht gelesen werden."));
    }
  }

  async function loadSheet(base: WizardData, sheetName: string) {
    let allRows: ImportCellValue[][];
    if (base.fileType === "csv") {
      const parsed = parseCsv(base.buffer);
      allRows = parsed.rows;
    } else {
      const sheet = await readSheet(base.buffer, sheetName);
      allRows = sheet.rows;
    }
    if (allRows.length < 2)
      throw new Error("Das Tabellenblatt enthält keine Datenzeilen.");
    const header = (allRows.at(0) ?? []).map((c) => String(c ?? "").trim());
    const mapping = suggestColumnMapping(header);
    const payCol = mapping.pay_date;
    const dateSamples: ImportCellValue[] =
      payCol === undefined ? [] : allRows.slice(1, 60).map((r) => r.at(payCol) ?? null);
    const detected = detectDateFormat(dateSamples);
    setData({
      ...base,
      selectedSheet: sheetName,
      rows: allRows,
      header,
      mapping,
      dateFormat: detected.format ?? "iso",
    });
    setEurConfirmed(false);
    setPhase("mapping");
  }

  // ---- Phase C: Normalisieren und gruppieren -----------------------------
  async function proceedToReview() {
    if (!data) return;
    const { pay_date, security, net_amount, broker } = data.mapping;
    if (
      pay_date === undefined ||
      security === undefined ||
      net_amount === undefined ||
      broker === undefined
    ) {
      return;
    }
    setPhase("analyzing");
    try {
      const aliases = await fetchSecurityAliases();
      const normalized = await normalizeRows(
        data.rows.slice(1),
        { date: pay_date, investment: security, amount: net_amount, broker },
        {
          dateFormat: data.dateFormat,
          numberFormat: "auto",
          date1904: data.date1904,
          currency: "EUR",
          minDate: "1970-01-01",
          maxDate: new Date().toISOString().slice(0, 10),
        },
      );
      const secForMatch = existingSecurities.map((s) => ({
        id: s.id,
        name: s.name,
        isin: s.isin,
        wkn: s.wkn,
        archived: s.archived_at !== null,
      }));
      const depForMatch = existingDepots.map((d) => ({
        id: d.id,
        name: d.name,
        broker: d.broker,
        archived: d.archived_at !== null,
      }));
      const cGroups = groupCompanies(normalized, secForMatch, aliases);
      const bGroups = groupBrokers(normalized, depForMatch);
      setRows(normalized);
      setCompanyGroups(cGroups);
      setBrokerGroups(bGroups);
      setCompanyDecisions(new Map(cGroups.map((g) => [g.normalized, g.defaultDecision])));
      setBrokerDecisions(new Map(bGroups.map((g) => [g.normalized, g.defaultDecision])));
      setPhase("review");
    } catch (err) {
      fail(getErrorMessage(err, "Die Datei konnte nicht normalisiert werden."));
    }
  }

  // ---- Phase D: Commit ---------------------------------------------------
  async function handleCommit() {
    if (!data) return;
    setPhase("importing");
    try {
      const payload = buildCommitPayload({
        rows,
        companyDecisions,
        brokerDecisions,
        sheetName: data.selectedSheet,
        columnMapping: data.mapping,
      });
      const imp = await createImport({
        file_name: data.fileName,
        file_hash: data.fileHash,
        file_size_bytes: data.fileSize,
        file_type: data.fileType,
        sheet_name: data.selectedSheet,
        status: "pending_confirmation",
        column_mapping: data.mapping,
      });
      const committed = await commit.mutateAsync({ importId: imp.id, payload });
      setResult(committed);
      setPhase("done");
    } catch (err) {
      fail(
        getErrorMessage(
          err,
          "Der Import ist fehlgeschlagen und wurde vollständig zurückgerollt.",
        ),
      );
    }
  }

  // ---- Abgeleitete Werte -------------------------------------------------
  const importable = React.useMemo(
    () =>
      rows.filter((r) => {
        if (r.status !== "valid" && r.status !== "valid_warning") return false;
        const decision = companyDecisions.get(normalizeCompareName(r.investmentName));
        return decision?.kind !== "exclude";
      }),
    [rows, companyDecisions],
  );
  const checksums = React.useMemo(
    () =>
      computeChecksums(
        importable.flatMap((r) =>
          r.payDate !== null && r.netAmount !== null
            ? [{ payDate: r.payDate, netAmount: r.netAmount, broker: r.brokerName }]
            : [],
        ),
      ),
    [importable],
  );
  const invalidCount = rows.filter((r) => r.status === "invalid").length;
  const dedupeCount = rows.filter((r) => r.status === "needs_dedupe").length;
  const newCompanyCount = [...companyDecisions.values()].filter(
    (d) => d.kind === "new",
  ).length;
  const newDepotCount = [...brokerDecisions.values()].filter(
    (d) => d.kind === "new",
  ).length;

  const filteredDetail = React.useMemo(() => {
    const term = detailFilter.trim().toLowerCase();
    const base = term
      ? rows.filter(
          (r) =>
            r.investmentName.toLowerCase().includes(term) ||
            r.brokerName.toLowerCase().includes(term) ||
            (r.payDate ?? "").includes(term),
        )
      : rows;
    return base.slice(0, REVIEW_ROW_LIMIT);
  }, [rows, detailFilter]);

  // ---- Render ------------------------------------------------------------
  return (
    <div className="space-y-6">
      <StepIndicator phase={phase} />

      {phase === "select" && (
        <label
          ref={dragRef}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-input p-10 text-center transition hover:bg-muted/50"
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files.item(0);
            if (file) void handleFile(file);
          }}
        >
          <UploadCloud className="size-10 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Datei hierher ziehen oder auswählen</p>
            <p className="text-sm text-muted-foreground">
              Unterstützt: .xlsx, .xls, .csv
            </p>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {phase === "analyzing" && (
        <p className="text-sm text-muted-foreground">Datei wird analysiert …</p>
      )}

      {phase === "error" && (
        <div className="space-y-4">
          <p role="alert" className="flex items-start gap-2 text-sm text-negative">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setPhase("select");
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {phase === "mapping" && data && (
        <div className="space-y-5">
          {priorImport && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-warning"
                aria-hidden
              />
              <span>
                Diese Datei wurde bereits am{" "}
                {new Date(
                  priorImport.committed_at ?? priorImport.created_at,
                ).toLocaleDateString("de-DE")}{" "}
                importiert (Status: {priorImport.status}). Ein erneuter Import erzeugt
                doppelte Produktivdaten und ist standardmäßig zu vermeiden.
              </span>
            </div>
          )}

          {data.sheets.length > 1 && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Tabellenblatt</label>
              <Select
                value={data.selectedSheet}
                onChange={(e) => void loadSheet(data, e.target.value)}
              >
                {data.sheets.map((s) => (
                  <option key={s.name} value={s.name} disabled={s.hidden}>
                    {s.name} {s.hidden ? "(verborgen)" : ""} — {s.rowCount} Zeilen
                    {s.hasMergedCells ? " · verbundene Zellen!" : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Spaltenzuordnung</p>
            {REQUIRED_FIELDS.map((field) => (
              <div key={field} className="flex items-center gap-3">
                <span className="w-48 text-sm">{FIELD_LABELS[field]} *</span>
                <Select
                  value={data.mapping[field] ?? -1}
                  onChange={(e) => {
                    const idx = Number.parseInt(e.target.value, 10);
                    setData({
                      ...data,
                      mapping: { ...data.mapping, [field]: idx === -1 ? undefined : idx },
                    });
                  }}
                >
                  <option value={-1}>— nicht zugeordnet —</option>
                  {data.header.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Spalte ${String(i + 1)}`}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Datumsformat</label>
            <Select
              value={data.dateFormat}
              onChange={(e) => {
                setData({ ...data, dateFormat: e.target.value as DateFormat });
              }}
            >
              <option value="iso">ISO / echtes Datum (YYYY-MM-DD)</option>
              <option value="de">Deutsch (TT.MM.JJJJ)</option>
              <option value="dmy_slash">TT/MM/JJJJ</option>
              <option value="mdy_slash">MM/TT/JJJJ</option>
              <option value="excel_serial">Excel-Seriennummer</option>
            </Select>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-input p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={eurConfirmed}
              onChange={(e) => {
                setEurConfirmed(e.target.checked);
              }}
            />
            <span>
              Die Beträge sind <strong>Netto-Dividenden in Euro (EUR)</strong>. Da die
              Datei keine Brutto-/Steuerangaben enthält, wird{" "}
              <strong>brutto = netto</strong> gesetzt und Steuern = 0 (keine erfundenen
              Werte). Betroffene Zeilen: {data.rows.length - 1}.
            </span>
          </label>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={onFinished}>
              Abbrechen
            </Button>
            <Button
              onClick={() => void proceedToReview()}
              disabled={missingRequiredFields(data.mapping).length > 0 || !eurConfirmed}
            >
              Weiter zur Zuordnung
            </Button>
          </div>
        </div>
      )}

      {phase === "review" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Unternehmen ({companyGroups.length}) — {newCompanyCount} werden neu
                (archiviert) angelegt
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto p-0">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Quellname</TableHead>
                    <TableHead className="text-right">Zahlungen</TableHead>
                    <TableHead className="text-right">Summe</TableHead>
                    <TableHead>Vorschlag</TableHead>
                    <TableHead>Entscheidung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companyGroups.map((g) => (
                    <CompanyRow
                      key={g.normalized}
                      group={g}
                      decision={companyDecisions.get(g.normalized) ?? g.defaultDecision}
                      onChange={(decision) => {
                        setCompanyDecisions((prev) =>
                          new Map(prev).set(g.normalized, decision),
                        );
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Broker / Depots ({brokerGroups.length}) — {newDepotCount} werden neu
                angelegt
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quellbroker</TableHead>
                    <TableHead className="text-right">Zahlungen</TableHead>
                    <TableHead>Vorschlag</TableHead>
                    <TableHead>Entscheidung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brokerGroups.map((g) => (
                    <BrokerRow
                      key={g.normalized}
                      group={g}
                      depots={existingDepots.map((d) => ({ id: d.id, name: d.name }))}
                      decision={brokerDecisions.get(g.normalized) ?? g.defaultDecision}
                      onChange={(decision) => {
                        setBrokerDecisions((prev) =>
                          new Map(prev).set(g.normalized, decision),
                        );
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setPhase("mapping");
              }}
            >
              Zurück
            </Button>
            <Button
              onClick={() => {
                setPhase("preview");
              }}
            >
              Weiter zur Vorschau
            </Button>
          </div>
        </div>
      )}

      {phase === "preview" && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Gültige Zeilen" value={String(importable.length)} />
            <Stat label="Gesamtsumme" value={eur(checksums.totalNet)} />
            <Stat
              label="Zeitraum"
              value={`${checksums.minDate ?? "—"} – ${checksums.maxDate ?? "—"}`}
            />
            <Stat
              label="Fehler / Duplikate"
              value={`${String(invalidCount)} / ${String(dedupeCount)}`}
              variant={invalidCount > 0 ? "negative" : "neutral"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kontrollwerte je Jahr</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jahr</TableHead>
                    <TableHead className="text-right">Anzahl</TableHead>
                    <TableHead className="text-right">Summe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(checksums.byYear).map(([year, bucket]) => (
                    <TableRow key={year}>
                      <TableCell>{year}</TableCell>
                      <TableCell className="text-right">{bucket.count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {eur(bucket.sum)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detailvorschau</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Filtern nach Unternehmen, Broker oder Datum …"
                value={detailFilter}
                onChange={(e) => {
                  setDetailFilter(e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Zeigt max. {REVIEW_ROW_LIMIT} von {rows.length} Zeilen (gefiltert).
              </p>
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Zeile</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Unternehmen</TableHead>
                      <TableHead className="text-right">Betrag</TableHead>
                      <TableHead>Broker</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDetail.map((r) => (
                      <TableRow key={r.sourceRowNumber}>
                        <TableCell className="text-muted-foreground">
                          {r.sourceRowNumber}
                        </TableCell>
                        <TableCell>{r.payDate ?? "—"}</TableCell>
                        <TableCell className="font-medium">{r.investmentName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.netAmount ? eur(r.netAmount) : "—"}
                        </TableCell>
                        <TableCell>{r.brokerName}</TableCell>
                        <TableCell>
                          <RowStatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {invalidCount > 0 && (
            <p className="flex items-start gap-2 text-sm text-negative">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {invalidCount} fehlerhafte Zeile(n) verhindern die Freigabe. Bitte die
              Quelldatei korrigieren.
            </p>
          )}

          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setPhase("review");
              }}
            >
              Zurück
            </Button>
            <Button
              onClick={() => void handleCommit()}
              disabled={invalidCount > 0 || importable.length === 0}
            >
              {importable.length} Eingänge endgültig importieren
            </Button>
          </div>
        </div>
      )}

      {phase === "importing" && (
        <p className="text-sm text-muted-foreground">
          Import wird atomar in einer Transaktion gespeichert und serverseitig geprüft …
        </p>
      )}

      {phase === "done" && result && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-5 text-positive" aria-hidden />
            <span>
              Import abgeschlossen: {importable.length} Eingänge über{" "}
              {eur(checksums.totalNet)} gespeichert und serverseitig verifiziert.
            </span>
          </p>
          <Button onClick={onFinished}>Zur Importübersicht</Button>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ phase }: { phase: Phase }) {
  const steps = ["Datei", "Zuordnung", "Prüfung", "Vorschau", "Fertig"];
  const active =
    phase === "select" || phase === "analyzing"
      ? 0
      : phase === "mapping"
        ? 1
        : phase === "review"
          ? 2
          : phase === "preview" || phase === "importing"
            ? 3
            : phase === "done"
              ? 4
              : 0;
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-1">
          <span
            className={
              i <= active
                ? "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                : "flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground"
            }
          >
            {i + 1}
          </span>
          <span className={i === active ? "font-medium" : "text-muted-foreground"}>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Stat({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: string;
  variant?: "neutral" | "negative";
}) {
  return (
    <div className="rounded-md border border-input p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-semibold ${variant === "negative" ? "text-negative" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function RowStatusBadge({ status }: { status: NormalizedRow["status"] }) {
  const map: Record<
    NormalizedRow["status"],
    { label: string; variant: "positive" | "warning" | "negative" | "neutral" }
  > = {
    valid: { label: "Gültig", variant: "positive" },
    valid_warning: { label: "Warnung", variant: "warning" },
    needs_mapping: { label: "Zuordnung", variant: "warning" },
    needs_dedupe: { label: "Duplikat prüfen", variant: "warning" },
    invalid: { label: "Ungültig", variant: "negative" },
    excluded: { label: "Ausgeschlossen", variant: "neutral" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function CompanyRow({
  group,
  decision,
  onChange,
}: {
  group: CompanyGroup;
  decision: CompanyDecision;
  onChange: (decision: CompanyDecision) => void;
}) {
  const similarPercent = String(Math.round((group.match.similarity ?? 0) * 100));
  const suggestionLabel =
    group.match.reason === "exact_name"
      ? `Bestehend: ${group.match.securityName ?? ""}`
      : group.match.reason === "alias"
        ? `Alias → ${group.match.securityName ?? ""}`
        : group.match.reason === "similar"
          ? `Ähnlich: ${group.match.suggestions.at(0)?.securityName ?? ""} (${similarPercent} %)`
          : "Kein Treffer";
  return (
    <TableRow>
      <TableCell className="font-medium">{group.sourceName}</TableCell>
      <TableCell className="text-right">{group.count}</TableCell>
      <TableCell className="text-right tabular-nums">{eur(group.sum)}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{suggestionLabel}</TableCell>
      <TableCell>
        <Select
          value={
            decision.kind === "new"
              ? "new"
              : decision.kind === "exclude"
                ? "exclude"
                : (decision.securityId ?? "new")
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "new") onChange({ kind: "new" });
            else if (v === "exclude") onChange({ kind: "exclude" });
            else
              onChange({
                kind: group.match.reason === "alias" ? "alias" : "existing",
                securityId: v,
              });
          }}
        >
          <option value="new">Neu (archiviert) anlegen</option>
          {group.match.securityId && (
            <option value={group.match.securityId}>Bestehendem zuordnen</option>
          )}
          {group.match.suggestions.map((s) => (
            <option key={s.securityId} value={s.securityId}>
              Zuordnen: {s.securityName}
            </option>
          ))}
          <option value="exclude">Vom Import ausschließen</option>
        </Select>
      </TableCell>
    </TableRow>
  );
}

function BrokerRow({
  group,
  depots,
  decision,
  onChange,
}: {
  group: BrokerGroup;
  depots: { id: string; name: string }[];
  decision: BrokerDecision;
  onChange: (decision: BrokerDecision) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{group.sourceName}</TableCell>
      <TableCell className="text-right">{group.count}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {group.match.reason === "none"
          ? "Kein Depot gefunden"
          : `Bestehend: ${group.match.depotName ?? ""}`}
      </TableCell>
      <TableCell>
        <Select
          value={decision.kind === "new" ? "new" : (decision.depotId ?? "new")}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "new") onChange({ kind: "new" });
            else onChange({ kind: "existing", depotId: v });
          }}
        >
          <option value="new">Neues Depot „{group.sourceName}" anlegen</option>
          {depots.map((d) => (
            <option key={d.id} value={d.id}>
              Depot: {d.name}
            </option>
          ))}
        </Select>
      </TableCell>
    </TableRow>
  );
}
