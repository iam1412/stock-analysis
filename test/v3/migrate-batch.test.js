'use strict';
// Plan 4c-prep Task 1 — batch runner (spec §3.7 ฉ · D6): pure planner + executor with injected deps (never touches git/reports)
const t = require('./_t.js')('migrate-batch');
const BT = require('../../tools/migrate-v3/batch.js');
const RP = require('../../tools/migrate-v3/report.js');
const row = (s, b, c) => [s, 'US', b, '"x"', 2, 2, 0, 0, 0, 0, 0, 0, c || '', '0'].join(',');
const csv = [RP.COLS.join(','), row('AAA', 'CLEAN'), row('BBB', 'VALUE-DRIFT', 'fv-rounding'), row('CCC', 'VALUE-DRIFT', 'mixed'), row('DDD', 'HUMAN'), row('EEE', 'CLEAN')].join('\n') + '\n';
const rows = BT.readTable(csv);
t.eq(rows.map((r) => [r.symbol, r.bucket, r.driftClass]), [['AAA', 'CLEAN', ''], ['BBB', 'VALUE-DRIFT', 'fv-rounding'], ['CCC', 'VALUE-DRIFT', 'mixed'], ['DDD', 'HUMAN', ''], ['EEE', 'CLEAN', '']], 'readTable: sweep csv columns (reasons quoted)');
t.throws(() => BT.readTable('symbol,bucket\nAAA,CLEAN\n'), /batch: .*หัวตาราง/, 'readTable: a header that is not the sweep csv → named throw');
{
  const s = BT.selectRows(rows, ['CLEAN', 'fv-rounding']);
  t.eq(s.picked.map((r) => r.symbol), ['AAA', 'BBB', 'EEE'], 'selectRows: CLEAN + the named driftClass only');
  t(s.skipped.some((x) => x.symbol === 'DDD' && /HUMAN/.test(x.why)) && s.skipped.some((x) => x.symbol === 'CCC'), 'selectRows: HUMAN never batchable · other classes skipped with a reason', JSON.stringify(s.skipped));
}
{
  const many = Array.from({ length: 103 }, (_, i) => ({ symbol: `C${i}`, bucket: 'CLEAN', driftClass: '' })).concat([{ symbol: 'D1', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { symbol: 'D2', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }]);
  t.eq(BT.commitGroups(many).map((g) => g.length), [50, 50, 3, 1, 1], 'commitGroups: CLEAN ≤50/commit · VALUE-DRIFT 1/commit (§13-1)');
}
t.eq(BT.freshMismatch({ symbol: 'BBB', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }), null, 'freshMismatch: same → null');
t(/BBB: .*VALUE-DRIFT\/mixed ≠ ตาราง VALUE-DRIFT\/fv-rounding/.test(BT.freshMismatch({ symbol: 'BBB', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { bucket: 'VALUE-DRIFT', driftClass: 'mixed' })), 'freshMismatch: class moved → refusal text');
// executor — Review Focus 2: a moved row is refused before convert; others continue; push every N commits; verify once per push
{
  const calls = [];
  const fresh = { AAA: { bucket: 'CLEAN', driftClass: '' }, BBB: { bucket: 'HUMAN', driftClass: '' }, EEE: { bucket: 'CLEAN', driftClass: '' }, D1: { bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, D2: { bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' } };
  const deps = { fresh: (s) => fresh[s], convert: (s, acc) => { calls.push(`convert ${s}${acc ? ' --accept-drift' : ''}`); return 0; }, build: () => calls.push('build'),
    ship: (syms) => calls.push(`ship ${syms.join(' ')}`), verify: () => calls.push('verify'), push: () => calls.push('push'), log: () => {} };
  const tbl = [{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }, { symbol: 'BBB', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { symbol: 'EEE', bucket: 'CLEAN', driftClass: '' },
    { symbol: 'D1', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { symbol: 'D2', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }];
  const r = BT.runBatch(tbl, { classes: ['CLEAN', 'fv-rounding'], n: 2, model: 'opus', noPush: false, dryRun: false }, deps);
  t(!calls.includes('convert BBB') && !calls.includes('convert BBB --accept-drift') && r.refused.length === 1 && /^BBB: /.test(r.refused[0]), 'runBatch: moved row BBB refused before convert', JSON.stringify({ calls, r }));
  t.eq(calls, ['convert AAA', 'convert EEE', 'build', 'ship AAA EEE', 'convert D1 --accept-drift', 'build', 'ship D1', 'verify', 'push', 'convert D2 --accept-drift', 'build', 'ship D2', 'verify', 'push'],
    'runBatch: convert → build → ship per commit · verify+push every 2 commits · remainder pushed at the end');
  t(r.code === 3 && r.pushes === 2 && r.commits.length === 3, 'runBatch: exit 3 when any row was refused · 3 commits · 2 pushes', JSON.stringify(r));
}
{
  const calls = [];
  const deps = { fresh: () => ({ bucket: 'CLEAN', driftClass: '' }), convert: (s) => { calls.push(`convert ${s}`); return 0; }, build: () => calls.push('build'), ship: (x) => calls.push(`ship ${x.join(' ')}`), verify: () => calls.push('verify'), push: () => calls.push('push'), log: () => {} };
  const r = BT.runBatch([{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }], { classes: ['CLEAN'], n: 5, model: 'opus', noPush: true, dryRun: false }, deps);
  t.eq(calls, ['convert AAA', 'build', 'ship AAA', 'verify'], 'runBatch --no-push: verify once at the would-be push point, never push');
  t(r.code === 0 && r.pushes === 0, 'runBatch --no-push: exit 0');
  const d = []; const rd = BT.runBatch([{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }], { classes: ['CLEAN'], n: 5, model: 'opus', noPush: true, dryRun: true }, { ...deps, convert: () => { d.push('convert'); return 0; } });
  t(d.length === 0 && rd.commits.length === 1, 'runBatch --dry-run: plans the commit, converts nothing', JSON.stringify(rd));
}
{
  let msg = ''; const deps = { fresh: () => ({ bucket: 'CLEAN', driftClass: '' }), convert: () => 1, build: () => {}, ship: () => { msg = 'shipped'; }, verify: () => {}, push: () => {}, log: () => {} };
  const r = BT.runBatch([{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }], { classes: ['CLEAN'], n: 1, model: 'opus', noPush: true }, deps);
  t(r.code === 3 && msg === '' && /AAA: convert exit 1/.test(r.refused[0]), 'runBatch: a failed convert is a refusal · nothing shipped for an empty group', JSON.stringify(r));
}
// controller ruling (Task 1 concern 4): deps.fresh throws for one row → that row refused with the message · others continue · exit 3
{
  const calls = [];
  const deps = { fresh: (s) => { if (s === 'GONE') throw new Error('ไม่พบ reports/GONE.html'); return { bucket: 'CLEAN', driftClass: '' }; },
    convert: (s) => { calls.push(`convert ${s}`); return 0; }, build: () => calls.push('build'), ship: (x) => calls.push(`ship ${x.join(' ')}`), verify: () => calls.push('verify'), push: () => calls.push('push'), log: () => {} };
  const r = BT.runBatch([{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }, { symbol: 'GONE', bucket: 'CLEAN', driftClass: '' }, { symbol: 'EEE', bucket: 'CLEAN', driftClass: '' }],
    { classes: ['CLEAN'], n: 1, model: 'opus', noPush: true, dryRun: false }, deps);
  t.eq(calls, ['convert AAA', 'convert EEE', 'build', 'ship AAA EEE', 'verify'], 'runBatch: fresh throw → no convert for that row · others convert + ship');
  t(r.code === 3 && r.refused.length === 1 && r.refused[0] === 'GONE: ไม่พบ reports/GONE.html', 'runBatch: fresh throw → refused "SYM: <message>" · exit 3', JSON.stringify(r));
}
t.done();
