/**
 * Riepilogo di fine giornata — «cosa abbiamo fatto oggi».
 *
 * I numeri li calcola il database, non il modello: `buildDailySnapshot` è una
 * funzione pura che classifica le righe della giornata e produce statistiche,
 * eventi e punti salienti. Claude interviene solo per scriverne la narrazione,
 * e se manca la chiave il riepilogo si genera comunque in forma deterministica.
 *
 * Il documento risultante entra nel memoriale come tutti gli altri: fra sei
 * mesi «quando abbiamo deciso di rivedere il prezzo a Bianchi?» ha una risposta.
 */
import type { Activity, Client, Lead, Note, Opportunity, Quote } from "@/types/crm";
import type {
  DailyEvent,
  DailyStats,
  RagEmailRow,
  RagFileRow,
} from "@/types/rag";
import { getAnthropicClient, describeAnthropicError } from "./anthropic";
import { DEFAULT_ANSWER_MODEL, MAX_RECAP_EVENTS } from "./config";
import { itCurrency, itDate, truncate } from "./text";

const DEFAULT_TIMEZONE = "Europe/Rome";

export type DailySnapshotInput = {
  /** Giorno di riferimento in formato ISO `YYYY-MM-DD`. */
  date: string;
  timezone?: string;
  clients: Client[];
  leads: Lead[];
  opportunities: Opportunity[];
  quotes: Quote[];
  activities: Activity[];
  notes: Note[];
  emails: RagEmailRow[];
  files: RagFileRow[];
  /** Nomi già risolti: il riepilogo parla di persone, non di uuid. */
  clientNames?: Map<string, string>;
  leadNames?: Map<string, string>;
};

export type DailySnapshot = {
  date: string;
  stats: DailyStats;
  events: DailyEvent[];
  highlights: string[];
  /** `true` quando nella giornata non è successo nulla di registrato. */
  empty: boolean;
};

/** Giorno locale (fuso dell'azienda) di un istante ISO: "2026-09-18". */
export function localDay(iso: string | null | undefined, timezone = DEFAULT_TIMEZONE): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // "sv-SE" formatta come YYYY-MM-DD, che è esattamente ciò che serve.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(date);
}

function onDay(iso: string | null | undefined, day: string, timezone: string): boolean {
  return localDay(iso, timezone) === day;
}

function emptyStats(): DailyStats {
  return {
    clientsCreated: 0,
    leadsCreated: 0,
    leadsConverted: 0,
    opportunitiesOpened: 0,
    opportunitiesWon: 0,
    opportunitiesLost: 0,
    wonAmount: 0,
    quotesIssued: 0,
    quotesAccepted: 0,
    quotedAmount: 0,
    activitiesCompleted: 0,
    activitiesPlanned: 0,
    notesWritten: 0,
    emailsReceived: 0,
    filesUploaded: 0,
  };
}

/**
 * Classifica la giornata. Funzione pura: stesse righe, stesso risultato.
 */
