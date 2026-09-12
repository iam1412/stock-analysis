'use strict';
/**
 * preflight — ขั้น A1–A9 ของรอบเคลียร์คิว (docs-audit §5) ที่ script ทำแทนได้:
 *   pull --rebase · อ่านคิว · triage ครบทุก reason · ความสดจาก footer · snapshot ราคาเดิมลง state (postcheck ใช้ grep ราคาค้าง)
 *   · pre-patch ราคา LIGHT/FULL ทั้งชุดใน process เดียว (ไม่ pre-patch ระหว่างตลาดเปิด) → ยิง gate ต่อทันที คืนไฟล์ใบที่ตก
 *   (--force ข้าม quarantine ของ cron ⇒ preflight ต้องทำ quarantine เอง) · พิมพ์ขั้นที่ยังต้องทำเอง
 *   · ปฏิทินงบ (WS6 ข้อ 2): flip ที่ "งบออกหลังวันวิเคราะห์" ยกเป็น LIGHT — earnings-calendar.json (ยังไม่เปิดใช้ · docs/price-refresh.md)
 *   · คิวตามอายุ (WS6 ข้อ 3): ใบเกิน STALE_DAYS เข้าคิวเองแม้ราคาไม่ขยับ — ทยอย ageLimit ตัว/รอบ แก่สุดก่อน (--age N / --no-age)
 * ★ ไม่ทำแทน: probe โมเดล (ต้อง spawn subagent) · ยืนยันเพิกถอน · แก้ plumbing · ตัดสินใจกำกวม
 */
const fs = require('fs');
const path = require('path');
const { run, must, ROOT } = require('./sh.js');
const S = require('./state.js');
const { footerDate, ageDays, todayBangkok } = require('./footer-date.js');
const { usSessionOpen, setSessionOpen } = require('./market.js');
const { triage, prePatchList, llmList, STALE_DAYS } = require('./triage.js');
const { readStockMeta } = require('../report-meta.js');
const EC = require('../earnings-calendar.js');

const REPORTS = path.join(ROOT, 'reports');
const FLAGS = path.join(ROOT, 'price-flags.json');
const AGE_LIMIT_DEFAULT = 5;   // WS6 ข้อ 3: ทยอยกี่ใบ/รอบ (ปรับด้วย --age N · 0 = --no-age)

const readReport = (sym) => { const fp = path.join(REPORTS, sym + '.html'); return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null; };
function loadFlags() {
  try { return JSON.parse(fs.readFileSync(FLAGS, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw new Error(`อ่าน price-flags.json ไม่ได้ (${e.message})`); }
}

const listReportsFS = () => fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '')).sort();
const footerAgeFS = (today) => (sym) => { const h = readReport(sym); const d = h && footerDate(h); return d ? ageDays(d.iso, today) : null; };

/** งบออกหลังวันวิเคราะห์ไหม (WS6 ข้อ 2 · ส่วนบริสุทธิ์: รับปฏิทิน + ตัวอ่านรายงานมาเลย ไม่แตะดิสก์เอง)
 *  → (sym) → true = footer "ข้อมูล ณ" เก่ากว่าวันประกาศงบครั้งล่าสุด ⇒ triage ยก mos-sign-flip เป็น LIGHT
 *  → null = ตัดสินไม่ได้ (ไม่มีปฏิทิน/ยังไม่มี `last`/อ่าน footer ไม่ได้) ⇒ ใช้นโยบายอายุอย่างเดียวตามเดิม
 *  ★ ปฏิทินรอบแรก `last` เป็น null ทั้งไฟล์ (roll สะสมทีละสัปดาห์) — ไม่ผิด ค่อย ๆ มีผลเอง */
function earningsAfterOfWith(cal, read) {
  const syms = (cal && cal.symbols) || {};
  return (sym) => {
    const e = syms[sym];
    if (!e || !e.last) return null;
    const h = read(sym);
    const d = h && footerDate(h);
    return d ? d.iso < e.last : null;
  };
}

