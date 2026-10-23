import { z } from "zod";

const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

export const depotFormSchema = z.object({
  name: z.string().trim().min(1, "Broker ist erforderlich").max(100),
  baseCurrency: z
    .string()
    .trim()
    .regex(CURRENCY_PATTERN, "3-stelliger Waehrungscode, z. B. EUR")
    .transform((value) => value.toUpperCase()),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type DepotFormValues = z.infer<typeof depotFormSchema>;
