#!/usr/bin/env node
'use strict';
/**
 * tag-apply.js — ทางเข้าเดียวที่เขียน tags.json
 *
 * ★ ห้ามแก้ tags.json ด้วยมือ และห้าม worker agent เขียนเอง
 *   เหตุผล: tools/pick-brand.js เป็น read-modify-write ไม่มี lock — รันขนาน 2 ตัว
 *   entry ทับหายโดย gate จับไม่ได้ (CLAUDE.md §10) ไฟล์นี้จึงถูกออกแบบให้
 *   controller รันทีละตัวแบบ sequential เท่านั้น
 *
 * ใช้:
 *   node tools/tag-apply.js <SYM> <slug…>          ติด/แทน tag
 *   node tools/tag-apply.js <SYM> --keep           ยืนยันคงเดิม (ไม่เขียนไฟล์)
 *   node tools/tag-apply.js <SYM> --request "ธีม"  เข้าคิวขอคำศัพท์ใหม่
 *   node tools/tag-apply.js --rename <OLD> <NEW>   ย้าย key ตาม symbol-map
 *   node tools/tag-apply.js --prune                ลบ entry ที่ไม่มีไฟล์รายงานแล้ว
 * exit 0 = สำเร็จ, 1 = ปฏิเสธ (ไม่เขียนไฟล์เลย)
 */
const fs = require('fs');
const path = require('path');
const T = require('./tag-lib.js');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');

/** ติด tag — pure: คืน data ใหม่ ไม่แตะดิสก์ · input เสีย = data เดิมไม่ถูกแตะเลย */
function applyTags({ symbol, slugs, vocab, data, reportsDir }) {
  const errors = T.validateAssignment(symbol, slugs, vocab);
  if (!fs.existsSync(path.join(reportsDir || REPORTS_DIR, symbol + '.html'))) {
    errors.push(`${symbol}: ไม่มีไฟล์ reports/${symbol}.html`);
  }
  if (errors.length) return { ok: false, errors, data };
  const next = { ...data, tags: { ...data.tags, [symbol]: slugs.slice() } };
  return { ok: true, errors: [], data: next };
}

function renameSymbol(data, oldSym, newSym) {
  if (!data.tags[oldSym]) return data;
  const tags = { ...data.tags, [newSym]: data.tags[oldSym] };
  delete tags[oldSym];
  return { ...data, tags };
}

function pruneMissing(data, reportsDir) {
  const dir = reportsDir || REPORTS_DIR;
  const tags = {}, removed = [];
  for (const sym of Object.keys(data.tags)) {
    if (fs.existsSync(path.join(dir, sym + '.html'))) tags[sym] = data.tags[sym];
    else removed.push(sym);
  }
  return { data: { ...data, tags }, removed };
}

function addRequest(data, symbol, theme, at, mode) {
  return { ...data, requests: data.requests.concat([{ symbol, theme, at, mode: mode || 'NEW' }]) };
}

/** เขียนแบบ atomic (temp → rename) + key เรียง — ล้มกลางคันแล้วไฟล์เดิมไม่เสียหาย */
function writeTags(data, file) {
  const target = file || T.TAGS_FILE;
  const tags = {};
  for (const k of Object.keys(data.tags).sort()) tags[k] = data.tags[k];
  const out = JSON.stringify({ vocabVersion: data.vocabVersion, tags, requests: data.requests }, null, 2) + '\n';
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, target);
}

module.exports = { applyTags, renameSymbol, pruneMissing, addRequest, writeTags };

// ---------- CLI ----------
function main() {
  const argv = process.argv.slice(2);
  const die = (msgs) => { for (const m of msgs) console.error('  ✗ ' + m); console.error('\n❌ ไม่เขียนไฟล์\n'); process.exit(1); };
  const vocab = T.loadVocab();
  let data = T.loadTags();
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 10);

  if (argv[0] === '--prune') {
    const r = pruneMissing(data, REPORTS_DIR);
    writeTags(r.data, T.TAGS_FILE);
    console.log(r.removed.length ? `✅ ลบ ${r.removed.length} entry: ${r.removed.join(', ')}` : '✅ ไม่มี entry ค้าง');
    return;
  }
  if (argv[0] === '--rename') {
    if (argv.length !== 3) die(['ใช้: --rename <OLD> <NEW>']);
    writeTags(renameSymbol(data, argv[1], argv[2]), T.TAGS_FILE);
    console.log(`✅ ย้าย ${argv[1]} → ${argv[2]}`);
    return;
  }
  const symbol = (argv[0] || '').toUpperCase();
  if (!symbol) die(['ต้องระบุ <SYM>']);
  if (argv[1] === '--keep') { console.log(`✅ ${symbol}: คงเดิม (${T.tagsOf(symbol, data).join(', ') || 'ยังไม่มี tag'})`); return; }
  if (argv[1] === '--request') {
    if (!argv[2]) die(['--request ต้องตามด้วยข้อความธีม']);
    writeTags(addRequest(data, symbol, argv[2], today, 'UPDATE'), T.TAGS_FILE);
    console.log(`✅ เข้าคิวขอคำศัพท์: ${symbol} — ${argv[2]}`);
    return;
  }
  const r = applyTags({ symbol, slugs: argv.slice(1), vocab, data, reportsDir: REPORTS_DIR });
  if (!r.ok) die(r.errors);
  writeTags(r.data, T.TAGS_FILE);
  console.log(`✅ ${symbol}: ${argv.slice(1).join(' · ')}`);
}

if (require.main === module) main();
