/**
 * Indicizzazione: dal dato di business al memoriale interrogabile.
 *
 * Flusso di un giro di indicizzazione (`ingestCompany`):
 *   coda `rag_index_queue` (o scansione completa)
 *     → carica il grafo aziendale (clienti, lead, trattative, preventivi…)
 *     → serializza ogni entità in un documento in italiano
 *     → confronta il checksum: se il testo non è cambiato, nessun embedding
 *     → spezza in chunk, calcola gli embedding, riscrive i chunk
 *     → marca la coda come completata
 *
 * Gira con la service-role key: è un lavoro di sistema, non una richiesta utente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Activity,
  Client,
  Lead,
  Note,
  Opportunity,
  Quote,
  QuoteItem,
} from "@/types/crm";
import type { Tenant } from "@/types/tenant";
import type {
  IngestionReport,
  RagSourceType,
  SourceDocument,
} from "@/types/rag";
import { INGEST_BATCH_SIZE, INGESTABLE_SOURCES } from "@/lib/rag/config";
import { chunkText } from "@/lib/rag/chunking";
import { embedMany, toVectorLiteral } from "@/lib/rag/embeddings";
import { checksum, estimateTokens, itCurrency } from "@/lib/rag/text";
import {
  serializeActivity,
  serializeClient,
  serializeLead,
  serializeNote,
  serializeOpportunity,
  serializeQuote,
  serializeTenant,
  type RelatedContext,
} from "@/lib/rag/serialize";
import { ragAdmin, RagError, toRagError } from "./base";

/** Tetto di sicurezza per il caricamento in memoria del grafo aziendale. */
const MAX_ROWS_PER_TABLE = 5000;

type QueueEntry = {
  id: string;
  source_type: RagSourceType;
  source_id: string;
  operation: "upsert" | "delete";
};

type CompanyGraph = {
  tenant: Tenant | null;
  clients: Map<string, Client>;
  leads: Map<string, Lead>;
  opportunities: Map<string, Opportunity>;
  quotes: Map<string, Quote>;
  quoteItems: Map<string, QuoteItem[]>;
  activities: Activity[];
  notes: Note[];
  profiles: Map<string, string>;
};

export type IngestOptions = {
  /** Ignora la coda e re-indicizza tutto ciò che l'azienda possiede. */
  full?: boolean;
  /** Quante entità processare in questo giro. */
  limit?: number;
  /** Re-indicizza anche i documenti il cui testo non è cambiato. */
  force?: boolean;
};

