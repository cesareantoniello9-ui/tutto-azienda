# Tutto.Azienda

Piattaforma SaaS B2B **multi-tenant** per la gestione aziendale. Ogni azienda
(tenant) ha dati completamente separati, isolati a livello di database tramite
PostgreSQL Row-Level Security.

> Stato attuale: **fondamenta + area autenticata**. I moduli di business
> (CRM, Magazzino) verranno aggiunti come slice verticali separate.

## Stack

| Layer | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Linguaggio | TypeScript (strict) |
| UI | Tailwind CSS 4 + shadcn/ui + lucide-react |
| Form | react-hook-form + Zod |
| Stato server | TanStack Query |
| Auth / DB / Storage | Supabase (PostgreSQL) |
| Email | Resend |
| Pagamenti | Stripe |
| Test | Vitest |

## Avvio rapido

```bash
# 1. Installa le dipendenze
npm install

# 2. Crea il file di ambiente
cp .env.example .env.local
#    Lascia i valori placeholder per provare l'app in MODALITÀ DEMO,
#    oppure inserisci le chiavi reali di Supabase/Stripe/Resend.

# 3. Avvia in sviluppo
npm run dev          # http://localhost:3000
```

### Modalità demo

Quando `NEXT_PUBLIC_SUPABASE_URL` contiene `placeholder` (e non si è in
produzione), l'app entra in **modalità demo**: l'area autenticata è navigabile
senza un backend reale, con un tenant di esempio. Utile per rivedere l'interfaccia
prima di collegare Supabase. In produzione (URL reale) la modalità è sempre inerte.

Pagine visibili in demo: `/`, `/login`, `/register`, `/reset-password`,
`/onboarding`, `/<slug>/dashboard`, `/<slug>/settings/{general,members,billing}`.

## Comandi

| Comando | Descrizione |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` | Build di produzione |
| `npm run typecheck` | Controllo tipi TypeScript |
| `npm run test` | Test unitari (Vitest) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Rigenera i tipi da Supabase locale |
| `npm run db:migrate` | Applica le migration |

## Struttura

```
src/
├── app/
│   ├── (auth)/                 # login, register, reset/update-password, onboarding
│   ├── (tenant)/[tenantSlug]/  # area autenticata: dashboard, settings
│   ├── api/webhooks/           # Stripe, Supabase
│   ├── auth/callback/          # scambio code → sessione
│   ├── error.tsx · not-found.tsx · loading.tsx
│   └── layout.tsx              # provider globali (Theme, Query, Toaster)
├── components/
│   ├── ui/                     # componenti shadcn
│   ├── layout/                 # DashboardShell, SidebarNav, UserMenu, SettingsNav
│   └── providers/              # ThemeProvider, QueryProvider
├── modules/                    # slice verticali per dominio
│   ├── auth/                   # schema, actions, components
│   ├── tenant/                 # schema, actions, components
│   └── users/                  # queries
├── lib/
│   ├── supabase/               # client browser + server + service-role
│   ├── tenant/context.ts       # getCurrentTenant / requireTenant
│   ├── audit.ts · errors.ts · utils/
├── config/                     # env (Zod), demo
├── types/                      # database, tenant
└── proxy.ts                    # ex-middleware (Next 16): auth + tenant resolution

supabase/
├── migrations/                 # 00001_init, 00002_rls_policies
└── seed/
```

## Multi-tenancy

- Ogni tabella ha `tenant_id` e politiche **RLS** che vincolano ogni query al
  tenant dell'utente autenticato. Il database è l'unico confine di sicurezza.
- Il **proxy** (`src/proxy.ts`) risolve lo slug del tenant dal sottodominio
  (`{slug}.tuttoa.com`) — o dal primo segmento del path in locale — e inietta
  `x-tenant-slug` / `x-user-id` negli header.
- Il client non interroga mai Supabase direttamente per dati sensibili: legge da
  Server Component (`queries.ts`) e muta tramite Server Action (`actions.ts`).

## Convenzioni

Vedi [`CONVENTIONS.md`](./CONVENTIONS.md) e [`ARCHITECTURE.md`](../ARCHITECTURE.md).

- Componenti React: `PascalCase.tsx`; utility/azioni: `camelCase.ts`
- Colonne DB: `snake_case`; proprietà TS: `camelCase`
- Validazione con Zod su ogni input; nessun `any`
- I moduli non si importano tra loro: la logica condivisa va in `src/lib/`
