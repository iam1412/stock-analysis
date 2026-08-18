#!/usr/bin/env node
'use strict';
/**
 * fetch-fundamentals.js — ดึง EPS/P/E/ปันผล/เป้านักวิเคราะห์/52wk จาก **2 แหล่งอิสระ** ในคำสั่งเดียว
 * (Yahoo quoteSummary + StockAnalysis) เป็นบล็อกสั้นให้ worker ใช้ cross-verify ตาม SKILL STEP 1–2
 * + ตาราง **งบย้อนหลัง 5 ปี + TTM** (รายได้/NI/EPS/FCF/margin/shares/cash/debt/D-E/ROE จาก
 * StockAnalysis /financials 3 หน้า) — worker ใช้เขียน section งบ/แนวโน้ม/scenario ได้เลย
 * ไม่ต้อง WebFetch หน้า financials เอง (จูนรอบ 5: ตัด WebFetch 3-6 call/หุ้น)
 * — token-lean: output รวม ~25 บรรทัด · ไม่แตะไฟล์ใด ๆ
 *
 * + **[2b] หุ้นคงเหลือ/มูลค่าตลาด** จาก /statistics/ — แถว `Shares` ในตาราง [3] เป็น**ถัวเฉลี่ยถ่วงน้ำหนัก
 * ปรับลด (TTM)** ไม่ใช่หุ้นคงเหลือ · วัดจริง 17 ส.ค. 2569 ต่างกัน −30%..+11% (POET/AAOI/CAMT) และ
 * **ทิศทางเดาไม่ได้** (CAMT ปรับลด > คงเหลือ เพราะหุ้นกู้แปลงสภาพ) ⇒ ต้องดึงค่าจริง ห้ามอนุมาน
 * + **Δ EPS(quote↔ตาราง[3])** — verdict "2 vendor ตรงกัน" ไม่ใช่ใบรับรอง (AMATA: quote ทั้งคู่ ฿4.48
 * แต่ตาราง = ฿3.22 = NI 3,698 ÷ 1,149M หุ้น ต่าง 39%) ⇒ เทียบทางที่ 3 ที่ย้อนกลับได้เสมอ
 *
 * ใช้:  node tools/fetch-fundamentals.js SYMBOL [--th]
 *   --th = หุ้นไทย (Yahoo = SYMBOL.BK · StockAnalysis = quote/bkk/SYMBOL) — ★ ต้องระบุเอง กัน ticker ชนกัน
 *
 * script ล่มแหล่งใดแหล่งหนึ่ง → พิมพ์ ✗ พร้อมเหตุผล — agent ยิง WebFetch targeted แหล่งนั้นแทน (fallback เดิม)
 * ตารางงบ: หน้าไหนล่มก็ข้ามแถวของหน้านั้นเงียบ ๆ (พิมพ์เท่าที่ได้ ไม่ crash)
 * ticker ที่ Yahoo เปลี่ยนชื่อ → ใช้ tools/symbol-map.json อัตโนมัติ (ผ่าน toYahooSymbol)
 */
const { toYahooSymbol } = require('./update-prices.js');
const { entryFor } = require('./symbol-map.js');

const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };
// quoteSummary คืน {} เปล่าเมื่อไม่มีค่า — ต้องได้ undefined ไม่ใช่ object
const raw = (v) => (v && typeof v === 'object') ? ('raw' in v ? v.raw : undefined) : v;
const asNum = (v) => { const n = typeof v === 'string' ? parseFloat(v.replace(/[,$%]/g, '')) : v; return Number.isFinite(n) ? n : null; };
const fmt = (v, d = 2) => Number.isFinite(v) ? +v.toFixed(d) : (v == null || v === '' ? '-' : v);
const pct = (v) => Number.isFinite(v) ? +(v * 100).toFixed(2) + '%' : '-';

