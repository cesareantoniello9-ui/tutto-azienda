"use server";

import { clientFormSchema, type ClientFormValues } from "./schema";
import { clientsService } from "@/services/crm/clients.service";
import { CrmError } from "@/services/crm/base";
import type { ClientInsert } from "@/types/crm";

type MutationResult = { ok: true; id: string } | { ok: false; error: string };
type DeleteResult = { ok: true } | { ok: false; error: string };

/** "" o solo spazi → null. */
function nz(value?: string): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function toClientInsert(v: ClientFormValues): ClientInsert {
  return {
    type: v.type,
    name: v.name.trim(),
    email: nz(v.email),
    phone: nz(v.phone),
    vat_number: nz(v.vat_number),
    tax_code: nz(v.tax_code),
    website: nz(v.website),
    industry: nz(v.industry),
    address_street: null,
    address_city: nz(v.address_city),
    address_zip: null,
    address_province: nz(v.address_province),
    address_country: "IT",
    owner_id: null,
    is_active: v.is_active,
    notes: nz(v.notes),
  };
}

function toErrorMessage(e: unknown): string {
  if (e instanceof CrmError) return e.message;
  return "Si è verificato un errore imprevisto. Riprova.";
}

export async function createClientAction(raw: unknown): Promise<MutationResult> {
  const parsed = clientFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  try {
    const client = await clientsService.create(toClientInsert(parsed.data));
    return { ok: true, id: client.id };
  } catch (e) {
    return { ok: false, error: toErrorMessage(e) };
  }
}

export async function updateClientAction(id: string, raw: unknown): Promise<MutationResult> {
  const parsed = clientFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  try {
    const client = await clientsService.update(id, toClientInsert(parsed.data));
    return { ok: true, id: client.id };
  } catch (e) {
    return { ok: false, error: toErrorMessage(e) };
  }
}

export async function deleteClientAction(id: string): Promise<DeleteResult> {
  try {
    await clientsService.delete(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toErrorMessage(e) };
  }
}
