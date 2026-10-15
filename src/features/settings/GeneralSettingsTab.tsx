import * as React from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
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
    <div className="space-y-10">
      <Section title="Profil" description={`Angemeldet als ${session?.user.email ?? ""}`}>
        <div className="space-y-3 pt-2">
          {error && <p className="text-sm text-negative">{error}</p>}
          <Button
            variant="outline"
            onClick={() => void handleLogout()}
            disabled={loading}
          >
            Abmelden
          </Button>
        </div>
      </Section>

      <Section
        title="Darstellung"
        description="Hell, dunkel oder passend zur Einstellung des Systems."
      >
        <div className="pt-2">
          <ThemeToggle />
        </div>
      </Section>

      <Section
        title="Über diese App"
        description="Angaben zur laufenden Fassung und zum Stand deiner Datensicherung."
      >
        {/* Zwei Zeilen wie eine Liste: Beschriftung links, Wert rechts,
            dazwischen eine Haarlinie. */}
        <dl className="divide-y divide-border text-[0.9375rem]">
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-medium tabular-nums">{__APP_VERSION__}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Datensicherung</dt>
            <dd className="text-right font-medium">{lastBackup.label}</dd>
          </div>
        </dl>
        <Button variant="outline" className="mt-3" asChild>
          <Link to="/einstellungen/datensicherung">Zur Datensicherung</Link>
        </Button>
      </Section>
    </div>
  );
}
