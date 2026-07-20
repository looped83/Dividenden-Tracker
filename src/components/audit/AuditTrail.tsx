import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { fetchAuditTrail, type AuditLogRow } from "@/lib/supabase/repositories/auditLog";
import { EmptyState } from "@/components/ui/empty-state";

const ACTION_LABELS: Record<AuditLogRow["action"], string> = {
  insert: "Angelegt",
  update: "Geändert",
  archive: "Storniert",
  unarchive: "Reaktiviert",
  delete: "Endgültig gelöscht",
  import_commit: "Import übernommen",
  import_rollback: "Import zurückgerollt",
  restore: "Wiederhergestellt",
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function FieldDiffs({ entry }: { entry: AuditLogRow }) {
  const oldValues = (entry.old_values ?? {}) as Record<string, unknown>;
  const newValues = (entry.new_values ?? {}) as Record<string, unknown>;
  const fields = Array.from(
    new Set([...Object.keys(oldValues), ...Object.keys(newValues)]),
  );

  if (fields.length === 0) return null;

  return (
    <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
      {fields.map((field) => (
        <li key={field}>
          <span className="font-medium text-foreground">{field}</span>:{" "}
          {entry.action === "insert" ? (
            formatFieldValue(newValues[field])
          ) : (
            <>
              {formatFieldValue(oldValues[field])} → {formatFieldValue(newValues[field])}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

interface AuditTrailProps {
  entityType: string;
  entityId: string;
}

/** Aenderungsverlauf als vertikale Liste (UX_AND_DESIGN_SYSTEM.md §2 `AuditTrail`). */
export function AuditTrail({ entityType, entityId }: AuditTrailProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-trail", entityType, entityId],
    queryFn: () => fetchAuditTrail(entityType, entityId),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Verlauf wird geladen …</p>;
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState icon={History} title="Noch kein Änderungsverlauf" className="py-8" />
    );
  }

  return (
    <ol className="space-y-4 border-l border-border pl-4">
      {data.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className="absolute -left-[1.1rem] top-1.5 size-2 rounded-full bg-primary"
            aria-hidden
          />
          <p className="text-sm font-medium">
            {ACTION_LABELS[entry.action]}{" "}
            <span className="font-normal text-muted-foreground">
              · {formatTimestamp(entry.created_at)}
            </span>
          </p>
          <FieldDiffs entry={entry} />
        </li>
      ))}
    </ol>
  );
}
