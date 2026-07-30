import * as React from "react";
import { Link, useNavigate } from "react-router";
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
import { useLastBackup } from "@/features/backup/hooks";

/**
 * Allgemeine Einstellungen: Profil, Darstellung und die Angaben zur laufenden
 * Fassung.
 *
 * Der Abschnitt „Über diese App" beantwortet zwei Fragen, die sich sonst
 * nirgends beantworten liessen: welcher Stand hier laeuft (nach einem
 * PWA-Update auf dem iPhone nicht selbstverstaendlich) und wann zuletzt
 * gesichert wurde.
 */
export function GeneralSettingsTab() {
  const { session } = useSession();
  const navigate = useNavigate();
  const lastBackup = useLastBackup();
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

      <Card>
        <CardHeader>
          <CardTitle>Über diese App</CardTitle>
          <CardDescription>
            Angaben zur laufenden Fassung und zum Stand deiner Datensicherung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="text-right tabular-nums">{__APP_VERSION__}</dd>
            <dt className="text-muted-foreground">Datensicherung</dt>
            <dd className="text-right">{lastBackup.label}</dd>
          </dl>
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/einstellungen/datensicherung">Zur Datensicherung</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
