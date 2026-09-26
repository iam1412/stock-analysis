'use strict';
// perturb-9 (27 ก.ย. 69) — audit PERTURB ที่เหลือ 9 ใบ + CCEP ด้วยกลไกที่มีอยู่แล้วเท่านั้น
//   JPM/ORLY การ์ด Market Cap → คีย์แคตตาล็อก mcap (หุ้นคงเหลือจาก .d "หุ้นคงเหลือ ~809M") · COHU/LYB/MLI/PWR/ZM การ์ด P/E ของผู้เขียน →
//   v2Display.custom ต่อได้ใน graft-text (ตัวเลขของใบไม่ขยับ) · OXY ช่วง P/E บน EPS 2 ตัว → ฐาน array · BGC ช่องเกจ "n/a" คงตำแหน่ง ช่องอื่นเรียงกันเอง
//   · CCEP ตารางใน blocks ที่ใบเดิมมีแล้วไม่ถูกนับว่าหาย · remigrate: ต้องผ่าน audit.perturb ของใบเอง + ตัวเลขไม่ขยับเมื่อใบเดิมแสดงค่าถูกอยู่แล้ว
// ทางจริง: หน้า v2 (fixture) → migrateOne → remigrateOne (temp dir — ไม่แตะ reports/)
const t = require('./_t.js')('perturb-9');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const IO = require('../../tools/v3/io.js');
const R = require('../../_template/v3/render.js');
const AU = require('../../tools/migrate-v3/audit.js');
const RMG = require('../../tools/migrate-v3/remigrate.js');
const MV = require('../../tools/migrate-v3.js');
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
const REAL = path.join(ROOT, 'reports');
const realBefore = fs.readdirSync(REAL).length;
const MF = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perturb9-'));
const cardV = (html, label) => (new RegExp(`<div class="k">${label.replace(/[()/]/g, '\\$&')}</div><div class="v[^"]*">([^<]*)</div>`).exec(html) || [])[1];
const idsAt = (doc, k) => RMG.gateRes(doc, k, { seeds: SEEDS, today }).errors.map((e) => e.id);

// ── หน้า v2 (AAPL fixture) ที่มีรูปการ์ดของ JPM/ORLY (Market Cap ".d หุ้นคงเหลือ ~N") และ OXY (ช่วง P/E บน EPS 2 ตัว)
let raw = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'AAPL-v2.html'), 'utf8');
const r0 = raw;
raw = raw.replace('<div class="d">~14.81 พันล้านหุ้น</div>', '<div class="d">หุ้นคงเหลือ ~14.81B (StockAnalysis)</div>')
  .replace('<div class="k">P/E (Forward)</div><div class="v">~33x</div><div class="d">อิงประมาณการ FY2026</div>',
    '<div class="k">P/E (Forward 2 ปี)</div><div class="v">~28.9–33.0x</div><div class="d">EPS FY2026e $11.30 / FY2027e $9.90 (SA forecast)</div>');
t(raw !== r0 && (raw.match(/หุ้นคงเหลือ ~14\.81B|~28\.9–33\.0x/g) || []).length === 2, 'fixture: both card shapes in the v2 page');
const dirV2 = path.join(tmp, 'v2'); fs.mkdirSync(dirV2);
fs.writeFileSync(path.join(dirV2, 'AAPL.html'), raw);
const migrate = (sym, o) => MV.migrateOne(sym, { ...o, stats: { apxMs: 0 } });
const m = migrate('AAPL', { reportsDir: dirV2, noStale: true, seeds: SEEDS, manifest: new Map([['AAPL', MF.updated]]) });
const fresh = m.doc;
t(!!fresh, 'migrateOne: doc', m.failed);

// ── JPM/ORLY: "หุ้นคงเหลือ ~14.81B" → fundamentals.shares → การ์ดแคตตาล็อก mcap (ราคา × หุ้น คิดสด)
{
  t.eq(fresh.fundamentals.shares, 14.81e9, 'cards: shares from ".d หุ้นคงเหลือ ~14.81B"');
  t(fresh.metrics.cards.includes('mcap') && !fresh.metrics.custom.some((c) => c.label === 'Market Cap'), 'Market Cap → catalogue mcap (not a frozen custom card)');
  const d = { ...fresh, meta: { ...fresh.meta, migratedFrom: MF }, market: { ...fresh.market, priceDate: today } };
  t(!idsAt(d, 0.8).includes('v2:E43') && !idsAt(d, 1.25).includes('v2:E43'), 'gate: no E43 at ×0.8 / ×1.25 (Market Cap follows the price)');
}

