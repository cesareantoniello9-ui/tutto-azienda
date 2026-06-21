"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createSupabaseBrowserClient() {
  // Fallback placeholder: evita che createBrowserClient lanci durante l'SSR
  // quando le env mancano. In produzione, con le env presenti, vengono usati
  // i valori reali (il placeholder è solo una rete di sicurezza anti-crash).
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
  );
}
