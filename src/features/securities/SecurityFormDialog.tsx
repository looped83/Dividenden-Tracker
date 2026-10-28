import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { cn } from "@/lib/utils/cn";
import { isoFromRef, monthNameDeShort, normalizePayoutMonths } from "@/lib/statistics";
import { useToday } from "@/lib/hooks/useToday";
import { formatPercent } from "@/lib/money";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDepots } from "@/features/depots/hooks";
import { useCreateSecurity, useUpdateSecurity } from "@/features/securities/hooks";
import {
  securityFormSchema,
  type SecurityFormValues,
} from "@/features/securities/schemas";
import { deriveDataQuality } from "@/features/securities/dataQuality";
import { parseGermanNumber } from "@/features/securities/forecastSettings";
import {
  isPositionCap,
  useDepotShare,
  usePositionCaps,
  useSavePositionCap,
} from "@/features/planner/positionCaps";
import {
  useSavingsPlans,
  useSaveSavingsPlans,
} from "@/features/planner/savingsPlanHooks";
import { SAVINGS_PLANS_MAX, type SavingsPlan } from "@/features/planner/savingsPlans";
import { SavingsPlanFields } from "@/features/planner/SavingsPlanFields";
import {
  draftFromPlan,
  emptyDraft,
  planFromDraft,
  type SavingsPlanDraft,
} from "@/features/planner/savingsPlanDraft";
import { formatDecimal } from "@/features/planner/format";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Alles an einem Asset anlegen oder bearbeiten: Stammdaten, Ausschuettung,
 * Planung (Zielgewichtung, Sparplan) und Notiz. Seit 2.45.0 der einzige Ort
 * dafuer — die Seite des Assets zeigt nur noch an. Zuvor liessen sich
 * Reinvestition, Sparplan und Zielgewichtung dort direkt aendern, der Rest hier.
 *
 * „Asset" statt „Unternehmen": Im Depot liegen ebenso ETFs, Fonds und Anleihen.
 * Der Datentyp heisst weiterhin `Security` — die Umbenennung betrifft die
 * Sprache der Oberflaeche, nicht das Datenmodell (DATA_MODEL.md).
 */
