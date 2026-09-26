'use strict';
/**
 * render.js — template เดียวของรายงาน v3 → สร้าง "ต้นฉบับรูป v2" ในหน่วยความจำ
 * (stock-meta + report-data v2 + token {{rd:…}} + marker) แล้วให้ build.js เดินทางเดิมทุกขั้น
 * ⇒ dashboard.css / engine.js / decorateReport / injectTA / gate v2 ใช้ต่อได้โดยไม่แก้
 * DOM/class คัดจาก _template/skeleton-th.html (ห้ามคิด class ใหม่ ยกเว้น .xtab ของ extras)
 * ทุก string จาก JSON ที่ไปลง HTML แบบ prose ผ่าน esc() หรือ renderProse() เสมอ · สี gdots/theme ผ่าน allowlist
 * tools/safe-values.js ที่ schema (ต้นทาง) และ build.js (ปลายทาง) · JSON ใน <script type="application/json">
 * ผ่าน jsonScript() ที่แปลง '<' เป็น \u003c (ชั้นที่สอง — open-item #50)
 */
const RV = require('../../tools/report-values.js');
const P = require('../../tools/v3/prose.js');
const K = require('../../tools/v3/cards.js');
const S = require('../../tools/v3/schema.js');
const X = require('../../tools/v3/extras.js');
const C = require('../../tools/v3/compute.js');
const DV = require('../../tools/derived-values.js');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const METHOD_NAME = { pe: 'P/E', pbv: 'P/BV', ps: 'P/S', evsales: 'EV/Sales', evebitda: 'EV/EBITDA', pfcf: 'P/FCF', fcfyield: 'FCF Yield',
  pffo: 'P/FFO', ddm: 'DDM / Gordon Growth', ddm2: 'DDM 2 ระยะ', dcf: 'DCF', ri: 'Residual Income', declared: 'มูลค่าประกาศ' };
const SRC_NAME = { median5y: 'มัธยฐาน 5 ปี', median10y: 'มัธยฐาน 10 ปี', peer: 'ค่ากลางกลุ่มเทียบ', justified: 'justified', sector: 'ค่ากลางเซกเตอร์', current: 'ตัวคูณปัจจุบัน', author: 'ผู้วิเคราะห์กำหนด' };
// Plan 2a Task 9 (§3.6 J) — ป้าย FFO/AFFO ของขา pffo · driver ffo · exit pffo · ชุดเดียวกับการ์ด/gate (S.FFO_LABEL · Plan 4c-prep + Core FFO)
const ffoLabel = (doc) => S.FFO_LABEL[doc.fundamentals.ffoBasis || 'ffo'];
// Plan 4b Task 2: scenarios.exitDp → ทศนิยมคงที่ · ไม่มี = พิมพ์ค่าดิบเหมือนเดิม
const exitText = (s, m) => (s.exitDp != null ? m.toFixed(s.exitDp) : String(m));
const dot = (c) => `<div style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block;margin:0 3px"></div>`;
// JSON ใน <script> ห้ามมี '<' ดิบ (กัน </script> ปิดแท็กก่อนเวลา) — '<' โผล่ได้เฉพาะในสตริง JSON ⇒ \u003c ยัง parse เป็นค่าเดิม
const jsonScript = (s) => String(s).replace(/</g, '\\u003c');

