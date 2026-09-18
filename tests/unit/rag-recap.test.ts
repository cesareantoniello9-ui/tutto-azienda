import { describe, it, expect } from "vitest";
import type { Activity, Client, Lead, Note, Opportunity, Quote } from "@/types/crm";
import type { RagEmailRow, RagFileRow } from "@/types/rag";
import {
  buildDailySnapshot,
  buildHighlights,
  deterministicRecap,
  localDay,
  recapPrompt,
} from "@/lib/rag/recap";
import { serializeDailyRecap } from "@/lib/rag/serialize";

const COMPANY = "00000000-0000-4000-8000-0000000000ff";
const DAY = "2026-09-18";
/** 10:00 a Roma = 08:00 UTC (ora legale). */
const MORNING = "2026-09-18T08:00:00.000Z";
const EVENING = "2026-09-18T16:30:00.000Z";
const YESTERDAY = "2026-09-17T10:00:00.000Z";

function base(id: string, created = MORNING) {
  return { id, company_id: COMPANY, created_at: created, updated_at: created };
}

function client(id: string, name: string, created = MORNING): Client {
  return {
    ...base(id, created),
    type: "company",
    name,
    vat_number: null,
    tax_code: null,
    email: null,
    phone: null,
    website: null,
    address_street: null,
    address_city: null,
    address_zip: null,
    address_province: null,
    address_country: "IT",
    industry: null,
    owner_id: null,
    is_active: true,
    notes: null,
  };
}

function opportunity(overrides: Partial<Opportunity> & { id: string }): Opportunity {
  return {
    ...base(overrides.id),
    client_id: null,
    source_lead_id: null,
    title: "Trattativa",
    stage: "qualification",
    status: "open",
    amount: 0,
    currency: "EUR",
    probability: 0,
    expected_close_date: null,
    lost_reason: null,
    owner_id: null,
    ...overrides,
  };
}

function quote(overrides: Partial<Quote> & { id: string }): Quote {
  return {
    ...base(overrides.id),
    client_id: "cliente",
    opportunity_id: null,
    number: "2026/0001",
    status: "draft",
    issue_date: DAY,
    valid_until: null,
    currency: "EUR",
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    total: 0,
    notes: null,
    terms: null,
    ...overrides,
  };
}

function emptyInput() {
  return {
    date: DAY,
    clients: [] as Client[],
    leads: [] as Lead[],
    opportunities: [] as Opportunity[],
    quotes: [] as Quote[],
    activities: [] as Activity[],
    notes: [] as Note[],
    emails: [] as RagEmailRow[],
    files: [] as RagFileRow[],
  };
}

describe("localDay", () => {
  it("classifica nel fuso dell'azienda, non in UTC", () => {
    // 23:30 a Roma del 18 settembre = 21:30 UTC dello stesso giorno.
    expect(localDay("2026-09-18T21:30:00.000Z", "Europe/Rome")).toBe("2026-09-18");
    // 00:30 a Roma del 19 = 22:30 UTC del 18: appartiene al giorno dopo.
    expect(localDay("2026-09-18T22:30:00.000Z", "Europe/Rome")).toBe("2026-09-19");
  });

  it("restituisce null per valori non validi", () => {
    expect(localDay(null)).toBeNull();
    expect(localDay("non-una-data")).toBeNull();
  });
});

