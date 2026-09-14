-- ============================================================
-- Tutto.Azienda — RAG "Memoriale" (migration 00005)
--
-- Memoria aziendale interrogabile in linguaggio naturale:
--   rag_documents   → un documento per ogni entità indicizzata (memoriale)
--   rag_chunks      → porzioni del documento + embedding + full-text italiano
--   rag_memories    → memoria a lungo termine (fatti, preferenze, decisioni)
--   rag_conversations / rag_messages / rag_feedback → chat + citazioni + voto
--   rag_index_queue → coda di re-indicizzazione alimentata da trigger
--   rag_settings    → knob per azienda (top-k, modello, glossario, tono…)
--
-- Multi-tenant: company_id → public.tenants(id). RLS su OGNI tabella, come per
-- il CRM (migration 00004): company_id = public.current_tenant_id().
-- Ri-eseguibile in sicurezza (reset in testa).
-- ============================================================

-- ---------- Reset idempotente ----------
drop view     if exists public.rag_index_overview cascade;
drop function if exists public.rag_search_chunks(vector, text, int, int, text[], double precision, int) cascade;
drop function if exists public.rag_search_memories(vector, text, int, double precision) cascade;
drop function if exists public.rag_touch_memories(uuid[]) cascade;
drop function if exists public.rag_enqueue_source() cascade;
drop function if exists public.rag_enqueue_tenant() cascade;

drop table if exists public.rag_feedback cascade;
drop table if exists public.rag_messages cascade;
drop table if exists public.rag_conversations cascade;
drop table if exists public.rag_memories cascade;
drop table if exists public.rag_chunks cascade;
drop table if exists public.rag_documents cascade;
drop table if exists public.rag_index_queue cascade;
drop table if exists public.rag_settings cascade;

drop type if exists rag_source_type cascade;
drop type if exists rag_memory_kind cascade;
drop type if exists rag_job_status cascade;
drop type if exists rag_message_role cascade;

-- ---------- Estensioni ----------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector: colonne embedding + HNSW

-- ---------- ENUM ----------
-- Origine di un documento del memoriale. 'manual' = testo caricato a mano
-- (procedure, listini, FAQ interne); 'file' = documento allegato.
create type rag_source_type as enum (
  'tenant','member','client','lead','opportunity','quote','activity','note','manual','file'
);
create type rag_memory_kind  as enum ('fact','preference','decision','event','metric','relationship');
create type rag_job_status   as enum ('pending','running','done','failed');
create type rag_message_role as enum ('user','assistant');

-- ============================================================
-- TABELLE
-- ============================================================

