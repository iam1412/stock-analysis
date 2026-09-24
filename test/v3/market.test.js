'use strict';
// Plan 3 Task 1 — tools/v3/market.js ตัวสร้าง market ตัวเดียว (spec §7 · R3) · offline ล้วน
const t = require('./_t.js')('market');
const MK = require('../../tools/v3/market.js');
const S = require('../../tools/v3/schema.js');
const ZTS = require('../fixtures/v3/ZTS-real.json');

const mid = (i) => Date.UTC(2025, 9 + i, 15) / 1000;   // กลางเดือน ต.ค.25 … ก.ย.26 — ไม่ให้ gmtoffset ลากข้ามเดือน
const bars = ZTS.market.chart.data.map((p, i) => ({ ts: mid(i), close: p[1] }));
const T22 = Date.UTC(2026, 8, 22, 20, 0, 0) / 1000;    // 22 ก.ย. 69 16:00 ET
const q = { price: 73.456, currency: 'USD', marketTime: T22, gmtoffset: -4 * 3600, week52Low: 69.5, week52High: 148.79, bars };
const data = ZTS.market.chart.data.slice(0, 11).concat([['ก.ย.26', 73.46]]);
const prev = { ...ZTS.market, chgSuffix: 'ตั้งแต่ IPO', chart: { ...ZTS.market.chart, gridFmt: 'v.toFixed(0)', dataFmt: 'd[1].toFixed(1)' } };

{ const m = MK.marketFromQuote(prev, q, data);
  t.eq(Object.keys(m), ['px', 'priceDate', 'chart', 'chgSuffix', 'range52w'], 'key order = sidecar order (no line shuffle in the file diff)');
  t.eq([m.px, m.priceDate], [73.46, '2026-09-22'], 'px round2 · priceDate = ISO of marketTime + gmtoffset (market-local day)');
  t.eq(m.chart, { data, gridFmt: 'v.toFixed(0)', dataFmt: 'd[1].toFixed(1)' }, 'chart.data = the given series · gridFmt/dataFmt kept from prev');
  t.eq(m.chgSuffix, 'ตั้งแต่ IPO', 'chgSuffix kept from prev (v2 behaviour — recomputed only at prep)');
  t.eq(m.range52w, { lo: 69.5, hi: 148.79 }, 'range52w = Yahoo 52wk when valid');
  t.eq(S.validate({ ...ZTS, market: m }), [], 'result passes the schema market block'); }

// range52w: Yahoo หาย/เสีย → คงของเดิม (การ์ด/โทเคน range52w throw ถ้าไม่มี = E51 → patch-rejected ทุกวัน)
for (const [lo, hi, why] of [[undefined, 150, 'lo missing'], [0, 150, 'lo 0'], [80, 70, 'hi < lo'], [NaN, NaN, 'NaN']])
  t.eq(MK.marketFromQuote(prev, { ...q, week52Low: lo, week52High: hi }, data).range52w, prev.range52w, `range52w: Yahoo ${why} → prev kept`);
t(!('range52w' in MK.marketFromQuote({ ...prev, range52w: undefined }, { ...q, week52Low: undefined }, data)), 'range52w: none anywhere → key absent (schema optional)');
t.eq([MK.validRange(1, 2), MK.validRange(0, 2), MK.validRange(3, 2), MK.validRange(null, 2)], [{ lo: 1, hi: 2 }, null, null, null], 'validRange: lo > 0 and hi ≥ lo only');

// prep (prev = null): chgSuffix จากช่วงของ bars · ไม่มีคีย์ fmt
t.eq(MK.marketFromQuote(null, q, data).chgSuffix, 'รอบปี', 'prep: ≥ 320 days of bars → รอบปี');
t.eq(MK.marketFromQuote(null, { ...q, bars: bars.slice(-5) }, data).chgSuffix, 'ตั้งแต่ IPO', 'prep: < 320 days of bars → ตั้งแต่ IPO');
t.eq(Object.keys(MK.marketFromQuote(null, q, data).chart), ['data'], 'prep: chart = data only');

// price-only (ไม่มีกราฟใหม่ / bad-chart + --force)
{ const po = MK.marketFromQuote(prev, q, null);
  t.eq(po.chart.data.length, 12, 'price-only: same month as the last point → replace (length kept)');
  t.eq(po.chart.data[11], ['ก.ย.26', 73.46], 'price-only: last point = new px');
  t.eq(po.chart.data.slice(0, 11), ZTS.market.chart.data.slice(0, 11), 'price-only: older points untouched'); }
{ const oct = { ...q, marketTime: Date.UTC(2026, 9, 2, 20, 0, 0) / 1000 };
  const po = MK.marketFromQuote(prev, oct, null);
  t.eq([po.chart.data.length, po.chart.data[0][0], po.chart.data[12]], [13, 'ต.ค.25', ['ต.ค.26', 73.46]], 'price-only: new month → append (13 points)');
  const p13 = { ...prev, chart: { data: [['ก.ย.25', 150]].concat(ZTS.market.chart.data) } };
  const po13 = MK.marketFromQuote(p13, oct, null);
  t.eq([po13.chart.data.length, po13.chart.data[0][0]], [13, 'ต.ค.25'], 'price-only: 14th point → oldest dropped (≤ 13 · E37)'); }
