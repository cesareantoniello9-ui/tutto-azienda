/**
 * Corpus dimostrativo della memoria aziendale.
 *
 * In MODALITÀ DEMO (nessun Supabase collegato) la pagina "Memoria" deve restare
 * navigabile come il resto dell'area autenticata: qui vivono alcuni documenti di
 * esempio e un recupero in memoria (coseno sull'embedding locale + sovrapposizione
 * lessicale). Nessuna di queste funzioni viene usata quando il database è reale.
 */
import { cosineSimilarity, localEmbedding, tokenizeForHashing } from "./embeddings";
import type { RecalledMemory, RetrievedChunk } from "@/types/rag";

const NOW = "2026-09-01T09:00:00.000Z";

type DemoDoc = {
  id: string;
  sourceType: RetrievedChunk["sourceType"];
  title: string;
  content: string;
};

const DEMO_DOCS: DemoDoc[] = [
  {
    id: "11111111-1111-4111-8111-111111111101",
    sourceType: "client",
    title: "Cliente — Bianchi Impianti S.r.l.",
    content: `# Cliente — Bianchi Impianti S.r.l.
Tipo: azienda
Stato: attivo
Partita IVA: 01234567890
Email: acquisti@bianchimpianti.it
Settore: impiantistica industriale
Indirizzo: Via Ferraris 12, 20099 Sesto San Giovanni, MI
Referente interno: Giulia Rossi
Cliente dal: 14/03/2024

## Andamento commerciale
- Trattative totali: 4
- Valore vinto: € 86.500,00
- Preventivi: 6
- Preventivi accettati: 3

## Storico interazioni
### Note recenti
- [12/06/2026] Pagano a 60 giorni fine mese, condizione concordata con la direzione. Non accettano acconti superiori al 30%.`,
  },
  {
    id: "11111111-1111-4111-8111-111111111102",
    sourceType: "quote",
    title: "Preventivo 2026/0042 — Bianchi Impianti S.r.l.",
    content: `# Preventivo 2026/0042
Cliente: Bianchi Impianti S.r.l.
Stato: inviato
Data di emissione: 03/07/2026
Valido fino al: 02/09/2026
Imponibile: € 24.000,00
IVA: € 5.280,00
Totale: € 29.280,00

## Righe del preventivo
1. Fornitura quadro elettrico di distribuzione — quantità 2, prezzo unitario € 8.500,00, IVA 22%, totale riga € 17.000,00
2. Installazione e collaudo — quantità 1, prezzo unitario € 7.000,00, IVA 22%, totale riga € 7.000,00

## Condizioni
Pagamento a 60 giorni data fattura fine mese. Garanzia 24 mesi sui componenti.`,
  },
  {
    id: "11111111-1111-4111-8111-111111111103",
    sourceType: "opportunity",
    title: "Opportunità — Rinnovo impianto Sede Nord",
    content: `# Opportunità — Rinnovo impianto Sede Nord
Cliente: Bianchi Impianti S.r.l.
Fase: negoziazione
Esito: open
Valore: € 48.000,00
Probabilità di chiusura: 65%
Chiusura prevista: 30/10/2026
Referente interno: Giulia Rossi

## Storico interazioni
### Attività recenti
- riunione «Sopralluogo tecnico Sede Nord» (completata, 21/07/2026)
- follow-up «Invio revisione preventivo» (pianificata, 15/09/2026)`,
  },
  {
    id: "11111111-1111-4111-8111-111111111104",
    sourceType: "lead",
    title: "Lead — Marco Verdi",
    content: `# Lead — Marco Verdi
Azienda di provenienza: Verdi Logistica
Stato: qualificato
Canale di acquisizione: evento
Valore stimato: € 15.000,00
Email: m.verdi@verdilogistica.it
Referente interno: Luca Neri
Creato il: 05/06/2026

## Note
Conosciuto alla fiera di Verona. Cerca un sistema di gestione magazzino entro fine anno; budget confermato in riunione.`,
  },
  {
    id: "11111111-1111-4111-8111-111111111105",
    sourceType: "manual",
    title: "Procedura interna — Emissione preventivi",
    content: `# Procedura interna — Emissione preventivi
Categoria: procedure commerciali

Ogni preventivo sopra € 20.000 richiede l'approvazione della direzione commerciale prima dell'invio.
La validità standard di un preventivo è di 60 giorni dalla data di emissione.
Lo sconto massimo applicabile senza autorizzazione è del 10%; oltre serve il visto del responsabile di area.
La numerazione segue il formato AAAA/NNNN ed è progressiva per anno solare.`,
  },
  {
    id: "11111111-1111-4111-8111-111111111106",
    sourceType: "activity",
    title: "Attività — Sollecito pagamento fattura 2026/118",
    content: `# Attività — Sollecito pagamento fattura 2026/118
Tipo: chiamata
Stato: completata
Scadenza: 28/08/2026
Collegata a: Bianchi Impianti S.r.l.
Responsabile: Giulia Rossi

## Dettagli
Contattato l'ufficio acquisti: la fattura è in liquidazione, pagamento previsto entro il 15/09/2026.`,
  },
];

