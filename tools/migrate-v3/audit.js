'use strict';
/**
 * audit.js — display audit ของใบที่ย้าย v2 → v3 แล้ว (Plan 4c-audit · เจ้าของ 26 ก.ย. 69: "ข้อมูลที่แสดงของทุกใบต้องถูก")
 *   ต่อใบ v3 ใน reports/ ที่มี meta.migratedFrom:
 *     v2 = reports/<SYM>.html ใน commit สุดท้ายที่ยังมีไฟล์ (commit ที่ลบ^ · ไม่มี commit ลบ = HEAD ถ้ายังมี — ลบค้างใน working tree)
 *     render ทั้งสองหน้าแบบที่เว็บทำ (v2: build.expandReport · v3: compute → render.toV2Source → build.expandReport)
 *     เทียบด้วย EQ.compare เดียวกับ migrator — ★ หน้า v3 render ด้วย market ของหน้า v2 (ราคาใบ v3 อาจใหม่กว่า snapshot v2
 *       ⇒ ค่าที่ผูกราคาต้องเทียบที่ราคาเดียวกัน) · sanity ตรวจบนหน้า v3 ที่เว็บแสดงจริง (market ปัจจุบันของใบ)
 *   valueDiffs = EQ numberValue ที่ไม่ใช่ "ย้ายที่ในโซนเดียวกัน" และเกิน 1 หน่วยที่ v2 พิมพ์ (ค่าที่แสดงต่างจริง — ต้องเป็น 0)
 *   roundingDiffs = numberRounding + numberValue ที่ ≤ 1 หน่วยของหลักสุดท้ายที่ v2 พิมพ์ (drift ที่เจ้าของยอมรับ · แสดงรายการ)
 *   textLost = คำของผู้เขียนที่หาย · sanity = ไม่มี {{…}} · ไม่มี undefined/NaN/null/TODO · ครบ 8 หมวด · ราคา/วันที่ราคา = market
 * อ่านอย่างเดียว: ไม่เขียน reports/ · git ผ่าน env ที่ล้าง GIT_DIR/GIT_WORK_TREE/… (ใต้ hook ก็ชี้ repo ของ reports-dir)
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const B = require('../../build.js');
const R = require('../../_template/v3/render.js');
const C = require('../v3/compute.js');
const RV = require('../report-values.js');
const RS = require('../report-source.js');
const PV = require('./parse-v2.js');
const A = require('./assemble.js');
const EQ = require('./equiv.js');
const RM = require('../report-meta.js');

const GIT_SCRUB = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY'];
const gitEnv = () => { const e = { ...process.env }; for (const k of GIT_SCRUB) delete e[k]; return e; };
const realpath = (p) => { try { return fs.realpathSync.native(p); } catch (e) { return path.resolve(p); } };
function git(cwd, args) {
  return cp.execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, env: gitEnv(), maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

/** หน้า v2 สุดท้ายของ <SYM> จาก git → { raw, ref } · ไม่พบ = throw */
function v2Source(sym, reportsDir) {
  const dir = realpath(reportsDir);
  const top = realpath(git(dir, ['rev-parse', '--show-toplevel']).trim());
  const rel = path.relative(top, path.join(dir, sym + '.html')).split(path.sep).join('/');
  const del = git(top, ['log', '-1', '--format=%H', '--diff-filter=D', '--', rel]).trim();
  const tryShow = (ref) => { try { return git(top, ['show', `${ref}:${rel}`]); } catch (e) { return null; } };
  if (del) {
    const raw = tryShow(`${del}^`);
    if (raw != null) return { raw, ref: `${del.slice(0, 9)}^` };
  }
  const head = tryShow('HEAD');   // ลบใน working tree แต่ยังไม่ commit
  if (head != null) return { raw: head, ref: 'HEAD' };
  throw new Error(`ไม่พบ ${rel} ใน git (ไม่มี commit ที่ลบ และ HEAD ไม่มีไฟล์)`);
}

/** market ของหน้า v2 (ท่อเดียวกับ migrator: parse → assemble) · assemble ล้ม = ถอยไปอ่าน report-data ตรง ๆ */
function v2Market(sym, raw, doc, seeds) {
  const parsed = PV.parseV2(sym, raw);
  try {
    const r = A.assemble(parsed, { seeds, headUpdated: null, v2Hash: B.freshHash(raw), today: parsed.rd.values.priceDate, analysisPx: null });
    if (r.doc && r.doc.market) return r.doc.market;
  } catch (e) { /* ใบ HUMAN — assemble ไม่ครบ ⇒ ใช้ค่าจาก report-data */ }
  const v = parsed.rd.values, ch = parsed.rd.chart || {};
  const chart = { data: ch.data };
  if (ch.gridFmt != null) chart.gridFmt = ch.gridFmt;
  if (ch.dataFmt != null) chart.dataFmt = ch.dataFmt;
  const mk = { px: v.px, priceDate: v.priceDate, chgSuffix: v.chgSuffix, chart };
  if (doc.market && doc.market.range52w) mk.range52w = doc.market.range52w;
  return mk;
}

