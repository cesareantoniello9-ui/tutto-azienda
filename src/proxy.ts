import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase/env";
import { isDemoMode, DEMO_USER_ID } from "@/config/demo";

// Next.js 16: il vecchio "middleware" è ora "proxy" (stessa funzionalità).
// Docs: node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
  "/auth/callback",
  "/_next",
  "/favicon.ico",
  "/api/webhooks",
];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true; // landing page pubblica
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function extractTenantSlug(request: NextRequest): string | null {
  const hostname = request.headers.get("host") ?? "";
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "tuttoa.com";

  // subdomain.tuttoa.com → subdomain
  if (hostname.endsWith(`.${appDomain}`)) {
    return hostname.replace(`.${appDomain}`, "");
  }

  // localhost dev: primo segmento del path usato come slug
  if (hostname.includes("localhost")) {
    const slug = request.nextUrl.pathname.split("/")[1];
    return slug || null;
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Refresh sessione Supabase. Se le env mancano o l'auth fallisce, degrada a
  // utente anonimo senza far crashare il sito (niente 500 a livello di proxy).
  let user: User | null = null;
  const supaUrl = getSupabaseUrl();
  const supaKey = getSupabaseAnonKey();
  if (supaUrl && supaKey) {
    try {
      const supabase = createServerClient<Database>(supaUrl, supaKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      });
      user = (await supabase.auth.getUser()).data.user;
    } catch {
      // Supabase non configurato/raggiungibile → utente anonimo.
    }
  }

  if (isPublicPath(pathname)) {
    return response;
  }

  // Redirect utenti non autenticati (saltato in modalità demo)
  if (!user && !isDemoMode()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Risolve e inietta il contesto tenant NELLE HEADER DI RICHIESTA: è così che
  // `headers()` lo vede lato server (`lib/tenant/context.ts`, `lib/audit.ts`).
  // Impostarlo sulla risposta lo manderebbe al client senza renderlo leggibile
  // dal server — vedi `node_modules/next/dist/docs/.../proxy.md` § Setting headers.
  const tenantSlug = extractTenantSlug(request);
  const requestHeaders = new Headers(request.headers);
  if (tenantSlug) {
    requestHeaders.set("x-tenant-slug", tenantSlug);
  }
  requestHeaders.set("x-user-id", user?.id ?? DEMO_USER_ID);

  const withContext = NextResponse.next({ request: { headers: requestHeaders } });
  // I cookie di sessione aggiornati da Supabase vanno riportati sulla risposta finale.
  for (const cookie of response.cookies.getAll()) {
    withContext.cookies.set(cookie);
  }

  return withContext;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
