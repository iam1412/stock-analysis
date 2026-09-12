'use strict';
/**
 * field-manifest.js — ทุกช่องตัวเลขในรายงาน (code-audit §1.1 — **70 แถว** เลขแถว #1–#68 + #25b/#63b)
 * ในไฟล์เดียวที่โค้ดใช้จริง (spec WS1)
 * แต่ละช่อง: ใครเขียน (cron/worker) · ใครตรวจ (gate code) · healer · cadence · extractor ที่คืน {found, value}
 * ★ extractor **ห่อ** ของที่มีอยู่ (report-meta · derived-values · buildCtx) — ห้ามเขียน regex ซ้ำ (parser-lint)
 *   regex ใหม่ได้เฉพาะ 18 แถว NEITHER ที่ไม่มีใครอ่านมาก่อน (f13 f23 f24 f25 f25b f32 f33 f41 f46 f47 f48 f49 f54 f55 f58 f60 f61 f63b)
 * required: ตัดสินแล้วทุกช่อง (Task 9 · census 12 ก.ย. 69 — `manifest-census.md`): พบ ≥99% ของคลัง = `true`
 *   (ขาด = ของเสีย → W21) · <99% = `false` (ไม่มีก็ปกติ → นับเป็น "ข้าม" ไม่ใช่ "หาย")
 *   **ยกเว้น 3 ช่องที่อัตรา ≥99% แต่คง `false`** (f36/f38/f68 — opt-in / ของตกแต่ง / sidecar นอกไฟล์ · เหตุผลกำกับท้าย entry)
 *   ⇒ `true` 32 ช่อง · `false` 38 ช่อง · ไม่มี `null` เหลือ
 *
 * ★ ctx = ผลของ buildCtx (test/check-reports.js) — manifest **ไม่** parse ซ้ำสิ่งที่ ctx มีแล้ว
 *   (f11/f42 ใช้ ctx.header แทนที่จะ match <header> เอง · f68 ใช้ ctx.tagData แทน loadTags() ต่อไฟล์)
 */
const RM = require('./report-meta.js');
const DV = require('./derived-values.js');
const PD = require('./price-date.js');
const { footerDate } = require('./queue/footer-date.js');

