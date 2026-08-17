#!/usr/bin/env node
'use strict';

/**
 * check-reports.js — Quality gate สำหรับรายงานวิเคราะห์หุ้นใน reports/<SYMBOL>.html
 *
 * ตรวจ 3 มิติ:
 *   1) โครงสร้างครบ      — 8 section, กราฟ, gauge, เครื่องคิดเลข MOS, disclaimer, footer, title/h1
 *   2) ตัวเลขสอดคล้องกัน — ค่า FV ใน JS = FV ในกล่อง, MOS = (FV−ราคา)/FV, scenario EPS×P/E = target
 *   3) ไม่มีของค้าง       — placeholder [SYMBOL]/${...}, "undefined"/"NaN", สกุลเงินปน
 *
 * ใช้งาน:
 *   node test/check-reports.js              # ตรวจทุกไฟล์ใน reports/
 *   node test/check-reports.js BBL KBANK    # ตรวจเฉพาะบางตัว
 *
 * exit code: 0 = ผ่าน (อาจมี warning), 1 = มี error → ห้าม push
 * ไม่มี dependency ภายนอก (Node ≥ 18). รันอัตโนมัติก่อน push ผ่าน .githooks/pre-push
 */

const fs = require('fs');
const path = require('path');
// expandReport: ขยายรายงานแบบ template (content-only) ให้เป็น HTML เต็มก่อนตรวจ — ไฟล์เก่า (ไม่มี marker) = identity
// (require build.js ได้ exports เฉย ๆ ไม่รัน build เพราะ guard `if (require.main !== module) return;`)
const { expandReport, THEME_DEFAULTS, deriveTheme } = require('../build.js');
// โมดูล contrast กลางชุดเดียวกับตัวสร้างธีม/ตัวซ่อม — E38 ต้องคิดเลขตรงกับ tools/fix-contrast.js เป๊ะ ไม่งั้นเถียงกันที่ขอบเกณฑ์
const bt = require('../tools/brandtheme.js');
// "วันที่ราคา" อยู่ตรงไหนในหัวรายงาน = ความรู้ก้อนเดียวกับที่ cron ใช้เขียน — อย่าทำสำเนา
const { parsePriceDate, THAI_MONTHS } = require('../tools/price-date.js');
const { mosBand } = require('../tools/update-prices.js'); // โซน verdict (bad/ok/good) — นิยามเดียวกับที่ cron ใช้ sync class
const { resolveColor } = require('../tools/fix-contrast.js');
const TAG = require('../tools/tag-lib.js');
// โหลดครั้งเดียวต่อ process — self-test จะฉีดของปลอมผ่าน opts.tagData แทน
let _tagCache = null;
function tagDefaults() {
  if (!_tagCache) {
    try { _tagCache = { tagData: TAG.loadTags(), vocab: TAG.loadVocab() }; }
    catch { _tagCache = { tagData: null, vocab: null }; }
  }
  return _tagCache;
}

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const TOL_MOS_PP = 2.0;   // MOS แสดง vs คำนวณ — ต่างได้ ≤ 2 จุด %
const TOL_FV_REL = 0.01;  // FV ใน JS vs ในกล่อง — ต่างได้ ≤ 1%
const TOL_SCN_REL = 0.07; // scenario EPS×P/E vs target — ต่างได้ ≤ 7%
const TOL_CHG_PP = 12;    // ป้าย % รอบปี (header) vs ผลตอบแทนปลายกราฟ — ต่างได้ ≤ 12 จุด % (E36)
// ตัวเลขในช่อง "ส่วนต่างจากราคา" vs MOS ที่คำนวณสด — ต่างได้ ≤ 3 จุด % (W06)
// ★ ต้นเหตุแก้แล้ว 17 ส.ค. 2569: `update-prices.js` sync ตัวเลขในช่องนี้ให้ตรง MOS ทุกครั้งที่ patch ราคา
//   (แทนเฉพาะตัวเลข ไม่แตะคำบอกทิศ — ทิศขัดกัน = เรื่องเนื้อหา ปล่อยให้ check ตัวนี้เตือนให้คนแก้)
// ⇒ เกณฑ์นี้จึงเหลือหน้าที่คุมแค่ "ข้อความที่คนเขียนเองระหว่างรอบ cron" ไม่ใช่ดริฟต์สะสมอีกต่อไป
//   คงไว้ที่ 3 = dead-band ±3 จุดของ cron (CLAUDE.md §9) — ค่าเดียวที่มีที่มา ไม่ต้องหลวมกว่านี้เพราะดริฟต์สะสมไม่มีแล้ว
const TOL_MOS_SUMMARY_PP = 3;

// ---------- helpers ----------
const stripCode = (h) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
const stripTags = (h) => String(h).replace(/<[^>]+>/g, ' ');
const visible = (h) => stripTags(stripCode(h));
const norm = (s) => String(s).replace(/−/g, '-'); // unicode minus → ascii

// การอ้างอิง "งวดงบ" ที่ W08 ยอมรับ — รวมทุกรูปแบบที่คลังรายงานใช้จริง (สำรวจ 908 ใบ 17 ส.ค. 69):
//   FY25 · FY26E · FY'68 · FY2025 · FY2568        → ปีงบ 2 หรือ 4 หลัก ทั้ง ค.ศ./พ.ศ.
//   FY พ.ย. 2568 · FY สิ้นสุด 30 ก.ย. 2568 · FYE 30 เม.ย. 2569 → ปีงบไม่ตรงปฏิทิน (ระบุเดือนสิ้นงวด)
//   Q1/2569 · 4Q/2568 · ไตรมาส                      → ระดับไตรมาส
// ⚠ ห้ามบีบเป็น `20\d\d` อีก — รายงานไทยเขียนปี พ.ศ. (เคส ADVICE/AAI) และ US เขียนย่อ 2 หลัก (เคส AME/ROP)
const TH_MONTH = 'ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.'
  + '|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม';
const FISCAL_REF_SRC = "FYE?\\s?'?\\d\\d(?:\\d\\d)?"                                        // FY25 / FY26E / FY2568
  + `|FYE?\\s*(?:สิ้นสุด|สิ้น|ปิด)?\\s*(?:\\d{1,2}\\s*)?(?:${TH_MONTH})\\s*(?:20|25)\\d\\d`  // FY สิ้นสุด 30 ก.ย. 2568
  + '|ไตรมาส|[1-4]Q\\s?/?\\s?(?:20|25)\\d\\d|Q[1-4]\\s?/?\\s?(?:20|25)\\d\\d';               // ไตรมาส / 4Q/2568 / Q1/2569
const FISCAL_REF = new RegExp(FISCAL_REF_SRC, 'i');

// บรรทัด "ที่มา:" ในหัวรายงาน ที่ W08 ใช้นับจำนวนแหล่งข้อมูล
// ⚠ คำคีย์ต้องเป็น "คำเต็ม" (\b) และต้องมี ":" จริง — เดิมใช้ /source/ ลอย ๆ + ":" ไม่บังคับ
//   เลยไปแมตช์กลางชื่อบริษัท (Ever·source· / Re·source·s / Cyber·source·) แล้วลากคำโปรยธุรกิจมานับเป็นแหล่ง:
//     · เตือนผิด — AR/CNQ/CPRT/EOG/ES/TRGP/V อ้าง 3–5 แหล่งจริง แต่ถูกฟ้องว่า "1 แหล่ง"
//     · เงียบผิด — COR/COST อ้างแค่ 2 แหล่ง แต่คำโปรยถูก "•" ตัดเป็น 3 ท่อน เลยผ่านฟรี
const SOURCE_LINE = /(?:ที่มา|แหล่งข้อมูล|แหล่งที่มา|อ้างอิง|ข้อมูลจาก|\bsources?\b)\s*[:：]\s*([^<\n][^\n]*)/i;
// ตัวคั่นรายชื่อแหล่ง — ต้องมี · (U+00B7) ด้วย เพราะรายงานไทยใช้จริง (CHG/ZEN) ไม่ใช่ • (U+2022) เสมอไป
const SOURCE_SEP = /\s*[\/,·•]\s*|\s+และ\s+/;
// ความยาวชื่อแหล่งที่ยอมรับ — เดิม 40 ตัวอักษร ตัดการอ้างอิงของจริงทิ้ง เพราะแหล่งปฐมภูมิชื่อยาวโดยธรรมชาติ
//   "Monster Beverage Q2 FY2026 Earnings Release (6 ส.ค. 2569)" = 57 · "Graco Q1 2026 Earnings Release (SEC EDGAR)" = 42
//   ⇒ GGG/MNST/TTW เขียนครบ 3 แหล่งแล้วแต่ถูกนับ 2 · สำรวจทั้งคลัง: ชิ้นที่ยาว >40 เป็นชื่อแหล่งจริงทุกชิ้น (IR/8-K/earnings)
// 80 คือจุดที่ผลนิ่ง (60/80/120 ให้ผลเท่ากัน) — ยังกันคำโปรย/ย่อหน้าที่หลุดมาทั้งก้อนอยู่
const SOURCE_MAX_LEN = 80;

