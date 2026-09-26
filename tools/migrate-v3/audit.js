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
 *   textLost = คำของผู้เขียนที่หาย + ตัวเลขที่หายไปกับข้อความ (ต้องเป็น 0 — เจ้าของ 27 ก.ย. 69) · sanity = ไม่มี {{…}} · ไม่มี undefined/NaN/null/TODO · ครบ 8 หมวด · ราคา/วันที่ราคา = market
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
const DV = require('../derived-values.js');
const FD = require('../queue/footer-date.js');

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
    if (r.doc && r.doc.market) {
      // กรอบ 52 สัปดาห์ที่หัวหน้า v2 พิมพ์ปัดแล้ว ("$229–$413") แต่ตัวเลขเต็มของใบ (cron) อยู่ในการปัดนั้น (228.63 · 412.7) = ค่าเดียวกัน
      //   ⇒ ใช้ตัวเลขเต็ม (ป้ายเกจ hi52w ของ CEG ที่ผู้เขียนพิมพ์ "$412.7" ไม่กลายเป็น "$413.00" เพราะการปัดของหัว)
      const a = r.doc.market.range52w, b = doc.market && doc.market.range52w;
      const within = (x, y) => isNum(x) && isNum(y) && Math.abs(x - y) <= 0.5 * Math.pow(10, -((String(x).split('.')[1] || '').length)) * (1 + 1e-9);
      if (a && b && within(a.lo, b.lo) && within(a.hi, b.hi)) return { ...r.doc.market, range52w: { ...b } };
      return r.doc.market;
    }
  } catch (e) { /* ใบ HUMAN — assemble ไม่ครบ ⇒ ใช้ค่าจาก report-data */ }
  const v = parsed.rd.values, ch = parsed.rd.chart || {};
  const chart = { data: ch.data };
  if (ch.gridFmt != null) chart.gridFmt = ch.gridFmt;
  if (ch.dataFmt != null) chart.dataFmt = ch.dataFmt;
  const mk = { px: v.px, priceDate: v.priceDate, chgSuffix: v.chgSuffix, chart };
  if (doc.market && doc.market.range52w) mk.range52w = doc.market.range52w;
  return mk;
}

/**
 * หน้า v2 "ตามที่เว็บแสดง" ที่ราคา snapshot = ต้นฉบับหลัง cron v2 รอบที่ราคานั้น (UP.derivedPassV2 — ตัวเดียวกับ cron จริง)
 *   cron v2 เขียนตัวเลขผูกราคา (P/E · Market Cap · ปันผล % · P/BV · % เป้า · ผลตอบแทนฉาก · ช่องสรุป) ใหม่ทุกวันจากตัวเลขของผู้เขียน
 *   ⇒ ค่าผูกราคาของหน้า v2 ที่ราคา snapshot = ค่าที่ cron พิมพ์ ไม่ใช่ literal ที่ค้างจากวันวิเคราะห์ (ยังไม่ถึงรอบ cron)
 *   ตัวเลขของผู้เขียน (FV · เป้า · prose) cron ไม่แตะ — เทียบตามต้นฉบับเหมือนเดิม · อ่าน/รันไม่ได้ = ต้นฉบับ
 */
function v2Served(raw) {
  try {
    const rd = (RM.readReportData(raw) || {}).data;
    if (!rd || !rd.values || !(rd.values.px > 0)) return raw;
    return require('../update-prices.js').derivedPassV2(raw, rd.values.px, {}).html;
  } catch (e) { return raw; }
}

const visible = (html) => String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
const textOf = (html) => visible(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

const LEAK_WORD = /\b(undefined|NaN|null|TODO)\b/g;
const unleak = (x) => (typeof x === 'string' ? x.replace(LEAK_WORD, (w) => w[0] + '\u2060' + w.slice(1))
  : Array.isArray(x) ? x.map(unleak) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [unleak(k), unleak(v)])) : x);
let SEEDS = null;
const seedsOf = () => SEEDS;

/** sanity บนหน้า v3 ที่เว็บแสดงจริง → [ข้อความที่ตก] */
function sanityOf(page, doc, view) {
  const bad = [];
  const vis = visible(page);
  const toks = vis.match(/\{\{[^}]*\}\}/g);
  if (toks) bad.push(`token ค้าง ${toks.length}: ${[...new Set(toks)].slice(0, 5).join(' ')}`);
  const words = textOf(page).match(/\b(?:undefined|NaN|null|TODO)\b/g);
  // คำเดียวกันที่ผู้เขียนพิมพ์เอง (MAA "pe:null" · CRWV "roe:null ใน meta") ไม่ใช่ render เสีย — วิธีเดียวกับ check-v3 renderLeak:
  //   แทรก U+2060 ในทุก string ของใบแล้ว render ซ้ำ · ยังเจอ = compute/render สร้างเอง
  if (words) {
    // จำนวนครั้งที่ผู้เขียนพิมพ์เอง = (หน้า render ปกติ) − (หน้า render ที่ string ของใบถูกแทรก U+2060) · หน้าที่ตรวจมีมากกว่านั้น = เสีย
    const cnt = (xs) => { const m = new Map(); for (const w of xs || []) m.set(w, (m.get(w) || 0) + 1); return m; };
    let author = new Map();
    try {
      const plain = cnt(textOf(B.expandReport(R.toV2Source(doc, C.compute(doc, { seeds: seedsOf() })))).match(LEAK_WORD));
      const u = unleak(doc), hidden = cnt(textOf(B.expandReport(R.toV2Source(u, C.compute(u, { seeds: seedsOf() })))).match(LEAK_WORD));
      author = new Map([...plain].map(([w, n]) => [w, n - (hidden.get(w) || 0)]));
    } catch (e) { author = new Map(); }
    const left = [...cnt(words)].filter(([w, n]) => n > (author.get(w) || 0)).map(([w]) => w);
    if (left.length) bad.push(`ข้อความเสีย: ${left.join(' ')}`);
  }
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

