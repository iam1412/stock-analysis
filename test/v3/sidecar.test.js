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
  week52Low: 70.26, week52High: 148.79, longName: 'ZZZQ Animal Health Inc.', exchangeName: 'NYQ',
  bars: Array.from({ length: 12 }, (_, i) => ({ ts: mid(i), close: 140 - i * 6 })) };
{ const f = FF.factsJson(q, 'ZZZQ', 'USD');
  t.eq([f.px, f.priceDate, f.chgSuffix, f.company, f.exchange], [71.33, '2026-09-21', 'รอบปี', 'ZZZQ Animal Health Inc.', 'NYSE'], 'factsJson: price, ISO market-local date, suffix, name, exchange');
  t.eq(f.range52w, { lo: 70.26, hi: 148.79 }, 'factsJson: 52-week range from Yahoo meta (not monthly closes — M7)');
  t(f.chart.data.length === 12 && f.chart.data[11][1] === 71.33 && Object.keys(f.chart).join() === 'data', 'factsJson: chart = data only (min/max/grid dropped — compute derives), last point = price'); }
t.eq(FF.factsJson({ ...q, bars: q.bars.slice(-5) }, 'ZZZQ', 'USD').chgSuffix, 'ตั้งแต่ IPO', 'factsJson: under ~320 days of bars → ตั้งแต่ IPO');
{ const f = FF.factsJson({ ...q, longName: undefined, exchangeName: undefined, week52Low: undefined }, 'ZZZQ', 'USD');
  t(f.company === null && f.exchange === null && f.range52w === null, 'factsJson: missing meta → null (init leaves a TODO)'); }
// รหัสตลาด = รหัสของรีโป (NYSE/NASDAQ/SET) จาก meta.exchangeName ของ Yahoo — ไม่ใช่ชื่อแสดงผล (review fix 1)
t.eq(['NMS', 'NGM', 'NCM', 'NYQ', 'SET'].map(FF.exchangeCode), ['NASDAQ', 'NASDAQ', 'NASDAQ', 'NYSE', 'SET'], 'exchangeCode: Yahoo codes → repo codes');
t.eq(['NasdaqGS', 'Thailand', 'NYSE', 'PCX', undefined, null, 'toString'].map(FF.exchangeCode), [null, null, null, null, null, null, null], 'exchangeCode: display names / unknown / missing → null (never "NasdaqGS"/"Thailand")');
t.eq(FF.factsJson({ ...q, exchangeName: 'NMS' }, 'ZZZQ', 'USD').exchange, 'NASDAQ', 'factsJson: exchange goes through exchangeCode');

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
t.eq(FU.snapshotJson({ pages: [fin, bs, ratio] }).errors, { yahoo: null, sa: null, stats: null, fin: null }, 'snapshotJson: no failures → errors all null');
t.eq(FU.snapshotJson({ pages: [null, null, null], finErr: 'HTTP 503', yErr: 'crumb' }).errors, { yahoo: 'crumb', sa: null, stats: null, fin: 'HTTP 503' }, 'snapshotJson: source failures surface in errors (never swallowed)');

// ── sidecar ──
t.eq(SC.buildSidecar(I), require('../fixtures/v3/sidecar/ZZZQ.json'), 'fixture ZZZQ.json = builder output (regenerate with the Task 6 script, never by hand)');
{ const sc = SC.buildSidecar(I);
  t.eq(Object.keys(sc.market).sort(), ['chart', 'chgSuffix', 'priceDate', 'px', 'range52w'], 'market block = only schema market keys (save merges it verbatim)');
  t.eq([sc.v, sc.currency, sc.region, sc.builtAt], [1, 'USD', 'US', '2026-09-21'], 'header: version, currency/region from th, builtAt');
  t.eq(sc.market.range52w, { lo: 70.26, hi: 148.79 }, 'range52w = vendor 52wk'); }
{ const sc = SC.buildSidecar({ ...I, th: true, facts: { ...I.facts, currency: 'THB', quoteCurrency: 'THB' } });
  t.eq([sc.region, sc.currency], ['TH', 'THB'], 'th → region TH / currency THB'); }
