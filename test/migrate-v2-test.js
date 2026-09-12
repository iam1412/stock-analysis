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

console.log(`migrate-v2-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
