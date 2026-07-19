import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

/**
 * Haelt den Supabase-Auth-Session-Zustand fuer die gesamte App bereit
 * (ARCHITECTURE.md §7, IMPLEMENTATION_PLAN.md Phase 2 "Session-Handling").
 * supabase-js verwaltet Token-Refresh und Persistenz selbst (PKCE); dieser
 * Provider synchronisiert lediglich den React-Zustand mit `onAuthStateChange`.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
