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

t.done();
