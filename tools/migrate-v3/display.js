'use strict';
/**
 * display.js (migrate-v3) — v2Display ของใบ migrate: ตัวเลขของผู้เขียนที่หน้า v2 พิมพ์ แต่ v3 คิดจาก inputs ได้ไม่เท่า (display-fix · เจ้าของ 26 ก.ย. 69)
 *   กติกา "ถูก" = หน้า v3 แสดงสิ่งที่หน้า v2 แสดง (ตัวเลขของผู้เขียน ภายในการปัดที่ผู้เขียนพิมพ์) · ห้ามเปลี่ยนตัวเลขของผู้เขียน
 *   ค่าที่ผูกราคาเทียบที่ราคา snapshot ของ v2 (view ที่ส่งมา = compute บน market ของหน้า v2)
 *   fv/fvRange/targets = report-data ของ v2 (ตัวเลขที่ผู้เขียนเขียน — หน้า v2 พิมพ์ผ่าน token) · legValues/driverEnds = ข้อความที่หน้า v2 พิมพ์
 *   gauge = สเกลเกจที่ผู้เขียนเลือกเอง (เมื่อชุดตัวเลขต่างจาก template)
 *   ★ round 2 (controller 26 ก.ย. 69): v2Display พกเฉพาะสมมติฐาน/ข้อเท็จจริงของผู้เขียน — **ห้ามค่าที่เป็นฟังก์ชันของราคา**
 *     cards: การ์ดผูกราคา (PRICE_KEYS) = ฐานของผู้เขียนที่ให้ค่าของหน้า v2 ที่ราคาของมันเอง → {op, base} คิดสด · ไม่มีฐานใด = การ์ด v2 ค้างเอง (ไม่พก · staleCards)
 *            การ์ดไม่ผูกราคา / ข้อความไม่มีตัวเลข = ข้อความของผู้เขียน {v, d}
 *     rets: รูปแบบข้อความของผู้เขียน คิดตัวเลขใหม่ทุกครั้ง — เฉพาะเมื่อตัวเลขของหน้า v2 สอดคล้องกับเป้าของตัวเอง (ไม่งั้น v3 คิดเอง · retsInconsistent)
 *     driverTotal: หน้า v2 พิมพ์ตัวตั้งฉากเป็นยอดรวมทั้งบริษัท (CPNG/NET)
 * อ่านอย่างเดียว — คืน { v2Display | null, notes: [], staleCards: [], retsInconsistent: [คอลัมน์] | null }
 */
const RV = require('../report-values.js');
const S = require('../v3/schema.js');
const K = require('../v3/cards.js');
const PV = require('./parse-v2.js');
const LG = require('./legs.js');
const NB = require('./numbers.js');
const MP = require('./prose.js');
const DV = require('../derived-values.js');

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const round2 = (x) => Math.round(x * 100) / 100;
const decOf = (s) => { const m = /[0-9][0-9,]*(?:\.([0-9]+))?/.exec(String(s)); return m && m[1] ? m[1].length : 0; };
const halfOf = (s) => 0.5 * Math.pow(10, -decOf(s));
const MONEY = 0.005;   // report-data เก็บเงิน 2 ตำแหน่ง (fmtPrice)

/** ข้อความสองชุดแสดงตัวเลขชุดเดียวกันไหม (จำนวนเท่ากัน · ทุกคู่ห่าง ≤ 1 หน่วยของหลักสุดท้ายที่ v2 พิมพ์ = เกณฑ์ drift ที่เจ้าของยอมรับ · เดียวกับ audit)
 *  ⇒ การ์ด/ข้อความที่ v3 คิดได้ภายในการปัดของผู้เขียน ยังคิดสดจาก inputs (ไม่แช่แข็งโดยไม่จำเป็น) */
function sameNumbers(v2Text, v3Text) {
  const a = NB.numsOf(v2Text), b = NB.numsOf(v3Text);
  return a.length === b.length && a.every((p, i) => Math.abs(p.v - b[i].v) <= 2 * p.half * (1 + 1e-9));
}

/** ข้อความที่หน้า v2 แสดงของ HTML ชิ้นหนึ่ง (token {{rd:X}} → ค่าที่ v2 render) */
function shownV2(html, rd, sm) {
  let h = String(html || '');
  try { h = RV.renderValues(h, rd, sm); } catch (_) { /* token ที่ render ไม่ได้ = คงไว้ (ไม่ตรงอะไร) */ }
  return MP.decode(PV.text(h));
}

/** การ์ดผูกราคาของหน้า v2 → ฐานที่ cron v2 ใช้ ({op, base}) · ตัวเดียวกับ DV (P/E: peCards+basisFor · ปันผล: yieldCardPlan · P/BV: pbvCardPlan) · ไม่ได้ = null */
function liveBase(c, px, currency) {
  const cur = RV.CUR_SYMBOL[currency];
  const html = `<div class="metric"><div class="k">${c.kHtml}</div><div class="v">${c.vHtml}</div><div class="d">${c.dHtml}</div></div>`;
  const pe = DV.peCards(html)[0];
  if (pe) { const b = DV.basisFor(pe.shown, px, pe.eps); return b > 0 ? { op: 'pxOverBase', base: b } : null; }
  const y = DV.yieldCardPlan(c.kHtml, c.vHtml, c.dHtml, px, cur);
  if (y && y.base > 0) return { op: 'basePct', base: y.base };
  const pb = DV.pbvCardPlan(c.kHtml, c.vHtml, c.dHtml, px, cur);
  if (pb && pb.items.length && pb.items.every((it) => it.base > 0)) return { op: 'pxOverBase', base: pb.items.length === 1 ? pb.items[0].base : pb.items.map((it) => it.base) };
  return null;
}

