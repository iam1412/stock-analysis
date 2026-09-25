'use strict';
/**
 * report.js (migrate-v3) — เขียนผล sweep เป็น md + csv (Plan 4b Task 7) · ไม่มี I/O อื่น (caller ส่ง rows)
 * row = { symbol, market, bucket, reasons[], legs, fvLegs, textLost, numberValue, rdRows, proseStale|null, customCards,
 *         fNotes[], dRows[], items[{path, v2, v3}] , failed: string|null, capOnly: bool }
 * driftClass / maxDeltaPct (ruling 25 ก.ย. 69 · additive):
 *   items = แถว rd/sm ที่ไม่ใช่ gauge (gauge = F · plan D5) + D note ที่อ่านคู่ค่าได้ (FV a → b · scn.x.tgt a → b) + ป้าย prose-stale/prose-token/other
 *   แถว numberValue ของ equiv (เลขบนหน้าเปลี่ยน) = เงาของค่าต้นทาง ไม่ใช้จัดชั้น (นับในคอลัมน์ numberValue) — VALUE-DRIFT ที่มีแต่เงา = mixed
 *   Δ% = |v3 − v2| / |v2| × 100 · v2 = 0 และ v3 ≠ 0 → 100
 */
const fs = require('fs');
const path = require('path');

const COLS = ['symbol', 'market', 'bucket', 'reasons', 'legs', 'fvLegs', 'textLost', 'numberValue', 'rdRows', 'proseStale', 'customCards', 'fNotes', 'driftClass', 'maxDeltaPct'];
const CLASSES = ['gauge-only', 'fv-rounding', 'scn-tgt', 'index', 'prose-stale', 'mixed'];

const FV_PATHS = /^(fv|values\.fvLow|values\.fvHigh|sm\.fairValue|sm\.mos|sm\.upside|note:FV)$/;
const SCN_PATHS = /^(values\.scenarios\[\d+\]\.(tgt|div)|note:scn\.(bear|base|bull)\.(tgt|div))$/;
const IDX_PATHS = /^sm\.(pe|dividendYield)$/;

const deltaPct = (it) => {
  if (typeof it.v2 !== 'number' || typeof it.v3 !== 'number') return null;
  if (it.v2 === 0) return it.v3 === 0 ? 0 : 100;
  return Math.abs(it.v3 - it.v2) / Math.abs(it.v2) * 100;
};
function maxDeltaPct(items) {
  let m = 0;
  for (const it of items || []) { const d = deltaPct(it); if (d != null && d > m) m = d; }
  return Math.round(m * 100) / 100;
}
/** กลุ่มของแถวในใบ (ตาราง mixed) — แยก prose-token ออกจาก other ให้เห็นชัด */
const groupsOf = (row) => {
  const g = new Set((row.items || []).map((it) => (it.path === 'note:prose-token' ? 'prose-token' : groupOf(it.path))));
  if (!g.size) g.add('echo');
  return ['fv', 'scn', 'index', 'stale', 'prose-token', 'other', 'echo'].filter((x) => g.has(x));
};
const groupOf = (p) => (FV_PATHS.test(p) ? 'fv' : SCN_PATHS.test(p) ? 'scn' : IDX_PATHS.test(p) ? 'index' : p === 'note:prose-stale' ? 'stale' : 'other');
/** '' สำหรับ CLEAN/HUMAN · VALUE-DRIFT → หนึ่งใน CLASSES */
function driftClass(row) {
  if (row.bucket !== 'VALUE-DRIFT') return '';
  const items = row.items || [];
  if (!items.length) return (row.numberValue || 0) > 0 ? 'mixed' : 'gauge-only';
  const groups = new Set(items.map((it) => groupOf(it.path)));
  if (groups.size !== 1 || groups.has('other')) return 'mixed';
  if (items.some((it) => { const d = deltaPct(it); return d != null && d > 1; })) return 'mixed';
  return { fv: 'fv-rounding', scn: 'scn-tgt', index: 'index', stale: 'prose-stale' }[[...groups][0]];
}

