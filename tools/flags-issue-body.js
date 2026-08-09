#!/usr/bin/env node
/**
 * สร้าง body ของ GitHub Issue "Price-refresh flags — หุ้นรอ re-analysis"
 * ใช้โดย .github/workflows/update-prices.yml **และ** dead-ticker-canary.yml (step "อัปเดต issue คิว
 * re-analysis") — สองตัวเขียน issue ใบเดียวกัน และวันจันทร์เขียนวันไทยเดียวกัน ⇒ แถวประวัติของวันนั้น
 * ต้องบวกสะสม ไม่ใช่ทับทิ้ง (ดู historyRows ด้านล่าง)
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
// ★ แต่ต้อง **บวกสะสม** ไม่ใช่ทับทิ้ง — ตั้งแต่ 8 ส.ค. 2569 มีสอง workflow เขียน issue ใบนี้ในวันเดียวกัน
// (price-refresh 07:17 น. · dead-ticker-canary จันทร์ 09:23 น. = วันไทยเดียวกัน) และ added/removed วัดจาก
// PREV_BODY ที่ตัวแรกเพิ่งเขียนไป ⇒ ถ้าทับ แถววันจันทร์จะเหลือแค่ส่วนต่างของ canary และยอดเข้าใหม่จริง
// ของ price-refresh หายจากตารางถาวร (คงเหลือขยับแต่ +N ไม่ตรง — ตารางไม่ reconcile)
const prevHistoryAll = (between(prev, '<!--history-->', '<!--/history-->') || '')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l));
const todayRow = prevHistoryAll.find((l) => l.startsWith(`| ${today} `));
const cellNum = (row, re) => (row && Number((row.match(re) || [])[1])) || 0;
const addToday = added.length + cellNum(todayRow, /\|\s*\+(\d+)\s*\|/);
const remToday = removed.length + cellNum(todayRow, /\|\s*-(\d+)\s*\|/);
const historyRows = [
  `| ${today} | **${flags.length}** | +${addToday} | -${remToday} |`,
  ...prevHistoryAll.filter((l) => !l.startsWith(`| ${today} `)),
].slice(0, HISTORY_ROUNDS);

// escape ค่าใส่ช่องตาราง Markdown — กัน '|'/newline ทำตารางเพี้ยน (detail/บางฟิลด์มาจากข้อความที่ไม่ควรเชื่อ 100%)
const cell = (v) => String(v ?? '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const flagRows = flags.map(
  (x) =>
    `| ${cell(x.symbol)} | ${cell(x.reason)} | ${cell(x.reportPrice ?? '-')} | ${cell(x.marketPrice ?? '-')} | ${
      x.diffPct != null ? cell(x.diffPct + '%') : '-'
    } | ${cell(x.flaggedAt)} | ${cell(detailOf(x))} |`
);

// ฟิลด์วินิจฉัยที่ตัวตรวจแต่ละแบบแนบมา — ถ้าไม่โชว์ ข้อมูลที่ช่วย triage จะหายไปเงียบ ๆ
function detailOf(x) {
  const bits = [];
  if (x.missedSessions != null) bits.push(`ค้าง ${x.missedSessions} session`);
  if (x.probed != null) bits.push(`ถาม ${x.probed} กระดาน`);
  if (x.detail) bits.push(x.detail);
  return bits.join(' · ') || '-';
}

// reason ที่ **ห้าม re-analyze** — งานคือยืนยันเพิกถอนแล้วลบรายงาน (ดู SKILL.md STEP 0)
// `stale-quote` ไม่อยู่ในนี้: detectStaleQuotes ตั้งใจคืนฟิลด์ `signal` ไม่ใช่ `reason` จึงไม่มีวัน
// โผล่ใน price-flags.json — ใส่ไว้เท่ากับบอกผู้อ่านผิดว่ามันเขียนลงไฟล์ได้ (ชุดนี้ต้องตรงกับ
// EXTERNAL_REASONS ใน update-prices.js ซึ่งมีแค่ not-on-exchange)
const DEAD_REASONS = new Set(['not-on-exchange']);
const hasDead = flags.some((f) => DEAD_REASONS.has(f.reason));
const deadNote = hasDead
  ? [
      '',
      '> ⚠️ **`not-on-exchange` = สงสัยหุ้นตาย ไม่ใช่งานวิเคราะห์** — ยืนยันจากแหล่งปฐมภูมิ (SEC Form 25/8-K ·',
      '> ประกาศตลาด/SET · IR) ก่อน แล้ว **ลบ `reports/<SYM>.html`** · **ห้าม re-analyze** (วิเคราะห์หุ้นที่เลิกเทรด',
      '> แล้วคือการเผยแพร่ข้อมูลผิด) · flag นี้ **re-analysis ปกติ (รวม `--force`) ไม่เคลียร์** — หายได้ 3 ทาง:',
      '> ไฟล์รายงานถูกลบ · TradingView เจอ ticker กลับมา (cron รายวันตอนยืนยัน candidate หรือ canary รายสัปดาห์)',
      '> · หรือยืนยันด้วยมือแล้วสั่ง `node tools/update-prices.js --write --alive <SYM>`',
      '> ถ้ายืนยันว่ายังเทรดอยู่จริง = ปัญหา mapping **ห้ามลบรายงาน** (แก้ `tools/symbol-map.json` แล้ว `--alive`)',
    ]
  : [];

console.log(
  [
    `### 🔢 คิวคงเหลือ **${flags.length} ตัว** · เข้าใหม่รอบนี้ +${added.length} · เคลียร์ออก -${removed.length} · ข้อมูล ${today}`,
    '',
    'หุ้นที่ cron **ไม่กล้าอัปเดตอัตโนมัติ** (ราคาขยับแรง/ข้อมูลผิดปกติ) — ต้อง re-analysis ด้วย bulk workflow (§3):',
    '',
    '<!--flags-->',
    '| Symbol | เหตุผล | ราคาในรายงาน | ราคาตลาด | ต่าง | ตั้งแต่ | รายละเอียด |',
    '|---|---|---|---|---|---|---|',
    ...flagRows,
    '<!--/flags-->',
    ...deadNote,
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
    'เคลียร์คิว: เปิด session แล้วสั่ง "เคลียร์คิว price-flags" — flag ราคา (drift/mos-flip/suspect) หายเองเมื่อรายงานถูก re-analyze แล้ว' +
      (hasDead ? ' · `not-on-exchange` ต้องยืนยันแล้วลบไฟล์ (ดูกล่องเตือนด้านบน)' : '') + '',
    '_(อัปเดตอัตโนมัติโดย workflow price-refresh ทุกวัน + dead-ticker-canary ทุกวันจันทร์)_',
  ].join('\n')
);
