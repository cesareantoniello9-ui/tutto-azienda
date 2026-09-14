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
  file: "File",
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
