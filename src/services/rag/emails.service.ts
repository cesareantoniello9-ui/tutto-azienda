/**
 * Email e comunicazioni — ingestione dal webhook del provider.
 *
 * Il payload arriva già normalizzato (`InboundEmail`): qui si decide se la
 * email può entrare nella memoria aziendale, si collega al contatto del CRM e
 * si salva. Il filtro predefinito è restrittivo — solo posta legata a un
 * cliente o lead già in anagrafica — perché una casella aziendale contiene
 * anche corrispondenza che non deve diventare interrogabile da tutto il team.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RagEmailRow } from "@/types/rag";
import {
  decideIndexing,
  emailBody,
  parseAddress,
  type InboundEmail,
  type KnownContact,
} from "@/lib/rag/email";
import { isMissingSchema, ragAdmin, ragClient, toRagError } from "./base";

const MAX_CONTACTS = 5000;

export type IngestOutcome =
  | { stored: true; email: RagEmailRow; reason: string }
  | { stored: false; reason: string };

export const ragEmailsService = {
  async list(limit = 50): Promise<RagEmailRow[]> {
    const supabase = await ragClient();
    const { data, error } = await supabase
      .from("rag_emails")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingSchema(error.code)) return [];
      throw toRagError("Lettura delle email non riuscita", error);
    }
    return (data ?? []) as RagEmailRow[];
  },

  /**
   * Registra una email in arrivo per un'azienda. Gira con la service-role:
   * il webhook del provider non ha una sessione utente.
   */
  async ingest(companyId: string, email: InboundEmail): Promise<IngestOutcome> {
    const supabase = await ragAdmin();

    const { data: settingsRow } = await supabase
      .from("rag_settings")
      .select("email_ingestion_enabled, email_only_known_contacts, email_allowed_domains")
      .eq("company_id", companyId)
      .maybeSingle();

    const settings = (settingsRow as {
      email_ingestion_enabled: boolean;
      email_only_known_contacts: boolean;
      email_allowed_domains: string[];
    } | null) ?? {
      email_ingestion_enabled: true,
      email_only_known_contacts: true,
      email_allowed_domains: [],
    };

    if (!settings.email_ingestion_enabled) {
      return { stored: false, reason: "ingestione email disattivata per questa azienda" };
    }

    const body = emailBody(email);
    if (!body.trim()) return { stored: false, reason: "messaggio senza testo" };

    const contacts = await loadContacts(supabase, companyId);
    const decision = decideIndexing({
      email,
      contacts,
      onlyKnownContacts: settings.email_only_known_contacts,
      allowedDomains: settings.email_allowed_domains ?? [],
    });

    if (!decision.indexable) return { stored: false, reason: decision.reason };

    const from = parseAddress(email.from);
    const contact = decision.contact;

    const { data, error } = await supabase
      .from("rag_emails")
      .upsert(
        {
          company_id: companyId,
          message_id: email.messageId?.trim() || crypto.randomUUID(),
          thread_id: email.threadId?.trim() || null,
          direction: email.direction ?? "inbound",
          subject: email.subject?.trim() || null,
          from_address: from.address,
          from_name: email.fromName?.trim() || from.name,
          to_addresses: (email.to ?? []).map((value) => parseAddress(value).address),
          cc_addresses: (email.cc ?? []).map((value) => parseAddress(value).address),
          body_text: body,
          sent_at: email.sentAt ?? new Date().toISOString(),
          client_id: contact?.kind === "client" ? contact.id : null,
          lead_id: contact?.kind === "lead" ? contact.id : null,
          has_attachments: email.hasAttachments ?? false,
        },
        { onConflict: "company_id,message_id" },
      )
      .select("*")
      .single();

    if (error) throw toRagError("Salvataggio della email non riuscito", error);
    return { stored: true, email: data as RagEmailRow, reason: decision.reason };
  },

  async remove(id: string): Promise<void> {
    const supabase = await ragClient();
    const { error } = await supabase.from("rag_emails").delete().eq("id", id);
    if (error) throw toRagError("Eliminazione della email non riuscita", error);
  },

  /**
   * Azienda destinataria di una email, dedotta dagli indirizzi coinvolti.
   * Serve al webhook, che riceve la posta senza sapere a chi appartiene.
   */
  async resolveCompany(email: InboundEmail): Promise<string | null> {
    const supabase = await ragAdmin();
    const addresses = [
      parseAddress(email.from).address,
      ...(email.to ?? []).map((value) => parseAddress(value).address),
      ...(email.cc ?? []).map((value) => parseAddress(value).address),
    ].filter(Boolean);

    if (addresses.length === 0) return null;

    // 1. Corrispondenza diretta con un contatto del CRM.
    const { data: clients } = await supabase
      .from("clients")
      .select("company_id")
      .in("email", addresses)
      .limit(1);
    const client = (clients ?? [])[0] as { company_id?: string } | undefined;
    if (client?.company_id) return client.company_id;

    const { data: leads } = await supabase
      .from("leads")
      .select("company_id")
      .in("email", addresses)
      .limit(1);
    const lead = (leads ?? [])[0] as { company_id?: string } | undefined;
    if (lead?.company_id) return lead.company_id;

    // 2. Slug dell'azienda nell'indirizzo di servizio (memoria+{slug}@…).
    const slug = addresses
      .map((address) => address.match(/\+([a-z0-9-]{3,63})@/)?.[1])
      .find(Boolean);
    if (slug) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      const id = (tenant as { id?: string } | null)?.id;
      if (id) return id;
    }

    return null;
  },
};

async function loadContacts(
  supabase: SupabaseClient,
  companyId: string,
): Promise<KnownContact[]> {
  const [clients, leads] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, email")
      .eq("company_id", companyId)
      .not("email", "is", null)
      .limit(MAX_CONTACTS),
    supabase
      .from("leads")
      .select("id, name, email")
      .eq("company_id", companyId)
      .not("email", "is", null)
      .limit(MAX_CONTACTS),
  ]);

  const contacts: KnownContact[] = [];
  for (const row of clients.data ?? []) {
    contacts.push({
      id: row.id as string,
      kind: "client",
      email: (row.email as string | null) ?? null,
      name: row.name as string,
    });
  }
  for (const row of leads.data ?? []) {
    contacts.push({
      id: row.id as string,
      kind: "lead",
      email: (row.email as string | null) ?? null,
      name: row.name as string,
    });
  }
  return contacts;
}
