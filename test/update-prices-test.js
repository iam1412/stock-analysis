#!/usr/bin/env node
'use strict';
/**
 * update-prices-test.js — unit-test tools/update-prices.js แบบ offline (mock ข้อมูล Yahoo, ไม่ยิง network)
 * ตรวจว่า patch แล้ว "ตัวเลขสอดคล้องกันเอง" ตามที่ gate บังคับ (E16/E23/E30/E31/E34–E37)
 * + กติกา freeze ทำงานถูก + flags merge ถูก · fixture = reports/AAPL.html จริง
 */
const fs = require('fs');
const path = require('path');
const U = require('../tools/update-prices.js');

let nOK = 0, nFail = 0;
function ok(cond, label, detail) {
  if (cond) { nOK++; return; }
  nFail++;
  console.error(`✗ ${label}${detail ? ' — ' + detail : ''}`);
}

// ---------- fmtPrice / fmtLike ----------
ok(U.fmtPrice(297.214) === '297.21', 'fmtPrice 2dp');
ok(U.fmtPrice(1234.5) === '1,234.50', 'fmtPrice comma ≥1000');
ok(U.fmtPrice(6.1) === '6.10', 'fmtPrice THB เล็ก');
ok(U.fmtLike(305.678, '297') === '306', 'fmtLike คงสไตล์จำนวนเต็ม');
ok(U.fmtLike(6.157, '6.15') === '6.16', 'fmtLike คงสไตล์ 2dp');

// ---------- toYahooSymbol ----------
ok(U.toYahooSymbol('ADVANC', 'THB') === 'ADVANC.BK', 'หุ้นไทย → .BK');
ok(U.toYahooSymbol('BF-B', 'USD') === 'BF-B', 'หุ้น US คงเดิม');

// ---------- decide ----------
const base = { oldPrice: 100, fv: 120, gaugeMin: 60, gaugeMax: 200, currencyOk: true };
ok(U.decide({ ...base, newPrice: 105 }).update === true, 'decide: drift เล็ก → update');
ok(U.decide({ ...base, newPrice: 112 }).freeze === 'drift-gt-10pct', 'decide: >10% → freeze');
ok(U.decide({ ...base, newPrice: 130 }).freeze === 'suspect-split-or-data', 'decide: >25% → suspect');
ok(U.decide({ ...base, oldPrice: 118, newPrice: 121 }).freeze === 'mos-sign-flip', 'decide: MOS พลิกเครื่องหมาย → freeze');
ok(U.decide({ ...base, oldPrice: 195, newPrice: 205, fv: 300 }).freeze === 'outside-gauge-range', 'decide: หลุด gauge → freeze');
ok(U.decide({ ...base, newPrice: 105, currencyOk: false }).freeze === 'currency-mismatch', 'decide: currency ไม่ตรง → freeze');

// ---------- buildChartData ----------
const mkBars = (n, startY, startM, price0) => Array.from({ length: n }, (_, i) => {
  const y = startY + Math.floor((startM + i) / 12), m = (startM + i) % 12;
  return { ts: Date.UTC(y, m, 1) / 1000, close: price0 + i };
});
const bars14 = mkBars(14, 2025, 4, 200);
const cd = U.buildChartData(bars14, 215.37, 0);
ok(cd.length === 13, 'chart ≤13 จุด (E37)', `ได้ ${cd.length}`);
ok(cd[cd.length - 1][1] === 215.37, 'จุดท้าย = ราคาปัจจุบัน');
ok(cd.every((p) => typeof p[0] === 'string' && p[0].length > 0 && Number.isFinite(p[1])), 'label ไม่ว่าง + ค่า finite (W12)');
ok(/^(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\d\d$/.test(cd[0][0]), 'label เดือนไทย+ปี 2 หลัก', cd[0][0]);
// bar ซ้ำเดือน → ใช้ค่าท้ายสุด
const dup = U.buildChartData([{ ts: Date.UTC(2026, 0, 1) / 1000, close: 10 }, { ts: Date.UTC(2026, 0, 15) / 1000, close: 11 }, { ts: Date.UTC(2026, 1, 1) / 1000, close: 12 }], 12, 0);
ok(dup.length === 2, 'เดือนซ้ำถูก dedupe');

// ---------- niceBounds ----------
const nb = U.niceBounds([200, 222, 245, 262, 297], 262);
ok(nb.min < 200 && nb.max > 297, 'bounds ครอบข้อมูล');
ok(nb.grid.length >= 1 && nb.grid.length <= 5 && nb.grid.every((g) => g > nb.min && g < nb.max), 'grid อยู่ใน (min,max) ≤5 เส้น');
const nb2 = U.niceBounds([5.1, 5.3, 5.2], 9.5); // fairLine ไกลจากข้อมูล
ok(nb2.max > 9.5, 'bounds ครอบ fairLine');

// ---------- annualChg ----------
ok(U.annualChg([['a', 100], ['b', 148.5]], '(รอบปี)').text === '▲ +48.5% (รอบปี)', 'ป้ายขาขึ้น');
ok(U.annualChg([['a', 100], ['b', 92]], '(รอบปี)').text.startsWith('▼ −8.0%'), 'ป้ายขาลง เครื่องหมาย −');
ok(U.annualChg([['a', 100], ['b', 100.3]], '(รอบปี)').text.startsWith('≈ ทรงตัว'), 'ทรงตัว < 0.75%');

// ---------- patchReport กับ AAPL จริง ----------
const aapl = fs.readFileSync(path.join(__dirname, '..', 'reports', 'AAPL.html'), 'utf8');
const chartData = U.buildChartData(mkBars(13, 2025, 6, 250), 301.5, 0);
const r = U.patchReport(aapl, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData });
const out = r.html;

