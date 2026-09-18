/**
 * Email in ingresso → memoria aziendale.
 *
 *   POST /api/webhooks/rag-email
 *   Authorization: Bearer $RAG_EMAIL_SECRET   (oppure $RAG_REINDEX_SECRET)
 *
 * Accetta il formato normalizzato dell'app e i payload dei provider di posta
 * più diffusi (Resend, Postmark, SendGrid, Mailgun): `normalizePayload` li
 * riconduce tutti alla stessa forma. L'azienda si deduce dagli indirizzi
 * coinvolti, oppure la si passa esplicitamente (`companyId` / `companySlug`).
 *
 * Il filtro privacy vive nel servizio: per impostazione predefinita entra solo
 * la posta legata a un contatto già presente nel CRM.
 */
import { NextResponse } from "next/server";
import { reindexSecret } from "@/lib/rag/config";
import type { InboundEmail } from "@/lib/rag/email";
import { inboundEmailSchema } from "@/modules/rag/schema";
import { ragEmailsService } from "@/services/rag/emails.service";
import { ragIndexService } from "@/services/rag/index.service";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

function emailSecret(): string | undefined {
  return process.env.RAG_EMAIL_SECRET?.trim() || reindexSecret();
}

export async function POST(request: Request) {
  const secret = emailSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "RAG_EMAIL_SECRET non configurato", code: "NOT_CONFIGURED" },
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

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      { error: "Payload non valido", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  const parsed = inboundEmailSchema.safeParse(normalizePayload(raw as Record<string, unknown>));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Email non valida",
        code: "VALIDATION_ERROR",
      },
      { status: 422 },
    );
  }

  const email: InboundEmail = {
    messageId: parsed.data.messageId ?? null,
    threadId: parsed.data.threadId ?? null,
    direction: parsed.data.direction,
    subject: parsed.data.subject ?? null,
    from: parsed.data.from,
    fromName: parsed.data.fromName ?? null,
    to: parsed.data.to ?? [],
    cc: parsed.data.cc ?? [],
    text: parsed.data.text ?? null,
    html: parsed.data.html ?? null,
    sentAt: parsed.data.sentAt ?? null,
    hasAttachments: parsed.data.hasAttachments,
  };

  try {
    const companyId =
      parsed.data.companyId ??
      (parsed.data.companySlug ? await companyIdFromSlug(parsed.data.companySlug) : null) ??
      (await ragEmailsService.resolveCompany(email));

    if (!companyId) {
      // Non è un errore del chiamante: semplicemente non sappiamo di chi è.
      return NextResponse.json(
        { stored: false, reason: "azienda non riconosciuta dagli indirizzi coinvolti" },
        { status: 202 },
      );
    }

    const outcome = await ragEmailsService.ingest(companyId, email);
    if (outcome.stored) {
      await ragIndexService.ingestCompany(companyId, { limit: 20 });
      return NextResponse.json({ stored: true, id: outcome.email.id, reason: outcome.reason });
    }

    return NextResponse.json({ stored: false, reason: outcome.reason }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Registrazione non riuscita",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}

async function companyIdFromSlug(slug: string): Promise<string | null> {
  const supabase = await createSupabaseServiceClient();
  const { data } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
  return ((data as { id?: string } | null)?.id) ?? null;
}

/**
 * Riconduce i payload dei provider al formato dell'app.
 * I nomi dei campi cambiano da provider a provider, la sostanza no.
 */
export function normalizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const pick = (...keys: string[]): unknown => {
    for (const key of keys) {
      const value = payload[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
  };

  const toList = (value: unknown): string[] | undefined => {
    if (Array.isArray(value)) {
      return value
        .map((item) =>
          typeof item === "string"
            ? item
            : typeof item === "object" && item !== null
              ? String((item as { email?: string; address?: string }).email ??
                  (item as { address?: string }).address ??
                  "")
              : "",
        )
        .filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return undefined;
  };

  const from = pick("from", "From", "sender", "FromFull");
  const fromAddress =
    typeof from === "object" && from !== null
      ? String(
          (from as { email?: string; address?: string }).email ??
            (from as { address?: string }).address ??
            "",
        )
      : String(from ?? "");

  return {
    companyId: pick("companyId", "company_id"),
    companySlug: pick("companySlug", "company_slug", "tenant", "tenantSlug"),
    messageId: pick("messageId", "message_id", "MessageID", "Message-Id", "message-id"),
    threadId: pick("threadId", "thread_id", "ConversationID", "conversationId"),
    direction: pick("direction"),
    subject: pick("subject", "Subject"),
    from: fromAddress,
    fromName:
      typeof from === "object" && from !== null
        ? ((from as { name?: string }).name ?? null)
        : (pick("fromName", "FromName") ?? null),
    to: toList(pick("to", "To", "ToFull", "recipients")),
    cc: toList(pick("cc", "Cc", "CcFull")),
    text: pick("text", "TextBody", "plain", "body-plain", "bodyPlain"),
    html: pick("html", "HtmlBody", "body-html", "bodyHtml"),
    sentAt: pick("sentAt", "sent_at", "date", "Date", "timestamp"),
    hasAttachments: Boolean(
      (() => {
        const attachments = pick("attachments", "Attachments");
        if (Array.isArray(attachments)) return attachments.length > 0;
        return pick("hasAttachments", "has_attachments") ?? false;
      })(),
    ),
  };
}
