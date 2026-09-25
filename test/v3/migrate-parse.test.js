'use strict';
// Plan 4b Task 4 — parser + leg classifier on the 7 v2 fixtures (expectations measured with the Task 0 prototype 25 ก.ย. 69)
const t = require('./_t.js')('migrate-parse');
const fs = require('fs'), path = require('path');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const LG = require('../../tools/migrate-v3/legs.js');
const FIX = path.join(__dirname, '..', 'fixtures');
const load = (sym) => PV.parseV2(sym, fs.readFileSync(path.join(FIX, `${sym}-v2.html`), 'utf8'));
const fu = (v) => ({ eps: v.eps, dps: v.dps, bvps: v.bvps, shares: v.shares, revenue: v.revenue, rps: v.revenue && v.shares ? v.revenue / v.shares : null });
const legsOf = (r) => r.legs.map((l) => { const m = LG.classifyName(l.mname, l.mdesc); const mv = LG.mvalNum(l.mval); const ex = LG.extract(m, l.mdesc, l.mname, mv, fu(r.rd.values)); return { m, ctx: LG.CONTEXT_RE.test(l.mname), mv, ok: ex.ok, inputs: ex.inputs, override: ex.override, why: ex.why }; });

// parser shape (BBL)
{
  const r = load('BBL');
  t.eq([r.sym, r.sm.currency, r.fd.iso, r.fd.era, r.rd.values.dateEra], ['BBL', 'THB', '2026-07-24', 'CE', 'CE'], 'BBL: symbol · currency · footer iso/era · values.dateEra');
  t.eq(r.tags, ['SET: BBL', 'Financials • Banking', 'ธนาคารใหญ่สุดด้านสินทรัพย์'], 'BBL: header tags in order');
  t.eq(PV.text(r.h1), 'ธนาคารกรุงเทพ (Bangkok Bank)', 'BBL: h1 text');
  t(/ทำนิวไฮรอบ 52 สัปดาห์ \(฿139\.5–฿197\)/.test(PV.text(r.pxMeta)) && /ที่มา: SET \/ stockanalysis\.com \/ Investing/.test(PV.text(r.pxMeta)), 'BBL: px-meta text (52wk + sources)');
  t.eq([r.s1cards.length, r.legs.length, r.legBlocks, r.s6cols.length, r.catalysts.length, r.risks.length, r.extraSecs.length], [12, 3, 3, 3, 6, 6, 0], 'BBL: counts');
  t.eq(r.s1cards[1].k, 'P/E (TTM)', 'BBL: card label'); t.eq(r.s1cards[1].vcls, 'neu', 'BBL: card tone class');
  t.eq(r.s1cards[0].vHtml.trim(), '~{{rd:mcap}}', 'BBL: token-bearing card value kept raw');
  t.eq(r.legs[0].mname, '1. P/E Valuation', 'BBL: leg 1 name'); t.eq(r.legs[0].mval, '฿198', 'BBL: leg 1 value text');
  t.eq(r.s6cols[0].top, ['🐻 Bear', 'EPS −2%/ปี'], 'BBL: s6 bear top');
  t.eq(r.s6cols[0].lis.map((x) => x[0]), ['EPS ปี 3', 'P/E ออก', 'ปันผลรวม 3 ปี', 'สถานการณ์'], 'BBL: s6 bear rows');
  t(/แบงก์อนุรักษ์นิยม/.test(r.s8.h2) && /กลยุทธ์/.test(r.s8.zone) && r.s8.vcells.length >= 2, 'BBL: s8 verdict parts');
  t(/ข้อมูล ณ 24 ก\.ค\. 2026/.test(PV.text(r.footer)), 'BBL: footer text');
  t.eq(r.aiModel, require('../../tools/report-meta.js').readAiModel(r.html), 'parser exposes <meta ai-model>');
  t.eq(r.s3hint, 'เฉลี่ย 3 วิธี (หุ้นธนาคาร — ใช้ P/BV แทน DCF)', 'BBL: s3 hint');
  t.eq(r.s1hint, 'งบ FY2025 + ไตรมาส Q1/2026', 'BBL: s1 hint');
}
// Review Focus 1 — empty vmethod shell must not throw and must be marked
{
  const html = fs.readFileSync(path.join(FIX, 'SRE-v2.html'), 'utf8').replace(/(<div class="vmethod">\s*<div>\s*<div class="mname">)([\s\S]*?)(<\/div>\s*<div class="mdesc">)[\s\S]*?(<\/div>\s*<\/div>\s*<div class="mval">)[\s\S]*?(<\/div>)/, '$1$2$3$4$5');
  const r = PV.parseV2('SRE', html);
  t(r.legs.length === 2 && r.legs[0].empty === true && r.legs[0].mval === null && r.legs[1].empty === false, 'empty shell → legs[0].empty true, mval null, second leg intact', JSON.stringify(r.legs.map((l) => [l.empty, l.mval])));
}
// classifier + extractor — measured expectations
const want = {
  AAPL: [['pe', true, { multiple: 30 }], ['dcf', true, { g1: 8, years1: 5, tg: 3.5, r: 8.5, rfCurrency: 'USD' }], ['analyst', false, null]],
  BBL: [['pe', true, { multiple: 9 }], ['ddm', true, { g: 3, r: 9.5 }], ['pbv:justified', true, { g: 3, r: 9.5 }]],
  CASY: [['pe', true, { multiple: 35 }], ['evebitda', true, { multiple: 17 }], ['pbv:justified', true, { g: 9, r: 11 }]],
  DPZ: [['pe', true, { multiple: 21 }], ['pfcf', true, { multiple: 19 }], ['pe', true, { multiple: 17 }]],
  FTV: [['pe', true, { multiple: 21.5 }], ['evebitda', true, { multiple: 18 }], ['fcfyield', true, { yield: 4.9 }]],
  SRE: [['ddm', true, { g: 5.5, r: 8 }], ['pe', true, { multiple: 19 }]],
};
for (const [sym, exp] of Object.entries(want)) {
  const got = legsOf(load(sym));
  t.eq(got.map((l) => [l.m, l.ok, l.inputs]), exp, `${sym}: method · reproduces · inputs`);
}
{
  const b = legsOf(load('BBL'));
  t.near(b[1].override.dps, 10.194174757281553, 1e-9, 'BBL ddm: D₁ printed → override.dps = D₁/(1+g)');
  t.eq(b[2].override, { roe: 7.8, bvps: 302 }, 'BBL justified pbv: roe/bvps from the printed formula');
  const d = legsOf(load('DDOG'));
  t.eq([d[0].m, d[0].ok, d[0].override, d[1].m, d[2].m], ['pe', true, { eps: 2.95 }, 'dcf', 'analyst'], 'DDOG: pe with eps override · dcf · analyst leg');
  t(d[1].ok || (typeof d[1].why === 'string' && d[1].why.length > 0), 'DDOG dcf: reproduces or names why not (never silent)');
}
// N-stage extraction (Task 0 Q2: second phase 37 · per-year list 26 · linear fade 24)
t.eq(LG.extractDcfStages('FCF โต 12% ปี 1–5 แล้ว 6% ปี 6–10 · terminal 3%'), [{ years: 5, g: 12 }, { years: 5, g: 6 }], 'second explicit phase → 2 stages');
t.eq(LG.extractDcfStages('เติบโต 15%/12%/10%/8%/6% (ปี 1–5)'), [{ years: 1, g: 15 }, { years: 1, g: 12 }, { years: 1, g: 10 }, { years: 1, g: 8 }, { years: 1, g: 6 }], 'per-year list → 1-year stages');
t.eq(LG.extractDcfStages('โตจาก 20% ค่อย ๆ ลดเป็น 5% ใน 5 ปี'), [{ years: 1, g: 20 }, { years: 1, g: 16.25 }, { years: 1, g: 12.5 }, { years: 1, g: 8.75 }, { years: 1, g: 5 }], 'linear fade → 1-year stages interpolated end-to-end');
t.eq(LG.extractDcfStages('FCF โต 8%/ปี 5 ปี · โตถาวร 3% · r 8.5%'), null, 'plain 2-stage text → null (caller keeps g1/years1)');
// ddm2 extractor — spec §3.6 N form
{
  const ex = LG.extract('ddm2', 'D₁ €2.04 โต 11%/ปี 10 ปี แล้ว 3%/ปี · r 8.5% · 40 งวด ไม่มีมูลค่าปลายงวด', '2. DDM 2 ระยะ', 55.02, { dps: 2.04 });
  t(ex.ok && ex.inputs && ex.inputs.d1 === 2.04 && ex.inputs.g1 === 11 && ex.inputs.years1 === 10 && ex.inputs.g2 === 3 && ex.inputs.r === 8.5 && ex.inputs.horizon === 40, 'ddm2: d1/g1/years1/g2/r/horizon extracted and reproduce $55.02', JSON.stringify(ex));
}
t.done();
