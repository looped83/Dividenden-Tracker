import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

interface PlaceholderPageProps {
  title: string;
  phase: string;
  description: string;
}

/**
 * Markiert einen Bereich unmissverstaendlich als noch nicht umgesetzt.
 * Eine Funktion gilt nicht allein aufgrund einer sichtbaren Seite als
 * fertig (Auftrag: nicht verhandelbare Qualitaetsregeln) — jede Route der
 * neun Hauptbereiche existiert in Phase 1 nur als navigierbares Geruest.
 */
export function PlaceholderPage({ title, phase, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <Badge variant="warning">Platzhalter</Badge>
      </div>
      <EmptyState
        icon={Construction}
        title={`Wird in ${phase} umgesetzt`}
        description={description}
      />
    </div>
  );
}
