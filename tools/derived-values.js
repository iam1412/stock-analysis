#!/usr/bin/env node
'use strict';

/**
 * derived-values.js — ความรู้ก้อนเดียวเรื่อง "ค่าที่ derive จากราคา"
 *
 * ค่าพวกนี้ไม่ใช่ข้อเท็จจริงของบริษัท แต่เป็น "ราคาปัจจุบัน ÷ / − ข้อเท็จจริงที่รายงานพิมพ์ไว้เอง"
 * ⇒ ทุกครั้งที่ราคาขยับ มันต้องขยับตาม ไม่งั้นหน้าเว็บโชว์ตัวเลขที่ขัดกันเอง:
 *
 *   1) P/E ที่โชว์        = ราคา ÷ EPS ที่การ์ดนั้นพิมพ์ไว้ (+ `stock-meta.pe` ที่เป็นกระจกของมัน)
 *   2) % ของราคาเป้า      = (เป้า − ราคา) / ราคา
 *   3) Market Cap        = ราคา × จำนวนหุ้นที่การ์ดนั้นพิมพ์ไว้ (บรรทัด .d)
 *   4) P/S ที่โชว์        = Market Cap ÷ รายได้ที่การ์ดนั้นพิมพ์ไว้
 *   5) ปันผล %           = DPS ที่การ์ดนั้นพิมพ์ไว้ ÷ ราคา (+ `stock-meta.dividendYield` ที่เป็นกระจกของมัน)
 *   6) P/BV ที่โชว์       = ราคา ÷ BVPS ที่การ์ดนั้นพิมพ์ไว้
 *   (+ ผลตอบแทนฉาก 3 ปีในหมวด 6 — `scenarioPlan`)
 *
 * แผนที่พาส 1–10 ของ `patchDerived()` ↔ `healer:'patchDerived#N'` ใน test/check-reports.js (คนละเลขกับลิสต์ข้างบน):
 *   1 การ์ด P/E · 2 stock-meta.pe · 3 % ราคาเป้า · 4 prose (opt-in `{prose:true}` — cron ไม่รัน) ·
 *   5 Market Cap · 6 P/S · 7 หมวด 6 · 8 ปันผล % · 9 stock-meta.dividendYield · 10 P/BV
 *
 * ใช้ร่วมกัน 2 ฝั่ง — ห้ามทำสำเนาความรู้ (บทเรียนเดียวกับ `price-date.js`):
 *   • ตัวตรวจ  `test/check-reports.js` → E41 (P/E) · E42 (% ในการ์ด) · E43 (Market Cap) · W15 (% ในเนื้อความ) · W16 (P/S)
 *              · W17 (หมวด 6) · W19 (ปันผล % + stock-meta.dividendYield) · W20 (P/BV)
 *   • ตัวเขียน `tools/update-prices.js` → `patchDerived()` ทั้งใน cron รายวันและโหมด `--heal-derived`
 *
 * ★ หลักที่ห้ามหลุด: **เงียบเมื่ออ่านฐานไม่ได้** — การ์ดที่ไม่ประกาศ EPS ของตัวเอง หรือช่องค่าที่ไม่ใช่
 *   ตัวคูณ (N/A, "ขาดทุน") ต้องถูกข้าม ทั้งตอนตรวจและตอนเขียน เพราะรายงานหนึ่งใบมี EPS ได้หลายฐาน
 *   โดยตั้งใจ (PWR: GAAP $8.74 → 80x คู่กับ Adj. $13.1 → 53x) — เดาฐานผิด = เขียนเลขผิดทั้งใบ
 */

const RM = require('./report-meta.js');   // เจ้าของเดียวของ regex stock-meta/report-data/.px

// ── เกณฑ์ความคลาด (ตัวตรวจใช้) ──
const TOL_PE_REL = 0.02;   // P/E: ต่างได้ ≤2%
const TOL_PE_ABS = 1.5;    //      หรือ ≤1.5 เท่า แล้วแต่ค่าไหนมากกว่า (การ์ดปัดเป็นจำนวนเต็มบ่อย — "~80x")
const TOL_TGT_PP = 2;      // % ของราคาเป้า: ต่างได้ ≤2 จุด %
const TOL_MCAP_REL = 0.03; // Market Cap / P/S: ต่างได้ ≤3% (จำนวนหุ้น/รายได้ที่พิมพ์ถูกปัดมาแล้ว + basic vs diluted)
// ★ บวก "ครึ่งหลักสุดท้ายของหน่วยที่เขียน" เสมอ — ค่าที่เขียนหยาบ ๆ ในหน่วยใหญ่ปัดทิ้งได้เยอะกว่า 3%
//   ("$2T" ครึ่ง ulp = 0.5e12 = 25% ของตัวมันเอง) ⇒ ถ้าไม่บวก ตัวซ่อมจะเขียนเลขเดิมกลับ (ไม่มีอะไรให้เปลี่ยน)
//   แต่ตัวตรวจยังฟ้องอยู่ = error ที่ heal ไม่มีวันเคลียร์ได้ → cron ตาย ต้องใช้สูตรเดียวกันทั้งสองฝั่ง
const MCAP_ULP = 0.55;
// ราคาที่ implied จากการ์ด (Market Cap ÷ หุ้น) ต้องอยู่ในย่านเดียวกับราคาปัจจุบัน — หลุดย่าน = คนละฐาน
// (ADR/ADS · หุ้นบางคลาส · cap ของทั้งกลุ่มแต่หุ้นเฉพาะคลาส) ⇒ **ไม่ตรวจ ไม่เขียน** อย่าเดา
const MCAP_BAND = [0.4, 2.5];

// ป้ายการ์ด P/E ที่ **ไม่ใช่** ราคา÷EPS ปัจจุบัน — ตัวคูณอ้างอิงเชิงประวัติ/เพื่อน/วัฏจักร
// (สำรวจ 908 ใบ 19 ส.ค. 69: "P/E เฉลี่ย ~5 ปี" 475 การ์ด · "P/E มัธยฐาน 5 ปีงบ" · "P/E Mid-Cycle (norm.)")
const PE_LABEL_SKIP = /เฉลี่ย|มัธยฐาน|median|average|\bavg\b|peer|mid-?cycle|ย้อนหลัง|historic|ประวัติ|เป้า|target|กรอบ|ช่วง/i;
// ป้ายการ์ด (E42) / บริบทนำหน้าในเนื้อความ (W15) ที่บอกว่าเลขก้อนนี้คือ "ราคาเป้า"
const TGT_LABEL_STRICT = /เป้า(?:ราคา|เฉลี่ย|นักวิเคราะห์)?|analyst|consensus|price\s*target/i;
// "$<เป้า> (+X%)" — เลขเงิน + วงเล็บที่ขึ้นต้นด้วย % ที่มีเครื่องหมาย
// (สร้าง RegExp ใหม่ทุกครั้งจาก source: flag g มี lastIndex ค้างข้ามการเรียก)
const MONEY_PCT_SRC = '((?:[฿$]|C\\$)\\s*)([0-9,]+(?:\\.[0-9]+)?)(\\s*\\(\\s*)([+\\-−])([0-9.]+)(\\s*%)';
// วงเล็บที่ % ไม่ได้วัดจาก "ราคาปัจจุบัน" — ผลตอบแทนตามช่วงเวลา/ฉาก (W15 ต้องเงียบ)
const PCT_NOT_VS_PRICE = /รอบปี|ตั้งแต่ต้นปี|YTD|total\s*return|ผลตอบแทน|ในเดือน|ในเวลา|ต่อปี|CAGR|จากจุด|จาก\s*ATH/i;
// บล็อกอ้างแหล่ง: ตัวเลขถูกยกมาพร้อม "ราคาของแหล่งเอง" ⇒ % ของมันวัดจากราคานั้น ไม่ใช่ราคาในรายงาน
// (เคส LII: "StockAnalysis.com — ราคา $418.10, EPS TTM $22.51, … เป้าเฉลี่ย $553.00 (+32.27%, Buy)")
const QUOTE_CONTEXT = /\.com|StockAnalysis|TradingView|Yahoo|Finviz|Zacks|MarketBeat|Simply\s*Wall/i;

// ป้ายการ์ด Market Cap / P/S (E43/W16) — ป้ายเชิงประวัติใช้ PE_LABEL_SKIP ชุดเดียวกัน ("P/S มัธยฐานของตัวเอง")
const MCAP_LABEL = /market\s*cap|มูลค่าตลาด|มาร์เก็ตแคป/i;
const PS_LABEL = /\bP\s*\/\s*S(?:ales)?\b/i;
// หน่วยตัวเลขใหญ่ที่คลังใช้จริง (สำรวจ 908 ใบ 19 ส.ค. 69) — เรียงยาว→สั้น เพราะ "แสนล้าน" มีคำว่า "ล้าน" อยู่ข้างใน
// ไทยเขียนได้ทั้ง "แสนล้าน" และ "แสนลบ." (= แสนล้านบาท) · "พัน ล." = พันล้าน · US ใช้ T/B/M
const SCALES = [
  [/ล้านล้าน|\btrillion\b|(?<![A-Za-z])T(?![A-Za-z])/i, 1e12],
  [/แสนล้าน|แสนลบ\./, 1e11],
  [/หมื่นล้าน|หมื่นลบ\./, 1e10],
  [/พันล้าน|พันลบ\.|พัน\s*ลบ\.|พัน\s*ล\.|\bbillion\b|(?<![A-Za-z])B(?![A-Za-z])|\bbn\b/i, 1e9],
  [/ล้าน|ลบ\.|\bmillion\b|(?<![A-Za-z])M(?![A-Za-z])|\bmn\b/i, 1e6],
];
const scaleOf = (s) => { for (const [re, v] of SCALES) if (re.test(String(s))) return v; return null; };

/** "~$41.1B" · "฿3.69 แสนล้าน" → { value, num:"41.1", scale:1e9 } — หน่วยต้องตามหลังตัวเลข (หรือมีในสตริง) */
function parseAmount(text) {
  const t = clean(text);
  const m = t.match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!m) return null;
  const after = t.slice(m.index + m[1].length, m.index + m[1].length + 16);
  const scale = scaleOf(after) || scaleOf(t);
  if (!scale) return null;
  const value = parseFloat(m[1].replace(/,/g, '')) * scale;
  return value > 0 ? { value, num: m[1], scale } : null;
}

/**
 * จำนวนหุ้นที่การ์ดพิมพ์ไว้ในบรรทัด .d → ตัวคูณของ Market Cap
 * ★ ADR/ADS = เงียบเสมอ — อัตราส่วน ADR:หุ้นสามัญ ทำให้ "จำนวนหน่วย" กับ "หุ้นที่คิด cap" คนละตัว
 *   (BABA "ADR ≈ 8 หุ้นสามัญ" · ASML "~385 ล้าน ADR" · BIDU "ADR ~340 ล้านหน่วย") เดา = เขียน cap ผิดหลักเลข
 * รับทั้ง "~304M shares" · "~150.3 ล้านหุ้น" · "หุ้น ~14.29 พันล้าน" (คำนำหน้าตัวเลข)
 */