/**
 * ส่วนเบี่ยงที่ตั้งใจ (round 2 · คำตัดสิน controller) ของหน้า v3 จากหน้า v2 → { served (หน้า v2 ที่แทนการ์ดค้างแล้ว), list, accept(run) → ชื่อคลาส | null }
 *   v2-stale-card — การ์ดผูกราคาที่ไม่มีฐานใด (ที่การ์ดประกาศ / ตัวเลขของใบ) ได้ค่าที่หน้า v2 พิมพ์ที่ราคาของมันเอง = การ์ด v2 ค้างเอง
 *                   ⇒ baseline ใช้ค่าที่ v3 คิด (หน้า v3 ถูก — ค่าผูกราคาต้องสด) · จดทุกใบ
 *   v2-inconsistent-returns — รันในหมวด 6 ที่ตัวเลขฝั่ง v2 ทุกตัวเป็นผลตอบแทน (.ret) ของคอลัมน์ที่ขัดกับราคาเป้า (+ปันผล) ของตัวเองที่ราคาของหน้า
 *                   (เกณฑ์ max(TOL_RET_PP, 1 หน่วยที่พิมพ์) — DS.retConsistency) และฝั่ง v3 ทุกตัวเป็นผลตอบแทนที่หน้า v3 พิมพ์ในคอลัมน์เดียวกัน
 *   v2-stale-prose-e44 — ใบวิเคราะห์ ≥ RV.PROSE_TOKEN_SINCE: รัน prose ที่ตัวเลขฝั่ง v2 ทุกตัวเป็น literal ผูกราคาที่ E44 ฟ้อง (RV.proseBoundHits)
 *                   และฝั่ง v3 ทุกตัวเป็นค่าสดของ token เดียวกัน
 */
