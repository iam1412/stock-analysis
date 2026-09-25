'use strict';
// Plan 4b Task 7 — CLI tools/migrate-v3.js sweep|convert · report.js (md/csv · driftClass/maxDeltaPct) · tmp dirs only (never reports/)
// ★ deviation from the brief (measured at base 769d1e7d4): BBL is HUMAN since Task 5 round 4 (analyst max/min) and DPZ is HUMAN
//   (custom cards > 4) ⇒ the 7-fixture sweep has HUMAN 4 (AAPL BBL DDOG DPZ); the write path uses CASY (VALUE-DRIFT) instead of BBL
const t = require('./_t.js')('migrate-cli');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const IO = require('../../tools/v3/io.js');
const CV = require('../../test/check-v3.js');
const SEEDS = require('../../tools/seeds.json');
const MV = require('../../tools/migrate-v3.js');
const RP = require('../../tools/migrate-v3/report.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-cli-'));
const REP = path.join(tmp, 'reports'); fs.mkdirSync(REP);
const SYMS = ['AAPL', 'BBL', 'CASY', 'DDOG', 'DPZ', 'FTV', 'SRE'];
for (const s of SYMS) fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', `${s}-v2.html`), path.join(REP, `${s}.html`));
const MAN = path.join(tmp, 'reports.json');
fs.writeFileSync(MAN, JSON.stringify(SYMS.map((s) => ({ symbol: s, updated: '2026-09-01T00:00:00+07:00', hash: 'x' }))));
const cli = (args, env) => { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'migrate-v3.js'), ...args], { encoding: 'utf8', cwd: ROOT, env: { ...process.env, MIGRATE_V3_ALLOW_REAL: '', ...(env || {}) } }); return { code: r.status, out: r.stdout + r.stderr }; };
const common = ['--reports-dir', REP, '--head-manifest', MAN, '--no-stale'];
const REAL = path.join(ROOT, 'reports');   // guard target only — never read as a fixture
const realBefore = fs.readdirSync(REAL).length;
// sweep
{
  const out = path.join(tmp, 'sweep');
  const r = cli(['sweep', ...common, '--out', out]);
  t(r.code === 0 && /sweep: 7 ใบ · CLEAN \d+ · VALUE-DRIFT \d+ · HUMAN 4 · TEXT LOST ใน CLEAN 0/.test(r.out), 'sweep: 7 fixtures · HUMAN 4 (AAPL BBL DDOG DPZ)', r.out.slice(-400));
  t(fs.existsSync(out + '.md') && fs.existsSync(out + '.csv'), 'sweep writes md + csv');
  const csv = fs.readFileSync(out + '.csv', 'utf8').trim().split('\n');
  t(csv.length === 8 && /^symbol,market,bucket,reasons,legs,fvLegs,textLost,numberValue,rdRows,proseStale,customCards,fNotes,driftClass,maxDeltaPct$/.test(csv[0]), 'csv header + 7 rows', csv[0]);
  const all = csv.join('\n');
  t(/AAPL,US,HUMAN/.test(all) && /DDOG,US,HUMAN/.test(all) && /BBL,TH,HUMAN/.test(all) && /DPZ,US,HUMAN/.test(all) && /CASY,US,VALUE-DRIFT/.test(all), 'csv buckets');
  // positional columns survive reasons with commas (reasons always quoted, inner commas → ';')
  t(csv.slice(1).every((l) => { const m = /^[A-Z.]+,[A-Z]+,[A-Z-]+,"((?:[^"]|"")*)",(.*)$/.exec(l); return m && !m[1].includes(',') && m[2].split(',').length === 10; }), 'csv: reasons quoted without commas · 10 columns after it');
  const casy = csv.find((l) => l.startsWith('CASY,')).split(',');
  t(RP.CLASSES.includes(casy[12]) && /^\d+(\.\d+)?$/.test(casy[13]) && casy[9] === '', 'CASY: driftClass in the enum · maxDeltaPct numeric · proseStale empty under --no-stale', casy.slice(12).join(','));
  t(csv.filter((l) => /,HUMAN,/.test(l)).every((l) => /,,[\d.]+$/.test(l)), 'HUMAN rows: driftClass empty');
  const md = fs.readFileSync(out + '.md', 'utf8');
  t(/## HUMAN/.test(md) && /## VALUE-DRIFT/.test(md) && /## CLEAN/.test(md) && /migrate-v3\.js sweep/.test(md), 'md has the three bucket sections + regenerate line');
  t(/## F-note histogram/.test(md) && /## Top-10 HUMAN reasons/.test(md) && /Known open questions for the owner before 4c/.test(md) && /VALUE-DRIFT per driftClass: gauge-only \d+ · fv-rounding \d+/.test(md) && /--no-stale/.test(md) && /gdots author words.* \d+ ใบ/.test(md) && /s8 third vcell.* \d+ ใบ/.test(md) && /legend annotations.* \d+ ใบ/.test(md), 'md: histogram · top-10 · owner questions · per-class counts · no-stale note');
  t(/\| DPZ \| US \|/.test(md) && /custom-card cap 4\*\* — \d+ ใบ HUMAN .* 1 ใบ HUMAN ด้วยเหตุนี้อย่างเดียว/.test(md), 'md: DPZ in HUMAN table · cap-only count = 1 (DPZ)', (md.match(/custom-card cap 4.*/) || [''])[0]);
  t(fs.existsSync(path.join(REP, 'AAPL.html')) && !fs.readdirSync(REP).some((f) => f.endsWith('.json')), 'sweep is read-only');
  const r2 = cli(['sweep', ...common, '--out', out, '--only', 'SRE', 'FTV']); t(/sweep: 2 ใบ/.test(r2.out), '--only limits the sweep');
  const r3 = cli(['sweep', ...common, '--out', out, '--limit', '3']); t(/sweep: 3 ใบ/.test(r3.out), '--limit limits the sweep');
  const r4 = cli(['sweep', ...common, '--bogus']); t(r4.code === 1 && /ไม่รู้จักตัวเลือก --bogus/.test(r4.out), 'unknown option → exit 1');
}
// sweep does not abort on a doc that fails before compare — it is HUMAN with the error as a reason
{
  const D2 = path.join(tmp, 'broken'); fs.mkdirSync(D2);
  fs.writeFileSync(path.join(D2, 'ZZZ.html'), '<html><body><footer>ข้อมูล ณ 1 ก.ย. 2569</footer></body></html>');
  fs.copyFileSync(path.join(REP, 'SRE.html'), path.join(D2, 'SRE.html'));
  const out = path.join(tmp, 'broken-sweep');
  const r = cli(['sweep', '--reports-dir', D2, '--head-manifest', MAN, '--no-stale', '--out', out]);
  const csv = fs.readFileSync(out + '.csv', 'utf8');
  t(r.code === 0 && /sweep: 2 ใบ .* HUMAN 1/.test(r.out) && /failed before compare \(นับใน HUMAN\): 1/.test(r.out) && /^ZZZ,\?,HUMAN,"failed before compare — /m.test(csv), 'broken doc → HUMAN "failed before compare", sweep continues', r.out.slice(-300));
}
// convert — refusals (Review Focus 3)
{
  const r = cli(['convert', 'AAPL', ...common, '--write']);
  t(r.code === 1 && /HUMAN/.test(r.out) && fs.existsSync(path.join(REP, 'AAPL.html')) && !fs.existsSync(path.join(REP, 'AAPL.json')), 'convert --write on HUMAN → refused, nothing written or deleted');
  const r2 = cli(['convert', 'AAPL', ...common, '--write', '--accept-drift']);
  t(r2.code === 1 && !fs.existsSync(path.join(REP, 'AAPL.json')), '--accept-drift does not override HUMAN');
  const r3 = cli(['convert', 'CASY', ...common, '--write']);
  t(r3.code === 2 && /--accept-drift/.test(r3.out) && fs.existsSync(path.join(REP, 'CASY.html')) && !fs.existsSync(path.join(REP, 'CASY.json')), 'VALUE-DRIFT --write without --accept-drift → exit 2, nothing written');
  // final-review M-1: the real-path guard cases use a symbol that does NOT exist in reports/ — a regressed guard ends at "ไม่พบ", never writes real files
  const NOPE = 'ZZZNOPE';
  t(!fs.existsSync(path.join(REAL, NOPE + '.html')) && !fs.existsSync(path.join(REAL, NOPE + '.json')), `M-1: ${NOPE} is not a real report`);
  const rr = cli(['convert', NOPE, '--write', '--reports-dir', REAL, '--head-manifest', MAN, '--no-stale']);
  t(rr.code === 1 && /MIGRATE_V3_ALLOW_REAL/.test(rr.out), '--write against the real reports/ refused without MIGRATE_V3_ALLOW_REAL=1');
  const rr2 = cli(['convert', NOPE, '--write', '--accept-drift', '--reports-dir', path.join(REAL, '..', 'reports'), '--head-manifest', MAN, '--no-stale']);
  t(rr2.code === 1 && /MIGRATE_V3_ALLOW_REAL/.test(rr2.out), 'real reports/ guard resolves the path (reports/../reports)');
  for (const alias of [path.join(ROOT, 'REPORTS'), path.join(ROOT, 'Reports') + path.sep + '.']) {
    const ra = cli(['convert', NOPE, '--write', '--accept-drift', '--reports-dir', alias, '--head-manifest', MAN, '--no-stale']);
    t(ra.code === 1 && /MIGRATE_V3_ALLOW_REAL/.test(ra.out), `I-1: case alias ${path.relative(ROOT, alias)} → refused`, ra.out.slice(-200));
  }
  t(MV.isGuarded(path.join(ROOT, 'REPORTS')) && MV.isRealReports(path.join(ROOT, 'reports', '.')), 'isGuarded: case alias of reports/ (APFS)');
  // M-1: a reports/ of ANY checkout (parent has reports.json + build.js) is guarded too
  const FAKE = path.join(tmp, 'checkout'), FREP = path.join(FAKE, 'reports'); fs.mkdirSync(FREP, { recursive: true });
  fs.writeFileSync(path.join(FAKE, 'reports.json'), '[]'); fs.writeFileSync(path.join(FAKE, 'build.js'), '');
  fs.copyFileSync(path.join(REP, 'CASY.html'), path.join(FREP, 'CASY.html'));
  const rf = cli(['convert', 'CASY', '--write', '--accept-drift', '--reports-dir', FREP, '--head-manifest', MAN, '--no-stale']);
  t(rf.code === 1 && /MIGRATE_V3_ALLOW_REAL/.test(rf.out) && !fs.existsSync(path.join(FREP, 'CASY.json')), 'M-1: another checkout\'s reports/ → refused', rf.out.slice(-200));
  t(!MV.isGuarded(REP), 'tmp reports dir without build.js is not guarded');
  // M-2: sweep --out into a reports dir → refused, nothing written
  const ro = cli(['sweep', ...common, '--out', path.join(FREP, 'sweep')]);
  t(ro.code === 1 && /read-only/.test(ro.out) && !fs.existsSync(path.join(FREP, 'sweep.md')), 'M-2: sweep --out into reports/ → refused', ro.out.slice(-200));
  // final-review M-2: any ancestor of --out guarded → refused (writeSweep mkdir -p would create reports/sub/)
  const rs = cli(['sweep', ...common, '--out', path.join(FREP, 'sub', 'x')]);
  t(rs.code === 1 && /read-only/.test(rs.out) && !fs.existsSync(path.join(FREP, 'sub')), 'M-2: sweep --out <reports>/sub/x → refused, no sub/ created', rs.out.slice(-200));
  // M-3: --write without a manifest row (and no --head-manifest) → refused
  const lines = [];
  const c3 = MV.runConvert('CASY', { ...MV.parseArgs(['--reports-dir', REP, '--no-stale', '--write', '--accept-drift']), manifest: new Map() }, (x) => lines.push(x));
  t(c3 === 1 && lines.some((l) => /ไม่มีแถวใน manifest/.test(l)) && !fs.existsSync(path.join(REP, 'CASY.json')), 'M-3: no manifest row → --write refused', lines.join('\n'));
  t(fs.readdirSync(REAL).length === realBefore && !fs.existsSync(path.join(REAL, 'CASY' + '.json')), 'real reports/ untouched');
  const nf = cli(['convert', 'NOPE', ...common]); t(nf.code === 1 && /ไม่พบ/.test(nf.out), 'convert on a missing symbol → exit 1');
}
// convert — write path (CASY = VALUE-DRIFT)
{
  const dry = cli(['convert', 'CASY', ...common]);
  t(dry.code === 2 && /CASY: VALUE-DRIFT/.test(dry.out) && /eq: textLost 0/.test(dry.out), 'convert dry-run prints the bucket + eq summary (exit 2 VALUE-DRIFT)', dry.out.slice(0, 300));
  const pd = MV.migrateOne('CASY', { ...MV.parseArgs([...common]), seeds: SEEDS, manifest: new Map(), stats: { apxMs: 0 } }).today;
  const late = cli(['convert', 'CASY', ...common, '--write', '--accept-drift', '--today', '2099-01-01']);
  t(late.code === 1 && /E27/.test(late.out) && fs.existsSync(path.join(REP, 'CASY.html')) && !fs.existsSync(path.join(REP, 'CASY.json')), 'M-4: --write gate uses the given day (2099 → E27) → rolled back', late.out.slice(-300));
  const r = cli(['convert', 'CASY', ...common, '--write', '--accept-drift', '--today', pd]);
  t(r.code === 0 && new RegExp(`gate วันที่ ${pd}(?! \\(≠)`).test(r.out) && fs.existsSync(path.join(REP, 'CASY.json')) && !fs.existsSync(path.join(REP, 'CASY.html')) && /build ทันทีก่อนแก้ — แก้ก่อน build ครั้งแรก = การแก้นั้นไม่ถูกประทับ updated \(คง updated ของ v2\)/.test(r.out), 'convert --write: .json written, .html removed, reminder "build ทันทีก่อนแก้" (final-review M-3 wording)', r.out.slice(-300));
  const doc = IO.read(path.join(REP, 'CASY.json'));
  t(IO.verifySig(doc), 'written doc is signed by io.js');
  const g = CV.checkDoc(doc, { seeds: SEEDS, today: doc.market.priceDate, stage: 'save' });
  t.eq(g.errors.map((e) => e.id), [], 'written doc passes checkDoc (save stage)');
  t.eq(doc.meta.migratedFrom.updated, '2026-09-01T00:00:00+07:00', 'migratedFrom.updated from --head-manifest');
  const again = cli(['convert', 'CASY', ...common]);
  t(again.code === 1 && /เป็นใบ v3 แล้ว|already v3/.test(again.out), 'convert on an already-migrated symbol → refused');
  const sw = cli(['sweep', ...common, '--out', path.join(tmp, 'after')]); t(/sweep: 6 ใบ/.test(sw.out), 'sweep skips v3 docs');
}
// convert — gate failure after write restores the .html and removes the .json (injected checkDoc)
{
  const before = fs.readFileSync(path.join(REP, 'FTV.html'));
  const lines = [];
  const code = MV.runConvert('FTV', { ...MV.parseArgs([...common, '--write', '--accept-drift']) }, (s) => lines.push(s), { checkDoc: () => ({ errors: [{ id: 'E99', msg: 'injected' }], warnings: [] }) });
  t(code === 1 && fs.existsSync(path.join(REP, 'FTV.html')) && !fs.existsSync(path.join(REP, 'FTV.json')) && fs.readFileSync(path.join(REP, 'FTV.html')).equals(before) && lines.some((l) => /E99/.test(l)), 'checkDoc error → .html restored byte-identical, .json removed, exit 1', lines.join('\n'));
}
// report.js — driftClass / maxDeltaPct
{
  const V = (items, extra) => ({ bucket: 'VALUE-DRIFT', items, numberValue: 0, ...(extra || {}) });
  t.eq(RP.driftClass({ bucket: 'HUMAN', items: [{ path: 'fv', v2: 1, v3: 2 }] }), '', 'HUMAN → ""');
  t.eq(RP.driftClass({ bucket: 'CLEAN', items: [] }), '', 'CLEAN → ""');
  t.eq(RP.driftClass(V([])), 'gauge-only', 'no items → gauge-only');
  t.eq(RP.driftClass(V([], { numberValue: 3 })), 'mixed', 'page-number echoes only → mixed');
  t.eq(RP.driftClass(V([{ path: 'fv', v2: 100, v3: 100.5 }, { path: 'sm.mos', v2: -20.9, v3: -20.7 }, RP.noteItem('FV 101 → 101.58 (family weights)')])), 'fv-rounding', 'fv/sm.mos/FV note ≤ 1% → fv-rounding');
  t.eq(RP.driftClass(V([{ path: 'fv', v2: 100, v3: 102 }])), 'mixed', 'fv > 1% → mixed');
  t.eq(RP.driftClass(V([{ path: 'values.scenarios[0].tgt', v2: 129.1, v3: 129.12 }, RP.noteItem('scn.bear.tgt 129.1 → 129.12')])), 'scn-tgt', 'scenario tgt rows/notes → scn-tgt');
  t.eq(RP.driftClass(V([{ path: 'sm.pe', v2: 30.9, v3: 30.95 }])), 'index', 'sm.pe → index');
  t.eq(RP.driftClass(V([RP.noteItem('prose stale copies ×2 (px@analysis)')])), 'prose-stale', 'stale copies only → prose-stale');
  t.eq(RP.driftClass(V([{ path: 'fv', v2: 100, v3: 100.1 }, RP.noteItem('scn.bear.tgt 1 → 1')])), 'multi-rounding', 'fv + scn within the bound → multi-rounding');
  t.eq(RP.driftClass(V([{ path: 'fv', v2: 100, v3: 100.1 }, { path: 'sm.pe', v2: 30, v3: 30.1 }, RP.noteItem('scn.bear.tgt 1 → 1')])), 'multi-rounding', 'fv + scn + index → multi-rounding');
  t.eq(RP.driftClass(V([{ path: 'fv', v2: 100, v3: 100.1 }, RP.noteItem('scn.bear.tgt 100 → 102')])), 'mixed', 'fv + scn with a > 1% row → mixed');
  t.eq(RP.driftClass(V([{ path: 'fv', v2: 100, v3: 100.1 }, RP.noteItem('prose stale copies ×1 (px@analysis)')])), 'mixed', 'fv + stale → mixed (stale is not a rounding kind)');
  // percent-point quantities (N-4): ≤ 0.5 pp absolute, never relative
  t.eq(RP.driftClass(V([{ path: 'sm.mos', v2: -0.5, v3: -0.6 }])), 'fv-rounding', 'sm.mos −0.5 → −0.6 = 0.1 pp → within the bound');
  t.eq(RP.driftClass(V([{ path: 'sm.upside', v2: 20, v3: 20.7 }])), 'mixed', 'sm.upside 0.7 pp → beyond the bound');
  t.eq(RP.driftClass(V([{ path: 'sm.dividendYield', v2: 2.1, v3: 2.5 }, { path: 'sm.pe', v2: 30, v3: 30.2 }])), 'index', 'dividendYield 0.4 pp + pe 0.67% → index');
  t.eq(RP.maxDeltaPct([{ path: 'sm.mos', v2: -0.5, v3: -0.6 }]), 0.1, 'maxDeltaPct: pp quantity contributes its absolute point difference');
  t.eq(RP.driftClass(V([RP.noteItem('prose:prose.gauge "+11.8%" → {{analyst.pct}}')])), 'mixed', 'prose token row → mixed');
  t.eq(RP.maxDeltaPct([{ path: 'fv', v2: 143, v3: 143.21 }, RP.noteItem('scn.base.tgt 172.4 → 172.44'), RP.noteItem('prose stale copies ×1 (px@analysis)')]), 0.15, 'maxDeltaPct 2 dp over valued rows');
  t.eq(RP.maxDeltaPct([]), 0, 'maxDeltaPct 0 when none');
  t.eq(RP.maxDeltaPct([{ path: 'fv', v2: 0, v3: 1 }]), 100, 'v2 = 0 → 100 (relative quantity)');
  t.eq(RP.maxDeltaPct([{ path: 'sm.mos', v2: 0, v3: 1 }]), 1, 'v2 = 0 on a pp quantity → 1 pp');
}
fs.rmSync(tmp, { recursive: true, force: true });
t.done();