function parseShares(text) {
  const t = clean(text);
  if (!t || /ADR|ADS/i.test(t)) return null;
  const num = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
  const unit = '(ล้านล้าน|แสนล้าน|หมื่นล้าน|พันล้าน|ล้าน|[MB])';
  const m = t.match(new RegExp(`${num}\\s*${unit}?\\s*(?:shares?|หุ้น)`, 'i'))          // 304M shares · 150.3 ล้านหุ้น
    || t.match(new RegExp(`(?:shares?|หุ้น)[^0-9]{0,14}${num}\\s*${unit}?`, 'i'));        // หุ้น ~14.29 พันล้าน
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const sc = m[2] ? scaleOf(m[2]) : null;
  const v = sc ? n * sc : n;
  return v >= 1e5 ? v : null;   // ต่ำกว่านี้ = ไม่ใช่จำนวนหุ้นทั้งบริษัท (เลขปนจากคำอธิบาย)
}

/** เกณฑ์ผ่านของ Market Cap/P/S: 3% หรือ "ครึ่งหลักสุดท้ายของหน่วยที่เขียน" แล้วแต่ค่าไหนมากกว่า */
const nearMcap = (calc, shown, numStr, scale) =>
  Math.abs(calc - shown) <= Math.max(TOL_MCAP_REL * Math.abs(shown), MCAP_ULP * Math.pow(10, -decOf(numStr)) * (scale || 1));

/** การ์ด Market Cap ที่ "ตรวจได้" → { label, shown, num, scale, shares } (ข้ามเมื่ออ่านไม่ได้ / คนละฐาน) */
function mcapCards(html, price) {
  const out = [];
  const re = cardRe();
  let m;
  while ((m = re.exec(html))) {
    const label = clean(m[1]);
    if (!MCAP_LABEL.test(label) || PE_LABEL_SKIP.test(label)) continue;
    const a = parseAmount(m[3]);
    const shares = parseShares(m[5]);
    if (!a || !shares) continue;
    const ratio = a.value / shares / price;
    if (!(price > 0) || ratio < MCAP_BAND[0] || ratio > MCAP_BAND[1]) continue;   // คนละฐาน → เงียบ
    out.push({ label, shown: a.value, num: a.num, scale: a.scale, shares });
  }
  return out;
}

/** การ์ด P/S ที่ "ตรวจได้" → { label, shown, revenue } — ต้องประกาศ "รายได้/revenue/sales" พร้อมจำนวนเงินในบรรทัด .d */
function psCards(html) {
  const out = [];
  const re = cardRe();
  let m;
  while ((m = re.exec(html))) {
    const label = clean(m[1]);
    if (!PS_LABEL.test(label) || PE_LABEL_SKIP.test(label) || /EV/i.test(label)) continue;   // EV/Sales ต้องใช้หนี้สุทธิ — ไม่มีฐานให้อ่าน
    const vm = clean(m[3]).match(/([0-9]+(?:\.[0-9]+)?)\s*x/i);
    const d = clean(m[5]);
    if (!vm || !/รายได้|revenue|sales/i.test(d)) continue;
    const a = parseAmount(d.replace(/^[\s\S]*?(?:รายได้|revenue|sales)/i, ''));
    if (!a) continue;
    out.push({ label, shown: parseFloat(vm[1]), revenue: a.value });
  }
  return out;
}

// การ์ด k/v(/d) หนึ่งใบ (.metric ในตาราง key metric และ .vcell ในกล่องสรุป)
// group: 1=k · 2=แท็กเปิด .v · 3=เนื้อ .v · 4=แท็กปิด + บล็อก .d ทั้งก้อน (อาจไม่มี) · 5=เนื้อ .d
const CARD_SRC = '<div class="k">([\\s\\S]*?)<\\/div>(\\s*<div class="v(?:[^"]*)"[^>]*>)([\\s\\S]*?)(<\\/div>(?:\\s*<div class="d(?:[^"]*)"[^>]*>([\\s\\S]*?)<\\/div>)?)';
const cardRe = () => new RegExp(CARD_SRC, 'g');

const stripTags = (s) => String(s == null ? '' : s).replace(/<[^>]+>/g, ' ');
const norm = (s) => String(s == null ? '' : s).replace(/−/g, '-');
const clean = (s) => norm(stripTags(s)).replace(/\s+/g, ' ').trim();
const nearPE = (a, b) => Math.abs(a - b) <= Math.max(TOL_PE_REL * Math.abs(b), TOL_PE_ABS);
// จำนวนทศนิยมของ "ตัวเลขที่เขียนไว้เดิม" — เขียนกลับด้วยความละเอียดเท่าเดิมเสมอ ("~80x" ต้องไม่กลายเป็น "~79.65x")
const decOf = (s) => { const m = String(s).match(/\.(\d+)/); return m ? m[1].length : 0; };
const fixed = (v, d) => v.toFixed(d);
// เขียนตัวเลขกลับ "หน้าตาเดิม" — ทศนิยมเท่าเดิม + คงคอมมาคั่นหลักถ้าของเดิมมี ("฿8,288 ล้าน" → "฿8,761 ล้าน")
function fmtLikeNum(v, orig) {
  const d = decOf(orig);
  return /,/.test(String(orig))
    ? Number(v.toFixed(d)).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    : v.toFixed(d);
}

/**
 * เลข EPS ที่ "การ์ดนั้นพิมพ์ไว้เอง" (บรรทัด .d) → ฐานที่ใช้คิด P/E ของการ์ดนั้น
 * ★ ต้องมีคำว่า EPS ในบรรทัด ไม่งั้นเลขเงินอื่น (ปันผล/รายได้ต่อหุ้น/ราคาเป้า) จะถูกนับเป็น EPS
 *   รับหลายตัวได้ตั้งใจ — รายงานเขียนสองฐานในบรรทัดเดียวจริง ("EPS GAAP $8.73 • Adj. TTM ~$13.1")
 */
function epsBasesOf(text) {
  const t = clean(text);
  if (!/EPS/i.test(t)) return [];
  return [...t.matchAll(/(?:[฿$]|C\$)\s*([0-9]+(?:\.[0-9]+)?)/g)]
    .map((x) => parseFloat(x[1])).filter((v) => v > 0 && isFinite(v));
}

/** การ์ด P/E ที่ "ตรวจได้" → { label, shown, eps[] } (ข้ามป้ายเชิงประวัติ / ค่าที่ไม่ใช่ตัวคูณ / ไม่ประกาศ EPS) */
function peCards(html) {
  const out = [];
  const re = cardRe();
  let m;
  while ((m = re.exec(html))) {
    const label = clean(m[1]);
    if (!/P\/E/i.test(label) || PE_LABEL_SKIP.test(label)) continue;
    const vm = clean(m[3]).match(/(-?[0-9]+(?:\.[0-9]+)?)\s*x/i);
    if (!vm) continue;
    const shown = parseFloat(vm[1]);
    const eps = epsBasesOf(m[5]);
    if (!(shown > 0) || !eps.length) continue;
    out.push({ label, shown, eps });
  }
  return out;
}

/** ช่องค่าของการ์ดราคาเป้า → { label, target, shown } (เฉพาะที่เขียน "$เป้า (+X%)" ไว้จริง) */
function targetCells(html) {
  const out = [];
  const re = cardRe();
  let m;
  while ((m = re.exec(html))) {
    const label = clean(m[1]);
    if (!TGT_LABEL_STRICT.test(label)) continue;
    const inner = new RegExp(MONEY_PCT_SRC, 'g');
    const v = clean(m[3]);
    let t;
    while ((t = inner.exec(v))) {
      const target = parseFloat(t[2].replace(/,/g, ''));
      if (target > 0) out.push({ label, target, shown: parseFloat(norm(t[4]) + t[5]) });
    }
  }
  return out;
}

