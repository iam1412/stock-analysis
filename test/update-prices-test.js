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
ok(U.decide({ ...base, newPrice: 112 }).update === true, 'decide: 12% ≤ เกณฑ์ 15% → update');
ok(U.decide({ ...base, newPrice: 82 }).freeze === 'drift-gt-15pct', 'decide: >15% → freeze');
ok(U.decide({ ...base, newPrice: 130 }).freeze === 'suspect-split-or-data', 'decide: >25% → suspect');
ok(U.decide({ ...base, oldPrice: 112, newPrice: 126 }).freeze === 'mos-sign-flip', 'decide: MOS พลิกเกิน dead-band ทั้งสองฝั่ง (+6.7→−5) → freeze');
ok(U.decide({ ...base, oldPrice: 112, newPrice: 121 }).freeze === 'mos-sign-flip', 'decide: ฝั่งเก่าเกิน dead-band (+6.7→−0.8) → freeze');
ok(U.decide({ ...base, oldPrice: 118, newPrice: 126 }).freeze === 'mos-sign-flip', 'decide: ฝั่งใหม่เกิน dead-band (+1.7→−5) → freeze');
ok(U.decide({ ...base, oldPrice: 118, newPrice: 121 }).update === true, 'decide: flip ใน dead-band ±3 (+1.7→−0.8) → update (noise รอบ FV)');
ok(U.decide({ ...base, oldPrice: 118.5, newPrice: 123.6 }).update === true, 'decide: flip ขอบเขต 3.0 จุดพอดี (+1.25→−3.0) → update');
ok(U.decide({ ...base, oldPrice: 195, newPrice: 205, fv: 300 }).update === true, 'decide: หลุด gauge → ไม่ freeze แล้ว (patchReport ขยายขอบเอง)');
ok(U.decide({ ...base, newPrice: 105, currencyOk: false }).freeze === 'currency-mismatch', 'decide: currency ไม่ตรง → freeze');

// ---------- decide --force (re-analysis UPDATE mode) ----------
ok(U.decide({ ...base, newPrice: 82, force: true }).update === true, 'force: ข้าม drift freeze → update');
ok(U.decide({ ...base, newPrice: 130, force: true }).update === true, 'force: ข้าม suspect freeze → update');
ok(U.decide({ ...base, oldPrice: 112, newPrice: 126, force: true }).update === true, 'force: ข้าม mos-sign-flip (เกิน dead-band) → update');
ok(U.decide({ ...base, oldPrice: 195, newPrice: 205, fv: 300, force: true }).update === true, 'force: หลุด gauge → update (เหมือน non-force)');
ok(U.decide({ ...base, newPrice: 105, currencyOk: false, force: true }).freeze === 'currency-mismatch', 'force: currency ไม่ตรง ยัง freeze');
ok(U.decide({ ...base, newPrice: NaN, force: true }).freeze === 'bad-price', 'force: ราคาเสีย ยัง freeze');

// ---------- currencyMatches (Yahoo ไม่ส่ง currency = freeze, ไม่ fail-open) ----------
ok(U.currencyMatches('USD', 'USD') === true, 'currencyMatches: สกุลตรง → true');
ok(U.currencyMatches('THB', 'USD') === false, 'currencyMatches: คนละสกุล → false (freeze currency-mismatch)');
ok(U.currencyMatches(undefined, 'USD') === false, '★ currencyMatches: Yahoo ไม่ส่ง currency → false (freeze, ไม่ patch ราคาผิดตลาด)');
ok(U.currencyMatches('', 'THB') === false, 'currencyMatches: currency ว่าง → false');

// ---------- isIntradayQuote (guard: ตลาดยังเปิด = ราคาไม่ใช่ราคาปิด) ----------
// ตัวเลขจริงจาก Yahoo v8 chart 11 ส.ค. 2569 — AAPL (NASDAQ, EDT) session 17:30–20:00 UTC
const OPEN = { regularStart: 1786368600, regularEnd: 1786392000 };
ok(U.isIntradayQuote({ ...OPEN, marketTime: 1786388373, nowSec: 1786388400 }) === true,
  '★ isIntradayQuote: กลาง session (tick ในหน้าต่าง + ยังไม่ถึงเวลาปิด) → true = ข้าม patch');
ok(U.isIntradayQuote({ ...OPEN, marketTime: 1786392000, nowSec: 1786395600 }) === false,
  '★ isIntradayQuote: ปิดแล้วแต่ Yahoo ยังไม่เลื่อนหน้าต่าง → false = ราคาปิดจริง patch ได้');
// IIG.BK จริง: ปิด 16:30 ICT (09:30 UTC) แล้ว regular เลื่อนไป session วันรุ่งขึ้น 03:00–09:30 UTC
ok(U.isIntradayQuote({ regularStart: 1786417200, regularEnd: 1786440600, marketTime: 1786354575, nowSec: 1786388400 }) === false,
  '★ isIntradayQuote: ปิดแล้วและเลื่อนหน้าต่างไป session ถัดไป → false');
ok(U.isIntradayQuote({ ...OPEN, marketTime: 1786282200, nowSec: 1786369200 }) === false,
  'isIntradayQuote: pre-market / หุ้นยังไม่มี tick วันนี้ (marketTime = ปิดครั้งก่อน) → false ไม่ false-skip');
ok(U.isIntradayQuote({ marketTime: 1786388373, nowSec: 1786388400 }) === false,
  '★ isIntradayQuote: ไม่มี currentTradingPeriod (Yahoo เปลี่ยนโครง) → fail-open ถือเป็นราคาปิด ไม่ให้ cron ตายทั้งกระดาน');
ok(U.isIntradayQuote({ ...OPEN, marketTime: NaN, nowSec: 1786388400 }) === false,
  'isIntradayQuote: marketTime ใช้ไม่ได้ → fail-open');

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

// ---------- detectMixedBasis (ซีรีส์กราฟผสมสองฐาน — split ที่ Yahoo ยังไม่ปรับย้อนหลัง) ----------
// fixture = ตัวเลขสังเคราะห์ (คัดลอกค่าที่วัดได้จริงจาก MNST 12 ส.ค. 2569 มาแช่ไว้) — **ห้าม fetch สด**
// เพราะ Yahoo จะทยอยปรับ adjclose ให้ครบภายในไม่กี่วัน แล้วเคสนี้จะหายไปจากสายพานทดสอบเงียบ ๆ
const NOW = Date.UTC(2026, 7, 12) / 1000;                       // 12 ส.ค. 2569 — ตรึงเวลาไม่ให้เทสต์แกว่งตามวันจริง
const mkSeries = (rows) => rows.map(([y, m, close]) => ({ ts: Date.UTC(y, m, 1) / 1000, close }));

