'use strict';
// อินพุตจำลองของ tools/queue/sidecar.js buildSidecar() — หุ้นสมมติ ZZZQ (ตัวเลขแบบ ZTS-real · ไม่มีใน tags.json/seeds.json)
// ZZZQ.json ข้าง ๆ = ผลของ builder นี้ (test/v3/sidecar.test.js ยืนยันว่าตรงกัน) — ห้ามแก้ ZZZQ.json มือ ให้รันสคริปต์ใน Plan 2b Task 6 Step 4
// ใช้เป็น sidecar ของ test/v3/report-cli.test.js (init → save ครบวงในโฟลเดอร์ชั่วคราว)
const CHART = [['ต.ค.25', 144.09], ['พ.ย.25', 128.18], ['ธ.ค.25', 125.82], ['ม.ค.26', 124.82], ['ก.พ.26', 131.1], ['มี.ค.26', 118.21],
  ['เม.ย.26', 114.97], ['พ.ค.26', 77.69], ['มิ.ย.26', 71.86], ['ก.ค.26', 77.29], ['ส.ค.26', 77.1], ['ก.ย.26', 71.33]];
module.exports = {
  symbol: 'ZZZQ', th: false, today: '2026-09-21',
  facts: { symbol: 'ZZZQ', currency: 'USD', quoteCurrency: 'USD', px: 71.33, priceDate: '2026-09-21', chart: { data: CHART },
    chgSuffix: 'รอบปี', range52w: { lo: 70.26, hi: 148.79 }, company: 'ZZZQ Animal Health Inc.', exchange: 'NYSE' },
  fund: {
    ttm: { revenue: 9517000000, netIncome: 2616000000, epsDil: 6.13, fcf: 2363000000, sharesDil: 432000000, grossMargin: 71.5, opMargin: 36.4,
      netMargin: 27.5, cash: 1400000000, debt: 9240000000, debtToEquity: 2.93, roe: 80.8 },
    fy: { period: 'FY2025', revenue: 9260000000, netIncome: 2490000000, eps: 5.6 },
    sharesOut: 430000000, dps: 2.12, epsForward: 6.2, rating: 'Buy',
  },
  vend: { epsTTM: 6.13, target: 100.94, analysts: 19, lo52: 70.26, hi52: 148.79, divYieldPct: 2.97, priceStop: false, priceWarn: false, fyYears: 5, traps: [] },
  medians: { median: 30, lo: 26.1, hi: 36.4, window: 'FY2021–FY2025', points: 5, fyYears: 5, curErr: null },
  deltas: { dP: 0.04, dE: 0, single: false },
};
