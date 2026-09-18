import { describe, it, expect } from "vitest";
import {
  decideIndexing,
  emailBody,
  emailDomain,
  htmlToText,
  parseAddress,
  stripQuotedReply,
  type KnownContact,
} from "@/lib/rag/email";
import { extractText, guessMimeType, isSupportedMimeType } from "@/lib/rag/extract";
import { serializeEmail, serializeFile } from "@/lib/rag/serialize";
import { normalizePayload } from "@/app/api/webhooks/rag-email/route";

const CONTACTS: KnownContact[] = [
  {
    id: "c1",
    kind: "client",
    email: "acquisti@bianchimpianti.it",
    name: "Bianchi Impianti S.r.l.",
  },
  { id: "l1", kind: "lead", email: "m.verdi@verdilogistica.it", name: "Marco Verdi" },
];

describe("parseAddress", () => {
  it("estrae l'indirizzo dal formato con nome", () => {
    expect(parseAddress('"Mario Rossi" <Mario@Acme.IT>')).toEqual({
      address: "mario@acme.it",
      name: "Mario Rossi",
    });
  });

  it("accetta anche il solo indirizzo", () => {
    expect(parseAddress("  INFO@acme.it ")).toEqual({ address: "info@acme.it", name: null });
  });

  it("estrae il dominio", () => {
    expect(emailDomain("mario@acme.it")).toBe("acme.it");
  });
});

describe("decideIndexing — filtro privacy", () => {
  it("accetta la posta di un contatto già nel CRM", () => {
    const decision = decideIndexing({
      email: { from: "acquisti@bianchimpianti.it", to: ["info@acme.it"] },
      contacts: CONTACTS,
      onlyKnownContacts: true,
      allowedDomains: [],
    });

    expect(decision.indexable).toBe(true);
    if (decision.indexable) expect(decision.contact?.id).toBe("c1");
  });

  it("riconosce il collega sullo stesso dominio del cliente", () => {
    const decision = decideIndexing({
      email: { from: "direzione@bianchimpianti.it", to: ["info@acme.it"] },
      contacts: CONTACTS,
      onlyKnownContacts: true,
      allowedDomains: [],
    });

    expect(decision.indexable).toBe(true);
    if (decision.indexable) expect(decision.contact?.id).toBe("c1");
  });

  it("scarta la posta estranea quando il filtro è attivo", () => {
    const decision = decideIndexing({
      email: { from: "newsletter@qualcosa.com", to: ["info@acme.it"] },
      contacts: CONTACTS,
      onlyKnownContacts: true,
      allowedDomains: [],
    });

    expect(decision.indexable).toBe(false);
    if (!decision.indexable) expect(decision.reason).toContain("filtro privacy");
  });

  it("ammette i domini elencati esplicitamente", () => {
    const decision = decideIndexing({
      email: { from: "ordini@fornitore.it", to: ["info@acme.it"] },
      contacts: CONTACTS,
      onlyKnownContacts: true,
      allowedDomains: ["@fornitore.it"],
    });

    expect(decision.indexable).toBe(true);
    if (decision.indexable) expect(decision.reason).toBe("dominio-ammesso");
  });

  it("lascia passare tutto se l'azienda disattiva il filtro", () => {
    const decision = decideIndexing({
      email: { from: "chiunque@altrove.com" },
      contacts: CONTACTS,
      onlyKnownContacts: false,
      allowedDomains: [],
    });

    expect(decision.indexable).toBe(true);
    if (decision.indexable) expect(decision.reason).toBe("filtro-disattivato");
  });
});

describe("corpo della email", () => {
  it("taglia la catena citata, così ogni risposta non reindicizza tutto", () => {
    const testo = `Confermiamo l'ordine di due quadri.

Il giorno 12/09/2026 Acme S.r.l. ha scritto:
> Vi inviamo il preventivo aggiornato
> in allegato.`;

    const risultato = stripQuotedReply(testo);
    expect(risultato).toContain("Confermiamo l'ordine");
    expect(risultato).not.toContain("preventivo aggiornato");
  });

  it("usa l'HTML solo quando manca il testo", () => {
    expect(emailBody({ from: "a@b.it", text: "  Testo puro  " })).toBe("Testo puro");
    expect(emailBody({ from: "a@b.it", html: "<p>Ciao<br>mondo</p>" })).toBe("Ciao\nmondo");
  });

  it("ripulisce i tag e le entità HTML", () => {
    expect(htmlToText("<p>Totale: 29.280&nbsp;&euro;</p>").replace(/\s+/g, " ").trim()).toContain(
      "Totale: 29.280",
    );
  });
});

