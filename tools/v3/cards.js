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
// ค่าต่อหุ้น (EPS · BVPS · DPS · FFO/หุ้น · TBVPS) — RV.fmtPerShare: ≥ 1 เดิมทุก byte · < 1 = 3 หลักมีนัย (Plan 4c-audit · EPS ฿0.0158 ≠ ฿0.02)
const perShare = (view, v) => view.cur + RV.fmtPerShare(v);
// ค่าต่อหุ้นที่ติดลบได้ (EPS ขาดทุน) — ลบ U+2212 นำหน้าสัญลักษณ์ "−$0.77" ตามธรรมเนียม v2 (display-fix · เดิม "~$-0.77")
const signedPerShare = (view, v) => (v < 0 ? '−' + perShare(view, -v) : perShare(view, v));
const big = (view, v) => RV.fmtBig(v, view.cur);
const pct1 = (v) => v.toFixed(1) + '%';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
// ยอดรวมจากงบ (ทั้งบริษัท) — ลบใช้ U+2212 นำหน้าสัญลักษณ์ (RV.fmtBig รับแค่ค่าบวก) · สกุลงบ (§3.6 L — view.stmtCur)
const signedBig = (sym, v) => (v < 0 ? '−' + RV.fmtBig(-v, sym) : RV.fmtBig(v, sym));
const stmt = (view, v) => signedBig(view.stmtCur || view.cur, v);
function fyOf(view) { const y = f(view).fy; if (!y) throw new Error('metrics.cards: การ์ด FY ต้องมี fundamentals.fy — เติม หรือถอดการ์ดออก'); return y; }
function needFy(view, k) { const x = fyOf(view)[k]; if (!isNum(x)) throw new Error(`metrics.cards: การ์ดต้องใช้ fundamentals.fy.${k} — เติมค่า หรือถอดการ์ดออก`); return x; }
function needBank(view, k) { const b = f(view).bank; const x = b && b[k]; if (!isNum(x)) throw new Error(`metrics.cards: การ์ดต้องใช้ fundamentals.bank.${k} — เติมค่า หรือถอดการ์ดออก`); return x; }
function sharesText(view, n) {
  if (view.cur === '฿') return n >= 1e9 ? `~${(n / 1e9).toFixed(2)} พันล้านหุ้น` : `~${(n / 1e6).toFixed(1)} ล้านหุ้น`;
  return n >= 1e9 ? `~${(n / 1e9).toFixed(2)}B หุ้น` : `~${(n / 1e6).toFixed(1)}M หุ้น`;
}
// ป้าย FFO ชุดเดียวกับ render/gate (S.FFO_LABEL · Plan 4c-prep + Core FFO) — require ตอนเรียก: schema → prose → cards เป็นวง ⇒ require บนหัวไฟล์ได้ exports ครึ่งเดียว
const ffoL = (view) => require('./schema.js').FFO_LABEL[f(view).ffoBasis || 'ffo'];
function ffoFwd(view) { const x = f(view).ffoForward; if (!x) throw new Error('metrics.cards: การ์ดต้องใช้ fundamentals.ffoForward — เติม หรือถอดการ์ดออก'); return x; }
// fundamentals ในสกุลราคา (compute: view.fq · §3.6 L) — อัตราส่วนผูกราคาและฐานใน .d ของมันใช้ตัวนี้ ไม่ใช่ยอดสกุลงบ
const fq = (view) => view.fq || view.doc.fundamentals;
const priceBoundOrThrow = (key, v) => { if (v == null) throw new Error(`metrics.cards: ${key} คำนวณไม่ได้จากข้อมูลที่มี`); return v; };

// peForwardCalc/evEbitdaCalc — เจ้าของเดียวของเลข+ข้อความ 2 ตัวนี้ (การ์ด section 1 + prose.js priceBound()
// กติกา B ใช้ตัวเดียวกัน ไม่ก๊อปสูตร format ซ้ำ — เห็น .text ตรงกับที่การ์ดพิมพ์เป๊ะ)
function medianYears(view) {
  const leg = (view.doc.legs || []).find((l) => (l.role || 'fv') === 'fv' && l.inputs && typeof l.inputs.medianWindow === 'string');
  const m = leg && /FY(\d{4})\D+FY(\d{4})/.exec(leg.inputs.medianWindow);
  return m ? Math.max(1, +m[2] - +m[1] + 1) : 5;
}
function peForwardCalc(view) {
  const e = need(view, 'epsForward');
  if (!(e > 0)) throw new Error('metrics.cards: peForward — EPS ประมาณการ ≤ 0 ถอดการ์ดออก');
  const raw = view.d.px / e;
  return { raw, text: raw.toFixed(1) + 'x' };
}
function evEbitdaCalc(view) {
  const q = fq(view);
  if (!isNum(q.netDebt)) throw new Error('metrics.cards: การ์ดต้องใช้ fundamentals.netDebt — เติมค่า หรือถอดการ์ดออก');
  if (!isNum(q.ebitda)) throw new Error('metrics.cards: การ์ดต้องใช้ fundamentals.ebitda — เติมค่า หรือถอดการ์ดออก');
  const ev = priceBoundOrThrow('mcap', view.d.mcap) + q.netDebt;
  if (!(q.ebitda > 0)) throw new Error('metrics.cards: evEbitda — EBITDA ≤ 0 ถอดการ์ดออก');
  const raw = ev / q.ebitda;
  return { raw, text: raw.toFixed(1) + 'x' };
}

