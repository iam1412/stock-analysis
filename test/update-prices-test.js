#!/usr/bin/env node
'use strict';
/**
 * update-prices-test.js — unit-test tools/update-prices.js แบบ offline (mock ข้อมูล Yahoo, ไม่ยิง network)
 * ตรวจว่า patch แล้ว "ตัวเลขสอดคล้องกันเอง" ตามที่ gate บังคับ (E16/E23/E30/E31/E34–E37)
 * + กติกา freeze ทำงานถูก + flags merge ถูก · fixture = test/fixtures/AAPL.html (แช่แข็ง — ดู test/fixtures/README.md)
 */
const fs = require('fs');
const path = require('path');
const U = require('../tools/update-prices.js');
const FX = require('./fixtures');
const RM = require('../tools/report-meta.js');   // เจ้าของเดียวของ regex stock-meta/report-data/.px
const PD = require('../tools/price-date.js');    // ตัวหา token วันที่ราคา/วันที่ทวนซ้ำ — ใช้ตัวเดียวกับ cron ไม่เขียน regex วันที่ในเทส
process.env.STALE_TODAY = FX.TODAY;   // gate ที่ Task 7 เรียกผ่าน gateAfterPatch ต้องไม่เดินตามปฏิทินจริง

let nOK = 0, nFail = 0;
let pending = null;   // lockfile ระยะ 1: promise ของเคส async — tally ต้องรอก่อนพิมพ์ (ดูท้ายไฟล์)
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
const fv = base.fv;
ok(U.decide({ ...base, oldPrice: fv * 0.93, newPrice: fv * 1.06 }).freeze === 'mos-sign-flip', 'decide: MOS พลิกเกิน dead-band ทั้งสองฝั่ง (+7→−6) → freeze');
ok(U.decide({ ...base, oldPrice: fv * 0.93, newPrice: fv * 1.01 }).freeze === 'mos-sign-flip', 'decide: ฝั่งเก่าเกิน dead-band (+7→−1) → freeze');
ok(U.decide({ ...base, oldPrice: fv * 0.983, newPrice: fv * 1.06 }).freeze === 'mos-sign-flip', 'decide: ฝั่งใหม่เกิน dead-band (+1.7→−6) → freeze');
ok(U.decide({ ...base, oldPrice: fv * 0.96, newPrice: fv * 1.04 }).update === true, 'decide: flip ใน dead-band ±5 (+4→−4) → update (noise รอบ FV — ข้อ D ระยะ 1)');
// ★ ขอบเส้นพอดี: |MOS ใหม่| = 5.0 เป๊ะ (ราคา = FV×1.05) — ตรึงว่าเกณฑ์เป็น `<=` ไม่ใช่ `<`
//   (ทั้งสองฝั่งอยู่ในแบนด์ ⇒ patch ผ่าน ไม่ freeze · ถ้าใครเปลี่ยนเป็น `<` เคสนี้จะกลายเป็น mos-sign-flip ทันที)
ok(U.decide({ ...base, oldPrice: fv * 0.96, newPrice: fv * 1.05 }).update === true, 'decide: flip ที่ |MOS ใหม่| = 5.0 พอดี (+4→−5) → update (เกณฑ์เป็น ≤ ไม่ใช่ <)', JSON.stringify(U.decide({ ...base, oldPrice: fv * 0.96, newPrice: fv * 1.05 })));
ok(U.MOS_FLIP_DEADBAND_PP === 5, 'MOS_FLIP_DEADBAND_PP = 5 (ข้อ D)');
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
// fixture แช่แข็ง (test/fixtures) — ยังคงกติกาเดิม: ห้าม hard-code ราคา/วันที่/FV อ่านจาก stock-meta ของ input แล้วเทียบเชิงสัมพัทธ์
const aapl = FX.AAPL();
const smIn = RM.readStockMeta(aapl);
const FV = smIn.fairValue;
const chartData = U.buildChartData(mkBars(13, 2025, 6, 250), 301.5, 0);
const r = U.patchReport(aapl, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData });
const out = r.html;

