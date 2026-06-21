import { createSupabaseServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

interface AuditParams {
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(params: AuditParams) {
  const headerStore = await headers();
  const userId = headerStore.get("x-user-id");

  if (!userId) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("audit_logs").insert({
    tenant_id: params.tenantId,
    user_id: userId,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId ?? null,
    metadata: (params.metadata ?? {}) as never,
  });
}
