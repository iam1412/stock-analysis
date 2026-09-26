'use strict';
/**
 * prose.js (migrate-v3) — HTML prose ของใบ v2 → prose v3 (Plan 4b Task 5 · spec §10.1)
 *  htmlToProse: ถอด entity · คง <b> <i> <br> · แท็กอื่นทิ้งแต่เก็บข้อความ (pill/span/emoji เก็บเป็นข้อความ) · {{rd:X}} → {{twin v3}}
 *  tokenise:    แทน literal ด้วย token เฉพาะจุดที่หน้าที่ render ออกมาเหมือนเดิมทุก byte (a) หรือป้ายเป็นเจ้าของเลข (b · E44 PROSE_BOUND)
 *               ★ ไม่แทนเพราะ "ค่าใกล้กัน" เด็ดขาด · token ที่ไม่อยู่ใน TK.TOKENS_V3 = ข้าม (กันพลาด · ไม่จด D)
 *  staleCopies: literal ที่เท่าค่า ณ วันวิเคราะห์ (px/pe/mos/upside) แต่ไม่เท่าวันนี้ → จด D (ไม่แก้ข้อความ)
 * อ่านอย่างเดียว — ไม่เขียนไฟล์
 */
const TK = require('../v3/tokens.js');
const P = require('../v3/prose.js');

const V2_TO_V3 = Object.fromEntries(Object.entries(TK.V2_TWIN).map(([v3, v2]) => [v2, v3]));
const ENT = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', bull: '•', middot: '·', mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', sbquo: '‚', bdquo: '„', prime: '′', Prime: '″', thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '', zwnj: '', shy: '', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³', micro: 'µ', check: '✓', infin: '∞', ne: '≠', harr: '↔',
  times: '×', minus: '−', divide: '÷', le: '≤', ge: '≥', asymp: '≈', deg: '°', plusmn: '±', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', uarr: '↑', darr: '↓' };
const decode = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&([a-z][a-z0-9]*);/gi, (m, k) => (Object.prototype.hasOwnProperty.call(ENT, k) ? ENT[k] : Object.prototype.hasOwnProperty.call(ENT, k.toLowerCase()) ? ENT[k.toLowerCase()] : m));

/** HTML ของ v2 → prose v3 · unknown = รายการชื่อ rd token ที่ไม่มีคู่ v3 (caller จด H) — ค้างไว้เป็น {{rd:X}} ให้ schema ฟ้องต่อ */
function htmlToProse(html, unknown) {
  let s = String(html == null ? '' : html);
  // แท็กก่อน entity (กัน &lt;b&gt; ที่ผู้เขียนตั้งใจพิมพ์เป็นข้อความถูกตีเป็นแท็ก)
  s = s.replace(/<\s*(\/?)\s*(b|strong)\b[^>]*>/gi, '<$1b>')
    .replace(/<\s*(\/?)\s*(i|em)\b[^>]*>/gi, '<$1i>')
    .replace(/<\s*br\s*\/?\s*>/gi, '<br>')
    .replace(/<\/?(?:div|p|li|ul|ol|table|thead|tbody|tr|td|th|h[1-6]|section|header|footer)\b[^>]*>/gi, ' ')   // แท็กบล็อก = ช่องว่าง
    .replace(/<(?!\/?b>|\/?i>|br>)\/?[a-zA-Z][^>]*>/g, '')   // แท็ก inline (span/pill/small/a…) ทิ้ง เก็บข้อความ
    .replace(/<!--[\s\S]*?-->/g, ' ');
  s = decode(s);
  s = s.replace(/\{\{rd:([A-Za-z0-9]+)\}\}/g, (all, k) => {
    if (V2_TO_V3[k]) return `{{${V2_TO_V3[k]}}}`;
    if (unknown) unknown.push(k);
    return all;
  });
  return s.replace(/\s+/g, ' ').replace(/\s*<br>\s*/g, '<br>').trim()
    .replace(/^(?:<br>)+|(?:<br>)+$/g, '').trim();
}

