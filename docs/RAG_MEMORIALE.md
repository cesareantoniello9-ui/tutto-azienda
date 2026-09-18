# RAG "Memoriale" — memoria aziendale interrogabile

Ogni azienda su Tutto.Azienda accumula informazioni: schede clienti, lead,
trattative, preventivi, attività, note. Il **memoriale** rende tutto questo
interrogabile in italiano — con le fonti sempre citate e l'isolamento fra
aziende garantito dal database, non dal codice applicativo.

```
 fonti                       memoriale                      risposta
 ─────                       ─────────                      ────────
 CRM: clients,     trigger   rag_documents   ricerca ibrida   Claude Opus 5
 leads, quotes,    ───────▶  + rag_chunks    ─────────────▶   con blocchi
 opportunities…    coda      (embedding +    RRF + riordino   `document`
 allegati (PDF,              full-text it)                   → citazioni reali
 DOCX) · email ·                    ▲                              │
 riepilogo serale        rag_memories ◀────── estrazione ───────────┘
                        (memoria a lungo termine)
```

## Componenti

| Percorso | Ruolo |
|---|---|
| `supabase/migrations/00005_rag_memoriale.sql` | Schema, RLS, trigger, funzioni di ricerca |
| `supabase/migrations/00006_…` + `00007_rag_fonti_estese.sql` | Riepilogo giornaliero, allegati, email, valutazione |
| `src/lib/rag/` | Motore puro: chunking, embedding, serializzazione, prompt, riordino |
| `src/services/rag/` | Accesso al database: indicizzazione, ricerca, conversazioni, ricordi |
| `src/modules/rag/` | Schema Zod, Server Action, componenti UI |
| `src/app/(tenant)/[tenantSlug]/memoria/` | Pagina + route SSE `POST …/memoria/ask` |
| `src/app/api/webhooks/rag-index/` | Worker di indicizzazione per cron esterni |
| `src/app/api/webhooks/rag-daily/` | Riepilogo di fine giornata (cron serale) |
| `src/app/api/webhooks/rag-email/` | Email in ingresso dal provider di posta |
| `tests/eval/` + `tests/fixtures/` | Valutazione automatica del recupero in CI |
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

## Le fonti

### CRM
Clienti, lead, trattative, preventivi (righe incluse), attività e note: ogni
entità diventa una scheda in italiano, aggiornata dai trigger a ogni modifica.

### Riepilogo di fine giornata
Ogni sera (`POST /api/webhooks/rag-daily`) il sistema legge la giornata e scrive
«cosa abbiamo fatto oggi»: trattative aperte e chiuse, preventivi emessi e
accettati, attività completate, note, email, allegati. **I numeri li calcola il
database** (`buildDailySnapshot`, funzione pura); Claude scrive solo la
narrazione, e senza chiave il riepilogo viene comunque compilato dai fatti.

Il riepilogo entra nell'indice come gli altri documenti: «quando abbiamo deciso
di rivedere il prezzo a Bianchi?» diventa una domanda con risposta, mesi dopo.

La classificazione usa il **fuso orario dell'azienda** (`tenants.settings.timezone`):
un'attività delle 23:30 appartiene alla giornata giusta.

### Allegati (PDF, DOCX, testo)
Il file va in Supabase Storage (bucket privato `rag-files`, percorso
`{company_id}/{file_id}.ext`); in tabella resta il testo estratto — PDF via
`unpdf`, DOCX via `mammoth`. Un PDF scansionato non contiene testo: viene
marcato `unsupported` invece di entrare nell'indice come documento vuoto (per
quello servirebbe un OCR, che è una scelta a parte).

### Email e comunicazioni
`POST /api/webhooks/rag-email` accetta il formato dell'app e i payload dei
provider più diffusi (Resend, Postmark, SendGrid, Mailgun), riconosce l'azienda
dagli indirizzi coinvolti e collega la email al cliente o al lead.

**Privacy come impostazione predefinita:** entra solo la posta legata a un
contatto già presente nel CRM (per indirizzo o per dominio). Le altre vengono
scartate con un motivo esplicito. Due leve in `rag_settings`:
`email_only_known_contacts` (disattivabile) e `email_allowed_domains`.

La catena citata («Il giorno … ha scritto:», righe con `>`) viene tagliata: senza,
ogni risposta reindicizzerebbe l'intera conversazione precedente.

## Valutazione automatica

Misurare invece di giudicare a sensazione. Quattro metriche:

| Metrica | Domanda a cui risponde |
|---|---|
| `recall@k` | Il documento giusto è stato recuperato? |
| `MRR` | Era in cima o in fondo? |
| Risposte ancorate | La risposta cita davvero il contesto recuperato? |
| Dati attesi presenti | Importi e scadenze attesi compaiono nella risposta? |

Due livelli:

- **In CI** — `tests/eval/rag-golden.test.ts` esegue l'insieme di riferimento
  (`tests/fixtures/rag-golden-cases.json`) sul corpus dimostrativo con embedding
  locali deterministici: nessun database, nessuna chiave, stesso risultato a ogni
  esecuzione. Le soglie stanno sotto il valore attuale (recall ≥ 0,75, MRR ≥ 0,60):
  servono a intercettare i peggioramenti, non a fotografare la prestazione del giorno.
- **Sui dati reali** — la scheda «Qualità» della pagina Memoria: si scrivono le
  domande che il team fa davvero, si misura il recupero (gratis) o le risposte
  complete (una chiamata al modello per caso), e ogni giro resta in
  `rag_eval_runs` per confrontare le versioni nel tempo.

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
| `RAG_REINDEX_SECRET` | Webhook di re-indicizzazione e riepilogo disattivati (HTTP 503) |
| `RAG_EMAIL_SECRET` | Webhook email: ricade su `RAG_REINDEX_SECRET` |
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

### Riepilogo serale

```bash
# Una volta al giorno, dopo l'orario di chiusura (rag_settings.daily_recap_hour).
curl -X POST https://<dominio>/api/webhooks/rag-daily \
  -H "Authorization: Bearer $RAG_REINDEX_SECRET" \
  -H "Content-Type: application/json" -d '{}'
```

### Email in ingresso

```bash
curl -X POST https://<dominio>/api/webhooks/rag-email \
  -H "Authorization: Bearer $RAG_EMAIL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"from":"acquisti@cliente.it","to":["info@azienda.it"],
       "subject":"Richiesta offerta","text":"Ci serve un preventivo."}'
```

Da configurare come webhook di posta in arrivo sul provider. L'azienda si deduce
dagli indirizzi; in alternativa si passa `companyId` o `companySlug`, oppure si
usa un indirizzo di servizio con il suffisso (`memoria+{slug}@dominio`).

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
- I PDF scansionati restano fuori dall'indice: manca un OCR.
- L'ingestione email è un webhook: non c'è ancora una sincronizzazione IMAP o
  OAuth Gmail/Outlook che vada a prendere la posta da sola.
- La posta in uscita entra solo se il provider la inoltra al webhook
  (`direction: "outbound"`).

## Test

```bash
npm run test   # 8 suite dedicate + la valutazione automatica del recupero
```

Le funzioni pure del motore sono testabili senza database e senza rete: gli
embedding locali sono deterministici, quindi il recupero è riproducibile.
