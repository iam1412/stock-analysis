'use strict';
/**
 * equiv.js — equivalence gate ต่อ zone ของ migration v2→v3 (Plan 4b Task 6 · spec §10.2/§10.3 · plan D2)
 * ทั้งสองฝั่งเป็นหน้า expandReport(...) — v2 = ต้นฉบับดิบ · v3 = expandReport(R.toV2Source(doc, view)) ⇒ zone หาด้วย regex เดียวกัน
 * ลำดับ (advisor pin 6): (1) zones → (2) norm() = transform ที่อนุมัติ ใช้กับ **ทั้งสองฝั่ง** → (3) LCS ระดับคำ → classify
 *   → (4) containment: คำที่หายเทียบ TEMPLATE_VOCAB[zone] (templateDropped) → word bag ทั้งหน้า v3 (moved) → ที่เหลือ = TEXT LOST (HUMAN)
 *   → (5) structured diff ของ report-data/stock-meta (ค่าที่ engine วาดแต่ text compare มองไม่เห็น) → (6) สี (theme key · tone การ์ด)
 * อ่านอย่างเดียว — ไม่เขียนไฟล์ · ห้าม mask region ที่ผู้เขียนเขียน (spec §10.2 d) — normaliser ตัดเฉพาะข้อความที่ template พิมพ์เอง
 * ต้นทาง: prototype Plan 4 Task 0 (.superpowers/sdd/archive/plan4a/task0/proto/equiv.js) — zones/diffRuns/classify ปรับเป็น token ระดับคำ
 */
const RM = require('../report-meta.js');
const DV = require('../derived-values.js');
const S = require('../v3/schema.js');
const K = require('../v3/cards.js');
const TH = require('./theme.js');
const MC = require('./cards.js');
const MP = require('./prose.js');
const A = require('./assemble.js');
const R = require('../../_template/v3/render.js');
const NB = require('./numbers.js');
const SY = require('./synonyms.js');
const { numsOf, classifyNumber, UNIT_WORD } = NB;

// ── คลังคำที่ template v2 พิมพ์แล้ว template v3 ทิ้ง/แทน — แยกตาม zone ที่ skeleton v2 พิมพ์คำนั้น (final-review I-2) ──
// ปิด — เพิ่มได้ผ่าน review เท่านั้น · คำนอก zone ของมัน = containment ปกติ (SIRI/SMCI "6.0x (มัธยฐาน 5 ปี)" ในช่อง §6 = คำผู้เขียน → TEXT LOST)
// ที่มา = _template/skeleton-{th,us}.html · seed เดิม (plan Task 6 Step 3) ที่ไม่มี zone: มัธยฐาน (skeleton ไม่พิมพ์นอกคอมเมนต์) ·
//   TTM (ป้ายการ์ด §1 "P/E (TTM)" — norm ตัด .k ของการ์ด catalogue แล้ว) · ราย (ไม่พบใน skeleton) ⇒ ไม่ยกเว้นที่ไหน
const TEMPLATE_VOCAB = {
  header: ['ราคา', 'ณ', '≈', 'กรอบ', 'สัปดาห์', 'ที่มา', 'รอบปี', 'ตั้งแต่', 'IPO'],   // px-meta "ราคา ณ · กรอบ 52 สัปดาห์ · ที่มา:" + ป้าย .chg "(รอบปี)"/"(ตั้งแต่ IPO)" (MRVL NOW ORCL TXN)
  s2: ['โดยประมาณ', 'ราคา', 'มูลค่าเหมาะสม'],   // hint "โดยประมาณ" · legend "ราคา SYM" / "มูลค่าเหมาะสม"
  s3: ['เฉลี่ย', 'มูลค่าเหมาะสม', 'Fair', 'Value', 'กรอบ'],   // hint "เฉลี่ย N วิธี" · FV box "มูลค่าเหมาะสมเฉลี่ย (Fair Value) กรอบ …" (ไม่ใช้กับคำจาก mdesc ขา computed)
  s4: ['ราคา', 'ปัจจุบัน', 'มูลค่าเหมาะสม', 'MOS', 'Fair', 'Value', 'กรอบ'],   // h2 "ราคาปัจจุบัน vs โซนต่างๆ" (CHRW) · marker/scale "ปัจจุบัน/เหมาะสม/MOS 30%/Fair Value/กรอบบน FV"
  s5: ['MOS'],   // h2/metric "จุดซื้อ MOS 20%"
  s6: ['EPS', 'ปี', 'ออก', 'ปันผลรวม', 'สถานการณ์', 'จุดเข้า', 'ฐาน'],   // .top "EPS x%/ปี" · แถว "EPS ปี 3 · P/E ออก · ปันผลรวม 3 ปี · สถานการณ์" · hint "จากจุดเข้า • EPS ฐาน" (L)
  s8: ['มูลค่าเหมาะสม', 'ส่วนต่างจากราคา', 'MOS', 'เป้านักวิเคราะห์', 'ด.'],   // vcell .k
  disc: ['คำเตือน', 'เป้าหมาย'],   // "คำเตือน:" · "โดยเฉพาะ P/E เป้าหมาย"
  footer: ['Stock', 'Analysis', 'Dashboard', 'ข้อมูล', 'ณ', 'สร้างด้วย', 'stock-analyzer', 'workflow'],   // "Stock Analysis Dashboard • ข้อมูล ณ … • สร้างด้วย stock-analyzer workflow" (CARR ERIE)
};
// ── คำ template ที่นับจำนวน (Plan 4c-prep D4 · spec §3.7 ค · measure §2 s6) — ทิ้งได้ไม่เกินเพดาน (1 ต่อคอลัมน์) และเฉพาะเมื่อคอลัมน์ v3 ไม่พิมพ์คำนั้นเลย ──
// ไม่ใช่คำพ้อง (ไม่มีคู่ใน v3) · ปิด — เพิ่มได้ผ่าน review เท่านั้น
const TEMPLATE_COUNTED = {
  s6: {
    'รวม': 3,        // "รวม 3 ปี" ป้ายคอลัมน์ของ skeleton v2 รุ่นเก่า ×74
    'รวมปันผล': 3,   // ป้ายต่อท้าย .ret ของ skeleton รุ่นเก่า ×28
    'ปันผลสะสม': 3,  // ป้ายแถวปันผลรุ่นเก่า ≡ "ปันผลรวม" ×9
  },
};

