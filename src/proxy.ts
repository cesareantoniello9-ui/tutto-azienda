import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
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

  // Refresh sessione Supabase
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublicPath(pathname)) {
    return response;
  }

  // Redirect utenti non autenticati (saltato in modalità demo)
  if (!user && !isDemoMode()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Risolve e inietta il contesto tenant
  const tenantSlug = extractTenantSlug(request);
  if (tenantSlug) {
    response.headers.set("x-tenant-slug", tenantSlug);
  }
  response.headers.set("x-user-id", user?.id ?? DEMO_USER_ID);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
