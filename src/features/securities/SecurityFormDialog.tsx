import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { cn } from "@/lib/utils/cn";
import { isoFromRef, monthNameDeShort, normalizePayoutMonths } from "@/lib/statistics";
import { useToday } from "@/lib/hooks/useToday";
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
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Stammdaten eines Assets anlegen oder bearbeiten.
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
  const createSecurity = useCreateSecurity();
  const today = useToday();
  const updateSecurity = useUpdateSecurity();
  const { data: depots = [] } = useDepots();
  const activeDepots = depots.filter((depot) => !depot.archived_at);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // Ausschuettungsmonate und Reinvestition ausserhalb des Zod-Formulars als einfache Auswahl.
  // Wechselt das bearbeitete Asset, wird die Auswahl waehrend des Renderns
  // zurueckgesetzt (React-Muster fuer aus Props abgeleiteten Zustand).
  const [payoutMonths, setPayoutMonths] = React.useState<number[]>(
    security?.payout_months ?? [],
  );
  // Pflichtfeld (seit 2.23.0): Der Hinweis erscheint erst nach dem ersten
  // Speicherversuch und verschwindet, sobald ein Monat gewaehlt ist.
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [reinvest, setReinvest] = React.useState(Boolean(security?.reinvest_since));
  const [payoutSource, setPayoutSource] = React.useState(security);
  if (payoutSource !== security) {
    setPayoutSource(security);
    setPayoutMonths(security?.payout_months ?? []);
    setReinvest(Boolean(security?.reinvest_since));
    setSubmitAttempted(false);
  }
  const monthsMissing = payoutMonths.length === 0;
  const togglePayoutMonth = (month: number) => {
    setPayoutMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month],
    );
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
    values: {
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

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    if (monthsMissing) return;
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
      if (security) {
        await updateSecurity.mutateAsync({ id: security.id, input });
      } else {
        await createSecurity.mutateAsync(input);
      }
      reset();
      setSubmitAttempted(false);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Speichern fehlgeschlagen."));
    }
  });

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
        <form
          onSubmit={(event) => {
            setSubmitAttempted(true);
            void onSubmit(event);
          }}
          className="space-y-3 sm:space-y-4"
        >
          {/* Kurze Felder teilen sich eine Zeile, damit das Formular auf dem
              Telefon ohne Scrollen passt. Sechs Spalten tragen beide Raster:
              mobil ISIN | WKN, Ticker | Land | Währung, Branche | Depotkonto;
              ab `sm` Kennungen in einer Zeile, darunter die Einordnung.
              Reihenfolge der Kennungen wie im Kopf der Detailseite. */}
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
              {errors.wkn && (
                <p className="text-sm text-negative">{errors.wkn.message}</p>
              )}
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
          <div className="flex items-center justify-between gap-4">
            <Label id="security-reinvest-label">Dividenden reinvestieren</Label>
            <Switch
              aria-labelledby="security-reinvest-label"
              checked={reinvest}
              onCheckedChange={setReinvest}
            />
          </div>
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
      </DialogContent>
    </Dialog>
  );
}
