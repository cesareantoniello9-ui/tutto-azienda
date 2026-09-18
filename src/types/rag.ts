/**
 * Tipi del modulo RAG "Memoriale" — Tutto.Azienda
 *
 * Rispecchiano la migration `00005_rag_memoriale.sql` (campi snake_case per le
 * righe DB) e aggiungono i tipi di dominio usati dal motore di recupero e
 * generazione (camelCase), che non hanno una tabella corrispondente.
 */

import type { UUID, Timestamp } from "@/types/crm";

// ─────────────────────────────────────────────────────────────
// Enum (allineati agli ENUM Postgres `rag_*`)
// ─────────────────────────────────────────────────────────────
export const RAG_SOURCE_TYPES = [
  "tenant",
  "member",
  "client",
  "lead",
  "opportunity",
  "quote",
  "activity",
  "note",
  "manual",
  "file",
  "daily",
  "email",
] as const;
export type RagSourceType = (typeof RAG_SOURCE_TYPES)[number];

export const RAG_MEMORY_KINDS = [
  "fact",
  "preference",
  "decision",
  "event",
  "metric",
  "relationship",
] as const;
export type RagMemoryKind = (typeof RAG_MEMORY_KINDS)[number];

export const RAG_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type RagEffort = (typeof RAG_EFFORTS)[number];

export type RagMessageRole = "user" | "assistant";
export type RagJobStatus = "pending" | "running" | "done" | "failed";

/** Etichette italiane delle origini — usate nell'UI e nei prompt. */
export const RAG_SOURCE_LABELS: Record<RagSourceType, string> = {
  tenant: "Azienda",
  member: "Team",
  client: "Cliente",
  lead: "Lead",
  opportunity: "Opportunità",
  quote: "Preventivo",
  activity: "Attività",
  note: "Nota",
  manual: "Documento interno",
  file: "Allegato",
  daily: "Riepilogo giornaliero",
  email: "Email",
};

