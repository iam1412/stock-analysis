#!/usr/bin/env node
'use strict';
/**
 * migrate-v2-test.js — เทสของ `tools/migrate-v2.js` (ระยะ 2 ส่วน C)
 * ยืนบน fixture แช่แข็ง (test/fixtures/{AAPL,BBL}.html) เท่านั้น — ห้ามอ่าน reports/ (test/fixture-lint.js บังคับ)
 * ★ STALE_TODAY ต้องตั้ง **ก่อน** เรียก checkHtml/migrateOne (E27/W09 อ่าน env ตอนรัน) — แบบเดียวกับ test/self-test.js
 */
const FX = require('./fixtures');
process.env.STALE_TODAY = FX.TODAY;   // E27/W09 วัดจากวันนี้ที่ตรึงไว้ ไม่ใช่ปฏิทินจริง

const { migrateOne, COPY_FIELDS } = require('../tools/migrate-v2.js');
const { expandReport } = require('../build.js');
const { checkHtml } = require('../test/check-reports.js');
const RM = require('../tools/report-meta.js');
const RV = require('../tools/report-values.js');
const { footerDate } = require('../tools/queue/footer-date.js');

/**
 * run(ok) — เนื้อเทสทั้งหมดของไฟล์นี้ ห่อเป็นฟังก์ชันเดียว รับ `ok` เข้ามาจากผู้เรียก
 * (test/v2-path-test.js require ไฟล์นี้เข้าไปรันเป็นขั้นย่อยของมันแทนที่จะเป็นขั้น verify ของตัวเอง —
 * ผลรวม n/fails จึงต้องสะสมเข้า accumulator ของผู้เรียก ไม่ใช่ของไฟล์นี้เอง)
 * รันตรง ๆ ก็ยังทำงานเหมือนเดิมทุกอย่างผ่าน guard `require.main === module` ด้านล่าง
 */
