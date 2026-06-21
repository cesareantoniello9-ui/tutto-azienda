import type { Tenant } from "@/types/tenant";

/**
 * MODALITÀ DEMO
 * Si attiva SOLO in sviluppo e SOLO quando l'URL Supabase è il placeholder.
 * Permette di navigare l'area autenticata (dashboard, settings) senza un
 * backend reale collegato. In produzione (URL Supabase reale) è sempre inerte.
 */
export function isDemoMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Attiva con URL placeholder OPPURE con NEXT_PUBLIC_DEMO=1 (per anteprima UI).
  return url.includes("placeholder") || process.env.NEXT_PUBLIC_DEMO === "1";
}

export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000099";
export const DEMO_USER_EMAIL = "demo@tuttoa.com";

export function demoTenant(slug = "demo"): Tenant {
  const name =
    slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ") + " S.r.l.";
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug,
    name,
    logo_url: null,
    plan: "pro",
    status: "active",
    owner_id: DEMO_USER_ID,
    settings: {
      timezone: "Europe/Rome",
      locale: "it-IT",
      date_format: "DD/MM/YYYY",
      currency: "EUR",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
