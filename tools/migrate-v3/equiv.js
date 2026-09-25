'use strict';
/**
 * equiv.js — equivalence gate ต่อ zone ของ migration v2→v3 (Plan 4b Task 6 · spec §10.2/§10.3 · plan D2)
 * ทั้งสองฝั่งเป็นหน้า expandReport(...) — v2 = ต้นฉบับดิบ · v3 = expandReport(R.toV2Source(doc, view)) ⇒ zone หาด้วย regex เดียวกัน
 * ลำดับ (advisor pin 6): (1) zones → (2) norm() = transform ที่อนุมัติ ใช้กับ **ทั้งสองฝั่ง** → (3) LCS ระดับคำ → classify
 *   → (4) containment: คำที่หายเทียบ TEMPLATE_VOCAB (templateDropped) → word bag ทั้งหน้า v3 (moved) → ที่เหลือ = TEXT LOST (HUMAN)
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

// ── คลังคำที่ template v2 พิมพ์แล้ว template v3 ทิ้ง/แทน (ปิด — เพิ่มได้ผ่าน review เท่านั้น · ทุกคำเพิ่มต้องมีคอมเมนต์ fixture + zone) ──
const TEMPLATE_VOCAB = new Set([
  // seed (plan Task 6 Step 3)
  'เฉลี่ย', 'มัธยฐาน', 'ราคา', 'ณ', '≈', 'TTM', 'ปัจจุบัน', 'มูลค่าเหมาะสม', 'Fair', 'Value', 'กรอบ', 'เป้าหมาย', 'ปี', 'ออก',
  'ปันผลรวม', 'สถานการณ์', 'จุดเข้า', 'ฐาน', 'EPS', 'รอบปี', 'ตั้งแต่', 'IPO', 'ราย', 'เป้านักวิเคราะห์', 'ด.', 'ส่วนต่างจากราคา',
  'MOS', 'ที่มา', 'สัปดาห์', 'Stock', 'Analysis', 'Dashboard', 'ข้อมูล', 'สร้างด้วย', 'stock-analyzer', 'workflow', 'คำเตือน', 'โดยประมาณ',
]);

// ── ข้อความ ──
const ENT = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', ndash: '–', mdash: '—', minus: '−', times: '×', bull: '•', middot: '·', rarr: '→', hellip: '…' };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m));
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** HTML → ข้อความที่มองเห็น — ตัด emoji (Extended_Pictographic + variation selector + ZWJ) · ≈ → ณ (transform ที่อนุมัติ) */
function text(h) {
  return decode(String(h || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\p{Extended_Pictographic}|[\uFE0E\uFE0F\u200D]/gu, ' ').replace(/≈/g, 'ณ').replace(/\s+/g, ' ').trim();
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
  'ราคาหุ้นมีความผันผวนสูง ผู้ลงทุนควรศึกษาข้อมูลเพิ่มเติมและพิจารณาความเสี่ยงของตนเองก่อนตัดสินใจ',
];
const S6_LAST = /^สถานการณ์/;
const THAI_MONTH = { 'มกราคม': 'ม.ค.', 'กุมภาพันธ์': 'ก.พ.', 'มีนาคม': 'มี.ค.', 'เมษายน': 'เม.ย.', 'พฤษภาคม': 'พ.ค.', 'มิถุนายน': 'มิ.ย.',
  'กรกฎาคม': 'ก.ค.', 'สิงหาคม': 'ส.ค.', 'กันยายน': 'ก.ย.', 'ตุลาคม': 'ต.ค.', 'พฤศจิกายน': 'พ.ย.', 'ธันวาคม': 'ธ.ค.' };
const CTX_SUFFIX = '(บริบท — ไม่นับใน FV)';
const S6_DIV = /ปันผล|distribution|dividend|\bdiv\b/i;
const S6_EXIT = /ออก|exit/i;
const LEG_RE = /(<div class="vmethod">\s*<div>\s*<div class="mname">)([\s\S]*?)(<\/div>\s*)(?:(<div class="mdesc">)([\s\S]*?)(<\/div>))?/g;
const CARD_RE = () => new RegExp(DV.CARD_SRC, 'g');

/** ป้าย .d ของ template บน view (ไม่มี note) — null ถ้า render ไม่ได้ */
function templateCard(key, view) { try { return K.renderCard(key, view); } catch (_) { return null; } }
/** ตัด prefix ที่เท่ากับ .d ของ template (กระจกของ cards.js noteFor) */
function stripTemplateD(dText, td) {
  if (!td) return dText;
  if (dText === td) return '';
  if (dText.startsWith(td)) return dText.slice(td.length).replace(/^[\s·•,;:—–-]+/, '').trim();
  return dText;
}

/**
 * norm(zoneId, html, side, ctx) → ข้อความหลัง transform ที่อนุมัติ · ctx = { doc, view, dropped: [] (คำ v2 ที่ mdesc ขา computed ทิ้ง), shared: {} (genHint — ฝั่ง v3 รันก่อน) }
 * ฝั่ง v2/v3 ใช้กฎเดียวกันทุกข้อ — ต่างกันเฉพาะที่ template v3 พิมพ์ข้อความ generate (hint/mdesc) ซึ่ง v2 ไม่มีคู่
 */
function norm(zoneId, html, side, ctx) {
  const { doc, view } = ctx;
  let h = String(html || '');
  const sym = doc && doc.symbol;
  if (zoneId === 'header') {
    if (sym) h = h.replace(/(<h1[^>]*>[\s\S]*?)\s*\(\s*([A-Z0-9.\-]+)\s*\)\s*(<\/h1>)/, (m, a, s, c) => (s === sym ? a + c : m));
    // gauge dots + (SYM) ใต้ราคา = ของตกแต่ง/ป้ายของ template (spec §10.2 b "gauge dots") — v2 บางใบใส่ข้อความในนั้น → templateDropped
    h = h.replace(/(<div class="gdots">)([\s\S]*?)(<\/div>\s*<div>)/, (m, a, g, c) => { if (side === 'v2') ctx.dropped.push(...tok(text(g))); return a + c; });
    // <small> แรกใน .price-row = "(SYM)" ใต้ราคา (ไม่อ้าง regex ของ .px — เจ้าของเดียวคือ report-meta.js · parser-lint)
    h = h.replace(/(<div class="price-row">[\s\S]*?)<small>([\s\S]*?)<\/small>/, (m, a, g) => { if (side === 'v2') ctx.dropped.push(...tok(text(g))); return a; });
    // ป้ายตายตัวของ px-meta (ทุกรูปที่ v2 เขียน: "ราคา ณ" · "ราคาปิด ณ" · "ปิดตลาด ณ" · "ราคาปิด <วันที่>" · "ช่วง/กรอบ 52 สัปดาห์" · "52wk:" · "ที่มา:")
    let tx = text(h);
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
    const labelOf = (s) => text(s).replace(/^\d+\.\s*/, '').replace(/\(บริบท — ไม่นับใน FV\)\s*$/, '').trim();
    const idxOf = (j, mname) => {
      if (found.length === legs.length) return j;
      const lab = labelOf(mname); const k = vl.findIndex((l) => l && text(l.label) === lab); return k;
    };
    let j = 0;
    h = h.replace(LEG_RE, (m, a, mname, b, dOpen, mdesc, dClose) => {
      const k = idxOf(j++, mname);
      // เลขนำหน้า + ป้ายขาบริบทที่ template ต่อท้าย (รูปตรงตัวเท่านั้น — รูปอื่นของผู้เขียนยังเทียบ)
      const nm = mname.replace(/^\s*\d+\.\s*/, '').split(CTX_SUFFIX).join(' ');
      const leg = k >= 0 ? legs[k] : null;
      let d = dOpen ? dOpen + mdesc + dClose : '';
      if (leg && leg.method !== 'declared' && dOpen) {
        // ขา computed: mdesc = ข้อความ generate (v3) / คำอธิบายสูตรของผู้เขียน (v2) — transform ที่อนุมัติ (spec §10.2 b) · คำ v2 ที่หาย → templateDropped
        if (side === 'v2') ctx.dropped.push(...tok(text(mdesc)));
        d = dOpen + dClose;
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
  if (zoneId === 's2' || zoneId === 's6') {
    // ป้ายหัวหมวด 2/6 (.s-head .hint) — v3 พิมพ์ข้อความ template ตายตัว ("โดยประมาณ" · "จากจุดเข้า … • EPS ฐาน …") ไม่มีช่องใน schema
    // = zone "hint" ของ template ใน spec §10.2 b · ไม่เงียบ: คำ v2 ที่ไม่อยู่ที่ไหนในหน้า v3 → templateDropped (ตาราง sweep เห็น)
    h = h.replace(/(<div class="s-head">[\s\S]*?<div class="hint">)([\s\S]*?)(<\/div>\s*<\/div>)/, (m, a, hint, c) => {
      if (side === 'v2') ctx.dropped.push(...tok(text(hint)));
      return a + c;
    });
  }
  if (zoneId === 's2') {
    // legend ของกราฟ ("ราคา SYM" · "มูลค่าเหมาะสม {{fv}}" · "จุดสำคัญ") = ป้ายของ template · ค่า fv อยู่ใน structured diff
    h = h.replace(/(<div class="legend">)([\s\S]*?)(<\/div>)/, (m, a, g, c) => { if (side === 'v2') ctx.dropped.push(...tok(text(g))); return a + c; });
  }
  if (zoneId === 's4') {
    // ป้ายสเกลเกจ (<small> ใน .scale) — v3 generate จาก values (MOS 30%/MOS 20%/Fair Value/กรอบบน FV/เป้าเฉลี่ย Analyst) · ค่าตัวเลขยังเทียบ
    h = h.replace(/<div class="scale">[\s\S]*?(?=<\/div>\s*<\/div>)/, (sc) => sc.replace(/<small>([\s\S]*?)<\/small>/g, (m, g) => { if (side === 'v2') ctx.dropped.push(...tok(text(g))); return ' '; }));
  }
  if (zoneId === 's5') {
    h = h.replace(/<div class="grid g3">[\s\S]*?(?=<div class="calc">)/, ' ');
    h = h.replace(/<label>[\s\S]*?<\/label>/, ' ');
  }
  if (zoneId === 's6') {
    // .top: ชื่อฉาก + ป้าย driver ก่อนตัวเลขการเติบโต (v2 เขียนหลายรูป: "EPS" · "ยอดขาย" · "รายได้ CAGR" …) = ป้ายของ template · ตัวเลข + คำหลังตัวเลขยังเทียบ
    h = h.replace(/<div class="top"><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span>/g, (m, name, g) => {
      const t = text(g), at = t.search(/[+\-−±]?\d/), lab = at > 0 ? t.slice(0, at) : at < 0 ? t : '';
      if (side === 'v2') ctx.dropped.push(...tok(text(name)), ...tok(lab));
      return `<div class="top"><span></span><span>${escHtml(at >= 0 ? t.slice(at) : '')}</span>`;
    });
    // ป้ายแถว (span แรกของ li) ตามบทบาท: แถวแรก = driver ปี N · แถวตัวคูณออก (ป้ายมี ออก/exit · ไม่มี = แถวที่ 2) · แถวปันผล · แถวสุดท้าย = สถานการณ์ — v3 พิมพ์ป้ายเอง
    // แถวอื่น (ผู้เขียนเพิ่มเอง เช่น "เงินสดสุทธิปี 3") เทียบเต็ม
    h = h.replace(/<ul>([\s\S]*?)<\/ul>/g, (m, ul) => {
      const rows = [...ul.matchAll(/<li><span>([\s\S]*?)<\/span>/g)].map((x) => text(x[1]));
      const ex = rows.findIndex((t, i) => i > 0 && S6_EXIT.test(t)), exitIdx = ex > 0 ? ex : 1;
      let r = 0;
      return '<ul>' + ul.replace(/<li><span>([\s\S]*?)<\/span>/g, (li, lab) => {
        const i = r++, last = rows.length - 1, t = rows[i];
        const role = i === 0 || i === exitIdx || (i === last && S6_LAST.test(t)) || (i > 0 && i < last && i !== exitIdx && S6_DIV.test(t));
        if (!role) return li;
        if (side === 'v2') ctx.dropped.push(...tok(t));
        return '<li><span></span>';
      }) + '</ul>';
    });
    return text(h).replace(/(^|\s)~/g, '$1').replace(/\s+/g, ' ').trim();
  }
  if (zoneId === 's8') {
    h = h.replace(/<div class="vcell"><div class="k">([\s\S]*?)<\/div>([\s\S]*?)<\/div><\/div>/g, (m, k, rest) => (/เป้านักวิเคราะห์/.test(text(k)) ? ' ' : `<div class="vcell"><div class="k"></div>${rest}</div></div>`));
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
// หน่วยท้ายตัวเลข (ล้าน/พันล้าน/M/B …) เป็นส่วนของตัวเลข — "$2,070M" ≡ "$2.07B" · ไม่ใช่คำของผู้เขียน
const UNIT = { 'ล้านล้าน': 1e12, 'แสนล้าน': 1e11, 'หมื่นล้าน': 1e10, 'พันล้าน': 1e9, 'ร้อยล้าน': 1e8, 'ล้านบาท': 1e6, 'ล้าน': 1e6, 'พัน': 1e3,
  'พันล.': 1e9, 'ลบ.': 1e6, 'ล.': 1e6, T: 1e12, B: 1e9, M: 1e6, K: 1e3, bn: 1e9, mn: 1e6, billion: 1e9, million: 1e6 };
const UNIT_SRC = Object.keys(UNIT).sort((a, b) => b.length - a.length).map(reEsc).join('|');
const NUM_RE = new RegExp(`(?:^|[^0-9.,])([-−]?)([0-9][0-9,]*(?:\\.[0-9]+)?)(?:\\s?(${UNIT_SRC})(?![A-Za-z\u0E00-\u0E7F]))?`, 'gu');
const UNIT_WORD = new Set(Object.keys(UNIT).map((u) => u.replace(/[^\p{L}\p{M}\p{N}]/gu, '')));
function numsOf(s) {
  const out = [];
  for (const m of String(s).matchAll(NUM_RE)) {
    const raw = m[2].replace(/[.,]$/, '');
    const dec = /\.([0-9]+)$/.exec(raw), sc = m[3] ? UNIT[m[3]] : 1;
    out.push({ v: (m[1] ? -1 : 1) * parseFloat(raw.replace(/,/g, '')) * sc, half: 0.5 * Math.pow(10, -(dec ? dec[1].length : 0)) * sc });
  }
  return out;
}
/** ตัวเลขสองฝั่ง: 'rounding' ถ้าทุกคู่ห่าง ≤ ครึ่งหน่วยของทศนิยมที่พิมพ์หยาบกว่า · ไม่งั้น 'value' */
function classifyNumber(a, b) {
  const x = numsOf(a), y = numsOf(b);
  if (!x.length || x.length !== y.length) return 'value';
  return x.every((p, i) => Math.abs(p.v - y[i].v) <= Math.max(p.half, y[i].half) * (1 + 1e-9)) ? 'rounding' : 'value';
}
/** คีย์คำ: ตัดเครื่องหมาย (คงตัวอักษร/สระ-วรรณยุกต์/ตัวเลข) */
const wordOf = (t) => String(t).replace(/[^\p{L}\p{M}\p{N}]/gu, '');
/** คีย์เทียบ: ตัวเลขในคำ → # (ตัวเลขเปลี่ยนเป็นเรื่องของ number ไม่ใช่คำหาย) */
const keyOf = (t) => wordOf(t).replace(/\p{N}+/gu, '#');
const isWord = (t) => (wordOf(t).match(/\p{L}/gu) || []).length >= 2 && !UNIT_WORD.has(wordOf(t).replace(/^\p{N}+/u, ''));
const VOCAB_KEYS = new Set([...TEMPLATE_VOCAB].map(keyOf));

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
    const same = dn.length === inn.length && dn.every((x, k) => x.v === inn[k].v);
    return { kind: same ? 'symbol' : `number ${classifyNumber(run.del, run.ins)}`, lost, added };
  }
  if (!i.length) return { kind: 'TEXT LOST', lost, added };
  if (!d.length) return { kind: 'text added', lost, added };
  return { kind: 'text changed', lost, added };
}

// ── structured diff (report-data / stock-meta) ──
const VAL_KEYS = ['px', 'priceDate', 'fvLow', 'fvHigh', 'eps', 'dps', 'bvps', 'shares', 'revenue', 'baseEps', 'analystTgt'];
function structured(v2src, view) {
  const rows = [];
  const a = (RM.readReportData(v2src) || {}).data || {}, b = view.rd || {};
  const num = (x) => typeof x === 'number' && isFinite(x);
  const cmp = (p, x, y, tol) => {
    if (x == null) return;   // v2 ไม่มีช่องนี้ — v3 เพิ่มข้อมูล ไม่ใช่ drift
    if (num(x) && num(y)) { if (Math.abs(x - y) > tol(x)) rows.push({ path: p, v2: x, v3: y }); return; }
    if (JSON.stringify(x) !== JSON.stringify(y)) rows.push({ path: p, v2: x, v3: y == null ? null : y });
  };
  const money = () => 0.005;
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
  const shared = {};   // v3 ก่อน — hint ที่ generate ใช้ตัดสินฝั่ง v2
  const c2 = { doc, view, dropped: [], shared }, c3 = { doc, view, dropped: [], shared };
  const ids = [...new Set([...z2.keys(), ...z3.keys()])];
  const n2 = new Map(), n3 = new Map();
  for (const id of ids) n3.set(id, tok(norm(id, z3.get(id) || '', 'v3', c3)));
  for (const id of ids) n2.set(id, tok(norm(id, z2.get(id) || '', 'v2', c2)));
  const out = { zones: [], textLost: [], textLostAt: [], moved: [], numberValue: [], numberRounding: [], templateDropped: [], rd: [], colour: { keys: [], themeLegacy: false }, tone: [] };
  const cand = [];
  for (const id of ids) {
    const runs = diffRuns(n2.get(id), n3.get(id)).map((r) => { const c = classify(r); return { kind: c.kind, del: r.del, ins: r.ins, ctx: r.ctx, lost: c.lost }; });
    for (const r of runs) {
      if (r.kind === 'number value') out.numberValue.push({ zone: id, del: r.del, ins: r.ins, ctx: r.ctx });
      else if (r.kind === 'number rounding') out.numberRounding.push({ zone: id, del: r.del, ins: r.ins, ctx: r.ctx });
      for (const w of r.lost) cand.push({ zone: id, w });
    }
    out.zones.push({ id, runs: runs.map(({ kind, del, ins, ctx }) => ({ kind, del, ins, ctx })) });
  }
  // containment — (a) คลังคำ template → (b) word bag ทั้งหน้า v3 (นับจำนวน: คำที่ v3 มีน้อยกว่า v2 = หาย) → (c) TEXT LOST
  const count = (m) => { const c = new Map(); for (const ts of m.values()) for (const t of ts) if (isWord(t)) c.set(keyOf(t), (c.get(keyOf(t)) || 0) + 1); return c; };
  const bag2 = count(n2), bag3 = count(n3);
  const lostLeft = new Map();
  for (const { zone, w } of cand) {
    const k = keyOf(w);
    if (VOCAB_KEYS.has(k)) { out.templateDropped.push(wordOf(w)); continue; }
    if (!lostLeft.has(k)) lostLeft.set(k, Math.max(0, (bag2.get(k) || 0) - (bag3.get(k) || 0)));
    const left = lostLeft.get(k);
    if (left > 0) { lostLeft.set(k, left - 1); out.textLost.push(wordOf(w)); out.textLostAt.push({ zone, w: wordOf(w) }); } else out.moved.push(wordOf(w));
  }
  // คำ v2 ใน mdesc ขา computed ที่ transform ทิ้ง — ไม่อยู่ที่ไหนในหน้า v3 เลย ⇒ บันทึกเป็น templateDropped (info)
  const raw3 = new Set(tok(text(String(v3Html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' '))).filter(isWord).map(keyOf));
  for (const w of c2.dropped) if (isWord(w) && !raw3.has(keyOf(w))) out.templateDropped.push(wordOf(w));
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

module.exports = { zones, norm, text, tok, diffRuns, classify, classifyNumber, compare, structured, TEMPLATE_VOCAB, keyOf, wordOf };
