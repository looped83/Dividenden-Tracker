import { Navigate, useLocation } from "react-router";
import { useSession } from "@/app/auth/SessionProvider";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

/**
 * Route-Guard (IMPLEMENTATION_PLAN.md Phase 2). Ohne Session wird zur
 * Anmeldung umgeleitet; die urspruenglich angeforderte Route wird als
 * `from`-State mitgegeben, um nach dem Login dorthin zurueckzukehren.
 *
 * Er umschliesst den Inhalt, nicht die App-Huelle (siehe AppShell): Waehrend
 * die Sitzung geprueft wird — nach laengerer Pause erneuert supabase-js dabei
 * erst das Token uebers Netz —, steht die Navigation schon, und der Inhalt
 * zeigt dasselbe Geruest wie beim Nachladen eines Bereichs. Geschuetzte
 * Seiten (und damit ihre Abfragen) werden erst mit gueltiger Sitzung
 * eingehaengt.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
