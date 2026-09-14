/**
 * Suddivisione dei documenti in chunk indicizzabili.
 *
 * Strategia ricorsiva per separatori decrescenti (paragrafi → righe → frasi →
 * parole): i documenti del memoriale sono già strutturati a sezioni, quindi
 * nella maggior parte dei casi restano interi in un solo chunk.
 */
import {
  CHUNK_MIN_CHARS,
  CHUNK_OVERLAP_CHARS,
  CHUNK_TARGET_CHARS,
} from "./config";
import { estimateTokens, normalizeText } from "./text";
import type { TextChunk } from "@/types/rag";

type ChunkOptions = {
  targetChars?: number;
  overlapChars?: number;
  minChars?: number;
};

const SEPARATORS = ["\n\n", "\n", ". ", " "] as const;

/** Spezza il testo in blocchi non più lunghi di `target` caratteri. */
function splitRecursive(text: string, target: number, depth = 0): string[] {
  if (text.length <= target) return [text];

  const separator = SEPARATORS[depth];
  if (separator === undefined) {
    // Nessun separatore utile (es. una stringa unica lunghissima): taglio netto.
    const hard: string[] = [];
    for (let i = 0; i < text.length; i += target) hard.push(text.slice(i, i + target));
    return hard;
  }

  const parts = text.split(separator);
  if (parts.length === 1) return splitRecursive(text, target, depth + 1);

  const blocks: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? current + separator + part : part;
    if (candidate.length <= target) {
      current = candidate;
      continue;
    }
    if (current) blocks.push(current);
    // La singola parte eccede il target: si scende di un livello.
    if (part.length > target) {
      blocks.push(...splitRecursive(part, target, depth + 1));
      current = "";
    } else {
      current = part;
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

/**
 * Produce i chunk di un documento, con sovrapposizione fra blocchi consecutivi
 * per non perdere il contesto sul confine.
 */
export function chunkText(input: string, options: ChunkOptions = {}): TextChunk[] {
  const target = options.targetChars ?? CHUNK_TARGET_CHARS;
  const overlap = options.overlapChars ?? CHUNK_OVERLAP_CHARS;
  const min = options.minChars ?? CHUNK_MIN_CHARS;

  const text = normalizeText(input);
  if (!text) return [];
  if (text.length <= target) {
    return [{ index: 0, content: text, tokenEstimate: estimateTokens(text) }];
  }

  const blocks = splitRecursive(text, target).filter((b) => b.trim().length > 0);

  // Accorpa i blocchi troppo corti con il precedente: evita chunk-frammento.
  const merged: string[] = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && block.length < min && previous.length + block.length <= target * 1.3) {
      merged[merged.length - 1] = `${previous}\n${block}`;
    } else {
      merged.push(block);
    }
  }

  return merged.map((block, index) => {
    const previous = index > 0 ? merged[index - 1] : undefined;
    const tail = previous && overlap > 0 ? previous.slice(-overlap) : "";
    const content = tail ? `${tail.trimStart()}\n${block}`.trim() : block.trim();
    return { index, content, tokenEstimate: estimateTokens(content) };
  });
}
