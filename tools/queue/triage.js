'use strict';
/**
 * triage คิว price-flags ตาม reason — **ครบทุก reason ที่ tools/update-prices.js + dead-ticker-canary.js + preflight (สังเคราะห์) เขียนได้**
 * ระยะ 1 ข้อ D: `mos-sign-flip` = PREPATCH (ราคาอย่างเดียว ไม่ส่ง LLM — cron เป็นเจ้าของช่องสรุปแล้ว ไม่มี prose ให้ขัด)
 *   ยกเป็น LIGHT เมื่อ (ก) งบออกหลังวันวิเคราะห์ (earnings-calendar.json · Task 17) หรือ (ข) footer อายุ > STALE_DAYS
 * reason สังเคราะห์จาก preflight (ไม่ได้มาจาก cron): age-gt-90d · earnings-after-analysis
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
  LIGHT: 'UPDATE-LIGHT (SKILL 5C) — runbook pre-patch ราคาให้แล้ว · prep จะยกเป็น UPDATE ถ้า EPS ต่าง >2%',
  FULL: 'UPDATE เต็ม — ตรวจ split/ticker ก่อนเขียนเลข (bad-chart: ดูฐาน chart.data ในไฟล์ก่อน — SKILL STEP 0)',
  PLUMBING: 'ไม่ใช้ agent — symbol-map / stock-meta / ราคาในไฟล์ / เช็คเพิกถอน (SKILL STEP 0)',
  REJECTED: 'cron patch แล้ว gate ตก — อ่าน detail แก้ไฟล์ให้ npm test ผ่าน (ไม่ใช่ re-analyze)',
  DELIST: 'ยืนยันแหล่งปฐมภูมิ → ลบรายงาน + tag-apply --prune · ยังเทรด → update-prices --alive · ห้าม re-analyze',
  UNKNOWN: 'reason ไม่รู้จัก — เพิ่มใน tools/queue/triage.js',
};
const FRESH_DAYS = 7;    // CLAUDE.md §3.1
const STALE_DAYS = 90;   // WS6 ข้อ 3: ใบอายุ >1 ไตรมาส ต้องเข้าคิวแม้ราคาไม่ขยับ

function bucketOf(reason) {
  const r = String(reason);
  if (/^drift-gt-\d+pct$/.test(r)) return 'LIGHT';
  return BUCKET[r] || 'UNKNOWN';
}
function triage(flags, ctx) {
  const c = ctx || {};
  const staleDays = c.staleDays == null ? STALE_DAYS : c.staleDays;
  const freshDays = c.freshDays == null ? FRESH_DAYS : c.freshDays;
  return flags.map((f) => {
    let bucket = bucketOf(f.reason), escalated = null;
    const footerAge = c.footerAgeOf ? c.footerAgeOf(f.symbol) : null;
    if (bucket === 'PREPATCH') {
      const after = c.earningsAfterOf ? c.earningsAfterOf(f.symbol) : null;
      if (after) { bucket = 'LIGHT'; escalated = 'earnings'; }
      else if (footerAge != null && footerAge > staleDays) { bucket = 'LIGHT'; escalated = 'age'; }
    }
    const fresh = footerAge != null && footerAge <= freshDays;
    const skip = fresh && (bucket === 'LIGHT' || bucket === 'FULL') ? `สด ≤${freshDays} วัน (footer) — ไม่วิเคราะห์ซ้ำ (CLAUDE.md §3.1)` : null;
    const why = escalated === 'age' ? ` (ยกจาก PREPATCH: อายุ >${staleDays} วัน)` : escalated === 'earnings' ? ' (ยกจาก PREPATCH: งบออกหลังวิเคราะห์)' : '';
    return { ...f, bucket, escalated, action: ACTION[bucket] + why, footerAge, skip };
  });
}
/** ตัวที่ต้อง pre-patch ราคา: PREPATCH ทุกแถว (ราคาสดไม่มีโทษ) + LIGHT/FULL ที่ไม่ skip */
const prePatchList = (rows) => rows.filter((r) => r.bucket === 'PREPATCH' || (!r.skip && (r.bucket === 'LIGHT' || r.bucket === 'FULL'))).map((r) => r.symbol);
/** ตัวที่ต้องส่ง LLM (prep → spawn): LIGHT/FULL ที่ไม่ skip */
const llmList = (rows) => rows.filter((r) => !r.skip && (r.bucket === 'LIGHT' || r.bucket === 'FULL')).map((r) => r.symbol);

module.exports = { BUCKET, ACTION, FRESH_DAYS, STALE_DAYS, bucketOf, triage, prePatchList, llmList };
