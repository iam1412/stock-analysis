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
console.log(`migrate-v2-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