// เจ้าของเดียวของเลข+ข้อความ P/FFO (การ์ด + token + prose.priceBound — เหมือน peForwardCalc)
function pffoCalc(view) {
  const b = need(view, 'ffoPerShare');
  if (!(b > 0)) throw new Error('metrics.cards: pffo — FFO/หุ้น ≤ 0 ถอดการ์ดออก');
  const raw = view.d.px / b; return { raw, text: raw.toFixed(1) + 'x' };
}
function pffoForwardCalc(view) { const raw = view.d.px / ffoFwd(view).value; return { raw, text: raw.toFixed(1) + 'x' }; }
// Plan 4b Task 1 — P/TBV ผูกราคา (เจ้าของเดียวของเลข+ข้อความ เหมือน pffoCalc) · ตัวตั้ง fundamentals.tbvps
function ptbvCalc(view) {
  const b = need(view, 'tbvps');
  if (!(b > 0)) throw new Error('metrics.cards: ptbv — TBVPS ≤ 0 ถอดการ์ดออก');
  const raw = view.d.px / b; return { raw, text: raw.toFixed(2) + 'x' };
}

const CATALOGUE = {
  mcap: { label: () => 'Market Cap', value: (v) => big(v, priceBoundOrThrow('mcap', v.d.mcap)), d: (v) => sharesText(v, need(v, 'shares')), cls: '' },
  pe: { label: () => 'P/E (TTM)', cls: 'neu',
    value: (v) => { const e = need(v, 'eps'); if (!(e > 0)) throw new Error('metrics.cards: pe — EPS ≤ 0 (ขาดทุน) P/E ไม่มีความหมาย ถอดการ์ดออก'); return v.d.pe.toFixed(1) + 'x'; },
    d: (v) => `EPS TTM ${perShare(v, need(v, 'eps'))}` },
  // ป้ายจำนวนปี = ช่วง medianWindow ของขา fv ที่ใช้มัธยฐาน (FY2022–FY2025 → 4 ปี · ICC 24 ก.ย. 69 ตัด FY2021 ทิ้ง) · ไม่มีขา/ไม่มี window → 5 ตามชื่อคีย์
  peAvg5y: { label: (v) => `P/E มัธยฐาน ~${medianYears(v)} ปี`, value: (v) => need(v, 'peAvg5y').toFixed(1) + 'x', d: () => 'มัธยฐานย้อนหลัง', cls: '' },
  pbv: { label: () => 'P/BV', cls: 'neu', value: (v) => priceBoundOrThrow('pbv', v.d.pbv).toFixed(2) + 'x', d: (v) => `BVPS ${perShare(v, need(v, 'bvps'))}` },
  // ฐานใน .d = รายได้สกุลราคา (fq) เหมือนตัวหารของ P/S — W16 ของ gate v2 อ่านเลขนี้คิด mcap ÷ รายได้ โดยไม่ดูสัญลักษณ์สกุล
  ps: { label: () => 'P/S', cls: 'neu', value: (v) => priceBoundOrThrow('ps', v.d.ps).toFixed(1) + 'x',
    d: (v) => { need(v, 'revenue'); return `รายได้ TTM ${signedBig(v.cur, fq(v).revenue)}`; } },
  netIncome: { label: () => 'กำไรสุทธิ TTM', value: (v) => stmt(v, need(v, 'netIncome')), d: () => 'รอบ 12 เดือนล่าสุด', cls: '' },
  eps: { label: () => 'EPS (TTM)', value: (v) => '~' + signedPerShare(v, need(v, 'eps')), d: (v) => ({ 'gaap-ttm': 'GAAP', 'adj-ttm': 'Adjusted', fy: 'ปีบัญชีล่าสุด', ifrs: 'IFRS' }[f(v).epsBasis] || ''), cls: '' },
  bvps: { label: () => 'BVPS', value: (v) => '~' + signedPerShare(v, need(v, 'bvps')), d: () => 'มูลค่าทางบัญชีต่อหุ้น', cls: '' },
  roe: { label: () => 'ROE / ROA', cls: 'pos', value: (v) => `~${need(v, 'roe').toFixed(1)}%` + (f(v).roa != null ? ` / ${f(v).roa.toFixed(1)}%` : ''), d: () => 'ผลตอบแทนต่อทุน / สินทรัพย์' },
  revenue: { label: () => 'รายได้ TTM', cls: 'neu', value: (v) => stmt(v, need(v, 'revenue')), d: () => 'รอบ 12 เดือนล่าสุด' },
  grossMargin: { label: () => 'อัตรากำไรขั้นต้น', value: (v) => pct1(need(v, 'grossMargin')), d: () => 'Gross margin', cls: '' },
  netMargin: { label: () => 'อัตรากำไรสุทธิ', value: (v) => pct1(need(v, 'netMargin')), d: () => 'Net margin', cls: '' },
  opMargin: { label: () => 'อัตรากำไรจากดำเนินงาน', value: (v) => pct1(need(v, 'opMargin')), d: () => 'Operating margin', cls: '' },
  // ค่า yield ใช้ RV.TOKENS.yield ตรง ๆ (ไม่ hand-format ซ้ำ) — 2 ทศนิยม site-wide (คำตัดสินเจ้าของ 24 ก.ย. 69)
  // priceBoundOrThrow เรียกเพื่อ guard อย่างเดียว (ทิ้งค่าที่คืน) — ตัวเลขที่โชว์มาจาก RV.TOKENS.yield (2dp ทั้งเว็บ)
  yield: { label: () => 'เงินปันผล', value: (v) => { priceBoundOrThrow('yield', v.d.yield); return RV.TOKENS.yield(v.d); }, d: (v) => `${perShare(v, need(v, 'dps'))}/ปี`, cls: '' },
  beta: { label: () => 'Beta', value: (v) => need(v, 'beta').toFixed(2), d: () => 'ความผันผวนเทียบตลาด', cls: '' },
  range52w: { label: () => 'กรอบ 52 สัปดาห์', cls: '',
    value: (v) => { const r = v.doc.market.range52w; if (!r) throw new Error('metrics.cards: range52w — ไม่มี market.range52w (cron เติม)'); return `${money(v, r.lo)} – ${money(v, r.hi)}`; },
    d: () => 'ต่ำสุด – สูงสุด' },
  fcf: { label: () => 'FCF TTM', value: (v) => stmt(v, need(v, 'fcf')), d: () => 'กระแสเงินสดอิสระ', cls: '' },
  debtToEquity: { label: () => 'D/E', value: (v) => need(v, 'debtToEquity').toFixed(2) + 'x', d: () => 'หนี้สินต่อทุน', cls: '' },
  // 6 คีย์เพิ่ม 24 ก.ย. 69 (Task 11 card census) — label ที่พบบ่อยสุดในคลัง v2 ที่ตกเป็น custom (ดู
  // docs/superpowers/specs/2026-09-24-card-census.md): netDebt/ebitdaMargin/roic ใช้ fundamentals ตรง ๆ
  // (ไม่ผูกราคา) · evEbitda/peForward/analystTarget ผูกราคา — คำนวณจาก v.d.px/v.d.mcap (RV.derive ตัวเดิม)
  // ล้วน ๆ ไม่แตะ/ไม่เพิ่มฟิลด์ใน report-values.js · peForward/analystTarget ตั้งใจให้ label มี "P/E"/"เป้า"
  // (เข้า E41/E42 ของ check-reports.js โดยธรรมชาติ — ตัว checker คำนวณ px/eps และ (tgt−px)/px จาก .d/.v เอง
  // ซึ่งตรงกับสูตรที่การ์ดนี้ใช้คำนวณอยู่แล้ว ⇒ ผ่านโดยไม่ต้องแก้ checker)
  netDebt: { label: () => 'หนี้สินสุทธิ (Net Debt)', value: (v) => stmt(v, need(v, 'netDebt')), d: () => 'หนี้สินรวม − เงินสดและรายการเทียบเท่า (ติดลบ = ฐานะเงินสดสุทธิ)', cls: '' },
  ebitdaMargin: { label: () => 'EBITDA Margin',
    value: (v) => { const rev = need(v, 'revenue'); if (!(rev > 0)) throw new Error('metrics.cards: ebitdaMargin — fundamentals.revenue ≤ 0 ถอดการ์ดออก'); return pct1(need(v, 'ebitda') / rev * 100); },
    d: () => 'EBITDA ÷ รายได้ TTM', cls: '' },
  roic: { label: () => 'ROIC', cls: 'pos', value: (v) => `~${need(v, 'roic').toFixed(1)}%`, d: () => 'ผลตอบแทนต่อเงินลงทุน' },
  evEbitda: { label: () => 'EV/EBITDA', cls: 'neu',
    value: (v) => evEbitdaCalc(v).text,
    d: (v) => { need(v, 'netDebt'); need(v, 'ebitda'); return `EV ${big(v, priceBoundOrThrow('mcap', v.d.mcap) + fq(v).netDebt)} ÷ EBITDA ${big(v, fq(v).ebitda)}`; } },
  peForward: { label: () => 'Forward P/E', cls: 'neu',
    value: (v) => peForwardCalc(v).text,
    d: (v) => `EPS ประมาณการ (Forward) ${perShare(v, need(v, 'epsForward'))}` },
  // % ใช้ RV.TOKENS.analystPct(v.d) ตัวเดียวกับ token {{rd:analystPct}}/{{analyst.pct}} — ไม่คิดสูตร/ปัดเลขซ้ำเอง
  analystTarget: { label: () => 'เป้านักวิเคราะห์ (Consensus)', cls: '',
    value: (v) => { const t = v.doc.analyst && v.doc.analyst.target; if (typeof t !== 'number' || !Number.isFinite(t)) throw new Error('metrics.cards: analystTarget — ไม่มี doc.analyst.target'); return `${money(v, t)} (${RV.TOKENS.analystPct(v.d)})`; },
    d: () => 'เป้าเฉลี่ยนักวิเคราะห์ 12 เดือน' },
  // Plan 2a Task 8 — ตัวเลขทั้งปีคู่ TTM (§3.6 B) · ป้ายต่อท้ายด้วย period ที่ประกาศ
  netIncomeFy: { label: (v) => `กำไรสุทธิ ${fyOf(v).period}`, value: (v) => stmt(v, needFy(v, 'netIncome')), d: () => 'ทั้งปีบัญชี', cls: '' },
  epsFy: { label: (v) => `EPS ${fyOf(v).period}`, value: (v) => '~' + signedPerShare(v, needFy(v, 'eps')), d: () => 'ทั้งปีบัญชี', cls: '' },
  revenueFy: { label: (v) => `รายได้ ${fyOf(v).period}`, cls: 'neu', value: (v) => stmt(v, needFy(v, 'revenue')), d: () => 'ทั้งปีบัญชี' },
  // Plan 2a Task 8 — KPI ธนาคาร (§3.6 K)
  nim: { label: () => 'NIM', value: (v) => needBank(v, 'nim').toFixed(2) + '%', d: () => 'ส่วนต่างอัตราดอกเบี้ยสุทธิ', cls: '' },
  npl: { label: () => 'NPL / Coverage', value: (v) => `${needBank(v, 'npl').toFixed(1)}% / ${needBank(v, 'coverage').toFixed(0)}%`, d: () => 'หนี้เสีย / สำรองต่อหนี้เสีย', cls: '' },
  capital: { label: () => 'CET1 / CAR', cls: 'pos', value: (v) => `~${needBank(v, 'cet1').toFixed(1)}% / ${needBank(v, 'car').toFixed(1)}%`, d: () => 'เงินกองทุนชั้นที่ 1 / เงินกองทุนรวม' },
  // Plan 2a Task 9 — REIT (§3.6 J) · ป้าย FFO/AFFO ตาม fundamentals.ffoBasis
  pffo: { label: (v) => `P/${ffoL(v)} (TTM)`, cls: 'neu', value: (v) => pffoCalc(v).text, d: (v) => `${ffoL(v)}/หุ้น ${perShare(v, need(v, 'ffoPerShare'))}` },
  pffoForward: { label: (v) => `Forward P/${ffoL(v)}`, cls: 'neu', value: (v) => pffoForwardCalc(v).text,
    d: (v) => { const x = ffoFwd(v); return `${ffoL(v)} ${x.period} ` + (isNum(x.low) && isNum(x.high) ? `${perShare(v, x.low)}–${perShare(v, x.high)}` : perShare(v, x.value)); } },
  ffoPerShare: { label: (v) => `${ffoL(v)}/หุ้น (TTM)`, value: (v) => perShare(v, need(v, 'ffoPerShare')), d: () => 'ต่อหุ้น รอบ 12 เดือนล่าสุด', cls: '' },
  // ป้าย "เฉลี่ย" ไม่ใช่ "มัธยฐาน": ค่านี้ผู้เขียนพิมพ์เอง (ไม่มี median-multiples ของ P/FFO) — ต่างจาก peAvg5y (Task 2) · EQIX ต้นทาง "เฉลี่ย ~5 ปี"
  pffoAvg5y: { label: (v) => `P/${ffoL(v)} เฉลี่ย ~5 ปี`, value: (v) => need(v, 'pffoAvg5y').toFixed(1) + 'x', d: () => 'ค่าเฉลี่ยย้อนหลัง', cls: '' },
  ffoMargin: { label: (v) => `${ffoL(v)} Margin`, cls: '',
    value: (v) => { const rev = fq(v).revenue; if (!(isNum(rev) && rev > 0)) throw new Error('metrics.cards: ffoMargin — ต้องมี fundamentals.revenue > 0'); return pct1(need(v, 'ffoPerShare') * need(v, 'shares') / rev * 100); },
    d: (v) => `${ffoL(v)} รวม ÷ รายได้ TTM` },
  // หารด้วย FFO/หุ้น — guard > 0 เหมือน pffoCalc (0 → "Infinity%" · ลบ → payout ติดลบไร้ความหมาย)
  ffoPayout: { label: (v) => `${ffoL(v)} Payout`, cls: '',
    value: (v) => { const b = need(v, 'ffoPerShare'); if (!(b > 0)) throw new Error('metrics.cards: ffoPayout — fundamentals.ffoPerShare ≤ 0 ถอดการ์ดออก'); return pct1(need(v, 'dps') / b * 100); },
    d: (v) => `ปันผล ÷ ${ffoL(v)}/หุ้น` },
  // Plan 4b Task 1 — 6 คีย์จาก Task 0 Q3 (label ที่ตกเป็น custom บ่อยสุดหลัง Plan 2a): 4 จากงบ · payout อัตราส่วนไม่ผูกราคา · ptbv ผูกราคา
  occupancy: { label: () => 'Occupancy', value: (v) => pct1(need(v, 'occupancy')), d: () => 'อัตราการเช่าพื้นที่', cls: '' },
  netDebtEbitda: { label: () => 'Net Debt / EBITDA', cls: 'neu',
    value: (v) => { const e = need(v, 'ebitda'); if (!(e > 0)) throw new Error('metrics.cards: netDebtEbitda — fundamentals.ebitda ≤ 0 ถอดการ์ดออก'); const x = need(v, 'netDebt') / e, r = Math.abs(x).toFixed(1); return (x < 0 && r !== '0.0' ? '−' : '') + r + 'x'; },   // เงินสดสุทธิ = ลบ U+2212 · ปัดเป็น 0.0 = ไม่มีเครื่องหมาย (final review N-1)
    d: () => 'หนี้สินสุทธิ ÷ EBITDA (สกุลงบทั้งคู่)' },
  backlog: { label: () => 'Backlog', value: (v) => stmt(v, need(v, 'backlog')), d: () => 'งานในมือ / คำสั่งซื้อค้างส่ง', cls: '' },
  payout: { label: () => 'Payout Ratio', cls: '',
    value: (v) => { const e = need(v, 'eps'); if (!(e > 0)) throw new Error('metrics.cards: payout — EPS ≤ 0 (ขาดทุน) payout ไม่มีความหมาย ถอดการ์ดออก'); return pct1(need(v, 'dps') / e * 100); },
    d: () => 'ปันผล ÷ EPS' },
  aum: { label: () => 'AUM', value: (v) => stmt(v, need(v, 'aum')), d: () => 'สินทรัพย์ภายใต้การจัดการ', cls: '' },
  ptbv: { label: () => 'P/TBV', cls: 'neu', value: (v) => ptbvCalc(v).text, d: (v) => `TBVPS ${perShare(v, need(v, 'tbvps'))}` },
};

function renderCard(key, view, note) {
  const c = CATALOGUE[key];
  if (!c) throw new Error(`metrics.cards: ไม่รู้จักการ์ด ${key}`);
  const d = c.d(view);
  return { k: c.label(view), v: c.value(view), d: note ? (d ? `${d} · ${note}` : note) : d, cls: c.cls };
}

module.exports = { CATALOGUE, renderCard, peForwardCalc, evEbitdaCalc, pffoCalc, pffoForwardCalc, ptbvCalc };
