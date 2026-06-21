-- ============================================================
-- Tutto.Azienda — Schema completo (ri-eseguibile in sicurezza)
-- migrations 00001 + 00002 + 00003
-- ============================================================

-- Reset (sicuro: il DB non contiene ancora dati reali)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.shares_tenant_with(uuid) cascade;
drop table if exists public.profiles cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.tenant_members cascade;
drop table if exists public.tenants cascade;
drop type  if exists member_role cascade;
drop type  if exists tenant_plan cascade;
drop type  if exists tenant_status cascade;
drop function if exists public.current_tenant_id() cascade;
drop function if exists public.current_member_role(uuid) cascade;
drop function if exists public.set_updated_at() cascade;

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────
-- ENUMS
-- ──────────────────────────────────────────────
create type tenant_status as enum ('active', 'suspended', 'trial', 'cancelled');
create type tenant_plan   as enum ('free', 'starter', 'pro', 'enterprise');
create type member_role   as enum ('owner', 'admin', 'member', 'viewer');

-- ──────────────────────────────────────────────
-- TENANTS
-- ──────────────────────────────────────────────
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  logo_url    text,
  plan        tenant_plan   not null default 'free',
  status      tenant_status not null default 'trial',
  owner_id    uuid not null references auth.users(id) on delete restrict,
  settings    jsonb not null default '{
    "timezone": "Europe/Rome",
    "locale": "it-IT",
    "date_format": "DD/MM/YYYY",
    "currency": "EUR"
  }'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Slug format: lowercase alphanumeric + hyphens only
alter table public.tenants
  add constraint tenants_slug_format check (slug ~ '^[a-z0-9-]{3,63}$');

-- ──────────────────────────────────────────────
-- TENANT MEMBERS
-- ──────────────────────────────────────────────
create table public.tenant_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        member_role not null default 'member',
  invited_at  timestamptz not null default now(),
  joined_at   timestamptz,
  unique (tenant_id, user_id)
);

-- ──────────────────────────────────────────────
-- AUDIT LOG  (append-only, no RLS update/delete)
-- ──────────────────────────────────────────────
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete restrict,
  action        text not null,          -- e.g. 'tenant.updated', 'member.invited'
  resource_type text not null,          -- e.g. 'tenant', 'member', 'invoice'
  resource_id   uuid,
  metadata      jsonb not null default '{}'::jsonb,
  ip_address    inet,
  created_at    timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- INDEXES
-- ──────────────────────────────────────────────
create index tenants_owner_id_idx       on public.tenants(owner_id);
create index tenant_members_tenant_idx  on public.tenant_members(tenant_id);
create index tenant_members_user_idx    on public.tenant_members(user_id);
create index audit_logs_tenant_idx      on public.audit_logs(tenant_id);
create index audit_logs_created_at_idx  on public.audit_logs(created_at desc);

-- ──────────────────────────────────────────────
-- AUTO updated_at
-- ──────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────
-- ROW-LEVEL SECURITY — the single enforcement boundary
-- ──────────────────────────────────────────────

-- Helper: returns the tenant_id of the current user's active membership
create or replace function public.current_tenant_id()
returns uuid stable language sql security definer as $$
  select tenant_id
  from   public.tenant_members
  where  user_id   = auth.uid()
  limit  1;
$$;

-- Helper: returns the role of the current user in a given tenant
create or replace function public.current_member_role(p_tenant_id uuid)
returns member_role stable language sql security definer as $$
  select role
  from   public.tenant_members
  where  tenant_id = p_tenant_id
    and  user_id   = auth.uid()
  limit  1;
$$;

-- ──────────────────────────────────────────────
-- TENANTS
-- ──────────────────────────────────────────────
alter table public.tenants enable row level security;

create policy "tenant: members can read their tenant"
  on public.tenants for select
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenants.id
        and m.user_id   = auth.uid()
    )
  );

create policy "tenant: owners and admins can update"
  on public.tenants for update
  using (
    public.current_member_role(id) in ('owner', 'admin')
  );

