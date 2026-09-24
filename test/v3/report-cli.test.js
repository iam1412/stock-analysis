'use strict';
// Plan 2b Task 7 — tools/report.js (spec §6.1) · ทุกอย่างในโฟลเดอร์ชั่วคราว + --today คงที่
// ★ ห้ามแตะ reports/ .work/ .queue/ จริง — ทุกคำสั่งส่ง --reports-dir/--work-dir/--prep-dir/--seeds (tripwire no-json-reports)
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('report-cli');
const RC = require('../../tools/report.js');
const IO = require('../../tools/v3/io.js');
const S = require('../../tools/v3/schema.js');
const CV = require('../check-v3.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const SIDECAR = path.join(FIX, 'v3', 'sidecar', 'ZZZQ.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-report-cli-'));
const R = path.join(tmp, 'rep'), W = path.join(tmp, 'work'), PD = path.join(tmp, 'prep'), SEEDS = path.join(tmp, 'seeds.json');
for (const d of [R, W, PD]) fs.mkdirSync(d);
fs.writeFileSync(SEEDS, JSON.stringify({ ZZZQ: '#31a60d' }));
fs.copyFileSync(SIDECAR, path.join(PD, 'ZZZQ.json'));

const cli = (args, today) => {
  const out = [];
  const code = RC.run([...args, '--reports-dir', R, '--work-dir', W, '--prep-dir', PD, '--seeds', SEEDS, '--today', today || '2026-09-21'],
    { log: (s) => out.push(String(s)), err: (s) => out.push(String(s)) });
  return { code, out: out.join('\n') };
};
const rf = (sym) => path.join(R, sym + '.json');
const wf = (sym) => path.join(W, sym + '.json');
const readW = (sym) => JSON.parse(fs.readFileSync(wf(sym), 'utf8'));
const writeW = (sym, d) => fs.writeFileSync(wf(sym), JSON.stringify(d, null, 2) + '\n');
const bytes = (f) => fs.readFileSync(f, 'utf8');
const todos = (d) => S.stringLeaves(d, '', []).filter((x) => S.TODO_RE.test(x.text)).map((x) => x.path);

try {
  // ── usage ──
  t.eq(RC.run([], { log() {}, err() {} }), 2, 'no command → exit 2');
  t.eq(cli(['bogus', 'ZZZQ']).code, 2, 'unknown command → exit 2');
  t.eq(cli(['init', 'ZZZQ', '--nope']).code, 2, 'unknown option → exit 2');
  t.eq(cli(['show', 'ZZZQ', '--light']).code, 2, '--light outside save → exit 2');

  // ── pure: draftFromSidecar variants ──
  const SC = JSON.parse(bytes(SIDECAR));
  { const d = RC.draftFromSidecar({ ...SC, medians: { ...SC.medians, curErr: 'งบเป็น CAD' } }, '2026-09-21');
    t(d.legs.length === 2 && d.legs.every((l) => S.TODO_RE.test(l.method)) && d.fundamentals.peAvg5y === undefined, 'median with curErr → no pe leg, no peAvg5y (two TODO legs)'); }
  { const d = RC.draftFromSidecar({ ...SC, vendor: { ...SC.vendor, traps: ['[2c] forecast ⇒ ไม่ตรงงวด ⚠'] } }, '2026-09-21');
    t(d.fundamentals.epsForward === undefined, '[2c] FY trap → epsForward left out'); }
  t(S.TODO_RE.test(RC.draftFromSidecar({ ...SC, crossVerify: { dP: 3.1, dE: 0 } }, '2026-09-21').meta.priceNote), 'price gap > 2% → priceNote is a TODO');
  t(!('priceNote' in RC.draftFromSidecar({ ...SC, crossVerify: { dP: null, dE: null } }, '2026-09-21').meta), 'no cross-verify → no priceNote');
  { const d = RC.draftFromSidecar({ ...SC, dps: 0 }, '2026-09-21');
    t(d.scenarios.divIncluded === false && !d.metrics.cards.includes('yield') && d.scenarios.cases.every((c) => !('divCum' in c)), 'dps 0 → divIncluded false, no yield card, no divCum'); }
  { const d = RC.draftFromSidecar({ ...SC, company: null, exchange: null }, '2026-09-21');
    t(S.TODO_RE.test(d.meta.company) && S.TODO_RE.test(d.meta.exchange), 'missing company/exchange → TODO'); }

  // ── init (NEW) ──
  t.eq(cli(['diff', 'ZZZQ']).code, 1, 'diff before init: no draft, no report → exit 1');
  { const r = cli(['init', 'ZZZQ']);
    t(r.code === 0 && /มัธยฐาน P\/E/.test(r.out) && /TODO \d+ ช่อง/.test(r.out), `init ZZZQ → exit 0, prints TODO count + median hint (${r.out.slice(0, 200)})`); }
  const d0 = readW('ZZZQ');
  t(!('market' in d0) && !('_sig' in d0) && !('aiModel' in d0.meta) && !('themeLegacy' in d0.meta), 'draft: no market / _sig / aiModel / themeLegacy');
  t.eq([d0.v, d0.symbol, d0.currency, d0.region, d0.dateEra], [3, 'ZZZQ', 'USD', 'US', 'BE'], 'draft: top-level');
  t.eq([d0.meta.company, d0.meta.exchange, d0.meta.analysisDate, d0.meta.priceNote], ['ZZZQ Animal Health Inc.', 'NYSE', '2026-09-21', 'StockAnalysis.com ตรงกับ Yahoo Finance'], 'draft: meta from sidecar + --today');
  t.eq(d0.meta.sources.slice(0, 2), ['Yahoo Finance', 'StockAnalysis.com'], 'draft: seed sources');
  { const f = d0.fundamentals;
    t.eq([f.eps, f.epsBasis, f.dps, f.shares, f.netDebt, f.peAvg5y, f.epsForward, f.fy.period], [6.13, 'gaap-ttm', 2.12, 430000000, 7840000000, 30, 6.2, 'FY2025'], 'draft: fundamentals (shares = outstanding · netDebt = debt − cash · peAvg5y = median)'); }
  t.eq([d0.legs[0].method, d0.legs[0].inputs.multipleSource, d0.legs[0].inputs.medianWindow, d0.legs.length], ['pe', 'median5y', 'FY2021–FY2025', 2], 'draft: pe leg skeleton + one TODO leg');
  t(S.TODO_RE.test(d0.legs[0].inputs.multiple) && /30\.0x/.test(d0.legs[0].inputs.multiple), 'draft: legs[0].inputs.multiple is a TODO carrying the median hint');
  t.eq(d0.metrics.cards, ['mcap', 'pe', 'yield', 'eps', 'roe', 'netMargin', 'revenue', 'range52w', 'peAvg5y', 'fcf', 'debtToEquity'], 'draft: data-backed default cards');
  t.eq([d0.scenarios.years, d0.scenarios.divIncluded, d0.scenarios.perYear, d0.scenarios.driver, d0.scenarios.exitMetric], [3, true, 'cagr', 'eps', 'pe'], 'draft: scenario frame');
  t.eq(d0.analyst, { target: 100.94, n: 19, rating: 'Buy', asOf: '2026-09-21' }, 'draft: analyst from vendor + sidecar rating');
  t.eq([d0.fvWeights, d0.extras], [null, []], 'draft: fvWeights null, extras []');
  // Review Focus 2 — init ซ้ำต้องไม่ทับ draft ที่ worker ทำค้าง
  { writeW('ZZZQ', { ...d0, catalysts: ['งานค้างของ worker', 'ข้อ 2 ของ worker', 'ข้อ 3 ของ worker'] }); const before = bytes(wf('ZZZQ'));
    const r = cli(['init', 'ZZZQ']);
    t(r.code === 1 && /--force/.test(r.out) && bytes(wf('ZZZQ')) === before, 'init over an existing draft → exit 1, draft byte-identical');
    t(cli(['init', 'ZZZQ', '--force']).code === 0 && readW('ZZZQ').catalysts[0] !== 'งานค้างของ worker', 'init --force → fresh draft'); }
  t(/ใบใหม่/.test(cli(['diff', 'ZZZQ']).out), 'diff of a NEW draft → "ใบใหม่" message');

  // ── save (NEW) ──
  { const r = cli(['save', 'ZZZQ']);
    const want = ['meta.aiModel', 'meta.sub', 'legs[0].inputs.multiple', 'legs[1].method', 'scenarios.cases[0].growth', 'prose.chart', 'risks[2]'];
    t(r.code === 1 && want.every((p) => r.out.includes(p)), `raw draft save → exit 1 naming every path at once (${want.filter((p) => !r.out.includes(p))})`);
    t(!fs.existsSync(rf('ZZZQ')), 'failed save writes no report'); }
  { const d = readW('ZZZQ'); writeW('ZZZQ', { ...d, market: SC.market });
    const r = cli(['save', 'ZZZQ']); t(r.code === 1 && /market: เป็นของ cron/.test(r.out) && !fs.existsSync(rf('ZZZQ')), 'market in the draft → refused (OWNER)');
    writeW('ZZZQ', { ...d, meta: { ...d.meta, themeLegacy: { accent: '#31a60d' } } });
    t(/meta\.themeLegacy/.test(cli(['save', 'ZZZQ']).out), 'themeLegacy in a NEW draft → refused (§3.5)');
    t(/--light/.test(cli(['save', 'ZZZQ', '--light']).out), '--light on a NEW symbol → refused');
    writeW('ZZZQ', d); }
  const fill = (d) => {
    d.meta.sub = 'ยาและวัคซีนสัตว์ ทดสอบคำโปรยธุรกิจ'; d.meta.headerTags = ['Animal Health']; d.meta.sources[2] = 'SEC 10-Q'; d.meta.aiModel = 'Claude Opus 5';
    d.legs[0].inputs.multiple = 25; d.legs[0].note = 'ใช้มัธยฐานตัวคูณย้อนหลังหักส่วนลดความเสี่ยงของธุรกิจ';
    d.legs[1] = { method: 'ddm', label: 'DDM', inputs: { g: 5.5, r: 9 }, note: 'ปันผลโตตามกำไรระยะยาว' };
    const cs = [[-3, 10, 6.36, 'ยอดขายหลักหดตัวต่อเนื่อง'], [5, 14, 6.7, 'ธุรกิจทรงตัวตามแนวโน้มเดิม'], [8, 17, 7, 'ยาใหม่ช่วยให้กำไรกลับมาโต']];
    d.scenarios.cases = cs.map(([growth, exitMultiple, divCum, desc]) => ({ growth, exitMultiple, divCum, desc }));
    d.scenarios.note = 'ฉากทดสอบของ Plan 2b';
    for (const k of Object.keys(d.prose)) d.prose[k] = 'ข้อความทดสอบสำหรับช่อง ' + k;
    d.catalysts = ['ยาใหม่ออกสู่ตลาด', 'ขยายตลาดเอเชีย', 'ซื้อหุ้นคืนต่อเนื่อง'];
    d.risks = ['คู่แข่งยาสามัญ', 'ค่าเงินผันผวน', 'กฎระเบียบยาสัตว์'];
    return d;
  };
  { const d = fill(readW('ZZZQ')); t.eq(todos(d), [], 'fill() leaves no TODO'); writeW('ZZZQ', d);
    const r = cli(['save', 'ZZZQ']);
    t(r.code === 0 && fs.existsSync(rf('ZZZQ')), `filled draft → save exit 0 (${r.out.slice(0, 300)})`);
    t(/ตัด v2:E40/.test(r.out), "save prints the dropped v2:E40 (stage:'save' is never silent)");
    t(/MOS \+34\.3%/.test(r.out), 'save prints FV/MOS');
    const doc = IO.read(rf('ZZZQ'));
    t(IO.verifySig(doc) && doc.market.px === 71.33 && doc.market.priceDate === '2026-09-21', 'saved file: signed, market merged from the sidecar');
    t.eq(CV.checkDoc(doc, { seeds: { ZZZQ: '#31a60d' }, today: '2026-09-21' }).errors.map((e) => e.id), ['v2:E40'], 'the real gate on the saved file: only v2:E40 (tag is applied at ship)'); }
  { const r = cli(['show', 'ZZZQ', 'fv']); t(r.code === 0 && Math.abs(parseFloat(r.out) - 108.576) < 0.01, `show ZZZQ fv → 108.576 (${r.out})`); }
  { const r = cli(['show', 'ZZZQ']); t(r.code === 0 && r.out.includes('{{fv}} = $108.58') && r.out.includes('{{leg1}} = $153.25') && !r.out.includes('{{leg3}}'), 'show: FV line + token table (only tokens that resolve)'); }
  t.eq(cli(['show', 'ZZZQ', 'nope.path']).code, 1, 'show with an unknown path → exit 1');
  // fix round 1 (Fix 2) — show/diff เอา view จาก checkDoc ตัวเดียว: ขาที่ค่าไม่ใช่ตัวเลข > 0 = บรรทัด error อ่านได้ ไม่ใช่ throw ที่ toFixed
  { const Cm = require('../../tools/v3/compute.js'), orig = Cm.compute;
    Cm.compute = (...a) => { const v = orig(...a); v.legs[0] = { ...v.legs[0], value: undefined }; return v; };
    let r; try { r = cli(['show', 'ZZZQ']); } finally { Cm.compute = orig; }
    t(r.code === 1 && /ยัง compute ไม่ได้/.test(r.out) && /✗ \[E51\] .*legs\[0\] ค่าขา/.test(r.out) && !/toFixed|\n\s+at /.test(r.out), `show on a bad-leg view → exit 1, readable E51 line (${r.out.slice(0, 300)})`); }
  t(/อยู่แล้ว/.test(cli(['init', 'ZZZQ']).out), 'init after the report exists → refused (UPDATE uses export)');

  // ── UPDATE: export → save round trip · --light · diff ──
  fs.copyFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), rf('ZTS'));
  const zts0 = bytes(rf('ZTS'));
  { const r = cli(['export', 'ZTS']); const d = readW('ZTS');
    t(r.code === 0 && !('market' in d) && !('_sig' in d) && d.meta.aiModel === 'Claude Sonnet 5', 'export ZTS → draft without market/_sig (aiModel kept)'); }
  t.eq(cli(['export', 'ZTS']).code, 1, 'export over an existing draft → exit 1');
  t.eq(cli(['export', 'ZTS', '--force']).code, 0, 'export --force → exit 0');
  { const r = cli(['save', 'ZTS'], '2026-09-22'); t(r.code === 0 && bytes(rf('ZTS')) === zts0 && /ต่อไป: คืนงาน controller/.test(r.out) && !/ต่อไป: npm test/.test(r.out), `export → save unchanged = byte-identical file · next-step line = hand back to controller (${r.out.slice(0, 200)})`); }
  { const d = readW('ZTS'); d.prose.mos += ' (ทบทวนแล้ว)'; writeW('ZTS', d);
    const r = cli(['save', 'ZTS', '--light'], '2026-09-22');
    t(r.code === 0 && IO.read(rf('ZTS')).prose.mos.endsWith('(ทบทวนแล้ว)') && IO.verifySig(IO.read(rf('ZTS'))), '--light: prose change → saved + signed'); }
  const zts1 = bytes(rf('ZTS'));
  { const d = readW('ZTS'); d.legs[0].inputs.multiple = 15; writeW('ZTS', d);
    const df = cli(['diff', 'ZTS'], '2026-09-22');
    t(df.code === 0 && df.out.includes('legs[0].inputs.multiple: 14 → 15') && df.out.includes('FV $85.00 → $87.60'), `diff: changed path + FV before → after (${df.out})`);
    const r = cli(['save', 'ZTS', '--light'], '2026-09-22');
    // Review Focus 5 — save ที่ล้มต้องไม่แตะไฟล์ · --light นอก allowlist ต้องบอก path
    t(r.code === 1 && /\[--light\] legs\[0\]\.inputs\.multiple/.test(r.out), '--light outside the allowlist → exit 1 naming legs[0].inputs.multiple');
    t(bytes(rf('ZTS')) === zts1, 'failed save leaves the report byte-identical'); }
  t.eq(RC.lightViolations({ analyst: { target: 1 }, meta: { sources: ['a'] }, fundamentals: { dps: 1, eps: 2 } },
    { analyst: { target: 2 }, meta: { sources: ['a', 'b'] }, fundamentals: { dps: 2, eps: 3 } }), ['fundamentals.eps'], 'lightViolations: analyst.* / meta.sources[*] / fundamentals.dps allowed');
  t.eq(RC.diffPaths({ market: 1, _sig: 'x', a: [1, 2], b: { c: 1 } }, { market: 2, a: [1], b: { c: 1, d: null } }), ['a[1]', 'b.d'], 'diffPaths: skips market/_sig, reports array tails and added keys');
  // fix round 1 (Fix 1) — container ที่มีข้างเดียว = เดินเทียบกับ {} / [] → ได้ leaf จริง ไม่ใช่ path แม่ตัวเดียว
  t.eq(RC.lightViolations({ metrics: { cards: [] } }, { metrics: { cards: [], notes: { pe: 'x' } } }), [], 'lightViolations: new metrics.notes object with a prose leaf → allowed');
  t.eq(RC.lightViolations({ metrics: { cards: [], notes: {} } }, { metrics: { cards: [], notes: { pe: 'x' } } }), [], 'lightViolations: same edit on a pre-existing notes:{} → allowed (same answer)');
  { const ex = (rows) => ({ extras: [{ title: 't', rows }] });
    t.eq(RC.diffPaths(ex([['a', '1']]), ex([['a', '1'], ['b', '2']])), ['extras[0].rows[1][0]', 'extras[0].rows[1][1]'], 'diffPaths: added extras row → its cell leaves');
    t.eq(RC.lightViolations(ex([['a', '1']]), ex([['a', '1'], ['b', '2']])), [], 'lightViolations: added extras row of prose cells → allowed');
    t.eq(RC.lightViolations(ex([['a', '1']]), ex([['a', '1'], { kind: 'total', cells: ['รวม', '3'] }])), ['extras[0].rows[1].kind'], 'lightViolations: added total row → non-prose kind leaf refused, cells allowed'); }
  t.eq(RC.lightViolations({ fundamentals: { eps: 1 } }, { fundamentals: { eps: 1, fy: { period: 'FY2025', eps: 2 } } }), ['fundamentals.fy.period', 'fundamentals.fy.eps'], 'lightViolations: one-sided container of non-allowlisted leaves → each leaf refused');
  t.eq(RC.lightViolations({ analyst: null }, { analyst: { target: 2, rating: 'Buy' } }), [], 'lightViolations: analyst null → object still allowed (analyst.* prefix)');
  t.eq(RC.diffPaths({ a: [1], b: { c: 1 }, e: null }, { a: {}, b: { c: 1, d: [] } }), ['a', 'b.d', 'e'], 'diffPaths: array↔object = one leaf · absent → empty container = its own path · null → absent = leaf');

  // ── refusals ── Review Focus 1: ใบ v2 อยู่แล้ว ห้ามเขียน .json ข้าง ๆ (build.reportEntries จะ throw ทั้งเว็บ)
  fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(R, 'AAPL.html'));
  writeW('AAPL', { v: 3, symbol: 'AAPL' });
  { const r = cli(['save', 'AAPL']); t(r.code === 1 && /ใบ v2/.test(r.out) && !fs.existsSync(rf('AAPL')), 'save on a v2 symbol → refused, no .json written'); }
  t.eq(cli(['init', 'AAPL']).code, 1, 'init on a v2 symbol → refused');
  t.eq(cli(['export', 'AAPL']).code, 1, 'export on a v2 symbol → refused');
  t(/ไม่พบ sidecar/.test(cli(['init', 'ZZZX']).out), 'init without a sidecar → refused');
  fs.copyFileSync(SIDECAR, path.join(PD, 'ZZZY.json'));
  t(/ไม่ใช่ ZZZY/.test(cli(['init', 'ZZZY']).out), 'sidecar of another symbol → refused');
  fs.writeFileSync(path.join(R, 'DUP.html'), '<html></html>'); fs.writeFileSync(rf('DUP'), '{}');
  t.eq(cli(['init', 'DUP']).code, 1, 'both .html and .json for one symbol → exit 1 (no throw escapes run)');

  // ── controller rulings (Task 7 dispatch) ──
  // (e) sourceErrors มีคนอ่านแค่ init — พิมพ์ 1 บรรทัดแล้วทำต่อ · null = เงียบ
  fs.writeFileSync(path.join(PD, 'ZZZS.json'), JSON.stringify({ ...SC, symbol: 'ZZZS', sourceErrors: { yahoo: null, sa: 'HTTP 503' } }));
  { const r = cli(['init', 'ZZZS']); const hits = r.out.split('\n').filter((l) => /sourceErrors/.test(l));
    t(r.code === 0 && hits.length === 1 && /sa: HTTP 503/.test(hits[0]) && !/yahoo/.test(hits[0]) && fs.existsSync(wf('ZZZS')), `sourceErrors → one line naming the failed source, init proceeds (${hits})`); }
  fs.writeFileSync(path.join(PD, 'ZZZT.json'), JSON.stringify({ ...SC, symbol: 'ZZZT' }));
  { const r = cli(['init', 'ZZZT']); t(r.code === 0 && !/sourceErrors/.test(r.out), 'sourceErrors null → no line'); }
  // (a) draft เขียนแบบ atomic (tmp + rename) ไม่ผ่าน IO.write — ไม่มี _sig · ไม่เหลือไฟล์ tmp
  t(fs.readdirSync(W).every((f) => /^[A-Z0-9.\-]+\.json$/.test(f)) && !('_sig' in readW('ZZZS')), 'drafts: no leftover tmp files, unsigned');
  // (b) E51 ที่ไม่มี details (compute fallback / badLeg / render leak) ต้องพิมพ์ msg
  t.eq(RC.errorLines([{ id: 'E51', label: 'สคีมา', msg: 'compute: legs[0] ค่าขา 0 (ต้อง > 0)' }, { id: 'E51', label: 'สคีมา', msg: 'x', details: [{ path: 'a.b', msg: 'ว่าง' }] }]),
    ['✗ [E51] สคีมา: compute: legs[0] ค่าขา 0 (ต้อง > 0)', '✗ [E51] a.b: ว่าง'], 'errorLines: details per path, msg fallback when details are absent');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
t.done();