const visible = (html) => String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
const textOf = (html) => visible(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** sanity บนหน้า v3 ที่เว็บแสดงจริง → [ข้อความที่ตก] */
function sanityOf(page, doc, view) {
  const bad = [];
  const vis = visible(page);
  const toks = vis.match(/\{\{[^}]*\}\}/g);
  if (toks) bad.push(`token ค้าง ${toks.length}: ${[...new Set(toks)].slice(0, 5).join(' ')}`);
  const words = textOf(page).match(/\b(?:undefined|NaN|null|TODO)\b/g);
  if (words) bad.push(`ข้อความเสีย: ${[...new Set(words)].join(' ')}`);
  const miss = [1, 2, 3, 4, 5, 6, 7, 8].filter((k) => !page.includes(`<div class="n">${k}</div>`));
  if (miss.length) bad.push(`หมวดหาย: ${miss.join(',')}`);
  const mk = doc.market || {};
  const rd = B.parseJsonScript(page, 'report-data'), sm = B.parseJsonScript(page, 'stock-meta');
  const v = rd && rd.values;
  if (!v || v.px !== mk.px) bad.push(`report-data.values.px ${v ? v.px : '∅'} ≠ market.px ${mk.px}`);
  if (!v || v.priceDate !== mk.priceDate) bad.push(`report-data.values.priceDate ${v ? v.priceDate : '∅'} ≠ market.priceDate ${mk.priceDate}`);
  if (!sm || sm.price !== mk.px) bad.push(`stock-meta.price ${sm ? sm.price : '∅'} ≠ market.px ${mk.px}`);
  const hp = RM.readHeaderPrice(page);   // regex .px มีเจ้าของเดียว (tools/report-meta.js · parser-lint)
  if (!isNum(mk.px) || !hp || hp.raw !== RV.fmtPrice(mk.px)) bad.push(`ราคาหัวหน้า "${hp ? hp.currency + hp.raw : '∅'}" ≠ market.px ${mk.px}`);
  const pdText = view && view.d && view.d.priceDate && view.d.priceDate.text;
  const meta = (/<div class="px-meta">([\s\S]*?)<\/div>/.exec(page) || [])[1] || '';
  if (!pdText || textOf(meta).indexOf(pdText) < 0) bad.push(`วันที่ราคาในหัว ≠ market.priceDate ${mk.priceDate} (${pdText || '∅'})`);
  return bad;
}

/**
 * หน่วยที่ผู้เขียน v2 เขียนไว้เองใน report-data (literal ดิบ — ทศนิยมที่เขียน = ความละเอียด · ตัวตัดสินเดียวกับ adopt/transcribe)
 *   หน้า v2 พิมพ์ค่าพวกนี้ผ่าน fmtPrice ("384" → "฿384.00") ⇒ ".00" เป็นของ template ไม่ใช่ของผู้เขียน · 1 step = หน่วยของ literal
 *   + ค่าที่ template derive จาก FV ตรง ๆ (จุดซื้อ MOS 20%/30% = FV × 0.8/0.7 → step × 0.8/0.7)
 */
function authorSteps(raw) {
  const blk = (RM.REPORT_DATA_RE.exec(String(raw)) || [])[1] || '';
  const out = [];
  for (const m of blk.matchAll(/"(\w+)"\s*:\s*(-?[0-9]+(?:\.([0-9]+))?)(?![0-9.eE])/g)) {
    const v = parseFloat(m[2]), step = Math.pow(10, -(m[3] ? m[3].length : 0));
    out.push({ key: m[1], v, step });
    if (m[1] === 'fv') out.push({ key: 'mos20', v: v * 0.8, step: step * 0.8 }, { key: 'mos30', v: v * 0.7, step: step * 0.7 });
  }
  return out;
}

