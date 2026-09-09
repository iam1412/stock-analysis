#!/usr/bin/env node
'use strict';
/**
 * spotcheck.js — ตัวชี้ฝั่ง controller สำหรับสิ่งที่ **gate ตัดสินแทนไม่ได้** (CLAUDE.md §8 ชั้น 0)
 *
 * ต่างจาก `npm test` ตรงเจตนา: check-reports คือ **คำตัดสิน** (error = ห้าม push)
 * ไฟล์นี้คือ **รายการที่คนต้องอ่านเอง** — ทุกข้อมี false positive โดยธรรมชาติ จึงห้ามเอาเข้า gate
 * (ถ้าข้อไหนพิสูจน์ได้ว่าตัดสินอัตโนมัติได้จริง ให้ย้ายไปเป็น E/W code แล้วเพิ่มเคสใน self-test แทน)
 *
 * ใช้: node tools/spotcheck.js ODFL EXPE        # ต่อหุ้น — ตรวจครบทุกข้อ (ใช้ตอนเคลียร์คิว/รันเวฟ)
 *      node tools/spotcheck.js                  # กวาดทั้งคลัง — เฉพาะข้อ 1 (ข้อเตือนอื่นจะกลบของจริง)
 *
 * ★ เวลาเคลียร์คิว price-flags / รันเวฟ: รันตัวนี้ต่อจาก `npm test -- <SYM>` ก่อน commit เสมอ
 *   วัดจริง 9 ก.ย. 2569 (คิว 27 ตัว): gate ผ่าน 43/43 ทุกใบ แต่ตัวนี้จับของจริงได้ 4 ใบ
 *   (GRAB P/E ค้าง · AEHR ขาเป้านักวิเคราะห์ล้า · ODFL สมอตาย · EXPE ตัวคูณปัจจุบันล้า)
 */
const fs = require('fs');
const path = require('path');
const { buildCtx, REPORTS_DIR } = require('../test/check-reports.js');
const { expandReport } = require('../build.js');
const DV = require('./derived-values.js');

