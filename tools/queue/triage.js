'use strict';
/**
 * triage คิว price-flags ตาม reason — **ครบทุก reason ที่ tools/update-prices.js + dead-ticker-canary.js + preflight (สังเคราะห์) เขียนได้**
 * ระยะ 1 ข้อ D: `mos-sign-flip` = PREPATCH (ราคาอย่างเดียว ไม่ส่ง LLM — cron เป็นเจ้าของช่องสรุปแล้ว ไม่มี prose ให้ขัด)
 *   ยกเป็น LIGHT เมื่อ (ก) งบออกหลังวันวิเคราะห์ (earnings-calendar.json · Task 17) หรือ (ข) footer อายุ > STALE_DAYS
 * reason สังเคราะห์จาก preflight (ไม่ได้มาจาก cron): age-gt-90d · earnings-after-analysis
 * ★ กฎ LIGHT/FULL ใหม่ (เจ้าของตัดสิน 22 ก.ย. 69 · docs/decisions.md §9) — default; `--light-rule legacy` = พฤติกรรมเดิม 1 release:
 *   LIGHT ⇔ ไม่มีงบไตรมาส/ปีที่ประกาศหลังวันที่ footer "ข้อมูล ณ" · FULL ถ้ามีงบใหม่ / **ตัดสินวันงบไม่ได้** / ราคาขยับ >30% (ค่า `diffPct` ที่ cron บันทึก)
 *   ช่วงกลาง drift 15–30% ไม่มีงบใหม่ = LIGHT · BUCKET ข้างล่างคือ bucket ฐานตาม reason (legacy) — กฎใหม่ปรับทับใน triage()
 *   ★ `diffPct` = เทียบกับราคาที่เก็บ**ในรายงาน** (= ราคาที่ cron patch ครั้งล่าสุด) — ในภาวะปกติคือราคาปิดเมื่อวาน · สะสมเกินหนึ่งวันเฉพาะแถวที่ถูก freeze ค้างหลายวัน
 *   และการสะสมผิดทางปลอดภัย (FULL เกินจริง ไม่ใช่ขาด) · ช่องโหว่ที่ยอมรับ: split อัตราเล็ก (~20–25% เช่น 5:4) ผ่านเป็น LIGHT ได้ — กฎเดิมก็มองไม่เห็นเช่นกัน
 *   วันงบไม่ทราบ (stmt=null): แถว PREPATCH (flip) คง PREPATCH + บันทึก `statement-unknown` (ห้ามยก no-worker row เป็น worker) · แถว LIGHT/FULL = FULL
 * เพิ่ม reason ใหม่ที่ไหน = ต้องเพิ่มที่นี่ (queue-test ยิงทุก reason)
 */
const BUCKET = {
  'mos-sign-flip': 'PREPATCH',
  'drift-gt-15pct': 'LIGHT', 'age-gt-90d': 'LIGHT', 'earnings-after-analysis': 'LIGHT',
  'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL',
  'fetch-failed': 'PLUMBING', 'patch-failed': 'PLUMBING', 'no-stock-meta': 'PLUMBING', 'currency-mismatch': 'PLUMBING', 'bad-price': 'PLUMBING', 'bad-report-price': 'PLUMBING',
  'patch-rejected': 'REJECTED', 'not-on-exchange': 'DELIST',
};
const ACTION = {
  PREPATCH: 'ราคาอย่างเดียว — runbook pre-patch แล้ว ship --prepatch จบ ไม่ spawn worker (ข้อ D: flip ในย่าน FV ไม่มีข้อมูลใหม่)',
  LIGHT: 'UPDATE-LIGHT (SKILL 5C) — ไม่มีงบใหม่หลัง footer · runbook pre-patch ราคาให้แล้ว · EPS ต่าง vendor เป็นแค่คำเตือนใน prep (ไม่เปลี่ยนโหมด)',
  FULL: 'UPDATE เต็ม — ตรวจ split/ticker ก่อนเขียนเลข (bad-chart: ดูฐาน chart.data ในไฟล์ก่อน — SKILL STEP 0)',
  PLUMBING: 'ไม่ใช้ agent — symbol-map / stock-meta / ราคาในไฟล์ / เช็คเพิกถอน (SKILL STEP 0)',
  REJECTED: 'cron patch แล้ว gate ตก — อ่าน detail แก้ไฟล์ให้ npm test ผ่าน (ไม่ใช่ re-analyze)',
  DELIST: 'ยืนยันแหล่งปฐมภูมิ → ลบรายงาน + tag-apply --prune · ยังเทรด → update-prices --alive · ห้าม re-analyze',
  UNKNOWN: 'reason ไม่รู้จัก — เพิ่มใน tools/queue/triage.js',
};
const FRESH_DAYS = 7;    // CLAUDE.md §3.1
const STALE_DAYS = 90;   // WS6 ข้อ 3: ใบอายุ >1 ไตรมาส ต้องเข้าคิวแม้ราคาไม่ขยับ
const FULL_DRIFT_PCT = 30;   // เจ้าของ 22 ก.ย. 69: ขยับ >30% = FULL (cron freeze ที่ >25% เป็น suspect-split — triage ตัดสินจากค่า ไม่ใช่ชื่อ reason)

