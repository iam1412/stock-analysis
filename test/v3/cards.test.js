'use strict';
const t = require('./_t.js')('cards');
const K = require('../../tools/v3/cards.js');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const DV = require('../../tools/derived-values.js');
const RV = require('../../tools/report-values.js');
const TK = require('../../tools/v3/tokens.js');
const load = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
const view = C.compute(load(), { seeds: { ZTS: '#e8731a' } });

t.eq(Object.keys(K.CATALOGUE).sort(), S.CARD_KEYS.slice().sort(), 'catalogue keys = schema CARD_KEYS');
const pe = K.renderCard('pe', view, 'หมายเหตุ');
t.eq(pe.v, view.d.pe.toFixed(1) + 'x', 'pe value from compute');
t(/EPS/.test(pe.d) && DV.epsBasesOf(pe.d).includes(6.13), 'pe base line declares EPS so the E41 parser reads it');
t(/หมายเหตุ/.test(pe.d), 'note appended to base line');
const mc = K.renderCard('mcap', view);
t.near(DV.parseShares(mc.d), 443e6, 1e6, 'mcap base line parses back to shares (E43)');
const y = K.renderCard('yield', view);
t(/\$2\.00\/ปี/.test(y.d), 'yield base line = DPS per year (W19)');
// postreview Fix1 — yield card value = 2dp site-wide (reuses RV.TOKENS.yield, not a hand-rolled toFixed(1))
t.eq(y.v, RV.TOKENS.yield(view.d), 'yield card value = RV.TOKENS.yield(view.d) exactly (same formatter, no separate hand-format)');
t(/^-?\d+\.\d{2}%$/.test(y.v), `yield card value has exactly 2 decimals: ${y.v}`);
t(/BVPS \$11\.40/.test(K.renderCard('pbv', view).d), 'pbv base line = BVPS (W20)');
// Review Focus #4 — loss-making company
// legs[0] (method 'pe') needs a positive EPS to compute a fair-value leg at all (legs.js:67 final-guard,
// unrelated to the card check under test) — override it so compute() succeeds and the card's own
// eps ≤ 0 guard (cards.js) is what's exercised, not the valuation-leg guard (progress.md Task 4 note).
{ const d = load(); d.fundamentals.eps = -1.2;
  d.legs[0].override = { eps: 6.13, why: 'isolate pe-card eps≤0 guard from unrelated valuation-leg guard' };
  d.scenarios.baseOverride = { value: 6.13, why: 'scenarios.driver=eps reads fundamentals.eps directly; isolate from pe-card guard' };
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('pe', v2), /metrics\.cards: pe/, 'eps ≤ 0 → pe card rejected'); }
{ const d = load(); delete d.fundamentals.beta; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('beta', v2), /fundamentals\.beta/, 'missing data names the field'); }

