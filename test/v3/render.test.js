'use strict';
const t = require('./_t.js')('render');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const { expandReport } = require('../../build.js');
const CR = require('../../test/check-reports.js');

// วันราคาต้องสด ไม่งั้น E27 (>120 วัน) ยิงเมื่อ fixture เก่า — ตั้งเป็นวันนี้ (เวลาไทย) ทุกครั้งที่รัน
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (s) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`))); d.market.priceDate = today; d.meta.analysisDate = today; return d; };
const seeds = { ZTS: '#e8731a' };

for (const sym of ['ZTS', 'BBL']) {
  const doc = load(sym);
  const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.startsWith('<!DOCTYPE html>') && src.includes('<!--TEMPLATE:STYLE-->') && src.includes('<!--TEMPLATE:ENGINE-->'), `${sym}: markers present`);
  t(!/\{\{(?!rd:)[^}]*\}\}/.test(src), `${sym}: no v3 tokens left in source`);
  const html = expandReport(src);
  const res = CR.checkHtml(html, `${sym}.html`, { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], `${sym}: full v2 gate — zero errors`);
  t((html.match(/<section>/g) || []).length === 8, `${sym}: 8 sections`);
}
// Review Focus #2 — gauge scale ascending even when analyst target > fvHigh, or absent
{ const doc = load('ZTS'); doc.analyst.target = 400; const view = C.compute(doc, { seeds });
  const res = CR.checkHtml(expandReport(R.toV2Source(doc, view)), 'ZTS.html', { source: R.toV2Source(doc, view) });
  t(!res.errors.some((e) => e.id === 'E26'), 'E26 green with analyst above fvHigh'); }
// extras render as a data table
{ const doc = load('ZTS'); doc.extras = [{ after: 'valuation', title: 'SOTP', headers: ['ส่วน', 'มูลค่า'], rows: [['A', 1.5], ['B <x>', 2]] }];
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(/<table class="xtab">[\s\S]*B &lt;x&gt;[\s\S]*<\/table>/.test(src), 'extras table escaped'); }
t.done();
