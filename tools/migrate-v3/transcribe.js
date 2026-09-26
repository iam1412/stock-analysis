'use strict';
/**
 * transcribe.js — Plan 4c-transcribe: ใบ HUMAN ย้าย v2 → v3 ด้วยการ "ถอดความ" แบบ ZTS pilot (เจ้าของ 26 ก.ย. 69:
 *   "ทำเหมือน ZTS … ห้ามวิเคราะห์ใหม่ งานคือย้ายจาก V2 => V3") — worker แก้ draft ของ migrator ด้วยตัวเลข/ถ้อยคำของผู้เขียน v2 เท่านั้น
 *   draft <SYM>  migrateOne (ทุกถัง รวม HUMAN) → <work>/<SYM>.json (คีย์ของ worker ตาม S.OWNER · คง meta.migratedFrom · ไม่มี market/_sig)
 *                + <work>/<SYM>.brief.md (ถัง · เหตุผลทุกข้อ · error ของ gate · ตัวเลขหลักของ v2 = เป้าตอน adopt)
 *   adopt <SYM>  guard เดียวกับ convert --write → merge market ของ migrator → checkDoc 0 error + ตัวเลขหลักตรง v2 ภายในการปัดที่ผู้เขียนพิมพ์
 *                + symbol/currency ตรง → IO.write <SYM>.json · ลบ <SYM>.html · checkDoc ซ้ำ (ตกแล้ว rollback แบบ runConvert)
 *                equivalence gate (EQ.compare + ถัง) = ข้อมูลเท่านั้น ไม่บล็อก adopt
 * ★ "การปัดที่พิมพ์" (ตัวตัดสินเดียว = NB.classifyNumber): ฝั่ง v2 = ตัวเลขตามที่ผู้เขียนเขียนใน report-data (literal ดิบ — ทศนิยมที่เขียนคือความละเอียด)
 *   หรือ .tgt literal ของหมวด 6 · MOS = ข้อความที่หน้า v2 พิมพ์ ({{rd:mos}} = fmtMos) · ฝั่ง v3 = ค่าที่ compute ได้ 2 ตำแหน่ง (ราคา) / 2 ตำแหน่ง (MOS)
 *   ⇒ ไม่มีค่าคลาดที่ตั้งขึ้นเอง: ครึ่งหน่วยของทศนิยมที่หยาบกว่า (ผู้เขียนพิมพ์ 262 = ±0.5 · 103.95 = ±0.005 · "−25%" = ±0.5 จุด)
 */
const fs = require('fs');
const path = require('path');
const S = require('../v3/schema.js');
const C = require('../v3/compute.js');
const IO = require('../v3/io.js');
const RV = require('../report-values.js');
const RM = require('../report-meta.js');
const RS = require('../report-source.js');
const FD = require('../queue/footer-date.js');
const LK = require('../lockfile.js');
const NB = require('./numbers.js');
const EQ = require('./equiv.js');
const BK = require('./buckets.js');
const B = require('../../build.js');
const R = require('../../_template/v3/render.js');

const ROOT = path.join(__dirname, '..', '..');
const NAMES = ['Bear', 'Base', 'Bull'];
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const f2 = (x) => (isNum(x) ? x.toFixed(2) : String(x));
const DIRECTIVE = 'ทำเหมือน ZTS … ห้ามวิเคราะห์ใหม่ งานคือย้ายจาก V2 => V3 (เจ้าของ 26 ก.ย. 69)';
const checkDocOf = () => require('../../test/check-v3.js').checkDoc;
const errorLinesOf = (errors) => require('../report.js').errorLines(errors);

/** draft = คีย์ที่ worker เป็นเจ้าของ (S.OWNER) — ตัด market (cron) + _sig (io) · meta.migratedFrom อยู่ใน meta จึงคงไว้ */
function workerDoc(doc) {
  return Object.fromEntries(Object.entries(doc || {}).filter(([k]) => S.OWNER(k) === 'worker'));
}

