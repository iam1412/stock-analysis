'use strict';
// migrator fixes for the audit's invented figures (tools/migrate-v3: cards · display · scenarios · remigrate.graftOf · render d1 line)
const t = require('./_t.js')('migrate-invented');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MC = require('../../tools/migrate-v3/cards.js');
const DS = require('../../tools/migrate-v3/display.js');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const MS = require('../../tools/migrate-v3/scenarios.js');
const RMG = require('../../tools/migrate-v3/remigrate.js');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
const FIX = path.join(ROOT, 'test', 'fixtures');

// ── cards.js: "N/A (IPO <3 ปี)" / "N/A — IPO ต.ค. 2567" are not P/E medians · "ROE / ROA ~21.6% / D/E 0.07" has no ROA ──
{
  const card = (k, v, d) => ({ k, v, vHtml: v, d: d || '', dHtml: d || '', kHtml: k });
  const parsed = (cards) => ({ s1cards: cards, sm: { currency: 'USD' }, rd: { values: {} } });
  t(MC.cardFund(parsed([card('P/E เฉลี่ย ~5 ปี', 'N/A (IPO <3 ปี)')]), {}).fund.peAvg5y == null, 'cards: "N/A (IPO <3 ปี)" → no peAvg5y (was 3)');
  t(MC.cardFund(parsed([card('P/E เฉลี่ย ~5 ปี', 'N/A — IPO ต.ค. 2567')]), {}).fund.peAvg5y == null, 'cards: "N/A — IPO ต.ค. 2567" → no peAvg5y (was 2567)');
  t(MC.cardFund(parsed([card('P/E เฉลี่ย ~5 ปี', '~18.4x (มัธยฐาน)')]), {}).fund.peAvg5y === 18.4, 'cards: a printed median still reads');
  const f1 = MC.cardFund(parsed([card('ROE / ROA', '~21.6% / D/E 0.07')]), {}).fund;
  t(f1.roa == null, 'cards: "~21.6% / D/E 0.07" → no ROA (0.07 is D/E)', JSON.stringify(f1));
  const f2 = MC.cardFund(parsed([card('ROE / ROA', '~21.6% / 1.2%')]), {}).fund;
  t(f2.roe === 21.6 && f2.roa === 1.2, 'cards: "~21.6% / 1.2%" → ROE + ROA', JSON.stringify(f2));
}

// ── display.js: the yield card's template .d prints a DPS the author never printed → the author's line (value live on the base) ──
{
  const d = JSON.parse(fs.readFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), 'utf8')); delete d._sig;
  d.meta.migratedFrom = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
  const px = d.market.px, dps = +(px * 0.0265).toFixed(4);
  d.fundamentals.dps = dps;
  if (!d.metrics.cards.some((c) => (c && c.key) === 'yield' || c === 'yield')) d.metrics.cards[d.metrics.cards.length - 1] = 'yield';
  const i = d.metrics.cards.findIndex((c) => (c && c.key) === 'yield' || c === 'yield');
  const v = C.compute(d, { seeds: SEEDS });
  const html = `<div class="metric"><div class="k">เงินปันผล</div><div class="v">2.65%</div><div class="d">$0.50/ไตรมาส (+11% YoY)</div></div>`;
  const pc = { i: 0, key: 'yield' };
  const parsed = { s1cards: PV.parseV2('ZTS', `<section><div class="n">1</div><div class="grid">${html}</div></section>`).s1cards, sm: { currency: 'USD' }, rd: { values: {} } };
  t(i >= 0 && parsed.s1cards.length === 1, 'fixture: a yield card');
  const plan = DS.cardPlan(parsed, d, v, [pc]);
  t(plan.length === 1 && plan[0].kind === 'base' && plan[0].op === 'basePct' && Math.abs(plan[0].base - dps) < 1e-9 && plan[0].d === '$0.50/ไตรมาส (+11% YoY)',
    'yield: same % but the template .d DPS is not on the v2 card → author line + live base', JSON.stringify(plan));
  const html2 = `<div class="metric"><div class="k">เงินปันผล</div><div class="v">2.65%</div><div class="d">$${dps.toFixed(2)}/ปี</div></div>`;
  const parsed2 = { ...parsed, s1cards: PV.parseV2('ZTS', `<section><div class="n">1</div><div class="grid">${html2}</div></section>`).s1cards };
  t(DS.cardPlan(parsed2, d, v, [pc]).length === 0, 'yield: the author printed the same DPS → template card kept');
}

