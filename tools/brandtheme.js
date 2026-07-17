#!/usr/bin/env node
'use strict';
/**
 * brandtheme.js — สร้าง "ธีมสีเต็มชุด" จากสีแบรนด์เมล็ดเดียว (seed) แล้วเขียนลง report-data.theme
 *   makeTheme(seed) → { accent, accentDark, darkGrad, glow, subColor, headerMuted, verdictText, vcellLabel }
 *   ทุกเฉดอิง "เนื้อสี (hue)" เดียวกันของแบรนด์ → header เข้ม, accent สด, ตัวอักษรบนพื้นเข้มทินต์ตามแบรนด์
 *   ไม่แตะ chgBg/chgColor (semantic ขึ้น/ลง) · badge=var(--blue) อยู่แล้ว → ตามสี accent ใหม่อัตโนมัติ
 *
 * ใช้:  node tools/brandtheme.js seeds.json [--write]
 *   seeds.json = { "GOOGL": "#4285f4", "TSLA": "#cc0000", ... }
 */
const fs = require('fs');
const path = require('path');

// ── color math ──
function hexToHsl(hex) {
  const m = hex.replace('#', '');
  let r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, s * 100, l * 100];
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── WCAG contrast (โมดูลกลาง — makeTheme / tools/fix-contrast.js / gate E38 ต้องใช้ตัวเดียวกัน ห้าม copy สูตรแยก) ──
const hexToRgb = (hex) => { const m = hex.replace('#', ''); const f = m.length === 3 ? m.split('').map((c) => c + c).join('') : m; return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]; };
const rgbToHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const relLum = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixHex = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); };
// เกณฑ์: gate ตรวจที่ WCAG AA (ตัวหนังสือปกติ 4.5 / ตัวใหญ่-กราฟิก 3.0) — ตัวสร้างสีเผื่อ margin กัน hex↔hsl round-trip
const AA = { text: 4.5, graphic: 3.0 };
const AA_MARGIN = { text: 4.75, graphic: 3.15 };

