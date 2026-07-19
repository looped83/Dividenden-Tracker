import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { AuthLayout } from "@/features/auth/AuthLayout";
import {
  resetPasswordConfirmSchema,
  type ResetPasswordConfirmFormValues,
} from "@/features/auth/schemas";

/**
 * Wird ueber den Link aus der Passwort-zuruecksetzen-E-Mail erreicht.
 * supabase-js richtet dank `detectSessionInUrl` bereits eine temporaere
 * Recovery-Session ein; `updateUser` setzt darauf das neue Passwort.
 */
export function ResetPasswordConfirmPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordConfirmFormValues>({
    resolver: zodResolver(resetPasswordConfirmSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });

    if (error) {
      setFormError(
        "Das Passwort konnte nicht geändert werden. Fordere ggf. einen neuen Link an.",
      );
      return;
    }

    await supabase.auth.signOut();
    void navigate("/login", { replace: true });
  });

  return (
    <AuthLayout title="Neues Passwort festlegen">
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">Neues Passwort</Label>
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
          {isSubmitting ? "Wird gespeichert …" : "Passwort speichern"}
        </Button>
      </form>
    </AuthLayout>
  );
}