// ── (a) CAND ของกติกา B — ตัวเดียวกับ tools/v3/prose.js (import ไม่ก๊อป) · ห่อเป็น factory เพราะ RegExp /g มี lastIndex ติดตัว ──
const CAND = P.CAND.map((c) => ({ kind: c.kind, re: () => new RegExp(c.re.source, c.re.flags) }));
const normShown = (s) => String(s).replace(/[\s,]/g, '').replace(/−/g, '-').replace(/^\+/, '');
const bare = (s) => normShown(s).replace(/^(US\$|\$|฿)/, '').replace(/(บาท|x|เท่า)$/, '');

/** ช่วงข้อความที่แตะได้ (นอก {{token}}/{{lit:…}} และนอกแท็ก) — [start, end) */
function freeSpans(text) {
  const out = []; let last = 0;
  for (const m of text.matchAll(/\{\{[^{}]*\}\}|<[^>]*>/g)) { if (m.index > last) out.push([last, m.index]); last = m.index + m[0].length; }
  if (last < text.length) out.push([last, text.length]);
  return out;
}
/** ค่า token ที่ render ได้บน view — null เมื่อไม่มีใน TOKENS_V3 หรือชี้ค่าที่ไม่มี */
function shownOf(token, view) {
  const f = TK.TOKENS_V3[token];
  if (!f) return null;
  try { return f(view); } catch (_) { return null; }
}

/** แทน literal → token · hits = RV.proseBoundHits(<field html>, view.d) (ชื่อ token v2) · field = ชื่อช่องไว้เขียน D
 *  opts.e44 = Set("token|ข้อความ") — literal ที่ E44 ฟ้องในต้นฉบับ v2 ของใบวิเคราะห์ ≥ RV.PROSE_TOKEN_SINCE (ค่าต่างก็แทน — literal ค้าง) · คืน { text, D, F, n } (n = จำนวน token ที่ใส่) */
function tokenise(text, view, hits, field, opts) {
  const e44 = opts && opts.e44;   // Set("token|ข้อความ") ของ literal ที่ E44 ฟ้องในต้นฉบับ v2 (ใบ ≥ SINCE) · อื่น = ไม่มี
  let s = String(text);
  const D = [], F = []; let n = 0;
  const where = field || 'text';
  // (b) ป้ายเป็นเจ้าของเลข (E44) — แทนเฉพาะเมื่อตัวเลขที่ render เท่ากับที่ผู้เขียนพิมพ์ (display-fix · เจ้าของ 26 ก.ย. 69:
  //     หน้า v3 ต้องแสดงสิ่งที่หน้า v2 แสดง — เดิมแทนแม้ค่าต่าง ⇒ A "+11.8%" กลายเป็น "+1.3%") · ค่าต่าง = คง literal ของผู้เขียน + จด F
  const only = opts && opts.only;   // display-fix2: ชุด token ที่ยอมให้แทนในช่องนี้ (prose.disclaimerSources = เฉพาะตัวเลขของผู้เขียน/analyst — ไม่ใช่ราคา/วันที่)
  for (const h of hits || []) {
    const name = V2_TO_V3[h.token] || h.token;
    if (only && !only.has(name)) continue;
    const shown = shownOf(name, view);
    if (shown == null) continue;   // token ที่ไม่มีใน TOKENS_V3 / ไม่มีค่า = ข้าม (ไม่จด D)
    // ใบที่วิเคราะห์ตั้งแต่ RV.PROSE_TOKEN_SINCE (opts.e44): literal ผูกราคาใน prose ผิดกติกา E44 อยู่แล้ว (ต้องเป็น token) — ค่าต่าง = literal ค้าง
    //   ⇒ ใช้ token สด (คำตัดสิน controller 26 ก.ย. 69 · NDSN/NOC) · audit รับเฉพาะคลาสนี้ (v2-stale-prose-e44)
    const same = bare(h.text) === bare(shown);
    if (!same && !(e44 && e44.has(`${h.token}|${h.text}`))) { F.push(`prose:${where} "${h.text}" kept (v3 {{${name}}} would show "${shown}")`); continue; }
    if (!same) F.push(`prose:${where} "${h.text}" → {{${name}}} "${shown}" (E44: the v2 literal was stale — live token)`);
    let done = false;
    for (const [a, b] of freeSpans(s)) {
      const i = s.slice(a, b).indexOf(h.text);
      if (i < 0) continue;
      const at = a + i;
      s = s.slice(0, at) + `{{${name}}}` + s.slice(at + h.text.length); n++; done = true;
      break;
    }
    if (!done) continue;
  }
  // (a) literal ที่ render เท่ากันทุก byte กับค่าผูกราคา/ค่าจากงบ (eps dps bvps epsFy) — ใส่ token ตรงส่วนที่เท่ากันเท่านั้น
  const cands = P.priceBound(view).map((b) => ({ token: b.token, kind: b.kind, shown: b.shown }));
  for (const [token, kind] of [['eps', 'money'], ['dps', 'money'], ['bvps', 'money'], ['epsFy', 'money']]) {
    const sh = shownOf(token, view); if (sh != null) cands.push({ token, kind, shown: sh });
  }
  const usable = cands.filter((c) => TK.TOKENS_V3[c.token] && c.shown != null && /\d\.\d/.test(c.shown) && (!only || only.has(c.token)));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (const [a, b] of freeSpans(s)) {
      const seg = s.slice(a, b);
      for (const { kind, re } of CAND) {
        const R = re(); let m;
        while ((m = R.exec(seg))) {
          const lit = m[0].trim(), litAt = a + m.index + m[0].indexOf(lit);
          const c = usable.find((x) => x.kind === kind && bare(lit) === bare(x.shown) && lit.includes(x.shown));
          if (!c) continue;
          const at = litAt + lit.indexOf(c.shown);
          s = s.slice(0, at) + `{{${c.token}}}` + s.slice(at + c.shown.length); n++;
          changed = true; break outer;
        }
      }
    }
  }
  return { text: s, D, F, n };
}

