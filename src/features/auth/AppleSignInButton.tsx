import * as React from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.05-.22-.05-.39 0-1.15.572-2.27 1.207-2.98.804-.94 2.142-1.64 3.157-1.68.02.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.94 1.36-1.92 2.72-3.46 2.75-1.51.03-2-.88-3.73-.88-1.73 0-2.27.85-3.7.91-1.49.05-2.62-1.47-3.55-2.82-1.9-2.75-3.37-7.75-1.41-11.13.98-1.68 2.72-2.74 4.61-2.77 1.46-.03 2.83.98 3.73.98.9 0 2.55-1.21 4.31-1.03.73.03 2.79.3 4.12 2.22-.11.07-2.46 1.44-2.44 4.29.03 3.41 2.99 4.55 3.03 4.57z" />
    </svg>
  );
}

/**
 * OAuth mit Apple (SECURITY_MODEL.md §2, spaeter ergaenzt). Ein einziger
 * Button fuer Login UND Registrierung, da Supabase bei OAuth-Providern bei
 * Erstanmeldung automatisch ein Konto anlegt (kein separater Signup-Schritt).
 * Erfordert eine vollstaendig eingerichtete "Sign in with Apple"-Konfiguration
 * in Supabase (Client ID/Team ID/Key ID/Private Key von Apple), sonst schlaegt
 * der OAuth-Handshake bei Apple selbst fehl.
 */
export function AppleSignInButton() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleClick = async () => {
    setIsLoading(true);
    setError(null);

    // Nach erfolgreichem Login zurueck zur App-Wurzel (Hash-Router,
    // GitHub-Pages-Unterpfad beruecksichtigt — DECISIONS.md D-030).
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}#/`,
      },
    });

    if (oauthError) {
      console.error("Apple OAuth error:", oauthError);
      setError(`Anmeldung mit Apple fehlgeschlagen: ${oauthError.message}`);
      setIsLoading(false);
    }
    // Bei Erfolg navigiert der Browser weg zu Apple; kein weiterer State noetig.
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => void handleClick()}
        disabled={isLoading}
      >
        <AppleLogo className="size-4" />
        {isLoading ? "Wird weitergeleitet …" : "Mit Apple anmelden"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