/** ใบที่อายุเกิน STALE_DAYS ทั้งหมด (แก่สุดก่อน ไม่ตัด) — WS6 ข้อ 3: trigger ตามเวลา ไม่ใช่ราคา
 *  opts.listReports () → [SYM] · opts.footerAgeOf(sym) → number|null — ให้เทสสับ FS ได้ (ส่วนบริสุทธิ์เมื่อใส่ opts ครบ) */
function ageQueue(today, opts) {
  const o = opts || {};
  const ageOf = o.footerAgeOf || footerAgeFS(today);
  return (o.listReports || listReportsFS)().map((symbol) => ({ symbol, footerAge: ageOf(symbol) }))
    .filter((r) => r.footerAge != null && r.footerAge > STALE_DAYS).sort((a, b) => b.footerAge - a.footerAge);
}

/** triage + เติมราคาเดิม/สกุลจาก stock-meta ของไฟล์ (อ่านดิสก์ — ส่วนที่เทสไม่ครอบ)
 *  opts.earningsAfterOf(sym) → boolean|null = งบออกหลังวันวิเคราะห์ไหม (Task 17 ใส่ของจริงจาก earnings-calendar.json)
 *  ยังไม่มี = null ⇒ flip ยกเป็น LIGHT ด้วยอายุ footer อย่างเดียว (triage.STALE_DAYS)
 *  opts.ageLimit (default 5) · opts.listReports/opts.footerAgeOf — คิวตามอายุ (WS6 ข้อ 3): เติมแถวสังเคราะห์
 *  reason:'age-gt-90d' synthetic:true ให้ใบที่อายุเกิน STALE_DAYS และยังไม่มี flag อยู่แล้ว แก่สุดก่อน ตัดที่ ageLimit
 *  (0 = --no-age ไม่เติมเลย) — ผ่าน triage() เหมือนแถวจริงทุกอย่าง (ได้ bucket LIGHT/action/skip ตามกติกาเดียวกัน) */
function plan(flags, today, opts) {
  const o = opts || {};
  const ageOf = o.footerAgeOf || footerAgeFS(today);
  const limit = o.ageLimit == null ? AGE_LIMIT_DEFAULT : o.ageLimit;
  const have = new Set(flags.map((f) => f.symbol));
  const extra = limit > 0
    ? ageQueue(today, { ...o, footerAgeOf: ageOf }).filter((r) => !have.has(r.symbol)).slice(0, limit)
      .map((r) => ({ symbol: r.symbol, reason: 'age-gt-90d', synthetic: true, flaggedAt: today }))
    : [];
  const rows = triage([...flags, ...extra], {
    footerAgeOf: ageOf,
    earningsAfterOf: o.earningsAfterOf || null,
  });
  for (const r of rows) {
    const h = readReport(r.symbol);
    const sm = h && readStockMeta(h);
    r.oldPrice = sm && Number.isFinite(sm.price) ? sm.price : null;
    r.currency = sm ? sm.currency : null;
  }
  return rows;
}

/** เลือกตัวที่ pre-patch ได้ตอนนี้ — ตลาดของสกุลนั้นเปิดอยู่ = ข้าม (--force ของ update-prices ข้าม guard intraday เอง)
 *  currency == null (ไม่มีไฟล์รายงาน/ไม่มี stock-meta) → ข้ามออกจาก batch เสมอ ไม่เดาว่าเป็น US */
function patchTargets(rows, m) {
  const cur = new Map(rows.map((r) => [r.symbol, r.currency]));
  const out = { target: [], skippedUS: [], skippedTH: [], skippedNoReport: [] };
  for (const sym of prePatchList(rows)) {
    const c = cur.get(sym);
    if (c == null) { out.skippedNoReport.push(sym); continue; }
    const th = c === 'THB';
    if (!m.allowIntraday && !th && m.usOpen) { out.skippedUS.push(sym); continue; }
    if (!m.allowIntraday && th && m.setOpen) { out.skippedTH.push(sym); continue; }
    out.target.push(sym);
  }
  return out;
}

