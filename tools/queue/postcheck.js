'use strict';
/**
 * postcheck <SYM> — ขั้น C1–C3 · C10–C11 + สิ่งที่ memory สั่งให้ controller ดูเอง (docs-audit §5):
 *   npm test -- SYM (0 error) · spotcheck · grep ราคาเดิมค้างทั้งไฟล์ (gate มองไม่เห็น prose) · ai-model ตรงกับที่ spawn
 *   · EPS ฐาน ≤ 0 ⇒ stock-meta.pe ต้อง null (roe = เตือน) · footer "ข้อมูล ณ" = วันนี้ + พ.ศ.
 * ★ ไม่ทำแทน: ชั้น 0 valuation (cluster/|MOS|>40%/สมอตาย/ตระกูลเดียว) — คนอ่าน spotcheck + W18/W05 เอง
 */
const path = require('path');
const { run, ROOT } = require('./sh.js');
const S = require('./state.js');
const { todayBangkok } = require('./footer-date.js');
const { parseAiModel } = require('../report-meta.js');
const RS = require('../report-source.js');   // ใบ v2 + v3 (Plan 2b)
const P3 = require('../v3/prose.js');

const REPORTS = path.join(ROOT, 'reports');
const MODEL_RE = { sonnet: /sonnet/i, opus: /opus/i };

/** ราคาเดิม (ก่อน pre-patch) ที่ยังโผล่ในเนื้อความ — ทั้งรูปทศนิยม/จำนวนเต็ม/มี comma · ข้ามบล็อก JSON */
function findOldPrice(html, oldPrice) {
  if (!(oldPrice > 0)) return [];
  const forms = new Set([String(oldPrice), oldPrice.toFixed(2), oldPrice.toFixed(1), String(Math.round(oldPrice)), oldPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })]);
  const re = new RegExp(`(?:[฿$]|C\\$)\\s*(?:${[...forms].map((f) => f.replace(/[.]/g, '\\.')).join('|')})(?![0-9])`);
  const hits = [];
  String(html).split('\n').forEach((l, i) => {
    if (/id="(stock-meta|report-data)"/.test(l)) return;
    if (re.test(l)) hits.push({ line: i + 1, text: l.trim().slice(0, 140) });
  });
  return hits;
}

/** #7 (GABLE — data-source-traps 6N): การ์ด "P/E เฉลี่ย ~N ปี" (manifest f55) ห้ามอ้างเกินจำนวน FY ที่มี EPS(dil)
 *  จริงในตาราง [3] (`rec.fyYears` ที่ prep บันทึกไว้) — ส่วนบริสุทธิ์ ไม่แตะ fs/state เอง
 *  ★ ไม่ใช่ manifest pair f55↔f04 ("years" — เทียบกับจำนวนปีในกราฟ) ซึ่งยังไม่ยิงใบไหนเลย (latent — กราฟไม่มีป้ายปี
 *  4 หลัก) เก็บไว้เป็นข้อมูลเสริมเฉย ๆ · เช็คนี้คือทางปิด #7 จริง เทียบกับ "จำนวนคอลัมน์ EPS(dil) ที่มีเลขจริง" แทน */
function checkFyYears(f55, fyYears) {
  if (f55 == null || fyYears == null) return null;
  if (f55 > fyYears) return `การ์ด "P/E เฉลี่ย ~${f55} ปี" แต่ตาราง [3] มี EPS จริง ${fyYears} ปี (เคส GABLE — นับคอลัมน์ก่อนเชื่อป้าย)`;
  return null;
}

