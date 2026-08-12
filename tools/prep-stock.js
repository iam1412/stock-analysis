#!/usr/bin/env node
'use strict';
/**
 * prep-stock.js — pre-fetch pack ต่อหุ้นใน 1 คำสั่ง สำหรับ controller เตรียม {{FUNDAMENTALS}}
 * (แทนการรัน fetch-facts + fetch-fundamentals แยก แล้วให้ AI ตีความ Δ เอง)
 *
 * spawn สคริปต์เดิมเป็น child process (facts+fundamentals ขนานกัน) แล้วต่อ output เป็น block เดียว
 * พร้อมวางลง agent-prompt · บรรทัดแรก = CROSS-VERIFY verdict แบบ deterministic:
 *   Δ ราคา ≤2% → ✅ ผ่าน · 2–5% → ⚠ ตรวจเพิ่ม · >5% → 🛑 หยุดตาม CLAUDE.md §2 + exit 2
 *   Δ EPS ≤2% → ✅ · เกิน/เทียบไม่ได้ → ⚠ ให้ agent ตรวจ dil/basic/งวด (ไม่ hard-fail)
 *
 * ใช้:  node tools/prep-stock.js SYMBOL [--th] [--update] [--brand "#rrggbb"]
 *   --th     = หุ้นไทย (ส่งต่อให้ทุกสคริปต์ลูก)
 *   --update = โหมด UPDATE — ข้าม fetch-facts (ราคา/กราฟมาจาก update-prices --write --force แล้ว)
 *   --brand  = ต่อ pick-brand --auto ให้ด้วย (ปกติ worker เลือกสีแบรนด์เอง — สีโลโก้ไม่ deterministic)
 * exit: 0 ปกติ/warn · 1 usage ผิด/ล้มทุกแหล่ง · 2 = ราคาขัดแหล่ง >5% (ห้ามเผยแพร่ — ถามผู้ใช้)
 */
const path = require('path');
const { execFile } = require('child_process');

const PRICE_PASS_PCT = 2;  // Δ ราคาสองแหล่ง ≤2% = ผ่าน (เกณฑ์เดียวกับบรรทัด Δ ของ fetch-fundamentals)
const PRICE_STOP_PCT = 5;  // >5% = invariant CLAUDE.md §2 "หยุด ถามผู้ใช้ อย่าเผยแพร่"
const EPS_PASS_PCT = 2;    // Δ EPS(TTM) ≤2% = ตรงกัน

// ---------- อ่าน Δ จาก output ของ fetch-fundamentals (format ของเราเอง — test คุมไม่ให้หลุด sync) ----------
function parseDeltas(text) {
  if (/ได้แหล่งเดียว/.test(text)) return { dP: null, dE: null, single: true };
  const mP = text.match(/Δ ราคา=([\d.]+)%/);
  const mE = text.match(/Δ EPS\(TTM\)=([\d.]+)%/);
  return {
    dP: mP ? parseFloat(mP[1]) : null,
    dE: mE ? parseFloat(mE[1]) : null,
    single: false,
  };
}

// ---------- verdict ----------
function verdict({ dP, dE, single }) {
  if (single || dP == null)
    return { exitCode: 0, text: '⚠ CROSS-VERIFY: ได้แหล่งเดียว — ต้องยืนยันราคา/EPS กับแหล่งอิสระที่ 2 เอง (WebFetch targeted) ก่อนเขียนตัวเลข' };
  const lines = [];
  let exitCode = 0;
  if (dP <= PRICE_PASS_PCT) lines.push(`✅ ราคา 2 แหล่งต่าง ${dP}% (≤${PRICE_PASS_PCT}%) — ผ่าน`);
  else if (dP <= PRICE_STOP_PCT) lines.push(`⚠ ราคา 2 แหล่งต่าง ${dP}% (${PRICE_PASS_PCT}–${PRICE_STOP_PCT}%) — ตรวจวันที่ราคา/intraday ก่อนใช้`);
  else { exitCode = 2; lines.push(`🛑 ราคา 2 แหล่งต่าง ${dP}% (>${PRICE_STOP_PCT}%) — หยุดตาม CLAUDE.md §2: ถามผู้ใช้ อย่าเผยแพร่ (exit 2)`); }
  if (dE == null) lines.push('⚠ EPS(TTM) เทียบไม่ได้ — ยืนยัน EPS กับแหล่งที่ 2 เองก่อนเขียน');
  else if (dE <= EPS_PASS_PCT) lines.push(`✅ EPS(TTM) ต่าง ${dE}% (≤${EPS_PASS_PCT}%) — ตรงกัน`);
  else lines.push(`⚠ EPS(TTM) ต่าง ${dE}% (>${EPS_PASS_PCT}%) — ขัดกัน ตรวจ dil/basic/งวดตาม SKILL STEP 2 ก่อนเขียน (อย่าเดา)`);
  return { exitCode, text: lines.join('\n') };
}

