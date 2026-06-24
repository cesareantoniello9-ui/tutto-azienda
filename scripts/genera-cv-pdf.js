/* Genera un PDF professionale del CV di Cesare Antoniello.
   Uso: node scripts/genera-cv-pdf.js  ->  cv/CV_Cesare_Antoniello.pdf */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "cv", "CV_Cesare_Antoniello.pdf");

const NAVY = "#0f1e3d", VIOLET = "#4c1d95", BLUE = "#2563eb",
      INK = "#1f2937", MUTED = "#5b6573", CORAL = "#f97362", LIGHT = "#c7d2fe";

const M = 44;                 // margine
const doc = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M } });
const W = doc.page.width, H = doc.page.height;
const CW = W - M * 2;         // larghezza contenuto
const BOTTOM = H - M;

doc.pipe(fs.createWriteStream(OUT));

/* ---------- HEADER ---------- */
const headerH = 138;
const grad = doc.linearGradient(0, 0, W, headerH);
grad.stop(0, NAVY).stop(0.55, "#1e3a8a").stop(1, VIOLET);
doc.rect(0, 0, W, headerH).fill(grad);

// accento coral sottile in basso
doc.rect(0, headerH, W, 4).fill(CORAL);

doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(27)
   .text("Cesare Antoniello", M, 36);
doc.fillColor(LIGHT).font("Helvetica").fontSize(10.5)
   .text("Digital Marketing & AI Specialist  ·  Content Creator  ·  Event & Project Manager", M, 72);
doc.fillColor("#e0e7ff").fontSize(9.5)
   .text("Email: cesareantoniello9@gmail.com      Tel: +39 375 889 0882", M, 96)
   .text("Luogo: Italia · Disponibile da remoto", M, 110);

doc.y = headerH + 18;
doc.x = M;

/* ---------- HELPERS ---------- */
function ensure(h) {
  if (doc.y + h > BOTTOM) doc.addPage();
}
function sectionTitle(t) {
  ensure(34);
  const y = doc.y;
  doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(11)
     .text(t.toUpperCase(), M, y, { characterSpacing: 1.1 });
  const ly = doc.y + 3;
  doc.moveTo(M, ly).lineTo(W - M, ly).lineWidth(1).strokeColor("#dbe2ec").stroke();
  doc.moveDown(0.8);
  doc.x = M;
}
function paragraph(t) {
  ensure(40);
  doc.fillColor(INK).font("Helvetica").fontSize(9.7)
     .text(t, M, doc.y, { width: CW, align: "justify", lineGap: 2 });
  doc.moveDown(0.5);
}
function jobHeader(title, period, sub) {
  ensure(46);
  const y = doc.y;
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11.5)
     .text(title, M, y, { width: CW - 110, continued: false });
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(9)
     .text(period, W - M - 110, y + 1, { width: 110, align: "right" });
  doc.fillColor(VIOLET).font("Helvetica-Oblique").fontSize(9.3)
     .text(sub, M, doc.y, { width: CW });
  doc.moveDown(0.35);
}
function bullets(items) {
  doc.font("Helvetica").fontSize(9.3).fillColor(INK);
  for (const it of items) {
    ensure(18);
    const y = doc.y;
    // marcatore romboidale coral
    doc.save().translate(M + 3, y + 4.5).rotate(45).rect(0, 0, 3.4, 3.4).fill(CORAL).restore();
    doc.fillColor(INK).text(it, M + 14, y, { width: CW - 14, lineGap: 1.5 });
    doc.moveDown(0.15);
  }
  doc.moveDown(0.45);
}
function labeled(label, text) {
  ensure(30);
  const y = doc.y;
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9.6).text(label + ":", M, y, { continued: true })
     .fillColor(INK).font("Helvetica").fontSize(9.6).text(" " + text, { width: CW, lineGap: 1.5 });
  doc.moveDown(0.45);
}

/* ---------- PROFILO ---------- */
sectionTitle("Profilo Professionale");
paragraph(
  "Professionista digitale multidisciplinare con una forte vocazione per il marketing data-driven, " +
  "la creazione di contenuti e l'applicazione concreta dell'Intelligenza Artificiale ai processi di business. " +
  "Unisco esperienza nella gestione di gruppi, eventi e relazioni con il cliente a competenze avanzate in " +
  "social media management, advertising (Meta & Google Ads), sviluppo web AI-assisted e produzione di contenuti visivi. " +
  "Orientato ai risultati, rapido nell'apprendimento e con spiccata mentalità imprenditoriale, trasformo idee in " +
  "progetti misurabili coordinando team, budget e KPI. Ruoli target: Digital Marketing Specialist, Social Media Manager, " +
  "Content Creator, AI Specialist, Web Developer, Project Manager, Event Manager."
);

