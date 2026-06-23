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

console.log('\n' + '─'.repeat(50));
console.log(`build-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ build.js มีพฤติกรรมผิด — แก้ build.js ก่อน push\n'); process.exit(1); }
console.log('\n✅ build.js เครดิตโมเดล + freshHash ถูกต้อง\n'); process.exit(0);
