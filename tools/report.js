#!/usr/bin/env node
'use strict';
/**
 * report.js — ทางเขียนเดียวของรายงาน v3 (spec §6.1 · Plan 2b)
 *   init <SYM>             sidecar .queue/prep/<SYM>.json → .work/<SYM>.json (ใบใหม่ · ช่องดุลพินิจ = sentinel "TODO")
 *   export <SYM>           reports/<SYM>.json → .work/<SYM>.json (ตัด market + _sig) — UPDATE
 *   save <SYM> [--light]   draft + market → checkDoc(stage:'save') + กติกา B → error ครบทุกข้อพร้อม path · ผ่านหมด = IO.write
 *   show <SYM> [path]      view ที่ compute แล้ว (ไม่มี path = FV/MOS/ขา + ตาราง token ที่ใช้ได้พร้อมค่า ณ ตอนนี้)
 *   diff <SYM>             draft vs ใบปัจจุบัน — path ที่เปลี่ยน + FV/MOS/ค่าขา ก่อน → หลัง
 * ตัวเลือกสำหรับเทส/replay (R7): --reports-dir --work-dir --prep-dir --seeds <file> --today YYYY-MM-DD · --force = init/export ทับ draft
 *   (--today ตั้งนาฬิกาของ init/save/show เท่านั้น — verify ใช้นาฬิกาจริงเสมอ ไม่ใช่ทางหนี staleness)
 * exit: 0 ผ่าน · 1 ปฏิเสธ/ไม่ผ่าน gate · 2 ใช้คำสั่งผิด
 * ★ เขียน reports/ ได้ทางเดียวคือ save → IO.write (hook guard-reports.js บล็อกการเขียนตรง · _sig/E50 จับที่ gate)
 */
const fs = require('fs');
const path = require('path');
const S = require('./v3/schema.js');
const P = require('./v3/prose.js');
const IO = require('./v3/io.js');
const TK = require('./v3/tokens.js');
const RS = require('./report-source.js');
const LK = require('./lockfile.js');
const CV = require('../test/check-v3.js');
const { todayBangkok } = require('./queue/footer-date.js');

const ROOT = path.join(__dirname, '..');
const SYM_RE = /^[A-Z0-9][A-Z0-9.\-]*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MINUS = '−';
const USAGE = 'ใช้: node tools/report.js <init|export|save|show|diff> <SYMBOL> [path] [--light] [--force]\n'
  + '    (เทส/replay: --reports-dir <dir> --work-dir <dir> --prep-dir <dir> --seeds <file> --today YYYY-MM-DD)';
const PROSE_HINT = { chart: 'อ่านกราฟราคา ~1 ปี', valuation: 'สรุปวิธีประเมินมูลค่าและน้ำหนัก', gauge: 'ตำแหน่งราคาเทียบ FV', mos: 'ส่วนเผื่อความปลอดภัย',
  verdictHeadline: 'หัวข้อคำตัดสิน', verdictBody: 'เนื้อคำตัดสิน', strategy: 'กลยุทธ์ตามโซนราคา', disclaimerSources: 'แหล่งข้อมูลท้ายรายงาน' };
// --light (spec §6.1): ช่อง P.proseFields ทั้งหมด + ช่องเหล่านี้ — ตรงกับ UPDATE-LIGHT ของ v2 (รีเฟรชเป้า analyst/ปันผล)
const LIGHT_EXACT = new Set(['meta.analysisDate', 'meta.aiModel', 'meta.sources', 'meta.priceNote', 'analyst', 'fundamentals.dps']);
const LIGHT_PREFIX = ['meta.sources[', 'analyst.'];

class UsageError extends Error {}
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const round1 = (x) => Math.round(x * 10) / 10;
const signed1 = (x) => (x < 0 ? MINUS : '+') + Math.abs(x).toFixed(1);
const T = (what) => `TODO: ${what}`;
const rel = (f) => { const r = path.relative(ROOT, f); return r && !r.startsWith('..') ? r : f; };