const DEMO_MEMORIES: RecalledMemory[] = [
  {
    id: "22222222-2222-4222-8222-222222222201",
    kind: "preference",
    content:
      "Bianchi Impianti S.r.l. paga a 60 giorni fine mese e non accetta acconti superiori al 30%.",
    importance: 4,
    confidence: 0.95,
    subjectType: "client",
    subjectId: "11111111-1111-4111-8111-111111111101",
    pinned: true,
    similarity: 0,
    createdAt: NOW,
  },
  {
    id: "22222222-2222-4222-8222-222222222202",
    kind: "decision",
    content:
      "Da luglio 2026 ogni preventivo sopra € 20.000 passa dall'approvazione della direzione commerciale.",
    importance: 5,
    confidence: 0.9,
    subjectType: null,
    subjectId: null,
    pinned: true,
    similarity: 0,
    createdAt: NOW,
  },
];

/** Recupero in memoria: coseno sull'embedding locale + sovrapposizione lessicale. */
export function demoRetrieve(question: string, topK = 5): RetrievedChunk[] {
  const queryVector = localEmbedding(question);
  const queryTokens = new Set(tokenizeForHashing(question));

  return DEMO_DOCS.map((doc) => {
    const similarity = cosineSimilarity(queryVector, localEmbedding(doc.content));
    const docTokens = new Set(tokenizeForHashing(`${doc.title} ${doc.content}`));
    let overlap = 0;
    for (const token of queryTokens) if (docTokens.has(token)) overlap++;
    const lexical = queryTokens.size > 0 ? overlap / queryTokens.size : 0;

    return {
      chunkId: `${doc.id}-0`,
      documentId: doc.id,
      sourceType: doc.sourceType,
      sourceId: doc.id,
      title: doc.title,
      content: doc.content,
      chunkIndex: 0,
      metadata: { demo: true },
      similarity,
      lexicalRank: lexical,
      score: similarity * 0.5 + lexical * 0.5,
      updatedAt: NOW,
    } satisfies RetrievedChunk;
  })
    // L'embedding locale è lessicale: senza parole in comune la somiglianza
    // residua è solo rumore di hashing, e non deve produrre falsi risultati.
    .filter((chunk) => chunk.lexicalRank > 0 || chunk.similarity >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function demoMemories(): RecalledMemory[] {
  return DEMO_MEMORIES.map((memory) => ({ ...memory }));
}

/** Stato dell'indice mostrato in demo (coerente con il corpus qui sopra). */
export function demoIndexOverview() {
  const byType = new Map<string, number>();
  for (const doc of DEMO_DOCS) byType.set(doc.sourceType, (byType.get(doc.sourceType) ?? 0) + 1);

  return [...byType.entries()].map(([sourceType, documents]) => ({
    company_id: "00000000-0000-0000-0000-000000000001",
    source_type: sourceType as RetrievedChunk["sourceType"],
    documents,
    stale_documents: 0,
    chunks: documents,
    last_indexed_at: NOW,
  }));
}
