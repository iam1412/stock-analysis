#!/usr/bin/env node
'use strict';
/**
 * prep-stock-test.js — unit-test tools/prep-stock.js แบบ offline (ไม่ยิง network)
 * ตรวจ parseDeltas (อ่าน Δ จาก output ของ fetch-fundamentals — format ของเราเอง)
 * + verdict (เกณฑ์ ✅≤2 / ⚠2–5 / 🛑>5 exit 2 ตาม invariant CLAUDE.md §2) + parseArgs
 * + ★ จุดบอด 2 ข้อที่ทำเลขเผยแพร่ผิดจริง (17 ส.ค. 2569 — เคลียร์คิว price-flags 12 ตัว):
 *   (1) หุ้นคงเหลือ [2b] แยกจากแถว Shares ถัวเฉลี่ยปรับลดใน [3]  (2) EPS ทางที่ 3 จากตาราง [3]
 * round-trip: สร้างบรรทัดด้วย formatter ของ fetch-fundamentals จริง → ป้อนเข้า parseDeltas
 * (require ไฟล์นั้นได้เพราะ main() ถูก guard ด้วย require.main — ถ้า guard หลุด test นี้จะยิงเน็ต)
 */
const P = require('../tools/prep-stock.js');
const F = require('../tools/fetch-fundamentals.js');

let nOK = 0, nFail = 0;
function ok(cond, label, detail) {
  if (cond) { nOK++; return; }
  nFail++;
  console.error(`✗ ${label}${detail ? ' — ' + detail : ''}`);
}

// ---------- fixture builders (โครง devalue: object เก็บ index ชี้กลับเข้า array เดียวกัน) ----------
function makeFinPage(rows) {
  const arr = []; const fd = {};
  const push = (v) => { arr.push(v); return arr.length - 1; };
  for (const [k, vals] of Object.entries(rows)) fd[k] = push(vals.map((v) => (v == null ? -1 : push(v))));
  return { arr, fd, src: 'test' };
}
function makeStatsPayload(cards) {
  const arr = []; const objs = [];
  const push = (v) => { arr.push(v); return arr.length - 1; };
  for (const c of cards)
    objs.push({ id: push(c.id), title: push(c.title), value: push(c.value), hover: c.hover == null ? -1 : push(c.hover) });
  objs.forEach((o) => arr.push(o));
  return { nodes: [{ type: 'data', data: ['noise', 42] }, { type: 'data', data: arr }] };
}
// AMATA 17 ส.ค. 2569 — quote 2 เจ้าตรงกันที่ ฿4.48 แต่ตารางย้อนกลับได้ = ฿3.22
const amataFin = makeFinPage({
  datekey: ['TTM', '2025-12-31'], epsDiluted: [3.22, 2.74],
  netIncome: [3698e6, 3149e6], sharesDiluted: [1149e6, 1150e6],
});

// ---------- parseDeltas (fixture = format จริงจาก fetch-fundamentals.js) ----------
const outBoth = 'Δ ราคา=0.12% · Δ EPS(TTM)=1.5% — เกณฑ์: ราคา ≤2% · EPS ตรงกัน/±2% → ผ่าน · ขัดกัน = หยุดตาม SKILL (อย่าเดา)\n'
  + F.epsTableLine(1.23, 'SA', F.tableEpsTTM(makeFinPage({ datekey: ['TTM'], epsDiluted: [1.21], netIncome: [674e6], sharesDiluted: [557e6] })));
const d1 = P.parseDeltas(outBoth);
ok(d1.dP === 0.12 && d1.dE === 1.5 && d1.single === false, 'parseDeltas: อ่าน Δ ราคา+EPS', JSON.stringify(d1));

const outNoEps = 'Δ ราคา=3.40% · Δ EPS(TTM)=เทียบไม่ได้ — เกณฑ์: ...';
const d2 = P.parseDeltas(outNoEps);
ok(d2.dP === 3.4 && d2.dE === null, 'parseDeltas: EPS เทียบไม่ได้ → dE null', JSON.stringify(d2));