const grab = (re, h) => { const m = String(h == null ? '' : h).match(re); return m ? m[1] : null; };
const num = (s) => { if (s == null) return null; const m = String(s).replace(/−/g, '-').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const has = (v) => v != null && !(typeof v === 'number' && !Number.isFinite(v));
const R = (value) => ({ found: has(value), value });
const card = (ctx, re) => (ctx.cards || []).find((c) => re.test(c.k)) || null;
const cardNum = (ctx, re) => { const c = card(ctx, re); return c ? num(c.v) : null; };
const rd = (ctx) => (ctx.rd && ctx.rd.ok ? ctx.rd.data : null);
const sm = (ctx) => (ctx.sm && ctx.sm.ok ? ctx.sm.data : null);
const CUR = RM.CUR_SRC;
const disc = (html) => grab(/(<div class="disc">[\s\S]*?<\/div>)/i, html) || '';
const vcell = (html, k) => grab(new RegExp('<div class="k">' + k + '</div>\\s*<div class="v"[^>]*>([\\s\\S]*?)</div>'), html);
/** หัวรายงาน — buildCtx แยกไว้ให้แล้ว (ctx.header) ⇒ ไม่ match <header> ซ้ำในไฟล์นี้ */
const head = (ctx) => (ctx && ctx.header) || '';
// f63b — % ส่วนต่างจาก ATH ในร้อยแก้ว · คลังจริงเขียนสองลำดับ: "~−34% จาก ATH" (7 ใบ) · "ต่ำกว่า ATH ~50%" (2 ใบ)
// ★ วัด 12 ก.ย. 69: รูป "จาก ATH −X%" (เลขหลัง) ไม่มีในคลังเลย (0/908) ⇒ ต้องจับสองทาง
const ATH_PCT_RE = /([+\-−–]?\s*[\d.]+)\s*%\s*จาก\s*ATH|(?:จาก|ต่ำกว่า)\s*ATH\s*~?\s*([+\-−–]?\s*[\d.]+)\s*%/;

const F = (id, name, o) => ({ id, name, cadence: o.cadence, owner: o.owner, gate: o.gate || [], healer: o.healer || null,
  required: o.required === undefined ? null : o.required, binding: o.binding, pair: o.pair || null, extract: o.extract });

const FIELDS = [
  F('f01', '.px ราคา header', { cadence: 'daily', owner: 'cron', gate: ['E30', 'E23'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(c.px) }),  // census 12 ก.ย. 69: 100.0%
  F('f02', 'stock-meta.price', { cadence: 'daily', owner: 'cron', gate: ['E29', 'E30', 'E31'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(sm(c) && sm(c).price) }),  // census 12 ก.ย. 69: 100.0%
  F('f03', 'report-data.gauge.cur', { cadence: 'daily', owner: 'cron', gate: ['E19'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(rd(c) && rd(c).gauge && rd(c).gauge.cur) }),  // census 12 ก.ย. 69: 100.0%
  F('f04', 'report-data.chart.data[]', { cadence: 'daily', owner: 'cron', gate: ['E36', 'E37', 'E39', 'W12'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => { const d = rd(c) && rd(c).chart && rd(c).chart.data; return { found: Array.isArray(d) && d.length > 0, value: Array.isArray(d) ? d.length : null }; } }),  // census 12 ก.ย. 69: 100.0%
  F('f05', 'chart.min/max/grid', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => { const ch = rd(c) && rd(c).chart; return R(ch && has(ch.min) && has(ch.max) ? [ch.min, ch.max] : null); } }),  // census 12 ก.ย. 69: 100.0%
  F('f06', 'chart.highlight', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(rd(c) && rd(c).chart && rd(c).chart.highlight) }),  // census 12 ก.ย. 69: 100.0%
  F('f07', 'gauge.min/max', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => { const g = rd(c) && rd(c).gauge; return R(g && has(g.min) && has(g.max) ? [g.min, g.max] : null); } }),  // census 12 ก.ย. 69: 100.0%
  F('f08', 'theme.chgBg/chgColor', { cadence: 'daily', owner: 'cron', gate: ['E34'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => { const t = rd(c) && rd(c).theme; return R(t && t.chgBg && t.chgColor ? [t.chgBg, t.chgColor] : null); } }),  // census 12 ก.ย. 69: 100.0%
  F('f09', '.chg ป้าย % รอบปี', { cadence: 'daily', owner: 'cron', gate: ['E35', 'E36'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(c.chg) }),  // census 12 ก.ย. 69: 100.0%
  F('f10', 'วันที่ราคา (px-meta)', { cadence: 'daily', owner: 'cron', gate: ['E27', 'W09'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(c.priceAge && c.priceAge.iso) }),  // census 12 ก.ย. 69: 100.0%
  F('f11', 'วันที่ทวนในวงเล็บ (คนละศักราช)', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'pair', pair: { with: 'f10', how: 'date' }, required: false, extract: (h, c) => { const hd = head(c); const hit = PD.findPriceDate(hd); const r = hit ? PD.findRestatedDate(hd, hit) : null; return R(PD.dateIso(r)); } }),
  // ★ ต้องเป็น `findDiscPriceDate` (เจ้าของเดียวของ "วันที่ราคาในบล็อก .disc") ไม่ใช่ตัวสแกนหัวรายงาน —
  //   ตัวอ่านตัวนี้กับตัวเขียนของ cron เป็นตัวเดียวกันแล้ว (12 ก.ย. 69) ⇒ ที่นี่อ่านเจอ = ที่นั่นเขียนได้เสมอ
  //   (snapshot ของแหล่ง "(ราคา $79.39 · 2 ก.ค. 2569 …)" ไม่ใช่วันที่ราคา ⇒ คืน null โดยตั้งใจ)
  F('f12', 'disclaimer "ราคา ณ"', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'pair', pair: { with: 'f10', how: 'date' }, required: false, extract: (h) => R(PD.findDiscPriceDate(disc(h))) }),  // census 12 ก.ย. 69: 46.4% <99% → optional (421/908 ใบ)
  F('f13', 'footer "ข้อมูล ณ"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => { const f = footerDate(h); return R(f && f.iso); } }),  // census 12 ก.ย. 69: 98.7% <99% → optional
  F('f14', 'pxIn value', { cadence: 'daily', owner: 'cron', gate: ['E23'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(c.pxInput) }),  // census 12 ก.ย. 69: 100.0%
  F('f15', 'MOS .big', { cadence: 'daily', owner: 'cron', gate: ['E16', 'E30'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(c.mosBig) }),  // census 12 ก.ย. 69: 100.0%
  F('f16', 'stock-meta.mos/upside', { cadence: 'daily', owner: 'cron', gate: ['E30', 'E31'], healer: 'patchReport', binding: 'cron', required: true, extract: (h, c) => R(sm(c) && has(sm(c).mos) && has(sm(c).upside) ? [sm(c).mos, sm(c).upside] : null) }),  // census 12 ก.ย. 69: 100.0%
  F('f17', 'vcell ส่วนต่างจากราคา — ตัวเลข', { cadence: 'daily', owner: 'cron', gate: ['W06'], healer: 'patchDerived#11', binding: 'cron', required: true, extract: (h) => { const s = DV.readSummaryCell(h); return R(s ? s.shown : null); } }),  // census 12 ก.ย. 69: 99.7%
  F('f18', 'vcell ส่วนต่างจากราคา — ข้อความ', { cadence: 'daily', owner: 'cron', gate: ['W06'], healer: 'patchDerived#11', binding: 'cron', required: true, extract: (h) => { const s = DV.readSummaryCell(h); return R(s ? s.text : null); } }),  // census 12 ก.ย. 69: 99.9%
  F('f19', 'class mos-verdict', { cadence: 'daily', owner: 'cron', gate: ['W04'], healer: 'patchReport', binding: 'cron', required: true, extract: (h) => R(grab(RM.VERDICT_CLASS_RE, h)) }),  // census 12 ก.ย. 69: 100.0%
  F('f20', 'การ์ด P/E', { cadence: 'daily', owner: 'cron', gate: ['E41'], healer: 'patchDerived#1', binding: 'cron', required: false, extract: (h) => { const p = DV.peCards(h)[0]; return R(p ? p.shown : null); } }),
  F('f21', 'stock-meta.pe', { cadence: 'daily', owner: 'cron', gate: ['E41', 'W10'], healer: 'patchDerived#2', binding: 'cron', required: false, extract: (h, c) => R(sm(c) && sm(c).pe) }),
  F('f22', 'การ์ดเป้านักวิเคราะห์ — %', { cadence: 'daily', owner: 'cron', gate: ['E42'], healer: 'patchDerived#3', binding: 'cron', required: false, extract: (h) => { const t = DV.targetCells(h)[0]; return R(t ? t.shown : null); } }),
  F('f23', 'การ์ดเป้านักวิเคราะห์ — ราคา', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => { const t = DV.targetCells(h)[0]; return R(t ? t.target : null); } }),
  F('f24', 'เป้านักวิเคราะห์บน gauge scale', { cadence: 'write-once', owner: 'worker', gate: ['E26'], healer: null, binding: 'pair', pair: { with: 'f23', how: 'money' }, required: false, extract: (h) => R(num(grab(new RegExp(CUR + '?\\s*([\\d.,]+)\\s*<br><small>เป้า(?:เฉลี่ย)?\\s*Analyst'), h))) }),
  F('f25', 'rating นักวิเคราะห์', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => R(grab(/\(([A-Za-z][A-Za-z /-]{2,30})\)/, vcell(h, 'เป้านักวิเคราะห์[^<]*') || '')) }),
  F('f25b', 'จำนวนสำนัก n=', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => R(num(grab(/\bn\s*=\s*(\d+)/, h))) }),
  F('f26', 'การ์ด Market Cap', { cadence: 'daily', owner: 'cron', gate: ['E43'], healer: 'patchDerived#5', binding: 'cron', required: false, extract: (h, c) => { const m = c.px > 0 ? DV.mcapCards(h, c.px)[0] : null; return R(m ? m.shown : null); } }),
  F('f27', 'จำนวนหุ้น (.d ของ Market Cap)', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => { const m = c.px > 0 ? DV.mcapCards(h, c.px)[0] : null; return R(m ? m.shares : null); } }),
  F('f28', 'การ์ด P/S', { cadence: 'daily', owner: 'cron', gate: ['W16'], healer: 'patchDerived#6', binding: 'cron', required: false, extract: (h) => { const p = DV.psCards(h)[0]; return R(p ? p.shown : null); } }),
  F('f29', 'การ์ดปันผล %', { cadence: 'daily', owner: 'cron', gate: ['W19'], healer: 'patchDerived#8', binding: 'cron', required: false, extract: (h, c) => { const p = c.px > 0 ? DV.yieldPlan(h, c.px) : null; return R(p && p.cards[0] ? p.cards[0].shown : null); } }),
  F('f30', 'stock-meta.dividendYield', { cadence: 'daily', owner: 'cron', gate: ['W19', 'W10'], healer: 'patchDerived#9', binding: 'cron', required: false, extract: (h, c) => R(sm(c) && sm(c).dividendYield) }),
  F('f31', 'การ์ด P/BV', { cadence: 'daily', owner: 'cron', gate: ['W20'], healer: 'patchDerived#10', binding: 'cron', required: false, extract: (h, c) => { const p = c.px > 0 ? DV.pbvPlan(h, c.px)[0] : null; return R(p && p.items && p.items[0] ? p.items[0].shown : null); } }),
  F('f32', 'การ์ด BVPS', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /^BVPS/i)) }),
  F('f33', 'การ์ด EPS (TTM)', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /^EPS/i)) }),
  F('f34', 'หมวด 6 ผลตอบแทนรวม %', { cadence: 'daily', owner: 'cron', gate: ['W17'], healer: 'patchDerived#7', binding: 'cron', required: false, extract: (h, c) => { const p = c.px > 0 ? DV.scenarioPlan(h, c.px) : null; return R(p ? p.items.map((it) => it.total ? DV.retShown(it.total.token) : null) : null); } }),
  F('f35', 'หมวด 6 %/ปี', { cadence: 'daily', owner: 'cron', gate: ['W17'], healer: 'patchDerived#7', binding: 'cron', required: false, extract: (h, c) => { const p = c.px > 0 ? DV.scenarioPlan(h, c.px) : null; return R(p && p.items.some((it) => it.py) ? p.items.map((it) => it.py ? DV.retShown(it.py.token) : null) : null); } }),
  F('f36', 'หมวด 6 "จากจุดเข้า"', { cadence: 'daily', owner: 'cron', gate: ['W17'], healer: 'patchDerived#7', binding: 'cron', required: false, extract: (h) => { const b = DV.scenarioBlock(h); return R(b && b.hint ? b.hint.value : null); } }),  // census 12 ก.ย. 69: 99.9% แต่คง false — ช่อง opt-in ของหมวด 6 (hint "จากจุดเข้า") — ใบที่ไม่เขียน hint ไม่ใช่ของเสีย
  F('f37', 'หมวด 6 ราคาเป้า 3 ฉาก', { cadence: 'write-once', owner: 'worker', gate: ['W01'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.scenarios.length === 3 && c.scenarios.every((s) => s.tgt > 0) ? c.scenarios.map((s) => s.tgt) : null) }),  // census 12 ก.ย. 69: 100.0%
  F('f38', 'หมวด 6 class ret pos/neg', { cadence: 'never', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => { const m = h.match(/class="ret (pos|neg)"/g); return R(m ? m.length : null); } }),  // census 12 ก.ย. 69: 100.0% แต่คง false — นับ class ret pos/neg = ของตกแต่งที่ build ใส่ ไม่ใช่ค่าที่ผู้เขียนต้องกรอก
  F('f39', 'หมวด 6 ปันผลรวม 3 ปี', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(c.scenarios.some((s) => s.div != null) ? c.scenarios.map((s) => s.div) : null) }),
  F('f40', 'หมวด 6 EPS ฐาน', { cadence: 'write-once', owner: 'worker', gate: ['E24'], healer: null, binding: 'gate', required: false, extract: (h, c) => R(c.baseEPS) }),  // census 12 ก.ย. 69: 85.4% <99% → optional
  F('f41', 'กรอบ 52 สัปดาห์', { cadence: 'stale-daily', owner: 'worker', gate: ['W08'], healer: null, binding: 'pair', pair: { with: 'f01', how: 'contains', stale: true }, required: false, extract: (h) => { const m = h.match(RM.RANGE52_RE); return R(m ? [num(m[1]), num(m[2])] : null); } }),  // census 12 ก.ย. 69: 87.2% <99% → optional
  // ★ ห่อ **บรรทัดเดียวกับที่ W08 นับแหล่ง** (ctx.sourceLine = SOURCE_LINE บน stripTags(header)) ไม่ใช่สำเนาที่แคบกว่า
  //   — เดิมที่นี่รับเฉพาะคำว่า "ที่มา:" ⇒ ใบที่เขียน "แหล่งข้อมูล:" ก็ยังนับว่าพบ (คนละบรรทัดกับที่ gate ตรวจ)
  F('f42', 'บรรทัดที่มา', { cadence: 'write-once', owner: 'worker', gate: ['W08'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.sourceLine) }),  // census 12 ก.ย. 69: 100.0%
  F('f43', '.fv-box .r FV', { cadence: 'write-once', owner: 'worker', gate: ['E15', 'E25', 'E30'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.fvBox) }),  // census 12 ก.ย. 69: 100.0%
  F('f44', 'report-data.fv (const FV)', { cadence: 'write-once', owner: 'worker', gate: ['E15'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.constFV) }),  // census 12 ก.ย. 69: 100.0%
  F('f45', 'report-data.gauge.fair', { cadence: 'write-once', owner: 'worker', gate: ['E19'], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, required: true, extract: (h, c) => R(rd(c) && rd(c).gauge && rd(c).gauge.fair) }),  // census 12 ก.ย. 69: 100.0%
  F('f46', 'report-data.chart.fairLine', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, required: true, extract: (h, c) => R(rd(c) && rd(c).chart && rd(c).chart.fairLine) }),  // census 12 ก.ย. 69: 100.0%
  F('f47', 'legend "มูลค่าเหมาะสม $FV"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, required: true, extract: (h) => R(num(grab(new RegExp('มูลค่าเหมาะสม\\s*' + CUR + '?\\s*([\\d.,]+)\\s*</span>'), grab(/<div class="legend">([\s\S]*?)<\/div>/, h) || ''))) }),  // census 12 ก.ย. 69: 99.7%
  F('f48', 'การ์ด "โซนเริ่มทยอยสะสม < $FV"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f44', how: 'below' }, required: false, extract: (h, c) => { const k = card(c, /โซนเริ่มทยอยสะสม/); return R(k ? num(k.v.replace(/^[^0-9]*(?:<|&lt;)/, '')) : null); } }),  // census 12 ก.ย. 69: 98.9% <99% → optional
  F('f49', 'ป้าย gauge mFair "เหมาะสม $FV"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, required: true, extract: (h) => R(num(grab(new RegExp('id="mFair"><div class="lab"[^>]*>เหมาะสม\\s*' + CUR + '?\\s*([\\d.,]+)'), h))) }),  // census 12 ก.ย. 69: 99.8%
  F('f50', 'ป้าย gauge mCur "ปัจจุบัน $px"', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'pair', pair: { with: 'f01', how: 'money' }, required: true, extract: (h) => R(num(grab(RM.MCUR_LABEL_RE, h))) }),  // census 12 ก.ย. 69: 100.0%
  F('f51', 'gauge scale MOS20/MOS30', { cadence: 'write-once', owner: 'worker', gate: ['E26'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.scaleNums.length >= 4 ? c.scaleNums : null) }),  // census 12 ก.ย. 69: 100.0%
  F('f52', 'การ์ดจุดซื้อ MOS20/MOS30', { cadence: 'write-once', owner: 'worker', gate: ['E18'], healer: null, binding: 'gate', required: true, extract: (h, c) => { const a = cardNum(c, /จุดซื้อ MOS 20/), b = cardNum(c, /จุดซื้อ MOS 30/); return R(a != null && b != null ? [a, b] : null); } }),  // census 12 ก.ย. 69: 100.0%
  F('f53', 'gauge scale กรอบบน FV', { cadence: 'write-once', owner: 'worker', gate: ['E26'], healer: null, binding: 'gate', required: false, extract: (h) => R(num(grab(new RegExp(CUR + '?\\s*([\\d.,]+)\\s*<br><small>กรอบบน'), h))) }),  // census 12 ก.ย. 69: 85.2% <99% → optional
  F('f54', 'vcell กรอบ (FV_LOW–FV_HIGH)', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f43', how: 'range' }, required: true, extract: (h) => { const v = vcell(h, 'มูลค่าเหมาะสม') || ''; const m = v.match(new RegExp('\\(\\s*' + CUR + '?\\s*([\\d.,]+)\\s*[–\\-]\\s*' + CUR + '?\\s*([\\d.,]+)\\s*\\)')); return R(m ? [num(m[1]), num(m[2])] : null); } }),  // census 12 ก.ย. 69: 99.0%
  F('f55', 'การ์ด "P/E เฉลี่ย ~N ปี"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f04', how: 'years', stale: true }, required: false, extract: (h, c) => { const k = card(c, /P\/E เฉลี่ย/); return R(k ? num(grab(/~?\s*(\d+)\s*ปี/, k.k)) : null); } }),
  F('f56', 'การ์ด ROE / ROA', { cadence: 'write-once', owner: 'worker', gate: ['W07', 'W10'], healer: null, binding: 'gate', required: false, extract: (h, c) => R(c.metrics.roe) }),
  F('f57', 'stock-meta.roe', { cadence: 'write-once', owner: 'worker', gate: ['E29', 'W10'], healer: null, binding: 'gate', required: false, extract: (h, c) => R(sm(c) && sm(c).roe) }),
  F('f58', 'การ์ดกำไรสุทธิ / YoY', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /กำไรสุทธิ|net (?:profit|income)/i)) }),
  F('f59', 'การ์ดรายได้ TTM', { cadence: 'write-once', owner: 'worker', gate: ['W16'], healer: null, binding: 'gate', required: false, extract: (h, c) => R(cardNum(c, /รายได้|revenue/i)) }),
  F('f60', 'การ์ดอัตรากำไรขั้นต้น', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /กำไรขั้นต้น|gross margin/i)) }),
  F('f61', 'การ์ด Beta', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /^Beta/i)) }),
  F('f62', '.mval ต่อวิธี', { cadence: 'write-once', owner: 'worker', gate: ['E21', 'E22', 'W14', 'W05', 'W18'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.methods.length ? c.methods.map((m) => m.val) : null) }),  // census 12 ก.ย. 69: 100.0%
  F('f63', '.mdesc ตัวคูณ', { cadence: 'write-once', owner: 'worker', gate: ['W18'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.methods.length ? c.methods.map((m) => m.desc) : null) }),  // census 12 ก.ย. 69: 100.0%
  F('f63b', '"จาก ATH −X%" ใน prose', { cadence: 'stale-daily', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => { const m = String(h).match(ATH_PCT_RE); return R(m ? num(m[1] || m[2]) : null); } }),
  F('f64', 'ราคาใน prose', { cadence: 'stale-daily', owner: 'worker', gate: [], healer: null, binding: 'deferred', required: false, extract: (h) => { const m = h.match(/ราคา(?:ปัจจุบัน|ล่าสุด)\s*(?:C\$|[฿$])\s*[\d.,]+/g); return { found: !!m, value: m ? m.length : 0 }; } }),   // ระยะ 2 (ข้อ A/B token) · spotcheck เป็นตัวชี้
  F('f65', '% ของราคาเป้าใน prose', { cadence: 'stale-daily', owner: 'worker', gate: ['W15'], healer: 'patchDerived#4', binding: 'gate', required: false, extract: (h) => { const m = h.match(new RegExp(DV.MONEY_PCT_SRC, 'g')); return { found: !!m, value: m ? m.length : 0 }; } }),
  F('f66', 'meta ai-model', { cadence: 'write-once', owner: 'worker', gate: ['E28'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.aiModel) }),  // census 12 ก.ย. 69: 100.0%
  F('f67', '.sub คำโปรย', { cadence: 'write-once', owner: 'worker', gate: ['E32'], healer: null, binding: 'gate', required: true, extract: (h, c) => R(c.sub || null) }),  // census 12 ก.ย. 69: 100.0%
  F('f68', 'tags (sidecar)', { cadence: 'out-of-band', owner: 'sidecar', gate: ['E40', 'W13'], healer: null, binding: 'gate', required: false, extract: (h, c) => { const T = require('./tag-lib.js'); const t = T.tagsOf(c.symbol, c.tagData !== undefined && c.tagData !== null ? c.tagData : T.loadTags()); return R(t.length ? t : null); } }),  // census 12 ก.ย. 69: 100.0% แต่คง false — tag อยู่ sidecar (out-of-band) ไม่ได้อยู่ในไฟล์รายงาน — ใบที่ยังไม่ติดแท็กไม่ใช่ของเสีย
];
// ★ code-audit §1.1 มี **70 แถว** — เลขแถวเดินถึง #68 แต่มี #25b/#63b แทรก ⇒ คำว่า "68 ช่อง" ในสเปค/แผน
//   คือ "เลขแถวสูงสุด" ไม่ใช่จำนวนแถว (นับแถวในตารางจริง 12 ก.ย. 69 = 70 แถว)
//   ★ ห้ามตัดช่องทิ้งให้เหลือ 68 — ใน 70 แถวมี NEITHER 18 แถวที่เป็นเกณฑ์จบของงานนี้ (รวม f25b/f63b)
const N_FIELDS = 70;
if (FIELDS.length !== N_FIELDS) throw new Error(`field-manifest: ต้องมี ${N_FIELDS} ช่อง (ได้ ${FIELDS.length})`);
if (new Set(FIELDS.map((f) => f.id)).size !== N_FIELDS) throw new Error('field-manifest: id ซ้ำ');

