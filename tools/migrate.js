#!/usr/bin/env node
'use strict';
/**
 * migrate.js — แปลงรายงานแบบเก่า (HTML เต็ม) → content-only (template system)
 *   สกัด theme(สี) + chart + gauge + currency + highlight จาก <style>/<script> เดิม → report-data
 *   แทน <style>+font links ด้วย <!--TEMPLATE:STYLE--> และ engine ด้วย <!--TEMPLATE:ENGINE-->
 *   body (8 section) คงไว้ verbatim
 *
 * ★ round-trip verify: expandReport(ไฟล์ใหม่) ต้องให้ค่าที่ render (FV/gpos/chart/gauge/currency/highlight)
 *   ตรงกับไฟล์เก่าเป๊ะ — ไม่ตรง = ไม่เขียน (ป้องกัน extraction พลาด)
 *
 * ใช้: node tools/migrate.js SYM [SYM2 …]      (--write = เขียนจริง, default = dry-run + verify)
 */
const fs = require('fs');
const path = require('path');
const { expandReport } = require('../build.js');

const REPORTS = path.join(__dirname, '..', 'reports');
const grab = (re, h) => { const m = String(h).match(re); return m ? m[1] : null; };
const numAt = (re, h) => { const v = grab(re, h); return v == null ? null : parseFloat(v); };

// engine = <script> IIFE (ไม่ใช่ application/json)
function getEngine(h) { return grab(/<script>\s*(\(function\(\)\{[\s\S]*?\}\)\(\);)\s*<\/script>/i, h); }

