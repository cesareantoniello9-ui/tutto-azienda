/**
 * Serializzatori: entità di business → documento del memoriale.
 *
 * Il modello non legge righe di database, legge testo. Qui ogni entità diventa
 * un documento in italiano, autosufficiente (contiene i nomi, non solo gli id)
 * e con le relazioni denormalizzate: è la differenza fra "chunk di JSON" e una
 * memoria che si può citare.
 *
 * Funzioni pure: nessun accesso a Supabase, quindi testabili in isolamento.
 */
import type {
  Activity,
  Client,
  Lead,
  Note,
  Opportunity,
  Quote,
  QuoteItem,
} from "@/types/crm";
import type { Tenant, TenantSettings } from "@/types/tenant";
import type { SourceDocument } from "@/types/rag";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
} from "@/types/crm";
import { itCurrency, itDate, labeledLines, normalizeText, truncate } from "./text";

// ─────────────────────────────────────────────────────────────
// Etichette italiane degli enum (il modello legge parole, non codici)
// ─────────────────────────────────────────────────────────────
export const LEAD_STATUS_LABELS: Record<(typeof LEAD_STATUSES)[number], string> = {
  new: "nuovo",
  contacted: "contattato",
  qualified: "qualificato",
  unqualified: "non qualificato",
  converted: "convertito in cliente",
  lost: "perso",
};

export const LEAD_SOURCE_LABELS: Record<(typeof LEAD_SOURCES)[number], string> = {
  web: "sito web",
  referral: "passaparola",
  cold_call: "chiamata a freddo",
  event: "evento",
  social: "social",
  advertising: "pubblicità",
  other: "altro",
};

export const STAGE_LABELS: Record<(typeof OPPORTUNITY_STAGES)[number], string> = {
  qualification: "qualificazione",
  proposal: "proposta",
  negotiation: "negoziazione",
  won: "vinta",
  lost: "persa",
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "bozza",
  sent: "inviato",
  accepted: "accettato",
  rejected: "rifiutato",
  expired: "scaduto",
};

export const ACTIVITY_TYPE_LABELS: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  call: "chiamata",
  meeting: "riunione",
  email: "email",
  task: "attività",
  follow_up: "follow-up",
};

export const ACTIVITY_STATUS_LABELS: Record<(typeof ACTIVITY_STATUSES)[number], string> = {
  planned: "pianificata",
  done: "completata",
  cancelled: "annullata",
};

/** Contesto relazionale passato ai serializzatori (nomi già risolti). */
export type RelatedContext = {
  clientName?: string | null;
  leadName?: string | null;
  opportunityTitle?: string | null;
  ownerName?: string | null;
  authorName?: string | null;
  /** Ultime interazioni da allegare al memoriale dell'entità. */
  recentNotes?: { body: string; created_at: string }[];
  recentActivities?: Pick<Activity, "subject" | "type" | "status" | "due_at">[];
  recentEmails?: {
    subject: string | null;
    direction: "inbound" | "outbound";
    sent_at: string;
  }[];
  recentFiles?: { file_name: string; title: string | null; created_at: string }[];
  /** Aggregati calcolati dal chiamante (evita N query nel serializzatore). */
  stats?: Record<string, string | number | null | undefined>;
};

function section(title: string, body: string | null | undefined): string {
  const content = body?.trim();
  return content ? `\n\n## ${title}\n${content}` : "";
}

