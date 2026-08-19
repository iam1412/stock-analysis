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
 *
 * ใช้ร่วมกัน 2 ฝั่ง — ห้ามทำสำเนาความรู้ (บทเรียนเดียวกับ `price-date.js`):
 *   • ตัวตรวจ  `test/check-reports.js` → E41 (P/E) · E42 (% ในการ์ด) · W15 (% ในเนื้อความ)
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
  TOL_PE_REL, TOL_PE_ABS, TOL_TGT_PP,
  PE_LABEL_SKIP, TGT_LABEL_STRICT, PCT_NOT_VS_PRICE, QUOTE_CONTEXT, MONEY_PCT_SRC, CARD_SRC,
  cardRe, epsBasesOf, peCards, targetCells, basisFor, nearPE, patchDerived,
};
