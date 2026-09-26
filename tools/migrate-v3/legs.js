'use strict';
/**
 * legs.js (migrate-v3) — ขา .vmethod ของใบ v2 (mname/mdesc/mval) → method enum ของ v3 (spec §3.1) + แกะ inputs
 * แล้วคิดซ้ำด้วย tools/v3/legs.js เทียบกับ .mval ที่พิมพ์ไว้ — ขาที่คิดซ้ำได้ = ok:true · ไม่ได้ = ok:false พร้อม why เสมอ (ห้ามเงียบ)
 * regex เป็น heuristic ที่วัดบนคลังจริง (Plan 4 Task 0 · 25 ก.ย. 69) — ok:false ไม่ได้แปลว่าใบผิด แปลว่าต้องเป็น declared/ตัดสินมือ
 * เกณฑ์คิดซ้ำ = reproduces(): max(1.5%, ครึ่งหน่วยทศนิยมที่พิมพ์) · ขา ok ทุกขาคืน {inputs, override} ที่ L.legValue คิดได้ mval บน f เดียวกัน (ห้ามย้อนแก้ตัวเลข)
 * ชื่อวิธีที่ลงท้าย "?" = จับได้จาก mdesc เท่านั้น (ชื่อขาไม่บอก) · ไม่ใช่วงวน: อ่าน tools/v3/legs.js + schema.js (OVERRIDE_KEYS) ทางเดียว
 */
const L = require('../v3/legs.js');
const OVR = new Set(require('../v3/schema.js').OVERRIDE_KEYS.filter((k) => k !== 'why'));

const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
const num = (s) => (s == null ? null : parseFloat(String(s).replace(/,/g, '')));
const CUR = '(?:US\\$|C\\$|HK\\$|NT\\$|S\\$|A\\$|\\$|฿|€|£|¥|RMB\\s*|CHF\\s*)';
const SCALE = { t: 1e12, tn: 1e12, trillion: 1e12, b: 1e9, bn: 1e9, billion: 1e9, m: 1e6, mn: 1e6, million: 1e6, k: 1e3,
  'ล้านล้าน': 1e12, 'แสนล้าน': 1e11, 'หมื่นล้าน': 1e10, 'พันล้าน': 1e9, 'ร้อยล้าน': 1e8, 'ล้าน': 1e6, 'ลบ.': 1e6, 'ลบ': 1e6 };

// money value in the shown .mval ("฿163" · "$1,542.56" · "~$233")
function mvalNum(s) { const m = new RegExp(`${CUR}\\s*~?\\s*${NUM}`).exec(s) || new RegExp(NUM).exec(s); return m ? num(m[1]) : null; }
function mvalCur(s) { const m = /(US\$|C\$|HK\$|\$|฿|€|£|¥|บาท)/.exec(s); return m ? m[1] : null; }

