'use strict';
/**
 * symbol-map.js — จุดโหลด `tools/symbol-map.json` ที่เดียวของทั้งรีโป
 *
 * เดิม IIFE try//catch ก้อนเดียวกันถูกก๊อปไว้ 3 ที่ (update-prices.js · fetch-fundamentals.js ·
 * dead-ticker-canary.js) และทุกตัวกลืน parse error เป็น `{}` เงียบ ๆ ⇒ ไฟล์เสียครั้งเดียว
 * แต่พังพร้อมกันหมดโดยไม่มีใครรู้ · ที่เจ็บสุดคือ dead-ticker-canary: map ว่าง = หุ้นที่เปลี่ยนชื่อ
 * ถูกยิงด้วย ticker เดิม → ไม่เจอ → flag `not-on-exchange` ที่ triage คือ "ลบรายงาน"
 * ⇒ รวมไว้ที่เดียวแล้ว **เตือนดัง ๆ** ตอนอ่านไม่ได้ (ไม่เงียบ) — src/ohlc.js เป็น ESM ของ Worker
 * จึง import JSON ตรงตามเดิม (bundler ตรวจให้ตอน build อยู่แล้ว)
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'symbol-map.json');

const MAP = (() => {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) {
    console.error(`⚠ อ่าน ${FILE} ไม่ได้ (${e.message}) — ใช้ map ว่าง: ticker ที่เปลี่ยนชื่อจะถูกยิงด้วยชื่อเดิม`);
    return {};
  }
})();

/** entry ของ symbol (ไม่มี = {} เพื่อให้ caller อ่านฟิลด์ต่อได้เลย) */
const entryFor = (symbol) => MAP[String(symbol).toUpperCase()] || {};

module.exports = { MAP, entryFor };