/* ---------- ESPERIENZA ---------- */
sectionTitle("Esperienza Professionale");
jobHeader("Organizzatore di Eventi — Event & Project Manager", "2022 – 2025", "Eventi, intrattenimento e progetti su commessa");
bullets([
  "Pianificato e coordinato l'intero ciclo di vita di eventi, dalla concezione all'esecuzione, gestendo logistica, fornitori, timeline e budget nel rispetto di scadenze e obiettivi.",
  "Negoziato contratti e condizioni con fornitori e partner, ottimizzando i costi e presidiando la marginalità di ogni progetto.",
  "Coordinato team multidisciplinari, assegnando ruoli e priorità e garantendo allineamento operativo sotto pressione.",
  "Gestito le relazioni con clienti e partner curando l'intera customer experience, con approccio orientato a fidelizzazione e referral.",
  "Ideato e realizzato attività di marketing e promozione degli eventi (online e offline), aumentando visibilità e partecipazione.",
  "Risolto imprevisti ed emergenze in tempo reale con rapidità decisionale e problem solving operativo.",
  "Sviluppato una solida rete di contatti professionali (networking) a supporto di nuove opportunità commerciali.",
]);
jobHeader("Animatore — Intrattenimento e Gestione Gruppi", "Prima esperienza", "Animazione, accoglienza e relazione con il pubblico");
bullets([
  "Gestito e coinvolto gruppi di persone, famiglie e bambini, garantendo un'esperienza positiva, sicura e partecipativa.",
  "Sviluppato eccellenti capacità di comunicazione e public speaking conducendo attività e spettacoli davanti a un pubblico eterogeneo.",
  "Assunto ruoli di leadership e coordinamento nell'organizzazione delle attività.",
  "Affrontato imprevisti con problem solving e capacità di lavorare sotto pressione.",
  "Curato la relazione con i clienti con empatia, ascolto e orientamento al servizio.",
]);

/* ---------- COMPETENZE TECNICHE ---------- */
sectionTitle("Competenze Tecniche & Digitali");
labeled("Digital Marketing & Advertising", "Meta Ads, Google Ads, campagne pubblicitarie online, funnel marketing, lead generation, customer acquisition, analisi dati e ottimizzazione campagne, strategie di crescita digitale, analisi mercato e competitor.");
labeled("Social Media & Content Creation", "Social media management aziendale, pianificazione editoriale, copywriting, storytelling, content marketing, community management, personal e corporate branding, analisi performance e KPI.");
labeled("AI & Sviluppo Software/Web", "Programmazione AI-assisted, applicazioni web e mobile, siti responsive, UI/UX design, automazione di processi, sviluppo no-code e low-code, ottimizzazione dei flussi di lavoro, problem solving tecnico.");
labeled("Graphic Design & Multimedia", "Graphic design, contenuti visuali, montaggio e video editing, contenuti per social, editing fotografico, materiali promozionali, gestione identità visiva.");

/* ---------- SOFT SKILLS ---------- */
sectionTitle("Competenze Trasversali");
paragraph(
  "Leadership · Problem solving · Comunicazione efficace · Public speaking · Project management · Gestione del team · " +
  "Pensiero strategico · Capacità analitiche · Creatività · Adattabilità · Apprendimento rapido · Orientamento ai risultati · " +
  "Mentalità imprenditoriale · Gestione delle priorità · Autonomia operativa · Negoziazione · Time management · Lavoro in team · " +
  "Empatia · Gestione dello stress."
);

/* ---------- STRUMENTI ---------- */
sectionTitle("Strumenti & Tecnologie");
labeled("Intelligenza Artificiale", "Claude, Hexfield, AI generativa (testo/immagini/video), prompt engineering, automazione AI-assisted");
labeled("Advertising & Analytics", "Meta Business Suite, Meta Ads Manager, Google Ads, reportistica e analisi KPI");
labeled("Social & Content", "Instagram, TikTok, Facebook, LinkedIn, pianificazione editoriale, community management");
labeled("Design & Sviluppo", "Strumenti di graphic design, editing foto/video; sviluppo web AI-assisted, piattaforme no-code/low-code, UI/UX; piattaforme cloud e project management");

/* ---------- LINGUE & FORMAZIONE ---------- */
sectionTitle("Lingue & Formazione");
labeled("Lingue", "Italiano (madrelingua) · Inglese B2 (intermedio superiore)");
labeled("Formazione", "Diploma di Liceo Scientifico (maturità scientifica). Formazione continua su Intelligenza Artificiale, digital marketing, advertising e content creation.");

/* ---------- VERSIONE 3D ONLINE ---------- */
sectionTitle("Versione interattiva con header 3D");
doc.fillColor(MUTED).font("Helvetica").fontSize(9.3).text(
  "CV online (header 3D): https://tutto-azienda-git-claude-italian-resume-cr-65f70c-tutto-azienda.vercel.app/cv/index.html",
  M, doc.y, { width: CW, lineGap: 2 });
doc.fillColor(MUTED).text(
  "Versione con header video animato: https://tutto-azienda-git-claude-italian-resume-cr-65f70c-tutto-azienda.vercel.app/cv/video.html",
  M, doc.y, { width: CW, lineGap: 2 });

/* ---------- FOOTER ---------- */
doc.moveDown(0.8);
ensure(24);
doc.fillColor("#9aa3b2").font("Helvetica-Oblique").fontSize(8).text(
  "Autorizzo il trattamento dei dati personali ai sensi del Regolamento UE 2016/679 (GDPR) e del D.Lgs. 196/2003 e s.m.i.",
  M, doc.y, { width: CW });

doc.end();
console.log("PDF generato:", OUT);