export function buildDailySnapshot(input: DailySnapshotInput): DailySnapshot {
  const tz = input.timezone ?? DEFAULT_TIMEZONE;
  const day = input.date;
  const stats = emptyStats();
  const events: DailyEvent[] = [];

  const clientName = (id: string | null | undefined) =>
    (id && input.clientNames?.get(id)) || null;
  const leadName = (id: string | null | undefined) => (id && input.leadNames?.get(id)) || null;

  for (const client of input.clients) {
    if (!onDay(client.created_at, day, tz)) continue;
    stats.clientsCreated++;
    events.push({
      kind: "client",
      at: client.created_at,
      text: `Nuovo cliente in anagrafica: ${client.name}${client.industry ? ` (${client.industry})` : ""}.`,
    });
  }

  for (const lead of input.leads) {
    if (onDay(lead.created_at, day, tz)) {
      stats.leadsCreated++;
      events.push({
        kind: "lead",
        at: lead.created_at,
        text: `Nuovo lead: ${lead.name}${lead.company_name ? ` — ${lead.company_name}` : ""}.`,
      });
    }
    if (onDay(lead.converted_at, day, tz)) {
      stats.leadsConverted++;
      const nome = clientName(lead.converted_client_id);
      events.push({
        kind: "lead",
        at: lead.converted_at ?? lead.updated_at,
        text: `Lead convertito in cliente: ${lead.name}${nome ? ` → ${nome}` : ""}.`,
      });
    }
  }

  for (const opportunity of input.opportunities) {
    const cliente = clientName(opportunity.client_id);
    if (onDay(opportunity.created_at, day, tz)) {
      stats.opportunitiesOpened++;
      events.push({
        kind: "opportunity",
        at: opportunity.created_at,
        text: `Aperta la trattativa «${opportunity.title}»${cliente ? ` con ${cliente}` : ""} per ${
          itCurrency(opportunity.amount, opportunity.currency) ?? "importo non definito"
        }.`,
      });
    }
    // La chiusura non ha un campo dedicato: si legge dallo stato + updated_at.
    if (opportunity.status !== "open" && onDay(opportunity.updated_at, day, tz)) {
      const won = opportunity.status === "won";
      if (won) {
        stats.opportunitiesWon++;
        stats.wonAmount += Number(opportunity.amount ?? 0);
      } else {
        stats.opportunitiesLost++;
      }
      events.push({
        kind: "opportunity",
        at: opportunity.updated_at,
        text: `Trattativa ${won ? "VINTA" : "persa"}: «${opportunity.title}»${
          cliente ? ` con ${cliente}` : ""
        }, ${itCurrency(opportunity.amount, opportunity.currency) ?? "importo non definito"}${
          !won && opportunity.lost_reason ? ` — motivo: ${opportunity.lost_reason}` : ""
        }.`,
      });
    }
  }

  for (const quote of input.quotes) {
    const cliente = clientName(quote.client_id);
    if (onDay(quote.created_at, day, tz)) {
      stats.quotesIssued++;
      stats.quotedAmount += Number(quote.total ?? 0);
      events.push({
        kind: "quote",
        at: quote.created_at,
        text: `Emesso il preventivo ${quote.number}${cliente ? ` per ${cliente}` : ""}: ${
          itCurrency(quote.total, quote.currency) ?? "totale non definito"
        }.`,
      });
    }
    if (quote.status === "accepted" && onDay(quote.updated_at, day, tz)) {
      stats.quotesAccepted++;
      events.push({
        kind: "quote",
        at: quote.updated_at,
        text: `Preventivo ACCETTATO: ${quote.number}${cliente ? ` da ${cliente}` : ""}, ${
          itCurrency(quote.total, quote.currency) ?? "totale non definito"
        }.`,
      });
    }
  }

  for (const activity of input.activities) {
    const riferimento =
      clientName(activity.client_id) ??
      leadName(activity.lead_id) ??
      null;
    if (activity.status === "done" && onDay(activity.completed_at ?? activity.updated_at, day, tz)) {
      stats.activitiesCompleted++;
      events.push({
        kind: "activity",
        at: activity.completed_at ?? activity.updated_at,
        text: `Completata: «${activity.subject}»${riferimento ? ` con ${riferimento}` : ""}.`,
      });
    } else if (onDay(activity.created_at, day, tz)) {
      stats.activitiesPlanned++;
      events.push({
        kind: "activity",
        at: activity.created_at,
        text: `Pianificata: «${activity.subject}»${
          activity.due_at ? ` entro il ${itDate(activity.due_at)}` : ""
        }${riferimento ? ` con ${riferimento}` : ""}.`,
      });
    }
  }

  for (const note of input.notes) {
    if (!onDay(note.created_at, day, tz)) continue;
    stats.notesWritten++;
    const riferimento = clientName(note.client_id) ?? leadName(note.lead_id) ?? null;
    events.push({
      kind: "note",
      at: note.created_at,
      text: `Nota${riferimento ? ` su ${riferimento}` : ""}: ${truncate(note.body, 220)}`,
    });
  }

  for (const email of input.emails) {
    if (!onDay(email.sent_at, day, tz)) continue;
    stats.emailsReceived++;
    const riferimento = clientName(email.client_id) ?? leadName(email.lead_id) ?? email.from_address;
    events.push({
      kind: "email",
      at: email.sent_at,
      text: `Email ${email.direction === "inbound" ? "da" : "a"} ${riferimento}: «${
        email.subject ?? "senza oggetto"
      }».`,
    });
  }

  for (const file of input.files) {
    if (!onDay(file.created_at, day, tz)) continue;
    stats.filesUploaded++;
    const riferimento = clientName(file.client_id) ?? leadName(file.lead_id) ?? null;
    events.push({
      kind: "file",
      at: file.created_at,
      text: `Allegato caricato: ${file.title ?? file.file_name}${
        riferimento ? ` (${riferimento})` : ""
      }.`,
    });
  }

  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return {
    date: day,
    stats,
    events: events.slice(0, MAX_RECAP_EVENTS),
    highlights: buildHighlights(stats),
    empty: events.length === 0,
  };
}

