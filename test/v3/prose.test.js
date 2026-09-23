'use strict';
const t = require('./_t.js')('prose');
const P = require('../../tools/v3/prose.js');
const C = require('../../tools/v3/compute.js');
const K = require('../../tools/v3/cards.js');
const TKfv = (v) => require('../../tools/v3/tokens.js').TOKENS_V3.fv(v);   // "$137.86"-style (always 2 dp)
const load = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
const view = C.compute(load(), { seeds: { ZTS: '#e8731a' } });

t.eq(P.renderProse('ราคา {{px}}', view, { mode: 'text' }), 'ราคา $120.00', 'token → literal');
t.eq(P.renderProse('ราคา {{px}}', view, { mode: 'v2src' }), 'ราคา {{rd:px}}', 'v2src keeps v2 twin as rd token');
t.eq(P.renderProse('ขา {{leg1}}', view, { mode: 'v2src' }), 'ขา $171.64', 'v3-only token rendered literal in v2src');
t.eq(P.renderProse('**เด่น** a<b>b</b>', view, { mode: 'text' }), '<b>เด่น</b> a<b>b</b>', 'markdown bold + allowed tag');
// Review Focus #3 — escape everything else
t.eq(P.renderProse('a < b & <script>x</script>', view, { mode: 'text' }), 'a &lt; b &amp; &lt;script&gt;x&lt;/script&gt;', 'escape non-whitelisted markup');
t.eq(P.renderProse('<b onclick="x">y</b>', view, { mode: 'text' }), '&lt;b onclick=&quot;x&quot;&gt;y</b>', 'tags with attributes are not whitelisted');
t.eq(P.sanitizeErrors('ok <b>x</b><br>'), [], 'no errors on whitelist');
t(P.sanitizeErrors('<span style="x">y</span>').length === 1, 'reports disallowed tag');
t.throws(() => P.renderProse('{{nope}}', view, { mode: 'text' }), /\{\{nope\}\}/, 'unknown token names itself');

// rule B
{ const d = load(); d.prose.chart = 'ราคาตอนนี้ $120.00 แล้ว'; const r = P.checkRuleB(d, view);
  t(r.errors.some((e) => e.path === 'prose.chart' && e.token === 'px'), 'exact copy of px is an error'); }
{ const d = load(); d.prose.chart = 'ราคาตอนนี้ราว $120.5 แล้ว'; const r = P.checkRuleB(d, view);
  t(r.errors.length === 0 && r.warnings.some((e) => e.token === 'px'), 'near copy is a warning only'); }
{ const d = load(); d.prose.valuation = 'อัตรากำไรสุทธิ 27.6%'; const r = P.checkRuleB(d, view);
  t(r.errors.length === 0, 'statement number that is not a rendered price-bound value passes'); }
{ const d = load(); d.risks[0] = 'มูลค่าเหมาะสม ' + TKfv(view); const r = P.checkRuleB(d, view);
  t(r.errors.some((e) => e.path === 'risks[0]' && e.token === 'fv'), 'lists are scanned too'); }
// rule B — peForward/evEbitda: no v2 token twin, but the card prints them — priceBound() must still catch copies
{ const d = load(); d.fundamentals.epsForward = 6.8; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  const text = K.peForwardCalc(v2).text;   // exact string the card renders, e.g. "17.6x"
  d.prose.chart = `Forward P/E ราว ${text} ตอนนี้`;
  const r = P.checkRuleB(d, v2);
  t(r.errors.some((e) => e.path === 'prose.chart' && e.token === 'peForward'), 'exact copy of peForward is a rule-B error'); }
t.eq(P.countMoneyLiterals(load()), 0, 'fixture has no money literals');
{ const d = load(); d.prose.gauge = 'เคยแตะ $120.50 และ ฿33'; t.eq(P.countMoneyLiterals(d), 2, 'counts $ and ฿ literals (W31)'); }
// ── Plan 2a Task 1 — rule B precision (spec §4 new rules 1–4) + {{lit:}} ──
// rule 1: exact + has decimals → error (px renders "$120.00")
{ const d = load(); d.prose.chart = 'ราคา $120.00 แล้ว'; const r = P.checkRuleB(d, view);
  t(r.errors.some((e) => e.token === 'px'), 'rule 1: exact decimal copy is an error'); }
// rule 2: integer-only literal is never an error, even when it equals the rendered token exactly (mosText is "+13%"-style)
{ const d = load(); d.prose.chart = 'MOS ' + view.d.mosText; const r = P.checkRuleB(d, view);
  t(!/\./.test(view.d.mosText), `precondition: mos token renders integer (${view.d.mosText})`);
  t(r.errors.length === 0 && r.warnings.some((w) => w.token === 'mos'), 'rule 2: integer exact match → warning only'); }
// rule 3: money with a unit suffix is a statement amount, not a per-share price — skipped completely
for (const lit of ['$120M', '$120 M', '$1,20B', '฿120 ล้าน', '฿120 พันล้าน', '$120bn', '$120K']) {
  const d = load(); d.prose.chart = `ยอด ${lit} ต่อปี`; const r = P.checkRuleB(d, view);
  t(r.errors.length === 0 && r.warnings.length === 0, `rule 3: "${lit}" skipped (no error, no warning)`);
}
{ const d = load(); d.prose.chart = 'ยอด $80M'; t.eq(P.countMoneyLiterals(d), 0, 'ruling R2: W31 does not count unit-suffixed money'); }
// rule 4 / #51: {{lit:…}} renders its text verbatim and is invisible to rule B and W31
{ const d = load(); d.prose.chart = 'เคยซื้อขายที่ {{lit:$120.00}} ตอน IPO';
  t.eq(P.renderProse(d.prose.chart, view, { mode: 'v2src' }), 'เคยซื้อขายที่ $120.00 ตอน IPO', 'lit renders inner text');
  t.eq(P.checkRuleB(d, view).errors, [], 'lit is skipped by rule B');
  t.eq(P.countMoneyLiterals(d), 0, 'lit is not a W31 money literal');
  t.eq(P.countLits(d), 1, 'countLits counts it');
  t.eq(P.litsOf(d), [{ path: 'prose.chart', text: '$120.00' }], 'litsOf reports path + text'); }
t.eq(P.renderProse('a {{lit:x < y}} b', view, { mode: 'text' }), 'a x &lt; y b', 'lit inner text is escaped');
{ const d = load(); d.prose.chart = 'bad {{lit:{{px}}}}'; t.eq(P.malformedLitPaths(d), ['prose.chart'], 'nested token inside lit is malformed'); }
{ const d = load(); d.prose.chart = 'open {{lit:9.0x'; t.eq(P.malformedLitPaths(d), ['prose.chart'], 'unclosed lit is malformed'); }
// proseFields must never throw on malformed nested entries (schema calls it on arbitrary input)
{ const d = load(); d.legs = [null, d.legs[1]]; d.metrics.custom = [null]; d.scenarios.cases = [null, d.scenarios.cases[1], d.scenarios.cases[2]];
  d.extras = [{ after: 'valuation', title: 'x', headers: ['a'], rows: [null, ['b']] }, null];
  let ok = true; try { P.proseFields(d); } catch (e) { ok = false; }
  t(ok, 'proseFields tolerates null legs/custom/cases/extras/rows'); }
t.done();
