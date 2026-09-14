import { describe, it, expect } from "vitest";
import type { Client, Quote, QuoteItem, Note } from "@/types/crm";
import { checksum } from "@/lib/rag/text";
import {
  serializeClient,
  serializeNote,
  serializeQuote,
} from "@/lib/rag/serialize";

const BASE = {
  id: "00000000-0000-4000-8000-000000000001",
  company_id: "00000000-0000-4000-8000-0000000000ff",
  created_at: "2026-03-14T10:00:00.000Z",
  updated_at: "2026-07-01T10:00:00.000Z",
};

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    ...BASE,
    type: "company",
    name: "Bianchi Impianti S.r.l.",
    vat_number: "01234567890",
    tax_code: null,
    email: "acquisti@bianchimpianti.it",
    phone: null,
    website: null,
    address_street: "Via Ferraris 12",
    address_city: "Sesto San Giovanni",
    address_zip: "20099",
    address_province: "MI",
    address_country: "IT",
    industry: "impiantistica industriale",
    owner_id: null,
    is_active: true,
    notes: "Pagano a 60 giorni fine mese.",
    ...overrides,
  };
}

describe("serializeClient", () => {
  it("produce un documento autosufficiente con i dati chiave", () => {
    const document = serializeClient(makeClient(), {
      ownerName: "Giulia Rossi",
      stats: { "Trattative totali": 4 },
    });

    expect(document.sourceType).toBe("client");
    expect(document.title).toContain("Bianchi Impianti");
    expect(document.content).toContain("Partita IVA: 01234567890");
    expect(document.content).toContain("Referente interno: Giulia Rossi");
    expect(document.content).toContain("Pagano a 60 giorni fine mese.");
    expect(document.content).toContain("Trattative totali: 4");
    // Le date sono in formato italiano, non ISO.
    expect(document.content).toContain("14/03/2026");
  });

  it("allega lo storico delle interazioni quando presente", () => {
    const document = serializeClient(makeClient(), {
      recentNotes: [{ body: "Vogliono la consegna entro settembre.", created_at: BASE.updated_at }],
      recentActivities: [
        { subject: "Sopralluogo", type: "meeting", status: "done", due_at: BASE.updated_at },
      ],
    });

    expect(document.content).toContain("Attività recenti");
    expect(document.content).toContain("riunione «Sopralluogo» (completata");
    expect(document.content).toContain("Vogliono la consegna entro settembre.");
  });

  it("non inserisce righe per i campi assenti", () => {
    const document = serializeClient(makeClient({ vat_number: null, notes: null }));
    expect(document.content).not.toContain("Partita IVA");
    expect(document.content).not.toContain("Note in anagrafica");
  });

  it("dà lo stesso checksum a parità di dati (nessun re-embedding inutile)", () => {
    const first = serializeClient(makeClient());
    const second = serializeClient(makeClient());
    expect(checksum(first.content)).toBe(checksum(second.content));

    const changed = serializeClient(makeClient({ industry: "edilizia" }));
    expect(checksum(changed.content)).not.toBe(checksum(first.content));
  });
});

describe("serializeQuote", () => {
  const quote: Quote = {
    ...BASE,
    client_id: "00000000-0000-4000-8000-00000000000c",
    opportunity_id: null,
    number: "2026/0042",
    status: "sent",
    issue_date: "2026-07-03",
    valid_until: "2026-09-02",
    currency: "EUR",
    subtotal: 24000,
    discount_total: 0,
    tax_total: 5280,
    total: 29280,
    notes: null,
    terms: "Pagamento a 60 giorni.",
  };

  const items: QuoteItem[] = [
    {
      ...BASE,
      id: "00000000-0000-4000-8000-00000000001b",
      quote_id: quote.id,
      description: "Installazione e collaudo",
      quantity: 1,
      unit_price: 7000,
      discount_pct: 0,
      tax_rate: 22,
      line_total: 7000,
      position: 2,
    },
    {
      ...BASE,
      id: "00000000-0000-4000-8000-00000000001a",
      quote_id: quote.id,
      description: "Quadro elettrico",
      quantity: 2,
      unit_price: 8500,
      discount_pct: 0,
      tax_rate: 22,
      line_total: 17000,
      position: 1,
    },
  ];

  it("elenca le righe nell'ordine di posizione con gli importi in euro", () => {
    const document = serializeQuote(quote, items, { clientName: "Bianchi Impianti S.r.l." });
    const first = document.content.indexOf("Quadro elettrico");
    const second = document.content.indexOf("Installazione e collaudo");

    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(second);
    expect(document.content).toContain("1. Quadro elettrico");
    expect(document.content).toMatch(/Totale: .*29\.280,00/);
    expect(document.summary).toContain("Bianchi Impianti");
    expect(document.metadata.items).toBe(2);
  });
});

describe("serializeNote", () => {
  it("collega la nota all'entità di riferimento", () => {
    const note: Note = {
      ...BASE,
      body: "Il cliente chiede una revisione del prezzo entro venerdì.",
      author_id: null,
      client_id: "00000000-0000-4000-8000-00000000000c",
      lead_id: null,
      opportunity_id: null,
    };

    const document = serializeNote(note, { clientName: "Bianchi Impianti S.r.l." });
    expect(document.title).toContain("Bianchi Impianti");
    expect(document.content).toContain("Riferita a: Bianchi Impianti S.r.l.");
    expect(document.summary).toContain("revisione del prezzo");
  });
});
