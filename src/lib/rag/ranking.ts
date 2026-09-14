/**
 * Riordino dei risultati dopo la ricerca ibrida.
 *
 * La fusione RRF avviene in Postgres (`rag_search_chunks`); qui si applica ciò
 * che il database non può fare bene: diversificazione per documento, sconto per
 * anzianità e taglio del contesto a budget. Funzioni pure e testabili.
 */
import { MAX_CHUNKS_PER_DOCUMENT, MAX_CONTEXT_CHARS } from "./config";
import type { RetrievedChunk } from "@/types/rag";

/**
 * Fusione Reciprocal Rank Fusion di più liste ordinate.
 * Replica in TypeScript la formula usata dall'RPC: utile per unire risultati di
 * ricerche diverse (es. query riformulate) prima di scegliere il contesto.
 */
export function reciprocalRankFusion(
  lists: RetrievedChunk[][],
  k = 60,
): RetrievedChunk[] {
  const scores = new Map<string, { chunk: RetrievedChunk; score: number }>();

  for (const list of lists) {
    list.forEach((chunk, position) => {
      const contribution = 1 / (k + position + 1);
      const existing = scores.get(chunk.chunkId);
      if (existing) {
        existing.score += contribution;
        // Si tiene la similarità più alta vista per quel chunk.
        if (chunk.similarity > existing.chunk.similarity) existing.chunk = chunk;
      } else {
        scores.set(chunk.chunkId, { chunk: { ...chunk }, score: contribution });
      }
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

/**
 * Diversifica i risultati: al massimo `maxPerDocument` chunk dello stesso
 * documento, così una scheda cliente molto lunga non occupa tutto il contesto.
 */
export function diversifyByDocument(
  chunks: RetrievedChunk[],
  maxPerDocument = MAX_CHUNKS_PER_DOCUMENT,
): RetrievedChunk[] {
  const perDocument = new Map<string, number>();
  const kept: RetrievedChunk[] = [];
  const overflow: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const used = perDocument.get(chunk.documentId) ?? 0;
    if (used < maxPerDocument) {
      perDocument.set(chunk.documentId, used + 1);
      kept.push(chunk);
    } else {
      overflow.push(chunk);
    }
  }

  // Gli scartati restano in coda: se il budget lo consente tornano utili.
  return [...kept, ...overflow];
}

/** Applica un leggero sconto ai documenti non aggiornati di recente. */
export function applyRecencyBoost(
  chunks: RetrievedChunk[],
  now = Date.now(),
  halfLifeDays = 180,
): RetrievedChunk[] {
  return chunks
    .map((chunk) => {
      const updated = Date.parse(chunk.updatedAt);
      if (Number.isNaN(updated)) return chunk;
      const ageDays = Math.max(0, (now - updated) / 86_400_000);
      // 1.0 oggi → 0.9 dopo una emivita → mai sotto 0.8.
      const factor = 0.8 + 0.2 * Math.pow(0.5, ageDays / halfLifeDays);
      return { ...chunk, score: chunk.score * factor };
    })
    .sort((a, b) => b.score - a.score);
}

/** Rimuove i chunk con testo (quasi) identico, tenendo il punteggio migliore. */
export function dedupeChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const result: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const fingerprint = chunk.content.replace(/\s+/g, " ").trim().slice(0, 300).toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(chunk);
  }
  return result;
}

/**
 * Seleziona i chunk che entrano nel contesto rispettando il tetto di caratteri.
 * Ordine di priorità: punteggio; vincolo: budget e numero massimo.
 */
export function selectContext(
  chunks: RetrievedChunk[],
  topK: number,
  maxChars = MAX_CONTEXT_CHARS,
): RetrievedChunk[] {
  const selected: RetrievedChunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    if (selected.length >= topK) break;
    const cost = chunk.content.length;
    if (used + cost > maxChars && selected.length > 0) continue;
    selected.push(chunk);
    used += cost;
  }

  return selected;
}

/** Pipeline completa di riordino, dal risultato grezzo al contesto finale. */
export function rankChunks(
  chunks: RetrievedChunk[],
  topK: number,
  options: { now?: number; maxPerDocument?: number; maxChars?: number } = {},
): RetrievedChunk[] {
  const deduped = dedupeChunks(chunks);
  const boosted = applyRecencyBoost(deduped, options.now);
  const diversified = diversifyByDocument(boosted, options.maxPerDocument);
  return selectContext(diversified, topK, options.maxChars);
}