/** อ่านผล `node test/check-reports.js <syms>` → รายชื่อไฟล์ที่ "ตก" (ส่วนบริสุทธิ์ ไม่แตะดิสก์)
 *  บรรทัดสรุปต่อไฟล์เริ่มต้นบรรทัดเสมอ (`✗ BBB.html 41/43 ผ่าน — 2 ปัญหา`) ส่วนรายละเอียด E-code ย่อหน้าเข้ามา
 *  (`    ✗ [E15] …`) ⇒ anchor `^✗` แยกสองชั้นนี้ออกจากกัน */
function parseGateFailures(out) {
  const syms = [];
  for (const line of String(out).split('\n')) {
    const m = /^✗\s+(\S+)\.html\b/.exec(line);
    if (m) syms.push(m[1]);
  }
  return syms;
}

/** ที่มาของแถว: แถวสังเคราะห์จากคิวอายุ (WS6 ข้อ 3) = "อายุ" · flip ที่ยกจาก PREPATCH (triage.escalated) = ป้าย escalated นั้น · ปกติ = "flag" */
const rowSource = (r) => (r.synthetic ? 'อายุ' : r.escalated || 'flag');
function renderTable(rows) {
  const L = ['symbol     reason                  bucket    ใบ→ตลาด            ต่าง   ตั้งแต่     footer  ที่มา     การทำ'];
  for (const r of rows) {
    const px = `${r.reportPrice ?? '-'}→${r.marketPrice ?? '-'}`;
    L.push(`${r.symbol.padEnd(10)} ${String(r.reason).padEnd(23)} ${String(r.bucket).padEnd(9)} ${px.padEnd(18)} ${String(r.diffPct != null ? r.diffPct + '%' : '').padStart(6)} ${String(r.flaggedAt || '').padEnd(11)} ${String(r.footerAge != null ? r.footerAge + 'd' : '?').padStart(5)}  ${String(rowSource(r)).padEnd(8)} ${r.skip || r.action}`);
  }
  return L.join('\n');
}

/**
 * ── "รอบใหม่" คือเมื่อไร (Task 21) ─────────────────────────────────────────────────────────────
 * `.queue/state.json` อยู่ข้ามรอบ (Task 15) ⇒ ถ้าไม่นิยาม "รอบ" ค่าที่สั่งงานของรอบก่อนจะสั่งงานรอบนี้:
 * ใบที่ ship แล้วแล้วโดน flag ใหม่จะถูกนับว่า push แล้ว · `ship <SYM>` ผ่าน guard postcheck ของรอบก่อน ·
 * `ship --prepatch` ปิด issue ทั้งที่ใบนั้นยังต้องส่ง LLM
 *
 * นิยาม: **รอบใหม่ = มี flag จริงอย่างน้อย 1 ตัวที่ `flaggedAt` ใหม่กว่า `s.startedAt` ที่เก็บไว้**
 *        `startedAt` ใหม่ = `flaggedAt` ที่ **เก่าสุด** ในกลุ่มที่ใหม่กว่านั้น (ไม่ใช่ `today` ไม่ใช่ค่ามากสุด —
 *        ไม่งั้น flag ที่ cron เขียนคนละวันแต่ยังเป็นรอบเดียวกันจะตกขอบทันทีที่เขียนแถวแรก)
 * ★ **แถวสังเคราะห์จากคิวอายุไม่นับ** — ไม่ใช่ flag (ไม่ได้อยู่ใน `price-flags.json`) และ preflight สร้างใหม่ด้วย
 *   `flaggedAt = วันนี้` ทุกครั้ง ⇒ ถ้านับ รอบจะรีเซ็ตเองทุกวันที่รัน preflight แม้คิวไม่เปลี่ยนเลย แล้วงานที่ยัง
 *   ค้างจากรอบก่อน (flag ถูก --force ล้างไปตอน pre-patch แล้ว) จะหลุดออกนอกรอบกลางคัน
 * ★ ไม่มี flag ใหม่เลย = รอบเดิม (คง `startedAt`) · ยังไม่เคยมีรอบและไม่มี flag = วันนี้
 */
function roundStart(rows, prev, today) {
  const fresh = (rows || []).filter((r) => !r.synthetic && r.flaggedAt && (!prev || r.flaggedAt > prev)).map((r) => r.flaggedAt);
  return fresh.length ? fresh.reduce((a, b) => (a < b ? a : b)) : (prev || today || null);
}

