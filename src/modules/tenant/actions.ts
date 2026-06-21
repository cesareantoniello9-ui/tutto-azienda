"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { isDemoMode } from "@/config/demo";
import { generalSettingsSchema, type GeneralSettingsInput } from "./schema";
import { revalidatePath } from "next/cache";

const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(3).max(63).regex(/^[a-z0-9-]+$/),
});

export async function createTenant(input: { name: string; slug: string }) {
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  // Modalità demo: nessun backend, simula successo
  if (isDemoMode()) {
    return { ok: true as const, slug: parsed.data.slug };
  }

  // Client autenticato (publishable key + sessione utente): l'inserimento è
  // protetto da RLS — l'utente può creare solo tenant di cui è owner.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Non autorizzato" };

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({ name: parsed.data.name, slug: parsed.data.slug, owner_id: user.id })
    .select()
    .single();

  if (error || !tenant) {
    return { ok: false as const, error: error?.message ?? "Creazione fallita" };
  }

  const { error: memberError } = await supabase.from("tenant_members").insert({
    tenant_id: tenant.id,
    user_id: user.id,
    role: "owner",
    joined_at: new Date().toISOString(),
  });
  if (memberError) {
    return { ok: false as const, error: memberError.message };
  }

  await logAuditEvent({
    tenantId: tenant.id,
    action: "tenant.created",
    resourceType: "tenant",
    resourceId: tenant.id,
  });

  revalidatePath("/");
  return { ok: true as const, slug: tenant.slug };
}

export async function updateGeneralSettings(
  tenantId: string,
  input: GeneralSettingsInput
) {
  const parsed = generalSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  if (isDemoMode()) {
    return { ok: true as const };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      name: parsed.data.name,
      settings: {
        timezone: parsed.data.timezone,
        currency: parsed.data.currency,
        locale: parsed.data.locale,
        date_format: "DD/MM/YYYY",
      },
    })
    .eq("id", tenantId);

  if (error) return { ok: false as const, error: error.message };

  await logAuditEvent({
    tenantId,
    action: "tenant.updated",
    resourceType: "tenant",
    resourceId: tenantId,
    metadata: parsed.data,
  });

  revalidatePath(`/`);
  return { ok: true as const };
}
