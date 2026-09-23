'use strict';
/**
 * safe-values.js — allowlist ของค่าที่ถูก splice ดิบลง <style>/<script>/style="" (open-item #50)
 * เจ้าของเดียว: build.js validateReportData (ตรวจตอน build) + tools/v3/schema.js (ปฏิเสธตั้งแต่ต้นทาง)
 * ★ allowlist ไม่ใช่ denylist — ไม่มีชุดอักขระใดรับ '<' '>' ';' '{' '}' หรือ quote (ย้ายมาจาก build.js ทั้งตัว ไม่แก้ตรรกะ)
 */
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, FN = /^(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/i,
  VAR = /^var\(--[a-z0-9-]+(,[a-z0-9#%.,()\s-]+)?\)$/i, GRAD = /^(linear|radial)-gradient\([a-z0-9#%.,()\s-]+\)$/i, NAMED = /^[a-z]+$/i;
const colorOK = (v, grad) => { v = String(v).trim(); return HEX.test(v) || FN.test(v) || VAR.test(v) || NAMED.test(v) || !!(grad && GRAD.test(v)); };
// gridFmt อยู่ใน grid.forEach(v=>…) → ใช้ v เท่านั้น · dataFmt อยู่ใน data.forEach((d,i)=>…) → ใช้ d[1] เท่านั้น
const GRID_FMT_OK = /^v(\.toFixed\([0-4]\))?$|^Math\.round\(v\)$/;
const DATA_FMT_OK = /^d\[1\](\.toFixed\([0-4]\))?$|^Math\.round\(d\[1\]\)$/;

module.exports = { colorOK, GRID_FMT_OK, DATA_FMT_OK, HEX, FN, VAR, GRAD, NAMED };
