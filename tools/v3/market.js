'use strict';
/**
 * market.js — ตัวสร้าง `market` ของใบ v3 ตัวเดียว (spec §7 · Plan 3 ruling R3)
 *   cron (tools/update-prices.js planV3) และ prep (tools/fetch-facts.js factsJson → tools/queue/sidecar.js) ใช้ตัวนี้
 *   ⇒ quote เดียวกัน = market เดียวกัน (test/v3/sidecar.test.js ยืนยัน) · ส่วนบริสุทธิ์: ไม่ยิง network ไม่อ่านไฟล์
 *   ★ ห้าม require tools/update-prices.js · build.js · test/* (กติกา cycle ของ tools/v3) — ผู้เรียกส่ง chartData ที่สร้างแล้วมาเอง
 *   นโยบายคงค่า (R3): range52w = Yahoo 52wk เมื่อใช้ได้ ไม่งั้นคงของเดิม · chgSuffix/gridFmt/dataFmt คงของเดิม
 *     (prev = null = ใบใหม่ของ prep → คำนวณ chgSuffix จากช่วงของ bars ครั้งเดียว)
 */
const { THAI_MONTHS } = require('../price-date.js');

const MAX_PTS = 13;          // กราฟรายเดือน ~1 ปี (E37 · schema market.chart.data 2–13 จุด)
const IPO_SPAN_DAYS = 320;   // bars สั้นกว่านี้ = ข้อมูลจริง < ~1 ปี → "ตั้งแต่ IPO" (เกณฑ์เดียวกับป้าย .chg ของ fetch-facts โหมดข้อความ)
const round2 = (v) => Math.round(v * 100) / 100;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** กรอบ 52 สัปดาห์ที่ schema รับ (lo > 0 · hi ≥ lo) → { lo, hi } · ใช้ไม่ได้ = null — กติกาเดียวของ cron และ sidecar (vendor 52wk) */
const validRange = (lo, hi) => (isNum(lo) && isNum(hi) && lo > 0 && hi >= lo ? { lo, hi } : null);
/** วันที่ราคา (ISO) = วันของ regularMarketTime ตาม tz ตลาด — วันหยุดได้วันปิดล่าสุดจริง (สูตรเดียวกับ cron v2 · factsJson เดิม) */
const quoteDate = (q) => new Date((q.marketTime + (q.gmtoffset || 0)) * 1000).toISOString().slice(0, 10);
const labelOf = (iso) => `${THAI_MONTHS[Number(iso.slice(5, 7)) - 1]}${iso.slice(2, 4)}`;

/** price-only fallback (ย้ายจาก update-prices.js patchReport — ทาง v2 เรียกตัวนี้ด้วย): Yahoo ไม่มีประวัติพอ / bad-chart + --force
 *  → คงกราฟเดิม · จุดท้ายเดือนเดียวกับวันที่ราคา = แทนค่า · คนละเดือน = ต่อจุดใหม่แล้วตัดหัวให้ ≤ MAX_PTS · กราฟเดิมใช้ไม่ได้ = throw */
function priceOnlyChart(oldData, price, iso) {
  if (!Array.isArray(oldData) || oldData.length < 2) throw new Error('กราฟใหม่ไม่พอจุด และกราฟเดิมใช้ไม่ได้');
  const lab = labelOf(iso);
  let data = oldData.map((d) => [d[0], d[1]]);
  if (data[data.length - 1][0] === lab) data[data.length - 1][1] = round2(price);
  else data = data.concat([[lab, round2(price)]]).slice(-MAX_PTS);
  return data;
}

/** market ของใบ v3 จาก quote ของ fetchChart (ส่วนบริสุทธิ์)
 *  prev = market เดิมของใบ (cron) หรือ null (prep ใบใหม่) · chartData = ผลของ buildChartData (รายเดือน/รายสัปดาห์) หรือ null
 *  opts.priceOnly = true → ไม่ใช้ chartData (bad-chart + --force: ห้ามเขียนกราฟจากซีรีส์ผสมสองฐาน)
 *  ลำดับคีย์ = ของ sidecar (px, priceDate, chart, chgSuffix, range52w) ⇒ diff ของไฟล์จริงไม่สลับบรรทัด
 *  range52w: ไม่มีทั้ง Yahoo และของเดิม = ไม่ใส่คีย์ (schema optional · factsJson แปลงเป็น null ให้ sidecar) */
function marketFromQuote(prev, q, chartData, opts) {
  const o = opts || {};
  if (!isNum(q.price) || q.price <= 0) throw new Error(`ราคาใช้ไม่ได้: ${q.price}`);
  const priceDate = quoteDate(q);
  const data = !o.priceOnly && Array.isArray(chartData) && chartData.length >= 2
    ? chartData.map((d) => [d[0], d[1]])
    : priceOnlyChart(prev && prev.chart && prev.chart.data, q.price, priceDate);
  const chart = { data };
  if (prev && prev.chart && prev.chart.gridFmt != null) chart.gridFmt = prev.chart.gridFmt;
  if (prev && prev.chart && prev.chart.dataFmt != null) chart.dataFmt = prev.chart.dataFmt;
  const bars = q.bars || [];
  const spanDays = bars.length >= 2 ? (bars[bars.length - 1].ts - bars[0].ts) / 86400 : 0;
  const chgSuffix = prev && prev.chgSuffix ? prev.chgSuffix : spanDays < IPO_SPAN_DAYS ? 'ตั้งแต่ IPO' : 'รอบปี';
  const out = { px: round2(q.price), priceDate, chart, chgSuffix };
  const range = validRange(q.week52Low, q.week52High) || (prev && prev.range52w) || null;
  if (range) out.range52w = range;
  return out;
}

module.exports = { marketFromQuote, priceOnlyChart, validRange, quoteDate, MAX_PTS };
