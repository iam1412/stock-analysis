#!/usr/bin/env node
'use strict';
/**
 * migrate-v2.js — แปลงรายงาน content-only (v1: ตัวเลขสำเนาใน HTML) → v2 (สำเนาเดียวใน report-data.values · build render)
 * ระยะ 2 ส่วน C/E · spec A(ข) · manifest ระยะ 1 = สเปกของตัวนี้ (COPY_FIELDS)
 *
 * ต่อไฟล์: gate ต้องผ่านก่อน → สกัด values จาก extractor เจ้าของเดิม → แทนทุกจุดสำเนาด้วย {{rd:…}} → เขียน JSON v2
 *   → round-trip 2 ชั้น: (1) manifest บน expand(v1) เทียบ expand(v2) ทุกช่องใน COPY_FIELDS ตาม TOLERANCE — ชั้นนี้คุม "ค่า"
 *                         (2) ข้อความที่มองเห็น mask "ทุกหลักตัวเลข" แล้วต้องเท่ากันเป๊ะ — คุมแค่ "รูปคำ/โครงสร้าง" เท่านั้น
 *                             ★ mask ทุกหลัก ⇒ แยกรูปกับค่าไม่ได้ด้วยตัวเอง (ไม่ใช่ "ต่างได้เฉพาะรูปตัวเลข" อย่างที่เคยเขียน) —
 *                             ค่าเป็นหน้าที่ของชั้น 1 ข้างบน (TOLERANCE ต่อ COPY_FIELDS) + สำมะโน (--census) ที่เปิดเผยผลต่างเล็กน้อย
 *                             ที่ยอมรับแล้วแต่ชั้น 1/2 มองไม่เห็น เช่น %/ปี ของหมวด 6 (ดู maskText/stripVolatile/scnPyDiffs ด้านล่าง)
 *   → gate บน expand(v2) error 0 → footer/stock-meta ไม่เปลี่ยน
 *   → (`--cron-diff` · ระยะ 2 ส่วน E Task 14a) patch v1 กับ v2 ด้วย cron ตัวจริงบน grid ราคา 61 จุดในหน่วยความจำ แล้วผลต้องเท่ากัน
 *     ภายใต้ "รูป" (stock-meta · ตัวเลขที่มองเห็น · error/warning ของ gate) — ต่าง = residue `cron-diff <ชนิด>` → จึงเขียน
 * ตัดสินไม่ได้ (ฐานการ์ดหลายตัว/หมวด 6 อ่านไม่ชัด) = การ์ดนั้นคง literal (สถานะเดิม) · ช่องบังคับหาย/ไม่ตรง = ไม่ย้ายทั้งใบ (residue)
 *
 *   node tools/migrate-v2.js AAPL BBL            # dry-run รายตัว
 *   node tools/migrate-v2.js --batch 0 --size 100 --write --cron-diff --census docs/superpowers/audit/2026-09-11-stock-analyzer/
 *   ★ exit 0 แม้มี residue (1 = ข้อผิดพลาดไม่คาดคิดเท่านั้น · `--strict` = residue ⇒ 1 แบบเดิม)
 * ★ หลัง --write: npm run build → node tools/preserve-dates.js → npm run build → npm run verify → commit (1 commit = 1 แบตช์)
 *
 * ★ ทุก regex ใหม่ของงานนี้อยู่ในไฟล์นี้ไฟล์เดียว (test/parser-lint.js) — ของที่มีเจ้าของแล้ว
 *   (stock-meta/report-data/.px/#mCur/verdict/52wk) เรียกจาก tools/report-meta.js เสมอ
 */
const fs = require('fs');
const path = require('path');
const RM = require('./report-meta.js');
const DV = require('./derived-values.js');
const PD = require('./price-date.js');
const RV = require('./report-values.js');
const { footerDate } = require('./queue/footer-date.js');
const { expandReport, THEME_DEFAULTS } = require('../build.js');
const { checkHtml, visible } = require('../test/check-reports.js');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const CUR = '(?:C\\$|[฿$])';       // คำศัพท์เดียวกับ RM.CUR_SRC (ไฟล์นี้เขียนเองเพราะเป็น regex ของ site อื่น ไม่ใช่ .px)

// ── ช่องที่ต้อง "เท่าเดิม" หลังย้าย (ผูกราคา/FV ล้วน) — f33 (การ์ด EPS) ไม่อยู่ในนี้: worker พิมพ์เอง ไม่ derive จากราคา
const COPY_FIELDS = ['f01', 'f02', 'f09', 'f10', 'f11', 'f12', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f26', 'f28', 'f29', 'f30', 'f31',
  'f34', 'f35', 'f36', 'f38', 'f43', 'f44', 'f45', 'f46', 'f47', 'f48', 'f49', 'f50', 'f51', 'f52', 'f53', 'f54'];
// f38 (จำนวนช่อง ret ที่มีคลาส pos/neg) เพิ่มจาก review รอบ 1: ช่อง .ret ถูก strip ในชั้น 2 ⇒ ต้องมีช่องในชั้น 1
// คุมว่า "คลาสไม่หาย/ไม่งอก" · การ **สลับ** pos↔neg ไม่เปลี่ยนจำนวน ⇒ จับด้วย note `ret class flip` แทน (เปิดเผยในสำมะโน)
const REQUIRED_SITES = ['px', 'chg', 'priceDate', 'pxIn', 'big', 'summary', 'verdict', 'fvBox', 'legend', 'mFair', 'mCur', 'mos20card', 'mos30card', 'vcellFv'];
// ★ f45/f46 (gauge.fair · chart.fairLine) **ถูกลบโดยตั้งใจ** ใน v2 — ยุบเข้า `fv` สำเนาเดียว
//   ⇒ เทียบค่าเดิมกับ fv ของ v2 แทนการเทียบช่องที่ไม่มีแล้ว (ไม่งั้นทุกใบตกชั้น 1 โดยไม่มีความหมาย)
const DROPPED_TO_FV = new Set(['f45', 'f46']);
// ช่องที่ "หายได้/เป็น null ได้" ตามนิยามของ TOLERANCE เอง ⇒ ส่งค่า null เข้าไปให้ฟังก์ชันตัดสิน (ไม่ short-circuit)
const NULL_AWARE = new Set(['f11', 'f12', 'f21', 'f30']);

