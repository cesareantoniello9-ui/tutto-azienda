import { describe, it, expect } from "vitest";
import {
  aggregate,
  containsKeyword,
  formatMetrics,
  normalizeForMatch,
  scoreCase,
  type RetrievedRef,
} from "@/lib/rag/eval";
import type { RagCitation } from "@/types/rag";

function ref(sourceType: RetrievedRef["sourceType"], sourceId: string): RetrievedRef {
  return { sourceType, sourceId, title: `${sourceType} ${sourceId}` };
}

function citation(sourceId: string): RagCitation {
  return {
    documentId: `doc-${sourceId}`,
    sourceType: "client",
    sourceId,
    title: "Cliente",
    citedText: "Paga a 60 giorni fine mese",
  };
}

describe("containsKeyword", () => {
  it("ignora maiuscole e accenti", () => {
    expect(containsKeyword("La società è attiva da marzo", "SOCIETA")).toBe(true);
  });

  it("confronta i numeri a prescindere dal formato", () => {
    expect(containsKeyword("Totale € 29.280,00", "29280")).toBe(true);
    expect(containsKeyword("Totale € 29.280,00", "29.280")).toBe(true);
    expect(containsKeyword("Totale € 1.000,00", "29280")).toBe(false);
  });

  it("normalizza gli spazi", () => {
    expect(normalizeForMatch("  60   giorni\nfine mese ")).toBe("60 giorni fine mese");
  });
});

describe("scoreCase", () => {
  const retrieved = [ref("quote", "q1"), ref("client", "c1"), ref("note", "n1")];

  it("trova il documento atteso e ne registra la posizione", () => {
    const outcome = scoreCase({
      question: "Condizioni di pagamento?",
      expectedSources: [{ sourceType: "client", sourceId: "c1" }],
      expectedKeywords: [],
      retrieved,
    });

    expect(outcome.hit).toBe(true);
    expect(outcome.rank).toBe(2);
  });

  it("accetta l'attesa generica sul tipo di documento", () => {
    const outcome = scoreCase({
      question: "Quanto vale il preventivo?",
      expectedSources: [{ sourceType: "quote" }],
      expectedKeywords: [],
      retrieved,
    });

    expect(outcome.rank).toBe(1);
  });

  it("segna il caso mancato quando il documento atteso non c'è", () => {
    const outcome = scoreCase({
      question: "Chi è il referente?",
      expectedSources: [{ sourceType: "lead", sourceId: "l9" }],
      expectedKeywords: [],
      retrieved,
    });

    expect(outcome.hit).toBe(false);
    expect(outcome.rank).toBeNull();
  });

  it("considera ancorata solo la risposta che cita il contesto recuperato", () => {
    const buona = scoreCase({
      question: "Condizioni?",
      expectedSources: [],
      expectedKeywords: [],
      retrieved,
      answer: "Paga a 60 giorni.",
      citations: [citation("c1")],
    });
    expect(buona.grounded).toBe(true);

    const inventata = scoreCase({
      question: "Condizioni?",
      expectedSources: [],
      expectedKeywords: [],
      retrieved,
      answer: "Paga a 30 giorni.",
      citations: [citation("sconosciuto")],
    });
    expect(inventata.grounded).toBe(false);

    const senzaFonti = scoreCase({
      question: "Condizioni?",
      expectedSources: [],
      expectedKeywords: [],
      retrieved,
      answer: "Paga a 30 giorni.",
      citations: [],
    });
    expect(senzaFonti.grounded).toBe(false);
  });

  it("distingue i dati attesi presenti da quelli mancanti", () => {
    const outcome = scoreCase({
      question: "Condizioni e totale?",
      expectedSources: [],
      expectedKeywords: ["60 giorni", "29.280", "garanzia"],
      retrieved,
      answer: "Pagamento a 60 giorni fine mese, totale € 29.280,00.",
    });

    expect(outcome.keywordsFound).toEqual(["60 giorni", "29.280"]);
    expect(outcome.keywordsMissing).toEqual(["garanzia"]);
  });
});

describe("aggregate", () => {
  const retrieved = [ref("client", "c1"), ref("quote", "q1")];

  it("calcola recall e MRR sui soli casi con un'attesa dichiarata", () => {
    const outcomes = [
      scoreCase({
        question: "a",
        expectedSources: [{ sourceType: "client", sourceId: "c1" }],
        expectedKeywords: [],
        retrieved,
      }),
      scoreCase({
        question: "b",
        expectedSources: [{ sourceType: "quote", sourceId: "q1" }],
        expectedKeywords: [],
        retrieved,
      }),
      scoreCase({
        question: "c",
        expectedSources: [{ sourceType: "lead", sourceId: "l1" }],
        expectedKeywords: [],
        retrieved,
      }),
    ];

    const metrics = aggregate(outcomes);
    expect(metrics.cases).toBe(3);
    // Due attese su tre soddisfatte.
    expect(metrics.recallAtK).toBeCloseTo(2 / 3, 3);
    // Posizioni 1 e 2 → (1 + 0,5) / 3.
    expect(metrics.mrr).toBeCloseTo(0.5, 3);
  });

  it("dichiara l'ancoraggio non misurabile in un giro di solo recupero", () => {
    const metrics = aggregate([
      scoreCase({ question: "a", expectedSources: [], expectedKeywords: [], retrieved }),
    ]);
    expect(metrics.generatedCases).toBe(0);
    expect(formatMetrics(metrics)).toContain("n/d (solo recupero)");
  });

  it("misura l'ancoraggio solo sulle risposte effettivamente generate", () => {
    const outcomes = [
      scoreCase({
        question: "a",
        expectedSources: [],
        expectedKeywords: [],
        retrieved,
        answer: "Risposta",
        citations: [citation("c1")],
      }),
      scoreCase({
        question: "b",
        expectedSources: [],
        expectedKeywords: [],
        retrieved,
        answer: "Risposta senza fonti",
        citations: [],
      }),
      // Questo caso è di solo recupero: non deve pesare sull'ancoraggio.
      scoreCase({ question: "c", expectedSources: [], expectedKeywords: [], retrieved }),
    ];

    expect(aggregate(outcomes).groundedRatio).toBeCloseTo(0.5, 3);
  });

  it("restituisce zeri su una lista vuota invece di NaN", () => {
    const metrics = aggregate([]);
    expect(metrics).toEqual({
      cases: 0,
      generatedCases: 0,
      recallAtK: 0,
      mrr: 0,
      groundedRatio: 0,
      keywordRatio: 0,
    });
  });

  it("formatta le metriche in modo leggibile", () => {
    const riga = formatMetrics({
      cases: 4,
      generatedCases: 4,
      recallAtK: 0.75,
      mrr: 0.625,
      groundedRatio: 1,
      keywordRatio: 0.5,
    });

    expect(riga).toContain("casi: 4");
    expect(riga).toContain("recall@k: 75.0%");
    expect(riga).toContain("MRR: 0.625");
    expect(riga).toContain("risposte ancorate: 100.0%");
  });
});
