'use strict';
/**
 * v2-path-test — เกณฑ์จบระยะ 2 ข้อ "ทาง v2 ไม่มีช่องสำเนาที่เขียนด้วย regex" ใน cron/gate วัดบนทาง v2:
 *   แทนตัวอ่าน/ตัวเขียน "สำเนา" ทุกตัว (V1_READ ของ gate · RM/DV regex ที่ cron ใช้เขียนช่องสำเนาใน HTML)
 *   ด้วยฟังก์ชัน/regex ที่ throw หรือไม่ match แล้ว gate + cron บน fixture v2 ต้องทำงานได้ครบ
 *   ⇒ พิสูจน์ว่าทาง v2 ไม่แตะตัวอ่าน/ตัวเขียนสำเนาเหล่านั้นเลย (ไม่ใช่ "regex ในรีโป = 0" — patchDerived/
 *   yieldPlan ยังทำงานจริงบน view ที่ render แล้วตามที่ตั้งใจไว้ในระยะ 2 ส่วน D — ดู ★★ ด้านล่าง)
 *
 * ★★ ruling 13 ก.ย. 2569 (Task 11/12 redesign — ชนะ Step 1 เดิมของบล็อก cron): ทาง v2 **ตั้งใจ** รัน
 *   pass derived (`patchDerived` ผ่าน `derivedPassV2`) บน view ที่ render แล้ว (การ์ด literal 869/869 ใบ
 *   ต้องการมัน) ⇒ ห้ามสตับ `DV.patchDerived` — บล็อก cron สตับเฉพาะตัวเขียน **ช่องสำเนา**: `RM.PX_PARTS_RE` ·
 *   `RM.MCUR_LABEL_PARTS_RE` · `RM.VERDICT_CLASS_RE` · `DV.MOS_BIG_RE` = `NEVER` แล้ว assert `!err && r.changed`
 *   **และ** `UP.gateAfterPatch(r.html, 'AAPL.html').ok`
 */
let n = 0, fails = 0;
const ok = (c, m, d) => { n++; if (c) return; fails++; console.error('✗ ' + m + (d ? ' — ' + d : '')); };
// ★ ไม่ require('./report-values-test.js') ที่นี่ — มันเป็นขั้นของตัวเองใน verify อยู่แล้ว (Part B/Task 5)
//   require ซ้ำจะรันเคสเดิมสองรอบใน verify เดียว (เปลืองเวลาเฉย ๆ ไม่ใช่บั๊กที่ทำให้ตก แต่ผิดเจตนา "1 เทส 1 ขั้น")
require('./migrate-v2-test.js').run(ok);
const FX = require('./fixtures');
const CR = require('./check-reports.js');
const RM = require('../tools/report-meta.js');
const DV = require('../tools/derived-values.js');
const UP = require('../tools/update-prices.js');
const { expandReport } = require('../build.js');
const boom = (name) => () => { throw new Error('ทาง v2 ห้ามเรียกตัวอ่านสำเนา: ' + name); };
const NEVER = /(?!)/;

// ── gate ──
{
  const saved = { ...CR.V1_READ };
  // ★ scaleNums เป็นข้อยกเว้นที่มีเอกสารกำกับไว้แล้วที่ test/check-reports.js:211 ("ทาง v2 ไม่เรียกตัวไหนในนี้
  //   ยกเว้น scaleNums ที่ยังอ่าน HTML ทั้งสองทาง") — ป้าย scale ของ gauge (E26) ไม่ใช่ "ช่องสำเนา" ที่ cron
  //   เขียนตามราคา เป็นตัวเลขโครงสร้างคงที่ที่อ่านจาก HTML เสมอไม่ว่า schema ไหน ⇒ ต้องไม่ถูก boom ที่นี่
  //   (ยืนยันแล้ว: boom ตัวนี้ด้วย ทำให้ gate ทาง v2 พัง — ตรงตามที่คอมเมนต์บอกไว้)
  for (const k of Object.keys(CR.V1_READ)) if (k !== 'scaleNums') CR.V1_READ[k] = boom('V1_READ.' + k);
  const rmSaved = { PX_RE: RM.PX_RE, MCUR_LABEL_RE: RM.MCUR_LABEL_RE, VERDICT_CLASS_RE: RM.VERDICT_CLASS_RE };
  RM.PX_RE = NEVER; RM.MCUR_LABEL_RE = NEVER; RM.VERDICT_CLASS_RE = NEVER;
  const dvSaved = { MOS_BIG_RE: DV.MOS_BIG_RE, SUMMARY_RE: DV.SUMMARY_RE };
  DV.MOS_BIG_RE = NEVER; DV.SUMMARY_RE = NEVER;
  let r, err = '';
  try { r = CR.checkHtml(expandReport(FX.BBL_V2()), 'BBL.html'); } catch (e) { err = e.message; }
  ok(!err, 'gate ทาง v2 ไม่เรียก V1_READ/regex สำเนา', err);
  ok(r && r.errors.length === 0, 'gate ทาง v2 error 0 โดยไม่มีตัวอ่านสำเนา', r && r.errors.map((e) => e.id + ' ' + e.msg).join(' | '));
  ok(r && r.ctx.px > 0 && r.ctx.fvBox > 0 && r.ctx.mosBig != null && r.ctx.pxInput > 0 && r.ctx.chg && r.ctx.priceAge, 'ctx สำเนาทุกตัวมีค่า (มาจาก JSON)');
  Object.assign(CR.V1_READ, saved); Object.assign(RM, rmSaved); Object.assign(DV, dvSaved);
  // sanity: บน v1 ตัว throw ต้องระเบิดจริง (ไม่งั้นเทสนี้พิสูจน์อะไรไม่ได้)
  CR.V1_READ.px = boom('px');
  let threw = false; try { CR.buildCtx(expandReport(FX.BBL()), 'BBL.html'); } catch (e) { threw = true; }
  ok(threw, 'sanity: v1 ยังเรียก V1_READ.px (ตัว throw ระเบิด)');
  CR.V1_READ.px = saved.px;
}

