# RAG "Memoriale" — memoria aziendale interrogabile

Ogni azienda su Tutto.Azienda accumula informazioni: schede clienti, lead,
trattative, preventivi, attività, note. Il **memoriale** rende tutto questo
interrogabile in italiano — con le fonti sempre citate e l'isolamento fra
aziende garantito dal database, non dal codice applicativo.

```
 dati di business            memoriale                      risposta
 ────────────────            ─────────                      ────────
 clients, leads,   trigger   rag_documents   ricerca ibrida   Claude Opus 5
 opportunities,    ───────▶  + rag_chunks    ─────────────▶   con blocchi
 quotes, notes,    coda      (embedding +    RRF + riordino   `document`
 activities, …               full-text it)                   → citazioni reali
                                   ▲                              │
                             rag_memories ◀────── estrazione ─────┘
                             (memoria a lungo termine)
```

## Componenti

| Percorso | Ruolo |
|---|---|
| `supabase/migrations/00005_rag_memoriale.sql` | Schema, RLS, trigger, funzioni di ricerca |
| `src/lib/rag/` | Motore puro: chunking, embedding, serializzazione, prompt, riordino |
| `src/services/rag/` | Accesso al database: indicizzazione, ricerca, conversazioni, ricordi |
| `src/modules/rag/` | Schema Zod, Server Action, componenti UI |
| `src/app/(tenant)/[tenantSlug]/memoria/` | Pagina + route SSE `POST …/memoria/ask` |
| `src/app/api/webhooks/rag-index/` | Worker di indicizzazione per cron esterni |
| `scripts/verify-rag.mjs` | Verifica dello schema su un Supabase reale |

## Come funziona

### 1. Indicizzazione

I trigger su `clients`, `leads`, `opportunities`, `quotes`, `quote_items`,
`activities`, `notes` e `tenants` accodano l'entità modificata in
`rag_index_queue`. Una nota o un'attività accodano **anche** l'entità collegata:
la scheda del cliente contiene il riepilogo delle ultime interazioni, quindi va
riscritta.

Il worker (`ragIndexService.ingestCompany`) carica il grafo aziendale con una
query per tabella, serializza ogni entità in un documento in italiano
(`src/lib/rag/serialize.ts`), calcola il checksum SHA-256 e — **solo se il testo
è cambiato** — ricalcola gli embedding. È l'ottimizzazione che rende sostenibile
la re-indicizzazione continua: modificare il telefono di un cliente non costa
nulla se il testo generato non cambia.

I documenti non sono JSON: sono schede leggibili, con i nomi al posto degli id,
le date in formato italiano e gli importi in euro. Il modello cita testo che una
persona può verificare.

### 2. Recupero

`rag_search_chunks` esegue **due ricerche e le fonde** (Reciprocal Rank Fusion):

- **vettoriale** — `pgvector`, distanza coseno, indice HNSW;
- **full-text italiano** — `to_tsvector('italian', …)`, con i termini in OR così
  che una domanda lunga non debba trovare tutte le parole nello stesso chunk.

Il riordino applicativo (`src/lib/rag/ranking.ts`) aggiunge deduplica, sconto per
anzianità, diversificazione (max 3 chunk per documento) e taglio a budget.

### 3. Generazione

`src/lib/rag/answer.ts` invia i chunk come blocchi `document` con
`citations: { enabled: true }`: le citazioni arrivano dall'API con il testo
esatto citato, non da marcatori inventati nel prompt. Modello predefinito
**`claude-opus-5`** con adaptive thinking, streaming SSE e fallback lato server
in caso di rifiuto per policy.

### 4. Memoria a lungo termine

Dopo ogni scambio, un'estrazione con structured outputs individua i fatti
stabili («paga a 60 giorni», «il listino cambia a gennaio») e li salva in
`rag_memories`, scartando i duplicati (similarità di Jaccard ≥ 0.75). I ricordi
non si modificano: si **sostituiscono** (`superseded_by`), così la storia resta
verificabile. Quelli `pinned` entrano sempre nel contesto.

## Isolamento fra aziende

Ogni tabella `rag_*` ha RLS con `company_id = public.current_tenant_id()`, come
il CRM. Le funzioni di ricerca sono `security invoker`: girano con i privilegi
di chi chiama, quindi l'RLS resta l'unico confine. Le conversazioni sono inoltre
private all'utente che le ha aperte.

Verificato su Postgres 16 + pgvector: due aziende con chunk dall'embedding
identico restano invisibili l'una all'altra, anche attraverso l'RPC.

## Configurazione

| Variabile | Effetto se assente |
|---|---|
| `ANTHROPIC_API_KEY` | Nessuna sintesi: la risposta mostra gli estratti trovati, dichiarandolo |
| `VOYAGE_API_KEY` | Embedding locali deterministici: ricerca prevalentemente lessicale |
| `SUPABASE_SERVICE_ROLE_KEY` | Indicizzazione non disponibile (serve per scrivere i chunk) |
| `RAG_REINDEX_SECRET` | Webhook di re-indicizzazione disattivato (HTTP 503) |
| `RAG_ANSWER_MODEL` | Default `claude-opus-5` |
| `RAG_EMBEDDING_MODEL` | Default `voyage-3.5` (1024 dimensioni) |
| `RAG_EFFORT` | Default `medium` (`low` … `max`) |

Le impostazioni **per azienda** (top-k, glossario, istruzioni, origini attive,
modello) vivono in `rag_settings` e vincono sui default globali.

> La colonna embedding è `vector(1024)`: cambiare modello con una dimensione
> diversa richiede una nuova migration.

## Indicizzazione periodica

```bash
curl -X POST https://<dominio>/api/webhooks/rag-index \
  -H "Authorization: Bearer $RAG_REINDEX_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 200}'
```

Senza `companyId` processa le aziende con lavoro in coda (max 20 per giro). Con
`"full": true` ricostruisce l'intero indice dell'azienda indicata.

Dall'interfaccia, la card «Stato dell'indice» fa la stessa cosa su richiesta.

## Costi

Due voci: **embedding** (una volta per documento che cambia) e **generazione**
(per domanda). Le leve già presenti:

- checksum → nessun re-embedding se il testo non cambia;
- prompt caching sul prefisso stabile del system prompt;
- `top_k` e `candidate_pool` per azienda;
- `effort` per azienda (`low` per le domande semplici).

## Limiti noti

- Il worker carica in memoria fino a 5.000 righe per tabella: oltre quella
  soglia serve un'indicizzazione incrementale per lotti.
- L'indice HNSW è globale, non partizionato per azienda: con molte aziende molto
  grandi conviene valutare un indice parziale o `ivfflat` con liste dedicate.
- L'estrazione dei ricordi costa una chiamata extra al modello per ogni scambio:
  si può disattivare con `memory_enabled = false`.
- Non c'è ancora ricerca su allegati (PDF/DOCX): l'origine `file` è predisposta
  nello schema ma non ha ancora una pipeline di estrazione testo.

## Test

```bash
npm run test   # 5 suite dedicate: chunking, serializzazione, recupero, prompt, schema
```

Le funzioni pure del motore sono testabili senza database e senza rete: gli
embedding locali sono deterministici, quindi il recupero è riproducibile.
