'use strict';
// Plan 2b Task 2 — scanner ชุด verify อ่านใบ v3 ผ่าน tools/report-source.js (spec §6.5 · finding M1)
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามสร้างไฟล์ใต้ reports/ จริง (tripwire no-json-reports)
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('scanners-verify');
const CR = require('../check-reports.js');
const CV = require('../check-v3.js');
const E = require('../engine-exec.js');
const FL = require('../fixture-lint.js');
const RS = require('../../tools/report-source.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-scan-verify-'));
fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'AAPL.html'));
fs.copyFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), path.join(tmp, 'ZTS.json'));
{ // ใบ v3 ที่ถูกแก้มือหลังเซ็น (ไม่ผ่าน io.js) — E50 ต้องโผล่ผ่าน npm test -- SYM โดยไม่ขึ้นกับนาฬิกา
  const bad = JSON.parse(fs.readFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), 'utf8'));
  bad.prose.mos += ' (แก้มือ)';
  fs.writeFileSync(path.join(tmp, 'ZZB.json'), JSON.stringify(bad, null, 2) + '\n');
}
const cli = (args) => {
  const out = [];
  const code = CR.runCli(args, { reportsDir: tmp, log: (s) => out.push(String(s)), err: (s) => out.push(String(s)) });
  return { code, out: out.join('\n') };
};
try {
  { const a = cli(['ZTS']), b = CV.runCli(['ZTS'], { reportsDir: tmp, log: () => {} });
    t(/check-v3/.test(a.out) && /ZTS\.json/.test(a.out) && !/ไม่พบไฟล์รายงานให้ตรวจ/.test(a.out), 'npm test -- <v3 SYM> hands off to check-v3 (M1: no "ไม่พบไฟล์รายงานให้ตรวจ")');
    t.eq(a.code, b, 'exit code of the hand-off = check-v3 exit code'); }
  { const a = cli(['zzb.json']); t(a.code === 1 && /\[E50\]/.test(a.out), 'hand-edited v3 file → E50 through npm test -- SYM (lower-case + .json accepted), exit 1'); }
  { const a = cli(['AAPL', 'ZZB']); t(a.code === 1 && /AAPL\.html/.test(a.out) && /\[E50\]/.test(a.out), 'mixed v2+v3 args: both checked, exit codes combined'); }
  { const a = cli(['NOPE']); t(a.code === 1 && /ไม่พบไฟล์รายงานให้ตรวจ/.test(a.out), 'unknown symbol still exits 1'); }
  { const a = cli([]); t(/AAPL\.html/.test(a.out) && /ใบ v3 2 ใบ/.test(a.out) && !/\[E50\]/.test(a.out), 'sweep: v2 checked, v3 only counted and pointed at check-v3 (R8)'); }
  { fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'ZTS.html'));
    const a = cli(['ZTS']);
    t(a.code === 1 && /ZTS มีทั้ง \.html และ \.json/.test(a.out), 'both files for one symbol → exit 1 naming it');
    fs.unlinkSync(path.join(tmp, 'ZTS.html')); }
  { const html = RS.renderedHtml('ZTS', tmp);
    const r = E.runEngine(E.extractEngine(html), E.seedFromHtml(html));
    t(r.ok && E.assertRendered(r.doc).length === 0, 'engine-exec: a v3 page runs its engine in the mock DOM (chart + gauge + MOS calc)'); }
  const sample = "path.join(ROOT, 'report" + "s', 'ZTS.json')";   // ต่อสตริงเพื่อไม่ให้ fixture-lint จับไฟล์นี้เอง
  t(FL.PATTERNS.some((re) => re.test(sample)), 'fixture-lint: pattern also catches reports/<SYM>.json');
  t(FL.DIRS.includes(__dirname), 'fixture-lint: scans test/v3 too');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
t.done();
