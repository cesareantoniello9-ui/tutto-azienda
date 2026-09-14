/**
 * Base condivisa dei service RAG.
 *
 * Due client, due ruoli:
 * - `ragClient()`   → sessione utente, RLS attiva. Tutto ciò che l'utente legge
 *                     o scrive (ricerca, chat, ricordi) passa da qui.
 * - `ragAdmin()`    → service-role, RLS bypassata. Solo l'indicizzazione, che
 *                     deve leggere le entità e scrivere i chunk per conto del
 *                     sistema (cron/worker), senza una sessione utente.
 *
 * Le tabelle `rag_*` non fanno parte del tipo `Database` generato: come per il
 * CRM, la tipizzazione forte vive nelle firme dei service.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/tenant/context";

export class RagError extends Error {
  constructor(
    message: string,
    /** Codice Postgres/PostgREST (es. "42501" = violazione RLS, "42P01" = tabella assente). */
    readonly code?: string,
  ) {
    super(message);
    this.name = "RagError";
  }
}

/** La migration 00005 non è stata applicata: l'UI lo dice invece di crashare. */
export function isMissingSchema(code?: string): boolean {
  return code === "42P01" || code === "PGRST202" || code === "PGRST205";
}

export async function ragClient(): Promise<SupabaseClient> {
  const supabase = await createSupabaseServerClient();
  return supabase as unknown as SupabaseClient;
}

export async function ragAdmin(): Promise<SupabaseClient> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new RagError(
      "SUPABASE_SERVICE_ROLE_KEY non configurata: l'indicizzazione richiede la chiave service-role.",
    );
  }
  const supabase = await createSupabaseServiceClient();
  return supabase as unknown as SupabaseClient;
}

/** id dell'azienda (tenant) corrente. */
export async function currentCompanyId(): Promise<string> {
  const tenant = await requireTenant();
  return tenant.id;
}

/** Normalizza un errore PostgREST in `RagError`. */
export function toRagError(context: string, error: { message: string; code?: string }): RagError {
  return new RagError(`${context}: ${error.message}`, error.code);
}