/** ฐาน EPS ที่ค่า `pe` ตัวนี้ "น่าจะ" ยืนอยู่ — เลือกฐานที่ห่างน้อยที่สุดเชิงอัตราส่วน (ความค้างของราคาสเกลทุกฐานเท่ากัน) */
function basisFor(pe, price, bases) {
  if (!(pe > 0) || !(price > 0) || !bases.length) return null;
  const implied = price / pe;
  let best = null, bestD = Infinity;
  for (const e of bases) {
    const d = Math.abs(Math.log(implied / e));
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * เขียนค่าที่ derive จากราคาให้ตรงกับ `price` ปัจจุบัน — pure function ใช้ได้ทั้ง cron และ heal
 * (cron เรียกหลัง patch ราคาแล้ว · heal เรียกด้วยราคาที่พิมพ์อยู่ในไฟล์)
 *
 * แตะเฉพาะ **ตัวเลขที่ derive ได้จากของที่พิมพ์อยู่แล้วในไฟล์** — ไม่แตะ EPS, ราคาเป้า, prose, คำบอกทิศ
 * (`opts.prose` = true → แตะ % ของราคาเป้าในเนื้อความด้วย: ใช้เฉพาะ heal ที่คนสั่งเอง ไม่ใช่ cron ตาม §9)
 *
 * @returns {{ html: string, changes: string[] }}
 */
// ── หมวด 6 "คาดการณ์ผลตอบแทน N ปี" — ผลตอบแทนฉาก Bear/Base/Bull ────────────────
//
// ราคาเป้า (EPS ปี 3 × P/E ออก) **ไม่ได้ derive จากราคา** — เป็นสมมติฐานที่นักวิเคราะห์ตั้งไว้
// ห้ามแตะ · ที่ derive จากราคาล้วน ๆ คือ "จุดเข้า" กับ % ที่วัดจากจุดเข้านั้น (SKILL.md STEP 4):
//     total%   = (เป้า − ราคา) / ราคา × 100
//     perYear% = ((เป้า / ราคา)^(1/N) − 1) × 100
// ปล่อยไว้ = ฉาก Bear โชว์ผลตอบแทนบวกทั้งที่ราคาขึ้นไปแล้ว (วัด 20 ส.ค. 69: RGLD Bear +8.7% ทั้งที่จริง −11.3%)
//
// ★ สามแกนที่ต้อง "รักษาของเดิม ไม่ใช่บังคับให้เป็นกฎ" — วัดจากคลัง 907 ใบ 20 ส.ค. 69:
//   1) ปันผล — บางใบรวมปันผลในผลตอบแทน บางใบไม่รวม **และคำว่า "รวมปันผล" ใน hint ตัดสินไม่ได้**
//      เพราะ skeleton พิมพ์คำนี้ติดมาตั้งแต่ต้น (`skeleton-{th,us}.html`) ⇒ RGLD มีทั้งคำนั้นและแถว
//      "ปันผลรวม 3 ปี ~$6.00" แต่ตัวเลขที่โชว์คิดแบบไม่รวมปันผล · ต่างกันมัธยฐาน 6.6 จุด % (p90 = 17.1)
//      ⇒ เดาผิด = เขียนเลขผิดทั้งใบ ต้องถอดจากตัวเลขที่โชว์อยู่แล้ว (ดู `scenarioPlan`)
//   2) %/ปี — 795 คอลัมน์ใช้ CAGR · 19 คอลัมน์ใช้ total/N (เฉลี่ยเลขคณิต) ⇒ ถอดจากคู่ (total, %/ปี)
//      ที่โชว์อยู่ ซึ่ง**ไม่ขึ้นกับราคา** จึงไม่วนกลับ · ไม่ "อัปเกรด" linear เป็น CAGR (นั่นคือแก้เนื้อหา ไม่ใช่ซ่อมค่าค้าง)
//   3) `class="ret pos|neg"` — **ไม่ตรวจ ไม่แตะ** · ไม่ใช่กระจกของเครื่องหมาย แต่เป็นสีประจำคอลัมน์:
//      skeleton ตั้ง `ret neg` ให้ช่อง Bear ไว้ล่วงหน้าตั้งแต่ยังไม่มีค่า ⇒ ค่าบวกในช่อง Bear 104 จาก 107 เคส
//      ที่ "เครื่องหมายไม่ตรงคลาส" ทั้งคลัง — บังคับให้ตรงเครื่องหมาย = สู้กับ template ตัวเอง
const TOL_RET_PP = 1.0;       // ผลตอบแทนรวม: ต่างได้ ≤1 จุด %
const TOL_RET_REL = 0.01;     //   หรือ ≤1% ของค่าที่โชว์ (ฉาก Bull เขียน "+228%" ปัดหยาบกว่าฉาก Bear)
const TOL_PY_PP = 0.6;        // %/ปี: เลขเล็กกว่า เกณฑ์จึงแคบกว่า
const SCN_TIGHT = 0.015;      // ราคาเข้าที่ถอดกลับจาก 3 คอลัมน์ต้องเกาะกลุ่มกัน ≤1.5% ถึงจะเชื่อว่า "ใบนี้สอดคล้องในตัวเอง"
const SCN_VOTE_RATIO = 3;     // เสียงจาก spread จะชี้ขาดได้ ต้องชนะขาด (ฝั่งแพ้กระจายกว่า ≥3 เท่า)
const CONV_PP = 1.2;          // เกณฑ์ "จำแนก" cagr/linear — หลวมกว่าเกณฑ์ค้าง เพราะ total ที่ปัดเป็นจำนวนเต็มทำ %/ปี เคลื่อนได้ ~1 จุด
const PY_VOTE_RATIO = 2;      // สูตร %/ปี ของทั้งใบ: ฝั่ง linear ต้องเด็ดขาดกว่าฝั่ง CAGR ≥2 เท่าถึงชนะ (ไม่งั้น = CAGR ตาม prior คลัง)

const SCN_ANCHOR = 'class="scn"';
const SCN_COL_RE = () => /<div class="col ([a-z]+)">([\s\S]*?)(?=<div class="col |$)/g;
const SCN_RET_RE = /(<div class="ret[^"]*">)([^<]*)(<\/div>)/;
const SCN_TGT_RE = /<div class="tgt">\s*(?:[฿$]|C\$)?\s*([\d.,]+)/;
// แถว "ปันผลรวม 3 ปี" ในคอลัมน์ — ค่าเงิน ไม่ใช่ %
const SCN_DPS_RE = /ปันผล[^<]*<\/span>\s*<span>\s*[~≈]?\s*(?:[฿$]|C\$)?\s*([\d.,]+)/;
const SCN_HINT_RE = /(จากจุดเข้า\s*(?:[฿$]|C\$)?\s*)([\d.,]+)/;
const SCN_YEARS_RE = /ผลตอบแทน\s*(\d+)\s*ปี/;
// โทเคน % ในช่อง ret
// ★ ช่องว่างต้องอยู่ "ระหว่างเครื่องหมายกับตัวเลข" ไม่ใช่หน้ากลุ่มเครื่องหมาย — ไม่งั้นค่าที่ไม่มีเครื่องหมาย
//   จะกินช่องว่างข้างหน้าเข้าไปในโทเคน แล้วตอนเขียนทับจะได้ "รวม ~−22%" (ช่องว่างหาย)
const SCN_PCT_RE = () => /([+\-−–]\s*)?([0-9]+(?:\.[0-9]+)?)\s*%/g;
// ตัวบอกว่า % ก้อนนี้คือ "ต่อปี" — ต้องตามหลัง % ทันที · "/ 3 ปี" (มีเลขคั่น) = ช่วงเวลา ไม่ใช่ต่อปี
const SCN_PERYEAR_AFTER = /^\s*(?:\/\s*(?:ปี|yr|year|y\b)|ต่อ\s*ปี|p\.?a\.?\b)/i;
// "…+ปันผล ~5%/ปี" = อัตราผลตอบแทนปันผล ไม่ใช่ CAGR ของฉาก (เคส ACN) — ข้ามเฉพาะตัวที่เป็น "ต่อปี" ด้วย
// (BF-B "…รวมปันผล ~+41%" ไม่มีตัวบอกต่อปี = ผลตอบแทนรวมจริง ห้ามข้าม)
const SCN_DIV_YIELD_BEFORE = /ปันผล\s*[~≈+]*\s*$/;

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const spreadOf = (a) => (Math.max(...a) - Math.min(...a)) / mean(a);
const signedOf = (t) => (/[\-−–]/.test(t.sign) ? -t.val : t.val);
/** ค่าที่โทเคนนั้นโชว์อยู่จริง (เครื่องหมายรวมแล้ว) — ตัวตรวจกับตัวเขียนต้องอ่านตรงกัน */
const retShown = (t) => signedOf(t);

/** แยกโทเคน % ในข้อความ ret พร้อมตำแหน่ง — ตัวเขียนใช้ตำแหน่งนี้แทนที่กลับแบบคงรูปแบบเดิม */
function retTokens(text) {
  const out = [];
  const re = SCN_PCT_RE();
  let m;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length);
    const perYear = SCN_PERYEAR_AFTER.test(after) || /CAGR\s*$/i.test(text.slice(0, m.index));
    if (perYear && SCN_DIV_YIELD_BEFORE.test(text.slice(0, m.index))) continue;  // yield ปันผล ไม่ใช่ผลตอบแทนฉาก
    out.push({ index: m.index, len: m[0].length, raw: m[0], sign: (m[1] || '').trim(), num: m[2], val: parseFloat(m[2]), perYear });
  }
  return out;
}

/** อ่านโครงหมวด 6 · คืน null เมื่อไม่มีหมวดนี้หรือรูปไม่ตรงคาด (เงียบทั้งตัวตรวจและตัวเขียน) */
function scenarioBlock(html) {
  const i = String(html).indexOf(SCN_ANCHOR);
  if (i < 0) return null;
  const a = html.lastIndexOf('<section', i), z = html.indexOf('</section>', i);
  if (a < 0 || z < 0) return null;
  const sec = html.slice(a, z);
  const ym = sec.match(SCN_YEARS_RE);
  const years = ym ? parseInt(ym[1], 10) : 3;
  if (!(years >= 1 && years <= 10)) return null;
  const hm = sec.match(SCN_HINT_RE);
  const hint = hm ? { at: a + hm.index + hm[1].length, num: hm[2], value: parseFloat(hm[2].replace(/,/g, '')) } : null;
  const cols = [];
  const re = SCN_COL_RE();
  let m;
  while ((m = re.exec(sec))) {
    const body = m[2];
    const tm = body.match(SCN_TGT_RE), rm = body.match(SCN_RET_RE);
    if (!tm || !rm) return null;
    const dm = body.match(SCN_DPS_RE);
    const dps = dm ? parseFloat(dm[1].replace(/,/g, '')) : null;
    cols.push({
      kind: m[1],
      tgt: parseFloat(tm[1].replace(/,/g, '')),
      dps: (dps != null && isFinite(dps)) ? dps : null,
      // ตำแหน่งสัมบูรณ์ของ "เนื้อข้อความ" ในช่อง ret (ไม่รวมแท็ก) — ret ทั้งคลังเป็นข้อความล้วน ไม่มีแท็กซ้อน
      // ★ m.index ชี้ที่ "<div class=\"col …\">" ไม่ใช่ที่เนื้อคอลัมน์ ⇒ ต้องบวกความยาวหัวแท็กด้วย
      //   (พลาดตรงนี้ = เขียนทับตัวแท็กเอง ไฟล์พัง แล้ว **ทุก check เงียบหมด** เพราะ parse ไม่ผ่านอีกต่อไป
      //    = "สะอาดปลอม" ที่อันตรายกว่าปล่อยค้างไว้ — เจอจริงตอนทำ 20 ส.ค. 69 จับได้ด้วยการอ่าน diff)
      at: a + m.index + (m[0].length - m[2].length) + rm.index + rm[1].length,
      text: rm[2],
      tokens: retTokens(rm[2]),
    });
  }
  if (cols.length !== 3 || !cols.every((c) => c.tgt > 0)) return null;
  // ★ ยามกันตำแหน่งเพี้ยน: ช่วงที่ถอดไว้ต้องเป็นข้อความเดียวกับที่อ่านมาจริง ๆ
  //   ตัวเขียนใช้ index เหล่านี้ตัดต่อสตริงตรง ๆ — ถ้าเลื่อนไปแม้แต่ตัวเดียวจะไปทับแท็ก ไฟล์พังเงียบ ๆ
  //   (เช็คนี้ราคาถูกและเป็นตัวเดียวที่ยืนยันว่า "ที่อ่าน" กับ "ที่จะเขียน" คือที่เดียวกัน)
  if (!cols.every((c) => html.slice(c.at, c.at + c.text.length) === c.text)) return null;
  if (hint && html.slice(hint.at, hint.at + hint.num.length) !== hint.num) return null;
  return { a, z, sec, years, hint, cols };
}

/** ผลตอบแทนรวมที่ "คอลัมน์นี้กำลังพูด" — คืน null ถ้าอ่านไม่ชัด (โทเคนเกิน/ขาด) */
function anchorOf(col, years) {
  const tot = col.tokens.filter((t) => !t.perYear), py = col.tokens.filter((t) => t.perYear);
  if (tot.length > 1 || py.length > 1) return null;                       // "…(capital) / … total" ฯลฯ = ไม่เดา
  if (tot.length === 1) return { total: signedOf(tot[0]), tot: tot[0], py: py[0] || null };
  if (py.length === 1) return { total: (Math.pow(1 + signedOf(py[0]) / 100, years) - 1) * 100, tot: null, py: py[0] };
  return null;
}

/**
 * วางแผนซ่อมหมวด 6 จาก "ราคาปัจจุบัน" — ใช้ร่วมกันทั้งตัวตรวจ (W17) และตัวเขียน (`patchDerived`)
 * คืน null เมื่อ **ตัดสินไม่ได้** — ตัวตรวจต้องเงียบตรงไหน ตัวเขียนต้องไม่แตะตรงนั้นเป๊ะ ๆ
 * (บทเรียนเดียวกับ MCAP_ULP: ตัวตรวจฟ้องในที่ที่ตัวซ่อมเอื้อมไม่ถึง = error ที่เคลียร์ไม่ได้ → cron ตาย)
 */
function scenarioPlan(html, price, why) {
  const no = (r) => { if (why) why.push(r); return null; };
  if (!(price > 0)) return no('ไม่มีราคา');
  const b = scenarioBlock(html);
  if (!b) return no('อ่านโครงหมวด 6 ไม่ได้');
  const anchors = b.cols.map((c) => anchorOf(c, b.years));
  if (anchors.some((x) => !x)) return no('รูป % ในช่อง ret ไม่ชัด');

  // ── ถอด "ราคาเข้า" กลับจากตัวเลขที่โชว์ ภายใต้ 2 สมมติฐานปันผล ──
  // ทั้งสามคอลัมน์ใช้จุดเข้าเดียวกัน ⇒ สมมติฐานที่ถูกต้องจะให้ราคาเข้าที่เกาะกลุ่มกัน อีกอันจะกระจาย
  const impOf = (withDps) => b.cols.map((c, i) => (c.tgt + (withDps ? c.dps : 0)) / (1 + anchors[i].total / 100));
  const hasD = b.cols.every((c) => c.dps != null && c.dps > 0);
  const impP = impOf(false), impD = hasD ? impOf(true) : null;
  if (!impP.every((x) => x > 0)) return no('ถอดราคาเข้าไม่ได้');
  const spP = spreadOf(impP);
  const spD = (impD && impD.every((x) => x > 0)) ? spreadOf(impD) : Infinity;

  let conv = null;
  const gapPP = hasD ? mean(b.cols.map((c) => c.dps)) / price * 100 : 0;
  if (!hasD || gapPP <= TOL_RET_PP) {
    // ไม่มีแถวปันผล หรือปันผลเล็กจนสองสมมติฐานให้ผลเท่ากันในเกณฑ์ ⇒ ไม่มีอะไรต้องตัดสิน
    conv = spP <= SCN_TIGHT ? 'plain' : null;
  } else {
    // เสียงที่ 1: ฝั่งไหนเกาะกลุ่มกว่า — ต้องชนะขาด ไม่ใช่ชนะเฉียด (KO: spP 0.0081 vs spD 0.0079 = เหรียญ ผลต่าง 6.8 จุด)
    const tight = Math.min(spP, spD), loose = Math.max(spP, spD);
    const vSpread = (tight <= SCN_TIGHT && loose >= tight * SCN_VOTE_RATIO) ? (spP < spD ? 'plain' : 'div') : null;
    // เสียงที่ 2: ราคาเข้าที่ถอดได้ ตรงกับ "จากจุดเข้า" ที่ประกาศไว้ไหม
    // ★ ไม่ต้องกันเคส "hint ถูกอัปเดตแล้วแต่ % ยังค้าง" (COHU) เป็นพิเศษ — เงื่อนไข near/far กันเองอยู่แล้ว:
    //   % ค้าง ⇒ ราคาที่ถอดได้ทั้งสองฝั่งห่างจาก hint ทั้งคู่ ⇒ near > 1% ⇒ ไม่ออกเสียง
    //   ★★ เคยกันด้วย `|hint − ราคา| ≥ 2%` แล้วพบว่าผิด: พอซ่อมเสร็จ hint จะเท่ากับราคาพอดี เสียงนี้เลยถูกปิดถาวร
    //      ⇒ ใบที่ spread แยกไม่ขาด (ปันผลโตตามราคาเป้า ⇒ กระจายพอกันทั้งสองฝั่ง) หลุดออกจากขอบเขตทันทีหลังซ่อม
    //      = ซ่อมแล้วเลิกตรวจ 23 ใบ (วัด 20 ส.ค. 69) — ตรงข้ามกับที่ต้องการ
    let vHint = null;
    if (b.hint && b.hint.value > 0) {
      const dP = Math.abs(mean(impP) - b.hint.value) / b.hint.value;
      const dD = impD ? Math.abs(mean(impD) - b.hint.value) / b.hint.value : Infinity;
      const near = Math.min(dP, dD), far = Math.max(dP, dD);
      // ฝั่งที่แพ้ต้องห่างชัด — เทียบเป็นสัดส่วนกับฝั่งที่ชนะ ไม่ใช่เส้นตายค่าเดียว
      // (เส้นตาย 2% ตัดเคสปันผลน้อย ๆ ทิ้งทั้งที่แยกได้ชัด: TPL near=0.06% far=1.88% = ห่างกัน 31 เท่า)
      if (near <= 0.01 && far >= Math.max(0.015, near * 3)) vHint = dP < dD ? 'plain' : 'div';
    }
    // ★ เสียง hint มาก่อนเสมอ — "จากจุดเข้า" เป็นราคาที่ใบนั้นประกาศไว้เอง จึงเป็นหลักฐานตรง
    //   ส่วนเสียง spread เป็นการอนุมานที่ **ถูกการปัดเศษหลอกได้**: ใบที่เขียน % เป็นจำนวนเต็ม
    //   ("−11% / +3% / +13%") ราคาที่ถอดกลับคลาดได้ถึง ~0.7% ⇒ ฝั่งที่ผิดอาจบังเอิญเกาะกลุ่มแน่นกว่า
    //   (เคส KO 20 ส.ค. 69: spread ชี้ "รวมปันผล" ได้จุดเข้า $96.2 ทั้งที่ความจริงคือ $90.35 ตามที่ hint บอก)
    //   เงื่อนไข near/far ของเสียง hint คุมตัวเองอยู่แล้ว (ต้องมีฝั่งเดียวที่ใกล้ ≤1% และอีกฝั่งห่าง ≥2%)
    conv = vHint || vSpread;
    if (conv && (conv === 'plain' ? spP : spD) > SCN_TIGHT) conv = null;
  }
  if (!conv) {
    // แยกให้ตรงความจริง: "ไม่มีสมมติฐานไหนเข้าเลย" (ใบเพี้ยนในตัวเอง — ต้องให้คนดู) ≠ "เข้าทั้งคู่ ตัดสินไม่ขาด"
    const best = Math.min(spP, spD);
    return no(best > SCN_TIGHT
      ? `สามคอลัมน์ไม่สอดคล้องกันเอง (spP=${spP.toFixed(4)} spD=${spD === Infinity ? '-' : spD.toFixed(4)})`
      : `ตัดสินสมมติฐานปันผลไม่ได้ (spP=${spP.toFixed(4)} spD=${spD === Infinity ? '-' : spD.toFixed(4)} gap=${gapPP.toFixed(1)}pp)`);
  }

  const entry = mean(conv === 'div' ? impD : impP);
  const cagr = (v) => (Math.pow(1 + v / 100, 1 / b.years) - 1) * 100;

  // ── สูตร %/ปี เป็นของ "ทั้งใบ" ไม่ใช่ของทีละคอลัมน์ ──
  // ผู้เขียนคนเดียวเขียนทั้งสามช่องด้วยสูตรเดียว ⇒ จำแนกทีละคอลัมน์แล้วให้ช่องที่ "แยกออก" โหวตเป็นสูตรของใบ
  // ★ เดิมเลือกทีละคอลัมน์แบบ "ใกล้ค่าที่โชว์กว่า" โดยอ้างว่าเสถียรเพราะพอเขียนแล้วระยะห่างเป็น 0
  //   — **ไม่จริงเมื่อ %/ปี พิมพ์เป็นจำนวนเต็ม**: ผลตอบแทนน้อยพอที่สองสูตรปัดแล้วได้เลขเดียวกัน
  //   ระยะห่างของทั้งคู่ไม่เป็น 0 และ linear มักชนะเฉียด ⇒ ใบ CAGR พลิกเป็น linear เงียบ ๆ ตามราคาวันนั้น
  //   (เจอจริง 2 ก.ย. 69 ตอน cron ล้ม: AAPL @325.13 → Bull total +28% · CAGR 8.58 กับ linear 9.33
  //    ปัดได้ "9%" เท่ากันทั้งคู่ ⇒ รอบถัดไปอ่าน (28, 9) แล้วเลือก linear · 38% ของช่วงราคาพลิกแบบนี้)
  //   ⇒ ช่องที่สองสูตรปัดแล้วได้เลขเดียวกัน = **แยกไม่ออก ไม่มีสิทธิ์โหวต** ให้เดินตามสูตรของใบแทน
  // ★★ นับเสียงข้างมากไม่พอ — ต้องชั่งด้วย "ความเด็ดขาด" (|dC − dL|) แล้วให้ฝั่งที่ชนะขาดเป็นผู้ตัดสิน:
  //   ช่องที่ |ผลตอบแทน| น้อยคือช่องที่ถูกปัดจนหลอกได้ (และเป็นช่องที่ heuristic เดิมพลิกไปแล้ว)
  //   ส่วนช่อง Bull/Bear ที่ตัวเลขใหญ่ สองสูตรห่างกันหลายจุด ⇒ เป็นพยานที่การปัดทำอะไรไม่ได้
  //   วัดจริง 2 ก.ย. 69: WHAUP (−6.3 / +2.9 / +15.6 กับ total −18.9 / +9.1 / +46.7) เป็น linear แท้
  //   ทุกทศนิยม แต่ช่อง Base เกือบเสมอ ⇒ กติกา "ต้องเป็น linear ทุกช่องถึงนับ" จะแปลงใบนี้เป็น CAGR ผิด ๆ
  //   ขณะที่ LYB (เสียง 2L/1C) ช่อง Bull ชี้ CAGR ด้วยระยะห่าง 3.6 จุด = ชนะสองช่องเล็กที่ 1.0/0.4
  //   ชนะไม่ขาด (< PY_VOTE_RATIO เท่า) → CAGR ตาม prior ของคลัง (795 จาก 814 คอลัมน์) — เคส ANET
  const cls = b.cols.map((c, i) => {
    const a = anchors[i];
    if (!a.py || !a.tot) return null;                                   // ไม่มีคู่ให้เทียบ = ไม่ออกเสียง
    const shownTotal = signedOf(a.tot), shownPy = signedOf(a.py);
    const dC = Math.abs(cagr(shownTotal) - shownPy), dL = Math.abs(shownTotal / b.years - shownPy);
    const lim = Math.max(CONV_PP, Math.abs(shownPy) * 0.05);
    if (dC > lim && dL > lim) return 'bad';                             // คู่ที่โชว์ไม่เข้าสูตรไหนเลย = อ่านผิดรูป (เคส AWC สลับที่)
    // ครึ่งช่วงการปัดของช่องนั้น — ทั้งสองสูตรตกในนี้ = ปัดแล้วพิมพ์ออกมาเป็นเลขเดียวกัน แยกไม่ได้
    const halfQ = 0.5 * Math.pow(10, -decOf(a.py.num)) + 1e-9;
    if (dC <= halfQ && dL <= halfQ) return null;
    return { conv: dC <= dL ? 'cagr' : 'linear', sep: Math.abs(dC - dL) };
  });
  if (cls.includes('bad')) return no('คู่ (total, %/ปี) ไม่เข้าสูตรไหนเลย');   // อ่านผิดรูป → ไม่แตะทั้งใบ
  const bestSep = (k) => Math.max(0, ...cls.filter((x) => x && x.conv === k).map((x) => x.sep));
  const pyConv = bestSep('linear') > bestSep('cagr') * PY_VOTE_RATIO ? 'linear' : 'cagr';

  const items = [];
  b.cols.forEach((c, i) => {
    const d = conv === 'div' ? c.dps : 0;
    const total = (c.tgt + d - price) / price * 100;
    const a = anchors[i];
    // %/ปี: รักษาสูตรของใบนั้น (CAGR หรือ total/N) — ถอดจากคู่ที่โชว์อยู่ ซึ่งไม่ขึ้นกับราคา
    let py = null;
    if (a.py) {
      // ★ ตัวตั้งของ %/ปี = ค่า total **ที่จะถูกเขียนลงไปจริง** (ปัดตามทศนิยมของช่องนั้นแล้ว) ไม่ใช่ค่าดิบ
      //   ไม่งั้นรอบนี้คิด %/ปี จากค่าดิบ (−13.54%) แต่รอบหน้าอ่านค่าที่เขียนไป (−14%) ได้คนละคำตอบ
      //   ⇒ ไฟล์ถูกเขียนซ้ำอีกหนึ่งรอบเสมอ (เจอจริง 20 ส.ค. 69: SNOW/CEG/KLAC/NOW/PANW)
      //   และการอิงค่าที่แสดงจริงยังทำให้ผู้อ่านกดเครื่องคิดเลขตามแล้วได้เลขเดียวกันด้วย
      const base3 = a.tot ? parseFloat(fixed(total, decOf(a.tot.num))) : total;
      py = { token: a.py, want: pyConv === 'linear' ? base3 / b.years : cagr(base3) };
    }
    items.push({ col: c, total: a.tot ? { token: a.tot, want: total } : null, py });
  });
  if (items.length !== 3) return no('คู่ (total, %/ปี) ไม่เข้าสูตรไหนเลย');   // อ่านผิดรูป → ไม่แตะทั้งใบ
  return { block: b, conv, entry, price, items, years: b.years };
}

/** ค่าที่โชว์ห่างจากค่าที่ควรเป็นเกินเกณฑ์ไหม (ตัวตรวจกับตัวเขียนต้องใช้เกณฑ์เดียวกัน) */
const retOff = (shown, want) => Math.abs(shown - want) > Math.max(TOL_RET_PP, Math.abs(shown) * TOL_RET_REL);
const pyOff = (shown, want) => Math.abs(shown - want) > Math.max(TOL_PY_PP, Math.abs(shown) * TOL_RET_REL);

/** เขียนโทเคน % กลับแบบคงรูปแบบเดิม (ทศนิยม · ชนิดขีดลบ · มี/ไม่มี +) — คืน null เมื่อไม่มีอะไรเปลี่ยน */
function retWrite(token, want, negChar) {
  const digits = fixed(Math.abs(want), decOf(token.num));
  // ค่าเดิมไม่มีเครื่องหมาย = บวกโดยปริยาย ⇒ ถ้ายังบวกอยู่ก็ไม่ต้องใส่ + ให้ใหม่
  const sign = want < 0 ? (token.sign === '-' ? '-' : negChar) : (token.sign ? '+' : '');
  if (norm(sign) + digits === norm(token.sign) + token.num) return null;
  return { text: sign + digits + '%', from: norm(token.sign) + token.num + '%', to: norm(sign) + digits + '%' };
}

// ── ปันผล % + P/BV — ตัวหารที่การ์ดพิมพ์เอง (W19/W20 · 11 ก.ย. 69) ─────────────────────
//
// ปันผล % = DPS ÷ ราคา · P/BV = ราคา ÷ BVPS — ตัวหารเป็นข้อเท็จจริงที่บรรทัด .d ของการ์ดพิมพ์เอง
// ⇒ หลักเดียวกับ P/E (E41): ราคาคือตัวที่เพิ่ง patch ส่วนตัวหารรายงานพิมพ์ไว้เอง ไม่มีอะไรให้ cron เดา
// (เจอ 11 ก.ย. 69 ตอนเคลียร์คิว FDS/KLAC/LRCX: cron ไม่มีโค้ดส่วนนี้เลย ⇒ ปันผลลอยตามราคาทั้งคลัง
//  FDS 1.86% จริง 1.76% · P/BV 4.40x จริง 4.63x — W10 เงียบเพราะการ์ดกับ stock-meta ค้างพร้อมกัน)
//
// ★ ต่างจาก EPS ตรงที่บรรทัด .d "พูดหลายอย่างในบรรทัดเดียว" จริง (สำรวจ 897 การ์ดปันผล · 693 การ์ด P/BV):
//   ปันผล: รายปี · รายไตรมาส ($0.50/ไตรมาส) · รายเดือน · ระหว่างกาล/พิเศษ · ผลบวกหลายงวด (฿0.34 + ฿0.69)
//          · ยอดรวมทั้งบริษัท ($358M/ปี) · สกุลอื่น (€2.50) · ตัวชี้อื่น (FCF/หุ้น ฿0.148)
//   P/BV : ส่วนทุนรวม (equity $4.19B) · TBVPS ในการ์ด P/BV ธรรมดา (MTB) · "ราคา $X ÷ BVPS $Y" · ¥13,574
//   ⇒ คัดทีละ token ก่อน (`denomTokens`) แล้วค่อยเลือกฐานที่ค่าที่โชว์ "ยืนอยู่" (ใกล้สุดเชิงอัตราส่วน แบบ basisFor)
// ★ ย่าน DENOM_BAND: ค่าที่คิดจากตัวหาร ÷ ค่าที่โชว์ ต้องอยู่ใน [0.6, 1.67] ไม่งั้น = คนละฐาน ไม่ตรวจ ไม่เขียน
//   วัดด้วยประวัติ git 11 ก.ย. 69 (ราคา ณ commit ที่เขียนค่านั้น): การ์ดที่ "ถูกตอนเขียน แล้วราคาวิ่งหนี" อยู่ที่
//   0.62–1.54 (MPC/PSX/VLO/ACN/BCP/AMAT/WDC/STM) · คนละฐานที่หลุดกฎคัด token มาได้อยู่ที่ ≤0.52
//   (PCAR: ตัดปันผลพิเศษทิ้งแล้วเหลือปันผลปกติ) และปันผลครึ่งปี ~0.5 ⇒ ขอบล่าง 0.6 กันไว้ทั้งคู่
//   ผิดทางเดียวที่ย่านนี้ยอม = ค้างต่อ (ปลอดภัย) ไม่ใช่เขียนผิด
const DENOM_BAND = [0.6, 1 / 0.6];
const TOL_DENOM_REL = 0.03;   // ปันผล %/P/BV: ต่างได้ ≤3% หรือครึ่งหลักสุดท้ายที่เขียน แล้วแต่ค่าไหนมากกว่า (บทเรียน MCAP_ULP)

const YIELD_LABEL = /ปันผล|dividend|distribution/i;
// ป้ายที่มีคำว่าปันผลแต่ค่าไม่ใช่ yield (สำรวจคลัง): FCF Yield · Coverage · Payout · Growth · NIM
const YIELD_LABEL_SKIP = /FCF|coverage|payout|growth|เติบโต|CAGR|NIM|loan|ROE|ต่อเนื่อง/i;
const PBV_LABEL = /\bP\s*\/\s*B(?:V|ook)?\b|price.?to.?book/i;

// entity ที่พบใน .d ของคลัง — ถอดเฉพาะตอนอ่าน (ไม่เคยเขียน .d กลับ)
const decodeEnt = (s) => String(s == null ? '' : s)
  .replace(/&middot;|&#183;/g, '·').replace(/&times;|&#215;/g, '×').replace(/&bull;|&#8226;/g, '•')
  .replace(/&minus;|&#8722;/g, '−').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
// สัญลักษณ์เงิน + ตัวเลข — ต้องตรงกับสกุลของราคา (.px) เท่านั้น
const DENOM_MONEY = () => /(C\$|US\$|HK\$|S\$|A\$|NT\$|R\$|[฿$€£¥])\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g;
// ตัวคั่นประโยค — คำนำหน้าของอีกประโยคห้ามข้ามมาติด token ("$0.80/ไตรมาส = $3.20/ปี" · "ราคา $X ÷ BVPS $Y")
const CLAUSE_SEP = /[·•;|()=÷→]/;
// หน่วยใหญ่ตามหลังตัวเลข = ยอดรวมทั้งบริษัท ไม่ใช่ต่อหุ้น
const SCALE_AFTER = /^\s*(?:ล้านล้าน|แสนล้าน|หมื่นล้าน|พัน\s*ล้าน|พัน\s*ลบ\.|พัน\s*ล\.|ล้าน|ลบ\.|(?:mn|bn|million|billion|trillion)\b|[KMBT](?![A-Za-z]))/i;
const UNIT = '(?:\\s*\\/\\s*(?:หุ้น|share|sh|ADR|ADS|หน่วย|unit))?';
const ANNUAL_AFTER = new RegExp(`^${UNIT}\\s*(?:\\/\\s*|ต่อ\\s*)?(?:ปี|yr\\b|year\\b|annum\\b)|^${UNIT}\\s*(?:per\\s*year|annual)`, 'i');
const SUB_AFTER = new RegExp(`^${UNIT}\\s*(?:\\/\\s*|ต่อ\\s*|ราย)?(?:ไตรมาส|quarter(?:ly)?\\b|qtr\\b|Q\\b|เดือน|month(?:ly)?\\b|mo\\b|งวด|ครึ่งปี|half\\b|semi)`, 'i');
// คำนำหน้าในประโยคเดียวกันที่บอกว่า token นี้ "ไม่ใช่ DPS รายปีปกติ" (งวดย่อย/พิเศษ/ตัวชี้อื่น)
// + ยอด "ตามแผน/เป้า" ที่ยังไม่มีผล — ห้ามเป็นฐานแม้ราคาวิ่งจนมันใกล้ค่าที่โชว์กว่า (เคส TRGP: เขียนบน Forward $4.25
//   แต่ราคาขึ้นจนฐานใกล้สุดกลายเป็น "แผนขึ้นเป็น $5.00" ⇒ ตัวซ่อมสลับฐานเงียบ ๆ — จับได้ด้วยประวัติ git 11 ก.ย. 69)
const YIELD_PRE_SKIP = /รายไตรมาส|ไตรมาสละ|quarterly|รายเดือน|monthly|ระหว่างกาล|interim|final|ปลายปี|ครึ่งปี|semi|Q[1-4]\b|พิเศษ|special|supplemental|แผน|plan|จะขึ้น|ประกาศขึ้น|guidance|เป้า|target|EPS|FCF|FFO|กำไร|ราคา|price|buyback|ซื้อหุ้นคืน|NAV|BVPS|book|หนี้|debt|equity|รายได้|revenue/i;
// ตัวหารที่พิมพ์หยาบเกิน: ครึ่งหลักสุดท้ายของมันเอง >5% ของค่า (หลักเดียว เช่น "฿0.04" = ±12.5% · "฿5" = ±10%)
// ⇒ ความคลาดจากการปัดของตัวหารเกินเกณฑ์ตรวจ (3%) — ผู้เขียนคิด % จากเลขละเอียดแล้วพิมพ์ตัวหารแบบปัด
//   (INSET: โชว์ 1.04% ที่คิดจาก ~฿0.044 → คิดใหม่จาก ฿0.04 ได้ 0.88% ทั้งที่จริง ~0.97% = แย่ลง ไม่ใช่สดขึ้น)
//   วัดคลัง 11 ก.ย. 69: 24 การ์ด (หุ้นไทยปันผล ฿0.0x เกือบทั้งหมด + BAX $0.04 + BH ฿5) · "฿12"/"฿14" (±4%) ยังรับ
const DENOM_MIN_PREC = 0.05;
// ชิ้นส่วนของผลบวก ("฿0.34 + ฿0.69" · "$0.75×2") — เว้นแต่ token ประกาศว่าเป็นรายปีเอง ("$5.20/ปี + Special …")
const COMP_AFTER = /^\s*(?:[+×*]|x\s*\d)/i;
const COMP_BEFORE = /[+×]\s*$/;
const BV_KW = /(?<!T)BVPS|(?<!T)BV\s*\/\s*(?:หุ้น|share|sh|S)\b|book\s*value|มูลค่า(?:ทาง|ตาม)บัญชี|ส่วน(?:ของ)?ผู้ถือหุ้น|ส่วนทุน|\bequity\b/i;
const TBV_KW = /TBV|tangible/i;

/** สกุลของราคา = สัญลักษณ์หน้า .px (ตัวเดียวกับที่ gate/heal ใช้เป็นตัวตั้ง) — ไม่มี = ไม่ตรวจ ไม่เขียน */
const currencyOf = (html) => { const p = RM.readHeaderPrice(html); return p ? p.currency : null; };

/** ข้อความในประโยคเดียวกันก่อน token (ตัดที่ตัวคั่นล่าสุด) */
function clauseBefore(t, at) {
  const s = t.slice(Math.max(0, at - 32), at);
  for (let i = s.length - 1; i >= 0; i--) if (CLAUSE_SEP.test(s[i])) return s.slice(i + 1);
  return s;
}

/**
 * ตัวหารที่ "รับได้" ในบรรทัด .d — kind: 'yield' (DPS รายปี) · 'pbv' (BVPS) · 'pbv+tbv' (การ์ดที่ประกาศ P/TBV ด้วย)
 * คัดทิ้งทุกอย่างที่อ่านแล้วต้องเดา — ตัวหารหายหมด = การ์ดนั้นเงียบทั้งตัวตรวจและตัวเขียน
 */
function denomTokens(dBody, cur, kind) {
  const t = clean(decodeEnt(dBody));
  const out = [];
  const re = DENOM_MONEY();
  let m;
  while ((m = re.exec(t))) {
    if (!cur || m[1] !== cur) continue;                                  // สกุลอื่น (€/¥/C$) ≠ สกุลของราคา
    const at = m.index, end = at + m[0].length;
    if (/-\s*$/.test(t.slice(Math.max(0, at - 2), at))) continue;       // ติดลบ (ส่วนทุนติดลบ) → ไม่ใช่ตัวหาร
    const post = t.slice(end, end + 30);
    if (SCALE_AFTER.test(post)) continue;                              // ยอดรวมทั้งบริษัท ($358M · ฿872 ล้าน)
    const value = parseFloat(m[2].replace(/,/g, ''));
    if (!(value > 0)) continue;
    if (0.5 * Math.pow(10, -decOf(m[2])) / value > DENOM_MIN_PREC) continue;   // พิมพ์หยาบเกิน (฿0.04) → คิดใหม่แล้วแย่ลง
    const pre = clauseBefore(t, at);
    if (kind === 'yield') {
      if (YIELD_PRE_SKIP.test(pre) || SUB_AFTER.test(post)) continue;
      if (!ANNUAL_AFTER.test(post) && (COMP_AFTER.test(post) || COMP_BEFORE.test(pre))) continue;
    } else {
      const bv = BV_KW.test(pre), tbv = TBV_KW.test(pre);
      if (kind === 'pbv' ? (!bv || tbv) : !(bv || tbv)) continue;     // ต้องประกาศว่าเป็น BVPS ในประโยคเดียวกัน
    }
    out.push(value);
  }
  return [...new Set(out)];
}

/** จับคู่ค่าที่ implied ↔ ฐาน แบบไม่ซ้ำกันที่ระยะ log รวมน้อยสุด (ตัวคูณเดียว = ฐานที่ใกล้สุด แบบ basisFor) */
function assignBases(implied, bases) {
  if (!implied.length || implied.length > bases.length || bases.length > 8) return null;
  let best = null, bestD = Infinity;
  const rec = (i, used, acc, d) => {
    if (d >= bestD) return;
    if (i === implied.length) { bestD = d; best = acc.slice(); return; }
    bases.forEach((b, j) => {
      if (used & (1 << j)) return;
      acc.push(b); rec(i + 1, used | (1 << j), acc, d + Math.abs(Math.log(implied[i] / b))); acc.pop();
    });
  };
  rec(0, 0, [], 0);
  return best;
}
const inBand = (r) => r >= DENOM_BAND[0] && r <= DENOM_BAND[1];
/** เกณฑ์ตัวตรวจ: ห่างเกิน max(3%, ครึ่งหลักสุดท้ายที่เขียน) — ครึ่งหลักทำให้ "ฟ้อง ⇒ ตัวซ่อมเขียนเลขใหม่ได้เสมอ" */
const denomOff = (want, shown, numStr) =>
  Math.abs(want - shown) > Math.max(TOL_DENOM_REL * Math.abs(shown), MCAP_ULP * Math.pow(10, -decOf(numStr)));

/** การ์ดปันผล % หนึ่งใบ → { label, num, shown, idx, base, want } · null = ตัดสินไม่ได้ (ตัวตรวจเงียบ = ตัวเขียนไม่แตะ) */
function yieldCardPlan(k, vBody, dBody, price, cur) {
  const label = clean(k);
  if (!(price > 0) || !YIELD_LABEL.test(label) || YIELD_LABEL_SKIP.test(label) || PE_LABEL_SKIP.test(label)) return null;
  // อ่านจาก "ข้อความดิบ" ของ .v — แท็กคั่นตัวเลขกับ % = ตัวเขียนแทนที่ไม่ได้ ⇒ ตัวตรวจต้องไม่เห็นด้วย
  const hits = [...String(vBody).matchAll(/([0-9]+(?:\.[0-9]+)?)(\s*%)/g)];
  if (hits.length !== 1) return null;
  const shown = parseFloat(hits[0][1]);
  if (!(shown > 0)) return null;
  const pick = assignBases([shown / 100 * price], denomTokens(dBody, cur, 'yield'));
  if (!pick) return null;
  const want = pick[0] / price * 100;
  return inBand(want / shown) ? { label, num: hits[0][1], shown, idx: hits[0].index, base: pick[0], want } : null;
}

/** การ์ด P/BV หนึ่งใบ → { label, items: [{ num, shown, idx, base, want }] } · null = ตัดสินไม่ได้ */
function pbvCardPlan(k, vBody, dBody, price, cur) {
  const label = clean(k);
  if (!(price > 0) || !PBV_LABEL.test(label) || PE_LABEL_SKIP.test(label)) return null;
  const hits = [...String(vBody).matchAll(/([0-9]+(?:\.[0-9]+)?)(\s*x)/gi)];
  if (!hits.length || hits.length > 3) return null;
  const shown = hits.map((h) => parseFloat(h[1]));
  if (!shown.every((v) => v > 0)) return null;
  // การ์ด "P/BV / P/TBV": จับคู่ตัวคูณ ↔ ฐานแบบไม่ซ้ำกัน · ฐานไม่พอจับคู่ (สองตัวคูณ ฐานเดียว) = ไม่เดา
  const pick = assignBases(shown.map((s) => price / s), denomTokens(dBody, cur, TBV_KW.test(label) ? 'pbv+tbv' : 'pbv'));
  if (!pick) return null;
  const items = hits.map((h, i) => ({ num: h[1], shown: shown[i], idx: h.index, base: pick[i], want: price / pick[i] }));
  return items.every((it) => inBand(it.want / it.shown)) ? { label, items } : null;
}

/** stock-meta.dividendYield = กระจกของการ์ดปันผล (เหมือน stock-meta.pe) — ฐาน = DPS ของการ์ดที่ตัดสินได้เท่านั้น */
function yieldMetaPlan(html, price, cards) {
  if (!cards.length) return null;
  const s = RM.readStockMetaState(html);
  if (!s.ok) return null;
  const d = s.data;
  const shown = d.dividendYield;
  if (!(typeof shown === 'number' && isFinite(shown) && shown > 0)) return null;   // null/0 = ไม่จ่าย/ไม่ประกาศ → ไม่แตะ
  const pick = assignBases([shown / 100 * price], [...new Set(cards.map((c) => c.base))]);
  if (!pick) return null;
  const want = pick[0] / price * 100;
  if (!inBand(want / shown)) return null;
  // ทศนิยม: ตามการ์ดที่เป็นฐาน (นิ่ง — ไม่หดตาม JSON ที่ตัด 0 ท้ายทิ้ง) · อย่างน้อย 1 · ไม่เกิน 2 (สูตรเดียวกับ pe)
  const card = cards.find((c) => c.base === pick[0]);
  return { shown, want, base: pick[0], dec: Math.min(2, Math.max(decOf(String(shown)), decOf(card.num), 1)) };
}

/** ทุกการ์ดปันผลที่ตัดสินได้ + แผนของ stock-meta.dividendYield — ใช้ร่วมทั้ง W19 และ patchDerived */
function yieldPlan(html, price) {
  const cur = currencyOf(html), cards = [];
  const re = cardRe();
  let m;
  while ((m = re.exec(html))) { const p = yieldCardPlan(m[1], m[3], m[5], price, cur); if (p) cards.push(p); }
  return { cards, meta: yieldMetaPlan(html, price, cards) };
}

/** ทุกการ์ด P/BV ที่ตัดสินได้ — ใช้ร่วมทั้ง W20 และ patchDerived */
function pbvPlan(html, price) {
  const cur = currencyOf(html), out = [];
  const re = cardRe();
  let m;
  while ((m = re.exec(html))) { const p = pbvCardPlan(m[1], m[3], m[5], price, cur); if (p) out.push(p); }
  return out;
}

function patchDerived(html, price, opts) {
  const o = opts || {};
  const changes = [];
  if (!(price > 0)) return { html, changes };
  let out = html;
  const allEps = [];

  // 1) การ์ด P/E → ราคา ÷ EPS ของการ์ดนั้น (หลายฐาน → เลือกฐานที่ค่าเดิมยืนอยู่ ไม่สลับฐานให้)
  out = out.replace(cardRe(), (m, k, vOpen, vBody, tail, dBody) => {
    const label = clean(k);
    if (!/P\/E/i.test(label) || PE_LABEL_SKIP.test(label)) return m;
    const eps = epsBasesOf(dBody);
    if (!eps.length) return m;
    let done = false;
    const body = vBody.replace(/(-?[0-9]+(?:\.[0-9]+)?)(\s*x)/i, (mm, num, x) => {
      const shown = parseFloat(num);
      if (done || !(shown > 0)) return mm;
      done = true;
      eps.forEach((e) => allEps.push(e));
      const base = basisFor(shown, price, eps);
      const want = fixed(price / base, decOf(num));
      if (want === num || !isFinite(parseFloat(want))) return mm;
      changes.push(`P/E [${label}] ${num}x → ${want}x (ราคา ${price} ÷ EPS ${base})`);
      return want + x;
    });
    return body === vBody ? m : `<div class="k">${k}</div>${vOpen}${body}${tail}`;
  });
  // การ์ดที่ไม่ถูกแตะ (ไม่ประกาศ EPS) ยังต้องรู้ฐานทั้งหมดของไฟล์ เพื่อเลือกฐานให้ stock-meta.pe
  for (const c of peCards(out)) c.eps.forEach((e) => allEps.push(e));

  // 2) stock-meta.pe — กระจกของค่าที่โชว์ (freshHash ไม่นับบล็อกนี้ ⇒ ไม่ดันวันที่ "อัปเดตล่าสุด")
  if (allEps.length) {
    out = out.replace(RM.STOCK_META_PARTS_RE, (m, a, json, b) => {
      let d;
      try { d = JSON.parse(json); } catch { return m; }
      if (!(typeof d.pe === 'number' && isFinite(d.pe) && d.pe > 0)) return m;
      const base = basisFor(d.pe, price, [...new Set(allEps)]);
      const want = parseFloat(fixed(price / base, Math.min(2, Math.max(decOf(String(d.pe)), 1))));
      if (!isFinite(want) || want === d.pe) return m;
      changes.push(`stock-meta.pe ${d.pe} → ${want} (ราคา ${price} ÷ EPS ${base})`);
      d.pe = want;
      // คงช่องว่าง/ขึ้นบรรทัดรอบ JSON ไว้เป๊ะ — ตัวเขียนหลัก (patchReport) ใส่ \n คร่อมไว้
      // ถ้าตรงนี้เขียนกลับแบบไม่มี \n จะกลายเป็น "patch ซ้ำแล้วไฟล์เปลี่ยน" (เสีย idempotency ของ cron)
      const lead = (json.match(/^\s*/) || [''])[0], trail = (json.match(/\s*$/) || [''])[0];
      return a + lead + JSON.stringify(d) + trail + b;
    });
  }

  // 3) % ในการ์ดราคาเป้า → (เป้า − ราคา)/ราคา  (ตัวเลขล้วน ไม่มีคำให้ต้องเดา)
  out = out.replace(cardRe(), (m, k, vOpen, vBody, tail) => {
    const label = clean(k);
    if (!TGT_LABEL_STRICT.test(label)) return m;
    const body = rewritePct(vBody, price, `การ์ด [${label}]`, changes);
    return body === vBody ? m : `<div class="k">${k}</div>${vOpen}${body}${tail}`;
  });

  // 5) Market Cap = ราคา × จำนวนหุ้นที่การ์ดนั้นพิมพ์ไว้ (บรรทัด .d)
  //    จำนวนหุ้นเป็นข้อเท็จจริงที่รายงานพิมพ์เอง ⇒ เหลือแค่คูณราคาใหม่ ไม่มีอะไรให้เดา
  //    ★ หลุด MCAP_BAND (ราคาที่ implied จากการ์ดห่างราคาปัจจุบันเกินย่าน) = คนละฐาน → ไม่แตะ
  out = out.replace(cardRe(), (m, k, vOpen, vBody, tail, dBody) => {
    const label = clean(k);
    if (!MCAP_LABEL.test(label) || PE_LABEL_SKIP.test(label)) return m;
    const a = parseAmount(vBody), shares = parseShares(dBody);
    if (!a || !shares) return m;
    const ratio = a.value / shares / price;
    if (ratio < MCAP_BAND[0] || ratio > MCAP_BAND[1]) return m;
    const want = fmtLikeNum(price * shares / a.scale, a.num);
    if (want === a.num || !isFinite(parseFloat(want))) return m;
    const body = vBody.replace(/([0-9][0-9,]*(?:\.[0-9]+)?)/, want);
    if (body === vBody) return m;
    changes.push(`Market Cap [${label}] ${a.num} → ${want} (ราคา ${price} × ${shares.toLocaleString('en-US')} หุ้น)`);
    return `<div class="k">${k}</div>${vOpen}${body}${tail}`;
  });

  // 6) P/S = Market Cap ÷ รายได้ที่การ์ดนั้นพิมพ์ไว้
  //    ★ เป็นการอ้างอิง "ข้ามการ์ด" (ตัวตั้งมาจากการ์ด Market Cap) — เดิม warn (เหตุผลเดิม อ้างข้ามการ์ด) — ยกเป็น error ระยะ 1 (12 ก.ย. 2569) หลัง quarantine + heal = 0 (คุมด้วย W16)
  //      ถ้าอ่านฐาน Market Cap ไม่ได้ (ADR/คนละฐาน) → ไม่มีตัวตั้ง → ไม่แตะ
  {
    const basis = mcapCards(out, price)[0];
    if (basis) {
      out = out.replace(cardRe(), (m, k, vOpen, vBody, tail, dBody) => {
        const label = clean(k);
        if (!PS_LABEL.test(label) || PE_LABEL_SKIP.test(label) || /EV/i.test(label)) return m;
        const d = clean(dBody);
        if (!/รายได้|revenue|sales/i.test(d)) return m;
        const rev = parseAmount(d.replace(/^[\s\S]*?(?:รายได้|revenue|sales)/i, ''));
        const vm = clean(vBody).match(/([0-9]+(?:\.[0-9]+)?)\s*x/i);
        if (!rev || !vm || !(rev.value > 0)) return m;
        const want = fixed(price * basis.shares / rev.value, decOf(vm[1]));
        if (want === vm[1] || !isFinite(parseFloat(want))) return m;
        const body = vBody.replace(/([0-9]+(?:\.[0-9]+)?)(\s*x)/i, (mm, n, x) => want + x);
        if (body === vBody) return m;
        changes.push(`P/S [${label}] ${vm[1]}x → ${want}x (Market Cap ÷ รายได้ ${rev.num})`);
        return `<div class="k">${k}</div>${vOpen}${body}${tail}`;
      });
    }
  }

  // 8) ปันผล % = DPS ÷ ราคา · 9) stock-meta.dividendYield · 10) P/BV = ราคา ÷ BVPS  (W19/W20 · 11 ก.ย. 69)
  //    ตัวหารพิมพ์อยู่ในบรรทัด .d ของการ์ดเอง ⇒ เหตุผลเดียวกับ P/E · ตัดสินไม่ได้ = ไม่แตะ (ขอบเขตเท่ากับตัวตรวจเป๊ะ
  //    เพราะทั้งคู่ถาม yieldCardPlan/pbvCardPlan ตัวเดียวกัน) · แตะเฉพาะตัวเลขใน .v — ไม่แตะ .d แม้จะมีตัวเลขค้างในนั้น
  {
    const cur = currencyOf(out);
    const yCards = [];
    out = out.replace(cardRe(), (m, k, vOpen, vBody, tail, dBody) => {
      const p = yieldCardPlan(k, vBody, dBody, price, cur);
      if (!p) return m;
      yCards.push(p);
      const w = fixed(p.want, decOf(p.num));
      if (w === p.num || !isFinite(parseFloat(w))) return m;
      changes.push(`ปันผล [${p.label}] ${p.num}% → ${w}% (DPS ${p.base} ÷ ราคา ${price})`);
      return `<div class="k">${k}</div>${vOpen}${vBody.slice(0, p.idx)}${w}${vBody.slice(p.idx + p.num.length)}${tail}`;
    });
    // stock-meta.dividendYield — กระจกของการ์ด (freshHash ไม่นับบล็อกนี้ ⇒ ไม่ดันวันที่ "อัปเดตล่าสุด")
    const mp = yieldMetaPlan(out, price, yCards);
    const mw = mp ? parseFloat(fixed(mp.want, mp.dec)) : null;
    if (mp && isFinite(mw) && mw !== mp.shown) {
      out = out.replace(RM.STOCK_META_PARTS_RE, (m, a, json, b) => {
        let d;
        try { d = JSON.parse(json); } catch { return m; }
        d.dividendYield = mw;
        const lead = (json.match(/^\s*/) || [''])[0], trail = (json.match(/\s*$/) || [''])[0];   // คง \n คร่อมไว้ (idempotency ของ cron)
        return a + lead + JSON.stringify(d) + trail + b;
      });
      changes.push(`stock-meta.dividendYield ${mp.shown} → ${mw} (DPS ${mp.base} ÷ ราคา ${price})`);
    }
    // P/BV — การ์ด "P/BV / P/TBV" เขียนทีละตัวคูณจากท้ายไปหน้า (ตำแหน่งที่ถอดไว้จะได้ไม่เลื่อน)
    out = out.replace(cardRe(), (m, k, vOpen, vBody, tail, dBody) => {
      const p = pbvCardPlan(k, vBody, dBody, price, cur);
      if (!p) return m;
      let body = vBody;
      for (const it of [...p.items].sort((a, b) => b.idx - a.idx)) {
        const w = fixed(it.want, decOf(it.num));
        if (w === it.num || !isFinite(parseFloat(w))) continue;
        body = body.slice(0, it.idx) + w + body.slice(it.idx + it.num.length);
        changes.push(`P/BV [${p.label}] ${it.num}x → ${w}x (ราคา ${price} ÷ BVPS ${it.base})`);
      }
      return body === vBody ? m : `<div class="k">${k}</div>${vOpen}${body}${tail}`;
    });
  }

  // 7) หมวด 6 — ผลตอบแทนฉาก Bear/Base/Bull + ราคา "จากจุดเข้า"
  //    ตัวตั้งคือราคาที่เพิ่ง patch ไป ส่วนราคาเป้า (EPS ปี 3 × P/E ออก) เป็นสมมติฐานที่รายงานพิมพ์เอง
  //    ⇒ เหตุผลเดียวกับ P/E และ % ในการ์ด: ไม่ใช่ prose ไม่มีอะไรให้ cron เดา
  //    ปล่อยไว้ = ฉาก Bear โชว์ผลตอบแทนบวกทั้งที่ราคาวิ่งขึ้นไปแล้ว (RGLD +8.7% ที่จริง −11.3%)
  //    ★ ขอบเขต = เท่ากับที่ `scenarioPlan` ตัดสินได้เท่านั้น — ตัดสินไม่ได้ (ปันผลกำกวม/ใบเพี้ยนในตัวเอง)
  //      คือ "ไม่แตะ" ทั้งตัวเขียนและตัวตรวจ (W17) · เขียนทับด้วยการเดา = ทำลายเลขที่คนตั้งใจเขียน
  {
    const plan = scenarioPlan(out, price);
    if (plan) {
      // ชนิดขีดลบตามที่ใบนั้นใช้อยู่ (คลังใช้ − มากกว่า - ราว 6:1) — ใช้ตอนต้องเติมเครื่องหมายให้ค่าที่เดิมไม่มี
      const negChar = /−/.test(plan.block.sec) ? '−' : '-';
      // รวบจุดที่ต้องเขียนให้ครบก่อน แล้วเขียนจากท้ายไปหน้า — ตำแหน่งที่ถอดไว้จะได้ไม่เลื่อนระหว่างเขียน
      const edits = [];
      const push = (at, len, w, what) => { if (w) edits.push({ at, len, text: w.text, msg: `หมวด 6 ${what}: ${w.from} → ${w.to}` }); };
      for (const it of plan.items) {
        const who = it.col.kind;
        if (it.total) push(it.col.at + it.total.token.index, it.total.token.len,
          retWrite(it.total.token, it.total.want, negChar), `${who} รวม`);
        if (it.py) push(it.col.at + it.py.token.index, it.py.token.len,
          retWrite(it.py.token, it.py.want, negChar), `${who} ต่อปี`);
      }
      const h = plan.block.hint;
      if (h && h.value > 0) {
        const want = fmtLikeNum(price, h.num);
        if (want !== h.num) edits.push({ at: h.at, len: h.num.length, text: want, msg: `หมวด 6 จุดเข้า: ${h.num} → ${want}` });
      }
      edits.sort((x, y) => y.at - x.at);
      for (const e of edits) { out = out.slice(0, e.at) + e.text + out.slice(e.at + e.len); changes.push(e.msg); }
    }
  }

  // 4) (opt-in) % ของราคาเป้าที่เขียนในเนื้อความ — cron ห้ามแตะ prose (§9) ⇒ ใช้เฉพาะ heal ที่คนสั่ง + รีวิว diff
  if (o.prose) {
    out = out.replace(new RegExp(MONEY_PCT_SRC, 'g'), (m, cur, numS, open, sign, pctS, pctEnd, idx, whole) => {
      const target = parseFloat(numS.replace(/,/g, ''));
      if (!(target > 0) || target < 0.25 * price) return m;
      const before = clean(String(whole).slice(Math.max(0, idx - 220), idx)).slice(-100);
      if (!TGT_LABEL_STRICT.test(before) || QUOTE_CONTEXT.test(before)) return m;
      const after = clean(String(whole).slice(idx, idx + 200));
      const close = after.indexOf(')');
      if (PCT_NOT_VS_PRICE.test(after.slice(0, close === -1 ? 60 : close))) return m;
      const shown = parseFloat(norm(sign) + pctS);
      const exp = (target - price) / price * 100;
      if (Math.abs(exp - shown) <= 1e-9) return m;
      const want = fixed(Math.abs(exp), decOf(pctS));
      const wantSign = exp >= 0 ? '+' : (sign === '−' ? '−' : '-');
      // เทียบแบบ normalize เครื่องหมายลบ (− vs -) ไม่งั้นค่าที่ถูกอยู่แล้วจะถูกนับเป็น "แก้" ทุกครั้ง
      if (norm(wantSign) + want === norm(sign) + pctS) return m;
      changes.push(`เนื้อความ: เป้า ${target} ${sign}${pctS}% → ${wantSign}${want}%`);
      return cur + numS + open + wantSign + want + pctEnd;
    });
  }
  return { html: out, changes };
}

// เขียน % ในสตริง "…$เป้า (+X%)…" ใหม่จากราคา — คงรูปแบบเดิม (สกุลเงิน, ทศนิยม, ชนิดขีดลบ)
function rewritePct(s, price, where, changes) {
  return s.replace(new RegExp(MONEY_PCT_SRC, 'g'), (m, cur, numS, open, sign, pctS, pctEnd) => {
    const target = parseFloat(numS.replace(/,/g, ''));
    if (!(target > 0)) return m;
    const exp = (target - price) / price * 100;
    const want = fixed(Math.abs(exp), decOf(pctS));
    const wantSign = exp >= 0 ? '+' : (sign === '−' ? '−' : '-');
    if (norm(wantSign) + want === norm(sign) + pctS) return m;   // ถูกอยู่แล้ว (เทียบแบบ normalize − vs -)
    changes.push(`${where} เป้า ${target}: ${sign}${pctS}% → ${wantSign}${want}%`);
    return cur + numS + open + wantSign + want + pctEnd;
  });
}

// ── สมอตายวนกลับ (dead anchor) — W18 · CLAUDE.md §8 ชั้น 0.4e ─────────────────────────
// ขา FV ที่ **ตัวคูณเป้าหมายถูกนิยามจากตัวคูณปัจจุบัน** ("P/E เป้าหมาย ~36x — ใกล้เคียง P/E ปัจจุบัน")
// ⇒ ขานั้นคืนราคาวันนี้กลับมาโดยโครงสร้าง อ่านแล้วเหมือนมี valuation แต่บอกไม่ได้ว่าถูกหรือแพง
// (เจอ 9 ก.ย. 69 ตอนเคลียร์คิว price-flags: ODFL ขา P/E ห่างราคา 0.1% · EXPE สองขา ~5% · gate ผ่าน 43/43)
//
// ★ เกณฑ์เทียบ **ตัวคูณกับตัวคูณ** ไม่ใช่ mval กับราคา — ทั้งสองค่าเป็นข้อความคงที่ในไฟล์
//   ⇒ cron ขยับราคาแล้วผลไม่กระพริบ (เกณฑ์ "mval ห่างราคา ≤3%" ยิง 225/908 และเปลี่ยนทุกวันตามราคา
//    จึงใช้เป็นตัวชี้ค้นหาใน `tools/spotcheck.js` เท่านั้น ไม่เอาเข้า gate)
const DA_GAP = 0.07;          // ตัวคูณเป้า ห่างตัวคูณปัจจุบัน ≤7% = นิยามจากค่าปัจจุบัน (วัดคลัง 9 ก.ย. 69: ยิง 23/908)
const DA_NUMX = '(\\d+(?:\\.\\d+)?)\\s*(?:x|เท่า)';
// ตัวคูณที่ "วัดจริง" มาจากประวัติ/peer = ขาที่มีสมอจริง แม้จะบังเอิญใกล้ค่าปัจจุบัน → ไม่ใช่สมอตาย
const DA_ANCHORED = /มัธยฐาน|median|เฉลี่ย[^<]{0,14}ปี|ย้อนหลัง|historical|5-?yr|[35] ปี|10 ปี|เคยซื้อขาย|ปี 25\d\d|peer|กลุ่ม|sector|อุตสาหกรรม|คู่แข่ง/i;
const DA_TGT_AFTER  = new RegExp('(?:เป้าหมาย|target)[^0-9]{0,20}~?\\s*' + DA_NUMX, 'i');
const DA_TGT_BEFORE = new RegExp('×\\s*~?\\s*' + DA_NUMX + '[^.;·]{0,25}?(?:เป้าหมาย|target)', 'i');
const DA_CUR = new RegExp('(?:ปัจจุบัน|current|วันนี้|spot)[^0-9]{0,28}~?\\s*' + DA_NUMX + '|' + DA_NUMX + '\\s*(?:ปัจจุบัน|current|วันนี้)', 'i');

// desc ของการ์ดวิธี (.mdesc) → { target, current, gap } เมื่อเป็นสมอตาย · null เมื่อไม่ใช่/ตัดสินไม่ได้
// **เงียบเมื่อ parse ไม่ได้** ตามแบบ E21/W14 — ตัวคูณอ่านไม่ครบ = ไม่ฟ้อง
function deadAnchor(desc) {
  const d = String(desc || '');
  if (!d || DA_ANCHORED.test(d)) return null;         // มีสมอที่วัดจริง → ไม่ใช่คลาสนี้
  const t = DA_TGT_BEFORE.exec(d) || DA_TGT_AFTER.exec(d);
  const c = DA_CUR.exec(d);
  if (!t || !c) return null;
  const target = parseFloat(t[1]), current = parseFloat(c[1] || c[2]);
  if (!(target > 0) || !(current > 0)) return null;
  const gap = (target - current) / current;
  return Math.abs(gap) <= DA_GAP ? { target, current, gap: gap * 100 } : null;
}

module.exports = {
  TOL_PE_REL, TOL_PE_ABS, TOL_TGT_PP, TOL_MCAP_REL, MCAP_ULP, MCAP_BAND,
  PE_LABEL_SKIP, TGT_LABEL_STRICT, PCT_NOT_VS_PRICE, QUOTE_CONTEXT, MONEY_PCT_SRC, CARD_SRC,
  MCAP_LABEL, PS_LABEL, SCALES, scaleOf, parseAmount, parseShares, mcapCards, psCards, nearMcap,
  fmtLikeNum, cardRe, epsBasesOf, peCards, targetCells, basisFor, nearPE, patchDerived,
  // หมวด 6 (ผลตอบแทนฉาก 3 ปี) — W17 + ตัวซ่อม
  TOL_RET_PP, TOL_RET_REL, TOL_PY_PP, SCN_TIGHT, SCN_VOTE_RATIO, CONV_PP,
  scenarioBlock, scenarioPlan, retTokens, retOff, pyOff, retWrite, retShown,
  // สมอตายวนกลับ — W18 + tools/spotcheck.js
  DA_GAP, DA_ANCHORED, deadAnchor,
  // ปันผล % + P/BV — W19/W20 + ตัวซ่อม
  DENOM_BAND, TOL_DENOM_REL, DENOM_MIN_PREC, YIELD_LABEL, PBV_LABEL, currencyOf, denomTokens, assignBases, denomOff,
  yieldCardPlan, pbvCardPlan, yieldMetaPlan, yieldPlan, pbvPlan,
};
