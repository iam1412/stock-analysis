'use strict';
/**
 * วันที่วิเคราะห์ = "ข้อมูล ณ <วัน> <เดือน> <ปี>" ใน <footer> เท่านั้น (preserve-dates.js ใช้จุดเดียวกัน)
 * ★ ห้ามใช้ reports.json.updated ตัดสินความสด — bulk freshHash ชนกันได้ (13 ใบ 9 ก.ย. 69 · C15)
 * ★ อ่านเฉพาะหลัง <footer> ตัวสุดท้าย — ในเนื้อหามีวลีเดียวกัน ("SET Factsheet ข้อมูล ณ FY2568")
 */
const TH = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
  'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4, 'พฤษภาคม': 5, 'มิถุนายน': 6, 'กรกฎาคม': 7, 'สิงหาคม': 8, 'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12,
};
/** คลังชื่อเดือนจริง (ยาวก่อนสั้น) — ใช้กับ **รูปแบบใหม่เท่านั้น**
 *  ★ ต้องเข้มกว่า `[ก-๙.]+` ของทางเดิม เพราะรูป "เดือนล้วน" ไม่มีตัวเลขวันมานำหน้าให้ยึด ⇒ ถ้าปล่อยหลวม
 *    "ข้อมูล ณ ราคาปิด 2569" / "ข้อมูล ณ FY2568" จะกลายเป็นวันที่วิเคราะห์ปลอม (queue-test ยิงเคสนี้) */
const MON = Object.keys(TH).sort((a, b) => b.length - a.length).map((m) => m.replace(/\./g, '\\.')).join('|');
const DASH = '[–—\\-]';   // en dash (ที่ใช้จริงในคลัง) · em dash · ASCII hyphen

// ── FOOTER_RE = 3 ทางเลือก เรียงตาม "ทางเดิมต้องชนะเสมอ" (#38 · ระยะ 3 Task 8) ──────────────
// (ก) `day`   — วันเดียว หรือช่วงวัน–วันในเดือนเดียวกัน ("10 ก.ย. 2569" · "22–23 มิ.ย. 2569")
//               ★ คงไว้ทุก byte และอยู่ **ทางแรก** ⇒ 896 ใบที่อ่านได้อยู่แล้วเดินเส้นทางเดิมเป๊ะ
// (ข) `range` — ช่วงข้ามเดือน/ข้ามปี ("31 ก.ค. – 2 ส.ค. 2026" · "24 มิ.ย.–13 ส.ค. 2026") → **ใช้วันแรก**
//               ให้ตรงกับกติกาช่วงวันที่มีอยู่เดิม · ปีที่พิมพ์เป็นของวันสุดท้าย ⇒ เดือนแรก > เดือนสุดท้าย = ถอยปี
// (ค) `month` — เดือนล้วน ("มกราคม 2569" · "เม.ย. 2569") → **วันที่ 1 ของเดือน** (ruling #38)
//               ระมัดระวัง = ทำให้ดูเก่ากว่าความจริงเล็กน้อย ไม่ใช่ใหม่กว่า ⇒ ไม่มี false-fresh ที่จะทำให้
//               dedup 7 วัน (CLAUDE.md §3.1) / staleness 90 วัน ข้ามใบที่ควรเข้าคิว re-analyze
const FOOTER_RE = new RegExp(
  'ข้อมูล\\s*ณ\\s*(?:วันที่\\s*)?(?:'
  + '(?<day>\\d{1,2})(?:\\s*[–\\-]\\s*\\d{1,2})?\\s*(?<mon>[ก-๙.]+)\\s*(?<year>\\d{4})'
  + `|(?<rDay>\\d{1,2})\\s*(?<rMon>${MON})\\s*${DASH}\\s*\\d{1,2}\\s*(?<rMonEnd>${MON})\\s*(?<rYear>\\d{4})`
  + `|(?<mMon>${MON})\\s*(?<mYear>\\d{4})`
  + ')'
);

function footerDate(html) {
  const s = String(html);
  const fi = s.lastIndexOf('<footer');
  if (fi < 0) return null;
  const m = s.slice(fi).match(FOOTER_RE);
  if (!m) return null;
  const g = m.groups;
  let form, day, month, yearCE;
  if (g.day != null) {                      // (ก) ทางเดิม — เงื่อนไข "เดือนไม่รู้จัก → null" ต้องคงไว้
    month = TH[g.mon];
    if (!month) return null;
    day = +g.day; yearCE = +g.year; form = 'day';
  } else if (g.rDay != null) {              // (ข) ช่วงข้ามเดือน
    month = TH[g.rMon]; day = +g.rDay; yearCE = +g.rYear; form = 'range';
  } else {                                  // (ค) เดือนล้วน
    month = TH[g.mMon]; day = 1; yearCE = +g.mYear; form = 'month';
  }
  const era = yearCE > 2400 ? 'BE' : 'CE';
  if (era === 'BE') yearCE -= 543;
  // ช่วงคร่อมปีใหม่ ("31 ธ.ค. – 2 ม.ค. 2569") — ปีที่พิมพ์เป็นของวันสุดท้าย ⇒ วันแรกอยู่ปีก่อนหน้า (เก่ากว่า)
  if (form === 'range' && month > TH[g.rMonEnd]) yearCE -= 1;
  return { iso: `${yearCE}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, era, day, month, yearCE, form, raw: m[0] };
}
const ageDays = (iso, todayISO) => Math.round((Date.parse(todayISO) - Date.parse(iso)) / 86400000);
const todayBangkok = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

module.exports = { footerDate, ageDays, todayBangkok, FOOTER_RE, TH };
