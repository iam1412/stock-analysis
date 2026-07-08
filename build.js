#!/usr/bin/env node
/**
 * build.js — สร้างหน้าเว็บ static สำหรับ Cloudflare Workers (Static Assets)
 *
 * โครงสร้างต้นฉบับ:
 *   reports/<SYMBOL>.html   ← วางไฟล์รายงานหุ้นแต่ละตัวไว้ในโฟลเดอร์นี้
 *
 * ทำงาน:
 *   1. สแกนไฟล์รายงานทั้งหมดใน reports/
 *   2. ดึง metadata (title / ชื่อบริษัท) จากแต่ละไฟล์
 *   3. ติดตามวันที่อัปเดตผ่าน reports.json (ถ้าเนื้อหาไฟล์เปลี่ยน → ประทับเวลาใหม่)
 *   4. สร้างหน้า index.html (เรียงหุ้นที่อัปเดตล่าสุดขึ้นก่อน) + reports.json (manifest)
 *   5. คัดลอกรายงานแบบ flatten ลง dist/ → เข้าถึงที่ /<SYMBOL>.html และ /<SYMBOL>
 *
 * รันด้วย:  node build.js   (หรือ npm run build)  — ไม่ต้องติดตั้ง dependency ใด ๆ
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const REPORTS_DIR = path.join(ROOT, 'reports');
const OUT = path.join(ROOT, 'dist');
const MANIFEST = path.join(ROOT, 'reports.json'); // committed — เก็บ hash/วันที่อัปเดตของแต่ละรายงาน

const CONTACT_EMAIL = 'somchai.s@de.co.th';
const SITE_ORIGIN = 'https://stock-ai.dotent.workers.dev'; // ใช้สร้าง absolute URL ให้ og:url / og:image (social scraper ต้องการ URL เต็ม)
const OG_IMAGE = SITE_ORIGIN + '/static/og.png'; // banner 1200×630 สำหรับการ์ดแชร์ (static/og.png — regenerate จาก static/og.svg)
const AI_MODEL = 'Claude Opus 4.8'; // โมเดล AI ที่ใช้วิเคราะห์+จัดทำรายงาน — แสดงใน footer เพื่อความโปร่งใส/น่าเชื่อถือ (อัปเดตเมื่อเปลี่ยนรุ่น)
const AI_MAKER = 'Anthropic';
const ASSET_DIRS = new Set(['assets', 'public', 'static', 'img', 'images', 'css', 'js', 'fonts']);

const log = (...a) => console.log('[build]', ...a);
const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;'); // ปลอดภัยสำหรับใส่ใน attribute
// ถอดรหัส HTML entity พื้นฐาน (named + numeric) — แต่ละ match อิสระต่อกัน ไม่มีปัญหาลำดับ decode ซ้อน
// ต้องถอดก่อนเก็บข้อความ (เช่น "specialty &amp; mature") ไม่งั้น esc() ตอน render จะกลายเป็น &amp;amp; (double-escape)
const decodeEntities = (s) => String(s).replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  e = e.toLowerCase();
  if (e[0] === '#') { const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(n) ? String.fromCodePoint(n) : m; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e] || m;
});
const cleanText = (s) => decodeEntities(stripTags(s)); // ตัดแท็ก + ถอด entity → ข้อความดิบพร้อม esc() ตอน render
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
// hash สำหรับ track "อัปเดตล่าสุด": ตัด metadata ที่ไม่ใช่เนื้อหาวิเคราะห์ออกก่อน —
//  • meta ai-model (ประทับโมเดล)  • บล็อก stock-meta (ตัวเลขสรุปสำหรับเรียง index — เป็น "กระจก" ของเลขที่โชว์อยู่แล้ว)
// การเพิ่ม/แก้สองอย่างนี้จึงไม่ควรดันวันที่ให้ดูสดใหม่ (ราคาจริงเปลี่ยน → เนื้อรายงานเปลี่ยน → hash ขยับเองอยู่แล้ว)
const freshHash = (content) => hash(content
  .replace(/\n?<meta\s+name=["']ai-model["'][^>]*>/i, '')
  .replace(/\n?<script[^>]*\bid=["']stock-meta["'][^>]*>[\s\S]*?<\/script>/i, ''));

// ── Template system (build-time injection) ───────────────────────────────────
// รายงานแบบใหม่ (content-only) เก็บเฉพาะ "เนื้อหา + ข้อมูลต่อหุ้น" ส่วนโครงที่ซ้ำทุกไฟล์
// (CSS 130 บรรทัด + engine JS วาดกราฟ/gauge/เครื่องคิดเลข) อยู่ใน _template/ แล้ว inject ตอน build/ตรวจ
//   • source ใหม่มี marker <!--TEMPLATE:STYLE--> + <!--TEMPLATE:ENGINE--> + <script id="report-data"> (ตัวเลขต่อหุ้น)
//   • source เก่า (ไม่มี marker) → expandReport คืนค่าเดิมเป๊ะ (identity) → ไม่กระทบไฟล์เดิมเลย
// engine bake ค่าเป็น literal (const FV=, gpos(ราคา), const data=[…]) เพื่อให้ quality gate (E08/E15/E19,
// check-site) ยัง regex เจอเลขจริงเหมือนรายงานที่เขียน HTML เต็ม
const TEMPLATE_DIR = path.join(ROOT, '_template');
const FONT_LINKS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">';
// ธีมเริ่มต้น (โทนน้ำเงิน เหมือนหน้า index) — ใช้เมื่อ report-data.theme ไม่ระบุคีย์ใด
const THEME_DEFAULTS = {
  accent: '#1a73e8', accentDark: '#1557b0',
  darkGrad: 'linear-gradient(135deg,#202938 0%,#2c3a52 60%,#1557b0 140%)',
  glow: 'rgba(66,133,244,.35)', subColor: '#c7d2e4', headerMuted: '#aebfd6',
  chgBg: 'var(--red-soft)', chgColor: '#c5221f', badge: 'var(--blue)',
  verdictText: '#d4dded', vcellLabel: '#a8b6cc',
};
const _partialCache = {};
const readPartial = (name) => (_partialCache[name] || (_partialCache[name] = fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8')));
// แทน token ทุกตัว — ใช้ split/join (ไม่ใช่ .replace) เพื่อ "ไม่" ตีความ $$/$& ในค่าแทนที่ (engine มี $${v})
const fillTokens = (tmpl, map) => { let s = tmpl; for (const k in map) s = s.split(k).join(map[k]); return s; };

function renderHead(theme) {
  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  const css = fillTokens(readPartial('dashboard.css'), {
    __RD_ACCENT__: t.accent, __RD_ACCENTD__: t.accentDark, __RD_DARKGRAD__: t.darkGrad,
    __RD_GLOW__: t.glow, __RD_SUBCOL__: t.subColor, __RD_HMUTED__: t.headerMuted,
    __RD_CHGBG__: t.chgBg, __RD_CHGFG__: t.chgColor, __RD_BADGE__: t.badge,
    __RD_VTEXT__: t.verdictText, __RD_VCELLK__: t.vcellLabel,
  });
  return FONT_LINKS + '\n<style>\n' + css + '</style>';
}
function renderEngine(data) {
  const c = data.chart, g = data.gauge, t = { ...THEME_DEFAULTS, ...(data.theme || {}) };
  const js = fillTokens(readPartial('engine.js'), {
    __RD_DATA__: JSON.stringify(c.data), __RD_MIN__: String(c.min), __RD_MAX__: String(c.max),
    __RD_GRID__: c.grid.join(','), __RD_FAIRLINE__: String(c.fairLine), __RD_ACCENT__: t.accent,
    __RD_CURSYM__: c.currency || '$', __RD_HL__: JSON.stringify(c.highlight),
    __RD_GRIDVAL__: c.gridFmt || 'v',          // นิพจน์ format ป้ายแกน (v / v.toFixed(2) / Math.round(v))
    __RD_DATAVAL__: c.dataFmt || 'd[1]',       // นิพจน์ format ป้ายจุด (d[1] / d[1].toFixed(2) / Math.round(d[1]))
    __RD_GMIN__: String(g.min), __RD_GMAX__: String(g.max), __RD_CUR__: String(g.cur), __RD_FAIR__: String(g.fair),
    __RD_FAIRTOP__: g.fairLabelTop || '-58px', __RD_FV__: String(data.fv),
  });
  return '<script>\n' + js + '</script>';
}
// ตรวจ report-data ให้ครบ/เป็นตัวเลข — ขาด/ผิด = throw (build & gate ล้มทันที ดีกว่า render เพี้ยนเงียบ ๆ)
function validateReportData(d) {
  const need = (v, p) => { if (typeof v !== 'number' || !isFinite(v)) throw new Error(`report-data.${p} ต้องเป็นตัวเลข — พบ ${JSON.stringify(v)}`); };
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('report-data ต้องเป็น JSON object');
  const c = d.chart, g = d.gauge;
  if (!c || !Array.isArray(c.data) || c.data.length < 2) throw new Error('report-data.chart.data ต้องเป็น array ≥ 2 จุด');
  if (!Array.isArray(c.grid) || !c.grid.length) throw new Error('report-data.chart.grid ต้องเป็น array ของเส้นกริด');
  if (!Array.isArray(c.highlight) || !c.highlight.length) throw new Error('report-data.chart.highlight ต้องเป็น array ของดัชนีจุดที่ไฮไลต์ (เช่น [6,7])');
  for (const idx of c.highlight) if (!Number.isInteger(idx) || idx < 0 || idx >= c.data.length) throw new Error(`report-data.chart.highlight ดัชนีนอกช่วง: ${JSON.stringify(idx)} (ต้องเป็นจำนวนเต็ม 0..${c.data.length - 1})`);
  if (c.currency != null && (typeof c.currency !== 'string' || !c.currency || c.currency.length > 3)) throw new Error(`report-data.chart.currency ต้องเป็นสัญลักษณ์สั้น (เช่น "$"/"฿") — พบ ${JSON.stringify(c.currency)}`);
  // whitelist นิพจน์ format (กัน inject) — แยกตามตัวแปรใน scope จริงของ engine:
  //   gridFmt อยู่ใน grid.forEach(v=>…) → ต้องใช้ v เท่านั้น  •  dataFmt อยู่ใน data.forEach((d,i)=>…) → ต้องใช้ d[1] เท่านั้น
  //   (รวมเป็น regex เดียวเหมือนเดิมจะรับ v ให้ dataFmt ได้ → runtime ReferenceError: v is not defined → กราฟ/gauge/calc ดับเงียบ ๆ)
  const GRID_FMT_OK = /^v(\.toFixed\([0-4]\))?$|^Math\.round\(v\)$/;
  const DATA_FMT_OK = /^d\[1\](\.toFixed\([0-4]\))?$|^Math\.round\(d\[1\]\)$/;
  if (c.gridFmt != null && !GRID_FMT_OK.test(c.gridFmt)) throw new Error(`report-data.chart.gridFmt ต้องอ้างตัวแปร v เท่านั้น: v / v.toFixed(n) / Math.round(v) — พบ ${JSON.stringify(c.gridFmt)}`);
  if (c.dataFmt != null && !DATA_FMT_OK.test(c.dataFmt)) throw new Error(`report-data.chart.dataFmt ต้องอ้างตัวแปร d[1] เท่านั้น: d[1] / d[1].toFixed(n) / Math.round(d[1]) — พบ ${JSON.stringify(c.dataFmt)}`);
  need(c.min, 'chart.min'); need(c.max, 'chart.max'); need(c.fairLine, 'chart.fairLine');
  if (!g || typeof g !== 'object') throw new Error('report-data.gauge ต้องเป็น object');
  need(g.min, 'gauge.min'); need(g.max, 'gauge.max'); need(g.cur, 'gauge.cur'); need(g.fair, 'gauge.fair');
  need(d.fv, 'fv');
  // bounds ห้าม degenerate — engine ys()/gpos() หารด้วย (max−min); ถ้า =0/ติดลบ → NaN/Infinity → กราฟล่องหน/เข็มเพี้ยน "เงียบ ๆ"
  if (c.max <= c.min) throw new Error(`report-data.chart.max (${c.max}) ต้อง > chart.min (${c.min}) — ไม่งั้นแกน y หาร 0 → พิกัด NaN`);
  if (g.max <= g.min) throw new Error(`report-data.gauge.max (${g.max}) ต้อง > gauge.min (${g.min}) — gpos() หาร 0`);
  if (!(d.fv > 0)) throw new Error(`report-data.fv ต้อง > 0 (เครื่องคิดเลข MOS = (FV−price)/FV) — พบ ${JSON.stringify(d.fv)}`);
  for (const p of c.data) if (!Array.isArray(p) || typeof p[0] !== 'string' || typeof p[1] !== 'number' || !isFinite(p[1])) throw new Error(`report-data.chart.data ทุกจุดต้องเป็น [label:string, price:number(finite)] — พบ ${JSON.stringify(p)}`);
  for (const v of c.grid) if (typeof v !== 'number' || !isFinite(v)) throw new Error(`report-data.chart.grid ต้องเป็นตัวเลขล้วน — พบ ${JSON.stringify(v)}`);
  // theme: ค่าสีต้องเป็น token สีที่ถูกต้อง — กัน CSS declaration breakout (เช่น "x;}") + สีพังเงียบ (เช่น hex 5 หลัก → เส้นกราฟล่องหน)
  const t = { ...THEME_DEFAULTS, ...(d.theme || {}) };
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, FN = /^(rgb|rgba|hsl|hsla)\([^;{}]*\)$/i, VAR = /^var\(--[a-z0-9-]+(,[^;{}]*)?\)$/i, GRAD = /^(linear|radial)-gradient\([^;{}]*\)$/i, NAMED = /^[a-z]+$/i;
  const colorOK = (v, grad) => { v = String(v).trim(); if (/[;{}]/.test(v)) return false; return HEX.test(v) || FN.test(v) || VAR.test(v) || NAMED.test(v) || (grad && GRAD.test(v)); };
  for (const k of ['accent', 'accentDark', 'glow', 'subColor', 'headerMuted', 'chgColor', 'verdictText', 'vcellLabel']) if (t[k] != null && !colorOK(t[k], false)) throw new Error(`report-data.theme.${k} ไม่ใช่ค่าสีที่ถูกต้อง (hex/rgb/hsl/var/named): ${JSON.stringify(t[k])}`);
  for (const k of ['darkGrad', 'chgBg', 'badge']) if (t[k] != null && !colorOK(t[k], true)) throw new Error(`report-data.theme.${k} ต้องเป็นสี/gradient/var(): ${JSON.stringify(t[k])}`);
}
// คืน HTML เต็ม: source เก่า (ไม่มี marker) = identity ; source ใหม่ = แทน marker ด้วย <style>/engine ที่ inject ค่าต่อหุ้น
function expandReport(html) {
  if (typeof html !== 'string' || !html.includes('<!--TEMPLATE:STYLE-->')) return html;
  const m = html.match(/<script[^>]*\bid=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) throw new Error('expandReport: มี <!--TEMPLATE:STYLE--> แต่ไม่มีบล็อก <script id="report-data">');
  if (!html.includes('<!--TEMPLATE:ENGINE-->')) throw new Error('expandReport: ขาด marker <!--TEMPLATE:ENGINE--> (ต้องมีคู่กับ STYLE)');
  let data;
  try { data = JSON.parse(m[1]); } catch (e) { throw new Error('expandReport: report-data JSON ไม่ถูกต้อง: ' + e.message); }
  validateReportData(data);
  // function replacer → ไม่ตีความ $ ในค่าแทนที่ (engine/CSS มี $)
  return html
    .replace('<!--TEMPLATE:STYLE-->', () => renderHead(data.theme))
    .replace('<!--TEMPLATE:ENGINE-->', () => renderEngine(data));
}

function extractMeta(html, symbol) {
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const modelM = html.match(/<meta\s+name=["']ai-model["']\s+content=["']([^"']*)["']/i); // โมเดล AI ที่ report ประกาศของตัวเอง
  // คำโปรย "บริษัททำธุรกิจอะไร" = <div class="sub"> ที่อยู่ใต้ <h1> ในหัวรายงาน — ใช้โชว์บนการ์ดหน้า index แทน title
  const descM = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<div[^>]*\bclass=["'][^"']*\bsub\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const title = cleanText(titleM && titleM[1]) || symbol;
  const name = cleanText(h1M && h1M[1]) || title;
  const desc = cleanText(descM && descM[1]); // คำโปรยธุรกิจ ('' ถ้าไม่มี → การ์ด fallback ไปใช้ title)
  const aiModel = (modelM && modelM[1].trim()) || null; // null → footer ใช้ค่ากลาง AI_MODEL
  return { title, name, desc, aiModel };
}

// อ่านบล็อก <script type="application/json" id="stock-meta"> ที่ report ประกาศ → metric สำหรับเรียง/แสดงบนหน้า index
// คืน null ถ้าไม่มีบล็อก/JSON เสีย · คืนเฉพาะ metric ที่ใช้เรียง (number หรือ null ถ้าไม่มีค่า → เรียงไปท้ายเสมอ)
// ตัวเลขเป็น "กระจก" ของเลขในรายงาน — quality gate (E29–31) บังคับให้ตรงกับที่โชว์จริง กัน sort เพี้ยนจากเนื้อหา
// market = ตลาดของหุ้น (TH/US) derive จาก currency (THB→TH · รหัสสกุลอื่นที่ถูกต้อง→US เพราะรีโปนี้มีแค่ THB/USD) —
//   ใช้กรองหน้า index แยกไทย/สหรัฐ · gate E29 บังคับ currency เป็นรหัส 3 ตัวอยู่แล้ว → ไม่ต้องเขียนเพิ่มในรายงาน
function extractMetrics(html) {
  const m = html.match(/<script[^>]*\bid=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[1]); } catch { return null; }
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
  const market = o.currency === 'THB' ? 'TH' : (typeof o.currency === 'string' && /^[A-Z]{3}$/.test(o.currency) ? 'US' : null);
  return { mos: num(o.mos), upside: num(o.upside), pe: num(o.pe), dividendYield: num(o.dividendYield), roe: num(o.roe), market };
}

// แทรกแถบติดต่อ + ลิงก์กลับหน้ารวม + ตัวนับยอดวิว + ปุ่ม Like/Dislike ในแต่ละหน้ารายงาน
// ถ้ามี <footer> เดิมอยู่แล้ว → ต่อท้ายเข้าไปข้างใน (ขึ้นบรรทัดใหม่) ไม่สร้าง footer ซ้อน
function injectContactFooter(html) {
  const views = `<span class="views" id="viewCount" hidden> · 👁 <b id="viewNum">0</b> ครั้ง</span>`;
  const vote =
    `<span class="votebar" id="voteBar" hidden> · ` +
    `<button class="vbtn" id="likeBtn" type="button">👍 <b id="likeNum">0</b></button> ` +
    `<button class="vbtn" id="dislikeBtn" type="button">👎 <b id="dislikeNum">0</b></button></span>`;
  const link =
    `<a href="/" style="color:#1a73e8;text-decoration:none">← ดูรายงานทั้งหมด</a> · ` +
    `ติดต่อ <a href="mailto:${CONTACT_EMAIL}" style="color:#1a73e8;text-decoration:none">${CONTACT_EMAIL}</a>${views}${vote}`;

  const fi = html.toLowerCase().lastIndexOf('</footer>');
  if (fi !== -1) {
    return html.slice(0, fi) + `<br>${link}` + html.slice(fi); // ต่อท้ายใน <footer> เดิม
  }
  // ไม่มี footer เดิม → ใส่ footer ใหม่ก่อน </body>
  const bar =
    `\n<footer style="max-width:1080px;margin:0 auto;padding:14px 16px 40px;text-align:center;` +
    `font-family:'Sarabun',system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:#5f6675">${link}</footer>\n`;
  const bi = html.toLowerCase().lastIndexOf('</body>');
  return bi === -1 ? html + bar : html.slice(0, bi) + bar + html.slice(bi);
}

// แทรก <style> ของปุ่มโหวตเข้าไปใน <head>
function injectVoteStyle(html) {
  const style =
    `\n<style>.votebar .vbtn{font:inherit;cursor:pointer;border:1px solid #d7dbe2;background:#fff;` +
    `border-radius:8px;padding:1px 8px;margin-left:4px;color:#5f6675;line-height:1.9}` +
    `.votebar .vbtn:hover{border-color:#1a73e8;color:#1a73e8}` +
    `.votebar .vbtn.on{border-color:#1a73e8;background:#e8f0fe;color:#1557b0;font-weight:600}</style>\n`;
  const hi = html.toLowerCase().lastIndexOf('</head>');
  return hi === -1 ? style + html : html.slice(0, hi) + style + html.slice(hi);
}

// แทรกสคริปต์ นับยอดวิว + จัดการ Like/Dislike (inline, same-origin) ก่อน </body> — ฝัง symbol ตอน build
// view: POST ครั้งแรกของ session แล้ว GET ครั้งถัด ๆ (กันนับซ้ำด้วย sessionStorage)
// vote: เก็บสถานะโหวตของผู้ใช้ใน localStorage แล้วส่ง from→to ให้ server คำนวณ delta (∈ -1..1) เอง (กันยิงเลขมั่ว)
function injectViewVoteScript(html, symbol) {
  const S = JSON.stringify(symbol);
  const script =
    `\n<script>(function(){` +
    `function gid(i){return document.getElementById(i)}` +
    `var S=${S},vk="vc:"+S,lk="vote:"+S;` +
    `var num=gid("viewNum"),box=gid("viewCount"),bar=gid("voteBar");` +
    `var lb=gid("likeBtn"),db=gid("dislikeBtn"),ln=gid("likeNum"),dn=gid("dislikeNum");` +
    `function getVote(){try{return localStorage.getItem(lk)}catch(e){return null}}` +
    `function setVote(v){try{v?localStorage.setItem(lk,v):localStorage.removeItem(lk)}catch(e){}}` +
    `var vote=getVote();` +
    `function hi(){if(lb)lb.className="vbtn"+(vote==="like"?" on":"");if(db)db.className="vbtn"+(vote==="dislike"?" on":"")}` +
    `function fill(d){if(!d)return;` +
    `if(typeof d.count==="number"&&num){num.textContent=d.count.toLocaleString();if(box)box.hidden=false;}` +
    `if(typeof d.likes==="number"&&ln)ln.textContent=d.likes.toLocaleString();` +
    `if(typeof d.dislikes==="number"&&dn)dn.textContent=d.dislikes.toLocaleString();` +
    `if(bar)bar.hidden=false;hi();}` +
    `function api(path,method){return fetch(path,{method:method}).then(function(r){` +
    `if(method==="POST"&&r.status===429&&path.indexOf("/api/views/")===0)return fetch(path).then(function(r2){return r2.json()});` +
    `if(!r.ok&&path.indexOf("/api/vote/")===0)return null;return r.json();});}` +
    `var seen=null;try{seen=sessionStorage.getItem(vk)}catch(e){}` +
    // ตั้ง flag "นับแล้ว" เฉพาะตอน POST นับเพิ่มสำเร็จจริง (d.count เป็นตัวเลข) — ถ้า request พลาดจะ retry รอบหน้า ไม่ล็อกเป็น GET-only
    `api("/api/views/"+encodeURIComponent(S),seen?"GET":"POST").then(function(d){fill(d);if(!seen&&d&&typeof d.count==="number"){try{sessionStorage.setItem(vk,"1")}catch(e){}}}).catch(function(){});` +
    `var busy=false;function send(to){if(busy)return;busy=true;var from=vote||"none";` +
    `api("/api/vote/"+encodeURIComponent(S)+"?from="+from+"&to="+to,"POST").then(function(d){if(!d)return;vote=(to==="none")?null:to;setVote(vote);fill(d);})` +
    `.catch(function(){}).then(function(){busy=false;});}` +
    `if(lb)lb.addEventListener("click",function(){send(vote==="like"?"none":"like")});` +
    `if(db)db.addEventListener("click",function(){send(vote==="dislike"?"none":"dislike")});` +
    `})();</script>\n`;
  const bi = html.toLowerCase().lastIndexOf('</body>');
  return bi === -1 ? html + script : html.slice(0, bi) + script + html.slice(bi);
}

// แทรก meta สำหรับ Social share card (Open Graph + Twitter) + description + canonical เข้า <head>
// — ฉีดเฉพาะใน dist/ (ต้นฉบับ reports/ ไม่แตะ) · ใช้ content="https://…" (gate สแกนเฉพาะ href/src จึงไม่โดนแฟลก)
//   canonical ใช้ relative (/SYM) กัน gate เข้าใจผิดว่าเป็น external resource
function injectShareMeta(html, r) {
  const cleanUrl = SITE_ORIGIN + '/' + encodeURIComponent(r.symbol); // /<SYM> (clean URL)
  const desc =
    `วิเคราะห์หุ้น ${r.name} (${r.symbol}) — มูลค่าที่เหมาะสม (Fair Value), Margin of Safety, ` +
    `จุดเข้าซื้อ และผลตอบแทนคาดการณ์ · ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน`;
  const tags = [
    `<link rel="canonical" href="/${escAttr(r.symbol)}">`,
    `<meta name="description" content="${escAttr(desc)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Stock Analysis">`,
    `<meta property="og:locale" content="th_TH">`,
    `<meta property="og:title" content="${escAttr(r.title)}">`,
    `<meta property="og:description" content="${escAttr(desc)}">`,
    `<meta property="og:url" content="${escAttr(cleanUrl)}">`,
    `<meta property="og:image" content="${escAttr(OG_IMAGE)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escAttr(r.symbol)} — Stock Analysis">`,
    `<meta property="article:modified_time" content="${escAttr(r.updated)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escAttr(r.title)}">`,
    `<meta name="twitter:description" content="${escAttr(desc)}">`,
    `<meta name="twitter:image" content="${escAttr(OG_IMAGE)}">`,
  ].join('\n');
  const at = html.toLowerCase().indexOf('</title>');
  if (at !== -1) { const i = at + '</title>'.length; return html.slice(0, i) + '\n' + tags + html.slice(i); }
  const hi = html.toLowerCase().lastIndexOf('</head>');
  return hi === -1 ? tags + '\n' + html : html.slice(0, hi) + tags + '\n' + html.slice(hi);
}

// แทนข้อความ "สร้างด้วย stock-analyzer workflow" ใน footer ต้นฉบับ ด้วยเครดิตโมเดล AI ที่ใช้วิเคราะห์
// (ดึงจาก meta ai-model ต่อ report → ระบุรุ่นที่สร้างรายงานนั้นจริง · ทำตอน build เฉพาะใน dist)
function injectModelCredit(html, model) {
  const credit = `🤖 วิเคราะห์และจัดทำด้วย AI · <b>${escAttr(model)}</b> · ${AI_MAKER}`;
  const re = /สร้างด้วย\s*stock-analyzer\s*workflow/i;
  if (re.test(html)) return html.replace(re, credit);
  // ไม่พบข้อความเดิม → ผนวกเครดิตเข้าใน <footer> ท้ายสุด (กันรายงานที่ไม่มีบรรทัดนี้ ให้ยังมี attribution)
  const fi = html.toLowerCase().lastIndexOf('</footer>');
  return fi === -1 ? html : html.slice(0, fi) + ` • ${credit}` + html.slice(fi);
}

// ตกแต่งไฟล์รายงานก่อนเขียนลง dist: share meta + เครดิตโมเดล + footer ติดต่อ + ตัวนับยอดวิว + ปุ่ม Like/Dislike
function decorateReport(html, r) {
  const model = r.aiModel || AI_MODEL;
  let h = injectShareMeta(html, r);
  h = injectModelCredit(h, model);
  h = injectContactFooter(h);
  h = injectVoteStyle(h);
  h = injectViewVoteScript(h, r.symbol);
  return h;
}

// ── จุดเด่น (standout metric) สำหรับไฮไลต์บนการ์ดหน้า index ──────────────────────
// เลือก metric ที่ "เด่นที่สุด" ของหุ้นแต่ละตัวจากเกณฑ์เชิงคุณค่า (value investing) แล้วทำเป็นป้ายเด่น ๆ
//   dir:'hi' = ค่ามากยิ่งดี · dir:'lo' = ค่าน้อยยิ่งดี (P/E) · t3/t2/t1 = เกณฑ์ เด่นมาก/เด่น/พอเด่น
//   โชว์ป้ายเฉพาะที่เด่นจริง (tier ≥ 2) · ถ้าเป็นค่าดีสุดในกลุ่มรายงานทั้งหมด → มงกุฎ 👑 "…สุดในกลุ่ม"
const HL_DEFS = [
  { k: 'mos',           lab: 'MOS',    suf: '%', dir: 'hi', t3: 30, t2: 15, t1: 5,  icon: '🛡️', cls: 'val',
    d3: 'ส่วนเผื่อปลอดภัยสูง', d2: 'ส่วนเผื่อปลอดภัยดี', lead: 'ส่วนเผื่อสูงสุดในกลุ่ม' },
  { k: 'upside',        lab: 'Upside', suf: '%', dir: 'hi', t3: 30, t2: 15, t1: 8,  icon: '🚀', cls: 'val',
    d3: 'อัพไซด์สูง', d2: 'อัพไซด์ดี', lead: 'อัพไซด์สูงสุดในกลุ่ม' },
  { k: 'roe',           lab: 'ROE',    suf: '%', dir: 'hi', t3: 25, t2: 18, t1: 12, icon: '💎', cls: 'qual',
    d3: 'ทำกำไรสูงมาก', d2: 'ทำกำไรเด่น', lead: 'ROE สูงสุดในกลุ่ม' },
  { k: 'dividendYield', lab: 'Yield',  suf: '%', dir: 'hi', t3: 6,  t2: 4,  t1: 3,  icon: '💰', cls: 'inc',
    d3: 'ปันผลสูง', d2: 'ปันผลดี', lead: 'ปันผลสูงสุดในกลุ่ม' },
  { k: 'pe',            lab: 'P/E',    suf: '',  dir: 'lo', t3: 8,  t2: 11, t1: 14, icon: '🏷️', cls: 'cheap',
    d3: 'ราคาถูกมาก', d2: 'ราคาน่าสนใจ', lead: 'P/E ต่ำสุดในกลุ่ม' },
];
function hlTier(def, v) {
  // P/E (dir 'lo') ติดลบ/ศูนย์ = ขาดทุน ไม่ใช่ "ถูก" → tier 0
  if (def.dir === 'lo') return v <= 0 ? 0 : v <= def.t3 ? 3 : v <= def.t2 ? 2 : v <= def.t1 ? 1 : 0;
  return v >= def.t3 ? 3 : v >= def.t2 ? 2 : v >= def.t1 ? 1 : 0;
}
// เลือกจุดเด่น 1 ค่าของหุ้น — คืน null ถ้าไม่มี metric ที่เด่นพอ (tier<2) หรือไม่มี stock-meta
// leaders: { k: ค่าดีสุดในกลุ่ม } (optional) → ถ้าหุ้นถือค่านั้น ติดมงกุฎ "…สุดในกลุ่ม"
// คะแนนเลือก: tier สำคัญสุด > เป็นผู้นำกลุ่ม > strength (กันเสมอใน tier เดียวกัน) — leader ไม่ข้าม tier
function pickHighlight(metrics, leaders) {
  if (!metrics) return null;
  leaders = leaders || {};
  let best = null;
  for (const d of HL_DEFS) {
    const v = metrics[d.k];
    if (typeof v !== 'number' || !isFinite(v)) continue;
    const tier = hlTier(d, v);
    if (tier < 2) continue;                                     // โชว์เฉพาะที่เด่นจริง
    const isLeader = leaders[d.k] != null && v === leaders[d.k];
    const strength = d.dir === 'lo' ? (d.t1 - v) / d.t1 : v / d.t3;
    const score = tier * 100 + (isLeader ? 50 : 0) + strength;
    if (!best || score > best.score) best = { d, v, tier, isLeader, score };
  }
  if (!best) return null;
  const { d, v, tier, isLeader } = best;
  const val = Math.round(v * 100) / 100;
  return {
    cls: d.cls,
    icon: isLeader ? '👑' : d.icon,
    lead: isLeader,
    value: d.lab + ' ' + val + d.suf,
    desc: isLeader ? d.lead : tier === 3 ? d.d3 : d.d2,
  };
}
// ค่าดีสุดของแต่ละ metric ในกลุ่มรายงาน (max สำหรับ dir 'hi', min สำหรับ P/E) — ใช้ป้าย "…สุดในกลุ่ม"
function computeLeaders(reps) {
  const out = {};
  for (const d of HL_DEFS) {
    let best = null;
    for (const r of reps) {
      const v = r.metrics && r.metrics[d.k];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (d.dir === 'lo' && v <= 0) continue;                   // P/E ติดลบไม่นับเป็นผู้นำ
      best = best == null ? v : d.dir === 'lo' ? Math.min(best, v) : Math.max(best, v);
    }
    out[d.k] = best;
  }
  return out;
}

// export ฟังก์ชันให้ unit-test (test/build-test.js) — ต้องอยู่ก่อนโค้ดที่รัน build จริง
module.exports = { extractMeta, extractMetrics, freshHash, injectModelCredit, injectContactFooter, decorateReport, pickHighlight, computeLeaders, HL_DEFS, AI_MODEL, AI_MAKER, expandReport, renderHead, renderEngine, validateReportData };
// ถูก require เข้ามาเพื่อเทส → ส่งออกฟังก์ชันแล้วหยุด ไม่รัน build (top-level return ใช้ได้ใน CommonJS module)
if (require.main !== module) return;

// ---- 1) เตรียมโฟลเดอร์ dist ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---- 2) โหลด manifest เดิม (เพื่อรักษาวันที่อัปเดตของไฟล์ที่ไม่เปลี่ยน) ----
const prev = {};
if (fs.existsSync(MANIFEST)) {
  try {
    for (const r of JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))) prev[r.symbol] = r;
  } catch {
    log('⚠️  อ่าน reports.json เดิมไม่ได้ — สร้างใหม่');
  }
}
const nowISO = new Date().toISOString();

// ---- 3) อ่านรายงานจาก reports/ → flatten ลง dist/ ----
const reports = [];
if (fs.existsSync(REPORTS_DIR)) {
  for (const entry of fs.readdirSync(REPORTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.html$/i.test(entry.name)) continue;

    const src = path.join(REPORTS_DIR, entry.name);
    const content = fs.readFileSync(src, 'utf8');
    const symbol = entry.name.replace(/\.html$/i, '');
    const h = freshHash(content); // ตัด meta ai-model ออกจาก hash → ประทับโมเดลไม่นับเป็น "อัปเดต"
    const old = prev[symbol];
    const updated = old && old.hash === h && old.updated ? old.updated : nowISO; // เปลี่ยน → ประทับเวลาใหม่

    const rec = { symbol, file: entry.name, ...extractMeta(content, symbol), metrics: extractMetrics(content), updated, hash: h };
    reports.push(rec);
    // expandReport: source แบบ template (content-only) → inject โครงที่ใช้ร่วม ; source เก่า → identity (ไม่เปลี่ยน)
    fs.writeFileSync(path.join(OUT, entry.name), decorateReport(expandReport(content), rec)); // hash อิงต้นฉบับ, share meta+footer+ตัวนับใส่เฉพาะใน dist
    log('report:', entry.name, updated === nowISO ? '(updated)' : '');
  }
} else {
  log('⚠️  ไม่พบโฟลเดอร์ reports/ — สร้างแล้ววางไฟล์ <SYMBOL>.html ไว้ในนั้น');
}

// เรียงตามวันที่อัปเดตล่าสุดก่อน, เสมอกันเรียงตามชื่อย่อ
reports.sort((a, b) =>
  a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.symbol.localeCompare(b.symbol)
);

// ---- 4) เขียน manifest ----
// ตัวที่ root (committed): มี hash ไว้ตรวจการเปลี่ยนแปลงรอบหน้า
fs.writeFileSync(
  MANIFEST,
  JSON.stringify(reports.map(({ symbol, file, name, title, desc, updated, hash, metrics }) => ({ symbol, file, name, title, desc, updated, hash, metrics })), null, 2) + '\n'
);
// ตัว public ใน dist (เสิร์ฟที่ /reports.json) — ไม่ใส่ hash, เพิ่ม url + metrics (สำหรับเรียงฝั่ง client)
fs.writeFileSync(
  path.join(OUT, 'reports.json'),
  JSON.stringify(reports.map(({ symbol, file, name, title, desc, updated, metrics }) => ({ symbol, file, name, title, desc, updated, url: '/' + file, metrics })), null, 2) + '\n'
);

// ---- 4.5) sitemap.xml + robots.txt (ส่ง Google Search Console — auto จากรายการหุ้น) ----
// URL หุ้นใช้ clean URL /<SYM> (เดียวกับ og:url) · lastmod = วันที่อัปเดตของรายงานนั้น
const sitemapEntries = [
  `  <url><loc>${SITE_ORIGIN}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
  ...reports.map((r) =>
    `  <url><loc>${SITE_ORIGIN}/${encodeURIComponent(r.symbol)}</loc>` +
    `<lastmod>${(r.updated || '').slice(0, 10)}</lastmod>` +
    `<changefreq>weekly</changefreq><priority>0.8</priority></url>`
  ),
];
fs.writeFileSync(
  path.join(OUT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapEntries.join('\n') + '\n</urlset>\n'
);
fs.writeFileSync(
  path.join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`
);
log('sitemap:', 'sitemap.xml (' + (reports.length + 1) + ' urls) + robots.txt');

// ---- 5) คัดลอก assets + ไฟล์พิเศษของ Cloudflare ----
for (const nm of fs.readdirSync(ROOT)) {
  const p = path.join(ROOT, nm);
  if (ASSET_DIRS.has(nm.toLowerCase()) && fs.statSync(p).isDirectory()) {
    fs.cpSync(p, path.join(OUT, nm), { recursive: true });
    log('assets:', nm + '/');
  }
}
for (const special of ['_headers', '_redirects']) {
  const src = path.join(ROOT, special);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(OUT, special));
    log('special:', special);
  }
}

if (reports.length === 0) log('⚠️  ไม่มีรายงานให้ build');

// ---- 6) สร้างการ์ดรายงาน ----
const fmtDate = (iso) => (iso || '').slice(0, 10); // YYYY-MM-DD (ชัดเจน ไม่สับสนปี พ.ศ./ค.ศ.)

// metric บนการ์ด — key ใน object (mos/upside/pe/dividendYield/roe) ↔ data-attr/data-m ที่ JS ใช้เรียง (dk)
const METRIC_DEFS = [
  { k: 'mos',           dk: 'mos',    lab: 'MOS',    suf: '%' },
  { k: 'upside',        dk: 'upside', lab: 'Upside', suf: '%' },
  { k: 'pe',            dk: 'pe',     lab: 'P/E',    suf: ''  },
  { k: 'dividendYield', dk: 'yield',  lab: 'Yield',  suf: '%' },
  { k: 'roe',           dk: 'roe',    lab: 'ROE',    suf: '%' },
];
const fmtMetric = (v, suf) => v == null ? '—' : (Math.round(v * 100) / 100) + suf;
// data-* บน <a class="card"> ใช้เรียงฝั่ง client (เฉพาะ metric ที่มีค่า — ไม่มีค่า = ไม่ใส่ attr → เรียงไปท้าย)
const metricAttrs = (m) => !m ? '' : METRIC_DEFS.map((d) => m[d.k] == null ? '' : ` data-${d.dk}="${escAttr(String(m[d.k]))}"`).join('');
// ตลาด (TH/US) — data-market บนการ์ดใช้กรองไทย/สหรัฐ + ธงเล็ก ๆ ข้างชื่อย่อให้เห็นตลาดทันที (text emoji ไม่ใช่ external resource)
const MKT_FLAG = { TH: '🇹🇭', US: '🇺🇸' };
const marketAttr = (m) => (m && m.market) ? ` data-market="${escAttr(m.market)}"` : '';
const marketFlag = (m) => (m && m.market && MKT_FLAG[m.market]) ? `<span class="cflag" title="${m.market === 'TH' ? 'ตลาดไทย (SET)' : 'ตลาดสหรัฐ'}">${MKT_FLAG[m.market]}</span>` : '';
// แถบ metric เล็ก ๆ ใต้ชื่อหุ้น (โชว์ทั้ง 5 ค่า — ตัวที่กำลังเรียงจะถูกไฮไลต์ด้วย JS)
const metricStrip = (m) => !m ? '' : `
        <div class="cmetrics">${METRIC_DEFS.map((d) => `<span class="cm" data-m="${d.dk}">${d.lab} <b>${esc(fmtMetric(m[d.k], d.suf))}</b></span>`).join('')}</div>`;

// ป้ายไฮไลต์ "จุดเด่น" ของหุ้นแต่ละตัว — คำนวณตอน build จาก stock-meta (static, ไม่พึ่ง JS)
const leaders = computeLeaders(reports);
const highlightChip = (m) => {
  const h = pickHighlight(m, leaders);
  return h ? `
        <div class="hl hl-${h.cls}${h.lead ? ' lead' : ''}"><span class="hl-ic">${h.icon}</span><span class="hl-v">${esc(h.value)}</span><span class="hl-d">${esc(h.desc)}</span></div>` : '';
};

const cards = reports.map((r) => {
  const blurb = r.desc || r.title; // คำโปรยธุรกิจ (fallback ไป title ถ้ารายงานไม่มี <div class="sub">)
  return `
      <a class="card" data-search="${escAttr((r.symbol + ' ' + r.name + ' ' + r.title + ' ' + (r.desc || '')).toLowerCase())}"${metricAttrs(r.metrics)}${marketAttr(r.metrics)} href="./${encodeURIComponent(r.file)}">
        <div class="ctop"><div class="badge">${esc(r.symbol)}</div>${marketFlag(r.metrics)}</div>
        <div class="cname">${esc(r.name)}</div>
        <div class="ctitle" title="${escAttr(blurb)}">${esc(blurb)}</div>${highlightChip(r.metrics)}${metricStrip(r.metrics)}
        <div class="cmeta"><span class="go">เปิดรายงาน →</span><span class="cviews" data-sym="${escAttr(r.symbol)}" hidden>👁 <b class="v">0</b> · 👍 <b class="l">0</b> · 👎 <b class="d">0</b></span><span class="cdate">${fmtDate(r.updated)}</span></div>
      </a>`;
}).join('\n');

// ช่องค้นหา + ข้อความ "ไม่พบ" + สคริปต์กรอง (เฉพาะเมื่อมีรายงาน)
const searchBox = reports.length ? `
    <div class="search">
      <input id="q" type="search" placeholder="ค้นหาหุ้น… ชื่อย่อ หรือ ชื่อบริษัท" autocomplete="off" spellcheck="false" aria-label="ค้นหาหุ้น">
    </div>` : '';

// แถบกรองตลาด — สลับเดียว ทั้งหมด/ไทย/สหรัฐ (filter จริง · AND กับช่องค้นหา · คงค่าข้ามการเปลี่ยน sort)
const mktCount = reports.reduce((a, r) => { const mk = r.metrics && r.metrics.market; if (mk === 'TH') a.TH++; else if (mk === 'US') a.US++; return a; }, { TH: 0, US: 0 });
const marketBar = (reports.length > 1 && (mktCount.TH && mktCount.US)) ? `
    <div class="marketbar" id="marketbar" role="group" aria-label="กรองตามตลาด">
      <span class="sortlab">ตลาด</span>
      <button type="button" class="mktbtn on" data-market="all">ทั้งหมด <span class="mc">${reports.length}</span></button>
      <button type="button" class="mktbtn" data-market="TH">🇹🇭 ไทย <span class="mc">${mktCount.TH}</span></button>
      <button type="button" class="mktbtn" data-market="US">🇺🇸 สหรัฐ <span class="mc">${mktCount.US}</span></button>
    </div>` : '';

// แถบเรียงลำดับ — ค่าเริ่มต้น "ล่าสุด" (อัปเดตล่าสุดก่อน, เรียงฝั่ง server แล้ว);
// "ไลก์/วิว" เรียงฝั่ง client หลังโหลดยอดจาก /api/views · metric (MOS/Upside/PE/Yield/ROE) เรียงจาก data-* บนการ์ด (0 request)
// ★ ปุ่ม metric = multi-select toggle: เลือก ≥1 ตัว → จัดอันดับด้วย "คะแนนรวม (composite)" หุ้นที่เด่นทุกเกณฑ์ที่เลือกขึ้นบน
//   (มาก=ดี, P/E น้อย=ดี) · กดล่าสุด/ไลก์/วิว = ล้าง metric · deselect หมด = กลับเป็นล่าสุด
const sortBar = reports.length > 1 ? `
    <div class="sortbar" id="sortbar" role="group" aria-label="เรียงลำดับหุ้น">
      <span class="sortlab">เรียงโดย</span>
      <button type="button" class="sortbtn on" data-sort="updated">🕒 ล่าสุด</button>
      <button type="button" class="sortbtn" data-sort="likes">👍 ไลก์</button>
      <button type="button" class="sortbtn" data-sort="views">👁 วิว</button>
      <span class="sortsep" aria-hidden="true"></span>
      <button type="button" class="sortbtn" data-sort="mos">🛡️ MOS</button>
      <button type="button" class="sortbtn" data-sort="upside">📈 Upside</button>
      <button type="button" class="sortbtn" data-sort="pe">⚖️ P/E</button>
      <button type="button" class="sortbtn" data-sort="yield">💰 Yield</button>
      <button type="button" class="sortbtn" data-sort="roe">📊 ROE</button>
    </div>` : '';

const noResult = reports.length ? `
    <div class="noresult" id="noresult" hidden>ไม่พบหุ้นที่ตรงกับ “<span id="qterm"></span>”</div>` : '';

// สคริปต์หน้า index: ค้นหา + แบ่งหน้า (PAGE ตัว/หน้า) + เติมยอดวิวต่อการ์ด (batch ครั้งเดียว)
const PAGE_SIZE = 12; // จำนวนหุ้นต่อหน้า — ปรับที่นี่จุดเดียว
const searchScript = reports.length ? `
  <script>
    (function () {
      var PAGE = ${PAGE_SIZE};
      var q = document.getElementById('q');
      var grid = document.querySelector('.grid');
      var cards = [].slice.call(document.querySelectorAll('.card'));
      var nr = document.getElementById('noresult');
      var term = document.getElementById('qterm');
      var pager = document.getElementById('pager');
      var sortbar = document.getElementById('sortbar');
      var marketbar = document.getElementById('marketbar');
      // market = 'all'|'TH'|'US' (ตัวกรองตลาด) · orderMode = updated|likes|views|composite · selected = metric ที่เลือก (multi)
      var page = 1, market = 'all', orderMode = 'updated', selected = [];

      // ลำดับเดิมจาก server = อัปเดตล่าสุดก่อน (ดัชนีน้อย = ใหม่กว่า) + ค่ายอดเริ่มต้น 0 จนกว่า /api/views จะตอบ
      cards.forEach(function (c, i) { c._ord = i; c._views = 0; c._likes = 0; });
      var filtered = cards.slice();

      var METRIC_KEYS = ['mos', 'upside', 'pe', 'yield', 'roe']; // ปุ่ม metric (multi-select) · GOOD_LO = ค่าน้อยยิ่งดี (P/E)
      var GOOD_LO = { pe: true };
      function isMetric(k) { return METRIC_KEYS.indexOf(k) !== -1; }
      function mnum(c, k) { var v = parseFloat(c.getAttribute('data-' + k)); return isNaN(v) ? null : v; }
      var CMP = {
        updated: function (a, b) { return a._ord - b._ord; },
        likes:   function (a, b) { return (b._likes - a._likes) || (b._views - a._views) || (a._ord - b._ord); },
        views:   function (a, b) { return (b._views - a._views) || (b._likes - a._likes) || (a._ord - b._ord); }
      };

      // คะแนนรวม (composite): min-max normalize แต่ละ metric ที่เลือก เหนือ "ชุดที่กรองแล้ว" (0..1, มาก=ดี) แล้วบวกกัน
      // ไม่มีค่า/ค่าเดียวกันหมด/ P/E ≤ 0 → +0 (ตกท้าย) · P/E กลับด้าน (ต่ำ=ดี → 1-n)
      function scoreComposite(pool) {
        var stats = {};
        selected.forEach(function (k) {
          var vals = [];
          pool.forEach(function (c) { var v = mnum(c, k); if (v !== null && !(GOOD_LO[k] && v <= 0)) vals.push(v); });
          stats[k] = vals.length ? { mn: Math.min.apply(null, vals), mx: Math.max.apply(null, vals) } : null;
        });
        pool.forEach(function (c) {
          var s = 0;
          selected.forEach(function (k) {
            var st = stats[k], v = mnum(c, k);
            if (!st || v === null || (GOOD_LO[k] && v <= 0) || st.mx === st.mn) return;
            var n = (v - st.mn) / (st.mx - st.mn);
            s += GOOD_LO[k] ? (1 - n) : n;
          });
          c._score = s;
        });
      }

      function marketOK(c) { return market === 'all' || c.getAttribute('data-market') === market; }
      function searchOK(c) { var v = q.value.toLowerCase().trim(); return !v || c.getAttribute('data-search').indexOf(v) !== -1; }
      function recompute() {                                // กรอง (ตลาด+ค้นหา) → จัดอันดับ (composite หรือ CMP) → ย้าย DOM
        filtered = cards.filter(function (c) { return marketOK(c) && searchOK(c); });
        if (orderMode === 'composite' && selected.length) {
          scoreComposite(filtered);
          filtered.sort(function (a, b) { return (b._score - a._score) || (a._ord - b._ord); });
        } else {
          filtered.sort(CMP[orderMode] || CMP.updated);
        }
        filtered.forEach(function (c) { grid.appendChild(c); });
      }

      function pages() { return Math.max(1, Math.ceil(filtered.length / PAGE)); }
      function render() {
        var tp = pages(); if (page > tp) page = tp;
        cards.forEach(function (c) { c.style.display = 'none'; });
        filtered.slice((page - 1) * PAGE, page * PAGE).forEach(function (c) { c.style.display = ''; });
        nr.hidden = !(q.value.trim() && filtered.length === 0);
        term.textContent = q.value;
        drawPager(tp);
      }
      function drawPager(tp) {
        if (tp <= 1) { pager.innerHTML = ''; return; }
        var h = '<button class="pg" data-go="prev"' + (page <= 1 ? ' disabled' : '') + '>\\u2039</button>';
        var win = 1, nums = [];                              // แสดงเฉพาะหน้า 1, หน้าสุดท้าย, หน้าปัจจุบัน±win — ที่เหลือย่อเป็น \\u2026
        for (var i = 1; i <= tp; i++) if (i === 1 || i === tp || (i >= page - win && i <= page + win)) nums.push(i);
        for (var j = 0, prev = 0; j < nums.length; j++) {
          var n = nums[j];
          if (n - prev > 1) h += '<span class="pg-gap">\\u2026</span>';
          h += '<button class="pg' + (n === page ? ' on' : '') + '" data-go="' + n + '">' + n + '</button>';
          prev = n;
        }
        h += '<button class="pg" data-go="next"' + (page >= tp ? ' disabled' : '') + '>\\u203a</button>';
        pager.innerHTML = h;
      }
      pager.addEventListener('click', function (e) {
        var b = e.target.closest('[data-go]'); if (!b) return;
        var g = b.getAttribute('data-go'), tp = pages();
        page = g === 'prev' ? Math.max(1, page - 1) : g === 'next' ? Math.min(tp, page + 1) : parseInt(g, 10);
        render(); window.scrollTo(0, 0);
      });
      q.addEventListener('input', function () { recompute(); page = 1; render(); });

      function highlightMetric() {                           // ไฮไลต์ค่า metric ทุกตัวที่เลือก (composite) บนทุกการ์ด
        [].slice.call(document.querySelectorAll('.cmetrics .cm')).forEach(function (s) {
          s.className = 'cm' + (selected.indexOf(s.getAttribute('data-m')) !== -1 ? ' on' : '');
        });
      }
      function syncSortBtns() {                              // metric ใน selected = on · ล่าสุด/ไลก์/วิว = on เฉพาะตอน orderMode ตรง
        if (!sortbar) return;
        [].slice.call(sortbar.querySelectorAll('.sortbtn')).forEach(function (x) {
          var xk = x.getAttribute('data-sort');
          var on = isMetric(xk) ? (selected.indexOf(xk) !== -1) : (orderMode === xk);
          x.className = 'sortbtn' + (on ? ' on' : '');
        });
      }
      if (marketbar) marketbar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-market]'); if (!b) return;
        market = b.getAttribute('data-market');
        [].slice.call(marketbar.querySelectorAll('.mktbtn')).forEach(function (x) { x.className = 'mktbtn' + (x === b ? ' on' : ''); });
        recompute(); page = 1; render(); window.scrollTo(0, 0);
      });
      if (sortbar) sortbar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-sort]'); if (!b) return;
        var k = b.getAttribute('data-sort');
        if (isMetric(k)) {                                   // metric = toggle เข้า/ออก selected → โหมด composite
          var i = selected.indexOf(k);
          if (i === -1) selected.push(k); else selected.splice(i, 1);
          orderMode = selected.length ? 'composite' : 'updated';
        } else { orderMode = k; selected = []; }             // ล่าสุด/ไลก์/วิว = single-select + ล้าง metric
        syncSortBtns(); highlightMetric();
        recompute(); page = 1; render(); window.scrollTo(0, 0);
      });

      // โหลดยอดวิว + likes ทั้งหมดครั้งเดียว (read-only ไม่นับเพิ่ม) เติมลงการ์ด แล้วจัดเรียงใหม่ถ้าเรียงตามไลก์/วิวอยู่
      fetch('/api/views').then(function (r) { return r.json(); }).then(function (map) {
        cards.forEach(function (c) {
          var s = c.querySelector('.cviews'); if (!s) return;
          var e = (map && map[s.getAttribute('data-sym')]) || {};
          c._views = e.c || 0; c._likes = e.l || 0;
          var v = s.querySelector('.v'), l = s.querySelector('.l'), d = s.querySelector('.d');
          if (v) v.textContent = (e.c || 0).toLocaleString();
          if (l) l.textContent = (e.l || 0).toLocaleString();
          if (d) d.textContent = (e.d || 0).toLocaleString();
          s.hidden = false;
        });
        if (orderMode === 'likes' || orderMode === 'views') { recompute(); render(); }
      }).catch(function () {});

      recompute();
      render();
    })();
  </script>` : '';

// แถบเลขหน้า (เฉพาะเมื่อมีรายงาน) — สคริปต์ด้านบนเติมปุ่มให้
const pagerEl = reports.length ? `\n    <div class="pager" id="pager"></div>` : '';

const emptyState = `
      <div class="empty">
        <p>ยังไม่มีรายงานในโฟลเดอร์นี้</p>
        <p class="hint">เพิ่มไฟล์ <code>reports/&lt;SYMBOL&gt;.html</code> แล้ว build ใหม่</p>
      </div>`;

// ---- 7) เขียน index.html ----
const indexHtml = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stock Analysis — รวมรายงานวิเคราะห์หุ้น</title>
<meta name="description" content="รวมรายงานวิเคราะห์หุ้น (Fair Value, Margin of Safety, จุดเข้าซื้อ)">
<link rel="canonical" href="/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Stock Analysis">
<meta property="og:locale" content="th_TH">
<meta property="og:title" content="Stock Analysis — รวมรายงานวิเคราะห์หุ้น">
<meta property="og:description" content="รวมรายงานวิเคราะห์หุ้น (Fair Value, Margin of Safety, จุดเข้าซื้อ) — ${reports.length} รายงาน">
<meta property="og:url" content="${SITE_ORIGIN}/">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Stock Analysis — รวมรายงานวิเคราะห์หุ้น">
<meta name="twitter:description" content="รวมรายงานวิเคราะห์หุ้น (Fair Value, Margin of Safety, จุดเข้าซื้อ) — ${reports.length} รายงาน">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#eef1f5; --card:#fff; --ink:#1a1d23; --muted:#5f6675; --line:#e4e8ee;
    --blue:#1a73e8; --blue-d:#1557b0;
    --shadow:0 1px 3px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.06);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Sarabun','Noto Sans Thai',system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
  .mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
  .wrap{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
  header{background:linear-gradient(135deg,#202938 0%,#2c3a52 60%,#1557b0 140%);border-radius:20px;padding:32px 28px;color:#fff;position:relative;overflow:hidden;box-shadow:var(--shadow)}
  header::after{content:"";position:absolute;right:-40px;top:-40px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(66,133,244,.35),transparent 70%)}
  .tag{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,.14);margin-bottom:12px}
  h1{font-size:30px;font-weight:800;letter-spacing:-.5px}
  .sub{color:#c7d2e4;font-size:14.5px;margin-top:4px}
  .search{margin-top:18px}
  .search input{width:100%;font-family:inherit;font-size:15px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;box-shadow:var(--shadow);outline:none;-webkit-appearance:none}
  .search input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(26,115,232,.15)}
  .search input::placeholder{color:var(--muted)}
  .noresult{text-align:center;color:var(--muted);padding:32px;font-size:14px}
  .sortbar,.marketbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
  .sortlab{font-size:13px;color:var(--muted);margin-right:2px}
  .sortsep{width:1px;align-self:stretch;background:var(--line);margin:2px 2px}
  .sortbtn,.mktbtn{font-family:inherit;font-size:13px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:99px;padding:6px 14px;cursor:pointer;box-shadow:var(--shadow);transition:border-color .15s ease,color .15s ease,background .15s ease}
  .sortbtn:hover:not(.on),.mktbtn:hover:not(.on){border-color:var(--blue);color:var(--blue)}
  .sortbtn.on,.mktbtn.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600}
  .mktbtn .mc{font-family:'IBM Plex Mono',monospace;font-size:11px;opacity:.7;margin-left:1px}
  .mktbtn.on .mc{opacity:.9}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:24px}
  .card{display:flex;flex-direction:column;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;text-decoration:none;color:inherit;box-shadow:var(--shadow);transition:transform .15s ease,box-shadow .15s ease}
  .card:hover{transform:translateY(-3px);box-shadow:0 4px 12px rgba(16,24,40,.10),0 14px 32px rgba(16,24,40,.10)}
  .ctop{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .cflag{font-size:15px;line-height:1;flex:none}
  .badge{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:13px;color:var(--blue-d);background:#e8f0fe;align-self:flex-start;padding:3px 10px;border-radius:8px}
  .cname{font-size:18px;font-weight:700;margin-top:6px}
  .ctitle{font-size:13px;color:var(--muted);line-height:1.35;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;min-height:calc(1.35em * 2)}
  .hl{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;max-width:100%;margin-top:9px;padding:5px 11px 5px 9px;border-radius:99px;font-size:12.5px;font-weight:600;line-height:1.3;border:1px solid transparent}
  .hl .hl-ic{font-size:13.5px;line-height:1}
  .hl .hl-v{font-family:'IBM Plex Mono',monospace;font-weight:700;white-space:nowrap}
  .hl .hl-d{font-weight:500;opacity:.9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hl-val{background:#e7f5ec;color:#0b7a3b;border-color:#bfe6cd}
  .hl-qual{background:#f1ebfb;color:#6a3da3;border-color:#ded0f2}
  .hl-inc{background:#fff3e0;color:#a85d00;border-color:#ffe0b0}
  .hl-cheap{background:#e3f3f7;color:#0b6e84;border-color:#bce4ee}
  .hl.lead{border-color:#e6b315;box-shadow:0 0 0 2px rgba(230,179,21,.18)}
  .cmetrics{display:flex;flex-wrap:wrap;gap:3px 10px;margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);line-height:1.5}
  .cmetrics .cm b{font-weight:600;color:var(--ink)}
  .cmetrics .cm.on{color:var(--blue-d)}
  .cmetrics .cm.on b{color:var(--blue-d)}
  .cmeta{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:8px}
  .go{font-size:13.5px;font-weight:600;color:var(--blue)}
  .cdate{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--muted)}
  .cviews{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--muted)}
  .cviews b{font-weight:600;color:var(--ink)}
  .empty{grid-column:1/-1;text-align:center;padding:48px;background:var(--card);border:1px dashed var(--line);border-radius:16px;color:var(--muted)}
  .empty .hint{font-size:13px;margin-top:6px}
  .empty code{font-family:'IBM Plex Mono',monospace;background:#eef1f5;padding:2px 6px;border-radius:6px}
  .pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:28px}
  .pg{font-family:inherit;font-size:13px;min-width:34px;height:34px;padding:0 9px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;cursor:pointer;box-shadow:var(--shadow)}
  .pg.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600}
  .pg:disabled{opacity:.4;cursor:default}
  .pg:hover:not(:disabled):not(.on){border-color:var(--blue);color:var(--blue)}
  .pg-gap{display:flex;align-items:flex-end;min-width:20px;height:34px;color:var(--muted);font-size:13px;justify-content:center}
  footer{margin-top:32px;text-align:center;color:var(--muted);font-size:12.5px}
  footer a{color:var(--blue);text-decoration:none}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="tag">📊 Stock Analysis</span>
      <h1>รายงานวิเคราะห์หุ้น</h1>
      <div class="sub">Fair Value · Margin of Safety · จุดเข้าซื้อ · ผลตอบแทนคาดการณ์ — รวม ${reports.length} รายงาน</div>
    </header>${searchBox}${marketBar}${sortBar}
    <div class="grid">
${reports.length ? cards : emptyState}
    </div>${noResult}${pagerEl}
    <footer>
      อัปเดตล่าสุด ${fmtDate(nowISO)} · สร้างด้วย build.js · ติดต่อ <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br>
      🤖 วิเคราะห์และจัดทำด้วย AI · <b>${AI_MODEL}</b> · ${AI_MAKER}<br>
      ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน
    </footer>
  </div>${searchScript}
</body>
</html>
`;

fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml, 'utf8');
log(`✅ สร้าง dist/ เสร็จ — ${reports.length} รายงาน + index.html + reports.json`);
