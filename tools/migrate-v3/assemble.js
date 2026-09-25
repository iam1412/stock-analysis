'use strict';
/**
 * assemble.js — parsed v2 (tools/migrate-v3/parse-v2.js) → v3 doc (ไม่เซ็น) + บันทึกการตัดสิน H/D/F (Plan 4b Task 5 · spec §10.1)
 *  H = ต้องให้คนตัดสิน (ห้าม migrate อัตโนมัติ) · D = ตัวเลขที่หน้าเว็บจะเปลี่ยน (ต้องมีคนเห็น) · F = ข้อเท็จจริงของการแปลง (ไม่เปลี่ยนความหมาย)
 *  ★ inputs = ค่าที่ผู้เขียนพิมพ์ · ห้าม back-solve · fundamentals ตั้งให้เสร็จ "ก่อน" แกะขา แล้ว LG.extract บน object เดียวกับที่เขียนลง doc
 *    (override ของ extract เทียบกับ f ที่ส่งเข้าไป) · guardLegs คิดซ้ำทุกขาบน doc.fundamentals สุดท้าย — ไม่ตรง = declared + F
 *  อ่านอย่างเดียว — ไม่เขียนไฟล์ (Task 7 เป็นคนเขียน)
 */
const S = require('../v3/schema.js');
const C = require('../v3/compute.js');
const L = require('../v3/legs.js');
const K = require('../v3/cards.js');
const P3 = require('../v3/prose.js');
const RV = require('../report-values.js');
const PV = require('./parse-v2.js');
const LG = require('./legs.js');
const MC = require('./cards.js');
const MP = require('./prose.js');
const MS = require('./scenarios.js');
const MT = require('./theme.js');

