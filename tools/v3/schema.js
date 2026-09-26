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
  epsBasis: ['gaap-ttm', 'adj-ttm', 'fy', 'ifrs'],
  ffoBasis: ['ffo', 'affo', 'coreFfo'],   // Plan 2a Task 9 (§3.6 J) — ป้าย FFO/AFFO ของการ์ด/ขา/ฉาก REIT · + coreFfo (Plan 4c-prep spec §3.7 ก): Core FFO ≠ FFO ≠ AFFO — ข้อเท็จจริงคนละตัว
  reportCurrency: ['USD', 'THB', 'EUR', 'CAD', 'GBP', 'JPY', 'CHF', 'TWD'],   // Plan 2a Task 10 (§3.6 L) — สกุลงบ (ยอดรวมทั้งบริษัท)
  method: ['pe', 'pbv', 'ps', 'evsales', 'evebitda', 'pfcf', 'fcfyield', 'pffo', 'ddm', 'ddm2', 'dcf', 'ri', 'declared'],
  multipleSource: ['median5y', 'median10y', 'peer', 'justified', 'sector', 'current', 'author'],   // 'current' = เฉพาะขา role:"context" (ตัวคูณสด คิดทุกวัน) · บนขา fv ห้าม = สมอตาย W18 (§13 ข้อ 6)
  // 'author' = ตัวคูณที่ผู้วิเคราะห์กำหนดเอง (ไม่ใช่มัธยฐาน/peer/sector) — migrator ใช้เมื่อ mdesc ไม่ได้บอกว่าตัวคูณคือมัธยฐาน (Plan 4b Task 6b)
  declaredBasis: ['sotp', 'nav', 'rnpv', 'other'],
  // Plan 4b Task 1 (spec §10 "ช่องว่าง schema" · §3.3): driver de/fre (alt managers) · exitMetric evsales · tone 'none' = ไม่มีคลาสสี (466 การ์ด v2)
  driver: ['eps', 'ffo', 'revenuePerShare', 'bvps', 'fcfPerShare', 'de', 'fre', 'ebitdaPerShare'],   // + ebitdaPerShare (Plan 4c-prep)
  exitMetric: ['pe', 'ps', 'pbv', 'pffo', 'pfcf', 'evsales', 'evebitda'],   // + evebitda (Plan 4c-prep · สูตรเดียวกับ evsales)
  legBase: ['eps', 'epsForward', 'epsFy'],   // Plan 4c-prep: ตัวตั้งของขา pe = input ของการคำนวณ (compute.withBase) ไม่ใช่ป้าย
  perYear: ['cagr', 'linear', null],
  extrasAfter: ['metrics', 'valuation', 'scenarios', 'catalysts'],
  colUnit: ['none', 'pct', 'x', 'ccy'],
  tone: ['pos', 'neg', 'neu', 'none'],
  role: ['fv', 'context'], family: ['market', 'rg', 'asset'],
};
// ต้องตรงกับคีย์ของ CATALOGUE ใน tools/v3/cards.js (test/v3/cards.test.js ตรวจว่าตรงกัน)
// เพิ่ม 6 คีย์ 24 ก.ย. 69 (Task 11 card census — coverage 88.8%→ก่อนเพิ่ม): netDebt/ebitdaMargin/roic/evEbitda/
// peForward/analystTarget — คัดจาก label ที่ตกเป็น custom บ่อยสุดในคลัง 909 ใบ (docs/superpowers/specs/2026-09-24-card-census.md)
const CARD_KEYS = ['mcap', 'pe', 'peAvg5y', 'pbv', 'ps', 'netIncome', 'eps', 'bvps', 'roe', 'revenue', 'grossMargin',
  'netMargin', 'opMargin', 'yield', 'beta', 'range52w', 'fcf', 'debtToEquity',
  'netDebt', 'ebitdaMargin', 'roic', 'evEbitda', 'peForward', 'analystTarget',
  'netIncomeFy', 'epsFy', 'revenueFy', 'nim', 'npl', 'capital',   // + Plan 2a Task 8 (§3.6 B/K)
  'pffo', 'pffoForward', 'ffoPerShare', 'pffoAvg5y', 'ffoMargin', 'ffoPayout',   // + Plan 2a Task 9 (§3.6 J)
  'occupancy', 'netDebtEbitda', 'backlog', 'payout', 'aum', 'ptbv'];   // + Plan 4b Task 1 (Task 0 Q3 top unmapped labels)
const FUND_NUM = ['eps', 'dps', 'bvps', 'shares', 'revenue', 'netIncome', 'roe', 'roa', 'grossMargin', 'netMargin',
  'opMargin', 'beta', 'debtToEquity', 'fcf', 'ebitda', 'netDebt', 'peAvg5y', 'ffoPerShare', 'roic', 'epsForward', 'pffoAvg5y', 'fx',
  'occupancy', 'backlog', 'aum', 'tbvps', 'dePerShare', 'frePerShare'];   // + Plan 4b Task 1
const FUND_KEYS = FUND_NUM.concat(['epsBasis', 'fy', 'bank', 'ffoBasis', 'ffoForward', 'reportCurrency']);
const FY_KEYS = ['period', 'netIncome', 'eps', 'revenue'];
const BANK_KEYS = ['nim', 'npl', 'coverage', 'cet1', 'car'];
const MULT = ['multiple', 'multipleSource'];
const RANGE = ['multipleRange', 'medianWindow'];   // §3.6 F — กรอบความไวของตัวคูณ [lo, hi] → กรอบ FV · §3.6 G — ช่วงปีของมัธยฐาน (ขาตัวคูณเดียวกัน)
const LEG_INPUTS = {
  pe: { req: MULT, opt: RANGE.concat(['base']) },   // base = Plan 4c-prep (D2) ตัวตั้ง eps | epsForward | epsFy
  pbv: { req: [], opt: ['multiple', 'multipleSource', 'g', 'r'].concat(RANGE) },   // multiple+source หรือ g+r (justified) — ตรวจคู่ด้านล่าง
  ps: { req: MULT, opt: RANGE }, evsales: { req: MULT, opt: RANGE }, evebitda: { req: MULT, opt: RANGE },
  pfcf: { req: MULT, opt: RANGE }, pffo: { req: MULT, opt: RANGE },
  fcfyield: { req: ['yield'], opt: [] },
  ddm: { req: ['g', 'r'], opt: [] },
  ddm2: { req: ['d1', 'g1', 'years1', 'g2', 'r'], opt: ['horizon'] },   // §3.6 N — horizon: int ≥1 | null (null = Gordon ปลายช่วง 1) ต้องมีคีย์เสมอ
  dcf: { req: ['tg', 'r', 'rfCurrency'], opt: ['g1', 'years1', 'stages'] },   // Plan 4b Task 2 (§13-3): {g1, years1} 2-stage หรือ {stages} N-stage — ทางใดทางหนึ่ง (ตรวจใน legs loop)
  ri: { req: ['r', 'years', 'payout'], opt: [] },
  declared: { req: ['value', 'basis'], opt: ['extrasRef'] },
};
// family ที่ method บังคับโดยโครงสร้าง (§3.6 C · final review 24 ก.ย. 69) — ขาที่รับ (r,g) เป็น input = 'rg' · declared sotp/nav = 'asset'
// ขาตัวคูณ (มี multipleSource): 'justified' (สร้างจาก r,g) = 'rg' · อื่น ๆ รวม 'current' = 'market' (ruling ปิดโซนเทา)
// null = โซนเทา ผู้เขียนเลือกเอง (declared rnpv/other · fcfyield) · check-v3 W32 ใช้ตัวเดียวกันเดาตระกูลเมื่อไม่เขียน family
const RG_METHODS = ['ddm', 'ddm2', 'dcf', 'ri'];
function requiredFamily(leg) {
  if (!isObj(leg)) return null;
  const inp = isObj(leg && leg.inputs) ? leg.inputs : {};
  if (RG_METHODS.includes(leg.method) || (leg.method === 'pbv' && (inp.g != null || inp.r != null))) return 'rg';
  if (leg.method === 'declared' && ['sotp', 'nav'].includes(inp.basis)) return 'asset';
  if (inp.multipleSource != null && LEG_INPUTS[leg.method] && LEG_INPUTS[leg.method].req.concat(LEG_INPUTS[leg.method].opt).includes('multipleSource'))
    return inp.multipleSource === 'justified' ? 'rg' : 'market';
  return null;
}
// ตัวตั้งต่อหุ้นของขาที่ใช้ตัวคูณสด (multipleSource 'current') — compute ใช้หาตัวคูณสด · check-v3 ใช้เป็นฐาน W18
const CURRENT_BASE = { pe: 'eps', pbv: 'bvps', pffo: 'ffoPerShare' };
const OVERRIDE_KEYS = ['eps', 'bvps', 'roe', 'dps', 'revenue', 'ebitda', 'fcf', 'netDebt', 'ffoPerShare', 'shares', 'epsForward', 'why'];   // epsForward = Plan 4c-prep (คู่ inputs.base 'epsForward')
// ป้าย FFO ชุดเดียวของ render / cards.js / check-v3.js (Plan 4c-prep)
const FFO_LABEL = { ffo: 'FFO', affo: 'AFFO', coreFfo: 'Core FFO' };
const THEME_KEYS = ['accent', 'accentDark', 'darkGrad', 'glow', 'subColor', 'headerMuted', 'verdictText', 'vcellLabel'];
const TEXT_KEYS = ['valHint', 'valIntro', 'metricsNote', 'disclaimerAssump', 'chartHint', 'legendNote'];   // §3.6 A — แทนข้อความตายตัวของ template · chartHint = ต่อท้ายป้าย §2 (Plan 4b Task 6b)
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const AI = /^Claude\s+[A-Za-z]+\s+\d+(?:\.\d+)?$/;   // รูปเดียวกับ E28 / RM.parseAiModel

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

