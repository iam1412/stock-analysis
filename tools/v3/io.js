'use strict';
/**
 * io.js — ผู้เขียนไฟล์รายงาน v3 "คนเดียว" (report.js save + cron เรียกผ่านที่นี่เท่านั้น)
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
  'metrics', 'scenarios', 'analyst', 'prose', 'catalysts', 'risks', 'extras', '_sig'];

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

module.exports = { canonical, sign, verifySig, freshHash, serialize, read, write, TOP_ORDER };
