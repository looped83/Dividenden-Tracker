import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { toGermanDecimalString } from "@/lib/money";
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

export function NewPaymentPage() {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? "/eingaenge";

  const { data: securities = [] } = useSecurities();
  const { data: depots = [] } = useDepots();
  const {
    data: existingPayment,
    isLoading: isLoadingPayment,
    refetch: refetchPayment,
  } = usePayment(id);
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
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

  const handleSecurityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (isEditMode || getValues("depotId")) return;
    const security = securities.find((s) => s.id === event.target.value);
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
      void navigate(backTo);
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
    return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  }

  if (isEditMode && existingPayment?.archived_at) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Dividende bearbeiten</h1>
        <p className="text-sm text-muted-foreground">
          Dieser Eingang ist storniert und kann nur reaktiviert, nicht bearbeitet werden.
        </p>
        <Button variant="ghost" onClick={() => void navigate(backTo)}>
          Zurück
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {isEditMode ? "Dividende bearbeiten" : "Neue Dividende"}
      </h1>

      {conflict && (
        <p
          role="alert"
          className="rounded-md bg-warning/10 p-3 text-sm text-warning-foreground"
        >
          Dieser Dividendeneingang wurde zwischenzeitlich an anderer Stelle geändert. Die
          aktuellen Werte wurden neu geladen. Bitte prüfe deine Eingaben und speichere
          erneut, um sie zu übernehmen.
        </p>
      )}

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
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

        <div className="space-y-1.5">
          <Label htmlFor="payment-security">Unternehmen</Label>
          <Select
            id="payment-security"
            {...register("securityId", { onChange: handleSecurityChange })}
          >
            <option value="">Bitte wählen</option>
            {activeSecurities.map((security) => (
              <option key={security.id} value={security.id}>
                {security.name}
                {security.ticker ? ` (${security.ticker})` : ""}
              </option>
            ))}
          </Select>
          {errors.securityId && (
            <p className="text-sm text-negative">{errors.securityId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment-date">Zahlungsdatum</Label>
          <Input id="payment-date" type="date" {...register("payDate")} />
          {errors.payDate && (
            <p className="text-sm text-negative">{errors.payDate.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment-net">Nettobetrag</Label>
          <Input
            id="payment-net"
            inputMode="decimal"
            placeholder="z. B. 73,63"
            {...register("netAmount")}
          />
          {errors.netAmount && (
            <p className="text-sm text-negative">{errors.netAmount.message}</p>
          )}
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
          <Button type="button" variant="ghost" onClick={() => void navigate(backTo)}>
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}
