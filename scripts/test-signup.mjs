import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

const email = `tuttoazienda.claude.test.${Date.now()}@gmail.com`;
console.log("Provo signUp con:", email);

const { data, error } = await supabase.auth.signUp({
  email,
  password: "TestPassword123!",
  options: { data: { company_name: "Test Diagnostica SRL" } },
});

if (error) {
  console.log("\n=== ERRORE signUp ===");
  console.log("message:", error.message);
  console.log("status :", error.status);
  console.log("code   :", error.code);
} else {
  console.log("\n=== signUp OK ===");
  console.log("user id:", data.user?.id);
  console.log("session:", data.session ? "presente (conferma email OFF)" : "assente (conferma email ON)");
}
