/**
 * Verifica dello schema RAG "Memoriale" su un Supabase reale.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… node scripts/verify-rag.mjs
 *
 * Controlla che la migration 00005 sia applicata, che pgvector risponda e che
 * l'RLS neghi lettura e scrittura a un client anonimo.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Servono NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key);

const tables = [
  "rag_settings",
  "rag_documents",
  "rag_chunks",
  "rag_memories",
  "rag_conversations",
  "rag_messages",
  "rag_feedback",
  "rag_index_queue",
];

console.log("=== Esistenza tabelle + RLS (SELECT anonimo) ===");
for (const t of tables) {
  const { data, error } = await supabase.from(t).select("id").limit(1);
  if (error) {
    console.log(`${t.padEnd(18)} → ERR ${error.code}: ${error.message}`);
  } else {
    console.log(`${t.padEnd(18)} → OK (esiste) · righe viste da anonimo: ${data.length}`);
  }
}

console.log("\n=== Vista stato indice ===");
{
  const { data, error } = await supabase.from("rag_index_overview").select("*").limit(5);
  console.log(
    error
      ? `rag_index_overview → ERR ${error.code}: ${error.message}`
      : `rag_index_overview → OK · righe viste da anonimo: ${data.length}`,
  );
}

console.log("\n=== Funzioni di ricerca (RPC) ===");
const zeroVector = `[${new Array(1024).fill(0).join(",")}]`;

{
  const { data, error } = await supabase.rpc("rag_search_chunks", {
    p_query_embedding: zeroVector,
    p_query_text: "prova di ricerca",
    p_match_count: 3,
  });
  console.log(
    error
      ? `rag_search_chunks   → ERR ${error.code}: ${error.message}`
      : `rag_search_chunks   → OK · risultati per anonimo: ${data.length} (atteso 0 con RLS)`,
  );
}

{
  const { data, error } = await supabase.rpc("rag_search_memories", {
    p_query_embedding: zeroVector,
    p_query_text: "prova",
    p_match_count: 3,
  });
  console.log(
    error
      ? `rag_search_memories → ERR ${error.code}: ${error.message}`
      : `rag_search_memories → OK · risultati per anonimo: ${data.length} (atteso 0 con RLS)`,
  );
}

console.log("\n=== RLS scrittura: INSERT anonimo su rag_memories (atteso: NEGATO) ===");
const insert = await supabase
  .from("rag_memories")
  .insert({
    company_id: "00000000-0000-0000-0000-000000000000",
    content: "Ricordo inserito da un intruso",
  })
  .select();
console.log(
  insert.error
    ? `NEGATO ✓ (code ${insert.error.code}: ${insert.error.message})`
    : `!!! CONSENTITO (problema RLS): ${JSON.stringify(insert.data)}`,
);

console.log("\n=== Chiavi dei servizi esterni ===");
console.log(`ANTHROPIC_API_KEY → ${process.env.ANTHROPIC_API_KEY ? "presente" : "assente (risposte estrattive)"}`);
console.log(`VOYAGE_API_KEY    → ${process.env.VOYAGE_API_KEY ? "presente" : "assente (embedding locali)"}`);
console.log(`RAG_REINDEX_SECRET→ ${process.env.RAG_REINDEX_SECRET ? "presente" : "assente (webhook disattivato)"}`);
