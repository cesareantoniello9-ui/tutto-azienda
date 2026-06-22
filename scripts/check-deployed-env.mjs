// Controlla se nel bundle deployato ci sono caratteri non-ASCII vicino a
// URL/chiave Supabase (causa dell'errore "non ISO-8859-1 code point" negli header).
const base = process.argv[2] ?? "https://tutto-azienda.vercel.app";

const html = await (await fetch(base + "/login")).text();
const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"]+\.js/g)].map((m) => m[0]))];

const needles = ["supabase.co", "sb_publishable", "supabase"];
const findings = [];

for (const c of chunks) {
  const body = await (await fetch(base + c)).text();
  for (const needle of needles) {
    let idx = body.indexOf(needle);
    while (idx !== -1) {
      const region = body.slice(Math.max(0, idx - 10), idx + 90);
      for (const ch of region) {
        const cp = ch.codePointAt(0);
        if (cp > 127) {
          findings.push(
            `NON-ASCII U+${cp.toString(16).toUpperCase()} ("${ch}") vicino a "${needle}" in ${c}\n   contesto: ${JSON.stringify(region)}`,
          );
        }
      }
      idx = body.indexOf(needle, idx + needle.length);
    }
  }
}

console.log(`Chunk analizzati: ${chunks.length}`);
console.log(
  findings.length
    ? "TROVATI caratteri non-ASCII:\n" + [...new Set(findings)].join("\n")
    : "Nessun carattere non-ASCII vicino a URL/chiave Supabase nel bundle.",
);
