'use strict';
// display-fix (owner 26 ก.ย. 69: every migrated report DISPLAYS the same data as its v2 page) — v2Display (schema/compute/render) ·
//   migrator carry (tools/migrate-v3/display.js) · number parsing · audit (served baseline · auditDoc · sanity) · remigrate (temp git repo)
//   · convert --write / adopt display gate · build.updatedFor prevHash is in test/build-test.js
// tmp dirs only (never reports/) · git with GIT_* scrubbed + core.hooksPath=/dev/null (memory: git-hook-env-git-init-trap)
const t = require('./_t.js')('display-fix');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const IO = require('../../tools/v3/io.js');
const R = require('../../_template/v3/render.js');
const B = require('../../build.js');
const NB = require('../../tools/migrate-v3/numbers.js');
const EQ = require('../../tools/migrate-v3/equiv.js');
const AU = require('../../tools/migrate-v3/audit.js');
const DS = require('../../tools/migrate-v3/display.js');
const RMG = require('../../tools/migrate-v3/remigrate.js');
const MV = require('../../tools/migrate-v3.js');
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
const REAL = path.join(ROOT, 'reports');
const realBefore = fs.readdirSync(REAL).length;
const MF = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
const load = (f) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`))); delete d._sig; return d; };
const page = (d) => B.expandReport(R.toV2Source(d, C.compute(d, { seeds: SEEDS })));
const txt = (h) => EQ.text(h);

// ── numbers: sign before the currency symbol · spaced Thai units ──
t.eq(NB.numsOf('−$0.77').map((x) => x.v), [-0.77], 'numsOf: "−$0.77" is negative (was +0.77)');
t.eq(NB.numsOf('~$-0.77').map((x) => x.v), [-0.77], 'numsOf: "$-0.77" negative');
t.eq(NB.numsOf('฿1,211 ล้าน -4.9%').map((x) => x.v), [1211e6, -4.9], 'numsOf: amount + signed %');
t.eq(NB.numsOf('$94.24–$107.70').map((x) => x.v), [94.24, 107.7], 'numsOf: an en-dash range is not a sign');
t(Math.abs(NB.numsOf('~฿4.18 พัน ล.')[0].v - 4.18e9) < 1, 'numsOf: "พัน ล." (spaced) = พันล้าน');
t(Math.abs(NB.numsOf('~฿17.4 พันลบ.')[0].v - 17.4e9) < 1 && Math.abs(NB.numsOf('~1.02 แสนลบ.')[0].v - 1.02e11) < 1, 'numsOf: พันลบ. / แสนลบ.');
t.eq(txt('~฿4.18 พัน ล. และ ฿17.4 พัน ลบ.'), '~฿4.18 พันล. และ ฿17.4 พันลบ.', 'EQ.text joins a spaced Thai money unit (one token in the diff)');

// ── schema: v2Display is migrated-only · closed · shapes ──
{
  const zts = load('ZTS-real');
  const bad = { ...zts, v2Display: { fv: 100 } };
  t(S.validate(bad).some((e) => e.path === 'v2Display' && /migrate/.test(e.msg)), 'schema: v2Display on a NEW doc → error (numbers come from inputs)');
  const mig = { ...zts, meta: { ...zts.meta, migratedFrom: MF }, v2Display: { fv: 100, fvRange: [90, 110], targets: [null, 120, null] } };
  t.eq(S.validate(mig), [], 'schema: v2Display on a migrated doc → ok');
  t(S.validate({ ...mig, v2Display: { fv: 100, bogus: 1 } }).some((e) => e.path === 'v2Display.bogus'), 'schema: v2Display is closed');
  t(S.validate({ ...mig, v2Display: { fvRange: [110, 90] } }).some((e) => e.path === 'v2Display.fvRange'), 'schema: fvRange lo ≤ hi');
  t(S.validate({ ...mig, v2Display: { targets: [1, 2] } }).some((e) => e.path === 'v2Display.targets'), 'schema: targets length 3');
  t(S.validate({ ...mig, v2Display: { gauge: [{ ref: 'fv', label: 'x' }, { ref: 'nope', label: 'y' }] } }).some((e) => e.path === 'v2Display.gauge[1].ref'), 'schema: gauge ref enum');
  t(S.validate({ ...mig, v2Display: { cards: { nim: { v: '~3%', d: '' } } } }).some((e) => e.path === 'v2Display.cards.nim'), 'schema: a frozen card must be one of metrics.cards');
  const withNote = { ...mig, metrics: { ...mig.metrics, notes: { ...(mig.metrics.notes || {}), pe: 'x' } }, v2Display: { cards: { pe: { v: '~9x', d: '' } } } };
  t(S.validate(withNote).some((e) => e.path === 'metrics.notes.pe'), 'schema: a frozen card carries no metrics.notes (its .d is the v2 line)');
  t(S.validate({ ...mig, v2Display: { cards: { pe: { v: '~9x', d: '', op: 'pxOverBase' } } } }).some((e) => e.path === 'v2Display.cards.pe'), 'schema: op needs base');
  t(S.validate({ ...mig, meta: { ...mig.meta, migratedFrom: { ...MF, prevHash: 'zz' } } }).some((e) => e.path === 'meta.migratedFrom.prevHash'), 'schema: prevHash = 12 hex');
  t.eq(S.validate({ ...mig, meta: { ...mig.meta, migratedFrom: { ...MF, prevHash: '0123456789ab' } } }), [], 'schema: prevHash ok');
}

// ── compute/render: author figures replace the computed ones (migrated only) ──
{
  const zts = load('ZTS-real'); zts.meta.migratedFrom = MF;
  const v0 = C.compute(zts, { seeds: SEEDS });
  const d = { ...zts, v2Display: { fv: 150, fvRange: [140, 160], targets: [101, null, 303], legValues: zts.legs.map((l, i) => (i === 0 ? 123.45 : null)) } };
  const v = C.compute(d, { seeds: SEEDS });
  t.eq([v.fv, v.fvLow, v.fvHigh, v.rd.fv, v.rd.values.fvLow], [150, 140, 160, 150, 140], 'compute: fv + range = the author\'s');
  t.eq([v.scn[0].tgt, v.scn[1].tgt, v.scn[2].tgt].map((x) => +x.toFixed(2)), [101, +v0.scn[1].tgt.toFixed(2), 303], 'compute: targets override per scenario (null = computed)');
  t(v.legs[0].value === 123.45 && Math.abs(v.legs[0].computed - v0.legs[0].value) < 1e-9, 'compute: leg value shown = author · computed kept');
  t(Math.abs(v.d.mos20 - 120) < 0.01 && Math.abs(v.d.mos30 - 105) < 0.01, 'derived MOS points follow the author FV');
  const nw = { ...load('ZTS-real'), v2Display: { fv: 150 } };
  t.eq(C.compute({ ...nw, v2Display: undefined }, { seeds: SEEDS }).fv, C.v2DisplayOf(nw) ? -1 : C.compute({ ...nw, v2Display: undefined }, { seeds: SEEDS }).fv, 'v2DisplayOf: ignored on a NEW doc');
  t(C.v2DisplayOf(nw) === null, 'v2DisplayOf(NEW) = null');
  const h = page(d);
  t(h.includes('$123.45') && h.includes('$150.00'), 'render: leg value + FV box show the author figures');
}
{
  // gauge: author ticks (ref + fixed text) sorted by the current values · rets live/fixed · frozen/live cards · footer · end text
  const zts = load('ZTS-real'); zts.meta.migratedFrom = MF;
  const key = zts.metrics.cards.map((c) => (typeof c === 'string' ? c : c.key)).find((k) => k === 'pe');
  const notes = { ...(zts.metrics.notes || {}) }; delete notes.pe;
  const d = { ...zts, metrics: { ...zts.metrics, notes }, scenarios: { ...zts.scenarios, cases: zts.scenarios.cases.map(({ retNote, ...c }) => c) },
    v2Display: { gauge: [{ text: '$999', label: 'เป้าสูงสุด' }, { ref: 'mos30', label: 'MOS 30%' }, { ref: 'fv', label: 'Fair Value' }],
      cards: { pe: { v: '~31.4x', d: 'EPS TTM $5.00 (dil.)', op: 'pxOverBase', base: 5 } },
      rets: { texts: ['−2.5%/ปี', '+19.4%/ปี', '+39.4%/ปี'], live: true, neg: '−', perYear: 'cagr', div: false },
      footer: '21 ก.ย. 2569 (2026)', driverEnds: ['~$38.75B', null, null] } };
  t(key === 'pe', 'fixture has a pe card');
  t.eq(S.validate(d), [], 'schema: the full v2Display example validates', JSON.stringify(S.validate(d)));
  const v = C.compute(d, { seeds: SEEDS }), src = R.toV2Source(d, v);
  const scale = (/<div class="scale">([\s\S]*?)<\/div>\s*<\/div>/.exec(src) || [])[1] || '';
  t(scale.indexOf('{{rd:mos30}}') < scale.indexOf('{{rd:fv}}') && scale.indexOf('{{rd:fv}}') < scale.indexOf('$999') && /เป้าสูงสุด/.test(scale), 'render: author gauge ticks, ascending by value', scale);
  const px = d.market.px, want = (px / 5).toFixed(1);
  t(src.includes(`~${want}x`) && src.includes('EPS TTM $5.00 (dil.)'), `render: live card = price ÷ the author base (${want}x) + the v2 .d line`);
  const hi = { ...d, market: { ...d.market, px: +(px * 1.2).toFixed(2) } };
  t(R.toV2Source(hi, C.compute(hi, { seeds: SEEDS })).includes(`~${(hi.market.px / 5).toFixed(1)}x`), 'live card follows the price (cron keeps it right)');
  const bear = (src.split('<div class="col bear">')[1] || '').split('</ul>')[0];
  const T = (v.scn[0].tgt - px) / px * 100, py = (Math.pow(1 + T / 100, 1 / d.scenarios.years) - 1) * 100;
  t(bear.includes(`${py < 0 ? '−' : '+'}${Math.abs(py).toFixed(1)}%/ปี`), `render: live ret keeps the author format (per-year 1 dp) at the current price (${py.toFixed(1)})`, bear.slice(0, 300));
  t(bear.includes('~$38.75B') && />~\$38\.75B</.test(bear), 'render: scenario end value = the author\'s text');
  t(/ข้อมูล ณ 21 ก\.ย\. 2569 \(2026\)/.test(src), 'render: footer date as the v2 page printed it');
  const fixed = { ...d, v2Display: { ...d.v2Display, rets: { texts: ['-3% (3 ปี)', '+39% (3 ปี)', '+72% (3 ปี)'], live: false, neg: '-', cls: ['neg', 'pos', 'pos'] } } };
  const fsrc = R.toV2Source(fixed, C.compute(fixed, { seeds: SEEDS }));
  t(/<div class="ret neg">-3% \(3 ปี\)<\/div>/.test(fsrc), 'render: fixed ret text + class as on the v2 page');
  const fz = { ...d, v2Display: { cards: { pe: { v: '~22.6x', d: 'Forward P/E ~20.2x' } } } };
  t(R.toV2Source(fz, C.compute(fz, { seeds: SEEDS })).includes('<div class="v neu">~22.6x</div><div class="d">Forward P/E ~20.2x</div>'), 'render: frozen card (cron v2 never touched it) = v2 value + v2 .d');
  const neg = load('ZTS-real'); neg.fundamentals.eps = -0.77;
  const ek = neg.metrics.cards.map((c) => (typeof c === 'string' ? c : c.key));
  if (!ek.includes('eps')) neg.metrics.cards = neg.metrics.cards.filter((c) => (typeof c === 'string' ? c : c.key) !== 'pe').concat(['eps']);
  else neg.metrics.cards = neg.metrics.cards.filter((c) => (typeof c === 'string' ? c : c.key) !== 'pe');
  const K = require('../../tools/v3/cards.js');
  t.eq(K.renderCard('eps', { doc: neg, cur: '$', d: {}, fq: neg.fundamentals }).v, '~−$0.77', 'eps card: a loss prints "−$0.77" (was "$-0.77")');
}

// ── migrator: the fixed pipeline on real v2 fixtures → audit clean (the author's figures on the v3 page) ──
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dfix-')));
{
  const D = path.join(tmp, 'mig'); fs.mkdirSync(D);
  for (const s of ['AAPL', 'BBL', 'CASY', 'SRE', 'DPZ', 'NFG']) fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', `${s}-v2.html`), path.join(D, `${s}.html`));
  for (const s of ['AAPL', 'BBL', 'CASY', 'SRE', 'DPZ', 'NFG']) {
    const m = MV.migrateOne(s, { reportsDir: D, noStale: true, seeds: SEEDS, manifest: new Map([[s, MF.updated]]), stats: { apxMs: 0 } });
    const r = AU.auditDoc(s, m.doc, { raw: m.raw, ref: 'fixture' }, { seeds: SEEDS });
    t(m.doc && r.valueDiffs === 0 && !r.sanity.length, `${s}: fixed migrator → display audit clean (valueDiffs 0 · sanity ok)`, JSON.stringify({ v: r.values.slice(0, 3), s: r.sanity }));
    if (s === 'AAPL') {
      t.eq([m.doc.v2Display.fv, m.doc.v2Display.targets], [262, [235, 312, 417]], 'AAPL: v2Display = the author FV + targets (report-data)');
      const g = m.doc.v2Display.gauge || [];
      t(g.some((x) => x.text === '$400' && /สูงสุด/.test(x.label)) && g.some((x) => x.ref === 'analystTgt'), 'AAPL: the author gauge ticks carried ("$400 เป้าสูงสุด" + the analyst token)', JSON.stringify(g));
    }
    // without v2Display the same doc shows other values (what the pre-fix migrator produced)
    if (s === 'AAPL') { const x = { ...m.doc }; delete x.v2Display; t(AU.auditDoc(s, x, { raw: m.raw }, { seeds: SEEDS }).valueDiffs > 0, 'AAPL without v2Display → value diffs (the bug class)'); }
  }
  // cron simulation: a card the v2 cron rewrites is "live" — a fixed card is not
  const raw = fs.readFileSync(path.join(D, 'BBL.html'), 'utf8'), parsed = require('../../tools/migrate-v3/parse-v2.js').parseV2('BBL', raw);
  const live = DS.liveParts(raw, parsed);
  t(live && live.cards instanceof Set, 'liveParts simulates the v2 cron');
  t.eq(DS.pyConvOf(['+10.0% (3 ปี · ≈3.2%/ปี)', '+41.9% (3 ปี · ≈12.4%/ปี)', '+65.8% (3 ปี · ≈18.4%/ปี)'], 3), 'cagr', 'pyConvOf: CAGR pairs');
  t.eq(DS.pyConvOf(['+30.0% / 10.0%/ปี', '+60.0% / 20.0%/ปี', '+90.0% / 30.0%/ปี'], 3), 'linear', 'pyConvOf: linear pairs');
}

// ── audit: served baseline · author "null" is not a render leak ──
{
  const zts = load('ZTS-real'); zts.meta.migratedFrom = MF; zts.meta.sub = `${zts.meta.sub} (pe:null ใน meta)`;
  const v = C.compute(zts, { seeds: SEEDS }), h = B.expandReport(R.toV2Source(zts, v));
  AU.auditDoc('ZTS', zts, { raw: R.toV2Source(zts, v) }, { seeds: SEEDS });   // sets the seeds the sanity re-render uses
  t.eq(AU.sanityOf(h, zts, v), [], 'sanity: "null" the author wrote is not a leak');
  t(AU.sanityOf(h.replace('<footer>', '<p>null</p><footer>'), zts, v).some((x) => /null/.test(x)), 'sanity: an extra "null" beyond the author\'s → leak');
  const raw = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'SRE-v2.html'), 'utf8'), px = require('../../tools/report-meta.js').readReportData(raw).data.values.px;
  const served = AU.v2Served(raw);
  t(served === require('../../tools/update-prices.js').derivedPassV2(raw, px, {}).html && AU.v2Served(served) === served, 'v2Served = the v2 cron pass at the page\'s own price (idempotent)');
  t.eq(AU.v2Served('<html>no report-data</html>'), '<html>no report-data</html>', 'v2Served: unreadable page → unchanged');
}

// ── display gate of convert --write / adopt ──
{
  const D = path.join(tmp, 'gate'); fs.mkdirSync(D); fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', 'SRE-v2.html'), path.join(D, 'SRE.html'));
  const m = MV.migrateOne('SRE', { reportsDir: D, noStale: true, seeds: SEEDS, manifest: new Map([['SRE', MF.updated]]), stats: { apxMs: 0 } });
  t.eq(MV.displayGate('SRE', m.doc, m.raw, SEEDS), [], 'displayGate: the fixed migrator doc passes');
  const bad = JSON.parse(JSON.stringify(m.doc)); bad.v2Display.targets = [70, 113, 132];
  t(MV.displayGate('SRE', bad, m.raw, SEEDS).some((x) => /valueDiffs/.test(x)), 'displayGate: a target the page shows differently → refused');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'migrate-v3.js'), 'utf8'), tr = fs.readFileSync(path.join(ROOT, 'tools', 'migrate-v3', 'transcribe.js'), 'utf8');
  t(/const da = displayGate\(sym, m\.doc, m\.raw, o\.seeds\);\s*\n\s*if \(da\.length\)[^\n]*return 1;/.test(src) && src.indexOf('const da = displayGate') < src.indexOf('IO.write(json, m.doc)'), 'convert --write calls the display gate before writing');
  t(/mv\.displayGate\(sym, full, m\.raw, o\.seeds\)/.test(tr) && tr.indexOf('mv.displayGate(') < tr.indexOf('IO.write(json, full)'), 'adopt calls the display gate before writing');
}

// ── remigrate on a temp git repo ──
{
  const env = () => { const e = { ...process.env }; for (const k of AU.GIT_SCRUB) delete e[k]; return e; };
  const REPO = path.join(tmp, 'repo'), REP = path.join(REPO, 'reports'); fs.mkdirSync(REP, { recursive: true });
  const git = (...a) => cp.execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: REPO, env: env(), stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  git('init', '-q');
  t(fs.realpathSync.native(git('rev-parse', '--show-toplevel').trim()) === REPO, 'temp repo is its own toplevel (GIT_* scrubbed)');
  for (const s of ['AAPL', 'SRE']) fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', `${s}-v2.html`), path.join(REP, `${s}.html`));
  git('add', '-A'); git('commit', '-q', '-m', 'v2');
  // the pre-fix migration: the migrator doc WITHOUT v2Display (what 4c wrote) · SRE = a doc whose v2 page is not in git (fails) · ZZZ = not migrated (skip)
  const olds = {};
  for (const s of ['AAPL', 'SRE']) {
    const m = MV.migrateOne(s, { reportsDir: REP, noStale: true, seeds: SEEDS, manifest: new Map([[s, MF.updated]]), stats: { apxMs: 0 } });
    const d = JSON.parse(JSON.stringify(m.doc)); delete d.v2Display; olds[s] = d;
  }
  IO.write(path.join(REP, 'AAPL.json'), olds.AAPL); fs.unlinkSync(path.join(REP, 'AAPL.html'));
  const oldHash = IO.freshHash(olds.AAPL);
  fs.writeFileSync(path.join(REPO, 'reports.json'), JSON.stringify([{ symbol: 'AAPL', updated: MF.updated, hash: oldHash }]));
  git('add', '-A'); git('commit', '-q', '-m', 'migrate: v3 AAPL');
  const zzz = load('ZTS-real'); zzz.symbol = 'ZZZ'; IO.write(path.join(REP, 'ZZZ.json'), zzz);
  const ghost = JSON.parse(JSON.stringify(olds.SRE)); ghost.symbol = 'GHOST'; ghost.meta.migratedFrom = { ...ghost.meta.migratedFrom }; IO.write(path.join(REP, 'GHOST.json'), ghost);
  const before = fs.readFileSync(path.join(REP, 'AAPL.json'), 'utf8');
  t(AU.auditDoc('AAPL', IO.read(path.join(REP, 'AAPL.json')), AU.v2Source('AAPL', REP), { seeds: SEEDS }).valueDiffs > 0, 'setup: the pre-fix AAPL doc displays other values');
  const cli = (args, e2) => { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'migrate-v3.js'), 'remigrate', ...args], { encoding: 'utf8', cwd: ROOT, env: { ...env(), MIGRATE_V3_ALLOW_REAL: '', ...(e2 || {}) } }); return { code: r.status, out: r.stdout + r.stderr }; };
  const common = ['--reports-dir', REP, '--today', '2026-09-10'];
  const dry = cli(['AAPL', ...common]);
  t(dry.code === 0 && /FIXED AAPL \(fresh · dry-run — not written\) · before VALUE-DIFF/.test(dry.out) && fs.readFileSync(path.join(REP, 'AAPL.json'), 'utf8') === before, 'remigrate dry-run: FIXED, nothing written', dry.out);
  const guard = cli(['AAPL', ...common, '--write']);
  t(guard.code === 1 && /MIGRATE_V3_ALLOW_REAL/.test(guard.out) && fs.readFileSync(path.join(REP, 'AAPL.json'), 'utf8') === before, 'remigrate --write into a checkout reports/ without MIGRATE_V3_ALLOW_REAL=1 → refused');
  const csv = path.join(tmp, 'audit.csv');
  fs.writeFileSync(csv, 'symbol,status,valueDiffs,roundingDiffs,textLost,sanity\nAAPL,VALUE-DIFF,2,0,0,\nGHOST,VALUE-DIFF,1,0,0,\nZZZ,SKIP,0,0,0,\nOKK,OK,0,0,0,\n');
  t.eq(RMG.failingOf(fs.readFileSync(csv, 'utf8')), ['AAPL', 'GHOST'], 'failingOf: non-OK, non-SKIP rows');
  const w = cli(['--all-failing', csv, ...common, '--write'], { MIGRATE_V3_ALLOW_REAL: '1' });
  t(w.code === 1 && /FIXED AAPL \(fresh\)/.test(w.out) && /STILL-FAILING GHOST · หน้า v2: /.test(w.out) && /FIXED 1 .* STILL-FAILING 1/.test(w.out), 'remigrate --all-failing --write: AAPL FIXED · GHOST STILL-FAILING (no v2 page) · exit 1', w.out);
  const now = IO.read(path.join(REP, 'AAPL.json'));
  t(IO.verifySig(now) && now.v2Display && now.v2Display.fv === 262, 'written doc: signed · carries the author FV');
  t.eq(now.meta.migratedFrom, { updated: MF.updated, v2Hash: olds.AAPL.meta.migratedFrom.v2Hash, prevHash: oldHash }, 'migratedFrom kept (updated · v2Hash) + prevHash = the manifest row hash');
  t.eq(now.market, olds.AAPL.market, 'market kept (cron-owned)');
  t(B.updatedFor({ hash: oldHash, updated: MF.updated }, IO.freshHash(now), now.meta.migratedFrom, '2026-09-26T00:00:00+07:00') === MF.updated, 'build keeps the v2 updated for the remigrated doc');
  const a = AU.auditDoc('AAPL', now, AU.v2Source('AAPL', REP), { seeds: SEEDS });
  t(a.valueDiffs === 0 && !a.sanity.length, 'after remigrate: audit clean', JSON.stringify(a.values.slice(0, 2)));
  const skip = cli(['ZZZ', ...common]);
  t(/SKIP ZZZ · ไม่มี meta\.migratedFrom/.test(skip.out), 'a non-migrated v3 doc → SKIP', skip.out);
  const u = cli([...common]);
  t(u.code === 1 && /ต้องมี <SYM>/.test(u.out), 'no symbols → usage error');
}

t(fs.readdirSync(REAL).length === realBefore, 'real reports/ untouched');
fs.rmSync(tmp, { recursive: true, force: true });
t.done();
