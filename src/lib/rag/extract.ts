/**
 * Estrazione del testo dagli allegati.
 *
 * PDF via `unpdf` (PDF.js senza dipendenze native), DOCX via `mammoth`, testo
 * semplice così com'è. Le librerie sono importate in modo dinamico: chi non
 * carica allegati non se le porta nel bundle.
 *
 * Un PDF scansionato non contiene testo: qui viene riconosciuto e marcato
 * `unsupported`, invece di finire nell'indice come documento vuoto (servirebbe
 * un OCR, che è una scelta a parte).
 */
import { MAX_FILE_TEXT_CHARS } from "./config";
import { normalizeText } from "./text";

export type ExtractionResult = {
  status: "done" | "unsupported" | "failed";
  text: string;
  pageCount: number | null;
  error?: string;
};

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC = "application/msword";

/** Tipo MIME dedotto dall'estensione quando il browser non lo dichiara. */
export function guessMimeType(fileName: string, declared?: string | null): string {
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  switch (extension) {
    case "pdf":
      return PDF;
    case "docx":
      return DOCX;
    case "doc":
      return DOC;
    case "md":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "txt":
      return "text/plain";
    default:
      return declared ?? "application/octet-stream";
  }
}

export function isSupportedMimeType(mimeType: string): boolean {
  return (
    mimeType === PDF ||
    mimeType === DOCX ||
    mimeType.startsWith("text/") ||
    mimeType === "application/json"
  );
}

/** Estrae il testo da un allegato. Non lancia: l'esito è sempre nel risultato. */
export async function extractText(
  data: ArrayBuffer | Uint8Array,
  mimeType: string,
  fileName = "",
): Promise<ExtractionResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const type = guessMimeType(fileName, mimeType);

  try {
    if (type === PDF) return await extractPdf(bytes);
    if (type === DOCX) return await extractDocx(bytes);
    if (type === DOC) {
      return {
        status: "unsupported",
        text: "",
        pageCount: null,
        error: "Formato .doc legacy non supportato: converti il file in .docx o PDF.",
      };
    }
    if (type.startsWith("text/") || type === "application/json") {
      const text = normalizeText(new TextDecoder("utf-8").decode(bytes));
      return finish(text, null);
    }

    return {
      status: "unsupported",
      text: "",
      pageCount: null,
      error: `Tipo di file non supportato: ${type}.`,
    };
  } catch (error) {
    return {
      status: "failed",
      text: "",
      pageCount: null,
      error: error instanceof Error ? error.message : "Estrazione del testo non riuscita.",
    };
  }
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const { extractText: extractPdfText } = await import("unpdf");
  const { text, totalPages } = await extractPdfText(bytes, { mergePages: true });
  const normalized = normalizeText(text);

  if (normalized.length < 20) {
    return {
      status: "unsupported",
      text: "",
      pageCount: totalPages,
      error:
        "Il PDF non contiene testo selezionabile (probabile scansione): servirebbe un OCR.",
    };
  }

  return finish(normalized, totalPages);
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  // mammoth lavora su Buffer: in ambiente Node è sempre disponibile.
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const normalized = normalizeText(result.value);

  if (normalized.length < 5) {
    return {
      status: "unsupported",
      text: "",
      pageCount: null,
      error: "Il documento non contiene testo.",
    };
  }

  return finish(normalized, null);
}

function finish(text: string, pageCount: number | null): ExtractionResult {
  if (!text.trim()) {
    return { status: "unsupported", text: "", pageCount, error: "Il file non contiene testo." };
  }
  // Un allegato enorme non deve far esplodere l'indicizzazione: si tronca e lo
  // si dichiara nel testo, così la risposta non sembra completa quando non lo è.
  if (text.length > MAX_FILE_TEXT_CHARS) {
    return {
      status: "done",
      pageCount,
      text: `${text.slice(0, MAX_FILE_TEXT_CHARS)}\n\n[Testo troncato: il documento supera ${Math.round(
        MAX_FILE_TEXT_CHARS / 1000,
      )}k caratteri.]`,
    };
  }
  return { status: "done", text, pageCount };
}
