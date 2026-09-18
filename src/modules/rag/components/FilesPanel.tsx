"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  RotateCw,
  Trash2,
  Upload,
} from "lucide-react";
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
import type { RagFileRow } from "@/types/rag";
import {
  deleteFileAction,
  fileDownloadUrlAction,
  retryFileExtractionAction,
  uploadFileAction,
} from "../actions";

const ACCEPT = ".pdf,.docx,.txt,.md,.csv";

/** Allegati: contratti, capitolati, schede tecniche. Il testo entra nell'indice. */
export function FilesPanel({ files, readOnly }: { files: RagFileRow[]; readOnly: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadFileAction(formData);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.file.extraction_status === "done") {
      toast.success(`«${result.file.file_name}» indicizzato`);
    } else {
      // Il file è salvato comunque: si dice perché non è interrogabile.
      toast.warning(
        result.file.extraction_error ??
          "File caricato, ma il testo non è stato estratto: non è ancora interrogabile.",
      );
    }
    router.refresh();
  }

  function retry(file: RagFileRow) {
    startTransition(async () => {
      const result = await retryFileExtractionAction(file.id);
      if (result.ok) {
        toast.success("Testo estratto e indicizzato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(file: RagFileRow) {
    startTransition(async () => {
      const result = await deleteFileAction(file.id);
      if (result.ok) {
        toast.success("Allegato eliminato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  async function download(file: RagFileRow) {
    const result = await fileDownloadUrlAction(file.id);
    if (!result.ok || !result.url) {
      toast.error(result.ok ? "Link non disponibile" : result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Allegati
          </CardTitle>
          <CardDescription>
            PDF, DOCX e testo: il contenuto diventa parte della memoria.
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={readOnly || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Carica
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        {files.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nessun allegato. Carica contratti, capitolati o schede tecniche: le risposte potranno
            citarli riga per riga.
          </p>
        )}

        {files.map((file) => (
          <div key={file.id} className="bg-muted/40 rounded-md p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{file.title ?? file.file_name}</p>
                <p className="text-muted-foreground text-[11px]">
                  {formatDate(file.created_at)} · {(file.size_bytes / 1024).toFixed(0)} KB
                  {file.page_count ? ` · ${file.page_count} pagine` : ""}
                </p>
              </div>
              <StatusBadge status={file.extraction_status} />
            </div>

            {file.extraction_error && (
              <p className="text-muted-foreground mt-1.5 flex items-start gap-1 text-[11px]">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                {file.extraction_error}
              </p>
            )}

            <div className="mt-2 flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => void download(file)}
                disabled={readOnly}
              >
                <Download className="size-3.5" />
                Scarica
              </Button>
              {file.extraction_status !== "done" && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => retry(file)}
                  disabled={readOnly || pending}
                >
                  <RotateCw className="size-3.5" />
                  Riprova
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive h-7 px-2 text-xs"
                onClick={() => remove(file)}
                disabled={readOnly || pending}
              >
                <Trash2 className="size-3.5" />
                Elimina
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: RagFileRow["extraction_status"] }) {
  const labels: Record<RagFileRow["extraction_status"], string> = {
    done: "indicizzato",
    pending: "in attesa",
    failed: "errore",
    unsupported: "non leggibile",
  };
  return (
    <Badge variant={status === "done" ? "default" : "secondary"} className="shrink-0 text-[10px]">
      {labels[status]}
    </Badge>
  );
}
