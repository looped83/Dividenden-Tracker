import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { currencySymbol, toGermanDecimalString } from "@/lib/money";
import { useToast } from "@/components/ui/toast";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  useCreatePayment,
  usePayment,
  useUpdatePayment,
} from "@/features/payments/hooks";
import { paymentFormSchema, type PaymentFormValues } from "@/features/payments/schemas";
import {
  PaymentConflictError,
  type DividendPaymentInsert,
} from "@/lib/supabase/repositories/payments";

const DEFAULT_VALUES: PaymentFormValues = {
  securityId: "",
  depotId: "",
  payDate: new Date().toISOString().slice(0, 10),
  netAmount: "",
  note: "",
};

/**
 * Das Formular fuer einen Dividendeneingang — **einmal** fuer beide Wege:
 * als Seite (`/eingaenge/neu`, `/eingaenge/:id/bearbeiten`, so kommt das
 * Telefon dorthin) und als Overlay ueber der aktuellen Seite (Desktop, siehe
 * {@link PaymentComposerProvider}). Es kennt weder Route noch Dialog: Wohin es
 * nach dem Speichern oder Abbrechen fuehrt, entscheidet der Aufrufer.
 */
export function PaymentForm({
  id,
  onDone,
  onCancel,
}: {
  /** Gesetzt: bestehenden Eingang bearbeiten. Leer: neuen erfassen. */
  id?: string | undefined;
  /** Nach erfolgreichem Speichern. */
  onDone: () => void;
  /** Abbrechen — oder Zurueck aus einem stornierten Eingang. */
  onCancel: () => void;
}) {
  const isEditMode = Boolean(id);

  const { data: securities = [] } = useSecurities();
  const { data: depots = [] } = useDepots();
  const {
    data: existingPayment,
    isLoading: isLoadingPayment,
    refetch: refetchPayment,
  } = usePayment(id);
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const { notify } = useToast();

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  // Formular nur einmalig aus dem geladenen Eingang vorbelegen — ein späteres
  // Neuladen (z. B. nach einem Konflikt, §9) darf die Nutzereingaben nicht
  // überschreiben.
  const didInit = React.useRef(false);
  React.useEffect(() => {
    if (!existingPayment || didInit.current) return;
    didInit.current = true;
    reset({
      securityId: existingPayment.security_id,
      depotId: existingPayment.depot_id,
      payDate: existingPayment.pay_date,
      netAmount: toGermanDecimalString(existingPayment.net_amount),
      note: existingPayment.note ?? "",
    });
  }, [existingPayment, reset]);

  const activeSecurities = securities.filter((security) => !security.archived_at);
  const activeDepots = depots.filter((depot) => !depot.archived_at);

  // Die Combobox liegt ausserhalb der register()-Anbindung, deshalb wird der
  // Wert beobachtet und per setValue gesetzt. shouldValidate raeumt eine
  // bereits angezeigte Fehlermeldung sofort wieder ab.
  const watchedSecurityId = useWatch({ control, name: "securityId" });
  // Das Zeichen im Betragsfeld folgt dem gewaehlten Depot — Depots koennen
  // verschiedene Basiswaehrungen fuehren. Vor der Wahl steht der Standardfall.
  const watchedDepotId = useWatch({ control, name: "depotId" });
  const amountCurrency = currencySymbol(
    depots.find((depot) => depot.id === watchedDepotId)?.base_currency ?? "EUR",
  );
  const securityOptions = React.useMemo(
    () =>
      activeSecurities.map((security) => ({
        value: security.id,
        label: security.name,
        hint: security.ticker ?? undefined,
      })),
    [activeSecurities],
  );

  const selectSecurity = (securityId: string) => {
    setValue("securityId", securityId, { shouldValidate: true, shouldDirty: true });
    // Beim Neuanlegen das Standard-Depot des Unternehmens vorbelegen, solange
    // noch keines gewaehlt ist.
    if (isEditMode || getValues("depotId")) return;
    const security = securities.find((s) => s.id === securityId);
    if (security?.default_depot_id) {
      setValue("depotId", security.default_depot_id);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const depot = depots.find((d) => d.id === values.depotId);
    if (!depot) {
      setSubmitError("Bitte ein gültiges Depot auswählen.");
      return;
    }

    // Nur fachlich bearbeitbare Felder. Herkunftsfelder (source, import_id …)
    // sind unveränderlich (Trigger protect_payment_immutables, 0009) und werden
    // beim Bearbeiten nicht mitgesendet — so bleibt die Importherkunft erhalten
    // und ein importierter Eingang wird nicht in einen manuellen umgewandelt.
    const businessFields = {
      security_id: values.securityId,
      depot_id: values.depotId,
      pay_date: values.payDate,
      payment_type: "regular" as const,
      gross_amount: values.netAmount,
      net_amount: values.netAmount,
      withholding_tax: "0",
      domestic_tax: "0",
      solidarity_surcharge: null,
      church_tax: null,
      fees: null,
      original_currency: depot.base_currency,
      original_gross: null,
      original_net: null,
      fx_rate: null,
      quantity: null,
      amount_per_share: null,
      note: values.note?.trim() ? values.note.trim() : null,
    };

    try {
      if (isEditMode && id) {
        // Optimistic Concurrency (§9, D-6-3): der zuletzt geladene updated_at-Wert.
        const expected = existingPayment?.updated_at;
        await updatePayment.mutateAsync(
          expected
            ? { id, input: businessFields, expectedUpdatedAt: expected }
            : { id, input: businessFields },
        );
      } else {
        const insertPayload: DividendPaymentInsert = {
          ...businessFields,
          source: "manual",
        };
        await createPayment.mutateAsync(insertPayload);
      }
      notify(isEditMode ? "Dividende gespeichert." : "Dividende erfasst.");
      onDone();
    } catch (error) {
      if (error instanceof PaymentConflictError) {
        // Konflikt sichtbar machen und aktuelle Daten neu laden; der nächste
        // Speichervorgang nutzt dann den aktualisierten updated_at-Wert.
        // Nutzereingaben bleiben im Formular erhalten (§9).
        setConflict(true);
        await refetchPayment();
        return;
      }
      setSubmitError(getErrorMessage(error, "Speichern fehlgeschlagen."));
    }
  });

  if (isEditMode && isLoadingPayment) {
    return <PageSkeleton header={false} />;
  }

  if (isEditMode && existingPayment?.archived_at) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Dieser Eingang ist storniert und kann nur reaktiviert, nicht bearbeitet werden.
        </p>
        <Button variant="ghost" onClick={onCancel}>
          Zurück
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {conflict && (
        <p
          role="alert"
          className="rounded-md bg-warning/10 p-3 text-sm text-warning-strong"
        >
          Dieser Dividendeneingang wurde zwischenzeitlich an anderer Stelle geändert. Die
          aktuellen Werte wurden neu geladen. Bitte prüfe deine Eingaben und speichere
          erneut, um sie zu übernehmen.
        </p>
      )}

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
        {/* Unternehmen zuerst: die Auswahl belegt das Depot aus dem
            Standard-Depot des Unternehmens vor (siehe selectSecurity). */}
        <div className="space-y-1.5">
          <Label htmlFor="payment-security">Unternehmen</Label>
          <Combobox
            id="payment-security"
            options={securityOptions}
            value={watchedSecurityId}
            onChange={selectSecurity}
            placeholder="Name oder Ticker suchen …"
            emptyMessage="Kein Unternehmen gefunden"
          />
          {errors.securityId && (
            <p className="text-sm text-negative">{errors.securityId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment-depot">Depot</Label>
          <Select id="payment-depot" {...register("depotId")}>
            <option value="">Bitte wählen</option>
            {activeDepots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.name} ({depot.base_currency})
              </option>
            ))}
          </Select>
          {errors.depotId && (
            <p className="text-sm text-negative">{errors.depotId.message}</p>
          )}
        </div>

        {/* Datum und Betrag sind beide kurz und gehoeren fachlich zusammen —
            nebeneinander spart eine Bildschirmzeile. Unter 360px reicht die
            halbe Breite dem Datumsfeld nicht: Das Kalendersymbol wird dann
            abgeschnitten, deshalb dort untereinander. */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Zahlungsdatum</Label>
            <Input id="payment-date" type="date" {...register("payDate")} />
            {errors.payDate && (
              <p className="text-sm text-negative">{errors.payDate.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-net">Nettobetrag</Label>
            <div className="relative">
              <Input
                id="payment-net"
                inputMode="decimal"
                className="pr-9"
                aria-describedby="payment-net-currency"
                {...register("netAmount")}
              />
              <span
                id="payment-net-currency"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
              >
                {amountCurrency}
              </span>
            </div>
            {errors.netAmount && (
              <p className="text-sm text-negative">{errors.netAmount.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment-note">Notiz (optional)</Label>
          <Textarea id="payment-note" rows={3} {...register("note")} />
          {errors.note && <p className="text-sm text-negative">{errors.note.message}</p>}
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-negative">
            {submitError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Wird gespeichert …" : "Speichern"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}
