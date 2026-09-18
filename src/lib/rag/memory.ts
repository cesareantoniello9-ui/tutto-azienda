/**
 * Memoria a lungo termine — il "memoriale" vero e proprio.
 *
 * Dopo ogni scambio, Claude estrae i fatti stabili che vale la pena ricordare
 * (decisioni prese, preferenze del cliente, vincoli operativi) e li normalizza
 * in frasi autosufficienti. La struttura è garantita dagli structured outputs,
 * non da un parsing a mano della risposta.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "./anthropic";
import { DEFAULT_ANSWER_MODEL } from "./config";
import { tokenizeForHashing } from "./embeddings";
import { RAG_MEMORY_KINDS } from "@/types/rag";
import type { RagMemoryKind, RagSourceType, RecalledMemory } from "@/types/rag";

const MAX_NEW_MEMORIES = 5;

/** Schema della risposta strutturata del modello. */
const extractionSchema = z.object({
  memories: z.array(
    z.object({
      content: z
        .string()
        .describe(
          "Il fatto da ricordare, in italiano, in una frase autosufficiente e comprensibile fra sei mesi.",
        ),
      kind: z
        .enum(RAG_MEMORY_KINDS)
        .describe(
          "fact = dato stabile; preference = preferenza di un cliente o del team; decision = decisione presa; event = fatto avvenuto con una data; metric = numero rilevante; relationship = legame fra persone o aziende.",
        ),
      importance: z
        .number()
        .int()
        .describe("Da 1 (marginale) a 5 (da non dimenticare mai)."),
      confidence: z
        .number()
        .describe("Da 0 a 1: quanto il fatto è supportato dal contesto fornito."),
    }),
  ),
});

export type ExtractedMemory = {
  content: string;
  kind: RagMemoryKind;
  importance: number;
  confidence: number;
  subjectType?: RagSourceType | null;
  subjectId?: string | null;
};

const EXTRACTION_SYSTEM = `Estrai dalla conversazione i fatti che meritano di entrare nella memoria a lungo termine di un'azienda.

Criteri:
- Solo fatti STABILI e riusabili: preferenze, decisioni, vincoli, accordi, numeri di riferimento.
- Nessun fatto già ovvio dai dati del gestionale (una scheda cliente si rilegge, non si ricorda).
- Nessuna informazione dedotta o incerta: se non è affermata nel testo, non esiste.
- Ogni ricordo è una frase autosufficiente: contiene il soggetto per esteso, non "lui" o "questo cliente".
- Se non c'è nulla che valga la pena ricordare, restituisci una lista vuota. È il caso più frequente.
- Al massimo ${MAX_NEW_MEMORIES} ricordi.`;

/**
 * Estrae i candidati ricordi da uno scambio domanda/risposta.
 * Non solleva eccezioni: l'estrazione è un miglioramento, non un requisito.
 */
export async function extractMemories(params: {
  question: string;
  answer: string;
  model?: string;
}): Promise<ExtractedMemory[]> {
  const client = getAnthropicClient();
  if (!client) return [];

  try {
    const message = await client.messages.parse({
      model: params.model?.trim() || DEFAULT_ANSWER_MODEL,
      max_tokens: 2048,
      system: EXTRACTION_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Domanda del team:\n${params.question}\n\nRisposta data:\n${params.answer}`,
        },
      ],
      output_config: { format: zodOutputFormat(extractionSchema) },
    });

    const parsed = message.parsed_output;
    if (!parsed) return [];

    return parsed.memories
      .slice(0, MAX_NEW_MEMORIES)
      .map((memory) => ({
        content: memory.content.trim(),
        kind: memory.kind,
        importance: clamp(Math.round(memory.importance), 1, 5),
        confidence: clamp(memory.confidence, 0, 1),
      }))
      .filter((memory) => memory.content.length >= 10);
  } catch {
    // Rete, quota o rifiuto: la conversazione resta valida senza nuovi ricordi.
    return [];
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Similarità di Jaccard fra due testi (insiemi di parole significative).
 * Serve a non riscrivere venti volte lo stesso ricordo.
 */
export function textSimilarity(a: string, b: string): number {
  const setA = new Set(tokenizeForHashing(a));
  const setB = new Set(tokenizeForHashing(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

/** Scarta i candidati troppo simili a un ricordo già presente. */
export function filterNewMemories(
  candidates: ExtractedMemory[],
  existing: Pick<RecalledMemory, "content">[],
  threshold = 0.75,
): ExtractedMemory[] {
  const kept: ExtractedMemory[] = [];

  for (const candidate of candidates) {
    const isDuplicate =
      existing.some((memory) => textSimilarity(candidate.content, memory.content) >= threshold) ||
      kept.some((memory) => textSimilarity(candidate.content, memory.content) >= threshold);
    if (!isDuplicate) kept.push(candidate);
  }

  return kept;
}
