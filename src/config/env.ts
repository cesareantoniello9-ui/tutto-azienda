import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_DOMAIN: z.string().min(1),
});

function validateEnv() {
  const serverResult = serverSchema.safeParse(process.env);
  const clientResult = clientSchema.safeParse(process.env);

  const errors: string[] = [];

  if (!serverResult.success) {
    errors.push(
      ...serverResult.error.issues.map((i) => `[SERVER] ${i.path.join(".")}: ${i.message}`)
    );
  }
  if (!clientResult.success) {
    errors.push(
      ...clientResult.error.issues.map((i) => `[CLIENT] ${i.path.join(".")}: ${i.message}`)
    );
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join("\n")}`);
  }

  return {
    ...(serverResult.data as z.infer<typeof serverSchema>),
    ...(clientResult.data as z.infer<typeof clientSchema>),
  };
}

export const env = validateEnv();