describe("buildDailySnapshot", () => {
  it("riconosce una giornata senza attività", () => {
    const snapshot = buildDailySnapshot(emptyInput());
    expect(snapshot.empty).toBe(true);
    expect(snapshot.highlights).toEqual([]);
  });

  it("ignora ciò che è successo in un altro giorno", () => {
    const snapshot = buildDailySnapshot({
      ...emptyInput(),
      clients: [client("c1", "Ieri S.r.l.", YESTERDAY)],
    });
    expect(snapshot.stats.clientsCreated).toBe(0);
    expect(snapshot.empty).toBe(true);
  });

  it("conta clienti, trattative, preventivi e attività della giornata", () => {
    const snapshot = buildDailySnapshot({
      ...emptyInput(),
      clients: [client("c1", "Bianchi Impianti S.r.l.")],
      opportunities: [
        opportunity({ id: "o1", title: "Sede Nord", amount: 48000, client_id: "c1" }),
        opportunity({
          id: "o2",
          title: "Manutenzione",
          amount: 12000,
          status: "won",
          stage: "won",
          created_at: YESTERDAY,
          updated_at: EVENING,
        }),
      ],
      quotes: [quote({ id: "q1", total: 29280, client_id: "c1", number: "2026/0042" })],
      activities: [
        {
          ...base("a1"),
          type: "call",
          status: "done",
          subject: "Sollecito pagamento",
          notes: null,
          due_at: null,
          completed_at: EVENING,
          owner_id: null,
          client_id: "c1",
          lead_id: null,
          opportunity_id: null,
        },
      ],
      clientNames: new Map([["c1", "Bianchi Impianti S.r.l."]]),
    });

    expect(snapshot.stats.clientsCreated).toBe(1);
    expect(snapshot.stats.opportunitiesOpened).toBe(1);
    expect(snapshot.stats.opportunitiesWon).toBe(1);
    expect(snapshot.stats.wonAmount).toBe(12000);
    expect(snapshot.stats.quotesIssued).toBe(1);
    expect(snapshot.stats.quotedAmount).toBe(29280);
    expect(snapshot.stats.activitiesCompleted).toBe(1);
    expect(snapshot.empty).toBe(false);

    // Gli eventi sono in ordine cronologico e nominano le persone, non gli id.
    const testo = snapshot.events.map((event) => event.text).join("\n");
    expect(testo).toContain("Bianchi Impianti S.r.l.");
    expect(testo).not.toContain("c1");
    const orari = snapshot.events.map((event) => Date.parse(event.at));
    expect([...orari].sort((a, b) => a - b)).toEqual(orari);
  });

  it("mette in cima i fatti che contano: soldi prima di tutto", () => {
    const highlights = buildHighlights({
      clientsCreated: 2,
      leadsCreated: 1,
      leadsConverted: 0,
      opportunitiesOpened: 0,
      opportunitiesWon: 1,
      opportunitiesLost: 0,
      wonAmount: 12000,
      quotesIssued: 0,
      quotesAccepted: 0,
      quotedAmount: 0,
      activitiesCompleted: 3,
      activitiesPlanned: 0,
      notesWritten: 0,
      emailsReceived: 0,
      filesUploaded: 0,
    });

    expect(highlights[0]).toContain("trattativa vinta");
    expect(highlights[0]).toContain("12.000,00");
    expect(highlights).toContain("2 nuovi clienti");
  });

  it("registra email e allegati della giornata", () => {
    const email: RagEmailRow = {
      id: "e1",
      company_id: COMPANY,
      message_id: "<m1>",
      thread_id: null,
      direction: "inbound",
      subject: "Richiesta offerta",
      from_address: "acquisti@bianchi.it",
      from_name: null,
      to_addresses: ["info@acme.it"],
      cc_addresses: [],
      body_text: "Ci serve un preventivo.",
      sent_at: MORNING,
      client_id: "c1",
      lead_id: null,
      has_attachments: false,
      created_at: MORNING,
      updated_at: MORNING,
    };

    const snapshot = buildDailySnapshot({
      ...emptyInput(),
      emails: [email],
      clientNames: new Map([["c1", "Bianchi Impianti S.r.l."]]),
    });

    expect(snapshot.stats.emailsReceived).toBe(1);
    expect(snapshot.events[0]?.text).toContain("Bianchi Impianti S.r.l.");
    expect(snapshot.events[0]?.text).toContain("Richiesta offerta");
  });
});

describe("riepilogo deterministico", () => {
  it("funziona senza modello, elencando i fatti", () => {
    const snapshot = buildDailySnapshot({
      ...emptyInput(),
      clients: [client("c1", "Verdi Logistica")],
    });
    const { summary, generatedBy } = deterministicRecap(snapshot, "Acme S.r.l.");

    expect(generatedBy).toBe("deterministic");
    expect(summary).toContain("18/09/2026");
    expect(summary).toContain("Verdi Logistica");
  });

  it("dichiara le giornate vuote invece di inventare", () => {
    const { summary } = deterministicRecap(buildDailySnapshot(emptyInput()), "Acme S.r.l.");
    expect(summary).toContain("nessuna attività registrata");
  });
});

describe("recapPrompt", () => {
  it("passa al modello solo numeri ed eventi reali", () => {
    const snapshot = buildDailySnapshot({
      ...emptyInput(),
      quotes: [quote({ id: "q1", total: 1000, number: "2026/0007" })],
    });
    const prompt = recapPrompt(snapshot, "Acme S.r.l.");

    expect(prompt).toContain("Acme S.r.l.");
    expect(prompt).toContain("preventivi emessi: 1");
    expect(prompt).toContain("2026/0007");
    // Le voci a zero non entrano: niente rumore nel contesto.
    expect(prompt).not.toContain("trattative perse");
  });
});

describe("serializeDailyRecap", () => {
  it("produce un documento citabile con la data nel titolo", () => {
    const document = serializeDailyRecap({
      id: "r1",
      recap_date: DAY,
      summary: "Giornata con un preventivo inviato.",
      highlights: ["1 preventivo emesso"],
      stats: { quotesIssued: 1, notesWritten: 0 },
      generated_by: "claude-opus-5",
    });

    expect(document.sourceType).toBe("daily");
    expect(document.title).toContain("18/09/2026");
    expect(document.content).toContain("1 preventivo emesso");
    expect(document.content).toContain("quotesIssued: 1");
    // Le voci a zero restano fuori anche dal documento.
    expect(document.content).not.toContain("notesWritten");
  });
});