/**
 * แยก EQ numberValue (diff ทีละรัน) ให้ตรงกับคำถาม "ค่าที่แสดงต่างจริงไหม":
 *   moved — รันที่ลบตัวเลขแต่ไม่ใส่ตัวเลขแทน และทุกตัวยังอยู่ในโซนเดียวกันของหน้า v3 (ลำดับข้อความเปลี่ยน — ABBNY กรอบ 52 สัปดาห์ใน px-meta)
 *   step  — ทุกคู่ตัวเลขห่าง ≤ 1 หน่วยของหลักสุดท้ายที่ v2 พิมพ์ หรือที่ผู้เขียนเขียนใน report-data (authorSteps)
 *           (กติกาเจ้าของ 26 ก.ย. 69 = drift ที่ยอมรับ · นับรวม roundingDiffs)
 *   value — ที่เหลือ = ค่าที่แสดงต่างจริง (ต้องเป็น 0)
 */
function splitValues(runs, v3Html, steps) {
  const authorStep = (p) => { let best = 0; for (const a of steps || []) if (Math.abs(a.v - p.v) <= p.half * (1 + 1e-9) && a.step > best) best = a.step; return best; };
  const z3 = EQ.zones(v3Html), bag = new Map();
  const numsIn = (zone) => { if (!bag.has(zone)) bag.set(zone, EQ.numsOf(EQ.text(z3.get(zone) || ''))); return bag.get(zone); };
  const out = { value: [], step: [], moved: [] };
  for (const r of runs) {
    const x = EQ.numsOf(r.del), y = EQ.numsOf(r.ins);
    if (x.length && !y.length) {
      const pool = numsIn(r.zone).slice();
      const found = x.every((p) => { const i = pool.findIndex((q) => Math.abs(q.v - p.v) <= Math.max(p.half, q.half) * (1 + 1e-9)); if (i < 0) return false; pool.splice(i, 1); return true; });
      if (found) { out.moved.push(r); continue; }
    }
    if (x.length && x.length === y.length && x.every((p, i) => Math.abs(y[i].v - p.v) <= Math.max(2 * p.half, authorStep(p)) * (1 + 1e-9))) { out.step.push(r); continue; }
    out.value.push(r);
  }
  return out;
}

/** เหตุผลสั้นต่อใบ (ตาราง md): ค่า report-data/stock-meta ที่ต่างเกิน 1 หน่วยที่ผู้เขียนเขียน + โซนของ value diff ที่เหลือ */
const KEY_LABEL = [[/^fv$/, 'FV'], [/^values\.fvLow$/, 'FV low'], [/^values\.fvHigh$/, 'FV high'], [/^values\.scenarios\[(\d)\]\.tgt$/, (m) => `${['Bear', 'Base', 'Bull'][+m[1]]} target`],
  [/^values\.scenarios\[(\d)\]\.div$/, (m) => `${['Bear', 'Base', 'Bull'][+m[1]]} dividends`], [/^values\.(eps|dps|bvps|analystTgt|baseEps)$/, (m) => m[1]], [/^sm\.pe$/, 'stock-meta P/E']];
function reasonsOf(rd, values, steps) {
  const out = [];
  for (const r of rd || []) {
    const hit = KEY_LABEL.find(([re]) => re.test(r.path));
    if (!hit) continue;
    const m = hit[0].exec(r.path), label = typeof hit[1] === 'function' ? hit[1](m) : hit[1];
    if (isNum(r.v2) && isNum(r.v3)) {
      const st = (steps || []).filter((a) => Math.abs(a.v - r.v2) < 1e-9).reduce((x, a) => Math.max(x, a.step), 0.01);
      if (!/^sm\./.test(r.path) && Math.abs(r.v3 - r.v2) <= st * (1 + 1e-9)) continue;
      out.push(`${label} ${r.v2} → ${+r.v3.toFixed(4)}`);
    } else out.push(`${label} ${r.v2} → ${r.v3}`);
  }
  const zones = [...new Set((values || []).map((x) => x.zone))];
  if (zones.length) out.push(`value runs in ${zones.join(',')}`);
  return out;
}