export const ragIndexService = {
  /** Esegue un giro di indicizzazione per una singola azienda. */
  async ingestCompany(companyId: string, options: IngestOptions = {}): Promise<IngestionReport> {
    const startedAt = Date.now();
    const supabase = await ragAdmin();
    const limit = options.limit ?? INGEST_BATCH_SIZE;

    const entries = options.full
      ? await fullScan(supabase, companyId, limit)
      : await takeQueue(supabase, companyId, limit);

    const report: IngestionReport = {
      scanned: entries.length,
      indexed: 0,
      skipped: 0,
      deleted: 0,
      chunks: 0,
      embeddedChunks: 0,
      errors: [],
      durationMs: 0,
    };

    if (entries.length === 0) {
      report.durationMs = Date.now() - startedAt;
      return report;
    }

    const graph = await loadCompanyGraph(supabase, companyId);

    for (const entry of entries) {
      try {
        if (entry.operation === "delete") {
          await deleteDocument(supabase, companyId, entry.source_type, entry.source_id);
          report.deleted++;
          if (entry.id) await markQueue(supabase, entry.id, "done");
          continue;
        }

        const document = buildDocument(entry.source_type, entry.source_id, graph);
        if (!document) {
          // L'entità non esiste più (cancellata dopo l'accodamento).
          await deleteDocument(supabase, companyId, entry.source_type, entry.source_id);
          report.deleted++;
          if (entry.id) await markQueue(supabase, entry.id, "done");
          continue;
        }

        const result = await upsertDocument(supabase, companyId, document, options.force ?? false);
        if (result.skipped) {
          report.skipped++;
        } else {
          report.indexed++;
          report.chunks += result.chunks;
          if (result.embedded) report.embeddedChunks += result.chunks;
        }
        if (entry.id) await markQueue(supabase, entry.id, "done");
      } catch (error) {
        const message = error instanceof Error ? error.message : "errore sconosciuto";
        report.errors.push({
          sourceType: entry.source_type,
          sourceId: entry.source_id,
          message,
        });
        if (entry.id) await markQueue(supabase, entry.id, "failed", message);
      }
    }

    report.durationMs = Date.now() - startedAt;
    return report;
  },

  /** Accoda la re-indicizzazione completa di un'azienda. */
  async enqueueFullReindex(companyId: string): Promise<number> {
    const supabase = await ragAdmin();
    const entries = await fullScan(supabase, companyId, MAX_ROWS_PER_TABLE);
    if (entries.length === 0) return 0;

    const { error } = await supabase.from("rag_index_queue").insert(
      entries.map((entry) => ({
        company_id: companyId,
        source_type: entry.source_type,
        source_id: entry.source_id,
        operation: "upsert",
      })),
    );
    // Conflitto sull'indice parziale = già in coda: non è un errore.
    if (error && error.code !== "23505") throw toRagError("Accodamento non riuscito", error);
    return entries.length;
  },

  /** Aziende con almeno un elemento in coda (usato dal worker/cron). */
  async companiesWithPendingWork(limit = 50): Promise<string[]> {
    const supabase = await ragAdmin();
    const { data, error } = await supabase
      .from("rag_index_queue")
      .select("company_id")
      .eq("status", "pending")
      .limit(1000);
    if (error) throw toRagError("Lettura della coda non riuscita", error);

    const unique = [...new Set((data ?? []).map((row) => row.company_id as string))];
    return unique.slice(0, limit);
  },

  /** Documento manuale (procedura, listino, FAQ) inserito dall'utente. */
  async indexManualDocument(
    companyId: string,
    input: { id?: string; title: string; body: string; category?: string | null },
  ): Promise<void> {
    const supabase = await ragAdmin();
    const { serializeManual } = await import("@/lib/rag/serialize");
    const document = serializeManual({
      id: input.id ?? crypto.randomUUID(),
      title: input.title,
      body: input.body,
      category: input.category ?? null,
    });
    await upsertDocument(supabase, companyId, document, true);
  },
};

// ─────────────────────────────────────────────────────────────
// Coda
// ─────────────────────────────────────────────────────────────
async function takeQueue(
  supabase: SupabaseClient,
  companyId: string,
  limit: number,
): Promise<QueueEntry[]> {
  const { data, error } = await supabase
    .from("rag_index_queue")
    .select("id, source_type, source_id, operation")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("enqueued_at", { ascending: true })
    .limit(limit);
  if (error) throw toRagError("Lettura della coda non riuscita", error);

  const entries = (data ?? []) as QueueEntry[];
  if (entries.length > 0) {
    await supabase
      .from("rag_index_queue")
      .update({ status: "running" })
      .in(
        "id",
        entries.map((entry) => entry.id),
      );
  }
  return entries;
}

async function markQueue(
  supabase: SupabaseClient,
  id: string,
  status: "done" | "failed",
  error?: string,
): Promise<void> {
  await supabase
    .from("rag_index_queue")
    .update({
      status,
      processed_at: new Date().toISOString(),
      last_error: error ?? null,
    })
    .eq("id", id);
}