function interactions(related: RelatedContext): string {
  const parts: string[] = [];

  if (related.recentActivities?.length) {
    const rows = related.recentActivities
      .slice(0, 10)
      .map((a) => {
        const when = itDate(a.due_at);
        const type = ACTIVITY_TYPE_LABELS[a.type] ?? a.type;
        const status = ACTIVITY_STATUS_LABELS[a.status] ?? a.status;
        return `- ${type} «${a.subject}» (${status}${when ? `, ${when}` : ""})`;
      })
      .join("\n");
    parts.push(`### Attività recenti\n${rows}`);
  }

  if (related.recentNotes?.length) {
    const rows = related.recentNotes
      .slice(0, 10)
      .map((n) => `- [${itDate(n.created_at) ?? "senza data"}] ${truncate(normalizeText(n.body), 400)}`)
      .join("\n");
    parts.push(`### Note recenti\n${rows}`);
  }

  if (related.recentEmails?.length) {
    const rows = related.recentEmails
      .slice(0, 10)
      .map(
        (e) =>
          `- [${itDate(e.sent_at) ?? "senza data"}] email ${
            e.direction === "inbound" ? "ricevuta" : "inviata"
          }: «${e.subject?.trim() || "senza oggetto"}»`,
      )
      .join("\n");
    parts.push(`### Email recenti\n${rows}`);
  }

  if (related.recentFiles?.length) {
    const rows = related.recentFiles
      .slice(0, 10)
      .map((f) => `- [${itDate(f.created_at) ?? "senza data"}] ${f.title?.trim() || f.file_name}`)
      .join("\n");
    parts.push(`### Allegati\n${rows}`);
  }

  return parts.join("\n\n");
}

function statsBlock(related: RelatedContext): string {
  if (!related.stats) return "";
  const entries = Object.entries(related.stats).filter(
    ([, v]) => v !== null && v !== undefined && `${v}`.trim() !== "",
  );
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `- ${k}: ${v}`).join("\n");
}

// ─────────────────────────────────────────────────────────────
// Serializzatori
// ─────────────────────────────────────────────────────────────

export function serializeTenant(tenant: Tenant, related: RelatedContext = {}): SourceDocument {
  const settings: Partial<TenantSettings> = tenant.settings ?? {};
  const head = labeledLines([
    ["Ragione sociale", tenant.name],
    ["Identificativo (slug)", tenant.slug],
    ["Piano", tenant.plan],
    ["Stato", tenant.status],
    ["Fuso orario", settings.timezone],
    ["Valuta", settings.currency],
    ["Lingua", settings.locale],
    ["Attiva dal", itDate(tenant.created_at)],
  ]);

  const content =
    `# Scheda azienda — ${tenant.name}\n${head}` +
    section("Numeri dell'azienda", statsBlock(related));

  return {
    sourceType: "tenant",
    sourceId: tenant.id,
    title: `Azienda — ${tenant.name}`,
    summary: `Scheda dell'azienda ${tenant.name} (piano ${tenant.plan}, stato ${tenant.status}).`,
    content: normalizeText(content),
    metadata: { slug: tenant.slug, plan: tenant.plan, status: tenant.status },
  };
}

export function serializeClient(client: Client, related: RelatedContext = {}): SourceDocument {
  const tipo = client.type === "company" ? "azienda" : "privato";
  const address = [
    client.address_street,
    client.address_zip,
    client.address_city,
    client.address_province,
    client.address_country,
  ]
    .filter(Boolean)
    .join(", ");

  const head = labeledLines([
    ["Tipo", tipo],
    ["Stato", client.is_active ? "attivo" : "non attivo"],
    ["Partita IVA", client.vat_number],
    ["Codice fiscale", client.tax_code],
    ["Email", client.email],
    ["Telefono", client.phone],
    ["Sito web", client.website],
    ["Settore", client.industry],
    ["Indirizzo", address],
    ["Referente interno", related.ownerName],
    ["Cliente dal", itDate(client.created_at)],
    ["Ultimo aggiornamento", itDate(client.updated_at)],
  ]);

  const content =
    `# Cliente — ${client.name}\n${head}` +
    section("Note in anagrafica", client.notes) +
    section("Andamento commerciale", statsBlock(related)) +
    section("Storico interazioni", interactions(related));

  return {
    sourceType: "client",
    sourceId: client.id,
    title: `Cliente — ${client.name}`,
    summary: `${client.name}, ${tipo}${client.industry ? `, settore ${client.industry}` : ""}${
      client.address_city ? `, ${client.address_city}` : ""
    }.`,
    content: normalizeText(content),
    metadata: {
      name: client.name,
      type: client.type,
      industry: client.industry,
      city: client.address_city,
      is_active: client.is_active,
      vat_number: client.vat_number,
    },
  };
}