// context / non-FV legs (spec §3.6 I) — v2 marks them in the name
const CONTEXT_RE = /บริบท|ไม่นับ|ไม่รวม(?:ใน)?\s*(?:กรอบ\s*)?(?:FV|ค่าเฉลี่ย|การเฉลี่ย)|ตรวจสอบ(?:ความสมเหตุสมผล)?\s*(?:—|-|$)|sanity|cross-?check|อ้างอิงเท่านั้น|ไม่ใช้คำนวณ|ไม่ถ่วง|น้ำหนัก\s*0/i;
const ANALYST_RE = /analyst|นักวิเคราะห์|consensus|เป้าเฉลี่ย|intrinsic\s*\(?analyst|Morningstar|GuruFocus|Alpha\s*Spread/i;

const RULES = [
  ['analyst', (n) => ANALYST_RE.test(n)],
  ['declared:sotp', (n) => /SOTP|Sum[-\s]*of[-\s]*(?:the[-\s]*)?Parts|แยกส่วน|ผลรวมส่วน/i.test(n)],
  ['declared:nav', (n) => /\bR?NAV\b|Net\s*Asset\s*Value|มูลค่าสินทรัพย์สุทธิ|P\/NAV|Book\s*NAV/i.test(n)],
  ['declared:rnpv', (n) => /rNPV|risk[-\s]*adjusted\s*NPV|pipeline/i.test(n)],
  ['pbv:justified', (n) => /Justified\s*P\/T?BV|P\/T?BV\s*(?:เหมาะสม|Justified)|Gordon.*P\/BV|P\/BV.*(?:ROE|Gordon)/i.test(n)],
  ['ri', (n) => /Residual\s*Income|\bRI\b|Excess\s*Return|ส่วนเกินกำไร/i.test(n)],
  ['ddm2', (n) => /DDM.*(?:2|สอง|two|multi|หลาย)[-\s]*(?:stage|ระยะ|ช่วง)|(?:2|สอง|two)[-\s]*(?:stage|ระยะ|ช่วง).*DDM|DDM.*อายุ|DDM.*สัมปทาน/i.test(n)],
  ['ddm', (n) => /DDM|Gordon|Dividend\s*Discount|ปันผลคิดลด|Dividend\s*Growth/i.test(n)],
  ['dcf', (n) => /DCF|Discounted\s*Cash|กระแสเงินสดคิดลด|FCFE|FCFF/i.test(n)],
  ['evebitda', (n) => /EV\s*\/\s*EBITDA/i.test(n)],
  ['evsales', (n) => /EV\s*\/\s*(?:Sales|Revenue|รายได้|ยอดขาย)/i.test(n)],
  ['fcfyield', (n) => /FCF\s*Yield|Free\s*Cash\s*Flow\s*Yield|(?:FCF|กระแสเงินสด).*Yield/i.test(n)],
  ['pfcf', (n) => /P\s*\/\s*FCF|Price\s*\/?\s*(?:to\s*)?FCF|P\/CF|Price\s*\/?\s*Cash\s*Flow/i.test(n)],
  ['pffo', (n) => /P\s*\/\s*A?FFO|Price\s*\/\s*A?FFO/i.test(n)],
  ['ps', (n) => /\bP\s*\/\s*S\b|Price[-\s]*to[-\s]*Sales|P\/Sales|ยอดขาย|P\/Revenue/i.test(n)],
  ['pbv', (n) => /P\s*\/\s*T?BV|P\s*\/\s*B\b|Price\s*\/?\s*(?:to\s*)?Book|มูลค่าทางบัญชี/i.test(n)],
  ['pe', (n) => /P\s*\/\s*E|\bPE\b|Earnings|PEG|กำไรต่อหุ้น/i.test(n)],
];
function classifyName(mname, mdesc) {
  for (const [id, f] of RULES) if (f(mname)) return id;
  for (const [id, f] of RULES) if (id !== 'analyst' && f(mdesc)) return id + '?';   // fallback on desc (marked ?)
  return 'unclassified';
}

// ── input extractors ──
const pctAll = (s) => [...s.matchAll(/([+\-−]?[0-9]+(?:\.[0-9]+)?)\s*%/g)].map((m) => num(m[1].replace('−', '-')));
const pctAfter = (s, labelRe) => { const m = new RegExp(`(?:${labelRe})[^0-9%]{0,24}?([+\\-−]?[0-9]+(?:\\.[0-9]+)?)\\s*%`, 'i').exec(s); return m ? num(m[1].replace('−', '-')) : null; };
function moneyAll(s) {
  const re = new RegExp(`${CUR}\\s*~?\\s*${NUM}\\s*(ล้านล้าน|แสนล้าน|หมื่นล้าน|พันล้าน|ร้อยล้าน|ล้าน|ลบ\\.?|[TtBbMmKk](?:n|illion)?(?![A-Za-z]))?`, 'g');
  return [...s.matchAll(re)].map((m) => { const k = (m[2] || '').toLowerCase(); const sc = SCALE[k] || SCALE[m[2]] || 1; return { v: sc === 1 ? num(m[1]) : +(num(m[1]) * sc).toPrecision(15), raw: m[0], scaled: sc !== 1, at: m.index }; });
}
const multAll = (s) => [...s.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(?:x|เท่า)(?![A-Za-z])/g)].map((m) => ({ v: num(m[1]), at: m.index }));
const close = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol * Math.max(1e-9, Math.abs(b));

// ลองคิดขา v3 — คืนค่า หรือ null เมื่อ inputs ใช้ไม่ได้ (legValue throw)
function tryLeg(leg, f) { try { return L.legValue(leg, f, 'x'); } catch (_) { return null; } }

const pctNum = (s) => parseFloat(String(s).replace(/−/g, '-'));

/** ทศนิยมที่พิมพ์ใน .mval ("$184.49" → 2 · "฿198" → 0) · รับตัวเลขดิบด้วย (ใช้ทศนิยมของ String(n) — "1.50" ที่แปลงแล้วจะนับได้ 1 ⇒ ส่งข้อความ .mval เมื่อมี) */
function mvalDp(mval) {
  if (mval == null) return 0;
  const s = typeof mval === 'number' ? (/e/i.test(String(mval)) ? '' : String(mval)) : ((new RegExp(`${CUR}\\s*~?\\s*${NUM}`).exec(mval) || new RegExp(NUM).exec(mval) || [])[1] || '');
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}
/** เกณฑ์ "คิดซ้ำได้": |v − mval| ≤ max(1.5%·|mval|, ครึ่งหน่วยของทศนิยมที่พิมพ์) — ห้ามมีเพดานตายตัวเป็นหน่วยเงิน (หุ้นราคาหลักหน่วย 0.5 = หลายสิบ %)
 *  mval = ข้อความ .mval (แนะนำ) หรือตัวเลข */
function reproduces(v, mval) {
  const n = typeof mval === 'number' ? mval : mvalNum(mval);
  if (n == null || v == null || !Number.isFinite(v)) return false;
  return Math.abs(v - n) <= Math.max(0.015 * Math.abs(n), 0.5 * Math.pow(10, -mvalDp(mval))) + 1e-9;
}