/** flag ของ symbol นี้ "ใหม่สำหรับรอบนี้" ไหม → true = เขียนแถวโดยไม่อุ้ม `S.ROUND_FIELDS` ของรอบก่อนมา
 *  เกณฑ์เดียว: **`flaggedAt` ไม่เท่าเดิม** (ยังไม่มีแถวเลย = ใหม่แน่นอน)
 *  รีวิวเขียนเกณฑ์ไว้ 3 ข้อ — (ก) flaggedAt ใหม่กว่า (ข) แถว synthetic (ค) แถวเดิมมี `shippedAt` — ทั้งสามข้อ
 *  ยุบลงเป็น "flaggedAt เปลี่ยน" ได้หมดในทางปฏิบัติ และ**ต้อง**ยุบ ไม่งั้นเจอ regression สองทาง:
 *    · "synthetic = ใหม่เสมอ" ⇒ preflight ที่รันซ้ำ**วันเดียวกัน**ล้าง prepAt/model ของใบที่ prep ไปแล้ว → `ship` ตายที่ resolveModel
 *    · "มี shippedAt = ใหม่เสมอ" ⇒ preflight ที่รันซ้ำในรอบเดิม (flag ยังอยู่ใน price-flags.json เพราะ cron ยังไม่รันใหม่)
 *      ล้าง shippedAt ของใบที่ push ไปแล้ว → ตัวนับ X/Y ถอยหลัง
 *  flag ที่ cron เขียนใหม่จริง ๆ มี `flaggedAt` ของวันนั้นเสมอ (flag เก่าหายไปตอนรายงานสด) ⇒ (ก)/(ข)/(ค) ยังถูกดักครบ */
function isNewFlag(old, r) {
  if (!old) return true;
  return (old.flaggedAt || null) !== (r.flaggedAt || null);
}

/** แถว state ใหม่ของ symbol หนึ่ง (ส่วนบริสุทธิ์) — flag ใหม่ = ทิ้งฟิลด์ของรอบก่อน · flag เดิม = ทับเฉพาะช่องของ preflight */
function upsertRow(old, r) {
  const keep = isNewFlag(old, r)
    ? Object.fromEntries(Object.entries(old || {}).filter(([k]) => !S.ROUND_FIELDS.includes(k)))
    : { ...(old || {}) };
  return { ...keep, reason: r.reason, bucket: r.bucket, oldPrice: r.oldPrice, currency: r.currency, footerAge: r.footerAge, skip: r.skip, flaggedAt: r.flaggedAt || null };
}

/** ผล gate หลัง pre-patch → ประทับลงแถว state (ส่วนบริสุทธิ์ — เทสยิงได้โดยไม่ต้องรัน update-prices/check-reports)
 *  ผ่าน = `prePatched` + **ลบ `prePatchRejected` ของรอบก่อนทิ้ง** (ใบที่เคยตกแล้วคนแก้จนผ่าน ต้องไม่ค้างบล็อกการปิด issue ตลอดไป)
 *  ตก = `prePatchRejected` (คืนไฟล์เป็นงานของผู้เรียก) */
function applyGateResult(stocks, targets, failed, today) {
  const fail = new Set(failed);
  for (const sym of targets) {
    const rec = stocks[sym] || (stocks[sym] = {});
    if (fail.has(sym)) { rec.prePatchRejected = today; continue; }
    rec.prePatched = today;
    delete rec.prePatchRejected;
  }
  return stocks;
}

