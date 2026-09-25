'use strict';
/**
 * batch.js — ตัวรันแบตช์ของ Plan 4c (spec §3.7 ฉ · §13-1 · plan 4c-prep D6)
 *  ตารางที่ advisor อนุมัติ = csv รูปเดียวกับ sweep (RP.COLS) · migrate ใหม่ตอนแบตช์ (cron patch v2 ทุกวัน — bucket เลื่อนได้)
 *  ★ ใบที่ bucket/driftClass ใหม่ ≠ แถวที่อนุมัติ = ปฏิเสธ ไม่เขียนอะไร · CLEAN ≤50 ใบ/commit · VALUE-DRIFT 1 ใบ/commit
 *  ★ convert → build ทันที (spec §8 runbook) → ship --migrate --no-push (skipVerify) → verify ครั้งเดียว + push ทุก N commit
 *  ส่วนบริสุทธิ์ (readTable/selectRows/commitGroups/freshMismatch) + ตัวรันที่รับ deps (เทสต์จำลอง git/ship ได้)
 */
const RP = require('./report.js');
const CLEAN_CHUNK = 50;

/** csv ของ sweep → แถว { symbol, market, bucket, driftClass } · reasons อยู่ใน "…" เสมอ (report.js reasonsCell) */
function readTable(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || lines[0] !== RP.COLS.join(',')) throw new Error(`batch: หัวตารางต้องเป็นคอลัมน์ของ sweep csv (${RP.COLS.join(',')})`);
  return lines.slice(1).map((l, i) => {
    const m = /^([^,]+),([^,]*),([A-Z-]+),"(?:[^"]|"")*",(.*)$/.exec(l);
    if (!m) throw new Error(`batch: แถว ${i + 2} อ่านไม่ได้ — ${l.slice(0, 60)}`);
    const rest = m[4].split(',');
    return { symbol: m[1].toUpperCase(), market: m[2], bucket: m[3], driftClass: rest[8] || '' };
  });
}
function selectRows(rows, classes) {
  const want = new Set(classes), picked = [], skipped = [];
  for (const r of rows) {
    if (r.bucket === 'HUMAN') skipped.push({ symbol: r.symbol, why: 'HUMAN — not batchable' });
    else if (r.bucket === 'CLEAN' ? want.has('CLEAN') : want.has(r.driftClass)) picked.push(r);
    else skipped.push({ symbol: r.symbol, why: `${r.bucket}${r.driftClass ? '/' + r.driftClass : ''} ไม่อยู่ใน --class` });
  }
  return { picked, skipped };
}
function commitGroups(picked) {
  const clean = picked.filter((r) => r.bucket === 'CLEAN'), drift = picked.filter((r) => r.bucket !== 'CLEAN'), out = [];
  for (let i = 0; i < clean.length; i += CLEAN_CHUNK) out.push(clean.slice(i, i + CLEAN_CHUNK));
  for (const r of drift) out.push([r]);
  return out;
}
const tag = (b, c) => `${b}${c ? '/' + c : ''}`;
function freshMismatch(row, fresh) {
  if (fresh.bucket === row.bucket && (fresh.driftClass || '') === (row.driftClass || '')) return null;
  return `${row.symbol}: migrate ใหม่ได้ ${tag(fresh.bucket, fresh.driftClass)} ≠ ตาราง ${tag(row.bucket, row.driftClass)} — ข้าม (ให้ advisor อนุมัติแถวใหม่)`;
}
/** opts = { classes, n, model, noPush, dryRun } · deps = { fresh, convert, build, ship, verify, push, log } */
function runBatch(rows, opts, deps) {
  const { picked } = selectRows(rows, opts.classes);
  const refused = [], commits = []; let pushes = 0, sincePush = 0;
  const pushPoint = () => { deps.verify(); if (!opts.noPush) { deps.push(); pushes++; } sincePush = 0; };
  for (const group of commitGroups(picked)) {
    const ok = [];
    for (const r of group) {
      const why = freshMismatch(r, deps.fresh(r.symbol));
      if (why) { refused.push(why); deps.log(`✗ ${why}`); continue; }
      if (opts.dryRun) { ok.push(r.symbol); continue; }
      const code = deps.convert(r.symbol, r.bucket === 'VALUE-DRIFT');
      if (code !== 0) { refused.push(`${r.symbol}: convert exit ${code}`); deps.log(`✗ ${r.symbol}: convert exit ${code}`); continue; }
      ok.push(r.symbol);
    }
    if (!ok.length) continue;
    commits.push(ok);
    if (opts.dryRun) { deps.log(`plan: migrate: v3 ${ok.join(' ')}`); continue; }
    deps.build(); deps.ship(ok); sincePush++;
    if (sincePush >= opts.n) pushPoint();
  }
  if (!opts.dryRun && sincePush > 0) pushPoint();
  deps.log(`plan: ${commits.length} commit · ${commits.flat().length} ใบ · ปฏิเสธ ${refused.length}${opts.dryRun ? ' (dry-run — ไม่เขียน)' : ` · push ${pushes}`}`);
  return { commits, refused, pushes, code: refused.length ? 3 : 0 };
}
module.exports = { readTable, selectRows, commitGroups, freshMismatch, runBatch, CLEAN_CHUNK };
