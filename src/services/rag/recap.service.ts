/**
 * Riepilogo di fine giornata — persistenza e generazione.
 *
 * Il cron chiama `generateForCompany` una volta al giorno (o l'utente dal
 * pulsante «Genera riepilogo»): il servizio legge la giornata, la classifica con
 * `buildDailySnapshot` e salva il testo. Il trigger della 00007 fa il resto:
 * il riepilogo entra in coda e diventa un documento citabile.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Activity, Client, Lead, Note, Opportunity, Quote } from "@/types/crm";
import type { RagDailyRecapRow, RagEmailRow, RagFileRow } from "@/types/rag";
import type { Tenant } from "@/types/tenant";
import { buildDailySnapshot, localDay, writeRecapNarrative } from "@/lib/rag/recap";
import { currentCompanyId, isMissingSchema, ragAdmin, ragClient, toRagError } from "./base";

const MAX_ROWS = 2000;

export const ragRecapService = {
  /** Ultimi riepiloghi, dal più recente. */
  async list(limit = 14): Promise<RagDailyRecapRow[]> {
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_daily_recaps")
      .select("*")
      .order("recap_date", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura dei riepiloghi non riuscita", error);
    }
    return (data ?? []) as RagDailyRecapRow[];
  },

  /** Riepilogo di un giorno specifico (`YYYY-MM-DD`). */
  async forDate(date: string): Promise<RagDailyRecapRow | null> {
    const companyId = await currentCompanyId();
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_daily_recaps")
      .select("*")
      .eq("company_id", companyId)
      .eq("recap_date", date)
      .maybeSingle();

    if (error) {
      if (isMissingSchema(error.code)) return null;
      throw toRagError("Lettura del riepilogo non riuscita", error);
    }
    return (data as RagDailyRecapRow | null) ?? null;
  },

  /**
   * Genera (o rigenera) il riepilogo di una giornata per un'azienda.
   * Gira con la service-role: è un lavoro di sistema, invocabile anche dal cron
   * quando non c'è nessuna sessione utente.
   */
  async generateForCompany(
    companyId: string,
    options: { date?: string; force?: boolean } = {},
  ): Promise<RagDailyRecapRow | null> {
    const supabase = await ragAdmin();

    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();
    const tenant = (tenantRow as Tenant | null) ?? null;
    if (!tenant) return null;

    const timezone = tenant.settings?.timezone ?? "Europe/Rome";
    const date = options.date ?? localDay(new Date().toISOString(), timezone) ?? todayIso();

    const { data: settingsRow } = await supabase
      .from("rag_settings")
      .select("daily_recap_enabled, answer_model")
      .eq("company_id", companyId)
      .maybeSingle();

    const settings = settingsRow as
      | { daily_recap_enabled: boolean; answer_model: string }
      | null;
    if (settings && !settings.daily_recap_enabled && !options.force) return null;

    const existing = await readRecap(supabase, companyId, date);
    if (existing && !options.force) return existing;

    const snapshot = buildDailySnapshot({
      date,
      ...(await loadDay(supabase, companyId, date, timezone)),
    });

    // Una giornata senza attività non merita un documento nell'indice.
    if (snapshot.empty && !options.force) return null;

    const { summary, generatedBy } = await writeRecapNarrative({
      snapshot,
      tenantName: tenant.name,
      model: settings?.answer_model,
    });

    const { data, error } = await supabase
      .from("rag_daily_recaps")
      .upsert(
        {
          company_id: companyId,
          recap_date: date,
          summary,
          highlights: snapshot.highlights,
          stats: snapshot.stats,
          generated_by: generatedBy,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,recap_date" },
      )
      .select("*")
      .single();

    if (error) throw toRagError("Salvataggio del riepilogo non riuscito", error);
    return data as RagDailyRecapRow;
  },

  /** Aziende con il riepilogo attivo: è la lista su cui gira il cron serale. */
  async companiesWithRecapEnabled(limit = 100): Promise<string[]> {
    const supabase = await ragAdmin();
    const { data, error } = await supabase
      .from("rag_settings")
      .select("company_id")
      .eq("daily_recap_enabled", true)
      .limit(limit);
    if (error) throw toRagError("Lettura delle impostazioni non riuscita", error);
    return (data ?? []).map((row) => row.company_id as string);
  },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readRecap(
  supabase: SupabaseClient,
  companyId: string,
  date: string,
): Promise<RagDailyRecapRow | null> {
  const { data } = await supabase
    .from("rag_daily_recaps")
    .select("*")
    .eq("company_id", companyId)
    .eq("recap_date", date)
    .maybeSingle();
  return (data as RagDailyRecapRow | null) ?? null;
}

/**
 * Righe toccate nella giornata. Si filtra per finestra temporale allargata
 * (±1 giorno) e poi si classifica nel fuso dell'azienda: così il confine di
 * mezzanotte resta corretto senza fare aritmetica sui fusi in SQL.
 */
async function loadDay(
  supabase: SupabaseClient,
  companyId: string,
  date: string,
  timezone: string,
) {
  const from = new Date(`${date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${date}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);

  const window = async <T>(name: string, column: string): Promise<T[]> => {
    const { data, error } = await supabase
      .from(name)
      .select("*")
      .eq("company_id", companyId)
      .gte(column, from.toISOString())
      .lt(column, to.toISOString())
      .limit(MAX_ROWS);
    if (error) throw toRagError(`Lettura di ${name} non riuscita`, error);
    return (data ?? []) as T[];
  };

  // Le entità aggiornate (trattative chiuse, preventivi accettati) si leggono
  // per `updated_at`, che copre anche la creazione.
  const [clients, leads, opportunities, quotes, activities, notes, emails, files] =
    await Promise.all([
      window<Client>("clients", "created_at"),
      window<Lead>("leads", "updated_at"),
      window<Opportunity>("opportunities", "updated_at"),
      window<Quote>("quotes", "updated_at"),
      window<Activity>("activities", "updated_at"),
      window<Note>("notes", "created_at"),
      window<RagEmailRow>("rag_emails", "sent_at"),
      window<RagFileRow>("rag_files", "created_at"),
    ]);

  // Nomi dei contatti citati: il riepilogo parla di persone, non di uuid.
  const clientIds = new Set(
    [
      ...opportunities.map((row) => row.client_id),
      ...quotes.map((row) => row.client_id),
      ...activities.map((row) => row.client_id),
      ...notes.map((row) => row.client_id),
      ...emails.map((row) => row.client_id),
      ...files.map((row) => row.client_id),
      ...leads.map((row) => row.converted_client_id),
    ].filter((id): id is string => Boolean(id)),
  );

  const clientNames = new Map(clients.map((row) => [row.id, row.name] as const));
  const missing = [...clientIds].filter((id) => !clientNames.has(id));
  if (missing.length > 0) {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", missing.slice(0, 1000));
    for (const row of data ?? []) clientNames.set(row.id as string, row.name as string);
  }

  const leadNames = new Map(leads.map((row) => [row.id, row.name] as const));

  return {
    timezone,
    clients,
    leads,
    opportunities,
    quotes,
    activities,
    notes,
    emails,
    files,
    clientNames,
    leadNames,
  };
}