// ★ ช่องสรุป "ส่วนต่างจากราคา" (f17/f18) เป็น **ของ cron** ตั้งแต่ระยะ 1 ข้อ D: cron เขียนทั้งช่องเป็นคลังคำคงที่
//   `MOS ~ ±X%` ที่ตรงกับ `.big` เสมอ (CLAUDE.md §9 · healer #11 · W06 คือตัวฟ้องเมื่อไม่ตรง)
//   ⇒ หลังย้าย ช่องนี้ต้อง "ตรงกับ .big ของใบเดียวกัน" ไม่ใช่ "ตรงกับสำเนาเดิมที่อาจค้าง"
//   (fixture BBL ค้างจริง: ช่องสรุป +2.1% ขณะ .big +0.8% — open-items #13) · ชั้น 2 จึงตัดช่องนี้ทิ้งเหมือน .chg/.ret
const CRON_CANON = new Set(['f17', 'f18']);
const numOf = (t) => { if (t == null) return null; const m = String(t).replace(/−/g, '-').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const decOf = (v) => { const m = String(v).match(/\.(\d+)/); return m ? m[1].length : 0; };
// ★ "ต่างกันเพราะความละเอียดที่พิมพ์ไว้เดิมเท่านั้น" — v1 พิมพ์ ฿137 ส่วน v2 render ฿136.50 (fv×0.7)
//   schema v2 ไม่มีที่ให้เก็บ "ทศนิยมที่อยากโชว์" (money() = 2 ตำแหน่งเสมอ) ⇒ ใบที่ปัดเลขเก็บรูปเดิมไว้ไม่ได้
//   ยอมได้เฉพาะเมื่อค่าเดิม = ค่าใหม่ที่ปัดตามความละเอียดของตัวมันเอง (กติกาเดียวกับ MCAP_ULP/denomOff ทั้งรีโป)
//   — เกณฑ์ของ gate เองที่ดูช่องพวกนี้ (E18/E26) กว้างกว่ามาก (2.5%)
const roundsTo = (a, b) => Math.abs(a - b) <= 0.5 * Math.pow(10, -decOf(a)) + 1e-9;
const arrRounds = (a, b) => (a == null && b == null)
  || (Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((x, i) => (x == null && b[i] == null) || (x != null && b[i] != null && (Math.abs(x - b[i]) <= 0.006 || roundsTo(x, b[i])))));
// ★ F7 (review รอบ 1): เดิมใช้ 2.5% ตามที่ E18/E26 ยอม — แต่ 2.5% คือเกณฑ์ที่ยอมให้ "ผู้เขียน" เขียนคลาด
//   ไม่ใช่ใบอนุญาตให้ migrator ขยับราคาที่ผู้อ่านใช้ตัดสินใจ · instrument ทั้งคลัง: 45 instance ตกมาถึงชั้นนี้
//   ช่องว่างจริงที่มากสุดคือ 0.99% (CHAYO 1.99→2.00 · ANI 2.56→2.55) ⇒ ตั้ง 1.2% = ค่ากลม ๆ ที่เล็กที่สุดที่ยังรับข้อมูลจริงได้
const GAP_REL = 0.012;
const arrNearGap = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
  && a.every((x, i) => x != null && b[i] != null && Math.abs(x - b[i]) <= Math.max(GAP_REL * Math.abs(b[i]), 0.01));
// เกณฑ์ "ค่าเท่ากัน" ต่อช่อง (a = v1, b = v2 หลัง render) — ค่าตั้งต้น: สัมพัทธ์ 0.5% หรือครึ่งหน่วยของทศนิยมที่หยาบกว่า
const near = (a, b, rel, abs) => Math.abs(a - b) <= Math.max(rel * Math.abs(a), abs);
const arrNear = (a, b, abs) => (a == null && b == null)
  || (Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((x, i) => (x == null && b[i] == null) || (x != null && b[i] != null && Math.abs(x - b[i]) <= abs)));
const TOLERANCE = {
  default: (a, b) => near(a, b, 0.005, 0.005),
  f09: (a, b) => a === b || near(numOf(a), numOf(b), 0, 0.15),          // ป้าย .chg: ข้อความ (ทิศ+suffix เท่ากัน) ตัวเลขต่างได้ 0.1 (คิดใหม่จาก chart.data)
  f10: (a, b) => a === b,
  // f11 หายได้ (v2 ไม่ทวนวงเล็บ) แต่ **ห้ามเปลี่ยนเป็นวันอื่น** — เดิมเป็น `() => true` ซึ่งตกไม่ได้เลย (review รอบ 1 F6)
  // การ "หาย" ถูกล้อมด้วยเงื่อนไขเชิงโครงสร้างที่ tokenise: ลบวงเล็บได้เฉพาะเมื่อข้างในมีแต่วันที่
  f11: (a, b) => (a == null ? b == null : (b == null || a === b)),
  f12: (a, b) => a == null || b == null || a.slice(0, 7) === b.slice(0, 7),   // f12 ระดับเดือน → ระดับวัน
  f15: (a, b) => near(a, b, 0, 0.55), f17: (a, b) => near(a, b, 0, 0.55),  // MOS โชว์ 0/1 ตำแหน่ง
  f16: (a, b) => JSON.stringify(a) === JSON.stringify(b), f18: (a, b) => a === b, f19: (a, b) => a === b,
  f20: (a, b) => near(a, b, 0.01, 0.06), f21: (a, b) => a == null ? b == null : near(a, b, 0.01, 0.06),
  f22: (a, b) => near(a, b, 0, 0.55), f26: (a, b) => near(a, b, 0.03, 0), f28: (a, b) => near(a, b, 0.03, 0.06),
  f29: (a, b) => near(a, b, 0, 0.06), f30: (a, b) => a == null ? b == null : near(a, b, 0, 0.06), f31: (a, b) => near(a, b, 0.01, 0.006),
  f34: (a, b) => arrNear(a, b, 1.0), f35: (a, b) => arrNear(a, b, 1.0), f36: (a, b) => near(a, b, 0.005, 0.005),
  // f51 (ป้าย scale) / f52 (การ์ดจุดซื้อ MOS20/30) = FV×0.8/0.7 ที่ v1 พิมพ์ปัดเลขเองได้ (74.59 vs 74.585 · 741.37 vs 741.30)
  // ⇒ ยอมได้ในช่วงเดียวกับ **gate เจ้าของช่องนี้เอง** (E18/E26 = 2.5%) — v2 ทำให้ค่าตรงสูตรเป๊ะ (ดู roundsTo/หมายเหตุ census)
  f51: (a, b) => arrNear(a, b, 0.006) || arrRounds(a, b) || arrNearGap(a, b), f52: (a, b) => arrNear(a, b, 0.006) || arrRounds(a, b) || arrNearGap(a, b),
  f54: (a, b) => arrNear(a, b, 0.006),
};

// ── F3 (review รอบ 1): token เงินต้องไม่ "ปัดเลขที่คนเห็น" เงียบ ๆ ────────────────
// `money()` ของ v2 ตรึงไว้ 2 ตำแหน่งเสมอ ⇒ ค่าที่พิมพ์ละเอียดกว่านั้นจะถูกปัดทิ้ง
//   วัดจริง 13 ก.ย. 69: DOHOME ปันผลฉาก ฿0.013 → ฿0.01 (−23%) · SONIC/QH ฿0.167 → ฿0.17 · CKP ฿0.264 → ฿0.26
//   ชั้น 1 ไม่จับ (f39/f40 ไม่อยู่ใน COPY_FIELDS) · ชั้น 2 ไม่จับ (mask() เปลี่ยนทุกเลขเป็น '#')
// ⇒ ก่อนแทน token เงิน **ทุกจุดที่เคยข้าม** ต้องเทียบ "รูปที่จะ render" กับ "รูปที่ไฟล์โชว์อยู่" ก่อน
// ★ ข้อยกเว้นเดียว (ALLOW_ZERO_PAD): ต่างกันแค่เติมศูนย์ท้าย/คอมมาหลักพัน โดย **ค่าเท่ากันเป๊ะ** ("฿27" → "฿27.00")
//   = การ normalize เดียวกับที่ token เงินตัวอื่นทั้งใบทำอยู่แล้ว (.px/fv/mos20/scn tgt) และเป็นรูปของ skeleton v2 เอง
//   ปิดข้อยกเว้นนี้ = เข้มสุด (รูปต้องเท่าเป๊ะ) แต่จะคง literal เพิ่มอีก 1,384 แถวปันผล + 78 EPS ฐาน (วัดทั้งคลัง)
const ALLOW_ZERO_PAD = true;
const sameSpace = (a, b) => String(a).replace(/\s+/g, ' ').trim() === String(b).replace(/\s+/g, ' ').trim();
const bare = (s) => String(s).replace(/[,\s]/g, '');
/** shown = ข้อความเงินที่ไฟล์โชว์ (รวมสัญลักษณ์สกุล) · want = ข้อความที่ token จะ render */
function sameMoney(shown, want) {
  if (sameSpace(shown, want)) return true;
  if (!ALLOW_ZERO_PAD) return false;
  const a = bare(shown), b = bare(want);
  const na = parseFloat(a.replace(/[^0-9.\-]/g, '')), nb = parseFloat(b.replace(/[^0-9.\-]/g, ''));
  // ค่าต้องเท่ากัน **เป๊ะ** และสัญลักษณ์สกุลเงินต้องตัวเดียวกัน — ต่างได้แค่ศูนย์ท้าย/คอมมา
  return Number.isFinite(na) && na === nb && a.replace(/[0-9.]/g, '') === b.replace(/[0-9.]/g, '');
}

// ── helper การแทนที่ ────────────────────────────────────────────────────────────
/** ใส่ flag g ให้ regex เดิมโดยไม่แตะของเจ้าของ */
const glob = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
/** splice หลายจุดด้วย index — ★ ทำจากท้ายไฟล์ไปหัวไฟล์เสมอ ไม่งั้น index ของตัวซ้ายเลื่อนตามความยาวที่เปลี่ยนของตัวขวา */
function applyEdits(s, edits) {
  const es = edits.slice().sort((a, b) => b.start - a.start);
  for (let i = 1; i < es.length; i++) if (es[i].end > es[i - 1].start) throw new Error(`index edit ซ้อนกัน: ${es[i].what} ↔ ${es[i - 1].what}`);
  let out = s;
  for (const e of es) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** สถานะการแทน token ของไฟล์หนึ่ง — คุมกติกา "ทุก site ต้อง match ครั้งเดียว" ไว้ที่เดียว */
class Tok {
  constructor(html, sites, notes) { this.html = html; this.sites = sites; this.notes = notes; this.err = null; }
  /** @param {{required?:boolean}} [opt] required = ต้องเจอ 1 ครั้งพอดี · ไม่งั้น 0 = ข้าม (คง literal) · ≥2 = กำกวม = ไม่ย้าย */
  sub(site, re, repl, opt) {
    if (this.err) return false;
    const o = opt || {};
    const hits = [...this.html.matchAll(glob(re))];
    if (hits.length !== 1) {
      if (hits.length > 1 || o.required) { this.err = `site ${site} match ≠ 1 (${hits.length})`; return false; }
      this.literal(site, 'ไม่พบ');
      return false;
    }
    const m = hits[0];
    this.html = this.html.slice(0, m.index) + repl(m) + this.html.slice(m.index + m[0].length);
    this.sites.tokenised.push(site);
    return true;
  }
  literal(site, why) { this.sites.literal.push(site); if (why) this.notes.push(`literal ${site}: ${why}`); }
}

// ── regex ของ site (ใหม่ทั้งหมด อยู่ในไฟล์นี้เท่านั้น) ──────────────────────────
const CHG_RE = /<div class="chg"[^>]*>[\s\S]*?<\/div>/i;
const PXIN_RE = /(id="pxIn"[^>]*\bvalue=")[^"]*(")/;
const FVBOX_R_RE = new RegExp(`(class="fv-box"[\\s\\S]*?<div class="r">)\\s*${CUR}?\\s*[\\d.,]+\\s*(<\\/div>)`);
const FVBOX_RANGE_RE = new RegExp(`(class="fv-box"[\\s\\S]*?กรอบ\\s*)${CUR}?\\s*[\\d.,]+(\\s*(?:–|-|&ndash;)\\s*)${CUR}?\\s*[\\d.,]+`);
// ★ รูป "เข้ม" = ต้องมีสัญลักษณ์สกุลเงิน **ครบทั้งสองตัว** เพราะ token render สกุลเงินเสมอ (money())
//   ใบที่เขียน "(฿123–456)" (สกุลเงินตัวเดียว) ถ้าแทนทั้งคู่ ข้อความที่คนเห็นจะงอก "฿" ตัวที่สอง — ชั้น 2 จับได้จริง 4 ใบ
const FVBOX_RANGE_STRICT_RE = new RegExp(`(class="fv-box"[\\s\\S]*?กรอบ\\s*)${CUR}\\s*[\\d.,]+(\\s*(?:–|-|&ndash;)\\s*)${CUR}\\s*[\\d.,]+`);
// ★ ระยะ 3 Task 2 — "site legend match ≠ 1 (0)" 3 ใบ (FANG "มูลค่าเหมาะสม mid-cycle $172" · MPC "(normalized)" ·
//   MU "(mid-cycle)"): ผู้เขียนเติม **คำขยายฐานมูลค่า** คั่นระหว่างคำว่า "มูลค่าเหมาะสม" กับตัวเลข ⇒ รูปเดิมที่รับได้
//   แต่ `\s*` จึงไม่ match เลย · คำขยายเป็นถ้อยคำของผู้เขียน (ไม่ใช่ค่า) ต้องอยู่ใน **กลุ่ม 1** เพื่อคงไว้ทั้งก้อน
//   ⇒ ยอมให้มีข้อความคั่น ≤24 ตัวอักษร ที่ไม่ข้ามขอบแท็ก (`[^<]`) แบบ lazy
//   ★ ปลอดภัยเพราะมี **สมอสองข้าง**: `${CUR}?\s*[\d.,]+` ต้องจบพอดีที่ `</span>` ⇒ lazy ที่หยุดเร็วเกินไป
//     (เช่นไปคว้า "15" ใน "(P/E 15x) $172") backtrack ต่อเองจนถึงเลขตัวจริง · และสัญลักษณ์สกุลเงินตกเป็นของ
//     `${CUR}?` เสมอ ไม่ถูกกลืนเข้ากลุ่ม 1 (ไม่งั้น token จะ render เป็น "$ $172") — เทสตรึงทั้งสองเคสไว้
//   ★ วัดคลัง 908 ใบ (15 ก.ย. 69): เปลี่ยนผลเฉพาะ 3 ใบนี้ (0→1) · ไม่มีใบไหน 1→0
const LEGEND_RE = new RegExp(`(<div class="legend">[\\s\\S]*?มูลค่าเหมาะสม[^<]{0,24}?)${CUR}?\\s*[\\d.,]+(\\s*<\\/span>)`);
// ★ ระยะ 3 Task 2 (ผลลูกโซ่) — คลาสเดียวกับ legend เป๊ะ: MPC เขียนป้าย gauge ว่า `เหมาะสม (norm.) $193`
//   ⇒ พอแก้ legend ให้ผ่าน ใบนี้ไปตกที่ `site mFair match ≠ 1 (0)` แทน · ผ่อนรูปแบบเดียวกัน
//   ★★ ต่างจาก legend ตรงที่รูปเดิม **ไม่มีสมอขวา** ⇒ ผ่อนเฉย ๆ ไม่ได้: lazy จะไปหยุดที่จุด `.` ใน "(norm.)"
//      แล้วคว้า "." เป็น "ตัวเลข" (ทั้ง `.` และ `,` อยู่ใน `[\d.,]+`) · จึงเติม lookahead `(?=\s*</div>)` คู่กันเสมอ
//      — เป็นการ **รัดให้แคบลง** ไม่ใช่กว้างขึ้น และไม่เพิ่มกลุ่มจับ (ตัวแทนใช้ `m[1]` ตัวเดียว)
//   ★ FANG ไม่ได้แก้ด้วยข้อนี้: ป้ายของมันคือ `mid-cycle FV $172` — **ไม่มีคำว่า "เหมาะสม" เลย** = ผู้เขียนเปลี่ยน
//     ถ้อยคำของป้าย ไม่ใช่เติมคำขยาย ⇒ จะจับได้ต้องเลิกใช้คำในป้ายเป็นยาม เหลือแต่ `id="mFair"` ซึ่งเป็นการ
//     เปลี่ยนความหมายของ site (ยอมแทนตัวเลขในป้ายที่อ่านไม่ออกว่าเป็นค่าอะไร) — นอกขอบเขต Task 2 ⇒ คง residue
//   ★ วัดคลัง 908 ใบ (15 ก.ย. 69): เปลี่ยนผลเฉพาะ MPC (0→1) · ไม่มีใบไหน 1→0
const MFAIR_RE = new RegExp(`(id="mFair"><div class="lab"[^>]*>เหมาะสม[^<]{0,24}?)${CUR}?\\s*[\\d.,]+(?=\\s*<\\/div>)`);
const SCALE_SEG_RE = /<div class="scale">[\s\S]*?<\/div>\s*<\/div>/;
const SCALE_SPAN_RE = new RegExp(`(<span[^>]*>)\\s*${CUR}?\\s*[\\d.,]+(\\s*<br>\\s*<small>([\\s\\S]*?)<\\/small>)`, 'g');
const MOSCARD_RE = (pct) => new RegExp(`(จุดซื้อ MOS ${pct}%<\\/div>\\s*<div class="v[^"]*">)\\s*${CUR}?\\s*[\\d.,]+`);
const ZONE_RE = new RegExp(`(โซนเริ่มทยอยสะสม<\\/div>\\s*<div class="v[^"]*">\\s*(?:&lt;|<)\\s*)${CUR}?\\s*[\\d.,]+`);
// ★ ระยะ 3 Task 2 — vcell ทั้งสองตัวผูก **สมอซ้ายเป็น `<div class="vcell">`** และรับคำขยายหลังหัวข้อ:
//   (ก) "site vcellFv match ≠ 1 (0)" 2 ใบ (AEM `มูลค่าเหมาะสม (ฉาก Base)` · BTG `มูลค่าเหมาะสม (normalized)`) —
//       หัวข้อของ vcell มีคำขยายต่อท้าย ⇒ `<div class="k">มูลค่าเหมาะสม</div>` แบบเป๊ะไม่ match · แก้เป็น `[^<]*`
//       (คำขยายอยู่ในกลุ่ม 1 = คงไว้) · ต้องแก้ **ทั้งรูป range และรูปเดี่ยว** เพราะ `rangeOk()` อ่านรูป range ตัวเดียวกัน
//   (ข) "site vcellTgt match ≠ 1 (2)" 3 ใบ (BABA STX VRT): รูปเดิมไม่ได้ผูกกับ `.vcell` เลย ⇒ ไป match **การ์ด
//       `.metric` หัวข้อเดียวกันในหมวด 1 ด้วย** (ใบที่มีทั้งสองจุดจึงได้ 2 = กำกวม = ไม่ย้ายทั้งใบ) · site นี้ชื่อ
//       `vcellTgt` อยู่แล้ว ⇒ ผูกสมอให้ตรงชื่อ (การ์ด `.metric` เป็นงานของ `tokeniseTgtCard` คนละตัว)
//   ★ `[^<]*` ของหัวข้อไม่ข้ามขอบแท็ก และ `<div class="vcell">` กันไม่ให้หลุดไปจุดอื่นของไฟล์
//   ★ วัดคลัง 908 ใบ (15 ก.ย. 69): vcellFv เปลี่ยน 5 ใบ (AEM BTG MPC MU SHANG 0→1) · vcellTgt เปลี่ยน 8 ใบ
//     (BABA STX VRT + v2 ที่ย้ายไปแล้ว AZN BMO CHE GULF HSY — ทั้งหมด 2→1) · ไม่มีใบไหน 1→0
const VCELL_FV_RANGE_RE = new RegExp(`(<div class="vcell">\\s*<div class="k">มูลค่าเหมาะสม[^<]*<\\/div>\\s*<div class="v"[^>]*>)\\s*${CUR}\\s*[\\d.,]+(\\s*<span[^>]*>\\()${CUR}\\s*[\\d.,]+([–\\-])${CUR}\\s*[\\d.,]+(\\)<\\/span>)`);
const VCELL_FV_RE = new RegExp(`(<div class="vcell">\\s*<div class="k">มูลค่าเหมาะสม[^<]*<\\/div>\\s*<div class="v"[^>]*>)\\s*${CUR}?\\s*[\\d.,]+`);
const VCELL_TGT_RE = new RegExp(`(<div class="vcell">\\s*<div class="k">เป้านักวิเคราะห์[^<]*<\\/div>\\s*<div class="v"[^>]*>\\s*~?)${CUR}?\\s*[\\d.,]+`);
const RESTATE_PRE_RE = /^(?:\s|<[^>]*>)*\(\s*/;                     // วงเล็บทวนวันที่ — คำศัพท์เดียวกับ PD.findRestatedDate
const HINT_PX_RE = new RegExp(`(จากจุดเข้า\\s*)${CUR}?\\s*[\\d.,]+`);
const HINT_EPS_RE = new RegExp(`(EPS ฐาน\\s*)~?\\s*${CUR}?\\s*([\\d.,]+)`);
const HINT_NOTE_RE = / • รวมปันผล/;
// ★ I1 (fix wave Task 14): `{{rd:scnNote}}` render ว่างเมื่อ `scnBasis.divIncluded === false` ⇒ ถ้าแทนแค่ป้าย
//   " • รวมปันผล" ข้อความที่ผู้เขียนต่อท้ายใน clause เดียวกัน ("$2.88/ปี" · "ปกติ" · "(ประมาณ)") จะค้างอยู่โดยไม่มี
//   ที่อ้างอิง — คนอ่านเห็นเลขลอย/คำติดกัน (วัดจริง 7 ใบ: ARE BMY CF CME JBHT KIM NTV)
//   ⇒ กิน clause ทั้งก้อนจนถึงขอบแท็ก `<` หรือ " • " ของ clause ถัดไป (อันไหนมาก่อน) ให้ token เดียวคุมทั้ง clause
//   ★ ใช้ **เฉพาะ divIncluded=false** — ใบที่ divIncluded=true token render ป้ายกลับมาเป๊ะ แต่ข้อความต่อท้ายจะหาย
//     ถ้ากินเข้าไปด้วย (13 ใบมีข้อความต่อท้ายจริง เช่น AMGN " ~$10.08/ปี" · SPI " • กรอบอ้างอิง…") ⇒ ต้องไม่กิน
// ★★ round 2 (review I3): รอบแรกกินแบบ "อะไรก็ได้จนถึง `<` หรือ ` • `" ⇒ **ไม่มีเพดาน** — reviewer พิสูจน์ว่า
//    ประโยคทั้งประโยค (ADV-4) · ข้อความอ้างฐานบัญชี (ADV-7) · หรือแม้แต่ค่าที่ token ของ site อื่นพิมพ์ไว้ (ADV-6)
//    ถูกลบเงียบ ๆ ได้ทั้งหมด โดย checkStripped (นับ "ป้าย" ไม่ได้ดูสิ่งที่ติดมากับป้าย) · ชั้น 2 และ cron differential
//    (ซึ่งตัด clause ทิ้งทั้งคู่) มองไม่เห็นเลย ⇒ เปลี่ยนเป็น **whitelist ของรูปที่พบจริงในคลัง** เท่านั้น
//    รูปอื่น = ไม่กิน → คง site `scnNote` เป็น literal (สถานะเดิม) ตามทางถอยที่ไฟล์นี้ใช้กับ site ไม่บังคับทุกตัว
const NOTE_LABEL = ' • รวมปันผล';
//   (1) เลขเงินท้าย clause (+ suffix /ปี · /yr ได้) — ARE $2.88/ปี · BMY $2.52/yr · CF ~$6 · JBHT $5.40 · KIM ~$1.04/ปี
const NOTE_TAIL_MONEY = ` ?[~≈]?\\s?${CUR}\\s?[\\d][\\d.,]{0,12}(?:\\s?\\/\\s?(?:ปี|yr))?`;
//   (2) คำเดียวติดกันไม่เว้นวรรค (ไม่มีช่องว่างนำหน้าเลย) — CME "ปกติ"
const NOTE_TAIL_GLUED = '[^\\s<(]{1,16}';
//   (3) วงเล็บสั้น — NTV "(ประมาณ)"
const NOTE_TAIL_PAREN = ' ?\\([^()<]{1,30}\\)';
// ★ เพดานความยาวอยู่ในตัว quantifier ทุกรูป (≤ ~20 ตัวอักษรของเนื้อหา) — สั้นกว่าประโยคมาก ตามกติกา round 2
const NOTE_TAIL_SRC = `(?:${NOTE_TAIL_MONEY}|${NOTE_TAIL_GLUED}|${NOTE_TAIL_PAREN})?`;
// clause = ป้าย + ท้ายที่อยู่ใน whitelist (หรือว่าง) แล้วต้องจบพอดีที่ขอบแท็ก `<` / clause ถัดไป " • " / ท้ายสตริง
//   ⇒ ท้ายที่ไม่อยู่ใน whitelist ทำให้ regex นี้ **ไม่ match เลย** (ไม่ใช่ match แบบสั้นลง) — ตั้งใจ: ตัวเทียบจะได้
//     ไม่ตัดอะไรทิ้งแทนที่จะตัดครึ่ง ๆ กลาง ๆ · ฝั่ง v1/v2 เหมือนกันอยู่แล้วเมื่อไม่กิน จึงยังเทียบผ่าน
const HINT_NOTE_TAIL_RE = new RegExp(NOTE_LABEL + NOTE_TAIL_SRC + '(?=<| • |$)');
// รูป global ของ clause เดียวกัน — ใช้ทั้งชั้น 2 (stripVolatile) และมุมมองของ cron differential (cronView)
// ★ ต้องเป็น clause เต็ม ไม่ใช่แค่ป้าย: ใบ divIncluded=false ตัดทั้ง clause จริง ⇒ ตัวเทียบที่ตัดแค่ป้ายจะเห็น
//   ข้อความ/ตัวเลขท้าย clause ของ v1 เหลือค้างฝั่งเดียวแล้วฟ้อง "visible" ทั้งที่เป็นผลของการแก้บั๊กนี้เอง
const HINT_NOTE_TAIL_G = glob(HINT_NOTE_TAIL_RE);
/** ข้อความท้าย clause ที่ (จะ) ถูกกิน — '' = ไม่มี · null = รูปไม่อยู่ใน whitelist (ห้ามกิน) */
function noteTailOf(html) {
  const m = HINT_NOTE_TAIL_RE.exec(String(html));
  return m ? m[0].slice(NOTE_LABEL.length) : null;
}
/**
 * ยามชั้นสอง (round 2 · review I3 "defense in depth") — ช่วงที่จะถูกกินต้องไม่กลืน "ของ site อื่น" ไปด้วย
 *   (ก) **token ของ site อื่นอยู่ในช่วง** — เคส ADV-6 ตัวจริง: hint ที่เขียน `EPS ฐาน ~$19.16` ไว้ **หลัง** ป้าย
 *       ⇒ `{{rd:baseEps}}` ถูกลบทั้ง token ค่าที่คนเห็นหายทั้งจุด (ยามนี้แม่นเพราะดู "ตำแหน่ง" ไม่ใช่เดาจากตัวเลข)
 *   (ข) **ตัวเลขในช่วงตรงกับค่าที่ token ของ site อื่น render** — กันกรณีที่ whitelist ดันเข้ารูปเงินพอดี
 *       ★ ชุดที่เทียบ = ค่าที่ token **พิมพ์ออกมาจริง** เท่านั้น · ไม่ใช่ตัวหารของการ์ด (eps/dps/bvps/shares/revenue —
 *         token render เป็น P/E · ปันผล% · P/BV · Market Cap ไม่ใช่ตัวเลขพวกนั้น) ไม่งั้นจะฟ้องปลอมทันที เพราะ
 *         `values.dps` **คือ** เลขปันผลตัวเดียวกับที่ hint เขียน (ARE 2.88 · BMY 2.52 · JBHT 5.40 · KIM 1.04)
 *       ★ ไม่รวม `sc{k}div` ด้วยเหตุผลเดียวกัน: ปันผลของฉากกับปันผลใน hint เป็น **ปริมาณเดียวกันโดยการสร้าง**
 *         (CF: hint "~$6" = ปันผลรวม 3 ปี = `scenarios[k].div` 6) ⇒ เท่ากันคือเรื่องปกติ ไม่ใช่การชน
 * @returns {string|null} เหตุผลที่ต้องปฏิเสธ หรือ null = ผ่าน
 */
function tailHitsOtherSite(tail, values) {
  const t = String(tail);
  if (/\{\{rd:/.test(t)) return `token ของ site อื่นอยู่ในช่วงที่จะกิน (${(t.match(/\{\{rd:[a-zA-Z0-9]+\}\}/) || [''])[0]})`;
  const nums = (t.match(/[\d][\d.,]*/g) || [])
    .map((n) => parseFloat(n.replace(/,/g, '').replace(/\.$/, ''))).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const fv = values._fv != null ? values._fv : values.fv;
  const others = [values.px, fv, values.fvLow, values.fvHigh, values.analystTgt, values.baseEps];
  for (const s of values.scenarios || []) others.push(s.tgt);
  if (fv > 0) { others.push(Math.round(fv * 0.8 * 100) / 100); others.push(Math.round(fv * 0.7 * 100) / 100); }
  for (const n of nums) for (const o of others) if (o != null && Math.abs(n - o) < 1e-9) return `ตัวเลข ${n} ตรงกับค่าที่ token ของ site อื่น render`;
  return null;
}
// ── R2 (review I2): สำมะโนต้องบอกว่า "อะไรหายไปจากหน้าจริง" ไม่ใช่แค่ว่าป้ายหาย ────────────────
const CLAUSE_NOTE = 'ตัด clause ';
const clauseNote = (clause) => `${CLAUSE_NOTE}"${clause}" 1 จุด — ตัวเลขฉากของใบนี้ไม่ได้รวมปันผล (scenarioPlan conv=plain)`;
const CLAUSE_NOTE_RE = /^ตัด clause "([\s\S]*)" (\d+) จุด/;
const HINT_DIV_RE = /<div class="hint">[\s\S]*?<\/div>/;
// ── M2 (Part D · fix wave Task 14): token เงิน 2 จุดเขียน "~" นำหน้าเสมอ (hintEps · scn{k}div) ทั้งที่ต้นฉบับ
//   บางใบไม่มี "~" ตรงตำแหน่งนั้น ⇒ ข้อความที่คนเห็น "งอก" เครื่องหมายประมาณค่า · ชั้น 2 มองไม่เห็นเพราะ
//   maskText ตัด [~≈] ทิ้งทั้งสองฝั่ง ⇒ ต้อง **เปิดเผยในสำมะโน** (ไม่เปลี่ยนพฤติกรรม — รูปของ skeleton v2 เป็นแบบนี้)
const TILDE_RE = /[~≈]/;
const TILDE_NOTE = 'เติม ~ หน้า token: ';
const SCN_TGT_RE = new RegExp(`(<div class="tgt">\\s*)${CUR}?\\s*[\\d.,]+`);
const SCN_RET_RE = /<div class="ret[^"]*">[\s\S]*?<\/div>/;
const SCN_DPS_RE = new RegExp(`(ปันผล[^<]*<\\/span>\\s*<span>\\s*)[~≈]?\\s*${CUR}?\\s*[\\d.,]+`);
const HEADER_RE = /<header[\s\S]*?<\/header>/i;
const DISC_RE = /<div class="disc">[\s\S]*?<\/div>/i;
const FOOTER_RE = /<footer[\s\S]*<\/footer>/;

// ── การเปิดเผย %/ปี ของหมวด 6 (review รอบ final F2) — ตัวหาข้อความ "%/ปี" ในช่อง .ret เพื่อสำมะโนเท่านั้น
//   ไม่ใช่ตัวตัดสินย้าย/ไม่ย้าย (นั้นเป็นหน้าที่ TOLERANCE.f34/f35 อยู่แล้ว) — แค่ให้คนอ่านเห็นว่าใบไหนตัวเลขที่คนเห็นขยับ
const SCN_RET_TEXT_RE = /<div class="ret[^"]*">([\s\S]*?)<\/div>/g;
// ★ fix wave Task 14 (Part A) — ตัวเดิมพลาด 2 ทาง:
//   (1) บังคับต้องมีเครื่องหมายนำหน้า `[+\-−]` ⇒ ช่องที่เขียน "~11.0%/ปี" / "≈ 4%/ปี" (ไม่มีเครื่องหมาย) อ่านไม่ออกเลย
//       → census พิมพ์ before = null 44 คอลัมน์ 18 ใบ แล้วตกเป็น "value" โดยไม่เคยเทียบอะไรจริง
//   (2) นับทศนิยมจาก **ตัวเลขที่ parse แล้ว** (`decOf(numOf(a))`) ไม่ใช่รูปที่โชว์ — "+2.0" → 2 → 0 ตำแหน่ง
//       ⇒ 1.9 → 2.0 ถูกตัดสินว่า "form" ทั้งที่ตัวเลขที่คนเห็นขยับจริง (FER FICO OR PNW PR9)
//   ⇒ เครื่องหมายเป็นทางเลือก · `~`/`≈` อยู่นอกกลุ่มตัวเลข (ไม่ให้ parse พัง) · ยอมช่องว่างรอบ "/" เหมือน PY_UNIT_RE
//   ★ `~`/`≈` ถูก **ตัดทิ้งก่อน parse** (ไม่อยู่ในรูปที่ match เลย) — ไม่งั้น "≈ +8.9%/ปี" กับ "+8.9%/ปี" จะนับเป็น
//     "ข้อความเปลี่ยน" ทั้งที่ตัวเลขเท่าเดิม (การหาย/งอกของ ~ เป็นคนละเรื่อง — อยู่ใน maskText/หัวข้อ "~" ของสำมะโน)
const PY_CELL_RE = /([+\-−]?\s*\d[\d.,]*)\s*%\s*\/\s*ปี/;
/**
 * อ่านตัวเลข "%/ปี" ตัวแรกของข้อความช่อง .ret — คืนทั้ง **รูปที่โชว์** (dec) และค่าที่ parse ได้
 * @returns {{text:string, num:number, dec:number}|null} null = ไม่มี %/ปี ในช่องนั้นจริง ๆ (ไม่ใช่ "อ่านไม่ออก")
 */
function pyCell(text) {
  const m = PY_CELL_RE.exec(String(text == null ? '' : text));
  if (!m) return null;
  const shown = m[1].replace(/\s+/g, '').replace(/−/g, '-').replace(/,/g, '');   // "+0.8" · "-2.2" · "11.0"
  const num = parseFloat(shown);
  if (!Number.isFinite(num)) return null;
  return { text: m[0].trim(), num, dec: (shown.split('.')[1] || '').length };
}
/**
 * เทียบข้อความ "%/ปี" ต่อคอลัมน์ (bear/base/bull) ระหว่างหน้า expand v1 (exp0) กับ v2 (exp1)
 * @returns {{col:string, before:string, after:string, kind:'form'|'value'}[]} เฉพาะคอลัมน์ที่ข้อความเปลี่ยนจริง
 *   kind='form' เมื่อค่าก่อนย้ายปัดตามความละเอียดที่ v2 โชว์แล้วเท่ากับค่าหลังย้ายเป๊ะ (ต่างแค่ทศนิยมที่พิมพ์)
 *   kind='value' เมื่อปัดแล้วยังไม่เท่ากัน (ค่าที่คนเห็นขยับจริง — ที่ยอมรับได้ตาม TOLERANCE.f34/f35 แต่ต้องเปิดเผย)
 */
function scnPyDiffs(exp0, exp1) {
  const before = [...exp0.matchAll(SCN_RET_TEXT_RE)].map((m) => m[1]);
  const after = [...exp1.matchAll(SCN_RET_TEXT_RE)].map((m) => m[1]);
  if (before.length !== 3 || after.length !== 3) return [];      // รูปไม่ครบ 3 คอลัมน์ = ไม่ใช่ของที่ฟังก์ชันนี้ตัดสิน (ปล่อยให้ชั้นอื่นจับ)
  const labels = ['bear', 'base', 'bull'];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const B = pyCell(before[i]), A = pyCell(after[i]);
    const b = B ? B.text : null, a = A ? A.text : null;
    if (b === a) continue;                                       // ทั้งคู่ null (ไม่มี %/ปี) หรือข้อความเท่ากันเป๊ะ = ไม่เปลี่ยน
    // ★ ปัดค่าเดิมตาม **ทศนิยมที่ฝั่งใหม่โชว์จริง** (A.dec) — เท่ากัน = ต่างแค่รูป · ไม่เท่า = ค่าที่คนเห็นขยับ
    const kind = B && A && parseFloat(B.num.toFixed(A.dec)) === A.num ? 'form' : 'value';
    out.push({ col: labels[i], before: b, after: a, kind });
  }
  return out;
}

// ── ยามโครงสร้าง %/ปี ของหมวด 6 (review final wave 2 — จุดบอดที่การขุด item 2 เจอ) ─────────
// ★ นับ "หน่วย" %/ปี เท่านั้น (ไม่ใช่รูปเลขมีเครื่องหมายแบบ PY_CELL_RE ข้างบน) — สโคปเฉพาะหมวด 6 (DV.scenarioBlock.sec)
//   เพราะ "%/ปี" โผล่ในบล็อกนี้ได้หลายที่ที่ไม่ใช่ .ret (เช่น "EPS +10%/ปี" ในสมมติฐานต่อคอลัมน์ · "~-2.2%/ปี" มี "~"
//   นำหน้าไม่ใช่เครื่องหมาย +/-) — เดิม (item 2) ใช้ PY_CELL_RE ซึ่งพลาดรูปพวกนี้ไปเงียบ ๆ (พิสูจน์: AMATA "~-2.2%/ปี")
//   ⇒ ถ้านับด้วยรูปเลขมีเครื่องหมาย จะไม่เห็นว่า 5 ใบ "งอก/หาย" ตัวเลขทั้งจุด (JMT 4→7 · RS 0→3 ฯลฯ) เพราะ noise เท่ากับ signal
const PY_UNIT_RE = /%\s*\/\s*ปี/g;
/**
 * เทียบ "จำนวน" หน่วย %/ปี ในหมวด 6 ระหว่าง expand(v1) กับ expand(v2) — เป็นยามปฏิเสธ ไม่ใช่ tolerance ของค่า
 * @returns {string|null} เหตุผลปฏิเสธ (เมื่อจำนวนต่างกัน) หรือ null (เท่ากัน/อ่านหมวด 6 ไม่ได้ฝั่งใดฝั่งหนึ่ง — ไม่ตัดสิน)
 */
function scnPyCountGuard(exp0, exp1) {
  const b0 = DV.scenarioBlock(exp0), b1 = DV.scenarioBlock(exp1);
  if (!b0 || !b1) return null;                    // อ่านไม่ได้ = ไม่ประดิษฐ์การเทียบ ปล่อยพฤติกรรมเดิม (ให้ชั้นอื่นตัดสิน)
  const c0 = (b0.sec.match(PY_UNIT_RE) || []).length;
  const c1 = (b1.sec.match(PY_UNIT_RE) || []).length;
  return c0 === c1 ? null : `จำนวนช่อง %/ปี ไม่เท่าเดิม (v1 ${c0} → v2 ${c1})`;
}

// ── ชั้น 1: สกัดค่า ────────────────────────────────────────────────────────────
/**
 * @returns {{values, fv, info}|{reason:string}} — ใช้ extractor **เจ้าของเดิม** ทุกตัว (ไม่ parse ซ้ำ)
 * ★ `dateEra` มาจากศักราชของหัวรายงานไฟล์นั้น **ห้าม hard-code 'BE'** (คลัง 12 ก.ย. 69: BE 737 / CE 171)
 *   — hard-code = เขียนวันที่ที่คนเห็นใหม่ 171 ใบ โดย masked diff จับไม่ได้ (ตัวเลขถูก mask)
 */
function extractValues(src, ctx, notes, noScn) {
  const rdS = RM.readReportData(src);
  if (!rdS.present || !rdS.ok) return { reason: 'report-data อ่านไม่ได้' };
  const rd = rdS.data;
  const sm = RM.readStockMeta(src);
  if (!sm) return { reason: 'ไม่มี stock-meta / JSON เสีย' };
  if (!RV.CUR_SYMBOL[sm.currency]) return { reason: `stock-meta.currency = ${JSON.stringify(sm.currency)} (v2 render ต้องเป็น USD/THB)` };
  const px = ctx.px;
  if (!(px > 0)) return { reason: 'อ่านราคา header ไม่ได้' };
  if (!(Math.abs(px - sm.price) <= 0.02)) return { reason: `ราคา header ≠ stock-meta (${px} vs ${sm.price})` };
  const gcur = rd.gauge ? rd.gauge.cur : null;
  // gauge.cur ถูกลบใน v2 (engine ใช้ values.px) ⇒ ถ้าเดิมไม่เท่าราคา header เข็มจะขยับจริง — เกณฑ์เดียวกับ E19
  if (!(gcur > 0) || Math.abs(gcur - px) > Math.max(0.02 * px, 0.02)) return { reason: `gauge.cur (${gcur}) ≠ ราคา header (${px})` };
  if (Math.abs(gcur - px) > Math.max(0.005 * px, 0.005)) notes.push(`gauge.cur ${gcur} → px ${px} (เข็มขยับ ≤2%)`);

  const fv = rd.fv;
  if (!(fv > 0)) return { reason: 'report-data.fv ใช้ไม่ได้' };
  const fvPeers = [['fv-box', ctx.fvBox], ['stock-meta.fairValue', sm.fairValue], ['gauge.fair', rd.gauge ? rd.gauge.fair : null], ['chart.fairLine', rd.chart ? rd.chart.fairLine : null]];
  for (const [what, v] of fvPeers) if (!(v > 0) || !near(fv, v, 0.01, 0.005)) return { reason: `FV ไม่ตรงกันเอง: ${what} = ${v} แต่ report-data.fv = ${fv}` };
  // ★ site บังคับที่ "โชว์ FV" ต้องเท่ากับ fv ในเกณฑ์เดียวกับชั้น 1 (0.5%) — ไม่งั้นแทน token แล้วตัวเลขที่คนเห็น
  //   เปลี่ยนจริง (วัด 12 ก.ย. 69: DTM legend ฿120.65 ขณะ fv 97.11 = ต่าง 24% · W22 ฟ้องอยู่แล้ว) ⇒ ให้คนแก้ก่อน
  const fvSite = (shown) => shown != null && near(shown, fv, 0.005, 0.005);
  for (const [what, re] of [['legend', LEGEND_RE], ['mFair', MFAIR_RE], ['vcellFv', VCELL_FV_RE]]) {
    const m = src.match(re);
    if (!m) continue;                                   // ไม่มี site = ไปตกที่ "site บังคับ … ไม่ได้แทน" ทีหลัง
    const shown = numOf(m[0].slice(m[1].length));
    if (!fvSite(shown)) return { reason: `${what} แสดง ${shown} แต่ FV = ${fv} (ต่างเกิน 0.5%)` };
  }

  const header = (src.match(HEADER_RE) || [''])[0];
  const hit = PD.findPriceDate(header);
  if (!hit) return { reason: 'อ่านวันที่ราคาในหัวรายงานไม่ได้' };
  if (!hit.hasDay) return { reason: 'วันที่ราคาระดับเดือน' };
  const iso = PD.dateIso(hit);
  if (!iso || !RV.parseIso(iso.iso)) return { reason: 'วันที่ราคาแปลงเป็น ISO ไม่ได้' };

  const values = {
    px,
    priceDate: iso.iso,
    dateEra: hit.isBE ? 'BE' : 'CE',       // ★ ศักราชเดิมของไฟล์ ไม่ใช่ค่าคงที่ของระบบ
    chgSuffix: /IPO/.test(ctx.chg || '') ? 'ตั้งแต่ IPO' : 'รอบปี',
  };
  const info = { rd, sm, header, hit, px, fv, cur: RV.CUR_SYMBOL[sm.currency] };

  // ── กรอบ FV (fvLow/fvHigh): f54 (vcell) กับกรอบใน fv-box ต้องตรงกัน ──
  const f54 = ctx.mf && ctx.mf.values ? ctx.mf.values.f54 : null;
  const bm = src.match(FVBOX_RANGE_RE);
  const bx = bm ? [numOf(bm[0].slice(bm[1].length)), numOf(bm[0].slice(bm[0].lastIndexOf(bm[2]) + bm[2].length))] : null;
  const range = Array.isArray(f54) && f54.every((v) => v > 0) ? f54 : (bx && bx.every((v) => v > 0) ? bx : null);
  if (range) {
    if (Array.isArray(f54) && bx && !(near(f54[0], bx[0], 0.006, 0) && near(f54[1], bx[1], 0.006, 0)))
      return { reason: `กรอบ FV สองที่ไม่ตรงกัน (vcell ${f54} vs fv-box ${bx})` };
    if (!(range[0] > 0 && range[1] > 0 && range[0] <= range[1])) return { reason: `กรอบ FV ผิดรูป (${range})` };
    values.fvLow = range[0]; values.fvHigh = range[1];
  }

  // ── เป้านักวิเคราะห์ ──
  const tcs = DV.targetCells(src);
  if (tcs.length === 1 && tcs[0].target > 0) {
    const tgt = tcs[0].target;
    values.analystTgt = tgt;
    info.tgtLabel = tcs[0].label;
  } else if (tcs.length > 1) {
    notes.push(`การ์ดเป้านักวิเคราะห์ ${tcs.length} ใบ — คง literal`);
  }

  // ── ตัวหารของการ์ดที่ derive จากราคา (เจ้าของเดิมตัดสินให้แล้ว: ตัดสินไม่ได้ = ไม่มีในลิสต์ = คง literal) ──
  const pes = DV.peCards(src);
  const peCard = pes.find((c) => /P\/E \(TTM\)/i.test(c.label)) || pes[0] || null;
  if (peCard && peCard.eps.length === 1 && peCard.eps[0] > 0 && DV.nearPE(peCard.shown, px / peCard.eps[0])) {
    values.eps = peCard.eps[0]; info.peLabel = peCard.label;
  } else if (peCard) notes.push('การ์ด P/E ตัดสินฐานไม่ได้ — คง literal');

  const mcaps = DV.mcapCards(src, px);
  if (mcaps.length === 1) { values.shares = mcaps[0].shares; info.mcapLabel = mcaps[0].label; }
  else if (mcaps.length) notes.push(`การ์ด Market Cap ${mcaps.length} ใบ — คง literal`);

  const pss = DV.psCards(src);
  if (pss.length === 1 && values.shares != null) { values.revenue = pss[0].revenue; info.psLabel = pss[0].label; }
  else if (pss.length) notes.push(`การ์ด P/S ${pss.length} ใบ / ไม่มีจำนวนหุ้น — คง literal`);

  const yc = DV.yieldPlan(src, px).cards;
  if (yc.length === 1) { values.dps = yc[0].base; info.yieldLabel = yc[0].label; }
  else if (yc.length) notes.push(`การ์ดปันผล ${yc.length} ใบ — คง literal`);

  const pb = DV.pbvPlan(src, px);
  if (pb.length === 1 && pb[0].items.length === 1) { values.bvps = pb[0].items[0].base; info.pbvLabel = pb[0].label; }
  else if (pb.length) notes.push(`การ์ด P/BV ${pb.length} ใบ — คง literal`);

  // ── หมวด 6 (ผลตอบแทนฉาก) — plan ตัดสินไม่ได้ = คง literal ทั้งหมวด ──
  const why = [];
  const plan = noScn ? null : DV.scenarioPlan(src, px, why);
  if (noScn) notes.push('หมวด 6: ปิดการย้ายในรอบนี้');
  else if (plan) {
    const cols = plan.block.cols;
    // ★ v2 render ช่อง ret จากสูตรเดียวทั้งใบ: "total%" + " (X%/ปี)" เมื่อมี perYear ⇒ ใบที่สามคอลัมน์รูปไม่เหมือนกัน
    //   (บางช่องโชว์เฉพาะ %/ปี · บางช่องมี total เปล่า) ถ้าย้ายจะ "งอก/หาย" ตัวเลขที่คนเห็น — ชั้น 2 มองไม่เห็นเพราะ
    //   ช่อง ret ถูกตัดทิ้ง แต่ชั้น 1 (f34/f35) จับได้ ⇒ คง literal ทั้งหมวด (สถานะเดิม ไม่มีอะไรแย่ลง)
    const shapeOk = plan.items.every((it) => it.total) && (plan.items.every((it) => it.py) || plan.items.every((it) => !it.py));
    if (!shapeOk) notes.push('หมวด 6: สามคอลัมน์รูปผลตอบแทนไม่เหมือนกัน (total/%ต่อปี ไม่ครบ) — คง literal');
    const divIncluded = plan.conv === 'div';
    const scenarios = cols.map((c) => ({ tgt: c.tgt, div: c.dps == null ? null : c.dps }));
    if (divIncluded && scenarios.some((s) => s.div == null)) {
      notes.push('หมวด 6: conv=div แต่ปันผลไม่ครบ — คง literal');
    } else if (shapeOk) {
      info.plan = plan;
      values.scenarios = scenarios;
      values.scnBasis = { years: plan.years, divIncluded, perYear: perYearOf(plan) };
    }
  } else notes.push('หมวด 6: ' + (why[0] || 'อ่านไม่ได้') + ' — คง literal');

  // ── EPS ฐาน (hint หมวด 6) — ต้องตรงกับที่ gate อ่าน (ctx.baseEPS) และไม่มีคอมมา (ตัวอ่านของ gate ไม่รับคอมมา) ──
  const hm = src.match(HINT_EPS_RE);
  if (hm && ctx.baseEPS != null && !hm[2].includes(',') && Math.abs(parseFloat(hm[2]) - ctx.baseEPS) < 1e-9) {
    values.baseEps = ctx.baseEPS;
  } else if (hm) notes.push('EPS ฐาน อ่านไม่ตรงกับ gate — คง literal');

  return { values, fv, info };
}

/** สูตร %/ปี ของใบนั้น (cagr/linear/null) — ถอดกลับจากค่าที่ scenarioPlan คำนวณไว้ (pyConv ไม่ได้ถูก export) */
function perYearOf(plan) {
  const vote = { cagr: 0, linear: 0 };
  for (const it of plan.items) {
    if (!it.py || !it.total) continue;
    const dec = (String(it.total.token.num).split('.')[1] || '').length;
    const base3 = parseFloat(it.total.want.toFixed(dec));
    const c = (Math.pow(1 + base3 / 100, 1 / plan.years) - 1) * 100, l = base3 / plan.years;
    const dc = Math.abs(c - it.py.want), dl = Math.abs(l - it.py.want);
    if (dc < 1e-9 && dl >= 1e-9) vote.cagr++;
    else if (dl < 1e-9 && dc >= 1e-9) vote.linear++;
  }
  if (!vote.cagr && !vote.linear) return plan.items.some((it) => it.py) ? 'cagr' : null;   // ทุกช่องเสมอกัน (ผลตอบแทน 0) → prior ของคลัง
  return vote.linear > vote.cagr ? 'linear' : 'cagr';
}

// ── ชั้น 2: แทน token ──────────────────────────────────────────────────────────
/** @returns {{out:string}|{reason:string}} */
function tokenise(src, values, info, sites, notes) {
  // ── (1) จุดที่อ้างด้วย index — ทำก่อน และไล่จากท้ายไปหัว ──
  const edits = [];
  const headerStart = src.indexOf(info.header);
  const hit = info.hit;
  edits.push({ what: 'priceDate', start: headerStart + hit.index, end: headerStart + hit.index + hit.length, text: '{{rd:priceDate}}' });
  sites.tokenised.push('priceDate');

  // วงเล็บทวนวันที่ (คนละศักราช) — v2 มีสำเนาเดียว ⇒ ลบวงเล็บทิ้ง (f11 หายได้ ตาม TOLERANCE)
  const restate = PD.findRestatedDate(info.header, hit);
  if (restate) {
    const after = info.header.slice(hit.index + hit.length);
    const pre = RESTATE_PRE_RE.exec(after);
    const open = pre ? hit.index + hit.length + pre[0].lastIndexOf('(') : -1;
    const close = info.header.indexOf(')', restate.index + restate.length);
    if (open < 0 || close < 0) return { reason: 'วงเล็บทวนวันที่: หาขอบเขตไม่ได้' };
    // ★ F6 (review รอบ 1): ชั้น 2 blank ข้อความช่วง "ราคา ณ…" ทั้งก้อน และ TOLERANCE.f11 ยอมให้ช่องนี้หายได้
    //   ⇒ ถ้าลบทั้งวงเล็บโดยไม่ดูข้างใน คำขยายจะหายไปเงียบ ๆ (DPZ "(11 ก.ย. 2569 ตลาดปิด)" · HIG "… เวลาไทย")
    //   ลบได้เฉพาะเมื่อข้างในวงเล็บ **มีแต่วันที่** (= สำเนาซ้ำล้วน ๆ) ไม่งั้นคงทั้งวงเล็บไว้เป็น literal
    const inner = info.header.slice(open + 1, close);
    if (inner.trim() !== restate.text.trim()) {
      notes.push(`literal restate: ในวงเล็บมีคำขยาย ("${inner.trim().slice(0, 40)}")`);
      sites.literal.push('restate');
    } else {
      let s = headerStart + open;
      if (src[s - 1] === ' ') s--;                     // กินช่องว่างหน้าวงเล็บด้วย ไม่งั้นเหลือเว้นวรรคลอย
      edits.push({ what: 'restate', start: s, end: headerStart + close + 1, text: '' });
      sites.tokenised.push('restate');
    }
  }

  // disclaimer "ราคา ณ <วันที่>" — ตัวหาเดียวกับที่ cron ใช้เขียน (PD.allDiscDates)
  const discM = src.match(DISC_RE);
  if (discM) {
    const hits = PD.allDiscDates(discM[0]);
    let n = 0;
    for (const d of hits) {
      // วันที่ระดับเดือนใน .disc: token render มี "วัน" เสมอ ⇒ แทนแล้วข้อความที่คนเห็นเปลี่ยน — คง literal ไว้
      if (!d.hasDay) { notes.push('disc: วันที่ระดับเดือน — คง literal'); continue; }
      if (d.isBE !== hit.isBE) notes.push(`dateEra normalize (disc ${d.isBE ? 'BE' : 'CE'} → header ${hit.isBE ? 'BE' : 'CE'})`);
      edits.push({ what: 'disc', start: discM.index + d.index, end: discM.index + d.index + d.length, text: '{{rd:priceDate}}' });
      n++;
    }
    if (n) sites.tokenised.push('disc'); else if (hits.length) sites.literal.push('disc');
  }

  // หมวด 6 — แก้ทั้งก้อนใน section เดียว (index ของ scenarioBlock อ้างอิง src ตรง ๆ)
  if (info.plan) {
    const b = info.plan.block;
    const r = tokeniseScn(src.slice(b.a, b.z), values, info, sites, notes);
    if (r.reason) return r;
    edits.push({ what: 'scn', start: b.a, end: b.z, text: r.out });
  } else {
    // ★ Task 8 review (แก้ใน Task 9): หมวด 6 ทั้งหมวดถูกปล่อย literal ที่นี่ (ตัดสินไม่ได้/ปิดรอบด้วย noScn)
    //   แต่เดิมไม่มีการบันทึกลง sites.literal (มีแต่ต่อคอลัมน์ scn{k}div) ⇒ สำมะโน Part E นับ site literal
    //   ต่ำกว่าจริง — บันทึกเป็น bookkeeping เท่านั้น ไม่เปลี่ยนว่าไฟล์ไหนย้ายได้/ไม่ได้ (ไม่มีใน REQUIRED_SITES)
    sites.literal.push('scn');
    if (values.baseEps != null) {
      notes.push('หมวด 6 literal — ไม่แตะ EPS ฐาน/จุดเข้า');
      delete values.baseEps;
    }
  }

  let html;
  try { html = applyEdits(src, edits); } catch (e) { return { reason: e.message }; }

  // ── (2) จุดที่อ้างด้วย regex ──
  const t = new Tok(html, sites, notes);
  t.sub('px', RM.PX_PARTS_RE, () => '<div class="px">{{rd:px}}', { required: true });
  t.sub('chg', CHG_RE, () => '<div class="chg">{{rd:chg}}</div>', { required: true });
  t.sub('mCur', RM.MCUR_LABEL_PARTS_RE, (m) => m[1].replace(new RegExp(`\\s*${CUR}?\\s*$`), ' ') + '{{rd:px}}', { required: true });
  t.sub('big', DV.MOS_BIG_RE, () => '<div class="big">{{rd:mos}}</div>', { required: true });
  t.sub('verdict', RM.VERDICT_CLASS_RE, () => 'class="mos-verdict {{rd:mosClass}}"', { required: true });
  t.sub('pxIn', PXIN_RE, (m) => m[1] + '{{rd:pxNum}}' + m[2], { required: true });
  t.sub('summary', DV.SUMMARY_RE, (m) => m[1] + 'MOS ~ {{rd:mos}}' + m[3], { required: true });
  t.sub('fvBox', FVBOX_R_RE, (m) => m[1] + '{{rd:fv}}' + m[2], { required: true });
  t.sub('legend', LEGEND_RE, (m) => m[1] + '{{rd:fv}}' + m[2], { required: true });
  t.sub('mFair', MFAIR_RE, (m) => m[1] + '{{rd:fv}}', { required: true });
  t.sub('mos20card', MOSCARD_RE(20), (m) => m[1] + '{{rd:mos20}}', { required: true });
  t.sub('mos30card', MOSCARD_RE(30), (m) => m[1] + '{{rd:mos30}}', { required: true });
  // ★ ทุก site ที่ "โชว์ตัวเลข" ต้องเช็คก่อนว่าค่าเดิม = ค่าที่ token จะ render — ไม่งั้นแทนแล้วคนเห็นเลขใหม่
  //   (เกณฑ์ 0.5% เท่าชั้น 1) · ไม่ตรง = คง literal (site ไม่บังคับ) ไม่ใช่ residue
  const shownAfter = (re, groups) => { const m = t.html.match(re); return m ? numOf(m[0].slice(m.slice(1, groups + 1).join('').length)) : null; };
  const rangeOk = (re) => { const m = t.html.match(re); if (!m) return false; const ns = m[0].match(/[\d][\d.,]*/g) || []; const lo = numOf(ns[ns.length - 2]), hi = numOf(ns[ns.length - 1]); return lo != null && hi != null && near(lo, values.fvLow, 0.006, 0.005) && near(hi, values.fvHigh, 0.006, 0.005); };
  if (values.fvLow != null && rangeOk(FVBOX_RANGE_STRICT_RE)) t.sub('fvBoxRange', FVBOX_RANGE_STRICT_RE, (m) => m[1] + '{{rd:fvLow}}' + m[2] + '{{rd:fvHigh}}');
  else if (values.fvLow != null) t.literal('fvBoxRange', 'กรอบใน fv-box ไม่ตรง values/ไม่มีสัญลักษณ์สกุลเงินครบ');
  const zoneShown = shownAfter(ZONE_RE, 1);
  // การ์ด "โซนเริ่มทยอยสะสม" ไม่จำเป็นต้อง = FV (manifest คู่ f48 ตรวจแค่ "ต่ำกว่า FV") — วัด 12 ก.ย. 69: 77 ใบตั้งราคาเอง
  if (zoneShown != null && near(zoneShown, values._fv, 0.005, 0.005)) t.sub('zone', ZONE_RE, (m) => m[1] + '{{rd:fv}}');
  else if (zoneShown != null) t.literal('zone', `ราคาโซนสะสม ${zoneShown} ≠ FV ${values._fv} (ผู้เขียนตั้งเอง)`);
  if (values.fvLow != null && rangeOk(VCELL_FV_RANGE_RE))
    t.sub('vcellFv', VCELL_FV_RANGE_RE, (m) => m[1] + '{{rd:fv}}' + m[2] + '{{rd:fvLow}}' + m[3] + '{{rd:fvHigh}}' + m[4], { required: true });
  else t.sub('vcellFv', VCELL_FV_RE, (m) => m[1] + '{{rd:fv}}', { required: true });
  if (values.analystTgt != null) {
    const tgtShown = shownAfter(VCELL_TGT_RE, 1);
    if (tgtShown != null && near(tgtShown, values.analystTgt, 0.006, 0.005)) t.sub('vcellTgt', VCELL_TGT_RE, (m) => m[1] + '{{rd:analystTgt}}');
    else if (tgtShown != null) t.literal('vcellTgt', `vcell ${tgtShown} ≠ การ์ดเป้า ${values.analystTgt}`);
    tokeniseTgtCard(t, info);
  }
  tokeniseScale(t, values, notes);
  tokeniseCards(t, values, info);
  if (t.err) return { reason: t.err };
  return { out: t.html };
}

/** หมวด 6 ในก้อน section เดียว (sec) — คืน HTML ใหม่ของ section */
function tokeniseScn(sec, values, info, sites, notes) {
  // ★ hint (จุดเข้า/EPS ฐาน/รวมปันผล) ต้องทำ **ในกล่อง .hint เท่านั้น** — คำเดียวกันโผล่ในคอลัมน์ด้วย
  //   ("EPS ฐาน $5.59 (FY25) · P/E ออก…") ⇒ กวาดทั้ง section จะ match 2 ครั้ง (91 ใบ) แล้วตกไปทั้งใบโดยไม่จำเป็น
  const hm = HINT_DIV_RE.exec(sec);
  if (!hm) return { reason: 'หมวด 6: ไม่มีกล่อง .hint' };
  const ht = new Tok(hm[0], sites, notes);
  // ★ F2: ถ้อยคำของ hint เป็นของผู้เขียน ("จากราคาปัจจุบัน" · "EPS ฐาน (normalized)") — ไม่ใช่ site บังคับ
  //   ⇒ ไม่ตรงรูป = คง literal (สถานะเดิม) ไม่ใช่ปัดตกทั้งใบ (เคส AER/MPC/WDAY)
  ht.sub('hint', HINT_PX_RE, (m) => m[1] + '{{rd:px}}');
  if (values.baseEps != null) {
    const em = HINT_EPS_RE.exec(hm[0]);
    const shown = em ? (em[0].match(new RegExp(`${CUR}\\s*[\\d.,]+$`)) || [''])[0] : '';
    const want = info.cur + RV.fmtPrice(values.baseEps);
    if (em && sameMoney(shown, want)) {
      if (!TILDE_RE.test(em[0].slice(em[1].length))) notes.push(TILDE_NOTE + 'hintEps');   // M2 (Part D) — ดู TILDE_NOTE
      ht.sub('hintEps', HINT_EPS_RE, (m) => m[1] + '~{{rd:baseEps}}');
    } else { ht.literal('hintEps', em ? `รูปเงินต่าง ("${shown}" ≠ "${want}")` : 'ไม่พบ'); delete values.baseEps; }
  }
  // I1: divIncluded=false ⇒ token render ว่าง ต้องกิน clause ทั้งก้อน · true ⇒ token render ป้ายเดิมเป๊ะ กินแค่ป้าย
  // ★ round 2 (I3): กินได้เฉพาะท้าย clause ที่อยู่ใน whitelist (NOTE_TAIL_*) และไม่ชนค่าของ site อื่น
  //   รูปอื่น/ชนค่า = ไม่กินเลย → คง literal (สถานะเดิมของใบนั้น) ไม่ใช่เดาขอบเขตแล้วลบข้อความของผู้เขียนทิ้ง
  const divOut = !!(values.scnBasis && values.scnBasis.divIncluded === false);
  if (!divOut || !HINT_NOTE_RE.test(ht.html)) {
    ht.sub('scnNote', HINT_NOTE_RE, () => '{{rd:scnNote}}');       // ไม่มีป้าย = literal "ไม่พบ" ตามเดิม
  } else {
    // ★ ดูบน `ht.html` (หลังแทน hint/hintEps แล้ว) ไม่ใช่ต้นฉบับ — token ของ site อื่นจึงมองเห็นได้ในช่วงที่จะกิน
    const tail = noteTailOf(ht.html);
    const hit = tail == null ? null : tailHitsOtherSite(tail, values);
    if (tail == null) ht.literal('scnNote', 'ท้าย clause ไม่อยู่ในรูปที่รู้จัก — ไม่กิน');
    else if (hit) ht.literal('scnNote', `${hit} — ไม่กิน`);
    else ht.sub('scnNote', HINT_NOTE_TAIL_RE, () => '{{rd:scnNote}}');
  }
  if (ht.err) return { reason: 'หมวด 6: ' + ht.err };
  const t = new Tok(sec.slice(0, hm.index) + ht.html + sec.slice(hm.index + hm[0].length), sites, notes);
  // คอลัมน์: หาแท็กเปิดด้วย regex เจ้าของเดิม แล้วตัดช่วง [เปิดตัวนี้, เปิดตัวถัดไป)
  const opens = [...t.html.matchAll(DV.SCN_COL_OPEN())].map((m) => m.index);
  if (opens.length !== 3) return { reason: `หมวด 6: คอลัมน์ ${opens.length} ≠ 3` };
  const edits = [];
  for (let i = 2; i >= 0; i--) {
    const a = opens[i], z = i === 2 ? t.html.length : opens[i + 1];
    const col = t.html.slice(a, z);
    const k = i + 1;
    const one = (re, repl, what) => {
      const hits = [...col.matchAll(glob(re))];
      if (hits.length !== 1) return `หมวด 6 คอลัมน์ ${k}: ${what} match ≠ 1 (${hits.length})`;
      edits.push({ what: `scn${k}${what}`, start: a + hits[0].index, end: a + hits[0].index + hits[0][0].length, text: repl(hits[0]) });
      return null;
    };
    const e1 = one(SCN_TGT_RE, (m) => m[1] + `{{rd:sc${k}tgt}}`, 'tgt');
    if (e1) return { reason: e1 };
    const e2 = one(SCN_RET_RE, () => `<div class="ret {{rd:sc${k}retClass}}">{{rd:sc${k}ret}}</div>`, 'ret');
    if (e2) return { reason: e2 };
    if (values.scenarios[i].div != null) {
      const hits = [...col.matchAll(glob(SCN_DPS_RE))];
      if (hits.length > 1) return { reason: `หมวด 6 คอลัมน์ ${k}: แถวปันผล match ≠ 1 (${hits.length})` };
      if (!hits.length) notes.push(`หมวด 6 คอลัมน์ ${k}: ไม่มีแถวปันผล`);
      else {
        // ★ F3: ปันผลฉากเป็นตัวเลขที่คนเห็น และไม่มีช่องไหนในชั้น 1 ตรวจ (f39 ไม่อยู่ใน COPY_FIELDS)
        const shown = (hits[0][0].match(new RegExp(`${CUR}\\s*[\\d.,]+$`)) || [''])[0];
        const want = info.cur + RV.fmtPrice(values.scenarios[i].div);
        if (sameMoney(shown, want)) {
          if (!TILDE_RE.test(hits[0][0].slice(hits[0][1].length))) notes.push(TILDE_NOTE + `scn${k}div`);   // M2 (Part D)
          edits.push({ what: `scn${k}div`, start: a + hits[0].index, end: a + hits[0].index + hits[0][0].length, text: hits[0][1] + `~{{rd:sc${k}div}}` });
        }
        else { sites.literal.push(`scn${k}div`); notes.push(`literal scn${k}div: รูปเงินต่าง ("${shown}" ≠ "${want}")`); }
      }
    }
  }
  sites.tokenised.push('scn');
  try { return { out: applyEdits(t.html, edits) }; } catch (e) { return { reason: 'หมวด 6: ' + e.message }; }
}

/** ป้ายบน gauge scale — แทนตามป้ายกำกับ (LABEL) · ป้ายที่ไม่รู้จัก/ค่าไม่ตรง derive = คง literal ทั้ง span */
function tokeniseScale(t, values, notes) {
  if (t.err) return;
  const segs = [...t.html.matchAll(glob(SCALE_SEG_RE))];
  if (segs.length !== 1) { t.literal('scale', `segment ${segs.length} ก้อน`); return; }
  const seg = segs[0][0], at = segs[0].index;
  const want = {
    mos30: [/MOS 30/, Math.round(values._fv * 0.7 * 100) / 100],
    mos20: [/MOS 20/, Math.round(values._fv * 0.8 * 100) / 100],
    fv: [/Fair Value/, values._fv],
    analystTgt: [/เป้า[\s\S]*Analyst/, values.analystTgt],
    fvHigh: [/กรอบบน/, values.fvHigh],
  };
  let n = 0;
  const out = seg.replace(SCALE_SPAN_RE, (m, open, tail, label) => {
    const shown = numOf(m.slice(open.length));
    for (const [key, [re, exp]] of Object.entries(want)) {
      if (!re.test(label)) continue;
      if (exp == null) { notes.push(`scale "${label.trim()}": ไม่มีค่าใน values — คง literal`); return m; }
      // ไม่ตรง = ป้ายนั้นผู้เขียนตั้งเอง/ปัดมาก → คง literal (gate E26 ยอมได้ถึง 2.5% อยู่แล้ว) ไม่ใช่ residue ทั้งใบ
      if (shown == null || !near(shown, exp, 0.006, 0.005)) { notes.push(`scale "${label.trim()}" แสดง ${shown} ≠ derive ${exp} — คง literal`); return m; }
      n++;
      return open + `{{rd:${key}}}` + tail;
    }
    notes.push(`scale ป้าย "${label.trim()}" ไม่รู้จัก — คง literal`);
    return m;
  });
  if (!n) { t.literal('scale', 'ไม่มีป้ายที่แทนได้'); return; }
  t.html = t.html.slice(0, at) + out + t.html.slice(at + seg.length);
  t.sites.tokenised.push('scale');
}

/** การ์ดราคาเป้า — แทน "$เป้า (+X%)" ทั้งคู่ด้วย token (คงข้อความรอบนอก เช่น "n=32") */
function tokeniseTgtCard(t, info) {
  if (t.err || !info.tgtLabel) return;
  let n = 0;
  const out = t.html.replace(DV.cardRe(), (m, k, vOpen, vBody, tail) => {
    if (k.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() !== info.tgtLabel) return m;
    const inner = new RegExp(DV.MONEY_PCT_SRC);
    if (!inner.test(vBody)) return m;
    n++;
    return '<div class="k">' + k + '</div>' + vOpen + vBody.replace(inner, (mm, cur, num, open) => '{{rd:analystTgt}}' + open + '{{rd:analystPct}}') + tail;
  });
  if (n === 1) { t.html = out; t.sites.tokenised.push('tgtCard'); }
  else if (n > 1) t.err = `site tgtCard match ≠ 1 (${n})`;
  else t.literal('tgtCard', 'ไม่พบรูป "เป้า (+%)"');
}

/**
 * การ์ดที่ตัวหารพิมพ์อยู่ในไฟล์ (P/E · Market Cap · P/S · ปันผล · P/BV) — แทน "เฉพาะตัวเลข" ในช่อง .v
 * ★ กฎเพิ่ม (ไม่มีในสเปกเดิม แต่จำเป็น): แทนก็ต่อเมื่อ **ข้อความที่ render ออกมาเท่าของเดิมเป๊ะ**
 *   การ์ดพวกนี้เป็นอัตราส่วนที่ผู้เขียนเลือกความละเอียดเอง ("40x") ส่วน token มีรูปตายตัว (toFixed(1) = "39.5x")
 *   ⇒ แทนแล้วตัวเลขที่คนเห็นเปลี่ยนโดย masked diff จับไม่ได้ (ตัวเลขถูก mask) และชั้น 1 ก็ฟ้อง (f20 40→39.5)
 *   การ์ดเหล่านี้เป็น site **ไม่บังคับ** ⇒ ไม่ตรงรูป = คง literal (สถานะเดิม ไม่มีอะไรแย่ลง) ไม่ใช่ residue
 */
function tokeniseCards(t, values, info) {
  if (t.err) return;
  const px = values.px, cur = info.cur;
  const sameText = (a, b) => String(a).replace(/\s+/g, ' ').trim() === String(b).replace(/\s+/g, ' ').trim();
  const plan = [
    // [site, label, มีค่าไหม, regex ในช่อง .v, ข้อความที่ token จะ render, ตัวประกอบข้อความแทนที่]
    ['peCard', info.peLabel, values.eps > 0, /(-?[0-9]+(?:\.[0-9]+)?)(\s*x)/i,
      () => (px / values.eps).toFixed(1), (m) => '{{rd:pe}}' + m[2], (m) => m[1]],
    ['mcapCard', info.mcapLabel, values.shares != null, new RegExp(`(${CUR})?\\s*([0-9][0-9.,]*)(\\s*(?:[TBMK]\\b|ล้านล้าน|แสนล้าน|หมื่นล้าน|พันล้าน|ล้าน))?`),
      () => RV.fmtBig(px * values.shares, cur), () => '{{rd:mcap}}', (m) => m[0]],
    ['psCard', info.psLabel, values.revenue != null, /([0-9]+(?:\.[0-9]+)?)(\s*x)/i,
      () => (px * values.shares / values.revenue).toFixed(1), (m) => '{{rd:ps}}' + m[2], (m) => m[1]],
    ['yieldCard', info.yieldLabel, values.dps != null, /([0-9]+(?:\.[0-9]+)?)(\s*%)/,
      () => (values.dps / px * 100).toFixed(1) + '%', () => '{{rd:yield}}', (m) => m[0]],
    ['pbvCard', info.pbvLabel, values.bvps != null, /([0-9]+(?:\.[0-9]+)?)(\s*x)/i,
      () => (px / values.bvps).toFixed(2), (m) => '{{rd:pbv}}' + m[2], (m) => m[1]],
  ];
  const clean = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [site, label, hasVal, re, render, repl, shownOf] of plan) {
    if (t.err) break;
    if (label == null || !hasVal) { t.literal(site, label == null ? 'ไม่มีการ์ดที่ตัดสินได้' : 'ไม่มีค่าใน values'); continue; }
    let n = 0, why = 'ตัวเลขในช่อง .v ไม่ชัด';
    const out = t.html.replace(DV.cardRe(), (m, k, vOpen, vBody, tail) => {
      if (clean(k) !== label) return m;
      const hits = [...vBody.matchAll(glob(re))];
      if (hits.length !== 1) return m;
      const want = render();
      if (!sameText(shownOf(hits[0]), want)) { why = `รูปตัวเลขต่าง ("${clean(shownOf(hits[0]))}" ≠ "${want}")`; return m; }
      n++;
      const h = hits[0];
      const body = vBody.slice(0, h.index) + repl(h) + vBody.slice(h.index + h[0].length);
      return '<div class="k">' + k + '</div>' + vOpen + body + tail;
    });
    if (n === 1) { t.html = out; t.sites.tokenised.push(site); }
    else if (n > 1) { t.err = `site ${site} match ≠ 1 (${n})`; }
    else t.literal(site, why);
  }
}

// ── เขียน report-data v2 ───────────────────────────────────────────────────────
const V_ORDER = ['px', 'priceDate', 'dateEra', 'chgSuffix', 'fvLow', 'fvHigh', 'analystTgt', 'eps', 'shares', 'revenue', 'dps', 'bvps', 'baseEps', 'scenarios', 'scnBasis'];
const CHART_KEYS = ['data', 'min', 'max', 'grid', 'currency', 'highlight', 'gridFmt', 'dataFmt'];
const GAUGE_KEYS = ['min', 'max', 'fairLabelTop'];
// ★ ชื่อเดิม writeJson ทำให้อ่านผิดว่ามี I/O — ฟังก์ชันนี้ **ไม่เขียนไฟล์** เป็นแค่ string builder (คืน html ใหม่ใน memory)
//   ผู้เขียนไฟล์จริงมีที่เดียวคือ main()/runFixture() ที่ `fs.writeFileSync` ตรง ๆ (ดู Q1 ของ review: ไฟล์นี้ไม่มี write อื่นแอบซ่อน)
function buildRd(html, rd0, values, fv, notes) {
  const dropped = [];
  const pick = (o, keys, where) => {
    const out = {};
    for (const k of Object.keys(o || {})) { if (keys.includes(k)) out[k] = o[k]; else dropped.push(`${where}.${k}`); }
    return out;
  };
  const vals = {};
  for (const k of V_ORDER) if (values[k] != null) vals[k] = values[k];
  const rd = { v: 2, fv, values: vals, theme: pick(rd0.theme, Object.keys(THEME_DEFAULTS), 'theme'), chart: pick(rd0.chart, CHART_KEYS, 'chart'), gauge: pick(rd0.gauge, GAUGE_KEYS, 'gauge') };
  for (const k of Object.keys(rd0)) if (!['v', 'fv', 'values', 'theme', 'chart', 'gauge'].includes(k)) dropped.push(k);
  if (dropped.length) notes.push('ลบคีย์นอก schema v2: ' + dropped.join(', '));
  return html.replace(RM.REPORT_DATA_PARTS_RE, (m, a, body, z) => a + '\n' + RV.styledRD(rd) + '\n' + z);
}

// ── round-trip 2 ชั้น + gate + invariant ───────────────────────────────────────
const maskText = (h) => visible(h).replace(/[−–]/g, '-').replace(/[0-9][0-9.,]*/g, '#').replace(/[~≈]/g, '').replace(/\s+/g, ' ').trim();
const stripVolatile = (h) => h.replace(/<div class="ret[^"]*">[\s\S]*?<\/div>/g, '<div class="ret"></div>')
  .replace(/<div class="chg"[^>]*>[\s\S]*?<\/div>/i, '<div class="chg"></div>')
  // ช่องสรุป "ส่วนต่างจากราคา" = คลังคำคงที่ของ cron (เหมือน .chg/.ret) — ชั้น 1 ตรวจแทนว่าตรงกับ .big ของ v2
  .replace(glob(DV.SUMMARY_RE), (m, a, body, z) => a + z)
  // ★ I1: ตัด clause "รวมปันผล" **ทั้งก้อน** (ไม่ใช่แค่ป้าย) — ใบ divIncluded=false ตัดทั้ง clause จริงตาม HINT_NOTE_TAIL_RE
  //   ส่วนใบ divIncluded=true ทั้งสองฝั่งมีข้อความเดียวกัน ⇒ ตัดเท่ากันทั้งคู่ = no-op ต่อการเทียบ
  //   ★ round 2 (I3): regex นี้ match **เฉพาะ clause ที่ท้ายอยู่ใน whitelist** ⇒ ใบที่ท้ายเป็นรูปอื่น (ประโยค/ข้อความ
  //     อ้างฐานบัญชี) จะไม่ถูกตัดจากฝั่งไหนเลย ⇒ ถ้ามีทางไหนลบมันทิ้งจริง ชั้น 2 **จะเห็น** (เดิมตาบอดทั้งช่วง)
  //   ยามว่า "หายได้เมื่อไร/หายอะไรไป" อยู่ที่ checkStripped (นับป้าย + ต้อง divIncluded=false + รูปต้องอยู่ใน whitelist)
  .replace(/ราคา ณ[^<]*/g, 'ราคา ณ').replace(HINT_NOTE_TAIL_G, '');

/** สิ่งที่ `stripVolatile` blank ทิ้งในชั้น 2 แต่ไม่มีช่องไหนในชั้น 1 ครอบคลุม — ยืนยันตรงนี้แทน (review รอบ 1 F4/F5) */
function checkStripped(exp0, exp1, values, notes) {
  // (ก) " • รวมปันผล" — หายได้เฉพาะเมื่อ "ตัวเลขของใบนั้นบอกเองว่าไม่รวมปันผล" (scnBasis.divIncluded = false) · ห้ามงอกใหม่เด็ดขาด
  const cnt = (h) => (h.match(/ • รวมปันผล/g) || []).length;
  const c0 = cnt(exp0), c1 = cnt(exp1);
  if (c1 > c0) return 'ข้อความ " • รวมปันผล" งอกขึ้นมาเอง';
  if (c1 < c0) {
    const b = values.scnBasis;
    if (!b || b.divIncluded) return 'ข้อความ " • รวมปันผล" หายไปทั้งที่ผลตอบแทนยังรวมปันผล';
    // ★ round 2 (review I3): ยามเดิมนับได้แค่ "ป้ายหายกี่จุด" ไม่เคยดูว่า **อะไร** หายไปกับมัน ⇒ ประโยคทั้งประโยค
    //   หายได้โดยทุกชั้นเขียว · ตอนนี้บังคับว่า clause ที่หายต้องอยู่ในรูป whitelist (HINT_NOTE_TAIL_RE) ทุกจุด
    //   และ **บันทึกข้อความที่หายจริงลง note** เพื่อให้สำมะโนเปิดเผยได้ (R2) — ไม่ใช่บอกแค่ว่าป้ายหาย
    const gone = exp0.match(HINT_NOTE_TAIL_G) || [];
    if (gone.length !== c0) return `clause "รวมปันผล" ที่หายไปไม่อยู่ในรูปที่อนุญาต (${gone.length}/${c0} จุดเข้ารูป) — ห้ามตัดข้อความที่เดาขอบเขตไม่ได้`;
    for (const g of gone) notes.push(clauseNote(g));
  }
  // (ข) คลาสของช่อง ret (f38 นับจำนวนให้แล้ว) — การ "สลับ" pos↔neg ไม่เปลี่ยนจำนวน จึงเปิดเผยเป็น note
  const cls = (h) => (h.match(/class="ret (?:pos|neg)"/g) || []).join(',');
  if (cls(exp0) !== cls(exp1)) notes.push(`ret class flip: ${cls(exp0) || '-'} → ${cls(exp1) || '-'} (v2 คิดสีจากตัวเลขเดียวกับที่พิมพ์)`);
  return null;
}

function verifyPair(src, out, name, exp0, ctx0, values, notes) {
  let exp1;
  try { exp1 = expandReport(out); } catch (e) { return { reason: 'expand v2 ไม่ได้: ' + e.message }; }
  const gate1 = checkHtml(exp1, name, { source: out });   // ระยะ 2 ส่วน F: E44 อ่าน ctx.source (ต้นฉบับ v2 ที่มี token) ไม่ใช่หน้าที่ render แล้ว
  const c1 = gate1.ctx;
  const v1 = ctx0.mf && ctx0.mf.values ? ctx0.mf.values : {};
  const v2 = c1.mf && c1.mf.values ? c1.mf.values : {};
  const fv2 = v2.f44;
  // f11/f12 (วันที่ทวนในวงเล็บ · วันที่ใน .disc): extractor คืน **object ของ hit** ไม่ใช่สตริง ISO
  // (PD.dateIso/findDiscPriceDate) — TOLERANCE ของสองช่องนี้เทียบระดับเดือนด้วย .slice(0,7) ⇒ ต้องหยิบ .iso ก่อน
  // f34/f35 (ผลตอบแทนฉาก): บนใบ v2 ตัวอ่าน DV.scenarioPlan อาจคืน null — ไม่ใช่เพราะเลขผิด แต่เพราะข้อความที่ render
  //   ปัดเลขตาม fmtMos ("+2.0%" → "+2%") จน plan ถอด "จุดเข้า/สมมติฐานปันผล" กลับไม่ได้ (บน v2 ไม่ต้องถอดแล้ว —
  //   ตัวเลขมาจาก values ตรง ๆ) ⇒ ใช้ค่าที่ **เจ้าของ schema คำนวณเอง** (RV.derive) เป็นฝั่ง v2 แทนเมื่ออ่านไม่ได้
  let dv2 = null;
  try {
    const rd2 = RM.readReportData(out), sm2 = RM.readStockMeta(out);
    if (rd2.ok && RV.isV2(rd2.data) && sm2) dv2 = RV.derive(rd2.data, sm2);
  } catch (e) { dv2 = null; }
  const scnOf = (key) => {
    if (!dv2 || dv2.scenarios.length !== 3) return null;
    const a = dv2.scenarios.map((x) => (x[key] == null ? null : parseFloat(x[key].toFixed(4))));
    return a.every((x) => x == null) ? null : a;      // ไม่มี %/ปี ทั้งใบ = null ก้อนเดียว (เท่ากับที่ f35 ของ v1 คืน)
  };
  const isoOnly = new Set(['f11', 'f12']);
  const norm = (f, v) => (isoOnly.has(f) && v && typeof v === 'object' ? v.iso : v);
  const compare = COPY_FIELDS.map((f) => {
    const a = norm(f, v1[f]), b = norm(f, v2[f]);
    const fn = TOLERANCE[f] || TOLERANCE.default;
    let ok;
    if (DROPPED_TO_FV.has(f)) ok = (a == null && b == null) || (a != null && b == null && fv2 != null && near(a, fv2, 0.01, 0.005));   // ยุบเข้า fv (สำเนาเดียว)
    // ช่องสรุปที่ cron เป็นเจ้าของ: ต้องตรงกับ .big **ของ v2 เอง** (f15) ไม่ใช่ตรงกับสำเนาเดิมที่อาจค้างอยู่
    // ★ review รอบ 1: ช่องสรุปที่ "ค้าง" (v1 ไม่ตรง .big) ไม่ได้ถูกซ่อมเงียบ — ต้องนับไว้ใน census ให้คนเห็น
    else if (f === 'f17' && a != null && b != null && Math.abs(a - b) > 0.55) {
      notes.push(`summary ค้าง: v1 ${a}% ≠ .big ${b}% (cron เขียนช่องนี้เองอยู่แล้ว — ระยะ 1 ข้อ D)`);
      ok = v2.f15 != null && near(b, v2.f15, 0, 0.55);
    } else if (CRON_CANON.has(f)) ok = f === 'f17'
      ? b != null && v2.f15 != null && near(b, v2.f15, 0, 0.55)
      : typeof b === 'string' && DV.SUMMARY_CANON_RE.test(b.replace(/−/g, '-')) && numOf(b) != null && v2.f15 != null && near(numOf(b), v2.f15, 0, 0.55);
    else if ((f === 'f34' || f === 'f35') && b == null && dv2) ok = !!fn(a, scnOf(f === 'f34' ? 'total' : 'perYear'));
    else if (NULL_AWARE.has(f)) ok = !!fn(a == null ? null : a, b == null ? null : b);
    else ok = (a == null && b == null) || (a != null && b != null && (typeof a === 'number' && typeof b === 'number' ? fn(a, b)
      : (Array.isArray(a) || typeof a === 'string' ? fn(a, b) : JSON.stringify(a) === JSON.stringify(b))));
    return { field: f, a, b, ok: !!ok };
  });
  const m0 = maskText(stripVolatile(exp0)), m1 = maskText(stripVolatile(exp1));
  const masked = m0 === m1;
  let maskedDiff = '';
  if (!masked) {
    let i = 0;
    while (i < m0.length && i < m1.length && m0[i] === m1[i]) i++;
    maskedDiff = `ที่ตัวอักษร ${i}: v1 «${m0.slice(Math.max(0, i - 40), i + 40)}» ≠ v2 «${m1.slice(Math.max(0, i - 40), i + 40)}»`;
  }
  const f0 = footerDate(src), f1 = footerDate(out);
  const footerOk = (f0 ? f0.iso : null) === (f1 ? f1.iso : null)
    && (FOOTER_RE.exec(src) || [''])[0] === (FOOTER_RE.exec(out) || [''])[0];
  const smOk = JSON.stringify(RM.readStockMeta(src)) === JSON.stringify(RM.readStockMeta(out));
  const gateOk = gate1.errors.length === 0;
  const strippedBad = checkStripped(exp0, exp1, values, notes);
  const bad = compare.filter((c) => !c.ok);
  // ★ ยามโครงสร้าง (review final wave 2) — "จำนวน" หน่วย %/ปี ในหมวด 6 ต้องเท่าเดิม คนละเรื่องกับ "ค่า" ที่ชั้น 1
  //   ตรวจอยู่แล้ว (COPY_FIELDS/f34/f35) และชั้น 2 มองไม่เห็น (mask เลขทุกตัว + blank .ret) — จุดบอดที่ item 2
  //   เปิดออก: บางใบ v2 "งอก"/"หาย" ตัวเลข %/ปี ทั้งจุด ไม่ใช่แค่ปัดรูป (วัดจริง 5 ใบ: JMT 4→7 · SCGD 3→6 ·
  //   SNNP 3→6 · RS 0→3 · ACN 4→3) — ห้ามย้ายใบพวกนี้ ให้ตกเป็น residue ในสำมะโนแทน
  const pyCountBad = scnPyCountGuard(exp0, exp1);
  // ★ ต้องรู้ว่า "ยามนี้เป็นคนตัดสิน" จริงไหม (ไม่ใช่แค่คำนวณไว้เฉย ๆ) — ใบที่ gate/ค่า/มาสก์ตกอยู่ก่อนแล้ว
  //   ไม่นับว่าถูกยามนี้ปฏิเสธ แม้ pyCountBad จะไม่ null ก็ตาม (เงื่อนไขเดียวกับที่ ternary ข้างล่างจะเลือก pyCountBad)
  const pyCountRefused = gateOk && !bad.length && masked && !!pyCountBad;
  const reason = !gateOk ? 'gate หลัง migrate: ' + gate1.errors.map((e) => e.id + ' ' + e.msg).join(' | ')
    : bad.length ? 'ค่าไม่ตรงชั้น 1: ' + bad.map((c) => `${c.field} ${JSON.stringify(c.a)}→${JSON.stringify(c.b)}`).join(' ; ')
      : !masked ? 'ข้อความที่มองเห็นเปลี่ยน (ชั้น 2): ' + maskedDiff
        : pyCountBad ? pyCountBad
          : !footerOk ? 'footer เปลี่ยน' : !smOk ? 'stock-meta เปลี่ยน' : strippedBad;
  // ★ เปิดเผยผลต่าง %/ปี ที่คนเห็น (review final item 2) — คำนวณเสมอ (ไม่ผูกกับ gateOk/bad/masked) เพราะเป็นการ
  //   "เปิดเผย" ไม่ใช่เกณฑ์ผ่าน/ตก ผู้เรียก (census) เป็นคนเลือกว่าจะรายงานเฉพาะใบที่ ok เท่านั้น
  const pyChanges = scnPyDiffs(exp0, exp1);
  return { compare, masked, maskedDiff, gateOk, footerOk, smOk, reason, exp1, pyChanges, pyCountRefused };
}

// ── API หลัก ──────────────────────────────────────────────────────────────────
/**
 * @param {string} src   HTML ต้นฉบับ (content-only, v1)
 * @param {string} name  ชื่อไฟล์ เช่น "AAPL.html"
 * @param {{today?:string}} [opts]  today = ตรึง "วันนี้" ให้ E27/W09 (เทส/คลังแช่แข็ง)
 * @returns {{ok:boolean, reason?:string, out?:string, values?:object, sites:{tokenised:string[],literal:string[]},
 *            compare:{field:string,a:*,b:*,ok:boolean}[], notes:string[], masked:boolean, maskedDiff:string,
 *            pyChanges:{col:string,before:string,after:string,kind:'form'|'value'}[], pyCountRefused:boolean}}
 *   ★ `masked`/`maskedDiff` เป็นสมาชิกของสัญญา — ชั้น 2 คือคุณสมบัติความปลอดภัยหลักของการย้าย ผู้เรียกต้องเห็นได้
 *   ★ `pyChanges` = การเปิดเผย %/ปี ของหมวด 6 ที่คนเห็นเปลี่ยน (review final item 2) — ไม่ใช่เกณฑ์ผ่าน/ตก แค่ให้ census บันทึก
 *   ★ `pyCountRefused` = true เมื่อ `ok:false` เพราะยามโครงสร้าง %/ปี (review final wave 2) — ไม่ผ่าน retry-คง-literal
 *      ด้านล่าง (ตั้งใจ: ต้องเป็น residue ให้คนตรวจ ไม่ใช่ถูกดูดกลืนไปเงียบ ๆ เหมือนความล้มเหลวอื่นในหมวด 6)
 */
function migrateOne(src, name, opts) {
  const o = opts || {};
  const prevToday = process.env.STALE_TODAY;
  if (o.today) process.env.STALE_TODAY = o.today;
  try {
    const st = { scnTried: false };
    const r = runOnce(src, name, false, st);
    // ★ หมวด 6 เป็นส่วนที่ "ย้ายแล้วอาจไม่ผ่าน" ได้หลายทาง (W17 คิด %/ปี จากค่าที่โชว์ซึ่งปัดแล้ว ส่วน
    //   RV.derive คิดจากค่าดิบ ⇒ ต่างกันเกินเกณฑ์ในบางใบ · E24 EPS ฐาน · f34/f35) — ใบทั้งใบไม่ควรตกเพราะหมวดเดียว
    //   ⇒ ลองใหม่โดยคงหมวด 6 เป็น literal (สถานะเดิมเป๊ะ) แล้วให้ **gate เป็นคนตัดสิน** ว่ารอบสองผ่านไหม
    // ★ F1 (review รอบ 1): เดิมเช็ค `sites.tokenised.includes('scn')` ซึ่ง **ตั้งค่าเมื่อสำเร็จเท่านั้น**
    //   ⇒ ความล้มเหลวที่เกิด **ข้างใน** tokeniseScn (คลาสที่ retry มีไว้เพื่อมันโดยตรง) ไม่เคยยิง retry เลย
    //   วัดจริง: AER/WDAY ถูกนับเป็น residue ทั้งที่ย้ายผ่านเมื่อคงหมวด 6 เป็น literal
    // ★ ยามโครงสร้าง %/ปี (review final wave 2) ต้อง "ปฏิเสธจริง" — ห้ามให้ retry-คง-literal ข้างล่างนี้ดูดกลืนไป
    //   เงียบ ๆ (มันจะรอด retry เสมอ เพราะคงหมวด 6 literal ทั้งสองฝั่ง = จำนวนเท่ากันโดยอัตโนมัติ) ไม่งั้นใบที่ v2
    //   "งอก/หาย" ตัวเลข %/ปี จะไม่โผล่เป็น residue ให้คนตรวจตามที่ตกลงกันไว้ — คนละกรณีกับความล้มเหลวอื่นในหมวด 6
    //   ที่ retry มีไว้เพื่อมันโดยตรง (ตัวเลขปัดเกินเกณฑ์/EPS ฐาน ฯลฯ)
    if (!r.ok && st.scnTried && !r.pyCountRefused) {
      const r2 = runOnce(src, name, true, { scnTried: false });
      if (r2.ok) { r2.notes.push('หมวด 6 คง literal — ลองย้ายแล้วไม่ผ่าน: ' + r.reason); return r2; }
    }
    return r;
  } finally {
    if (o.today) { if (prevToday === undefined) delete process.env.STALE_TODAY; else process.env.STALE_TODAY = prevToday; }
  }
}

const ALREADY_V2 = 'เป็น v2 แล้ว — ข้าม';
function runOnce(src, name, noScn, st) {
  const notes = [];
  const sites = { tokenised: [], literal: [] };
  const fail = (reason) => ({ ok: false, reason, sites, compare: [], notes, masked: false, maskedDiff: '', pyChanges: [], pyCountRefused: false });
  try {
    const rdS = RM.readReportData(src);
    if (rdS.ok && RV.isV2(rdS.data)) return fail(ALREADY_V2);
    let exp0;
    try { exp0 = expandReport(src); } catch (e) { return fail('expand v1 ไม่ได้: ' + e.message); }
    const gate0 = checkHtml(exp0, name, { source: src });
    if (gate0.errors.length) return fail('gate ตกก่อนย้าย: ' + gate0.errors.map((e) => e.id + ' ' + e.msg).join(' | '));
    const ctx0 = gate0.ctx;

    const ex = extractValues(src, ctx0, notes, noScn);
    if (ex.values && ex.values.scenarios && st) st.scnTried = true;   // "พยายามย้ายหมวด 6" — ตั้งก่อน tokenise เสมอ
    if (ex.reason) return fail(ex.reason);
    ex.values._fv = ex.fv;                                    // ให้ tokeniseScale คิด MOS20/30 จาก FV ตัวเดียวกัน
    const tk = tokenise(src, ex.values, ex.info, sites, notes);
    delete ex.values._fv;
    if (tk.reason) return fail(tk.reason);
    for (const s of REQUIRED_SITES) if (!sites.tokenised.includes(s)) return fail(`site บังคับ ${s} ไม่ได้แทน`);

    const out = buildRd(tk.out, ex.info.rd, ex.values, ex.fv, notes);
    const v = verifyPair(src, out, name, exp0, ctx0, ex.values, notes);
    if (v.reason && !v.compare) return { ok: false, reason: v.reason, sites, compare: [], notes, masked: false, maskedDiff: '', pyChanges: [], pyCountRefused: false };
    const res = { ok: !v.reason, reason: v.reason || undefined, out, values: ex.values, sites, compare: v.compare, notes, masked: v.masked, maskedDiff: v.maskedDiff, pyChanges: v.pyChanges, pyCountRefused: !!v.pyCountRefused };
    if (!res.ok) delete res.out;
    return res;
  } catch (e) {
    return fail('migrator ระเบิด: ' + e.message);
  }
}

// ── cron differential v1 ↔ v2 (ระยะ 2 ส่วน E · Task 14a — ruling final review ส่วน D) ──────────────
// ★ ทำไมต้องมี: gate อย่างเดียวไม่พอ — final review ส่วน D เจอ 37 ใบที่ stock-meta.pe กระโดดเงียบ ๆ (gate ผ่านหมด) +
//   12 ใบ W17 ที่พลิกเฉพาะบางราคา (7 ใบรอดชุดจำลอง 4 ตัวคูณ) + วันที่ literal ค้าง — ทุกตัวเห็นได้ก็ต่อเมื่อเอา
//   ผล cron ของ v1 กับ v2 "วางเทียบกัน" ที่ราคาเดียวกัน บน grid ละเอียด ⇒ ใบที่ v2 ให้ผลต่างจาก v1 นอกเหนือ "รูป" = ห้ามเขียน
// ★ ทุกอย่างในหน่วยความจำ — ไม่เขียนไฟล์ ไม่อ่าน price-flags · ต้นแบบ scratchpad/fixD/sim1–sim7
// grid ×0.85 → ×1.15 ทีละ 0.005 (61 จุด) — ปัดตัวคูณเป็น 3 ตำแหน่งก่อน (0.85+i×0.005 สะสม error ทศนิยมลอยตัว)
const CRON_GRID = Array.from({ length: 61 }, (_, i) => Math.round((0.85 + i * 0.005) * 1000) / 1000);
const CRON_META_KEYS = ['price', 'mos', 'upside', 'fairValue', 'pe', 'dividendYield'];
// ปัดแบบสมมาตรรอบศูนย์ + epsilon (3.45 เก็บเป็น 3.4499… ในเลขฐานสอง — ไม่ใส่ epsilon จะปัดลงแบบสุ่มตามค่า)
const roundDec = (x, dec) => { const p = Math.pow(10, dec); return Math.sign(x) * Math.round(Math.abs(x) * p + 1e-7) / p; };
/** ค่า stock-meta เท่ากันภายใต้ "รูป" = ปัดทั้งคู่ตามทศนิยมของตัวที่หยาบกว่าแล้วเท่ากัน หรือห่างไม่เกินครึ่งหน่วยของทศนิยมนั้น
 *  (ขอบครึ่งหน่วยพอดี 3.5 ~ 3 — กติกาเดียวกับตัวเลขที่มองเห็น withinForm) · 75.4 ~ 75 · 1.4 ≠ 1.2 */
function sameMetaForm(a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== 'number' || typeof b !== 'number') return JSON.stringify(a) === JSON.stringify(b);
  const dec = Math.min(decOf(a), decOf(b));
  return a === b || roundDec(a, dec) === roundDec(b, dec) || Math.abs(a - b) <= 0.5 * Math.pow(10, -dec) + 1e-9;
}
/** วันที่ patch ตายตัว = วันที่ 2 ของ "เดือนถัดจาก values.priceDate" — บังคับให้ทุกใบข้ามเดือน (ตัวเขียนวันที่/ป้ายเดือนกราฟ) */
function cronDateParts(priceDateIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(priceDateIso || ''));
  if (!m) return null;
  const y = parseInt(m[1], 10), mon = parseInt(m[2], 10);          // mon 1-based ⇒ monIdx ของเดือนถัดไป (0-based) = mon % 12
  return { day: 2, monIdx: mon % 12, yearCE: mon === 12 ? y + 1 : y };
}
const NUM_RUN_RE = /[0-9][0-9.,]*/g;                                  // หน่วยเดียวกับที่ maskText แทนด้วย '#'
const numText = (h) => visible(h).replace(/[−–]/g, '-');             // ลำดับเดียวกับ maskText (ก่อนตัด ~≈) ⇒ เลขเรียงตรงกับ '#'
const cleanNum = (t) => t.replace(/[.,]+$/, '');                      // "5." ท้ายประโยค / "1,234," ในรายการ ≠ ทศนิยม
// หน่วยใหญ่ของเงินที่ตามหลังตัวเลข — คำศัพท์เดียวกับ RV.BIG_UNITS (fmtBig ของ v2) · ยาวก่อนสั้น ("ล้านล้าน" ก่อน "ล้าน")
const SCALE_UNITS = [['ล้านล้าน', 1e12], ['แสนล้าน', 1e11], ['หมื่นล้าน', 1e10], ['พันล้าน', 1e9], ['ล้าน', 1e6], ['T', 1e12], ['B', 1e9], ['M', 1e6]];
const SCALE_AFTER_NUM_RE = /(\d\s*)(?:ล้านล้าน|แสนล้าน|หมื่นล้าน|พันล้าน|ล้าน|[TBM](?![A-Za-z]))/g;
const SCALE_AT = SCALE_UNITS.map(([w, mult]) => ({ w, mult, re: new RegExp('^\\s*' + w + (w.length === 1 ? '(?![A-Za-z])' : '')) }));
const scaleAt = (t, i) => {
  const rest = t.slice(i, i + 16);
  for (const u of SCALE_AT) if (u.re.test(rest)) return { word: u.w, mult: u.mult };
  return { word: '', mult: 0 };
};
// "ต่างแค่รูป" = ค่าเท่ากันเป๊ะ (ศูนย์ท้าย/คอมมา) หรือห่างไม่เกินครึ่งหน่วยของทศนิยมที่หยาบกว่า (กติกาเดียวกับ roundsTo)
//   ⇒ 3.5 ~ 3 · 69.5 ~ 69 · 283.52 ~ 284 (v2 ปัดจากค่าดิบตัวเดียวกับที่ v1 พิมพ์ 1 ตำแหน่ง) · 1.4 ≠ 1.2
//   ★ ทศนิยมนับจาก "ข้อความ" ไม่ใช่จากตัวเลข (parseFloat("262.00") = 262 จะนับได้ 0 ตำแหน่ง)
const withinForm = (xt, yt, x, y) => { const dec = Math.min(decOf(xt), decOf(yt)); return Math.abs(x - y) <= 0.5 * Math.pow(10, -dec) + 1e-9; };
// ช่อง .ret ของหมวด 6: v2 render รูปคงที่ "±X% (±Y%/ปี)" ส่วน v1 มีคำประกอบของผู้เขียน ("รวม ~ … (≈ …)" · "(3 ปี รวมปันผล)")
//   ชั้น 2 ของ migrator จึง blank ช่องนี้ทิ้ง (stripVolatile) แล้วคุมค่าด้วย f34/f35 + จำนวนหน่วย %/ปี (scnPyCountGuard)
//   ⇒ ที่นี่ก็เทียบ "ตัวเลขที่มีหน่วย %" ในช่อง (ลำดับ + เครื่องหมาย + ค่าภายใต้รูป) แทนถ้อยคำ · คลาส pos/neg ต้องเท่ากัน
const RET_CELL_RE = /<div class="(ret[^"]*)">([\s\S]*?)<\/div>/g;
const RET_PCT_RE = /([+\-−]?)\s*(\d[\d.,]*)\s*%(\s*(?:\/\s*ปี|ต่อปี))?/g;
// ★ เรียงตาม "บทบาท" ไม่ใช่ลำดับในช่อง: v1 บางใบเขียน "−5.1%/ปี (3 ปี รวม −14.6%)" (ต่อปีขึ้นก่อน — PYPL) ส่วน v2 เป็น
//   "−15% (−5%/ปี)" เสมอ ⇒ รวม = ตัวที่ไม่มีหน่วย /ปี · ต่อปี = ตัวที่มี "/ปี"/"ต่อปี" ตามหลัง (คำศัพท์เดียวกับ SCN_PERYEAR_AFTER)
//   บทบาทละไม่เกิน 1 ตัว ⇒ จัดเป็น [รวม, ต่อปี] · มากกว่านั้น (อ่านบทบาทไม่ได้) = คงลำดับเดิม (เทียบเข้มตามตำแหน่ง)
function retCells(h) {
  return [...h.matchAll(RET_CELL_RE)].map((m) => {
    const all = [...m[2].replace(/<[^>]*>/g, ' ').matchAll(RET_PCT_RE)].map((p) => ({
      t: (p[1] === '−' ? '-' : p[1]) + p[2], v: (p[1] === '-' || p[1] === '−' ? -1 : 1) * parseFloat(cleanNum(p[2]).replace(/,/g, '')), py: !!p[3] }));
    const tot = all.filter((x) => !x.py), py = all.filter((x) => x.py);
    return { cls: m[1], pcts: tot.length <= 1 && py.length <= 1 && tot.length === 1 ? tot.concat(py) : all };
  });
}
/** แยกหน้า expand เป็น [ก่อนหมวด 6, หมวด 6, หลังหมวด 6] ด้วยตัวหาบล็อกเจ้าของเดิม (DV.scenarioBlock) — ไม่มีหมวด 6 = ทั้งหน้าก้อนเดียว */
function cronParts(exp) {
  const b = DV.scenarioBlock(exp);
  const i = b ? exp.indexOf(b.sec) : -1;
  if (i < 0) return [{ part: 'page', html: exp }];
  return [{ part: 'page', html: exp.slice(0, i) }, { part: 'sec6', html: b.sec }, { part: 'page', html: exp.slice(i + b.sec.length) }];
}
// %/ปี ของ .ret = ฟังก์ชันของ "ผลตอบแทนรวมที่โชว์" (RV.derive/scenarioPlan คิดจากค่าที่ปัดแล้ว ไม่ใช่ค่าดิบ)
//   ⇒ รวม −25.6% (v1 คงรูป 1 ตำแหน่งของผู้เขียน) → −9.4%/ปี · รวม −26% (v2 fmtMos) → −10%/ปี — ต่างกัน 0.6 จุดทั้งที่
//   ค่าดิบตัวเดียวกัน · ตัดสินว่า "รูป" ได้ก็ต่อเมื่อ **ทั้งสองฝั่ง** %/ปี = f(รวมที่ตัวเองโชว์) ภายใต้ครึ่งหน่วยของ %/ปี
//   + ช่วงที่ f กวาดได้ภายในครึ่งหน่วยของ "รวม" (ครอบกรณีคิดจากค่าดิบ) · สูตร = scnBasis.perYear (null = ยอม cagr หรือ linear)
const PY_FNS = { cagr: (t, n) => (Math.pow(1 + t / 100, 1 / n) - 1) * 100, linear: (t, n) => t / n };
const halfUnit = (t) => 0.5 * Math.pow(10, -decOf(t));
function pyExplained(T1, P1, T2, P2, basis) {
  if (!basis || !Number.isInteger(basis.years)) return false;
  const fns = basis.perYear ? [PY_FNS[basis.perYear]].filter(Boolean) : [PY_FNS.cagr, PY_FNS.linear];
  const self = (f, T, P) => { const hT = halfUnit(T.t), n = basis.years;
    if (1 + (T.v - hT) / 100 <= 0) return false;
    return Math.abs(P.v - f(T.v, n)) <= halfUnit(P.t) + Math.abs(f(T.v + hT, n) - f(T.v - hT, n)) / 2 + 1e-9; };
  return fns.some((f) => self(f, T1, P1) && self(f, T2, P2));
}

