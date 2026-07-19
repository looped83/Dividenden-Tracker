import { z } from "zod";

// Passwort-Mindestlaenge 12 (SECURITY_MODEL.md §2).
const MIN_PASSWORD_LENGTH = 12;

export const emailSchema = z
  .email("Ungültige E-Mail-Adresse")
  .trim()
  .min(1, "E-Mail-Adresse ist erforderlich");

export const newPasswordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Das Passwort muss mindestens ${String(MIN_PASSWORD_LENGTH)} Zeichen lang sein`,
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Passwort ist erforderlich"),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Die Passwörter stimmen nicht überein",
    path: ["passwordConfirm"],
  });
export type RegisterFormValues = z.infer<typeof registerSchema>;

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});
export type ResetPasswordRequestFormValues = z.infer<typeof resetPasswordRequestSchema>;

export const resetPasswordConfirmSchema = z
  .object({
    password: newPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Die Passwörter stimmen nicht überein",
    path: ["passwordConfirm"],
  });
export type ResetPasswordConfirmFormValues = z.infer<typeof resetPasswordConfirmSchema>;