-- Un utente autenticato può creare un tenant SOLO se ne è l'owner.
-- Questo abilita l'onboarding self-service senza service-role key.
create policy "tenant: authenticated can create own"
  on public.tenants for insert
  to authenticated
  with check (owner_id = auth.uid());

-- ──────────────────────────────────────────────
-- TENANT MEMBERS
-- ──────────────────────────────────────────────
alter table public.tenant_members enable row level security;

create policy "members: read own tenant's members"
  on public.tenant_members for select
  using (tenant_id = public.current_tenant_id());

create policy "members: admins can insert"
  on public.tenant_members for insert
  with check (
    public.current_member_role(tenant_id) in ('owner', 'admin')
  );

-- Bootstrap: l'owner di un tenant appena creato può auto-registrarsi
-- come primo membro (owner). Risolve il problema "uovo e gallina" della
-- prima membership, senza service-role key.
create policy "members: bootstrap owner self-join"
  on public.tenant_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tenants t
      where t.id = tenant_id
        and t.owner_id = auth.uid()
    )
  );

create policy "members: admins can update roles (not owner)"
  on public.tenant_members for update
  using (
    public.current_member_role(tenant_id) in ('owner', 'admin')
    and role <> 'owner'
  );

create policy "members: admins can remove (not self-owner)"
  on public.tenant_members for delete
  using (
    public.current_member_role(tenant_id) in ('owner', 'admin')
    and not (user_id = auth.uid() and role = 'owner')
  );

-- ──────────────────────────────────────────────
-- AUDIT LOGS  (insert-only for authenticated)
-- ──────────────────────────────────────────────
alter table public.audit_logs enable row level security;

create policy "audit: admins can read"
  on public.audit_logs for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_member_role(tenant_id) in ('owner', 'admin')
  );

create policy "audit: members can insert"
  on public.audit_logs for insert
  with check (tenant_id = public.current_tenant_id());

-- ──────────────────────────────────────────────
-- PROFILES — specchio pubblico di auth.users
-- auth.users non è interrogabile dal client: i dati pubblici
-- dell'utente (email, nome, avatar) vivono qui.
-- ──────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Helper security-definer: l'utente corrente condivide un tenant con p_user?
-- Definer per evitare ricorsione di RLS su tenant_members.
create or replace function public.shares_tenant_with(p_user uuid)
returns boolean stable language sql security definer set search_path = public as $$
  select exists (
    select 1
    from public.tenant_members a
    join public.tenant_members b on a.tenant_id = b.tenant_id
    where a.user_id = auth.uid()
      and b.user_id = p_user
  );
$$;

-- ── RLS ──
alter table public.profiles enable row level security;

create policy "profiles: read own or co-members"
  on public.profiles for select
  using (id = auth.uid() or public.shares_tenant_with(id));

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── Auto-creazione di profilo + company alla registrazione ──
-- Crea SEMPRE il profilo; se nei metadati c'è un "company_name", crea anche
-- il tenant (company) con uno slug univoco e iscrive l'utente come "owner".
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_company text := coalesce(new.raw_user_meta_data ->> 'company_name', '');
  v_base    text;
  v_slug    text;
  v_suffix  int := 0;
  v_tenant  uuid;
begin
  -- 1) Profilo (sempre)
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  -- 2) Company + membership owner (solo se è stato indicato un nome azienda)
  if length(trim(v_company)) >= 2 then
    -- slug base: minuscole, alfanumerico, runs di altro → trattino, niente bordi
    v_base := trim(both '-' from left(lower(regexp_replace(v_company, '[^a-z0-9]+', '-', 'gi')), 50));
    if length(v_base) < 3 then
      v_base := 'azienda-' || left(replace(new.id::text, '-', ''), 8);
    end if;

    -- garantisci unicità dello slug
    v_slug := v_base;
    while exists (select 1 from public.tenants where slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug := left(v_base, 50) || '-' || v_suffix;
    end loop;

    insert into public.tenants (name, slug, owner_id, status, plan)
    values (left(v_company, 100), v_slug, new.id, 'active', 'free')
    returning id into v_tenant;

    insert into public.tenant_members (tenant_id, user_id, role, joined_at)
    values (v_tenant, new.id, 'owner', now());
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
