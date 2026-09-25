'use strict';
const t = require('./_t.js')('io');
const fs = require('fs');
const os = require('os');
const path = require('path');
const IO = require('../../tools/v3/io.js');
const load = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));

t.eq(IO.canonical({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } }), '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}', 'canonical sorts keys at every depth');
t.eq(IO.canonical([1, undefined]), '[1,null]', 'canonical renders undefined array elements as null');
const d = load();
{
  const dUndef = { ...d, meta: { ...d.meta, headerTags: undefined } };
  const roundTripped = JSON.parse(JSON.stringify(dUndef));
  t.eq(IO.sign(dUndef), IO.sign(roundTripped), 'sign matches after JSON round-trip drops an undefined-valued nested field');
}
const s = IO.sign(d);
t(/^sha256:[0-9a-f]{64}$/.test(s), 'sign format');
t.eq(IO.sign({ ...d, _sig: 'sha256:' + '0'.repeat(64) }), s, 'signature ignores _sig itself');
t(IO.verifySig({ ...d, _sig: s }), 'verifySig true on untouched doc');
t(!IO.verifySig({ ...d, _sig: s, prose: { ...d.prose, mos: 'edited by hand' } }), 'verifySig false after a hand edit');

const h = IO.freshHash(d);
t.eq(IO.freshHash({ ...d, market: { ...d.market, px: 999 } }), h, 'freshHash ignores cron-owned market');
t.eq(IO.freshHash({ ...d, meta: { ...d.meta, aiModel: 'Claude Opus 5' } }), h, 'freshHash ignores aiModel');
t(IO.freshHash({ ...d, prose: { ...d.prose, mos: 'x' } }) !== h, 'freshHash moves on analysis edits');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3io-'));
const file = path.join(dir, 'ZTS.json');
IO.write(file, d);
const back = IO.read(file);
t(IO.verifySig(back), 'written file carries a valid signature');
t.eq(Object.keys(back).slice(0, 5), ['v', 'symbol', 'currency', 'region', 'dateEra'], 'fixed top-level key order on disk');
t.throws(() => IO.write(file, { ...d, market: { ...d.market, px: 0 } }), /market\.px/, 'write refuses invalid docs');
t(IO.verifySig(IO.read(file)), 'failed write leaves previous file intact');

const fileUndef = path.join(dir, 'ZTS-undef.json');
IO.write(fileUndef, { ...d, meta: { ...d.meta, headerTags: undefined } });
t(IO.verifySig(IO.read(fileUndef)), 'write/read round-trip through an undefined-valued nested key still verifies');

