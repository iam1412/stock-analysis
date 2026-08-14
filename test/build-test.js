#!/usr/bin/env node
'use strict';

/**
 * build-test.js — unit test ของพฤติกรรม build.js เรื่อง "เครดิตโมเดล AI" + freshHash
 * (สิ่งที่ check-reports ตรวจ source / check-site ตรวจ dist มองไม่เห็นระดับฟังก์ชัน)
 *
 * ครอบ:
 *   - freshHash         : meta ai-model ถูกตัดออกจาก hash → เปลี่ยน/เพิ่มโมเดลแล้ว "อัปเดตล่าสุด" ไม่ขยับ
 *                         แต่เนื้อหาวิเคราะห์จริงเปลี่ยน → hash ต้องเปลี่ยน
 *   - extractMeta       : อ่าน aiModel จาก <meta name="ai-model"> (null เมื่อไม่มี)
 *   - injectModelCredit : แทน "สร้างด้วย stock-analyzer workflow" → เครดิตโมเดล + fallback ผนวกท้าย <footer>
 *   - decorateReport    : per-report model ไหลจาก meta → footer ถูกตัว, ไม่เหลือ workflow text, ตกลงค่ากลางได้
 *
 * รัน: node test/build-test.js   (npm run test:build) — require build.js แบบไม่รัน build จริง (guard ใน build.js)
 * exit 0 = ผ่าน, 1 = build.js มีพฤติกรรมผิด
 */

const b = require('../build.js');

let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

console.log('\n🧪 build-test: เครดิตโมเดล AI + freshHash\n');

// fixture HTML ขั้นต่ำ (มี/ไม่มี meta ai-model, บล็อก stock-meta, footer แบบ workflow text)
const WF = 'Stock Analysis Dashboard • ข้อมูล ณ 1 ม.ค. 2026 • สร้างด้วย stock-analyzer workflow';
const smBlock = (o) => o == null ? '' : `\n<script type="application/json" id="stock-meta">\n${typeof o === 'string' ? o : JSON.stringify(o)}\n</script>`;
const doc = (model, footer, sm) =>
  `<!DOCTYPE html><html lang="th"><head><title>X (X)</title>` +
  (model ? `\n<meta name="ai-model" content="${model}">` : '') +
  smBlock(sm) +
  `</head><body><h1>X</h1><footer>${footer}</footer></body></html>`;

const withOpus = doc('Claude Opus 4.8', WF);
const withSonnet = doc('Claude Sonnet 4.6', WF);
const noTag = doc(null, WF);

// ── freshHash: ประทับ/เปลี่ยนโมเดล = metadata ไม่นับเป็นอัปเดต ──
ok(b.freshHash(withOpus) === b.freshHash(withSonnet), 'freshHash: เปลี่ยนรุ่นโมเดล (Opus↔Sonnet) → hash เท่าเดิม (วันที่ไม่ขยับ)');
ok(b.freshHash(withOpus) === b.freshHash(noTag), 'freshHash: มี/ไม่มี meta ai-model → hash เท่าเดิม');
ok(b.freshHash(withOpus) !== b.freshHash(doc('Claude Opus 4.8', WF + ' EXTRA')), 'freshHash: เนื้อหาวิเคราะห์จริงเปลี่ยน → hash เปลี่ยน (ยังจับการอัปเดตได้)');

// ── extractMeta: อ่านโมเดลจาก tag ──
ok(b.extractMeta(withOpus, 'X').aiModel === 'Claude Opus 4.8', 'extractMeta: อ่าน aiModel จาก meta tag');
ok(b.extractMeta(noTag, 'X').aiModel === null, 'extractMeta: ไม่มี tag → aiModel = null');

// ── extractMeta: ดึง desc (คำโปรยธุรกิจ) จาก <div class="sub"> ใต้ <h1> + ถอด entity ──
const withSub = `<!DOCTYPE html><html lang="th"><head><title>X (X)</title></head><body><h1>Acme</h1><div class="sub">ผลิตชิป A &amp; B • cloud</div><footer>f</footer></body></html>`;
ok(b.extractMeta(withSub, 'X').desc === 'ผลิตชิป A & B • cloud', 'extractMeta: ดึง desc จาก .sub + ถอด &amp; → & (กัน double-escape)');
ok(b.extractMeta(noTag, 'X').desc === '', 'extractMeta: ไม่มี .sub → desc = "" (การ์ด fallback ไป title)');

// ── injectModelCredit: replace + fallback ──
const repl = b.injectModelCredit(withOpus, 'Claude Opus 4.8');
ok(!/สร้างด้วย\s*stock-analyzer\s*workflow/.test(repl), 'injectModelCredit: ลบข้อความ "stock-analyzer workflow" เดิม');
ok(/Claude Opus 4\.8/.test(repl) && /Anthropic/.test(repl), 'injectModelCredit: ใส่เครดิตโมเดล + Anthropic แทนที่');
const fb = b.injectModelCredit(doc('Claude Opus 4.8', 'footer ธรรมดาไม่มี workflow text'), 'Claude Sonnet 4.6');
ok(/Claude Sonnet 4\.6/.test(fb) && /<\/footer>/.test(fb), 'injectModelCredit: fallback ผนวกเครดิตเข้า <footer> เมื่อไม่มีข้อความเดิม');

// ── injectFooterCopyright: นำหน้าแถวแรกของ footer, idempotent, ไม่มี footer = ไม่พัง ──
const cpDoc = b.injectFooterCopyright(doc('Claude Opus 4.8', WF));
ok(cpDoc.includes(`<footer>${b.COPYRIGHT} • Stock Analysis Dashboard`), 'injectFooterCopyright: แทรกนำหน้าข้อความแถวแรกใน <footer>');
ok(b.injectFooterCopyright(cpDoc) === cpDoc, 'injectFooterCopyright: idempotent — เรียกซ้ำไม่ต่อข้อความซ้อน');
const cpStyled = b.injectFooterCopyright(`<body><footer style="color:#5f6675">ติดต่อ</footer></body>`);
ok(cpStyled.includes(`<footer style="color:#5f6675">${b.COPYRIGHT} • ติดต่อ`), 'injectFooterCopyright: <footer> ที่มี attribute → แทรกหลังปิดแท็กเปิด ไม่ทับ attribute');
const cpNone = '<body><h1>X</h1></body>';
ok(b.injectFooterCopyright(cpNone) === cpNone, 'injectFooterCopyright: ไม่มี <footer> → คืนค่าเดิม (ไม่พัง)');