// ── บทบาทของตัวเงินที่พิมพ์ใน mdesc (Task 4 R1-I1) — ตัวตั้ง (FCF/EBITDA/รายได้) ต้องเป็นก้อนที่ผู้เขียนใช้เป็นฐานจริง
// ไม่ใช่หนี้/เงินสด/PV/EV/TV/ส่วนผู้ถือหุ้น/สมาชิกของลิสต์รายปี ที่บังเอิญคิดซ้ำได้ใกล้ mval แล้วถูกเขียนลง override
const BASE_LABEL = {
  fcf: /FCF|free\s*cash\s*flow|กระแสเงินสด(?:อิสระ)?|เงินสดอิสระ|cash\s*flow/gi,
  ebitda: /EBITDA/gi,
  revenue: /รายได้|ยอดขาย|revenue|sales/gi,
};
const ROLE_LABELS = [
  ['excluded', /PV|มูลค่าปัจจุบัน|\bEV\b|\bTV\b|terminal|มูลค่าปลายทาง|equity|ส่วน(?:ของ)?ผู้ถือหุ้น|มูลค่าหุ้น|มูลค่าตลาด|market\s*cap|\bNCI\b|ส่วนได้เสียที่ไม่มีอำนาจ/gi],
  ['netDebt', /net\s*debt|หนี้(?:สิน)?(?:มีดอกเบี้ย)?สุทธิ/gi],
  ['netCash', /net\s*cash|เงินสดสุทธิ/gi],
  ['debt', /debt|borrowing|หนี้|เงินกู้/gi],
  ['cash', /\bcash\b(?!\s*flow)|เงินสด(?!อิสระ)|สภาพคล่อง|liquidity/gi],
];
const EXCLUDED_RE = new RegExp(ROLE_LABELS[0][1].source, 'i');
const MULT_NAME = /\b(?:EV|P)\s*\/\s*(?:EBITDA|Sales|Revenue|FCF|CF|S|E|BV|B)\b|(?:EV|P)\s*\/\s*(?:รายได้|ยอดขาย)/gi;   // ชื่อตัวคูณ ไม่ใช่ป้ายของตัวเงิน
const blank = (x) => ' '.repeat(x.length);
/** ตัวเงินทุกก้อน + role จากป้ายที่อยู่ใกล้ที่สุดในข้อความตั้งแต่ตัวเงินก่อนหน้า (≤60 ตัวอักษร)
 *  role: 'base' (ป้ายตรงตระกูล baseKey) · 'excluded' · 'netDebt' · 'netCash' · 'debt' · 'cash' · null (ไม่มีป้าย)
 *  ป้ายฐานที่มีป้ายตัดออกนำหน้าในวลีเดียวกัน ("PV ของ FCF …") = excluded · list = สมาชิกของลิสต์ x / y / z */
function moneyRoles(mdesc, baseKey) {
  const ms = moneyAll(mdesc); let prevEnd = 0;
  const labels = (baseKey && BASE_LABEL[baseKey] ? [['base', BASE_LABEL[baseKey]]] : []).concat(ROLE_LABELS);
  return ms.map((x, i) => {
    const end = x.at + x.raw.length;
    const pre = mdesc.slice(Math.max(prevEnd, x.at - 60), x.at).replace(MULT_NAME, blank);
    // สมาชิกลิสต์: คั่นด้วย "/" จากตัวเงินก่อนหน้า · หรือตามด้วย "/ ตัวเลข" ที่ไม่ใช่จำนวนหุ้น ("$13.9B / 285M shares" = หาร ไม่ใช่ลิสต์)
    const fol = /^\s*\/\s*~?\s*(?:US\$|C\$|HK\$|\$|฿|€|£|¥)?\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*(?:พันล้าน|ล้าน|[MBK]n?(?![A-Za-z]))?\s*(\S*)/.exec(mdesc.slice(end));
    const list = (i > 0 && /^\s*\/\s*~?\s*$/.test(mdesc.slice(prevEnd, x.at))) || (fol != null && !/^(?:หุ้น|shares?|ADS)/i.test(fol[1]));
    prevEnd = end;
    let best = null;
    for (const [role, re] of labels) for (const m of pre.matchAll(re)) {
      const e = m.index + m[0].length;
      if (!best || e > best.e || (e === best.e && m.index < best.s)) best = { role, e, s: m.index };
    }
    let role = best ? best.role : null;
    // "PV ของ FCF …" — ป้ายตัดออกนำหน้าป้ายฐานในวลีเดียวกัน
    if (role === 'base' && EXCLUDED_RE.test(pre.slice(Math.max(0, best.s - 20), best.s).split(/[·;()×=+−]|—|⇒/).pop())) role = 'excluded';
    // "ไม่รวมเงินสดสุทธิ ฿32 ล้าน" — ผู้เขียนบอกว่าไม่ได้ใช้ก้อนนี้
    if (/^(?:netDebt|netCash|debt|cash)$/.test(role) && /(?:ไม่(?:ได้)?\s*(?:รวม|หัก|บวก|นับ)|excl(?:uding|\.)?|\bnot)\s*$/i.test(pre.slice(Math.max(0, best.s - 16), best.s))) role = 'excluded';
    // ยอดรวมที่ตามหลัง "… × ตัวคูณ =" โดยไม่มีป้าย = ผลคูณ (EV/มูลค่ารายส่วน) ไม่ใช่ตัวตั้ง
    if (role === null && x.scaled && /[=≈]\s*~?\s*$/.test(pre) && /×|[0-9]\s*x\b/.test(pre)) role = 'excluded';
    return { ...x, end, role, list };
  });
}
/** ก้อนที่เป็นตัวตั้งได้ (ไม่ใช่สมาชิกลิสต์ · role base หรือไม่มีป้าย) เรียงก้อนที่ป้ายตรงตระกูลก่อน — ก้อนที่มีป้ายหนี้/เงินสด/PV/EV/TV/ส่วนผู้ถือหุ้นไม่เข้าเลย */
function baseCandidates(roles) {
  const c = roles.filter((x) => !x.list && (x.role === 'base' || x.role === null));
  return c.filter((x) => x.role === 'base').concat(c.filter((x) => x.role === null));
}
/** หนี้สุทธิที่ผู้เขียนพิมพ์ (สัญญา v3: เงินสดสุทธิ = ติดลบ) — ก้อนหนี้สุทธิ/เงินสดสุทธิ (ต่อหุ้น × shares) · หนี้ − เงินสด (รวม · ก้อนแรก) */
function labelledNetDebt(mdesc, roles, shares) {
  const rs = (roles || moneyRoles(mdesc)).filter((x) => !x.list);
  const out = [];
  for (const x of rs.filter((y) => y.scaled).concat(rs.filter((y) => !y.scaled))) {   // ยอดรวมก่อน ต่อหุ้น × shares ทีหลัง
    const v = x.scaled ? x.v : (shares ? x.v * shares : null);
    if (v == null) continue;
    if (x.role === 'netDebt') out.push(v);
    if (x.role === 'netCash') out.push(-v);
  }
  const sc = rs.filter((x) => x.scaled);
  const debts = sc.filter((x) => x.role === 'debt').map((x) => x.v), cashes = sc.filter((x) => x.role === 'cash').map((x) => x.v);
  const sum = (a) => a.reduce((p, q) => p + q, 0);
  if (debts.length || cashes.length) {
    out.push(sum(debts) - sum(cashes));
    out.push((debts[0] || 0) - (cashes[0] || 0));
  }
  return [...new Set(out.map((x) => +x.toPrecision(15)))];
}

