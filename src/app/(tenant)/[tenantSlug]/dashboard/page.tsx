import type { Metadata } from "next";
import {
  Wallet,
  Users,
  ShoppingCart,
  Activity,
  UserPlus,
  CreditCard,
  Building2,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { requireTenant } from "@/lib/tenant/context";
import { Badge } from "@/components/ui/badge";
import { KpiCard, type Kpi } from "@/components/dashboard/KpiCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import {
  RecentActivity,
  type ActivityItem,
} from "@/components/dashboard/RecentActivity";

export const metadata: Metadata = { title: "Dashboard" };

// Dati dimostrativi — verranno sostituiti dai moduli reali (CRM, fatturazione…).
const kpis: Kpi[] = [
  { label: "Ricavi (MTD)", value: "€ 24.580", deltaPct: 12.4, icon: Wallet, caption: "rispetto al mese scorso" },
  { label: "Clienti attivi", value: "1.284", deltaPct: 4.1, icon: Users, caption: "+52 questo mese" },
  { label: "Ordini", value: "312", deltaPct: 8.7, icon: ShoppingCart, caption: "negli ultimi 30 giorni" },
  { label: "Conversione", value: "3,8%", deltaPct: -0.6, icon: Activity, caption: "media del periodo" },
];

const revenue = {
  total: "€ 24.580",
  deltaPct: 12.4,
  data: [14200, 16800, 15400, 19200, 18100, 22600, 24580],
  labels: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug"],
};

const activity: ActivityItem[] = [
  { id: "1", icon: UserPlus, title: "Nuovo membro", description: "Giulia Rossi si è unita al team", time: "5 min" },
  { id: "2", icon: CreditCard, title: "Pagamento ricevuto", description: "Fattura #1042 — € 1.250,00", time: "1 ora" },
  { id: "3", icon: Building2, title: "Azienda aggiornata", description: "Modificati i dati di fatturazione", time: "3 ore" },
  { id: "4", icon: FileText, title: "Nuovo documento", description: "Contratto cliente caricato", time: "Ieri" },
  { id: "5", icon: ShieldCheck, title: "Accesso sicurezza", description: "Nuovo login da Milano, IT", time: "Ieri" },
];

export default async function DashboardPage() {
  const tenant = await requireTenant();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Panoramica di {tenant.name} · dati dimostrativi
          </p>
        </div>
        <Badge variant="secondary" className="uppercase">
          Piano {tenant.plan}
        </Badge>
      </div>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* Grafico + Attività */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart
            total={revenue.total}
            deltaPct={revenue.deltaPct}
            data={revenue.data}
            labels={revenue.labels}
          />
        </div>
        <div className="lg:col-span-1">
          <RecentActivity items={activity} />
        </div>
      </div>
    </div>
  );
}
