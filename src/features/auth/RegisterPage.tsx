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
import { registerSchema, type RegisterFormValues } from "@/features/auth/schemas";

export function RegisterPage() {
  const [formError, setFormError] = React.useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
    });

    if (error) {
      console.error("Supabase signUp error:", error);
      setFormError(
        error.message.includes("already registered")
          ? "Für diese E-Mail-Adresse besteht bereits ein Konto."
          : `Registrierung fehlgeschlagen: ${error.message}`,
      );
      return;
    }

    setRegisteredEmail(values.email);
  });

  if (registeredEmail) {
    return (
      <AuthLayout title="Registrierung erfolgreich">
        <EmptyState
          icon={MailCheck}
          title="Bestätige deine E-Mail-Adresse"
          description={`Wir haben eine Bestätigungslink an ${registeredEmail} gesendet. Melde dich an, sobald du die E-Mail bestätigt hast.`}
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
      title="Registrieren"
      footer={
        <>
          Bereits ein Konto?{" "}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Anmelden
          </Link>
        </>
      }
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

        <div className="space-y-1.5">
          <Label htmlFor="password">Passwort</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          {errors.password && (
            <p id="password-error" className="text-sm text-negative">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="passwordConfirm">Passwort bestätigen</Label>
          <Input
            id="passwordConfirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.passwordConfirm)}
            aria-describedby={
              errors.passwordConfirm ? "password-confirm-error" : undefined
            }
            {...register("passwordConfirm")}
          />
          {errors.passwordConfirm && (
            <p id="password-confirm-error" className="text-sm text-negative">
              {errors.passwordConfirm.message}
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-negative">
            {formError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Wird registriert …" : "Registrieren"}
        </Button>
      </form>
    </AuthLayout>
  );
}