const OVERRIDE_WHY = 'ค่าที่ผู้เขียนใช้ในใบ v2';
const TEMPLATE_ASSUMP = 'P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── meta ──
function pxMetaOf(pxMeta, cur, F) {
  const lines = String(pxMeta || '').split(/<br\s*\/?>/i).map((l) => PV.text(l)).filter(Boolean);
  const out = { sources: [], priceNote: null, range52w: null };
  const notes = [];
  for (const line of lines) {
    const src = /ที่มา\s*:?\s*([\s\S]*)$/.exec(line);
    if (src && !/\{\{rd:priceDate\}\}/.test(line)) {
      out.sources = src[1].split(/\s*(?:\/|,|·|•|\sและ\s)\s*/).map((x) => x.trim()).filter(Boolean);
      const pre = line.slice(0, src.index).trim(); if (pre) notes.push(pre);
      continue;
    }
    const rg = /52/.test(line) && new RegExp('(?:US\\$|\\$|฿)\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(?:[–—/-]|ถึง)\\s*(?:US\\$|\\$|฿)?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)').exec(line);
    if (rg) {
      const lo = parseFloat(rg[1].replace(/,/g, '')), hi = parseFloat(rg[2].replace(/,/g, ''));
      if (lo > 0 && hi >= lo) {
        out.range52w = { lo, hi };
        // คำอื่นในบรรทัดกรอบ 52 สัปดาห์ (split/ADR/เป้า…) → priceNote (ไม่ทิ้ง) · คำที่ template พิมพ์เองอยู่แล้วตัดออก
        const rest = line.replace(rg[0], ' ').replace(/กรอบ|ช่วง|(?:จุด)?(?:ต่ำสุด|สูงสุด)\s*[–-]\s*(?:ต่ำสุด|สูงสุด)|52\s*(?:สัปดาห์|weeks?|wk)|52-?week/gi, ' ')
          .replace(/^[\s():,~•·—–-]+|[\s():,~•·—–-]+$/g, '').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
        if (/[A-Za-z\u0E00-\u0E7F]{2,}|\{\{rd:/.test(rest)) { notes.push(rest.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()); F.push(`px-meta range line words → meta.priceNote: "${rest}"`); }
        continue;
      }
    }
    const pd = /\{\{rd:priceDate\}\}/.exec(line);
    if (pd) {
      const tail = line.slice(pd.index + pd[0].length).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
      const head = line.slice(0, pd.index).replace(/^\s*ราคา\s*(?:≈|ณ|~)?\s*/, '').replace(/[\s≈~]*ณ?\s*$/, '').trim();
      if (head) { notes.push(head.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()); F.push(`px-meta words before the price date → meta.priceNote: "${head}"`); }
      if (tail) notes.push(tail);
      continue;
    }
    notes.push(line.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim());
    F.push(`px-meta line "${line}" → meta.priceNote`);
  }
  if (notes.length) out.priceNote = notes.join(' · ');
  return out;
}

function metaOf(parsed, ctx, H, F) {
  const sym = parsed.sym;
  const m = {};
  const company = PV.text(parsed.h1 || '').replace(new RegExp(`\\s*\\(${esc(sym)}\\)\\s*$`), '').trim();
  m.company = company;
  const tag0 = parsed.tags[0] || '';
  const ex = new RegExp(`^([A-Za-z ]+):\\s*${esc(sym)}$`).exec(tag0);
  if (!ex) H.push(`first header tag not "<EXCH>: ${sym}" ("${tag0}")`);
  m.exchange = ex ? ex[1].trim() : (tag0.split(':')[0] || '').trim() || '?';
  m.sub = MP.htmlToProse(parsed.sub || '');
  const tags = parsed.tags.slice(1).map((x) => x.replace(/[{}<>]/g, '').trim()).filter(Boolean);
  if (tags.length > 3) H.push(`header tags ${tags.length} > 3`);
  m.headerTags = tags.slice(0, 3);
  if (parsed.fd && parsed.fd.iso) m.analysisDate = parsed.fd.iso; else H.push('footer unreadable (no "ข้อมูล ณ" date)');
  if (!parsed.aiModel || !/^Claude\s+[A-Za-z]+\s+\d+(?:\.\d+)?$/.test(parsed.aiModel)) H.push(`ai-model ${JSON.stringify(parsed.aiModel)} missing or not "Claude <family> <version>"`);
  m.aiModel = parsed.aiModel || '';
  const px = pxMetaOf(parsed.pxMeta, null, F);
  if (px.sources.length < 3) H.push(`sources < 3 (${px.sources.length})`);
  if (px.sources.length > 8) F.push(`sources ${px.sources.length} > 8 — kept the first 8`);
  m.sources = px.sources.slice(0, 8);
  if (px.priceNote) m.priceNote = MP.htmlToProse(px.priceNote);
  const th = MT.theme(sym, parsed.rd && parsed.rd.theme, ctx.seeds);
  H.push(...th.H); F.push(...th.F);
  if (th.themeLegacy) m.themeLegacy = th.themeLegacy;
  if (ctx.headUpdated) m.migratedFrom = { updated: ctx.headUpdated, v2Hash: ctx.v2Hash };
  else F.push('no committed manifest row — meta.migratedFrom omitted (build stamps a new updated)');
  return { meta: m, range52w: px.range52w };
}

function marketOf(parsed, range52w) {
  const v = parsed.rd.values, ch = parsed.rd.chart || {};
  const chart = { data: ch.data };
  if (ch.gridFmt != null) chart.gridFmt = ch.gridFmt;
  if (ch.dataFmt != null) chart.dataFmt = ch.dataFmt;
  const mk = { px: v.px, priceDate: v.priceDate, chgSuffix: v.chgSuffix, chart };
  if (range52w) mk.range52w = range52w;
  return mk;
}

// ── fundamentals ──
const VALUE_FUND = ['eps', 'dps', 'bvps', 'shares', 'revenue'];
function fundOf(parsed, cf) {
  const v = parsed.rd.values, f = {}, src = {};
  for (const k of VALUE_FUND) if (isNum(v[k])) { f[k] = v[k]; src[k] = `values.${k}`; }
  for (const [k, x] of Object.entries(cf.fund)) if (f[k] == null && isNum(x)) { f[k] = x; src[k] = cf.src[k]; }
  if (cf.fy) f.fy = cf.fy;
  if (cf.bank) f.bank = cf.bank;
  return { f, src };
}
const epsBasisOf = (label, region) => (/adj|normali[sz]ed|ปรับ/i.test(label || '') ? 'adj-ttm' : region === 'TH' ? 'ifrs' : 'gaap-ttm');

// ── legs ──
const CONTEXT_RE = LG.CONTEXT_RE;
const MULT_METHODS = ['pe', 'ps', 'evsales', 'evebitda', 'pfcf', 'pffo', 'pbv'];
function multipleSourceOf(mdesc, F, i) {
  const t = String(mdesc);
  const has5 = /(?<![0-9])5\s*ปี|5[-\s]*(?:year|yr)/i.test(t);
  if (/(?<![0-9])10\s*ปี|10[-\s]*(?:year|yr)/i.test(t) && !has5) return 'median10y';
  if (/เฉลี่ย|มัธยฐาน|median|average/i.test(t) || has5) return 'median5y';
  if (/peer|กลุ่ม|เทียบ/i.test(t)) return 'peer';
  if (/เซกเตอร์|sector|อุตสาหกรรม/i.test(t)) return 'sector';
  F.push(`leg ${i + 1}: multipleSource assumed peer`);
  return 'peer';
}
/** mdesc ส่วนที่ extractor ไม่ได้ใช้ (qualifier · Task 0 G): หางหลัง " — " + วงเล็บที่เป็นคำ (ไม่ใช่สูตร) */
function qualifierOf(prose) {
  const t = String(prose || '');
  const dash = /\s[—–]\s/.exec(t);
  const head = dash ? t.slice(0, dash.index) : t, tail = dash ? t.slice(dash.index + dash[0].length).trim() : '';
  const par = [...head.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim())
    .filter((x) => /[A-Za-z฀-๿]{2,}/.test(x) && !/[%×=]|\br\b|\bg\b/.test(x)
      && !/^~?\s*[0-9][0-9.,]*\s*(?:ปี|years?|yrs?|x|เท่า|เดือน|months?)?\s*$/i.test(x));   // "(5 ปี)" = input ที่ extractor ใช้แล้ว
  return par.concat(tail ? [tail] : []).join(' · ');
}
const labelOf = (mname) => String(mname).replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\s*\(?\s*บริบท[^)]*\)?\s*$/, '').replace(/[{}<>]/g, '').trim();

