"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pin, PinOff, Plus, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RAG_MEMORY_KINDS } from "@/types/rag";
import type { RagMemoryKind, RagMemoryRow } from "@/types/rag";
import { createMemoryAction, deleteMemoryAction, pinMemoryAction } from "../actions";

const KIND_LABELS: Record<RagMemoryKind, string> = {
  fact: "Fatto",
  preference: "Preferenza",
  decision: "Decisione",
  event: "Evento",
  metric: "Numero",
  relationship: "Relazione",
};

export function MemoryPanel({
  memories,
  readOnly,
}: {
  memories: RagMemoryRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<RagMemoryKind>("fact");
  const [importance, setImportance] = useState("3");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createMemoryAction({
        content,
        kind,
        importance: Number(importance),
        pinned: false,
      });
      if (result.ok) {
        toast.success("Ricordo aggiunto al memoriale");
        setContent("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function togglePin(memory: RagMemoryRow) {
    startTransition(async () => {
      const result = await pinMemoryAction(memory.id, !memory.pinned);
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  }

  function remove(memory: RagMemoryRow) {
    startTransition(async () => {
      const result = await deleteMemoryAction(memory.id);
      if (result.ok) {
        toast.success("Ricordo eliminato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Memoriale</CardTitle>
          <CardDescription>
            Fatti stabili che il sistema ricorda oltre la singola conversazione.
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={readOnly}
        >
          <Plus className="size-4" />
          Aggiungi
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {memories.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nessun ricordo salvato. Vengono estratti automaticamente dalle conversazioni, oppure
            puoi aggiungerli a mano.
          </p>
        )}

        {memories.map((memory) => (
          <div key={memory.id} className="bg-muted/40 rounded-md p-3">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {KIND_LABELS[memory.kind] ?? memory.kind}
              </Badge>
              <span className="text-muted-foreground text-[11px]">
                importanza {memory.importance}/5
              </span>
              {memory.pinned && (
                <Badge className="text-[10px]">
                  <Pin className="mr-1 size-3" />
                  fissato
                </Badge>
              )}
              <span className="ml-auto flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={memory.pinned ? "Togli dai fissati" : "Fissa il ricordo"}
                  disabled={readOnly || pending}
                  onClick={() => togglePin(memory)}
                >
                  {memory.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-7"
                  aria-label="Elimina il ricordo"
                  disabled={readOnly || pending}
                  onClick={() => remove(memory)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </div>
            <p className="text-sm">{memory.content}</p>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo ricordo</DialogTitle>
            <DialogDescription>
              Scrivi una frase autosufficiente: dovrà avere senso anche fra sei mesi, senza il
              contesto di oggi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="memory-content">Contenuto</Label>
              <Textarea
                id="memory-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Es. Bianchi Impianti paga a 60 giorni fine mese e non accetta acconti oltre il 30%."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="memory-kind">Tipo</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as RagMemoryKind)}>
                  <SelectTrigger id="memory-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RAG_MEMORY_KINDS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {KIND_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="memory-importance">Importanza</Label>
                <Select value={importance} onValueChange={setImportance}>
                  <SelectTrigger id="memory-importance">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "4", "5"].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}/5
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button type="button" onClick={submit} disabled={pending || content.trim().length < 10}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
