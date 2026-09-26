'use strict';
/**
 * cards.js (migrate-v3) — การ์ดหมวด 1 ของใบ v2 → metrics.cards/custom/notes + ค่าจากงบที่การ์ดพิมพ์ (fundamentals) (Plan 4b Task 5)
 *  การ์ดลงแคตตาล็อกเมื่อ (1) CC.cardKey (หรือกฎ bank/FY ด้านล่าง) ได้คีย์ (2) fundamentals ที่คีย์ต้องใช้มีครบ
 *  (3) ตัวเลขที่พิมพ์ตรงกับ fundamentals (ครึ่งหน่วยที่พิมพ์) — ไม่งั้นเป็น custom ข้อความเดิมทุกตัวอักษร (F)
 *  .d ของ v2 ที่ต่างจาก .d ของ template → metrics.notes[key] (คำของผู้เขียนไม่หาย) · คำเสริมในช่องค่า ("GAAP", "(TTM)") ย้ายไปหน้า note
 *  ห้ามเดาค่า: ไม่มีตัวเลขที่พิมพ์ = ไม่มี fundamentals ช่องนั้น
 */
const CC = require('../v3/card-census.js');
const K = require('../v3/cards.js');
const S = require('../v3/schema.js');
const RV = require('../report-values.js');
const LG = require('./legs.js');
const MP = require('./prose.js');

const NUMRE = /([+\-−]?)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g;
const num = (s) => parseFloat(String(s).replace(/,/g, ''));
const decOf = (s) => { const m = /[0-9][0-9,]*(?:\.([0-9]+))?/.exec(String(s)); return m && m[1] ? m[1].length : 0; };
const UNIT_WORDS = /ล้านล้าน|แสนล้าน|หมื่นล้าน|พันล้าน|ร้อยล้าน|ล้าน|บาท|\b(?:bn|mn|billion|million|trillion)\b|(?<=[0-9.]\s?)[TBMK](?![A-Za-z])|(?<=[0-9.]\s?)x(?![A-Za-z])|เท่า|US\$|C\$|\$|฿|€|£|¥/gi;
const hasWords = (s) => /[A-Za-z฀-๿]/.test(s);