// ── OXY: ช่วง P/E ของผู้เขียน (ตัวเลข 2 ตัว · EPS 2 ตัวใน .d) → v2Display.custom ฐาน array
{
  const i = fresh.metrics.custom.findIndex((c) => c.label === 'P/E (Forward 2 ปี)');
  t(i >= 0, 'the range card stays custom');
  t.eq(fresh.v2Display && fresh.v2Display.custom && fresh.v2Display.custom[String(i)], { op: 'pxOverBase', base: [11.3, 9.9] }, 'display: range → the author bases in printed order');
  t.eq(S.validate(fresh), [], 'schema: the migrated doc validates');
  const px = fresh.market.px;
  const at = (k) => cardV(R.toV2Source({ ...fresh, market: { ...fresh.market, px: Math.round(px * k * 100) / 100 } }, C.compute({ ...fresh, market: { ...fresh.market, px: Math.round(px * k * 100) / 100 } }, { seeds: SEEDS })), 'P/E (Forward 2 ปี)');
  t.eq(at(1), `~${(px / 11.3).toFixed(1)}–${(px / 9.9).toFixed(1)}x`, 'render ×1: both ends live');
  t.eq(at(1.25), `~${(Math.round(px * 125) / 100 / 11.3).toFixed(1)}–${(Math.round(px * 125) / 100 / 9.9).toFixed(1)}x`, 'render ×1.25: both ends follow the price');
  // ช่วงที่ไม่เข้าเกณฑ์ E41 (DV.nearPE) ที่ราคาของหน้า v2 = ไม่คิดสด (การ์ดค้างของหน้า v2)
  const bad = raw.replace('~28.9–33.0x', '~20.0–33.0x');
  const dirB = path.join(tmp, 'v2b'); fs.mkdirSync(dirB); fs.writeFileSync(path.join(dirB, 'AAPL.html'), bad);
  const mb = migrate('AAPL', { reportsDir: dirB, noStale: true, seeds: SEEDS, manifest: new Map([['AAPL', MF.updated]]) });
  const cu = mb.doc && mb.doc.v2Display && mb.doc.v2Display.custom;
  t(!(cu && Object.values(cu).some((x) => Array.isArray(x.base))), 'display: a range the bases do not reproduce (E41 tolerance) → not live', JSON.stringify(cu));
}

// ── COHU/LYB/MLI/PWR/ZM shape: ใบเดิมพกการ์ดตัวคูณแช่ค่า (ไม่มี v2Display.custom) → remigrate graft-text ต่อ custom · ตัวเลขไม่ขยับ · audit.perturb ว่าง
{
  const dirR = path.join(tmp, 'reports'); fs.mkdirSync(dirR);
  const { custom, ...vd } = fresh.v2Display;
  const existing = { ...fresh, v2Display: vd, meta: { ...fresh.meta, migratedFrom: MF } };
  IO.write(path.join(dirR, 'AAPL.json'), existing);
  const ex = IO.read(path.join(dirR, 'AAPL.json'));
  const pb = AU.perturbOf(ex, { seeds: SEEDS, today });
  t(pb.some((x) => /E41/.test(x)), 'existing doc (frozen range card): E41 at a perturbed price', JSON.stringify(pb));
  const o = { reportsDir: dirR, seeds: SEEDS, today, rows: new Map(), v2Of: () => ({ raw, ref: 'fixture' }) };
  // MLI shape: fresh ปัดตัวเลข (ขาแรกขยับ) ⇒ graft-text ก่อน · fresh ถูกปฏิเสธ
  const movedOf = (doc) => { const x = JSON.parse(JSON.stringify(doc)); const l = x.legs.find((y) => y.inputs && (typeof y.inputs.multiple === 'number' || typeof y.inputs.value === 'number')); if (typeof l.inputs.multiple === 'number') l.inputs.multiple = +(l.inputs.multiple * 1.1).toFixed(2); else l.inputs.value = +(l.inputs.value * 1.1).toFixed(2); return x; };
  const r = RMG.remigrateOne('AAPL', o, { migrateOne: (sym, oo) => { const mm = migrate(sym, oo); return { ...mm, doc: movedOf(mm.doc) }; } });
  t(r.result === 'FIXED' && r.via === 'graft-text', 'remigrate: FIXED via graft-text', JSON.stringify([r.result, r.via, r.why]));
  t(r.doc && r.doc.v2Display.custom && Array.isArray(Object.values(r.doc.v2Display.custom)[0].base), 'graft-text carries v2Display.custom (live bases)');
  t(r.doc && RMG.sameNumbers(ex, r.doc, SEEDS), 'numbers (FV · range · legs · targets) unchanged');
  t(r.doc && AU.perturbOf(r.doc, { seeds: SEEDS, today }).length === 0, 'audit.perturb of the written doc is empty');
  // ใบเดิมแสดงค่าถูกอยู่แล้ว ⇒ fresh ที่ตัวเลขขยับถูกปฏิเสธ (ไม่มีผู้สมัครอื่น = STILL-FAILING · ไม่เขียน)
  const moved = movedOf(fresh);
  delete moved.v2Display;
  t(!RMG.sameNumbers(ex, moved, SEEDS), 'fixture: the moved candidate computes other numbers');
  const r2 = RMG.remigrateOne('AAPL', o, { migrateOne: () => ({ doc: moved }) });
  t(r2.result === 'STILL-FAILING' && r2.why.some((w) => /numbers move/.test(w)), 'remigrate: a candidate that moves the numbers of a doc already right → refused', JSON.stringify(r2.why));
}