function deviationsOf(sym, served0, at, viewAt, v3At) {
  const DS = require('./display.js');
  const list = [], rounding = [];
  let served = served0;
  let pv = null;
  try { pv = PV.parseV2(sym, served0); } catch (e) { pv = null; }
  const num = (t) => EQ.numsOf(String(t || ''));
  const near = (a, b) => Math.abs(a.v - b.v) <= Math.max(a.half, b.half) * (1 + 1e-9);
  const subset = (xs, pool0) => { const pool = pool0.slice(); return xs.every((p) => { const i = pool.findIndex((q) => near(p, q)); if (i < 0) return false; pool.splice(i, 1); return true; }); };
  // (1) การ์ดค้าง
  if (pv && pv.rd) {
    let stale = [];
    try { stale = DS.cardPlan(pv, at, viewAt, DS.pairsOf(pv, at)).filter((x) => x.kind === 'stale' || x.kind === 'rounding'); } catch (e) { stale = []; }
    if (stale.length) {
      const a = served.indexOf('<div class="n">1</div>'), z = a < 0 ? -1 : served.indexOf('</section>', a);
      if (a >= 0 && z > a) {
        let sec = served.slice(a, z);
        const edits = [];
        const re = new RegExp(DV.CARD_SRC, 'g');
        let m, i = 0;
        while ((m = re.exec(sec))) {
          const x = stale.find((y) => y.i === i);
          if (x) { const st = m.index + '<div class="k">'.length + m[1].length + '</div>'.length + m[2].length; edits.push({ st, len: m[3].length, text: x.v3.replace(/&/g, '&amp;').replace(/</g, '&lt;') }); }
          i++;
        }
        for (const e of edits.sort((p, q) => q.st - p.st)) sec = sec.slice(0, e.st) + e.text + sec.slice(e.st + e.len);
        served = served.slice(0, a) + sec + served.slice(z);
        // rounding = v3 พิมพ์หยาบกว่า (ภายใน 1 หน่วยที่ v3 พิมพ์) → นับเป็นการปัด ไม่ใช่ส่วนเบี่ยง
        for (const x of stale) (x.kind === 'stale' ? list : rounding).push({ class: x.kind === 'stale' ? 'v2-stale-card' : 'v3-coarser-card', zone: 's1', del: x.v2t, ins: x.v3, card: x.key });
      }
    }
  }
  // (2) ผลตอบแทนที่ขัดกับเป้าของตัวเอง
  let bad = [];
  if (pv && pv.rd && pv.rd.values && at.scenarios) {
    // ใบที่พก rets: ฐานปันผล/สูตร %/ปี ของหน้า v3 · ไม่พก: ขัดกับเป้าของตัวเองภายใต้ทุกฐาน
    const rt = at.v2Display && at.v2Display.rets;
    try {
      bad = DS.retConsistency(pv, pv.rd.values.px, at.scenarios.years, rt ? rt.perYear || 'cagr' : undefined)
        .map((c, i) => (c && (rt ? !c.divs.includes(rt.div) : !c.ok) ? { i, text: c.text } : null)).filter(Boolean);
    } catch (e) { bad = []; }
  }
  let v3rets = [];
  if (bad.length) { try { v3rets = PV.parseV2(sym, v3At).s6cols.map((c) => PV.text(c.retHtml || '')); } catch (e) { v3rets = []; } }
  const pct = (text) => DV.retTokens(text).map((t) => ({ v: (/[-−–]/.test(t.sign || '') ? -1 : 1) * t.val, half: 0.5 * Math.pow(10, -DV.decOfNum(t.num)) }));
  const badV2 = bad.flatMap((b) => pct(b.text)), badV3 = bad.flatMap((b) => pct(v3rets[b.i] || ''));
  // (3) prose ค้างของใบใหม่ (E44)
  let e44V2 = [], e44V3 = [];
  try {
    const fd = FD.footerDate(served0);
    if (fd && fd.iso >= RV.PROSE_TOKEN_SINCE && pv && pv.rd) {
      // ค่าที่ใบประกาศ = ของหน้า v3 (ตัวเดียวกับที่ migrator tokenise และที่ E44 ของ check-v3 ใช้ — v2 บางใบไม่ประกาศ analystTgt แต่ใบ v3 มี analyst.target)
      const hits = RV.proseBoundHits(served0, viewAt.d);   // served0 = ต้นฉบับ (token {{rd:…}} ยังไม่ render) ⇒ hits = literal ของผู้เขียนเท่านั้น
      for (const h of hits) {
        // ค่าที่หน้า v3 พิมพ์ = token v3 ที่ migrator ใส่แทน (MP.shownOf — รูปแบบของ v3 เช่น analystPct ทศนิยม 0)
        const MP = require('./prose.js');
        const shown = MP.shownOf(MP.V2_TO_V3[h.token] || h.token, viewAt);
        if (shown == null) continue;
        e44V2.push(...num(h.text)); e44V3.push(...num(shown));
      }
    }
  } catch (e) { e44V2 = []; e44V3 = []; }
  // (4) ราคาปัจจุบันที่ผู้เขียนพิมพ์เป็นตัวเลขใน prose (display-fix2 · VRTX "ราคาปัจจุบัน ($508.34)") — migrator ใส่ {{px}} (ค่าตลาดต้องสด)
  //     ฝั่ง v2 = เงินหลังคำว่าราคาปัจจุบัน (MP.pxPhraseLits บนต้นฉบับ) · ฝั่ง v3 = ราคาที่หน้า v3 แสดงที่ market เดียวกัน
  let pxV2 = [], pxV3 = [];
  try {
    const MP = require('./prose.js');
    // ข้อความล้วนแล้ว — "<"/">" ที่ผู้เขียนพิมพ์ ("&lt; {{rd:fv}}" หมวด 5) ไม่ใช่แท็ก (freeSpans ของ pxPhraseLits จะกลืนช่วงยาวเป็นแท็ก · TER 27 ก.ย. 69)
    const lits = MP.pxPhraseLits(MP.decode(PV.text(served0.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' '))).replace(/[<>]/g, ' '), viewAt.d.px);
    if (lits.length) { pxV2 = lits.flatMap((l) => num(l.lit)); pxV3 = lits.flatMap(() => num(MP.shownOf('px', viewAt) || '')); }
  } catch (e) { pxV2 = []; pxV3 = []; }
  // (5) แถวผลตอบแทนในเซลล์ §6 ของผู้เขียน (v2Display.s6[i].rows[j][2] — 27 ก.ย. 69 · CBOE/GABLE): หน้า v2 แช่ตัวเลข ณ วันวิเคราะห์ (cron v2 ไม่แตะ ul)
  //     หน้า v3 คิดสดจากเป้าของคอลัมน์ (ผลตอบแทนผูกราคา — กติกาเจ้าของ) ⇒ ฝั่ง v2 = ตัวเลขในข้อความที่พก · ฝั่ง v3 = ค่าที่ render ที่ market เดียวกัน
  let rowV2 = [], rowV3 = [];
  try {
    const R = require('../../_template/v3/render.js');
    const cells = (at.v2Display && at.v2Display.s6) || [];
    cells.forEach((c, i) => { for (const r of (c && c.rows) || []) if (r[2]) { rowV2.push(...num(r[1])); rowV3.push(...num(R.liveRowRet(r[1], r[2], i, viewAt))); } });
  } catch (e) { rowV2 = []; rowV3 = []; }
  const accept = (r) => {
    let x = num(r.del), y = num(r.ins);
    // ตัวเลขที่อยู่ทั้งสองฝั่ง (ห่าง ≤ 1 หน่วยที่ v2 พิมพ์ — บริบทของรัน "$278" → "$278.00" · เป้า "$212") ไม่ใช่ส่วนเบี่ยง · ตัดออกก่อน
    { const y2 = y.slice(); x = x.filter((p) => { const j = y2.findIndex((q) => Math.abs(p.v - q.v) <= 2 * p.half * (1 + 1e-9)); if (j < 0) return true; y2.splice(j, 1); return false; }); y = y2; }
    if (!x.length) return null;
    if (r.zone === 's6' && badV2.length && subset(x, badV2) && subset(y, badV3)) return 'v2-inconsistent-returns';
    if (e44V2.length && subset(x, e44V2) && subset(y, e44V3)) return 'v2-stale-prose-e44';
    if (pxV2.length && subset(x, pxV2) && subset(y, pxV3)) return 'v2-stale-price-phrase';
    if (r.zone === 's6' && rowV2.length && subset(x, rowV2) && subset(y, rowV3)) return 'v2-stale-return-row';
    return null;
  };
  return { served, list, rounding, accept };
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

/**
 * ตัวเลขที่หน้า v3 พิมพ์แต่หน้า v2 ไม่มี (จุดบอดของ valueDiffs: numberValue เทียบเฉพาะตัวเลขที่อยู่ทั้งสองฝั่ง)
 *   ผู้สมัคร = EQ numberAdded (รันตัวเลขล้วนที่ฝั่ง v2 ไม่มีตัวเลข) + ตัวเลขในรัน text added/changed ที่ฝั่ง v2 ของรันไม่มีตัวเลขเลย
 *     (รันที่ฝั่ง v2 มีตัวเลข = EQ ส่งเข้า numberValue แล้ว — ไม่นับซ้ำ)
 *   จัดชั้นทีละตัวเลข (ADDED_CLASSES):
 *     live  — ค่าที่ template v3 พิมพ์สดทุกใบ (ราคา · วันที่ราคา · กรอบ 52 สัปดาห์ · กราฟ · ค่าผูกราคา P/E P/S P/BV ปันผล % Market Cap
 *             MOS/upside · % เป้านักวิเคราะห์ · ผลตอบแทนฉาก · จุดซื้อ MOS 20%/30%) — ADDED_LIVE_KINDS
 *     twin  — ตัวเลขเดียวกับที่หน้า v2 พิมพ์อยู่แล้ว (ย้ายตำแหน่งในโซน/ข้ามโซน หรือห่าง ≤ 1 หน่วยที่พิมพ์ = รูปแบบ/การปัดของตัวเลข v2)
 *     invented — ที่เหลือ = ตัวเลขที่ดูเหมือนของผู้เขียนแต่ผู้เขียนไม่เคยพิมพ์ (ต้องเป็น 0)
 *   → [{ zone, v, cls, kind, ins, ctx, via }]
 */
