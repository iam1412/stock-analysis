'use strict';
/**
 * display.js (migrate-v3) — v2Display ของใบ migrate: ตัวเลขของผู้เขียนที่หน้า v2 พิมพ์ แต่ v3 คิดจาก inputs ได้ไม่เท่า (display-fix · เจ้าของ 26 ก.ย. 69)
 *   กติกา "ถูก" = หน้า v3 แสดงสิ่งที่หน้า v2 แสดง (ตัวเลขของผู้เขียน ภายในการปัดที่ผู้เขียนพิมพ์) · ห้ามเปลี่ยนตัวเลขของผู้เขียน
 *   ค่าที่ผูกราคาเทียบที่ราคา snapshot ของ v2 (view ที่ส่งมา = compute บน market ของหน้า v2)
 *   fv/fvRange/targets = report-data ของ v2 (ตัวเลขที่ผู้เขียนเขียน — หน้า v2 พิมพ์ผ่าน token) · legValues/driverEnds = ข้อความที่หน้า v2 พิมพ์
 *   gauge = สเกลเกจที่ผู้เขียนเลือกเอง (เมื่อชุดตัวเลขต่างจาก template) · cards = การ์ดที่ cron v2 ไม่เคยแตะ (ข้อความคงที่) แต่ v3 คิดได้ไม่เท่า
 *     "cron v2 ไม่เคยแตะ" วัดด้วยการจำลอง cron v2 (UP.derivedPassV2) ที่ราคาอื่น — ค่าการ์ดไม่ขยับ = คงที่ ⇒ พกข้อความ (v2 ก็ไม่เคยแก้)
 *     การ์ดที่ขยับตามราคา (live) ไม่พก — ต้องให้ v3 คิดได้เท่าเอง (ไม่งั้นค้างเงียบ + gate E41/E43 ฟ้องเมื่อราคาขยับ)
 * อ่านอย่างเดียว — คืน { v2Display | null, notes: [] }
 */
const RM = require('../report-meta.js');
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

/** จำลอง cron v2 ที่ราคา px×f (UP.derivedPassV2 — ทางเดียวกับ cron จริง) → { cards: ข้อความค่าการ์ด §1, rets: ข้อความ .ret §6 } · จำลองไม่ได้ = null */
function cronSim(raw, f) {
  try {
    const UP = require('../update-prices.js');
    const rdS = RM.readReportData(raw), sm = RM.readStockMeta(raw);
    if (!rdS || !rdS.ok || !sm) return null;
    const rd = JSON.parse(JSON.stringify(rdS.data));
    const px = round2(rd.values.px * f);
    rd.values.px = px;
    const m = raw.match(RM.REPORT_DATA_PARTS_RE);
    if (!m) return null;
    const raw2 = raw.replace(m[0], m[1] + RV.styledRD(rd) + m[3]);
    const out = UP.derivedPassV2(raw2, px, {}).html;
    const sm2 = { ...sm, price: px };
    const p = PV.parseV2('X', out);
    return { cards: p.s1cards.map((c) => shownV2(c.vHtml, rd, sm2)), rets: p.s6cols.map((c) => shownV2(c.retHtml, rd, sm2)) };
  } catch (_) { return null; }
}

