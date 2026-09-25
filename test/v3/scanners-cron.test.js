'use strict';
// Plan 2b Task 4 — เครื่องมือ cron-adjacent/misc อ่านใบ v3 (reports/<SYM>.json) ผ่าน tools/report-source.js
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามสร้างไฟล์ใต้ reports/ จริง (tripwire ถอดแล้วใน Plan 2c-i — กติกา "ห้ามสร้าง reports/*.json ใน test" ยังอยู่)
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const t = require('./_t.js')('scanners-cron');
const RS = require('../../tools/report-source.js');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, '..', 'fixtures');
const V3SRC = path.join(FIX, 'v3', 'ZTS-real.json');
let tmp, gitTmp;
try {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-scan-cron-'));
  fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'AAPL.html'));
  fs.copyFileSync(V3SRC, path.join(tmp, 'ZTS.json'));
  // update-prices — Plan 3 (P5): ใบ v3 เข้าสาย cron แล้ว (v3Guard/v3Refusal/v3SweepNotice ถูกถอด · test/v3/cron.test.js คุมสาย v3)
  //   ที่เหลือของ guard เดิม = --heal-derived <v3> exit 1 (R7 · ห้าม exit 0 เงียบ)
  const U = require('../../tools/update-prices.js');
  const isV3 = (s) => RS.kindOf(s, tmp) === 'v3';
  t(U.v3Guard === undefined && U.v3Refusal === undefined && U.v3SweepNotice === undefined, 'update-prices: P4 guard removed (v3 lane shipped in Plan 3)');
  const msg = U.healV3Refusal(new Set(['AAPL', 'ZTS']), isV3) || '';
  t(/ZTS/.test(msg) && !/AAPL/.test(msg) && /--heal-derived/.test(msg), 'update-prices: --heal-derived <v3> → refusal naming it (exit 1 in main · R7)');
  t.eq(U.healV3Refusal(new Set(['AAPL']), isV3), null, 'update-prices: --heal-derived <v2> → no refusal');
  t.eq(U.healV3Refusal(new Set(), isV3), null, 'update-prices: --heal-derived sweep → no refusal (v3 skipped with a count line)');
  t.eq([...U.onlyFromArgv(['--write', '--force', 'zts.json', 'aapl.html', 'KBANK'])], ['ZTS', 'AAPL', 'KBANK'], 'onlyFromArgv: flags dropped, .json/.html stripped, upper-case');
  t(RS.symbols(tmp).has('ZTS'), 'reportExists = RS.symbols keeps flags of v3 reports');
  // fix 1: สั่งเป็น path (reports/zts.json · reports/ZTS.html) ต้องได้ symbol เดียวกัน → เจอ guard ไม่ใช่ no-op เงียบ
  t.eq([...U.onlyFromArgv(['--write', '--force', 'reports/zts.json', './reports/AAPL.html', path.join(tmp, 'ZTS.html')])], ['ZTS', 'AAPL'], 'onlyFromArgv: path forms → basename symbol');
  t(U.healV3Refusal(U.onlyFromArgv(['--heal-derived', 'reports/zts.json']), isV3) !== null, '--heal-derived reports/zts.json → refusal (path form reaches the guard)');
  // fix 3b: wiring ของ main — reportExists = RS.symbols(REPORTS) → commitFlags ต้องคง flag ของใบ .json (ตัดเฉพาะหุ้นที่ไม่มีไฟล์)
  { const ff = path.join(tmp, 'price-flags.json');
    fs.writeFileSync(ff, JSON.stringify([{ symbol: 'ZTS', reason: 'drift', flaggedAt: '2026-09-20' }, { symbol: 'GONE', reason: 'drift', flaggedAt: '2026-09-20' }]));
    const fl = U.commitFlags({ file: ff, write: false, evaluated: new Set(), frozenAll: [], failed: [], quietSyms: new Set(), aliveConfirmed: new Set(), reportExists: RS.symbols(tmp) });
    t.eq(fl.map((f) => f.symbol), ['ZTS'], 'commitFlags + RS.symbols: flag ของใบ v3 คงอยู่ · หุ้นที่ไม่มีไฟล์ถูกตัด');
    fs.unlinkSync(ff); }   // tmp คือโฟลเดอร์ reports ของเทสนี้ — ไฟล์ .json อื่นจะถูกนับเป็นใบ v3
  // preserve-dates — ใบ v3 ไม่มี <footer> ⇒ ต้องข้าม ไม่งั้น UPDATE ของใบ v3 ถูกคืนวันเก่าเสมอ
  const PDt = require('../../tools/preserve-dates.js');
  const cur = [{ symbol: 'AAPL', updated: '2026-09-24T01:00:00+07:00' }, { symbol: 'ZTS', updated: '2026-09-24T01:00:00+07:00' }];
  const n = PDt.restoreDates(cur, { AAPL: '2026-09-01T00:00:00+07:00', ZTS: '2026-09-02T00:00:00+07:00' }, new Set(['ZTS']));
  const by = Object.fromEntries(cur.map((r) => [r.symbol, r.updated]));
  t(n === 1 && by.AAPL === '2026-09-01T00:00:00+07:00' && by.ZTS === '2026-09-24T01:00:00+07:00', 'preserve-dates: v3 symbol skipped, v2 restored as before');
  t.eq(cur.map((r) => r.symbol), ['ZTS', 'AAPL'], 'preserve-dates: re-sorted like build (newest first)');
  // fix 3a: wiring ของ main — git repo ชั่วคราว (HEAD = วันเก่า · working tree = วันใหม่ทั้งคู่) → child process รัน main(root)
  {
    gitTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-pdates-'));
    const gRep = path.join(gitTmp, 'reports');   // โฟลเดอร์ reports ของ repo ชั่วคราว (ไม่ใช่ reports/ จริง)
    fs.mkdirSync(gRep);
    fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(gRep, 'AAPL.html'));
    fs.copyFileSync(V3SRC, path.join(gRep, 'ZTS.json'));
    const man = (a, z) => JSON.stringify([{ symbol: 'AAPL', updated: a }, { symbol: 'ZTS', updated: z }], null, 2) + '\n';
    fs.writeFileSync(path.join(gitTmp, 'reports.json'), man('2026-09-01T00:00:00+07:00', '2026-09-02T00:00:00+07:00'));
    // ★ ล้าง GIT_* ที่ git hook (pre-push) export มา — ไม่งั้น git ใน repo ชั่วคราวชี้ไป .git ของ worktree ("must be run in a work tree")
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|PREFIX|OBJECT_DIRECTORY)$/.test(k)));
    const g = (...a) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { cwd: gitTmp, stdio: 'pipe', env: cleanEnv });
    g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'base');
    fs.writeFileSync(path.join(gitTmp, 'reports.json'), man('2026-09-24T01:00:00+07:00', '2026-09-24T01:00:00+07:00'));
    const pr = cp.spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main(process.argv[2])', path.join(ROOT, 'tools', 'preserve-dates.js'), gitTmp], { encoding: 'utf8', env: cleanEnv });
    const after = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(gitTmp, 'reports.json'), 'utf8')).map((r) => [r.symbol, r.updated]));
    t(pr.status === 0 && after.AAPL === '2026-09-01T00:00:00+07:00' && after.ZTS === '2026-09-24T01:00:00+07:00' && /ข้าม 1 ใบ v3[^\n]*ZTS/.test(pr.stdout),
      'preserve-dates main: v3 symbol reaches the skip set (keeps new date) · v2 restored', JSON.stringify({ status: pr.status, after, out: pr.stdout, err: pr.stderr }));
  }
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
} finally { for (const d of [tmp, gitTmp]) if (d) fs.rmSync(d, { recursive: true, force: true }); }
t.done();
