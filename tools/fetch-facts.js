#!/usr/bin/env node
'use strict';
/**
 * fetch-facts.js — ดึงข้อเท็จจริงราคา/กราฟจาก Yahoo แบบ deterministic ให้ agent วิเคราะห์หุ้น
 * (token-lean: agent ไม่ต้อง WebFetch Yahoo เอง ไม่ต้องคำนวณกราฟ/ป้าย %/bounds เอง — copy ไปวางได้เลย)
 *
 * ใช้:  node tools/fetch-facts.js SYMBOL [--th] [--json]
 *   --th = หุ้นไทย (ยิง Yahoo เป็น SYMBOL.BK) — ★ ต้องระบุเอง กัน ticker ไทยชนชื่อหุ้น US (เคส AIT/ORI)
 *   --json = พิมพ์ JSON บรรทัดเดียวให้ sidecar ของ prep (spec §6.4) แทนบล็อกข้อความ
 *
 * พิมพ์: ราคาปัจจุบัน + วันที่ราคา (ไทย พ.ศ./ค.ศ.) + currency + chart.data ≤13 จุด (จุดท้าย=ราคาปัจจุบัน)
 *   + ป้าย .chg % รอบปี + สี chgBg/chgColor + bounds (min/max/grid ยังไม่รวม fairLine) + กรอบ 52 สัปดาห์โดยประมาณ
 *
 * ที่มาไม่ใช่ 2 แหล่ง: นี่คือแหล่ง Yahoo 1 แหล่ง — agent ยัง cross-verify ราคา/EPS กับแหล่งอิสระที่ 2 ตามกติกาเดิม
 */
const { fetchChart, buildChartData, niceBounds, annualChg, toYahooSymbol, styledRD, detectMixedBasis, THAI_MONTHS } = require('./update-prices.js');

const UP = { bg: 'var(--green-soft)', col: '#137333' };
const DOWN = { bg: 'var(--red-soft)', col: '#c5221f' };