/** sidecar v1 (Task 6) → draft ใบใหม่ (บริสุทธิ์) — ส่วน mechanical เติมให้ · ช่องดุลพินิจ = "TODO: …" ที่ save/gate ปฏิเสธ (E51)
 *  ไม่มี market (save เติมจาก sidecar) · ไม่มี meta.aiModel (worker รายงานตัวเอง) · ไม่มี themeLegacy (สีจาก seeds.json) */
function draftFromSidecar(sc, today) {
  const t = sc.ttm || {}, v = sc.vendor || {}, mk = sc.market || {}, med = sc.medians;
  const f = {};
  const put = (k, x) => { if (isNum(x)) f[k] = x; };
  const eps = isNum(v.epsTTM) ? v.epsTTM : t.epsDil;
  put('eps', eps); if (isNum(eps)) f.epsBasis = 'gaap-ttm';
  put('dps', sc.dps); put('shares', sc.sharesOut);   // [2b] หุ้นคงเหลือ — ไม่ใช่ถัวเฉลี่ยปรับลด
  put('revenue', t.revenue); put('netIncome', t.netIncome); put('fcf', t.fcf);
  put('grossMargin', t.grossMargin); put('opMargin', t.opMargin); put('netMargin', t.netMargin);
  put('roe', t.roe); put('debtToEquity', t.debtToEquity);
  if (isNum(t.debt) && isNum(t.cash)) f.netDebt = t.debt - t.cash;
  const medOk = !!(med && isNum(med.median) && !med.curErr);   // curErr = ผสมสกุล → ห้ามใช้มัธยฐาน
  if (medOk) f.peAvg5y = round1(med.median);
  const trap2c = (v.traps || []).some((x) => /^\[2c\]/.test(x));   // forecast คนละงวด → ไม่ใส่ epsForward
  if (isNum(sc.epsForward) && sc.epsForward > 0 && !trap2c) f.epsForward = sc.epsForward;
  if (sc.fy && sc.fy.period) {
    const fy = { period: sc.fy.period };
    for (const k of ['netIncome', 'eps', 'revenue']) if (isNum(sc.fy[k])) fy[k] = sc.fy[k];
    if (Object.keys(fy).length > 1) f.fy = fy;
  }

  const meta = {
    company: sc.company || T('ชื่อบริษัท'), exchange: sc.exchange || T('ตลาด เช่น NYSE / NASDAQ / SET'),
    sub: T('คำโปรยธุรกิจ 1 บรรทัด (≥10 ตัวอักษร)'), headerTags: [T('แท็กหัวรายงาน 0–2 ข้อ')], analysisDate: today,
    sources: ['Yahoo Finance', 'StockAnalysis.com', T('แหล่งที่ 3 เช่น SEC 10-Q / งบ SET')],
  };
  const dP = sc.crossVerify && sc.crossVerify.dP;
  if (isNum(dP)) meta.priceNote = Math.abs(dP) <= 2 ? 'StockAnalysis.com ตรงกับ Yahoo Finance' : T(`ราคา 2 แหล่งต่าง ${Math.abs(dP).toFixed(1)}% — ระบุแหล่งที่ใช้`);

  const legs = [];
  if (medOk && f.eps > 0) {
    const range = isNum(med.lo) && isNum(med.hi) ? ` กรอบ ${med.lo.toFixed(1)}–${med.hi.toFixed(1)}x` : '';
    const inputs = { multiple: T(`ตัวคูณเป้าหมาย — มัธยฐาน ${med.median.toFixed(1)}x${range} (ห้ามยึด P/E ปัจจุบัน — W18)`), multipleSource: 'median5y' };
    if (med.window) inputs.medianWindow = med.window;
    legs.push({ method: 'pe', label: 'P/E มัธยฐาน 5 ปี', inputs, note: T('เหตุผลที่เลือกตัวคูณนี้') });
  }
  while (legs.length < 2) legs.push({ method: T('วิธีประเมิน เช่น pe / ddm / dcf / declared'), label: T('ชื่อขา'), inputs: {}, note: T('ที่มาของตัวเลข') });

  const CARD_IF = [['mcap', f.shares != null], ['pe', f.eps > 0], ['yield', f.dps > 0], ['eps', f.eps != null], ['roe', f.roe != null],
    ['netMargin', f.netMargin != null], ['revenue', f.revenue != null], ['range52w', mk.range52w != null], ['peAvg5y', f.peAvg5y != null],
    ['fcf', f.fcf != null], ['debtToEquity', f.debtToEquity != null]];

  const divIncluded = f.dps > 0, epsDriven = f.eps > 0;
  const scenarios = {
    years: 3, divIncluded, perYear: 'cagr',
    driver: epsDriven ? 'eps' : T('driver: eps / ffo / revenuePerShare / bvps / fcfPerShare'),
    exitMetric: epsDriven ? 'pe' : T('exitMetric: pe / ps / pbv / pffo / pfcf'),
    cases: ['Bear', 'Base', 'Bull'].map((n) => {
      const c = { growth: T(`% โตต่อปีของฉาก ${n}`), exitMultiple: T(`ตัวคูณตอนออกของฉาก ${n}`) };
      if (divIncluded) c.divCum = T(`ปันผลสะสมต่อหุ้นถึงจุดออก ฉาก ${n}`);
      c.desc = T(`เหตุการณ์ของฉาก ${n}`);
      return c;
    }),
    note: T('สมมติฐานร่วมของทั้งสามฉาก'),
  };
  const analyst = isNum(v.target) && v.target > 0
    ? { target: v.target, ...(Number.isInteger(v.analysts) && v.analysts >= 1 ? { n: v.analysts } : {}), rating: sc.rating || T('เรตติ้งนักวิเคราะห์'), asOf: mk.priceDate || null }
    : null;

  return {
    v: 3, symbol: sc.symbol, currency: sc.currency, region: sc.region, dateEra: 'BE', meta, fundamentals: f, legs, fvWeights: null,
    metrics: { cards: CARD_IF.filter(([, ok]) => ok).map(([k]) => k) }, scenarios, analyst,
    prose: Object.fromEntries(Object.entries(PROSE_HINT).map(([k, h]) => [k, T(h)])),
    catalysts: [1, 2, 3].map((i) => T(`ปัจจัยหนุนข้อ ${i}`)), risks: [1, 2, 3].map((i) => T(`ความเสี่ยงข้อ ${i}`)), extras: [],
  };
}

