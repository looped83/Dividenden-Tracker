import * as React from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useSession } from "@/app/auth/SessionProvider";
import { supabase } from "@/lib/supabase/client";

/**
 * Allgemeine Einstellungen (Profil, Darstellung). Der Abschnitt "Darstellung"
 * ist seit Phase 1 funktionsfaehig, Profil (E-Mail, Abmelden) seit Phase 2.
 * Basiswaehrung und Backup-Erinnerung sind echte Platzhalter und als solche
 * gekennzeichnet.
 */
export function GeneralSettingsTab() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      void navigate("/login", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Abmeldung fehlgeschlagen"));
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Angemeldet als {session?.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-negative">{error}</p>}
          <Button
            variant="outline"
            onClick={() => void handleLogout()}
            disabled={loading}
          >
            Abmelden
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>
            Hell, dunkel oder passend zur Einstellung des Systems.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
