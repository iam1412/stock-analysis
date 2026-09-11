'use strict';
/**
 * triage คิว price-flags ตาม reason — **ครบทุก reason ที่ tools/update-prices.js + dead-ticker-canary.js เขียนได้**
 * (docs-audit C14: เดิม no-stock-meta / currency-mismatch ไม่มีกฎที่ไหนเลย · patch-rejected เพิ่มระยะ 0)
 * เพิ่ม reason ใหม่ในโค้ด cron = ต้องเพิ่มที่นี่ (queue-test ยิงทุก reason)
 */
const BUCKET = {
  'mos-sign-flip': 'LIGHT', 'drift-gt-15pct': 'LIGHT',
  'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL',
  'fetch-failed': 'PLUMBING', 'patch-failed': 'PLUMBING', 'no-stock-meta': 'PLUMBING', 'currency-mismatch': 'PLUMBING', 'bad-price': 'PLUMBING', 'bad-report-price': 'PLUMBING',
  'patch-rejected': 'REJECTED', 'not-on-exchange': 'DELIST',
};
const ACTION = {
  LIGHT: 'UPDATE-LIGHT (SKILL 5C) — runbook pre-patch ราคาให้แล้ว',
  FULL: 'UPDATE เต็ม — ตรวจ split/ticker ก่อนเขียนเลข (bad-chart: ดูฐาน chart.data ในไฟล์ก่อน — SKILL STEP 0)',
  PLUMBING: 'ไม่ใช้ agent — symbol-map / stock-meta / ราคาในไฟล์ / เช็คเพิกถอน (SKILL STEP 0)',
  REJECTED: 'cron patch แล้ว gate ตก — อ่าน detail แก้ไฟล์ให้ npm test ผ่าน (ไม่ใช่ re-analyze)',
  DELIST: 'ยืนยันแหล่งปฐมภูมิ → ลบรายงาน + tag-apply --prune · ยังเทรด → update-prices --alive · ห้าม re-analyze',
  UNKNOWN: 'reason ไม่รู้จัก — เพิ่มใน tools/queue/triage.js',
};
const FRESH_DAYS = 7;   // CLAUDE.md §3.1

function bucketOf(reason) {
  const r = String(reason);
  if (/^drift-gt-\d+pct$/.test(r)) return 'LIGHT';
  return BUCKET[r] || 'UNKNOWN';
}
function triage(flags, ctx) {
  const c = ctx || {};
  return flags.map((f) => {
    const bucket = bucketOf(f.reason);
    const footerAge = c.footerAgeOf ? c.footerAgeOf(f.symbol) : null;
    const fresh = footerAge != null && footerAge <= (c.freshDays == null ? FRESH_DAYS : c.freshDays);
    const skip = fresh && (bucket === 'LIGHT' || bucket === 'FULL') ? `สด ≤${FRESH_DAYS} วัน (footer) — ไม่วิเคราะห์ซ้ำ (CLAUDE.md §3.1)` : null;
    return { ...f, bucket, action: ACTION[bucket], footerAge, skip };
  });
}
const prePatchList = (rows) => rows.filter((r) => !r.skip && (r.bucket === 'LIGHT' || r.bucket === 'FULL')).map((r) => r.symbol);

module.exports = { BUCKET, ACTION, FRESH_DAYS, bucketOf, triage, prePatchList };
