import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Pencil, Archive as ArchiveIcon, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountText } from "@/components/money/AmountText";
import { AuditTrail } from "@/components/audit/AuditTrail";
import { Money, toCurrencyCode } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  useArchivePayment,
  useDeletePayment,
  usePayment,
  useUnarchivePayment,
} from "@/features/payments/hooks";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: payment, isLoading } = usePayment(id);
  const { data: depots = [] } = useDepots();
  const { data: securities = [] } = useSecurities();
  const archivePayment = useArchivePayment();
  const unarchivePayment = useUnarchivePayment();
  const deletePayment = useDeletePayment();
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  }

  if (!payment) {
    return (
      <p className="text-sm text-muted-foreground">Dividendeneingang nicht gefunden.</p>
    );
  }

  const depot = depots.find((d) => d.id === payment.depot_id);
  const security = securities.find((s) => s.id === payment.security_id);
  const baseCurrency = toCurrencyCode(depot?.base_currency ?? "EUR");

  const handleArchive = async () => {
    setArchiveError(null);
    try {
      await archivePayment.mutateAsync({
        id: payment.id,
        reason: archiveReason || undefined,
      });
      setArchiveDialogOpen(false);
    } catch (error) {
      setArchiveError(getErrorMessage(error, "Archivieren fehlgeschlagen."));
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(payment.id);
      void navigate("/eingaenge");
    } catch (error) {
      setDeleteError(getErrorMessage(error, "Löschen fehlgeschlagen."));
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {security?.name ?? "Dividendeneingang"}
          </h1>
          <p className="text-sm text-muted-foreground">{formatDate(payment.pay_date)}</p>
        </div>
        <div className="flex items-center gap-2">
          {payment.archived_at ? (
            <Badge variant="neutral">Archiviert</Badge>
          ) : (
            <Badge variant="positive">Aktiv</Badge>
          )}
          {!payment.archived_at && (
            <Button variant="outline" size="icon" asChild aria-label="Bearbeiten">
              <Link to={`/eingaenge/${payment.id}/bearbeiten`}>
                <Pencil />
              </Link>
            </Button>
          )}
          {payment.archived_at ? (
            <Button
              variant="outline"
              size="icon"
              aria-label="Reaktivieren"
              onClick={() => void unarchivePayment.mutateAsync(payment.id)}
            >
              <RotateCcw />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              aria-label="Archivieren"
              onClick={() => {
                setArchiveError(null);
                setArchiveDialogOpen(true);
              }}
            >
              <ArchiveIcon />
            </Button>
          )}
          {payment.archived_at && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Endgültig löschen"
              onClick={() => {
                setDeleteError(null);
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailRow label="Depot">{depot?.name ?? "—"}</DetailRow>
          <DetailRow label="Netto">
            <AmountText amount={Money.fromString(payment.net_amount, baseCurrency)} />
          </DetailRow>
          {payment.archived_at && payment.archive_reason && (
            <DetailRow label="Storno-Grund">{payment.archive_reason}</DetailRow>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Änderungsverlauf</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTrail entityType="dividend_payment" entityId={payment.id} />
        </CardContent>
      </Card>

      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eingang archivieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="archive-reason">Grund (optional)</Label>
            <Input
              id="archive-reason"
              value={archiveReason}
              onChange={(event) => {
                setArchiveReason(event.target.value);
              }}
            />
          </div>
          {archiveError && (
            <p role="alert" className="text-sm text-negative">
              {archiveError}
            </p>
          )}
          <DialogFooter>
            <Button variant="destructive" onClick={() => void handleArchive()}>
              Archivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eingang endgültig löschen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dieser Dividendeneingang wird unwiderruflich entfernt und kann nicht
            wiederhergestellt werden.
          </p>
          {deleteError && (
            <p role="alert" className="text-sm text-negative">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={deletePayment.isPending}
              onClick={() => void handleDelete()}
            >
              {deletePayment.isPending ? "Wird gelöscht …" : "Endgültig löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button variant="ghost" onClick={() => void navigate("/eingaenge")}>
        Zurück zur Übersicht
      </Button>
    </div>
  );
}