// ── scenarios.js: a back-computed base the author never printed → author cells + noBase (no "EPS ฐาน ~X" of the template) ──
{
  const raw = fs.readFileSync(path.join(FIX, 'BBL-v2.html'), 'utf8');
  const noTok = raw.replace('EPS ฐาน ~{{rd:baseEps}}{{rd:scnNote}}', 'EPS ฐาน FY2026e (consensus){{rd:scnNote}}');
  const p = PV.parseV2('BBL', noTok); delete p.rd.values.baseEps;
  const s = MS.scenarios(p, { eps: 25 });
  t(s.meta.noBase && !s.scenarios.baseOverride && s.meta.display && s.meta.display.noBase === true, 'back-computed base not in the §6 heading → author cells + noBase', JSON.stringify({ F: s.F, H: s.H, base: s.meta.base }));
  const back = 24 / Math.pow(1.03, 3);
  const printed = raw.replace('EPS ฐาน ~{{rd:baseEps}}{{rd:scnNote}}', `EPS ฐาน ~฿${back.toFixed(2)}{{rd:scnNote}}`);
  const p2 = PV.parseV2('BBL', printed); delete p2.rd.values.baseEps;
  const s2 = MS.scenarios(p2, { eps: 25 });
  t(!s2.meta.noBase && s2.scenarios.baseOverride && s2.meta.base === 'back-computed', 'back-computed base the heading prints (within rounding) → the single-base path', JSON.stringify(s2.meta.base));
}

// ── remigrate.graftOf: DDM d1 of fresh onto the existing (worker) doc — the back-solved dps override goes ──
{
  const ex = { legs: [{ method: 'pe', inputs: { multiple: 20 } }, { method: 'ddm', inputs: { g: 5, r: 8 }, override: { dps: 1.3, why: 'x' } }], metrics: { cards: [] }, scenarios: { cases: [] }, v2Display: { fv: 40 } };
  const fr = { legs: [{ method: 'pe', inputs: { multiple: 20 } }, { method: 'ddm', inputs: { g: 5, r: 8, d1: 1.37 } }], metrics: { cards: [] }, scenarios: { cases: [] } };
  const g = RMG.graftOf(ex, fr);
  t(g && g.legs[1].inputs.d1 === 1.37 && !g.legs[1].override && g.legs[0] === ex.legs[0], 'graft: ddm d1 from fresh · dps override dropped · other legs untouched', JSON.stringify(g && g.legs));
  t(g && g.v2Display && g.v2Display.fv === 40, 'graft: legs only → the existing v2Display is kept');
  t(RMG.graftOf(ex, { ...fr, legs: [fr.legs[0], { method: 'ddm', inputs: { g: 4, r: 8, d1: 1.37 } }] }) === null, 'graft: different (g, r) → no graft');
}

// ── render: the d1 line keeps the word "ปันผล" (the author's "D₁ = ปันผล $1.37") ──
{
  const d = JSON.parse(fs.readFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), 'utf8')); delete d._sig;
  const leg = { method: 'ddm', inputs: { g: 5, r: 8, d1: 1.37 } };
  t(R.mdesc ? R.mdesc(leg, C.compute(d, { seeds: SEEDS })) === 'D₁ = ปันผล $1.37; g 5%, r 8%' : true, 'render: "D₁ = ปันผล $1.37; g 5%, r 8%"');
}

t.done();
