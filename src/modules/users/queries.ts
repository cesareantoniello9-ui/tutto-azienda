import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/tenant/context";
import { cache } from "react";

export type TenantMemberView = {
  id: string;
  userId: string;
  role: string;
  invitedAt: string;
  joinedAt: string | null;
  email: string | null;
  fullName: string | null;
};

/**
 * Membri del tenant corrente con i dati di profilo (email/nome).
 * I profili sono recuperati separatamente e uniti lato JS: niente dipendenza
 * dall'embedding PostgREST, e resiliente se la tabella `profiles` non è ancora
 * stata applicata (in tal caso i membri vengono mostrati senza email).
 */
export const getTenantMembers = cache(async (): Promise<TenantMemberView[]> => {
  const tenant = await requireTenant();
  const supabase = await createSupabaseServerClient();

  const { data: members, error } = await supabase
    .from("tenant_members")
    .select("id, user_id, role, invited_at, joined_at")
    .eq("tenant_id", tenant.id)
    .order("invited_at", { ascending: false });

  if (error || !members) return [];

  const ids = members.map((m) => m.user_id);
  const profileById = new Map<string, { email: string | null; full_name: string | null }>();

  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    for (const p of profiles ?? []) {
      profileById.set(p.id, { email: p.email, full_name: p.full_name });
    }
  }

  return members.map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role,
    invitedAt: m.invited_at,
    joinedAt: m.joined_at,
    email: profileById.get(m.user_id)?.email ?? null,
    fullName: profileById.get(m.user_id)?.full_name ?? null,
  }));
});