// ── COHU: การ์ดแคตตาล็อกที่หน้า v2 พิมพ์ข้อความ ("P/E (TTM) N/A") ต่อได้ใน graft-text · note ของคีย์นั้นถอด
{
  const doc = { metrics: { cards: ['mcap', 'pe'], notes: { pe: 'x', mcap: 'y' } } };
  const g = RMG.cardsGraft(doc, { v2Display: { cards: { pe: { v: 'N/A', d: 'ขาดทุน' }, pbv: { v: '1', d: '' } } } });
  t.eq(g && g.cards, { pe: { v: 'N/A', d: 'ขาดทุน' } }, 'cardsGraft: only keys the doc has');
  t.eq(g && g.metrics.notes, { mcap: 'y' }, 'cardsGraft: the grafted key loses its note');
  t.eq(RMG.cardsGraft(doc, { v2Display: {} }), null, 'cardsGraft: nothing to graft → null');
  const lc = RMG.liveCustomOf({ metrics: { custom: [{ label: 'P/E', value: '~19x' }, { label: 'Q', value: '{{pe}}x' }] } },
    { metrics: { custom: [{ label: 'P/E', value: '~19x' }, { label: 'Q', value: '1x' }] }, v2Display: { custom: { 0: { op: 'pxOverBase', base: 3.1 }, 1: { op: 'pxOverBase', base: 2 } } } });
  t.eq(lc, { 0: { op: 'pxOverBase', base: 3.1 } }, 'liveCustomOf: same label + no token in the existing value only');
}

// ── CCEP: ตารางใน blocks ที่ใบเดิมมีอยู่แล้ว ≠ หาย (blocks ของใบเดิมไม่ถูกแทนด้วยตารางเดี่ยว)
{
  const blocks = [{ after: '1', parts: [{ text: 'งบการเงินย้อนหลัง 5 ปี หน่วย ล้านยูโร' }, { table: { headers: ['a', 'b'], rows: [['รายได้', '21,351'], ['กำไร', '1,996']] } }] }];
  const vg = RMG.verbatimGraft({ v2Display: { blocks } }, { v2Display: { blocks } });
  t(!vg.x.blocks, 'verbatimGraft: blocks already in the doc (text + table) → nothing re-grafted', JSON.stringify(vg.x.blocks));
  const vg2 = RMG.verbatimGraft({ v2Display: { blocks: [{ after: '1', parts: [blocks[0].parts[0]] }] } }, { v2Display: { blocks } });
  t(vg2.x.blocks && vg2.x.blocks[0].parts.length === 1 && vg2.x.blocks[0].parts[0].table, 'verbatimGraft: a table the doc lacks is still carried');
}

// ── BGC: เกจที่มีช่องอ่านค่าไม่ได้ ("n/a") — ช่องนั้นคงตำแหน่ง ช่องที่อ่านได้เรียงกันเอง (E26 ที่ราคาอื่น)
{
  const d = JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS-real.json'))); delete d._sig;
  d.meta.migratedFrom = MF; d.market.priceDate = today; d.meta.analysisDate = today;
  const v = C.compute(d, { seeds: SEEDS });
  const px = +(v.fv * 1.05).toFixed(2);   // ราคาเหนือ FV เล็กน้อย: ×0.8 ข้าม FV
  d.market = { ...d.market, px, chart: { ...d.market.chart, data: d.market.chart.data.map((p, i, a) => (i === a.length - 1 ? [p[0], px] : p)) } };
  d.v2Display = { gauge: [{ ref: 'mos30', label: 'MOS 30%' }, { ref: 'mos20', label: 'MOS 20%' }, { ref: 'fv', label: 'Fair Value' }, { ref: 'px', label: 'ราคาปัจจุบัน' }, { text: 'n/a', label: 'เป้านักวิเคราะห์ (ไม่มี coverage)' }] };
  t.eq(S.validate(d), [], 'schema: gauge with an unreadable tick');
  const order = (k) => { const dk = { ...d, market: { ...d.market, px: Math.round(px * k * 100) / 100 } }; const h = R.toV2Source(dk, C.compute(dk, { seeds: SEEDS })); const sc = /<div class="scale">([\s\S]*?)<\/div>/.exec(h)[1]; return [...sc.matchAll(/<small>([^<]*)<\/small>/g)].map((x) => x[1]); };
  t.eq(order(1), ['MOS 30%', 'MOS 20%', 'Fair Value', 'ราคาปัจจุบัน', 'เป้านักวิเคราะห์ (ไม่มี coverage)'], 'render ×1: the author order (already ascending)');
  t.eq(order(0.8), ['MOS 30%', 'MOS 20%', 'ราคาปัจจุบัน', 'Fair Value', 'เป้านักวิเคราะห์ (ไม่มี coverage)'], 'render ×0.8: readable ticks re-sorted · "n/a" keeps its slot');
  t(!idsAt(d, 0.8).includes('v2:E26') && !idsAt(d, 1.25).includes('v2:E26'), 'gate: no E26 at ×0.8 / ×1.25');
}

t(fs.readdirSync(REAL).length === realBefore, 'real reports/ untouched');
fs.rmSync(tmp, { recursive: true, force: true });
t.done();
