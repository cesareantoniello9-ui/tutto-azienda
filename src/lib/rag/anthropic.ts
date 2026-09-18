/**
 * Client Anthropic condiviso (solo lato server).
 *
 * Il client va creato una sola volta: tiene il pool di connessioni e la logica
 * di retry dell'SDK. Restituisce `null` quando la chiave non è configurata, così
 * il chiamante può degradare invece di lanciare un errore.
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey } from "./config";

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  const apiKey = anthropicApiKey();
  if (!apiKey) return null;
  if (!cached) cached = new Anthropic({ apiKey });
  return cached;
}

/**
 * Beta per il fallback lato server: se il modello rifiuta la richiesta per
 * policy, l'API la ripete su un modello di riserva nella stessa chiamata invece
 * di lasciare l'utente senza risposta.
 */
export const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Messaggio d'errore leggibile a partire da un errore dell'SDK. */
export function describeAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "Chiave API Anthropic non valida: controlla ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Troppe richieste al modello in questo momento. Riprova fra qualche secondo.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `Richiesta non valida verso il modello: ${error.message}`;
  }
  if (error instanceof Anthropic.APIError) {
    return `Errore del servizio Anthropic (${error.status ?? "?"}): ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return "Errore sconosciuto durante la generazione della risposta.";
}