/** ตัวเลขในช่องค่า + ส่วนที่เหลือ (คำ) — kind 'money' = เงิน (สเกล ล้าน/B/M) · 'pct' · 'plain' */
// ตัวย่อหน่วยเงินไทย ("฿93.5 พันล." · "฿6,399 ล." · "1,461 ลบ.") → คำเต็มก่อนแกะ
const thaiUnits = (s) => String(s).replace(/([0-9])\s*(พัน|หมื่น|แสน)\s*ลบ\.(?=\s|$|[)·,])/g, '$1 $2ล้านบาท').replace(/([0-9])\s*พัน\s*ล\.(?=\s|$|[)·,])/g, '$1 พันล้าน').replace(/([0-9])\s*ลบ\.(?=\s|$|[)·,])/g, '$1 ล้านบาท').replace(/([0-9])\s*ล\.(?=\s|$|[)·,])/g, '$1 ล้าน');
function readValue(vText, kind) {
  const t = thaiUnits(String(vText || '')).replace(/\{\{rd:[A-Za-z0-9]+\}\}/g, ' ⟦tok⟧ ');
  const out = { nums: [], residual: '', token: /⟦tok⟧/.test(t), cur: null };
  if (kind === 'money') {
    const ms = LG.moneyAll(t);
    for (const m of ms) {
      const before = t.slice(Math.max(0, m.at - 2), m.at);
      const neg = /[−-]\s*$/.test(before) || /^(?:US\$|C\$|\$|฿|€|£|¥)\s*[−-]/.test(m.raw);
      out.nums.push({ v: neg ? -m.v : m.v, raw: m.raw, scaled: m.scaled });
      out.cur = out.cur || (/(US\$|C\$|HK\$|NT\$|S\$|A\$|\$|฿|€|£|¥|RMB|CHF)/.exec(m.raw) || [])[1];
    }
    let rest = t; for (const m of ms.slice().reverse()) rest = rest.slice(0, m.at) + ' ' + rest.slice(m.at + m.raw.length);
    out.residual = rest.replace(/[−-](?=\s*$)/, '');
    // เงินไม่มีสัญลักษณ์ ("46,007 ล้านบาท")
    if (!ms.length) {
      const m = /([−-]?)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(ล้านล้าน|แสนล้าน|หมื่นล้าน|พันล้าน|ล้าน)?\s*บาท/.exec(t);
      if (m) { const sc = { 'ล้านล้าน': 1e12, 'แสนล้าน': 1e11, 'หมื่นล้าน': 1e10, 'พันล้าน': 1e9, 'ล้าน': 1e6 }[m[3]] || 1; out.nums.push({ v: (m[1] ? -1 : 1) * +(num(m[2]) * sc).toPrecision(15), raw: m[0], scaled: sc !== 1 }); out.cur = 'บาท'; out.residual = t.replace(m[0], ' '); }
    }
  } else {
    let rest = t;
    for (const m of t.matchAll(NUMRE)) {
      if (kind === 'pct' && !/^\s*%/.test(t.slice(m.index + m[0].length)) && !/%/.test(t)) continue;
      out.nums.push({ v: num(m[2]) * (m[1] === '-' || m[1] === '−' ? -1 : 1), raw: m[0].trim() });
    }
    rest = rest.replace(NUMRE, ' ');
    out.residual = rest;
  }
  out.residual = out.residual.replace(UNIT_WORDS, ' ').replace(/(^|[\s~≈(])(?:x|เท่า|[TBMK]|bn|mn)(?=[\s)/,]|$)/gi, '$1 ').replace(/[~≈%×/()+\-−,.:;|•·*]/g, ' ').replace(/⟦tok⟧/g, ' ').replace(/\s+/g, ' ').trim();
  return out;
}
const halfOk = (a, raw, b) => b != null && Math.abs(a - b) <= 0.5 * Math.pow(10, -decOf(raw)) + 1e-9;
const bigOk = (a, raw, b) => b != null && Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.5 * Math.pow(10, -decOf(raw)));

