import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

const email = `logintest.${Date.now()}@gmail.com`;
const password = "TestPassword123!";

console.log("1) signUp", email);
const su = await supabase.auth.signUp({
  email,
  password,
  options: { data: { company_name: "Login Test SRL" } },
});
console.log("   →", su.error ? `ERR ${su.error.code}: ${su.error.message}` : `ok · session: ${su.data.session ? "SI" : "NO"}`);

await supabase.auth.signOut();

console.log("2) signInWithPassword (login)");
const si = await supabase.auth.signInWithPassword({ email, password });
console.log("   →", si.error ? `ERR ${si.error.code}: ${si.error.message}` : `ok · session: ${si.data.session ? "SI" : "NO"}`);

if (si.data?.user) {
  console.log("3) risoluzione tenant post-login (come /app)");
  const { data: m, error: mErr } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", si.data.user.id)
    .maybeSingle();
  if (mErr) console.log("   membership ERR:", mErr.code, mErr.message);
  else if (!m) console.log("   → NESSUNA azienda → /app manderebbe a /onboarding");
  else {
    const { data: t } = await supabase.from("tenants").select("slug,name").eq("id", m.tenant_id).maybeSingle();
    console.log(`   → azienda: ${t?.name} (slug: ${t?.slug}) → /${t?.slug}/dashboard`);
  }
}
