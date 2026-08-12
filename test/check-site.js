#!/usr/bin/env node
'use strict';

/**
 * check-site.js — Quality gate ระดับเว็บไซต์ (รันหลัง `node build.js`)
 *
 * ตรวจสิ่งที่ check-reports.js (ตรวจ source ทีละไฟล์) มองไม่เห็น:
 *   1) ความครบ: ทุก reports/*.html ปรากฏใน dist/, reports.json และมีการ์ดใน index.html
 *   2) Render: <script> ใน dashboard parse ได้ (new Function) + id ที่ JS อ้างมีจริงใน DOM
 *   3) ความปลอดภัย: external resource = Google Fonts (https) เท่านั้น, ห้าม <script src> ภายนอก, ห้าม http://
 *   4) โครงสร้าง: container tag สมดุล, มี <title>/<h1> อย่างละ 1
 *   5) กราฟ/gauge สมเหตุสมผล: จุดสุดท้าย≈ราคา, min/max ครอบข้อมูล, marker อยู่ในช่วง gmin–gmax
 *   6) เครดิตโมเดล AI: ไม่เหลือ "stock-analyzer workflow", มีเครดิต 🤖 …·Anthropic, โมเดลใน footer = meta ai-model
 *
 * ใช้: node test/check-site.js   (npm run verify จะรัน build แล้วตามด้วยตัวนี้)
 * exit 0 = ผ่าน, 1 = มี error → ห้าม publish. ไม่มี dependency ภายนอก
 */

const fs = require('fs');
const path = require('path');
const { firstNum } = require('./check-reports');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const DIST = path.join(ROOT, 'dist');

const stripTags = (h) => String(h).replace(/<[^>]+>/g, ' ');
const grab = (re, h) => { const m = String(h).match(re); return m ? m[1] : null; };
const sym = (f) => f.replace(/\.html$/i, '');

const FONT_ALLOW = /^https:\/\/fonts\.(googleapis|gstatic)\.com(?:\/|$)/; // อนุญาตทั้ง preconnect (origin เปล่า) และ css (มี path)
const CONTAINER_TAGS = ['html', 'head', 'body', 'script', 'style', 'footer', 'svg', 'header', 'section'];