const outSingle = '⚠ ได้แหล่งเดียว — ต้องยืนยันแหล่งอิสระที่ 2 ก่อนเขียนตัวเลข (WebFetch targeted)';
const d3 = P.parseDeltas(outSingle);
ok(d3.dP === null && d3.single === true, 'parseDeltas: แหล่งเดียว → single', JSON.stringify(d3));

// ---------- verdict — เกณฑ์ราคา: ≤2 ✅ · 2–5 ⚠ · >5 🛑 exit 2 ----------
const vPass = P.verdict(d1); // d1 = ราคา 0.12 + EPS 1.5 + ตาราง [3] ตรง → ✅ ครบ 3 บรรทัด
ok(vPass.exitCode === 0 && /✅/.test(vPass.text) && !/⚠|🛑/.test(vPass.text), 'verdict: ราคา 0.12 + EPS 1.5 + ตาราง ตรง → ✅ ล้วน', vPass.text);
ok(vPass.text.split('\n').length === 3, 'verdict: มี 3 บรรทัด (ราคา · EPS quote · EPS ตาราง [3])', vPass.text);

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

// ================= จุดบอด 2: EPS ทางที่ 3 (quote ↔ ตาราง [3]) =================
// AMATA regression — quote 2 เจ้าตรงกันเป๊ะ (dE=0) แต่ตารางที่ย้อนกลับได้ต่าง 39% ⇒ ต้อง ⚠ และ **ห้าม** เปลี่ยน exit code
const t3 = F.tableEpsTTM(amataFin);
ok(t3.eps === 3.22 && t3.shares === 1149e6 && !t3.err, 'tableEpsTTM: อ่านคอลัมน์ TTM (EPS 3.22 · shares 1,149M)', JSON.stringify(t3));

const amataLine = F.epsTableLine(4.48, 'SA', t3);
const dA = P.parseDeltas('Δ ราคา=0.00% · Δ EPS(TTM)=0.0% — เกณฑ์: ...\n' + amataLine);
ok(dA.hasT === true && Math.abs(dA.dT - 39.2) < 0.2 && dA.epsQuote === 4.48 && dA.epsTable === 3.22,
  'round-trip: epsTableLine (AMATA) → parseDeltas ได้ dT/quote/ตาราง', JSON.stringify(dA) + ' | ' + amataLine);

const vA = P.verdict({ dP: 0, dE: 0, single: false, ...dA });
const lA = vA.text.split('\n');
ok(vA.exitCode === 0, '★ AMATA: EPS ขัดตาราง 39% → WARN เท่านั้น exit ยัง 0 (สัญญา exit code ไม่เปลี่ยน)', String(vA.exitCode));
ok(vA.exitCode !== 2, '★ AMATA: ห้าม hard-fail เป็น exit 2 (สงวนไว้ให้ราคาขัด >5% เท่านั้น)');
ok(/^✅/.test(lA[0]) && /^✅/.test(lA[1]) && /^⚠/.test(lA[2]) && /ตาราง \[3\]/.test(lA[2]),
  '★ AMATA: ราคา ✅ · EPS(TTM) ✅ · ตาราง [3] ⚠ (false pass ถูกจับได้)', vA.text);
ok(/4\.48/.test(lA[2]) && /3\.22/.test(lA[2]) && /epsFwd/.test(lA[2]),
  'AMATA: บรรทัดเตือนมีทั้งสองค่า + ตัวตัดสินรอง epsFwd', lA[2]);