// ── ข้อความ ──
// entity: ชุดเดียวกับ migrate-v3/prose.js decode (&divide; &mdash; … ไม่งั้น "divide" กลายเป็นคำ — fix round 1)
const decode = MP.decode;
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** HTML → ข้อความที่มองเห็น — ตัด emoji (Extended_Pictographic + variation selector + ZWJ) · ≈ → ณ (transform ที่อนุมัติ) */
function text(h) {
  return decode(String(h || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\p{Extended_Pictographic}|[\uFE0E\uFE0F\u200D]/gu, ' ').replace(/≈/g, 'ณ')
    // หน่วยเงินไทยที่ผู้เขียนเว้นวรรคกลางคำ ("฿4.18 พัน ล." · "฿17.4 พัน ลบ.") = หน่วยเดียว (NB.UNIT) — ต่อกันก่อนตัดคำ ไม่งั้นตัวเลขหลุดจากหน่วยใน diff
    .replace(/([0-9])\s*(พัน|หมื่น|แสน)\s+(ล\.|ลบ\.)/g, '$1 $2$3').replace(/\s+/g, ' ').trim();
}

/** zone ของหน้า → Map<id, html> · header · s1…s8 (ตาม <div class="n">) · extra:<i> (หมวดไม่มีเลข/เลขซ้ำ) · disc · footer */
function zones(html) {
  const body = String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const z = new Map();
  const hdr = /<header>([\s\S]*?)<\/header>/.exec(body); z.set('header', hdr ? hdr[1] : '');
  let k = 0;
  for (const m of body.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)) {
    const n = /<div class="n">(\d+)<\/div>/.exec(m[1]);
    const id = n && !z.has(`s${n[1]}`) ? `s${n[1]}` : `extra:${k++}`;
    z.set(id, m[1]);
  }
  const disc = /<div class="disc">([\s\S]*?)<\/div>/.exec(body); z.set('disc', disc ? disc[1] : '');
  const ft = /<footer[^>]*>([\s\S]*?)<\/footer>/.exec(body); z.set('footer', ft ? ft[1] : '');
  return z;
}

// ── normalisers (transform ที่อนุมัติ · ใช้กับทั้งสองฝั่ง) ──
const DISC_FIXED = [
  'คำเตือน:', 'รายงานนี้จัดทำเพื่อการศึกษาและเป็นข้อมูลประกอบการตัดสินใจเท่านั้น', 'ไม่ใช่คำแนะนำให้ซื้อหรือขายหลักทรัพย์',
  'ตัวเลข valuation อิงสมมติฐานที่อาจคลาดเคลื่อน โดยเฉพาะ',
  // สองท่อนแยกกัน — ผู้เขียนแก้ท่อนแรกแต่คงท่อนหลัง (ADBE) ต้องไม่กลายเป็นคำหาย (fix round 1 · M-1)
  'ราคาหุ้นมีความผันผวนสูง', 'ผู้ลงทุนควรศึกษาข้อมูลเพิ่มเติมและพิจารณาความเสี่ยงของตนเองก่อนตัดสินใจ',
];
const THAI_MONTH = { 'มกราคม': 'ม.ค.', 'กุมภาพันธ์': 'ก.พ.', 'มีนาคม': 'มี.ค.', 'เมษายน': 'เม.ย.', 'พฤษภาคม': 'พ.ค.', 'มิถุนายน': 'มิ.ย.',
  'กรกฎาคม': 'ก.ค.', 'สิงหาคม': 'ส.ค.', 'กันยายน': 'ก.ย.', 'ตุลาคม': 'ต.ค.', 'พฤศจิกายน': 'พ.ย.', 'ธันวาคม': 'ธ.ค.' };
const CTX_SUFFIX = '(บริบท — ไม่นับใน FV)';
const LEG_RE = /(<div class="vmethod">\s*<div>\s*<div class="mname">)([\s\S]*?)(<\/div>\s*)(?:(<div class="mdesc">)([\s\S]*?)(<\/div>))?/g;
const CARD_RE = () => new RegExp(DV.CARD_SRC, 'g');

/** ป้าย .d ของ template บน view (ไม่มี note) — null ถ้า render ไม่ได้ */
function templateCard(key, view) { try { return K.renderCard(key, view); } catch (_) { return null; } }
/** ตัด prefix ที่เท่ากับ .d ของ template (กระจกของ cards.js noteFor) */
function stripTemplateD(dText, td) {
  if (!td) return dText;
  if (dText === td) return '';
  if (dText.startsWith(td)) return dText.slice(td.length).replace(/^(?:[\s·•,;:—–]|-(?![0-9]))+/, '').trim();
  return dText;
}

/** ป้ายหัว §6 → เศษที่ไม่ใช่ของ template (A.s6HintNote — กติกาเดียวกับที่ assemble ใช้เก็บ scenarios.hintNote)
 *  divIncluded: "รวมปันผล" ที่ {{rd:scnNote}} พิมพ์อยู่ท่อนเดียวกับ hintNote บนหน้า v3 ("• รวมปันผล <hintNote>") → ตัดคำนำหน้านั้นหนึ่งครั้ง */
function s6Residue(t, scen) {
  let r = A.s6HintNote(t, scen);
  if (scen.divIncluded) r = r.replace(/(^|•\s*)รวมปันผล(?=\s|$)/, '$1').replace(/^\s*•\s*|\s*•\s*$/g, '').trim();
  return r;
}

/**
 * norm(zoneId, html, side, ctx) → ข้อความหลัง transform ที่อนุมัติ · ctx = { doc, view, dropped: [] (คำ v2 ที่ transform ทิ้ง), mdescKeys: Set (คำผู้เขียนใน mdesc ขา computed ฝั่ง v2), shared: { gen: {} } (genHint · mdesc ที่ generate ต่อขา — ฝั่ง v3 รันก่อน) }
 * ฝั่ง v2/v3 ใช้กฎเดียวกันทุกข้อ — ต่างกันเฉพาะที่ template v3 พิมพ์ข้อความ generate (hint/mdesc) ซึ่ง v2 ไม่มีคู่
 */