/** วงเล็บทวนวันที่ล้วนที่ติดท้ายวันที่ราคาในหัวรายงาน → { drop() } คืน html ที่ตัดวงเล็บนั้นออก · ไม่มี/ไม่ล้วน/คนละวัน = null */
function pureRestate(exp) {
  const hm = HEADER_RE.exec(exp);
  if (!hm) return null;
  const hit = PD.findPriceDate(hm[0]);
  const r = hit && PD.findRestatedDate(hm[0], hit);
  if (!r) return null;
  const from = hit.index + hit.length, afterDate = r.index + r.text.length;
  const close = /^\s*\)/.exec(hm[0].slice(afterDate));
  if (!close || !RESTATE_PRE_RE.test(hm[0].slice(from, r.index))) return null;
  const at = hm.index;
  return { drop: () => exp.slice(0, at + from) + exp.slice(at + afterDate + close[0].length) };
}

// กฎศักราช (fix1 R3): ยอม 2569 ↔ 2026 เฉพาะใน "บริบทวันที่" = ชื่อเดือนไทยเต็ม/ย่อ (คำศัพท์เดียวกับ PD.MONTH_ALT) ติดหน้าเลขปี
//   ("2 ต.ค. 2569" · "ต.ค. 2569") ทั้งสองฝั่ง — "กำไร 2569 ล้าน" vs "2026 ล้าน" = ค่าต่าง ไม่ใช่ศักราช
const ERA_CTX_RE = new RegExp('(?:' + PD.MONTH_ALT + ')\\s*$');
const eraCtx = (t, idx) => ERA_CTX_RE.test(t.slice(Math.max(0, idx - 20), idx));
const DIV_TEXT_RE = HINT_NOTE_TAIL_G;    // clause เต็ม (ไม่ใช่แค่ป้าย) — ดูหมายเหตุที่ HINT_NOTE_TAIL_G
/** มุมมองที่ใช้เทียบของหน้า expand หนึ่งฝั่ง: ตัดวงเล็บทวน (ถ้าตัดสินให้ตัด) → (collect: stripVolatile) → ตัด clause "รวมปันผล" → แยกส่วน */
function cronView(exp, drop, collect) {
  let h = exp;
  if (drop) { const q = pureRestate(h); if (q) h = q.drop(); }
  if (collect) h = stripVolatile(h);
  return cronParts(h.replace(DIV_TEXT_RE, ''));
}
/** ส่วนเดียวของมุมมอง → ข้อความตัวเลข/มาสก์ (ช่อง .ret blank แล้ว · หน่วยใหญ่ของเงินแทนด้วย § ในมาสก์) */
function partText(html) {
  const h = html.replace(RET_CELL_RE, '<div class="ret"></div>');
  const t = numText(h);
  return { t, masked: maskText(h.replace(SCALE_AFTER_NUM_RE, '$1§')), nums: [...t.matchAll(NUM_RUN_RE)] };
}
/**
 * หน่วยใหญ่ของเงินต่างกันสองฝั่ง = "รูป" หรือไม่ — กติกาเลขนัยสำคัญ (Task 14a fix round 2 · แทน "ครึ่งหน่วยฝั่งละเอียด" ของ fix1 R4)
 *   ฝั่งหยาบ C = ฝั่งที่ตำแหน่งหลักสุดท้ายที่พิมพ์ p (ทศนิยม × หน่วย) ใหญ่กว่า · ปัดค่าฝั่งละเอียด F ไปที่ตำแหน่ง p แล้วต้อง **เท่ากับ C**
 *   ★ F ต้องเหลือเลขนัยสำคัญ ≥ 1 หลักที่ตำแหน่ง p — "฿1 ล้านล้าน" vs "฿5.1 แสนล้าน": หลัก 1e12 ใหญ่กว่าหลักนำของ 5.1e11
 *     (เหลือ 0 หลัก) ⇒ ต่างจริง ไม่ใช่ "0.51 ปัดเป็น 1"
 *   ★ F ที่เห็นถูกปัดมาแล้วที่ตำแหน่งของมันเอง pF ⇒ "ปัด F" = ปัดค่าจริงช่วง [F−pF/2, F+pF/2] — มีค่าในช่วงนั้นที่ปัดได้ C ก็เท่ากัน
 *     (ADVANC ×0.87: v1 "0.91 ล้านล้าน" · v2 "9.15 แสนล้าน" จากค่าจริง 9.148 → ปัดข้อความ 9.15 ซ้ำได้ 9.2 แต่ค่าจริงปัดได้ 9.1)
 *   ตัวอย่าง: "฿0.89 ล้านล้าน" vs "฿8.94 แสนล้าน" → 8.9e11 รูป · "$0.99 B" vs "$986 M" → 9.9e8 รูป · "$1.00 B" vs "$998 M" → ปัดข้ามหลัก
 *     1.00e9 รูป (PRCT ×0.86 — ถ้านับเลขนัยสำคัญในหลักของ F เองจะได้ 998 ≠ 1000 ทั้งที่ v1 พิมพ์ 0.998 ด้วยทศนิยม 2 ตำแหน่ง) ·
 *     "$2 B" vs "$1,450 M" → 1e9 ≠ 2e9 ต่างจริง · "฿0.89 ล้านล้าน" vs "฿8.84 แสนล้าน" → 8.8e11 ≠ 8.9e11 ต่างจริง
 */
