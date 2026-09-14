/**
 * Embedding dei testi.
 *
 * Anthropic non espone un endpoint di embedding: il provider consigliato è
 * Voyage AI (`voyage-3.5`, 1024 dimensioni = `vector(1024)` in migration).
 *
 * Senza `VOYAGE_API_KEY` il motore degrada a un embedding LOCALE deterministico
 * (hashing di parole e trigrammi): l'app resta avviabile e testabile, ma la
 * similarità è lessicale, non semantica. In quel caso la ricerca ibrida si
 * appoggia soprattutto al full-text italiano di Postgres.
 */
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  voyageApiKey,
} from "./config";
import { normalizeText } from "./text";

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MAX_ATTEMPTS = 3;

export type EmbeddingInputType = "document" | "query";

export type EmbeddingResult = {
  vectors: number[][];
  /** `true` se i vettori arrivano dal provider reale, `false` se dal fallback. */
  remote: boolean;
  model: string;
};

/** Vettore singolo (comodo per la query dell'utente). */
export async function embedOne(
  text: string,
  inputType: EmbeddingInputType = "query",
  model = DEFAULT_EMBEDDING_MODEL,
): Promise<{ vector: number[]; remote: boolean; model: string }> {
  const result = await embedMany([text], inputType, model);
  const vector = result.vectors[0] ?? localEmbedding(text);
  return { vector, remote: result.remote, model: result.model };
}

/**
 * Vettorializza una lista di testi, a lotti. In caso di errore del provider
 * l'eccezione viene propagata: l'indicizzazione deve poter fallire in modo
 * visibile, non produrre silenziosamente vettori di bassa qualità.
 */
export async function embedMany(
  texts: string[],
  inputType: EmbeddingInputType = "document",
  model = DEFAULT_EMBEDDING_MODEL,
): Promise<EmbeddingResult> {
  const inputs = texts.map((t) => normalizeText(t) || " ");
  const apiKey = voyageApiKey();

  if (!apiKey) {
    return {
      vectors: inputs.map(localEmbedding),
      remote: false,
      model: "local-hashing-v1",
    };
  }

  const vectors: number[][] = [];
  for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBEDDING_BATCH_SIZE);
    vectors.push(...(await requestVoyage(batch, inputType, model, apiKey)));
  }

  return { vectors, remote: true, model };
}

async function requestVoyage(
  batch: string[],
  inputType: EmbeddingInputType,
  model: string,
  apiKey: string,
): Promise<number[][]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(VOYAGE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model,
          input_type: inputType,
          output_dimension: EMBEDDING_DIMENSIONS,
          truncation: true,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        // 4xx (chiave errata, modello inesistente) non migliorano ritentando.
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`Voyage ${response.status}: ${detail.slice(0, 300)}`);
        }
        throw new RetryableError(`Voyage ${response.status}: ${detail.slice(0, 300)}`);
      }

      const payload = (await response.json()) as {
        data?: { embedding: number[]; index: number }[];
      };
      const rows = payload.data ?? [];
      if (rows.length !== batch.length) {
        throw new Error(`Voyage: attesi ${batch.length} vettori, ricevuti ${rows.length}`);
      }

      const ordered = [...rows].sort((a, b) => a.index - b.index);
      return ordered.map((row) => normalizeVector(row.embedding));
    } catch (error) {
      lastError = error;
      const retryable = error instanceof RetryableError || error instanceof TypeError;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(2 ** attempt * 250);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Embedding non riuscito per un errore sconosciuto");
}

class RetryableError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalizzazione L2: rende la distanza coseno equivalente al prodotto scalare. */
export function normalizeVector(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Formato accettato da pgvector: "[0.1,0.2,…]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((v) => (Number.isFinite(v) ? v.toFixed(6) : "0")).join(",")}]`;
}

// ─────────────────────────────────────────────────────────────
// Fallback locale deterministico
// ─────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "di", "a", "da", "in", "con", "su", "per", "tra", "fra", "il", "lo", "la", "i",
  "gli", "le", "un", "uno", "una", "e", "ed", "o", "che", "chi", "cui", "non",
  "del", "dello", "della", "dei", "degli", "delle", "al", "allo", "alla", "ai",
  "agli", "alle", "dal", "dalla", "nel", "nella", "sul", "sulla", "è", "sono",
  "come", "anche", "più", "ma", "se", "si", "ha", "hanno", "the", "of", "and",
]);

function hash32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function tokenizeForHashing(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Embedding locale: bag-of-words + trigrammi con signed hashing, poi L2.
 * Deterministico (stesso testo → stesso vettore) e senza rete: è ciò che rende
 * i test unitari del recupero possibili.
 */
export function localEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = tokenizeForHashing(text);

  const add = (key: string, weight: number) => {
    const h = hash32(key);
    const index = h % EMBEDDING_DIMENSIONS;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    vector[index] = (vector[index] ?? 0) + sign * weight;
  };

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  for (const [token, count] of counts) {
    add(token, 1 + Math.log(count)); // tf sublineare
    for (let i = 0; i + 3 <= token.length; i++) add(`#${token.slice(i, i + 3)}`, 0.35);
  }

  return normalizeVector(vector);
}
