"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RAG_SOURCE_LABELS, RAG_SOURCE_TYPES } from "@/types/rag";
import type { RagSourceType, RetrievalResult } from "@/types/rag";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

/** Eventi emessi da `POST /{slug}/memoria/ask`. */
type AskEvent =
  | { type: "retrieval"; retrieval: RetrievalResult }
  | { type: "conversation"; conversationId: string }
  | { type: "text"; delta: string }
  | {
      type: "done";
      answer: { text: string; citations: ChatMessage["citations"] };
      messageId: string | null;
      savedMemories: number;
    }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "Quali trattative sono aperte e per quale valore?",
  "Che condizioni di pagamento abbiamo concordato con i clienti principali?",
  "Riassumi le ultime interazioni con il cliente più importante.",
  "Quali preventivi scadono nelle prossime settimane?",
];

export function ChatPanel({
  tenantSlug,
  initialMessages,
  initialConversationId,
  demo,
}: {
  tenantSlug: string;
  initialMessages: ChatMessage[];
  initialConversationId: string | null;
  demo: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [sources, setSources] = useState<RagSourceType[]>([]);
  const [retrieval, setRetrieval] = useState<RetrievalResult | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function toggleSource(source: RagSourceType) {
    setSources((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source],
    );
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setQuestion("");
    setPending(true);
    setRetrieval(null);
    setMessages((current) => [
      ...current,
      { id: null, role: "user", content: trimmed, citations: [] },
      { id: null, role: "assistant", content: "", citations: [], pending: true },
    ]);

    try {
      const response = await fetch(`/${tenantSlug}/memoria/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          conversationId,
          sourceTypes: sources.length > 0 ? sources : undefined,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "La memoria aziendale non ha risposto.");
      }

      await consumeStream(response.body, (event) => {
        if (event.type === "retrieval") setRetrieval(event.retrieval);
        if (event.type === "conversation") setConversationId(event.conversationId);
        if (event.type === "text") appendDelta(setMessages, event.delta);
        if (event.type === "done") {
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                id: event.messageId,
                content: event.answer.text || last.content,
                citations: event.answer.citations ?? [],
                pending: false,
              };
            }
            return next;
          });
          if (event.savedMemories > 0) {
            toast.success(
              event.savedMemories === 1
                ? "1 nuovo ricordo aggiunto al memoriale"
                : `${event.savedMemories} nuovi ricordi aggiunti al memoriale`,
            );
            router.refresh();
          }
        }
        if (event.type === "error") throw new Error(event.message);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore imprevisto durante la risposta.";
      toast.error(message);
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.pending) next.pop();
        return next;
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && <EmptyState demo={demo} onPick={send} />}
        {messages.map((message, index) => (
          <MessageBubble key={message.id ?? `msg-${index}`} message={message} />
        ))}
        <div ref={endRef} />
      </div>

      {retrieval && (
        <p className="text-muted-foreground text-xs">
          {retrieval.chunks.length}{" "}
          {retrieval.chunks.length === 1 ? "estratto recuperato" : "estratti recuperati"}
          {retrieval.memories.length > 0 && ` · ${retrieval.memories.length} ricordi richiamati`}
          {retrieval.durationMs > 0 && ` · ${retrieval.durationMs} ms`}
          {retrieval.lexicalOnly && " · ricerca solo testuale (embedding non configurati)"}
        </p>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {RAG_SOURCE_TYPES.map((source) => {
            const active = sources.includes(source);
            return (
              <button
                key={source}
                type="button"
                onClick={() => toggleSource(source)}
                aria-pressed={active}
                className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
              >
                <Badge variant={active ? "default" : "secondary"} className="cursor-pointer text-[10px]">
                  {RAG_SOURCE_LABELS[source]}
                </Badge>
              </button>
            );
          })}
          {sources.length > 0 && (
            <button
              type="button"
              onClick={() => setSources([])}
              className="text-muted-foreground hover:text-foreground text-[11px] underline"
            >
              azzera filtri
            </button>
          )}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(question);
          }}
        >
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Chiedi qualcosa alla memoria della tua azienda…"
            className="min-h-16 resize-none"
            disabled={pending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send(question);
              }
            }}
          />
          <Button type="submit" disabled={pending || question.trim().length < 3}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizontal className="size-4" />
            )}
            Chiedi
          </Button>
        </form>
        <p className="text-muted-foreground text-[11px]">
          ⌘/Ctrl + Invio per inviare. Le risposte citano sempre i documenti da cui provengono.
        </p>
      </div>
    </div>
  );
}

function EmptyState({ demo, onPick }: { demo: boolean; onPick: (question: string) => void }) {
  return (
    <div className="text-muted-foreground space-y-4 py-10 text-center text-sm">
      <Sparkles className="mx-auto size-8 opacity-60" />
      <div>
        <p className="text-foreground font-medium">Interroga la memoria della tua azienda</p>
        <p className="mt-1">
          Clienti, lead, trattative, preventivi, attività e note: tutto ciò che è in Tutto.Azienda
          è consultabile in linguaggio naturale.
        </p>
        {demo && (
          <p className="mt-2">
            Modalità demo: le risposte usano un piccolo archivio di esempio, non dati reali.
          </p>
        )}
      </div>
      <div className="mx-auto flex max-w-xl flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal py-1.5 text-left text-xs"
            onClick={() => onPick(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Aggiunge un delta di testo all'ultimo messaggio dell'assistente. */
function appendDelta(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  delta: string,
) {
  setMessages((current) => {
    const next = [...current];
    const last = next[next.length - 1];
    if (last && last.role === "assistant") {
      next[next.length - 1] = { ...last, content: last.content + delta };
    }
    return next;
  });
}

/** Legge il flusso SSE riga per riga e consegna gli eventi già decodificati. */
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AskEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as AskEvent);
      } catch {
        // Frammento non ancora completo: verrà ricomposto al giro successivo.
      }
    }
  }
}
