import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/context";
import { isDemoMode } from "@/config/demo";
import type { MemberRole } from "@/types/tenant";

/** Utente autenticato corrente (o null). */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Slug della prima azienda di cui l'utente è membro (o null se nessuna).
 * Usato per instradare l'utente dopo il login.
 */
export const getUserPrimaryTenantSlug = cache(async (): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", membership.tenant_id)
    .maybeSingle();

  return tenant?.slug ?? null;
});

/**
 * Ruolo dell'utente corrente nel tenant attualmente visualizzato (o null).
 * In modalità demo l'utente è sempre "owner".
 */
export const getCurrentMemberRole = cache(async (): Promise<MemberRole | null> => {
  if (isDemoMode()) return "owner";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const tenant = await getCurrentTenant();
  if (!tenant) return null;

  const { data } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  return (data?.role as MemberRole | undefined) ?? null;
});

/** True se l'utente corrente è owner o admin del tenant corrente. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const role = await getCurrentMemberRole();
  return role === "owner" || role === "admin";
}

/** Lancia se l'utente corrente non ha uno dei ruoli richiesti. */
export async function requireRole(roles: MemberRole[]): Promise<MemberRole> {
  const role = await getCurrentMemberRole();
  if (!role || !roles.includes(role)) {
    throw new Error("Permessi insufficienti per questa operazione.");
  }
  return role;
}
