'use strict';
/**
 * parse-v2.js — อ่านใบ v2 (reports/<SYM>.html ต้นฉบับ ก่อน expand) ออกเป็นโซนที่ migrator v2→v3 จะ map (Plan 4b · spec §8)
 * header/tags/px-meta · การ์ดหมวด 1 · ขา .vmethod หมวด 3 · คอลัมน์ฉากหมวด 6 · catalyst/risk หมวด 7 · verdict หมวด 8 · disc/footer
 * อ่านอย่างเดียว — ไม่เขียนไฟล์ ไม่ตีความตัวเลข (การจัดวิธี/แกะ inputs ของขา = tools/migrate-v3/legs.js)
 * HTML ของ prose เก็บดิบ (รวม token {{rd:…}}) — การแปลงเป็น v3 เป็นงานของ migrator ไม่ใช่ parser
 * ต้นทาง: prototype Plan 4 Task 0 (วัดบนคลังจริง 25 ก.ย. 69) · ไม่ใช่วงวน: ใช้ report-meta/footer-date/derived-values แบบอ่านอย่างเดียว
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const RM = require('../report-meta.js');
const FD = require('../queue/footer-date.js');
const DV = require('../derived-values.js');

const decode = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (h) => decode(String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const first = (re, s) => { const m = re.exec(s); return m ? m[1] : null; };

/** ทุก <section> ตามลำดับ — n = เลขหมวดจาก .n (null = หมวดเสริมไม่มีเลข) · hint = .s-head .hint (HTML ดิบ) */
function sections(html) {
  const out = [];
  const re = /<section\b[^>]*>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = re.exec(html))) {
    const body = m[1];
    const n = first(/<div class="n">(\d+)<\/div>/, body);
    const hint = first(/<div class="s-head">[\s\S]*?<div class="hint">([\s\S]*?)<\/div>\s*<\/div>/, body);
    out.push({ n: n == null ? null : +n, body, hint, at: m.index });
  }
  return out;
}

/** การ์ด k/v/d (regex เดียวกับ healer — DV.CARD_SRC) · vcls/dcls = class โทนสีต่อท้าย · *Html = ดิบ (token คงไว้) */
function cards(body) {
  const out = [];
  const re = new RegExp(DV.CARD_SRC, 'g');
  let m;
  while ((m = re.exec(body))) {
    const vOpen = m[2], dBlock = m[4] || '';
    const vcls = (vOpen.match(/class="v\s*([^"]*)"/) || [])[1] || '';
    const dcls = (dBlock.match(/<div class="d\s*([^"]*)"/) || [])[1] || '';
    out.push({ kHtml: m[1], k: text(m[1]), vHtml: m[3], v: text(m[3]), vcls: vcls.trim(), dHtml: m[5] || '', d: text(m[5] || ''), dcls: dcls.trim() });
  }
  return out;
}

/** ขาประเมินในหมวด 3 — vmethod = <div class="vmethod"><div><div class="mname">…</div><div class="mdesc">…</div></div><div class="mval">…</div></div>
 *  ขาที่มี mname แต่ไม่มีค่า (.mval ว่าง/ไม่มี) ติด empty:true · mval null — คิดซ้ำ/declare ไม่ได้ ไม่ throw
 *  เปลือกที่ไม่มี mname (คลังจริง: <div class="vmethod"></div> เปล่า · หรือ vmethod ไม่ปิดที่ห่อ .fv-box) ไม่มีเนื้อหา ⇒ ไม่ออกเป็นขา
 *  blocks = จำนวน class="vmethod" ดิบ — blocks > legs.length คือหลักฐานว่ามีเปลือกถูกข้าม (migrator จดหมายเหตุ) */
function legs(body) {
  const out = [];
  const re = /<div class="vmethod">\s*<div>\s*<div class="mname">([\s\S]*?)<\/div>\s*(?:<div class="mdesc">([\s\S]*?)<\/div>\s*)?<\/div>\s*(?:<div class="mval">([\s\S]*?)<\/div>)?/g;
  let m;
  while ((m = re.exec(body))) {
    const mdesc = text(m[2] || ''), mval = text(m[3] || '');
    out.push({ mnameHtml: m[1], mname: text(m[1]), mdescHtml: m[2] || '', mdesc, mvalHtml: m[3] || '', mval: mval || null, empty: !mval });
  }
  return { legs: out, blocks: (body.match(/class="vmethod"/g) || []).length };
}

