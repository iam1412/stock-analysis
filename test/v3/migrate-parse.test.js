'use strict';
// Plan 4b Task 4 — parser + leg classifier on the 7 v2 fixtures (expectations measured with the Task 0 prototype 25 ก.ย. 69)
const t = require('./_t.js')('migrate-parse');
const fs = require('fs'), path = require('path');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const LG = require('../../tools/migrate-v3/legs.js');
const FIX = path.join(__dirname, '..', 'fixtures');
const load = (sym) => PV.parseV2(sym, fs.readFileSync(path.join(FIX, `${sym}-v2.html`), 'utf8'));
const L = require('../../tools/v3/legs.js');
// fundamentals guess from report-data.values + statement currency (= stock-meta currency · what Task 5 passes)
const fu = (r) => { const v = r.rd.values; return { eps: v.eps, dps: v.dps, bvps: v.bvps, shares: v.shares, revenue: v.revenue, rps: v.revenue && v.shares ? v.revenue / v.shares : null, currency: r.sm.currency }; };
// extract gets the printed .mval text — the reproduce tolerance uses its printed precision (fix round 1 · I-1)
const legsOf = (r) => r.legs.map((l) => { const m = LG.classifyName(l.mname, l.mdesc); const mv = LG.mvalNum(l.mval); const ex = LG.extract(m, l.mdesc, l.mname, l.mval, fu(r)); return { m, ctx: LG.CONTEXT_RE.test(l.mname), mv, mvalText: l.mval, ok: ex.ok, inputs: ex.inputs, override: ex.override, why: ex.why, stages: ex.stages }; });

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