function unitForm(X, Y) {
  if (!X.u.mult || !Y.u.mult || !(X.V > 0) || !(Y.V > 0)) return false;
  const pX = Math.pow(10, -decOf(X.x)) * X.u.mult, pY = Math.pow(10, -decOf(Y.x)) * Y.u.mult;
  const [C, F, p, pF] = pX >= pY ? [X, Y, pX, pY] : [Y, X, pY, pX];
  const keep = Math.floor(Math.log10(F.V) + 1e-9) - Math.round(Math.log10(p)) + 1;     // เลขนัยสำคัญของ F ที่ตำแหน่ง p
  if (keep < 1) return false;
  // ช่วงค่าจริงของ F ตัดกับช่วงที่ปัดที่ตำแหน่ง p แล้วได้ C  ⇔  |F − C| ≤ (p + pF) / 2
  return Math.abs(F.V - C.V) <= (p + pF) / 2 + p * 1e-6;
}
/** ตัวเลขลำดับ i ของส่วน (คูณหน่วยใหญ่แล้ว) — ใช้ทั้งตัวเทียบและตัวตัดสินฝั่ง */
function numAt(pt, i) {
  const m = pt.nums[i];
  if (!m) return null;
  const u = scaleAt(pt.t, m.index + m[0].length), x = cleanNum(m[0]);
  const v = parseFloat(x.replace(/,/g, ''));
  return { s: m[0], x, u, v, V: v * (u.mult || 1), H: halfUnit(x) * (u.mult || 1), index: m.index };
}