// ── Plan 3 Task 2 — IO.writeMarket (ผู้เขียนของ cron · spec §7 · R1/R6) · โฟลเดอร์ชั่วคราว dir ข้างบน (ห้ามแตะ reports/ จริง) ──
{
  const seeds = require('../../tools/seeds.json');
  const real = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS-real.json')));
  const today = '2026-09-22';
  const mf = path.join(dir, 'ZTS-market.json');
  IO.write(mf, real());
  const before = IO.read(mf);
  const market = { ...before.market, px: 73.46, priceDate: '2026-09-22', chart: { data: before.market.chart.data.slice(0, 11).concat([['ก.ย.26', 73.46]]) } };
  const bytes = (f) => fs.readFileSync(f, 'utf8');
  const strip = (x) => { const { market: _m, _sig: _s, ...rest } = x; return rest; };
  const r = IO.writeMarket(mf, market, { seeds, today });
  const after = IO.read(mf);
  t(IO.verifySig(after) && r.doc._sig === after._sig, 'writeMarket: file re-signed · returns the written doc');
  t.eq(after.market, market, 'writeMarket: market replaced verbatim');
  t.eq(strip(after), strip(before), 'writeMarket: every non-market field deep-equal');
  t.eq(IO.freshHash(after), IO.freshHash(before), 'writeMarket: freshHash unchanged ⇒ reports.json updated does not move (§8)');
  t.eq(r.errors, [], 'writeMarket: gate clean on the happy path');
  t(!fs.existsSync(mf + '.lock'), 'writeMarket: lock released');
  // gate ตก = throw + ไฟล์เดิมทุก byte (ไม่มีอะไรให้ revert)
  const b0 = bytes(mf);
  t.throws(() => IO.writeMarket(mf, { ...market, px: 0 }, { seeds, today }), /E51/, 'writeMarket: schema error → throw E51');
  t.throws(() => IO.writeMarket(mf, { ...market, px: 0 }, { seeds, today, force: true }), /E51/, 'writeMarket: --force never overrides E51');
  t.throws(() => IO.writeMarket(mf, market, { seeds, today: '2027-06-01' }), /E27/, 'writeMarket: gate error (E27 stale) → throw');
  t(bytes(mf) === b0 && !fs.existsSync(mf + '.lock'), 'writeMarket: rejected writes leave the bytes unchanged and release the lock');
  { let codes = null; try { IO.writeMarket(mf, market, { seeds, today: '2027-06-01' }); } catch (e) { codes = e.codes; }
    t.eq(codes, ['E27'], 'writeMarket: error carries .codes for the cron flag detail'); }
  const rf = IO.writeMarket(mf, market, { seeds, today: '2027-06-01', force: true });
  t(rf.errors.some((e) => e.id === 'E27') && IO.verifySig(IO.read(mf)), 'writeMarket: --force writes past a non-E50/E51 error and returns it');
  // E52 (ขา declared sotp ไม่มีตาราง) — ผ่าน schema จึงเขียนด้วย IO.write ได้ · gate ตก
  const e52 = real(); e52.legs[1].inputs.basis = 'sotp';
  const f52 = path.join(dir, 'ZTS-e52.json'); IO.write(f52, e52); const b52 = bytes(f52);
  t.throws(() => IO.writeMarket(f52, market, { seeds, today }), /E52/, 'writeMarket: E52 → throw');
  t.eq(bytes(f52), b52, 'writeMarket: E52 → bytes unchanged');
  // E50 — ไฟล์ถูกแก้มือ (_sig เดิม): ห้ามเซ็นทับแม้ --force
  const f50 = path.join(dir, 'ZTS-e50.json'); IO.write(f50, real());
  const hand = IO.read(f50); hand.prose.mos += ' แก้มือ'; fs.writeFileSync(f50, JSON.stringify(hand, null, 2) + '\n');
  const b50 = bytes(f50);
  t.throws(() => IO.writeMarket(f50, market, { seeds, today, force: true }), /E50/, 'writeMarket: hand-edited file → E50 even with --force (never re-sign a hand edit)');
  t.eq(bytes(f50), b50, 'writeMarket: E50 → bytes unchanged');
}

// Plan 4c-prep Task 1 (#67 · spec §3.7 ฉ · D6): prepatchHash = freshHash + meta.aiModel — ship --prepatch แยกการแก้ป้ายรุ่นออกจาก pre-patch ราคา
{
  const d = JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
  const m = { ...d, meta: { ...d.meta, aiModel: 'Claude Opus 5' } };
  const px = { ...d, market: { ...d.market, px: d.market.px + 1 } };
  t.eq(IO.freshHash(m), IO.freshHash(d), '#67: freshHash still ignores meta.aiModel (updated must not move)');
  t(IO.prepatchHash(m) !== IO.prepatchHash(d), '#67: prepatchHash sees an aiModel-only edit');
  t.eq(IO.prepatchHash(px), IO.prepatchHash(d), '#67: prepatchHash ignores market (cron pre-patch passes)');
  t.eq(IO.prepatchHash({ ...d, _sig: 'sha256:' + '0'.repeat(64) }), IO.prepatchHash(d), '#67: prepatchHash ignores _sig');
  t(/^[0-9a-f]{12}$/.test(IO.prepatchHash(d)), '#67: 12 hex like freshHash');
}
t.done();