// เพดาน custom card (spec §3.7 ง · Plan 4c-prep D5): ใบ migrate (meta.migratedFrom) = 8 — ครอบ 97/102 ใบที่ชนเพดาน 4 · ใบ NEW = 4 เท่าเดิม
// ทางย้อนกลับ: ลดค่านี้ ใบที่เกินกลับเป็น HUMAN ใน sweep
const CUSTOM_CAP_MIGRATED = 8, CUSTOM_CAP = 4;
const isMigrated = (doc) => isObj(doc) && isObj(doc.meta) && doc.meta.migratedFrom != null;
const customCap = (doc) => (isMigrated(doc) ? CUSTOM_CAP_MIGRATED : CUSTOM_CAP);
// Plan 4c-transcribe (measured on the 447 HUMAN drafts — spec §10 "4c-transcribe"): allowances ของใบ migrate เท่านั้น (meta.migratedFrom) · ใบ NEW เท่าเดิม
//   sources ≥ 2: หน้า v2 ระบุแหล่ง 2 แหล่ง (v2 cross-verify ≥ 2) ไม่มีแหล่งที่ 3 ให้ถอดความ (FISV)
//   scenarios.cases[i].desc ไม่มีได้: คอลัมน์ v2 ไม่มีแถว "สถานการณ์" (DHR · EQIX Bull) — render ไม่พิมพ์แถวว่าง · สตริงว่างยังผิด
const SOURCES_MIN = 3, SOURCES_MIN_MIGRATED = 2;

// metrics.cards[i]: "key" | "custom:<i>" | {key, tone} → ลำดับที่ render · custom ที่ไม่ถูกอ้างต่อท้าย (พฤติกรรม Plan 1)
const CUSTOM_REF = /^custom:(\d)$/;
function cardEntries(mt) {
  const out = [], used = new Set(), custom = Array.isArray(mt.custom) ? mt.custom : [];
  const toneOf = (c) => (c && c.tone) || null;
  for (const c of mt.cards || []) {
    if (typeof c === 'string' && CUSTOM_REF.test(c)) { const i = +c.match(CUSTOM_REF)[1]; used.add(i); out.push({ key: null, custom: i, tone: toneOf(custom[i]) }); }
    else if (typeof c === 'string') out.push({ key: c, custom: null, tone: null });
    else out.push({ key: c && c.key, custom: null, tone: (c && c.tone) || null });
  }
  custom.forEach((c, i) => { if (!used.has(i)) out.push({ key: null, custom: i, tone: toneOf(c) }); });
  return out;
}

