import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Pencil, Archive as ArchiveIcon, RotateCcw } from "lucide-react";
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
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  useArchivePayment,
  usePayment,
  useUnarchivePayment,
} from "@/features/payments/hooks";
import type { PaymentType } from "@/lib/supabase/database.types";

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  regular: "Regulär",
  special: "Sonderdividende",
  correction: "Korrektur",
  cancellation: "Storno",
  refund: "Erstattung",
  other: "Sonstiges",
};

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
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);
  const [archiveReason, setArchiveReason] = React.useState("");

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
  const isForeign = payment.original_gross !== null;

  const handleArchive = async () => {
    await archivePayment.mutateAsync({
      id: payment.id,
      reason: archiveReason || undefined,
    });
    setArchiveDialogOpen(false);
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
                setArchiveDialogOpen(true);
              }}
            >
              <ArchiveIcon />
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
          <DetailRow label="Art">{PAYMENT_TYPE_LABELS[payment.payment_type]}</DetailRow>
          <DetailRow label="Brutto">
            <AmountText amount={Money.fromString(payment.gross_amount, baseCurrency)} />
          </DetailRow>
          <DetailRow label="Netto">
            <AmountText amount={Money.fromString(payment.net_amount, baseCurrency)} />
          </DetailRow>
          <DetailRow label="Kapitalertragsteuer">
            <AmountText
              amount={Money.fromString(payment.withholding_tax, baseCurrency)}
            />
          </DetailRow>
          <DetailRow label="Inländische Steuer">
            <AmountText amount={Money.fromString(payment.domestic_tax, baseCurrency)} />
          </DetailRow>
          {payment.solidarity_surcharge && (
            <DetailRow label="Solidaritätszuschlag">
              <AmountText
                amount={Money.fromString(payment.solidarity_surcharge, baseCurrency)}
              />
            </DetailRow>
          )}
          {payment.church_tax && (
            <DetailRow label="Kirchensteuer">
              <AmountText amount={Money.fromString(payment.church_tax, baseCurrency)} />
            </DetailRow>
          )}
          {payment.fees && (
            <DetailRow label="Gebühren">
              <AmountText amount={Money.fromString(payment.fees, baseCurrency)} />
            </DetailRow>
          )}
          {isForeign && (
            <>
              <DetailRow label="Originalwährung">{payment.original_currency}</DetailRow>
              <DetailRow label="Brutto (Original)">{payment.original_gross}</DetailRow>
              <DetailRow label="Netto (Original)">{payment.original_net}</DetailRow>
              <DetailRow label="Wechselkurs">{payment.fx_rate}</DetailRow>
            </>
          )}
          {payment.quantity && (
            <DetailRow label="Stückzahl">{payment.quantity}</DetailRow>
          )}
          {payment.note && <DetailRow label="Notiz">{payment.note}</DetailRow>}
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
          <DialogFooter>
            <Button variant="destructive" onClick={() => void handleArchive()}>
              Archivieren
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