// สีสว่างสุดที่ "มองเห็นจริง" ของ linear-gradient — stop อาจประกาศเกิน 100% (เช่น 140%) จึงต้อง
// interpolate กลับมาในช่วง 0–100% แล้ว sample ทีละ 5% (peak อาจอยู่กลางช่วง) · คืน null ถ้า parse ไม่ได้
function gradBrightest(grad) {
  const stops = [...String(grad).matchAll(/#([0-9a-fA-F]{6})\s+(-?\d+(?:\.\d+)?)%/g)].map((m) => ({ c: '#' + m[1].toLowerCase(), p: parseFloat(m[2]) }));
  if (!stops.length) return null;
  let best = null;
  for (let p = 0; p <= 100; p += 5) {
    let c;
    if (p <= stops[0].p) c = stops[0].c;
    else if (p >= stops[stops.length - 1].p) c = stops[stops.length - 1].c;
    else for (let i = 0; i < stops.length - 1; i++) if (p >= stops[i].p && p <= stops[i + 1].p) { c = mixHex(stops[i].c, stops[i + 1].c, (p - stops[i].p) / (stops[i + 1].p - stops[i].p)); break; }
    if (best === null || relLum(c) > relLum(best)) best = c;
  }
  return best;
}

// แปลงค่าสีทุกรูปแบบที่ theme ใช้จริง (hex / rgba / hsl / hsla) เป็น hex ทึบ "ตามที่ตาเห็น" บนพื้น bgHex
// — rgba/hsla ต้อง composite ทับพื้นก่อนวัด contrast ไม่งั้นค่า alpha ต่ำ (เช่น 0.12) หลุดการตรวจทั้งที่แทบล่องหน
// คืน null ถ้า parse ไม่ได้ (เช่น var(--x) — ผู้เรียกจัดการเอง)
function effectiveHex(value, bgHex) {
  const v = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return ('#' + v.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
  let m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    const solid = rgbToHex([+m[1], +m[2], +m[3]]);
    return a >= 1 || !bgHex ? solid : mixHex(bgHex, solid, a);
  }
  m = v.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    const solid = hslToHex(+m[1], +m[2], +m[3]);
    return a >= 1 || !bgHex ? solid : mixHex(bgHex, solid, a);
  }
  return null;
}

// ปรับ lightness ของ fg ไปทางเดียว (ทิศตายตัวตามบทบาทสี: ตัวหนังสืออ่อนบนพื้นเข้ม → lighten,
// สีเข้มบนพื้นอ่อน → darken) จนผ่าน min — คง hue/sat ไว้ ให้ยังรู้สึกเป็นสีแบรนด์เดิม
function tuneContrast(fg, bg, min, dir) {
  let [h, s, l] = hexToHsl(fg);
  let hex = hslToHex(h, s, l);
  const step = dir === 'lighten' ? 1 : -1;
  while (contrast(hex, bg) < min && (dir === 'lighten' ? l < 100 : l > 0)) {
    l = clamp(l + step, 0, 100);                         // clamp ให้แตะขาว/ดำแท้พอดี (L=100 = #ffffff) = contrast สูงสุดที่ไปได้
    hex = hslToHex(h, s, l);
  }
  return hex;
}

// seed = สีแบรนด์ตัวแทน (สดกลาง ๆ) → ธีมเต็มชุด (โทนเข้มไล่ระดับ + tint อ่อนสำหรับตัวอักษร)
// ทุกคู่ ตัวหนังสือ/พื้นหลัง ที่ธีมคุม การันตี WCAG AA (+margin) ตั้งแต่ตอนสร้าง — gate E38 ตรวจซ้ำ
function makeTheme(seed) {
  const [h, s0] = hexToHsl(seed);
  const s = clamp(s0, 45, 85);                          // คุมความอิ่มไม่ให้จืด/จัดเกิน
  const dg = (l) => hslToHex(h, clamp(s + 6, 45, 88), l);
  // gradient header/verdict: ลดความสว่างทั้งชุด (คงรูปทรง ramp) จนตัวหนังสือขาวเล็กอ่านออกทุกจุดที่มองเห็น
  // ผิวอ้างอิง = จุดสว่างสุด "ทับด้วยกล่องขาวโปร่ง 7%" (.vcell) ซึ่งสว่างกว่า gradient เปล่า — cap ที่ผิวนี้ทีเดียวคลุมทุกชั้น
  let L = [13, 24, 38];
  const grad = () => `linear-gradient(135deg,${dg(L[0])} 0%,${dg(L[1])} 58%,${dg(L[2])} 140%)`;
  while (contrast('#ffffff', mixHex(gradBrightest(grad()), '#ffffff', 0.07)) < AA_MARGIN.text && L[2] > 5) L = L.map((l) => Math.max(l - 1, 4));
  const darkGrad = grad();
  const bright = gradBrightest(darkGrad);
  const lightText = (base) => tuneContrast(base, bright, AA_MARGIN.text, 'lighten');
  return {
    accent: tuneContrast(hslToHex(h, clamp(s, 55, 85), 52), '#ffffff', AA_MARGIN.graphic, 'darken'),  // เส้นกราฟ/กราฟิกบนพื้นขาว ≥3
    accentDark: tuneContrast(hslToHex(h, clamp(s, 55, 85), 38), '#e8f0fe', AA_MARGIN.text, 'darken'), // ตัวหนังสือบน blue-soft + พื้นหลังตัวหนังสือขาว ≥4.5
    darkGrad,
    glow: (() => { const [r, g, b] = hexToRgb(hslToHex(h, s, 50)); return `rgba(${r},${g},${b},.35)`; })(),
    subColor: lightText(hslToHex(h, clamp(s - 20, 18, 50), 84)),    // คำโปรยใต้ h1 (อ่อน ทินต์แบรนด์)
    headerMuted: lightText(hslToHex(h, clamp(s - 35, 12, 35), 74)), // ราคา meta (เทาอมแบรนด์)
    verdictText: lightText(hslToHex(h, clamp(s - 18, 20, 55), 88)), // ข้อความในกล่องสรุป
    vcellLabel: tuneContrast(hslToHex(h, clamp(s - 28, 15, 45), 76), mixHex(bright, '#ffffff', 0.07), AA_MARGIN.text, 'lighten'), // label การ์ดสรุป (อยู่บนกล่องขาวโปร่ง 7%)
  };
}

module.exports = { makeTheme, hexToHsl, hslToHex, hexToRgb, rgbToHex, relLum, contrast, mixHex, gradBrightest, tuneContrast, effectiveHex, AA, AA_MARGIN };

if (require.main === module) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const mapFile = args.find((a) => !a.startsWith('--'));
  if (!mapFile) { console.error('ใช้: node tools/brandtheme.js seeds.json [--write]'); process.exit(1); }
  const seeds = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  const BRAND_FIELDS = ['accent', 'accentDark', 'darkGrad', 'glow', 'subColor', 'headerMuted', 'verdictText', 'vcellLabel'];
  let n = 0, fail = 0;
  for (const [sym, seed] of Object.entries(seeds)) {
    const f = path.join(__dirname, '..', 'reports', sym.toUpperCase() + '.html');
    if (!fs.existsSync(f)) { console.log(`✗ ${sym}: ไม่พบไฟล์`); fail++; continue; }
    let h = fs.readFileSync(f, 'utf8');
    const blkRe = /(<script[^>]*\bid="report-data"[^>]*>)([\s\S]*?)(<\/script>)/i;
    const m = h.match(blkRe);
    if (!m) { console.log(`✗ ${sym}: ไม่ใช่ template (ไม่มี report-data) — migrate ก่อน`); fail++; continue; }
    const t = makeTheme(seed);
    let blk = m[2];
    for (const k of BRAND_FIELDS) {
      const re = new RegExp(`("${k}":\\s*")[^"]*(")`);
      if (!re.test(blk)) { console.log(`✗ ${sym}: report-data ขาดฟิลด์ ${k}`); fail++; blk = null; break; }
      blk = blk.replace(re, `$1${t[k]}$2`);
    }
    if (blk == null) continue;
    h = h.replace(blkRe, `$1${blk}$3`);
    console.log(`✓ ${sym}: seed ${seed} → accent ${t.accent} ${write ? '→ เขียน' : '(dry)'}`);
    if (write) fs.writeFileSync(f, h);
    n++;
  }
  console.log(`\n${n} สำเร็จ${fail ? `, ${fail} ล้ม` : ''}`);
  process.exit(fail ? 1 : 0);
}