// ---------- แหล่ง 1: Yahoo quoteSummary (crumb flow) ----------
async function fromYahoo(ysym) {
  const r1 = await fetch('https://fc.yahoo.com', { headers: H, redirect: 'manual' });
  const cookie = (r1.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('ไม่ได้ cookie จาก fc.yahoo.com');
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { ...H, cookie } });
  const crumb = await r2.text();
  if (!r2.ok || !crumb || crumb.includes('<')) throw new Error('ไม่ได้ crumb (HTTP ' + r2.status + ')');
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ysym)}` +
    `?modules=defaultKeyStatistics,financialData,summaryDetail&crumb=${encodeURIComponent(crumb)}`;
  const r3 = await fetch(url, { headers: { ...H, cookie } });
  if (!r3.ok) throw new Error('quoteSummary HTTP ' + r3.status);
  const j = await r3.json();
  const res = j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
  if (!res) throw new Error((j.quoteSummary && j.quoteSummary.error && j.quoteSummary.error.description) || 'ไม่มีข้อมูล');
  const ks = res.defaultKeyStatistics || {}, fd = res.financialData || {}, sd = res.summaryDetail || {};
  return {
    price: raw(fd.currentPrice), epsTTM: raw(ks.trailingEps), epsFwd: raw(ks.forwardEps),
    pe: raw(sd.trailingPE), fwdPE: raw(sd.forwardPE), divYield: raw(sd.dividendYield),
    target: raw(fd.targetMeanPrice), analysts: raw(fd.numberOfAnalystOpinions),
    lo52: raw(sd.fiftyTwoWeekLow), hi52: raw(sd.fiftyTwoWeekHigh), roe: raw(fd.returnOnEquity),
  };
}

// ---------- แหล่ง 2: StockAnalysis __data.json (SvelteKit devalue: object = map key→index ใน array เดียวกัน) ----------
function findObj(nodes, requiredKeys) {
  for (const node of nodes || []) {
    if (!node || !Array.isArray(node.data)) continue;
    for (const el of node.data) {
      if (el && typeof el === 'object' && !Array.isArray(el) && requiredKeys.every((k) => k in el))
        return { arr: node.data, obj: el };
    }
  }
  return null;
}
function resolveKeys(found, keys) {
  const out = {};
  if (!found) return out;
  for (const k of keys) {
    const i = found.obj[k];
    if (typeof i === 'number' && i >= 0 && i < found.arr.length) {
      const v = found.arr[i];
      if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
    }
  }
  return out;
}
// ticker US ที่เทรด OTC (ADR/F-share เช่น FANUY, KYCCF, ABBNY) อยู่ namespace quote/otc/ ไม่ใช่ stocks/
// → ลอง stocks/ ก่อน (เคสปกติจบที่ request แรก) พังค่อย fallback otc
function saBases(symbol, th) {
  const saSym = entryFor(symbol).sa || symbol;
  return th ? [`quote/bkk/${saSym}`] : [`stocks/${saSym}`, `quote/otc/${saSym}`];
}
async function fromStockAnalysis(symbol, th) {
  let lastErr = null;
  for (const pathPart of saBases(symbol, th)) {
    let j;
    try {
      const r = await fetch(`https://stockanalysis.com/${pathPart}/__data.json`, { headers: H });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      j = await r.json();
      if (!j.nodes || JSON.stringify(j).length < 500) throw new Error('payload ว่าง (ticker ไม่มีใน StockAnalysis?)');
    } catch (e) { lastErr = e; continue; }
    const info = resolveKeys(findObj(j.nodes, ['eps', 'peRatio', 'target']),
      ['eps', 'peRatio', 'forwardPE', 'dividend', 'dps', 'dividendYield', 'target', 'analysts', 'earningsDate', 'marketCap', 'payoutRatio']);
    const quote = resolveKeys(findObj(j.nodes, ['p', 'h52', 'l52']), ['p', 'cl', 'u', 'h52', 'l52']);
    if (!('eps' in info)) { lastErr = new Error('หา info object (eps/peRatio/target) ในผลลัพธ์ไม่เจอ — โครง payload อาจเปลี่ยน'); continue; }
    return { src: pathPart, info, quote };
  }
  throw lastErr;
}

