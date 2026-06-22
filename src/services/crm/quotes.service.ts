import type {
  Quote,
  QuoteInsert,
  QuoteUpdate,
  QuoteFilters,
  ListParams,
  PaginatedResult,
} from "@/types/crm";
import { crmClient, currentCompanyId, CrmError, sanitizeSearch } from "./base";

export const quotesService = {
  async create(input: QuoteInsert): Promise<Quote> {
    const supabase = await crmClient();
    const company_id = await currentCompanyId();
    // I totali (subtotal/tax_total/total) sono calcolati lato server dalle righe.
    const { data, error } = await supabase
      .from("quotes")
      .insert({ ...input, company_id })
      .select()
      .single();
    if (error) throw new CrmError(`Creazione preventivo non riuscita: ${error.message}`, error.code);
    return data;
  },

  async update(id: string, input: QuoteUpdate): Promise<Quote> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("quotes")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new CrmError(`Aggiornamento preventivo non riuscito: ${error.message}`, error.code);
    return data;
  },

  async delete(id: string): Promise<void> {
    const supabase = await crmClient();
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) throw new CrmError(`Eliminazione preventivo non riuscita: ${error.message}`, error.code);
  },

  async findById(id: string): Promise<Quote | null> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmError(`Lettura preventivo non riuscita: ${error.message}`, error.code);
    return data;
  },

  async findAll(params: ListParams<QuoteFilters> = {}): Promise<PaginatedResult<Quote>> {
    const supabase = await crmClient();
    const { search, filters, page = 1, pageSize = 20, sortBy = "created_at", sortDir = "desc" } = params;

    let query = supabase.from("quotes").select("*", { count: "exact" });

    if (search) {
      const s = sanitizeSearch(search);
      if (s) query = query.ilike("number", `%${s}%`);
    }
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.clientId) query = query.eq("client_id", filters.clientId);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(from, from + pageSize - 1);

    if (error) throw new CrmError(`Elenco preventivi non riuscito: ${error.message}`, error.code);
    return { rows: data ?? [], total: count ?? 0, page, pageSize };
  },
};
