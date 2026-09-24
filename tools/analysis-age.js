#!/usr/bin/env node
'use strict';
/**
 * analysis-age — อายุการวิเคราะห์ต่อไฟล์ (footer "ข้อมูล ณ") เป็นเครื่องมือถาวร
 *   ย้ายมาจาก docs/superpowers/audit/2026-09-11-stock-analyzer/measure-analysis-age.js
 *   (spec §7 อ้างสคริปต์นี้เป็นวิธีวัด KPI "อายุการวิเคราะห์" — เดิมเป็น one-off ใต้ docs/)
 * ใช้ footerDate/ageDays ของ tools/queue/footer-date.js แทน parser ปีไทย/เดือนไทยของตัวเอง
 * (เจ้าของเดียวของ regex "ข้อมูล ณ" — preflight.js ก็ใช้ตัวเดียวกันสำหรับคิวตามอายุ WS6 ข้อ 3)
 *
 * CLI: node tools/analysis-age.js [ISO วันนี้]   (ไม่ใส่ = todayBangkok())
 */
const path = require('path');
const { ageDays, todayBangkok } = require('./queue/footer-date.js');
const RS = require('./report-source.js');   // ใบ v2 + v3 (Plan 2b)

const BUCKETS = [
  ['≤7d', 7], ['8–30', 30], ['31–60', 60], ['61–90', 90], ['91–120', 120], ['>120', Infinity],
];
const bucketOf = (age) => BUCKETS.find(([, max]) => age <= max)[0];

/** อ่านทุกรายงานใต้ dir (ใบ v2 + v3) → จัดกลุ่มตามอายุการวิเคราะห์เทียบกับ today (ISO) — ส่วนบริสุทธิ์
 *  (dir/today รับมาเป็น param เสมอ ไม่มี default ที่ต้องเดา วันที่ไม่ผูกกับ Date.now()) */
function ageBuckets(dir, today) {
  const buckets = Object.fromEntries(BUCKETS.map(([k]) => [k, 0]));
  let unparsed = 0, be = 0, ce = 0;
  const rows = [];
  for (const e of RS.list(dir)) {
    const m = RS.metaLite(e.symbol, dir);   // v2 = footer "ข้อมูล ณ" · v3 = meta.analysisDate + dateEra
    if (!m || !m.analysisDate) { unparsed++; continue; }
    if (m.era === 'BE') be++; else ce++;
    const age = ageDays(m.analysisDate, today);
    rows.push([e.symbol, age]);
    buckets[bucketOf(age)]++;
  }
  rows.sort((a, b) => b[1] - a[1]);   // แก่สุดก่อน
  const ages = rows.map((r) => r[1]).sort((a, b) => a - b);
  const median = ages.length ? ages[Math.floor(ages.length / 2)] : null;
  return { buckets, rows, unparsed, be, ce, median };
}

function main() {
  const today = process.argv[2] || todayBangkok();
  const dir = path.join(__dirname, '..', 'reports');
  const r = ageBuckets(dir, today);
  console.log(`analysis-date age buckets (${today}):`, JSON.stringify(r.buckets), '· อ่านไม่ออก:', r.unparsed);
  console.log('footer calendar: พ.ศ.=' + r.be + ' ค.ศ.=' + r.ce);
  console.log('oldest 10:', r.rows.slice(0, 10).map((row) => row[0] + ':' + row[1] + 'd').join(' '));
  console.log('median age days:', r.median);
}

if (require.main === module) main();
module.exports = { ageBuckets, BUCKETS, bucketOf };
