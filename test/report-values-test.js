'use strict';
const assert = (c, m) => { n++; if (c) return; fails++; console.error('✗ ' + m); };
let n = 0, fails = 0;
const RV = require('../tools/report-values.js');

const sm = { symbol: 'BBL', currency: 'THB', price: 188, fairValue: 195, mos: 3.6, upside: 3.7, pe: 8.67, dividendYield: 6.4, roe: 7.3 };
const rd = () => ({
  v: 2, fv: 195,
  values: { px: 188, priceDate: '2026-09-11', chgSuffix: 'รอบปี', fvLow: 180, fvHigh: 210, analystTgt: 205, eps: 21.7,
    shares: 1909000000, revenue: 140e9, dps: 12, bvps: 260, baseEps: 21.7,
    scenarios: [{ tgt: 160, div: 36 }, { tgt: 230, div: 36 }, { tgt: 300, div: 36 }], scnBasis: { years: 3, divIncluded: true, perYear: 'cagr' } },
  theme: { accent: '#1a73e8', chgBg: 'var(--green-soft)', chgColor: '#137333' },
  chart: { data: [['ก.ย.25', 150], ['ต.ค.25', 160], ['ก.ย.26', 188]], min: 120, max: 240, grid: [150, 200], currency: '฿', highlight: [0, 2] },
  gauge: { min: 120, max: 240 },
});

