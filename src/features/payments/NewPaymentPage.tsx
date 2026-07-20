import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import type { DividendPaymentInsert } from "@/lib/supabase/repositories/payments";

const DEFAULT_VALUES: PaymentFormValues = {
  securityId: "",
  depotId: "",
  payDate: new Date().toISOString().slice(0, 10),
  netAmount: "",
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

  const [submitError, setSubmitError] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    if (!existingPayment) return;
    reset({
      securityId: existingPayment.security_id,
      depotId: existingPayment.depot_id,
      payDate: existingPayment.pay_date,
      netAmount: toGermanDecimalString(existingPayment.net_amount),
    });
  }, [existingPayment, reset]);

  const activeSecurities = securities.filter((security) => !security.archived_at);
  const activeDepots = depots.filter((depot) => !depot.archived_at);

  /**
   * Vorbelegung nur als Vorschlag (DATA_MODEL.md §1, DECISIONS.md D-006):
   * ueberschreibt nie ein bereits gewaehltes Depot und greift nur beim
   * Neuanlegen, nicht beim Bearbeiten eines bestehenden Eingangs.
   */
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

    // Fachlich bearbeitbare Felder. `source`, `import_id` und die weiteren
    // Herkunftsfelder sind unveraenderlich (Trigger protect_payment_immutables,
    // 0009) und duerfen beim Bearbeiten nicht mitgesendet werden — sonst
    // scheitert das Speichern eines importierten Eingangs. Sie werden daher nur
    // beim Neuanlegen ergaenzt (source = "manual").
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
      note: null,
    };

    try {
      if (isEditMode && id) {
        await updatePayment.mutateAsync({ id, input: businessFields });
      } else {
        const insertPayload: DividendPaymentInsert = {
          ...businessFields,
          source: "manual",
        };
        await createPayment.mutateAsync(insertPayload);
      }
      void navigate("/eingaenge");
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Speichern fehlgeschlagen."));
    }
  });

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

        {submitError && (
          <p role="alert" className="text-sm text-negative">
            {submitError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Wird gespeichert …" : "Speichern"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate("/eingaenge")}
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}
