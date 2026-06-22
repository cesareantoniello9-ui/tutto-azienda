-- ============================================================
-- Tutto.Azienda — CRM (migration 00004)
-- Multi-tenant: company_id → public.tenants(id) (l'azienda proprietaria).
-- RLS via public.current_tenant_id() (helper della Fase 1). UUID ovunque.
-- Ri-eseguibile in sicurezza (reset in testa; nessun dato CRM reale ancora).
-- ============================================================

-- ---------- Reset idempotente ----------
drop table if exists notes cascade;
drop table if exists activities cascade;
drop table if exists quote_items cascade;
drop table if exists quotes cascade;
drop table if exists opportunities cascade;
drop table if exists leads cascade;
drop table if exists clients cascade;

drop type if exists crm_client_type cascade;
drop type if exists crm_lead_status cascade;
drop type if exists crm_lead_source cascade;
drop type if exists crm_opportunity_stage cascade;
drop type if exists crm_opportunity_status cascade;
drop type if exists crm_quote_status cascade;
drop type if exists crm_activity_type cascade;
drop type if exists crm_activity_status cascade;

-- ---------- Estensioni ----------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- ricerca testuale veloce (ILIKE)

-- ---------- ENUM ----------
create type crm_client_type        as enum ('company','individual');
create type crm_lead_status        as enum ('new','contacted','qualified','unqualified','converted','lost');
create type crm_lead_source        as enum ('web','referral','cold_call','event','social','advertising','other');
create type crm_opportunity_stage  as enum ('qualification','proposal','negotiation','won','lost');
create type crm_opportunity_status as enum ('open','won','lost');
create type crm_quote_status       as enum ('draft','sent','accepted','rejected','expired');
create type crm_activity_type      as enum ('call','meeting','email','task','follow_up');
create type crm_activity_status    as enum ('planned','done','cancelled');

-- ============================================================
-- TABELLE
-- ============================================================

-- ---------- CLIENTS (anagrafica clienti) ----------
create table clients (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.tenants(id) on delete cascade,
  type             crm_client_type not null default 'company',
  name             text not null,
  vat_number       text,                       -- P.IVA
  tax_code         text,                       -- Codice Fiscale
  email            text,
  phone            text,
  website          text,
  address_street   text,
  address_city     text,
  address_zip      text,
  address_province text,
  address_country  text default 'IT',
  industry         text,
  owner_id         uuid references auth.users(id) on delete set null,
  is_active        boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------- LEADS (nuovi contatti) ----------
create table leads (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.tenants(id) on delete cascade,
  name                text not null,
  company_name        text,
  email               text,
  phone               text,
  source              crm_lead_source not null default 'other',
  status              crm_lead_status not null default 'new',
  estimated_value     numeric(14,2),
  owner_id            uuid references auth.users(id) on delete set null,
  converted_at        timestamptz,
  converted_client_id uuid references clients(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- OPPORTUNITIES (trattative / pipeline via enum stage) ----------
create table opportunities (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.tenants(id) on delete cascade,
  client_id           uuid references clients(id) on delete set null,
  source_lead_id      uuid references leads(id) on delete set null,
  title               text not null,
  stage               crm_opportunity_stage not null default 'qualification',
  status              crm_opportunity_status not null default 'open',
  amount              numeric(14,2) not null default 0,
  currency            char(3) not null default 'EUR',
  probability         smallint not null default 0 check (probability between 0 and 100),
  expected_close_date date,
  lost_reason         text,
  owner_id            uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- QUOTES (preventivi) ----------
create table quotes (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.tenants(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete restrict,
  opportunity_id uuid references opportunities(id) on delete set null,
  number         text not null,                 -- es. 2026/0001 (generato lato app)
  status         crm_quote_status not null default 'draft',
  issue_date     date not null default current_date,
  valid_until    date,
  currency       char(3) not null default 'EUR',
  subtotal       numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total      numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  notes          text,
  terms          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, number)                   -- numero univoco per azienda
);

-- ---------- QUOTE_ITEMS (righe preventivo) ----------
create table quote_items (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.tenants(id) on delete cascade,
  quote_id     uuid not null references quotes(id) on delete cascade,
  description  text not null,
  quantity     numeric(12,2) not null default 1 check (quantity >= 0),
  unit_price   numeric(14,2) not null default 0,
  discount_pct numeric(5,2)  not null default 0 check (discount_pct between 0 and 100),
  tax_rate     numeric(5,2)  not null default 22 check (tax_rate between 0 and 100), -- IVA per riga
  line_total   numeric(14,2) not null default 0,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- ACTIVITIES (chiamate, meeting, follow-up, task) ----------
create table activities (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.tenants(id) on delete cascade,
  type           crm_activity_type not null default 'task',
  status         crm_activity_status not null default 'planned',
  subject        text not null,
  notes          text,
  due_at         timestamptz,
  completed_at   timestamptz,
  owner_id       uuid references auth.users(id) on delete set null,
  -- collegamento opzionale a UNA entità (o nessuna → task autonomo)
  client_id      uuid references clients(id) on delete cascade,
  lead_id        uuid references leads(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint activities_one_relation check (
    (client_id is not null)::int + (lead_id is not null)::int + (opportunity_id is not null)::int <= 1
  )
);

-- ---------- NOTES (note testuali su un'entità) ----------
create table notes (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.tenants(id) on delete cascade,
  body           text not null,
  author_id      uuid references auth.users(id) on delete set null,
  -- collegamento OBBLIGATORIO a esattamente UNA entità
  client_id      uuid references clients(id) on delete cascade,
  lead_id        uuid references leads(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint notes_one_relation check (
    (client_id is not null)::int + (lead_id is not null)::int + (opportunity_id is not null)::int = 1
  )
);

-- ============================================================
-- INDEX (isolamento tenant + filtri/ricerca comuni)
-- ============================================================
create index clients_company_idx        on clients (company_id);
create index clients_company_active_idx on clients (company_id, is_active);
create index clients_owner_idx          on clients (owner_id);
create index clients_name_trgm_idx      on clients using gin (name gin_trgm_ops);   -- ricerca nome
create index clients_email_trgm_idx     on clients using gin (email gin_trgm_ops);  -- ricerca email

create index leads_company_status_idx   on leads (company_id, status);
create index leads_owner_idx            on leads (owner_id);
create index leads_name_trgm_idx        on leads using gin (name gin_trgm_ops);

create index opp_company_stage_idx      on opportunities (company_id, stage);
create index opp_company_status_idx     on opportunities (company_id, status);
create index opp_client_idx             on opportunities (client_id);
create index opp_owner_idx              on opportunities (owner_id);

create index quotes_company_status_idx  on quotes (company_id, status);
create index quotes_client_idx          on quotes (client_id);
create index quotes_opportunity_idx     on quotes (opportunity_id);

create index quote_items_quote_idx      on quote_items (quote_id);
create index quote_items_company_idx    on quote_items (company_id);

create index activities_company_due_idx on activities (company_id, status, due_at);
create index activities_client_idx      on activities (client_id);
create index activities_lead_idx        on activities (lead_id);
create index activities_opp_idx         on activities (opportunity_id);

create index notes_company_idx          on notes (company_id);
create index notes_client_idx           on notes (client_id);
create index notes_lead_idx             on notes (lead_id);
create index notes_opp_idx              on notes (opportunity_id);

-- ============================================================
-- TRIGGER updated_at (riusa public.set_updated_at() della 00001)
-- ============================================================
create trigger clients_updated_at       before update on clients       for each row execute function public.set_updated_at();
create trigger leads_updated_at         before update on leads         for each row execute function public.set_updated_at();
create trigger opportunities_updated_at before update on opportunities for each row execute function public.set_updated_at();
create trigger quotes_updated_at        before update on quotes        for each row execute function public.set_updated_at();
create trigger quote_items_updated_at   before update on quote_items   for each row execute function public.set_updated_at();
create trigger activities_updated_at    before update on activities    for each row execute function public.set_updated_at();
create trigger notes_updated_at         before update on notes         for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- Ogni azienda vede/scrive SOLO le proprie righe: company_id = current_tenant_id()
-- ============================================================
alter table clients       enable row level security;
alter table leads         enable row level security;
alter table opportunities enable row level security;
alter table quotes        enable row level security;
alter table quote_items   enable row level security;
alter table activities    enable row level security;
alter table notes         enable row level security;

create policy "clients: isolamento azienda" on clients for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "leads: isolamento azienda" on leads for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "opportunities: isolamento azienda" on opportunities for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "quotes: isolamento azienda" on quotes for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "quote_items: isolamento azienda" on quote_items for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "activities: isolamento azienda" on activities for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "notes: isolamento azienda" on notes for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());