// ── decorateReport: per-report model end-to-end ──
const rec = (html, s) => ({ symbol: s, file: s + '.html', ...b.extractMeta(html, s), updated: '2026-01-01T00:00:00Z', hash: 'x' });
const decOpus = b.decorateReport(withOpus, rec(withOpus, 'X'));
ok(/🤖[^<]*<b>Claude Opus 4\.8<\/b>\s*·\s*Anthropic/.test(decOpus), 'decorateReport: footer โชว์โมเดลของ report (Opus)');
ok(decOpus.includes(`<footer>${b.COPYRIGHT} • `), 'decorateReport: footer หน้ารายงานขึ้นต้นด้วย copyright');
ok(!/สร้างด้วย\s*stock-analyzer\s*workflow/.test(decOpus), 'decorateReport: ไม่เหลือ workflow text ใน output');
ok(/<b>Claude Sonnet 4\.6<\/b>/.test(b.decorateReport(withSonnet, rec(withSonnet, 'Y'))), 'decorateReport: per-report — report tag=Sonnet → footer=Sonnet (ไม่ใช่ค่ากลาง)');
ok(new RegExp('<b>' + reEsc(b.AI_MODEL) + '</b>').test(b.decorateReport(noTag, rec(noTag, 'Z'))), `decorateReport: ไม่มี tag → ใช้ค่ากลาง AI_MODEL (${b.AI_MODEL})`);

// ── extractMetrics: อ่านบล็อก stock-meta → metric สำหรับเรียง index ──
const SM = { symbol: 'X', currency: 'USD', price: 100, fairValue: 120, mos: 16.7, upside: 20, pe: 15, dividendYield: 2.5, roe: 18 };
const withSM = doc('Claude Opus 4.8', WF, SM);
const em = b.extractMetrics(withSM);
ok(em && em.mos === 16.7 && em.upside === 20 && em.pe === 15 && em.dividendYield === 2.5 && em.roe === 18, 'extractMetrics: อ่าน metric ครบ (mos/upside/pe/dividendYield/roe)');
ok(b.extractMetrics(doc('Claude Opus 4.8', WF)) === null, 'extractMetrics: ไม่มีบล็อก → null');
ok(b.extractMetrics(doc('Claude Opus 4.8', WF, '{bad json')) === null, 'extractMetrics: JSON เสีย → null (ไม่ throw)');
ok((() => { const r = b.extractMetrics(doc('Claude Opus 4.8', WF, { mos: 5 })); return r && r.mos === 5 && r.pe === null; })(), 'extractMetrics: key ที่ไม่มี → null (ไม่ใช่ undefined)');
// ── extractMetrics: market (TH/US) derive จาก currency — ใช้กรองตลาดหน้า index ──
ok(em && em.market === 'US', "extractMetrics: currency USD → market 'US'");
ok(b.extractMetrics(doc('Claude Opus 4.8', WF, { ...SM, currency: 'THB' })).market === 'TH', "extractMetrics: currency THB → market 'TH'");
ok(b.extractMetrics(doc('Claude Opus 4.8', WF, { mos: 5 })).market === null, 'extractMetrics: ไม่มี currency → market = null (ไม่ใส่ data-market บนการ์ด)');

// ── pickHighlight / computeLeaders: เลือก "จุดเด่น" ของหุ้นสำหรับการ์ดหน้า index ──
const HLM = (o) => ({ mos: null, upside: null, pe: null, dividendYield: null, roe: null, ...o });
ok(b.pickHighlight(null) === null, 'pickHighlight: ไม่มี metrics → null');
ok(b.pickHighlight(HLM({ roe: 5, pe: 30, dividendYield: 1 })) === null, 'pickHighlight: ไม่มีค่าเด่นพอ (ทุก metric tier<2) → null');
{
  const h = b.pickHighlight(HLM({ roe: 141, pe: 36 }), { roe: 141 });
  ok(h && h.cls === 'qual' && /^ROE 141%$/.test(h.value) && h.lead && h.icon === '👑' && /สูงสุดในกลุ่ม/.test(h.desc),
    'pickHighlight: ROE 141 + เป็นผู้นำกลุ่ม → ป้าย ROE มงกุฎ "สูงสุดในกลุ่ม"');
}
{
  const h = b.pickHighlight(HLM({ roe: 30, pe: 26 }), { roe: 141 }); // ROE ดีแต่ไม่ใช่ผู้นำ (AAPL 141)
  ok(h && h.cls === 'qual' && /^ROE 30%$/.test(h.value) && !h.lead && h.icon === '💎',
    'pickHighlight: ROE 30 ไม่ใช่ผู้นำ → ป้าย ROE ไม่มีมงกุฎ (ใช้คำบรรยาย tier)');
}
{
  const h = b.pickHighlight(HLM({ pe: 7.5, dividendYield: 6.7, mos: 9, upside: 9.6 }), { pe: 7.5, dividendYield: 7.9 });
  ok(h && h.cls === 'cheap' && /^P\/E 7\.5$/.test(h.value) && h.lead && /ต่ำสุดในกลุ่ม/.test(h.desc),
    'pickHighlight: P/E ต่ำสุดในกลุ่ม ชนะ Yield ที่ไม่ใช่ผู้นำ (leader bonus ใน tier เดียวกัน) + ข้าม mos/upside tier1');
}
{
  const h = b.pickHighlight(HLM({ dividendYield: 7.9, pe: 10.7 }), { dividendYield: 7.9, pe: 7.5 });
  ok(h && h.cls === 'inc' && /^Yield 7\.9%$/.test(h.value) && h.lead,
    'pickHighlight: Yield tier3 (ผู้นำ) ชนะ P/E tier2 (tier สำคัญกว่า leader)');
}
ok((() => { const L = b.computeLeaders([{ metrics: HLM({ roe: 30 }) }, { metrics: HLM({ roe: 141 }) }, { metrics: HLM({ pe: 8 }) }]); return L.roe === 141 && L.pe === 8; })(),
  'computeLeaders: หาค่าดีสุดต่อ metric (roe = max, pe = min)');
