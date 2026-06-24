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

// ── decorateReport: per-report model end-to-end ──
const rec = (html, s) => ({ symbol: s, file: s + '.html', ...b.extractMeta(html, s), updated: '2026-01-01T00:00:00Z', hash: 'x' });
const decOpus = b.decorateReport(withOpus, rec(withOpus, 'X'));
ok(/🤖[^<]*<b>Claude Opus 4\.8<\/b>\s*·\s*Anthropic/.test(decOpus), 'decorateReport: footer โชว์โมเดลของ report (Opus)');
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

console.log('\n' + '─'.repeat(50));
console.log(`build-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ build.js มีพฤติกรรมผิด — แก้ build.js ก่อน push\n'); process.exit(1); }
console.log('\n✅ build.js เครดิตโมเดล + freshHash ถูกต้อง\n'); process.exit(0);