// ── derive ──
// หมายเหตุ: mosText/upside ใช้ DV.fmtMos ของจริง (abs>=2% → ปัดเป็นจำนวนเต็ม) ⇒ 3.59%/3.72% ปัดเป็น "+4%" ทั้งคู่
// (ไม่ใช่ "+3.6%"/"+3.7%" ตามค่า sm.mos/sm.upside ที่เป็นแค่ fixture คนละที่มา) — แก้ค่าคาดหวังให้ตรงกติกาจริงของ DV.fmtMos
// เช่นเดียวกับ chg.text: annualChg ของจริง (ย้ายมาเป๊ะจาก update-prices.js) ไม่ใส่วงเล็บรอบ suffix
{
  const d = RV.derive(rd(), sm);
  assert(d.cur === '฿', 'cur จาก stock-meta.currency');
  assert(Math.abs(d.mos - 3.59) < 0.01 && d.mosText === '+4%' && d.mosShown === 4, 'mos/mosText/mosShown ' + d.mosText);
  assert(d.mosClass === 'bad', 'mosClass bad (<10)');
  assert(d.mos20 === 156 && d.mos30 === 136.5, 'mos20/30');
  assert(Math.abs(d.upside - 3.7234) < 0.01, 'upside numeric: ' + d.upside);
  assert(d.chg.text === '▲ +25.3% รอบปี' && d.chg.dir === 'up', 'chg จาก chart.data: ' + d.chg.text);
  assert(d.priceDate.text === '11 ก.ย. 2569', 'priceDate พ.ศ.: ' + d.priceDate.text);
  assert(Math.abs(d.pe - 188 / 21.7) < 1e-9 && Math.abs(d.mcap - 188 * 1909e6) < 1 && Math.abs(d.yield - 12 / 188 * 100) < 1e-9 && Math.abs(d.pbv - 188 / 260) < 1e-9, 'pe/mcap/yield/pbv');
  assert(Math.abs(d.ps - 188 * 1909e6 / 140e9) < 1e-9, 'ps');
  assert(Math.abs(d.analystPct - (205 - 188) / 188 * 100) < 1e-9, 'analystPct');
  const s = d.scenarios;
  assert(s.length === 3 && Math.abs(s[0].total - ((160 + 36 - 188) / 188 * 100)) < 1e-9 && s[0].cls === 'pos', 'scenario total รวมปันผล: ' + s[0].total);
  assert(Math.abs(s[0].perYear - ((Math.pow(1 + s[0].total / 100, 1 / 3) - 1) * 100)) < 1e-9, 'perYear cagr');
}
// ── perYear linear / ไม่รวมปันผล / ไม่มี %/ปี ──
{
  const r = rd(); r.values.scnBasis = { years: 3, divIncluded: false, perYear: 'linear' };
  const s = RV.derive(r, sm).scenarios[0];
  assert(Math.abs(s.total - (160 - 188) / 188 * 100) < 1e-9 && s.cls === 'neg' && Math.abs(s.perYear - s.total / 3) < 1e-9, 'ไม่รวมปันผล + linear');
  r.values.scnBasis.perYear = null;
  assert(RV.derive(r, sm).scenarios[0].perYear === null, 'perYear null');
}
// ── TOKENS / renderValues ──
{
  const html = '<div class="px">{{rd:px}}</div> <div class="big">{{rd:mos}}</div> class="mos-verdict {{rd:mosClass}}" '
    + 'value="{{rd:pxNum}}" ราคา ณ {{rd:priceDate}} <div class="chg">{{rd:chg}}</div> {{rd:fv}} {{rd:fvLow}}–{{rd:fvHigh}} '
    + '{{rd:mos20}} {{rd:mos30}} {{rd:analystTgt}} ({{rd:analystPct}}) {{rd:pe}}x {{rd:mcap}} {{rd:ps}}x {{rd:yield}} {{rd:pbv}}x '
    + '~{{rd:baseEps}}{{rd:scnNote}} {{rd:sc1tgt}} <div class="ret {{rd:sc1retClass}}">{{rd:sc1ret}}</div> ~{{rd:sc1div}} {{rd:upside}}';
  const out = RV.renderValues(html, rd(), sm);
  assert(out.includes('<div class="px">฿188.00</div>'), 'px render: ' + out.slice(0, 40));
  assert(out.includes('<div class="big">+4%</div>') && out.includes('mos-verdict bad"'), 'mos/mosClass');
  assert(out.includes('value="188"') && out.includes('ราคา ณ 11 ก.ย. 2569'), 'pxNum/priceDate');
  assert(out.includes('▲ +25.3% รอบปี'), 'chg');
  assert(out.includes('฿195.00 ฿180.00–฿210.00 ฿156.00 ฿136.50 ฿205.00 (+9%)'), 'fv/กรอบ/mos20/30/analyst: ' + out);
  assert(out.includes(' 8.7x ') && out.includes('฿3.59 แสนล้าน') && out.includes(' 2.6x ') && out.includes(' 6.4% ') && out.includes(' 0.72x '), 'การ์ด derive: ' + out);
  assert(out.includes('~฿21.70 • รวมปันผล ฿160.00'), 'baseEps + scnNote + sc1tgt');
  assert(/class="ret pos">\+4% \(\+1\.4%\/ปี\)<\/div> ~฿36\.00/.test(out), 'sc1ret/class/div: ' + out);
  assert(out.trimEnd().endsWith('+4%'), 'upside (token ท้ายสุด): ' + out.slice(-20));
  assert(!/\{\{rd:/.test(out), 'ไม่เหลือ token');
}
// ── ยาม ──
{
  let threw = '';
  try { RV.renderValues('{{rd:nope}}', rd(), sm); } catch (e) { threw = e.message; }
  assert(/ไม่รู้จัก/.test(threw), 'key ไม่รู้จัก throw: ' + threw);
  threw = '';
  const r = rd(); r.values.analystTgt = null;
  try { RV.renderValues('{{rd:analystTgt}}', r, sm); } catch (e) { threw = e.message; }
  assert(/analystTgt/.test(threw), 'token ที่ค่าเป็น null throw: ' + threw);
  threw = '';
  try { RV.renderValues('{{rd:sc1 tgt}}', rd(), sm); } catch (e) { threw = e.message; }
  assert(/เหลือ/.test(threw), 'token รูปผิด (เหลือ {{rd:) throw: ' + threw);
}
// ── validateValues ──
{
  const bad = (mut, re, label) => { const r = rd(); mut(r); let t = ''; try { RV.validateValues(r, sm); } catch (e) { t = e.message; } assert(re.test(t), label + ': ' + t); };
  RV.validateValues(rd(), sm);
  bad((r) => { r.values.bogus = 1; }, /bogus/, 'คีย์แปลกใน values');
  bad((r) => { r.values.px = '188'; }, /px/, 'px ไม่ใช่ number');
  bad((r) => { r.values.priceDate = '11 ก.ย. 2569'; }, /priceDate/, 'priceDate ไม่ใช่ ISO');
  bad((r) => { r.values.chgSuffix = 'YTD'; }, /chgSuffix/, 'chgSuffix นอกรายการ');
  bad((r) => { r.gauge.cur = 188; }, /gauge\.cur/, 'v2 ห้ามมี gauge.cur');
  bad((r) => { r.gauge.fair = 195; }, /gauge\.fair/, 'v2 ห้ามมี gauge.fair');
  bad((r) => { r.chart.fairLine = 195; }, /fairLine/, 'v2 ห้ามมี chart.fairLine');
  bad((r) => { r.values.scenarios = [{ tgt: 1 }]; }, /scenarios/, 'scenarios ต้อง 3 ฉาก');
  bad((r) => { r.values.scnBasis.perYear = 'x'; }, /perYear/, 'perYear นอกรายการ');
  bad((r) => { r.values.shares = 12; }, /shares/, 'shares ต้อง ≥ 1e5 (หุ้นทั้งบริษัท ไม่ใช่ล้านหุ้น)');
  let t = ''; try { RV.validateValues(rd(), { ...sm, currency: 'CAD' }); } catch (e) { t = e.message; }
  assert(/currency/.test(t), 'currency นอก USD/THB: ' + t);
  assert(RV.isV2(rd()) && !RV.isV2({ fv: 1 }) && !RV.isV2(null), 'isV2');
}
// ── format helpers ──
{
  assert(RV.fmtPrice(1234.5) === '1,234.50' && RV.fmtPrice(0.85) === '0.85', 'fmtPrice');
  assert(RV.fmtBig(3.21e12, '$') === '$3.21T' && RV.fmtBig(4.52e10, '$') === '$45.2B' && RV.fmtBig(8.5e8, '$') === '$850M', 'fmtBig USD: ' + RV.fmtBig(4.52e10, '$'));
  assert(RV.fmtBig(3.59e11, '฿') === '฿3.59 แสนล้าน' && RV.fmtBig(8.288e9, '฿') === '฿8.29 พันล้าน' && RV.fmtBig(1.2e12, '฿') === '฿1.20 ล้านล้าน', 'fmtBig THB: ' + RV.fmtBig(8.288e9, '฿'));
  assert(RV.isoOf({ day: 3, monIdx: 0, yearCE: 2026 }) === '2026-01-03', 'isoOf');
  const p = RV.parseIso('2026-09-11'); assert(p.day === 11 && p.monIdx === 8 && p.yearCE === 2026, 'parseIso');
  assert(RV.annualChg([['a', 100], ['b', 100.5]], 'รอบปี').text === '≈ ทรงตัว รอบปี', 'annualChg flat (FLAT_PP 0.75)');
  assert(RV.mosBand(9.9) === 'bad' && RV.mosBand(10) === 'ok' && RV.mosBand(20) === 'good', 'mosBand');
}
console.log(`report-values-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
