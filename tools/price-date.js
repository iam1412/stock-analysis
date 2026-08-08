'use strict';
/**
 * price-date.js — ที่เดียวที่รู้ว่า "วันที่ราคา" ในหัวรายงานอยู่ตรงไหน
 *
 * ที่มาของไฟล์นี้ (บั๊ก 9 ส.ค. 2569):
 *   patchReport เคยแทน date-token **ทุกตัว** ใน <header> ด้วยวันที่รัน ⇒ วันที่ที่เป็น
 *   "ข้อเท็จจริงในอดีต" โดนประทับเป็นวันนี้ทุกครั้งที่ cron รัน — วันจุดสูงสุดตลอดกาล
 *   (INTC: 22 มิ.ย. 2026 → วันที่รัน) · วันมีผลของ split/เปลี่ยนสัญลักษณ์/spin-off
 *   (KLAC, BNY, HON) · วันประกาศงบ (RKLB, ADVICE, IBM) · วันเหตุการณ์ราคาในอดีต (AEHR)
 *
 *   gate จับไม่ได้เพราะฝั่งอ่าน (check-reports.parsePriceAge) หาวันที่ราคาด้วยกฎ
 *   "token **สุดท้าย** ใน 140 ตัวอักษรหลังคำว่า ราคา" = อ่านโดนวันที่ ATH พอดี ⇒ ตัวเขียน
 *   กับตัวอ่านผิดคนละทางแต่ผลลัพธ์ตรงกันเป๊ะ เลยดู "สอดคล้อง" ทุกวัน
 *
 *   ⇒ กฎเดียวกับ report-meta.js: ตัวเขียน (update-prices) กับตัวอ่าน (check-reports)
 *     ต้องชี้ token เดียวกันจากที่นี่ที่เดียว ไม่งั้นแก้ฝั่งเดียว = อีกฝั่งฟ้อง staleness ปลอม
 *     (พิสูจน์แล้ว: คืนวัน ATH ของ INTC เป็น 22 มิ.ย. โดยไม่แก้ parsePriceAge ⇒ gate อ่านได้
 *      ageDays 48 วัน → W09 เตือน "ราคาเริ่มเก่า" ทั้งที่ราคาสดวันนี้)
 *
 * หลักการหา: วันที่ราคาคือ date-token **ตัวแรก** ที่อยู่ถัดจากคำนำหน้าราคา ("ราคา"/"ราคาปิด")
 * โดยระหว่างกลางมีได้เฉพาะ "ตัวเชื่อม" ที่ระบุไว้ (ณ · ≈ · ปิดตลาด · ตัวเลขราคา · แท็ก ฯลฯ)
 * — เดินทีละ chunk แบบ deterministic ไม่ใช่ regex ซ้อน `*` (กัน catastrophic backtracking)
 * หาไม่เจอ = **ไม่เดา** → caller โยน error (cron จะ flag patch-failed ให้เห็นในคิว)
 * ดีกว่าเดาผิดเงียบ ๆ แบบเดิม
 */

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// บางรายงานเขียนชื่อเดือนเต็ม ("1 กรกฎาคม 2569") — อ่านได้ทั้งสองแบบ แต่เขียนกลับเป็นตัวย่อเสมอ
// (ตัวย่อคือแบบ canonical แบบเดียวที่ทุกตัวอ่านในรีโปนี้ parse ออก)
const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// ชื่อเต็มไว้ก่อนใน alternation — ไม่งั้น "มิถุนายน" จะ match "มิ.ย." ครึ่งเดียวไม่ได้/ผิดตัว
const MONTH_ALT = THAI_MONTHS_FULL.concat(THAI_MONTHS.map((m) => m.replace(/\./g, '\\.'))).join('|');
const YEAR = '(20\\d\\d|25\\d\\d|26\\d\\d)';