const decOf = (s) => { const m = /[0-9][0-9,]*(?:\.([0-9]+))?/.exec(String(s)); return m && m[1] ? m[1].length : 0; };
const half = (s) => 0.5 * 10 ** -decOf(s);
const numIn = (s) => { const m = /([0-9][0-9,]*(?:\.[0-9]+)?)/.exec(String(s)); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
const owns = (lit, want) => want != null && Number.isFinite(want) && Math.abs(numIn(lit) - Math.abs(want)) <= half(lit) + 1e-9;

/** literal ที่เป็นสำเนาค่า ณ วันวิเคราะห์ (apx = {px, pe, mos, upside}) และไม่ใช่ค่าวันนี้ (d = view.d) → [{lit, why}] (เกณฑ์ = prototype Task 0) */
function staleCopies(text, apx, d) {
  const out = [];
  if (!apx || apx.err || !d) return out;
  for (const [a, b] of freeSpans(String(text))) {
    const seg = String(text).slice(a, b);
    for (const { kind, re } of CAND) {
      const R = re(); let m;
      while ((m = R.exec(seg))) {
        const lit = m[0].trim();
        const n = kind === 'pct' ? parseFloat(m[2].replace(/,/g, '')) * (m[1] === '-' || m[1] === '−' ? -1 : 1) : parseFloat(m[1].replace(/,/g, ''));
        let why = null;
        if (kind === 'money' && apx.px != null && owns(lit, apx.px) && !owns(lit, d.px)) why = 'px@analysis';
        if (kind === 'pct' && /^[+\-−~]/.test(lit) && apx.mos != null && Math.abs(n - apx.mos) <= half(lit) + 1e-9 && Math.abs(n - d.mos) > half(lit)) why = 'mos@analysis';
        if (!why && kind === 'pct' && /^[+\-−]/.test(lit) && apx.upside != null && Math.abs(n - apx.upside) <= half(lit) + 1e-9 && Math.abs(n - d.upside) > half(lit)) why = 'upside@analysis';
        if (kind === 'mult' && apx.pe != null && decOf(lit) >= 1 && Math.abs(n - apx.pe) <= half(lit) + 1e-9 && !(d.pe != null && Math.abs(n - d.pe) <= half(lit))) why = 'pe@analysis';
        if (why) out.push({ lit, why });
      }
    }
  }
  return out;
}

module.exports = { htmlToProse, tokenise, staleCopies, decode, bare, V2_TO_V3, freeSpans, CAND, shownOf };