/**
 * ตัวเลขที่มองเห็นของผล cron สองฝั่ง — **ชั้น 2 ของ migrator ตัวเดิม** (maskText + ข้อยกเว้น " • รวมปันผล" ของ checkStripped)
 * แล้วเทียบเลขทีละตัวตามลำดับ: ข้อความเท่ากัน = ผ่าน · ค่าเท่ากันเป๊ะ (ศูนย์ท้าย/คอมมา — sameMoney) = ผ่านเงียบ ·
 * ห่างไม่เกินครึ่งหน่วยของทศนิยมที่หยาบกว่า (roundsTo/scnPyDiffs 'form') = "รูป" (บันทึก ไม่ตก) · นอกนั้น = ค่าที่คนเห็นต่างจริง
 * ★ หน่วยใหญ่ของเงินต่างกัน = รูปตามกติกาเลขนัยสำคัญ (unitForm · fix round 2): ปัดฝั่งละเอียดไปที่หลักสุดท้ายของฝั่งหยาบแล้วต้องเท่ากัน
 *   (฿0.89 ล้านล้าน ~ ฿8.94 แสนล้าน · ฿1 ล้านล้าน ≠ ฿5.1 แสนล้าน)
 * ★ statics = คู่ข้อความตัวเลข (part|v1|v2) ที่ต่างกันอยู่แล้ว **ก่อน** patch (ผลต่างที่ migrator ชั้น 1 ยอมรับไว้
 *   เช่น MOS30 ฿1.99→฿2.00 ใต้ GAP_REL) — cron ไม่แตะสองฝั่งของคู่นั้น ⇒ ไม่ใช่ "พฤติกรรม cron" ข้ามได้ไม่เกินจำนวนที่มีก่อน patch
 *   ★ ไม่ผูกลำดับ (index) — ราคาข้ามหลัก/gauge ขยายขอบทำให้ลำดับเลื่อนได้ · ถ้า cron ขยับฝั่งใดฝั่งหนึ่ง ข้อความคู่จะไม่ตรง = ตรวจตามปกติ
 *   ★ คู่ที่ "ค่าต่าง" (ไม่ใช่รูป) ที่ถูกข้ามจริงคืนใน valueUsed — census ต้องเปิดเผยรายใบ (fix1 R1)
 * @param {{statics?:Map<string,object>, collect?:boolean}} [opt]  collect = โหมดเก็บ statics (ไม่หยุดที่ตัวแรก)
 * @returns {{bad:string|null, at:object|null, forms:{part:'ret'|'sec6'|'page'|'era',before:string,after:string}[], retClass:number,
 *            statics:Map<string,{n:number,form:boolean,part:string,label:string,v1:string,v2:string,relPct:number|null}>, relax:object, valueUsed:object[]}}
 *   at = ตำแหน่งที่ตก (type text|count|num|ret-count|ret-pcts|ret-class|ret-val|stripped + j/i/c/q · drop1/drop2) ให้ตัวตัดสินฝั่ง
 *   part: ret = % ในช่อง .ret · sec6 = ตัวเลขอื่นในหมวด 6 (เช่น "จากจุดเข้า") · page = นอกหมวด 6 · era = ปีคนละศักราช
 */
