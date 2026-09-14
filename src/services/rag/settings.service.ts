/**
 * Impostazioni RAG per azienda + stato dell'indice.
 *
 * Se la riga non esiste (o la migration non è stata applicata) si restituiscono
 * i default: la pagina resta utilizzabile e spiega cosa manca.
 */
import type { RagIndexOverviewRow, RagSettings } from "@/types/rag";
import { defaultSettings, normalizeEffort } from "@/lib/rag/config";
import { currentCompanyId, isMissingSchema, ragClient, toRagError } from "./base";

export type RagSettingsUpdate = Partial<
  Pick<
    RagSettings,
    | "assistant_name"
    | "system_instructions"
    | "glossary"
    | "enabled_sources"
    | "top_k"
    | "candidate_pool"
    | "min_similarity"
    | "memory_enabled"
    | "memory_top_k"
    | "answer_model"
    | "embedding_model"
    | "effort"
  >
>;

export const ragSettingsService = {
  async get(): Promise<RagSettings> {
    const companyId = await currentCompanyId();
    const supabase = await ragClient();

    const { data, error } = await supabase
      .from("rag_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error && !isMissingSchema(error.code)) {
      throw toRagError("Lettura delle impostazioni non riuscita", error);
    }
    if (!data) return defaultSettings(companyId);

    const row = data as RagSettings;
    return {
      ...defaultSettings(companyId),
      ...row,
      // `glossary` ed `enabled_sources` arrivano da jsonb/array: si normalizzano.
      glossary: Array.isArray(row.glossary) ? row.glossary : [],
      enabled_sources: Array.isArray(row.enabled_sources)
        ? row.enabled_sources
        : defaultSettings(companyId).enabled_sources,
      effort: normalizeEffort(row.effort),
    };
  },

  async update(input: RagSettingsUpdate): Promise<RagSettings> {
    const companyId = await currentCompanyId();
    const supabase = await ragClient();

    const { data, error } = await supabase
      .from("rag_settings")
      .upsert({ company_id: companyId, ...input }, { onConflict: "company_id" })
      .select("*")
      .single();

    if (error) throw toRagError("Salvataggio delle impostazioni non riuscito", error);
    return data as RagSettings;
  },

  /** Stato dell'indice per origine (documenti, chunk, documenti da aggiornare). */
  async indexOverview(): Promise<RagIndexOverviewRow[]> {
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_index_overview")
      .select("*")
      .order("source_type", { ascending: true });

    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura dello stato dell'indice non riuscita", error);
    }
    return (data ?? []) as RagIndexOverviewRow[];
  },

  /** Quante entità aspettano di essere (re-)indicizzate. */
  async pendingCount(): Promise<number> {
    const supabase = await ragClient();
    const { count, error } = await supabase
      .from("rag_index_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) {
      if (isMissingSchema(error.code)) return 0;
      throw toRagError("Lettura della coda non riuscita", error);
    }
    return count ?? 0;
  },
};