/** ขาทั้งหมดบน f (object เดียวกับ doc.fundamentals + currency/rps ที่ legValue ไม่อ่าน) → { legs, meta, epsBase, H, F } */
function legsOf(parsed, fund, currency) {
  const H = [], F = [], legs = [], meta = [];
  const f = { ...fund, currency };
  if (isNum(fund.revenue) && isNum(fund.shares) && fund.shares > 0) f.rps = fund.revenue / fund.shares;
  let epsBase = null;
  parsed.legs.forEach((pl, i) => {
    const n = i + 1;
    if (pl.empty) { H.push(`leg ${n} unparsed ("${pl.mname}" has no value)`); return; }
    const cls = LG.classifyName(pl.mname, pl.mdesc);
    const ctxLeg = CONTEXT_RE.test(pl.mname);
    const label = labelOf(pl.mname) || `วิธีที่ ${n}`;
    const mdescProse = MP.htmlToProse(pl.mdescHtml);
    const value = LG.mvalNum(pl.mval);
    const lm = { n, cls, mval: pl.mval, mdescHtml: pl.mdescHtml, mnameText: pl.mname, computed: false, why: '' };
    const declared = (basis, why) => {
      if (!(value > 0)) { H.push(`leg ${n}: .mval "${pl.mval}" unreadable — cannot declare`); return null; }
      const leg = { method: 'declared', label, inputs: { value, basis } };
      if (mdescProse) leg.note = mdescProse;
      if (ctxLeg) leg.role = 'context';
      lm.why = why || ''; return leg;
    };
    let leg = null;
    const base = cls.replace(/\?$/, '');
    if (base === 'analyst') {
      if (!ctxLeg) H.push(`leg ${n} analyst target as fv ("${pl.mname}")`);
      leg = declared('other', 'analyst target');
    } else if (base === 'unclassified') {
      leg = declared('other', 'unclassified'); if (leg) F.push(`leg ${n} unclassified → declared`);
    } else if (base.startsWith('declared:')) {
      leg = declared(base.split(':')[1], 'declared basis');
    } else {
      const x = LG.extract(cls, pl.mdesc, pl.mname, pl.mval, f);
      if (x.ok) {
        const method = base === 'pbv:justified' ? 'pbv' : base;
        const inputs = { ...x.inputs };
        if (MULT_METHODS.includes(method) && inputs.multiple != null) inputs.multipleSource = multipleSourceOf(pl.mdesc, F, i);
        leg = { method, label, inputs };
        if (x.override) leg.override = { ...x.override, why: OVERRIDE_WHY };
        const q = qualifierOf(mdescProse); if (q) leg.note = q;
        if (ctxLeg) leg.role = 'context';
        lm.computed = true; lm.why = x.why || '';
        if (method === 'pe' && x.baseKey === 'eps' && epsBase == null) epsBase = { v: x.base, label: pl.mdesc };
      } else {
        leg = declared('other', x.why);
        if (leg) F.push(`leg ${n} ${base} → declared (${[...new Set(String(x.why).split(' · '))].join(' · ')})`);
      }
    }
    if (!leg) return;
    // family (1 ตระกูล 1 เสียง · §3.6 C) — บังคับโดยโครงสร้างก่อน · โซนเทา: declared other/rnpv → rg (F) · fcfyield → market
    const need = S.requiredFamily(leg);
    if (need) leg.family = need;
    else if (leg.role !== 'context') {
      if (leg.method === 'fcfyield') leg.family = 'market';
      else { leg.family = 'rg'; F.push(`leg ${n} declared ${leg.inputs.basis} → family rg (assumed)`); }
    }
    legs.push(leg); meta.push(lm);
  });
  return { legs, meta, epsBase, H, F };
}

/** ชั้นกัน (ruling Task 4 R1-I1): ทุกขาที่คิดได้ต้องคิดซ้ำได้ .mval บน doc.fundamentals สุดท้าย — ไม่ได้ = declared other + F
 *  แก้ doc.legs ในที่ · คืนรายการ F */
