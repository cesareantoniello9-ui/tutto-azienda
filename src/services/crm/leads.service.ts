import type {
  Lead,
  LeadInsert,
  LeadUpdate,
  LeadFilters,
  ListParams,
  PaginatedResult,
} from "@/types/crm";
import { crmClient, currentCompanyId, CrmError, sanitizeSearch } from "./base";

export const leadsService = {
  async create(input: LeadInsert): Promise<Lead> {
    const supabase = await crmClient();
    const company_id = await currentCompanyId();
    const { data, error } = await supabase
      .from("leads")
      .insert({ ...input, company_id })
      .select()
      .single();
    if (error) throw new CrmError(`Creazione lead non riuscita: ${error.message}`, error.code);
    return data;
  },

  async update(id: string, input: LeadUpdate): Promise<Lead> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("leads")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new CrmError(`Aggiornamento lead non riuscito: ${error.message}`, error.code);
    return data;
  },

  async delete(id: string): Promise<void> {
    const supabase = await crmClient();
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) throw new CrmError(`Eliminazione lead non riuscita: ${error.message}`, error.code);
  },

  async findById(id: string): Promise<Lead | null> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmError(`Lettura lead non riuscita: ${error.message}`, error.code);
    return data;
  },

  async findAll(params: ListParams<LeadFilters> = {}): Promise<PaginatedResult<Lead>> {
    const supabase = await crmClient();
    const { search, filters, page = 1, pageSize = 20, sortBy = "created_at", sortDir = "desc" } = params;

    let query = supabase.from("leads").select("*", { count: "exact" });

    if (search) {
      const s = sanitizeSearch(search);
      if (s) query = query.or(`name.ilike.%${s}%,company_name.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.source) query = query.eq("source", filters.source);
    if (filters?.ownerId) query = query.eq("owner_id", filters.ownerId);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(from, from + pageSize - 1);

    if (error) throw new CrmError(`Elenco lead non riuscito: ${error.message}`, error.code);
    return { rows: data ?? [], total: count ?? 0, page, pageSize };
  },
};
