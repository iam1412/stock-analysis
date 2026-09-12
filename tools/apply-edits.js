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
 *
 * ★ ระยะ 2 ส่วน B: โหมด JSON บนบล็อก `report-data`/`stock-meta` (ใช้ร่วมกับบล็อก `@@` ข้างบนได้ในคำสั่งเดียว
 *   — `@@` apply ก่อนเสมอ แล้วค่อยทำ JSON ops ต่อบนผลลัพธ์นั้น ก่อนเขียนไฟล์ครั้งเดียวรวมกัน):
 *   --set <path>=<json>   ตั้งค่าใน report-data ตาม path จุด (`a.b.c` · array index ใช้เลขล้วนเช่น `scenarios.0.tgt`)
 *   --del <path>          ลบคีย์ใน report-data ตาม path
 *   --set-meta <path>=<json>   ตั้งค่าใน stock-meta (path ระดับเดียว เช่น `fairValue`)
 *   ตัวอย่าง:  node tools/apply-edits.js reports/<SYM>.html --set fv=210 --set values.eps=9.57 --del values.analystTgt
 *   <json> parse ด้วย JSON.parse ก่อน (ตัวเลข/boolean/null/สตริงที่ quote แล้วผ่านอยู่แล้ว) — parse ไม่ผ่านค่อยลอง
 *   ตีความเป็น number/true/false/null ตรง ๆ · ไม่ผ่านทั้งคู่ = error ไม่เขียนไฟล์
 *   --set/--del ใช้ได้เฉพาะรายงาน **v2** (`report-data.v === 2` มี `values`) — ไฟล์ v1 ต้อง error "ไฟล์ v1" ทันที
 *   ไม่แตะไฟล์เลย (ใบ v1 แก้เลขผูกราคาด้วยบล็อก `@@` ตามเดิม) · `--set-meta` ใช้ได้ทั้ง v1/v2 (บล็อก stock-meta
 *   ไม่ขึ้นกับ schema v2) · หลังแก้เสร็จ validate ด้วย `RV.validateValues` (เมื่อเป็น v2) ก่อนเขียนไฟล์จริงเสมอ
 *   · ไม่ใส่ stdin เลย (เทอร์มินัลจริง ไม่ใช่ heredoc/pipe) ก็ใช้ `--set`/`--del`/`--set-meta` ได้ตามปกติ
 *   — ตัวสคริปต์เช็ค `process.stdin.isTTY` เอง ไม่ค้างรอ Ctrl-D (ต้องมีบล็อก `@@` อย่างน้อย 1 ชุด **เฉพาะ**
 *   ตอนไม่มี --set/--del/--set-meta เลย)
 */

const fs = require('fs');
const RM = require('./report-meta.js');     // เจ้าของเดียวของ regex stock-meta/report-data
const RV = require('./report-values.js');   // เจ้าของเดียวของ schema v2 (validateValues) + styledRD

function die(msg) { console.error(msg); process.exit(1); }

const file = process.argv[2];
if (!file) die('ใช้: node tools/apply-edits.js <file> [--set path=json] [--del path] [--set-meta path=json] <<\'EOF\' ... EOF (อ่านบล็อก @@ จาก stdin ถ้ามี)');
if (!fs.existsSync(file)) die(`✗ ไม่พบไฟล์ ${file}`);

// ---- parse --set/--del/--set-meta จาก argv (หลังชื่อไฟล์) ----
function parseValue(raw, flagLabel) {
  try { return JSON.parse(raw); } catch (_) { /* ลองทางสำรองข้างล่าง */ }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  die(`✗ ${flagLabel} ค่า ${JSON.stringify(raw)} ไม่ใช่ JSON/number/boolean/null ที่ถูกต้อง`);
}
function parseOps(argv) {
  const ops = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--set' || a === '--set-meta') {
      const raw = argv[++i];
      if (raw === undefined) die(`✗ ${a} ต้องมีค่าตามหลังรูป path=value`);
      const eq = raw.indexOf('=');
      if (eq <= 0) die(`✗ ${a} ${JSON.stringify(raw)} ต้องเป็นรูป path=value`);
      const path = raw.slice(0, eq);
      ops.push({ kind: a === '--set' ? 'set' : 'setMeta', path, value: parseValue(raw.slice(eq + 1), a) });
    } else if (a === '--del') {
      const path = argv[++i];
      if (path === undefined) die('✗ --del ต้องมี path ตามหลัง');
      ops.push({ kind: 'del', path });
    } else {
      die(`✗ argument ไม่รู้จัก: ${JSON.stringify(a)} (รองรับ --set path=json · --del path · --set-meta path=json)`);
    }
  }
  return ops;
}
const ops = parseOps(process.argv.slice(3));
const setOps = ops.filter((o) => o.kind === 'set');
const delOps = ops.filter((o) => o.kind === 'del');
const setMetaOps = ops.filter((o) => o.kind === 'setMeta');