// หุ้นขาดทุน EPS ใกล้ 0 — −0.77 vs −0.79 = 2.5% แต่ต่างจริง 0.02 ⇒ ทั้งสองไฟล์ต้องตัดสินตรงกันว่า ✅
const aaoiT = F.tableEpsTTM(makeFinPage({ datekey: ['TTM'], epsDiluted: [-0.79], netIncome: [-57e6], sharesDiluted: [72.9e6] }));
const aaoiLine = F.epsTableLine(-0.77, 'SA', aaoiT);
ok(/✅/.test(aaoiLine), 'epsTableLine: EPS ใกล้ 0 ต่าง 0.02 → ✅ (abs tolerance)', aaoiLine);
const vAaoi = P.verdict({ dP: 0.5, dE: 2.5, single: false, ...P.parseDeltas('Δ ราคา=0.50%\n' + aaoiLine) });
ok(/✅ EPS quote ↔ ตาราง/.test(vAaoi.text), '★ verdict ต้องไม่ขัดกับบรรทัด ✅ ของ fetch-fundamentals (abs tolerance ตรงกัน)', vAaoi.text);

// ไม่มีคอลัมน์ TTM → เทียบไม่ได้ (ห้ามเอา FY ล่าสุดมาเทียบ EPS(TTM) = warn ปลอม)
const noTtm = F.tableEpsTTM(makeFinPage({ datekey: ['2025-12-31'], epsDiluted: [2.74] }));
ok(noTtm.err && noTtm.eps == null, 'tableEpsTTM: ไม่มีคอลัมน์ TTM → err', JSON.stringify(noTtm));
const naLine = F.epsTableLine(4.48, 'SA', noTtm);
const dNa = P.parseDeltas('Δ ราคา=0.00%\n' + naLine);
ok(dNa.hasT === true && dNa.dT === null, 'parseDeltas: "เทียบไม่ได้" → hasT true แต่ dT null', naLine);
const vNa = P.verdict({ dP: 0, dE: 0, single: false, ...dNa });
ok(vNa.exitCode === 0 && /⚠.*ตาราง \[3\] เทียบไม่ได้/.test(vNa.text), 'verdict: ตาราง [3] เทียบไม่ได้ → ⚠ exit 0', vNa.text);

// ไม่มีตาราง [3] เลย (financials ล่ม) → ยังต้องได้บรรทัด "เทียบไม่ได้" ไม่ใช่ crash
ok(/เทียบไม่ได้/.test(F.epsTableLine(4.48, 'SA', F.tableEpsTTM(null))), 'epsTableLine: ไม่มีตาราง → เทียบไม่ได้');
ok(/เทียบไม่ได้/.test(F.epsTableLine(null, 'SA', t3)), 'epsTableLine: ไม่มี EPS จาก quote → เทียบไม่ได้');

// back-compat: output รุ่นเก่า/ไม่มีบรรทัดนี้ → verdict ต้องไม่พัง และเตือนว่ายังไม่ได้เทียบทางที่ 3
const vNoLine = P.verdict({ dP: 0.1, dE: 0.1, single: false });
ok(vNoLine.exitCode === 0 && /⚠ ไม่มีบรรทัดเทียบ EPS/.test(vNoLine.text), 'verdict: ไม่มีบรรทัดตาราง [3] → ⚠ (ไม่ throw)', vNoLine.text);
// แหล่ง quote เหลือเจ้าเดียว แต่ยังเทียบกับตารางได้ — ต้องไม่ถูกกลืนโดย early-return "ได้แหล่งเดียว"
const dSingleT = P.parseDeltas('⚠ ได้แหล่งเดียว — ต้องยืนยันแหล่งอิสระที่ 2\n' + amataLine);
ok(dSingleT.single === true && Math.abs(dSingleT.dT - 39.2) < 0.2, 'parseDeltas: แหล่งเดียว + ยังอ่าน dT ได้', JSON.stringify(dSingleT));
const vSingleT = P.verdict(dSingleT);
ok(vSingleT.exitCode === 0 && /แหล่งเดียว/.test(vSingleT.text) && /ตาราง \[3\]/.test(vSingleT.text),
  'verdict: แหล่งเดียว → ยังโชว์ผลเทียบตาราง [3]', vSingleT.text);

