'use strict';
// Plan 3 Task 3 — สาย v3 ของ cron (spec §7 · rulings R4–R8 · R10) · ส่วนบริสุทธิ์ของ tools/update-prices.js (planV3/applyV3/preSkip/evaluatedOf)
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามแตะ reports/ จริง · ไม่ยิง network (quote จำลอง) · ใบจำลองเขียนผ่าน IO.write เท่านั้น
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('cron');
const U = require('../../tools/update-prices.js');
const IO = require('../../tools/v3/io.js');
const RS = require('../../tools/report-source.js');
const CV = require('../check-v3.js');
const seeds = require('../../tools/seeds.json');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, '..', 'fixtures');
const real = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS-real.json')));   // FV 85 · px 71.33 · priceDate 2026-09-21
const resign = (d) => { const { _sig, ...rest } = d; return { ...rest, _sig: IO.sign(rest) }; };
const withPx = (px) => { const d = real(); d.market.px = px; return resign(d); };
const mid = (i) => Date.UTC(2025, 9 + i, 15) / 1000;
const T22 = Date.UTC(2026, 8, 22, 20, 0, 0) / 1000;   // 22 ก.ย. 69 16:00 ET = ราคาปิดของ session ใหม่ (หลัง priceDate 21 ก.ย.)
const NOW = T22 + 3600;
const today = '2026-09-22';
const quote = (price, over) => ({ price, currency: 'USD', marketTime: T22, gmtoffset: -4 * 3600, regularStart: T22 - 23400, regularEnd: T22,
  week52Low: 70.26, week52High: 148.79, bars: real().market.chart.data.map((p, i) => ({ ts: mid(i), close: p[1] })), ...over });
const chartOf = (q) => ({ data: U.buildChartData(q.bars, q.price, q.gmtoffset), src: '1mo', bars: q.bars, gmtoffset: q.gmtoffset });
const plan = (doc, q, over) => U.planV3(doc, q, chartOf(q), { seeds, today, nowSec: NOW, ...over });
const strip = (d) => { const { market, _sig, ...x } = d; return x; };

// ── happy path (R3/R4 + §8) ──
{ const prev = real(), p = plan(prev, quote(73.456)), m = p.next && p.next.market;
  t.eq(p.kind, 'write', 'happy: write');
  t.eq([m.px, m.priceDate], [73.46, '2026-09-22'], 'happy: px 2dp · ISO market-local date');
  t(m.chart.data.length <= 13 && m.chart.data[m.chart.data.length - 1][1] === 73.46, 'happy: chart ≤ 13 points, last point = px');
  t.eq(m.range52w, { lo: 70.26, hi: 148.79 }, 'happy: range52w from Yahoo 52wk');
  t.eq(m.chgSuffix, prev.market.chgSuffix, 'happy: chgSuffix kept');
  t(IO.verifySig(p.next), 'happy: next doc is signed');
  t.eq(IO.freshHash(p.next), IO.freshHash(prev), 'happy: freshHash equal ⇒ updated does not move');
  t.eq(strip(p.next), strip(prev), 'happy: every non-market field deep-equal');
  t.eq(CV.checkDoc(p.next, { seeds, today: m.priceDate }).errors, [], 'happy: checkDoc clean with today = priceDate');
  t.eq([p.reportPrice, p.marketPrice, p.diffPct], [71.33, 73.46, 3], 'happy: log/commit-body numbers'); }
{ const p = plan(real(), quote(73, { week52Low: undefined }));
  t(p.kind === 'write' && JSON.stringify(p.next.market.range52w) === JSON.stringify(real().market.range52w), 'Yahoo 52wk missing → prev range52w kept, still writes (no E51)'); }

