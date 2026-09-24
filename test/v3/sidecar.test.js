'use strict';
// Plan 2b Task 6 — prep sidecar .queue/prep/<SYM>.json (spec §6.4) · ทุกเทส offline: ฟังก์ชันบริสุทธิ์ + อินพุตจำลอง (ห้ามยิง network)
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('sidecar');
const FF = require('../../tools/fetch-facts.js');
const FU = require('../../tools/fetch-fundamentals.js');
const SC = require('../../tools/queue/sidecar.js');
const I = require('../fixtures/v3/sidecar/ZZZQ.inputs.js');

// ── fetch-facts --json ──
const mid = (i) => Date.UTC(2025, 9 + i, 15) / 1000;   // กลางเดือน — ไม่ให้ gmtoffset ลากข้ามเดือน
const q = { price: 71.33, currency: 'USD', marketTime: Date.UTC(2026, 8, 21, 20, 0, 0) / 1000, gmtoffset: -4 * 3600,
  week52Low: 70.26, week52High: 148.79, longName: 'ZZZQ Animal Health Inc.', exchangeName: 'NYSE',
  bars: Array.from({ length: 12 }, (_, i) => ({ ts: mid(i), close: 140 - i * 6 })) };
{ const f = FF.factsJson(q, 'ZZZQ', 'USD');
  t.eq([f.px, f.priceDate, f.chgSuffix, f.company, f.exchange], [71.33, '2026-09-21', 'รอบปี', 'ZZZQ Animal Health Inc.', 'NYSE'], 'factsJson: price, ISO market-local date, suffix, name, exchange');
  t.eq(f.range52w, { lo: 70.26, hi: 148.79 }, 'factsJson: 52-week range from Yahoo meta (not monthly closes — M7)');
  t(f.chart.data.length === 12 && f.chart.data[11][1] === 71.33 && Object.keys(f.chart).join() === 'data', 'factsJson: chart = data only (min/max/grid dropped — compute derives), last point = price'); }
t.eq(FF.factsJson({ ...q, bars: q.bars.slice(-5) }, 'ZZZQ', 'USD').chgSuffix, 'ตั้งแต่ IPO', 'factsJson: under ~320 days of bars → ตั้งแต่ IPO');
{ const f = FF.factsJson({ ...q, longName: undefined, exchangeName: undefined, week52Low: undefined }, 'ZZZQ', 'USD');
  t(f.company === null && f.exchange === null && f.range52w === null, 'factsJson: missing meta → null (init leaves a TODO)'); }

// ── fetch-fundamentals --json ──
function makeFinPage(rows) {   // โครง devalue แบบเดียวกับ test/prep-stock-test.js
  const arr = []; const fd = {};
  const push = (v) => { arr.push(v); return arr.length - 1; };
  for (const [k, vals] of Object.entries(rows)) fd[k] = push(vals.map((v) => (v == null ? -1 : push(v))));
  return { arr, fd, src: 'test' };
}
const fin = makeFinPage({ datekey: ['TTM', '2025-12-31', '2024-12-31'], fiscalYear: [null, 2025, 2024], revenue: [9517e6, 9260e6, 8540e6],
  netIncome: [2616e6, 2490e6, 2340e6], epsDiluted: [6.13, 5.6, 5.1], fcf: [2363e6, 2300e6, 2000e6], sharesDiluted: [432e6, 445e6, 459e6],
  grossMargin: [0.715, 0.71, 0.7], operatingMargin: [0.364, 0.36, 0.35], profitMargin: [0.275, 0.27, 0.27] });