// ── คีย์ของการ์ด: กฎ bank/FY ก่อน CC.cardKey (แคตตาล็อก census ไม่มี nim/npl/capital/*Fy) ──
const FY_RE = /FY\s*'?(\d{4}|\d{2})(?!\s*[A-Za-z]*E\b)(?![0-9])|ปี(?:บัญชี)?\s*(25\d\d|20\d\d)/;
// งวดย่อย (ไตรมาส/ครึ่งปี/9 เดือน) ในป้าย — ตัวเลขงวดนี้ไม่ใช่ทั้งปี/TTM ⇒ ห้ามลงคีย์ flow (fix round 1 · I-1)
const PERIOD_RE = /(?:^|[^A-Za-z0-9])(?:Q[1-4]|[1-4]Q)(?:\b|\d|')|(?:^|[^A-Za-z0-9])(?:[12]H|H[12])\b|(?:^|[^A-Za-z0-9.])[69]M\b|ไตรมาส|quarter|ครึ่งปี|[69]\s*เดือน|งวด\s*\d/i;
const FLOW_KEYS = ['revenue', 'netIncome', 'eps', 'fcf', 'grossMargin', 'opMargin', 'netMargin', 'ebitdaMargin', 'roe', 'roic'];
/** ป้าย (+ ค่า) ระบุงวดย่อยที่ไม่ใช่ FY/TTM → true */
const subPeriod = (label, value) => (PERIOD_RE.test(label) && !/TTM|LTM|12\s*เดือน/i.test(label)) || /\/\s*(?:ไตรมาส|quarter|qtr)/i.test(value || '');
// ประมาณการ/ไกด์ (fix round 2 · I-3) — ตัวเลขคาดการณ์ ≠ ตัวเลขจริง FY/TTM ⇒ ห้ามลงคีย์จากงบ · P/E ที่ป้ายเป็น forward → peForward (ตรวจที่ mapCards)
const FORECAST_RE = /guid|ไกด์|คาด|forecast|\best\.?(?![a-z])|estimate|\bfwd\b|forward|\bNTM\b|FY\s*'?\d{2,4}\s*e\b|\b(?:20|25)\d\d\s*E\b|ประมาณการ/i;
const FORECAST_OK = ['peForward', 'analystTarget', 'range52w'];   // คีย์ที่ความหมายเป็นประมาณการ/ไม่ใช่ตัวเลขงวดอยู่แล้ว
const forecastLabel = (label) => FORECAST_RE.test(label);
// ค่าการ์ดที่ขึ้นต้นด้วยคำว่าไม่มีค่า (N/A · n/m · — · ไม่มี) = ผู้เขียนไม่ได้ให้ตัวเลข — ตัวเลขที่ตามมาเป็นคำอธิบาย
const NO_VALUE_RE = /^\s*(?:N\/?A\b|n\/?m\b|NM\b|[—–]|-(?!\s*[0-9])|ไม่มี)/i;
function keyOf(label, value) {
  if (/^NIM\b/i.test(label)) return 'nim';
  if (/^NPL\b/i.test(label)) return 'npl';
  if (/^(?:CET\s*1|CAR\b|BIS|Tier\s*1|เงินกองทุน)/i.test(label)) return 'capital';
  let k = CC.cardKey(label);
  if (FLOW_KEYS.includes(k) && subPeriod(label, value)) return null;   // ก่อนต่อ 'Fy' เสมอ (งวดย่อย ≠ ทั้งปี)
  // ปันผล "Forward/fwd" = อัตราต่อปีที่ประกาศแล้ว (indicated) ไม่ใช่ประมาณการ — การ์ด yield v3 คิดแบบเดียวกัน (dps ÷ ราคา)
  const indicatedYield = k === 'yield' && /forward|fwd/i.test(label) && !/คาด|\best\b|estimate|guid|ไกด์|ประมาณการ|\d{4}\s*E\b/i.test(label);
  if (k && !FORECAST_OK.includes(k) && !indicatedYield && forecastLabel(label)) return k === 'pe' ? 'peForward' : null;
  if (['netIncome', 'eps', 'revenue'].includes(k) && FY_RE.test(label) && !/TTM|12\s*เดือน|LTM/i.test(label)) k += 'Fy';
  return k || null;
}
const fyPeriod = (label) => { const m = FY_RE.exec(label); return m ? (m[1] ? (/FY\s*'?(\d{2,4})/.exec(m[0]) ? 'FY' + m[1] : m[0]) : m[0]) : null; };

/** ค่าจากงบที่การ์ดพิมพ์ → { fund, fy, bank, src, F } · base = fundamentals จาก values (ชนะเสมอ) */
function cardFund(parsed, base) {
  const fund = {}, src = {}, F = [], fy = { period: null }, bank = {};
  const set = (k, v, why) => { if (v == null || !Number.isFinite(v) || fund[k] != null) return; fund[k] = v; src[k] = why; };
  const cur = parsed.sm && parsed.sm.currency === 'THB' ? '฿' : '$';
  const curOk = (c) => c == null || (cur === '฿' ? c === '฿' || c === 'บาท' : c === '$' || c === 'US$');
  const fyPeriods = new Set(), fyCands = [];
  for (const c of parsed.s1cards || []) {
    const key = keyOf(c.k, c.v), vHtml = c.vHtml;
    if (!key) {
      // ยอด EBITDA ของการ์ดที่ไม่มีคีย์ ("EBITDA (TTM) $5.56B") → ใช้เป็นค่าจากงบได้ (การ์ดเองเป็น custom)
      if (/^(?:Adj(?:usted)?\.?\s*)?EBITDA\b(?!.*(?:margin|\/|growth|%))/i.test(c.k)) { const r = readValue(c.v, 'money'); if (r.nums.length === 1 && r.nums[0].scaled && curOk(r.cur)) set('ebitda', r.nums[0].v, `card "${c.k}"`); }
      continue;
    }
    const money1 = (t) => { const r = readValue(t, 'money'); return r.nums.length === 1 && curOk(r.cur) ? r.nums[0].v : null; };
    const labelled = (t, re) => { const m = new RegExp(`(?:${re})\\b[^$฿\\n]{0,40}?~?\\s*((?:US\\$|\\$|฿)\\s*~?\\s*[0-9][0-9,]*(?:\\.[0-9]+)?(?:\\s*(?:ล้านล้าน|แสนล้าน|หมื่นล้าน|พันล้าน|ล้าน|[TBMK](?![A-Za-z])))?)`, 'i').exec(t); return m ? LG.moneyAll(m[1])[0] : null; };
    switch (key) {
      case 'mcap': {
        const m = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(พันล้าน|ล้าน|[MB](?![A-Za-z])|billion|million)\s*(?:หุ้น|shares?)/i.exec(c.d);
        if (m) set('shares', +(num(m[1]) * ({ 'พันล้าน': 1e9, 'ล้าน': 1e6, m: 1e6, b: 1e9, billion: 1e9, million: 1e6 }[m[2].toLowerCase()] || 1)).toPrecision(15), `card "${c.k}" .d`);
        break;
      }
      case 'eps': { const v = money1(c.v); if (v != null) { set('eps', v, `card "${c.k}"`); src.epsLabel = src.epsLabel || c.k; } break; }
      case 'bvps': { const v = money1(c.v); if (v != null) set('bvps', v, `card "${c.k}"`); break; }
      case 'pbv': { const b = labelled(c.d, 'BVPS'); if (b && !b.scaled) set('bvps', b.v, `card "${c.k}" .d BVPS`); break; }
      case 'ptbv': { const b = labelled(c.d, 'TBVPS'); if (b && !b.scaled) set('tbvps', b.v, `card "${c.k}" .d TBVPS`); break; }
      case 'peForward': { const b = labelled(c.d, 'EPS'); if (b && !b.scaled) set('epsForward', b.v, `card "${c.k}" .d EPS`); break; }
      case 'yield': {
        const m = new RegExp(`((?:US\\$|\\$|฿)\\s*[0-9][0-9,]*(?:\\.[0-9]+)?)\\s*/\\s*(?:หุ้น\\s*/\\s*)?(?:ปี|year|yr)`, 'i').exec(c.d);
        // ต่อหุ้นไม่ระบุงวด ("฿0.33/หุ้น" · "DPS ฿0.67") — รับเมื่อ yield ที่พิมพ์ ≈ dps ÷ ราคา (±20%) · รายไตรมาส/งวดไม่รับ
        const ps = !m && !/ไตรมาส|quarter|interim|งวด|ครึ่งปี/i.test(c.d) && (new RegExp(`((?:US\\$|\\$|฿)\\s*[0-9][0-9,]*(?:\\.[0-9]+)?)\\s*/\\s*(?:หุ้น|share)`, 'i').exec(c.d) || /DPS[^$฿]{0,12}((?:US\$|\$|฿)\s*[0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(c.d));
        const yv = readValue(c.v, 'pct'), px = parsed.rd && parsed.rd.values && parsed.rd.values.px;
        if (m) set('dps', LG.moneyAll(m[1])[0].v, `card "${c.k}" .d`);
        else if (ps && yv.nums.length === 1 && !yv.token && px > 0 && Math.abs(LG.moneyAll(ps[1])[0].v / px * 100 - yv.nums[0].v) <= 0.2 * yv.nums[0].v) set('dps', LG.moneyAll(ps[1])[0].v, `card "${c.k}" .d per share (yield-checked)`);
        else if (/^\s*~?\s*0(?:\.0+)?\s*%/.test(c.v) || /^\s*[—–-]?\s*(?:ไม่มี|ไม่ปันผล|ไม่จ่าย|none|n\/a)\b/i.test(c.v) || /ไม่(?:ได้)?จ่าย(?:ปันผล)?|ไม่มีปันผล|งดจ่าย|ไม่ปันผล/.test(c.v + ' ' + c.d)) set('dps', 0, `card "${c.k}" says none`);
        break;
      }
      case 'revenue': case 'netIncome': case 'fcf': case 'backlog': case 'aum': case 'netDebt': {
        const r = readValue(c.v, 'money');
        if (r.nums.length === 1 && r.nums[0].scaled && curOk(r.cur)) {
          let v = r.nums[0].v;
          if (key === 'netDebt' && /net\s*cash|เงินสดสุทธิ/i.test(c.k) && v > 0) v = -v;
          if (key === 'netDebt' && !/net\s*(?:cash|debt)|สุทธิ/i.test(c.k)) break;   // "หนี้สิน"/"เงินสด" เปล่า ≠ หนี้สุทธิ
          set(key, v, `card "${c.k}"`);
        }
        break;
      }
      case 'ebitdaMargin': case 'evEbitda': case 'netDebtEbitda': { const b = labelled(c.d, 'EBITDA'); if (b && b.scaled) set('ebitda', b.v, `card "${c.k}" .d EBITDA`); break; }
      case 'netIncomeFy': case 'epsFy': case 'revenueFy': {
        const p = fyPeriod(c.k); const k = key.replace(/Fy$/, '');
        const r = readValue(c.v, 'money');
        if (r.nums.length === 1 && curOk(r.cur) && (k === 'eps' ? !r.nums[0].scaled : r.nums[0].scaled) && p) {
          fyPeriods.add(p);
          fyCands.push({ p, k, v: r.nums[0].v, why: `card "${c.k}"` });
        }
        break;
      }
      case 'nim': { const r = readValue(c.v, 'pct'); if (r.nums.length === 1) bank.nim = r.nums[0].v; break; }
      case 'npl': { const r = readValue(c.v, 'pct'); if (r.nums.length === 2 && /coverage|สำรอง/i.test(c.k)) { bank.npl = r.nums[0].v; bank.coverage = r.nums[1].v; } break; }
      case 'capital': { const r = readValue(c.v, 'pct'); if (r.nums.length === 2 && /CET\s*1|Tier/i.test(c.k) && /CAR|BIS|รวม/i.test(c.k)) { bank.cet1 = r.nums[0].v; bank.car = r.nums[1].v; } break; }
      case 'roe': {
        const r = readValue(c.v, 'pct');
        if (r.nums.length === 1) set('roe', r.nums[0].v, `card "${c.k}"`);
        // ROA = ตัวเลขที่สองต้องพิมพ์เป็น % เอง — "~21.6% / D/E 0.07" (MEGA/SPOT) ตัวที่สองคือ D/E ไม่ใช่ ROA (audit: invented)
        if (r.nums.length === 2 && /ROA/i.test(c.k) && (c.v.match(/[0-9]\s*%/g) || []).length === 2) { set('roe', r.nums[0].v, `card "${c.k}"`); set('roa', r.nums[1].v, `card "${c.k}"`); }
        break;
      }
      case 'roic': case 'grossMargin': case 'netMargin': case 'opMargin': case 'occupancy': {
        const r = readValue(c.v, 'pct');
        const k = key === 'roic' && /ROE/i.test(c.k) ? null : key;   // "ROE / ROIC" = การ์ดผสม
        if (k && r.nums.length === 1 && /%/.test(c.v)) set(k, r.nums[0].v, `card "${c.k}"`);
        break;
      }
      case 'peAvg5y': case 'beta': case 'debtToEquity': {
        const r = readValue(c.v, 'plain');
        // ค่าที่ผู้เขียนบอกว่าไม่มี ("N/A (IPO <3 ปี)" AS · "N/A — IPO ต.ค. 2567" TMAN) — ตัวเลขในวงเล็บ/ปี IPO ไม่ใช่ค่าของการ์ด (audit: invented 3.0x · 2567.0x)
        if (r.nums.length === 1 && !/%/.test(c.v) && !NO_VALUE_RE.test(c.v)) set(key, r.nums[0].v, `card "${c.k}"`);
        break;
      }
      default: break;
    }
  }
  // Plan 4c-prep: FY หลายงวด → เก็บงวดล่าสุด (ปีมากสุด · ปี 2 หลัก +2000) ค่าเฉพาะการ์ดของงวดนั้น + F (ไม่ใช่ H อีกต่อไป · fyConflict = info)
  //  ปี พ.ศ. (≥2400 · หรือ 2 หลัก ≥60 เช่น "FY68" = 2568) → ค.ศ. ก่อนเทียบ (กำหนดตายตัว ไม่อิงนาฬิกา) · งวดเดียวกันเขียนต่างรูป ("FY25" / "FY2025") = งวดเดียวกัน (เทียบปี ไม่ใช่ข้อความ)
  const yearOf = (p) => { const m = /(\d{2,4})/.exec(p); if (!m) return -Infinity; const n = +m[1];
    const y = m[1].length === 2 ? (n >= 60 ? 2500 + n : 2000 + n) : n; return y >= 2400 ? y - 543 : y; };
  const latest = fyCands.reduce((a, x) => (a == null || yearOf(x.p) > yearOf(a) ? x.p : a), null);
  for (const x of fyCands) if (yearOf(x.p) === yearOf(latest) && fy[x.k] == null) { fy[x.k] = x.v; src[`fy.${x.k}`] = x.why; if (!fy.period) fy.period = x.p; }
  if (fyPeriods.size > 1) F.push(`fy periods differ ${[...fyPeriods].join(' / ')} — kept ${latest} (latest)`);
  const fyOut = {}; for (const k of S.FY_KEYS) if (fy[k] != null) fyOut[k] = fy[k];
  const bankOut = {}; for (const k of S.BANK_KEYS) if (bank[k] != null) bankOut[k] = bank[k];
  return { fund, fy: fyOut.period && Object.keys(fyOut).length > 1 ? fyOut : null, bank: Object.keys(bankOut).length ? bankOut : null, src, F, fyConflict: fyPeriods.size > 1 };
}

// คีย์ → fundamentals ที่ต้องมี (ตรวจก่อน compute · render check หลัง compute เป็นชั้นสุดท้าย)
const NEED = {
  mcap: ['shares'], pe: ['eps+'], peAvg5y: ['peAvg5y'], pbv: ['bvps+'], ps: ['revenue+', 'shares'], netIncome: ['netIncome'], eps: ['eps'], bvps: ['bvps'],
  roe: ['roe'], revenue: ['revenue'], grossMargin: ['grossMargin'], netMargin: ['netMargin'], opMargin: ['opMargin'], yield: ['dps'], beta: ['beta'],
  range52w: ['@range52w'], fcf: ['fcf'], debtToEquity: ['debtToEquity'], netDebt: ['netDebt'], ebitdaMargin: ['ebitda', 'revenue+'], roic: ['roic'],
  evEbitda: ['ebitda+', 'netDebt', 'shares'], peForward: ['epsForward+'], analystTarget: ['@analyst'], netIncomeFy: ['fy.netIncome'], epsFy: ['fy.eps'], revenueFy: ['fy.revenue'],
  nim: ['bank.nim'], npl: ['bank.npl', 'bank.coverage'], capital: ['bank.cet1', 'bank.car'], occupancy: ['occupancy'], netDebtEbitda: ['netDebt', 'ebitda+'],
  backlog: ['backlog'], aum: ['aum'], payout: ['eps+', 'dps'], ptbv: ['tbvps+'],
};
function missing(key, f, ext) {
  const need = NEED[key];
  if (!need) return 'no migrator rule for this key';
  for (const n0 of need) {
    const pos = n0.endsWith('+'), n = n0.replace(/\+$/, '');
    if (n === '@range52w') { if (!ext.range52w) return 'no 52-week range'; continue; }
    if (n === '@analyst') { if (!ext.analyst) return 'no analyst target'; continue; }
    const v = n.includes('.') ? (f[n.split('.')[0]] || {})[n.split('.')[1]] : f[n];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `fundamentals.${n} missing`;
    if (pos && !(v > 0)) return `fundamentals.${n} ≤ 0`;
  }
  return null;
}
// ตัวเลขที่พิมพ์ต้องเท่าค่าที่การ์ด v3 จะพิมพ์ (คีย์จากงบ — คีย์ผูกราคาไม่เทียบ: ราคาขยับได้)
const PRINTED = {
  netIncome: ['money', 'netIncome'], eps: ['money', 'eps'], bvps: ['money', 'bvps'], revenue: ['money', 'revenue'], fcf: ['money', 'fcf'], backlog: ['money', 'backlog'], aum: ['money', 'aum'], netDebt: ['money', 'netDebt'],
  netIncomeFy: ['money', 'fy.netIncome'], epsFy: ['money', 'fy.eps'], revenueFy: ['money', 'fy.revenue'],
  grossMargin: ['pct', 'grossMargin'], netMargin: ['pct', 'netMargin'], opMargin: ['pct', 'opMargin'], roic: ['pct', 'roic'], occupancy: ['pct', 'occupancy'], nim: ['pct', 'bank.nim'],
  roe: ['pct', 'roe', 'roa'], npl: ['pct', 'bank.npl', 'bank.coverage'], capital: ['pct', 'bank.cet1', 'bank.car'],
  peAvg5y: ['plain', 'peAvg5y'], beta: ['plain', 'beta'], debtToEquity: ['plain', 'debtToEquity'],
};
function printedMismatch(key, c, f, px) {
  if (key === 'peForward') {
    // ตัวคูณที่พิมพ์ต้องใกล้ ราคา ÷ EPS ประมาณการ (±5% — ราคาขยับได้หลังวันวิเคราะห์) · ค่าเป็น token/ไม่มีเลข = ไม่ตรวจ
    const r = readValue(c.v, 'plain');
    if (r.token || r.nums.length !== 1 || !(px > 0) || !(f.epsForward > 0)) return r.nums.length > 1 ? `printed ${r.nums.length} numbers` : null;
    const want = px / f.epsForward;
    return Math.abs(r.nums[0].v - want) <= 0.05 * want ? null : `printed ${r.nums[0].raw}x ≠ price ÷ epsForward ${want.toFixed(1)}x`;
  }
  const spec = PRINTED[key];
  if (!spec) return null;
  const [kind, ...fields] = spec;
  const r = readValue(c.v, kind);
  if (r.token) return 'value carries a v2 token';
  const want = fields.map((n) => (n.includes('.') ? (f[n.split('.')[0]] || {})[n.split('.')[1]] : f[n])).filter((x) => x != null);
  if (r.nums.length !== want.length) return `printed ${r.nums.length} number(s), card shows ${want.length}`;
  for (let i = 0; i < want.length; i++) {
    const ok = kind === 'money' && r.nums[i].scaled ? bigOk(r.nums[i].v, r.nums[i].raw, want[i]) : halfOk(r.nums[i].v, r.nums[i].raw, want[i]);
    if (!ok) return `printed ${r.nums[i].raw} ≠ fundamentals ${want[i]}`;
  }
  return null;
}
/** คำในช่องค่าที่ไม่ใช่ตัวเลข/หน่วย ("GAAP", "(TTM)") — ย้ายไปหน้า note ให้ไม่หาย */
function valueWords(key, c) {
  const kind = (PRINTED[key] || ['plain'])[0];
  const r = readValue(c.v, kind);
  return hasWords(r.residual) ? r.residual : '';
}

const toneOk = (x) => S.ENUM.tone.includes(x);
/** view เทียม (ไม่มีราคา) — พอให้ .d ของ template ที่อ่านแค่ fundamentals/สกุลทำงาน · คืน null เมื่อ .d ต้องใช้ราคา */
function pseudoView(f, currency, legs, market, analyst) {
  const cur = RV.CUR_SYMBOL[currency] || '$';
  return { doc: { fundamentals: f, legs: legs || [], market: market || {}, analyst: analyst || null }, cur, stmtCur: cur, fq: f, d: { px: market && market.px, mcap: market && market.px && f.shares ? market.px * f.shares : null } };
}
function templateD(key, view) { try { return K.CATALOGUE[key].d(view); } catch (_) { return null; } }
/** v2 .d → note (ตัดส่วนที่ template พิมพ์ซ้ำอยู่แล้วตอนต้น) */
function noteFor(key, c, view) {
  const v2d = MP.htmlToProse(c.dHtml);
  const words = valueWords(key, c);
  const td = templateD(key, view);
  let note = v2d;
  if (td != null && v2d === td) note = '';
  else if (td && v2d.startsWith(td)) note = v2d.slice(td.length).replace(/^(?:[\s·•,;:—–]|-(?![0-9]))+/, '').trim();
  if (words) note = note ? `${words} · ${note}` : words;
  return note;
}
const plainLabel = (s) => String(s).replace(/[{}<>]/g, '').trim();
function customOf(c) {
  const x = { label: plainLabel(c.k) || '—', value: MP.htmlToProse(c.vHtml) || '—' };
  const note = MP.htmlToProse(c.dHtml); if (note) x.note = note;
  if (c.vcls && toneOk(c.vcls)) x.tone = c.vcls;
  return x;
}

/** การ์ด → { cards, custom, notes, fund, H, D, F, meta } · base = fundamentals สุดท้าย (หลังรวม values + การ์ด + ขา)
 *  opts = { currency, market, analyst, legs, view?, force?: Set(index→custom) } */
function mapCards(parsed, base, opts) {
  const o = opts || {};
  const H = [], D = [], F = [];
  const cf = cardFund(parsed, {});
  const f = base || {};
  const ext = { range52w: o.market && o.market.range52w, analyst: o.analyst };
  const view = o.view || pseudoView(f, o.currency || (parsed.sm && parsed.sm.currency), o.legs, o.market, o.analyst);
  const cards = [], custom = [], notes = {}, used = new Set(), meta = [];
  (parsed.s1cards || []).forEach((c, i) => {
    const key = keyOf(c.k, c.v);
    let why = null;
    const ck = CC.cardKey(c.k);
    if (!key && FLOW_KEYS.includes(ck) && subPeriod(c.k, c.v)) F.push(`card "${c.k}" → custom (period-labelled: not FY/TTM)`);
    else if (!key && ck && !FORECAST_OK.includes(ck) && forecastLabel(c.k)) F.push(`card "${c.k}" → custom (forecast-labelled: not actual)`);
    if (!key) why = 'label not in catalogue';
    else if (used.has(key)) why = `duplicate ${key}`;
    else if (o.force && o.force.has(i)) why = o.force.get(i);
    else why = missing(key, f, ext) || printedMismatch(key, c, f, o.market && o.market.px);
    if (why) {
      if (key) F.push(`card "${c.k}" → custom (${key}: ${why})`);
      custom.push(customOf(c)); cards.push(`custom:${custom.length - 1}`); meta.push({ i, key: null, want: key, why });
      return;
    }
    used.add(key);
    const def = K.CATALOGUE[key].cls;
    let entry = key;
    if (c.vcls && !toneOk(c.vcls)) F.push(`card "${c.k}" class "${c.vcls}" not a tone — dropped`);
    const tone = c.vcls && toneOk(c.vcls) ? c.vcls : (def ? 'none' : '');
    if (tone && tone !== def) entry = { key, tone };
    cards.push(entry);
    const note = noteFor(key, c, view);
    if (note) notes[key] = note;
    meta.push({ i, key });
  });
  return { cards, custom, notes, fund: cf.fund, H, D, F, meta };
}

module.exports = { mapCards, cardFund, keyOf, subPeriod, PERIOD_RE, FORECAST_RE, forecastLabel, readValue, missing, printedMismatch, customOf, noteFor, pseudoView, fyPeriod, NEED };
