import type {
  Opportunity,
  OpportunityInsert,
  OpportunityUpdate,
  OpportunityFilters,
  ListParams,
  PaginatedResult,
} from "@/types/crm";
import { crmClient, currentCompanyId, CrmError, sanitizeSearch } from "./base";

export const opportunitiesService = {
  async create(input: OpportunityInsert): Promise<Opportunity> {
    const supabase = await crmClient();
    const company_id = await currentCompanyId();
    const { data, error } = await supabase
      .from("opportunities")
      .insert({ ...input, company_id })
      .select()
      .single();
    if (error) throw new CrmError(`Creazione opportunità non riuscita: ${error.message}`, error.code);
    return data;
  },

  async update(id: string, input: OpportunityUpdate): Promise<Opportunity> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("opportunities")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new CrmError(`Aggiornamento opportunità non riuscito: ${error.message}`, error.code);
    return data;
  },

  async delete(id: string): Promise<void> {
    const supabase = await crmClient();
    const { error } = await supabase.from("opportunities").delete().eq("id", id);
    if (error) throw new CrmError(`Eliminazione opportunità non riuscita: ${error.message}`, error.code);
  },

  async findById(id: string): Promise<Opportunity | null> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmError(`Lettura opportunità non riuscita: ${error.message}`, error.code);
    return data;
  },

  async findAll(params: ListParams<OpportunityFilters> = {}): Promise<PaginatedResult<Opportunity>> {
    const supabase = await crmClient();
    const { search, filters, page = 1, pageSize = 20, sortBy = "created_at", sortDir = "desc" } = params;

    let query = supabase.from("opportunities").select("*", { count: "exact" });

    if (search) {
      const s = sanitizeSearch(search);
      if (s) query = query.ilike("title", `%${s}%`);
    }
    if (filters?.stage) query = query.eq("stage", filters.stage);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.ownerId) query = query.eq("owner_id", filters.ownerId);
    if (filters?.clientId) query = query.eq("client_id", filters.clientId);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(from, from + pageSize - 1);

    if (error) throw new CrmError(`Elenco opportunità non riuscito: ${error.message}`, error.code);
    return { rows: data ?? [], total: count ?? 0, page, pageSize };
  },
};
