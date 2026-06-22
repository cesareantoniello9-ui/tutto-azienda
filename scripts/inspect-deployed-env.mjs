const base = process.argv[2] ?? "https://tutto-azienda.vercel.app";
const html = await (await fetch(base + "/login")).text();
const chunks = [
  ...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"]+\.js/g)].map((m) => m[0])),
];

const patterns = [
  /"sb_publishable_[^"]*"/g,
  /"https:\/\/oixgssfgfhoqkcyutgds[^"]*"/g,
  /"[^"]*oixgssfgfhoqkcyutgds\.supabase\.co[^"]*"/g,
];

const seen = new Set();
for (const c of chunks) {
  const body = await (await fetch(base + c)).text();
  for (const re of patterns) {
    for (const m of body.matchAll(re)) {
      const lit = m[0];
      if (seen.has(lit)) continue;
      seen.add(lit);
      const nonAscii = [...lit].filter((ch) => ch.codePointAt(0) > 127);
      console.log(
        `len=${lit.length} nonAscii=${nonAscii.length} :: ${JSON.stringify(lit).slice(0, 200)}`,
      );
    }
  }
}
if (seen.size === 0) console.log("Nessun literal chiave/URL trovato.");