function guardLegs(doc, legMeta) {
  const F = [];
  doc.legs.forEach((leg, i) => {
    if (leg.method === 'declared') return;
    const lm = legMeta[i] || {};
    let v = null;
    try { v = L.legValue(leg, doc.fundamentals); } catch (_) { v = null; }
    if (LG.reproduces(v, lm.mval)) return;
    const value = LG.mvalNum(lm.mval);
    const d = { method: 'declared', label: leg.label, inputs: { value, basis: 'other' } };
    const note = MP.htmlToProse(lm.mdescHtml || ''); if (note) d.note = note;
    if (leg.role) d.role = leg.role;
    if (leg.family) d.family = leg.family;
    doc.legs[i] = d; lm.computed = false;
    F.push(`leg ${lm.n || i + 1} ${leg.method}: demoted — no longer reproduces on final fundamentals`);
  });
  return F;
}

// ── น้ำหนัก FV (prototype weightsFit · ผลได้แค่ equal / family / ไม่ตรง) ──
function weightsOf(doc, shownFv, H, D, F) {
  const fvIdx = doc.legs.map((l, i) => (l.role === 'context' ? -1 : i)).filter((i) => i >= 0);
  const vals = fvIdx.map((i) => { try { return L.legValue(doc.legs[i], doc.fundamentals); } catch (_) { return null; } });
  if (!fvIdx.length || vals.some((x) => x == null) || !isNum(shownFv)) return { kind: 'unknown' };
  const tol = Math.max(0.005 * shownFv, 0.01);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const eq = mean(vals);
  const by = {}; fvIdx.forEach((i, k) => { (by[doc.legs[i].family] = by[doc.legs[i].family] || []).push(vals[k]); });
  const fam = mean(Object.values(by).map(mean));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (shownFv < lo - tol || shownFv > hi + tol) H.push(`FV ${shownFv} outside the fv legs [${round2(lo)}, ${round2(hi)}]`);
  if (Math.abs(fam - shownFv) <= tol) return { kind: 'family', fv: fam };
  if (Math.abs(eq - shownFv) <= tol) {
    for (const i of fvIdx) delete doc.legs[i].family;
    F.push('families dropped — equal weights reproduce the shown FV (family weights do not)');
    return { kind: 'equal', fv: eq };
  }
  // ไม่ตรงทั้งสองแบบ — ไม่แก้น้ำหนัก (never solve) · เลือกแบบที่ใกล้ค่าที่พิมพ์กว่า แล้วจด D
  if (Math.abs(eq - shownFv) < Math.abs(fam - shownFv)) { for (const i of fvIdx) delete doc.legs[i].family; D.push(`FV ${shownFv} → ${round2(eq)} (equal weights)`); return { kind: 'unsolvable', fv: eq }; }
  D.push(`FV ${shownFv} → ${round2(fam)} (family weights)`);
  return { kind: 'unsolvable', fv: fam };
}
const round2 = (x) => Math.round(x * 100) / 100;

/** hint หัว §3 ที่ template สร้างเอง (= _template/v3/render.js valHintParts เมื่อไม่มี text.valHint) */
function generatedValHint(doc) {
  const fv = doc.legs.filter((l) => l.role !== 'context'), nCtx = doc.legs.length - fv.length;
  const fams = new Set(fv.map((l) => l.family).filter(Boolean));
  const byFamily = !doc.fvWeights && fams.size > 0;
  const word = byFamily ? 'เฉลี่ยตามตระกูล' : doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย';
  return (byFamily ? `เฉลี่ย ${fams.size} ตระกูล (${fv.length} วิธี)` : `${word} ${fv.length} วิธี`) + (nCtx ? ` · +${nCtx} บริบท` : '');
}

// ── section prose ──
const parasOf = (body) => [...String(body || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({ html: m[1], at: m.index }));
const joinProse = (xs) => xs.map((x) => MP.htmlToProse(x)).filter(Boolean).join('<br>');
function analystOf(parsed) {
  const v = parsed.rd.values;
  if (!isNum(v.analystTgt)) return null;
  const cell = parsed.s8 && parsed.s8.vcells.find(([k]) => /เป้า/.test(k));
  const t = cell ? PV.text(cell[1]) : '';
  const n = /(\d+)\s*ราย/.exec(t);
  const r = /(strong\s+)?(buy|sell|hold|outperform|overweight|neutral|underweight|ซื้อ|ขาย|ถือ)/i.exec(t);
  return { target: v.analystTgt, n: n ? +n[1] : null, rating: r ? r[0] : null, asOf: null };
}
function extrasOf(parsed, H) {
  const out = [];
  for (const s of parsed.extraSecs) {
    const title = PV.text((/<h[23][^>]*>([\s\S]*?)<\/h[23]>/.exec(s.body) || [])[1] || '').replace(/[{}<>]/g, '');
    const tables = s.body.match(/<table\b[\s\S]*?<\/table>/g) || [];
    const rest = PV.text(s.body.replace(/<div class="s-head">[\s\S]*?<\/div>\s*<\/div>|<div class="s-head">[\s\S]*?<\/h2>\s*<\/div>/, '').replace(/<h[23][^>]*>[\s\S]*?<\/h[23]>/g, '').replace(/<table\b[\s\S]*?<\/table>/g, ''));
    if (tables.length !== 1 || rest) { H.push(`extra section not a table ("${title}")`); continue; }
    const tb = tables[0];
    const headers = [...tb.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => PV.text(m[1]).replace(/[{}<>]/g, ''));
    const rows = [...tb.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => {
      const t = PV.text(c[1]);
      return /^[+\-−]?[0-9][0-9,]*(?:\.[0-9]+)?$/.test(t) ? parseFloat(t.replace(/,/g, '').replace('−', '-')) : MP.htmlToProse(c[1]);
    })).filter((r) => r.length);
    out.push({ after: 'valuation', title: title || 'ตารางประกอบ', headers, rows, columns: null });
  }
  if (out.length > 2) { H.push(`extras ${out.length} > 2`); out.length = 2; }
  return out;
}

