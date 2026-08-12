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
// โดเมนของเว็บเอง (mirror ค่า SITE_ORIGIN ใน build.js — อย่า require('../build.js') มาดึงตรง ๆ เพราะไฟล์นั้นรัน build ทั้งก้อนทันทีที่ import)
// หน้า tag ใช้ absolute URL ใน <link rel="canonical"> (index/รายงานใช้ relative "/" หรือ "/SYM") ต้องอนุญาตไว้ ไม่งั้น external-resource check จะฟ้องผิด
const SITE_ALLOW = /^https:\/\/gaohoon\.com(?:\/|$)/;
const CONTAINER_TAGS = ['html', 'head', 'body', 'script', 'style', 'footer', 'svg', 'header', 'section'];

// ---- รายชื่อไฟล์ .html ทั้งหมดใน dist/ ระดับราก + dist/tag/ (ใช้เฉพาะสแกนที่ต้องมองทั้งเว็บ เช่น dead-link/security/structure) ----
// ★ ไม่ใช่ตัวเดียวกับ coverage check (main ข้อ 1) ซึ่งต้องมองเฉพาะไฟล์ระดับรากเป็น "รายงาน" เท่านั้น —
//   ห้ามเอาไปแทนที่ fs.readdirSync(DIST) ตรงนั้น ไม่งั้นหน้า tag จะถูกนับเป็นรายงานค้าง (คนละชั้นกับ scan นี้)
function listDistHtmlFiles(distDir) {
  const root = fs.readdirSync(distDir).filter((f) => /\.html$/i.test(f)).map((f) => ({ rel: f, abs: path.join(distDir, f) }));
  const tagDir = path.join(distDir, 'tag');
  const tag = fs.existsSync(tagDir)
    ? fs.readdirSync(tagDir).filter((f) => /\.html$/i.test(f)).map((f) => ({ rel: 'tag/' + f, abs: path.join(tagDir, f) }))
    : [];
  return [...root, ...tag];
}

