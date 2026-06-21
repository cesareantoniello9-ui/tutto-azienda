import { describe, it, expect } from "vitest";
import { slugify, formatCurrency, formatDate } from "@/lib/utils/format";

describe("slugify", () => {
  it("minuscolo e trattini al posto degli spazi", () => {
    expect(slugify("Rossi Costruzioni S.p.A.")).toBe("rossi-costruzioni-spa");
  });

  it("rimuove spazi iniziali/finali", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
  });

  it("collassa spazi multipli e underscore", () => {
    expect(slugify("UPPER_case   test")).toBe("upper-case-test");
  });
});

describe("formatCurrency", () => {
  it("formatta in EUR italiano (virgola decimale + simbolo €)", () => {
    // Nota: il separatore delle migliaia dipende dai dati ICU di Node;
    // verifichiamo l'invariante stabile: decimale con virgola e simbolo €.
    const out = formatCurrency(1234.5, "EUR", "it-IT");
    expect(out).toContain(",50");
    expect(out).toContain("€");
  });
});

describe("formatDate", () => {
  it("formatta come DD/MM/YYYY", () => {
    expect(formatDate(new Date(2026, 5, 20), "it-IT")).toBe("20/06/2026");
  });
});
