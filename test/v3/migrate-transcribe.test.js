'use strict';
// Plan 4c-transcribe — tools/migrate-v3.js draft|adopt (tools/migrate-v3/transcribe.js) · tmp dirs only (never reports/ · .work/ · .queue/)
// HUMAN fixture = AAPL (leg 3 analyst target as fv) · a "correct transcription" = the migrator draft with fvWeights solved to v2's FV 262 (the ZTS way)
const t = require('./_t.js')('migrate-transcribe');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const IO = require('../../tools/v3/io.js');
const S = require('../../tools/v3/schema.js');
const TR = require('../../tools/migrate-v3/transcribe.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-tr-'));
const REP = path.join(tmp, 'reports'); fs.mkdirSync(REP);
const WORK = path.join(tmp, 'work');
for (const s of ['AAPL', 'SRE']) fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', `${s}-v2.html`), path.join(REP, `${s}.html`));
const MAN = path.join(tmp, 'reports.json');
fs.writeFileSync(MAN, JSON.stringify(['AAPL', 'SRE'].map((s) => ({ symbol: s, updated: '2026-09-01T00:00:00+07:00', hash: 'x' }))));
const cli = (args, env) => { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'migrate-v3.js'), ...args], { encoding: 'utf8', cwd: ROOT, env: { ...process.env, MIGRATE_V3_ALLOW_REAL: '', ...(env || {}) } }); return { code: r.status, out: r.stdout + r.stderr }; };
const common = ['--reports-dir', REP, '--head-manifest', MAN, '--no-stale'];
const REAL = path.join(ROOT, 'reports');   // guard target only
const realBefore = fs.readdirSync(REAL).length;
const PD = '2026-09-10';   // AAPL fixture values.priceDate — gate day for adopt (E27 is not a property of the transcription)
const aaplRaw = fs.readFileSync(path.join(REP, 'AAPL.html'));