// MNST: 52wk = 30.485–50.17 (ปรับ split 2:1 แล้ว) แต่ ก.ย.–ธ.ค. 25 ยังเป็นฐานก่อน split (67–77)
const mnstBars = mkSeries([[2025, 8, 67.31], [2025, 9, 66.83], [2025, 10, 74.99], [2025, 11, 76.67],
  [2026, 0, 40.38], [2026, 1, 42.65], [2026, 2, 36.23], [2026, 3, 38.53],
  [2026, 4, 44.04], [2026, 5, 48.06], [2026, 6, 48.19], [2026, 7, 45.53]]);
const mb = U.detectMixedBasis({ bars: mnstBars, low: 30.485, high: 50.17, nowSec: NOW });
ok(mb.mixed === true, 'detectMixedBasis: จับซีรีส์ผสมสองฐาน (MNST split 2:1 ที่ยังไม่ปรับย้อนหลัง)');
ok(mb.checked === true, 'detectMixedBasis: รายงานว่าตรวจจริง');
ok(mb.bad.length === 4, 'detectMixedBasis: ชี้ครบทั้ง 4 จุดที่อยู่คนละฐาน', `ได้ ${mb.bad.length}`);
ok(mb.worst && mb.worst.close === 76.67, 'detectMixedBasis: worst = จุดที่หลุดกรอบมากที่สุด', JSON.stringify(mb.worst));
ok(/76\.67/.test(mb.text) && /50\.17/.test(mb.text) && /ธ\.ค\.25/.test(mb.text),
  'detectMixedBasis: detail อ่านออก (เดือน+ค่า+กรอบ 52wk) — ลงคิว price-flags ให้คนไล่ต่อได้', mb.text);

// close ดิบจาก JSON ของ Yahoo เป็น float มีหางลอย (วัดจริงตอน dry-run: 76.66999816894531)
// — detail ลงไฟล์ price-flags.json ที่คนอ่าน จึงต้องปัด ไม่ใช่โยนค่าดิบลงไป
const noisy = U.detectMixedBasis({ bars: mkSeries([[2025, 11, 76.66999816894531], [2026, 7, 45.53]]), low: 30.485, high: 50.17, nowSec: NOW });
ok(/76\.67\b/.test(noisy.text) && !/76\.669/.test(noisy.text), 'detectMixedBasis: ปัดทศนิยมใน detail', noisy.text);

// ฐานเดียวต้องผ่าน — AAPL วันเดียวกัน (52wk 223.78–344.57)
const aaplBars = mkSeries([[2025, 8, 254.63], [2025, 9, 270.37], [2025, 10, 278.85], [2025, 11, 271.86],
  [2026, 0, 259.48], [2026, 1, 264.18], [2026, 2, 253.79], [2026, 3, 271.35],
  [2026, 4, 312.06], [2026, 5, 289.36], [2026, 6, 308.91], [2026, 7, 304.91]]);
ok(U.detectMixedBasis({ bars: aaplBars, low: 223.78, high: 344.57, nowSec: NOW }).mixed === false,
  'detectMixedBasis: ซีรีส์ฐานเดียวไม่ false-positive');

// reverse split (ฐานเก่าต่ำกว่ากรอบ) ต้องจับได้เหมือนกัน — ไม่ใช่เช็คแค่ฝั่งสูง
const revBars = mkSeries([[2025, 8, 4.2], [2025, 9, 4.4], [2026, 0, 42.65], [2026, 7, 45.53]]);
ok(U.detectMixedBasis({ bars: revBars, low: 30.485, high: 50.17, nowSec: NOW }).mixed === true,
  'detectMixedBasis: จับฝั่งต่ำกว่ากรอบด้วย (reverse split)');

// bar ที่เก่ากว่า 52 สัปดาห์ — กรอบ 52wk ไม่ใช่ขอบเขตของมัน จึงห้ามนับ (ไม่งั้นหุ้นที่วิ่งแรงติด flag ยกแผง)
const oldOutside = mkSeries([[2024, 6, 150], [2026, 5, 48.06], [2026, 7, 45.53]]);
ok(U.detectMixedBasis({ bars: oldOutside, low: 30.485, high: 50.17, nowSec: NOW }).mixed === false,
  'detectMixedBasis: bar เก่ากว่า 52 สัปดาห์ไม่นับ');

// ราคาทำจุดสูงใหม่แล้ว field 52wk ของ Yahoo ตามไม่ทัน → หลุดขอบนิดเดียว ต้องไม่ freeze
const nearHigh = mkSeries([[2026, 5, 48.06], [2026, 6, 50.9], [2026, 7, 52.0]]);
ok(U.detectMixedBasis({ bars: nearHigh, low: 30.485, high: 50.17, nowSec: NOW }).mixed === false,
  'detectMixedBasis: หลุดขอบเล็กน้อย (52wk field ตามไม่ทันจุดสูงใหม่) ไม่ใช่ผสมฐาน');

