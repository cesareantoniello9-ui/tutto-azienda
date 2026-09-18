/**
 * Worker di indicizzazione, invocabile da un cron esterno.
 *
 *   POST /api/webhooks/rag-index
 *   Authorization: Bearer $RAG_REINDEX_SECRET
 *   { "companyId": "…", "full": false, "limit": 200 }
 *
 * Senza `companyId` processa le aziende che hanno lavoro in coda. Sta sotto
 * `/api/webhooks` (percorso pubblico per il proxy) perché non c'è una sessione
 * utente: l'autorizzazione è il segreto, obbligatorio.
 */
import { NextResponse } from "next/server";
import { reindexSecret } from "@/lib/rag/config";
import { ragIndexService } from "@/services/rag/index.service";
import type { IngestionReport } from "@/types/rag";

const MAX_COMPANIES_PER_RUN = 20;

export async function POST(request: Request) {
  const secret = reindexSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "RAG_REINDEX_SECRET non configurato", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    request.headers.get("x-rag-secret")?.trim() ??
    "";
  if (provided !== secret) {
    return NextResponse.json({ error: "Non autorizzato", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string;
    full?: boolean;
    limit?: number;
  };

  try {
    const companies = body.companyId
      ? [body.companyId]
      : (await ragIndexService.companiesWithPendingWork(MAX_COMPANIES_PER_RUN));

    const reports: Record<string, IngestionReport> = {};
    for (const companyId of companies) {
      if (body.full) await ragIndexService.enqueueFullReindex(companyId);
      reports[companyId] = await ragIndexService.ingestCompany(companyId, {
        full: body.full,
        limit: body.limit,
        force: body.full,
      });
    }

    return NextResponse.json({ companies: companies.length, reports });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Indicizzazione non riuscita",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
