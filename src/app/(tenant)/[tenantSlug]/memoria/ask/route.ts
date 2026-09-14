/**
 * Risposta in streaming della memoria aziendale (SSE).
 *
 * La route vive SOTTO il segmento del tenant (`/{slug}/memoria/ask`) e non in
 * `/api`: così il proxy risolve lo slug dal percorso (o dal sottodominio) esattamente
 * come per le pagine, e la risposta resta legata all'azienda giusta.
 *
 * Ogni evento è una riga `data: {json}` — il client aggiorna la bolla di testo a
 * ogni delta, invece di aspettare l'intera risposta.
 */
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant/context";
import { askSchema } from "@/modules/rag/schema";
import { ragAskService, type AskEvent } from "@/services/rag/ask.service";

export async function POST(
  request: Request,
  context: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await context.params;

  const tenant = await requireTenant().catch(() => null);
  if (!tenant) {
    return NextResponse.json(
      { error: "Azienda non trovata o non autorizzata", code: "FORBIDDEN" },
      { status: 403 },
    );
  }
  // Il percorso deve corrispondere all'azienda risolta dal proxy: nessuna
  // possibilità di interrogare la memoria di un'altra azienda cambiando URL.
  if (tenant.slug !== tenantSlug) {
    return NextResponse.json(
      { error: "Azienda non corrispondente", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Domanda non valida",
        code: "VALIDATION_ERROR",
      },
      { status: 422 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of ragAskService.ask({
          question: parsed.data.question,
          conversationId: parsed.data.conversationId ?? null,
          sourceTypes: parsed.data.sourceTypes,
          signal: request.signal,
        })) {
          send(event);
        }
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Errore imprevisto durante la risposta.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disattiva il buffering dei proxy (nginx): senza, lo streaming non si vede.
      "X-Accel-Buffering": "no",
    },
  });
}
