'use strict';
/**
 * prose.js — ข้อความของรายงาน v3: แทน token · escape (อนุญาตแค่ <b> <i> <br> + **bold**) · กติกา B
 * กติกา B (spec §4): ตัวเลขผูกราคาห้ามพิมพ์เอง — error เมื่อ "ตรงรูปที่ render เป๊ะ" · warn เมื่อใกล้ (tolerance)
 * countMoneyLiterals = W31: นับ literal รูปเงินที่ค้าง (ไม่เทียบราคาวันนี้ — กัน false positive เมื่อราคาขยับ)
 */
const TK = require('./tokens.js');

const TOKEN_RE = /\{\{([A-Za-z0-9.]+)\}\}/g;
const ALLOWED = /<\/?b>|<\/?i>|<br\s*\/?>/gi;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function escapeKeepAllowed(s) {
  let out = '', last = 0, m;
  ALLOWED.lastIndex = 0;
  while ((m = ALLOWED.exec(s))) { out += esc(s.slice(last, m.index)) + m[0].toLowerCase().replace(/<br\s*\/?>/, '<br>'); last = m.index + m[0].length; }
  return out + esc(s.slice(last));
}

function renderProse(str, view, opts) {
  const mode = (opts && opts.mode) || 'text';
  const withBold = String(str).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  // escape ก่อน แล้วค่อยแทน token (ค่า token เป็นตัวเลข/ข้อความที่เรา format เอง ไม่มี markup)
  return escapeKeepAllowed(withBold).replace(TOKEN_RE, (all, name) => {
    const f = TK.TOKENS_V3[name];
    if (!f) throw new Error(`token {{${name}}} ไม่รู้จัก (มี: ${Object.keys(TK.TOKENS_V3).join(', ')})`);
    if (mode === 'v2src' && TK.V2_TWIN[name]) { f(view); return `{{rd:${TK.V2_TWIN[name]}}}`; }   // เรียก f ก่อน = token ชี้ค่า null ยัง throw
    return f(view);
  });
}

function sanitizeErrors(str) {
  const stripped = String(str).replace(ALLOWED, '');
  const bad = stripped.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g) || [];
  const seen = new Set(), out = [];
  for (const tag of bad) {
    const name = (tag.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/) || [])[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(`แท็กไม่อนุญาต <${name}> — ใช้ได้แค่ <b> <i> <br> หรือ **ตัวหนา**`);
  }
  return out;
}

function proseFields(doc) {
  const out = [];
  const add = (path, text) => { if (typeof text === 'string') out.push({ path, text }); };
  for (const [k, v] of Object.entries(doc.prose || {})) add(`prose.${k}`, v);
  add('meta.sub', doc.meta && doc.meta.sub); add('meta.priceNote', doc.meta && doc.meta.priceNote);
  add('metrics.hint', doc.metrics && doc.metrics.hint);
  for (const [k, v] of Object.entries((doc.metrics && doc.metrics.notes) || {})) add(`metrics.notes.${k}`, v);
  ((doc.metrics && doc.metrics.custom) || []).forEach((c, i) => { add(`metrics.custom[${i}].value`, c.value); add(`metrics.custom[${i}].note`, c.note); });
  (doc.legs || []).forEach((l, i) => add(`legs[${i}].note`, l.note));
  ((doc.scenarios && doc.scenarios.cases) || []).forEach((c, i) => add(`scenarios.cases[${i}].desc`, c.desc));
  add('scenarios.note', doc.scenarios && doc.scenarios.note);
  (doc.catalysts || []).forEach((x, i) => add(`catalysts[${i}]`, x));
  (doc.risks || []).forEach((x, i) => add(`risks[${i}]`, x));
  (doc.extras || []).forEach((x, i) => { add(`extras[${i}].title`, x.title); add(`extras[${i}].note`, x.note);
    (x.rows || []).forEach((r, j) => r.forEach((c, k) => add(`extras[${i}].rows[${j}][${k}]`, c))); });
  return out;
}

