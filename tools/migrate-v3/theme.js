'use strict';
/**
 * theme.js (migrate-v3) — rd.theme ของใบ v2 → meta.themeLegacy (Plan 4b Task 5 · spec §3.5/§10.3)
 *  seed มีใน tools/seeds.json และทุกคีย์ THEME_KEYS ห่างจาก makeTheme(seed) ≤ 12 (rgbDist · gradient/rgba = ทุก stop) → null (ใช้ seed)
 *  ไม่งั้นคัด 8 คีย์เดิม · คีย์ที่ไม่ผ่าน SV.colorOK → H · badge/chgBg/chgColor (ของตกแต่ง template — v3 derive เอง) ต่างจากค่าตั้งต้น → F
 * keyDist = prototype Task 0 classify.js (colorsOf + Math.hypot)
 */
const S = require('../v3/schema.js');
const bt = require('../brandtheme.js');
const SV = require('../safe-values.js');

const colorsOf = (s) => [...String(s || '').matchAll(/#([0-9a-f]{6})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)]
  .map((m) => (m[1] ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [+m[2], +m[3], +m[4]]));
function keyDist(a, b) {
  const x = colorsOf(a), y = colorsOf(b);
  if (!x.length || x.length !== y.length) return a === b ? 0 : Infinity;
  return Math.max(...x.map((c, i) => Math.hypot(c[0] - y[i][0], c[1] - y[i][1], c[2] - y[i][2])));
}
// ค่าตั้งต้นของของตกแต่ง = build.js THEME_DEFAULTS (badge) · chg = คู่ขึ้น/ลงที่ compute ใส่เองตามทิศกราฟ (fetch-facts UP/DOWN)
const DECOR_OK = {
  badge: ['var(--blue-d)', 'var(--blue)'],
  chg: [['var(--green-soft)', '#137333'], ['var(--red-soft)', '#c5221f']],
};

function theme(sym, rdTheme, seeds) {
  const H = [], F = [];
  const th = rdTheme || {};
  const seed = seeds && seeds[sym];
  let themeLegacy = null;
  const near = seed ? (() => { const mk = bt.makeTheme(seed); return S.THEME_KEYS.every((k) => keyDist(mk[k], th[k]) <= 12); })() : false;
  if (!near) {
    themeLegacy = {};
    for (const k of S.THEME_KEYS) {
      const v = th[k];
      if (typeof v !== 'string' || !v.trim()) { H.push(`theme.${k} missing (no seed to fall back on)`); continue; }
      if (!SV.colorOK(v, k === 'darkGrad')) H.push(`theme.${k} ${JSON.stringify(v)} fails the colour allowlist`);
      themeLegacy[k] = v.trim();
    }
  }
  const badgeOff = th.badge != null && !DECOR_OK.badge.includes(String(th.badge).trim());
  const chgOff = (th.chgBg != null || th.chgColor != null) && !DECOR_OK.chg.some(([b, c]) => String(th.chgBg).trim() === b && String(th.chgColor).trim().toLowerCase() === c);
  if (badgeOff || chgOff) F.push('theme.badge/chg dropped (template decoration)');
  return { themeLegacy, H, F, seeded: !!seed, near };
}

module.exports = { theme, keyDist, colorsOf };
