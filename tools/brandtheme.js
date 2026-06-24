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

// seed = สีแบรนด์ตัวแทน (สดกลาง ๆ) → ธีมเต็มชุด (โทนเข้มไล่ระดับ + tint อ่อนสำหรับตัวอักษร)
function makeTheme(seed) {
  const [h, s0] = hexToHsl(seed);
  const s = clamp(s0, 45, 85);                          // คุมความอิ่มไม่ให้จืด/จัดเกิน
  const dg = (l) => hslToHex(h, clamp(s + 6, 45, 88), l);
  return {
    accent: hslToHex(h, clamp(s, 55, 85), 52),          // สีสด: เส้นกราฟ, เลข section, underline
    accentDark: hslToHex(h, clamp(s, 55, 85), 38),
    darkGrad: `linear-gradient(135deg,${dg(13)} 0%,${dg(24)} 58%,${dg(38)} 140%)`,  // header/verdict เข้ม→สว่าง
    glow: (() => { const c = hslToHex(h, s, 50).replace('#', ''); const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16); return `rgba(${r},${g},${b},.35)`; })(),
    subColor: hslToHex(h, clamp(s - 20, 18, 50), 84),    // คำโปรยใต้ h1 (อ่อน ทินต์แบรนด์)
    headerMuted: hslToHex(h, clamp(s - 35, 12, 35), 74), // ราคา meta (เทาอมแบรนด์)
    verdictText: hslToHex(h, clamp(s - 18, 20, 55), 88), // ข้อความในกล่องสรุป
    vcellLabel: hslToHex(h, clamp(s - 28, 15, 45), 76),  // label การ์ดสรุป
  };
}

module.exports = { makeTheme, hexToHsl, hslToHex };

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
