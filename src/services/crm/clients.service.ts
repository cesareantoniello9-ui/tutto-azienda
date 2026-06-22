import type {
  Client,
  ClientInsert,
  ClientUpdate,
  ClientFilters,
  ListParams,
  PaginatedResult,
} from "@/types/crm";
import { crmClient, currentCompanyId, CrmError, sanitizeSearch } from "./base";

export const clientsService = {
  async create(input: ClientInsert): Promise<Client> {
    const supabase = await crmClient();
    const company_id = await currentCompanyId();
    const { data, error } = await supabase
      .from("clients")
      .insert({ ...input, company_id })
      .select()
      .single();
    if (error) throw new CrmError(`Creazione cliente non riuscita: ${error.message}`, error.code);
    return data;
  },

  async update(id: string, input: ClientUpdate): Promise<Client> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("clients")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new CrmError(`Aggiornamento cliente non riuscito: ${error.message}`, error.code);
    return data;
  },

  async delete(id: string): Promise<void> {
    const supabase = await crmClient();
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw new CrmError(`Eliminazione cliente non riuscita: ${error.message}`, error.code);
  },

  async findById(id: string): Promise<Client | null> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmError(`Lettura cliente non riuscita: ${error.message}`, error.code);
    return data;
  },

  async findAll(params: ListParams<ClientFilters> = {}): Promise<PaginatedResult<Client>> {
    const supabase = await crmClient();
    const { search, filters, page = 1, pageSize = 20, sortBy = "created_at", sortDir = "desc" } = params;

    let query = supabase.from("clients").select("*", { count: "exact" });

    if (search) {
      const s = sanitizeSearch(search);
      if (s) query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (filters?.type) query = query.eq("type", filters.type);
    if (filters?.isActive !== undefined) query = query.eq("is_active", filters.isActive);
    if (filters?.ownerId) query = query.eq("owner_id", filters.ownerId);
    if (filters?.industry) query = query.ilike("industry", `%${sanitizeSearch(filters.industry)}%`);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(from, from + pageSize - 1);

    if (error) throw new CrmError(`Elenco clienti non riuscito: ${error.message}`, error.code);
    return { rows: data ?? [], total: count ?? 0, page, pageSize };
  },
};