// ── checkPairs (Task 9 · W22/W23): "ค่าเดียวกันที่เขียนไว้หลายที่" ต้องตรงกัน ──
// แยกสองชั้นด้วย `pair.stale` เพราะปนกันแล้วชั้นหนึ่งจะกลบอีกชั้น:
//   stale:false = **consistency** → ยิงบนใบสุขภาพดี = บั๊กจริง (W22)
//   stale:true  = **ค้างตามเวลา** → ราคาวิ่งออกจากค่าที่พิมพ์ไว้ คาดหมายได้หลายร้อยใบ fix-on-touch (W23)
/** จำนวนปีที่กราฟครอบคลุม — นับจาก label ที่มีปี **4 หลัก** เท่านั้น
 *  ★ วัด 12 ก.ย. 69: 0/908 ใบใช้ label ปี 4 หลัก (generator วันนี้เขียน "ต.ค.25" = เดือนไทย+ปี 2 หลัก ทุกใบ ⇒ กราฟกินเวลา 1 ปีพอดีทั้งคลัง)
 *    ⇒ ขา f55 ของ W23 **ยังไม่ยิงใบไหนเลย (latent)** — จงใจ ไม่ใช่พลาด: กราฟราคา 1 ปีไม่ใช่ขอบเขตของ "P/E เฉลี่ย ~N ปี"
 *    ถ้าใช้ช่วงเดือนจริงเป็นตัวหารแทน จะยิงทุกใบที่มีการ์ดนี้ (514 ใบ) = เสียงรบกวนล้วน และ BBL fixture เองก็จะติด
 *    ตัวหารที่ถูกจริงคือ "จำนวนคอลัมน์ FY ที่มีเลขจริง" (เคส GABLE) ซึ่งยังไม่มีช่องใน manifest → ระยะ 2 */