/** ตรวจ meta ที่ gate ไม่รู้: ai-model vs โมเดลที่ spawn · pe/roe เมื่อขาดทุน · footer */
function checkMeta(ctx, model, fd, today) {
  const issues = [];
  if (model && ctx.aiModel && MODEL_RE[model] && !MODEL_RE[model].test(ctx.aiModel)) issues.push(`ai-model "${ctx.aiModel}" ไม่ตรงโมเดลที่ spawn (${model}) — worker ต้องประทับรุ่นที่รันจริง`);
  const sm = ctx.sm && ctx.sm.ok ? ctx.sm.data : null;
  if (ctx.baseEPS != null && ctx.baseEPS <= 0 && sm) {
    if (sm.pe !== null && sm.pe !== undefined) issues.push(`EPS ฐาน ${ctx.baseEPS} ≤ 0 แต่ stock-meta.pe = ${sm.pe} (ต้อง null)`);
    if (sm.roe !== null && sm.roe !== undefined && sm.roe > 0) issues.push(`EPS ฐาน ≤ 0 แต่ stock-meta.roe = ${sm.roe} — ตรวจว่าขาดทุนสุทธิไหม (ถ้าใช่ต้อง null — เคส OKJ)`);
  }
  if (!fd) issues.push('อ่านวันที่ footer "ข้อมูล ณ" ไม่ได้');
  else {
    if (fd.iso !== today) issues.push(`footer "ข้อมูล ณ" = ${fd.iso} ไม่ใช่วันนี้ ${today} (re-analysis ทุกโหมดต้องขยับ footer — SKILL 5B/5C)`);
    if (fd.era !== 'BE') issues.push('footer ใช้ปี ค.ศ. — กติกา พ.ศ. (CLAUDE.md §7)');
  }
  return issues;
}

/** ช่องข้อความของใบ v3 ที่ราคาเดิมค้างได้ (ส่วนบริสุทธิ์) → [{ path, text }]
 *  = ทุกช่อง prose (P.proseFields) + ป้ายที่ worker พิมพ์เอง: legs[].label · metrics.custom[].label · extras[].headers[]
 *  — market/fundamentals เป็นตัวเลขของ cron/งบ ไม่ใช่ข้อความที่ค้างได้ */
function oldPriceFields(doc) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  const out = P3.proseFields(doc);
  const add = (p, t) => { if (typeof t === 'string') out.push({ path: p, text: t }); };
  arr(doc.legs).forEach((l, i) => add(`legs[${i}].label`, (l || {}).label));
  arr((doc.metrics || {}).custom).forEach((c, i) => add(`metrics.custom[${i}].label`, (c || {}).label));
  arr(doc.extras).forEach((x, i) => arr((x || {}).headers).forEach((h, k) => add(`extras[${i}].headers[${k}]`, h)));
  return out;
}
/** ข้อความที่ grep หาราคาเดิมค้าง (ส่วนบริสุทธิ์): ใบ v2 = html ดิบทั้งไฟล์ (findOldPrice ข้ามบล็อก JSON เอง) · ใบ v3 = oldPriceFields */
function oldPriceHaystack(src) { return src.v3 ? oldPriceFields(src.doc).map((x) => x.text).join('\n') : src.raw; }
/** จุดที่ราคาเดิมยังโผล่ → [{ where, text }] · where = `L<บรรทัด>` (ใบ v2) · path ของช่องใน JSON (ใบ v3 เช่น prose.mos) */
function oldPriceHits(src, oldPrice) {
  if (!src.v3) return findOldPrice(src.raw, oldPrice).map((h) => ({ where: `L${h.line}`, text: h.text }));
  const out = [];
  for (const f of oldPriceFields(src.doc)) for (const h of findOldPrice(f.text, oldPrice)) out.push({ where: f.path, text: h.text });
  return out;
}

