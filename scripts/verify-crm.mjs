import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

const tables = [
  "clients",
  "leads",
  "opportunities",
  "quotes",
  "quote_items",
  "activities",
  "notes",
];

console.log("=== Esistenza tabelle + RLS (SELECT anonimo) ===");
for (const t of tables) {
  const { data, error } = await supabase.from(t).select("id").limit(1);
  if (error) {
    console.log(`${t.padEnd(14)} → ERR ${error.code}: ${error.message}`);
  } else {
    console.log(`${t.padEnd(14)} → OK (esiste) · righe viste da anonimo: ${data.length}`);
  }
}

console.log("\n=== RLS scrittura: INSERT anonimo su clients (atteso: NEGATO) ===");
const ins = await supabase
  .from("clients")
  .insert({ company_id: "00000000-0000-0000-0000-000000000000", name: "Intruso" })
  .select();
console.log(
  ins.error
    ? `NEGATO ✓ (code ${ins.error.code}: ${ins.error.message})`
    : `!!! CONSENTITO (problema RLS): ${JSON.stringify(ins.data)}`
);
