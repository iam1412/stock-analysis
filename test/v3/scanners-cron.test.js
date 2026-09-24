'use strict';
// Plan 2b Task 4 — เครื่องมือ cron-adjacent/misc อ่านใบ v3 (reports/<SYM>.json) ผ่าน tools/report-source.js
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามสร้างไฟล์ใต้ reports/ จริง (tripwire no-json-reports)
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const t = require('./_t.js')('scanners-cron');
const RS = require('../../tools/report-source.js');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, '..', 'fixtures');
const V3SRC = path.join(FIX, 'v3', 'ZTS-real.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-scan-cron-'));
fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'AAPL.html'));
fs.copyFileSync(V3SRC, path.join(tmp, 'ZTS.json'));
try {
  // update-prices — ราคาใบ v3 แช่แข็งจน P5 แต่ห้ามเงียบ (#62)
  const U = require('../../tools/update-prices.js');
  const isV3 = (s) => RS.kindOf(s, tmp) === 'v3';
  const msg = U.v3Refusal(new Set(['AAPL', 'ZTS']), isV3) || '';
  t(/ZTS/.test(msg) && !/AAPL/.test(msg) && /v3 cron = Plan 3/.test(msg) && /#62/.test(msg), 'update-prices: explicit v3 symbol → refusal naming it (v3 cron = Plan 3 · #62)');
  t.eq(U.v3Refusal(new Set(['AAPL']), isV3), null, 'update-prices: v2 symbol → no refusal');
  t.eq(U.v3Refusal(new Set(), isV3), null, 'update-prices: sweep (no symbols) → no refusal (R11)');
  // R11 / binding ruling 2 — ห้ามเงียบ: sweep พิมพ์บรรทัดต่อใบ + สรุปจำนวน · สั่ง symbol v3 ตรง ๆ = exit 1 (ทางเดียวกับ main)
  const v3s = RS.list(tmp).filter((e) => e.v3).map((e) => e.symbol);
  const note = U.v3SweepNotice(v3s);
  t(note.length === v3s.length + 1 && note.slice(0, -1).every((l, i) => l.includes(`reports/${v3s[i]}.json`)) && /(^|\s)v3-skipped: 1(\s|$)/.test(note[note.length - 1]) && /v3 cron = Plan 3/.test(note[note.length - 1]),
    'update-prices sweep: one line per skipped v3 file + one summary count line', JSON.stringify(note));
  t.eq(U.v3SweepNotice([]), [], 'update-prices sweep: no v3 files → no lines');
  t.eq([...U.onlyFromArgv(['--write', '--force', 'zts.json', 'aapl.html', 'KBANK'])], ['ZTS', 'AAPL', 'KBANK'], 'onlyFromArgv: flags dropped, .json/.html stripped, upper-case');
  { const g = U.v3Guard(U.onlyFromArgv(['--write', '--force', 'ZTS']), isV3, v3s);
    t(g.code === 1 && g.lines.length === 1 && /ZTS/.test(g.lines[0]) && /v3 cron = Plan 3/.test(g.lines[0]), '--write --force <v3 SYM> → code 1 "v3 cron = Plan 3" (before any fetch)'); }
  t.eq(U.v3Guard(U.onlyFromArgv(['--heal-derived', 'zts.json']), isV3, v3s).code, 1, '--heal-derived <v3>.json → code 1 (same guard)');
  { const g = U.v3Guard(U.onlyFromArgv(['--write']), isV3, v3s); t(g.code === 0 && g.lines.length === 2, 'no-arg sweep → code 0 + notice lines (visible in the cron log)'); }
  t.eq(U.v3Guard(U.onlyFromArgv(['--write', '--force', 'AAPL']), isV3, v3s), { code: 0, lines: [] }, 'explicit v2 symbol → untouched (no lines)');
  t(RS.symbols(tmp).has('ZTS'), 'reportExists = RS.symbols keeps flags of v3 reports');
  // preserve-dates — ใบ v3 ไม่มี <footer> ⇒ ต้องข้าม ไม่งั้น UPDATE ของใบ v3 ถูกคืนวันเก่าเสมอ
  const PDt = require('../../tools/preserve-dates.js');
  const cur = [{ symbol: 'AAPL', updated: '2026-09-24T01:00:00+07:00' }, { symbol: 'ZTS', updated: '2026-09-24T01:00:00+07:00' }];
  const n = PDt.restoreDates(cur, { AAPL: '2026-09-01T00:00:00+07:00', ZTS: '2026-09-02T00:00:00+07:00' }, new Set(['ZTS']));
  const by = Object.fromEntries(cur.map((r) => [r.symbol, r.updated]));
  t(n === 1 && by.AAPL === '2026-09-01T00:00:00+07:00' && by.ZTS === '2026-09-24T01:00:00+07:00', 'preserve-dates: v3 symbol skipped, v2 restored as before');
  t.eq(cur.map((r) => r.symbol), ['ZTS', 'AAPL'], 'preserve-dates: re-sorted like build (newest first)');
  // dead-ticker canary — ใบ v3 ต้องถูก probe ด้วย
  const DC = require('../../tools/dead-ticker-canary.js');
  const pl = DC.probeList(['AAPL', 'ZTS', 'NOPE'], (s) => RS.metaLite(s, tmp), new Set(), {});
  t.eq(pl.probes.map((p) => [p.symbol, p.currency, p.reportPrice]), [['AAPL', 'USD', 326.57], ['ZTS', 'USD', 71.33]], 'canary: v3 ticker probed with currency/price from JSON');
  t.eq(pl.skipped, ['NOPE'], 'canary: no meta → skipped (as before)');
  t.eq(DC.probeList(['AAPL', 'ZTS'], (s) => RS.metaLite(s, tmp), new Set(['ZTS']), {}).probes.map((p) => p.symbol), ['ZTS'], 'canary: ONLY filter');
  // earnings-calendar — ใบ v3 ได้แถวปฏิทิน (ไม่งั้น statementAfter = null → FULL เสมอ)
  const EC = require('../../tools/earnings-calendar.js');
  t.eq(EC.reportSymbols(tmp).map((r) => r[0]), ['AAPL', 'ZTS'], 'earnings-calendar: v3 symbol listed');
  // analysis-age
  const AA = require('../../tools/analysis-age.js');
  const ab = AA.ageBuckets(tmp, '2026-09-24');
  t(ab.rows.some((r) => r[0] === 'ZTS' && r[1] === 2) && ab.be === 1 && ab.ce === 1 && ab.unparsed === 0, 'analysis-age: v3 age from meta.analysisDate (BE)', JSON.stringify(ab));
  // spotcheck — หน้า v3 เข้า buildCtx ทางเดียวกับ v2
  const SP = require('../../tools/spotcheck.js');
  t(Array.isArray(SP.spotcheck(RS.renderedHtml('ZTS', tmp), 'ZTS.html', true)), 'spotcheck: a v3 page goes through the same buildCtx path');
  // apply-edits ปฏิเสธ .json (hook มองไม่เห็น child process — ต้องกันที่ตัวเครื่องมือ)
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'apply-edits.js'), path.join(tmp, 'ZTS.json'), '--set', 'fv=1'], { encoding: 'utf8' });
  t(r.status === 1 && /report\.js save/.test(r.stderr), 'apply-edits: .json → exit 1 pointing to report.js save', r.stderr);
  t(fs.readFileSync(path.join(tmp, 'ZTS.json'), 'utf8') === fs.readFileSync(V3SRC, 'utf8'), 'apply-edits: the .json is untouched');
  // .gitignore
  t(/^\.work\/$/m.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')), '.gitignore ignores .work/ (drafts of report.js)');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
t.done();