const sm = RM.readStockMeta(out);
const rd = RM.readReportData(out).data;
ok(out.includes('<div class="px">$301.50<small>'), 'px header อัปเดต');
ok(sm.price === 301.5, 'stock-meta.price');
ok(Math.abs(sm.mos - (FV - 301.5) / FV * 100) < 0.06, 'stock-meta.mos = (FV−p)/FV (E31)');
ok(Math.abs(sm.upside - (FV - 301.5) / 301.5 * 100) < 0.06, 'stock-meta.upside (E31)');
ok(sm.roe === smIn.roe && sm.fairValue === FV && sm.symbol === 'AAPL', 'stock-meta คีย์ที่ไม่ขึ้นกับราคาคงเดิม (roe/fairValue/symbol)');
// ★ pe **ต้องขยับตามราคา** (19 ส.ค. 69): P/E = ราคา ÷ EPS ⇒ ปล่อยค้าง = ค่าที่ derive จากราคาเพี้ยนทั้งคลัง
// (ก่อนแก้: 233/908 ใบมี P/E ไม่ตรงกับ ราคา÷EPS ที่ตัวเองพิมพ์ไว้ — E41 จับ · patchDerived ซ่อม)
{
  const DV = require('../tools/derived-values.js');
  const bases = DV.peCards(out).flatMap((c) => c.eps);
  ok(bases.length > 0, 'AAPL fixture: มีการ์ด P/E ที่ประกาศฐาน EPS ของตัวเอง (ถ้าไม่มี เทสด้านล่างพิสูจน์อะไรไม่ได้)');
  ok(bases.some((e) => Math.abs(sm.pe - 301.5 / e) <= Math.max(0.02 * sm.pe, 0.1)),
    'stock-meta.pe = ราคาใหม่ ÷ EPS ที่ไฟล์ประกาศ (กติกาเดียวกับ E41)', `pe ${smIn.pe} → ${sm.pe} · EPS ${bases.join('/')}`);
  // ค่าที่ค้างจนหลุดฐานไปไกล ต้องถูกเขียนใหม่ ไม่ใช่ปล่อยผ่าน (เคส ARM/JBL/STX/FORM/CRDO)
  const staleOut = U.patchReport(aapl.replace(/"pe":\s*[0-9.]+/, '"pe":999'),
    { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: null }).html;
  const staleSm = RM.readStockMeta(staleOut);
  ok(staleSm.pe !== 999 && bases.some((e) => Math.abs(staleSm.pe - 301.5 / e) <= Math.max(0.02 * staleSm.pe, 0.1)),
    'stock-meta.pe ที่ค้างหลุดฐาน (999) ถูกเขียนใหม่ตามราคา', String(staleSm.pe));
  // การ์ด P/E ที่โชว์บนหน้าเว็บก็ต้องขยับ — และต้องคงจำนวนทศนิยม/รูปแบบเดิม
  for (const c of DV.peCards(out))
    ok(c.eps.some((e) => DV.nearPE(301.5 / e, c.shown)), `การ์ด [${c.label}] = ราคาใหม่ ÷ EPS ที่การ์ดพิมพ์ไว้`, `โชว์ ${c.shown}x · EPS ${c.eps.join('/')}`);
  // ป้ายเชิงประวัติ ("P/E เฉลี่ย ~5 ปี") ไม่ใช่ ราคา÷EPS — cron ห้ามแตะ แม้บรรทัดคำอธิบายจะมี EPS ปนอยู่
  const histIn = aapl.match(/<div class="k">(P\/E (?:เฉลี่ย|มัธยฐาน)[^<]*)<\/div>\s*<div class="v[^"]*"[^>]*>([^<]*)</);
  if (histIn) {
    const histOut = out.match(new RegExp(`<div class="k">${histIn[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</div>\\s*<div class="v[^"]*"[^>]*>([^<]*)<`));
    ok(histOut && histOut[1] === histIn[2], `การ์ด P/E เชิงประวัติ [${histIn[1]}] ไม่ถูกแตะ`, `${histIn[2]} → ${histOut && histOut[1]}`);
  }
  // % ของราคาเป้าในการ์ด = (เป้า − ราคาใหม่)/ราคาใหม่ (E42 · เคส AAOI)
  for (const c of DV.targetCells(out))
    ok(Math.abs((c.target - 301.5) / 301.5 * 100 - c.shown) <= DV.TOL_TGT_PP, `การ์ด [${c.label}]: % ของราคาเป้าตรงกับราคาใหม่`, `เป้า ${c.target} → ${c.shown}%`);
  // ── Market Cap = ราคา × หุ้น · P/S = Market Cap ÷ รายได้ (19 ส.ค. 69 — E43/W16) ──
  const dpMC = { day: 11, monIdx: 6, yearCE: 2026 };
  const MC_RE = /(<div class="k">Market Cap<\/div>\s*<div class="v[^"]*"[^>]*>)([\s\S]*?)(<\/div>\s*<div class="d[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/;
  const mcIn = aapl.match(MC_RE);
  ok(!!mcIn, 'AAPL fixture: มีการ์ด Market Cap พร้อมบรรทัดจำนวนหุ้น');
  if (mcIn) {
    const setMC = (h, v, d) => h.replace(MC_RE, (m, a, ov, b, od, z) => a + v + b + (d === undefined ? od : d) + z);
    const mcOut = DV.mcapCards(out, 301.5)[0];
    ok(mcOut && DV.nearMcap(301.5 * mcOut.shares, mcOut.shown, mcOut.num, mcOut.scale),
      'การ์ด Market Cap = ราคาใหม่ × จำนวนหุ้นที่พิมพ์ไว้', mcOut && `${mcIn[2].trim()} → โชว์ ${mcOut.num}`);
    // ค่าที่ค้างมาก ๆ ต้องถูกเขียนใหม่ (ไม่ใช่ปล่อยผ่านเพราะ "ไกลเกิน")
    const staleMC = U.patchReport(setMC(aapl, `~$${(301.5 * DV.parseShares(mcIn[4]) * 0.75 / 1e9).toFixed(1)}B`),
      { newPrice: 301.5, dateParts: dpMC, chartData: null }).html;
    const sc = DV.mcapCards(staleMC, 301.5)[0];
    ok(sc && DV.nearMcap(301.5 * sc.shares, sc.shown, sc.num, sc.scale), 'Market Cap ที่ค้าง 25% ถูกเขียนใหม่ตามราคา', sc && String(sc.num));
    // ADR/ADS: จำนวนหน่วย ≠ หุ้นที่ใช้คิด cap → ห้ามแตะ (เคส BABA/ASML/BIDU)
    const adr = setMC(aapl, '~$100B', '~385 ล้าน ADR');
    ok(U.patchReport(adr, { newPrice: 301.5, dateParts: dpMC, chartData: null }).html.includes('~$100B'),
      'บรรทัดเป็นจำนวน ADR → cron ไม่แตะ Market Cap (เดา = ผิดหลักเลข)');
    // หลุดย่าน = คนละฐาน (cap ของทั้งกลุ่ม/หุ้นบางคลาส) → ห้ามแตะ
    const oob = setMC(aapl, `~$${(301.5 * DV.parseShares(mcIn[4]) * 0.1 / 1e9).toFixed(1)}B`);
    const oobV = oob.match(MC_RE)[2];
    ok(U.patchReport(oob, { newPrice: 301.5, dateParts: dpMC, chartData: null }).html.includes(oobV),
      'ราคาที่ implied หลุดย่าน (คนละฐาน) → cron ไม่แตะ', oobV.trim());
    // P/S: ตัวตั้งมาจากการ์ด Market Cap (ข้ามการ์ด) — patch ได้เมื่ออ่านฐานได้
    const shares = DV.parseShares(mcIn[4]);
    const revB = 301.5 * shares / 4 / 1e9;   // รายได้ที่ทำให้ P/S = 4.00x
    const withPS = aapl.replace('<div class="metric">',
      `<div class="metric"><div class="k">P/S (TTM)</div><div class="v">2.5x</div><div class="d">รายได้ TTM $${revB.toFixed(2)}B</div></div><div class="metric">`);
    const psOut = DV.psCards(U.patchReport(withPS, { newPrice: 301.5, dateParts: dpMC, chartData: null }).html)[0];
    ok(psOut && Math.abs(psOut.shown - 4) <= 0.15, 'P/S ถูกเขียนใหม่ = Market Cap ÷ รายได้ที่พิมพ์', psOut && `${psOut.shown}x`);
  }

  // ── ปันผล % + stock-meta.dividendYield + P/BV (11 ก.ย. 69 — W19/W20) ──
  // ตัวหาร (DPS/BVPS) พิมพ์อยู่ในบรรทัด .d ของการ์ดเอง ⇒ cron คิดใหม่จากราคาที่เพิ่ง patch ไม่มีอะไรให้เดา
  // (เคส FDS/KLAC/LRCX 11 ก.ย. 69: ปันผลลอยตามราคาทั้งคลัง เพราะ cron ไม่มีโค้ดส่วนนี้เลย)
  {
    const Y_RE = /(<div class="k">เงินปันผล<\/div>\s*<div class="v[^"]*">)([^<]*)(<\/div>\s*<div class="d[^"]*">)([^<]*)(<)/;
    const yV = (h) => (h.match(Y_RE) || [])[2];
    const smY = (h) => RM.readStockMeta(h).dividendYield;
    const yIn = aapl.match(Y_RE);
    const dm = yIn && yIn[4].match(/\$\s*([\d.]+)\s*\/\s*ปี/);
    ok(!!dm, 'AAPL fixture: มีการ์ดปันผลที่ประกาศ DPS รายปีในบรรทัด .d (ไม่งั้นเทสด้านล่างพิสูจน์อะไรไม่ได้)', yIn && yIn[4]);
    if (dm) {
      const dpsA = parseFloat(dm[1]);
      const want = dpsA / 301.5 * 100;
      const dec = (String(yIn[2]).match(/\.(\d+)\s*%/) || [, ''])[1].length;
      const wantS = want.toFixed(dec) + '%';
      // ★ เทียบ "ตรงตัว" ไม่ใช่ ±0.006 — AAPL บนดิสก์บังเอิญอยู่ใกล้ 301.5 (0.35 vs 0.345) ⇒ เกณฑ์หลวมผ่านได้โดยไม่มีโค้ดเลย
      ok(yV(out).replace(/^~/, '') === wantS, 'cron: การ์ดปันผล = DPS ที่พิมพ์ ÷ ราคาใหม่ (W19)', `${yIn[2]} → ${yV(out)} · ควร ${wantS}`);
      const setY = (v, d) => aapl.replace(Y_RE, (m, a, ov, b, od, z) => a + v + b + (d === undefined ? od : d) + z);
      // ตั้งทั้งการ์ดและ stock-meta ให้ค้าง 30% (ในย่าน) เอง — ไม่ยืนบนสภาพไฟล์บนดิสก์ (CI patch ราคาของวันก่อน verify)
      const staleIn = setY(`${(want * 1.3).toFixed(dec)}%`).replace(/("dividendYield":\s*)[0-9.]+/, `$1${(want * 1.3).toFixed(2)}`);
      const staleY = U.patchReport(staleIn, { newPrice: 301.5, dateParts: dpMC, chartData: null }).html;
      ok(yV(staleY) === wantS, 'cron: การ์ดปันผลที่ค้าง 30% ถูกเขียนใหม่ตามราคา', yV(staleY));
      ok(smY(staleY) === parseFloat(want.toFixed(Math.max(dec, 1))), 'cron: stock-meta.dividendYield ที่ค้าง 30% = กระจกของ DPS ÷ ราคาใหม่', `${smY(staleIn)} → ${smY(staleY)}`);
      // .d มีแต่ DPS รายไตรมาส → ห้ามแตะ (รับเป็นรายปี = yield ผิด 4 เท่า)
      const qtr = setY('0.45%', `$${(dpsA / 4).toFixed(2)}/ไตรมาส`);
      ok(yV(U.patchReport(qtr, { newPrice: 301.5, dateParts: dpMC, chartData: null }).html) === '0.45%', 'cron: .d มีแต่ DPS รายไตรมาส → ไม่แตะการ์ดปันผล');
    }
    // P/BV — ฉีดการ์ดที่ประกาศ BVPS (AAPL จริงไม่มีการ์ด P/BV)
    const withPBV = aapl.replace('<div class="metric">', '<div class="metric"><div class="k">P/BV</div><div class="v">~40.0x</div><div class="d">BVPS ~$6.03</div></div><div class="metric">');
    const pbvV = (U.patchReport(withPBV, { newPrice: 301.5, dateParts: dpMC, chartData: null }).html.match(/<div class="k">P\/BV<\/div>\s*<div class="v[^"]*">([^<]*)</) || [])[1];
    ok(pbvV === `~${(301.5 / 6.03).toFixed(1)}x`, 'cron: P/BV = ราคาใหม่ ÷ BVPS ที่พิมพ์ (W20) — คง "~" + ทศนิยมเดิม', pbvV);
  }

  // ── หมวด 6: ผลตอบแทนฉาก 3 ปี + ป้าย "จากจุดเข้า" (20 ส.ค. 69 — W17) ──
  // ราคาเป้า (EPS ปี 3 × P/E ออก) เป็นสมมติฐานของนักวิเคราะห์ ⇒ ห้ามแตะ
  // แต่ % ที่วัดจากจุดเข้า derive จากราคาล้วน ๆ ⇒ cron ต้องขยับ ไม่งั้นฉาก Bear โชว์กำไรตอนราคาขึ้น (เคส RGLD)
  {
    const scn = (h) => [...h.matchAll(/<div class="ret[^"]*">([^<]*)<\/div>/g)].map((m) => m[1].trim());
    const n1 = (s) => parseFloat(String(s).replace(/−/g, '-').replace(/[^0-9.\-]/g, ' ').trim().split(/\s+/)[0]);
    const tgts = [...aapl.matchAll(/<div class="tgt">\s*\$?\s*([\d.,]+)/g)].map((m) => parseFloat(m[1]));
    const cagr = (v) => (Math.pow(1 + v / 100, 1 / 3) - 1) * 100;
    ok(tgts.length === 3, 'AAPL fixture: มีฉาก 3 คอลัมน์พร้อมราคาเป้า (ไม่งั้นเทสด้านล่างพิสูจน์อะไรไม่ได้)', JSON.stringify(tgts));

    // 1) เส้นทาง cron ปกติ (patchReport) — ผลตอบแทนรวมต้องเท่ากับ (เป้า − ราคาใหม่)/ราคาใหม่
    const got = scn(out);
    tgts.forEach((t, i) => {
      const want = (t - 301.5) / 301.5 * 100;
      ok(Math.abs(n1(got[i]) - want) <= 1, `cron: ฉากที่ ${i + 1} ผลตอบแทนรวม = (เป้า ${t} − 301.5)/301.5`, `${got[i]} · ควร ~${want.toFixed(1)}%`);
    });
    // ป้ายจุดเข้าคงรูปแบบตัวเลขเดิมของใบนั้น (AAPL เขียน "$297" เป็นจำนวนเต็ม ⇒ เขียนกลับเป็นจำนวนเต็ม)
    const hintNum = (out.match(/จากจุดเข้า\s*\$\s*([\d.,]+)/) || [])[1];
    ok(hintNum === DV.fmtLikeNum(301.5, (aapl.match(/จากจุดเข้า\s*\$\s*([\d.,]+)/) || [])[1]),
      'cron: ป้าย "จากจุดเข้า" = ราคาใหม่ (คงรูปแบบตัวเลขเดิม)', (out.match(/จากจุดเข้า[^•<]*/) || [])[0]);
    // ★ ราคาเป้าเป็นสมมติฐาน ไม่ใช่ค่าที่ derive จากราคา — ต้องไม่ถูกแตะเด็ดขาด
    ok(JSON.stringify([...out.matchAll(/<div class="tgt">\s*\$?\s*([\d.,]+)/g)].map((m) => parseFloat(m[1]))) === JSON.stringify(tgts),
      'cron: ราคาเป้าของทุกฉากคงเดิม (เป็นสมมติฐาน ไม่ใช่ค่าที่ derive จากราคา)');
    // %/ปี ต้องสอดคล้องกับผลตอบแทนรวมที่เพิ่งเขียน (CAGR — สูตรที่คลังใช้ 795 จาก 814 คอลัมน์)
    got.forEach((s, i) => {
      const m = s.match(/([+\-−–]?\s*[\d.]+)\s*%\s*\/\s*ปี/);
      if (!m) return;
      ok(Math.abs(parseFloat(m[1].replace(/[−–]/g, '-').replace(/\s/g, '')) - cagr(n1(s))) <= 0.6,
        `cron: ฉากที่ ${i + 1} %/ปี = CAGR ของผลตอบแทนรวมที่เขียนใหม่`, s);
    });

    // 2) idempotent — ซ่อมซ้ำต้องไม่มีอะไรเปลี่ยน (ไม่งั้น cron เขียนไฟล์ทั้งคลังทุกวันโดยไม่มีของค้างจริง)
    ok(!DV.patchDerived(out, 301.5).changes.some((c) => /หมวด 6/.test(c)), 'ซ่อมหมวด 6 ซ้ำรอบสอง → ไม่มีอะไรให้แก้ (idempotent)');

    // 3) โครง HTML ต้องไม่ขยับแม้แต่แท็กเดียว
    //    (บั๊กจริงตอนพัฒนา: ตำแหน่งช่อง ret คิดพลาดไป ~22 ตัวอักษร ⇒ เขียนทับตัวแท็ก ไฟล์พัง
    //     แล้วทุก check เงียบหมดเพราะ parse ไม่ผ่าน = "สะอาดปลอม" ที่แย่กว่าปล่อยค้างไว้)
    const cnt = (h, re) => (h.match(re) || []).length;
    ok([/<div\b/g, /<\/div>/g, /<div class="ret/g, /<div class="tgt">/g, /<div class="col /g, /<li>/g, /<span>/g]
      .every((re) => cnt(aapl, re) === cnt(out, re)), 'ซ่อมแล้วจำนวนแท็กเท่าเดิมทุกตัว → ไม่ได้เขียนทับโครงสร้าง');

    // 4) เติมเครื่องหมายลบให้ค่าที่เดิมไม่มีเครื่องหมาย (ฉากที่เคยบวกแล้วกลับเป็นลบ — หัวใจของเคส RGLD)
    //    ★ ต้องสร้างฉากจาก "ไฟล์ที่สอดคล้องในตัวเองแล้ว" เสมอ ห้ามยัดค่าดิบลงคอลัมน์เดียว —
    //      ยัดค่าเดียวเข้าไปจะทำให้คอลัมน์นั้นหลุดจากอีกสอง ⇒ อ่านไม่ออก ⇒ ตัวซ่อมไม่แตะ แล้วเทสจะ fail
    //      โดยที่โค้ดไม่ได้ผิดอะไร (และจะ fail เฉพาะตอนคลังถูก --heal-derived มาแล้ว = เทสเปราะ)
    const at250 = DV.patchDerived(aapl, 250).html;              // ฉาก base เป็นบวกที่ราคา 250
    const unsigned = at250.replace(/(<div class="col base">[\s\S]*?<div class="ret[^"]*">)([^<]*)(<\/div>)/,
      (m, a, v, b) => a + v.replace(/\+\s*/g, '') + b);          // ถอดเครื่องหมาย + ออก (ค่ายังเท่าเดิม)
    ok(!/\+/.test(scn(unsigned)[1]), '(ตั้งฉากทดสอบ) ฉาก base ไม่มีเครื่องหมายนำหน้า', scn(unsigned)[1]);
    const flipped = scn(DV.patchDerived(unsigned, 400).html)[1]; // ที่ราคา 400 ฉาก base ต้องกลับเป็นลบ
    ok(/[−-]\s*\d/.test(flipped) && n1(flipped) < 0, 'ค่าที่เดิมไม่มีเครื่องหมาย เมื่อกลับเป็นติดลบต้องถูกเติมเครื่องหมายให้', flipped);

    // 4b) ★★ สูตร %/ปี ต้องไม่พลิกตามราคาของวันนั้น — เคสจริงที่ทำ cron ล้ม 2 ก.ย. 69 (run #54)
    //     fixture คือ reports/AAPL.html จริง ซึ่งใน CI ถูก cron patch ด้วย "ราคาของวันนั้น" ก่อน verify
    //     ⇒ สภาพ fixture เป็นตัวแปรที่เทสคุมไม่ได้ · @325.13: Bull total +28% → CAGR 8.58 / linear 9.33
    //     ปัดเป็น "9%" เท่ากันทั้งคู่ ⇒ heuristic เดิม (เลือก "ใกล้ค่าที่โชว์กว่า" ทีละคอลัมน์) อ่าน (28, 9)
    //     รอบถัดไปแล้วพลิกใบเป็น linear ถาวร → เขียน "+13%/ปี" ทับ "+11%/ปี" แล้วเทสข้อ 1 ตก
    //     (วัดจริง: 114 จาก 301 ราคาในช่วง 250–400 ทำแบบนี้ = cron มีโอกาสล้ม ~38% ต่อวัน)
    //     ⇒ จำลอง CI ตรง ๆ: patch fixture ด้วยราคาสมมติของวัน แล้วค่อยเข้าเส้นทางเทสปกติ
    {
      const bad = [];
      for (let p = 250; p <= 400; p += 2.5) {
        const day = U.patchReport(aapl, { newPrice: p, dateParts: dpMC, chartData: null }).html;
        scn(U.patchReport(day, { newPrice: 301.5, dateParts: dpMC, chartData: null }).html).forEach((s, i) => {
          const m = s.match(/([+\-−–]?\s*[\d.]+)\s*%\s*\/\s*ปี/);
          if (!m) return;
          const py = parseFloat(m[1].replace(/[−–]/g, '-').replace(/\s/g, ''));
          if (Math.abs(py - cagr(n1(s))) > 0.6) bad.push(`@${p} ฉาก${i + 1} ${s}`);
        });
      }
      ok(bad.length === 0, '★ สูตร %/ปี คงเดิมไม่ว่าราคาของวันจะเป็นเท่าไร (ไล่ราคา 250–400)', bad.slice(0, 3).join(' · '));
    }

    // 5) คงจำนวนทศนิยมเดิมของแต่ละช่อง (ใบที่เขียน 1 ตำแหน่งต้องไม่กลายเป็นจำนวนเต็ม และกลับกัน)
    // จุดเข้าสมมติ — ใช้ค่าอะไรก็ได้ เพราะด้านล่างเขียนใหม่ทั้งสามคอลัมน์จากค่านี้พร้อมกัน
    // (ไฟล์จึงสอดคล้องในตัวเองเสมอ ไม่ขึ้นกับว่าคลังถูก --heal-derived มาแล้วหรือยัง)
    const e0 = 293.92;
    const dec1 = tgts.reduce((h, t, i) => h.replace(
      new RegExp(`(<div class="col ${['bear', 'base', 'bull'][i]}">[\\s\\S]*?<div class="ret[^"]*">)([^<]*)(</div>)`),
      (m, a, v, b) => a + `รวม ~ ${((t - e0) / e0 * 100).toFixed(1)}% (≈ ${cagr((t - e0) / e0 * 100).toFixed(1)}%/ปี)` + b), aapl);
    scn(DV.patchDerived(dec1, 301.5).html).forEach((s, i) => {
      ok(/\d\.\d%/.test(s), `คงทศนิยม 1 ตำแหน่งของฉากที่ ${i + 1}`, s);
      ok(Math.abs(n1(s) - (tgts[i] - 301.5) / 301.5 * 100) <= 0.1, `ฉากที่ ${i + 1} (ทศนิยม 1) ค่าตรงสูตร`, s);
    });

    // 6) รูป "ต่อปีล้วน" (ไม่มีผลตอบแทนรวมให้เทียบ) — คลังมี 19 ใบ ต้องซ่อมได้เหมือนกัน
    const pyOnly = tgts.reduce((h, t, i) => h.replace(
      new RegExp(`(<div class="col ${['bear', 'base', 'bull'][i]}">[\\s\\S]*?<div class="ret[^"]*">)([^<]*)(</div>)`),
      (m, a, v, b) => a + `${cagr((t - e0) / e0 * 100).toFixed(1)}%/ปี` + b), aapl);
    scn(DV.patchDerived(pyOnly, 301.5).html).forEach((s, i) => {
      ok(Math.abs(n1(s) - cagr((tgts[i] - 301.5) / 301.5 * 100)) <= 0.15, `รูป "ต่อปีล้วน": ฉากที่ ${i + 1} = CAGR จากราคาใหม่`, s);
    });

    // 7) ★ รักษาสมมติฐานปันผลของใบนั้น — BBL ใช้ฐาน "รวมปันผล" ห้ามสลับเป็นฐานไม่รวมปันผล
    //    (คำว่า "รวมปันผล" ใน hint ตัดสินไม่ได้ เพราะ skeleton พิมพ์ติดมาทุกใบ — ต้องถอดจากตัวเลขที่โชว์เอง)
    const bbl = FX.BBL();
    const bblPlan = DV.scenarioPlan(bbl, 189.5);
    ok(bblPlan && bblPlan.conv === 'div', 'BBL อ่านได้ว่าใช้ฐาน "รวมปันผล"', bblPlan && bblPlan.conv);
    if (bblPlan) {
      const bt = bblPlan.items[0].col.tgt, bd = bblPlan.items[0].col.dps;
      const healedBear = n1(scn(DV.patchDerived(bbl, 250).html)[0]);
      ok(Math.abs(healedBear - (bt + bd - 250) / 250 * 100) <= 1,
        'ซ่อมแล้ว BBL ยังคงฐาน "รวมปันผล" (ไม่สลับไปฐานไม่รวมปันผล)',
        `${healedBear}% · รวมปันผล ${((bt + bd - 250) / 250 * 100).toFixed(1)}% · ไม่รวม ${((bt - 250) / 250 * 100).toFixed(1)}%`);
    }

    // 8) ใบที่ "ตัดสินไม่ได้" ต้องไม่ถูกแตะเลย — ขอบเขตตัวเขียนต้องเท่ากับตัวตรวจ (W17) เป๊ะ ๆ
    const broken = aapl.replace(/(<div class="col bear">[\s\S]*?<div class="tgt">)([^<]*)(<\/div>)/, (m, a, v, b) => a + '$999' + b);
    ok(!DV.scenarioPlan(broken, 301.5), 'คอลัมน์เดียวหลุดจากอีกสองคอลัมน์ → อ่านไม่ออก ตัดสินไม่ได้');
    ok(!DV.patchDerived(broken, 301.5).changes.some((c) => /หมวด 6/.test(c)), 'ใบที่ตัดสินไม่ได้ → ตัวเขียนต้องไม่แตะหมวด 6 เลย (ไม่เดาแทนคน)');
  }

  // ★ prose ไม่แตะ (§9): cron เรียก patchDerived โดยไม่เปิด opts.prose ⇒ % ของราคาเป้าในย่อหน้าต้องคงเดิม
  const proseLine = 'นักวิเคราะห์ 20 ราย ให้เป้าเฉลี่ย $999.00 (+1.0%)';
  const withProse = aapl.replace('<div class="sub">', `<div class="sub">${proseLine} `);
  const proseOut = U.patchReport(withProse, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: null }).html;
  ok(proseOut.includes(proseLine), 'cron ไม่แตะ % ของราคาเป้าที่เขียนในเนื้อความ (§9 — เป็นงานของ W15 + --heal-derived --prose)');
  // โหมด heal ที่คนสั่งเอง (opts.prose) ถึงจะแตะ
  const healed = DV.patchDerived(withProse, 301.5, { prose: true }).html;
  ok(!healed.includes(proseLine) && /เป้าเฉลี่ย \$999\.00 \(\+231/.test(healed), 'heal --prose: % ของราคาเป้าในเนื้อความถูกเขียนใหม่จากราคา', (healed.match(/เป้าเฉลี่ย[^<]*/) || [])[0]);
}
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

// ---------- ช่องสรุป "ส่วนต่างจากราคา": cron เขียน **ทั้งช่อง** เป็นคลังคำคงที่ "MOS ~ ±X%" (ระยะ 1 ข้อ D) ----------
// เดิม cron patch เฉพาะ "ตัวเลข" แล้วเว้นเมื่อคำบอกทิศขัดกับ MOS ใหม่ ⇒ ใบที่คำกับเครื่องหมายขัดกันเอง
// ไม่เคยถูกแตะเลย (BBL "+2.1% (เกือบเต็มมูลค่า)" — open-items #13) และ W06 ต้องผ่อนเกณฑ์ตามไปด้วย
// ตอนนี้คำเชิงคุณภาพอยู่ใน .txt ของกล่อง verdict ล้วน ๆ ⇒ ช่องนี้ไม่มีอะไรให้ cron เดา เขียนทับได้ทุกรูป
// ★ ตัวเขียน = patchDerived#11 (ไม่ใช่โค้ดในไฟล์นี้แล้ว) · ค่าที่คาดหวังอ่านจาก .big ที่เพิ่งเขียน ไม่ hardcode
// ★ ระยะ 3 (open-items #43): ใช้ DVcell.readSummaryCell/SUMMARY_RE โดยตรงแทนสำเนา regex ของไฟล์นี้เอง —
//   สำเนาเดิม (`class="v"[^>]*` เป๊ะ) เขียนก่อน SUMMARY_RE จะรองรับ `class="v[^"]*"` (เคส MXL) และก่อนตัวเขียน
//   จะเริ่มแก้ attribute เอง (patchDerived#11 ตอนนี้เขียน class="v bad|ok|good" ทับ — เจ้าของเดียวกันต้องอ่านตรงกัน)
const DVcell = require('../tools/derived-values.js');
// ★ ใช้ at/len ของ readSummaryCell มา slice จาก html ดิบเอง — c.text ผ่าน clean()/norm() ที่แปลง − → - แล้ว
//   (ใช้เทียบ "ข้อความในคลังคำ" ภายในเป็นปกติของ production code) แต่เทสนี้ต้องเทียบ "ตัวอักษรที่เขียนจริง"
//   (เครื่องหมายลบ Unicode − ที่ big.sign คืนมา) ⇒ slice ดิบแทน ไม่งั้นเทสจะเปรียบเทียบผิดชนิดเสมอ
const cellOf = (h) => { const c = DVcell.readSummaryCell(h); return c ? h.slice(c.at, c.at + c.len).replace(/<[^>]*>/g, '').trim() : ''; };
const setCell = (h, txt) => { const c = DVcell.readSummaryCell(h); return c ? h.slice(0, c.at) + txt + h.slice(c.at + c.len) : h; };
const pxCellTest = Math.round(FV * 1.2 * 100) / 100;   // ราคาสูงกว่า FV 20% → MOS = −20%
const dp = { day: 11, monIdx: 6, yearCE: 2026 };
const cellRun = (txt, price) => U.patchReport(setCell(aapl, txt), { newPrice: price, dateParts: dp, chartData: null }).html;
{
  // ทุกรูปเดิม (คำ+ตัวเลข · คลังคำที่ตัวเลขเก่า · ทิศขัดกับ MOS ใหม่ · ไม่มีตัวเลข · ไม่มีคำบอกทิศ) ต้องลู่เข้าข้อความเดียวกัน
  for (const txt of ['แพง ~13%', 'MOS ~ −16.8%', 'ถูกกว่ามูลค่า MOS ~ +8%', 'แพงกว่ามูลค่าเหมาะสม', 'ส่วนต่าง 5%']) {
    const out1 = cellRun(txt, pxCellTest);
    const big = DVcell.readMosBig(out1);
    const want = 'MOS ~ ' + big.sign + big.num + '%';
    ok(cellOf(out1) === want, `ช่องสรุป: "${txt}" → คลังคำคงที่เท่ากับ .big`, `${cellOf(out1)} (want ${want})`);
    // idempotent: รันซ้ำที่ราคาเดิมต้องไม่ขยับช่องอีก (ตัวตรวจกับตัวเขียนใช้ predicate เดียวกัน)
    ok(cellOf(U.patchReport(out1, { newPrice: pxCellTest, dateParts: dp, chartData: null }).html) === want, `ช่องสรุป: "${txt}" → idempotent`);
  }
  // เขียนแล้วต้องรายงานใน derived[] (ไม่ใช่เขียนเงียบ) และไม่รายงานเมื่อไม่ได้เขียน
  const rCell = U.patchReport(setCell(aapl, 'แพง ~13%'), { newPrice: pxCellTest, dateParts: dp, chartData: null });
  ok(rCell.derived.some((c) => /^ช่องสรุป:/.test(c)), 'ช่องสรุป: การเขียนถูกรายงานใน derived[]', JSON.stringify(rCell.derived.filter((c) => /ช่องสรุป/.test(c))));
  const rAgain = U.patchReport(rCell.html, { newPrice: pxCellTest, dateParts: dp, chartData: null });
  ok(!rAgain.derived.some((c) => /^ช่องสรุป:/.test(c)), 'ช่องสรุป: ช่องที่ตรงอยู่แล้ว → ไม่มีรายการใน derived[]');
  // ★ ระยะ 3 (open-items #43 — แก้เจตนาจากเดิม): healer #11 ตอนนี้ "เขียนสีตาม mosBand ทับเสมอ" ไม่ใช่
  //   "คง attribute เดิมไว้ห้ามแตะ" อีกต่อไป — fixture AAPL มี style="color:#ff8a80" (สีที่ worker เลือกเอง)
  //   ติดมา ต้องถูกลบทิ้งแล้วแทนด้วย class="v bad|ok|good" ตาม mosBand(MOS ใหม่) เสมอ (inline style ชนะ class
  //   เสมอด้วย specificity ⇒ ปล่อยไว้ = สีที่เห็นจริงยังผิดแม้เพิ่ม class แล้ว)
  const pAfter = DVcell.summaryPlan(rCell.html);
  ok(pAfter && pAfter.colorOk, 'ช่องสรุป: สีถูกซิงก์ตาม mosBand แล้ว (colorOk=true)', JSON.stringify(pAfter));
  ok(pAfter && rCell.html.includes(pAfter.tagOpen) && !/style=/.test(pAfter.tagOpen), 'ช่องสรุป: แท็กเปิดใหม่เป็น class ล้วน ไม่มี style เหลือ (ลบทิ้งจริง ไม่ใช่แค่เพิ่ม class)', pAfter && pAfter.tagOpen);
}

// ---------- สีกล่อง verdict `mos-verdict bad|ok|good` — sync ให้ตรงโซน MOS ใหม่ (แก้ต้นเหตุ W04) ----------
// class เป็นฟังก์ชันล้วนของ MOS (นิยามเดียว = U.mosBand ซึ่ง W04 ก็ import ไปใช้) ⇒ cron sync ได้ทุกครั้ง ไม่ต้องเดา
ok(U.mosBand(9.9) === 'bad' && U.mosBand(10) === 'ok' && U.mosBand(19.9) === 'ok' && U.mosBand(20) === 'good' && U.mosBand(-50) === 'bad', 'mosBand: ขอบโซน 10/20 ถูกต้อง (bad <10 · ok 10–20 · good ≥20)');
const setVerdict = (h, cls) => h.replace(/class="mos-verdict (?:bad|ok|good)"/, `class="mos-verdict ${cls}"`);
const verdictOf = (h) => (h.match(/class="mos-verdict ([^"]+)"/) || [])[1];
const pxBad = Math.round(FV * 0.95 * 100) / 100;      // MOS = +5% → โซน bad
const pxGood = Math.round(FV * 0.70 * 100) / 100;     // MOS = +30% → โซน good
ok(verdictOf(U.patchReport(setVerdict(aapl, 'good'), { newPrice: pxBad, dateParts: dp, chartData: null }).html) === 'bad', 'verdict: ราคาวิ่งขึ้นจน MOS เหลือ 5% → good กลายเป็น bad (เคส W04 15 ใบทั้งคลัง)');
ok(verdictOf(U.patchReport(setVerdict(aapl, 'bad'), { newPrice: pxGood, dateParts: dp, chartData: null }).html) === 'good', 'verdict: ราคาร่วงจน MOS 30% → bad กลายเป็น good (ทางกลับ)');
ok(verdictOf(U.patchReport(setVerdict(aapl, 'custom-zone'), { newPrice: pxBad, dateParts: dp, chartData: null }).html) === 'custom-zone', 'verdict: คลาสนอก 3 ค่ามาตรฐาน → ไม่แตะ (ปล่อยให้ gate ตัดสิน)');

// ---------- price-only fallback (chartData = null) — คงกราฟเดิม แตะแค่จุดท้าย ----------
// ทางนี้เดิมใช้เฉพาะตอน Yahoo ไม่มีประวัติพอ · ตั้งแต่มี bad-chart มันเป็นทางของ `--force` ด้วย:
// ซีรีส์ต้นทางผสมสองฐาน แต่กราฟในไฟล์ถูกแก้ให้ถูกแล้ว ⇒ ประทับราคาได้โดยไม่ลากฐานที่สองกลับเข้ามา
const rdIn = RM.readReportData(aapl).data;
const oldPts = rdIn.chart.data;
const lastLab = oldPts[oldPts.length - 1][0];
const labMon = U.THAI_MONTHS.findIndex((m) => lastLab.startsWith(m));
const labYear = 2000 + parseInt(lastLab.slice(-2), 10);
// เดือนเดียวกับจุดท้าย → แทนค่าจุดเดิม (ไม่ต่อจุดใหม่)
const rSame = U.patchReport(aapl, { newPrice: 301.5, dateParts: { day: 11, monIdx: labMon, yearCE: labYear }, chartData: null });
const ptsSame = RM.readReportData(rSame.html).data.chart.data;
ok(ptsSame.length === oldPts.length, 'fallback: เดือนเดิม → ไม่ต่อจุดใหม่', `${oldPts.length} → ${ptsSame.length}`);
ok(ptsSame[ptsSame.length - 1][1] === 301.5, 'fallback: จุดท้าย = ราคาใหม่');
ok(ptsSame.slice(0, -1).every((p, i) => p[0] === oldPts[i][0] && p[1] === oldPts[i][1]),
  'fallback: จุดก่อนหน้าคงเดิมทุกจุด — ฐานราคาเดิมไม่ถูกแตะ (invariant ของ bad-chart + --force)');
// เดือนถัดไป → ต่อจุดใหม่แล้วตัดหัวให้ ≤13
const nextM = (labMon + 1) % 12, nextY = labYear + (labMon === 11 ? 1 : 0);
const rNext = U.patchReport(aapl, { newPrice: 301.5, dateParts: { day: 1, monIdx: nextM, yearCE: nextY }, chartData: null });
const ptsNext = RM.readReportData(rNext.html).data.chart.data;
ok(ptsNext.length <= 13, 'fallback: เดือนใหม่ → ต่อจุดแล้วยังคง ≤13 จุด (E37)', `ได้ ${ptsNext.length}`);
ok(ptsNext[ptsNext.length - 1][0] === `${U.THAI_MONTHS[nextM]}${String(nextY).slice(-2)}` && ptsNext[ptsNext.length - 1][1] === 301.5,
  'fallback: จุดใหม่ = เดือนของราคา + ราคาใหม่', JSON.stringify(ptsNext[ptsNext.length - 1]));

// ---------- notes: จุดเขียนที่ "ไม่พบ = ไม่ throw" ต้องรายงาน ไม่เงียบ (ระยะ 1 WS2 ข้อ 6) ----------
// UNVERIFIED WRITE: เดิม 2 จุดนี้ replace ไม่โดนแล้วผ่านเงียบ ⇒ cron ขึ้น ✓ ทั้งที่ไม่ได้เขียนอะไร
// แล้ววันที่ใน disclaimer ค้างไปเรื่อย ๆ โดยไม่มีใครเห็น (W22 ตรวจ "ผล" · notes ตรวจ "การเขียน")
{
  const dpN = { day: 11, monIdx: 6, yearCE: 2026 };
  ok(Array.isArray(r.notes), 'patchReport คืน notes[] เสมอ');
  ok(r.notes.length === 0, '(c) AAPL fixture ปกติ (ตัวเขียนจับ "ราคา ณ" ได้ · header ไม่มีวงเล็บทวนวันที่) → notes ว่าง', JSON.stringify(r.notes));

  // ★ ตัวอ่าน = ตัวเขียน (12 ก.ย. 2569): ทั้ง gate (f12) และ cron เรียก `findDiscPriceDate` ตัวเดียวกัน
  //   ⇒ "อ่านออกแต่เขียนไม่ได้" 65 ใบเดิมแยกเป็นสองกอง: 55 ใบเป็น **snapshot ของแหล่ง** ที่ต้องไม่ถูกเขียนทับ
  //   และไม่ใช่ของเสีย (อ่านก็ต้องไม่อ่าน) · 10 ใบเป็นวันที่ระดับเดือนที่ตัวเขียนพลาดจริง (ตอนนี้เขียนได้แล้ว)
  const DISCB = /<div class="disc">[\s\S]*?<\/div>/i;
  const discOf = (h) => (h.match(DISCB) || [''])[0];
  const discM = aapl.match(DISCB);
  ok(!!discM, 'AAPL fixture: มีบล็อก .disc ให้ทดสอบ');
  const discHit = PD.findDiscPriceDate(discM[0]);
  ok(!!discHit && discHit.hasDay, 'AAPL fixture: findDiscPriceDate (เจ้าของเดียว) อ่าน "ราคา ณ <วันที่>" ใน .disc ออก');
  ok(/ราคา ณ 11 ก\.ค\. 2026/.test(discOf(r.html)), '.disc ของ fixture ถูกเขียนวันใหม่จริง (ถ้าไม่ ถือว่าเทสข้างล่างพิสูจน์อะไรไม่ได้)');

  // (a) snapshot ของแหล่ง — "(ราคา $79.39 · <วันที่> …)" คือวันที่ของ **ราคาที่ยกมา** ไม่ใช่วันที่ราคาในรายงาน
  //     รูปเดียวกับ 55 ใบจริง (AIG · AIT · ALL …) ⇒ ต้อง **ไม่เขียนทับ** และ **ไม่เตือน** (เดิมเตือนทุกวัน)
  const blocked = discM[0].slice(0, discHit.index) + '$79.39 · ' + discM[0].slice(discHit.index);
  ok(!PD.findDiscPriceDate(blocked) && !!PD.findPriceDate(blocked),
    '(a) มิวเทชันได้สภาพที่ต้องการ: ตัวสแกนหัวรายงานยังอ่านออก แต่กฎของ .disc ถือเป็น snapshot (คืน null)');
  const rBlocked = U.patchReport(aapl.replace(discM[0], blocked), { newPrice: 301.5, dateParts: dpN, chartData: null });
  ok(discOf(rBlocked.html) === blocked, '(a) .disc ที่เป็น snapshot ของแหล่ง — ไม่ถูกเขียนทับแม้แต่ไบต์เดียว');
  ok(rBlocked.notes.length === 0, '(a) snapshot ของแหล่ง → notes ว่าง (ไม่ใช่ของเสีย — เดิมเตือนปลอม 55 ใบทุกวัน)', JSON.stringify(rBlocked.notes));

  // (b) วันที่ระดับเดือน "ราคา ณ ก.ย. 2026" — ต้องเขียนได้ (เดิมตัวเขียนบังคับต้องมีวัน ⇒ 10 ใบค้างถาวร)
  //     และต้อง **คงรูประดับเดือน** ไม่ใช่เติมวันเข้าไปเอง (ต่างจากหัวรายงานที่ต้องมีวันเพื่อให้ parsePriceAge อ่านออก)
  const monthOnly = aapl.replace(discM[0], discM[0].slice(0, discHit.index) + 'ส.ค. 2026' + discM[0].slice(discHit.index + discHit.length));
  ok(monthOnly !== aapl && /ราคา ณ ส\.ค\. 2026/.test(discOf(monthOnly)), '(b) มิวเทชันทำให้ .disc เป็นวันที่ระดับเดือนจริง');
  const rMonth = U.patchReport(monthOnly, { newPrice: 301.5, dateParts: dpN, chartData: null });
  ok(/ราคา ณ ก\.ค\. 2026/.test(discOf(rMonth.html)) && !/ราคา ณ \d+ ก\.ค\. 2026/.test(discOf(rMonth.html)),
    '(b) วันที่ระดับเดือน → เขียนวันใหม่แบบระดับเดือน (ไม่เติมวัน)', (discOf(rMonth.html).match(/ราคา ณ [^<·]*/) || [])[0]);
  ok(rMonth.notes.length === 0, '(b) วันที่ระดับเดือน → notes ว่าง (เขียนลงแล้ว)', JSON.stringify(rMonth.notes));

  // (c) ลบประโยค "ราคา ณ <วันที่>" ทิ้งทั้งประโยค → ไม่มีอะไรให้เขียน = ต้องเงียบ (ไม่ใช่ของเสีย)
  const noDate = aapl.replace(discM[0], discM[0].slice(0, discHit.index) + 'ตามที่ระบุในหัวรายงาน' + discM[0].slice(discHit.index + discHit.length));
  ok(noDate !== aapl && !PD.findDiscPriceDate(discOf(noDate)), '(c) มิวเทชันลบวันที่ออกจาก .disc ได้จริง');
  ok(U.patchReport(noDate, { newPrice: 301.5, dateParts: dpN, chartData: null }).notes.length === 0,
    '(c) .disc ไม่มีวันที่เลย → notes ว่าง (431/908 ใบของคลังเป็นแบบนี้ — ไม่ใช่ของเสีย)');

  // (d) "อ่านเจอแต่เขียนไม่ลง" → notes — สาขา found:false ที่เหลืออยู่ **สร้างเคสจริงไม่ได้ด้วยตัวเรนเดอร์ปัจจุบัน**:
  //     ตัวเขียน splice ที่ index ของตัวอ่านเอง แล้วอ่านกลับด้วยตัวเดียวกัน (canonical: เดือนตัวย่อ · คงรูปวัน/เดือน
  //     · คงศักราช) ⇒ อ่านกลับได้เสมอ ทุกจุด · เก็บสาขานี้ไว้เป็น canary ถ้ามีใครแก้ตัวเรนเดอร์/ตัวอ่านฝั่งเดียว
  //     ที่นี่จึงพิสูจน์ **invariant ที่ทำให้มันไม่เกิด** แทน: หลัง patch ทุกจุดใน .disc ต้องอ่านกลับเป็นวันที่ที่เพิ่งเขียน
  const readBack = (h) => { const out = []; const d = discOf(h); for (let from = 0, x; (x = PD.findDiscPriceDate(d, from)); from = x.index + x.length) out.push(x); return out; };
  for (const [lab, html] of [['ปกติ', r.html], ['ระดับเดือน', rMonth.html]]) {
    const back = readBack(html);
    ok(back.length > 0 && back.every((b) => b.yearCE === 2026 && b.monIdx === 6 && (!b.hasDay || b.day === 11)),
      `(d) อ่านกลับ .disc (${lab}) ได้วันที่ที่เพิ่งเขียนครบทุกจุด ⇒ สาขา "เขียนไม่ลง" ไม่เกิด`, JSON.stringify(back.map((b) => b.text)));
  }

  // (e) "ต้นช่วง" ของกราฟย้อนหลัง — เคส TLI "Yahoo Finance (กราฟราคา ก.ค. 2568–ก.ค. 2569)" และ AEONTS
  //     anchor "ราคา" เป็นท้ายคำ ("กราฟราคา") แล้วตามด้วยเดือนพอดี ⇒ ถ้าไม่มีกฎ "ต้นช่วง" cron จะประทับวันรัน
  //     ทับช่วงกราฟ = บั๊กเดิม 9 ส.ค. 69 (ประทับวันรันทับข้อเท็จจริงในอดีต)
  const rangeDisc = aapl.replace(discM[0], discM[0].slice(0, discHit.index) + 'ก.ค. 2568–ก.ค. 2569' + discM[0].slice(discHit.index + discHit.length));
  ok(rangeDisc !== aapl && !PD.findDiscPriceDate(discOf(rangeDisc)), '(e) วันที่ที่เป็น "ต้นช่วง" (…2568–…2569) ไม่ใช่วันที่ราคา → ตัวอ่านคืน null');
  const rRange = U.patchReport(rangeDisc, { newPrice: 301.5, dateParts: dpN, chartData: null });
  ok(discOf(rRange.html) === discOf(rangeDisc) && rRange.notes.length === 0,
    '(e) ช่วงกราฟใน .disc ไม่ถูกเขียนทับ · notes ว่าง', discOf(rRange.html).slice(-90));

  // ใบที่เขียนวันที่ราคาไว้ 2 จุด (วัด 12 ก.ย. 69: 13/908 เช่น AEM "ราคา ณ …" + "ราคาปิดรายเดือน ณ …")
  // ตัวเขียนเดิมเป็น regex /g จึงเขียนครบทุกจุด — ตัวใหม่ต้องวนเก็บให้ครบเหมือนกัน ไม่ใช่เขียนจุดแรกจุดเดียว
  const twice = aapl.replace(discM[0], discM[0].replace('</div>', ' • ราคาปิดรายเดือน ณ 3 ส.ค. 2026</div>'));
  const rTwice = U.patchReport(twice, { newPrice: 301.5, dateParts: dpN, chartData: null });
  ok((discOf(rTwice.html).match(/11 ก\.ค\. 2026/g) || []).length === 2 && rTwice.notes.length === 0,
    'สองจุดในบล็อกเดียว → เขียนครบทั้งคู่ · notes ว่าง', discOf(rTwice.html).slice(-120));

  // ช่องวันที่ทวนซ้ำ (วงเล็บติดกับ token ราคา) มีวันที่อยู่ แต่คนละวันกับวันที่ราคา ⇒ findRestatedDate ปฏิเสธ = เขียนไม่ครบ
  const hm = aapl.match(/<header[\s\S]*?<\/header>/i);
  const hitN = PD.findPriceDate(hm[0]);
  ok(!!hitN, 'AAPL fixture: หา token วันที่ราคาใน header ได้');
  const mismatched = hm[0].slice(0, hitN.index + hitN.length)
    + ` (${hitN.day === 1 ? 2 : 1} ${U.THAI_MONTHS[hitN.monIdx]} ${hitN.year})` + hm[0].slice(hitN.index + hitN.length);
  const rParen = U.patchReport(aapl.replace(hm[0], mismatched), { newPrice: 301.5, dateParts: dpN, chartData: null });
  ok(rParen.notes.some((s) => /วงเล็บ/.test(s) && /found:false/.test(s)),
    'header มีวงเล็บวันที่ต่อท้ายวันที่ราคาแต่คนละวัน → notes บอก found:false', JSON.stringify(rParen.notes));
  // ...และวงเล็บวันที่ที่ **ไม่ติด** กับวันที่ราคา (ข้อเท็จจริงคนละตัว — เคส AMKR) ต้องไม่เตือน
  const farParen = aapl.replace(hm[0], hm[0].replace('</header>', ` <span>ร่วงแรงวันเดียว (1 ${U.THAI_MONTHS[hitN.monIdx]} ${hitN.year})</span></header>`));
  ok(farParen !== aapl, 'มิวเทชันวงเล็บไกล เปลี่ยนไฟล์จริง');
  ok(U.patchReport(farParen, { newPrice: 301.5, dateParts: dpN, chartData: null }).notes.length === 0,
    'วงเล็บวันที่ที่ไม่ติดกับวันที่ราคา = ข้อเท็จจริงคนละตัว (เคส AMKR/AEHR) → ต้องไม่เตือน');
}

// ---------- gauge auto-rescale (แทน freeze outside-gauge-range) ----------
// ราคาทะลุ max → ขยาย max ให้ราคาอยู่ในขอบแบบ strict (check-site เตือนเมื่อ v >= gmax) · min คงเดิม
const gaugeIn = RM.readReportData(aapl).data.gauge;
const pxHigh = Math.round(gaugeIn.max * 1.02 * 100) / 100;
const rHigh = U.patchReport(aapl, { newPrice: pxHigh, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: U.buildChartData(mkBars(13, 2025, 6, 250), pxHigh, 0) });
const rdHigh = RM.readReportData(rHigh.html).data;
ok(rdHigh.gauge.cur === pxHigh, 'gauge rescale: cur = ราคาใหม่');
ok(rdHigh.gauge.max > pxHigh, 'gauge rescale: ราคาทะลุ max → max ใหม่ > ราคา (strict)', `max=${rdHigh.gauge.max} px=${pxHigh}`);
ok(rdHigh.gauge.max >= pxHigh * 1.05 - 0.01, 'gauge rescale: max ใหม่ ≥ ราคา×1.05', `max=${rdHigh.gauge.max}`);
ok(rdHigh.gauge.min === gaugeIn.min && rdHigh.gauge.fair === gaugeIn.fair, 'gauge rescale: min/fair ไม่แตะ');
// ราคาหลุด min → ขยาย min ลง · max คงเดิม
const pxLow = Math.round(gaugeIn.min * 0.98 * 100) / 100;
const rLow = U.patchReport(aapl, { newPrice: pxLow, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: U.buildChartData(mkBars(13, 2025, 6, 250), pxLow, 0) });
const rdLow = RM.readReportData(rLow.html).data;
ok(rdLow.gauge.min < pxLow, 'gauge rescale: ราคาหลุด min → min ใหม่ < ราคา (strict)', `min=${rdLow.gauge.min} px=${pxLow}`);
ok(rdLow.gauge.min <= pxLow * 0.95 + 0.01 && rdLow.gauge.min >= 0, 'gauge rescale: min ใหม่ ≤ ราคา×0.95 และไม่ติดลบ');
ok(rdLow.gauge.max === gaugeIn.max, 'gauge rescale: max ไม่แตะเมื่อหลุด min');
// ราคาอยู่ในขอบ → bounds ไม่ขยับ
const pxMid = Math.round((gaugeIn.min + gaugeIn.max) / 2 * 100) / 100;
const rMid = U.patchReport(aapl, { newPrice: pxMid, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: U.buildChartData(mkBars(13, 2025, 6, 250), pxMid, 0) });
const rdMid = RM.readReportData(rMid.html).data;
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

// ---------- lockfile (WS4: seeds.json / price-flags.json / tags.json มีหลาย writer ไม่มี lock) ----------
{
  const L = require('../tools/lockfile.js');
  const os = require('os');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lock-')), 'state.json');
  let inside = 0;
  const r = L.withLock(f, () => { inside++; ok(fs.existsSync(f + '.lock'), 'withLock: ถือ lock ระหว่าง fn'); return 42; });
  ok(r === 42 && inside === 1 && !fs.existsSync(f + '.lock'), 'withLock: คืนค่าของ fn + ปล่อย lock หลังจบ');
  fs.mkdirSync(f + '.lock');                                   // จำลองอีก process ถืออยู่
  let threw = null; try { L.withLock(f, () => {}, { waitMs: 300 }); } catch (e) { threw = e; }
  ok(threw && /รอ lock/.test(threw.message), 'withLock: lock ถูกถือ → รอครบแล้ว throw (ห้ามข้ามเงียบ = คิวเพี้ยน)');
  const old = Date.now() / 1000 - 3600; fs.utimesSync(f + '.lock', old, old);   // lock ค้าง 1 ชม. = process ตาย
  ok(L.withLock(f, () => 'ok', { waitMs: 300 }) === 'ok' && !fs.existsSync(f + '.lock'), 'withLock: lock ค้างเกิน 10 นาที → ยึดได้แล้วปล่อย');
  let thrown = false; try { L.withLock(f, () => { throw new Error('x'); }); } catch (_) { thrown = true; }
  ok(thrown && !fs.existsSync(f + '.lock'), 'withLock: fn throw → ปล่อย lock เสมอ');
  L.writeJsonAtomic(f, '{"a":1}\n');
  ok(fs.readFileSync(f, 'utf8') === '{"a":1}\n' && !fs.readdirSync(path.dirname(f)).some((x) => x.includes('.tmp-')), 'writeJsonAtomic: เขียนผ่าน temp+rename ไม่ทิ้ง .tmp');

  // process.exit() ข้างใน fn ต้องปล่อย lock ด้วย (finally ไม่รันตอน exit — พึ่ง process.on('exit') ของโมดูล)
  {
    const cp = require('child_process');
    const f2 = path.join(path.dirname(f), 'exit.json');
    const script = `const L=require(${JSON.stringify(path.join(__dirname, '..', 'tools', 'lockfile.js'))});L.withLock(${JSON.stringify(f2)},()=>{process.exit(7)})`;
    const r = cp.spawnSync(process.execPath, ['-e', script]);
    ok(r.status === 7 && !fs.existsSync(f2 + '.lock'), 'withLock: process.exit ใน fn → ปล่อย lock ผ่าน exit handler', `status=${r.status} lock=${fs.existsSync(f2 + '.lock')}`);
  }
}

// ── lockfile ระยะ 1: heartbeat (async holder) · release เฉพาะของตัวเอง · signal ──
{
  const L = require('../tools/lockfile.js');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
  const f = path.join(tmp, 'x.json'), dir = f + '.lock';
  // (1) async holder: mtime ของ lock ต้องขยับระหว่างถือ
  const p = L.withLock(f, async () => {
    const t0 = fs.statSync(dir).mtimeMs;
    await new Promise((r) => setTimeout(r, 120));
    return fs.statSync(dir).mtimeMs - t0;
  }, { heartbeatMs: 20 });
  ok(p && typeof p.then === 'function', 'withLock: fn async → คืน promise (ไม่ปล่อย lock ก่อน settle)');
  ok(fs.existsSync(dir), 'withLock: ระหว่าง await ยังถือ lock อยู่');
  const chain1 = p.then((dt) => {
    ok(dt > 0, `heartbeat: mtime ขยับระหว่างถือ (Δ ${dt.toFixed(0)} ms)`);
    ok(!fs.existsSync(dir), 'withLock async: settle แล้วปล่อย lock');
    // (2) ปล่อยเฉพาะของตัวเอง: จำลองว่าถูก reclaim (pid ในโฟลเดอร์ไม่ใช่ของเรา)
    L.withLock(f, () => { fs.writeFileSync(path.join(dir, 'pid'), '99999999'); });
    ok(fs.existsSync(dir) && fs.readFileSync(path.join(dir, 'pid'), 'utf8') === '99999999', 'release: pid ไม่ใช่ของเรา → ไม่ลบ lock ของคนใหม่');
    fs.rmSync(dir, { recursive: true, force: true });
    // (3) signal handler มีอยู่จริง (ไม่ยิงสัญญาณจริงในเทส — แค่ตรวจว่าลงทะเบียน)
    ok(process.listeners('SIGINT').some((l) => /release|held/.test(String(l))) && process.listeners('SIGTERM').some((l) => /release|held/.test(String(l))), 'lockfile: ลงทะเบียน SIGINT/SIGTERM เพื่อปล่อย lock');
    ok(L.HEARTBEAT_MS === 60000, 'export HEARTBEAT_MS = 60000');
  });

  // (4) fix round 1: heartbeat ต้องเช็ค pid ก่อน touch — ถูก reclaim ระหว่างถือ (async holder ค้างเกิน STALE_MS) ต้องเลิก touch
  //     ไม่งั้น interval เก่ายังทำให้ lock ของเจ้าของใหม่ "ดูสดตลอด" จน reclaim ซ้ำไม่ได้แม้เจ้าของใหม่ตายไปแล้ว
  const f4 = path.join(tmp, 'y.json'), dir4 = f4 + '.lock';
  const p4 = L.withLock(f4, async () => {
    await new Promise((r) => setTimeout(r, 30));            // ให้ heartbeat ติ๊กตามปกติก่อนอย่างน้อย 1 รอบ (pid ยังเป็นของเรา)
    fs.writeFileSync(path.join(dir4, 'pid'), '77777777');   // จำลอง reclaim ระหว่างถือ: pid ในโฟลเดอร์ไม่ใช่ของเราอีกต่อไป
    const t0 = fs.statSync(dir4).mtimeMs;
    await new Promise((r) => setTimeout(r, 75));            // รอหลายรอบ heartbeat (heartbeatMs=15) หลัง pid ถูกแทนที่
    return fs.statSync(dir4).mtimeMs - t0;
  }, { heartbeatMs: 15 });
  const chain2 = p4.then((dt4) => {
    ok(dt4 === 0, `heartbeat: เช็ค pid ก่อน touch — เลิก touch ทันทีที่ pid ไม่ใช่ของเรา (Δ ${dt4} ms)`);
    ok(fs.existsSync(dir4) && fs.readFileSync(path.join(dir4, 'pid'), 'utf8') === '77777777', 'heartbeat: settle แล้ว lock ของเจ้าของใหม่ยังอยู่ครบ (ไม่ถูกลบ + ไม่ถูกทำให้สดปลอม)');
    fs.rmSync(dir4, { recursive: true, force: true });
  });

  // (5) release-on-reject: async fn ที่ reject ต้อง reject ด้วย error เดิม + ไม่เหลือ `<file>.lock` ค้าง
  //     (out.finally ตรง ๆ พังกับ thenable เปล่า ๆ ที่ไม่มี .finally — withLock ต้องผ่าน Promise.resolve(out) ก่อนเสมอ)
  const f5 = path.join(tmp, 'z.json'), dir5 = f5 + '.lock';
  const p5 = L.withLock(f5, async () => { throw new Error('boom'); });
  const chain3 = p5.then(
    () => { ok(false, 'withLock: async fn reject → ต้อง reject (ไม่ใช่ resolve)'); },
    (e) => {
      ok(!!e && e.message === 'boom', `withLock: async fn reject → reject ด้วย error เดิม (ได้ ${e && e.message})`);
      ok(!fs.existsSync(dir5), 'withLock: async fn reject → ปล่อย lock ด้วย (ไม่เหลือ .lock ค้าง)');
    }
  );

  pending = Promise.all([chain1, chain2, chain3]);
}

// ---------- commitFlags: merge บนไฟล์ "ล่าสุด" ใต้ lock ไม่ใช่ snapshot ตอนเริ่มรอบ (WS4 · เคส flag ฟื้น/หาย 12 ส.ค. 69) ----------
{
  const os = require('os');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flags-')), 'price-flags.json');
  const snapshot = [{ symbol: 'AAA', reason: 'mos-sign-flip', flaggedAt: '2026-09-01' }];
  // ระหว่าง loop: canary เขียน not-on-exchange ของ ZZZ ลงไฟล์ (snapshot ตอนเริ่มรอบไม่มี)
  fs.writeFileSync(file, JSON.stringify(snapshot.concat([{ symbol: 'ZZZ', reason: 'not-on-exchange', flaggedAt: '2026-09-10' }])));
  const args = { file, evaluated: new Set(['AAA']), frozenAll: [], failed: [], quietSyms: new Set(), aliveConfirmed: new Set(), reportExists: new Set(['AAA', 'ZZZ']) };
  const flags = U.commitFlags({ ...args, write: true });
  ok(!flags.some((f) => f.symbol === 'AAA'), 'commitFlags: AAA ประเมินรอบนี้ไม่ freeze → หลุดคิว');
  ok(flags.some((f) => f.symbol === 'ZZZ' && f.reason === 'not-on-exchange'), 'commitFlags: flag ที่ canary เขียนระหว่าง loop ยังอยู่ (merge บนไฟล์ล่าสุด)');
  ok(JSON.parse(fs.readFileSync(file, 'utf8')).length === 1 && !fs.existsSync(file + '.lock'), 'commitFlags: เขียนไฟล์ + ปล่อย lock');
  const before = fs.readFileSync(file, 'utf8');
  ok(Array.isArray(U.commitFlags({ ...args, write: false })) && fs.readFileSync(file, 'utf8') === before, 'commitFlags: dry-run ไม่เขียนไฟล์');
}

// ---------- pick-brand ขนาน: seeds.json ต้องได้ทั้ง 2 entry และสีต้องไม่ชนกัน (WS4 · CLAUDE.md §10 เคสสีซ้ำโดย gate มองไม่เห็น) ----------
// hermetic: ชี้ STOCK_SEEDS_FILE ไปไฟล์ชั่วคราว — ห้ามแตะ tools/seeds.json จริงเด็ดขาด (verify อาจรันคาบเกี่ยว worker จริง)
{
  const cp = require('child_process');
  const os = require('os');
  const realSeeds = path.join(__dirname, '..', 'tools', 'seeds.json');
  const before = fs.readFileSync(realSeeds, 'utf8');
  const tmpSeeds = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seeds-')), 'seeds.json');
  fs.writeFileSync(tmpSeeds, '{}\n');
  const script = path.join(__dirname, '..', 'tools', 'pick-brand.js');
  const env = { ...process.env, STOCK_SEEDS_FILE: tmpSeeds };
  // เทสไฟล์นี้ sync ทั้งไฟล์ — ให้ shell รัน 2 ตัวขนานแล้ว wait · seeds ของจริงห้ามแตะ (STOCK_SEEDS_FILE ชี้ไฟล์ชั่วคราว)
  const r = cp.spawnSync('sh', ['-c', `"${process.execPath}" "${script}" ZZTESTA "#1a73e8" --auto 2>&1 & "${process.execPath}" "${script}" ZZTESTB "#1a73e8" --auto 2>&1; wait`], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
  const seeds = JSON.parse(fs.readFileSync(tmpSeeds, 'utf8'));
  ok(seeds.ZZTESTA && seeds.ZZTESTB, 'pick-brand ขนาน: ได้ทั้ง 2 entry (ไม่มี entry ทับหาย)', (r.stdout || '').slice(-400));
  ok(seeds.ZZTESTA && seeds.ZZTESTB && seeds.ZZTESTA !== seeds.ZZTESTB, 'pick-brand ขนาน: --auto สลับเฉดให้ตัวที่มาทีหลัง (เห็นสีของอีกตัวเพราะอ่านใต้ lock)', (r.stdout || '').slice(-400));
  ok(fs.readFileSync(realSeeds, 'utf8') === before, 'pick-brand ขนาน: seeds.json จริงไม่ถูกแตะ');
}

// ---------- quarantine: patch แล้ว gate ตก = ไม่เขียนไฟล์ + flag patch-rejected (WS2 ข้อ 1 · code-audit §6.A) ----------
{
  const good = U.gateAfterPatch(aapl, 'AAPL.html');
  ok(good.ok && good.codes.length === 0, 'gateAfterPatch: fixture ดี → ok', good.detail);
  // ทำ .fv-box ไม่ตรง report-data.fv → E15 (ไม่ขึ้นกับราคา) — patchReport ยังทำงานได้ (ไม่แตะ fv-box)
  const bad = aapl.replace(/(class="fv-box"[\s\S]*?class="r">\s*\$?)([0-9][0-9.,]*)/, (m, a, v) => a + (parseFloat(v.replace(/,/g, '')) * 2).toFixed(0));
  ok(bad !== aapl, '(ตั้งฉาก) แก้ .fv-box ได้จริง');
  const patched = U.patchReport(bad, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: null });
  const g = U.gateAfterPatch(patched.html, 'AAPL.html');
  ok(!g.ok && g.codes.includes('E15'), 'gateAfterPatch: ไฟล์ที่ patch แล้ว gate ตก → ok=false + รหัส', g.codes.join(','));
  ok(/E15/.test(g.detail) && g.detail.length <= 400, 'gateAfterPatch: detail มีรหัส + สั้นพอลง price-flags.json');
  const broken = U.gateAfterPatch('<!DOCTYPE html><html><head><!--TEMPLATE:STYLE--></head><body></body></html>', 'X.html');
  ok(!broken.ok && broken.codes[0] === 'EXPAND', 'gateAfterPatch: expandReport ระเบิด → EXPAND ไม่ throw');

  // W17 ยกเป็น error (audit phase 1 ข้อ C(ค) — 12 ก.ย. 69): ต้องเข้า quarantine เป็น patch-rejected เหมือน error ตัวอื่น ไม่ใช่ throw
  // ★ ห้ามยืนบนราคาที่ patchReport แก้ (301.5 ใช้ทั่วไฟล์นี้) — อ่านราคาจากฐานฉบับสดเอง แล้วซ่อมหมวด 6 ไปที่จุดเข้าคนละราคา (0.7×px)
  //   ⇒ header/stock-meta ยังโชว์ px เดิม แต่หมวด 6 ถูกซ่อมให้สอดคล้องกับ 0.7×px → scenarioPlan ตัดสินได้แต่ค่าค้าง → W17 ต้องฟ้อง
  const DVq = require('../tools/derived-values.js');
  const freshAapl = FX.AAPL();
  const smQ = RM.readStockMeta(freshAapl);
  const px = smQ.price;
  const staleScn = DVq.patchDerived(freshAapl, px * 0.7).html;
  ok(staleScn !== freshAapl, '(ตั้งฉาก) patchDerived ที่จุดเข้า 0.7×px ทำให้หมวด 6 เปลี่ยนจริง');
  const gw = U.gateAfterPatch(staleScn, 'AAPL.html');
  ok(!gw.ok && gw.codes.includes('W17'), 'gateAfterPatch: W17 (ยกเป็น error) ที่ตกหลัง patch → ok=false + patch-rejected ไม่ throw', gw.codes.join(','));
}

// ---------- ระยะ 2 ส่วน D: keepMap (tools/keep-map.js) ----------
{
  const { keepMap } = require('../tools/keep-map.js');
  // ความถูกต้องของ map: เพิ่มขึ้นเคร่งครัด · อักขระตรงกัน · จำนวน = ความยาว LCS (DP อ้างอิง)
  const lcsLen = (a, b) => { const d = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[a.length][b.length]; };
  const valid = (a, b, m) => { let last = -1, c = 0; for (let i = 0; i < a.length; i++) { if (m[i] < 0) continue; if (m[i] <= last || a[i] !== b[m[i]]) return false; last = m[i]; c++; } return c === lcsLen(a, b); };
  const a1 = 'P/E ~40x ราคา', b1 = 'P/E ~44x ราคา', m1 = keepMap(a1, b1);
  ok(m1.length === a1.length && valid(a1, b1, m1), 'keepMap: แทนที่กลางสตริง → map ถูกต้อง (LCS)');
  ok(m1[a1.indexOf('0')] === -1 && m1[0] === 0 && m1[a1.length - 1] === b1.length - 1, 'keepMap: อักขระที่ถูกแทน = -1 · prefix/suffix map ตรงตัว');
  // ตัวเลขซ้ำ: "$121" อยู่ใน "$121.20" — แทรก ".20" ต่อท้ายต้องคง $121 ทั้ง 4 ตัวที่ index เดิม
  const a2 = 'เป้า $121 (+3%)', b2 = 'เป้า $121.20 (+3%)', m2 = keepMap(a2, b2);
  ok(valid(a2, b2, m2) && [0, 1, 2, 3].every((i) => m2[a2.indexOf('$') + i] === b2.indexOf('$') + i), 'keepMap: ตัวเลขซ้ำ $121 ใน $121.20 → map คงอยู่ครบ');
  ok(valid('abc', 'abc', keepMap('abc', 'abc')) && keepMap('abc', 'abc').every((v, i) => v === i), 'keepMap: เหมือนกันทั้งสตริง → identity');
  ok(keepMap('abcdef', 'abXYef').join() === '0,1,-1,-1,4,5', 'keepMap: prefix/suffix ร่วม + แทนกลาง');
  ok(keepMap('abc', '').every((v) => v === -1) && keepMap('', 'abc').length === 0, 'keepMap: สตริงว่าง');
  let fuzzBad = 0, seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rs = (n) => Array.from({ length: n }, () => 'ab1'[Math.floor(rnd() * 3)]).join('');
  for (let t = 0; t < 2000; t++) { const a = rs(Math.floor(rnd() * 12)), b = rs(Math.floor(rnd() * 12)); if (!valid(a, b, keepMap(a, b))) fuzzBad++; }
  ok(fuzzBad === 0, 'keepMap: fuzz 2000 คู่ (seed คงที่) ตรง LCS ทุกคู่', String(fuzzBad));
}

// ---------- ระยะ 2 ส่วน D: patchReport ทาง v2 = เขียน JSON + pass derived บน view ที่ render (token เป็นเจ้าของ) ----------
{
  const RV = require('../tools/report-values.js');
  const { expandReport } = require('../build.js');
  const TOK = /\{\{rd:[A-Za-z0-9]+\}\}/g;
  const toks = (h) => h.match(TOK) || [];
  const sameToks = (a, b) => { const x = toks(a), y = toks(b); return x.length === y.length && x.every((t, i) => t === y[i]); };
  const src = FX.AAPL_V2();
  const rd0 = RM.readReportData(src).data;
  const dateParts = { day: 12, monIdx: 8, yearCE: 2026 };
  for (const k of [1.1, 0.9]) {
    const newPrice = rd0.values.px * k;
    const chartData = rd0.chart.data.map((d) => [d[0], d[1]]); chartData[chartData.length - 1][1] = Math.round(newPrice * 100) / 100;
    const r = U.patchReport(src, { newPrice, dateParts, chartData });
    const rd1 = RM.readReportData(r.html).data, sm1 = RM.readStockMeta(r.html);
    const px1 = Math.round(newPrice * 100) / 100;
    ok(rd1.values.px === px1 && rd1.values.priceDate === '2026-09-12', `v2 ×${k}: values.px/priceDate ถูกเขียน`);
    ok(rd1.gauge.cur === undefined && rd1.gauge.fair === undefined && rd1.chart.fairLine === undefined, `v2 ×${k}: ไม่สร้าง gauge.cur/fair/fairLine กลับมา`);
    ok(sm1.price === px1 && Math.abs(sm1.mos - Math.round((rd1.fv - px1) / rd1.fv * 1000) / 10) < 1e-9, `v2 ×${k}: stock-meta.price/mos กระจกจาก values/fv`);
    // fix wave F1 (แทน Task 11 F2/F4): pe/dividendYield เป็นของ pass derived (ฐานการ์ดที่ค่าเดิมยืนอยู่) เหมือน v1 ทุกประการ
    //   ⇒ v2 ต้องได้ค่าเท่ากับ v1 patchReport ที่ราคาเดียวกัน (ราคาปัด 2 ตำแหน่งให้ตัวตั้งตรงกัน — v2 ใช้ values.px)
    const smV1 = RM.readStockMeta(U.patchReport(FX.AAPL(), { newPrice: px1, dateParts, chartData }).html);
    ok(sm1.pe === smV1.pe && sm1.dividendYield === smV1.dividendYield, `v2 ×${k}: stock-meta.pe/dividendYield = ผลของ v1 ที่ราคาเดียวกัน (pass derived เป็นเจ้าของ)`, `v2 ${sm1.pe}/${sm1.dividendYield} v1 ${smV1.pe}/${smV1.dividendYield}`);
    // (ก) ลำดับ token เท่าต้นฉบับทุกตัว
    ok(sameToks(src, r.html), `v2 ×${k}: ลำดับ token {{rd:…}} เท่าต้นฉบับ`);
    // (ข) การ์ด literal ถูก pass derived เขียนตามราคาใหม่ — ปันผล % ของ AAPL_V2 ("0.32%" 2 ตำแหน่ง)
    const yCard = (r.html.match(/<div class="k">เงินปันผล<\/div><div class="v">([^<]*)</) || [])[1];
    ok(yCard === (1.04 / px1 * 100).toFixed(2) + '%', `v2 ×${k}: การ์ดปันผล % literal ถูกเขียนตามราคาใหม่`, yCard);
    ok(r.derived.length > 0, `v2 ×${k}: derived ไม่ว่าง (การ์ด literal ถูกแก้)`);
    ok(r.chg && r.chg.dir && typeof r.mos === 'number', `v2 ×${k}: คืน chg/mos สำหรับ log/freeze เหมือน v1`);
    ok(expandReport(r.html).includes('<div class="px">$' + RV.fmtPrice(newPrice)), `v2 ×${k}: ราคาใหม่ render ใน header`);
    // (ค) กันถดถอย defect "เขียน JSON อย่างเดียว ⇒ E41/E42/E43/W19/W20" — ห้ามผ่อน
    const g = U.gateAfterPatch(r.html, 'AAPL.html');
    ok(g.ok, `v2 ×${k}: gateAfterPatch ผ่านหลัง patch`, g.detail);
  }
  // IPO: suffix มาจาก values.chgSuffix (HTML เป็น {{rd:chg}} อ่านคำ IPO ไม่ได้)
  const ipo = src.replace('"chgSuffix": "รอบปี"', '"chgSuffix": "ตั้งแต่ IPO"');
  ok(ipo !== src && /IPO/.test(U.patchReport(ipo, { newPrice: rd0.values.px, dateParts, chartData: null }).chg.text), 'v2: suffix .chg จาก values.chgSuffix');
  // ราคาหลุดขอบ gauge → ขยายขอบ (ใช้ values.px)
  const big = U.patchReport(src, { newPrice: rd0.gauge.max * 1.2, dateParts, chartData: null });
  ok(RM.readReportData(big.html).data.gauge.max > rd0.gauge.max && RM.readReportData(big.html).data.gauge.cur === undefined, 'v2: gauge auto-rescale ใช้ values.px (ไม่สร้าง gauge.cur)');
  // pe:null ตั้งใจ (ขาดทุน) ต้องคง null แม้ values มี eps
  const peNull = src.replace(/"pe":\s*[0-9.]+/, '"pe":null');
  ok(RM.readStockMeta(U.patchReport(peNull, { newPrice: rd0.values.px * 1.05, dateParts, chartData: null }).html).pe === null, 'v2: stock-meta.pe เดิม null → คง null');
  // BBL_V2 (THB · มี {{rd:yield}}) — gate ผ่านทั้งสองทาง
  const bbl = FX.BBL_V2(), bpx = RM.readReportData(bbl).data.values.px;
  for (const k of [1.1, 0.9]) {
    const rb = U.patchReport(bbl, { newPrice: bpx * k, dateParts, chartData: null });
    ok(sameToks(bbl, rb.html) && U.gateAfterPatch(rb.html, 'BBL.html').ok, `v2 BBL ×${k}: token คงลำดับ + gate ผ่าน`);
  }
  // main loop: decide() ใช้ fv ของ v2 = report-data.fv (stock-meta.fairValue เป็นกระจก)
  const smFv = src.replace(/"fairValue":\s*[0-9.]+/, '"fairValue":99999');
  ok(U.fvOf(smFv, RM.readStockMeta(smFv)) === rd0.fv && U.fvOf(FX.AAPL(), RM.readStockMeta(FX.AAPL())) === RM.readStockMeta(FX.AAPL()).fairValue, 'fvOf: v2 = report-data.fv · v1 = stock-meta.fairValue');

  // (ง) override: span ของ token ที่ pass derived พยายามแก้ ⇒ token คงอยู่ (token ชนะ)
  //     การ์ด P/E เป็น ~{{rd:pe}}x แล้วเรียก pass ด้วยราคาคนละค่ากับ values.px ⇒ patchDerived อยากเขียนเลขใหม่ลง span ของ token
  const peTok = src.replace(/(<div class="k">P\/E \(TTM\)<\/div><div class="v neu">)~40x/, '$1~{{rd:pe}}x');
  ok(peTok !== src, '(ตั้งฉาก) ใส่ {{rd:pe}} ในการ์ด P/E ได้');
  const ov = U.derivedPassV2(peTok, rd0.values.px * 1.1);
  ok(ov.overridden >= 1 && ov.html.includes('<div class="v neu">~{{rd:pe}}x</div>') && sameToks(peTok, ov.html), 'derivedPassV2: span ที่ถูกแก้ → token ชนะ + นับ overridden', String(ov.overridden));
  ok(ov.changes.some((c) => /P\/E \[P\/E \(TTM\)\]/.test(c)), '(ตั้งฉาก) patchDerived พยายามแก้การ์ด P/E นั้นจริง');
  // (จ) token render ว่าง ({{rd:scnNote}} เมื่อ divIncluded:false) — ไม่มี span ให้ map แต่ token ต้องอยู่ที่เดิม
  const noteTok = src.replace(/(EPS ฐาน ~\{\{rd:baseEps\}\})/, '$1{{rd:scnNote}}');
  ok(noteTok !== src && RV.renderValues('{{rd:scnNote}}', rd0, RM.readStockMeta(src)) === '', '(ตั้งฉาก) scnNote render ว่าง');
  const rn = U.patchReport(noteTok, { newPrice: rd0.values.px * 1.1, dateParts, chartData: null });
  ok(sameToks(noteTok, rn.html) && rn.html.includes('{{rd:baseEps}}{{rd:scnNote}}'), 'v2: token render ว่างคงตำแหน่ง + ลำดับ');
  ok(U.gateAfterPatch(rn.html, 'AAPL.html').ok, 'v2: token render ว่าง → gate ผ่าน');
  // ★ ระยะ 3 (open-items #43): AAPL_V2 fixture ยังมี style="color:#ff8a80" ค้างที่ vcell (เหมือนใบจริงส่วนใหญ่
  //   ก่อน sweep — ดู test/fixtures/README.md ห้ามแก้ fixture ด้วยมือ) ⇒ ราคาเดิมไม่ใช่ "ไม่มีอะไรให้แก้" อีก
  //   ต่อไป แต่ต้องเป็น "แก้สีช่องสรุปเท่านั้น" — ไม่มี token span ไหนถูกแก้ (overridden ยังต้อง 0) และไม่มี
  //   การเปลี่ยนแปลงอื่นนอกจากแท็กเปิดของช่องนั้น (พิสูจน์ด้วยการสลับแท็กกลับแล้วเทียบ byte กับต้นฉบับ)
  const same = U.derivedPassV2(src, rd0.values.px);
  ok(same.overridden === 0, 'derivedPassV2: ราคาเดิม → ไม่มี token span ไหนถูกแก้ (overridden=0)');
  ok(same.changes.length === 1 && /^ช่องสรุป สี:/.test(same.changes[0]), 'derivedPassV2: ราคาเดิม → มีแค่การ migrate สีช่องสรุป (debt เดิมของ fixture) ไม่มีอะไรอื่นให้แก้', JSON.stringify(same.changes));
  const tagSame = DVcell.summaryOpenTag(same.html), tagSrc = DVcell.summaryOpenTag(src);
  ok(tagSame && tagSrc && tagSame.open === '<div class="v bad">' && same.html.slice(0, tagSame.at) + tagSrc.open + same.html.slice(tagSame.at + tagSame.len) === src,
    'derivedPassV2: ราคาเดิม → ต่างจากต้นฉบับเฉพาะแท็กเปิดของช่องสรุปเท่านั้น (byte อื่นเหมือนเดิมทุกตัว)');
  ok(/ไม่ใช่ v2/.test((() => { try { U.derivedPassV2(FX.AAPL(), 300); return ''; } catch (e) { return e.message; } })()), 'derivedPassV2: v1 → throw');
}

// ---------- ระยะ 2 ส่วน D · Task 11 fix round 1: derivedPassV2 ขอบ/ช่องว่าง · กระจก stock-meta · MAX_D · healDerived ----------
// stub patchDerived ผ่าน require.cache บนสำเนา update-prices ที่โหลดใหม่ (ตัวจริง U ไม่ถูกแตะ) — edit(view) = pv ที่ต้องการ
{
  const os = require('os');
  const RV = require('../tools/report-values.js');
  const KM = require('../tools/keep-map.js');
  const DVpath = require.resolve('../tools/derived-values.js'), UPpath = require.resolve('../tools/update-prices.js');
  const realDV = require(DVpath), savedUP = require.cache[UPpath];
  let edit = null;
  require.cache[DVpath].exports = { ...realDV, patchDerived: (h, p, o) => (edit ? { html: edit(h), changes: ['stub'] } : realDV.patchDerived(h, p, o)) };
  delete require.cache[UPpath];
  const US = require(UPpath);
  require.cache[DVpath].exports = realDV;
  require.cache[UPpath] = savedUP;

  const TOK = /\{\{rd:[A-Za-z0-9]+\}\}/g;
  const sameToks = (a, b) => { const x = a.match(TOK) || [], y = b.match(TOK) || []; return x.length === y.length && x.every((t, i) => t === y[i]); };
  const errOf = (f) => { try { f(); return ''; } catch (e) { return e.message || String(e); } };
  const renderOf = (h) => RV.renderValues(h, RM.readReportData(h).data, RM.readStockMeta(h));
  // ผลของ pass ด้วย stub + pv ที่ stub สร้าง (ไว้เทียบ render)
  const pass = (h, fn) => {
    edit = fn;
    try { const r = US.derivedPassV2(h, RM.readReportData(h).data.values.px); return { ...r, pv: fn(renderOf(h)), err: '' }; }
    catch (e) { return { err: e.message, overridden: -1, html: '' }; }
    finally { edit = null; }
  };
  const src = FX.AAPL_V2();
  const rd0 = RM.readReportData(src).data;
  const dateParts = { day: 12, monIdx: 8, yearCE: 2026 };

  // F1 — แทรกชิดขอบ span ของ token = กำกวม ⇒ token ชนะ (ห้ามเลขติด token เงียบ ๆ)
  //      กันถดถอยต่อ mutation "ถอดเงื่อนไขขอบ before(s)===map[s] / after(e)===map[e-1]+1" (เดิมได้ "~{{rd:baseEps}}5" · "1{{rd:pxNum}}")
  const f1a = pass(src, (v) => v.replace('EPS ฐาน ~$8.26<', 'EPS ฐาน ~$8.265<'));
  ok(!f1a.err && f1a.overridden === 1 && f1a.html.includes('EPS ฐาน ~{{rd:baseEps}}</div>') && sameToks(src, f1a.html), 'F1: $8.26→$8.265 (แทรกขอบขวา) → token ชนะ ไม่มี "5" ติด token', f1a.err || (f1a.html.match(/EPS ฐาน ~[^<]*/) || [])[0]);
  const f1b = pass(src, (v) => v.replace('value="326.57"', 'value="1326.57"'));
  ok(!f1b.err && f1b.overridden === 1 && f1b.html.includes('value="{{rd:pxNum}}"') && sameToks(src, f1b.html), 'F1: 326.57→1326.57 (แทรกขอบซ้าย) → token ชนะ ไม่มี "1" ติด token', f1b.err || (f1b.html.match(/type="number" value="[^"]*"/) || [])[0]);
  const f1c = pass(src, (v) => v.replace('value="326.57"', 'value="326.570"'));
  ok(!f1c.err && f1c.overridden === 1 && f1c.html.includes('value="{{rd:pxNum}}"'), 'F1: 326.57→326.570 → token ชนะ ไม่มี "0" ติด token', f1c.err);
  // แก้ literal ที่ไม่ชิดขอบ (มีอักขระคงอยู่คั่น) = ไม่ override และ render(ผล) === pv
  const f1d = pass(src, (v) => v.replace('~$318.00 (-3%)', '~$318.00 (-13%)'));
  ok(!f1d.err && f1d.overridden === 0 && renderOf(f1d.html) === f1d.pv && f1d.html.includes('~{{rd:analystTgt}} (-13%)'), 'F1: แก้ literal ห่างขอบ token 2 อักขระ → ไม่ override + render(ผล) === pv', f1d.err);

  // F3 — token render ว่างไม่เคย override: literal ที่ถูกแก้/แทรกชิด token ว่างอยู่รอด
  const bullet = src.replace('จากจุดเข้า {{rd:px}} • EPS', 'จากจุดเข้า {{rd:px}} •{{rd:scnNote}} EPS');
  ok(bullet !== src, '(ตั้งฉาก) วาง {{rd:scnNote}} ชิด "•" ได้');
  const f3a = pass(bullet, (v) => v.replace('$326.57 • EPS', '$326.57 ◦ EPS'));
  ok(!f3a.err && f3a.overridden === 0 && /จากจุดเข้า \{\{rd:px\}\} (?:◦\{\{rd:scnNote\}\}|\{\{rd:scnNote\}\}◦) EPS/.test(f3a.html) && renderOf(f3a.html) === f3a.pv && sameToks(bullet, f3a.html),
    'F3: แทน "•"→"◦" ชิด token ว่าง → "◦" อยู่รอด · ไม่ override · render(ผล) === pv', f3a.err || (f3a.html.match(/จากจุดเข้า [^<]*/) || [])[0]);
  const f3b = pass(bullet, (v) => v.replace('$326.57 • EPS', '$326.57 • (x) EPS'));
  ok(!f3b.err && f3b.overridden === 0 && f3b.html.includes('•{{rd:scnNote}} (x) EPS') && renderOf(f3b.html) === f3b.pv,
    'F3/F4: แทรกตรงตำแหน่ง token ว่าง → คงของที่แทรก (ต่อท้าย token) และไม่นับ override', f3b.err || String(f3b.overridden));
  const noteTok = src.replace(/(EPS ฐาน ~\{\{rd:baseEps\}\})/, '$1{{rd:scnNote}}');
  const f3c = pass(noteTok, (v) => v.replace('EPS ฐาน ~$8.26<', 'EPS ฐาน ~$8.27<'));
  ok(!f3c.err && f3c.overridden === 1 && f3c.html.includes('EPS ฐาน ~{{rd:baseEps}}{{rd:scnNote}}</div>') && sameToks(noteTok, f3c.html),
    'F3: override ชิด {{rd:scnNote}} (render ว่าง) → ไม่ throw + ลำดับคงเดิม', f3c.err);

  // F4 — ตรึงข้อกำหนดที่ mutant เคยรอด
  // ลำดับ token: pv มีข้อความรูป token งอกมา ⇒ throw "ลำดับ token" (ไม่ใช่ tripwire render ที่ตามมาทีหลัง)
  const f4order = pass(src, (v) => v.replace('<div class="k">เงินปันผล</div>', '<div class="k">เงินปันผล{{rd:fv}}</div>'));
  ok(/ลำดับ token/.test(f4order.err), 'F4: token งอก/สลับหลังประกอบ → throw "ลำดับ token" (→ patch-failed)', f4order.err);
  // ความต่อเนื่องใน span: แทรกกลาง span (อักขระของ token คงอยู่ครบแต่ไม่ติดกัน) ⇒ token ชนะ นับ override ไม่ throw
  const f4contig = pass(src, (v) => v.replace('EPS ฐาน ~$8.26<', 'EPS ฐาน ~$8.X26<'));
  ok(!f4contig.err && f4contig.overridden === 1 && f4contig.html.includes('EPS ฐาน ~{{rd:baseEps}}</div>'), 'F4: แทรกกลาง span → token ชนะ (overridden 1 · ตัด "X")', f4contig.err || String(f4contig.overridden));
  // ตัวตั้งของ pass = values.px (ปัดแล้ว) ไม่ใช่ราคาดิบ — BBL ×0.97 ราคาดิบทำให้ "จากจุดเข้า {{rd:px}}" ถูกแก้ต่าง 1 สตางค์ (override 2 span เปล่า ๆ)
  {
    const bbl = FX.BBL_V2(), bpx = RM.readReportData(bbl).data.values.px;
    const rb = U.patchReport(bbl, { newPrice: bpx * 0.97, dateParts, chartData: null });
    ok(!rb.notes.some((n) => /token ชนะ/.test(n)) && U.gateAfterPatch(rb.html, 'BBL.html').ok, 'F4: BBL ×0.97 → pass ใช้ values.px ไม่มี override', rb.notes.join(' ; '));
  }
  // fix wave F1 (i) (แทน Task 11 F4 "JSON ชนะการ์ด"): ฐานการ์ด (DPS 1.04) ≠ values.dps (1.10) · การ์ด P/E (EPS 8.26) ≠ values.eps
  //   ⇒ pass derived เขียน stock-meta.pe/dividendYield บน view จากฐานการ์ด แล้ว **กระจกต้องไม่ย้อน** (อ่าน stock-meta จากผลของ pass)
  {
    const dpsSrc = src.replace('"dps": 1.04', '"dps": 1.1').replace('"eps": 8.26', '"eps": 5');
    ok(dpsSrc !== src && /"eps": 5,/.test(dpsSrc), '(ตั้งฉาก) แก้ values.dps/eps ให้ต่างจากฐานการ์ดได้');
    const np = rd0.values.px * 1.1, px1 = Math.round(np * 100) / 100;
    const r = U.patchReport(dpsSrc, { newPrice: np, dateParts, chartData: null });
    const smR = RM.readStockMeta(r.html);
    ok(r.derived.some((c) => /stock-meta\.dividendYield .*DPS 1\.04/.test(c)) && r.derived.some((c) => /stock-meta\.pe .*EPS 8\.26/.test(c)), '(ตั้งฉาก) patchDerived เขียน dividendYield/pe จากฐานการ์ด (1.04 · 8.26) จริง', r.derived.join(' ; '));
    ok(smR.dividendYield === Math.round(1.04 / px1 * 10000) / 100, 'F1(i): stock-meta.dividendYield = ฐานการ์ด 1.04/px — กระจกไม่ย้อนเป็น values.dps 1.1', String(smR.dividendYield));
    ok(smR.pe === Math.round(px1 / 8.26 * 10) / 10, 'F1(i): stock-meta.pe = px/ฐานการ์ด 8.26 — กระจกไม่ย้อนเป็น px/values.eps 5', String(smR.pe));
    ok(smR.price === px1 && smR.fairValue === RM.readReportData(r.html).data.fv, 'F1(i): กระจกยังเขียน price/fairValue ตาม values/fv');
  }
  // ขอบกราฟครอบ fv (v2 ไม่มี chart.fairLine)
  {
    const fvHi = src.replace('"fv": 262', '"fv": 500');
    ok(fvHi !== src, '(ตั้งฉาก) แก้ fv ได้');
    const r = U.patchReport(fvHi, { newPrice: rd0.values.px * 0.9, dateParts, chartData: null });
    const c = RM.readReportData(r.html).data.chart;
    ok(Math.max(...c.data.map((d) => d[1])) < 500 && c.max >= 500, 'F4: v2 chart.max ครอบ rd.fv เมื่อ fv สูงกว่าทุกราคา', String(c.max));
  }

  // fix wave F1/F4 (แทน Task 11 F2 ทศนิยม pe/yield ที่กระจกเคยคิดเอง): RV.mirrorStockMeta เขียน 4 คีย์เท่านั้น
  {
    const RVm = require('../tools/report-values.js');
    const drift = src.replace('"px": 326.57', '"px": 359.23').replace('"dividendYield":0.32', '"dividendYield":0.07').replace('"pe":39.5', '"pe":12.34');
    ok(drift !== src && /"pe":12\.34/.test(drift), '(ตั้งฉาก) values.px ขยับ + pe/dividendYield ใน stock-meta เป็นค่าแปลก');
    const m = RM.readStockMeta(RVm.mirrorStockMeta(drift)), fv = rd0.fv;
    ok(m.price === 359.23 && m.fairValue === fv && m.mos === Math.round((fv - 359.23) / fv * 1000) / 10 && m.upside === Math.round((fv - 359.23) / 359.23 * 1000) / 10, 'F1: mirrorStockMeta เขียน price/mos/upside/fairValue จาก values.px/fv', JSON.stringify(m));
    ok(m.pe === 12.34 && m.dividendYield === 0.07, 'F1: mirrorStockMeta ไม่แตะ pe/dividendYield (ของ pass derived)', `${m.pe} ${m.dividendYield}`);
    ok(RVm.mirrorStockMeta(src) === src, 'F1: ไม่มีอะไรเปลี่ยน → คืน html เดิมทุก byte (idempotent)');
    ok(U.mirrorStockMetaV2(drift, { pe: 1, dividendYield: 1 }) === RVm.mirrorStockMeta(drift), 'F1: alias mirrorStockMetaV2 = RV.mirrorStockMeta (อาร์กิวเมนต์ stock-meta ก่อน pass ถูกเมิน)');
    ok(/ไม่ใช่ v2/.test(errOf(() => RVm.mirrorStockMeta(FX.AAPL()))), 'F1: mirrorStockMeta บน v1 → throw');
  }

  // fix wave F1 (ii)/(iii) — fixture รูปคลังจริง (M10): DDOG stock-meta.pe ยืนบนฐาน adjusted (75) ขณะ values.eps = GAAP
  //   · SRE DPS ในการ์ดปันผล ($2.38→$2.48→$2.58 · ฐาน W19) ≠ values.dps 2.58 — ทั้งคู่ต้องเท่ากับ v1 และผ่าน gate
  {
    const px2 = (h, k) => Math.round(RM.readReportData(h).data.values.px * k * 100) / 100;
    const saved = process.env.STALE_TODAY;
    process.env.STALE_TODAY = '2026-09-13';
    try {
      const dp2 = { day: 12, monIdx: 8, yearCE: 2026 };
      for (const k of [1.005, 0.9, 1.1]) {
        const np = px2(FX.DDOG_V2(), k);
        const r2 = U.patchReport(FX.DDOG_V2(), { newPrice: np, dateParts: dp2, chartData: null });
        const r1 = U.patchReport(FX.DDOG(), { newPrice: np, dateParts: dp2, chartData: null });
        const a2 = RM.readStockMeta(r2.html), a1 = RM.readStockMeta(r1.html);
        ok(a2.pe === a1.pe && a2.dividendYield === a1.dividendYield && Math.abs(a2.pe - 75 * k) / (75 * k) < 0.05, `F1(ii) DDOG ×${k}: stock-meta.pe/dividendYield v2 = v1 (ฐาน adjusted ~75 ไม่กระโดดเป็น px/values.eps)`, `v2 ${a2.pe}/${a2.dividendYield} v1 ${a1.pe}/${a1.dividendYield} · px/eps=${(np / RM.readReportData(FX.DDOG_V2()).data.values.eps).toFixed(1)}`);
        const g = U.gateAfterPatch(r2.html, 'DDOG.html');
        ok(g.ok, `F1(ii) DDOG ×${k}: gateAfterPatch ผ่าน`, g.detail);
      }
      for (const k of [0.9, 0.95, 0.97]) {
        const np = px2(FX.SRE_V2(), k);
        const r2 = U.patchReport(FX.SRE_V2(), { newPrice: np, dateParts: dp2, chartData: null });
        const r1 = U.patchReport(FX.SRE(), { newPrice: np, dateParts: dp2, chartData: null });
        const g = U.gateAfterPatch(r2.html, 'SRE.html');
        ok(g.ok, `F1(iii) SRE ×${k}: gateAfterPatch ผ่าน (เดิม W19 dividendYield จาก values.dps)`, g.detail);
        ok(RM.readStockMeta(r2.html).dividendYield === RM.readStockMeta(r1.html).dividendYield, `F1(iii) SRE ×${k}: stock-meta.dividendYield v2 = v1`, `${RM.readStockMeta(r2.html).dividendYield} vs ${RM.readStockMeta(r1.html).dividendYield}`);
      }
    } finally { process.env.STALE_TODAY = saved; }
  }

  // F5 — MAX_D = 4000: เกิน = throw (→ patch-failed) · D = 4000 พอดียัง map ได้
  ok(KM.MAX_D === 4000, 'F5: keepMap MAX_D = 4000', String(KM.MAX_D));
  ok(errOf(() => KM.keepMap('a'.repeat(2000), 'b'.repeat(2000))) === '' && /เกิน 4000/.test(errOf(() => KM.keepMap('a'.repeat(2001), 'b'.repeat(2001)))), 'F5: D=4000 map ได้ · D=4002 throw');
  // สองจุดห่างกัน (ตัด prefix/suffix ร่วมแล้วยังเหลือช่วงกลาง) แทรกรวม 4200 อักขระ ⇒ D > 4000
  edit = (v) => v.replace('<div class="k">เงินปันผล</div>', '<div class="k">เงินปันผล' + 'x'.repeat(2100) + '</div>').replace('EPS ฐาน ~$8.26<', 'EPS ฐาน ~$8.26' + 'y'.repeat(2100) + '<');
  const f5 = errOf(() => US.patchReport(src, { newPrice: rd0.values.px * 1.1, dateParts, chartData: null }));
  edit = null;
  ok(/keepMap: ต่างกันเกิน 4000/.test(f5), 'F5: patchReport ต่างเกิน MAX_D → throw (main loop จับเป็น patch-failed)', f5);

  // F6 — healDerived: ไฟล์ throw ไม่ล้มทั้งรอบ · พิมพ์ชื่อไฟล์ · คืน failed ให้ main ตั้ง exit code
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heal-v2-'));
    try {
      fs.writeFileSync(path.join(dir, 'AAPL.html'), src.replace('"px": 326.57', '"px": 359.23'));   // ค่าค้างจริง → ต้องถูกนับ
      fs.writeFileSync(path.join(dir, 'BAD.html'), src.replace('EPS ฐาน ~{{rd:baseEps}}', 'EPS ฐาน ~{{rd:bogusTok}}'));
      const logs = [], orig = console.log;
      console.log = (...a) => logs.push(a.join(' '));
      let h;
      try { h = U.healDerived({ dir, only: new Set(), write: false, prose: false }); } catch (e) { h = { thrown: e.message, failed: [] }; } finally { console.log = orig; }
      const txt = logs.join('\n');
      ok(h && h.failed.length === 1 && h.failed[0] === 'BAD.html' && h.touched === 1, 'F6: healDerived ไฟล์ throw 1 ใบ → ไปต่อ ใบดียังถูกประมวล', JSON.stringify(h));
      ok(/⛔ BAD\.html .*bogusTok/.test(txt) && /heal-derived: 1\/2 .*ล้ม 1 ไฟล์/.test(txt), 'F6: พิมพ์ ⛔ <ไฟล์> <ข้อความ> + สรุปนับตัวล้ม', txt.slice(-300));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
}

// ---------- ระยะ 2 ส่วน D · fix wave (final review): F2 scnBasis · F3 วันที่ literal + tripwire · M7 heal กระจกล้วน · M8 pxOf ----------
// fixture รูปคลังจริง (test/fixtures — M10 · ไม่อ่าน reports/) · STALE_TODAY ตั้งตามวันที่ที่ patch ลงไป (คืนค่าเดิมเสมอ)
{
  const os = require('os');
  const RV = require('../tools/report-values.js');
  const DV = require('../tools/derived-values.js');
  const CR = require('./check-reports.js');
  const { expandReport } = require('../build.js');
  const saved = process.env.STALE_TODAY;
  const errOf = (f) => { try { f(); return ''; } catch (e) { return e.message || String(e); } };
  const pxK = (h, k) => Math.round(RM.readReportData(h).data.values.px * k * 100) / 100;
  const TOK = /\{\{rd:[A-Za-z0-9]+\}\}/g;
  const sameToks = (a, b) => { const x = a.match(TOK) || [], y = b.match(TOK) || []; return x.length === y.length && x.every((t, i) => t === y[i]); };
  try {
    process.env.STALE_TODAY = '2026-09-13';
    const dp12 = { day: 12, monIdx: 8, yearCE: 2026 };

    // F2 — W17/patchDerived#7 ใช้ values.scnBasis ที่ประกาศ แทนการอนุมานจากเลขที่ปัดแล้ว
    //   FTV (divIncluded:true) พลิกที่ ×1.005/×0.995/×1.09 · CASY (divIncluded:false) พลิกที่ ×0.995/×0.915/×1.045 (กริด 0.005 ของ final review)
    for (const [sym, ks, div] of [['FTV', [1.005, 0.995, 1.09], true], ['CASY', [0.995, 0.915, 1.045], false]]) {
      const v2 = FX[sym + '_V2']();
      ok(RM.readReportData(v2).data.values.scnBasis.divIncluded === div, `(ตั้งฉาก) ${sym}_V2 scnBasis.divIncluded = ${div}`);
      for (const k of ks) {
        const r = U.patchReport(v2, { newPrice: pxK(v2, k), dateParts: dp12, chartData: null });
        const g = U.gateAfterPatch(r.html, sym + '.html');
        ok(g.ok, `F2 ${sym} ×${k}: gateAfterPatch ผ่าน (W17 ใช้ฐานที่ประกาศ)`, g.detail);
        ok(!r.notes.some((n) => /token ชนะ/.test(n)), `F2 ${sym} ×${k}: pass derived ไม่พยายามเขียนหมวด 6 ทับ token (ไม่มี override)`, r.notes.join(' ; '));
        // ตั้งฉาก: การอนุมาน (ไม่ส่ง basis) บน view เดียวกันเดาอีกฐาน = บั๊กเดิมยังอยู่จริงที่ราคานี้
        const exp = expandReport(r.html), px = RM.readReportData(r.html).data.values.px;
        const guess = DV.scenarioPlan(exp, px), declared = DV.scenarioPlan(exp, px, undefined, RM.readReportData(r.html).data.values.scnBasis);
        ok(declared && declared.conv === (div ? 'div' : 'plain') && (!guess || guess.conv !== declared.conv || guess.items.some((it, i) => it.total && Math.abs(it.total.want - declared.items[i].total.want) > 0.5)),
          `(ตั้งฉาก) ${sym} ×${k}: ไม่ส่ง basis → อนุมานผิดฐาน/ตัดสินไม่ได้ · ส่ง basis → conv ตามที่ประกาศ`, `guess=${guess && guess.conv} declared=${declared && declared.conv}`);
      }
      // ฐานที่ประกาศไม่ได้ปิดปาก W17: หมวด 6 ค้างจริง (post-expand: values.px ×1.3 หลัง render) → W17 ยังยิง
      const exp = expandReport(v2);
      const stale = exp.replace(/("px":\s*)([0-9.]+)/, (m, a, n) => a + (parseFloat(n) * 1.3).toFixed(2));
      ok(stale !== exp && CR.checkHtml(stale, sym + '.html', { source: v2 }).errors.some((e) => e.id === 'W17'), `F2 ${sym}: หมวด 6 ค้างจริง (JSON ขยับหลัง render) → W17 ยังยิงภายใต้ฐานที่ประกาศ`);
    }
    ok(DV.scenarioPlan(expandReport(FX.AAPL()), 326.57) !== undefined && JSON.stringify(DV.scenarioPlan(FX.AAPL(), 330)) === JSON.stringify(DV.scenarioPlan(FX.AAPL(), 330, undefined, undefined)), 'F2: ไม่ส่ง basis (v1) = ผลเดิม');

    // F3 — วงเล็บทวนวันที่ที่มีคำขยาย (DPZ · migrator คง literal) ต้องขยับตามวันที่ราคา
    const dpz = FX.DPZ_V2();
    ok(dpz.includes('{{rd:priceDate}} (11 ก.ย. 2569 ตลาดปิด)'), '(ตั้งฉาก) DPZ_V2 วงเล็บทวนเป็น literal ต่อท้าย token');
    process.env.STALE_TODAY = '2026-10-03';
    const dOct = { day: 2, monIdx: 9, yearCE: 2026 };
    const rd = U.patchReport(dpz, { newPrice: pxK(dpz, 1.01), dateParts: dOct, chartData: null });
    ok(rd.html.includes('{{rd:priceDate}} (2 ต.ค. 2569 ตลาดปิด)') && sameToks(dpz, rd.html), 'F3 DPZ: วงเล็บทวน literal → "(2 ต.ค. 2569 ตลาดปิด)" (keep-map พากลับต้นฉบับ · token คงลำดับ)', (rd.html.match(/\{\{rd:priceDate\}\}[^<]{0,40}/) || [])[0]);
    ok(expandReport(rd.html).includes('ราคา ณ 2 ต.ค. 2569 (2 ต.ค. 2569 ตลาดปิด)'), 'F3 DPZ: หัวรายงานที่ render แล้วตรงกับ v1 ("ราคา ณ 2 ต.ค. 2569 (2 ต.ค. 2569 ตลาดปิด)")');
    ok(rd.derived.some((c) => /วงเล็บทวน/.test(c)), 'F3 DPZ: changes บอกการเขียนวงเล็บทวน', rd.derived.join(' ; '));
    const g3 = U.gateAfterPatch(rd.html, 'DPZ.html');
    ok(g3.ok, 'F3 DPZ: gateAfterPatch ผ่าน', g3.detail);
    ok(!U.patchReport(rd.html, { newPrice: pxK(dpz, 1.01), dateParts: dOct, chartData: null }).changed, 'F3 DPZ: patch ซ้ำวันเดิมราคาเดิม → ไม่เปลี่ยน (idempotent)');
    // วงเล็บถือวันที่ที่ไม่ใช่ทั้ง "วันก่อน patch" และ "วันใหม่" = เขียนไม่ได้ (ไม่เดา) → tripwire throw (main loop = patch-failed)
    const odd = dpz.replace('(11 ก.ย. 2569 ตลาดปิด)', '(3 ส.ค. 2569 ตลาดปิด)');
    ok(odd !== dpz && /วันที่ราคาที่โชว์ ≠ values\.priceDate 2026-10-02 — วงเล็บทวนใน header "3 ส\.ค\. 2569"/.test(errOf(() => U.patchReport(odd, { newPrice: pxK(dpz, 1.01), dateParts: dOct, chartData: null }))),
      'F3: วงเล็บทวนวันที่แปลก (ไม่ใช่วันเดิม/วันใหม่) → throw "วันที่ราคาที่โชว์ ≠ values.priceDate" ไม่เงียบ', errOf(() => U.patchReport(odd, { newPrice: pxK(dpz, 1.01), dateParts: dOct, chartData: null })));
    // healDerived (ไม่มีวันก่อน patch) บนไฟล์ที่วงเล็บค้าง → throw เหมือนกัน (ห้ามเงียบ)
    ok(/วันที่ราคาที่โชว์/.test(errOf(() => U.derivedPassV2(odd, RM.readReportData(odd).data.values.px))), 'F3: derivedPassV2 (ทาง heal) บนวงเล็บค้าง → throw');
    // .disc ระดับเดือน (migrator คง literal · RAM/TOST รูปเดียวกัน) → เดือนใหม่ คงรูประดับเดือน + ศักราชเดิม
    const aapl = FX.AAPL_V2();
    const monthDisc = aapl.replace('ข้อมูลราคา ณ {{rd:priceDate}}', 'ข้อมูลราคา ณ ก.ย. 2569');
    ok(monthDisc !== aapl, '(ตั้งฉาก) AAPL_V2 disclaimer → literal ระดับเดือน "ราคา ณ ก.ย. 2569"');
    const rm = U.patchReport(monthDisc, { newPrice: pxK(aapl, 1.01), dateParts: dOct, chartData: null });
    ok(rm.html.includes('ข้อมูลราคา ณ ต.ค. 2569'), 'F3: disclaimer ระดับเดือน literal → "ราคา ณ ต.ค. 2569" (ไม่เติมวัน)', (rm.html.match(/ข้อมูลราคา ณ [^<]{0,20}/) || [])[0]);
    const gm = U.gateAfterPatch(rm.html, 'AAPL.html');
    ok(gm.ok && !CR.checkHtml(expandReport(rm.html), 'AAPL.html', { source: rm.html }).warnings.some((w) => w.id === 'W22'), 'F3: disclaimer ระดับเดือนหลัง patch → gate ผ่าน + ไม่มี W22', gm.detail);
    // hit ที่อยู่ใน span ของ token = token ชนะ (ไม่เขียนซ้ำ) — AAPL_V2 disclaimer เป็น {{rd:priceDate}}
    const rt = U.patchReport(aapl, { newPrice: pxK(aapl, 1.01), dateParts: dOct, chartData: null });
    ok(sameToks(aapl, rt.html) && rt.html.includes('ข้อมูลราคา ณ {{rd:priceDate}}') && !rt.derived.some((c) => /^วันที่/.test(c)), 'F3: วันที่ที่เป็น token ไม่ถูกเขียนซ้ำ (token render วันใหม่เอง)', rt.derived.join(' ; '));
    // .disc ระดับวันที่เป็น literal (migrator แทน token เสมอ แต่ worker v2 เขียนมือได้) → ตัวเขียนเขียนวันใหม่ให้ ไม่ throw
    const dayDisc = aapl.replace('ข้อมูลราคา ณ {{rd:priceDate}}', 'ข้อมูลราคา ณ 5 ก.ย. 2569');
    const rdd = U.patchReport(dayDisc, { newPrice: pxK(aapl, 1.01), dateParts: dOct, chartData: null });
    ok(rdd.html.includes('ข้อมูลราคา ณ 2 ต.ค. 2569'), 'F3: disclaimer ระดับวัน literal (worker เขียนมือ) → ถูกเขียนเป็นวันใหม่', (rdd.html.match(/ข้อมูลราคา ณ [^<]{0,20}/) || [])[0]);

    // M7 — healDerived v2 นับ/เขียนการซ่อมที่กระจกอย่างเดียว (BBL_V2 stock-meta.fairValue ×1.2 → E30/E31)
    process.env.STALE_TODAY = FX.TODAY;
    {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heal-m7-'));
      try {
        const bbl = FX.BBL_V2();
        const broken = bbl.replace(/("fairValue":)([0-9.]+)/, (m, a, n) => a + Math.round(parseFloat(n) * 1.2 * 100) / 100);
        ok(broken !== bbl, '(ตั้งฉาก) BBL_V2 stock-meta.fairValue ×1.2');
        const before = CR.checkHtml(expandReport(broken), 'BBL.html', { source: broken }).errors.map((e) => e.id);
        ok(before.includes('E30') || before.includes('E31'), '(ตั้งฉาก) ก่อนซ่อม E30/E31 ยิง', before.join(','));
        fs.writeFileSync(path.join(dir, 'BBL.html'), broken);
        const logs = [], orig = console.log;
        console.log = (...x) => logs.push(x.join(' '));
        let h;
        try { h = U.healDerived({ dir, only: new Set(), write: true, prose: false }); } finally { console.log = orig; }
        const after = fs.readFileSync(path.join(dir, 'BBL.html'), 'utf8');
        ok(h.touched === 1 && after !== broken, 'M7: healDerived v2 ซ่อมกระจกล้วน → touched 1 + เขียนไฟล์', JSON.stringify(h));
        ok(/stock-meta กระจก .*fairValue/.test(logs.join('\n')), 'M7: มีบรรทัด change "stock-meta กระจก … fairValue …"', logs.join(' | ').slice(0, 300));
        const errsAfter = CR.checkHtml(expandReport(after), 'BBL.html', { source: after }).errors.map((e) => e.id);
        // ★ ระยะ 3 (open-items #43): BBL_V2 fixture ยังมี style="color:#ffd180" ค้างที่ vcell (debt เดิม —
        //   ห้ามแก้ fixture ด้วยมือ ดู test/fixtures/README.md) ⇒ heal รอบนี้ migrate สีไปด้วยนอกเหนือจากกระจก
        //   ที่ตั้งใจทดสอบ — เทียบกับ bbl ที่แทนแท็กเปิดของช่องสรุปเป็นค่าที่ถูกต้องแล้ว (derive สด ไม่ hardcode)
        const tagBbl = DVcell.summaryOpenTag(bbl);
        const pBbl = DVcell.summaryPlan(expandReport(bbl));
        const bblColorFixed = tagBbl && pBbl ? bbl.slice(0, tagBbl.at) + pBbl.wantOpen + bbl.slice(tagBbl.at + tagBbl.len) : bbl;
        ok(!errsAfter.includes('E30') && !errsAfter.includes('E31') && after === bblColorFixed, 'M7: หลังซ่อม E30/E31 เงียบ + ไฟล์กลับเท่า fixture เดิมทุก byte ยกเว้นสีช่องสรุปที่ migrate ไปด้วย (debt เดิมของ fixture)', errsAfter.join(','));
        // ไฟล์ที่ไม่มีอะไรค้าง → ไม่นับ
        const logs2 = []; console.log = (...x) => logs2.push(x.join(' '));
        let h2; try { h2 = U.healDerived({ dir, only: new Set(), write: false, prose: false }); } finally { console.log = orig; }
        ok(h2.touched === 0, 'M7: รันซ้ำบนไฟล์ที่ซ่อมแล้ว → touched 0 (converged)', JSON.stringify(h2));
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }

    // M8 — pxOf: v2 = values.px (เจ้าของ) แม้กระจก stock-meta.price ค้าง · v1 = stock-meta.price
    {
      const src = FX.AAPL_V2();
      const staleSm = src.replace(/("price":)([0-9.]+)/, '$1111.11');
      ok(staleSm !== src && RM.readStockMeta(staleSm).price === 111.11, '(ตั้งฉาก) stock-meta.price ค้าง 111.11');
      ok(U.pxOf(staleSm, RM.readStockMeta(staleSm)) === RM.readReportData(src).data.values.px, 'M8: pxOf v2 = values.px (ไม่ใช่กระจกที่ค้าง)');
      ok(U.pxOf(FX.AAPL(), RM.readStockMeta(FX.AAPL())) === RM.readStockMeta(FX.AAPL()).price, 'M8: pxOf v1 = stock-meta.price');
      // decide ที่ใช้ pxOf: กระจกค้าง 111.11 จะทำให้ราคาเดิม "ต่าง >25%" (suspect) ทั้งที่ values.px ขยับแค่ 1%
      const np = RM.readReportData(src).data.values.px * 1.01;
      ok(!U.decide({ oldPrice: U.pxOf(staleSm, RM.readStockMeta(staleSm)), newPrice: np, fv: U.fvOf(staleSm, RM.readStockMeta(staleSm)), currencyOk: true }).freeze
        && !!U.decide({ oldPrice: RM.readStockMeta(staleSm).price, newPrice: np, fv: U.fvOf(staleSm, RM.readStockMeta(staleSm)), currencyOk: true }).freeze,
        'M8: decide(oldPrice=pxOf) ไม่ freeze · (ตั้งฉาก) oldPrice=กระจกค้าง → freeze ผิด ๆ');
    }

    // ── N1 (ระยะ 2 ส่วน F · residual จาก re-review fix wave ส่วน D): กระจก stock-meta ของ healDerived
    //    **ห้ามทับ pe/dividendYield ที่ pass derived เพิ่งเขียน** — mutant ที่ทับเคยผ่าน update-prices-test ครบทุกเคส
    //    (ทางเดิน --heal-derived ไม่มีเทสไหนเดินจนถึงกระจกบนไฟล์จริง) · pin ด้วย 2 ชั้น:
    //    (ก) fixture สะอาด → heal ต้อง touched 0 + ไฟล์เท่าเดิมทุก byte (mutant: DDOG pe 75 → ~451 ⇒ touched 1)
    //    (ข) fixture ที่ค่าเสีย (SRE ตาม brief) → E41/W19 ยิง → heal --write → หายและ **คงหาย** (heal ซ้ำ touched 0)
    //        ค่าที่ได้คืนต้องเป็นฐานของการ์ด (pe 24.1) ไม่ใช่ราคา÷values.eps (SRE ไม่มี eps ⇒ mutant เขียน null)
    {
      const healOf = (dir) => { const o = console.log; console.log = () => {}; try { return U.healDerived({ dir, only: new Set(), write: true, prose: false }); } finally { console.log = o; } };
      const idsOf = (h, n) => { const r = CR.checkHtml(expandReport(h), n, { source: h }); return r.errors.map((e) => e.id).concat(r.warnings.map((w) => w.id)); };
      const savedN1 = process.env.STALE_TODAY;
      try {
        // (ก) ทุก fixture v2 "สะอาด" ฝั่ง pe/dividendYield (ไม่มีอะไรให้กระจกทับ) — แต่ทุกใบยังมี
        //     style="color:#…" ค้างที่ vcell (debt เดิมของ fixture ก่อน sweep #43 — ห้ามแก้ fixture ด้วยมือ
        //     ดู test/fixtures/README.md) ⇒ heal รอบแรก touched=1 (migrate สีช่องสรุปอย่างเดียว ไม่แตะ
        //     pe/dividendYield) แล้วรอบสองต้อง touched=0 จริง (converged — พิสูจน์ว่ากระจกไม่ทับ pass derived)
        for (const s of FX.SYMS) {
          process.env.STALE_TODAY = FX.TODAY_OF[s];
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'healv2-'));
          try {
            const src9 = FX[`${s}_V2`]();
            const smBefore = RM.readStockMeta(src9);
            fs.writeFileSync(path.join(dir, `${s}.html`), src9);
            const h = healOf(dir);
            const once = fs.readFileSync(path.join(dir, `${s}.html`), 'utf8');
            ok(h.touched === 1 && h.failed.length === 0 && once !== src9,
              `N1(ก) ${s}: heal รอบแรก migrate สีช่องสรุปเท่านั้น (debt เดิมของ fixture)`, JSON.stringify(h));
            const smAfter = RM.readStockMeta(once);
            ok(smAfter.pe === smBefore.pe && smAfter.dividendYield === smBefore.dividendYield,
              `N1(ก) ${s}: กระจกไม่ทับ pe/dividendYield ของ pass derived`, `${smBefore.pe}/${smBefore.dividendYield} → ${smAfter.pe}/${smAfter.dividendYield}`);
            const h2 = healOf(dir);
            ok(h2.touched === 0 && fs.readFileSync(path.join(dir, `${s}.html`), 'utf8') === once,
              `N1(ก) ${s}: heal รอบสอง = no-op จริง (converged หลัง migrate สี)`, JSON.stringify(h2));
          } finally { fs.rmSync(dir, { recursive: true, force: true }); }
        }
        // (ข) SRE: pe/dividendYield เสีย **ในย่านที่ตัวตรวจยอมตัดสิน** (ต่างเกิน tolerance แต่ยังไม่หลุดย่านฐานต่างกัน)
        process.env.STALE_TODAY = FX.TODAY_OF.SRE;
        const dir9 = fs.mkdtempSync(path.join(os.tmpdir(), 'healv2-sre-'));
        try {
          const src9 = FX.SRE_V2(), sm9 = RM.readStockMeta(src9);
          const broken = src9.replace(/("pe":)[0-9.]+/, '$120.5').replace(/("dividendYield":)[0-9.]+/, '$12.2');
          ok(broken !== src9 && RM.readStockMeta(broken).pe === 20.5, '(ตั้งฉาก M9ข) SRE stock-meta.pe/dividendYield เสีย');
          const pre = idsOf(broken, 'SRE.html');
          ok(pre.includes('E41') && pre.includes('W19'), 'N1(ข) SRE เสีย → E41 + W19 ยิง', pre.join(','));
          const fp9 = path.join(dir9, 'SRE.html');
          fs.writeFileSync(fp9, broken);
          const h1 = healOf(dir9), after = fs.readFileSync(fp9, 'utf8'), smA = RM.readStockMeta(after);
          const post = idsOf(after, 'SRE.html');
          ok(h1.touched === 1 && !post.includes('E41') && !post.includes('W19'), 'N1(ข) SRE: heal --write → E41/W19 หาย', `${JSON.stringify(h1)} ${post.join(',')}`);
          ok(smA.pe === sm9.pe && smA.dividendYield === sm9.dividendYield,
            `N1(ข) SRE: ค่าที่ heal คืนมา = ฐานของการ์ดเดิม (pe ${sm9.pe} · yield ${sm9.dividendYield}) ไม่ใช่ค่าที่ derive จาก values`, `${smA.pe} / ${smA.dividendYield}`);
          ok(RM.readReportData(after).data.values.eps == null,
            'N1(ข) SRE: values ไม่มี eps ⇒ กระจกที่เขียน pe จาก values จะได้ null — ตัวชี้ว่าเคสนี้ discriminate mutant ได้จริง');
          const h2 = healOf(dir9), post2 = idsOf(fs.readFileSync(fp9, 'utf8'), 'SRE.html');
          ok(h2.touched === 0 && !post2.includes('E41') && !post2.includes('W19'), 'N1(ข) SRE: heal ซ้ำ → touched 0 · E41/W19 ยัง**คง**หาย (converged)', `${JSON.stringify(h2)} ${post2.join(',')}`);
        } finally { fs.rmSync(dir9, { recursive: true, force: true }); }
      } finally { process.env.STALE_TODAY = savedN1; }
    }

    // ── N2 (ระยะ 2 ส่วน F · item 4): วงเล็บทวนวันที่ที่ parser อ่านไม่ออก → **note** แบบเดียวกับ v1
    //    เดิมทาง v2 เงียบสนิท: parenDateAfter คืน null ⇒ ไม่มี edit **และ** tripwire ก็ข้าม ⇒ วันเก่าค้างในวงเล็บถาวร
    //    (คลังวันนี้ 0 ใบ — ปิดช่องว่าง ไม่ใช่แก้บั๊กที่กำลังเกิด) · DPZ = ใบเดียวใน fixture ที่วงเล็บทวนเป็น literal
    {
      const savedN2 = process.env.STALE_TODAY;
      process.env.STALE_TODAY = FX.TODAY_OF.DPZ;
      try {
        const okSrc = FX.DPZ_V2();
        const badSrc = okSrc.replace('(11 ก.ย. 2569 ตลาดปิด)', '(11 กย. 2569 ตลาดปิด)');   // "กย." ไม่อยู่ในคลังชื่อเดือน
        // ตรวจบน **view ที่ render แล้ว** (ต้นฉบับ v2 มีแต่ token — findPriceDate อ่านวันที่ไม่ได้โดยโครงสร้าง)
        const headOf = (h) => RV.renderValues(h, RM.readReportData(h).data, RM.readStockMeta(h)).match(/<header[\s\S]*?<\/header>/i)[0];
        const parenOf = (h) => { const hd = headOf(h); return PD.parenDateAfter(hd, PD.findPriceDate(hd)); };
        ok(badSrc !== okSrc && !!parenOf(okSrc) && parenOf(badSrc) === null,
          '(ตั้งฉาก N2) "(11 กย. 2569 …)" → parenDateAfter อ่านไม่ออกจริง ขณะรูปเดิมอ่านออก');
        const dpN2 = { day: 12, monIdx: 8, yearCE: 2026 };
        const run = (h) => U.patchReport(h, { newPrice: Math.round(RM.readReportData(h).data.values.px * 1.02 * 100) / 100, dateParts: dpN2, chartData: null });
        const rOk = run(okSrc), rBad = run(badSrc);
        const NOTE = /วันที่ทวนในวงเล็บ \(v2\)/;
        ok(!rOk.notes.some((n) => NOTE.test(n)), 'N2: วงเล็บที่อ่านออก → ไม่มี note (เขียนวันใหม่ให้ตามปกติ)', rOk.notes.join(' | '));
        ok(rBad.notes.some((n) => NOTE.test(n)), 'N2: วงเล็บที่อ่านไม่ออก → มี note (ไม่ค้างเงียบ · cron พิมพ์ note ในบรรทัดสรุปของใบนั้น)', rBad.notes.join(' | '));
        ok(rBad.changed && U.gateAfterPatch(rBad.html, 'DPZ.html').ok,
          'N2: เป็น note ไม่ใช่ throw — ใบยัง patch/ผ่าน gate ได้ (เขียนวงเล็บไม่ได้ ≠ ทั้งใบใช้ไม่ได้)');
        ok(rBad.html.includes('(11 กย. 2569 ตลาดปิด)'), 'N2: ไม่เดา — วงเล็บที่อ่านไม่ออกถูกคงไว้ทุก byte');
      } finally { process.env.STALE_TODAY = savedN2; }
    }

    // ── N3 (final review ส่วน F · I1): **รอยต่อ cron ทาง v2 ครบสายในการรันเดียว** ──
    // ช่องว่างที่ปิด: เดิมไม่มีเทสไหนเดิน `patchReport` ทาง v2 บนใบที่ **footer ≥ PROSE_TOKEN_SINCE พร้อมกับราคาขยับ**
    //   ⇒ `proseTokensIfNew` เป็น no-op ในทุกเคสที่มีอยู่ (N2 ใช้ fixture footer 29 ส.ค. < SINCE · self-test เรียก healer ตรง ๆ ไม่มีราคาขยับ)
    //   ⇒ ถ้ามีคนสลับลำดับไปทำ prose **หลัง** `derivedPassV2` · เทียบกับค่า **ก่อน** patch · หรือลืม `pt.changes.concat(...)`
    //   เทสเดิมผ่านหมด (พิสูจน์แล้วด้วย mutant ทั้ง 5 ตัว — ดู task-18-report.md "Final review fix")
    // ลำดับที่ตรึง: เขียน values → proseTokensIfNew → derivedPassV2 (keep-map) → mirrorStockMeta
    // ★ ใช้ fixture 2 ใบคนละสกุล/คนละจุดแข็ง: BBL (THB · prose 6 จุด) · DDOG (USD · การ์ดเยอะ + ฐาน P/E ต่างจาก values.eps ชัด)
    {
      const { footerDate } = require('../tools/queue/footer-date.js');   // ตัวอ่านวันวิเคราะห์ตัวเดียวกับที่ E44/cron ใช้
      const savedN3 = process.env.STALE_TODAY;
      const dpN3 = { day: 12, monIdx: 8, yearCE: 2026 };
      const TH_MON_N3 = U.THAI_MONTHS;
      const setFooterN3 = (h, iso) => {
        const p = RV.parseIso(iso);
        return h.replace(/(ข้อมูล\s*ณ\s*)\d{1,2}\s*[ก-๙.]+\s*\d{4}/, (m, a) => `${a}${p.day} ${TH_MON_N3[p.monIdx]} ${p.yearCE}`);
      };
      const r1 = (v) => Math.round(v * 10) / 10;
      const r2 = (v) => Math.round(v * 100) / 100;
      try {
        for (const S of ['BBL', 'DDOG']) {
          process.env.STALE_TODAY = '2026-09-15';
          const src0 = FX[`${S}_V2`]();
          const rd0 = RM.readReportData(src0).data, sm0 = RM.readStockMeta(src0);
          const newPx = r2(rd0.values.px * 1.05);
          const rdN = JSON.parse(JSON.stringify(rd0)); rdN.values.px = newPx;
          const dPost = RV.derive(rdN, sm0), dPre = RV.derive(rd0, sm0);
          // prose ของ fixture เขียนเลขแบบปัดไว้ ("฿191" · "~2%") ⇒ healer แตะไม่ได้ตามกติกา byte-equality
          //   ⇒ ปรับให้เป็น "รูปที่ token จะ render **หลัง** patch" เพื่อให้เคสนี้ได้ทดสอบรอยต่อจริง ๆ
          //   (นี่คือสาระของลำดับที่ตรึง: ถ้าเทียบกับค่า **ก่อน** patch จุดพวกนี้จะไม่ถูกแทนเลย)
          let src = src0;
          for (const h of [...RV.proseBoundHits(src0, dPre)].reverse()) {
            let w; try { w = String(RV.TOKENS[h.token](dPost)); } catch { continue; }
            src = src.slice(0, h.at) + w + src.slice(h.at + h.len);
          }
          src = setFooterN3(src, RV.PROSE_TOKEN_SINCE);
          // ★ ยาม setup: `setFooterN3` เงียบได้ถ้ารูป footer ไม่ตรง (AAPL_V2 = ช่วงวัน "22–23 มิ.ย. 2026" ⇒ ไม่แมตช์
          //   แล้วทั้งเคสจะกลายเป็น no-op ที่ "ผ่าน" โดยไม่ได้ทดสอบอะไร) — ต้องยืนยันว่าเลื่อนวันได้จริงก่อนเสมอ
          const fN3 = footerDate(src);
          ok(!!fN3 && fN3.iso === RV.PROSE_TOKEN_SINCE, `(ตั้งฉาก N3 ${S}) footer = PROSE_TOKEN_SINCE จริง`, fN3 && fN3.iso);
          const nPre = RV.proseBoundHits(src, dPost).length;
          ok(nPre > 0, `(ตั้งฉาก N3 ${S}) มี prose ผูกราคา ${nPre} จุดให้ healer แทน (ไม่งั้นเคสนี้ว่างเปล่า)`);

          const r = U.patchReport(src, { newPrice: newPx, dateParts: dpN3, chartData: null });
          const rdA = RM.readReportData(r.html).data, smA = RM.readStockMeta(r.html);
          const dA = RV.derive(rdA, smA);
          const proseCh = r.derived.filter((c) => /^prose:/.test(c));
          const cardCh = r.derived.filter((c) => !/^prose:/.test(c));

          // (a) prose ที่เข้าเกณฑ์กลายเป็น token ครบ — และ **ข้อความที่คนอ่านเห็นไม่เปลี่ยน** (render-neutral)
          ok(proseCh.length === nPre && RV.proseBoundHits(r.html, dA).length === 0,
            `N3 ${S} (a) prose ผูกราคาถูกแทนด้วย token ครบ ${nPre} จุด · ไม่เหลือ literal`, `changes ${proseCh.length} · เหลือ ${RV.proseBoundHits(r.html, dA).length}`);
          ok(RV.renderValues(r.html, rdA, smA).includes(String(RV.TOKENS.px(dA))),
            `N3 ${S} (a') หน้าที่ render แล้วยังมีราคาใหม่ที่จุด prose (แทน token แล้วคนอ่านเห็นเลขเดิมของรอบนี้)`);

          // (b) pass derived เขียนการ์ดที่ผูกราคาครบ — วัดด้วย **convergence ของ pass เอง** (ไม่พึ่ง gate)
          ok(cardCh.length > 0, `N3 ${S} (b) มีการเขียนการ์ด/stock-meta ที่ผูกราคาอย่างน้อย 1 จุด`, cardCh.join(' | '));
          const again = U.derivedPassV2(r.html, newPx, {});
          ok(again.changes.length === 0 && again.html === r.html,
            `N3 ${S} (b) รัน derivedPassV2 ซ้ำที่ราคาเดิม → ไม่มีอะไรให้แก้อีก (pass เขียนครบในรอบเดียว)`, again.changes.join(' | '));

          // (c) กระจก stock-meta **ไม่ทับ** pe/dividendYield ที่ pass derived เพิ่งเขียน
          //     ตัวชี้ = ค่าที่ได้ต้อง **ต่างจาก** ค่าที่กระจกจะเขียนถ้ามันคำนวณจาก values (ฐานของการ์ด ≠ values.eps/dps)
          const mirrorPe = dA.pe == null ? null : r1(dA.pe);
          const mirrorYld = dA.yield == null ? null : r2(dA.yield);
          ok(smA.pe !== mirrorPe, `N3 ${S} (c) stock-meta.pe = ฐานการ์ด ${smA.pe} ≠ ค่าที่กระจกจาก values จะเขียน ${mirrorPe}`);
          ok(smA.dividendYield !== mirrorYld, `N3 ${S} (c) stock-meta.dividendYield = ฐานการ์ด ${smA.dividendYield} ≠ ค่าจาก values ${mirrorYld}`);
          ok(smA.price === newPx && smA.fairValue === rdA.fv && smA.mos === r1(dA.mos),
            `N3 ${S} (c) กระจกเขียน 4 คีย์ของตัวเองถูกต้อง (price/fairValue/mos)`, `${smA.price}/${smA.fairValue}/${smA.mos}`);

          // (d) ผลรวมทั้งหมดผ่าน gate จริง (ประตูเดียวกับที่ cron ใช้ตัดสิน patch-rejected)
          const gN3 = U.gateAfterPatch(r.html, `${S}.html`);
          ok(gN3.ok, `N3 ${S} (d) gateAfterPatch ผ่าน (E44 เงียบเพราะ prose เป็น token แล้ว)`, `${(gN3.codes || []).join(',')} ${(gN3.detail || '').slice(0, 160)}`);

          // (e) รันซ้ำที่ราคาเดิม = ไม่มีอะไรเปลี่ยน (ไม่มีการเขียนวนทุกวัน)
          const rAgain = U.patchReport(r.html, { newPrice: newPx, dateParts: dpN3, chartData: null });
          ok(rAgain.changed === false && rAgain.derived.length === 0,
            `N3 ${S} (e) patchReport ซ้ำที่ราคาเดิม → changed=false · 0 การเปลี่ยนแปลง (idempotent)`, `${rAgain.changed} · ${rAgain.derived.join(' | ')}`);
        }

        // N3(ข) — ฐานเปรียบเทียบของ healer ต้องเป็นค่า **หลัง** patch: literal ที่เท่ากับราคา **เก่า** ห้ามถูกแตะ
        //   (ถ้าเทียบกับค่าก่อน patch ระบบจะกลายเป็น "cron เขียนตัวเลขในย่อหน้า" ซึ่ง CLAUDE.md §9 ห้าม)
        //   ★ ผลพลอยได้ที่ตั้งใจเปิดเผย: จุดนั้นยังเป็น literal ⇒ **E44 ยังฟ้อง** ⇒ cron กัก `patch-rejected` รายไฟล์
        //   ตามที่ open-item #37 อธิบายไว้ (ใบแบบนี้เข้าถึง cron ไม่ได้อยู่แล้วเพราะ verify/pre-push บล็อกตั้งแต่ push)
        {
          process.env.STALE_TODAY = '2026-09-15';
          const src0 = FX.BBL_V2();
          const rd0 = RM.readReportData(src0).data, sm0 = RM.readStockMeta(src0);
          const newPx = r2(rd0.values.px * 1.05);
          const dPre = RV.derive(rd0, sm0);
          const oldTxt = String(RV.TOKENS.px(dPre));            // ราคา **ก่อน** patch ในรูปที่ token เคย render
          let src = setFooterN3(src0, RV.PROSE_TOKEN_SINCE)
            .replace('<div class="disc">', `<p>ราคาล่าสุด ${oldTxt} เมื่อวานนี้</p><div class="disc">`);
          ok(footerDate(src).iso === RV.PROSE_TOKEN_SINCE && src.includes(`ราคาล่าสุด ${oldTxt}`), '(ตั้งฉาก N3ข) แทรกประโยคที่ถือราคาเก่าได้');
          const r = U.patchReport(src, { newPrice: newPx, dateParts: dpN3, chartData: null });
          ok(r.html.includes(`ราคาล่าสุด ${oldTxt}`),
            `N3(ข) literal ที่เท่ากับราคาเก่า (${oldTxt}) ไม่ถูกแตะ — ฐานเทียบของ healer คือค่าหลัง patch ไม่ใช่ก่อน patch`);
          ok(!r.derived.some((c) => c.includes(`${oldTxt} → `)), 'N3(ข) ไม่มี prose change ของจุดนั้นใน changes');
          const gBad = U.gateAfterPatch(r.html, 'BBL.html');
          ok(!gBad.ok && (gBad.codes || []).includes('E44'),
            'N3(ข) จุดที่ยังเป็น literal ⇒ E44 ฟ้อง ⇒ cron กักเป็น patch-rejected (พฤติกรรมที่ประกาศไว้ ไม่ใช่การเขียนทับเงียบ ๆ)',
            `${(gBad.codes || []).join(',')}`);
        }
      } finally { process.env.STALE_TODAY = savedN3; }
    }
  } finally { process.env.STALE_TODAY = saved; }
}

// ---------- W1: patchDerived ไม่แตะ P/E "วัดได้" ของปีงบ + Market Cap ของ v2 ใช้ values.shares (GAP-013) ----------
{
  const DV = require('../tools/derived-values.js');
  const card = (k, v, d) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const wrap = (cards) => `<html><body>${cards}<script type="application/json" id="stock-meta">{"symbol":"T","currency":"USD","price":100,"pe":10}</script></body></html>`;
  const peOf = (h, label) => (h.match(new RegExp(`<div class="k">${label.replace(/[()+.]/g, '\\$&')}</div><div class="v">~?([0-9.]+)x`)) || [])[1];

  // (a) วัดได้/ปีงบ ไม่ถูกแตะ ที่หลายราคา · (b) เฉลี่ย เดิม · (c) Forward FY2026E + TTM ยังตามราคา
  for (const px of [50, 87.3, 100, 133.7, 250]) {
    const h = wrap(card('P/E FY2025 (วัดได้)', '~10.8x', 'EPS FY2025 $10.00') + card('P/E เฉลี่ย 5 ปี', '~15x', 'EPS $10.00')
      + card('Forward P/E (FY2026E)', '~9.0x', 'EPS FY2026E $11.10') + card('P/E (TTM)', '~10.0x', 'EPS TTM $10.00'));
    const r = DV.patchDerived(h, px);
    ok(peOf(r.html, 'P/E FY2025 (วัดได้)') === '10.8', `W1(a) P/E FY2025 (วัดได้) ไม่ถูกแตะที่ราคา ${px}`, peOf(r.html, 'P/E FY2025 (วัดได้)'));
    ok(peOf(r.html, 'P/E เฉลี่ย 5 ปี') === '15', `W1(b) P/E เฉลี่ย 5 ปี ไม่ถูกแตะที่ราคา ${px}`);
    ok(peOf(r.html, 'Forward P/E (FY2026E)') === (px / 11.10).toFixed(1), `W1(c) Forward P/E (FY2026E) ตามราคา ${px}`, peOf(r.html, 'Forward P/E (FY2026E)'));
    ok(peOf(r.html, 'P/E (TTM)') === (px / 10).toFixed(1), `W1(c) P/E (TTM) ตามราคา ${px}`, peOf(r.html, 'P/E (TTM)'));
    ok(DV.peCards(h).every((c) => !/วัดได้|เฉลี่ย/.test(c.label)), 'W1: peCards (ตัวตรวจ E41) ข้ามป้ายเดียวกับตัวซ่อม');
  }

  // (f) label matrix: true = ข้าม (ไม่ใช่ spot ÷ EPS) · false = ตามราคาต่อ
  const matrix = [
    ['P/E FY2025 (วัดได้)', true], ['P/E (วัดได้ FY25)', true], ['P/E measured FY2024', true], ['P/E ราคาเฉลี่ย ÷ EPS FY2025', true],
    // กำกวม = ไม่ข้าม (ตัวหลักของ ZM/WAT/MRK/WDC ยืนบนป้ายแบบนี้ · spot ÷ EPS ของปีนั้น)
    ['P/E GAAP (FY2026)', false], ['P/E (FY2025 organic)', false], ['P/E (EPS FY2025 ปีงบเต็ม)', false], ['P/E (Adj FY2026)', false], ['P/E FY25', false],
    // มีคำ forward ปนกับ วัดได้ = ซ่อมต่อ
    ['Forward P/E (วัดได้ vendor)', false],
    ['P/E เฉลี่ย 5 ปี', true], ['P/E Mid-Cycle', true],
    ['Forward P/E', false], ['P/E (Forward FY27e)', false], ['Forward P/E (FY2026E)', false], ['P/E ล่วงหน้า (FY2027F)', false],
    ['P/E (TTM)', false], ['P/E (Non-GAAP, fwd)', false], ['P/E NTM', false], ['P/E FY2026E', false], ['P/E FY26 (E)', false], ['P/E ล่วงหน้า FY2026', false], ['P/E', false],
  ];
  for (const [label, skip] of matrix) ok(DV.isPeSkipped(label) === skip, `W1(f) matrix "${label}" → ${skip ? 'ข้าม' : 'ซ่อมตามราคา'}`);

  // (d) v2: การ์ดพิมพ์หุ้นปัดเศษ (~14.5 พันล้าน) ≠ values.shares (14.81B) ⇒ Market Cap = ราคา × values.shares
  // (e) v1 (ไม่มี values) ⇒ ใช้เลขที่การ์ดพิมพ์เหมือนเดิม
  {
    const v2 = FX.AAPL_V2().replace('~14.81 พันล้านหุ้น', '~14.5 พันล้านหุ้น');
    const px = 300;
    const r2 = DV.patchDerived(v2, px);
    const mc = r2.changes.find((c) => c.startsWith('Market Cap'));
    ok(mc && /4\.44/.test(mc) && mc.includes('14,810,000,000'), 'W1(d) v2: Market Cap = 300 × values.shares (14.81B) = 4.44 ล้านล้าน', mc);
    // ผลซ่อมต้องไม่ทำให้ E43 ฟ้อง (ตัวตรวจอ่านเลขที่พิมพ์ ~14.5B · 4.44 vs 300×14.5=4.35 → ห่าง 2% ≤ 3%)
    const fixed2 = r2.html;
    ok(DV.mcapCards(fixed2, px).every((c) => DV.nearMcap(px * c.shares, c.shown, c.num, c.scale)), 'W1(d) v2: ผลซ่อมผ่านเกณฑ์ E43 (ตัวตรวจไม่ฟ้องผลของตัวซ่อม)');
    // การ์ดที่สดตาม ราคา × เลขที่พิมพ์ อยู่แล้ว ⇒ ไม่ churn ด้วยเศษปัดของ values.shares
    const freshCard = v2.replace('~$4.84 ล้านล้าน', '~$4.35 ล้านล้าน');
    ok(!DV.patchDerived(freshCard, px).changes.some((c) => c.startsWith('Market Cap')), 'W1(d) v2: การ์ดสดตามเลขที่พิมพ์แล้ว ⇒ ไม่แตะ');
    // values.shares ห่างจากเลขที่พิมพ์เกิน 2.5% (คนละฐาน) ⇒ ไม่เชื่อ ใช้เลขที่พิมพ์เหมือนเดิม
    const far = v2.replace('~14.5 พันล้านหุ้น', '~13 พันล้านหุ้น');
    const mf = DV.patchDerived(far, px).changes.find((c) => c.startsWith('Market Cap'));
    ok(mf && mf.includes('13,000,000,000'), 'W1(d) v2: values.shares ห่างเกิน band ⇒ ใช้เลขที่พิมพ์', mf);
    const v1 = FX.AAPL().replace('~14.81 พันล้านหุ้น', '~14.5 พันล้านหุ้น');
    ok(DV.v2Shares(v1) === null, 'W1(e) v1: v2Shares = null');
    const m1 = DV.patchDerived(v1, px).changes.find((c) => c.startsWith('Market Cap'));
    ok(m1 && /4\.35/.test(m1) && m1.includes('14,500,000,000'), 'W1(e) v1: Market Cap = 300 × 14.5B (เลขที่การ์ดพิมพ์) = 4.35 ล้านล้าน — เดิมทุก byte', m1);
    // ADR/อ่านหุ้นไม่ได้ ⇒ v2 ก็ยังเงียบ (values.shares ไม่ทำให้เดา)
    const adr = v2.replace('~14.5 พันล้านหุ้น', '~14.5 พันล้าน ADR');
    ok(!DV.patchDerived(adr, px).changes.some((c) => c.startsWith('Market Cap')), 'W1(d) v2: การ์ดอ่านหุ้นไม่ได้ (ADR) ⇒ ไม่แตะ แม้มี values.shares');
  }
}

Promise.resolve(pending).then(() => {
  console.log(nFail ? `\n✗ update-prices-test: ${nFail} failed / ${nOK} passed` : `\n✓ update-prices-test: ${nOK} passed`);
  process.exit(nFail ? 1 : 0);
});
