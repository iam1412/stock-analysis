#!/usr/bin/env node
'use strict';
/**
 * guard-reports.js — PreToolUse hook: ห้ามเขียน reports/* ตรง (spec §6.2 ชั้น 1 · Plan 2b)
 *   ใบ v3 เขียนผ่าน `node tools/report.js save <SYM>` (io.js เซ็น _sig) · ใบ v2 ผ่าน `node tools/apply-edits.js`
 *   (ทั้งคู่เป็น child process ของ node — hook มองไม่เห็นโดยออกแบบ)
 * อินพุต = JSON ของ PreToolUse ทาง stdin · ปฏิเสธ = พิมพ์ JSON permissionDecision "deny" · อนุญาต = ไม่พิมพ์อะไร
 * ★ exit 0 เสมอ + fail-open: hook พัง/อินพุตเสีย = ปล่อยผ่าน (ไม่บล็อกทั้ง session เพราะบั๊กของ hook) — ตัวบังคับจริงคือ _sig/E50 ที่ gate
 * "ใต้ reports/" (R10) = path ที่มี segment ชื่อ reports ซึ่งโฟลเดอร์แม่มี build.js (checkout/worktree ไหนของ repo นี้ก็ได้)
 *   path ที่ยังมี $VAR ไม่ขยาย + มี reports/ = ปฏิเสธ (มองไม่เห็นปลายทางจริง)
 * ช่องโหว่ที่รู้ (ยอมรับ — _sig/E50 จับ): xargs · find -exec · สคริปต์ไฟล์ที่เขียนเอง · ข้อความใน "$(…)" ในเครื่องหมายคำพูดคู่ · heredoc ซ้อนใน bash -c
 *   · `cd reports` ภายในคำสั่งเดียว (`cd reports && cat > X.html`) ไม่ถูกติดตาม = ปล่อยผ่าน (cwd ที่ค้างอยู่ใน reports/ จาก call ก่อน ถูกจับแล้ว)
 * ติดตั้ง: docs/hook-setup.md (เจ้าของ paste เอง — ไม่แก้ .claude/settings.json จาก session)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const REASON = 'reports/* เขียนตรงไม่ได้ — แก้ .work/<SYM>.json แล้ว node tools/report.js save <SYM> (ใบ v2: node tools/apply-edits.js)';
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const REDIR_FILE = /^(?:&>>?|\d*>>?|\d*>\||>&|\d*<>)$/;          // redirect ที่มีปลายทางเป็นไฟล์ (ไม่ใช่ 2>&1)
const WRAPPERS = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nice', 'nohup', 'builtin', 'timeout']);
const WRAP_OPTARG = { sudo: ['-u', '-g'], env: ['-u'], nice: ['-n'], timeout: ['-s', '-k'] };   // option ที่กินค่าตัวถัดไป (ตารางย่อ ไม่ใช่ parser เต็ม)
const KEYWORDS = new Set(['do', 'then', 'else', 'elif', '!', 'if', 'while', 'until']);          // keyword นำหน้าคำสั่งจริง
const WRITE_API = /writeFile|appendFile|createWriteStream|rename|copyFile|cpSync|\bopen\s*\([^)]*['"][wax+]|write_text|write_bytes|shutil\.|File\.write/;

/** path อยู่ใต้โฟลเดอร์ reports/ ของ checkout นี้ (หรือ worktree ใดก็ได้ของ repo) */
function inReports(p, cwd) {
  if (typeof p !== 'string' || !p) return false;
  if (p.includes('$')) return /(^|\/)reports(\/|$)/.test(p);
  const abs = path.resolve(cwd, p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);
  const segs = abs.split(path.sep);
  for (let i = 1; i < segs.length; i++)
    if (segs[i] === 'reports' && fs.existsSync(path.join(segs.slice(0, i).join(path.sep) || path.sep, 'build.js'))) return true;
  return false;
}