const NEAR_PRICE = 0.03;       // ขา FV ห่างราคา ≤3% = สงสัยสมอตาย (ตัวชี้ค้นหา — W18 คือตัวที่ตัดสินได้)
const PROSE_TOL = 0.005;       // ราคาในเนื้อความต่างจากราคาจริง >0.5% = น่าจะค้างจากรอบก่อน
const ANALYST = /เป้านักวิเคราะห์|analyst|consensus|price\s*target/i;
// ★ ตัวเลขต้อง **ตามหลังวลีทันที** (เว้นได้แค่คำเชื่อม) — ห้ามเว้นช่วงกว้าง
//   เดิมยอมข้าม 25 ตัวอักษร ⇒ "ราคาปัจจุบันสูงกว่ามูลค่าเหมาะสมใหม่ $184" ถูกอ่านเป็น "ราคา = $184"
//   ทั้งที่ $184 คือ Fair Value (false positive 3/3 ใบแรกที่ลอง — ODFL/GRAB/EXPE 9 ก.ย. 69)
const PROSE_PRICE = /(?:ราคาปัจจุบัน|ราคาล่าสุด|ราคาหุ้นปัจจุบัน|ณ\s*ราคา|ซื้อขายที่)\s*(?:อยู่ที่|ประมาณ|ราว|คือ|ที่|=|:)?\s*\(?\s*([฿$])\s*([0-9,]+(?:\.[0-9]+)?)/g;

// deep = โหมดต่อหุ้น (ระบุชื่อมา) — เปิดข้อที่เป็น "เตือนให้ไปเช็ค" ด้วย
// โหมดกวาดทั้งคลังเปิดเฉพาะข้อที่เป็นการค้นพบเชิงโครงสร้าง ไม่งั้นรายการเตือนจะกลบของจริง
// (วัด 9 ก.ย. 69: เปิดหมดทั้งคลัง = 838/908 ใบ · เฉพาะข้อ 1 = 254 รายการ ซึ่งคือลิสต์ที่ตั้งใจให้ไล่อ่าน)
function spotcheck(html, name, deep) {
  const c = buildCtx(html, name);
  const px = c.px;
  const out = [];
  if (!(px > 0)) return out;

  // 1. ขา FV ที่ค่าออกมาใกล้ราคาวันนี้ — **ตัวชี้ ไม่ใช่คำตัดสิน** ต้องอ่าน mdesc ว่าตัวคูณมาจากไหน
  //    บังเอิญจริงมีเยอะ (DDM ของ COM7 ไม่รับราคาเป็น input · P/S ของ OKJ อิงช่วง peer)
  //    ⇒ ข้อนี้ยิง ~25% ของคลัง โดยตั้งใจ: มันคือ "รายการให้ไล่อ่าน" ไม่ใช่ของเสีย
  //    ขาที่ W18 ตัดสินได้แล้ว (ตัวคูณเป้า = ตัวคูณปัจจุบัน) ไม่ต้องรายงานซ้ำที่นี่
  for (const m of c.methods || []) {
    if (m.val == null || !m.val) continue;
    if (DV.deadAnchor(m.desc)) continue;                    // W18 จับแล้ว
    const d = (m.val - px) / px;
    if (Math.abs(d) <= NEAR_PRICE)
      out.push(`สมอตาย? ขา "${m.name}" = ${m.val} ห่างราคา ${(d * 100).toFixed(1)}% — อ่าน mdesc ว่าตัวคูณมาจากไหน: ${(m.desc || '').slice(0, 110)}`);
  }

  // 2. ขา FV ที่ยืนบนเป้านักวิเคราะห์ — ต้องเช็คความสดของค่าเฉลี่ย/จำนวนสำนัก
  //    (AEHR 9 ก.ย. 69: ค้างที่ avg $115.00 n=3 ขณะจริง $130.00 n=4 → FV ขยับ $86 → $89)
  //    ★ และถ้าเป็นเป้าที่ "Neutral ยกแผงหลังข่าว" = mark-to-market ห้ามใช้เป็นขา (LULU/MRNA)
  for (const m of deep ? (c.methods || []) : []) {
    if (ANALYST.test(m.name) || ANALYST.test(m.desc || ''))
      out.push(`ขา "${m.name}" ยืนบนเป้านักวิเคราะห์ — ยืนยันค่าเฉลี่ย+จำนวนสำนักกับแหล่งวันนี้ และดูว่าเป็น mark-to-market หลังข่าวหรือไม่`);
  }

  // 3. ราคาที่เขียนค้างในเนื้อความ — cron แตะ prose ไม่ได้ (§9) และ W15 คุมแค่ "% ของราคาเป้า"
  //    ประโยคเล่าประวัติ ("หลังงบ ราคาวิ่งจาก $81 มา $123") เป็น false positive ที่ตัดอัตโนมัติไม่ได้
  const prose = deep ? String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '';
  const seen = new Set();
  let m;
  while ((m = PROSE_PRICE.exec(prose))) {
    const v = parseFloat(m[2].replace(/,/g, ''));
    if (!(v > 0) || seen.has(v)) continue;
    if (Math.abs(v - px) / px > PROSE_TOL) { seen.add(v); out.push(`เนื้อความอ้าง "ราคาปัจจุบัน ${m[1]}${m[2]}" แต่ราคาในไฟล์คือ ${px} — เช็คว่าค้างจากรอบก่อนหรือเป็นการเล่าประวัติ`); }
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2).map((a) => a.replace(/\.html$/i, '').toUpperCase());
  const deep = argv.length > 0;                 // ระบุหุ้น = โหมดต่อหุ้น (ตรวจครบทุกข้อ)
  let files = fs.readdirSync(REPORTS_DIR).filter((f) => /\.html$/i.test(f)).sort();
  if (deep) { const want = new Set(argv); files = files.filter((f) => want.has(f.replace(/\.html$/i, '').toUpperCase())); }
  if (!files.length) { console.error('❌ ไม่พบไฟล์รายงานให้ตรวจ'); process.exit(1); }
  let hit = 0, total = 0;
  for (const f of files) {
    let items;
    try { items = spotcheck(expandReport(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8')), f, deep); }
    catch (e) { console.log(`✗ ${f} — อ่านไม่สำเร็จ: ${e.message}`); continue; }
    if (!items.length) continue;
    hit++; total += items.length;
    console.log(`\n▸ ${f.replace(/\.html$/i, '')}`);
    for (const it of items) console.log(`    · ${it}`);
  }
  console.log(`\n${'─'.repeat(50)}\nspotcheck: ${hit}/${files.length} ใบมีจุดให้อ่าน · ${total} รายการ`);
  if (!deep) console.log('(โหมดกวาดทั้งคลัง — ตรวจเฉพาะ "ขา FV ใกล้ราคา" · ระบุชื่อหุ้นเพื่อตรวจครบทุกข้อ)');
  console.log('⚠️  ทุกข้อเป็น "ตัวชี้" ไม่ใช่คำตัดสิน — ต้องอ่านเองก่อนแก้ (ห้ามใช้เป็น gate)\n');
  process.exit(0);   // ★ ไม่เคย fail — ตัวนี้ไม่ใช่ gate · gate คือ `npm run verify`
}

module.exports = { spotcheck, NEAR_PRICE };
if (require.main === module) main();
