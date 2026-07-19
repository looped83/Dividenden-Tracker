import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Building2, Pencil, Plus, RotateCcw, Archive as ArchiveIcon } from "lucide-react";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { SecurityImportButton } from "@/features/securities/SecurityImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useArchiveSecurity,
  useCreateSecurity,
  useSecurities,
  useUpdateSecurity,
} from "@/features/securities/hooks";
import {
  securityFormSchema,
  type SecurityFormValues,
} from "@/features/securities/schemas";
import type { Security } from "@/lib/supabase/repositories/securities";
import type { DataQuality } from "@/lib/supabase/database.types";

const DATA_QUALITY_LABELS: Record<
  DataQuality,
  { label: string; variant: "positive" | "warning" | "negative" }
> = {
  ok: { label: "OK", variant: "positive" },
  incomplete: { label: "Unvollständig", variant: "warning" },
  needs_review: { label: "Prüfen", variant: "negative" },
};

function SecurityFormDialog({
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
  const [submitError, setSubmitError] = React.useState<string | null>(null);
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
          <DialogTitle>
            {security ? "Unternehmen bearbeiten" : "Neues Unternehmen"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="security-name">Name</Label>
            <Input id="security-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-negative">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="security-wkn">WKN</Label>
              <Input id="security-wkn" {...register("wkn")} />
              {errors.wkn && (
                <p className="text-sm text-negative">{errors.wkn.message}</p>
              )}
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
          <div className="space-y-1.5">
            <Label htmlFor="security-sector">Branche</Label>
            <Input id="security-sector" {...register("sector")} />
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

export function SecuritiesPage() {
  const { data: securities = [], isLoading } = useSecurities();
  const archiveSecurity = useArchiveSecurity();
  const [showArchived, setShowArchived] = React.useState(false);
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    security: Security | null;
  }>({
    open: false,
    security: null,
  });

  const visible = securities.filter((s) => showArchived || !s.archived_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Unternehmen</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => {
                setShowArchived(event.target.checked);
              }}
              className="size-4"
            />
            Archivierte anzeigen
          </label>
          <SecurityImportButton />
          <Button
            onClick={() => {
              setDialog({ open: true, security: null });
            }}
          >
            <Plus /> Neues Unternehmen
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Noch kein Unternehmen angelegt"
          description="Lege dein erstes Wertpapier an, um Dividendeneingänge zu erfassen."
          action={
            <Button
              onClick={() => {
                setDialog({ open: true, security: null });
              }}
            >
              Erstes Unternehmen anlegen
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>ISIN</TableHead>
              <TableHead>Land</TableHead>
              <TableHead>Datenqualität</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((security) => {
              const quality = DATA_QUALITY_LABELS[security.data_quality];
              return (
                <TableRow key={security.id}>
                  <TableCell className="font-medium">{security.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {security.ticker ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {security.isin ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {security.country ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={quality.variant}>{quality.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {security.archived_at ? (
                      <Badge variant="neutral">Archiviert</Badge>
                    ) : (
                      <Badge variant="positive">Aktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${security.name} bearbeiten`}
                        onClick={() => {
                          setDialog({ open: true, security });
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          security.archived_at
                            ? `${security.name} reaktivieren`
                            : `${security.name} archivieren`
                        }
                        onClick={() =>
                          void archiveSecurity.mutateAsync({
                            id: security.id,
                            archived: Boolean(security.archived_at),
                          })
                        }
                      >
                        {security.archived_at ? <RotateCcw /> : <ArchiveIcon />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <SecurityFormDialog
        security={dialog.security}
        open={dialog.open}
        onOpenChange={(open) => {
          setDialog((current) => ({ ...current, open }));
        }}
      />
    </div>
  );
}