/** ตัดเนื้อ heredoc ทิ้ง (HTML ใน apply-edits <<'EOF' มี > และ reports/ ได้ตามปกติ) — คงบรรทัดที่มี << ไว้ */
function stripHeredocs(src) {
  const out = [], pending = [];
  for (const line of src.split('\n')) {
    if (pending.length) { const d = pending[0]; if ((d.dash ? line.replace(/^\t+/, '') : line) === d.word) pending.shift(); continue; }
    out.push(line);
    const re = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/g;
    let m;
    while ((m = re.exec(line))) pending.push({ dash: m[1] === '-', word: m[3] });
  }
  return out.join('\n');
}

/** lexer แบบ shell ย่อ: {t:'w'} คำ (ถอด quote/escape แล้ว) · {t:'op'} redirect · {t:'sep'} ตัวคั่นคำสั่ง ; && || | & ( ) ขึ้นบรรทัด */
function lex(src) {
  const out = [];
  let w = null, i = 0;
  const flush = () => { if (w !== null) { out.push({ t: 'w', v: w }); w = null; } };
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'") { const j = src.indexOf("'", i + 1), end = j < 0 ? src.length : j; w = (w || '') + src.slice(i + 1, end); i = end + 1; continue; }
    if (ch === '"') {
      let s = ''; i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length && '"\\$`\n'.includes(src[i + 1])) { s += src[i + 1]; i += 2; } else s += src[i++];
      }
      i++; w = (w || '') + s; continue;
    }
    if (ch === '\\') { if (src[i + 1] !== '\n') w = (w || '') + (src[i + 1] || ''); i += 2; continue; }
    if (ch === ' ' || ch === '\t') { flush(); i++; continue; }
    if (ch === '>' || ch === '<' || (ch === '&' && src[i + 1] === '>')) {
      let op = '';
      if (w !== null && /^\d+$/.test(w)) { op = w; w = null; } else flush();
      const m = /^(?:&>>?|<<<|<<-?|<>|<&|>>|>\||>&|>|<)/.exec(src.slice(i));
      op += m[0]; i += m[0].length;
      if (/[<>]&$/.test(op)) { const d = /^(?:\d+|-)/.exec(src.slice(i)); if (d) { op += d[0]; i += d[0].length; } }
      out.push({ t: 'op', v: op });
      continue;
    }
    if (';|&\n()'.includes(ch)) {
      flush();
      const two = src.slice(i, i + 2), op = ['&&', '||', ';;'].includes(two) ? two : ch;
      out.push({ t: 'sep', v: op }); i += op.length; continue;
    }
    if (ch === '#' && w === null) { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }   // คอมเมนต์
    w = (w || '') + ch; i++;
  }
  flush();
  return out;
}