/** leaf path ที่ต่างกัน (ไม่นับ market/_sig ระดับบนสุด) — ตัวเดียวที่ --light และ diff ใช้
 *  container ที่มีข้างเดียว (อีกข้างไม่มี/null) = เดินเทียบกับ {} / [] → ได้ leaf จริง (ไม่งั้น metrics.notes ใหม่ทั้งก้อนไม่ตรง allowlist ของ prose)
 *  container ว่างข้างเดียว = path ของมันเอง (ไม่หายเงียบ) · array↔object = leaf เดียว */
function diffPaths(a, b) {
  const out = [];
  const isBox = (x) => Array.isArray(x) || isObj(x);
  const emptyLike = (x) => (Array.isArray(x) ? [] : {});
  const walk = (x, y, p) => {
    if (isBox(x) !== isBox(y) && (x == null || y == null)) {
      const n = out.length;
      if (x == null) walk(emptyLike(y), y, p); else walk(x, emptyLike(x), p);
      if (out.length === n) out.push(p);
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) { for (let i = 0; i < Math.max(x.length, y.length); i++) walk(x[i], y[i], `${p}[${i}]`); return; }
    if (isObj(x) && isObj(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (!p && (k === 'market' || k === '_sig')) continue;
        walk(x[k], y[k], p ? `${p}.${k}` : k);
      }
      return;
    }
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push(p);
  };
  walk(a || {}, b || {}, '');
  return out;
}