/** สเกลเกจของหน้า v2 → [{ref|text, label}] · null เมื่ออ่านไม่ได้/มี token นอก S.GAUGE_REFS */
function v2Gauge(parsed) {
  const s4 = parsed.byN && parsed.byN[4];
  const m = s4 && /<div class="scale">([\s\S]*?)<\/div>\s*<\/div>/.exec(s4.body);
  if (!m) return null;
  const ticks = [];
  for (const sp of m[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)) {
    const [head, ...rest] = sp[1].split(/<br\s*\/?>/i);
    const lab = PV.text(((/<small>([\s\S]*?)<\/small>/i.exec(rest.join(' ')) || [])[1]) || rest.join(' ')).replace(/[{}<>]/g, '').trim();
    const tok = /^\s*\{\{rd:([A-Za-z0-9]+)\}\}\s*$/.exec(head);
    if (tok) { if (!S.GAUGE_REFS.includes(tok[1])) return null; ticks.push({ ref: tok[1], label: lab }); continue; }
    if (/\{\{/.test(head)) return null;
    const t = PV.text(head).replace(/[{}<>]/g, '').trim();
    if (!t) return null;
    ticks.push({ text: t, label: lab });
  }
  return ticks.length >= 2 && ticks.length <= 8 ? ticks : null;
}

/**
 * v2DisplayOf({ parsed, raw, doc, view, legMeta, cardMeta, scnMeta }) → { v2Display | null, notes }
 *   view = compute(doc) ที่ market ของหน้า v2 และ **ไม่มี** v2Display (ค่าที่ v3 คิดเอง)
 */
function v2DisplayOf(o) {
  const { parsed: parsedRaw, raw, doc, view } = o;
  const notes = [];
  // ค่าที่หน้า v2 แสดง = หลัง cron v2 ที่ราคา snapshot (audit.v2Served — ตัวเลขผูกราคาที่ cron เขียนใหม่ทุกวัน) · โครง/ดัชนีเท่าต้นฉบับ
  const servedHtml = require('./audit.js').v2Served(raw);
  const parsed = servedHtml === raw ? parsedRaw : { ...parsedRaw, s1cards: PV.parseV2(parsedRaw.sym, servedHtml).s1cards, s6cols: PV.parseV2(parsedRaw.sym, servedHtml).s6cols, byN: PV.parseV2(parsedRaw.sym, servedHtml).byN };
  const rd = parsed.rd || {}, v = rd.values || {};
  const out = {};
  // FV + กรอบ FV (report-data ของผู้เขียน)
  if (isNum(rd.fv) && Math.abs(round2(view.fv) - rd.fv) > MONEY + 1e-9) { out.fv = rd.fv; notes.push(`FV ${round2(view.fv)} → author ${rd.fv}`); }
  if (isNum(v.fvLow) && isNum(v.fvHigh) && v.fvLow > 0 && v.fvLow <= v.fvHigh
    && (Math.abs(round2(view.fvLow) - v.fvLow) > MONEY + 1e-9 || Math.abs(round2(view.fvHigh) - v.fvHigh) > MONEY + 1e-9)) {
    out.fvRange = [v.fvLow, v.fvHigh]; notes.push(`FV range ${round2(view.fvLow)}–${round2(view.fvHigh)} → author ${v.fvLow}–${v.fvHigh}`);
  }
  // ค่าขา (.mval ที่หน้า v2 พิมพ์)
  const lv = (doc.legs || []).map((leg, i) => {
    const lm = (o.legMeta || [])[i], vl = view.legs[i];
    if (!lm || !vl || !lm.mval) return null;
    const n = LG.mvalNum(lm.mval);
    if (!(isNum(n) && n > 0)) return null;
    const shown = round2(vl.value);
    return Math.abs(shown - n) > halfOf(lm.mval) * (1 + 1e-9) && Math.abs(vl.value - n) > halfOf(lm.mval) * (1 + 1e-9) ? n : null;
  });
  // ขา context (display-fix2): หน้า v2 พิมพ์ช่วง/ขีด/ติดลบ (CRWV "−$135 ถึง −$35" · AVGO "—") ที่ .mval ของ v3 (ตัวเลขบวกตัวเดียว) พิมพ์ไม่ได้ → legTexts ·
  //   ตัวเลขติดลบตัวเดียว → legValues ติดลบ (schema: ขา context เท่านั้น)
  const lt = (doc.legs || []).map((leg, i) => {
    const lm = (o.legMeta || [])[i], vl = view.legs[i];
    if (!lm || !vl || leg.role !== 'context' || !lm.mval) return null;
    const t = MP.decode(PV.text(lm.mval)).replace(/\s+/g, ' ').trim();
    const nums = NB.numsOf(t);
    const neg = /[−-]\s*(?:US\$|C\$|HK\$|\$|฿|€|£|¥)?\s*[0-9]/.test(t);
    if (nums.length === 1 && neg && !/ถึง|–|\bto\b/.test(t.replace(/^[−-]/, ''))) { lv[i] = -nums[0].v; return null; }
    // ข้อความที่ .mval ของ v3 (สกุล + ตัวเลขบวกตัวเดียว) พิมพ์ไม่ได้: ช่วง · ติดลบ · ขีด · มีหน่วย/คำ (LWLG "EV ~$693M")
    const plainNum = nums.length === 1 && !neg && !t.replace(/(?:US\$|C\$|HK\$|\$|฿|€|£|¥|บาท)|[0-9][0-9,]*(?:\.[0-9]+)?|[~≈\s]/g, '');
    if (plainNum) return null;
    if (t && t.length <= 60 && !/[{}<>]/.test(t) && (nums.length || /^(?:—|–|-|n\/a|N\/A)$/.test(t))) return t;
    return null;
  });
  lt.forEach((t, i) => { if (t != null) lv[i] = null; });
  if (lt.some((x) => x != null)) { out.legTexts = lt; notes.push(`context leg texts ${lt.map((x) => (x == null ? '·' : `"${x}"`)).join(' ')}`); }
  if (lv.some((x) => x != null)) { out.legValues = lv; notes.push(`leg values ${lv.map((x, i) => (x == null ? '·' : `${round2(view.legs[i].value)}→${x}`)).join(' ')}`); }
  // ราคาเป้าฉาก (values.scenarios ของผู้เขียน · ไม่มี = .tgt literal ของคอลัมน์) + ตัวตั้งปลายฉากที่พิมพ์
  const s6 = parsed.byN && parsed.byN[6];
  const tg = [0, 1, 2].map((i) => {
    const sc = view.scn[i]; if (!sc) return null;
    // ตัวเลขที่หน้า v2 พิมพ์ใน .tgt เป็นหลัก (literal "฿172" = ตัวที่ผู้อ่านเห็น และที่ cron v2 ใช้คิดผลตอบแทน) · token = values.scenarios
    let shown = null;
    const m = s6 && /<div class="tgt">([\s\S]*?)<\/div>/.exec(s6.body.split(/<div class="col /)[i + 1] || '');
    if (m && !/\{\{rd:/.test(m[1])) { const x = NB.numsOf(PV.text(m[1]))[0]; if (x && x.v > 0) shown = x.v; }
    if (shown == null && v.scenarios && v.scenarios[i] && isNum(v.scenarios[i].tgt)) shown = v.scenarios[i].tgt;
    return shown != null && shown > 0 && Math.abs(round2(sc.tgt) - shown) > MONEY + 1e-9 ? shown : null;
  });
  if (tg.some((x) => x != null)) { out.targets = tg; notes.push(`targets ${tg.map((x, i) => (x == null ? '·' : `${round2(view.scn[i].tgt)}→${x}`)).join(' ')}`); }
  // แถวตัวตั้งปลายฉาก ("EPS ปี 3 ~$8.6" · "รายได้ปี 3 ~$38.75B") = ข้อความที่ผู้เขียนพิมพ์ — v3 คิดได้ไม่เท่า (หรือคนละหน่วย) → พกข้อความ
  const ends = ((o.scnMeta && o.scnMeta.ends) || []).map((e, i) => {
    const sc = view.scn[i];
    if (S.s6CellOf(doc, i)) return null;   // เซลล์ของผู้เขียน (display-fix2) พิมพ์แถวตัวตั้งเองแล้ว
    if (!e || !sc || !isNum(e.end) || !isNum(sc.driverEnd) || !e.text || /\{\{/.test(e.text)) return null;
    const sh = doc.fundamentals && doc.fundamentals.shares;
    const v3t = o.scnMeta.total && sh > 0 ? `~${RV.fmtBig(sc.driverEnd * sh, view.cur)}` : `~${view.cur}${RV.fmtPerShare(sc.driverEnd)}`;
    return sameNumbers(e.text, v3t) ? null : String(e.text).replace(/[{}<>]/g, '').trim() || null;
  });
  if (ends.length === 3 && ends.some((x) => x != null)) { out.driverEnds = ends; notes.push(`scenario end values ${ends.map((x) => (x == null ? '·' : x)).join(' ')}`); }
  // วันที่ footer "ข้อมูล ณ …" ตามที่หน้า v2 พิมพ์ (ศักราช/วงเล็บของผู้เขียน) ≠ ที่ template พิมพ์จาก analysisDate + dateEra
  const ft = /ข้อมูล\s*ณ\s*(.*?)\s*(?:[•·|]|สร้างด้วย|$)/.exec(MP.decode(PV.text(parsedRaw.footer || '')));
  if (ft && /\d{4}/.test(ft[1]) && ft[1].trim() !== view.analysisDateText) { out.footer = ft[1].replace(/[{}<>]/g, '').trim(); notes.push(`footer date "${out.footer}" (template: ${view.analysisDateText})`); }
  // สเกลเกจ: ชุดช่องของผู้เขียน (token/ตัวเลขคงที่) ≠ ชุดที่ template สร้าง (mos30 · mos20 · fv · fvHigh · analystTgt) → พกสเกลของผู้เขียน
  //   ชุดเดียวกัน = ตัวเลขเท่ากันเอง (ref ชี้ค่าเดียวกัน · FV/กรอบพกแล้วข้างบน) ⇒ ไม่พก
  let g = v2Gauge(parsed);
  if (g) {
    // ค่าตลาด (display-fix2 · controller): ป้ายราคา/สูงสุด-ต่ำสุด 52 สัปดาห์ ห้ามแช่ — ref สด (px · hi52w/lo52w จาก market.range52w) · ไม่มี range52w = ไม่พกสเกล
    const r52 = doc.market && doc.market.range52w;
    let lostMarket = false;
    g = g.map((t) => {
      if (t.ref != null || !(S.MARKET_TICK_RE.test(t.label || '') || S.MARKET_TICK_RE.test(String(t.text).replace(/[0-9][0-9,]*(?:\.[0-9]+)?/g, '')))) return t;
      const lab = `${t.label || ''} ${t.text}`;
      const low = /ต่ำสุด|ต่ำ|\blow\b|ล่าง/i.test(lab), is52 = /52|สัปดาห์|week|wk|ATH|all[- ]?time|สูงสุด|\bhigh\b|บน/i.test(lab);
      const ref = is52 ? (low ? 'lo52w' : 'hi52w') : 'px';
      if (ref !== 'px' && !r52) { lostMarket = true; return t; }
      return { ref, label: t.label };
    });
    if (lostMarket) { notes.push('gauge scale not carried — a 52-week tick needs market.range52w'); g = null; }
  }
  if (g) {
    // ป้ายตัวเลขคงที่ที่เท่าค่าของช่อง template (CASY "$954" = เป้า analyst) = ช่องนั้น — ไม่ใช่สเกลของผู้เขียน
    const fvA = isNum(out.fv) ? out.fv : round2(view.fv);
    const refVal = { mos30: round2(fvA * 0.7), mos20: round2(fvA * 0.8), fv: fvA, fvHigh: out.fvRange ? out.fvRange[1] : round2(view.fvHigh), fvLow: out.fvRange ? out.fvRange[0] : round2(view.fvLow), analystTgt: doc.analyst ? doc.analyst.target : null };
    const used = new Set(g.filter((t) => t.ref).map((t) => t.ref));
    g = g.map((t) => {
      if (t.ref != null) return t;
      const n = NB.numsOf(t.text);
      if (n.length !== 1) return t;
      const hit = Object.keys(refVal).find((k) => !used.has(k) && isNum(refVal[k]) && Math.abs(refVal[k] - n[0].v) <= n[0].half * (1 + 1e-9));
      if (!hit) return t;
      used.add(hit);
      return { ref: hit, label: t.label };
    });
    const genRefs = ['mos30', 'mos20', 'fv', 'fvHigh'].concat(doc.analyst ? ['analystTgt'] : []).sort().join(',');
    const myRefs = g.map((t) => t.ref || '#').sort().join(',');
    if (myRefs !== genRefs) { out.gauge = g; notes.push(`gauge scale ×${g.length} from the v2 page`); }
  }
  // การ์ด §1 (round 2 · advisor/controller: v2Display = สมมติฐาน/ข้อเท็จจริงของผู้เขียนเท่านั้น — ห้ามค่าที่เป็นฟังก์ชันของราคา)
  //   ผูกราคา: ฐาน (EPS/BVPS/DPS…) ที่ทำให้ได้ค่าของหน้า v2 ที่ราคาของมันเอง → {op, base} (คิดสดที่ราคาปัจจุบัน) · ไม่มีฐานใดได้ค่านั้น = การ์ด v2 ค้างเอง → ค่าที่ v3 คิด (ไม่พก · จด)
  //   ไม่ผูกราคา (รายได้ · กำไร · margin …): ข้อความของผู้เขียน {v, d}
  const plan = cardPlan(parsed, doc, view, (o.cardMeta || []).filter((m) => m.key).map((m) => ({ i: m.i, key: m.key })));
  const cards = {};
  const stale = [];
  for (const x of plan) {
    if (x.kind === 'text') { cards[x.key] = { v: x.v2t || '—', d: x.d }; notes.push(`card "${x.label}" (${x.key}) ${x.v3} → v2 text "${x.v2t}" (not price-bound)`); }
    else if (x.kind === 'base') { cards[x.key] = { v: x.v2t, d: x.d, op: x.op, base: x.base }; notes.push(`card "${x.label}" (${x.key}) ${x.v3} → live on the v2 base ${JSON.stringify(x.base)} (${x.op})`); }
    else if (x.kind === 'stale') { stale.push(x); notes.push(`card "${x.label}" (${x.key}) v2 "${x.v2t}" is stale on the v2 page (no base reproduces it at the v2 price) — v3 shows ${x.v3}`); }
  }
  if (Object.keys(cards).length) out.cards = cards;
  // การ์ด custom ที่ค่าเป็นตัวคูณ/ปันผลผูกราคา (display-fix2 · ZS "P/E Non-GAAP (FY26 จริง) ~46x" · EPS non-GAAP $4.21) → คิดสดจากฐานของผู้เขียน (v2Display.custom)
  const customLive = {};
  ((o.cardMeta || []).filter((m) => !m.key)).forEach((m, j) => {
    const c = parsed.s1cards[m.i], cu = doc.metrics && doc.metrics.custom && doc.metrics.custom[j];
    if (!c || !cu || /\{\{/.test(c.vHtml) || /\{\{/.test(String(cu.value))) return;
    const lb = liveBase(c, view.d.px, parsed.sm && parsed.sm.currency);
    const n = firstNum(PV.text(c.vHtml));
    if (!lb || !n) return;
    const b0 = Array.isArray(lb.base) ? lb.base[0] : lb.base;
    if (Math.abs(opValue(lb.op, b0, view.d.px) - n.v) > 2 * n.half * (1 + 1e-9)) return;
    customLive[j] = { op: lb.op, base: lb.base };
    notes.push(`custom card "${c.k}" live on the v2 base ${JSON.stringify(lb.base)} (${lb.op})`);
  });
  if (Object.keys(customLive).length) out.custom = customLive;
  // ช่องผลตอบแทนฉาก (.ret) ที่ผู้เขียนพิมพ์เป็นข้อความ — ค่าผูกราคา ⇒ พกได้แค่ "รูปแบบ" (คิดสดทุกครั้ง · live) และเฉพาะเมื่อตัวเลขของหน้า v2
  //   สอดคล้องกับราคาเป้า/ราคาของหน้าเอง · ไม่สอดคล้อง (v2 พิมพ์ผิด/ค้าง — AON Bear "−3%") = v3 คิดเอง (ส่วนเบี่ยงที่ตั้งใจ · audit รับเฉพาะคลาสนี้)
  const cols = parsed.s6cols || [];
  let retsInconsistent = null;
  if (cols.length === 3 && doc.scenarios && cols.every((c) => c.retHtml != null && !/\{\{rd:sc\dret\}\}/.test(c.retHtml))) {
    const v2t = cols.map((c) => shownV2(c.retHtml, parsed.rd, parsed.sm));
    const v3t = cols.map((c, i) => { try { return `${RV.TOKENS[`sc${i + 1}ret`](view.d)} ${doc.scenarios.cases[i].retNote || ''}`; } catch (_) { return ''; } });
    if (v2t.every((t) => t.trim()) && v2t.some((t, i) => !sameNumbers(t, v3t[i]))) {
      const R = require('../../_template/v3/render.js');
      const perYear = (v.scnBasis && v.scnBasis.perYear) || pyConvOf(v2t, doc.scenarios.years);
      const cons = retConsistency(parsed, v.px, doc.scenarios.years, perYear);
      if (!v2t.every((t) => R.v2RetTokens(t))) {
        // รูปที่เขียนใหม่ไม่ได้ (หลายผลตอบแทนรวม/หลาย %/ปี ต่อช่อง) → รูปแบบ v3 · คอลัมน์ที่ v2 พิมพ์ขัดกับเป้าของตัวเอง = ส่วนเบี่ยงที่ตั้งใจ
        const bad = cons.map((c, i) => (c && !c.ok ? i : -1)).filter((i) => i >= 0);
        if (bad.length) retsInconsistent = bad;
        notes.push(`scenario returns: v2 format not rewritable — v3 format${bad.length ? ` (columns ${bad.join(',')} contradict their own targets)` : ''}`);
      } else {
        // ฐานปันผล = ฐานที่คอลัมน์ตรงมากที่สุด (เสมอกัน: ฐานของ cron v2 [DV.scenarioPlan · scnBasis ชนะ] → divIncluded ของใบ)
        //   คอลัมน์ที่ไม่ตรงภายใต้ฐานนั้น = v2 พิมพ์ขัดกับเป้าของตัวเอง (AON Bear "−3%" · MAJOR ปนสองฐาน) → ตัวเลขคิดใหม่ในรูปแบบของผู้เขียน (ส่วนเบี่ยงที่ตั้งใจ)
        let plan = null;
        try { plan = DV.scenarioPlan(RV.renderValues(raw, parsed.rd, parsed.sm), v.px, undefined, v.scnBasis || undefined); } catch (_) { plan = null; }
        const pd = plan ? plan.conv === 'div' : null;
        const order = [...new Set([pd, !!doc.scenarios.divIncluded, false, true].filter((x) => x != null))];
        const score = (d) => cons.filter((c) => c && c.divs.includes(d)).length;
        const div = order.reduce((best, d) => (score(d) > score(best) ? d : best), order[0]);
        const bad = cons.map((c, i) => (c && !c.divs.includes(div) ? i : -1)).filter((i) => i >= 0);
        if (bad.length) { retsInconsistent = bad; notes.push(`scenario returns: columns ${bad.join(',')} contradict their own targets at the page's own price (${div ? 'with-dividend' : 'price-only'} basis) — computed there (deliberate deviation)`); }
        const s6t = PV.text((parsed.byN[6] || {}).body || '');
        out.rets = { texts: v2t.map((t) => t.replace(/[{}<>]/g, '').trim()), neg: /−/.test(s6t) ? '−' : '-', perYear, div };
        notes.push('scenario returns: the v2 format, rewritten live at the current price (v2 cron dead-band)');
      }
    }
  }
  // ตัวตั้งปลายฉากเป็นยอดรวมทั้งบริษัท ("รายได้ปี 3 ~$38.75B" — CPNG/NET) ⇒ แถว/ป้ายพิมพ์ยอดรวม (driver ยังเป็นต่อหุ้น · ยอดรวม = ต่อหุ้น × หุ้น)
  if (o.scnMeta && o.scnMeta.total && doc.scenarios && ['revenuePerShare', 'ebitdaPerShare', 'fcfPerShare'].includes(doc.scenarios.driver) && doc.fundamentals && doc.fundamentals.shares > 0) { out.driverTotal = true; notes.push('scenario driver printed as a company total (per share × shares), as on the v2 page'); }
  return { v2Display: Object.keys(out).length ? out : null, notes, staleCards: stale, retsInconsistent };
}

const PRICE_KEYS = new Set(['mcap', 'pe', 'pbv', 'ps', 'yield', 'evEbitda', 'peForward', 'analystTarget', 'pffo', 'pffoForward', 'ptbv']);
const firstNum = (t) => NB.numsOf(t)[0] || null;
/** ค่าของการ์ดที่ฐาน b ที่ราคา px (ตัวเลขแรกของข้อความ · ทศนิยมเท่าเดิม) — ตัวเดียวกับ render liveCardValue */
const opValue = (op, b, px) => (op === 'basePct' ? b / px * 100 : op === 'pxTimesBase' ? px * b : px / b);
/** ฐานผู้สมัครของการ์ดผูกราคา (จาก fundamentals/ขาของใบ = ตัวเลขที่หน้า v2 ใช้) */
function candBases(key, doc) {
  const f = doc.fundamentals || {}, legs = doc.legs || [];
  const ov = (k) => legs.map((l) => l.override && l.override[k]).filter((x) => isNum(x) && x > 0);
  if (key === 'pe' || key === 'peForward') return { op: 'pxOverBase', bases: [f.eps, f.epsForward, f.fy && f.fy.eps, ...ov('eps'), ...ov('epsForward')].filter((x) => isNum(x) && x > 0) };
  if (key === 'pbv' || key === 'ptbv') return { op: 'pxOverBase', bases: [f.bvps, f.tbvps, ...ov('bvps')].filter((x) => isNum(x) && x > 0) };
  if (key === 'pffo') return { op: 'pxOverBase', bases: [f.ffoPerShare].filter((x) => isNum(x) && x > 0) };
  if (key === 'yield') return { op: 'basePct', bases: [f.dps].filter((x) => isNum(x) && x > 0) };
  return { op: null, bases: [] };
}
/**
 * แผนการ์ด §1: [{i, key, label, v2t, v3, d, kind: 'text'|'base'|'rounding'|'stale', op?, base?}] (เฉพาะการ์ดที่ตัวเลขต่างเกิน 1 หน่วยที่พิมพ์)
 *   parsed = หน้า v2 ตามที่เว็บแสดง (หลัง cron ที่ราคาของมันเอง) · pairs = [{i (ดัชนีการ์ด v2), key}] · view = compute ที่ market ของหน้า v2
 */
// การ์ดผูกราคาที่ .d ของ template พิมพ์ฐานต่อหุ้นซึ่งอาจถอดกลับจาก % ของผู้เขียน (DPS = yield × ราคา · stock-meta.dividendYield)
//   EPS/BVPS ของ P/E · P/BV มาจากการ์ด/ขาที่ผู้เขียนพิมพ์ — ไม่ใช่ตัวถอดกลับ (BBL)
const D_BASE_KEYS = new Set(['yield']);
/** ตัวเลขใน a ที่ไม่มีคู่ใน b (มี/ไม่มีสัญลักษณ์เงินเหมือนกัน · ห่าง ≤ 1 หน่วยที่พิมพ์ · สเกลหน่วยต่างกันได้ — "82.5M" ↔ "82.5 ล้าน")
 *  สัญลักษณ์เงินต้องตรง — "$3.09/ปี" ไม่ใช่คู่ของ "Q3" (TD) */
const curNums = (t) => [...String(t || '').matchAll(NB.NUM_RE)].map((m) => ({ ...NB.numsOf(m[0])[0], cur: /[$฿€£¥]/.test(m[0]) })).filter((x) => x.v != null);
function newNumbers(a, b) {
  const xs = curNums(a), ys = curNums(b);
  return xs.some((q) => !ys.some((p) => p.cur === q.cur && [1, 1e3, 1e6, 1e9].some((k) => Math.abs(p.v * k - q.v) <= 2 * Math.max(p.half * k, q.half) * (1 + 1e-9))));
}
/** คำของ a ที่ b ไม่มี (≥ 2 ตัวอักษร · ตัดเครื่องหมาย) — ถ้อยคำของผู้เขียนที่ข้อความของ template ไม่พิมพ์ */
const wordsLost = (a, b) => { const w = (t) => String(t).split(/[\s/]+/).map((x) => x.replace(/[^\p{L}\p{M}\p{N}]/gu, '')).filter((x) => (x.match(/\p{L}/gu) || []).length >= 2); const B = new Set(w(b)); return w(a).some((x) => !B.has(x)); };
function cardPlan(parsed, doc, view, pairs) {
  const out = [];
  const px = view.d.px, cur = parsed.sm && parsed.sm.currency;
  const clean = (s) => String(s).replace(/[{}<>]/g, '').replace(/\s+/g, ' ').trim();
  for (const { i, key } of pairs) {
    const c = parsed.s1cards[i];
    if (!c) continue;
    let v3, td;
    try { const rc = K.renderCard(key, view); v3 = rc.v; td = rc.d; } catch (_) { continue; }
    const v2t = clean(shownV2(c.vHtml, parsed.rd, parsed.sm));
    const d2 = clean(shownV2(c.dHtml, parsed.rd, parsed.sm));
    // .d ของ template พิมพ์ฐานที่การ์ด v2 ไม่มี (ปันผล "$1.97/ปี" ถอดจาก yield × ราคา ขณะที่ผู้เขียนพิมพ์ "$0.50/ไตรมาส") = ตัวเลขที่ผู้เขียนไม่ได้พิมพ์
    //   ⇒ แสดงบรรทัดล่างของผู้เขียน (ค่ายังคิดสดจากฐาน) แม้ค่าการ์ดจะเท่ากัน (audit: invented)
    const dNew = D_BASE_KEYS.has(key) && newNumbers(td, `${v2t} ${d2}`);
    const x0 = { i, key, label: c.k, v2t, v3, d: d2 };
    // Market Cap ที่ผู้เขียนพิมพ์ด้วยถ้อยคำ/หน่วยของตัวเอง ("~US$198 พันล้าน" — TD · 27 ก.ย. 69): ค่าเท่ากันแต่คำต่าง → ข้อความของผู้เขียนคิดสด (ราคา × หุ้น ในหน่วยที่ผู้เขียนพิมพ์)
    if (key === 'mcap' && sameNumbers(v2t, v3) && wordsLost(v2t, v3)) {
      const sh = doc.fundamentals && doc.fundamentals.shares, n0 = firstNum(v2t), m0 = /[0-9][0-9,]*(?:\.[0-9]+)?/.exec(v2t);
      const raw = m0 ? parseFloat(m0[0].replace(/,/g, '')) : null;
      if (sh > 0 && n0 && raw > 0 && Math.abs(px * sh - n0.v) <= 2 * n0.half * (1 + 1e-9)) { out.push({ ...x0, kind: 'base', op: 'pxTimesBase', base: +(sh / (n0.v / raw)).toPrecision(8) }); continue; }
    }
    if (sameNumbers(v2t, v3) && !dNew) continue;
    const a2 = NB.numsOf(v2t), a3 = NB.numsOf(v3);
    const x = x0;
    // ไม่ผูกราคา หรือหน้า v2 พิมพ์ข้อความไม่มีตัวเลข ("ขาดทุน GAAP" · "ไม่มี" — ข้อเท็จจริงของผู้เขียน ไม่ใช่ฟังก์ชันของราคา) → ข้อความของผู้เขียน
    if (!PRICE_KEYS.has(key) || !a2.length) { out.push({ ...x, kind: 'text' }); continue; }
    const n = firstNum(v2t);
    const reproduces = (op, b) => n && Math.abs(opValue(op, Array.isArray(b) ? b[0] : b, px) - n.v) <= 2 * n.half * (1 + 1e-9);
    // (1) ฐานที่ .d ของการ์ดประกาศ (DV — ตัวเดียวกับ cron v2 / E41 · W19 · W20)
    const lb = /\{\{rd:/.test(c.vHtml) ? null : liveBase(c, px, cur);
    if (lb && reproduces(lb.op, lb.base)) { out.push({ ...x, kind: 'base', op: lb.op, base: lb.base }); continue; }
    // (2) ตัวเลขของใบ (fundamentals · override ของขา) ที่ได้ค่าของหน้า v2 ที่ราคาของมันเอง
    const cb = candBases(key, doc);
    const hit = cb.op && cb.bases.find((b) => reproduces(cb.op, b));
    if (hit) { out.push({ ...x, kind: 'base', op: cb.op, base: hit }); continue; }
    // ต่างแค่ความละเอียดที่ v3 พิมพ์ (fmtBig 3 หลัก "$24.95B" ↔ "$24.9B") = การปัด ไม่ใช่การ์ดค้าง
    if (dNew && sameNumbers(v2t, v3)) continue;   // ไม่มีฐานใดให้คิดสด — คงการ์ดของ template (audit ยังรายงาน)
    if (a2.length === a3.length && a2.every((p, j) => Math.abs(p.v - a3[j].v) <= 2 * Math.max(p.half, a3[j].half) * (1 + 1e-9))) { out.push({ ...x, kind: 'rounding' }); continue; }
    out.push({ ...x, kind: 'stale' });
  }
  return out;
}
/** การ์ด v2 ↔ คีย์ของใบ (ลำดับ · MC.keyOf — แบบเดียวกับ EQ.norm) สำหรับ audit ที่ไม่มี meta ของ migrator */
function pairsOf(parsed, doc) {
  const MC = require('./cards.js');
  const keys = S.cardEntries(doc.metrics || {}).filter((e) => e.key).map((e) => e.key);
  const used = new Set(), out = [];
  parsed.s1cards.forEach((c, i) => { const k = MC.keyOf(c.k, c.v); if (k && keys.includes(k) && !used.has(k) && !MC.amountNotYield(k, c)) { used.add(k); out.push({ i, key: k }); } });
  return out;
}
/**
 * ความสอดคล้องของ .ret ที่หน้า v2 พิมพ์ กับราคาเป้า (+ปันผล) ของคอลัมน์และราคาของหน้าเอง → [{ok, divs: [สมมติฐานปันผลที่ตรง], text} | null] ต่อคอลัมน์
 *   เกณฑ์ = ของ cron v2 เอง (DV.retOff: max(TOL_RET_PP, 1% ของค่า) ≥ max(TOL_RET_PP, 1 หน่วยที่พิมพ์) · %/ปี DV.pyOff) — ตัวเดียวกับ dead-band ของ render
 *   ⇒ ok = หน้า v3 ที่ราคาของหน้า v2 พิมพ์ตัวเลขเดียวกันทุกตัว · ไม่ ok = v2 พิมพ์ขัดกับเป้าของตัวเอง (หน้า v3 พิมพ์ค่าที่คิดใหม่)
 *   · perYear = สูตร %/ปี ที่หน้า v3 ใช้ (ไม่ส่ง = CAGR หรือเส้นตรงตัวไหนก็ได้) · null = อ่าน token/เป้าไม่ได้
 */
function retConsistency(parsed, px, years, perYear) {
  const R = require('../../_template/v3/render.js');
  const s6 = (parsed.byN && parsed.byN[6]) || {}, v = (parsed.rd && parsed.rd.values) || {};
  return (parsed.s6cols || []).map((c, i) => {
    const text = shownV2(c.retHtml, parsed.rd, parsed.sm), parts = R.v2RetTokens(text);
    if (!parts) return null;
    const colHtml = String(s6.body || '').split(/<div class="col /)[i + 1] || '';
    const m = /<div class="tgt">([\s\S]*?)<\/div>/.exec(colHtml);
    let T = m ? (firstNum(shownV2(m[1], parsed.rd, parsed.sm)) || {}).v : null;
    if (!isNum(T) && v.scenarios && v.scenarios[i]) T = v.scenarios[i].tgt;
    const dl = c.lis.find((x) => /ปันผล/.test(x[0]));
    let D = dl ? (firstNum(shownV2(dl[2], parsed.rd, parsed.sm)) || {}).v : null;
    if (!isNum(D) && v.scenarios && v.scenarios[i] && isNum(v.scenarios[i].div)) D = v.scenarios[i].div;
    if (!isNum(T) || !(px > 0)) return null;
    const divs = [];
    for (const div of [false, true]) {
      if (div && !isNum(D)) continue;
      const ok = (perYear ? [perYear] : ['cagr', 'linear']).some((py) => {
        const w = R.v2RetWants(parts, { tgt: T, divCum: isNum(D) ? D : null, px, years, div, perYear: py });
        return w && parts.every((x, k) => !(x.kind === 'py' ? DV.pyOff(x.v, w[k]) : DV.retOff(x.v, w[k])));
      });
      if (ok) divs.push(div);
    }
    return { ok: divs.length > 0, divs, text };
  });
}

/** สูตร %/ปี ของข้อความ .ret (คู่ total + %/ปี ในช่องเดียวกัน) — แบบเดียวกับ DV.scenarioPlan: ช่องที่แยกขาดชี้ · ไม่มีหลักฐาน = cagr (prior ของคลัง) */
function pyConvOf(texts, years) {
  let c = 0, l = 0;
  for (const t of texts) {
    const toks = DV.retTokens(t), tot = toks.find((x) => !x.perYear), py = toks.find((x) => x.perYear);
    if (!tot || !py) continue;
    const T = (tot.sign && /[-−–]/.test(tot.sign) ? -1 : 1) * tot.val, P = (py.sign && /[-−–]/.test(py.sign) ? -1 : 1) * py.val;
    const dC = Math.abs((Math.pow(1 + T / 100, 1 / years) - 1) * 100 - P), dL = Math.abs(T / years - P);
    if (dC < dL) c = Math.max(c, dL - dC); else l = Math.max(l, dC - dL);
  }
  return l > c * 2 ? 'linear' : 'cagr';
}

module.exports = { v2DisplayOf, v2Gauge, sameNumbers, shownV2, pyConvOf, cardPlan, pairsOf, retConsistency, PRICE_KEYS };