const ADDED_CLASSES = ['live', 'twin', 'invented'];
function liveValuesOf(view, doc) {
  const out = [];
  const add = (kind, v, tags) => { if (isNum(v)) out.push({ kind, v, tags }); };
  const M = ['$', ''], P = ['%'], X = ['x'], N = [''];
  const d = (view && view.d) || {};
  add('price', d.px, M);
  const pd = d.priceDate || {};
  add('price-date', pd.day, N); add('price-date', pd.yearCE, N); add('price-date', pd.yearCE + 543, N);
  const r52 = (doc && doc.market && doc.market.range52w) || {};
  add('range52w', r52.lo, M); add('range52w', r52.hi, M);
  const ch = (view && view.chart) || {};
  for (const p of ch.data || []) add('chart', p[1], M);
  for (const g of ch.grid || []) add('chart', g, M);
  add('chart', ch.min, M); add('chart', ch.max, M);
  const ga = (view && view.gauge) || {};
  for (const k of Object.keys(ga)) add('gauge', ga[k], M);
  add('price-bound:mcap', d.mcap, ['$']);
  // EV ในการ์ด EV/EBITDA = Market Cap (สด) + หนี้สุทธิ
  const fq = (view && (view.fq || (view.doc && view.doc.fundamentals))) || {};   // สกุลราคา (ตัวเดียวกับ cards.evEbitdaCalc)
  if (isNum(d.mcap) && isNum(fq.netDebt)) add('price-bound:ev', d.mcap + fq.netDebt, ['$']);
  for (const k of ['pe', 'ps', 'pbv']) add(`price-bound:${k}`, d[k], X);
  for (const k of ['yield', 'mos', 'mosShown', 'upside', 'analystPct']) add(`price-bound:${k}`, d[k], P);
  if (d.chg) add('price-bound:chg', d.chg.pct, P);
  add('buy-zone', d.mos20, M); add('buy-zone', d.mos30, M);
  for (const c of d.scenarios || []) { add('scenario-return', c.total, P); add('scenario-return', c.perYear, P); }
  return out;
}
// การ์ดผูกราคาใน §1 ที่หน้า v2 ไม่มีตัวเลข ("N/A" · "—" · "ขาดทุน GAAP") แต่หน้า v3 พิมพ์ค่าที่คิดจาก inputs = ตัวเลขที่ผู้เขียนไม่เคยพิมพ์
//   (SNOW/SYM/TFX "P/E (TTM) N/A" → ค่าจาก EPS forward) · ยกเว้นปันผล 0% ของใบที่ผู้เขียนบอกว่าไม่จ่ายปันผล (dps 0 — ข้อเท็จจริงเดียวกัน)
const TEMPLATE_LABEL_RE = /เป้านักวิเคราะห์ 12 ด\.|ราคาย้อนหลัง ~1 ปี/;
const TEMPLATE_LABEL_NUMS = [1, 12];
const CARD_LIVE_RE = /^price-bound:(?:pe|ps|pbv|mcap|yield)$/;
const NB = require('./numbers.js');
/** ตัวเลข + ชนิดหน่วยที่พิมพ์ (เงิน $ · % · x · ไม่มี) — "2567.0x" ไม่ใช่คู่ของปี "2567" · "$386" คู่กับ "$386.46" */
function taggedNums(s) {
  const t = String(s), out = [];
  for (const m of t.matchAll(NB.NUM_RE)) {
    const q = NB.numsOf(m[0])[0];
    if (!q) continue;
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const cur = /[$฿€£¥]/.test(m[0]);
    // รายการ "55/50/44/…/7%" · "+35/+23/…/+8%" — % ตัวท้ายเป็นหน่วยของทุกตัวในรายการ
    const suf = /^\s?%/.test(after) || /^(?:\s?\/\s?[+\-−]?[0-9][0-9.]*)+\s?%/.test(after) ? '%' : /^\s?(?:x(?![A-Za-z])|เท่า)/.test(after) ? 'x' : '';
    out.push({ v: q.v, half: q.half, tag: (cur ? '$' : '') + suf, at: m.index, len: m[0].length });
  }
  return out;
}
/** ข้อความรอบตัวเลข (บริบทในรายงาน audit) */
const snippet = (t, q) => t.slice(Math.max(0, q.at - 50), q.at + q.len + 30).trim();
/** ข้อความของโซน — "<" ที่ไม่ใช่ต้นแท็ก (ผู้เขียน v2 พิมพ์ "(<2%)" ดิบ · เบราว์เซอร์แสดงตามตัว) ไม่ใช่แท็ก */
const zoneText = (html) => EQ.text(String(html || '').replace(/<(?![A-Za-z\/!])/g, '&lt;'));
function addedNumbersOf(eq, v2Html, v3Html, view, doc, steps) {
  const cand = [];
  for (const x of eq.numberAdded || []) {
    if (/market\.range52w/.test(x.ctx || '')) { cand.push({ zone: x.zone, v: null, half: 0, ins: x.ins, ctx: x.ctx, via: 'range52' }); continue; }
    for (const q of taggedNums(x.ins)) cand.push({ zone: x.zone, v: q.v, half: q.half, tag: q.tag, ins: x.ins, ctx: x.ctx, via: 'number' });
  }
  for (const z of eq.zones || []) for (const r of z.runs) {
    if (!(r.kind === 'text added' || r.kind === 'text changed') || EQ.numsOf(r.del).length) continue;
    for (const q of taggedNums(r.ins)) cand.push({ zone: z.id, v: q.v, half: q.half, tag: q.tag, ins: r.ins, del: r.del, ctx: r.ctx, via: 'text' });
  }
  const z2 = EQ.zones(v2Html), z3 = EQ.zones(v3Html);
  const numsZ = new Map();
  const numsIn = (zs, side, id) => { const k = side + id; if (!numsZ.has(k)) numsZ.set(k, taggedNums(zoneText(zs.get(id)))); return numsZ.get(k); };
  const all2 = [...z2.keys()].flatMap((id) => numsIn(z2, 'v2', id)), all3 = [...z3.keys()].flatMap((id) => numsIn(z3, 'v3', id));
  const same = (p, q) => p.tag === q.tag && Math.abs(p.v - q.v) <= Math.max(p.half, q.half) * (1 + 1e-9);
  const count = (xs, q) => xs.filter((p) => same(p, q)).length;
  // ช่องที่ EQ.norm ตัดทิ้งทั้งสองฝั่ง (.d ของการ์ด template · สูตรใน mdesc ขา computed · ฐานในหัว §6) ไม่เข้ารันเลย
  //   ⇒ กวาดทั้งหน้า v3 อีกชั้น: ตัวเลขที่ไม่มีที่ไหนในหน้า v2 (หน่วยเดียวกัน · ห่าง ≤ 1 หน่วยที่พิมพ์) = ผู้สมัคร (via 'page')
  // คู่บนหน้า v2: หน่วยเดียวกัน · ห่าง ≤ 1 หน่วยที่พิมพ์ (หรือ 1 หน่วยที่ผู้เขียนเขียนใน report-data — authorSteps · FV "$233" → v3 $233.31)
  //   · สเกลหน่วยต่างกันได้ ("~82.5M หุ้น" ↔ "82.5 ล้านหุ้น" ที่ตัวอ่านไม่เห็นหน่วยเพราะติดคำไทย)
  const stepOf = (p) => (steps || []).reduce((b, a) => (Math.abs(a.v - p.v) <= p.half * (1 + 1e-9) && a.step > b ? a.step : b), 0);
  const SCALES = [1, 1e3, 1e6, 1e9, 1e12];
  const near2 = (q) => all2.some((p) => p.tag === q.tag && SCALES.some((k) => Math.abs(p.v * k - q.v) <= Math.max(2 * p.half * k, 2 * q.half, stepOf(p) * k) * (1 + 1e-9)));
  // ยอดรวม = ต่อหุ้นที่ผู้เขียนพิมพ์ × หุ้น (ขา DCF "FCF/หุ้น $9.25" → template พิมพ์ "FCF $135B") — ตัวเลขเดียวกันคนละหน่วย
  const shares = doc && doc.fundamentals && doc.fundamentals.shares;
  const perShare2 = (q) => shares > 0 && q.tag === '$' && all2.some((p) => p.tag === '$' && Math.abs(p.v * shares - q.v) <= Math.max(2 * q.half, 2 * p.half * shares) * (1 + 1e-9));
  //   ตัวเลขที่อยู่ในรันของ EQ แล้ว (numberValue/rounding/deviation — audit ตัดสินไปแล้ว) ไม่นับซ้ำ
  const inRuns = new Map((eq.zones || []).map((z) => [z.id, z.runs.flatMap((r) => taggedNums(r.ins))]));
  for (const [id, html] of z3) {
    const t = zoneText(html), ri = inRuns.get(id) || [];
    for (const q of taggedNums(t)) {
      if (near2(q) || cand.some((c) => c.zone === id && c.v === q.v) || ri.some((p) => Math.abs(p.v - q.v) <= Math.max(p.half, q.half) * (1 + 1e-9))) continue;
      cand.push({ zone: id, v: q.v, half: q.half, tag: q.tag, ins: snippet(t, q), ctx: '', via: 'page' });
    }
  }
  if (!cand.length) return [];
  const live = liveValuesOf(view, doc);
  const FLAT = /ทรงตัว|คงที่|\bflat\b/gi;
  const flatGone = (id) => (zoneText(z2.get(id)).match(FLAT) || []).length > (zoneText(z3.get(id)).match(FLAT) || []).length;
  const out = [];
  for (const c of cand) {
    const row = { zone: c.zone, v: c.v, ins: c.ins, ctx: c.ctx, via: c.via };
    if (c.via === 'range52') { out.push({ ...row, cls: 'live', kind: 'range52w' }); continue; }
    // ป้ายตายตัวของ template ("เป้านักวิเคราะห์ 12 ด." · "ราคาย้อนหลัง ~1 ปี") — ไม่ใช่ตัวเลขของผู้เขียน
    if (TEMPLATE_LABEL_RE.test(c.ins) && TEMPLATE_LABEL_NUMS.includes(c.v)) { out.push({ ...row, cls: 'live', kind: 'template-label' }); continue; }
    const q = { v: c.v, half: c.half, tag: c.tag };
    const lv = live.find((x) => x.tags.includes(q.tag) && Math.abs(x.v - q.v) <= Math.max(q.half, 1e-9 * Math.abs(q.v)) * (1 + 1e-9));
    if (count(numsIn(z3, 'v3', c.zone), q) <= count(numsIn(z2, 'v2', c.zone), q)) out.push({ ...row, cls: 'twin', kind: 'moved-in-zone' });
    // ปันผล 0 ของใบที่ผู้เขียนบอกว่าไม่จ่าย (fundamentals.dps 0) — "0.00%" · "$0.00/ปี" ในการ์ดปันผล = ข้อเท็จจริงเดียวกัน
    else if (q.v === 0 && c.zone === 's1' && doc && doc.fundamentals && doc.fundamentals.dps === 0 && /ปันผล/.test(c.ins)) out.push({ ...row, cls: 'live', kind: 'price-bound:yield (dps 0)' });
    // "ทรงตัว"/"คงที่" ของผู้เขียน → "+0%/ปี" = ค่าเดียวกันในรูปตัวเลข
    //   (รันตัวเลขล้วนไม่พกฝั่ง v2 — ดูคำในโซนเดียวกันของหน้า v2 ที่หน้า v3 ไม่มีแล้ว)
    else if (q.v === 0 && q.tag === '%' && (/ทรงตัว|คงที่|\bflat\b/i.test(c.del || '') || flatGone(c.zone))) out.push({ ...row, cls: 'twin', kind: 'flat-as-0%' });
    else if (lv && c.zone === 's1' && CARD_LIVE_RE.test(lv.kind)) {
      if (lv.kind === 'price-bound:yield' && q.v === 0 && doc && doc.fundamentals && doc.fundamentals.dps === 0) out.push({ ...row, cls: 'live', kind: 'price-bound:yield (dps 0)' });
      else out.push({ ...row, cls: 'invented', kind: `${lv.kind} where the v2 card printed no number` });
    } else if (lv) out.push({ ...row, cls: 'live', kind: lv.kind });
    else if (count(all3, q) <= count(all2, q)) out.push({ ...row, cls: 'twin', kind: 'moved-across-zones' });
    else if (perShare2(q)) out.push({ ...row, cls: 'twin', kind: 'per-share × shares' });
    else if (near2(q)) out.push({ ...row, cls: 'twin', kind: 'rounding' });
    else out.push({ ...row, cls: 'invented', kind: 'no v2 source' });
  }
  return out;
}

