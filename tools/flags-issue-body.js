#!/usr/bin/env node
/**
 * สร้าง body ของ GitHub Issue "Price-refresh flags — หุ้นรอ re-analysis"
 * ใช้โดย .github/workflows/update-prices.yml (step "อัปเดต issue คิว re-analysis")
 *
 *   PREV_BODY="$(gh issue view N --json body --jq .body)" TODAY=2026-07-25 node tools/flags-issue-body.js
 *
 * body ถูก "เขียนทับทั้งใบ" ทุกรอบ cron — ตัวเลขรอบก่อนจึงหายไปทุกวัน
 * สคริปต์นี้เลยอ่าน body เดิมกลับเข้ามา เพื่อ (1) เทียบว่าหุ้นตัวไหนเข้า/ออกคิว
 * และ (2) สะสมตารางประวัติจำนวนคิวย้อนหลังไว้ในตัว issue เอง (ไม่ต้องเก็บ state ที่อื่น)
 * รายละเอียด: docs/price-refresh.md
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_ROUNDS = 14;
const MAX_LISTED = 40; // กันรายชื่อ เข้าใหม่/ออก ยาวเกินจนอ่านไม่ไหว

const flagsPath = process.env.FLAGS_FILE || path.join(__dirname, '..', 'price-flags.json');
const flags = JSON.parse(fs.readFileSync(flagsPath, 'utf8'));
const prev = process.env.PREV_BODY || '';
const today = process.env.TODAY || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

/** ตัดข้อความระหว่าง marker คู่หนึ่ง (ไม่เจอ = คืน null) */
function between(text, open, close) {
  const i = text.indexOf(open);
  const j = text.indexOf(close);
  return i < 0 || j < 0 || j < i ? null : text.slice(i + open.length, j);
}

// รายชื่อรอบก่อน: อ่านจากในกรอบ marker ก่อน — ไม่มี marker (= body รุ่นเก่าก่อนใส่ marker) ให้ scan ทั้งใบ
const prevFlagBlock = between(prev, '<!--flags-->', '<!--/flags-->') ?? prev;
const prevSymbols = prevFlagBlock
  .split('\n')
  .map((line) => (line.match(/^\|\s*([A-Z][A-Z0-9.\-]*)\s*\|/) || [])[1])
  .filter(Boolean);

const symbols = flags.map((x) => x.symbol);
const added = symbols.filter((s) => !prevSymbols.includes(s));
const removed = prevSymbols.filter((s) => !symbols.includes(s));

const list = (arr) => (arr.length > MAX_LISTED ? `${arr.slice(0, MAX_LISTED).join(', ')} … (+${arr.length - MAX_LISTED})` : arr.join(', ') || '—');

// ประวัติ: แถวของวันนี้ทับแถววันเดียวกันเสมอ (workflow_dispatch รันซ้ำวันเดิมได้) แล้วเก็บ N รอบล่าสุด
const prevHistoryRows = (between(prev, '<!--history-->', '<!--/history-->') || '')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l))
  .filter((l) => !l.startsWith(`| ${today} `));
const historyRows = [`| ${today} | **${flags.length}** | +${added.length} | -${removed.length} |`, ...prevHistoryRows].slice(
  0,
  HISTORY_ROUNDS
);

const flagRows = flags.map(
  (x) =>
    `| ${x.symbol} | ${x.reason} | ${x.reportPrice ?? '-'} | ${x.marketPrice ?? '-'} | ${
      x.diffPct != null ? x.diffPct + '%' : '-'
    } | ${x.flaggedAt} |`
);

console.log(
  [
    `### 🔢 คิวคงเหลือ **${flags.length} ตัว** · เข้าใหม่รอบนี้ +${added.length} · เคลียร์ออก -${removed.length} · ข้อมูล ${today}`,
    '',
    'หุ้นที่ cron **ไม่กล้าอัปเดตอัตโนมัติ** (ราคาขยับแรง/ข้อมูลผิดปกติ) — ต้อง re-analysis ด้วย bulk workflow (§3):',
    '',
    '<!--flags-->',
    '| Symbol | เหตุผล | ราคาในรายงาน | ราคาตลาด | ต่าง | ตั้งแต่ |',
    '|---|---|---|---|---|---|',
    ...flagRows,
    '<!--/flags-->',
    '',
    `<details><summary>เปลี่ยนแปลงรอบนี้ (+${added.length} / -${removed.length})</summary>`,
    '',
    `- **เข้าใหม่:** ${list(added)}`,
    `- **ออกจากคิว:** ${list(removed)}`,
    '',
    '</details>',
    '',
    `### 📈 ประวัติจำนวนคิว (${HISTORY_ROUNDS} รอบล่าสุด)`,
    '',
    '<!--history-->',
    '| วันที่ | คิวคงเหลือ | เข้าใหม่ | ออก |',
    '|---|---|---|---|',
    ...historyRows,
    '<!--/history-->',
    '',
    'เคลียร์คิว: เปิด session แล้วสั่ง "เคลียร์คิว price-flags" — flag จะหายเองเมื่อรายงานถูก re-analyze แล้ว',
    '_(อัปเดตอัตโนมัติโดย workflow price-refresh ทุกรอบ)_',
  ].join('\n')
);
