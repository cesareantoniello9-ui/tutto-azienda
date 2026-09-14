import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/rag/chunking";
import { estimateTokens, normalizeText, truncate, labeledLines } from "@/lib/rag/text";

describe("chunkText", () => {
  it("mantiene un documento breve in un solo chunk", () => {
    const chunks = chunkText("Cliente Rossi S.r.l., settore edilizia, referente Mario.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.index).toBe(0);
    expect(chunks[0]?.tokenEstimate).toBeGreaterThan(0);
  });

  it("spezza un documento lungo in più chunk numerati progressivamente", () => {
    const paragraph = "Nota commerciale sul cliente con dettagli operativi rilevanti. ";
    const chunks = chunkText(paragraph.repeat(120));

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => expect(chunk.index).toBe(i));
  });

  it("sovrappone i chunk consecutivi per non perdere il contesto sul confine", () => {
    const blocks = Array.from(
      { length: 12 },
      (_, i) => `## Sezione ${i}\n${"testo di riempimento della sezione. ".repeat(20)}`,
    ).join("\n\n");

    const chunks = chunkText(blocks, { targetChars: 600, overlapChars: 120 });
    expect(chunks.length).toBeGreaterThan(1);

    const first = chunks[0]!;
    const second = chunks[1]!;
    const tail = first.content.slice(-60).trim();
    expect(second.content).toContain(tail.slice(0, 30));
  });

  it("non produce chunk vuoti anche con input rumoroso", () => {
    const chunks = chunkText("\n\n\n   \n\n   testo    utile   \n\n\n");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("testo utile");
  });

  it("restituisce una lista vuota per un testo vuoto", () => {
    expect(chunkText("   \n  ")).toEqual([]);
  });
});

describe("utility testuali", () => {
  it("normalizza gli spazi mantenendo i paragrafi", () => {
    expect(normalizeText("a  b\r\n\r\n\r\n c ")).toBe("a b\n\nc");
  });

  it("stima i token in modo monotono rispetto alla lunghezza", () => {
    expect(estimateTokens("ciao")).toBeLessThan(estimateTokens("ciao ciao ciao ciao"));
  });

  it("tronca senza spezzare le parole", () => {
    const result = truncate("Bianchi Impianti Società a responsabilità limitata", 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
  });

  it("salta i campi vuoti nelle righe etichettate", () => {
    const lines = labeledLines([
      ["Nome", "Rossi"],
      ["Email", null],
      ["Telefono", "  "],
      ["Città", "Milano"],
    ]);
    expect(lines).toBe("Nome: Rossi\nCittà: Milano");
  });
});