/** ใบเดียว → แถวผล · ไม่ throw · o.v2Of(sym) (ไม่บังคับ) = หน้า v2 จากที่อื่น { raw, ref } (เช่นสำเนา reports ชั่วคราวที่ไม่ใช่ git) */
function auditOne(sym, o) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(o.reportsDir, sym + '.json'), 'utf8')); }
  catch (e) { const row = emptyRow(sym); row.error = String(e && e.message || e).split('\n')[0]; row.sanity.push(`audit error: ${row.error}`); row.status = 'SANITY'; return row; }
  if (!(doc.meta && doc.meta.migratedFrom)) { const row = emptyRow(sym); row.status = 'SKIP'; row.error = 'ไม่มี meta.migratedFrom (ใบ v3 ต้นฉบับ ไม่ใช่ใบ migrate)'; return row; }
  let src = null, err = null;
  try { src = o.v2Of ? o.v2Of(sym) : v2Source(sym, o.reportsDir); } catch (e) { err = e; }
  return auditDoc(sym, doc, src, o, err);
}
const emptyRow = (sym) => ({ symbol: sym, status: 'OK', valueDiffs: 0, roundingDiffs: 0, textLost: 0, sanity: [], values: [], step: [], moved: [], rounding: [], lost: [], rd: [], added: 0, addedList: [], invented: 0, ref: null, error: null, deviations: [] });

