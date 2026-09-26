'use strict';
/**
 * residual.js — ส่วนที่ผู้เขียน v2 เขียนเพิ่มในหมวด (นอกโครงของ template) → บล็อกข้อความ/ตารางตามตัว (เจ้าของ 27 ก.ย. 69 "ข้อความของผู้เขียนตามตัว · ข้อความหายคือ error")
 *   เดิม parser อ่านเฉพาะโครงของ skeleton (การ์ด · <p> · ขา · เกจ · คอลัมน์ฉาก · กล่อง catalyst/risk · verdict) ⇒ กล่องหมายเหตุ/ตารางงบ/หัวข้อ h3 ที่ผู้เขียนแทรกหาย
 *   (ORI หมายเหตุปันผล · FER/CCEP/TD ตารางงบสกุลอื่น · B/FTS กล่อง "อ่านก่อน" · FICO ย่อหน้าใต้เครื่องคิด MOS · TSCO/IMO การ์ดวินิจฉัย · TGH การ์ดเหตุการณ์ในอดีต)
 *   residualOf(sym, html) → { html (หน้า v2 ที่ตัดบล็อกออกแล้ว — ให้ parser อ่านส่วนที่เหลือตามเดิม), blocks: [{after: '<n>', section?: {n?, title?}, parts: [{text} | {table: {headers, rows}}]}] }
 *   บล็อกในหมวด = การ์ดท้ายหมวดเดิม (โซนเดียวกัน) · section = หมวดเสริมของผู้เขียนทั้งหมวด (เลข/หัวของผู้เขียน) ต่อจากหมวด after
 *   หมวดเสริม (ไม่มีเลข / เลข > 8) ที่ไม่ใช่ตารางเดียว (extrasOf รับไม่ได้) → บล็อกหลังหมวดก่อนหน้า
 * อ่านอย่างเดียว — ไม่เขียนไฟล์ · ใช้เฉพาะใบ migrate (v2Display.blocks)
 */
const MP = require('./prose.js');
const PV = require('./parse-v2.js');

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr', 'source', 'col', 'area', 'base', 'embed', 'param', 'track']);
// โครงของ template ที่ parser อ่านแล้ว (class แรกของ element)
const COMPONENT = new Set(['s-head', 'grid', 'chart-wrap', 'legend', 'vmethod', 'fv-box', 'gauge', 'mos-verdict', 'calc', 'scn', 'cr', 'verdict']);
const HAS_COMPONENT = /class="(?:vmethod|chart-wrap|gauge|mos-verdict|calc|grid\b[^"]*|legend|fv-box|scn|cr|verdict)"/;
// หมวดที่ parser อ่าน <p> ทุกย่อหน้า (s1paras · prose.chart · valIntro/valuation · prose.gauge · scenarios.note · verdictBody) — หมวด 5/7 ไม่อ่าน <p>
const P_CONSUMED = new Set([1, 2, 3, 4, 6, 8]);

