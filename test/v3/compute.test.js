'use strict';
const t = require('./_t.js')('compute');
const C = require('../../tools/v3/compute.js');
const RV = require('../../tools/report-values.js');
const load = (s) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`)));
const seeds = { ZTS: '#e8731a' };

const v = C.compute(load('ZTS'), { seeds });
t.near(v.legs[0].value, 171.64, 1e-9, 'leg 1 = pe');
t.near(v.fv, (v.legs[0].value + v.legs[1].value) / 2, 1e-9, 'fv = equal-weight mean when fvWeights null');
t.eq([v.fvLow, v.fvHigh], [Math.min(v.legs[0].value, v.legs[1].value), Math.max(v.legs[0].value, v.legs[1].value)], 'fvLow/High = min/max of legs');
t.near(v.scn[1].tgt, 6.13 * Math.pow(1.08, 3) * 26, 1e-9, 'base scenario target = eps(1+g)^y × exit');
t.eq(v.d.mosText, RV.derive(v.rd, v.sm).mosText, 'view.d is RV.derive of the bridged v2 data (byte-identical formatting)');
t.eq(v.rd.v, 2, 'bridge emits report-data v2');
t.eq(Object.keys(v.rd.values).includes('scenarios'), true, 'bridge carries scenarios');
t(v.chart.min < Math.min(...v.chart.data.map((p) => p[1])) && v.chart.max > v.fv, 'chart bounds include data and fv');
t.eq(v.chart.highlight, [6, 0], 'highlight = [index of min, index of max]');
t(v.gauge.min < v.fv * 0.7 && v.gauge.max > 190, 'gauge spans mos30 … analyst target');
t.eq(v.theme.chgColor, '#c5221f', 'chart down → red chg colour (E34)');
t(v.theme.accent === '#31a60d' && v.gdots.length === 3, 'themeLegacy palette + 3 gdots');
{ const d = load('ZTS'); d.meta.themeLegacy = null; const w = C.compute(d, { seeds });
  t.eq(w.theme.accent, require('../../tools/brandtheme.js').makeTheme('#e8731a').accent, 'no themeLegacy → makeTheme(seed)'); }
t.eq(v.analysisDateText, '20 ก.ย. 2569', 'analysis date in BE');

const b = C.compute(load('BBL'), { seeds: {} });
t.eq(b.theme.accent, '#0071e3', 'themeLegacy wins over seeds');
t.eq(b.theme.chgColor, '#137333', 'chart up → green');
t.eq(b.rd.values.analystTgt, undefined, 'no analyst → no analystTgt in bridge');

{ const d = load('ZTS'); d.fvWeights = [0.75, 0.25]; const w = C.compute(d, { seeds });
  t.near(w.fv, 0.75 * w.legs[0].value + 0.25 * w.legs[1].value, 1e-9, 'explicit weights'); }
{ const d = load('ZTS'); d.market.px = -3; t.throws(() => C.compute(d, { seeds }), /market\.px/, 'schema errors surface with path'); }
{ const d = load('ZTS'); d.meta.themeLegacy = null; t.throws(() => C.compute(d, { seeds: {} }), /pick-brand\.js ZTS .*seeds\.json/, 'no theme source → clear error'); }
{ const d = load('ZTS'); d.legs[1] = { method: 'declared', label: 'SOTP', inputs: { value: 150, basis: 'sotp', extrasRef: 0 } };
  t.throws(() => C.compute(d, { seeds }), /legs\[1\]\.inputs\.extrasRef/, 'extrasRef must point at an extras table'); }
// Plan 2a Task 5 — weights / context / range
t.eq(C.weightsOf(load('ZTS')), [0.5, 0.5], 'legacy: equal weights, byte-identical to Plan 1');
{ const d = load('ZTS'); d.legs = [{ ...d.legs[0], family: 'market' }, { method: 'ddm', label: 'DDM', family: 'rg', inputs: { g: 5, r: 9 } }, { method: 'pbv', label: 'P/BV', family: 'rg', inputs: { g: 5, r: 9 } }];
  t.eq(C.weightsOf(d), [0.5, 0.25, 0.25], 'family: 1 family 1 vote, split inside the family');
  d.fvWeights = [0.6, 0.2, 0.2]; t.eq(C.weightsOf(d), [0.6, 0.2, 0.2], 'explicit fvWeights wins over family'); }
{ const d = load('ZTS'); d.legs[1].role = 'context'; const v = C.compute(d, { seeds });
  t.eq(C.weightsOf(d), [1, 0], 'context leg weighs 0');
  t.near(v.fv, v.legs[0].value, 1e-9, 'fv = the single fv leg');
  t.eq([v.fvLow, v.fvHigh], [v.legs[0].value, v.legs[0].value], 'context leg excluded from fvLow/fvHigh');
  t.eq(v.legs[1].role, 'context', 'view carries role'); }
{ const d = load('ZTS'); d.legs[0].inputs.multipleRange = [20, 34]; const v = C.compute(d, { seeds });
  t.near(v.fvLow, 0.5 * 6.13 * 20 + 0.5 * v.legs[1].value, 1e-9, 'fvLow = Σ w·lo (unranged leg uses its value)');
  t.near(v.fvHigh, 0.5 * 6.13 * 34 + 0.5 * v.legs[1].value, 1e-9, 'fvHigh = Σ w·hi');
  t.near(v.fv, (v.legs[0].value + v.legs[1].value) / 2, 1e-9, 'range does not move fv'); }
// R7 — ขา context 'current': ตัวคูณสด = ราคา ÷ ตัวตั้ง · ค่าขา ≡ ราคา · ไม่ขยับ FV
{ const d = load('ZTS'); const fv0 = C.compute(d, { seeds }).fv;
  d.legs.push({ method: 'pe', label: 'P/E ปัจจุบัน', role: 'context', inputs: { multipleSource: 'current' } }); d.fvWeights = null;
  const v = C.compute(d, { seeds }), L = v.legs[v.legs.length - 1];
  t.near(L.liveMultiple, d.market.px / d.fundamentals.eps, 1e-9, 'liveMultiple = px / eps');
  t.near(L.value, d.market.px, 1e-9, 'current leg value ≡ px');
  t.eq(L.weight, 0, 'current leg weighs 0');
  t.near(v.fv, fv0, 1e-9, 'current context leg does not move fv');
  d.market.px *= 1.1; t.near(C.compute(d, { seeds }).legs[v.legs.length - 1].liveMultiple, d.market.px / d.fundamentals.eps, 1e-9, 'liveMultiple follows the price (nothing frozen)'); }
// Plan 2a Task 10 — ยอดงบสกุลอื่นแปลงเป็นสกุลราคาก่อนเข้าสูตรทุกตัว
{ const base0 = C.compute(load('ZTS'), { seeds });
  t(base0.fq === base0.doc.fundamentals && base0.fx === 1 && base0.stmtCur === '$', 'no reportCurrency → fq is the same object (legacy path)');
  const d = load('ZTS'); d.fundamentals.reportCurrency = 'EUR'; d.fundamentals.fx = 1.2; d.legs[1].inputs.rfCurrency = 'EUR'; const v = C.compute(d, { seeds });
  t.eq([v.fq.revenue, v.fq.fcf, v.fq.netDebt], [9.4e9 * 1.2, 2.3e9 * 1.2, 5.1e9 * 1.2], 'totals converted into quote currency');
  t.eq(v.fq.eps, 6.13, 'per-share values untouched');
  t.near(v.d.ps, 120 * 443e6 / (9.4e9 * 1.2), 1e-9, 'P/S divides quote money by quote money');
  t.eq(v.stmtCur, '€', 'statement symbol'); }
{ const d = load('ZTS'); d.fundamentals.reportCurrency = 'EUR'; d.fundamentals.fx = 1.2; d.legs[1].inputs.rfCurrency = 'EUR';
  d.legs[1].override = { fcf: 2.0e9, why: 'normalised FCF (EUR)' }; const v = C.compute(d, { seeds });
  const d1 = load('ZTS'); d1.legs[1].override = { fcf: 2.4e9, netDebt: 6.12e9, why: 'same in USD' }; d1.fundamentals.netDebt = 6.12e9; d1.fundamentals.fcf = 2.76e9; d1.fundamentals.revenue = 11.28e9;
  t.near(v.legs[1].value, C.compute(d1, { seeds }).legs[1].value, 1e-6, 'override totals are statement currency and get converted too'); }
// final review (1) — family ต้องตรง method: ป้ายผิดตระกูลเคยย้าย FV เงียบ ๆ (probe: BBL-real ขา ddm/pbv → 'market' ⇒ FV 181.43, 0 error)
// ตอนนี้ compute() (validate ก่อนคิด) ปฏิเสธทุกป้ายที่ไม่ใช่ 'rg' บนขา (r,g) ⇒ FV ขยับด้วยป้ายไม่ได้อีก
{ const round2 = (x) => Math.round(x * 100) / 100;
  t.eq(round2(C.compute(load('BBL-real'), { seeds: {} }).fv), 176.77, 'BBL-real FV 176.77 with honest families');
  for (const f1 of ['market', 'rg', 'asset']) for (const f2 of ['market', 'rg', 'asset']) {
    if (f1 === 'rg' && f2 === 'rg') continue;
    const d = load('BBL-real'); d.legs[1].family = f1; d.legs[2].family = f2;
    t.throws(() => C.compute(d, { seeds: {} }), /legs\[[12]\]\.family/, `BBL-real ddm=${f1} pbv=${f2}: mislabel rejected, FV cannot move`);
  } }
// ── Plan 2b Task 5 — semanticErrors(): จุด throw ของ compute ครบในครั้งเดียว (spec §9 · #52) ──
{
  const Z = () => { const d = load('ZTS-real'); delete d._sig; return d; };
  t.eq(C.semanticErrors(Z(), { seeds: {} }), [], 'ZTS-real: no semantic errors (themeLegacy present)');
  const d = Z();
  d.meta.themeLegacy = null;                                      // (1) ไม่มีสีแบรนด์ (seeds ว่าง)
  delete d.scenarios.baseOverride; d.scenarios.driver = 'bvps';   // (2) ฐาน driver ไม่มี (ZTS-real ไม่มี fundamentals.bvps)
  d.legs[1].inputs.extrasRef = 0;                                  // (3) declared ชี้ extras[0] ที่ไม่มี
  d.legs[2].inputs.r = 5;                                          // (4) ddm r (5%) ≤ g (5.5%) → legValue throw
  t.eq(C.semanticErrors(d, { seeds: {} }).map((e) => e.path).sort(), ['legs[1].inputs.extrasRef', 'legs[2]', 'meta.themeLegacy', 'scenarios.driver'], 'four faults → four paths in one call');
  t(C.semanticErrors(d, { seeds: {} }).every((e) => e.msg && !e.msg.startsWith(e.path)), 'msg carries no duplicated path prefix');
  t.throws(() => C.compute(d, { seeds: {} }), /legs\[1\]\.inputs\.extrasRef/, 'compute() itself still throws on the first fault (unchanged)');
  t.eq(C.semanticErrors(d, { seeds: { ZTS: '#e8731a' } }).map((e) => e.path).includes('meta.themeLegacy'), false, 'a seed clears the brand-colour fault');
  const e = Z(); e.fvWeights = null; e.legs.push({ method: 'pbv', label: 'P/BV ตลาด', role: 'context', inputs: { multipleSource: 'current' } });
  t.eq(C.semanticErrors(e, { seeds: {} }).map((x) => x.path), ['legs[3].inputs.multipleSource'], "'current' leg with no bvps → path of multipleSource");
  const r = Z(); r.legs[0].inputs.multipleRange = [0.0001, 20]; r.legs[0].inputs.multiple = 14;
  t(C.semanticErrors(r, { seeds: {} }).every((x) => x.path !== 'legs[0]'), 'multipleRange that still prices > 0 is not an error');
}
// ── parity pin (advisor pre-dispatch 24 ก.ย. 69): จุด throw ทั้ง 5 ของ compute ทีละจุด — ใบละ fault เดียว ──
// semanticErrors ต้องชี้ path นั้น (ตัวเดียว) **และ** compute() บนใบเดียวกันต้อง throw ที่ path เดียวกัน
// ⇒ ถ้าวันหน้า compute ได้จุด throw ใหม่ที่ semanticErrors ไม่รู้จัก (หรือกลับกัน) ต้องเพิ่มแถวที่นี่ — checkDoc ยังรัน compute ต่อ
//   จึงไม่มีทาง save ผ่านแต่ gate พัง ความเสี่ยงคือ #52 ไม่ครบ (fault ใหม่รายงานทีละข้อผ่าน catch ของ compute ไม่ใช่ครบในครั้งเดียว)
{
  const S = require('../../tools/v3/schema.js');
  const Z = () => { const d = load('ZTS-real'); delete d._sig; return d; };
  const SITES = [   // [ชื่อจุด throw, path ที่ต้องได้, การ mutate ที่ทำให้สะดุดจุดนั้นจุดเดียว]
    ['prepLeg extrasRef', 'legs[1].inputs.extrasRef', (d) => { d.legs[1].inputs.extrasRef = 0; }],
    ["prepLeg 'current' no base", 'legs[3].inputs.multipleSource', (d) => { d.fvWeights = null; d.legs.push({ method: 'pbv', label: 'P/BV ตลาด', role: 'context', inputs: { multipleSource: 'current' } }); }],
    ['L.legValue (ddm r ≤ g)', 'legs[2]', (d) => { d.legs[2].inputs.r = 5; }],
    ['driverStart', 'scenarios.driver', (d) => { delete d.scenarios.baseOverride; d.scenarios.driver = 'bvps'; }],
    ['themeOf', 'meta.themeLegacy', (d) => { d.meta.themeLegacy = null; }],
  ];
  for (const [name, p, mut] of SITES) {
    const d = Z(); mut(d);
    t.eq(S.validate(d), [], `parity ${name}: the mutation passes the schema (semantic fault only)`);
    t.eq(C.semanticErrors(d, { seeds: {} }).map((e) => e.path), [p], `parity ${name}: semanticErrors names ${p} (and nothing else)`);
    t.throws(() => C.compute(d, { seeds: {} }), new RegExp(p.replace(/[.[\]]/g, '\\$&')), `parity ${name}: compute() on the same doc throws at ${p}`);
  }
  // ทางกลับ (review รอบ 1): semanticErrors ว่าง ⇒ compute ไม่ throw — ทุก mutation ในชุด + ตัวควบคุมที่ต้องสะอาด
  const CLEAN = [
    ['baseline', () => {}],
    ['seed replaces themeLegacy', (d) => { d.meta.themeLegacy = null; }, { ZTS: '#e8731a' }],
    ['multipleRange still > 0', (d) => { d.legs[0].inputs.multipleRange = [0.0001, 20]; d.legs[0].inputs.multiple = 14; }],
  ];
  for (const [name, mut, sd] of [...SITES.map(([n, , m]) => [n, m]), ...CLEAN]) {
    const d = Z(); mut(d); const seeds = sd || {};
    const nSem = C.semanticErrors(d, { seeds }).length;
    let threw = null; try { C.compute(d, { seeds }); } catch (e) { threw = e; }
    t.eq(!!threw, nSem > 0, `parity ${name}: semanticErrors empty ⇔ compute() does not throw (${nSem} error, ${threw ? 'threw' : 'ok'})`);
  }
  // tripwire (review รอบ 1): จำนวนจุด throw ของ compute.js + legs.js (legs ผ่าน `${P}` = path ที่ผู้เรียกส่งมา ทุกจุด)
  // วันนี้: compute.js 5 = 4 จุดความหมาย (SITES) + 1 = S.validate (สคีมา — checkDoc หยุดก่อนถึง) · legs.js 5 จุด ทั้งหมดขึ้นต้น `${P}` (= แถว L.legValue)
  // ตัวเลขขยับ = มีจุด throw ใหม่/หาย → ตรวจว่า semanticErrors ครอบหรือยัง แล้ว add a SITES row ก่อนแก้ตัวเลขนี้
  const fs = require('fs'), path = require('path');
  const src = (f) => fs.readFileSync(path.join(__dirname, '../../tools/v3', f), 'utf8');
  const count = (s, re) => (s.match(re) || []).length;
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');   // ตัดคอมเมนต์ (คำว่า throw ในคอมเมนต์ไม่นับ)
  const cSrc = code(src('compute.js')), lSrc = code(src('legs.js'));
  t.eq(count(cSrc, /\bthrow\b/g), 5, 'tripwire: compute.js has 5 throw sites — changed? add a SITES row');
  t.eq(count(cSrc, /throw new Error\(/g), 5, 'tripwire: compute.js throws are all `throw new Error(` — changed? add a SITES row');
  t.eq(count(lSrc, /\bthrow\b/g), 5, 'tripwire: legs.js has 5 throw sites — changed? add a SITES row');
  t.eq(count(lSrc, /throw new Error\(`\$\{P\}/g), 5, 'tripwire: every legs.js throw is funnelled through ${P} (path from the caller) — changed? add a SITES row');
}
// final review 2c-ii — กระจก stock-meta ของ v3 ต้องปัด mos/upside 1 ตำแหน่งเหมือน v2 (cron เขียน ≤1dp ทั้ง 909 ใบ) — ไม่งั้นการ์ด index โชว์ −27.52% ท่ามกลาง −27.5%
{ const dp = (x) => (String(x).split('.')[1] || '').length;
  t(dp(v.sm.mos) <= 1 && dp(v.sm.upside) <= 1, `sm.mos/upside ≤ 1 dp (${v.sm.mos} / ${v.sm.upside})`);
  t.near(v.sm.mos, Math.round(v.d.mos * 10) / 10, 1e-9, 'sm.mos = round1(derived mos)');
  t.near(v.sm.upside, Math.round(v.d.upside * 10) / 10, 1e-9, 'sm.upside = round1(derived upside)'); }

t.done();
