import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoMode, DEMO_USER_EMAIL } from "@/config/demo";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await requireTenant().catch(() => null);

  // Non autenticato o non membro di questo tenant (RLS lo nasconde) → smista.
  if (!tenant) redirect("/app");
  if (tenant.status === "suspended") redirect("/login");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? (isDemoMode() ? DEMO_USER_EMAIL : "utente");

  return (
    <DashboardShell
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      userEmail={email}
    >
      {children}
    </DashboardShell>
  );
}