function visibleCronDiff(e1, e2, values, opt) {
  const o = opt || {};
  const statics = o.statics || new Map(), found = new Map(), used = new Map(), valueUsed = [];
  const forms = [];
  let retClass = 0, drop1 = false, drop2 = false, whole = false;
  // ข้อยกเว้นที่ถูกใช้จริงในการเทียบครั้งนี้ (นับครั้ง) — ไม่เปลี่ยนผลตัดสิน แค่ให้ census/รายงานเห็นว่า "ผ่าน" เพราะกติกาไหน
  const relax = { static: 0, pyForm: 0, restate: 0, scale: 0, era: 0 };
  const out = (bad, at) => ({ bad, at: at ? Object.assign({ drop1, drop2, whole }, at) : null, forms, retClass, statics: found, relax, valueUsed });
  const stripBad = checkStripped(e1, e2, values, []);
  if (stripBad && !o.collect) return out(stripBad, { type: 'stripped' });
  // วงเล็บทวนวันที่ "ล้วน" ในหัวรายงาน — migrator ลบได้ (TOLERANCE.f11 · site restate) ⇒ ฝั่งที่ยังมีอยู่ฝั่งเดียวให้ตัดออกก่อนเทียบ
  //   ★ ตัดเฉพาะวงเล็บที่ **วันเดียวกับวันที่ราคา** (PD.findRestatedDate) และข้างในมีแต่วันที่ — วงเล็บค้างวันเก่า/มีคำขยาย = ไม่แตะ (ตรวจตามปกติ)
  const q1 = pureRestate(e1), q2 = pureRestate(e2);
  drop1 = !!(q1 && !q2); drop2 = !!(q2 && !q1);
  if (drop1 || drop2) relax.restate++;
  // โหมดเก็บ statics (ก่อน patch): ใช้ stripVolatile ตัวเดียวกับชั้น 2 ตอนย้าย — ตัวที่ทำให้มาสก์เท่ากันจนย้ายผ่านได้
  //   (ช่องสรุป/.chg ของ v1 ก่อน patch อาจค้างคนละถ้อยคำ ⇒ ไม่ strip = จัดเรียงเลขไม่ได้ทั้งส่วน)
  const p1 = cronView(e1, drop1, o.collect), p2 = cronView(e2, drop2, o.collect);
  // หมวด 6 หาเจอฝั่งเดียว = โครงหน้าต่างกันแล้ว — เทียบทั้งหน้าก้อนเดียว (มาสก์จะชี้จุดต่างให้เอง)
  whole = p1.length !== p2.length;
  const joinAll = (p) => [{ part: 'page', html: p.map((x) => x.html).join('') }];
  const [a, b] = whole ? [joinAll(p1), joinAll(p2)] : [p1, p2];
  const basis = values && values.scnBasis;
  for (let j = 0; j < a.length; j++) {
    const r1 = retCells(a[j].html), r2 = retCells(b[j].html);
    let retBad = r1.length !== r2.length ? [`จำนวนช่อง .ret (${a[j].part}) ${r1.length} ≠ ${r2.length}`, { type: 'ret-count', j }] : null;
    for (let c = 0; !retBad && c < r1.length; c++) {
      const x = r1[c], y = r2[c];
      if (x.pcts.length !== y.pcts.length) { retBad = [`ช่อง .ret คอลัมน์ ${c + 1} จำนวนตัวเลข % v1 [${x.pcts.map((p) => p.t)}] ≠ v2 [${y.pcts.map((p) => p.t)}]`, { type: 'ret-pcts', j, c }]; break; }
      // สีช่อง: cron v1 **ไม่แตะ** คลาส pos/neg (ตั้งใจ — memory price-derived-staleness) ⇒ ราคาวิ่งจนผลตอบแทนเปลี่ยนเครื่องหมาย
      //   v1 ค้างสีเดิม ส่วน v2 คิดสีจากตัวเลขเดียวกับที่พิมพ์ (RV.derive cls) — ต่างกันได้ **เฉพาะ** เมื่อ v2 สอดคล้องกับเครื่องหมาย
      //   ของตัวเลขรวมที่ตัวเองโชว์ (= v2 แก้สีค้างของ v1 · เปิดเผยเป็น retClass) · v2 สีขัดตัวเลขตัวเอง = ต่างจริง
      if (x.cls !== y.cls) {
        const tot = y.pcts[0];
        const want = tot ? (/^-/.test(tot.t) ? 'neg' : 'pos') : null;
        if (!want || !new RegExp('\\b' + want + '\\b').test(y.cls)) { retBad = [`คลาสช่อง .ret คอลัมน์ ${c + 1}: v1 ${x.cls} ≠ v2 ${y.cls} (v2 ขัดเครื่องหมาย ${tot ? tot.t : '-'}%)`, { type: 'ret-class', j, c }]; break; }
        retClass++;
      }
      for (let q = 0; q < x.pcts.length; q++) {
        const P = x.pcts[q], Q = y.pcts[q];
        if (P.v === Q.v) continue;
        // ตัวแรก = รวม (ต้องอยู่ในรูป) · ตัวที่สอง = %/ปี (อยู่ในรูป หรืออธิบายได้ด้วยรูปของ "รวม" ทั้งสองฝั่ง — pyExplained)
        const plain = withinForm(P.t, Q.t, P.v, Q.v);
        const ok = plain || (q === 1 && withinForm(x.pcts[0].t, y.pcts[0].t, x.pcts[0].v, y.pcts[0].v) && pyExplained(x.pcts[0], P, y.pcts[0], Q, basis));
        if (!ok) { retBad = [`ช่อง .ret คอลัมน์ ${c + 1}: v1 ${P.t}% ≠ v2 ${Q.t}%`, { type: 'ret-val', j, c, q }]; break; }
        if (!plain) relax.pyForm++;
        forms.push({ part: 'ret', before: P.t + '%', after: Q.t + '%' });      // ช่อง .ret (หมวด 6) — แถว "รูปทศนิยมหมวด 6" ของ census
      }
    }
    if (retBad && !o.collect) return out(retBad[0], retBad[1]);
    const A = partText(a[j].html), B = partText(b[j].html);
    if (A.masked !== B.masked) {
      if (o.collect) continue;                              // โครงคำต่างตั้งแต่ก่อน patch — ส่วนนี้ไม่มี statics (เทียบเข้มตามปกติ)
      const m1 = A.masked, m2 = B.masked;
      let i = 0;
      while (i < m1.length && i < m2.length && m1[i] === m2[i]) i++;
      return out(`ข้อความ (${a[j].part}) ต่างที่ตัวอักษร ${i}: v1 «${m1.slice(Math.max(0, i - 30), i + 30)}» ≠ v2 «${m2.slice(Math.max(0, i - 30), i + 30)}»`, { type: 'text', j });
    }
    // ★ มาสก์เท่ากัน ⇒ จำนวนตัวเลขเท่ากันโดยโครงสร้าง (แต่ละก้อนเลขกลายเป็น '#' หนึ่งตัว) — คงไว้เป็นยามกันโค้ดมาสก์เปลี่ยนในอนาคต
    if (A.nums.length !== B.nums.length) { if (o.collect) continue; return out(`จำนวนตัวเลข (${a[j].part}) ${A.nums.length} ≠ ${B.nums.length}`, { type: 'count', j }); }
    for (let i = 0; i < A.nums.length; i++) {
      const X = numAt(A, i), Y = numAt(B, i);
      if (X.s === Y.s && X.u.word === Y.u.word) continue;
      const fin = Number.isFinite(X.v) && Number.isFinite(Y.v);
      const bf = X.s + (X.u.word ? ' ' + X.u.word : ''), af = Y.s + (Y.u.word ? ' ' + Y.u.word : '');
      let exact = false, form = false, part = a[j].part;
      if (X.u.word !== Y.u.word) {
        // หน่วยใหญ่ต่างกัน (v1 คงหน่วยของผู้เขียน "฿0.89 ล้านล้าน" · v2 fmtBig เลือกหน่วยใหม่ "฿8.94 แสนล้าน")
        //   ★ fix2: กติกาเลขนัยสำคัญ (unitForm) — หน่วยหายฝั่งเดียว = ต่างจริง
        form = fin && unitForm(X, Y);
        if (form && !o.collect) relax.scale++;
      } else {
        exact = fin && X.v === Y.v && sameMoney(X.x, Y.x);                                // ศูนย์ท้าย/คอมมา — ค่าเท่ากันเป๊ะ
        form = fin && withinForm(X.x, Y.x, X.v, Y.v);
        // ปีคนละศักราช (2569 ↔ 2026) = วันเดียวกัน — migrator ทำให้ .disc ตามศักราชของหัวรายงาน (note `dateEra normalize`)
        //   ★ fix1 R3: เฉพาะบริบทวันที่ทั้งสองฝั่ง (ชื่อเดือนไทยติดหน้า)
        if (!form && fin && /^\d{4}$/.test(X.x) && /^\d{4}$/.test(Y.x) && Math.abs(X.v - Y.v) === 543 && eraCtx(A.t, X.index) && eraCtx(B.t, Y.index)) {
          form = true; part = 'era'; if (!o.collect) relax.era++;
        }
      }
      const key = `${a[j].part}|${bf}|${af}`;
      const st = statics.get(key);
      const isStatic = !o.collect && !!st && st.n > (used.get(key) || 0);
      if (isStatic) { used.set(key, (used.get(key) || 0) + 1); relax.static++; if (!st.form) valueUsed.push(st); }
      if (!exact && !form) {
        if (!o.collect && !isStatic) {
          const ctx = A.t.slice(Math.max(0, X.index - 40), X.index).replace(/\s+/g, ' ').trim();
          return out(`ตัวเลข (${a[j].part}) «…${ctx.slice(-30)} ${bf}» v1 ${bf} ≠ v2 ${af}`, { type: 'num', j, i });
        }
      } else if (!exact && !o.collect && !isStatic) forms.push({ part, before: bf, after: af });
      // รวมผลต่างรูปที่มีก่อน patch ด้วย (ไม่ใช่ของ cron ไม่นับ formOnly) · ★ เพดาน = GAP_REL (ช่องเงินที่ชั้น 1 ยอมกว้างสุด — arrNearGap)
      //   ผลต่างที่ใหญ่กว่านั้นไม่ใช่สิ่งที่ migrator "ยอมรับไว้" ⇒ ไม่ให้เป็น static (ตรวจทุกจุด grid ตามปกติ)
      if (o.collect && !exact && (form || (X.u.word === Y.u.word && fin && Math.abs(X.v - Y.v) <= Math.max(GAP_REL * Math.abs(Y.v), 0.01) + 1e-9))) {
        // ป้ายของไซต์ = ข้อความรอบตัวเลข (ก่อน ▯ หลัง) — การ์ด/สเกลบางแบบวางชื่อไว้ **หลัง** ตัวเลข (<span>$X<br><small>ชื่อ</small>)
        const around = (from, to) => A.t.slice(from, to).replace(/\s+/g, ' ').trim();
        const label = `${around(Math.max(0, X.index - 60), X.index).slice(-24)} ▯ ${around(X.index + X.s.length, X.index + X.s.length + 60).slice(0, 24)}`;
        const e = found.get(key) || { n: 0, form, part: a[j].part, label,
          v1: bf, v2: af, relPct: Y.V ? Math.round(Math.abs(X.V - Y.V) / Math.abs(Y.V) * 10000) / 100 : null };
        e.n++;
        found.set(key, e);
      }
    }
  }
  return out(null);
}

/** gate ของผล cron หนึ่งฝั่ง — ★ fix1 R7: เรียก UP.gateCheck ตัวเดียวกับ gateAfterPatch (ไม่มีสำเนา) แล้วจัดรูปให้การเทียบ
 *  codes = ชุด error id เรียงแล้ว · warns = multiset warning id เรียงแล้ว · warnMsg = ข้อความ warning ต่อ id · exp = หน้า expand (ใช้ต่อ) */
function cronGate(html, name) {
  const UP = require('./update-prices.js');     // lazy: update-prices → check-reports → update-prices (cycle ตอนโหลด)
  const g = UP.gateCheck(html, name);
  return { exp: g.expanded, codes: g.codes.slice().sort(), warns: g.warnings.map((w) => w.id).sort(), detail: g.detail,
    warnMsg: Object.fromEntries(g.warnings.map((w) => [w.id, w.msg])) };
}

// ── ตัดสินฝั่งของความล้มเหลว (fix1 R6) ────────────────────────────────────────────
// กติกา (ง่ายและตรวจซ้ำได้): เทียบ "จุด grid ที่ตก" กับ "จุดที่เทียบผ่านล่าสุดก่อนหน้า" (ข้างเคียง — สองฝั่งยังเท่ากันที่จุดนั้น)
//   ต่อชนิด: ฝั่งไหน "เปลี่ยนชั้น/ฐาน" ระหว่างสองจุดขณะอีกฝั่งไม่เปลี่ยน = ฝั่งนั้นไม่นิ่ง
//   · throw → ฝั่งที่ throw · gate-error/gate-warn:<id> → ฝั่งที่ชุด error / จำนวน warning id นั้นเปลี่ยน
//   · meta:<key> / ตัวเลข (visible num/ret-val) → ฝั่งที่ค่าขยับมากกว่าอีกฝั่งเกินครึ่งหน่วยของทศนิยมที่หยาบที่สุดในสี่ค่า
//     (ราคาขยับทีละ 0.5% ทำให้สองฝั่งขยับพอ ๆ กัน · การพลิกฐานทำให้ฝั่งเดียวกระโดด — BNY 1.2→1.4 ขณะ v2 1.2→1.2)
//   · visible text/count/ret-count/ret-pcts/ret-class/stripped → ฝั่งที่มาสก์/จำนวน/คลาสเปลี่ยน
//   ทุกชนิดต้องได้ฝั่งเดียวกัน ไม่งั้น unknown · ตกที่จุดแรกของ grid (ไม่มีจุดข้างเคียง) = unknown
//   v1 → reason `cron-diff v1-unstable <kinds>` · v2 → `cron-diff v2-diff <kinds>` · unknown → `cron-diff <kinds>` + side:'unknown'
function jumpSide(p1, c1, p2, c2, tol) {
  if (![p1, c1, p2, c2].every(Number.isFinite)) return 'unknown';
  const d1 = Math.abs(c1 - p1), d2 = Math.abs(c2 - p2);
  return d1 > d2 + tol ? 'v1' : d2 > d1 + tol ? 'v2' : 'unknown';
}
const changedSide = (ch1, ch2) => (ch1 && !ch2 ? 'v1' : ch2 && !ch1 ? 'v2' : 'unknown');
/** ค่าเดียว (ตามตำแหน่ง at) ของหน้า expand ฝั่งหนึ่ง — คืน null เมื่อโครงไม่ตรงกับตอนตก (ตัดสินไม่ได้) */
function slotOf(exp, at, side) {
  if (!exp) return null;
  let parts = cronView(exp, side === 1 ? at.drop1 : at.drop2, false);
  if (at.whole) parts = [{ part: 'page', html: parts.map((x) => x.html).join('') }];
  const p = parts[at.j];
  if (at.type === 'stripped') return { sig: (exp.match(DIV_TEXT_RE) || []).length };
  if (!p) return null;
  if (at.type.startsWith('ret-')) {
    const rc = retCells(p.html);
    if (at.type === 'ret-count') return { sig: rc.length };
    const col = rc[at.c];
    if (!col) return null;
    if (at.type === 'ret-pcts') return { sig: col.pcts.length };
    if (at.type === 'ret-class') return { sig: col.cls };
    const P = col.pcts[at.q];
    return P ? { v: P.v, h: halfUnit(P.t) } : null;
  }
  const pt = partText(p.html);
  if (at.type === 'text') return { sig: pt.masked };
  if (at.type === 'count') return { sig: pt.nums.length };
  const n = numAt(pt, at.i);
  return n ? { v: n.V, h: n.H } : null;
}
function failSide(prev, cur, kinds, at) {
  if (!prev) return { side: 'unknown', why: 'ตกที่จุดแรกของ grid — ไม่มีจุดข้างเคียงให้เทียบ' };
  const per = kinds.map((kind) => {
    if (kind === 'throw') return changedSide(!!cur.t1, !!cur.t2);
    if (kind === 'gate-error') return changedSide(prev.g1.codes.join() !== cur.g1.codes.join(), prev.g2.codes.join() !== cur.g2.codes.join());
    if (kind.startsWith('gate-warn:')) {
      const id = kind.slice(10), n = (g) => g.warns.filter((w) => w === id).length;
      return changedSide(n(prev.g1) !== n(cur.g1), n(prev.g2) !== n(cur.g2));
    }
    if (kind.startsWith('meta:')) {
      const key = kind.slice(5), vs = [prev.s1[key], cur.s1[key], prev.s2[key], cur.s2[key]];
      if (!vs.every((v) => typeof v === 'number')) return 'unknown';
      return jumpSide(vs[0], vs[1], vs[2], vs[3], 0.5 * Math.pow(10, -Math.min(...vs.map(decOf))));
    }
    if (kind === 'visible' && at) {
      const P1 = slotOf(prev.g1.exp, at, 1), C1 = slotOf(cur.g1.exp, at, 1), P2 = slotOf(prev.g2.exp, at, 2), C2 = slotOf(cur.g2.exp, at, 2);
      if (!P1 || !C1 || !P2 || !C2) return 'unknown';
      if ('sig' in C1) return changedSide(P1.sig !== C1.sig, P2.sig !== C2.sig);
      return jumpSide(P1.v, C1.v, P2.v, C2.v, Math.max(P1.h, C1.h, P2.h, C2.h));
    }
    return 'unknown';
  });
  const side = per.every((s) => s === per[0]) ? per[0] : 'unknown';
  return { side, why: `×${prev.k}→×${cur.k}: ` + kinds.map((k, i) => `${k}=${per[i]}`).join(' ') };
}

/**
 * cron differential ต่อไฟล์: patch ทั้ง v1 (ต้นฉบับ) และ v2 (ผล migrateOne) ด้วย `UP.patchReport` ที่ราคา/วันที่เดียวกัน
 * บน grid 61 จุด แล้วเทียบ (ก) stock-meta 6 คีย์ภายใต้รูป (ข) ตัวเลขที่มองเห็นภายใต้รูป (ค) error ของ gate (ง) warning ของ gate
 * ★ gate = UP.gateCheck ตัวเดียวกับ gateAfterPatch (expand ครั้งเดียวใช้ทั้ง gate และตัวเลข) · ตัวคูณแรกที่ต่าง = หยุด (early exit)
 * ★ STALE_TODAY = วันที่ patch ระหว่างรัน (E27/W09 ไม่เดินตามปฏิทินจริง — ผลซ้ำได้ทุกวัน) แล้วคืนค่าเดิม
 * ★ ขอบเขต (fix1 R10): เทียบ **สถานะหลัง patch เท่านั้น** — ความเท่ากันก่อน patch เป็นหน้าที่ของ migrateOne (ชั้น 1/2) ⇒ ผลต่างก่อน patch
 *   ที่ cron รอบแรกซ่อมเอง หรือที่ cron ไม่แตะ (≤ GAP_REL · statics) ไม่ถูกนับเป็นความล้มเหลว · ไม่เทียบ r.changed/notes และทาง chartData≠null
 *   · อินพุตของ decide() (ราคาเดิม/FV) เท่ากันโดยการสร้างบนใบที่ย้ายแล้ว (values.px = stock-meta.price — migrator ปฏิเสธใบที่ต่าง ·
 *   fv = stock-meta.fairValue) ⇒ การตัดสิน freeze ไม่ต้องเทียบ
 * ★ ข้อจำกัดของ "รูป": ครึ่งหน่วยของทศนิยมที่หยาบกว่ากว้างเมื่อข้อความฝั่งหนึ่งไม่มีทศนิยม (เช่น % เป้า 0.5 จุด) — grid 61 จุดช่วยจับเมื่อค่าข้ามขอบการปัด
 * @param {string} srcV1  HTML v1 ต้นฉบับ
 * @param {string} outV2  HTML v2 (migrateOne(srcV1).out)
 * @param {string} name   ชื่อไฟล์ เช่น "AAPL.html"
 * @param {{grid?:number[]}} [opts]  grid = ตัวคูณ (เทสใช้ย่อ) · ไม่ส่ง = CRON_GRID
 * @returns {{ok:boolean, kinds:string[], k:number|null, detail:string[], side:'v1'|'v2'|'unknown'|null, sideWhy:string, formOnly:object[],
 *            formParts:string[], valueDiff:object[], points:number, compared:number, retClass:number, relax:object}}
 *   kinds: throw · throw-both · meta:<key> · visible · gate-error · gate-warn:<id> · (setup = อ่าน values.px/priceDate ของ v2 ไม่ได้)
 *   side: ฝั่งที่ไม่นิ่งเมื่อตก (ดู failSide) · null เมื่อผ่าน — ★ v1-unstable = ผลของ v1 เปลี่ยนชนิด/ฐานระหว่างจุด grid ติดกันขณะ v2 นิ่ง
 *     **ไม่ใช่คำตัดสินว่าฝั่งไหนถูก** (negative control: cron ก่อน fix wave ส่วน D ได้ v1-unstable 43 ใบ meta:pe ทั้งที่บั๊กอยู่ฝั่ง v2
 *     ที่นิ่งบนฐานผิด) · v2-diff = กลับด้าน · unknown = ตกที่จุดแรกของ grid หรือชนิดให้ฝั่งขัดกัน
 *   formOnly: ตัวอย่างตัวเลขที่ cron ทำให้ต่างแค่รูป ≤3 ตัวอย่างต่อใบ (fix1 R10 — ขนาด census) · formParts = ชุด part ที่พบรูปทั้งหมด
 *     (ไม่รวมศูนย์ท้าย/คอมมา และไม่รวมผลต่างที่มีอยู่ก่อน patch) — ไม่ใช่ความล้มเหลว แต่ census ต้องเปิดเผย (part 'ret' = แถวรูปทศนิยมหมวด 6)
 *   valueDiff: คู่ "ค่าต่างที่มีอยู่ก่อน patch" ที่ถูกข้ามจริงบน grid {part,label,v1,v2,relPct} (fix1 R1 — census เปิดเผยรายใบ)
 *   retClass: จำนวนจุด grid ที่ v2 แก้สีช่อง .ret ค้างของ v1 (เปิดเผยเท่านั้น)
 *   relax: จำนวนจุด grid ที่ข้อยกเว้นแต่ละตัวถูกใช้ (static ผลต่างก่อน patch · pyForm %/ปี ตามรูปของรวม · restate วงเล็บทวนล้วน ·
 *     scale หน่วยใหญ่ของเงิน · era ศักราช) — ไม่เปลี่ยนผลตัดสิน ให้คนตรวจเห็นว่าใบไหน "ผ่านเพราะข้อยกเว้น"
 */
