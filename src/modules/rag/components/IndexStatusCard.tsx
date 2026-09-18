"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap, FilePlus2, Loader2, RefreshCw } from "lucide-react";
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
import { RAG_SOURCE_LABELS } from "@/types/rag";
import type { RagIndexOverviewRow } from "@/types/rag";
import { addManualDocumentAction, reindexAction } from "../actions";

export function IndexStatusCard({
  overview,
  pending,
  readOnly,
  warnings,
}: {
  overview: RagIndexOverviewRow[];
  pending: number;
  readOnly: boolean;
  warnings: string[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [docOpen, setDocOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");

  const documents = overview.reduce((sum, row) => sum + Number(row.documents ?? 0), 0);
  const chunks = overview.reduce((sum, row) => sum + Number(row.chunks ?? 0), 0);
  const stale = overview.reduce((sum, row) => sum + Number(row.stale_documents ?? 0), 0);

  function reindex(full: boolean) {
    startTransition(async () => {
      const result = await reindexAction({ full });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { report } = result;
      toast.success(
        `Indice aggiornato: ${report.indexed} documenti, ${report.chunks} chunk` +
          (report.skipped > 0 ? ` (${report.skipped} già allineati)` : "") +
          (report.errors.length > 0 ? ` · ${report.errors.length} errori` : ""),
      );
      router.refresh();
    });
  }

  function saveDocument() {
    startTransition(async () => {
      const result = await addManualDocumentAction({
        title,
        body,
        category: category || undefined,
      });
      if (result.ok) {
        toast.success("Documento indicizzato");
        setTitle("");
        setBody("");
        setCategory("");
        setDocOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseZap className="size-4" />
          Stato dell&apos;indice
        </CardTitle>
        <CardDescription>
          {documents} documenti · {chunks} chunk
          {stale > 0 && ` · ${stale} da aggiornare`}
          {pending > 0 && ` · ${pending} in coda`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        {overview.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nessun documento indicizzato. Avvia l&apos;indicizzazione per costruire la memoria a
            partire dai dati già presenti.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {overview.map((row) => (
              <li key={row.source_type} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {RAG_SOURCE_LABELS[row.source_type] ?? row.source_type}
                  </Badge>
                  {Number(row.stale_documents ?? 0) > 0 && (
                    <span className="text-muted-foreground text-[11px]">
                      {row.stale_documents} da aggiornare
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {row.documents} doc · {row.chunks} chunk
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={readOnly || busy}
            onClick={() => reindex(false)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Aggiorna indice
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={readOnly || busy}
            onClick={() => reindex(true)}
          >
            Reindicizza tutto
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={readOnly || busy}
            onClick={() => setDocOpen(true)}
          >
            <FilePlus2 className="size-4" />
            Documento interno
          </Button>
        </div>
      </CardContent>

      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi un documento interno</DialogTitle>
            <DialogDescription>
              Procedure, listini, condizioni standard, FAQ: tutto ciò che non vive nel CRM ma serve
              a rispondere.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Titolo</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Es. Procedura interna — Emissione preventivi"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-category">Categoria (facoltativa)</Label>
              <Input
                id="doc-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Es. procedure commerciali"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-body">Contenuto</Label>
              <Textarea
                id="doc-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-40"
                placeholder="Incolla qui il testo del documento…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDocOpen(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              onClick={saveDocument}
              disabled={busy || title.trim().length < 3 || body.trim().length < 20}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Indicizza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
