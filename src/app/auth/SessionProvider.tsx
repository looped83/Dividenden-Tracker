/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/auth-js";
import { supabase } from "@/lib/supabase/client";

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

/**
 * Haelt den Supabase-Auth-Session-Zustand fuer die gesamte App bereit
 * (ARCHITECTURE.md §7, IMPLEMENTATION_PLAN.md Phase 2 "Session-Handling").
 * Der Auth-Client verwaltet Token-Refresh und Persistenz selbst (PKCE); dieser
 * Provider synchronisiert lediglich den React-Zustand mit `onAuthStateChange`.
 *
 * Der Abfrage-Cache gehoert genau einem Nutzer: Wechselt er — Abmelden,
 * abgelaufene Sitzung, ein anderes Konto —, wird der Cache geleert
 * (SECURITY_MODEL.md §2). Ohne das saehe ein im selben Tab angemeldetes
 * zweites Konto bis zum Ablauf der Frische (5 Minuten) die Finanzdaten des
 * ersten. Geleert wird beim Wechsel der Nutzerkennung, nicht nur beim
 * Abmelden: Laeuft zwischen Abmelden und neuer Anmeldung noch eine Abfrage
 * ohne Sitzung, stuende sonst ihr leeres Ergebnis als frisch im Cache.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    // `undefined`: noch keine Sitzung bekannt — der erste Stand ist kein Wechsel.
    let userId: string | null | undefined;

    const apply = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (userId !== undefined && nextUserId !== userId) queryClient.clear();
      userId = nextUserId;
      setSession(nextSession);
      setIsLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (isMounted) apply(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      apply(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = React.useMemo(() => ({ session, isLoading }), [session, isLoading]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = React.useContext(SessionContext);
  if (!context) {
    throw new Error("useSession muss innerhalb von <SessionProvider> verwendet werden.");
  }
  return context;
}
