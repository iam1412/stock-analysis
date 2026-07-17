#!/usr/bin/env node
'use strict';
/**
 * fix-contrast.js — ตรวจ/ซ่อม WCAG contrast ของ report-data.theme ทุกรายงาน (คู่กับ gate E38)
 *
 * หลักการ (two-pass — ลำดับสำคัญ):
 *   pass 1: ซ่อม darkGrad ก่อน — ลด lightness ทุก stop ตามสัดส่วน (คงรูปทรง ramp + hue/sat)
 *           จนผิวสว่างสุดที่มองเห็น (รวมกล่องขาวโปร่ง 7% ของ .vcell) รับตัวหนังสือขาวเล็กได้
 *   pass 2: ปรับสีที่เหลือเทียบกับ gradient "ใหม่" — ทิศตายตัวตามบทบาท:
 *           ตัวหนังสืออ่อนบนพื้นเข้ม (subColor/headerMuted/verdictText/vcellLabel) → lighten
 *           สีเข้มบนพื้นอ่อน (accent/accentDark/chgColor) → darken
 *   แก้เฉพาะ field ที่ตกเกณฑ์ (minimal patch — คงเอกลักษณ์ธีมที่เขียนมือไว้) · idempotent (รันซ้ำ = 0 diff)
 *
 * ใช้:  node tools/fix-contrast.js [SYMBOL…] [--write]
 *   ไม่ระบุ SYMBOL = ทั้ง reports/ · ไม่ใส่ --write = dry-run (โชว์ field ที่จะแก้)
 */
const fs = require('fs');
const path = require('path');
const bt = require('./brandtheme.js');
// ตรวจที่เกณฑ์ gate (AA) แต่ซ่อมไปที่ AA_MARGIN — ค่าที่ผ่าน gate อยู่แล้วไม่แตะเลย (minimal patch + กัน flap ที่ขอบ)
const { AA, AA_MARGIN } = bt;

// ค่าคงที่ของพาเลตใน _template/dashboard.css ที่ theme อ้างถึงได้
const SOFT = { 'var(--red-soft)': '#fce8e6', 'var(--green-soft)': '#e6f4ea', 'var(--amber-soft)': '#fef7e0', 'var(--blue-soft)': '#e8f0fe' };
const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');
// bgHex = พื้นหลังสำหรับ composite ค่า rgba/hsla โปร่งแสง (ป้อนเมื่อรู้ผิวจริง เช่น gradient)
const resolveColor = (v, t, bgHex) => v === 'var(--blue)' ? t.accent : v === 'var(--blue-d)' ? t.accentDark : SOFT[v] || bt.effectiveHex(v, bgHex);