function firstNum(s) {
  if (s == null) return null;
  const t = norm(stripTags(String(s))).replace(/[฿$,]/g, '');
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function grab(re, h) { const m = String(h).match(re); return m ? m[1] : null; }

function parseScenarios(html) {
  const parts = html.split(/<div class="col\s+(?:bear|base|bull)"/);
  const cols = [];
  for (let i = 1; i < parts.length && cols.length < 3; i++) {
    const seg = parts[i];
    cols.push({
      tgt: firstNum(grab(/<div class="tgt">([\s\S]*?)<\/div>/, seg)),
      eps: firstNum(grab(/EPS ปี 3<\/span>\s*<span>([\s\S]*?)<\/span>/, seg)),
      pe: firstNum(grab(/P\/E ออก<\/span>\s*<span>([\s\S]*?)<\/span>/, seg)),
      g: firstNum(grab(/EPS\s*([+\-−]?[0-9.]+)\s*%\s*\/\s*ปี/, norm(seg))),
      ret: firstNum(grab(/class="ret[^"]*">([\s\S]*?)<\/div>/, seg)),
    });
  }
  return cols;
}

// แต่ละวิธีประเมินมูลค่า (.vmethod) → { name, desc, val }
function parseMethods(html) {
  return html.split('<div class="vmethod">').slice(1).map((seg) => ({
    name: stripTags(grab(/class="mname">([\s\S]*?)<\/div>/, seg) || '').replace(/\s+/g, ' ').trim(),
    desc: norm(stripTags(grab(/class="mdesc">([\s\S]*?)<\/div>/, seg) || '')).replace(/\s+/g, ' ').trim(),
    val: firstNum(grab(/class="mval">([\s\S]*?)<\/div>/, seg)),
  }));
}

// ── W14: recompute การ์ดวิธี valuation ที่ E21/E22 ไม่ครอบ (P/FCF · DDM · EV/EBITDA) จากสูตรใน mdesc ──
// หลักเดียวกับ E21: **เงียบเมื่อ parse ไม่ได้** (สูตรไม่ครบ / หน่วยกำกวม / sum-of-parts) — ตรวจเฉพาะที่ recompute ได้แน่
// dry-run ทั้งคลัง 17 ส.ค. 69: parse ได้ 183 การ์ด ฟ้อง 4 (NNN CHG FSLR FANG) ยืนยันด้วยมือว่าเลขผิดจริงทั้ง 4 · false positive 0
// ตั้งใจข้าม DCF (หลาย stage recompute จาก desc ไม่ได้) และ Analyst target (ไม่มีสูตร) — ดู docs/quality-gate.md
const V_NUM = '([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)';
const V_UNIT = '(พันล้าน|ล้าน|B|M|bn|mn)';
const vNum = (s) => (s == null ? null : parseFloat(String(s).replace(/,/g, '')));
const vPct = (s) => { const v = vNum(s); return v == null ? null : v > 1 ? v / 100 : v; };
const vToM = (s, u) => { const v = vNum(s); return v == null ? null : /พันล้าน|B|bn/i.test(u || '') ? v * 1000 : v; }; // normalize เป็น "ล้าน"
// P/FCF · FCF Yield: "<เงิน>/หุ้น × <n>x" — ตัวตั้งกับตัวคูณต้องอยู่ติดกัน · สูตร ÷ yield% เป็นคนละสูตร ข้าม
function calcPFCF(desc) {
  if (/yield/i.test(desc) && /[÷/]\s*(?:FCF\s*)?(?:yield)?[^%]{0,20}[0-9.]+\s*%/i.test(desc)) return null;
  if (!/(?:FCF|กระแสเงินสด)\s*(?:\/|ต่อ)\s*(?:share|หุ้น)|[$฿]\s*[0-9.,]+\s*(?:\/|ต่อ)\s*(?:share|หุ้น)/i.test(desc)) return null;
  const pair = desc.match(new RegExp('[$฿]?\\s*' + V_NUM + '\\s*(?:/|ต่อ)?\\s*(?:share|หุ้น)?\\s*(?:×|x)\\s*(?:P/FCF|ตัวคูณ)?[^0-9]{0,15}([0-9]{1,3}(?:\\.[0-9]+)?)\\s*x\\b', 'i'));
  return pair ? vNum(pair[1]) * vNum(pair[2]) : null;
}
// DDM: D₁ ÷ (r − g) — หา r/g ก่อน (ตัวที่ตามด้วย % และไม่อยู่ใน "(1+g)") แล้วหา D₁ 4 รูปแบบจากชัดสุดไปหลวมสุด
// ทดสอบกับรูปแบบจริงจากคลัง 8 แบบ (scratchpad/ddm-parser.js): "× (1+g)" · "× (1+6%)" · "× 1.06" · "D₀ → D₁ = … = $Y" · "D₁ = $X (…)"
function calcDDM(desc) {
  const findRate = (k) => {
    const re = new RegExp('(?:^|[;,·•(\\s])' + k + '\\s*(?:=|:|≈|~)?\\s*' + V_NUM + '\\s*%', 'ig');
    let m, last = null; while ((m = re.exec(desc))) { last = m; }
    return last ? vPct(vNum(last[1])) : null;
  };
  const R = findRate('r'), G = findRate('g');
  if (R == null || G == null || R <= G) return null;
  if (/CAD\s*USD|USD\s*\/\s*CAD|×\s*0\.7[0-9]|แปลง(?:เป็น|กลับ)/i.test(desc)) return null;   // สูตรมีการแปลงสกุลเงินหลังคำนวณ (TRP/PBA/FTS) — recompute เทียบ mval ไม่ได้
  let d1 = null, m;
  // "D₁ = [คำอธิบาย (อาจมีวงเล็บที่มีตัวเลข เช่น "(normalized 30% payout)")] $X" — ข้ามวงเล็บทั้งก้อนก่อนคว้าตัวเลข
  // ★ D₁ ต้องเป็นตัวเลขที่มี "สกุลเงิน" นำหน้า ($ ฿ C$ CAD) — กันคว้าเลขจากคำบรรยาย ("ปันผลเฉลี่ย 5 ปี" → 5 · "90% ของ EPS" → 90)
  //   ถ้ามีสูตรย่อยหลายชั้น ("90% ของ EPS ฿0.39 = ฿0.351") ให้เอาตัวที่ตามหลัง "=" ท้ายสุดก่อนเครื่องหมายคั่น
  //   และนิพจน์ D₁ จบที่ ";" หรือ "→" ตัวแรก — ตัด desc ให้เหลือแค่ช่วงนั้นก่อน (กันไปคว้าเลขจาก "→ FV = …" ท้ายประโยค)
  const d1seg = (desc.match(/D[₁1]\s*(?:=|:|≈|~)[^;→]*/i) || [''])[0];
  const D1 = 'D[₁1]\\s*(?:=|:|≈|~)(?:.*?=\\s*)?.*?(?:[$฿]|C\\$|CAD\\s*)\\s*' + V_NUM;
  if ((m = d1seg.match(new RegExp(D1 + '\\s*(?:×|x|\\*)\\s*\\(\\s*1\\s*\\+\\s*g\\s*\\)', 'i')))) d1 = vNum(m[1]) * (1 + G);                       // × (1+g) เชิงสัญลักษณ์
  else if ((m = d1seg.match(new RegExp(D1 + '\\s*(?:×|x|\\*)\\s*\\(?\\s*(?:1\\s*\\+\\s*)?((?!1(?![.0-9]))[0-9]+(?:\\.[0-9]+)?)\\s*(%)?\\s*\\)?', 'i')))) {
    const f = vNum(m[2]); d1 = vNum(m[1]) * (m[3] ? 1 + f / 100 : f >= 1 ? f : 1 + f);                                                          // × (1+6%) · × 1.06 · × (1+0.06)
  }
  else if ((m = desc.match(new RegExp('D[₁1]\\s*=\\s*D[₀0]\\s*(?:×|x)\\s*\\(1\\+g\\)\\s*=\\s*[$฿]?\\s*' + V_NUM + '\\s*(?:×|x)\\s*' + V_NUM + '\\s*=\\s*[$฿]?\\s*' + V_NUM, 'i')))) d1 = vNum(m[3]);  // D₀→D₁ = X×1.055 = Y
  else if ((m = d1seg.match(new RegExp(D1 + '(?!\\s*(?:×|x|\\*))', 'i')))) d1 = vNum(m[1]);                                                       // D₁ = X ตรง ๆ
  return d1 == null ? null : d1 / (R - G);
}
// EV/EBITDA: EBITDA <เงิน+หน่วย> × <n>x [− หนี้ | + เงินสด <เงิน+หน่วย>] ÷ <หุ้น> · sum-of-parts / วงเล็บกำกวม → เงียบ
function calcEVEB(desc) {
  if ((desc.match(/EBITDA/gi) || []).length >= 2 && /\+/.test(desc)) return null;
  if ((desc.match(/\/\s*(?:share|หุ้น)/gi) || []).length >= 2) return null;
  if (/[×x]\s*[0-9.]+x?[^÷/]*\+[^÷/]*[×x]\s*[0-9.]+/i.test(desc)) return null;
  if (new RegExp('EBITDA[^×x(]{0,40}[$฿]?\\s*' + V_NUM + '\\s*' + V_UNIT + '\\s*\\([^)]*[$฿]?\\s*[0-9]', 'i').test(desc)) return null;
  const eb = desc.match(new RegExp('EBITDA[^×x]{0,60}?[$฿]?\\s*' + V_NUM + '\\s*' + V_UNIT + '\\s*(?:\\([^)]*\\))?\\s*(?:×|x)\\s*(?:EV/EBITDA\\s*)?' + V_NUM + '\\s*x?', 'i'));
  if (!eb) return null;
  let ev = vToM(eb[1], eb[2]) * vNum(eb[3]);
  const after = desc.slice(eb.index + eb[0].length);
  const adj = after.match(new RegExp('^(?:(?!÷|/\\s*[0-9]).)*?(−|-|\\+|หัก|บวก)\\s*(Net\\s*Debt|Net\\s*Financial\\s*Debt|หนี้สินสุทธิ|หนี้สุทธิ|เงินสดสุทธิ|Net\\s*Cash)[^0-9$฿]{0,12}[$฿]?\\s*' + V_NUM + '\\s*' + V_UNIT, 'i'));
  if (adj) { const isCash = /เงินสด|Cash/i.test(adj[2]); const plus = /\+|บวก/.test(adj[1]); ev += (isCash || plus ? 1 : -1) * vToM(adj[3], adj[4]); }
  else if (/Net\s*Debt|หนี้|เงินสด|Cash/i.test(after.split(/÷|\/\s*[0-9]/)[0])) return null;
  const sh = after.match(new RegExp('[÷/]\\s*' + V_NUM + '\\s*' + V_UNIT + '?\\s*(?:หุ้น|shares?)', 'i'));
  if (!sh) return null;
  const S = sh[2] ? vToM(sh[1], sh[2]) : vNum(sh[1]);
  return S ? ev / S : null;
}
const W14_FAMILIES = [
  { label: 'P/FCF', name: /P\/FCF|FCF\s*Yield/i, calc: calcPFCF, tol: 0.03 },
  { label: 'DDM', name: /DDM|Gordon/i, calc: calcDDM, tol: 0.05 },        // (r−g) เล็ก ปัดเศษทบ → 5%
  { label: 'EV/EBITDA', name: /EV\s*\/\s*EBITDA/i, calc: calcEVEB, tol: 0.05 }, // 4 term ปัดเศษทบ → 5%
];

// แปลง "ราคา ณ <วัน[–วัน]> <เดือนไทย> <ปี ค.ศ./พ.ศ.>" → อายุเป็นวันเทียบ "วันนี้"
// ช่วงวัน (เช่น 14–18 มิ.ย.) ใช้ "วันท้าย" (ราคาที่สดสุด). พ.ศ.→ค.ศ. อัตโนมัติ.
//
// ★ ตัวหา token อยู่ที่ tools/price-date.js ที่เดียว ใช้ร่วมกับตัวเขียน (update-prices.patchReport)
//   เดิมที่นี่หาเอง ด้วยกฎ "token สุดท้ายใน 140 ตัวอักษรหลังคำว่า ราคา" ⇒ หัวรายงานที่มีวันที่
//   จุดสูงสุดตลอดกาล/วันประกาศงบต่อท้าย จะอ่านโดนวันที่นั้นแทนวันที่ราคา (INTC/AMKR/ADVICE/RKLB)
//   — บังเอิญไม่ฟ้องเพราะตัวเขียนก็ประทับวันที่รันทับทุก token เหมือนกัน (บั๊กสองฝั่งหักล้างกัน)
function parsePriceAge(header) {
  const d = parsePriceDate(header);
  if (!d) return null;
  const now = process.env.STALE_TODAY ? Date.parse(process.env.STALE_TODAY) : Date.now();
  const dt = Date.UTC(d.yearCE, d.monIdx, d.day);
  return { iso: d.iso, ageDays: Math.round((now - dt) / 86400000) };
}

// ดึง key metric (ค่าในการ์ด .metric) ตามชื่อ label
function metricNum(html, labelRe, opts) {
  const m = html.match(new RegExp(`<div class="k">[^<]*${labelRe}[^<]*</div>\\s*<div class="v[^"]*">([^<]*)<`));
  if (!m) return null;
  // การ์ดที่ค่าเป็น % (ปันผล/ROE) อาจเขียนจำนวนเงินนำหน้า เช่น "~$1.92 (~5.0%)" หรือ "$4.12 (~2.96%)"
  // firstNum จะคว้า 1.92 ไปเทียบกับ dividendYield (%) → W10 ยิงปลอม (เคส O/STZ/TAP 17 ส.ค. 69)
  // ⇒ ถ้าผู้เรียกบอกว่าค่าเป็น % ให้คว้าตัวเลขที่ "ตามด้วย %" ก่อน · ไม่มี % ค่อยถอยไป firstNum ตามเดิม
  if (opts && opts.pct) {
    const p = norm(m[1]).match(/(-?\d+(?:\.\d+)?)\s*%/);
    // ไม่มี % เลย = การ์ดนี้แสดง "จำนวนเงินต่อหุ้น" ไม่ใช่ yield (เช่น "เงินปันผล (รายปี) $3.25")
    // ⇒ ไม่ใช่ค่าที่ควรเอาไปเทียบกับ dividendYield → คืน null ให้ check ข้าม ไม่ใช่เดา firstNum
    return p ? parseFloat(p[1]) : null;
  }
  return firstNum(m[1]);
}

function buildCtx(html, name, opts) {
  const o = opts || {};
  const d = tagDefaults();
  const tagData = o.tagData !== undefined ? o.tagData : d.tagData;
  const vocab = o.vocab !== undefined ? o.vocab : d.vocab;
  const text = visible(html);
  const headerM = html.match(/<header[\s\S]*?<\/header>/i);
  const fvIdx = html.indexOf('class="fv-box"');
  return {
    html,
    name,
    symbol: name.replace(/\.html$/i, ''),
    tagData,
    vocab,
    text,
    header: headerM ? headerM[0] : '',
    aiModel: (() => { const m = html.match(/<meta\s+name=["']ai-model["']\s+content=["']([^"']*)["']/i); return m ? m[1].trim() : null; })(),
    // คำโปรยธุรกิจใต้ <h1> = <div class="sub"> — build.js ดึงไปเป็น desc โชว์บนการ์ดหน้า index (สรุปว่าบริษัททำธุรกิจอะไร)
    sub: (() => { const m = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<div[^>]*\bclass=["'][^"']*\bsub\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i); return m ? stripTags(m[1]).trim() : ''; })(),
    px: firstNum(grab(/<div class="px">([\s\S]*?)<\/div>/, html)),
    constFV: (() => { const m = html.match(/const\s+FV\s*=\s*([0-9]+(?:\.[0-9]+)?)/); return m ? parseFloat(m[1]) : null; })(),
    fvBox: fvIdx === -1 ? null : firstNum(grab(/class="r">([\s\S]*?)<\/div>/, html.slice(fvIdx))),
    mosBig: firstNum(grab(/class="big">([\s\S]*?)<\/div>/, html)),
    // สกุลเงินหลัก = สัญลักษณ์หน้าราคาใน header (.px) — ไม่ใช่แค่ "มี ฿ ที่ไหนสักแห่ง"
    // (กัน USD report ที่อ้างอิงค่าเงินบาทในข้อความ ไม่ให้ถูกตีว่าเป็นรายงานบาท)
    isTHB: (() => { const m = html.match(/<div class="px">\s*([฿$])/); return m ? m[1] === '฿' : (text.includes('฿') && !text.includes('$')); })(),
    scenarios: parseScenarios(html),
    methods: parseMethods(html),
    pxInput: firstNum(grab(/id="pxIn"[^>]*value="([^"]*)"/, html)),
    baseEPS: firstNum(grab(/EPS ฐาน\s*~?\s*[฿$]?\s*([0-9.]+)/, norm(html))),
    vgridFV: (() => { const i = html.indexOf('class="vgrid"'); if (i === -1) return null; return firstNum(grab(/มูลค่าเหมาะสม<\/div>\s*<div class="v">([\s\S]*?)<\/div>/, html.slice(i))); })(),
    scaleNums: (() => { const seg = grab(/<div class="scale">([\s\S]*?)<\/div>\s*<\/div>/, html); if (!seg) return []; return seg.split('<span').slice(1).map((s) => firstNum(s)).filter((v) => v != null); })(),
    priceAge: parsePriceAge(headerM ? headerM[0] : ''),
    metrics: {
      pe: metricNum(html, 'P/E \\(TTM\\)'),
      pbv: metricNum(html, 'P/BV'),
      yield: metricNum(html, 'เงินปันผล', { pct: true }),   // ค่าที่ต้องการคือ % ไม่ใช่จำนวนเงินต่อหุ้นที่อาจนำหน้า
      roe: (() => { const m = norm(html).match(/ROE[^<]*<\/div>\s*<div class="v[^"]*">\s*~?\s*([0-9.]+)\s*%/); return m ? parseFloat(m[1]) : null; })(),
    },
    // บล็อก stock-meta (JSON ตัวเลขสำหรับเรียง index) — present/ok/data ใช้โดย E29–31, W10
    sm: (() => {
      const m = html.match(/<script[^>]*\bid=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!m) return { present: false };
      try { return { present: true, ok: true, data: JSON.parse(m[1]) }; }
      catch (e) { return { present: true, ok: false, err: e.message }; }
    })(),
    // ป้าย change ใน header (.chg) — เช่น "▲ +72.1% (รอบปี)" / "▼ −5% (รอบปี)" (ทิศทาง + %) — ใช้โดย E34 (สี↔ทิศทาง), E35 (รูปแบบรอบปี), E36 (กราฟ↔headline)
    chg: (() => { const m = html.match(/<div class="chg"[^>]*>([\s\S]*?)<\/div>/i); return m ? stripTags(m[1]).replace(/\s+/g, ' ').trim() : null; })(),
    // บล็อก report-data (chart/gauge/theme ต่อหุ้น) — ใช้โดย E34 (theme.chgBg/chgColor), E36 (chart.data↔headline), E37 (≤13 จุด), W12 (label ว่าง)
    rd: (() => {
      const m = html.match(/<script[^>]*\bid=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!m) return { present: false };
      try { return { present: true, ok: true, data: JSON.parse(m[1]) }; }
      catch (e) { return { present: true, ok: false, err: e.message }; }
    })(),
  };
}

const SM_NUM_KEYS = ['price', 'fairValue', 'mos', 'upside', 'pe', 'dividendYield', 'roe']; // ต้องเป็นตัวเลข (price/fairValue/mos/upside) หรือตัวเลข|null (pe/yield/roe)
const SM_REQ_NUM = ['price', 'fairValue', 'mos', 'upside'];                                 // ต้องมีค่าเสมอ (คำนวณได้จากราคา/FV)
const isFiniteNum = (v) => typeof v === 'number' && isFinite(v);

// รูปแบบ label แกน x ของกราฟราคา (report-data.chart.data[i][0]) — ใช้โดย E39 (ลำดับเวลาต้องเดินหน้า)
// คนละที่กับ "วันที่ราคา" ใน header (price-date.js: เดือน+วัน+ปีเต็มในร้อยแก้ว, ต้อง anchor "ราคา") — ที่นี่ label สั้น ไม่มีวัน
// รู้จัก: เดือนไทยย่อ+ปี 2 หลัก ("ก.ค.25" — รูปแบบจริงที่ generator ใช้ทุกไฟล์วันนี้), เดือนอังกฤษย่อ+ปี 2 หลัก ("Jan '25"),
// ปีล้วน 4 หลัก (พ.ศ./ค.ศ. — แปลง พ.ศ.→ค.ศ. เกณฑ์เดียวกับ price-date.js: ≥2400 = พ.ศ.), ปีล้วน 2 หลัก มี ' นำหน้าได้ ("'68")
// คืน "key" ตัวเลขเทียบลำดับเวลาได้ (ปี×12+เดือน) — รูปแบบไม่รู้จัก = null ⇒ caller ต้องข้ามทั้งรายงาน ไม่เดา
const CHART_EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseChartLabelKey(label) {
  const s = String(label).trim();
  if (!s) return null;
  const thM = THAI_MONTHS.findIndex((m) => s.startsWith(m));
  if (thM >= 0) {
    const rest = s.slice(THAI_MONTHS[thM].length).trim().replace(/^'/, '');
    return /^\d{2}$/.test(rest) ? (2000 + parseInt(rest, 10)) * 12 + thM : null;
  }
  const en = s.match(/^([A-Za-z]{3})\s*'?(\d{2})$/);
  if (en) { const enM = CHART_EN_MONTHS.indexOf(en[1].toLowerCase()); if (enM >= 0) return (2000 + parseInt(en[2], 10)) * 12 + enM; }
  const y4 = s.match(/^(\d{4})$/);
  if (y4) { let y = parseInt(y4[1], 10); if (y >= 2400) y -= 543; return y * 12; }
  const y2 = s.match(/^'?(\d{2})$/);
  return y2 ? (2000 + parseInt(y2[1], 10)) * 12 : null;
}

// ---------- checks ----------
// level 'error' → block push ; level 'warn' → แจ้งเตือน ไม่ block
const CHECKS = [
  { id: 'E01', level: 'error', label: 'DOCTYPE html', fn: (c) => /^\s*<!doctype html>/i.test(c.html) ? null : 'ไม่มี <!DOCTYPE html> ที่ต้นไฟล์' },
  { id: 'E02', level: 'error', label: '<html lang="th">', fn: (c) => /<html[^>]*lang="th"/i.test(c.html) ? null : 'ไม่มี <html lang="th">' },
  { id: 'E03', level: 'error', label: 'ปิด </html>', fn: (c) => /<\/html>\s*$/i.test(c.html) ? null : 'ไฟล์ไม่จบด้วย </html>' },
  { id: 'E04', level: 'error', label: 'title มีชื่อย่อหุ้น', fn: (c) => { const t = grab(/<title>([\s\S]*?)<\/title>/i, c.html); if (!t || !t.trim()) return 'ไม่มี <title>'; return t.includes(c.symbol) ? null : `title ไม่มีชื่อย่อ "${c.symbol}"`; } },
  { id: 'E05', level: 'error', label: 'มี <h1>', fn: (c) => { const t = grab(/<h1[^>]*>([\s\S]*?)<\/h1>/i, c.html); return (t && stripTags(t).trim()) ? null : 'ไม่มี <h1> หรือว่างเปล่า'; } },
  { id: 'E06', level: 'error', label: 'ครบ 8 section', fn: (c) => { const miss = []; for (let n = 1; n <= 8; n++) if (!new RegExp(`<div[^>]*class="[^"]*\\bn\\b[^"]*"[^>]*>\\s*${n}\\s*</div>`).test(c.html)) miss.push(n); return miss.length ? `ขาด section: ${miss.join(', ')}` : null; } },
  { id: 'E07', level: 'error', label: 'กราฟราคา', fn: (c) => /id="priceChart"/.test(c.html) ? null : 'ไม่มีกราฟราคา (#priceChart)' },
  { id: 'E08', level: 'error', label: 'เครื่องคิดเลข MOS', fn: (c) => (/id="pxIn"/.test(c.html) && /id="mosOut"/.test(c.html) && c.constFV != null) ? null : 'เครื่องคิดเลข MOS ไม่ครบ (ต้องมี #pxIn, #mosOut, const FV=)' },
  { id: 'E09', level: 'error', label: 'gauge ราคา', fn: (c) => (/id="mCur"/.test(c.html) && /id="mFair"/.test(c.html)) ? null : 'ไม่มี gauge (#mCur/#mFair)' },
  { id: 'E10', level: 'error', label: 'disclaimer', fn: (c) => /ไม่ใช่คำแนะนำ/.test(c.html) ? null : 'ไม่มี disclaimer "ไม่ใช่คำแนะนำ..."' },
  { id: 'E11', level: 'error', label: 'footer', fn: (c) => /<footer/i.test(c.html) ? null : 'ไม่มี <footer>' },
  { id: 'E12', level: 'error', label: 'ราคา+วันที่+แหล่งที่มา (header)', fn: (c) => { if (c.px == null) return 'header ไม่มีราคา (.px)'; if (!/\b(?:20\d\d|25\d\d|26\d\d)\b/.test(c.header)) return 'header ไม่มีปีของวันที่ราคา'; if (!/(ที่มา|แหล่ง|อ้างอิง|ข้อมูลจาก|source|ref)/i.test(c.header)) return 'header ไม่ระบุแหล่งที่มา'; return null; } },
  // จับเฉพาะ token จริงของ template (ไม่จับ [NASDAQ]/[ADR]/[MSFT] ที่เป็นข้อความถูกต้อง)
  { id: 'E13', level: 'error', label: 'ไม่มี placeholder ค้าง', fn: (c) => { const hits = []; [/\[(?:SYMBOL|YEAR|MONTH|DAY|DATE|PRICE|COMPANY|NAME|SOURCE|TICKER|SECTOR)\]/, /\$\{\s*[A-Za-z_]/, /\{\{\s*\w+\s*\}\}/, /STOCK_DATA/, /_analysis\.html/, /\[ราคาปัจจุบัน\]/, /\[ชื่อบริษัท\]/, /\[แหล่งข้อมูล\]/, /\[วัน\/เดือน\/ปี\]/].forEach((re) => { const m = c.text.match(re); if (m) hits.push(m[0].trim()); }); return hits.length ? `พบ placeholder: ${[...new Set(hits)].join(' , ')}` : null; } },
  { id: 'E14', level: 'error', label: 'ไม่มี undefined/NaN', fn: (c) => { const h = []; if (/\bundefined\b/.test(c.text)) h.push('undefined'); if (/\bNaN\b/.test(c.text)) h.push('NaN'); return h.length ? `พบข้อความ ${h.join('/')} ในเนื้อหา (น่าจะ render พลาด)` : null; } },
  { id: 'E15', level: 'error', label: 'FV ใน JS = FV ในกล่อง', fn: (c) => { if (c.constFV == null || c.fvBox == null) return 'อ่านค่า FV ไม่ได้ (const FV หรือ .fv-box)'; const d = Math.abs(c.constFV - c.fvBox); return d <= Math.max(0.01, TOL_FV_REL * c.fvBox) ? null : `const FV=${c.constFV} ไม่ตรงกับ Fair Value ในกล่อง ${c.fvBox} (เครื่องคิดเลขจะคำนวณผิด)`; } },
  { id: 'E16', level: 'error', label: 'MOS = (FV−ราคา)/FV', fn: (c) => { const FV = c.fvBox != null ? c.fvBox : c.constFV; if (FV == null || c.px == null || c.mosBig == null) return 'อ่านค่า ราคา/FV/MOS ไม่ครบ'; const exp = (FV - c.px) / FV * 100; const d = Math.abs(exp - c.mosBig); return d <= TOL_MOS_PP ? null : `MOS แสดง ${c.mosBig}% แต่ (FV ${FV} − ราคา ${c.px})/FV = ${exp.toFixed(1)}% (ต่าง ${d.toFixed(1)} จุด %)`; } },
  { id: 'E17', level: 'error', label: '≥2 วิธีประเมินมูลค่า + Fair Value', fn: (c) => { const n = (c.html.match(/class="vmethod"/g) || []).length; if (n < 2) return `มีวิธีประเมินมูลค่าเพียง ${n} วิธี (ต้อง ≥ 2)`; if (c.fvBox == null) return 'ไม่มีกล่อง Fair Value (.fv-box)'; return null; } },
  { id: 'E18', level: 'error', label: 'จุดซื้อ MOS20/30 = FV×0.8 / ×0.7', fn: (c) => { if (c.fvBox == null) return null; const get = (pct) => firstNum(grab(new RegExp(`จุดซื้อ[^<]*${pct}\\s*%<\\/div>\\s*<div class="v[^"]*">([^<]*)<`), c.html)); const bad = []; [['MOS 20%', get(20), 0.8], ['MOS 30%', get(30), 0.7]].forEach(([lab, box, f]) => { if (box == null) { bad.push(`ไม่พบกล่องจุดซื้อ ${lab}`); return; } const exp = c.fvBox * f; if (Math.abs(box - exp) > Math.max(0.025 * exp, 0.01)) bad.push(`${lab} แสดง ${box} แต่ควร = FV ${c.fvBox}×${f} = ${exp.toFixed(2)}`); }); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E19', level: 'error', label: 'gauge marker ตรงกับ ราคา/FV', fn: (c) => { const cur = firstNum(grab(/getElementById\("mCur"\)\.style\.left\s*=\s*gpos\(([0-9.]+)\)/, c.html)); const fair = firstNum(grab(/getElementById\("mFair"\)\.style\.left\s*=\s*gpos\(([0-9.]+)\)/, c.html)); const bad = []; if (cur != null && c.px != null && Math.abs(cur - c.px) > Math.max(0.02 * c.px, 0.02)) bad.push(`marker ปัจจุบัน gpos(${cur}) ≠ ราคา ${c.px}`); if (fair != null && c.fvBox != null && Math.abs(fair - c.fvBox) > Math.max(0.02 * c.fvBox, 0.02)) bad.push(`marker เหมาะสม gpos(${fair}) ≠ Fair Value ${c.fvBox}`); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E20', level: 'error', label: 'Fair Value อยู่ในกรอบ low–high', fn: (c) => { if (c.fvBox == null) return null; const i = c.html.indexOf('class="fv-box"'); if (i === -1) return null; const m = c.html.slice(i, i + 700).match(/กรอบ\s*[฿$]?\s*([0-9.,]+)\s*[–\-]\s*[฿$]?\s*([0-9.,]+)/); if (!m) return null; const lo = firstNum(m[1]), hi = firstNum(m[2]); if (lo == null || hi == null) return null; if (lo > hi) return `กรอบ Fair Value สลับด้าน (${lo} > ${hi})`; if (c.fvBox < lo - 1e-9 || c.fvBox > hi + 1e-9) return `Fair Value ${c.fvBox} อยู่นอกกรอบ ${lo}–${hi}`; return null; } },

  { id: 'E21', level: 'error', label: 'วิธี P/E: ค่า = EPS × P/E ในคำอธิบาย', fn: (c) => { const m = c.methods.find((x) => /P\/E/i.test(x.name) && !/P\/BV/i.test(x.name)); if (!m || m.val == null) return null; const eps = firstNum(grab(/EPS[^0-9\-]*([0-9]+(?:\.[0-9]+)?)/i, m.desc)); const pe = firstNum(grab(/([0-9]+(?:\.[0-9]+)?)\s*x\b/i, m.desc)); if (eps == null || pe == null) return null; const exp = eps * pe; return Math.abs(exp - m.val) / m.val <= 0.03 ? null : `วิธี P/E แสดง ${m.val} แต่ EPS ${eps} × P/E ${pe} = ${exp.toFixed(2)}`; } },
  { id: 'E22', level: 'error', label: 'วิธี P/BV: ค่า = ratio × BVPS, ratio = (ROE−g)/(r−g)', fn: (c) => { const m = c.methods.find((x) => /P\/BV/i.test(x.name)); if (!m || m.val == null) return null; const ratio = firstNum(grab(/[≈=]\s*([0-9.]+)x?\s*[×x]\s*BVPS/, m.desc)); const bvps = firstNum(grab(/BVPS[^0-9]*([0-9]+(?:\.[0-9]+)?)/, m.desc)); if (ratio == null || bvps == null) return null; const bad = []; const exp = ratio * bvps; if (Math.abs(exp - m.val) / m.val > 0.03) bad.push(`แสดง ${m.val} แต่ ${ratio} × BVPS ${bvps} = ${exp.toFixed(2)}`); const roe = firstNum(grab(/ROE\s*([0-9.]+)\s*%/, m.desc)); const gg = firstNum(grab(/g\s*([0-9.]+)\s*%/, m.desc)); const rr = firstNum(grab(/r\s*([0-9.]+)\s*%/, m.desc)); if (roe != null && gg != null && rr != null && rr > gg) { const er = (roe - gg) / (rr - gg); if (Math.abs(er - ratio) > 0.05) bad.push(`ratio ${ratio} ≠ (ROE ${roe}−g ${gg})/(r ${rr}−g ${gg}) = ${er.toFixed(2)}`); } return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E23', level: 'error', label: 'ราคา header = ค่าตั้งต้นเครื่องคิดเลข', fn: (c) => { if (c.px == null || c.pxInput == null) return null; return Math.abs(c.px - c.pxInput) <= Math.max(0.02 * c.px, 0.02) ? null : `ราคา header ${c.px} ≠ ค่าเริ่มต้น input เครื่องคิดเลข ${c.pxInput} (ผู้ใช้จะเห็น MOS เริ่มต้นผิด)`; } },
  { id: 'E24', level: 'error', label: 'scenario: EPS ปี3 = EPS ฐาน×(1+g)³', fn: (c) => { if (c.baseEPS == null) return null; const nm = ['Bear', 'Base', 'Bull']; const bad = []; c.scenarios.forEach((s, i) => { if (s.eps == null || s.g == null) return; const exp = c.baseEPS * Math.pow(1 + s.g / 100, 3); if (Math.abs(exp - s.eps) / s.eps > 0.05) bad.push(`${nm[i] || i}: EPS ฐาน ${c.baseEPS}×(1+${s.g}%)³=${exp.toFixed(2)} ≠ EPS ปี3 ${s.eps}`); }); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E25', level: 'error', label: 'FV ในสรุป (verdict) = FV ในกล่อง', fn: (c) => { if (c.fvBox == null || c.vgridFV == null) return null; return Math.abs(c.vgridFV - c.fvBox) / c.fvBox <= 0.02 ? null : `สรุปแสดงมูลค่าเหมาะสม ${c.vgridFV} แต่กล่อง valuation = ${c.fvBox}`; } },
  { id: 'E26', level: 'error', label: 'gauge scale: เรียงขึ้น + MOS20/30 = FV×0.8/0.7', fn: (c) => { const bad = []; if (c.scaleNums.length >= 4) { const sorted = c.scaleNums.slice().sort((a, b) => a - b); if (c.scaleNums.join(',') !== sorted.join(',')) bad.push(`ป้าย scale ไม่เรียงน้อย→มาก: [${c.scaleNums.join(', ')}]`); } const FV = c.fvBox != null ? c.fvBox : c.constFV; if (FV != null) { const h = norm(c.html); const t20 = firstNum(grab(/([฿$]?[0-9.,]+)\s*<br>\s*<small>MOS 20%/, h)); const t30 = firstNum(grab(/([฿$]?[0-9.,]+)\s*<br>\s*<small>MOS 30%/, h)); if (t20 != null && Math.abs(t20 - FV * 0.8) > Math.max(0.025 * FV * 0.8, 0.01)) bad.push(`gauge MOS20% ${t20} ≠ FV×0.8 = ${(FV * 0.8).toFixed(2)}`); if (t30 != null && Math.abs(t30 - FV * 0.7) > Math.max(0.025 * FV * 0.7, 0.01)) bad.push(`gauge MOS30% ${t30} ≠ FV×0.7 = ${(FV * 0.7).toFixed(2)}`); } return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E27', level: 'error', label: 'ราคาไม่เก่า/ไม่อยู่อนาคต', fn: (c) => { if (!c.priceAge) return null; const a = c.priceAge.ageDays; const errDays = parseInt(process.env.STALE_ERROR_DAYS || '120', 10); if (a < -7) return `วันที่ราคา (${c.priceAge.iso}) อยู่ในอนาคต ${-a} วัน`; if (a > errDays) return `ราคาเก่าเกินไป: ${c.priceAge.iso} (${a} วันที่แล้ว > ${errDays} วัน)`; return null; } },
  // ระบุโมเดล AI ที่ใช้วิเคราะห์ (footer แสดงโมเดลต่อ report จาก tag นี้ — บังคับให้ทุก report ประกาศโมเดลที่รันจริง)
  { id: 'E28', level: 'error', label: 'ระบุโมเดล AI (meta ai-model)', fn: (c) => { if (c.aiModel == null) return 'ไม่มี <meta name="ai-model" content="..."> — ต้องประทับโมเดล AI ที่ใช้วิเคราะห์ (เช่น "Claude Opus 4.8")'; if (!c.aiModel) return 'meta ai-model ว่างเปล่า'; if (/\[|\$\{|MODEL_NAME|TODO|xxx/i.test(c.aiModel)) return `ค่า ai-model ยังเป็น placeholder: "${c.aiModel}"`; if (!/^Claude\s+\S/i.test(c.aiModel)) return `ค่า ai-model ควรขึ้นต้นด้วย "Claude " (เช่น "Claude Sonnet 5") — พบ: "${c.aiModel}"`; if (!/^Claude (Fable|Mythos|Opus|Sonnet|Haiku) \d+(\.\d+)?$/.test(c.aiModel)) return `ค่า ai-model ต้องเป็น "Claude <ตระกูล> <เวอร์ชัน>" ตระกูล = Fable|Mythos|Opus|Sonnet|Haiku (เช่น "Claude Sonnet 5", "Claude Opus 4.8") — พบ: "${c.aiModel}"`; return null; } },

  // ── stock-meta: บล็อก JSON ตัวเลขสำหรับเรียง/แสดงบนหน้า index — ต้อง "ตรงกับเลขที่โชว์" (กัน sort เพี้ยนจากเนื้อหา) ──
  { id: 'E29', level: 'error', label: 'มีบล็อก stock-meta (JSON ครบ key)', fn: (c) => {
    const sm = c.sm;
    if (!sm.present) return 'ไม่มี <script type="application/json" id="stock-meta"> — ต้องประกาศตัวเลขสรุป (price/fairValue/mos/upside/pe/dividendYield/roe) สำหรับเรียงหน้า index';
    if (!sm.ok) return `บล็อก stock-meta ไม่ใช่ JSON ที่ถูกต้อง: ${sm.err}`;
    const d = sm.data;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'stock-meta ต้องเป็น JSON object';
    if (typeof d.symbol !== 'string' || !d.symbol.trim()) return 'stock-meta ขาด "symbol" (string)';
    if (d.symbol.trim().toUpperCase() !== c.symbol.toUpperCase()) return `stock-meta.symbol "${d.symbol}" ≠ ชื่อไฟล์ "${c.symbol}"`;
    if (typeof d.currency !== 'string' || !/^[A-Z]{3}$/.test(d.currency)) return `stock-meta.currency ต้องเป็นรหัสสกุลเงิน 3 ตัว (เช่น "USD"/"THB") — พบ ${JSON.stringify(d.currency)}`;
    for (const k of SM_NUM_KEYS) {
      if (!(k in d)) return `stock-meta ขาดคีย์ "${k}"`;
      const v = d[k], allowNull = !SM_REQ_NUM.includes(k);
      if (allowNull) { if (v !== null && !isFiniteNum(v)) return `stock-meta.${k} ต้องเป็นตัวเลข หรือ null — พบ ${JSON.stringify(v)}`; }
      else if (!isFiniteNum(v)) return `stock-meta.${k} ต้องเป็นตัวเลข — พบ ${JSON.stringify(v)}`;
    }
    return null;
  } },
  { id: 'E30', level: 'error', label: 'stock-meta = เลขที่โชว์ (ราคา/FV/MOS)', fn: (c) => {
    const sm = c.sm; if (!sm.present || !sm.ok || !sm.data) return null; // E29 จับบล็อกเสีย/ขาดแล้ว
    const d = sm.data, bad = [];
    if (c.px != null && isFiniteNum(d.price) && Math.abs(d.price - c.px) > Math.max(0.02 * Math.abs(c.px), 0.02)) bad.push(`price ${d.price} ≠ ราคา header ${c.px}`);
    if (c.fvBox != null && isFiniteNum(d.fairValue) && Math.abs(d.fairValue - c.fvBox) > Math.max(0.01 * Math.abs(c.fvBox), 0.01)) bad.push(`fairValue ${d.fairValue} ≠ Fair Value ในกล่อง ${c.fvBox}`);
    if (c.mosBig != null && isFiniteNum(d.mos) && Math.abs(d.mos - c.mosBig) > TOL_MOS_PP) bad.push(`mos ${d.mos}% ≠ MOS ที่โชว์ ${c.mosBig}% (ต่าง > ${TOL_MOS_PP} จุด)`);
    return bad.length ? bad.join(' ; ') : null;
  } },
  { id: 'E31', level: 'error', label: 'stock-meta สอดคล้องในตัว (mos/upside)', fn: (c) => {
    const sm = c.sm; if (!sm.present || !sm.ok || !sm.data) return null;
    const d = sm.data; if (!isFiniteNum(d.price) || !isFiniteNum(d.fairValue) || d.price === 0 || d.fairValue === 0) return null;
    const bad = [];
    if (isFiniteNum(d.mos)) { const exp = (d.fairValue - d.price) / d.fairValue * 100; if (Math.abs(d.mos - exp) > TOL_MOS_PP) bad.push(`mos ${d.mos} ≠ (FV ${d.fairValue}−price ${d.price})/FV·100 = ${exp.toFixed(1)}`); }
    if (isFiniteNum(d.upside)) { const exp = (d.fairValue - d.price) / d.price * 100; const tol = Math.max(0.6, Math.abs(exp) * 0.05); if (Math.abs(d.upside - exp) > tol) bad.push(`upside ${d.upside} ≠ (FV ${d.fairValue}−price ${d.price})/price·100 = ${exp.toFixed(1)}`); }
    return bad.length ? bad.join(' ; ') : null;
  } },

  // คำโปรยธุรกิจใต้ <h1> (<div class="sub">) — build.js ดึงไปเป็น desc บนการ์ดหน้า index (ให้ผู้อ่านเห็นว่าบริษัททำธุรกิจอะไร)
  // บังคับให้ทุก report มี → การ์ดหน้ารวมไม่ fallback ไปโชว์ title ซ้ำ ๆ แทน
  { id: 'E32', level: 'error', label: 'คำโปรยธุรกิจใต้ <h1> (.sub → desc การ์ด index)', fn: (c) => {
    if (!c.sub) return 'ไม่มีคำโปรยธุรกิจ (<div class="sub"> ใต้ <h1>) — build.js ใช้เป็น desc บนการ์ดหน้า index (สรุปสั้น ๆ ว่าบริษัททำธุรกิจอะไร)';
    if (c.sub.length < 10) return `คำโปรยธุรกิจ (.sub) สั้นผิดปกติ (${c.sub.length} อักขระ): "${c.sub}" — ควรสรุปธุรกิจหลักของบริษัทพอให้เข้าใจ`;
    return null;
  } },

  // ทุก var(--x) ที่อ้างถึงต้องถูกนิยามใน <style> เดียวกัน (รายงาน expand แล้วมี palette ครบในตัว)
  // กันกรณี theme.badge/chgBg อ้าง var ที่ไม่มีในพาเลต (เช่น HMPRO ใช้ var(--orange) ที่ยังไม่ถูกนิยาม)
  // → CSS var ที่ resolve ไม่ได้ทำให้ background/สี "หายเงียบ ๆ" (เลขหัวข้อ 1–8 ไม่มีพื้นหลัง) โดย gate อื่นมองไม่เห็น
  // ข้าม var(--x, fallback) (มี fallback = ตั้งใจ) — จับเฉพาะ var(--x) ที่ไม่มี fallback และไม่ถูกนิยาม
  { id: 'E33', level: 'error', label: 'CSS var ที่อ้างถึงต้องถูกนิยาม (กันสี/พื้นหลังหายเงียบ)', fn: (c) => {
    const defined = new Set();
    for (const m of c.html.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
    const missing = new Set();
    for (const m of c.html.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) if (!defined.has(m[1])) missing.add(m[1]);
    return missing.size ? `อ้างถึง CSS var ที่ไม่ถูกนิยาม: ${[...missing].join(', ')} — สี/พื้นหลังจะหายเงียบ ๆ (เช่น พื้นหลังเลขหัวข้อ 1–8) เพิ่มตัวแปรใน _template/dashboard.css :root หรือแก้ theme ให้อ้างตัวที่มี` : null;
  } },

  // ── E34: สีป้าย change (.chg) ต้องตรงทิศทาง (เขียว = ขึ้น / แดง = ลง) ──
  // เคส HMPRO & CPF (มิ.ย. 2026): chg = "▼ −X%" (ขาลง) แต่ theme.chgBg/chgColor เป็นเขียว → พื้นหลังเขียวคู่ลูกศรลง
  // gate อื่นมองไม่เห็น (สี parse เป็น CSS ปกติ ไม่ขัดเลขใด ๆ) — เป็น "ความหมายสีผิด" ที่ต้องดักด้วย consistency เฉพาะทาง
  { id: 'E34', level: 'error', label: 'สีป้าย change ตรงทิศทาง (เขียว=ขึ้น/แดง=ลง)', fn: (c) => {
    if (!c.chg) return null;
    const t = (c.rd && c.rd.ok && c.rd.data && c.rd.data.theme) ? c.rd.data.theme : null;
    if (!t || (t.chgBg == null && t.chgColor == null)) return null;            // ไม่มีธีมสี change (รายงานเก่า) → ข้าม
    const up = /▲/.test(c.chg) || (/\+\s*\d/.test(c.chg) && !/▼/.test(c.chg));
    const down = /▼/.test(c.chg) || (/[−–]\s*\d/.test(c.chg) && !/▲/.test(c.chg));
    if (up === down) return null;                                             // "ทรงตัว"/กำกวม (ทั้งคู่หรือไม่มีเลย) → ข้าม
    const col = `${t.chgBg || ''} ${t.chgColor || ''}`;
    const green = /green/i.test(col) || /#1e6e30|#1e8e3e|#2e7d32|#137333/i.test(col);
    const red = /red/i.test(col) || /#c5221f|#ea4335|#b3261e|#d93025|#a50e0e/i.test(col);
    if (down && green && !red) return `ป้าย change เป็นขาลง ("${c.chg}") แต่สีเป็นเขียว (chgBg:${t.chgBg || '-'} / chgColor:${t.chgColor || '-'}) — ควรใช้โทนแดง (เคส HMPRO/CPF)`;
    if (up && red && !green) return `ป้าย change เป็นขาขึ้น ("${c.chg}") แต่สีเป็นแดง (chgBg:${t.chgBg || '-'} / chgColor:${t.chgColor || '-'}) — ควรใช้โทนเขียว`;
    return null;
  } },

  // ── E35: ป้าย % ใน header (.chg) ต้องเป็น "ผลตอบแทนรอบปี" (เทียบราคา ~1 ปีก่อน) ไม่ใช่ % รายวัน/ช่วงอื่น ──
  // กฎ CLAUDE.md ข้อ 2: รูปแบบ "▲/▼ ±X.X% (รอบปี)" = ผลตอบแทนปลายกราฟ ~1 ปี (จุดแรก→ท้าย ; ตรวจคู่กับ E36)
  // ยกเว้นหุ้น IPO ใหม่ (<1 ปี ยังไม่มีผลตอบแทนรอบปี) → ใช้ "(ตั้งแต่ IPO)" แทน · "≈ ทรงตัว (รอบปี)" สำหรับหุ้นที่แทบไม่ขยับ
  { id: 'E35', level: 'error', label: 'header % = ผลตอบแทนรอบปี (รอบปี)', fn: (c) => {
    if (!c.chg) return 'header ไม่มีป้าย % เปลี่ยนแปลง (.chg) — ต้องแสดงผลตอบแทน "รอบปี" เช่น "▲ +72.1% (รอบปี)"';
    const annual = /รอบปี/.test(c.chg);
    const ipo = /IPO/i.test(c.chg);   // หุ้น IPO ใหม่ <1 ปี — ผลตอบแทนตั้งแต่ IPO
    if (!annual && !ipo) return `ป้าย % ใน header ("${c.chg}") ต้องเป็นผลตอบแทน "รอบปี" (เทียบราคา ~1 ปีก่อน) ไม่ใช่ % รายวัน/ช่วงอื่น — รูปแบบ "▲ +72.1% (รอบปี)" (หุ้น IPO <1 ปี ใช้ "(ตั้งแต่ IPO)")`;
    const hasDir = /[▲▼]/.test(c.chg) && /\d/.test(c.chg);
    const flat = /ทรงตัว/.test(c.chg);
    if (!hasDir && !flat) return `ป้าย % รอบปี ("${c.chg}") ต้องมีทิศทาง (▲/▼) + ตัวเลข % หรือระบุ "ทรงตัว"`;
    return null;
  } },

  // ── E36: ป้าย % รอบปี ต้อง = ผลตอบแทนปลายกราฟ (จุดแรก→จุดท้าย) — header กับกราฟต้องมาจากชุดราคาเดียวกัน ──
  // (เดิมเป็น W11 warning · เลื่อนเป็น error เพราะ "รอบปี = ผลตอบแทนกราฟ ~1 ปี" เป็นกฎบังคับแล้ว — CLAUDE.md ข้อ 2)
  // "≈ ทรงตัว" (ไม่มี %) → ข้าม · ยังจับ "ตั้งแต่ IPO" ด้วย (มี % → ต้องตรงปลายกราฟเช่นกัน)
  { id: 'E36', level: 'error', label: '% รอบปี = ผลตอบแทนปลายกราฟ (จุดแรก→ท้าย)', fn: (c) => {
    if (!c.chg) return null;                                                   // E35 จับ chg ขาดแล้ว
    const m = c.chg.match(/([▲▼]?)\s*([+\-−]?\s*\d+(?:\.\d+)?)\s*%/);
    if (!m) return null;                                                       // "ทรงตัว" ไม่มี % → ข้าม
    const data = (c.rd && c.rd.ok && c.rd.data && c.rd.data.chart) ? c.rd.data.chart.data : null;
    if (!Array.isArray(data) || data.length < 2) return null;
    let stated = parseFloat(m[2].replace('−', '-').replace(/\s/g, ''));
    if (m[1] === '▼' && stated > 0) stated = -stated;
    const first = data[0] && data[0][1], last = data[data.length - 1] && data[data.length - 1][1];
    if (typeof first !== 'number' || typeof last !== 'number' || first === 0) return null;
    const chartPct = (last - first) / first * 100, diff = Math.abs(chartPct - stated);
    return diff > TOL_CHG_PP ? `ป้าย "${c.chg}" = ${stated}% แต่กราฟจุดแรก ${first} → จุดท้าย ${last} = ${chartPct.toFixed(1)}% (ต่าง ${diff.toFixed(1)} จุด %) — header กับกราฟต้องมาจากชุดราคาเดียวกัน` : null;
  } },

  // ── E37: กราฟราคา (section 2) ต้องเป็น ~1 ปี — ไม่เกิน ~13 จุด (รายเดือน 12 เดือน = 13 จุด, รายสองเดือน = ~8 จุด) ──
  // กฎ CLAUDE.md ข้อ 2: ตัดกราฟ 18 เดือน/1.5 ปี ให้เหลือ ~1 ปี (12 เดือนล่าสุด) เพื่อให้ "รอบปี" ของ header ตรงกับช่วงกราฟ
  { id: 'E37', level: 'error', label: 'กราฟ ~1 ปี (ไม่เกิน ~13 จุด)', fn: (c) => {
    const data = (c.rd && c.rd.ok && c.rd.data && c.rd.data.chart) ? c.rd.data.chart.data : null;
    if (!Array.isArray(data)) return null;
    return data.length > 13 ? `กราฟมี ${data.length} จุด — เกิน ~1 ปี (กราฟรายเดือน ~1 ปี = ไม่เกิน 13 จุด) · section 2 ต้องเป็น "ราคาย้อนหลัง ~1 ปี" (ตัดให้เหลือ ~12 เดือนล่าสุด)` : null;
  } },

  // ── E38: ทุกคู่ ตัวหนังสือ/พื้นหลัง ที่ theme คุม ต้องอ่านออก — WCAG AA (ตัวหนังสือ ≥4.5 · กราฟิก/เส้นกราฟ ≥3) ──
  // เคสจริง ก.ค. 2026: verdictText สีเดียวกับ gradient (ADP/DIS/BRK-B contrast 1.0 = ตัวหนังสือล่องหน),
  // badge เหลืองสดกับตัวหนังสือขาว (CAT 1.5) — gate อื่นมองไม่เห็น (สีเป็น CSS ถูกไวยากรณ์หมด)
  // ผิวอ้างอิง gradient = จุดสว่างสุดที่มองเห็น 0–100% (stop ประกาศเกิน 100% ได้) · .vcell มีกล่องขาวโปร่ง 7% ทับ
  { id: 'E38', level: 'error', label: 'contrast ธีมอ่านออก (WCAG AA)', fn: (c) => {
    if (!c.rd || !c.rd.present || !c.rd.ok || !c.rd.data) return null;
    const t = { ...THEME_DEFAULTS, ...(c.rd.data.theme || {}) };
    const bad = [];
    const chk = (name, fg, bg, min) => { if (!fg || !bg) return; const r = bt.contrast(fg, bg); if (r < min) bad.push(`${name} = ${r.toFixed(2)} (ต้อง ≥${min})`); };
    // effectiveHex: รับ hex/rgba/hsl(a) — ค่าโปร่งแสง composite ทับผิวจริงก่อนวัด (ไม่งั้น alpha ต่ำหลุดตรวจทั้งที่แทบล่องหน)
    const br = bt.gradBrightest(t.darkGrad);
    if (br) {
      const ov = bt.mixHex(br, '#ffffff', 0.07);                       // ผิว .vcell (สว่างกว่า gradient เปล่า = จุดยากสุดของตัวหนังสือขาว)
      chk('ขาวบน darkGrad/vcell', '#ffffff', ov, bt.AA.text);
      chk('subColor บน darkGrad', bt.effectiveHex(t.subColor, br), br, bt.AA.text);
      chk('headerMuted บน darkGrad', bt.effectiveHex(t.headerMuted, br), br, bt.AA.text);
      chk('verdictText บน darkGrad', bt.effectiveHex(t.verdictText, br), br, bt.AA.text);
      chk('vcellLabel บน vcell', bt.effectiveHex(t.vcellLabel, ov), ov, bt.AA.text);
    }
    chk('accent (เส้นกราฟ) บนการ์ดขาว', bt.effectiveHex(t.accent, '#ffffff'), '#ffffff', bt.AA.graphic);
    // ── คู่สีที่ derive ตอน build (spec 2026-08-11 §3.4) — CSS ใหม่ย้อมพื้น/เส้น/ชิปด้วย accent ──
    const dv = deriveTheme(t);
    chk('ink บน tintBg (พื้นหน้า)', '#14161c', dv.tintBg, bt.AA.text);
    chk('muted บน tintCard', '#5f6675', dv.tintCard, bt.AA.text);
    chk('accentDark บน soft (.fv-box/ชิป)', bt.effectiveHex(t.accentDark, dv.soft), dv.soft, bt.AA.text);
    chk('ขาวบน accentDark (ปุ่ม/ไทล์/ป้าย gauge)', '#ffffff', bt.effectiveHex(t.accentDark, '#ffffff'), bt.AA.text);
    chk('ขาวบน badge (เลข section)', '#ffffff', resolveColor(t.badge, t), bt.AA.text);
    chk('chgColor บน chgBg (ป้าย %)', resolveColor(t.chgColor, t), resolveColor(t.chgBg, t), bt.AA.text);
    return bad.length ? `${bad.join(' ; ')} — แก้อัตโนมัติ: node tools/fix-contrast.js <SYM> --write (ซ่อมเฉพาะ field ที่ตก คงโทนแบรนด์)` : null;
  } },

  // ── E39: จุดกราฟ (report-data.chart.data) ต้องเรียงเวลาเดินหน้าเสมอ (เก่า→ใหม่) ──
  // 2 จุดสลับตำแหน่งทำให้กราฟราคาเป็นซิกแซกไร้ความหมาย แต่ผ่านทุกขั้นเดิม — build.js ตรวจแค่รูปทรง [string,number],
  // E36/E37 ตรวจแค่ % header กับจำนวนจุด ไม่มีอะไรตรวจลำดับเวลา
  // ★ อนุรักษนิยม: label สักจุดที่ parseChartLabelKey อ่านไม่ออก → ข้ามทั้งรายงาน ไม่เดา (false error จะบล็อก cron ราคารายวันทั้งรีโป)
  { id: 'E39', level: 'error', label: 'จุดกราฟเรียงเวลาเดินหน้า (ไม่ย้อนกลับ)', fn: (c) => {
    const data = (c.rd && c.rd.ok && c.rd.data && c.rd.data.chart) ? c.rd.data.chart.data : null;
    if (!Array.isArray(data) || data.length < 2) return null;
    const keys = data.map((p) => (Array.isArray(p) ? parseChartLabelKey(p[0]) : null));
    if (keys.some((k) => k == null)) return null;
    for (let i = 1; i < keys.length; i++) {
      if (keys[i] < keys[i - 1]) return `จุดกราฟย้อนเวลา: "${data[i - 1][0]}" (จุดที่ ${i}) → "${data[i][0]}" (จุดที่ ${i + 1}) ควรเรียงเก่า→ใหม่`;
    }
    return null;
  } },

  { id: 'W01', level: 'warn', label: 'scenario: EPS×P/E ≈ ราคาเป้า', fn: (c) => { const bad = []; const nm = ['Bear', 'Base', 'Bull']; c.scenarios.forEach((s, i) => { if (s.tgt == null || s.eps == null || s.pe == null) return; const calc = s.eps * s.pe; const d = Math.abs(calc - s.tgt) / s.tgt; if (d > TOL_SCN_REL) bad.push(`${nm[i] || ('#' + i)}: EPS ${s.eps}×P/E ${s.pe}=${calc.toFixed(0)} ≠ target ${s.tgt} (ต่าง ${(d * 100).toFixed(0)}%)`); }); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'W02', level: 'warn', label: 'สกุลเงินปน', fn: (c) => { if (c.isTHB && /\$/.test(c.text)) { const n = (c.text.match(/\$/g) || []).length; return `รายงานสกุลบาท (฿) แต่พบ "$" ${n} จุดในเนื้อหา (ควรใช้ ฿)`; } if (!c.isTHB && /฿/.test(c.text)) { const n = (c.text.match(/฿/g) || []).length; return `รายงานสกุลดอลลาร์ ($) แต่พบ "฿" ${n} จุดในเนื้อหา`; } return null; } },
  { id: 'W03', level: 'warn', label: 'CSS เพี้ยน .seg-label', fn: (c) => /transform:transl\(/.test(c.html) ? 'พบ transform:transl( (ควรเป็น translate) — dead CSS .seg-label ใน template' : null },
  { id: 'W04', level: 'warn', label: 'สี verdict ตรงกับโซน MOS', fn: (c) => { if (c.mosBig == null) return null; const m = c.html.match(/class="mos-verdict (bad|ok|good)"/); if (!m) return null; const rank = { bad: 0, ok: 1, good: 2 }; const band = mosBand(c.mosBig); return Math.abs(rank[m[1]] - rank[band]) >= 2 ? `กล่อง verdict เป็น "${m[1]}" แต่ MOS ${c.mosBig}% ควรอยู่โซน "${band}"` : null; } },
  { id: 'W05', level: 'warn', label: 'FV ≈ ค่าเฉลี่ยวิธีที่แสดง', fn: (c) => { if (c.fvBox == null) return null; const vals = [...c.html.matchAll(/class="mval">([^<]*)</g)].map((m) => firstNum(m[1])).filter((v) => v != null); if (vals.length < 2) return null; const mean = vals.reduce((a, b) => a + b, 0) / vals.length; const d = Math.abs(mean - c.fvBox) / c.fvBox; return d > 0.07 ? `Fair Value ${c.fvBox} ต่างจากค่าเฉลี่ยวิธี (${vals.join(', ')} → เฉลี่ย ${mean.toFixed(2)}) ${(d * 100).toFixed(0)}%` : null; } },
  // ฟ้องเฉพาะ "ขัดทิศชัด" + MOS มีนัย (>3 จุด %) — โซนกลาง ±3% (เต็มมูลค่า/เหมาะสม/แฟร์) ไม่ฟ้อง (เคส MPWR: MOS −1% เขียน "เต็มมูลค่า" = ถูกต้อง)
  { id: 'W06', level: 'warn', label: 'สรุป "ส่วนต่างจากราคา" ตรงกับ MOS', fn: (c) => { const FV = c.fvBox != null ? c.fvBox : c.constFV; if (FV == null || c.px == null) return null; const i = c.html.indexOf('ส่วนต่างจากราคา'); if (i === -1) return null; const cell = norm(c.html).slice(i, i + 120); const mos = (FV - c.px) / FV * 100; const saysExpensive = /แพง|เต็มมูลค่า|overvalued|สูงกว่ามูลค่า/.test(cell); const saysCheap = /ถูก|MOS\s*~?\s*\+|undervalued|ต่ำกว่ามูลค่า/.test(cell); if (mos < -3 && saysCheap && !saysExpensive) return `สรุประบุ "ถูก/MOS+" แต่ MOS จริง = ${mos.toFixed(1)}% (ราคาแพงกว่ามูลค่า)`; if (mos > 3 && saysExpensive && !saysCheap) return `สรุประบุ "แพง/เต็มมูลค่า" แต่ MOS จริง = +${mos.toFixed(1)}% (ราคาถูกกว่ามูลค่า)`; const pct = firstNum(grab(/(-?[0-9.]+)\s*%/, cell)); if (pct != null && Math.abs(Math.abs(pct) - Math.abs(mos)) > TOL_MOS_SUMMARY_PP) return `สรุประบุส่วนต่าง ~${pct}% แต่ MOS จริง = ${mos.toFixed(1)}%`; return null; } },
  { id: 'W07', level: 'warn', label: 'ตัวเลขพื้นฐานสมเหตุสมผล', fn: (c) => { const bad = []; if (c.px != null && c.px <= 0) bad.push(`ราคา ${c.px} ≤ 0`); const m = c.metrics; if (m.pe != null && (m.pe <= 0 || m.pe > 600)) bad.push(`P/E ${m.pe} ผิดวิสัย`); /* เพดาน 600: ในตลาด AI/แพงมัลติเพิล P/E สูงเป็นของจริง (ARM ~482, TSLA ~372, COHR ~177 ฟื้นจากขาดทุน) — ฟ้องเฉพาะที่ผิดวิสัยจริง ๆ */ if (m.pbv != null && (m.pbv <= 0 || m.pbv > 20)) bad.push(`P/BV ${m.pbv} ผิดวิสัย`); if (m.yield != null && (m.yield < 0 || m.yield > 20)) bad.push(`Div yield ${m.yield}% ผิดวิสัย`); if (m.roe != null && (m.roe < -100 || m.roe > 200)) bad.push(`ROE ${m.roe}% ผิดวิสัย`); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'W08', level: 'warn', label: 'แหล่งข้อมูล ≥3 + อ้างอิงครบ', fn: (c) => { const bad = []; const line = grab(SOURCE_LINE, stripTags(c.header)); if (line) { const srcs = line.split(SOURCE_SEP).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= SOURCE_MAX_LEN); if (srcs.length < 3) bad.push(`ระบุแหล่งที่มาเพียง ${srcs.length} แหล่ง (ควร ≥3)`); } if (!/เป้า|นักวิเคราะห์|consensus/i.test(c.text)) bad.push('ไม่พบราคาเป้านักวิเคราะห์'); if (!/52\s*สัปดาห์|52-week/i.test(c.text)) bad.push('ไม่พบช่วง 52 สัปดาห์'); if (!FISCAL_REF.test(c.text)) bad.push('ไม่พบการอ้างอิงงวดงบ (FY/ไตรมาส)'); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'W09', level: 'warn', label: 'ความสดของราคา', fn: (c) => { if (!c.priceAge) return null; const a = c.priceAge.ageDays; const warnDays = parseInt(process.env.STALE_WARN_DAYS || '45', 10); const errDays = parseInt(process.env.STALE_ERROR_DAYS || '120', 10); if (a > warnDays && a <= errDays) return `ราคาเริ่มเก่า: ${c.priceAge.iso} (${a} วันที่แล้ว) — ควรอัปเดตก่อนเผยแพร่`; return null; } },
  // stock-meta P/E·Yield·ROE เทียบค่าที่โชว์ — เตือนเท่านั้น (label P/E/ROE ในรายงานไม่ standard เสมอ → ดึงไม่ได้บางไฟล์)
  { id: 'W10', level: 'warn', label: 'stock-meta P/E·Yield·ROE ≈ ที่โชว์', fn: (c) => { const sm = c.sm; if (!sm.present || !sm.ok || !sm.data) return null; const d = sm.data, m = c.metrics, bad = []; if (m.pe != null && isFiniteNum(d.pe) && Math.abs(d.pe - m.pe) > Math.max(0.05 * Math.abs(m.pe), 0.1)) bad.push(`pe ${d.pe} ≠ P/E ที่โชว์ ${m.pe}`); if (m.yield != null && isFiniteNum(d.dividendYield) && Math.abs(d.dividendYield - m.yield) > Math.max(0.1 * Math.abs(m.yield), 0.15)) bad.push(`dividendYield ${d.dividendYield} ≠ ปันผลที่โชว์ ${m.yield}`); if (m.roe != null && isFiniteNum(d.roe) && Math.abs(d.roe - m.roe) > Math.max(0.08 * Math.abs(m.roe), 0.5)) bad.push(`roe ${d.roe} ≠ ROE ที่โชว์ ${m.roe}`); return bad.length ? bad.join(' ; ') : null; } },

  // ── W12: ทุกจุดกราฟต้องมี label (แกน x) ไม่ว่าง — กัน ["",value] ที่ทำให้แกน x โชว์ช่องว่าง (พบ DDOG/WDC) ──
  { id: 'W12', level: 'warn', label: 'label จุดกราฟไม่ว่าง', fn: (c) => {
    const data = (c.rd && c.rd.ok && c.rd.data && c.rd.data.chart) ? c.rd.data.chart.data : null;
    if (!Array.isArray(data)) return null;
    const blanks = [];
    data.forEach((p, i) => { if (!Array.isArray(p) || typeof p[0] !== 'string' || !p[0].trim()) blanks.push(i); });
    return blanks.length ? `จุดกราฟมี label ว่างที่ดัชนี ${blanks.join(', ')} — แกน x จะโชว์ช่องว่าง` : null;
  } },

  // ── E40: หุ้นต้องมี tag ที่ถูกต้องใน tags.json ──
  // ระบบ tag เก็บแยกเป็น sidecar (ไม่ฝังในไฟล์รายงาน) เพราะเขียนลงไฟล์จะทำให้
  // freshHash ของทั้ง 908 ไฟล์เปลี่ยนพร้อมกัน → updated เด้งยกชุด (spec §2.1)
  // ⇒ ความถูกต้องจึงตรวจที่นี่แทน · build ตั้งใจให้ผ่อนปรน (คงป้ายเดิม) ตัวบังคับคือ check นี้
  { id: 'E40', level: 'error', label: 'tag ของหุ้นถูกต้อง (tags.json)', fn: (c) => {
    if (!c.tagData || !c.vocab) return null;              // ยังไม่ติดตั้งระบบ tag → ไม่ฟ้อง
    const slugs = c.tagData.tags[c.symbol];
    if (!slugs) return `ไม่มี ${c.symbol} ใน tags.json — ติดด้วย: node tools/tag-apply.js ${c.symbol} <slug…>`;
    const errs = TAG.validateAssignment(c.symbol, slugs, c.vocab);
    return errs.length ? errs.join(' ; ') : null;
  } },

  // ── W13: หุ้นต้องมีธีม "ธุรกิจ" อย่างน้อย 1 อัน ──
  // คลังมีธีม 2 ชนิด (ฟิลด์ kind): business = ทำอะไร · driver = อะไรทำให้ราคาขยับ
  // ★ เตือนที่ "ไม่มีธีมธุรกิจเลย" ไม่ใช่ "มี tag เดียว" — วัดจริงหลังติดครบ 908 ตัว: หุ้นที่มี
  //   tag เดียวมี 567 ตัว ซึ่งส่วนใหญ่เป็นหุ้น US ที่ไม่มีธีม driver ในคลังนี้ (คลัง driver เป็น
  //   แกนไทยเป็นหลัก) การเตือนทั้งหมดนั้นคือเสียงรบกวนที่กลบสัญญาณจริง ส่วน "มีแต่ธีม driver"
  //   = บอกไม่ได้ว่าบริษัททำอะไร ซึ่งเป็นช่องว่างของคลังที่ควรเข้าคิว --request จริง ๆ
  // fixture ที่ไม่ระบุ kind ถือเป็น business (เข้ากันได้กับเทสเดิมทุกเคส)
  { id: 'W13', level: 'warn', label: 'หุ้นต้องมีธีมธุรกิจอย่างน้อย 1', fn: (c) => {
    if (!c.tagData || !c.vocab) return null;
    const slugs = c.tagData.tags[c.symbol];
    if (!slugs || !slugs.length) return null;                 // ไม่มี entry เลย = E40 จัดการแล้ว
    const isBiz = (s) => { const e = c.vocab.bySlug.get(s); return !e || e.kind !== 'driver'; };
    return slugs.some(isBiz) ? null
      : `มีแต่ธีมตัวขับเคลื่อน (${slugs.join(', ')}) ไม่มีธีมธุรกิจ — คลังยังขาดธีมที่บอกว่าบริษัททำอะไร ให้เข้าคิวด้วย tag-apply.js --request`;
  } },
  // W14: การ์ดวิธีที่ E21/E22 ไม่ครอบ — recompute จากสูตรใน mdesc แล้วเทียบ mval (เงียบเมื่อ parse ไม่ได้ ตามแบบ E21)
  { id: 'W14', level: 'warn', label: 'วิธี P/FCF·DDM·EV/EBITDA: ค่า = สูตรในคำอธิบาย', fn: (c) => {
    const bad = [];
    for (const m of c.methods) {
      if (m.val == null || !(m.val > 0)) continue;
      const fam = W14_FAMILIES.find((f) => f.name.test(m.name));
      if (!fam) continue;
      const exp = fam.calc(m.desc);
      if (exp == null || !isFinite(exp)) continue;
      const dev = Math.abs(exp - m.val) / m.val;
      if (dev > fam.tol) bad.push(`${fam.label}: การ์ดโชว์ ${m.val} แต่คำนวณจากสูตรในคำอธิบายได้ ${exp.toFixed(2)} (คลาด ${(dev * 100).toFixed(0)}%)`);
    }
    return bad.length ? bad.join(' ; ') : null;
  } },
];

function checkHtml(html, name, opts) {
  const ctx = buildCtx(html, name, opts);
  const errors = [], warnings = [];
  for (const chk of CHECKS) {
    let res;
    try { res = chk.fn(ctx); } catch (e) { res = 'ตรวจไม่สำเร็จ: ' + e.message; }
    if (res) (chk.level === 'error' ? errors : warnings).push({ id: chk.id, label: chk.label, msg: res });
  }
  const errTotal = CHECKS.filter((c) => c.level === 'error').length;
  return { name, symbol: ctx.symbol, ctx, errors, warnings, errTotal, errPass: errTotal - errors.length };
}

module.exports = { checkHtml, buildCtx, parseScenarios, firstNum, CHECKS, REPORTS_DIR, FISCAL_REF_SRC };

// ---------- CLI ----------
function main() {
  const argv = process.argv.slice(2);
  if (!fs.existsSync(REPORTS_DIR)) { console.error('❌ ไม่พบโฟลเดอร์ reports/'); process.exit(1); }
  let files = fs.readdirSync(REPORTS_DIR).filter((f) => /\.html$/i.test(f)).sort();
  if (argv.length) { const want = new Set(argv.map((a) => a.replace(/\.html$/i, '').toUpperCase())); files = files.filter((f) => want.has(f.replace(/\.html$/i, '').toUpperCase())); }
  if (!files.length) { console.error('❌ ไม่พบไฟล์รายงานให้ตรวจ'); process.exit(1); }

  console.log(`\n🔍 ตรวจคุณภาพรายงาน ${files.length} ไฟล์ (reports/)\n`);
  let totErr = 0, totWarn = 0, failFiles = 0;
  for (const f of files) {
    const r = checkHtml(expandReport(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8')), f);
    totErr += r.errors.length; totWarn += r.warnings.length;
    if (r.errors.length) { failFiles++; console.log(`✗ ${f.padEnd(13)} ${r.errPass}/${r.errTotal} ผ่าน — ${r.errors.length} ปัญหา`); }
    else console.log(`✓ ${f.padEnd(13)} ${r.errTotal}/${r.errTotal} ผ่าน${r.warnings.length ? `   (⚠ ${r.warnings.length})` : ''}`);
    for (const e of r.errors) console.log(`    ✗ [${e.id}] ${e.label}: ${e.msg}`);
    for (const w of r.warnings) console.log(`    ⚠ [${w.id}] ${w.label}: ${w.msg}`);
  }
  console.log('\n' + '─'.repeat(50));
  console.log(`สรุป: ${files.length - failFiles}/${files.length} ไฟล์ผ่าน • error ${totErr} • warning ${totWarn}`);
  if (totErr) { console.log('\n❌ มี error — ห้าม push (แก้รายงานให้ผ่านก่อน)\n'); process.exit(1); }
  console.log(`\n✅ ผ่าน quality gate — พร้อม build & push${totWarn ? ` (มี ${totWarn} warning ที่ควรดู)` : ''}\n`); process.exit(0);
}

if (require.main === module) main();
