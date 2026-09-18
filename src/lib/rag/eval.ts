/**
 * Valutazione automatica della qualità del RAG.
 *
 * Tre domande, tre metriche:
 *   - il documento giusto è stato recuperato?          → recall@k
 *   - era in cima o in fondo?                          → MRR
 *   - la risposta era ancorata alle fonti recuperate?  → grounded ratio
 * più il controllo che i dati attesi (importi, scadenze) compaiano davvero.
 *
 * Tutte funzioni pure: la stessa modifica al motore si misura invece di
 * giudicarla a sensazione, e la misura si può rieseguire in CI.
 */
import type {
  EvalCaseOutcome,
  EvalMetrics,
  ExpectedSource,
  RagCitation,
  RagSourceType,
} from "@/types/rag";

export type RetrievedRef = {
  sourceType: RagSourceType;
  sourceId: string;
  title: string;
};

/** Normalizza per il confronto: minuscole, senza accenti, spazi compattati. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Variante sole cifre: «29.280,00» e «29280» devono coincidere. */
function digitsOnly(text: string): string {
  return text.replace(/[^\d]/g, "");
}

/** Una parola chiave attesa è presente nella risposta? */
export function containsKeyword(answer: string, keyword: string): boolean {
  const haystack = normalizeForMatch(answer);
  const needle = normalizeForMatch(keyword);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;

  // Numeri: si confrontano le sole cifre, così il formato non conta.
  const needleDigits = digitsOnly(needle);
  if (needleDigits.length >= 3) {
    return digitsOnly(haystack).includes(needleDigits);
  }
  return false;
}

function matches(expected: ExpectedSource, retrieved: RetrievedRef): boolean {
  if (expected.sourceType !== retrieved.sourceType) return false;
  if (!expected.sourceId) return true;
  return expected.sourceId === retrieved.sourceId;
}

/** Esito di un singolo caso di valutazione. */
export function scoreCase(params: {
  question: string;
  caseId?: string | null;
  expectedSources: ExpectedSource[];
  expectedKeywords: string[];
  retrieved: RetrievedRef[];
  answer?: string;
  citations?: RagCitation[];
}): EvalCaseOutcome {
  const { expectedSources, expectedKeywords, retrieved } = params;

  let rank: number | null = null;
  if (expectedSources.length > 0) {
    const position = retrieved.findIndex((item) =>
      expectedSources.some((expected) => matches(expected, item)),
    );
    rank = position >= 0 ? position + 1 : null;
  }

  const answer = params.answer ?? "";
  // `citations` assente = generazione non eseguita (giro di solo recupero);
  // `citations` vuoto = il modello ha risposto senza citare nulla.
  const generated = params.citations !== undefined;
  const citations = params.citations ?? [];

  // Una risposta è "ancorata" se cita almeno una fonte e nessuna citazione
  // punta a un documento che non era nel contesto recuperato.
  const retrievedIds = new Set(retrieved.map((item) => item.sourceId));
  const grounded =
    citations.length > 0 && citations.every((citation) => retrievedIds.has(citation.sourceId));

  const keywordsFound = expectedKeywords.filter((keyword) => containsKeyword(answer, keyword));
  const keywordsMissing = expectedKeywords.filter((keyword) => !containsKeyword(answer, keyword));

  return {
    question: params.question,
    caseId: params.caseId ?? null,
    hit: expectedSources.length === 0 ? retrieved.length > 0 : rank !== null,
    rank,
    generated,
    grounded,
    keywordsFound,
    keywordsMissing,
    answer: answer || undefined,
    citations: citations.length > 0 ? citations : undefined,
    retrieved,
  };
}

/**
 * Aggrega gli esiti. Recall e MRR contano solo i casi che dichiarano un
 * documento atteso: una domanda senza attese non può abbassare la metrica.
 */
export function aggregate(outcomes: EvalCaseOutcome[]): EvalMetrics {
  const withExpectation = outcomes.filter((outcome) => outcome.rank !== null || outcome.hit === false);
  const rankable = outcomes.filter((outcome) => outcome.rank !== null);

  const recallBase = withExpectation.length;
  const recall = recallBase > 0 ? rankable.length / recallBase : 0;

  const mrr =
    recallBase > 0
      ? outcomes.reduce((sum, outcome) => sum + (outcome.rank ? 1 / outcome.rank : 0), 0) /
        recallBase
      : 0;

  const answered = outcomes.filter((outcome) => outcome.generated);
  const grounded =
    answered.length > 0
      ? answered.filter((outcome) => outcome.grounded).length / answered.length
      : 0;

  const withKeywords = outcomes.filter(
    (outcome) => outcome.keywordsFound.length + outcome.keywordsMissing.length > 0,
  );
  const keywordRatio =
    withKeywords.length > 0
      ? withKeywords.reduce(
          (sum, outcome) =>
            sum +
            outcome.keywordsFound.length /
              (outcome.keywordsFound.length + outcome.keywordsMissing.length),
          0,
        ) / withKeywords.length
      : 0;

  return {
    cases: outcomes.length,
    generatedCases: answered.length,
    recallAtK: round(recall),
    mrr: round(mrr),
    groundedRatio: round(grounded),
    keywordRatio: round(keywordRatio),
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Riga di riepilogo leggibile a terminale. */
export function formatMetrics(metrics: EvalMetrics): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return [
    `casi: ${metrics.cases}`,
    `recall@k: ${pct(metrics.recallAtK)}`,
    `MRR: ${metrics.mrr.toFixed(3)}`,
    // Senza generazione l'ancoraggio non è misurabile: dirlo è meglio di uno 0%.
    `risposte ancorate: ${
      metrics.generatedCases > 0 ? pct(metrics.groundedRatio) : "n/d (solo recupero)"
    }`,
    `dati attesi presenti: ${pct(metrics.keywordRatio)}`,
  ].join(" · ");
}