// ─────────────────────────────────────────────────────────────
// Righe DB
// ─────────────────────────────────────────────────────────────
export interface RagSettings {
  company_id: UUID;
  assistant_name: string;
  system_instructions: string | null;
  glossary: GlossaryEntry[];
  enabled_sources: RagSourceType[];
  top_k: number;
  candidate_pool: number;
  min_similarity: number;
  memory_enabled: boolean;
  memory_top_k: number;
  answer_model: string;
  embedding_model: string;
  effort: RagEffort;
  /** Riepilogo di fine giornata generato dal cron. */
  daily_recap_enabled: boolean;
  /** Ora locale in cui lo scheduler esterno dovrebbe generarlo (0–23). */
  daily_recap_hour: number;
  email_ingestion_enabled: boolean;
  /** Privacy: indicizza solo la posta legata a un contatto già nel CRM. */
  email_only_known_contacts: boolean;
  /** Domini ammessi anche senza corrispondenza nel CRM. */
  email_allowed_domains: string[];
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type GlossaryEntry = { term: string; definition: string };

export interface RagDocumentRow {
  id: UUID;
  company_id: UUID;
  source_type: RagSourceType;
  source_id: UUID;
  title: string;
  summary: string | null;
  content: string;
  language: string;
  metadata: Record<string, unknown>;
  checksum: string;
  token_estimate: number;
  chunk_count: number;
  embedding_model: string | null;
  indexed_at: Timestamp | null;
  is_stale: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RagMemoryRow {
  id: UUID;
  company_id: UUID;
  kind: RagMemoryKind;
  content: string;
  importance: number;
  confidence: number;
  subject_type: RagSourceType | null;
  subject_id: UUID | null;
  valid_from: Timestamp;
  valid_until: Timestamp | null;
  superseded_by: UUID | null;
  pinned: boolean;
  hit_count: number;
  last_used_at: Timestamp | null;
  source_message_id: UUID | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RagConversationRow {
  id: UUID;
  company_id: UUID;
  user_id: UUID | null;
  title: string;
  message_count: number;
  last_message_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RagMessageRow {
  id: UUID;
  company_id: UUID;
  conversation_id: UUID;
  role: RagMessageRole;
  content: string;
  citations: RagCitation[];
  context: RagAnswerContext;
  created_at: Timestamp;
}

/** Riga restituita dalla vista `rag_index_overview`. */
export interface RagIndexOverviewRow {
  company_id: UUID;
  source_type: RagSourceType;
  documents: number;
  stale_documents: number;
  chunks: number;
  last_indexed_at: Timestamp | null;
}

// ─────────────────────────────────────────────────────────────
// Dominio: indicizzazione
// ─────────────────────────────────────────────────────────────

/** Documento "memoriale" prodotto dai serializzatori, prima di finire a DB. */
export interface SourceDocument {
  sourceType: RagSourceType;
  sourceId: UUID;
  title: string;
  /** Riassunto di una riga, mostrato nell'UI e usato come contesto citazione. */
  summary: string;
  /** Testo completo in linguaggio naturale (italiano). */
  content: string;
  metadata: Record<string, unknown>;
}

export interface TextChunk {
  index: number;
  content: string;
  tokenEstimate: number;
}

export interface IngestionReport {
  scanned: number;
  indexed: number;
  skipped: number;
  deleted: number;
  chunks: number;
  embeddedChunks: number;
  errors: { sourceType: RagSourceType; sourceId: UUID; message: string }[];
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────
// Dominio: recupero
// ─────────────────────────────────────────────────────────────

/** Riga restituita da `rag_search_chunks` (RPC Postgres). */
export interface RetrievedChunk {
  chunkId: UUID;
  documentId: UUID;
  sourceType: RagSourceType;
  sourceId: UUID;
  title: string;
  content: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  /** Similarità coseno 0–1 (0 se il risultato arriva solo dal full-text). */
  similarity: number;
  /** Punteggio `ts_rank_cd` (0 se il risultato arriva solo dal vettoriale). */
  lexicalRank: number;
  /** Punteggio fuso RRF: è l'ordinamento finale. */
  score: number;
  updatedAt: Timestamp;
}

export interface RecalledMemory {
  id: UUID;
  kind: RagMemoryKind;
  content: string;
  importance: number;
  confidence: number;
  subjectType: RagSourceType | null;
  subjectId: UUID | null;
  pinned: boolean;
  similarity: number;
  createdAt: Timestamp;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  memories: RecalledMemory[];
  /** `true` quando la ricerca è stata solo lessicale (embedding non disponibili). */
  lexicalOnly: boolean;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────
// Dominio: generazione
// ─────────────────────────────────────────────────────────────

/** Citazione restituita da Claude, riportata all'origine nel CRM. */
export interface RagCitation {
  documentId: UUID;
  sourceType: RagSourceType;
  sourceId: UUID;
  title: string;
  citedText: string;
}

/** Diagnostica salvata insieme alla risposta (colonna `context`). */
export interface RagAnswerContext {
  model?: string;
  chunkIds?: UUID[];
  memoryIds?: UUID[];
  sourceTypes?: RagSourceType[];
  lexicalOnly?: boolean;
  retrievalMs?: number;
  generationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  degraded?: "demo" | "no-api-key" | "no-context";
}

export interface RagAnswer {
  text: string;
  citations: RagCitation[];
  context: RagAnswerContext;
}

/** Turno precedente inviato al modello per mantenere il filo del discorso. */
export interface RagHistoryTurn {
  role: RagMessageRole;
  content: string;
}

// ─────────────────────────────────────────────────────────────
// Fonti estese (migration 00007)
// ─────────────────────────────────────────────────────────────

/** Riepilogo di fine giornata: cosa è successo davvero oggi in azienda. */
export interface RagDailyRecapRow {
  id: UUID;
  company_id: UUID;
  recap_date: string;
  summary: string;
  highlights: string[];
  stats: DailyStats;
  generated_by: string | null;
  generated_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Numeri grezzi della giornata, calcolati dal database non dal modello. */
export interface DailyStats {
  clientsCreated: number;
  leadsCreated: number;
  leadsConverted: number;
  opportunitiesOpened: number;
  opportunitiesWon: number;
  opportunitiesLost: number;
  wonAmount: number;
  quotesIssued: number;
  quotesAccepted: number;
  quotedAmount: number;
  activitiesCompleted: number;
  activitiesPlanned: number;
  notesWritten: number;
  emailsReceived: number;
  filesUploaded: number;
}

/** Elemento della giornata, con il riferimento all'entità che lo ha prodotto. */
export interface DailyEvent {
  kind:
    | "client"
    | "lead"
    | "opportunity"
    | "quote"
    | "activity"
    | "note"
    | "email"
    | "file";
  at: Timestamp;
  text: string;
}

export type FileExtractionStatus = "pending" | "done" | "failed" | "unsupported";

export interface RagFileRow {
  id: UUID;
  company_id: UUID;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  title: string | null;
  category: string | null;
  client_id: UUID | null;
  lead_id: UUID | null;
  opportunity_id: UUID | null;
  extracted_text: string | null;
  extraction_status: FileExtractionStatus;
  extraction_error: string | null;
  page_count: number | null;
  uploaded_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type EmailDirection = "inbound" | "outbound";

export interface RagEmailRow {
  id: UUID;
  company_id: UUID;
  message_id: string;
  thread_id: string | null;
  direction: EmailDirection;
  subject: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  body_text: string;
  sent_at: Timestamp;
  client_id: UUID | null;
  lead_id: UUID | null;
  has_attachments: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─────────────────────────────────────────────────────────────
// Valutazione automatica
// ─────────────────────────────────────────────────────────────

/** Documento che una buona risposta deve recuperare. */
export interface ExpectedSource {
  sourceType: RagSourceType;
  sourceId?: UUID;
}

export interface RagEvalCaseRow {
  id: UUID;
  company_id: UUID;
  question: string;
  expected_sources: ExpectedSource[];
  expected_keywords: string[];
  note: string | null;
  is_active: boolean;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Esito di un singolo caso: recuperato? in che posizione? risposta ancorata? */
export interface EvalCaseOutcome {
  question: string;
  caseId?: UUID | null;
  hit: boolean;
  /** Posizione 1-based del primo documento atteso fra i recuperati. */
  rank: number | null;
  /** `true` se per questo caso è stata generata una risposta (non solo recupero). */
  generated: boolean;
  grounded: boolean;
  keywordsFound: string[];
  keywordsMissing: string[];
  answer?: string;
  citations?: RagCitation[];
  retrieved: { sourceType: RagSourceType; sourceId: UUID; title: string }[];
}

export interface EvalMetrics {
  cases: number;
  /** Casi in cui è stata generata una risposta: solo su questi ha senso l'ancoraggio. */
  generatedCases: number;
  /** Quota di domande in cui il documento atteso è stato recuperato. */
  recallAtK: number;
  /** Mean Reciprocal Rank: premia il documento atteso in cima. */
  mrr: number;
  /** Quota di risposte che citano davvero un documento del contesto. */
  groundedRatio: number;
  /** Quota media di parole chiave attese presenti nella risposta. */
  keywordRatio: number;
}

export interface EvalRunReport extends EvalMetrics {
  runId: UUID | null;
  label: string;
  outcomes: EvalCaseOutcome[];
  durationMs: number;
}