/** จำนวนหุ้นที่ผู้เขียนหารจริง ("÷ หุ้นปรับลด 367M" · "÷ 1,091 ล้านหุ้น") — ใช้เป็น override.shares เมื่อ f.shares คิดซ้ำไม่ได้ */
const SHARE_SCALE = { m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, 'ล้าน': 1e6, 'พันล้าน': 1e9 };
function printedShares(s) {
  const out = [];
  for (const m of s.matchAll(/÷\s*(?:หุ้น[^0-9÷=]{0,25})?~?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(พันล้าน|ล้าน|[MB]n?)(?![A-Za-z])\s*(?:หุ้น|shares?|ADS)?/g)) {
    const v = +(num(m[1]) * SHARE_SCALE[m[2].toLowerCase()]).toPrecision(15);
    if (v > 0) out.push(v);
  }
  return [...new Set(out)];
}

// ── ตาราง stages ของ DCF (§13-3) ──
const PCT = '[+\\-−]?[0-9]+(?:\\.[0-9]+)?';
// ป้ายที่บอกว่า % นั้นไม่ใช่อัตราโตของช่วง (r · terminal · margin …) — ตรวจข้อความชิดหน้าตัวเลข/หน้าลิสต์
const RATE_LABEL = /(?:\br\b|WACC|terminal|ปลาย|ถาวร|g∞|\bTG\b|\bKe\b|ส่วนลด|discount|คิดลด|margin|มาร์จิ้น|อัตรากำไร|yield|payout|ROE|ROIC)[^0-9%]{0,12}$/i;
const PHASE_GAP_BAD = /PV|TV|terminal|WACC|คิดลด|discount|ส่วนลด|มูลค่าปัจจุบัน/i;   // "r 10% → PV ปี 1–5" = ช่วงของ PV ไม่ใช่ช่วงโต
const LIST_TAIL = new RegExp(`(?<![0-9.,])((?:${PCT}\\s*%?\\s*(?:\\/|→)\\s*)+)$`);
const LIST = new RegExp(`(?<![0-9.,])((?:${PCT}\\s*%?\\s*(?:\\/|→)\\s*){2,}${PCT}\\s*%)`, 'g');
const splitList = (x) => x.split(/\/|→/).map((y) => pctNum(y.replace('%', '').trim()));
const labelledRate = (s, at) => RATE_LABEL.test(s.slice(Math.max(0, at - 24), at));
const okSched = (st) => (st && st.length >= 2 && st.length <= 10 && st.reduce((a, x) => a + x.years, 0) <= 40 && st.every((x) => Number.isFinite(x.g)) ? st : null);

/** ตาราง stages ของ DCF จากข้อความ — 3 รูปที่พบในคลัง (Task 0 Q2): ช่วงชัด "X% ปี a–b" · ลิสต์รายปี x%/y%/z% (หรือ x%→y%→z%) · fade เชิงเส้น
 *  ช่วงชัด: เก็บเฉพาะช่วงที่ต่อกันเริ่มปี 1 (a = ปีก่อนหน้า + 1) — ช่วงจากข้อความ PV/terminal/r ถูกตัด · % ที่เป็นหางของลิสต์ = กระจายลิสต์ลงปี a–b (จำนวนต้องเท่ากัน ไม่งั้นทิ้งช่วง)
 *  คืน null เมื่อเป็น 2-stage ธรรมดา (caller คง g1/years1) หรือเกินกรอบ schema (≤10 ช่วง · Σyears ≤40) */