/** ชิ้นของหน้า v2 ที่ค่าขยับตามราคา (cron v2 เขียนทับ หรือเป็น token) → { cards: Set(index), rets: Set(index) } · จำลองไม่ได้ = null */
function liveParts(raw, parsed) {
  const base = { cards: parsed.s1cards.map((c) => shownV2(c.vHtml, parsed.rd, parsed.sm)), rets: parsed.s6cols.map((c) => shownV2(c.retHtml, parsed.rd, parsed.sm)) };
  const live = { cards: new Set(), rets: new Set() };
  parsed.s1cards.forEach((c, i) => { if (/\{\{rd:/.test(c.vHtml)) live.cards.add(i); });
  parsed.s6cols.forEach((c, i) => { if (/\{\{rd:/.test(c.retHtml || '')) live.rets.add(i); });
  for (const f of [1.37, 0.71]) {
    const x = cronSim(raw, f);
    if (!x || x.cards.length !== base.cards.length || x.rets.length !== base.rets.length) return null;
    for (const k of ['cards', 'rets']) x[k].forEach((t, i) => { if (t !== base[k][i]) live[k].add(i); });
  }
  return live;
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
    if (!e || !sc || !isNum(e.end) || !e.text || /\{\{/.test(e.text)) return null;
    const v3t = `~${view.cur}${RV.fmtPerShare(sc.driverEnd)}`;
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
  // การ์ดคงที่ (cron v2 ไม่เคยแตะ) ที่ v3 คิดได้ไม่เท่า
  const cm = (o.cardMeta || []).filter((m) => m.key);
  if (cm.length) {
    let live = null, liveTried = false;
    const cards = {};
    for (const m of cm) {
      const c = parsed.s1cards[m.i];
      if (!c) continue;
      let v3;
      try { v3 = K.renderCard(m.key, view).v; } catch (_) { continue; }
      const v2t = shownV2(c.vHtml, parsed.rd, parsed.sm);
      if (sameNumbers(v2t, v3)) continue;
      if (!liveTried) { live = liveParts(raw, parsed); liveTried = true; }
      if (!live) { notes.push(`card "${c.k}" (${m.key}) differs but the v2 cron could not be simulated — not carried`); continue; }
      const clean = (s) => String(s).replace(/[{}<>]/g, '').replace(/\s+/g, ' ').trim();
      if (live.cards.has(m.i)) {
        // การ์ดผูกราคาที่ cron v2 คิดจากฐานที่ .d ของการ์ดประกาศเอง (EPS/DPS/BVPS คนละตัวกับ fundamentals) → v3 คิดจากฐานเดียวกัน (ยังขยับตามราคา)
        const lb = /\{\{rd:/.test(c.vHtml) ? null : liveBase(c, v.px, parsed.sm && parsed.sm.currency);
        if (!lb) { notes.push(`card "${c.k}" (${m.key}) is price-bound on the v2 page (cron rewrote it) and v3 shows ${v3} vs ${v2t} — not carried`); continue; }
        cards[m.key] = { v: clean(v2t), d: clean(shownV2(c.dHtml, parsed.rd, parsed.sm)), op: lb.op, base: lb.base };
        notes.push(`card "${c.k}" (${m.key}) ${v3} → v2 base ${lb.base} (${lb.op})`);
        continue;
      }
      cards[m.key] = { v: clean(v2t) || '—', d: clean(shownV2(c.dHtml, parsed.rd, parsed.sm)) };
      notes.push(`card "${c.k}" (${m.key}) ${v3} → v2 fixed text "${cards[m.key].v}"`);
    }
    if (Object.keys(cards).length) out.cards = cards;
  }
  // ช่องผลตอบแทนฉาก (.ret) ที่ผู้เขียนพิมพ์เป็นข้อความ แต่ v3 (token ผลตอบแทน + retNote) พิมพ์ตัวเลขชุดอื่น
  const cols = parsed.s6cols || [];
  if (cols.length === 3 && doc.scenarios && cols.every((c) => c.retHtml != null && !/\{\{rd:sc\dret\}\}/.test(c.retHtml))) {
    const v2t = cols.map((c) => shownV2(c.retHtml, parsed.rd, parsed.sm));
    const v3t = cols.map((c, i) => { try { return `${RV.TOKENS[`sc${i + 1}ret`](view.d)} ${doc.scenarios.cases[i].retNote || ''}`; } catch (_) { return ''; } });
    if (v2t.every((t) => t.trim()) && v2t.some((t, i) => !sameNumbers(t, v3t[i]))) {
      const live = liveParts(raw, parsed);
      if (!live) notes.push('scenario returns differ but the v2 cron could not be simulated — not carried');
      else {
        const isLive = live.rets.size > 0;
        const s6t = PV.text((parsed.byN[6] || {}).body || '');
        const r = { texts: v2t.map((t) => t.replace(/[{}<>]/g, '').trim()), live: isLive, neg: /−/.test(s6t) ? '−' : '-' };
        if (isLive) {
          // ฐานเดียวกับ cron v2 (DV.scenarioPlan บนหน้า v2 ที่ render แล้ว · ฐานที่ประกาศใน scnBasis ชนะการอนุมาน): ปันผลรวมในผลตอบแทนไหม
          let plan = null;
          try { plan = DV.scenarioPlan(RV.renderValues(raw, parsed.rd, parsed.sm), v.px, undefined, v.scnBasis || undefined); } catch (_) { plan = null; }
          r.div = plan ? plan.conv === 'div' : !!doc.scenarios.divIncluded;
          r.perYear = (v.scnBasis && v.scnBasis.perYear) || pyConvOf(r.texts, doc.scenarios.years);
        }
        else r.cls = cols.map((c, i) => { const m = /<div class="ret\s+(pos|neg)\b/.exec((((parsed.byN[6] || {}).body || '').split(/<div class="col /)[i + 1]) || ''); return m ? m[1] : (/^[\s~≈]*[-−]/.test(r.texts[i]) ? 'neg' : 'pos'); });
        out.rets = r;
        notes.push(`scenario returns ${isLive ? 'live (v2 cron format)' : 'fixed text'} from the v2 page`);
      }
    }
  }
  return { v2Display: Object.keys(out).length ? out : null, notes };
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

module.exports = { v2DisplayOf, liveParts, cronSim, v2Gauge, sameNumbers, shownV2, pyConvOf };