/** D note → item {path, v2, v3} (คู่ค่าเมื่ออ่านได้) */
function noteItem(d) {
  let m;
  if ((m = /^scn\.(bear|base|bull)\.(tgt|div) (-?[\d.]+) → (-?[\d.]+)/.exec(d))) return { path: `note:scn.${m[1]}.${m[2]}`, v2: +m[3], v3: +m[4] };
  if ((m = /^FV (-?[\d.]+) → (-?[\d.]+)/.exec(d))) return { path: 'note:FV', v2: +m[1], v3: +m[2] };
  if (/^prose stale copies ×\d+/.test(d)) return { path: 'note:prose-stale' };
  if (/^prose:/.test(d)) return { path: 'note:prose-token' };
  return { path: 'note:other' };
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// reasons: คอมมาในเหตุผล → ';' แล้วครอบ "…" เสมอ ⇒ awk -F, นับคอลัมน์หลัง reasons ได้ตรงตำแหน่ง
const reasonsCell = (rs) => `"${(rs || []).join(' | ').replace(/\s+/g, ' ').replace(/,/g, ';').replace(/"/g, '""')}"`;

function csvOf(rows) {
  const lines = [COLS.join(',')];
  for (const r of rows) {
    lines.push([r.symbol, r.market, r.bucket, reasonsCell(r.reasons), r.legs, r.fvLegs, r.textLost, r.numberValue, r.rdRows,
      r.proseStale == null ? '' : r.proseStale, r.customCards, (r.fNotes || []).length, driftClass(r), maxDeltaPct(r.items)]
      .map((v, i) => (i === 3 ? v : csvCell(v))).join(','));
  }
  return lines.join('\n') + '\n';
}

const mdCell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
/** เหตุผล → "ชนิด" (ตัดข้อความในเครื่องหมายคำพูด/ตัวเลข) สำหรับฮิสโตแกรม */
const kindOf = (r) => String(r).replace(/^TEXT LOST ×\d+:.*$/, 'TEXT LOST').replace(/"[^"]*"/g, '"…"').replace(/"…"(?:, "…")+/g, '"…"').replace(/\([^)]*\)/g, '(…)')
  .replace(/-?\d[\d.,]*/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);

function hist(list) { const m = new Map(); for (const k of list) m.set(k, (m.get(k) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)); }

function mdOf(rows, o) {
  const by = (b) => rows.filter((r) => r.bucket === b);
  const H = by('HUMAN'), V = by('VALUE-DRIFT'), CL = by('CLEAN'), failed = rows.filter((r) => r.failed);
  const cls = hist(V.map(driftClass));
  const L = [];
  L.push(`# v3 migration sweep — ${o.date}`, '');
  L.push(`อ่านอย่างเดียว (read-only) · HEAD \`${o.head || '?'}\` · ${rows.length} ใบ v2 · สร้างโดย \`tools/migrate-v3.js sweep\` (Plan 4b Task 7) · ถัง HUMAN > VALUE-DRIFT > CLEAN (plan D5 · \`tools/migrate-v3/buckets.js\`)`, '');
  L.push('## Summary', '');
  L.push('| bucket | ใบ |', '|---|---|');
  L.push(`| CLEAN | ${CL.length} |`, `| VALUE-DRIFT | ${V.length} |`, `| HUMAN | ${H.length} |`, `| (of HUMAN) failed compute/render before compare | ${failed.length} |`, `| **total** | **${rows.length}** |`, '');
  L.push(`TEXT LOST ใน CLEAN: ${CL.filter((r) => r.textLost > 0).length}`, '');
  L.push(`VALUE-DRIFT per driftClass: ${CLASSES.map((c) => `${c} ${V.filter((r) => driftClass(r) === c).length}`).join(' · ')}`, '');
  const mixedSmall = V.filter((r) => driftClass(r) === 'mixed' && maxDeltaPct(r.items) <= 1).length;
  L.push(`(ของ mixed: ${mixedSmall} ใบมี maxDeltaPct ≤ 1% — mixed เพราะมีหลายกลุ่ม fv/scn/index หรือ prose-token/numberValue ไม่ใช่เพราะค่าห่าง)`, '');
  const mixed = V.filter((r) => driftClass(r) === 'mixed');
  if (mixed.length) {
    L.push('mixed แยกตามกลุ่มของแถว (fv · scn · index · stale · prose-token · other · echo = มีแต่ numberValue):', '');
    L.push('| groups | ใบ | maxDeltaPct ≤ 1% |', '|---|---|---|');
    const key = (r) => groupsOf(r).join('+');
    for (const [k, n] of hist(mixed.map(key))) L.push(`| ${k} | ${n} | ${mixed.filter((r) => key(r) === k && maxDeltaPct(r.items) <= 1).length} |`);
    L.push('');
  }
  const mk = hist(rows.map((r) => r.market));
  L.push(`ตลาด: ${mk.map(([k, n]) => `${k} ${n}`).join(' · ')}`, '');
  if (o.noStale) L.push('> ⚠️ รันด้วย `--no-stale` — ไม่ได้หา analysis-px จาก git ⇒ ไม่มี D note `prose stale copies` (คอลัมน์ proseStale ว่าง) · ใบที่มีแต่ stale copy อาจอยู่ใน CLEAN แทน VALUE-DRIFT', '');
  else L.push(`analysis-px: หาได้ ${o.apxFound == null ? '?' : o.apxFound}/${rows.length} ใบ${o.apxMs != null ? ` · ${(o.apxMs / 1000).toFixed(1)} s` : ''} · ใบที่ footer ถูกเขียนใหม่เป็นชุด (6d4fd7ada ค.ศ.→พ.ศ.) ได้ราคา ณ commit ชุดนั้น: ${o.apxBulk == null ? '?' : o.apxBulk} ใบ`, '');
  L.push('คอลัมน์ csv: `' + COLS.join(',') + '` · reasons ครอบ "…" และคอมมาข้างในเป็น `;` · driftClass/maxDeltaPct คำนวณจากแถว rd/sm ที่ไม่ใช่ gauge + D note ที่มีคู่ค่า (numberValue = เงาบนหน้า ไม่ใช้จัดชั้น · VALUE-DRIFT ที่มีแต่เงา = mixed) · Δ% = |v3−v2|/|v2|×100 (v2=0 → 100)', '');

  L.push('## HUMAN', '');
  L.push('| symbol | market | reasons |', '|---|---|---|');
  for (const r of H) L.push(`| ${r.symbol} | ${r.market} | ${mdCell(r.reasons.filter((x) => !/^D: /.test(x)).join(' ; ') || r.reasons.join(' ; '))} |`);
  L.push('');
  L.push('## VALUE-DRIFT', '');
  L.push('| symbol | market | driftClass | maxDeltaPct | D rows |', '|---|---|---|---|---|');
  for (const r of V) L.push(`| ${r.symbol} | ${r.market} | ${driftClass(r)} | ${maxDeltaPct(r.items)} | ${mdCell(r.reasons.join(' ; '))} |`);
  L.push('');
  L.push('## CLEAN', '');
  for (const [m] of mk) { const s = CL.filter((r) => r.market === m).map((r) => r.symbol); if (s.length) L.push(`- **${m}** (${s.length}): ${s.join(' ')}`); }
  if (!CL.length) L.push('- (none)');
  L.push('');
  L.push('## F-note histogram', '');
  L.push('| F note (kind) | ใบ |', '|---|---|');
  for (const [k, n] of hist(rows.flatMap((r) => [...new Set((r.fNotes || []).map(kindOf))]))) L.push(`| ${mdCell(k)} | ${n} |`);
  L.push('');
  L.push('## Top-10 HUMAN reasons', '');
  L.push('| reason (kind) | ใบ |', '|---|---|');
  for (const [k, n] of hist(H.flatMap((r) => [...new Set(r.reasons.filter((x) => !/^D: /.test(x)).map(kindOf))])).slice(0, 10)) L.push(`| ${mdCell(k)} | ${n} |`);
  L.push('');
  L.push('## Known open questions for the owner before 4c', '');
  const capAll = H.filter((r) => r.reasons.some((x) => /^custom cards \d+ > 4/.test(x))).length;
  const capOnly = H.filter((r) => r.capOnly).length;
  L.push(`1. **custom-card cap 4** — ${capAll} ใบ HUMAN มีเหตุ \`custom cards N > 4\` · ${capOnly} ใบ HUMAN ด้วยเหตุนี้อย่างเดียว (H note อื่นไม่มี และ TEXT LOST ทุกคำมาจากการ์ดที่ถูกตัด) — ยกเพดานหรือให้คนเลือกการ์ด?`);
  L.push(`2. **นโยบายแบตช์ 4c สำหรับ VALUE-DRIFT ${V.length} ใบ** — แยกตาม driftClass ข้างบน (ruling เดิม: decisions §10 + PR body เป็นของเจ้าของ) · \`--accept-drift\` รายใบหรือรายชั้น?`);
  const li = (k) => H.filter((r) => r.lostIn && r.lostIn[k]).map((r) => r.symbol);
  const lst = (a) => `${a.length} ใบ${a.length ? ` (${a.slice(0, 20).join(' ')}${a.length > 20 ? ' …' : ''})` : ''}`;
  L.push(`3. **gdots author words** — คำที่ผู้เขียนพิมพ์ในจุด gdots ของ header ไม่มีที่ใน v3 ⇒ TEXT LOST (header) = HUMAN · ${lst(li('gdots'))}`);
  L.push(`4. **s8 third vcell** — ช่อง vcell ที่ 3+ ของ verdict (หมวด 8) ไม่มีที่ใน v3 ⇒ HUMAN · ${lst(li('vcell3'))}`);
  L.push(`5. **legend annotations** — คำเพิ่มใน legend กราฟหมวด 2 นอกป้าย skeleton ⇒ TEXT LOST = HUMAN · ${lst(li('legend'))}`);
  L.push('', '(ข้อ 3–5 นับใบ HUMAN ที่คำ TEXT LOST อย่างน้อยหนึ่งคำอยู่ในโซนนั้นของ v2 — ใบเดียวอาจอยู่หลายข้อ และอาจมีเหตุ HUMAN อื่นด้วย)');
  L.push('');
  L.push('## How to regenerate', '');
  L.push(`\`node tools/migrate-v3.js sweep${o.noStale ? ' --no-stale' : ''} --out ${o.outRel || 'docs/superpowers/specs/<date>-v3-migration-sweep'}\` (read-only · ~12 s + analysis-px เว้นแต่ \`--no-stale\`)`, '');
  return L.join('\n');
}

/** เขียน <out>.md + <out>.csv · คืน { md, csv } (path) */
function writeSweep(rows, o) {
  const md = o.out + '.md', csv = o.out + '.csv';
  fs.mkdirSync(path.dirname(md), { recursive: true });
  fs.writeFileSync(csv, csvOf(rows));
  fs.writeFileSync(md, mdOf(rows, o));
  return { md, csv };
}

module.exports = { writeSweep, csvOf, mdOf, driftClass, maxDeltaPct, noteItem, kindOf, COLS, CLASSES };