/** คำสั่งเดี่ยวหนึ่งท่อน → เหตุผลที่ปฏิเสธ | null */
function segment(seg, cwd, depth) {
  const words = [];
  for (let i = 0; i < seg.length; i++) {
    const t = seg[i];
    if (t.t !== 'op') { words.push(t.v); continue; }
    const next = seg[i + 1] && seg[i + 1].t === 'w' ? seg[i + 1].v : null;
    if (REDIR_FILE.test(t.v) && next != null && inReports(next, cwd)) return `redirect ${t.v} ${next}`;
    if (next != null && !/&[\d-]+$/.test(t.v)) i++;   // ปลายทาง redirect / ตัวปิด heredoc ไม่ใช่ argument
  }
  let k = 0;
  const skipAssign = () => { while (k < words.length && /^[A-Za-z_]\w*=/.test(words[k])) k++; };
  skipAssign();
  for (;;) {
    if (words[k] === 'rtk') { k++; if (words[k] === 'proxy') k++; continue; }   // hook rtk-rewrite ของผู้ใช้ห่อคำสั่งด้วย rtk
    if (KEYWORDS.has(words[k])) { k++; skipAssign(); continue; }
    if (WRAPPERS.has(words[k])) {
      const w = words[k++], optArg = WRAP_OPTARG[w] || [];
      while (k < words.length && words[k].startsWith('-')) k += optArg.includes(words[k]) ? 2 : 1;
      if (w === 'timeout' && k < words.length && /^\d/.test(words[k])) k++;   // timeout <DURATION> cmd
      skipAssign(); continue;
    }
    break;
  }
  const argv = words.slice(k);
  if (!argv.length) return null;
  const name = path.basename(argv[0]), args = argv.slice(1);
  const files = args.filter((a) => !a.startsWith('-'));
  const hit = (list) => list.find((a) => inReports(a, cwd));
  switch (name) {
    case 'git': case 'rm': case 'rmdir': return null;   // git mv/add/checkout · rm = ผ่าน (spec §6.2)
    case 'tee': { const f = hit(files); return f ? `tee ${f}` : null; }
    case 'sed': case 'gsed': case 'perl': {
      if (!args.some((a) => /^-[A-Za-z]*i/.test(a) || a.startsWith('--in-place'))) return null;
      const f = hit(files); return f ? `${name} -i ${f}` : null;
    }
    case 'cp': case 'mv': case 'install': case 'rsync': case 'ln': {
      const eq = args.find((a) => a.startsWith('--target-directory='));
      const ti = args.findIndex((a) => a === '-t' || a === '--target-directory');
      const dest = eq ? eq.slice(eq.indexOf('=') + 1) : ti >= 0 ? args[ti + 1] : files.length >= 2 ? files[files.length - 1] : null;
      return dest && inReports(dest, cwd) ? `${name} → ${dest}` : null;
    }
    case 'dd': { const of = args.find((a) => a.startsWith('of=')); return of && inReports(of.slice(3), cwd) ? `dd ${of}` : null; }
    case 'node': case 'python': case 'python3': case 'ruby': {
      if (!args.some((a) => /^(?:-[ecp]|--eval|--print)$/.test(a))) return null;   // node tools/x.js = child process → ผ่าน
      const text = args.join(' ');
      return WRITE_API.test(text) && /\breports\//.test(text) ? `${name} inline script เขียน reports/` : null;
    }
    case 'bash': case 'sh': case 'zsh': {
      const ci = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
      return ci >= 0 && depth < 3 ? analyze(args[ci + 1], cwd, depth + 1) : null;
    }
    default: return null;
  }
}

/** คำสั่ง Bash ทั้งบรรทัด → เหตุผลที่ปฏิเสธ | null */
function analyze(cmd, cwd, depth) {
  if (typeof cmd !== 'string') return null;
  if (!cmd.includes('reports') && !inReports('x', cwd)) return null;   // ทางด่วน: ไม่พูดถึง reports และ cwd ไม่ได้อยู่ใน reports/ (cd ค้างข้าม call)
  const segs = [[]];
  for (const t of lex(stripHeredocs(cmd))) { if (t.t === 'sep') segs.push([]); else segs[segs.length - 1].push(t); }
  for (const s of segs) { const r = segment(s, cwd, depth || 0); if (r) return r; }
  return null;
}

/** อินพุต PreToolUse → { why } (ปฏิเสธ) | null (ผ่าน) */
function decide(input) {
  if (!input || typeof input !== 'object') return null;
  const ti = input.tool_input || {};
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (FILE_TOOLS.has(input.tool_name)) { const p = ti.file_path || ti.notebook_path; return inReports(p, cwd) ? { why: `${input.tool_name} ${p}` } : null; }
  if (input.tool_name === 'Bash') { const why = analyze(ti.command, cwd, 0); return why ? { why } : null; }
  return null;
}

function denyJson(why) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${REASON} · ${why}` } });
}

function main() {
  let d = null;
  try { d = decide(JSON.parse(fs.readFileSync(0, 'utf8'))); } catch (_) { return; }   // fail-open
  if (d) process.stdout.write(denyJson(d.why) + '\n');
}

module.exports = { decide, analyze, lex, inReports, stripHeredocs, denyJson, REASON };
if (require.main === module) { try { main(); } catch (_) { /* fail-open */ } process.exitCode = 0; }
