'use strict';
/**
 * report-source.js — "ไฟล์ไหนคือรายงาน" จุดเดียว (spec §6.5 · Plan 2b · open-item #49)
 *   ใบ v2 = reports/<SYM>.html · ใบ v3 = reports/<SYM>.json · หุ้นเดียวห้ามมีทั้งสอง (กติกาเดียวกับ build.reportEntries)
 *   scanner ทุกตัวอ่านผ่านที่นี่ — ห้ามก๊อป readdirSync(...).filter(/\.html$/) ใหม่ (เดิมก๊อปไว้ ~20 จุด)
 * ★ require build.js แบบ lazy (ใน list/renderedHtml): tools/update-prices.js และ tools/dead-ticker-canary.js require ไฟล์นี้
 *   และ build.js โหลด v3 compute/render ทั้งชุด — โหลดเฉพาะตอนต้องใช้
 * ★ metaLite = ค่าเบา (ไม่ compute/render) · stockMeta = กระจกเต็ม (v3 ต้อง compute) · renderedHtml = หน้าแบบที่ build expand
 */
const fs = require('fs');
const path = require('path');
const RM = require('./report-meta.js');
const { footerDate } = require('./queue/footer-date.js');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const B = () => require('../build.js');
let seedsCache = null;
const defaultSeeds = () => seedsCache || (seedsCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8')));

const isV3Path = (p) => /\.json$/i.test(String(p));
/** symbol → ตัวพิมพ์ใหญ่ครั้งเดียวที่นี่ — macOS ไม่สนตัวพิมพ์ แต่ Linux (CI) สน ⇒ ต้องได้ผลเดียวกันทั้งสองเครื่อง */
const norm = (s) => String(s).trim().toUpperCase();

/** [{ symbol, name, v3 }] เรียงตามชื่อไฟล์ — ผ่าน build.reportEntries (throw เมื่อหุ้นเดียวมีทั้ง .html และ .json) */
function list(dir) {
  return B().reportEntries(dir || REPORTS_DIR).slice().sort()
    .map((name) => ({ symbol: name.replace(/\.(html|json)$/i, ''), name, v3: isV3Path(name) }));
}
/** Set ของ symbol ตัวพิมพ์ใหญ่ทั้งสองแบบ — reportExists ของ cron/canary (flag ของใบ v3 ต้องไม่ถูกตัดทิ้ง) */
const symbols = (dir) => new Set(list(dir).map((e) => e.symbol.toUpperCase()));
/** 'v2' | 'v3' | null · มีทั้งสองไฟล์ = throw ข้อความเดียวกับ build */
function kindOf(sym, dir) {
  sym = norm(sym);
  const d = dir || REPORTS_DIR;
  const h = fs.existsSync(path.join(d, sym + '.html')), j = fs.existsSync(path.join(d, sym + '.json'));
  if (h && j) throw new Error(`reports/: ${sym} มีทั้ง .html และ .json (ลบไฟล์ v2 ออกเมื่อย้ายเป็น v3)`);
  return j ? 'v3' : h ? 'v2' : null;
}
const exists = (sym, dir) => kindOf(sym, dir) !== null;
/** null | { symbol, v3:false, name, raw } | { symbol, v3:true, name, doc } — JSON เสีย = throw พร้อมชื่อไฟล์ */
function load(sym, dir) {
  sym = norm(sym);
  const d = dir || REPORTS_DIR, k = kindOf(sym, d);
  if (!k) return null;
  const name = sym + (k === 'v3' ? '.json' : '.html');
  const raw = fs.readFileSync(path.join(d, name), 'utf8');
  if (k === 'v2') return { symbol: sym, v3: false, name, raw };
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { throw new Error(`reports/${name}: JSON เสีย — ${e.message}`); }
  // ข้อความเดียวกับ build.loadReportSource ⇒ load/metaLite/stockMeta/renderedHtml ตอบตรงกันเสมอ
  if (doc.symbol !== sym) throw new Error(`${name}: symbol "${doc.symbol}" ไม่ตรงชื่อไฟล์`);
  return { symbol: sym, v3: true, name, doc };
}
/** ค่าเบาที่ scanner ใช้ — v2: stock-meta + footer "ข้อมูล ณ" + <meta ai-model> · v3: JSON ตรง (meta.analysisDate/dateEra/market.px) */
function metaLite(sym, dir) {
  sym = norm(sym);
  const s = load(sym, dir);
  if (!s) return null;
  if (s.v3) {
    const doc = s.doc, meta = doc.meta || {}, mk = doc.market || {};
    return { symbol: sym, v3: true, currency: doc.currency || null, px: Number.isFinite(mk.px) ? mk.px : null,
      analysisDate: meta.analysisDate || null, era: doc.dateEra || null, aiModel: meta.aiModel || null };
  }
  const sm = RM.readStockMeta(s.raw), fd = footerDate(s.raw);
  return { symbol: sym, v3: false, currency: sm ? sm.currency || null : null, px: sm && Number.isFinite(sm.price) ? sm.price : null,
    analysisDate: fd ? fd.iso : null, era: fd ? fd.era : null, aiModel: RM.readAiModel(s.raw) };
}
/** กระจก stock-meta — v2 อ่านบล็อกในไฟล์ · v3 = compute().sm (ค่าเดียวกับที่ build ฝังลงหน้า) */
function stockMeta(sym, dir, seeds) {
  const s = load(sym, dir);
  if (!s) return null;
  if (!s.v3) return RM.readStockMeta(s.raw);
  return require('./v3/compute.js').compute(s.doc, { seeds: seeds || defaultSeeds() }).sm;
}
/** หน้าที่ expand แล้ว (ก่อน decorate/TA ของ dist) — ทางเดียวกับ build: loadReportSource → expandReport */
function renderedHtml(sym, dir, seeds) {
  sym = norm(sym);
  const d = dir || REPORTS_DIR, k = kindOf(sym, d);
  if (!k) throw new Error(`ไม่มี reports/${sym}.html หรือ reports/${sym}.json`);
  const b = B();
  return b.expandReport(b.loadReportSource(d, sym + (k === 'v3' ? '.json' : '.html'), seeds || defaultSeeds()).content);
}

module.exports = { list, symbols, kindOf, exists, load, metaLite, stockMeta, renderedHtml, isV3Path, REPORTS_DIR };