/** Punti salienti in una riga ciascuno, pronti per l'UI. */
export function buildHighlights(stats: DailyStats): string[] {
  const highlights: string[] = [];
  const plural = (n: number, singolare: string, plurale: string) =>
    `${n} ${n === 1 ? singolare : plurale}`;

  if (stats.opportunitiesWon > 0) {
    highlights.push(
      `${plural(stats.opportunitiesWon, "trattativa vinta", "trattative vinte")}${
        stats.wonAmount > 0 ? ` per ${itCurrency(stats.wonAmount)}` : ""
      }`,
    );
  }
  if (stats.quotesAccepted > 0) {
    highlights.push(plural(stats.quotesAccepted, "preventivo accettato", "preventivi accettati"));
  }
  if (stats.quotesIssued > 0) {
    highlights.push(
      `${plural(stats.quotesIssued, "preventivo emesso", "preventivi emessi")}${
        stats.quotedAmount > 0 ? ` per ${itCurrency(stats.quotedAmount)}` : ""
      }`,
    );
  }
  if (stats.opportunitiesOpened > 0) {
    highlights.push(plural(stats.opportunitiesOpened, "trattativa aperta", "trattative aperte"));
  }
  if (stats.opportunitiesLost > 0) {
    highlights.push(plural(stats.opportunitiesLost, "trattativa persa", "trattative perse"));
  }
  if (stats.clientsCreated > 0) {
    highlights.push(plural(stats.clientsCreated, "nuovo cliente", "nuovi clienti"));
  }
  if (stats.leadsConverted > 0) {
    highlights.push(plural(stats.leadsConverted, "lead convertito", "lead convertiti"));
  }
  if (stats.leadsCreated > 0) {
    highlights.push(plural(stats.leadsCreated, "nuovo lead", "nuovi lead"));
  }
  if (stats.activitiesCompleted > 0) {
    highlights.push(plural(stats.activitiesCompleted, "attività completata", "attività completate"));
  }
  if (stats.emailsReceived > 0) {
    highlights.push(plural(stats.emailsReceived, "email registrata", "email registrate"));
  }
  if (stats.notesWritten > 0) {
    highlights.push(plural(stats.notesWritten, "nota scritta", "note scritte"));
  }
  if (stats.filesUploaded > 0) {
    highlights.push(plural(stats.filesUploaded, "allegato caricato", "allegati caricati"));
  }

  return highlights;
}

