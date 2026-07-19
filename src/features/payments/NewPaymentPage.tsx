import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AmountText } from "@/components/money/AmountText";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  useCreatePayment,
  usePayment,
  useUpdatePayment,
} from "@/features/payments/hooks";
import { paymentFormSchema, type PaymentFormValues } from "@/features/payments/schemas";
import { computePaymentAmounts } from "@/features/payments/computeAmounts";
import { checkNetAmountInvariance } from "@/lib/payments/invariant";
import type { DividendPaymentInsert } from "@/lib/supabase/repositories/payments";

const PAYMENT_TYPE_LABELS: Record<PaymentFormValues["paymentType"], string> = {
  regular: "Regulär",
  special: "Sonderdividende",
  correction: "Korrektur",
  cancellation: "Storno",
  refund: "Erstattung",
  other: "Sonstiges",
};

const DEFAULT_VALUES: PaymentFormValues = {
  securityId: "",
  depotId: "",
  payDate: new Date().toISOString().slice(0, 10),
  paymentType: "regular",
  isForeignCurrency: false,
  grossAmount: "",
  netAmount: "",
  originalCurrency: "",
  originalGross: "",
  originalNet: "",
  fxRate: "",
  withholdingTax: "0",
  domesticTax: "0",
  solidaritySurcharge: "",
  churchTax: "",
  fees: "",
  quantity: "",
  note: "",
};

