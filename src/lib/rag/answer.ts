/**
 * Generazione della risposta a partire dal contesto recuperato.
 *
 * Modello: Claude Opus 5 con adaptive thinking. Le citazioni non sono un
 * artificio di prompt: arrivano dall'API come `citations_delta` sui blocchi
 * `document`, quindi il testo citato è sempre letterale.
 *
 * Senza `ANTHROPIC_API_KEY` il motore non fallisce: restituisce una risposta
 * ESTRATTIVA (gli estratti pertinenti, senza sintesi), segnalandolo all'utente.
 */
import { describeAnthropicError, getAnthropicClient, SERVER_FALLBACK_BETA } from "./anthropic";
import { DEFAULT_ANSWER_MODEL, normalizeEffort } from "./config";
import { buildMessages, buildPlainContext, buildSystemPrompt, mapCitations } from "./prompt";
import { RAG_SOURCE_LABELS } from "@/types/rag";
import type {
  RagAnswer,
  RagEffort,
  RagHistoryTurn,
  RagSettings,
  RecalledMemory,
  RetrievedChunk,
} from "@/types/rag";

/** Tetto di output: una risposta di chat non ha motivo di superarlo. */
const MAX_TOKENS = 8192;

export type GenerateParams = {
  question: string;
  tenantName: string;
  chunks: RetrievedChunk[];
  memories: RecalledMemory[];
  history?: RagHistoryTurn[];
  settings: Pick<
    RagSettings,
    "assistant_name" | "system_instructions" | "glossary" | "answer_model" | "effort"
  >;
  signal?: AbortSignal;
};

export type RagStreamEvent =
  | { type: "text"; delta: string }
  | { type: "done"; answer: RagAnswer }
  | { type: "error"; message: string };

/**
 * Risposta in streaming. Emette i delta di testo appena arrivano e chiude con
 * l'evento `done`, che porta citazioni e diagnostica complete.
 */
export async function* streamAnswer(params: GenerateParams): AsyncGenerator<RagStreamEvent> {
  const client = getAnthropicClient();

  if (!client) {
    const answer = extractiveAnswer(params.chunks);
    yield { type: "text", delta: answer.text };
    yield { type: "done", answer };
    return;
  }

  const startedAt = Date.now();
  const model = params.settings.answer_model?.trim() || DEFAULT_ANSWER_MODEL;
  const effort: RagEffort = normalizeEffort(params.settings.effort);

  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: MAX_TOKENS,
        // Il rifiuto per policy viene ripreso su un modello di riserva nella
        // stessa chiamata: l'utente non resta mai senza risposta.
        betas: [SERVER_FALLBACK_BETA],
        fallbacks: "default",
        system: buildSystemPrompt(params.tenantName, params.settings),
        messages: buildMessages({
          question: params.question,
          chunks: params.chunks,
          memories: params.memories,
          history: params.history,
        }),
        thinking: { type: "adaptive" },
        output_config: { effort },
      },
      params.signal ? { signal: params.signal } : undefined,
    );

    let text = "";

    for await (const event of stream) {
      if (event.type !== "content_block_delta") continue;
      if (event.delta.type === "text_delta") {
        text += event.delta.text;
        yield { type: "text", delta: event.delta.text };
      }
    }

    const final = await stream.finalMessage();

    // Le citazioni vivono sui blocchi di testo della risposta finale.
    const citations = mapCitations(
      final.content.flatMap((block) =>
        block.type === "text" && block.citations ? block.citations : [],
      ),
      params.chunks,
    );

    if (final.stop_reason === "refusal") {
      const message =
        "Il modello non ha potuto rispondere a questa richiesta. Riformula la domanda o rivolgiti a un amministratore.";
      yield { type: "text", delta: message };
      yield {
        type: "done",
        answer: { text: text ? `${text}\n\n${message}` : message, citations, context: { model } },
      };
      return;
    }

    yield {
      type: "done",
      answer: {
        text,
        citations,
        context: {
          model: final.model ?? model,
          chunkIds: params.chunks.map((c) => c.chunkId),
          memoryIds: params.memories.map((m) => m.id),
          sourceTypes: [...new Set(params.chunks.map((c) => c.sourceType))],
          generationMs: Date.now() - startedAt,
          inputTokens: final.usage?.input_tokens,
          outputTokens: final.usage?.output_tokens,
        },
      },
    };
  } catch (error) {
    yield { type: "error", message: describeAnthropicError(error) };
  }
}

/** Variante non-streaming: utile dalle Server Action e dai test. */
export async function generateAnswer(params: GenerateParams): Promise<RagAnswer> {
  let answer: RagAnswer | null = null;
  let failure: string | null = null;

  for await (const event of streamAnswer(params)) {
    if (event.type === "done") answer = event.answer;
    if (event.type === "error") failure = event.message;
  }

  if (failure) throw new Error(failure);
  return answer ?? extractiveAnswer(params.chunks);
}

/**
 * Risposta senza modello generativo: mostra ciò che la memoria contiene.
 * Non è una sintesi, ed è dichiarato all'utente — meglio di un'invenzione.
 */
export function extractiveAnswer(chunks: RetrievedChunk[]): RagAnswer {
  if (chunks.length === 0) {
    return {
      text: "Non ho trovato nulla di pertinente nella memoria aziendale. Prova a riformulare la domanda o verifica che l'indice sia aggiornato.",
      citations: [],
      context: { degraded: "no-context" },
    };
  }

  const intro =
    "Risposta non generata (modello non configurato): ecco gli estratti più pertinenti trovati nella memoria aziendale.";

  return {
    text: `${intro}\n\n${buildPlainContext(chunks)}`,
    citations: chunks.map((chunk) => ({
      documentId: chunk.documentId,
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      title: chunk.title,
      citedText: chunk.content.slice(0, 280),
    })),
    context: {
      degraded: "no-api-key",
      chunkIds: chunks.map((c) => c.chunkId),
      sourceTypes: [...new Set(chunks.map((c) => c.sourceType))],
    },
  };
}

/** Titolo breve per una conversazione, derivato dalla prima domanda. */
export function conversationTitle(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  if (clean.length <= 60) return clean || "Nuova conversazione";
  return `${clean.slice(0, 57).trimEnd()}…`;
}

/** Etichetta leggibile dell'origine, condivisa fra UI e prompt. */
export function sourceLabel(sourceType: keyof typeof RAG_SOURCE_LABELS): string {
  return RAG_SOURCE_LABELS[sourceType];
}
