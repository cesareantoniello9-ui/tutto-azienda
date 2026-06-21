import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const exts = [".ts", ".tsx", ".js", ".jsx", ".css"];
const problems = [];

function listFiles(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listFiles(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// true se OGNI segmento del path esiste con il case ESATTO (come su Linux)
function existsExact(absPath) {
  const rel = path.relative(ROOT, absPath);
  const segs = rel.split(path.sep);
  let cur = ROOT;
  for (const seg of segs) {
    let entries;
    try {
      entries = fs.readdirSync(cur);
    } catch {
      return false;
    }
    if (!entries.includes(seg)) return false;
    cur = path.join(cur, seg);
  }
  return true;
}

function candidates(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const out = [];
  for (const ext of exts) out.push(base + ext);
  for (const ext of exts) out.push(path.join(base, "index" + ext));
  out.push(base);
  return out;
}

const re = /(?:from|import)\s+["']([^"']+)["']/g;

for (const file of listFiles(SRC)) {
  const content = fs.readFileSync(file, "utf8");
  let m;
  while ((m = re.exec(content))) {
    const spec = m[1];
    if (!spec.startsWith("@/") && !spec.startsWith(".")) continue;
    const cands = candidates(file, spec);
    if (!cands) continue;
    const hit = cands.find((c) => fs.existsSync(c));
    if (!hit) continue; // import non risolto a file (pacchetto/css esterno)
    if (!existsExact(hit)) {
      problems.push(
        `${path.relative(ROOT, file)}\n     import "${spec}"\n     risolve a: ${path.relative(ROOT, hit)} — ma il CASE non combacia`
      );
    }
  }
}

if (problems.length === 0) {
  console.log("OK — nessun mismatch di case negli import. (Non è questo il problema Vercel.)");
} else {
  console.log("MISMATCH DI CASE (falliscono su Linux/Vercel):\n");
  for (const p of problems) console.log(" - " + p + "\n");
}