-- ---------- IMPOSTAZIONI RAG (una riga per azienda) ----------
create table public.rag_settings (
  company_id          uuid primary key references public.tenants(id) on delete cascade,
  assistant_name      text not null default 'Memoria Aziendale',
  -- Istruzioni aggiuntive dell'azienda (tono, priorità, cosa non dire…).
  system_instructions text,
  -- Glossario di dominio: [{ "term": "DDT", "definition": "Documento di trasporto" }]
  glossary            jsonb not null default '[]'::jsonb,
  enabled_sources     rag_source_type[] not null default
    array['tenant','member','client','lead','opportunity','quote','activity','note','manual','file']::rag_source_type[],
  top_k               smallint not null default 8  check (top_k between 1 and 50),
  candidate_pool      smallint not null default 40 check (candidate_pool between 1 and 200),
  min_similarity      numeric(3,2) not null default 0.15 check (min_similarity between 0 and 1),
  memory_enabled      boolean  not null default true,
  memory_top_k        smallint not null default 5 check (memory_top_k between 0 and 20),
  answer_model        text not null default 'claude-opus-5',
  embedding_model     text not null default 'voyage-3.5',
  effort              text not null default 'medium'
                      check (effort in ('low','medium','high','xhigh','max')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- DOCUMENTI (il "memoriale" di ogni entità) ----------
create table public.rag_documents (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.tenants(id) on delete cascade,
  source_type     rag_source_type not null,
  -- id della riga di origine (clients.id, leads.id, …). Per 'manual'/'file'
  -- coincide con un uuid generato: la chiave (company, type, source) resta unica.
  source_id       uuid not null default gen_random_uuid(),
  title           text not null,
  summary         text,
  -- Testo denormalizzato in linguaggio naturale: è ciò che l'LLM legge e cita.
  content         text not null,
  language        text not null default 'it',
  metadata        jsonb not null default '{}'::jsonb,
  -- sha256 di `content`: se non cambia, si evita di ricalcolare gli embedding.
  checksum        text not null,
  token_estimate  integer not null default 0,
  chunk_count     integer not null default 0,
  embedding_model text,
  indexed_at      timestamptz,
  is_stale        boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, source_type, source_id)
);

-- ---------- CHUNK (porzioni indicizzate) ----------
-- NOTA: vector(1024) = dimensione di voyage-3.5 (default Anthropic-compatible).
-- Cambiare modello di embedding con dimensione diversa richiede una migration.
create table public.rag_chunks (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.tenants(id) on delete cascade,
  document_id    uuid not null references public.rag_documents(id) on delete cascade,
  chunk_index    integer not null,
  content        text not null,
  token_estimate integer not null default 0,
  embedding      vector(1024),
  fts            tsvector generated always as (to_tsvector('italian', content)) stored,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (document_id, chunk_index)
);

-- ---------- MEMORIA A LUNGO TERMINE ----------
-- Fatti stabili estratti dalle conversazioni o inseriti a mano dall'utente.
-- Il "memoriale" vero e proprio: sopravvive alla singola chat.
create table public.rag_memories (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.tenants(id) on delete cascade,
  kind           rag_memory_kind not null default 'fact',
  content        text not null,
  importance     smallint not null default 3 check (importance between 1 and 5),
  confidence     numeric(3,2) not null default 0.70 check (confidence between 0 and 1),
  -- Entità a cui il ricordo si riferisce (facoltativa).
  subject_type   rag_source_type,
  subject_id     uuid,
  valid_from     timestamptz not null default now(),
  valid_until    timestamptz,
  -- Un ricordo aggiornato non si cancella: viene sostituito (storia tracciabile).
  superseded_by  uuid references public.rag_memories(id) on delete set null,
  pinned         boolean not null default false,
  hit_count      integer not null default 0,
  last_used_at   timestamptz,
  embedding      vector(1024),
  fts            tsvector generated always as (to_tsvector('italian', content)) stored,
  source_message_id uuid,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- CONVERSAZIONI ----------
create table public.rag_conversations (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.tenants(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  title           text not null default 'Nuova conversazione',
  message_count   integer not null default 0,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.rag_messages (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.rag_conversations(id) on delete cascade,
  role            rag_message_role not null,
  content         text not null,
  -- Citazioni restituite dal modello: [{ documentId, sourceType, title, citedText }]
  citations       jsonb not null default '[]'::jsonb,
  -- Diagnostica: chunk usati, memorie richiamate, modello, token, latenza.
  context         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create table public.rag_feedback (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.tenants(id) on delete cascade,
  message_id  uuid not null references public.rag_messages(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  rating      smallint not null check (rating in (-1, 1)),
  comment     text,
  created_at  timestamptz not null default now(),
  unique (message_id, user_id)
);

-- ---------- CODA DI RE-INDICIZZAZIONE ----------
create table public.rag_index_queue (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.tenants(id) on delete cascade,
  source_type  rag_source_type not null,
  source_id    uuid not null,
  operation    text not null default 'upsert' check (operation in ('upsert','delete')),
  status       rag_job_status not null default 'pending',
  attempts     smallint not null default 0,
  last_error   text,
  enqueued_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- ============================================================
-- INDEX
-- ============================================================
create index rag_documents_company_idx      on public.rag_documents (company_id);
create index rag_documents_type_idx         on public.rag_documents (company_id, source_type);
create index rag_documents_stale_idx        on public.rag_documents (company_id) where is_stale;

create index rag_chunks_company_idx         on public.rag_chunks (company_id);
create index rag_chunks_document_idx        on public.rag_chunks (document_id);
create index rag_chunks_fts_idx             on public.rag_chunks using gin (fts);
-- HNSW su distanza coseno: gli embedding sono normalizzati lato applicazione.
create index rag_chunks_embedding_idx       on public.rag_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

create index rag_memories_company_idx       on public.rag_memories (company_id, kind);
create index rag_memories_subject_idx       on public.rag_memories (company_id, subject_type, subject_id);
create index rag_memories_fts_idx           on public.rag_memories using gin (fts);
create index rag_memories_embedding_idx     on public.rag_memories
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
-- Ricordi "vivi": non sostituiti e non scaduti.
create index rag_memories_active_idx        on public.rag_memories (company_id)
  where superseded_by is null;

create index rag_conversations_company_idx  on public.rag_conversations (company_id, last_message_at desc);
create index rag_messages_conversation_idx  on public.rag_messages (conversation_id, created_at);
create index rag_feedback_message_idx       on public.rag_feedback (message_id);

create index rag_queue_pending_idx          on public.rag_index_queue (status, enqueued_at)
  where status = 'pending';
-- Evita di accodare cento volte la stessa entità in attesa.
create unique index rag_queue_pending_uniq  on public.rag_index_queue (company_id, source_type, source_id)
  where status = 'pending';

-- ============================================================
-- TRIGGER updated_at (riusa public.set_updated_at() della 00001)
-- ============================================================
create trigger rag_settings_updated_at      before update on public.rag_settings      for each row execute function public.set_updated_at();
create trigger rag_documents_updated_at     before update on public.rag_documents     for each row execute function public.set_updated_at();
create trigger rag_memories_updated_at      before update on public.rag_memories      for each row execute function public.set_updated_at();
create trigger rag_conversations_updated_at before update on public.rag_conversations for each row execute function public.set_updated_at();

-- ============================================================
-- TRIGGER DI ACCODAMENTO
-- Ogni modifica ai dati di business rende "stale" il memoriale corrispondente.
-- security definer: l'accodamento non deve mai far fallire la scrittura utente
-- (vale anche durante l'onboarding, quando la membership non esiste ancora).
-- ============================================================
create or replace function public.rag_enqueue_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type    rag_source_type;
  v_company uuid;
  v_source  uuid;
  v_op      text;
  v_row     record;
begin
  -- OLD/NEW vanno letti in rami separati: in un trigger DELETE `new` non è
  -- assegnato e referenziarlo — anche in un ramo non percorso — solleva errore.
  if tg_op = 'DELETE' then
    v_row := old;
    v_op  := 'delete';
  else
    v_row := new;
    v_op  := 'upsert';
  end if;

  v_type := case tg_table_name
              when 'clients'       then 'client'
              when 'leads'         then 'lead'
              when 'opportunities' then 'opportunity'
              when 'quotes'        then 'quote'
              when 'quote_items'   then 'quote'
              when 'activities'    then 'activity'
              when 'notes'         then 'note'
            end::rag_source_type;
  if v_type is null then
    return v_row;
  end if;

  v_company := v_row.company_id;

  -- Le righe di preventivo non sono un documento a sé: aggiornano il preventivo.
  -- Serve un IF, non un CASE: PL/pgSQL risolve i campi del record anche nel ramo
  -- non percorso, e `quote_id` non esiste sulle altre tabelle.
  if tg_table_name = 'quote_items' then
    v_source := v_row.quote_id;
    -- Una riga eliminata da un preventivo lo rende obsoleto, non lo cancella.
    v_op := 'upsert';
  else
    v_source := v_row.id;
  end if;

  insert into public.rag_index_queue (company_id, source_type, source_id, operation)
  values (v_company, v_type, v_source, v_op)
  on conflict (company_id, source_type, source_id) where status = 'pending'
  do update set operation = excluded.operation, enqueued_at = now();

  -- Note e attività aggiornano anche l'entità collegata: il memoriale del
  -- cliente contiene il riepilogo delle ultime interazioni.
  if tg_table_name in ('notes','activities') then
    insert into public.rag_index_queue (company_id, source_type, source_id, operation)
    select v_company, t.type, t.id, 'upsert'
    from (
      values ('client'::rag_source_type,      v_row.client_id),
             ('lead'::rag_source_type,        v_row.lead_id),
             ('opportunity'::rag_source_type, v_row.opportunity_id)
    ) as t(type, id)
    where t.id is not null
    on conflict (company_id, source_type, source_id) where status = 'pending'
    do update set enqueued_at = now();
  end if;

  return v_row;
end;
$$;

create or replace function public.rag_enqueue_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Ogni azienda nasce con le proprie impostazioni RAG.
  insert into public.rag_settings (company_id) values (new.id)
  on conflict (company_id) do nothing;

  insert into public.rag_index_queue (company_id, source_type, source_id, operation)
  values (new.id, 'tenant', new.id, 'upsert')
  on conflict (company_id, source_type, source_id) where status = 'pending'
  do update set enqueued_at = now();
  return new;
end;
$$;

create trigger clients_rag_enqueue       after insert or update or delete on public.clients       for each row execute function public.rag_enqueue_source();
create trigger leads_rag_enqueue         after insert or update or delete on public.leads         for each row execute function public.rag_enqueue_source();
create trigger opportunities_rag_enqueue after insert or update or delete on public.opportunities for each row execute function public.rag_enqueue_source();
create trigger quotes_rag_enqueue        after insert or update or delete on public.quotes        for each row execute function public.rag_enqueue_source();
create trigger quote_items_rag_enqueue   after insert or update or delete on public.quote_items   for each row execute function public.rag_enqueue_source();
create trigger activities_rag_enqueue    after insert or update or delete on public.activities    for each row execute function public.rag_enqueue_source();
create trigger notes_rag_enqueue         after insert or update or delete on public.notes         for each row execute function public.rag_enqueue_source();
create trigger tenants_rag_enqueue       after insert or update             on public.tenants     for each row execute function public.rag_enqueue_tenant();

-- ============================================================
-- RICERCA IBRIDA (vettoriale + full-text italiano), fusione RRF
-- security invoker → le policy RLS dell'utente restano l'unico confine.
-- ============================================================
create or replace function public.rag_search_chunks(
  p_query_embedding vector(1024) default null,
  p_query_text      text default null,
  p_match_count     int default 8,
  p_candidates      int default 40,
  p_source_types    text[] default null,
  p_min_similarity  double precision default 0,
  p_rrf_k           int default 60
)
returns table (
  chunk_id     uuid,
  document_id  uuid,
  source_type  text,
  source_id    uuid,
  title        text,
  content      text,
  chunk_index  integer,
  metadata     jsonb,
  similarity   double precision,
  lexical_rank double precision,
  score        double precision,
  updated_at   timestamptz
)
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_candidates int := greatest(coalesce(p_candidates, 40), coalesce(p_match_count, 8));
  v_tsq tsquery := case
                     when coalesce(btrim(p_query_text), '') = '' then null
                     else websearch_to_tsquery('italian', p_query_text)
                   end;
begin
  -- `websearch_to_tsquery` mette in AND i termini: per il recupero conviene
  -- l'OR, lasciando a `ts_rank_cd` il compito di premiare chi ne contiene di più
  -- (una domanda di dieci parole non deve trovarle tutte nello stesso chunk).
  if v_tsq is not null then
    v_tsq := nullif(replace(v_tsq::text, '&', '|'), '')::tsquery;
  end if;

  return query
  with semantic as (
    select c.id as cid,
           1 - (c.embedding <=> p_query_embedding) as sim,
           row_number() over (order by c.embedding <=> p_query_embedding) as rnk
    from public.rag_chunks c
    join public.rag_documents d on d.id = c.document_id
    where p_query_embedding is not null
      and c.embedding is not null
      and (p_source_types is null or d.source_type::text = any (p_source_types))
    order by c.embedding <=> p_query_embedding
    limit v_candidates
  ),
  lexical as (
    select c.id as cid,
           ts_rank_cd(c.fts, v_tsq)::double precision as lex,
           row_number() over (order by ts_rank_cd(c.fts, v_tsq) desc) as rnk
    from public.rag_chunks c
    join public.rag_documents d on d.id = c.document_id
    where v_tsq is not null
      and c.fts @@ v_tsq
      and (p_source_types is null or d.source_type::text = any (p_source_types))
    order by ts_rank_cd(c.fts, v_tsq) desc
    limit v_candidates
  ),
  fused as (
    select coalesce(s.cid, l.cid) as cid,
           coalesce(s.sim, 0)::double precision as similarity,
           coalesce(l.lex, 0)::double precision as lexical_rank,
           (coalesce(1.0 / (p_rrf_k + s.rnk), 0)
          + coalesce(1.0 / (p_rrf_k + l.rnk), 0))::double precision as score
    from semantic s
    full outer join lexical l on l.cid = s.cid
  )
  select c.id, c.document_id, d.source_type::text, d.source_id, d.title, c.content,
         c.chunk_index, d.metadata || c.metadata,
         f.similarity, f.lexical_rank, f.score, d.updated_at
  from fused f
  join public.rag_chunks c    on c.id = f.cid
  join public.rag_documents d on d.id = c.document_id
  -- Un risultato entra se è abbastanza simile OPPURE se lo ha trovato il full-text.
  where f.lexical_rank > 0 or f.similarity >= coalesce(p_min_similarity, 0)
  order by f.score desc, f.similarity desc
  limit coalesce(p_match_count, 8);
end;
$$;

create or replace function public.rag_search_memories(
  p_query_embedding vector(1024) default null,
  p_query_text      text default null,
  p_match_count     int default 5,
  p_min_similarity  double precision default 0
)
returns table (
  id           uuid,
  kind         text,
  content      text,
  importance   smallint,
  confidence   numeric,
  subject_type text,
  subject_id   uuid,
  pinned       boolean,
  similarity   double precision,
  created_at   timestamptz
)
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_tsq tsquery := case
                     when coalesce(btrim(p_query_text), '') = '' then null
                     else websearch_to_tsquery('italian', p_query_text)
                   end;
begin
  return query
  select m.id,
         m.kind::text,
         m.content,
         m.importance,
         m.confidence,
         m.subject_type::text,
         m.subject_id,
         m.pinned,
         case
           when p_query_embedding is null or m.embedding is null then 0
           else 1 - (m.embedding <=> p_query_embedding)
         end::double precision as similarity,
         m.created_at
  from public.rag_memories m
  where m.superseded_by is null
    and (m.valid_until is null or m.valid_until > now())
    and (
      m.pinned
      or (v_tsq is not null and m.fts @@ v_tsq)
      or (p_query_embedding is not null and m.embedding is not null
          and 1 - (m.embedding <=> p_query_embedding) >= coalesce(p_min_similarity, 0))
    )
  -- I ricordi fissati e importanti vincono a parità di pertinenza.
  order by m.pinned desc,
           (case
              when p_query_embedding is null or m.embedding is null then 0
              else 1 - (m.embedding <=> p_query_embedding)
            end) * 0.7 + (m.importance / 5.0) * 0.3 desc,
           m.created_at desc
  limit coalesce(p_match_count, 5);
end;
$$;

-- Aggiorna le statistiche d'uso dei ricordi effettivamente serviti a Claude.
create or replace function public.rag_touch_memories(p_ids uuid[])
returns void language sql security invoker set search_path = public as $$
  update public.rag_memories
     set hit_count = hit_count + 1,
         last_used_at = now()
   where id = any (coalesce(p_ids, '{}'::uuid[]));
$$;

-- Stato dell'indice per azienda (usato dalla pagina "Memoria").
create view public.rag_index_overview with (security_invoker = on) as
  select d.company_id,
         d.source_type::text as source_type,
         count(*)                                as documents,
         count(*) filter (where d.is_stale)      as stale_documents,
         coalesce(sum(d.chunk_count), 0)         as chunks,
         max(d.indexed_at)                       as last_indexed_at
  from public.rag_documents d
  group by d.company_id, d.source_type;

-- ============================================================
-- ROW LEVEL SECURITY — isolamento azienda su ogni tabella
-- ============================================================
alter table public.rag_settings      enable row level security;
alter table public.rag_documents     enable row level security;
alter table public.rag_chunks        enable row level security;
alter table public.rag_memories      enable row level security;
alter table public.rag_conversations enable row level security;
alter table public.rag_messages      enable row level security;
alter table public.rag_feedback      enable row level security;
alter table public.rag_index_queue   enable row level security;

create policy "rag_settings: isolamento azienda" on public.rag_settings for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "rag_documents: isolamento azienda" on public.rag_documents for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "rag_chunks: isolamento azienda" on public.rag_chunks for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "rag_memories: isolamento azienda" on public.rag_memories for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

-- Le conversazioni restano private a chi le ha aperte; l'azienda resta il
-- confine esterno (nessuno vede le chat di un'altra azienda).
create policy "rag_conversations: proprie conversazioni" on public.rag_conversations for all to authenticated
  using (company_id = public.current_tenant_id() and (user_id = auth.uid() or user_id is null))
  with check (company_id = public.current_tenant_id() and (user_id = auth.uid() or user_id is null));

create policy "rag_messages: messaggi delle proprie conversazioni" on public.rag_messages for all to authenticated
  using (
    company_id = public.current_tenant_id()
    and exists (
      select 1 from public.rag_conversations c
      where c.id = conversation_id
        and c.company_id = public.current_tenant_id()
        and (c.user_id = auth.uid() or c.user_id is null)
    )
  )
  with check (
    company_id = public.current_tenant_id()
    and exists (
      select 1 from public.rag_conversations c
      where c.id = conversation_id
        and c.company_id = public.current_tenant_id()
        and (c.user_id = auth.uid() or c.user_id is null)
    )
  );

create policy "rag_feedback: isolamento azienda" on public.rag_feedback for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

-- La coda è di sola lettura per l'utente: la scrive il trigger, la consuma il
-- worker con la service-role key.
create policy "rag_index_queue: lettura azienda" on public.rag_index_queue for select to authenticated
  using (company_id = public.current_tenant_id());

-- ============================================================
-- GRANT espliciti
-- Su Supabase i privilegi di default coprono già `public`, ma dichiararli qui
-- rende la migration autosufficiente (e applicabile con un ruolo diverso da
-- `postgres`). L'accesso resta comunque filtrato dalle policy RLS qui sopra.
-- ============================================================
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'rag_settings','rag_documents','rag_chunks','rag_memories',
    'rag_conversations','rag_messages','rag_feedback','rag_index_queue'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant all on public.%I to service_role', v_table);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.rag_index_overview to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.rag_index_overview to service_role;
  end if;
end$$;

-- ============================================================
-- BOOTSTRAP — impostazioni di default per le aziende esistenti
-- ============================================================
insert into public.rag_settings (company_id)
select t.id from public.tenants t
on conflict (company_id) do nothing;

-- Prima indicizzazione: tutto ciò che esiste finisce in coda.
-- I cast espliciti servono: in una UNION i letterali restano `text` e non
-- verrebbero convertiti implicitamente nell'enum della colonna.
insert into public.rag_index_queue (company_id, source_type, source_id, operation)
select t.id, 'tenant'::rag_source_type, t.id, 'upsert' from public.tenants t
union all select c.company_id, 'client'::rag_source_type,      c.id, 'upsert' from public.clients c
union all select l.company_id, 'lead'::rag_source_type,        l.id, 'upsert' from public.leads l
union all select o.company_id, 'opportunity'::rag_source_type, o.id, 'upsert' from public.opportunities o
union all select q.company_id, 'quote'::rag_source_type,       q.id, 'upsert' from public.quotes q
union all select a.company_id, 'activity'::rag_source_type,    a.id, 'upsert' from public.activities a
union all select n.company_id, 'note'::rag_source_type,        n.id, 'upsert' from public.notes n
on conflict do nothing;
