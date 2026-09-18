-- ============================================================
-- Tutto.Azienda — nuove origini del memoriale (migration 00006)
--
-- Contiene SOLO l'estensione dell'enum: Postgres non permette di usare un
-- valore di enum nella stessa transazione in cui lo si aggiunge, e ogni file di
-- migration gira in una transazione. Le tabelle che usano questi valori stanno
-- quindi nella 00007.
--
--   daily → riepilogo di fine giornata (cosa è successo oggi in azienda)
--   email → email e comunicazioni con clienti e lead
-- ============================================================

alter type rag_source_type add value if not exists 'daily';
alter type rag_source_type add value if not exists 'email';
