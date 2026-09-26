import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useErrorState } from "@/lib/hooks/useErrorState";
import { useDeleteSecurity } from "@/features/securities/hooks";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Endgueltiges Loeschen eines archivierten Assets — derselbe Dialog aus der
 * Assettabelle und von der Detailseite. Er fuehrt die Loeschung selbst aus und
 * meldet sie ueber `onDeleted`; ein Fehler (es verweisen noch Eingaenge auf
 * das Asset) bleibt im Dialog stehen.
 */
export function DeleteSecurityDialog({
  security,
  onOpenChange,
  onDeleted,
}: {
  /** Das zu loeschende Asset; `null` schliesst den Dialog. */
  security: Security | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const deleteSecurity = useDeleteSecurity();
  const { error, showError, clearError } = useErrorState();

  const handleDelete = async () => {
    if (!security) return;
    clearError();
    try {
      await deleteSecurity.mutateAsync(security.id);
      onOpenChange(false);
      onDeleted?.();
    } catch (cause) {
      showError(cause, "Löschen fehlgeschlagen.");
    }
  };

  return (
    <Dialog
      open={security !== null}
      onOpenChange={(open) => {
        if (!open) clearError();
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asset endgültig löschen</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {security?.name} wird unwiderruflich entfernt und kann nicht wiederhergestellt
          werden. Das ist nur möglich, solange keine Dividendeneingänge mehr auf dieses
          Asset verweisen.
        </p>
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={deleteSecurity.isPending}
            onClick={() => void handleDelete()}
          >
            {deleteSecurity.isPending ? "Wird gelöscht …" : "Endgültig löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