// ── R5: ไม่มี session ใหม่ ──
{ const T21 = Date.UTC(2026, 8, 21, 20, 0, 0) / 1000;
  t.eq(plan(real(), quote(71.33, { marketTime: T21, regularEnd: T21, regularStart: T21 - 23400 })).kind, 'unchanged', 'R5: same priceDate + same px (ICC case) → unchanged: no write, no flag');
  t.eq(plan(real(), quote(71.33, { marketTime: T21 - 3 * 86400 })).kind, 'unchanged', 'R5: quote older than priceDate, same px → unchanged (priceDate never moves back)'); }

// ── freeze (R4 — decide() บน FV จาก view) ──
t.eq(plan(real(), quote(73, { currency: 'THB' })).reason, 'currency-mismatch', 'freeze: currency ≠ doc.currency');
t.eq(plan(real(), quote(71.33 * 1.16)).reason, 'drift-gt-15pct', 'freeze: drift 16%');
t.eq(plan(real(), quote(71.33 * 1.26)).reason, 'suspect-split-or-data', 'freeze: 26% → suspect-split-or-data');
t.eq(plan(withPx(80), quote(88)).reason, 'mos-sign-flip', 'freeze: MOS +5.9 → −3.5 (old outside ±5) → mos-sign-flip');
t.eq(plan(withPx(82), quote(86)).kind, 'write', 'dead-band: MOS +3.5 → −1.2 (both inside ±5) → write');
t.eq(plan(real(), quote(71.33 * 1.2), { force: true }).kind, 'write', '--force skips drift/suspect/flip (manual pre-patch — R8)');
t.eq(plan(real(), quote(73, { currency: 'THB' }), { force: true }).reason, 'currency-mismatch', '--force never skips currency');
{ const p = plan(withPx(80), quote(84));
  t(p.kind === 'write' && p.warnings.some((w) => w.id === 'W18'), 'R6: W18 that fires only at the new price is a warning — still writes'); }

// ── bad-chart ──
{ const q = quote(73); q.bars = q.bars.map((b, i) => (i === 3 ? { ...b, close: 200 } : b));   // จุดในหน้าต่าง 52 สัปดาห์หลุดกรอบ 148.79 เกิน 10%
  const p = plan(real(), q);
  t(p.kind === 'freeze' && p.reason === 'bad-chart' && /หลุดกรอบ 52 สัปดาห์/.test(p.detail), 'freeze: mixed-basis series → bad-chart');
  const pf = plan(real(), q, { force: true }), d = pf.next && pf.next.market.chart.data;
  t(pf.kind === 'write' && pf.chartSrc === 'old-chart(bad-chart)' && JSON.stringify(d.slice(0, 11)) === JSON.stringify(real().market.chart.data.slice(0, 11)) && d[11][1] === 73,
    '--force + bad-chart → price-only: old chart kept, last point = new px'); }

// ── กราฟรายสัปดาห์ (Yahoo รายเดือนไม่พอจุด) ──
{ const wk = Array.from({ length: 9 }, (_, i) => ({ ts: Date.UTC(2026, 7, 3 + i * 7) / 1000, close: 70 + i }));
  const q = quote(73), p = U.planV3(real(), q, { data: U.buildChartData(wk, q.price, q.gmtoffset), src: '1wk', bars: wk, gmtoffset: q.gmtoffset }, { seeds, today, nowSec: NOW });
  const d = p.next && p.next.market.chart.data;
  t(p.kind === 'write' && p.chartSrc === '1wk' && d.length === 2 && d[0][0] === 'ส.ค.26' && d[1][0] === 'ก.ย.26' && d[1][1] === 73,
    'weekly fallback: month-grouped series, labels "ส.ค.26"/"ก.ย.26", last = px'); }
t.eq(U.planV3(real(), quote(73), { data: null, src: 'old-chart', bars: [], gmtoffset: -4 * 3600 }, { seeds, today, nowSec: NOW }).next.market.chart.data.length, 12, 'no chart at all → price-only on the old chart');

