"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GaugeCircle, Loader2, Plus, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EvalRunReport, RagEvalCaseRow } from "@/types/rag";
import { createEvalCaseAction, deleteEvalCaseAction, runEvalAction } from "../actions";

export type EvalRunSummary = {
  id: string;
  label: string | null;
  cases_total: number;
  recall_at_k: number | null;
  mrr: number | null;
  grounded_ratio: number | null;
  keyword_ratio: number | null;
  started_at: string;
};

/**
 * Qualità delle risposte: un insieme di domande con la risposta attesa, e le
 * metriche di ogni giro. Serve a sapere se una modifica al motore ha migliorato
 * qualcosa davvero, invece di giudicarlo dalle tre domande provate a mano.
 */
export function EvalPanel({
  cases,
  runs,
  readOnly,
}: {
  cases: RagEvalCaseRow[];
  runs: EvalRunSummary[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [keywords, setKeywords] = useState("");
  const [pending, startTransition] = useTransition();
  const [lastReport, setLastReport] = useState<EvalRunReport | null>(null);

  const lastRun = runs[0];

  function run(mode: "retrieval" | "answer") {
    startTransition(async () => {
      const result = await runEvalAction({ mode });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLastReport(result.report);
      toast.success(
        `Valutazione completata su ${result.report.cases} ${
          result.report.cases === 1 ? "caso" : "casi"
        }`,
      );
      router.refresh();
    });
  }

  function addCase() {
    startTransition(async () => {
      const result = await createEvalCaseAction({
        question,
        expectedSources: [],
        expectedKeywords: keywords
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      if (result.ok) {
        toast.success("Caso aggiunto");
        setQuestion("");
        setKeywords("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function removeCase(id: string) {
    startTransition(async () => {
      const result = await deleteEvalCaseAction(id);
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <GaugeCircle className="size-4" />
            Qualità delle risposte
          </CardTitle>
          <CardDescription>
            {cases.length} {cases.length === 1 ? "caso di prova" : "casi di prova"}
            {lastRun ? ` · ultimo giro ${new Date(lastRun.started_at).toLocaleDateString("it-IT")}` : ""}
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={readOnly}
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" />
          Caso
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {cases.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aggiungi le domande a cui la memoria deve saper rispondere, con i dati che devono
            comparire. Ogni modifica al motore si misura su queste.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {cases.slice(0, 8).map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{item.question}</span>
                  {item.expected_keywords.length > 0 && (
                    <span className="text-muted-foreground text-[11px]">
                      attesi: {item.expected_keywords.join(", ")}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-7 shrink-0"
                  aria-label="Elimina il caso"
                  disabled={readOnly || pending}
                  onClick={() => removeCase(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {(lastReport || lastRun) && (
          <div className="bg-muted/40 space-y-1 rounded-md p-3 text-xs">
            <Metric
              label="Documento atteso recuperato"
              value={lastReport?.recallAtK ?? lastRun?.recall_at_k}
            />
            <Metric label="Posizione media (MRR)" value={lastReport?.mrr ?? lastRun?.mrr} raw />
            {/* L'ancoraggio ha senso solo se è stata generata una risposta. */}
            {(lastReport ? lastReport.generatedCases > 0 : true) && (
              <Metric
                label="Risposte ancorate alle fonti"
                value={lastReport?.groundedRatio ?? lastRun?.grounded_ratio}
              />
            )}
            <Metric
              label="Dati attesi presenti"
              value={lastReport?.keywordRatio ?? lastRun?.keyword_ratio}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={readOnly || pending || cases.length === 0}
            onClick={() => run("retrieval")}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Misura il recupero
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={readOnly || pending || cases.length === 0}
            onClick={() => run("answer")}
          >
            Misura le risposte
          </Button>
        </div>
        <p className="text-muted-foreground text-[11px]">
          «Misura le risposte» genera una risposta per ogni caso: più lento e con un costo per
          chiamata al modello.
        </p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo caso di prova</DialogTitle>
            <DialogDescription>
              Una domanda che il team farebbe davvero, e i dati che la risposta deve contenere.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="eval-question">Domanda</Label>
              <Textarea
                id="eval-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Es. Che condizioni di pagamento abbiamo con Bianchi Impianti?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eval-keywords">Dati attesi (separati da virgola)</Label>
              <Input
                id="eval-keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="60 giorni, fine mese"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button type="button" onClick={addCase} disabled={pending || question.trim().length < 5}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Metric({
  label,
  value,
  raw,
}: {
  label: string;
  value: number | null | undefined;
  raw?: boolean;
}) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant="secondary" className="text-[10px]">
        {raw ? numeric.toFixed(3) : `${(numeric * 100).toFixed(0)}%`}
      </Badge>
    </div>
  );
}
