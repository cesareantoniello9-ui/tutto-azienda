"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/config/demo";
import { requireTenant } from "@/lib/tenant/context";
import { RagError } from "@/services/rag/base";
import { ragAskService } from "@/services/rag/ask.service";
import { ragConversationsService } from "@/services/rag/conversations.service";
import { ragIndexService } from "@/services/rag/index.service";
import { ragMemoriesService } from "@/services/rag/memories.service";
import { ragSettingsService } from "@/services/rag/settings.service";
import type { IngestionReport, RagAnswer } from "@/types/rag";
import {
  askSchema,
  feedbackSchema,
  manualDocumentSchema,
  memorySchema,
  ragSettingsSchema,
} from "./schema";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const DEMO_MESSAGE =
  "Modalità demo: collega Supabase per salvare davvero i dati della memoria aziendale.";

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof RagError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: "Si è verificato un errore imprevisto. Riprova." };
}

async function revalidateMemoria(): Promise<void> {
  const tenant = await requireTenant().catch(() => null);
  if (tenant) revalidatePath(`/${tenant.slug}/memoria`);
}

/**
 * Domanda senza streaming — usata come riserva quando il client non può
 * consumare `POST /api/rag/ask` (es. JavaScript disattivato o test).
 */
export async function askAction(
  raw: unknown,
): Promise<Result<{ answer: RagAnswer; conversationId: string | null; messageId: string | null }>> {
  const parsed = askSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Domanda non valida" };
  }

  try {
    const result = await ragAskService.answer({
      question: parsed.data.question,
      conversationId: parsed.data.conversationId ?? null,
      sourceTypes: parsed.data.sourceTypes,
    });
    await revalidateMemoria();
    return {
      ok: true,
      answer: result.answer,
      conversationId: result.conversationId,
      messageId: result.messageId,
    };
  } catch (error) {
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Ricordi
// ─────────────────────────────────────────────────────────────
export async function createMemoryAction(raw: unknown): Promise<Result<{ id: string }>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };

  const parsed = memorySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ricordo non valido" };
  }

  try {
    const memory = await ragMemoriesService.create({
      content: parsed.data.content,
      kind: parsed.data.kind,
      importance: parsed.data.importance,
      pinned: parsed.data.pinned,
      subjectType: parsed.data.subjectType ?? null,
      subjectId: parsed.data.subjectId ?? null,
      validUntil: parsed.data.validUntil ?? null,
    });
    await revalidateMemoria();
    return { ok: true, id: memory.id };
  } catch (error) {
    return fail(error);
  }
}

/** Correzione di un ricordo: il precedente resta come storico. */
export async function reviseMemoryAction(
  id: string,
  raw: unknown,
): Promise<Result<{ id: string }>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };

  const parsed = memorySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ricordo non valido" };
  }

  try {
    const memory = await ragMemoriesService.supersede(id, {
      content: parsed.data.content,
      kind: parsed.data.kind,
      importance: parsed.data.importance,
      pinned: parsed.data.pinned,
      subjectType: parsed.data.subjectType ?? null,
      subjectId: parsed.data.subjectId ?? null,
      validUntil: parsed.data.validUntil ?? null,
    });
    await revalidateMemoria();
    return { ok: true, id: memory.id };
  } catch (error) {
    return fail(error);
  }
}

export async function pinMemoryAction(id: string, pinned: boolean): Promise<Result<object>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };
  try {
    await ragMemoriesService.setPinned(id, pinned);
    await revalidateMemoria();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteMemoryAction(id: string): Promise<Result<object>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };
  try {
    await ragMemoriesService.remove(id);
    await revalidateMemoria();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Conversazioni
// ─────────────────────────────────────────────────────────────
export async function deleteConversationAction(id: string): Promise<Result<object>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };
  try {
    await ragConversationsService.remove(id);
    await revalidateMemoria();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function rateMessageAction(raw: unknown): Promise<Result<object>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };

  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Voto non valido" };
  }

  try {
    await ragConversationsService.rate(
      parsed.data.messageId,
      parsed.data.rating,
      parsed.data.comment,
    );
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Indice
// ─────────────────────────────────────────────────────────────
export async function reindexAction(
  options: { full?: boolean } = {},
): Promise<Result<{ report: IngestionReport }>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };

  try {
    const tenant = await requireTenant();
    if (options.full) await ragIndexService.enqueueFullReindex(tenant.id);
    const report = await ragIndexService.ingestCompany(tenant.id, { force: options.full });
    await revalidateMemoria();
    return { ok: true, report };
  } catch (error) {
    return fail(error);
  }
}

export async function addManualDocumentAction(raw: unknown): Promise<Result<object>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };

  const parsed = manualDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Documento non valido" };
  }

  try {
    const tenant = await requireTenant();
    await ragIndexService.indexManualDocument(tenant.id, {
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category ?? null,
    });
    await revalidateMemoria();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Impostazioni
// ─────────────────────────────────────────────────────────────
export async function updateRagSettingsAction(raw: unknown): Promise<Result<object>> {
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };

  const parsed = ragSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Impostazioni non valide" };
  }

  try {
    await ragSettingsService.update({
      ...parsed.data,
      system_instructions: parsed.data.system_instructions ?? null,
    });
    await revalidateMemoria();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