/** "7 ส.ค. 2026" · "14–18 มิ.ย. 2569" · "1 กรกฎาคม 2569" */
const DAY_DATE_RE = new RegExp(`^(\\d{1,2})(?:\\s*[–\\-]\\s*(\\d{1,2}))?\\s*(${MONTH_ALT})\\s*${YEAR}`);
/** "มิถุนายน 2569" — บางรายงานลงวันที่ระดับเดือน */
const MONTH_DATE_RE = new RegExp(`^(${MONTH_ALT})\\s*${YEAR}`);

/** คำนำหน้าที่บอกว่า "ตัวเลขวันที่ถัดจากนี้คือวันที่ของราคา" */
const ANCHOR_RE = /ราคา(?:ปิด)?/g;

// ตัวเชื่อมที่ยอมให้คั่นระหว่าง anchor กับวันที่ — ปิดรายการไว้โดยตั้งใจ:
// ร้อยแก้วไทย (เช่น "จากจุดสูงสุดตลอดกาล", "มีผล", "ประกาศผลประกอบการ") ไม่อยู่ในรายการ
// ⇒ scanner หยุดทันที ⇒ วันที่ที่ตามหลังร้อยแก้วถูก "คงไว้" ไม่ใช่ "เขียนทับ"
const GAP_CHUNKS = [
  /^\s+/,                       // ช่องว่าง/ขึ้นบรรทัด
  /^<[^>]*>/,                   // แท็ก inline (<b> <br> <span>)
  /^&[a-zA-Z#0-9]{1,8};/,       // entity (&nbsp;)
  /^ปิดตลาด/,                    // ต้องมาก่อน /^ปิด/ ไม่งั้นเหลือ "ตลาด" ค้าง
  /^ปิด/, /^ตลาด/,
  /^ณ/, /^เมื่อ/, /^ที่/,          // คำเชื่อมบอกเวลา
  /^[฿$]?[\d.,]+/,              // ราคาที่แทรกอยู่ ("ราคา $127.94 ปิด <วันที่>")
  /^[≈~≃=]/,                    // "ประมาณ"
  /^[·•,:;\-—–()[\]]/,          // เครื่องหมายวรรคตอน
  /^[A-Za-z][A-Za-z.]{0,5}/,    // ADR / ADS / GDR / ชื่อย่อแหล่ง
];
const GAP_MAX = 48;             // ระยะ anchor→วันที่ ที่ยาวสุดในรีโปจริง ~19 ตัวอักษร

/**
 * หา "วันที่ราคา" ในหัวรายงาน
 * @param {string} headerHtml  HTML ของ <header> (หรือทั้งไฟล์ก็ได้ — จะเจาะ .px-meta ให้เอง)
 * @returns {{index:number,length:number,text:string,day:number,monIdx:number,year:number,
 *            isBE:boolean,hasDay:boolean}|null}
 *          index/length อ้างอิง string ที่ส่งเข้ามา (splice กลับได้ตรง ๆ)
 */
function findPriceDate(headerHtml) {
  const s = String(headerHtml);
  // จำกัดขอบเขตที่ .px-meta ก่อน — คำโปรยธุรกิจ (.sub) ก็มีคำว่า "ราคา" ได้ (เช่น "ราคาทองคำ")
  // ถ้าใน .px-meta หาไม่เจอค่อยถอยไปทั้ง header (รายงานเก่าที่วางวันที่ราคาไว้นอกบล็อก)
  const pm = s.match(/<div class="px-meta">[\s\S]*?<\/div>/i);
  if (pm) {
    const hit = scan(pm[0]);
    if (hit) return { ...hit, index: hit.index + pm.index };
  }
  return scan(s);
}

function scan(s) {
  ANCHOR_RE.lastIndex = 0;
  let a;
  while ((a = ANCHOR_RE.exec(s))) {
    const start = a.index + a[0].length;
    let i = start;
    while (i - start <= GAP_MAX) {
      const rest = s.slice(i);
      const d = DAY_DATE_RE.exec(rest);
      if (d) return mk(i, d[0], parseInt(d[2] || d[1], 10), d[3], d[4], true);
      const mo = MONTH_DATE_RE.exec(rest);
      if (mo) return mk(i, mo[0], 1, mo[1], mo[2], false);
      const chunk = GAP_CHUNKS.find((re) => re.test(rest));
      if (!chunk) break;                       // เจอร้อยแก้ว = anchor นี้ไม่ได้พูดถึงวันที่ราคา
      i += chunk.exec(rest)[0].length;
    }
  }
  return null;
}

function mk(index, text, day, monName, yearStr, hasDay) {
  let monIdx = THAI_MONTHS.indexOf(monName);
  if (monIdx < 0) monIdx = THAI_MONTHS_FULL.indexOf(monName);
  const year = parseInt(yearStr, 10);
  return { index, length: text.length, text, day, monIdx, year, isBE: year >= 2400, hasDay };
}

/**
 * บางรายงานทวนวันที่ราคาซ้ำในวงเล็บทันที — คนละศักราช ("ราคา ณ 7 ส.ค. 2569 (7 ส.ค. 2026)")
 * หรือมีคำขยาย ("(7 ส.ค. 2569 ตลาดปิด)") — AZN·CSGP·DPZ·HIG·PFE·PNC·SNNP
 * ตัวนี้ต้องขยับตามวันที่ราคา ไม่งั้นหัวรายงานจะขัดกันเอง ("ราคา ณ 9 ส.ค. 2569 (7 ส.ค. 2026)")
 *
 * เงื่อนไขแคบโดยตั้งใจ — ต้อง (1) ติดกับ token ราคาเลย มีได้แค่ช่องว่าง/แท็ก แล้ว "(" และ
 * (2) **เป็นวันเดียวกัน** กับวันที่ราคาเดิม ⇒ เป็นการ "ทวนซ้ำ" ไม่ใช่ข้อเท็จจริงคนละตัว
 * (ตัดเคส INTC "$141.45 (22 มิ.ย. 2026)" ด้วยข้อ 1 · ตัด AMKR "· ร่วง ~24% วันเดียว (7 ส.ค. 2026)"
 *  ด้วยข้อ 1 เพราะมีร้อยแก้วคั่น แม้วันจะตรงกันก็ตาม)
 * @returns {{index:number,length:number,isBE:boolean}|null}
 */
function findRestatedDate(headerHtml, hit) {
  const after = String(headerHtml).slice(hit.index + hit.length);
  const pre = /^(?:\s|<[^>]*>)*\(\s*/.exec(after);
  if (!pre) return null;
  const rest = after.slice(pre[0].length);
  const d = DAY_DATE_RE.exec(rest);
  const mo = d ? null : MONTH_DATE_RE.exec(rest);
  if (!d && !mo) return null;
  const h2 = d ? mk(0, d[0], parseInt(d[2] || d[1], 10), d[3], d[4], true)
    : mk(0, mo[0], 1, mo[1], mo[2], false);
  const ce = (x) => (x.isBE ? x.year - 543 : x.year);
  if (h2.monIdx < 0 || h2.day !== hit.day || h2.monIdx !== hit.monIdx || ce(h2) !== ce(hit)) return null;
  return { ...h2, index: hit.index + hit.length + pre[0].length };
}

/** เขียนวันที่แบบ canonical (เดือนตัวย่อ) — คง พ.ศ./ค.ศ. ตามของเดิมที่ถูกแทน */
function renderThaiDate(day, monIdx, yearCE, isBE) {
  return `${day} ${THAI_MONTHS[monIdx]} ${isBE ? yearCE + 543 : yearCE}`;
}

/** วันที่ราคาเป็น ค.ศ. + iso — ใช้โดย gate (staleness E27/W09) */
function parsePriceDate(headerHtml) {
  const hit = findPriceDate(headerHtml);
  if (!hit || hit.monIdx < 0) return null;
  const year = hit.isBE ? hit.year - 543 : hit.year;
  return { ...hit, yearCE: year, iso: `${year}-${String(hit.monIdx + 1).padStart(2, '0')}-${String(hit.day).padStart(2, '0')}` };
}

module.exports = { findPriceDate, findRestatedDate, parsePriceDate, renderThaiDate, THAI_MONTHS, THAI_MONTHS_FULL, MONTH_ALT };
