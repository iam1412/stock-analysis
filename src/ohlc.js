// src/ohlc.js — แปลงข้อมูล Yahoo chart API → payload กะทัดรัดสำหรับกราฟ TA
// pure ESM ไม่ import cloudflare:* → unit test ใน node ได้ (test/ohlc-test.js)
import SYMBOL_MAP from '../tools/symbol-map.json' with { type: 'json' };

export const OHLC_CACHE_TTL = 3600; // edge cache 1 ชม. — สมดุลความสด vs กัน Yahoo ล่ม (ลดจาก 6 ชม. 12 ส.ค. 69 หลังผูก custom domain แล้วแคชทำงานจริง)

// THB = ตลาดไทย → Yahoo ใช้ suffix .BK · หุ้นเปลี่ยนชื่อ/ปรับโครงสร้างใช้ override จาก tools/symbol-map.json
// (ตรรกะเดียวกับ toYahooSymbol ใน tools/update-prices.js — map ก่อน แล้วค่อย suffix)
// คีย์ค้น map ต้องอัปเปอร์เคสเหมือน entryFor ใน tools/symbol-map.js — ไม่งั้น 'bki' หลุด override
// ไปเป็น 'bki.BK' (ticker ที่เลิกเทรดแล้ว) เงียบ ๆ · suffix ยังใช้ sym ดิบ = พฤติกรรมเดียวกับ toYahooSymbol เป๊ะ
export function toYahoo(sym, cur) {
  const m = SYMBOL_MAP[String(sym).toUpperCase()] || {};
  if (m.yahoo) return m.yahoo;
  return cur === 'THB' ? `${sym}.BK` : sym;
}

const r4 = (x) => Math.round(x * 10000) / 10000;

// คืน {sym, currency, bars:{t,o,h,l,c,v}} — ตัดแท่งที่ close เป็น null (วันข้อมูลขาด/OTC บาง)
// payload ใช้ไม่ได้ → throw ให้ผู้เรียกตัดสิน (worker ตอบ 503 → client fallback SVG)
export function transformChart(j) {
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !Array.isArray(res.timestamp)) throw new Error('yahoo payload ใช้ไม่ได้');
  const q = res.indicators && res.indicators.quote && res.indicators.quote[0];
  if (!q || !Array.isArray(q.close)) throw new Error('yahoo payload ไม่มี quote');
  const bars = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < res.timestamp.length; i++) {
    if (q.close[i] == null || q.open[i] == null || q.high[i] == null || q.low[i] == null) continue;
    bars.t.push(res.timestamp[i]);
    bars.o.push(r4(q.open[i])); bars.h.push(r4(q.high[i]));
    bars.l.push(r4(q.low[i])); bars.c.push(r4(q.close[i]));
    bars.v.push(q.volume[i] == null ? 0 : q.volume[i]);
  }
  if (bars.t.length < 2) throw new Error('แท่งข้อมูลไม่พอ');
  return { sym: res.meta && res.meta.symbol || '', currency: res.meta && res.meta.currency || '', bars };
}
