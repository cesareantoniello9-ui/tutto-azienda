/**
 * Memoria a lungo termine — persistenza.
 *
 * Un ricordo non si modifica: quando cambia, il vecchio viene marcato
 * `superseded_by` e resta nello storico. Questo rende la memoria verificabile
 * («perché il sistema credeva questo a giugno?») invece che opaca.
 */
import type { RagMemoryKind, RagMemoryRow, RagSourceType, RecalledMemory } from "@/types/rag";
import { embedMany, toVectorLiteral } from "@/lib/rag/embeddings";
import type { ExtractedMemory } from "@/lib/rag/memory";
import { filterNewMemories } from "@/lib/rag/memory";
import { currentCompanyId, isMissingSchema, ragClient, toRagError } from "./base";

export type MemoryInput = {
  content: string;
  kind?: RagMemoryKind;
  importance?: number;
  confidence?: number;
  subjectType?: RagSourceType | null;
  subjectId?: string | null;
  pinned?: boolean;
  validUntil?: string | null;
  sourceMessageId?: string | null;
};

export const ragMemoriesService = {
  /** Elenco dei ricordi vivi (non sostituiti, non scaduti). */
  async list(options: { limit?: number; kind?: RagMemoryKind } = {}): Promise<RagMemoryRow[]> {
    const supabase = await ragClient();
    let query = supabase
      .from("rag_memories")
      .select("*")
      .is("superseded_by", null)
      .order("pinned", { ascending: false })
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 100);

    if (options.kind) query = query.eq("kind", options.kind);

    const { data, error } = await query;
    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura dei ricordi non riuscita", error);
    }
    return (data ?? []) as RagMemoryRow[];
  },

  async create(input: MemoryInput): Promise<RagMemoryRow> {
    const supabase = await ragClient();
    const companyId = await currentCompanyId();
    const content = input.content.trim();

    const { vectors } = await embedMany([content], "document");
    const vector = vectors[0];

    const { data, error } = await supabase
      .from("rag_memories")
      .insert({
        company_id: companyId,
        content,
        kind: input.kind ?? "fact",
        importance: input.importance ?? 3,
        confidence: input.confidence ?? 0.9,
        subject_type: input.subjectType ?? null,
        subject_id: input.subjectId ?? null,
        pinned: input.pinned ?? false,
        valid_until: input.validUntil ?? null,
        source_message_id: input.sourceMessageId ?? null,
        embedding: vector ? toVectorLiteral(vector) : null,
      })
      .select("*")
      .single();

    if (error) throw toRagError("Salvataggio del ricordo non riuscito", error);
    return data as RagMemoryRow;
  },

  /** Sostituisce un ricordo con una versione aggiornata, conservando lo storico. */
  async supersede(id: string, input: MemoryInput): Promise<RagMemoryRow> {
    const replacement = await this.create(input);
    const supabase = await ragClient();
    const { error } = await supabase
      .from("rag_memories")
      .update({ superseded_by: replacement.id })
      .eq("id", id);
    if (error) throw toRagError("Sostituzione del ricordo non riuscita", error);
    return replacement;
  },

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const supabase = await ragClient();
    const { error } = await supabase.from("rag_memories").update({ pinned }).eq("id", id);
    if (error) throw toRagError("Aggiornamento del ricordo non riuscito", error);
  },

  async remove(id: string): Promise<void> {
    const supabase = await ragClient();
    const { error } = await supabase.from("rag_memories").delete().eq("id", id);
    if (error) throw toRagError("Eliminazione del ricordo non riuscita", error);
  },

  /**
   * Salva i ricordi estratti da uno scambio, scartando i duplicati rispetto a
   * quelli già presenti. Restituisce quelli effettivamente scritti.
   */
  async saveExtracted(
    candidates: ExtractedMemory[],
    context: { sourceMessageId?: string | null; recalled?: RecalledMemory[] } = {},
  ): Promise<number> {
    if (candidates.length === 0) return 0;

    const existing = context.recalled?.length ? context.recalled : await this.list({ limit: 200 });
    const fresh = filterNewMemories(
      candidates,
      existing.map((memory) => ({ content: memory.content })),
    );
    if (fresh.length === 0) return 0;

    const supabase = await ragClient();
    const companyId = await currentCompanyId();
    const { vectors } = await embedMany(
      fresh.map((memory) => memory.content),
      "document",
    );

    const { error } = await supabase.from("rag_memories").insert(
      fresh.map((memory, i) => ({
        company_id: companyId,
        content: memory.content,
        kind: memory.kind,
        importance: memory.importance,
        confidence: memory.confidence,
        subject_type: memory.subjectType ?? null,
        subject_id: memory.subjectId ?? null,
        source_message_id: context.sourceMessageId ?? null,
        embedding: vectors[i] ? toVectorLiteral(vectors[i]!) : null,
      })),
    );
    if (error) throw toRagError("Salvataggio dei ricordi non riuscito", error);
    return fresh.length;
  },
};
