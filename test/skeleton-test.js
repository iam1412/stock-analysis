#!/usr/bin/env node
'use strict';

/**
 * skeleton-test.js — กำกับ "ไฟล์โครงต้นแบบ" _template/skeleton-th.html + skeleton-us.html
 *
 * โครงต้นแบบคือจุดตั้งต้นของรายงานหุ้นใหม่ (ก๊อปแล้วแทน {{TOKEN}}) — แยกไทย (฿/SET) / ต่างประเทศ ($/NASDAQ)
 * เทสนี้พิสูจน์ 2 อย่าง:
 *   1) โครงครบ — มี marker, บล็อก stock-meta/report-data, .sub, ai-model, ครบ 8 section, footer, disclaimer,
 *      สัญลักษณ์สกุลเงินถูก (฿ ในไทย / $ ในต่างประเทศ) — กันโครงเพี้ยนแล้วรายงานที่ก๊อปไปพังตาม
 *   2) เติมแล้วผ่าน gate — เติม {{TOKEN}} ด้วยชุดข้อมูลจริงที่สอดคล้องกัน (ไทย = HMPRO จริง = "ลองใช้งานกับ HMPRO")
 *      แล้วรายงานที่ได้ต้องผ่าน check-reports (0 error) + engine รันได้ (กราฟ/gauge/calc)
 *   + token coverage: ทุก {{TOKEN}} ในโครงต้องมีค่าเติม (กันโครงเพิ่ม token แล้วลืมอัปเดต fill — เทสจะ fail)
 *
 * รัน: node test/skeleton-test.js   (npm run test:skeleton — อยู่ใน `npm run verify`)
 * exit 0 = โครง+ตัวเติมโอเค, 1 = โครงพัง/เติมแล้วไม่ผ่าน gate
 */

const fs = require('fs');
const path = require('path');
process.env.STALE_TODAY = process.env.STALE_TODAY || '2026-06-24'; // ตรึง"วันนี้" ให้ priceDate ในชุดเติมไม่ค้าง (E27/W09)

const { expandReport } = require('../build.js');
const { checkHtml } = require('./check-reports');
const { extractEngine, runEngine, assertRendered, seedFromHtml } = require('./engine-exec');

const TPL = path.join(__dirname, '..', '_template');
let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };

