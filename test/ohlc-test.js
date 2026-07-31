#!/usr/bin/env node
'use strict';
// ohlc-test.js — unit test ของ src/ohlc.js (pure transform — ไม่แตะเน็ตเวิร์ก)
const assert = require('node:assert');

// fixture ย่อจากรูปจริงของ Yahoo v8 chart API (5 แท่ง มี 1 แท่ง null = วันหยุด/ข้อมูลขาด)
const FIX = { chart: { result: [{ meta: { currency: 'USD', symbol: 'TEST' },
  timestamp: [1700000000, 1700086400, 1700172800, 1700259200, 1700345600],
  indicators: { quote: [{
    open:  [10.111111, 10.5, null, 11.2, 11.0],
    high:  [10.6, 10.9, null, 11.5, 11.4],
    low:   [10.0, 10.3, null, 10.9, 10.8],
    close: [10.5, 10.812345, null, 11.3, 11.15],
    volume:[1000, 1500, null, 1200, 900],
  }] },
}], error: null } };

(async () => {
  const { toYahoo, transformChart, OHLC_CACHE_TTL } = await import('../src/ohlc.js');

  // symbol mapping: THB → .BK, อื่น ๆ คงเดิม
  assert.equal(toYahoo('PTT', 'THB'), 'PTT.BK');
  assert.equal(toYahoo('AAPL', 'USD'), 'AAPL');

  // symbol-map override: หุ้นเปลี่ยนชื่อต้องได้ ticker ใหม่ (BKI→BKIH.BK ไทย, LANC→MZTI US)
  assert.equal(toYahoo('BKI', 'THB'), 'BKIH.BK');
  assert.equal(toYahoo('LANC', 'USD'), 'MZTI');

  const out = transformChart(FIX);
  assert.equal(out.sym, 'TEST');
  assert.equal(out.currency, 'USD');
  assert.equal(out.bars.t.length, 4, 'แท่ง null ต้องถูกตัด');
  assert.equal(out.bars.c[1], 10.8123, 'ราคาปัดทศนิยม 4 ตำแหน่ง');
  assert.equal(out.bars.v[3], 900);
  assert.deepEqual(Object.keys(out.bars), ['t', 'o', 'h', 'l', 'c', 'v']);
  assert.ok(OHLC_CACHE_TTL >= 3600);

  // payload เสีย → ต้อง throw (worker จะจับไปตอบ 503)
  assert.throws(() => transformChart({ chart: { result: null, error: { code: 'Not Found' } } }));

  // แท่งข้อมูลไม่พอ (<2 แท่ง valid) → throw
  assert.throws(() => transformChart({ chart: { result: [{ meta: {}, timestamp: [1700000000],
    indicators: { quote: [{ open: [1], high: [1], low: [1], close: [1], volume: [1] }] } }], error: null } }));

  console.log('✅ ohlc-test ผ่าน');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