// ── ทุกช่องข้อความของใบ (Plan 2b · spec §3 หมายเหตุ token · §9 E51 ขยาย · rulings R3/R4) ──
// (1) {{rd:…}} = ไวยากรณ์ของใบ v2 — ใบ v3 ใช้ token ของ view ({{px}} {{fv}} {{mos}} {{leg1}} …) · วันนี้ render ได้ผ่าน expandReport
//     ของ v2 แต่จะรั่วเป็นวงเล็บดิบเมื่อ P7 ลบทาง v2 (วัดแล้ว — finding M3)
// (2) sentinel "TODO" ที่ report.js init วางในช่องดุลพินิจ — ช่องข้อความ **และ** ช่องตัวเลขที่ยังเป็นสตริง "TODO…" = ยังไม่ได้เติม
//     (str() รับ "TODO" และ E13 ของ v2 ไม่จับ) · คำว่า TODO กลางประโยคไม่ใช่ sentinel
const RD_TOKEN = '{{rd:';
const TODO_RE = /^\s*TODO\b/;
/** [{path, text}] ของทุก string ในโครง (JSON path แบบเดียวกับ error อื่น: a.b[0].c) */
function stringLeaves(x, p, out) {
  if (typeof x === 'string') out.push({ path: p, text: x });
  else if (Array.isArray(x)) x.forEach((v, i) => stringLeaves(v, `${p}[${i}]`, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) stringLeaves(v, p ? `${p}.${k}` : k, out);
  return out;
}

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
  // ช่องข้อความสั้นที่ render ตรง ไม่ผ่าน token/sanitize ของ prose — ห้ามมี { } < > (กัน token ปลอม/แท็กหลุดเข้าหน้า)
  const plain = (v, path) => { if (typeof v === 'string' && /[{}<>]/.test(v)) E(path, 'ห้ามมี { } < > — ช่องนี้เป็นป้ายสั้น ไม่รับ token/แท็ก'); };
  // Plan 4b Task 6b — ป้ายสั้นที่ต่อท้าย template (chartHint · hintNote · retNote): prose (token ได้ · ผ่าน renderProse) แต่ห้ามมีแท็ก < >
  const noTag = (v, path) => { if (typeof v === 'string' && /[<>]/.test(v)) E(path, 'ห้ามมี < > — ป้ายสั้นต่อท้าย template (token {{…}} ได้ · แท็กไม่ได้)'); };
  const en = (v, path, list) => { if (!list.includes(v)) E(path, `ต้องเป็นหนึ่งใน ${JSON.stringify(list)} — พบ ${JSON.stringify(v)}`); };
  const strList = (v, path, lo, hi) => {
    if (!Array.isArray(v) || v.length < lo || v.length > hi) return E(path, `ต้องเป็น array ของข้อความ ${lo}–${hi} ข้อ`);
    v.forEach((x, i) => str(x, `${path}[${i}]`));
  };

  if (!isObj(doc)) return [{ path: '', msg: 'เอกสารต้องเป็น JSON object' }];
  closed(doc, '', ['v', 'symbol', 'currency', 'region', 'dateEra', 'meta', 'market', 'fundamentals', 'legs', 'fvWeights',
    'metrics', 'scenarios', 'analyst', 'verdict', 'prose', 'text', 'catalysts', 'risks', 'extras', 'v2Display', '_sig']);
  if (doc.v !== 3) E('v', 'ต้องเป็น 3');
  if (!/^[A-Z0-9][A-Z0-9.\-]*$/.test(doc.symbol || '')) E('symbol', 'ต้องเป็นตัวพิมพ์ใหญ่/ตัวเลข/จุด/ขีด');
  en(doc.currency, 'currency', ENUM.currency);
  en(doc.region, 'region', ENUM.region);   // รหัสตลาด US/TH — ส่วน doc.market คือบล็อกราคาของ cron
  en(doc.dateEra, 'dateEra', ENUM.dateEra);

  // ── meta ──
  const m = doc.meta;
  if (!isObj(m)) E('meta', 'ต้องมี (object)');
  else {
    closed(m, 'meta', ['company', 'exchange', 'sub', 'headerTags', 'analysisDate', 'aiModel', 'sources', 'priceNote', 'sectorLine', 'themeLegacy', 'litReasons', 'migratedFrom']);
    str(m.company, 'meta.company'); str(m.exchange, 'meta.exchange'); str(m.sub, 'meta.sub', { minLen: 10 });
    if (m.headerTags != null) strList(m.headerTags, 'meta.headerTags', 0, 3);   // ≤ 3 (Plan 4b Task 1 — ADR/dual listing)
    if (!ISO.test(m.analysisDate || '')) E('meta.analysisDate', 'ต้องเป็น ISO YYYY-MM-DD (ค.ศ.)');
    if (!AI.test(m.aiModel || '')) E('meta.aiModel', 'ต้องเป็นรูป "Claude <ตระกูล> <เวอร์ชัน>"');
    strList(m.sources, 'meta.sources', isMigrated(doc) ? SOURCES_MIN_MIGRATED : SOURCES_MIN, 8);
    str(m.priceNote, 'meta.priceNote', { req: false });
    // Plan 4c-prep (spec §3.7 ข · D3): คำที่ผู้เขียนพิมพ์ในจุด gdots ของ header (v2 แสดงจริง) — บรรทัดเล็กใต้ tags
    if (m.sectorLine != null) { str(m.sectorLine, 'meta.sectorLine'); noTag(m.sectorLine, 'meta.sectorLine'); if (typeof m.sectorLine === 'string' && m.sectorLine.length > 100) E('meta.sectorLine', 'ยาวเกิน 100 ตัวอักษร'); }
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
    // Plan 4b (spec §8 · D1): ที่มาของใบที่ migrate — build คง reports.json.updated เดิมเมื่อแถว manifest ยังถือ hash v2 · เขียนครั้งเดียวโดย migrator
    if (m.migratedFrom != null) {
      if (!isObj(m.migratedFrom)) E('meta.migratedFrom', 'ต้องเป็น object {updated, v2Hash}');
      else {
        closed(m.migratedFrom, 'meta.migratedFrom', ['updated', 'v2Hash', 'prevHash']);
        // prevHash (display-fix · remigrate): freshHash ของใบ migrate ที่ใบนี้มาแทน (= hash ในแถว manifest ที่ commit แล้ว) — build คง updated ของ v2 ไว้ (ไม่ใช่งานวิเคราะห์ใหม่)
        if (m.migratedFrom.prevHash != null && !/^[0-9a-f]{12}$/.test(m.migratedFrom.prevHash)) E('meta.migratedFrom.prevHash', 'ต้องเป็น freshHash ของใบ v3 ที่ถูกแทน (hex 12 ตัว)');
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(m.migratedFrom.updated || '')) E('meta.migratedFrom.updated', 'ต้องเป็น ISO datetime ของ reports.json (YYYY-MM-DDTHH:mm:ss+07:00)');
        if (!/^[0-9a-f]{12}$/.test(m.migratedFrom.v2Hash || '')) E('meta.migratedFrom.v2Hash', 'ต้องเป็น freshHash ของใบ v2 (hex 12 ตัว)');
      }
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
    for (const k of FUND_NUM) if (f[k] != null) num(f[k], `fundamentals.${k}`);
    if (f.fy != null) {
      if (!isObj(f.fy)) E('fundamentals.fy', 'ต้องเป็น object {period, netIncome?, eps?, revenue?}');
      else {
        closed(f.fy, 'fundamentals.fy', FY_KEYS);
        str(f.fy.period, 'fundamentals.fy.period'); plain(f.fy.period, 'fundamentals.fy.period');
        if (typeof f.fy.period === 'string' && f.fy.period.length > 20) E('fundamentals.fy.period', 'ยาวเกิน 20 ตัวอักษร (เช่น "FY2025")');
        for (const k of ['netIncome', 'eps', 'revenue']) if (f.fy[k] != null) num(f.fy[k], `fundamentals.fy.${k}`);
        if (!['netIncome', 'eps', 'revenue'].some((k) => f.fy[k] != null)) E('fundamentals.fy', 'ต้องมีตัวเลขอย่างน้อย 1 ช่อง (netIncome/eps/revenue)');
      }
    }
    if (f.bank != null) {
      if (!isObj(f.bank)) E('fundamentals.bank', 'ต้องเป็น object ของ % (nim npl coverage cet1 car)');
      else {
        closed(f.bank, 'fundamentals.bank', BANK_KEYS);
        for (const k of BANK_KEYS) if (f.bank[k] != null) {
          num(f.bank[k], `fundamentals.bank.${k}`, { min: 0 });
          if (isNum(f.bank[k]) && f.bank[k] > (k === 'coverage' ? 1000 : 100)) E(`fundamentals.bank.${k}`, `เป็นหน่วย % — เกิน ${k === 'coverage' ? 1000 : 100} ผิดวิสัย`);
        }
      }
    }
    if (f.ffoBasis != null) en(f.ffoBasis, 'fundamentals.ffoBasis', ENUM.ffoBasis);
    if (f.ffoForward != null) {
      const x = f.ffoForward, p = 'fundamentals.ffoForward';
      if (!isObj(x)) E(p, 'ต้องเป็น {value, period, low?, high?}');
      else {
        closed(x, p, ['value', 'period', 'low', 'high']);
        num(x.value, `${p}.value`, { gt: 0 }); str(x.period, `${p}.period`); plain(x.period, `${p}.period`);
        if (typeof x.period === 'string' && x.period.length > 20) E(`${p}.period`, 'ยาวเกิน 20 ตัวอักษร');
        for (const k of ['low', 'high']) if (x[k] != null) num(x[k], `${p}.${k}`, { gt: 0 });
        if (isNum(x.value) && ((isNum(x.low) && x.low > x.value) || (isNum(x.high) && x.high < x.value))) E(p, 'ต้อง low ≤ value ≤ high');
      }
    }
    // §3.6 L — สกุลงบ ≠ สกุลราคา: ยอดรวมทั้งบริษัทเป็นสกุลงบ · ต่อหุ้นเป็นสกุลราคา · fx = ราคา 1 หน่วยสกุลงบเป็นสกุลราคา
    if (f.reportCurrency != null) en(f.reportCurrency, 'fundamentals.reportCurrency', ENUM.reportCurrency);
    if (f.fx != null && isNum(f.fx) && !(f.fx > 0)) E('fundamentals.fx', 'ต้อง > 0');
    if (f.reportCurrency == null && f.fx != null) E('fundamentals.fx', 'มี fx ได้เฉพาะเมื่อประกาศ reportCurrency');
    else if (f.reportCurrency != null && f.reportCurrency !== doc.currency && f.fx == null) E('fundamentals.fx', `งบสกุล ${f.reportCurrency} ≠ สกุลราคา ${doc.currency} — ต้องมี fx (ราคา 1 ${f.reportCurrency} เป็น ${doc.currency})`);
    else if (f.reportCurrency === doc.currency && f.fx != null && f.fx !== 1) E('fundamentals.fx', 'สกุลงบ = สกุลราคา — fx ต้องไม่มี (หรือ = 1)');
    if (f.eps != null) en(f.epsBasis, 'fundamentals.epsBasis', ENUM.epsBasis);
    if (f.shares != null) num(f.shares, 'fundamentals.shares', { min: 1e5 });
  }

  // ── legs ──
  if (!Array.isArray(doc.legs) || doc.legs.length < 2 || doc.legs.length > 4) E('legs', 'ต้องมี 2–4 ขา (E17)');
  else doc.legs.forEach((leg, i) => {
    const p = `legs[${i}]`;
    if (!isObj(leg)) return E(p, 'ต้องเป็น object');
    closed(leg, p, ['method', 'label', 'inputs', 'override', 'note', 'role', 'family', 'baseLabel']);
    if (leg.role != null) en(leg.role, `${p}.role`, ENUM.role);
    if (leg.family != null) en(leg.family, `${p}.family`, ENUM.family);
    en(leg.method, `${p}.method`, ENUM.method);
    str(leg.label, `${p}.label`); plain(leg.label, `${p}.label`); str(leg.note, `${p}.note`, { req: false });
    // Plan 4c-prep (D2): ชื่อขาของผู้เขียนบนใบ migrate ≤ 80 · ใบ NEW ไม่เปลี่ยน
    if (isObj(doc.meta) && doc.meta.migratedFrom != null && typeof leg.label === 'string' && leg.label.length > 80) E(`${p}.label`, 'ใบ migrate: ชื่อขา ≤ 80 ตัวอักษร (ส่วนที่เหลือไป legs[i].note)');
    // family ต้องตรงโครงสร้างของ method — ป้ายผิดตระกูลเปลี่ยนน้ำหนัก FV ได้เงียบ ๆ (probe: BBL ขา rg → 'market' ⇒ FV 176.77 → 181.43)
    const need = requiredFamily(leg);
    if (leg.family != null && need && leg.family !== need) {
      const ms = isObj(leg.inputs) ? leg.inputs.multipleSource : null;
      const what = leg.method === 'declared' ? `declared basis ${leg.inputs.basis} (มูลค่าสินทรัพย์)`
        : ms != null ? `${leg.method} multipleSource '${ms}' (${ms === 'justified' ? 'ตัวคูณสร้างจาก r,g' : 'ตัวคูณยึดตลาด'})`
          : leg.method === 'pbv' ? 'pbv แบบ justified {g, r}' : `${leg.method} (รับ r,g เป็น input)`;
      E(`${p}.family`, `${what} ต้องเป็น family '${need}' — พบ '${leg.family}' (§3.6 C)`);
    }
    const spec = LEG_INPUTS[leg.method];
    if (!spec) return;
    if (!isObj(leg.inputs)) return E(`${p}.inputs`, 'ต้องมี (object)');
    closed(leg.inputs, `${p}.inputs`, spec.req.concat(spec.opt));
    const live = leg.inputs.multipleSource === 'current';   // ตัวคูณสด — compute คิด ⇒ ไม่มี (และห้ามมี) inputs.multiple
    for (const k of spec.req) if (leg.inputs[k] == null && !(live && k === 'multiple')) E(`${p}.inputs.${k}`, 'ต้องมี');
    const inp = leg.inputs;
    if (inp.multipleSource != null) en(inp.multipleSource, `${p}.inputs.multipleSource`, ENUM.multipleSource);
    if (live) {
      const sp = `${p}.inputs.multipleSource`;
      if (!Object.prototype.hasOwnProperty.call(CURRENT_BASE, leg.method)) E(sp, `'current' ใช้ได้กับ ${Object.keys(CURRENT_BASE).join('/')} เท่านั้น (ตัวตั้งต่อหุ้น)`);
      if (leg.role !== 'context') E(sp, "'current' ใช้ได้เฉพาะขา role:\"context\" — บนขา fv คือสมอตาย (W18) ห้ามโดยโครงสร้าง");
      if (inp.multiple != null) E(`${p}.inputs.multiple`, "multipleSource 'current' = ตัวคูณสด (ราคา ÷ ตัวตั้ง) ที่ compute คิดทุกวัน — ห้ามพิมพ์ตัวเลข");
    }
    for (const k of ['multiple', 'g', 'r', 'g1', 'tg', 'yield', 'value', 'payout', 'd1', 'g2']) if (inp[k] != null) num(inp[k], `${p}.inputs.${k}`);
    // r ≤ 0 (โดยเฉพาะ ≤ −100) พลิกเครื่องหมายตัวคิดลด → FV ขยะ — กฎร่วมทุกขาที่มี r
    if (isNum(inp.r) && !(inp.r > 0)) E(`${p}.inputs.r`, 'ต้อง > 0 (อัตราคิดลด หน่วยเปอร์เซ็นต์)');
    for (const k of ['years1', 'years']) if (inp[k] != null) num(inp[k], `${p}.inputs.${k}`, { int: true, min: 1 });
    if (inp.multiple != null && !(inp.multiple > 0)) E(`${p}.inputs.multiple`, 'ต้อง > 0');
    if (leg.method === 'pbv') {
      const mult = inp.multiple != null || inp.multipleSource != null, just = inp.g != null || inp.r != null;
      if (mult === just) E(`${p}.inputs`, 'pbv ใช้ได้ทางเดียว: {multiple, multipleSource} หรือ {g, r} (justified)');
      if (mult && ((inp.multiple == null && !live) || inp.multipleSource == null)) E(`${p}.inputs`, 'pbv แบบ multiple ต้องมีทั้ง multiple และ multipleSource');
      if (just && (inp.g == null || inp.r == null)) E(`${p}.inputs`, 'pbv แบบ justified ต้องมีทั้ง g และ r');
    }
    if (inp.multipleRange != null) {
      const r = inp.multipleRange, rp = `${p}.inputs.multipleRange`;
      if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => isNum(x) && x > 0) || !(r[0] <= r[1])) E(rp, 'ต้องเป็น [lo, hi] ตัวเลข > 0 และ lo ≤ hi');
      else if (!isNum(inp.multiple)) E(rp, 'ใช้ได้เฉพาะขาที่มี inputs.multiple');
      else if (!(r[0] <= inp.multiple && inp.multiple <= r[1])) E(rp, `multiple ${inp.multiple} ต้องอยู่ในกรอบ [${r[0]}, ${r[1]}]`);
      if (leg.role === 'context') E(rp, 'ขา context ไม่นับในกรอบ FV — ถอด multipleRange');
    }
    if (leg.method === 'ddm2') {
      if (!('horizon' in inp)) E(`${p}.inputs.horizon`, 'ต้องมี — จำนวนงวด (จำนวนเต็ม ≥1) หรือ null = มูลค่าปลายงวดแบบ Gordon');
      else if (inp.horizon !== null) num(inp.horizon, `${p}.inputs.horizon`, { int: true, min: 1 });
      if (isNum(inp.d1) && !(inp.d1 > 0)) E(`${p}.inputs.d1`, 'ต้อง > 0');
      if (inp.horizon === null && isNum(inp.r) && isNum(inp.g2) && !(inp.r > inp.g2)) E(`${p}.inputs.g2`, `r (${inp.r}%) ต้อง > g2 (${inp.g2}%) — horizon null ใช้ Gordon ปลายงวดที่หารด้วย (r − g2)`);
    }
    if (leg.method === 'dcf') {
      const two = inp.g1 != null || inp.years1 != null, st = inp.stages != null;
      if (two === st) E(`${p}.inputs`, 'dcf ใช้ได้ทางเดียว: {g1, years1} (2-stage) หรือ {stages: [{years, g}]} (N-stage · §13-3)');
      if (two && (inp.g1 == null || inp.years1 == null)) E(`${p}.inputs`, 'dcf 2-stage ต้องมีทั้ง g1 และ years1');
      if (st) {
        const sp = `${p}.inputs.stages`;
        if (!Array.isArray(inp.stages) || !inp.stages.length || inp.stages.length > 10) E(sp, 'ต้องเป็น array 1–10 ช่วง [{years, g}]');
        else {
          let total = 0;
          inp.stages.forEach((s, k) => {
            if (!isObj(s)) return E(`${sp}[${k}]`, 'ต้องเป็น object {years, g}');
            closed(s, `${sp}[${k}]`, ['years', 'g']);
            num(s.years, `${sp}[${k}].years`, { int: true, min: 1 }); num(s.g, `${sp}[${k}].g`);
            if (isNum(s.years)) total += s.years;
          });
          if (total > 40) E(sp, `Σ years = ${total} เกิน 40 ปี`);
        }
      }
    }
    if (inp.medianWindow != null) {
      const mp = `${p}.inputs.medianWindow`;
      if (typeof inp.medianWindow !== 'string' || !inp.medianWindow.trim() || inp.medianWindow.length > 40) E(mp, 'ต้องเป็นข้อความสั้น ≤40 ตัวอักษร (เช่น "FY2022–FY2025")');
      plain(inp.medianWindow, mp);
      if (!['median5y', 'median10y'].includes(inp.multipleSource)) E(mp, 'ใช้คู่กับ multipleSource median5y/median10y เท่านั้น');
    }
    // กระแสเงินสดของ DCF = ตัวเลขงบ (fcf/netDebt) ⇒ สกุลงบ (§3.6 L) · compute แปลงด้วย fx spot คงที่ (เชิงเส้น = คิดลดในสกุลงบแล้วแปลง) ⇒ r/rf ต้องเป็นของสกุลงบ
    const cashCur = (isObj(doc.fundamentals) && doc.fundamentals.reportCurrency) || doc.currency;
    if (leg.method === 'dcf' && inp.rfCurrency != null && inp.rfCurrency !== cashCur) E(`${p}.inputs.rfCurrency`, `rf ต้องสกุลเดียวกับกระแสเงินสด (${cashCur}${cashCur !== doc.currency ? ' = fundamentals.reportCurrency' : ''}) — พบ ${JSON.stringify(inp.rfCurrency)} · ชั้น 0`);
    if (leg.method === 'ri' && inp.payout != null && !(inp.payout >= 0 && inp.payout <= 100)) E(`${p}.inputs.payout`, 'ต้อง 0–100 (หน่วยเปอร์เซ็นต์)');
    if (leg.method === 'declared') {
      en(inp.basis, `${p}.inputs.basis`, ENUM.declaredBasis);
      if (inp.value != null && !(inp.value > 0)) E(`${p}.inputs.value`, 'ต้อง > 0');
      if (inp.extrasRef != null) num(inp.extrasRef, `${p}.inputs.extrasRef`, { int: true, min: 0 });
    }
    // Plan 4c-prep (spec §3.7 ก · D2): inputs.base (pe) — ตัวตั้งอ่านจาก fundamentals ตามนี้ · override.epsForward เมื่อเลขผู้เขียนต่าง
    const fb = isObj(doc.fundamentals) ? doc.fundamentals : {}, ov = isObj(leg.override) ? leg.override : {};
    const baseK = inp.base == null ? 'eps' : inp.base;
    if (inp.base != null) {
      en(inp.base, `${p}.inputs.base`, ENUM.legBase);
      if (inp.base === 'epsForward' && !(isNum(ov.epsForward) && ov.epsForward > 0) && !(isNum(fb.epsForward) && fb.epsForward > 0)) E(`${p}.inputs.base`, "'epsForward' ต้องมี fundamentals.epsForward หรือ override.epsForward > 0");
      if (inp.base === 'epsFy' && !(isObj(fb.fy) && isNum(fb.fy.eps) && fb.fy.eps > 0)) E(`${p}.inputs.base`, "'epsFy' ต้องมี fundamentals.fy.eps > 0");
    }
    if (baseK !== 'eps' && ov.eps != null) E(`${p}.override.eps`, `inputs.base '${baseK}' — ตัวเลขของผู้เขียนใช้ override.epsForward (ฐาน forward) ไม่ใช่ override.eps`);
    if (baseK !== 'epsForward' && ov.epsForward != null) E(`${p}.override.epsForward`, "ใช้ได้เฉพาะคู่ inputs.base 'epsForward'");
    if (leg.baseLabel != null) {
      if (typeof leg.baseLabel !== 'string' || !leg.baseLabel.trim() || leg.baseLabel.length > 24) E(`${p}.baseLabel`, 'ต้องเป็นข้อความสั้น ≤24 ตัวอักษร (ถ้อยคำงวด เช่น "FY2026E consensus")');
      plain(leg.baseLabel, `${p}.baseLabel`);
      if (baseK === 'eps') E(`${p}.baseLabel`, "ใช้คู่ inputs.base 'epsForward' | 'epsFy' เท่านั้น");
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
  if (Array.isArray(doc.legs) && doc.legs.length && doc.legs.every(isObj)) {
    const fvIdx = doc.legs.map((l, i) => (l.role === 'context' ? -1 : i)).filter((i) => i >= 0);
    if (!fvIdx.length) E('legs', 'ต้องมีขา role:"fv" อย่างน้อย 1 ขา (FV คิดจากขา fv เท่านั้น) — ≥2 ขาตรวจที่ gate E17');
    const withFam = fvIdx.filter((i) => doc.legs[i].family != null);
    if (withFam.length && withFam.length !== fvIdx.length) {
      for (const i of fvIdx) if (doc.legs[i].family == null) E(`legs[${i}].family`, 'ใช้ family แล้วต้องระบุทุกขา role:"fv" (1 ตระกูล 1 เสียง)');
    }
    // ชั้น 0 (§3.6 C): 2 ขาที่ (r,g) เหมือนกัน = ตระกูลเดียวกันเสมอ
    const sig = (l) => { const i = isObj(l.inputs) ? l.inputs : {}; const g = i.g != null ? i.g : i.tg != null ? i.tg : i.g2; return isNum(i.r) && isNum(g) ? `${i.r}|${g}` : null; };
    for (let a = 0; a < doc.legs.length; a++) for (let b = a + 1; b < doc.legs.length; b++) {
      const A = doc.legs[a], B = doc.legs[b];
      if (sig(A) && sig(A) === sig(B) && A.family && B.family && A.family !== B.family)
        E(`legs[${b}].family`, `(r,g) ชุดเดียวกับ legs[${a}] ต้องอยู่ตระกูลเดียวกัน — ชั้น 0`);
    }
  }
  if (doc.fvWeights != null) {
    const w = doc.fvWeights;
    if (!Array.isArray(w) || !Array.isArray(doc.legs) || w.length !== doc.legs.length || !w.every((x) => isNum(x) && x >= 0)
      || Math.abs(w.reduce((a, b) => a + b, 0) - 1) > 1e-6) E('fvWeights', 'ต้องเป็น null หรือ array ตัวเลข ≥0 ยาวเท่า legs และรวม = 1');
    if (Array.isArray(w) && Array.isArray(doc.legs)) doc.legs.forEach((l, i) => {
      if (isObj(l) && l.role === 'context' && w[i] !== 0) E('fvWeights', `legs[${i}] เป็นขา context — น้ำหนักต้องเป็น 0`);
    });
  }

  // ── metrics ──
  const mt = doc.metrics;
  if (!isObj(mt)) E('metrics', 'ต้องมี (object)');
  else {
    closed(mt, 'metrics', ['cards', 'notes', 'custom', 'hint']);
    if (!Array.isArray(mt.cards) || mt.cards.length < 4 || mt.cards.length > 16) E('metrics.cards', 'ต้องมี 4–16 การ์ด');
    else {
      const ids = [];
      const nCustom = Array.isArray(mt.custom) ? mt.custom.length : 0;
      mt.cards.forEach((c, i) => {
        const p = `metrics.cards[${i}]`;
        if (typeof c === 'string' && CUSTOM_REF.test(c)) {
          const n = +c.match(CUSTOM_REF)[1];
          if (n >= nCustom) E(p, `อ้าง ${c} แต่ metrics.custom มี ${nCustom} ช่อง`);
          ids.push(c);
        } else if (typeof c === 'string') {
          if (!CARD_KEYS.includes(c)) E(p, `ไม่อยู่ในแคตตาล็อก (${CARD_KEYS.join(', ')}) — ข้อมูลเฉพาะธุรกิจใช้ metrics.custom`);
          ids.push(c);
        } else if (isObj(c)) {
          closed(c, p, ['key', 'tone']);
          if (!CARD_KEYS.includes(c.key)) E(`${p}.key`, 'ไม่อยู่ในแคตตาล็อก');
          if (c.tone != null) en(c.tone, `${p}.tone`, ENUM.tone);
          ids.push(c.key);
        } else E(p, 'ต้องเป็นคีย์แคตตาล็อก / "custom:<i>" / {key, tone}');
      });
      if (new Set(ids).size !== ids.length) E('metrics.cards', 'การ์ดซ้ำ');
    }
    if (mt.notes != null) {
      if (!isObj(mt.notes)) E('metrics.notes', 'ต้องเป็น object');
      else for (const [k, v] of Object.entries(mt.notes)) { if (!CARD_KEYS.includes(k)) E(`metrics.notes.${k}`, 'ไม่ใช่คีย์การ์ด'); str(v, `metrics.notes.${k}`); }
    }
    if (mt.custom != null) {
      const cap = customCap(doc);
      if (!Array.isArray(mt.custom) || mt.custom.length > cap) E('metrics.custom', `ต้องเป็น array ≤${cap}${cap === CUSTOM_CAP ? '' : ' (ใบ migrate)'}`);
      else mt.custom.forEach((c, i) => { if (!isObj(c)) return E(`metrics.custom[${i}]`, 'ต้องเป็น object'); closed(c, `metrics.custom[${i}]`, ['label', 'value', 'note', 'tone']); if (c.tone != null) en(c.tone, `metrics.custom[${i}].tone`, ENUM.tone); str(c.label, `metrics.custom[${i}].label`); str(c.value, `metrics.custom[${i}].value`); str(c.note, `metrics.custom[${i}].note`, { req: false }); });
    }
    str(mt.hint, 'metrics.hint', { req: false });
  }

  // ── scenarios ──
  const s = doc.scenarios;
  if (!isObj(s)) E('scenarios', 'ต้องมี (object)');
  else {
    closed(s, 'scenarios', ['years', 'divIncluded', 'perYear', 'driver', 'exitMetric', 'exitDp', 'baseOverride', 'cases', 'note', 'hintNote']);
    num(s.years, 'scenarios.years', { int: true, min: 1 }); if (isNum(s.years) && s.years > 10) E('scenarios.years', 'ต้อง ≤ 10');
    if (typeof s.divIncluded !== 'boolean') E('scenarios.divIncluded', 'ต้องเป็น true/false');
    en(s.perYear === undefined ? '∅' : s.perYear, 'scenarios.perYear', ENUM.perYear);
    en(s.driver, 'scenarios.driver', ENUM.driver); en(s.exitMetric, 'scenarios.exitMetric', ENUM.exitMetric);
    // Plan 4b Task 1 (fix round 1 · N-3): exit EV/Sales คูณรายได้ต่อหุ้น ⇒ ตัวตั้งต้องเป็น revenuePerShare เท่านั้น
    if (s.exitMetric === 'evsales' && s.driver !== 'revenuePerShare') E('scenarios.exitMetric', `evsales (EV/Sales ออก) คูณรายได้ต่อหุ้น — ต้องใช้ scenarios.driver = "revenuePerShare" (พบ ${JSON.stringify(s.driver)})`);
    // Plan 4c-prep (spec §3.7 ก): EV/EBITDA ออก คู่ EBITDA ต่อหุ้น — กันทั้งสองทาง
    if (s.exitMetric === 'evebitda' && s.driver !== 'ebitdaPerShare') E('scenarios.exitMetric', `evebitda (EV/EBITDA ออก) คูณ EBITDA ต่อหุ้น — ต้องใช้ scenarios.driver = "ebitdaPerShare" (พบ ${JSON.stringify(s.driver)})`);
    if (s.driver === 'ebitdaPerShare' && s.exitMetric !== 'evebitda') E('scenarios.driver', `ebitdaPerShare ใช้คู่ exitMetric "evebitda" เท่านั้น (พบ ${JSON.stringify(s.exitMetric)})`);
    // Plan 4b Task 2: exitDp = จำนวนทศนิยมที่พิมพ์ตัวคูณออก (v2 พิมพ์ 17.25x ได้) · ไม่มี = render พิมพ์ค่าดิบ / token toFixed(1) เหมือนเดิม
    if (s.exitDp != null) { num(s.exitDp, 'scenarios.exitDp', { int: true, min: 0 }); if (isNum(s.exitDp) && s.exitDp > 2) E('scenarios.exitDp', 'ต้อง 0–2'); }
    if (s.baseOverride != null) { closed(s.baseOverride, 'scenarios.baseOverride', ['value', 'why']); num(s.baseOverride.value, 'scenarios.baseOverride.value', { gt: 0 }); str(s.baseOverride.why, 'scenarios.baseOverride.why'); }
    if (!Array.isArray(s.cases) || s.cases.length !== 3) E('scenarios.cases', 'ต้องมี 3 ฉากพอดี (Bear/Base/Bull)');
    else s.cases.forEach((c, i) => {
      const p = `scenarios.cases[${i}]`;
      if (!isObj(c)) return E(p, 'ต้องเป็น object');
      closed(c, p, ['growth', 'exitMultiple', 'divCum', 'desc', 'retNote']);
      num(c.growth, `${p}.growth`); num(c.exitMultiple, `${p}.exitMultiple`, { gt: 0 }); str(c.desc, `${p}.desc`, { req: !isMigrated(doc) });
      str(c.retNote, `${p}.retNote`, { req: false }); noTag(c.retNote, `${p}.retNote`);
      // divCum = ปันผลสะสมต่อหุ้นถึงจุดออก — บังคับเมื่อ divIncluded=true (นับรวมใน total%)
      // ยอมให้มี (optional, informational) เมื่อ divIncluded=false ด้วย — คลัง v2 จริง 423/1097 ใบเก็บเลขนี้ไว้
      // แสดงแม้ไม่รวมในผลตอบแทน (parity gate: test/v3/tokens-corpus.test.js) — ไม่รวมใน total% เพราะ derive() v2 อ่าน scnBasis.divIncluded เป็นตัวตัดสินอยู่แล้ว
      if (s.divIncluded) num(c.divCum, `${p}.divCum`, { min: 0 });
      else if (c.divCum != null) num(c.divCum, `${p}.divCum`, { min: 0 });
    });
    str(s.note, 'scenarios.note');
    str(s.hintNote, 'scenarios.hintNote', { req: false }); noTag(s.hintNote, 'scenarios.hintNote');
  }

  // ── analyst ──
  if (doc.analyst != null) {
    const a = doc.analyst;
    if (!isObj(a)) E('analyst', 'ต้องเป็น object หรือ null');
    else {
      closed(a, 'analyst', ['target', 'n', 'rating', 'asOf']);
      num(a.target, 'analyst.target', { gt: 0 });
      if (a.n != null) num(a.n, 'analyst.n', { int: true, min: 1 });
      // rating nullable (Plan 4b Task 1 — 114 ใบ v2 ไม่พิมพ์ rating) · คีย์ยังบังคับ (closed object)
      if (!('rating' in a)) E('analyst.rating', 'ต้องมีคีย์ — ข้อความ หรือ null เมื่อไม่ทราบ rating (114 ใบ v2 ไม่พิมพ์)');
      else if (a.rating !== null) str(a.rating, 'analyst.rating');
      if (a.asOf != null && !(typeof a.asOf === 'string' && ISO.test(a.asOf))) E('analyst.asOf', 'ต้องเป็น ISO YYYY-MM-DD หรือ null');
    }
  }

  // ── verdict (Plan 4c-prep · spec §3.7 ข) — vcell ที่ 3+ ของหมวด 8 ของผู้เขียน (ไม่บังคับ) ──
  if (doc.verdict != null) {
    const vd = doc.verdict;
    if (!isObj(vd)) E('verdict', 'ต้องเป็น object {extraCells}');
    else {
      closed(vd, 'verdict', ['extraCells']);
      const xc = vd.extraCells;
      if (!Array.isArray(xc) || xc.length < 1 || xc.length > 2) E('verdict.extraCells', 'ต้องเป็น array 1–2 ช่อง [{k, v}]');
      else xc.forEach((c, i) => {
        const p = `verdict.extraCells[${i}]`;
        if (!isObj(c)) return E(p, 'ต้องเป็น {k, v}');
        closed(c, p, ['k', 'v']); str(c.k, `${p}.k`); plain(c.k, `${p}.k`); str(c.v, `${p}.v`); noTag(c.v, `${p}.v`);
        if (typeof c.k === 'string' && c.k.length > 40) E(`${p}.k`, 'ป้าย ≤ 40 ตัวอักษร');
      });
    }
  }

  // ── prose / lists / extras ──
  const PROSE_REQ = ['chart', 'valuation', 'gauge', 'mos', 'verdictHeadline', 'verdictBody', 'strategy', 'disclaimerSources'];
  if (!isObj(doc.prose)) E('prose', 'ต้องมี (object)');
  else { closed(doc.prose, 'prose', PROSE_REQ); for (const k of PROSE_REQ) str(doc.prose[k], `prose.${k}`); }
  if (doc.text != null) {
    if (!isObj(doc.text)) E('text', 'ต้องเป็น object');
    else {
      closed(doc.text, 'text', TEXT_KEYS);
      for (const k of TEXT_KEYS) str(doc.text[k], `text.${k}`, { req: false });
      noTag(doc.text.chartHint, 'text.chartHint');
      noTag(doc.text.legendNote, 'text.legendNote'); if (typeof doc.text.legendNote === 'string' && doc.text.legendNote.length > 80) E('text.legendNote', 'ยาวเกิน 80 ตัวอักษร (ป้าย legend หมวด 2)');
      if (typeof doc.text.valHint === 'string' && doc.text.valHint.length > 80) E('text.valHint', 'ยาวเกิน 80 ตัวอักษร (เป็นป้ายหัว section)');
    }
  }
  strList(doc.catalysts, 'catalysts', 3, 8);
  strList(doc.risks, 'risks', 3, 8);
  if (!Array.isArray(doc.extras) || doc.extras.length > 2) E('extras', 'ต้องเป็น array ≤2 ตาราง');
  else doc.extras.forEach((x, i) => {
    const p = `extras[${i}]`;
    if (!isObj(x)) return E(p, 'ต้องเป็น object');
    closed(x, p, ['after', 'title', 'headers', 'rows', 'sumCol', 'note', 'columns', 'fx']);
    en(x.after, `${p}.after`, ENUM.extrasAfter); str(x.title, `${p}.title`); plain(x.title, `${p}.title`);
    if (!Array.isArray(x.headers) || !x.headers.every((h) => typeof h === 'string')) E(`${p}.headers`, 'ต้องเป็น array ของข้อความ (ว่างได้ = ตาราง note)');
    else x.headers.forEach((h, k) => plain(h, `${p}.headers[${k}]`));
    const cellOk = (c) => typeof c === 'string' || isNum(c);
    if (!Array.isArray(x.rows)) E(`${p}.rows`, 'ต้องเป็น array ของแถว');
    else {
      x.rows.forEach((r, j) => {
        const rp = `${p}.rows[${j}]`;
        if (Array.isArray(r)) { if (!r.every(cellOk)) E(rp, 'cell = ข้อความหรือตัวเลข'); }
        else if (isObj(r) && r.kind === 'total') { closed(r, rp, ['kind', 'cells']); if (!Array.isArray(r.cells) || !r.cells.every(cellOk)) E(`${rp}.cells`, 'ต้องเป็น array ของ cell'); }
        else if (isObj(r) && r.kind === 'note') { closed(r, rp, ['kind', 'text']); str(r.text, `${rp}.text`); }
        else E(rp, 'แถวต้องเป็น [cell…] · {kind:"total", cells} · {kind:"note", text}');
      });
      if (x.rows.filter((r) => isObj(r) && r.kind === 'total').length > 1) E(`${p}.rows`, 'แถว total ได้ไม่เกิน 1');
    }
    if (x.columns != null) {
      if (!Array.isArray(x.columns) || !Array.isArray(x.headers) || x.columns.length !== x.headers.length) E(`${p}.columns`, 'ต้องเป็น array ยาวเท่า headers');
      else x.columns.forEach((c, k) => {
        const cp = `${p}.columns[${k}]`;
        if (!isObj(c)) return E(cp, 'ต้องเป็น {dp, unit, signed?}');
        closed(c, cp, ['dp', 'unit', 'signed']);
        num(c.dp, `${cp}.dp`, { int: true, min: 0 }); if (isNum(c.dp) && c.dp > 4) E(`${cp}.dp`, 'ต้อง ≤ 4');
        en(c.unit, `${cp}.unit`, ENUM.colUnit);
        if (c.signed != null && typeof c.signed !== 'boolean') E(`${cp}.signed`, 'ต้องเป็น true/false');
      });
    }
    if (x.sumCol != null) {
      num(x.sumCol, `${p}.sumCol`, { int: true, min: 0 });
      const sumOk = (r) => (Array.isArray(r) ? isNum(r[x.sumCol])
        : isObj(r) && r.kind === 'note' ? true
          : isObj(r) && r.kind === 'total' ? Array.isArray(r.cells) && isNum(r.cells[x.sumCol]) : false);
      if (Array.isArray(x.rows) && !x.rows.every(sumOk)) E(`${p}.sumCol`, 'คอลัมน์ผลรวมต้องเป็นตัวเลขทุกแถวข้อมูล (และแถว total)');
    }
    if (x.fx != null) {
      if (typeof x.fx !== 'boolean') E(`${p}.fx`, 'ต้องเป็น true/false');
      else if (x.fx && !(isObj(doc.fundamentals) && isNum(doc.fundamentals.fx))) E(`${p}.fx`, 'fx:true ต้องมี fundamentals.fx');
      else if (x.fx && x.sumCol == null) E(`${p}.fx`, 'แถวแปลงสกุลต้องมี sumCol');
    }
    str(x.note, `${p}.note`, { req: false });
  });
  // ── v2Display (display-fix · เจ้าของ 26 ก.ย. 69 "ข้อมูลที่แสดงของทุกใบต้องถูก") — ใบ migrate เท่านั้น (meta.migratedFrom · แบบเดียวกับ customCap/W33) ──
  //   ตัวเลขของผู้เขียนที่หน้า v2 พิมพ์ แต่ v3 คิดจาก inputs ได้ไม่เท่า (FV · กรอบ FV · ค่าขา · ราคาเป้า/ตัวตั้งปลายฉาก · สเกลเกจ · ค่าการ์ดที่ cron v2 ไม่เคยแตะ)
  //   compute/render ใช้ค่านี้แทนค่าที่คิด ⇒ หน้า v3 แสดงเท่าหน้า v2 · ใบ NEW ห้ามมี (ค่าต้องมาจาก inputs เสมอ)
  if (doc.v2Display != null) validateV2Display(doc, E, closed, num, plain, en);
  // {{lit:…}} ↔ meta.litReasons (spec §4 ข้อ 4 · #51 · ruling R1) — 1 คีย์ต่อ 1 ข้อความ ใช้ได้หลายจุด
  for (const p of P.malformedLitPaths(doc)) E(p, '{{lit:…}} ไม่ครบรูป — ห้ามซ้อน token/วงเล็บปีกกา และต้องปิดด้วย }}');
  const reasons = isObj(doc.meta) && isObj(doc.meta.litReasons) ? doc.meta.litReasons : {};
  const lits = P.litsOf(doc);
  for (const l of lits) if (!Object.prototype.hasOwnProperty.call(reasons, l.text)) E(l.path, `{{lit:${l.text}}} ต้องมีเหตุผลใน meta.litReasons[${JSON.stringify(l.text)}]`);
  const used = new Set(lits.map((l) => l.text));
  for (const k of Object.keys(reasons)) if (!used.has(k)) E(`meta.litReasons[${JSON.stringify(k)}]`, 'ไม่มี {{lit:…}} ที่ใช้เหตุผลนี้ — ลบออก');
  if (doc._sig != null && !/^sha256:[0-9a-f]{64}$/.test(doc._sig)) E('_sig', 'รูปลายเซ็นไม่ถูกต้อง');

  for (const { path: p, text } of stringLeaves(doc, '', [])) {
    if (p === '_sig') continue;
    if (text.includes(RD_TOKEN)) E(p, '{{rd:…}} เป็นไวยากรณ์ของใบ v2 — ใบ v3 ใช้ token ของ view เช่น {{px}} {{fv}} {{mos}} {{leg1}} (ดูรายการ: node tools/report.js show <SYM>)');
    if (TODO_RE.test(text)) E(p, 'ยังเป็น sentinel "TODO" ที่ report.js init วางไว้ — เติมค่าจริง (ช่องตัวเลขใส่ตัวเลข ไม่ใช่สตริง)');
  }
  return errs;
}

// v2Display: คีย์ของเกจที่อ้างค่าของ view ได้ (ชื่อ token ของ v2 — render พิมพ์เป็น {{rd:<ref>}})
const GAUGE_REFS = ['mos30', 'mos20', 'fv', 'fvLow', 'fvHigh', 'analystTgt', 'px', 'sc1tgt', 'sc2tgt', 'sc3tgt'];
const V2DISPLAY_KEYS = ['fv', 'fvRange', 'legValues', 'targets', 'driverEnds', 'driverTotal', 'gauge', 'cards', 'rets', 'footer'];
// การ์ดที่ค่าเป็นฟังก์ชันของราคา — v2Display.cards ของคีย์เหล่านี้ต้องคิดสด (op/base) เท่านั้น
const V2DISPLAY_PRICE_CARDS = ['mcap', 'pe', 'pbv', 'ps', 'yield', 'evEbitda', 'peForward', 'analystTarget', 'pffo', 'pffoForward', 'ptbv'];
function validateV2Display(doc, E, closed, num, plain, en) {
  const x = doc.v2Display, P0 = 'v2Display';
  if (!isObj(x)) return E(P0, 'ต้องเป็น object');
  if (!isMigrated(doc)) E(P0, 'ใช้ได้เฉพาะใบ migrate (meta.migratedFrom) — ใบ NEW คิดทุกตัวเลขจาก inputs');
  closed(x, P0, V2DISPLAY_KEYS);
  if (!Object.keys(x).length) E(P0, 'ว่าง — ลบออก');
  if (x.fv != null) num(x.fv, `${P0}.fv`, { gt: 0 });
  // driverTotal: แถวตัวตั้งปลายฉาก/ป้าย hint พิมพ์เป็นยอดรวมทั้งบริษัท (ต่อหุ้น × หุ้น) ตามหน้า v2 (CPNG/NET "รายได้ปี 3 ~$38.75B")
  if (x.driverTotal != null) {
    if (x.driverTotal !== true) E(`${P0}.driverTotal`, 'ต้องเป็น true (หรือลบออก)');
    else if (!(isObj(doc.scenarios) && ['revenuePerShare', 'ebitdaPerShare', 'fcfPerShare'].includes(doc.scenarios.driver))) E(`${P0}.driverTotal`, 'ใช้ได้เฉพาะ driver ต่อหุ้นของยอดรวม (revenuePerShare/ebitdaPerShare/fcfPerShare)');
  }
  if (x.fvRange != null) {
    if (!Array.isArray(x.fvRange) || x.fvRange.length !== 2 || !x.fvRange.every((v) => isNum(v) && v > 0) || x.fvRange[0] > x.fvRange[1]) E(`${P0}.fvRange`, 'ต้องเป็น [ล่าง, บน] ตัวเลข > 0 และ ล่าง ≤ บน');
  }
  const arr = (k, n, ok, what) => {
    const a = x[k];
    if (a == null) return;
    if (!Array.isArray(a) || a.length !== n) return E(`${P0}.${k}`, `ต้องเป็น array ยาว ${n}`);
    if (!a.some((v) => v != null)) E(`${P0}.${k}`, 'ทุกช่องเป็น null — ลบออก');
    a.forEach((v, i) => { if (v != null && !ok(v)) E(`${P0}.${k}[${i}]`, what); });
  };
  arr('legValues', Array.isArray(doc.legs) ? doc.legs.length : -1, (v) => isNum(v) && v > 0, 'ต้องเป็น null หรือตัวเลข > 0 (ค่าขาที่หน้า v2 พิมพ์)');
  arr('targets', 3, (v) => isNum(v) && v > 0, 'ต้องเป็น null หรือตัวเลข > 0 (ราคาเป้าฉากที่หน้า v2 พิมพ์)');
  arr('driverEnds', 3, (v) => typeof v === 'string' && v.trim() && !/[{}<>]/.test(v), 'ต้องเป็น null หรือข้อความที่หน้า v2 พิมพ์ในแถวตัวตั้งปลายฉาก (เช่น "~$38.75B") — ห้ามมี { } < >');
  // footer: วันที่ "ข้อมูล ณ …" ตามที่หน้า v2 พิมพ์ (ศักราช/วงเล็บของผู้เขียน เช่น "21 ก.ย. 2569 (2026)") — ต้องมีเลขปี
  if (x.footer != null) { if (typeof x.footer !== 'string' || !/\d{4}/.test(x.footer)) E(`${P0}.footer`, 'ต้องเป็นข้อความวันที่ที่มีเลขปี'); else plain(x.footer, `${P0}.footer`); }
  if (x.gauge != null) {
    if (!Array.isArray(x.gauge) || x.gauge.length < 2 || x.gauge.length > 8) E(`${P0}.gauge`, 'ต้องเป็น array 2–8 ป้าย');
    else x.gauge.forEach((t, i) => {
      const p = `${P0}.gauge[${i}]`;
      if (!isObj(t)) return E(p, 'ต้องเป็น {ref|text, label}');
      closed(t, p, ['ref', 'text', 'label']);
      if ((t.ref != null) === (t.text != null)) E(p, 'ต้องมี ref หรือ text อย่างใดอย่างหนึ่ง');
      if (t.ref != null) en(t.ref, `${p}.ref`, GAUGE_REFS);
      if (t.text != null) { if (typeof t.text !== 'string' || !t.text.trim()) E(`${p}.text`, 'ต้องเป็นข้อความ'); plain(t.text, `${p}.text`); }
      if (typeof t.label !== 'string') E(`${p}.label`, 'ต้องเป็นข้อความ (ว่างได้)'); else plain(t.label, `${p}.label`);
    });
  }
  // rets: รูปแบบข้อความ .ret ของผู้เขียน v2 — ตัวเลข % คิดใหม่ทุกครั้งที่ราคาปัจจุบัน (กติกาเดียวกับ cron v2) · ไม่มีแบบข้อความคงที่ (ผลตอบแทนเป็นฟังก์ชันของราคา — round 2)
  if (x.rets != null) {
    const r = x.rets, p = `${P0}.rets`;
    if (!isObj(r)) E(p, 'ต้องเป็น {texts, neg, div, perYear?}');
    else {
      closed(r, p, ['texts', 'neg', 'perYear', 'div']);
      if (!Array.isArray(r.texts) || r.texts.length !== 3) E(`${p}.texts`, 'ต้องเป็น array ข้อความ 3 ช่อง (Bear/Base/Bull)');
      else r.texts.forEach((t, i) => { if (typeof t !== 'string' || !t.trim()) E(`${p}.texts[${i}]`, 'ต้องเป็นข้อความ'); else plain(t, `${p}.texts[${i}]`); });
      en(r.neg, `${p}.neg`, ['−', '-']);
      if (r.perYear != null) en(r.perYear, `${p}.perYear`, ['cagr', 'linear']);
      if (typeof r.div !== 'boolean') E(`${p}.div`, 'ต้องบอกว่าผลตอบแทนรวมปันผลไหม (true/false — ฐานเดียวกับ cron v2)');
      if (isObj(doc.scenarios) && Array.isArray(doc.scenarios.cases) && doc.scenarios.cases.some((c) => isObj(c) && c.retNote != null)) E(`${p}`, 'ช่อง .ret เป็นข้อความของหน้า v2 ทั้งช่อง — ลบ scenarios.cases[i].retNote');
    }
  }
  if (x.cards != null) {
    if (!isObj(x.cards) || !Object.keys(x.cards).length) E(`${P0}.cards`, 'ต้องเป็น object {คีย์การ์ด: {v, d}} (ค่า + บรรทัดล่างที่หน้า v2 พิมพ์)');
    else {
      const keys = new Set(isObj(doc.metrics) && Array.isArray(doc.metrics.cards) ? doc.metrics.cards.map((c) => (isObj(c) ? c.key : c)) : []);
      for (const [k, c] of Object.entries(x.cards)) {
        const p = `${P0}.cards.${k}`;
        if (!CARD_KEYS.includes(k) || !keys.has(k)) E(p, 'ต้องเป็นคีย์แคตตาล็อกที่อยู่ใน metrics.cards');
        if (!isObj(c)) { E(p, 'ต้องเป็น {v, d}'); continue; }
        closed(c, p, ['v', 'd', 'op', 'base']);
        // op/base: การ์ดที่ cron v2 คิดใหม่ตามราคาจากฐานที่ .d ประกาศ — pxOverBase = ราคา ÷ ฐาน (P/E · P/BV) · basePct = ฐาน ÷ ราคา (ปันผล %)
        if ((c.op != null) !== (c.base != null)) E(p, 'op กับ base ต้องมาคู่กัน');
        if (c.op != null) {
          en(c.op, `${p}.op`, ['pxOverBase', 'basePct']);
          // base หลายตัว = ตัวเลขหลายตัวในข้อความตามลำดับ ("2.38x / 4.22x" ← BVPS / TBVPS)
          const bs = Array.isArray(c.base) ? c.base : [c.base];
          if (!bs.length || bs.length > 3 || !bs.every((b) => isNum(b) && b > 0)) E(`${p}.base`, 'ต้องเป็นตัวเลข > 0 หรือ array 1–3 ตัว');
          const nNum = typeof c.v === 'string' ? (c.v.match(/[0-9][0-9,]*(?:\.[0-9]+)?/g) || []).length : 0;
          if (nNum < bs.length) E(`${p}.v`, `op ต้องมีตัวเลขในข้อความอย่างน้อย ${bs.length} ตัวให้เขียนใหม่`);
        }
        // การ์ดผูกราคา (ค่า = ฟังก์ชันของราคา) ห้ามแช่ข้อความ — ต้องมีฐาน (op/base) ให้คิดสดที่ราคาปัจจุบัน · ไม่มีฐาน = ไม่พก (v3 คิดเอง)
        //   ยกเว้นข้อความไม่มีตัวเลข ("ขาดทุน GAAP" · "ไม่มี") = ข้อเท็จจริงของผู้เขียน ไม่ใช่ค่าที่คิดจากราคา
        if (V2DISPLAY_PRICE_CARDS.includes(k) && c.op == null && /[0-9]/.test(String(c.v))) E(p, 'การ์ดผูกราคา — ต้องมี op/base (ฐานของผู้เขียน) ห้ามพกข้อความค่าคงที่ที่มีตัวเลข');
        if (typeof c.v !== 'string' || !c.v.trim()) E(`${p}.v`, 'ต้องเป็นข้อความ'); else plain(c.v, `${p}.v`);
        if (typeof c.d !== 'string') E(`${p}.d`, 'ต้องเป็นข้อความ (ว่างได้)'); else plain(c.d, `${p}.d`);
        if (isObj(doc.metrics) && isObj(doc.metrics.notes) && doc.metrics.notes[k] != null) E(`metrics.notes.${k}`, `การ์ดนี้แสดงบรรทัดล่างของหน้า v2 (${p}.d) — ลบ note ออก`);
      }
    }
  }
}

// path → เจ้าของ: 'cron' เขียนได้เฉพาะ market.* · 'io' = _sig · ที่เหลือ worker (ผ่าน report.js save)
function OWNER(path) {
  if (path === '_sig') return 'io';
  if (path === 'market' || path.startsWith('market.')) return 'cron';
  return 'worker';
}

module.exports = { GAUGE_REFS, V2DISPLAY_KEYS, V2DISPLAY_PRICE_CARDS, ENUM, FFO_LABEL, CARD_KEYS, FUND_KEYS, FY_KEYS, BANK_KEYS, LEG_INPUTS, CURRENT_BASE, requiredFamily, OVERRIDE_KEYS, THEME_KEYS, TEXT_KEYS, cardEntries, customCap, CUSTOM_CAP, CUSTOM_CAP_MIGRATED, isMigrated, SOURCES_MIN, SOURCES_MIN_MIGRATED, validate, OWNER, RD_TOKEN, TODO_RE, stringLeaves };
