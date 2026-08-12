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
const bt = require('./tools/brandtheme.js');

const ROOT = __dirname;
const REPORTS_DIR = path.join(ROOT, 'reports');
const OUT = path.join(ROOT, 'dist');
const MANIFEST = path.join(ROOT, 'reports.json'); // committed — เก็บ hash/วันที่อัปเดตของแต่ละรายงาน

const CONTACT_EMAIL = 'somchai.s@de.co.th';
const SITE_ORIGIN = 'https://stock-ai.dotent.workers.dev'; // ใช้สร้าง absolute URL ให้ og:url / og:image (social scraper ต้องการ URL เต็ม)
const OG_IMAGE = SITE_ORIGIN + '/static/og.png'; // banner 1200×630 สำหรับการ์ดแชร์ (static/og.png — regenerate จาก static/og.svg)
// เครดิตโมเดลต่อรายงาน = meta ai-model ของไฟล์นั้นเสมอ (gate E28 บังคับให้มีทุกใบ)
// ค่านี้เป็น fallback เผื่อไฟล์ไม่มี meta เท่านั้น — ห้ามใส่ชื่อรุ่นเจาะจง เพราะจะกลายเป็นเครดิตผิดรุ่นเงียบ ๆ
const AI_MODEL = 'Claude (ไม่ระบุรุ่น)';
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
// ฟอนต์ self-host (PageSpeed: ตัด render-blocking CSS ของ Google Fonts + chain ข้ามโดเมน 3 ชั้น ~2s บนมือถือ)
//   ไฟล์ woff2 อยู่ใน fonts/ (ชื่อมีเวอร์ชัน → _headers ตั้ง immutable ได้) · @font-face + unicode-range คัดจาก css2 ของ Google
//   preload เฉพาะ 4 ไฟล์วิกฤต: Sarabun 400 (เนื้อความ) + 800 (h1/LCP) × thai+latin — ★ preload ฟอนต์ต้องมี crossorigin เสมอ
//   แม้ same-origin ไม่งั้น browser โหลดซ้ำ (credentials mode ไม่ตรง) = preload เสียเปล่า
const FONT_LINKS =
  ['sarabun-v17-thai-400', 'sarabun-v17-latin-400', 'sarabun-v17-thai-800', 'sarabun-v17-latin-800']
    .map((f) => `<link rel="preload" href="/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join('\n') +
  '\n<style>' + fs.readFileSync(path.join(TEMPLATE_DIR, 'fonts.css'), 'utf8').trim() + '</style>';
// ธีมเริ่มต้น (โทนน้ำเงิน เหมือนหน้า index) — ใช้เมื่อ report-data.theme ไม่ระบุคีย์ใด
// ทุกคู่ default ต้องผ่าน WCAG AA (gate E38 ตรวจ) — badge เป็นพื้นตัวหนังสือขาว 13px จึงใช้ --blue-d (accent สว่างเกิน)
const THEME_DEFAULTS = {
  accent: '#1a73e8', accentDark: '#1557b0',
  darkGrad: 'linear-gradient(135deg,#202938 0%,#2c3a52 60%,#1557b0 140%)',
  glow: 'rgba(66,133,244,.35)', subColor: '#c7d2e4', headerMuted: '#aebfd6',
  chgBg: 'var(--red-soft)', chgColor: '#c5221f', badge: 'var(--blue-d)',
  verdictText: '#d4dded', vcellLabel: '#c8d1df',
};
// ── โทนสีต่อหุ้นที่ "คำนวณตอน build" (spec 2026-08-11 §3.2) — คาย hex ตรง ๆ ไม่พึ่ง color-mix() ──
// ทำใน Node เพื่อ (1) ไม่ผูกกับ browser support (2) ใช้ pattern fillTokens เดิม (3) gate ตรวจ contrast ได้ (E38)
// ★ ค่าวัดจริงทั้ง 905 ธีม: soft ต้อง 10% (13% ทำ accentDark/soft ตก AA — GNRC 4.46, HLI 4.47)
function deriveTheme(theme) {
  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  // รับ rgb()/hsl() ด้วย — validateReportData ปล่อยผ่านรูปพวกนี้ (+ var()/ชื่อสี ที่ effectiveHex parse ไม่ได้
  // → คืน null; ตกกลับไปใช้ accent ของ THEME_DEFAULTS กัน hexToRgb(null) throw ทั้งหน้าเงียบ ๆ)
  const A = bt.effectiveHex(t.accent, '#ffffff') || bt.effectiveHex(THEME_DEFAULTS.accent, '#ffffff');
  const [r, g, b] = bt.hexToRgb(A);
  return {
    tintBg:   bt.mixHex('#f4f5f7', A, 0.07),
    tintCard: bt.mixHex('#ffffff', A, 0.04),
    line:     bt.mixHex('#e6e8ec', A, 0.14),
    line2:    bt.mixHex('#d8dbe1', A, 0.26),
    soft:     bt.mixHex('#ffffff', A, 0.10),
    shadow:   `0 1px 2px rgba(${r},${g},${b},.12),0 10px 30px rgba(${r},${g},${b},.13)`,
    shadowLg: `0 2px 4px rgba(${r},${g},${b},.14),0 18px 46px rgba(${r},${g},${b},.18)`,
  };
}
const _partialCache = {};
const readPartial = (name) => (_partialCache[name] || (_partialCache[name] = fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8')));
// แทน token ทุกตัว — ใช้ split/join (ไม่ใช่ .replace) เพื่อ "ไม่" ตีความ $$/$& ในค่าแทนที่ (engine มี $${v})
const fillTokens = (tmpl, map) => { let s = tmpl; for (const k in map) s = s.split(k).join(map[k]); return s; };

function renderHead(theme) {
  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  const dv = deriveTheme(t);
  const css = fillTokens(readPartial('dashboard.css'), {
    __RD_ACCENT__: t.accent, __RD_ACCENTD__: t.accentDark, __RD_DARKGRAD__: t.darkGrad,
    __RD_GLOW__: t.glow, __RD_SUBCOL__: t.subColor, __RD_HMUTED__: t.headerMuted,
    __RD_CHGBG__: t.chgBg, __RD_CHGFG__: t.chgColor, __RD_BADGE__: t.badge,
    __RD_VTEXT__: t.verdictText, __RD_VCELLK__: t.vcellLabel,
    __RD_TINTBG__: dv.tintBg, __RD_TINTCARD__: dv.tintCard, __RD_LINE__: dv.line,
    __RD_LINE2__: dv.line2, __RD_SOFT__: dv.soft, __RD_SHADOW__: dv.shadow, __RD_SHADOWLG__: dv.shadowLg,
  });
  return FONT_LINKS + '\n<style>\n' + css + '</style>';
}
function renderEngine(data) {
  const c = data.chart, g = data.gauge, t = { ...THEME_DEFAULTS, ...(data.theme || {}) };
  const js = fillTokens(readPartial('engine.js'), {
    __RD_DATA__: JSON.stringify(c.data), __RD_MIN__: String(c.min), __RD_MAX__: String(c.max),
    __RD_GRID__: c.grid.join(','), __RD_FAIRLINE__: String(c.fairLine), __RD_ACCENT__: t.accent, __RD_ACCENTD__: t.accentDark,
    __RD_CURSYM__: c.currency || '$', __RD_HL__: JSON.stringify(c.highlight),
    __RD_GRIDVAL__: c.gridFmt || 'v',          // นิพจน์ format ป้ายแกน (v / v.toFixed(2) / Math.round(v))
    __RD_DATAVAL__: c.dataFmt || 'd[1]',       // นิพจน์ format ป้ายจุด (d[1] / d[1].toFixed(2) / Math.round(d[1]))
    __RD_GMIN__: String(g.min), __RD_GMAX__: String(g.max), __RD_CUR__: String(g.cur), __RD_FAIR__: String(g.fair),
    // fairLabelTop ต้องเป็นสตริง "px" เท่านั้น — ข้อมูลจริง 317 ใบส่ง true (boolean) มา ⇒ style.top="true"
    // เป็น CSS เสีย ป้าย fair หล่นมาทับป้ายปัจจุบันที่ -34px · ค่าอื่น (เช่น "0") ก็เพี้ยน ⇒ default -58px
    __RD_FAIRTOP__: (typeof g.fairLabelTop === 'string' && /^-?\d+(\.\d+)?px$/.test(g.fairLabelTop)) ? g.fairLabelTop : '-58px',
    __RD_FV__: String(data.fv),
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
  if (c.currency != null && (typeof c.currency !== 'string' || !c.currency || c.currency.length > 3 || /[<>]/.test(c.currency))) throw new Error(`report-data.chart.currency ต้องเป็นสัญลักษณ์สั้นไม่มี '<'/'>' (เช่น "$"/"฿") — พบ ${JSON.stringify(c.currency)}`);
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
  // label แกน x ถูกฝังใน innerHTML ของ SVG (engine.js) — ห้ามมี '<'/'>' กัน HTML/JS inject (engine.js escape ซ้ำที่ sink อีกชั้น)
  for (const p of c.data) if (/[<>]/.test(p[0])) throw new Error(`report-data.chart.data label ห้ามมี '<'/'>' (กัน markup หลุดเข้า DOM ของกราฟ) — พบ ${JSON.stringify(p[0])}`);
  for (const v of c.grid) if (typeof v !== 'number' || !isFinite(v)) throw new Error(`report-data.chart.grid ต้องเป็นตัวเลขล้วน — พบ ${JSON.stringify(v)}`);
  // theme: ค่าสีต้องเป็น token สีที่ถูกต้อง — ★ allowlist ตายตัว (ไม่ใช่ denylist) เพราะค่าพวกนี้ถูก splice ดิบ ๆ
  // ลงใน <style>…</style> / <script>…</script> ผ่าน fillTokens (split/join ไม่ escape) — สองแท็กนั้นเป็น raw-text
  // element คือ "จบแท็กที่ '</style' / '</script' ตัวแรก" ⇒ HTML-escape ปลายทางไม่มีความหมาย ต้องกันที่ต้นทาง
  // ⇒ ทุกชุดอักขระที่อนุญาตไม่มี '<' '>' ';' '{' '}' quote เลย ('/' มีได้เฉพาะในวงเล็บ rgb()/hsl() ตาม syntax
  // ใหม่ rgb(0 0 0 / 50%) — ในเมื่อ '<' ไม่มีทางผ่าน จึงต่อเป็น '</style' ไม่ได้อยู่ดี)
  // ยังคงกัน CSS declaration breakout (เช่น "x;}") + สีพังเงียบ (เช่น hex 5 หลัก → เส้นกราฟล่องหน) เหมือนเดิม
  const t = { ...THEME_DEFAULTS, ...(d.theme || {}) };
  const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, FN = /^(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/i,
    VAR = /^var\(--[a-z0-9-]+(,[a-z0-9#%.,()\s-]+)?\)$/i, GRAD = /^(linear|radial)-gradient\([a-z0-9#%.,()\s-]+\)$/i, NAMED = /^[a-z]+$/i;
  const colorOK = (v, grad) => { v = String(v).trim(); return HEX.test(v) || FN.test(v) || VAR.test(v) || NAMED.test(v) || (grad && GRAD.test(v)); };
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

// อ่าน JSON block ตาม id แบบดิบ (ไม่กรอง field) — ใช้เตรียมข้อมูลให้ injectTA (ต้องการ currency ดิบจาก
// stock-meta และทั้งก้อน report-data ที่ extractMetrics/expandReport ไม่ได้ return ออกมา)
function parseJsonScript(html, id) {
  const m = html.match(new RegExp(`<script[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// การ์ดสถิติมุมขวาบน header รายงาน (feedback 12 ส.ค. 69): 👁 วิว · 👍/👎 (กดโหวตได้) · อัปเดตแบบ "1d ago"
// ใช้ id ชุดเดิม (viewCount/voteBar/likeBtn/…) ให้ injectViewVoteScript ทำงานได้โดยไม่แก้ลอจิก
// แทรกเฉพาะรายงานแบบ template (มี report-data) — legacy ใช้ votebar ใน footer แบบเดิม
function injectHeaderStats(html, r) {
  if (!/<script[^>]*\bid=["']report-data["']/i.test(html)) return { html, done: false };
  // ★ index ต้องหาจาก html ตัวจริงเสมอ ห้าม toLowerCase() ก่อน — ไม่รักษาความยาว ('İ' U+0130 → 2 code unit)
  //   ⇒ index เลื่อน แล้ว slice ของเดิมตัดผิดที่ · แท็กในรีโปเป็นตัวพิมพ์เล็กทั้ง 910 ไฟล์ (reports/ + skeleton)
  const hi = html.indexOf('</header>');
  if (hi === -1) return { html, done: false };
  // ห้ามใช้ fmtDate/escAttr — นิยามทีหลังจุดเรียก decorateReport (TDZ) · YYYY-MM-DD กรองเองพอ
  const upd = String(r.updated || '').slice(0, 10).replace(/[^0-9-]/g, '');
  const updCell = /^\d{4}-\d{2}-\d{2}$/.test(upd)
    ? `<div class="hstat"><span class="n" id="updRel" data-updated="${upd}" title="อัปเดต ${upd}">${upd}</span><span class="l">อัปเดต</span></div>`
    : '';
  // ลำดับเซลล์ = แถวบนข้อมูล (ยอดดู·อัปเดต) แถวล่างปุ่มโหวตคู่กัน (👍👎 บรรทัดเดียว — feedback 12 ส.ค. 69)
  const card =
    `\n<div class="hstats" role="group" aria-label="สถิติรายงาน">` +
    `<div class="hstat" id="viewCount" hidden><span class="n">👁 <b id="viewNum">0</b></span><span class="l">ยอดดู</span></div>` +
    `${updCell}<span class="vb" id="voteBar" hidden>` +
    `<button class="vbtn" id="likeBtn" type="button" title="ถูกใจรายงานนี้"><span class="n">👍 <b id="likeNum">0</b></span><span class="l">ถูกใจ</span></button>` +
    `<button class="vbtn" id="dislikeBtn" type="button" title="ไม่ถูกใจรายงานนี้"><span class="n">👎 <b id="dislikeNum">0</b></span><span class="l">ไม่ถูกใจ</span></button>` +
    `</span></div>\n`;
  return { html: html.slice(0, hi) + card + html.slice(hi), done: true };
}

// แทรกแถบติดต่อ + ลิงก์กลับหน้ารวม ในแต่ละหน้ารายงาน — ตัวนับวิว/ปุ่มโหวตใส่เฉพาะเมื่อ
// ไม่มีการ์ดสถิติบน header (statsInHeader=false, เคส legacy) กันแสดงซ้ำสองที่
// ถ้ามี <footer> เดิมอยู่แล้ว → ต่อท้ายเข้าไปข้างใน (ขึ้นบรรทัดใหม่) ไม่สร้าง footer ซ้อน
function injectContactFooter(html, statsInHeader) {
  const views = `<span class="views" id="viewCount" hidden> · 👁 <b id="viewNum">0</b> ครั้ง</span>`;
  const vote =
    `<span class="votebar" id="voteBar" hidden> · ` +
    `<button class="vbtn" id="likeBtn" type="button">👍 <b id="likeNum">0</b></button> ` +
    `<button class="vbtn" id="dislikeBtn" type="button">👎 <b id="dislikeNum">0</b></button></span>`;
  const link =
    `<a href="/" style="color:#1557b0;text-decoration:none">← ดูรายงานทั้งหมด</a> · ` +
    `ติดต่อ <a href="mailto:${CONTACT_EMAIL}" style="color:#1557b0;text-decoration:none">${CONTACT_EMAIL}</a>` +
    (statsInHeader ? '' : `${views}${vote}`);

  const fi = html.lastIndexOf('</footer>');
  if (fi !== -1) {
    return html.slice(0, fi) + `<br>${link}` + html.slice(fi); // ต่อท้ายใน <footer> เดิม
  }
  // ไม่มี footer เดิม → ใส่ footer ใหม่ก่อน </body>
  const bar =
    `\n<footer style="max-width:1080px;margin:0 auto;padding:14px 16px 40px;text-align:center;` +
    `font-family:'Sarabun',system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:#5f6675">${link}</footer>\n`;
  const bi = html.lastIndexOf('</body>');
  return bi === -1 ? html + bar : html.slice(0, bi) + bar + html.slice(bi);
}

// inject config + script TA เฉพาะรายงานแบบ template ใน dist (source ยัง content-only)
// currency มาจาก stock-meta (ISO) · dec = ทศนิยมราคา (THB 2 ตำแหน่ง, ราคา<1 = 4)
function injectTA(html, symbol, rd, meta, taAsset) {
  if (!rd) return html;                       // รายงาน legacy (ไม่มี report-data) → ข้าม
  const cur = meta && meta.currency === 'THB' ? 'THB' : 'USD';
  const px = rd.gauge && rd.gauge.cur || 0;
  const dec = px && px < 1 ? 4 : 2;
  const t = { ...THEME_DEFAULTS, ...(rd.theme || {}) };
  const cfg = { sym: symbol, cur, fv: rd.fv, accent: t.accent, accentDark: t.accentDark, dec };
  // escape '<' กัน </script>/<!-- breakout — เป็นชั้นสอง: allowlist ใน validateReportData กัน '<'/'>' ที่ต้นทางแล้ว
  // แต่ injectTA รับ rd ดิบจาก parseJsonScript ซึ่ง "ไม่ผ่าน validate" ถ้าไฟล์ไม่มี marker TEMPLATE (expandReport = identity)
  const cfgJson = JSON.stringify(cfg).replace(/</g, '\\u003c');
  // function replacer → ไม่ตีความ $&/$$/$`/$'/$1 ใน cfgJson (accent ต่อหุ้นเป็นค่าดิบ อาจมี $ ได้)
  return html.replace('</body>', () => `<script>window.__TA_CFG__=${cfgJson}</script>\n<script defer src="/${taAsset}"></script>\n</body>`);
}

// แทรก <style> ของปุ่มโหวตเข้าไปใน <head>
function injectVoteStyle(html) {
  const style =
    `\n<style>.votebar .vbtn{font:inherit;cursor:pointer;border:1px solid #d7dbe2;background:#fff;` +
    `border-radius:8px;padding:1px 8px;margin-left:4px;color:#5f6675;line-height:1.9}` +
    `.votebar .vbtn:hover{border-color:#1a73e8;color:#1a73e8}` +
    `.votebar .vbtn.on{border-color:#1a73e8;background:#e8f0fe;color:#1557b0;font-weight:600}</style>\n`;
  const hi = html.lastIndexOf('</head>');
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
    // วันที่อัปเดตบนการ์ด header → "1d ago" (นับวันปฏิทินฝั่งผู้ชม · no-JS เห็นวันจริง · title มีวันเต็ม)
    `var du=gid("updRel");if(du){var p=(du.getAttribute("data-updated")||"").split("-");` +
    `if(p.length===3){var nw=new Date(),t0=new Date(nw.getFullYear(),nw.getMonth(),nw.getDate()).getTime(),` +
    `df=Math.round((t0-new Date(+p[0],+p[1]-1,+p[2]).getTime())/864e5);` +
    `if(isFinite(df)&&df>=0)du.textContent=df===0?"today":df+"d ago";}}` +
    `})();</script>\n`;
  const bi = html.lastIndexOf('</body>');
  return bi === -1 ? html + script : html.slice(0, bi) + script + html.slice(bi);
}

// ── ถอดอีโมจิประดับ (spec §4.3) — ยิงเฉพาะ 5 ช่องที่รู้จักจาก skeleton ห้ามกวาดทั้งเอกสาร ──
// (build ไม่มี DOM parser — กวาดทั้งไฟล์จะกินอีโมจิที่ analyst ตั้งใจใช้ใน prose catalyst/risk ด้วย)
// รองรับทั้งอักขระ Unicode ตรง และ HTML entity (decimal/hex, VS16 มี/ไม่มี) — รายงานเก่าบางไฟล์เข้ารหัสอีโมจิเป็น entity
// (เช่น &#128059; / &#x1F43B; = 🐻) ซึ่ง browser ยัง render เป็นอีโมจิเหมือนเดิม จึงต้องจับคู่กับ anchor เดิม ไม่ใช่กวาดทั้งเอกสาร
// เพิ่ม flag 'i' เพราะเลขฐาน 16 ใน entity อาจมาทั้งตัวพิมพ์เล็ก/ใหญ่ (&#x1f43b; vs &#x1F43B;) — ไม่กระทบ tag/class ที่เป็นตัวพิมพ์เล็กอยู่แล้ว
const EMOJI_SLOTS = [
  [/(<div class="top"><span>)\s*(?:🐻|&#128059;|&#x1F43B;|⚖️|⚖|&#9878;(?:&#65039;|&#xFE0F;)?|&#x2696;(?:&#65039;|&#xFE0F;)?|🚀|&#128640;|&#x1F680;)\s*/giu, '$1'],   // ป้ายฉาก Bear/Base/Bull
  [/(<label>)\s*(?:🧮|&#129518;|&#x1F9EE;)\s*/giu, '$1'],                                  // calc label
  [/(<div class="zone">)\s*(?:💡|&#128161;|&#x1F4A1;)\s*/giu, '$1'],                       // กลยุทธ์
  [/(<b>)\s*(?:⚠️?|&#9888;(?:&#65039;|&#xFE0F;)?|&#x26A0;(?:&#65039;|&#xFE0F;)?)\s*(คำเตือน)/giu, '$1$2'],                          // disclaimer
  [/(<h3><span class="ic">[▲▼]<\/span>)\s*[\u{1F300}-\u{1FAFF}]\s*/gu, '$1'], // cr h3 (กันเผื่อรายงานเก่าบางใบ)
];
function stripDecorEmoji(html) {
  for (const [re, rep] of EMOJI_SLOTS) html = html.replace(re, rep);
  return html;
}

// ป้ายย่อบน nav — ชื่อเต็มยาวรวม ~1,160px ล้นแม้จอ 1280 (feedback เจ้าของ 12 ส.ค.)
const NAV_SHORT = {
  'ราคาย้อนหลัง ~1 ปี': 'ราคา ~1 ปี',
  'การประเมินมูลค่า': 'มูลค่า',
  'ราคาปัจจุบัน vs โซนต่างๆ': 'โซนราคา',
  'Margin of Safety': 'MOS',
  'คาดการณ์ผลตอบแทน 3 ปี': 'ผลตอบแทน 3 ปี',
  'ปัจจัยบวก & ความเสี่ยง': 'บวก & เสี่ยง',
  'สรุปภาพรวม': 'สรุป',
};
// ── section nav แบบ static (spec §4.3) — สร้างตอน build: ใช้ได้แม้ JS ปิด · scroll-spy เป็น enhancement ──
function injectSectionNav(html) {
  const secs = [];
  let i = 0;
  html = html.replace(/<section>(\s*<div class="s-head">[\s\S]*?<h2>([\s\S]*?)<\/h2>)/g, (m, rest, title) => {
    const id = 'sec' + (++i);
    const stripped = title.replace(/<[^>]*>/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    secs.push({ id, title: NAV_SHORT[stripped] || stripped });
    return `<section id="${id}">` + rest;
  });
  if (secs.length < 3) return html; // รายงาน legacy/โครงไม่ครบ → ไม่แทรก (อย่าเดา)
  const nav = `<nav id="secnav" aria-label="สารบัญรายงาน"><div class="sn-in">` +
    secs.map((s, j) => `<a href="#${s.id}"><b>${j + 1}</b><span>${esc(s.title)}</span></a>`).join('') +
    `</div></nav>`;
  const spy = `<script>(function(){var L=[].slice.call(document.querySelectorAll('#secnav a')),S=L.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))});if(!('IntersectionObserver'in window))return;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var i=S.indexOf(e.target);L.forEach(function(a,j){a.classList.toggle('on',i===j);if(i===j)a.scrollIntoView({block:'nearest',inline:'center'})})})},{rootMargin:'-62px 0px -70% 0px'});S.forEach(function(s){if(s)io.observe(s)})})();</script>`;
  const hi = html.indexOf('</header>');
  if (hi === -1) return html;
  html = html.slice(0, hi + 9) + '\n' + nav + html.slice(hi + 9);
  const bi = html.lastIndexOf('</body>');
  return bi === -1 ? html + spy : html.slice(0, bi) + spy + '\n' + html.slice(bi);
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
  const at = html.indexOf('</title>');
  if (at !== -1) { const i = at + '</title>'.length; return html.slice(0, i) + '\n' + tags + html.slice(i); }
  const hi = html.lastIndexOf('</head>');
  return hi === -1 ? tags + '\n' + html : html.slice(0, hi) + tags + '\n' + html.slice(hi);
}

// แทนข้อความ "สร้างด้วย stock-analyzer workflow" ใน footer ต้นฉบับ ด้วยเครดิตโมเดล AI ที่ใช้วิเคราะห์
// (ดึงจาก meta ai-model ต่อ report → ระบุรุ่นที่สร้างรายงานนั้นจริง · ทำตอน build เฉพาะใน dist)
function injectModelCredit(html, model) {
  const credit = `🤖 วิเคราะห์และจัดทำด้วย AI · <b>${escAttr(model)}</b> · ${AI_MAKER}`;
  const re = /สร้างด้วย\s*stock-analyzer\s*workflow/i;
  if (re.test(html)) return html.replace(re, () => credit); // function replacer → ไม่ตีความ $ ใน credit (ชื่อโมเดลมาจาก meta ของไฟล์)
  // ไม่พบข้อความเดิม → ผนวกเครดิตเข้าใน <footer> ท้ายสุด (กันรายงานที่ไม่มีบรรทัดนี้ ให้ยังมี attribution)
  const fi = html.lastIndexOf('</footer>');
  return fi === -1 ? html : html.slice(0, fi) + ` • ${credit}` + html.slice(fi);
}

// ตกแต่งไฟล์รายงานก่อนเขียนลง dist: share meta + เครดิตโมเดล + footer ติดต่อ + ตัวนับยอดวิว + ปุ่ม Like/Dislike
function decorateReport(html, r) {
  const model = r.aiModel || AI_MODEL;
  let h = stripDecorEmoji(html);
  h = injectSectionNav(h);
  h = injectShareMeta(h, r);
  h = injectModelCredit(h, model);
  const hs = injectHeaderStats(h, r);           // การ์ดสถิติบน header (template เท่านั้น)
  h = injectContactFooter(hs.html, hs.done);    // done → footer ไม่ใส่ views/vote ซ้ำ
  if (!hs.done) h = injectVoteStyle(h);         // สไตล์ปุ่มโหวตแบบเก่า ใช้เฉพาะ legacy (กันชนกับ .hstats)
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
module.exports = { extractMeta, extractMetrics, freshHash, injectModelCredit, injectContactFooter, injectTA, parseJsonScript, decorateReport, pickHighlight, computeLeaders, HL_DEFS, AI_MODEL, AI_MAKER, expandReport, renderHead, renderEngine, validateReportData, THEME_DEFAULTS, deriveTheme, stripDecorEmoji, injectSectionNav };
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
// ประทับเวลา "ตอนนี้" ตามเวลาไทย (CLAUDE.md §7 — ทุกการคิด "วันนี้" ใช้ Asia/Bangkok เหมือน tools/ ตัวอื่น)
//   toISOString() = UTC ⇒ build ตอน 18:00 UTC (= 01:00 น. วันถัดไปที่ไทย) จะโชว์ "อัปเดตล่าสุด" เป็นเมื่อวาน
//   คง offset +07:00 ไว้ให้ยังเป็น ISO 8601 เต็ม (article:modified_time + reports.json ต้องการ instant จริง
//   ไม่ใช่แค่ YYYY-MM-DD) แต่ .slice(0,10) ได้วันปฏิทินไทยตรง ๆ ทุกจุดที่ตัดวันจากค่านี้
//   เรียงแบบ string ยังถูก: wall-clock ไทย = instant+7h จึงมากกว่าสตริง "…Z" ของ record เก่าทุกตัวเสมอ
const nowISO = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace(' ', 'T') + '+07:00';

// ---- 2.5) TA chart bundle: vendor + engine + glue → ไฟล์ shared เดียว (immutable cache ข้ามทุกรายงาน) ----
// ทำก่อน loop รายงาน (ข้อ 3) เพราะแต่ละรายงานต้อง inject <script src="/{TA_ASSET}"> ที่รู้ hash แล้ว
const taSrc = ['vendor/lightweight-charts.standalone.production.js', 'ta-engine.js', 'ta-chart.js']
  .map((f) => fs.readFileSync(path.join(ROOT, '_template', f), 'utf8')).join('\n;\n');
const taHash = crypto.createHash('sha256').update(taSrc).digest('hex').slice(0, 8);
const TA_ASSET = `assets/ta-${taHash}.js`;
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets', `ta-${taHash}.js`), taSrc);
log('assets:', TA_ASSET);

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
    // report-data/stock-meta ดิบ (จาก source ต้นฉบับ) → ให้ injectTA ประกอบ __TA_CFG__ ; รายงาน legacy (ไม่มี report-data) → rd=null → injectTA ข้าม
    const rd = parseJsonScript(content, 'report-data');
    const meta = parseJsonScript(content, 'stock-meta');
    // สีแบรนด์ไปการ์ดหน้าแรก — in-memory เท่านั้น (spec §5.2.1: ห้ามลง reports.json)
    const _th = { ...THEME_DEFAULTS, ...((rd && rd.theme) || {}) };
    rec.accent = bt.effectiveHex(_th.accent, '#ffffff');
    rec.accentDark = bt.effectiveHex(_th.accentDark, '#ffffff');
    // expandReport: source แบบ template (content-only) → inject โครงที่ใช้ร่วม ; source เก่า → identity (ไม่เปลี่ยน)
    // injectTA ครอบผลลัพธ์สุดท้าย เพิ่ม __TA_CFG__ + <script src="/assets/ta-*.js"> เฉพาะใน dist (เหมือน decorateReport)
    fs.writeFileSync(path.join(OUT, entry.name), injectTA(decorateReport(expandReport(content), rec), symbol, rd, meta, TA_ASSET)); // hash อิงต้นฉบับ, share meta+footer+ตัวนับ+TA ใส่เฉพาะใน dist
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
// MOS/Upside ติดคลาส pos/neg ตามเครื่องหมาย — โหมดตารางใช้แยกสีตัวเลขบวก/ลบ
const signCls = (dk, v) => (dk === 'mos' || dk === 'upside') && v != null ? (v > 0 ? ' pos' : v < 0 ? ' neg' : '') : '';
const metricStrip = (m) => !m ? '' : `
        <div class="cmetrics">${METRIC_DEFS.map((d) => `<span class="cm${signCls(d.dk, m[d.k])}" data-m="${d.dk}">${d.lab} <b>${esc(fmtMetric(m[d.k], d.suf))}</b></span>`).join('')}</div>`;

// ป้ายไฮไลต์ "จุดเด่น" ของหุ้นแต่ละตัว — คำนวณตอน build จาก stock-meta (static, ไม่พึ่ง JS)
const leaders = computeLeaders(reports);
const highlightChip = (m) => {
  const h = pickHighlight(m, leaders);
  return h ? `
        <div class="hl hl-${h.cls}${h.lead ? ' lead' : ''}"><span class="hl-v">${esc(h.value)}</span><span class="hl-d">${esc(h.desc)}</span></div>` : '';
};

const PAGE_SIZE = 12; // จำนวนหุ้นต่อหน้า (โหมดไทล์) — ปรับที่นี่จุดเดียว
const cardHtml = reports.map((r) => {
  const blurb = r.desc || r.title;
  const c = escAttr(r.accent || THEME_DEFAULTS.accent), cd = escAttr(r.accentDark || THEME_DEFAULTS.accentDark);
  return `
      <a class="card" style="--c:${c};--cd:${cd}" data-search="${escAttr((r.symbol + ' ' + r.name + ' ' + r.title + ' ' + (r.desc || '')).toLowerCase())}"${metricAttrs(r.metrics)}${marketAttr(r.metrics)} href="./${encodeURIComponent(r.file)}">
        <div class="ctop"><div class="badge">${esc(r.symbol)}</div>${highlightChip(r.metrics)}${marketFlag(r.metrics)}</div>
        <div class="cbody">
          <div class="cname">${esc(r.name)}</div>
          <div class="ctitle" title="${escAttr(blurb)}">${esc(blurb)}</div>${metricStrip(r.metrics)}
          <div class="cmeta"><span class="go">รายงาน →</span><span class="cviews" data-sym="${escAttr(r.symbol)}" hidden>👁 <b class="v">0</b> · 👍 <b class="l">0</b></span><span class="cdate" data-updated="${escAttr(fmtDate(r.updated))}" title="อัปเดต ${escAttr(fmtDate(r.updated))}">${fmtDate(r.updated)}</span></div>
        </div>
      </a>`;
});
// PageSpeed: การ์ดเกินหน้าแรกเก็บใน <template> (inert — ไม่สร้าง layout/style ตอนโหลด · DOM แรกเหลือ ${PAGE_SIZE}
// การ์ดแทน 908) แล้วสคริปต์ค้นหา hydrate กลับเข้า .grid ก่อน querySelectorAll — ลำดับการ์ดคงเดิมทุกประการ
// no-JS เห็นเฉพาะหน้าแรก (ยอมรับได้ — pager เองก็เป็น JS อยู่แล้ว และ sitemap ครอบทุกรายงาน)
const cards = cardHtml.slice(0, PAGE_SIZE).join('\n') +
  (cardHtml.length > PAGE_SIZE ? `\n<template id="cardstore">${cardHtml.slice(PAGE_SIZE).join('\n')}\n</template>` : '');

// ช่องค้นหา + ข้อความ "ไม่พบ" + สคริปต์กรอง (เฉพาะเมื่อมีรายงาน)
// อยู่แถวเดียวกับ sortbar ชิดขวา (toolbar) — มือถือเด้งขึ้นเป็นแถวเต็มความกว้างด้วย order:-1
const searchBox = reports.length ? `
      <div class="search">
        <svg class="sic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>
        <input id="q" type="search" placeholder="ค้นหาหุ้น… ชื่อย่อ/บริษัท" autocomplete="off" spellcheck="false" aria-label="ค้นหาหุ้น ชื่อย่อ หรือ ชื่อบริษัท">
      </div>` : '';

// สถิติบน header = ปุ่มกรองตลาดในตัว (แทนแถบกรองเดิมที่แสดงตัวเลขซ้ำกับสถิติ — ลบตาม feedback 12 ส.ค. 69)
const mktCount = reports.reduce((a, r) => { const mk = r.metrics && r.metrics.market; if (mk === 'TH') a.TH++; else if (mk === 'US') a.US++; return a; }, { TH: 0, US: 0 });
const canFilterMkt = reports.length > 1 && mktCount.TH > 0 && mktCount.US > 0;
const hdStat = (mk, n, lab) => canFilterMkt
  ? `<button type="button" class="hstat${mk === 'all' ? ' on' : ''}" data-market="${mk}" aria-pressed="${mk === 'all'}"><span class="n">${n}</span><span class="l">${lab}</span></button>`
  : `<div class="hstat"><span class="n">${n}</span><span class="l">${lab}</span></div>`;
const hdStats = `<div class="hd-stats" id="hdstats"${canFilterMkt ? ' role="group" aria-label="กรองตามตลาด"' : ''}>
        ${hdStat('all', reports.length, 'รายงานทั้งหมด')}
        <div class="hstat st"><span class="n">${fmtDate(nowISO)}</span><span class="l">อัปเดตล่าสุด</span></div>
        ${hdStat('TH', mktCount.TH, '🇹🇭 ตลาดไทย')}
        ${hdStat('US', mktCount.US, '🇺🇸 ตลาดสหรัฐ')}
      </div>`;

// แถบเรียงลำดับ — ค่าเริ่มต้น "ล่าสุด" (อัปเดตล่าสุดก่อน, เรียงฝั่ง server แล้ว);
// "ไลก์/วิว" เรียงฝั่ง client หลังโหลดยอดจาก /api/views · metric (MOS/Upside/PE/Yield/ROE) เรียงจาก data-* บนการ์ด (0 request)
// ★ ปุ่ม metric = multi-select toggle: เลือก ≥1 ตัว → จัดอันดับด้วย "คะแนนรวม (composite)" หุ้นที่เด่นทุกเกณฑ์ที่เลือกขึ้นบน
//   (มาก=ดี, P/E น้อย=ดี) · กดล่าสุด/ไลก์/วิว = ล้าง metric · deselect หมด = กลับเป็นล่าสุด
const sortBar = reports.length > 1 ? `
    <div class="sortbar" id="sortbar" role="group" aria-label="เรียงลำดับหุ้น">
      <button type="button" class="sortbtn on" data-sort="updated">ล่าสุด</button>
      <button type="button" class="sortbtn" data-sort="likes">ไลก์</button>
      <button type="button" class="sortbtn" data-sort="views">วิว</button>
      <span class="sortsep" aria-hidden="true"></span>
      <button type="button" class="sortbtn" data-sort="mos">MOS</button>
      <button type="button" class="sortbtn" data-sort="upside">Upside</button>
      <button type="button" class="sortbtn" data-sort="pe">P/E</button>
      <button type="button" class="sortbtn" data-sort="yield">Yield</button>
      <button type="button" class="sortbtn" data-sort="roe">ROE</button>
      <span class="sortsep" aria-hidden="true"></span>
      <span id="viewtoggle" role="group" aria-label="รูปแบบการแสดงผล"><button type="button" class="viewbtn on" data-view="tiles">ไทล์</button><button type="button" class="viewbtn" data-view="table">ตาราง</button></span>
    </div>` : '';

const noResult = reports.length ? `
    <div class="noresult" id="noresult" hidden>ไม่พบหุ้นที่ตรงกับ “<span id="qterm"></span>”</div>` : '';

// สคริปต์หน้า index: ค้นหา + แบ่งหน้า (PAGE ตัว/หน้า) + เติมยอดวิวต่อการ์ด (batch ครั้งเดียว)
const searchScript = reports.length ? `
  <script>
    (function () {
      var q = document.getElementById('q');
      var grid = document.querySelector('.grid');
      // hydrate การ์ดที่พักไว้ใน <template id="cardstore"> (การ์ดหน้า 2 เป็นต้นไป) กลับเข้า grid ก่อนอ่านรายการการ์ด
      var store = document.getElementById('cardstore');
      if (store) { grid.appendChild(store.content); store.remove(); }
      var cards = [].slice.call(document.querySelectorAll('.card'));
      var nr = document.getElementById('noresult');
      var term = document.getElementById('qterm');
      var pager = document.getElementById('pager');
      var sortbar = document.getElementById('sortbar');
      var hdstats = document.getElementById('hdstats');
      var thead = document.getElementById('thead');
      var tblhint = document.getElementById('tblhint');
      function pageSize() { return grid.classList.contains('is-table') ? 25 : ${PAGE_SIZE}; } // ตาราง 25 แถว/หน้า · ไทล์ ${PAGE_SIZE}/หน้า
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

      function pages() { return Math.max(1, Math.ceil(filtered.length / pageSize())); }
      function render() {
        var tp = pages(); if (page > tp) page = tp;
        cards.forEach(function (c) { c.style.display = 'none'; });
        var ps = pageSize();
        // zebra ตาราง = สลับสีตาม "แถวที่มองเห็น" (nth-child ใช้ไม่ได้ — นับการ์ดที่ถูกซ่อนด้วย)
        filtered.slice((page - 1) * ps, page * ps).forEach(function (c, i) { c.style.display = ''; c.classList.toggle('alt', i % 2 === 1); });
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
          s.classList.toggle('on', selected.indexOf(s.getAttribute('data-m')) !== -1); // toggle ไม่เขียนทับ pos/neg
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
      function syncThead() {                                 // ซิงก์หัวตารางให้ตรงกับปุ่มเรียง (คอลัมน์ที่กำลังเรียง = .on)
        if (!thead) return;
        [].slice.call(thead.querySelectorAll('span[data-sort]')).forEach(function (s) {
          var k = s.getAttribute('data-sort');
          var on = isMetric(k) ? (selected.indexOf(k) !== -1) : (orderMode === k);
          s.classList.toggle('on', on);
        });
      }
      // กรองตลาดจากการ์ดสถิติบน header (รายงานทั้งหมด/ไทย/สหรัฐ = ปุ่ม)
      if (hdstats) hdstats.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-market]'); if (!b) return;
        market = b.getAttribute('data-market');
        [].slice.call(hdstats.querySelectorAll('button[data-market]')).forEach(function (x) {
          var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on));
        });
        recompute(); page = 1; render();
      });
      if (sortbar) sortbar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-sort]'); if (!b) return;
        var k = b.getAttribute('data-sort');
        if (isMetric(k)) {                                   // metric = toggle เข้า/ออก selected → โหมด composite
          var i = selected.indexOf(k);
          if (i === -1) selected.push(k); else selected.splice(i, 1);
          orderMode = selected.length ? 'composite' : 'updated';
        } else { orderMode = k; selected = []; }             // ล่าสุด/ไลก์/วิว = single-select + ล้าง metric
        syncSortBtns(); syncThead(); highlightMetric();
        recompute(); page = 1; render(); window.scrollTo(0, 0);
      });
      // หัวตาราง (โหมดตาราง) คลิกได้ = เรียงคอลัมน์นั้นแบบเดี่ยว (exclusive) — proxy ไปคลิกชิปเรียงจริง ไม่ fork ลอจิก
      if (thead) thead.addEventListener('click', function (e) {
        var s = e.target.closest('span[data-sort]'); if (!s || !sortbar) return;
        var m = s.getAttribute('data-sort');
        if (m === 'updated') {
          var ub = sortbar.querySelector('[data-sort="updated"]'); if (ub) ub.click();
        } else {
          [].slice.call(sortbar.querySelectorAll('.sortbtn.on')).forEach(function (b) {
            var bk = b.getAttribute('data-sort');
            if (isMetric(bk) && bk !== m) b.click();          // ล้าง composite member อื่นออกก่อน (exclusive)
          });
          var mb = sortbar.querySelector('[data-sort="' + m + '"]');
          if (mb) mb.click();                                 // toggle m เอง — คลิกซ้ำหัวเดิม = ปิด กลับไป "ล่าสุด"
        }
        syncThead();
      });

      // โหลดยอดวิว + likes ทั้งหมดครั้งเดียว (read-only ไม่นับเพิ่ม) เติมลงการ์ด แล้วจัดเรียงใหม่ถ้าเรียงตามไลก์/วิวอยู่
      fetch('/api/views').then(function (r) { return r.json(); }).then(function (map) {
        cards.forEach(function (c) {
          var s = c.querySelector('.cviews'); if (!s) return;
          var e = (map && map[s.getAttribute('data-sym')]) || {};
          c._views = e.c || 0; c._likes = e.l || 0;
          var v = s.querySelector('.v'), l = s.querySelector('.l');
          if (v) v.textContent = (e.c || 0).toLocaleString();
          if (l) l.textContent = (e.l || 0).toLocaleString();
          s.hidden = false;
        });
        if (orderMode === 'likes' || orderMode === 'views') { recompute(); render(); }
      }).catch(function () {});

      // วันที่บนการ์ด/ตาราง → แบบสัมพัทธ์ "1d ago" (นับวันปฏิทินฝั่งผู้ชม · no-JS เห็นวันที่จริง · hover ดูวันเต็มจาก title)
      var _n = new Date(), _t0 = new Date(_n.getFullYear(), _n.getMonth(), _n.getDate()).getTime();
      [].slice.call(document.querySelectorAll('.cdate[data-updated]')).forEach(function (s) {
        var p = (s.getAttribute('data-updated') || '').split('-');
        if (p.length !== 3) return;
        var d = Math.round((_t0 - new Date(+p[0], +p[1] - 1, +p[2]).getTime()) / 864e5);
        if (!isFinite(d) || d < 0) return;
        s.textContent = d === 0 ? 'today' : d + 'd ago';
      });

      // ป้ายบอก "ตารางเลื่อนข้างได้" — โชว์เฉพาะโหมดตารางที่กว้างเกินจอ ซ่อนถาวรทันทีที่ผู้ใช้เลื่อนเอง
      var hintDone = false;
      function syncHint() {
        if (!tblhint) return;
        tblhint.hidden = hintDone || !(grid.classList.contains('is-table') && grid.scrollWidth > grid.clientWidth + 4);
      }
      grid.addEventListener('scroll', function () { if (!hintDone && grid.scrollLeft > 30) { hintDone = true; syncHint(); } });
      window.addEventListener('resize', syncHint);

      // ── view toggle ไทล์ ⇄ ตาราง (spec §5.2) — ตารางใช้ได้ทุกความกว้าง (เลื่อนแนวนอนบนจอแคบ) ──
      var vt = document.getElementById('viewtoggle');
      if (vt) {
        var setView = function (v) {
          grid.classList.toggle('is-table', v === 'table');
          [].forEach.call(vt.querySelectorAll('.viewbtn'), function (b) { b.classList.toggle('on', b.getAttribute('data-view') === v); });
          try { localStorage.setItem('idxview', v); } catch (e) {}
          var tp = pages(); if (page > tp) page = tp;         // จำนวนหน้าต่างกัน (ตาราง 25 / ไทล์ 12) → คลี่แพจเจอร์ใหม่ทันที
          render();
          syncHint();
        };
        vt.addEventListener('click', function (e) { var b = e.target.closest('.viewbtn'); if (b) setView(b.getAttribute('data-view')); });
        var saved = 'tiles';
        try { saved = localStorage.getItem('idxview') || 'tiles'; } catch (e) {}
        if (saved === 'table') setView('table');
      }

      syncThead();
      recompute();
      render();
      syncHint();
    })();
  </script>` : '';

// แถบเลขหน้า (เฉพาะเมื่อมีรายงาน) — สคริปต์ด้านบนเติมปุ่มให้
const pagerEl = reports.length ? `\n    <div class="pager" id="pager"></div>` : '';

// footer หน้า index: ข้อความ 2 บรรทัดตามที่เจ้าของกำหนดเอง verbatim (12 ส.ค. 69) — ห้ามแต่งเพิ่ม

const emptyState = `
      <div class="empty">
        <p>ยังไม่มีรายงานในโฟลเดอร์นี้</p>
        <p class="hint">เพิ่มไฟล์ <code>reports/&lt;SYMBOL&gt;.html</code> แล้ว build ใหม่</p>
      </div>`;

// สเปกตรัมหัวเว็บ = สีแบรนด์จริงของทุกหุ้น เรียงตาม hue (spec §5.1) — โมโนโครมทั้งหน้า สีมาจากหุ้นเท่านั้น
const hueOf = (hex) => {
  const [r, g, b] = bt.hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return -1;
  const d = mx - mn;
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
const _spectrumSrc = reports.map((r) => r.accent).filter(Boolean).filter((c) => hueOf(c) >= 0).sort((a, b) => hueOf(a) - hueOf(b));
const spectrum = _spectrumSrc.filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 96)) === 0).slice(0, 96);
const spectrumHtml = spectrum.length ? `<div id="spectrum">${spectrum.map((c) => `<i style="background:${escAttr(c)}"></i>`).join('')}</div>` : '';

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
${FONT_LINKS}
<style>
  :root{
    --bg:#eef0f3; --card:#fff; --ink:#13151b; --ink-2:#3c424e; --muted:#5f6675;
    --line:#e5e7eb; --line-2:#d4d8de;
    --shadow:0 1px 2px rgba(16,24,40,.05),0 6px 18px rgba(16,24,40,.07);
    --shadow-lg:0 3px 8px rgba(16,24,40,.09),0 20px 46px rgba(16,24,40,.16);
    --display:'Sarabun','Noto Sans Thai',system-ui,sans-serif; --monoff:'IBM Plex Mono',ui-monospace,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Sarabun',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.68;-webkit-font-smoothing:antialiased}
  .mono{font-family:var(--monoff)}
  .wrap{max-width:1280px;margin:0 auto;padding:22px 20px 72px}
  /* header ไล่โทนน้ำเงินเข้ม + glow มุม (feedback 12 ส.ค.: ดำสนิทจืด/อ่านยาก) + สเปกตรัมสีแบรนด์จริง */
  header{background:linear-gradient(135deg,#12141a 0%,#1a2233 52%,#27354f 100%);border-radius:26px;padding:0;color:#fff;position:relative;overflow:hidden;box-shadow:var(--shadow-lg)}
  #spectrum{display:flex;height:8px;width:100%}
  #spectrum i{flex:1;height:100%}
  .hd-in{padding:30px 34px 32px;display:flex;align-items:center;justify-content:space-between;gap:30px;background:radial-gradient(560px 320px at 92% -10%,rgba(96,141,255,.20),transparent 65%),radial-gradient(430px 280px at 2% 115%,rgba(255,158,74,.13),transparent 62%)}
  .hd-left{flex:1 1 auto;min-width:0}
  .tag{display:inline-block;font-family:var(--monoff);font-size:10.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.65);margin-bottom:12px}
  h1{font-family:var(--display);font-size:38px;font-weight:800;letter-spacing:-.6px;line-height:1.15}
  .sub{color:rgba(255,255,255,.78);font-size:14.5px;margin-top:8px;font-weight:300;max-width:64ch}
  /* การ์ดสถิติ = ปุ่มกรองตลาดในตัว (desktop ชิดขวา · mobile ตกลงใต้ข้อความเป็นแถวแบบเดิม) */
  .hd-stats{flex:none;display:grid;grid-template-columns:auto auto;gap:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:12px;margin:0}
  .hstat{display:flex;flex-direction:column;gap:3px;align-items:flex-start;background:none;border:0;border-radius:13px;padding:11px 18px;color:#fff;font:inherit;text-align:left}
  button.hstat{cursor:pointer;transition:background .14s}
  button.hstat:hover:not(.on){background:rgba(255,255,255,.06)}
  button.hstat.on{background:rgba(255,255,255,.14)}
  .hstat .n{font-family:var(--display);font-size:25px;font-weight:700;letter-spacing:-.4px;line-height:1;font-variant-numeric:tabular-nums}
  .hstat .l{font-family:var(--monoff);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.6);white-space:nowrap}
  button.hstat.on .l{color:rgba(255,255,255,.8)}
  /* toolbar = sortbar (ซ้าย) + search (ชิดขวา) แถวเดียวกัน — จอแคบ search ตกบรรทัดใหม่ชิดขวา */
  .toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin-top:18px}
  .search{position:relative;flex:1 1 220px;min-width:190px;max-width:320px;margin-left:auto}
  .search .sic{position:absolute;left:15px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--muted);pointer-events:none}
  .search input{width:100%;font-family:'Sarabun',sans-serif;font-size:14px;color:var(--ink);background:var(--card);border:0;border-radius:99px;padding:9px 18px 10px 40px;box-shadow:var(--shadow);outline:none;-webkit-appearance:none;transition:box-shadow .14s}
  .search input:focus{box-shadow:var(--shadow),0 0 0 3px rgba(19,21,27,.14)}
  .search input::placeholder{color:var(--muted)}
  .noresult{text-align:center;color:var(--muted);padding:40px;font-size:14px}
  .sortbar{display:flex;flex-wrap:wrap;align-items:center;gap:7px;flex:0 1 auto;min-width:0}
  .sortsep{width:1px;align-self:stretch;background:var(--line-2);margin:3px 4px}
  .sortbtn,.viewbtn{font-family:'Sarabun',sans-serif;font-size:13px;color:var(--ink-2);background:var(--card);border:0;border-radius:99px;padding:7px 15px;cursor:pointer;box-shadow:var(--shadow);transition:all .14s}
  .sortbtn:hover:not(.on),.viewbtn:hover:not(.on){color:var(--ink);transform:translateY(-1px)}
  .sortbtn.on,.viewbtn.on{background:var(--ink);color:#fff;font-weight:500}
  #viewtoggle{display:inline-flex;gap:6px;flex:none}
  .tblhint{margin:16px 0 -12px;text-align:center;font-size:12px;color:var(--muted)}
  /* ── ไทล์ (default) ── */
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(276px,1fr));gap:18px;margin-top:26px}
  #thead{display:none}
  .card{--c:#6b7280;--cd:#4b5563;display:flex;flex-direction:column;background:var(--card);border:0;border-radius:20px;padding:0;text-decoration:none;color:inherit;box-shadow:var(--shadow);position:relative;overflow:hidden;transition:transform .18s ease,box-shadow .18s ease}
  .card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
  .ctop{display:flex;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:8px;background:var(--cd);padding:17px 20px 15px;position:relative;overflow:hidden}
  .ctop::after{content:"";position:absolute;right:-38px;top:-58px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,var(--c),transparent 68%);opacity:.75}
  .badge{font-family:var(--display);font-weight:700;font-size:23px;letter-spacing:-.3px;color:#fff;position:relative;z-index:2;line-height:1.15;flex:none}
  .cflag{font-size:15px;line-height:1;flex:none;position:relative;z-index:2;margin-left:auto}
  .cbody{display:flex;flex-direction:column;padding:15px 20px 16px;flex:1}
  .cname{font-family:var(--display);font-size:16px;font-weight:600;line-height:1.35;letter-spacing:-.25px}
  .ctitle{font-size:12.5px;color:var(--muted);line-height:1.45;font-weight:300;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;min-height:calc(1.45em * 2);margin-top:7px}
  .hl{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;max-width:100%;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:500;line-height:1.3;border:1px solid transparent}
  .ctop .hl{flex:0 1 auto;min-width:0;margin:0 0 0 10px;position:relative;z-index:2;align-self:center}
  .hl .hl-v{font-family:var(--monoff);font-weight:600;white-space:nowrap}
  .hl .hl-d{font-weight:300;opacity:.92;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ctop .hl .hl-v{flex:none}
  .ctop .hl .hl-d{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hl-val{background:#e7f6ee;color:#066a41;border-color:#bde3ce}
  .hl-qual{background:#f2ecfb;color:#61369a;border-color:#ddd0f2}
  .hl-inc{background:#fdf3e2;color:#9a5500;border-color:#f6dfb4}
  .hl-cheap{background:#e4f3f7;color:#0a6579;border-color:#bfe3ec}
  .hl.lead{box-shadow:0 0 0 2px rgba(230,179,21,.24)}
  .cmetrics{display:flex;flex-wrap:wrap;gap:3px 12px;margin-top:11px;font-family:var(--monoff);font-size:10.5px;color:var(--muted);line-height:1.6}
  .cmetrics .cm b{font-weight:600;color:var(--ink-2)}
  .cmetrics .cm.on{color:var(--cd)} .cmetrics .cm.on b{color:var(--cd)}
  .cmeta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid var(--line);white-space:nowrap}
  .go{font-family:var(--display);font-size:13px;font-weight:600;color:var(--cd);flex:none}
  .cdate,.cviews{font-family:var(--monoff);font-size:10.5px;color:var(--muted)}
  .cdate{flex:none}
  .cviews{min-width:0;overflow:hidden;text-overflow:ellipsis}
  .cviews b{font-weight:600;color:var(--ink-2)}
  /* ── โหมดตาราง (toggle · ทำงานทุกความกว้าง — จอแคบเลื่อนแนวนอน, spec §5.2) ──
     หัวตารางเข้ม · แถวสลับสี (zebra จาก JS ตามแถวที่มองเห็น) · MOS/Upside เขียว/แดงตามเครื่องหมาย */
  .grid.is-table{--cols:118px minmax(190px,2.2fr) repeat(5,68px) 78px;display:block;background:var(--card);border:1px solid var(--line-2);border-radius:16px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;box-shadow:var(--shadow)}
  .grid.is-table::-webkit-scrollbar{height:9px}
  .grid.is-table::-webkit-scrollbar-track{background:transparent}
  .grid.is-table::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:99px}
  .grid.is-table #thead{display:grid;grid-template-columns:var(--cols);gap:0 14px;align-items:center;padding:13px 18px;background:linear-gradient(180deg,#232e47,#161c2a);min-width:856px;font-family:var(--monoff);font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.68)}
  .grid.is-table #thead .num{text-align:right}
  #thead span[data-sort]{cursor:pointer;transition:color .14s}
  #thead span[data-sort]:hover{color:#fff}
  #thead span.on{color:#fff;font-weight:600}
  #thead span.on::after{content:"▾";margin-left:3px}
  .grid.is-table .card{display:grid;grid-template-columns:var(--cols);gap:0 14px;align-items:center;border:0;border-left:3px solid var(--c);border-radius:0;padding:11px 18px 11px 15px;box-shadow:none;overflow:visible;min-width:856px}
  .grid.is-table .card.alt{background:#f4f6f9}
  .grid.is-table .card:hover{transform:none;box-shadow:none;background:#e9eef5}
  .grid.is-table .ctop{display:flex;background:none;padding:0;overflow:visible}
  .grid.is-table .ctop::after{display:none}
  .grid.is-table .badge{font-family:var(--monoff);font-size:12px;font-weight:600;color:var(--cd);letter-spacing:.02em;display:flex;align-items:center;gap:7px}
  .grid.is-table .badge::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
  .grid.is-table .cflag{font-size:12px;opacity:.8}
  .grid.is-table .cbody{display:contents}
  .grid.is-table .cname{font-size:13.5px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .grid.is-table .ctitle,.grid.is-table .hl,.grid.is-table .go,.grid.is-table .cviews{display:none}
  .grid.is-table .cmetrics{display:contents}
  .grid.is-table .cmetrics .cm{font-size:0;text-align:right;white-space:nowrap;overflow:hidden}
  .grid.is-table .cmetrics .cm b{font-size:11.5px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
  .grid.is-table .cm.pos b{color:#067647}
  .grid.is-table .cm.neg b{color:#b42318}
  .grid.is-table .cmeta{display:flex;justify-content:flex-end;margin:0;padding:0;border:0;white-space:nowrap}
  .grid.is-table .cdate{font-size:11px}
  .empty{grid-column:1/-1;text-align:center;padding:56px;background:var(--card);border-radius:20px;color:var(--muted);box-shadow:var(--shadow)}
  .empty .hint{font-size:13px;margin-top:6px}
  .empty code{font-family:var(--monoff);background:var(--bg);padding:2px 7px;border-radius:6px}
  .pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:34px}
  .pg{font-family:var(--monoff);font-size:12.5px;min-width:38px;height:38px;padding:0 11px;border:0;background:var(--card);color:var(--ink-2);border-radius:11px;cursor:pointer;box-shadow:var(--shadow);transition:all .14s}
  .pg.on{background:var(--ink);color:#fff;font-weight:600}
  .pg:disabled{opacity:.35;cursor:default}
  .pg:hover:not(:disabled):not(.on){color:var(--ink);transform:translateY(-1px)}
  .pg-gap{display:flex;align-items:flex-end;min-width:20px;height:38px;color:var(--muted);font-size:13px;justify-content:center}
  footer{margin-top:40px;text-align:center;color:var(--muted);font-size:12px;line-height:1.9;font-weight:300}
  footer a{color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--line-2)}
  footer b{font-weight:500;color:var(--ink-2)}
  /* ── มือถือ (spec §5.5: tap ≥44px · แถบกรองเลื่อนแถวเดียว) ── */
  @media(max-width:820px){
    .wrap{padding:16px 15px 60px}
    .hd-in{padding:24px 22px 26px;display:block} h1{font-size:29px} header{border-radius:20px}
    /* mobile: สถิติใต้เส้นคั่นแบบเดิม (เจ้าของ approve แล้ว) — grid 2×2 ตายตัวกันจอกว้างยัด 3 ช่องแถวบนแล้วสหรัฐตกไปอยู่ตัวเดียว */
    .hd-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));justify-items:start;gap:4px 6px;margin-top:18px;padding:14px 0 0;background:none;border:0;border-top:1px solid rgba(255,255,255,.12);border-radius:0}
    .hstat{padding:7px 10px;border-radius:11px}
    .hstat:nth-child(odd){margin-left:-10px}
    .hstat .n{font-size:21px}
    .grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
    .badge{font-size:20px} .ctop{padding:15px 17px 13px} .cbody{padding:13px 17px 14px}
  }
  @media(max-width:760px){
    .sortbar,.marketbar{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;margin-left:-15px;margin-right:-15px;padding-left:15px;padding-right:15px}
    .sortbar::-webkit-scrollbar,.marketbar::-webkit-scrollbar{display:none}
    .sortbtn,.mktbtn,.viewbtn{min-height:44px;flex:none}
    .pg{min-height:44px;min-width:44px}
    /* mobile: search เด้งขึ้นเป็นแถวเต็มความกว้างเหนือ sortbar (แตะง่าย ≥48px) */
    .toolbar{gap:11px}
    .search{order:-1;flex:1 1 100%;max-width:none;margin-left:0}
    .search .sic{left:17px;width:16px;height:16px}
    .search input{min-height:48px;font-size:15.5px;padding-left:44px}
    footer a{display:inline-block;padding:12px 4px}
  }
  @media(max-width:480px){ .grid{grid-template-columns:1fr} h1{font-size:25px} .hd-stats{gap:2px 4px} }
</style>
</head>
<body>
  <div class="wrap">
    <header>${spectrumHtml}<div class="hd-in">
      <div class="hd-left">
        <span class="tag">Stock Analysis</span>
        <h1>รายงานวิเคราะห์หุ้น</h1>
        <div class="sub">Fair Value · Margin of Safety · จุดเข้าซื้อ · ผลตอบแทนคาดการณ์ 3 ปี</div>
      </div>
      ${hdStats}
    </div></header>${(sortBar || searchBox) ? `<div class="toolbar">${sortBar}${searchBox}</div>` : ''}
    <div class="tblhint" id="tblhint" hidden>← เลื่อนตารางไปด้านข้าง เพื่อดูครบทุกคอลัมน์ →</div>
    <div class="grid">
      <div id="thead" aria-hidden="true"><span></span><span>บริษัท</span><span class="num" data-sort="mos">MOS</span><span class="num" data-sort="upside">Upside</span><span class="num" data-sort="pe">P/E</span><span class="num" data-sort="yield">Yield</span><span class="num" data-sort="roe">ROE</span><span class="num" data-sort="updated">อัปเดต</span></div>
${reports.length ? cards : emptyState}
    </div>${noResult}${pagerEl}
    <footer>
      🤖 วิเคราะห์และจัดทำด้วย AI · <b>Claude</b> · Anthropic · ติดต่อ <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br>
      เพื่อการศึกษาและเป็นข้อมูลประกอบเท่านั้น มิใช่คำแนะนำการลงทุน — การลงทุนมีความเสี่ยง โปรดใช้วิจารณญาณ
    </footer>
  </div>${searchScript}
</body>
</html>
`;

fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml, 'utf8');
log(`✅ สร้าง dist/ เสร็จ — ${reports.length} รายงาน + index.html + reports.json`);
