'use strict';
const t = require('./_t.js')('legs');
const L = require('../../tools/v3/legs.js');
const f = { eps: 6.13, dps: 2, bvps: 11.4, roe: 52, shares: 4.43e8, revenue: 9.4e9, fcf: 2.3e9, ebitda: 4e9, netDebt: 5.1e9, ffoPerShare: 3.1 };
const v = (method, inputs, extra) => L.legValue({ method, label: 'x', inputs, ...(extra || {}) }, f, 'legs[0]');
const MS = { multipleSource: 'median5y' };

t.near(v('pe', { multiple: 28, ...MS }), 171.64, 1e-9, 'pe = eps × multiple');
t.near(v('ddm', { g: 5, r: 9 }), 52.5, 1e-9, 'ddm = dps(1+g)/(r−g)');
t.near(v('pbv', { g: 5, r: 9 }), 133.95, 1e-6, 'justified pbv = (roe−g)/(r−g) × bvps');
t.near(v('pbv', { multiple: 2, ...MS }), 22.8, 1e-9, 'pbv multiple');
t.near(v('evebitda', { multiple: 18, ...MS }), 151.01580135440182, 1e-6, 'ev/ebitda');
t.near(v('dcf', { g1: 7, years1: 5, tg: 3, r: 8.5, rfCurrency: 'USD' }), 104.0819097529678, 1e-6, 'dcf 2-stage');
t.near(v('ri', { r: 9, years: 5, payout: 40 }, { override: { roe: 20, why: 'normalised' } }), 17.477769043669788, 1e-6, 'residual income with override (payout in percent units)');
t.near(v('fcfyield', { yield: 4 }), 129.79683972911963, 1e-6, 'fcf yield');
t.near(v('pfcf', { multiple: 25, ...MS }), 129.79683972911965, 1e-6, 'p/fcf');
t.near(v('ps', { multiple: 6, ...MS }), 127.313769751693, 1e-6, 'p/s');
t.near(v('evsales', { multiple: 6, ...MS }), 115.80135440180587, 1e-6, 'ev/sales');
t.near(v('pffo', { multiple: 17, ...MS }), 52.7, 1e-9, 'p/ffo');
t.near(v('declared', { value: 88, basis: 'sotp' }), 88, 0, 'declared passes value through');
t.near(v('pe', { multiple: 28, ...MS }, { override: { eps: 7, why: 'normalised' } }), 196, 1e-9, 'override eps is used');

// Review Focus #1 — legs that cannot price must name the path, never return NaN/Infinity
t.throws(() => v('ddm', { g: 9, r: 9 }), /^legs\[0\].*r.*g/, 'ddm r ≤ g');
t.throws(() => v('dcf', { g1: 7, years1: 5, tg: 9, r: 8.5, rfCurrency: 'USD' }), /^legs\[0\].*tg/, 'dcf r ≤ tg');
t.throws(() => v('pbv', { g: 9.5, r: 9 }), /^legs\[0\]/, 'justified pbv r ≤ g');
t.throws(() => L.legValue({ method: 'evebitda', inputs: { multiple: 1, ...MS } }, { ...f, ebitda: 1e6 }, 'legs[1]'), /^legs\[1\].*≤ 0/, 'negative equity value');
t.throws(() => L.legValue({ method: 'pe', inputs: { multiple: 20, ...MS } }, {}, 'legs[2]'), /^legs\[2\].*fundamentals\.eps/, 'missing fundamentals names the field');
// Plan 2a Task 6 — ddm2 (§3.1 · §3.6 N) · ธรรมเนียมรอยต่อ: โต g1 ขณะ t < years1
const FER2 = { d1: 2.04, g1: 11, years1: 10, g2: 3, r: 8.5 };
t.near(v('ddm2', { ...FER2, horizon: 40 }), 55.02209244386823, 1e-9, 'ddm2 finite 40y = FER $55.02 (spec §3.6 N)');
t(Math.abs(v('ddm2', { ...FER2, horizon: 40 }) - 57.67) > 2, 'the t ≤ years1 convention ($57.67) is NOT what we compute');
t.near(v('ddm2', { ...FER2, horizon: null }), 64.09901699407415, 1e-9, 'ddm2 horizon null = Gordon terminal after stage 1');
t.throws(() => v('ddm2', { ...FER2, g2: 9, horizon: null }), /^legs\[0\].*g2/, 'Review Focus #3: horizon null with r ≤ g2 → path-named throw');
t(v('ddm2', { ...FER2, g2: 9, horizon: 40 }) > 0, 'finite horizon needs no r > g2');
t.near(v('ddm2', { ...FER2, horizon: 5 }), 9.84424146436744, 1e-9, 'ddm2 horizon < years1 → stage 1 only, finite (Σ 2.04·1.11^(t−1)/1.085^t, t=1..5)');
// Plan 4b Task 2 — N-stage DCF (§13-3: 88/304 DCF legs are not 2-stage) · stages ≡ 2-stage when one stage
const DCF2 = { g1: 7, years1: 5, tg: 3, r: 8.5, rfCurrency: 'USD' };
t.near(v('dcf', { stages: [{ years: 5, g: 7 }], tg: 3, r: 8.5, rfCurrency: 'USD' }), v('dcf', DCF2), 1e-9, 'one stage = the 2-stage formula');
// 3-stage: 7% ×5y → 4% ×5y → terminal 3% — hand-rolled reference
{
  const r = 0.085; let fcf = f.fcf, pv = 0, t_ = 0;
  for (const st of [{ years: 5, g: 7 }, { years: 5, g: 4 }]) for (let k = 0; k < st.years; k++) { t_++; fcf *= 1 + st.g / 100; pv += fcf / Math.pow(1 + r, t_); }
  const tv = fcf * 1.03 / (r - 0.03) / Math.pow(1 + r, t_);
  t.near(v('dcf', { stages: [{ years: 5, g: 7 }, { years: 5, g: 4 }], tg: 3, r: 8.5, rfCurrency: 'USD' }), (pv + tv - f.netDebt) / f.shares, 1e-6, '3-stage DCF matches reference');
}
t.throws(() => v('dcf', { stages: [], tg: 3, r: 8.5, rfCurrency: 'USD' }), /^legs\[0\].*stages/, 'empty stages → path-named throw');
t.throws(() => v('dcf', { stages: [{ years: 5, g: 7 }], tg: 9, r: 8.5, rfCurrency: 'USD' }), /^legs\[0\].*tg/, 'stages with r ≤ tg → path-named throw');
t.done();
