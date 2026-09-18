import { z } from "zod";
import { RAG_EFFORTS, RAG_MEMORY_KINDS, RAG_SOURCE_TYPES } from "@/types/rag";

/** Domanda alla memoria aziendale. */
export const askSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Scrivi almeno qualche parola")
    .max(2000, "La domanda è troppo lunga (max 2000 caratteri)"),
  conversationId: z.uuid().nullish(),
  sourceTypes: z.array(z.enum(RAG_SOURCE_TYPES)).max(RAG_SOURCE_TYPES.length).optional(),
});
export type AskValues = z.infer<typeof askSchema>;

/** Ricordo inserito o corretto a mano dall'utente. */
export const memorySchema = z.object({
  content: z
    .string()
    .trim()
    .min(10, "Un ricordo utile è lungo almeno una frase")
    .max(1000, "Massimo 1000 caratteri"),
  kind: z.enum(RAG_MEMORY_KINDS).default("fact"),
  importance: z.number().int().min(1).max(5).default(3),
  pinned: z.boolean().default(false),
  subjectType: z.enum(RAG_SOURCE_TYPES).nullish(),
  subjectId: z.uuid().nullish(),
  validUntil: z.iso.datetime().nullish(),
});
export type MemoryValues = z.infer<typeof memorySchema>;

/** Documento interno caricato a mano (procedura, listino, FAQ). */
export const manualDocumentSchema = z.object({
  title: z.string().trim().min(3, "Il titolo è obbligatorio").max(200),
  body: z
    .string()
    .trim()
    .min(20, "Il contenuto è troppo breve per essere utile")
    .max(100_000, "Documento troppo lungo: spezzalo in più parti"),
  category: z.string().trim().max(100).optional(),
});
export type ManualDocumentValues = z.infer<typeof manualDocumentSchema>;

/** Voce di glossario aziendale. */
export const glossaryEntrySchema = z.object({
  term: z.string().trim().min(1).max(80),
  definition: z.string().trim().min(1).max(500),
});

/** Impostazioni del motore, modificabili dagli amministratori. */
export const ragSettingsSchema = z.object({
  assistant_name: z.string().trim().min(2).max(60),
  system_instructions: z.string().trim().max(4000).nullish(),
  glossary: z.array(glossaryEntrySchema).max(200).default([]),
  enabled_sources: z.array(z.enum(RAG_SOURCE_TYPES)).min(1, "Scegli almeno un'origine"),
  top_k: z.number().int().min(1).max(50),
  candidate_pool: z.number().int().min(1).max(200),
  min_similarity: z.number().min(0).max(1),
  memory_enabled: z.boolean(),
  memory_top_k: z.number().int().min(0).max(20),
  answer_model: z.string().trim().min(3).max(100),
  embedding_model: z.string().trim().min(3).max(100),
  effort: z.enum(RAG_EFFORTS),
});
export type RagSettingsValues = z.infer<typeof ragSettingsSchema>;

/** Voto su una risposta. */
export const feedbackSchema = z.object({
  messageId: z.uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().trim().max(1000).optional(),
});
export type FeedbackValues = z.infer<typeof feedbackSchema>;

// ─────────────────────────────────────────────────────────────
// Fonti estese
// ─────────────────────────────────────────────────────────────

/** Generazione manuale del riepilogo di una giornata. */
export const recapRequestSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (formato atteso: AAAA-MM-GG)")
    .optional(),
  force: z.boolean().optional(),
});
export type RecapRequestValues = z.infer<typeof recapRequestSchema>;

/** Metadati di un allegato caricato (il file viaggia a parte, nel FormData). */
export const fileUploadSchema = z.object({
  title: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  clientId: z.uuid().nullish(),
  leadId: z.uuid().nullish(),
  opportunityId: z.uuid().nullish(),
});
export type FileUploadValues = z.infer<typeof fileUploadSchema>;

/** Payload normalizzato di una email in ingresso. */
export const inboundEmailSchema = z.object({
  companySlug: z.string().trim().min(3).max(63).optional(),
  companyId: z.uuid().optional(),
  messageId: z.string().trim().max(500).nullish(),
  threadId: z.string().trim().max(500).nullish(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  subject: z.string().trim().max(500).nullish(),
  from: z.string().trim().min(3).max(320),
  fromName: z.string().trim().max(200).nullish(),
  to: z.array(z.string().trim().max(320)).max(50).optional(),
  cc: z.array(z.string().trim().max(320)).max(50).optional(),
  text: z.string().max(500_000).nullish(),
  html: z.string().max(1_000_000).nullish(),
  sentAt: z.string().max(60).nullish(),
  hasAttachments: z.boolean().optional(),
});
export type InboundEmailValues = z.infer<typeof inboundEmailSchema>;

/** Caso della valutazione automatica. */
export const evalCaseSchema = z.object({
  question: z
    .string()
    .trim()
    .min(5, "La domanda è troppo corta")
    .max(2000),
  expectedSources: z
    .array(
      z.object({
        sourceType: z.enum(RAG_SOURCE_TYPES),
        sourceId: z.uuid().optional(),
      }),
    )
    .max(20)
    .default([]),
  expectedKeywords: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  note: z.string().trim().max(500).nullish(),
});
export type EvalCaseValues = z.infer<typeof evalCaseSchema>;

export const evalRunSchema = z.object({
  mode: z.enum(["retrieval", "answer"]).default("retrieval"),
  label: z.string().trim().max(120).optional(),
});
export type EvalRunValues = z.infer<typeof evalRunSchema>;