function lightViolations(before, after) {
  const prose = new Set([...P.proseFields(before), ...P.proseFields(after)].map((x) => x.path));
  const ok = (p) => prose.has(p) || LIGHT_EXACT.has(p) || LIGHT_PREFIX.some((x) => p.startsWith(x));
  return diffPaths(before, after).filter((p) => !ok(p));
}

function getPath(obj, p) {
  let x = obj;
  for (const k of p.split(/[.[\]]/).filter(Boolean)) { if (x == null) return undefined; x = x[k]; }
  return x;
}

function parseArgs(argv) {
  const VAL = { '--reports-dir': 'reportsDir', '--work-dir': 'workDir', '--prep-dir': 'prepDir', '--seeds': 'seeds', '--today': 'today' };
  const o = { _: [], force: false, light: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VAL[a]) { if (argv[i + 1] == null) throw new UsageError(`${a} ต้องมีค่า`); o[VAL[a]] = argv[++i]; }
    else if (a === '--force') o.force = true;
    else if (a === '--light') o.light = true;
    else if (a.startsWith('--')) throw new UsageError(`ไม่รู้จักตัวเลือก ${a}`);
    else o._.push(a);
  }
  if (o.today != null && !ISO_RE.test(o.today)) throw new UsageError('--today ต้องเป็น YYYY-MM-DD');
  return o;
}

// ── ตัวช่วย I/O ──
const workFile = (c) => path.join(c.workDir, c.sym + '.json');
const reportFile = (c) => path.join(c.reportsDir, c.sym + '.json');
function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`${what} ${rel(file)} อ่านไม่ได้: ${e.message}`); }
}
const seedsOf = (c) => readJson(c.seedsFile, 'seeds') || {};
function loadSidecar(c) {
  const file = path.join(c.prepDir(), c.sym + '.json');
  const sc = readJson(file, 'sidecar');
  if (!sc) return { sc: null, errs: [`ไม่พบ sidecar ${rel(file)} — รัน npm run queue -- prep ${c.sym} ก่อน (โหมด NEW)`] };
  const errs = [];
  if (sc.v !== 1) errs.push(`sidecar ${rel(file)} เวอร์ชัน ${JSON.stringify(sc.v)} — รองรับแค่ 1 (รัน prep ใหม่)`);
  if (sc.symbol !== c.sym) errs.push(`sidecar ${rel(file)} เป็นของ ${JSON.stringify(sc.symbol)} ไม่ใช่ ${c.sym}`);
  if (!isObj(sc.market) || !isNum(sc.market.px)) errs.push(`sidecar ${rel(file)} ไม่มี market.px — รัน prep ใหม่`);
  return { sc, errs };
}
/** draft ของ .work/ — atomic (tmp + rename) แต่ไม่ผ่าน IO.write: draft ใบใหม่มี sentinel TODO ที่ IO.write (validate) ปฏิเสธ · draft ไม่เซ็น */
function writeDraft(c, draft) {
  fs.mkdirSync(c.workDir, { recursive: true });
  LK.writeJsonAtomic(workFile(c), IO.serialize(draft));
}
const refuseDraft = (c) => { c.err(`✗ มี draft ${rel(workFile(c))} อยู่แล้ว — ไม่เขียนทับงานที่ทำค้าง (ตั้งใจเริ่มใหม่: --force)`); return 1; };

/** error ของ checkDoc → บรรทัดละ path · E51 ที่ไม่มี details (compute fallback / badLeg / render leak) = พิมพ์ msg */
function errorLines(errors) {
  const out = [];
  for (const e of errors) {
    if (e.details && e.details.length) for (const d of e.details) out.push(`✗ [${e.id}] ${d.path}: ${d.msg}`);
    else out.push(`✗ [${e.id}] ${e.label}: ${e.msg}`);
  }
  return out;
}

