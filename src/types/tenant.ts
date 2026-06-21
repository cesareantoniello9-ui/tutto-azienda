export type TenantStatus = "active" | "suspended" | "trial" | "cancelled";
export type TenantPlan = "free" | "starter" | "pro" | "enterprise";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  plan: TenantPlan;
  status: TenantStatus;
  owner_id: string;
  settings: TenantSettings;
  created_at: string;
  updated_at: string;
}

export interface TenantSettings {
  timezone: string;
  locale: string;
  date_format: string;
  currency: string;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: MemberRole;
  invited_at: string;
  joined_at: string | null;
}

export type MemberRole = "owner" | "admin" | "member" | "viewer";