// ---- security + structure (รันกับทุกไฟล์ใน dist รวม index.html) ----
function checkSecurityStructure(html, name, isReport) {
  const errors = [], warnings = [];

  // external resources
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    const url = m[1];
    if (!FONT_ALLOW.test(url) && !SITE_ALLOW.test(url)) errors.push(`external resource ไม่อนุญาต: ${url} (อนุญาตเฉพาะ Google Fonts https และโดเมนตัวเอง)`);
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
  // ชื่อไฟล์จริงที่ราก dist/ — เทียบด้วย Set ตรง ๆ ไม่ใช้ fs.existsSync (macOS ไม่สนตัวพิมพ์เล็ก-ใหญ่
  // ของชื่อไฟล์ ⇒ existsSync('abc.html') จะเจอไฟล์ 'ABC.html' ด้วย ทำให้ symbol พิมพ์ผิดตัวพิมพ์หลุดผ่าน
  // ในเครื่อง mac ทั้งที่ 404 จริงบน prod — hoist ขึ้นมาก่อน liveCount ให้ใช้ Set เดียวกันทั้งฟังก์ชัน)
  const rootFiles = new Set(fs.readdirSync(DIST).filter((f) => /\.html$/i.test(f)));
  // build.js เรนเดอร์การ์ดกรองด้วย bySymbol (เฉพาะ symbol ที่มีรายงานสร้างจริงใน dist/) —
  // เทียบด้วยชุดกรองเดียวกัน กัน false-positive เวลาลบ reports/<SYM>.html (delisting) แล้ว
  // tags.json ยังเหลือ symbol ค้าง (orphan tag data เป็นปัญหาคนละชั้น รอ corpus-level check ในงานถัดไป)
  const liveCount = (s) => members.get(s).filter((sym) => rootFiles.has(sym + '.html')).length;
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

  // ลิงก์ที่เกี่ยวกับหน้า tag ต้องไม่ตาย — สแกนทุกไฟล์ .html ใน dist **รวม dist/tag/ เอง**
  // (ของเดิมสแกนแค่ dist/*.html ระดับราก = index.html + 908 รายงาน เพราะ Step 5 วางลิงก์ /tag/<slug>
  //  ไว้บนหน้าแรกด้วย — แต่ไม่เคยเปิดไฟล์ dist/tag/*.html มาอ่านเลย ⇒ ลิงก์ที่อยู่ *ภายใน* หน้า tag เอง
  //  (related nav ท้ายหน้า, breadcrumb, การ์ดแต่ละใบที่ชี้กลับไปหารายงาน) ไม่เคยถูกตรวจ)
  // ตรวจ 2 รูปแบบ: (1) href="/tag/<slug>" ต้องมีหน้า dist/tag/<slug>.html จริง
  //                (2) href="/<SYM>.html" (การ์ดในหน้า tag ถูกแปลงเป็น absolute path ตอน build — ดู build.js "href="\.\/"→"/"")
  //                    ต้องมีไฟล์รายงานจริงที่ราก dist/ — เทียบด้วย Set ชื่อไฟล์ตรง ๆ ไม่ใช้ fs.existsSync
  //                    (macOS ไม่สนตัวพิมพ์เล็ก-ใหญ่ของชื่อไฟล์ ⇒ ลิงก์ผิดตัวพิมพ์จะหลุดผ่านในเครื่อง แต่ 404 จริงบน prod)
  //                    — rootFiles ประกาศไว้ต้นฟังก์ชันแล้ว (liveCount ใช้ตัวเดียวกัน) ไม่ต้องสร้างซ้ำ
  for (const file of listDistHtmlFiles(DIST)) {
    const html = fs.readFileSync(file.abs, 'utf8');
    for (const m of html.matchAll(/href="\/tag\/([a-z0-9-]+)"/g)) {
      if (!have.includes(m[1])) r.errors.push(`${file.rel}: ลิงก์ /tag/${m[1]} ไม่มีหน้าปลายทาง`);
    }
    for (const m of html.matchAll(/href="\/([A-Za-z][\w.-]*)\.html"/g)) {
      if (!rootFiles.has(m[1] + '.html')) r.errors.push(`${file.rel}: ลิงก์การ์ด /${m[1]}.html ไม่มีรายงานปลายทางที่ราก dist/`);
    }
  }

  // ---- SEO: canonical ชี้ URL ตัวเองถูกต้อง + og:title มี + ทุกหน้าอยู่ใน sitemap.xml (ไม่ซ้ำ) ----
  // (spec §11.5 ข้อ 42–45 — Task 6 ใส่ canonical/og/sitemap ไว้ใน build.js แล้ว เทสนี้แค่ยืนยันไม่ให้หลุดย้อนหลัง)
  const sitemap = fs.existsSync(path.join(DIST, 'sitemap.xml')) ? fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8') : '';
  const inMap = new Set([...sitemap.matchAll(/<loc>[^<]*\/tag\/([a-z0-9-]+)<\/loc>/g)].map((m) => m[1]));
  for (const s of have) {
    const html = fs.readFileSync(path.join(tagDir, s + '.html'), 'utf8');
    if (!new RegExp(`<link rel="canonical" href="https://[^"]+/tag/${s}">`).test(html)) r.errors.push(`tag/${s}: canonical ไม่ถูกต้อง`);
    if (!/property="og:title"/.test(html)) r.errors.push(`tag/${s}: ไม่มี og:title`);
    if (!inMap.has(s)) r.errors.push(`tag/${s}: ไม่อยู่ใน sitemap.xml`);
  }
  const dupMap = [...sitemap.matchAll(/<loc>[^<]*\/tag\/([a-z0-9-]+)<\/loc>/g)].map((m) => m[1]);
  if (dupMap.length !== new Set(dupMap).size) r.errors.push('sitemap.xml: URL หน้า tag ซ้ำ');

  // ★ ไฟล์ tag ต้องไม่หลุดมาที่รากของ dist — coverage check (main ข้อ 1) มองไฟล์ .html ระดับราก dist ทุกใบ
  // ว่าเป็น "รายงาน" เทียบกับ reports/*.html ⇒ ถ้าวันหนึ่งหน้า tag ถูกเขียนผิดที่ไปอยู่ราก dist/ แทน dist/tag/
  // coverage check จะฟ้อง "อยู่ใน dist/ แต่ไม่มีต้นฉบับใน reports/ (ไฟล์ค้าง)" ซึ่งอ่านไม่ออกว่าต้นเหตุคือหน้า tag
  // หลุด — เทียบจำนวนตรงนี้ให้ชี้ต้นเหตุตรงจุดแทน
  const rootHtml = fs.readdirSync(DIST).filter((f) => /\.html$/i.test(f) && f.toLowerCase() !== 'index.html').length;
  const srcCount = fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => /\.html$/i.test(f)).length;
  if (rootHtml !== srcCount) r.errors.push(`ไฟล์ .html ในราก dist มี ${rootHtml} ไม่เท่ากับรายงาน ${srcCount} — มีไฟล์หลุดมาที่ราก?`);

  return r;
}