/** ใบเดียว → แถวผล · ไม่ throw */
function auditOne(sym, o) {
  const row = { symbol: sym, status: 'OK', valueDiffs: 0, roundingDiffs: 0, textLost: 0, sanity: [], values: [], step: [], moved: [], rounding: [], lost: [], rd: [], added: 0, ref: null, error: null };
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(o.reportsDir, sym + '.json'), 'utf8'));
    if (!(doc.meta && doc.meta.migratedFrom)) { row.status = 'SKIP'; row.error = 'ไม่มี meta.migratedFrom (ใบ v3 ต้นฉบับ ไม่ใช่ใบ migrate)'; return row; }
    // sanity — หน้าที่เว็บแสดงจริง (market ปัจจุบันของใบ)
    const view = C.compute(doc, { seeds: o.seeds });
    const page = B.expandReport(R.toV2Source(doc, view));
    row.sanity = sanityOf(page, doc, view);
    // เทียบ — v2 สุดท้ายใน git กับ v3 ที่ market ของหน้า v2 (apples to apples)
    const src = v2Source(sym, o.reportsDir);
    row.ref = src.ref;
    const at = { ...doc, market: v2Market(sym, src.raw, doc, o.seeds) };
    const viewAt = C.compute(at, { seeds: o.seeds });
    const v3At = B.expandReport(R.toV2Source(at, viewAt));
    const eq = EQ.compare(B.expandReport(src.raw), v3At, at, viewAt, { v2src: src.raw });
    const steps = authorSteps(src.raw);
    const k = splitValues(eq.numberValue, v3At, steps);
    row.reasons = reasonsOf(eq.rd, k.value, steps);
    row.values = k.value; row.step = k.step; row.moved = k.moved; row.rounding = eq.numberRounding;
    row.lost = eq.textLostAt || eq.textLost.map((w) => ({ zone: '?', w }));
    row.rd = eq.rd; row.added = eq.numberAdded.length;
    row.valueDiffs = k.value.length; row.roundingDiffs = eq.numberRounding.length + k.step.length; row.textLost = eq.textLost.length;
  } catch (e) {
    row.error = String(e && e.message || e).split('\n')[0];
    row.sanity.push(`audit error: ${row.error}`);
  }
  if (row.status !== 'SKIP') {
    const f = [];
    if (row.valueDiffs > 0) f.push('VALUE-DIFF');
    if (row.sanity.length) f.push('SANITY');
    row.status = f.length ? f.join('+') : 'OK';
  }
  return row;
}

