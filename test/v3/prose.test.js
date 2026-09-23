'use strict';
const t = require('./_t.js')('prose');
const P = require('../../tools/v3/prose.js');
const C = require('../../tools/v3/compute.js');
const K = require('../../tools/v3/cards.js');
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
{ const d = load(); d.risks[0] = 'MOS อยู่ที่ ' + view.d.mosText; const r = P.checkRuleB(d, view);
  t(r.errors.some((e) => e.path === 'risks[0]' && e.token === 'mos'), 'lists are scanned too'); }
// rule B — peForward/evEbitda: no v2 token twin, but the card prints them — priceBound() must still catch copies
{ const d = load(); d.fundamentals.epsForward = 6.8; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  const text = K.peForwardCalc(v2).text;   // exact string the card renders, e.g. "17.6x"
  d.prose.chart = `Forward P/E ราว ${text} ตอนนี้`;
  const r = P.checkRuleB(d, v2);
  t(r.errors.some((e) => e.path === 'prose.chart' && e.token === 'peForward'), 'exact copy of peForward is a rule-B error'); }
t.eq(P.countMoneyLiterals(load()), 0, 'fixture has no money literals');
{ const d = load(); d.prose.gauge = 'เคยแตะ $120.50 และ ฿33'; t.eq(P.countMoneyLiterals(d), 2, 'counts $ and ฿ literals (W31)'); }
t.done();
