/**
 * Recupero: dalla domanda ai chunk da mettere nel contesto.
 *
 * La ricerca è IBRIDA e avviene in Postgres (`rag_search_chunks`): vettoriale
 * (pgvector/HNSW) + full-text italiano, fusi con Reciprocal Rank Fusion. Qui si
 * aggiunge il riordino applicativo (diversificazione, freschezza, budget).
 *
 * Gira con il client dell'utente: l'isolamento fra aziende resta nelle policy
 * RLS, non in un filtro applicativo che si può dimenticare.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RagSettings,
  RagSourceType,
  RecalledMemory,
  RetrievalResult,
  RetrievedChunk,
} from "@/types/rag";
import { embedOne, toVectorLiteral } from "@/lib/rag/embeddings";
import { hasRealEmbeddings } from "@/lib/rag/config";
import { rankChunks } from "@/lib/rag/ranking";
import { isMissingSchema, ragClient, toRagError } from "./base";

type SearchOptions = {
  /** Restringe la ricerca ad alcune origini (es. solo preventivi). */
  sourceTypes?: RagSourceType[];
  topK?: number;
  candidatePool?: number;
  minSimilarity?: number;
  /** Salta il richiamo dei ricordi a lungo termine. */
  skipMemories?: boolean;
  memoryTopK?: number;
};

export const ragSearchService = {
  /**
   * Recupera i chunk pertinenti e i ricordi da allegare alla domanda.
   * Non lancia se lo schema RAG non è installato: restituisce un risultato vuoto.
   */
  async retrieve(
    question: string,
    settings: Pick<
      RagSettings,
      "top_k" | "candidate_pool" | "min_similarity" | "memory_enabled" | "memory_top_k" | "embedding_model" | "enabled_sources"
    >,
    options: SearchOptions = {},
  ): Promise<RetrievalResult> {
    const startedAt = Date.now();
    const supabase = await ragClient();

    const topK = options.topK ?? settings.top_k;
    const pool = options.candidatePool ?? settings.candidate_pool;
    const minSimilarity = options.minSimilarity ?? settings.min_similarity;
    const sourceTypes = options.sourceTypes?.length
      ? options.sourceTypes
      : (settings.enabled_sources ?? []);

    const { vector, remote } = await embedOne(question, "query", settings.embedding_model);
    const embedding = toVectorLiteral(vector);

    const chunks = await searchChunks(supabase, {
      embedding,
      question,
      topK: Math.max(topK * 3, pool),
      pool,
      sourceTypes,
      minSimilarity,
    });

    const memories =
      settings.memory_enabled && !options.skipMemories
        ? await searchMemories(supabase, {
            embedding,
            question,
            limit: options.memoryTopK ?? settings.memory_top_k,
            minSimilarity,
          })
        : [];

    return {
      chunks: rankChunks(chunks, topK),
      memories,
      // Senza provider di embedding la parte semantica è debole: l'UI lo segnala.
      lexicalOnly: !remote && !hasRealEmbeddings(),
      durationMs: Date.now() - startedAt,
    };
  },

  /** Ricerca "nuda" sui documenti, per l'esplorazione dell'indice nell'UI. */
  async searchDocuments(
    question: string,
    options: { limit?: number; sourceTypes?: RagSourceType[] } = {},
  ): Promise<RetrievedChunk[]> {
    const supabase = await ragClient();
    const { vector } = await embedOne(question, "query");
    return searchChunks(supabase, {
      embedding: toVectorLiteral(vector),
      question,
      topK: options.limit ?? 20,
      pool: 60,
      sourceTypes: options.sourceTypes ?? [],
      minSimilarity: 0,
    });
  },

  /** Segna i ricordi effettivamente usati (statistiche d'uso). */
  async touchMemories(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const supabase = await ragClient();
    await supabase.rpc("rag_touch_memories", { p_ids: ids });
  },
};

async function searchChunks(
  supabase: SupabaseClient,
  params: {
    embedding: string;
    question: string;
    topK: number;
    pool: number;
    sourceTypes: RagSourceType[];
    minSimilarity: number;
  },
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc("rag_search_chunks", {
    p_query_embedding: params.embedding,
    p_query_text: params.question,
    p_match_count: params.topK,
    p_candidates: params.pool,
    p_source_types: params.sourceTypes.length > 0 ? params.sourceTypes : null,
    p_min_similarity: params.minSimilarity,
  });

  if (error) {
    if (isMissingSchema(error.code)) return [];
    throw toRagError("Ricerca nella memoria non riuscita", error);
  }

  return (data ?? []).map(mapChunkRow);
}

async function searchMemories(
  supabase: SupabaseClient,
  params: { embedding: string; question: string; limit: number; minSimilarity: number },
): Promise<RecalledMemory[]> {
  if (params.limit <= 0) return [];

  const { data, error } = await supabase.rpc("rag_search_memories", {
    p_query_embedding: params.embedding,
    p_query_text: params.question,
    p_match_count: params.limit,
    p_min_similarity: params.minSimilarity,
  });

  if (error) {
    if (isMissingSchema(error.code)) return [];
    throw toRagError("Richiamo dei ricordi non riuscito", error);
  }

  return (data ?? []).map(mapMemoryRow);
}

type ChunkRow = {
  chunk_id: string;
  document_id: string;
  source_type: RagSourceType;
  source_id: string;
  title: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  similarity: number | null;
  lexical_rank: number | null;
  score: number | null;
  updated_at: string;
};

function mapChunkRow(row: ChunkRow): RetrievedChunk {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    content: row.content,
    chunkIndex: row.chunk_index,
    metadata: row.metadata ?? {},
    similarity: Number(row.similarity ?? 0),
    lexicalRank: Number(row.lexical_rank ?? 0),
    score: Number(row.score ?? 0),
    updatedAt: row.updated_at,
  };
}

type MemoryRow = {
  id: string;
  kind: RecalledMemory["kind"];
  content: string;
  importance: number;
  confidence: number;
  subject_type: RagSourceType | null;
  subject_id: string | null;
  pinned: boolean;
  similarity: number | null;
  created_at: string;
};

function mapMemoryRow(row: MemoryRow): RecalledMemory {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    importance: Number(row.importance ?? 3),
    confidence: Number(row.confidence ?? 0.7),
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    pinned: Boolean(row.pinned),
    similarity: Number(row.similarity ?? 0),
    createdAt: row.created_at,
  };
}