export function NewPaymentPage() {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  const { data: securities = [] } = useSecurities();
  const { data: depots = [] } = useDepots();
  const { data: existingPayment, isLoading: isLoadingPayment } = usePayment(id);
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();

  const [confirmInvariance, setConfirmInvariance] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  React.useEffect(() => {
    if (!existingPayment) return;
    const isForeign = existingPayment.original_gross !== null;
    reset({
      securityId: existingPayment.security_id,
      depotId: existingPayment.depot_id,
      payDate: existingPayment.pay_date,
      paymentType: existingPayment.payment_type,
      isForeignCurrency: isForeign,
      grossAmount: isForeign ? "" : existingPayment.gross_amount,
      netAmount: isForeign ? "" : existingPayment.net_amount,
      originalCurrency: isForeign ? existingPayment.original_currency : "",
      originalGross: existingPayment.original_gross ?? "",
      originalNet: existingPayment.original_net ?? "",
      fxRate: existingPayment.fx_rate ?? "",
      withholdingTax: existingPayment.withholding_tax,
      domesticTax: existingPayment.domestic_tax,
      solidaritySurcharge: existingPayment.solidarity_surcharge ?? "",
      churchTax: existingPayment.church_tax ?? "",
      fees: existingPayment.fees ?? "",
      quantity: existingPayment.quantity ?? "",
      note: existingPayment.note ?? "",
    });
  }, [existingPayment, reset]);

  const isForeignCurrency = watch("isForeignCurrency");
  const depotId = watch("depotId");
  const selectedDepot = depots.find((depot) => depot.id === depotId);

  const activeSecurities = securities.filter((security) => !security.archived_at);
  const activeDepots = depots.filter((depot) => !depot.archived_at);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const depot = depots.find((d) => d.id === values.depotId);
    if (!depot) {
      setSubmitError("Bitte ein gültiges Depot auswählen.");
      return;
    }

    let computed;
    try {
      computed = computePaymentAmounts(values, depot.base_currency);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Ungültige Beträge.");
      return;
    }

    const invariance = checkNetAmountInvariance({
      grossAmount: computed.grossAmount,
      netAmount: computed.netAmount,
      withholdingTax: computed.withholdingTax,
      domesticTax: computed.domesticTax,
      solidaritySurcharge: computed.solidaritySurcharge,
      churchTax: computed.churchTax,
      fees: computed.fees,
    });

    if (!invariance.withinTolerance && !confirmInvariance) {
      // Abbruch: Warnung wird unten angezeigt, Nutzer muss ausdruecklich bestaetigen
      // (CALCULATION_RULES.md §4 — niemals stilles Anpassen eines Wertes).
      return;
    }

    const payload: DividendPaymentInsert = {
      security_id: values.securityId,
      depot_id: values.depotId,
      pay_date: values.payDate,
      payment_type: values.paymentType,
      gross_amount: computed.grossAmount.toStringValue(),
      net_amount: computed.netAmount.toStringValue(),
      withholding_tax: computed.withholdingTax.toStringValue(),
      domestic_tax: computed.domesticTax.toStringValue(),
      solidarity_surcharge: computed.solidaritySurcharge?.toStringValue() ?? null,
      church_tax: computed.churchTax?.toStringValue() ?? null,
      fees: computed.fees?.toStringValue() ?? null,
      original_currency: computed.originalCurrency,
      original_gross: computed.originalGross?.toStringValue() ?? null,
      original_net: computed.originalNet?.toStringValue() ?? null,
      fx_rate: computed.fxRate?.toStringValue() ?? null,
      quantity: computed.quantity?.toStringValue() ?? null,
      amount_per_share: computed.amountPerShare?.toStringValue() ?? null,
      source: "manual",
      note: emptyToNull(values.note),
    };

    try {
      if (isEditMode && id) {
        await updatePayment.mutateAsync({ id, input: payload });
      } else {
        await createPayment.mutateAsync(payload);
      }
      void navigate("/eingaenge");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    }
  });

  // Live-Vorschau der Invariante fuer die Warnbanner-Anzeige.
  const watchedValues = watch();
  let invariancePreview: ReturnType<typeof checkNetAmountInvariance> | null = null;
  if (
    !isForeignCurrency &&
    selectedDepot &&
    watchedValues.grossAmount &&
    watchedValues.netAmount
  ) {
    try {
      const computed = computePaymentAmounts(watchedValues, selectedDepot.base_currency);
      invariancePreview = checkNetAmountInvariance({
        grossAmount: computed.grossAmount,
        netAmount: computed.netAmount,
        withholdingTax: computed.withholdingTax,
        domesticTax: computed.domesticTax,
        solidaritySurcharge: computed.solidaritySurcharge,
        churchTax: computed.churchTax,
        fees: computed.fees,
      });
    } catch {
      invariancePreview = null;
    }
  }

  if (isEditMode && isLoadingPayment) {
    return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  }

  if (isEditMode && existingPayment?.archived_at) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">
          Dividendeneingang bearbeiten
        </h1>
        <p className="text-sm text-muted-foreground">
          Dieser Eingang ist archiviert und kann nur reaktiviert, nicht bearbeitet werden.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {isEditMode ? "Dividendeneingang bearbeiten" : "Neuer Dividendeneingang"}
      </h1>

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-security">Unternehmen</Label>
            <Select id="payment-security" {...register("securityId")}>
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
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Zahlungsdatum</Label>
            <Input id="payment-date" type="date" {...register("payDate")} />
            {errors.payDate && (
              <p className="text-sm text-negative">{errors.payDate.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-type">Art</Label>
            <Select id="payment-type" {...register("paymentType")}>
              {Object.entries(PAYMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register("isForeignCurrency")} />
          Zahlung in Fremdwährung
        </label>

        {isForeignCurrency ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="payment-original-currency">Originalwährung</Label>
                <Input
                  id="payment-original-currency"
                  maxLength={3}
                  {...register("originalCurrency")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-original-gross">Brutto (Original)</Label>
                <Input
                  id="payment-original-gross"
                  inputMode="decimal"
                  {...register("originalGross")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-original-net">Netto (Original)</Label>
                <Input
                  id="payment-original-net"
                  inputMode="decimal"
                  {...register("originalNet")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-fx-rate">
                Wechselkurs (Einheiten Basiswährung je 1 Einheit Originalwährung)
              </Label>
              <Input id="payment-fx-rate" inputMode="decimal" {...register("fxRate")} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="payment-gross">Bruttobetrag</Label>
              <Input
                id="payment-gross"
                inputMode="decimal"
                {...register("grossAmount")}
              />
              {errors.grossAmount && (
                <p className="text-sm text-negative">{errors.grossAmount.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-net">Nettobetrag</Label>
              <Input id="payment-net" inputMode="decimal" {...register("netAmount")} />
              {errors.netAmount && (
                <p className="text-sm text-negative">{errors.netAmount.message}</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-withholding-tax">Kapitalertragsteuer</Label>
            <Input
              id="payment-withholding-tax"
              inputMode="decimal"
              {...register("withholdingTax")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-domestic-tax">Inländische Steuer</Label>
            <Input
              id="payment-domestic-tax"
              inputMode="decimal"
              {...register("domesticTax")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-soli">Solidaritätszuschlag</Label>
            <Input
              id="payment-soli"
              inputMode="decimal"
              {...register("solidaritySurcharge")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-church-tax">Kirchensteuer</Label>
            <Input
              id="payment-church-tax"
              inputMode="decimal"
              {...register("churchTax")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-fees">Gebühren</Label>
            <Input id="payment-fees" inputMode="decimal" {...register("fees")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-quantity">Stückzahl</Label>
            <Input id="payment-quantity" inputMode="decimal" {...register("quantity")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment-note">Notiz</Label>
          <Textarea id="payment-note" {...register("note")} />
        </div>

        {invariancePreview && !invariancePreview.withinTolerance && (
          <div className="space-y-2 rounded-lg border border-warning bg-warning/10 p-4 text-sm">
            <p>
              Die Beträge weichen um{" "}
              <AmountText amount={invariancePreview.difference} className="font-medium" />{" "}
              von der erwarteten Nettosumme ab.
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={confirmInvariance}
                onChange={(event) => {
                  setConfirmInvariance(event.target.checked);
                }}
              />
              Differenz akzeptieren und trotzdem speichern
            </label>
          </div>
        )}

        {submitError && (
          <p role="alert" className="text-sm text-negative">
            {submitError}
          </p>
        )}

        <Button
          type="submit"
          disabled={
            isSubmitting ||
            Boolean(
              invariancePreview &&
              !invariancePreview.withinTolerance &&
              !confirmInvariance,
            )
          }
        >
          {isSubmitting ? "Wird gespeichert …" : "Speichern"}
        </Button>
      </form>
    </div>
  );
}
