/**
 * Orchestrazione di una domanda alla memoria aziendale.
 *
 *   impostazioni → recupero ibrido → generazione con citazioni
 *     → salvataggio del turno → estrazione dei ricordi a lungo termine
 *
 * È l'unico punto in cui le parti si incontrano: la route in streaming e la
 * Server Action non-streaming consumano lo stesso generatore, così il
 * comportamento non può divergere fra le due strade.
 */
import { isDemoMode } from "@/config/demo";
import { requireTenant } from "@/lib/tenant/context";
import { streamAnswer, type RagStreamEvent } from "@/lib/rag/answer";
import { extractMemories } from "@/lib/rag/memory";
import { demoMemories, demoRetrieve } from "@/lib/rag/demo";
import type {
  RagAnswer,
  RagSourceType,
  RecalledMemory,
  RetrievalResult,
} from "@/types/rag";
import { ragConversationsService } from "./conversations.service";
import { ragMemoriesService } from "./memories.service";
import { ragSearchService } from "./search.service";
import { ragSettingsService } from "./settings.service";

export type AskParams = {
  question: string;
  conversationId?: string | null;
  sourceTypes?: RagSourceType[];
  /** Disattiva il salvataggio (utile per l'anteprima di una ricerca). */
  persist?: boolean;
  signal?: AbortSignal;
};

export type AskEvent =
  | { type: "retrieval"; retrieval: RetrievalResult }
  | { type: "conversation"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "done"; answer: RagAnswer; messageId: string | null; savedMemories: number }
  | { type: "error"; message: string };

export const ragAskService = {
  /** Domanda in streaming: emette gli eventi nell'ordine in cui accadono. */
  async *ask(params: AskParams): AsyncGenerator<AskEvent> {
    const question = params.question.trim();
    if (!question) {
      yield { type: "error", message: "La domanda è vuota." };
      return;
    }

    const persist = params.persist !== false && !isDemoMode();
    const tenant = await requireTenant();
    const settings = await ragSettingsService.get();

    // 1. Recupero
    let retrieval: RetrievalResult;
    if (isDemoMode()) {
      retrieval = {
        chunks: demoRetrieve(question, settings.top_k),
        memories: settings.memory_enabled ? demoMemories() : [],
        lexicalOnly: true,
        durationMs: 0,
      };
    } else {
      retrieval = await ragSearchService.retrieve(question, settings, {
        sourceTypes: params.sourceTypes,
      });
    }
    yield { type: "retrieval", retrieval };

    // 2. Conversazione (creata alla prima domanda)
    let conversationId = params.conversationId ?? null;
    let history: { role: "user" | "assistant"; content: string }[] = [];

    if (persist) {
      if (!conversationId) {
        conversationId = (await ragConversationsService.create(question)).id;
        yield { type: "conversation", conversationId };
      } else {
        history = await ragConversationsService.history(conversationId);
      }
      await ragConversationsService.addMessage({
        conversationId,
        role: "user",
        content: question,
      });
    }

    // 3. Generazione
    let answer: RagAnswer | null = null;

    for await (const event of streamAnswer({
      question,
      tenantName: tenant.name,
      chunks: retrieval.chunks,
      memories: retrieval.memories,
      history,
      settings,
      signal: params.signal,
    })) {
      const mapped = mapStreamEvent(event);
      if (mapped) yield mapped;
      if (event.type === "done") answer = event.answer;
      if (event.type === "error") return;
    }

    if (!answer) {
      yield { type: "error", message: "Nessuna risposta generata." };
      return;
    }

    answer.context = {
      ...answer.context,
      retrievalMs: retrieval.durationMs,
      lexicalOnly: retrieval.lexicalOnly,
      memoryIds: retrieval.memories.map((memory) => memory.id),
    };

    // 4. Salvataggio + memoria a lungo termine
    let messageId: string | null = null;
    let savedMemories = 0;

    if (persist && conversationId) {
      const saved = await ragConversationsService.addMessage({
        conversationId,
        role: "assistant",
        content: answer.text,
        citations: answer.citations,
        context: answer.context,
      });
      messageId = saved.id;

      await touchUsedMemories(retrieval.memories);
      savedMemories = await rememberExchange({
        question,
        answer: answer.text,
        model: settings.answer_model,
        messageId,
        recalled: retrieval.memories,
      });
    }

    yield { type: "done", answer, messageId, savedMemories };
  },

  /** Variante non-streaming, per le Server Action e i test end-to-end. */
  async answer(params: AskParams): Promise<{
    answer: RagAnswer;
    conversationId: string | null;
    messageId: string | null;
    retrieval: RetrievalResult | null;
  }> {
    let answer: RagAnswer | null = null;
    let conversationId = params.conversationId ?? null;
    let messageId: string | null = null;
    let retrieval: RetrievalResult | null = null;
    let failure: string | null = null;

    for await (const event of this.ask(params)) {
      if (event.type === "conversation") conversationId = event.conversationId;
      if (event.type === "retrieval") retrieval = event.retrieval;
      if (event.type === "done") {
        answer = event.answer;
        messageId = event.messageId;
      }
      if (event.type === "error") failure = event.message;
    }

    if (failure) throw new Error(failure);
    if (!answer) throw new Error("Nessuna risposta generata.");
    return { answer, conversationId, messageId, retrieval };
  },
};

function mapStreamEvent(event: RagStreamEvent): AskEvent | null {
  if (event.type === "text") return { type: "text", delta: event.delta };
  if (event.type === "error") return { type: "error", message: event.message };
  return null; // `done` è gestito dal chiamante, che vi aggiunge la diagnostica.
}

async function touchUsedMemories(memories: RecalledMemory[]): Promise<void> {
  try {
    await ragSearchService.touchMemories(memories.map((memory) => memory.id));
  } catch {
    // Le statistiche d'uso non valgono il fallimento di una risposta.
  }
}

async function rememberExchange(params: {
  question: string;
  answer: string;
  model: string;
  messageId: string;
  recalled: RecalledMemory[];
}): Promise<number> {
  try {
    const candidates = await extractMemories({
      question: params.question,
      answer: params.answer,
      model: params.model,
    });
    if (candidates.length === 0) return 0;
    return await ragMemoriesService.saveExtracted(candidates, {
      sourceMessageId: params.messageId,
      recalled: params.recalled,
    });
  } catch {
    // Anche qui: la memoria a lungo termine è un extra, non un requisito.
    return 0;
  }
}
