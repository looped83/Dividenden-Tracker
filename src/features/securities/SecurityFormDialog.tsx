import * as React from "react";
import { Plus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { cn } from "@/lib/utils/cn";
import { monthNameDeShort, normalizePayoutMonths } from "@/lib/statistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  const updateSecurity = useUpdateSecurity();
  const { data: depots = [] } = useDepots();
  const activeDepots = depots.filter((depot) => !depot.archived_at);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // Ausschuettungsmonate ausserhalb des Zod-Formulars als einfache Auswahl.
  // Wechselt das bearbeitete Asset, wird die Auswahl waehrend des Renderns
  // zurueckgesetzt (React-Muster fuer aus Props abgeleiteten Zustand).
  const [payoutMonths, setPayoutMonths] = React.useState<number[]>(
    security?.payout_months ?? [],
  );
  const [payoutSource, setPayoutSource] = React.useState(security);
  if (payoutSource !== security) {
    setPayoutSource(security);
    setPayoutMonths(security?.payout_months ?? []);
  }
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
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Speichern fehlgeschlagen."));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{security ? "Asset bearbeiten" : "Neues Asset"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="security-name">Name</Label>
            <Input id="security-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-negative">{errors.name.message}</p>
            )}
          </div>
          {/* Kennungen in einer Zeile, darunter die Einordnung. */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="security-ticker">Ticker</Label>
              <Input id="security-ticker" {...register("ticker")} />
              {errors.ticker && (
                <p className="text-sm text-negative">{errors.ticker.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="security-isin">ISIN</Label>
              <Input id="security-isin" {...register("isin")} />
              {errors.isin && (
                <p className="text-sm text-negative">{errors.isin.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="security-wkn">WKN</Label>
              <Input id="security-wkn" {...register("wkn")} />
              {errors.wkn && (
                <p className="text-sm text-negative">{errors.wkn.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="security-sector">Branche</Label>
              <Input id="security-sector" {...register("sector")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="security-country">Land</Label>
              <Input id="security-country" {...register("country")} />
              {errors.country && (
                <p className="text-sm text-negative">{errors.country.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="security-currency">Währung</Label>
              <Input id="security-currency" {...register("currency")} />
              {errors.currency && (
                <p className="text-sm text-negative">{errors.currency.message}</p>
              )}
            </div>
          </div>
          {/* Halbe Breite: ein Depotname braucht nicht die ganze Zeile. */}
          <div className="space-y-1.5 sm:w-1/2 sm:pr-2">
            <Label htmlFor="security-default-depot">Depotkonto</Label>
            <Select id="security-default-depot" {...register("defaultDepotId")}>
              <option value="">Kein Depotkonto</option>
              {activeDepots.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ausschüttungsmonate (optional)</Label>
            <div
              className="grid grid-cols-3 gap-1.5 sm:grid-cols-6"
              role="group"
              aria-label="Ausschüttungsmonate"
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

/**
 * Die Hauptaktion des Depotbereichs, samt eigenem Dialogzustand — genau wie ihn
 * `SecurityImportButton` und `PortfolioImportButton` tragen. Dadurch kann die
 * Kopfzeile des Bereichs sie zeigen, ohne dass ein Reiter darunter dafuer
 * Zustand nach oben reichen muesste.
 */
export function NewAssetButton() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        <Plus /> Neue Assets
      </Button>
      <SecurityFormDialog security={null} open={open} onOpenChange={setOpen} />
    </>
  );
}