/** doc (ใบ v3 ในหน่วยความจำ) เทียบหน้า v2 src = { raw, ref } → แถวผล · ไม่ throw (remigrate/adopt/convert ใช้ตัวเดียวกับ audit) */
function auditDoc(sym, doc, src, o, srcErr) {
  const row = emptyRow(sym);
  SEEDS = o.seeds;
  try {
    // sanity — หน้าที่เว็บแสดงจริง (market ปัจจุบันของใบ)
    const view = C.compute(doc, { seeds: o.seeds });
    const page = B.expandReport(R.toV2Source(doc, view));
    row.sanity = sanityOf(page, doc, view);
    if (srcErr) throw srcErr;
    if (!src) throw new Error('ไม่มีหน้า v2 ให้เทียบ');
    // เทียบ — v2 สุดท้ายใน git กับ v3 ที่ market ของหน้า v2 (apples to apples)
    row.ref = src.ref;
    const at = { ...doc, market: v2Market(sym, src.raw, doc, o.seeds) };
    const viewAt = C.compute(at, { seeds: o.seeds });
    const v3At = B.expandReport(R.toV2Source(at, viewAt));
    // o.rawBaseline (วัดผลเท่านั้น — round 2 ข้อ 4): เทียบกับต้นฉบับ v2 ก่อน cron แทนหน้าที่เว็บแสดง
    const served0 = o.rawBaseline ? src.raw : v2Served(src.raw);
    // ส่วนเบี่ยงที่ตั้งใจ (คำตัดสิน controller 26 ก.ย. 69 · round 2) — แคบเท่าที่นิยามไว้เท่านั้น
    const dev = o.noDeviations ? { served: served0, list: [], rounding: [], accept: () => null } : deviationsOf(sym, served0, at, viewAt, v3At);   // noDeviations = วัดผลเท่านั้น
    const served = dev.served;
    const v2Page = B.expandReport(served);
    const eq = EQ.compare(v2Page, v3At, at, viewAt, { v2src: served });
    const steps = authorSteps(src.raw);
    const k0 = splitValues(eq.numberValue, v3At, steps);
    const k = { ...k0, value: [] };
    row.deviations = dev.list.slice();
    for (const r of k0.value) {
      const cls = dev.accept(r);
      if (cls) row.deviations.push({ class: cls, zone: r.zone, del: r.del, ins: r.ins }); else k.value.push(r);
    }
    row.reasons = reasonsOf(eq.rd, k.value, steps);
    row.values = k.value; row.step = k.step.concat(dev.rounding); row.moved = k.moved; row.rounding = eq.numberRounding;
    row.lost = eq.textLostAt || eq.textLost.map((w) => ({ zone: '?', w }));
    row.rd = eq.rd; row.added = eq.numberAdded.length; row.addedList = addedNumbersOf(eq, v2Page, v3At, viewAt, at, steps); row.invented = row.addedList.filter((x) => x.cls === 'invented').length;
    row.valueDiffs = k.value.length; row.roundingDiffs = eq.numberRounding.length + k.step.length + dev.rounding.length; row.textLost = eq.textLost.length;
  } catch (e) {
    row.error = String(e && e.message || e).split('\n')[0];
    row.sanity.push(`audit error: ${row.error}`);
  }
  const f = [];
  if (row.valueDiffs > 0) f.push('VALUE-DIFF');
  if (row.sanity.length) f.push('SANITY');
  if (row.invented > 0) f.push('INVENTED');
  // เจ้าของ 27 ก.ย. 69: ข้อความของผู้เขียนที่หาย (คำ · ตัวเลขที่หายไปกับข้อความ) = ตก (เดิมเป็นข้อมูลประกอบ)
  if (row.textLost > 0) f.push('TEXT-LOST');
  row.status = f.length ? f.join('+') : 'OK';
  return row;
}