// ── patch-rejected (R6: gate ก่อนเขียน · ไม่มีอะไรให้ revert) ──
{ const fut = quote(73, { marketTime: Date.UTC(2026, 9, 5, 20, 0, 0) / 1000 });   // priceDate 5 ต.ค. — today 22 ก.ย. ⇒ อนาคต 13 วัน = E27 บนใบใหม่เท่านั้น
  const p = plan(real(), fut);
  t(p.kind === 'freeze' && p.reason === 'patch-rejected' && /^E27 \(patch ทำให้ตก\)/.test(p.detail), 'patch-rejected: the new market fails the gate → freeze, "patch ทำให้ตก"'); }
{ const p = plan(real(), quote(73), { today: '2027-06-01' });   // ใบเดิมก็เก่าเกิน 120 วันอยู่แล้ว
  t(p.kind === 'freeze' && /^E27 \(ค้างก่อน patch\)/.test(p.detail), 'patch-rejected: same code on the old doc → "(ค้างก่อน patch)"');
  const pf = plan(real(), quote(73), { today: '2027-06-01', force: true });
  t(pf.kind === 'write' && /E27/.test(pf.forced || ''), 'R6: --force writes past a non-E50/E51 gate error (flagged in .forced)'); }
{ const bad = real(); bad.prose.mos += ' {{rd:px}}';   // ไวยากรณ์ v2 ในใบ v3 = E51
  const p = plan(resign(bad), quote(73), { force: true });
  t(p.kind === 'freeze' && p.reason === 'patch-rejected' && /E51/.test(p.detail), 'R6: E51 is never forced'); }
{ const hand = real(); hand.prose.mos += ' แก้มือ';   // _sig เดิม ⇒ ลายเซ็นไม่ตรง
  const p = plan(hand, quote(73), { force: true });
  t(p.kind === 'freeze' && /^E50/.test(p.detail), 'R6: E50 (hand edit) is never forced — cron never re-signs a hand edit'); }

// ── preSkip (v2 + v3 ด่านเดียวกัน) ──
{ const open = quote(73, { regularStart: T22 - 3600, regularEnd: T22 + 3600 });
  const o = { allowIntraday: false, deadAlready: new Set(), alive: false, nowSec: T22 };
  t.eq(U.preSkip(open, 'ZTS', o), 'intraday', 'preSkip: market still open → intraday');
  t.eq(U.preSkip(open, 'ZTS', { ...o, allowIntraday: true }), null, 'preSkip: --allow-intraday/--force/--alive → no intraday skip');
  t.eq(U.preSkip(quote(73), 'ZTS', { ...o, deadAlready: new Set(['ZTS']), nowSec: NOW }), 'dead', 'preSkip: not-on-exchange → dead');
  t.eq(U.preSkip(quote(73), 'ZTS', { ...o, deadAlready: new Set(['ZTS']), alive: true, nowSec: NOW }), null, 'preSkip: --alive overrides dead'); }

