'use strict';
/**
 * tag-lib.js — ที่เดียวที่รู้ว่า tag ถูกเก็บยังไง
 *
 * เหตุผลที่แยกเป็นโมดูล: build.js (inject+หน้า tag) · check-reports.js (E40/W13) ·
 * tag-apply.js (CLI) · tags-test.js ต้องอ่าน schema เดียวกัน — เขียนซ้ำ 4 ที่แล้ววันหนึ่ง
 * schema เปลี่ยน ตัวที่หลุดจะ "ไม่เจอ" แบบเงียบ ๆ ไม่ throw (บทเรียนเดียวกับ report-meta.js)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VOCAB_FILE = path.join(ROOT, 'tags-vocab.json');
const TAGS_FILE = path.join(ROOT, 'tags.json');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TAGS = 3;      // เพดาน tag ต่อหุ้น
const MIN_MEMBERS = 3;   // ขั้นต่ำสมาชิกต่อ tag (ต่ำกว่านี้ = warning — กัน singleton กลับมา)

function loadVocab(file) {
  const raw = JSON.parse(fs.readFileSync(file || VOCAB_FILE, 'utf8'));
  const list = Array.isArray(raw.tags) ? raw.tags : [];
  return { version: Number(raw.version) || 0, list, bySlug: new Map(list.map((e) => [e.slug, e])) };
}

function loadTags(file) {
  const raw = JSON.parse(fs.readFileSync(file || TAGS_FILE, 'utf8'));
  return {
    vocabVersion: Number(raw.vocabVersion) || 0,
    tags: raw.tags && typeof raw.tags === 'object' ? raw.tags : {},
    requests: Array.isArray(raw.requests) ? raw.requests : [],
  };
}

/** ตรวจคลัง — คืนรายการข้อความ error (ว่าง = ผ่าน) */
function validateVocab(vocab) {
  const errs = [], seenSlug = new Set(), seenAlias = new Map();
  for (const e of vocab.list) {
    if (!e || typeof e.slug !== 'string' || !SLUG_RE.test(e.slug)) { errs.push(`slug รูปแบบผิด: ${JSON.stringify(e && e.slug)}`); continue; }
    if (seenSlug.has(e.slug)) errs.push(`slug ซ้ำในคลัง: ${e.slug}`);
    seenSlug.add(e.slug);
    if (typeof e.label !== 'string' || !e.label.trim()) errs.push(`${e.slug}: label ว่าง`);
    for (const a of (e.aliases || [])) {
      const k = String(a).toLowerCase().trim();
      if (!k) continue;
      if (seenAlias.has(k) && seenAlias.get(k) !== e.slug) errs.push(`alias "${k}" ชนกัน: ${seenAlias.get(k)} กับ ${e.slug}`);
      seenAlias.set(k, e.slug);
    }
  }
  return errs;
}

/** ตรวจการติด tag ของหุ้นตัวหนึ่ง — คืนรายการข้อความ error (ว่าง = ผ่าน) */
function validateAssignment(symbol, slugs, vocab) {
  const errs = [];
  if (!Array.isArray(slugs) || slugs.length < 1) { errs.push(`${symbol}: ต้องมี tag อย่างน้อย 1 ตัว`); return errs; }
  if (slugs.length > MAX_TAGS) errs.push(`${symbol}: มี ${slugs.length} tag เกิน ${MAX_TAGS}`);
  if (new Set(slugs).size !== slugs.length) errs.push(`${symbol}: มี slug ซ้ำกันเอง`);
  for (const s of slugs) if (!vocab.bySlug.has(s)) errs.push(`${symbol}: slug "${s}" ไม่อยู่ในคลัง`);
  return errs;
}

const tagsOf = (symbol, tagData) => (tagData && tagData.tags && tagData.tags[symbol]) || [];

/** slug → รายชื่อหุ้น (เรียงชื่อ) */
function membersOf(tagData) {
  const m = new Map();
  for (const sym of Object.keys(tagData.tags).sort()) {
    for (const s of tagData.tags[sym]) { if (!m.has(s)) m.set(s, []); m.get(s).push(sym); }
  }
  return m;
}

/**
 * matchTagQuery — จับคู่คำค้นกับ tag
 * ★ ES5 ล้วน ไม่มี closure — build.js เอา String(matchTagQuery) ไปฝังในสคริปต์หน้า index
 *   ที่รันในเบราว์เซอร์ ⇒ ห้ามใช้ const/let/arrow/spread และห้ามอ้างตัวแปรนอกฟังก์ชัน
 * ละติน = ต้องขึ้นต้นคำ (กัน "ai" ไปแมตช์ Thailand/retail/chain)
 * ไทย    = substring (ภาษาไทยไม่มีเว้นวรรคระหว่างคำ — alias ไทยต้องเป็นคำเฉพาะพอ)
 */
function matchTagQuery(q, vocabList) {
  var s = String(q == null ? '' : q).toLowerCase().replace(/\s+/g, ' ').trim();
  if (s.length < 2) return [];
  var words = s.split(' '), out = [];
  for (var i = 0; i < vocabList.length; i++) {
    var e = vocabList[i];
    var hay = [String(e.label)].concat(e.aliases || []);
    var allOk = true;
    for (var w = 0; w < words.length; w++) {
      var needle = words[w], hit = false;
      for (var h = 0; h < hay.length && !hit; h++) {
        var t = String(hay[h]).toLowerCase();
        if (/[฀-๿]/.test(needle)) { if (t.indexOf(needle) !== -1) hit = true; }
        else {
          var at = t.indexOf(needle);
          while (at !== -1) {
            if (at === 0 || /[^a-z0-9]/.test(t.charAt(at - 1))) { hit = true; break; }
            at = t.indexOf(needle, at + 1);
          }
        }
      }
      if (!hit) { allOk = false; break; }
    }
    if (allOk) out.push(e.slug);
  }
  return out;
}

module.exports = {
  loadVocab, loadTags, validateVocab, validateAssignment, tagsOf, membersOf, matchTagQuery,
  VOCAB_FILE, TAGS_FILE, SLUG_RE, MAX_TAGS, MIN_MEMBERS,
};