// ── cron ──
// ★★ ตาม ruling 13 ก.ย. 2569 ด้านบน: ห้ามสตับ DV.patchDerived (v2 ตั้งใจเรียกมันบน view ที่ render แล้ว)
//   สตับเฉพาะตัวเขียนช่องสำเนา RM.PX_PARTS_RE/MCUR_LABEL_PARTS_RE/VERDICT_CLASS_RE + DV.MOS_BIG_RE
{
  const src = FX.AAPL_V2();
  const rd = RM.readReportData(src).data;
  const rmSaved = { PX_PARTS_RE: RM.PX_PARTS_RE, MCUR_LABEL_PARTS_RE: RM.MCUR_LABEL_PARTS_RE, VERDICT_CLASS_RE: RM.VERDICT_CLASS_RE };
  RM.PX_PARTS_RE = NEVER; RM.MCUR_LABEL_PARTS_RE = NEVER; RM.VERDICT_CLASS_RE = NEVER;
  const dvSaved = { MOS_BIG_RE: DV.MOS_BIG_RE };
  DV.MOS_BIG_RE = NEVER;
  let r, err = '';
  try { r = UP.patchReport(src, { newPrice: rd.values.px * 1.05, dateParts: { day: 12, monIdx: 8, yearCE: 2026 }, chartData: null }); } catch (e) { err = e.message; }
  ok(!err && r && r.changed, 'cron ทาง v2 ไม่ใช้ regex เขียนช่องสำเนาใน HTML (.px/gauge label/verdict class/.big)', err);
  let gateOk = false, gateDetail = '';
  if (r) { const g = UP.gateAfterPatch(r.html, 'AAPL.html'); gateOk = g.ok; gateDetail = g.detail; }
  ok(gateOk, 'cron ทาง v2: ไฟล์ที่ patch แล้ว (ภายใต้ตัวเขียนสำเนาที่ throw) ยังผ่าน gate', gateDetail);
  // ★ ยืนยันว่าช่องสรุป "ส่วนต่างจากราคา" (patchDerived#11 — ไม่ได้ถูกสตับ) ยังเขียนถูกจริง แม้ตัวเขียน
  //   ช่องสำเนาอื่นถูกแทนด้วย throw ทั้งหมด: "MOS ~ ±X%" ต้องตรงกับตัวเลขของ .big ที่ v2 render ออกมา
  if (r) {
    const exp = expandReport(r.html);
    const big = DV.readMosBig(exp);
    const plan = DV.summaryPlan(exp);
    ok(!!big && !!plan && plan.ok, 'cron ทาง v2: ช่องสรุป "MOS ~ ±X%" ยังตรงกับ .big หลัง patchDerived (ไม่ถูกสตับ)',
      big && plan ? `.big=${big.sign}${big.num}% cell="${plan.text}" want="${plan.want}"` : 'อ่าน .big/ช่องสรุปไม่ได้');
  }
  Object.assign(RM, rmSaved); Object.assign(DV, dvSaved);
  // sanity: v1 ต้องระเบิด
  RM.PX_PARTS_RE = NEVER;
  let threw = false; try { UP.patchReport(FX.AAPL(), { newPrice: 100, dateParts: { day: 12, monIdx: 8, yearCE: 2026 }, chartData: null }); } catch (e) { threw = true; }
  ok(threw, 'sanity: v1 ยังใช้ PX_PARTS_RE (need() ระเบิด)');
  RM.PX_PARTS_RE = rmSaved.PX_PARTS_RE;
}

console.log(`v2-path-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
