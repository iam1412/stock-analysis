'use strict';
/**
 * prep <SYM> — ขั้น B1–B8 + A8/A9 ของรอบเคลียร์คิว (docs-audit §5) ในคำสั่งเดียว:
 *   สกุล→--th เอง · prep-stock (exit 2 = หยุด) · มัธยฐานตัวคูณ + sanity (สุดขั้ว/ผสมสกุล — บทเรียน 10 ก.ย. 69)
 *   · EPS screen ใบ vs vendor (>2% ⇒ UPDATE เต็ม — SKILL 5C ข้อ 2 · prep-stock ไม่เทียบกับใบ) · diff snapshot vendor
 *   (เป้า+n / 52wk / ปันผล — คลาสที่ 4 ของ price-derived-staleness เดิมอยู่ใน memory เท่านั้น) · tags ปัจจุบัน
 *   · ประกอบ prompt จาก _template/agent-prompt.md + บล็อกบันทึก → .queue/prep/<SYM>.md
 * ★ ไม่ทำแทน: spawn worker (controller ทำ พร้อม pin model) · courier/advisor ของหุ้นยาก · เลือกสีแบรนด์ NEW (--brand)
 */
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./sh.js');
const S = require('./state.js');
const { todayBangkok } = require('./footer-date.js');
const { readStockMeta } = require('../report-meta.js');
const DV = require('../derived-values.js');
const T = require('../tag-lib.js');

const REPORTS = path.join(ROOT, 'reports');
const TEMPLATE = path.join(ROOT, '_template', 'agent-prompt.md');
const TOKENS = ['SYMBOL', 'MARKET', 'MODE', 'WORKTREE', 'CURRENT_TAGS', 'MEDIANS', 'FUNDAMENTALS'];
const VERBATIM = new Set(['AI_MODEL']);   // token ที่ template ตั้งใจส่งต่อให้ worker เติมเอง (ป้าย ai-model) — ห้ามแทน ห้ามฟ้อง
const EPS_SCREEN_PCT = 2;   // SKILL 5C ข้อ 2

const num = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(/[,%]/g, '')); return Number.isFinite(n) ? n : null; };
const asPct = (v) => (v != null && v < 0.3 ? v * 100 : v);   // vendor บางเจ้าส่ง yield เป็นสัดส่วน (0.0035) บางเจ้าเป็น % (0.35) — yield จริง <0.3% จะถูกอ่านเป็น ×100 ผิด: ยอมรับได้เพราะเป็นรายการให้คนอ่าน ไม่ใช่ gate
const pctDiff = (a, b) => (a != null && b ? Math.abs(a - b) / Math.abs(b) * 100 : null);

/** ถอดค่าจาก stdout ของ prep-stock (บรรทัด [1] Yahoo / [2] StockAnalysis ของ fetch-fundamentals) — SA ก่อน Yahoo */
function parseVendor(text) {
  const y = text.match(/\[1\] Yahoo[^\n]*\n\s*price=(\S+) epsTTM=(\S+) epsFwd=(\S+) PE=(\S+) fwdPE=(\S+) divYield=(\S+) target=(\S+)(?: \(n=(\d+)\))? 52wk=(\S+)–(\S+)/);
  const s = text.match(/\[2\] StockAnalysis[^\n]*\n\s*price=(\S+)(?: \(ณ [^)]*\))? epsTTM=(\S+) PE=(\S+) fwdPE=(\S+) div=(\S+)(?: \(yield=(\S+)\))? target=(\S+)(?: \((\d+)\))? 52wk=(\S+)–(\S+)/);
  const pick = (a, b) => (a != null ? a : b);
  return {
    epsTTM: pick(s && num(s[2]), y && num(y[2])),
    target: pick(s && num(s[7]), y && num(y[7])),
    analysts: pick(s && num(s[8]), y && num(y[8])),
    lo52: pick(s && num(s[9]), y && num(y[9])),
    hi52: pick(s && num(s[10]), y && num(y[10])),
    divYieldPct: pick(s && asPct(num(s[6])), y && asPct(num(y[6]))),
    priceStop: /🛑/.test(text),
    priceWarn: /⚠ ราคา 2 แหล่งต่าง/.test(text),
  };
}