// รหัสตลาดของ Yahoo (meta.exchangeName) → รหัสที่รายงานใช้ (NYSE/NASDAQ/SET) · ไม่รู้จัก = null (init เว้น TODO ให้ worker ตัดสิน)
// ★ ห้ามใช้ fullExchangeName (ชื่อแสดงผล "NasdaqGS"/"Thailand") · MAI ไม่เดา — Yahoo ไม่แยกกระดานให้เชื่อได้
const EXCHANGE_CODES = { NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ', NYQ: 'NYSE', SET: 'SET' };
function exchangeCode(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(EXCHANGE_CODES, code) ? EXCHANGE_CODES[code] : null;
}

/** ข้อมูลเครื่องอ่านของ sidecar (spec §6.4 · ส่วนบริสุทธิ์ — q = ผลของ fetchChart) · chart = data อย่างเดียว (min/max/grid → compute คิดเอง)
 *  priceDate = วันของ regularMarketTime ตาม tz ตลาด (ISO) · range52w = 52wk ของ Yahoo meta (ไม่ใช่ปิดรายเดือน — M7) */
function factsJson(q, symbol, currency) {
  const data = buildChartData(q.bars, q.price, q.gmtoffset);
  const spanDays = q.bars.length >= 2 ? (q.bars[q.bars.length - 1].ts - q.bars[0].ts) / 86400 : 0;
  const priceDate = new Date((q.marketTime + q.gmtoffset) * 1000).toISOString().slice(0, 10);
  const lo = q.week52Low, hi = q.week52High;
  return {
    symbol, currency, quoteCurrency: q.currency || null, px: q.price, priceDate, chart: { data },
    chgSuffix: spanDays < 320 ? 'ตั้งแต่ IPO' : 'รอบปี',   // เกณฑ์เดียวกับป้าย .chg ของโหมดข้อความ
    range52w: Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo ? { lo, hi } : null,
    company: q.longName || null, exchange: exchangeCode(q.exchangeName),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const th = args.includes('--th');
  const symbol = (args.find((a) => !a.startsWith('--')) || '').toUpperCase();
  if (!symbol) { console.error('ใช้: node tools/fetch-facts.js SYMBOL [--th]'); process.exit(1); }

  const currency = th ? 'THB' : 'USD';
  const q = await fetchChart(toYahooSymbol(symbol, currency));

  // ★ ซีรีส์ผสมสองฐาน (split ที่ Yahoo ยังไม่ปรับย้อนหลัง) → **หยุด ไม่พิมพ์กราฟเลย**
  // ถ้าพิมพ์ออกไป agent จะคัดลอกลงรายงานตรง ๆ (นั่นคือหน้าที่ของบล็อกนี้) แล้วได้หน้าผาปลอม
  // + ป้าย % รอบปีพลิกเครื่องหมาย ซึ่ง gate จับไม่ได้ (E36 เทียบป้ายกับปลายกราฟ = ผิดพร้อมกัน)
  // exit 2 = เกณฑ์เดียวกับ prep-stock: ข้อมูลขัดกันจนห้ามเผยแพร่ ต้องมีคนตัดสินก่อน
  const basis = detectMixedBasis({ bars: q.bars, low: q.week52Low, high: q.week52High, gmtoffset: q.gmtoffset });
  if (basis.mixed) {
    console.error(`🛑 BAD-CHART ${symbol}: ${basis.text}`);
    console.error('   ซีรีส์กราฟจาก Yahoo ผสมสองฐาน — ห้ามคัดลอกจุดกราฟ/ป้าย % ไปใช้');
    console.error('   ทำก่อน: ยืนยัน split จากแหล่งปฐมภูมิ (IR / SEC 8-K / ประกาศตลาด) แล้วคูณจุดก่อนวัน split เอง · ดู SKILL STEP 0 หัวข้อ bad-chart');
    process.exit(2);
  }
  if (args.includes('--json')) { console.log(JSON.stringify(factsJson(q, symbol, currency))); return; }   // sidecar (Plan 2b) — ไม่พิมพ์บล็อกข้อความ

  const chartData = buildChartData(q.bars, q.price, q.gmtoffset);
  const prices = chartData.map((d) => d[1]);
  const b = niceBounds(prices, null);
  // IPO ใหม่ = ข้อมูลจริงสั้นกว่า ~1 ปี (ดูช่วงเวลา bars ไม่ใช่จำนวนจุด — 1y/1mo ปกติได้ 12-13 จุด)
  const spanDays = q.bars.length >= 2 ? (q.bars[q.bars.length - 1].ts - q.bars[0].ts) / 86400 : 0;
  const chg = annualChg(chartData, spanDays < 320 ? '(ตั้งแต่ IPO)' : '(รอบปี)');
  const theme = chg.dir === 'up' ? UP : chg.dir === 'down' ? DOWN : null;

  // วันที่ราคา = วันของ regularMarketTime ตาม tz ตลาด (วันหยุดได้วันปิดล่าสุดจริง)
  const md = new Date((q.marketTime + q.gmtoffset) * 1000);
  const d = md.getUTCDate(), mo = THAI_MONTHS[md.getUTCMonth()], ce = md.getUTCFullYear();

  const lo = Math.min(...prices), hi = Math.max(...prices);
  const sym = currency === 'THB' ? '฿' : '$';

  console.log(`${symbol} — Yahoo chart 1y/1mo (แหล่งที่ 1 — ต้อง cross-verify ราคา/EPS กับแหล่งอิสระที่ 2)`);
  console.log(`ราคา: ${sym}${q.price} ${q.currency} · ราคา ณ ${d} ${mo} ${ce + 543} (${d} ${mo} ${ce})`);
  if (q.currency && q.currency !== currency)
    console.log(`⚠ currency จาก Yahoo = ${q.currency} ไม่ตรงที่คาด (${currency}) — เช็ค ticker/--th ให้ถูกก่อนใช้`);
  console.log(`ป้าย .chg: "${chg.text}"${theme ? ` · theme.chgBg "${theme.bg}" · theme.chgColor "${theme.col}"` : ' (ทรงตัว — คงสีกลาง)'}`);
  console.log(`กรอบ 52 สัปดาห์ (จาก monthly close โดยประมาณ): ${sym}${lo} – ${sym}${hi}`);
  console.log(`\nchart (v2: วางใน report-data · v3: อยู่ใน sidecar/market แล้ว — report.js save ใส่ให้เอง ไม่ต้องวาง) — v2: ★ ถ้า fairLine หลุดช่วง min/max ให้คำนวณ bounds ใหม่รวม FV:`);
  console.log(styledRD({ data: chartData, min: b.min, max: b.max, grid: b.grid }));
}

module.exports = { factsJson, exchangeCode, EXCHANGE_CODES };
// ★ guard — test/v3/sidecar.test.js require ไฟล์นี้ (ถ้าไม่ guard จะยิง Yahoo ตอน require)
if (require.main === module) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
