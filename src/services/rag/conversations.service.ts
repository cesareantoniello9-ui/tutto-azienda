/**
 * Conversazioni e messaggi della chat sulla memoria aziendale.
 *
 * Ogni risposta salva anche le citazioni e la diagnostica del recupero: senza
 * quei dati non si può capire, a distanza di settimane, PERCHÉ il sistema ha
 * risposto in un certo modo.
 */
import type {
  RagAnswerContext,
  RagCitation,
  RagConversationRow,
  RagMessageRow,
  RagMessageRole,
} from "@/types/rag";
import { conversationTitle } from "@/lib/rag/answer";
import { MAX_HISTORY_TURNS } from "@/lib/rag/config";
import { currentCompanyId, isMissingSchema, ragClient, toRagError } from "./base";

export const ragConversationsService = {
  async list(limit = 30): Promise<RagConversationRow[]> {
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura delle conversazioni non riuscita", error);
    }
    return (data ?? []) as RagConversationRow[];
  },

  async create(firstQuestion: string): Promise<RagConversationRow> {
    const supabase = await ragClient();
    const companyId = await currentCompanyId();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("rag_conversations")
      .insert({
        company_id: companyId,
        user_id: user?.id ?? null,
        title: conversationTitle(firstQuestion),
      })
      .select("*")
      .single();

    if (error) throw toRagError("Creazione della conversazione non riuscita", error);
    return data as RagConversationRow;
  },

  async messages(conversationId: string, limit = 100): Promise<RagMessageRow[]> {
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura dei messaggi non riuscita", error);
    }
    return (data ?? []) as RagMessageRow[];
  },

  /** Ultimi turni, nel formato atteso dal costruttore del prompt. */
  async history(conversationId: string): Promise<{ role: RagMessageRole; content: string }[]> {
    const messages = await this.messages(conversationId, MAX_HISTORY_TURNS * 2);
    return messages.slice(-MAX_HISTORY_TURNS).map((message) => ({
      role: message.role,
      content: message.content,
    }));
  },

  async addMessage(params: {
    conversationId: string;
    role: RagMessageRole;
    content: string;
    citations?: RagCitation[];
    context?: RagAnswerContext;
  }): Promise<RagMessageRow> {
    const supabase = await ragClient();
    const companyId = await currentCompanyId();

    const { data, error } = await supabase
      .from("rag_messages")
      .insert({
        company_id: companyId,
        conversation_id: params.conversationId,
        role: params.role,
        content: params.content,
        citations: params.citations ?? [],
        context: params.context ?? {},
      })
      .select("*")
      .single();

    if (error) throw toRagError("Salvataggio del messaggio non riuscito", error);

    await supabase
      .from("rag_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        message_count: await countMessages(supabase, params.conversationId),
      })
      .eq("id", params.conversationId);

    return data as RagMessageRow;
  },

  async remove(conversationId: string): Promise<void> {
    const supabase = await ragClient();
    const { error } = await supabase.from("rag_conversations").delete().eq("id", conversationId);
    if (error) throw toRagError("Eliminazione della conversazione non riuscita", error);
  },

  /** Voto su una risposta: è il segnale grezzo per valutare la qualità del RAG. */
  async rate(messageId: string, rating: 1 | -1, comment?: string): Promise<void> {
    const supabase = await ragClient();
    const companyId = await currentCompanyId();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("rag_feedback").upsert(
      {
        company_id: companyId,
        message_id: messageId,
        user_id: user?.id ?? null,
        rating,
        comment: comment ?? null,
      },
      { onConflict: "message_id,user_id" },
    );
    if (error) throw toRagError("Salvataggio del voto non riuscito", error);
  },
};

async function countMessages(
  supabase: Awaited<ReturnType<typeof ragClient>>,
  conversationId: string,
): Promise<number> {
  const { count } = await supabase
    .from("rag_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  return count ?? 0;
}
