/**
 * Lettura ROBUSTA delle credenziali Supabase dalle variabili d'ambiente.
 *
 * Tollera valori "sporchi" (es. del testo incollato per errore nel pannello env
 * di Vercel insieme al valore): estrae il primo URL `*.supabase.co` valido e la
 * prima chiave `sb_publishable_…` / anon JWT `eyJ…` presenti nel valore.
 *
 * Senza questa pulizia, un valore con caratteri non-Latin-1 (es. "—") finirebbe
 * nell'header `apikey`/`Authorization` e farebbe fallire ogni fetch con
 * "String contains non ISO-8859-1 code point".
 */

export function getSupabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const matches = [...raw.matchAll(/https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|net|in)/gi)];
  const valid = matches.find(
    (m) => !["placeholder", "your-project"].includes(m[1]!.toLowerCase()),
  );
  return (valid?.[0] ?? matches[0]?.[0] ?? raw).trim();
}

export function getSupabaseAnonKey(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  // publishable key (sb_publishable_… con underscore) oppure anon JWT (eyJ…)
  const match = raw.match(/sb_(?:publishable|secret)_[A-Za-z0-9_]+|eyJ[A-Za-z0-9._-]+/);
  // fallback: rimuove caratteri non stampabili/non-ASCII per non rompere gli header
  return (match?.[0] ?? raw.replace(/[^\x21-\x7E]/g, "")).trim();
}
