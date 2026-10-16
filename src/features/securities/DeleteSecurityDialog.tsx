import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
    <ConfirmDialog
      open={security !== null}
      onOpenChange={(open) => {
        if (!open) clearError();
        onOpenChange(open);
      }}
      title="Asset dauerhaft löschen?"
      description={`${security?.name ?? "Das Asset"} wird endgültig entfernt und lässt sich nicht wiederherstellen. Das geht nur, solange keine Dividenden mehr auf dieses Asset verweisen.`}
      error={error}
      isPending={deleteSecurity.isPending}
      confirmLabel="Dauerhaft löschen"
      pendingLabel="Wird gelöscht …"
      onConfirm={() => void handleDelete()}
    />
  );
}
