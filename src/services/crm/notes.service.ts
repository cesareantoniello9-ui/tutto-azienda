import type {
  Note,
  NoteInsert,
  NoteUpdate,
  CrmRelationKind,
  UUID,
  ListParams,
  PaginatedResult,
} from "@/types/crm";
import { crmClient, currentCompanyId, CrmError, sanitizeSearch } from "./base";

/** Filtri per le note: ricerca nel testo + collegamento a un'entità. */
export interface NoteFilters {
  relatedTo?: { kind: CrmRelationKind; id: UUID };
}

export const notesService = {
  async create(input: NoteInsert): Promise<Note> {
    const supabase = await crmClient();
    const company_id = await currentCompanyId();
    const { data, error } = await supabase
      .from("notes")
      .insert({ ...input, company_id })
      .select()
      .single();
    if (error) throw new CrmError(`Creazione nota non riuscita: ${error.message}`, error.code);
    return data;
  },

  async update(id: string, input: NoteUpdate): Promise<Note> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("notes")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new CrmError(`Aggiornamento nota non riuscito: ${error.message}`, error.code);
    return data;
  },

  async delete(id: string): Promise<void> {
    const supabase = await crmClient();
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) throw new CrmError(`Eliminazione nota non riuscita: ${error.message}`, error.code);
  },

  async findById(id: string): Promise<Note | null> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmError(`Lettura nota non riuscita: ${error.message}`, error.code);
    return data;
  },

  async findAll(params: ListParams<NoteFilters> = {}): Promise<PaginatedResult<Note>> {
    const supabase = await crmClient();
    const { search, filters, page = 1, pageSize = 20, sortBy = "created_at", sortDir = "desc" } = params;

    let query = supabase.from("notes").select("*", { count: "exact" });

    if (search) {
      const s = sanitizeSearch(search);
      if (s) query = query.ilike("body", `%${s}%`);
    }
    if (filters?.relatedTo) {
      const column = `${filters.relatedTo.kind}_id` as "client_id" | "lead_id" | "opportunity_id";
      query = query.eq(column, filters.relatedTo.id);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(from, from + pageSize - 1);

    if (error) throw new CrmError(`Elenco note non riuscito: ${error.message}`, error.code);
    return { rows: data ?? [], total: count ?? 0, page, pageSize };
  },
};
