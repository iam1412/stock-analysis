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
const FOOTER_RE = /ข้อมูล\s*ณ\s*(?:วันที่\s*)?(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/;

function footerDate(html) {
  const s = String(html);
  const fi = s.lastIndexOf('<footer');
  if (fi < 0) return null;
  const m = s.slice(fi).match(FOOTER_RE);
  if (!m) return null;
  const month = TH[m[2]];
  if (!month) return null;
  let yearCE = +m[3];
  const era = yearCE > 2400 ? 'BE' : 'CE';
  if (era === 'BE') yearCE -= 543;
  const day = +m[1];
  return { iso: `${yearCE}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, era, day, month, yearCE, raw: m[0] };
}
const ageDays = (iso, todayISO) => Math.round((Date.parse(todayISO) - Date.parse(iso)) / 86400000);
const todayBangkok = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

module.exports = { footerDate, ageDays, todayBangkok, FOOTER_RE, TH };
