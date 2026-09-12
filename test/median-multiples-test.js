'use strict';
/** median-multiples-test — offline (open-item #4: เครื่องมือของ controller ก็ต้องตรวจ — เคส AU 2,074x · CP ผสมสกุล 9–10 ก.ย. 69)
 * เรียกจาก test/prep-stock-test.js (ไม่เพิ่มขั้น verify แยก — รวมอยู่ใต้ prep-stock-test)
 * fixture: monthlyCloses จริงคืน **array** ของ {t (ms), c} พร้อมพร็อพเพอร์ตี้ `.currency` แปะบน array เอง
 * (ดู tools/median-multiples.js:69-82) — ไม่ใช่ { currency, points } ตามรูปร่างที่ไม่ตรงกับโค้ดจริง
 */
module.exports = function medianTest(ok) {
  const MM = require('../tools/median-multiples.js');
  const fy = (y) => `${y}-12-31`;
  const page = { src: 'x', fd: {}, arr: [] };
  const finRowStub = { datekey: ['TTM', fy(2025), fy(2024), fy(2023), fy(2022), fy(2021)], epsDiluted: [5, 5, 4, 0.01, -2, 3] };
  // ราคาปิดรายเดือน 9 ปี คงที่ 100 → P/E = 100/EPS: 20 · 25 · 10,000 (สุดขั้ว) · ขาดทุน · 33.3
  const closes = [];
  for (let y = 2018; y <= 2026; y++) for (let m = 1; m <= 12; m++) closes.push({ t: Date.UTC(y, m - 1, 15), c: 100 });
  closes.currency = 'USD';
  const deps = { fetchFinPage: async () => page, monthlyCloses: async () => closes, statementCurrency: async () => 'USD', finRow: (p, keys) => finRowStub[keys[0]] || null };
  return MM.oneSymbol('X', false, deps).then((r) => {
    ok(r.rows.length === 5 && r.rows.every((x) => x.key !== 'TTM'), 'oneSymbol: ข้าม TTM · 5 FY');
    ok(r.rows.find((x) => x.key === fy(2022)).skip && /EPS ≤ 0/.test(r.rows.find((x) => x.key === fy(2022)).skip), 'ปี EPS ≤ 0 ถูกข้าม (ไม่เข้ามัธยฐาน)');
    ok(r.dropped.some((d) => d.key === fy(2023) && /สุดขั้ว/.test(d.outlier)), 'P/E 10,000x ถูกตัดเป็น outlier (เคส AU 2,074x)');
    ok(r.used.length === 3 && Math.abs(r.median - 25) < 1e-9, 'มัธยฐานจาก 3 ปีปกติ = 25x');
    ok(/มัธยฐาน/.test(MM.report(r)) && !/10000|10,000/.test(MM.report(r).split('★')[1] || ''), 'report: บรรทัด ★ ไม่มีค่าสุดขั้ว');
    return MM.oneSymbol('CP', false, { ...deps, statementCurrency: async () => 'CAD' });
  }).then((r) => {
    ok(r.median == null && r.curErr && /CAD/.test(r.curErr) && /USD/.test(r.curErr), 'ผสมสกุล (งบ CAD · ราคา USD) → median null + curErr (เคส CP)');
  }).then(() => MM.oneSymbol('Y', false, { ...deps, finRow: (p, keys) => ({ datekey: ['TTM', fy(2025), fy(2024)], epsDiluted: [5, 5, 4] })[keys[0]] })).then((r) => {
    ok(r.median == null && r.used.length === 2, `MIN_POINTS: 2 ปี < ${MM.MIN_POINTS} → median null`);
  });
};
