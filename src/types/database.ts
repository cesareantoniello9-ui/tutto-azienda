// Placeholder — sostituisci con: npm run db:generate (richiede Supabase locale attivo)

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type TenantStatus = "active" | "suspended" | "trial" | "cancelled";
export type TenantPlan = "free" | "starter" | "pro" | "enterprise";
export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          logo_url: string | null;
          plan: TenantPlan;
          status: TenantStatus;
          owner_id: string;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          logo_url?: string | null;
          plan?: TenantPlan;
          status?: TenantStatus;
          owner_id: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          logo_url?: string | null;
          plan?: TenantPlan;
          status?: TenantStatus;
          owner_id?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_members: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          role: MemberRole;
          invited_at: string;
          joined_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          role?: MemberRole;
          invited_at?: string;
          joined_at?: string | null;
        };
        Update: {
          role?: MemberRole;
          joined_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      tenant_status: TenantStatus;
      tenant_plan: TenantPlan;
      member_role: MemberRole;
    };
  };
}
