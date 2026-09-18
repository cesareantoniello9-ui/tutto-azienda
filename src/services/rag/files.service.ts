/**
 * Allegati: caricamento, estrazione del testo, indicizzazione.
 *
 * Il file va in Supabase Storage (bucket privato `rag-files`, percorso
 * `{company_id}/{file_id}.ext`: il primo segmento è il confine fra aziende,
 * verificato dalle policy della 00007). In tabella resta solo il testo estratto,
 * che è ciò che l'indice deve leggere.
 */
import type {
  FileExtractionStatus,
  RagFileRow,
} from "@/types/rag";
import { MAX_FILE_BYTES } from "@/lib/rag/config";
import { extractText, guessMimeType, isSupportedMimeType } from "@/lib/rag/extract";
import {
  currentCompanyId,
  isMissingSchema,
  ragAdmin,
  ragClient,
  RagError,
  toRagError,
} from "./base";

const BUCKET = "rag-files";

export type UploadInput = {
  fileName: string;
  mimeType: string;
  data: ArrayBuffer;
  title?: string | null;
  category?: string | null;
  clientId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  uploadedBy?: string | null;
};

export const ragFilesService = {
  async list(limit = 50): Promise<RagFileRow[]> {
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_files")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura degli allegati non riuscita", error);
    }
    return (data ?? []) as RagFileRow[];
  },

  /**
   * Carica un allegato ed estrae il testo nello stesso giro.
   * L'estrazione fallita non perde il file: resta in archivio con lo stato e il
   * motivo, così si può riprovare dopo (es. dopo aver aggiunto un OCR).
   */
  async upload(input: UploadInput): Promise<RagFileRow> {
    const companyId = await currentCompanyId();
    const supabase = await ragAdmin();

    if (input.data.byteLength > MAX_FILE_BYTES) {
      throw new RagError(
        `File troppo grande: ${(input.data.byteLength / 1024 / 1024).toFixed(1)} MB (massimo ${
          MAX_FILE_BYTES / 1024 / 1024
        } MB).`,
      );
    }

    const mimeType = guessMimeType(input.fileName, input.mimeType);
    const fileId = crypto.randomUUID();
    const extension = input.fileName.includes(".")
      ? input.fileName.slice(input.fileName.lastIndexOf(".") + 1).toLowerCase()
      : "bin";
    const storagePath = `${companyId}/${fileId}.${extension}`;

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, input.data, { contentType: mimeType, upsert: false });
    if (upload.error) {
      throw new RagError(`Caricamento su Storage non riuscito: ${upload.error.message}`);
    }

    let status: FileExtractionStatus = "pending";
    let text: string | null = null;
    let pageCount: number | null = null;
    let extractionError: string | null = null;

    if (isSupportedMimeType(mimeType)) {
      const result = await extractText(input.data, mimeType, input.fileName);
      status = result.status;
      text = result.text || null;
      pageCount = result.pageCount;
      extractionError = result.error ?? null;
    } else {
      status = "unsupported";
      extractionError = `Tipo di file non supportato: ${mimeType}.`;
    }

    const { data, error } = await supabase
      .from("rag_files")
      .insert({
        id: fileId,
        company_id: companyId,
        storage_path: storagePath,
        file_name: input.fileName,
        mime_type: mimeType,
        size_bytes: input.data.byteLength,
        title: input.title?.trim() || null,
        category: input.category?.trim() || null,
        client_id: input.clientId ?? null,
        lead_id: input.leadId ?? null,
        opportunity_id: input.opportunityId ?? null,
        extracted_text: text,
        extraction_status: status,
        extraction_error: extractionError,
        page_count: pageCount,
        uploaded_by: input.uploadedBy ?? null,
      })
      .select("*")
      .single();

    if (error) {
      // Il file è già su Storage: senza riga in tabella resterebbe orfano.
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw toRagError("Salvataggio dell'allegato non riuscito", error);
    }

    return data as RagFileRow;
  },

  /** Riprova l'estrazione di un allegato rimasto indietro. */
  async retryExtraction(fileId: string): Promise<RagFileRow | null> {
    const supabase = await ragAdmin();
    const { data: row, error } = await supabase
      .from("rag_files")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();
    if (error) throw toRagError("Lettura dell'allegato non riuscita", error);

    const file = (row as RagFileRow | null) ?? null;
    if (!file) return null;

    const download = await supabase.storage.from(BUCKET).download(file.storage_path);
    if (download.error || !download.data) {
      throw new RagError(
        `Download da Storage non riuscito: ${download.error?.message ?? "file assente"}`,
      );
    }

    const buffer = await download.data.arrayBuffer();
    const result = await extractText(buffer, file.mime_type, file.file_name);

    const { data: updated, error: updateError } = await supabase
      .from("rag_files")
      .update({
        extracted_text: result.text || null,
        extraction_status: result.status,
        extraction_error: result.error ?? null,
        page_count: result.pageCount,
      })
      .eq("id", fileId)
      .select("*")
      .single();

    if (updateError) throw toRagError("Aggiornamento dell'allegato non riuscito", updateError);
    return updated as RagFileRow;
  },

  async remove(fileId: string): Promise<void> {
    const supabase = await ragClient();
    const { data: row } = await supabase
      .from("rag_files")
      .select("storage_path")
      .eq("id", fileId)
      .maybeSingle();

    const { error } = await supabase.from("rag_files").delete().eq("id", fileId);
    if (error) throw toRagError("Eliminazione dell'allegato non riuscita", error);

    const path = (row as { storage_path?: string } | null)?.storage_path;
    if (path) {
      // Il file resta orfano solo se Storage fallisce: non blocca l'operazione.
      await supabase.storage.from(BUCKET).remove([path]);
    }
  },

  /** URL temporaneo per scaricare l'allegato (il bucket è privato). */
  async signedUrl(fileId: string, expiresInSeconds = 300): Promise<string | null> {
    const supabase = await ragClient();
    const { data: row } = await supabase
      .from("rag_files")
      .select("storage_path")
      .eq("id", fileId)
      .maybeSingle();

    const path = (row as { storage_path?: string } | null)?.storage_path;
    if (!path) return null;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error) return null;
    return data?.signedUrl ?? null;
  },
};
