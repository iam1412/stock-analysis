'use strict';
/**
 * preflight — ขั้น A1–A9 ของรอบเคลียร์คิว (docs-audit §5) ที่ script ทำแทนได้:
 *   pull --rebase · อ่านคิว · triage ครบทุก reason · ความสดจาก footer · snapshot ราคาเดิมลง state (postcheck ใช้ grep ราคาค้าง)
 *   · pre-patch ราคา LIGHT/FULL ทั้งชุดใน process เดียว (ไม่ pre-patch ระหว่างตลาดเปิด) → ใบ v2: ยิง gate ต่อทันที คืนไฟล์ใบที่ตก
 *   (--force ข้าม quarantine ของ cron ⇒ preflight ต้องทำ quarantine เอง) · ใบ v3 (Plan 4b · #66): gate อยู่ใน update-prices เอง
 *   (IO.writeMarket + checkDoc ใต้ lock เดียว — ตกแล้วไม่เขียนไฟล์) ⇒ ไม่ยิง check-reports · ไม่มีไฟล์ให้คืน · อ่านผลรายใบจาก stdout
 *   (parseV3PatchResult) · พิมพ์ขั้นที่ยังต้องทำเอง
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
const { triage, prePatchList, llmList, STALE_DAYS, parseLightRule } = require('./triage.js');
const { readStockMeta } = require('../report-meta.js');
const RS = require('../report-source.js');   // ใบ v2 + v3 (Plan 2b)
const EC = require('../earnings-calendar.js');

const REPORTS = path.join(ROOT, 'reports');
const FLAGS = path.join(ROOT, 'price-flags.json');
const AGE_LIMIT_DEFAULT = 5;   // WS6 ข้อ 3: ทยอยกี่ใบ/รอบ (ปรับด้วย --age N · 0 = --no-age)

/** SEC fallback ต่อ process: แคช ticker→CIK ไว้ตัวเดียว · ยิง curl -A (sync) เฉพาะเมื่อ triage ถามจริง */
const secFetcher = () => { const cache = new Map(); return (sym) => EC.secLookup(sym, { cache }); };
// ตัวอ่านของจริง = metaLite (ใบ v2 + v3 ผ่าน tools/report-source.js) · เทสเดิมฉีดตัวอ่านที่คืน html ดิบ — ตัวใช้งานรับได้ทั้งสองรูป
const readLite = (sym) => RS.metaLite(sym, REPORTS);
const analysisIsoOf = (h) => (h && typeof h === 'object' ? h.analysisDate || null : ((h && footerDate(h)) || {}).iso || null);
const currencyOf = (h) => (h && typeof h === 'object' ? h.currency || null : ((h && readStockMeta(h)) || {}).currency || null);
function loadFlags() {
  try { return JSON.parse(fs.readFileSync(FLAGS, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw new Error(`อ่าน price-flags.json ไม่ได้ (${e.message})`); }
}

// Plan 4a: คิวตามอายุนับใบ v3 ด้วย — prep รับใบ v3 แล้ว (report.js export/save) · เดิม (Plan 2b–3) กรอง `!e.v3` ออกเพราะ prep ยังปฏิเสธใบ v3
const listReportsFS = (dir) => RS.list(dir || REPORTS).map((e) => e.symbol).sort();
const footerAgeFS = (today) => (sym) => { const iso = analysisIsoOf(readLite(sym)); return iso ? ageDays(iso, today) : null; };

/** งบออกหลังวันวิเคราะห์ไหม (WS6 ข้อ 2 · ส่วนบริสุทธิ์: รับปฏิทิน + ตัวอ่านรายงานมาเลย ไม่แตะดิสก์เอง)
 *  → (sym) → true = footer "ข้อมูล ณ" เก่ากว่าวันประกาศงบครั้งล่าสุด ⇒ triage ยก mos-sign-flip เป็น LIGHT
 *  → null = ตัดสินไม่ได้ (ไม่มีปฏิทิน/ยังไม่มี `last`/อ่าน footer ไม่ได้) ⇒ ใช้นโยบายอายุอย่างเดียวตามเดิม
 *  ★ ปฏิทินรอบแรก `last` เป็น null ทั้งไฟล์ (roll สะสมทีละสัปดาห์) — ไม่ผิด ค่อย ๆ มีผลเอง */
function earningsAfterOfWith(cal, read) {
  const syms = (cal && cal.symbols) || {};
  return (sym) => {
    const e = syms[sym];
    if (!e || !e.last) return null;
    const iso = analysisIsoOf(read(sym));
    return iso ? iso < e.last : null;
  };
}

/** มีงบไตรมาส/ปีใหม่หลังวันที่ footer ไหม (กฎ LIGHT/FULL ใหม่ · ส่วนบริสุทธิ์ — ฉีดปฏิทิน/ตัวอ่านรายงาน/SEC/วันนี้)
 *  → (sym) → { after: true|false|null, source, last, detail } (null = ตัดสินไม่ได้ ⇒ triage ถือเป็น FULL) · ตรรกะจริงอยู่ที่ EC.statementAfter
 *  read(sym) → RS.metaLite (ของจริง · ใบ v2+v3) หรือ html ดิบของใบ v2 (เทสเดิม/prep) หรือ null — วันวิเคราะห์ + สกุลอ่านได้ทั้งสองรูป
 *  opts.today (default วันนี้ไทย) · opts.sec(sym) → 'YYYY-MM-DD'|null (ไม่ใส่ = ไม่ยิง SEC) · opts.isThai(sym, h) — h = ค่าที่ read คืน (default: currency === 'THB')
 *  ผลต่อ symbol เก็บในหน่วยความจำต่อ process ({lastStatementDate, source, fetchedAt} ไม่เขียน earnings-calendar.json — ไฟล์นั้นไม่ได้ commit) */
function statementAfterOfWith(cal, read, opts) {
  const o = opts || {};
  const today = o.today || todayBangkok();
  const memo = new Map();
  return (sym) => {
    if (memo.has(sym)) return memo.get(sym);
    const h = read(sym);
    const th = o.isThai ? o.isThai(sym, h) : currencyOf(h) === 'THB';
    const r = EC.statementAfter(sym, { footerIso: analysisIsoOf(h), today, th, cal, sec: o.sec || null });
    const rec = { ...r, lastStatementDate: r.last, fetchedAt: today };
    memo.set(sym, rec);
    return rec;
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

/** flaggedAt ของแถวอายุสังเคราะห์ (open-item #26) — ต้อง "ต่อเนื่อง" ข้ามวันถ้ายังเป็นเคสเดิมที่ยังไม่ ship
 *  ★ ทำไมต้องมี: plan() เดิมตั้ง `flaggedAt: today` ให้แถวสังเคราะห์ทุกครั้งไม่ว่าจะเคยเจอมาก่อนหรือไม่ ⇒ preflight
 *  ที่รันคนละวันในรอบเดียวกัน (เช่น worker ยังไม่เสร็จ ยังไม่ ship) จะได้ flaggedAt ใหม่ทุกวัน ⇒ isNewFlag() เห็นว่า
 *  flag "เปลี่ยน" ⇒ upsertRow ล้าง model/prepAt/postcheck ของรอบเดิมทิ้งเงียบ ๆ (กู้คืนได้ด้วย prep <SYM>/--model มือ
 *  เท่านั้น) ทั้งที่ตัวคิวอายุไม่ได้มี "flag เขียนใหม่" แบบ price-flags.json จริง — เป็นเคสเดิมที่ preflight สร้างขึ้นเอง
 *  ทุกครั้งที่รัน ⇒ ต้องผูกความต่อเนื่องกับ state (opts.priorStocks) ไม่ใช่ประทับวันนี้ดะ
 *  กติกา: เคยเป็น 'age-gt-90d' มาก่อน + มี flaggedAt เดิม + **ยังไม่ ship** (shippedAt ว่าง) ⇒ ใช้ flaggedAt เดิม
 *  ไม่งั้น (ครั้งแรก หรือเคย ship ไปแล้วแต่ดันโผล่ใน ageQueue อีก — ship ล้ม/footer ยังไม่ขยับ) ⇒ วันนี้ (รอบใหม่จริง) */
function synthAge(prior, today) {
  if (prior && prior.reason === 'age-gt-90d' && prior.flaggedAt && !prior.shippedAt) return prior.flaggedAt;
  return today;
}

/** triage + เติมราคาเดิม/สกุลจาก stock-meta ของไฟล์ (อ่านดิสก์ — ส่วนที่เทสไม่ครอบ)
 *  opts.earningsAfterOf(sym) → boolean|null = งบออกหลังวันวิเคราะห์ไหม (Task 17 ใส่ของจริงจาก earnings-calendar.json)
 *  ยังไม่มี = null ⇒ flip ยกเป็น LIGHT ด้วยอายุ footer อย่างเดียว (triage.STALE_DAYS)
 *  opts.ageLimit (default 5) · opts.listReports/opts.footerAgeOf — คิวตามอายุ (WS6 ข้อ 3): เติมแถวสังเคราะห์
 *  reason:'age-gt-90d' synthetic:true ให้ใบที่อายุเกิน STALE_DAYS และยังไม่มี flag อยู่แล้ว แก่สุดก่อน ตัดที่ ageLimit
 *  (0 = --no-age ไม่เติมเลย) — ผ่าน triage() เหมือนแถวจริงทุกอย่าง (ได้ bucket LIGHT/action/skip ตามกติกาเดียวกัน)
 *  opts.priorStocks = state.stocks ของรอบนี้ (open-item #26) — ให้ synthAge() ตัดสิน flaggedAt ต่อเนื่องได้
 *  opts.liteOf(sym) → RS.metaLite | null (Plan 2b) — ตัวอ่านราคาเดิม/สกุล/v3 ต่อแถว (default = reports/ จริง · เทสฉีด sandbox) */
function plan(flags, today, opts) {
  const o = opts || {};
  const ageOf = o.footerAgeOf || footerAgeFS(today);
  const limit = o.ageLimit == null ? AGE_LIMIT_DEFAULT : o.ageLimit;
  const prior = o.priorStocks || {};
  const have = new Set(flags.map((f) => f.symbol));
  const extra = limit > 0
    ? ageQueue(today, { ...o, footerAgeOf: ageOf }).filter((r) => !have.has(r.symbol)).slice(0, limit)
      .map((r) => ({ symbol: r.symbol, reason: 'age-gt-90d', synthetic: true, flaggedAt: synthAge(prior[r.symbol], today) }))
    : [];
  const rows = triage([...flags, ...extra], {
    footerAgeOf: ageOf,
    earningsAfterOf: o.earningsAfterOf || null,
    statementAfterOf: o.statementAfterOf || null,
    lightRule: o.lightRule || 'new',
  });
  const liteOf = o.liteOf || readLite;   // เทสฉีด sandbox ได้ (Plan 2b)
  for (const r of rows) {
    const m = liteOf(r.symbol);
    r.oldPrice = m && Number.isFinite(m.px) ? m.px : null;   // v2 = stock-meta.price · v3 = market.px
    r.currency = m ? m.currency : null;
    r.v3 = !!(m && m.v3);
  }
  return rows;
}

/** เลือกตัวที่ pre-patch ได้ตอนนี้ — ตลาดของสกุลนั้นเปิดอยู่ = ข้าม (--force ของ update-prices ข้าม guard intraday เอง)
 *  currency == null (ไม่มีไฟล์รายงาน/ไม่มี stock-meta) → ข้ามออกจาก batch เสมอ ไม่เดาว่าเป็น US */
function patchTargets(rows, m) {
  const cur = new Map(rows.map((r) => [r.symbol, r.currency]));
  const v3 = new Set(rows.filter((r) => r.v3).map((r) => r.symbol));
  const out = { target: [], v3: [], skippedUS: [], skippedTH: [], skippedNoReport: [] };
  for (const sym of prePatchList(rows)) {
    const c = cur.get(sym);
    if (c == null) { out.skippedNoReport.push(sym); continue; }
    const th = c === 'THB';
    if (!m.allowIntraday && !th && m.usOpen) { out.skippedUS.push(sym); continue; }
    if (!m.allowIntraday && th && m.setOpen) { out.skippedTH.push(sym); continue; }
    out.target.push(sym); if (v3.has(sym)) out.v3.push(sym);   // ใบ v3 (Plan 4b · #66): update-prices --write --force เขียนจริง + gate ใต้ lock เอง (Plan 3) — ไม่ต้อง check-reports/ไม่มีไฟล์ให้คืน
  }
  return out;
}

/** ผลรายใบ v3 จาก stdout ของ update-prices (Plan 3 applyV3 พิมพ์บรรทัดเดียวต่อใบ) — ส่วนบริสุทธิ์ · นับเฉพาะ syms ที่ส่งมา
 *  ⚠ <SYM>: gate ตก (<codes>) · --strict-gate ไม่เขียน = rejected (reason 'strict-gate' · codes) — Plan 4b I-1
 *  ✓ = เขียนแล้ว · = … v3 … = ไม่เปลี่ยน (ไม่มี session ใหม่/feed ค้าง) · ❄ freeze [reason] = gate/decide ปฏิเสธ ไม่เขียนไฟล์
 *  · ⚠ … patch fail (v3) = plumbing ไม่เขียนไฟล์ · ✓ ที่ติด "--force เขียนทั้งที่ gate ตก" = forced (เขียนแล้วแต่ verify จะตก — ไม่ใช่ written)
 *  ใบที่ไม่มีบรรทัดผลเลย (fetch fail / JSON อ่านไม่ได้) → v3Unaccounted */
function parseV3PatchResult(out, syms) {
  const want = new Set(syms), r = { written: [], unchanged: [], rejected: [], failed: [], forced: [] };
  for (const line of String(out).split('\n')) {
    const sg = /^⚠\s+(\S+):\s+gate ตก \(([^)]*)\) · --strict-gate ไม่เขียน/.exec(line.trim());   // Plan 4b I-1: gate ตกใต้ --strict-gate = ไม่เขียน
    if (sg) { if (want.has(sg[1])) r.rejected.push({ sym: sg[1], reason: 'strict-gate', codes: sg[2].split(',').filter(Boolean) }); continue; }
    const m = /^([✓=❄⚠])\s+(\S+)\s+(.*)$/.exec(line.trim());
    if (!m || !want.has(m[2])) continue;
    if (m[1] === '✓') (/--force เขียนทั้งที่ gate ตก/.test(m[3]) ? r.forced : r.written).push(m[2]);
    else if (m[1] === '=' && /v3/.test(m[3])) r.unchanged.push(m[2]);
    else if (m[1] === '❄') r.rejected.push({ sym: m[2], reason: (/\[([a-z0-9-]+)\]/.exec(m[3]) || [, 'freeze'])[1] });
    else if (m[1] === '⚠' && /patch fail \(v3\)/.test(m[3])) r.failed.push(m[2]);
  }
  return r;
}
/** ใบ v3 ที่ส่งไป pre-patch แต่ไม่มีบรรทัดผลใน parseV3PatchResult (fetch fail · JSON อ่านไม่ได้ · ข้ามเพราะตลาดเปิด) — ส่วนบริสุทธิ์
 *  ไม่ประทับทั้ง prePatched และ prePatchRejected (ไม่รู้ผล = ไม่อ้างว่าสด · prep ตัดสินความสดจาก priceDate เองอยู่แล้ว — BUG-008) */
function v3Unaccounted(pv, syms) {
  const seen = new Set([...pv.written, ...pv.unchanged, ...pv.failed, ...(pv.forced || []), ...pv.rejected.map((x) => x.sym)]);
  return syms.filter((s) => !seen.has(s));
}

/** อ่านผล `node test/check-reports.js <syms>` → รายชื่อไฟล์ที่ "ตก" (ส่วนบริสุทธิ์ ไม่แตะดิสก์) · รับทั้ง .html และ .json (Plan 4b)
 *  บรรทัดสรุปต่อไฟล์เริ่มต้นบรรทัดเสมอ (`✗ BBB.html 41/43 ผ่าน — 2 ปัญหา`) ส่วนรายละเอียด E-code ย่อหน้าเข้ามา
 *  (`    ✗ [E15] …`) ⇒ anchor `^✗` แยกสองชั้นนี้ออกจากกัน */
function parseGateFailures(out) {
  const syms = [];
  for (const line of String(out).split('\n')) {
    const m = /^✗\s+(\S+)\.(?:html|json)\b/.exec(line);
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
 * นิยาม: **รอบใหม่ = มี flag จริงอย่างน้อย 1 ตัวที่ "ใหม่จริง" คือ `isNewFlag(แถวที่ state จำไว้, แถวรอบนี้)`**
 *        (= `flaggedAt` ไม่เท่ากับที่ state บันทึกไว้ — เกณฑ์เดียวกับที่ `upsertRow` ใช้ล้าง `ROUND_FIELDS`)
 *        `startedAt` ใหม่ = `flaggedAt` ที่ **เก่าสุด** ในกลุ่มนั้น (ไม่ใช่ `today` ไม่ใช่ค่ามากสุด —
 *        ไม่งั้น flag ที่ cron เขียนคนละวันแต่ยังเป็นรอบเดียวกันจะตกขอบทันทีที่เขียนแถวแรก)
 * ★ **ไม่มี flag ใหม่ถูกเขียน = `startedAt` ห้ามขยับ** (รีวิว C) — เดิมใช้เกณฑ์ "`flaggedAt` > `prev`" ล้วน ซึ่งพังทันที
 *   ที่คิวถือ flag จาก ≥2 วันต่างกัน: A 09-01 + B 09-03 ไม่เปลี่ยนเลย → รัน 1 ได้ `startedAt` 09-01 (เข้ารอบทั้งคู่)
 *   → รัน 2 ขยับเป็น 09-03 เพราะ B ยัง "> prev" อยู่ ⇒ A หลุดรอบทั้งที่ยังค้าง (หายจาก `status()` + ไม่บล็อก
 *   `closeIssueIfNoLlmRows` ⇒ `ship --prepatch` ปิด issue ทับงานที่ยังไม่ได้ทำ) · `flaggedAt` ของ reason เดิมอยู่ข้ามวัน
 *   ที่ cron รัน จึงเป็นสภาพปกติ ไม่ใช่เคสประหลาด
 * ★ เงื่อนไข `flaggedAt > prev` ยังคงไว้เป็นตัวประกบ (flag ที่ cron เขียนจริงมี `flaggedAt` = วันนั้นเสมอ ⇒ ≥ `prev`
 *   อยู่แล้ว ⇒ ไม่เปลี่ยนพฤติกรรมจริง) — กันรอบเปิดถอยหลังเมื่อ state/flag ไม่สอดคล้องกัน และคง semantics ของเทส
 *   3-argument เดิมไว้ (ไม่ส่ง `stocks` = "ยังไม่เคยจำแถวไหน" ⇒ ทุกแถวถือว่าใหม่)
 * ★ **แถวสังเคราะห์จากคิวอายุไม่นับ** — ไม่ใช่ flag (ไม่ได้อยู่ใน `price-flags.json`) และ preflight สร้างใหม่ด้วย
 *   `flaggedAt = วันนี้` ทุกครั้ง ⇒ ถ้านับ รอบจะรีเซ็ตเองทุกวันที่รัน preflight แม้คิวไม่เปลี่ยนเลย แล้วงานที่ยัง
 *   ค้างจากรอบก่อน (flag ถูก --force ล้างไปตอน pre-patch แล้ว) จะหลุดออกนอกรอบกลางคัน
 * ★ ไม่มี flag ใหม่เลย = รอบเดิม (คง `startedAt`) · ยังไม่เคยมีรอบและไม่มี flag = วันนี้
 * @param {object} [stocks] แถวที่ state จำไว้ (`s.stocks`) — ต้องส่ง**ก่อน** loop `upsertRow` ไม่งั้นทุกแถวจะดูเหมือนเดิมหมด
 */
function roundStart(rows, prev, today, stocks) {
  const known = stocks || {};
  const fresh = (rows || [])
    .filter((r) => !r.synthetic && r.flaggedAt && isNewFlag(known[r.symbol], r) && (!prev || r.flaggedAt > prev))
    .map((r) => r.flaggedAt);
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
  return { ...keep, reason: r.reason, bucket: r.bucket, oldPrice: r.oldPrice, currency: r.currency, footerAge: r.footerAge, skip: r.skip, flaggedAt: r.flaggedAt || null, stmtKind: r.stmtKind || null, stmtNote: r.stmtNote || null, stmt: r.stmt === undefined ? null : r.stmt, stmtWhy: r.stmtWhy || null, diffPct: r.diffPct ?? null };
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

/** สรุปแถวที่ "ไม่ทราบวันงบ" (stmt === null) — พิมพ์บรรทัดเดียวทุกครั้งที่ N>0 กันวันที่ยกเป็น FULL เป็นกลุ่มโดยเงียบ (ส่วนบริสุทธิ์)
 *  → null เมื่อ N=0 · `⚠ statement unknown: N (fetch-failed M)` + แจกแจง kind อื่นต่อท้ายเมื่อมี */
function unknownSummary(rows) {
  const u = rows.filter((r) => r.stmt === null);
  if (!u.length) return null;
  const kinds = {};
  for (const r of u) { const k = r.stmtKind || 'unknown'; kinds[k] = (kinds[k] || 0) + 1; }
  const other = Object.entries(kinds).filter(([k]) => k !== 'fetch-failed' && k !== 'no-ua').map(([k, n]) => `${k} ${n}`).join(' · ');
  return `⚠ statement unknown: ${u.length} (fetch-failed ${kinds['fetch-failed'] || 0}${kinds['no-ua'] ? ` · no-ua ${kinds['no-ua']}` : ''})${other ? ` · ${other}` : ''}`;
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

/** flag ของ update-prices ที่ preflight ใช้ pre-patch — --force ข้าม decide()/intraday/freeze · --strict-gate (Plan 4b I-1):
 *  ใบ v3 ที่ checkDoc ตกจะไม่ถูกเขียน (ไม่งั้น --force เขียนทับทั้งที่ gate ตก → ship --prepatch verify ตกทั้งชุด) */
const PREPATCH_FLAGS = ['--write', '--force', '--strict-gate'];
/** ขั้น pre-patch ของ preflight (แยกออกมาให้เทสฉีด run/must/save/log ได้ — M-4) · แก้ `s.stocks` และ `rows` ในที่
 *  ใบ v2: check-reports เฉพาะใบ v2 → ตก = prePatchRejected + git checkout -- reports/<SYM>.html
 *  ใบ v3 (Plan 4b · #66): gate อยู่ใน update-prices แล้ว (--strict-gate · IO.writeMarket + checkDoc ใต้ lock — ตก = ไม่เขียน + flag)
 *    ⇒ ไม่ยิง check-reports · ไม่มีไฟล์ให้คืน · ผลรายใบจาก stdout · ใบที่ไม่มีบรรทัดผล = ไม่ประทับอะไร
 *  deps = { run, must, save, log, out } (ไม่ส่ง = ของจริง) */
function prePatchStep(t, rows, s, today, deps) {
  const d = { run, must, save: S.save, log: (x) => console.log(x), out: (x) => process.stdout.write(x), ...(deps || {}) };
  d.log(`\n▶ pre-patch ราคา ${t.target.length} ตัวใน process เดียว (lock กันคิวเพี้ยนแล้ว — WS4)`);
  const r = d.run('node', ['tools/update-prices.js', ...PREPATCH_FLAGS, ...t.target]);
  d.out(r.out);
  if (r.code !== 0) throw new Error('pre-patch ล้ม: ' + (r.err || r.out).slice(-1000));
  const v2T = t.target.filter((x) => !t.v3.includes(x));
  if (t.v3.length) {
    const pv = parseV3PatchResult(r.out, t.v3);
    // invariant: --strict-gate ⇒ update-prices ไม่เขียนใบที่ gate ตก · ถ้ายังเห็น forced = update-prices ไม่รู้จัก flag (บั๊ก) → หยุดก่อนประทับอะไร
    if (pv.forced.length) throw new Error(`pre-patch: --strict-gate แต่ update-prices ยังเขียนใบ v3 ทั้งที่ gate ตก — ${pv.forced.join(' ')} · คืนไฟล์: git checkout -- ${pv.forced.map((x) => `reports/${x}.json`).join(' ')} แล้วตรวจ update-prices`);
    const unacc = v3Unaccounted(pv, t.v3);
    const v3Bad = pv.rejected.map((x) => x.sym).concat(pv.failed);
    applyGateResult(s.stocks, t.v3.filter((x) => !unacc.includes(x)), v3Bad, today);
    for (const sym of v3Bad) { const row = rows.find((x) => x.symbol === sym); if (row) row.prePatchRejected = today; }
    d.log(`\nℹ v3 pre-patch: เขียน ${pv.written.length} · ไม่เปลี่ยน ${pv.unchanged.length} · ปฏิเสธ ${pv.rejected.length} (gate ใต้ lock · ไม่เขียนไฟล์) · ล้ม ${pv.failed.length}`
      + `${pv.rejected.length ? ` — ${pv.rejected.map((x) => `${x.sym}[${x.reason}]`).join(' ')}` : ''}${pv.failed.length ? ` · ล้ม: ${pv.failed.join(' ')}` : ''}`);
    if (unacc.length) d.log(`⚠ v3 ${unacc.join(' ')}: ไม่พบบรรทัดผล pre-patch (fetch fail/อ่านใบไม่ได้/ตลาดเปิด — ดูด้านบน) · ไม่ประทับสถานะ · prep ตัดสินความสดจาก priceDate เอง`);
  }
  // ★ ใบ v2: --force ข้าม quarantine ของ cron (cron patch แล้ว gate ตก = ไม่เขียนไฟล์ + flag patch-rejected) ⇒ ต้องยิง gate เอง
  //   ใบที่ตกต้องคืนไฟล์ ไม่งั้น `ship --prepatch` จะ verify ตกทั้งชุด และใบที่ดีก็ push ไม่ได้ (--strict-gate ไม่มีผลกับสาย v2)
  let failed = [];
  if (v2T.length) {
    d.log('\n▶ gate หลัง pre-patch: node test/check-reports.js ' + v2T.join(' '));
    const g = d.run('node', ['test/check-reports.js', ...v2T]);
    d.out(g.out);
    failed = parseGateFailures(g.out);
    if (g.code !== 0 && !failed.length) throw new Error('check-reports หลัง pre-patch ล้มแต่แยกไฟล์ที่ตกไม่ได้ — ตรวจเอง (ราคาที่ patch ยังอยู่ในไฟล์):\n' + (g.err || g.out).trim().slice(-1000));
    applyGateResult(s.stocks, v2T, failed, today);
    for (const sym of failed) {   // สะท้อนลงแถวของรอบนี้ด้วย — manualSteps อ่านจาก rows ไม่ใช่ state
      const row = rows.find((x) => x.symbol === sym);
      if (row) row.prePatchRejected = today;
    }
  }
  d.save(s);   // บันทึกก่อนคืนไฟล์ — checkout ล้มแล้ว throw ก็ยังเหลือสถานะให้ postcheck/status อ่าน
  for (const sym of failed) {   // ใบ v2 เท่านั้น (v2T) — ใบ v3 ที่ gate ตกไม่ถูกเขียนตั้งแต่แรก
    d.must('git', ['checkout', '--', `reports/${sym}.html`], `คืนไฟล์ ${sym} หลัง gate ตก`);
    d.log(`⛔ ${sym} gate ตกหลัง pre-patch → คืนไฟล์แล้ว (ต้องแก้ใบให้ผ่าน npm test -- ${sym} ก่อน · ดูรายละเอียดด้านบน)`);
  }
  return { failed };
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
  const s = S.load();   // ★ (open-item #26) ต้องอ่านก่อน plan() — synthAge() ใน plan ต้องใช้ state เดิมตัดสิน flaggedAt ต่อเนื่องของแถวอายุ
  const lightRule = parseLightRule(o.lightRule, process.env);   // queue.js ส่งค่า --light-rule มา · ไม่ส่ง = env LIGHT_RULE · ไม่มี = new
  const secOn = !o.noSec && lightRule !== 'legacy';   // SEC fallback เฉพาะกฎใหม่ · ยิงเฉพาะแถวในคิวที่ปฏิทินไม่มี last (lazy ใน triage) — --no-sec ปิด
  const rows = plan(flags, today, { ...o, ageLimit, lightRule, earningsAfterOf: o.earningsAfterOf || earningsAfterOfWith(cal, readLite), priorStocks: s.stocks,
    statementAfterOf: o.statementAfterOf || statementAfterOfWith(cal, readLite, { today, sec: secOn ? secFetcher() : null }) });
  console.log(`\nกฎ LIGHT/FULL: ${lightRule === 'legacy' ? 'legacy (EPS screen ±2% ยกเป็น UPDATE · งบออกหลังวิเคราะห์ยก flip เป็น LIGHT)' : 'ใหม่ (LIGHT ⇔ ไม่มีงบใหม่หลัง footer · ไม่รู้วันงบ = FULL · ขยับ >30% = FULL)'}`);
  console.log(`\n=== คิว price-flags ${flags.length} รายการ · ${today} ===\n${renderTable(rows)}`);
  const nCal = Object.keys(cal.symbols || {}).length;
  console.log(nCal
    ? `ปฏิทินงบ: ${nCal} symbol · รู้วันประกาศครั้งล่าสุดแล้ว ${withLast} ใบ (flip ของใบที่งบออกหลังวิเคราะห์ถูกยกเป็น LIGHT)`
    : 'ปฏิทินงบ: ไม่มี earnings-calendar.json — flip ยกเป็น LIGHT ด้วยอายุ footer อย่างเดียว (docs/price-refresh.md)');
  const us = unknownSummary(rows);
  if (us) console.log(us);
  const aq = ageQueue(today);
  if (aq.length) {
    console.log(`อายุเกิน ${STALE_DAYS} วัน ${aq.length} ใบ (รอบนี้เอา ${rows.filter((r) => r.synthetic).length} แก่สุด · --age N ปรับได้): ${aq.slice(0, 10).map((r) => `${r.symbol}(${r.footerAge}d)`).join(' ')}${aq.length > 10 ? ' …' : ''}`);
    console.log('   (แถวอายุเป็นงานเสริม ไม่ได้อยู่ใน price-flags.json — ship --prepatch จะรายงานว่ายังเหลือแถวต้องส่ง LLM จนกว่าจะทำจบ หรือตัดออกด้วย --no-age)');
  }
  s.startedAt = roundStart(rows, s.startedAt || null, today, s.stocks);   // ★ ก่อน upsertRow — ต้องเทียบกับแถวที่ state จำไว้
  for (const r of rows) s.stocks[r.symbol] = upsertRow(s.stocks[r.symbol], r);
  S.save(s);   // บันทึก snapshot ก่อน pre-patch — patch ล้มก็ต้องเหลือราคาเดิมให้ postcheck ใช้
  const t = patchTargets(rows, { usOpen: usSessionOpen(), setOpen: setSessionOpen(), allowIntraday: !!o.allowIntraday });
  if (t.skippedUS.length) console.log(`\n⏳ ตลาด US เปิดอยู่ — ไม่ pre-patch ${t.skippedUS.join(' ')} (ราคา intraday · --force ข้าม guard ของ update-prices เอง — บทเรียน 9 ก.ย. 69) · ต้องการจริงใส่ --allow-intraday`);
  if (t.skippedTH.length) console.log(`\n⏳ SET เปิดอยู่ — ไม่ pre-patch ${t.skippedTH.join(' ')} · --allow-intraday ถ้าจงใจ`);
  if (t.skippedNoReport.length) console.log(`\n⚠ ไม่มีไฟล์รายงาน — ไม่ pre-patch ${t.skippedNoReport.join(' ')} (ลบไปแล้ว? รัน node tools/tag-apply.js --prune แล้วปล่อยให้ cron ตัด flag ทิ้ง)`);
  if (t.target.length && !o.noPatch) prePatchStep(t, rows, s, today);
  else if (t.target.length) console.log(`\n(--no-patch) คำสั่งที่จะรัน: node tools/update-prices.js ${PREPATCH_FLAGS.join(' ')} ${t.target.join(' ')}`);
  S.save(s);
  console.log(manualSteps(rows));
  return rows;
}

module.exports = { preflight, prePatchStep, PREPATCH_FLAGS, plan, ageQueue, listReportsFS, parseV3PatchResult, v3Unaccounted, earningsAfterOfWith, statementAfterOfWith, unknownSummary, patchTargets, renderTable, manualSteps, loadFlags, parseGateFailures, roundStart, isNewFlag, upsertRow, applyGateResult, synthAge };