const csvCell = (s) => { const t = String(s == null ? '' : s); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function toCsv(rows) {
  const L = ['symbol,status,valueDiffs,roundingDiffs,textLost,sanity,added,invented,addedList'];
  const addedCell = (r) => (r.addedList || []).map((x) => `${x.cls}:${x.kind}@${x.zone}=${x.v == null ? String(x.ins) : x.v}`).join(' | ');
  for (const r of rows) L.push([r.symbol, r.status, r.valueDiffs, r.roundingDiffs, r.textLost, r.sanity.join(' | '), (r.addedList || []).length, r.invented || 0, addedCell(r)].map(csvCell).join(','));
  return L.join('\n') + '\n';
}
const mdCell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const DEV_CLASSES = ['v2-stale-card', 'v2-inconsistent-returns', 'v2-stale-prose-e44', 'v2-stale-price-phrase', 'v2-stale-return-row'];
function toMd(rows, meta) {
  const n = (f) => rows.filter(f).length;
  const audited = rows.filter((r) => r.status !== 'SKIP');
  const L = [`# v3 display audit — ${meta.date}`, '', `- code: \`${meta.head}\` · reports: \`${meta.reportsRel}\``,
    '- v2 = `reports/<SYM>.html` at the last commit that had it, as served after the v2 cron at its own snapshot price (price-bound figures the cron rewrites daily) · v3 rendered as the site does · comparison at the v2 page\'s `market` · sanity on the v3 page as served (current `market`)', '',
    '| | count |', '|---|---|',
    `| audited | ${audited.length} |`, `| OK | ${n((r) => r.status === 'OK')} |`,
    `| value diff (valueDiffs > 0) | ${n((r) => r.valueDiffs > 0)} |`, `| sanity failure | ${n((r) => r.sanity.length > 0)} |`,
    `| rounding drift only (OK with roundingDiffs > 0) | ${n((r) => r.status === 'OK' && r.roundingDiffs > 0)} |`,
    `| text lost (textLost > 0 — failure) | ${n((r) => r.textLost > 0)} |`, `| skipped (not migrated) | ${n((r) => r.status === 'SKIP')} |`,
    ...ADDED_CLASSES.map((c) => `| added numbers — ${c} (numbers · reports) | ${audited.reduce((k, r) => k + (r.addedList || []).filter((x) => x.cls === c).length, 0)} · ${n((r) => (r.addedList || []).some((x) => x.cls === c))} |`),
    ...DEV_CLASSES.map((c) => `| deliberate deviation: ${c} (reports) | ${n((r) => (r.deviations || []).some((d) => d.class === c))} |`), ''];
  const devs = audited.filter((r) => (r.deviations || []).length);
  if (devs.length) {
    L.push('## Deliberate deviations (controller rulings 26 Sep 2026 — the v3 page is right, not the v2 page)', '',
      '- `v2-stale-card`: a price-bound card no base reproduces at the v2 page\'s own price → v3 shows its live value',
      '- `v2-inconsistent-returns`: a scenario return the v2 page printed inconsistently with its own target (+dividends) at its own price → v3 computes it',
      '- `v2-stale-prose-e44`: a price-bound prose literal in a report analysed since ' + RV.PROSE_TOKEN_SINCE + ' (E44) → v3 prints the live token',
      '- `v2-stale-price-phrase`: the author printed the current price as a number right after "ราคาปัจจุบัน/ราคา" → v3 prints the live price {{px}}',
      '- `v2-stale-return-row`: a scenario-return row inside the author\'s §6 cells (not rewritten by the v2 cron) → v3 computes it live from the column target', '');
    for (const c of DEV_CLASSES) { const xs = devs.filter((r) => r.deviations.some((d) => d.class === c)).map((r) => r.symbol); if (xs.length) L.push(`- ${c} (${xs.length}): ${xs.join(' ')}`); }
    L.push('');
  }
  L.push('## Numbers the v3 page prints that the v2 page did not (added)', '',
    '- `live`: a template/live value every v3 page prints (price · price date · 52-week range · chart · gauge · price-bound P/E P/S P/BV yield Market Cap EV · MOS/upside · analyst % · scenario returns · MOS 20%/30% buy zones · template labels)',
    '- `twin`: the same figure the v2 page printed (moved in or across zones · within one printed/author step · another unit scale · per share × shares · "ทรงตัว" as +0%)',
    '- `invented`: an author-looking figure the v2 page never printed (must be 0)', '');
  const kinds = new Map();
  for (const r of audited) for (const x of r.addedList || []) kinds.set(`${x.cls}: ${x.kind}`, (kinds.get(`${x.cls}: ${x.kind}`) || 0) + 1);
  for (const [k, c] of [...kinds].sort()) L.push(`- ${k} ×${c}`);
  const inv = audited.filter((r) => r.invented);
  L.push('', `- invented (${inv.length} reports): ${inv.length ? inv.map((r) => r.symbol).join(' ') : 'none'}`, '');
  const bad = audited.filter((r) => r.status !== 'OK');
  L.push('## Failing reports', '');
  if (!bad.length) L.push('- none');
  else {
    L.push('| symbol | status | valueDiffs | why (report-data beyond one author step · zones) | sanity | first value diffs |', '|---|---|---|---|---|---|');
    for (const r of bad) L.push(`| ${r.symbol} | ${r.status} | ${r.valueDiffs} | ${mdCell((r.reasons || []).join(' · '))} | ${mdCell(r.sanity.join(' · '))} | ${mdCell(r.values.slice(0, 2).map((x) => `${x.zone}: ${x.del} → ${x.ins}`).join(' · '))} |`);
  }
  L.push('', '## Per report details (non-OK · text lost · rounding drift)', '');
  for (const r of audited.filter((x) => x.status !== 'OK' || x.textLost || x.roundingDiffs || x.moved.length || (x.deviations || []).length || (x.addedList || []).length)) {
    L.push(`### ${r.symbol} — ${r.status} (v2 @ ${r.ref || '?'})`, '');
    for (const s of r.sanity) L.push(`- sanity: ${mdCell(s)}`);
    for (const x of r.values) L.push(`- value ${x.zone}: \`${mdCell(x.del)}\` → \`${mdCell(x.ins)}\``);
    for (const x of r.deviations || []) L.push(`- deviation ${x.class} ${x.zone}: \`${mdCell(x.del)}\` → \`${mdCell(x.ins)}\``);
    if (r.textLost) L.push(`- text lost ×${r.textLost}: ${mdCell(r.lost.map((x) => `${x.w}@${x.zone}`).join(' '))}`);
    if (r.rounding.length) L.push(`- rounding ×${r.rounding.length}: ${mdCell(r.rounding.slice(0, 12).map((x) => `${x.del} → ${x.ins}`).join(' · '))}${r.rounding.length > 12 ? ' …' : ''}`);
    if (r.step.length) L.push(`- one printed step (accepted drift) ×${r.step.length}: ${mdCell(r.step.slice(0, 12).map((x) => `${x.zone}: ${x.del} → ${x.ins}`).join(' · '))}${r.step.length > 12 ? ' …' : ''}`);
    if (r.moved.length) L.push(`- moved within the zone (info) ×${r.moved.length}: ${mdCell(r.moved.map((x) => `${x.zone}: ${x.del}`).join(' · '))}`);
    for (const x of r.addedList || []) L.push(`- added ${x.cls} (${x.kind}) ${x.zone}: \`${mdCell(x.v == null ? x.ins : x.v)}\` in \`${mdCell(String(x.ins).slice(-120))}\``);
    const rdv = r.rd.filter((x) => !/^gauge\.(min|max)$/.test(x.path));
    if (rdv.length) L.push(`- report-data/stock-meta (info): ${mdCell(rdv.map((x) => `${x.path} ${x.v2} → ${x.v3}`).join(' · '))}`);
    L.push('');
  }
  const skip = rows.filter((r) => r.status === 'SKIP');
  if (skip.length) L.push('## Skipped', '', ...skip.map((r) => `- ${r.symbol}: ${r.error}`), '');
  return L.join('\n');
}

/** audit — syms ว่าง + all = ทุกใบ v3 · คืน { rows, code, files } · code 1 = มีใบ valueDiffs > 0 · sanity ตก · invented > 0 · textLost > 0 */
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
  const inv = audited.filter((r) => r.invented > 0);
  const tl = audited.filter((r) => r.textLost > 0);
  const addedN = (c) => audited.reduce((k, r) => k + (r.addedList || []).filter((x) => x.cls === c).length, 0);
  say(`audit: ${audited.length} ใบ · OK ${audited.filter((r) => r.status === 'OK').length} · value diff ${vd.length} · sanity ${sn.length} · invented ${inv.length} · text lost ${tl.length} · rounding-only ${audited.filter((r) => r.status === 'OK' && r.roundingDiffs > 0).length}${rows.length > audited.length ? ` · skip ${rows.length - audited.length}` : ''}`);
  say(`  added numbers: ${ADDED_CLASSES.map((c) => `${c} ${addedN(c)}`).join(' · ')}${inv.length ? ` · invented in ${inv.map((r) => r.symbol).join(' ')}` : ''}`);
  for (const r of audited.filter((x) => x.status !== 'OK')) say(`  ✗ ${r.symbol} ${r.status} · valueDiffs ${r.valueDiffs}${r.textLost ? ` · textLost ${r.textLost} (${(r.lost || []).slice(0, 6).map((x) => `${x.w}@${x.zone}`).join(' ')})` : ''}${r.sanity.length ? ` · ${r.sanity.join(' · ')}` : ''}${r.values.length ? ` · ${r.values.slice(0, 2).map((x) => `${x.zone}: ${x.del} → ${x.ins}`).join(' · ')}` : ''}`);
  if (files.md) say(`  → ${files.md} · ${files.csv}`);
  return { rows, code: vd.length || sn.length || inv.length || tl.length ? 1 : 0, files };
}

module.exports = { runAudit, auditOne, auditDoc, addedNumbersOf, liveValuesOf, taggedNums, ADDED_CLASSES, deviationsOf, emptyRow, v2Served, splitValues, authorSteps, v2Source, v2Market, sanityOf, toCsv, toMd, GIT_SCRUB };
