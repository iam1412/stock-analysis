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
 * ใช้:  node tools/fetch-fundamentals.js SYMBOL [--th]
 *   --th = หุ้นไทย (Yahoo = SYMBOL.BK · StockAnalysis = quote/bkk/SYMBOL) — ★ ต้องระบุเอง กัน ticker ชนกัน
 *
 * script ล่มแหล่งใดแหล่งหนึ่ง → พิมพ์ ✗ พร้อมเหตุผล — agent ยิง WebFetch targeted แหล่งนั้นแทน (fallback เดิม)
 * ตารางงบ: หน้าไหนล่มก็ข้ามแถวของหน้านั้นเงียบ ๆ (พิมพ์เท่าที่ได้ ไม่ crash)
 * ticker ที่ Yahoo เปลี่ยนชื่อ → ใช้ tools/symbol-map.json อัตโนมัติ (ผ่าน toYahooSymbol)
 */
const fs = require('fs');
const path = require('path');
const { toYahooSymbol } = require('./update-prices.js');

const SYMBOL_MAP = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'symbol-map.json'), 'utf8')); }
  catch (e) { return {}; }
})();

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
  const saSym = (SYMBOL_MAP[symbol] && SYMBOL_MAP[symbol].sa) || symbol;
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

// ---------- แหล่งเสริม: งบย้อนหลัง 5 ปี + TTM (StockAnalysis /financials 3 หน้า — SvelteKit devalue เหมือนข้างบน) ----------
// แถว: [label, aliases, fmt] — หุ้น US/TH ใช้ชื่อ key ต่างกัน (US=epsDiluted,netIncome · TH=epsdil,netinccmn)
const FIN_ROWS = [
  ['Revenue', ['revenue'], 'm'], ['  YoY%', ['revenueGrowth'], 'pct'],
  ['GrossM%', ['grossMargin'], 'pct'], ['OpM%', ['operatingMargin'], 'pct'], ['NetM%', ['profitMargin'], 'pct'],
  ['NetIncome', ['netIncome', 'netinccmn', 'netinc'], 'm'], ['EPS(dil)', ['epsDiluted', 'epsdil'], 'num'],
  ['FCF', ['fcf'], 'm'], ['Shares', ['sharesDiluted', 'sharesBasic'], 'm'],
];
const BS_ROWS = [['Cash', ['totalcash', 'cashneq'], 'm'], ['Debt', ['debt'], 'm']];
const RATIO_ROWS = [['D/E', ['debtequity'], 'num'], ['ROE%', ['roe'], 'pct']];
const FIN_SUBS = ['', 'balance-sheet/', 'ratios/'];

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
    if (fd && typeof fd === 'object' && !Array.isArray(fd)) return { arr: node.data, fd, src: base };
  }
  throw new Error('ไม่พบ financialData ใน payload');
}
async function fetchFinPage(symbol, th, sub) {
  let lastErr = null;
  for (const base of saBases(symbol, th)) {
    try { return await finPageFrom(base, sub); } catch (e) { lastErr = e; }
  }
  const pp = th ? null : await saPrimaryPath(symbol, th);
  if (pp) { try { return await finPageFrom(pp, sub); } catch (e) { lastErr = e; } }
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
  console.log('    ↑ ใช้ตารางนี้เขียน section งบ/แนวโน้ม/scenario ได้เลย — ห้าม WebFetch หน้า financials/balance-sheet/ratios/cash-flow ซ้ำ');
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2);
  const th = args.includes('--th');
  const symbol = (args.find((a) => !a.startsWith('--')) || '').toUpperCase();
  if (!symbol) { console.error('ใช้: node tools/fetch-fundamentals.js SYMBOL [--th]'); process.exit(1); }
  const ysym = toYahooSymbol(symbol, th ? 'THB' : 'USD');

  let y = null, yErr = null, s = null, sErr = null;
  const finPages = [null, null, null]; let finErr = null;
  await Promise.all([
    fromYahoo(ysym).then((v) => { y = v; }).catch((e) => { yErr = e.message; }),
    fromStockAnalysis(symbol, th).then((v) => { s = v; }).catch((e) => { sErr = e.message; }),
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
  if (y && s && Number.isFinite(y.price) && sPrice) {
    const dP = Math.abs(y.price - sPrice) / sPrice * 100;
    const dE = (Number.isFinite(y.epsTTM) && sEps)
      ? Math.abs(y.epsTTM - sEps) / Math.abs(sEps) * 100 : null;
    console.log(`Δ ราคา=${dP.toFixed(2)}%${dE != null ? ` · Δ EPS(TTM)=${dE.toFixed(1)}%` : ' · Δ EPS(TTM)=เทียบไม่ได้'}` +
      ` — เกณฑ์: ราคา ≤2% · EPS ตรงกัน/±2% → ผ่าน · ขัดกัน = หยุดตาม SKILL (อย่าเดา)`);
  } else {
    console.log('⚠ ได้แหล่งเดียว — ต้องยืนยันแหล่งอิสระที่ 2 ก่อนเขียนตัวเลข (WebFetch targeted)');
  }

  printFinancialTable(finPages, finErr);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
