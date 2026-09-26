'use strict';
// Plan 4c-audit — tools/migrate-v3.js audit (tools/migrate-v3/audit.js) · fixtures in a temp git repo only (never reports/ · .work/ · .queue/)
// git runs with GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE/GIT_COMMON_DIR/GIT_PREFIX/GIT_OBJECT_DIRECTORY scrubbed + core.hooksPath=/dev/null
//   (under the pre-push hook GIT_DIR points at the real repo — memory: git-hook-env-git-init-trap)
const t = require('./_t.js')('migrate-audit');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const IO = require('../../tools/v3/io.js');
const AU = require('../../tools/migrate-v3/audit.js');
const RV = require('../../tools/report-values.js');

const env = () => { const e = { ...process.env }; for (const k of AU.GIT_SCRUB) delete e[k]; return e; };
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mig-audit-')));
const REPO = path.join(tmp, 'repo'), REP = path.join(REPO, 'reports');
fs.mkdirSync(REP, { recursive: true });
const git = (...a) => cp.execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: REPO, env: env(), stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const REAL = path.join(ROOT, 'reports');
const realBefore = fs.readdirSync(REAL).length;

git('init', '-q');
t(fs.realpathSync.native(git('rev-parse', '--show-toplevel').trim()) === REPO, 'temp repo is its own toplevel (GIT_* scrubbed)');
// "correct migration" fixture: the v2 page IS the v3 doc rendered as a v2 source (R.toV2Source — same stock-meta/report-data/tokens
//   shape as a v2 file) ⇒ v2 and v3 display the same figures by construction · ZTS: committed deletion then a later price refresh ·
//   FER: deletion not yet committed (the .html is only in HEAD)
const B = require('../../build.js'), R = require('../../_template/v3/render.js'), C = require('../../tools/v3/compute.js');
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
const MF = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
const docs = {};
for (const [s, f] of [['ZTS', 'ZTS-real'], ['FER', 'FER-real']]) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'v3', `${f}.json`), 'utf8')); delete d._sig; d.meta.migratedFrom = MF;
  docs[s] = d;
  fs.writeFileSync(path.join(REP, `${s}.html`), R.toV2Source(d, C.compute(d, { seeds: SEEDS })));
}
git('add', '-A'); git('commit', '-q', '-m', 'add v2');
IO.write(path.join(REP, 'ZTS.json'), docs.ZTS); fs.unlinkSync(path.join(REP, 'ZTS.html'));
git('add', '-A'); git('commit', '-q', '-m', 'migrate: v3 ZTS');
// the v3 price is newer than the v2 snapshot (cron) — comparison must still be at the v2 market (sanity: page = current market)
{ const d = IO.read(path.join(REP, 'ZTS.json')); delete d._sig; d.market = { ...d.market, px: +(d.market.px * 1.1).toFixed(2) }; IO.write(path.join(REP, 'ZTS.json'), d); }
git('add', '-A'); git('commit', '-q', '-m', 'price: refresh');
IO.write(path.join(REP, 'FER.json'), docs.FER); fs.unlinkSync(path.join(REP, 'FER.html'));

const cli = (args) => { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'migrate-v3.js'), 'audit', ...args], { encoding: 'utf8', cwd: ROOT, env: process.env }); return { code: r.status, out: r.stdout + r.stderr }; };
const OUT = path.join(tmp, 'out', 'audit');
const rowOf = (csv, s) => (csv.split('\n').find((l) => l.startsWith(s + ',')) || '').split(',');