// ── applyV3 + flags บนดิสก์ (โฟลเดอร์ชั่วคราว) ──
let tmp, fdir;
try {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-cron-'));
  fdir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-cron-flags-'));   // price-flags.json แยกโฟลเดอร์ — .json ใน tmp จะถูกนับเป็นใบ v3
  const zf = path.join(tmp, 'ZTS.json');
  IO.write(zf, real());
  fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'AAPL.html'));
  const bytes = () => fs.readFileSync(zf, 'utf8');
  const b0 = bytes();
  const opt = { seeds, today };
  const dry = U.applyV3(zf, plan(IO.read(zf), quote(73.456)), { ...opt, write: false });
  t(dry.kind === 'write' && bytes() === b0 && /^· ZTS/.test(dry.line), 'dry-run: plan says write, file bytes unchanged');
  const fz = U.applyV3(zf, plan(IO.read(zf), quote(71.33 * 1.16)), { ...opt, write: true });
  t(fz.kind === 'freeze' && fz.flag.reason === 'drift-gt-15pct' && bytes() === b0, 'freeze: flag row, bytes unchanged');
  const rj = U.applyV3(zf, plan(IO.read(zf), quote(73, { marketTime: Date.UTC(2026, 9, 5, 20, 0, 0) / 1000 })), { ...opt, write: true });
  t(rj.kind === 'freeze' && rj.flag.reason === 'patch-rejected' && /E27/.test(rj.flag.detail) && bytes() === b0, 'patch-rejected: flag row with detail, bytes unchanged');
  const un = U.applyV3(zf, plan(IO.read(zf), quote(71.33, { marketTime: Date.UTC(2026, 8, 21, 20, 0, 0) / 1000 })), { ...opt, write: true });
  t(un.kind === 'unchanged' && bytes() === b0, 'unchanged: no write');
  const w = U.applyV3(zf, plan(IO.read(zf), quote(73.456)), { ...opt, write: true });
  const after = IO.read(zf);
  t(w.kind === 'write' && after.market.px === 73.46 && IO.verifySig(after) && /^✓ ZTS/.test(w.line), 'write: IO.writeMarket wrote the new market, signature valid');
  t.eq(w.row, { symbol: 'ZTS', old: 71.33, new: 73.46, diffPct: 3 }, 'write: commit-body row has the v2 shape');
  const body = U.commitBody([w.row], [fz.flag]);
  t(body.includes('ZTS 71.33 → 73.46 (+3%)') && body.includes('freeze ZTS [drift-gt-15pct] 71.33 → 82.74 (+16%)'), 'commitBody lists v3 rows like v2 rows');
  // ไฟล์ถูกแก้มือระหว่าง plan กับ write → writeMarket ปฏิเสธ E50 → patch-rejected ไม่ throw ไฟล์เดิมทุก byte
  const pl = plan(IO.read(zf), quote(74));
  const hand = IO.read(zf); hand.prose.mos += ' แก้มือ'; fs.writeFileSync(zf, JSON.stringify(hand, null, 2) + '\n');
  const b1 = bytes();
  const rr = U.applyV3(zf, pl, { ...opt, write: true });
  t(rr.kind === 'freeze' && rr.flag.reason === 'patch-rejected' && /E50/.test(rr.flag.detail) && bytes() === b1, 'write-time E50 (file changed under us) → patch-rejected, bytes unchanged');
  IO.write(zf, real());   // คืนใบที่ลายเซ็นถูกให้เทสถัดไป
  // R7: evaluated รวมใบ v3 → flag เก่าของใบ v3 เคลียร์ได้ · ใบที่ข้ามเพราะตลาดเปิดคง flag
  const entries = RS.list(tmp);
  t.eq([...U.evaluatedOf(entries, [])].sort(), ['AAPL', 'ZTS'], 'R7: evaluated includes v3 symbols');
  t.eq([...U.evaluatedOf(entries, ['ZTS'])], ['AAPL'], 'intraday-skipped v3 symbol is not evaluated');
  const ff = path.join(fdir, 'price-flags.json');
  fs.writeFileSync(ff, JSON.stringify([{ symbol: 'ZTS', reason: 'drift-gt-15pct', flaggedAt: '2026-09-20' }]));
  const cf = { file: ff, write: false, frozenAll: [], failed: [], quietSyms: new Set(), aliveConfirmed: new Set(), reportExists: RS.symbols(tmp) };
  t.eq(U.commitFlags({ ...cf, evaluated: U.evaluatedOf(entries, []) }), [], 'R7: an old v3 flag clears once the v3 report is evaluated clean');
  t.eq(U.commitFlags({ ...cf, evaluated: U.evaluatedOf(entries, ['ZTS']) }).map((f) => f.symbol), ['ZTS'], 'intraday-skipped v3 keeps its flag');
  // --heal-derived (R7)
  const isV3 = (s) => RS.kindOf(s, tmp) === 'v3';
  t(/ZTS/.test(U.healV3Refusal(new Set(['ZTS']), isV3) || ''), '--heal-derived <v3> → refusal (main exits 1)');
  { const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
    try { U.healDerived({ dir: tmp, only: new Set(), write: false, prose: false }); } finally { console.log = orig; }
    t(logs.some((l) => /heal-derived ข้าม 1 ใบ v3/.test(l)) && !logs.some((l) => /⛔ ZTS/.test(l)), 'heal-derived sweep: v3 skipped with a count line (never parsed as HTML)'); }
} finally { for (const d of [tmp, fdir]) if (d) fs.rmSync(d, { recursive: true, force: true }); }

