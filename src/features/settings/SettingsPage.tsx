import { Construction } from "lucide-react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useSession } from "@/app/auth/SessionProvider";
import { supabase } from "@/lib/supabase/client";

/**
 * Der Abschnitt "Darstellung" ist bereits vollstaendig funktionsfaehig
 * (Design-System aus Phase 1). Profil (E-Mail, Abmelden) ist mit Phase 2
 * (Supabase Auth) funktionsfaehig. Basiswaehrung, Backup-Erinnerung usw.
 * sind echte Platzhalter und werden entsprechend markiert.
 */
export function SettingsPage() {
  const { session } = useSession();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    void navigate("/login", { replace: true });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Einstellungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Angemeldet als {session?.user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void handleLogout()}>
            Abmelden
          </Button>
        </CardContent>
      </Card>

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
          <h2 className="text-base font-medium">Basiswährung &amp; Backup</h2>
          <Badge variant="warning">Platzhalter</Badge>
        </div>
        <EmptyState
          icon={Construction}
          title="Wird in späteren Phasen umgesetzt"
          description="Basiswährungs- und Backup-Einstellungen folgen mit Phase 7."
        />
      </div>
    </div>
  );
}
