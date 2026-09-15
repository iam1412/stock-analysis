'use strict';
/**
 * probe-peryear.js — หลักฐานของ open item #1 (ระยะ 3 Task 9): แพทเทิร์น `%/ปี` ควรเข้า `RV.PROSE_BOUND` (E44) ไหม
 *
 * วิธี: **ไม่แก้ `tools/report-values.js`** — ดัน pattern ผู้สมัครเข้า `RV.PROSE_BOUND` ที่ export มา (อาร์เรย์เดียวกัน
 * โดย reference) แล้วเรียก `RV.proseBoundHits()` ตัวจริงทั้งคลัง ⇒ ได้ผลเหมือนเปิดจริงทุกประการ (รวมการตัดจุดที่ซ้อน
 * กับ 6 แพทเทิร์นเดิม) โดยไม่ต้องเปิดจริง
 *
 * ผู้สมัคร 3 แบบ:
 *   V0 = "ค่าตรงเป๊ะ" อย่างเดียว (ชั้น ข ตรงตามที่ open item เสนอ ไม่มีป้าย)
 *   V1 = V0 + ป้าย "ผลตอบแทน/total return/CAGR/ทบต้น" นำหน้าแบบชิด (ตามโครงของ 6 แพทเทิร์นเดิมที่ทุกตัวมีป้าย)
 *   V2 = รูปประกอบเหมือนที่ token `sc{i}ret` render จริง ("+49.0% (+14.2%/ปี)")
 *
 * ยังวัด **ความกระพริบตามราคา** ด้วย: รันซ้ำโดยขยับ `values.px` ±2%/±5% แล้วดูว่าชุดจุดที่ยิงเปลี่ยนไหม
 * (บทเรียน W18 — error ที่กระพริบตามราคาใช้เป็น gate ไม่ได้)
 *
 * รัน: node docs/superpowers/audit/2026-09-11-stock-analyzer/probe-peryear.js [outDir]
 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../../..');
const RV = require(path.join(ROOT, 'tools/report-values.js'));
const RM = require(path.join(ROOT, 'tools/report-meta.js'));

const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// สำเนาของ pbNum/pbOwns (ไม่ได้ export) — ใช้กติกาเดียวกับ tools/report-values.js เป๊ะ
function pbNum(text) {
  const t = String(text).replace(/[,\s]/g, '').replace(/−/g, '-');
  const m = t.match(/(-?)(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const dot = m[2].indexOf('.');
  return { n: parseFloat(m[1] + m[2]), dec: dot < 0 ? 0 : m[2].length - dot - 1 };
}
const pbOwns = (shown, want) => { const p = pbNum(shown); return !!p && Number.isFinite(want) && Math.abs(p.n - want) <= 0.5 * Math.pow(10, -p.dec); };

const PCT_YEAR = '((?:[+\\-−]|~|ราว\\s|ประมาณ\\s|≈\\s?)?\\s*[0-9]+(?:\\.[0-9]+)?\\s*%\\s*/\\s*ปี)';
const SCN_STOP = 'ราคา|เป้า|EPS|ปันผล|โต|เติบโต|growth|ที่ต้องการ|คาดหวัง';
const perOf = (d, i) => (d && d.scenarios && d.scenarios[i] ? d.scenarios[i].perYear : null);
const matchScn = (text, d) => { for (let i = 0; i < 3; i++) if (perOf(d, i) != null && pbOwns(text, perOf(d, i))) return i; return -1; };

const CANDIDATES = {
  V0: { id: 'scnPerYear0', label: 'ผลตอบแทนฉาก (%/ปี) [ไม่มีป้าย]',
    re: () => new RegExp(PCT_YEAR, 'gi'),
    hits: (m, seg, d) => { const i = matchScn(m[1], d); return i < 0 ? [] : [{ at: m.index, text: m[1], token: `sc${i + 1}ret` }]; } },
  V1: { id: 'scnPerYear1', label: 'ผลตอบแทนฉาก (%/ปี) [มีป้าย]',
    re: () => new RegExp(`(ผลตอบแทน|total\\s*return|CAGR|ทบต้น)((?:(?!${SCN_STOP})[^<0-9{}]){0,40}?)${PCT_YEAR}`, 'gi'),
    hits: (m, seg, d) => { const i = matchScn(m[3], d); return i < 0 ? [] : [{ at: m.index + m[1].length + m[2].length, text: m[3], token: `sc${i + 1}ret` }]; } },
  V2: { id: 'scnPerYear2', label: 'ผลตอบแทนฉาก (รูปประกอบเหมือน sc{i}ret)',
    re: () => new RegExp(`((?:[+\\-−])\\s*[0-9]+(?:\\.[0-9]+)?\\s*%)(\\s*\\(\\s*)${PCT_YEAR}(\\s*\\))`, 'gi'),
    hits: (m, seg, d) => {
      const i = matchScn(m[3], d);
      if (i < 0 || !pbOwns(m[1], d.scenarios[i].total)) return [];
      return [{ at: m.index, text: m[1] + m[2] + m[3] + m[4], token: `sc${i + 1}ret` }];
    } },
};

