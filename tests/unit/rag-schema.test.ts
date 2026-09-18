import { describe, it, expect } from "vitest";
import {
  askSchema,
  manualDocumentSchema,
  memorySchema,
  ragSettingsSchema,
} from "@/modules/rag/schema";
import { extractiveAnswer, conversationTitle } from "@/lib/rag/answer";
import { demoRetrieve } from "@/lib/rag/demo";

describe("askSchema", () => {
  it("accetta una domanda con filtro sulle origini", () => {
    const result = askSchema.safeParse({
      question: "Quali preventivi sono in scadenza?",
      sourceTypes: ["quote", "opportunity"],
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta una domanda troppo corta", () => {
    expect(askSchema.safeParse({ question: "eh" }).success).toBe(false);
  });

  it("rifiuta un id di conversazione non valido", () => {
    expect(
      askSchema.safeParse({ question: "Domanda valida", conversationId: "non-un-uuid" }).success,
    ).toBe(false);
  });
});

describe("memorySchema", () => {
  it("applica i valori di default", () => {
    const result = memorySchema.safeParse({
      content: "Il listino 2027 entra in vigore a gennaio.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("fact");
      expect(result.data.importance).toBe(3);
      expect(result.data.pinned).toBe(false);
    }
  });

  it("rifiuta un ricordo troppo breve per essere utile", () => {
    expect(memorySchema.safeParse({ content: "ok" }).success).toBe(false);
  });
});

describe("ragSettingsSchema", () => {
  const valid = {
    assistant_name: "Memoria Aziendale",
    system_instructions: null,
    glossary: [{ term: "DDT", definition: "Documento di trasporto" }],
    enabled_sources: ["client", "quote"],
    top_k: 8,
    candidate_pool: 40,
    min_similarity: 0.15,
    memory_enabled: true,
    memory_top_k: 5,
    answer_model: "claude-opus-5",
    embedding_model: "voyage-3.5",
    effort: "medium",
  };

  it("accetta una configurazione completa", () => {
    expect(ragSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("pretende almeno un'origine attiva", () => {
    expect(ragSettingsSchema.safeParse({ ...valid, enabled_sources: [] }).success).toBe(false);
  });

  it("rifiuta un livello di effort inesistente", () => {
    expect(ragSettingsSchema.safeParse({ ...valid, effort: "turbo" }).success).toBe(false);
  });
});

describe("manualDocumentSchema", () => {
  it("rifiuta un contenuto troppo breve", () => {
    expect(manualDocumentSchema.safeParse({ title: "Procedura", body: "poco" }).success).toBe(
      false,
    );
  });
});

describe("risposta degradata", () => {
  it("dichiara l'assenza di contesto invece di inventare", () => {
    const answer = extractiveAnswer([]);
    expect(answer.context.degraded).toBe("no-context");
    expect(answer.citations).toHaveLength(0);
    expect(answer.text).toContain("Non ho trovato");
  });

  it("mostra gli estratti trovati e li cita", () => {
    const chunks = demoRetrieve("condizioni di pagamento di Bianchi Impianti", 3);
    expect(chunks.length).toBeGreaterThan(0);

    const answer = extractiveAnswer(chunks);
    expect(answer.context.degraded).toBe("no-api-key");
    expect(answer.citations.length).toBe(chunks.length);
    expect(answer.text).toContain("Risposta non generata");
  });
});

describe("demoRetrieve", () => {
  it("trova il cliente giusto a partire da una domanda in italiano", () => {
    const chunks = demoRetrieve("Che condizioni di pagamento ha Bianchi Impianti?", 3);
    expect(chunks[0]?.title).toMatch(/Bianchi Impianti|Preventivo 2026\/0042/);
  });

  it("non restituisce nulla per una domanda del tutto estranea", () => {
    expect(demoRetrieve("qwertyuiop asdfghjkl zxcvbnm", 3)).toHaveLength(0);
  });
});

describe("conversationTitle", () => {
  it("accorcia le domande lunghe", () => {
    const title = conversationTitle("a".repeat(200));
    expect(title.length).toBeLessThanOrEqual(58);
    expect(title.endsWith("…")).toBe(true);
  });

  it("tiene la domanda intera quando è breve", () => {
    expect(conversationTitle("  Quanti clienti attivi abbiamo?  ")).toBe(
      "Quanti clienti attivi abbiamo?",
    );
  });
});
