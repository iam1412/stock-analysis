'use strict';
/**
 * scale.js — ขอบเขตแกน + gridline "สวย" ของกราฟ/เกจ (ย้ายจาก tools/update-prices.js ทั้งตัว ไม่แก้ตรรกะ)
 * เจ้าของเดียว: cron (fetch chart) และ v3 compute (chart/gauge bounds) ใช้ฟังก์ชันนี้ตัวเดียวกัน
 */
const num4 = (v) => +v.toFixed(6); // ตัดเศษ float ก่อนลง JSON

// ขอบเขต + gridline สวย ๆ ครอบข้อมูล + เส้น fair value
function niceBounds(values, fairLine) {
  const all = Number.isFinite(fairLine) ? values.concat([fairLine]) : values.slice();
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < Math.abs(hi) * 0.02 + 1e-9) { lo -= Math.abs(lo) * 0.02 + 0.01; hi += Math.abs(hi) * 0.02 + 0.01; }
  const niceStep = (raw) => {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const f of [1, 2, 2.5, 5, 10]) if (raw <= f * p * 1.0001) return f * p;
    return 10 * p;
  };
  let step = niceStep((hi - lo) / 4);
  let min, max, grid;
  for (let i = 0; i < 6; i++) { // ขยาย step จน grid ≤ 5 เส้น
    const pad = (hi - lo) * 0.06;
    min = Math.floor((lo - pad) / step) * step;
    max = Math.ceil((hi + pad) / step) * step;
    if (min < 0 && lo >= 0) min = 0;
    grid = [];
    for (let g = min + step; g < max - step * 0.01; g += step) grid.push(num4(g));
    if (grid.length <= 5) break;
    step = niceStep(step * 1.6);
  }
  return { min: num4(min), max: num4(max), grid };
}

module.exports = { niceBounds, num4 };