// ── คำสั่ง ──
function cmdInit(c) {
  const kind = RS.kindOf(c.sym, c.reportsDir);
  if (kind) {
    c.err(`✗ มีรายงาน ${c.sym}.${kind === 'v2' ? 'html' : 'json'} อยู่แล้ว — init ใช้กับใบใหม่เท่านั้น`
      + (kind === 'v3' ? ` (UPDATE: node tools/report.js export ${c.sym})` : ' (ใบ v2: node tools/apply-edits.js)'));
    return 1;
  }
  if (fs.existsSync(workFile(c)) && !c.force) return refuseDraft(c);
  const { sc, errs } = loadSidecar(c);
  if (errs.length) { for (const e of errs) c.err('✗ ' + e); return 1; }
  const draft = draftFromSidecar(sc, c.today);
  writeDraft(c, draft);
  const todo = S.stringLeaves(draft, '', []).filter((x) => S.TODO_RE.test(x.text)).length;
  c.log(`✓ ${rel(workFile(c))} — ใบใหม่ ${c.sym} · ช่อง TODO ${todo} ช่อง (save ปฏิเสธจนกว่าจะเติมครบ + ใส่ meta.aiModel)`);
  if (sc.builtAt && sc.builtAt !== c.today) c.log(`⚠ sidecar สร้างเมื่อ ${sc.builtAt} (วันนี้ ${c.today}) — ราคา/งบอาจเก่า: รัน prep ใหม่ถ้าไม่แน่ใจ`);
  const m = sc.medians;
  if (m && isNum(m.median) && !m.curErr) c.log(`ℹ มัธยฐาน P/E ${m.window || ''} = ${m.median.toFixed(1)}x${isNum(m.lo) && isNum(m.hi) ? ` (กรอบ ${m.lo.toFixed(1)}–${m.hi.toFixed(1)}x → hint ของ legs[0].inputs.multipleRange)` : ''}`);
  else c.log(`ℹ ไม่มีมัธยฐาน P/E ที่ใช้ได้${m && m.curErr ? ` (${m.curErr})` : ''} — ไม่ได้ร่างขา pe ให้`);
  for (const x of (sc.vendor && sc.vendor.traps) || []) c.log(`⚠ กับดัก vendor: ${x}`);
  // sourceErrors (นอก market) = แหล่งที่ fetch ล้มตอน prep แต่ไม่ถึงขั้นหยุด — init คือคนอ่านคนเดียว: บอก 1 บรรทัดแล้วทำต่อ
  const se = isObj(sc.sourceErrors) ? Object.entries(sc.sourceErrors).filter(([, m]) => m != null) : [];
  if (se.length) c.log(`⚠ sourceErrors ตอน prep: ${se.map(([k, m]) => `${k}: ${String(m).split('\n')[0]}`).join(' · ')} — ช่องจากแหล่งนั้นอาจว่าง/เป็น TODO ตรวจเองก่อน save`);
  c.log(`ต่อไป: เติม TODO ใน ${rel(workFile(c))} → สีแบรนด์ node tools/pick-brand.js ${c.sym} "#rrggbb" → node tools/report.js save ${c.sym} (ตัวเลข/token: node tools/report.js show ${c.sym})`);
  return 0;
}

function cmdExport(c) {
  const kind = RS.kindOf(c.sym, c.reportsDir);
  if (kind !== 'v3') {
    c.err(`✗ export ใช้กับใบ v3 เท่านั้น — ${kind === 'v2' ? `${c.sym} เป็นใบ v2: ใช้ node tools/apply-edits.js` : `ไม่มีรายงาน ${c.sym} (ใบใหม่: node tools/report.js init ${c.sym})`}`);
    return 1;
  }
  if (fs.existsSync(workFile(c)) && !c.force) return refuseDraft(c);
  const { market, _sig, ...draft } = RS.load(c.sym, c.reportsDir).doc;
  writeDraft(c, draft);
  c.log(`✓ ${rel(workFile(c))} ← ${c.sym}.json (ตัด market + _sig — save เติม market จากใบเดิมให้เอง)`);
  return 0;
}

