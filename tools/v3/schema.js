'use strict';
/**
 * schema.js — สคีมา report v3 (reports/<SYM>.json) แบบ "ปิด": คีย์ที่ไม่รู้จัก = error เสมอ
 * validate() คืน error ครบทุกข้อในครั้งเดียว พร้อม JSON path (ไม่ all-or-nothing แบบ apply-edits BUG-005)
 * ★ ไม่เก็บค่าที่คำนวณได้ — fv/mos/pe/yield/mcap/ราคาเป้าฉาก/สี gdots ฯลฯ มาจาก compute.js ตอน build
 * spec: docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md §3
 */
const P = require('./prose.js');   // litsOf/malformedLitPaths — prose.js ไม่ require schema.js (ไม่มี cycle)
const SV = require('../safe-values.js');
const ENUM = {
  currency: ['USD', 'THB'], region: ['US', 'TH'], dateEra: ['BE', 'CE'], chgSuffix: ['รอบปี', 'ตั้งแต่ IPO'],
  epsBasis: ['gaap-ttm', 'adj-ttm', 'fy'],
  method: ['pe', 'pbv', 'ps', 'evsales', 'evebitda', 'pfcf', 'fcfyield', 'pffo', 'ddm', 'dcf', 'ri', 'declared'],
  multipleSource: ['median5y', 'median10y', 'peer', 'justified', 'sector'],   // ★ ไม่มี 'current' — สมอตาย (W18) ปิดโดยโครงสร้าง
  declaredBasis: ['sotp', 'nav', 'rnpv', 'other'],
  driver: ['eps', 'ffo', 'revenuePerShare', 'bvps', 'fcfPerShare'],
  exitMetric: ['pe', 'ps', 'pbv', 'pffo', 'pfcf'],
  perYear: ['cagr', 'linear', null],
  extrasAfter: ['metrics', 'valuation', 'scenarios', 'catalysts'],
};
// ต้องตรงกับคีย์ของ CATALOGUE ใน tools/v3/cards.js (test/v3/cards.test.js ตรวจว่าตรงกัน)
// เพิ่ม 6 คีย์ 24 ก.ย. 69 (Task 11 card census — coverage 88.8%→ก่อนเพิ่ม): netDebt/ebitdaMargin/roic/evEbitda/
// peForward/analystTarget — คัดจาก label ที่ตกเป็น custom บ่อยสุดในคลัง 909 ใบ (docs/superpowers/specs/2026-09-24-card-census.md)
const CARD_KEYS = ['mcap', 'pe', 'peAvg5y', 'pbv', 'ps', 'netIncome', 'eps', 'bvps', 'roe', 'revenue', 'grossMargin',
  'netMargin', 'opMargin', 'yield', 'beta', 'range52w', 'fcf', 'debtToEquity',
  'netDebt', 'ebitdaMargin', 'roic', 'evEbitda', 'peForward', 'analystTarget'];
const FUND_KEYS = ['eps', 'epsBasis', 'dps', 'bvps', 'shares', 'revenue', 'netIncome', 'roe', 'roa', 'grossMargin', 'netMargin',
  'opMargin', 'beta', 'debtToEquity', 'fcf', 'ebitda', 'netDebt', 'peAvg5y', 'ffoPerShare', 'roic', 'epsForward'];
