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

// "ก้อนเงิน" ที่ยกมาอ้างอิง — คำศัพท์เดียวกับสกุลเงินหน้าราคา header (report-meta.CUR_SRC) แต่เขียนไว้ที่นี่
// เพราะไฟล์นี้ห้าม require อะไรในรีโป (กัน cycle เหมือน report-meta.js)
const MONEY_TOK = /(?:C\$|[฿$])\s*[\d.,]+/;
// วันที่ที่ **ตามด้วยตัวคั่นช่วงแล้ววันที่อีกตัว** คือ "ต้นช่วง" (ช่วงกราฟย้อนหลัง/งวดข้อมูล) ไม่ใช่จุดเวลาของราคา
// — เขียนทับ = ประทับวันรันลงบนข้อเท็จจริงในอดีต · วัดจริง 12 ก.ย. 69: TLI "กราฟราคา ก.ค. 2568–ก.ค. 2569" ·
// AEONTS "(ราคา + กราฟย้อนหลัง ก.ค.2568–ก.ค.2569)" (ช่วงวันภายในเดือนเดียว "14–18 มิ.ย. 2569" ไม่เข้าข่าย —
// DAY_DATE_RE จับเป็น token เดียวอยู่แล้ว)
const RANGE_SEP_RE = /^\s*(?:&[a-zA-Z#0-9]{1,8};|[–—\-~]|ถึง)\s*/;
const isRangeStart = (s, after) => {
  const m = RANGE_SEP_RE.exec(s.slice(after));
  if (!m) return false;
  const rest = s.slice(after + m[0].length);
  return DAY_DATE_RE.test(rest) || MONTH_DATE_RE.test(rest);
};

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

/** @param {{from?:number, rejectMoney?:boolean}} [opts] — from = เริ่มหา anchor ที่ตำแหน่งนี้ (วนหาหลายจุด)
 *  rejectMoney = ถ้ามี "ก้อนเงิน" คั่นระหว่าง anchor กับวันที่ ให้ข้าม anchor นั้น (ดู findDiscPriceDate) */
function scan(s, opts) {
  const o = opts || {};
  ANCHOR_RE.lastIndex = o.from || 0;
  let a;
  while ((a = ANCHOR_RE.exec(s))) {
    const start = a.index + a[0].length;
    let i = start;
    while (i - start <= GAP_MAX) {
      const rest = s.slice(i);
      const d = DAY_DATE_RE.exec(rest);
      const mo = d ? null : MONTH_DATE_RE.exec(rest);
      if (d || mo) {
        // ราคาที่ "ยกมาอ้างอิง" คั่นอยู่ = วันที่นี้เป็นวันของ snapshot แหล่งข้อมูล ไม่ใช่วันที่ของราคาในรายงาน
        if (o.rejectMoney && (MONEY_TOK.test(s.slice(start, i)) || isRangeStart(s, i + (d || mo)[0].length))) break;   // ข้าม anchor นี้ ไปตัวถัดไป
        return d ? mk(i, d[0], parseInt(d[2] || d[1], 10), d[3], d[4], true) : mk(i, mo[0], 1, mo[1], mo[2], false);
      }
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

/** เขียนวันที่แบบ canonical (เดือนตัวย่อ) — คง พ.ศ./ค.ศ. ตามของเดิมที่ถูกแทน
 *  hasDay=false → เขียนกลับเป็น "เดือน ปี" (ไม่เติมวัน) — ใช้กับ .disc ที่ต้นฉบับลงวันที่ระดับเดือน
 *  ("ราคา ณ ม.ค. 2569") · หัวรายงานยังเติมวันเสมอเพราะ parsePriceAge อ่านเฉพาะรูปที่มีวัน */
function renderThaiDate(day, monIdx, yearCE, isBE, hasDay) {
  const y = isBE ? yearCE + 543 : yearCE;
  return `${hasDay === false ? '' : day + ' '}${THAI_MONTHS[monIdx]} ${y}`;
}

/**
 * hit จาก findPriceDate/findRestatedDate → เติม yearCE + iso (ค.ศ. เสมอ)
 * ★ แยกออกมาเพราะ parsePriceDate รับ "HTML ที่ต้องสแกนหา anchor ราคา" ไม่ใช่ "สตริงวันที่"
 *   ⇒ ผู้เรียกที่มี hit อยู่แล้ว (เช่น findRestatedDate) ต้องใช้ตัวนี้ ห้าม slice ข้อความแล้วส่งกลับเข้า parsePriceDate
 *   (สตริงวันที่เปล่า ๆ ไม่มี anchor ⇒ คืน null เงียบ — เคส f11/f12 ของ tools/field-manifest.js)
 */
function dateIso(hit) {
  if (!hit || hit.monIdx < 0) return null;
  const year = hit.isBE ? hit.year - 543 : hit.year;
  return { ...hit, yearCE: year, iso: `${year}-${String(hit.monIdx + 1).padStart(2, '0')}-${String(hit.day).padStart(2, '0')}` };
}

/**
 * ── วันที่ราคาใน **บล็อก .disc** (เจ้าของเดียว: ตัวอ่านของ gate/f12 กับตัวเขียนของ cron ใช้ตัวนี้ตัวเดียว) ──
 *
 * ที่มา (ทบทวนทั้งสาขา 12 ก.ย. 2569): f12 เคยห่อ `parsePriceDate` (ตัวสแกน**หัวรายงาน**) ส่วนตัวเขียนเป็น
 * regex ฝังใน `tools/update-prices.js` ที่ห้ามมีตัวเลขคั่น ⇒ อ่านกับเขียนคนละกฎ: 65 ใบ "อ่านออกแต่เขียนไม่ได้"
 * (55 ใบเป็น snapshot ของแหล่ง "(ราคา $79.39 · 2 ก.ค. 2569 · P/E …)" ที่ **ห้ามเขียนทับ** · 10 ใบเป็นวันที่
 * ระดับเดือน "ราคา ณ ม.ค. 2569" ที่ตัวเขียนพลาดจริง) — และอีกทางหนึ่ง 33 ใบที่ตัวเขียนเขียนอยู่ทุกวัน
 * ("ราคา/chart ณ …", "ราคาและงบการเงิน ณ …") ตัวสแกนหัวรายงานอ่านไม่ออกเลย
 *
 * กฎที่นี่จึงเป็น **สองชั้นรวมกัน** (เลือกจุดที่มาก่อนในบล็อก):
 *   ก) ชั้นกว้าง — วันที่ที่ **ระบุวัน** + คำเชื่อมสั้น ≤25 ตัวอักษรที่ไม่มีตัวเลข/แท็ก/"เป้า" คั่น
 *      = กฎเดิมของตัวเขียน (วัด 12 ก.ย. 69: ครอบคลุมทุกจุดที่ cron เขียนอยู่แล้ว 412 ใบ ไม่หายสักใบ)
 *   ข) ชั้นแคบ — คำศัพท์ตัวเชื่อมชุดเดียวกับหัวรายงาน (GAP_CHUNKS) รับวันที่**ระดับเดือน**ด้วย
 *      ★ วันที่ระดับเดือนต้องใช้ชั้นแคบเท่านั้น เพราะในบล็อก .disc เดือนลอย ๆ มักเป็น "ช่วงกราฟย้อนหลัง"
 *        หรือ "งวดงบ" ไม่ใช่วันที่ราคา — วัดจริง: AEONTS "(ราคา + กราฟย้อนหลัง ก.ค.2568–ก.ค.2569)" ·
 *        LPH "(Factsheet ราคา P/E P/BV EV/EBITDA · ณ ก.ค. 2569 / FY2568)" ⇒ ถ้าปล่อยชั้นกว้างรับเดือนด้วย
 *        cron จะประทับวันรันทับข้อเท็จจริงในอดีต = บั๊กเดิม 9 ส.ค. 69 ที่ไฟล์นี้ตั้งขึ้นมาเพื่อกัน
 *   ทั้งสองชั้นปฏิเสธ "ก้อนเงินคั่น" (MONEY_TOK) เหมือนกัน = snapshot ของแหล่ง ไม่ใช่วันที่ของราคา
 *
 * @param {string} discHtml  HTML ของบล็อก `<div class="disc">…</div>`
 * @param {number} [from]    เริ่มหา anchor ที่ตำแหน่งนี้ (ตัวเขียนวนเก็บทุกจุดในบล็อก)
 * @returns {{index:number,length:number,iso:string,yearCE:number,hasDay:boolean,isBE:boolean}|null}
 */
function findDiscPriceDate(discHtml, from) {
  const s = String(discHtml);
  const at = from || 0;
  const wide = discWide(s, at);
  const narrow = scan(s, { from: at, rejectMoney: true });
  const hit = !wide ? narrow : !narrow ? wide : (wide.index <= narrow.index ? wide : narrow);
  return dateIso(hit);
}

const DISC_ANCHOR_RE = /ราคา/g;
const DISC_GAP_MAX = 25;          // เท่ากับกฎเดิมของตัวเขียน (`[^0-9<]{0,25}`) — เปลี่ยนตัวเลขนี้ = เปลี่ยนขอบเขตที่ cron เขียน
/** ชั้นกว้าง — เฉพาะวันที่ที่ระบุวัน (ดูเหตุผลใน findDiscPriceDate) */
function discWide(s, from) {
  DISC_ANCHOR_RE.lastIndex = from || 0;
  let a;
  while ((a = DISC_ANCHOR_RE.exec(s))) {
    const start = a.index + a[0].length;
    for (let j = 0; j <= DISC_GAP_MAX; j++) {
      const gap = s.slice(start, start + j);
      // ตัวเลขคั่น = ราคา/ตัวคูณที่ยกมา (MONEY_TOK เป็นรูปที่เจอจริง) · "เป้า" = วันที่ของราคาเป้านักวิเคราะห์
      // (เคส CREDIT) · "<" = ข้ามแท็กออกนอกประโยค — ทั้งสามอย่างแปลว่า anchor นี้ไม่ได้พูดถึงวันที่ของราคา
      if (/[<0-9]/.test(gap) || gap.includes('เป้า') || MONEY_TOK.test(gap)) break;
      const d = DAY_DATE_RE.exec(s.slice(start + j));
      if (d) { if (isRangeStart(s, start + j + d[0].length)) break; return mk(start + j, d[0], parseInt(d[2] || d[1], 10), d[3], d[4], true); }
    }
  }
  return null;
}

/** ทุกจุด "ราคา ณ <วันที่>" ในบล็อก .disc (ตัวอ่านเดียวกับ f12 — วนจนหมดบล็อกเพราะบางใบเขียนซ้ำ 2 จุด
 *  เช่น "ราคา ณ …" + "ราคาปิดรายเดือน ณ …" · วัด 12 ก.ย. 69: 13/908 ใบมี ≥2 จุด)
 *  ★ ย้ายมาจาก `tools/update-prices.js` (ระยะ 2 ส่วน C) — **ย้ายเฉย ๆ ไม่แก้พฤติกรรม**: cron import กลับไปใช้ตัวนี้
 *  ตัวเดียว และ migrator (tools/migrate-v2.js) ใช้ตัวเดียวกันหา "จุดที่ต้องแทนด้วย {{rd:priceDate}}"
 *  ⇒ ที่ cron เคยเขียนวันที่ตรงไหน token ก็ไปลงตรงนั้นเป๊ะ (พิสูจน์ความเท่าเดิมด้วย equivalence check
 *  บนคลังจริง 100 ใบคร่อมทั้ง พ.ศ./ค.ศ. และมี/ไม่มีวันที่ใน .disc — ดู task-7-report.md) */
function allDiscDates(discHtml) {
  const out = [];
  for (let from = 0, h; (h = findDiscPriceDate(discHtml, from)); from = h.index + h.length) out.push(h);
  return out;
}

/** วันที่ราคาเป็น ค.ศ. + iso — ใช้โดย gate (staleness E27/W09) · รับ **HTML ที่มี anchor "ราคา"** ไม่ใช่สตริงวันที่เปล่า */
function parsePriceDate(headerHtml) {
  return dateIso(findPriceDate(headerHtml));
}

module.exports = { findPriceDate, findRestatedDate, findDiscPriceDate, allDiscDates, parsePriceDate, dateIso, renderThaiDate, THAI_MONTHS, THAI_MONTHS_FULL, MONTH_ALT };
