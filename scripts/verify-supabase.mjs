import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("URL:", url);
console.log("Key prefix:", key?.slice(0, 24), "…");

const supabase = createClient(url, key);

// 1) Auth service raggiungibile + chiave accettata
try {
  const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
  console.log("AUTH /health:", res.status, (await res.text()).slice(0, 120));
} catch (e) {
  console.log("AUTH /health ERROR:", e.message);
}

// 2) Query REST a tenants (la tabella potrebbe non esistere ancora)
const { data, error } = await supabase.from("tenants").select("id").limit(1);
console.log(
  "REST tenants:",
  JSON.stringify({
    data,
    error: error ? { message: error.message, code: error.code } : null,
  })
);

// 3) Sessione (deve essere assente)
const { data: sess } = await supabase.auth.getSession();
console.log("session:", sess.session ? "present" : "none");
