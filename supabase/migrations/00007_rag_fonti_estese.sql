-- ============================================================
-- Tutto.Azienda — fonti estese del memoriale (migration 00007)
--
--   rag_daily_recaps → riepilogo di fine giornata, generato ogni sera
--   rag_files        → allegati (PDF, DOCX, testo) con il testo estratto
--   rag_emails       → email e comunicazioni con clienti e lead
--   rag_eval_*       → valutazione automatica della qualità delle risposte
--
-- Tutte le tabelle alimentano `rag_index_queue` con gli stessi trigger della
-- 00005: una volta indicizzate diventano documenti citabili come gli altri.
-- RLS identica al resto: company_id = public.current_tenant_id().
-- ============================================================

-- ---------- Reset idempotente ----------
drop table if exists public.rag_eval_results cascade;
drop table if exists public.rag_eval_runs cascade;
drop table if exists public.rag_eval_cases cascade;
drop table if exists public.rag_emails cascade;
drop table if exists public.rag_files cascade;
drop table if exists public.rag_daily_recaps cascade;
drop function if exists public.rag_enqueue_source_row() cascade;

-- ============================================================
-- IMPOSTAZIONI — nuove leve per azienda
-- ============================================================
alter table public.rag_settings
  add column if not exists daily_recap_enabled boolean not null default true,
  -- Ora locale in cui il cron genera il riepilogo (informativa: lo scheduler è esterno).
  add column if not exists daily_recap_hour smallint not null default 19
    check (daily_recap_hour between 0 and 23),
  add column if not exists email_ingestion_enabled boolean not null default true,
  -- Privacy: per impostazione predefinita entra SOLO la posta legata a un
  -- contatto già presente nel CRM (cliente o lead). Il resto viene scartato.
  add column if not exists email_only_known_contacts boolean not null default true,
  -- Domini sempre ammessi anche senza corrispondenza nel CRM (es. fornitori).
  add column if not exists email_allowed_domains text[] not null default '{}'::text[];

-- Le nuove origini entrano fra quelle attive per impostazione predefinita.
alter table public.rag_settings
  alter column enabled_sources set default
    array['tenant','member','client','lead','opportunity','quote','activity','note',
          'manual','file','daily','email']::rag_source_type[];

update public.rag_settings
   set enabled_sources = enabled_sources || array['daily','email']::rag_source_type[]
 where not (enabled_sources @> array['daily','email']::rag_source_type[]);

-- ============================================================
-- RIEPILOGO DI FINE GIORNATA
-- ============================================================
create table public.rag_daily_recaps (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.tenants(id) on delete cascade,
  recap_date   date not null,
  summary      text not null,
  -- Punti salienti già pronti per l'UI: ["3 preventivi inviati", …]
  highlights   jsonb not null default '[]'::jsonb,
  -- Numeri grezzi della giornata (clienti creati, attività completate, …).
  stats        jsonb not null default '{}'::jsonb,
  -- Modello che l'ha scritto, oppure 'deterministic' se generato senza LLM.
  generated_by text,
  generated_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, recap_date)
);

-- ============================================================
-- ALLEGATI
-- Il file vive in Supabase Storage (bucket `rag-files`, percorso
-- {company_id}/{file_id}.ext); qui resta il testo estratto, che è ciò che
-- l'indice deve leggere.
-- ============================================================
create table public.rag_files (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.tenants(id) on delete cascade,
  storage_path      text not null,
  file_name         text not null,
  mime_type         text not null,
  size_bytes        bigint not null default 0,
  title             text,
  category          text,
  -- Collegamento facoltativo a UNA entità del CRM.
  client_id         uuid references public.clients(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,
  opportunity_id    uuid references public.opportunities(id) on delete set null,
  extracted_text    text,
  extraction_status text not null default 'pending'
                    check (extraction_status in ('pending','done','failed','unsupported')),
  extraction_error  text,
  page_count        integer,
  uploaded_by       uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, storage_path)
);

-- ============================================================
-- EMAIL E COMUNICAZIONI
-- ============================================================
create table public.rag_emails (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.tenants(id) on delete cascade,
  -- Message-ID RFC 5322 quando disponibile: è la chiave anti-duplicato.
  message_id    text not null default gen_random_uuid()::text,
  thread_id     text,
  direction     text not null default 'inbound' check (direction in ('inbound','outbound')),
  subject       text,
  from_address  text not null,
  from_name     text,
  to_addresses  text[] not null default '{}'::text[],
  cc_addresses  text[] not null default '{}'::text[],
  body_text     text not null,
  sent_at       timestamptz not null default now(),
  -- Contatto del CRM riconosciuto (è anche il filtro privacy predefinito).
  client_id     uuid references public.clients(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  has_attachments boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, message_id)
);

