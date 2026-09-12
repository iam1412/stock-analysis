#!/usr/bin/env node
'use strict';
/** replay คิว price-flags 8 snapshot ล่าสุดผ่าน triage ใหม่ (offline · จาก git history) — วัด "คิว LLM ลด ≥50%" (spec §6 ระยะ 1)
 *  กฎเก่า = ทุก LIGHT/FULL ที่ไม่ skip ส่ง LLM · กฎใหม่ = llmList (flip → PREPATCH เว้นอายุ >90 วัน — ไม่มีปฏิทินย้อนหลังจึงวัดเฉพาะกฎ flip)
 *  ใช้: node docs/superpowers/audit/2026-09-11-stock-analyzer/replay-queue.js   (cwd = รากรีโป) */
const path = require('path');
const { execSync } = require('child_process');
const T = require('../../../../tools/queue/triage.js');
const { footerDate, ageDays } = require('../../../../tools/queue/footer-date.js');
const CWD = { cwd: path.resolve(__dirname, '../../../..') };
const shas = execSync("git log --since=2026-08-01 --format='%h|%ad' --date=short -- price-flags.json", { encoding: 'utf8', ...CWD }).trim().split('\n').slice(0, 8);
const OLD = { 'mos-sign-flip': 'LIGHT', 'drift-gt-15pct': 'LIGHT', 'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL' };
let sumOld = 0, sumNew = 0;
console.log('| snapshot | flags | LLM (กฎเก่า) | LLM (กฎใหม่) | ลด |\n|---|---|---|---|---|');
for (const line of shas) {
  const [sha, date] = line.split('|');
  let flags; try { flags = JSON.parse(execSync(`git show ${sha}:price-flags.json`, { encoding: 'utf8', ...CWD })); } catch (e) { console.log('ข้าม', sha, `อ่าน/parse price-flags.json ไม่ได้ (${e.message.split('\n')[0]})`); continue; }
  if (!Array.isArray(flags) || !flags.length) { console.log('ข้าม', sha, 'คิวว่าง ([])'); continue; }
  const footerAgeOf = (sym) => { try { const h = execSync(`git show ${sha}:reports/${sym}.html`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...CWD }); const d = footerDate(h); return d ? ageDays(d.iso, date) : null; } catch (_) { return null; } };
  const rows = T.triage(flags, { footerAgeOf });
  const oldLLM = rows.filter((r) => { const b = /^drift-gt-/.test(r.reason) ? 'LIGHT' : OLD[r.reason]; return b && !(r.footerAge != null && r.footerAge <= T.FRESH_DAYS); }).length;
  const newLLM = T.llmList(rows).length;
  sumOld += oldLLM; sumNew += newLLM;
  console.log(`| ${date} ${sha} | ${flags.length} | ${oldLLM} | ${newLLM} | ${oldLLM ? Math.round((1 - newLLM / oldLLM) * 100) : 0}% |`);
}
console.log(`\nรวม: กฎเก่า ${sumOld} · กฎใหม่ ${sumNew} · ลด ${Math.round((1 - sumNew / sumOld) * 100)}% (เกณฑ์ ≥50%)`);
process.exit(sumOld && 1 - sumNew / sumOld >= 0.5 ? 0 : 1);