export function SecurityFormDialog({
  security,
  open,
  onOpenChange,
}: {
  security: Security | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Breiter als der Standard, damit Branche und Depotkonto in der
        // zweiten Zeile nicht abgeschnitten werden.
        className="max-w-2xl"
        // Radix fokussiert sonst das erste Feld **und markiert dessen Text** —
        // beim Bearbeiten stand der Name blau hinterlegt, und der erste
        // Tastendruck haette ihn ersetzt (wie in `PaymentComposerDialog`).
        // Beim Bearbeiten nimmt der Dialog selbst den Fokus; beim Anlegen
        // bleibt das leere Namensfeld das Ziel.
        onOpenAutoFocus={(event) => {
          if (!security) return;
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{security ? "Asset bearbeiten" : "Neues Asset"}</DialogTitle>
        </DialogHeader>
        {/* Der Inhalt entsteht mit jedem Oeffnen neu: Die Entwuerfe beginnen
            so immer beim gespeicherten Stand, ohne Abgleich in einem Effekt. */}
        <SecurityForm
          security={security}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Wartet auf Zielgewichtungen und Sparplaene, damit die Entwuerfe stimmen. */
function SecurityForm({
  security,
  onDone,
}: {
  security: Security | null;
  onDone: () => void;
}) {
  const { data: caps } = usePositionCaps();
  const { data: plans } = useSavingsPlans();
  if (caps === undefined || plans === undefined) {
    return <p className="text-sm text-muted-foreground">Lädt …</p>;
  }
  return (
    <SecurityFormBody security={security} caps={caps} plans={plans} onDone={onDone} />
  );
}

function SecurityFormBody({
  security,
  caps,
  plans,
  onDone,
}: {
  security: Security | null;
  caps: ReadonlyMap<string, number>;
  plans: readonly SavingsPlan[];
  onDone: () => void;
}) {
  const createSecurity = useCreateSecurity();
  const updateSecurity = useUpdateSecurity();
  const saveCaps = useSavePositionCap();
  const savePlans = useSaveSavingsPlans();
  const today = useToday();
  const { data: depots = [] } = useDepots();
  const activeDepots = depots.filter((depot) => !depot.archived_at);
  const share = useDepotShare(security?.id);
  const archived = Boolean(security?.archived_at);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // Ausschuettungsmonate, Reinvestition und Planung ausserhalb des
  // Zod-Formulars als einfache Auswahl.
  const [payoutMonths, setPayoutMonths] = React.useState<number[]>(
    security?.payout_months ?? [],
  );
  // Pflichtfeld (seit 2.23.0): Der Hinweis erscheint erst nach dem ersten
  // Speicherversuch und verschwindet, sobald ein Monat gewaehlt ist.
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [reinvest, setReinvest] = React.useState(Boolean(security?.reinvest_since));
  const ownCap = security ? caps.get(security.id) : undefined;
  const [weighting, setWeighting] = React.useState(
    ownCap === undefined ? "" : formatDecimal(ownCap),
  );
  const ownPlans = React.useMemo(
    () => (security ? plans.filter((plan) => plan.securityId === security.id) : []),
    [plans, security],
  );
  const [planDrafts, setPlanDrafts] = React.useState<SavingsPlanDraft[]>(() =>
    ownPlans.map(draftFromPlan),
  );
  const monthsMissing = payoutMonths.length === 0;
  const togglePayoutMonth = (month: number) => {
    setPayoutMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month],
    );
  };
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
    defaultValues: {
      name: security?.name ?? "",
      ticker: security?.ticker ?? "",
      isin: security?.isin ?? "",
      wkn: security?.wkn ?? "",
      country: security?.country ?? "",
      sector: security?.sector ?? "",
      currency: security?.currency ?? "",
      note: security?.note ?? "",
      defaultDepotId: security?.default_depot_id ?? "",
    },
  });

  // Ein neuer Sparplan nimmt das Standard-Depot des Formulars.
  const addPlan = () => {
    setPlanDrafts((prev) => [...prev, emptyDraft(getValues("defaultDepotId"))]);
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    if (monthsMissing) return;

    // Planung zuerst pruefen: Ein Fehler dort speichert gar nichts, statt
    // die Stammdaten ohne die Planung zu sichern.
    const parsedCap = parseGermanNumber(weighting);
    if (parsedCap === undefined || (parsedCap !== null && !isPositionCap(parsedCap))) {
      setSubmitError("Die Zielgewichtung liegt zwischen 0,5 und 50 % (oder 0).");
      return;
    }
    const otherPlans = security
      ? plans.filter((plan) => plan.securityId !== security.id)
      : plans;
    if (otherPlans.length + planDrafts.length > SAVINGS_PLANS_MAX) {
      setSubmitError(
        `Mehr als ${String(SAVINGS_PLANS_MAX)} Sparpläne sind nicht möglich.`,
      );
      return;
    }
    for (const draft of planDrafts) {
      const checked = planFromDraft(draft, "");
      if (typeof checked === "string") {
        setSubmitError(`Sparplan: ${checked}`);
        return;
      }
    }

    const input = {
      name: values.name,
      ticker: emptyToNull(values.ticker),
      isin: emptyToNull(values.isin),
      wkn: emptyToNull(values.wkn),
      country: emptyToNull(values.country),
      sector: emptyToNull(values.sector),
      currency: emptyToNull(values.currency),
      note: emptyToNull(values.note),
      default_depot_id: emptyToNull(values.defaultDepotId),
      payout_months: normalizePayoutMonths(payoutMonths),
      // Ein bestehendes Datum bleibt; neu eingeschaltet gilt ab heute.
      reinvest_since: reinvest ? (security?.reinvest_since ?? isoFromRef(today)) : null,
      // Datenqualitaet spiegelt beim Speichern die Vollstaendigkeit der
      // Stammdaten wider (z. B. ergaenzte ISIN bei einem importierten,
      // archivierten Asset -> „OK"). „needs_review" aus dem Import bleibt
      // nur bestehen, solange die Felder unvollstaendig sind.
      data_quality: deriveDataQuality({
        ticker: emptyToNull(values.ticker),
        isin: emptyToNull(values.isin),
        wkn: emptyToNull(values.wkn),
        country: emptyToNull(values.country),
        sector: emptyToNull(values.sector),
        currency: emptyToNull(values.currency),
      }),
    };
    try {
      const saved = security
        ? await updateSecurity.mutateAsync({ id: security.id, input })
        : await createSecurity.mutateAsync(input);
      // Zielgewichtung und Sparplaene liegen am Profil; gespeichert wird nur,
      // was sich geaendert hat.
      const cap = parsedCap ?? undefined;
      if (cap !== ownCap) {
        const next = new Map(caps);
        if (cap === undefined) next.delete(saved.id);
        else next.set(saved.id, cap);
        await saveCaps.mutateAsync({ caps: next });
      }
      const nextOwn = planDrafts.map(
        (draft) => planFromDraft(draft, saved.id) as SavingsPlan,
      );
      if (JSON.stringify(nextOwn) !== JSON.stringify(ownPlans)) {
        await savePlans.mutateAsync([...otherPlans, ...nextOwn]);
      }
      onDone();
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Speichern fehlgeschlagen."));
    }
  });

  return (
    <form
      onSubmit={(event) => {
        setSubmitAttempted(true);
        void onSubmit(event);
      }}
      className="space-y-6"
    >
      <FormGroup legend="Stammdaten">
        {/* Kurze Felder teilen sich eine Zeile. Sechs Spalten tragen beide
            Raster: mobil ISIN | WKN, Ticker | Land | Währung, Branche |
            Depotkonto; ab `sm` Kennungen in einer Zeile, darunter die
            Einordnung. Reihenfolge der Kennungen wie im Kopf der Detailseite. */}
        <div className="grid grid-cols-6 gap-3 sm:gap-4">
          <div className="col-span-6 space-y-1.5">
            <Label htmlFor="security-name">Name</Label>
            <Input id="security-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-negative">{errors.name.message}</p>
            )}
          </div>
          <div className="col-span-3 space-y-1.5 sm:col-span-2">
            <Label htmlFor="security-isin">ISIN</Label>
            <Input id="security-isin" {...register("isin")} />
            {errors.isin && (
              <p className="text-sm text-negative">{errors.isin.message}</p>
            )}
          </div>
          <div className="col-span-3 space-y-1.5 sm:col-span-2">
            <Label htmlFor="security-wkn">WKN</Label>
            <Input id="security-wkn" {...register("wkn")} />
            {errors.wkn && <p className="text-sm text-negative">{errors.wkn.message}</p>}
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="security-ticker">Ticker</Label>
            <Input id="security-ticker" {...register("ticker")} />
            {errors.ticker && (
              <p className="text-sm text-negative">{errors.ticker.message}</p>
            )}
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor="security-country">Land</Label>
            <Input id="security-country" {...register("country")} />
            {errors.country && (
              <p className="text-sm text-negative">{errors.country.message}</p>
            )}
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor="security-currency">Währung</Label>
            <Input id="security-currency" {...register("currency")} />
            {errors.currency && (
              <p className="text-sm text-negative">{errors.currency.message}</p>
            )}
          </div>
          <div className="col-span-3 space-y-1.5 sm:col-span-2">
            <Label htmlFor="security-sector">Branche</Label>
            <Input id="security-sector" {...register("sector")} />
          </div>
          <div className="col-span-3 space-y-1.5 sm:col-span-2">
            <Label htmlFor="security-default-depot">Standard-Depot</Label>
            <Select id="security-default-depot" {...register("defaultDepotId")}>
              <option value="">Kein Standard-Depot</option>
              {activeDepots.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FormGroup>

      <FormGroup legend="Ausschüttung">
        <div className="space-y-1.5">
          <Label id="security-payout-months-label">Ausschüttungsmonate</Label>
          <div
            className="grid grid-cols-6 gap-1.5"
            role="group"
            aria-labelledby="security-payout-months-label"
            aria-describedby={
              submitAttempted && monthsMissing
                ? "security-payout-months-error"
                : undefined
            }
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
              const active = payoutMonths.includes(month);
              return (
                <button
                  key={month}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    togglePayoutMonth(month);
                  }}
                  className={cn(
                    "h-9 rounded-md border text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {monthNameDeShort(month)}
                </button>
              );
            })}
          </div>
          {submitAttempted && monthsMissing && (
            <p id="security-payout-months-error" className="text-sm text-negative">
              Wähle mindestens einen Monat.
            </p>
          )}
        </div>
        {/* Einschalten merkt sich den Tag: Erst Zahlungen ab dann zaehlen als
            reinvestiert. */}
        <div className="flex items-center justify-between gap-4">
          <span className="min-w-0">
            <Label id="security-reinvest-label" className="block">
              Dividenden reinvestieren
            </Label>
            {reinvest && (
              <span className="block text-[0.8125rem] text-muted-foreground">
                {security?.reinvest_since
                  ? `seit ${formatCalendarDate(security.reinvest_since)}`
                  : "ab heute"}
              </span>
            )}
          </span>
          <Switch
            aria-labelledby="security-reinvest-label"
            checked={reinvest}
            onCheckedChange={setReinvest}
          />
        </div>
      </FormGroup>

      {/* Archiviert schlaegt der Nachkauf das Asset nicht mehr vor; ein
          bestehender Sparplan bleibt sichtbar, damit er sich entfernen laesst. */}
      {(!archived || planDrafts.length > 0) && (
        <FormGroup legend="Planung">
          {!archived && (
            <div className="space-y-1.5">
              <Label htmlFor="security-weighting">Zielgewichtung</Label>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="relative w-28">
                  <AmountInput
                    id="security-weighting"
                    maxFractionDigits={1}
                    aria-describedby="security-weighting-hint"
                    value={weighting}
                    placeholder="0"
                    className="pr-7 text-right tabular-nums"
                    onChange={(event) => {
                      setWeighting(event.currentTarget.value);
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
                  >
                    %
                  </span>
                </div>
                <span
                  id="security-weighting-hint"
                  className="text-[0.8125rem] text-muted-foreground"
                >
                  {share === null
                    ? "Leer: kein Nachkauf"
                    : `Aktuell ${formatPercent(share, 1)} · leer: kein Nachkauf`}
                </span>
              </div>
            </div>
          )}

          {planDrafts.map((draft, index) => (
            <div key={draft.id ?? `neu-${String(index)}`} className="space-y-3">
              <div className="flex min-h-9 items-center justify-between gap-4">
                <span className="text-sm font-medium">Sparplan</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-negative hover:text-negative"
                  onClick={() => {
                    setPlanDrafts((prev) => prev.filter((_, other) => other !== index));
                  }}
                >
                  Entfernen
                </Button>
              </div>
              <SavingsPlanFields
                idPrefix={`security-plan-${String(index)}`}
                draft={draft}
                onChange={(next) => {
                  setPlanDrafts((prev) =>
                    prev.map((entry, other) => (other === index ? next : entry)),
                  );
                }}
              />
            </div>
          ))}
          {/* Ein weiterer Plan auf dasselbe Asset ist selten; er entsteht
              unter Planer › Sparpläne. */}
          {!archived && planDrafts.length === 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={plans.length >= SAVINGS_PLANS_MAX}
              onClick={addPlan}
            >
              <Plus aria-hidden /> Sparplan
            </Button>
          )}
        </FormGroup>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="security-note">Notiz</Label>
        <Textarea id="security-note" {...register("note")} />
      </div>
      {submitError && (
        <p role="alert" className="text-sm text-negative">
          {submitError}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {security ? "Speichern" : "Anlegen"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Eine Gruppe des Formulars mit kleiner Ueberschrift. */
function FormGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    // `min-w-0`: Ein fieldset ist von Haus aus mindestens so breit wie sein Inhalt.
    <fieldset className="min-w-0 space-y-3 sm:space-y-4">
      <legend className="mb-3 text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground sm:mb-4">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}
