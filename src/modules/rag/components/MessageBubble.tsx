"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp, Quote as QuoteIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RAG_SOURCE_LABELS } from "@/types/rag";
import type { RagCitation, RagMessageRole } from "@/types/rag";
import { rateMessageAction } from "../actions";

export type ChatMessage = {
  id: string | null;
  role: RagMessageRole;
  content: string;
  citations: RagCitation[];
  /** Il testo è ancora in arrivo dallo stream. */
  pending?: boolean;
};

export function MessageBubble({ message }: { message: ChatMessage }) {
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const isUser = message.role === "user";

  async function rate(rating: 1 | -1) {
    if (!message.id) return;
    setRated(rating);
    const result = await rateMessageAction({ messageId: message.id, rating });
    if (!result.ok) {
      setRated(null);
      toast.error(result.error);
    }
  }

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(46rem,90%)] rounded-lg px-4 py-3 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          {message.content}
          {message.pending && <span className="ml-1 animate-pulse">▍</span>}
        </p>

        {!isUser && message.citations.length > 0 && (
          <CitationList citations={message.citations} />
        )}

        {!isUser && !message.pending && message.id && (
          <div className="mt-3 flex items-center gap-1">
            <span className="text-muted-foreground mr-1 text-xs">Utile?</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("size-7", rated === 1 && "text-emerald-600")}
              aria-label="Risposta utile"
              onClick={() => rate(1)}
            >
              <ThumbsUp className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("size-7", rated === -1 && "text-destructive")}
              aria-label="Risposta non utile"
              onClick={() => rate(-1)}
            >
              <ThumbsDown className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Le fonti citate, raggruppate per documento di origine. */
function CitationList({ citations }: { citations: RagCitation[] }) {
  const [open, setOpen] = useState(false);

  const grouped = new Map<string, RagCitation[]>();
  for (const citation of citations) {
    const list = grouped.get(citation.documentId) ?? [];
    list.push(citation);
    grouped.set(citation.documentId, list);
  }

  return (
    <div className="border-border/60 mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium"
      >
        <QuoteIcon className="size-3.5" />
        {grouped.size} {grouped.size === 1 ? "fonte citata" : "fonti citate"}
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {[...grouped.entries()].map(([documentId, group]) => {
            const first = group[0];
            if (!first) return null;
            return (
              <li key={documentId} className="bg-background/60 rounded-md p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {RAG_SOURCE_LABELS[first.sourceType] ?? first.sourceType}
                  </Badge>
                  <span className="text-xs font-medium">{first.title}</span>
                </div>
                {group.map((citation, index) => (
                  <p
                    key={`${documentId}-${index}`}
                    className="text-muted-foreground mt-1 border-l-2 pl-2 text-xs italic"
                  >
                    «{citation.citedText}»
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
