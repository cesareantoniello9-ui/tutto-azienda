import { headers } from "next/headers";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoMode, demoTenant } from "@/config/demo";
import type { Tenant } from "@/types/tenant";

export const getCurrentTenant = cache(async (): Promise<Tenant | null> => {
  const headerStore = await headers();
  const slug = headerStore.get("x-tenant-slug");

  if (!slug) return isDemoMode() ? demoTenant() : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return isDemoMode() ? demoTenant(slug) : null;
  }

  return data as unknown as Tenant;
});

export const requireTenant = cache(async (): Promise<Tenant> => {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Tenant not found or not authorized");
  return tenant;
});