/** snapshot vendor ที่พิมพ์ในใบ vs vendor ตอนนี้ — คืนรายการที่ต่างเกินเกณฑ์ (ให้ worker อัปเดตพร้อมกัน) */
function snapshotDiff(html, ctx, v) {
  const out = [];
  const m52 = html.match(/กรอบ 52 สัปดาห์\s*(?:[฿$]|C\$)?\s*([0-9][0-9.,]*)\s*[–\-]\s*(?:[฿$]|C\$)?\s*([0-9][0-9.,]*)/);
  if (!m52) out.push('อ่านกรอบ 52 สัปดาห์ในใบไม่ได้ — เทียบกับ FUNDAMENTALS เอง');
  else if (v.lo52 != null && v.hi52 != null) {
    const lo = num(m52[1]), hi = num(m52[2]);
    if (pctDiff(lo, v.lo52) > 3 || pctDiff(hi, v.hi52) > 3) out.push(`กรอบ 52 สัปดาห์ ใบ ${lo}–${hi} · vendor ${v.lo52}–${v.hi52}`);
  }
  for (const t of DV.targetCells(html))
    if (v.target != null && pctDiff(t.target, v.target) > 2) out.push(`เป้านักวิเคราะห์ (${t.label}) ใบ ${t.target} · vendor ${v.target}${v.analysts != null ? ` (n=${v.analysts})` : ''}`);
  const px = ctx && ctx.px;
  const yp = px > 0 ? DV.yieldPlan(html, px) : null;
  if (yp && yp.cards.length && v.divYieldPct != null && Math.abs(yp.cards[0].shown - v.divYieldPct) > 0.3) out.push(`ปันผล % ใบ ${yp.cards[0].shown} · vendor ${v.divYieldPct}`);
  const pb = px > 0 ? DV.pbvPlan(html, px) : [];
  if (pb.length) out.push(`P/BV ใบ ${pb[0].shown}x — ตรวจกับ BVPS/ราคาใน FUNDAMENTALS เอง (vendor ไม่ส่งค่านี้ในบล็อก)`);
  return out;
}

/** หุ้นยากตามเกณฑ์ CLAUDE.md §3.2 ที่ตัดสินจากข้อมูลที่มี — IPO/spinoff/cyclical ยังต้องคนดู */
function hardStock(rec, ctx, v) {
  const why = [];
  if (rec && rec.bucket === 'FULL') why.push(`${rec.reason || 'split/chart'}`);
  if (ctx && ctx.baseEPS != null && ctx.baseEPS <= 0) why.push('pre-profit (EPS ฐาน ≤ 0)');
  if (v && v.priceWarn) why.push('ราคา cross-source ต่าง 2–5%');
  return { hard: why.length > 0, why: why.join(' · ') };
}

function assemblePrompt(template, vals, extra) {
  const found = new Set((template.match(/\{\{([A-Z_]+)\}\}/g) || []).map((t) => t.slice(2, -2)));
  for (const k of found) if (!TOKENS.includes(k) && !VERBATIM.has(k)) throw new Error(`template มี token ที่ runbook ไม่รู้จัก: {{${k}}} — เพิ่มใน TOKENS หรือ VERBATIM ของ tools/queue/prep.js`);
  let out = template;
  for (const k of TOKENS) {
    if (vals[k] == null) throw new Error(`ขาดค่า {{${k}}}`);
    out = out.split(`{{${k}}}`).join(String(vals[k]));
  }
  return `${out}\n\n${extra}\n`;
}

