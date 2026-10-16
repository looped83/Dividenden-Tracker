import * as React from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useSession } from "@/app/auth/SessionProvider";
import { supabase } from "@/lib/supabase/client";

/**
 * Allgemeine Einstellungen: Profil, Darstellung und die Angaben zur laufenden
 * Fassung.
 *
 * Der Abschnitt „Über diese App" beantwortet, welcher Stand hier laeuft —
 * nach einem PWA-Update auf dem iPhone nicht selbstverstaendlich. Den Stand der
 * Datensicherung nennt seit 1.11.0 allein der Reiter „Sicherung"; hier stand
 * er doppelt, samt eigenem Knopf dorthin.
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
        description="Die Version, die auf diesem Gerät läuft."
      >
        {/* Wie eine Listenzeile: Beschriftung links, Wert rechts. Ab `sm` etwa so
            breit wie der Umschalter darüber, nicht wie die Seite — sonst stand
            die Nummer am rechten Fensterrand, weit weg von ihrer Beschriftung. */}
        <dl className="text-[0.9375rem] sm:max-w-72">
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-medium tabular-nums">{__APP_VERSION__}</dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}