function cronDiff(srcV1, outV2, name, opts) {
  const o = opts || {};
  const UP = require('./update-prices.js');     // lazy: update-prices → check-reports → update-prices (cycle ตอนโหลด)
  const res = { ok: true, kinds: [], k: null, detail: [], side: null, sideWhy: '', formOnly: [], formParts: [], valueDiff: [], points: 0, compared: 0, retClass: 0,
    relax: { static: 0, pyForm: 0, restate: 0, scale: 0, era: 0 } };
  const fail = (k, kinds, detail, sd) => Object.assign(res, { ok: false, k, kinds: [...new Set(kinds)], detail, side: sd ? sd.side : 'unknown', sideWhy: sd ? sd.why : '' });
  const rd2 = RM.readReportData(outV2);
  const vals = rd2.ok && RV.isV2(rd2.data) ? rd2.data.values : null;
  const dateParts = vals ? cronDateParts(vals.priceDate) : null;
  if (!vals || !Number.isFinite(vals.px) || !dateParts) return fail(null, ['setup'], ['v2 ไม่มี values.px/priceDate ที่ใช้ได้']);
  const seen = new Set(), parts = new Set(), valueSeen = new Set();
  // ผลต่างตัวเลขที่มีอยู่แล้วก่อน patch (ชั้น 1 ของ migrator ยอมรับไว้) — ดู statics ใน visibleCronDiff
  let statics = new Map();
  try { statics = visibleCronDiff(expandReport(srcV1), expandReport(outV2), vals, { collect: true }).statics; } catch (e) { statics = new Map(); }
  const prevToday = process.env.STALE_TODAY;
  process.env.STALE_TODAY = RV.isoOf(dateParts);
  let prev = null, lastBoth = '';
  try {
    for (const k of (o.grid || CRON_GRID)) {
      res.points++;
      const newPrice = Math.round(vals.px * k * 100) / 100;
      const p = { newPrice, dateParts, chartData: null };
      let r1 = null, r2 = null, t1 = null, t2 = null;
      try { r1 = UP.patchReport(srcV1, p); } catch (e) { t1 = e.message; }
      try { r2 = UP.patchReport(outV2, p); } catch (e) { t2 = e.message; }
      if (t1 && t2) { lastBoth = `v1 ${t1.slice(0, 100)} · v2 ${t2.slice(0, 100)}`; continue; }   // จุดนี้สองฝั่ง patch-failed เหมือนกัน (ไม่นับว่าเทียบ)
      if (t1 || t2) return fail(k, ['throw'], [`×${k} ราคา ${newPrice}: ${t1 ? 'v1' : 'v2'} throw — ${(t1 || t2).slice(0, 200)}`], failSide(prev, { k, t1, t2 }, ['throw'], null));
      res.compared++;
      const kinds = [], detail = [];
      // (ก) stock-meta ภายใต้รูป
      const s1 = RM.readStockMeta(r1.html) || {}, s2 = RM.readStockMeta(r2.html) || {};
      for (const key of CRON_META_KEYS) {
        if (!sameMetaForm(s1[key], s2[key])) { kinds.push('meta:' + key); detail.push(`×${k} ราคา ${newPrice}: stock-meta.${key} v1 ${JSON.stringify(s1[key])} ≠ v2 ${JSON.stringify(s2[key])}`); }
      }
      // (ค)(ง) gate — expand ครั้งเดียวต่อฝั่ง (UP.gateCheck)
      const g1 = cronGate(r1.html, name), g2 = cronGate(r2.html, name);
      if (g1.codes.join(',') !== g2.codes.join(',')) { kinds.push('gate-error'); detail.push(`×${k} ราคา ${newPrice}: error v1 [${g1.codes}] ≠ v2 [${g2.codes}] — ${(g2.codes.length ? g2.detail : g1.detail).slice(0, 200)}`); }
      if (g1.warns.join(',') !== g2.warns.join(',')) {
        const cnt = (arr) => arr.reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map());
        const c1 = cnt(g1.warns), c2 = cnt(g2.warns);
        const diff = [...new Set([...c1.keys(), ...c2.keys()])].filter((id) => (c1.get(id) || 0) !== (c2.get(id) || 0));
        for (const id of diff) kinds.push('gate-warn:' + id);
        // ข้อความของ warning ตัวแรกที่ต่าง (จากฝั่งที่มี) — คนตัดสิน residue ต้องเห็นว่าฝั่งไหนผิดโดยไม่ต้องรันซ้ำ
        const id0 = diff[0], side = c1.get(id0) ? 'v1' : 'v2', msg = (side === 'v1' ? g1 : g2).warnMsg[id0] || '';
        detail.push(`×${k} ราคา ${newPrice}: warning v1 [${g1.warns}] ≠ v2 [${g2.warns}] — ${side} ${id0} ${msg}`.slice(0, 400));
      }
      // (ข) ตัวเลขที่มองเห็น — ต่อเมื่อ expand ได้ทั้งสองฝั่ง (expand ไม่ได้ฝั่งเดียว = gate-error ข้างบนแล้ว)
      let at = null;
      if (g1.exp && g2.exp) {
        const v = visibleCronDiff(g1.exp, g2.exp, vals, { statics });
        if (v.bad) { kinds.push('visible'); detail.push(`×${k} ราคา ${newPrice}: ${v.bad}`); at = v.at; }
        if (v.retClass) res.retClass++;
        for (const key of Object.keys(res.relax)) if (v.relax[key]) res.relax[key]++;   // นับเป็น "จำนวนจุด grid ที่ใช้ข้อยกเว้นนั้น"
        for (const f of v.forms) {
          parts.add(f.part);
          const key = f.part + ':' + f.before + '→' + f.after;
          // ≤3 ตัวอย่างต่อใบ · part ละ 1 ตัวอย่าง (ตัวแรกที่พบ) — การมี/ไม่มีของแต่ละ part อยู่ใน formParts ครบเสมอ
          if (seen.has(key) || res.formOnly.length >= 3 || res.formOnly.some((x) => x.part === f.part)) continue;
          seen.add(key); res.formOnly.push({ k, part: f.part, before: f.before, after: f.after });
        }
        for (const st of v.valueUsed) {
          const key = `${st.part}|${st.v1}|${st.v2}`;
          if (!valueSeen.has(key)) { valueSeen.add(key); res.valueDiff.push({ part: st.part, label: st.label, v1: st.v1, v2: st.v2, relPct: st.relPct }); }
        }
      }
      const cur = { k, s1, s2, g1, g2 };
      if (kinds.length) return fail(k, kinds, detail, failSide(prev, cur, [...new Set(kinds)], at));
      prev = cur;
    }
    // ★ fix1 R5: ไม่มีจุดไหนเทียบได้เลย (สองฝั่ง throw ทุกจุด) = ไม่ใช่ "ผ่าน"
    if (!res.compared) return fail(null, ['throw-both'], [`ไม่มีจุด grid ที่เทียบได้ — สองฝั่ง throw ทุกจุด (${lastBoth})`]);
    return res;
  } finally {
    res.formParts = [...parts].sort();
    if (prevToday === undefined) delete process.env.STALE_TODAY; else process.env.STALE_TODAY = prevToday;
  }
}

/**
 * ตัดสิน "เขียนไหม" ต่อไฟล์ (ใช้ทั้ง dry-run และ --write — census ของสองโหมดจึงตรงกันเสมอ)
 * ★ แยกเป็นฟังก์ชันให้เทสตรึงได้โดยไม่ต้องเขียน reports/ (CLI ไม่มีตัวเลือกชี้ไดเรกทอรีอื่น — ตั้งใจ)
 * @param {string} sym
 * @param {object} r   ผล migrateOne
 * @param {object|null} cd  ผล cronDiff (null = ไม่ได้สั่ง --cron-diff หรือ migrate ไม่ผ่าน)
 * @returns {{write:boolean, out:string|null, entry:object}}  cron-diff ตก ⇒ write:false + entry.ok:false + reason `cron-diff <kinds>`
 *   cron-diff ผ่านแต่มี formOnly ⇒ ยังเขียน (บันทึกลง entry.cronDiff ให้ census แสดงรายชื่อ)
 */
function planWrite(sym, r, cd) {
  const entry = { sym, ok: !!r.ok, reason: r.reason || null, tokenised: r.sites.tokenised, literal: r.sites.literal, notes: r.notes, pyChanges: r.pyChanges || [] };
  if (cd) {
    entry.cronDiff = { ok: cd.ok, kinds: cd.kinds, k: cd.k, side: cd.side, sideWhy: cd.sideWhy, detail: cd.detail.slice(0, 3), formOnly: cd.formOnly,
      formParts: cd.formParts || [], valueDiff: cd.valueDiff || [], retClass: cd.retClass || 0, relax: cd.relax, points: cd.points, compared: cd.compared };
    if (r.ok && !cd.ok) { entry.ok = false; entry.reason = cronDiffReason(cd); }
  }
  const write = entry.ok && typeof r.out === 'string';
  return { write, out: write ? r.out : null, entry };
}

/** เหตุผล residue ของ cron-diff (fix1 R6) — v1 ไม่นิ่ง / v2 ต่าง / ตัดสินฝั่งไม่ได้ (ดู failSide) */
function cronDiffReason(cd) {
  const k = cd.kinds.join(',');
  return cd.side === 'v1' ? `cron-diff v1-unstable ${k}` : cd.side === 'v2' ? `cron-diff v2-diff ${k}` : `cron-diff ${k}`;
}

/** สรุป cron differential จาก entries ของ census (คิดใหม่จาก bySym ทุกครั้ง ⇒ รีรันแบตช์เดิมไม่นับซ้ำ) */
function summarizeCronDiff(entries) {
  const checked = entries.filter((e) => e.cronDiff);
  const failByKind = {}, sec6Form = [], otherForm = [], retClass = [], valueDiff = [], relaxFiles = { static: [], pyForm: [], restate: [], scale: [], era: [] };
  for (const e of checked) {
    const c = e.cronDiff;
    if (!c.ok) for (const k of c.kinds) (failByKind[k] = failByKind[k] || []).push(e.sym);
    else {
      // formParts = ชุด part ที่พบรูปทั้งหมด (ตัวอย่างใน formOnly ถูกตัดเหลือ ≤3) · census เก่าไม่มี formParts → ถอยไปดูตัวอย่าง
      const partsOf = c.formParts || [...new Set((c.formOnly || []).map((f) => f.part))];
      const ret = (c.formOnly || []).find((f) => f.part === 'ret');
      if (partsOf.includes('ret')) sec6Form.push({ sym: e.sym, example: ret ? `${ret.before}→${ret.after} (×${ret.k})` : '' });
      if (partsOf.some((x) => x !== 'ret')) otherForm.push(e.sym);
      if ((c.valueDiff || []).length) valueDiff.push({ sym: e.sym, pairs: c.valueDiff });
    }
    if (c.retClass) retClass.push(e.sym);
    if (c.ok) for (const k of Object.keys(relaxFiles)) if (c.relax && c.relax[k]) relaxFiles[k].push(e.sym);
  }
  for (const k of Object.keys(relaxFiles)) relaxFiles[k].sort();
  for (const k of Object.keys(failByKind)) failByKind[k].sort();
  return {
    checked: checked.length, pass: checked.filter((e) => e.cronDiff.ok).length, fail: checked.filter((e) => !e.cronDiff.ok).map((e) => e.sym).sort(),
    failByKind, formOnly: checked.filter((e) => e.cronDiff.ok && ((e.cronDiff.formParts || []).length || (e.cronDiff.formOnly || []).length)).map((e) => e.sym).sort(),
    // fix1 R1: ค่าต่างที่มีอยู่ก่อน patch ที่ตัวเทียบข้าม (migration ชั้น 1 ยอมรับ ≤ GAP_REL) — รายใบ + ค่ามากสุดที่พบ
    valueDiff: valueDiff.sort((a, b) => a.sym.localeCompare(b.sym)),
    valueDiffMaxPct: valueDiff.reduce((m, x) => Math.max(m, ...x.pairs.map((p) => p.relPct || 0)), 0),
    sec6Form: sec6Form.sort((a, b) => a.sym.localeCompare(b.sym)), otherForm: otherForm.sort(), retClass: retClass.sort(), relaxFiles,
    failDetail: checked.filter((e) => !e.cronDiff.ok).sort((a, b) => a.sym.localeCompare(b.sym))
      .map((e) => ({ sym: e.sym, reason: e.reason, kinds: e.cronDiff.kinds, k: e.cronDiff.k, side: e.cronDiff.side || 'unknown', sideWhy: e.cronDiff.sideWhy || '',
        detail: (e.cronDiff.detail || []).join(' || ').slice(0, 400) })),
  };
}

// ── CLI + census ──────────────────────────────────────────────────────────────
function renderCensusMd(entries) {
  const byReason = new Map(), byLiteral = new Map(), eraFiles = [];
  let ok = 0;
  let pyFormCells = 0;
  const pyValueBySym = new Map();                    // sym → [{col,before,after}] เฉพาะ kind='value'
  for (const f of entries) {
    if (f.ok) ok++;
    else { const r = shortReason(f.reason); const e = byReason.get(r) || []; e.push(f.sym); byReason.set(r, e); }
    // เหตุผลของ literal อยู่ใน notes ("literal <site>: <why>") — ตารางต้องบอกได้ว่า "ไม่มีการ์ดนั้น" ต่างจาก
    // "มีแต่รูปตัวเลขไม่ตรง" ไม่งั้นตัวเลข literal ก้อนใหญ่อ่านไม่ได้ความ
    const whyOf = new Map();
    for (const n of f.notes || []) { const m = /^literal ([A-Za-z0-9]+): ([\s\S]*)$/.exec(n); if (m) whyOf.set(m[1], m[2].replace(/-?[0-9][0-9.,]*/g, 'N').slice(0, 60)); }
    for (const l of new Set(f.literal || [])) { const k = l + (whyOf.has(l) ? ' — ' + whyOf.get(l) : ''); const e = byLiteral.get(k) || []; e.push(f.sym); byLiteral.set(k, e); }
    if ((f.notes || []).some((n) => n.startsWith('dateEra normalize'))) eraFiles.push(f.sym);
    // ★ item 2 (review final): เปิดเผยผลต่าง %/ปี ของหมวด 6 ที่คนเห็นเปลี่ยน — เฉพาะใบที่ย้ายได้ (f.ok)
    if (f.ok) for (const c of f.pyChanges || []) {
      if (c.kind === 'form') pyFormCells++;
      else { const e = pyValueBySym.get(f.sym) || []; e.push(c); pyValueBySym.set(f.sym, e); }
    }
  }
  const rows = (m) => [...m.entries()].sort((a, b) => b[1].length - a[1].length)
    .map(([k, v]) => `| ${k} | ${v.length} | ${v.slice(0, 10).join(' ')}${v.length > 10 ? ' …' : ''} |`).join('\n');
  const pyValueCells = [...pyValueBySym.values()].reduce((n, v) => n + v.length, 0);
  return [
    '# census การย้าย v1 → v2 (ระยะ 2 ส่วน C)',
    '',
    `อัปเดต: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} (Asia/Bangkok)`,
    '',
    `| ผล | ใบ |`, `|---|---|`, `| ย้ายได้ | ${ok} |`, `| ยังไม่ได้ (residue) | ${entries.length - ok} |`, `| รวม | ${entries.length} |`,
    '', '## เหตุผล residue (นับต่อชนิด)', '', '| เหตุผล | ใบ | ตัวอย่าง (≤10) |', '|---|---|---|', rows(byReason) || '| — | 0 | |',
    '', '## site ที่คง literal (นับต่อชนิด)', '', '| site | ใบ | ตัวอย่าง (≤10) |', '|---|---|---|', rows(byLiteral) || '| — | 0 | |',
    '', '## ใบที่ศักราชของ .disc ต่างจากหัวรายงาน (note `dateEra normalize`)', '',
    eraFiles.length ? eraFiles.map((s) => `- ${s}`).join('\n') : '- (ไม่มี)',
    '',
    '## ผลตอบแทนฉาก %/ปี ที่ข้อความเปลี่ยนหลังย้าย (หมวด 6 · เปิดเผยเท่านั้น ไม่ใช่เกณฑ์ผ่าน/ตกใหม่ — ดู TOLERANCE.f34/f35)',
    '',
    `| ชนิด | จุด (คอลัมน์) | ใบ |`, `|---|---|---|`,
    `| รูปเลขเปลี่ยนแต่ค่าเท่าเดิม (form) | ${pyFormCells} | — |`,
    `| ค่าจริงขยับ (value) | ${pyValueCells} | ${pyValueBySym.size} |`,
    '',
    pyValueBySym.size ? '### ใบที่ %/ปี ขยับค่าจริง (ก่อน → หลัง ต่อคอลัมน์)' : '### ใบที่ %/ปี ขยับค่าจริง',
    '',
    pyValueBySym.size
      ? [...pyValueBySym.entries()].map(([sym, cs]) => `- ${sym}: ` + cs.map((c) => `${c.col} ${c.before} → ${c.after}`).join(' · ')).join('\n')
      : '- (ไม่มี)',
    '',
    ...clauseMd(entries),
    ...tildeMd(entries),
    ...cronDiffMd(summarizeCronDiff(entries)),
    ...finalSummaryMd(entries),
  ].join('\n');
}