// 6 คีย์เพิ่ม 24 ก.ย. 69 (Task 11 card census — docs/superpowers/specs/2026-09-24-card-census.md)
const nd = K.renderCard('netDebt', view);
t.eq(nd.v, RV.fmtBig(5.1e9, '$'), 'netDebt value = fundamentals.netDebt formatted');
const at = K.renderCard('analystTarget', view);
t.eq(at.v, `$190.00 (${TK.TOKENS_V3['analyst.pct'](view)})`, 'analystTarget % text equals the v2 token TOKENS_V3[\'analyst.pct\'] (matches {{rd:analystPct}} exactly)');
{ const d = load(); delete d.analyst; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('analystTarget', v2), /metrics\.cards: analystTarget/, 'no doc.analyst → rejected'); }
{ const d = load(); d.fundamentals.ebitda = 3000000000; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  const em = K.renderCard('ebitdaMargin', v2);
  t.eq(em.v, (3000000000 / 9400000000 * 100).toFixed(1) + '%', 'ebitdaMargin = ebitda / revenue');
  const ee = K.renderCard('evEbitda', v2);
  const ev = view.d.mcap + 5.1e9;   // mcap unaffected by ebitda addition
  t.eq(ee.v, (ev / 3000000000).toFixed(1) + 'x', 'evEbitda = (mcap+netDebt)/ebitda'); }
{ const d = load(); d.fundamentals.roic = 22.4; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('roic', v2).v, '~22.4%', 'roic from fundamentals.roic'); }
{ const d = load(); d.fundamentals.epsForward = 6.8; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('peForward', v2).v, (v2.d.px / 6.8).toFixed(1) + 'x', 'peForward = px / epsForward');
  t(DV.epsBasesOf(K.renderCard('peForward', v2).d).includes(6.8), 'peForward base line declares forward EPS so E41 reads it'); }
{ const d = load(); d.fundamentals.ebitda = 0; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('evEbitda', v2), /EBITDA ≤ 0/, 'evEbitda rejects EBITDA ≤ 0'); }
// Finding 6 — revenue ≤ 0 must throw a field-named error, never render Infinity%
{ const d = load(); d.fundamentals.ebitda = 3000000000; d.fundamentals.revenue = 0; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('ebitdaMargin', v2), /fundamentals\.revenue/, 'ebitdaMargin rejects revenue ≤ 0 instead of rendering Infinity%'); }
// Plan 2a Task 2 — ค่าเป็นมัธยฐานจาก median-multiples ⇒ label ต้องไม่เขียน "เฉลี่ย" (spec §3.2 · BBL G9)
t.eq(K.CATALOGUE.peAvg5y.label(view), 'P/E มัธยฐาน ~5 ปี', 'peAvg5y label says มัธยฐาน');
// Plan 2a Task 8 — การ์ด FY + ธนาคาร
{ const d = load(); d.fundamentals.fy = { period: 'FY2025', netIncome: 2.673e9, eps: 6.02, revenue: 9.26e9 };
  d.fundamentals.bank = { nim: 2.49, npl: 3, coverage: 324, cet1: 16.4, car: 20.9 };
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  const c = (k) => K.renderCard(k, v2);
  t.eq([c('netIncomeFy').k, c('netIncomeFy').v], ['กำไรสุทธิ FY2025', RV.fmtBig(2.673e9, '$')], 'netIncomeFy label/value');
  t.eq([c('epsFy').k, c('epsFy').v], ['EPS FY2025', '~$6.02'], 'epsFy');
  t.eq(c('revenueFy').k, 'รายได้ FY2025', 'revenueFy label');
  t.eq(c('nim').v, '2.49%', 'nim 2 dp');
  t.eq(c('npl').v, '3.0% / 324%', 'npl / coverage');
  t.eq([c('capital').v, c('capital').cls], ['~16.4% / 20.9%', 'pos'], 'capital'); }
{ const d = load(); d.fundamentals.fy = { period: 'FY2025', netIncome: -3.1e8 }; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('netIncomeFy', v2).v, '−' + RV.fmtBig(3.1e8, '$'), 'negative statement total uses U+2212, never "$-310M"'); }
{ const v2 = C.compute(load(), { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('epsFy', v2), /fundamentals\.fy/, 'FY card without fy names the field');
  t.throws(() => K.renderCard('nim', v2), /fundamentals\.bank\.nim/, 'bank card without data names the field'); }
// Plan 2a Task 9 — การ์ด REIT
{ const d = load(); Object.assign(d.fundamentals, { ffoPerShare: 3.1, ffoBasis: 'affo', ffoForward: { value: 3.4, period: 'FY2026E', low: 3.3, high: 3.5 }, pffoAvg5y: 30 });
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } }); const c = (k) => K.renderCard(k, v2);
  t.eq([c('pffo').k, c('pffo').v, c('pffo').d], ['P/AFFO (TTM)', (120 / 3.1).toFixed(1) + 'x', 'AFFO/หุ้น $3.10'], 'pffo card');
  t.eq([c('pffoForward').k, c('pffoForward').v, c('pffoForward').d], ['Forward P/AFFO', (120 / 3.4).toFixed(1) + 'x', 'AFFO FY2026E $3.30–$3.50'], 'pffoForward card shows the guidance range');
  t.eq([c('ffoPerShare').k, c('ffoPerShare').v], ['AFFO/หุ้น (TTM)', '$3.10'], 'ffoPerShare card');
  t.eq([c('pffoAvg5y').k, c('pffoAvg5y').v], ['P/AFFO เฉลี่ย ~5 ปี', '30.0x'], 'pffoAvg5y card (author-typed average — not a median-multiples value)');
  t.eq(c('ffoMargin').v, (3.1 * 443e6 / 9.4e9 * 100).toFixed(1) + '%', 'ffoMargin = FFO×shares / revenue');
  t.eq(c('ffoPayout').v, (2 / 3.1 * 100).toFixed(1) + '%', 'ffoPayout = dps / FFO per share');
  t.eq(v2.sm.pe, +(120 / 6.13).toFixed(6), '§13.5: stock-meta.pe stays price / EPS for a REIT'); }
{ const d = load(); d.fundamentals.ffoPerShare = 3.1; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('pffo', v2).k, 'P/FFO (TTM)', 'no ffoBasis → FFO label (Plan 1 wording)'); }
// Plan 2a Task 10 — การ์ดยอดงบแสดงสกุลงบ · อัตราส่วนผูกราคาใช้สกุลราคา
{ const d = load(); Object.assign(d.fundamentals, { reportCurrency: 'EUR', fx: 1.2, netDebt: -1.307e9, ebitda: 3e9 });
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('revenue', v2).v, '€9.40B', 'revenue card in EUR');
  t.eq(K.renderCard('netDebt', v2).v, '−€1.31B', 'Review Focus #4: negative total → U+2212, statement symbol');
  t.eq(K.renderCard('evEbitda', v2).v, ((v2.d.mcap - 1.307e9 * 1.2) / (3e9 * 1.2)).toFixed(1) + 'x', 'EV/EBITDA converts netDebt and EBITDA with fx');
  // Task 10 (controller ruling, carried from Task 9 review) — ฐานในบรรทัด .d ของอัตราส่วนผูกราคา = สกุลราคาเหมือนตัวอัตราส่วน
  // (gate v2 W16 อ่านเลขรายได้ใน .d แล้วคิด P/S = mcap ÷ เลขนั้น โดยไม่ดูสัญลักษณ์สกุล — พิมพ์ยอด EUR ใต้ P/S = W16 ยิง)
  const ps = K.renderCard('ps', v2);
  t.eq(ps.d, 'รายได้ TTM $11.3B', 'P/S base line = revenue converted to the quote currency');
  t.eq(K.renderCard('evEbitda', v2).d, `EV ${RV.fmtBig(v2.d.mcap - 1.307e9 * 1.2, '$')} ÷ EBITDA $3.60B`, 'EV/EBITDA base line in the quote currency'); }
// Task 13 carry (c) — EV/EBITDA .d guards its own inputs (same pattern as the ps .d guard): renderCard evaluates
// .d BEFORE .value, so an unguarded .d would format NaN instead of naming the missing field
{ const d = load(); d.fundamentals.ebitda = 3000000000; delete d.fundamentals.netDebt; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.CATALOGUE.evEbitda.d(v2), /fundamentals\.netDebt/, 'evEbitda .d without netDebt names the field');
  t.throws(() => K.renderCard('evEbitda', v2), /fundamentals\.netDebt/, 'evEbitda card without netDebt names the field'); }
{ const d = load(); delete d.fundamentals.ebitda; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.CATALOGUE.evEbitda.d(v2), /fundamentals\.ebitda/, 'evEbitda .d without ebitda names the field'); }
t.done();
