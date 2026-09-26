'use strict';
// v3 audit — numbers the v3 page prints that the v2 page did not (audit.addedNumbersOf: live · twin · invented) · csv/md · v2Market 52-week rounding
const t = require('./_t.js')('audit-added');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const AU = require('../../tools/migrate-v3/audit.js');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
const FIX = path.join(ROOT, 'test', 'fixtures');

// ── addedNumbersOf (unit): synthetic pages · one section per zone ──
const page = (zones) => `<header>${zones.header || ''}</header>` + [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<section><div class="n">${n}</div>${zones['s' + n] || ''}</section>`).join('');
const view = { d: { px: 100, priceDate: { day: 25, yearCE: 2026 }, pe: 20, ps: 3, pbv: 2, yield: 0, mcap: 1e10, mos: 10, scenarios: [] }, chart: { data: [], grid: [] }, gauge: {} };
const doc = { market: { range52w: { lo: 80, hi: 120 } }, fundamentals: { shares: 1e8, dps: 0 } };
const run = (eq, v2z, v3z, st) => AU.addedNumbersOf({ numberAdded: [], zones: [], ...eq }, page(v2z), page(v3z), view, doc, st || []);
const one = (xs, v) => xs.find((x) => x.v === v) || {};
{
  const r = run({ numberAdded: [{ zone: 'header', ins: '52 สัปดาห์ $80.00 – $120.00', ctx: 'กรอบ 52 สัปดาห์ (market.range52w)' }] }, {}, {});
  t(r.length === 1 && r[0].cls === 'live' && r[0].kind === 'range52w', '52-week range (market) → live', JSON.stringify(r));
  // TMAN: P/E median "2567.0x" parsed from the IPO year — the year on the v2 page is not its twin (unit x ≠ plain)
  const tm = run({ numberAdded: [{ zone: 's1', ins: '2567.0x', ctx: '' }] }, { s1: 'P/E เฉลี่ย ~5 ปี N/A — IPO ต.ค. 2567' }, { s1: 'P/E มัธยฐาน ~5 ปี 2567.0x' });
  t(one(tm, 2567).cls === 'invented', 'TMAN: "2567.0x" where v2 printed N/A (IPO year 2567) → invented', JSON.stringify(tm));
  // SNOW: the v2 card printed "N/A" · v3 prints the live P/E from a forward EPS → invented (a live class on a card the author left blank)
  const sn = run({ numberAdded: [{ zone: 's1', ins: '20.0x', ctx: '' }] }, { s1: 'P/E (TTM) N/A' }, { s1: 'P/E (TTM) 20.0x' });
  t(/pe where the v2 card printed no number/.test(one(sn, 20).kind) && one(sn, 20).cls === 'invented', 'price-bound card value where the v2 card had no number → invented', JSON.stringify(sn));
  // dividend 0 on a report that says it pays none (dps 0) → live
  const dz = run({ numberAdded: [{ zone: 's1', ins: '0.00%', ctx: '' }] }, { s1: 'เงินปันผล ไม่มี' }, { s1: 'เงินปันผล 0.00%' });
  t(one(dz, 0).cls === 'live', 'yield 0.00% with fundamentals.dps 0 → live', JSON.stringify(dz));
  // "ทรงตัว" → "+0%/ปี" = the same growth
  const fl = run({ numberAdded: [{ zone: 's6', ins: '+0%/ปี', ctx: '' }] }, { s6: 'Base EPS ทรงตัว $190' }, { s6: 'Base EPS +0%/ปี $190' });
  t(one(fl, 0).cls === 'twin' && one(fl, 0).kind === 'flat-as-0%', '"ทรงตัว" → "+0%/ปี" → twin', JSON.stringify(fl));
  // template label
  const tl = run({ zones: [{ id: 's8', runs: [{ kind: 'text added', del: '', ins: 'เป้านักวิเคราะห์ 12 ด.', ctx: '' }] }] }, { s8: 'เป้านักวิเคราะห์ ~$47' }, { s8: 'เป้านักวิเคราะห์ 12 ด. ~$47' });
  t(one(tl, 12).cls === 'live' && one(tl, 12).kind === 'template-label', '"เป้านักวิเคราะห์ 12 ด." → template label', JSON.stringify(tl));
}
// page sweep: slots EQ.norm strips on both sides (DDM D₁ in a computed mdesc · §6 heading base · template card .d)
{
  const dd = run({}, { s3: '2. DDM D₀ = ปันผล $6.48/ปี g 6%, r 9% $216.00' }, { s3: '2. DDM D₁ = ปันผล $6.11 × (1+g); g 6%, r 9% $216.00' });
  t(one(dd, 6.11).cls === 'invented' && one(dd, 6.11).via === 'page', 'DDM: a back-solved D₀ the author never printed → invented (page sweep)', JSON.stringify(dd));
  const ok = run({}, { s3: 'DDM D₁ = $6.48 / (r − g); g 6%, r 9%' }, { s3: 'DDM D₁ = ปันผล $6.48; g 6%, r 9%' });
  t(!ok.some((x) => x.cls === 'invented'), 'DDM: the author D₁ → nothing added', JSON.stringify(ok));
  const base = run({}, { s6: 'จากจุดเข้า $100.00 • EPS ฐาน FY2026e $8.11 → FY2027e $11.69' }, { s6: 'จากจุดเข้า $100.00 • EPS ฐาน ~$8.09 FY2026e $8.11 → FY2027e $11.69' });
  t(one(base, 8.09).cls === 'invented', '§6 heading: a back-computed base → invented', JSON.stringify(base));
  const ps = run({}, { s3: 'DCF FCF/หุ้น $9.25 โต 8%/ปี' }, { s3: 'DCF FCF $925M โต 8%/ปี' });
  t(one(ps, 925e6).cls === 'twin' && one(ps, 925e6).kind === 'per-share × shares', 'FCF total = the per-share figure × shares → twin', JSON.stringify(ps));
  const sl = run({}, { s3: 'FCF โต +35/+23/+14/+10/+8%' }, { s3: 'FCF โต 35%/ปี 1 ปี → 23%/ปี 1 ปี → 14%/ปี' });
  t(!sl.some((x) => x.cls === 'invented'), 'growth path "+35/+23/…/+8%" (one % for the list) → twins', JSON.stringify(sl));
  const sh = run({}, { s1: 'Market Cap ~$7.35B หุ้นคงเหลือ ~82.5 ล้านหุ้น' }, { s1: 'Market Cap $7.35B ~82.5M หุ้น · หุ้นคงเหลือ ~82.5 ล้านหุ้น' });
  t(!sh.some((x) => x.cls === 'invented'), 'shares "82.5M" ↔ "82.5 ล้านหุ้น" (another unit scale) → twin', JSON.stringify(sh));
  const fv = run({}, { s4: 'Fair Value $233.00' }, { s5: 'โซนเริ่มทยอยสะสม < $233.31' }, [{ key: 'fv', v: 233, step: 1 }]);
  t(!fv.some((x) => x.cls === 'invented'), 'FV within one author step of the v2 figure (authorSteps) → twin', JSON.stringify(fv));
  const lt = run({}, { s2: 'x' }, { s2: 'ราคาย้อนหลัง ~1 ปี' });
  t(!lt.some((x) => x.cls === 'invented'), 'chart title "ราคาย้อนหลัง ~1 ปี" → template label', JSON.stringify(lt));
}
// csv / md carry the list · status INVENTED
{
  const row = { ...AU.emptyRow('X'), status: 'INVENTED', invented: 1, addedList: [{ zone: 's3', v: 6.11, cls: 'invented', kind: 'no v2 source', ins: 'D₁ = ปันผล $6.11', via: 'page' }] };
  const csv = AU.toCsv([row]);
  t(csv.split('\n')[0] === 'symbol,status,valueDiffs,roundingDiffs,textLost,sanity,added,invented,addedList', 'csv header carries added/invented/addedList');
  t(/X,INVENTED,0,0,0,,1,1,invented:no v2 source@s3=6\.11/.test(csv), 'csv row: counts + the classified list', csv);
  const md = AU.toMd([row], { date: 'd', head: 'h', reportsRel: 'r' });
  t(/added numbers — invented \(numbers · reports\) \| 1 · 1/.test(md) && /invented \(1 reports\): X/.test(md) && /- added invented \(no v2 source\) s3: `6\.11`/.test(md), 'md: class counts · invented symbols · per-report lines', md.slice(0, 1500));
}

// ── audit.v2Market: the header's rounded 52-week range ("$229–$413") → the report's own figures when within that rounding ──
{
  const d = JSON.parse(fs.readFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), 'utf8')); delete d._sig;
  d.meta.migratedFrom = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
  const hi = Math.max(...d.market.chart.data.map((p) => p[1])) + 20, lo = Math.min(...d.market.chart.data.map((p) => p[1])) - 5;
  const v2doc = { ...d, market: { ...d.market, range52w: { lo: Math.round(lo), hi: Math.round(hi) } } };
  const raw = R.toV2Source(v2doc, C.compute(v2doc, { seeds: SEEDS }));
  const exact = { lo: Math.round(lo) - 0.37, hi: Math.round(hi) - 0.3 };
  const mk = AU.v2Market('ZTS', raw, { ...d, market: { ...d.market, range52w: exact } }, SEEDS);
  t(mk.range52w && mk.range52w.hi === exact.hi && mk.range52w.lo === exact.lo, 'v2Market: the header rounding of the report range → the report figures (CEG $412.7 not $413.00)', JSON.stringify(mk.range52w));
  const far = AU.v2Market('ZTS', raw, { ...d, market: { ...d.market, range52w: { lo: exact.lo - 10, hi: exact.hi + 10 } } }, SEEDS);
  t(far.range52w && far.range52w.hi === Math.round(hi), 'v2Market: a range outside the rounding → the v2 header figures', JSON.stringify(far.range52w));
}
t.done();
