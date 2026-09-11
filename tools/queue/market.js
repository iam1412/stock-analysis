'use strict';
/**
 * ตลาดเปิดอยู่ไหม — เช็คก่อน pre-patch ด้วย --force เพราะ --force ข้าม guard intraday ของ update-prices เอง
 * (บทเรียน 9 ก.ย. 69: pre-patch ตอนเย็นไทย = กลาง session US ⇒ ประทับราคา intraday ทั้งชุด)
 * ใช้ Intl + timeZone ตรง ๆ ไม่คิด DST เอง · ไม่รู้วันหยุด (ตัวตัดสินจริงคือ isIntradayQuote ใน update-prices — นี่แค่กันพลาดหยาบ ๆ)
 */
function partsIn(tz, d) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const o = {};
  for (const p of f.formatToParts(d || new Date())) o[p.type] = p.value;
  return { dow: o.weekday, min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
}
const weekend = (p) => p.dow === 'Sat' || p.dow === 'Sun';
/** NYSE/NASDAQ 09:30–16:00 ET จันทร์–ศุกร์ */
function usSessionOpen(now) { const p = partsIn('America/New_York', now); return !weekend(p) && p.min >= 9 * 60 + 30 && p.min < 16 * 60; }
/** SET 10:00–16:30 ICT (พักเที่ยงยังนับว่าเปิด — ราคาไม่ใช่ราคาปิด) */
function setSessionOpen(now) { const p = partsIn('Asia/Bangkok', now); return !weekend(p) && p.min >= 10 * 60 && p.min < 16 * 60 + 30; }
module.exports = { usSessionOpen, setSessionOpen, partsIn };
