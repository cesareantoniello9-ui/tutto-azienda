/**
 * Valutazione automatica del recupero — rete di sicurezza in CI.
 *
 * Gira sul corpus dimostrativo con embedding locali deterministici: nessun
 * database, nessuna chiave API, stesso risultato a ogni esecuzione. Se una
 * modifica al chunking, al ranking o ai serializzatori peggiora il recupero, il
 * test lo dice con un numero invece che con un'impressione.
 *
 * Le soglie sono volutamente sotto il valore attuale: servono a intercettare i
 * peggioramenti, non a fotografare la prestazione del giorno.
 */
import { describe, it, expect } from "vitest";
import goldenSet from "../fixtures/rag-golden-cases.json";
import { demoRetrieve } from "@/lib/rag/demo";
import { rankChunks } from "@/lib/rag/ranking";
import { aggregate, formatMetrics, scoreCase, type RetrievedRef } from "@/lib/rag/eval";
import type { EvalCaseOutcome, ExpectedSource } from "@/types/rag";

type GoldenCase = {
  question: string;
  expectedSources: ExpectedSource[];
  expectedKeywords: string[];
};

const cases = goldenSet.cases as GoldenCase[];
const TOP_K = 5;

/** Recupero completo: corpus demo + riordino applicativo reale. */
function retrieve(question: string): RetrievedRef[] {
  const chunks = rankChunks(demoRetrieve(question, 10), TOP_K);
  return chunks.map((chunk) => ({
    sourceType: chunk.sourceType,
    sourceId: chunk.sourceId,
    title: chunk.title,
  }));
}

const outcomes: EvalCaseOutcome[] = cases.map((testCase) =>
  scoreCase({
    question: testCase.question,
    expectedSources: testCase.expectedSources,
    expectedKeywords: testCase.expectedKeywords,
    retrieved: retrieve(testCase.question),
    // Il contenuto del chunk fa da "risposta": senza modello si misura se il
    // dato atteso è almeno finito nel contesto passato a Claude.
    answer: demoRetrieve(testCase.question, TOP_K)
      .map((chunk) => chunk.content)
      .join("\n"),
  }),
);

const metrics = aggregate(outcomes);

describe("valutazione automatica del recupero (corpus dimostrativo)", () => {
  it("trova il documento atteso nella maggior parte dei casi", () => {
    // Registrato nell'output del test: serve a leggere l'andamento nel tempo.
    console.log(`\n  ${formatMetrics(metrics)}\n`);
    expect(metrics.recallAtK).toBeGreaterThanOrEqual(0.75);
  });

  it("mette il documento atteso vicino alla cima", () => {
    expect(metrics.mrr).toBeGreaterThanOrEqual(0.6);
  });

  it("porta nel contesto i dati che la risposta deve contenere", () => {
    expect(metrics.keywordRatio).toBeGreaterThanOrEqual(0.75);
  });

  it.each(cases.map((testCase, index) => [testCase.question, index] as const))(
    "recupera qualcosa di pertinente per «%s»",
    (_question, index) => {
      const outcome = outcomes[index];
      expect(outcome).toBeDefined();
      expect(outcome!.retrieved.length).toBeGreaterThan(0);
    },
  );

  it("non restituisce nulla per una domanda estranea al corpus", () => {
    expect(retrieve("qual è la ricetta della carbonara?")).toHaveLength(0);
  });
});