/** ★ รายการขั้นที่ script ทำแทนไม่ได้ — พิมพ์ทุกครั้ง นี่คือตัววัด "ขั้นที่ต้องจำ ≤5" (KPI ระยะ 0) */
function manualSteps(rows) {
  const L = ['\n── ขั้นที่ต้องทำเอง (script ทำแทนไม่ได้) ──'];
  let n = 0;
  L.push(`${++n}. probe โมเดล: spawn subagent ไม่ใส่ model ให้ตอบบรรทัด "You are powered by the model named …" (CLAUDE.md §3.2) แล้ว pin ทุก call`);
  const d = rows.filter((r) => r.bucket === 'DELIST');
  if (d.length) L.push(`${++n}. DELIST ${d.map((r) => r.symbol).join(' ')}: ยืนยันแหล่งปฐมภูมิ (SEC Form 25/8-K · ประกาศตลาด) → ลบรายงาน + node tools/tag-apply.js --prune · ยังเทรด → node tools/update-prices.js --write --alive <SYM>`);
  // prePatchRejected ติดมากับแถวหลัง preflight เท่านั้น (pre-patch แล้ว gate ตก → คืนไฟล์) — คลาสเดียวกับ REJECTED ของ cron: แก้ใบเอง ไม่ spawn agent
  const p = rows.filter((r) => r.bucket === 'PLUMBING' || r.bucket === 'REJECTED' || r.bucket === 'UNKNOWN' || r.prePatchRejected);
  if (p.length) L.push(`${++n}. ${p.map((r) => `${r.symbol}[${r.prePatchRejected ? 'gate ตกหลัง pre-patch' : r.reason}]`).join(' ')}: แก้ตามคอลัมน์ "การทำ" ไม่ spawn agent`);
  L.push(`${++n}. ต่อไป: npm run queue -- ship --prepatch (push ราคาที่ patch · PREPATCH ${rows.filter((r) => r.bucket === 'PREPATCH').length} ตัวจบตรงนี้) แล้ว npm run queue -- prep <SYM> ทีละตัวเฉพาะ ${llmList(rows).length} ตัวที่ต้องส่ง LLM: ${llmList(rows).join(' ') || '-'}`);
  return L.join('\n');
}

