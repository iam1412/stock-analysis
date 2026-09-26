'use strict';
/**
 * remigrate.js — display-fix (เจ้าของ 26 ก.ย. 69: ทุกใบที่ย้าย v2 → v3 ต้อง "แสดงข้อมูลเท่าหน้า v2")
 *   remigrate <SYM…|--all-failing <audit.csv>> [--reports-dir D] [--v2-repo DIR] [--write] [--today YYYY-MM-DD]
 *   ต่อใบ v3 ที่มี meta.migratedFrom:
 *     v2   = reports/<SYM>.html ใน commit สุดท้ายที่ยังมีไฟล์ (audit.v2Source · --v2-repo = repo อื่นที่มีประวัติ เช่นเมื่อ reports-dir เป็นสำเนาชั่วคราว)
 *     ผู้สมัคร (ตามลำดับ): fresh = migrator ที่แก้แล้ว (migrateOne บนหน้า v2 ใน temp dir)
 *                         graft = ใบเดิม + v2Display ของ fresh (ใบที่ worker ถอดความไว้ — ถ้อยคำของ worker ไม่หาย)
 *     ทั้งสองใช้ market ปัจจุบันของใบเดิม (cron) + meta.migratedFrom เดิม (updated · v2Hash) + prevHash = hash ของใบเดิมในแถว manifest
 *       ⇒ build คง updated ของ v2 (build.updatedFor) — การถอดใหม่ไม่ใช่งานวิเคราะห์ใหม่
 *     เขียนเมื่อผ่านครบ: audit สะอาด (valueDiffs 0 · sanity ผ่าน · textLost ไม่มากกว่าใบเดิม) · checkDoc 0 error (วันนี้)
 *       · ราคาอื่น (×0.8 · ×1.25) ไม่มี error ใหม่ที่ใบเดิมไม่มี (cron ต้องเขียนราคาต่อได้)
 *   พิมพ์ต่อใบ: FIXED (fresh|graft) · STILL-FAILING <เหตุผล> · SKIP
 *   ★ --write ใส่ reports/ ของ checkout ต้อง MIGRATE_V3_ALLOW_REAL=1 (เหมือน convert/adopt) · ไม่ --write = ตรวจอย่างเดียว
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const IO = require('../v3/io.js');
const S = require('../v3/schema.js');
const AU = require('./audit.js');

const checkDocOf = () => require('../../test/check-v3.js').checkDoc;
const PERTURB = [0.8, 1.25];

/** แถว manifest (symbol → {hash, updated}) ของ HEAD ใน repo ของ reportsDir · อ่านไม่ได้ = Map ว่าง */
function headRows(reportsDir) {
  try {
    const dir = fs.realpathSync.native(reportsDir);
    const env = { ...process.env }; for (const k of AU.GIT_SCRUB) delete env[k];
    const top = cp.execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'rev-parse', '--show-toplevel'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const txt = cp.execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'show', 'HEAD:reports.json'], { cwd: top, env, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return new Map(JSON.parse(txt).filter((r) => r && r.symbol).map((r) => [String(r.symbol).toUpperCase(), r]));
  } catch (e) { return new Map(); }
}

/** error id ของ gate ที่ราคา px × k (ราคาจุดสุดท้ายของกราฟขยับตาม — เหมือน cron) */
function gateAt(doc, k, o) {
  const px = Math.round(doc.market.px * k * 100) / 100;
  const data = doc.market.chart.data.map((p, i, a) => (i === a.length - 1 ? [p[0], px] : p));
  const d = k === 1 ? doc : { ...doc, market: { ...doc.market, px, chart: { ...doc.market.chart, data } } };
  try { return checkDocOf()(d, { skipSig: true, seeds: o.seeds, today: o.today }).errors; }
  catch (e) { return [{ id: 'THROW', msg: String(e.message).split('\n')[0] }]; }
}
const ids = (errs) => new Set(errs.map((e) => e.id));