// ---------- buildFill: ชุดข้อมูลย่อ (base) → token map ครบ (คำนวณค่า derived ให้สอดคล้องกันเอง) ----------
const f2 = (x) => Number(x).toFixed(2);
function buildFill(b) {
  const mos20 = f2(b.fv * 0.8), mos30 = f2(b.fv * 0.7);     // จุดซื้อ + gauge scale (E18/E26)
  const m1val = f2(b.m1eps * b.m1pe);                        // วิธี P/E (E21)
  const m3val = f2(b.m3ratio * b.m3bvps);                    // วิธี Justified P/BV (E22)
  return {
    // identity
    SYMBOL: b.symbol, COMPANY_TITLE: b.companyTitle, COMPANY_H1: b.companyH1,
    EXCHANGE: b.exchange, SECTOR_TAG: b.sectorTag, NICHE_TAG: b.nicheTag, SUB: b.sub,
    GDOTS: b.gdots, ACCENT: b.reportData.theme.accent,
    CHANGE: b.change, PRICE_DATE: b.priceDate, RANGE_52W: b.range52w, SOURCES: b.sources,
    FY: b.fy, FOOTER_DATE: b.footerDate,
    // headline numbers (ใช้ซ้ำหลายที่ → คุมความสอดคล้องอัตโนมัติ)
    PRICE: String(b.price), FV: String(b.fv), MOS: String(b.mos), UPSIDE: String(b.upside),
    PE: String(b.pe), DIV_YIELD: String(b.divYield), ROE: String(b.roe),
    FV_LOW: String(b.fvLow), FV_HIGH: String(b.fvHigh), MOS20: mos20, MOS30: mos30,
    ANALYST_TGT: String(b.analystTgt), ANALYST_RATING: b.analystRating, BASE_EPS: String(b.baseEps),
    REPORT_DATA: JSON.stringify(b.reportData),
    // key metrics
    MKT_CAP: b.mktCap, SHARES: b.shares, PE_NOTE: b.peNote, PE_AVG: b.peAvg, PE_RANGE: b.peRange,
    PBV: b.pbv, PBV_NOTE: b.pbvNote, NET_PROFIT: b.netProfit, NET_PROFIT_YOY: b.netProfitYoY,
    EPS_TTM: String(b.epsTtm), EPS_FY_NOTE: b.epsFyNote, BVPS: String(b.bvps), BVPS_NOTE: b.bvpsNote,
    ROA: String(b.roa), ROE_NOTE: b.roeNote, REV_TTM: b.revTtm, REV_NOTE: b.revNote,
    MARGIN: b.margin, MARGIN_NOTE: b.marginNote, DIV_NOTE: b.divNote, BETA: b.beta, BETA_NOTE: b.betaNote,
    METRICS_HINT: b.metricsHint,
    // valuation methods
    M1_EPS: String(b.m1eps), M1_PE: String(b.m1pe), M1_VAL: m1val, M1_NOTE: b.m1note,
    M2_DIV: String(b.m2div), M2_G: String(b.m2g), M2_R: String(b.m2r), M2_VAL: String(b.m2val), M2_NOTE: b.m2note,
    M3_ROE: String(b.m3roe), M3_G: String(b.m3g), M3_R: String(b.m3r), M3_RATIO: String(b.m3ratio), M3_BVPS: String(b.m3bvps), M3_VAL: m3val,
    VALUATION_NOTE: b.valuationNote, CHART_NARRATIVE: b.chartNarrative, GAUGE_NOTE: b.gaugeNote,
    // MOS
    MOS_CLASS: b.mosClass, MOS_TEXT: b.mosText,
    // scenarios
    SC1_G: b.sc[0].g, SC1_TGT: String(b.sc[0].tgt), SC1_RET: b.sc[0].ret, SC1_EPS3: String(b.sc[0].eps3), SC1_PE: String(b.sc[0].pe), SC1_DIV: String(b.sc[0].div), SC1_DESC: b.sc[0].desc,
    SC2_G: String(b.sc[1].g), SC2_TGT: String(b.sc[1].tgt), SC2_RET: b.sc[1].ret, SC2_EPS3: String(b.sc[1].eps3), SC2_PE: String(b.sc[1].pe), SC2_DIV: String(b.sc[1].div), SC2_DESC: b.sc[1].desc,
    SC3_G: String(b.sc[2].g), SC3_TGT: String(b.sc[2].tgt), SC3_RET: b.sc[2].ret, SC3_EPS3: String(b.sc[2].eps3), SC3_PE: String(b.sc[2].pe), SC3_DIV: String(b.sc[2].div), SC3_DESC: b.sc[2].desc,
    PROJECTION_NOTE: b.projectionNote,
    CATALYSTS: b.catalysts, RISKS: b.risks,
    VERDICT_HEADLINE: b.verdictHeadline, VERDICT_BODY: b.verdictBody, STRATEGY: b.strategy,
    DISCLAIMER_SOURCES: b.disclaimerSources,
  };
}

