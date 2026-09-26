'use strict';
// เจ้าของ 27 ก.ย. 69 — ใบ migrate: ข้อความของผู้เขียนตามตัว · ไม่มีป้ายที่ template แต่งเอง · ข้อความหาย = error
const t = require('./_t.js')('verbatim');
const fs = require('fs'), path = require('path');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const S = require('../../tools/v3/schema.js');
const B = require('../../build.js');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const RS = require('../../tools/migrate-v3/residual.js');
const AU = require('../../tools/migrate-v3/audit.js');
const RM = require('../../tools/migrate-v3/remigrate.js');
const ROOT = path.join(__dirname, '..', '..');
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (s) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`))); delete d._sig; d.market.priceDate = today; d.meta.analysisDate = today; return d; };
const MF = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };

// ── parse-v2: verdict อ่านทุกย่อหน้า (AEM <h2><p><p>) + <p> ที่ไม่ได้ปิด (COR)
{
  const body = '<div class="verdict"><h2>สรุป</h2><p>ย่อหน้าแรก</p><p>ย่อหน้าที่สอง</p><div class="vgrid"><div class="vcell"><div class="k">K</div><div class="v">V</div></div></div><div class="zone">Z</div></div>';
  t.eq(PV.verdictParas(body).map(PV.text), ['ย่อหน้าแรก', 'ย่อหน้าที่สอง'], 'verdictParas: every paragraph, not only the first');
  const open = '<div class="verdict"><h2>สรุป</h2><p>ไม่ได้ปิดย่อหน้า<div class="vgrid"><div class="vcell"><div class="k">K</div><div class="v">V</div></div></div></div>';
  t.eq(PV.verdictParas(open).map(PV.text), ['ไม่ได้ปิดย่อหน้า'], 'verdictParas: unclosed <p> ends at the next block tag');
  t.eq(PV.verdictParas('<p>ไม่มีกล่อง</p>'), [], 'verdictParas: no verdict box → []');
}

// ── residual: กล่องที่ผู้เขียนแทรกนอกโครง template → บล็อกตามตัว · หมวดเสริมทั้งหมวด → บล็อก section
{
  const html = '<section><div class="s-head"><div class="n">5</div><h2>ปัจจัย</h2></div><div class="note">หมายเหตุปันผล <b>พิเศษ</b></div><div class="cr">x</div></section>'
    + '<section><div class="s-head"><div class="n">9</div><h2>ภาคผนวก</h2></div><p>ข้อความภาคผนวก</p><table><tr><th>ปี</th><th>รายได้</th></tr><tr><td>2025</td><td>100</td></tr></table></section>';
  const r = RS.residualOf('X', html);
  t.eq(r.blocks.length, 2, 'residualOf: one in-section block + one extra section');
  t.eq(r.blocks[0].after, '5', 'in-section block stays in its section');
  t.eq(r.blocks[0].at, 'top', 'block before template content = top of the section');
  t(/หมายเหตุปันผล <b>พิเศษ<\/b>/.test(r.blocks[0].parts[0].text), 'block text verbatim (inline markup kept): ' + JSON.stringify(r.blocks[0].parts));
  t.eq(r.blocks[1].section, { n: 9, title: 'ภาคผนวก' }, 'extra section keeps the author number + h2');
  t.eq(r.blocks[1].parts.map((p) => p.table ? 'table' : 'text'), ['text', 'table'], 'extra section parts in order');
  t.eq(r.blocks[1].parts[1].table, { headers: ['ปี', 'รายได้'], rows: [['2025', '100']] }, 'table headers + rows');
  t(!/หมายเหตุปันผล|ภาคผนวก/.test(r.html) && /class="cr"/.test(r.html), 'carried blocks cut from the html · template components kept');
  t.eq(RS.residualOf('X', '<section><div class="s-head"><div class="n">5</div><h2>ปัจจัย</h2></div><div class="cr">x</div></section>').blocks, [], 'template-only section → no blocks');
}

// ── render: ป้าย ผู้วิเคราะห์กำหนด ไม่พิมพ์ · legDescs / s6Hint / vcells / titles / blocks ตามตัว
{
  const d = load('ZTS'); d.meta.migratedFrom = MF;
  const i = d.legs.findIndex((l) => l.method === 'pe');
  d.legs[i].inputs.multipleSource = 'author'; delete d.legs[i].inputs.medianWindow;
  const desc = d.legs.map((_, k) => k === i ? 'EPS = ประมาณการ FY2026e เพราะ EPS แกว่ง (TTM $0.28); P/E = มัธยฐาน 3 ปี (11.8–25.9x)' : 'คำอธิบายของผู้เขียนขา ' + k);
  d.v2Display = Object.assign({}, d.v2Display, {
    legDescs: desc,
    s6Hint: 'จากจุดเข้า {{px}} ของผู้เขียน',
    vcells: [{ k: 'มูลค่าเหมาะสม', v: 'ราว ๆ ตามผู้เขียน' }, { k: 'ส่วนต่าง', v: '{{mos}}', tone: 'mos' }],
    titles: { 5: 'หัวหมวดของผู้เขียน' },
    blocks: [{ after: '5', parts: [{ text: 'กล่องหมายเหตุของผู้เขียน' }, { table: { headers: ['ก', 'ข'], rows: [['1', '2']] } }] }],
  });
  if (d.scenarios) delete d.scenarios.hintNote;
  if (d.verdict) delete d.verdict.extraCells;
  const errs = S.validate(d).filter((e) => /v2Display|hintNote|extraCells/.test(e.path || e));
  t.eq(errs, [], 'schema accepts the verbatim v2Display fields');
  const v = C.compute(d, { seeds: SEEDS }), src = R.toV2Source(d, v);
  t(!/ผู้วิเคราะห์กำหนด/.test(src), 'author multipleSource prints no label');
  t(src.includes('P/E = มัธยฐาน 3 ปี (11.8–25.9x)') && src.includes('TTM $0.28'), 'leg description = author text verbatim, figures frozen as written');
  t(!/× P\/E เป้าหมาย ~/.test(src.slice(src.indexOf(desc[i]) - 300, src.indexOf(desc[i]))), 'template formula line not printed beside the author leg text');
  t(src.includes('จากจุดเข้า {{rd:px}} ของผู้เขียน'), 's6Hint verbatim with live price token');
  t(src.includes('ราว ๆ ตามผู้เขียน') && /\{\{rd:mosClass\}\}/.test(src), 'vcells verbatim · mos tone stays live');
  t(src.includes('<h2>หัวหมวดของผู้เขียน</h2>'), 'author section title');
  t(src.includes('กล่องหมายเหตุของผู้เขียน') && /<th>ก<\/th>/.test(src), 'author block text + table rendered');
  t(!/\{\{(?!rd:)[^}]*\}\}/.test(src), 'no raw v3 tokens left');
}

// ── audit: ข้อความหาย = TEXT-LOST (ล้ม) · ตัวเลขที่หายไปกับข้อความนับด้วย
{
  const d = load('ZTS'); d.meta.migratedFrom = MF;
  const v = C.compute(d, { seeds: SEEDS });
  const v2 = R.toV2Source(d, v);
  const same = AU.auditDoc('ZTS', d, { raw: v2, ref: 't' }, { seeds: SEEDS });
  t.eq([same.status, same.textLost], ['OK', 0], 'identical v2 page → OK, text lost 0: ' + JSON.stringify(same.lost));
  const extra = v2.replace(/(<div class="verdict">[\s\S]*?<\/h2>)/, '$1<p>ประโยคเฉพาะของผู้เขียนเรื่องสัญญาเช่าระยะยาว 47 ฉบับ</p>');
  t(extra !== v2, 'fixture: author paragraph inserted');
  const lost = AU.auditDoc('ZTS', d, { raw: extra, ref: 't' }, { seeds: SEEDS });
  t(lost.textLost > 0 && /TEXT-LOST/.test(lost.status), 'author text missing on v3 → TEXT-LOST status: ' + lost.status + ' ' + lost.textLost);
  t(lost.lost.some((x) => /47/.test(x.w)), 'number lost with its text counts as lost: ' + JSON.stringify(lost.lost.map((x) => x.w)));
}

// ── remigrate: sameNumbers — เลขที่คิดได้ต่าง = ไม่เท่า (graft-text ต้องไม่เปลี่ยนตัวเลข)
{
  const a = load('ZTS'), b = load('ZTS');
  t(RM.sameNumbers(a, b, SEEDS), 'sameNumbers: identical docs');
  const i = b.legs.findIndex((l) => l.method === 'pe'); b.legs[i].inputs.multiple = b.legs[i].inputs.multiple + 5;
  t(!RM.sameNumbers(a, b, SEEDS), 'sameNumbers: a changed leg multiple → false');
}
t.done();