/** v2Display ของ fresh → ใบเดิม (เฉพาะส่วนที่โครงของใบเดิมรับได้) · คืน null เมื่อไม่มีอะไรให้ต่อ */
function graftOf(existing, fresh) {
  const vd = fresh && fresh.v2Display;
  if (!vd) return null;
  const { _sig, ...doc } = existing;
  const x = {};
  for (const k of ['fv', 'fvRange', 'targets', 'driverEnds', 'gauge', 'footer']) if (vd[k] != null) x[k] = vd[k];
  // display-fix2: ข้อความขา context (ช่วง/ขีด) — ขาเดียวกันเท่านั้น
  if (vd.legTexts && Array.isArray(doc.legs) && doc.legs.length === vd.legTexts.length && vd.legTexts.every((t, i) => t == null || (doc.legs[i] && doc.legs[i].role === 'context'))) x.legTexts = vd.legTexts;
  if (vd.legValues && Array.isArray(doc.legs) && doc.legs.length === vd.legValues.length
    && doc.legs.every((l, i) => !fresh.legs[i] || l.method === fresh.legs[i].method)) x.legValues = vd.legValues;
  let metrics = doc.metrics;
  if (vd.cards) {
    const keys = new Set((doc.metrics.cards || []).map((c) => (c && typeof c === 'object' ? c.key : c)));
    const cards = Object.fromEntries(Object.entries(vd.cards).filter(([k]) => keys.has(k)));
    if (Object.keys(cards).length) {
      x.cards = cards;
      if (doc.metrics.notes) {
        const notes = { ...doc.metrics.notes };
        for (const k of Object.keys(cards)) delete notes[k];
        metrics = { ...doc.metrics };
        if (Object.keys(notes).length) metrics.notes = notes; else delete metrics.notes;
      }
    }
  }
  let scenarios = doc.scenarios;
  // ผลตอบแทนฉาก: ฐานปันผลต้องเท่าฐานที่ cron v2 พิมพ์ข้อความนั้น (เหมือน assemble) — ต่างแล้วปรับได้เมื่อไม่ต้องเพิ่มปันผลที่ใบไม่มี
  const divOk = vd.rets && (vd.rets.div === !!doc.scenarios.divIncluded || !vd.rets.div || doc.scenarios.cases.every((c) => c.divCum != null));
  if (vd.rets && divOk) {
    x.rets = vd.rets;
    scenarios = { ...doc.scenarios, cases: doc.scenarios.cases.map(({ retNote, ...c }) => c), divIncluded: vd.rets.div };
  }
  // ตัวตั้งปลายฉากเป็นยอดรวม (CPNG/NET): ฐานต่อหุ้นต้องเป็นของ fresh (ใบเดิมอาจถอดฐานจากยอดรวมเป็น "ต่อหุ้น" — NET 2.51392) · driver ต่างกัน = ไม่ต่อ
  if (vd.driverTotal && fresh.scenarios && doc.scenarios && fresh.scenarios.driver === doc.scenarios.driver) {
    x.driverTotal = true;
    const { baseOverride, ...rest } = scenarios;
    scenarios = fresh.scenarios.baseOverride ? { ...rest, baseOverride: fresh.scenarios.baseOverride } : rest;
  }
  // display-fix2: เซลล์หมวด 6 ของผู้เขียน — ฉากต้องเป็นของ fresh (growth/ตัวคูณที่ไม่มี · ไม่มีฐานที่ถอดกลับ · หัว §6 ทั้งท่อน)
  if (vd.s6 && fresh.scenarios) {
    x.s6 = vd.s6;
    if (vd.noBase) x.noBase = true;
    scenarios = { ...fresh.scenarios, cases: fresh.scenarios.cases.map((c, i) => ({ ...c, desc: (doc.scenarios.cases[i] || {}).desc != null ? doc.scenarios.cases[i].desc : c.desc })), note: doc.scenarios.note };
  }
  if (!Object.keys(x).length) return null;
  return { ...doc, metrics, scenarios, v2Display: x };
}

