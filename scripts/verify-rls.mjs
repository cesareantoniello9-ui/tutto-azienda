import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

// 1) anon SELECT → deve restituire [] (RLS nasconde le righe)
const sel = await supabase.from("tenants").select("id").limit(1);
console.log(
  "anon SELECT tenants  →",
  JSON.stringify({ rows: sel.data, error: sel.error?.message ?? null })
);

// 2) anon INSERT → deve essere NEGATO da RLS
const ins = await supabase
  .from("tenants")
  .insert({
    name: "Intruso",
    slug: "intruso-" + Date.now().toString().slice(-5),
    owner_id: "00000000-0000-0000-0000-000000000000",
  })
  .select();
console.log(
  "anon INSERT tenants  →",
  JSON.stringify({
    rows: ins.data,
    denied: !!ins.error,
    error: ins.error ? { code: ins.error.code, msg: ins.error.message } : null,
  })
);

// 3) esistenza delle altre tabelle
for (const t of ["tenant_members", "audit_logs"]) {
  const r = await supabase.from(t).select("id").limit(1);
  console.log(`table ${t.padEnd(14)} →`, r.error ? `ERR ${r.error.code}` : "OK (esiste)");
}
