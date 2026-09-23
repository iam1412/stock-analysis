'use strict';
const t = require('./_t.js')('render');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const { expandReport } = require('../../build.js');
const CR = require('../../test/check-reports.js');

// วันราคาต้องสด ไม่งั้น E27 (>120 วัน) ยิงเมื่อ fixture เก่า — ตั้งเป็นวันนี้ (เวลาไทย) ทุกครั้งที่รัน
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (s) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`))); d.market.priceDate = today; d.meta.analysisDate = today; return d; };
const seeds = { ZTS: '#e8731a' };

// ZTS-real = fixture ของจริง (postreview Finding 5) — fixture file name มี "-real" แต่ doc.symbol ข้างในคือ "ZTS"
// เหมือน BBL/ZTS ⇒ ต้องส่ง checkHtml ด้วย `${doc.symbol}.html` (ไม่ใช่ `${sym}.html`) กัน E04 ตรวจ title ผิด
for (const sym of ['ZTS', 'BBL', 'ZTS-real']) {
  const doc = load(sym);
  const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.startsWith('<!DOCTYPE html>') && src.includes('<!--TEMPLATE:STYLE-->') && src.includes('<!--TEMPLATE:ENGINE-->'), `${sym}: markers present`);
  t(!/\{\{(?!rd:)[^}]*\}\}/.test(src), `${sym}: no v3 tokens left in source`);
  const html = expandReport(src);
  const res = CR.checkHtml(html, `${doc.symbol}.html`, { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], `${sym}: full v2 gate — zero errors`);
  t((html.match(/<section>/g) || []).length === 8, `${sym}: 8 sections`);
  // Finding 1 — verdict vcell "ส่วนต่างจากราคา" now carries {{rd:mosClass}} (v3 pages are never cron-patched,
  // so patchDerived#11/summaryPlan never gets to add it after the fact) — W26 must be green from render itself
  t(!res.warnings.some((w) => w.id === 'W26'), `${sym}: W26 (verdict MOS color class) not among warnings`);
  // postreview Finding 2 — <h1> ต้องมีชื่อย่อหุ้นต่อท้าย (ธรรมเนียม v2 "Company (SYM)")
  t(src.includes(`<h1>${doc.meta.company} (${doc.symbol})</h1>`), `${sym}: h1 includes ticker "(${doc.symbol})"`);
}
// Review Focus #2 — gauge scale ascending even when analyst target > fvHigh, or absent
{ const doc = load('ZTS'); doc.analyst.target = 400; const view = C.compute(doc, { seeds });
  const res = CR.checkHtml(expandReport(R.toV2Source(doc, view)), 'ZTS.html', { source: R.toV2Source(doc, view) });
  t(!res.errors.some((e) => e.id === 'E26'), 'E26 green with analyst above fvHigh'); }
// extras render as a data table
{ const doc = load('ZTS'); doc.extras = [{ after: 'valuation', title: 'SOTP', headers: ['ส่วน', 'มูลค่า'], rows: [['A', 1.5], ['B <x>', 2]] }];
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(/<table class="xtab">[\s\S]*B &lt;x&gt;[\s\S]*<\/table>/.test(src), 'extras table escaped'); }
// Finding 7 — divCum is per-case (col() gates on view.scn[i].divCum != null, not scenarios.divIncluded):
// dropping cases[0].divCum must drop the token for that case only, while other cases still get theirs,
// and the whole thing must still gate clean.
{ const doc = load('ZTS'); doc.scenarios.divIncluded = false; delete doc.scenarios.cases[0].divCum;
  const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(!src.includes('{{rd:sc1div}}'), 'divCum-per-case: case[0] with no divCum → no {{rd:sc1div}} token in source');
  t(src.includes('{{rd:sc2div}}'), 'divCum-per-case: case[1] still has divCum → {{rd:sc2div}} present');
  const html = expandReport(src);
  const res = CR.checkHtml(html, 'ZTS.html', { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], 'divCum-per-case fixture: full v2 gate — zero errors'); }
// postreview Finding 3 — mdesc EPS label ต้องระบุฐานให้ตรง: override.eps → "EPS ปรับ" (ไม่ใช่ TTM ของจริง)
{ const doc = load('ZTS'); const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.includes('EPS (TTM) $6.13 × P/E เป้าหมาย ~28x'), 'mdesc pe: no override → epsBasis gaap-ttm label "EPS (TTM)"'); }
{ const doc = load('ZTS-real'); const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.includes('EPS ปรับ $6.20 × P/E เป้าหมาย ~14x'), 'mdesc pe: leg.override.eps set → "EPS ปรับ" (not "EPS (TTM)")'); }
{ const doc = load('ZTS'); doc.fundamentals.epsBasis = 'adj-ttm'; const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.includes('EPS adj. (TTM) $6.13'), 'mdesc pe: epsBasis adj-ttm (no override) → "EPS adj. (TTM)"'); }
{ const doc = load('ZTS'); doc.fundamentals.epsBasis = 'fy'; const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.includes('EPS (FY) $6.13'), 'mdesc pe: epsBasis fy (no override) → "EPS (FY)"'); }
// fix round 1 (Opus) — epsBasis ที่ไม่รู้จักต้อง throw ระบุ path ไม่ fallback เงียบเป็น "EPS (TTM)"
//   (ตั้งหลัง compute — schema ก็กันไว้ แต่ renderer ต้องไม่เดาเองถ้าหลุดมาถึง)
{ const doc = load('ZTS'); const view = C.compute(doc, { seeds });
  doc.fundamentals.epsBasis = 'forward';
  t.throws(() => R.toV2Source(doc, view), /^fundamentals\.epsBasis: "forward"/, 'mdesc pe: unknown epsBasis → path-named throw'); }
{ const doc = load('ZTS'); const view = C.compute(doc, { seeds });
  delete doc.fundamentals.epsBasis;
  t.throws(() => R.toV2Source(doc, view), /^fundamentals\.epsBasis: undefined/, 'mdesc pe: missing epsBasis → path-named throw'); }
// postreview Finding 4 — เลขลบในหัวคอลัมน์ฉากใช้ minus glyph U+2212 ไม่ใช่ ASCII hyphen
{ const doc = load('ZTS-real'); const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.includes('EPS −3%/ปี'), 'scenario col header: negative growth uses U+2212 minus ("EPS −3%/ปี")');
  t(!/EPS -3%\/ปี/.test(src), 'scenario col header: no ASCII-hyphen "-3%/ปี" left in source'); }
// Plan 2a Task 2 — (O) token ใน metrics.notes ต้อง render (เดิม esc() เฉย ๆ ⇒ "{{pe}}" รั่ว + E13)
{ const doc = load('ZTS'); doc.metrics.notes.pe = 'ตอนนี้ {{pe}}x เทียบ **มัธยฐาน**';
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('ตอนนี้ {{rd:pe}}x เทียบ <b>มัธยฐาน</b>'), 'notes: v2-twin token becomes {{rd:pe}} and **bold** renders');
  t(!/\{\{pe\}\}/.test(src), 'notes: no raw v3 token left');
  const res = CR.checkHtml(expandReport(src), 'ZTS.html', { source: src });
  t.eq(res.errors.map((e) => e.id), [], 'notes with tokens: v2 gate 0 errors (no E13)'); }
// #50 — JSON ใน <script type="application/json"> ต้องไม่มี "<" ดิบ (ชั้นที่สองหลัง allowlist)
t(!R.jsonScript('{"a":"</script><b>"}').includes('<'), 'jsonScript escapes every <');
t.eq(JSON.parse(R.jsonScript('{"a":"</script>"}')).a, '</script>', 'jsonScript output still parses to the same value');
// ต้องฉีด '<' เข้า sm/rd เอง — ZTS จริงไม่มี '<' ใน JSON (schema กัน label กราฟ · sm เป็นตัวเลขล้วน) ⇒ ไม่ฉีด = test ผ่านแม้ถอด jsonScript()
{ const doc = load('ZTS'); const view = C.compute(doc, { seeds });
  view.sm.probe = 'a</script><b>'; view.rd.probe = 'b</script><b>';
  const src = R.toV2Source(doc, view);
  const blocks = src.match(/<script type="application\/json" id="(?:stock-meta|report-data)">[\s\S]*?<\/script>/g) || [];
  const bodies = blocks.map((b) => b.slice(b.indexOf('>') + 1, b.lastIndexOf('</script>')));
  t(bodies.length === 2 && bodies.every((x) => !x.includes('<') && x.includes('\\u003c')), 'both JSON script bodies are <-free (injected < became \\u003c)');
  t.eq(bodies.map((x) => JSON.parse(x).probe), ['a</script><b>', 'b</script><b>'], 'escaped JSON bodies parse back to the injected strings'); }
// Plan 2a Task 3 — text.* render where the fixed template text used to be
{ const doc = load('ZTS'); const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('<div class="hint">เฉลี่ย 2 วิธี</div>') && src.includes('มูลค่าเหมาะสมเฉลี่ย (Fair Value)'), 'no text → legacy hint + box unchanged');
  t(src.includes('โดยเฉพาะ P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต'), 'no text → legacy disclaimer clause'); }
{ const doc = load('ZTS'); doc.text = { valHint: 'SOTP + DDM — ห้ามใช้ P/E', valIntro: 'ทำไม <b>ไม่</b> ใช้ P/E ที่ {{px}}', metricsNote: 'งบสกุล EUR', disclaimerAssump: 'อัตราคิดลด (r) และอายุสัมปทาน' };
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('<div class="hint">SOTP + DDM — ห้ามใช้ P/E</div>'), 'valHint replaces the generated §3 hint');
  t(src.includes('<div class="l">มูลค่าเหมาะสม (Fair Value)<br>'), 'ruling R6: FV box label turns neutral');
  t(/<div class="card">\s*<p[^>]*>ทำไม <b>ไม่<\/b> ใช้ P\/E ที่ \{\{rd:px\}\}<\/p>\s*<div class="vmethod">/.test(src), 'valIntro sits before the first leg, tokens rendered');
  t(/<\/div>\s*<p[^>]*>งบสกุล EUR<\/p>\s*<\/section>/.test(src), 'metricsNote sits under the §1 grid');
  t(src.includes('โดยเฉพาะอัตราคิดลด (r) และอายุสัมปทาน'), 'disclaimerAssump replaces the clause after โดยเฉพาะ (no space, as in the v2 corpus)');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'text slots: v2 gate 0 errors'); }
{ const doc = load('ZTS'); doc.text = { valHint: '<script>alert(1)</script> <a href="x">y</a>', valIntro: '<script>alert(2)</script> <a href="x">z</a>' };
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(!/<script>alert|<a href="x">/.test(src), 'text slots: <script>/<a href> never reach the page raw');
  t(src.includes('<div class="hint">&lt;script&gt;alert(1)&lt;/script&gt; &lt;a href=&quot;x&quot;&gt;y&lt;/a&gt;</div>'), 'valHint markup is escaped');
  t(src.includes('&lt;script&gt;alert(2)&lt;/script&gt; &lt;a href=&quot;x&quot;&gt;z&lt;/a&gt;</p>'), 'valIntro markup is escaped'); }
{ const doc = load('ZTS'); const legacy = R.toV2Source(doc, C.compute(doc, { seeds })); doc.text = null;
  t.eq(R.toV2Source(doc, C.compute(doc, { seeds })), legacy, 'text: null renders byte-identical to no text (legacy)'); }
// Plan 2a Task 4 — ลำดับการ์ด + tone
{ const doc = load('ZTS'); doc.metrics.custom = [{ label: 'สาขาทั่วโลก', value: '45 ประเทศ', tone: 'pos' }];
  doc.metrics.cards = ['mcap', 'custom:0', { key: 'pe', tone: 'neg' }].concat(doc.metrics.cards.filter((k) => k !== 'mcap' && k !== 'pe'));
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  const ks = [...src.matchAll(/<div class="metric"><div class="k">([^<]*)<\/div><div class="v([^"]*)">/g)].map((m) => [m[1], m[2]]);
  t.eq(ks.slice(0, 3), [['Market Cap', ''], ['สาขาทั่วโลก', ' pos'], ['P/E (TTM)', ' neg']], 'custom placed at its slot · tone overrides class');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'ordered cards: v2 gate 0 errors'); }
// Plan 2a Task 5 — hint/box จาก role + family · ป้ายขา context
{ const doc = load('ZTS'); doc.legs[1].role = 'context'; const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('<div class="hint">เฉลี่ย 1 วิธี · +1 บริบท</div>'), 'hint counts fv legs + context');
  t(src.includes(`2. ${doc.legs[1].label} (บริบท — ไม่นับใน FV)</div>`), 'context leg mname carries the not-counted suffix');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'context leg: v2 gate 0 errors'); }
{ const doc = load('ZTS'); doc.legs = [{ ...doc.legs[0], family: 'market' }, { method: 'ddm', label: 'DDM', family: 'rg', inputs: { g: 5, r: 9 } }, { method: 'pbv', label: 'Justified P/BV', family: 'rg', inputs: { g: 5, r: 9 } }];
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('<div class="hint">เฉลี่ย 2 ตระกูล (3 วิธี)</div>') && src.includes('มูลค่าเหมาะสมเฉลี่ยตามตระกูล (Fair Value)'), 'family hint + FV box'); }
{ const doc = load('ZTS'); doc.legs[0].inputs.multipleRange = [20, 34]; const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('P/E เป้าหมาย ~28x (มัธยฐาน 5 ปี) · กรอบ 20–34x'), 'mdesc shows the sensitivity range'); }
{ const doc = load('ZTS'); doc.legs.push({ method: 'pe', label: 'P/E ปัจจุบัน', role: 'context', inputs: { multipleSource: 'current' } }); doc.fvWeights = null;
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes(`× P/E ปัจจุบัน ${(doc.market.px / doc.fundamentals.eps).toFixed(1)}x`), "R7: 'current' mdesc prints the live multiple");
  t(!src.includes('P/E เป้าหมาย ~undefinedx'), "R7: no 'undefined' multiple leaks into mdesc");
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], "'current' context leg: v2 gate 0 errors"); }
// Plan 2a Task 6 — mdesc ของ ddm2 / medianWindow / ifrs
{ const doc = load('ZTS'); doc.legs[1] = { method: 'ddm2', label: 'DDM 2 ระยะ', inputs: { d1: 2.04, g1: 11, years1: 10, g2: 3, r: 8.5, horizon: 40 } };
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('D₁ $2.04 โต 11%/ปี 10 ปี แล้ว 3%/ปี · r 8.5% · 40 งวด ไม่มีมูลค่าปลายงวด'), 'ddm2 mdesc (finite)');
  t(src.includes('$55.02</div>'), 'ddm2 mval computed');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'ddm2: v2 gate 0 errors'); }
{ const doc = load('ZTS'); doc.legs[0].inputs.medianWindow = 'FY2022–FY2025'; doc.fundamentals.epsBasis = 'ifrs';
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('EPS IFRS (TTM) $6.13 × P/E เป้าหมาย ~28x (มัธยฐาน FY2022–FY2025)'), 'medianWindow replaces the source name · ifrs label');
  t.eq(require('../../tools/v3/cards.js').renderCard('eps', view).d, 'IFRS', 'eps card base line says IFRS'); }
// Plan 2a Task 7 — ไม่มีจำนวนราย → "n/a" แต่เป้า + ป้าย gauge ยังอยู่ (เดิมต้องตั้ง analyst:null = "ไม่มีข้อมูล" ซึ่งเป็นเท็จ)
{ const doc = load('ZTS'); doc.analyst = { target: 190, rating: 'Buy' }; const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('~{{rd:analystTgt}} (Buy · n/a)'), 'verdict cell shows n/a for the count');
  t(src.includes('{{rd:analystTgt}}<br><small>เป้าเฉลี่ย Analyst</small>'), 'gauge marker kept');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'analyst without n: v2 gate 0 errors'); }
t.done();