// ── M2 (Part D) — "~" ที่ migrator เติมหน้า token เอง · เปิดเผยอย่างเดียว ไม่ใช่เกณฑ์ผ่าน/ตก ──────
// ★ ทำไมต้องเปิดเผย: `maskText` ตัด [~≈] ทิ้งทั้งสองฝั่ง (ชั้น 2 ของ migrator) ⇒ การงอก "~" ไม่มีชั้นไหนเห็นเลย
function tildeMd(entries) {
  // ★ round 2 (review M1): เดิมพิมพ์ `Set.size` (จำนวน "ใบ") ลงช่อง "จุด" ⇒ สองช่องเท่ากันเสมอโดยบังเอิญ
  //   (วันนี้ชื่อ site หนึ่ง ๆ โผล่ได้ไม่เกิน 1 ครั้งต่อใบ) · นับจำนวนครั้งจริงแยกจากจำนวนใบ
  const bySite = new Map();      // site → {n: จำนวนจุด, syms: Set ของใบ}
  let sites = 0;
  const files = new Set();
  for (const f of entries) {
    if (!f.ok) continue;
    for (const n of f.notes || []) {
      if (!String(n).startsWith(TILDE_NOTE)) continue;
      const site = String(n).slice(TILDE_NOTE.length);
      const e = bySite.get(site) || { n: 0, syms: new Set() };
      e.n++; e.syms.add(f.sym); bySite.set(site, e);
      sites++; files.add(f.sym);
    }
  }
  if (!sites) return [];
  return [
    '## "~" ที่ migrator เติมหน้า token เอง (ไม่มีในต้นฉบับตรงตำแหน่งนั้น)',
    '',
    'token เงินของ skeleton v2 สองจุด (`~{{rd:baseEps}}` · `~{{rd:sc<k>div}}`) เขียน "~" นำหน้าเสมอ — ใบที่ต้นฉบับไม่มี',
    'เครื่องหมายนี้ตรงตำแหน่งนั้นจึง "งอก" ข้อความที่คนเห็น · ชั้น 2 มองไม่เห็นเพราะ `maskText` ตัด `[~≈]` ทิ้งทั้งสองฝั่ง',
    '⇒ เปิดเผยอย่างเดียว ไม่ใช่เกณฑ์ผ่าน/ตก และไม่ใช่ความล้มเหลว (รูปของ skeleton v2 เป็นแบบนี้)',
    '',
    '| site | จุด | ใบ | รายชื่อ |', '|---|---|---|---|',
    ...[...bySite.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
      .map(([k, v]) => `| ${k} | ${v.n} | ${v.syms.size} | ${[...v.syms].sort().join(' ')} |`),
    `| **รวม** | **${sites}** | **${files.size}** | |`,
    '',
  ];
}

// ── R2 (review I2): clause "รวมปันผล" ที่ถูกตัดออกจากหน้าจริง — ต้องบอกว่า **ข้อความอะไร** หายไปต่อใบ ────
// ★ ทำไมต้องมี: Part D ให้หัวข้อเต็ม ๆ กับการ "งอก ~" ซึ่งเป็นเรื่องรูป แต่การ "ลบ $2.88/ปี ออกจากหน้าที่เผยแพร่แล้ว"
//   กลับมีแค่บรรทัดที่เอ่ยถึงป้าย ⇒ ไม่สมมาตรกับกติกาของ wave นี้เอง ("เปลี่ยนข้อความที่คนเห็นได้เฉพาะที่เปิดเผย")
function clauseMd(entries) {
  const rows = [];
  for (const f of entries) {
    if (!f.ok) continue;
    for (const n of f.notes || []) {
      const m = CLAUSE_NOTE_RE.exec(String(n));
      if (m) rows.push({ sym: f.sym, clause: m[1], tail: m[1].slice(NOTE_LABEL.length) });
    }
  }
  if (!rows.length) return [];
  rows.sort((a, b) => a.sym.localeCompare(b.sym));
  const withText = rows.filter((r) => r.tail !== '');      // ★ ใบที่ "ข้อความของผู้เขียน" หายไปด้วย — ต้องอ่านทุกบรรทัด
  const labelOnly = rows.filter((r) => r.tail === '');     // ป้ายอย่างเดียว (ไม่มีข้อความต่อท้าย) — นับรวมพอ
  return [
    '## clause "รวมปันผล" ที่ถูกตัดออกจากหน้าจริง (site `scnNote` · เฉพาะใบ `scnBasis.divIncluded = false`)',
    '',
    '`{{rd:scnNote}}` render เป็นค่าว่างเมื่อตัวเลขฉากของใบนั้นไม่ได้รวมปันผล ⇒ **ทั้ง clause** หายจากหน้าที่ผู้อ่านเห็น',
    'ไม่ใช่แค่ป้าย " • รวมปันผล" · หัวข้อนี้บอกว่า **ข้อความอะไร** หายไปจากแต่ละใบ (ก่อน fix wave นี้ ข้อความท้าย clause',
    'ค้างลอยอยู่บนหน้าโดยไม่มีที่อ้างอิง ซึ่งคือบั๊กที่แก้ไป) · ท้าย clause ที่กินได้ถูกจำกัดด้วย whitelist 3 รูปเท่านั้น',
    '(เลขเงิน · คำเดียวติดกัน · วงเล็บสั้น) และต้องไม่กลืน token/ค่าของ site อื่น — รูปอื่น = ไม่กิน คง literal',
    '',
    `### ใบที่ข้อความของผู้เขียนหายไปด้วย (${withText.length} ใบ — ต้องอ่านรายบรรทัด)`,
    '',
    '| ใบ | site | clause ที่ถูกตัดทั้งก้อน | ข้อความท้าย clause ที่หายไป |', '|---|---|---|---|',
    withText.length
      ? withText.map((r) => `| ${r.sym} | scnNote | \`${r.clause.replace(/\|/g, '\\|')}\` | \`${r.tail.replace(/\|/g, '\\|')}\` |`).join('\n')
      : '| — | | | |',
    '',
    `### ใบที่ตัดเฉพาะป้าย (ไม่มีข้อความต่อท้าย — ${labelOnly.length} ใบ)`,
    '',
    labelOnly.length ? labelOnly.map((r) => r.sym).join(' ') : '- (ไม่มี)',
    '',
    `รวม **${rows.length}** จุด / **${new Set(rows.map((r) => r.sym)).size}** ใบ`,
    '',
  ];
}

// ── สรุปสุดท้าย — Task 14 · เดิมสร้างด้วยสคริปต์ one-off แล้วต่อท้าย .md ด้วยมือ (หายทุกครั้งที่รัน --census ใหม่)
//   ⇒ ย้ายเข้ามาในตัว render เอง: รีรัน `--census` ได้บล็อกเดิมเสมอ (คิดจาก entries ของสำมะโนล้วน ๆ)
function finalSummaryMd(entries) {
  const okE = entries.filter((e) => e.ok);
  const res = entries.filter((e) => !e.ok);
  const cronRes = res.filter((e) => /^cron-diff /.test(String(e.reason || '')));
  const byReason = new Map();
  for (const e of res) { const k = shortReason(e.reason); const v = byReason.get(k) || []; v.push(e.sym); byReason.set(k, v); }
  const byBatch = new Map();
  for (const e of entries) { const k = e.batch == null ? '(ไม่ระบุ)' : String(e.batch); byBatch.set(k, (byBatch.get(k) || 0) + 1); }
  const siteCount = new Map();
  for (const e of okE) for (const s of new Set(e.literal || [])) siteCount.set(s, (siteCount.get(s) || 0) + 1);
  const cd = summarizeCronDiff(entries);
  const pyValue = okE.filter((e) => (e.pyChanges || []).some((c) => c.kind === 'value'));
  const pyValueCells = okE.reduce((n, e) => n + (e.pyChanges || []).filter((c) => c.kind === 'value').length, 0);
  const pyFormCells = okE.reduce((n, e) => n + (e.pyChanges || []).filter((c) => c.kind === 'form').length, 0);
  const vd = cd.valueDiff || [];
  return [
    '---',
    '',
    '## สรุปสุดท้าย — Task 14 (ระยะ 2 ส่วน E · ย้ายคลังครบ)',
    '',
    '> สร้างจาก entries ของสำมะโนโดย `renderCensusMd` เอง — รัน `--census` ซ้ำได้บล็อกเดิมทุกครั้ง',
    '> (เดิมเป็นสคริปต์ one-off ที่ต่อท้ายไฟล์ด้วยมือ แล้วหายทุกครั้งที่ migrator เขียน .md ใหม่)',
    '',
    '| ผล | ใบ |', '|---|---|',
    `| ย้ายเป็น v2 | **${okE.length}/${entries.length}** |`,
    `| residue (คง v1) | **${res.length}** = migrator ${res.length - cronRes.length} + cron-diff ${cronRes.length} |`,
    `| แบตช์ที่บันทึก | ${[...byBatch.entries()].sort((a, b) => (parseInt(a[0], 10) || 0) - (parseInt(b[0], 10) || 0)).map(([k, v]) => `${k}:${v}`).join(' · ')} |`,
    '',
    '### residue ต่อชนิด (รายชื่อครบ — input ระยะ 3)',
    '',
    '| ชนิด | ใบ | รายชื่อ |', '|---|---|---|',
    byReason.size ? [...byReason.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([k, v]) => `| ${k} | ${v.length} | ${v.slice().sort().join(' ')} |`).join('\n') : '| — | 0 | |',
    '',
    `<details><summary>เหตุผล residue เต็มรายใบ (${res.length})</summary>`, '',
    '| ใบ | เหตุผล |', '|---|---|',
    res.slice().sort((a, b) => a.sym.localeCompare(b.sym)).map((e) => `| ${e.sym} | ${String(e.reason || '').replace(/\|/g, '\\|')} |`).join('\n') || '| — | — |',
    '', '</details>', '',
    '### site ที่คง literal ต่อชนิด (เฉพาะใบที่ย้าย · รวมทุกเหตุผลย่อย — เหตุผลย่อยดูตาราง "site ที่คง literal" ด้านบน ซึ่งนับรวมใบ residue ด้วย)',
    '',
    '| site | ใบ |', '|---|---|',
    [...siteCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => `| ${k} | ${v} |`).join('\n') || '| — | 0 |',
    '',
    '### การเปิดเผย (ใบที่ย้าย)',
    '',
    '| หมวด | ใบ | หมายเหตุ |', '|---|---|---|',
    // ★ แถวที่มาจาก --cron-diff มีได้ก็ต่อเมื่อรัน --cron-diff จริง (ไม่งั้น .md จะพูดถึงสิ่งที่ไม่เคยตรวจ)
    ...(cd.checked ? [
      `| cron differential: ตรวจ / ผ่าน / ตก | ${cd.checked} / ${cd.pass} / ${cd.fail.length} | ตก = ${cd.fail.join(' ') || '—'} (ไม่เขียน · รายละเอียดในหัวข้อด้านบน) |`,
      `| ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ) | ${vd.length} | มากสุด ${(cd.valueDiffMaxPct || 0).toFixed(2)}% · ${vd.map((x) => x.sym).join(' ')} |`,
      `| รูปทศนิยมหมวด 6 เปลี่ยน (เช่น 3.5→3) | ${cd.sec6Form.length} | รอเจ้าของตัดสินว่าเป็นรูปหรือค่า (นโยบายปัด fmtMos เดียว) · รายชื่อด้านล่าง |`,
    ] : []),
    `| %/ปี หมวด 6 ค่าขยับ (v2 คิด %/ปี จาก "รวม" ที่ปัดแล้ว) | ${pyValue.length} | ${pyValueCells} คอลัมน์ · รูปอย่างเดียว ${pyFormCells} คอลัมน์ · รายใบอยู่ในหัวข้อ %/ปี ด้านบน |`,
    ...(cd.checked ? [
      `| รูปตัวเลขอื่น (ราคา/หน่วยเงิน/ศักราช) | ${cd.otherForm.length} | |`,
      `| สีช่อง .ret ของ v1 ค้าง — v2 คิดสีตามเครื่องหมาย | ${cd.retClass.length} | |`,
    ] : []),
    '',
    ...(cd.sec6Form.length ? [`<details><summary>รูปทศนิยมหมวด 6 เปลี่ยน — ${cd.sec6Form.length} ใบ</summary>`, '',
      cd.sec6Form.map((x) => x.sym).join(' '), '', '</details>', ''] : []),
  ];
}
// ส่วน cron differential ของ census.md — แสดงเฉพาะเมื่อมีใบที่รันด้วย --cron-diff · รายชื่อ **ครบทุกตัว** (เจ้าของต้องตัดสินรายใบ)
function cronDiffMd(cd) {
  if (!cd.checked) return [];
  const kinds = Object.entries(cd.failByKind).sort((a, b) => b[1].length - a[1].length);
  return [
    `## cron differential v1 ↔ v2 (\`--cron-diff\` · grid ราคา ×${CRON_GRID[0]}–×${CRON_GRID[CRON_GRID.length - 1]} ทีละ 0.005 · ${CRON_GRID.length} จุด)`,
    '',
    'เทียบผล `patchReport` ของ v1 ต้นฉบับกับ v2 ที่ราคา/วันที่เดียวกัน: stock-meta (price/mos/upside/fairValue/pe/dividendYield) ·',
    'ตัวเลขที่มองเห็น · error/warning ของ gate — ใบที่ต่างนอกเหนือ "รูป" = residue (ไม่เขียน)',
    '',
    '| ผล | ใบ |', '|---|---|', `| ตรวจ | ${cd.checked} |`, `| ผ่าน | ${cd.pass} |`, `| ตก (ไม่เขียน) | ${cd.fail.length} |`, `| ผ่านแต่ต่างแค่รูป | ${cd.formOnly.length} |`,
    '',
    '### ตกตามชนิด', '', '| ชนิด | ใบ | รายชื่อ |', '|---|---|---|',
    kinds.length ? kinds.map(([k, v]) => `| ${k} | ${v.length} | ${v.join(' ')} |`).join('\n') : '| — | 0 | |',
    '',
    '### ต่างแค่รูป (เขียนได้ · เปิดเผยให้เจ้าของตัดสิน)', '', '| ชนิด | ใบ | รายชื่อ |', '|---|---|---|',
    `| รูปทศนิยมหมวด 6 เปลี่ยน (เช่น 3.5→3) | ${cd.sec6Form.length} | ${cd.sec6Form.map((x) => x.sym).join(' ')} |`,
    `| รูปตัวเลขอื่น (เช่น ราคา 278→277.58 · หน่วย ล้านล้าน→แสนล้าน · ศักราช) | ${cd.otherForm.length} | ${cd.otherForm.join(' ')} |`,
    `| สีช่อง .ret ของ v1 ค้าง — v2 คิดสีตามเครื่องหมาย | ${cd.retClass.length} | ${cd.retClass.join(' ')} |`,
    '',
    // fix1 R1: หมวดแยกจาก "ต่างแค่รูป" — ค่าที่คนเห็นต่างกันจริง (เล็กน้อย) มาตั้งแต่ก่อน patch และ cron ไม่แตะ
    '### ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ)', '',
    `เกณฑ์: ห่างไม่เกิน GAP_REL ${(GAP_REL * 100).toFixed(1)}% (ชั้น 1 ของ migrator) · cron ไม่แตะทั้งสองฝั่ง · มากสุดที่พบ ${(cd.valueDiffMaxPct || 0).toFixed(2)}%`,
    '', '| ชนิด | ใบ | มากสุด | รายชื่อ |', '|---|---|---|---|',
    `| ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ) | ${(cd.valueDiff || []).length} | ${(cd.valueDiffMaxPct || 0).toFixed(2)}% | ${(cd.valueDiff || []).map((x) => x.sym).join(' ')} |`,
    '',
    ...(cd.valueDiff || []).map((x) => `- ${x.sym}: ` + x.pairs.map((p) => `«${p.label}» ${p.v1} → ${p.v2} (${p.relPct}%)`).join(' · ')),
    ...((cd.valueDiff || []).length ? [''] : []),
    '### ใบที่ผ่านโดยใช้ข้อยกเว้นของตัวเทียบ (ไม่เปลี่ยนผลตัดสิน — เปิดเผยให้ตรวจ)', '', '| ข้อยกเว้น | ใบ | รายชื่อ |', '|---|---|---|',
    `| ผลต่างที่มีก่อน patch — รูปหรือค่า (≤ GAP_REL · ค่าต่างรายใบอยู่ในหมวดด้านบน) | ${cd.relaxFiles.static.length} | ${cd.relaxFiles.static.join(' ')} |`,
    `| %/ปี ต่างตามรูปของ "รวม" (ทั้งสองฝั่ง = f(รวมที่โชว์)) | ${cd.relaxFiles.pyForm.length} | ${cd.relaxFiles.pyForm.join(' ')} |`,
    `| วงเล็บทวนวันที่ล้วน (migrator ลบ · f11) | ${cd.relaxFiles.restate.length} | ${cd.relaxFiles.restate.join(' ')} |`,
    `| หน่วยใหญ่ของเงินต่างกัน ค่าเดียวกัน | ${cd.relaxFiles.scale.length} | ${cd.relaxFiles.scale.join(' ')} |`,
    `| ปีคนละศักราช (2569 ↔ 2026) | ${cd.relaxFiles.era.length} | ${cd.relaxFiles.era.join(' ')} |`,
    '',
    ...(cd.fail.length ? ['### รายละเอียดใบที่ตก (ตัวคูณแรกที่ต่าง · ฝั่งที่ไม่นิ่ง)', '',
      'v1-unstable = ผลของ v1 เปลี่ยนชนิด/ฐานระหว่างจุด grid ติดกันขณะ v2 นิ่ง — ไม่ใช่คำตัดสินว่าฝั่งไหนถูก', '',
      ...cd.failDetail.map((x) => `- ${x.sym} — \`${x.reason}\` · side ${x.side} (${x.sideWhy}) · ${x.detail}`), ''] : []),
    ...(cd.sec6Form.length ? ['<details><summary>ตัวอย่างรูปทศนิยมหมวด 6 ต่อใบ (v1 → v2 ที่ตัวคูณแรกที่พบ)</summary>', '', ...cd.sec6Form.map((x) => `- ${x.sym}: ${x.example}`), '', '</details>', ''] : []),
  ];
}

// รวมเหตุผลชนิดเดียวกันเป็นแถวเดียว — ตัดตัวเลข/ชื่อช่องทิ้งก่อนนับ ("legend แสดง 53 แต่ FV = 56" กับ
// "legend แสดง 74 แต่ FV = 80" คือเหตุผลเดียวกัน) ไม่งั้นตารางกลายเป็นรายชื่อไฟล์ที่นับอะไรไม่ได้
// ★ fix1 R6: เหตุผลของ cron-diff (`cron-diff v1-unstable <kinds>`) ต้องโชว์ครบทุกตัวอักษรใน MD — ไม่ยุบ (ชนิดคือสาระ)
const shortReason = (r) => (/^cron-diff /.test(String(r || '')) ? String(r)
  : String(r || '').split(/[:(]/)[0].replace(/-?[0-9][0-9.,]*/g, 'N').trim().slice(0, 80));

// ── --fixture: แช่แข็ง v2 ของ fixture v1 (test/fixtures/<SYM>.html) — ไม่แตะ reports/ ไม่แตะ v1 fixture ──
// ★ migrator เขียนไฟล์เองแทนการ copy/แก้มือ (Task 9) — อ่านจาก test/fixtures/<SYM>.html เขียน `<SYM>-v2.html` ข้าง ๆ
// ★ all-or-nothing จริง (review F-อะตอมมิก): สร้างทุกตัวใน memory ก่อน เขียนไฟล์ก็ต่อเมื่อ **ทุกตัว** ผ่าน
//   เดิมเขียน AAPL-v2 เสร็จก่อนจะลองย้าย BBL — ถ้า BBL ตก ข้อความ "ไม่เขียนไฟล์ที่เหลือ" จะโกหก (AAPL-v2 เขียนไปแล้ว)
// ★ fix wave M10: รับรายชื่อ symbol ได้ (`--fixture DDOG SRE FTV DPZ CASY`) · ไม่ระบุ = AAPL BBL (คำสั่งเดิมให้ผลเดิมทุก byte)
//   ต้องเป็น symbol ที่ลงทะเบียนใน test/fixtures/index.js (SYMS) · "วันนี้" ต่อไฟล์จาก FX.TODAY_OF (ไม่มี = FX.TODAY)
function runFixture(argSyms) {
  const FX = require('../test/fixtures');
  const syms = argSyms && argSyms.length ? argSyms : ['AAPL', 'BBL'];
  const unknown = syms.filter((s) => !(FX.SYMS || []).includes(s) || typeof FX[s] !== 'function');
  if (unknown.length) { console.log(`✗ --fixture: ไม่รู้จัก ${unknown.join(', ')} — ลงทะเบียนใน test/fixtures/index.js (SYMS/TODAY_OF) + วาง <SYM>.html ก่อน`); return 1; }
  const results = syms.map((sym) => ({ sym, r: migrateOne(FX[sym](), sym + '.html', { today: (FX.TODAY_OF && FX.TODAY_OF[sym]) || FX.TODAY }) }));
  const bad = results.filter((x) => !x.r.ok);
  if (bad.length) {
    for (const { sym, r } of results) console.log(r.ok ? `✓ ${sym} (ยังไม่เขียน — all-or-nothing)` : `✗ ${sym}: ${r.reason}`);
    console.log(`\nfixture: ${results.length - bad.length}/${syms.length} — ไม่ครบ ไม่ได้เขียนไฟล์ไหนเลย (all-or-nothing)`);
    return 1;
  }
  for (const { sym, r } of results) {
    const outPath = FX.PATH[sym].replace(/\.html$/i, '-v2.html');
    fs.writeFileSync(outPath, r.out);
    console.log(`✓ ${sym} → ${path.basename(outPath)}`);
  }
  console.log(`\nfixture: ${syms.length}/${syms.length}`);
  return 0;
}

// ★ item 1 (review final): สำมะโนต้องทนต่อการรันซ้ำ — Part E รีทราย batch เดิมเป็นปกติ (แก้ไฟล์แล้วรันใหม่)
//   เดิม `prev.push(...)` ล้วน ๆ ⇒ แบตช์เดิมถูกนับซ้ำทุกครั้งที่รีรัน (วัดจริง: AEM ขึ้นสองครั้ง "รวม 948")
//   คีย์ด้วย symbol เสมอ (last write wins) — ไม่สนว่ามาจากแบตช์ไหน ⇒ "รวม" ใน .md สะท้อนไฟล์ที่ต่างกันจริงเท่านั้น
//   `batches` เป็นแค่ log การรัน (สำหรับ debug) จึงดีดูปทิ้งตาม batch number ซ้ำด้วยเหตุผลเดียวกัน
function mergeCensus(prevRaw, batch, entries, at) {
  // schema เดิม (ก่อน fix นี้) เป็นอาร์เรย์ของแบตช์ — ไม่มี consumer อื่นอ่านไฟล์นี้ (เช็คแล้ว) จึงเริ่มสะสมใหม่ได้ปลอดภัย
  const prev = prevRaw && !Array.isArray(prevRaw) ? prevRaw : { bySym: {}, batches: [] };
  const bySym = Object.assign({}, prev.bySym);
  // ★ fix1 R9: รันแบตช์ซ้ำหลัง --write — ใบที่เขียนไปแล้วถูก migrateOne ข้าม ("เป็น v2 แล้ว") ⇒ คงแถวเดิม (cronDiff/รูป/ค่าต่าง)
  //   ไม่งั้น last-write-wins ลบการเปิดเผยของใบที่ย้ายสำเร็จทิ้ง · ใบที่ไม่เคยมีแถวมาก่อนยังบันทึกตามปกติ
  for (const e of entries) {
    const old = bySym[e.sym];
    if (old && e.reason === ALREADY_V2 && old.reason !== ALREADY_V2) continue;
    bySym[e.sym] = Object.assign({}, e, { batch, at });
  }
  const batches = (prev.batches || []).filter((b) => b.batch !== batch);
  batches.push({ batch, at, syms: entries.map((e) => e.sym) });
  // สรุป cron differential คิดจาก bySym ทั้งก้อน (ไม่ใช่สะสมต่อแบตช์) ⇒ idempotent เหมือน bySym
  return { bySym, batches, cronDiff: summarizeCronDiff(Object.values(bySym)) };
}

function main(argv) {
  const write = argv.includes('--write');
  const cronFlag = argv.includes('--cron-diff');
  // ★ M1 (fix wave Task 14): `--write` เดี่ยว ๆ เขียนได้โดยไม่ผ่าน cron differential ⇒ ใบที่เคยถูกตัดสินเป็น residue
  //   ด้วย `cron-diff …` (BNY PTG THCOM WWD) จะถูกย้ายเงียบ ๆ ถ้ามีใครรันคำสั่งสั้น ๆ · ไม่มี flag ข้าม (ตั้งใจ)
  // ★ round 2 (review M2): ยามนี้ต้องอยู่ **เหนือ** สาขา --fixture ไม่งั้นประโยค "เขียนอะไรก็ต้องมี --cron-diff"
  //   เป็นจริงแค่บางเส้นทาง (วันนี้ --fixture เขียนแค่ test/fixtures/ จึงไม่อันตราย แต่ข้อความของยามต้องไม่โกหก)
  if (write && !cronFlag) {
    console.log('✗ --write ต้องมาคู่กับ --cron-diff เสมอ (cron differential เป็นยามชั้นสุดท้ายก่อนเขียน reports/) — ไม่มีตัวเลือกข้าม');
    return 1;
  }
  if (argv.includes('--fixture')) return runFixture(argv.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\.html$/i, '').toUpperCase()));
  const idx = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
  const batch = idx('--batch') != null ? parseInt(idx('--batch'), 10) : null;
  const size = idx('--size') != null ? parseInt(idx('--size'), 10) : null;
  const census = idx('--census');
  const syms = argv.filter((a) => !a.startsWith('--')).filter((a) => a !== idx('--batch') && a !== idx('--size') && a !== census)
    .map((a) => a.replace(/\.html$/i, '').toUpperCase());
  let files = fs.readdirSync(REPORTS_DIR).filter((f) => /\.html$/i.test(f)).sort();
  if (syms.length) files = files.filter((f) => syms.includes(f.replace(/\.html$/i, '').toUpperCase()));
  if (batch != null && size != null) files = files.slice(batch * size, (batch + 1) * size);
  const strict = argv.includes('--strict');
  const entries = [];
  let ok = 0, cdFail = 0, cdForm = 0;
  const errors = [];
  const t0 = Date.now();
  for (const f of files) {
    const p = path.join(REPORTS_DIR, f);
    const sym = f.replace(/\.html$/i, '');
    try {
      const src = fs.readFileSync(p, 'utf8');
      const r = migrateOne(src, f);
      // migrateOne จับ throw ข้างในเป็นเหตุผล "migrator ระเบิด" — เป็น residue ของ census แต่เป็น **ความผิดพลาด** ของการรัน (exit 1)
      if (!r.ok && /^migrator ระเบิด/.test(r.reason || '')) errors.push(`${sym}: ${r.reason}`);
      const cd = cronFlag && r.ok ? cronDiff(src, r.out, f) : null;
      const plan = planWrite(sym, r, cd);
      entries.push(plan.entry);
      if (cd && !cd.ok) cdFail++;
      if (cd && cd.ok && (cd.formParts || []).length) cdForm++;
      if (plan.write) {
        if (write) fs.writeFileSync(p, plan.out);
        ok++;
        console.log(`✓ ${sym} (tokenised ${r.sites.tokenised.length}${r.sites.literal.length ? ' · literal ' + r.sites.literal.length + ': ' + [...new Set(r.sites.literal)].join(',') : ''})${cd ? ` · cron-diff ผ่าน ${cd.compared}/${cd.points} จุด${cd.formParts.length ? ' · รูป ' + cd.formParts.join(',') : ''}${cd.valueDiff.length ? ' · ค่าต่างก่อน patch ' + cd.valueDiff.length : ''}` : ''}`);
      } else console.log(`✗ ${sym}: ${plan.entry.reason}${cd && !cd.ok ? ' — ' + (cd.detail[0] || '') : ''}`);
    } catch (e) {
      // throw ของ cronDiff / อ่านหรือเขียนไฟล์ไม่ได้ — ไม่เขียนใบนั้น (ถ้ายังไม่เขียน) · บันทึกลง census · exit 1
      errors.push(`${sym}: ${e.message}`);
      entries.push({ sym, ok: false, reason: 'ข้อผิดพลาดไม่คาดคิด: ' + e.message, tokenised: [], literal: [], notes: [], pyChanges: [] });
      console.log(`✗ ${sym}: ข้อผิดพลาดไม่คาดคิด — ${e.message}`);
    }
  }
  console.log(`\nรวม: ย้ายได้ ${ok}/${files.length}${write ? ' (เขียนแล้ว)' : ' (dry-run)'} · residue ${files.length - ok}`
    + (cronFlag ? ` · cron-diff ตก ${cdFail} (ไม่เขียน) · ต่างแค่รูป ${cdForm} · ${((Date.now() - t0) / 1000).toFixed(1)} วิ` : ''));
  if (census) {
    try {
      fs.mkdirSync(census, { recursive: true });
      const jf = path.join(census, 'migration-v2-census.json');
      const prevRaw = fs.existsSync(jf) ? JSON.parse(fs.readFileSync(jf, 'utf8')) : null;
      const merged = mergeCensus(prevRaw, batch == null ? null : batch, entries, new Date().toISOString());
      fs.writeFileSync(jf, JSON.stringify(merged, null, 1));
      fs.writeFileSync(path.join(census, 'migration-v2-census.md'), renderCensusMd(Object.values(merged.bySym)));
      console.log(`census → ${jf} (${Object.keys(merged.bySym).length} ใบสะสม — idempotent ต่อ symbol)`);
    } catch (e) { errors.push('census: ' + e.message); console.log(`✗ census เขียนไม่ได้ — ${e.message}`); }
  }
  if (errors.length) console.log(`\n⛔ ข้อผิดพลาดไม่คาดคิด ${errors.length}: ${errors.slice(0, 5).join(' | ')}`);
  return exitCode({ errors: errors.length, residue: files.length - ok, strict });
}
/**
 * exit code ของ CLI (fix1 R8) — residue ไม่ใช่ความล้มเหลว: ใบที่ตัดสินแล้วว่า "ไม่ย้าย" คือผลปกติที่ census บันทึก
 * ⇒ 0 เมื่อทุกใบถูกตัดสินครบ (ย้าย/residue) · 1 เฉพาะความผิดพลาดไม่คาดคิด (throw · เขียนไฟล์/census ไม่ได้)
 * ★ เดิมคืน 1 เมื่อมี residue ใบใดใบหนึ่ง ⇒ chain `migrate --write … && npm run build && preserve-dates && … verify` ของ Task 14
 *   หยุดทันทีหลังเขียน reports/ (ทุกแบตช์มี residue) · `--strict` = พฤติกรรมเดิม (residue ⇒ 1) สำหรับผู้เรียกที่ต้องการ
 */
function exitCode({ errors, residue, strict }) {
  if (errors) return 1;
  return strict && residue ? 1 : 0;
}

// ── ตัวค้นหา site (ระยะ 3 Task 2) ────────────────────────────────────────────
/** regex ของ site ที่ระยะ 3 Task 2 แก้ความแม่นยำ — เปิดให้เทสยิงตรง (เจ้าของยังเป็นไฟล์นี้ไฟล์เดียว)
 *  ★ `summary` ชี้ไปที่ `DV.SUMMARY_RE` ตัวจริง ไม่ใช่สำเนา — เทสจะได้ล้มเมื่อเจ้าของเปลี่ยน */
const SITE_RE = { legend: LEGEND_RE, mFair: MFAIR_RE, vcellFv: VCELL_FV_RE, vcellFvRange: VCELL_FV_RANGE_RE, vcellTgt: VCELL_TGT_RE, get summary() { return DV.SUMMARY_RE; } };
/** จำนวน/ผลการ match ของ site หนึ่งใน html — **ทางเดียวกับที่ `Tok.sub` ใช้** (glob เดิม) ไม่ใช่สำเนาตรรกะ
 *  กติกาของ migrator คือ "ทุก site ต้อง match ครั้งเดียวพอดี" ⇒ เทสอ่าน `.length` ตัวนี้ได้ตรง ๆ */
function siteHits(html, site) {
  const re = SITE_RE[site];
  if (!re) throw new Error(`ไม่รู้จัก site ${site}`);
  return [...String(html).matchAll(glob(re))];
}

module.exports = {
  SITE_RE, siteHits,
  migrateOne, extractValues, tokenise, buildRd, verifyPair, checkStripped, sameMoney, scnPyDiffs, scnPyCountGuard, pyCell, main, noteTailOf, tailHitsOtherSite, HINT_NOTE_TAIL_RE,
  cronDiff, cronGate, CRON_GRID, CRON_META_KEYS, sameMetaForm, cronDateParts, visibleCronDiff, pyExplained, planWrite, summarizeCronDiff, unitForm,
  failSide, cronDiffReason, exitCode, ALREADY_V2,
  COPY_FIELDS, REQUIRED_SITES, TOLERANCE, GAP_REL, renderCensusMd, mergeCensus,
};
if (require.main === module) process.exit(main(process.argv.slice(2)));