-- ============================================================
-- VALUTAZIONE AUTOMATICA
-- Un insieme di domande con la risposta attesa: serve a misurare ogni modifica
-- al motore invece di giudicarla a sensazione.
-- ============================================================
create table public.rag_eval_cases (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.tenants(id) on delete cascade,
  question         text not null,
  -- Documenti che una buona risposta DEVE recuperare: [{"sourceType":"client","sourceId":"…"}]
  expected_sources jsonb not null default '[]'::jsonb,
  -- Parole/numeri che devono comparire nella risposta (es. "60 giorni", "29.280").
  expected_keywords text[] not null default '{}'::text[],
  note             text,
  is_active        boolean not null default true,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.rag_eval_runs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.tenants(id) on delete cascade,
  label           text,
  cases_total     integer not null default 0,
  -- Metriche del giro: quanto spesso il documento atteso è stato recuperato,
  -- in che posizione, e quante risposte erano effettivamente ancorate alle fonti.
  recall_at_k     numeric(5,4),
  mrr             numeric(5,4),
  grounded_ratio  numeric(5,4),
  keyword_ratio   numeric(5,4),
  settings        jsonb not null default '{}'::jsonb,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create table public.rag_eval_results (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.tenants(id) on delete cascade,
  run_id         uuid not null references public.rag_eval_runs(id) on delete cascade,
  case_id        uuid references public.rag_eval_cases(id) on delete set null,
  question       text not null,
  hit            boolean not null default false,
  rank           integer,
  grounded       boolean not null default false,
  keywords_found text[] not null default '{}'::text[],
  keywords_missing text[] not null default '{}'::text[],
  answer         text,
  citations      jsonb not null default '[]'::jsonb,
  retrieved      jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- INDEX
-- ============================================================
create index rag_daily_recaps_company_idx on public.rag_daily_recaps (company_id, recap_date desc);

create index rag_files_company_idx        on public.rag_files (company_id, created_at desc);
create index rag_files_status_idx         on public.rag_files (company_id, extraction_status);
create index rag_files_client_idx         on public.rag_files (client_id);

create index rag_emails_company_idx       on public.rag_emails (company_id, sent_at desc);
create index rag_emails_client_idx        on public.rag_emails (client_id);
create index rag_emails_lead_idx          on public.rag_emails (lead_id);
create index rag_emails_thread_idx        on public.rag_emails (company_id, thread_id);

create index rag_eval_cases_company_idx   on public.rag_eval_cases (company_id) where is_active;
create index rag_eval_runs_company_idx    on public.rag_eval_runs (company_id, started_at desc);
create index rag_eval_results_run_idx     on public.rag_eval_results (run_id);

-- ============================================================
-- TRIGGER updated_at
-- ============================================================
create trigger rag_daily_recaps_updated_at before update on public.rag_daily_recaps for each row execute function public.set_updated_at();
create trigger rag_files_updated_at        before update on public.rag_files        for each row execute function public.set_updated_at();
create trigger rag_emails_updated_at       before update on public.rag_emails       for each row execute function public.set_updated_at();
create trigger rag_eval_cases_updated_at   before update on public.rag_eval_cases   for each row execute function public.set_updated_at();

-- ============================================================
-- ACCODAMENTO
-- Le nuove fonti sono documenti a sé: la riga stessa è l'origine.
-- Un allegato entra in coda solo quando il testo è stato estratto: prima non
-- c'è nulla da indicizzare.
-- ============================================================
create or replace function public.rag_enqueue_source_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type    rag_source_type;
  v_company uuid;
  v_source  uuid;
  v_op      text;
  v_row     record;
begin
  if tg_op = 'DELETE' then
    v_row := old;
    v_op  := 'delete';
  else
    v_row := new;
    v_op  := 'upsert';
  end if;

  v_type := case tg_table_name
              when 'rag_daily_recaps' then 'daily'
              when 'rag_files'        then 'file'
              when 'rag_emails'       then 'email'
            end::rag_source_type;
  if v_type is null then
    return v_row;
  end if;

  -- Un allegato senza testo estratto non produce ancora un documento.
  -- L'IF va annidato: PL/pgSQL valuta l'intera condizione come una sola
  -- espressione SQL, quindi `extraction_status` verrebbe risolto anche per le
  -- tabelle che non hanno quella colonna.
  if tg_table_name = 'rag_files' and v_op = 'upsert' then
    if v_row.extraction_status <> 'done' then
      return v_row;
    end if;
  end if;

  v_company := v_row.company_id;
  v_source  := v_row.id;

  insert into public.rag_index_queue (company_id, source_type, source_id, operation)
  values (v_company, v_type, v_source, v_op)
  on conflict (company_id, source_type, source_id) where status = 'pending'
  do update set operation = excluded.operation, enqueued_at = now();

  -- Email e allegati aggiornano anche la scheda del contatto collegato: il
  -- memoriale del cliente riassume le ultime interazioni.
  if tg_table_name in ('rag_files','rag_emails') then
    insert into public.rag_index_queue (company_id, source_type, source_id, operation)
    select v_company, t.type, t.id, 'upsert'
    from (
      values ('client'::rag_source_type, v_row.client_id),
             ('lead'::rag_source_type,   v_row.lead_id)
    ) as t(type, id)
    where t.id is not null
    on conflict (company_id, source_type, source_id) where status = 'pending'
    do update set enqueued_at = now();
  end if;

  return v_row;
end;
$$;

create trigger rag_daily_recaps_enqueue after insert or update or delete on public.rag_daily_recaps for each row execute function public.rag_enqueue_source_row();
create trigger rag_files_enqueue        after insert or update or delete on public.rag_files        for each row execute function public.rag_enqueue_source_row();
create trigger rag_emails_enqueue       after insert or update or delete on public.rag_emails       for each row execute function public.rag_enqueue_source_row();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.rag_daily_recaps enable row level security;
alter table public.rag_files        enable row level security;
alter table public.rag_emails       enable row level security;
alter table public.rag_eval_cases   enable row level security;
alter table public.rag_eval_runs    enable row level security;
alter table public.rag_eval_results enable row level security;

create policy "rag_daily_recaps: isolamento azienda" on public.rag_daily_recaps for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "rag_files: isolamento azienda" on public.rag_files for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "rag_emails: isolamento azienda" on public.rag_emails for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "rag_eval_cases: isolamento azienda" on public.rag_eval_cases for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "rag_eval_runs: isolamento azienda" on public.rag_eval_runs for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

create policy "rag_eval_results: isolamento azienda" on public.rag_eval_results for all to authenticated
  using (company_id = public.current_tenant_id())
  with check (company_id = public.current_tenant_id());

-- ============================================================
-- GRANT (come nella 00005: su Supabase i default coprono già `public`,
-- ma dichiararli rende la migration autosufficiente)
-- ============================================================
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'rag_daily_recaps','rag_files','rag_emails',
    'rag_eval_cases','rag_eval_runs','rag_eval_results'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant all on public.%I to service_role', v_table);
    end if;
  end loop;
end$$;

-- ============================================================
-- STORAGE — bucket privato per gli allegati
-- Percorso: {company_id}/{file_id}.{ext} → il primo segmento è il confine
-- fra aziende, verificato dalle policy.
-- Il blocco è condizionato: lo schema `storage` esiste solo su Supabase.
-- ============================================================
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'rag-files', 'rag-files', false, 26214400,
      array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'text/markdown',
        'text/csv'
      ]
    )
    on conflict (id) do update
      set file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;

    -- Una EXECUTE per istruzione: PL/pgSQL non esegue comandi multipli in una stringa.
    execute 'drop policy if exists "rag-files: lettura azienda" on storage.objects';
    execute $pol$
      create policy "rag-files: lettura azienda" on storage.objects for select to authenticated
        using (
          bucket_id = 'rag-files'
          and (storage.foldername(name))[1] = public.current_tenant_id()::text
        )
    $pol$;

    execute 'drop policy if exists "rag-files: scrittura azienda" on storage.objects';
    execute $pol$
      create policy "rag-files: scrittura azienda" on storage.objects for insert to authenticated
        with check (
          bucket_id = 'rag-files'
          and (storage.foldername(name))[1] = public.current_tenant_id()::text
        )
    $pol$;

    execute 'drop policy if exists "rag-files: eliminazione azienda" on storage.objects';
    execute $pol$
      create policy "rag-files: eliminazione azienda" on storage.objects for delete to authenticated
        using (
          bucket_id = 'rag-files'
          and (storage.foldername(name))[1] = public.current_tenant_id()::text
        )
    $pol$;

  end if;
end$$;