const csvCell = (s) => { const t = String(s == null ? '' : s); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function toCsv(rows) {
  const L = ['symbol,status,valueDiffs,roundingDiffs,textLost,sanity'];
  for (const r of rows) L.push([r.symbol, r.status, r.valueDiffs, r.roundingDiffs, r.textLost, r.sanity.join(' | ')].map(csvCell).join(','));
  return L.join('\n') + '\n';
}
const mdCell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
function toMd(rows, meta) {
  const n = (f) => rows.filter(f).length;
  const audited = rows.filter((r) => r.status !== 'SKIP');
  const L = [`# v3 display audit — ${meta.date}`, '', `- code: \`${meta.head}\` · reports: \`${meta.reportsRel}\``,
    '- v2 = `reports/<SYM>.html` at the last commit that had it · v3 rendered as the site does · comparison at the v2 page\'s `market` (price-bound figures at the v2 snapshot price) · sanity on the v3 page as served (current `market`)', '',
    '| | count |', '|---|---|',
    `| audited | ${audited.length} |`, `| OK | ${n((r) => r.status === 'OK')} |`,
    `| value diff (valueDiffs > 0) | ${n((r) => r.valueDiffs > 0)} |`, `| sanity failure | ${n((r) => r.sanity.length > 0)} |`,
    `| rounding drift only (OK with roundingDiffs > 0) | ${n((r) => r.status === 'OK' && r.roundingDiffs > 0)} |`,
    `| text lost (textLost > 0) | ${n((r) => r.textLost > 0)} |`, `| skipped (not migrated) | ${n((r) => r.status === 'SKIP')} |`, ''];
  const bad = audited.filter((r) => r.status !== 'OK');
  L.push('## Failing reports', '');
  if (!bad.length) L.push('- none');
  else {
    L.push('| symbol | status | valueDiffs | why (report-data beyond one author step · zones) | sanity | first value diffs |', '|---|---|---|---|---|---|');
    for (const r of bad) L.push(`| ${r.symbol} | ${r.status} | ${r.valueDiffs} | ${mdCell((r.reasons || []).join(' · '))} | ${mdCell(r.sanity.join(' · '))} | ${mdCell(r.values.slice(0, 2).map((x) => `${x.zone}: ${x.del} → ${x.ins}`).join(' · '))} |`);
  }
  L.push('', '## Per report details (non-OK · text lost · rounding drift)', '');
  for (const r of audited.filter((x) => x.status !== 'OK' || x.textLost || x.roundingDiffs || x.moved.length)) {
    L.push(`### ${r.symbol} — ${r.status} (v2 @ ${r.ref || '?'})`, '');
    for (const s of r.sanity) L.push(`- sanity: ${mdCell(s)}`);
    for (const x of r.values) L.push(`- value ${x.zone}: \`${mdCell(x.del)}\` → \`${mdCell(x.ins)}\``);
    if (r.textLost) L.push(`- text lost ×${r.textLost}: ${mdCell(r.lost.map((x) => `${x.w}@${x.zone}`).join(' '))}`);
    if (r.rounding.length) L.push(`- rounding ×${r.rounding.length}: ${mdCell(r.rounding.slice(0, 12).map((x) => `${x.del} → ${x.ins}`).join(' · '))}${r.rounding.length > 12 ? ' …' : ''}`);
    if (r.step.length) L.push(`- one printed step (accepted drift) ×${r.step.length}: ${mdCell(r.step.slice(0, 12).map((x) => `${x.zone}: ${x.del} → ${x.ins}`).join(' · '))}${r.step.length > 12 ? ' …' : ''}`);
    if (r.moved.length) L.push(`- moved within the zone (info) ×${r.moved.length}: ${mdCell(r.moved.map((x) => `${x.zone}: ${x.del}`).join(' · '))}`);
    const rdv = r.rd.filter((x) => !/^gauge\.(min|max)$/.test(x.path));
    if (rdv.length) L.push(`- report-data/stock-meta (info): ${mdCell(rdv.map((x) => `${x.path} ${x.v2} → ${x.v3}`).join(' · '))}`);
    L.push('');
  }
  const skip = rows.filter((r) => r.status === 'SKIP');
  if (skip.length) L.push('## Skipped', '', ...skip.map((r) => `- ${r.symbol}: ${r.error}`), '');
  return L.join('\n');
}

/** audit — syms ว่าง + all = ทุกใบ v3 · คืน { rows, code, files } · code 1 = มีใบ valueDiffs > 0 หรือ sanity ตก */
function runAudit(syms, o, log, ctx) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  let list = (syms || []).map((s) => String(s).toUpperCase());
  if (o.all) list = RS.list(o.reportsDir).filter((e) => e.v3).map((e) => e.symbol);
  if (!list.length) { say('✗ audit: ระบุ <SYM>… หรือ --all'); return { rows: [], code: 1 }; }
  const rows = [];
  for (const sym of list) {
    let kind; try { kind = RS.kindOf(sym, o.reportsDir); } catch (e) { kind = null; }
    if (kind !== 'v3') { rows.push({ symbol: sym, status: 'SANITY', valueDiffs: 0, roundingDiffs: 0, textLost: 0, sanity: [`ไม่ใช่ใบ v3 ใน ${o.reportsDir}`], values: [], step: [], moved: [], rounding: [], lost: [], rd: [], added: 0, ref: null, error: 'not v3' }); continue; }
    rows.push(auditOne(sym, o));
  }
  const files = {};
  if (o.outBase) {
    fs.mkdirSync(path.dirname(o.outBase), { recursive: true });
    files.csv = o.outBase + '.csv'; files.md = o.outBase + '.md';
    fs.writeFileSync(files.csv, toCsv(rows));
    fs.writeFileSync(files.md, toMd(rows, { date: ctx.date, head: ctx.head, reportsRel: ctx.reportsRel }));
  }
  const audited = rows.filter((r) => r.status !== 'SKIP');
  const vd = audited.filter((r) => r.valueDiffs > 0), sn = audited.filter((r) => r.sanity.length);
  say(`audit: ${audited.length} ใบ · OK ${audited.filter((r) => r.status === 'OK').length} · value diff ${vd.length} · sanity ${sn.length} · rounding-only ${audited.filter((r) => r.status === 'OK' && r.roundingDiffs > 0).length} · text lost ${audited.filter((r) => r.textLost > 0).length}${rows.length > audited.length ? ` · skip ${rows.length - audited.length}` : ''}`);
  for (const r of audited.filter((x) => x.status !== 'OK')) say(`  ✗ ${r.symbol} ${r.status} · valueDiffs ${r.valueDiffs}${r.sanity.length ? ` · ${r.sanity.join(' · ')}` : ''}${r.values.length ? ` · ${r.values.slice(0, 2).map((x) => `${x.zone}: ${x.del} → ${x.ins}`).join(' · ')}` : ''}`);
  if (files.md) say(`  → ${files.md} · ${files.csv}`);
  return { rows, code: vd.length || sn.length ? 1 : 0, files };
}

module.exports = { runAudit, auditOne, splitValues, authorSteps, v2Source, v2Market, sanityOf, toCsv, toMd, GIT_SCRUB };
