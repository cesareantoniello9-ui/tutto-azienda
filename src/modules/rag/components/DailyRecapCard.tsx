"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2, RefreshCw } from "lucide-react";
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
import { formatDate } from "@/lib/utils/format";
import type { RagDailyRecapRow } from "@/types/rag";
import { generateRecapAction } from "../actions";

/**
 * «Cosa abbiamo fatto oggi»: il riepilogo di fine giornata, con la possibilità
 * di rigenerarlo e di rileggere i giorni precedenti.
 */
export function DailyRecapCard({
  recaps,
  readOnly,
}: {
  recaps: RagDailyRecapRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [pending, startTransition] = useTransition();

  const recap = recaps[selected] ?? null;

  function generate() {
    startTransition(async () => {
      const result = await generateRecapAction({ force: true });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (!result.recap) {
        toast.info("Oggi non risulta ancora nessuna attività da riepilogare.");
        return;
      }
      toast.success("Riepilogo della giornata aggiornato");
      setSelected(0);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="size-4" />
            La giornata
          </CardTitle>
          <CardDescription>
            {recap
              ? formatDate(recap.recap_date)
              : "Nessun riepilogo ancora generato per questa azienda."}
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={readOnly || pending}
          onClick={generate}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Genera
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {recaps.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {recaps.slice(0, 7).map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(index)}
                aria-pressed={index === selected}
                className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
              >
                <Badge
                  variant={index === selected ? "default" : "secondary"}
                  className="cursor-pointer text-[10px]"
                >
                  {formatDate(item.recap_date).slice(0, 5)}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {!recap && (
          <p className="text-muted-foreground text-sm">
            Il riepilogo viene scritto ogni sera dal cron e raccoglie clienti, trattative,
            preventivi, attività ed email della giornata. Puoi generarlo anche ora.
          </p>
        )}

        {recap && (
          <>
            {recap.highlights.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {recap.highlights.map((highlight) => (
                  <li key={highlight}>
                    <Badge variant="secondary" className="text-[10px]">
                      {highlight}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <p className="whitespace-pre-wrap text-sm">{recap.summary}</p>

            <p className="text-muted-foreground text-[11px]">
              {recap.generated_by === "deterministic"
                ? "Riepilogo compilato dai dati (modello non configurato)."
                : `Sintesi generata con ${recap.generated_by}.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