// ---------- args ----------
function parseArgs(argv) {
  const th = argv.includes('--th');
  const update = argv.includes('--update');
  let brand = null;
  const bi = argv.indexOf('--brand');
  if (bi !== -1) {
    brand = argv[bi + 1] || null;
    if (!brand || !/^#[0-9a-fA-F]{6}$/.test(brand))
      return { error: '--brand ต้องเป็น "#rrggbb"' };
  }
  const symbol = (argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--brand') || '').toUpperCase();
  if (!symbol) return { error: 'ใช้: node tools/prep-stock.js SYMBOL [--th] [--update] [--brand "#rrggbb"]' };
  return { symbol, th, update, brand, error: null };
}

// ---------- spawn สคริปต์ลูก (คืน {out, err, code} — ไม่ throw ให้ caller ตัดสินเอง) ----------
function runTool(script, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(__dirname, script), ...args], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ out: stdout.trim(), err: stderr.trim(), code: error ? (error.code || 1) : 0 }));
  });
}

// ---------- print หลังรู้ v.exitCode แล้ว — กลืน error เงียบ ๆ (เช่น EPIPE ตอน stdout ถูกตัดกลางทาง) ----------
// ห้ามให้ throw หลุดไปโดน main().catch() ท้ายไฟล์ เพราะ handler นั้น exit 1 เสมอ — จะกลืน exit 2
// (invariant "หยุดเผยแพร่" ของ CLAUDE.md §2) กลายเป็น exit 1 ธรรมดาที่ controller ไม่รู้จัก
function safeLog(s) {
  try { console.log(s); } catch (_) {}
}

// ---------- main ----------
async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.error) { console.error(a.error); process.exit(1); }
  const thArg = a.th ? ['--th'] : [];

  const jobs = [runTool('fetch-fundamentals.js', [a.symbol, ...thArg])];
  if (!a.update) jobs.push(runTool('fetch-facts.js', [a.symbol, ...thArg]));
  const [fund, facts] = await Promise.all(jobs);

  if (fund.code !== 0 && (!facts || facts.code !== 0)) {
    console.error(`✗ ล้มทุกแหล่ง — fundamentals: ${fund.err || 'exit ' + fund.code}${facts ? ` · facts: ${facts.err || 'exit ' + facts.code}` : ''}`);
    process.exit(1);
  }

  const v = fund.code === 0 ? verdict(parseDeltas(fund.out))
    : { exitCode: 0, text: `⚠ CROSS-VERIFY: fetch-fundamentals ล้ม (${fund.err || 'exit ' + fund.code}) — worker ต้อง WebFetch targeted 2 แหล่งเอง` };

  // stdout เป็น pipe = write async — EPIPE โผล่เป็น 'error' event คนละ tick กับ console.log จึงไม่มีทาง
  // ให้ try/catch ธรรมดาจับได้ ต้องดัก listener ตรงนี้ด้วย ไม่งั้น uncaught exception หลุดไป exit 1 ทับ v.exitCode
  process.stdout.on('error', () => {});

  safeLog(`=== PREP ${a.symbol} (${a.update ? 'UPDATE' : 'NEW'}${a.th ? ' TH' : ''}) — วางทั้ง block ลง {{FUNDAMENTALS}} ===`);
  safeLog(v.text);
  if (fund.code === 0) safeLog('\n' + fund.out);
  // fetch-facts ล้มเพราะ "ซีรีส์กราฟผสมสองฐาน" ≠ ล้มแบบ plumbing: สั่งให้ worker รันซ้ำเองไม่มีประโยชน์
  // (มันจะชนกำแพงเดิม) และปล่อยให้ spawn ต่อ = ได้รายงานที่กราฟ/ป้าย % ผิดโดย gate จับไม่ได้
  // ⇒ ยกระดับเป็น exit 2 เหมือนราคาขัดแหล่ง >5%: หยุด ให้คนตัดสินก่อน (CLAUDE.md §4 "exit 2 = ห้าม spawn")
  let badChart = false;
  if (facts) {
    if (facts.code === 0) safeLog('\n=== FACTS (ราคา/กราฟ — worker ห้ามรัน fetch-facts ซ้ำ) ===\n' + facts.out);
    else if (/BAD-CHART/.test(facts.err)) {
      badChart = true;
      // facts.err ขึ้นต้นด้วย 🛑 มาแล้วจาก fetch-facts — ไม่ต้องเติมซ้ำ
      safeLog(`\n=== FACTS ===\n${facts.err}\n   → หยุด ห้าม spawn worker (exit 2): ยืนยัน split จากแหล่งปฐมภูมิก่อน แล้วแก้จุดกราฟด้วยมือตาม SKILL STEP 0 หัวข้อ bad-chart`);
    }
    else safeLog(`\n=== FACTS === ✗ ล้ม (${facts.err || 'exit ' + facts.code}) — worker รัน node tools/fetch-facts.js ${a.symbol}${a.th ? ' --th' : ''} เองใน STEP 1`);
  }

  if (a.brand) {
    const brand = await runTool('pick-brand.js', [a.symbol, a.brand, '--auto']);
    if (brand.code === 0) safeLog('\n=== BRAND (pick-brand --auto — ลง seeds.json แล้ว) ===\n' + brand.out);
    else safeLog(`\n=== BRAND === ✗ ${brand.err || 'exit ' + brand.code}`);
  }

  process.exit(Math.max(v.exitCode, badChart ? 2 : 0));
}

module.exports = { parseDeltas, verdict, parseArgs, PRICE_PASS_PCT, PRICE_STOP_PCT, EPS_PASS_PCT };
if (require.main === module) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