// ── a correct migration → OK ──
{
  const r = cli(['--all', '--reports-dir', REP, '--out', OUT]);
  const csv = fs.existsSync(OUT + '.csv') ? fs.readFileSync(OUT + '.csv', 'utf8') : '';
  t(r.code === 0, 'audit --all on correct migrations → exit 0', r.out);
  t(csv.split('\n')[0] === 'symbol,status,valueDiffs,roundingDiffs,textLost,sanity', 'csv header');
  t.eq(rowOf(csv, 'ZTS').slice(1, 6), ['OK', '0', '0', '0', ''], 'ZTS (committed deletion · price refreshed after): OK · 0 value · 0 rounding · 0 lost · sanity clean');
  t.eq(rowOf(csv, 'FER').slice(1, 3), ['OK', '0'], 'FER (deletion not committed → HEAD .html): OK · valueDiffs 0');
  const md = fs.readFileSync(OUT + '.md', 'utf8');
  t(/\| audited \| 2 \|/.test(md) && /\| OK \| 2 \|/.test(md) && /## Failing reports\s+- none/.test(md), 'md summary counts', md.slice(0, 600));
  const one = AU.auditOne('ZTS', { reportsDir: REP, seeds: SEEDS });
  t(one.ref && /^[0-9a-f]{9}\^$/.test(one.ref), 'auditOne: v2 read at the deleting commit^', one.ref);
  t.eq(AU.auditOne('FER', { reportsDir: REP, seeds: SEEDS }).ref, 'HEAD', 'auditOne: uncommitted deletion → v2 read at HEAD');
}

// ── splitValues (unit): one printed step = accepted drift · moved numbers = info · the rest = value ──
{
  const runs = [{ zone: 's2', del: '$103.95', ins: '$103.94' }, { zone: 's6', del: '$77.00 +1.9%', ins: '$76.50 +1.3%' }, { zone: 'header', del: '$67.24 – $110.20 •', ins: '·' }, { zone: 's3', del: '−4%', ins: '−5%' }];
  const k = AU.splitValues(runs, '<header>ราคา · กรอบ 52 สัปดาห์ $67.24 – $110.20</header>');
  t.eq([k.step.map((x) => x.del), k.moved.map((x) => x.del), k.value.map((x) => x.del)], [['$103.95', '−4%'], ['$67.24 – $110.20 •'], ['$77.00 +1.9%']], 'splitValues: 1 cent / 1 pp = step · range moved in the header = moved · 50 cents off a 2-dp figure = value');
}

// ── injected wrong FV → value diff + exit 1 ──
{
  const good = IO.read(path.join(REP, 'ZTS.json'));
  const bad = JSON.parse(JSON.stringify(good)); delete bad._sig;
  const i = bad.legs.findIndex((l) => l.method === 'pe'); bad.legs[i].inputs.multiple = +(bad.legs[i].inputs.multiple * 1.2).toFixed(2);
  IO.write(path.join(REP, 'ZTS.json'), bad);
  const fv2 = RV.fmtPrice(C.compute(docs.ZTS, { seeds: SEEDS }).fv);
  const r = cli(['ZTS', '--reports-dir', REP, '--out', OUT]);
  const csv = fs.readFileSync(OUT + '.csv', 'utf8');
  t(r.code === 1 && rowOf(csv, 'ZTS')[1] === 'VALUE-DIFF' && +rowOf(csv, 'ZTS')[2] > 0, 'wrong FV → VALUE-DIFF · valueDiffs > 0 · exit 1', r.out);
  t(/✗ ZTS VALUE-DIFF/.test(r.out) && fs.readFileSync(OUT + '.md', 'utf8').includes(`$${fv2}`), `the v2 FV $${fv2} appears in the listed value diffs`);
  IO.write(path.join(REP, 'ZTS.json'), (() => { const d = JSON.parse(JSON.stringify(good)); delete d._sig; return d; })());
}

// ── a leftover token → sanity failure ──
{
  const good = IO.read(path.join(REP, 'FER.json'));
  const bad = JSON.parse(JSON.stringify(good)); delete bad._sig; bad.meta.sub = `${bad.meta.sub} {{ leftover }}`;
  IO.write(path.join(REP, 'FER.json'), bad);
  const r = cli(['FER', '--reports-dir', REP, '--out', OUT]);
  const csv = fs.readFileSync(OUT + '.csv', 'utf8');
  t(r.code === 1 && /SANITY/.test(rowOf(csv, 'FER')[1]) && /token ค้าง/.test(rowOf(csv, 'FER').slice(5).join(',')), 'leftover {{…}} on the v3 page → sanity failure · exit 1', r.out);
  IO.write(path.join(REP, 'FER.json'), (() => { const d = JSON.parse(JSON.stringify(good)); delete d._sig; return d; })());
}

// ── sanity unit: NaN text · missing section · header price ≠ market ──
{
  const d = IO.read(path.join(REP, 'ZTS.json')); const view = C.compute(d, { seeds: SEEDS }); const page = B.expandReport(R.toV2Source(d, view));
  t.eq(AU.sanityOf(page, d, view), [], 'sanity: clean page → []');
  t(AU.sanityOf(page.replace('<div class="n">7</div>', '<div class="n">x</div>'), d, view).some((x) => /หมวดหาย: 7/.test(x)), 'sanity: missing section 7');
  t(AU.sanityOf(page.replace('<footer>', '<p>NaN</p><footer>'), d, view).some((x) => /NaN/.test(x)), 'sanity: NaN in visible text');
  t(AU.sanityOf(page, { ...d, market: { ...d.market, px: d.market.px + 1 } }, view).some((x) => /market\.px/.test(x)), 'sanity: page price ≠ market.px');
}

// ── guards: symbol not v3 · --out under reports/ · real reports/ untouched ──
{
  const r = cli(['NOPE', '--reports-dir', REP, '--out', OUT]);
  t(r.code === 1 && /NOPE SANITY/.test(r.out), 'a symbol that is not v3 → reported, exit 1', r.out);
  const r2 = cli(['ZTS', '--reports-dir', REP, '--out', path.join(REAL, 'x', 'audit')]);
  t(r2.code === 1 && /read-only/.test(r2.out) && !fs.existsSync(path.join(REAL, 'x')), '--out under reports/ → refused, nothing created', r2.out);
  const r3 = cli(['ZTS', '--all', '--reports-dir', REP, '--out', OUT]);
  t(r3.code === 1 && /อย่างใดอย่างหนึ่ง/.test(r3.out), '<SYM> with --all → usage error');
}

t(fs.readdirSync(REAL).length === realBefore, 'real reports/ untouched');
fs.rmSync(tmp, { recursive: true, force: true });
t.done();