t.eq(MK.marketFromQuote(prev, q, data, { priceOnly: true }).chart.data.slice(0, 11), ZTS.market.chart.data.slice(0, 11), 'opts.priceOnly ignores the given series (bad-chart + --force)');
t.throws(() => MK.marketFromQuote(null, q, null), /กราฟเดิมใช้ไม่ได้/, 'price-only without an old chart → throw (cron: patch-failed)');
t.throws(() => MK.marketFromQuote(prev, { ...q, price: 0 }, data), /ราคาใช้ไม่ได้/, 'price ≤ 0 → throw');
t.eq(MK.priceOnlyChart([['ส.ค.26', 1], ['ก.ย.26', 2]], 3.456, '2026-09-30'), [['ส.ค.26', 1], ['ก.ย.26', 3.46]], 'priceOnlyChart: label from the ISO month (CE 2-digit)');

// ★ golden (controller note 1): priceOnlyChart = บล็อก inline เดิมของ update-prices.js patchReport (ก่อน Plan 3 · a7d85bc19 :432–439) ทุกไบต์
//   ค่าคาดหวังข้างล่างได้จากการรันบล็อกเดิม verbatim ก่อนแก้ (ไม่ใช่จากโค้ดใหม่) · refPriceOnly = สำเนาบล็อกเดิม (รับ dateParts ไม่ใช่ ISO)
{ const { THAI_MONTHS } = require('../../tools/price-date.js');
  const RV = require('../../tools/report-values.js');
  const round = (v, d) => { const k = Math.pow(10, d); return Math.round(v * k) / k; };
  function refPriceOnly(old, newPrice, dateParts) {
    if (!Array.isArray(old) || old.length < 2) throw new Error('กราฟใหม่ไม่พอจุด และกราฟเดิมใช้ไม่ได้');
    const lab = `${THAI_MONTHS[dateParts.monIdx]}${String(dateParts.yearCE).slice(-2)}`;
    let chartData = old.map((d) => [d[0], d[1]]);
    if (chartData[chartData.length - 1][0] === lab) chartData[chartData.length - 1][1] = round(newPrice, 2);
    else chartData = chartData.concat([[lab, round(newPrice, 2)]]).slice(-13);
    return chartData;
  }
  const po = (old, px, dp) => MK.priceOnlyChart(old, px, RV.isoOf(dp));
  const d12 = [['ต.ค.25', 100], ['พ.ย.25', 101], ['ธ.ค.25', 102], ['ม.ค.26', 103], ['ก.พ.26', 104], ['มี.ค.26', 105],
    ['เม.ย.26', 106], ['พ.ค.26', 107], ['มิ.ย.26', 108], ['ก.ค.26', 109], ['ส.ค.26', 110], ['ก.ย.26', 111]];
  const d2 = [['ส.ค.26', 1], ['ก.ย.26', 2]];
  t.eq([
    po(d2, 3.456, { day: 30, monIdx: 8, yearCE: 2026 }),
    po(d2, 3.455, { day: 2, monIdx: 9, yearCE: 2026 }),
    po([['ก.ย.25', 99]].concat(d12), 50.005, { day: 1, monIdx: 9, yearCE: 2026 }),
    po(d12, 1.005, { day: 22, monIdx: 8, yearCE: 2026 }),
  ], [
    [['ส.ค.26', 1], ['ก.ย.26', 3.46]],
    [['ส.ค.26', 1], ['ก.ย.26', 2], ['ต.ค.26', 3.46]],
    [['ต.ค.25', 100], ['พ.ย.25', 101], ['ธ.ค.25', 102], ['ม.ค.26', 103], ['ก.พ.26', 104], ['มี.ค.26', 105], ['เม.ย.26', 106],
      ['พ.ค.26', 107], ['มิ.ย.26', 108], ['ก.ค.26', 109], ['ส.ค.26', 110], ['ก.ย.26', 111], ['ต.ค.26', 50.01]],
    [['ต.ค.25', 100], ['พ.ย.25', 101], ['ธ.ค.25', 102], ['ม.ค.26', 103], ['ก.พ.26', 104], ['มี.ค.26', 105], ['เม.ย.26', 106],
      ['พ.ค.26', 107], ['มิ.ย.26', 108], ['ก.ค.26', 109], ['ส.ค.26', 110], ['ก.ย.26', 1]],
  ], 'golden: priceOnlyChart = literal output of the old inline v2 block (replace · append · drop-oldest · round 2 dp)');
  const errs = [[['ก.ย.26', 2]], [], undefined, null, 'x'].map((old) => { try { po(old, 3, { day: 1, monIdx: 8, yearCE: 2026 }); return null; } catch (e) { return e.message; } });
  t.eq(errs, Array(5).fill('กราฟใหม่ไม่พอจุด และกราฟเดิมใช้ไม่ได้'), 'golden: same error text as the old block (< 2 points / not an array)');
  const diffs = []; const frozen = JSON.stringify(d12);
  for (let y = 2025; y <= 2027; y++) for (let mi = 0; mi < 12; mi++) for (const px of [0.015, 1.005, 12.345, 73.456, 1234.5678])
    for (const old of [d2, d12, [['ก.ย.25', 99]].concat(d12)]) {
      const dp = { day: 28, monIdx: mi, yearCE: y };
      if (JSON.stringify(po(old, px, dp)) !== JSON.stringify(refPriceOnly(old, px, dp))) diffs.push(`${y}-${mi + 1} ${px} n=${old.length}`);
    }
  t.eq([diffs.length, diffs.slice(0, 3), JSON.stringify(d12) === frozen], [0, [], true], 'golden: priceOnlyChart = old block over 3 years × 12 months × 5 prices × 3 shapes · input not mutated'); }

t.done();