// ---- กันกฎ CSS ของหน้า tag รั่วไปโดนหน้าแรก ----
// หน้าแรกกับหน้า tag ใช้สไตล์ชีตก้อนเดียวกัน (INDEX_STYLE) — คลาสส่วนใหญ่ที่ใช้ร่วมกัน (card/badge/grid/ctop/...)
// ตั้งใจแชร์กฎเดียวกันจริง ๆ เพราะเป็นการ์ด HTML ก้อนเดียวกัน (generate ครั้งเดียวใน build.js แล้วเอาไปแปะซ้ำ
// ทั้งสองหน้า) ไม่ใช่บั๊ก — สิ่งที่เคยพังจริงคือ `lead`: หน้า tag เพิ่ม `<p class="lead">` (ย่อหน้านำใต้ h1)
// ซึ่งเป็น "รูปแบบการใช้งานใหม่" ที่หน้าแรกไม่เคยมี (หน้าแรกมีแค่ `<div class="hl hl-* lead">` = ป้ายจุดเด่น
// ในการ์ด "มงกุฎสูงสุดในกลุ่ม") กฎ `.lead{}` แบบไม่ scope เลยรั่วไปทาสีตัวหนังสือเกือบขาวลงชิปพื้นพาสเทลเล็ก ๆ
// (ผิด WCAG AA) + เปลี่ยนขนาด/น้ำหนักฟอนต์/margin/max-width — เคยเกิดขึ้นจริงและ markup diff จับไม่ได้
// (HTML หน้าแรกไม่เปลี่ยน เปลี่ยนแค่การเรนเดอร์)
//
// เดิมกันด้วยรายชื่อคลาสจดมือ (`['lead']`) แต่ไม่มีอะไรบังคับให้จดเพิ่ม — หน้า tag มีคลาสใหม่อีก 3 ตัว
// (`crumb`/`related`/`js-only`) ที่ประกาศเป็น bare selector ในสไตล์ชีตเดียวกัน ปลอดภัยแค่เพราะหน้าแรก
// บังเอิญไม่ใช้ชื่อชนกัน ⇒ วันที่หน้าแรกมี element ชื่อ crumb/related ขึ้นมา บั๊กแบบ `lead` จะเกิดซ้ำทันที
// โดย regression check ตัวนี้ไม่รู้ตัว ⇒ เปลี่ยนมา **derive อัตโนมัติ** จาก "รูปแบบการใช้งาน" (tag+เซ็ตคลาส)
// ของ element แต่ละตัวที่ถือคลาสนั้นแทน: ถ้าหน้า tag มีรูปแบบการใช้งานที่หน้าแรกไม่เคยมี = คลาสนี้เข้าข่าย
// ชนกันแบบ `lead` จริง (การ์ดที่มาจากฟังก์ชัน generate เดียวกันจะมีรูปแบบตรงกันเป๊ะทั้งสองฝั่งเสมอ ⇒ ไม่ติด)
function elementSignatures(html) {
  const map = new Map(); // ชื่อคลาส → Set ของลายเซ็นการใช้งาน "tagName|class1,class2,..." (เรียงคลาสแล้ว)
  for (const m of html.matchAll(/<(\w+)\b[^>]*\bclass="([^"]*)"[^>]*>/g)) {
    const tagName = m[1].toLowerCase();
    const classes = m[2].trim().split(/\s+/).filter(Boolean);
    if (!classes.length) continue;
    const sig = tagName + '|' + classes.slice().sort().join(',');
    for (const c of classes) {
      if (!map.has(c)) map.set(c, new Set());
      map.get(c).add(sig);
    }
  }
  return map;
}
// คลาสที่เคยพังจริงมาแล้ว (regression pin, ไม่ใช่รายการที่ต้องคอยเพิ่มมือ) — ต้องถูกตรวจต่อไปเสมอไม่มีเงื่อนไข
// ต่อให้วันหนึ่ง derive ด้วยรูปแบบการใช้งานข้างบนหาไม่เจอ (เช่น หน้า tag ปรับ markup จนรูปแบบไปตรงกับหน้าแรก
// พอดี) ก็ยังต้องกัน `.lead` แบบไม่ scope อยู่ดี เพราะแค่หน้าแรกใช้ `.lead` เป็นตัวปรับสีบนชิปอยู่แล้วก็เสี่ยงพอ
const SHARED_CLASS_PIN = ['lead'];
function checkSharedCssScope(DIST) {
  const r = { errors: [], warnings: [] };
  const idx = path.join(DIST, 'index.html');
  if (!fs.existsSync(idx)) return r;
  const homeHtml = fs.readFileSync(idx, 'utf8');
  const tagDir = path.join(DIST, 'tag');
  const tagHtmls = fs.existsSync(tagDir)
    ? fs.readdirSync(tagDir).filter((f) => /\.html$/i.test(f)).map((f) => fs.readFileSync(path.join(tagDir, f), 'utf8'))
    : [];

  const homeSig = elementSignatures(homeHtml);
  const tagSig = new Map();
  for (const html of tagHtmls) {
    for (const [cls, sigs] of elementSignatures(html)) {
      if (!tagSig.has(cls)) tagSig.set(cls, new Set());
      for (const s of sigs) tagSig.get(cls).add(s);
    }
  }

  // คลาสเสี่ยง = คลาสที่ใช้ร่วมกันทั้งสองฝั่ง แล้วหน้า tag มีลายเซ็น (tag+เซ็ตคลาส) ที่หน้าแรกไม่เคยมี
  const risky = new Set(SHARED_CLASS_PIN);
  for (const [cls, sigs] of tagSig) {
    if (!homeSig.has(cls)) continue; // ไม่ได้ใช้ร่วมกัน ไม่เข้าข่ายชนกัน
    const homeSigs = homeSig.get(cls);
    if ([...sigs].some((s) => !homeSigs.has(s))) risky.add(cls);
  }

  const css = [...homeHtml.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const countUsage = (html, cls) => (html.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'g')) || []).length;
  for (const cls of [...risky].sort()) {
    // selector `.cls` ที่ตัวนำหน้าไม่ใช่ตัวสะกดคลาส/ไอดี/`>`/`+` = ไม่ถูก scope — เดิม regex ดักได้แค่
    // `.cls,`/`.cls{` เท่านั้น พลาด `.cls:hover{}`/`.cls.other{}`/`.cls>x{}`/`.cls x{}` (ก็ยังนับเป็น "ไม่ scope"
    // เหมือนกันเพราะไม่มี ancestor นำหน้า) ⇒ เช็คแค่ว่า .cls เป็นตัวแรกของ selector พอ ไม่สนใจว่าต่อท้ายด้วยอะไร
    // (กัน false-positive กับชื่อคลาสที่ยาวกว่า เช่น .leader ด้วย negative lookahead ท้าย)
    const unscopedRe = new RegExp(`(^|[,{}\\n])\\s*\\.${escRe(cls)}(?![\\w-])`, 'g');
    const unscoped = [...css.matchAll(unscopedRe)].length;
    if (!unscoped) continue;
    const homeUsed = countUsage(homeHtml, cls);
    if (!homeUsed) continue; // หน้าแรกไม่ได้ใช้คลาสนี้เลย ไม่มีอะไรให้รั่วไปโดน
    const tagUsed = tagHtmls.reduce((n, h) => n + countUsage(h, cls), 0);
    r.errors.push(`CSS: กฎ .${cls} ไม่ถูก scope (${unscoped} จุด) — หน้าแรกใช้คลาสนี้ ${homeUsed} element, หน้า tag ใช้ ${tagUsed} element (คนละรูปแบบ/บริบทกัน) — กฎจะรั่วข้ามหน้า ให้ scope ใต้ ancestor (เช่น .hd หรือคลาสห่อของฝั่งที่เพิ่มมาใหม่)`);
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
  add('site (shared css scope)', checkSharedCssScope(DIST));

  // 1.5) metric บนการ์ด index = stock-meta ของ report (build wiring ถูกต้อง)
  if (indexHtml) add('site (metric cards)', checkMetricsCards(indexHtml, DIST, distSyms));

  // 2) ต่อไฟล์ใน dist — รวมหน้า tag/ ด้วย (เดิมสแกนแค่ราก dist/ ⇒ หน้า tag ไม่เคยผ่าน security/structure check เลย)
  // หน้า tag ไม่ใช่รายงาน (ไม่มี stock-meta/เครดิตโมเดล AI/กราฟ-gauge) ⇒ ให้ isReport=false เหมือน index.html —
  // รันแค่ checkSecurityStructure ส่วนที่ universal จริง (external resource/script src ที่อนุญาต/script parse+DOM id/สมดุล tag)
  // ข้าม check เฉพาะรายงาน (title/h1 นับ 1, h1 ไม่ว่าง, checkRender ราคา-กราฟ-gauge, checkModelCredit) —
  // เรื่อง h1/title เดี่ยวของหน้า tag ถูกตรวจแยกอยู่แล้วใน checkTagPages ข้างบน
  for (const file of listDistHtmlFiles(DIST).sort((a, b) => a.rel.localeCompare(b.rel))) {
    const html = fs.readFileSync(file.abs, 'utf8');
    const isIndex = file.rel.toLowerCase() === 'index.html';
    const isTag = file.rel.toLowerCase().startsWith('tag/');
    const isReport = !isIndex && !isTag;
    const ss = checkSecurityStructure(html, file.rel, isReport);
    let rr = { errors: [], warnings: [] };
    if (isReport) {
      rr = checkRender(html, file.rel);
      const h1 = stripTags(grab(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html) || '').trim();
      if (!h1) ss.errors.push('h1 (ชื่อบริษัท) ว่างเปล่า');
      const mc = checkModelCredit(html, file.rel);
      ss.errors.push(...mc.errors);
    }
    add(file.rel, { errors: [...ss.errors, ...rr.errors], warnings: [...ss.warnings, ...rr.warnings] });
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