// ซ่อม theme (pure function — ใช้ตรง ๆ ใน test/self-test.js ได้) → { theme, changed: {field: [เดิม, ใหม่]} }
function fixTheme(theme) {
  const t = { ...theme };
  const changed = {};
  const set = (k, v) => { if (t[k] != null && v != null && t[k] !== v) { changed[k] = [t[k], v]; t[k] = v; } };

  // แก้เฉพาะเมื่อตกเกณฑ์ gate — ซ่อมด้วยเป้า margin
  // ค่า rgba/hsl โปร่งแสง: วัดจาก "สีตามที่ตาเห็น" (composite ทับพื้น) — ตกเกณฑ์ → เขียนกลับเป็น hex ทึบที่จูนแล้ว
  const tuneIf = (k, bg, aa, target, dir) => {
    const eff = bt.effectiveHex(t[k], bg);
    if (eff && bt.contrast(eff, bg) < aa) set(k, bt.tuneContrast(eff, bg, target, dir));
  };

  // pass 1: gradient
  if (t.darkGrad) {
    let g = t.darkGrad, guard = 0;
    const surface = (grad) => { const br = bt.gradBrightest(grad); return br ? bt.mixHex(br, '#ffffff', 0.07) : null; };
    const dim = (grad) => grad.replace(/#([0-9a-fA-F]{6})/g, (m, hx) => { const [h, s, l] = bt.hexToHsl('#' + hx); return bt.hslToHex(h, s, l * 0.93); });
    const s0 = surface(g);
    if (s0 && bt.contrast('#ffffff', s0) < AA.text) {
      while (guard++ < 80) {
        const sf = surface(g);
        if (!sf || bt.contrast('#ffffff', sf) >= AA_MARGIN.text) break;
        g = dim(g);
      }
      set('darkGrad', g);
    }
  }
  const br = t.darkGrad ? bt.gradBrightest(t.darkGrad) : null;

  // pass 2: สีเข้มบนพื้นอ่อน (accent = กราฟิก/เส้นกราฟ ≥3 · accentDark = ตัวหนังสือ + พื้นตัวหนังสือขาว ≥4.5)
  tuneIf('accent', '#ffffff', AA.graphic, AA_MARGIN.graphic, 'darken');
  tuneIf('accentDark', '#e8f0fe', AA.text, AA_MARGIN.text, 'darken');

  // pass 2: ตัวหนังสืออ่อนบน gradient ใหม่
  if (br) {
    for (const k of ['subColor', 'headerMuted', 'verdictText']) tuneIf(k, br, AA.text, AA_MARGIN.text, 'lighten');
    tuneIf('vcellLabel', bt.mixHex(br, '#ffffff', 0.07), AA.text, AA_MARGIN.text, 'lighten');
  }

  // badge = พื้นหลังตัวหนังสือขาว 13px (เลข section) — accent สดส่วนใหญ่ไม่ถึง 4.5 → ชี้ไป accentDark
  const badgeBg = resolveColor(t.badge, t);
  if (t.badge != null && (!badgeBg || bt.contrast('#ffffff', badgeBg) < AA.text)) set('badge', 'var(--blue-d)');

  // ป้าย % (.chg) — สี semantic เขียว/แดง: ตกเกณฑ์ → เฉด canonical เข้ม (คง regex ทิศทางของ E34)
  const cb = resolveColor(t.chgBg, t), cf = resolveColor(t.chgColor, t);
  if (cb && cf && bt.contrast(cf, cb) < AA.text) {
    const [h] = bt.hexToHsl(cf);
    if (h >= 70 && h <= 170) set('chgColor', '#137333');
    else if (h <= 20 || h >= 340) set('chgColor', '#c5221f');
    else set('chgColor', bt.tuneContrast(cf, cb, AA_MARGIN.text, bt.relLum(cf) < bt.relLum(cb) ? 'darken' : 'lighten'));
  }
  return { theme: t, changed };
}

module.exports = { fixTheme, resolveColor, SOFT };

if (require.main === module) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const only = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
  const dir = path.join(__dirname, '..', 'reports');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && (!only.length || only.includes(f.replace('.html', ''))));
  let fixed = 0, clean = 0, skip = 0;
  for (const f of files.sort()) {
    const fp = path.join(dir, f);
    let html = fs.readFileSync(fp, 'utf8');
    const blkRe = /(<script[^>]*\bid="report-data"[^>]*>)([\s\S]*?)(<\/script>)/i;
    const m = html.match(blkRe);
    if (!m) { skip++; continue; }
    let data; try { data = JSON.parse(m[2]); } catch { console.log(`✗ ${f}: report-data parse ไม่ได้`); skip++; continue; }
    // ป้าย "เหมาะสม" บน gauge (inline จาก skeleton เดิม) — เขียว #1e8e3e ตัวหนังสือขาว = 4.21 ไม่ถึง 4.5
    const labFix = html.includes('class="lab" style="background:#1e8e3e"');
    if (!data.theme) { clean++; continue; }
    const { changed } = fixTheme(data.theme);
    const keys = Object.keys(changed);
    if (labFix) keys.push('fair-lab');
    if (!keys.length) { clean++; continue; }
    fixed++;
    console.log(`${write ? '✎' : '·'} ${f.replace('.html', '')}: ${keys.map((k) => changed[k] ? `${k} ${changed[k][0]} → ${changed[k][1]}` : `${k} #1e8e3e → #137333`).join(' · ')}`);
    if (!write) continue;
    let blk = m[2], ok = true;
    for (const k of keys) {
      if (!changed[k]) continue;                                        // fair-lab แก้ที่ HTML ไม่ใช่ theme block
      const re = new RegExp(`("${k}":\\s*")[^"]*(")`);
      if (!re.test(blk)) { console.log(`  ✗ แทนค่า ${k} ใน report-data ไม่ได้ (รูปแบบไม่ตรง) — ข้ามไฟล์นี้`); ok = false; break; }
      blk = blk.replace(re, `$1${changed[k][1]}$2`);
    }
    if (ok) {
      html = html.replace(blkRe, `$1${blk}$3`);
      if (labFix) html = html.split('class="lab" style="background:#1e8e3e"').join('class="lab" style="background:#137333"');
      fs.writeFileSync(fp, html);
    }
  }
  console.log(`\n${write ? 'แก้แล้ว' : 'ต้องแก้'} ${fixed} · ผ่านอยู่แล้ว ${clean} · ข้าม ${skip} (จาก ${files.length})${write ? '' : ' — เติม --write เพื่อเขียนจริง'}`);
}
