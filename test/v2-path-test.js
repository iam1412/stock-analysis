'use strict';
/**
 * v2-path-test — เกณฑ์จบระยะ 2: บนทาง v2, **ค่าของช่องสำเนา** (ราคา/MOS/ป้ายเปลี่ยนแปลง/สกุลเงิน/อายุราคา ฯลฯ)
 * มาจาก JSON (report-data.values / stock-meta) เท่านั้น · cron ไม่เขียนช่องสำเนาใน HTML ด้วย regex เลย
 * (เขียนผ่าน token render แทน) · การอ่าน regex บน view ที่ render แล้วที่ยังเหลืออยู่ (W06/patchDerived#11
 * อ่าน `.big` กลับมาเทียบ, gauge-scale/verdict-class ที่ field-manifest/W04 ใช้) เป็น **consistency check ของ
 * ตัวเรนเดอร์เอง** เท่านั้น ไม่ใช่แหล่งความจริง — **ไม่ใช่การอ้างว่า "regex ในไฟล์นี้ = 0"**
 *
 * ★★ fix round 1 (task-12-fix1.md, แก้ตาม task-12-review.md ที่พบว่าฉบับแรกมีสตับ 3/8 ชื่อไม่มีผลจริง):
 *  R1: ลบสตับที่ผู้เรียกปิดคุม const ระดับโมดูลไว้ (closure) ออกจากบล็อก gate — `RM.PX_RE`/`DV.MOS_BIG_RE`/
 *      `DV.SUMMARY_RE` ไม่มีผลกับ `readHeaderPrice`/`readMosBig`/`readSummaryCell`/`summaryPlan` ที่เรียก
 *      ตัวแปร local ตรง ๆ (ไม่ใช่ `exports.X`) — การแทน `RM.X = NEVER` จากนอกโมดูลจึงเปลี่ยนแค่ property บน
 *      object ที่ export ออกมา ไม่แตะ closure ข้างใน — **ไม่แก้ derived-values.js ให้เรียกผ่าน exports** (จะไป
 *      กระทบตัวอ่าน consistency-check ของ W06/patchDerived#11 ที่ตั้งใจอ่าน view ที่ render แล้วอยู่แล้ว)
 *      แทนที่ด้วยเทคนิคใหม่ (R3): mutate ข้อความที่ expand แล้วตรง ๆ แทนการสตับ regex — ไม่มี closure ให้เอาชนะ
 *  R2: `ctx.isTHB`/`DV.yieldPlan`/`DV.pbvPlan` ทาง v2 ต้องได้สกุลเงินจาก `stock-meta.currency` (JSON ผ่าน
 *      `RV.CUR_SYMBOL`) ไม่ใช่จาก `.px` ที่ render แล้ว — เพิ่มพารามิเตอร์ `cur` ให้ฟังก์ชันที่เกี่ยวข้อง (v1 ไม่ส่ง
 *      จึงพฤติกรรมเท่าเดิมทุกไบต์) ดู tools/derived-values.js (currencyOf/yieldPlan/pbvPlan/patchDerived),
 *      tools/update-prices.js (derivedPassV2/mirrorStockMetaV2), test/check-reports.js (ctx.cur/isTHB/W19/W20),
 *      tools/field-manifest.js (f29/f31)
 *  R3: เทคนิคพิสูจน์ใหม่ — "post-expand mutation": สับข้อความช่องสำเนาใน HTML ที่ expand แล้วตรง ๆ (เลข+สัญลักษณ์
 *      สกุลเงินของ .px, .big, .chg, ป้าย #mCur, คลาส verdict) แล้วยืนยันว่า ctx/แผนที่คำนวณยังตรงกับ JSON เป๊ะ —
 *      ไม่มี closure ให้เอาชนะเพราะไม่ได้แตะฟังก์ชันใด ๆ เลย แค่ mutate string อินพุต
 *  R4: ทุกจุดที่ติดตั้งสตับ ครอบด้วย try/finally คืนค่า · `UP.gateAfterPatch` เรียกในนั้นด้วย + มี try/catch ของตัวเอง
 *  R5: ถ้อยคำ docstring/assertion ในไฟล์นี้ (และ commit message/report) ใช้คำแคบลงตามด้านบน ไม่ใช่ "regex = 0"
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
const RV = require('../tools/report-values.js');
const { expandReport } = require('../build.js');
const boom = (name) => () => { throw new Error('ทาง v2 ห้ามเรียกตัวอ่านสำเนา: ' + name); };
const NEVER = /(?!)/;
const dp = (html, price) => UP.patchReport(html, { newPrice: price, dateParts: { day: 12, monIdx: 8, yearCE: 2026 }, chartData: null });

// ═══════════════════════════════════════════════════════════════════════════
// GATE — CR.V1_READ ต้องไม่ถูกเรียกทาง v2 (object เดียวใช้ property จริง — stub นี้มีผลจริง ต่างจาก const regex)
// ═══════════════════════════════════════════════════════════════════════════
{
  const saved = { ...CR.V1_READ };
  let r, err = '';
  try {
    // ★ scaleNums เป็นข้อยกเว้นที่มีเอกสารกำกับไว้แล้วที่ test/check-reports.js:211 ("ทาง v2 ไม่เรียกตัวไหนในนี้
    //   ยกเว้น scaleNums ที่ยังอ่าน HTML ทั้งสองทาง") — ป้าย scale ของ gauge (E26) ไม่ใช่ "ช่องสำเนา" ที่ cron
    //   เขียนตามราคา เป็นตัวเลขโครงสร้างคงที่ที่อ่านจาก HTML เสมอไม่ว่า schema ไหน ⇒ ต้องไม่ถูก boom ที่นี่
    //   (ยืนยันแล้ว: boom ตัวนี้ด้วย ทำให้ gate ทาง v2 พัง — ตรงตามที่คอมเมนต์บอกไว้ — Task 10 report item 4)
    for (const k of Object.keys(CR.V1_READ)) if (k !== 'scaleNums') CR.V1_READ[k] = boom('V1_READ.' + k);
    try { r = CR.checkHtml(expandReport(FX.BBL_V2()), 'BBL.html'); } catch (e) { err = e.message; }
    ok(!err, 'gate ทาง v2 ไม่เรียก V1_READ (ตัวอ่านสำเนาของไฟล์ v1)', err);
    ok(r && r.errors.length === 0, 'gate ทาง v2 error 0 โดยไม่มี V1_READ', r && r.errors.map((e) => e.id + ' ' + e.msg).join(' | '));
    ok(r && r.ctx.px > 0 && r.ctx.fvBox > 0 && r.ctx.mosBig != null && r.ctx.pxInput > 0 && r.ctx.chg && r.ctx.priceAge, 'ctx สำเนาทุกตัวมีค่า (มาจาก JSON)');
  } finally {
    Object.assign(CR.V1_READ, saved);   // R4: คืนค่าเสมอแม้ assertion/checkHtml ข้างบนจะ throw
  }
  // sanity: บน v1 ตัว throw ต้องระเบิดจริง (ไม่งั้นเทสนี้พิสูจน์อะไรไม่ได้ — R1)
  {
    const savedPx = CR.V1_READ.px;
    let threw = false;
    try {
      CR.V1_READ.px = boom('px');
      try { CR.buildCtx(expandReport(FX.BBL()), 'BBL.html'); } catch (e) { threw = true; }
    } finally { CR.V1_READ.px = savedPx; }
    ok(threw, 'sanity: v1 ยังเรียก V1_READ.px (ตัว throw ระเบิด)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE — R3 post-expand mutation: สับข้อความช่องสำเนาใน HTML ที่ expand แล้วตรง ๆ (ไม่มี closure ให้เอาชนะ)
//   แล้วต้องได้ ctx เท่าเดิมทุกตัว เพราะ ctx ทาง v2 อ่านจาก JSON (report-data.values / stock-meta) ไม่ใช่จากข้อความ
// ═══════════════════════════════════════════════════════════════════════════
{
  const expanded = expandReport(FX.BBL_V2());
  const trueCtx = CR.buildCtx(expanded, 'BBL.html');
  const FROM = {
    px: '<div class="px">฿193.50',
    big: '<div class="big">+0.8%</div>',
    chg: '<div class="chg">▲ +22.1% (รอบปี)</div>',
    mCur: 'id="mCur"><div class="lab">ปัจจุบัน ฿193.50</div>',
    verdict: 'class="mos-verdict bad"',
  };
  for (const [label, from] of Object.entries(FROM)) ok(expanded.includes(from), `mutation setup: พบรูปเดิมของ ${label} ให้แก้ (ไม่เป็น no-op)`, from);
  const mutated = expanded
    .replace(FROM.px, '<div class="px">$999.99')                                       // เลขคนละตัว + สกุลคนละตัว (R3)
    .replace(FROM.big, '<div class="big">−55.5%</div>')
    .replace(FROM.chg, '<div class="chg">▼ −13.3% (รอบปี)</div>')
    .replace(FROM.mCur, 'id="mCur"><div class="lab">ปัจจุบัน $999.99</div>')
    .replace(FROM.verdict, 'class="mos-verdict good"');
  ok(mutated !== expanded
    && mutated.includes('<div class="px">$999.99') && mutated.includes('<div class="big">−55.5%</div>')
    && mutated.includes('<div class="chg">▼ −13.3% (รอบปี)</div>') && mutated.includes('ปัจจุบัน $999.99')
    && mutated.includes('class="mos-verdict good"') && !Object.values(FROM).some((f) => mutated.includes(f)),
    'mutation: แก้ช่องสำเนาทั้ง 5 จุดสำเร็จ (.px/.big/.chg/#mCur/verdict) ไม่เหลือรูปเดิมแม้แต่จุดเดียว');
  const mutCtx = CR.buildCtx(mutated, 'BBL.html');
  ok(mutCtx.px === trueCtx.px, `gate ทาง v2: ctx.px ไม่ขยับตาม .px ที่ถูกสับ (ยังเป็น ${trueCtx.px} แม้ข้อความเขียน "$999.99")`, String(mutCtx.px));
  ok(mutCtx.fvBox === trueCtx.fvBox, 'gate ทาง v2: ctx.fvBox ไม่ขยับตามช่องสำเนาที่ถูกสับ');
  ok(mutCtx.mosBig === trueCtx.mosBig, `gate ทาง v2: ctx.mosBig ไม่ขยับตาม .big ที่ถูกสับ (ยังเป็น ${trueCtx.mosBig} แม้ข้อความเขียน "−55.5%")`);
  ok(mutCtx.chg === trueCtx.chg, 'gate ทาง v2: ctx.chg ไม่ขยับตาม .chg ที่ถูกสับ');
  // ปิด finding 2 ตรง ๆ: isTHB ต้องยังเป็น THB จริง แม้ .px/#mCur ถูกสับเป็น "$" (สกุลคนละตัวกับความจริง)
  ok(mutCtx.isTHB === true && mutCtx.isTHB === trueCtx.isTHB, 'gate ทาง v2: ctx.isTHB ยังอ่านจาก stock-meta.currency (THB) แม้ .px/#mCur ถูกสับเป็น "$999.99" — fix round 1 finding 2', String(mutCtx.isTHB));
  ok(JSON.stringify(mutCtx.priceAge) === JSON.stringify(trueCtx.priceAge), 'gate ทาง v2: ctx.priceAge ไม่ขยับตามช่องสำเนาที่ถูกสับ (มาจาก values.priceDate)');
}

// ═══════════════════════════════════════════════════════════════════════════
// CRON — ตัวเขียนช่องสำเนา (regex .replace) ต้องไม่ถูกเรียกทาง v2 · ห้ามสตับ DV.patchDerived (v2 ตั้งใจรันมันบน
// view ที่ render แล้วผ่าน derivedPassV2 — การ์ด literal 869/869 ใบต้องการมัน — ruling 13 ก.ย. 2569 ใน brief เดิม)
// ═══════════════════════════════════════════════════════════════════════════
{
  const src = FX.AAPL_V2();
  const rd = RM.readReportData(src).data;
  const rmSaved = { PX_PARTS_RE: RM.PX_PARTS_RE, MCUR_LABEL_PARTS_RE: RM.MCUR_LABEL_PARTS_RE, VERDICT_CLASS_RE: RM.VERDICT_CLASS_RE };
  const dvSaved = { MOS_BIG_RE: DV.MOS_BIG_RE };
  let r, err = '';
  try {
    RM.PX_PARTS_RE = NEVER; RM.MCUR_LABEL_PARTS_RE = NEVER; RM.VERDICT_CLASS_RE = NEVER; DV.MOS_BIG_RE = NEVER;
    try { r = UP.patchReport(src, { newPrice: rd.values.px * 1.05, dateParts: { day: 12, monIdx: 8, yearCE: 2026 }, chartData: null }); } catch (e) { err = e.message; }
    ok(!err && r && r.changed, 'cron ทาง v2: patchReport ไม่ต้องพึ่งตัวเขียนช่องสำเนา 4 ตัว (.px/gauge label/verdict class/.big — ทุกตัวถูกแทนด้วย throw/ไม่ match)', err);
    let gateOk = false, gateDetail = '';
    try {   // R4: gateAfterPatch เรียกในนี้เอง (ไม่ปล่อยหลุด try) — ตัวมันเองก็ guard เฉพาะ expandReport ไม่ครอบ checkHtml
      const g = UP.gateAfterPatch(r && r.html, 'AAPL.html'); gateOk = g.ok; gateDetail = g.detail;
    } catch (e) { gateDetail = 'gateAfterPatch throw: ' + e.message; }
    ok(gateOk, 'cron ทาง v2: ไฟล์ที่ patch แล้ว (ภายใต้ตัวเขียนสำเนาที่ throw) ยังผ่าน gate', gateDetail);
    if (r) {
      // ★ นี่คือ "regex อ่าน view ที่ render แล้ว = consistency check" ตาม R5 — readMosBig/summaryPlan ปิดคุม
      //   MOS_BIG_RE/SUMMARY_RE ของตัวเองไว้ (module-local) ไม่เกี่ยวกับตัวเขียน 4 ตัวข้างบนที่ถูก stub เลย —
      //   ยืนยันแค่ว่า patchDerived#11 (ไม่ถูกสตับ) เขียนช่องสรุปถูกจริงบน view ที่ v2 render จาก values.px
      const exp = expandReport(r.html);
      const big = DV.readMosBig(exp);
      const plan = DV.summaryPlan(exp);
      ok(!!big && !!plan && plan.ok, 'cron ทาง v2: patchDerived#11 เขียนช่องสรุป "MOS ~ ±X%" ตรงกับ .big (consistency check ของ view ที่ render แล้ว — ไม่ใช่ตัวอ่านสำเนาที่ต้องห้าม)',
        big && plan ? `.big=${big.sign}${big.num}% cell="${plan.text}" want="${plan.want}"` : 'อ่าน .big/ช่องสรุปไม่ได้');
    }
  } finally {
    Object.assign(RM, rmSaved); Object.assign(DV, dvSaved);   // R4
  }

  // ── sanity (R1): ทุกชื่อที่ถูกสตับข้างบนต้องกัด v1 จริง — throw ได้ 3/4 (มี need() guard) ──
  for (const [obj, key, label] of [[RM, 'PX_PARTS_RE', 'RM.PX_PARTS_RE'], [RM, 'MCUR_LABEL_PARTS_RE', 'RM.MCUR_LABEL_PARTS_RE'], [DV, 'MOS_BIG_RE', 'DV.MOS_BIG_RE']]) {
    const saved = obj[key];
    let threw = false;
    try { obj[key] = NEVER; try { dp(FX.AAPL(), 100); } catch (e) { threw = true; } }
    finally { obj[key] = saved; }
    ok(threw, `sanity: v1 ยังใช้ ${label} (need() ระเบิด)`);
  }
  // VERDICT_CLASS_RE ไม่มี need() guard (แค่ out.replace(...) เฉย ๆ) → ไม่ throw แต่ "fail" แบบเงียบ (R1 อนุญาต
  // "throw or fail" — พิสูจน์ด้วยการเทียบเอาต์พุต: มี stub → คลาส verdict ไม่ sync ตามโซน MOS ใหม่เลย)
  {
    const before = FX.AAPL();
    const clsOf = (h) => (h.match(/class="mos-verdict (bad|ok|good)"/) || [])[1];
    ok(clsOf(before) === 'bad', 'sanity setup: AAPL fixture เริ่มที่คลาส verdict = bad (mos ติดลบ)', clsOf(before));
    const real = dp(before, 100);   // FV=262 · newPrice=100 → mos +61.8% → ควรเป็น good
    ok(clsOf(real.html) === 'good', 'sanity setup: v1 ปกติ sync คลาส verdict เป็น good ที่ราคาต่ำนี้', clsOf(real.html));
    const saved = RM.VERDICT_CLASS_RE;
    let stubbedCls;
    try { RM.VERDICT_CLASS_RE = NEVER; stubbedCls = clsOf(dp(before, 100).html); }
    finally { RM.VERDICT_CLASS_RE = saved; }
    ok(stubbedCls === 'bad', 'sanity: v1 ยังใช้ RM.VERDICT_CLASS_RE (ไม่ throw — การ sync คลาส verdict หยุดเงียบ ๆ เมื่อถูก stub: ค้าง "bad" แทนที่จะเป็น "good")', `real=good stubbed=${stubbedCls}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// R3 — yieldPlan/pbvPlan: cur ที่ส่งตรง ๆ (จาก stock-meta) ต้องชนะ .px ที่ render แล้วถูกสับเสมอ
//   แต่ละเคส "ต้อง fail กับ 6eb1f6cf": ฟังก์ชันเดิม (ก่อน fix round 1) มีแค่ (html, price) — อาร์กิวเมนต์ที่ 3
//   ถูกเมิน จึงเทียบเท่าเรียกแบบไม่ส่ง cur เสมอ (จำลองด้วย "brokenX" ด้านล่าง — ไม่ต้อง checkout commit จริง)
// ═══════════════════════════════════════════════════════════════════════════
{
  const clean = expandReport(FX.AAPL_V2());
  const rdA = RM.readReportData(FX.AAPL_V2()).data;
  const FROM_PX = '<div class="px">$326.57';
  ok(clean.includes(FROM_PX), 'mutation setup: พบ .px เดิมของ AAPL ให้แก้ (ไม่เป็น no-op)', FROM_PX);
  const corrupted = clean.replace(FROM_PX, '<div class="px">฿999.99');   // เลขคนละตัว + สกุลคนละตัว
  ok(corrupted !== clean, 'mutation: .px ของ AAPL (view ที่ expand แล้ว) ถูกสับ');
  const cur = RV.CUR_SYMBOL[RM.readStockMeta(clean).currency];   // '$' — วิธีเดียวกับที่ derivedPassV2/ctx.cur คำนวณจริง
  ok(cur === '$', 'mutation setup: AAPL stock-meta.currency=USD → cur="$"', cur);
  const cleanY = DV.yieldPlan(clean, rdA.values.px, cur), corrY = DV.yieldPlan(corrupted, rdA.values.px, cur);
  ok(cleanY.cards.length > 0, 'mutation setup: AAPL มีการ์ดปันผลจริงให้ yieldPlan จับ (ไม่ใช่เคสว่างเปล่า)', JSON.stringify(cleanY));
  ok(JSON.stringify(cleanY) === JSON.stringify(corrY), 'yieldPlan: ส่ง cur จาก stock-meta ตรง ๆ → ผล identical ไม่ว่า .px ที่ render จะถูกสับแค่ไหน');
  const brokenY = DV.yieldPlan(corrupted, rdA.values.px);   // ไม่ส่ง cur = พฤติกรรมของ 6eb1f6cf ก่อน fix round 1
  ok(brokenY.cards.length === 0 && JSON.stringify(brokenY) !== JSON.stringify(cleanY),
    'sanity: ไม่ส่ง cur (เทียบเท่าพฤติกรรมก่อน fix round 1 — เคยไม่มีพารามิเตอร์นี้) → .px ที่ถูกสับหลอก currencyOf ได้จริง การ์ดปันผลหาย 1→0', JSON.stringify(brokenY));

  // pbvPlan: ทั้ง AAPL/BBL fixture ไม่มีการ์ด P/BV ที่ denomTokens ตัดสินได้ (ตรวจแล้ว) — ทดสอบกลไกเดียวกัน (currencyOf/
  // denomTokens) ด้วย snippet ขั้นต่ำที่ประกอบเอง (ไม่ใช่ fixture ไม่อ่าน reports/) ให้มีการ์ดที่ตัดสินได้แน่นอน
  const cardSnip = '<div class="k">P/BV</div><div class="v">4.0x</div><div class="d">BVPS $80.00</div>';
  const cleanS = '<div class="px">$320.00</div>' + cardSnip, corrS = '<div class="px">฿999.99</div>' + cardSnip;
  const cleanP = DV.pbvPlan(cleanS, 320, '$'), corrP = DV.pbvPlan(corrS, 320, '$');
  ok(cleanP.length === 1 && cleanP[0].items[0].shown === 4, 'mutation setup: snippet P/BV ตัดสินได้จริง (4.0x = ราคา 320 ÷ BVPS 80)', JSON.stringify(cleanP));
  ok(JSON.stringify(cleanP) === JSON.stringify(corrP), 'pbvPlan: ส่ง cur ตรง ๆ → ผล identical ไม่ว่า .px (snippet) จะถูกสับแค่ไหน');
  const brokenP = DV.pbvPlan(corrS, 320);   // ไม่ส่ง cur
  ok(brokenP.length === 0, 'sanity: ไม่ส่ง cur (เทียบเท่าก่อน fix round 1) → .px snippet ที่ถูกสับทำให้การ์ด P/BV หาย 1→0', JSON.stringify(brokenP));
}

// ═══════════════════════════════════════════════════════════════════════════
// R3 — หน่วยทดสอบ: cron v2 path (derivedPassV2) คำนวณ cur จาก stock-meta.currency ของ argument ตัวเอง เสมอ —
//   ไม่ยอมให้ค่าจากภายนอก (opts.cur ปลอม) เขียนทับ (พิสูจน์ระดับ integration ว่า wiring ถูกทาง)
// ═══════════════════════════════════════════════════════════════════════════
{
  const rdA = RM.readReportData(FX.AAPL_V2()).data;
  const price = rdA.values.px * 1.1;
  const real = UP.derivedPassV2(FX.AAPL_V2(), price);
  const spoofed = UP.derivedPassV2(FX.AAPL_V2(), price, { cur: 'ทดสอบ-ค่าที่ไม่มีจริง' });
  ok(real.changes.some((c) => /^ปันผล/.test(c)), 'mutation setup: AAPL มีการ์ดปันผลจริงให้ derivedPassV2 เขียน (baseline)', JSON.stringify(real.changes));
  ok(real.html === spoofed.html && JSON.stringify(real.changes) === JSON.stringify(spoofed.changes),
    'cron ทาง v2: derivedPassV2 คำนวณ cur จาก stock-meta.currency ของ argument ตัวเองเสมอ (ไม่ใช่จาก view ที่ render) — opts.cur ปลอมจากภายนอกถูกเขียนทับ ปันผลยังคำนวณถูก');
}

console.log(`v2-path-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