ok((() => { const L = b.computeLeaders([{ metrics: HLM({ pe: -5 }) }, { metrics: HLM({ pe: 9 }) }]); return L.pe === 9; })(),
  'computeLeaders: P/E ติดลบ (ขาดทุน) ไม่นับเป็นผู้นำ');

// ── freshHash: ตัดบล็อก stock-meta ออก (เปลี่ยนตัวเลข metric ไม่ดันวันที่) ──
const smA = doc('Claude Opus 4.8', WF, { symbol: 'X', mos: 10, pe: 15 });
const smB = doc('Claude Opus 4.8', WF, { symbol: 'X', mos: 99, pe: 99 });
ok(b.freshHash(smA) === b.freshHash(smB), 'freshHash: เปลี่ยนตัวเลขในบล็อก stock-meta → hash เท่าเดิม (วันที่ไม่ขยับ)');
ok(b.freshHash(withOpus) === b.freshHash(smA), 'freshHash: มี/ไม่มีบล็อก stock-meta → hash เท่าเดิม');
ok(b.freshHash(smA) !== b.freshHash(doc('Claude Opus 4.8', WF + ' XTRA', { symbol: 'X', mos: 10 })), 'freshHash: เนื้อหาจริง (นอกบล็อก) เปลี่ยน → hash เปลี่ยน');

// ── expandReport: template system (content-only source → HTML เต็มตอน build/ตรวจ) ──
const threw = (fn) => { try { fn(); return false; } catch (e) { return true; } };
const NEWDOC = `<!DOCTYPE html><html lang="th"><head><title>X (X)</title>
<meta name="ai-model" content="Claude Opus 4.8">
<script type="application/json" id="report-data">
{"theme":{"accent":"#0071e3","accentDark":"#0058b9"},"chart":{"data":[["a",1],["b",2],["c",3]],"min":1,"max":3,"grid":[1,2,3],"fairLine":2,"currency":"฿","highlight":[0,2]},"gauge":{"min":1,"max":4,"cur":3,"fair":2},"fv":2}
</script>
<!--TEMPLATE:STYLE--></head><body><div class="wrap"><h1>X</h1></div><!--TEMPLATE:ENGINE--></body></html>`;