const bs = makeFinPage({ datekey: ['2026-06-30', '2025-12-31'], totalcash: [1.4e9, 2e9], debt: [9.24e9, 6.7e9] });
const ratio = makeFinPage({ datekey: ['TTM', '2025-12-31'], debtequity: [2.93, 1.9], roe: [0.808, 0.5] });
{ const s = FU.snapshotJson({ y: { epsFwd: 6.2 }, s: { info: { dps: 2.12, analysts: 'Buy' } }, stats: { sharesOut: { num: 430e6, text: '430.00M' } }, pages: [fin, bs, ratio] });
  t.eq(s.ttm, { revenue: 9517e6, netIncome: 2616e6, epsDil: 6.13, fcf: 2363e6, sharesDil: 432e6, grossMargin: 71.5, opMargin: 36.4, netMargin: 27.5, cash: 1.4e9, debt: 9.24e9, debtToEquity: 2.93, roe: 80.8 },
    'snapshotJson: TTM column; margins/ROE in %; balance sheet/ratios = TTM or latest column');
  t.eq(s.fy, { period: 'FY2025', revenue: 9260e6, netIncome: 2490e6, eps: 5.6 }, 'snapshotJson: latest closed FY column');
  t.eq([s.sharesOut, s.dps, s.epsForward, s.rating], [430e6, 2.12, 6.2, 'Buy'], 'snapshotJson: shares outstanding [2b] (not wAvgDil), dps, forward EPS, SA rating'); }
{ const s = FU.snapshotJson({ pages: [makeFinPage({ datekey: ['2025-12-31'], revenue: [1e9] }), null, null] });
  t(s.ttm.revenue === null && s.fy.revenue === 1e9 && s.fy.period === 'FY2025', 'snapshotJson: no TTM column → TTM null (never an FY stand-in), FY still read'); }
t.eq(FU.snapshotJson({ pages: [] }).fy, null, 'snapshotJson: no statements → fy null, no throw');

// ── sidecar ──
t.eq(SC.buildSidecar(I), require('../fixtures/v3/sidecar/ZZZQ.json'), 'fixture ZZZQ.json = builder output (regenerate with the Task 6 script, never by hand)');
{ const sc = SC.buildSidecar(I);
  t.eq(Object.keys(sc.market).sort(), ['chart', 'chgSuffix', 'priceDate', 'px', 'range52w'], 'market block = only schema market keys (save merges it verbatim)');
  t.eq([sc.v, sc.currency, sc.region, sc.builtAt], [1, 'USD', 'US', '2026-09-21'], 'header: version, currency/region from th, builtAt');
  t.eq(sc.market.range52w, { lo: 70.26, hi: 148.79 }, 'range52w = vendor 52wk'); }
t.eq(SC.buildSidecar({ ...I, th: true }).region, 'TH', 'th → region TH / currency THB');
t.throws(() => SC.buildSidecar({ ...I, facts: { ...I.facts, px: undefined } }), /fetch-facts --json ไม่ครบ/, 'no price → throw (a sidecar without market is useless to save)');
{ const r = { median: 30.04, fyYears: 5, rows: [{ key: '2021-12-31', pe: 28 }, { key: '2022-12-31', pe: 36.4 }, { key: '2023-12-31', pe: 80, outlier: 'x' },
  { key: '2024-12-31', pe: 26.1 }, { key: '2025-12-31', pe: null, skip: 'EPS ≤ 0' }] };
  t.eq(SC.mediansOf(r), { median: 30.04, lo: 26.1, hi: 36.4, window: 'FY2021–FY2024', points: 3, fyYears: 5, curErr: null }, 'mediansOf: outliers/skips out, window from the used years'); }
t.eq(SC.mediansOf(null), null, 'mediansOf(null) → null (median fetch failed)');
t.eq(SC.mediansOf({ rows: [], median: null, curErr: 'งบเป็น CAD' }).curErr, 'งบเป็น CAD', 'mediansOf keeps curErr (init must not use the median)');
{ const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-sidecar-'));
  try { const f = SC.writeSidecar(path.join(dir, 'prep'), SC.buildSidecar(I));
    t(f === path.join(dir, 'prep', 'ZZZQ.json') && JSON.parse(fs.readFileSync(f, 'utf8')).symbol === 'ZZZQ', 'writeSidecar: <dir>/<SYM>.json (creates the dir)'); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); } }
t.done();