// ================= จุดบอด 1: หุ้นคงเหลือ ≠ แถว Shares ถัวเฉลี่ยปรับลด =================
ok(F.statNum('46,044,477') === 46044477 && F.statNum('7.61B') === 7.61e9 && F.statNum('46.04M') === 46.04e6
  && F.statNum('1.15B') === 1.15e9 && F.statNum('-') === null && F.statNum(undefined) === null, 'statNum: คอมมา/K-M-B-T/ค่าเสีย');

const camtStats = F.statsFromPayload(makeStatsPayload([
  { id: 'sharesOutClass', title: 'Current Share Class', value: '46.04M', hover: '46,044,477' },
  { id: 'sharesout', title: 'Shares Outstanding', value: '46.04M', hover: '46,044,477' },
  { id: 'marketcap', title: 'Market Cap', value: '7.61B' },
  { id: 'float', title: 'Float', value: '28.48M', hover: '28,481,079' },
]));
ok(camtStats.sharesOut.num === 46044477 && camtStats.marketCap.text === '7.61B' && camtStats.sharesOut.text === '46.04M',
  '★ statsFromPayload: ได้หุ้นคงเหลือเต็มความละเอียดจาก hover (ไม่ใช่ 46.04M ที่ปัดแล้ว)', JSON.stringify(camtStats));

// CAMT: ปรับลด (51.0M) > คงเหลือ (46.04M) — ทิศทางเดาไม่ได้ ⇒ ต้องเตือน
const lCamt = F.statsLines(camtStats, null, 51.0e6).join('\n');
ok(/Shares Outstanding=46,044,477/.test(lCamt) && /⚠/.test(lCamt) && /ต่ำกว่า.*9\.7%|ต่ำกว่า.*9\.8%/.test(lCamt),
  '★ statsLines: Δ vs แถว Shares [3] เกิน 3% → ⚠ พร้อมทิศทาง', lCamt);
ok(/ห้ามสลับฐาน/.test(lCamt), 'statsLines: เตือนห้ามสลับฐาน (EPS×คงเหลือ / กำไร÷คงเหลือ)', lCamt);
ok(!/หลายคลาสหุ้น/.test(lCamt), 'statsLines: คลาสเดียว → ไม่ต้องเตือน multi-class', lCamt);

// dilution ต่ำ (AMATA 1.150B vs 1.149B) → ✅ แต่ยังสั่งให้ใช้ค่าคงเหลือเป็นฐาน
const lAmata = F.statsLines(F.statsFromPayload(makeStatsPayload([
  { id: 'sharesout', title: 'Shares Outstanding', value: '1.15B', hover: '1,150,000,000' },
  { id: 'marketcap', title: 'Market Cap', value: '35.94B', hover: '35,937,500,000' },
])), null, 1149e6).join('\n');
ok(/✅/.test(lAmata) && !/⚠/.test(lAmata) && /ฐานต่อหุ้น/.test(lAmata), 'statsLines: dilution ต่ำ → ✅', lAmata);

// RDDT: หลายคลาส — ★ SA คิด market cap จาก "หุ้นรวมทุกคลาส" (แก้ข้อความที่เคยเขียนกลับด้าน 18 ส.ค. 69)
const lRddt = F.statsLines(F.statsFromPayload(makeStatsPayload([
  { id: 'sharesOutClass', title: 'Current Share Class', value: '146.10M', hover: '146,103,200' },
  { id: 'sharesout', title: 'Shares Outstanding', value: '192.40M', hover: '192,396,510' },
  { id: 'marketcap', title: 'Market Cap', value: '34.26B' },
])), null, 203e6).join('\n');
ok(/หลายคลาสหุ้น/.test(lRddt) && /146\.10M/.test(lRddt) && /192,396,510/.test(lRddt),
  '★ statsLines: dual-class → เตือนพร้อมบอกทั้งสองฐาน', lRddt);
