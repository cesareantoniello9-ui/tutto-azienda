# Coding Conventions — Tutto.Azienda

## TypeScript

- `strict: true` — no exceptions
- Prefer `type` over `interface` for data shapes; use `interface` only for extendable contracts
- Never use `any`; use `unknown` + type guards when type is truly unknown
- All server actions and API routes return typed objects, never `any`

## File naming

| Pattern | Example |
|---|---|
| React components | `PascalCase.tsx` |
| Server actions, queries, utils | `camelCase.ts` |
| Route files | Next.js convention (`page.tsx`, `layout.tsx`, `route.ts`) |
| SQL migrations | `00001_description.sql` (zero-padded, sequential) |

## Module rules (vertical slice)

Each module in `src/modules/{name}/` owns its own:
- `actions.ts` — server actions (mutations, "use server" at top)
- `queries.ts` — server-side reads (cached with React `cache()`)
- `schema.ts` — Zod validation schemas
- `types.ts` — domain types
- `components/` — UI scoped to this module

**Cross-module imports are forbidden** — modules must not import from each other.
Shared logic belongs in `src/lib/`.

## Data access rules

- Server Components fetch directly via `queries.ts`
- Mutations go through `actions.ts` (server actions) or `POST /api/` routes
- The client never queries Supabase directly — only via server actions or API
- Every query that touches tenant data uses the anon key (RLS enforced)
- Administrative mutations use the service-role key (only in server-side code)

## Error handling

- Throw typed errors from `src/lib/errors.ts`
- API routes catch with `toApiError()` and return `{ error, code, status }`
- Server actions `throw` directly; errors are caught by React error boundaries
- Never swallow errors silently

## Naming conventions

- Database columns: `snake_case`
- TypeScript properties: `camelCase` (mapped via Supabase codegen)
- Env vars: `SCREAMING_SNAKE_CASE`
- CSS classes: Tailwind utilities only — no custom CSS unless absolutely necessary

## Git

- Branch: `feat/`, `fix/`, `chore/`, `docs/` prefixes
- Commits: Conventional Commits (`feat: add tenant switcher`)
- PRs require at least 1 review before merge to `main`
- `main` is always deployable