// ---------- แหล่งเสริม 1: /statistics/ = หุ้นคงเหลือจริง + market cap (คนละนิยามกับแถว Shares ใน [3]) ----------
// payload เป็น devalue เหมือนหน้าอื่น แต่ค่าอยู่ในการ์ด {id,title,value,hover} — hover = เลขเต็มไม่ปัด
// ("46,044,477" ขณะ value="46.04M") ⇒ ใช้ hover เป็นหลัก
const STAT_IDS = { sharesout: 'sharesOut', sharesOutClass: 'sharesOutClass', marketcap: 'marketCap' };
function statNum(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  if (typeof s !== 'string') return null;
  const m = s.replace(/,/g, '').trim().match(/^(-?\d+(?:\.\d+)?)\s*([KMBT])?$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || '').toUpperCase()] || 1;
  return parseFloat(m[1]) * mult;
}
// เดินทุก node หา object ที่มี id/title/value (index ชี้กลับเข้า arr เดียวกัน) แล้วเก็บเฉพาะ id ที่รู้จัก
function statsFromPayload(j) {
  const out = {};
  for (const node of (j && j.nodes) || []) {
    if (!node || !Array.isArray(node.data)) continue;
    const arr = node.data;
    const deref = (i) => (typeof i === 'number' && i >= 0 && i < arr.length ? arr[i] : undefined);
    for (const el of arr) {
      if (!el || typeof el !== 'object' || Array.isArray(el)) continue;
      if (!('id' in el) || !('value' in el)) continue;
      const key = STAT_IDS[deref(el.id)];
      if (!key || out[key]) continue;
      const value = deref(el.value), hover = deref(el.hover);
      const num = statNum(hover) != null ? statNum(hover) : statNum(value);
      if (num == null) continue;
      out[key] = { num, text: typeof value === 'string' ? value : String(num) };
    }
  }
  return out;
}
// ★ ห้าม fallback ไป saPrimaryPath: หุ้นคงเหลือของตลาดแม่ ÷ ราคา OTC = ผสมฐาน (กับดักเดียวกับงบสกุลท้องถิ่น)
async function fromStatistics(symbol, th) {
  let lastErr = null;
  for (const base of saBases(symbol, th)) {
    try {
      const r = await fetch(`https://stockanalysis.com/${base}/statistics/__data.json`, { headers: H });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const stats = statsFromPayload(await r.json());
      if (!stats.sharesOut) throw new Error('ไม่เจอการ์ด Shares Outstanding (โครง payload อาจเปลี่ยน)');
      return stats;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('ไม่มีแหล่ง');
}

// ---------- แหล่งเสริม 2: งบย้อนหลัง 5 ปี + TTM (StockAnalysis /financials 3 หน้า — SvelteKit devalue เหมือนข้างบน) ----------
// แถว: [label, aliases, fmt] — หุ้น US/TH ใช้ชื่อ key ต่างกัน (US=epsDiluted,netIncome · TH=epsdil,netinccmn)
const SHARES_LABEL = 'Shares(wAvgDil)';
const SHARES_NOTE = `    ★ แถว ${SHARES_LABEL} = หุ้นถัวเฉลี่ยถ่วงน้ำหนักปรับลด (TTM) — ห้ามใช้เป็นหุ้นคงเหลือ (ฐาน market cap/มูลค่าต่อหุ้นอยู่ใน [2b])`;
const FIN_ROWS = [
  ['Revenue', ['revenue'], 'm'], ['  YoY%', ['revenueGrowth'], 'pct'],
  ['GrossM%', ['grossMargin'], 'pct'], ['OpM%', ['operatingMargin'], 'pct'], ['NetM%', ['profitMargin'], 'pct'],
  ['NetIncome', ['netIncome', 'netinccmn', 'netinc'], 'm'], ['EPS(dil)', ['epsDiluted', 'epsdil'], 'num'],
  // ★ ป้ายต้องบอกนิยามในตัวเอง — เดิมชื่อ 'Shares' เฉย ๆ ทำให้ controller/worker เอาไปคูณราคาเป็น market cap
  // (คำอธิบายเต็มอยู่ใต้ตาราง SHARES_NOTE — ใส่ในป้ายตรง ๆ ไม่ได้ เพราะ labelW ดันทุกแถวกว้างขึ้น 50 ตัวอักษร)
  ['FCF', ['fcf'], 'm'], [SHARES_LABEL, ['sharesDiluted', 'sharesBasic'], 'm'],
];
const BS_ROWS = [['Cash', ['totalcash', 'cashneq'], 'm'], ['Debt', ['debt'], 'm']];
const RATIO_ROWS = [['D/E', ['debtequity'], 'num'], ['ROE%', ['roe'], 'pct']];
// SA ย้าย income statement: /financials/ กลายเป็นหน้า overview (financialData ว่าง) ตั้งแต่ ~ส.ค. 2569
// → ลอง income-statement/ ก่อน แล้ว fallback path เก่า '' (เผื่อ namespace bkk/OTC ยังโครงเดิม)
const FIN_SUBS = [['income-statement/', ''], ['balance-sheet/'], ['ratios/']];

// ADR/F-share บน OTC: SA เก็บงบเต็มไว้ใต้ตลาดแม่เท่านั้น — payload หน้า quote มี primaryPath ชี้ไป (เช่น /quote/tyo/6954/)
const primaryPathCache = {};
function saPrimaryPath(symbol, th) {
  if (!(symbol in primaryPathCache)) {
    primaryPathCache[symbol] = (async () => {
      for (const base of saBases(symbol, th)) {
        try {
          const r = await fetch(`https://stockanalysis.com/${base}/__data.json`, { headers: H });
          if (!r.ok) continue;
          const j = await r.json();
          const pp = resolveKeys(findObj(j.nodes, ['primaryPath']), ['primaryPath']).primaryPath;
          if (typeof pp === 'string' && pp.startsWith('/quote/')) return pp.replace(/^\/+|\/+$/g, '');
        } catch (e) { /* ลอง base ถัดไป */ }
      }
      return null;
    })();
  }
  return primaryPathCache[symbol];
}
async function finPageFrom(base, sub) {
  const r = await fetch(`https://stockanalysis.com/${base}/financials/${sub}__data.json`, { headers: H });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  for (const node of j.nodes || []) {
    if (!node || !Array.isArray(node.data)) continue;
    const root = node.data[0];
    if (!root || typeof root !== 'object' || Array.isArray(root) || typeof root.financialData !== 'number') continue;
    const fd = node.data[root.financialData];
    if (fd && typeof fd === 'object' && !Array.isArray(fd)) {
      injectRevenueGrowth(node.data, root, fd);
      return { arr: node.data, fd, src: base };
    }
  }
  throw new Error('ไม่พบ financialData ใน payload');
}
// SA เลิกส่งแถว revenueGrowth สำเร็จรูป (~ส.ค. 2569 พร้อมย้าย income-statement) — เหลือ root.prior
// (ค่าปีก่อนคอลัมน์เก่าสุด) + root.ttmPrior (ค่า TTM ย้อน 1 ปี) ให้ client คิด YoY เอง
// → สังเคราะห์กลับเป็น fd.revenueGrowth ในโครง devalue เดิม เพื่อให้แถว YoY% ใน FIN_ROWS ใช้ต่อได้
// (annual เท่านั้น: YoY ของคอลัมน์ i = revenue[i]/revenue[i+1] − 1 · คอลัมน์เก่าสุดใช้ prior · TTM ใช้ ttmPrior)
function injectRevenueGrowth(arr, root, fd) {
  if ('revenueGrowth' in fd) return;
  const page = { arr, fd };
  const rev = finRow(page, ['revenue']), dk = finRow(page, ['datekey']);
  if (!rev || !dk) return;
  const deref = (i) => (typeof i === 'number' && i >= 0 && i < arr.length) ? arr[i] : undefined;
  const priorObj = deref(root.prior), ttmObj = deref(root.ttmPrior);
  const priorList = priorObj ? deref(priorObj.revenue) : undefined;
  const priorRev = Array.isArray(priorList) ? deref(priorList[0]) : undefined;
  const ttmPrevRev = ttmObj ? deref(ttmObj.revenue) : undefined;
  const idxs = rev.map((v, i) => {
    const den = asNum(dk[i] === 'TTM' ? ttmPrevRev : (i + 1 < rev.length ? rev[i + 1] : priorRev));
    const num = asNum(v);
    if (num == null || den == null || den <= 0) return -1; // devalue: ติดลบ = cell ว่าง
    arr.push(num / den - 1);
    return arr.length - 1;
  });
  arr.push(idxs);
  fd.revenueGrowth = arr.length - 1;
}
async function fetchFinPage(symbol, th, subCandidates) {
  let lastErr = null;
  for (const sub of subCandidates) {
    for (const base of saBases(symbol, th)) {
      try { return await finPageFrom(base, sub); } catch (e) { lastErr = e; }
    }
    const pp = th ? null : await saPrimaryPath(symbol, th);
    if (pp) { try { return await finPageFrom(pp, sub); } catch (e) { lastErr = e; } }
  }
  throw lastErr;
}
// คืน array ค่าต่อคอลัมน์ของ alias แรกที่มี (devalue: สมาชิก list = index ชี้กลับเข้า arr เดียวกัน · ติดลบ = undefined/NaN)
function finRow(page, aliases) {
  if (!page) return null;
  for (const k of aliases) {
    const idx = page.fd[k];
    const list = (typeof idx === 'number' && idx >= 0) ? page.arr[idx] : null;
    if (!Array.isArray(list)) continue;
    return list.map((i) => {
      if (typeof i !== 'number' || i < 0 || i >= page.arr.length) return null;
      const v = page.arr[i];
      return (typeof v === 'number' || typeof v === 'string') ? v : null;
    });
  }
  return null;
}
const fmtCell = (v, kind) => {
  const n = asNum(v);
  if (!Number.isFinite(n)) return '-';
  if (kind === 'm') { const m = n / 1e6; return Math.abs(m) >= 100 ? Math.round(m).toLocaleString('en-US') : m.toFixed(1); }
  if (kind === 'pct') return (n * 100).toFixed(1);
  return n.toFixed(2);
};

// ---------- ทางที่ 3 ของ cross-verify: EPS ที่ "ย้อนกลับได้" จากตาราง [3] ----------
const EPS_TABLE_PASS_PCT = 2;    // Δ quote↔ตาราง ≤2% = ฐานเดียวกัน
const EPS_TABLE_ABS_TOL = 0.03;  // หุ้นขาดทุน/EPS ใกล้ 0: −0.77 vs −0.79 = 2.5% แต่ต่างจริงแค่ 0.02 ⇒ ไม่ใช่ conflict
const SHARES_WARN_PCT = 3;       // Δ หุ้นคงเหลือ vs ถัวเฉลี่ยปรับลด เกินนี้ = ห้ามสลับฐาน
const YIELD_WARN_PP = 0.2;       // divYield ของ vendor ต่างจาก dps÷ราคา เกินนี้ (จุด %) = ยึดค่าที่ย้อนกลับได้

function tableEpsTTM(fin) {
  if (!fin) return { err: 'ไม่มีตาราง [3]' };
  const dk = finRow(fin, ['datekey']) || [];
  const col = dk.indexOf('TTM');
  // ไม่มีคอลัมน์ TTM = เทียบไม่ได้ ห้ามเอา FY ล่าสุดมาเทียบ EPS(TTM) ของ quote (คนละงวด = warn ปลอม)
  if (col < 0) return { err: 'ตาราง [3] ไม่มีคอลัมน์ TTM' };
  const cell = (aliases) => { const row = finRow(fin, aliases); return row ? asNum(row[col]) : null; };
  const eps = cell(['epsDiluted', 'epsdil']);
  const ni = cell(['netIncome', 'netinccmn', 'netinc']);
  const shares = cell(['sharesDiluted', 'sharesBasic']);
  const derived = (ni != null && shares) ? ni / shares : null;
  const val = eps != null ? eps : derived;
  if (val == null) return { err: 'ตาราง [3] ไม่มี EPS(dil)/NetIncome ของ TTM', shares };
  return { eps: val, from: eps != null ? 'EPS(dil) TTM' : 'NI÷Shares', ni, shares };
}

// บรรทัดนี้ prep-stock.js แกะด้วย regex (parseDeltas) — แก้ format ต้องแก้ทั้งคู่ + test:prep คุม round-trip ไว้
function epsTableLine(quoteEps, quoteSrc, table) {
  const pre = 'Δ EPS(quote↔ตาราง[3])=';
  const tail = ' — ตาราง [3] ย้อนกลับได้ (NI÷Shares) จึงเป็นทางที่ 3 ที่ชี้ขาด: verdict ✅ ข้างบนแปลว่า "vendor 2 เจ้าพูดตรงกัน" เท่านั้น';
  if (!Number.isFinite(quoteEps)) return `${pre}เทียบไม่ได้ (ไม่มี EPS จาก quote)${tail}`;
  if (!table || !Number.isFinite(table.eps) || table.eps === 0)
    return `${pre}เทียบไม่ได้ (${(table && table.err) || 'ตาราง [3] ไม่มี EPS'})${tail}`;
  const d = Math.abs(quoteEps - table.eps) / Math.abs(table.eps) * 100;
  const how = table.from === 'NI÷Shares' || (table.ni != null && table.shares)
    ? ` = NI ${fmtCell(table.ni, 'm')} ÷ ${fmtCell(table.shares, 'm')}M หุ้น` : '';
  const head = `${pre}${d.toFixed(1)}% (quote[${quoteSrc}]=${fmt(quoteEps)} · ตาราง=${fmt(table.eps)}${how})`;
  if (Math.abs(quoteEps - table.eps) <= EPS_TABLE_ABS_TOL || d <= EPS_TABLE_PASS_PCT)
    return `${head} — ✅ ฐานเดียวกัน (cross-verify ครบ 3 ทาง: Yahoo · StockAnalysis · ตาราง [3])`;
  return `${head} — ⚠ ขัดกัน >${EPS_TABLE_PASS_PCT}% แม้ quote 2 เจ้าจะตรงกัน (vendor ดึงฟีดเดียวกันได้)` +
    ` · ตัวตัดสินรอง: epsFwd ของ vendor เองต้องอยู่บนฐานเดียวกับ TTM (AMATA epsFwd 3.27 นั่งบนฐาน ~3.2 ⇒ 3.22 คือฐานจริง ไม่ใช่ 4.48)` +
    ` · แยกให้ออกว่า "ตัดงวด" (ใช้ค่าใหม่) หรือ "นิยามต่าง" (freeze + เปิดเผยทั้งสองค่า) ตาม SKILL STEP 2 ก่อนเขียน`;
}

// [2b] — หุ้นคงเหลือจริง ≠ แถว Shares ใน [3] · คืน array บรรทัด (test เรียกตรงได้ ไม่ต้องยิงเน็ต)
function statsLines(stats, statsErr, tableShares) {
  if (!stats || !stats.sharesOut)
    return [`[2b] หุ้นคงเหลือ/มูลค่าตลาด: ✗ ${statsErr || 'ดึงไม่ได้'} — WebFetch stockanalysis.com/.../statistics/ เอา Shares Outstanding ก่อนคิด Market Cap/มูลค่าต่อหุ้น (ห้ามใช้แถว Shares ใน [3] แทน)`];
  const out = ['[2b] หุ้นคงเหลือ/มูลค่าตลาด (StockAnalysis /statistics/) — ★ ใช้ค่านี้เป็นฐาน Market Cap/มูลค่าต่อหุ้น:'];
  let l = `    Shares Outstanding=${Math.round(stats.sharesOut.num).toLocaleString('en-US')} (${stats.sharesOut.text})`;
  if (stats.marketCap) l += ` · Market Cap=${stats.marketCap.text} (ตามที่ SA แสดง — ห้ามคิดเองจากฐานอื่น)`;
  out.push(l);
  const cls = stats.sharesOutClass;
  if (cls && Math.abs(cls.num - stats.sharesOut.num) / stats.sharesOut.num > 0.005)
    out.push(`    ⚠ หลายคลาสหุ้น: คลาสที่จดทะเบียน=${cls.text} vs รวมทุกคลาส=${stats.sharesOut.text} — ★ Market Cap ของ SA = ราคา × **หุ้นรวมทุกคลาส** (วัดจริง 18 ส.ค. 69: RDDT 31.65B ÷ 192.40M = $164.50 = ราคาปัจจุบันเป๊ะ · GOOGL 4.21T ÷ 12.23B = $344 — ถ้าคิดจากคลาสจดทะเบียนจะได้ $216.6/$717 ซึ่งไม่ใช่ราคา) ⇒ มูลค่าต่อหุ้นให้หารด้วยหุ้นรวมทุกคลาส ไม่ใช่คลาสที่จดทะเบียน`);
  if (Number.isFinite(tableShares) && tableShares > 0) {
    const d = (stats.sharesOut.num - tableShares) / tableShares * 100;
    out.push(Math.abs(d) > SHARES_WARN_PCT
      ? `    ⚠ คงเหลือ ${d > 0 ? 'สูงกว่า' : 'ต่ำกว่า'}แถว Shares ใน [3] ${Math.abs(d).toFixed(1)}% (ถัวเฉลี่ยถ่วงน้ำหนักปรับลด TTM=${fmtCell(tableShares, 'm')}M) — ทิศทางเดาไม่ได้ (ออกหุ้นเพิ่ม→คงเหลือสูงกว่า · หุ้นกู้แปลงสภาพ→ปรับลดสูงกว่า เคส CAMT) ⇒ ห้ามสลับฐาน: EPS×หุ้นคงเหลือ / กำไร÷หุ้นคงเหลือ = ผิดทั้งคู่`
      : `    ✅ ต่างจากแถว Shares ใน [3] เพียง ${d.toFixed(1)}% (dilution ต่ำ) — ยังต้องใช้ค่าคงเหลือบรรทัดบนเป็นฐานต่อหุ้น`);
  }
  return out;
}

// ปันผล: yield ของ vendor มัก reconcile ไม่ลงตัว — ★ ไม่แปลงหน่วยให้เงียบ ๆ พิมพ์ค่าที่ vendor ส่งมาตรง ๆ แล้วให้คนตัดสิน
function yieldLine(dps, price, yDivYieldRaw, saYield) {
  if (!(dps > 0) || !(price > 0)) return null;
  const recon = dps / price * 100;
  const seen = [];
  if (Number.isFinite(yDivYieldRaw)) seen.push(['Yahoo', yDivYieldRaw * 100]);
  if (Number.isFinite(saYield)) seen.push(['SA', saYield]);
  const bad = seen.filter(([, v]) => Math.abs(v - recon) > YIELD_WARN_PP);
  const shown = seen.map(([n, v]) => `${n}=${v.toFixed(2)}%`).join(' · ');
  const head = `    ปันผล reconcile: dps ${fmt(dps)} ÷ ราคา ${fmt(price)} = ${recon.toFixed(2)}%${shown ? ` (vendor: ${shown})` : ''}`;
  if (!seen.length) return `${head} — ใช้ค่านี้เป็น yield ในรายงาน`;
  return bad.length
    ? `${head} — ⚠ ${bad.map(([n]) => n).join('/')} ไม่ลงตัว (>${YIELD_WARN_PP}pp) มัก = คิดจากราคาเก่า/ปันผลคนละงวด ⇒ ยึดค่าที่ย้อนกลับได้ (dps÷ราคา) แล้วใช้ให้ตรงกันทุกจุด`
    : `${head} — ✅ ตรงกับ vendor`;
}

function printFinancialTable(pages, finErr) {
  const [fin, bs, ratio] = pages;
  const master = fin || bs || ratio;
  const dk = finRow(master, ['datekey']) || [];
  const nCol = Math.min(dk.length, 6); // TTM + 5 ปีล่าสุดพอ — คุม output ไม่บวม
  if (!master || !nCol) {
    console.log(`[3] งบย้อนหลัง 5 ปี: ✗ ${finErr || 'ไม่มีข้อมูล'} — WebFetch หน้า financials ของ stockanalysis แทนเฉพาะที่จำเป็น`);
    return;
  }
  const fy = finRow(master, ['fiscalYear']) || [];
  const heads = dk.slice(0, nCol).map((d, i) => d === 'TTM' ? 'TTM' : 'FY' + (fy[i] != null ? fy[i] : String(d).slice(0, 4)));
  const rows = [];
  for (const [page, spec] of [[fin, FIN_ROWS], [bs, BS_ROWS], [ratio, RATIO_ROWS]]) {
    if (!page) continue; // degrade เงียบ: หน้าไหนล่มก็ข้ามแถวของหน้านั้น
    const d = finRow(page, ['datekey']) || [];
    const map = dk.slice(0, nCol).map((key) => d.indexOf(key)); // align คอลัมน์ข้ามหน้าด้วย datekey
    for (const [label, aliases, kind] of spec) {
      const vals = finRow(page, aliases);
      if (vals) rows.push([label, map.map((i) => (i >= 0 ? fmtCell(vals[i], kind) : '-'))]);
    }
  }
  if (!rows.length) {
    console.log(`[3] งบย้อนหลัง 5 ปี: ✗ โครง payload เปลี่ยน (ไม่เจอแถวที่รู้จัก) — WebFetch หน้า financials แทน`);
    return;
  }
  const srcNote = master.src && /^quote\/(?!bkk\/)/.test(master.src)
    ? ` — จาก ${master.src} (ตลาดแม่ — ตัวเลขเป็นสกุลท้องถิ่น ไม่ใช่ USD)` : '';
  console.log(`[3] งบย้อนหลัง (StockAnalysis /financials${srcNote}) — Revenue/NI/FCF/Shares/Cash/Debt หน่วยล้าน · margin/ROE = %:`);
  const all = [['', heads], ...rows];
  const labelW = Math.max(...all.map((r) => r[0].length));
  const colW = heads.map((_, c) => Math.max(...all.map((r) => String(r[1][c]).length)));
  for (const [label, cells] of all)
    console.log('    ' + label.padEnd(labelW) + cells.map((v, c) => String(v).padStart(colW[c] + 2)).join(''));
  if (rows.some(([label]) => label === SHARES_LABEL)) console.log(SHARES_NOTE);
  console.log('    ↑ ใช้ตารางนี้เขียน section งบ/แนวโน้ม/scenario ได้เลย — ห้าม WebFetch หน้า financials/balance-sheet/ratios/cash-flow ซ้ำ');
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2);
  const th = args.includes('--th');
  const symbol = (args.find((a) => !a.startsWith('--')) || '').toUpperCase();
  if (!symbol) { console.error('ใช้: node tools/fetch-fundamentals.js SYMBOL [--th]'); process.exit(1); }
  const ysym = toYahooSymbol(symbol, th ? 'THB' : 'USD');

  let y = null, yErr = null, s = null, sErr = null, stats = null, statsErr = null;
  const finPages = [null, null, null]; let finErr = null;
  await Promise.all([
    fromYahoo(ysym).then((v) => { y = v; }).catch((e) => { yErr = e.message; }),
    fromStockAnalysis(symbol, th).then((v) => { s = v; }).catch((e) => { sErr = e.message; }),
    fromStatistics(symbol, th).then((v) => { stats = v; }).catch((e) => { statsErr = e.message; }),
    ...FIN_SUBS.map((sub, i) =>
      fetchFinPage(symbol, th, sub).then((v) => { finPages[i] = v; }).catch((e) => { finErr = finErr || e.message; })),
  ]);

  console.log(`=== FUNDAMENTALS ${symbol} (${th ? 'TH' : 'US'}) — 2 แหล่งอิสระสำหรับ cross-verify (SKILL STEP 2) ===`);
  if (y) {
    console.log(`[1] Yahoo quoteSummary (${ysym}):`);
    console.log(`    price=${fmt(y.price)} epsTTM=${fmt(y.epsTTM)} epsFwd=${fmt(y.epsFwd)} PE=${fmt(y.pe, 1)} fwdPE=${fmt(y.fwdPE, 1)}` +
      ` divYield=${pct(y.divYield)} target=${fmt(y.target)}${Number.isFinite(y.analysts) ? ` (n=${y.analysts})` : ''}` +
      ` 52wk=${fmt(y.lo52)}–${fmt(y.hi52)} ROE=${pct(y.roe)}`);
  } else console.log(`[1] Yahoo quoteSummary (${ysym}): ✗ ${yErr} — ใช้ WebFetch targeted แทนแหล่งนี้`);
  if (s) {
    const i = s.info, q = s.quote;
    console.log(`[2] StockAnalysis (${s.src}):`);
    console.log(`    price=${fmt(q.p)}${q.u ? ` (ณ ${q.u})` : ''} epsTTM=${fmt(i.eps)} PE=${fmt(i.peRatio, 1)} fwdPE=${fmt(i.forwardPE, 1)}` +
      ` div=${fmt(i.dps != null ? i.dps : i.dividend)}${i.dividendYield != null ? ` (yield=${fmt(i.dividendYield)})` : ''}` +
      ` target=${fmt(i.target)}${i.analysts != null ? ` (${i.analysts})` : ''} 52wk=${fmt(q.l52)}–${fmt(q.h52)}` +
      `${i.earningsDate ? ` earnings=${i.earningsDate}` : ''}`);
  } else console.log(`[2] StockAnalysis: ✗ ${sErr} — ใช้ WebFetch targeted แทนแหล่งนี้`);
  if (s && s.src.startsWith('quote/otc/'))
    console.log('    ⚠ OTC listing (ADR/F-share) — งบข้างล่างอาจเป็นสกุลท้องถิ่นของตลาดแม่ (เช่น JPY) ขณะที่ราคา/epsTTM บรรทัดบนเป็น USD ต่อหน่วย OTC — ห้ามเอา EPS จากงบไปหารราคา USD ตรง ๆ ต้องเช็ค ADR ratio + FX ก่อน');

  const sPrice = s && asNum(s.quote.p), sEps = s && asNum(s.info.eps);

  // ปันผล: reconcile จาก dps ของ SA (ราคาใช้ของ SA ก่อน — มาจากงบชุดเดียวกัน) แล้วเทียบ yield ที่ vendor แสดง
  if (s) {
    const dl = yieldLine(asNum(s.info.dps != null ? s.info.dps : s.info.dividend), sPrice || (y && y.price),
      y ? y.divYield : null, asNum(s.info.dividendYield));
    if (dl) console.log(dl);
  }

  // [2b] หุ้นคงเหลือ — ต้องมาก่อนบรรทัด Δ เพื่อให้ controller เห็นฐานที่ถูกก่อนตัดสินใจ
  const table = tableEpsTTM(finPages[0]);
  for (const line of statsLines(stats, statsErr, table.shares)) console.log(line);

  if (y && s && Number.isFinite(y.price) && sPrice) {
    const dP = Math.abs(y.price - sPrice) / sPrice * 100;
    const dE = (Number.isFinite(y.epsTTM) && sEps)
      ? Math.abs(y.epsTTM - sEps) / Math.abs(sEps) * 100 : null;
    console.log(`Δ ราคา=${dP.toFixed(2)}%${dE != null ? ` · Δ EPS(TTM)=${dE.toFixed(1)}%` : ' · Δ EPS(TTM)=เทียบไม่ได้'}` +
      ` — เกณฑ์: ราคา ≤2% · EPS ตรงกัน/±2% → ผ่าน · ขัดกัน = หยุดตาม SKILL (อย่าเดา)`);
  } else {
    console.log('⚠ ได้แหล่งเดียว — ต้องยืนยันแหล่งอิสระที่ 2 ก่อนเขียนตัวเลข (WebFetch targeted)');
  }

  // ทางที่ 3 — เทียบ quote กับตาราง [3] เสมอ แม้ Δ ข้างบนจะ 0% (เคส AMATA: quote ตรงกันทั้งคู่แต่ผิดทั้งคู่)
  // อ้าง SA ก่อน: quote กับตารางมาจาก vendor เจ้าเดียวกัน — ไม่ตรงกันเอง = สัญญาณ "นิยามต่าง" ที่สะอาดที่สุด
  const cmpEps = Number.isFinite(sEps) ? sEps : (y ? y.epsTTM : null);
  console.log(epsTableLine(cmpEps, Number.isFinite(sEps) ? 'SA' : 'Yahoo', table));

  printFinancialTable(finPages, finErr);
}

module.exports = {
  statsFromPayload, statNum, tableEpsTTM, epsTableLine, statsLines, yieldLine,
  SHARES_LABEL, SHARES_NOTE, EPS_TABLE_PASS_PCT, EPS_TABLE_ABS_TOL, SHARES_WARN_PCT, YIELD_WARN_PP,
};
// ★ ต้อง guard — test:prep require ไฟล์นี้เพื่อเทียบ format กับ prep-stock (offline) ถ้าไม่ guard จะยิงเน็ตจริง
if (require.main === module) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
