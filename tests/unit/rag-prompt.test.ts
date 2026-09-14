import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  buildDocumentBlocks,
  buildMemoryBlock,
  buildMessages,
  buildSystemPrompt,
  mapCitations,
} from "@/lib/rag/prompt";
import { filterNewMemories, textSimilarity } from "@/lib/rag/memory";
import type { RecalledMemory, RetrievedChunk } from "@/types/rag";

function chunk(id: string, overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: `chunk-${id}`,
    documentId: `doc-${id}`,
    sourceType: "quote",
    sourceId: `src-${id}`,
    title: `Preventivo ${id}`,
    content: `Totale del preventivo ${id}: € 1.000,00`,
    chunkIndex: 0,
    metadata: {},
    similarity: 0.7,
    lexicalRank: 0.2,
    score: 0.5,
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const memory: RecalledMemory = {
  id: "mem-1",
  kind: "preference",
  content: "Bianchi Impianti paga a 60 giorni fine mese.",
  importance: 4,
  confidence: 0.9,
  subjectType: "client",
  subjectId: "client-1",
  pinned: true,
  similarity: 0.6,
  createdAt: "2026-06-12T00:00:00.000Z",
};

describe("buildSystemPrompt", () => {
  it("mette in testa il prefisso stabile con il breakpoint di cache", () => {
    const blocks = buildSystemPrompt("Acme S.r.l.", {
      assistant_name: "Memoria Aziendale",
      system_instructions: null,
      glossary: [],
    });

    expect(blocks[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[0]?.text).toContain("ESCLUSIVAMENTE");
    expect(blocks[1]?.text).toContain("Acme S.r.l.");
  });

  it("include glossario e istruzioni dell'azienda", () => {
    const blocks = buildSystemPrompt("Acme S.r.l.", {
      assistant_name: "Memoria",
      system_instructions: "Non citare mai i margini ai commerciali junior.",
      glossary: [{ term: "DDT", definition: "Documento di trasporto" }],
    });

    const text = blocks.map((block) => block.text).join("\n");
    expect(text).toContain("DDT: Documento di trasporto");
    expect(text).toContain("margini ai commerciali junior");
  });
});

describe("buildDocumentBlocks", () => {
  it("crea un blocco document per chunk, con citazioni attive", () => {
    const blocks = buildDocumentBlocks([chunk("a"), chunk("b")]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type).toBe("document");
    expect(blocks[0]?.citations).toEqual({ enabled: true });
    expect(blocks[0]?.source).toEqual({
      type: "text",
      media_type: "text/plain",
      data: "Totale del preventivo a: € 1.000,00",
    });
    expect(blocks[0]?.context).toContain("Origine: Preventivo");
  });
});

describe("buildMessages", () => {
  it("mantiene lo storico e mette i documenti prima della domanda", () => {
    const messages = buildMessages({
      question: "Quanto vale il preventivo a?",
      chunks: [chunk("a")],
      memories: [memory],
      history: [
        { role: "user", content: "Ciao" },
        { role: "assistant", content: "Dimmi pure." },
      ],
    });

    expect(messages).toHaveLength(3);
    const last = messages[2];
    expect(last?.role).toBe("user");

    const content = last?.content as Anthropic.Beta.BetaContentBlockParam[];
    expect(content[0]?.type).toBe("document");
    expect(content[1]?.type).toBe("text");
    const question = content[content.length - 1];
    expect(question?.type === "text" && question.text).toContain("Quanto vale il preventivo a?");
  });

  it("avvisa il modello quando il contesto è vuoto", () => {
    const messages = buildMessages({ question: "Chi è il cliente X?", chunks: [], memories: [] });
    const content = messages[0]?.content as Anthropic.Beta.BetaContentBlockParam[];
    const block = content[0];
    expect(block?.type === "text" && block.text).toContain("Nessun documento pertinente");
  });
});

describe("buildMemoryBlock", () => {
  it("restituisce null senza ricordi", () => {
    expect(buildMemoryBlock([])).toBeNull();
  });

  it("marca i ricordi fissati", () => {
    const block = buildMemoryBlock([memory]);
    expect(block?.text).toContain("(fissato)");
    expect(block?.text).toContain("60 giorni fine mese");
  });
});

describe("mapCitations", () => {
  const chunks = [chunk("a"), chunk("b")];

  it("riporta la citazione all'entità di origine tramite document_index", () => {
    const citations = mapCitations(
      [
        {
          type: "char_location",
          cited_text: "Totale del preventivo b: € 1.000,00",
          document_index: 1,
          document_title: "Preventivo b",
          file_id: null,
          start_char_index: 0,
          end_char_index: 10,
        },
      ],
      chunks,
    );

    expect(citations).toHaveLength(1);
    expect(citations[0]?.documentId).toBe("doc-b");
    expect(citations[0]?.sourceType).toBe("quote");
  });

  it("ignora gli indici fuori range e i duplicati", () => {
    const citation = {
      type: "char_location" as const,
      cited_text: "Totale",
      document_index: 0,
      document_title: "Preventivo a",
      file_id: null,
      start_char_index: 0,
      end_char_index: 6,
    };

    const citations = mapCitations(
      [citation, citation, { ...citation, document_index: 99 }],
      chunks,
    );
    expect(citations).toHaveLength(1);
  });
});

describe("memoria a lungo termine", () => {
  it("riconosce due formulazioni dello stesso fatto", () => {
    const similarity = textSimilarity(
      "Bianchi Impianti paga a 60 giorni fine mese",
      "Il cliente Bianchi Impianti paga a 60 giorni fine mese",
    );
    expect(similarity).toBeGreaterThan(0.75);
  });

  it("scarta i candidati già presenti nel memoriale", () => {
    const fresh = filterNewMemories(
      [
        {
          content: "Bianchi Impianti paga a 60 giorni fine mese",
          kind: "preference",
          importance: 4,
          confidence: 0.9,
        },
        {
          content: "Il nuovo listino entra in vigore a gennaio 2027",
          kind: "decision",
          importance: 5,
          confidence: 0.8,
        },
      ],
      [{ content: "Bianchi Impianti paga a 60 giorni fine mese." }],
    );

    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.content).toContain("listino");
  });
});