function cmdSave(c) {
  const kind = RS.kindOf(c.sym, c.reportsDir);
  // Review Focus 1: .json ข้างใบ v2 = build.reportEntries throw ทั้งเว็บ
  if (kind === 'v2') { c.err(`✗ ${c.sym} เป็นใบ v2 (${c.sym}.html) — save ไม่เขียน .json ข้างใบ v2 (build จะล้มทั้งเว็บ) · แก้ใบ v2 ด้วย node tools/apply-edits.js`); return 1; }
  const draft = readJson(workFile(c), 'draft');
  if (!draft) { c.err(`✗ ไม่พบ draft ${rel(workFile(c))} — ${kind ? 'export' : 'init'} ก่อน: node tools/report.js ${kind ? 'export' : 'init'} ${c.sym}`); return 1; }
  // (1) ด่านเจ้าของ (S.OWNER) + สิ่งที่ merge ไม่ได้ — ล้มตรงนี้ = ยังไม่มีเอกสารให้ตรวจ
  const pre = [];
  if (!isObj(draft)) pre.push('(root): draft ต้องเป็น JSON object');
  else {
    for (const k of Object.keys(draft)) {
      const own = S.OWNER(k);
      if (own !== 'worker') pre.push(`${k}: เป็นของ ${own === 'cron' ? 'cron — save เติมจาก sidecar/ใบเดิมให้เอง' : 'io.js — save เซ็นให้เอง'} · ลบออกจาก draft`);
    }
    if (draft.symbol !== c.sym) pre.push(`symbol: ${JSON.stringify(draft.symbol)} ไม่ตรงกับ ${c.sym}`);
    if (!kind && isObj(draft.meta) && draft.meta.themeLegacy != null) pre.push('meta.themeLegacy: ใบใหม่ใช้สีจาก tools/seeds.json (node tools/pick-brand.js) — ลบช่องนี้ (§3.5)');
  }
  if (c.light && !kind) pre.push('--light: ใช้กับใบที่มีอยู่แล้วเท่านั้น (UPDATE-LIGHT) — ใบใหม่ใช้ save เต็ม');
  let market = null, before = null;
  if (kind === 'v3') { before = RS.load(c.sym, c.reportsDir).doc; market = before.market; }
  else { const s = loadSidecar(c); pre.push(...s.errs); if (s.sc) market = s.sc.market; }
  if (pre.length) { for (const e of pre) c.err('✗ ' + e); c.err(`❌ save ไม่ผ่าน — ${pre.length} ข้อ · ไม่ได้เขียน ${c.sym}.json`); return 1; }

  // (2) merge market → (3) checkDoc stage:'save' → (4) กติกา B → (5) พิมพ์ครบทุกข้อ → (6) IO.write
  const doc = { ...draft, market };
  const lines = [], warns = [];
  if (c.light) for (const p of lightViolations(before, doc)) lines.push(`✗ [--light] ${p}: อยู่นอก allowlist ของ --light — ใช้ save เต็ม (UPDATE)`);
  const r = CV.checkDoc(doc, { skipSig: true, seeds: seedsOf(c), stage: 'save', today: c.today });
  lines.push(...errorLines(r.errors));
  if (r.view) {
    const b = P.checkRuleB(doc, r.view);
    for (const x of b.errors) lines.push(`✗ [กติกา B] ${x.path}: "${x.literal}" คือค่าผูกราคา — ใช้ {{${x.token}}}`);
    for (const x of b.warnings) warns.push(`⚠ [กติกา B] ${x.path}: "${x.literal}" ใกล้ {{${x.token}}} — ถ้าเป็นค่าเดียวกันให้ใช้ token`);
  }
  for (const w of r.warnings) warns.push(`⚠ [${w.id}] ${w.label}: ${w.msg}`);
  for (const d of r.dropped) c.log(`ℹ stage:save ตัด ${d.id} (${d.label}) — tag ลงตอน ship ด้วย tools/tag-apply.js`);
  for (const w of warns) c.log(w);
  if (lines.length) { for (const l of lines) c.err(l); c.err(`❌ save ไม่ผ่าน — ${lines.length} ข้อ · ไม่ได้เขียน ${c.sym}.json`); return 1; }
  IO.write(reportFile(c), doc);
  const v = r.view;
  c.log(`✓ ${rel(reportFile(c))} — FV ${v.cur}${v.fv.toFixed(2)} · MOS ${signed1(v.sm.mos)}% (ราคา ${v.cur}${doc.market.px} · ${doc.market.priceDate})`);
  c.log(`ต่อไป: npm test -- ${c.sym}`);
  return 0;
}

