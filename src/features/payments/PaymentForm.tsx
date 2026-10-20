import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
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
import {
  paymentFormSchema,
  todayIso,
  type PaymentFormValues,
} from "@/features/payments/schemas";
import {
  PaymentConflictError,
  type DividendPaymentInsert,
} from "@/lib/supabase/repositories/payments";

/**
 * Leeres Formular. Das Datum ist der heutige **lokale** Kalendertag beim
 * Oeffnen: Als Modulkonstante ueber UTC stand nach Mitternacht der Vortag im
 * Feld und in einer tagelang geoeffneten App ein noch aelteres Datum.
 */
function emptyValues(securityId = ""): PaymentFormValues {
  return { securityId, depotId: "", payDate: todayIso(), netAmount: "", note: "" };
}

/**
 * Das Formular fuer einen Dividendeneingang — **einmal** fuer beide Wege:
 * als Seite (`/eingaenge/neu`, `/eingaenge/:id/bearbeiten`) und als Overlay
 * ueber der aktuellen Seite (ein mittiger Dialog, siehe
 * {@link PaymentComposerProvider}). Es kennt weder Route noch Dialog: Wohin es
 * nach dem Speichern oder Abbrechen fuehrt, entscheidet der Aufrufer.
 */
export function PaymentForm({
  id,
  initialSecurityId,
  onDone,
  onCancel,
}: {
  /** Gesetzt: bestehenden Eingang bearbeiten. Leer: neuen erfassen. */
  id?: string | undefined;
  /** Neu erfassen mit vorgewähltem Asset (etwa von dessen Detailseite). */
  initialSecurityId?: string | undefined;
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
  const [defaultValues] = React.useState(() => emptyValues(initialSecurityId));

  const {
    register,
    handleSubmit,
    reset,
    control,
    getValues,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues,
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

  const activeDepots = React.useMemo(
    () => depots.filter((depot) => !depot.archived_at),
    [depots],
  );

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
  // Archivierte Assets und Depots stehen nicht zur Wahl — ausser dem bereits
  // gewaehlten (Bearbeiten, „Eingang erfassen" auf einem archivierten Asset).
  // Sonst bliebe das Feld leer, obwohl ein Wert gesetzt ist.
  const securityOptions = React.useMemo(
    () =>
      securities
        .filter((security) => !security.archived_at || security.id === watchedSecurityId)
        .map((security) => ({
          value: security.id,
          label: security.archived_at ? `${security.name} (archiviert)` : security.name,
          hint: security.ticker ?? undefined,
        })),
    [securities, watchedSecurityId],
  );
  const depotOptions = React.useMemo(
    () => depots.filter((depot) => !depot.archived_at || depot.id === watchedDepotId),
    [depots, watchedDepotId],
  );

  /**
   * Das Depot ergibt sich aus dem Asset — gefragt wird nur, wenn es offen ist.
   *
   * Erste Wahl ist das Standard-Depot des Assets (sofern nicht archiviert),
   * sonst das einzige aktive Depot. Ein Feld, das fast immer schon richtig
   * vorbelegt war, kostete auf dem Telefon eine Bildschirmzeile und einen
   * Blick. Bleibt es offen (kein Standard, mehrere Depots), erscheint die
   * Auswahl.
   */
  const depotFor = React.useCallback(
    (securityId: string): string => {
      const security = securities.find((s) => s.id === securityId);
      const preferred = security?.default_depot_id;
      if (preferred && activeDepots.some((depot) => depot.id === preferred)) {
        return preferred;
      }
      return activeDepots.length === 1 ? (activeDepots[0]?.id ?? "") : "";
    },
    [securities, activeDepots],
  );

  // Vorgewaehltes Asset: Das Depot steht erst fest, wenn Assets und Depots
  // geladen sind — bis dahin wird gewartet, danach genau einmal gesetzt.
  const preselected = React.useRef(false);
  React.useEffect(() => {
    if (!initialSecurityId || preselected.current) return;
    if (securities.length === 0 || depots.length === 0) return;
    preselected.current = true;
    const depotId = depotFor(initialSecurityId);
    if (depotId) setValue("depotId", depotId);
  }, [initialSecurityId, securities.length, depots.length, depotFor, setValue]);

  // Beim Bearbeiten immer sichtbar: Das gebuchte Depot kann vom Standard des
  // Assets abweichen und muss sich korrigieren lassen. Ein Fehler am Depot
  // bleibt ebenfalls sichtbar — sonst scheiterte das Speichern ohne Hinweis,
  // wenn die Depots erst nach der Asset-Wahl geladen waren.
  // Beim Erfassen bleibt das automatisch gewaehlte Depot unsichtbar: Es steht
  // fast immer richtig und laesst sich spaeter beim Bearbeiten korrigieren.
  const needsDepotChoice =
    isEditMode ||
    errors.depotId !== undefined ||
    (watchedSecurityId !== "" && depotFor(watchedSecurityId) === "");

  const selectSecurity = (securityId: string) => {
    setValue("securityId", securityId, { shouldValidate: true, shouldDirty: true });
    const depotId = depotFor(securityId);
    // Beim Bearbeiten bleibt das bisherige Depot, wenn das neue Asset keines
    // vorgibt — beim Neuanlegen wird dann ausdruecklich gewaehlt.
    if (depotId || !isEditMode) {
      setValue("depotId", depotId, { shouldDirty: true });
    }
    // Auf Touch-Geraeten weiter zum Betrag: Der Fokus faellt noch im Tippen auf
    // die Option, iOS oeffnet so gleich den Zahlenblock — ein Antippen weniger.
    // Mit Maus und Tastatur bleibt der Fokus, wo er ist.
    if (
      depotId &&
      !getValues("netAmount") &&
      window.matchMedia("(pointer: coarse)").matches
    ) {
      setFocus("netAmount");
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
      // Ohne eigenes Feld (das Formular bleibt bei dem, was man beim Erfassen
      // braucht): Eine vorhandene Notiz, etwa aus einem Import, reist beim
      // Bearbeiten unverändert mit.
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
          Diese Dividende ist storniert und kann nur reaktiviert, nicht bearbeitet werden.
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
          Diese Dividende wurde zwischenzeitlich an anderer Stelle geändert. Die aktuellen
          Werte wurden neu geladen. Bitte prüfe deine Eingaben und speichere erneut, um
          sie zu übernehmen.
        </p>
      )}

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
        {/* Asset zuerst: Es bestimmt das Depot (siehe depotFor). */}
        <div className="space-y-1.5">
          <Label htmlFor="payment-security">Asset</Label>
          <Combobox
            id="payment-security"
            options={securityOptions}
            value={watchedSecurityId}
            onChange={selectSecurity}
            placeholder="Asset oder Ticker suchen …"
            // Neu erfassen beginnt mit der Suche; beim Bearbeiten wird nichts
            // fokussiert — man tippt das Feld an, das sich ändern soll.
            autoFocus={!isEditMode}
            emptyMessage="Kein Asset gefunden"
          />
          {errors.securityId && (
            <p className="text-sm text-negative">{errors.securityId.message}</p>
          )}
        </div>

        {needsDepotChoice && (
          <div className="space-y-1.5">
            <Label htmlFor="payment-depot">Depot</Label>
            <Select id="payment-depot" {...register("depotId")}>
              <option value="">Depot wählen …</option>
              {depotOptions.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name} ({depot.base_currency})
                  {depot.archived_at ? " – archiviert" : ""}
                </option>
              ))}
            </Select>
            {errors.depotId && (
              <p className="text-sm text-negative">{errors.depotId.message}</p>
            )}
          </div>
        )}

        {/* Datum und Betrag sind beide kurz und gehoeren fachlich zusammen —
            nebeneinander spart eine Bildschirmzeile. Unter 360px reicht die
            halbe Breite dem Datumsfeld nicht, deshalb dort untereinander. */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Zahlungsdatum</Label>
            {/* Ohne Kalendersymbol: Das ganze Feld oeffnet die Auswahl
                (`showPicker`), das Symbol war nur Ballast in der halben Breite. */}
            <Input
              id="payment-date"
              type="date"
              className="[&::-webkit-calendar-picker-indicator]:hidden"
              onClick={(event) => {
                // Nur mit der Maus: Auf Touch-Geraeten oeffnet das Antippen die
                // Auswahl ohnehin selbst.
                // Ohne `pointerType` (aeltere Browser liefern einen reinen
                // MouseEvent) gilt der Klick ebenfalls als Mausklick.
                const { pointerType } = event.nativeEvent as Partial<PointerEvent>;
                if (pointerType === "touch" || pointerType === "pen") return;
                try {
                  event.currentTarget.showPicker();
                } catch {
                  // Ohne Unterstuetzung bleibt die Eingabe per Tastatur.
                }
              }}
              {...register("payDate")}
            />
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

        {submitError && (
          <p role="alert" className="text-sm text-negative">
            {submitError}
          </p>
        )}

        {/* Auf dem Telefon beide Aktionen in voller Breite, Speichern zuoberst —
            dieselbe Anordnung wie in jedem Dialog (`DialogFooter`). Ein kleiner
            Knopf links unten war die einzige Stelle, an der der Daumen zielen
            musste. Ab `sm` rechts unten, Speichern ganz rechts; in der
            Tab-Reihenfolge bleibt Speichern vorn. */}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:gap-3">
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? "Wird gespeichert …" : "Speichern"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}