/** ใบเดียว → { sym, result, via, why[], doc, row } · ไม่ throw */
// ใบที่ controller สั่งคงไว้ (คำตัดสิน 26 ก.ย. 69 round 2): ใบที่ worker ถอดเองดีกว่าผล remigrate — ไม่แตะ
const EXCLUDED = { ABT: 'controller ruling: keep worker transcription', UNP: 'controller ruling: keep worker transcription' };
function remigrateOne(sym, o, env) {
  const out = { sym, result: 'STILL-FAILING', via: null, why: [], doc: null };
  if (EXCLUDED[sym]) { out.result = 'SKIP'; out.why.push(EXCLUDED[sym]); return out; }
  const file = path.join(o.reportsDir, sym + '.json');
  let existing;
  try { existing = IO.read(file); } catch (e) { out.result = 'SKIP'; out.why.push(`อ่าน ${sym}.json ไม่ได้ — ${String(e.message).split('\n')[0]}`); return out; }
  const mf0 = existing.meta && existing.meta.migratedFrom;
  if (!mf0) { out.result = 'SKIP'; out.why.push('ไม่มี meta.migratedFrom (ใบ v3 ต้นฉบับ ไม่ใช่ใบ migrate)'); return out; }
  let src;
  try { src = o.v2Of ? o.v2Of(sym) : AU.v2Source(sym, o.reportsDir); } catch (e) { out.why.push(`หน้า v2: ${String(e.message).split('\n')[0]}`); return out; }
  const aOpts = { seeds: o.seeds };
  const exRow = AU.auditDoc(sym, existing, src, aOpts);
  const exGate = PERTURB.map((k) => ids(gateAt(existing, k, o)));
  // fresh: migrator ที่แก้แล้วบนหน้า v2 (temp dir — migrateOne อ่าน <dir>/<SYM>.html)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'remigrate-'));
  let fresh = null, m = null;
  try {
    fs.writeFileSync(path.join(tmp, sym + '.html'), src.raw);
    m = env.migrateOne(sym, { reportsDir: tmp, noStale: true, seeds: o.seeds, manifest: new Map([[sym, mf0.updated]]), stats: { apxMs: 0 } });
    if (m.doc) fresh = m.doc;
  } catch (e) { out.why.push(`migrator: ${String(e.message).split('\n')[0]}`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const row = o.rows && o.rows.get(sym);
  const prevHash = row && /^[0-9a-f]{12}$/.test(row.hash || '') && row.hash !== mf0.v2Hash ? row.hash : IO.freshHash(existing);
  const mf = { updated: mf0.updated, v2Hash: mf0.v2Hash, prevHash };
  const cands = [];
  if (fresh) cands.push({ via: 'fresh', doc: { ...fresh, market: existing.market, meta: { ...fresh.meta, migratedFrom: mf } } });
  else out.why.push(`fresh: migrator ไม่ได้ doc (${m && m.failed || '?'})`);
  const g = graftOf(existing, fresh);
  if (g) cands.push({ via: 'graft', doc: { ...g, meta: { ...g.meta, migratedFrom: mf } } });
  for (const c of cands) {
    const why = [];
    const errs = S.validate(c.doc);
    if (errs.length) { out.why.push(`${c.via}: schema ${errs[0].path}: ${errs[0].msg}`); continue; }
    const r = AU.auditDoc(sym, c.doc, src, aOpts);
    if (r.valueDiffs) why.push(`valueDiffs ${r.valueDiffs} (${r.values.slice(0, 2).map((x) => `${x.zone}: ${x.del} → ${x.ins}`).join(' · ')})`);
    if (r.sanity.length) why.push(`sanity: ${r.sanity.join(' · ')}`);
    if (r.textLost > exRow.textLost) why.push(`textLost ${r.textLost} > current ${exRow.textLost}`);
    const g0 = gateAt(c.doc, 1, o);
    if (g0.length) why.push(`checkDoc ${g0.map((e) => `${e.id} ${String(e.msg).slice(0, 90)}`).join(' ; ')}`);
    PERTURB.forEach((k, i) => { const nw = [...ids(gateAt(c.doc, k, o))].filter((id) => !exGate[i].has(id)); if (nw.length) why.push(`gate at price ×${k}: new ${nw.join(',')}`); });
    if (!why.length) { out.result = 'FIXED'; out.via = c.via; out.doc = c.doc; out.row = r; out.why = []; break; }
    out.why.push(`${c.via}: ${why.join(' | ')}`);
  }
  out.before = { status: exRow.status, valueDiffs: exRow.valueDiffs };
  return out;
}

/** audit.csv (รูปของ audit --out) → symbols ที่ไม่ OK */
function failingOf(csvText) {
  const lines = String(csvText).split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(',');
  const iS = head.indexOf('symbol'), iT = head.indexOf('status');
  if (iS < 0 || iT < 0) throw new Error('audit csv ต้องมีคอลัมน์ symbol,status');
  return lines.map((l) => l.split(',')).filter((c) => c[iT] && c[iT] !== 'OK' && c[iT] !== 'SKIP').map((c) => c[iS].toUpperCase());
}

/** CLI — env = { migrateOne, isGuarded } จาก migrate-v3.js (ไม่ require วงกลับ) · คืน exit code (1 = มีใบที่ยังไม่ผ่าน) */
function runRemigrate(syms, opts, log, env) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  if (opts.write && env.isGuarded(opts.reportsDir) && process.env.MIGRATE_V3_ALLOW_REAL !== '1') {
    say('✗ remigrate --write ใส่ reports/ จริงถูกปฏิเสธ — ต้องตั้ง MIGRATE_V3_ALLOW_REAL=1 (เหมือน convert/adopt)');
    return { code: 1, res: [] };
  }
  const o = { reportsDir: opts.reportsDir, seeds: opts.seeds, today: opts.today || require('../queue/footer-date.js').todayBangkok(), rows: opts.rows || headRows(opts.reportsDir) };
  if (opts.v2Repo) o.v2Of = (sym) => AU.v2Source(sym, path.join(path.resolve(opts.v2Repo), 'reports'));
  if (opts.v2Of) o.v2Of = opts.v2Of;
  const res = [];
  for (const sym of syms) {
    const r = remigrateOne(sym, o, env);
    if (r.result === 'FIXED' && opts.write) IO.write(path.join(o.reportsDir, sym + '.json'), r.doc);
    res.push(r);
    if (r.result === 'FIXED') say(`FIXED ${sym} (${r.via}${opts.write ? '' : ' · dry-run — not written'}) · before ${r.before.status}${r.before.valueDiffs ? ` ${r.before.valueDiffs}` : ''}`);
    else say(`${r.result} ${sym} · ${r.why.join(' ‖ ')}`);
  }
  const n = (k) => res.filter((r) => r.result === k).length;
  say(`remigrate: ${res.length} ใบ · FIXED ${n('FIXED')} (fresh ${res.filter((r) => r.via === 'fresh').length} · graft ${res.filter((r) => r.via === 'graft').length}) · STILL-FAILING ${n('STILL-FAILING')} · SKIP ${n('SKIP')}${opts.write ? '' : ' · dry-run (ไม่ได้เขียน — ใส่ --write)'}`);
  return { code: n('STILL-FAILING') ? 1 : 0, res };
}

module.exports = { EXCLUDED, runRemigrate, remigrateOne, graftOf, failingOf, headRows, gateAt };