function run(ok) {
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
  const g = checkHtml(exp, sym + '.html', { today: FX.TODAY, source: r.out });   // source = ต้นฉบับ v2 (มี token) — E44 อ่าน ctx.source
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
  // round 2: ท้าย clause ต้องอยู่ในรูป whitelist ⇒ fixture เดิม ("… y") ไม่ใช่รูปที่อนุญาตอีกต่อไป (ดู F5b)
  const HAS = 'x • รวมปันผล $2.88/ปี<z', NO = 'x<z';
  ok(checkStripped(HAS, NO, { scnBasis: { divIncluded: false } }, []) === null, 'F5: หายได้เมื่อตัวเลขฉากไม่รวมปันผล');
  const nt = [];
  checkStripped(HAS, NO, { scnBasis: { divIncluded: false } }, nt);
  ok(nt.some((x) => /รวมปันผล/.test(x)), 'F5: การตัดข้อความถูกบันทึกลง census');
  ok(nt.some((x) => x.includes('$2.88/ปี')), 'F5b (R2): note บอก **ข้อความที่หายจริง** ไม่ใช่แค่ป้าย', nt.join(' | '));
  ok(/ไม่อยู่ในรูปที่อนุญาต/.test(checkStripped('x • รวมปันผล และเป้าหมาย 3 ปีปรับเป็น $900 จาก $800<z', 'x<z', { scnBasis: { divIncluded: false } }, []) || ''),
    'F5b (R3): clause ที่หายแต่ท้ายไม่อยู่ใน whitelist = ปฏิเสธ (ยามไม่ได้นับแค่จำนวนป้ายอีกแล้ว)');
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
  const g2 = checkHtml(exp2, 'BBL.html', { today: FX.TODAY, source: v2 });
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
  // ระยะ 2 ส่วน D fix wave M10 — fixture รูปคลังจริง (DDOG/SRE/FTV/DPZ/CASY) ต้องเป็นผลของ migrator เป๊ะไบต์เหมือนกัน
  //   (สร้างด้วย `node tools/migrate-v2.js --fixture DDOG SRE FTV DPZ CASY` · วันนี้ต่อไฟล์ = FX.TODAY_OF)
  for (const sym of ['DDOG', 'SRE', 'FTV', 'DPZ', 'CASY']) {
    const r = migrateOne(FX[sym](), sym + '.html', { today: FX.TODAY_OF[sym] });
    ok(r.ok && r.out === FX[sym + '_V2'](), `M10: migrateOne(${sym} v1).out === ${sym}-v2.html เป๊ะไบต์ต่อไบต์`, r.ok ? '(ไม่เท่ากัน)' : r.reason);
  }
  // รูปที่ fixture แต่ละใบถูกเลือกมาครอบ — ถ้า migrator เปลี่ยนจนรูปหาย เทสของ fix wave จะผ่านลอย ๆ ⇒ ตรึงไว้ที่นี่
  const RMm = require('../tools/report-meta.js');
  const vOf = (k) => RMm.readReportData(FX[k]()).data.values;
  ok(Math.abs(RMm.readStockMeta(FX.DDOG_V2()).pe - vOf('DDOG_V2').px / vOf('DDOG_V2').eps) / RMm.readStockMeta(FX.DDOG_V2()).pe > 1, 'M10 รูป DDOG: stock-meta.pe ห่าง px/values.eps เกินเท่าตัว (หลายฐาน P/E)');
  ok(/\$2\.38/.test(FX.SRE_V2()) && vOf('SRE_V2').dps === 2.58, 'M10 รูป SRE: การ์ดปันผลมี DPS $2.38 (ฐาน W19) ≠ values.dps 2.58');
  ok(vOf('FTV_V2').scnBasis.divIncluded === true && vOf('CASY_V2').scnBasis.divIncluded === false, 'M10 รูป FTV/CASY: scnBasis.divIncluded true/false');
  ok(FX.DPZ_V2().includes('{{rd:priceDate}} (11 ก.ย. 2569 ตลาดปิด)'), 'M10 รูป DPZ: วงเล็บทวนวันที่มีคำขยายเป็น literal');
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

// ══════════════════════════════════════════════════════════════════════════════
// ระยะ 2 ส่วน E · Task 14a — cron differential (`cronDiff` / `--cron-diff`) ยืนบน fixture คู่ v1/v2 เท่านั้น
// ★ ทุก mutation derive ค่าจาก fixture ตอนรัน + ยืนยันว่าไม่เป็น no-op · grid ย่อสำหรับเคส mutation (เร็ว) · คู่สะอาดใช้ grid เต็ม
// ★ พิสูจน์ว่าจับของจริง (ทำครั้งเดียวระหว่างพัฒนา — task-14a-report.md): cronDiff ตัวนี้ + cron ก่อน fix wave ส่วน D
//   (git archive 42e7a413) บน fixture ชุดเดียวกัน → DDOG meta:pe · SRE meta:dividendYield+gate-error · FTV/CASY gate-error (W17)
//   · DPZ visible (วงเล็บทวนวันที่ค้าง) · AAPL/BBL ผ่าน
// ══════════════════════════════════════════════════════════════════════════════
{
  const MG = require('../tools/migrate-v2.js');
  const UP = require('../tools/update-prices.js');
  const envBefore = process.env.STALE_TODAY;
  // ── คู่สะอาด (grid เต็ม 61 จุด) → ok · รวมรูปคลังจริงของ final review ส่วน D ทั้ง 5 ใบ ──
  for (const sym of FX.SYMS) {
    const cd = MG.cronDiff(FX[sym](), FX[sym + '_V2'](), sym + '.html');
    ok(cd.ok && cd.kinds.length === 0 && cd.points === MG.CRON_GRID.length, `14a: ${sym} v1↔v2 ผล cron เท่ากันภายใต้รูปทั้ง ${MG.CRON_GRID.length} จุด`, JSON.stringify({ kinds: cd.kinds, k: cd.k, detail: cd.detail }));
  }
  ok(process.env.STALE_TODAY === envBefore, '14a: cronDiff คืน STALE_TODAY ค่าเดิมหลังรัน', String(process.env.STALE_TODAY));
  ok(MG.CRON_GRID.length === 61 && MG.CRON_GRID[0] === 0.85 && MG.CRON_GRID[60] === 1.15 && MG.CRON_GRID.includes(1.005), '14a: grid ×0.85→×1.15 ทีละ 0.005 (61 จุด · ปัดทศนิยมลอยตัวแล้ว)');
  // "รูป" หมวด 6 (เช่น 69.5→69) = ไม่ตก แต่ต้องถูกบันทึกเพื่อแถว census
  {
    const cd = MG.cronDiff(FX.FTV(), FX.FTV_V2(), 'FTV.html', { grid: [0.85] });
    ok(cd.ok && cd.formOnly.some((f) => f.part === 'ret'), '14a: FTV รูปทศนิยมช่อง .ret เปลี่ยน (เช่น +69.5%→+69%) = formOnly ไม่ใช่ความล้มเหลว', JSON.stringify(cd.formOnly));
  }
  // ── วันที่ patch = วันที่ 2 ของเดือนถัดไป (ข้ามเดือน/ข้ามปี) ──
  ok(JSON.stringify(MG.cronDateParts('2026-09-11')) === JSON.stringify({ day: 2, monIdx: 9, yearCE: 2026 }), '14a: priceDate ก.ย. → patch 2 ต.ค.');
  ok(JSON.stringify(MG.cronDateParts('2026-12-30')) === JSON.stringify({ day: 2, monIdx: 0, yearCE: 2027 }), '14a: priceDate ธ.ค. → patch 2 ม.ค. ปีถัดไป');
  // ── รูปของ stock-meta ──
  ok(MG.sameMetaForm(75.4, 75) && MG.sameMetaForm(6, 6.0) && MG.sameMetaForm(null, null), '14a: stock-meta ต่างแค่ทศนิยม = เท่ากัน (75.4 ~ 75)');
  ok(!MG.sameMetaForm(1.4, 1.2) && !MG.sameMetaForm(null, 1.2) && !MG.sameMetaForm(75, 453.7), '14a: stock-meta ต่างค่า = ไม่เท่ากัน (1.4 ≠ 1.2 · DDOG 75 ≠ 453.7)');
  // ── %/ปี ที่อธิบายได้ด้วยรูปของ "รวม" ทั้งสองฝั่ง (HON: −25.6%→−9.4%/ปี vs −26%→−10%/ปี) ──
  {
    const T = (t) => ({ t, v: parseFloat(t) });
    const cagr3 = { years: 3, divIncluded: true, perYear: 'cagr' };
    ok(MG.pyExplained(T('-25.6'), T('-9.4'), T('-26'), T('-10'), cagr3), '14a: %/ปี ต่าง 0.6 จุดแต่เป็นผลของรูป "รวม" (−25.6 vs −26) ทั้งสองฝั่ง = รูป');
    ok(!MG.pyExplained(T('-25.6'), T('-9.4'), T('-26'), T('-12'), cagr3), '14a: %/ปี ที่ไม่ใช่ f(รวมที่โชว์) = ไม่ใช่รูป');
    // v1 เขียนต่อปีขึ้นก่อน (PYPL) — จัดตามบทบาทไม่ใช่ตามลำดับ
    const a = '<section><div class="ret pos">+0.2%/ปี (3 ปี รวม +0.5%)</div></section>';
    ok(MG.visibleCronDiff(a, '<section><div class="ret pos">+0.5% (+0.2%/ปี)</div></section>', cagr3 && { scnBasis: cagr3 }).bad === null, '14a: ช่อง .ret ที่ v1 เขียน %/ปี ขึ้นก่อน = เทียบตามบทบาท (ผ่าน)');
    ok(MG.visibleCronDiff(a, '<section><div class="ret pos">+0.9% (+0.3%/ปี)</div></section>', { scnBasis: cagr3 }).bad !== null, '14a: ช่อง .ret ค่าต่างจริง (+0.5% vs +0.9%) = ตก');
    ok(MG.visibleCronDiff('<div class="ret neg">−2%</div>', '<div class="ret pos">+2%</div>', {}).bad !== null, '14a: เครื่องหมายผลตอบแทนพลิก = ตก');
    ok(MG.visibleCronDiff('<div class="ret neg">+2%</div>', '<div class="ret pos">+2%</div>', {}).bad === null
      && MG.visibleCronDiff('<div class="ret neg">+2%</div>', '<div class="ret neg">+2%</div>', {}).retClass === 0
      && MG.visibleCronDiff('<div class="ret neg">+2%</div>', '<div class="ret pos">+2%</div>', {}).retClass === 1, '14a: สีช่อง .ret v1 ค้าง (neg บน +2%) · v2 ถูก (pos) = ไม่ตก แต่นับ retClass');
    ok(MG.visibleCronDiff('<div class="ret pos">+2%</div>', '<div class="ret neg">+2%</div>', {}).bad !== null, '14a: v2 สีขัดเครื่องหมายตัวเอง = ตก');
    // หน่วยใหญ่ของเงินต่างกัน (v1 คงหน่วยผู้เขียน · v2 fmtBig เลือกหน่วยใหม่) — ★ fix round 2: กติกาเลขนัยสำคัญ (unitForm)
    //   ปัดฝั่งละเอียดไปที่หลักสุดท้ายของฝั่งหยาบแล้วต้องเท่ากัน · ฝั่งละเอียดต้องเหลือเลขนัยสำคัญ ≥1 หลักที่ตำแหน่งนั้น
    const cap = (t) => `<p>Market Cap ~฿${t} ~2.97 พันล้านหุ้น</p>`;
    const u = MG.visibleCronDiff(cap('0.894 ล้านล้าน'), cap('8.94 แสนล้าน'), {});
    ok(u.bad === null && u.forms.some((f) => /ล้านล้าน/.test(f.before) && /แสนล้าน/.test(f.after)), 'fix2: ฿0.894 ล้านล้าน ~ ฿8.94 แสนล้าน = รูป (บันทึก formOnly)', JSON.stringify(u));
    ok(MG.visibleCronDiff(cap('1 ล้านล้าน'), cap('5.1 แสนล้าน'), {}).bad !== null, 'fix2: ฿1 ล้านล้าน vs ฿5.1 แสนล้าน = ค่าต่าง (ต้องคงไว้ — 5.1e11 ไม่เหลือเลขนัยสำคัญที่หลัก 1e12)');
    ok(MG.visibleCronDiff(cap('0.89 ล้านล้าน'), cap('8.94 แสนล้าน'), {}).bad === null, 'fix2: ฿0.89 ล้านล้าน vs ฿8.94 แสนล้าน = รูป (ADVANC · 8.94 ปัด 2 หลัก = 8.9)');
    ok(MG.visibleCronDiff('<p>cap $0.99 B</p>', '<p>cap $986 M</p>', {}).bad === null, 'fix2: $0.99 B vs $986 M = รูป (PRCT ×0.85)');
    ok(MG.visibleCronDiff('<p>cap $1.00 B</p>', '<p>cap $998 M</p>', {}).bad === null, 'fix2: $1.00 B vs $998 M = รูป (PRCT ×0.86 — ปัดข้ามหลักสิบ 0.998 → 1.00)');
    ok(MG.visibleCronDiff('<p>cap $2 B</p>', '<p>cap $1,450 M</p>', {}).bad !== null && MG.visibleCronDiff(cap('1 ล้านล้าน'), cap('8.4 แสนล้าน'), {}).bad !== null,
      'fix2: ต่างจริงที่เลขนัยสำคัญ 1 หลัก ($2 B vs $1,450 M · ฿1 ล้านล้าน vs ฿8.4 แสนล้าน) = ค่าต่าง');
    ok(MG.visibleCronDiff(cap('0.89 ล้านล้าน'), cap('8.84 แสนล้าน'), {}).bad !== null, 'fix2: ฿0.89 ล้านล้าน vs ฿8.84 แสนล้าน (ปัดได้ 8.8 ≠ 8.9) = ค่าต่าง');
    ok(MG.visibleCronDiff(cap('0.91 ล้านล้าน'), cap('9.15 แสนล้าน'), {}).bad === null, 'fix2: ฿0.91 ล้านล้าน vs ฿9.15 แสนล้าน = รูป (ADVANC ×0.87 — 9.15 ปัดมาแล้ว ค่าจริง 9.145–9.155 ปัดได้ 9.1)');
    ok(MG.visibleCronDiff(cap('0.91 ล้านล้าน'), cap('9.16 แสนล้าน'), {}).bad !== null, 'fix2: ฿0.91 ล้านล้าน vs ฿9.16 แสนล้าน = ค่าต่าง (ค่าจริง ≥9.155 ปัดได้ 9.2)');
    ok(MG.visibleCronDiff('<p>cap $0.999T</p>', '<p>cap $999B</p>', {}).bad === null && MG.visibleCronDiff('<p>cap $1.00T</p>', '<p>cap $999B</p>', {}).bad === null
      && MG.visibleCronDiff('<p>cap $1.2T</p>', '<p>cap $999B</p>', {}).bad !== null, 'fix2: หน่วย T/B ของ USD ใช้กติกาเดียวกัน ($1.00T ~ $999B · $1.2T ≠ $999B)');
    // ปีคนละศักราช (เคสคลัง APH: .disc v1 พ.ศ. · v2 ตามศักราชหัวรายงาน) = รูป · ปีต่างจริง = ตก
    ok(MG.visibleCronDiff('<p>ราคา ณ 2 ต.ค. 2569</p>', '<p>ราคา ณ 2 ต.ค. 2026</p>', {}).bad === null, '14a: 2569 ↔ 2026 (วันเดียวกันคนละศักราช) = รูป');
    ok(MG.visibleCronDiff('<p>ราคา ณ 2 ต.ค. 2569</p>', '<p>ราคา ณ 2 ต.ค. 2025</p>', {}).bad !== null, '14a: 2569 ↔ 2025 = ตก');
    ok(MG.visibleCronDiff('<p>ข้อมูล ณ ตุลาคม 2569</p>', '<p>ข้อมูล ณ ตุลาคม 2026</p>', {}).bad === null, '14a R3: ชื่อเดือนเต็มติดหน้าปี = บริบทวันที่ (รูป)');
    ok(MG.visibleCronDiff('<p>กำไร 2569 ล้าน</p>', '<p>กำไร 2026 ล้าน</p>', {}).bad !== null, '14a R3: "2569 ล้าน" vs "2026 ล้าน" (ไม่มีชื่อเดือนติดหน้า) = ไม่ใช่รูป');
    ok(MG.visibleCronDiff('<p>เป้า $2569</p>', '<p>เป้า $2026</p>', {}).bad !== null, '14a R3: "$2569" vs "$2026" = ไม่ใช่รูป');
    ok(u.relax.scale === 1 && MG.visibleCronDiff('<p>ราคา ณ 2 ต.ค. 2569</p>', '<p>ราคา ณ 2 ต.ค. 2026</p>', {}).relax.era === 1, '14a: ข้อยกเว้นหน่วย/ศักราชถูกนับใน relax (census เปิดเผย)');
    // static = ผลต่างที่มีก่อน patch ≤ GAP_REL (เคสคลัง CHAYO/IIG/LPH: การ์ด MOS30 ฿1.02 vs ฿1.01) — เกินเพดานไม่นับเป็น static
    const card = (t) => `<p>จุดซื้อ MOS 30% ฿${t}</p>`;
    const st = MG.visibleCronDiff(card('1.02'), card('1.01'), {}, { collect: true }).statics;
    const hit = MG.visibleCronDiff(card('1.02'), card('1.01'), {}, { statics: st });
    ok(st.size === 1 && hit.bad === null && hit.relax.static === 1, '14a: คู่ที่ต่างอยู่แล้วก่อน patch (≤ GAP_REL) = ข้าม + นับ relax.static', JSON.stringify([...st]));
    ok(MG.visibleCronDiff(card('1.02'), card('1.01'), {}).bad !== null, '14a: คู่เดียวกันโดยไม่มี statics = ตก (ข้อยกเว้นมาจาก statics จริง)');
    const big = MG.visibleCronDiff(card('1.02'), card('1.10'), {}, { collect: true }).statics;
    ok(big.size === 0 && MG.visibleCronDiff(card('1.02'), card('1.10'), {}, { statics: big }).bad !== null, '14a: ผลต่างก่อน patch เกิน GAP_REL ไม่เป็น static (ตก)');
  }
  // ── วงเล็บทวนวันที่ล้วนที่ migrator ลบ (เคสคลัง AZN) — ตัดได้เฉพาะวันเดียวกับวันที่ราคา · ค้างวันเก่า = ตก ──
  {
    const hd = (paren) => `<header><div class="px-meta">ราคา ณ 2 ต.ค. 2569${paren}<br>กรอบ 52 สัปดาห์</div></header>`;
    const rs = MG.visibleCronDiff(hd(' (2 ต.ค. 2026)'), hd(''), {});
    ok(rs.bad === null && rs.relax.restate === 1, '14a: วงเล็บทวนวันเดียวกัน (ต่างศักราช) ฝั่ง v1 เท่านั้น = ตัดก่อนเทียบ (ผ่าน · นับ relax.restate)');
    ok(MG.visibleCronDiff(hd(' (11 ก.ย. 2026)'), hd(''), {}).bad !== null, '14a: วงเล็บทวนที่ค้างวันเก่า = ไม่ตัด (ตก)');
    ok(MG.visibleCronDiff(hd(' (2 ต.ค. 2569 ตลาดปิด)'), hd(''), {}).bad !== null, '14a: วงเล็บที่มีคำขยาย = ไม่ตัด (ตก)');
  }
  // ── gate ของ cronDiff = UP.gateCheck ตัวเดียวกับ gateAfterPatch (fix1 R7 — ไม่มีสำเนา · เทสนี้คงไว้เป็นกระจกเพิ่ม) ──
  {
    const vals = RM.readReportData(FX.AAPL_V2()).data.values;
    const p = { newPrice: Math.round(vals.px * 0.9 * 100) / 100, dateParts: MG.cronDateParts(vals.priceDate), chartData: null };
    const clean = UP.patchReport(FX.AAPL_V2(), p).html;
    const broken = clean.replace(/("fairValue":)\s*([\d.]+)/, (m, k, v) => k + (parseFloat(v) * 1.3).toFixed(2));
    ok(broken !== clean, '14a: mutation fairValue ×1.3 บนผล patch ไม่เป็น no-op');
    for (const [label, h] of [['clean', clean], ['broken', broken]]) {
      const g = UP.gateAfterPatch(h, 'AAPL.html'), c = MG.cronGate(h, 'AAPL.html');
      ok(JSON.stringify(g.codes.slice().sort()) === JSON.stringify(c.codes), `14a: cronGate.codes = gateAfterPatch.codes (${label})`, `${g.codes} vs ${c.codes}`);
    }
    ok(UP.gateAfterPatch(broken, 'AAPL.html').codes.length > 0, '14a: เคส broken มี error จริง (การเทียบข้างบนไม่ vacuous)');
  }
  // ── v2 ที่ stock-meta.pe ถูกย้ายไปฐาน px/values.eps (บั๊ก F1 ของส่วน D) → meta:pe ──
  let peBad = null;
  {
    const v2 = FX.DDOG_V2(), vals = RM.readReportData(v2).data.values, sm = RM.readStockMeta(v2);
    const gaapPe = Math.round(vals.px / vals.eps * 10) / 10;
    peBad = v2.replace(new RegExp('("pe":)' + String(sm.pe).replace('.', '\\.') + '(?=[,}])'), '$1' + gaapPe);
    ok(peBad !== v2 && RM.readStockMeta(peBad).pe === gaapPe, '14a: mutation stock-meta.pe → ฐาน px/eps ไม่เป็น no-op', `${sm.pe} → ${gaapPe}`);
    const cd = MG.cronDiff(FX.DDOG(), peBad, 'DDOG.html', { grid: [0.9, 1.005] });
    ok(!cd.ok && cd.kinds.includes('meta:pe') && cd.k === 0.9, '14a: stock-meta.pe คนละฐานกับ v1 → kind meta:pe ที่ตัวคูณแรก', JSON.stringify({ kinds: cd.kinds, k: cd.k, detail: cd.detail }));
    ok(cd.detail.some((d) => /^×0\.9 ราคา [\d.]+: stock-meta\.pe v1 /.test(d)), '14a: detail บอกตัวคูณ + ราคา + ค่าสองฝั่ง', cd.detail.join(' | '));
  }
  // ── v2 ที่ค่าหมวด 6 ถูกแก้ (เป้า bull ×1.1 ใน values) → visible ──
  {
    const v2 = FX.BBL_V2(), sc = RM.readReportData(v2).data.values.scenarios;
    const tgt = sc[2].tgt, nt = Math.round(tgt * 1.1);
    const mut = v2.replace(new RegExp('("tgt":\\s*)' + tgt + '(\\s*,\\s*"div":\\s*' + sc[2].div + ')'), '$1' + nt + '$2');
    ok(mut !== v2 && RM.readReportData(mut).data.values.scenarios[2].tgt === nt, '14a: mutation เป้า bull ใน values ไม่เป็น no-op', `${tgt} → ${nt}`);
    const cd = MG.cronDiff(FX.BBL(), mut, 'BBL.html', { grid: [1.0] });
    ok(!cd.ok && cd.kinds.includes('visible'), '14a: ค่าหมวด 6 ของ v2 ต่างจาก v1 → kind visible', JSON.stringify({ kinds: cd.kinds, detail: cd.detail }));
  }
  // ── v2 ที่วันที่ literal ค้าง (วงเล็บทวนวันที่ของ DPZ ชี้วันอื่น) → ตก ──
  {
    const v2 = FX.DPZ_V2();
    const m = /\{\{rd:priceDate\}\} \((\d{1,2}) ([ก-๙.]+) (\d{4}) ตลาดปิด\)/.exec(v2);
    ok(!!m, '14a: DPZ-v2 มีวงเล็บทวนวันที่ literal ให้แก้');
    const stale = m ? v2.replace(m[0], `{{rd:priceDate}} (3 ส.ค. ${m[3]} ตลาดปิด)`) : v2;
    ok(stale !== v2, '14a: mutation วันที่ literal ค้างไม่เป็น no-op');
    const cd = MG.cronDiff(FX.DPZ(), stale, 'DPZ.html', { grid: [1.0] });
    ok(!cd.ok && cd.kinds.length > 0, '14a: วันที่ literal ค้างใน v2 → cron-diff ตก', JSON.stringify({ kinds: cd.kinds, detail: cd.detail }));
  }
  // ── การตัดสินเขียนไฟล์ (planWrite — ใช้ทั้ง dry-run และ --write) ──
  {
    const r = migrateOne(FX.DDOG(), 'DDOG.html', { today: FX.TODAY_OF.DDOG });
    ok(r.ok, '14a: DDOG migrate ผ่าน (ฐานของเคส planWrite)', r.reason);
    const bad = MG.cronDiff(FX.DDOG(), peBad, 'DDOG.html', { grid: [0.9] });
    const refused = MG.planWrite('DDOG', Object.assign({}, r, { out: peBad }), bad);
    ok(refused.write === false && refused.out === null && refused.entry.ok === false, '14a: cron-diff ตก → ไม่เขียน (write:false · out:null · entry.ok:false)');
    ok(/^cron-diff .*meta:pe/.test(refused.entry.reason || '') && refused.entry.cronDiff && refused.entry.cronDiff.ok === false, '14a: residue reason = "cron-diff <kinds>" + บันทึก cronDiff ลง entry', refused.entry.reason);
    const good = MG.cronDiff(FX.DDOG(), r.out, 'DDOG.html', { grid: [0.85, 1.0] });
    const accepted = MG.planWrite('DDOG', r, good);
    ok(good.ok && accepted.write === true && accepted.out === r.out && accepted.entry.ok === true, '14a: cron-diff ผ่าน → เขียนผล migrate ตามเดิม', JSON.stringify(good.kinds));
    ok(accepted.entry.cronDiff && Array.isArray(accepted.entry.cronDiff.formOnly) && accepted.entry.cronDiff.formOnly.length > 0, '14a: ผ่านแต่ต่างแค่รูป → ยังเขียน + formOnly ลง entry');
    const plain = MG.planWrite('DDOG', r, null);
    ok(plain.write === true && plain.entry.cronDiff === undefined && plain.entry.reason === null, '14a: ไม่สั่ง --cron-diff = พฤติกรรมเดิม (ไม่มีคีย์ cronDiff)');
    const failedMig = MG.planWrite('X', { ok: false, reason: 'gate ตกก่อนย้าย: E01', sites: { tokenised: [], literal: [] }, notes: [] }, null);
    ok(failedMig.write === false && failedMig.entry.reason === 'gate ตกก่อนย้าย: E01', '14a: migrate ไม่ผ่าน = ไม่เขียน เหตุผลเดิม');

    // ── census: ส่วน cronDiff + แถว "รูปทศนิยมหมวด 6" · รีรันแบตช์เดิมไม่นับซ้ำ ──
    const { mergeCensus, renderCensusMd: renderMd } = MG;
    const ftv = MG.cronDiff(FX.FTV(), FX.FTV_V2(), 'FTV.html', { grid: [0.85] });
    const rFtv = migrateOne(FX.FTV(), 'FTV.html', { today: FX.TODAY_OF.FTV });
    const batch = [refused.entry, MG.planWrite('FTV', rFtv, ftv).entry];
    const c1 = mergeCensus(null, 3, batch, '2026-09-14T00:00:00.000Z');
    const c2 = mergeCensus(c1, 3, batch, '2026-09-14T00:10:00.000Z');
    ok(c2.cronDiff && c2.cronDiff.checked === 2 && c2.cronDiff.fail.length === 1 && JSON.stringify(c2.cronDiff.failByKind['meta:pe']) === '["DDOG"]', '14a: census JSON มี cronDiff.failByKind + รีรันแบตช์เดิมไม่นับซ้ำ', JSON.stringify(c2.cronDiff));
    ok(c2.cronDiff.sec6Form.length === 1 && c2.cronDiff.sec6Form[0].sym === 'FTV', '14a: census JSON แยกรายชื่อรูปทศนิยมหมวด 6', JSON.stringify(c2.cronDiff.sec6Form));
    const md = renderMd(Object.values(c2.bySym));
    ok(/\| รูปทศนิยมหมวด 6 เปลี่ยน \(เช่น 3\.5→3\) \| 1 \| FTV /.test(md), '14a: census.md มีแถวแยก "รูปทศนิยมหมวด 6 เปลี่ยน (เช่น 3.5→3)" พร้อมรายชื่อ', md.split('\n').find((l) => /รูปทศนิยม/.test(l)));
    ok(/\| meta:pe \| 1 \| DDOG \|/.test(md) && /\| cron-diff meta:pe \| 1 \| DDOG \|/.test(md), '14a: census.md แสดงใบที่ตกตามชนิด + แถว residue ใช้เหตุผลเต็ม (ไม่ยุบ)', md.split('\n').filter((l) => /meta/.test(l)).join(' / '));
    ok(!/cron differential/.test(renderMd([{ sym: 'A', ok: true, reason: null, tokenised: [], literal: [], notes: [], pyChanges: [] }])), '14a: ไม่ได้รัน --cron-diff = census.md ไม่มีส่วน cron differential');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Task 14a fix round 1 (task-14a-fix1.md R1–R10) — ทุกเคสต้องตกเมื่อการเทียบชนิดนั้นถูกปิด (mutant runs ใน task-14a-report.md)
  // ════════════════════════════════════════════════════════════════════════════
  const BBL1 = FX.BBL(), BBL2 = FX.BBL_V2();
  const kindsOf = (cd) => JSON.stringify({ kinds: cd.kinds, k: cd.k, detail: cd.detail });
  // ── R2 · gate-warn (ชนิดของ PTG/THCOM): stock-meta.roe ของ v2 ×3 → warning W10 ฝั่ง v2 เท่านั้น ──
  {
    const roe = RM.readStockMeta(BBL2).roe;
    const mut = BBL2.replace(new RegExp('("roe":)' + String(roe).replace('.', '\\.') + '(?=[,}])'), '$1' + (roe * 3).toFixed(1));
    ok(mut !== BBL2, 'R2: mutation stock-meta.roe ×3 ไม่เป็น no-op');
    const cd = MG.cronDiff(BBL1, mut, 'BBL.html', { grid: [1] });
    ok(!cd.ok && cd.kinds.includes('gate-warn:W10') && /v2 W10/.test(cd.detail.join(' ')), 'R2: warning ต่างฝั่งเดียว → kind gate-warn:W10 + detail บอกฝั่ง', kindsOf(cd));
  }
  // ── R2 · gate-error (ชนิดของ W17/W19 ใน negative control): values.dps ของ v2 ×1.05 → W19 ฝั่ง v2 ──
  {
    const dps = RM.readReportData(BBL2).data.values.dps;
    const mut = BBL2.replace(new RegExp('("dps":\\s*)' + dps + '(?=[,\\s}])'), '$1' + (dps * 1.05).toFixed(2));
    ok(mut !== BBL2, 'R2: mutation values.dps ×1.05 ไม่เป็น no-op');
    const cd = MG.cronDiff(BBL1, mut, 'BBL.html', { grid: [0.85] });
    ok(!cd.ok && cd.kinds.includes('gate-error') && /W19/.test(cd.detail.join(' ')), 'R2: error ต่างฝั่งเดียว → kind gate-error (W19)', kindsOf(cd));
  }
  // ── R2 · meta:dividendYield (ชนิดของ BNY): stock-meta.dividendYield ของ v2 ×2 (หลุดย่านที่ patchDerived ตัดสิน — ไม่ถูกเขียนทับ) ──
  {
    const y = RM.readStockMeta(BBL2).dividendYield;
    const mut = BBL2.replace(new RegExp('("dividendYield":)' + String(y).replace('.', '\\.') + '(?=[,}])'), '$1' + (y * 2).toFixed(1));
    ok(mut !== BBL2, 'R2: mutation stock-meta.dividendYield ×2 ไม่เป็น no-op');
    const cd = MG.cronDiff(BBL1, mut, 'BBL.html', { grid: [1] });
    ok(!cd.ok && cd.kinds.includes('meta:dividendYield'), 'R2: stock-meta.dividendYield ต่าง → kind meta:dividendYield', kindsOf(cd));
  }
  // ── R2 · ข้อความเปลี่ยน (คำ ไม่ใช่ตัวเลข) → visible ──
  {
    const mut = BBL2.replace('สถานการณ์', 'สถานการณ์ใหม่');
    ok(mut !== BBL2, 'R2: mutation คำในหมวด 6 ไม่เป็น no-op');
    const cd = MG.cronDiff(BBL1, mut, 'BBL.html', { grid: [1] });
    ok(!cd.ok && cd.kinds.includes('visible') && /ข้อความ \(/.test(cd.detail.join(' ')), 'R2: คำที่มองเห็นเปลี่ยน → kind visible (มาสก์)', kindsOf(cd));
  }
  // ── R2 · จำนวนตัวเลขในช่อง .ret เปลี่ยน (v2 perYear → null: ไม่ render %/ปี) → visible ──
  {
    const mut = BBL2.replace(/("perYear":\s*)"cagr"/, '$1null');
    ok(mut !== BBL2, 'R2: mutation scnBasis.perYear → null ไม่เป็น no-op');
    const cd = MG.cronDiff(BBL1, mut, 'BBL.html', { grid: [1] });
    ok(!cd.ok && cd.kinds.includes('visible') && /จำนวนตัวเลข %/.test(cd.detail.join(' ')), 'R2: จำนวน % ในช่อง .ret ต่าง → kind visible', kindsOf(cd));
  }
  // ── R2 · " • รวมปันผล" งอกในฝั่ง v2 → visible (checkStripped) ──
  {
    const mut = BBL2.replace('สถานการณ์', 'สถานการณ์ • รวมปันผล');
    const cd = MG.cronDiff(BBL1, mut, 'BBL.html', { grid: [1] });
    ok(!cd.ok && cd.kinds.includes('visible') && /งอก/.test(cd.detail.join(' ')), 'R2: " • รวมปันผล" งอกใน v2 → kind visible (checkStripped)', kindsOf(cd));
  }
  // ── R2 + R1 · statics ต่อสายจริงใน cronDiff: การ์ด MOS30 ของ **v1** ห่าง 1 tick → ผ่าน + เปิดเผย valueDiff · ห่าง 2% → ตก ──
  {
    const MOS30 = /(จุดซื้อ MOS 30%<\/div>\s*<div class="v[^"]*">\s*฿?)([\d.,]+)/;
    const orig = MOS30.exec(BBL1);
    ok(!!orig, 'R2: BBL v1 มีการ์ด MOS30 ให้แก้');
    const fv = RM.readReportData(BBL2).data.fv, want = Math.round(fv * 0.7 * 100) / 100;
    const near = (want - 0.1).toFixed(1), far = (want * 0.98).toFixed(1);
    const cdNear = MG.cronDiff(BBL1.replace(MOS30, '$1' + near), BBL2, 'BBL.html', { grid: [1, 0.9] });
    ok(cdNear.ok && cdNear.relax.static > 0, 'R2: ค่าต่างก่อน patch ≤ GAP_REL ที่ cron ไม่แตะ = ข้าม (statics ต่อสายใน cronDiff)', kindsOf(cdNear));
    const vd = cdNear.valueDiff.find((x) => x.v1 === near);
    ok(!!vd && /MOS 30%/.test(vd.label) && vd.v2 === want.toFixed(2) && vd.relPct > 0 && vd.relPct <= 1.2, 'R1: valueDiff เปิดเผยป้าย + v1→v2 + % สัมพัทธ์', JSON.stringify(cdNear.valueDiff));
    const cdFar = MG.cronDiff(BBL1.replace(MOS30, '$1' + far), BBL2, 'BBL.html', { grid: [1] });
    ok(!cdFar.ok && cdFar.kinds.includes('visible'), 'R2: ค่าต่างก่อน patch 2% (เกิน GAP_REL) = ตก', kindsOf(cdFar));
  }
  // ── R2 · ความกว้างของ tolerance ถูกตรึง (budget ของ static · part · sameMetaForm) ──
  {
    const two = (a, b) => `<p>MOS30 ฿${a}</p><p>MOS20 ฿${b}</p>`;
    const st = MG.visibleCronDiff('<p>MOS30 ฿1.02</p><p>MOS20 ฿9.00</p>', '<p>MOS30 ฿1.01</p><p>MOS20 ฿9.00</p>', {}, { collect: true }).statics;
    ok(MG.visibleCronDiff(two('1.02', '1.02'), two('1.01', '1.01'), {}, { statics: st }).bad !== null, 'R2: static ข้ามได้ไม่เกินจำนวนที่มีก่อน patch (คู่ซ้ำตัวที่สอง = ตก)');
    ok(!MG.sameMetaForm(75, 75.9) && MG.sameMetaForm(75, 75.5), 'R2: sameMetaForm กว้างครึ่งหน่วย (75 ~ 75.5 · 75 ≠ 75.9)');
    // จำนวนช่อง .ret ต่างกัน — ช่องถูก blank ก่อนมาสก์ ⇒ มาสก์มองไม่เห็น ต้องมีตัวนับของมันเอง
    ok(MG.visibleCronDiff('<div class="ret pos">+2%</div>', '<div class="ret pos">+2%</div><div class="ret pos">+3%</div>', {}).bad !== null, 'R2: v2 มีช่อง .ret งอก (มาสก์มองไม่เห็น) = ตก');
  }
  // ── R5 · สองฝั่ง throw ทุกจุด = throw-both (ไม่ใช่ ok) ──
  {
    const noSm = (h) => h.replace(RM.STOCK_META_PARTS_RE, '');
    const cd = MG.cronDiff(noSm(BBL1), noSm(BBL2), 'BBL.html', { grid: [0.9, 1] });
    ok(!cd.ok && JSON.stringify(cd.kinds) === '["throw-both"]' && cd.compared === 0, 'R5: ไม่มีจุดที่เทียบได้ → kind throw-both', kindsOf(cd));
  }
  // ── R6 · ฝั่งของความล้มเหลว (กติกา: เทียบจุดที่ตกกับจุดผ่านข้างเคียง — ฝั่งที่เปลี่ยนชั้น/ฐานเพียงฝั่งเดียว) ──
  {
    const G = (warns, codes) => ({ warns: warns || [], codes: codes || [], exp: null });
    const P = { k: 0.855, s1: { dividendYield: 1.2 }, s2: { dividendYield: 1.2 }, g1: G(), g2: G() };
    ok(MG.failSide(null, P, ['visible'], null).side === 'unknown', 'R6: ตกที่จุดแรกของ grid = unknown');
    ok(MG.failSide(P, { k: 0.86, s1: {}, s2: {}, g1: G(['W22']), g2: G() }, ['gate-warn:W22']).side === 'v1', 'R6: warning งอกฝั่ง v1 เท่านั้น → v1 (รูป PTG/THCOM)');
    ok(MG.failSide(P, { k: 0.86, s1: {}, s2: {}, g1: G(), g2: G([], ['W17']) }, ['gate-error']).side === 'v2', 'R6: error งอกฝั่ง v2 เท่านั้น → v2 (รูป FTV/CASY ก่อน fix wave)');
    ok(MG.failSide(P, { k: 1.095, s1: { dividendYield: 1.4 }, s2: { dividendYield: 1.2 }, g1: G(), g2: G() }, ['meta:dividendYield']).side === 'v1', 'R6: v1 กระโดด 1.2→1.4 ขณะ v2 นิ่ง → v1 (รูป BNY)');
    ok(MG.failSide(P, { k: 1.095, s1: { dividendYield: 1.1 }, s2: { dividendYield: 1.1 } , g1: G(), g2: G() }, ['meta:dividendYield']).side === 'unknown', 'R6: สองฝั่งขยับเท่ากัน → unknown');
    const ret = (t) => `<p><div class="ret neg">${t}</div></p>`;
    const at = { type: 'ret-val', j: 0, c: 0, q: 0, drop1: false, drop2: false, whole: false };
    const prevR = { k: 1.135, s1: {}, s2: {}, g1: { exp: ret('−28.8%') }, g2: { exp: ret('−29%') } };
    const curR = { k: 1.14, s1: {}, s2: {}, g1: { exp: ret('−30.1%') }, g2: { exp: ret('−29%') } };
    ok(MG.failSide(prevR, curR, ['visible'], at).side === 'v1', 'R6: ช่อง .ret v1 กระโดด −28.8→−30.1 ขณะ v2 −29→−29 → v1 (รูป WWD)');
    ok(MG.failSide(P, { k: 0.86, s1: { dividendYield: 1.4 }, s2: { dividendYield: 1.2 }, g1: G(['W22']), g2: G([], ['W19']) }, ['meta:dividendYield', 'gate-error']).side === 'unknown', 'R6: ชนิดให้ฝั่งขัดกัน → unknown');
    ok(MG.cronDiffReason({ kinds: ['gate-warn:W22'], side: 'v1' }) === 'cron-diff v1-unstable gate-warn:W22'
      && MG.cronDiffReason({ kinds: ['meta:dividendYield', 'visible'], side: 'v2' }) === 'cron-diff v2-diff meta:dividendYield,visible'
      && MG.cronDiffReason({ kinds: ['meta:pe'], side: 'unknown' }) === 'cron-diff meta:pe', 'R6: ข้อความ reason ตามฝั่ง (v1-unstable / v2-diff / ไม่ระบุ)');
    const md = MG.renderCensusMd([{ sym: 'PTG', ok: false, reason: 'cron-diff v1-unstable gate-warn:W22', tokenised: [], literal: [], notes: [], pyChanges: [],
      cronDiff: { ok: false, kinds: ['gate-warn:W22'], k: 0.86, side: 'v1', sideWhy: 'x', detail: ['d'], formOnly: [], formParts: [], valueDiff: [], relax: {} } }]);
    ok(/\| cron-diff v1-unstable gate-warn:W22 \| 1 \| PTG \|/.test(md) && /PTG — `cron-diff v1-unstable gate-warn:W22` · side v1/.test(md), 'R6: census.md แสดง reason เต็มทุกตัวอักษร + ฝั่ง');
    ok(md.includes('v1-unstable = ผลของ v1 เปลี่ยนชนิด/ฐานระหว่างจุด grid ติดกันขณะ v2 นิ่ง — ไม่ใช่คำตัดสินว่าฝั่งไหนถูก'), 'fix2: census.md มีบรรทัดความหมายของ v1-unstable');
  }
  // ── R7 · cronGate เรียก UP.gateCheck ตัวเดียวกับ gateAfterPatch (ไม่มีสำเนา) ──
  {
    const orig = UP.gateCheck;
    let calls = 0;
    UP.gateCheck = (...a) => { calls++; return orig(...a); };
    try { MG.cronGate(BBL2, 'BBL.html'); } finally { UP.gateCheck = orig; }
    ok(calls === 1, 'R7: cronGate ใช้ UP.gateCheck (เรียก 1 ครั้ง)', String(calls));
    const g = UP.gateAfterPatch(BBL2, 'BBL.html'), c = UP.gateCheck(BBL2, 'BBL.html');
    ok(JSON.stringify(g) === JSON.stringify({ ok: c.ok, codes: c.codes, detail: c.detail }), 'R7: gateAfterPatch = gateCheck ตัดเหลือ ok/codes/detail');
  }
  // ── R8 · exit code: residue ไม่ใช่ความล้มเหลว ──
  ok(MG.exitCode({ errors: 0, residue: 5, strict: false }) === 0 && MG.exitCode({ errors: 0, residue: 0, strict: true }) === 0, 'R8: residue อย่างเดียว = exit 0');
  ok(MG.exitCode({ errors: 0, residue: 5, strict: true }) === 1 && MG.exitCode({ errors: 1, residue: 0, strict: false }) === 1, 'R8: --strict + residue = 1 · ข้อผิดพลาดไม่คาดคิด = 1');
  // ── R9 · รันแบตช์ซ้ำหลัง --write: ใบที่กลายเป็น v2 คงแถวเดิม ไม่ซ้ำ ไม่หาย ──
  {
    const rF = migrateOne(FX.FTV(), 'FTV.html', { today: FX.TODAY_OF.FTV });
    const cdF = MG.cronDiff(FX.FTV(), rF.out, 'FTV.html', { grid: [0.85] });
    const e1 = MG.planWrite('FTV', rF, cdF).entry;
    const eBad = { sym: 'PTG', ok: false, reason: 'cron-diff v1-unstable gate-warn:W22', tokenised: [], literal: [], notes: [], pyChanges: [], cronDiff: { ok: false, kinds: ['gate-warn:W22'], side: 'v1', detail: [], formOnly: [], formParts: [], valueDiff: [], relax: {} } };
    const c1 = MG.mergeCensus(null, 2, [e1, eBad], '2026-09-14T00:00:00.000Z');
    const skipped = migrateOne(rF.out, 'FTV.html', { today: FX.TODAY_OF.FTV });           // จำลอง: เขียนแล้ว → รอบสองเจอไฟล์ v2
    ok(!skipped.ok && skipped.reason === MG.ALREADY_V2, 'R9: รอบสองบนไฟล์ที่เขียนแล้ว = "เป็น v2 แล้ว"', skipped.reason);
    const e2 = MG.planWrite('FTV', skipped, null).entry;
    const c2 = MG.mergeCensus(c1, 2, [e2, eBad], '2026-09-14T01:00:00.000Z');
    ok(JSON.stringify(c2.bySym.FTV) === JSON.stringify(c1.bySym.FTV) && Object.keys(c2.bySym).length === 2, 'R9: แถว FTV (cronDiff/รูป) คงเดิม ไม่ซ้ำ');
    ok(JSON.stringify(c2.cronDiff.sec6Form) === JSON.stringify(c1.cronDiff.sec6Form) && c2.cronDiff.checked === c1.cronDiff.checked, 'R9: สรุป cronDiff ไม่หายหลังรันซ้ำ');
    const c3 = MG.mergeCensus(c2, 3, [Object.assign({}, e2, { sym: 'NEWV2' })], '2026-09-14T02:00:00.000Z');
    ok(c3.bySym.NEWV2 && c3.bySym.NEWV2.reason === MG.ALREADY_V2, 'R9: ใบ v2 ที่ไม่เคยมีแถว = บันทึกตามปกติ');
  }
  // ── R10 · ตัวอย่างรูป ≤3 ต่อใบ · formParts ครบ ──
  {
    const cd = MG.cronDiff(FX.AAPL(), FX.AAPL_V2(), 'AAPL.html');
    ok(cd.ok && cd.formOnly.length <= 3 && cd.formParts.includes('ret') && cd.formParts.includes('page'), 'R10: formOnly ≤3 ตัวอย่าง · formParts ครบทุก part', JSON.stringify({ n: cd.formOnly.length, parts: cd.formParts }));
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Combined fix wave (Task 14) — A: ตัวจำแนก %/ปี · B: clause "รวมปันผล" · C: --write ต้องคู่ --cron-diff · D: "~" ที่เติมเอง
  // ══════════════════════════════════════════════════════════════════════════════
  // ── A · scnPyDiffs: รูป (form) vs ค่า (value) และ "ห้ามคืน null เมื่อช่องเดิมอ่านได้" ──
  //   แต่ละ ok() ด้านล่างผูกกับ "การกลายพันธุ์" ของตัวจำแนกหนึ่งอย่าง — ย้อนอันไหน อันนั้นต้องตก:
  //     (ก) นับทศนิยมจากตัวเลขที่ parse แล้ว (decOf(numOf(a))) แทนรูปที่โชว์  → A2/A3 ตก
  //     (ข) บังคับต้องมีเครื่องหมายนำหน้า ([+\-−] ไม่ optional)               → A4/A5 ตก (before = null)
  //     (ค) ปล่อย ~/≈ เข้าไปในกลุ่มตัวเลข (parseFloat → NaN)                  → A1/A4 ตก (before = null)
  //     (ง) ไม่ยอมช่องว่างรอบ "/" หรือไม่ trim                                 → A6 ตก
  {
    const { scnPyDiffs, pyCell } = require('../tools/migrate-v2.js');
    const mk = (a, b, c) => `<div class="ret neg">${a}</div><div class="ret pos">${b}</div><div class="ret pos">${c}</div>`;
    const one = (before, after) => scnPyDiffs(mk(before, 'x', 'y'), mk(after, 'x', 'y'))[0] || null;
    const a1 = one('รวม ~ -6.4% (~-2.2%/ปี)', '-6% (-2%/ปี)');
    ok(!!a1 && a1.kind === 'form' && a1.before === '-2.2%/ปี', 'A1: ~-2.2%/ปี → -2%/ปี = form (เครื่องหมาย+tilde+ทศนิยมต่างแค่รูป) · before ไม่ใช่ null', JSON.stringify(a1));
    const a2 = one('+1.9%/ปี', '+2.0%/ปี');
    ok(!!a2 && a2.kind === 'value', 'A2: +1.9 → +2.0 (ฝั่งใหม่โชว์ 1 ตำแหน่ง) = value — เคส FER/FICO/OR/PNW/PR9', JSON.stringify(a2));
    const a3 = one('-5.9%/ปี', '-6%/ปี');
    ok(!!a3 && a3.kind === 'form', 'A3: -5.9 → -6 (ฝั่งใหม่โชว์ 0 ตำแหน่ง) = form (ปัดตามรูปที่โชว์แล้วเท่ากัน)', JSON.stringify(a3));
    const a4 = one('+37.7% รวม / ~11.3%/ปี', '+38% (+11%/ปี)');
    ok(!!a4 && a4.before === '11.3%/ปี' && a4.kind === 'form', 'A4: ช่องเดิมไม่มีเครื่องหมาย ("~11.3%/ปี") ต้องอ่านออก ห้าม before = null — เคส PNW/AMATA', JSON.stringify(a4));
    const a5 = one('รวม ~ 13% (≈ 4%/ปี)', '+13% (+4%/ปี)');
    ok(!!a5 && a5.before === '4%/ปี' && a5.kind === 'form', 'A5: "≈ 4%/ปี" (ไม่มีเครื่องหมาย) อ่านออก — เคส ONTO', JSON.stringify(a5));
    const a6 = one('  +5.0 % / ปี  ', '+5%/ปี');
    ok(!!a6 && a6.kind === 'form', 'A6: ช่องว่างรอบ "/" และหัวท้ายไม่ทำให้อ่านไม่ออก', JSON.stringify(a6));
    ok(one('+5.0%/ปี', '+7.0%/ปี').kind === 'value', 'A7: ค่าต่างจริง (+5.0 → +7.0) ยังเป็น value');
    ok(scnPyDiffs(mk('+8.9%/ปี', 'x', 'y'), mk('≈ +8.9%/ปี', 'x', 'y')).length === 0, 'A8: ต่างแค่ ~/≈ นำหน้า = ไม่ใช่ผลต่าง %/ปี (คนละเรื่องกับหัวข้อ "~" ของสำมะโน)');
    ok(pyCell('ไม่มีตัวเลขต่อปี') === null && pyCell('+12% รวม') === null, 'A9: ช่องที่ไม่มีหน่วย %/ปี จริง ๆ = null (ไม่ประดิษฐ์ค่า)');
    const d1 = pyCell('~11.0%/ปี'), d0 = pyCell('+11%/ปี');
    ok(!!d1 && !!d0 && d1.dec === 1 && d0.dec === 0 && d1.num === 11, 'A9: dec มาจากรูปที่โชว์ ไม่ใช่จากค่าที่ parse ("11.0" = 1 ตำแหน่ง) · ~ ไม่ทำให้ parse พัง', JSON.stringify([d1, d0]));
  }
  // ── B · I1: clause "รวมปันผล" ต้องถูกกินทั้งก้อนเมื่อ divIncluded=false (token render ว่าง) ──
  //   ทั้งสาม fixture สังเคราะห์จากรูปที่พบจริงในคลัง: เลขเงินต่อท้าย (ARE/JBHT) · คำติดกันไม่เว้นวรรค (CME) · วงเล็บ (NTV)
  {
    const DV = require('../tools/derived-values.js');
    const noteOf = (h) => { const m = /<div class="hint">[\s\S]*?<\/div>/.exec(DV.scenarioBlock(h).sec); return m[0].replace(/\s+/g, ' '); };
    const cases = [[' $2.88/ปี', 'เลขเงินต่อท้าย (ARE/BMY/JBHT/KIM/CF)'], ['ปกติ', 'คำติดกันไม่เว้นวรรค (CME)'], [' (ประมาณ)', 'วงเล็บขยาย (NTV)']];
    for (const [tail, why] of cases) {
      const src = FX.CASY().replace('• รวมปันผล</div>', '• รวมปันผล' + tail + '</div>');   // CASY = divIncluded:false
      ok(src !== FX.CASY(), `B: mutation "${tail}" ไม่เป็น no-op (${why})`);
      const r = migrateOne(src, 'CASY.html', { today: FX.TODAY_OF.CASY });
      ok(r.ok, `B: ${why} → ยังย้ายได้`, r.reason);
      ok(r.ok && /\{\{rd:scnNote\}\}<\/div>/.test(r.out.replace(/\s+/g, ' ')), `B: ${why} → clause ทั้งก้อนกลายเป็น token เดียว (ไม่เหลือ literal ต่อท้าย)`,
        r.ok ? (r.out.replace(/\s+/g, ' ').match(/\{\{rd:scnNote\}\}[^<]*</) || [''])[0] : '');
      ok(r.ok && !noteOf(expandReport(r.out)).includes(tail.trim()), `B: ${why} → ข้อความท้าย clause ไม่ค้างอยู่บนหน้าที่ render`, r.ok ? noteOf(expandReport(r.out)) : '');
      ok(r.ok && !/รวมปันผล/.test(noteOf(expandReport(r.out))), `B: ${why} → ป้าย "รวมปันผล" หายตามนิยาม divIncluded=false`);
    }
    // divIncluded=true: ต้องกินแค่ป้าย — ข้อความต่อท้าย/clause ถัดไปคงเดิมทุกตัวอักษร (13 ใบในคลัง เช่น AMGN/SPI/TFM)
    for (const [tail, why] of [[' ~$10.08/ปี', 'เลขเงินต่อท้าย (AMGN)'], [' • อิง DE×P/DE ไม่ใช่ GAAP EPS', 'clause " • " ถัดไป (OWL/SPI/TFM)']]) {
      const src = FX.BBL().replace('• รวมปันผล</div>', '• รวมปันผล' + tail + '</div>');     // BBL = divIncluded:true
      ok(src !== FX.BBL(), `B: mutation divIncluded=true "${tail}" ไม่เป็น no-op`);
      const r = migrateOne(src, 'BBL.html', { today: FX.TODAY });
      ok(r.ok, `B: divIncluded=true + ${why} → ยังย้ายได้`, r.reason);
      // เทียบเฉพาะ clause "รวมปันผล" เป็นต้นไป (ส่วนหน้าของ hint มีราคา/EPS ที่ token render 2 ตำแหน่งเสมอ — คนละเรื่อง)
      const clauseOf = (h) => (noteOf(h).match(/ • รวมปันผล[\s\S]*$/) || [''])[0];
      ok(r.ok && clauseOf(expandReport(r.out)) === clauseOf(expandReport(src)) && clauseOf(expandReport(src)) !== '',
        `B: divIncluded=true + ${why} → clause ที่ render ออกมาเท่าเดิมทุกตัวอักษร (ไม่ถูกกินเพิ่ม)`,
        r.ok ? clauseOf(expandReport(r.out)) + ' ≠ ' + clauseOf(expandReport(src)) : '');
    }
    // ใบ divIncluded=true ที่ไม่มีข้อความต่อท้าย (fixture เดิม) ต้องได้ผลเท่า v2 ที่แช่แข็งไว้ทุก byte
    ok(migrateOne(FX.BBL(), 'BBL.html', { today: FX.TODAY }).out === FX.BBL_V2(), 'B: BBL (divIncluded=true ไม่มีข้อความต่อท้าย) = v2 ที่แช่แข็งไว้ทุก byte');
  }
  // ══════════════════════════════════════════════════════════════════════════════
  // round 2 (review I3) — ADV-1..ADV-7: ขอบเขตของการ "กิน" clause รวมปันผล
  // ★ รอบแรกกินได้ไม่จำกัด (อะไรก็ได้จนถึง `<` / " • ") ⇒ reviewer ลบประโยคทั้งประโยค ข้อความอ้างฐานบัญชี
  //   และ token ของ site อื่นได้โดยทุกชั้นเขียว · ตอนนี้กินได้เฉพาะ whitelist 3 รูป + ยามชนค่า/ชน token
  // ══════════════════════════════════════════════════════════════════════════════
  {
    const DV2 = require('../tools/derived-values.js');
    const HINTRE = /<div class="hint">[\s\S]*?<\/div>/;
    // ต้นฉบับที่ tokenise แล้ว scenarioBlock อ่านไม่ออก (ตัวเลขกลายเป็น token) ⇒ ถอยไปหากล่อง .hint ที่มี "จากจุดเข้า"
    const hintSrc = (h) => { const b = DV2.scenarioBlock(h); const m = HINTRE.exec(b ? b.sec : ''); return (m ? m[0] : ([...String(h).matchAll(/<div class="hint">[\s\S]*?<\/div>/g)].map((x) => x[0]).find((x) => /จากจุดเข้า/.test(x)) || '')).replace(/\s+/g, ' '); };
    const hintOut = (h) => hintSrc(expandReport(h));
    // CASY = divIncluded:false ("จากจุดเข้า $615.47 • EPS ฐาน ~$19.16 • รวมปันผล") · BBL = divIncluded:true
    const mk = (fx, tail) => fx().replace('• รวมปันผล</div>', '• รวมปันผล' + tail + '</div>');
    const runF = (tail) => { const s = mk(FX.CASY, tail); return { s, r: migrateOne(s, 'CASY.html', { today: FX.TODAY_OF.CASY }) }; };
    const runT = (tail) => { const s = mk(FX.BBL, tail); return { s, r: migrateOne(s, 'BBL.html', { today: FX.TODAY }) }; };

    // ADV-1 · divIncluded:false — กินเฉพาะเลขปันผล · clause " • " ถัดไปของผู้เขียนต้องรอด
    {
      const { s, r } = runF(' $2.88/ปี • อิง AFFO ไม่ใช่ EPS (ดูส่วนที่ 3)');
      ok(s !== FX.CASY() && r.ok, 'ADV-1: mutation ไม่เป็น no-op + ยังย้ายได้', r.reason);
      ok(r.ok && /\{\{rd:scnNote\}\} • อิง AFFO ไม่ใช่ EPS \(ดูส่วนที่ 3\)/.test(r.out.replace(/\s+/g, ' ')), 'ADV-1: กินแค่ " • รวมปันผล $2.88/ปี" · clause ถัดไปรอดทั้งประโยค', r.ok ? hintSrc(r.out) : '');
      ok(r.ok && hintOut(r.out).includes('อิง AFFO ไม่ใช่ EPS (ดูส่วนที่ 3)') && !hintOut(r.out).includes('2.88'), 'ADV-1: หน้าที่ render ยังมี clause ถัดไป และไม่มีเลขปันผลลอย', r.ok ? hintOut(r.out) : '');
    }
    // ADV-2 · divIncluded:true — ข้อความท้ายที่มี entity `&lt;` + bullet จริง ต้องคงทุกตัวอักษร (กินแค่ป้าย)
    {
      const { s, r } = runT(' ~฿1.20/ปี (payout &lt; 50%) • ฐาน FY2026E');
      ok(s !== FX.BBL() && r.ok, 'ADV-2: mutation ไม่เป็น no-op + ยังย้ายได้', r.reason);
      const clause = (h) => (hintOut(h).match(/ • รวมปันผล[\s\S]*$/) || [''])[0];
      ok(r.ok && clause(r.out) === clause(s) && clause(s) !== '', 'ADV-2: divIncluded=true → clause เดิมคงทุกตัวอักษร', r.ok ? clause(r.out) + ' ≠ ' + clause(s) : '');
    }
    // ADV-3 · divIncluded:true — ตัวคั่น `·` (U+00B7) ไม่ใช่ " • " ⇒ ถ้าไม่มี gate การกินจะไม่หยุด · gate ทำให้เป็น no-op
    {
      const { s, r } = runT(' · ฐาน FY2026E (ไม่รวมพิเศษ)');
      ok(s !== FX.BBL() && r.ok, 'ADV-3: mutation ไม่เป็น no-op + ยังย้ายได้', r.reason);
      ok(r.ok && hintOut(r.out) === hintOut(s).replace(/฿194\b/, '฿193.50').replace(/~฿22\b/, '~฿22.00'), 'ADV-3: ตัวคั่น · ไม่ทำให้ข้อความหาย (ต่างเฉพาะรูปเงินของ token)', r.ok ? hintOut(r.out) + ' vs ' + hintOut(s) : '');
    }
    // ADV-4 · divIncluded:false — ประโยคทั้งประโยค: ห้ามกิน ต้องถอยไป literal
    {
      const tail = ' และเป้าหมาย 3 ปีปรับเป็น $900 จาก $800 หลังงบ Q4';
      const { s, r } = runF(tail);
      ok(s !== FX.CASY() && r.ok, 'ADV-4: mutation ไม่เป็น no-op + ยังย้ายได้', r.reason);
      ok(r.ok && !/\{\{rd:scnNote\}\}/.test(r.out) && r.sites.literal.includes('scnNote'), 'ADV-4: ประโยคทั้งประโยค = ไม่กิน · scnNote คง literal', r.ok ? hintSrc(r.out) : '');
      ok(r.ok && hintOut(r.out).includes(tail.trim()), 'ADV-4: ข้อความของผู้เขียนยังอยู่บนหน้าที่ render ครบ', r.ok ? hintOut(r.out) : '');
      ok(r.ok && (r.notes || []).some((n) => /ไม่อยู่ในรูปที่รู้จัก/.test(n)), 'ADV-4: บันทึกเหตุผลที่ไม่กินลง census', (r.notes || []).join(' | '));
    }
    // ADV-7 · divIncluded:false — ข้อความอ้างฐานบัญชี: ห้ามกิน
    {
      const tail = ' — ตัวเลขทั้งหมดเป็น GAAP ไม่ใช่ adjusted';
      const { r } = runF(tail);
      ok(r.ok && !/\{\{rd:scnNote\}\}/.test(r.out) && r.sites.literal.includes('scnNote'), 'ADV-7: ข้อความอ้างฐานบัญชี = ไม่กิน · scnNote คง literal', r.ok ? hintSrc(r.out) : '');
      ok(r.ok && hintOut(r.out).includes('GAAP ไม่ใช่ adjusted'), 'ADV-7: ข้อความยังอยู่บนหน้าที่ render', r.ok ? hintOut(r.out) : '');
    }
    // ADV-5 · site ซ้ำในช่วง — ยามเดิม (site match ≠ 1) ยังเป็นคนจับ และทั้งหมวดถอยไป literal (ไม่มีอะไรหาย)
    {
      const { r } = runF(' • EPS ฐาน ~$19.16');
      ok(r.ok, 'ADV-5: ใบยังย้ายได้ (retry คงหมวด 6 literal)', r.reason);
      ok(r.ok && (r.notes || []).some((n) => /หมวด 6 คง literal.*hintEps match ≠ 1/.test(n)), 'ADV-5: จับด้วยยาม "site hintEps match ≠ 1 (2)" แล้วคงหมวด 6 literal', (r.notes || []).join(' | '));
      ok(r.ok && hintOut(r.out).includes('EPS ฐาน ~$19.16 • รวมปันผล • EPS ฐาน ~$19.16'), 'ADV-5: ไม่มีอะไรหายจากหน้าที่ render', r.ok ? hintOut(r.out) : '');
    }
    // ADV-6 · ค่าของ site อื่นอยู่ในช่วงที่จะกิน — ต้องถูกจับทั้งสองรูป
    {
      // (ก) รูปของ reviewer: `EPS ฐาน ~$19.16` (site เดียวของใบ) ไปอยู่ **หลัง** ป้าย ⇒ token ของมันอยู่ในช่วง
      const a = FX.CASY().replace('• EPS ฐาน ~$19.16 • รวมปันผล</div>', '• รวมปันผล EPS ฐาน ~$19.16</div>');
      ok(a !== FX.CASY(), 'ADV-6a: mutation ไม่เป็น no-op');
      const ra = migrateOne(a, 'CASY.html', { today: FX.TODAY_OF.CASY });
      ok(ra.ok && !/\{\{rd:scnNote\}\}/.test(ra.out) && ra.sites.literal.includes('scnNote'), 'ADV-6a: ไม่กิน · scnNote คง literal', ra.ok ? hintSrc(ra.out) : ra.reason);
      ok(ra.ok && hintOut(ra.out).includes('EPS ฐาน ~$19.16'), 'ADV-6a: ค่า EPS ฐานยังอยู่บนหน้าที่ render (ไม่ถูกลบทั้ง token)', ra.ok ? hintOut(ra.out) : '');
      ok(/token ของ site อื่น/.test(MG.tailHitsOtherSite(' EPS ฐาน ~{{rd:baseEps}}', { baseEps: 19.16 }) || ''), 'ADV-6a: ยาม "token ของ site อื่นอยู่ในช่วง" จับได้ตรง ๆ');
      // (ข) ท้าย clause เข้ารูปเงินของ whitelist พอดี แต่ตัวเลข = ค่าที่ token ของ site อื่น render (baseEps)
      const { r: rb } = runF(' ~$19.16');
      ok(rb.ok && !/\{\{rd:scnNote\}\}/.test(rb.out) && rb.sites.literal.includes('scnNote'), 'ADV-6b: whitelist เข้ารูป แต่ชนค่า baseEps → ไม่กิน', rb.ok ? hintSrc(rb.out) : rb.reason);
      ok(MG.noteTailOf('x • รวมปันผล ~$19.16<') === ' ~$19.16', 'ADV-6b: (ตั้งฉาก) whitelist เข้ารูปจริง — ยามที่จับคือยามชนค่า ไม่ใช่ whitelist');
      ok(/ตรงกับค่าที่ token ของ site อื่น/.test(MG.tailHitsOtherSite(' ~$19.16', { baseEps: 19.16 }) || ''), 'ADV-6b: ยามชนค่ายิงด้วยเหตุผลที่ถูกต้อง');
      ok(rb.ok && hintOut(rb.out).includes('~$19.16 • รวมปันผล ~$19.16'), 'ADV-6b: ไม่มีอะไรหายจากหน้าที่ render', rb.ok ? hintOut(rb.out) : '');
    }
    // ชุดยาม: whitelist ยอมเฉพาะ 3 รูป (+ ว่าง) และเพดานความยาว
    {
      const T = (tail) => MG.noteTailOf('x • รวมปันผล' + tail + '<');
      ok(T('') === '' && T(' $2.88/ปี') === ' $2.88/ปี' && T(' $2.52/yr') === ' $2.52/yr' && T(' ~$6') === ' ~$6'
        && T('ปกติ') === 'ปกติ' && T(' (ประมาณ)') === ' (ประมาณ)', 'I3: whitelist ยอม 3 รูปจริงของคลัง + รูปว่าง');
      ok(T(' และเป้าหมาย 3 ปีปรับเป็น $900 จาก $800') === null && T(' — ตัวเลขทั้งหมดเป็น GAAP ไม่ใช่ adjusted') === null
        && T(' ข้อความยาวมากที่ไม่ควรถูกกินเข้าไปในtokenเดียว') === null, 'I3: ประโยค/ข้อความยาว = ไม่เข้า whitelist (null)');
      ok(T(' (' + 'ก'.repeat(31) + ')') === null && T('ก'.repeat(17)) === null, 'I3: เพดานความยาวของรูปวงเล็บ/คำติดกันทำงาน');
      ok(MG.noteTailOf('x • รวมปันผล $2.88/ปี • ต่อไป') === ' $2.88/ปี', 'I3: หยุดที่ clause " • " ถัดไปเสมอ');
    }
  }
  // ── C · M1: --write ต้องมาคู่ --cron-diff เสมอ (ไม่มี flag ข้าม) ──
  {
    const log = console.log; const said = [];
    console.log = (...a) => said.push(a.join(' '));
    let rc; try { rc = MG.main(['AAPL', '--write']); } finally { console.log = log; }
    ok(rc === 1, 'C: --write เดี่ยว ๆ = exit 1', String(rc));
    ok(said.join(' ').includes('--cron-diff'), 'C: ข้อความบอกว่าต้องใช้ --cron-diff คู่กัน', said.join(' '));
    ok(said.length === 1, 'C: หยุดก่อนอ่าน/เขียนไฟล์ใด ๆ (ไม่มีบรรทัดผลต่อไฟล์)', String(said.length));
  }
  // ── D · M2: "~" ที่ migrator เติมหน้า token — ต้องบันทึกใน notes และโผล่ในสำมะโน ──
  {
    const r = migrateOne(FX.AAPL(), 'AAPL.html', { today: FX.TODAY });     // AAPL: "EPS ฐาน $8.26" ไม่มี ~ ในต้นฉบับ
    ok(r.ok && r.out.includes('~{{rd:baseEps}}'), 'D: AAPL ถูกแทนด้วย token ที่มี "~" นำหน้า', r.reason);
    ok(r.ok && (r.notes || []).includes('เติม ~ หน้า token: hintEps'), 'D: บันทึก note "เติม ~ หน้า token: hintEps"', (r.notes || []).join(' | '));
    const rb = migrateOne(FX.BBL(), 'BBL.html', { today: FX.TODAY });      // BBL: "EPS ฐาน ~฿22" มี ~ อยู่แล้ว
    ok(rb.ok && !(rb.notes || []).some((n) => n.startsWith('เติม ~ หน้า token: ')), 'D: ใบที่ต้นฉบับมี "~" อยู่แล้ว = ไม่บันทึก', (rb.notes || []).join(' | '));
    const md = MG.renderCensusMd([MG.planWrite('AAPL', r, null).entry, MG.planWrite('BBL', rb, null).entry]);
    ok(/## "~" ที่ migrator เติมหน้า token เอง/.test(md), 'D: สำมะโนมีหัวข้อเปิดเผย "~" ที่เติมเอง');
    ok(/\| hintEps \| 1 \| 1 \| AAPL \|/.test(md), 'D: แถวนับจุด/ใบ/รายชื่อถูกต้อง', md.split('\n').filter((l) => /hintEps/.test(l)).join(' / '));
    ok(!/## "~" ที่ migrator/.test(MG.renderCensusMd([MG.planWrite('BBL', rb, null).entry])), 'D: ไม่มีใบที่เติม ~ = ไม่มีหัวข้อนี้ (ไม่พูดถึงสิ่งที่ไม่เกิด)');
    // R4 (review M1): ช่อง "จุด" ต้องเป็นจำนวนครั้งจริง ไม่ใช่จำนวนใบ — ใบเดียวที่มี 2 จุดต้องอ่านได้ว่า 2 จุด / 1 ใบ
    const twice = { sym: 'TWO', ok: true, reason: null, tokenised: [], literal: [], pyChanges: [],
      notes: ['เติม ~ หน้า token: hintEps', 'เติม ~ หน้า token: hintEps'] };
    const md2 = MG.renderCensusMd([twice]);
    ok(/\| hintEps \| 2 \| 1 \| TWO \|/.test(md2), 'R4: 2 จุดในใบเดียว → "จุด 2 · ใบ 1" (เดิมพิมพ์ Set.size ทั้งสองช่อง)', md2.split('\n').filter((l) => /hintEps/.test(l)).join(' / '));
    ok(/\| \*\*รวม\*\* \| \*\*2\*\* \| \*\*1\*\* \| \|/.test(md2), 'R4: แถวรวมสอดคล้องกับแถวย่อย', md2.split('\n').filter((l) => /รวม/.test(l)).join(' / '));
  }
  // ── R2 · สำมะโนต้องมีหัวข้อ clause ที่ถูกตัด พร้อมข้อความจริงต่อใบ ──
  {
    const e = (sym, clause) => ({ sym, ok: true, reason: null, tokenised: [], literal: [], pyChanges: [],
      notes: [`ตัด clause "${clause}" 1 จุด — ตัวเลขฉากของใบนี้ไม่ได้รวมปันผล (scenarioPlan conv=plain)`] });
    const md = MG.renderCensusMd([e('JBHT', ' • รวมปันผล $5.40'), e('CME', ' • รวมปันผลปกติ'), e('NTV', ' • รวมปันผล (ประมาณ)'), e('KO', ' • รวมปันผล')]);
    ok(/## clause "รวมปันผล" ที่ถูกตัดออกจากหน้าจริง/.test(md), 'R2: สำมะโนมีหัวข้อ clause ที่ถูกตัด');
    ok(md.includes('| JBHT | scnNote | ` • รวมปันผล $5.40` | ` $5.40` |'), 'R2: แถวบอกข้อความที่หายจริง (JBHT $5.40)', md.split('\n').filter((l) => /JBHT/.test(l)).join(' / '));
    ok(md.includes('`ปกติ`') && md.includes('` (ประมาณ)`'), 'R2: ครบทั้งสามรูป (เลขเงิน · คำติดกัน · วงเล็บ)');
    ok(/### ใบที่ข้อความของผู้เขียนหายไปด้วย \(3 ใบ/.test(md) && /### ใบที่ตัดเฉพาะป้าย \(ไม่มีข้อความต่อท้าย — 1 ใบ\)/.test(md),
      'R2: แยก "ข้อความหายด้วย" (ต้องอ่านรายบรรทัด) ออกจาก "ป้ายอย่างเดียว"', md.split('\n').filter((l) => /^### ใบที่/.test(l)).join(' / '));
    ok(/รวม \*\*4\*\* จุด \/ \*\*4\*\* ใบ/.test(md), 'R2: แถวรวมนับถูก', md.split('\n').filter((l) => /จุด \//.test(l)).join(' / '));
    ok(!/## clause "รวมปันผล"/.test(MG.renderCensusMd([{ sym: 'X', ok: true, reason: null, tokenised: [], literal: [], notes: [], pyChanges: [] }])), 'R2: ไม่มีใบที่ถูกตัด = ไม่มีหัวข้อนี้');
  }
  // ── R5 · ยาม --write ต้องอยู่เหนือสาขา --fixture (คำสั่งที่ "เขียน" อะไรก็ต้องผ่านยามนี้) ──
  {
    const log = console.log; const said = [];
    console.log = (...a) => said.push(a.join(' '));
    let rc; try { rc = MG.main(['--fixture', '--write']); } finally { console.log = log; }
    ok(rc === 1 && said.length === 1 && said[0].includes('--cron-diff'), 'R5: --fixture --write ก็ต้องผ่านยามเดียวกัน (exit 1 · ไม่เขียนอะไรเลย)', `${rc} · ${said.join(' | ')}`);
  }
  // ── A(ต่อ) · บล็อกสรุปสุดท้ายต้องมาจาก renderCensusMd เอง (รัน --census ซ้ำได้บล็อกเดิม — ไม่ใช่สคริปต์ one-off) ──
  {
    const e = (sym, okv, reason) => ({ sym, ok: okv, reason: reason || null, tokenised: [], literal: okv ? ['psCard'] : [], notes: [], pyChanges: [], batch: 0 });
    const md = MG.renderCensusMd([e('AAPL', true), e('BBL', true), e('PTG', false, 'cron-diff v1-unstable gate-warn:W22'), e('MXL', false, 'site summary match ≠ 1 (0)')]);
    ok(/## สรุปสุดท้าย — Task 14/.test(md), 'A10: renderCensusMd สร้างบล็อกสรุปสุดท้ายเอง');
    ok(/\| ย้ายเป็น v2 \| \*\*2\/4\*\* \|/.test(md), 'A10: ยอดรวมคิดจาก entries', md.split('\n').find((l) => /ย้ายเป็น v2/.test(l)));
    ok(/\| residue \(คง v1\) \| \*\*2\*\* = migrator 1 \+ cron-diff 1 \|/.test(md), 'A10: แยก residue migrator vs cron-diff', md.split('\n').find((l) => /residue \(คง v1\)/.test(l)));
    ok(/\| psCard \| 2 \|/.test(md), 'A10: site literal นับเฉพาะใบที่ย้าย');
    ok(/\| MXL \| site summary match ≠ 1 \(0\) \|/.test(md), 'A10: ตารางเหตุผลเต็มรายใบ');
    ok(MG.renderCensusMd([e('AAPL', true)]) === MG.renderCensusMd([e('AAPL', true)]).replace(/$^/, ''), 'A10: render ซ้ำได้ผลเดิม (deterministic ยกเว้นบรรทัดเวลา)');
  }
}
}

module.exports = { run };

if (require.main === module) {
  let n = 0, fails = 0;
  const ok = (c, m, d) => { n++; if (c) return; fails++; console.error('✗ ' + m + (d ? ' — ' + d : '')); };
  run(ok);
  console.log(`migrate-v2-test: ${n - fails}/${n} ผ่าน`);
  process.exit(fails ? 1 : 0);
}
