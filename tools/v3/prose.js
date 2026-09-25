'use strict';
/**
 * prose.js — ข้อความของรายงาน v3: แทน token · escape (อนุญาตแค่ <b> <i> <br> + **bold**) · กติกา B
 * กติกา B (spec §4): ตัวเลขผูกราคาห้ามพิมพ์เอง — error เมื่อ "ตรงรูปที่ render เป๊ะ" · warn เมื่อใกล้ (tolerance)
 * countMoneyLiterals = W31: นับ literal รูปเงินที่ค้าง (ไม่เทียบราคาวันนี้ — กัน false positive เมื่อราคาขยับ)
 */
const TK = require('./tokens.js');
const K = require('./cards.js');

const TOKEN_RE = /\{\{([A-Za-z0-9.]+)\}\}/g;
// {{lit:…}} (spec §4 ข้อ 4 · open-item #51) — ตัวเลขที่ต้องพิมพ์ตรง (ราคา IPO ในอดีต · ตัวคูณในอดีตที่บังเอิญเท่าปัจจุบัน)
// ห้ามมีวงเล็บปีกกาข้างใน (กันซ้อน token) · ทุกข้อความใน lit ต้องมีเหตุผลใน meta.litReasons (schema) · นับด้วย W30
const LIT_RE = /\{\{lit:([^{}]+)\}\}/g;
const stripSpans = (text) => String(text).replace(LIT_RE, ' ').replace(TOKEN_RE, ' ');
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
  return escapeKeepAllowed(withBold)
    .replace(LIT_RE, (all, inner) => inner)   // inner ถูก escape แล้วในขั้นก่อน · ไม่มี { } จึงไม่ชน TOKEN_RE
    .replace(TOKEN_RE, (all, name) => {
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
  const arr = (x) => (Array.isArray(x) ? x : []);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  for (const [k, v] of Object.entries(obj(doc.prose))) add(`prose.${k}`, v);
  for (const [k, v] of Object.entries(obj(doc.text))) add(`text.${k}`, v);
  add('meta.sub', obj(doc.meta).sub); add('meta.priceNote', obj(doc.meta).priceNote);
  add('metrics.hint', obj(doc.metrics).hint);
  for (const [k, v] of Object.entries(obj(obj(doc.metrics).notes))) add(`metrics.notes.${k}`, v);
  arr(obj(doc.metrics).custom).forEach((c, i) => { add(`metrics.custom[${i}].value`, obj(c).value); add(`metrics.custom[${i}].note`, obj(c).note); });
  arr(doc.legs).forEach((l, i) => add(`legs[${i}].note`, obj(l).note));
  arr(obj(doc.scenarios).cases).forEach((c, i) => { add(`scenarios.cases[${i}].desc`, obj(c).desc); add(`scenarios.cases[${i}].retNote`, obj(c).retNote); });
  add('scenarios.note', obj(doc.scenarios).note); add('scenarios.hintNote', obj(doc.scenarios).hintNote);   // + Plan 4b Task 6b
  arr(doc.catalysts).forEach((x, i) => add(`catalysts[${i}]`, x));
  arr(doc.risks).forEach((x, i) => add(`risks[${i}]`, x));
  arr(doc.extras).forEach((x, i) => { add(`extras[${i}].title`, obj(x).title); add(`extras[${i}].note`, obj(x).note);
    arr(obj(x).rows).forEach((r, j) => {
      if (Array.isArray(r)) r.forEach((c, k) => add(`extras[${i}].rows[${j}][${k}]`, c));
      else if (obj(r).kind === 'total') arr(obj(r).cells).forEach((c, k) => add(`extras[${i}].rows[${j}].cells[${k}]`, c));
      else if (obj(r).kind === 'note') add(`extras[${i}].rows[${j}].text`, obj(r).text);
    }); });
  return out;
}

function litsOf(doc) {
  const out = [];
  for (const { path, text } of proseFields(doc)) for (const m of text.matchAll(LIT_RE)) out.push({ path, text: m[1] });
  return out;
}
const countLits = (doc) => litsOf(doc).length;
// '{{lit:' ที่ไม่ครบรูป (ซ้อน token / ไม่ปิด) → path — schema ฟ้อง (ไม่งั้นวงเล็บดิบหลุดถึงหน้าเว็บ = E13)
function malformedLitPaths(doc) {
  const out = [];
  for (const { path, text } of proseFields(doc)) {
    const lits = [...text.matchAll(LIT_RE)], opens = text.split('{{lit:').length - 1;
    // lit ติดวงเล็บปีกกา = ประกอบเป็น token สด ("{{{{lit:px}}}}" → "{{px}}") หรือรั่ววงเล็บดิบ ("{{lit:a}}}")
    const glued = lits.some((m) => text[m.index - 1] === '{' || text[m.index + m[0].length] === '}');
    if (opens !== lits.length || glued) out.push(path);
  }
  return out;
}

// ค่าผูกราคาที่ห้ามพิมพ์เอง: [token, kind, ค่าดิบ] — kind: money | pct | mult
function priceBound(view) {
  const d = view.d, out = [];
  const add = (token, kind, raw, shownOverride) => { if (raw != null && Number.isFinite(raw)) out.push({ token, kind, raw, shown: shownOverride != null ? shownOverride : TK.TOKENS_V3[token](view) }); };
  add('px', 'money', d.px); add('fv', 'money', d.fv); add('mos20', 'money', d.mos20); add('mos30', 'money', d.mos30);
  add('fvLow', 'money', d.values.fvLow); add('fvHigh', 'money', d.values.fvHigh);
  if (d.values.analystTgt != null) { add('analyst.target', 'money', d.values.analystTgt); add('analyst.pct', 'pct', d.analystPct); }
  add('mos', 'pct', d.mos); add('upside', 'pct', d.upside);
  if (d.yield != null) add('yield', 'pct', d.yield);
  if (d.pe != null && d.pe > 0) add('pe', 'mult', d.pe);
  if (d.pbv != null) add('pbv', 'mult', d.pbv);
  if (d.ps != null) add('ps', 'mult', d.ps);
  // peForward/evEbitda — ไม่มี token ในตาราง v2 (twin) แต่การ์ด section 1 พิมพ์ค่านี้แล้ว ⇒ กติกา B ต้องจับ
  // literal ที่ก๊อปมาด้วยเหมือนกัน — ใช้ K.peForwardCalc/K.evEbitdaCalc ตัวเดียวกับการ์ด (ไม่คิด/ฟอร์แมตซ้ำ)
  // ไม่มีการ์ด/ข้อมูลไม่พอ → calc throw → ข้ามเงียบ (ไม่มีขอบเขตให้ตรวจ เหมือนการ์ดที่ถอดออกจริง)
  try { const c = K.peForwardCalc(view); add('peForward', 'mult', c.raw, c.text); } catch (e) { /* no epsForward → no bound */ }
  try { const c = K.evEbitdaCalc(view); add('evEbitda', 'mult', c.raw, c.text); } catch (e) { /* no ebitda/netDebt → no bound */ }
  try { const c = K.pffoCalc(view); add('pffo', 'mult', c.raw, c.text); } catch (e) { /* no ffoPerShare → no bound */ }
  try { const c = K.pffoForwardCalc(view); add('pffoForward', 'mult', c.raw, c.text); } catch (e) { /* no ffoForward → no bound */ }
  try { const c = K.ptbvCalc(view); add('ptbv', 'mult', c.raw, c.text); } catch (e) { /* no tbvps → no bound */ }   // Plan 4b Task 1
  ['bear', 'base', 'bull'].forEach((n, i) => { const s = d.scenarios[i]; if (s) { add(`scn.${n}.tgt`, 'money', s.tgt); add(`scn.${n}.ret`, 'pct', s.total); } });
  return out;
}

const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
// spec §4 ข้อ 3 — เงินที่มีหน่วยต่อท้าย (M B K bn mn ล้าน พันล้าน…) = ยอดงบ ไม่ใช่ราคาต่อหุ้น → ข้าม
// [0-9.,]* ในตัว lookahead กัน regex ถอยไปจับ "$8" จาก "$80M"
const MONEY_UNIT = '(?![0-9.,]*\\s*(?:[MBK](?![A-Za-z])|bn(?![A-Za-z])|mn(?![A-Za-z])|(?:พัน|หมื่น|แสน)?ล้าน))';
const CAND = [
  { kind: 'money', re: new RegExp(`(?:US\\$|\\$|฿)\\s*${NUM}${MONEY_UNIT}`, 'g') },
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
    const plain = stripSpans(text);
    for (const { kind, re } of CAND) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(plain))) {
        const literal = m[0].trim();
        const n = kind === 'pct' ? numOf(m[2]) * (m[1] === '-' || m[1] === '−' ? -1 : 1) : numOf(m[1]);
        for (const b of pb.filter((x) => x.kind === kind)) {
          const exact = bare(literal) === bare(b.shown);
          const cmp = kind === 'pct' ? n : Math.abs(n);
          // spec §4 ข้อ 1–2: error = เป๊ะ "รวมทศนิยม" เท่านั้น · จำนวนเต็มล้วนเป็นอย่างมาก warn
          if (exact && /\d\.\d/.test(literal)) { errors.push({ path, literal, token: b.token }); break; }
          if (exact || TOL[kind](cmp, kind === 'pct' ? b.raw : Math.abs(b.raw))) { warnings.push({ path, literal, token: b.token }); break; }
        }
      }
    }
  }
  return { errors, warnings };
}

function countMoneyLiterals(doc) {
  let n = 0;
  for (const { text } of proseFields(doc)) {
    const plain = stripSpans(text);
    for (const { kind, re } of CAND) { if (kind !== 'money') continue; re.lastIndex = 0; n += (plain.match(re) || []).length; }
  }
  return n;
}

module.exports = { renderProse, sanitizeErrors, proseFields, checkRuleB, countMoneyLiterals, escapeKeepAllowed, TOKEN_RE, LIT_RE, stripSpans, litsOf, countLits, malformedLitPaths, priceBound, CAND, MONEY_UNIT };   // priceBound + CAND/MONEY_UNIT (Plan 4b Task 5 fix round 1 · N-3 — same regexes, no copy) exported (Plan 4b Task 1 fix round 1) — tokens.test pins every emitted name resolves; migrator tokenise (Task 5) consumes it