// ── fix round 1 ──
// I-1 tolerance = max(1.5%, half a unit of the printed precision) — no flat currency-unit allowance
t(LG.reproduces(19.36, '฿19') && LG.reproduces(24.41, '$24'), 'I-1: whole-unit mval keeps its rounding half-unit (CPF ฿19→19.36 · MXL $24→24.41)');
t(!LG.reproduces(0.215, '$0.63') && !LG.reproduces(1.887, '฿1.42') && !LG.reproduces(4.117, '฿4.57'), 'I-1: decimals-printed mval gets no 0.51 allowance (LWLG · ACE · SICT)');
t(LG.reproduces(1.5224, '฿1.50') && !LG.reproduces(1.53, '฿1.50'), 'I-1: 1.5% relative bound on a 2-dp mval');
t.eq([LG.mvalDp('$184.49'), LG.mvalDp('฿198'), LG.mvalDp('~$1,542.5'), LG.mvalDp(55.02)], [2, 0, 1, 2], 'mvalDp: printed decimals (text or number)');
// I-4 rfCurrency = f.currency (statement currency) — never guessed
{
  t.eq(load('AAPL').sm.currency, 'USD', 'AAPL fixture stock-meta currency = USD (the rfCurrency asserted above)');
  const d = 'FCF TTM 207M ÷ 160M หุ้น = ฿1.294/หุ้น โต 2%/ปี → ปี 1–5 = ฿1.320 / 1.347 / 1.374 / 1.401 / 1.429 · r = 9%, g ปลาย = 2% (สมมติฐานของผู้เขียน) · PV(FCF ปี 1–5) = ฿5.32 · TV = 1.429×1.02÷(9%−2%) = ฿20.81 → PV(TV) = ฿13.53 (TV = 72% ของมูลค่ารวม) · รวม ฿18.85/หุ้น';
  const th = LG.extract('dcf', d, '2. DCF (FCF 5 ปี + Terminal)', '฿18.85', { shares: 160e6, currency: 'THB' });
  t(th.ok && th.inputs.rfCurrency === 'THB' && th.inputs.g1 === 2 && th.inputs.years1 === 5 && !th.stages, 'I-4: THB dcf (NTV text) → rfCurrency THB · plain 2-stage (the trailing "PV(FCF ปี 1–5)" is not a stage)', JSON.stringify(th));
  const no = LG.extract('dcf', d, '2. DCF (FCF 5 ปี + Terminal)', '฿18.85', { shares: 160e6 });
  t(!no.ok && no.inputs && !('rfCurrency' in no.inputs) && /rfCurrency/.test(no.why), 'I-4: f.currency missing → ok:false · rfCurrency omitted · why names it', JSON.stringify(no));
}
// I-5 invariant — every ok leg on the 7 fixtures recomputes through v3 legValue with its own inputs/override (OVERRIDE_KEYS only)
{
  const OK = new Set(require('../../tools/v3/schema.js').OVERRIDE_KEYS);
  let n = 0; const bad = [];
  for (const sym of ['AAPL', 'BBL', 'CASY', 'DDOG', 'DPZ', 'FTV', 'SRE']) {
    const r = load(sym);
    for (const l of legsOf(r)) {
      if (!l.ok) continue; n++;
      const v3m = l.m.replace(/\?$/, '') === 'pbv:justified' ? 'pbv' : l.m.replace(/\?$/, '');
      let v = null; try { v = L.legValue({ method: v3m, inputs: l.inputs, override: l.override }, fu(r), 'x'); } catch (e) { /* counted below */ }
      if (!LG.reproduces(v, l.mvalText) || Object.keys(l.override || {}).some((k) => !OK.has(k))) bad.push(`${sym} ${l.m} ${l.mvalText} → ${v} ${JSON.stringify(l.override)}`);
    }
  }
  t(n >= 16 && bad.length === 0, `I-5: ${n} ok legs reproduce via L.legValue(inputs, override) within tolerance`, bad.join(' | '));
  t(legsOf(load('DPZ'))[1].override && legsOf(load('DPZ'))[1].override.fcf > 0, 'I-5: pfcf carries override.fcf (total) — no fcfps baseKey', JSON.stringify(legsOf(load('DPZ'))[1]));
}
// I-2 EV — the matched variant is returned, with the signed netDebt override (net cash ⇒ negative)
{
  const ev = LG.extract('evebitda', 'EBITDA $4,606M × EV/EBITDA 20x = EV $92.1B + เงินสดสุทธิ $9,593M = $101.7B ÷ 610M หุ้น', '3. EV/EBITDA', '$166.74', { shares: 610e6 });
  t(ev.ok && ev.override && ev.override.netDebt === -9593e6 && ev.override.ebitda === 4606e6 && LG.reproduces(ev.value, '$166.74'), 'I-2: net cash printed → override.netDebt negative, value = matched variant', JSON.stringify(ev));
  const nd = LG.extract('evebitda', 'EBITDA $1,030M × 15x = EV $15.45B − หนี้สุทธิ $1,901M ÷ 85M หุ้น', '2. EV/EBITDA', '$159', { shares: 85e6 });
  t(nd.ok && nd.override.netDebt === 1901e6 && LG.reproduces(L.legValue({ method: 'evebitda', inputs: nd.inputs, override: nd.override }, { shares: 85e6 }, 'x'), '$159'), 'I-2: net debt printed → override.netDebt positive, legValue reproduces', JSON.stringify(nd));
}
// I-3 extractDcfStages — contiguous run from year 1 only · PV/terminal/r ranges are not stages · /-list tails expand over their range
t.eq(LG.extractDcfStages('FCF โต 12% ปี 1–5 แล้ว 6% ปี 6–10 · terminal 3% → PV FCF ปี 1–10'), [{ years: 5, g: 12 }, { years: 5, g: 6 }], 'I-3: trailing "PV FCF ปี 1–10" is not a stage');
t.eq(LG.extractDcfStages('FCF โต 8% ปี 1–5 · r 9% → PV ปี 6–10 · terminal 3%'), null, 'I-3: "r 9% → PV ปี 6–10" does not become a second stage (single phase → null)');
t.eq(LG.extractDcfStages('FCF TTM $1,469M (งบ) โต 18%/ปี ปี 1–5 (1,733 / 2,045 / 2,414 / 2,848 / 3,361 $M) แล้ว 10%/ปี ปี 6–10 (3,697 / 4,066 / 4,473 / 4,920 / 5,412 $M) · WACC 9.5% · terminal g 3% (สมมติฐานของรายงานเอง) → PV FCF ปี 1–10 = $20,064M'), [{ years: 5, g: 18 }, { years: 5, g: 10 }], 'I-3 (KEYS corpus text): no spurious +10y@tg stage');
t.eq(LG.extractDcfStages('FCF TTM ÷ 160M หุ้น = ฿1.294/หุ้น โต 2%/ปี → ปี 1–5 = ฿1.320 / 1.347 · r = 9%, g ปลาย = 2% (สมมติฐานของผู้เขียน) · PV(FCF ปี 1–5) = ฿5.32'), null, 'I-3 (NTV corpus text): stays 2-stage (null)');
t.eq(LG.extractDcfStages('FCF TTM $1,019M โต 45%→35%→25%→18%→12% (ปี 1–5) = $1,478M / $1,995M · r 12% · Terminal g 4% → PV FCF ปี 1–5 = $8,424M'), [45, 35, 25, 18, 12].map((g) => ({ years: 1, g })), 'I-3/M-2 (RDDT corpus text): arrow list over ปี 1–5, not [5y@12, 5y@4]');
t.eq(LG.extractDcfStages('ฐาน FCF/share proxy $7.70 โต 15% / 12.5% / 10% / 7.5% / 5% → ปี 1–5 = $8.86 / $9.96 · r 10% → PV ปี 1–5 รวม $40.24 · Terminal g 3%'), [15, 12.5, 10, 7.5, 5].map((g) => ({ years: 1, g })), 'I-3 (CBRE corpus text): per-year list, the "r 10% → PV ปี 1–5" range ignored');
t.eq(LG.extractDcfStages('FCF ฐาน TTM $629M โต 6%/ปี ปี 1–5 แล้วชะลอ 5%/4.5%/4%/3.5%/3% ปี 6–10 → FCF ปี 1 $667M; r 8.7%, terminal g 3%'), [{ years: 5, g: 6 }].concat([5, 4.5, 4, 3.5, 3].map((g) => ({ years: 1, g }))), 'I-3 (GGG corpus text): /-list tail expanded over ปี 6–10');
t.eq(LG.extractDcfStages('FCF โต 6%/ปี ปี 1–5 แล้ว 5%/4%/3% ปี 6–10 · r 9%'), null, 'I-3: /-list tail whose length ≠ its range is rejected (no silent 5y@3)');
t.eq(LG.extractDcfStages('เติบโต 12%/10%/8% (ปี 1–3) · r 9% · terminal 3% · FCF margin 20%'), [12, 10, 8].map((g) => ({ years: 1, g })), 'I-3: /-list followed by unrelated % (r · terminal · margin) keeps only the list');
t.eq(LG.extractDcfStages('รายได้ +18%/+14% ปี27E–28E margin ไล่ระดับ 18%→21%→24% = FCF $882M/$1,214M/$1,582M · WACC 10.5% · terminal g 3.0%'), null, 'I-3 (ALNY corpus text): margin list is not a growth schedule');
t.eq(LG.extractDcfStages('FCF ปี 6–10 โต 5%/4%/3%/2%/1% หลังจากนั้น'), null, 'I-3: list for a later range (not from year 1) is not a schedule');
// M-1 fade beyond the schema bound (≤10 stages) → null
t.eq(LG.extractDcfStages('โตจาก 20% ค่อย ๆ ลดเป็น 4% ใน 20 ปี'), null, 'M-1: linear fade over 20 years exceeds 10 stages → null');
// ddm2 on real corpus snippets (N-3 · M-3)
{
  const fer = LG.extract('ddm2', 'D₁ = เงินสดที่จ่ายคืนผู้ถือหุ้นได้ปี 2570 ~$2.04/หุ้น (เงินปันผลรับจากสัมปทานปี 2569 ~$1.84/หุ้น หักค่าใช้จ่ายสำนักงานใหญ่ แล้วโต 11%); g 11%/ปี 10 ปีแรก แล้ว 3%/ปี, r 8.5% — คิดลดเพียง 40 ปี (ถึง ~ปี 2066) แล้วตัดจบที่ 0 ตามอายุสัมปทานถัวเฉลี่ย ไม่ใช้ perpetuity · คำนวณซ้ำรอบนี้ (D₁ $2.04 โต 11%/ปี 10 ปี แล้ว 3%/ปี, r 8.5%, 40 งวด, ปันผลสิ้นปี) ได้ $55.02/หุ้น', '2. DDM 2 ระยะ (อายุจำกัด 40 ปี — terminal value = 0)', '$55.02', { dps: 1.8, currency: 'EUR' });
  t.eq(fer.ok && fer.inputs, { d1: 2.04, g1: 11, years1: 10, g2: 3, r: 8.5, horizon: 40 }, 'ddm2 (FER corpus text): g2 anchored after g1/years1 (not the earlier "แล้วโต 11%")');
  const irm = LG.extract('ddm2', 'ปันผลโต 8%/ปี 3 ปี: D1 $3.737 · D2 $4.036 · D3 $4.359 จากนั้น g 4% → D4 $4.533; TV ณ ปีที่ 3 = $4.533 ÷ (8.5% − 4%) = $100.73; PV = $3.44 + $3.43 + ($4.359 + $100.73) ÷ 1.085³ $82.27 = $89.14 ต่อหุ้น — r 8.5% ชุดเดียวกับวิธี 1', '2. DDM สองระยะ (ตระกูลเดียวกับวิธี 1)', '$89.14', {});
  t.eq(irm.ok && irm.inputs, { d1: 3.737, g1: 8, years1: 3, g2: 4, r: 8.5, horizon: null }, 'ddm2 (IRM corpus text): Gordon after stage 1 (horizon null)');
  const pld = LG.extract('ddm2', 'ปันผลรายปี $4.28 (= $1.07 × 4) โต 6%/ปี ปี 1–5 (D5 $5.73) แล้ว 4.5%/ปี ปี 6–10 (D10 $7.14) · r 7.5% · g ระยะยาว 3.5%', '2. DDM สองช่วง (ปันผล 10 ปี)', '$128.47', {});
  t(!pld.ok && pld.why.length > 0, 'ddm2 (PLD corpus text, 3-phase): not reproducible → named why', pld.why);
}
// I-6 real-corpus shells: bare vmethod and the unclosed one wrapping .fv-box — no leg, counted in legBlocks, no throw
{
  const html = fs.readFileSync(path.join(FIX, 'SRE-v2.html'), 'utf8');
  const base = PV.parseV2('SRE', html);
  const bare = PV.parseV2('SRE', html.replace('<div class="fv-box">', '<div class="vmethod">\n      </div>\n      <div class="fv-box">'));
  t(bare.legs.length === base.legs.length && bare.legBlocks === base.legBlocks + 1, 'I-6: bare <div class="vmethod"></div> → no leg, legBlocks +1', `${bare.legs.length}/${bare.legBlocks} vs ${base.legs.length}/${base.legBlocks}`);
  const unclosed = PV.parseV2('SRE', html.replace('<div class="fv-box">', '<div class="vmethod">\n      <div class="fv-box">'));
  t(unclosed.legs.length === base.legs.length && unclosed.legBlocks === base.legBlocks + 1 && unclosed.fvBoxL === base.fvBoxL, 'I-6: unclosed vmethod wrapping .fv-box (APH shape) → no leg, legBlocks +1, fv-box still read', `${unclosed.legs.length}/${unclosed.legBlocks}`);
}
// M-4 a leg with mdesc but no .mval is empty (no value to reproduce or declare)
{
  const r = PV.legs('<div class="vmethod"><div><div class="mname">2. DCF</div><div class="mdesc">FCF โต 8%</div></div></div>');
  t(r.legs.length === 1 && r.legs[0].empty === true && r.legs[0].mval === null && r.legs[0].mdesc === 'FCF โต 8%', 'M-4: desc-only leg → empty:true, mval null', JSON.stringify(r.legs));
}
t.done();