const yearsInChart = (ctx) => {
  const d = rd(ctx) && rd(ctx).chart && rd(ctx).chart.data;
  if (!Array.isArray(d) || d.length < 2) return null;
  const ys = d.map((p) => String(p[0] || '').match(/\d{4}/)).filter(Boolean).map((m) => +m[0]);
  return ys.length ? Math.max(...ys) - Math.min(...ys) + 1 : null;
};
/** เท่ากันเชิงเงิน — ผ่านได้ 2 ทาง: (ก) ปัดตามทศนิยมที่ป้ายนั้นพิมพ์เองแล้วตรง (cron เขียนป้ายด้วย `fmtLike`
 *  ⇒ BBL: ป้าย mCur ฿194 กับ .px 193.5 = ตรงกัน) (ข) ต่างกัน ≤0.5% ของฐาน (หรือ 0.005 สำหรับเลขจิ๋ว) */
const moneyEq = (a, b) => a != null && b != null && (DV.fmtLikeNum(b, String(a)) === String(a) || Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.005));
/** f10 คืน iso เป็นสตริง ส่วน f11/f12 คืน "วัตถุวันที่" ของ price-date.js — ปรับให้เทียบกันได้ก่อนเสมอ */
const isoOf = (v) => (v && typeof v === 'object' ? v.iso : v);
const PAIR_HOW = {
  money: (v, w) => (moneyEq(v, w) ? null : `${v} ≠ ${w}`),
  // f12 (และ f11 ในทางทฤษฎี) เป็น "วัตถุวันที่" ที่มี hasDay — เดือนล้วน (hasDay===false) ปักวันที่ 01 เสมอ (mk() ใน
  // price-date.js) แต่ f10 (คู่เทียบ) พาวันรันจริงมาด้วย ⇒ เทียบ ISO เต็มจะขัดกันทุกวันยกเว้นวันที่ 1 ของเดือน
  // (9 ใบ disclaimer เดือนล้วน "ราคา ณ ก.ค. 2569" — code-audit C1) ⇒ เดือนล้วนเทียบแค่ปี-เดือน (7 ตัวแรกของ iso)
  // ทั้งสองฝั่ง ส่วนวันที่มีวัน (hasDay!==false) ยังเทียบ ISO เต็มเป๊ะเหมือนเดิม
  date: (v, w) => {
    const a = isoOf(v), b = isoOf(w);
    if (!a || !b) return `${a} ≠ ${b}`;
    const monthOnly = v && typeof v === 'object' && v.hasDay === false;
    const ok = monthOnly ? a.slice(0, 7) === b.slice(0, 7) : a === b;
    return ok ? null : `${a} ≠ ${b}`;
  },
  contains: (v, w) => (Array.isArray(v) && w != null && v[0] <= w && w <= v[1] ? null : `ราคา ${w} อยู่นอกกรอบ ${v && v.join('–')} ที่พิมพ์ (กรอบค้าง — fix-on-touch)`),
  // ★ ต้อง anchor ที่กล่อง .fv-box เหมือน E20 เป๊ะ — คำว่า "กรอบ" มีในการ์ด metric ด้วย (กรอบ P/E, กรอบบน)
  //   วัด 12 ก.ย. 69: ไม่ anchor = ฟ้องปลอม 168 ใบ (AAPL: vcell 222–315 ไปเทียบกับ "กรอบ 24–37" ของ P/E) · anchor แล้วเหลือ 2
  range: (v, w, ctx) => {
    const h = String(ctx && ctx.html ? ctx.html : '');
    const i = h.indexOf('class="fv-box"');
    if (i === -1 || !Array.isArray(v)) return null;
    const fb = h.slice(i, i + 700).match(new RegExp('กรอบ\\s*' + CUR + '?\\s*([\\d.,]+)\\s*[–\\-]\\s*' + CUR + '?\\s*([\\d.,]+)'));
    if (!fb) return null;
    const lo = num(fb[1]), hi = num(fb[2]);
    return moneyEq(v[0], lo) && moneyEq(v[1], hi) ? null : `vcell (${v.join('–')}) ≠ กรอบ .fv-box (${lo}–${hi})`;
  },
  // f48 "โซนเริ่มทยอยสะสม < $FV" — **ไม่ใช่ค่าเดียวกับ FV** แต่เป็นเพดานที่ต้องไม่เกิน FV
  //   ★ วัด 12 ก.ย. 69: 103 ใบเขียนต่ำกว่า FV โดยตั้งใจ สัดส่วนกระจุกที่ 0.95/0.90/0.85/0.80 (ธรรมเนียมเผื่อ MOS 5–20%)
  //     ⇒ บังคับให้ "เท่า FV" = ฟ้องใบสุขภาพดี 103 ใบ · เกณฑ์จริงคือ **อยู่ในช่วง 0.7×FV ถึง FV**
  //     (สูงกว่า FV = ชวนสะสมเหนือมูลค่าเหมาะสม · ต่ำกว่าจุดซื้อ MOS 30% = ไม่ใช่ "เริ่มทยอย" แล้ว)
  below: (v, w) => (v > 0 && w > 0 && (v <= w || moneyEq(v, w)) && v >= w * 0.7 - 1e-9
    ? null : `การ์ด ${v} ต้องอยู่ในช่วง 0.7×FV–FV (FV ${w} ⇒ ${(w * 0.7).toFixed(2)}–${w})`),
  years: (v, w, ctx) => { const y = yearsInChart(ctx); return y == null || v == null || v <= y + 1 ? null : `ป้าย ~${v} ปี แต่กราฟมีข้อมูล ${y} ปี (IPO ใหม่กว่าป้าย — เคส GABLE)`; },
};
for (const f of FIELDS.filter((f) => f.pair))
  if (!PAIR_HOW[f.pair.how]) throw new Error(`field-manifest: ${f.id} ใช้ pair.how "${f.pair.how}" ที่ไม่มีใน PAIR_HOW`);

