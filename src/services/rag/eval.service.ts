/**
 * Valutazione automatica: esegue i casi di prova contro il motore reale.
 *
 * Ogni giro registra recall@k, MRR, quota di risposte ancorate alle fonti e
 * presenza dei dati attesi. Confrontando due giri si vede se una modifica al
 * recupero (o al prompt) ha migliorato davvero qualcosa — invece di fidarsi
 * dell'impressione sulle tre domande provate a mano.
 *
 * Due modalità:
 *   retrieval → solo recupero, nessuna chiamata al modello (veloce, gratis)
 *   answer    → recupero + generazione, misura anche l'ancoraggio alle fonti
 */
import type {
  EvalCaseOutcome,
  EvalRunReport,
  ExpectedSource,
  RagEvalCaseRow,
} from "@/types/rag";
import { aggregate, scoreCase, type RetrievedRef } from "@/lib/rag/eval";
import { currentCompanyId, isMissingSchema, ragClient, toRagError } from "./base";
import { ragAskService } from "./ask.service";
import { ragSearchService } from "./search.service";
import { ragSettingsService } from "./settings.service";

export type EvalMode = "retrieval" | "answer";

export type EvalCaseInput = {
  id?: string | null;
  question: string;
  expectedSources?: ExpectedSource[];
  expectedKeywords?: string[];
};

export const ragEvalService = {
  async listCases(): Promise<RagEvalCaseRow[]> {
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_eval_cases")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura dei casi di valutazione non riuscita", error);
    }
    return (data ?? []) as RagEvalCaseRow[];
  },

  async createCase(input: {
    question: string;
    expectedSources?: ExpectedSource[];
    expectedKeywords?: string[];
    note?: string | null;
  }): Promise<RagEvalCaseRow> {
    const companyId = await currentCompanyId();
    const supabase = await ragClient();

    const { data, error } = await supabase
      .from("rag_eval_cases")
      .insert({
        company_id: companyId,
        question: input.question.trim(),
        expected_sources: input.expectedSources ?? [],
        expected_keywords: input.expectedKeywords ?? [],
        note: input.note ?? null,
      })
      .select("*")
      .single();

    if (error) throw toRagError("Salvataggio del caso non riuscito", error);
    return data as RagEvalCaseRow;
  },

  async removeCase(id: string): Promise<void> {
    const supabase = await ragClient();
    const { error } = await supabase.from("rag_eval_cases").delete().eq("id", id);
    if (error) throw toRagError("Eliminazione del caso non riuscita", error);
  },

  /** Esegue un giro di valutazione e lo archivia. */
  async run(options: { mode?: EvalMode; label?: string; cases?: EvalCaseInput[] } = {}): Promise<
    EvalRunReport
  > {
    const startedAt = Date.now();
    const mode: EvalMode = options.mode ?? "retrieval";
    const settings = await ragSettingsService.get();

    const cases: EvalCaseInput[] =
      options.cases ??
      (await this.listCases()).map((row) => ({
        id: row.id,
        question: row.question,
        expectedSources: Array.isArray(row.expected_sources) ? row.expected_sources : [],
        expectedKeywords: Array.isArray(row.expected_keywords) ? row.expected_keywords : [],
      }));

    const outcomes: EvalCaseOutcome[] = [];

    for (const testCase of cases) {
      if (mode === "answer") {
        const result = await ragAskService.answer({
          question: testCase.question,
          // Una valutazione non deve sporcare le conversazioni né la memoria.
          persist: false,
        });
        outcomes.push(
          scoreCase({
            question: testCase.question,
            caseId: testCase.id,
            expectedSources: testCase.expectedSources ?? [],
            expectedKeywords: testCase.expectedKeywords ?? [],
            retrieved: toRefs(result.retrieval?.chunks ?? []),
            answer: result.answer.text,
            citations: result.answer.citations,
          }),
        );
      } else {
        const retrieval = await ragSearchService.retrieve(testCase.question, settings);
        outcomes.push(
          scoreCase({
            question: testCase.question,
            caseId: testCase.id,
            expectedSources: testCase.expectedSources ?? [],
            expectedKeywords: testCase.expectedKeywords ?? [],
            retrieved: toRefs(retrieval.chunks),
          }),
        );
      }
    }

    const metrics = aggregate(outcomes);
    const report: EvalRunReport = {
      ...metrics,
      runId: null,
      label: options.label ?? `${mode} · ${new Date().toISOString().slice(0, 16)}`,
      outcomes,
      durationMs: Date.now() - startedAt,
    };

    report.runId = await persistRun(report, {
      mode,
      topK: settings.top_k,
      candidatePool: settings.candidate_pool,
      minSimilarity: settings.min_similarity,
      answerModel: settings.answer_model,
      embeddingModel: settings.embedding_model,
    });

    return report;
  },

  /** Ultimi giri archiviati, per vedere l'andamento nel tempo. */
  async recentRuns(limit = 10) {
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_eval_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura dei giri di valutazione non riuscita", error);
    }
    return data ?? [];
  },
};

function toRefs(
  chunks: { sourceType: RetrievedRef["sourceType"]; sourceId: string; title: string }[],
): RetrievedRef[] {
  const seen = new Set<string>();
  const refs: RetrievedRef[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.sourceId)) continue;
    seen.add(chunk.sourceId);
    refs.push({ sourceType: chunk.sourceType, sourceId: chunk.sourceId, title: chunk.title });
  }
  return refs;
}

/** Archivia il giro; se lo schema non c'è, la valutazione resta comunque utile. */
async function persistRun(
  report: EvalRunReport,
  settings: Record<string, unknown>,
): Promise<string | null> {
  try {
    const companyId = await currentCompanyId();
    const supabase = await ragClient();

    const { data, error } = await supabase
      .from("rag_eval_runs")
      .insert({
        company_id: companyId,
        label: report.label,
        cases_total: report.cases,
        recall_at_k: report.recallAtK,
        mrr: report.mrr,
        grounded_ratio: report.groundedRatio,
        keyword_ratio: report.keywordRatio,
        settings,
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) return null;
    const runId = data.id as string;

    await supabase.from("rag_eval_results").insert(
      report.outcomes.map((outcome) => ({
        company_id: companyId,
        run_id: runId,
        case_id: outcome.caseId ?? null,
        question: outcome.question,
        hit: outcome.hit,
        rank: outcome.rank,
        grounded: outcome.grounded,
        keywords_found: outcome.keywordsFound,
        keywords_missing: outcome.keywordsMissing,
        answer: outcome.answer ?? null,
        citations: outcome.citations ?? [],
        retrieved: outcome.retrieved,
      })),
    );

    return runId;
  } catch {
    return null;
  }
}