function fill(tpl, map) { return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m)); }
const tokensIn = (tpl) => [...new Set([...tpl.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];

// ---------- ชุดข้อมูลจริงสำหรับเติม ----------
// ไทย = HMPRO จริง (= "ลองใช้งานกับ HMPRO") — ตัวเลขชุดเดียวกับ reports/HMPRO.html ที่ผ่าน gate อยู่แล้ว
const li = (items) => items.map((t) => `<li><div>${t}</div></li>`).join('\n          ');
const HMPRO = {
  symbol: 'HMPRO', companyTitle: 'โฮม โปรดักส์ เซ็นเตอร์', companyH1: 'โฮม โปรดักส์ เซ็นเตอร์ (HomePro)',
  exchange: 'SET', sectorTag: 'Consumer • Home Improvement Retail', nicheTag: 'ค้าปลีกตกแต่ง/ปรับปรุงบ้าน เบอร์ 1 ไทย',
  sub: 'ค้าปลีกสินค้าตกแต่ง/ปรับปรุงบ้าน HomePro • Mega Home วัสดุก่อสร้าง/ค้าส่ง • เครื่องใช้ไฟฟ้า/เฟอร์นิเจอร์ • บริการติดตั้ง/รีโนเวท • สาขาในมาเลเซีย',
  gdots: '<span style="background:#ffb066"></span><span style="background:#f9923a"></span><span style="background:#f57c00"></span><span style="background:#c25e00"></span>',
  change: '▼ −1% ในรอบปี', priceDate: '23–24 มิ.ย. 2026', range52w: '฿5.70–฿8.00', sources: 'SET / stockanalysis.com / Investing.com',
  fy: '2025', footerDate: '24 มิ.ย. 2026',
  price: 6.15, fv: 6.9, mos: 11, upside: 12, pe: 14.0, divYield: 6.18, roe: 20.4,
  fvLow: 6.15, fvHigh: 7.92, analystTgt: 7.15, analystRating: 'Buy', baseEps: 0.44,
  mktCap: '~฿79.5 พันล้าน', shares: '~12.93 พันล้านหุ้น', peNote: 'ถูกกว่าอดีตมาก', peAvg: '~29x', peRange: 'กรอบ 19–37x (อดีตพรีเมียมสูง)',
  pbv: '~2.9x', pbvNote: 'สูง เพราะ ROE สูงเรื้อรัง', netProfit: '฿6,011 ล้าน', netProfitYoY: '▼ −7.6% YoY',
  epsTtm: 0.44, epsFyNote: 'FY2025 ~฿0.46', bvps: 2.12, bvpsNote: 'มี.ค. 2026', roa: 6.95, roeNote: 'ROE สูงเด่นในกลุ่มค้าปลีก',
  revTtm: '~฿69.1 พันล้าน', revNote: 'FY2025 ฿70,570 ล้าน (ทรงตัว–อ่อน)', margin: '~30.3%', marginNote: 'Margin ดี • Net margin ~8.9%',
  divNote: '฿0.38/หุ้น • จ่ายปีละ 2 ครั้ง', beta: '~0.40', betaNote: 'ผันผวนต่ำ • หุ้นเชิงรับ', metricsHint: 'งบ FY2025 + TTM ถึง Q1/2026',
  m1eps: 0.44, m1pe: 18, m1note: 'ต่ำกว่าค่าเฉลี่ย 5 ปี ~29x มาก', m2div: 0.38, m2g: 3, m2r: 9, m2val: 6.52, m2note: '฿0.391 / (0.09−0.03)',
  m3roe: 20.4, m3g: 3, m3r: 9, m3ratio: 2.90, m3bvps: 2.12,
  valuationNote: 'วิธี P/E ให้ค่าสูงสุดเพราะเคยเทรดพรีเมียม; Justified P/BV น่าเชื่อเพราะ ROE สูง — ค่ากลางใกล้ราคาตลาด',
  chartNarrative: 'ราคาขึ้นแตะ ~฿8.0 (สูงสุด 52 สัปดาห์) แล้วย่อทรงตัวแถว ~฿6.15 — แทบไม่เปลี่ยนในรอบปี (~−1%) สะท้อนกำไรอ่อนลงและ P/E ลดจาก ~29x เหลือ ~14x',
  gaugeNote: 'ราคา ฿6.15 ต่ำกว่ามูลค่าเหมาะสมเล็กน้อย (FV ฿6.9) และต่ำกว่าเป้าหมายเฉลี่ยของนักวิเคราะห์ (~฿7.15) — เปิดช่อง upside หากกำไรฟื้น',
  mosClass: 'ok', mosText: '<b>ส่วนเผื่อความปลอดภัยบาง</b><br>ราคา ฿6.15 ต่ำกว่ามูลค่าเหมาะสม ฿6.9 ราว 11% → พอใช้–ทยอยสะสมได้ แต่ยังไม่ถึงโซน "น่าซื้อ" (MOS 20%+)',
  sc: [
    { g: '−3', tgt: 4.83, ret: 'รวม ~ −3% (≈ −1%/ปี)', eps3: 0.40, pe: 12, div: 1.05, desc: 'กำลังซื้อหด • แข่งขันรุนแรง' },
    { g: 4, tgt: 7.92, ret: 'รวม ~ +47% (≈ +14%/ปี)', eps3: 0.495, pe: 16, div: 1.20, desc: 'กำไรฟื้นเบาๆ • re-rate บางส่วน' },
    { g: 8, tgt: 9.99, ret: 'รวม ~ +85% (≈ +23%/ปี)', eps3: 0.555, pe: 18, div: 1.35, desc: 'ศก.ฟื้น • SSSG บวก • re-rate เต็ม' },
  ],
  projectionNote: 'หัวใจคือการกลับมาเติบโต + re-rate: หุ้น de-rate จาก ~29x เหลือ ~14x ทำให้ downside จำกัด — ปันผล ~6% ช่วยพยุงระหว่างรอ',
  catalysts: li(['<b>ผู้นำตลาด + ROE สูง:</b> เบอร์ 1 ค้าปลีกปรับปรุงบ้าน ROE ~20%', '<b>Valuation ถูกสุดในรอบหลายปี:</b> P/E ~14x จากพรีเมียม ~29x', '<b>ปันผลสม่ำเสมอ ~6%:</b> กระแสเงินสดดี margin ~30%', '<b>Beta ต่ำ ~0.40:</b> หุ้นเชิงรับ ผันผวนต่ำ']),
  risks: li(['<b>กำลังซื้อในประเทศฟื้นช้า:</b> กดยอดขาย กำไร FY2025 −7.6%', '<b>de-rating ต่อเนื่อง:</b> หากกำไรไม่ฟื้น P/E อาจต่ำต่อไป', '<b>การแข่งขันค้าปลีกรุนแรง:</b> GLOBAL/ไทวัสดุ/Dohome/e-commerce', '<b>P/BV สูง ~2.9x:</b> margin of safety เชิงทรัพย์สินจำกัด']),
  verdictHeadline: 'ผู้นำค้าปลีกบ้าน ROE สูง ปันผลดี — ราคา de-rate มาถูก รอกำไรฟื้น',
  verdictBody: 'HomePro เป็นผู้นำค้าปลีกปรับปรุงบ้านของไทย จุดเด่นคือ ROE ~20% margin ~30% ปันผล ~6% แต่เผชิญกำลังซื้อในประเทศฟื้นช้า ทำให้กำไร FY2025 −7.6% และหุ้น de-rate จาก ~29x เหลือ ~14x ที่ราคา ฿6.15 มูลค่าเหมาะสม ฿6.9 ให้ MOS บางๆ (~11%) — เหมาะ "ทยอยสะสม" เน้นปันผล + ลุ้น re-rate',
  strategy: 'สาย value/ปันผล — ทยอยสะสมเมื่อราคา <b>ต่ำกว่า ฿6.9</b> (น่าสนใจมากที่ &lt;฿5.52) ล็อก yield ~6% • ติดตาม SSSG, กำไรรายไตรมาส และการแข่งขันค้าปลีกวัสดุ',
  disclaimerSources: 'อ้างอิงงบ FY2025 (กำไรสุทธิ ฿6,011 ล้าน) จาก stockanalysis.com / SET • ราคา ณ 23–24 มิ.ย. 2026 จาก SET, stockanalysis.com, Investing.com',
  reportData: {
    theme: { accent: '#f57c00', accentDark: '#c25e00', darkGrad: 'linear-gradient(135deg,#3a2410 0%,#5e3a12 55%,#8a5418 140%)', glow: 'rgba(245,150,70,.35)', subColor: '#e0d2c2', headerMuted: '#cdbfb0', chgBg: 'var(--green-soft)', chgColor: '#1e6e30', badge: 'var(--orange)', verdictText: '#e4d8cc', vcellLabel: '#cab9a8' },
    chart: { data: [['มิ.ย.25', 6.2], ['ส.ค.25', 7.1], ['ต.ค.25', 7.6], ['ธ.ค.25', 7.3], ['ก.พ.26', 6.8], ['เม.ย.26', 6.25], ['พ.ค.26', 6.1], ['มิ.ย.26', 6.15]], min: 5.5, max: 8.2, grid: [6.0, 6.9, 7.5, 8.0], fairLine: 6.9, currency: '฿', highlight: [2, 7], gridFmt: 'v.toFixed(1)', dataFmt: 'd[1].toFixed(2)' },
    gauge: { min: 4.5, max: 9.0, cur: 6.15, fair: 6.9, fairLabelTop: '-58px' }, fv: 6.9,
  },
};

// ต่างประเทศ ($/NASDAQ) = หุ้นตัวอย่างสมมติ (ตัวเลขสอดคล้องกันเอง) — พิสูจน์ว่าโครง US เติมแล้วผ่าน gate เช่นกัน
const NWND = {
  symbol: 'NWND', companyTitle: 'Northwind Software', companyH1: 'Northwind Software (NWND)',
  exchange: 'NASDAQ', sectorTag: 'Technology • Enterprise Software', nicheTag: 'แพลตฟอร์มซอฟต์แวร์องค์กร (ตัวอย่าง)',
  sub: 'แพลตฟอร์มซอฟต์แวร์บริหารองค์กร (ERP/CRM) • คลาวด์ซับสคริปชัน • โมดูล AI วิเคราะห์ข้อมูล (บริษัทตัวอย่างสำหรับโครงต้นแบบ)',
  gdots: '<span style="background:#7aa7ff"></span><span style="background:#4f86f7"></span><span style="background:#2f6bdf"></span><span style="background:#1f4fb0"></span>',
  change: '▲ +18% ในรอบปี', priceDate: '23–24 มิ.ย. 2026', range52w: '$118–$182', sources: 'stockanalysis.com / TradingView / Investing.com',
  fy: '2025', footerDate: '24 มิ.ย. 2026',
  price: 150, fv: 168, mos: 11, upside: 12, pe: 20, divYield: 1.2, roe: 22,
  fvLow: 156, fvHigh: 180, analystTgt: 176, analystRating: 'Buy', baseEps: 7.5,
  mktCap: '~$92 พันล้าน', shares: '~613 ล้านหุ้น', peNote: 'ใกล้กลางกรอบในอดีต', peAvg: '~24x', peRange: 'กรอบ 18–32x',
  pbv: '~8.0x', pbvNote: 'สูงตามโมเดล asset-light', netProfit: '$4,600 ล้าน', netProfitYoY: '▲ +12% YoY',
  epsTtm: 7.5, epsFyNote: 'FY2025 ~$7.3', bvps: 18.75, bvpsNote: 'มี.ค. 2026', roa: 12.0, roeNote: 'ROE สูงตามธุรกิจซอฟต์แวร์',
  revTtm: '~$18.5 พันล้าน', revNote: 'FY2025 $17,900 ล้าน (+10%)', margin: '~82%', marginNote: 'Gross margin สูงแบบ SaaS • Net ~25%',
  divNote: '$1.80/หุ้น • จ่ายรายไตรมาส', beta: '~1.05', betaNote: 'ผันผวนใกล้ตลาด', metricsHint: 'งบ FY2025 + TTM ถึง Q1/2026',
  m1eps: 7.5, m1pe: 22, m1note: 'P/E เป้าใกล้กลางกรอบ ~24x', m2div: 1.80, m2g: 6, m2r: 9, m2val: 156, m2note: '$1.91 / (0.09−0.06)',
  m3roe: 22, m3g: 6, m3r: 9.5, m3ratio: 4.57, m3bvps: 18.75,
  valuationNote: 'P/E และ Justified P/BV ให้กรอบใกล้กัน — ค่ากลาง ~$168 สะท้อนการเติบโตที่ยังแข็งแรง',
  chartNarrative: 'ราคาทยอยขึ้น ~+18% ในรอบปีตามกำไร/รายได้ที่โต ก่อนพักตัวแถว ~$150 — valuation กลับสู่กลางกรอบในอดีต',
  gaugeNote: 'ราคา $150 ต่ำกว่ามูลค่าเหมาะสม (FV $168) และต่ำกว่าเป้าเฉลี่ยนักวิเคราะห์ (~$176) — upside จากการเติบโตต่อเนื่อง',
  mosClass: 'ok', mosText: '<b>ส่วนเผื่อความปลอดภัยพอใช้</b><br>ราคา $150 ต่ำกว่ามูลค่าเหมาะสม $168 ราว 11% → ทยอยสะสมได้ รอจังหวะย่อเพื่อ MOS ที่กว้างขึ้น',
  sc: [
    { g: '−2', tgt: 131, ret: 'รวม ~ −10% (≈ −3.5%/ปี)', eps3: 7.06, pe: 16, div: 5.4, desc: 'ดีมานด์ชะลอ • แข่งขันสูง' },
    { g: 6, tgt: 214, ret: 'รวม ~ +47% (≈ +14%/ปี)', eps3: 8.93, pe: 20, div: 6.0, desc: 'รายได้ซับสคริปชันโตต่อ' },
    { g: 10, tgt: 288, ret: 'รวม ~ +96% (≈ +25%/ปี)', eps3: 9.98, pe: 24, div: 6.6, desc: 'AI เร่งการเติบโต • re-rate' },
  ],
  projectionNote: 'ผลตอบแทนหลักมาจากการเติบโตของกำไร + การรักษา multiple — ปันผลน้อย (~1.2%) เน้น capital gain',
  catalysts: li(['<b>รายได้ประจำสูง (recurring):</b> โมเดลซับสคริปชันคลาดเดาได้', '<b>Margin สูงแบบ SaaS:</b> gross ~82% หนุนกำไร', '<b>โมดูล AI ใหม่:</b> เพิ่ม ARPU/อัตราต่ออายุ', '<b>ROE สูง ~22%:</b> ใช้ทุนมีประสิทธิภาพ']),
  risks: li(['<b>Valuation สูง (P/BV ~8x):</b> อ่อนไหวต่อการพลาดเป้า', '<b>การแข่งขันรุนแรง:</b> ผู้เล่นรายใหญ่กดราคา', '<b>พึ่งงบ IT องค์กร:</b> ชะลอเมื่อ ศก. อ่อน', '<b>ความเสี่ยงค่าเงิน/สัญญาใหญ่:</b> รายได้กระจุกบางลูกค้า']),
  verdictHeadline: 'ซอฟต์แวร์องค์กรโตต่อเนื่อง ROE สูง — ราคากลับมาเหมาะสม รอจังหวะสะสม',
  verdictBody: 'Northwind (ตัวอย่าง) เป็นแพลตฟอร์มซอฟต์แวร์องค์กรที่มีรายได้ประจำสูง margin ~82% และ ROE ~22% ที่ราคา $150 มูลค่าเหมาะสม $168 ให้ MOS ~11% และต่ำกว่าเป้านักวิเคราะห์ (~$176) — เหมาะทยอยสะสมเน้นการเติบโต',
  strategy: 'สาย growth — ทยอยสะสมเมื่อราคา <b>ต่ำกว่า $168</b> (น่าสนใจที่ &lt;$134) • ติดตามอัตราต่ออายุ, การเติบโตรายได้คลาวด์ และการแข่งขัน',
  disclaimerSources: 'บริษัทตัวอย่างสำหรับโครงต้นแบบ • อ้างอิงรูปแบบงบ FY2025 จาก stockanalysis.com • ราคา ณ 23–24 มิ.ย. 2026',
  reportData: {
    theme: { accent: '#2f6bdf', accentDark: '#1f4fb0', darkGrad: 'linear-gradient(135deg,#0f1f3a 0%,#163a6e 55%,#1f4fb0 140%)', glow: 'rgba(80,134,247,.35)', subColor: '#c9d6ee', headerMuted: '#b3c2dc', chgBg: 'var(--green-soft)', chgColor: '#1e6e30', badge: 'var(--blue)', verdictText: '#d6e0f2', vcellLabel: '#aebcd6' },
    chart: { data: [['Jun25', 127], ['Aug25', 138], ['Oct25', 149], ['Dec25', 158], ['Feb26', 164], ['Apr26', 156], ['May26', 152], ['Jun26', 150]], min: 115, max: 185, grid: [120, 140, 160, 180], fairLine: 168, currency: '$', highlight: [4, 7], gridFmt: 'v.toFixed(0)', dataFmt: 'd[1].toFixed(0)' },
    gauge: { min: 110, max: 230, cur: 150, fair: 168, fairLabelTop: '-58px' }, fv: 168,
  },
};

// ---------- รัน ----------
console.log('\n🧱 skeleton-test: โครงต้นแบบ TH/US เติมแล้วต้องผ่าน gate\n');

const CASES = [
  { file: 'skeleton-th.html', cur: '฿', curName: 'THB', base: HMPRO, label: 'ไทย (HMPRO จริง)' },
  { file: 'skeleton-us.html', cur: '$', curName: 'USD', base: NWND, label: 'ต่างประเทศ (NWND ตัวอย่าง)' },
];

for (const cs of CASES) {
  const p = path.join(TPL, cs.file);
  if (!fs.existsSync(p)) { ok(false, `${cs.file}: ไม่พบไฟล์โครง`); continue; }
  const tpl = fs.readFileSync(p, 'utf8');
  console.log(`── ${cs.file} — ${cs.label} ──`);

  // 1) โครงครบ
  ok(tpl.includes('<!--TEMPLATE:STYLE-->') && tpl.includes('<!--TEMPLATE:ENGINE-->'), `${cs.file}: มี marker STYLE+ENGINE`);
  ok(/id=["']stock-meta["']/.test(tpl) && /id=["']report-data["']/.test(tpl), `${cs.file}: มีบล็อก stock-meta + report-data`);
  ok(/<meta\s+name=["']ai-model["']/.test(tpl), `${cs.file}: มี meta ai-model`);
  ok(/<div class="sub">/.test(tpl), `${cs.file}: มีคำโปรยธุรกิจ .sub`);
  ok([1, 2, 3, 4, 5, 6, 7, 8].every((nn) => new RegExp(`<div class="n">${nn}</div>`).test(tpl)), `${cs.file}: ครบ 8 section`);
  ok(/สร้างด้วย stock-analyzer workflow/.test(tpl), `${cs.file}: footer มีข้อความ workflow (build แทนเป็นเครดิตโมเดล)`);
  ok(/ไม่ใช่คำแนะนำ/.test(tpl), `${cs.file}: มี disclaimer`);
  ok(tpl.includes(`>${cs.cur}{{PRICE}}<`), `${cs.file}: สัญลักษณ์สกุลเงินถูก (${cs.cur})`);
  ok(new RegExp(`"currency":"${cs.curName}"`).test(tpl), `${cs.file}: stock-meta currency = ${cs.curName}`);

  // 2) token coverage — ทุก {{TOKEN}} มีค่าเติม
  const map = buildFill(cs.base);
  const toks = tokensIn(tpl);
  const missing = toks.filter((t) => !(t in map));
  ok(missing.length === 0, `${cs.file}: ชุดเติมครอบคลุมทุก token${missing.length ? ' — ขาด: ' + missing.join(', ') : ` (${toks.length} token)`}`);

  // 3) เติมแล้วผ่าน gate
  const filled = fill(tpl, map);
  ok(!/\{\{\w+\}\}/.test(filled), `${cs.file}: เติมครบ ไม่เหลือ {{token}}`);
  let smOk = false, rdOk = false;
  try { JSON.parse(filled.match(/id=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/)[1]); smOk = true; } catch (e) { /* */ }
  try { JSON.parse(filled.match(/id=["']report-data["'][^>]*>([\s\S]*?)<\/script>/)[1]); rdOk = true; } catch (e) { /* */ }
  ok(smOk && rdOk, `${cs.file}: บล็อก stock-meta + report-data เป็น JSON ที่ parse ได้หลังเติม`);

  let expanded;
  try { expanded = expandReport(filled); } catch (e) { ok(false, `${cs.file}: expandReport throw: ${e.message}`); continue; }
  const res = checkHtml(expanded, cs.base.symbol + '.html');
  ok(res.errors.length === 0, `${cs.file}: รายงานที่เติมแล้วผ่าน check-reports (0 error)` + (res.errors.length ? ' — ' + res.errors.map((e) => e.id + ':' + e.msg).join(' | ') : ''));

  const body = extractEngine(expanded);
  const r = body ? runEngine(body, seedFromHtml(expanded)) : { ok: false, error: { message: 'ไม่พบ engine' } };
  ok(r.ok && body && assertRendered(r.doc).length === 0, `${cs.file}: engine รันได้ (กราฟ/gauge/calc)` + (r.ok ? '' : ' — ' + (r.error && r.error.message)));
  console.log('');
}

console.log('─'.repeat(50));
console.log(`skeleton-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ โครงต้นแบบมีปัญหา — แก้ _template/skeleton-*.html หรือชุดเติมในเทส\n'); process.exit(1); }
console.log('\n✅ โครงต้นแบบ TH/US เติมแล้วผ่าน gate + engine รันได้\n'); process.exit(0);
