#!/usr/bin/env node
'use strict';
/**
 * fetch-facts.js — ดึงข้อเท็จจริงราคา/กราฟจาก Yahoo แบบ deterministic ให้ agent วิเคราะห์หุ้น
 * (token-lean: agent ไม่ต้อง WebFetch Yahoo เอง ไม่ต้องคำนวณกราฟ/ป้าย %/bounds เอง — copy ไปวางได้เลย)
 *
 * ใช้:  node tools/fetch-facts.js SYMBOL [--th]
 *   --th = หุ้นไทย (ยิง Yahoo เป็น SYMBOL.BK) — ★ ต้องระบุเอง กัน ticker ไทยชนชื่อหุ้น US (เคส AIT/ORI)
 *
 * พิมพ์: ราคาปัจจุบัน + วันที่ราคา (ไทย พ.ศ./ค.ศ.) + currency + chart.data ≤13 จุด (จุดท้าย=ราคาปัจจุบัน)
 *   + ป้าย .chg % รอบปี + สี chgBg/chgColor + bounds (min/max/grid ยังไม่รวม fairLine) + กรอบ 52 สัปดาห์โดยประมาณ
 *
 * ที่มาไม่ใช่ 2 แหล่ง: นี่คือแหล่ง Yahoo 1 แหล่ง — agent ยัง cross-verify ราคา/EPS กับแหล่งอิสระที่ 2 ตามกติกาเดิม
 */
const { fetchChart, buildChartData, niceBounds, annualChg, toYahooSymbol, styledRD, THAI_MONTHS } = require('./update-prices.js');

const UP = { bg: 'var(--green-soft)', col: '#137333' };
const DOWN = { bg: 'var(--red-soft)', col: '#c5221f' };

async function main() {
  const args = process.argv.slice(2);
  const th = args.includes('--th');
  const symbol = (args.find((a) => !a.startsWith('--')) || '').toUpperCase();
  if (!symbol) { console.error('ใช้: node tools/fetch-facts.js SYMBOL [--th]'); process.exit(1); }

  const currency = th ? 'THB' : 'USD';
  const q = await fetchChart(toYahooSymbol(symbol, currency));
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
  console.log(`\nchart (วางใน report-data — ★ ถ้า fairLine หลุดช่วง min/max ให้คำนวณ bounds ใหม่รวม FV):`);
  console.log(styledRD({ data: chartData, min: b.min, max: b.max, grid: b.grid }));
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
