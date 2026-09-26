'use strict';
// review 27 ก.ย. 69 (PR #90) — I-1 สี MOS หมวด 8 · I-2 ตัวคูณ "ปัจจุบัน" ในบรรทัดขา · I-3 % ผูกราคาในเซลล์ §6 · audit ราคาอื่น · M-1/M-2/M-3
const t = require('./_t.js')('review-fixes');
const fs = require('fs'), path = require('path');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const S = require('../../tools/v3/schema.js');
const P = require('../../tools/v3/prose.js');
const B = require('../../build.js');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const A = require('../../tools/migrate-v3/assemble.js');
const MP = require('../../tools/migrate-v3/prose.js');
const AU = require('../../tools/migrate-v3/audit.js');
const RMG = require('../../tools/migrate-v3/remigrate.js');
const ROOT = path.join(__dirname, '..', '..');
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
const MF = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (s) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`))); delete d._sig; d.market.priceDate = today; d.meta.analysisDate = today; return d; };
const mosCell = (html) => (/<div class="vcell"><div class="k">[^<]*<\/div><div class="v([^"]*)">MOS ~/.exec(html) || [])[1];

// ── I-1: ช่อง MOS หมวด 8 — หน้า v2 พิมพ์ class literal (cron v2 เขียนใหม่ทุกรอบ) · ทางจริง v2 → parse → assemble → render
{
  // AAPL v2 ในคลัง (git) พิมพ์ <div class="v bad">MOS ~ {{rd:mos}} — fixture เก่าพิมพ์ style สี ⇒ แปลงเป็นรูปของคลังจริง
  const raw = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'AAPL-v2.html'), 'utf8').replace(/<div class="v" style="color:#ff8a80">MOS ~/, '<div class="v bad">MOS ~');
  t(/<div class="v bad">MOS ~ \{\{rd:mos\}\}/.test(raw), 'fixture: v2 MOS cell carries the literal class "bad"');
  const p = PV.parseV2('AAPL', raw);
  const r = A.assemble(p, { seeds: SEEDS, headUpdated: MF.updated, v2Hash: MF.v2Hash, today: p.rd.values.priceDate, analysisPx: null });
  const cells = r.doc.v2Display && r.doc.v2Display.vcells;
  t(cells && cells.some((c) => /\{\{mos\}\}/.test(c.v) && c.tone === 'mos'), 'assemble: MOS vcell keeps a live tone ("mos"): ' + JSON.stringify(cells));
  t(cells && cells.filter((c) => c.tone).length === 1, 'only the MOS cell carries a tone');
  const v = C.compute(r.doc, { seeds: SEEDS });
  t(v.d.mos < -5, 'fixture price: MOS negative (' + v.d.mos + ')');
  t.eq(mosCell(B.expandReport(R.toV2Source(r.doc, v))), ' bad', 'render at the v2 price: MOS cell class "bad" (red) as the v2 page');
  // ราคาลงจน MOS บวกเกิน dead-band → สีตามราคา (ไม่แช่ "bad")
  const px = Math.round(v.fv * 0.6 * 100) / 100;
  const cheap = { ...r.doc, market: { ...r.doc.market, px, chart: { ...r.doc.market.chart, data: r.doc.market.chart.data.map((q, i, a) => (i === a.length - 1 ? [q[0], px] : q)) } } };
  t.eq(mosCell(B.expandReport(R.toV2Source(cheap, C.compute(cheap, { seeds: SEEDS })))), ' good', 'price −40% under FV: the same cell turns "good" (class follows the price)');
  // ช่องอื่นที่มี class แต่ไม่ใช่ช่อง {{rd:mos}} = ไม่พก tone
  const raw2 = raw.replace(/(<div class="vcell"><div class="k">มูลค่าเหมาะสม<\/div><div class="v)(")/, '$1 bad$2');
  const p2 = PV.parseV2('AAPL', raw2);
  const r2 = A.assemble(p2, { seeds: SEEDS, headUpdated: MF.updated, v2Hash: MF.v2Hash, today: p2.rd.values.priceDate, analysisPx: null });
  t(!r2.doc.v2Display.vcells[0].tone, 'a class on a non-MOS cell is not read as the MOS tone');
}

// ── I-2: ตัวคูณที่ผู้เขียนกำกับว่า "ปัจจุบัน" ในข้อความตามตัว → token สด · ตัวคูณเป้าหมาย/ในอดีต/ปัดเอง = literal
{
  const d = load('ZTS');
  const v = C.compute(d, { seeds: SEEDS });
  const pe = MP.shownOf('pe', v), ps = MP.shownOf('ps', v), yl = MP.shownOf('yield', v);
  t(/\d\.\d/.test(pe) && /\d\.\d/.test(ps), 'fixture: pe/ps render with a decimal (' + pe + ' · ' + ps + ')');
  const tk = (s) => MP.tokenise(s, v, [], 'v2Display.legDescs[0]', { exact: false, noMult: true, exactOnly: new Set(['pe', 'ps', 'yield']), multPhrase: true }).text;
  t.eq(tk(`มัธยฐาน 5 ปี ไม่ได้มาจาก P/E ปัจจุบัน ${pe}x`), 'มัธยฐาน 5 ปี ไม่ได้มาจาก P/E ปัจจุบัน {{pe}}x', 'PG shape "P/E ปัจจุบัน 22.1x" → {{pe}}x');
  t.eq(tk(`ต่ำกว่า P/E ตลาดปัจจุบัน (~${pe}x)`), 'ต่ำกว่า P/E ตลาดปัจจุบัน (~{{pe}}x)', 'qualifier with "~" and "(" before the number');
  t.eq(tk(`ไม่ได้อิงตัวคูณปัจจุบัน ${pe}x`), 'ไม่ได้อิงตัวคูณปัจจุบัน {{pe}}x', 'no metric label ("ตัวคูณปัจจุบัน") → the one price-bound multiple that equals it');
  t.eq(tk(`P/E เป้าหมาย ${pe}x (มัธยฐาน 5 ปี)`), `P/E เป้าหมาย ${pe}x (มัธยฐาน 5 ปี)`, 'target multiple that equals today\'s P/E (no current qualifier) stays literal');
  t.eq(tk(`ไม่ใช่ตัวคูณปัจจุบัน · มัธยฐาน 5 ปี ${pe}x`), `ไม่ใช่ตัวคูณปัจจุบัน · มัธยฐาน 5 ปี ${pe}x`, 'qualifier in an earlier clause (DPZ shape) does not reach the number');
  t.eq(tk(`P/E ปัจจุบัน ช่วง 14.9–${pe}x`), `P/E ปัจจุบัน ช่วง 14.9–${pe}x`, 'another number between the qualifier and the multiple → literal');
  const rounded = String(Math.round(parseFloat(pe)));
  t.eq(tk(`P/E ปัจจุบัน ~${rounded}x`), `P/E ปัจจุบัน ~${rounded}x`, 'author rounding ("~20x" vs 19.6) stays literal (W31 as before)');
  t.eq(tk(`P/FCF ปัจจุบัน ~${pe}x`), `P/FCF ปัจจุบัน ~${pe}x`, 'a metric with no token (P/FCF) stays literal even when the value coincides');
  t.eq(tk(`P/S ปัจจุบัน ${ps}x`), 'P/S ปัจจุบัน {{ps}}x', 'the label picks the token (P/S → {{ps}})');
  t.eq(tk(`P/S ปัจจุบัน ${pe}x`), `P/S ปัจจุบัน ${pe}x`, 'labelled P/S whose value equals P/E (not P/S) stays literal');
  t.eq(tk(`Forward P/E ตลาดปัจจุบัน ~${pe}x`), 'Forward P/E ตลาดปัจจุบัน ~{{pe}}x', 'EVRG shape: "Forward P/E" equal to the page P/E (no forward value) → {{pe}}');
  t.eq(tk(`ปันผลต่อหุ้น $1.00 (yield ${yl} ตามที่ StockAnalysis รายงาน)`), 'ปันผลต่อหุ้น $1.00 (yield {{yield}} ตามที่ StockAnalysis รายงาน)', 'BAFS shape: current dividend yield → {{yield}}');
  t.eq(tk(`exit yield ${yl}`), `exit yield ${yl}`, 'an assumption yield (exit/terminal) stays literal');
  t.eq(MP.tokenise(`P/E ปัจจุบัน ${pe}x`, v, [], 'v2Display.legDescs[0]', { exact: false, noMult: true }).text, `P/E ปัจจุบัน ${pe}x`, 'without multPhrase: unchanged (other zones keep their rules)');
  const rendered = P.renderProse(tk(`P/E ปัจจุบัน ${pe}x`), v);
  t.eq(rendered, `P/E ปัจจุบัน ${pe}x`, 'the token renders the same bytes at the snapshot price');
}

// ── I-3: % ผูกราคาในเซลล์ §6 (แถวปันผล KMB) · s6 อยู่ใน P.proseFields
{
  t(S.s6RowPriceBound('ปันผลรวม 3 ปี', '~$15.36 (+15.7%)'), 'dividend row with a % of price in parentheses = price-bound');
  t(!S.s6RowPriceBound('ปันผลรวม 3 ปี', '~$15.36'), 'dividend AMOUNT alone = author assumption (not price-bound)');
  t(!S.s6RowPriceBound('ปันผลรวม 3 ปี', '~$3.8 (ไม่นับใน %)'), 'ORI "(ไม่นับใน %)" has no figure → not price-bound');
  t(S.s6RowPriceBound('ผลตอบแทนรวมปันผล', '+45%'), 'a return label that mentions dividends is still a return row');
  t(!S.s6RowPriceBound('Exit yield', '3.4%'), 'exit yield (assumption) unchanged');
  t(!S.s6RowPriceBound('ปันผลรวม 3 ปี (ไม่รวมในผลตอบแทน)', '~฿0.75'), 'PTG: a parenthetical note on a dividend label is not a return label');
  t(S.s6DivRow('ปันผลรวม 3 ปี', '~$15.36 (+15.7%)') && !S.s6DivRow('ผลตอบแทนรวมปันผล', '+45% (รวม)'), 's6DivRow: dividend row only');
  const d = load('ZTS'); d.meta.migratedFrom = MF;
  const v0 = C.compute(d, { seeds: SEEDS });
  const tg = v0.d.scenarios.map((x) => Math.round(x.tgt * 100) / 100);
  const base = (row) => ({ ...d, v2Display: { targets: tg, s6: [{ head: 'EPS 0%/ปี', rows: [['EPS ปี 3', '~$7.39'], row] }, null, null] } });
  const ok = base(['ปันผลรวม 3 ปี', '~$6.30 (+1.0%)', 'div']);
  t.eq(S.validate(ok).map((e) => e.path + ' ' + e.msg), [], 'schema accepts a live dividend row ["ปันผลรวม 3 ปี", "~$6.30 (+1.0%)", "div"]');
  t(S.validate(base(['ปันผลรวม 3 ปี', '~$6.30 (+1.0%)'])).some((e) => /s6\[0\]\.rows\[1\]\[0\]/.test(e.path)), 'schema rejects the same row frozen (2 elements)');
  t(S.validate(base(['ผลตอบแทนรวมปันผล', '+45%'])).some((e) => /s6\[0\]\.rows\[1\]\[0\]/.test(e.path)), 'schema rejects a frozen "ผลตอบแทนรวมปันผล +45%" row');
  t(S.validate(base(['EPS ปี 3', '~$6.30 (+1.0%)', 'div'])).some((e) => /rows\[1\]\[2\]/.test(e.path)), '"div" on a non-dividend row → error');
  t(S.validate(base(['ผลตอบแทน', '+5%', 'cagr'])).some((e) => /rows\[1\]\[2\]/.test(e.path)), 'live-row kind outside tot/py/div → error');
  t(S.validate(base(['ผลตอบแทน', '+5% (+2%/ปี)', 'tot'])).some((e) => /rows\[1\]\[1\]/.test(e.path)), 'live row with two % figures → error');
  const nd = base(['ปันผลรวม 3 ปี', '~$6.30 (+1.0%)', 'div']); nd.scenarios = { ...nd.scenarios, cases: nd.scenarios.cases.map(({ divCum, ...c }) => c) };
  t(S.validate(nd).some((e) => /rows\[1\]\[2\]/.test(e.path) && /divCum/.test(e.msg)), '"div" without scenarios.cases[i].divCum → error');
  const v = C.compute(ok, { seeds: SEEDS });
  const want = (v.d.scenarios[0].div / v.d.px * 100).toFixed(1);
  t.eq(R.liveRowRet('~$6.30 (+1.0%)', 'div', 0, v), `~$6.30 (+${want}%)`, 'liveRowRet "div" = scenario dividends ÷ current price (amount kept, decimals as written)');
  t(R.toV2Source(ok, v).includes(`~$6.30 (+${want}%)`), 'rendered §6 cell prints the live %');
  // liveRowRet — ขีดลบ/ไม่มีเครื่องหมาย/ปัดเป็นศูนย์ (M-9)
  const vt = { d: { px: 100, scenarios: [{ total: -12.34, div: 5 }] }, doc: { scenarios: { years: 3, perYear: null } } };
  t.eq(R.liveRowRet('ราคา –10%', 'tot', 0, vt), 'ราคา −12%', 'author en dash → U+2212 on a negative return');
  t.eq(R.liveRowRet('ราคา 10.0%', 'tot', 0, { ...vt, d: { px: 100, scenarios: [{ total: 7.25 }] } }), 'ราคา 7.3%', 'no sign written + positive → no sign added');
  t.eq(R.liveRowRet('ราคา −1%', 'tot', 0, { ...vt, d: { px: 100, scenarios: [{ total: -0.2 }] } }), 'ราคา +0%', 'rounds to zero → no minus sign ("+0%" — convention of fmtMos)');
  t.eq(R.liveRowRet('ราคา 10%', 'tot', 0, vt), 'ราคา −12%', 'no sign written + negative → minus after the space');
  // P.proseFields เห็นเซลล์ §6 (กติกา B / W31) — ค่าของแถวคิดสดไม่นับ
  const paths = P.proseFields(base(['ปันผลรวม 3 ปี', '~$6.30 (+1.0%)', 'div'])).map((x) => x.path);
  t(paths.includes('v2Display.s6[0].head') && paths.includes('v2Display.s6[0].rows[0][1]') && paths.includes('v2Display.s6[0].rows[1][0]'), 'proseFields: §6 head + rows');
  t(!paths.includes('v2Display.s6[0].rows[1][1]'), 'proseFields: a live row value (rendered live) is not counted');
  t(P.countMoneyLiterals(base(['ปันผลรวม 3 ปี', '~$6.30 (+1.0%)', 'div'])) > P.countMoneyLiterals(d), 'W31 counts money literals carried in §6 cells');
}

// ── audit: gate ที่ราคาอื่น (×0.8 · ×1.25) เข้าตารางผล (จุดบอดของการเทียบที่ราคา snapshot)
{
  const d = load('ZTS'); d.meta.migratedFrom = MF;
  t.eq(AU.perturbOf(d, { seeds: SEEDS, today }), [], 'clean doc: no new gate error / W31 rise at ×0.8 · ×1.25');
  const orig = RMG.gateRes;
  try {
    RMG.gateRes = (doc, k, o) => { const r = orig(doc, k, o); return k === 1 ? r : { errors: r.errors.concat([{ id: 'E99', msg: 'stub error at another price' }]), warnings: r.warnings.concat([{ id: 'W31', msg: '99 literal' }]) }; };
    const p = AU.perturbOf(d, { seeds: SEEDS, today });
    t(p.some((x) => /×0\.8: new E99/.test(x)) && p.some((x) => /×1\.25: W31 \d+ → 99/.test(x)), 'new error / W31 rise at a perturbed price reported: ' + JSON.stringify(p));
    const v = C.compute(d, { seeds: SEEDS });
    const row = AU.auditDoc('ZTS', d, { raw: R.toV2Source(d, v), ref: 't' }, { seeds: SEEDS, today });
    t(/PERTURB/.test(row.status) && row.perturb.length, 'auditDoc status carries PERTURB: ' + row.status);
    t(/perturb$/.test(AU.toCsv([row]).split('\n')[0]) && /E99/.test(AU.toCsv([row])), 'csv carries the perturb column');
  } finally { RMG.gateRes = orig; }
  const v = C.compute(d, { seeds: SEEDS });
  t.eq(AU.auditDoc('ZTS', d, { raw: R.toV2Source(d, v), ref: 't' }, { seeds: SEEDS, today }).status, 'OK', 'identical page, clean gate → OK');
}

// ── M-1 / M-2 / M-3
{
  const d = load('ZTS'); d.meta.migratedFrom = MF;
  const blk = (b) => ({ ...d, v2Display: { blocks: [b] } });
  t.eq(S.validate(blk({ after: '3', parts: [{ text: 'x' }] })), [], 'blocks[].after "3" accepted');
  t(S.validate(blk({ after: 3, parts: [{ text: 'x' }] })).some((e) => /blocks\[0\]\.after/.test(e.path)), 'M-1: numeric after (never rendered) → schema error');
  t(S.validate(blk({ after: '9', section: { n: 9 }, parts: [{ text: 'x' }] })).some((e) => /section\.title/.test(e.path)), 'M-3: extra section without a title → error (empty <h2>)');
  t(S.validate(blk({ after: '3', parts: [{ text: 'ก'.repeat(12001) }] })).some((e) => /parts\[0\]\.text/.test(e.path)), 'M-3: block text length bound');
  t(S.validate(blk({ after: '3', parts: [{ table: { headers: ['a'], rows: [['ก'.repeat(1001)]] } }] })).some((e) => /table\.rows/.test(e.path)), 'M-3: table cell length bound');
  t(S.validate({ ...d, v2Display: { vcells: [{ k: 'k', v: 'ก'.repeat(601) }] } }).some((e) => /vcells\[0\]\.v/.test(e.path)), 'M-3: vcell value length bound');
  t(S.validate({ ...d, v2Display: { hints: { 4: 'ก'.repeat(401) } } }).some((e) => /hints\.4/.test(e.path)), 'M-3: hint length bound');
  t(S.validate({ ...d, v2Display: { legend: [{ text: 'ก'.repeat(301) }] } }).some((e) => /legend\[0\]\.text/.test(e.path)), 'M-3: legend length bound');
  t(S.validate({ ...d, v2Display: { markers: { cur: 'ก'.repeat(201) } } }).some((e) => /markers\.cur/.test(e.path)), 'M-3: marker length bound');
  t(P.sanitizeErrors('ตัวหนา <b>ไม่ได้ปิด').length === 1, 'M-2: unclosed <b> → error');
  t(P.sanitizeErrors('<b>ก <i>ข</b></i>').length === 1, 'M-2: crossed <b>/<i> → error');
  t(P.sanitizeErrors('ก </i>').length === 1, 'M-2: stray </i> → error');
  t.eq(P.sanitizeErrors('<b>ก</b> <i>ข <b>ค</b></i> **ง** <br>'), [], 'M-2: balanced markup passes');
  const bad = blk({ after: '3', parts: [{ text: 'หมายเหตุ <b>ตัวหนาไม่ปิด' }] });
  const CV = require('../check-v3.js');
  const g = CV.checkDoc(bad, { skipSig: true, seeds: SEEDS, today });
  t(g.errors.some((e) => e.id === 'E51' && /ไม่สมดุล/.test(e.msg)), 'M-2: the gate (check-v3 E51) rejects an unclosed <b> in carried text');
}
t.done();