// ค่าผูกราคาที่ห้ามพิมพ์เอง: [token, kind, ค่าดิบ] — kind: money | pct | mult
function priceBound(view) {
  const d = view.d, out = [];
  const add = (token, kind, raw) => { if (raw != null && Number.isFinite(raw)) out.push({ token, kind, raw, shown: TK.TOKENS_V3[token](view) }); };
  add('px', 'money', d.px); add('fv', 'money', d.fv); add('mos20', 'money', d.mos20); add('mos30', 'money', d.mos30);
  add('fvLow', 'money', d.values.fvLow); add('fvHigh', 'money', d.values.fvHigh);
  if (d.values.analystTgt != null) { add('analyst.target', 'money', d.values.analystTgt); add('analyst.pct', 'pct', d.analystPct); }
  add('mos', 'pct', d.mos); add('upside', 'pct', d.upside);
  if (d.yield != null) add('yield', 'pct', d.yield);
  if (d.pe != null && d.pe > 0) add('pe', 'mult', d.pe);
  if (d.pbv != null) add('pbv', 'mult', d.pbv);
  if (d.ps != null) add('ps', 'mult', d.ps);
  ['bear', 'base', 'bull'].forEach((n, i) => { const s = d.scenarios[i]; if (s) { add(`scn.${n}.tgt`, 'money', s.tgt); add(`scn.${n}.ret`, 'pct', s.total); } });
  return out;
}

const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
const CAND = [
  { kind: 'money', re: new RegExp(`(?:US\\$|\\$|฿)\\s*${NUM}`, 'g') },
  { kind: 'money', re: new RegExp(`${NUM}\\s*บาท`, 'g') },
  { kind: 'pct', re: new RegExp(`([+\\-−]?)${NUM}\\s*%`, 'g') },
  { kind: 'mult', re: new RegExp(`${NUM}\\s*(?:x|เท่า)(?![A-Za-z])`, 'g') },
];
const normShown = (s) => String(s).replace(/[\s,]/g, '').replace(/−/g, '-').replace(/^\+/, '');
// รูปเปล่าไว้เทียบ "เป๊ะ": ตัดสัญลักษณ์เงินหน้า / บาท / x / เท่า ท้าย (token pe/pbv render ไม่มี x แต่ prose มักพิมพ์ "24.5x")
const bare = (s) => normShown(s).replace(/^(US\$|\$|฿)/, '').replace(/(บาท|x|เท่า)$/, '');
const numOf = (s) => parseFloat(String(s).replace(/,/g, ''));
const TOL = { money: (a, b) => Math.abs(a - b) <= 0.015 * Math.abs(b), pct: (a, b) => Math.abs(a - b) <= 0.6, mult: (a, b) => Math.abs(a - b) <= 0.03 * Math.abs(b) };

function checkRuleB(doc, view) {
  const pb = priceBound(view), errors = [], warnings = [];
  for (const { path, text } of proseFields(doc)) {
    const plain = String(text).replace(TOKEN_RE, ' ');
    for (const { kind, re } of CAND) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(plain))) {
        const literal = m[0].trim();
        const n = kind === 'pct' ? numOf(m[2]) * (m[1] === '-' || m[1] === '−' ? -1 : 1) : numOf(m[1]);
        for (const b of pb.filter((x) => x.kind === kind)) {
          const exact = bare(literal) === bare(b.shown);
          const cmp = kind === 'pct' ? n : Math.abs(n);
          if (exact) { errors.push({ path, literal, token: b.token }); break; }
          if (TOL[kind](cmp, kind === 'pct' ? b.raw : Math.abs(b.raw))) { warnings.push({ path, literal, token: b.token }); break; }
        }
      }
    }
  }
  return { errors, warnings };
}

function countMoneyLiterals(doc) {
  let n = 0;
  for (const { text } of proseFields(doc)) {
    const plain = String(text).replace(TOKEN_RE, ' ');
    for (const { kind, re } of CAND) { if (kind !== 'money') continue; re.lastIndex = 0; n += (plain.match(re) || []).length; }
  }
  return n;
}

module.exports = { renderProse, sanitizeErrors, proseFields, checkRuleB, countMoneyLiterals, escapeKeepAllowed, TOKEN_RE };
