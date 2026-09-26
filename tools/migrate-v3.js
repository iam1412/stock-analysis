#!/usr/bin/env node
'use strict';
/**
 * migrate-v3.js — CLI ของ migrator ใบ v2 → v3 (Plan 4b Task 7 · spec §10)
 *   sweep   [--reports-dir D] [--only SYM…] [--limit N] [--no-stale] [--head-manifest FILE] [--out PATHBASE]
 *           อ่านอย่างเดียว — ทุกใบ v2 ผ่าน parse → assemble → compute → render → equiv → bucket แล้วเขียน PATHBASE.md + .csv
 *   convert <SYM> [--reports-dir D] [--write] [--accept-drift] [--head-manifest FILE] [--no-stale]
 *           exit 0 CLEAN · 2 VALUE-DRIFT · 1 HUMAN/error · --write: HUMAN ปฏิเสธ (1) · VALUE-DRIFT ต้อง --accept-drift (2)
 *           เขียน = IO.write(<SYM>.json) → ลบ <SYM>.html → checkDoc ต้อง 0 error ไม่งั้นคืน .html + ลบ .json (exit 1)
 *   batch   <table.csv> --class CLEAN|<driftClass…> --model sonnet|opus [--n N] [--dry-run] [--no-push] [--head-manifest FILE]
 *           ตาราง = csv รูปเดียวกับ sweep ที่ advisor อนุมัติ · migrate ใหม่แล้วเทียบ bucket/driftClass (ต่าง = ปฏิเสธ · exit 3)
 *           CLEAN ≤50 ใบ/commit · VALUE-DRIFT 1 ใบ/commit · convert → build → ship --migrate --no-push → verify + push ทุก N commit
 *   draft   <SYM> [--work-dir .work] [--force] [--reports-dir D] [--head-manifest FILE] [--today YYYY-MM-DD]   (Plan 4c-transcribe)
 *           migrateOne ทุกถัง (รวม HUMAN) → <work>/<SYM>.json (คีย์ของ worker · คง meta.migratedFrom) + <SYM>.brief.md (เหตุผล + ตัวเลขหลักของ v2)
 *   adopt   <SYM> [--doc <work>/<SYM>.json] [--reports-dir D] [--head-manifest FILE] [--today YYYY-MM-DD] [--accept-drift]
 *           guard เดียวกับ convert --write · merge market ของ migrator → checkDoc 0 error + ตัวเลขหลักตรง v2 (การปัดที่พิมพ์) → เขียน .json ลบ .html
 *           --accept-drift: FV · FV low/high · เป้า 3 ฉาก · MOS คลาดได้ ≤ 1 หน่วยของหลักสุดท้ายที่ v2 พิมพ์ (verdict ต้องเท่ากัน) · พิมพ์ drift list
 *           equivalence gate = ข้อมูลเท่านั้น · ตรรกะ = tools/migrate-v3/transcribe.js
 *   audit   [<SYM>…] [--all] [--out PATHBASE] [--reports-dir D] [--v2-repo DIR]   (Plan 4c-audit · อ่านอย่างเดียว · tools/migrate-v3/audit.js)
 *           ใบ v3 ที่มี meta.migratedFrom: v2 สุดท้ายใน git vs v3 render แบบเว็บ (ที่ market ของ v2) ด้วย EQ.compare + sanity บนหน้า v3
 *           → PATHBASE.csv (symbol,status,valueDiffs,roundingDiffs,textLost,sanity) + .md · exit 1 เมื่อมี valueDiffs > 0 หรือ sanity ตก
 *   remigrate <SYM…|--all-failing <audit.csv>> [--reports-dir D] [--v2-repo DIR] [--write] [--today YYYY-MM-DD]   (display-fix · tools/migrate-v3/remigrate.js)
 *           ใบ migrate ที่แสดงค่าไม่เท่าหน้า v2: migrator ที่แก้แล้ว (fresh) หรือใบเดิม + v2Display (graft) · คง meta.migratedFrom (+ prevHash ⇒ updated ไม่ขยับ)
 *           เขียนเฉพาะเมื่อ audit สะอาด + checkDoc 0 error + ราคาอื่นไม่มี error ใหม่ · พิมพ์ FIXED / STILL-FAILING <เหตุผล> · ไม่ --write = ตรวจอย่างเดียว
 *   fix-gauge [<SYM>…] [--reports-dir D] [--write]   (display-fix2 · tools/migrate-v3/fix-gauge.js)
 *           ใบ migrate ที่ v2Display.gauge แช่ค่าตลาดเป็นข้อความ (ราคา · 52 สัปดาห์ — schema ปฏิเสธแล้ว) → ref สด px/hi52w/lo52w · คง updated (prevHash)
 * ★ convert --write / adopt ต้องผ่าน display audit ด้วย (valueDiffs 0 · sanity ผ่าน — audit.auditDoc เทียบหน้า v2 ที่ market ของหน้า v2)
 * ★ --write ใส่ reports/ จริงต้องมี env MIGRATE_V3_ALLOW_REAL=1 (Plan 4c ตั้ง · PR นี้ไม่ตั้งนอก scratch rehearsal)
 * ★ นาฬิกา gate: sweep / convert dry-run = values.priceDate ของใบ (ไม่ขึ้นกับวันนี้ — E27 ไม่ใช่คุณสมบัติของการ migrate)
 *   · convert --write = วันนี้ (Asia/Bangkok) เหมือน npm run verify · --today YYYY-MM-DD แทนได้ (review T7 M-4)
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_REPORTS = path.join(ROOT, 'reports');
const B = require('../build.js');
const R = require('../_template/v3/render.js');
const C = require('./v3/compute.js');
const IO = require('./v3/io.js');
const RS = require('./report-source.js');
const FD = require('./queue/footer-date.js');
const PV = require('./migrate-v3/parse-v2.js');
const A = require('./migrate-v3/assemble.js');
const EQ = require('./migrate-v3/equiv.js');
const BK = require('./migrate-v3/buckets.js');
const AP = require('./migrate-v3/analysis-px.js');
const RP = require('./migrate-v3/report.js');
const BT = require('./migrate-v3/batch.js');
const TR = require('./migrate-v3/transcribe.js');
const AU = require('./migrate-v3/audit.js');
const RMG = require('./migrate-v3/remigrate.js');

class UsageError extends Error {}
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv) {
  const VAL = { '--reports-dir': 'reportsDir', '--head-manifest': 'headManifest', '--out': 'out', '--limit': 'limit', '--today': 'today', '--n': 'n', '--model': 'model', '--work-dir': 'workDir', '--doc': 'doc', '--all-failing': 'allFailing', '--v2-repo': 'v2Repo' };
  const o = { _: [], only: null, write: false, acceptDrift: false, noStale: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VAL[a]) { if (argv[i + 1] == null) throw new UsageError(`${a} ต้องมีค่า`); o[VAL[a]] = argv[++i]; }
    else if (a === '--only') { o.only = o.only || []; while (argv[i + 1] != null && !argv[i + 1].startsWith('--')) o.only.push(argv[++i].toUpperCase()); if (!o.only.length) throw new UsageError('--only ต้องมีอย่างน้อย 1 symbol'); }
    else if (a === '--class') { o.classes = o.classes || []; while (argv[i + 1] != null && !argv[i + 1].startsWith('--')) o.classes.push(argv[++i]); if (!o.classes.length) throw new UsageError('--class ต้องมีอย่างน้อย 1 ชั้น (CLEAN หรือ driftClass)'); }
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--no-push') o.noPush = true;
    else if (a === '--write') o.write = true;
    else if (a === '--accept-drift') o.acceptDrift = true;
    else if (a === '--no-stale') o.noStale = true;
    else if (a === '--force') o.force = true;
    else if (a === '--all') o.all = true;
    else if (a.startsWith('--')) throw new UsageError(`ไม่รู้จักตัวเลือก ${a}`);
    else o._.push(a);
  }
  if (o.limit != null && !/^\d+$/.test(o.limit)) throw new UsageError('--limit ต้องเป็นจำนวนเต็ม');
  if (o.limit != null) o.limit = +o.limit;
  if (o.n != null && !/^[1-9]\d*$/.test(o.n)) throw new UsageError('--n ต้องเป็นจำนวนเต็ม ≥ 1');
  o.n = o.n != null ? +o.n : 1;
  if (o.today != null && !ISO_RE.test(o.today)) throw new UsageError('--today ต้องเป็น YYYY-MM-DD');
  o.reportsDir = path.resolve(o.reportsDir || REAL_REPORTS);
  return o;
}

const seedsOf = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
// ★ realpathSync.native = ตัวพิมพ์ตามดิสก์ (APFS ไม่สนตัวพิมพ์ — realpathSync ของ JS คืนตัวพิมพ์ที่ผู้ใช้พิมพ์ ⇒ …/REPORTS หลุด guard · review I-1)
const realpath = (p) => { try { return fs.realpathSync.native(p); } catch (e) { return path.resolve(p); } };
const sameInode = (a, b) => { try { const x = fs.statSync(a), y = fs.statSync(b); return x.dev === y.dev && x.ino === y.ino; } catch (e) { return false; } };
/** reports/ ของ checkout นี้ — เทียบ path · realpath.native · dev+ino (ครอบตัวพิมพ์ · symlink · hard/bind alias) */
const isRealReports = (dir) => path.resolve(dir) === REAL_REPORTS || realpath(dir) === realpath(REAL_REPORTS) || sameInode(dir, REAL_REPORTS);
/** reports/ ที่ git ติดตามของ checkout ใดก็ได้ (review M-1): โฟลเดอร์ชื่อ reports ที่แม่มี reports.json + build.js · หรือ git prefix = reports/ */
function isCheckoutReports(dir) {
  const real = realpath(dir);
  if (path.basename(real).toLowerCase() === 'reports') {
    const parent = path.dirname(real);
    if (fs.existsSync(path.join(parent, 'reports.json')) && fs.existsSync(path.join(parent, 'build.js'))) return true;
  }
  try {
    if (!fs.statSync(real).isDirectory()) return false;
    const pre = cp.execFileSync('git', ['-C', real, 'rev-parse', '--show-prefix'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return pre.toLowerCase() === 'reports/';
  } catch (e) { return false; }
}
const isGuarded = (dir) => isRealReports(dir) || isCheckoutReports(dir);

/** symbol → updated ของแถว manifest ที่ commit แล้ว (--head-manifest FILE หรือ git show HEAD:reports.json) */
function loadManifest(file) {
  let txt;
  if (file) txt = fs.readFileSync(file, 'utf8');
  else {
    try { txt = cp.execFileSync('git', ['show', 'HEAD:reports.json'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
    catch (e) { process.stderr.write('⚠ migrate-v3: อ่าน git show HEAD:reports.json ไม่ได้ — ไม่มีแถว manifest ⇒ meta.migratedFrom จะว่าง (ใช้ --head-manifest FILE)\n'); txt = '[]'; }
  }
  const rows = JSON.parse(txt);
  return new Map((Array.isArray(rows) ? rows : []).filter((r) => r && r.symbol).map((r) => [String(r.symbol).toUpperCase(), r.updated || null]));
}

const words = (html) => EQ.tok(EQ.text(String(html || ''))).filter(EQ.isWord).map(EQ.wordOf);
const first = (re, s) => { const m = re.exec(String(s || '')); return m ? m[1] : ''; };

/** ใบเดียว: ท่อเดียวกับ Task 6 test (migrate()) · ไม่ throw — ความล้มเหลวก่อน compare = HUMAN + เหตุผล */
function migrateOne(sym, o) {
  const dir = o.reportsDir, file = path.join(dir, sym + '.html');
  const raw = fs.readFileSync(file, 'utf8');
  const res = { sym, raw, file, parsed: null, doc: null, notes: { H: [], D: [], F: [] }, meta: null, view: null, eq: null, failed: null, apx: null, today: null };
  let stage = 'parse';
  try {
    res.parsed = PV.parseV2(sym, raw);
    const fd = res.parsed.fd;
    if (!o.noStale && isRealReports(dir)) { const t0 = Date.now(); res.apx = AP.analysisPx(sym, fd && fd.raw, { root: ROOT }); o.stats.apxMs += Date.now() - t0; }
    res.today = res.parsed.rd && res.parsed.rd.values ? res.parsed.rd.values.priceDate : null;
    stage = 'assemble';
    const r = A.assemble(res.parsed, { seeds: o.seeds, headUpdated: o.manifest.get(sym.toUpperCase()) || null, v2Hash: B.freshHash(raw), today: res.today, analysisPx: res.apx });
    res.doc = r.doc; res.notes = r.notes; res.meta = r.meta;
    stage = 'compute';
    res.view = C.compute(res.doc, { seeds: o.seeds });
    stage = 'render';
    const v2 = B.expandReport(raw), v3 = B.expandReport(R.toV2Source(res.doc, res.view));
    stage = 'compare';
    res.eq = EQ.compare(v2, v3, res.doc, res.view, { v2src: raw });
  } catch (e) {
    res.failed = `${stage}: ${String(e && e.message || e).split('\n')[0]}`;
  }
  if (res.failed) { res.bucket = 'HUMAN'; res.reasons = [`failed before compare — ${res.failed}`, ...res.notes.H, ...res.notes.D.map((d) => 'D: ' + d)]; }
  else { const b = BK.bucketOf(res.notes, res.eq); res.bucket = b.bucket; res.reasons = b.reasons; }
  return res;
}

/** ผลต่อใบ → แถวตาราง sweep (tools/migrate-v3/report.js) */
function rowOf(m, o) {
  const eq = m.eq || { textLost: [], textLostAt: [], numberValue: [], rd: [] };
  const doc = m.doc || {};
  const cur = m.parsed && m.parsed.sm && m.parsed.sm.currency;
  const market = doc.region || (cur === 'THB' ? 'TH' : cur ? 'US' : '?');
  const stale = m.notes.D.map((d) => /^prose stale copies ×(\d+)/.exec(d)).find(Boolean);
  const gaugeF = eq.rd.filter((r) => /^gauge\.(min|max)$/.test(r.path)).map((r) => `rd/sm ${r.path}: ${r.v2} → ${r.v3}`);
  const items = eq.rd.filter((r) => !/^gauge\.(min|max)$/.test(r.path)).map((r) => ({ path: r.path, v2: r.v2, v3: r.v3 })).concat(m.notes.D.map(RP.noteItem));
  // เพดานการ์ด custom (4 · ใบ migrate 8 — S.customCap): HUMAN ด้วยเหตุนี้อย่างเดียว = H note อื่นไม่มี และ TEXT LOST ทุกคำมาจากการ์ดที่ถูกตัด
  let capOnly = false;
  const cap = m.notes.H.find((r) => /^custom cards \d+ > \d+ — dropped /.test(r));
  if (m.bucket === 'HUMAN' && !m.failed && cap && m.notes.H.length === 1 && !(eq.colour && eq.colour.keys && eq.colour.keys.length)) {
    const labels = [...cap.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    const pool = new Set(m.parsed.s1cards.filter((c) => labels.includes(c.k)).flatMap((c) => words(`${c.kHtml} ${c.vHtml} ${c.dHtml}`)));
    capOnly = eq.textLost.every((w) => pool.has(w));
  }
  // คำถามเจ้าของ: คำที่หาย (ในโซนเดียวกัน — textLostAt) อยู่ใน gdots (header) · legend (s2) · vcell ที่ 3+ (s8) ของ v2
  const lostAt = (zone) => new Set((eq.textLostAt || []).filter((x) => x.zone === zone).map((x) => x.w));
  const hit = (zone, ws) => { const L = lostAt(zone); return ws.some((w) => L.has(w)); };
  const raw = m.raw;
  const lostIn = eq.textLost.length ? {
    gdots: hit('header', words(first(/<div class="gdots">([\s\S]*?)<\/div>/, raw))),
    legend: hit('s2', words(first(/<div class="legend">([\s\S]*?)<\/div>/, raw))),
    vcell3: !!(m.parsed && m.parsed.s8 && m.parsed.s8.vcells.length > 2 && hit('s8', m.parsed.s8.vcells.slice(2).flatMap(([k, v]) => words(`${k} ${v}`)))),
  } : { gdots: false, legend: false, vcell3: false };
  return {
    symbol: m.sym, market, bucket: m.bucket, reasons: m.reasons,
    legs: (doc.legs || []).length, fvLegs: (doc.legs || []).filter((l) => (l.role || 'fv') === 'fv').length,
    textLost: eq.textLost.length, numberValue: eq.numberValue.length, rdRows: eq.rd.length,
    proseStale: o.noStale ? null : stale ? +stale[1] : 0,
    customCards: m.meta && Array.isArray(m.meta.cards) ? m.meta.cards.filter((c) => !c.key).length : 0,
    fNotes: m.notes.F.concat(gaugeF), items, failed: m.failed, capOnly, lostIn, apx: m.apx,
  };
}

function ctxOf(o) {
  return { ...o, seeds: o.seeds || seedsOf(), manifest: o.manifest || loadManifest(o.headManifest), stats: o.stats || { apxMs: 0 } };
}

/** sweep — อ่านอย่างเดียว · คืน { rows, code } */
function runSweep(opts, log) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  const outDir = path.dirname(path.resolve(opts.out || path.join(ROOT, 'docs', 'x')));
  // final-review M-2: บรรพบุรุษใดก็ได้ของ --out เป็น reports/ = ปฏิเสธ (writeSweep mkdir -p จะสร้าง reports/sub/ ให้)
  const ancestors = []; for (let d = outDir; ; d = path.dirname(d)) { ancestors.push(d); if (path.dirname(d) === d) break; }
  if (ancestors.some(isGuarded)) { say(`✗ sweep: --out ชี้เข้า reports/ (${outDir}) — sweep เป็น read-only ห้ามเขียนลง reports/`); return { rows: [], code: 1 }; }
  const o = ctxOf(opts);
  let syms = RS.list(o.reportsDir).filter((e) => !e.v3).map((e) => e.symbol);
  if (o.only) { const want = new Set(o.only); syms = syms.filter((s) => want.has(s.toUpperCase())); }
  if (o.limit != null) syms = syms.slice(0, o.limit);
  const rows = [];
  const t0 = Date.now();
  syms.forEach((sym, i) => {
    rows.push(rowOf(migrateOne(sym, o), o));
    if ((i + 1) % 50 === 0) process.stderr.write(`… ${i + 1}/${syms.length} (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
  });
  const date = FD.todayBangkok();
  const outBase = path.resolve(o.out || path.join(ROOT, 'docs', 'superpowers', 'specs', `${date}-v3-migration-sweep`));
  // provenance (review M-5): git describe --dirty ⇒ md บอกได้ว่ารันจากโค้ดที่ commit แล้วหรือยัง
  let head = '?';
  try { head = cp.execFileSync('git', ['describe', '--always', '--dirty'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { /* ไม่ใช่ git */ }
  const apxRows = rows.filter((r) => r.apx);
  const files = RP.writeSweep(rows, {
    out: outBase, head, date, noStale: !!o.noStale || !isRealReports(o.reportsDir), outRel: outBase.startsWith(ROOT + path.sep) ? path.relative(ROOT, outBase) : outBase,
    apxFound: apxRows.length, apxMs: o.stats.apxMs, apxBulk: apxRows.filter((r) => r.apx.commit.startsWith(AP.BULK_FOOTER_COMMIT)).length, bulkCommit: AP.BULK_FOOTER_COMMIT,
  });
  const n = (b) => rows.filter((r) => r.bucket === b).length;
  const lostClean = rows.filter((r) => r.bucket === 'CLEAN' && r.textLost > 0).length;
  say(`sweep: ${rows.length} ใบ · CLEAN ${n('CLEAN')} · VALUE-DRIFT ${n('VALUE-DRIFT')} · HUMAN ${n('HUMAN')} · TEXT LOST ใน CLEAN ${lostClean}`);
  say(`  failed before compare (นับใน HUMAN): ${rows.filter((r) => r.failed).length} · ${((Date.now() - t0) / 1000).toFixed(1)} s (analysis-px ${(o.stats.apxMs / 1000).toFixed(1)} s)`);
  const shown = (f) => (f.startsWith(ROOT + path.sep) ? path.relative(ROOT, f) : f);
  say(`  → ${shown(files.md)} · ${shown(files.csv)}`);
  return { rows, code: lostClean ? 1 : 0 };
}

/** convert — ใบเดียว · คืน exit code · deps.checkDoc ให้เทสต์จำลอง gate ตกได้ */
function runConvert(symIn, opts, log, deps) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  const d = deps || {};
  const sym = String(symIn || '').trim().toUpperCase();
  if (!sym) throw new UsageError('convert ต้องมี <SYM>');
  if (opts.write && isGuarded(opts.reportsDir) && process.env.MIGRATE_V3_ALLOW_REAL !== '1') {
    say(`✗ ${sym}: --write ใส่ reports/ จริงถูกปฏิเสธ — ต้องตั้ง MIGRATE_V3_ALLOW_REAL=1 (Plan 4c เท่านั้น)`);
    return 1;
  }
  const o = ctxOf(opts);
  let kind;
  try { kind = RS.kindOf(sym, o.reportsDir); } catch (e) { say(`✗ ${sym}: ${e.message}`); return 1; }
  if (kind === 'v3') { say(`✗ ${sym}: เป็นใบ v3 แล้ว (already v3) — ไม่มีอะไรให้ migrate`); return 1; }
  if (kind !== 'v2') { say(`✗ ${sym}: ไม่พบ ${path.join(o.reportsDir, sym + '.html')}`); return 1; }
  const m = migrateOne(sym, o);
  say(`${sym}: ${m.bucket}`);
  for (const r of m.reasons) say(`  - ${r}`);
  if (m.eq) say(`  eq: textLost ${m.eq.textLost.length} · numberValue ${m.eq.numberValue.length} · numberRounding ${m.eq.numberRounding.length} · rd ${m.eq.rd.length} · moved ${m.eq.moved.length} · templateDropped ${m.eq.templateDropped.length}`);
  const code = m.bucket === 'CLEAN' ? 0 : m.bucket === 'VALUE-DRIFT' ? 2 : 1;
  if (!o.write) return code;
  if (m.bucket === 'HUMAN') { say(`✗ ${sym}: HUMAN — --write ปฏิเสธ (ต้องให้คนแก้ก่อน · --accept-drift ไม่ครอบ HUMAN)`); return 1; }
  if (m.bucket === 'VALUE-DRIFT' && !o.acceptDrift) { say(`✗ ${sym}: VALUE-DRIFT — --write ต้องมี --accept-drift`); return 2; }
  // review M-3: ไม่มีแถว manifest = migratedFrom ว่าง ⇒ build ประทับ updated ใหม่ — ยอมเฉพาะเมื่อผู้ใช้ส่ง --head-manifest มาเอง
  if (!o.headManifest && !o.manifest.get(sym)) { say(`✗ ${sym}: ไม่มีแถวใน manifest HEAD:reports.json — --write ปฏิเสธ (ส่ง --head-manifest FILE ถ้าตั้งใจ)`); return 1; }
  // display-fix: หน้า v3 ต้องแสดงค่าเท่าหน้า v2 (display audit — ตัวเดียวกับ audit/remigrate) · ถัง CLEAN/VALUE-DRIFT ไม่พอ
  const da = displayGate(sym, m.doc, m.raw, o.seeds);
  if (da.length) { say(`✗ ${sym}: display audit ไม่ผ่าน — --write ปฏิเสธ (หน้า v3 จะแสดงค่าต่างจากหน้า v2)`); for (const x of da) say(`  ✗ ${x}`); return 1; }
  // review M-4: gate ตอนเขียน = วันนี้ (Asia/Bangkok) เหมือน npm run verify · --today แทนได้ · sweep ยังใช้ priceDate (ไม่ขึ้นกับนาฬิกา)
  const gateDay = o.today || FD.todayBangkok();
  const json = path.join(o.reportsDir, sym + '.json');
  IO.write(json, m.doc);
  fs.unlinkSync(m.file);
  let g;
  try { g = (d.checkDoc || require('../test/check-v3.js').checkDoc)(IO.read(json), { seeds: o.seeds, today: gateDay }); }
  catch (e) { g = { errors: [{ id: 'THROW', msg: String(e.message).split('\n')[0] }] }; }
  if (g.errors.length) {
    fs.writeFileSync(m.file, m.raw);
    fs.unlinkSync(json);
    say(`✗ ${sym}: checkDoc ${g.errors.length} error — คืน ${sym}.html · ลบ ${sym}.json`);
    for (const e of g.errors) say(`  ${e.id}: ${e.msg}`);
    return 1;
  }
  say(`✓ ${sym}: เขียน ${path.basename(json)} · ลบ ${sym}.html · checkDoc 0 error${g.warnings && g.warnings.length ? ` · ${g.warnings.length} warning` : ''} · gate วันที่ ${gateDay}${gateDay !== m.today ? ` (≠ priceDate ${m.today})` : ''}`);
  say('build ทันทีก่อนแก้ — แก้ก่อน build ครั้งแรก = การแก้นั้นไม่ถูกประทับ updated (คง updated ของ v2) (Task 3 · D1)');
  return 0;
}

/** display audit ของ doc ที่กำลังจะเขียน เทียบหน้า v2 (raw) → [เหตุผลที่ตก] · ว่าง = ผ่าน (convert --write / adopt ใช้ตัวเดียวกัน) */
function displayGate(sym, doc, raw, seeds) {
  const r = AU.auditDoc(sym, doc, { raw, ref: 'v2' }, { seeds });
  const out = [];
  if (r.valueDiffs) out.push(`valueDiffs ${r.valueDiffs}: ${r.values.slice(0, 3).map((x) => `${x.zone}: ${x.del} → ${x.ins}`).join(' · ')}`);
  for (const x of r.sanity) out.push(`sanity: ${x}`);
  return out;
}

/** remigrate — display-fix (tools/migrate-v3/remigrate.js) */
function runRemigrateCli(syms, opts, log) {
  if (opts.allFailing && syms.length) throw new UsageError('remigrate: ใช้ <SYM>… หรือ --all-failing <audit.csv> อย่างใดอย่างหนึ่ง');
  const list = opts.allFailing ? RMG.failingOf(fs.readFileSync(opts.allFailing, 'utf8')) : syms.map((x) => String(x).toUpperCase());
  if (!list.length) throw new UsageError('remigrate ต้องมี <SYM>… หรือ --all-failing <audit.csv>');
  return RMG.runRemigrate(list, { ...opts, seeds: opts.seeds || seedsOf() }, log, { migrateOne: (sym, o) => migrateOne(sym, { ...o, stats: o.stats || { apxMs: 0 } }), isGuarded }).code;
}

/** batch — spec §3.7 ฉ · plan 4c-prep D6 · ★ เขียนได้เฉพาะ reports/ ของ checkout นี้ (ship --migrate commit ที่นี่) + env MIGRATE_V3_ALLOW_REAL=1 */
function runBatchCli(tablePath, opts, log) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  if (!opts.classes || !opts.classes.length) throw new UsageError('batch ต้องมี --class CLEAN|<driftClass…>');
  if (!opts.model) throw new UsageError('batch ต้องมี --model sonnet|opus (trailer ของ commit migrate)');
  if (!opts.dryRun) {
    if (!isRealReports(opts.reportsDir)) { say(`✗ batch เขียนได้เฉพาะ reports/ ของ checkout นี้ (ship --migrate commit ที่ ${REAL_REPORTS}) — ใช้ --dry-run กับ --reports-dir อื่น`); return 1; }
    if (process.env.MIGRATE_V3_ALLOW_REAL !== '1') { say('✗ batch: เขียน reports/ จริงต้องตั้ง MIGRATE_V3_ALLOW_REAL=1 (Plan 4c เท่านั้น)'); return 1; }
  }
  const o = ctxOf(opts);
  const rows = BT.readTable(fs.readFileSync(tablePath, 'utf8'));
  const Sh = require('./queue/ship.js');
  const run = (cmd, args) => { const r = cp.spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' }); if (r.status !== 0) throw new Error(`batch: ${cmd} ${args.join(' ')} exit ${r.status}`); };
  const deps = {
    fresh: (sym) => { const m = migrateOne(sym, o); return { bucket: m.bucket, driftClass: RP.driftClass(rowOf(m, o)) }; },
    convert: (sym, acceptDrift) => runConvert(sym, { ...opts, write: true, acceptDrift }, say),
    build: () => run('npm', ['run', 'build']),
    ship: (syms) => Sh.shipMigrate(syms.join(' '), { model: opts.model, noPush: true, skipVerify: true }),
    verify: () => run('npm', ['run', 'verify']),
    push: () => { run('git', ['pull', '--rebase', 'origin', 'main']); run('git', ['push', 'origin', 'HEAD:main']); },
    log: say,
  };
  return BT.runBatch(rows, { classes: opts.classes, n: opts.n || 1, model: opts.model, noPush: !!opts.noPush, dryRun: !!opts.dryRun }, deps).code;
}

/** audit — อ่านอย่างเดียว · --out PATHBASE (ค่าตั้งต้น docs/superpowers/specs/<วันนี้>-v3-display-audit) · ห้ามชี้เข้า reports/ */
function runAuditCli(syms, opts, log) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  if (opts.all && syms.length) throw new UsageError('audit: ใช้ <SYM>… หรือ --all อย่างใดอย่างหนึ่ง');
  const date = FD.todayBangkok();
  const outBase = path.resolve(opts.out || path.join(ROOT, 'docs', 'superpowers', 'specs', `${date}-v3-display-audit`));
  const ancestors = []; for (let d = path.dirname(outBase); ; d = path.dirname(d)) { ancestors.push(d); if (path.dirname(d) === d) break; }
  if (ancestors.some(isGuarded)) { say(`✗ audit: --out ชี้เข้า reports/ (${outBase}) — audit เป็น read-only`); return 1; }
  let head = '?';
  try { head = cp.execFileSync('git', ['describe', '--always', '--dirty'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { /* ไม่ใช่ git */ }
  const reportsRel = opts.reportsDir.startsWith(ROOT + path.sep) ? path.relative(ROOT, opts.reportsDir) : opts.reportsDir;
  const v2Of = opts.v2Repo ? (sym) => AU.v2Source(sym, path.join(path.resolve(opts.v2Repo), 'reports')) : undefined;
  return AU.runAudit(syms, { reportsDir: opts.reportsDir, all: !!opts.all, seeds: opts.seeds || seedsOf(), outBase, v2Of }, say, { date, head, reportsRel }).code;
}

// transcribe.js ใช้ท่อ/guard ชุดเดียวกับ convert (ไม่ require วงกลับ)
const TRANSCRIBE_ENV = { migrateOne, ctxOf, isGuarded, displayGate };

function main(argv) {
  let o;
  try {
    const [cmd, ...rest] = argv;
    o = parseArgs(rest);
    if (cmd === 'sweep') return runSweep(o).code;
    if (cmd === 'convert') { if (o._.length !== 1) throw new UsageError('convert ต้องมี <SYM> ตัวเดียว'); return runConvert(o._[0], o); }
    if (cmd === 'batch') { if (o._.length !== 1) throw new UsageError('batch ต้องมี <table.csv> ตัวเดียว'); return runBatchCli(o._[0], o); }
    if (cmd === 'draft') { if (o._.length !== 1) throw new UsageError('draft ต้องมี <SYM> ตัวเดียว'); return TR.runDraft(o._[0], o, null, TRANSCRIBE_ENV); }
    if (cmd === 'adopt') { if (o._.length !== 1) throw new UsageError('adopt ต้องมี <SYM> ตัวเดียว'); return TR.runAdopt(o._[0], o, null, TRANSCRIBE_ENV); }
    if (cmd === 'audit') return runAuditCli(o._, o);
    if (cmd === 'remigrate') return runRemigrateCli(o._, o);
    if (cmd === 'fix-gauge') return require('./migrate-v3/fix-gauge.js').runFixGauge(o._, o, null, { isGuarded });
    throw new UsageError('ใช้: migrate-v3.js sweep|convert|batch|draft|adopt|audit|remigrate|fix-gauge …');
  } catch (e) {
    if (e instanceof UsageError) { process.stderr.write(`✗ ${e.message}\n`); return 1; }
    process.stderr.write(`✗ ${e.stack || e}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { runSweep, runConvert, runBatchCli, runAuditCli, runRemigrateCli, displayGate, migrateOne, rowOf, parseArgs, loadManifest, isRealReports, isCheckoutReports, isGuarded, ctxOf, main };
