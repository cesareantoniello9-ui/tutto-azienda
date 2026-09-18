/**
 * Riepilogo di fine giornata, invocato da un cron esterno.
 *
 *   POST /api/webhooks/rag-daily
 *   Authorization: Bearer $RAG_REINDEX_SECRET
 *   { "companyId": "…", "date": "2026-09-18", "force": false }
 *
 * Senza `companyId` genera il riepilogo per tutte le aziende che lo hanno
 * attivo. Dopo la generazione fa girare l'indicizzazione, così il riepilogo è
 * immediatamente interrogabile insieme al resto della memoria.
 */
import { NextResponse } from "next/server";
import { reindexSecret } from "@/lib/rag/config";
import { ragIndexService } from "@/services/rag/index.service";
import { ragRecapService } from "@/services/rag/recap.service";

const MAX_COMPANIES_PER_RUN = 50;

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
    date?: string;
    force?: boolean;
  };

  if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json(
      { error: "Data non valida (formato atteso: AAAA-MM-GG)", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  try {
    const companies = body.companyId
      ? [body.companyId]
      : (await ragRecapService.companiesWithRecapEnabled(MAX_COMPANIES_PER_RUN));

    const generated: { companyId: string; date: string | null; skipped: boolean }[] = [];

    for (const companyId of companies) {
      const recap = await ragRecapService.generateForCompany(companyId, {
        date: body.date,
        force: body.force,
      });
      generated.push({
        companyId,
        date: recap?.recap_date ?? null,
        // Nessun riepilogo = giornata senza attività registrate.
        skipped: recap === null,
      });
      if (recap) await ragIndexService.ingestCompany(companyId, { limit: 50 });
    }

    return NextResponse.json({ companies: companies.length, generated });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Generazione non riuscita",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
