#!/usr/bin/env node
'use strict';
/**
 * fetch-fundamentals.js — ดึง EPS/P/E/ปันผล/เป้านักวิเคราะห์/52wk จาก **2 แหล่งอิสระ** ในคำสั่งเดียว
 * (Yahoo quoteSummary + StockAnalysis) เป็นบล็อกสั้นให้ worker ใช้ cross-verify ตาม SKILL STEP 1–2
 * — token-lean: แทน WebFetch 2-3 turns ของ agent ด้วย 1 คำสั่ง output ~15 บรรทัด · ไม่แตะไฟล์ใด ๆ
 *
 * ใช้:  node tools/fetch-fundamentals.js SYMBOL [--th]
 *   --th = หุ้นไทย (Yahoo = SYMBOL.BK · StockAnalysis = quote/bkk/SYMBOL) — ★ ต้องระบุเอง กัน ticker ชนกัน
 *
 * script ล่มแหล่งใดแหล่งหนึ่ง → พิมพ์ ✗ พร้อมเหตุผล — agent ยิง WebFetch targeted แหล่งนั้นแทน (fallback เดิม)
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
async function fromStockAnalysis(symbol, th) {
  const saSym = (SYMBOL_MAP[symbol] && SYMBOL_MAP[symbol].sa) || symbol;
  const pathPart = th ? `quote/bkk/${saSym}` : `stocks/${saSym}`;
  const r = await fetch(`https://stockanalysis.com/${pathPart}/__data.json`, { headers: H });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (!j.nodes || JSON.stringify(j).length < 500) throw new Error('payload ว่าง (ticker ไม่มีใน StockAnalysis?)');
  const info = resolveKeys(findObj(j.nodes, ['eps', 'peRatio', 'target']),
    ['eps', 'peRatio', 'forwardPE', 'dividend', 'dps', 'dividendYield', 'target', 'analysts', 'earningsDate', 'marketCap', 'payoutRatio']);
  const quote = resolveKeys(findObj(j.nodes, ['p', 'h52', 'l52']), ['p', 'cl', 'u', 'h52', 'l52']);
  if (!('eps' in info)) throw new Error('หา info object (eps/peRatio/target) ในผลลัพธ์ไม่เจอ — โครง payload อาจเปลี่ยน');
  return { src: pathPart, info, quote };
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2);
  const th = args.includes('--th');
  const symbol = (args.find((a) => !a.startsWith('--')) || '').toUpperCase();
  if (!symbol) { console.error('ใช้: node tools/fetch-fundamentals.js SYMBOL [--th]'); process.exit(1); }
  const ysym = toYahooSymbol(symbol, th ? 'THB' : 'USD');

  let y = null, yErr = null, s = null, sErr = null;
  await Promise.all([
    fromYahoo(ysym).then((v) => { y = v; }).catch((e) => { yErr = e.message; }),
    fromStockAnalysis(symbol, th).then((v) => { s = v; }).catch((e) => { sErr = e.message; }),
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
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
