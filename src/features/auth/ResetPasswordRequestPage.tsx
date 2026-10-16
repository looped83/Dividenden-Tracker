import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/lib/supabase/client";
import { AuthLayout } from "@/features/auth/AuthLayout";
import {
  resetPasswordRequestSchema,
  type ResetPasswordRequestFormValues,
} from "@/features/auth/schemas";

export function ResetPasswordRequestPage() {
  const [submitted, setSubmitted] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordRequestFormValues>({
    resolver: zodResolver(resetPasswordRequestSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    // Bewusst kein Unterschied in der Anzeige, ob die E-Mail-Adresse
    // existiert (kein Preisgeben von Kontoinformationen).
    // window.location.pathname (nicht nur origin) beruecksichtigt den
    // GitHub-Pages-Unterpfad (z. B. "/Dividenden-Tracker/"); bei einem
    // Hash-Router ist der pathname unabhaengig von der aktuellen Route immer
    // der Deployment-Basispfad (DECISIONS.md D-030).
    await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}${window.location.pathname}#/passwort-zuruecksetzen`,
    });
    setSubmitted(true);
  });

  if (submitted) {
    return (
      <AuthLayout title="E-Mail versendet">
        <EmptyState
          icon={MailCheck}
          title="Prüfe dein Postfach"
          description="Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir einen Link zum Zurücksetzen des Passworts gesendet."
          action={
            <Button asChild>
              <Link to="/login">Zur Anmeldung</Link>
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Passwort vergessen"
      description="Wir senden dir einen Link zum Zurücksetzen."
    >
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-Mail-Adresse</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-negative">
              {errors.email.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Wird gesendet …" : "Link senden"}
        </Button>
      </form>
    </AuthLayout>
  );
}