describe("normalizePayload — provider diversi, stesso formato", () => {
  it("riconosce il payload stile Postmark", () => {
    const normalized = normalizePayload({
      MessageID: "abc",
      Subject: "Richiesta offerta",
      FromFull: { Email: "acquisti@bianchimpianti.it", Name: "Ufficio Acquisti" },
      From: "acquisti@bianchimpianti.it",
      To: "info@acme.it",
      TextBody: "Ci serve un preventivo.",
      Attachments: [{ Name: "richiesta.pdf" }],
    });

    expect(normalized.messageId).toBe("abc");
    expect(normalized.subject).toBe("Richiesta offerta");
    expect(normalized.from).toBe("acquisti@bianchimpianti.it");
    expect(normalized.to).toEqual(["info@acme.it"]);
    expect(normalized.text).toBe("Ci serve un preventivo.");
    expect(normalized.hasAttachments).toBe(true);
  });

  it("riconosce il payload stile Resend/Mailgun", () => {
    const normalized = normalizePayload({
      from: { email: "m.verdi@verdilogistica.it", name: "Marco Verdi" },
      to: ["commerciale@acme.it", "info@acme.it"],
      subject: "Disponibilità",
      "body-plain": "Possiamo vederci giovedì?",
    });

    expect(normalized.from).toBe("m.verdi@verdilogistica.it");
    expect(normalized.fromName).toBe("Marco Verdi");
    expect(normalized.to).toEqual(["commerciale@acme.it", "info@acme.it"]);
    expect(normalized.text).toBe("Possiamo vederci giovedì?");
    expect(normalized.hasAttachments).toBe(false);
  });
});

describe("estrazione del testo dagli allegati", () => {
  it("deduce il tipo dall'estensione quando il browser non lo dichiara", () => {
    expect(guessMimeType("contratto.pdf", "application/octet-stream")).toBe("application/pdf");
    expect(guessMimeType("note.md")).toBe("text/markdown");
    expect(guessMimeType("dati.csv", null)).toBe("text/csv");
  });

  it("sa quali tipi può leggere", () => {
    expect(isSupportedMimeType("application/pdf")).toBe(true);
    expect(isSupportedMimeType("text/plain")).toBe(true);
    expect(isSupportedMimeType("image/png")).toBe(false);
  });

  it("estrae il testo semplice", async () => {
    const data = new TextEncoder().encode("Condizioni di fornitura\n\nPagamento a 60 giorni.");
    const result = await extractText(data, "text/plain", "condizioni.txt");

    expect(result.status).toBe("done");
    expect(result.text).toContain("Pagamento a 60 giorni.");
  });

  it("dichiara i formati che non sa leggere invece di indicizzare il vuoto", async () => {
    const legacy = await extractText(new Uint8Array([1, 2, 3]), "application/msword", "vecchio.doc");
    expect(legacy.status).toBe("unsupported");
    expect(legacy.error).toContain(".docx");

    const immagine = await extractText(new Uint8Array([1, 2, 3]), "image/png", "foto.png");
    expect(immagine.status).toBe("unsupported");
  });

  it("segnala un file di testo vuoto", async () => {
    const result = await extractText(new TextEncoder().encode("   "), "text/plain", "vuoto.txt");
    expect(result.status).toBe("unsupported");
  });
});

describe("serializzazione delle nuove fonti", () => {
  it("un allegato diventa un documento con il suo contenuto", () => {
    const document = serializeFile(
      {
        id: "f1",
        file_name: "contratto-2026.pdf",
        title: "Contratto di manutenzione 2026",
        category: "contratti",
        mime_type: "application/pdf",
        page_count: 4,
        extracted_text: "Il canone annuo è di € 12.000,00 con revisione ISTAT.",
        created_at: "2026-09-18T08:00:00.000Z",
        client_id: "c1",
        lead_id: null,
        opportunity_id: null,
      },
      { clientName: "Bianchi Impianti S.r.l." },
    );

    expect(document.sourceType).toBe("file");
    expect(document.title).toContain("Contratto di manutenzione 2026");
    expect(document.content).toContain("Riferito a: Bianchi Impianti S.r.l.");
    expect(document.content).toContain("canone annuo");
    expect(document.metadata.page_count).toBe(4);
  });

  it("una email diventa un documento con mittente, data e testo", () => {
    const document = serializeEmail(
      {
        id: "e1",
        subject: "Richiesta offerta quadri elettrici",
        direction: "inbound",
        from_address: "acquisti@bianchimpianti.it",
        from_name: "Ufficio Acquisti",
        to_addresses: ["info@acme.it"],
        cc_addresses: [],
        body_text: "Ci servono due quadri entro ottobre.",
        sent_at: "2026-09-18T08:00:00.000Z",
        has_attachments: false,
        client_id: "c1",
        lead_id: null,
      },
      { clientName: "Bianchi Impianti S.r.l." },
    );

    expect(document.sourceType).toBe("email");
    expect(document.title).toContain("Richiesta offerta");
    expect(document.content).toContain("Da: Ufficio Acquisti <acquisti@bianchimpianti.it>");
    expect(document.content).toContain("18/09/2026");
    expect(document.content).toContain("due quadri entro ottobre");
    expect(document.summary).toContain("Bianchi Impianti S.r.l.");
  });
});
