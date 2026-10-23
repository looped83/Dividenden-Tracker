import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Landmark, Pencil, Plus, RotateCcw, Archive as ArchiveIcon } from "lucide-react";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Section, SectionButton } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ListGroup, ListRow } from "@/components/ui/list";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useArchiveDepot,
  useCreateDepot,
  useDepots,
  useUpdateDepot,
} from "@/features/depots/hooks";
import { depotFormSchema, type DepotFormValues } from "@/features/depots/schemas";
import { useArchiveToggle } from "@/components/domain/useArchiveToggle";
import type { Depot } from "@/lib/supabase/repositories/depots";

function DepotFormDialog({
  depot,
  open,
  onOpenChange,
}: {
  depot: Depot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createDepot = useCreateDepot();
  const updateDepot = useUpdateDepot();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DepotFormValues>({
    resolver: zodResolver(depotFormSchema),
    values: {
      name: depot?.name ?? "",
      broker: depot?.broker ?? "",
      baseCurrency: depot?.base_currency ?? "EUR",
      note: depot?.note ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const input = {
      name: values.name,
      broker: emptyToNull(values.broker),
      base_currency: values.baseCurrency,
      note: emptyToNull(values.note),
    };
    try {
      if (depot) {
        // Basiswaehrung ist nach Anlage nur aenderbar ohne vorhandene Zahlungen
        // (guard_base_currency_change-Trigger, DECISIONS.md D-002).
        await updateDepot.mutateAsync({ id: depot.id, input });
      } else {
        await createDepot.mutateAsync(input);
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
          <DialogTitle>{depot ? "Depot bearbeiten" : "Neues Depot"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="depot-name">Name</Label>
            <Input id="depot-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-negative">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="depot-broker">Broker</Label>
              <Input id="depot-broker" {...register("broker")} />
            </div>
            {/* Die Basiswaehrung ist keine Wahl, sondern eine Folge: Alle
                Betraege werden in Basiswaehrung gespeichert und ausgewertet
                (D-002). Als freies Feld liess sich hier „USD" eintragen — die
                Eingangsliste zeigte dann „$", Uebersicht und Statistik „€",
                und beide Betraege wurden miteinander verrechnet. Der Wert
                steht jetzt als Angabe da; der Trigger aus Migration 0023
                sichert dieselbe Regel in der Datenbank ab. */}
            <div className="space-y-1.5">
              <Label htmlFor="depot-currency">Basiswährung</Label>
              <Input
                id="depot-currency"
                readOnly
                aria-describedby="depot-currency-hint"
                className="bg-muted/50"
                {...register("baseCurrency")}
              />
              <p id="depot-currency-hint" className="text-sm text-muted-foreground">
                Entspricht der Währung deines Kontos.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depot-note">Notiz</Label>
            <Textarea id="depot-note" {...register("note")} />
          </div>
          {submitError && (
            <p role="alert" className="text-sm text-negative">
              {submitError}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {depot ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Eine Zeile der Verwaltungslisten: Name (und nur der
 * Sonderfall „Archiviert" als Etikett), darunter die Angaben, rechts die
 * Aktionen. Anders als Eingaenge und Assets haben Depots keine Detailseite — die Aktionen bleiben deshalb an der Zeile.
 */
function ManagedRow({
  name,
  archived,
  meta,
  actions,
}: {
  name: string;
  archived: boolean;
  meta: string;
  actions: React.ReactNode;
}) {
  return (
    <ListRow className="pr-1">
      <span className="min-w-0 flex-1">
        <span className="font-medium [overflow-wrap:anywhere]">
          {name}
          {archived && (
            <Badge variant="neutral" className="ml-2 align-middle">
              Archiviert
            </Badge>
          )}
        </span>
        {meta && <span className="block text-sm text-muted-foreground">{meta}</span>}
      </span>
      <span className="-my-2 flex shrink-0 items-center">{actions}</span>
    </ListRow>
  );
}

export function DepotsPage() {
  const { data: depots = [], isLoading } = useDepots();
  const toggleDepot = useArchiveToggle(useArchiveDepot());

  const [showArchived, setShowArchived] = React.useState(false);
  const [depotDialog, setDepotDialog] = React.useState<{
    open: boolean;
    depot: Depot | null;
  }>({
    open: false,
    depot: null,
  });
  const visibleDepots = depots.filter((depot) => showArchived || !depot.archived_at);

  const depotActions = (depot: Depot) => (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Depot ${depot.name} bearbeiten`}
        onClick={() => {
          setDepotDialog({ open: true, depot });
        }}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          depot.archived_at
            ? `Depot ${depot.name} reaktivieren`
            : `Depot ${depot.name} archivieren`
        }
        onClick={() => {
          toggleDepot(depot, `Depot „${depot.name}"`);
        }}
      >
        {depot.archived_at ? <RotateCcw /> : <ArchiveIcon />}
      </Button>
    </>
  );

  return (
    // Dasselbe Raster wie die uebrigen Einstellungen: Ab `lg` nimmt die kurze
    // Depotliste die linke Spalte ein statt die volle Breite.
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-x-16">
      {/* Die Aktion gehoert in den Kopf des Abschnitts, nicht in seinen
          Inhalt: Sie betrifft den ganzen Abschnitt, nicht eine Zeile darin. */}
      <Section
        title="Depots"
        action={
          <SectionButton
            icon={Plus}
            onClick={() => {
              setDepotDialog({ open: true, depot: null });
            }}
          >
            Neues Depot
          </SectionButton>
        }
      >
        <div className="space-y-3">
          {isLoading ? (
            <SkeletonRows rows={3} label="Depots" />
          ) : visibleDepots.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="Noch kein Depot angelegt"
              description="Lege dein erstes Depot an, um Dividenden zu erfassen."
              action={
                <Button
                  onClick={() => {
                    setDepotDialog({ open: true, depot: null });
                  }}
                >
                  Erstes Depot anlegen
                </Button>
              }
            />
          ) : (
            <ListGroup aria-label="Depots">
              {visibleDepots.map((depot) => (
                <li key={depot.id}>
                  <ManagedRow
                    name={depot.name}
                    archived={Boolean(depot.archived_at)}
                    meta={[depot.broker, depot.base_currency].filter(Boolean).join(" · ")}
                    actions={depotActions(depot)}
                  />
                </li>
              ))}
            </ListGroup>
          )}

          {/* Der Archivfilter steht **unter** der Liste: Er beantwortet die
              Frage „fehlt hier etwas?", die erst beim Lesen der Liste
              aufkommt. */}
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={showArchived}
              onChange={(event) => {
                setShowArchived(event.target.checked);
              }}
            />
            Archivierte anzeigen
          </label>
        </div>
      </Section>

      <DepotFormDialog
        depot={depotDialog.depot}
        open={depotDialog.open}
        onOpenChange={(open) => {
          setDepotDialog((current) => ({ ...current, open }));
        }}
      />
    </div>
  );
}