// ★ ข้อความต้องชี้ว่า market cap หารด้วย "หุ้นรวมทุกคลาส" — เคยเขียนกลับด้านจนเกือบทำให้ worker คิดมูลค่าต่อหุ้นผิด (เคส CBRS 18 ส.ค. 69)
ok(/รวมทุกคลาส/.test(lRddt) && !/คิดจากคลาสที่จดทะเบียนเท่านั้น/.test(lRddt),
  '★ statsLines: ต้องไม่บอกว่า Market Cap คิดจากคลาสจดทะเบียนเท่านั้น (ผิด — วัดจริง 31.65B ÷ 192.40M = ราคาจริง)', lRddt);

// /statistics/ ล่ม → บอกทางออก ไม่ใช่เงียบ (silent degrade = จุดบอดเดิม)
const lFail = F.statsLines(null, 'HTTP 403', 51e6).join('\n');
ok(/✗/.test(lFail) && /403/.test(lFail) && /statistics/.test(lFail) && /ห้ามใช้แถว Shares ใน \[3\]/.test(lFail),
  'statsLines: ดึงไม่ได้ → ✗ + สั่งห้ามใช้แถว Shares แทน', lFail);
ok(F.statsLines(null, null, null).length === 1, 'statsLines: ไม่มีทั้งสถิติและตาราง → 1 บรรทัด ไม่ throw');
// ★ pin ตัวแยกแยะที่ canary ใช้: บรรทัด ✗ ต้อง **ไม่มี** "Shares Outstanding=" ไม่งั้น grep ของ canary ผ่านทั้งที่แหล่งตาย
ok(!lFail.includes('Shares Outstanding=') && lCamt.includes('Shares Outstanding='),
  '★ canary discriminator: "Shares Outstanding=" มีเฉพาะตอนดึงได้จริง', lFail);

// ป้ายแถวในตาราง [3] ต้องบอกนิยามในตัวเอง + footnote ใช้ถ้อยคำเต็มตามที่เจ้าของกำหนด
ok(F.SHARES_LABEL === 'Shares(wAvgDil)' && /Shares/.test(F.SHARES_LABEL), 'SHARES_LABEL: มีคำว่า Shares (canary grep ยังผ่าน)');
ok(F.SHARES_NOTE.includes('หุ้นถัวเฉลี่ยถ่วงน้ำหนักปรับลด (TTM) — ห้ามใช้เป็นหุ้นคงเหลือ') && F.SHARES_NOTE.includes(F.SHARES_LABEL),
  '★ SHARES_NOTE: ถ้อยคำเตือนครบตามที่กำหนด', F.SHARES_NOTE);

// ---------- ปันผล: yield ที่ย้อนกลับได้ (dps ÷ ราคา) ----------
const yA = F.yieldLine(1.10, 31.25, 0.0432, 3.52); // AMATA: Yahoo 4.32% ย้อนกลับไม่ลงตัว · SA 3.52% ลงตัว
ok(/= 3\.52%/.test(yA) && /⚠/.test(yA) && /Yahoo/.test(yA) && !/⚠ SA/.test(yA), 'yieldLine: Yahoo ไม่ลงตัว → ⚠ ยึด dps÷ราคา', yA);
ok(/Yahoo=4\.32%/.test(yA), 'yieldLine: พิมพ์ค่า vendor ตรง ๆ ไม่แปลงหน่วยเงียบ ๆ', yA);
ok(/✅/.test(F.yieldLine(1.10, 31.25, 0.0352, 3.52)), 'yieldLine: ลงตัวทั้งคู่ → ✅');
ok(F.yieldLine(0, 31.25, 0.04, 4) === null && F.yieldLine(1.1, 0, null, null) === null, 'yieldLine: ไม่มี dps/ราคา → null (ไม่พิมพ์)');

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