export function serializeLead(lead: Lead, related: RelatedContext = {}): SourceDocument {
  const head = labeledLines([
    ["Azienda di provenienza", lead.company_name],
    ["Stato", LEAD_STATUS_LABELS[lead.status] ?? lead.status],
    ["Canale di acquisizione", LEAD_SOURCE_LABELS[lead.source] ?? lead.source],
    ["Valore stimato", itCurrency(lead.estimated_value)],
    ["Email", lead.email],
    ["Telefono", lead.phone],
    ["Referente interno", related.ownerName],
    ["Convertito il", itDate(lead.converted_at)],
    ["Cliente generato", related.clientName],
    ["Creato il", itDate(lead.created_at)],
  ]);

  const content =
    `# Lead — ${lead.name}\n${head}` +
    section("Note", lead.notes) +
    section("Storico interazioni", interactions(related));

  return {
    sourceType: "lead",
    sourceId: lead.id,
    title: `Lead — ${lead.name}`,
    summary: `Lead ${lead.name}${lead.company_name ? ` (${lead.company_name})` : ""}, stato ${
      LEAD_STATUS_LABELS[lead.status] ?? lead.status
    }.`,
    content: normalizeText(content),
    metadata: {
      name: lead.name,
      status: lead.status,
      source: lead.source,
      estimated_value: lead.estimated_value,
      company_name: lead.company_name,
    },
  };
}

export function serializeOpportunity(
  opportunity: Opportunity,
  related: RelatedContext = {},
): SourceDocument {
  const head = labeledLines([
    ["Cliente", related.clientName],
    ["Fase", STAGE_LABELS[opportunity.stage] ?? opportunity.stage],
    ["Esito", opportunity.status],
    ["Valore", itCurrency(opportunity.amount, opportunity.currency)],
    ["Probabilità di chiusura", `${opportunity.probability}%`],
    ["Chiusura prevista", itDate(opportunity.expected_close_date)],
    ["Motivo della perdita", opportunity.lost_reason],
    ["Referente interno", related.ownerName],
    ["Lead di origine", related.leadName],
    ["Aperta il", itDate(opportunity.created_at)],
  ]);

  const content =
    `# Opportunità — ${opportunity.title}\n${head}` +
    section("Storico interazioni", interactions(related));

  return {
    sourceType: "opportunity",
    sourceId: opportunity.id,
    title: `Opportunità — ${opportunity.title}`,
    summary: `Trattativa «${opportunity.title}»${
      related.clientName ? ` con ${related.clientName}` : ""
    }, ${itCurrency(opportunity.amount, opportunity.currency) ?? "importo non definito"}, fase ${
      STAGE_LABELS[opportunity.stage] ?? opportunity.stage
    }.`,
    content: normalizeText(content),
    metadata: {
      title: opportunity.title,
      stage: opportunity.stage,
      status: opportunity.status,
      amount: opportunity.amount,
      currency: opportunity.currency,
      client_id: opportunity.client_id,
      expected_close_date: opportunity.expected_close_date,
    },
  };
}

export function serializeQuote(
  quote: Quote,
  items: QuoteItem[],
  related: RelatedContext = {},
): SourceDocument {
  const head = labeledLines([
    ["Cliente", related.clientName],
    ["Stato", QUOTE_STATUS_LABELS[quote.status] ?? quote.status],
    ["Data di emissione", itDate(quote.issue_date)],
    ["Valido fino al", itDate(quote.valid_until)],
    ["Imponibile", itCurrency(quote.subtotal, quote.currency)],
    ["Sconti", itCurrency(quote.discount_total, quote.currency)],
    ["IVA", itCurrency(quote.tax_total, quote.currency)],
    ["Totale", itCurrency(quote.total, quote.currency)],
    ["Opportunità collegata", related.opportunityTitle],
  ]);

  const lines = [...items]
    .sort((a, b) => a.position - b.position)
    .map((item, i) => {
      const details = [
        `quantità ${item.quantity}`,
        `prezzo unitario ${itCurrency(item.unit_price, quote.currency)}`,
        item.discount_pct > 0 ? `sconto ${item.discount_pct}%` : null,
        `IVA ${item.tax_rate}%`,
        `totale riga ${itCurrency(item.line_total, quote.currency)}`,
      ]
        .filter(Boolean)
        .join(", ");
      return `${i + 1}. ${item.description} — ${details}`;
    })
    .join("\n");

  const content =
    `# Preventivo ${quote.number}\n${head}` +
    section("Righe del preventivo", lines) +
    section("Note", quote.notes) +
    section("Condizioni", quote.terms);

  return {
    sourceType: "quote",
    sourceId: quote.id,
    title: `Preventivo ${quote.number}${related.clientName ? ` — ${related.clientName}` : ""}`,
    summary: `Preventivo ${quote.number}${
      related.clientName ? ` per ${related.clientName}` : ""
    }, ${itCurrency(quote.total, quote.currency) ?? "totale non definito"}, ${
      QUOTE_STATUS_LABELS[quote.status] ?? quote.status
    }.`,
    content: normalizeText(content),
    metadata: {
      number: quote.number,
      status: quote.status,
      total: quote.total,
      currency: quote.currency,
      client_id: quote.client_id,
      opportunity_id: quote.opportunity_id,
      issue_date: quote.issue_date,
      items: items.length,
    },
  };
}