const MULT = ['multiple', 'multipleSource'];
const LEG_INPUTS = {
  pe: { req: MULT, opt: [] },
  pbv: { req: [], opt: ['multiple', 'multipleSource', 'g', 'r'] },   // multiple+source หรือ g+r (justified) — ตรวจคู่ด้านล่าง
  ps: { req: MULT, opt: [] }, evsales: { req: MULT, opt: [] }, evebitda: { req: MULT, opt: [] },
  pfcf: { req: MULT, opt: [] }, pffo: { req: MULT, opt: [] },
  fcfyield: { req: ['yield'], opt: [] },
  ddm: { req: ['g', 'r'], opt: [] },
  dcf: { req: ['g1', 'years1', 'tg', 'r', 'rfCurrency'], opt: [] },
  ri: { req: ['r', 'years', 'payout'], opt: [] },
  declared: { req: ['value', 'basis'], opt: ['extrasRef'] },
};
const OVERRIDE_KEYS = ['eps', 'bvps', 'roe', 'dps', 'revenue', 'ebitda', 'fcf', 'netDebt', 'ffoPerShare', 'shares', 'why'];
const THEME_KEYS = ['accent', 'accentDark', 'darkGrad', 'glow', 'subColor', 'headerMuted', 'verdictText', 'vcellLabel'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const AI = /^Claude\s+[A-Za-z]+\s+\d+(?:\.\d+)?$/;   // รูปเดียวกับ E28 / RM.parseAiModel

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

function validate(doc) {
  const errs = [];
  const E = (path, msg) => errs.push({ path, msg });
  const closed = (obj, path, allowed) => { for (const k of Object.keys(obj)) if (!allowed.includes(k)) E(path ? `${path}.${k}` : k, 'คีย์ไม่อยู่ในสคีมา v3'); };
  const num = (v, path, { req = true, min, gt, int } = {}) => {
    if (v == null) { if (req) E(path, 'ต้องมี (ตัวเลข)'); return; }
    if (!isNum(v)) return E(path, `ต้องเป็นตัวเลข — พบ ${JSON.stringify(v)}`);
    if (int && !Number.isInteger(v)) E(path, 'ต้องเป็นจำนวนเต็ม');
    if (gt != null && !(v > gt)) E(path, `ต้อง > ${gt}`);
    if (min != null && !(v >= min)) E(path, `ต้อง ≥ ${min}`);
  };
  const str = (v, path, { req = true, minLen = 1 } = {}) => {
    if (v == null) { if (req) E(path, 'ต้องมี (ข้อความ)'); return; }
    if (typeof v !== 'string' || v.trim().length < minLen) E(path, `ต้องเป็นข้อความยาว ≥${minLen}`);
  };
  const en = (v, path, list) => { if (!list.includes(v)) E(path, `ต้องเป็นหนึ่งใน ${JSON.stringify(list)} — พบ ${JSON.stringify(v)}`); };
  const strList = (v, path, lo, hi) => {
    if (!Array.isArray(v) || v.length < lo || v.length > hi) return E(path, `ต้องเป็น array ของข้อความ ${lo}–${hi} ข้อ`);
    v.forEach((x, i) => str(x, `${path}[${i}]`));
  };

  if (!isObj(doc)) return [{ path: '', msg: 'เอกสารต้องเป็น JSON object' }];
  closed(doc, '', ['v', 'symbol', 'currency', 'region', 'dateEra', 'meta', 'market', 'fundamentals', 'legs', 'fvWeights',
    'metrics', 'scenarios', 'analyst', 'prose', 'catalysts', 'risks', 'extras', '_sig']);
  if (doc.v !== 3) E('v', 'ต้องเป็น 3');
  if (!/^[A-Z0-9][A-Z0-9.\-]*$/.test(doc.symbol || '')) E('symbol', 'ต้องเป็นตัวพิมพ์ใหญ่/ตัวเลข/จุด/ขีด');
  en(doc.currency, 'currency', ENUM.currency);
  en(doc.region, 'region', ENUM.region);   // รหัสตลาด US/TH — ส่วน doc.market คือบล็อกราคาของ cron
  en(doc.dateEra, 'dateEra', ENUM.dateEra);

  // ── meta ──
  const m = doc.meta;
  if (!isObj(m)) E('meta', 'ต้องมี (object)');
  else {
    closed(m, 'meta', ['company', 'exchange', 'sub', 'headerTags', 'analysisDate', 'aiModel', 'sources', 'priceNote', 'themeLegacy', 'litReasons']);
    str(m.company, 'meta.company'); str(m.exchange, 'meta.exchange'); str(m.sub, 'meta.sub', { minLen: 10 });
    if (m.headerTags != null) strList(m.headerTags, 'meta.headerTags', 0, 2);
    if (!ISO.test(m.analysisDate || '')) E('meta.analysisDate', 'ต้องเป็น ISO YYYY-MM-DD (ค.ศ.)');
    if (!AI.test(m.aiModel || '')) E('meta.aiModel', 'ต้องเป็นรูป "Claude <ตระกูล> <เวอร์ชัน>"');
    strList(m.sources, 'meta.sources', 3, 8);
    str(m.priceNote, 'meta.priceNote', { req: false });
    if (m.themeLegacy != null) {
      if (!isObj(m.themeLegacy)) E('meta.themeLegacy', 'ต้องเป็น object หรือ null');
      else {
        closed(m.themeLegacy, 'meta.themeLegacy', THEME_KEYS);
        for (const k of THEME_KEYS) {
          const v = m.themeLegacy[k], p = `meta.themeLegacy.${k}`;
          str(v, p);
          if (typeof v === 'string' && !SV.colorOK(v, k === 'darkGrad')) E(p, `ไม่ใช่ค่าสีที่ allowlist รับ (hex/rgb/hsl/var/named${k === 'darkGrad' ? '/gradient' : ''}) — #50`);
        }
      }
    }
    if (m.litReasons != null) {
      if (!isObj(m.litReasons)) E('meta.litReasons', 'ต้องเป็น object { "<ข้อความใน {{lit:…}}>": "เหตุผล" }');
      else for (const [k, v] of Object.entries(m.litReasons)) str(v, `meta.litReasons[${JSON.stringify(k)}]`, { minLen: 5 });
    }
  }

  // ── market (cron) ──
  const mk = doc.market;
  if (!isObj(mk)) E('market', 'ต้องมี (object)');
  else {
    closed(mk, 'market', ['px', 'priceDate', 'chgSuffix', 'chart', 'range52w']);
    num(mk.px, 'market.px', { gt: 0 });
    if (!ISO.test(mk.priceDate || '')) E('market.priceDate', 'ต้องเป็น ISO YYYY-MM-DD');
    en(mk.chgSuffix, 'market.chgSuffix', ENUM.chgSuffix);
    const c = mk.chart;
    if (!isObj(c)) E('market.chart', 'ต้องมี (object)');
    else {
      closed(c, 'market.chart', ['data', 'gridFmt', 'dataFmt']);
      if (!Array.isArray(c.data) || c.data.length < 2 || c.data.length > 13) E('market.chart.data', 'ต้องเป็น array 2–13 จุด (~1 ปี · E37)');
      else c.data.forEach((p, i) => {
        if (!Array.isArray(p) || p.length !== 2 || !isStr(p[0]) || /[<>]/.test(p[0]) || !isNum(p[1]) || p[1] <= 0) E(`market.chart.data[${i}]`, 'ต้องเป็น ["label", ราคา>0] และ label ห้ามมี < >');
      });
      if (c.gridFmt != null && !(typeof c.gridFmt === 'string' && SV.GRID_FMT_OK.test(c.gridFmt))) E('market.chart.gridFmt', 'ต้องเป็น v / v.toFixed(n) / Math.round(v) เท่านั้น — #50');
      if (c.dataFmt != null && !(typeof c.dataFmt === 'string' && SV.DATA_FMT_OK.test(c.dataFmt))) E('market.chart.dataFmt', 'ต้องเป็น d[1] / d[1].toFixed(n) / Math.round(d[1]) เท่านั้น — #50');
    }
    if (mk.range52w != null) {
      if (!isObj(mk.range52w)) E('market.range52w', 'ต้องเป็น {lo, hi}');
      else { closed(mk.range52w, 'market.range52w', ['lo', 'hi']); num(mk.range52w.lo, 'market.range52w.lo', { gt: 0 }); num(mk.range52w.hi, 'market.range52w.hi', { gt: 0 });
        if (isNum(mk.range52w.lo) && isNum(mk.range52w.hi) && mk.range52w.hi < mk.range52w.lo) E('market.range52w', 'hi ต้อง ≥ lo'); }
    }
  }

  // ── fundamentals ──
  const f = doc.fundamentals;
  if (!isObj(f)) E('fundamentals', 'ต้องมี (object)');
  else {
    closed(f, 'fundamentals', FUND_KEYS);
    for (const k of FUND_KEYS) if (k !== 'epsBasis' && f[k] != null) num(f[k], `fundamentals.${k}`);
    if (f.eps != null) en(f.epsBasis, 'fundamentals.epsBasis', ENUM.epsBasis);
    if (f.shares != null) num(f.shares, 'fundamentals.shares', { min: 1e5 });
  }

  // ── legs ──
  if (!Array.isArray(doc.legs) || doc.legs.length < 2 || doc.legs.length > 4) E('legs', 'ต้องมี 2–4 ขา (E17)');
  else doc.legs.forEach((leg, i) => {
    const p = `legs[${i}]`;
    if (!isObj(leg)) return E(p, 'ต้องเป็น object');
    closed(leg, p, ['method', 'label', 'inputs', 'override', 'note']);
    en(leg.method, `${p}.method`, ENUM.method);
    str(leg.label, `${p}.label`); str(leg.note, `${p}.note`, { req: false });
    const spec = LEG_INPUTS[leg.method];
    if (!spec) return;
    if (!isObj(leg.inputs)) return E(`${p}.inputs`, 'ต้องมี (object)');
    closed(leg.inputs, `${p}.inputs`, spec.req.concat(spec.opt));
    for (const k of spec.req) if (leg.inputs[k] == null) E(`${p}.inputs.${k}`, 'ต้องมี');
    const inp = leg.inputs;
    if (inp.multipleSource != null) en(inp.multipleSource, `${p}.inputs.multipleSource`, ENUM.multipleSource);
    for (const k of ['multiple', 'g', 'r', 'g1', 'tg', 'yield', 'value', 'payout']) if (inp[k] != null) num(inp[k], `${p}.inputs.${k}`);
    for (const k of ['years1', 'years']) if (inp[k] != null) num(inp[k], `${p}.inputs.${k}`, { int: true, min: 1 });
    if (inp.multiple != null && !(inp.multiple > 0)) E(`${p}.inputs.multiple`, 'ต้อง > 0');
    if (leg.method === 'pbv') {
      const mult = inp.multiple != null || inp.multipleSource != null, just = inp.g != null || inp.r != null;
      if (mult === just) E(`${p}.inputs`, 'pbv ใช้ได้ทางเดียว: {multiple, multipleSource} หรือ {g, r} (justified)');
      if (mult && (inp.multiple == null || inp.multipleSource == null)) E(`${p}.inputs`, 'pbv แบบ multiple ต้องมีทั้ง multiple และ multipleSource');
      if (just && (inp.g == null || inp.r == null)) E(`${p}.inputs`, 'pbv แบบ justified ต้องมีทั้ง g และ r');
    }
    if (leg.method === 'dcf' && inp.rfCurrency != null && inp.rfCurrency !== doc.currency) E(`${p}.inputs.rfCurrency`, `rf ต้องสกุลเดียวกับกระแสเงินสด (${doc.currency}) — ชั้น 0`);
    if (leg.method === 'ri' && inp.payout != null && !(inp.payout >= 0 && inp.payout <= 100)) E(`${p}.inputs.payout`, 'ต้อง 0–100 (หน่วยเปอร์เซ็นต์)');
    if (leg.method === 'declared') {
      en(inp.basis, `${p}.inputs.basis`, ENUM.declaredBasis);
      if (inp.value != null && !(inp.value > 0)) E(`${p}.inputs.value`, 'ต้อง > 0');
      if (inp.extrasRef != null) num(inp.extrasRef, `${p}.inputs.extrasRef`, { int: true, min: 0 });
    }
    if (leg.override != null) {
      if (!isObj(leg.override)) E(`${p}.override`, 'ต้องเป็น object');
      else {
        closed(leg.override, `${p}.override`, OVERRIDE_KEYS);
        str(leg.override.why, `${p}.override.why`);
        for (const k of OVERRIDE_KEYS) if (k !== 'why' && leg.override[k] != null) num(leg.override[k], `${p}.override.${k}`);
      }
    }
  });
  if (doc.fvWeights != null) {
    const w = doc.fvWeights;
    if (!Array.isArray(w) || !Array.isArray(doc.legs) || w.length !== doc.legs.length || !w.every((x) => isNum(x) && x >= 0)
      || Math.abs(w.reduce((a, b) => a + b, 0) - 1) > 1e-6) E('fvWeights', 'ต้องเป็น null หรือ array ตัวเลข ≥0 ยาวเท่า legs และรวม = 1');
  }

  // ── metrics ──
  const mt = doc.metrics;
  if (!isObj(mt)) E('metrics', 'ต้องมี (object)');
  else {
    closed(mt, 'metrics', ['cards', 'notes', 'custom', 'hint']);
    if (!Array.isArray(mt.cards) || mt.cards.length < 4 || mt.cards.length > 16) E('metrics.cards', 'ต้องมี 4–16 การ์ด');
    else {
      mt.cards.forEach((k, i) => { if (!CARD_KEYS.includes(k)) E(`metrics.cards[${i}]`, `ไม่อยู่ในแคตตาล็อก (${CARD_KEYS.join(', ')}) — ข้อมูลเฉพาะธุรกิจใช้ metrics.custom`); });
      if (new Set(mt.cards).size !== mt.cards.length) E('metrics.cards', 'การ์ดซ้ำ');
    }
    if (mt.notes != null) {
      if (!isObj(mt.notes)) E('metrics.notes', 'ต้องเป็น object');
      else for (const [k, v] of Object.entries(mt.notes)) { if (!CARD_KEYS.includes(k)) E(`metrics.notes.${k}`, 'ไม่ใช่คีย์การ์ด'); str(v, `metrics.notes.${k}`); }
    }
    if (mt.custom != null) {
      if (!Array.isArray(mt.custom) || mt.custom.length > 4) E('metrics.custom', 'ต้องเป็น array ≤4');
      else mt.custom.forEach((c, i) => { if (!isObj(c)) return E(`metrics.custom[${i}]`, 'ต้องเป็น object'); closed(c, `metrics.custom[${i}]`, ['label', 'value', 'note']); str(c.label, `metrics.custom[${i}].label`); str(c.value, `metrics.custom[${i}].value`); str(c.note, `metrics.custom[${i}].note`, { req: false }); });
    }
    str(mt.hint, 'metrics.hint', { req: false });
  }

  // ── scenarios ──
  const s = doc.scenarios;
  if (!isObj(s)) E('scenarios', 'ต้องมี (object)');
  else {
    closed(s, 'scenarios', ['years', 'divIncluded', 'perYear', 'driver', 'exitMetric', 'baseOverride', 'cases', 'note']);
    num(s.years, 'scenarios.years', { int: true, min: 1 }); if (isNum(s.years) && s.years > 10) E('scenarios.years', 'ต้อง ≤ 10');
    if (typeof s.divIncluded !== 'boolean') E('scenarios.divIncluded', 'ต้องเป็น true/false');
    en(s.perYear === undefined ? '∅' : s.perYear, 'scenarios.perYear', ENUM.perYear);
    en(s.driver, 'scenarios.driver', ENUM.driver); en(s.exitMetric, 'scenarios.exitMetric', ENUM.exitMetric);
    if (s.baseOverride != null) { closed(s.baseOverride, 'scenarios.baseOverride', ['value', 'why']); num(s.baseOverride.value, 'scenarios.baseOverride.value', { gt: 0 }); str(s.baseOverride.why, 'scenarios.baseOverride.why'); }
    if (!Array.isArray(s.cases) || s.cases.length !== 3) E('scenarios.cases', 'ต้องมี 3 ฉากพอดี (Bear/Base/Bull)');
    else s.cases.forEach((c, i) => {
      const p = `scenarios.cases[${i}]`;
      if (!isObj(c)) return E(p, 'ต้องเป็น object');
      closed(c, p, ['growth', 'exitMultiple', 'divCum', 'desc']);
      num(c.growth, `${p}.growth`); num(c.exitMultiple, `${p}.exitMultiple`, { gt: 0 }); str(c.desc, `${p}.desc`);
      // divCum = ปันผลสะสมต่อหุ้นถึงจุดออก — บังคับเมื่อ divIncluded=true (นับรวมใน total%)
      // ยอมให้มี (optional, informational) เมื่อ divIncluded=false ด้วย — คลัง v2 จริง 423/1097 ใบเก็บเลขนี้ไว้
      // แสดงแม้ไม่รวมในผลตอบแทน (parity gate: test/v3/tokens-corpus.test.js) — ไม่รวมใน total% เพราะ derive() v2 อ่าน scnBasis.divIncluded เป็นตัวตัดสินอยู่แล้ว
      if (s.divIncluded) num(c.divCum, `${p}.divCum`, { min: 0 });
      else if (c.divCum != null) num(c.divCum, `${p}.divCum`, { min: 0 });
    });
    str(s.note, 'scenarios.note');
  }

  // ── analyst ──
  if (doc.analyst != null) {
    const a = doc.analyst;
    if (!isObj(a)) E('analyst', 'ต้องเป็น object หรือ null');
    else { closed(a, 'analyst', ['target', 'n', 'rating', 'asOf']); num(a.target, 'analyst.target', { gt: 0 }); num(a.n, 'analyst.n', { int: true, min: 1 });
      str(a.rating, 'analyst.rating'); if (!ISO.test(a.asOf || '')) E('analyst.asOf', 'ต้องเป็น ISO YYYY-MM-DD'); }
  }

  // ── prose / lists / extras ──
  const PROSE_REQ = ['chart', 'valuation', 'gauge', 'mos', 'verdictHeadline', 'verdictBody', 'strategy', 'disclaimerSources'];
  if (!isObj(doc.prose)) E('prose', 'ต้องมี (object)');
  else { closed(doc.prose, 'prose', PROSE_REQ); for (const k of PROSE_REQ) str(doc.prose[k], `prose.${k}`); }
  strList(doc.catalysts, 'catalysts', 3, 8);
  strList(doc.risks, 'risks', 3, 8);
  if (!Array.isArray(doc.extras) || doc.extras.length > 2) E('extras', 'ต้องเป็น array ≤2 ตาราง');
  else doc.extras.forEach((x, i) => {
    const p = `extras[${i}]`;
    if (!isObj(x)) return E(p, 'ต้องเป็น object');
    closed(x, p, ['after', 'title', 'headers', 'rows', 'sumCol', 'note']);
    en(x.after, `${p}.after`, ENUM.extrasAfter); str(x.title, `${p}.title`);
    if (!Array.isArray(x.headers) || !x.headers.every((h) => typeof h === 'string')) E(`${p}.headers`, 'ต้องเป็น array ของข้อความ (ว่างได้ = ตาราง note)');
    if (!Array.isArray(x.rows) || !x.rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === 'string' || isNum(c)))) E(`${p}.rows`, 'ต้องเป็น array ของแถว (cell = ข้อความหรือตัวเลข)');
    if (x.sumCol != null) {
      num(x.sumCol, `${p}.sumCol`, { int: true, min: 0 });
      if (Array.isArray(x.rows) && !x.rows.every((r) => Array.isArray(r) && isNum(r[x.sumCol]))) E(`${p}.sumCol`, 'คอลัมน์ผลรวมต้องเป็นตัวเลขทุกแถว');
    }
    str(x.note, `${p}.note`, { req: false });
  });
  // {{lit:…}} ↔ meta.litReasons (spec §4 ข้อ 4 · #51 · ruling R1) — 1 คีย์ต่อ 1 ข้อความ ใช้ได้หลายจุด
  for (const p of P.malformedLitPaths(doc)) E(p, '{{lit:…}} ไม่ครบรูป — ห้ามซ้อน token/วงเล็บปีกกา และต้องปิดด้วย }}');
  const reasons = isObj(doc.meta) && isObj(doc.meta.litReasons) ? doc.meta.litReasons : {};
  const lits = P.litsOf(doc);
  for (const l of lits) if (!Object.prototype.hasOwnProperty.call(reasons, l.text)) E(l.path, `{{lit:${l.text}}} ต้องมีเหตุผลใน meta.litReasons[${JSON.stringify(l.text)}]`);
  const used = new Set(lits.map((l) => l.text));
  for (const k of Object.keys(reasons)) if (!used.has(k)) E(`meta.litReasons[${JSON.stringify(k)}]`, 'ไม่มี {{lit:…}} ที่ใช้เหตุผลนี้ — ลบออก');
  if (doc._sig != null && !/^sha256:[0-9a-f]{64}$/.test(doc._sig)) E('_sig', 'รูปลายเซ็นไม่ถูกต้อง');

  return errs;
}

// path → เจ้าของ: 'cron' เขียนได้เฉพาะ market.* · 'io' = _sig · ที่เหลือ worker (ผ่าน report.js save)
function OWNER(path) {
  if (path === '_sig') return 'io';
  if (path === 'market' || path.startsWith('market.')) return 'cron';
  return 'worker';
}

module.exports = { ENUM, CARD_KEYS, FUND_KEYS, LEG_INPUTS, OVERRIDE_KEYS, THEME_KEYS, validate, OWNER };
