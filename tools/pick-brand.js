#!/usr/bin/env node
'use strict';
/**
 * pick-brand.js — จบพิธีสีแบรนด์ใน 1 คำสั่ง (แทนวงจร อ่าน brand-colors → dump seeds → node -e → แก้ seeds → verify)
 *   1. ตรวจ hex ชน/ใกล้เคียงกับ seed เดิมทั้งหมดใน tools/seeds.json — ชน = แจ้งรายชื่อ + exit 1
 *   2. เพิ่ม/อัปเดต "<SYMBOL>": "#hex" ลง seeds.json (คง key เรียงตามตัวอักษร)
 *   3. พิมพ์ makeTheme(hex) 8 คีย์ (วางลง report-data.theme) + บรรทัด {{GDOTS}} พร้อม copy
 *
 * ใช้:  node tools/pick-brand.js <SYMBOL> "#rrggbb" [--force]
 *   --force = ยอมสีชน (เฉพาะแบรนด์ร่วมจริง เช่น TSM/STM แดงเดียวกัน) หรือเปลี่ยน seed เดิมของหุ้นที่มีอยู่แล้ว
 */
const fs = require('fs');
const path = require('path');
const { makeTheme } = require('./brandtheme.js');

const args = process.argv.slice(2);
const force = args.includes('--force');
const pos = args.filter((a) => !a.startsWith('--'));
const [symRaw, hexRaw] = pos;
if (!symRaw || !hexRaw || !/^#[0-9a-fA-F]{6}$/.test(hexRaw)) {
  console.error('ใช้: node tools/pick-brand.js <SYMBOL> "#rrggbb" [--force]');
  process.exit(1);
}
const sym = symRaw.toUpperCase();
const hex = hexRaw.toLowerCase();
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
const newAccent = makeTheme(hex).accent;
const near = [];
for (const [s, v] of Object.entries(seeds)) {
  if (s === sym) continue;
  if (v.toLowerCase() === hex || rgbDist(newAccent, makeTheme(v).accent) <= 12) near.push(`${s} ${v}`);
}
if (near.length && !force) {
  console.error(`✗ ${hex} ชน/ใกล้เคียง seed เดิม: ${near.join(', ')}`);
  console.error('  เลือกเฉดใหม่ตามหลัก tools/brand-colors.md · แบรนด์ร่วมจริงเท่านั้น (เช่น TSM/STM) → เติม --force');
  process.exit(1);
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

console.log(`✓ ${sym}: ${hex} → บันทึกลง tools/seeds.json แล้ว${near.length ? ` (--force ทับ near-match: ${near.join(', ')})` : ''}`);
console.log('\n— 8 คีย์วางลง report-data.theme (แล้วเติม chgBg/chgColor จากผล fetch-facts ต่อท้าย) —');
console.log(JSON.stringify(t, null, 2));
console.log('\n— วางแทน {{GDOTS}} (จุด 3 สี: accent → accentDark → โทนเข้มกลาง darkGrad) —');
console.log(dot(t.accent) + dot(t.accentDark) + dot(gradMid));
