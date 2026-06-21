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