function extractDcfStages(s) {
  const phases = [];
  for (const m of s.matchAll(new RegExp(`(${PCT})\\s*%([^0-9%]{0,40}?)ปี\\s*(\\d+)\\s*[–\\-]\\s*(\\d+)`, 'g'))) {
    const from = +m[3], to = +m[4];
    if (to < from || PHASE_GAP_BAD.test(m[2])) continue;
    const tail = LIST_TAIL.exec(s.slice(0, m.index));
    const start = tail ? m.index - tail[1].length : m.index;
    if (labelledRate(s, start)) continue;
    if (tail) {
      const gs = splitList(tail[1] + m[1]);
      phases.push(gs.length === to - from + 1 ? { from, to, stages: gs.map((g) => ({ years: 1, g })) } : { from, to, bad: true });
    } else phases.push({ from, to, stages: [{ years: to - from + 1, g: pctNum(m[1]) }] });
  }
  const sched = []; let next = 1;
  for (const p of phases) {
    if (p.from !== next) { if (sched.length) break; continue; }
    if (p.bad) break;
    sched.push(...p.stages); next = p.to + 1;
  }
  if (okSched(sched)) return sched;
  for (const m of s.matchAll(LIST)) {
    if (labelledRate(s, m.index)) continue;
    const gs = splitList(m[1]);
    const rng = /^[^0-9]{0,12}ปี\s*(\d+)\s*[–\-]\s*(\d+)/.exec(s.slice(m.index + m[0].length))
      || /ปี\s*(\d+)\s*[–\-]\s*(\d+)[^0-9]{0,16}$/.exec(s.slice(Math.max(0, m.index - 40), m.index));
    if (rng && (+rng[1] !== 1 || +rng[2] !== gs.length)) continue;   // ลิสต์ของช่วงหลัง (เช่น ปี 6–10 ก่อน/หลังลิสต์) ไม่ใช่ตารางตั้งแต่ปี 1
    const st = okSched(gs.map((g) => ({ years: 1, g })));
    if (st) return st;
  }
  const fade = /([0-9]+(?:\.[0-9]+)?)\s*%[^0-9%]{0,30}?(?:ลด|ชะลอ|ไล่|fade)[^0-9%]{0,20}?([0-9]+(?:\.[0-9]+)?)\s*%[^0-9]{0,12}?(\d+)\s*ปี/i.exec(s);
  if (fade && !labelledRate(s, fade.index)) {
    const a = +fade[1], b = +fade[2], n = +fade[3];
    if (n >= 2 && n <= 10) return Array.from({ length: n }, (_, k) => ({ years: 1, g: Math.round((a + (b - a) * k / (n - 1)) * 1e6) / 1e6 }));
  }
  return null;
}

/** แกะ inputs ของขาที่จัดวิธีแล้ว + คิดซ้ำ
 *  mval = ข้อความ .mval (ใช้ทศนิยมที่พิมพ์ในเกณฑ์ reproduces) หรือตัวเลข
 *  f = fundamentals ที่ migrator จะเขียนจริง ({eps,dps,bvps,shares,revenue,rps,netDebt?,currency}) — currency = สกุลงบ → dcf inputs.rfCurrency (ไม่มี = ไม่เดา)
 *  คืน { inputs, override, value, ok, why, base?, baseKey?, stages?, shape? }
 *   · override = เฉพาะ OVERRIDE_KEYS ของ v3 · ค่าที่ match จริง ใส่เมื่อ f ไม่มีหรือต่างจาก f
 *   · ตัวตั้ง fcf/ebitda/revenue = ก้อนที่ป้ายตรงตระกูลก่อน แล้วก้อนไม่มีป้าย — ไม่เคยเป็นหนี้/เงินสด/PV/EV/TV/ส่วนผู้ถือหุ้น/สมาชิกลิสต์ (moneyRoles)
 *   · netDebt = ที่ผู้เขียนพิมพ์ก่อน (หนี้สุทธิ · เงินสดสุทธิ · หนี้ − เงินสด) แล้ว f.netDebt แล้ว 0 · shares = f.shares ก่อน แล้วจำนวนที่ผู้เขียนหาร (ฐานยอดรวมเท่านั้น)
 *   · ok:true ⇔ L.legValue({method: v3 method, inputs, override}, f) ผ่าน reproduces (value = ค่านั้นเอง — คิดซ้ำได้ตามนิยาม)
 *   · stages = ตาราง N-stage ที่ใช้ (dcf) · shape = เหตุที่ DCF ไม่ใช่ 2-stage มาตรฐาน (dcfShape · ข้อมูลประกอบ) */