// ── controller note 2: throw จาก writeMarket ที่ไม่มี .codes (ไม่ใช่ gate) = patch-failed (plumbing) ไม่ใช่ patch-rejected ──
{ let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-cron-pf-'));
    const gone = path.join(dir, 'ZTS.json');   // ไม่มีไฟล์บนดิสก์ ⇒ IO.read ใต้ lock = ENOENT (err ไม่มี .codes)
    const r = U.applyV3(gone, plan(real(), quote(73.456)), { seeds, today, write: true });
    t(r.kind === 'freeze' && r.flag.reason === 'patch-failed' && /ENOENT/.test(r.flag.detail) && !fs.existsSync(gone) && /patch fail \(v3\)/.test(r.line),
      'write-time throw without .codes (ENOENT) → patch-failed (plumbing bucket), nothing written');
    t(!fs.existsSync(gone + '.lock'), 'write-time throw releases the lock');
  } finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }); } }

// ── controller note 3: quoteDate = วันตาม tz ตลาด (+7 ชม. ของ SET) ไม่ใช่วัน UTC ──
{ const MK = require('../../tools/v3/market.js');
  const bbl = () => JSON.parse(JSON.stringify(require('../fixtures/v3/BBL-real.json')));   // THB · px 197.5 · priceDate 2026-09-22
  const T = Date.UTC(2026, 8, 22, 18, 0, 0) / 1000;   // 22 ก.ย. 18:00 UTC = 23 ก.ย. 01:00 น. กรุงเทพ
  t.eq(MK.quoteDate({ marketTime: T, gmtoffset: 7 * 3600 }), '2026-09-23', 'quoteDate +7h: UTC late evening → next day in Bangkok');
  const b = bbl();
  const qb = { price: 197.5, currency: 'THB', marketTime: T, gmtoffset: 7 * 3600, regularStart: T - 6 * 3600, regularEnd: T - 3600,
    week52Low: 147, week52High: 204, bars: b.market.chart.data.map((p, i) => ({ ts: mid(i), close: p[1] })) };
  const p = U.planV3(b, qb, chartOf(qb), { seeds, today: '2026-09-23', nowSec: T + 3600 });
  t(p.kind === 'write' && p.next.market.priceDate === '2026-09-23',
    'SET quote at +7h: same px but the Bangkok market day is new → write with priceDate 2026-09-23 (a UTC date would read "unchanged")', JSON.stringify({ k: p.kind, r: p.reason, d: p.detail })); }

// ── บรรทัดสรุป + #49 residue ──
t(/(^|\s)v3-lane: 2 ใบ/.test(U.v3LaneLine({ n: 2, write: 1, unchanged: 1, freeze: 0, intraday: 0, dead: 0 })), 'summary token "v3-lane: N" (grep in the Actions log — R11 f)');
{ const src = fs.readFileSync(path.join(ROOT, 'tools', 'update-prices.js'), 'utf8');
  t(!src.includes('/\\.html$/i.test(f)'), '#49 residue closed: no .html-only readdir filter left in update-prices.js');
  t(!/\bv3Guard\b|\bv3SweepNotice\b|\bv3Refusal\b/.test(src), 'v3Guard/v3Refusal/v3SweepNotice removed from update-prices.js'); }

t.done();
