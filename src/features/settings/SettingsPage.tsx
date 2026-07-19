import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

/**
 * Der Abschnitt "Darstellung" ist bereits vollstaendig funktionsfaehig
 * (Design-System aus Phase 1). Profil, Basiswaehrung, Backup-Erinnerung
 * usw. sind echte Platzhalter und werden entsprechend markiert.
 */
export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Einstellungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>
            Hell, dunkel oder passend zum Systemzustand (UX_AND_DESIGN_SYSTEM.md #8).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-medium">Profil, Basiswährung &amp; Backup</h2>
          <Badge variant="warning">Platzhalter</Badge>
        </div>
        <EmptyState
          icon={Construction}
          title="Wird ab Phase 2 umgesetzt"
          description="Profilverwaltung folgt mit der Supabase-Anbindung (Phase 2); Basiswährungs- und Backup-Einstellungen mit Phase 7."
        />
      </div>
    </div>
  );
}
