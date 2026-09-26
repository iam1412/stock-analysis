'use strict';
/**
 * fix-gauge.js (display-fix2 · controller 26 ก.ย. 69) — ใบ migrate ที่ v2Display.gauge แช่ค่าตลาดเป็นข้อความ (ราคา · สูงสุด/ต่ำสุด 52 สัปดาห์)
 *   → ref สด (px · hi52w/lo52w จาก market.range52w) · ป้ายของผู้เขียนคงเดิม · ส่วนอื่นของใบไม่แตะ
 *   schema ปฏิเสธช่องแบบนั้นแล้ว (S.MARKET_TICK_RE) ⇒ ใบเหล่านี้ compute/build/cron ไม่ผ่านจนกว่าจะแก้ — คำสั่งนี้คือการแก้ขั้นต่ำ
 *   meta.migratedFrom.prevHash = freshHash ของใบเดิม ⇒ build คง `updated` (build.updatedFor) · เขียนผ่าน IO.write (ลงนาม)
 *   ไม่มี market.range52w แต่ช่องเป็น 52 สัปดาห์ = ถอดช่องนั้นทิ้ง (สเกลเหลือ < 2 ช่อง = ถอดสเกลของผู้เขียน — ใช้สเกลของ template)
 * อ่านอย่างเดียวเมื่อไม่ --write
 */
const fs = require('fs');
const path = require('path');
const S = require('../v3/schema.js');
const IO = require('../v3/io.js');

const isMarket = (t) => t && t.text != null && (S.MARKET_TICK_RE.test(String(t.label || '')) || S.MARKET_TICK_RE.test(String(t.text).replace(/[0-9][0-9,]*(?:\.[0-9]+)?/g, '')));
const refOf = (t) => {
  const lab = `${t.label || ''} ${t.text}`;
  const low = /ต่ำสุด|ต่ำ|\blow\b|ล่าง/i.test(lab), is52 = /52|สัปดาห์|week|wk|ATH|all[- ]?time|สูงสุด|\bhigh\b|บน/i.test(lab);
  return is52 ? (low ? 'lo52w' : 'hi52w') : 'px';
};

/** doc → { doc: ใบที่แก้ | null (ไม่มีอะไรต้องแก้), changes: [ข้อความ] } */
function fixDoc(doc) {
  const g = doc && doc.v2Display && doc.v2Display.gauge;
  if (!Array.isArray(g) || !g.some(isMarket)) return { doc: null, changes: [] };
  const r52 = doc.market && doc.market.range52w;
  const changes = [];
  let gauge = g.map((t, i) => {
    if (!isMarket(t)) return t;
    const ref = refOf(t);
    if (ref !== 'px' && !r52) { changes.push(`v2Display.gauge[${i}] ${JSON.stringify(t)} → removed (no market.range52w)`); return null; }
    changes.push(`v2Display.gauge[${i}] ${JSON.stringify(t)} → ${JSON.stringify({ ref, label: t.label })}`);
    return { ref, label: t.label };
  }).filter(Boolean);
  const { _sig, ...rest } = doc;
  const v2Display = { ...rest.v2Display };
  if (gauge.length >= 2) v2Display.gauge = gauge; else { delete v2Display.gauge; changes.push('v2Display.gauge → removed (fewer than 2 ticks left — template scale)'); gauge = null; }
  const mf = rest.meta && rest.meta.migratedFrom;
  const meta = mf ? { ...rest.meta, migratedFrom: { ...mf, prevHash: IO.freshHash(doc) } } : rest.meta;
  const out = { ...rest, meta, v2Display };
  if (!Object.keys(v2Display).length) delete out.v2Display;
  return { doc: out, changes };
}

/** CLI — syms ว่าง = ทุกใบใน reportsDir · คืน exit code (1 = มีใบที่แก้แล้วยังไม่ผ่านสคีมา) */
function runFixGauge(syms, opts, log, env) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  if (opts.write && env.isGuarded(opts.reportsDir) && process.env.MIGRATE_V3_ALLOW_REAL !== '1') {
    say('✗ fix-gauge --write ใส่ reports/ จริงถูกปฏิเสธ — ต้องตั้ง MIGRATE_V3_ALLOW_REAL=1 (เหมือน convert/adopt/remigrate)');
    return 1;
  }
  const list = syms.length ? syms.map((s) => String(s).toUpperCase()) : fs.readdirSync(opts.reportsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  let n = 0, bad = 0;
  for (const sym of list) {
    const file = path.join(opts.reportsDir, sym + '.json');
    if (!fs.existsSync(file)) { say(`SKIP ${sym} · ไม่มี ${sym}.json`); continue; }
    const doc = IO.read(file);
    const r = fixDoc(doc);
    if (!r.doc) continue;
    n++;
    const errs = S.validate(r.doc);
    if (errs.length) { bad++; say(`✗ ${sym} · ยังไม่ผ่านสคีมาหลังแก้: ${errs.slice(0, 3).map((e) => `${e.path}: ${e.msg}`).join(' ; ')}`); continue; }
    if (opts.write) IO.write(file, r.doc);
    say(`${opts.write ? 'FIXED' : 'WOULD FIX'} ${sym}`);
    for (const c of r.changes) say(`  ${c}`);
  }
  say(`fix-gauge: ${n} ใบมีช่องค่าตลาด${bad ? ` · ${bad} ใบยังไม่ผ่านสคีมา` : ''}${opts.write ? '' : ' · dry-run (ใส่ --write)'}`);
  return bad ? 1 : 0;
}

module.exports = { fixDoc, runFixGauge, isMarket, refOf };