const RECAP_SYSTEM = `Scrivi il riepilogo di fine giornata di un'azienda italiana, per chi domattina vuole sapere in trenta secondi com'è andata.

Regole:
- Usa SOLO gli eventi e i numeri forniti. Non aggiungere nulla, non interpretare intenzioni.
- Italiano, terza persona, tono asciutto da nota interna. Niente entusiasmo di maniera.
- Struttura: una frase di sintesi, poi i fatti in ordine di importanza (soldi e impegni presi prima di tutto).
- Massimo 180 parole. Nomi propri per esteso, importi e date come nei dati.
- Chiudi con una riga "Da seguire:" solo se dagli eventi emerge un impegno aperto; altrimenti ometti la riga.`;

/** Testo del riepilogo, generato da Claude quando la chiave è configurata. */
export async function writeRecapNarrative(params: {
  snapshot: DailySnapshot;
  tenantName: string;
  model?: string;
}): Promise<{ summary: string; generatedBy: string }> {
  const deterministic = deterministicRecap(params.snapshot, params.tenantName);
  const client = getAnthropicClient();
  if (!client || params.snapshot.empty) return deterministic;

  try {
    const message = await client.messages.create({
      model: params.model?.trim() || DEFAULT_ANSWER_MODEL,
      max_tokens: 2048,
      system: RECAP_SYSTEM,
      messages: [{ role: "user", content: recapPrompt(params.snapshot, params.tenantName) }],
    });

    const text = message.content
      .filter((block): block is { type: "text"; text: string; citations: null } =>
        block.type === "text",
      )
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) return deterministic;
    return { summary: text, generatedBy: message.model ?? params.model ?? DEFAULT_ANSWER_MODEL };
  } catch (error) {
    // Un riepilogo deterministico è meglio di nessun riepilogo.
    return {
      summary: `${deterministic.summary}\n\n(Sintesi non generata: ${describeAnthropicError(error)})`,
      generatedBy: "deterministic",
    };
  }
}

/** Dati della giornata nel formato che il modello deve leggere. */
export function recapPrompt(snapshot: DailySnapshot, tenantName: string): string {
  const eventi = snapshot.events.map((event) => `- ${event.text}`).join("\n");
  const numeri = Object.entries(snapshot.stats)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `- ${STAT_LABELS[key] ?? key}: ${value}`)
    .join("\n");

  return [
    `Azienda: ${tenantName}`,
    `Giornata: ${itDate(snapshot.date) ?? snapshot.date}`,
    numeri ? `\nNumeri della giornata:\n${numeri}` : "",
    eventi ? `\nEventi registrati:\n${eventi}` : "\nNessun evento registrato.",
  ]
    .filter(Boolean)
    .join("\n");
}

const STAT_LABELS: Record<string, string> = {
  clientsCreated: "nuovi clienti",
  leadsCreated: "nuovi lead",
  leadsConverted: "lead convertiti",
  opportunitiesOpened: "trattative aperte",
  opportunitiesWon: "trattative vinte",
  opportunitiesLost: "trattative perse",
  wonAmount: "valore vinto (EUR)",
  quotesIssued: "preventivi emessi",
  quotesAccepted: "preventivi accettati",
  quotedAmount: "valore preventivato (EUR)",
  activitiesCompleted: "attività completate",
  activitiesPlanned: "attività pianificate",
  notesWritten: "note scritte",
  emailsReceived: "email registrate",
  filesUploaded: "allegati caricati",
};

/** Riepilogo senza modello: elenco ordinato dei fatti della giornata. */
export function deterministicRecap(
  snapshot: DailySnapshot,
  tenantName: string,
): { summary: string; generatedBy: string } {
  const data = itDate(snapshot.date) ?? snapshot.date;

  if (snapshot.empty) {
    return {
      summary: `${data} — nessuna attività registrata in ${tenantName}.`,
      generatedBy: "deterministic",
    };
  }

  const testa =
    snapshot.highlights.length > 0
      ? `${data} — ${snapshot.highlights.join(", ")}.`
      : `${data} — giornata operativa in ${tenantName}.`;

  return {
    summary: `${testa}\n\n${snapshot.events.map((event) => `• ${event.text}`).join("\n")}`,
    generatedBy: "deterministic",
  };
}
