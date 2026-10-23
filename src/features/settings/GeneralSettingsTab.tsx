import * as React from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
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
    // Ab `lg` zweispaltig wie die übrigen Reiter der Einstellungen: Die drei
    // Abschnitte sind kurz, untereinander blieb rechts die halbe Fläche leer.
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-x-16">
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

      <Section title="Darstellung">
        <div className="pt-2">
          <ThemeToggle />
        </div>
      </Section>

      <Section title="Über diese App">
        {/* Die Nummer als Etikett direkt hinter der Beschriftung: Als
            rechtsbündiger Wert stand sie auf breiten Flächen am Fensterrand,
            weit weg von „Version“. */}
        <dl className="flex items-center gap-2 py-3 text-[0.9375rem]">
          <dt className="text-muted-foreground">Version</dt>
          <dd>
            <Badge variant="primary" className="tabular-nums">
              {__APP_VERSION__}
            </Badge>
          </dd>
        </dl>
      </Section>
    </div>
  );
}
