/**
 * Utility testuali del motore RAG — funzioni pure, testabili senza database.
 */
import { createHash } from "node:crypto";

/** Normalizza spazi e a capo mantenendo la struttura a paragrafi. */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Stima dei token: ~4 caratteri per token sui testi italiani.
 * Serve solo per dimensionare chunk e contesto — per un conteggio esatto si usa
 * `messages.countTokens` dell'SDK Anthropic, che però costa una chiamata di rete.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** sha256 esadecimale: identifica una versione del documento. */
export function checksum(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Taglia il testo a `max` caratteri senza spezzare una parola a metà. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Righe "Etichetta: valore", saltando i campi vuoti. */
export function labeledLines(
  entries: [label: string, value: unknown][],
): string {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== "")
    .map(([label, value]) => `${label}: ${`${value}`.trim()}`)
    .join("\n");
}

/** Data in formato italiano, tollerante ai valori nulli. */
export function itDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Importo in euro (o altra valuta) in formato italiano. */
export function itCurrency(
  value: number | null | undefined,
  currency = "EUR",
): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);
}