/** ตัวแปลค่า --light-rule ตัวเดียว (queue.js ส่งค่าจาก args.js `--light-rule <v>`/`--light-rule=<v>` มาที่นี่ · ไม่ส่ง = env LIGHT_RULE · ไม่มี = new)
 *  → 'new'|'legacy' · ค่าอื่น throw */
function parseLightRule(v, env) {
  const x = v != null && v !== '' ? v : (env || process.env).LIGHT_RULE;
  if (x == null || x === '' || x === 'new') return 'new';
  if (x === 'legacy') return 'legacy';
  throw new Error(`--light-rule ต้องเป็น new|legacy (ได้ "${x}")`);
}

function bucketOf(reason) {
  const r = String(reason);
  if (/^drift-gt-\d+pct$/.test(r)) return 'LIGHT';
  return BUCKET[r] || 'UNKNOWN';
}
/** กฎใหม่ (ส่วนบริสุทธิ์) — คืน { bucket, escalated, stmt, stmtWhy, drift } ให้ bucket ฐานของ reason
 *  bucket ที่ไม่ใช่เนื้อหา (PLUMBING/REJECTED/DELIST/UNKNOWN) ไม่แตะ · bad-chart = FULL เสมอ */
function ruleNew(f, base, c, footerAge, staleDays) {
  const drift = f.diffPct != null && Number.isFinite(+f.diffPct) ? Math.abs(+f.diffPct) : null;
  if (!['PREPATCH', 'LIGHT', 'FULL'].includes(base)) return { bucket: base, escalated: null, drift };
  if (f.reason === 'bad-chart') return { bucket: 'FULL', escalated: null, drift };
  const raw = c.statementAfterOf ? c.statementAfterOf(f.symbol) : null;
  const st = raw && typeof raw === 'object' ? raw : { after: raw == null ? null : !!raw };
  const stmt = st.after, stmtWhy = st.detail || null;
  const out = (bucket, escalated) => ({ bucket, escalated, stmt, stmtWhy, stmtKind: stmt == null ? (st.kind || null) : null, drift });
  if (stmt === true) return out('FULL', 'statement');
  // ไม่ทราบวันงบ: flip (PREPATCH · ไม่ส่ง worker) ห้ามถูกยกเป็น worker เพราะไม่รู้ ⇒ คง PREPATCH + บันทึก note · แถวที่เป็นงาน worker อยู่แล้ว (LIGHT/FULL) ⇒ FULL
  if (stmt == null && base !== 'PREPATCH') return out('FULL', 'stmt-unknown');
  if (drift != null && drift > FULL_DRIFT_PCT) return out('FULL', 'drift30');
  if (f.reason === 'suspect-split-or-data' && drift == null) return out('FULL', 'drift-unknown');
  if (base === 'PREPATCH') {
    const o2 = footerAge != null && footerAge > staleDays ? out('LIGHT', 'age') : out('PREPATCH', null);
    return stmt == null ? { ...o2, stmtNote: 'statement-unknown' } : o2;
  }
  return out('LIGHT', base === 'FULL' ? 'drift-mid' : null);
}
function triage(flags, ctx) {
  const c = ctx || {};
  const legacy = c.lightRule === 'legacy';
  const staleDays = c.staleDays == null ? STALE_DAYS : c.staleDays;
  const freshDays = c.freshDays == null ? FRESH_DAYS : c.freshDays;
  return flags.map((f) => {
    let bucket = bucketOf(f.reason), escalated = null, ext = {};
    const footerAge = c.footerAgeOf ? c.footerAgeOf(f.symbol) : null;
    if (!legacy) {
      const r = ruleNew(f, bucket, c, footerAge, staleDays);
      bucket = r.bucket; escalated = r.escalated; ext = { stmt: r.stmt, stmtWhy: r.stmtWhy, stmtNote: r.stmtNote || null, stmtKind: r.stmtKind || null, drift: r.drift };
    } else if (bucket === 'PREPATCH') {
      const after = c.earningsAfterOf ? c.earningsAfterOf(f.symbol) : null;
      if (after) { bucket = 'LIGHT'; escalated = 'earnings'; }
      else if (footerAge != null && footerAge > staleDays) { bucket = 'LIGHT'; escalated = 'age'; }
    }
    const fresh = footerAge != null && footerAge <= freshDays;
    const skip = fresh && (bucket === 'LIGHT' || bucket === 'FULL') ? `สด ≤${freshDays} วัน (footer) — ไม่วิเคราะห์ซ้ำ (CLAUDE.md §3.1)` : null;
    const NEWWHY = { statement: 'FULL: มีงบใหม่หลัง footer', 'stmt-unknown': 'FULL: ไม่รู้วันงบล่าสุด', drift30: `FULL: ราคาขยับ >${FULL_DRIFT_PCT}%`, 'drift-unknown': 'FULL: suspect-split แต่ไม่รู้ขนาดการขยับ', 'drift-mid': `LIGHT: ขยับ ≤${FULL_DRIFT_PCT}% ไม่มีงบใหม่` };
    const why = !legacy && escalated === 'age' ? ` (ยกจาก PREPATCH: อายุ >${staleDays} วัน · ไม่มีงบใหม่)` : !legacy && escalated ? ` (${NEWWHY[escalated]}${ext.stmtWhy ? ' — ' + ext.stmtWhy : ''})` : !legacy && ext.stmtWhy ? ` (${ext.stmtWhy})` : escalated === 'age' ? ` (ยกจาก PREPATCH: อายุ >${staleDays} วัน)` : escalated === 'earnings' ? ' (ยกจาก PREPATCH: งบออกหลังวิเคราะห์)' : '';
    return { ...f, bucket, escalated, action: ACTION[bucket] + why, footerAge, skip, ...ext };
  });
}
/** ตัวที่ต้อง pre-patch ราคา: PREPATCH ทุกแถว (ราคาสดไม่มีโทษ) + LIGHT/FULL ที่ไม่ skip */
const prePatchList = (rows) => rows.filter((r) => r.bucket === 'PREPATCH' || (!r.skip && (r.bucket === 'LIGHT' || r.bucket === 'FULL'))).map((r) => r.symbol);
/** ตัวที่ต้องส่ง LLM (prep → spawn): LIGHT/FULL ที่ไม่ skip */
const llmList = (rows) => rows.filter((r) => !r.skip && (r.bucket === 'LIGHT' || r.bucket === 'FULL')).map((r) => r.symbol);

module.exports = { BUCKET, ACTION, FRESH_DAYS, STALE_DAYS, FULL_DRIFT_PCT, parseLightRule, bucketOf, triage, prePatchList, llmList };
