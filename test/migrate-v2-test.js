#!/usr/bin/env node
'use strict';
/**
 * migrate-v2-test.js — เทสของ `tools/migrate-v2.js` (ระยะ 2 ส่วน C)
 * ยืนบน fixture แช่แข็ง (test/fixtures/{AAPL,BBL}.html) เท่านั้น — ห้ามอ่าน reports/ (test/fixture-lint.js บังคับ)
 * ★ STALE_TODAY ต้องตั้ง **ก่อน** เรียก checkHtml/migrateOne (E27/W09 อ่าน env ตอนรัน) — แบบเดียวกับ test/self-test.js
 */
const FX = require('./fixtures');
process.env.STALE_TODAY = FX.TODAY;   // E27/W09 วัดจากวันนี้ที่ตรึงไว้ ไม่ใช่ปฏิทินจริง

let n = 0, fails = 0;
const ok = (c, m, d) => { n++; if (c) return; fails++; console.error('✗ ' + m + (d ? ' — ' + d : '')); };
const { migrateOne, COPY_FIELDS } = require('../tools/migrate-v2.js');
const { expandReport } = require('../build.js');
const { checkHtml } = require('../test/check-reports.js');
const RM = require('../tools/report-meta.js');
const RV = require('../tools/report-values.js');
const { footerDate } = require('../tools/queue/footer-date.js');

