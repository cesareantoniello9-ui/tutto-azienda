"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseUrl, getSupabaseAnonKey } from "./env";

export function createSupabaseBrowserClient() {
  // getSupabaseUrl/Key estraggono valori validi anche da env "sporche".
  // Il fallback placeholder evita il crash dell'SSR quando le env mancano.
  return createBrowserClient<Database>(
    getSupabaseUrl() || "https://placeholder.supabase.co",
    getSupabaseAnonKey() || "placeholder-key",
  );
}
