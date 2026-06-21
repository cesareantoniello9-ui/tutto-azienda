import type { Metadata } from "next";
import { requireTenant } from "@/lib/tenant/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { GeneralSettingsForm } from "@/modules/tenant/components/GeneralSettingsForm";

export const metadata: Metadata = { title: "Impostazioni generali" };

export default async function GeneralSettingsPage() {
  const tenant = await requireTenant();
  const s = tenant.settings;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generale</CardTitle>
        <CardDescription>
          Nome dell&apos;azienda e preferenze di localizzazione.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GeneralSettingsForm
          tenantId={tenant.id}
          defaultValues={{
            name: tenant.name,
            timezone: s.timezone,
            currency: s.currency,
            locale: s.locale,
          }}
        />
      </CardContent>
    </Card>
  );
}
