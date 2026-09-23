'use strict';
/**
 * cards.js — แคตตาล็อกการ์ด section 1 (Key Metrics) · label/ค่า/บรรทัดฐาน (.d) เขียนโดย template ไม่ใช่ AI
 * ★ บรรทัด .d ของการ์ดผูกราคาต้อง "ประกาศฐาน" ในรูปที่ parser ของ gate v2 อ่านได้
 *   (EPS $x → E41 · "~N หุ้น" → E43 · "$d/ปี" → W19 · "BVPS $b" → W20) ⇒ render v3 ผ่าน gate v2 ได้ตรง ๆ
 * แคตตาล็อกเต็มร่างจาก census (tools/v3/card-census.js) — ชุดนี้คือแกนจาก skeleton + คีย์ที่พบบ่อย
 */
const RV = require('../report-values.js');

const f = (view) => view.doc.fundamentals;
const need = (view, k) => { const v = f(view)[k]; if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`metrics.cards: การ์ดต้องใช้ fundamentals.${k} — เติมค่า หรือถอดการ์ดออก`); return v; };
const money = (view, v) => view.cur + RV.fmtPrice(v);
const big = (view, v) => RV.fmtBig(v, view.cur);
const pct1 = (v) => v.toFixed(1) + '%';
function sharesText(view, n) {
  if (view.cur === '฿') return n >= 1e9 ? `~${(n / 1e9).toFixed(2)} พันล้านหุ้น` : `~${(n / 1e6).toFixed(1)} ล้านหุ้น`;
  return n >= 1e9 ? `~${(n / 1e9).toFixed(2)}B หุ้น` : `~${(n / 1e6).toFixed(1)}M หุ้น`;
}
const priceBoundOrThrow = (key, v) => { if (v == null) throw new Error(`metrics.cards: ${key} คำนวณไม่ได้จากข้อมูลที่มี`); return v; };

