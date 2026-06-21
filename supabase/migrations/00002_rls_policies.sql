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