export function serializeActivity(
  activity: Activity,
  related: RelatedContext = {},
): SourceDocument {
  const type = ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type;
  const status = ACTIVITY_STATUS_LABELS[activity.status] ?? activity.status;
  const linked = related.clientName ?? related.leadName ?? related.opportunityTitle ?? null;

  const head = labeledLines([
    ["Tipo", type],
    ["Stato", status],
    ["Scadenza", itDate(activity.due_at)],
    ["Completata il", itDate(activity.completed_at)],
    ["Collegata a", linked],
    ["Responsabile", related.ownerName],
    ["Creata il", itDate(activity.created_at)],
  ]);

  const content = `# Attività — ${activity.subject}\n${head}` + section("Dettagli", activity.notes);

  return {
    sourceType: "activity",
    sourceId: activity.id,
    title: `Attività — ${activity.subject}`,
    summary: `${type} «${activity.subject}»${linked ? ` con ${linked}` : ""} (${status}).`,
    content: normalizeText(content),
    metadata: {
      subject: activity.subject,
      type: activity.type,
      status: activity.status,
      due_at: activity.due_at,
      client_id: activity.client_id,
      lead_id: activity.lead_id,
      opportunity_id: activity.opportunity_id,
    },
  };
}

export function serializeNote(note: Note, related: RelatedContext = {}): SourceDocument {
  const linked = related.clientName ?? related.leadName ?? related.opportunityTitle ?? null;
  const head = labeledLines([
    ["Riferita a", linked],
    ["Autore", related.authorName],
    ["Scritta il", itDate(note.created_at)],
  ]);

  const content = `# Nota${linked ? ` su ${linked}` : ""}\n${head}\n\n${normalizeText(note.body)}`;

  return {
    sourceType: "note",
    sourceId: note.id,
    title: `Nota${linked ? ` — ${linked}` : ""} (${itDate(note.created_at) ?? "senza data"})`,
    summary: truncate(normalizeText(note.body), 180),
    content: normalizeText(content),
    metadata: {
      client_id: note.client_id,
      lead_id: note.lead_id,
      opportunity_id: note.opportunity_id,
      author_id: note.author_id,
    },
  };
}

/** Documento interno caricato a mano (procedura, listino, FAQ). */
export function serializeManual(input: {
  id: string;
  title: string;
  body: string;
  category?: string | null;
}): SourceDocument {
  const body = normalizeText(input.body);
  return {
    sourceType: "manual",
    sourceId: input.id,
    title: input.title,
    summary: truncate(body, 180),
    content: normalizeText(
      `# ${input.title}${input.category ? `\nCategoria: ${input.category}` : ""}\n\n${body}`,
    ),
    metadata: { category: input.category ?? null, manual: true },
  };
}

// ─────────────────────────────────────────────────────────────
// Fonti estese: riepilogo giornaliero, allegati, email
// ─────────────────────────────────────────────────────────────