t.throws(() => SC.buildSidecar({ ...I, facts: { ...I.facts, quoteCurrency: 'THB' } }), /สกุลจาก Yahoo = THB ไม่ตรงที่คาด \(USD\)/, 'quote currency ≠ expected → throw (ticker collision AIT/ORI)');
t.throws(() => SC.buildSidecar({ ...I, th: true }), /ไม่ตรงที่คาด \(THB\)/, 'th but Yahoo quotes USD → throw');
t.eq(SC.buildSidecar({ ...I, facts: { ...I.facts, quoteCurrency: null } }).currency, 'USD', 'quoteCurrency unknown → no currency throw');
// งบ/สถิติล้ม = ห้ามสร้าง sidecar · แหล่งรองล้ม = บันทึกใน sourceErrors นอก market (review fix 2)
t.throws(() => SC.buildSidecar({ ...I, fund: { ...I.fund, errors: { ...I.fund.errors, fin: 'HTTP 503' } } }), /ดึงงบไม่ได้ \(fin: HTTP 503\)/, 'errors.fin → throw');
t.throws(() => SC.buildSidecar({ ...I, fund: { ...I.fund, errors: { ...I.fund.errors, stats: 'ไม่เจอการ์ด' } } }), /stats: ไม่เจอการ์ด/, 'errors.stats → throw');
{ const base = SC.buildSidecar(I), sc = SC.buildSidecar({ ...I, fund: { ...I.fund, errors: { ...I.fund.errors, yahoo: 'crumb 401' } } });
  t.eq(sc.sourceErrors, { yahoo: 'crumb 401' }, 'errors.yahoo only → sourceErrors.yahoo (top level)');
  t.eq(sc.market, base.market, 'errors.yahoo → market untouched');
  t.eq(base.sourceErrors, null, 'no errors → sourceErrors null'); }
// range52w: lo ต้อง > 0 (schema gt:0) — vendor 0 ⇒ ถอยไป Yahoo meta · ทั้งคู่ใช้ไม่ได้ ⇒ null (review m5)
t.eq(SC.buildSidecar({ ...I, vend: { ...I.vend, lo52: 0 }, facts: { ...I.facts, range52w: { lo: 69, hi: 150 } } }).market.range52w, { lo: 69, hi: 150 }, 'range52w: vendor lo 0 → Yahoo meta fallback');
t.eq(SC.buildSidecar({ ...I, vend: { ...I.vend, lo52: 0 }, facts: { ...I.facts, range52w: { lo: 0, hi: 150 } } }).market.range52w, null, 'range52w: no lo > 0 anywhere → null');
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
// ── prep NEW (final review re-ruling): sidecar ประกอบไม่ได้ = ⚠ บรรทัดเดียว + ไม่มี .json + .md ยังเขียน · exit เดิม ──
{ const cp = require('child_process');
  const child = path.join(__dirname, '_prep-child.js');
  const runPrep = (scen, pre, sym = 'ZZZQ') => {
    const q = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-prep-'));
    if (pre) { fs.mkdirSync(path.join(q, 'prep'), { recursive: true }); fs.writeFileSync(path.join(q, 'prep', 'ZZZQ.json'), pre); }
    const r = cp.spawnSync(process.execPath, [child, scen], { encoding: 'utf8', env: { ...process.env, QUEUE_DIR: q } });
    const has = (f) => fs.existsSync(path.join(q, 'prep', f));
    const out = { code: r.status, out: r.stdout, err: r.stderr, md: has(sym + '.md'), json: has(sym + '.json'),
      sc: has('ZZZQ.json') ? JSON.parse(fs.readFileSync(path.join(q, 'prep', 'ZZZQ.json'), 'utf8')) : null,
      writes: ((r.stdout.match(/^WRITES (.*)$/m) || [])[1] || '').split(',') };
    fs.rmSync(q, { recursive: true, force: true });
    return out;
  };
  const warnLines = (o) => o.out.split('\n').filter((l) => l.startsWith('⚠ sidecar ไม่ได้เขียน'));
  { const o = runPrep('fail-run');
    t(o.code === 0 && o.md && !o.json, `prep NEW + failing --json child → exit 0, .md written, no .json (code ${o.code} md ${o.md} json ${o.json} ${o.err.slice(-300)})`);
    t.eq(warnLines(o), ['⚠ sidecar ไม่ได้เขียน (tools/fetch-facts.js ZZZQ --json ล้ม (exit 1): ✗ boom) — report.js init จะปฏิเสธจนกว่าจะ prep ใหม่'], 'prep NEW: exactly one ⚠ line, reason = first line of the error'); }
  { const o = runPrep('fail-build', '{"v":1,"symbol":"ZZZQ","stale":true}\n');
    t(o.code === 0 && o.md && !o.json, 'prep NEW + stale sidecar + failing build → stale .json removed, .md written');
    t(warnLines(o).length === 1 && /fin: HTTP 503/.test(warnLines(o)[0]), 'prep NEW: buildSidecar throw → one ⚠ line naming the reason'); }
  { const o = runPrep('ok', '{"v":1,"symbol":"ZZZQ","stale":true}\n');
    t(o.code === 0 && o.md && o.json && o.sc.symbol === 'ZZZQ' && !o.sc.stale && o.sc.market.px === 71.33, 'prep NEW success → fresh sidecar replaces the stale one');
    t.eq(o.writes.filter((w) => w === 'ZZZQ.md' || w === 'ZZZQ.json'), ['ZZZQ.md', 'ZZZQ.json'], 'prep NEW: sidecar written after the .md (m1 order)');
    t(warnLines(o).length === 0 && /^sidecar → /m.test(o.out), 'prep NEW success: sidecar line, no ⚠'); }
  // advisor pre-merge: symbol ที่ assertSym ไม่รับ ต้องไม่ล้ม prep v2 ที่ removeSidecar ต้นใบ (นอก try) — .md ยังเขียน, ⚠ บรรทัดเดียว, ไม่มี .json
  { const o = runPrep('bad-sym', null, 'ZZ&Q');
    t(o.code === 0 && o.md && !o.json && !/THROW/.test(o.err), `prep NEW + symbol ผิดรูป (ZZ&Q) → exit 0, .md written, no .json (code ${o.code} md ${o.md} ${o.err.slice(-200)})`);
    t(warnLines(o).length === 1 && /symbol ไม่ถูกรูป/.test(warnLines(o)[0]), 'prep NEW bad symbol: exactly one ⚠ line naming assertSym'); } }