const pruneUndefined = (x) => {
  if (Array.isArray(x)) return x.map(pruneUndefined);
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) if (v !== undefined) o[k] = pruneUndefined(v); return o; }
  return x;
};

/** ช่อง prose ทั้งหมดของ doc + HTML ต้นทาง (ใช้หา E44 hits) — get/set ตรงที่ */
function proseZones(doc, src) {
  const z = [];
  const add = (field, obj, key, html) => { if (obj && typeof obj[key] === 'string') z.push({ field, obj, key, html: html == null ? obj[key] : html }); };
  add('meta.sub', doc.meta, 'sub', src.sub); add('meta.priceNote', doc.meta, 'priceNote', null);
  add('metrics.hint', doc.metrics, 'hint', src.s1hint);
  for (const k of Object.keys(doc.metrics.notes || {})) add(`metrics.notes.${k}`, doc.metrics.notes, k, src.cardD[k]);
  (doc.metrics.custom || []).forEach((c, i) => add(`metrics.custom[${i}].note`, c, 'note', null));
  for (const k of Object.keys(doc.text || {})) add(`text.${k}`, doc.text, k, src.text[k]);
  // prose.disclaimerSources = อ้างอิงแหล่ง/วันที่ในอดีต — คงเป็น literal เสมอ ไม่ tokenise (fix round 1 · M-2)
  for (const k of Object.keys(doc.prose || {})) if (k !== 'disclaimerSources') add(`prose.${k}`, doc.prose, k, src.prose[k]);
  doc.legs.forEach((l, i) => add(`legs[${i}].note`, l, 'note', src.legs[i]));
  if (doc.scenarios) { (doc.scenarios.cases || []).forEach((c, i) => add(`scenarios.cases[${i}].desc`, c, 'desc', src.scnDesc[i])); add('scenarios.note', doc.scenarios, 'note', src.scnNote); }
  doc.catalysts.forEach((x, i) => add(`catalysts[${i}]`, doc.catalysts, i, src.cat[i]));
  doc.risks.forEach((x, i) => add(`risks[${i}]`, doc.risks, i, src.risk[i]));
  return z;
}

