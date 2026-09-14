/**
 * Letture lato server per la pagina "Memoria".
 *
 * `cache()` di React deduplica le chiamate all'interno dello stesso render:
 * la pagina e i suoi componenti possono chiedere gli stessi dati senza
 * moltiplicare le query.
 */
import { cache } from "react";
import { isDemoMode } from "@/config/demo";
import { defaultSettings } from "@/lib/rag/config";
import { demoIndexOverview, demoMemories } from "@/lib/rag/demo";
import { requireTenant } from "@/lib/tenant/context";
import { ragConversationsService } from "@/services/rag/conversations.service";
import { ragMemoriesService } from "@/services/rag/memories.service";
import { ragSettingsService } from "@/services/rag/settings.service";
import type {
  RagConversationRow,
  RagIndexOverviewRow,
  RagMemoryRow,
  RagMessageRow,
  RagSettings,
} from "@/types/rag";

export const getRagSettings = cache(async (): Promise<RagSettings> => {
  if (isDemoMode()) {
    const tenant = await requireTenant();
    return defaultSettings(tenant.id);
  }
  return ragSettingsService.get();
});

export const getIndexOverview = cache(async (): Promise<RagIndexOverviewRow[]> => {
  if (isDemoMode()) return demoIndexOverview();
  return ragSettingsService.indexOverview();
});

export const getPendingIndexCount = cache(async (): Promise<number> => {
  if (isDemoMode()) return 0;
  return ragSettingsService.pendingCount();
});

export const getMemories = cache(async (): Promise<RagMemoryRow[]> => {
  if (isDemoMode()) {
    return demoMemories().map((memory) => ({
      id: memory.id,
      company_id: "00000000-0000-0000-0000-000000000001",
      kind: memory.kind,
      content: memory.content,
      importance: memory.importance,
      confidence: memory.confidence,
      subject_type: memory.subjectType,
      subject_id: memory.subjectId,
      valid_from: memory.createdAt,
      valid_until: null,
      superseded_by: null,
      pinned: memory.pinned,
      hit_count: 0,
      last_used_at: null,
      source_message_id: null,
      created_by: null,
      created_at: memory.createdAt,
      updated_at: memory.createdAt,
    }));
  }
  return ragMemoriesService.list({ limit: 50 });
});

export const getConversations = cache(async (): Promise<RagConversationRow[]> => {
  if (isDemoMode()) return [];
  return ragConversationsService.list(20);
});

export const getConversationMessages = cache(
  async (conversationId: string): Promise<RagMessageRow[]> => {
    if (isDemoMode()) return [];
    return ragConversationsService.messages(conversationId);
  },
);