/** เอกสารที่ show/diff ใช้: draft (+ market ของใบเดิม หรือ sidecar) ถ้ามี ไม่งั้นใบใน reports/ */
function docForView(c) {
  const kind = RS.kindOf(c.sym, c.reportsDir);
  if (kind === 'v2') throw new Error(`${c.sym} เป็นใบ v2 — show/diff ใช้กับใบ v3`);
  const report = kind === 'v3' ? RS.load(c.sym, c.reportsDir).doc : null;
  const draft = readJson(workFile(c), 'draft');
  if (draft) {
    let market = report ? report.market : null;
    if (!market) { const s = loadSidecar(c); if (s.errs.length) throw new Error(s.errs.join(' · ')); market = s.sc.market; }
    const { market: _m, _sig, ...rest } = draft;
    return { src: `draft ${rel(workFile(c))}`, doc: { ...rest, market }, report };
  }
  if (report) return { src: `${c.sym}.json`, doc: report, report };
  throw new Error(`ไม่มีทั้ง draft และรายงานของ ${c.sym} (ใบใหม่: node tools/report.js init ${c.sym})`);
}
/** view ของ show/diff = CV.checkDoc ตัวเดียว (ห้ามเขียน validate → semanticErrors → compute ซ้ำ — ruling 3)
 *  view:null = compute ไม่ได้ หรือขาไม่ผ่าน badLeg → { errors: บรรทัดของ errorLines } · มี view = ใช้ได้ แม้ gate ยังมี error อื่น (draft ที่ทำค้าง) */
function viewOf(doc, c) {
  const r = CV.checkDoc(doc, { skipSig: true, seeds: seedsOf(c), stage: 'save', today: c.today });
  return r.view ? { view: r.view, nErr: r.errors.length } : { errors: errorLines(r.errors) };
}

function cmdShow(c) {
  const { src, doc } = docForView(c);
  const { view, errors, nErr } = viewOf(doc, c);
  if (errors) { c.err(`✗ ${src} ยัง compute ไม่ได้ — ${errors.length} ข้อ:`); for (const l of errors) c.err('  ' + l); return 1; }
  if (c.arg) {
    const val = getPath(view, c.arg);
    if (val === undefined) { c.err(`✗ ไม่มี path "${c.arg}" ใน view (เช่น fv · fvLow · sm.mos · legs[0].value · scn[1].tgt · d.pe)`); return 1; }
    c.log(JSON.stringify(val, null, 2));
    return 0;
  }
  const cur = view.cur;
  c.log(`${c.sym} — ${src}`);
  if (nErr) c.log(`⚠ gate ยังมี error ${nErr} ข้อ — ตัวเลขด้านล่าง compute ได้แล้ว แต่ save จะปฏิเสธจนกว่าจะแก้ (save พิมพ์ครบพร้อม path)`);
  c.log(`FV ${cur}${view.fv.toFixed(2)} (กรอบ ${cur}${view.fvLow.toFixed(2)}–${cur}${view.fvHigh.toFixed(2)}) · MOS ${signed1(view.sm.mos)}% · ราคา ${cur}${doc.market.px} (${doc.market.priceDate})`);
  view.legs.forEach((l, i) => c.log(`  legs[${i}] ${l.label}: ${cur}${l.value.toFixed(2)} × น้ำหนัก ${(l.weight * 100).toFixed(1)}%${l.role === 'context' ? ' (context)' : ''}`));
  c.log('token ที่ใช้ได้ใน prose (ค่า ณ ตอนนี้ — ตัวเลขผูกราคาต้องเขียนเป็น token เสมอ · กติกา B):');
  for (const [k, fn] of Object.entries(TK.TOKENS_V3)) {
    let s;
    try { s = fn(view); } catch (_) { continue; }   // token ที่ใบนี้ไม่มีค่า = ใช้ไม่ได้ → ไม่แสดง
    c.log(`  {{${k}}} = ${s}`);
  }
  return 0;
}