function extract(h) {
  const eng = getEngine(h) || '';
  // ── theme (จาก CSS) ──
  const theme = {
    accent: grab(/--blue:\s*(#[0-9a-fA-F]{3,6})/, h),
    accentDark: grab(/--blue-d:\s*(#[0-9a-fA-F]{3,6})/, h),
    darkGrad: grab(/header\{background:(linear-gradient\([^)]+\))/, h),
    glow: grab(/header::after\{[^}]*radial-gradient\(circle,\s*(rgba\([^)]+\)|#[0-9a-fA-F]{3,6})/, h),
    subColor: grab(/\.sub\{color:\s*(#[0-9a-fA-F]{3,6})/, h),
    headerMuted: grab(/\.px small\{[^}]*color:\s*(#[0-9a-fA-F]{3,6})/, h),
    chgBg: grab(/\.chg\{[^}]*background:\s*([^;]+);color:/, h),
    chgColor: grab(/\.chg\{[^}]*background:[^;]+;color:\s*(var\(--[\w-]+\)|#[0-9a-fA-F]{3,6})/, h),
    badge: grab(/\.s-head \.n\{[^}]*background:\s*(var\(--[\w-]+\)|#[0-9a-fA-F]{3,6})/, h),  // สีเลขหัวข้อ section (แบรนด์)
    verdictText: grab(/\.verdict p\{color:\s*(#[0-9a-fA-F]{3,6})/, h),                       // สีข้อความในกล่องสรุป (ทินต์ตามแบรนด์)
    vcellLabel: grab(/\.vcell \.k\{[^}]*color:\s*(#[0-9a-fA-F]{3,6})/, h),                    // สี label ในการ์ดสรุป
  };
  // ── chart (จาก engine) ──
  let data = null; const dm = eng.match(/const data=(\[\[[\s\S]*?\]\]);/); if (dm) data = JSON.parse(dm[1]);
  const gridRaw = grab(/\[([0-9.,\s]+)\]\.forEach\(v=>\{const y=ys\(v\)/, eng);
  const grid = gridRaw ? gridRaw.split(',').map((s) => parseFloat(s.trim())) : null;
  const curSym = grab(/>([฿$€£])\$\{v/, eng) || '$';  // ทน ${v} และ ${v.toFixed(n)}
  const hiCond = grab(/const hi=\(([^)]*)\)/, eng) || '';
  const highlight = [...hiCond.matchAll(/i===(\d+)/g)].map((m) => parseInt(m[1], 10));
  // นิพจน์ format ป้าย — เก็บตรง ๆ (รองรับ v.toFixed(2) / Math.round(d[1]) ฯลฯ) ; null = ดีฟอลต์ (v / d[1])
  const gFmt = grab(/forEach\(v=>\{[\s\S]*?Mono">(?:[฿$€£]|\$\{cur\})\$\{([^}]+)\}<\/text>/, eng);
  const dFmt = grab(/if\(hi\)svg\+=`<text[\s\S]*?Mono">(?:[฿$€£]|\$\{cur\})\$\{([^}]+)\}<\/text>/, eng);
  const chart = {
    data, min: numAt(/const min=([0-9.]+)/, eng), max: numAt(/,max=([0-9.]+)/, eng),
    grid, fairLine: numAt(/const fy=ys\(([0-9.]+)\)/, eng), currency: curSym, highlight,
    gridFmt: (gFmt && gFmt !== 'v') ? gFmt : null, dataFmt: (dFmt && dFmt !== 'd[1]') ? dFmt : null,
  };
  // ── gauge ──
  const gauge = {
    min: numAt(/const gmin=([0-9.]+)/, eng), max: numAt(/,gmax=([0-9.]+)/, eng),
    cur: numAt(/mCur"\)\.style\.left=gpos\(([0-9.]+)\)/, eng),
    fair: numAt(/mFair"\)\.style\.left=gpos\(([0-9.]+)\)/, eng),
    fairLabelTop: grab(/#mFair \.lab"\)\.style\.top="([^"]+)"/, eng) || '-58px',
  };
  const fv = numAt(/const FV=([0-9.]+)/, eng);
  return { theme, chart, gauge, fv };
}

function toReportData(rd) {
  const t = rd.theme;
  return `<script type="application/json" id="report-data">
{
  "theme": {
    "accent": ${JSON.stringify(t.accent)}, "accentDark": ${JSON.stringify(t.accentDark)},
    "darkGrad": ${JSON.stringify(t.darkGrad)},
    "glow": ${JSON.stringify(t.glow)}, "subColor": ${JSON.stringify(t.subColor)}, "headerMuted": ${JSON.stringify(t.headerMuted)},
    "chgBg": ${JSON.stringify(t.chgBg)}, "chgColor": ${JSON.stringify(t.chgColor)}, "badge": ${JSON.stringify(t.badge)},
    "verdictText": ${JSON.stringify(t.verdictText)}, "vcellLabel": ${JSON.stringify(t.vcellLabel)}
  },
  "chart": {
    "data": ${JSON.stringify(rd.chart.data)},
    "min": ${rd.chart.min}, "max": ${rd.chart.max}, "grid": ${JSON.stringify(rd.chart.grid)}, "fairLine": ${rd.chart.fairLine}, "currency": ${JSON.stringify(rd.chart.currency)}, "highlight": ${JSON.stringify(rd.chart.highlight)}${rd.chart.gridFmt ? `, "gridFmt": ${JSON.stringify(rd.chart.gridFmt)}` : ''}${rd.chart.dataFmt ? `, "dataFmt": ${JSON.stringify(rd.chart.dataFmt)}` : ''}
  },
  "gauge": { "min": ${rd.gauge.min}, "max": ${rd.gauge.max}, "cur": ${rd.gauge.cur}, "fair": ${rd.gauge.fair}, "fairLabelTop": ${JSON.stringify(rd.gauge.fairLabelTop)} },
  "fv": ${rd.fv}
}
</script>`;
}

function rebuild(h, rd) {
  let out = h;
  // 1) แทรก report-data หลังบล็อก stock-meta
  out = out.replace(/(<script[^>]*\bid=["']stock-meta["'][^>]*>[\s\S]*?<\/script>)/i, `$1\n${toReportData(rd)}`);
  // 2) font links + <style> → marker STYLE
  out = out.replace(/<link rel="preconnect"[\s\S]*?<\/style>/i, '<!--TEMPLATE:STYLE-->');
  // 3) engine <script> → marker ENGINE
  out = out.replace(/<script>\s*\(function\(\)\{[\s\S]*?\}\)\(\);\s*<\/script>/i, '<!--TEMPLATE:ENGINE-->');
  return out;
}

// ดึง "ค่าที่ render จริง" เพื่อเทียบเก่า↔ใหม่ (round-trip) — format-aware: เก่า/ใหม่ เก็บ currency+highlight คนละแบบ
//   currency: เก่า ">฿${v}" · ใหม่ const cur="฿"   |   highlight: เก่า const hi=(i===…) · ใหม่ const HL=[…]
function renderVals(h) {
  const cur = grab(/const cur="([^"]*)"/, h) || grab(/>([฿$€£])\$\{v/, h);          // สัญลักษณ์สกุลเงินที่ render (ทน toFixed)
  let hl = grab(/\bHL=(\[[\d,\s]*\])/, h);
  hl = hl ? JSON.parse(hl).join(',') : [...(grab(/const hi=\(([^;)]+)\)/, h) || '').matchAll(/i===(\d+)/g)].map((m) => m[1]).join(',');
  const dataRaw = grab(/const data=(\[\[[\s\S]*?\]\]);/, h);
  return {
    fv: numAt(/const FV=([0-9.]+)/, h), curGpos: numAt(/mCur"\)\.style\.left=gpos\(([0-9.]+)\)/, h),
    fairGpos: numAt(/mFair"\)\.style\.left=gpos\(([0-9.]+)\)/, h), min: numAt(/const min=([0-9.]+)/, h),
    max: numAt(/,max=([0-9.]+)/, h), gmin: numAt(/const gmin=([0-9.]+)/, h), gmax: numAt(/,gmax=([0-9.]+)/, h),
    fairLine: numAt(/const fy=ys\(([0-9.]+)\)/, h), data: dataRaw ? JSON.stringify(JSON.parse(dataRaw)) : null,
    cur, hl, fvBox: grab(/class="r">([^<]+)</, h),
    // brand color (ต้องคงไว้ต่อหุ้น) — เก่าอยู่ใน CSS literal, ใหม่อยู่ใน :root var
    badge: grab(/--badge:\s*([^;]+?);/, h) || grab(/\.s-head \.n\{[^}]*background:\s*(var\(--[\w-]+\)|#[0-9a-fA-F]{3,6})/, h),
    darkGrad: grab(/--dark-grad:\s*(linear-gradient\([^)]+\))/, h) || grab(/header\{background:\s*(linear-gradient\([^)]+\))/, h),
    accent: grab(/--blue:\s*(#[0-9a-fA-F]{3,6})/, h),
    verdictText: grab(/--verdict-text:\s*(#[0-9a-fA-F]{3,6})/, h) || grab(/\.verdict p\{color:\s*(#[0-9a-fA-F]{3,6})/, h),
    vcellLabel: grab(/--vcell-k:\s*(#[0-9a-fA-F]{3,6})/, h) || grab(/\.vcell \.k\{[^}]*color:\s*(#[0-9a-fA-F]{3,6})/, h),
    gridFmt: grab(/forEach\(v=>\{[\s\S]*?Mono">(?:[฿$€£]|\$\{cur\})\$\{([^}]+)\}<\/text>/, h),
    dataFmt: grab(/if\(hi\)svg\+=`<text[\s\S]*?Mono">(?:[฿$€£]|\$\{cur\})\$\{([^}]+)\}<\/text>/, h),
    // stock-meta (ตัวเลขที่ป้อนป้าย/มงกุฎ + เรียงหน้า index) — ต้องคงเป๊ะ ห้าม migration แตะ
    sm: (() => { const m = grab(/<script[^>]*\bid="stock-meta"[^>]*>([\s\S]*?)<\/script>/i, h); try { return m ? JSON.stringify(JSON.parse(m)) : null; } catch { return m; } })(),
  };
}

// ── ตรวจความเหมือนระดับ render: resolve var()→สีจริง เทียบ CSS + body verbatim ──
const rootVars = (h) => { const r = (h.match(/:root\{([\s\S]*?)\}/) || [])[1] || ''; const m = {}; for (const x of r.matchAll(/--([\w-]+):\s*([^;]+);/g)) m[x[1]] = x[2].trim(); return m; };
const resolveVar = (v, m, d) => d > 8 ? v : v.replace(/var\(--([\w-]+)\)/g, (_, k) => m[k] != null ? resolveVar(m[k], m, d + 1) : _);
const styleLines = (h) => { const m = rootVars(h); const s = (h.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''; return resolveVar(s, m, 0).split('\n').map((l) => l.trim()).filter(Boolean); };
const bodyNorm = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<link[^>]*>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
// บรรทัด CSS ที่ยอมให้ "ต่างแบบมองไม่เห็น" (convergence): opacity .tag/.vcell + .verdict ใช้ darkGrad (ต่างแค่ '0%' = render เท่ากัน)
const CSS_BENIGN = [/^\.tag\{/, /^\.vcell\{/, /^\.verdict\{/, /^\.zone\{/];

const args = process.argv.slice(2);
const write = args.includes('--write');
const syms = args.filter((a) => !a.startsWith('--'));
let fail = 0;
for (const sym of syms) {
  const f = path.join(REPORTS, sym.toUpperCase() + '.html');
  if (!fs.existsSync(f)) { console.log(`✗ ${sym}: ไม่พบไฟล์`); fail++; continue; }
  const oldH = fs.readFileSync(f, 'utf8');
  if (oldH.includes('<!--TEMPLATE:STYLE-->')) { console.log(`• ${sym}: เป็น template อยู่แล้ว ข้าม`); continue; }
  const rd = extract(oldH);
  const newH = rebuild(oldH, rd);
  // round-trip: expand แล้วเทียบค่า render กับเก่า
  let expanded; try { expanded = expandReport(newH); } catch (e) { console.log(`✗ ${sym}: expandReport ล้ม — ${e.message}`); fail++; continue; }
  const A = renderVals(oldH), B = renderVals(expanded);
  const diffs = Object.keys(A).filter((k) => String(A[k]) !== String(B[k]));
  const newSet = new Set(styleLines(expanded));
  const cssResidual = styleLines(oldH).filter((l) => !newSet.has(l) && !CSS_BENIGN.some((re) => re.test(l)));
  const problems = [];
  if (diffs.length) problems.push('engine/brand: ' + diffs.map((k) => `${k}(${A[k]}→${B[k]})`).join(', '));
  if (bodyNorm(oldH) !== bodyNorm(expanded)) problems.push('body เนื้อหาไม่ตรง verbatim');
  if (cssResidual.length) problems.push(`CSS ต่างหลัง resolve ${cssResidual.length} บรรทัด: ${cssResidual.map((l) => l.slice(0, 55)).join(' | ')}`);
  if (problems.length) { console.log(`✗ ${sym}: ${problems.join(' ; ')}`); fail++; continue; }
  console.log(`✓ ${sym}: faithful (cur=${rd.chart.currency} hl=[${rd.chart.highlight}] fv=${rd.fv} badge=${rd.theme.badge}) ${write ? '→ เขียน' : '(dry-run)'}`);
  if (write) fs.writeFileSync(f, newH);
}
process.exit(fail ? 1 : 0);
