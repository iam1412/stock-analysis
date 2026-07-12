#!/usr/bin/env node
'use strict';
/**
 * apply-edits.js — apply การแก้ไขหลายจุดลงไฟล์เดียวใน **คำสั่งเดียว แบบ all-or-nothing**
 * แก้ปัญหา worker ยิง Edit tool ทีละ turn (วัดจริง 12 ก.ค. 2569: 12–16 turns = +~1M cache-read/หุ้น)
 * — จุดไหนหาไม่เจอ / เจอซ้ำ = ไม่เขียนไฟล์เลยทั้งชุด แล้วรายงานทุกจุดที่พังพร้อมกัน ให้แก้แล้วรันใหม่
 * — "หาไม่เจอ" จะพิมพ์บรรทัดจริงในไฟล์ที่ใกล้เคียงสุดมาให้ copy เป็น "เดิม" ได้ทันที (ไม่ต้อง grep กู้)
 *
 * ใช้ (stdin heredoc — ไม่ทิ้งไฟล์ temp ใน worktree):
 *   node tools/apply-edits.js reports/<SYM>.html <<'EOF'
 *   @@
 *   ข้อความเดิม verbatim (หลายบรรทัดได้ ไม่ต้อง escape)
 *   @@=
 *   ข้อความใหม่
 *   @@end
 *   @@all            ← ใช้แทน @@ เมื่อต้องการ replace ทุก occurrence (ต้องเจอ ≥1)
 *   เดิม
 *   @@=
 *   ใหม่
 *   @@end
 *   EOF
 *
 * กติกา: บล็อก `@@` ปกติ ข้อความเดิมต้องเจอ**ครั้งเดียวเป๊ะ** (ไม่ unique → เพิ่ม context ให้ยาวขึ้น)
 * apply เรียงตามลำดับบล็อก (บล็อกหลังเห็นผลของบล็อกก่อนหน้า) · เดิม=ใหม่ หรือเดิมว่าง = error
 */

const fs = require('fs');

function die(msg) { console.error(msg); process.exit(1); }

const file = process.argv[2];
if (!file) die('ใช้: node tools/apply-edits.js <file> <<\'EOF\' ... EOF (อ่านบล็อกแก้ไขจาก stdin)');
if (!fs.existsSync(file)) die(`✗ ไม่พบไฟล์ ${file}`);

const stdin = fs.readFileSync(0, 'utf8');

// ---- parse edit blocks ----
const edits = []; // {old, new, all, line}
let state = 'out'; // out | old | new
let cur = null;
const lines = stdin.split('\n');
for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const marker = raw.replace(/[\s\r]+$/, ''); // ยอมรับ trailing space/CR บนบรรทัด marker
  if (state === 'out') {
    if (marker === '@@' || marker === '@@all') {
      cur = { old: [], new: [], all: marker === '@@all', line: i + 1 };
      state = 'old';
    } else if (raw.trim() !== '') {
      die(`✗ บรรทัด ${i + 1}: มีข้อความนอกบล็อก @@...@@end — "${raw.trim().slice(0, 60)}"`);
    }
  } else if (marker === '@@=' && state === 'old') {
    state = 'new';
  } else if (marker === '@@end' && state === 'new') {
    edits.push({ old: cur.old.join('\n'), new: cur.new.join('\n'), all: cur.all, line: cur.line });
    cur = null; state = 'out';
  } else if (marker === '@@' || marker === '@@all' || marker === '@@end' || marker === '@@=') {
    die(`✗ บรรทัด ${i + 1}: marker "${marker}" ผิดลำดับ (ลำดับที่ถูก: @@ → เดิม → @@= → ใหม่ → @@end)`);
  } else {
    cur[state === 'old' ? 'old' : 'new'].push(raw);
  }
}
if (state !== 'out') die(`✗ บล็อกที่เริ่มบรรทัด ${cur.line} ไม่ปิดด้วย @@end`);
if (!edits.length) die('✗ ไม่มีบล็อกแก้ไขใน stdin (ต้องมี @@ ... @@= ... @@end อย่างน้อย 1 ชุด)');

// ---- near-match hint: หา window ในไฟล์ที่คล้ายข้อความเดิมสุด แล้วพิมพ์บรรทัดจริงให้ copy ----
function bigrams(s) {
  const t = s.replace(/\s+/g, ' ').trim();
  const m = new Map();
  for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); }
  return m;
}
// containment: สัดส่วน bigram ของ "เดิม" ที่พบใน window — ทนกรณี "เดิม" เป็นเศษของบรรทัดยาว
function containment(target, win) {
  let inter = 0, na = 0;
  for (const v of target.values()) na += v;
  if (!na) return 0;
  for (const [k, v] of target) { const w = win.get(k); if (w) inter += Math.min(v, w); }
  return inter / na;
}
function nearMatch(hay, old) {
  const fileLines = hay.split('\n');
  if (fileLines.length > 20000) return null;
  const oldLines = old.split('\n');
  const win = Math.min(oldLines.length, 8);
  const target = bigrams(old);
  let best = { score: 0, at: -1 };
  for (let i = 0; i <= fileLines.length - win; i++) {
    const s = containment(target, bigrams(fileLines.slice(i, i + win).join('\n')));
    if (s > best.score) { best.score = s; best.at = i; }
  }
  if (best.score < 0.6 || best.at < 0) return null;
  const upto = Math.min(best.at + Math.min(oldLines.length, 12), fileLines.length);
  return { from: best.at + 1, to: upto, pct: Math.round(best.score * 100),
           text: fileLines.slice(best.at, upto).join('\n') };
}

// ---- validate + apply in-memory (all-or-nothing) ----
let text = fs.readFileSync(file, 'utf8');
let work = text;
const fails = [];
let hints = 0;
const preview = (s) => JSON.stringify(s.length > 70 ? s.slice(0, 70) + '…' : s);
edits.forEach((e, k) => {
  const tag = `edit #${k + 1} (stdin บรรทัด ${e.line})`;
  if (e.old === '') { fails.push(`✗ ${tag}: ข้อความเดิมว่าง`); return; }
  if (e.old === e.new) { fails.push(`✗ ${tag}: เดิม = ใหม่ ${preview(e.old)}`); return; }
  const n = work.split(e.old).length - 1;
  if (n === 0) {
    let msg = `✗ ${tag}: หาไม่เจอ ${preview(e.old)}`;
    const nm = hints < 5 ? nearMatch(work, e.old) : null; // hint สูงสุด 5 จุด กัน stderr บวม
    if (nm) {
      hints++;
      msg += `\n  ↳ ใกล้เคียงสุด: ไฟล์บรรทัด ${nm.from}-${nm.to} (คล้าย ${nm.pct}%) — copy บรรทัดจริงระหว่างเส้นไปเป็น "เดิม" แล้วรันใหม่ทั้งชุด:\n`
           + `  ─────\n${nm.text}\n  ─────`;
    }
    fails.push(msg); return;
  }
  if (!e.all && n > 1) { fails.push(`✗ ${tag}: เจอ ${n} ที่ — เพิ่ม context ให้ unique หรือใช้ @@all ${preview(e.old)}`); return; }
  work = work.split(e.old).join(e.new);
});

if (fails.length) {
  console.error(fails.join('\n'));
  die(`✗ ${fails.length}/${edits.length} จุดพัง — ไม่ได้เขียนไฟล์ แก้ block แล้วรันใหม่ทั้งชุด`);
}
fs.writeFileSync(file, work);
console.log(`OK: applied ${edits.length} edits to ${file}`);
