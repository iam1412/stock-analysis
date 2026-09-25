'use strict';
/**
 * card-census.js — นับ label การ์ด section 1 ทั้งคลัง v2 แล้วจัดกลุ่มเข้าคีย์แคตตาล็อก v3
 * ใช้: node tools/v3/card-census.js > docs/superpowers/specs/2026-09-24-card-census.md
 * ผลลัพธ์ = ตารางให้เจ้าของดูว่าแคตตาล็อกครอบกี่ % และ label ไหนตกเป็น custom
 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'reports');
// Array.find = คำสั่งแรกที่แมตช์ชนะ ⇒ ต้องเรียงจาก **เจาะจงสุด → กว้างสุด** เสมอ ไม่งั้นกฎกว้าง (debt/EBIT/P\/E…)
// ชิง label ของคีย์เจาะจงไปก่อน (พบจริง 24 ก.ย. 69 — code review: debtToEquity เดิมมี bare `debt` ทำให้
// "Net Debt"/"Net Debt/EBITDA" (มีคำว่า debt) โดนนับเป็น debtToEquity ทั้งที่ควรเป็น netDebt หรือไม่แมตช์เลย)
const RULES = [
  // 6 คีย์เพิ่ม 24 ก.ย. 69 (Task 11 — คัดจากรอบแรกที่ coverage 88.8%) — ตรงกับ CARD_KEYS/CATALOGUE ใหม่ใน
  // schema.js/cards.js — วางไว้ก่อนกฎกว้างด้านล่างเสมอ (netDebt เจาะจงกว่า debtToEquity, peForward/evEbitda
  // เจาะจงกว่า pe/peAvg5y ทั่วไป) — ดู negative lookahead ใน netDebt: ไม่ดูด "Net Debt/EBITDA" (leverage
  // ratio คนละตัวชี้วัดกับหนี้สินสุทธิเป็นตัวเงิน — ตั้งแต่ Plan 4b Task 1 มีคีย์ netDebtEbitda ของตัวเองแล้ว)
  // Plan 4b Task 1 — 6 คีย์ใหม่ วางก่อนกฎกว้างที่ชิง label เดียวกัน (netDebtEbitda ก่อน netDebt · payout ก่อน yield)
  // fix round 1 (review I-3 — วัดทั้งคลัง 10,996 การ์ด): ffoPayout ก่อน payout (DPS ÷ FFO ≠ DPS ÷ EPS) · payout/ptbv ยึดต้น label
  // ("ROE / Payout" = roe · "P/BV / P/TBV" = pbv — ตัวเลขแรกคือตัวแรกใน label) · aum/backlog ที่เป็น % เปลี่ยนแปลง (growth/YoY/%) ไม่ใช่ยอดเงิน → ไม่ลง
  ['netDebtEbitda', /Net\s*Debt\s*(?:\/|to)\s*EBITDA|หนี้สินสุทธิ\s*(?:\/|ต่อ)\s*EBITDA/i],
  ['occupancy', /occupancy|อัตราการเช่า/i], ['backlog', /^(?!.*(growth|YoY|%)).*(backlog|งานในมือ)/i], ['aum', /^(?!.*(growth|YoY|%)).*(\bAUM\b|สินทรัพย์ภายใต้การจัดการ)/i],
  ['ffoPayout', /A?FFO.*payout|payout.*(A?FFO|ฐาน\s*A?FFO)/i],
  ['payout', /^(?:Dividend\s+)?Payout|^อัตราการจ่ายปันผล/i], ['ptbv', /^P\s*\/\s*TBV/i],
  ['netDebt', /(หนี้.*สุทธิ|เงินสด.*สุทธิ|^หนี้สิน$|^เงินสด$|หนี้สิน\s*\/\s*เงินสด|เงินสด\s*\/\s*หนี้สิน)|Net\s*(Cash|Debt)(?!\s*[\/:\-]\s*(EBITDA|Equity|Adj))/i],
  ['ebitdaMargin', /EBITDA\s*margin/i], ['roic', /ROIC/i], ['evEbitda', /EV\s*\/\s*EBITDA/i],
  ['peForward', /(forward|fwd|NTM).*P\/E|P\/E.*(forward|fwd|NTM)/i],
  // ★ ไม่ใช้ bare "Consensus" — คำนี้ก็โผล่ใน label ของ EPS ประมาณการ ("EPS FY2026E (consensus)") ซึ่งเป็นคนละ
  //   คีย์กับเป้าราคานักวิเคราะห์ (analystTarget) — บังคับให้ต้องมี "เป้า"/"Target"/"Price Target" ร่วมด้วยเสมอ
  ['analystTarget', /เป้า.*(นักวิเคราะห์|Analyst)|Analyst.*Target|Target.*Analyst|(Consensus|Price)\s*Target/i],
  ['mcap', /market\s*cap|มูลค่าตลาด/i],
  // Task 0 Q3 fix 2: "P/E มัธยฐาน/ย้อนหลัง" คือ peAvg5y ไม่ใช่ pe
  ['peAvg5y', /P\/E.*(เฉลี่ย|avg|median|มัธยฐาน|ย้อนหลัง|5\s*ปี|10\s*ปี)/i], ['pe', /^P\/E(?!.*(เฉลี่ย|avg|median|มัธยฐาน|ย้อนหลัง|5|10|fwd|forward))/i],
  ['pbv', /^P\/B/i], ['ps', /^P\/S/i],
  // Task 0 Q3 fix 1: margin ก่อน netIncome — "อัตรากำไรสุทธิ" มีคำว่ากำไรสุทธิ
  // fix round 1: ROE ที่ขึ้นต้น label ("ROE / Net Margin") คงเป็น roe — กฎ roe กว้างด้านล่างยังอยู่ที่เดิม
  ['roe', /^ROE/i],
  ['netMargin', /net\s*margin|กำไรสุทธิ.*%|อัตรากำไรสุทธิ/i], ['netIncome', /กำไรสุทธิ|net\s*income/i],
  // Task 0 Q3 fix 3: GAAP/Adj/Diluted EPS
  ['eps', /^(?:GAAP|Adj\.?|Adjusted|Diluted|Normali[sz]ed)?\s*EPS(?!.*(forward|fwd|20\d\dE|FY\s*'?\d{2,4}\s*E|consensus|ประมาณการ|คาด|guidance))/i], ['bvps', /^BVPS|book\s*value/i],
  ['roe', /ROE/i], ['revenue', /รายได้|revenue/i], ['grossMargin', /gross|ขั้นต้น/i],
  ['opMargin', /operating|ดำเนินงาน|EBIT\s*margin/i], ['yield', /ปันผล|dividend/i], ['beta', /beta/i], ['range52w', /52/],
  ['fcf', /FCF|free\s*cash/i],
  // ★ ตัดคำกว้าง bare `debt`/`debtor`/… ออก (เดิมดูด label ที่แค่มีคำว่า "debt" อยู่ที่ไหนก็ได้ ทั้งที่ไม่ใช่ D/E —
  //   เช่น "Net Debt") — เหลือเฉพาะรูป D/E, "Debt/Equity"/"Debt to Equity" ตรง ๆ (ทั้ง "/" และ "to" เป็นตัวคั่น)
  ['debtToEquity', /D\/E|Debt\s*(?:\/|-|to)\s*Equity|หนี้.*ทุน/i],
];
function main() {
  const counts = {}, unmatched = {};
  let cards = 0;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(DIR, f), 'utf8');
    const s1 = (html.match(/<div class="n">1<\/div>[\s\S]*?<\/section>/) || [''])[0];
    for (const m of s1.matchAll(/<div class="k">([\s\S]*?)<\/div>/g)) {
      const label = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      cards++;
      const hit = RULES.find(([, re]) => re.test(label));
      if (hit) counts[hit[0]] = (counts[hit[0]] || 0) + 1; else unmatched[label] = (unmatched[label] || 0) + 1;
    }
  }
  const covered = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`# Card census — ${cards} การ์ดใน ${fs.readdirSync(DIR).length} ใบ\n`);
  console.log('> การจัดกลุ่มนี้เป็น regex heuristic (RULES ในไฟล์นี้ — ตัวแรกที่แมตช์ชนะ) ไม่ใช่ schema จริง — ใช้ประมาณสัดส่วนให้เจ้าของตัดสินใจเรื่องแคตตาล็อก ไม่ใช่ตัวเลขที่แม่นเป๊ะ label ที่รวมหลายตัวชี้วัดในการ์ดเดียว (เช่น "ROE / ROIC") จะถูกจัดเข้าคีย์ใดคีย์หนึ่งเท่านั้นตามลำดับกฎ\n');
  console.log(`แคตตาล็อกครอบ **${covered}/${cards} (${(covered / cards * 100).toFixed(1)}%)**\n\n| คีย์ | การ์ด |\n|---|---|`);
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`| ${k} | ${n} |`);
  console.log(`\n## label ที่ไม่ลงแคตตาล็อก (top 60 → custom หรือเพิ่มคีย์)\n\n| label | การ์ด |\n|---|---|`);
  for (const [k, n] of Object.entries(unmatched).sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`| ${k.replace(/\|/g, '\\|')} | ${n} |`);
}

/** label การ์ด → คีย์แคตตาล็อก (กฎแรกที่แมตช์ชนะ) · null = ไม่ลง — migrator (tools/migrate-v3/cards.js) ใช้ตัวเดียวกับ census */
const cardKey = (label) => { const hit = RULES.find(([, re]) => re.test(label)); return hit ? hit[0] : null; };
module.exports = { RULES, cardKey, main };
if (require.main === module) main();
