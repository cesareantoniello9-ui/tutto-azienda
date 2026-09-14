import { describe, it, expect } from "vitest";
import {
  applyRecencyBoost,
  dedupeChunks,
  diversifyByDocument,
  rankChunks,
  reciprocalRankFusion,
  selectContext,
} from "@/lib/rag/ranking";
import {
  cosineSimilarity,
  localEmbedding,
  normalizeVector,
  toVectorLiteral,
  tokenizeForHashing,
} from "@/lib/rag/embeddings";
import type { RetrievedChunk } from "@/types/rag";

function chunk(overrides: Partial<RetrievedChunk> & { chunkId: string }): RetrievedChunk {
  return {
    documentId: `doc-${overrides.chunkId}`,
    sourceType: "client",
    sourceId: `src-${overrides.chunkId}`,
    title: `Documento ${overrides.chunkId}`,
    content: `contenuto ${overrides.chunkId}`,
    chunkIndex: 0,
    metadata: {},
    similarity: 0.5,
    lexicalRank: 0,
    score: 0.5,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("reciprocalRankFusion", () => {
  it("premia i risultati presenti in entrambe le liste", () => {
    const semantic = [chunk({ chunkId: "a" }), chunk({ chunkId: "b" }), chunk({ chunkId: "c" })];
    const lexical = [chunk({ chunkId: "c" }), chunk({ chunkId: "a" })];

    const fused = reciprocalRankFusion([semantic, lexical]);
    expect(fused[0]?.chunkId).toBe("a");
    expect(fused.map((c) => c.chunkId)).toContain("c");
    // "b" compare in una sola lista: resta, ma in fondo.
    expect(fused[fused.length - 1]?.chunkId).toBe("b");
  });

  it("non duplica i chunk presenti in più liste", () => {
    const fused = reciprocalRankFusion([[chunk({ chunkId: "a" })], [chunk({ chunkId: "a" })]]);
    expect(fused).toHaveLength(1);
  });
});

describe("diversifyByDocument", () => {
  it("limita i chunk provenienti dallo stesso documento", () => {
    const chunks = [
      chunk({ chunkId: "1", documentId: "doc-1", score: 0.9 }),
      chunk({ chunkId: "2", documentId: "doc-1", score: 0.8 }),
      chunk({ chunkId: "3", documentId: "doc-1", score: 0.7 }),
      chunk({ chunkId: "4", documentId: "doc-2", score: 0.6 }),
    ];

    const diversified = diversifyByDocument(chunks, 2);
    expect(diversified.slice(0, 3).map((c) => c.documentId)).toEqual(["doc-1", "doc-1", "doc-2"]);
    // Il chunk in eccesso non viene perso: scala in coda.
    expect(diversified[3]?.chunkId).toBe("3");
  });
});

describe("selectContext", () => {
  it("rispetta il numero massimo di chunk", () => {
    const chunks = ["a", "b", "c", "d"].map((id) => chunk({ chunkId: id }));
    expect(selectContext(chunks, 2)).toHaveLength(2);
  });

  it("rispetta il budget di caratteri tenendo almeno un chunk", () => {
    const long = chunk({ chunkId: "long", content: "x".repeat(500) });
    const short = chunk({ chunkId: "short", content: "y".repeat(50) });

    const selected = selectContext([long, short], 5, 200);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.chunkId).toBe("long");
  });
});

describe("applyRecencyBoost", () => {
  it("mette davanti il documento aggiornato più di recente a parità di punteggio", () => {
    const now = Date.parse("2026-09-01T00:00:00.000Z");
    const recent = chunk({ chunkId: "recent", updatedAt: "2026-08-25T00:00:00.000Z" });
    const old = chunk({ chunkId: "old", updatedAt: "2023-01-01T00:00:00.000Z" });

    const boosted = applyRecencyBoost([old, recent], now);
    expect(boosted[0]?.chunkId).toBe("recent");
  });
});

describe("dedupeChunks", () => {
  it("rimuove i chunk con contenuto equivalente", () => {
    const a = chunk({ chunkId: "a", content: "Cliente  Bianchi  Impianti" });
    const b = chunk({ chunkId: "b", content: "cliente bianchi impianti" });
    expect(dedupeChunks([a, b])).toHaveLength(1);
  });
});

describe("rankChunks", () => {
  it("applica dedup, freschezza, diversificazione e budget in un solo passaggio", () => {
    const chunks = [
      chunk({ chunkId: "1", documentId: "doc-1", score: 0.9 }),
      chunk({ chunkId: "2", documentId: "doc-1", score: 0.85, content: "contenuto 1" }),
      chunk({ chunkId: "3", documentId: "doc-2", score: 0.8 }),
      chunk({ chunkId: "4", documentId: "doc-3", score: 0.7 }),
    ];

    const ranked = rankChunks(chunks, 3, { maxPerDocument: 1 });
    expect(ranked).toHaveLength(3);
    expect(new Set(ranked.map((c) => c.documentId)).size).toBe(3);
  });
});

describe("embedding locale", () => {
  it("è deterministico e normalizzato", () => {
    const a = localEmbedding("preventivo per Bianchi Impianti");
    const b = localEmbedding("preventivo per Bianchi Impianti");

    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("avvicina i testi che parlano della stessa cosa", () => {
    const query = localEmbedding("condizioni di pagamento del cliente Bianchi");
    const related = localEmbedding("Bianchi Impianti paga a 60 giorni fine mese");
    const unrelated = localEmbedding("ricetta della torta di mele con cannella");

    expect(cosineSimilarity(query, related)).toBeGreaterThan(cosineSimilarity(query, unrelated));
  });

  it("scarta le parole vuote dalla tokenizzazione", () => {
    const tokens = tokenizeForHashing("Il cliente è della zona di Milano");
    expect(tokens).toContain("cliente");
    expect(tokens).toContain("milano");
    expect(tokens).not.toContain("il");
    expect(tokens).not.toContain("di");
  });

  it("serializza il vettore nel formato accettato da pgvector", () => {
    const literal = toVectorLiteral(normalizeVector([3, 4]));
    expect(literal).toMatch(/^\[-?\d+\.\d{6},-?\d+\.\d{6}\]$/);
    expect(literal).toBe("[0.600000,0.800000]");
  });
});