/** Scansione completa: ogni entità indicizzabile diventa un elemento di coda. */
async function fullScan(
  supabase: SupabaseClient,
  companyId: string,
  limit: number,
): Promise<QueueEntry[]> {
  const entries: QueueEntry[] = [
    { id: "", source_type: "tenant", source_id: companyId, operation: "upsert" },
  ];

  const tables: [RagSourceType, string][] = [
    ["client", "clients"],
    ["lead", "leads"],
    ["opportunity", "opportunities"],
    ["quote", "quotes"],
    ["activity", "activities"],
    ["note", "notes"],
  ];

  for (const [sourceType, table] of tables) {
    if (!INGESTABLE_SOURCES.includes(sourceType)) continue;
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("company_id", companyId)
      .limit(MAX_ROWS_PER_TABLE);
    if (error) throw toRagError(`Lettura di ${table} non riuscita`, error);
    for (const row of data ?? []) {
      entries.push({
        id: "",
        source_type: sourceType,
        source_id: row.id as string,
        operation: "upsert",
      });
    }
  }

  return entries.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────
// Grafo aziendale (una query per tabella, poi tutto in memoria)
// ─────────────────────────────────────────────────────────────
async function loadCompanyGraph(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyGraph> {
  const table = async <T>(name: string): Promise<T[]> => {
    const { data, error } = await supabase
      .from(name)
      .select("*")
      .eq("company_id", companyId)
      .limit(MAX_ROWS_PER_TABLE);
    if (error) throw toRagError(`Lettura di ${name} non riuscita`, error);
    return (data ?? []) as T[];
  };

  const [tenantResult, clients, leads, opportunities, quotes, quoteItems, activities, notes] =
    await Promise.all([
      supabase.from("tenants").select("*").eq("id", companyId).maybeSingle(),
      table<Client>("clients"),
      table<Lead>("leads"),
      table<Opportunity>("opportunities"),
      table<Quote>("quotes"),
      table<QuoteItem>("quote_items"),
      table<Activity>("activities"),
      table<Note>("notes"),
    ]);

  const itemsByQuote = new Map<string, QuoteItem[]>();
  for (const item of quoteItems) {
    const list = itemsByQuote.get(item.quote_id) ?? [];
    list.push(item);
    itemsByQuote.set(item.quote_id, list);
  }

  // Nomi dei membri: servono a scrivere "referente: Giulia Rossi", non un uuid.
  const ownerIds = [
    ...new Set(
      [
        ...clients.map((c) => c.owner_id),
        ...leads.map((l) => l.owner_id),
        ...opportunities.map((o) => o.owner_id),
        ...activities.map((a) => a.owner_id),
        ...notes.map((n) => n.author_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const profiles = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ownerIds.slice(0, 1000));
    for (const profile of data ?? []) {
      const name = (profile.full_name as string | null) ?? (profile.email as string | null);
      if (name) profiles.set(profile.id as string, name);
    }
  }

  return {
    tenant: (tenantResult.data as Tenant | null) ?? null,
    clients: new Map(clients.map((row) => [row.id, row])),
    leads: new Map(leads.map((row) => [row.id, row])),
    opportunities: new Map(opportunities.map((row) => [row.id, row])),
    quotes: new Map(quotes.map((row) => [row.id, row])),
    quoteItems: itemsByQuote,
    activities,
    notes,
    profiles,
  };
}

// ─────────────────────────────────────────────────────────────
// Serializzazione con contesto relazionale
// ─────────────────────────────────────────────────────────────
function relationNames(
  graph: CompanyGraph,
  ids: { clientId?: string | null; leadId?: string | null; opportunityId?: string | null },
): Pick<RelatedContext, "clientName" | "leadName" | "opportunityTitle"> {
  return {
    clientName: ids.clientId ? (graph.clients.get(ids.clientId)?.name ?? null) : null,
    leadName: ids.leadId ? (graph.leads.get(ids.leadId)?.name ?? null) : null,
    opportunityTitle: ids.opportunityId
      ? (graph.opportunities.get(ids.opportunityId)?.title ?? null)
      : null,
  };
}

function recentFor(
  graph: CompanyGraph,
  match: (row: { client_id: string | null; lead_id: string | null; opportunity_id: string | null }) => boolean,
): Pick<RelatedContext, "recentNotes" | "recentActivities"> {
  const byDateDesc = (a: { created_at: string }, b: { created_at: string }) =>
    Date.parse(b.created_at) - Date.parse(a.created_at);

  return {
    recentNotes: graph.notes
      .filter(match)
      .sort(byDateDesc)
      .slice(0, 10)
      .map((note) => ({ body: note.body, created_at: note.created_at })),
    recentActivities: graph.activities
      .filter(match)
      .sort(byDateDesc)
      .slice(0, 10)
      .map((activity) => ({
        subject: activity.subject,
        type: activity.type,
        status: activity.status,
        due_at: activity.due_at,
      })),
  };
}

function buildDocument(
  sourceType: RagSourceType,
  sourceId: string,
  graph: CompanyGraph,
): SourceDocument | null {
  switch (sourceType) {
    case "tenant": {
      if (!graph.tenant) return null;
      const won = [...graph.opportunities.values()].filter((o) => o.status === "won");
      return serializeTenant(graph.tenant, {
        stats: {
          "Clienti in anagrafica": graph.clients.size,
          "Clienti attivi": [...graph.clients.values()].filter((c) => c.is_active).length,
          "Lead aperti": [...graph.leads.values()].filter(
            (l) => l.status !== "converted" && l.status !== "lost",
          ).length,
          "Trattative aperte": [...graph.opportunities.values()].filter((o) => o.status === "open")
            .length,
          "Valore trattative vinte":
            itCurrency(won.reduce((sum, o) => sum + Number(o.amount ?? 0), 0)) ?? "€ 0,00",
          "Preventivi emessi": graph.quotes.size,
        },
      });
    }

    case "client": {
      const client = graph.clients.get(sourceId);
      if (!client) return null;
      const opportunities = [...graph.opportunities.values()].filter(
        (o) => o.client_id === client.id,
      );
      const quotes = [...graph.quotes.values()].filter((q) => q.client_id === client.id);
      return serializeClient(client, {
        ownerName: client.owner_id ? (graph.profiles.get(client.owner_id) ?? null) : null,
        ...recentFor(graph, (row) => row.client_id === client.id),
        stats: {
          "Trattative totali": opportunities.length,
          "Trattative aperte": opportunities.filter((o) => o.status === "open").length,
          "Valore vinto":
            itCurrency(
              opportunities
                .filter((o) => o.status === "won")
                .reduce((sum, o) => sum + Number(o.amount ?? 0), 0),
            ) ?? undefined,
          "Preventivi": quotes.length,
          "Preventivi accettati": quotes.filter((q) => q.status === "accepted").length,
        },
      });
    }

    case "lead": {
      const lead = graph.leads.get(sourceId);
      if (!lead) return null;
      return serializeLead(lead, {
        ownerName: lead.owner_id ? (graph.profiles.get(lead.owner_id) ?? null) : null,
        clientName: lead.converted_client_id
          ? (graph.clients.get(lead.converted_client_id)?.name ?? null)
          : null,
        ...recentFor(graph, (row) => row.lead_id === lead.id),
      });
    }

    case "opportunity": {
      const opportunity = graph.opportunities.get(sourceId);
      if (!opportunity) return null;
      return serializeOpportunity(opportunity, {
        ownerName: opportunity.owner_id
          ? (graph.profiles.get(opportunity.owner_id) ?? null)
          : null,
        ...relationNames(graph, {
          clientId: opportunity.client_id,
          leadId: opportunity.source_lead_id,
        }),
        ...recentFor(graph, (row) => row.opportunity_id === opportunity.id),
      });
    }

    case "quote": {
      const quote = graph.quotes.get(sourceId);
      if (!quote) return null;
      return serializeQuote(quote, graph.quoteItems.get(quote.id) ?? [], {
        ...relationNames(graph, {
          clientId: quote.client_id,
          opportunityId: quote.opportunity_id,
        }),
      });
    }

    case "activity": {
      const activity = graph.activities.find((row) => row.id === sourceId);
      if (!activity) return null;
      return serializeActivity(activity, {
        ownerName: activity.owner_id ? (graph.profiles.get(activity.owner_id) ?? null) : null,
        ...relationNames(graph, {
          clientId: activity.client_id,
          leadId: activity.lead_id,
          opportunityId: activity.opportunity_id,
        }),
      });
    }

    case "note": {
      const note = graph.notes.find((row) => row.id === sourceId);
      if (!note) return null;
      return serializeNote(note, {
        authorName: note.author_id ? (graph.profiles.get(note.author_id) ?? null) : null,
        ...relationNames(graph, {
          clientId: note.client_id,
          leadId: note.lead_id,
          opportunityId: note.opportunity_id,
        }),
      });
    }

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Scrittura documento + chunk
// ─────────────────────────────────────────────────────────────
async function upsertDocument(
  supabase: SupabaseClient,
  companyId: string,
  document: SourceDocument,
  force: boolean,
): Promise<{ skipped: boolean; chunks: number; embedded: boolean }> {
  const digest = checksum(document.content);

  const { data: existing, error: readError } = await supabase
    .from("rag_documents")
    .select("id, checksum, is_stale")
    .eq("company_id", companyId)
    .eq("source_type", document.sourceType)
    .eq("source_id", document.sourceId)
    .maybeSingle();
  if (readError) throw toRagError("Lettura del documento non riuscita", readError);

  // Testo invariato e indice già allineato → nessun costo di embedding.
  if (!force && existing && existing.checksum === digest && existing.is_stale === false) {
    return { skipped: true, chunks: 0, embedded: false };
  }

  const chunks = chunkText(document.content);
  const embedding = await embedMany(
    chunks.map((chunk) => `${document.title}\n${chunk.content}`),
    "document",
  );

  const { data: saved, error: upsertError } = await supabase
    .from("rag_documents")
    .upsert(
      {
        company_id: companyId,
        source_type: document.sourceType,
        source_id: document.sourceId,
        title: document.title,
        summary: document.summary,
        content: document.content,
        metadata: document.metadata,
        checksum: digest,
        token_estimate: estimateTokens(document.content),
        chunk_count: chunks.length,
        embedding_model: embedding.model,
        indexed_at: new Date().toISOString(),
        is_stale: false,
      },
      { onConflict: "company_id,source_type,source_id" },
    )
    .select("id")
    .single();
  if (upsertError) throw toRagError("Salvataggio del documento non riuscito", upsertError);

  const documentId = saved?.id as string | undefined;
  if (!documentId) throw new RagError("Documento salvato senza id");

  // Riscrittura completa dei chunk: più semplice e sempre coerente col testo.
  const { error: deleteError } = await supabase
    .from("rag_chunks")
    .delete()
    .eq("document_id", documentId);
  if (deleteError) throw toRagError("Pulizia dei chunk non riuscita", deleteError);

  if (chunks.length > 0) {
    const { error: insertError } = await supabase.from("rag_chunks").insert(
      chunks.map((chunk, i) => ({
        company_id: companyId,
        document_id: documentId,
        chunk_index: chunk.index,
        content: chunk.content,
        token_estimate: chunk.tokenEstimate,
        embedding: embedding.vectors[i] ? toVectorLiteral(embedding.vectors[i]!) : null,
        metadata: {
          source_type: document.sourceType,
          source_id: document.sourceId,
          title: document.title,
        },
      })),
    );
    if (insertError) throw toRagError("Salvataggio dei chunk non riuscito", insertError);
  }

  return { skipped: false, chunks: chunks.length, embedded: embedding.remote };
}

async function deleteDocument(
  supabase: SupabaseClient,
  companyId: string,
  sourceType: RagSourceType,
  sourceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("rag_documents")
    .delete()
    .eq("company_id", companyId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  if (error) throw toRagError("Eliminazione del documento non riuscita", error);
}
