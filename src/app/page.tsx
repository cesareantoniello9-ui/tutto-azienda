import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  Users,
  Zap,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: ShieldCheck,
    title: "Dati isolati per azienda",
    desc: "Ogni azienda ha i propri dati, protetti a livello di database con Row-Level Security.",
  },
  {
    icon: Users,
    title: "Team e ruoli",
    desc: "Inviti, permessi e ruoli (owner, admin, member) gestiti in modo granulare.",
  },
  {
    icon: Zap,
    title: "Veloce e moderno",
    desc: "Costruito su Next.js 15 e Supabase per prestazioni elevate e sicurezza.",
  },
  {
    icon: BarChart3,
    title: "Tutto in un posto",
    desc: "La base pronta per i prossimi moduli: CRM, magazzino e molto altro.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Building2 className="size-5 text-primary" />
          Tutto.Azienda
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Accedi</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Inizia gratis</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-24 text-center">
          <span className="inline-flex items-center rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Piattaforma SaaS multi-tenant
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            Gestisci la tua azienda
            <br />
            in un unico posto
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Tutto.Azienda è la piattaforma che unifica i processi della tua impresa,
            con dati separati e sicuri per ogni organizzazione.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">
                Crea il tuo account
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Accedi</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        © 2026 Tutto.Azienda — Costruito con Next.js, Supabase e shadcn/ui
      </footer>
    </div>
  );
}
