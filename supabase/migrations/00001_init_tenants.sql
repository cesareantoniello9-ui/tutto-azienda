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
