'use strict';
/**
 * keep-map.js — "อักขระไหนของ a ยังอยู่ใน b และอยู่ที่ index ไหน" (zero-dep)
 *
 * keepMap(a, b) → Int32Array ยาว a.length: ช่อง i = index ใน b ของอักขระ a[i] ที่คงอยู่ (อยู่ใน LCS)
 * หรือ -1 เมื่อถูกลบ/แทน · ใช้ Myers O(ND) บนส่วนกลางหลังตัด prefix/suffix ร่วมออก
 *
 * ผู้ใช้: tools/update-prices.js `derivedPassV2` — รายงาน v2 render token `{{rd:…}}` เป็น view แล้วให้
 * patchDerived (regex บน HTML ที่ render แล้ว) แก้การ์ด literal · keep-map บอกว่า span ของ token แต่ละตัว
 * ถูกแตะหรือไม่ และขอบของมันไปอยู่ตรงไหนใน view ที่ patch แล้ว เพื่อวาง token กลับที่เดิม
 * ★ D (จำนวนอักขระที่ต่าง) ใหญ่เกิน MAX_D = throw — trace ของ Myers กินหน่วยความจำ O(D²)
 *   cron เปลี่ยนแค่ตัวเลขในการ์ดไม่กี่ใบ (D หลักสิบ · จำลองทั้งคลัง: view ใหญ่สุด 33 KB) · D ใหญ่ = มีอะไรผิดปกติ
 *   ให้ไปเป็น patch-failed ดีกว่าเดา · วัดบนสตริง 33 KB (review Task 11 F5): D≈2000 = 13 ms / 70 MB ·
 *   D≈8000 = 158 ms / 288 MB · D≈19000 = 904 ms / 598 MB ⇒ เพดาน 4000 (เดิม 20000 ปล่อยให้จองเกือบ 1.6 GB ก่อน throw)
 */
const MAX_D = 4000;

function keepMap(a, b) {
  const n0 = a.length, m0 = b.length;
  let p = 0;
  while (p < n0 && p < m0 && a[p] === b[p]) p++;
  let s = 0;
  while (s < n0 - p && s < m0 - p && a[n0 - 1 - s] === b[m0 - 1 - s]) s++;
  const N = n0 - p - s, M = m0 - p - s;
  const map = new Int32Array(n0).fill(-1);
  for (let i = 0; i < p; i++) map[i] = i;
  for (let i = 0; i < s; i++) map[n0 - 1 - i] = m0 - 1 - i;
  if (N === 0 || M === 0) return map;

  const A = (i) => a.charCodeAt(p + i), B = (j) => b.charCodeAt(p + j);
  const MAX = N + M, off = MAX + 1;
  const V = new Int32Array(2 * MAX + 3);
  const trace = [];   // trace[d] = สำเนา V ช่วง k ∈ [-d-1, d+1] ก่อนเริ่มรอบ d
  let D = -1;
  outer:
  for (let d = 0; d <= MAX; d++) {
    if (d > MAX_D) throw new Error(`keepMap: ต่างกันเกิน ${MAX_D} อักขระ — ไม่ map (สงสัยการแก้ผิดปกติ)`);
    trace.push(V.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A(x) === B(y)) { x++; y++; }
      V[off + k] = x;
      if (x >= N && y >= M) { D = d; break outer; }
    }
  }

  // ย้อนรอยจากรอบสุดท้าย — ช่วงทแยง (snake) = อักขระที่คงอยู่
  let x = N, y = M;
  for (let d = D; d > 0; d--) {
    const v = trace[d];
    const get = (k) => v[k + d + 1];
    const k = x - y;
    const pk = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
    const px = get(pk), py = px - pk;
    while (x > px && y > py) { x--; y--; map[p + x] = p + y; }
    x = px; y = py;
  }
  while (x > 0 && y > 0) { x--; y--; map[p + x] = p + y; }
  return map;
}

module.exports = { keepMap, MAX_D };