/** คู่ที่ไม่ตรงกันในไฟล์นี้ → `[{ id, with, stale, msg }]` (ช่องใดช่องหนึ่งหาย = เรื่องของ W21/coverage ไม่ใช่ของ pair) */
function checkPairs(values, ctx) {
  const out = [];
  for (const f of FIELDS.filter((f) => f.pair)) {
    const v = values[f.id], w = values[f.pair.with];
    if (v == null || w == null) continue;
    const msg = PAIR_HOW[f.pair.how](v, w, ctx);
    if (msg) out.push({ id: f.id, with: f.pair.with, stale: !!f.pair.stale, msg: `${f.name} ↔ ${FIELDS.find((g) => g.id === f.pair.with).name}: ${msg}` });
  }
  // stock-meta.roe ต้อง null เมื่อขาดทุน (open-item #14) — กฎเดี่ยว ไม่ใช่ pair แต่เป็นความสอดคล้องระหว่างช่องเหมือนกัน
  const s = sm(ctx);
  if (s && ctx.baseEPS != null && ctx.baseEPS <= 0 && typeof s.roe === 'number' && s.roe > 0)
    out.push({ id: 'f57', with: 'f40', stale: false, msg: `stock-meta.roe = ${s.roe} แต่ EPS ฐาน ${ctx.baseEPS} ≤ 0 (ขาดทุน → roe ต้อง null — เคส OKJ)` });
  return out;
}

