import { Navigate, useLocation } from "react-router";
import { useSession } from "@/app/auth/SessionProvider";

/**
 * Route-Guard (IMPLEMENTATION_PLAN.md Phase 2). Ohne Session wird zur
 * Anmeldung umgeleitet; die urspruenglich angeforderte Route wird als
 * `from`-State mitgegeben, um nach dem Login dorthin zurueckzukehren.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Wird geladen …
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