/** Riepilogo di fine giornata → documento del memoriale. */
export function serializeDailyRecap(recap: {
  id: string;
  recap_date: string;
  summary: string;
  highlights: string[];
  stats: Record<string, number>;
  generated_by?: string | null;
}): SourceDocument {
  const data = itDate(recap.recap_date) ?? recap.recap_date;

  const numeri = Object.entries(recap.stats ?? {})
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  const content =
    `# Riepilogo della giornata — ${data}\n${normalizeText(recap.summary)}` +
    section("In sintesi", (recap.highlights ?? []).map((item) => `- ${item}`).join("\n")) +
    section("Numeri della giornata", numeri);

  return {
    sourceType: "daily",
    sourceId: recap.id,
    title: `Riepilogo giornaliero — ${data}`,
    summary:
      (recap.highlights ?? []).length > 0
        ? `${data}: ${(recap.highlights ?? []).join(", ")}.`
        : truncate(normalizeText(recap.summary), 180),
    content: normalizeText(content),
    metadata: {
      recap_date: recap.recap_date,
      highlights: recap.highlights ?? [],
      stats: recap.stats ?? {},
      generated_by: recap.generated_by ?? null,
    },
  };
}

/** Allegato con testo estratto → documento del memoriale. */
export function serializeFile(
  file: {
    id: string;
    file_name: string;
    title: string | null;
    category: string | null;
    mime_type: string;
    page_count: number | null;
    extracted_text: string | null;
    created_at: string;
    client_id: string | null;
    lead_id: string | null;
    opportunity_id: string | null;
  },
  related: RelatedContext = {},
): SourceDocument {
  const titolo = file.title?.trim() || file.file_name;
  const linked = related.clientName ?? related.leadName ?? related.opportunityTitle ?? null;

  const head = labeledLines([
    ["Nome del file", file.file_name],
    ["Categoria", file.category],
    ["Riferito a", linked],
    ["Pagine", file.page_count],
    ["Caricato il", itDate(file.created_at)],
  ]);

  const content =
    `# Allegato — ${titolo}\n${head}` +
    section("Contenuto del documento", normalizeText(file.extracted_text ?? ""));

  return {
    sourceType: "file",
    sourceId: file.id,
    title: `Allegato — ${titolo}`,
    summary: truncate(normalizeText(file.extracted_text ?? titolo), 180),
    content: normalizeText(content),
    metadata: {
      file_name: file.file_name,
      category: file.category,
      mime_type: file.mime_type,
      page_count: file.page_count,
      client_id: file.client_id,
      lead_id: file.lead_id,
      opportunity_id: file.opportunity_id,
    },
  };
}

/** Email → documento del memoriale. */
export function serializeEmail(
  email: {
    id: string;
    subject: string | null;
    direction: "inbound" | "outbound";
    from_address: string;
    from_name: string | null;
    to_addresses: string[];
    cc_addresses: string[];
    body_text: string;
    sent_at: string;
    has_attachments: boolean;
    client_id: string | null;
    lead_id: string | null;
  },
  related: RelatedContext = {},
): SourceDocument {
  const linked = related.clientName ?? related.leadName ?? null;
  const mittente = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;

  const head = labeledLines([
    ["Direzione", email.direction === "inbound" ? "ricevuta" : "inviata"],
    ["Da", mittente],
    ["A", email.to_addresses.join(", ")],
    ["In copia", email.cc_addresses.join(", ")],
    ["Data", itDate(email.sent_at)],
    ["Contatto", linked],
    ["Allegati", email.has_attachments ? "sì" : null],
  ]);

  const oggetto = email.subject?.trim() || "senza oggetto";
  const content =
    `# Email — ${oggetto}\n${head}` + section("Testo del messaggio", normalizeText(email.body_text));

  return {
    sourceType: "email",
    sourceId: email.id,
    title: `Email — ${truncate(oggetto, 80)}${linked ? ` (${linked})` : ""}`,
    summary: `${email.direction === "inbound" ? "Ricevuta da" : "Inviata a"} ${
      linked ?? mittente
    }: ${truncate(normalizeText(email.body_text), 140)}`,
    content: normalizeText(content),
    metadata: {
      subject: email.subject,
      direction: email.direction,
      from: email.from_address,
      to: email.to_addresses,
      sent_at: email.sent_at,
      client_id: email.client_id,
      lead_id: email.lead_id,
      has_attachments: email.has_attachments,
    },
  };
}
