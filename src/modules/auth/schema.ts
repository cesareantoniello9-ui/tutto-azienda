import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Inserisci un'email valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  companyName: z.string().min(2, "Inserisci il nome dell'azienda"),
  email: z.email("Inserisci un'email valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const resetPasswordSchema = z.object({
  email: z.email("Inserisci un'email valida"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Le password non coincidono",
    path: ["confirm"],
  });
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

export const onboardingSchema = z.object({
  name: z.string().min(2, "Inserisci il nome dell'azienda").max(100),
  slug: z
    .string()
    .min(3, "Minimo 3 caratteri")
    .max(63)
    .regex(/^[a-z0-9-]+$/, "Solo minuscole, numeri e trattini"),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;
