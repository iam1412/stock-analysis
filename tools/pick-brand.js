#!/usr/bin/env node
'use strict';
/**
 * pick-brand.js — จบพิธีสีแบรนด์ใน 1 คำสั่ง (แทนวงจร อ่าน brand-colors → dump seeds → node -e → แก้ seeds → verify)
 *   1. ตรวจ hex ชน/ใกล้เคียงกับ seed เดิมทั้งหมดใน tools/seeds.json
 *      — ชน = เสนอเฉดว่างใกล้เคียงใน hue เดียวกัน 2-3 ตัว + exit 1 (หรือ --auto รับเฉดใกล้สุดเลย ไม่ exit)
 *   2. เพิ่ม/อัปเดต "<SYMBOL>": "#hex" ลง seeds.json (คง key เรียงตามตัวอักษร)
 *   3. พิมพ์ makeTheme(hex) 8 คีย์ (วางลง report-data.theme) + บรรทัด {{GDOTS}} พร้อม copy
 *
 * ใช้:  node tools/pick-brand.js <SYMBOL> "#rrggbb" [--auto] [--force]
 *   --auto  = ถ้าชน ให้รับเฉดว่างที่ใกล้แบรนด์สุดแทนอัตโนมัติ (จบใน call เดียว — default สำหรับ worker)
 *   --force = ยอมสีชน (เฉพาะแบรนด์ร่วมจริง เช่น TSM/STM แดงเดียวกัน) หรือเปลี่ยน seed เดิมของหุ้นที่มีอยู่แล้ว
 */
const fs = require('fs');
const path = require('path');
const { makeTheme, hexToHsl, hslToHex } = require('./brandtheme.js');

const args = process.argv.slice(2);
const force = args.includes('--force');
const auto = args.includes('--auto');
const pos = args.filter((a) => !a.startsWith('--'));
const [symRaw, hexRaw] = pos;
if (!symRaw || !hexRaw || !/^#[0-9a-fA-F]{6}$/.test(hexRaw)) {
  console.error('ใช้: node tools/pick-brand.js <SYMBOL> "#rrggbb" [--auto] [--force]');
  process.exit(1);
}
const sym = symRaw.toUpperCase();
let hex = hexRaw.toLowerCase();
const seedsFile = path.join(__dirname, 'seeds.json');
const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));