// Finding 3 (postreview) — mdesc EPS ต้องระบุฐานให้ตรง: override.eps = "EPS ปรับ" (ไม่ใช่ TTM ของจริง)
// ไม่งั้นตาม fundamentals.epsBasis (gaap-ttm/adj-ttm/fy) — เดิม mdesc พิมพ์ "EPS (TTM)" ตายตัวแม้ eps มาจาก override
const EPS_BASIS_LABEL = { 'gaap-ttm': 'EPS (TTM)', 'adj-ttm': 'EPS adj. (TTM)', fy: 'EPS (FY)', ifrs: 'EPS IFRS (TTM)' };
function epsLabel(leg, view) {
  // Plan 4c-prep (D2): ป้ายฐานมาจาก inputs.base — forward/FY พิมพ์ของมันเอง (ไม่ใช่ "EPS ปรับ"/TTM) · baseLabel = ถ้อยคำงวดของผู้เขียน
  const base = leg.inputs && leg.inputs.base;
  if (base === 'epsForward') return `EPS ${leg.baseLabel ? leg.baseLabel + ' ' : ''}(forward)`;
  if (base === 'epsFy') return `EPS ${leg.baseLabel || view.doc.fundamentals.fy.period}`;
  if (leg.override && leg.override.eps != null) return 'EPS ปรับ';
  const basis = view.doc.fundamentals.epsBasis;
  // ไม่เดา: ฐานที่ไม่รู้จัก = ข้อมูลผิด (schema บังคับ enum เมื่อมี eps) — fallback เงียบเป็น "EPS (TTM)" จะพิมพ์ฐานผิดให้คนอ่าน
  if (!Object.prototype.hasOwnProperty.call(EPS_BASIS_LABEL, basis)) {
    throw new Error(`fundamentals.epsBasis: ${JSON.stringify(basis)} ไม่รู้จัก (ต้องเป็น ${Object.keys(EPS_BASIS_LABEL).join('/')})`);
  }
  return EPS_BASIS_LABEL[basis];
}
function mdesc(leg, view) {
  // ค่าต่อหุ้นใน mdesc (EPS · BVPS · DPS · D₁) — RV.fmtPerShare: ≥ 1 เดิมทุก byte · < 1 คง 3 หลักมีนัย (HENG EPS ฿0.0158 ไม่ใช่ ฿0.02)
  const m = (v) => view.cur + RV.fmtPerShare(v);
  // Plan 4c-prep (D2): ตัวตั้งตาม inputs.base ผ่าน C.withBase (ตัวเดียวกับ compute) · epsLabel ยังรับ leg เดิม
  const i = leg.inputs, lb = C.withBase(leg, view.doc.fundamentals), b = { ...view.doc.fundamentals, ...(lb.override || {}) };
  const src = i.medianWindow ? ` (มัธยฐาน ${i.medianWindow})` : i.multipleSource ? ` (${SRC_NAME[i.multipleSource]})` : '';
  const rng = i.multipleRange ? ` · กรอบ ${i.multipleRange[0]}–${i.multipleRange[1]}x` : '';
  // R7 — 'current': ตัวคูณสดจากราคาวันนี้ (หน้า v3 build ใหม่จาก JSON ทุกครั้ง จึงไม่ค้าง) · ตัวตั้งเดียวกับ compute (S.CURRENT_BASE + override)
  const live = i.multipleSource === 'current';
  const mult = live ? (view.d.px / b[S.CURRENT_BASE[leg.method]]).toFixed(1) : i.multiple;
  switch (leg.method) {
    case 'pe': return live ? `${epsLabel(leg, view)} ${m(b.eps)} × P/E ปัจจุบัน ${mult}x`
      : `${epsLabel(leg, view)} ${m(b.eps)} × P/E เป้าหมาย ~${mult}x${src}${rng}`;
    case 'pbv': return i.multipleSource != null ? `BVPS ${m(b.bvps)} × P/BV ${live ? 'ปัจจุบัน ' : ''}${mult}x${live ? '' : src}${rng}`
      : `P/BV เหมาะสม = (ROE ${b.roe}% − g ${i.g}%)/(r ${i.r}% − g ${i.g}%) ≈ ${((b.roe - i.g) / (i.r - i.g)).toFixed(2)} × BVPS ${m(b.bvps)}`;
    case 'ddm': return `D₁ = ปันผล ${m(b.dps)} × (1+g); g ${i.g}%, r ${i.r}%`;
    case 'ddm2': return `D₁ ${m(i.d1)} โต ${i.g1}%/ปี ${i.years1} ปี แล้ว ${i.g2}%/ปี · r ${i.r}% · `
      + (i.horizon == null ? 'มูลค่าปลายงวดแบบ Gordon' : `${i.horizon} งวด ไม่มีมูลค่าปลายงวด`);
    // FCF = ยอดงบรวม (fundamentals/override) → สกุลงบ (view.stmtCur) เหมือนการ์ด FCF · ค่าขา (.mval) เป็นสกุลราคา (compute แปลงด้วย fx แล้ว)
    case 'dcf': {
      // Plan 4b Task 2 (§13-3): N-stage พิมพ์ทุกช่วงคั่นด้วย → · 2-stage พิมพ์เหมือนเดิมทุก byte
      const sched = Array.isArray(i.stages) ? i.stages.map((s) => `${s.g}%/ปี ${s.years} ปี`).join(' → ') : `${i.g1}%/ปี ${i.years1} ปี`;
      return `FCF ${RV.fmtBig(b.fcf, view.stmtCur || view.cur)} โต ${sched} · โตถาวร ${i.tg}% · r ${i.r}%`;
    }
    case 'ri': return `BVPS ${m(b.bvps)} · ROE ${b.roe}% vs r ${i.r}% · ${i.years} ปี · payout ${i.payout}%`;
    case 'fcfyield': return `FCF/หุ้น ÷ yield เป้าหมาย ${i.yield}%`;
    case 'declared': return `ค่าประกาศ (${i.basis})` + (i.extrasRef != null ? ' — ดูตารางประกอบ' : '');
    default: return `${leg.method === 'pffo' ? `P/${ffoLabel(view.doc)}` : METHOD_NAME[leg.method]} ${live ? 'ปัจจุบัน ' : ''}${mult}x${live ? '' : src}${rng}`;
  }
}

