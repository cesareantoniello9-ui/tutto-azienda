/**
 * Tipi del modulo CRM — Tutto.Azienda
 *
 * Rispecchiano 1:1 le righe del database (migration `00004_crm.sql`), quindi
 * tipizzano direttamente i risultati delle query Supabase (campi snake_case,
 * coerenti con `src/types/database.ts` e `src/types/tenant.ts`).
 *
 * Convenzioni:
 * - Enum Postgres → array `as const` (single source of truth) + union derivata.
 * - Colonne `not null` → campo richiesto; colonne nullabili → `| null`.
 * - Importi `numeric` → `number`; date `timestamptz`/`date` → stringa ISO.
 * - `company_id` è il tenant proprietario (→ `tenants.id`).
 */

// ─────────────────────────────────────────────────────────────
// Alias primitivi
// ─────────────────────────────────────────────────────────────
export type UUID = string;
/** Istante ISO 8601 (Postgres `timestamptz`), es. "2026-06-21T10:00:00Z". */
export type Timestamp = string;
/** Data pura ISO (Postgres `date`), es. "2026-06-21". */
export type DateOnly = string;
/** Codice valuta ISO 4217, es. "EUR". */
export type CurrencyCode = string;

// ─────────────────────────────────────────────────────────────
// Enum (allineati agli ENUM Postgres `crm_*`)
// ─────────────────────────────────────────────────────────────
export const CLIENT_TYPES = ["company", "individual"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const LEAD_STATUSES = ["new", "contacted", "qualified", "unqualified", "converted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ["web", "referral", "cold_call", "event", "social", "advertising", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const OPPORTUNITY_STAGES = ["qualification", "proposal", "negotiation", "won", "lost"] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STATUSES = ["open", "won", "lost"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const ACTIVITY_TYPES = ["call", "meeting", "email", "task", "follow_up"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = ["planned", "done", "cancelled"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Entità a cui Attività e Note possono essere collegate (relazione polimorfica). */
export type CrmRelationKind = "client" | "lead" | "opportunity";

// ─────────────────────────────────────────────────────────────
// Base comune a tutte le entità CRM
// ─────────────────────────────────────────────────────────────
export interface CrmEntity {
  id: UUID;
  /** Azienda (tenant) proprietaria → `tenants.id`. */
  company_id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─────────────────────────────────────────────────────────────
// Entità (riga DB)
// ─────────────────────────────────────────────────────────────

/** Cliente — anagrafica (azienda o privato). */
export interface Client extends CrmEntity {
  type: ClientType;
  name: string;
  vat_number: string | null; // P.IVA
  tax_code: string | null; // Codice Fiscale
  email: string | null;
  phone: string | null;
  website: string | null;
  address_street: string | null;
  address_city: string | null;
  address_zip: string | null;
  address_province: string | null;
  address_country: string | null;
  industry: string | null;
  owner_id: UUID | null; // utente assegnatario → auth.users.id
  is_active: boolean;
  notes: string | null;
}

/** Lead — contatto non ancora qualificato. */
export interface Lead extends CrmEntity {
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  status: LeadStatus;
  estimated_value: number | null;
  owner_id: UUID | null;
  converted_at: Timestamp | null;
  converted_client_id: UUID | null; // cliente creato alla conversione
  notes: string | null;
}

/** Opportunità — trattativa in pipeline (lo stadio è l'enum `stage`). */
export interface Opportunity extends CrmEntity {
  client_id: UUID | null;
  source_lead_id: UUID | null; // lead di origine (se convertito)
  title: string;
  stage: OpportunityStage;
  status: OpportunityStatus;
  amount: number;
  currency: CurrencyCode;
  probability: number; // 0–100
  expected_close_date: DateOnly | null;
  lost_reason: string | null;
  owner_id: UUID | null;
}

/** Preventivo — testata. I totali sono calcolati lato server dalle righe. */
export interface Quote extends CrmEntity {
  client_id: UUID;
  opportunity_id: UUID | null;
  number: string; // es. "2026/0001", univoco per azienda
  status: QuoteStatus;
  issue_date: DateOnly;
  valid_until: DateOnly | null;
  currency: CurrencyCode;
  subtotal: number; // calcolato
  discount_total: number; // calcolato
  tax_total: number; // calcolato
  total: number; // calcolato
  notes: string | null;
  terms: string | null;
}

/** Riga di preventivo. `line_total` è calcolato lato server. */
export interface QuoteItem extends CrmEntity {
  quote_id: UUID;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number; // 0–100
  tax_rate: number; // IVA % della riga
  line_total: number; // calcolato
  position: number;
}

/** Attività — chiamata, meeting, email, task, follow-up. Collegabile a ≤1 entità. */
export interface Activity extends CrmEntity {
  type: ActivityType;
  status: ActivityStatus;
  subject: string;
  notes: string | null;
  due_at: Timestamp | null;
  completed_at: Timestamp | null;
  owner_id: UUID | null;
  client_id: UUID | null;
  lead_id: UUID | null;
  opportunity_id: UUID | null;
}

/** Nota — testo libero collegato a esattamente 1 entità. */
export interface Note extends CrmEntity {
  body: string;
  author_id: UUID | null;
  client_id: UUID | null;
  lead_id: UUID | null;
  opportunity_id: UUID | null;
}

// ─────────────────────────────────────────────────────────────
// Input di scrittura (Insert / Update)
//
// `company_id`, `id`, `created_at`, `updated_at` sono gestiti dal server.
// I campi calcolati (totali preventivo, line_total) vengono ricalcolati lato
// server: gli schema Zod dello STEP successivo li ometteranno dagli input.
// ─────────────────────────────────────────────────────────────
type ServerManaged = "id" | "company_id" | "created_at" | "updated_at";

export type Insertable<T extends CrmEntity> = Omit<T, ServerManaged>;
export type Updatable<T extends CrmEntity> = Partial<Insertable<T>>;

export type ClientInsert = Insertable<Client>;
export type ClientUpdate = Updatable<Client>;

export type LeadInsert = Insertable<Lead>;
export type LeadUpdate = Updatable<Lead>;

export type OpportunityInsert = Insertable<Opportunity>;
export type OpportunityUpdate = Updatable<Opportunity>;

export type QuoteInsert = Omit<Insertable<Quote>, "subtotal" | "discount_total" | "tax_total" | "total">;
export type QuoteUpdate = Partial<QuoteInsert>;

export type QuoteItemInsert = Omit<Insertable<QuoteItem>, "line_total">;
export type QuoteItemUpdate = Partial<QuoteItemInsert>;

export type ActivityInsert = Insertable<Activity>;
export type ActivityUpdate = Updatable<Activity>;

export type NoteInsert = Insertable<Note>;
export type NoteUpdate = Updatable<Note>;

// ─────────────────────────────────────────────────────────────
// View-model (entità + dati joinati per liste/dettaglio)
// ─────────────────────────────────────────────────────────────

/** Riferimento minimale all'utente proprietario (da `profiles`). */
export interface OwnerRef {
  id: UUID;
  full_name: string | null;
  email: string | null;
}

export interface OpportunityView extends Opportunity {
  client: Pick<Client, "id" | "name"> | null;
  owner: OwnerRef | null;
}

export interface QuoteView extends Quote {
  client: Pick<Client, "id" | "name">;
  items: QuoteItem[];
}

export interface ActivityView extends Activity {
  client: Pick<Client, "id" | "name"> | null;
  lead: Pick<Lead, "id" | "name"> | null;
  opportunity: Pick<Opportunity, "id" | "title"> | null;
}

export interface ClientView extends Client {
  owner: OwnerRef | null;
  open_opportunities: number;
}

// ─────────────────────────────────────────────────────────────
// Ricerca, filtri e liste paginate
// ─────────────────────────────────────────────────────────────
export type SortDirection = "asc" | "desc";

/** Parametri generici per le query di lista (ricerca + filtri + paginazione). */
export interface ListParams<TFilters = Record<string, never>> {
  search?: string;
  filters?: TFilters;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: SortDirection;
}

/** Risultato paginato di una lista. */
export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ClientFilters {
  type?: ClientType;
  isActive?: boolean;
  ownerId?: UUID;
  industry?: string;
}

export interface LeadFilters {
  status?: LeadStatus;
  source?: LeadSource;
  ownerId?: UUID;
}

export interface OpportunityFilters {
  stage?: OpportunityStage;
  status?: OpportunityStatus;
  ownerId?: UUID;
  clientId?: UUID;
}

export interface QuoteFilters {
  status?: QuoteStatus;
  clientId?: UUID;
}

export interface ActivityFilters {
  type?: ActivityType;
  status?: ActivityStatus;
  ownerId?: UUID;
  relatedTo?: { kind: CrmRelationKind; id: UUID };
}