// ── draft ──
{
  const r = cli(['draft', 'AAPL', ...common, '--work-dir', WORK, '--today', PD]);
  const jf = path.join(WORK, 'AAPL.json'), bf = path.join(WORK, 'AAPL.brief.md');
  t(r.code === 0 && fs.existsSync(jf) && fs.existsSync(bf), 'draft AAPL (HUMAN) writes <work>/AAPL.json + AAPL.brief.md', r.out.slice(-400));
  const doc = JSON.parse(fs.readFileSync(jf, 'utf8'));
  t(!('market' in doc) && !('_sig' in doc) && Object.keys(doc).every((k) => S.OWNER(k) === 'worker'), 'draft: worker-owned keys only (no market / _sig)');
  t.eq(doc.meta.migratedFrom && doc.meta.migratedFrom.updated, '2026-09-01T00:00:00+07:00', 'draft keeps meta.migratedFrom');
  const brief = fs.readFileSync(bf, 'utf8');
  t(/bucket: \*\*HUMAN\*\*/.test(brief) && /leg 3 analyst target as fv/.test(brief), 'brief: bucket + H reason', brief.slice(0, 400));
  t(/\| FV \| 262 \|/.test(brief) && /\| Bear target \| 235 \|/.test(brief) && /\| Base target \| 312 \|/.test(brief) && /\| Bull target \| 417 \|/.test(brief), 'brief: v2 FV + three scenario targets', (brief.match(/\| (FV|Bear|Base|Bull)[^\n]*/g) || []).join('\n'));
  t(/\| FV low \| 222 \|/.test(brief) && /\| FV high \| 315 \|/.test(brief) && /\| Scenario years \| 3 \|/.test(brief), 'brief: FV low/high + years');
  t(/\| Verdict class \| bad \|/.test(brief) && /\| MOS \| −25% \|/.test(brief) && /\| Currency \| USD \|/.test(brief) && /\| Analysis date \|[^\n]*22–23 มิ\.ย\. 2026/.test(brief), 'brief: verdict · MOS · currency · analysis date');
  t(/node tools\/migrate-v3\.js adopt AAPL/.test(brief) && /ห้ามวิเคราะห์ใหม่/.test(brief), 'brief: next step + owner directive');
  t(/FV[^\n]*262[^\n]*260\.76[^\n]*✗/.test(brief), 'brief: the migrator draft vs v2 status per key number', (brief.match(/\| FV \|[^\n]*/) || [''])[0]);
  const again = cli(['draft', 'AAPL', ...common, '--work-dir', WORK]);
  t(again.code === 1 && /--force/.test(again.out), 'draft refuses to overwrite an existing draft without --force', again.out.slice(-200));
  fs.writeFileSync(jf, '{"edited":true}');
  const again2 = cli(['draft', 'AAPL', ...common, '--work-dir', WORK]);
  t(again2.code === 1 && fs.readFileSync(jf, 'utf8') === '{"edited":true}', 'refused draft leaves the worker file untouched');
  const forced = cli(['draft', 'AAPL', ...common, '--work-dir', WORK, '--force']);
  t(forced.code === 0 && JSON.parse(fs.readFileSync(jf, 'utf8')).symbol === 'AAPL', 'draft --force overwrites');
  // never under reports/: a work dir inside a checkout's reports/ → refused
  const FAKE = path.join(tmp, 'checkout'), FREP = path.join(FAKE, 'reports'); fs.mkdirSync(FREP, { recursive: true });
  fs.writeFileSync(path.join(FAKE, 'reports.json'), '[]'); fs.writeFileSync(path.join(FAKE, 'build.js'), '');
  const rw = cli(['draft', 'AAPL', ...common, '--work-dir', path.join(FREP, 'w')]);
  t(rw.code === 1 && /reports\//.test(rw.out) && !fs.existsSync(path.join(FREP, 'w')), 'draft --work-dir under a reports/ dir → refused, nothing created', rw.out.slice(-200));
  const nf = cli(['draft', 'NOPE', ...common, '--work-dir', WORK]); t(nf.code === 1 && /ไม่พบ/.test(nf.out), 'draft on a missing symbol → exit 1');
  t(fs.existsSync(path.join(REP, 'AAPL.html')) && !fs.existsSync(path.join(REP, 'AAPL.json')), 'draft never writes the reports dir');
}

// the "transcriber": solve fvWeights so the three fv legs give v2's FV 262 (ZTS pilot pattern) — nothing else changes
const WF = path.join(WORK, 'AAPL.json');
const base = JSON.parse(fs.readFileSync(WF, 'utf8'));
function transcribed() {
  const d = JSON.parse(JSON.stringify(base));
  const x = (315 - 262) / (315 * 2 - (247.8 + 219.4804936849534));   // w0 = w1 = x · w2 = 1 − 2x
  d.fvWeights = [x, x, 1 - 2 * x];
  return d;
}
const put = (d, f) => { fs.writeFileSync(f || WF, JSON.stringify(d, null, 2)); return f || WF; };
const adopt = (extra, env) => cli(['adopt', 'AAPL', ...common, '--doc', WF, '--today', PD, ...(extra || [])], env);

// ── adopt refusals ──
{
  const NOPE = 'ZZZNOPE';
  t(!fs.existsSync(path.join(REAL, NOPE + '.html')), `${NOPE} is not a real report`);
  const rr = cli(['adopt', NOPE, '--reports-dir', REAL, '--head-manifest', MAN, '--doc', WF]);
  t(rr.code === 1 && /MIGRATE_V3_ALLOW_REAL/.test(rr.out), 'adopt on the real reports/ without MIGRATE_V3_ALLOW_REAL=1 → refused', rr.out.slice(-200));
  const rc = cli(['adopt', NOPE, '--reports-dir', path.join(ROOT, 'REPORTS'), '--head-manifest', MAN, '--doc', WF]);
  t(rc.code === 1 && /MIGRATE_V3_ALLOW_REAL/.test(rc.out), 'adopt: case alias of reports/ → refused');
  // migrator draft as-is: FV 260.76 ≠ 262 → refused, both values printed, nothing written
  put(base);
  const r = adopt();
  t(r.code === 1 && /FV: v2 262 · v3 260\.76/.test(r.out) && fs.existsSync(path.join(REP, 'AAPL.html')) && !fs.existsSync(path.join(REP, 'AAPL.json')), 'adopt refuses when FV differs (v2 value vs v3 value) — nothing written', r.out.slice(-600));
  // one scenario target off (Bull exit multiple +1) → refused naming the target
  const d2 = transcribed(); d2.scenarios.cases[2].exitMultiple += 1; put(d2);
  const r2 = adopt();
  t(r2.code === 1 && /Bull target: v2 417 · v3 4\d\d\.\d\d/.test(r2.out) && !/✗ FV:/.test(r2.out), 'adopt refuses when a scenario target differs (only that check fails)', r2.out.slice(-600));
  // meta.migratedFrom.updated differing from the HEAD manifest row → refused (a draft of another v2 revision)
  const d3 = transcribed(); d3.meta.migratedFrom = { ...d3.meta.migratedFrom, updated: '2026-08-01T00:00:00+07:00' }; put(d3);
  const r3 = adopt();
  t(r3.code === 1 && /meta\.migratedFrom\.updated/.test(r3.out) && /2026-08-01T00:00:00\+07:00/.test(r3.out) && fs.existsSync(path.join(REP, 'AAPL.html')), 'adopt refuses a doc whose meta.migratedFrom.updated differs from the manifest row', r3.out.slice(-400));
  // author-fact sanity: symbol / currency
  const d4 = transcribed(); d4.symbol = 'AAPX'; put(d4);
  const r4 = adopt();
  t(r4.code === 1 && /symbol: v2 AAPL · v3 AAPX/.test(r4.out), 'adopt refuses a doc whose symbol differs', r4.out.slice(-300));
  // cron/io-owned keys → refused (adopt merges market from the migrator)
  const d5 = { ...transcribed(), market: { px: 1 } }; put(d5);
  const r5 = adopt();
  t(r5.code === 1 && /market: /.test(r5.out), 'adopt refuses a doc carrying market (cron-owned)', r5.out.slice(-300));
  // no manifest row and no --head-manifest → refused
  put(transcribed());
  const lines = [];
  const MV = require('../../tools/migrate-v3.js');
  const c6 = TR.runAdopt('AAPL', { ...MV.parseArgs(['--reports-dir', REP, '--no-stale', '--doc', WF, '--today', PD]), manifest: new Map() }, (x) => lines.push(x), MV);
  t(c6 === 1 && lines.some((l) => /manifest/.test(l)) && !fs.existsSync(path.join(REP, 'AAPL.json')), 'adopt without a manifest row → refused', lines.join('\n'));
  // checkDoc fails after the write → .html restored byte-identical, .json removed
  const l7 = [];
  const c7 = TR.runAdopt('AAPL', { ...MV.parseArgs([...common, '--doc', WF, '--today', PD]) }, (x) => l7.push(x), MV, { checkDoc: () => ({ errors: [{ id: 'E99', msg: 'injected' }], warnings: [] }) });
  t(c7 === 1 && fs.readFileSync(path.join(REP, 'AAPL.html')).equals(aaplRaw) && !fs.existsSync(path.join(REP, 'AAPL.json')) && l7.some((l) => /E99/.test(l)), 'adopt: checkDoc error after write → rolled back exactly', l7.join('\n'));
}

// ── adopt passes ──
{
  // stale draft: the nightly cron patched the .html after draft → v2Hash in the draft is stale · updated = manifest row → adopt re-derives
  const d = transcribed(); const freshMf = d.meta.migratedFrom; d.meta.migratedFrom = { ...freshMf, v2Hash: '000000000000' }; put(d);
  const r = adopt();
  t(r.code === 0 && fs.existsSync(path.join(REP, 'AAPL.json')) && !fs.existsSync(path.join(REP, 'AAPL.html')), 'adopt a correct transcription: .json written, .html deleted', r.out.slice(-800));
  t(/✓ FV: v2 262 · v3 262\.00/.test(r.out) && /✓ verdict: v2 bad · v3 bad/.test(r.out), 'adopt prints each key-number check');
  // the equivalence gate is printed as information and does not block (this transcription is not CLEAN)
  const eq = /ℹ equivalence \(info only — does not block adopt\): (CLEAN|VALUE-DRIFT|HUMAN)/.exec(r.out);
  t(eq && eq[1] !== 'CLEAN', 'equivalence result printed (info only) · non-CLEAN bucket did not block', eq && eq[0]);
  const doc = IO.read(path.join(REP, 'AAPL.json'));
  t(IO.verifySig(doc) && doc.market && doc.market.px === 326.57, 'adopted doc: signed · market from the v2 page');
  t.eq(doc.meta.migratedFrom, freshMf, 'stale draft v2Hash → adopted with the fresh migratedFrom (manifest updated + current freshHash)');
  t(/ℹ meta\.migratedFrom\.v2Hash 000000000000 → /.test(r.out), 'adopt reports the v2Hash re-derivation');
  // ship --migrate commits it unchanged: migratePlan accepts (.json with migratedFrom · .html gone · HEAD has .html)
  const Sh = require('../../tools/queue/ship.js');
  const f = path.join(REP, 'AAPL.json');
  const plan = Sh.migratePlan(['AAPL'], () => ({ json: fs.existsSync(f), html: fs.existsSync(path.join(REP, 'AAPL.html')), migrated: Sh.isMigratedDoc(f), headHtml: true, headJson: false }));
  t.eq(plan, { files: ['reports/AAPL.json', 'reports/AAPL.html'], refusals: [] }, 'ship --migrate plan accepts the adopted doc');
  const again = adopt();
  t(again.code === 1 && /v3 แล้ว|already v3/.test(again.out), 'adopt on an already-v3 symbol → refused');
}

// ── key-number comparison (unit) ──
{
  const v2 = { symbol: 'X', currency: 'USD', fv: { v: 262, text: '262' }, targets: [{ name: 'Bear', v: 235, text: '235' }, { name: 'Base', v: 312, text: '312' }, { name: 'Bull', v: 417, text: '417' }], mos: { v: -24.6, text: '−25%' }, verdict: 'bad' };
  const v3 = { symbol: 'X', currency: 'USD', fv: 262.4, targets: [234.6, 312.49, 417.2], mos: -24.56, verdict: 'bad' };
  t.eq(TR.compareKeys(v2, v3).filter((c) => !c.ok).map((c) => c.what), [], 'within the written rounding (262 ± 0.5 · 235 ± 0.5 · −25% ± 0.5 pp) → all pass');
  const bad = TR.compareKeys(v2, { ...v3, fv: 262.51, verdict: 'ok', mos: -25.6, targets: [234.49, 312, 417] }).filter((c) => !c.ok).map((c) => c.what);
  t.eq(bad, ['FV', 'Bear target', 'MOS', 'verdict'], 'beyond the rounding → FV · target · MOS · verdict fail');
  const two = TR.compareKeys({ ...v2, fv: { v: 103.95, text: '103.95' } }, { ...v3, fv: 103.94 }).find((c) => c.what === 'FV');
  t(!two.ok && /103\.95/.test(two.v2) && /103\.94/.test(two.v3), 'author wrote 2 dp → 1 cent is a value difference');
  const miss = TR.compareKeys(v2, { ...v3, targets: [] }).filter((c) => !c.ok).map((c) => c.what);
  t.eq(miss, ['Bear target', 'Base target', 'Bull target'], 'v3 without targets → each fails');
}

// ── migrated-only allowances (measured blockers · spec §10 "4c-transcribe") — each: migrated passes · NEW still errors ──
{
  const CV = require('../check-v3.js');
  const load = (f) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`))); delete d._sig; return d; };
  const MF = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
  const mig = (d) => { d.meta.migratedFrom = MF; return d; };
  const run = (d) => CV.checkDoc(d, { skipSig: true, seeds: {}, today: d.market.priceDate });
  const ids = (r, k) => r[k].map((x) => x.id);
  // (1) E17 — v2 author declared one fv leg (others "บริบท — ไม่รวมใน FV") → W33 on a migrated doc · E17 on NEW (EQIX-real = §13 ข้อ 4)
  const e0 = run(load('EQIX-real')), e1 = run(mig(load('EQIX-real')));
  t(ids(e0, 'errors').includes('E17') && !ids(e0, 'warnings').includes('W33'), 'E17: NEW doc with one fv leg still errors (EQIX-real)');
  t(!ids(e1, 'errors').includes('E17') && ids(e1, 'warnings').includes('W33'), 'E17 allowance: migrated doc with one fv leg → W33 warning, no error', JSON.stringify(e1.errors));
  { const d = mig(load('EQIX-real')); d.legs.forEach((l) => { l.role = 'context'; }); d.fvWeights = null; const r = run(d);
    t(ids(r, 'errors').length > 0, 'E17 allowance never covers zero fv legs', JSON.stringify(ids(r, 'errors'))); }
  // (2) E52 — declared sotp/nav with no extras table (v2 page has none) → note is the evidence on a migrated doc
  const fer = () => { const d = load('FER-real'); const i = d.legs.findIndex((l) => l.method === 'declared' && ['sotp', 'nav'].includes(l.inputs.basis)); delete d.legs[i].inputs.extrasRef; return { d, i }; };
  { const { d } = fer(); t(ids(run(d), 'errors').includes('E52'), 'E52: NEW declared sotp without a table still errors'); }
  { const { d } = fer(); t(!ids(run(mig(d)), 'errors').includes('E52'), 'E52 allowance: migrated declared sotp without a table + note → no E52', JSON.stringify(run(mig(fer().d)).errors)); }
  { const { d, i } = fer(); d.legs[i].note = ''; delete d.legs[i].note; t(ids(run(mig(d)), 'errors').includes('E52'), 'E52 allowance still needs the author\'s note'); }
  // (3) meta.sources — v2 page names 2 sources (v2 cross-verify ≥ 2) → 2 allowed on a migrated doc · NEW needs 3 · 1 never
  const two = (d) => { d.meta.sources = d.meta.sources.slice(0, 2); return d; };
  t(ids(run(two(load('ZTS-real'))), 'errors').includes('E51'), 'sources: NEW doc with 2 sources still errors');
  t.eq(ids(run(mig(two(load('ZTS-real')))), 'errors'), [], 'sources allowance: migrated doc with 2 sources → 0 errors');
  { const d = mig(load('ZTS-real')); d.meta.sources = d.meta.sources.slice(0, 1); t(ids(run(d), 'errors').includes('E51'), 'sources allowance: 1 source still errors'); }
  // (4) scenarios.cases[i].desc — v2 column printed no "สถานการณ์" row → may be absent on a migrated doc (render prints no empty row)
  const nodesc = (d) => { delete d.scenarios.cases[2].desc; return d; };
  t(ids(run(nodesc(load('ZTS-real'))), 'errors').includes('E51'), 'desc: NEW doc without a scenario desc still errors');
  { const d = mig(nodesc(load('ZTS-real'))); const r = run(d);
    t.eq(ids(r, 'errors'), [], 'desc allowance: migrated doc without the Bull desc → 0 errors');
    const B = require('../../build.js'), R = require('../../_template/v3/render.js');
    const html = r.view ? B.expandReport(R.toV2Source(d, r.view)) : '';
    const bull = (html.split('<div class="col bull">')[1] || '').split('</ul>')[0];
    t(!/สถานการณ์/.test(bull) && /สถานการณ์/.test((html.split('<div class="col bear">')[1] || '').split('</ul>')[0]), 'render: no empty "สถานการณ์" row where the desc is absent (other columns keep theirs)'); }
  { const d = mig(load('ZTS-real')); d.scenarios.cases[2].desc = ''; t(ids(run(d), 'errors').includes('E51'), 'desc allowance: an empty string is still an error (absent only)'); }
}

t(fs.readdirSync(REAL).length === realBefore, 'real reports/ untouched');
fs.rmSync(tmp, { recursive: true, force: true });
t.done();