// ชน = seed เดียวกันเป๊ะ หรือ accent ที่ generate แล้ว "แยกไม่ออก" — เทียบใน accent space
// (makeTheme clamp S/L → seed ต่างกันแต่ hue เดียวกันให้ธีมแทบเหมือนกัน เทียบ seed ตรง ๆ จึงหลอกตา)
// รัศมี RGB ≤12 คาลิเบรตจาก seeds เดิม: คู่ duplicate จริง (TSM/STM ฯลฯ) = 0–2 · เฉดต่างในตระกูลเดียวกันที่ระบบรับ = ห่างกว่านี้
const rgbDist = (a, b) => {
  const c = (x) => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
  const [r1, g1, b1] = c(a), [r2, g2, b2] = c(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const others = Object.entries(seeds).filter(([s]) => s !== sym);
const usedHex = new Set(others.map(([, v]) => v.toLowerCase()));
const usedAccents = others.map(([, v]) => makeTheme(v).accent);
const collide = (h) => {
  const acc = makeTheme(h).accent;
  return usedHex.has(h) || usedAccents.some((a) => rgbDist(acc, a) <= 12);
};

// เฉดว่างใกล้เคียงใน hue เดียวกัน — accent ของธีมขึ้นกับ hue + sat(clamp 55-85) เท่านั้น
// (lightness accent ตายตัว 52 ใน makeTheme) → ปรับ lightness ของ seed ไม่ช่วยคลายชนเลย
// จึงไล่ sat ± ก่อน (คง hue แบรนด์เป๊ะ) แล้วค่อย hue ±ทีละ 3° · เก็บเฉพาะตัวที่ไม่ชนใคร
// และไม่ชนกันเองในลิสต์ข้อเสนอ
function freeShades(baseHex, wanted) {
  const [h0, s0, l0] = hexToHsl(baseHex);
  const cands = [];
  const seen = new Set();
  for (const ds of [0, 12, -12, 24, -24]) {
    for (let dh = 0; dh <= 30; dh += 3) {
      for (const sgn of dh === 0 ? [1] : [1, -1]) {
        if (dh === 0 && ds === 0) continue;
        const cand = hslToHex((((h0 + sgn * dh) % 360) + 360) % 360, clamp(s0 + ds, 35, 95), l0);
        if (seen.has(cand)) continue;
        seen.add(cand);
        cands.push({ hex: cand, dh: sgn * dh, ds });
      }
    }
  }
  cands.sort((a, b) => Math.abs(a.dh) - Math.abs(b.dh) || Math.abs(a.ds) - Math.abs(b.ds));
  const out = [];
  for (const c of cands) {
    if (collide(c.hex)) continue;
    const acc = makeTheme(c.hex).accent;
    if (out.some((o) => rgbDist(acc, o.acc) <= 12)) continue;
    out.push({ ...c, acc });
    if (out.length >= wanted) break;
  }
  return out;
}

const near = [];
for (const [s, v] of others) {
  if (v.toLowerCase() === hex || rgbDist(makeTheme(hex).accent, makeTheme(v).accent) <= 12) near.push(`${s} ${v}`);
}
let autoNote = '';
if (near.length && !force) {
  const sugg = freeShades(hex, 3);
  const fmt = (c) => `${c.hex} (hue ${c.dh >= 0 ? '+' : ''}${c.dh}° · sat ${c.ds >= 0 ? '+' : ''}${c.ds})`;
  if (auto && sugg.length) {
    autoNote = ` (--auto: ${hex} ชน ${near.join(', ')} → ใช้เฉดว่างใกล้สุด ${fmt(sugg[0])} แทน)`;
    hex = sugg[0].hex;
  } else {
    console.error(`✗ ${hex} ชน/ใกล้เคียง seed เดิม: ${near.join(', ')}`);
    if (sugg.length) {
      console.error('  เฉดว่างใน hue เดียวกัน ไม่ชนใคร (เรียงใกล้แบรนด์→ไกล) — เลือก 1 ตัวรันซ้ำ:');
      for (const c of sugg) console.error(`    ${fmt(c)}`);
      console.error('  หรือรันคำสั่งเดิมเติม --auto = รับเฉดแรกอัตโนมัติ จบใน call เดียว');
    } else {
      console.error('  ไม่พบเฉดว่างใกล้เคียง — เลือกสีรองของแบรนด์ตาม tools/brand-colors.md');
    }
    console.error('  แบรนด์ร่วมจริงเท่านั้น (เช่น TSM/STM) → เติม --force');
    process.exit(1);
  }
}
if (seeds[sym] && seeds[sym].toLowerCase() !== hex && !force) {
  console.error(`✗ ${sym} มี seed เดิม ${seeds[sym]} — ตั้งใจเปลี่ยนสีจริงให้เติม --force`);
  process.exit(1);
}

seeds[sym] = hex;
const sorted = Object.fromEntries(Object.keys(seeds).sort().map((k) => [k, seeds[k]]));
fs.writeFileSync(seedsFile, JSON.stringify(sorted, null, 2) + '\n');

const t = makeTheme(hex);
const gradMid = (t.darkGrad.match(/,(#[0-9a-fA-F]{6}) 58%/) || [])[1] || t.accentDark;
const dot = (c) => `<div style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block;margin:0 3px"></div>`;

console.log(`✓ ${sym}: ${hex} → บันทึกลง tools/seeds.json แล้ว${autoNote || (near.length && force ? ` (--force ทับ near-match: ${near.join(', ')})` : '')}`);
console.log('\n— 8 คีย์วางลง report-data.theme (แล้วเติม chgBg/chgColor จากผล fetch-facts ต่อท้าย) —');
console.log(JSON.stringify(t, null, 2));
console.log('\n— วางแทน {{GDOTS}} (จุด 3 สี: accent → accentDark → โทนเข้มกลาง darkGrad) —');
console.log(dot(t.accent) + dot(t.accentDark) + dot(gradMid));