function preflight(opts) {
  const o = opts || {};
  if (run('git', ['status', '--porcelain']).out.trim() && !o.allowDirty)
    throw new Error('working tree ไม่สะอาด — commit ก่อน (CLAUDE.md §5: commit ก่อน pull --rebase) หรือใส่ --allow-dirty ถ้าตั้งใจ');
  must('git', ['pull', '--rebase', 'origin', 'main'], 'git pull --rebase');
  const today = todayBangkok();
  const flags = loadFlags();
  const ageLimit = o.noAge ? 0 : (o.age == null ? AGE_LIMIT_DEFAULT : o.age);
  // ปฏิทินงบ (Task 17) — อ่านที่นี่ ไม่ใช่ใน plan() เพราะ plan เป็นส่วนที่ queue-test ยิงแบบ offline (ห้ามแตะ reports/)
  const cal = EC.load();
  const withLast = Object.values(cal.symbols || {}).filter((e) => e && e.last).length;
  const rows = plan(flags, today, { ...o, ageLimit, earningsAfterOf: o.earningsAfterOf || earningsAfterOfWith(cal, readReport) });
  console.log(`\n=== คิว price-flags ${flags.length} รายการ · ${today} ===\n${renderTable(rows)}`);
  const nCal = Object.keys(cal.symbols || {}).length;
  console.log(nCal
    ? `ปฏิทินงบ: ${nCal} symbol · รู้วันประกาศครั้งล่าสุดแล้ว ${withLast} ใบ (flip ของใบที่งบออกหลังวิเคราะห์ถูกยกเป็น LIGHT)`
    : 'ปฏิทินงบ: ไม่มี earnings-calendar.json — flip ยกเป็น LIGHT ด้วยอายุ footer อย่างเดียว (docs/price-refresh.md)');
  const aq = ageQueue(today);
  if (aq.length) {
    console.log(`อายุเกิน ${STALE_DAYS} วัน ${aq.length} ใบ (รอบนี้เอา ${rows.filter((r) => r.synthetic).length} แก่สุด · --age N ปรับได้): ${aq.slice(0, 10).map((r) => `${r.symbol}(${r.footerAge}d)`).join(' ')}${aq.length > 10 ? ' …' : ''}`);
    console.log('   (แถวอายุเป็นงานเสริม ไม่ได้อยู่ใน price-flags.json — ship --prepatch จะรายงานว่ายังเหลือแถวต้องส่ง LLM จนกว่าจะทำจบ หรือตัดออกด้วย --no-age)');
  }
  const s = S.load();
  s.startedAt = roundStart(rows, s.startedAt || null, today);
  for (const r of rows) s.stocks[r.symbol] = upsertRow(s.stocks[r.symbol], r);
  S.save(s);   // บันทึก snapshot ก่อน pre-patch — patch ล้มก็ต้องเหลือราคาเดิมให้ postcheck ใช้
  const t = patchTargets(rows, { usOpen: usSessionOpen(), setOpen: setSessionOpen(), allowIntraday: !!o.allowIntraday });
  if (t.skippedUS.length) console.log(`\n⏳ ตลาด US เปิดอยู่ — ไม่ pre-patch ${t.skippedUS.join(' ')} (ราคา intraday · --force ข้าม guard ของ update-prices เอง — บทเรียน 9 ก.ย. 69) · ต้องการจริงใส่ --allow-intraday`);
  if (t.skippedTH.length) console.log(`\n⏳ SET เปิดอยู่ — ไม่ pre-patch ${t.skippedTH.join(' ')} · --allow-intraday ถ้าจงใจ`);
  if (t.skippedNoReport.length) console.log(`\n⚠ ไม่มีไฟล์รายงาน — ไม่ pre-patch ${t.skippedNoReport.join(' ')} (ลบไปแล้ว? รัน node tools/tag-apply.js --prune แล้วปล่อยให้ cron ตัด flag ทิ้ง)`);
  if (t.target.length && !o.noPatch) {
    console.log(`\n▶ pre-patch ราคา ${t.target.length} ตัวใน process เดียว (lock กันคิวเพี้ยนแล้ว — WS4)`);
    const r = run('node', ['tools/update-prices.js', '--write', '--force', ...t.target]);
    process.stdout.write(r.out);
    if (r.code !== 0) throw new Error('pre-patch ล้ม: ' + (r.err || r.out).slice(-1000));
    // ★ --force ข้าม quarantine ของ cron (cron patch แล้ว gate ตก = ไม่เขียนไฟล์ + flag patch-rejected) ⇒ ต้องยิง gate เอง
    //   ใบที่ตกต้องคืนไฟล์ ไม่งั้น `ship --prepatch` จะ verify ตกทั้งชุด และใบที่ดีก็ push ไม่ได้
    console.log('\n▶ gate หลัง pre-patch: node test/check-reports.js ' + t.target.join(' '));
    const g = run('node', ['test/check-reports.js', ...t.target]);
    process.stdout.write(g.out);
    const failed = parseGateFailures(g.out);
    if (g.code !== 0 && !failed.length) throw new Error('check-reports หลัง pre-patch ล้มแต่แยกไฟล์ที่ตกไม่ได้ — ตรวจเอง (ราคาที่ patch ยังอยู่ในไฟล์):\n' + (g.err || g.out).trim().slice(-1000));
    applyGateResult(s.stocks, t.target, failed, today);
    for (const sym of failed) {   // สะท้อนลงแถวของรอบนี้ด้วย — manualSteps อ่านจาก rows ไม่ใช่ state
      const row = rows.find((x) => x.symbol === sym);
      if (row) row.prePatchRejected = today;
    }
    S.save(s);   // บันทึกก่อนคืนไฟล์ — checkout ล้มแล้ว throw ก็ยังเหลือสถานะให้ postcheck/status อ่าน
    for (const sym of failed) {
      must('git', ['checkout', '--', `reports/${sym}.html`], `คืนไฟล์ ${sym} หลัง gate ตก`);
      console.log(`⛔ ${sym} gate ตกหลัง pre-patch → คืนไฟล์แล้ว (ต้องแก้ใบให้ผ่าน npm test -- ${sym} ก่อน · ดูรายละเอียดด้านบน)`);
    }
  } else if (t.target.length) console.log(`\n(--no-patch) คำสั่งที่จะรัน: node tools/update-prices.js --write --force ${t.target.join(' ')}`);
  S.save(s);
  console.log(manualSteps(rows));
  return rows;
}

module.exports = { preflight, plan, ageQueue, earningsAfterOfWith, patchTargets, renderTable, manualSteps, loadFlags, parseGateFailures, roundStart, isNewFlag, upsertRow, applyGateResult };