// ── หลัก ──
function assemble(parsed, ctx) {
  const H = [], D = [], F = [];
  ctx = ctx || {};
  if (!parsed.rd || !parsed.rd.values) return { doc: null, notes: { H: ['report-data unreadable'], D, F }, meta: {} };
  const v = parsed.rd.values, sm = parsed.sm || {};
  const currency = sm.currency, region = currency === 'THB' ? 'TH' : 'US';
  const doc = { v: 3, symbol: parsed.sym, currency, region, dateEra: v.dateEra };
  if (parsed.fd && parsed.fd.era && parsed.fd.era !== v.dateEra) H.push(`era mismatch footer ${parsed.fd.era} ≠ values.dateEra ${v.dateEra}`);
  const mo = metaOf(parsed, ctx, H, F);
  doc.meta = mo.meta;

  // fundamentals ก่อนขา (ruling 1) — values ชนะ · การ์ด · แล้ว eps จากฐานขา pe แรกเมื่อยังไม่มี (two-pass)
  const cf = MC.cardFund(parsed, {});
  F.push(...cf.F); if (cf.fyConflict) H.push('fy periods conflict across FY cards');
  // range 52 สัปดาห์: px-meta ก่อน · ไม่มีแล้วการ์ด "52 สัปดาห์" ที่พิมพ์ครบคู่ (ตัวเลขของผู้เขียน · cron เขียนทับตามรอบ)
  let range52w = mo.range52w;
  if (!range52w) {
    const rc = parsed.s1cards.find((c) => MC.keyOf(c.k) === 'range52w');
    const m = rc && /(?:US\$|\$|฿)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*[–—-]\s*(?:US\$|\$|฿)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/.exec(rc.v);
    if (m) { const lo = parseFloat(m[1].replace(/,/g, '')), hi = parseFloat(m[2].replace(/,/g, '')); if (lo > 0 && hi >= lo) { range52w = { lo, hi }; F.push('market.range52w from the 52-week card (px-meta has none)'); } }
  }
  doc.market = marketOf(parsed, range52w);
  const fo = fundOf(parsed, cf);
  let fund = fo.f;
  const srcs = fo.src;
  let pass = legsOf(parsed, fund, currency);
  if (fund.eps == null && pass.epsBase) { fund = { ...fund, eps: pass.epsBase.v }; srcs.eps = 'first pe leg base'; srcs.epsLabel = pass.epsBase.label; }
  if (fund.eps != null) fund.epsBasis = epsBasisOf(srcs.eps === 'first pe leg base' ? srcs.epsLabel : (cf.src.epsLabel || (parsed.legs.find((l) => /P\s*\/\s*E/i.test(l.mname)) || {}).mdesc), region);
  doc.fundamentals = fund;
  pass = legsOf(parsed, doc.fundamentals, currency);   // pass 2 บน object เดียวกับ doc.fundamentals
  H.push(...pass.H); F.push(...pass.F);
  if (parsed.legBlocks > parsed.legs.length) F.push(`${parsed.legBlocks - parsed.legs.length} empty leg shell(s) dropped`);
  doc.legs = pass.legs;
  F.push(...guardLegs(doc, pass.meta));
  doc.fvWeights = null;
  const wk = weightsOf(doc, parsed.rd.fv, H, D, F);
  // gate v3 ที่ assemble เห็นล่วงหน้าได้ (test/check-v3.js): E17 ≥2 ขา fv · E52 ขา declared sotp/nav ต้องมีตาราง extras (v2 ไม่มีตาราง)
  const nFv = doc.legs.filter((l) => l.role !== 'context').length;
  if (nFv < 2) H.push(`fv legs ${nFv} < 2 (E17)`);
  doc.legs.forEach((l, i) => { if (l.method === 'declared' && ['sotp', 'nav'].includes(l.inputs.basis)) H.push(`leg ${i + 1} declared ${l.inputs.basis} has no extras table (E52)`); });

  // metrics (รอบแรกด้วย view เทียม — render check/notes จริงหลัง compute)
  doc.analyst = analystOf(parsed);
  const cardOpts = { currency, market: doc.market, analyst: doc.analyst, legs: doc.legs, force: new Map() };
  const setMetrics = (mc) => {
    let custom = mc.custom, cards = mc.cards;
    mc.overflow = custom.length > 4 ? `custom cards ${custom.length} > 4 — dropped ${custom.slice(4).map((c) => `"${c.label}"`).join(', ')}` : null;
    if (custom.length > 4) {
      const keep = new Set(custom.slice(0, 4).map((_, i) => `custom:${i}`));
      cards = cards.filter((c) => typeof c !== 'string' || !/^custom:/.test(c) || keep.has(c)); custom = custom.slice(0, 4);
    }
    doc.metrics = { cards, custom: custom.length ? custom : undefined, notes: Object.keys(mc.notes).length ? mc.notes : undefined };
    if (parsed.s1hint) doc.metrics.hint = MP.htmlToProse(parsed.s1hint) || undefined;
    return mc;
  };
  let mc = setMetrics(MC.mapCards(parsed, doc.fundamentals, cardOpts));

  const scn = MS.scenarios(parsed, doc.fundamentals, doc.legs);
  H.push(...scn.H); D.push(...scn.D); F.push(...scn.F);
  doc.scenarios = scn.scenarios || undefined;

  // prose / text
  const s2 = parsed.byN[2], s3 = parsed.byN[3], s4 = parsed.byN[4], s5 = parsed.byN[5];
  const firstLeg = s3 ? s3.body.search(/class="vmethod"/) : -1;
  const s3p = s3 ? parasOf(s3.body) : [];
  const before = s3p.filter((p) => firstLeg >= 0 && p.at < firstLeg).map((p) => p.html), after = s3p.filter((p) => firstLeg < 0 || p.at > firstLeg).map((p) => p.html);
  const unknownTok = [];
  const pr = (h) => MP.htmlToProse(h, unknownTok);
  const zone = parsed.s8 && parsed.s8.zone;
  const strategy = zone ? pr(zone).replace(/^\s*(?:[\p{Extended_Pictographic}️‍]\s*)*(?:<b>\s*กลยุทธ์\s*:?\s*<\/b>\s*:?|กลยุทธ์\s*:)\s*/u, '') : '';
  const discP = pr(parsed.disc);
  const volAt = discP.indexOf('ราคาหุ้นมีความผันผวน');
  // แหล่งที่มาต่อท้ายคำเตือน: หลังตัวคั่น (• หรือ ·) ตัวแรกที่ตามประโยค "…ก่อนตัดสินใจ" (template พิมพ์ส่วนหน้าเอง) — ไม่มีประโยคนั้น = ตัวคั่นตัวสุดท้าย
  const decideAt = volAt >= 0 ? discP.indexOf('ก่อนตัดสินใจ', volAt) : -1;
  const sepRe = /[•·]/g; sepRe.lastIndex = decideAt >= 0 ? decideAt : volAt >= 0 ? volAt : 0;
  let sep = sepRe.exec(discP);
  if (!sep && volAt < 0) { const all = [...discP.matchAll(/[•·]/g)]; sep = all[all.length - 1] || null; }
  const disclaimerSources = sep ? discP.slice(sep.index + 1).trim() : '';
  const txtOf = (b) => { const m = /<div class="txt">([\s\S]*?)<\/div>/.exec(b || ''); return m ? m[1] : ''; };
  const proseSrc = {
    chart: s2 ? parasOf(s2.body).map((p) => p.html).join('<br>') : '',
    valuation: after.join('<br>'),
    gauge: s4 ? parasOf(s4.body).map((p) => p.html).join('<br>') : '',
    mos: s5 ? txtOf(s5.body) : '',
    verdictHeadline: parsed.s8 ? parsed.s8.h2 || '' : '', verdictBody: parsed.s8 ? parsed.s8.p || '' : '',
    strategy: zone || '', disclaimerSources: parsed.disc || '',
  };
  doc.prose = {
    chart: s2 ? joinProse(parasOf(s2.body).map((p) => p.html)) : '',
    valuation: joinProse(after), gauge: s4 ? joinProse(parasOf(s4.body).map((p) => p.html)) : '',
    mos: pr(proseSrc.mos), verdictHeadline: pr(proseSrc.verdictHeadline), verdictBody: pr(proseSrc.verdictBody),
    strategy, disclaimerSources,
  };
  for (const [k, x] of Object.entries(doc.prose)) if (!x) H.push(`prose.${k} empty in v2`);
  const text = {};
  const s3hint = parsed.s3hint ? pr(parsed.s3hint) : '';
  let longHint = '';
  if (s3hint && s3hint !== generatedValHint(doc)) {
    // ป้ายหัว §3 ยาวเกิน 80 (schema) — ย้ายทั้งข้อความไปต้น valIntro (คำไม่หาย) แล้วให้ template สร้างป้ายเอง
    if (s3hint.length > 80) { longHint = s3hint; F.push(`valHint ${s3hint.length} chars > 80 — moved to text.valIntro`); } else text.valHint = s3hint;
  }
  if (before.length || longHint) text.valIntro = [longHint, joinProse(before)].filter(Boolean).join('<br>');
  if (parsed.s1paras.length) text.metricsNote = joinProse(parsed.s1paras);
  const assump = volAt >= 0 && discP.indexOf('โดยเฉพาะ') >= 0 && discP.indexOf('โดยเฉพาะ') < volAt ? discP.slice(discP.indexOf('โดยเฉพาะ') + 'โดยเฉพาะ'.length, volAt).trim() : '';
  if (assump && assump !== TEMPLATE_ASSUMP) text.disclaimerAssump = ' ' + assump;
  for (const k of Object.keys(text)) if (!text[k]) delete text[k];
  doc.text = Object.keys(text).length ? text : undefined;
  doc.catalysts = parsed.catalysts.map((x) => pr(x)).filter(Boolean);
  doc.risks = parsed.risks.map((x) => pr(x)).filter(Boolean);
  if (doc.catalysts.length < 3 || doc.catalysts.length > 8) H.push(`catalysts ${doc.catalysts.length} outside 3–8`);
  if (doc.risks.length < 3 || doc.risks.length > 8) H.push(`risks ${doc.risks.length} outside 3–8`);
  doc.extras = extrasOf(parsed, H);

  // ── compute (view) → render check การ์ด · notes จริง · custom ผูกราคา · ราคาเป้าฉาก · tokenise ──
  const order = ['v', 'symbol', 'currency', 'region', 'dateEra', 'meta', 'market', 'fundamentals', 'legs', 'fvWeights', 'metrics', 'scenarios', 'analyst', 'prose', 'text', 'catalysts', 'risks', 'extras'];
  const tidy = () => { const o = {}; for (const k of order) if (doc[k] !== undefined) o[k] = doc[k]; return pruneUndefined(o); };
  let out = tidy();
  let view = null;
  const tryCompute = () => { const errs = S.validate(out); if (errs.length) return { errs }; try { return { view: C.compute(out, { seeds: ctx.seeds }) }; } catch (e) { return { err: e }; } };
  for (let round = 0; round < 4; round++) {
    const r = tryCompute();
    if (!r.view) {
      if (r.errs) for (const e of r.errs.slice(0, 8)) H.push(`schema ${e.path}: ${e.msg}`);
      else H.push(`compute: ${String(r.err && r.err.message).split('\n')[0]}`);
      break;
    }
    // render ทุกการ์ดแคตตาล็อกบน view จริง — ตัวที่ render ไม่ได้ → custom (ข้อความเดิม) แล้วคิดใหม่ · notes ใช้ .d ของ template บน view จริง
    let changed = false;
    for (const m of mc.meta) {
      if (!m.key) continue;
      try { K.renderCard(m.key, r.view); } catch (e) { cardOpts.force.set(m.i, `render: ${String(e.message).split('\n')[0].slice(0, 80)}`); changed = true; }
    }
    cardOpts.view = r.view;
    mc = setMetrics(MC.mapCards(parsed, doc.fundamentals, cardOpts));
    out = tidy();
    if (!changed) { const r2 = tryCompute(); view = r2.view || null; if (!view) H.push(r2.errs ? `schema ${r2.errs[0].path}: ${r2.errs[0].msg}` : `compute: ${String(r2.err.message).split('\n')[0]}`); break; }
  }
  H.push(...mc.H); D.push(...mc.D); F.push(...mc.F);
  if (mc.overflow) H.push(mc.overflow);
  // {{rd:X}} ที่ไม่มีคู่ v3 (htmlToProse ปล่อยค้างไว้) — ทุกช่องข้อความ ไม่ใช่แค่ช่องที่ผ่าน pr()
  const rdLeft = new Set(unknownTok);
  for (const { text: t } of S.stringLeaves(out, '', [])) for (const m of t.matchAll(/\{\{rd:([A-Za-z0-9]+)\}\}/g)) rdLeft.add(m[1]);
  for (const k of rdLeft) H.push(`unknown rd token {{rd:${k}}}`);

  const src = {
    sub: parsed.sub, s1hint: parsed.s1hint,
    cardD: Object.fromEntries(mc.meta.filter((m) => m.key).map((m) => [m.key, parsed.s1cards[m.i].dHtml])),
    // hit ของ E44 ต้องมาจากช่วงต้นทางของช่องนั้นเอง (M-2) — disclaimerAssump = ช่วง "โดยเฉพาะ … ราคาหุ้นมีความผันผวน" ของ disc ดิบ
    text: { valHint: parsed.s3hint, valIntro: [longHint ? parsed.s3hint : '', before.join(' ')].join(' '), metricsNote: parsed.s1paras.join(' '),
      disclaimerAssump: (() => { const d = String(parsed.disc || ''), a = d.indexOf('โดยเฉพาะ'), b = d.indexOf('ราคาหุ้นมีความผันผวน'); return a >= 0 && b > a ? d.slice(a, b) : ''; })() },
    prose: proseSrc, legs: pass.meta.map((m) => m.mdescHtml),
    scnDesc: parsed.s6cols.map((c) => { const li = c.lis.find((x) => /สถานการณ์/.test(x[0])); return li ? li[2] : ''; }),
    scnNote: parsed.s6paras.join(' '), cat: parsed.catalysts, risk: parsed.risks,
  };
  let tokens = 0;
  if (view) {
    D.push(...MS.tgtCheck(parsed, view));
    // custom ที่เป็นค่าผูกราคา (token หรือ literal เท่าค่าที่ render) = แคตตาล็อกที่ขาดข้อมูล — ต้องให้คนตัดสิน
    const pb = P3.priceBound(view);
    const PRICE_TOK = /\{\{(px|fv|mos|mos20|mos30|upside|pe|pbv|ps|yield|mcap|analyst\.target|analyst\.pct|scn\.[a-z]+\.(?:tgt|ret))\}\}/;
    (out.metrics.custom || []).forEach((c) => {
      const lit = MP.CAND.some(({ kind, re }) => { const R = re(); let m; while ((m = R.exec(c.value))) { const l = m[0].trim(); if (pb.some((b) => b.kind === kind && MP.bare(l) === MP.bare(b.shown))) return true; } return false; });
      if (PRICE_TOK.test(c.value) || lit) H.push(`price-bound custom card "${c.label}"`);
    });
    const apxStale = [];
    for (const z of proseZones(out, src)) {
      const hits = z.html ? RV.proseBoundHits(`<p>${z.html}</p>`, view.d) : [];
      const r = MP.tokenise(z.obj[z.key], view, hits, z.field);
      z.obj[z.key] = r.text; D.push(...r.D); tokens += r.n;
      apxStale.push(...MP.staleCopies(r.text, ctx.analysisPx, view.d));
    }
    if (tokens) F.push(`prose literals → tokens ×${tokens}`);
    if (apxStale.length) D.push(`prose stale copies ×${apxStale.length} (${[...new Set(apxStale.map((x) => x.why))].join(',')})`);
    const errs = S.validate(out);
    if (errs.length) for (const e of errs.slice(0, 8)) H.push(`schema(after tokenise) ${e.path}: ${e.msg}`);
    else { try { view = C.compute(out, { seeds: ctx.seeds }); } catch (e) { H.push(`compute(after tokenise): ${String(e.message).split('\n')[0]}`); view = null; } }
  }
  return {
    doc: out, notes: { H, D, F },
    meta: { legs: pass.meta, weights: wk, scn: scn.meta, cards: mc.meta, prose: { tokens }, fundSrc: srcs, computed: !!view, fv: view ? view.fv : null },
  };
}

module.exports = { assemble, guardLegs, extrasOf, legsOf, weightsOf, generatedValHint, pxMetaOf, qualifierOf, labelOf, multipleSourceOf };