function extrasHtml(doc, view, after) {
  return doc.extras.filter((x) => x.after === after).map((x) => {
    const pr = (s) => P.renderProse(s, view, { mode: 'v2src' });
    const cell = (c, j) => (typeof c === 'number' ? esc(X.fmtCell(c, x.columns && x.columns[j], view)) : pr(c));
    const ncol = Math.max(x.headers.length, ...x.rows.map((r) => (Array.isArray(r) ? r.length : r.kind === 'total' ? r.cells.length : 1)));
    const head = x.headers.length ? `<tr>${x.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : '';
    const row = (r) => (Array.isArray(r) ? `<tr>${r.map((c, j) => `<td>${cell(c, j)}</td>`).join('')}</tr>`
      : r.kind === 'total' ? `<tr>${r.cells.map((c, j) => `<td><b>${cell(c, j)}</b></td>`).join('')}</tr>`
        : `<tr><td colspan="${ncol}">${pr(r.text)}</td></tr>`);
    let rows = x.rows.map(row).join('');
    if (x.fx) {
      const f = doc.fundamentals, tot = X.tableTotal(x).total;
      rows += `<tr><td colspan="${ncol}">แปลงเป็น ${esc(doc.currency)} ที่ ${esc(f.reportCurrency + doc.currency)} ${f.fx}: <b>${esc(X.fmtMoney(tot * f.fx, view.cur))}</b></td></tr>`;
    }
    const note = x.note ? `<p class="xnote">${pr(x.note)}</p>` : '';
    return `\n  <section>\n    <div class="card"><h3>${esc(x.title)}</h3><table class="xtab">${head}${rows}</table>${note}</div>\n  </section>`;
  }).join('');
}

// หัว §3 + ป้ายกล่อง FV — ruling R6 (valHint: ป้ายกล่องเป็นกลาง ไม่ให้คำที่ generate ขัดกับ hint ของผู้เขียน) · §3.6 C (family) · §3.6 I (ขา context ไม่นับ)
// v2Display.cards[k].op (ใบ migrate): ตัวเลขแรกในข้อความของผู้เขียนเขียนใหม่ที่ราคาปัจจุบัน ทศนิยมเท่าเดิม — กติกาเดียวกับ cron v2 (DV.patchDerived · fixed(price/base, decOf))
function liveCardValue(fz, px) {
  const bases = Array.isArray(fz.base) ? fz.base : [fz.base];
  let k = 0;
  return fz.v.replace(/[0-9][0-9,]*(?:\.[0-9]+)?/g, (n) => {
    if (k >= bases.length) return n;
    const b = bases[k++], want = fz.op === 'basePct' ? b / px * 100 : px / b;
    return want.toFixed(DV.decOfNum(n));
  });
}

// v2Display.gauge (ใบ migrate): สเกลเกจที่ผู้เขียน v2 เลือกเอง (ป้าย/จำนวนช่องต่างจาก template) · ref = ค่าของ view ({{rd:<ref>}}) · text = ป้ายตัวเลขคงที่ของผู้เขียน
//   เรียงจากน้อยไปมากตามค่าปัจจุบันเมื่ออ่านค่าได้ครบทุกช่อง (E26 — ช่อง {{rd:px}} ขยับตามราคา) · อ่านไม่ได้ (เช่น "N/A") = ลำดับของผู้เขียน
const GAUGE_VALUE = { mos30: (d) => d.mos30, mos20: (d) => d.mos20, fv: (d) => d.fv, fvLow: (d) => d.values.fvLow, fvHigh: (d) => d.values.fvHigh,
  analystTgt: (d) => d.values.analystTgt, px: (d) => d.px, sc1tgt: (d) => d.scenarios[0].tgt, sc2tgt: (d) => d.scenarios[1].tgt, sc3tgt: (d) => d.scenarios[2].tgt };
function gaugeScale(ticks, d) {
  const valOf = (t) => { if (t.ref != null) return GAUGE_VALUE[t.ref](d); const m = /[0-9][0-9,]*(?:\.[0-9]+)?/.exec(t.text); return m ? parseFloat(m[0].replace(/,/g, '')) : null; };
  const xs = ticks.map((t, i) => ({ t, i, v: valOf(t) }));
  if (xs.every((x) => typeof x.v === 'number' && Number.isFinite(x.v))) xs.sort((a, b) => a.v - b.v || a.i - b.i);
  return xs.map(({ t }, i, arr) => `<span${i === 0 ? '' : i === arr.length - 1 ? ' style="text-align:right"' : ' style="text-align:center"'}>${t.ref != null ? `{{rd:${t.ref}}}` : esc(t.text)}<br><small>${esc(t.label)}</small></span>`).join('\n          ');
}

// v2Display.rets (ใบ migrate): รูปแบบข้อความ .ret ของผู้เขียน v2 · ตัวเลข % คิดใหม่ทุกครั้งที่ราคาปัจจุบันด้วยกติกาเดียวกับ cron v2
//   (DV.scenarioPlan #7: total = (เป้า [+ ปันผลเมื่อ div] − ราคา)/ราคา · %/ปี จาก total ที่ปัดตามช่องแล้ว · DV.retWrite คงทศนิยม/ขีดลบ/เครื่องหมาย +)
//   · dead-band เดียวกับ cron (DV.retOff/pyOff): ตัวเลขที่ยังอยู่ในเกณฑ์ ไม่เขียนใหม่ — เกินเกณฑ์เมื่อไร เขียนใหม่ทันที (ไม่มีค่าค้าง)
/** token % ของข้อความ .ret → [{t, kind: 'tot'|'totDiv'|'py', v (มีเครื่องหมาย)}] · null = รูปที่เขียนใหม่ไม่ได้
 *  'py' = ป้าย /ปี (DV) หรือ "… % CAGR" · ผลตอบแทนรวมตัวที่สองหลังคำว่าปันผล/div = รวมปันผล ("+57.4% (+4.92 ปันผล = +71%)" · TRI "div −12.4%") */
function v2RetTokens(text) {
  const toks = DV.retTokens(text);
  const out = [];
  let nTot = 0;
  for (const t of toks) {
    const v = (/[-−–]/.test(t.sign || '') ? -1 : 1) * t.val;
    const after = text.slice(t.index + t.len);
    if (t.perYear || /^\s*\)?\s*CAGR/i.test(after)) { out.push({ t, kind: 'py', v }); continue; }
    nTot++;
    if (nTot === 1) { out.push({ t, kind: 'tot', v }); continue; }
    const prev = out.filter((x) => x.kind !== 'py').pop();
    // ตัวที่สองเป็น "รวมปันผล" เมื่อ: คำระหว่างสองตัวพูดถึงปันผล/div · ตัวแรกติดป้ายราคาอย่างเดียว ("(capital)" · "(ราคา)") · ตัวที่สองติดป้าย total/รวม (HLT · TEAMG)
    const between = text.slice(prev.t.index + prev.t.len, t.index), after2 = text.slice(t.index + t.len);
    if (nTot === 2 && (/ปันผล|div/i.test(between) || /^\s*\(?\s*(?:capital|ราคา|price)\b/i.test(between) || /^\s*\(?\s*(?:total|รวม)/i.test(after2))) { out.push({ t, kind: 'totDiv', v }); continue; }
    return null;
  }
  if (!out.length || out.filter((x) => x.kind === 'py').length > 1) return null;
  return out;
}
/** ค่าที่ควรเป็นของแต่ละ token ที่ราคา px (เป้า tgt · ปันผลรวม divCum · div = ผลตอบแทนรวม "tot" รวมปันผลไหม) → [want] · null = คิดไม่ได้ */
function v2RetWants(parts, { tgt, divCum, px, years, div, perYear }) {
  const hasDiv = parts.some((x) => x.kind === 'totDiv');
  if (hasDiv && divCum == null) return null;
  const tot = (tgt + (div && !hasDiv && divCum != null ? divCum : 0) - px) / px * 100;
  const totD = hasDiv ? (tgt + divCum - px) / px * 100 : null;
  const t0 = parts.find((x) => x.kind === 'tot');
  const base = t0 ? parseFloat(tot.toFixed(DV.decOfNum(t0.t.num))) : tot;
  return parts.map((x) => (x.kind === 'tot' ? tot : x.kind === 'totDiv' ? totD : perYear === 'linear' ? base / years : (Math.pow(1 + base / 100, 1 / years) - 1) * 100));
}
function v2Ret(rets, i, view) {
  const text = rets.texts[i];
  const parts = v2RetTokens(text);
  if (!parts) return text;
  const sc = view.scn[i];
  const wants = v2RetWants(parts, { tgt: sc.tgt, divCum: sc.divCum, px: view.d.px, years: view.doc.scenarios.years, div: rets.div, perYear: rets.perYear });
  if (!wants) return text;
  let out = text;
  const edits = parts.map((x, k) => ({ ...x, want: wants[k] })).filter((e) => (e.kind === 'py' ? DV.pyOff(e.v, e.want) : DV.retOff(e.v, e.want)));
  for (const e of edits.sort((a, b) => b.t.index - a.t.index)) { const w = DV.retWrite(e.t, e.want, rets.neg); if (w) out = out.slice(0, e.t.index) + w.text + out.slice(e.t.index + e.t.len); }
  return out;
}

function valHintParts(doc, view) {
  if (doc.text && doc.text.valHint) return { hint: P.renderProse(doc.text.valHint, view, { mode: 'v2src' }), box: 'มูลค่าเหมาะสม (Fair Value)' };
  const fv = view.legs.filter((l) => l.role === 'fv'), nCtx = view.legs.length - fv.length;
  const fams = new Set(fv.map((l) => l.family).filter(Boolean));
  const byFamily = !doc.fvWeights && fams.size > 0;
  const word = byFamily ? 'เฉลี่ยตามตระกูล' : doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย';
  const hint = (byFamily ? `เฉลี่ย ${fams.size} ตระกูล (${fv.length} วิธี)` : `${word} ${fv.length} วิธี`) + (nCtx ? ` · +${nCtx} บริบท` : '');
  return { hint, box: `มูลค่าเหมาะสม${word} (Fair Value)` };
}

function toV2Source(doc, view) {
  const pr = (s) => P.renderProse(s, view, { mode: 'v2src' });
  const T = doc.text || {}; const vh = valHintParts(doc, view);
  const m = doc.meta, d = view.d, s = doc.scenarios, TH = doc.currency === 'THB';
  const vd = C.v2DisplayOf(doc);
  // ลำดับ = S.cardEntries (custom แทรกได้ด้วย "custom:<i>") · tone → class สีเดิม (.v pos|neg|neu) — ไม่มี markup ใน JSON (§3.6 H)
  const noteOf = (k) => doc.metrics.notes && doc.metrics.notes[k];
  // tone 'none' (Plan 4b Task 1) = ไม่มีคลาสสี แม้การ์ดแคตตาล็อกมีค่าตั้งต้น (466 การ์ด v2 ไม่มีคลาส)
  const toneCls = (tone, def) => (tone === 'none' ? '' : tone || def);
  const cards = S.cardEntries(doc.metrics).map((e) => {
    if (e.custom != null) {
      const c = doc.metrics.custom[e.custom];
      return { k: esc(c.label), v: pr(c.value), d: c.note ? pr(c.note) : '', cls: toneCls(e.tone, '') };
    }
    const c = K.renderCard(e.key, view), note = noteOf(e.key);
    // v2Display.cards (ใบ migrate): การ์ดที่ cron v2 ไม่เคยแตะ = ข้อความคงที่ของผู้เขียน — ค่า + บรรทัดล่างตามหน้า v2 (ป้ายยังเป็นของ template)
    //   .d ของ template ไม่พิมพ์ — ฐานที่ template ประกาศ (EPS/BVPS/หุ้น) จะผูกค่าคงที่นี้เข้ากับราคาของ gate (E41/E43/W19/W20) ทั้งที่หน้า v2 ไม่เคยผูก
    const fz = vd && vd.cards && vd.cards[e.key];
    if (fz) return { k: esc(c.k), v: esc(fz.op ? liveCardValue(fz, view.d.px) : fz.v), d: esc(fz.d), cls: toneCls(e.tone, c.cls) };
    return { k: esc(c.k), v: esc(c.v), d: esc(c.d) + (note ? (c.d ? ' · ' : '') + pr(note) : ''), cls: toneCls(e.tone, c.cls) };
  });
  const cardHtml = cards.map((c) => `<div class="metric"><div class="k">${c.k}</div><div class="v${c.cls ? ' ' + c.cls : ''}">${c.v}</div><div class="d">${c.d}</div></div>`).join('\n      ');
  const legsHtml = view.legs.map((l, i) => `<div class="vmethod">
        <div><div class="mname">${i + 1}. ${esc(l.label)}${l.role === 'context' ? ' (บริบท — ไม่นับใน FV)' : ''}</div><div class="mdesc">${esc(mdesc(doc.legs[i], view))}${l.note ? ' — ' + pr(l.note) : ''}</div></div>
        <div class="mval">${esc(view.cur + RV.fmtPrice(l.value))}</div>
      </div>`).join('\n      ');
  // Review Focus #2 — ป้ายเกจเรียงค่าจากน้อยไปมากเสมอ (E26)
  const scale = vd && vd.gauge ? gaugeScale(vd.gauge, d) : [
    { v: d.mos30, tok: '{{rd:mos30}}', lab: 'MOS 30%' }, { v: d.mos20, tok: '{{rd:mos20}}', lab: 'MOS 20%' },
    { v: d.fv, tok: '{{rd:fv}}', lab: 'Fair Value' }, { v: d.values.fvHigh, tok: '{{rd:fvHigh}}', lab: 'กรอบบน FV' },
  ].concat(doc.analyst ? [{ v: doc.analyst.target, tok: '{{rd:analystTgt}}', lab: 'เป้าเฉลี่ย Analyst' }] : [])
    .sort((a, b) => a.v - b.v)
    .map((x, i, arr) => `<span${i === 0 ? '' : i === arr.length - 1 ? ' style="text-align:right"' : ' style="text-align:center"'}>${x.tok}<br><small>${x.lab}</small></span>`).join('\n          ');
  const FFO = ffoLabel(doc);
  // v2Display.driverTotal (ใบ migrate — CPNG/NET): หน้า v2 พิมพ์ตัวตั้งเป็นยอดรวมทั้งบริษัท ⇒ ป้าย "รายได้" + ค่า = ต่อหุ้น × หุ้น (fmtBig)
  const tot = !!(vd && vd.driverTotal) && doc.fundamentals.shares > 0;
  const drv = tot ? { revenuePerShare: 'รายได้', ebitdaPerShare: 'EBITDA', fcfPerShare: 'FCF' }[s.driver]
    : { eps: 'EPS', ffo: FFO, revenuePerShare: 'รายได้/หุ้น', bvps: 'BVPS', fcfPerShare: 'FCF/หุ้น', de: 'DE/หุ้น', fre: 'FRE/หุ้น', ebitdaPerShare: 'EBITDA/หุ้น' }[s.driver];
  const drvAmt = (x) => (tot ? RV.fmtBig(x * doc.fundamentals.shares, view.cur) : view.cur + RV.fmtPerShare(x));
  const ex = { pe: 'P/E', ps: 'P/S', pbv: 'P/BV', pffo: `P/${FFO}`, pfcf: 'P/FCF', evsales: 'EV/Sales', evebitda: 'EV/EBITDA' }[s.exitMetric];
  const col = (i, cls, name) => {
    const sc = view.scn[i];
    // Finding 4 (postreview) — เลขลบใช้ minus glyph U+2212 (ตามธรรมเนียม v2) ไม่ใช่ ASCII hyphen
    const g = sc.growth >= 0 ? `+${sc.growth}` : `−${Math.abs(sc.growth)}`;
    return `<div class="col ${cls}">
        <div class="top"><span>${name}</span><span>${drv} ${g}%/ปี</span></div>
        <div class="body">
          <div class="tgt">{{rd:sc${i + 1}tgt}}</div>
          ${vd && vd.rets ? `<div class="ret {{rd:sc${i + 1}retClass}}">${esc(v2Ret(vd.rets, i, view))}</div>` : `<div class="ret {{rd:sc${i + 1}retClass}}">{{rd:sc${i + 1}ret}}${s.cases[i].retNote ? ' ' + pr(s.cases[i].retNote) : ''}</div>`}
          <ul>
            <li><span>${drv} ปี ${s.years}</span><span>${vd && vd.driverEnds && vd.driverEnds[i] != null ? esc(vd.driverEnds[i]) : `~${esc(drvAmt(sc.driverEnd))}`}</span></li>
            <li><span>${ex} ออก</span><span>${exitText(s, sc.exitMultiple)}x</span></li>${sc.divCum != null ? `
            <li><span>ปันผลรวม ${s.years} ปี</span><span>~{{rd:sc${i + 1}div}}</span></li>` : ''}${sc.desc != null ? `
            <li><span>สถานการณ์</span><span>${pr(sc.desc)}</span></li>` : ''}
          </ul>
        </div>
      </div>`;
  };
  const li = (xs) => xs.map((x) => `<li>${pr(x)}</li>`).join('\n          ');
  const an = doc.analyst;
  // rating/n ที่ไม่ทราบ (null) = ไม่พิมพ์ (Plan 4b Task 1 — 114 ใบ v2 ไม่พิมพ์ rating) · ไม่มีทั้งคู่ = เป้าอย่างเดียว
  const anMeta = an ? [an.rating, an.n != null ? `${an.n} ราย` : null].filter(Boolean).join(' · ') : '';
  const analystCell = an
    ? `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v" style="color:#a5d6a7">~{{rd:analystTgt}}${anMeta ? ` (${esc(anMeta)})` : ''}</div></div>`
    : `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v">ไม่มีข้อมูล</div></div>`;
  const tags = [`${esc(m.exchange)}: ${esc(doc.symbol)}`].concat((m.headerTags || []).map(esc)).map((x) => `<span class="tag">${x}</span>`).join('\n      ');
  const r52 = doc.market.range52w;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>วิเคราะห์หุ้น ${esc(m.company)} (${esc(doc.symbol)}) — Stock Analysis Dashboard</title>
<meta name="ai-model" content="${esc(m.aiModel)}">
<script type="application/json" id="stock-meta">
${jsonScript(JSON.stringify(view.sm))}
</script>
<script type="application/json" id="report-data">
${jsonScript(RV.styledRD(view.rd))}
</script>
<!--TEMPLATE:STYLE-->
</head>
<body>
<div class="wrap">

  <header>
    <div class="gdots">${view.gdots.map(dot).join('')}</div>
    <div>
      ${tags}
    </div>${m.sectorLine ? `\n    <div style="font-size:12.5px;opacity:.85;margin-top:6px">${pr(m.sectorLine)}</div>` : ''}
    <h1>${esc(m.company)} (${esc(doc.symbol)})</h1>
    <div class="sub">${pr(m.sub)}</div>
    <div class="price-row">
      <div>
        <div class="px">{{rd:px}}<small>(${esc(doc.symbol)})</small></div>
      </div>
      <div class="chg">{{rd:chg}}</div>
      <div class="px-meta">
        ราคา ณ {{rd:priceDate}}${m.priceNote ? ` (${pr(m.priceNote)})` : ''}<br>${r52 ? `
        กรอบ 52 สัปดาห์ ${esc(view.cur + RV.fmtPrice(r52.lo))} – ${esc(view.cur + RV.fmtPrice(r52.hi))}<br>` : ''}
        ที่มา: ${m.sources.map(esc).join(', ')}
      </div>
    </div>
  </header>

  <section>
    <div class="s-head"><div class="n">1</div><h2>ข้อมูลสำคัญ (Key Metrics)</h2>${doc.metrics.hint ? `<div class="hint">${pr(doc.metrics.hint)}</div>` : ''}</div>
    <div class="grid g4">
      ${cardHtml}
    </div>${T.metricsNote ? `\n    <p style="font-size:12.5px;color:var(--muted);margin-top:12px;line-height:1.6">${pr(T.metricsNote)}</p>` : ''}
  </section>${extrasHtml(doc, view, 'metrics')}

  <section>
    <div class="s-head"><div class="n">2</div><h2>ราคาย้อนหลัง ~1 ปี</h2><div class="hint">โดยประมาณ${T.chartHint ? ' ' + pr(T.chartHint) : ''}</div></div>
    <div class="card">
      <div class="chart-wrap">
        <svg id="priceChart" viewBox="0 0 920 300" style="width:100%;height:auto"></svg>
      </div>
      <div class="legend">
        <span><i style="background:var(--blue)"></i>ราคา ${esc(doc.symbol)}</span>
        <span><i style="background:#1e8e3e"></i>มูลค่าเหมาะสม {{rd:fv}}</span>
        <span><i style="background:#ea4335;height:8px;width:8px;border-radius:50%"></i>จุดสำคัญ</span>${T.legendNote ? `\n        <span>${pr(T.legendNote)}</span>` : ''}
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:12px;line-height:1.6">
        ${pr(doc.prose.chart)}
      </p>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">3</div><h2>การประเมินมูลค่า (Valuation)</h2><div class="hint">${vh.hint}</div></div>
    <div class="card">
      ${T.valIntro ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.6">${pr(T.valIntro)}</p>\n      ` : ''}${legsHtml}
      <div class="fv-box">
        <div class="l">${vh.box}<br><span style="font-weight:400;font-size:12px;color:var(--muted)">กรอบ {{rd:fvLow}} – {{rd:fvHigh}}</span></div>
        <div class="r">{{rd:fv}}</div>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:12px;line-height:1.6">
        ${pr(doc.prose.valuation)}
      </p>
    </div>
  </section>${extrasHtml(doc, view, 'valuation')}

  <section>
    <div class="s-head"><div class="n">4</div><h2>ราคาปัจจุบัน vs โซนต่างๆ</h2></div>
    <div class="card">
      <div class="gauge">
        <div class="gbar" id="gbar">
          <div class="marker cur" id="mCur"><div class="lab">ปัจจุบัน {{rd:px}}</div></div>
          <div class="marker" id="mFair"><div class="lab" style="background:#067647">เหมาะสม {{rd:fv}}</div></div>
        </div>
        <div class="scale">
          ${scale}
        </div>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:18px;line-height:1.6">
        ${pr(doc.prose.gauge)}
      </p>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">5</div><h2>Margin of Safety (ส่วนเผื่อความปลอดภัย)</h2></div>
    <div class="card">
      <div class="mos-verdict {{rd:mosClass}}">
        <div class="big">{{rd:mos}}</div>
        <div class="txt">${pr(doc.prose.mos)}</div>
      </div>
      <div class="grid g3">
        <div class="metric"><div class="k">จุดซื้อ MOS 20%</div><div class="v pos">{{rd:mos20}}</div><div class="d">โซนน่าสนใจสำหรับ value</div></div>
        <div class="metric"><div class="k">จุดซื้อ MOS 30%</div><div class="v pos">{{rd:mos30}}</div><div class="d">โซนถูกมาก (deep value)</div></div>
        <div class="metric"><div class="k">โซนเริ่มทยอยสะสม</div><div class="v neu">&lt; {{rd:fv}}</div><div class="d">ใกล้/ต่ำกว่ามูลค่าเหมาะสม</div></div>
      </div>
      <div class="calc">
        <label>ลองคำนวณ MOS เอง — ใส่ราคาที่สนใจ (${TH ? 'บาท' : 'USD'})</label>
        <div class="calc-row">
          <input id="pxIn" class="mono" type="number" value="{{rd:pxNum}}" step="${TH ? '0.05' : '0.5'}">
          <div class="calc-out" id="mosOut"></div>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">6</div><h2>คาดการณ์ผลตอบแทน ${s.years} ปี</h2><div class="hint">จากจุดเข้า {{rd:px}}${s.driver === 'eps' ? ' • EPS ฐาน ~{{rd:baseEps}}' : ` • ${drv} ฐาน ~${esc(drvAmt(view.scn[0].driverStart))}`}${s.hintNote ? ' ' + pr(s.hintNote) : ''}{{rd:scnNote}}</div></div>
    <div class="scn">
      ${col(0, 'bear', 'Bear')}
      ${col(1, 'base', 'Base')}
      ${col(2, 'bull', 'Bull')}
    </div>
    <p style="font-size:12.5px;color:var(--muted);margin-top:14px;line-height:1.6;padding:0 4px">
      ${pr(s.note)}
    </p>
  </section>${extrasHtml(doc, view, 'scenarios')}

  <section>
    <div class="s-head"><div class="n">7</div><h2>ปัจจัยบวก & ความเสี่ยง</h2></div>
    <div class="cr">
      <div class="box cat">
        <h3><span class="ic">▲</span>Catalysts — ปัจจัยหนุน</h3>
        <ul>
          ${li(doc.catalysts)}
        </ul>
      </div>
      <div class="box risk">
        <h3><span class="ic">▼</span>Risks — ความเสี่ยง</h3>
        <ul>
          ${li(doc.risks)}
        </ul>
      </div>
    </div>
  </section>${extrasHtml(doc, view, 'catalysts')}

  <section>
    <div class="s-head"><div class="n">8</div><h2>สรุปภาพรวม</h2></div>
    <div class="verdict">
      <h2>${pr(doc.prose.verdictHeadline)}</h2>
      <p>${pr(doc.prose.verdictBody)}</p>
      <div class="vgrid">
        <div class="vcell"><div class="k">มูลค่าเหมาะสม</div><div class="v">{{rd:fv}} <span style="font-size:12px;color:#cab9a8">({{rd:fvLow}}–{{rd:fvHigh}})</span></div></div>
        <div class="vcell"><div class="k">ส่วนต่างจากราคา</div><div class="v {{rd:mosClass}}">MOS ~ {{rd:mos}}</div></div>
        ${analystCell}${((doc.verdict && doc.verdict.extraCells) || []).map((c) => `\n        <div class="vcell"><div class="k">${esc(c.k)}</div><div class="v">${pr(c.v)}</div></div>`).join('')}
      </div>
      <div class="zone">
        <b>กลยุทธ์:</b> ${pr(doc.prose.strategy)}
      </div>
    </div>
  </section>

  <div class="disc">
    <b>คำเตือน:</b> รายงานนี้จัดทำเพื่อการศึกษาและเป็นข้อมูลประกอบการตัดสินใจเท่านั้น <b>ไม่ใช่คำแนะนำให้ซื้อหรือขายหลักทรัพย์</b>
    ตัวเลข valuation อิงสมมติฐานที่อาจคลาดเคลื่อน โดยเฉพาะ${T.disclaimerAssump ? pr(T.disclaimerAssump) : ' P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต'}
    ราคาหุ้นมีความผันผวนสูง ผู้ลงทุนควรศึกษาข้อมูลเพิ่มเติมและพิจารณาความเสี่ยงของตนเองก่อนตัดสินใจ • ${pr(doc.prose.disclaimerSources)}
  </div>
  <footer>Stock Analysis Dashboard • ข้อมูล ณ ${esc(vd && vd.footer ? vd.footer : view.analysisDateText)} • สร้างด้วย stock-analyzer workflow</footer>

</div>

<!--TEMPLATE:ENGINE-->
</body>
</html>
`;
}

module.exports = { toV2Source, mdesc, jsonScript, SRC_NAME, epsLabel, ffoLabel, v2RetTokens, v2RetWants };