/** element ชั้นบนสุดของ html → [{tag, cls, start, end}] · ข้อความนอก element = {tag: '#text'} */
function topElements(html) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  const stack = [];
  let m, textFrom = 0, cur = null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const close = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3] || '';
    if (!close) {
      const selfClose = VOID.has(tag) || /\/\s*$/.test(attrs);
      if (!stack.length) {
        if (m.index > textFrom && html.slice(textFrom, m.index).trim()) out.push({ tag: '#text', cls: '', start: textFrom, end: m.index });
        const cls = ((/\bclass="([^"]*)"/.exec(attrs) || [])[1] || '').trim().split(/\s+/)[0] || '';
        cur = { tag, cls, start: m.index, end: null };
        if (selfClose) { cur.end = re.lastIndex; out.push(cur); cur = null; textFrom = re.lastIndex; continue; }
      }
      if (!selfClose) stack.push(tag);
    } else {
      const k = stack.lastIndexOf(tag);
      if (k < 0) continue;
      stack.length = k;
      if (!stack.length && cur) { cur.end = re.lastIndex; out.push(cur); cur = null; textFrom = re.lastIndex; }
    }
  }
  if (cur) { cur.end = html.length; out.push(cur); textFrom = html.length; }
  if (textFrom < html.length && html.slice(textFrom).trim()) out.push({ tag: '#text', cls: '', start: textFrom, end: html.length });
  return out;
}
const hasText = (h) => /[\p{L}\p{N}]/u.test(PV.text(String(h).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')));

/** ช่วงที่เป็นบล็อกของผู้เขียนในเนื้อหมวด n (offset ภายใน body) */
function residualRanges(body, n, base, depth) {
  const out = [];
  let seenContent = !!depth;   // ก่อนเนื้อหาของ template ตัวแรก (หลัง s-head) = บล็อกหัวหมวด (top)
  for (const el of topElements(body)) {
    const h = body.slice(el.start, el.end);
    const top = !seenContent;
    if (el.tag === '#text') { if (hasText(h)) out.push([base + el.start, base + el.end, top]); continue; }
    if (el.tag === 'script' || el.tag === 'style') continue;
    if (COMPONENT.has(el.cls)) { if (el.cls !== 's-head') seenContent = true; continue; }
    if (el.tag === 'p' && P_CONSUMED.has(n)) { seenContent = true; continue; }
    // การ์ดหลักของหมวด (มีโครง template ข้างใน) — ลงไปดูลูกของมัน · การ์ดที่ไม่มีโครง template = บล็อกของผู้เขียนทั้งการ์ด
    if (el.tag === 'div' && HAS_COMPONENT.test(h)) {
      const open = /^<[^>]*>/.exec(h)[0].length, close = h.lastIndexOf('</');
      out.push(...residualRanges(h.slice(open, close), n, base + el.start + open, 1));
      seenContent = true;
      continue;
    }
    if (hasText(h)) out.push([base + el.start, base + el.end, top]);
  }
  return out;
}

/** HTML ของบล็อก → parts ตามลำดับ: ตาราง = {table: {headers, rows}} (cell = prose) · ข้อความอื่น = {text} (prose · หัวข้อ h3/h4/.mname เป็นตัวหนา + ขึ้นบรรทัด) */
function partsOf(html) {
  const parts = [];
  const pushText = (h) => {
    const t = MP.htmlToProse(String(h)
      .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, '<b>$2</b><br>')
      .replace(/<div class="mname"[^>]*>([\s\S]*?)<\/div>/gi, '<b>$1</b><br>')
      .replace(/<\/(?:p|div|li|h[1-6]|ul|ol)>/gi, '<br>').replace(/<li\b[^>]*>/gi, '• '))
      .replace(/(?:<br>\s*){2,}/g, '<br>').replace(/^(?:\s*(?:<br>|•)\s*)+|(?:\s*<br>\s*)+$/g, '').trim();
    if (t && /[\p{L}\p{N}]/u.test(t.replace(/<[^>]*>/g, ''))) parts.push({ text: t });
  };
  let at = 0;
  for (const m of String(html).matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    pushText(html.slice(at, m.index));
    const rowsAll = [...m[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => ({ th: c[1].toLowerCase() === 'th', v: MP.htmlToProse(c[2]) })));
    const rows = rowsAll.filter((r) => r.length);
    let headers = [];
    if (rows.length && rows[0].every((c) => c.th)) headers = rows.shift().map((c) => c.v.replace(/<[^>]*>/g, '').replace(/[{}<>]/g, ''));
    parts.push({ table: { headers, rows: rows.map((r) => r.map((c) => c.v)) } });
    at = m.index + m[0].length;
  }
  pushText(html.slice(at));
  return parts;
}

/** หน้า v2 → { html (ตัดบล็อกของผู้เขียนออก), blocks } */
function residualOf(sym, html) {
  const src = String(html);
  const cuts = [], blocks = [];
  let lastN = null;
  const re = /<section\b[^>]*>([\s\S]*?)<\/section>/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(src))) {
    const body = m[1], bodyAt = m.index + m[0].indexOf(body);
    const nm = /<div class="n">(\d+)<\/div>/.exec(body);
    const n = nm ? +nm[1] : null;
    if (n != null && n >= 1 && n <= 8 && !seen.has(n)) {
      seen.add(n); lastN = n;
      for (const [a, b, top] of residualRanges(body, n, bodyAt, 0)) { cuts.push([a, b]); const bl = { after: String(n) }; if (top) bl.at = 'top'; bl.parts = partsOf(src.slice(a, b)); blocks.push(bl); }
    } else if (lastN != null) {
      // หมวดเสริม: ตารางเดียว = extrasOf ของ assemble (ไม่ยุ่ง) · อื่น ๆ = บล็อกทั้งหมวด (หัวหมวด h2 เป็นตัวหนา)
      const tables = body.match(/<table\b[\s\S]*?<\/table>/g) || [];
      const rest = PV.text(body.replace(/<div class="s-head">[\s\S]*?<\/div>\s*<\/div>|<div class="s-head">[\s\S]*?<\/h2>\s*<\/div>/, '').replace(/<h[23][^>]*>[\s\S]*?<\/h[23]>/g, '').replace(/<table\b[\s\S]*?<\/table>/g, ''));
      if (tables.length === 1 && !rest) continue;
      cuts.push([m.index, m.index + m[0].length]);
      // หมวดเสริมคงเป็นหมวดของมันเอง (เลข + หัว h2 ของผู้เขียน · TPG หมวด 9 · ILMN ไม่มีเลข)
      const head = /<div class="s-head">[\s\S]*?<\/h2>(?:\s*<div class="hint">[\s\S]*?<\/div>)?\s*<\/div>/.exec(body);
      const h2 = head ? MP.htmlToProse((/<h2>([\s\S]*?)<\/h2>/.exec(head[0]) || [])[1] || '').replace(/<[^>]*>/g, '').replace(/[{}<>]/g, '').trim() : '';
      const sec = {}; if (n != null) sec.n = n; if (h2) sec.title = h2;
      blocks.push({ after: String(lastN), section: sec, parts: partsOf(head ? body.replace(head[0], ' ') : body) });
    }
  }
  const keep = blocks.map((b) => ({ ...b, parts: b.parts.filter((p) => p.text || (p.table && p.table.rows.length + p.table.headers.length)) })).filter((b) => b.parts.length);
  let out = src;
  for (const [a, b] of cuts.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(b);
  return { html: out, blocks: keep };
}

module.exports = { residualOf, topElements, residualRanges, partsOf };