// ย่อหน้า <p> ในหมวด — HTML ดิบ (token {{rd:…}} คงไว้)
function paras(body) {
  const out = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/g; let m;
  while ((m = re.exec(body))) out.push(m[1]);
  return out;
}

/** ใบ v2 ทั้งใบ → โซน · rd = report-data (null ถ้าอ่านไม่ได้) · sm = stock-meta · fd = วันที่ footer "ข้อมูล ณ" · aiModel = <meta ai-model>
 *  byN = หมวดแรกของแต่ละเลข · extraSecs = หมวดไม่มีเลข/เลข > 8 (migrator ต้องตัดสินเอง) */
function parseV2(sym, html) {
  const rdS = RM.readReportData(html);
  const rd = rdS && rdS.ok ? rdS.data : null;
  const sm = RM.readStockMeta(html);
  const fd = FD.footerDate(html);
  const header = first(/<header>([\s\S]*?)<\/header>/, html) || '';
  const secs = sections(html);
  const byN = {}; for (const s of secs) if (s.n != null && !byN[s.n]) byN[s.n] = s;
  const extraSecs = secs.filter((s) => s.n == null || s.n > 8);
  const s1 = byN[1], s3 = byN[3], s6 = byN[6], s7 = byN[7], s8 = byN[8];
  const L = s3 ? legs(s3.body) : { legs: [], blocks: 0 };
  const disc = first(/<div class="disc">([\s\S]*?)<\/div>/, html) || '';
  const footer = first(/<footer[^>]*>([\s\S]*?)<\/footer>/, html) || '';
  const h1 = first(/<h1>([\s\S]*?)<\/h1>/, header);
  const sub = first(/<div class="sub">([\s\S]*?)<\/div>/, header);
  const tags = [...header.matchAll(/<span class="tag">([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
  const pxMeta = first(/<div class="px-meta">([\s\S]*?)<\/div>/, header) || '';
  const fvBoxL = s3 ? first(/<div class="fv-box">\s*<div class="l">([\s\S]*?)<br>/, s3.body) : null;
  // หมวด 6 — คอลัมน์ Bear/Base/Bull: top = [ชื่อฉาก, สมมติฐาน] · lis = [label, ค่า text, ค่า HTML]
  const cols = [];
  if (s6) for (const m of s6.body.matchAll(/<div class="col (bear|base|bull)">([\s\S]*?)<\/ul>/g)) {
    const c = m[2];
    const top = [...c.matchAll(/<div class="top"><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span>/g)][0];
    const lis = [...c.matchAll(/<li><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span><\/li>/g)].map((x) => [text(x[1]), text(x[2]), x[2]]);
    cols.push({ name: m[1], top: top ? [text(top[1]), text(top[2])] : null, lis });
  }
  const lis = (b, cls) => { const box = first(new RegExp(`<div class="box ${cls}">([\\s\\S]*?)</ul>`), b || ''); return box ? [...box.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]) : []; };
  return {
    sym, html, rd, sm, fd, aiModel: RM.readAiModel(html), header, h1, sub, tags, pxMeta, secs, byN, extraSecs,
    s1cards: s1 ? cards(s1.body) : [], s1hint: s1 && s1.hint, s1paras: s1 ? paras(s1.body) : [],
    legs: L.legs, legBlocks: L.blocks, s3hint: s3 && s3.hint, s3paras: s3 ? paras(s3.body) : [], fvBoxL,
    s6hint: s6 && s6.hint, s6cols: cols, s6paras: s6 ? paras(s6.body) : [],
    catalysts: s7 ? lis(s7.body, 'cat') : [], risks: s7 ? lis(s7.body, 'risk') : [],
    s8: s8 ? { h2: first(/<div class="verdict">\s*<h2>([\s\S]*?)<\/h2>/, s8.body), p: first(/<div class="verdict">[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/, s8.body), zone: first(/<div class="zone">([\s\S]*?)<\/div>/, s8.body), vcells: [...s8.body.matchAll(/<div class="vcell"><div class="k">([\s\S]*?)<\/div><div class="v[^"]*"[^>]*>([\s\S]*?)<\/div><\/div>/g)].map((x) => [text(x[1]), x[2]]) } : null,
    disc, footer,
  };
}

module.exports = { parseV2, text, decode, sections, cards, legs, ROOT };
