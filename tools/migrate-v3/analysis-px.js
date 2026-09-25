'use strict';
/**
 * analysis-px.js — ราคา/P/E/MOS/upside "ณ วันวิเคราะห์" ของใบ v2 (Plan 4b Task 7 · spec §10.1 PROSE-LIT a)
 * วันวิเคราะห์ = commit แรกที่นำสตริง footer "ข้อมูล ณ …" ปัจจุบันเข้ามา → อ่าน stock-meta ของไฟล์ ณ commit นั้น
 * Runtime pin (advisor): `git log --reverse --format=%H --diff-filter=AM -S <raw> -- reports/<SYM>.html` แถวแรก (เก่าสุด)
 * อ่านอย่างเดียว (git log/show) · memo ต่อ run (Map) · ไม่พบ/อ่านไม่ได้ = null (staleCopies ข้ามเงียบ — caller นับเอง)
 * ต้นทาง: prototype Plan 4 Task 0 (proto/analysis-px.js) — ตัดการเขียนไฟล์ออก เหลือฟังก์ชันต่อหุ้น
 * ★ ข้อจำกัดที่วัดแล้ว: ใบที่ footer ถูกเขียนใหม่เป็นชุด (6d4fd7ada ค.ศ.→พ.ศ. 22 ก.ย. 69) ได้ราคา ณ commit ชุดนั้น ไม่ใช่วันวิเคราะห์จริง
 */
const cp = require('child_process');
const path = require('path');
const RM = require('../report-meta.js');

const ROOT = path.join(__dirname, '..', '..');
const cache = new Map();

function git(args, root) {
  return cp.execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
}

/** { px, pe, mos, upside, commit } | null — footerRaw = FD.footerDate(html).raw */
function analysisPx(sym, footerRaw, opts) {
  const o = opts || {};
  if (o.noStale || !footerRaw) return null;
  const root = o.root || ROOT;
  const key = `${root}\0${sym}\0${footerRaw}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    const rel = `reports/${sym}.html`;
    const h = git(['log', '--reverse', '--format=%H', '--diff-filter=AM', '-S', footerRaw, '--', rel], root).split('\n').find(Boolean);
    if (h) {
      const sm = RM.readStockMeta(git(['show', `${h}:${rel}`], root));
      if (sm) out = { px: num(sm.price), pe: num(sm.pe), mos: num(sm.mos), upside: num(sm.upside), commit: h.slice(0, 10) };
    }
  } catch (e) { out = null; }
  cache.set(key, out);
  return out;
}
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

// commit ชุดที่เขียน footer ใหม่ทั้งคลัง (ค.ศ.→พ.ศ. 22 ก.ย. 69) — sweep นับใบที่ analysis-px ตกที่ commit นี้ (ค่าที่วัดแล้ว ไม่ใช่กติกา)
const BULK_FOOTER_COMMIT = '6d4fd7ada';

module.exports = { analysisPx, BULK_FOOTER_COMMIT, _cache: cache };