const CATALOGUE = {
  mcap: { label: () => 'Market Cap', value: (v) => big(v, priceBoundOrThrow('mcap', v.d.mcap)), d: (v) => sharesText(v, need(v, 'shares')), cls: '' },
  pe: { label: () => 'P/E (TTM)', cls: 'neu',
    value: (v) => { const e = need(v, 'eps'); if (!(e > 0)) throw new Error('metrics.cards: pe — EPS ≤ 0 (ขาดทุน) P/E ไม่มีความหมาย ถอดการ์ดออก'); return v.d.pe.toFixed(1) + 'x'; },
    d: (v) => `EPS TTM ${money(v, need(v, 'eps'))}` },
  peAvg5y: { label: () => 'P/E เฉลี่ย ~5 ปี', value: (v) => need(v, 'peAvg5y').toFixed(1) + 'x', d: () => 'มัธยฐานย้อนหลัง', cls: '' },
  pbv: { label: () => 'P/BV', cls: 'neu', value: (v) => priceBoundOrThrow('pbv', v.d.pbv).toFixed(2) + 'x', d: (v) => `BVPS ${money(v, need(v, 'bvps'))}` },
  ps: { label: () => 'P/S', cls: 'neu', value: (v) => priceBoundOrThrow('ps', v.d.ps).toFixed(1) + 'x', d: (v) => `รายได้ TTM ${big(v, need(v, 'revenue'))}` },
  netIncome: { label: () => 'กำไรสุทธิ TTM', value: (v) => big(v, need(v, 'netIncome')), d: () => 'รอบ 12 เดือนล่าสุด', cls: '' },
  eps: { label: () => 'EPS (TTM)', value: (v) => '~' + money(v, need(v, 'eps')), d: (v) => ({ 'gaap-ttm': 'GAAP', 'adj-ttm': 'Adjusted', fy: 'ปีบัญชีล่าสุด' }[f(v).epsBasis] || ''), cls: '' },
  bvps: { label: () => 'BVPS', value: (v) => '~' + money(v, need(v, 'bvps')), d: () => 'มูลค่าทางบัญชีต่อหุ้น', cls: '' },
  roe: { label: () => 'ROE / ROA', cls: 'pos', value: (v) => `~${need(v, 'roe').toFixed(1)}%` + (f(v).roa != null ? ` / ${f(v).roa.toFixed(1)}%` : ''), d: () => 'ผลตอบแทนต่อทุน / สินทรัพย์' },
  revenue: { label: () => 'รายได้ TTM', cls: 'neu', value: (v) => big(v, need(v, 'revenue')), d: () => 'รอบ 12 เดือนล่าสุด' },
  grossMargin: { label: () => 'อัตรากำไรขั้นต้น', value: (v) => pct1(need(v, 'grossMargin')), d: () => 'Gross margin', cls: '' },
  netMargin: { label: () => 'อัตรากำไรสุทธิ', value: (v) => pct1(need(v, 'netMargin')), d: () => 'Net margin', cls: '' },
  opMargin: { label: () => 'อัตรากำไรจากดำเนินงาน', value: (v) => pct1(need(v, 'opMargin')), d: () => 'Operating margin', cls: '' },
  yield: { label: () => 'เงินปันผล', value: (v) => priceBoundOrThrow('yield', v.d.yield).toFixed(1) + '%', d: (v) => `${money(v, need(v, 'dps'))}/ปี`, cls: '' },
  beta: { label: () => 'Beta', value: (v) => need(v, 'beta').toFixed(2), d: () => 'ความผันผวนเทียบตลาด', cls: '' },
  range52w: { label: () => 'กรอบ 52 สัปดาห์', cls: '',
    value: (v) => { const r = v.doc.market.range52w; if (!r) throw new Error('metrics.cards: range52w — ไม่มี market.range52w (cron เติม)'); return `${money(v, r.lo)} – ${money(v, r.hi)}`; },
    d: () => 'ต่ำสุด – สูงสุด' },
  fcf: { label: () => 'FCF TTM', value: (v) => big(v, need(v, 'fcf')), d: () => 'กระแสเงินสดอิสระ', cls: '' },
  debtToEquity: { label: () => 'D/E', value: (v) => need(v, 'debtToEquity').toFixed(2) + 'x', d: () => 'หนี้สินต่อทุน', cls: '' },
  // 6 คีย์เพิ่ม 24 ก.ย. 69 (Task 11 card census) — label ที่พบบ่อยสุดในคลัง v2 ที่ตกเป็น custom (ดู
  // docs/superpowers/specs/2026-09-24-card-census.md): netDebt/ebitdaMargin/roic ใช้ fundamentals ตรง ๆ
  // (ไม่ผูกราคา) · evEbitda/peForward/analystTarget ผูกราคา — คำนวณจาก v.d.px/v.d.mcap (RV.derive ตัวเดิม)
  // ล้วน ๆ ไม่แตะ/ไม่เพิ่มฟิลด์ใน report-values.js · peForward/analystTarget ตั้งใจให้ label มี "P/E"/"เป้า"
  // (เข้า E41/E42 ของ check-reports.js โดยธรรมชาติ — ตัว checker คำนวณ px/eps และ (tgt−px)/px จาก .d/.v เอง
  // ซึ่งตรงกับสูตรที่การ์ดนี้ใช้คำนวณอยู่แล้ว ⇒ ผ่านโดยไม่ต้องแก้ checker)
  netDebt: { label: () => 'หนี้สินสุทธิ (Net Debt)', value: (v) => big(v, need(v, 'netDebt')), d: () => 'หนี้สินรวม − เงินสดและรายการเทียบเท่า (ติดลบ = ฐานะเงินสดสุทธิ)', cls: '' },
  ebitdaMargin: { label: () => 'EBITDA Margin', value: (v) => pct1(need(v, 'ebitda') / need(v, 'revenue') * 100), d: () => 'EBITDA ÷ รายได้ TTM', cls: '' },
  roic: { label: () => 'ROIC', cls: 'pos', value: (v) => `~${need(v, 'roic').toFixed(1)}%`, d: () => 'ผลตอบแทนต่อเงินลงทุน' },
  evEbitda: { label: () => 'EV/EBITDA', cls: 'neu',
    value: (v) => { const ev = priceBoundOrThrow('mcap', v.d.mcap) + need(v, 'netDebt'); const eb = need(v, 'ebitda'); if (!(eb > 0)) throw new Error('metrics.cards: evEbitda — EBITDA ≤ 0 ถอดการ์ดออก'); return (ev / eb).toFixed(1) + 'x'; },
    d: (v) => `EV ${big(v, priceBoundOrThrow('mcap', v.d.mcap) + need(v, 'netDebt'))} ÷ EBITDA ${big(v, need(v, 'ebitda'))}` },
  peForward: { label: () => 'Forward P/E', cls: 'neu',
    value: (v) => { const e = need(v, 'epsForward'); if (!(e > 0)) throw new Error('metrics.cards: peForward — EPS ประมาณการ ≤ 0 ถอดการ์ดออก'); return (v.d.px / e).toFixed(1) + 'x'; },
    d: (v) => `EPS ประมาณการ (Forward) ${money(v, need(v, 'epsForward'))}` },
  analystTarget: { label: () => 'เป้านักวิเคราะห์ (Consensus)', cls: '',
    value: (v) => { const t = v.doc.analyst && v.doc.analyst.target; if (typeof t !== 'number' || !Number.isFinite(t)) throw new Error('metrics.cards: analystTarget — ไม่มี doc.analyst.target'); const pct = (t - v.d.px) / v.d.px * 100; return `${money(v, t)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`; },
    d: () => 'เป้าเฉลี่ยนักวิเคราะห์ 12 เดือน' },
};

function renderCard(key, view, note) {
  const c = CATALOGUE[key];
  if (!c) throw new Error(`metrics.cards: ไม่รู้จักการ์ด ${key}`);
  const d = c.d(view);
  return { k: c.label(view), v: c.value(view), d: note ? (d ? `${d} · ${note}` : note) : d, cls: c.cls };
}

module.exports = { CATALOGUE, renderCard };
