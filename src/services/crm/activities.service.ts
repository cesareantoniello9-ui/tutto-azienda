import type {
  Activity,
  ActivityInsert,
  ActivityUpdate,
  ActivityFilters,
  ListParams,
  PaginatedResult,
} from "@/types/crm";
import { crmClient, currentCompanyId, CrmError, sanitizeSearch } from "./base";

export const activitiesService = {
  async create(input: ActivityInsert): Promise<Activity> {
    const supabase = await crmClient();
    const company_id = await currentCompanyId();
    const { data, error } = await supabase
      .from("activities")
      .insert({ ...input, company_id })
      .select()
      .single();
    if (error) throw new CrmError(`Creazione attività non riuscita: ${error.message}`, error.code);
    return data;
  },

  async update(id: string, input: ActivityUpdate): Promise<Activity> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("activities")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new CrmError(`Aggiornamento attività non riuscito: ${error.message}`, error.code);
    return data;
  },

  async delete(id: string): Promise<void> {
    const supabase = await crmClient();
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) throw new CrmError(`Eliminazione attività non riuscita: ${error.message}`, error.code);
  },

  async findById(id: string): Promise<Activity | null> {
    const supabase = await crmClient();
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmError(`Lettura attività non riuscita: ${error.message}`, error.code);
    return data;
  },

  async findAll(params: ListParams<ActivityFilters> = {}): Promise<PaginatedResult<Activity>> {
    const supabase = await crmClient();
    const { search, filters, page = 1, pageSize = 20, sortBy = "due_at", sortDir = "asc" } = params;

    let query = supabase.from("activities").select("*", { count: "exact" });

    if (search) {
      const s = sanitizeSearch(search);
      if (s) query = query.ilike("subject", `%${s}%`);
    }
    if (filters?.type) query = query.eq("type", filters.type);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.ownerId) query = query.eq("owner_id", filters.ownerId);
    if (filters?.relatedTo) {
      const column = `${filters.relatedTo.kind}_id` as "client_id" | "lead_id" | "opportunity_id";
      query = query.eq(column, filters.relatedTo.id);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDir === "asc", nullsFirst: false })
      .range(from, from + pageSize - 1);

    if (error) throw new CrmError(`Elenco attività non riuscito: ${error.message}`, error.code);
    return { rows: data ?? [], total: count ?? 0, page, pageSize };
  },
};
