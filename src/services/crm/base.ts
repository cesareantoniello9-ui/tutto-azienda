/**
 * Base condivisa dei service CRM.
 * - `crmClient()`: client Supabase (lato server) per le tabelle CRM, RLS attiva.
 * - Classi d'errore tipizzate.
 * - Helper per il company_id corrente e per la ricerca testuale sicura.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/tenant/context";

// ─────────────────────────────────────────────────────────────
// Errori
// ─────────────────────────────────────────────────────────────
export class CrmError extends Error {
  constructor(
    message: string,
    /** Codice errore Postgres/PostgREST (es. "42501" = violazione RLS). */
    readonly code?: string,
  ) {
    super(message);
    this.name = "CrmError";
  }
}

export class CrmNotFoundError extends CrmError {
  constructor(entity: string, id: string) {
    super(`${entity} con id "${id}" non trovato.`);
    this.name = "CrmNotFoundError";
  }
}

/**
 * Client Supabase (lato server) per le tabelle CRM. RLS applicata dalla
 * sessione utente (company_id = current_tenant_id()).
 *
 * Tipizzato in modo volutamente "loose": le tabelle CRM non fanno parte del
 * tipo `Database` generato, e i generics di supabase-js le risolverebbero a
 * `never`. La rigorosità è garantita dalle FIRME dei service (input
 * `*Insert/*Update`, output `Client/Lead/...`): è quello il contratto tipizzato
 * verso il resto dell'app. Lo schema reale (migration `00004_crm.sql`) resta la
 * fonte di verità.
 */
export async function crmClient(): Promise<SupabaseClient> {
  const supabase = await createSupabaseServerClient();
  return supabase as unknown as SupabaseClient;
}

/** id dell'azienda (tenant) corrente — usato come company_id in creazione. */
export async function currentCompanyId(): Promise<string> {
  const tenant = await requireTenant();
  return tenant.id;
}

/** Neutralizza i caratteri speciali dei filtri PostgREST nei termini di ricerca. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[%,()\\]/g, " ").trim();
}