// ไม่มี field 52wk (Yahoo เปลี่ยน schema) → **fail-open** เหมือน currentTradingPeriod
// — fail-closed จะทำให้ cron หยุดทั้งกระดานเงียบ ๆ ทุกวัน ซึ่งเสียหายกว่าปล่อยผ่าน
const noRange = U.detectMixedBasis({ bars: mnstBars, low: undefined, high: undefined, nowSec: NOW });
ok(noRange.mixed === false, 'detectMixedBasis: ไม่มี 52wk ใน meta → fail-open (ไม่ freeze ทั้งกระดาน)');
ok(noRange.checked === false, 'detectMixedBasis: บอกได้ว่า "ไม่ได้ตรวจ" ≠ "ตรวจแล้วผ่าน"');
ok(U.detectMixedBasis({ bars: mnstBars, low: 0, high: 50.17, nowSec: NOW }).checked === false,
  'detectMixedBasis: 52wk low = 0 (ค่าเสีย) → ไม่ตรวจ ไม่เดา');

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
// ⚠ ไฟล์ fixture ถูก cron แก้ทุกวัน — ห้าม assert ค่าปัจจุบันของไฟล์แบบ hard-code (ราคา/วันที่/FV)
// ให้อ่านค่าตั้งต้นจาก stock-meta ของ input แล้วเทียบเชิงสัมพัทธ์แทน
const aapl = fs.readFileSync(path.join(__dirname, '..', 'reports', 'AAPL.html'), 'utf8');
const smIn = JSON.parse(aapl.match(/<script[^>]*id=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
const FV = smIn.fairValue;
const chartData = U.buildChartData(mkBars(13, 2025, 6, 250), 301.5, 0);
const r = U.patchReport(aapl, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData });
const out = r.html;

const sm = JSON.parse(out.match(/<script[^>]*id=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
const rd = JSON.parse(out.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
ok(out.includes('<div class="px">$301.50<small>'), 'px header อัปเดต');
ok(sm.price === 301.5, 'stock-meta.price');
ok(Math.abs(sm.mos - (FV - 301.5) / FV * 100) < 0.06, 'stock-meta.mos = (FV−p)/FV (E31)');
ok(Math.abs(sm.upside - (FV - 301.5) / 301.5 * 100) < 0.06, 'stock-meta.upside (E31)');
ok(sm.pe === smIn.pe && sm.roe === smIn.roe && sm.fairValue === FV && sm.symbol === 'AAPL', 'stock-meta คีย์อื่นคงเดิม');
const mosBig = parseFloat((out.match(/class="big">\s*([+\-−]?\s*[\d.]+)\s*%/) || [])[1].replace('−', '-'));
ok(Math.abs(mosBig - sm.mos) <= 2, 'MOS .big ↔ stock-meta ภายใน 2pp (E16/E30)', `big=${mosBig} sm=${sm.mos}`);
ok(out.includes('11 ก.ค. 2026'), 'วันที่ราคาใน header อัปเดต (คง ค.ศ.)');
// วันที่ราคาต้องเป็นวันใหม่ — แต่ **ห้าม** เหมาว่า "ทุก token ต้องกลายเป็นวันใหม่หมด"
// (เคสเดิมเขียนแบบนั้นไว้ = ล็อกบั๊ก 9 ส.ค. 2569 ที่ประทับวันที่รันทับวันที่ในอดีตทุกตัว)
const hdrDates = out.match(/<header[\s\S]*?<\/header>/i)[0].match(/\d{1,2}\s*[ก-ฮ][ก-ฮ.]+\s*\d{4}/g) || [];
ok(hdrDates.length > 0 && hdrDates[0] === '11 ก.ค. 2026', 'วันที่ราคา (token แรก) = วันใหม่', JSON.stringify(hdrDates));
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
const oldLab = aapl.match(/id="mCur"><div class="lab">ปัจจุบัน \$([\d,.]+)/)[1];
ok(out.match(/id="mCur"><div class="lab">ปัจจุบัน \$([\d,.]+)/)[1] === U.fmtLike(301.5, oldLab), 'gauge label คงสไตล์ทศนิยมเดิม');

// ---------- price-only fallback (chartData = null) — คงกราฟเดิม แตะแค่จุดท้าย ----------
// ทางนี้เดิมใช้เฉพาะตอน Yahoo ไม่มีประวัติพอ · ตั้งแต่มี bad-chart มันเป็นทางของ `--force` ด้วย:
// ซีรีส์ต้นทางผสมสองฐาน แต่กราฟในไฟล์ถูกแก้ให้ถูกแล้ว ⇒ ประทับราคาได้โดยไม่ลากฐานที่สองกลับเข้ามา
const rdIn = JSON.parse(aapl.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
const oldPts = rdIn.chart.data;
const lastLab = oldPts[oldPts.length - 1][0];
const labMon = U.THAI_MONTHS.findIndex((m) => lastLab.startsWith(m));
const labYear = 2000 + parseInt(lastLab.slice(-2), 10);
// เดือนเดียวกับจุดท้าย → แทนค่าจุดเดิม (ไม่ต่อจุดใหม่)
const rSame = U.patchReport(aapl, { newPrice: 301.5, dateParts: { day: 11, monIdx: labMon, yearCE: labYear }, chartData: null });
const ptsSame = JSON.parse(rSame.html.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]).chart.data;
ok(ptsSame.length === oldPts.length, 'fallback: เดือนเดิม → ไม่ต่อจุดใหม่', `${oldPts.length} → ${ptsSame.length}`);
ok(ptsSame[ptsSame.length - 1][1] === 301.5, 'fallback: จุดท้าย = ราคาใหม่');
ok(ptsSame.slice(0, -1).every((p, i) => p[0] === oldPts[i][0] && p[1] === oldPts[i][1]),
  'fallback: จุดก่อนหน้าคงเดิมทุกจุด — ฐานราคาเดิมไม่ถูกแตะ (invariant ของ bad-chart + --force)');
// เดือนถัดไป → ต่อจุดใหม่แล้วตัดหัวให้ ≤13
const nextM = (labMon + 1) % 12, nextY = labYear + (labMon === 11 ? 1 : 0);
const rNext = U.patchReport(aapl, { newPrice: 301.5, dateParts: { day: 1, monIdx: nextM, yearCE: nextY }, chartData: null });
const ptsNext = JSON.parse(rNext.html.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]).chart.data;
ok(ptsNext.length <= 13, 'fallback: เดือนใหม่ → ต่อจุดแล้วยังคง ≤13 จุด (E37)', `ได้ ${ptsNext.length}`);
ok(ptsNext[ptsNext.length - 1][0] === `${U.THAI_MONTHS[nextM]}${String(nextY).slice(-2)}` && ptsNext[ptsNext.length - 1][1] === 301.5,
  'fallback: จุดใหม่ = เดือนของราคา + ราคาใหม่', JSON.stringify(ptsNext[ptsNext.length - 1]));

// ---------- gauge auto-rescale (แทน freeze outside-gauge-range) ----------
// ราคาทะลุ max → ขยาย max ให้ราคาอยู่ในขอบแบบ strict (check-site เตือนเมื่อ v >= gmax) · min คงเดิม
const gaugeIn = JSON.parse(aapl.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]).gauge;
const pxHigh = Math.round(gaugeIn.max * 1.02 * 100) / 100;
const rHigh = U.patchReport(aapl, { newPrice: pxHigh, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: U.buildChartData(mkBars(13, 2025, 6, 250), pxHigh, 0) });
const rdHigh = JSON.parse(rHigh.html.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
ok(rdHigh.gauge.cur === pxHigh, 'gauge rescale: cur = ราคาใหม่');
ok(rdHigh.gauge.max > pxHigh, 'gauge rescale: ราคาทะลุ max → max ใหม่ > ราคา (strict)', `max=${rdHigh.gauge.max} px=${pxHigh}`);
ok(rdHigh.gauge.max >= pxHigh * 1.05 - 0.01, 'gauge rescale: max ใหม่ ≥ ราคา×1.05', `max=${rdHigh.gauge.max}`);
ok(rdHigh.gauge.min === gaugeIn.min && rdHigh.gauge.fair === gaugeIn.fair, 'gauge rescale: min/fair ไม่แตะ');
// ราคาหลุด min → ขยาย min ลง · max คงเดิม
const pxLow = Math.round(gaugeIn.min * 0.98 * 100) / 100;
const rLow = U.patchReport(aapl, { newPrice: pxLow, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: U.buildChartData(mkBars(13, 2025, 6, 250), pxLow, 0) });
const rdLow = JSON.parse(rLow.html.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
ok(rdLow.gauge.min < pxLow, 'gauge rescale: ราคาหลุด min → min ใหม่ < ราคา (strict)', `min=${rdLow.gauge.min} px=${pxLow}`);
ok(rdLow.gauge.min <= pxLow * 0.95 + 0.01 && rdLow.gauge.min >= 0, 'gauge rescale: min ใหม่ ≤ ราคา×0.95 และไม่ติดลบ');
ok(rdLow.gauge.max === gaugeIn.max, 'gauge rescale: max ไม่แตะเมื่อหลุด min');
// ราคาอยู่ในขอบ → bounds ไม่ขยับ
const pxMid = Math.round((gaugeIn.min + gaugeIn.max) / 2 * 100) / 100;
const rMid = U.patchReport(aapl, { newPrice: pxMid, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: U.buildChartData(mkBars(13, 2025, 6, 250), pxMid, 0) });
const rdMid = JSON.parse(rMid.html.match(/<script[^>]*id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
ok(rdMid.gauge.min === gaugeIn.min && rdMid.gauge.max === gaugeIn.max, 'gauge rescale: ราคาในขอบ → bounds คงเดิม');

// ---------- MOS .big พลิกเครื่องหมายตามค่าจริง (dead-band flip ถูก patch ผ่านแล้ว) ----------
const pxOverFV = Math.round(FV * 1.01 * 100) / 100; // MOS ≈ −1%
const rNeg = U.patchReport(aapl, { newPrice: pxOverFV, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: U.buildChartData(mkBars(13, 2025, 6, 250), pxOverFV, 0) });
ok(/class="big">−[\d.]+%/.test(rNeg.html), 'MOS .big: ราคา > FV → เครื่องหมาย −', (rNeg.html.match(/class="big">[^<]*/) || [])[0]);
const pxUnderFV = Math.round(FV * 0.99 * 100) / 100; // MOS ≈ +1%
const rPos = U.patchReport(aapl, { newPrice: pxUnderFV, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: U.buildChartData(mkBars(13, 2025, 6, 250), pxUnderFV, 0) });
ok(/class="big">\+[\d.]+%/.test(rPos.html), 'MOS .big: ราคา < FV → เครื่องหมาย +', (rPos.html.match(/class="big">[^<]*/) || [])[0]);

// idempotent: patch ซ้ำด้วยข้อมูลเดิม → เนื้อหาเท่าเดิม
const r2 = U.patchReport(out, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData });
ok(r2.changed === false, 'patch ซ้ำข้อมูลเดิม → ไม่เปลี่ยน (idempotent)');

// วันที่แบบชื่อเดือนเต็ม + พ.ศ. (เคส ALLE/ADM/AIG) → แปลงเป็นตัวย่อ + คง พ.ศ.
// (แทนวันที่ปัจจุบันของ fixture ด้วย regex — ค่าในไฟล์เปลี่ยนทุกวันตาม cron ห้าม hard-code)
const aaplFull = aapl.replace(/ราคา\s*[≈ณ]*\s*\d{1,2}(?:\s*[–\-]\s*\d{1,2})?\s*[ก-ฮ][ก-ฮ.]+\s*\d{4}\s*<br>/, 'ราคา ณ 1 กรกฎาคม 2569<br>');
const rFull = U.patchReport(aaplFull, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData });
ok(rFull.html.includes('ราคา ณ 11 ก.ค. 2569<br>'), 'ชื่อเดือนเต็ม → ตัวย่อ + คงปี พ.ศ.', (rFull.html.match(/ราคา ณ[^<]*/) || [])[0]);
ok(!/กรกฎาคม/.test(rFull.html.match(/<header[\s\S]*?<\/header>/i)[0]), 'ไม่เหลือชื่อเดือนเต็มใน header');

// วันที่แบบไม่มีวัน (เคส CHD/DOHOME/PNC) → แทนเฉพาะใน .px-meta ได้วันเต็ม
const aaplNoDay = aapl.replace(/ราคา\s*[≈ณ]*\s*\d{1,2}(?:\s*[–\-]\s*\d{1,2})?\s*[ก-ฮ][ก-ฮ.]+\s*\d{4}\s*<br>/, 'ราคา ณ ธ.ค. 2568 (ธ.ค. 2025)<br>');
const rNoDay = U.patchReport(aaplNoDay, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData });
ok(rNoDay.html.includes('ราคา ณ 11 ก.ค. 2569 (11 ก.ค. 2026)<br>'), 'วันที่ไม่มีวัน → เติมวันครบ + คง era ต่อ token', (rNoDay.html.match(/ราคา ณ [^<]*/) || [])[0]);

// ---------- regression: แทนเฉพาะ "วันที่ราคา" ไม่แตะวันที่ที่เป็นข้อเท็จจริงในอดีต ----------
// บั๊ก 9 ส.ค. 2569: patchReport แทน date-token *ทุกตัว* ใน <header> ⇒ ทุกครั้งที่ cron รัน วัน ATH /
// วันมีผลของ split / วันประกาศงบ ถูกประทับเป็นวันที่รัน (INTC: ATH จริง 22 มิ.ย. 2026 หายไปเงียบ ๆ)
// gate จับไม่ได้เพราะฝั่งอ่าน (parsePriceAge) ก็หลงอ่าน token ท้าย ๆ เหมือนกัน — ดู tools/price-date.js
const pxMeta = (body) => `<div class="px-meta">\n        ${body}\n      </div>`;
const withPxMeta = (body) => aapl.replace(/<div class="px-meta">[\s\S]*?<\/div>/i, pxMeta(body));
const patchDates = (h) => U.patchReport(h, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData });

const aaplHist = withPxMeta(
  'ราคา ณ 3 ส.ค. 2026 (ปิดตลาด) • ร่วง ~28% จากจุดสูงสุดตลอดกาล $141.45 (22 มิ.ย. 2026)<br>\n'
  + '        ปรับ split 10:1 แล้ว (มีผล 14 พ.ค. 2026)<br>\n'
  + '        52 สัปดาห์ $20.44 – $142.35<br>\n'
  + '        ที่มา: StockAnalysis.com / Yahoo Finance (งบ Q2/2026 ประกาศ 22 ก.ค. 2026)');
ok(aaplHist !== aapl, 'fixture px-meta (ประวัติศาสตร์) apply แล้วเปลี่ยนจริง — anchor ไม่เพี้ยน');
const hdrHist = patchDates(aaplHist).html.match(/<header[\s\S]*?<\/header>/i)[0];
ok(/ราคา ณ 11 ก\.ค\. 2026 \(ปิดตลาด\)/.test(hdrHist), 'วันที่ราคา → วันใหม่', (hdrHist.match(/ราคา ณ [^•<]*/) || [])[0]);
ok(!/3 ส\.ค\. 2026/.test(hdrHist), 'ไม่เหลือวันที่ราคาเก่า');
ok(hdrHist.includes('จากจุดสูงสุดตลอดกาล $141.45 (22 มิ.ย. 2026)'), '★ วันจุดสูงสุดตลอดกาล คงเดิม (เคส INTC)');
ok(hdrHist.includes('ปรับ split 10:1 แล้ว (มีผล 14 พ.ค. 2026)'), '★ วันมีผลของ split คงเดิม (เคส KLAC/BNY/HON)');
ok(hdrHist.includes('(งบ Q2/2026 ประกาศ 22 ก.ค. 2026)'), '★ วันประกาศงบในบรรทัด ที่มา: คงเดิม (เคส IBM/ADVICE/RKLB)');

// วันที่ราคาที่ "ทวนซ้ำ" ในวงเล็บติดกัน (คนละศักราช) ต้องขยับตาม — ไม่งั้นหัวรายงานขัดกันเอง
// (AZN·CSGP·DPZ·HIG·PFE·PNC·SNNP) · เงื่อนไข: ติดกันจริง + เป็นวันเดียวกับวันที่ราคาเดิม
const hdrRestate = patchDates(withPxMeta('ราคา ณ 3 ส.ค. 2569 (3 ส.ค. 2026 ตลาดปิด)<br>\n        52 สัปดาห์ $20.44 – $142.35'))
  .html.match(/<header[\s\S]*?<\/header>/i)[0];
ok(/ราคา ณ 11 ก\.ค\. 2569 \(11 ก\.ค\. 2026 ตลาดปิด\)/.test(hdrRestate),
  'วันที่ทวนซ้ำในวงเล็บขยับตาม + คงศักราชของแต่ละตัว', (hdrRestate.match(/ราคา ณ [^<]*/) || [])[0]);

// วันเดียวกันแต่มีร้อยแก้วคั่น = คนละข้อเท็จจริง (เคส AMKR "· ร่วง ~24% วันเดียว (…)") → ต้องคงไว้
const hdrGap = patchDates(withPxMeta('ราคา ≈ 3 ส.ค. 2026 · ร่วง ~24% วันเดียว (3 ส.ค. 2026)<br>\n        52 สัปดาห์ $20.44 – $142.35'))
  .html.match(/<header[\s\S]*?<\/header>/i)[0];
ok(/ราคา ≈ 11 ก\.ค\. 2026 · ร่วง ~24% วันเดียว \(3 ส\.ค\. 2026\)/.test(hdrGap),
  '★ วันเดียวกันแต่มีร้อยแก้วคั่น = คงไว้ (ไม่ใช่การทวนซ้ำ)', (hdrGap.match(/ราคา ≈ [^<]*/) || [])[0]);

// ---------- regression: disclaimer "ราคา ณ" อัปเดต แต่ "ราคาเป้านักวิเคราะห์" คงเดิม (เคส CREDIT) ----------
// bug: regex prefix `ราคา` จับ "ราคาเป้านักวิเคราะห์" ด้วย → cron ทับวันที่ provenance ของราคาเป้า (ค่าที่ cron ไม่แตะ)
const withDisc = (body) => aapl.replace(/<div class="disc">[\s\S]*?<\/div>/i, `<div class="disc">${body}</div>`);
const discOut = U.patchReport(
  withDisc('ราคา ณ 3 ส.ค. 2569 · ราคาเป้านักวิเคราะห์ 7 ส.ค. 2569 · ที่มา Yahoo Finance'),
  { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData }
).html.match(/<div class="disc">[\s\S]*?<\/div>/i)[0];
ok(/ราคา ณ 11 ก\.ค\. 2569/.test(discOut), 'disclaimer: "ราคา ณ" → วันใหม่ (ยังอัปเดตวันที่ราคา)');
ok(/ราคาเป้านักวิเคราะห์ 7 ส\.ค\. 2569/.test(discOut), '★ disclaimer: วันที่ "ราคาเป้านักวิเคราะห์" คงเดิม (ไม่ถูก cron ทับ — เคส CREDIT)');
ok(!/ราคาเป้านักวิเคราะห์ 11 ก\.ค\./.test(discOut), 'disclaimer: ราคาเป้า ไม่ถูกประทับวันรัน');

// หาวันที่ราคาไม่เจอ (ไม่มีคำนำหน้า "ราคา") → throw ไป patch-failed ให้เห็นในคิว ดีกว่าเดาเขียนทับเงียบ ๆ
let threwDate = false;
try { patchDates(withPxMeta('อัปเดตล่าสุด 3 ส.ค. 2026<br>\n        52 สัปดาห์ $20.44 – $142.35')); }
catch (e) { threwDate = /วันที่ราคา/.test(e.message); }
ok(threwDate, 'ไม่มีคำนำหน้าราคา → throw (patch-failed) ไม่เดาเขียนทับ token อื่น');

// กราฟรายเดือน <2 จุด (IPO ใหม่มาก เคส SPCX) → ต้อง throw (freeze คงกราฟเดิม)
let threwIPO = false;
try { U.buildChartData([{ ts: Date.UTC(2026, 6, 1) / 1000, close: 145 }], 145, 0); } catch (e) { threwIPO = true; }
ok(threwIPO, 'กราฟ 1 จุด → throw (กัน build พังแบบ SPCX)');

// self-check: html ที่ไม่มี .px ต้อง throw (กัน patch เงียบ ๆ บนไฟล์ผิดโครง)
let threw = false;
try { U.patchReport(aapl.replace('<div class="px">', '<div class="pxx">'), { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData }); }
catch (e) { threw = true; }
ok(threw, 'self-check: ไฟล์ผิดโครง → throw (ไป flag patch-failed)');

// ---------- detectStaleQuotes (canary หุ้นหยุดเทรด/เพิกถอน) ----------
// เกณฑ์ = "ตลาดเดินหน้าไปกี่ session แล้วตัวนี้ยังค้าง" เทียบใน cohort สกุลเงินเดียวกัน
// (วัด relative จึงไม่ต้องรู้ปฏิทินวันหยุด · เสาร์-อาทิตย์ไม่นับเพราะไม่มีใครเทรด)
const at = (dayNum, h = 16) => dayNum * 86400 + h * 3600;
// epoch day จริงของสัปดาห์ที่ EA เพิกถอน — dow = (d+4)%7 (0=อาทิตย์) ตรวจแล้วตรงปฏิทิน 2569
const TUE_4AUG = 20669;   // วันซื้อขายสุดท้ายของ EA
const WED_5AUG = 20670;
const FRI_7AUG = 20672;   // session ล่าสุดของตลาด
const MON_10AUG = 20675;
const cohortOf = (n, dayNum, cur = 'USD', off = 0) => Array.from({ length: n }, (_, i) =>
  ({ symbol: `${cur}${i}`, currency: cur, marketTime: at(dayNum), gmtoffset: off, reportPrice: 10, marketPrice: 10, diffPct: 0 }));

ok(U.detectStaleQuotes(cohortOf(8, FRI_7AUG)).length === 0, 'stale: timestamp เท่ากันหมด → ไม่ flag');

// เคส EA จริง: ค้าง 4 ส.ค. ขณะตลาดถึง 7 ส.ค. = พลาด พ.-พฤ.-ศ. 3 session → ถึงเกณฑ์พอดี
const st = U.detectStaleQuotes(cohortOf(8, FRI_7AUG).concat(
  [{ symbol: 'DEAD', currency: 'USD', marketTime: at(TUE_4AUG), gmtoffset: 0, reportPrice: 209.7, marketPrice: 209.7, diffPct: 0 }]));
ok(st.length === 1 && st[0].symbol === 'DEAD', 'stale: ค้าง 3 session → flag', JSON.stringify(st.map((f) => f.symbol)));
ok(st[0].signal === 'stale-quote' && st[0].reason === undefined, 'stale: คืน signal ไม่ใช่ reason (ห้ามเขียนลง flag ตรง ๆ)');
ok(st[0].missedSessions === 3, 'stale: นับ session ที่พลาดได้ถูก', String(st[0] && st[0].missedSessions));

// ค้าง 2 session ยังไม่ถึงเกณฑ์ → ปล่อยผ่าน (กัน false positive หุ้นสภาพคล่องต่ำ)
ok(U.detectStaleQuotes(cohortOf(8, FRI_7AUG).concat([{ symbol: 'THIN', currency: 'USD', marketTime: at(WED_5AUG), gmtoffset: 0 }])).length === 0,
  'stale: ค้าง 2 session → ยังไม่ flag');

// เสาร์-อาทิตย์ต้องไม่ทำให้ตัวปกติกลายเป็น stale: ศุกร์ → จันทร์ = ผ่านแค่ 1 session
ok(U.detectStaleQuotes(cohortOf(8, MON_10AUG).concat([{ symbol: 'FRIDAY', currency: 'USD', marketTime: at(FRI_7AUG), gmtoffset: 0 }])).length === 0,
  'stale: ข้ามสุดสัปดาห์ (ศ→จ) = 1 session → ไม่ flag');

// คนละตลาด = คนละ cohort — SET ปิดก่อน NYSE + วันหยุดไม่ตรงกัน ห้ามเทียบข้ามกัน
const mixed = cohortOf(6, FRI_7AUG).concat(cohortOf(6, TUE_4AUG, 'THB', 25200));
ok(U.detectStaleQuotes(mixed).length === 0, 'stale: THB ช้ากว่า USD 3 วัน แต่แยก cohort → ไม่ flag',
  JSON.stringify(U.detectStaleQuotes(mixed).map((f) => f.symbol)));

// cohort เล็ก (รัน --only ไม่กี่ตัว) → คาลิเบรตไม่ได้ ไม่ flag แม้ห่างมาก
ok(U.detectStaleQuotes([
  { symbol: 'A', currency: 'USD', marketTime: at(FRI_7AUG), gmtoffset: 0 },
  { symbol: 'B', currency: 'USD', marketTime: at(FRI_7AUG - 20), gmtoffset: 0 },
]).length === 0, 'stale: cohort < 5 ตัว → ไม่ flag (รัน --only)');

// เคส BPP จริง: ค้าง 3 สัปดาห์ (16 ก.ค. → 7 ส.ค.)
const bppFlags = U.detectStaleQuotes(cohortOf(10, FRI_7AUG, 'THB', 25200).concat(
  [{ symbol: 'BPP', currency: 'THB', marketTime: at(FRI_7AUG - 22), gmtoffset: 25200, reportPrice: 12, marketPrice: 12, diffPct: 0 }]));
ok(bppFlags.length === 1 && bppFlags[0].symbol === 'BPP', 'stale: เคส BPP (ค้าง 3 สัปดาห์) → flag');
ok(bppFlags[0].missedSessions >= 14, 'stale: BPP นับได้ ≥14 session', String(bppFlags[0] && bppFlags[0].missedSessions));

// marketTime เสีย → ข้ามเงียบ ๆ ไม่ crash ไม่ flag
ok(U.detectStaleQuotes(cohortOf(8, FRI_7AUG).concat([{ symbol: 'NAN', currency: 'USD', marketTime: null, gmtoffset: 0 }])).length === 0,
  'stale: marketTime null → ข้าม ไม่ flag');

// จูนเกณฑ์ผ่าน opts ได้ (workflow/ผู้ใช้ปรับได้ ไม่ต้องแก้โค้ด)
ok(U.detectStaleQuotes(cohortOf(8, FRI_7AUG).concat([{ symbol: 'THIN', currency: 'USD', marketTime: at(WED_5AUG), gmtoffset: 0 }]), { sessions: 2 }).length === 1,
  'stale: opts.sessions=2 → ตัวค้าง 2 session ถูก flag');

// ---------- probeCap / classifyStale (ยืนยันหุ้นตายด้วยแหล่งที่สองก่อน flag) ----------
// ทำไมต้องยืนยัน: regularMarketTime ค้างที่ "วันซื้อขายล่าสุด" ไม่ใช่ "session ล่าสุด" (วัด 204/205
// หุ้นไทยในรีโป) → หุ้นสภาพคล่องต่ำ (NRF/PB/ZEN) volume 0 หลายวันจะหน้าตาเหมือนหุ้นตายเป๊ะ ๆ
ok(U.probeCap(784) === 39, 'probeCap: 5% ของ cohort ใหญ่', String(U.probeCap(784)));
ok(U.probeCap(20) === 5 && U.probeCap(0) === 5, 'probeCap: พื้นขั้นต่ำ 5 ตัว');

// ★ เพดานต้องคิดต่อ cohort: ป้อนจำนวนทั้งรีโป (782) จะได้ 39 เท่ากันทั้งสองตลาด = 5% ของ US (~578)
// แต่เป็น 19% ของ SET (~204) ⇒ ตลาดเล็กโดนปล่อยผ่านเกินที่ยามตั้งใจกันเกือบ 4 เท่า
const quotesUS = Array.from({ length: 578 }, (_, i) => ({ symbol: `U${i}`, currency: 'USD', marketTime: 1 }));
const quotesTH = Array.from({ length: 204 }, (_, i) => ({ symbol: `T${i}`, currency: 'THB', marketTime: 1 }));
const allQuotes = quotesUS.concat(quotesTH);
const candTH = (n) => Array.from({ length: n }, (_, i) => ({ symbol: `T${i}`, cohort: 'THB' }));
const cap15 = U.capByCohort(candTH(15), allQuotes);
ok(cap15.kept.length === 0 && cap15.over[0].cap === 10 && cap15.over[0].cohort === 'THB',
  'capByCohort: 15 ตัวใน cohort THB (204) เกินเพดาน 10 → ไม่ถาม', JSON.stringify(cap15.over));
ok(U.capByCohort(candTH(9), allQuotes).kept.length === 9, 'capByCohort: ต่ำกว่าเพดาน cohort → ผ่านครบ');
// cohort หนึ่งเพี้ยนต้องไม่ลากอีก cohort ทิ้งไปด้วย
const mixedCap = U.capByCohort(candTH(15).concat([{ symbol: 'EA', cohort: 'USD' }]), allQuotes);
ok(mixedCap.kept.length === 1 && mixedCap.kept[0].symbol === 'EA',
  'capByCohort: THB เพี้ยนแต่ USD ยังถูกถาม (แยกกันคนละตลาด)', JSON.stringify(mixedCap.kept.map((c) => c.symbol)));
// quote ที่ไม่มี timestamp ไม่ถูกนับเป็น cohort (ตรงกับที่ detectStaleQuotes ข้าม)
// ★ ตัวเลขต้องเลือกให้ "นับ" กับ "ไม่นับ" ให้คำตอบต่างกันจริง ไม่งั้น assert ผ่านทั้งสองทาง:
// 100 ตัวจริง → cap 5 (6 candidate = เกิน) · ถ้าเผลอนับ 40 ตัวที่ marketTime null ด้วย → 140 → cap 7 (ไม่เกิน)
const q100 = Array.from({ length: 100 }, (_, i) => ({ symbol: `T${i}`, currency: 'THB', marketTime: 1 }));
const qNull = Array.from({ length: 40 }, (_, i) => ({ symbol: `N${i}`, currency: 'THB', marketTime: null }));
ok(U.probeCap(100) === 5 && U.probeCap(140) === 7, 'capByCohort: fixture แยกสองกรณีได้จริง (cap 5 vs 7)');
ok(U.capByCohort(candTH(6), q100.concat(qNull)).over.length === 1,
  'capByCohort: cohort นับเฉพาะ quote ที่มี marketTime (นับ null ด้วยจะกลายเป็นไม่เกินเพดาน)',
  JSON.stringify(U.capByCohort(candTH(6), q100.concat(qNull))));

const cands = [
  { symbol: 'NRF', cohort: 'THB', missedSessions: 55, reportPrice: 5, marketPrice: 5, diffPct: 0 },
  { symbol: 'EA', cohort: 'USD', missedSessions: 3, reportPrice: 209.7, marketPrice: 209.7, diffPct: 0 },
];
const pm = new Map([['NRF', ['SET:NRF']], ['EA', ['NASDAQ:EA', 'NYSE:EA']]]);
// rows = ผลจาก TradingView scanner (Map ticker → {price, currency}) — ตัวไหนไม่อยู่ในนี้ = scanner ไม่พบ
const rowsFor = (tickers) => new Map(tickers.map((t) => [t, { price: 1, currency: 'THB' }]));
const cs = U.classifyStale(cands, rowsFor(['SET:NRF']), pm);
ok(cs.quiet.length === 1 && cs.quiet[0].symbol === 'NRF' && cs.quiet[0].ticker === 'SET:NRF',
  'classifyStale: ยังอยู่บนกระดาน → quiet (ไม่มีคนเทรด ไม่ใช่ตาย)', JSON.stringify(cs.quiet.map((q) => q.symbol)));
ok(cs.dead.length === 1 && cs.dead[0].symbol === 'EA', 'classifyStale: ไม่พบทุกกระดาน → dead');
ok(cs.dead[0].reason === 'not-on-exchange', 'classifyStale: reason เดียวกับ canary รายสัปดาห์ (triage ตรงกัน)');
ok(cs.dead[0].missedSessions === 3 && cs.dead[0].detail, 'classifyStale: พา missedSessions + detail ไปด้วย');
const csEmpty = U.classifyStale([], new Map(), new Map());
ok(csEmpty.dead.length === 0 && csEmpty.quiet.length === 0, 'classifyStale: ไม่มี candidate → ว่างทั้งคู่');
// หุ้นสภาพคล่องต่ำที่ค้างนานมาก (NRF 55 session) ต้องไม่ถูก flag ถ้า ticker ยังอยู่ — เคสที่ review จับได้
ok(U.classifyStale([cands[0]], rowsFor(['SET:NRF']), pm).dead.length === 0,
  'classifyStale: ค้าง 55 session แต่ ticker อยู่ → ไม่ flag (กัน FP 99/248 วันที่วัดได้)');

// ---------- ยาม scanner ตอบเปล่า ----------
// scan() throw เฉพาะตอน body ว่าง/JSON เสีย/HTTP error — **ไม่ throw** เมื่อ scanner ตอบ 200 พร้อม
// `{"data":[]}` (โดนบล็อก/เปลี่ยนโครง) ⇒ rows ว่าง ⇒ classifyStale เห็นว่าไม่มีใครอยู่บนกระดาน = flag ยกชุด
// ตัวยามนี้คือคู่ของ shouldAbort ใน canary รายสัปดาห์ ที่ path รายวันเคยไม่มี
const ctl = U.controlTickers([{ cohort: 'THB' }, { cohort: 'USD' }, { cohort: 'THB' }]);
ok(ctl.includes('SET:PTT') && ctl.includes('NASDAQ:AAPL') && new Set(ctl).size === ctl.length,
  'controlTickers: ครอบทุก cohort ที่มี candidate ไม่ซ้ำ', JSON.stringify(ctl));
ok(U.controlTickers([{ cohort: 'THB' }]).length >= 2,
  'controlTickers: หลายตัวต่อ cohort (control เองก็ถูกควบ/เปลี่ยนชื่อได้ ตัวเดียวคือจุดล้มเดี่ยว)');

const TH1 = [{ symbol: 'A', cohort: 'THB' }];
ok(U.unverifiedCohorts(TH1, new Map()).has('THB'), 'unverifiedCohorts: rows ว่างทั้งหมด → cohort ยืนยันไม่ได้ (ไม่ใช่หุ้นตายยกชุด)');
ok(U.unverifiedCohorts(TH1, rowsFor(['SET:PTT'])).size === 0, 'unverifiedCohorts: control ตอบ → cohort ปกติ');
ok(U.unverifiedCohorts(TH1, rowsFor(['SET:AOT'])).size === 0, 'unverifiedCohorts: control สำรองตอบตัวเดียวก็พอ (กัน control ตัวหลักถูกเปลี่ยนชื่อ)');
// ★ ต้องแยกเป็นราย cohort: ตลาดหนึ่งเงียบต้องไม่ทำให้อีกตลาดถูกตัดสินโดยไม่มี control และไม่ลากทั้งรอบทิ้ง
const mixedCohorts = [{ symbol: 'A', cohort: 'THB' }, { symbol: 'B', cohort: 'EUR' }];
const badMixed = U.unverifiedCohorts(mixedCohorts, rowsFor(['SET:PTT']));
ok(badMixed.has('EUR') && !badMixed.has('THB'),
  'unverifiedCohorts: cohort ที่ไม่มี control → fail closed เฉพาะตัวมันเอง (THB ที่ control ตอบยังไปต่อ)',
  JSON.stringify([...badMixed]));
ok(U.unverifiedCohorts(mixedCohorts, new Map()).size === 2, 'unverifiedCohorts: ทุก cohort เงียบ → ยืนยันไม่ได้ทั้งคู่');
// candidate ตายจริงตัวเดียวต้องยัง flag ได้ — เหตุผลที่ยามเช็ค control ไม่ใช่ rows.size ล้วน ๆ
ok(U.unverifiedCohorts([{ symbol: 'EA', cohort: 'USD' }], rowsFor(['NASDAQ:AAPL'])).size === 0
  && U.classifyStale([{ symbol: 'EA', cohort: 'USD', missedSessions: 3 }], rowsFor(['NASDAQ:AAPL']), new Map([['EA', ['NASDAQ:EA']]])).dead.length === 1,
  'unverifiedCohorts: control ตอบแต่ candidate ไม่ตอบ → ยัง flag ตัวที่ตายจริงได้ (ไม่ใช่ false negative)');

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

// flag ที่ dead-ticker-canary เป็นเจ้าของ: cron รายวันไม่รู้จักเหตุผลนี้ ห้ามเคลียร์ทิ้ง
// (ไม่งั้น canary รายสัปดาห์เขียน not-on-exchange คืนหนึ่ง เช้าวันถัดไปหายเกลี้ยง — เงียบสนิท)
const withExternal = [
  { symbol: 'EA', reason: 'not-on-exchange', reportPrice: 209.7, flaggedAt: '2026-08-04' },
  { symbol: 'CCC', reason: 'drift-gt-15pct', flaggedAt: '2026-08-05' },
];
const keptExt = U.mergeFlags(withExternal, new Set(['EA', 'CCC']), []);
ok(keptExt.length === 1 && keptExt[0].symbol === 'EA', 'flags: not-on-exchange รอด cron รายวัน · drift ที่หายถูกเคลียร์', JSON.stringify(keptExt.map((f) => f.symbol + ':' + f.reason)));
ok(keptExt[0].flaggedAt === '2026-08-04', 'flags: not-on-exchange คงวันที่เดิม ไม่รีเซ็ตทุกวัน');

const bothFlags = U.mergeFlags(withExternal, new Set(['EA']), [{ symbol: 'EA', reason: 'drift-gt-15pct', reportPrice: 209.7, marketPrice: 250, diffPct: 19.2 }]);
ok(bothFlags.filter((f) => f.symbol === 'EA').length === 1, 'flags: ไม่เกิด entry ซ้ำเมื่อทั้งสองเครื่องมือ flag ตัวเดียวกัน', JSON.stringify(bothFlags));
ok(bothFlags.find((f) => f.symbol === 'EA').reason === 'not-on-exchange', 'flags: ticker ตาย (not-on-exchange) ชนะ drift — triage คือยืนยันแล้วลบ');

// ---------- commitBody ----------
const body = U.commitBody(
  [{ symbol: 'AAPL', old: 297.21, new: 315.32, diffPct: 6.1 }, { symbol: 'HMPRO', old: 6.15, new: 6.05, diffPct: -1.6 }],
  [{ symbol: 'XYZ', reason: 'drift-gt-10pct', reportPrice: 100, marketPrice: 115, diffPct: 15 }]
);
ok(body.includes('AAPL 297.21 → 315.32 (+6.1%)'), 'commitBody: บรรทัดต่อหุ้น + เครื่องหมาย +');
ok(body.includes('HMPRO 6.15 → 6.05 (-1.6%)'), 'commitBody: ขาลงไม่มี +');
ok(body.includes('freeze XYZ [drift-gt-10pct] 100 → 115 (+15%)'), 'commitBody: บรรทัด freeze พร้อมเหตุผล');
ok(U.commitBody([], []) === '', 'commitBody: ว่างเมื่อไม่มีอะไรเปลี่ยน');

console.log(nFail ? `\n✗ update-prices-test: ${nFail} failed / ${nOK} passed` : `\n✓ update-prices-test: ${nOK} passed`);
process.exit(nFail ? 1 : 0);
