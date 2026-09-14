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