function extract(method, mdesc, mname, mval, f) {
  f = f || {};
  const s = mdesc + ' ' + mname;
  const out = { inputs: null, override: null, value: null, ok: false, why: '' };
  const m = method.replace(/\?$/, '');
  // ปิดขา: override จากค่าที่ match (OVERRIDE_KEYS · ต่างจาก f >0.5% ก่อน แล้วค่อยแบบตรงตัว) → คิดซ้ำบน f เดียวกัน
  const finish = (v3m, inputs, cand, why) => {
    for (const loose of [true, false]) {
      const o = {};
      for (const [k, x] of Object.entries(cand || {})) {
        if (!OVR.has(k) || x == null) continue;
        if (f[k] == null || (loose ? !close(x, f[k], 0.005) : x !== f[k])) o[k] = x;
      }
      const override = Object.keys(o).length ? o : null;
      const v = tryLeg({ method: v3m, inputs, override }, f);
      if (reproduces(v, mval)) { out.inputs = inputs; out.override = override; out.value = v; out.ok = true; out.why = why || ''; return true; }
    }
    return false;
  };
  if (m === 'pe' || m === 'pbv' || m === 'pffo' || m === 'pfcf' || m === 'ps') {
    // ตัวตั้งต่อหุ้นที่พิมพ์ × ตัวคูณ · pfcf/ps ใน v3 ใช้ยอดรวม ÷ shares ⇒ override ยอดรวม = ต่อหุ้น × shares
    const KEY = { pe: 'eps', pbv: 'bvps', pffo: 'ffoPerShare' }[m], TOT = { pfcf: 'fcf', ps: 'revenue' }[m];
    const monies = moneyAll(mdesc).filter((x) => !x.scaled);
    const mults = multAll(s);
    let noShares = false;
    for (const b of monies) for (const k of mults) {
      if (!reproduces(b.v * k.v, mval)) continue;
      if (TOT && !f.shares) { noShares = true; continue; }
      if (finish(m, { multiple: k.v }, KEY ? { [KEY]: b.v } : { [TOT]: b.v * f.shares })) { out.base = b.v; if (KEY) out.baseKey = KEY; return out; }
    }
    // pfcf/ps: ยอดรวมที่พิมพ์ (รายได้/FCF ทั้งบริษัท) × ตัวคูณ ÷ shares
    if (TOT && f.shares) for (const e of baseCandidates(moneyRoles(mdesc, TOT)).filter((x) => x.scaled)) for (const k of mults) {
      if (finish(m, { multiple: k.v }, { [TOT]: e.v }, `${TOT} total printed`)) return out;
    }
    // ตัวตั้งไม่ได้พิมพ์ — ใช้ fundamentals ตรง ๆ
    if ({ pe: f.eps, pbv: f.bvps, ps: f.rps }[m] != null) for (const k of mults) if (finish(m, { multiple: k.v }, {}, 'base from values')) return out;
    out.why = noShares ? `${m}: per-share base printed but no shares — cannot express as fundamentals.${TOT}`
      : monies.length ? (mults.length ? 'base×multiple ≠ mval' : 'no multiple') : 'no per-share base';
    return out;
  }
  if (m === 'pbv:justified') {
    const roe = pctAfter(s, 'ROE'), g = pctAfter(s, 'g\\b|โต|growth'), r = pctAfter(s, '\\br\\b|Ke|ต้นทุน(?:ส่วนของ)?ทุน|COE|cost of equity|ผลตอบแทนที่ต้องการ');
    const monies = moneyAll(mdesc).filter((x) => !x.scaled);
    const cands = monies.map((x) => x.v).concat(f.bvps ? [f.bvps] : []);
    if (roe != null && g != null && r != null && r > g) for (const b of cands) if (finish('pbv', { g, r }, { roe, bvps: b })) return out;
    // อัตราส่วนที่พิมพ์ (ปัดแล้ว) × BVPS ตรง mval แต่ (ROE,g,r) คิดซ้ำไม่ได้ — บอกเหตุ ไม่ย้อนแก้
    const ratio = (/≈\s*([0-9]+(?:\.[0-9]+)?)\s*(?:x|เท่า)?\s*×/.exec(s) || /=\s*([0-9]+(?:\.[0-9]+)?)\s*(?:x|เท่า)/.exec(s) || [])[1];
    if (ratio && cands.some((b) => reproduces(num(ratio) * b, mval))) out.why = 'justified ratio printed (rounded) — recompute from (ROE,g,r) ≠ mval';
    out.why = out.why || `justified: roe=${roe} g=${g} r=${r}`;
    return out;
  }
  if (m === 'ddm') {
    const g = pctAfter(s, 'g\\b|โต|growth'), r = pctAfter(s, '\\br\\b|Ke|ต้นทุน|COE|required|ผลตอบแทนที่ต้องการ|discount');
    const monies = moneyAll(mdesc).filter((x) => !x.scaled);
    if (g != null && r != null && r > g) for (const b of monies.map((x) => x.v).concat(f.dps ? [f.dps] : [])) {
      if (finish('ddm', { g, r }, { dps: b })) return out;
      // พิมพ์ D₁ ⇒ inputs.d1 = ตัวเลขของผู้เขียน (display-fix2 · PKG) — ไม่ถอดกลับเป็น dps (D₀ = D₁/(1+g) ที่ผู้เขียนไม่ได้พิมพ์)
      if (finish('ddm', { g, r, d1: b }, null, 'D1 printed')) return out;
    }
    out.why = `ddm: g=${g} r=${r}`;
    return out;
  }
  if (m === 'dcf') {
    const g1 = pctAfter(s, 'โต|growth|g1|เติบโต'), r = pctAfter(s, 'WACC|\\br\\b|ส่วนลด|discount|Ke|ต้นทุน'), tg = pctAfter(s, 'terminal|ปลาย|ถาวร|g∞|ระยะยาว|perpetu|TG');
    const yrs = num((/([0-9]+)\s*(?:ปี|years?|Y\b)/i.exec(s) || [])[1]);
    const roles = moneyRoles(mdesc, 'fcf');
    const bases = baseCandidates(roles);
    const fcfTot = bases.filter((x) => x.scaled).map((x) => x.v);
    const fcfPs = bases.filter((x) => !x.scaled).map((x) => x.v);
    const stages = extractDcfStages(s);
    const rfc = f.currency || null;   // สกุลงบ (ชั้น 0: rf ต้องสกุลเดียวกับกระแสเงินสด) — ไม่มี = ไม่เดา
    // หนี้สุทธิที่ผู้เขียนพิมพ์ก่อน (R1-M1) แล้วค่อย f.netDebt แล้ว 0
    const nds = [...new Set([...labelledNetDebt(mdesc, roles, f.shares), f.netDebt, 0].filter((x) => x != null))];
    out.shape = dcfShape(s);
    // ลองฐาน FCF ที่พิมพ์ (ยอดรวม · หรือต่อหุ้น × shares — เฉพาะก้อนที่เป็นตัวตั้งได้) × หนี้สุทธิ {ที่พิมพ์, f.netDebt, 0}
    // หุ้น: f.shares ก่อน แล้วค่อยจำนวนที่ผู้เขียนหารจริง (override.shares)
    const shs = [...new Set([f.shares, ...printedShares(mdesc)].filter((x) => x > 0))];
    const attempt = (inputs) => {
      // ต่อหุ้น × shares ใช้ได้เฉพาะ f.shares — จำนวนที่พิมพ์อาจเป็นหุ้นสามัญขณะที่ฐานเป็นต่อ ADR (TSM: ×5) ⇒ fcf รวมจะผิดหน่วย
      for (const sh of shs) for (const [list, per] of [[fcfTot, false], [sh === f.shares ? fcfPs : [], true]]) for (const F of list) for (const nd of nds) {
        const why = `${per ? 'fcf per share' : 'fcf total'}${nd ? (nd < 0 ? ' + printed net cash' : ' − net debt') : ' (no net debt)'}${sh !== f.shares ? ' · printed shares' : ''}`;
        if (finish('dcf', inputs, { fcf: per ? F * sh : F, netDebt: nd, shares: sh }, why)) return true;
      }
      return false;
    };
    const withRf = (inputs) => (rfc ? { ...inputs, rfCurrency: rfc } : inputs);
    const done = () => {
      if (rfc) return out;
      out.ok = false; out.why = `rfCurrency unknown (f.currency missing) — ${out.why}; not guessed`;
      return out;
    };
    const whys = [];
    if (!shs.length) whys.push('no shares');
    // N-stage ก่อน (§13-3) — ต้องมี r/tg · years มาจากตาราง stages
    if (stages && r != null && tg != null && r > tg) {
      if (attempt(withRf({ stages, tg, r }))) { out.stages = stages; return done(); }
      whys.push(`dcf ${stages.length}-stage recompute ≠ mval`);
    }
    if (g1 != null && r != null && tg != null && yrs && r > tg) {
      if (attempt(withRf({ g1, years1: yrs, tg, r }))) return done();
      whys.push('dcf 2-stage recompute ≠ mval');
    } else whys.push(`dcf: g1=${g1} r=${r} tg=${tg} yrs=${yrs}`);
    out.why = whys.join(' · ');
    return out;
  }
  if (m === 'ddm2') {
    // §3.6 N — years1/g2 ยึดหลังตำแหน่ง g1 (กัน "แล้วโต X%" ก่อนหน้าหรืออายุสัมปทานถูกจับเป็นช่วง 1)
    const gm = /(?:โต|g1|growth)[^0-9%]{0,24}?([+\-−]?[0-9]+(?:\.[0-9]+)?)\s*%/i.exec(s);
    const g1 = gm ? pctNum(gm[1]) : null;
    const rest = gm ? s.slice(gm.index + gm[0].length) : '';
    const ym = /([0-9]+)\s*ปี(?!\s*[–\-])/.exec(rest);
    const years1 = ym ? +ym[1] : null;
    const g2 = ym ? pctAfter(rest.slice(ym.index + ym[0].length), 'แล้ว|จากนั้น|g2|ถาวร|ปลาย') : null;
    const r = pctAfter(s, '\\br\\b|Ke|ต้นทุน|discount');
    const printed = (moneyAll(mdesc).filter((x) => !x.scaled)[0] || {}).v;
    const d1 = printed != null ? printed : (f.dps != null && g1 != null ? f.dps * (1 + g1 / 100) : null);   // ไม่ได้พิมพ์ ⇒ D₁ = D₀·(1+g1)
    // อายุจำกัด (ไม่มี terminal) เฉพาะเมื่อข้อความบอกชัด · ไม่งั้น horizon null = Gordon ปลายช่วง 1
    const finite = /อายุจำกัด|สัมปทาน|terminal\s*value\s*=\s*0|ไม่ใช้\s*perpetuity|ไม่มี\s*(?:มูลค่า)?\s*(?:ปลายงวด|terminal)|ตัดจบ/i.test(s);
    const hz = finite && (/(\d+)\s*(?:งวด|ปี)\s*(?:ไม่มี|no)\s*(?:มูลค่า)?\s*(?:ปลายงวด|terminal)/i.exec(s) || /(\d+)\s*งวด/.exec(s) || /(?:อายุ|สัมปทาน)[^0-9]{0,12}(\d+)\s*ปี/.exec(s) || /คิดลด(?:เพียง)?\s*(\d+)\s*ปี/.exec(s));
    const horizon = hz ? +hz[1] : null;
    if ([d1, g1, years1, g2, r].every((x) => x != null)) {
      if (finish('ddm2', { d1, g1, years1, g2, r, horizon }, {}, printed != null ? '' : 'd1 = dps × (1+g1)')) return out;
      out.why = 'ddm2 recompute ≠ mval';
    } else out.why = `ddm2: d1=${d1} g1=${g1} years1=${years1} g2=${g2} r=${r}`;
    return out;
  }
  if (m === 'evebitda' || m === 'evsales') {
    // v3: (ฐาน × ตัวคูณ − netDebt) ÷ shares · คืนตัวแปรที่ match จริงเป็น override {ebitda|revenue, netDebt} (เงินสดสุทธิ = netDebt ติดลบ)
    const baseKey = m === 'evebitda' ? 'ebitda' : 'revenue';
    const mults = multAll(s);
    const roles = moneyRoles(mdesc, baseKey);
    const monies = baseCandidates(roles).filter((x) => x.scaled);
    const shs = [...new Set([f.shares, ...printedShares(mdesc)].filter((x) => x > 0))];
    if (!shs.length) { out.why = `ev: no shares (mults=${mults.length} bases=${monies.length})`; return out; }
    // หนี้สุทธิที่พิมพ์พร้อมป้าย (เครื่องหมายตามป้าย) ก่อน แล้ว f.netDebt แล้ว 0 · หุ้น f.shares ก่อน แล้วที่พิมพ์ · คืนตัวแปรที่ match เท่านั้น
    const nds = [...new Set([...labelledNetDebt(mdesc, roles, f.shares), f.netDebt, 0].filter((x) => x != null))];
    for (const sh of shs) for (const e of monies) for (const k of mults) for (const nd of nds) {
      const why = `${nd > 0 ? 'ev base − net debt' : nd < 0 ? 'ev base + net cash' : 'ev base (no net debt)'}${sh !== f.shares ? ' · printed shares' : ''}`;
      if (finish(m, { multiple: k.v }, { [baseKey]: e.v, netDebt: nd, shares: sh }, why)) return out;
    }
    out.why = `ev: mults=${mults.length} bases=${monies.length} — no variant reproduces (base must be the labelled ${baseKey}, not debt/cash/PV/EV/list)`;
    return out;
  }
  if (m === 'fcfyield') {
    // v3: fcf ÷ shares ÷ yield ⇒ override fcf = ต่อหุ้นที่พิมพ์ × shares
    const y = pctAll(s); const monies = moneyAll(mdesc).filter((x) => !x.scaled);
    if (!f.shares) { out.why = 'fcfyield: no shares'; return out; }
    for (const b of monies) for (const yy of y) if (yy > 0 && finish('fcfyield', { yield: yy }, { fcf: b.v * f.shares })) { out.base = b.v; return out; }
    out.why = 'fcfyield no match';
    return out;
  }
  if (m === 'ri') { out.why = 'ri: no extractor (years/payout rarely printed) — declare'; return out; }
  out.why = 'no extractor';
  return out;
}