function postcheck(sym, opts) {
  const o = opts || {};
  const src = RS.load(sym, REPORTS);
  if (!src) throw new Error(`ไม่มี reports/${sym}.html หรือ reports/${sym}.json — worker ยังไม่ได้เขียน (หรือเขียนผิดที่ — ดู STEP 0 cwd-stray)`);
  const rec = S.load().stocks[sym] || {};
  const issues = [], notes = [];

  const t = run('node', ['test/check-reports.js', sym]);   // ใบ v3 → check-reports ส่งต่อ check-v3 เอง (Plan 2b R9)
  process.stdout.write(t.out);
  if (t.code !== 0) issues.push('npm test ตก (มี error) — แก้ก่อน');
  const sp = run('node', ['tools/spotcheck.js', sym]);
  process.stdout.write(sp.out);
  if (/▸/.test(sp.out)) notes.push('spotcheck มีรายการให้อ่าน (ด้านบน) — ตัดสินเอง ไม่ใช่ gate');

  const hits = oldPriceHits(src, rec.oldPrice);
  if (hits.length) issues.push(`ราคาเดิม ${rec.oldPrice} ยังโผล่ ${hits.length} จุด:\n` + hits.map((h) => `    ${h.where}: ${h.text}`).join('\n'));

  const { buildCtx } = require('../../test/check-reports.js');
  const ctx = buildCtx(RS.renderedHtml(sym, REPORTS), sym + '.html');   // v2 = expandReport(ต้นฉบับ) เหมือนเดิม · v3 = หน้าที่ build render
  const lite = RS.metaLite(sym, REPORTS);   // วันวิเคราะห์: v2 footer "ข้อมูล ณ" · v3 meta.analysisDate + dateEra
  issues.push(...checkMeta(ctx, o.model || rec.model, lite && lite.analysisDate ? { iso: lite.analysisDate, era: lite.era } : null, todayBangkok()));
  const fyIssue = checkFyYears(ctx.mf && ctx.mf.values ? ctx.mf.values.f55 : null, rec.fyYears);
  if (fyIssue) issues.push(fyIssue);
  // ช่อง required ที่ manifest อ่านไม่ได้ = โครงที่ worker เขียนไม่ครบ (W21 ใน gate เป็น warn จึงไม่บล็อก push เอง)
  // ⇒ ต้องขึ้นเป็น issue ตรงนี้ เพราะ postcheck คือจุดที่ controller ตัดสินว่าจะรับงาน worker ไหม
  if (ctx.mf && ctx.mf.missing.length)
    issues.push(`manifest: ช่อง required อ่านไม่ได้ ${ctx.mf.missing.join(' ')} (W21 — worker เขียนโครงไม่ครบ)`);

  const verdict = issues.length ? 'review' : 'pass';
  // ★ บันทึก "โมเดลที่รันจริง" จากป้ายในใบทับแผนของ prep — `state.model` เดิมเป็นแค่แผน (`--model || หุ้นยาก?opus:sonnet`)
  //   ที่ไม่มีใครเขียนทับเมื่อ controller เปลี่ยนใจตอน spawn ⇒ trailer ของ ship ผิดมาแล้ว (GNRC/SSP 20 ก.ย. 69)
  //   ไม่บันทึกเมื่อ `--model` ที่สั่งมาขัดกับใบ — เคสนั้นขึ้นเป็น issue ให้คนตัดสินก่อน (ห้ามเลือกข้างเงียบ ๆ)
  const ran = parseAiModel(ctx.aiModel);
  const conflicted = !!(o.model && ran && o.model !== ran.key);
  const modelPatch = ran && !conflicted && ran.key !== rec.model ? { model: ran.key } : {};
  if (modelPatch.model) console.log(`ℹ บันทึกโมเดลที่รันจริงจากป้ายในใบ: ${rec.model || '-'} → ${ran.key} ("${ran.text}")`);
  S.update(sym, { postcheck: verdict, postcheckAt: todayBangkok(), ...modelPatch });
  console.log(`\n=== postcheck ${sym}: ${verdict === 'pass' ? '✅ ผ่าน' : `⚠ ต้องดู ${issues.length} ข้อ`} ===`);
  for (const i of issues) console.log('  ✗ ' + i);
  for (const n of notes) console.log('  · ' + n);
  console.log('\n── ขั้นที่ต้องทำเอง ──');
  console.log('1. ชั้น 0 valuation (CLAUDE.md §8): cluster check · |MOS| >40% มีพยาน · W18/W05 · การ์ด EV/Sales·EV/EBITDA·DCF ไม่มี gate อ่านเอง');
  console.log(`2. ตัดสิน publish/skip${issues.length ? ' (แก้ issue ข้างบนก่อน หรือ re-dispatch)' : ''} → npm run queue -- ship ${sym} [--tags "…"]`);
  return { issues, notes };
}

module.exports = { postcheck, findOldPrice, oldPriceFields, oldPriceHaystack, oldPriceHits, checkMeta, checkFyYears };
