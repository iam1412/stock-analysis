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
 *
 * ใช้ร่วมกัน 2 ฝั่ง — ห้ามทำสำเนาความรู้ (บทเรียนเดียวกับ `price-date.js`):
 *   • ตัวตรวจ  `test/check-reports.js` → E41 (P/E) · E42 (% ในการ์ด) · E43 (Market Cap) · W15 (% ในเนื้อความ) · W16 (P/S)
 *   • ตัวเขียน `tools/update-prices.js` → `patchDerived()` ทั้งใน cron รายวันและโหมด `--heal-derived`
 *
 * ★ หลักที่ห้ามหลุด: **เงียบเมื่ออ่านฐานไม่ได้** — การ์ดที่ไม่ประกาศ EPS ของตัวเอง หรือช่องค่าที่ไม่ใช่
 *   ตัวคูณ (N/A, "ขาดทุน") ต้องถูกข้าม ทั้งตอนตรวจและตอนเขียน เพราะรายงานหนึ่งใบมี EPS ได้หลายฐาน
 *   โดยตั้งใจ (PWR: GAAP $8.74 → 80x คู่กับ Adj. $13.1 → 53x) — เดาฐานผิด = เขียนเลขผิดทั้งใบ
 */

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
  const items = [];
  b.cols.forEach((c, i) => {
    const d = conv === 'div' ? c.dps : 0;
    const total = (c.tgt + d - price) / price * 100;
    const a = anchors[i];
    // %/ปี: รักษาสูตรของใบนั้น (CAGR หรือ total/N) — ถอดจากคู่ที่โชว์อยู่ ซึ่งไม่ขึ้นกับราคา
    let py = null;
    if (a.py) {
      const shownTotal = a.tot ? signedOf(a.tot) : null;
      const cagr = (v) => (Math.pow(1 + v / 100, 1 / b.years) - 1) * 100;
      // ★ ตัวตั้งของ %/ปี = ค่า total **ที่จะถูกเขียนลงไปจริง** (ปัดตามทศนิยมของช่องนั้นแล้ว) ไม่ใช่ค่าดิบ
      //   ไม่งั้นรอบนี้คิด %/ปี จากค่าดิบ (−13.54%) แต่รอบหน้าอ่านค่าที่เขียนไป (−14%) ได้คนละคำตอบ
      //   ⇒ ไฟล์ถูกเขียนซ้ำอีกหนึ่งรอบเสมอ (เจอจริง 20 ส.ค. 69: SNOW/CEG/KLAC/NOW/PANW)
      //   และการอิงค่าที่แสดงจริงยังทำให้ผู้อ่านกดเครื่องคิดเลขตามแล้วได้เลขเดียวกันด้วย
      const base3 = a.tot ? parseFloat(fixed(total, decOf(a.tot.num))) : total;
      if (shownTotal == null) {
        py = { token: a.py, want: cagr(base3) };                        // รูป "ต่อปีล้วน" ไม่มี total ให้เทียบ → ใช้กฎ (CAGR)
      } else {
        const shownPy = signedOf(a.py);
        const dC = Math.abs(cagr(shownTotal) - shownPy), dL = Math.abs(shownTotal / b.years - shownPy);
        const lim = Math.max(CONV_PP, Math.abs(shownPy) * 0.05);
        if (dC > lim && dL > lim) return;                               // คู่ที่โชว์ไม่เข้าสูตรไหนเลย = อ่านผิดรูป (เคส AWC สลับที่) → ทิ้งทั้งคอลัมน์
        // ★ เลือกด้วย "ใกล้ค่าที่โชว์กว่า" ไม่ใช่ "เอา CAGR ไว้ก่อน" — ไม่งั้นสั่นระหว่างสองสูตร:
        //   ผลตอบแทนน้อย ๆ CAGR กับ total/N ต่างกันไม่ถึงเกณฑ์จำแนก ⇒ เขียน linear ลงไปรอบนี้
        //   รอบหน้ามันจะ "เข้าเกณฑ์ CAGR ด้วย" แล้วถูกเขียนทับเป็น CAGR ⇒ cron ขยับไฟล์ทุกวันทั้งที่ไม่มีอะไรค้าง
        //   (เจอจริง 20 ส.ค. 69: GRMN +11.4%⇄+10.3% · SHANG −9.7%⇄−10.9%)
        //   เลือกตัวที่ใกล้ที่สุด ⇒ พอเขียนแล้วระยะห่างของตัวนั้นเป็น 0 รอบถัดไปจึงเลือกตัวเดิมเสมอ
        py = { token: a.py, want: dC <= dL ? cagr(base3) : base3 / b.years };
      }
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
    out = out.replace(/(<script[^>]*\bid=["']stock-meta["'][^>]*>)([\s\S]*?)(<\/script>)/i, (m, a, json, b) => {
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
  //    ★ เป็นการอ้างอิง "ข้ามการ์ด" (ตัวตั้งมาจากการ์ด Market Cap) — จึงคุมด้วย W16 ระดับ warn ไม่ใช่ error
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

module.exports = {
  TOL_PE_REL, TOL_PE_ABS, TOL_TGT_PP, TOL_MCAP_REL, MCAP_ULP, MCAP_BAND,
  PE_LABEL_SKIP, TGT_LABEL_STRICT, PCT_NOT_VS_PRICE, QUOTE_CONTEXT, MONEY_PCT_SRC, CARD_SRC,
  MCAP_LABEL, PS_LABEL, SCALES, scaleOf, parseAmount, parseShares, mcapCards, psCards, nearMcap,
  fmtLikeNum, cardRe, epsBasesOf, peCards, targetCells, basisFor, nearPE, patchDerived,
  // หมวด 6 (ผลตอบแทนฉาก 3 ปี) — W17 + ตัวซ่อม
  TOL_RET_PP, TOL_RET_REL, TOL_PY_PP, SCN_TIGHT, SCN_VOTE_RATIO, CONV_PP,
  scenarioBlock, scenarioPlan, retTokens, retOff, pyOff, retWrite, retShown,
};