/** ทุกช่องของไฟล์เดียว — extractor ที่ระเบิดไม่ล้มทั้งรอบ แต่ **ต้องไม่หายเงียบ**:
 *  เดิม exception ถูกกลืนเป็น "found:false" เฉย ๆ ⇒ ช่อง optional ที่พังจะนับเป็น "ข้าม" อย่างสงบ
 *  ⇒ คืน `errors: [{id, err}]` ให้ W21 พูดถึงด้วย (ระยะ 1 — ทบทวนทั้งสาขา 12 ก.ย. 2569) */
function extractAll(html, ctx) {
  const values = {}, found = new Set(), missing = [], skipped = [], errors = [];
  for (const f of FIELDS) {
    let r;
    try { r = f.extract(html, ctx) || { found: false, value: null }; } catch (e) { r = { found: false, value: null, err: e.message }; }
    if (r.err) errors.push({ id: f.id, err: r.err });
    values[f.id] = r.value;
    if (r.found) found.add(f.id);
    else if (f.required === false) skipped.push(f.id);
    else missing.push(f.id);
  }
  return { values, found, missing, skipped, errors };
}
function coverage(html, ctx) {
  const r = extractAll(html, ctx);
  return { n: FIELDS.length, found: r.found.size, missingRequired: r.missing, skippedOptional: r.skipped };
}
/** census ทั้งคลัง — อัตราที่พบต่อช่อง (ใช้ตัดสิน required · ต้องรันกับ ctx จริงของ gate) */
function census(dir, buildCtx, expandReport) {
  const fs = require('fs'), path = require('path');
  const files = fs.readdirSync(dir).filter((f) => /\.html$/i.test(f)).sort();
  const hit = Object.fromEntries(FIELDS.map((f) => [f.id, 0]));
  const errs = Object.fromEntries(FIELDS.map((f) => [f.id, 0]));
  const why = Object.fromEntries(FIELDS.map((f) => [f.id, null]));   // ตัวอย่างแรกของ exception (ไฟล์ + ข้อความ) — ใช้แก้ extractor
  for (const f of files) {
    const html = expandReport(fs.readFileSync(path.join(dir, f), 'utf8'));
    const ctx = buildCtx(html, f);
    for (const fd of FIELDS) {
      let r; try { r = fd.extract(html, ctx); } catch (e) { errs[fd.id]++; if (!why[fd.id]) why[fd.id] = `${f}: ${e.message}`; continue; }
      if (r && r.found) hit[fd.id]++;
    }
  }
  return { files: files.length, rows: FIELDS.map((f) => ({ id: f.id, name: f.name, binding: f.binding, found: hit[f.id], rate: hit[f.id] / files.length, errors: errs[f.id], firstErr: why[f.id], required: f.required })) };
}
module.exports = { FIELDS, N_FIELDS, extractAll, coverage, census, checkPairs, PAIR_HOW };

if (require.main === module && process.argv.includes('--census')) {
  const { buildCtx, REPORTS_DIR } = require('../test/check-reports.js');
  const { expandReport } = require('../build.js');
  const c = census(REPORTS_DIR, buildCtx, expandReport);
  console.log(`| id | ช่อง | binding | พบ | อัตรา | extractor error | required |\n|---|---|---|---|---|---|---|`);
  for (const r of c.rows) console.log(`| ${r.id} | ${r.name} | ${r.binding} | ${r.found}/${c.files} | ${(r.rate * 100).toFixed(1)}% | ${r.errors}${r.firstErr ? ' — ' + r.firstErr : ''} | ${r.required} |`);
}