function extraBlock(i) {
  const L = ['=== บันทึกจาก runbook (controller) — อ่านก่อนเริ่ม ==='];
  L.push(`- โหมด **${i.mode}** · ${i.prePatched
    ? `ราคาในไฟล์ patch แล้ว ${i.prePatched} (${i.oldPrice ?? '?'} → ${i.price ?? '?'}) ⇒ **ห้ามรัน update-prices ซ้ำ** ยกเว้น SKILL 5B ข้อ 3 (แก้ fairValue — ปลอดภัยแล้วเพราะ lock)`
    : `ราคายังไม่ได้ pre-patch (ตลาดเปิด/ข้าม) — โหมด UPDATE รัน \`node tools/update-prices.js --write --force ${i.sym}\` ตาม SKILL STEP 1 ได้`}`);
  if (i.epsScreen != null) L.push(`- EPS ในใบ ${i.baseEPS} vs vendor ${i.epsTTM} = ต่าง ${i.epsScreen.toFixed(1)}% → ${i.epsScreen <= EPS_SCREEN_PCT ? 'FV เดิมยืนได้ (UPDATE-LIGHT ตาม 5C ข้อ 2)' : '**ยกระดับเป็น UPDATE เต็ม** (5C ข้อ 2) — ตรวจ dil/basic/งวดตาม STEP 2 ก่อน'}`);
  else L.push('- EPS screen: เทียบไม่ได้ (อ่าน EPS ฐานในใบหรือ vendor ไม่ได้) — ตรวจเองตาม STEP 2');
  L.push(i.snap.length
    ? `- snapshot vendor ที่ค้างในใบ (อัปเดตพร้อมกัน — คลาสที่ 4 ของ price-derived-staleness):\n${i.snap.map((s) => '    · ' + s).join('\n')}`
    : '- snapshot vendor (เป้า/52wk/ปันผล) ตรงกับใบแล้ว');
  if (i.medWarn.length) L.push(`- มัธยฐานตัวคูณ: ${i.medWarn.join(' · ')}`);
  if (i.hard) L.push(`- **หุ้นยาก** (${i.hardWhy}) → controller ปรึกษา advisor แล้ววางแนวทางตรงนี้ก่อน spawn:\n    <ยังไม่ได้วาง — ถ้าเห็นบรรทัดนี้ใน prompt แปลว่า controller ข้ามขั้น>`);
  L.push('- ห้าม push · ห้ามเขียน tags.json · ห้ามเรียก advisor ตรง (ข้อห้ามเชิงนโยบาย — agent-prompt ว่าไว้แล้ว) · pick-brand/update-prices มี lock แล้ว รันตาม SKILL ได้เมื่อจำเป็น');
  return L.join('\n');
}

async function medianBlock(spec, th) {
  const MM = require('../median-multiples.js');
  const warn = [];
  let text;
  try {
    const r = await MM.oneSymbol(spec, th);
    text = MM.report(r);
    if (r.curErr) warn.push('ผสมสกุลเงิน — รัน prep ใหม่ด้วย --median-spec SYM:<ticker กระดานท้องถิ่น> (เคส CP/UMC 9 ก.ย. 69)');
    if (r.median != null && (r.median > 60 || r.median < 3)) warn.push(`มัธยฐาน ${r.median.toFixed(1)}x นอกย่าน 3–60x — อ่านรายปีก่อนวาง (เคส 2,074x 10 ก.ย. 69)`);
    if (r.dropped.length) warn.push(`ตัดปีผิดปกติ ${r.dropped.length} จุด: ${r.dropped.map((d) => `${d.key} ${d.outlier}`).join(' · ')}`);
  } catch (e) {
    text = `=== ตัวคูณมัธยฐานย้อนหลัง: ${spec} ===\n  ✗ ดึงไม่สำเร็จ: ${e.message}\n  ⇒ **ห้ามเดาตัวคูณจากค่าปัจจุบัน** — ใช้ peer ที่วัดจริง หรือตระกูลอื่นเป็นขาแทน`;
    warn.push('ดึงมัธยฐานไม่ได้ — worker ต้องใช้ตระกูลอื่น/peer ที่วัดจริง');
  }
  return { text, warn };
}

async function prep(sym, opts) {
  const o = opts || {};
  const fp = path.join(REPORTS, sym + '.html');
  const exists = fs.existsSync(fp);
  const html = exists ? fs.readFileSync(fp, 'utf8') : '';
  const sm = exists ? readStockMeta(html) : null;
  const th = exists ? (sm && sm.currency === 'THB') : !!o.th;
  const rec = S.load().stocks[sym] || {};
  const mode = o.mode || (!exists ? 'NEW' : rec.bucket === 'LIGHT' ? 'UPDATE-LIGHT' : 'UPDATE');

  // 1. prep-stock ครั้งเดียว (มัน spawn fetch-fundamentals + fetch-facts ให้แล้ว — ห้ามดึงซ้ำ)
  const ps = run('node', ['tools/prep-stock.js', sym, ...(th ? ['--th'] : []), ...(mode !== 'NEW' ? ['--update'] : []), ...(o.brand ? ['--brand', o.brand] : [])]);
  process.stdout.write(ps.out + '\n');
  if (ps.code === 2) throw new Error(`prep-stock exit 2 — ราคาขัดแหล่ง >5% หรือ bad-chart: **หยุด ห้าม spawn** ถามเจ้าของ (CLAUDE.md §2)`);
  if (ps.code !== 0) throw new Error('prep-stock ล้ม: ' + (ps.err || ps.out).slice(-800));
  const vend = parseVendor(ps.out);

  // 2. มัธยฐานตัวคูณ (structured) + sanity
  const med = await medianBlock(o.medianSpec || sym, th);

  // 3. EPS screen + 4. snapshot diff (เฉพาะใบเดิม)
  let ctx = null, epsScreen = null, snap = [];
  if (exists) {
    const { buildCtx } = require('../../test/check-reports.js');
    const { expandReport } = require('../../build.js');
    ctx = buildCtx(expandReport(html), sym + '.html');
    epsScreen = pctDiff(ctx.baseEPS, vend.epsTTM);
    snap = snapshotDiff(html, ctx, vend);
  }

  // 5. tags · 6. ยาก/โมเดล/effort
  const tags = T.tagsOf(sym, T.loadTags()).join(' ');
  const hs = hardStock(rec, ctx, vend);
  const model = o.model || (hs.hard ? 'opus' : 'sonnet');
  const effort = hs.hard ? 'high' : 'medium';

  // 7. ประกอบ prompt
  const prompt = assemblePrompt(fs.readFileSync(TEMPLATE, 'utf8'),
    { SYMBOL: sym, MARKET: th ? 'TH' : 'US', MODE: mode, WORKTREE: ROOT, CURRENT_TAGS: tags, MEDIANS: med.text, FUNDAMENTALS: ps.out },
    extraBlock({ sym, mode, prePatched: rec.prePatched, oldPrice: rec.oldPrice, price: sm && sm.price, baseEPS: ctx && ctx.baseEPS, epsTTM: vend.epsTTM, epsScreen, snap, medWarn: med.warn, hard: hs.hard, hardWhy: hs.why }));
  fs.mkdirSync(S.PREP_DIR, { recursive: true });
  const file = path.join(S.PREP_DIR, sym + '.md');
  fs.writeFileSync(file, prompt);
  S.update(sym, { mode, model, effort, prepAt: todayBangkok(), epsScreen, snapDeltas: snap.length, currency: th ? 'THB' : 'USD' });

  console.log(`\n=== prep ${sym} เสร็จ → ${path.relative(ROOT, file)} ===`);
  console.log(`โหมด ${mode} · model **${model}** · effort ${effort}${hs.hard ? ` · หุ้นยาก: ${hs.why}` : ''}`);
  if (epsScreen != null) console.log(`EPS screen: ${epsScreen.toFixed(1)}% ${epsScreen > EPS_SCREEN_PCT ? '⇒ UPDATE เต็ม' : '(ผ่าน)'}`);
  if (snap.length) console.log(`snapshot vendor ค้าง ${snap.length} จุด (อยู่ใน prompt แล้ว)`);
  if (med.warn.length) console.log(`⚠ มัธยฐาน: ${med.warn.join(' · ')}`);
  console.log('\n── ขั้นที่ต้องทำเอง ──');
  let n = 0;
  if (hs.hard) console.log(`${++n}. หุ้นยาก: ปรึกษา advisor แล้วแทนบรรทัด "<ยังไม่ได้วาง …>" ใน prompt ด้วยแนวทาง`);
  if (mode === 'NEW' && !o.brand) console.log(`${++n}. NEW: เลือกสีแบรนด์จาก tools/brand-colors.md แล้วรัน prep ใหม่ด้วย --brand "#hex" (หรือให้ worker รัน pick-brand เอง — มี lock แล้ว)`);
  console.log(`${++n}. spawn worker 1 ตัว: prompt = ไฟล์ข้างบน · pin model:"${model}" · effort ${effort} (Agent tool หรือ analyze-wave stocks=[1 ตัว])`);
  console.log(`${++n}. worker คืนงานแล้ว → npm run queue -- postcheck ${sym} --model ${model}`);
  return { file, mode, model, effort, hard: hs.hard };
}

module.exports = { prep, parseVendor, snapshotDiff, assemblePrompt, extraBlock, hardStock, medianBlock, TOKENS, EPS_SCREEN_PCT };
