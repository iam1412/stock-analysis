'use strict';
/**
 * legs.js — สูตรขาประเมินมูลค่า (ค่าต่อหุ้น) · เจ้าของเดียวของคณิต FV ใน v3
 * เดิม: .mval/.mdesc เป็นข้อความที่ AI พิมพ์ แล้ว E21/E22/W14 ใช้ regex แกะกลับมาตรวจ (≈20 fix commits)
 * v3: ค่าคิดจาก inputs เสมอ → ผิดเลขไม่ได้ · ผิดได้แค่สมมติฐาน (ซึ่งตรวจด้วยการคำนวณได้)
 * input % = หน่วยเปอร์เซ็นต์ (g: 8 = 8%) · เงินรวมทั้งบริษัท = fcf/revenue/ebitda/netDebt · ที่เหลือต่อหุ้น
 */
const pct = (x) => x / 100;

function inputsOf(leg, f) {
  const o = { ...(f || {}) };
  if (leg.override) for (const [k, v] of Object.entries(leg.override)) if (k !== 'why') o[k] = v;
  return o;
}

function legValue(leg, fundamentals, path) {
  const P = path || 'leg';
  const b = inputsOf(leg, fundamentals);
  const i = leg.inputs || {};
  const need = (k) => {
    const v = b[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${P}: ต้องมี fundamentals.${k} (หรือ override.${k}) สำหรับวิธี ${leg.method}`);
    return v;
  };
  const spread = (r, g, gName) => {
    if (!(r > g)) throw new Error(`${P}: r (${r}%) ต้อง > ${gName} (${g}%) — สูตรนี้หารด้วย (r − ${gName})`);
    return pct(r) - pct(g);
  };
  const perShare = (total) => total / need('shares');
  const equity = (ev) => {
    const eq = ev - (b.netDebt || 0);
    if (!(eq > 0)) throw new Error(`${P}: มูลค่าส่วนผู้ถือหุ้น ≤ 0 (EV ${ev.toExponential(3)} − หนี้สุทธิ ${(b.netDebt || 0).toExponential(3)}) — วิธี ${leg.method} ใช้กับหุ้นนี้ไม่ได้`);
    return eq;
  };
  let v;
  switch (leg.method) {
    case 'pe': v = need('eps') * i.multiple; break;
    case 'pbv':
      v = i.multiple != null ? need('bvps') * i.multiple
        : (pct(need('roe')) - pct(i.g)) / spread(i.r, i.g, 'g') * need('bvps');
      break;
    case 'ps': v = perShare(need('revenue')) * i.multiple; break;
    case 'evsales': v = perShare(equity(need('revenue') * i.multiple)); break;
    case 'evebitda': v = perShare(equity(need('ebitda') * i.multiple)); break;
    case 'pfcf': v = perShare(need('fcf')) * i.multiple; break;
    case 'fcfyield': v = perShare(need('fcf')) / pct(i.yield); break;
    case 'pffo': v = need('ffoPerShare') * i.multiple; break;
    case 'ddm': v = need('dps') * (1 + pct(i.g)) / spread(i.r, i.g, 'g'); break;
    case 'ddm2': {
      // §3.6 N — D₁ = d1 · D_{t+1} = D_t·(1+g1) ขณะ t < years1 ไม่งั้น (1+g2) · horizon null = Gordon ปลายช่วง 1
      const r = pct(i.r), H = i.horizon == null ? i.years1 : i.horizon;
      if (i.horizon == null) spread(i.r, i.g2, 'g2');
      let D = i.d1, pv = 0;
      for (let t = 1; t <= H; t++) { pv += D / Math.pow(1 + r, t); D *= 1 + pct(t < i.years1 ? i.g1 : i.g2); }
      if (i.horizon == null) pv += D / (r - pct(i.g2)) / Math.pow(1 + r, i.years1);
      v = pv;
      break;
    }
    case 'dcf': {
      const r = pct(i.r);
      spread(i.r, i.tg, 'tg');
      let fcf = need('fcf'), pv = 0;
      for (let t = 1; t <= i.years1; t++) { fcf *= 1 + pct(i.g1); pv += fcf / Math.pow(1 + r, t); }
      const tv = fcf * (1 + pct(i.tg)) / (r - pct(i.tg)) / Math.pow(1 + r, i.years1);
      v = perShare(equity(pv + tv));
      break;
    }
    case 'ri': {
      const r = pct(i.r), roe = pct(need('roe'));
      let book = need('bvps'); v = book;
      for (let t = 1; t <= i.years; t++) { v += (roe - r) * book / Math.pow(1 + r, t); book *= 1 + roe * (1 - pct(i.payout)); }
      break;
    }
    case 'declared': v = i.value; break;
    default: throw new Error(`${P}.method: ไม่รู้จักวิธี ${JSON.stringify(leg.method)}`);
  }
  if (!Number.isFinite(v) || !(v > 0)) throw new Error(`${P}: ค่าขาได้ ${v} (≤ 0 หรือไม่ใช่ตัวเลข) — ตรวจ inputs`);
  return v;
}

module.exports = { legValue, inputsOf };