// ---- security + structure (รันกับทุกไฟล์ใน dist รวม index.html) ----
function checkSecurityStructure(html, name, isReport) {
  const errors = [], warnings = [];

  // external resources
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    const url = m[1];
    if (!FONT_ALLOW.test(url)) errors.push(`external resource ไม่อนุญาต: ${url} (อนุญาตเฉพาะ Google Fonts https)`);
  }
  // <script src=…> อนุญาตเฉพาะ bundle TA ของเราเอง (same-origin, ชื่อไฟล์มี hash) — อย่างอื่นถือเป็นความเสี่ยง supply-chain
  const TA_SCRIPT_SRC = /^\/assets\/ta-[0-9a-f]{8}\.js$/;
  for (const m of html.matchAll(/<script[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    if (!TA_SCRIPT_SRC.test(m[1])) errors.push(`พบ <script src="${m[1]}"> ที่ไม่อนุญาต (เสี่ยง supply-chain) — ห้าม`);
  }

  // script parse + referenced ids
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    // ตรวจเฉพาะสคริปต์ JS จริง — data block (เช่น type="application/json" id="stock-meta") ไม่ใช่โค้ด จึงไม่ต้อง parse/ตรวจ id
    const tt = (m[1].match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (tt && !/^(text\/javascript|application\/javascript|module)$/i.test(tt.trim())) continue;
    const body = m[2];
    try { new Function(body); } catch (e) { errors.push(`<script> มี syntax error: ${e.message}`); continue; }
    const ids = new Set();
    for (const g of body.matchAll(/getElementById\(["']([^"']+)["']\)/g)) ids.add(g[1]);
    for (const g of body.matchAll(/querySelector\(["']#([\w-]+)/g)) ids.add(g[1]);
    for (const id of ids) if (!new RegExp(`id\\s*=\\s*["']${id}["']`).test(html)) errors.push(`JS อ้าง #${id} แต่ไม่มี element id นี้ใน DOM`);
  }

  // container tag balance + single title/h1
  for (const t of CONTAINER_TAGS) {
    const open = (html.match(new RegExp(`<${t}(?:\\s|>)`, 'gi')) || []).length;
    const close = (html.match(new RegExp(`</${t}>`, 'gi')) || []).length;
    if (open !== close) errors.push(`<${t}> เปิด/ปิดไม่สมดุล (${open}/${close})`);
  }
  if (isReport) {
    if ((html.match(/<title>/gi) || []).length !== 1) errors.push('ต้องมี <title> เพียง 1');
    if ((html.match(/<h1[\s>]/gi) || []).length !== 1) errors.push('ต้องมี <h1> เพียง 1');
  }
  return { errors, warnings };
}

// ---- เครดิตโมเดล AI ในรายงาน dist (build.js แทน "stock-analyzer workflow" → 🤖 … <model> · Anthropic) ----
// ตรวจ end-to-end ว่า: (1) ไม่เหลือข้อความ workflow เดิม (2) มีเครดิตโมเดล (3) โมเดลใน footer = meta ai-model ของไฟล์นั้น
function checkModelCredit(html, name) {
  const errors = [];
  if (/สร้างด้วย\s*stock-analyzer\s*workflow/i.test(html))
    errors.push('ยังพบ "สร้างด้วย stock-analyzer workflow" ใน dist (build แทนเครดิตโมเดลไม่สำเร็จ)');
  const m = html.match(/🤖[^<]*<b>([^<]+)<\/b>\s*·\s*Anthropic/);
  if (!m) { errors.push('footer ไม่มีเครดิตโมเดล AI (🤖 … · <model> · Anthropic)'); return { errors, warnings: [] }; }
  const footerModel = m[1].trim();
  if (!/^Claude\s/i.test(footerModel)) errors.push(`โมเดลใน footer ควรขึ้นต้น "Claude " — พบ "${footerModel}"`);
  const meta = grab(/<meta\s+name=["']ai-model["']\s+content=["']([^"']+)["']/i, html);
  if (meta && footerModel !== meta.trim())
    errors.push(`โมเดลใน footer "${footerModel}" ≠ meta ai-model "${meta.trim()}" (per-report ไม่ตรงกัน)`);
  return { errors, warnings: [] };
}

// ---- chart/gauge plausibility (เฉพาะไฟล์รายงาน) ----
function checkRender(html, name) {
  const errors = [], warnings = [];
  const px = firstNum(grab(/<div class="px">([\s\S]*?)<\/div>/, html));

  const dataM = html.match(/const data=\[([\s\S]*?)\];/);
  if (dataM) {
    const vals = [...dataM[1].matchAll(/,\s*([0-9.]+)\s*\]/g)].map((m) => parseFloat(m[1]));
    if (vals.length) {
      const last = vals[vals.length - 1];
      if (px != null && Math.abs(px - last) / px > 0.03) warnings.push(`จุดสุดท้ายของกราฟ ${last} ≠ ราคา header ${px} (>3%)`);
      const mn = firstNum(grab(/const min=([0-9.]+)/, html)), mx = firstNum(grab(/max=([0-9.]+)/, html));
      if (mn != null && mn > Math.min(...vals)) warnings.push(`กราฟ min=${mn} สูงกว่าค่าต่ำสุดของข้อมูล ${Math.min(...vals)} (เส้นจะหลุดกรอบ)`);
      if (mx != null && mx < Math.max(...vals)) warnings.push(`กราฟ max=${mx} ต่ำกว่าค่าสูงสุดของข้อมูล ${Math.max(...vals)} (เส้นจะหลุดกรอบ)`);
    }
  }

  const gmin = firstNum(grab(/const gmin=([0-9.]+)/, html)), gmax = firstNum(grab(/gmax=([0-9.]+)/, html));
  const fv = firstNum(grab(/const\s+FV\s*=\s*([0-9.]+)/, html));
  const cur = firstNum(grab(/getElementById\("mCur"\)\.style\.left=gpos\(([0-9.]+)\)/, html));
  const fair = firstNum(grab(/getElementById\("mFair"\)\.style\.left=gpos\(([0-9.]+)\)/, html));
  for (const [lab, v] of [['ราคา', cur != null ? cur : px], ['Fair Value', fair != null ? fair : fv]]) {
    if (v != null && gmin != null && gmax != null && (v <= gmin || v >= gmax)) warnings.push(`marker ${lab} ${v} อยู่นอกช่วง gauge ${gmin}–${gmax} (ถูก clamp ติดขอบ)`);
  }
  return { errors, warnings };
}

// ---- metric บนการ์ดหน้า index = stock-meta ของ report (build ส่งตัวเลขขึ้นการ์ดถูกต้อง, end-to-end) ----
const SM_CARD_MAP = [['mos', 'mos'], ['upside', 'upside'], ['pe', 'pe'], ['yield', 'dividendYield'], ['roe', 'roe']]; // [data-attr บนการ์ด, key ใน stock-meta]
function checkMetricsCards(indexHtml, distDir, distSyms) {
  const errors = [], warnings = [];
  for (const s of distSyms) {
    const blk = fs.readFileSync(path.join(distDir, s + '.html'), 'utf8').match(/<script[^>]*\bid=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!blk) { errors.push(`${s}: dist ไม่มีบล็อก stock-meta`); continue; }
    let data; try { data = JSON.parse(blk[1]); } catch (e) { errors.push(`${s}: stock-meta ใน dist parse ไม่ได้: ${e.message}`); continue; }
    const tagM = indexHtml.match(new RegExp(`<a class="card"[^>]*href="\\./${s}\\.html"[^>]*>`));
    if (!tagM) { errors.push(`${s}: ไม่พบการ์ดในหน้า index`); continue; }
    const tag = tagM[0];
    for (const [attr, jkey] of SM_CARD_MAP) {
      const exp = data[jkey], cardVal = grab(new RegExp(`data-${attr}="([^"]*)"`), tag);
      if (typeof exp === 'number' && isFinite(exp)) {
        if (cardVal == null) errors.push(`${s}: การ์ดขาด data-${attr} (stock-meta มี ${jkey}=${exp})`);
        else if (Math.abs(firstNum(cardVal) - exp) > 1e-9) errors.push(`${s}: การ์ด data-${attr}="${cardVal}" ≠ stock-meta ${jkey}=${exp}`);
      } else if (cardVal != null) {
        errors.push(`${s}: การ์ดมี data-${attr}="${cardVal}" แต่ stock-meta ${jkey} ไม่ใช่ตัวเลข (${JSON.stringify(exp)})`);
      }
    }
    // data-market (TH/US) บนการ์ด = ตลาดที่ derive จาก currency (THB→TH, รหัสอื่น→US) — กรองไทย/สหรัฐหน้า index
    if (typeof data.currency === 'string') {
      const expMkt = data.currency === 'THB' ? 'TH' : (/^[A-Z]{3}$/.test(data.currency) ? 'US' : null);
      const cardMkt = grab(/data-market="([^"]*)"/, tag);
      if (expMkt && cardMkt !== expMkt) errors.push(`${s}: การ์ด data-market="${cardMkt}" ≠ ตลาดจาก currency ${data.currency} (ควรเป็น "${expMkt}")`);
      else if (!expMkt && cardMkt != null) errors.push(`${s}: การ์ดมี data-market="${cardMkt}" แต่ currency ${data.currency} ไม่ map เป็นตลาด`);
    }
  }
  return { errors, warnings };
}

// ---- TA chart bundle + inject (build.js §2.5/§injectTA) ----
//   1) dist/assets/ ต้องมี bundle ta-*.js อยู่ไฟล์เดียว (shared, hashed)
//   2) สุ่มรายงานแบบ template (มีบล็อก report-data) 1 ไฟล์ใน dist → ต้องมี __TA_CFG__ + <script src> ชี้ไฟล์ bundle จริง
//   3) source ใน reports/ ต้องไม่มี __TA_CFG__ เลย (กัน inject รั่วเข้า source — ต้องอยู่แค่ dist)
function checkTaBundle(distDir, reportsDir, srcSyms) {
  const errors = [], warnings = [];

  const assetsDir = path.join(distDir, 'assets');
  let taFiles = [];
  if (!fs.existsSync(assetsDir)) {
    errors.push('dist/assets/ ไม่มี — build wiring ของ TA bundle หาย');
  } else {
    taFiles = fs.readdirSync(assetsDir).filter((f) => /^ta-[0-9a-f]{8}\.js$/.test(f));
    if (taFiles.length !== 1) errors.push(`dist/assets/ ต้องมีไฟล์ ta-*.js เดียว — พบ ${taFiles.length} ไฟล์ (${taFiles.join(', ') || 'ไม่มี'})`);
  }

  if (taFiles.length === 1) {
    const taFile = taFiles[0];
    // สุ่มรายงาน template 1 ไฟล์ (มีบล็อก report-data = ผ่าน expandReport แล้วยังเหลือ marker script เดิม)
    const templateSym = srcSyms.find((s) => {
      const p = path.join(distDir, s + '.html');
      return fs.existsSync(p) && /<script[^>]*\bid=["']report-data["']/i.test(fs.readFileSync(p, 'utf8'));
    });
    if (!templateSym) {
      warnings.push('ไม่พบรายงานแบบ template (report-data) ใน dist เพื่อสุ่มตรวจ __TA_CFG__');
    } else {
      const html = fs.readFileSync(path.join(distDir, templateSym + '.html'), 'utf8');
      if (!/window\.__TA_CFG__\s*=/.test(html)) errors.push(`${templateSym}: dist ไม่มี window.__TA_CFG__ (inject TA พัง)`);
      const srcM = html.match(/<script[^>]*\bdefer\s+src=["']\/assets\/(ta-[0-9a-f]{8}\.js)["'][^>]*>/i);
      if (!srcM) errors.push(`${templateSym}: dist ไม่มี <script defer src="/assets/ta-*.js"> ที่ถูกรูปแบบ`);
      else if (srcM[1] !== taFile) errors.push(`${templateSym}: script src ชี้ ${srcM[1]} แต่ bundle จริงคือ ${taFile} (hash ไม่ตรง)`);
    }
  }

  // source รั่ว: reports/ (ต้นฉบับ) ต้อง content-only เสมอ — ห้ามมี __TA_CFG__ (inject เฉพาะ dist เท่านั้น)
  for (const s of srcSyms) {
    const src = path.join(reportsDir, s + '.html');
    if (fs.existsSync(src) && /__TA_CFG__/.test(fs.readFileSync(src, 'utf8')))
      errors.push(`${s}: reports/ (source) มี __TA_CFG__ หลุดเข้ามา — inject ต้องอยู่แค่ dist/`);
  }

  return { errors, warnings };
}

// ---- หน้า tag (dist/tag/<slug>.html) ----
// ★ ต้องอยู่ในโฟลเดอร์ย่อยเท่านั้น — coverage check ข้างบนมองไฟล์ .html ในราก dist
//   ว่าเป็น "รายงาน" ⇒ วางที่รากจะถูกฟ้องว่าเป็นรายงานค้าง
function checkTagPages(DIST) {
  const r = { errors: [], warnings: [] };
  const T = require('../tools/tag-lib.js');
  let vocab, data;
  try { vocab = T.loadVocab(); data = T.loadTags(); }
  catch (e) { r.errors.push(`อ่านไฟล์ tag ไม่ได้: ${e.message}`); return r; }

  const members = T.membersOf(data);
  // build.js เรนเดอร์การ์ดกรองด้วย bySymbol (เฉพาะ symbol ที่มีรายงานสร้างจริงใน dist/) —
  // เทียบด้วยชุดกรองเดียวกัน กัน false-positive เวลาลบ reports/<SYM>.html (delisting) แล้ว
  // tags.json ยังเหลือ symbol ค้าง (orphan tag data เป็นปัญหาคนละชั้น รอ corpus-level check ในงานถัดไป)
  const liveCount = (s) => members.get(s).filter((sym) => fs.existsSync(path.join(DIST, sym + '.html'))).length;
  const tagDir = path.join(DIST, 'tag');
  // "ควรมีหน้า" = สมาชิกที่มีรายงานจริง ≥1 ตัวเท่านั้น (ตรงกับ tagPageSlugs ใน build.js) —
  // แท็กที่สมาชิกถูกลบรายงานจนเหลือ 0 ไม่ควรมีหน้าเปล่าเข้ามาเลย ไม่ใช่แค่ "การ์ดตรงจำนวน"
  const want = [...members.keys()].filter((s) => vocab.bySlug.has(s) && liveCount(s) > 0).sort();
  const have = fs.existsSync(tagDir)
    ? fs.readdirSync(tagDir).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '')).sort()
    : [];

  for (const s of want) if (!have.includes(s)) r.errors.push(`ไม่มีหน้า dist/tag/${s}.html (มีสมาชิกที่มีรายงานจริง ${liveCount(s)} ตัว)`);
  for (const s of have) {
    if (!members.has(s)) { r.errors.push(`dist/tag/${s}.html ไม่มีสมาชิกเลย (หน้าเปล่าไม่ควรเข้า sitemap)`); continue; }
    const live = liveCount(s);
    // สมาชิกถูกลบรายงานจนเหลือ 0 = ห้ามมีหน้านี้เลย (Finding 1) — ต่างจาก "cards !== live" ข้างล่าง
    // ที่ยังไม่ได้เช็คว่ามีการ์ดเลย ⇒ ต้องกันไว้ก่อนแยกต่างหาก ไม่งั้น 0 การ์ด/0 สมาชิกจะเงียบผ่านเป็น "ตรงกัน"
    if (live === 0) { r.errors.push(`dist/tag/${s}.html มีสมาชิกใน tags.json แต่ไม่มีสักตัวที่มีรายงานจริง (หน้าเปล่าไม่ควรมีอยู่)`); continue; }
    const html = fs.readFileSync(path.join(tagDir, s + '.html'), 'utf8');
    const cards = (html.match(/class="card"/g) || []).length;
    if (cards !== live) r.errors.push(`tag/${s}: การ์ด ${cards} ใบ แต่มีสมาชิกที่มีรายงานจริง ${live} ตัว`);
    if ((html.match(/<h1[^>]*>/gi) || []).length !== 1) r.errors.push(`tag/${s}: ต้องมี <h1> เดียว`);
    if (!/<title>[^<]+<\/title>/i.test(html)) r.errors.push(`tag/${s}: ไม่มี <title>`);
  }

  // ลิงก์ tag ทุกเส้นใน dist ต้องไม่ตาย — **รวม index.html ด้วย** เพราะ Step 5 วางลิงก์
  // /tag/<slug> ~11 เส้นไว้บนหน้าแรก (แถวแท็กยอดนิยม) ถ้ากรอง index.html ออกจะไม่มีอะไรคุมมัน
  for (const f of fs.readdirSync(DIST).filter((f) => /\.html$/i.test(f))) {
    const html = fs.readFileSync(path.join(DIST, f), 'utf8');
    for (const m of html.matchAll(/href="\/tag\/([a-z0-9-]+)"/g)) {
      if (!have.includes(m[1])) r.errors.push(`${f}: ลิงก์ /tag/${m[1]} ไม่มีหน้าปลายทาง`);
    }
  }
  return r;
}

function main() {
  if (!fs.existsSync(DIST)) { console.error('❌ ไม่พบ dist/ — รัน `node build.js` ก่อน'); process.exit(1); }

  const out = [];
  let totErr = 0, totWarn = 0;
  const add = (name, r) => { totErr += r.errors.length; totWarn += r.warnings.length; if (r.errors.length || r.warnings.length) out.push({ name, ...r }); };

  // 1) coverage: source ↔ dist ↔ manifest ↔ index
  const cov = { errors: [], warnings: [] };
  const srcSyms = fs.readdirSync(REPORTS_DIR).filter((f) => /\.html$/i.test(f)).map(sym);
  const distSyms = fs.readdirSync(DIST).filter((f) => /\.html$/i.test(f) && f.toLowerCase() !== 'index.html').map(sym);

  // ชื่อไฟล์ต้องพิมพ์ใหญ่ + ไม่ซ้ำ (case-insensitive)
  const seen = new Map();
  for (const s of srcSyms) {
    if (s !== s.toUpperCase()) cov.errors.push(`ชื่อไฟล์ต้องพิมพ์ใหญ่: reports/${s}.html`);
    const k = s.toUpperCase();
    if (seen.has(k)) cov.errors.push(`symbol ซ้ำ (ไม่สนตัวพิมพ์): ${seen.get(k)} / ${s}`);
    else seen.set(k, s);
  }

  let manSyms = [];
  try {
    const man = JSON.parse(fs.readFileSync(path.join(DIST, 'reports.json'), 'utf8'));
    manSyms = man.map((r) => r.symbol);
    for (const r of man) if (!r.symbol || !r.file || !r.title || !r.url) cov.errors.push(`reports.json: entry ขาดฟิลด์ (${r.symbol || '?'})`);
  } catch (e) { cov.errors.push(`อ่าน/parse dist/reports.json ไม่ได้: ${e.message}`); }

  const indexHtml = fs.existsSync(path.join(DIST, 'index.html')) ? fs.readFileSync(path.join(DIST, 'index.html'), 'utf8') : '';
  const A = new Set(srcSyms), B = new Set(distSyms), C = new Set(manSyms);
  for (const s of srcSyms) {
    if (!B.has(s)) cov.errors.push(`${s}: มีใน reports/ แต่ไม่มีใน dist/ (build ไม่ครบ?)`);
    if (!C.has(s)) cov.errors.push(`${s}: ไม่อยู่ใน reports.json`);
    if (indexHtml && !new RegExp(`href="\\./${s}\\.html"`).test(indexHtml)) cov.errors.push(`${s}: ไม่มีการ์ดใน index.html`);
  }
  for (const s of distSyms) if (!A.has(s)) cov.errors.push(`${s}: อยู่ใน dist/ แต่ไม่มีต้นฉบับใน reports/ (ไฟล์ค้าง)`);
  add('site (coverage)', cov);

  // 1.4) TA chart bundle: dist มี bundle เดียว + inject ถูกไฟล์ + ไม่รั่วเข้า source
  add('site (ta chart)', checkTaBundle(DIST, REPORTS_DIR, srcSyms));

  add('site (tag pages)', checkTagPages(DIST));

  // 1.5) metric บนการ์ด index = stock-meta ของ report (build wiring ถูกต้อง)
  if (indexHtml) add('site (metric cards)', checkMetricsCards(indexHtml, DIST, distSyms));

  // 2) ต่อไฟล์ใน dist
  for (const f of fs.readdirSync(DIST).filter((f) => /\.html$/i.test(f)).sort()) {
    const html = fs.readFileSync(path.join(DIST, f), 'utf8');
    const isIndex = f.toLowerCase() === 'index.html';
    const isReport = !isIndex;
    const ss = checkSecurityStructure(html, f, isReport);
    let rr = { errors: [], warnings: [] };
    if (isReport) {
      rr = checkRender(html, f);
      const h1 = stripTags(grab(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html) || '').trim();
      if (!h1) ss.errors.push('h1 (ชื่อบริษัท) ว่างเปล่า');
      const mc = checkModelCredit(html, f);
      ss.errors.push(...mc.errors);
    }
    add(f, { errors: [...ss.errors, ...rr.errors], warnings: [...ss.warnings, ...rr.warnings] });
  }

  // ---- report ----
  console.log(`\n🌐 ตรวจความสมบูรณ์เว็บไซต์ (dist/) — ${srcSyms.length} รายงาน\n`);
  if (!out.length) console.log('✓ ทุกอย่างผ่าน (coverage + render + security + structure)');
  for (const o of out) {
    console.log(`${o.errors.length ? '✗' : '⚠'} ${o.name}`);
    for (const e of o.errors) console.log(`    ✗ ${e}`);
    for (const w of o.warnings) console.log(`    ⚠ ${w}`);
  }
  console.log('\n' + '─'.repeat(50));
  console.log(`สรุป: error ${totErr} • warning ${totWarn}`);
  if (totErr) { console.log('\n❌ เว็บไซต์มีปัญหา — ห้าม publish\n'); process.exit(1); }
  console.log(`\n✅ เว็บไซต์ผ่าน${totWarn ? ` (มี ${totWarn} warning)` : ''}\n`); process.exit(0);
}

if (require.main === module) main();
module.exports = { checkSecurityStructure, checkRender, checkModelCredit, checkMetricsCards, checkTaBundle, checkTagPages };