function cmdDiff(c) {
  const { doc, report } = docForView(c);
  if (!report) { c.log(`${c.sym}: ใบใหม่ — ไม่มีใบเดิมให้เทียบ (ดูตัวเลข: node tools/report.js show ${c.sym})`); return 0; }
  if (doc === report) { c.log(`${c.sym}: ไม่มี draft — ไม่มีอะไรต่าง`); return 0; }
  const paths = diffPaths(report, doc);
  const short = (x) => { const s = JSON.stringify(x); return s === undefined ? '∅' : s.length > 70 ? s.slice(0, 67) + '…' : s; };
  c.log(`${c.sym}: draft vs ${c.sym}.json — ${paths.length} path เปลี่ยน`);
  for (const p of paths) c.log(`  ${p}: ${short(getPath(report, p))} → ${short(getPath(doc, p))}`);
  const a = viewOf(report, c), b = viewOf(doc, c);
  if (a.errors || b.errors) {
    const bad = b.errors ? b : a;
    c.log(`ℹ ${b.errors ? 'draft' : 'ใบเดิม'} ยัง compute ไม่ได้ — เทียบ FV ไม่ได้ (${bad.errors.length} ข้อ):`);
    for (const l of bad.errors) c.log('  ' + l);
    return 0;
  }
  const va = a.view, vb = b.view, cur = vb.cur;
  c.log(`FV ${cur}${va.fv.toFixed(2)} → ${cur}${vb.fv.toFixed(2)} · MOS ${signed1(va.sm.mos)}% → ${signed1(vb.sm.mos)}%`);
  for (let i = 0; i < Math.max(va.legs.length, vb.legs.length); i++) {
    const x = va.legs[i], y = vb.legs[i];
    if (!x || !y || x.value !== y.value || x.weight !== y.weight)
      c.log(`  legs[${i}] ${x ? cur + x.value.toFixed(2) : '∅'} → ${y ? cur + y.value.toFixed(2) : '∅'}`);
  }
  return 0;
}

const CMDS = { init: cmdInit, export: cmdExport, save: cmdSave, show: cmdShow, diff: cmdDiff };

function run(argv, io) {
  const log = (io && io.log) || console.log, err = (io && io.err) || console.error;
  let o;
  try { o = parseArgs(argv); }
  catch (e) { if (e instanceof UsageError) { err(`✗ ${e.message}\n${USAGE}`); return 2; } throw e; }
  const [cmd, rawSym, arg] = o._;
  if (!CMDS[cmd] || !rawSym) { err(USAGE); return 2; }
  if (o.light && cmd !== 'save') { err(`✗ --light ใช้กับ save เท่านั้น\n${USAGE}`); return 2; }
  const sym = rawSym.toUpperCase();
  if (!SYM_RE.test(sym)) { err(`✗ symbol ไม่ถูกรูป: ${rawSym}`); return 2; }
  const c = {
    sym, arg, log, err, force: o.force, light: o.light, today: o.today || todayBangkok(),
    reportsDir: o.reportsDir || RS.REPORTS_DIR, workDir: o.workDir || path.join(ROOT, '.work'),
    prepDir: () => o.prepDir || require('./queue/state.js').PREP_DIR,   // lazy — state.js ถาม git ตอน require
    seedsFile: o.seeds || path.join(ROOT, 'tools', 'seeds.json'),
  };
  try { return CMDS[cmd](c); }
  catch (e) { err(`✗ ${String(e.message).split('\n')[0]}`); return 1; }
}

module.exports = { run, draftFromSidecar, diffPaths, lightViolations, errorLines };
if (require.main === module) process.exitCode = run(process.argv.slice(2));
