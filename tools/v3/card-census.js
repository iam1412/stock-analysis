'use strict';
/**
 * card-census.js — นับ label การ์ด section 1 ทั้งคลัง v2 แล้วจัดกลุ่มเข้าคีย์แคตตาล็อก v3
 * ใช้: node tools/v3/card-census.js > docs/superpowers/specs/2026-09-24-card-census.md
 * ผลลัพธ์ = ตารางให้เจ้าของดูว่าแคตตาล็อกครอบกี่ % และ label ไหนตกเป็น custom
 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'reports');
const RULES = [
  ['mcap', /market\s*cap|มูลค่าตลาด/i], ['pe', /^P\/E(?!.*(เฉลี่ย|avg|median|5|10|fwd|forward))/i], ['peAvg5y', /P\/E.*(เฉลี่ย|avg|median|5\s*ปี|10\s*ปี)/i],
  ['pbv', /^P\/B/i], ['ps', /^P\/S/i], ['netIncome', /กำไรสุทธิ|net\s*income/i], ['eps', /^EPS/i], ['bvps', /^BVPS|book\s*value/i],
  ['roe', /ROE/i], ['revenue', /รายได้|revenue/i], ['grossMargin', /gross|ขั้นต้น/i], ['netMargin', /net\s*margin|กำไรสุทธิ.*%|อัตรากำไรสุทธิ/i],
  ['opMargin', /operating|ดำเนินงาน|EBIT\s*margin/i], ['yield', /ปันผล|dividend/i], ['beta', /beta/i], ['range52w', /52/],
  ['fcf', /FCF|free\s*cash/i], ['debtToEquity', /D\/E|หนี้.*ทุน|debt/i],
  // 6 คีย์เพิ่ม 24 ก.ย. 69 (Task 11 — คัดจากรอบแรกที่ coverage 88.8%) — ตรงกับ CARD_KEYS/CATALOGUE ใหม่ใน schema.js/cards.js
  ['netDebt', /หนี้.*สุทธิ|เงินสด.*สุทธิ|Net\s*(Cash|Debt)|^หนี้สิน$|^เงินสด$|หนี้สิน\s*\/\s*เงินสด|เงินสด\s*\/\s*หนี้สิน/i],
  ['ebitdaMargin', /EBITDA\s*margin/i], ['roic', /ROIC/i], ['evEbitda', /EV\s*\/\s*EBITDA/i],
  ['peForward', /(forward|fwd|NTM).*P\/E|P\/E.*(forward|fwd|NTM)/i], ['analystTarget', /เป้า.*(นักวิเคราะห์|Analyst)|Analyst.*Target|Consensus/i],
];
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
console.log(`แคตตาล็อกครอบ **${covered}/${cards} (${(covered / cards * 100).toFixed(1)}%)**\n\n| คีย์ | การ์ด |\n|---|---|`);
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`| ${k} | ${n} |`);
console.log(`\n## label ที่ไม่ลงแคตตาล็อก (top 60 → custom หรือเพิ่มคีย์)\n\n| label | การ์ด |\n|---|---|`);
for (const [k, n] of Object.entries(unmatched).sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`| ${k.replace(/\|/g, '\\|')} | ${n} |`);