// literal ตัวเลขใน report-data ดิบตามที่ผู้เขียนเขียน (ทศนิยมที่เขียน = ความละเอียด) — อ่านไม่ได้/ไม่ตรงค่าที่ parse = String(ค่า)
const NUM_LIT = '(-?[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)';
function rdLiteral(block, key, value) {
  const m = new RegExp(`"${key}"\\s*:\\s*${NUM_LIT}`).exec(block);
  return m && parseFloat(m[1]) === value ? m[1] : String(value);
}
/** .tgt literal ของคอลัมน์หมวด 6 (ใบที่ไม่มี values.scenarios) — regex เดียวกับ scenarios.js tgtCheck */
function literalTgt(parsed, i) {
  const s6 = parsed.byN && parsed.byN[6];
  if (!s6) return null;
  const m = /<div class="tgt">([\s\S]*?)<\/div>/.exec(s6.body.split(/<div class="col /)[i + 1] || '');
  if (!m || /\{\{rd:/.test(m[1])) return null;
  const n = NB.numsOf(m[1].replace(/<[^>]+>/g, ' '))[0];
  return n ? { v: n.v, text: m[1].replace(/<[^>]+>/g, '').trim() } : null;
}
const verdictOf = (page) => { const m = RM.VERDICT_CLASS_RE.exec(String(page || '')); return m ? m[1] : null; };

/** ตัวเลขหลักของ v2 (เป้าตอน adopt) — อ่านอย่างเดียวจาก report-data / stock-meta / หน้าที่ expand */
function v2Keys(parsed, raw, sym) {
  const rd = parsed.rd || {}, v = rd.values || {}, sm = parsed.sm || {};
  const blk = ((RM.REPORT_DATA_RE.exec(raw) || [])[1]) || '';
  const scnBlk = (/"scenarios"\s*:\s*\[([\s\S]*?)\]/.exec(blk) || [])[1] || '';
  const tgtLits = [...scnBlk.matchAll(new RegExp(`"tgt"\\s*:\\s*${NUM_LIT}`, 'g'))].map((m) => m[1]);
  const lit = (key, x) => (isNum(x) ? { v: x, text: rdLiteral(blk, key, x) } : null);
  const targets = NAMES.map((name, i) => {
    const s = Array.isArray(v.scenarios) ? v.scenarios[i] : null;
    if (s && isNum(s.tgt)) return { name, v: s.tgt, text: tgtLits[i] && parseFloat(tgtLits[i]) === s.tgt ? tgtLits[i] : String(s.tgt) };
    const l = literalTgt(parsed, i);
    return l ? { name, ...l } : { name, v: null, text: null };
  });
  let d = null;
  try { RV.validateValues(rd, sm); d = RV.derive(rd, sm); } catch (_) { /* v2 ที่ derive ไม่ได้ — MOS/verdict = null (adopt ปฏิเสธ) */ }
  let page = null;
  try { page = B.expandReport(raw); } catch (_) { /* expand ไม่ได้ — ใช้ derive */ }
  const fd = parsed.fd;
  return {
    symbol: String(sm.symbol || sym).toUpperCase(), currency: sm.currency || null,
    fv: lit('fv', rd.fv), fvLow: lit('fvLow', v.fvLow), fvHigh: lit('fvHigh', v.fvHigh), targets,
    years: v.scnBasis ? v.scnBasis.years : null,
    mos: d ? { v: d.mos, text: d.mosText } : null, verdict: verdictOf(page) || (d ? d.mosClass : null),
    px: isNum(v.px) ? v.px : null, priceDate: v.priceDate || null,
    analysisDate: fd ? `${fd.raw} (${fd.iso})` : null,
  };
}

/** ตัวเลขฝั่ง v3 จาก view ที่ compute แล้ว (+ หน้าที่ render ถ้ามี — คลาส verdict ตามที่พิมพ์) */
function v3Keys(doc, view, page) {
  return {
    symbol: doc && doc.symbol, currency: doc && doc.currency,
    fv: view ? view.fv : null, fvLow: view ? view.fvLow : null, fvHigh: view ? view.fvHigh : null,
    targets: view ? (view.scn || []).map((s) => s.tgt) : [], years: doc && doc.scenarios ? doc.scenarios.years : null,
    mos: view ? view.d.mos : null, verdict: verdictOf(page) || (view ? view.d.mosClass : null),
  };
}

/** หน่วยของหลักสุดท้ายที่ผู้เขียน v2 พิมพ์ ("262" = 1 · "103.95" = 0.01 · "−4%" = 1 จุด) — null = อ่านตัวเลขไม่ได้ */
function printedStep(text) {
  const n = NB.numsOf(String(text == null ? '' : text));
  return n.length === 1 ? { v: n[0].v, step: 2 * n[0].half } : null;
}
/** --accept-drift (เจ้าของ 26 ก.ย. 69 · ACMR: ขา $64/$72/$82 เฉลี่ย 72.73 → MOS −5% vs v2 −4%): คลาดจาก v2 ได้ไม่เกิน 1 หน่วยของหลักสุดท้ายที่ v2 พิมพ์ */
function withinOneStep(text, y) {
  const p = printedStep(text);
  return !!p && isNum(y) && Math.abs(y - p.v) <= p.step * (1 + 1e-9);
}
/**
 * เทียบตัวเลขหลัก → [{what, ok, v2, v3, drift?}] · ตัวตัดสินเดียว = NB.classifyNumber (ครึ่งหน่วยของทศนิยมที่หยาบกว่า)
 * opts.acceptDrift: FV · FV low/high · เป้า 3 ฉาก · MOS ที่ไม่ผ่านการปัดแต่คลาด ≤ 1 หน่วยของหลักสุดท้ายที่ v2 พิมพ์ = ok + drift:true
 *   (FV low/high กลายเป็นตัวบล็อกด้วยเมื่อใช้ธงนี้ — เกิน 1 หน่วย = ปฏิเสธ) · verdict/symbol/currency ต้องเท่ากันเสมอ
 */
function compareKeys(a, b, opts) {
  const out = [];
  const acc = !!(opts && opts.acceptDrift);
  const num = (what, x, y) => {
    if (!x || x.text == null) return;   // v2 ไม่พิมพ์ค่านี้ = ไม่มีเป้า
    const strict = isNum(y) && NB.classifyNumber(x.text, f2(y)) === 'rounding';
    const drift = !strict && acc && withinOneStep(x.text, y);
    out.push({ what, ok: strict || drift, v2: x.text, v3: isNum(y) ? f2(y) : '∅', ...(drift ? { drift: true } : {}) });
  };
  num('FV', a.fv, b.fv);
  if (acc) { num('FV low', a.fvLow, b.fvLow); num('FV high', a.fvHigh, b.fvHigh); }
  a.targets.forEach((x, i) => num(`${x.name} target`, x, (b.targets || [])[i]));
  num('MOS', a.mos, b.mos);
  if (a.verdict != null) out.push({ what: 'verdict', ok: a.verdict === b.verdict, v2: a.verdict, v3: b.verdict == null ? '∅' : b.verdict });
  out.push({ what: 'symbol', ok: a.symbol === b.symbol, v2: a.symbol, v3: b.symbol == null ? '∅' : b.symbol });
  out.push({ what: 'currency', ok: a.currency === b.currency, v2: a.currency, v3: b.currency == null ? '∅' : b.currency });
  return out;
}
/** ข้อมูลประกอบ (ไม่บล็อก): กรอบ FV + จำนวนปีของฉาก */
function infoKeys(a, b, opts) {
  const out = [];
  const num = (what, x, y) => { if (x && x.text != null) out.push({ what, ok: isNum(y) && NB.classifyNumber(x.text, f2(y)) === 'rounding', v2: x.text, v3: isNum(y) ? f2(y) : '∅' }); };
  // --accept-drift: FV low/high อยู่ใน compareKeys (บล็อก) แล้ว — ไม่พิมพ์ซ้ำเป็นข้อมูลประกอบ
  if (!(opts && opts.acceptDrift)) { num('FV low', a.fvLow, b.fvLow); num('FV high', a.fvHigh, b.fvHigh); }
  if (a.years != null) out.push({ what: 'years', ok: a.years === b.years, v2: String(a.years), v3: b.years == null ? '∅' : String(b.years) });
  return out;
}

/** view (ถ้า compute ได้) + หน้า render — ไม่ throw */
function viewOf(doc, seeds) {
  let view = null, page = null, err = null;
  try { view = C.compute(doc, { seeds }); } catch (e) { err = String(e && e.message || e).split('\n')[0]; }
  if (view) { try { page = B.expandReport(R.toV2Source(doc, view)); } catch (e) { err = 'render: ' + String(e && e.message || e).split('\n')[0]; } }
  return { view, page, err };
}

/** brief.md — ถัง · เหตุผล · error ของ gate บน draft · ตัวเลขหลักของ v2 (เป้า) เทียบ draft ตอนนี้ */
function briefOf(sym, m, k2, gate, cmp, info, o) {
  const L = [];
  const eq = m.eq || { textLostAt: [] };
  L.push(`# ${sym} — v2 → v3 transcription brief`, '');
  L.push(`> ${DIRECTIVE}`, '> ใช้ได้เฉพาะตัวเลขและถ้อยคำของผู้เขียนที่อยู่ในหน้า v2 — ห้ามดึงข้อมูลใหม่ ห้ามประเมินใหม่ ห้ามเปลี่ยนสมมติฐาน', '');
  L.push(`- bucket: **${m.bucket}**`, `- draft: \`${o.docRel}\` (แก้ไฟล์นี้) · v2: \`${o.v2Rel}\``, `- gate day: ${o.gateDay}`, '');
  L.push('## v2 key numbers — acceptance targets for adopt', '');
  L.push('adopt ต้องได้ค่าเหล่านี้ภายในการปัดที่ผู้เขียนพิมพ์ (ครึ่งหน่วยของทศนิยมที่เขียน — NB.classifyNumber) · กรอบ FV/จำนวนปี = ข้อมูลประกอบ', '');
  L.push('| key | v2 | draft now | |', '|---|---|---|---|');
  const row = (label, v2, v3, ok) => L.push(`| ${label} | ${v2 == null ? '—' : v2} | ${v3 == null ? '—' : v3} | ${ok == null ? '' : ok ? '✓' : '✗'} |`);
  const byWhat = new Map(cmp.concat(info).map((c) => [c.what, c]));
  const r = (label, what, v2) => { const c = byWhat.get(what); row(label, v2, c ? c.v3 : null, c ? c.ok : null); };
  r('FV', 'FV', k2.fv && k2.fv.text);
  r('FV low', 'FV low', k2.fvLow && k2.fvLow.text);
  r('FV high', 'FV high', k2.fvHigh && k2.fvHigh.text);
  for (const x of k2.targets) r(`${x.name} target`, `${x.name} target`, x.text);
  r('Scenario years', 'years', k2.years);
  r('MOS', 'MOS', k2.mos && k2.mos.text);
  r('Verdict class', 'verdict', k2.verdict);
  r('Currency', 'currency', k2.currency);
  r('Symbol', 'symbol', k2.symbol);
  row('Price (px)', k2.px, null, null);
  row('Price date', k2.priceDate, null, null);
  row('Analysis date', k2.analysisDate, null, null);
  L.push('', `MOS ของ v2 = ข้อความที่หน้า v2 พิมพ์ ({{rd:mos}}) ที่ราคา ${k2.px} — adopt ใช้ราคาเดียวกัน (market ของหน้า v2)`, '');
  L.push('## Why the migrator could not do it (every reason)', '');
  if (m.failed) L.push(`- **failed before compare** — ${m.failed}`);
  for (const h of m.notes.H) {
    // theme.<k> missing: หน้า v2 render คีย์ที่ไม่มีด้วยค่าตั้งต้นของ template (build.js THEME_DEFAULTS) — ถอดความได้ตรงตัว
    const tk = /^theme\.(\w+) missing/.exec(h);
    L.push(`- H: ${h}${tk && B.THEME_DEFAULTS[tk[1]] ? ` — หน้า v2 แสดงค่าตั้งต้นของ template: meta.themeLegacy.${tk[1]} = ${JSON.stringify(B.THEME_DEFAULTS[tk[1]])}` : ''}`);
  }
  const byZone = new Map();
  for (const x of eq.textLostAt || []) { if (!byZone.has(x.zone)) byZone.set(x.zone, []); byZone.get(x.zone).push(x.w); }
  for (const [z, ws] of byZone) L.push(`- TEXT LOST in ${z} ×${ws.length}: ${ws.join(' ')}`);
  if (eq.colour && eq.colour.keys && eq.colour.keys.length) L.push(`- theme keys off > 12: ${eq.colour.keys.join(' · ')}`);
  for (const d of m.notes.D) L.push(`- D: ${d}`);
  for (const r2 of eq.numberValue || []) L.push(`- D: ${r2.zone}: ${r2.del} → ${r2.ins}`);
  for (const r2 of eq.rd || []) L.push(`- D: rd/sm ${r2.path}: ${r2.v2} → ${r2.v3}`);
  for (const f of m.notes.F) L.push(`- F: ${f}`);
  L.push('', '## Gate errors on the draft (checkDoc · must be 0 at adopt)', '');
  if (!gate.length) L.push('- none');
  for (const g of gate) L.push(`- ${g}`);
  L.push('', '## Allowances for migrated docs (meta.migratedFrom) — use only when the v2 page really lacks the thing', '',
    '- ขา fv ขาเดียวที่ผู้เขียนประกาศ (ขาอื่น "บริบท — ไม่รวมใน FV") → คงไว้ตามนั้น · gate = W33 (ไม่ใช่ E17) · ห้ามเพิ่มขา',
    '- ขา declared sotp/nav ที่หน้า v2 ไม่มีตารางองค์ประกอบ → ไม่ต้องมี extrasRef แต่ legs[i].note ต้องมีถ้อยคำ/ตัวเลของค์ประกอบของผู้เขียน',
    '- meta.sources ≥ 2 เมื่อหน้า v2 (px-meta · disc · footer) ระบุแหล่งแค่ 2 แหล่ง — ถ้ามี 3+ ให้ถอดครบ',
    '- scenarios.cases[i].desc: คอลัมน์ v2 ไม่มีแถว "สถานการณ์" → ลบคีย์ desc ออก (สตริงว่างยังผิด) — ห้ามแต่งถ้อยคำ');
  L.push('', '## Next', '', `1. แก้ \`${o.docRel}\` ให้ gate ผ่านและตัวเลขหลักตรงตารางด้านบน โดยใช้เฉพาะตัวเลข/ถ้อยคำในหน้า v2`,
    `2. \`node tools/migrate-v3.js adopt ${sym}${o.docArg}\` (reports/ จริงต้องตั้ง MIGRATE_V3_ALLOW_REAL=1)`,
    `3. controller: \`npm run queue -- ship --migrate "${sym}" --model opus --no-push\``, '');
  return L.join('\n');
}

function gateLines(doc, market, seeds, today) {
  if (!doc) return [];
  let r;
  try { r = checkDocOf()({ ...doc, market }, { skipSig: true, seeds, today }); }
  catch (e) { return [`✗ [THROW] ${String(e.message).split('\n')[0]}`]; }
  return errorLinesOf(r.errors);
}

const relOf = (f) => { const r = path.relative(ROOT, f); return r && !r.startsWith('..') ? r : f; };
const ancestors = (d) => { const a = []; for (let x = path.resolve(d); ; x = path.dirname(x)) { a.push(x); if (path.dirname(x) === x) break; } return a; };

/** draft <SYM> — mv = { migrateOne, ctxOf, isGuarded } จาก tools/migrate-v3.js (ไม่ require วงกลับ) */
function runDraft(symIn, opts, log, mv) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  const sym = String(symIn || '').trim().toUpperCase();
  const workDir = path.resolve(opts.workDir || path.join(ROOT, '.work'));
  if (ancestors(workDir).some(mv.isGuarded)) { say(`✗ ${sym}: --work-dir อยู่ใต้ reports/ (${workDir}) — draft ห้ามเขียนลง reports/`); return 1; }
  const o = mv.ctxOf(opts);
  let kind;
  try { kind = RS.kindOf(sym, o.reportsDir); } catch (e) { say(`✗ ${sym}: ${e.message}`); return 1; }
  if (kind === 'v3') { say(`✗ ${sym}: เป็นใบ v3 แล้ว (already v3) — ไม่มีอะไรให้ถอดความ`); return 1; }
  if (kind !== 'v2') { say(`✗ ${sym}: ไม่พบ ${path.join(o.reportsDir, sym + '.html')}`); return 1; }
  const docFile = path.join(workDir, sym + '.json'), briefFile = path.join(workDir, sym + '.brief.md');
  if (!o.force && (fs.existsSync(docFile) || fs.existsSync(briefFile))) { say(`✗ ${sym}: มี draft ${relOf(docFile)} อยู่แล้ว — ไม่เขียนทับงานที่ทำค้าง (ตั้งใจเริ่มใหม่: --force)`); return 1; }
  const m = mv.migrateOne(sym, o);
  const gateDay = o.today || FD.todayBangkok();
  const k2 = v2Keys(m.parsed || {}, m.raw, sym);
  const draft = m.doc ? workerDoc(m.doc) : null;
  const vv = m.doc ? viewOf(m.doc, o.seeds) : { view: null, page: null };
  const k3 = v3Keys(m.doc, vv.view, vv.page);
  const cmp = compareKeys(k2, k3), info = infoKeys(k2, k3);
  const gate = gateLines(draft, m.doc && m.doc.market, o.seeds, gateDay);
  fs.mkdirSync(workDir, { recursive: true });
  if (draft) LK.writeJsonAtomic(docFile, IO.serialize(draft));
  const docArg = path.resolve(workDir) === path.join(ROOT, '.work') ? '' : ` --doc ${relOf(docFile)}`;
  fs.writeFileSync(briefFile, briefOf(sym, m, k2, gate, cmp, info, { docRel: relOf(docFile), v2Rel: relOf(m.file), gateDay, docArg }));
  say(`${sym}: ${m.bucket}${m.failed ? ` (${m.failed})` : ''}`);
  if (!draft) { say(`✗ ${sym}: migrator ไม่ได้ doc (${m.failed}) — เขียน brief อย่างเดียว ${relOf(briefFile)}`); return 1; }
  const bad = cmp.filter((c) => !c.ok);
  say(`✓ ${relOf(docFile)} · ${relOf(briefFile)} — gate error ${gate.length} · ตัวเลขหลักยังไม่ตรง ${bad.length}${bad.length ? ` (${bad.map((c) => c.what).join(', ')})` : ''}`);
  return 0;
}

/** adopt <SYM> — deps.checkDoc = gate หลังเขียน (เทสต์จำลอง gate ตกเพื่อพิสูจน์ rollback) */
function runAdopt(symIn, opts, log, mv, deps) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  const d = deps || {};
  const sym = String(symIn || '').trim().toUpperCase();
  if (mv.isGuarded(opts.reportsDir) && process.env.MIGRATE_V3_ALLOW_REAL !== '1') {
    say(`✗ ${sym}: adopt ใส่ reports/ จริงถูกปฏิเสธ — ต้องตั้ง MIGRATE_V3_ALLOW_REAL=1 (Plan 4c เท่านั้น)`);
    return 1;
  }
  const o = mv.ctxOf(opts);
  let kind;
  try { kind = RS.kindOf(sym, o.reportsDir); } catch (e) { say(`✗ ${sym}: ${e.message}`); return 1; }
  if (kind === 'v3') { say(`✗ ${sym}: เป็นใบ v3 แล้ว (already v3) — ไม่มีอะไรให้ adopt`); return 1; }
  if (kind !== 'v2') { say(`✗ ${sym}: ไม่พบ ${path.join(o.reportsDir, sym + '.html')}`); return 1; }
  if (!o.headManifest && !o.manifest.get(sym)) { say(`✗ ${sym}: ไม่มีแถวใน manifest HEAD:reports.json — adopt ปฏิเสธ (ส่ง --head-manifest FILE ถ้าตั้งใจ)`); return 1; }
  const docFile = path.resolve(o.doc || path.join(o.workDir || path.join(ROOT, '.work'), sym + '.json'));
  let doc;
  try { doc = JSON.parse(fs.readFileSync(docFile, 'utf8')); }
  catch (e) { say(`✗ ${sym}: อ่าน doc ${relOf(docFile)} ไม่ได้ — ${String(e.message).split('\n')[0]} (draft ก่อน: node tools/migrate-v3.js draft ${sym})`); return 1; }
  const m = mv.migrateOne(sym, o);
  const fails = [];
  if (!m.doc || !m.doc.market) { say(`✗ ${sym}: migrator ไม่ได้ doc/market จากหน้า v2 (${m.failed || '?'}) — adopt ต้องใช้ market ของหน้า v2`); return 1; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { say(`✗ ${sym}: doc ต้องเป็น JSON object`); return 1; }
  for (const k of Object.keys(doc)) {
    const own = S.OWNER(k);
    if (own !== 'worker') fails.push(`${k}: เป็นของ ${own === 'cron' ? 'cron — adopt เติม market จากหน้า v2 ให้เอง' : 'io.js — adopt เซ็นให้เอง'} · ลบออกจาก doc`);
  }
  // meta.migratedFrom (spec §8 · D1) — ที่มาจริง = แถว manifest HEAD (updated) + freshHash ของหน้า v2 ปัจจุบัน (migrator คิดให้ทุกครั้ง):
  //   ไม่มีใน doc = ใช้ของ migrator · updated ตรงแถว manifest แต่ v2Hash ค้าง (cron ราคาแก้ .html หลัง draft) = ใช้ของ migrator (ไม่ใช่ลบ — ลบ = build ประทับ updated ใหม่ ขัด §8)
  //   updated ไม่ตรงแถว manifest = ปฏิเสธ (draft ของใบอื่น/รอบอื่น)
  const mf = m.doc.meta && m.doc.meta.migratedFrom;
  if (!mf) fails.push('meta.migratedFrom: migrator ไม่ได้ประทับ (ไม่มีแถว manifest ของ symbol นี้) — ship --migrate จะปฏิเสธ');
  const meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : null;
  const dm = meta && meta.migratedFrom;
  if (meta && mf) {
    if (dm == null) doc.meta = { ...meta, migratedFrom: mf };
    else if (typeof dm !== 'object' || dm.updated !== mf.updated) fails.push(`meta.migratedFrom.updated: doc ${JSON.stringify(dm && dm.updated)} ≠ แถว manifest HEAD ${JSON.stringify(mf.updated)} — draft นี้ไม่ใช่ของใบ v2 ที่ HEAD (draft ใหม่)`);
    else if (JSON.stringify(dm) !== JSON.stringify(mf)) {
      say(`  ℹ meta.migratedFrom.v2Hash ${dm.v2Hash} → ${mf.v2Hash} (หน้า v2 เปลี่ยนหลัง draft เช่น cron ราคา · updated คงแถว manifest HEAD)`);
      doc.meta = { ...meta, migratedFrom: mf };
    }
  }
  const full = { ...workerDoc(doc), market: m.doc.market };
  const gateDay = o.today || FD.todayBangkok();
  // (a) checkDoc 0 error ที่วันนี้ (เหมือน convert --write)
  let g;
  try { g = checkDocOf()(full, { skipSig: true, seeds: o.seeds, today: gateDay }); }
  catch (e) { g = { errors: [{ id: 'THROW', label: 'checkDoc', msg: String(e.message).split('\n')[0] }], warnings: [] }; }
  for (const l of errorLinesOf(g.errors)) fails.push(`checkDoc ${l.replace(/^✗ /, '')}`);
  // (b)(c) ตัวเลขหลัก + symbol/currency
  const vv = g.view ? { view: g.view, page: null } : viewOf(full, o.seeds);
  if (vv.view && !vv.page) { try { vv.page = B.expandReport(R.toV2Source(full, vv.view)); } catch (_) { /* render error อยู่ใน checkDoc แล้ว */ } }
  if (!vv.view) fails.push(`key numbers: compute ไม่ได้ — ${vv.err || 'ดู checkDoc'}`);
  const k2 = v2Keys(m.parsed || {}, m.raw, sym), k3 = v3Keys(full, vv.view, vv.page);
  const kopt = { acceptDrift: !!o.acceptDrift };
  const cmp = compareKeys(k2, k3, kopt);
  say(`${sym}: adopt ${relOf(docFile)} · gate วันที่ ${gateDay}${kopt.acceptDrift ? ' · --accept-drift (≤ 1 หน่วยของหลักสุดท้ายที่ v2 พิมพ์ · verdict ต้องเท่ากัน)' : ''}`);
  for (const c of cmp) say(`  ${c.drift ? '≈' : c.ok ? '✓' : '✗'} ${c.what}: v2 ${c.v2} · v3 ${c.v3}${c.drift ? ' (drift ≤ 1 printed step)' : ''}`);
  for (const c of infoKeys(k2, k3, kopt)) say(`  ${c.ok ? 'ℹ' : '⚠'} ${c.what}: v2 ${c.v2} · v3 ${c.v3} (ข้อมูลประกอบ ไม่บล็อก)`);
  for (const c of cmp) if (!c.ok) fails.push(`${c.what}: v2 ${c.v2} · v3 ${c.v3}${kopt.acceptDrift && /^(FV|FV low|FV high|Bear target|Base target|Bull target|MOS)$/.test(c.what) ? ' (เกิน 1 หน่วยของหลักสุดท้ายที่ v2 พิมพ์)' : ''}`);
  // display-fix: ทั้งหน้าต้องแสดงค่าเท่าหน้า v2 (display audit ตัวเดียวกับ audit/remigrate/convert --write) — ไม่ใช่แค่ตัวเลขหลัก
  if (mv.displayGate) for (const x of mv.displayGate(sym, full, m.raw, o.seeds)) fails.push(`display audit ${x}`);
  const drifts = cmp.filter((c) => c.drift);
  if (kopt.acceptDrift) say(`  drift list (${drifts.length}): ${drifts.length ? drifts.map((c) => `${c.what} v2 ${c.v2} → v3 ${c.v3}`).join(' · ') : 'none'}`);
  // equivalence gate = ข้อมูลเท่านั้น
  if (vv.view && vv.page) {
    try {
      const eq = EQ.compare(B.expandReport(m.raw), vv.page, full, vv.view, { v2src: m.raw });
      const b = BK.bucketOf({ H: [], D: [], F: [] }, eq);
      say(`  ℹ equivalence (info only — does not block adopt): ${b.bucket} · textLost ${eq.textLost.length} · numberValue ${eq.numberValue.length} · rd ${eq.rd.length}${eq.textLost.length ? ` · lost: ${eq.textLost.slice(0, 12).join(' ')}` : ''}`);
    } catch (e) { say(`  ℹ equivalence (info only): เทียบไม่ได้ — ${String(e.message).split('\n')[0]}`); }
  }
  if (fails.length) {
    say(`✗ ${sym}: adopt ปฏิเสธ — ${fails.length} ข้อ · ไม่ได้เขียน/ลบอะไร`);
    for (const f of fails) say(`  ✗ ${f}`);
    return 1;
  }
  const json = path.join(o.reportsDir, sym + '.json');
  IO.write(json, full);
  fs.unlinkSync(m.file);
  let g2;
  try { g2 = (d.checkDoc || checkDocOf())(IO.read(json), { seeds: o.seeds, today: gateDay }); }
  catch (e) { g2 = { errors: [{ id: 'THROW', msg: String(e.message).split('\n')[0] }] }; }
  if (g2.errors.length) {
    fs.writeFileSync(m.file, m.raw);
    fs.unlinkSync(json);
    say(`✗ ${sym}: checkDoc ${g2.errors.length} error หลังเขียน — คืน ${sym}.html · ลบ ${sym}.json`);
    for (const e of g2.errors) say(`  ${e.id}: ${e.msg}`);
    return 1;
  }
  say(`✓ ${sym}: เขียน ${sym}.json · ลบ ${sym}.html · checkDoc 0 error${g2.warnings && g2.warnings.length ? ` · ${g2.warnings.length} warning` : ''} · ตัวเลขหลักตรง v2${drifts.length ? ` (drift ${drifts.length} ข้อ ≤ 1 หน่วยที่พิมพ์ — --accept-drift)` : ''}`);
  say(`ต่อไป (controller): npm run build → npm run queue -- ship --migrate "${sym}" --model opus --no-push`);
  return 0;
}

module.exports = { workerDoc, v2Keys, v3Keys, compareKeys, infoKeys, printedStep, withinOneStep, briefOf, runDraft, runAdopt, literalTgt };