const sm = JSON.parse(out.match(/<script[^>]*id=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
const rd = JSON.parse(out.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
ok(out.includes('<div class="px">$301.50<small>'), 'px header อัปเดต');
ok(sm.price === 301.5, 'stock-meta.price');
ok(Math.abs(sm.mos - (262 - 301.5) / 262 * 100) < 0.06, 'stock-meta.mos = (FV−p)/FV (E31)');
ok(Math.abs(sm.upside - (262 - 301.5) / 301.5 * 100) < 0.06, 'stock-meta.upside (E31)');
ok(sm.pe === 36 && sm.symbol === 'AAPL', 'stock-meta คีย์อื่นคงเดิม');
const mosBig = parseFloat((out.match(/class="big">\s*([+\-−]?\s*[\d.]+)\s*%/) || [])[1].replace('−', '-'));
ok(Math.abs(mosBig - sm.mos) <= 2, 'MOS .big ↔ stock-meta ภายใน 2pp (E16/E30)', `big=${mosBig} sm=${sm.mos}`);
ok(out.includes('11 ก.ค. 2026'), 'วันที่ราคาใน header อัปเดต (คง ค.ศ.)');
ok(!/22\s*มิ\.ย\.\s*2026<br>/.test(out.match(/<header[\s\S]*?<\/header>/i)[0]), 'วันที่เก่าใน header หายไป');
ok((out.match(/id="pxIn"[^>]*value="([\d.]+)"/) || [])[1] === '301.5', 'pxIn = ราคาใหม่ (E23)');
ok(rd.gauge.cur === 301.5, 'gauge.cur = ราคาใหม่');
ok(rd.chart.data.length === 13 && rd.chart.data[12][1] === 301.5, 'chart 13 จุด จุดท้าย = ราคา (E37)');
ok(rd.chart.min < Math.min(...rd.chart.data.map((p) => p[1])) && rd.chart.max > Math.max(...rd.chart.data.map((p) => p[1])), 'chart bounds ครอบข้อมูล');
// E36: ป้าย % = ปลายกราฟ
const stated = parseFloat((out.match(/class="chg">[▲▼]?\s*[+−]?([\d.]+)%/) || [])[1]);
const chartPct = (rd.chart.data[12][1] - rd.chart.data[0][1]) / rd.chart.data[0][1] * 100;
ok(Math.abs(stated - Math.abs(chartPct)) <= 12, 'ป้าย % รอบปี = ปลายกราฟ (E36)', `stated=${stated} chart=${chartPct.toFixed(1)}`);
ok(/\(รอบปี\)/.test(out.match(/class="chg">([^<]*)/)[1]), 'ป้ายมีคำว่า (รอบปี) (E35)');
// E34: ทิศ ↔ สี
const up = /▲/.test(out.match(/class="chg">([^<]*)/)[1]);
ok(up ? /green/.test(rd.theme.chgBg) : /red/.test(rd.theme.chgBg), 'สีป้ายตรงทิศ (E34)', rd.theme.chgBg);
ok(!/\{\{|\}\}|undefined|NaN/.test(out.replace(/[\s\S]*<body/, '')), 'ไม่มี placeholder/undefined หลุด (E13/E14)');
ok(out.match(/id="mCur"><div class="lab">ปัจจุบัน \$([\d,.]+)/)[1] === '302', 'gauge label คงสไตล์จำนวนเต็ม');

// idempotent: patch ซ้ำด้วยข้อมูลเดิม → เนื้อหาเท่าเดิม
const r2 = U.patchReport(out, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData });
ok(r2.changed === false, 'patch ซ้ำข้อมูลเดิม → ไม่เปลี่ยน (idempotent)');

// self-check: html ที่ไม่มี .px ต้อง throw (กัน patch เงียบ ๆ บนไฟล์ผิดโครง)
let threw = false;
try { U.patchReport(aapl.replace('<div class="px">', '<div class="pxx">'), { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData }); }
catch (e) { threw = true; }
ok(threw, 'self-check: ไฟล์ผิดโครง → throw (ไป flag patch-failed)');

// ---------- mergeFlags ----------
const prev = [
  { symbol: 'AAA', reason: 'drift-gt-10pct', flaggedAt: '2026-07-01' },
  { symbol: 'BBB', reason: 'fetch-failed', flaggedAt: '2026-07-02' },
  { symbol: 'ZZZ', reason: 'drift-gt-10pct', flaggedAt: '2026-07-03' },
];
const merged = U.mergeFlags(prev, new Set(['AAA', 'BBB']), [{ symbol: 'AAA', reason: 'drift-gt-10pct' }]);
ok(merged.length === 2, 'flags: ตัวที่หาย freeze ถูกเคลียร์ / นอกรอบคงไว้', JSON.stringify(merged.map((f) => f.symbol)));
ok(merged.find((f) => f.symbol === 'AAA').flaggedAt === '2026-07-01', 'flags: flaggedAt เดิมคงอยู่เมื่อเหตุผลเดิม');
ok(merged.find((f) => f.symbol === 'ZZZ'), 'flags: symbol นอกรอบ (--only) ไม่ถูกลบ');

console.log(nFail ? `\n✗ update-prices-test: ${nFail} failed / ${nOK} passed` : `\n✓ update-prices-test: ${nOK} passed`);
process.exit(nFail ? 1 : 0);