// ---- อ่าน stdin เฉพาะตอนไม่ใช่เทอร์มินัลจริง (กัน readFileSync(0) ค้างรอ Ctrl-D ที่เทอร์มินัลแบบ interactive) ----
// ★ fd 0 ที่เป็น pipe/pty แบบ non-blocking (พบจริงใน harness บางตัวที่รันคำสั่งเดียวไม่มี heredoc/redirect —
//   เคสเดียวกับ one-liner `--set` ที่ SKILL 5B สั่ง) โยน EAGAIN แทนที่จะคืนค่าว่างเฉย ๆ — ตีความเหมือน "ไม่มี stdin"
let stdin = '';
if (!process.stdin.isTTY) {
  try { stdin = fs.readFileSync(0, 'utf8'); }
  catch (e) { if (e.code !== 'EAGAIN') throw e; }
}

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
// บล็อก @@ บังคับอย่างน้อย 1 ชุด **เฉพาะ** ตอนไม่มี --set/--del/--set-meta เลย (มี flag แล้ว stdin ว่างได้ — Ruling A)
if (!edits.length && !ops.length) die('✗ ไม่มีบล็อกแก้ไขใน stdin (ต้องมี @@ ... @@= ... @@end อย่างน้อย 1 ชุด) และไม่มี --set/--del/--set-meta');

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

// ---- validate + apply @@ blocks in-memory (all-or-nothing) ----
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

// ---- ★ ระยะ 2 ส่วน B: JSON ops (--set/--del/--set-meta) — ทำ "หลัง" บล็อก @@ เสมอ บนผลลัพธ์ `work` ----
if (ops.length) {
  const rdM = work.match(RM.REPORT_DATA_PARTS_RE);
  if (!rdM) die('✗ ไม่มีบล็อก report-data');
  let rd;
  try { rd = JSON.parse(rdM[2]); } catch (e) { die(`✗ report-data JSON เสีย: ${e.message}`); }
  const smM = work.match(RM.STOCK_META_PARTS_RE);
  if (!smM) die('✗ ไม่มีบล็อก stock-meta');
  let sm;
  try { sm = JSON.parse(smM[2]); } catch (e) { die(`✗ stock-meta JSON เสีย: ${e.message}`); }

  // v1 safety: --set/--del แก้ได้เฉพาะรายงาน v2 (ห้าม half-write — เช็คก่อนแตะอะไรทั้งนั้น)
  if ((setOps.length || delOps.length) && !RV.isV2(rd))
    die(`✗ ${file} เป็นไฟล์ v1 (ไม่มี report-data.v = 2 / values) — --set/--del ใช้ได้เฉพาะรายงาน v2 เท่านั้น (ไฟล์ v1 แก้เลขผูกราคาด้วยบล็อก @@ ตามเดิม)`);

  // path แบบ a.b.c — segment ที่เป็นตัวเลขล้วนตีความเป็น array index (เช่น scenarios.0.tgt)
  const keyOf = (seg) => (/^\d+$/.test(seg) ? Number(seg) : seg);
  function parentOf(root, path) {
    const segs = String(path).split('.');
    let curNode = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = keyOf(segs[i]);
      if (curNode == null || typeof curNode !== 'object' || !(k in curNode)) return null;
      curNode = curNode[k];
    }
    if (curNode == null || typeof curNode !== 'object') return null;
    return { parent: curNode, key: keyOf(segs[segs.length - 1]) };
  }

  for (const op of setOps) {
    const nav = parentOf(rd, op.path);
    if (!nav) die(`✗ --set ${op.path} ไม่พบ path (ส่วนแม่ไม่มีอยู่จริงใน report-data)`);
    nav.parent[nav.key] = op.value;
  }
  for (const op of delOps) {
    const nav = parentOf(rd, op.path);
    if (!nav) die(`✗ --del ${op.path} ไม่พบ path (ส่วนแม่ไม่มีอยู่จริงใน report-data)`);
    delete nav.parent[nav.key];
  }
  for (const op of setMetaOps) {
    const nav = parentOf(sm, op.path);
    if (!nav) die(`✗ --set-meta ${op.path} ไม่พบ path (ส่วนแม่ไม่มีอยู่จริงใน stock-meta)`);
    nav.parent[nav.key] = op.value;
  }

  // validate เฉพาะไฟล์ v2 — ต้องผ่านก่อนเขียนเสมอ (fv:0/priceDate เพี้ยน/คีย์แปลกใน values ฯลฯ ต้องจับที่นี่ ไม่ใช่ตอน build)
  if (RV.isV2(rd)) {
    try { RV.validateValues(rd, sm); }
    catch (e) { die(`✗ validate ไม่ผ่านหลังแก้ (ไม่ได้เขียนไฟล์): ${e.message}`); }
  }

  if (setOps.length || delOps.length) work = work.replace(RM.REPORT_DATA_PARTS_RE, (m, a, body, z) => a + '\n' + RV.styledRD(rd) + '\n' + z);
  if (setMetaOps.length) work = work.replace(RM.STOCK_META_PARTS_RE, (m, a, b, z) => a + '\n' + JSON.stringify(sm) + '\n' + z);
}

fs.writeFileSync(file, work);
console.log(`OK: applied ${edits.length} @@ edits${ops.length ? ` + ${ops.length} JSON ops (--set/--del/--set-meta)` : ''} to ${file}`);