for (const sym of ['AAPL', 'BBL']) {
  const src = FX[sym]();
  const r = migrateOne(src, sym + '.html', { today: FX.TODAY });
  ok(r.ok, `${sym}: migrate ได้`, r.reason);
  if (!r.ok) continue;
  const rd = RM.readReportData(r.out).data;
  ok(RV.isV2(rd) && rd.values && rd.values.px === RM.readStockMeta(src).price, `${sym}: values.px = stock-meta.price เดิม`);
  ok(rd.gauge.cur === undefined && rd.gauge.fair === undefined && rd.chart.fairLine === undefined, `${sym}: ลบ gauge.cur/fair/fairLine`);
  ok(JSON.stringify(RM.readStockMeta(r.out)) === JSON.stringify(RM.readStockMeta(src)), `${sym}: stock-meta ไม่เปลี่ยน`);
  ok(footerDate(r.out).iso === footerDate(src).iso && /<footer[\s\S]*<\/footer>/.exec(r.out)[0] === /<footer[\s\S]*<\/footer>/.exec(src)[0], `${sym}: footer ไม่ถูกแตะ`);
  ok(!RM.PX_RE.test(r.out) && r.out.includes('<div class="px">{{rd:px}}'), `${sym}: .px เป็น token`);
  ok(/class="mos-verdict \{\{rd:mosClass\}\}"/.test(r.out) && r.out.includes('<div class="big">{{rd:mos}}</div>') && r.out.includes('MOS ~ {{rd:mos}}'), `${sym}: verdict/big/summary เป็น token`);
  ok(/id="pxIn"[^>]*value="\{\{rd:pxNum\}\}"/.test(r.out), `${sym}: pxIn เป็น token`);
  const exp = expandReport(r.out);
  ok(!/\{\{rd:/.test(exp), `${sym}: expand แล้วไม่เหลือ token`);
  const g = checkHtml(exp, sym + '.html', { today: FX.TODAY });
  ok(g.errors.length === 0, `${sym}: gate หลัง migrate error 0`, g.errors.map((e) => e.id + ' ' + e.msg).join(' | '));
  ok(r.compare.every((c) => c.ok), `${sym}: ค่าทุกช่องใน COPY_FIELDS ตรงกัน (ชั้น 1)`, r.compare.filter((c) => !c.ok).map((c) => `${c.field} ${c.a}→${c.b}`).join(' | '));
  ok(r.masked === true, `${sym}: ข้อความที่มองเห็นต่างเฉพาะรูปตัวเลข (ชั้น 2)`, r.maskedDiff);
  // idempotent: migrate ซ้ำบนผลลัพธ์ = ข้าม
  const r2 = migrateOne(r.out, sym + '.html', { today: FX.TODAY });
  ok(!r2.ok && /v2 แล้ว/.test(r2.reason), `${sym}: migrate ซ้ำ = ข้าม`);
}
// mismatch → ไม่ย้าย: ปลอมให้ .big ไม่ตรง (FV−px)/FV
{
  const src = FX.BBL().replace(/<div class="big">[^<]*<\/div>/, '<div class="big">+40%</div>');
  const r = migrateOne(src, 'BBL.html', { today: FX.TODAY });
  ok(!r.ok && /gate ตกก่อน|E16/.test(r.reason), 'ใบที่ gate ตกอยู่ก่อน = ไม่ย้าย: ' + r.reason);
}
// ช่องบังคับหาย → ไม่ย้าย
{
  const src = FX.BBL().replace(/<div class="big">[^<]*<\/div>/, '<div class="big"></div>');
  const r = migrateOne(src, 'BBL.html', { today: FX.TODAY });
  ok(!r.ok, 'ช่องบังคับ (.big) หาย = ไม่ย้าย: ' + r.reason);
}
ok(COPY_FIELDS.includes('f01') && COPY_FIELDS.includes('f54') && !COPY_FIELDS.includes('f33'), 'COPY_FIELDS = ช่องผูกราคา/FV เท่านั้น (ไม่รวม f33 EPS card)');

// ══════════════════════════════════════════════════════════════════════════════
// เคสของ "ข้อเบี่ยงเบนจากสเปก" ทุกข้อ (review รอบ 1 F10) — แต่ละเคสต้องตกถ้าข้อนั้นถูกถอด/ทำให้หลวมลง
// ══════════════════════════════════════════════════════════════════════════════
const { TOLERANCE, GAP_REL, sameMoney, COPY_FIELDS: CF } = require('../tools/migrate-v2.js');
const PD = require('../tools/price-date.js');
const BBL = FX.BBL();
// ★ กติกาเดียวกับ self-test: ค่าทุกตัวใน mutation ต้อง derive จาก fixture ตอนรัน ห้าม hard-code
//   (fixture ถูกแช่แข็งใหม่ได้เสมอ — literal ที่ค้างจะทำให้ mutation กลายเป็น no-op เงียบ ๆ)
const HEAD = BBL.match(/<header[\s\S]*?<\/header>/i)[0];
const PDATE = PD.findPriceDate(HEAD).text;                       // "4 ก.ย. 2026"
const HINT_PX = /จากจุดเข้า\s*฿?\s*([\d.,]+)/.exec(BBL)[1];       // "194"
const mg = (html, o) => migrateOne(html, 'BBL.html', Object.assign({ today: FX.TODAY }, o || {}));
const cmp = (r, f) => r.compare.find((c) => c.field === f);

// ── D1 · dateEra = ศักราชของไฟล์ ห้าม hard-code ──────────────────────────────
{
  const ce = mg(BBL);
  ok(ce.ok && ce.values.dateEra === 'CE', 'D1: หัวรายงาน ค.ศ. → dateEra = CE', ce.reason || ce.values.dateEra);
  const be = mg(BBL.replace(/(\d{1,2} [ก-๙.]+ )2026/g, '$1' + '2569'));
  ok(be.ok && be.values.dateEra === 'BE', 'D1: หัวรายงาน พ.ศ. → dateEra = BE', be.reason || (be.values || {}).dateEra);
  ok(!/2026/.test(expandReport(be.out).match(/<div class="px-meta">[\s\S]*?<\/div>/)[0]), 'D1: render วันที่ตามศักราชเดิม (ไม่พลิกเป็น ค.ศ.)');
}
// ── D2 · f45/f46 ถูกลบใน v2 → เทียบกับ fv แทน (ไม่ใช่ "ข้ามช่อง") ──────────────
{
  const r = mg(BBL);
  for (const f of ['f45', 'f46']) ok(cmp(r, f) && cmp(r, f).ok && cmp(r, f).b == null, `D2: ${f} หายจริงและค่าเดิมตรงกับ fv ของ v2`);
  // ใช้ chart.fairLine (ไม่มี gate ตัวไหนอ่าน) — ถ้าปลอม gauge.fair จะไปตกที่ E19 ก่อน ไม่ได้ทดสอบสิ่งที่ตั้งใจ
  const off = BBL.replace(/"fairLine": *(\d+(?:\.\d+)?)/, (m, v) => '"fairLine": ' + (parseFloat(v) * 1.1).toFixed(2));
  ok(/"fairLine": *[\d.]+/.test(BBL), 'D2: fixture มี chart.fairLine ให้ปลอม (mutation ไม่เป็น no-op)');
  ok(!mg(off).ok && /FV ไม่ตรงกันเอง/.test(mg(off).reason), 'D2: gauge.fair ห่าง fv เกิน 1% = ไม่ย้าย (ไม่ใช่ปล่อยผ่านเพราะช่องถูกลบ)');
}
// ── D3 · f17/f18 = ความสอดคล้องภายใน v2 (ไม่ใช่ตัวยึดค่า) · ตัวยึดจริงคือ f15 ──
{
  const r = mg(BBL);
  ok(cmp(r, 'f15').ok && typeof cmp(r, 'f15').a === 'number', 'D3: f15 (.big) คือช่องที่ยึดค่า MOS v1↔v2 จริง');
  ok(TOLERANCE.f15(2.1, 0.8) === false, 'D3: f15 ไม่ยอมให้ MOS ขยับ 1.3 จุด (เกณฑ์ 0.55)');
  ok(r.notes.some((x) => /summary ค้าง/.test(x)), 'D3: ช่องสรุปที่ค้าง (v1 +2.1% vs .big +0.8%) ถูกบันทึกใน census ไม่ใช่ซ่อมเงียบ', r.notes.join(' | '));
}
// ── D4 · f51/f52 ยอม "ปัดเลข" ได้ แต่ไม่กว้างเกินข้อมูลจริง (F7: 2.5% → 1.2%) ──
{
  ok(TOLERANCE.f52([137], [136.5]) === true, 'D4: ฿137 = FV×0.7 ที่ปัดเป็นจำนวนเต็ม → ผ่าน');
  ok(TOLERANCE.f51([1.99], [2]) === true, 'D4: ช่องว่างจริงที่มากสุดในคลัง (0.5%) → ผ่าน');
  ok(GAP_REL <= 0.012, 'D4: เพดานชั้นกว้างสุด ≤ 1.2%', String(GAP_REL));
  ok(TOLERANCE.f51([100], [102]) === false, 'D4: ห่าง 2% = ตก (เกณฑ์เดิม 2.5% จะปล่อยผ่าน)');
}
// ── D5 · f34/f35 เทียบกับ RV.derive เมื่ออ่านหน้า v2 ไม่ได้ ────────────────────
{
  const r = mg(BBL);
  ok(cmp(r, 'f34').ok && cmp(r, 'f35').ok, 'D5: ผลตอบแทนฉากตรงกัน แม้ scenarioPlan อ่านหน้า v2 ไม่ได้');
  ok(r.values.scnBasis && r.values.scnBasis.perYear === 'cagr' && r.values.scnBasis.years === 3, 'D5: ถอดสูตร %/ปี ของใบนั้นได้ (cagr/3 ปี)');
}
// ── D6 · หมวด 6 พัง "ข้างใน" ต้องยิง retry แล้วคงหมวด 6 เป็น literal (F1) ──────
{
  const dup = BBL.replace(/(<li><span>ปันผลรวม 3 ปี<\/span><span>[^<]*<\/span><\/li>)/, '$1$1');
  const r = mg(dup);
  ok(r.ok, 'D6: ความล้มเหลวข้างใน tokeniseScn → retry สำเร็จ (ไม่ใช่ residue)', r.reason);
  ok(r.ok && r.notes.some((x) => /หมวด 6 คง literal/.test(x)), 'D6: บันทึกว่าคงหมวด 6 เป็น literal', (r.notes || []).join(' | '));
  ok(r.ok && !/\{\{rd:sc1tgt\}\}/.test(r.out) && /class="ret /.test(r.out), 'D6: หมวด 6 ยังเป็นข้อความเดิมทุกจุด');
}
// ── D7 · ถ้อยคำ hint ที่ไม่ตรงรูป = คง literal ไม่ใช่ปัดตกทั้งใบ (F2) ───────────
{
  const w = mg(BBL.replace('จากจุดเข้า', 'จากราคาปัจจุบัน'));
  ok(w.ok && w.sites.literal.includes('hint'), 'D7: hint คนละถ้อยคำ → ใบยังย้ายได้ โดยคง hint เป็น literal', w.reason);
  ok(w.ok && w.out.includes('จากราคาปัจจุบัน ฿' + HINT_PX), 'D7: ข้อความ hint เดิมไม่ถูกแตะ');
}
// ── D8 · กรอบ FV ต้องมีสัญลักษณ์สกุลเงินครบสองตัว ไม่งั้นคง literal ───────────
{
  const one = BBL.replace(/(<div class="k">มูลค่าเหมาะสม<\/div>\s*<div class="v"[^>]*>[^<]*<span[^>]*>\()฿/, '$1');
  const r = mg(one);
  ok(r.ok, 'D8: กรอบที่มีสกุลเงินตัวเดียว → ใบยังย้ายได้', r.reason);
  ok(r.ok && !/\{\{rd:fvLow\}\}<|\(\{\{rd:fvLow\}\}/.test(r.out.match(/<div class="k">มูลค่าเหมาะสม<\/div>[\s\S]{0,200}/)[0]), 'D8: กรอบใน vcell คง literal (ไม่งอกสัญลักษณ์สกุลเงิน)');
}
// ── F3 · token เงินห้ามปัดเลขที่คนเห็น (เคสจริง DOHOME ฿0.013 → ฿0.01 = −23%) ──
{
  ok(sameMoney('฿0.013', '฿0.01') === false, 'F3: ฿0.013 ≠ ฿0.01 (ปัดแล้วค่าหาย) → ห้ามแทน token');
  ok(sameMoney('฿0.167', '฿0.17') === false, 'F3: ฿0.167 ≠ ฿0.17 → ห้ามแทน token');
  ok(sameMoney('฿27', '฿27.00') === true, 'F3: ต่างแค่ศูนย์ท้าย ค่าเท่าเดิม → แทนได้');
  ok(sameMoney('฿1,234', '฿1,234.00') === true, 'F3: คอมมาหลักพัน ค่าเท่าเดิม → แทนได้');
  ok(sameMoney('$27', '฿27.00') === false, 'F3: คนละสกุลเงิน → ห้ามแทน');
  // รูปเดียวกับ DOHOME: ปันผลฉากที่พิมพ์ 3 ตำแหน่ง — คอลัมน์นั้นต้องคง literal ส่วนคอลัมน์อื่นยังเป็น token
  const d3 = BBL.replace(/(ปันผลรวม 3 ปี<\/span><span>~฿)27(<)/, '$1' + '26.955' + '$2');
  const r = mg(d3);
  ok(r.ok, 'F3: ใบที่ปันผลพิมพ์ 3 ตำแหน่ง ยังย้ายได้', r.reason);
  ok(r.ok && /~฿26\.955/.test(r.out) && !/\{\{rd:sc1div\}\}/.test(r.out), 'F3: คอลัมน์ที่ปัดแล้วค่าหาย → คง literal ตัวเลขเดิม');
  ok(r.ok && /\{\{rd:sc2div\}\}/.test(r.out), 'F3: คอลัมน์ที่รูปตรงกัน ยังเป็น token ตามปกติ');
  ok(r.ok && r.sites.literal.includes('scn1div'), 'F3: บันทึก site ที่คง literal ลง census');
}
// ── F4/F5 · สิ่งที่ชั้น 2 blank ทิ้ง ต้องมีคนตรวจ ─────────────────────────────
{
  ok(CF.includes('f38'), 'F4: f38 (คลาส ret pos/neg) อยู่ใน COPY_FIELDS แล้ว — ช่อง .ret ถูก strip ในชั้น 2');
  const r = mg(BBL);
  ok(cmp(r, 'f38') && cmp(r, 'f38').ok, 'F4: จำนวนคลาส ret เท่าเดิม');
  // ' • รวมปันผล' ถูก blank ในชั้น 2 และไม่มีช่องไหนในชั้น 1 ครอบคลุม ⇒ checkStripped เป็นตัวยืนยันโดยตรง
  const { checkStripped } = require('../tools/migrate-v2.js');
  const HAS = 'x • รวมปันผล y', NO = 'x y';
  ok(checkStripped(HAS, NO, { scnBasis: { divIncluded: false } }, []) === null, 'F5: หายได้เมื่อตัวเลขฉากไม่รวมปันผล');
  const nt = [];
  checkStripped(HAS, NO, { scnBasis: { divIncluded: false } }, nt);
  ok(nt.some((x) => /รวมปันผล/.test(x)), 'F5: การตัดข้อความถูกบันทึกลง census');
  ok(/ยังรวมปันผล/.test(checkStripped(HAS, NO, { scnBasis: { divIncluded: true } }, []) || ''), 'F5: หายไม่ได้เมื่อผลตอบแทนรวมปันผล');
  ok(/งอก/.test(checkStripped(NO, HAS, { scnBasis: { divIncluded: true } }, []) || ''), 'F5: ห้ามงอกข้อความที่ไม่เคยมี');
  ok(/คลาส|ret class/.test((() => { const q = []; checkStripped('<div class="ret pos">a</div>', '<div class="ret neg">a</div>', {}, q); return q.join(''); })()), 'F4: การสลับสี pos↔neg ถูกบันทึกลง census');
}
// ── F6 · วงเล็บทวนวันที่: ลบได้เฉพาะเมื่อข้างในมีแต่วันที่ ─────────────────────
{
  const q = BBL.replace(PDATE, PDATE + ' (' + PDATE + ' ตลาดปิด)');
  ok(q !== BBL, 'F6: mutation วงเล็บทวนวันที่ทำงานจริง (ไม่ใช่ no-op)');
  const r = mg(q);
  ok(r.ok, 'F6: หัวรายงานมีวงเล็บทวนที่มีคำขยาย → ยังย้ายได้', r.reason);
  ok(r.ok && /ตลาดปิด/.test(r.out) && r.sites.literal.includes('restate'), 'F6: คำขยายในวงเล็บ ("ตลาดปิด") ไม่ถูกลบ');
  ok(TOLERANCE.f11('2026-09-11', '2026-09-04') === false, 'F6: f11 ไม่ vacuous แล้ว — วันที่ทวนเปลี่ยนค่า = ตก');
  ok(TOLERANCE.f11('2026-09-11', null) === true, 'F6: วงเล็บที่มีแต่วันที่ ลบได้');
}

// ══════════════════════════════════════════════════════════════════════════════
// Task 8 · เคสขอบที่ต้องปฏิเสธ/คง literal ให้ถูก (task-8-brief.md) — ยืนบน FX.BBL()/FX.AAPL()
// string-replace เท่านั้น ห้ามแก้ fixture บนดิสก์ · ค่าทุกตัวใน mutation derive จาก fixture ตอนรัน
// ══════════════════════════════════════════════════════════════════════════════

// ── T1 · หมวด 6 ตัดสินไม่ได้ (ทำ .ret คอลัมน์ bear เป็นข้อความว่าง) → ทั้งใบยังย้ายได้ หมวด 6 คง literal ทั้งก้อน ──
{
  const mutated = BBL.replace(/(<div class="col bear">[\s\S]*?<div class="ret neg">)[^<]*(<\/div>)/, '$1$2');
  ok(mutated !== BBL, 'T1: mutation (ทำ .ret คอลัมน์ bear เป็นข้อความว่าง) ไม่เป็น no-op');
  const r = mg(mutated);
  ok(r.ok, 'T1: หมวด 6 ตัดสินไม่ได้ (รูป % ในช่อง ret ไม่ชัด) → ใบยังย้ายได้ทั้งใบ (ไม่ใช่ residue)', r.reason);
  ok(r.ok && r.values.scenarios === undefined, 'T1: values.scenarios ไม่ถูกตั้ง (หมวด 6 ตัดสินไม่ได้)');
  ok(r.ok && !/\{\{rd:sc[123]|\{\{rd:baseEps\}\}/.test(r.out), 'T1: ไม่มี token หมวด 6/EPS ฐานหลุดเข้าไปในผลลัพธ์');
  ok(r.ok && r.out.includes('จากจุดเข้า ฿' + HINT_PX), 'T1: hint "จากจุดเข้า" ในกล่อง .hint ยังเป็นข้อความเดิม (literal — tokeniseScn ไม่ถูกเรียกเลยเมื่อหมวด 6 ตัดสินไม่ได้)');
  ok(r.ok && r.out.includes('<div class="ret neg"></div>'), 'T1: .ret ที่ทำให้ว่างไว้ยังว่างเหมือนเดิม (literal)');
  ok(r.ok && r.notes.some((x) => /หมวด 6/.test(x) && /literal/.test(x)), 'T1: มี note บันทึกว่าหมวด 6 คง literal', (r.notes || []).join(' | '));
  // task-8-report.md carried item (แก้ใน Task 9): ทั้งหมวดถูกปล่อย literal ต้องลง sites.literal('scn') ด้วย
  // ไม่ใช่แค่ note — ไม่งั้นสำมะโน Part E นับ site literal ต่ำกว่าจริง (เดิมมีแค่ scn{k}div ต่อคอลัมน์)
  ok(r.ok && r.sites.literal.includes('scn'), 'T1: หมวด 6 ทั้งหมวดถูกบันทึกลง sites.literal (\'scn\') — task 8 review item', (r.sites.literal || []).join(','));
  ok(r.ok && r.out.includes('<div class="px">{{rd:px}}'), 'T1: site บังคับ .px ยังสำเร็จตามปกติ แม้หมวด 6 ตัดสินไม่ได้ (ความล้มเหลวไม่ลามข้ามหมวด)');
}

// ── T2 · การ์ด P/E สองฐาน (EPS GAAP/Adj.) → ตัดสินฐานไม่ได้ การ์ดคง literal ทั้งใบยังย้ายได้ ──
{
  const AAPL = FX.AAPL();
  const mgA = (html) => migrateOne(html, 'AAPL.html', { today: FX.TODAY });
  const dBefore = 'EPS TTM $8.26 <span class="pill a">สูงกว่าปกติ</span>';
  ok(AAPL.includes(dBefore), 'T2: AAPL fixture มีบรรทัด .d เดิมของการ์ด P/E (TTM) ให้แก้ (mutation ไม่เป็น no-op)');
  // คงฐานเดิม $8.26 ไว้ (P/E ~40x ที่การ์ดโชว์ยึดฐานนี้อยู่ — gate E41/stock-meta.pe ยังผ่าน) แล้วเติมฐานที่สอง
  // (Adj.) ให้ eps.length = 2 — ตรงกับสเปก "รับหลายฐานได้ตั้งใจ" ของ epsBasesOf แต่ migrate-v2 ต้องการ eps.length===1
  const dAfter = 'EPS GAAP $8.26 • Adj. $13.1';
  const r = mgA(AAPL.replace(dBefore, dAfter));
  ok(r.ok, 'T2: การ์ด P/E สองฐาน (GAAP/Adj.) → ใบยังย้ายได้', r.reason);
  ok(r.ok && r.values.eps === undefined, 'T2: values.eps ไม่ถูกตั้ง (การ์ด P/E ตัดสินฐานไม่ได้ — eps.length ≠ 1)');
  ok(r.ok && r.sites.literal.includes('peCard'), 'T2: site peCard ถูกบันทึกเป็น literal', r.ok ? r.sites.literal.join(',') : '');
  ok(r.ok && r.out.includes(dAfter) && !/\{\{rd:pe\}\}/.test(r.out), 'T2: การ์ด P/E คงข้อความ .d เดิม ("EPS GAAP $8.26 • Adj. $13.1") ไม่ถูกแทน token');
}

// ── T3 · วันที่ราคา + วงเล็บทวนล้วน (ต่างแค่ศักราช) ในหัวรายงาน ──────────────────
// ★ finding (ต่างจากที่ brief คาด — "ผลลัพธ์ header ไม่มีวงเล็บ" หมายถึงใบย้ายสำเร็จ): ชั้น 1 (compare f11) +
//   site 'restate' ทำงานถูกตามสเปก (ลบได้เพราะเป็นการทวนล้วน) แต่ stripVolatile/maskText มีกติกาตัด "ราคา ณ…"
//   เฉพาะในบล็อก .disc เท่านั้น ไม่ครอบคลุมวงเล็บทวนวันที่ **ในหัวรายงาน** (ที่นี่ขึ้นต้น "ราคา ≈" ไม่ใช่ "ราคา ณ")
//   ⇒ ชั้น 2 เห็นข้อความ "(…)" หายไปจริง → migrate ทั้งใบไม่ผ่าน แม้ทั้งชั้น token และชั้น compare จะถูกต้อง
//   รายงานเป็น concern ใน task-8-report.md — ไม่แก้ migrate-v2.js เพราะเป็นงานทดสอบ (Part C dry-run เท่านั้น)
{
  const AAPL = FX.AAPL();
  const mgA = (html) => migrateOne(html, 'AAPL.html', { today: FX.TODAY });
  const HEAD_A = AAPL.match(/<header[\s\S]*?<\/header>/i)[0];
  const hitA = PD.findPriceDate(HEAD_A);
  ok(!PD.findRestatedDate(HEAD_A, hitA), 'T3: AAPL fixture header ยังไม่มีวงเล็บทวนวันที่ (mutation ไม่เป็น no-op)');
  const restText = PD.renderThaiDate(hitA.day, hitA.monIdx, hitA.year, true, true);   // ศักราช พ.ศ. ของวันเดียวกัน
  const insertAt = AAPL.indexOf(HEAD_A) + hitA.index + hitA.length;
  const withParen = AAPL.slice(0, insertAt) + ' (' + restText + ')' + AAPL.slice(insertAt);
  const r = mgA(withParen);
  ok(r.sites.tokenised.includes('restate'), 'T3: วงเล็บทวนวันที่ล้วน ถูกลบที่ชั้น token (site restate สำเร็จ)', r.sites.tokenised.join(','));
  const f11 = r.compare.find((c) => c.field === 'f11');
  ok(!!f11 && f11.ok === true && f11.b == null, 'T3: f11 ใน compare = ok (v2 ไม่มีวงเล็บ — TOLERANCE.f11 ยอมให้หายได้)', JSON.stringify(f11));
  ok(!r.ok && /ข้อความที่มองเห็นเปลี่ยน/.test(r.reason), 'T3 (finding): ทั้งใบยังไม่ย้าย เพราะ stripVolatile ไม่ตัดวงเล็บทวนวันที่ในหัวรายงานทิ้ง (ต่างจาก .disc "ราคา ณ") — ชั้น 2 จึงเห็นข้อความหาย', r.reason);
}

// ── T4 · stock-meta.price ≠ ราคา header (ต่างเกิน 0.02 แต่ยังอยู่ในเกณฑ์ gate E30 ~2%) → migrator ปฏิเสธเอง ──
{
  const sm0 = RM.readStockMeta(BBL);
  const delta = Math.max(0.5, sm0.price * 0.005);
  ok(delta > 0.02 && delta < 0.02 * sm0.price, 'T4: delta อยู่ระหว่างเกณฑ์ migrator (0.02 บาท) กับเกณฑ์ gate E30 (~2%) พอดี');
  const newPrice = sm0.price + delta;
  const mutated = BBL.replace(new RegExp('("price":)' + String(sm0.price).replace('.', '\\.') + '\\b'), (m, p1) => p1 + newPrice);
  ok(mutated !== BBL, 'T4: mutation แก้ stock-meta.price สำเร็จ (ไม่เป็น no-op)');
  const r = mg(mutated);
  ok(!r.ok && /ราคา header ≠ stock-meta/.test(r.reason), 'T4: ราคา header ≠ stock-meta (ต่างเกิน 0.02 แต่ gate E30 ยังผ่านเพราะ ≤2%) → migrator ปฏิเสธเอง', r.reason);
}

// ── T5 · ".px" มีช่องว่างหลังสัญลักษณ์สกุลเงิน ("฿ 193.50") → PX_PARTS_RE (ตัวเขียน) match 0 ──────
// ★ ใช้ RM.readHeaderPrice() + string replace ล้วน (ไม่เขียน regex ของตัวเองที่หน้าตาเหมือน .px) — เจตนา
//   เดียวกับที่ migrate-v2.js ต้องทำ: parser-lint ห้ามมีสำเนา regex บล็อก .px นอก tools/report-meta.js
{
  const hp = RM.readHeaderPrice(BBL);
  ok(!!hp, 'T5: อ่านราคา header ของ BBL ได้ (RM.readHeaderPrice)');
  const before = `<div class="px">${hp.currency}${hp.raw}<small>`;
  ok(BBL.includes(before), 'T5: พบรูป .px เดิมของ BBL ให้แก้ (mutation ไม่เป็น no-op)');
  const mutated = BBL.replace(before, `<div class="px">${hp.currency} ${hp.raw}<small>`);
  ok(mutated !== BBL, 'T5: mutation เติมช่องว่างใน .px สำเร็จ');
  const r = mg(mutated);
  ok(!r.ok && /site px match ≠ 1/.test(r.reason), 'T5: ".px" มีช่องว่างหลังสัญลักษณ์สกุลเงิน → PX_PARTS_RE (ตัวเขียน) match 0 ครั้ง = ไม่ย้าย (ตรงกับที่ cron เขียนเลขนี้ไม่ได้เช่นกัน — report-meta.js เจตนา)', r.reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// Task 9 · fixture v2 แช่แข็ง (test/fixtures/{AAPL,BBL}-v2.html) — sanity บนไฟล์ที่ freeze ไว้แล้ว
// ★ เทียบ values.px กับ stock-meta ของ fixture **v1** (FX.BBL()) — ตัวเลขต้องรอดการย้ายมาเป๊ะ
// ══════════════════════════════════════════════════════════════════════════════
{
  const v2 = FX.BBL_V2();
  const rd2 = RM.readReportData(v2).data;
  ok(RV.isV2(rd2), 'Task 9: BBL-v2.html เป็น schema v2 (RV.isV2)');
  ok(rd2.values.px === RM.readStockMeta(FX.BBL()).price, 'Task 9: values.px ของ BBL-v2 = stock-meta.price ของ BBL v1 เดิม (ตัวเลขรอดการย้าย)', String(rd2.values.px));
  const exp2 = expandReport(v2);
  ok(!/\{\{rd:/.test(exp2), 'Task 9: BBL-v2 expand แล้วไม่เหลือ token');
  const g2 = checkHtml(exp2, 'BBL.html', { today: FX.TODAY });
  ok(g2.errors.length === 0, 'Task 9: BBL-v2 expand แล้ว gate error 0', g2.errors.map((e) => e.id + ' ' + e.msg).join(' | '));
}

// ══════════════════════════════════════════════════════════════════════════════
// Fix wave (part-c-final-review.md) · item 4 — AAPL-v2/BBL-v2 ต้องตรงกับ migrateOne(v1) เป๊ะไบต์
// เดิมมีแค่ BBL ถูกยืนยันขนาดนี้ (AAPL-v2 ไม่มีอะไร assert เลย) ⇒ สองฝั่ง (fixture v1/v2) ดริฟท์กันเงียบได้
// ══════════════════════════════════════════════════════════════════════════════
{
  const rAAPL = migrateOne(FX.AAPL(), 'AAPL.html', { today: FX.TODAY });
  ok(rAAPL.ok && rAAPL.out === FX.AAPL_V2(), 'item4: migrateOne(AAPL v1).out === AAPL-v2.html เป๊ะไบต์ต่อไบต์', rAAPL.ok ? '(ไม่เท่ากัน)' : rAAPL.reason);
  const rBBL = migrateOne(FX.BBL(), 'BBL.html', { today: FX.TODAY });
  ok(rBBL.ok && rBBL.out === FX.BBL_V2(), 'item4: migrateOne(BBL v1).out === BBL-v2.html เป๊ะไบต์ต่อไบต์', rBBL.ok ? '(ไม่เท่ากัน)' : rBBL.reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// Fix wave · item 1 — สำมะโนต้องทนรีรัน (mergeCensus คีย์ด้วย sym, last write wins, ไม่ append ซ้ำ)
// ══════════════════════════════════════════════════════════════════════════════
{
  const { mergeCensus, renderCensusMd: renderMd } = require('../tools/migrate-v2.js');
  const batch0 = [
    { sym: 'AEM', ok: true, reason: null, tokenised: ['px'], literal: [], notes: [], pyChanges: [] },
    { sym: 'BTG', ok: false, reason: 'gate ตกก่อนย้าย: E01 x', tokenised: [], literal: [], notes: [], pyChanges: [] },
  ];
  const m1 = mergeCensus(null, 0, batch0, '2026-09-13T00:00:00.000Z');
  ok(Object.keys(m1.bySym).length === 2, 'item1: แบตช์แรก (2 ใบ) → bySym มี 2 sym');
  const m2 = mergeCensus(m1, 0, batch0, '2026-09-13T00:05:00.000Z');           // รีรันแบตช์ 0 ซ้ำ (retry ของ Part E)
  ok(Object.keys(m2.bySym).length === 2, 'item1: รีรันแบตช์เดิม (retry) ไม่เพิ่มจำนวน sym — idempotent');
  ok(m2.batches.length === 1, 'item1: log ของแบตช์ก็ไม่โตซ้ำเมื่อ batch number เดิม');
  const md = renderMd(Object.values(m2.bySym));
  ok(/\| รวม \| 2 \|/.test(md), 'item1: ตัวเลข "รวม" ใน .md = 2 ไม่ใช่ 4 หลังรีรันแบตช์เดิม', md.split('\n').find((l) => l.includes('รวม')));
  ok(!/AEM[\s\S]*AEM/.test(md.split('##')[0]), 'item1: หัวตาราง "ผล" ไม่มีชื่อ AEM ซ้ำ (เคสจริงที่รีวิวเจอ)');
  // แบตช์ถัดไปแตะ sym เดิม (เช่นวิเคราะห์ใหม่/ย้ายสำเร็จเพิ่ม) — last write wins ตาม sym ไม่ใช่ตาม batch
  const m3 = mergeCensus(m2, 1, [{ sym: 'AEM', ok: true, reason: null, tokenised: ['px', 'chg'], literal: [], notes: [], pyChanges: [] }], '2026-09-13T01:00:00.000Z');
  ok(Object.keys(m3.bySym).length === 2, 'item1: sym ซ้ำข้ามแบตช์ (AEM ในแบตช์ 1) ไม่เพิ่มจำนวนรวม');
  ok(m3.bySym.AEM.batch === 1 && m3.bySym.AEM.tokenised.length === 2, 'item1: ค่า AEM ล่าสุด (แบตช์ 1) ชนะค่าเดิม (แบตช์ 0)', JSON.stringify(m3.bySym.AEM));
}

// ══════════════════════════════════════════════════════════════════════════════
// Fix wave · item 2 — census ต้องเปิดเผยผลต่าง %/ปี ของหมวด 6 ที่คนเห็นเปลี่ยน (form-only vs value จริง)
// ══════════════════════════════════════════════════════════════════════════════
{
  const { scnPyDiffs } = require('../tools/migrate-v2.js');
  const mkRet = (a, b, c) => `<div class="ret neg">รวม ~ ${a}</div><div class="ret pos">รวม ~ ${b}</div><div class="ret pos">รวม ~ ${c}</div>`;
  const before = mkRet('−9% (≈ −3.1%/ปี)', '+29% (≈ +8.9%/ปี)', '+59% (≈ +16.6%/ปี)');
  const after = mkRet('−9% (−3%/ปี)', '+29% (+8.9%/ปี)', '+59% (+16%/ปี)');   // เคสจริงในรีวิว: AEHR +16.6 → +16 (ห่างสุด 0.6pp)
  const diffs = scnPyDiffs(before, after);
  ok(diffs.length === 2, 'item2: base (+8.9%/ปี เท่าเดิม) ไม่ถูกนับ — เหลือแค่ bear/bull ที่ข้อความเปลี่ยน', JSON.stringify(diffs));
  const bear = diffs.find((d) => d.col === 'bear'), bull = diffs.find((d) => d.col === 'bull');
  ok(!!bear && bear.kind === 'form' && bear.before === '−3.1%/ปี' && bear.after === '−3%/ปี', 'item2: bear −3.1→−3 = form-only (ปัดตามความละเอียดที่ v2 โชว์แล้วเท่ากันเป๊ะ)', JSON.stringify(bear));
  ok(!!bull && bull.kind === 'value' && bull.before === '+16.6%/ปี' && bull.after === '+16%/ปี', 'item2: bull +16.6→+16 = value จริง (ปัดแล้วยังไม่เท่ากัน — เคส AEHR ของรีวิว)', JSON.stringify(bull));
}

// ══════════════════════════════════════════════════════════════════════════════
// Fix wave 2 (part-c-final-review.md follow-up) — ยามโครงสร้าง %/ปี ของหมวด 6 (scnPyCountGuard)
// ★ เคสจริงในคลัง (RS.html): v1 เขียนต่อปีด้วยคำ "ต่อปี" ("−54% / −23% ต่อปี") ไม่ใช่หน่วย "%/ปี" — scenarioPlan()
//   ยังอ่านออกว่าเป็นต่อปี (SCN_PERYEAR_AFTER รู้จักทั้ง "/ปี" และ "ต่อปี") shapeOk จึงยังผ่านและ tokenise สำเร็จ
//   แต่ v2 render คงที่เป็น "(X%/ปี)" เสมอ ⇒ หน่วย "%/ปี" ที่คนเห็นงอกขึ้นมาโดยไม่มีในต้นฉบับ — ทั้ง TOLERANCE.f34/f35
//   (ค่าตัวเลขใกล้กันพอ ≤1.0 pp) และมาสก์ชั้น 2 (.ret ถูก stripVolatile blank ทิ้ง) มองไม่เห็นเรื่องนี้เลย
//   ⇒ ถ้าไม่มียามนี้ ใบจะย้ายผ่านเงียบ ๆ (ทดสอบนี้จึง pin พฤติกรรม: ถอด/ทำให้ยามนี้หลวมลง = r.ok กลับเป็น true)
// ══════════════════════════════════════════════════════════════════════════════
{
  const mutated = BBL
    .replace('รวม ~ −9% (≈ −3.1%/ปี)', 'รวม ~ −9% / −3% ต่อปี')
    .replace('รวม ~ +29% (≈ +8.9%/ปี)', 'รวม ~ +29% / +9% ต่อปี')
    .replace('รวม ~ +59% (≈ +16.7%/ปี)', 'รวม ~ +59% / +17% ต่อปี');
  ok(mutated !== BBL, 'guard2: mutation (คำ "ต่อปี" แทนหน่วย "%/ปี" ทั้ง 3 คอลัมน์) ไม่เป็น no-op');
  const r = mg(mutated);
  // BBL fixture มีบรรทัดสมมติฐาน "EPS N%/ปี" ต่อคอลัมน์ (literal เสมอ ไม่ถูกแตะ) อยู่แล้ว 3 จุด ⇒ หลัง mutation
  // หมวด 6 ของ v1 เหลือหน่วย %/ปี = 3 (แค่ EPS) แต่ v2 render เพิ่ม .ret อีก 3 = 6 — ไม่ใช่ 0→3 แบบ RS เป๊ะ ๆ
  // (RS ไม่มีบรรทัด EPS สมมติฐาน) แต่กลไกเดียวกัน: จำนวนขยับเพราะ .ret เปลี่ยนหน่วย ไม่ใช่เพราะ EPS ซึ่งคงเดิม
  ok(!r.ok, 'guard2: ใบที่ v2 จะทำให้จำนวนหน่วย %/ปี ในหมวด 6 ขยับ ต้องไม่ย้าย — ปฏิเสธทั้งใบ', r.ok ? 'ย้ายผ่าน (ยามหาย/หลวมไป)' : r.reason);
  ok(!r.ok && /จำนวนช่อง %\/ปี ไม่เท่าเดิม \(v1 3 → v2 6\)/.test(r.reason || ''), 'guard2: เหตุผลระบุจำนวนก่อน/หลังชัดเจน (v1 3 → v2 6)', r.reason);
  ok(!r.out, 'guard2: ไม่มี out เมื่อถูกปฏิเสธ — ทั้งใบไม่ย้าย ไม่ใช่คง literal บางส่วน');
  ok(!(r.notes || []).some((x) => /หมวด 6 คง literal/.test(x)), 'guard2: ไม่ถูก retry-คง-literal ดูดกลืนไปเงียบ ๆ — ต้องเป็น residue ตรง ๆ ให้คนตรวจตามที่ตกลงกัน', (r.notes || []).join(' | '));
  // หมายเหตุ: เคสต้นแบบที่พบปัญหานี้จริงคือ reports/RS.html (v1 เขียน "ต่อปี" ล้วน ไม่มี "%/ปี" เลย → v1 0 → v2 3
  // จุด) — ยืนยันด้วยมือระหว่างพัฒนา (ดู part-c-fixwave2-report.md) แต่ห้ามอ่าน reports/ จากเทสนี้ (fixture-lint.js
  // บังคับ) จึงจำลองกลไกเดียวกันผ่าน BBL fixture ข้างบนแทน
}

console.log(`migrate-v2-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
