/**
 * Email in ingresso: normalizzazione, riconoscimento del contatto e filtro privacy.
 *
 * Una casella aziendale contiene anche posta che non deve finire in un indice
 * interrogabile da tutto il team. Il filtro predefinito è quindi restrittivo:
 * entra solo ciò che è collegato a un contatto già presente nel CRM (o a un
 * dominio esplicitamente ammesso). Tutto il resto viene scartato con un motivo.
 *
 * Funzioni pure: il payload del provider arriva già normalizzato dal servizio.
 */
import { normalizeText, truncate } from "./text";

/** Payload normalizzato, indipendente dal provider (Resend, Postmark, …). */
export type InboundEmail = {
  messageId?: string | null;
  threadId?: string | null;
  direction?: "inbound" | "outbound";
  subject?: string | null;
  from: string;
  fromName?: string | null;
  to?: string[];
  cc?: string[];
  text?: string | null;
  html?: string | null;
  sentAt?: string | null;
  hasAttachments?: boolean;
};

export type KnownContact = {
  id: string;
  kind: "client" | "lead";
  email: string | null;
  name: string;
};

export type EmailDecision =
  | { indexable: true; contact: KnownContact | null; reason: "contatto-noto" | "dominio-ammesso" | "filtro-disattivato" }
  | { indexable: false; reason: string };

/** Estrae l'indirizzo da «Mario Rossi <mario@acme.it>». */
export function parseAddress(raw: string): { address: string; name: string | null } {
  const match = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  if (match?.[2]) {
    const name = match[1]?.trim();
    return { address: match[2].trim().toLowerCase(), name: name ? name : null };
  }
  return { address: raw.trim().toLowerCase(), name: null };
}

export function emailDomain(address: string): string {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

/**
 * Decide se una email può entrare nella memoria aziendale.
 * Restituisce anche il contatto riconosciuto, che diventa il collegamento al CRM.
 */
export function decideIndexing(params: {
  email: InboundEmail;
  contacts: KnownContact[];
  onlyKnownContacts: boolean;
  allowedDomains: string[];
}): EmailDecision {
  const addresses = [
    parseAddress(params.email.from).address,
    ...(params.email.to ?? []).map((value) => parseAddress(value).address),
    ...(params.email.cc ?? []).map((value) => parseAddress(value).address),
  ].filter(Boolean);

  if (addresses.length === 0) return { indexable: false, reason: "nessun indirizzo valido" };

  const byEmail = new Map<string, KnownContact>();
  for (const contact of params.contacts) {
    if (contact.email) byEmail.set(contact.email.toLowerCase(), contact);
  }

  const matched = addresses.map((address) => byEmail.get(address)).find(Boolean) ?? null;
  if (matched) return { indexable: true, contact: matched, reason: "contatto-noto" };

  const allowed = params.allowedDomains.map((domain) => domain.toLowerCase().replace(/^@/, ""));
  const domainMatch = addresses.some((address) => allowed.includes(emailDomain(address)));
  if (domainMatch) return { indexable: true, contact: null, reason: "dominio-ammesso" };

  // Nessun contatto noto: si prova il dominio di un cliente/lead già in anagrafica.
  const knownDomains = new Set(
    params.contacts
      .map((contact) => (contact.email ? emailDomain(contact.email) : ""))
      .filter(Boolean),
  );
  const contactByDomain =
    addresses
      .map((address) => emailDomain(address))
      .filter((domain) => knownDomains.has(domain))
      .map((domain) =>
        params.contacts.find(
          (contact) => contact.email && emailDomain(contact.email) === domain,
        ),
      )
      .find(Boolean) ?? null;

  if (contactByDomain) {
    return { indexable: true, contact: contactByDomain, reason: "contatto-noto" };
  }

  if (!params.onlyKnownContacts) {
    return { indexable: true, contact: null, reason: "filtro-disattivato" };
  }

  return {
    indexable: false,
    reason: "nessun contatto del CRM fra mittente e destinatari (filtro privacy attivo)",
  };
}

/** Testo leggibile di una email: preferisce il corpo testuale all'HTML. */
export function emailBody(email: InboundEmail): string {
  const text = email.text?.trim();
  if (text) return normalizeText(stripQuotedReply(text));
  const html = email.html?.trim();
  if (!html) return "";
  return normalizeText(stripQuotedReply(htmlToText(html)));
}

/** Rimozione grossolana dei tag: basta per l'indicizzazione, non per renderizzare. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Taglia la catena citata («Il giorno … ha scritto:», righe con ">").
 * Senza questo, ogni risposta reindicizza l'intera conversazione precedente.
 */
export function stripQuotedReply(text: string): string {
  const markers = [
    /^\s*-{2,}\s*(messaggio originale|original message)\s*-{2,}/im,
    /^\s*il giorno .+ ha scritto:\s*$/im,
    /^\s*on .+ wrote:\s*$/im,
    /^\s*da:\s.+\n\s*inviato:\s/im,
    /^\s*_{5,}\s*$/m,
  ];

  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }

  const head = text.slice(0, cut);
  // Righe citate residue («> …»): via anche quelle.
  return head
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .trim();
}

/** Titolo del documento email nel memoriale. */
export function emailTitle(subject: string | null | undefined, counterpart: string): string {
  const oggetto = subject?.trim() || "senza oggetto";
  return `Email — ${truncate(oggetto, 90)} (${counterpart})`;
}
