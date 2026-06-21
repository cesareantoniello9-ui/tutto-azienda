import { requireTenant } from "@/lib/tenant/context";
import { SettingsNav } from "@/components/layout/SettingsNav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await requireTenant();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground">Gestisci {tenant.name}</p>
      </div>
      <SettingsNav tenantSlug={tenant.slug} />
      <div className="max-w-2xl">{children}</div>
    </div>
  );
}
