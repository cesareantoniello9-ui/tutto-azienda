import type { Metadata } from "next";
import { Check } from "lucide-react";
import { requireTenant } from "@/lib/tenant/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Fatturazione" };

const plans = [
  {
    id: "free",
    name: "Free",
    price: "€ 0",
    features: ["1 utente", "1 azienda", "Funzioni base"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "€ 19",
    features: ["5 utenti", "CRM base", "Supporto email"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€ 49",
    features: ["Utenti illimitati", "CRM + Magazzino", "Supporto prioritario"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Su misura",
    features: ["SLA dedicato", "SSO", "Onboarding assistito"],
  },
];

export default async function BillingPage() {
  const tenant = await requireTenant();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Piano attuale</CardTitle>
          <CardDescription>
            Stai usando il piano{" "}
            <span className="font-medium uppercase">{tenant.plan}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            La gestione dei pagamenti è integrata con Stripe. Collega le chiavi
            Stripe per attivare upgrade e fatturazione automatica.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const current = plan.id === tenant.plan;
          return (
            <Card key={plan.id} className={cn(current && "border-primary ring-1 ring-primary")}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {current && <Badge>Attuale</Badge>}
                </div>
                <p className="text-2xl font-bold">{plan.price}</p>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="size-4 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  variant={current ? "outline" : "default"}
                  className="w-full"
                  disabled={current}
                >
                  {current ? "Piano attivo" : "Scegli"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
