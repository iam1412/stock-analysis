'use strict';
/**
 * io.js — ผู้เขียนไฟล์รายงาน v3 "คนเดียว" (report.js save → write · cron → writeMarket — ผ่านที่นี่เท่านั้น)
 * _sig = sha256(canonical JSON ไม่รวม _sig) — ไม่ใช่ความปลอดภัยเชิง crypto แต่เป็นเครื่องบอกว่า "ไฟล์นี้ไม่ได้ผ่าน io.js"
 *   (แก้มือทางไหนก็ตาม — Edit tool หลุด hook, sed, editor — gate E50 จับได้ใน Plan 2)
 * freshHash = ฐานของ reports.json.updated: ไม่นับ market (cron) · _sig · meta.aiModel ⇒ cron เขียนราคาทุกวันแต่ "อัปเดต" ไม่ขยับ
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('./schema.js');
const LK = require('../lockfile.js');

const TOP_ORDER = ['v', 'symbol', 'currency', 'region', 'dateEra', 'meta', 'market', 'fundamentals', 'legs', 'fvWeights',
  'metrics', 'scenarios', 'analyst', 'prose', 'text', 'catalysts', 'risks', 'extras', '_sig'];

function canonical(x) {
  if (Array.isArray(x)) return '[' + x.map((v) => (v === undefined ? 'null' : canonical(v))).join(',') + ']';
  if (x && typeof x === 'object')
    return '{' + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function sign(doc) { const { _sig, ...rest } = doc; return 'sha256:' + sha(canonical(rest)); }
const verifySig = (doc) => typeof doc._sig === 'string' && doc._sig === sign(doc);
function freshHash(doc) {
  const { _sig, market, ...rest } = doc;
  const meta = { ...(rest.meta || {}) }; delete meta.aiModel;
  return sha('v3:' + canonical({ ...rest, meta })).slice(0, 12);
}
/** #67 (Plan 4c-prep · spec §3.7 ฉ): hash ของ ship --prepatch — เหมือน freshHash แต่ **นับ** meta.aiModel
 *  freshHash (ฐานของ updated) ยังไม่นับ aiModel — แก้ป้ายรุ่นอย่างเดียวต้องไม่ขยับ updated แต่ต้องไม่หลุดเข้า commit "price:" */
function prepatchHash(doc) {
  const { _sig, market, ...rest } = doc;
  return sha('v3pp:' + canonical(rest)).slice(0, 12);
}
function serialize(doc) {
  const ordered = {};
  for (const k of TOP_ORDER) if (k in doc) ordered[k] = doc[k];
  for (const k of Object.keys(doc)) if (!(k in ordered)) ordered[k] = doc[k];   // validate() จะปฏิเสธอยู่แล้ว — ไม่ทิ้งข้อมูลเงียบ
  return JSON.stringify(ordered, null, 2) + '\n';
}
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, doc) {
  const errs = S.validate(doc);
  if (errs.length) throw new Error(`${path.basename(file)}: สคีมาไม่ผ่าน\n` + errs.map((e) => `  ${e.path}: ${e.msg}`).join('\n'));
  const signed = { ...doc, _sig: sign(doc) };
  LK.withLock(file, () => LK.writeJsonAtomic(file, serialize(signed)));
  return signed;
}

/** ผู้เขียนของ cron (spec §7 · Plan 3 R1): แทน `market` อย่างเดียวบนไฟล์ที่อยู่บนดิสก์ ภายใต้ lock เดียว (อ่าน-แก้-เขียนไม่มีช่องให้ writer อื่นแทรก)
 *  ลำดับ: อ่าน → verifySig ของไฟล์เดิม (ไม่ผ่าน = E50 — cron ไม่เซ็นทับงานแก้มือ) → next = {…เดิม, market} → checkDoc (gate ตัวเดียวกับ verify)
 *        → sign → writeJsonAtomic · gate ตก = throw (err.codes) ไม่เขียน
 *  opts: { seeds (ต้องมี — compute ใช้สีแบรนด์), today (ISO · ไม่ใส่ = นาฬิกาไทยของ checkDoc), force }
 *  force: เขียนต่อได้เมื่อ error ไม่มี E50/E51 (สคีมา/ลายเซ็นไม่มีวัน force — R6) · คืน { doc (ฉบับที่เขียน มี _sig), errors, warnings }
 *  ★ require test/check-v3.js แบบ lazy: check-v3 → check-reports → update-prices → (io.js) = cycle ตอนโหลด
 *  ★ ไม่มีฟิลด์ provenance/`{by}` (R1) — ทุกช่องนอก market deep-equal ⇒ freshHash เท่าเดิม ⇒ reports.json `updated` ไม่ขยับ (§8) */
function writeMarket(file, market, opts) {
  const o = opts || {};
  const name = path.basename(file);
  const fail = (codes, msg) => Object.assign(new Error(`${name}: ${msg}`), { codes });
  return LK.withLock(file, () => {
    const cur = read(file);
    if (!verifySig(cur)) throw fail(['E50'], 'E50 ลายเซ็นไม่ตรงเนื้อไฟล์ — ไฟล์ถูกแก้นอก io.js · cron ไม่เซ็นทับ (แก้ด้วย report.js export → save)');
    const { _sig, ...rest } = cur;
    const next = { ...rest, market };
    const signed = { ...next, _sig: sign(next) };
    const { checkDoc } = require('../../test/check-v3.js');
    const g = checkDoc(signed, { seeds: o.seeds, today: o.today });
    const codes = [...new Set(g.errors.map((e) => e.id))];
    if (codes.length && (!o.force || codes.some((c) => c === 'E50' || c === 'E51')))
      throw fail(codes, `gate ไม่ผ่าน ${codes.join(',')} — ไม่เขียน · ${g.errors.map((e) => `${e.id} ${e.msg}`).join(' ; ').slice(0, 400)}`);
    LK.writeJsonAtomic(file, serialize(signed));
    return { doc: signed, errors: g.errors, warnings: g.warnings };
  });
}

module.exports = { canonical, sign, verifySig, freshHash, prepatchHash, serialize, read, write, writeMarket, TOP_ORDER };