/** รูป DCF — เป็น 2-stage มาตรฐาน (ช่วงโต 1 ช่วง + Gordon terminal) ไหม · คืนรายการเหตุที่ไม่ใช่ ([] = มาตรฐาน) */
function dcfShape(s) {
  const reasons = [];
  if (/3[-\s]*(?:stage|ช่วง|ระยะ)|สามช่วง|three[-\s]*stage/i.test(s)) reasons.push('3-stage named');
  if (/ปี(?:ที่)?\s*6\s*[–\-]\s*10|ปี\s*6[–\-]10|year[s]?\s*6\s*[–\-]\s*10|yr\s*6|6[–\-]10\s*(?:ปี|y)/i.test(s)) reasons.push('second explicit phase (yr 6–10)');
  if (/แล้ว(?:ชะลอ|ลด|โต)|→\s*[0-9]+(?:\.[0-9]+)?\s*%\s*(?:ใน|ช่วง|ปี)|fade|ชะลอลง|ไล่ลง|ค่อย ๆ ลด/i.test(s)) reasons.push('fade/second growth');
  if (/[0-9]+%?\s*(?:\/|→)\s*[0-9]+%?\s*(?:\/|→)\s*[0-9]+(?:\s*%?\s*(?:\/|→)\s*[0-9]+)*\s*%/.test(s)) reasons.push('per-year growth list');
  if (/อายุจำกัด|สัมปทาน|ไม่มี\s*terminal|ไม่ใช้\s*perpetuity|finite|concession/i.test(s)) reasons.push('finite life');
  if (/FCF\s*margin|margin\s*(?:ขยาย|ไต่|ไล่)|รายได้.*โต.*margin/i.test(s)) reasons.push('revenue×margin driven');
  if (/reverse\s*DCF|implied/i.test(s)) reasons.push('reverse DCF');
  if (/exit\s*multiple|EV\/EBITDA\s*ปลาย|terminal\s*multiple/i.test(s)) reasons.push('exit-multiple terminal');
  if (/\bDE\b|distributable|NOI|FFO|AFFO/i.test(s) && !/FCF/.test(s)) reasons.push('non-FCF cash base');
  return reasons;
}

module.exports = { classifyName, extract, dcfShape, extractDcfStages, reproduces, mvalDp, labelledNetDebt, moneyRoles, baseCandidates, printedShares, mvalNum, mvalCur, CONTEXT_RE, ANALYST_RE, moneyAll, multAll, pctAll, pctAfter, close };