const FILES = fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => f.endsWith('.html'));
function ctxOf(name) {
  const src = fs.readFileSync(path.join(ROOT, 'reports', name), 'utf8');
  const rdS = RM.readReportData(src), smS = RM.readStockMetaState(src);
  if (!rdS.ok || !RV.isV2(rdS.data) || !smS.ok) return null;
  return { src, rd: rdS.data, sm: smS.data };
}
/** รันแพทเทิร์นผู้สมัคร 1 ตัวทั้งคลัง (ดันเข้า PROSE_BOUND จริงแล้วถอดออก) · pxMul = ตัวคูณราคาสำหรับทดสอบความกระพริบ */
function run(cand, pxMul) {
  RV.PROSE_BOUND.push(cand);
  const hits = [];
  try {
    for (const f of FILES) {
      const c = ctxOf(f);
      if (!c) continue;
      const rd = JSON.parse(JSON.stringify(c.rd));
      if (pxMul !== 1) rd.values.px = Math.round(rd.values.px * pxMul * 100) / 100;
      let d;
      try { RV.validateValues(rd, c.sm); d = RV.derive(rd, c.sm); } catch { continue; }
      for (const h of RV.proseBoundHits(c.src, d)) {
        if (h.label !== cand.label) continue;
        hits.push({ f, text: h.text.trim(), token: h.token, at: h.at,
          ctx: strip(c.src.slice(Math.max(0, h.at - 130), h.at + h.len + 45)) });
      }
    }
  } finally { RV.PROSE_BOUND.pop(); }
  return hits;
}

/** control: 6 แพทเทิร์นเดิมของ PROSE_BOUND ภายใต้การขยับราคาแบบเดียวกัน (ต้องนิ่ง — เป็นเงื่อนไขที่ประกาศไว้ใน
 *  tools/report-values.js บรรทัด "ค่ากลุ่มนี้ (fv · mos20/30 · analystTgt) ไม่ขยับตามราคา") */
function control(pxMul) {
  const hits = [];
  for (const f of FILES) {
    const c = ctxOf(f);
    if (!c) continue;
    const rd = JSON.parse(JSON.stringify(c.rd));
    if (pxMul !== 1) rd.values.px = Math.round(rd.values.px * pxMul * 100) / 100;
    let d;
    try { RV.validateValues(rd, c.sm); d = RV.derive(rd, c.sm); } catch { continue; }
    for (const h of RV.proseBoundHits(c.src, d)) hits.push({ f, at: h.at, label: h.label });
  }
  return hits;
}

// ปริยายเขียนลง tmp ไม่ใช่ในรีโป (probe เป็นเครื่องมือสำรวจ ไม่ใช่ของที่ build/gate อ่าน)
const outDir = process.argv[2] || path.join(require('os').tmpdir(), 'probe-peryear');
fs.mkdirSync(outDir, { recursive: true });
const key = (h) => `${h.f}@${h.at}`;
for (const [name, cand] of Object.entries(CANDIDATES)) {
  const base = run(cand, 1);
  const files = new Set(base.map((h) => h.f));
  console.log(`${name}: ${base.length} จุด / ${files.size} ใบ`);
  fs.writeFileSync(path.join(outDir, `probe-${name}.txt`),
    base.map((h) => `${h.f}\t${h.token}\t"${h.text}"\t${h.ctx}`).join('\n') + '\n');
  // ความกระพริบตามราคา
  const b = new Set(base.map(key));
  for (const mul of [0.98, 1.02, 0.95, 1.05]) {
    const alt = run(cand, mul), a = new Set(alt.map(key));
    const gone = [...b].filter((k) => !a.has(k)).length, born = [...a].filter((k) => !b.has(k)).length;
    console.log(`   px×${mul}: ${alt.length} จุด (หายไป ${gone} · เกิดใหม่ ${born})`);
  }
}
// control — 6 แพทเทิร์นเดิมภายใต้การขยับราคาเดียวกัน
const c0 = control(1), s0 = new Set(c0.map(key));
console.log(`\ncontrol (6 แพทเทิร์นเดิม): ${c0.length} จุด`);
for (const mul of [0.98, 1.02, 0.95, 1.05]) {
  const ci = control(mul), si = new Set(ci.map(key));
  console.log(`   px×${mul}: ${ci.length} จุด (หายไป ${[...s0].filter((k) => !si.has(k)).length} · เกิดใหม่ ${[...si].filter((k) => !s0.has(k)).length})`);
}
console.log(`\nไฟล์รายจุด → ${outDir}/probe-V{0,1,2}.txt · คลัง ${FILES.length} ใบ`);