// N-1 (final re-review): removeSidecar/writeSidecar refuse a path-like symbol — never rm/write outside <dir>
{ const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-sidecar-sym-'));
  const outside = path.join(dir, 'REPORTS'); fs.mkdirSync(outside); const victim = path.join(outside, 'ZTS.json'); fs.writeFileSync(victim, '{}');
  const prep = path.join(dir, 'q', 'prep'); fs.mkdirSync(prep, { recursive: true });
  try {
    for (const bad of ['../../REPORTS/ZTS', '../ZTS', 'ZTS/..', '', 'zts', '.ZTS', 'ZT S']) {
      let threw = false; try { SC.removeSidecar(prep, bad); } catch (e) { threw = /symbol ไม่ถูกรูป/.test(e.message); }
      t(threw && fs.existsSync(victim), `removeSidecar(${JSON.stringify(bad)}) throws, deletes nothing`);
    }
    let threwW = false; try { SC.writeSidecar(prep, { ...SC.buildSidecar(I), symbol: '../../REPORTS/ZTS' }); } catch (e) { threwW = /symbol ไม่ถูกรูป/.test(e.message); }
    t(threwW && fs.readFileSync(victim, 'utf8') === '{}' && fs.readdirSync(prep).length === 0, 'writeSidecar with a path-like symbol throws, writes nothing');
    fs.writeFileSync(path.join(prep, 'ZZZQ.json'), '{}'); SC.removeSidecar(prep, 'ZZZQ');
    t(!fs.existsSync(path.join(prep, 'ZZZQ.json')) && fs.existsSync(victim), 'removeSidecar with a valid symbol still removes exactly <dir>/<SYM>.json');
    SC.removeSidecar(prep, 'BRK.B'); SC.removeSidecar(prep, 'AOT-R');
    t(true, 'removeSidecar accepts dotted/dashed symbols (BRK.B, AOT-R)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
// Plan 3 Task 1 (R3) — ตัวสร้าง market ตัวเดียว: quote เดียวกัน → prep (factsJson → buildSidecar) = cron (marketFromQuote)
{ const MK = require('../../tools/v3/market.js');
  const U = require('../../tools/update-prices.js');
  const built = MK.marketFromQuote(null, q, U.buildChartData(q.bars, q.price, q.gmtoffset));
  const noVendor = SC.buildSidecar({ ...I, vend: { ...I.vend, lo52: null, hi52: null }, facts: FF.factsJson(q, 'ZZZQ', 'USD') });
  t.eq(noVendor.market, built, 'R3: prep market (factsJson → sidecar) = cron builder market for the same quote');
  const withVendor = SC.buildSidecar({ ...I, vend: { ...I.vend, lo52: 69, hi52: 150 }, facts: FF.factsJson(q, 'ZZZQ', 'USD') });
  t.eq(withVendor.market, { ...built, range52w: { lo: 69, hi: 150 } }, 'R3: the only prep-side difference = vendor 52wk override (M7)');
  t.eq(FF.factsJson({ ...q, price: 71.334 }, 'ZZZQ', 'USD').px, 71.33, 'factsJson px = round2 (same as cron — was raw before Plan 3)'); }
t.done();