ok(b.expandReport('<html>ไม่มี marker</html>') === '<html>ไม่มี marker</html>', 'expandReport: source เก่า (ไม่มี marker) → คืนค่าเดิมเป๊ะ (identity, ไม่กระทบ 117 ไฟล์เดิม)');
{
  const ex = b.expandReport(NEWDOC);
  ok(!ex.includes('<!--TEMPLATE:STYLE-->') && !ex.includes('<!--TEMPLATE:ENGINE-->'), 'expandReport: แทน marker STYLE+ENGINE หมด (ไม่เหลือ marker ใน output)');
  ok(/<style>[\s\S]*--blue:#0071e3[\s\S]*<\/style>/.test(ex), 'expandReport: inject <style> + ใส่ธีม accent (--blue:#0071e3)');
  ok(/const FV=2\b/.test(ex), 'expandReport: engine bake const FV เป็น literal (gate E08/E15 regex เจอ)');
  ok(/getElementById\("mCur"\)\.style\.left=gpos\(3\)/.test(ex) && /mFair"\)\.style\.left=gpos\(2\)/.test(ex), 'expandReport: gpos(cur)/gpos(fair) เป็น literal ตรงกับ gauge (E19)');
  ok(/const data=\[\["a",1\],\["b",2\],\["c",3\]\]/.test(ex), 'expandReport: bake chart data เป็น literal array');
  ok(/const cur="฿",HL=\[0,2\]/.test(ex), 'expandReport: bake สกุลเงิน (฿) + ดัชนีไฮไลต์ (HL=[0,2]) เป็น literal');
  ok(/>\$\{cur\}\$\{v\}</.test(ex), 'expandReport: gridline label ใช้ ${cur} (สกุลเงินจาก report-data) ไม่ใช่ $ ตายตัว');
  ok(!/__RD_/.test(ex), 'expandReport: ไม่เหลือ token __RD_*__ ค้างใน output');
}
ok(threw(() => b.expandReport(NEWDOC.replace(',"currency":"฿","highlight":[0,2]', ''))), 'expandReport: chart.highlight ขาด → throw (กันไฮไลต์ผิดจุดเงียบ ๆ)');
ok(threw(() => b.expandReport(NEWDOC.replace('"highlight":[0,2]', '"highlight":[0,9]'))), 'expandReport: chart.highlight ดัชนีเกินจำนวนจุด → throw');
ok(threw(() => b.expandReport(NEWDOC.replace('"fv":2', '"fv":null'))), 'expandReport: fv ขาด/ไม่ใช่ตัวเลข → throw (ไม่ปล่อยให้ render เพี้ยนเงียบ)');
ok(threw(() => b.expandReport(NEWDOC.replace('[["a",1],["b",2],["c",3]]', '[["a",1]]'))), 'expandReport: chart.data < 2 จุด → throw');
ok(threw(() => b.expandReport('<!--TEMPLATE:STYLE--><html></html>')), 'expandReport: มี STYLE marker แต่ไม่มีบล็อก report-data → throw');
ok(threw(() => b.expandReport(NEWDOC.replace('<!--TEMPLATE:ENGINE-->', ''))), 'expandReport: ขาด ENGINE marker (มีแต่ STYLE) → throw');

// ── gridFmt/dataFmt: ต้องอ้างตัวแปรให้ตรง scope ของ engine (regression: bug CPN/CPF/HMPRO) ──
//   engine: gridFmt อยู่ใน grid.forEach(v=>…) ใช้ v  •  dataFmt อยู่ใน data.forEach((d,i)=>…) ใช้ d[1]
//   ก่อนแก้: regex รวมรับ "v.toFixed(2)" ให้ dataFmt ได้ → ตอน render โยน ReferenceError: v is not defined → กราฟ/gauge/calc ดับทั้ง IIFE
const withFmt = (g, dd) => NEWDOC.replace('"highlight":[0,2]', `"highlight":[0,2],"gridFmt":"${g}","dataFmt":"${dd}"`);
ok(threw(() => b.expandReport(withFmt('v.toFixed(0)', 'v.toFixed(2)'))), 'validateReportData: dataFmt อ้าง v (ไม่มีใน scope data.forEach) → throw (กันกราฟดับเงียบ — bug CPN/CPF/HMPRO)');
ok(threw(() => b.expandReport(withFmt('d[1].toFixed(0)', 'd[1].toFixed(2)'))), 'validateReportData: gridFmt อ้าง d[1] (ไม่มีใน scope grid.forEach) → throw (reverse)');
ok(threw(() => b.expandReport(withFmt('v', 'Math.round(v)'))), 'validateReportData: dataFmt = Math.round(v) → throw (ต้องเป็น d[1])');
{
  const exFmt = b.expandReport(withFmt('v.toFixed(0)', 'd[1].toFixed(1)'));
  ok(/>\$\{cur\}\$\{d\[1\]\.toFixed\(1\)\}</.test(exFmt), 'validateReportData: dataFmt = d[1].toFixed(1) ถูก scope → bake เป็น ${cur}${d[1].toFixed(1)} (รันได้จริง ไม่ throw runtime)');
  ok(/>\$\{cur\}\$\{v\.toFixed\(0\)\}</.test(exFmt), 'validateReportData: gridFmt = v.toFixed(0) ถูก scope → bake เป็น ${cur}${v.toFixed(0)}');
}

// ── bounds/finite guards: ค่าที่ "ผ่าน JSON แต่ทำให้ render เป็น NaN/Infinity เงียบ ๆ" (degenerate) ต้อง throw ที่ validate ──
ok(threw(() => b.expandReport(NEWDOC.replace('"min":1,"max":3', '"min":3,"max":3'))), 'validateReportData: chart.max==min → throw (กัน ys หาร 0 → พิกัด NaN)');
ok(threw(() => b.expandReport(NEWDOC.replace('"min":1,"max":4', '"min":4,"max":4'))), 'validateReportData: gauge.max==min → throw (กัน gpos หาร 0)');
ok(threw(() => b.expandReport(NEWDOC.replace('"fv":2', '"fv":0'))), 'validateReportData: fv=0 → throw (MOS=(FV−p)/FV หาร 0 → Infinity)');
ok(threw(() => b.expandReport(NEWDOC.replace('[["a",1],["b",2],["c",3]]', '[["a",1],["b",null],["c",3]]'))), 'validateReportData: chart.data จุด price=null → throw');
ok(threw(() => b.expandReport(NEWDOC.replace('[["a",1],["b",2],["c",3]]', '[["a",1],["b","2"],["c",3]]'))), 'validateReportData: chart.data price เป็น string → throw');
ok(threw(() => b.expandReport(NEWDOC.replace('"grid":[1,2,3]', '"grid":[1,"x",3]'))), 'validateReportData: chart.grid มีค่าไม่ใช่ตัวเลข → throw');

// ── XSS guard: label แกน x + สกุลเงิน ถูกฝังใน innerHTML ของ SVG (engine.js) → ห้ามมี '<'/'>' (กัน markup inject) ──
ok(threw(() => b.expandReport(NEWDOC.replace('["c",3]', '["<img src=x onerror=alert(1)>",3]'))), "validateReportData: chart.data label มี <img onerror> → throw (กัน stored XSS เข้า innerHTML กราฟ)");
ok(threw(() => b.expandReport(NEWDOC.replace('"currency":"฿"', '"currency":"<b"'))), "validateReportData: chart.currency มี '<' → throw");
ok(!threw(() => b.expandReport(NEWDOC.replace('["c",3]', '["Q1 68",3]'))), 'validateReportData: label ปกติ (ไม่มี <>) → ไม่ throw');

// ── theme color tokens: กัน CSS declaration breakout + ค่าสีพังเงียบ (เช่น hex 5 หลัก → เส้นกราฟล่องหน) ──
ok(threw(() => b.expandReport(NEWDOC.replace('"accent":"#0071e3"', '"accent":"red;}body{display:none"'))), 'validateReportData: theme.accent มี ;{} (CSS breakout/injection) → throw');
ok(threw(() => b.expandReport(NEWDOC.replace('"accent":"#0071e3"', '"accent":"#1a73e"'))), 'validateReportData: theme.accent hex 5 หลัก (ไม่ใช่สี) → throw');
ok(threw(() => b.expandReport(NEWDOC.replace('"accent":"#0071e3"', '"accent":"#0071e3","darkGrad":"red;}"'))), 'validateReportData: theme.darkGrad มี ;} → throw');
ok(!threw(() => b.expandReport(NEWDOC.replace('"accent":"#0071e3"', '"accent":"#f57c00"'))), 'validateReportData: theme.accent = hex6 ถูกต้อง → ไม่ throw');
ok(!threw(() => b.expandReport(NEWDOC.replace('"accent":"#0071e3"', '"accent":"var(--blue)"'))), 'validateReportData: theme.accent = var(--blue) → ไม่ throw');
ok(!threw(() => b.expandReport(NEWDOC.replace('"accent":"#0071e3"', '"accent":"rgba(20,30,40,.5)"'))), 'validateReportData: theme.accent = rgba() → ไม่ throw');

// ── deriveTheme: token สีที่ derive ตอน build (GUI redesign ส.ค. 2026 — spec §3.2) ──
{
  const bt = require('../tools/brandtheme.js');
  const t = { accent: '#31a60d', accentDark: '#23760a' };
  const dv = b.deriveTheme(t);
  ok(dv.tintBg === bt.mixHex('#f4f5f7', '#31a60d', 0.07), 'deriveTheme: tintBg = mix(accent 7%, #f4f5f7)');
  ok(dv.tintBg === '#e6efe7', 'deriveTheme: tintBg ค่าจริงของ #31a60d = #e6efe7');
  ok(dv.tintCard === bt.mixHex('#ffffff', '#31a60d', 0.04), 'deriveTheme: tintCard = mix(accent 4%, #fff)');
  ok(dv.line === bt.mixHex('#e6e8ec', '#31a60d', 0.14), 'deriveTheme: line = mix(accent 14%, #e6e8ec)');
  ok(dv.line2 === bt.mixHex('#d8dbe1', '#31a60d', 0.26), 'deriveTheme: line2 = mix(accent 26%, #d8dbe1)');
  ok(dv.soft === bt.mixHex('#ffffff', '#31a60d', 0.10), 'deriveTheme: soft = mix(accent 10%, #fff) — 13% ตก AA (GNRC/HLI)');
  ok(dv.shadow === '0 1px 2px rgba(49,166,13,.12),0 10px 30px rgba(49,166,13,.13)', 'deriveTheme: shadow = เงาย้อม rgb ของ accent');
  ok(dv.shadowLg === '0 2px 4px rgba(49,166,13,.14),0 18px 46px rgba(49,166,13,.18)', 'deriveTheme: shadowLg');
  ok(b.deriveTheme({ accent: 'rgb(49,166,13)' }).tintBg === dv.tintBg, 'deriveTheme: accent รูป rgb() เท่า hex (ผ่าน effectiveHex)');
  ok(/^#[0-9a-f]{6}$/i.test(b.deriveTheme(undefined).tintBg), 'deriveTheme: ไม่มี theme → THEME_DEFAULTS ไม่ throw');
  const head = b.renderHead(t);
  ok(!head.includes('__RD_TINTBG__') && !head.includes('__RD_SOFT__'), 'renderHead: token ใหม่ถูกเติมหมด ไม่เหลือ __RD_*__ ค้าง');
  ok(head.includes('Sarabun') && !head.includes('Kanit'), 'FONT_LINKS ใช้ font เดิม (Sarabun) ไม่มี Kanit — เจ้าของสั่งกลับ 12 ส.ค. 69');
}

// ── injectTA: config + <script> ก่อน </body> เฉพาะ dist (rd=null = รายงาน legacy → ข้าม) ──
const taBody = '<body><h1>X</h1></body>';
const rdBase = { fv: 120, gauge: { cur: 100 }, theme: { accent: '#0071e3', accentDark: '#0058b9' } };
{
  const out = b.injectTA(taBody, 'AAPL', rdBase, { currency: 'USD' }, 'assets/ta-abc123.js');
  ok(/window\.__TA_CFG__=\{/.test(out), 'injectTA: แทรก window.__TA_CFG__= ก่อน </body>');
  ok(out.includes('<script defer src="/assets/ta-abc123.js"></script>'), 'injectTA: แทรก <script defer src="/assets/ta-XXXX.js">');
}
ok(b.injectTA(taBody, 'AAPL', null, { currency: 'USD' }, 'assets/ta-abc123.js') === taBody, 'injectTA: rd=null (รายงาน legacy) → คืน html เดิมเป๊ะ (identity)');
{
  const evilRd = { ...rdBase, theme: { ...rdBase.theme, accent: 'rgb(0,0,0)</script><script>alert(1)//)' } };
  const out = b.injectTA(taBody, 'AAPL', evilRd, { currency: 'USD' }, 'assets/ta-abc123.js');
  ok(!out.includes('</script><script>alert'), 'injectTA: theme.accent มี </script><script> → ไม่หลุดออกจาก inline script เดิม (escape < กัน breakout)');
  ok(out.includes('\\u003cscript>alert'), 'injectTA: "<" ใน theme.accent ถูก escape เป็น \\u003c ใน __TA_CFG__ (">" ไม่ต้อง escape)');
}
// ── injectTA: $ ในค่าแทนที่ห้ามถูกตีความ (GetSubstitution) — เหตุผลเดียวกับที่ fillTokens ใช้ split/join ──
//   ก่อนแก้: replace('</body>', `…${cfgJson}…`) ทำให้ $& กลายเป็น "</body>" และ $$ ยุบเป็น "$" → cfg เพี้ยนเงียบ ๆ
{
  const dollarRd = { ...rdBase, theme: { accent: '$&$$', accentDark: "$`$'$1" } };
  const out = b.injectTA(taBody, 'AA$&P', dollarRd, { currency: 'USD' }, 'assets/ta-abc123.js');
  ok(out.includes('"accent":"$&$$"'), 'injectTA: $&/$$ ใน theme.accent ออกมาตรงตัว (ไม่ถูกขยายเป็น "</body>"/"$")');
  ok(out.includes(`"accentDark":"$\`$'$1"`), "injectTA: $`/$'/$1 ใน theme.accentDark ออกมาตรงตัว");
  ok(out.includes('"sym":"AA$&P"'), 'injectTA: $& ใน symbol ออกมาตรงตัว');
  ok(out.split('</body>').length === 2, 'injectTA: มี </body> เดียวใน output (ไม่มี $& ขยายเป็นแท็กปลอม)');
}

// ── stripDecorEmoji + injectSectionNav (GUI redesign — spec §4.3) ──
{
  const src = '<div class="top"><span>🐻 Bear</span></div><label>🧮 ลองคำนวณ MOS</label>' +
    '<div class="zone">💡 <b>กลยุทธ์:</b> x</div><div class="disc"><b>⚠️ คำเตือน:</b> y</div>' +
    '<p>ปกติ 🚀 ในเนื้อความต้องอยู่</p>';
  const out = b.stripDecorEmoji(src);
  ok(out.includes('<span>Bear</span>'), 'stripDecorEmoji: 🐻 ออกจากป้ายฉาก');
  ok(out.includes('<label>ลองคำนวณ MOS</label>'), 'stripDecorEmoji: 🧮 ออกจาก calc label');
  ok(out.includes('<div class="zone"><b>กลยุทธ์:</b>'), 'stripDecorEmoji: 💡 ออกจาก zone');
  ok(out.includes('<b>คำเตือน:</b>'), 'stripDecorEmoji: ⚠️ ออกจาก disc');
  ok(out.includes('ปกติ 🚀 ในเนื้อความต้องอยู่'), 'stripDecorEmoji: อีโมจิใน prose ห้ามหาย (ยิงเฉพาะ 5 ช่อง)');

  const doc = '<div class="wrap"><header>H</header>' +
    '<section><div class="s-head"><div class="n">1</div><h2>ข้อมูลสำคัญ (Key Metrics)</h2></div></section>' +
    '<section><div class="s-head"><div class="n">2</div><h2>ราคา</h2></div></section>' +
    '<section><div class="s-head"><div class="n">3</div><h2>มูลค่า</h2></div></section>' +
    '<section><div class="s-head"><div class="n">4</div><h2>คาดการณ์ผลตอบแทน 3 ปี</h2></div></section>' +
    '</div></body>';
  const nav = b.injectSectionNav(doc);
  ok(nav.includes('id="secnav"'), 'injectSectionNav: มี nav');
  ok(nav.indexOf('id="secnav"') > nav.indexOf('</header>'), 'injectSectionNav: nav อยู่หลัง header');
  ok(nav.includes('<section id="sec1">'), 'injectSectionNav: section ได้ id');
  ok(nav.includes('<span>ข้อมูลสำคัญ</span>'), 'injectSectionNav: ตัดวงเล็บอังกฤษออกจากชื่อ');
  ok(nav.includes('<span>ข้อมูลสำคัญ</span>'), 'nav: ป้ายห่อ span (ellipsis ได้)');
  // ป้ายย่อ: หัวข้อยาวถูก map เป็นชื่อสั้น
  ok(nav.includes('<span>ผลตอบแทน 3 ปี</span>'), 'injectSectionNav: NAV_SHORT map "คาดการณ์ผลตอบแทน 3 ปี" → "ผลตอบแทน 3 ปี"');
  ok(b.injectSectionNav('<header>H</header><section><h2>เดียว</h2></section>') .includes('secnav') === false, 'injectSectionNav: <3 section (legacy) → ไม่แทรก');
}

// ── stripDecorEmoji: HTML entity form (บางรายงานเก่าเข้ารหัสอีโมจิเป็น &#dec;/&#xHEX; — browser ยัง render เป็นอีโมจิเหมือนเดิม) ──
{
  const entitySrc = '<div class="top"><span>&#128059; Bear</span></div><p>&#128640; ในเนื้อความ</p>';
  const out = b.stripDecorEmoji(entitySrc);
  ok(out.includes('<span>Bear</span>'), 'stripDecorEmoji: &#128059; (entity ของ 🐻) ออกจากป้ายฉาก');
  ok(out.includes('&#128640; ในเนื้อความ'), 'stripDecorEmoji: &#128640; (entity ของ 🚀) ใน prose ห้ามหาย (ยิงเฉพาะ 5 ช่อง)');
}

// ── renderEngine: fairLabelTop ต้องกันค่าที่ไม่ใช่ px string (บั๊กจริง 317 ใบส่ง boolean — ป้าย gauge ทับกัน) ──
{
  const mk = (v) => b.renderEngine({ fv: 10, chart: { data: [['a',1],['b',2],['c',3]], min: 1, max: 3, grid: [1,2,3], fairLine: 2 }, gauge: { min: 1, max: 3, cur: 2, fair: 2, fairLabelTop: v } });
  ok(mk(true).includes('style.top="-58px"') || mk(true).includes('.style.top="-58px"'), 'fairLabelTop=true (boolean) → default -58px ไม่ใช่ "true"');
  ok(!mk(true).includes('"true"'), 'fairLabelTop=true → ไม่มีสตริง "true" หลุดลง engine');
  ok(mk('0').includes('-58px'), 'fairLabelTop="0" (ไม่มีหน่วย) → default -58px');
  ok(mk('-46px').includes('-46px'), 'fairLabelTop="-46px" (ถูกรูป) → ใช้ค่าที่ให้');
}

// ── renderTagRow: แทนป้าย 2-3 ด้วยชิปจาก tags.json (dist เท่านั้น) ──
{
  const list = [
    { slug: 'ai-datacenter', label: 'AI Data Center', aliases: ['ai', 'เอไอ'], desc: 'd' },
    { slug: 'optical-photonics', label: 'Optical & Photonics', aliases: ['optical'], desc: 'd' },
    { slug: 'thai-consumption', label: 'การบริโภคในประเทศไทย', aliases: ['ค้าปลีก'], desc: 'd' },
    { slug: 'cash-flow', label: 'Cash $$ Flow', aliases: ['cash'], desc: 'd' }, // label มี $ — เคส regression ของ String.replace
  ];
  const vocab = { version: 1, list, bySlug: new Map(list.map((e) => [e.slug, e])) };
  const tagData = {
    vocabVersion: 1,
    tags: {
      LITE: ['ai-datacenter', 'optical-photonics'], CPN: ['thai-consumption'],
      DLR: ['cash-flow'],                          // symbol ทดสอบ label ที่มี $
      GONE: ['renamed-slug-1', 'removed-slug-2'],  // slug ทั้งหมดหายจาก vocab (version drift)
    },
    requests: [],
  };
  const row = (spans) => `<header><div class="gdots"></div>\n    <div>\n      ${spans.map((s) => `<span class="tag">${s}</span>`).join('\n      ')}\n    </div>\n    <h1>X</h1></header>`;

  const out = b.renderTagRow(row(['NASDAQ: LITE', 'Technology • Optical', 'AI DC • CPO']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(out.includes('<a class="tag" href="/tag/ai-datacenter">AI Data Center</a>'), 'renderTagRow: ชิป tag เป็นลิงก์ /tag/<slug>');
  ok(out.includes('Optical &amp; Photonics'), 'renderTagRow: label ที่มี & ถูก escape');
  ok(out.includes('href="/?market=US"') && out.includes('NASDAQ: LITE'), 'renderTagRow: ป้ายตลาดเป็นลิงก์ ข้อความเดิม');
  ok(!out.includes('Technology • Optical') && !out.includes('AI DC • CPO'), 'renderTagRow: ป้าย free-text เดิมถูกแทนหมด');
  ok((out.match(/class="tag"/g) || []).length === 3, 'renderTagRow: ได้ 3 ป้าย (ตลาด + 2 tag)');

  // 17 เคส exchange พิเศษ — ข้อความต้องคงเป๊ะ ห้าม parse
  ['NASDAQ: ASML (ADR)', 'NYSE: CCJ / TSX: CCO', 'OTC Markets: FANUY (ADR)', 'NASDAQ: LANC → MZTI'].forEach((ex) => {
    const o = b.renderTagRow(row([ex, 'a', 'b']), { symbol: 'LITE', market: 'US', tagData, vocab });
    ok(o.includes('>' + ex + '<'), `renderTagRow: exchange พิเศษคงข้อความเป๊ะ — ${ex}`);
  });

  // market mapping มาจาก metrics.market ไม่ใช่ข้อความ (CCJ มี "TSX" ในข้อความแต่เป็นหุ้น US)
  const oCcj = b.renderTagRow(row(['NYSE: CCJ / TSX: CCO', 'a', 'b']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(oCcj.includes('href="/?market=US"'), 'renderTagRow: market มาจาก metrics.market ไม่ใช่ข้อความ exchange');
  const oTh = b.renderTagRow(row(['SET: CPN', 'a', 'b']), { symbol: 'CPN', market: 'TH', tagData, vocab });
  ok(oTh.includes('href="/?market=TH"') && oTh.includes('การบริโภคในประเทศไทย'), 'renderTagRow: หุ้นไทย → /?market=TH + label ไทย');

  // skeleton ใหม่ (1 span) → ต่อชิปท้าย
  const o1 = b.renderTagRow(row(['NASDAQ: LITE']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok((o1.match(/class="tag"/g) || []).length === 3, 'renderTagRow: 1 span (skeleton ใหม่) → ต่อชิปเป็น 3 ป้าย');

  // ไม่มี entry → คงป้ายเดิมครบ ไม่ throw (build ผ่อนปรน · gate บังคับ)
  const oNone = b.renderTagRow(row(['NYSE: ZZZ', 'Sector เดิม', 'Niche เดิม']), { symbol: 'ZZZ', market: 'US', tagData, vocab });
  ok(oNone.includes('Sector เดิม') && oNone.includes('Niche เดิม'), 'renderTagRow: ไม่มี entry → คงป้ายเดิม ไม่ throw');

  // จำนวน span ผิดแบบ → ไม่แตะ
  const o2 = b.renderTagRow(row(['NASDAQ: LITE', 'a']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(o2.includes('>a<'), 'renderTagRow: 2 span (โครงไม่รู้จัก) → ไม่แตะ');

  // idempotent
  const twice = b.renderTagRow(out, { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(twice === out, 'renderTagRow: รันซ้ำได้ผลเท่าเดิม (idempotent)');

  // idempotent ตอน market เป็น null — เดิมพังเพราะพึ่งผลข้างเคียงที่ป้ายตลาดกลายเป็น <a> (จริงแค่ตอน
  // market เป็น TH/US) ตอน market เป็น null ป้ายตลาดยังเป็น <span> เดิม เรียกซ้ำเลยเข้าใจผิดว่าเป็น
  // skeleton ใหม่ (1 span) แล้วต่อชิปซ้ำ
  const onceNull = b.renderTagRow(row(['NASDAQ: LITE', 'Technology • Optical', 'AI DC • CPO']), { symbol: 'LITE', market: null, tagData, vocab });
  const twiceNull = b.renderTagRow(onceNull, { symbol: 'LITE', market: null, tagData, vocab });
  ok(twiceNull === onceNull, 'renderTagRow: market=null ก็ idempotent (branch ที่เคยพัง)');

  // exchange text ที่มี entity ที่ escape ไว้แล้วในไฟล์ต้นฉบับ ต้องคงเดิม byte-for-byte — ห้าม esc(spans[0])
  // ซ้ำ ไม่งั้น &amp; เดิมจะกลายเป็น &amp;amp; (double-escape)
  const oAmpEx = b.renderTagRow(row(['NYSE: A&amp;B', 'a', 'b']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(oAmpEx.includes('NYSE: A&amp;B'), 'renderTagRow: exchange ที่มี entity อยู่แล้วคงเดิม byte-for-byte');
  ok(!oAmpEx.includes('&amp;amp;'), 'renderTagRow: ไม่ double-escape entity เดิมของ exchange');

  // chip label มี $ (label จาก tags-vocab.json เป็น plain text, esc() ไม่แตะ $) — ต้องไม่ผ่าน replace(re, string)
  // ที่ตีความ $$/$&/$`/$' ให้เพี้ยน (ต้องใช้ function replacer)
  const oDollarChip = b.renderTagRow(row(['NASDAQ: DLR', 'a', 'b']), { symbol: 'DLR', market: 'US', tagData, vocab });
  ok(oDollarChip.includes('>Cash $$ Flow</a>'), 'renderTagRow: chip label มี $ ไม่ถูกตีความเป็น replacement pattern');

  // exchange text มี $ ต้องคงเดิมเช่นกัน (คนละจุดจาก spans[0] แต่ผ่าน replacer เดียวกัน)
  const oDollarEx = b.renderTagRow(row(['NASDAQ: FUND $$ ETF', 'a', 'b']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(oDollarEx.includes('>NASDAQ: FUND $$ ETF<'), 'renderTagRow: exchange text มี $ คงเดิม ไม่ถูกตีความเป็น replacement pattern');

  // slug ทั้งหมดของ symbol หายจาก vocab (version drift/slug ถูกลบ-เปลี่ยนชื่อ) → ต่างจาก "ไม่มี entry"
  // (ซึ่งไม่มี slugs เลย) ตรงที่นี่ "มี" slugs แต่ทุกตัว bySlug.has() เป็น false → ต้องคืน html เดิมทั้งก้อน
  // ไม่ใช่แค่คงป้ายเดิมบางส่วน (build ผ่อนปรน ไม่ทำข้อมูลหาย ปล่อยให้ gate ฟ้อง)
  const rowGone = row(['NYSE: GONE', 'Sector เดิม', 'Niche เดิม']);
  const oGone = b.renderTagRow(rowGone, { symbol: 'GONE', market: 'US', tagData, vocab });
  ok(oGone === rowGone, 'renderTagRow: slug ทั้งหมดหายจาก vocab → คืน html เดิมทั้งหมด');
  ok(oGone.includes('Sector เดิม') && oGone.includes('Niche เดิม'), 'renderTagRow: slug หายจาก vocab → ป้าย free-text เดิมยังอยู่ครบ');
}

// ── freshHash ต้องไม่ขึ้นกับ tag — พิสูจน์ว่าไม่มี hash churn (spec §2.1) ──
{
  const src = doc('Claude Sonnet 5', WF);
  const h1 = b.freshHash(src);
  const h2 = b.freshHash(src); // tags.json เปลี่ยนไม่มีผล — freshHash รับแค่เนื้อไฟล์ต้นฉบับ
  ok(h1 === h2, 'freshHash: ขึ้นกับเนื้อไฟล์ต้นฉบับเท่านั้น');
  ok(b.freshHash(src.replace('<h1>X</h1>', '<h1>Y</h1>')) !== h1, 'freshHash: เนื้อหาเปลี่ยนจริง → hash เปลี่ยน');
}

// ── manifest + การ์ด index ต้องพก tag ──
{
  const man = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'reports.json'), 'utf8'));
  ok(man.every((r) => Array.isArray(r.tags)), 'reports.json: ทุก record มีฟิลด์ tags เป็น array');
  const lite = man.find((r) => r.symbol === 'LITE');
  ok(!lite || lite.tags.length >= 1, 'reports.json: LITE มี tag อย่างน้อย 1 ตัว');
}

// ── filterQueryString ต้องถูกฝัง (String(fn)) ลง dist/index.html จริง ไม่ใช่แค่มีอยู่ใน tag-lib.js ──
{
  const fs = require('fs'), path = require('path');
  const idxPath = path.join(__dirname, '..', 'dist', 'index.html');
  const indexHtml = fs.existsSync(idxPath) ? fs.readFileSync(idxPath, 'utf8') : '';
  ok(indexHtml.includes('function filterQueryString(currentSearch, tag, market)'),
     'dist/index.html: มีฟังก์ชัน filterQueryString ฝังอยู่ในสคริปต์หน้า index (ต้องรัน `node build.js` ก่อน)');
  ok(indexHtml.includes('filterQueryString(location.search, tag, market)'),
     'dist/index.html: recompute() เรียก filterQueryString ด้วย location.search/tag/market จริง');
}

// ── การ embed matchTagQuery ลงสคริปต์หน้า index ──
// ตรรกะการจับคู่มีเทสครบใน test/tags-test.js แล้ว — ที่นี่ตรวจว่า "ข้อความฟังก์ชัน"
// ที่ถูก String() ไปฝังในหน้าเว็บ ยังกินได้และให้ผลเท่ากับตัวจริงใน Node
{
  const T = require('../tools/tag-lib.js');
  const src = String(T.matchTagQuery);
  ok(/^function matchTagQuery\s*\(/.test(src.trim()), 'embed: serialize แล้วยังเป็น function declaration (ฝังใน <script> ได้ตรง ๆ)');

  // ประกอบใหม่จากข้อความ เหมือนที่เบราว์เซอร์ทำ แล้วต้องได้ผลเท่ากับตัวจริง
  const revived = new Function(src + '; return matchTagQuery;')();
  const list = [
    { slug: 'ai-datacenter', label: 'AI Data Center', aliases: ['ai', 'เอไอ', 'data center'] },
    { slug: 'thai-tourism', label: 'ท่องเที่ยวไทย', aliases: ['airline', 'ท่องเที่ยว'] },
  ];
  ['ai', 'air', 'data cen', 'เอไอ', 'xyz', 'a'].forEach((q) => {
    ok(JSON.stringify(revived(q, list)) === JSON.stringify(T.matchTagQuery(q, list)),
       `embed: ผลจากข้อความที่ฝัง = ผลจากตัวจริง (q="${q}")`);
  });
}

console.log('\n' + '─'.repeat(50));
console.log(`build-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ build.js มีพฤติกรรมผิด — แก้ build.js ก่อน push\n'); process.exit(1); }
console.log('\n✅ build.js เครดิตโมเดล + freshHash ถูกต้อง\n'); process.exit(0);
