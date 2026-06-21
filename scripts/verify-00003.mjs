import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

// 1) tabella profiles
const p = await supabase.from("profiles").select("id").limit(1);
console.log(
  "profiles table        →",
  p.error ? `ERR ${p.error.code}: ${p.error.message}` : "OK (esiste)"
);

// 2) funzione shares_tenant_with (helper RLS della migration)
const f = await supabase.rpc("shares_tenant_with", {
  p_user: "00000000-0000-0000-0000-000000000000",
});
console.log(
  "shares_tenant_with()  →",
  f.error ? `ERR ${f.error.code}: ${f.error.message}` : `OK (ritorna ${JSON.stringify(f.data)})`
);
