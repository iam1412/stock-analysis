#!/usr/bin/env node
'use strict';
/**
 * prep-stock-test.js — unit-test tools/prep-stock.js แบบ offline (ไม่ยิง network)
 * ตรวจ parseDeltas (อ่าน Δ จาก output ของ fetch-fundamentals — format ของเราเอง)
 * + verdict (เกณฑ์ ✅≤2 / ⚠2–5 / 🛑>5 exit 2 ตาม invariant CLAUDE.md §2) + parseArgs
 */
const P = require('../tools/prep-stock.js');

let nOK = 0, nFail = 0;
function ok(cond, label, detail) {
  if (cond) { nOK++; return; }
  nFail++;
  console.error(`✗ ${label}${detail ? ' — ' + detail : ''}`);
}

// ---------- parseDeltas (fixture = format จริงจาก fetch-fundamentals.js) ----------
const outBoth = 'Δ ราคา=0.12% · Δ EPS(TTM)=1.5% — เกณฑ์: ราคา ≤2% · EPS ตรงกัน/±2% → ผ่าน · ขัดกัน = หยุดตาม SKILL (อย่าเดา)';
const d1 = P.parseDeltas(outBoth);
ok(d1.dP === 0.12 && d1.dE === 1.5 && d1.single === false, 'parseDeltas: อ่าน Δ ราคา+EPS', JSON.stringify(d1));

const outNoEps = 'Δ ราคา=3.40% · Δ EPS(TTM)=เทียบไม่ได้ — เกณฑ์: ...';
const d2 = P.parseDeltas(outNoEps);
ok(d2.dP === 3.4 && d2.dE === null, 'parseDeltas: EPS เทียบไม่ได้ → dE null', JSON.stringify(d2));

const outSingle = '⚠ ได้แหล่งเดียว — ต้องยืนยันแหล่งอิสระที่ 2 ก่อนเขียนตัวเลข (WebFetch targeted)';
const d3 = P.parseDeltas(outSingle);
ok(d3.dP === null && d3.single === true, 'parseDeltas: แหล่งเดียว → single', JSON.stringify(d3));

// ---------- verdict — เกณฑ์ราคา: ≤2 ✅ · 2–5 ⚠ · >5 🛑 exit 2 ----------
const vPass = P.verdict({ dP: 0.12, dE: 1.5, single: false });
ok(vPass.exitCode === 0 && /✅/.test(vPass.text) && !/⚠|🛑/.test(vPass.text), 'verdict: ราคา 0.12 + EPS 1.5 → ✅ ล้วน', vPass.text);

ok(P.verdict({ dP: 2.0, dE: 1.0, single: false }).exitCode === 0 && /✅/.test(P.verdict({ dP: 2.0, dE: 1.0, single: false }).text.split('\n')[0]), 'verdict: ขอบเขตราคา 2.0 พอดี → ✅');
const vWarn = P.verdict({ dP: 2.1, dE: 1.0, single: false });
ok(vWarn.exitCode === 0 && /⚠/.test(vWarn.text), 'verdict: ราคา 2.1 → ⚠ ตรวจเพิ่ม (exit 0)', vWarn.text);
ok(P.verdict({ dP: 5.0, dE: 1.0, single: false }).exitCode === 0, 'verdict: ขอบเขตราคา 5.0 พอดี → ยัง exit 0');
const vStop = P.verdict({ dP: 5.1, dE: 1.0, single: false });
ok(vStop.exitCode === 2 && /🛑/.test(vStop.text) && /หยุด/.test(vStop.text), 'verdict: ราคา 5.1 → 🛑 exit 2 (invariant >5%)', vStop.text);

// EPS: เกิน 2 → ⚠ ขัดกัน (ไม่ hard-fail) · เทียบไม่ได้ → ⚠
const vEps = P.verdict({ dP: 0.5, dE: 8.0, single: false });
ok(vEps.exitCode === 0 && /⚠/.test(vEps.text) && /EPS/.test(vEps.text), 'verdict: EPS 8% → ⚠ ขัดกัน exit 0', vEps.text);
const vEpsNull = P.verdict({ dP: 0.5, dE: null, single: false });
ok(vEpsNull.exitCode === 0 && /⚠/.test(vEpsNull.text), 'verdict: EPS เทียบไม่ได้ → ⚠');

// แหล่งเดียว → ⚠ cross-verify มือ, exit 0 (fallback WebFetch targeted ยังใช้ได้)
const vSingle = P.verdict({ dP: null, dE: null, single: true });
ok(vSingle.exitCode === 0 && /⚠/.test(vSingle.text) && /แหล่ง/.test(vSingle.text), 'verdict: แหล่งเดียว → ⚠ exit 0', vSingle.text);

// ---------- parseArgs ----------
const a1 = P.parseArgs(['AAPL']);
ok(a1.symbol === 'AAPL' && a1.th === false && a1.update === false && a1.brand === null, 'parseArgs: default NEW/US');
const a2 = P.parseArgs(['advanc', '--th', '--update']);
ok(a2.symbol === 'ADVANC' && a2.th === true && a2.update === true, 'parseArgs: --th --update + upper-case');
const a3 = P.parseArgs(['CGNX', '--brand', '#ffcc00']);
ok(a3.brand === '#ffcc00', 'parseArgs: --brand hex');
ok(P.parseArgs([]).error != null, 'parseArgs: ไม่มี symbol → error');
ok(P.parseArgs(['CGNX', '--brand', 'ffcc00']).error != null, 'parseArgs: brand ไม่ใช่ #rrggbb → error');
ok(P.parseArgs(['CGNX', '--brand']).error != null, 'parseArgs: --brand ไม่มีค่า → error');

console.log(nFail ? `\n✗ prep-stock-test: ${nFail} failed / ${nOK} passed` : `\n✓ prep-stock-test: ${nOK} passed`);
process.exit(nFail ? 1 : 0);
