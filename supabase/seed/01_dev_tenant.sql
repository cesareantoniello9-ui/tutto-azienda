-- Development seed — DO NOT run in production
-- Creates a test tenant and a test user membership

insert into public.tenants (id, slug, name, plan, status, owner_id)
values (
  '00000000-0000-0000-0000-000000000001',
  'demo',
  'Demo Azienda SRL',
  'pro',
  'active',
  '00000000-0000-0000-0000-000000000099'  -- placeholder user id
)
on conflict (slug) do nothing;

insert into public.tenant_members (tenant_id, user_id, role, joined_at)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000099',
  'owner',
  now()
)
on conflict (tenant_id, user_id) do nothing;
