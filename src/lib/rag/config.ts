/**
 * Configurazione del motore RAG.
 *
 * Tutti i valori hanno un default sensato: l'app resta avviabile senza chiavi
 * (modalità demo/degradata), esattamente come il resto di Tutto.Azienda.
 * I knob per-azienda vivono invece nella tabella `rag_settings`.
 */
import type { RagEffort, RagSettings, RagSourceType } from "@/types/rag";
import { RAG_SOURCE_TYPES } from "@/types/rag";

/** Dimensione del vettore: deve combaciare con `vector(1024)` in migration. */
export const EMBEDDING_DIMENSIONS = 1024;

/** Modello di embedding (Voyage AI, il partner embedding di Anthropic). */
export const DEFAULT_EMBEDDING_MODEL = "voyage-3.5";

/** Modello di generazione. */
export const DEFAULT_ANSWER_MODEL = "claude-opus-5";

/** Chunking: ~300 token per chunk, con sovrapposizione per non spezzare il senso. */
export const CHUNK_TARGET_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 180;
export const CHUNK_MIN_CHARS = 120;

/** Quanti chunk al massimo entrano nel contesto di una risposta. */
export const DEFAULT_TOP_K = 8;
/** Ampiezza del pool di candidati prima della fusione RRF. */
export const DEFAULT_CANDIDATE_POOL = 40;
/** Sotto questa similarità un risultato solo-vettoriale viene scartato. */
export const DEFAULT_MIN_SIMILARITY = 0.15;
/** Quanti chunk al massimo può contribuire lo stesso documento. */
export const MAX_CHUNKS_PER_DOCUMENT = 3;
/** Quanti ricordi a lungo termine richiamare. */
export const DEFAULT_MEMORY_TOP_K = 5;
/** Ora locale suggerita per il riepilogo di fine giornata. */
export const DEFAULT_RECAP_HOUR = 19;
/** Quanti eventi al massimo entrano nel riepilogo giornaliero. */
export const MAX_RECAP_EVENTS = 60;
/** Tetto di caratteri per il testo estratto da un allegato. */
export const MAX_FILE_TEXT_CHARS = 200_000;
/** Dimensione massima di un allegato (25 MB, come il bucket). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Turni di conversazione precedenti inviati al modello. */
export const MAX_HISTORY_TURNS = 8;
/** Tetto di caratteri per l'intero contesto inviato al modello. */
export const MAX_CONTEXT_CHARS = 60_000;

/** Dimensione dei lotti verso l'API di embedding. */
export const EMBEDDING_BATCH_SIZE = 32;
/** Quante entità processa un singolo giro di indicizzazione. */
export const INGEST_BATCH_SIZE = 200;

export function anthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
}

export function voyageApiKey(): string | undefined {
  return process.env.VOYAGE_API_KEY?.trim() || undefined;
}

/** Segreto per invocare il re-index da cron/webhook (`POST /api/rag/reindex`). */
export function reindexSecret(): string | undefined {
  return process.env.RAG_REINDEX_SECRET?.trim() || undefined;
}

/**
 * Gli embedding reali richiedono una chiave Voyage. Senza chiave il motore usa
 * un embedding deterministico locale (hashing): utile per sviluppo e test, NON
 * per la qualità semantica in produzione.
 */
export function hasRealEmbeddings(): boolean {
  return Boolean(voyageApiKey());
}

/** Senza chiave Anthropic la risposta resta estrattiva (nessuna generazione). */
export function hasGeneration(): boolean {
  return Boolean(anthropicApiKey());
}

/** Impostazioni di default, usate quando l'azienda non ha ancora una riga. */
export function defaultSettings(companyId: string): RagSettings {
  const now = new Date().toISOString();
  return {
    company_id: companyId,
    assistant_name: "Memoria Aziendale",
    system_instructions: null,
    glossary: [],
    enabled_sources: [...RAG_SOURCE_TYPES],
    top_k: DEFAULT_TOP_K,
    candidate_pool: DEFAULT_CANDIDATE_POOL,
    min_similarity: DEFAULT_MIN_SIMILARITY,
    memory_enabled: true,
    memory_top_k: DEFAULT_MEMORY_TOP_K,
    answer_model: process.env.RAG_ANSWER_MODEL?.trim() || DEFAULT_ANSWER_MODEL,
    embedding_model: process.env.RAG_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    effort: normalizeEffort(process.env.RAG_EFFORT),
    daily_recap_enabled: true,
    daily_recap_hour: DEFAULT_RECAP_HOUR,
    email_ingestion_enabled: true,
    // Predefinito prudente: entra solo la posta di contatti già nel CRM.
    email_only_known_contacts: true,
    email_allowed_domains: [],
    created_at: now,
    updated_at: now,
  };
}

export function normalizeEffort(value: unknown): RagEffort {
  const allowed: RagEffort[] = ["low", "medium", "high", "xhigh", "max"];
  return allowed.find((e) => e === value) ?? "medium";
}

/** Origini indicizzabili automaticamente dal CRM (le altre sono manuali). */
export const INGESTABLE_SOURCES: RagSourceType[] = [
  "tenant",
  "client",
  "lead",
  "opportunity",
  "quote",
  "activity",
  "note",
  "daily",
  "file",
  "email",
];

/** Tipi MIME da cui sappiamo estrarre testo. */
export const SUPPORTED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;
