'use strict';
// Plan 2b Task 1 — tools/report-source.js = จุดเดียวที่ตอบ "ไฟล์ไหนคือรายงาน" (spec §6.5)
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามสร้างไฟล์ใต้ reports/ จริง (tripwire no-json-reports)
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('report-source');
const RS = require('../../tools/report-source.js');
const RM = require('../../tools/report-meta.js');
const C = require('../../tools/v3/compute.js');
const R = require('../../_template/v3/render.js');
const { expandReport } = require('../../build.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const V2SRC = path.join(FIX, 'AAPL-v2.html'), V3SRC = path.join(FIX, 'v3', 'ZTS-real.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-report-source-'));
fs.copyFileSync(V2SRC, path.join(tmp, 'AAPL.html'));
fs.copyFileSync(V3SRC, path.join(tmp, 'ZTS.json'));
fs.writeFileSync(path.join(tmp, 'notes.txt'), 'not a report');
try {
  t.eq(RS.list(tmp), [{ symbol: 'AAPL', name: 'AAPL.html', v3: false }, { symbol: 'ZTS', name: 'ZTS.json', v3: true }], 'list: both kinds, sorted, non-report files ignored');
  t.eq([...RS.symbols(tmp)].sort(), ['AAPL', 'ZTS'], 'symbols: upper-case set of both kinds');
  t.eq([RS.kindOf('AAPL', tmp), RS.kindOf('ZTS', tmp), RS.kindOf('NOPE', tmp)], ['v2', 'v3', null], 'kindOf: v2 / v3 / none');
  t(RS.exists('ZTS', tmp) && !RS.exists('NOPE', tmp), 'exists: either file counts');
  t(RS.isV3Path('reports/ZTS.json') && !RS.isV3Path('reports/ZTS.html'), 'isV3Path');

  const raw = fs.readFileSync(V2SRC, 'utf8'), sm = RM.readStockMeta(raw);
  const doc = JSON.parse(fs.readFileSync(V3SRC, 'utf8'));
  t.eq(RS.metaLite('AAPL', tmp), { symbol: 'AAPL', v3: false, currency: sm.currency, px: sm.price, analysisDate: '2026-06-22', era: 'CE', aiModel: RM.readAiModel(raw) }, 'metaLite v2: stock-meta + footer + ai-model');
  t.eq(RS.metaLite('ZTS', tmp), { symbol: 'ZTS', v3: true, currency: 'USD', px: doc.market.px, analysisDate: doc.meta.analysisDate, era: 'BE', aiModel: doc.meta.aiModel }, 'metaLite v3: straight from JSON');
  t.eq(RS.metaLite('NOPE', tmp), null, 'metaLite: missing symbol → null');
  t.eq(RS.load('ZTS', tmp).doc, doc, 'load v3: parsed doc');
  t.eq(RS.load('AAPL', tmp).raw, raw, 'load v2: raw html');

  t.eq(RS.stockMeta('AAPL', tmp), sm, 'stockMeta v2 = the embedded block');
  t.eq(RS.stockMeta('ZTS', tmp, {}).mos, C.compute(doc, { seeds: {} }).sm.mos, 'stockMeta v3 = compute().sm');

  t(RS.renderedHtml('AAPL', tmp) === expandReport(raw), 'renderedHtml v2 = expandReport(source) — the path build.js takes');
  t(RS.renderedHtml('ZTS', tmp, {}) === expandReport(R.toV2Source(doc, C.compute(doc, { seeds: {} }))), 'renderedHtml v3 = expandReport(toV2Source(compute))');
  t.throws(() => RS.renderedHtml('NOPE', tmp), /ไม่มี reports\/NOPE/, 'renderedHtml: missing symbol throws');

  // fix round 1: symbol ตัวพิมพ์เล็ก → ผลเดียวกันทั้ง macOS/Linux · symbol ที่คืน = ตัวพิมพ์ใหญ่
  t(RS.kindOf('zts', tmp) === 'v3', 'kindOf: lower-case symbol normalised');
  t(RS.metaLite('zts', tmp).symbol === 'ZTS', 'metaLite: returned symbol is normalised');
  t(RS.load(' aapl ', tmp).symbol === 'AAPL', 'load: trimmed + upper-cased');
  t(RS.stockMeta('zts', tmp, {}).mos === C.compute(doc, { seeds: {} }).sm.mos, 'stockMeta: lower-case symbol');

  fs.writeFileSync(path.join(tmp, 'MIS.json'), JSON.stringify(Object.assign({}, doc, { symbol: 'ZTS' })));
  t.throws(() => RS.load('MIS', tmp), /MIS\.json: symbol "ZTS" ไม่ตรงชื่อไฟล์/, 'load: v3 symbol≠filename throws naming the file');
  t.throws(() => RS.metaLite('MIS', tmp), /MIS\.json: symbol "ZTS" ไม่ตรงชื่อไฟล์/, 'metaLite: same check via load');
  t.throws(() => RS.renderedHtml('MIS', tmp, {}), /MIS\.json: symbol "ZTS" ไม่ตรงชื่อไฟล์/, 'renderedHtml: same message as build');
  fs.unlinkSync(path.join(tmp, 'MIS.json'));

  fs.writeFileSync(path.join(tmp, 'BAD.json'), '{ not json');
  t.throws(() => RS.load('BAD', tmp), /BAD\.json: JSON เสีย/, 'load: broken JSON names the file');
  fs.unlinkSync(path.join(tmp, 'BAD.json'));

  fs.copyFileSync(V2SRC, path.join(tmp, 'ZTS.html'));
  t.throws(() => RS.list(tmp), /ZTS มีทั้ง \.html และ \.json/, 'list: both files for one symbol → throw (same rule as build)');
  t.throws(() => RS.kindOf('ZTS', tmp), /ZTS มีทั้ง \.html และ \.json/, 'kindOf: both files → throw');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
t.done();