function norm(zoneId, html, side, ctx) {
  const { doc, view } = ctx;
  let h = String(html || '');
  const sym = doc && doc.symbol;
  if (zoneId === 'header') {
    if (sym) h = h.replace(/(<h1[^>]*>[\s\S]*?)\s*\(\s*([A-Z0-9.\-]+)\s*\)\s*(<\/h1>)/, (m, a, s, c) => (s === sym ? a + c : m));
    // gauge dots + (SYM) ใต้ราคา = ของตกแต่ง/ป้ายของ template (spec §10.2 b "gauge dots")
    // gdots: glyph/สี = ของตกแต่ง (ตัดทิ้ง) · ข้อความ = คำผู้เขียนที่ v2 แสดงจริง → v3 พกด้วย meta.sectorLine (Plan 4c-prep D4 แก้คำตัดสิน Task 6 ของ 4b)
    h = h.replace(/(<div class="gdots">)([\s\S]*?)(<\/div>\s*<div>)/, (m, a, g, c) => a + escHtml(text(g).replace(/#[0-9a-f]{3,8}\b/gi, ' ').replace(/[^\s\p{L}\p{M}\p{N}]/gu, ' ')) + c);
    // <small> แรกใน .price-row = "(SYM)" ใต้ราคา (ไม่อ้าง regex ของ .px — เจ้าของเดียวคือ report-meta.js · parser-lint)
    h = h.replace(/(<div class="price-row">[\s\S]*?)<small>([\s\S]*?)<\/small>/, (m, a, g) => { if (side === 'v2') ctx.dropped.push(...tok(text(g))); return a; });
    // ป้ายตายตัวของ px-meta (ทุกรูปที่ v2 เขียน: "ราคา ณ" · "ราคาปิด ณ" · "ปิดตลาด ณ" · "ราคาปิด <วันที่>" · "ช่วง/กรอบ 52 สัปดาห์" · "52wk:" · "ที่มา:")
    let tx = text(h);
    // display-fix2 (KLAC): กรอบ 52 สัปดาห์ = ค่าตลาด — template v3 พิมพ์สดจาก market.range52w (cron) แม้หน้า v2 ไม่ได้พิมพ์ · ตัวเลขช่วงนี้ไม่ใช่ตัวเลขของผู้เขียน ⇒ ไม่เทียบ (ทั้งสองฝั่ง)
    tx = tx.replace(/(?:ช่วง|กรอบ)?\s*52\s*(?:สัปดาห์|wk|weeks?)\s*:?\s*\(?\s*(?:US\$|C\$|HK\$|\$|฿|€|£|¥)?\s*~?[0-9][0-9,]*(?:\.[0-9]+)?\s*(?:บาท)?\s*[–—-]\s*(?:US\$|C\$|HK\$|\$|฿|€|£|¥)?\s*~?[0-9][0-9,]*(?:\.[0-9]+)?\s*(?:บาท)?\s*\)?/gi, (m) => { if (ctx.range52) ctx.range52.push(m.replace(/^[^$฿€£¥0-9~(]*/, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim()); return ' '; });
    tx = tx.replace(/(?:ราคาปิด|ราคา|ปิดตลาด)\s*ณ/g, ' ').replace(/ราคาปิด(?=\s+\d)/g, ' ').replace(/(?:ช่วง|กรอบ)?\s*52\s*(?:สัปดาห์|wk|weeks?)\s*:?/gi, ' ').replace(/ที่มา\s*:/g, ' ');
    return tx.replace(/\s+/g, ' ').trim();
  }
  if (zoneId === 's1' && doc && view) {
    // การ์ด v2 ↔ entry v3 ตามลำดับ (cards.js คงลำดับ) · custom จับคู่ด้วยป้าย · การ์ด v2 ที่ไม่มีคู่ (เช่น custom เกิน 4 ที่ assemble ตัด) = เทียบเต็ม
    const entries = S.cardEntries(doc.metrics || {}), custom = (doc.metrics && doc.metrics.custom) || [];
    let e = 0;
    h = h.replace(CARD_RE(), (m, kHtml, vOpen, vHtml, tail, dHtml) => {
      const en = entries[e];
      if (!en) return m;
      if (en.custom != null) { if (custom[en.custom] && text(custom[en.custom].label) === text(kHtml)) e++; return m; }   // custom = เทียบเต็ม
      if (side === 'v2' && MC.keyOf(text(kHtml), text(vHtml)) !== en.key) return m;   // ไม่ใช่การ์ดที่ assemble map เป็น key นี้ (เช่น custom เกิน 4 ที่ถูกตัด) = เทียบเต็ม
      e++;
      const tc = templateCard(en.key, view);
      let out = `<div class="k"></div>${vOpen}${vHtml}`;
      if (dHtml != null) out += tail.replace(dHtml, () => escHtml(stripTemplateD(text(dHtml), tc ? text(tc.d) : null)));
      else out += tail;
      return out;
    });
  }
  if (zoneId === 's3' && doc && view) {
    const legs = doc.legs || [], vl = view.legs || [];
    const found = [...h.matchAll(LEG_RE)];
    // ขา v2 ↔ v3: ตามลำดับเมื่อป้ายตรงกัน (A.labelParts = ฟังก์ชันเดียวกับที่ assemble เขียน legs[i].label — Plan 4c-prep D4) · ไม่ตรง = หาด้วยป้าย · ไม่พบ = เทียบ mdesc เต็ม (fix round 1 · M-4)
    const labOf = (s) => (side === 'v2' ? text(A.labelParts(text(s)).label) : text(s).replace(/^\d+\.\s*/, '').split(CTX_SUFFIX).join('').trim());
    // คำพ้องที่อนุมัติ (synonyms.js) — ฝั่ง v2 เท่านั้น · เฉพาะขาที่ align ได้ (guard อ่าน leg) · เขียนทับเฉพาะเมื่อมีคำพ้องถูกใช้
    const syn = (role, ws, leg) => { const r = SY.apply(role, ws, { doc, view, leg }); for (const u of r.used) (ctx.syn = ctx.syn || []).push({ zone: 's3', ...u }); return r; };
    const vlab = vl.map((l) => text(l && l.label));
    const idxOf = (j, mname) => {
      const lab = labOf(mname);
      if (found.length === legs.length && vlab[j] === lab) return j;
      return vlab.indexOf(lab);
    };
    let j = 0;
    h = h.replace(LEG_RE, (m, a, mname, b, dOpen, mdesc, dClose) => {
      const k = idxOf(j++, mname);
      // เลขนำหน้า + ป้ายขาบริบทที่ template ต่อท้าย (รูปตรงตัวเท่านั้น — รูปอื่นของผู้เขียนยังเทียบ)
      let nm = mname.replace(/^\s*\d+\.\s*/, '').split(CTX_SUFFIX).join(' ');
      const leg = k >= 0 ? legs[k] : null;
      if (side === 'v2' && leg) { const r = syn('s3.mname', tok(text(nm)), leg); if (r.used.length) nm = escHtml(r.tokens.join(' ')); }
      let d = dOpen ? dOpen + mdesc + dClose : '';
      if (side === 'v2' && leg && leg.method === 'declared' && dOpen) { const r = syn('s3.mdesc', tok(text(mdesc)), leg); if (r.used.length) d = dOpen + escHtml(r.tokens.join(' ')) + dClose; }
      if (leg && leg.method !== 'declared' && dOpen) {
        // ขา computed (final-review I-1): mdesc ที่ generate (v3) แทนสูตรของผู้เขียน (v2) — transform ที่อนุมัติ (spec §10.2 b · plan D2)
        //   ทิ้งเฉพาะ (i) คำที่ mdesc generate ของขานี้พิมพ์ (ii) คำสูตร (formula.js FORMULA_VOCAB · A.isProseToken) · ตัวเลข/สัญลักษณ์ (inputs ตรวจด้วย guardLegs แล้ว)
        //   คำอื่นทั้งสองฝั่ง (v2 = คำผู้เขียน · v3 = leg.note หลัง " — ") เทียบกันต่อ → คำที่ note ไม่ได้พกไป = containment → TEXT LOST
        // ตัวดำเนินการแยกคำ ("ปลายทาง=4%" · "D₁≈฿0.288") — กติกาเดียวกับ A.hasProse · ใช้ทั้งสองฝั่ง
        const ops = (x) => String(x).replace(/≈|&asymp;/g, ' ≈ ').replace(/[=×÷+−]|&times;|&divide;|&minus;/g, ' $& ');
        const t = text(ops(mdesc)), G = (ctx.shared.gen = ctx.shared.gen || {});
        if (side === 'v3') { try { G[k] = text(ops(escHtml(R.mdesc(leg, view)))); } catch (_) { G[k] = ''; } }
        const gen = G[k] || '';
        const genKeys = new Set(tok(gen).map(keyOf));
        const body = side === 'v3' ? (t.startsWith(gen) ? t.slice(gen.length).replace(/^\s*—\s*/, '') : t) : t;
        const kept = [];
        const bodyToks = side === 'v2' ? syn('s3.mdesc', tok(body), leg).tokens : tok(body);
        for (const w of bodyToks) {
          if (!isWord(w)) continue;
          if (genKeys.has(keyOf(w)) || !A.isProseToken(w, false)) { if (side === 'v2') ctx.dropped.push(w); continue; }   // คำ generate · คำสูตร · ตัวเลข+หน่วย ("6.8pp")
          kept.push(w);
          if (side === 'v2' && ctx.mdescKeys) ctx.mdescKeys.add(keyOf(w));
        }
        d = dOpen + escHtml(kept.join(' ')) + dClose;
      }
      return a + nm + b + d;
    });
    // hint ที่ generate (valHintParts) — ไม่มี text.valHint ⇒ hint ฝั่ง v3 เป็นของ template
    // v2 ตัดเฉพาะเมื่อข้อความเท่ากับ hint ที่ v3 generate (assemble ทิ้ง hint ของ v2 เฉพาะกรณีนี้ · hint ยาวที่ย้ายไป valIntro ยังเทียบเต็ม)
    if (!(doc.text && doc.text.valHint)) {
      h = h.replace(/(<div class="s-head">[\s\S]*?<div class="hint">)([\s\S]*?)(<\/div>\s*<\/div>)/, (m, a, hint, c) => {
        if (side === 'v3') { ctx.shared.genHint = text(hint); return a + c; }
        return ctx.shared.genHint != null && text(hint) === ctx.shared.genHint ? a + c : m;
      });
    }
    // FV box ป้ายซ้าย (คำ + กรอบ) — ค่าอยู่ใน structured diff
    h = h.replace(/(<div class="fv-box">\s*<div class="l">)[\s\S]*?(<\/div>\s*<div class="r">)/, '$1$2');
  }
  if (zoneId === 's2') {
    // ป้ายหัวหมวด 2: template พิมพ์ "โดยประมาณ" ตัวอักษรตรงตัวเท่านั้น — เศษ (text.chartHint ของ v3 / คำผู้เขียนของ v2) เทียบเต็ม (fix round 1 · C-1)
    h = h.replace(/(<div class="s-head">[\s\S]*?<div class="hint">)([\s\S]*?)(<\/div>\s*<\/div>)/, (m, a, hint, c) => a + escHtml(text(hint).replace(/^โดยประมาณ(?=\s|$)/, '')) + c);
    // legend: ตัดเฉพาะป้าย skeleton 3 ชิ้น ("ราคา SYM" · "มูลค่าเหมาะสม" (ตัวเลข fv ยังเทียบ) · "จุดสำคัญ") — คำอื่นเทียบเต็ม
    h = h.replace(/(<div class="legend">)([\s\S]*?)(<\/div>)/, (m, a, g, c) => {
      let t = text(g);
      if (sym) t = t.replace(new RegExp(`(^|\\s)ราคา ${reEsc(sym)}(?=\\s|$)`), '$1');
      t = t.replace(/(^|\s)มูลค่าเหมาะสม(?=\s|$)/, '$1').replace(/(^|\s)จุดสำคัญ(?=\s|$)/, '$1');
      return a + escHtml(t) + c;
    });
  }
  if (zoneId === 's6' && doc && doc.scenarios) {
    // ป้ายหัวหมวด 6: ตัดเฉพาะชิ้นที่ template พิมพ์เอง ด้วยกติกาเดียวกับ assemble (A.s6HintNote) ทั้งสองฝั่ง — เศษเทียบเต็ม (fix round 1 · C-1)
    h = h.replace(/(<div class="s-head">[\s\S]*?<div class="hint">)([\s\S]*?)(<\/div>\s*<\/div>)/, (m, a, hint, c) => a + escHtml(s6Residue(text(hint), doc.scenarios)) + c);
  }
  if (zoneId === 's4') {
    // ป้ายสเกลเกจ (<small> ใน .scale) — v3 generate จาก values (MOS 30%/MOS 20%/Fair Value/กรอบบน FV/เป้าเฉลี่ย Analyst) · ค่าตัวเลขยังเทียบ
    // ★ รับไว้โดย review Task 6 (ป้าย = zone "label" §10.2 b · tick ที่หายโผล่เป็น numberValue) — คำ v2 ที่ไม่อยู่ในหน้า v3 → templateDropped (info)
    h = h.replace(/<div class="scale">[\s\S]*?(?=<\/div>\s*<\/div>)/, (sc) => sc.replace(/<small>([\s\S]*?)<\/small>/g, (m, g) => { if (side === 'v2') ctx.dropped.push(...tok(text(g))); return ' '; }));
  }
  if (zoneId === 's5') {
    h = h.replace(/<div class="grid g3">[\s\S]*?(?=<div class="calc">)/, ' ');
    h = h.replace(/<label>[\s\S]*?<\/label>/, ' ');
  }
  if (zoneId === 's6') {
    // .top + ป้ายแถว: ฝั่ง v3 = ป้ายของ template ตัดเสมอ · ฝั่ง v2 ตัดเฉพาะป้ายที่ทุกคำอยู่ในชุดป้าย v3 ของคอลัมน์เดียวกัน (หรือ TEMPLATE_VOCAB)
    // ไม่เดาบทบาทจากตำแหน่ง — ป้ายที่ผู้เขียนเขียนเอง ("Exit P/FFO" · "ทรงตัว" · "เงินสดสุทธิปี 3") เทียบเต็ม (fix round 1 · M-2)
    const cols = [...h.matchAll(/<div class="col (bear|base|bull)">([\s\S]*?)<\/ul>/g)];
    const labelWords = side === 'v3' ? null : ctx.shared.s6Labels || {};
    if (side === 'v3') {
      ctx.shared.s6Labels = {};
      // คำทุกคำในคอลัมน์ §6 ฝั่ง v3 (ดิบ ก่อนตัดป้าย) — TEMPLATE_COUNTED ใช้ได้เฉพาะคำที่ v3 ไม่พิมพ์ในคอลัมน์ใดเลย
      ctx.shared.s6ColKeys = new Set(cols.flatMap((cm) => tok(text(cm[2])).map(keyOf)));
    }
    // TEMPLATE_COUNTED (Plan 4c-prep D4 · fix round 1): ฝั่ง v2 ทิ้งได้เฉพาะที่ตำแหน่งป้าย (<li> ช่องแรก · .ret) ≤ 1 ครั้งต่อคำต่อคอลัมน์
    //   ไม่แตะ hint / ช่องค่า (สถานการณ์ ฯลฯ) — คำพวกนั้นเทียบตามปกติ · รวมทั้ง zone ไม่เกินเพดานใน TEMPLATE_COUNTED
    const counted = side === 'v2' ? Object.keys(TEMPLATE_COUNTED.s6).filter((w) => !(ctx.shared.s6ColKeys || new Set()).has(keyOf(w))) : [];
    const countedN = new Map();
    for (const cm of cols) {
      const name = cm[1];
      let body = cm[2];
      const topLab = (x) => { const t = text(x), at = t.search(/[+\-−±]?\d/); return { lab: at > 0 ? t.slice(0, at) : at < 0 ? t : '', rest: at >= 0 ? t.slice(at) : '' }; };
      const ok = (t) => side === 'v3' || tok(t).filter(isWord).every((w) => (labelWords[name] || new Set()).has(keyOf(w)) || inVocab('s6', keyOf(w)));
      if (side === 'v2' && doc && doc.scenarios) {
        // คำพ้องที่อนุมัติ (synonyms.js · Plan 4c-prep D4) — ฝั่ง v2 ต่อคอลัมน์ (bear 0 · base 1 · bull 2) ก่อนเช็คป้าย ok() ("Exit P/E" → "ออก P/E")
        //   .top ช่องที่สอง → s6.top · ป้ายแถวออก → s6.exitRow · ป้ายแถวปลายฉาก ("… ปี 3" ไม่ใช่ปันผล) → s6.endRow · ค่าของแถวปันผล → s6.divRow · .ret → s6.ret
        const ci = { bear: 0, base: 1, bull: 2 }[name];
        const g = { doc, view, i: ci, case: (doc.scenarios.cases || [])[ci] };
        const rw = (role, htm) => {
          const r = SY.apply(role, tok(text(htm)), g);
          for (const u of r.used) (ctx.syn = ctx.syn || []).push({ zone: 's6', ...u });
          return r.used.length ? escHtml(r.tokens.join(' ')) : htm;
        };
        const tp = /<div class="top"><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span>/.exec(body);
        if (tp) body = body.replace(tp[0], () => `<div class="top"><span>${tp[1]}</span><span>${rw('s6.top', tp[2])}</span>`);
        body = body.replace(/<li><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span>/g, (li, l, v) => {
          const lt = text(l);
          if (/ปันผล/.test(lt)) return `<li><span>${l}</span><span>${rw('s6.divRow', v)}</span>`;
          if (/ออก|exit|ทางออก/i.test(lt)) return `<li><span>${rw('s6.exitRow', l)}</span><span>${v}</span>`;
          if (/ปี\s*\d/.test(lt)) return `<li><span>${rw('s6.endRow', l)}</span><span>${v}</span>`;
          return li;
        });
        body = body.replace(/(<div class="ret[^"]*">)([\s\S]*?)(<\/div>)/, (m, a, r, c) => a + rw('s6.ret', r) + c);
      }
      if (counted.length) {
        const done = new Set();
        const drop = (htm) => {
          const ws = tok(text(htm)); let hit = false;
          const kept = ws.filter((w) => {
            const wd = wordOf(w);
            if (!counted.includes(wd) || done.has(wd) || (countedN.get(wd) || 0) >= TEMPLATE_COUNTED.s6[wd]) return true;
            done.add(wd); countedN.set(wd, (countedN.get(wd) || 0) + 1); (ctx.counted = ctx.counted || []).push(wd); hit = true;
            return false;
          });
          return hit ? escHtml(kept.join(' ')) : htm;
        };
        body = body.replace(/<li><span>([\s\S]*?)<\/span>/g, (li, l) => `<li><span>${drop(l)}</span>`);
        body = body.replace(/(<div class="ret[^"]*">)([\s\S]*?)(<\/div>)/, (m, a, r, c) => a + drop(r) + c);
      }
      const top = /<div class="top"><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span>/.exec(body);
      const labs = [...body.matchAll(/<li><span>([\s\S]*?)<\/span>/g)].map((x) => text(x[1]));
      if (side === 'v3') {
        const set = new Set();
        if (top) { tok(text(top[1])).concat(tok(topLab(top[2]).lab)).filter(isWord).forEach((w) => set.add(keyOf(w))); }
        labs.forEach((l) => tok(l).filter(isWord).forEach((w) => set.add(keyOf(w))));
        ctx.shared.s6Labels[name] = set;
      }
      if (top) {
        const tl = topLab(top[2]);
        const nm = ok(text(top[1])) ? '' : escHtml(text(top[1]));
        const lab = ok(tl.lab) ? '' : escHtml(tl.lab) + ' ';
        body = body.replace(top[0], `<div class="top"><span>${nm}</span><span>${lab}${escHtml(tl.rest)}</span>`);
      }
      body = body.replace(/<li><span>([\s\S]*?)<\/span>/g, (li, l) => (ok(text(l)) ? '<li><span></span>' : li));
      h = h.replace(cm[2], () => body);
    }
    return text(h).replace(/(^|\s)~/g, '$1').replace(/\s+/g, ' ').trim();
  }
  if (zoneId === 's8') {
    // ป้าย .k ของ template ตัดเฉพาะสองป้ายตายตัว · ช่องเป้านักวิเคราะห์ทิ้งทั้งช่องเฉพาะช่องแรก (ค่าอยู่ใน structured diff)
    // ช่องอื่นทั้งหมด (ช่องที่ผู้เขียนเพิ่ม → verdict.extraCells) เทียบเต็มทีละคำ (Plan 4c-prep D4)
    let analyst = false;
    h = h.replace(/<div class="vcell"><div class="k">([\s\S]*?)<\/div>([\s\S]*?)<\/div><\/div>/g, (m, k, rest) => {
      const kt = text(k);
      if (!analyst && /เป้านักวิเคราะห์/.test(kt)) { analyst = true; return ' '; }
      return kt === 'มูลค่าเหมาะสม' || kt === 'ส่วนต่างจากราคา' ? `<div class="vcell"><div class="k"></div>${rest}</div></div>` : m;
    });
  }
  if (zoneId === 'disc') {
    let tx = text(h);
    for (const s of DISC_FIXED) tx = tx.split(s).join(' ');
    return tx.replace(/\s+/g, ' ').trim();
  }
  if (zoneId === 'footer') {
    // เหลือเฉพาะวันที่ · ชื่อเดือนเต็ม → ตัวย่อ (v3 พิมพ์ตัวย่อเสมอ — ค่าวันที่เดียวกัน)
    const m = /ข้อมูล\s*ณ\s*([^•]*)/.exec(text(h));
    return m ? m[1].trim().replace(/[ก-๙]+/g, (w) => THAI_MONTH[w] || w) : '';
  }
  return text(h);
}

// ── token + LCS ──
/** token = คั่นช่องว่าง (ไทยในรายงานเว้นวรรคตาม skeleton — ไม่ตัดคำ) + "/" (ตัวคั่นรายการ: "10-Q/8-K" ≡ "10-Q, 8-K" · "N/A") */
const tok = (s) => String(s || '').split(/[\s/]+/).filter(Boolean);
const PUNCT_EDGE = /^[([{"'“‘«]+|[)\]}"'”’»,;:]+$/g;
const cmpForm = (t) => t.replace(PUNCT_EDGE, '');
function diffRuns(a, b) {
  const A = a.map(cmpForm), Bc = b.map(cmpForm);
  const n = A.length, m = Bc.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === Bc[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const runs = []; let i = 0, j = 0, del = [], ins = [];
  const flush = () => { if (del.length || ins.length) runs.push({ del: del.join(' '), ins: ins.join(' '), ctx: a.slice(Math.max(0, i - del.length - 6), i - del.length).join(' ') }); del = []; ins = []; };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === Bc[j]) { flush(); i++; j++; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { ins.push(b[j]); j++; }
    else { del.push(a[i]); i++; }
  }
  flush();
  return runs;
}

// ── คำ/ตัวเลข ──
/** คีย์คำ: ตัดเครื่องหมาย (คงตัวอักษร/สระ-วรรณยุกต์/ตัวเลข) */
const wordOf = (t) => String(t).replace(/[^\p{L}\p{M}\p{N}]/gu, '');
/** คีย์เทียบ: ตัวเลขในคำ → # (ตัวเลขเปลี่ยนเป็นเรื่องของ number ไม่ใช่คำหาย) */
const keyOf = (t) => wordOf(t).replace(/\p{N}+/gu, '#');
const isWord = (t) => (wordOf(t).match(/\p{L}/gu) || []).length >= 2 && !UNIT_WORD.has(wordOf(t).replace(/^\p{N}+/u, ''));
const VOCAB_KEYS = Object.fromEntries(Object.entries(TEMPLATE_VOCAB).map(([z, ws]) => [z, new Set(ws.map(keyOf))]));
const inVocab = (zone, k) => !!(VOCAB_KEYS[zone] && VOCAB_KEYS[zone].has(k));

function bagSub(a, b) {   // multiset a − b (คีย์) → [token ของ a]
  const cnt = new Map(); for (const t of b) cnt.set(keyOf(t), (cnt.get(keyOf(t)) || 0) + 1);
  const out = []; for (const t of a) { const k = keyOf(t), c = cnt.get(k) || 0; if (c) cnt.set(k, c - 1); else out.push(t); }
  return out;
}
/** run → { kind, lost[], added[] } · kind: number(rounding|value) · symbol · TEXT LOST · text added · text changed */
function classify(run) {
  const d = tok(run.del), i = tok(run.ins);
  const dW = d.filter(isWord), iW = i.filter(isWord);
  const lost = bagSub(dW, iW), added = bagSub(iW, dW);
  if (!lost.length && !added.length) {
    const dn = numsOf(run.del), inn = numsOf(run.ins);
    if (!dn.length && !inn.length) return { kind: 'symbol', lost, added };
    // ตัวเลขที่ v3 เพิ่มเอง (v2 ไม่มีตัวเลขในรันนี้เลย เช่น กรอบ 52 สัปดาห์จาก market.range52w) = info ไม่ใช่ drift (fix round 2 · N-1)
    if (!dn.length) return { kind: 'number added', lost, added };
    const same = dn.length === inn.length && dn.every((x, k) => x.v === inn[k].v);
    return { kind: same ? 'symbol' : `number ${classifyNumber(run.del, run.ins)}`, lost, added };
  }
  if (!i.length) return { kind: 'TEXT LOST', lost, added };
  if (!d.length) return { kind: 'text added', lost, added };
  return { kind: 'text changed', lost, added };
}

// ── structured diff (report-data / stock-meta) ──
const VAL_KEYS = ['px', 'priceDate', 'fvLow', 'fvHigh', 'eps', 'dps', 'bvps', 'shares', 'revenue', 'baseEps', 'analystTgt'];
const money = () => 0.005;
function structured(v2src, view) {
  const rows = [];
  const a = (RM.readReportData(v2src) || {}).data || {}, b = view.rd || {};
  const num = (x) => typeof x === 'number' && isFinite(x);
  const cmp = (p, x, y, tol) => {
    if (x === null && y != null && tol === money) { rows.push({ path: p, v2: null, v3: y }); return; }   // v2 ตั้ง null ชัด ๆ แต่ v3 มีค่า = ค่าที่ v3 สร้างเอง (fix round 1 · M-5)
    if (x == null) return;   // v2 ไม่มีช่องนี้ — v3 เพิ่มข้อมูล ไม่ใช่ drift
    if (num(x) && num(y)) { if (Math.abs(x - y) > tol(x)) rows.push({ path: p, v2: x, v3: y }); return; }
    if (JSON.stringify(x) !== JSON.stringify(y)) rows.push({ path: p, v2: x, v3: y == null ? null : y });
  };
  cmp('fv', a.fv, b.fv, money);
  const av = a.values || {}, bv = b.values || {};
  for (const k of VAL_KEYS) cmp(`values.${k}`, av[k], bv[k], k === 'shares' || k === 'revenue' ? (x) => Math.abs(x) * 1e-9 : money);
  (av.scenarios || []).forEach((s, i) => { const t = (bv.scenarios || [])[i] || {}; cmp(`values.scenarios[${i}].tgt`, s && s.tgt, t.tgt, money); cmp(`values.scenarios[${i}].div`, s && s.div, t.div, money); });
  const ac = a.chart || {}, bc = b.chart || {};
  for (const k of ['min', 'max']) cmp(`chart.${k}`, ac[k], bc[k], money);
  cmp('chart.grid', ac.grid, bc.grid, money);
  // highlight = เซตดัชนีจุดที่ engine วาดวง (ลำดับไม่มีผล) — เทียบแบบเรียงแล้ว
  const srt = (x) => (Array.isArray(x) ? x.slice().sort((p, q) => p - q) : x);
  cmp('chart.highlight', srt(ac.highlight), srt(bc.highlight), money);
  const ag = a.gauge || {}, bg = b.gauge || {};
  for (const k of ['min', 'max']) cmp(`gauge.${k}`, ag[k], bg[k], money);
  const sa = RM.readStockMeta(v2src) || {}, sb = view.sm || {};
  const smRow = (k, bad) => { const x = sa[k], y = sb[k]; if (x == null) return; if (!num(x) || !num(y) ? x !== y : bad(x, y)) rows.push({ path: `sm.${k}`, v2: x, v3: y == null ? null : y }); };
  smRow('pe', (x, y) => Math.abs(x - y) > 0.02 * Math.abs(x));
  smRow('dividendYield', (x, y) => Math.abs(x - y) > 0.05 + 1e-9);
  smRow('mos', (x, y) => Math.abs(x - y) > 0.1 + 1e-9);
  smRow('upside', (x, y) => Math.abs(x - y) > 0.1 + 1e-9);
  smRow('fairValue', (x, y) => Math.abs(x - y) > 0.005 * Math.abs(x));
  return { rows, rd: a };
}

// ── สี ──
function colour(rd, view, doc) {
  const th2 = rd.theme || {}, th3 = view.theme || {};
  const keys = S.THEME_KEYS.filter((k) => !(TH.keyDist(th2[k], th3[k]) <= 12)).map((k) => `${k}: ${th2[k]} → ${th3[k]}`);
  return { keys, themeLegacy: !!(doc && doc.meta && doc.meta.themeLegacy) };
}
const toneList = (s1) => [...String(s1 || '').matchAll(CARD_RE())].map((m) => ((m[2].match(/class="v\s*([^"]*)"/) || [])[1] || '').trim());

/**
 * compare(v2Html, v3Html, doc, view, { v2src }) — v2Html/v3Html = หน้า expandReport ทั้งสองฝั่ง · v2src = ต้นฉบับ v2 ดิบ (report-data/stock-meta)
 * → { zones:[{id, runs:[{kind, del, ins, ctx}]}], textLost, moved, numberValue, numberRounding, templateDropped, rd, colour, tone }
 */
function compare(v2Html, v3Html, doc, view, opts) {
  const o = opts || {};
  const z2 = zones(v2Html), z3 = zones(v3Html);
  const shared = { gen: {} };   // v3 ก่อน — hint/mdesc ที่ generate ใช้ตัดสินฝั่ง v2
  const c2 = { doc, view, dropped: [], shared, mdescKeys: new Set(), syn: [], counted: [], range52: [] }, c3 = { doc, view, dropped: [], shared, mdescKeys: new Set(), syn: [], counted: [], range52: [] };
  const ids = [...new Set([...z2.keys(), ...z3.keys()])];
  const n2 = new Map(), n3 = new Map();
  for (const id of ids) n3.set(id, tok(norm(id, z3.get(id) || '', 'v3', c3)));
  for (const id of ids) n2.set(id, tok(norm(id, z2.get(id) || '', 'v2', c2)));
  const out = { synonym: c2.syn, zones: [], textLost: [], textLostAt: [], moved: [], numberValue: [], numberRounding: [], numberAdded: [], templateDropped: [], rd: [], colour: { keys: [], themeLegacy: false }, tone: [] };
  // กรอบ 52 สัปดาห์ของ header (ค่าตลาด — ไม่เทียบในรัน): หน้า v3 พิมพ์ช่วงที่หน้า v2 ไม่มี/ต่าง = ข้อมูลประกอบ (numberAdded) ไม่ใช่ numberValue (display-fix2 · KLAC)
  c3.range52.forEach((r, i) => { if (r && r !== c2.range52[i]) out.numberAdded.push({ zone: 'header', ins: r, ctx: 'กรอบ 52 สัปดาห์ (market.range52w)' }); });
  const cand = [], mixed = [];
  for (const id of ids) {
    const runs = diffRuns(n2.get(id), n3.get(id)).map((r) => { const c = classify(r); return { kind: c.kind, del: r.del, ins: r.ins, ctx: r.ctx, lost: c.lost }; });
    for (const r of runs) {
      if (r.kind === 'number value') out.numberValue.push({ zone: id, del: r.del, ins: r.ins, ctx: r.ctx });
      else if (r.kind === 'number added') out.numberAdded.push({ zone: id, ins: r.ins, ctx: r.ctx });
      else if (r.kind === 'number rounding') out.numberRounding.push({ zone: id, del: r.del, ins: r.ins, ctx: r.ctx });
      else if ((r.kind === 'text changed' || r.kind === 'TEXT LOST') && numsOf(r.del).length) mixed.push({ zone: id, run: r, n: cand.length + r.lost.length });
      for (const w of r.lost) cand.push({ zone: id, w, run: r });
    }
    out.zones.push({ id, runs: runs.map(({ kind, del, ins, ctx }) => ({ kind, del, ins, ctx })) });
  }
  // containment — (a) คลังคำ template → (b) word bag ทั้งหน้า v3 (นับจำนวน: คำที่ v3 มีน้อยกว่า v2 = หาย) → (c) TEXT LOST
  const count = (m) => { const c = new Map(); for (const ts of m.values()) for (const t of ts) if (isWord(t)) c.set(keyOf(t), (c.get(keyOf(t)) || 0) + 1); return c; };
  const bag2 = count(n2), bag3 = count(n3);
  const lostLeft = new Map();
  const lostRuns = new Set();
  for (const { zone, w, run } of cand) {
    const k = keyOf(w);
    // คลังคำ template เฉพาะ zone ของมัน · คำจาก mdesc ขา computed ใน s3 ไม่ใช้คลังคำ (เป็นคำผู้เขียน — ไม่ใช่ hint/FV box)
    if (inVocab(zone, k) && !(zone === 's3' && c2.mdescKeys.has(k))) { out.templateDropped.push(wordOf(w)); continue; }
    if (!lostLeft.has(k)) lostLeft.set(k, Math.max(0, (bag2.get(k) || 0) - (bag3.get(k) || 0)));
    const left = lostLeft.get(k);
    if (left > 0) { lostLeft.set(k, left - 1); out.textLost.push(wordOf(w)); out.textLostAt.push({ zone, w: wordOf(w) }); lostRuns.add(run); } else out.moved.push(wordOf(w));
  }
  // ตัวเลขในรันที่มีคำเปลี่ยนด้วย (fix round 1 · I-1): text changed เสมอ · TEXT LOST เมื่อคำทุกคำ resolve แล้ว (moved/vocab) — ค่าเปลี่ยน = numberValue
  for (const { zone, run } of mixed) {
    if (run.kind === 'TEXT LOST' && lostRuns.has(run)) continue;
    if (classifyNumber(run.del, run.ins) === 'value') out.numberValue.push({ zone, del: run.del, ins: run.ins, ctx: run.ctx });
  }
  // คำ v2 ที่ transform ทิ้ง (ป้าย (SYM) ใต้ราคา · สเกลเกจ · คำสูตร/คำ generate ของ mdesc ขา computed) — ไม่อยู่ที่ไหนในหน้า v3 เลย ⇒ templateDropped (info)
  const raw3 = new Set(tok(text(String(v3Html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' '))).filter(isWord).map(keyOf));
  for (const w of c2.dropped) if (isWord(w) && !raw3.has(keyOf(w))) out.templateDropped.push(wordOf(w));
  for (const w of c2.counted || []) out.templateDropped.push(w);   // TEMPLATE_COUNTED (ป้าย §6 ≤ 1 ต่อคอลัมน์)
  // structured + สี + tone
  if (o.v2src) {
    const st = structured(o.v2src, view);
    out.rd = st.rows;
    out.colour = colour(st.rd, view, doc);
    // badge/chg = ของตกแต่งที่ v3 derive เอง (theme.js) — info เฉพาะเมื่อ v2 ตั้งค่าเฉพาะใบ (ไม่ใช่ accent/ค่าตั้งต้นของ template)
    const t2 = st.rd.theme || {}, dflt = new Set(['var(--blue-d)', 'var(--blue)', 'var(--green-soft)', 'var(--red-soft)', '#137333', '#c5221f', String(t2.accent || '').trim()]);
    for (const k of ['badge', 'chgBg', 'chgColor']) if (t2[k] != null && !dflt.has(String(t2[k]).trim()) && (view.theme || {})[k] !== t2[k]) out.templateDropped.push(`theme.${k}`);
  }
  const t2 = toneList(z2.get('s1')), t3 = toneList(z3.get('s1'));
  if (JSON.stringify(t2) !== JSON.stringify(t3)) {
    for (let i = 0; i < Math.max(t2.length, t3.length); i++) if (t2[i] !== t3[i]) out.tone.push({ card: i + 1, v2: t2[i] == null ? null : t2[i], v3: t3[i] == null ? null : t3[i] });
  }
  return out;
}

module.exports = { zones, norm, text, tok, diffRuns, classify, classifyNumber, numsOf, compare, structured, TEMPLATE_VOCAB, TEMPLATE_COUNTED, inVocab, keyOf, wordOf, isWord };
