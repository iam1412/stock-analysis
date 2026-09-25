'use strict';
const t = require('./_t.js')('render');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const { expandReport } = require('../../build.js');
const CR = require('../../test/check-reports.js');
const RV = require('../../tools/report-values.js');

// วันราคาต้องสด ไม่งั้น E27 (>120 วัน) ยิงเมื่อ fixture เก่า — ตั้งเป็นวันนี้ (เวลาไทย) ทุกครั้งที่รัน
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (s) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`))); d.market.priceDate = today; d.meta.analysisDate = today; return d; };
const seeds = { ZTS: '#e8731a' };

// ZTS-real = fixture ของจริง (postreview Finding 5) — fixture file name มี "-real" แต่ doc.symbol ข้างในคือ "ZTS"
// เหมือน BBL/ZTS ⇒ ต้องส่ง checkHtml ด้วย `${doc.symbol}.html` (ไม่ใช่ `${sym}.html`) กัน E04 ตรวจ title ผิด
for (const sym of ['ZTS', 'BBL', 'ZTS-real', 'BBL-real', 'EQIX-real', 'FER-real']) {
  const doc = load(sym);
  const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.startsWith('<!DOCTYPE html>') && src.includes('<!--TEMPLATE:STYLE-->') && src.includes('<!--TEMPLATE:ENGINE-->'), `${sym}: markers present`);
  t(!/\{\{(?!rd:)[^}]*\}\}/.test(src), `${sym}: no v3 tokens left in source`);
  const html = expandReport(src);
  const res = CR.checkHtml(html, `${doc.symbol}.html`, { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], `${sym}: full v2 gate — zero errors`);
  t((html.match(/<section>/g) || []).length === 8 + doc.extras.length, `${sym}: 8 sections + one per extras table`);
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
// Plan 2a Task 7 — ไม่มีจำนวนราย → ไม่พิมพ์จำนวน แต่เป้า + ป้าย gauge ยังอยู่ (เดิมต้องตั้ง analyst:null = "ไม่มีข้อมูล" ซึ่งเป็นเท็จ)
// Plan 4b Task 1 — แทนรูปเดิม "(Buy · n/a)": n ที่ไม่ทราบไม่พิมพ์ ⇒ "(Buy)"
{ const doc = load('ZTS'); doc.analyst = { target: 190, rating: 'Buy' }; const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('~{{rd:analystTgt}} (Buy)</div>') && !src.includes('(Buy · n/a)'), 'verdict cell omits the unknown count: "(Buy)"');
  t(src.includes('{{rd:analystTgt}}<br><small>เป้าเฉลี่ย Analyst</small>'), 'gauge marker kept');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'analyst without n: v2 gate 0 errors'); }
// Plan 2a Task 9 — ป้าย AFFO ทุกที่ + hint §6 ของ driver ทุกชนิด
{ const doc = load('ZTS'); Object.assign(doc.fundamentals, { ffoPerShare: 3.1, ffoBasis: 'affo' });
  doc.legs[1] = { method: 'pffo', label: 'P/AFFO', inputs: { multiple: 17, multipleSource: 'median5y' } };
  doc.scenarios.driver = 'ffo'; doc.scenarios.exitMetric = 'pffo';
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('P/AFFO 17x (มัธยฐาน 5 ปี)'), 'pffo mdesc says P/AFFO');
  t(src.includes('<li><span>AFFO ปี ') && src.includes('<li><span>P/AFFO ออก</span>'), 'scenario rows say AFFO / P/AFFO');
  t(src.includes(' • AFFO ฐาน ~$3.10'), '§6 hint shows the non-EPS driver base');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'REIT labels: v2 gate 0 errors'); }
// Plan 2a Task 10 (controller ruling from Task 9 review) — งบสกุลอื่น: ฐานต่อหุ้นของฉาก (§6 hint · ปี 3) + ฐานการ์ด P/S
// เป็นสกุลราคา (แปลงด้วย fx ก่อนหารจำนวนหุ้น) · ยอดงบรวมใน mdesc DCF = สกุลงบ (เหมือนการ์ด FCF)
{ const doc = load('ZTS'); Object.assign(doc.fundamentals, { reportCurrency: 'EUR', fx: 1.2 }); doc.legs[1].inputs.rfCurrency = 'EUR';
  doc.metrics.cards.push('ps');
  Object.assign(doc.scenarios, { driver: 'revenuePerShare', exitMetric: 'ps', note: 'ราคาเป้าคิดจากรายได้/หุ้นปีที่ 3 คูณ P/S ออก' });
  doc.scenarios.cases.forEach((c, i) => { c.exitMultiple = [4, 5, 6][i]; });
  const view = C.compute(doc, { seeds }), src = R.toV2Source(doc, view);
  const rps = 9.4e9 * 1.2 / 443e6;
  t.near(view.scn[0].driverStart, rps, 1e-9, 'FX: revenuePerShare driver = quote-currency revenue ÷ shares');
  t(src.includes(`รายได้/หุ้น ฐาน ~$${RV.fmtPrice(rps)}`), 'FX: §6 hint prints the converted per-share base under the quote symbol');
  t(src.includes(`<li><span>รายได้/หุ้น ปี 3</span><span>~$${RV.fmtPrice(view.scn[1].driverEnd)}</span></li>`), 'FX: year-3 driver in the quote currency');
  t.near(view.scn[1].tgt, rps * Math.pow(1.08, 3) * 5, 1e-9, 'FX: scenario target = quote per-share × exit (comparable to px)');
  t(src.includes('FCF €2.30B โต'), 'FX: DCF mdesc prints the statement total in the statement currency');
  t.eq(require('../../tools/v3/prose.js').renderProse('{{scn.base.end}}', view, { mode: 'v2src' }), '$' + RV.fmtPrice(view.scn[1].driverEnd), 'FX: {{scn.base.end}} token = converted per-share driver, quote symbol');
  t(src.includes('รายได้ TTM $11.3B'), 'FX: P/S card base line in the quote currency');
  const res = CR.checkHtml(expandReport(src), 'ZTS.html', { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], 'FX: full v2 gate — zero errors (W16 reads the P/S base line)');
  const d2 = JSON.parse(JSON.stringify(doc)); d2.scenarios.driver = 'fcfPerShare'; d2.scenarios.exitMetric = 'pfcf';
  const v2 = C.compute(d2, { seeds });
  t.near(v2.scn[0].driverStart, 2.3e9 * 1.2 / 443e6, 1e-9, 'FX: fcfPerShare driver converted too');
  t(R.toV2Source(d2, v2).includes(`FCF/หุ้น ฐาน ~$${RV.fmtPrice(2.3e9 * 1.2 / 443e6)}`), 'FX: fcfPerShare hint in the quote currency'); }
// Plan 2a Task 11 — ตาราง SOTP ของ FER: แถวรวม + แถวแปลงสกุล + ลบเป็น U+2212
{ const doc = load('FER-real'); const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('<td><b>รวม SOTP</b></td><td><b></b></td><td><b></b></td><td><b>32,280</b></td><td><b>44.83</b></td>'), 'total row rendered bold with column formats');
  t(src.includes('แปลงเป็น USD ที่ EURUSD 1.15566: <b>$51.81</b>'), 'fx row = total × fundamentals.fx');
  t(src.includes('<td>−1,300</td><td>−1.81</td>') && !/<td>-1/.test(src), 'negative cells use U+2212'); }
// Task 11 fix round 1 — FER "+1,307" คงเป็นข้อความ (คอลัมน์ 3 ไม่ใช่ sumCol) · แถวแปลงสกุลยอดติดลบใช้ U+2212
{ const doc = load('FER-real'); const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('<td>+1,307</td><td>1.82</td>'), 'FER net cash keeps its explicit + (v2 fidelity)'); }
{ const doc = load('FER-real'); const x = doc.extras[1];
  x.rows = [['A', '', '', -100, -2], { kind: 'total', cells: ['รวม', '', '', -100, -2] }];
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('แปลงเป็น USD ที่ EURUSD 1.15566: <b>−$2.31</b>') && !src.includes('$-2.31'), 'fx row: negative total prints U+2212 before the symbol'); }
// Plan 4b Task 1 — render honours the new enums / nullable rating / tone none
{
  const d = load('ZTS'); d.analyst = { target: 100.94, n: null, rating: null, asOf: null };
  const v = C.compute(d, { seeds }), html = R.toV2Source(d, v);
  t(/เป้านักวิเคราะห์ 12 ด\.<\/div><div class="v" style="color:#a5d6a7">~\{\{rd:analystTgt\}\}<\/div>/.test(html), 'analyst cell with rating null and n null prints the target only (no "(null · n/a)")');
  d.analyst = { target: 100.94, n: 19, rating: null, asOf: null };
  t(/~\{\{rd:analystTgt\}\} \(19 ราย\)<\/div>/.test(R.toV2Source(d, C.compute(d, { seeds }))), 'rating null + n → "(19 ราย)"');
}
{
  const d = load('ZTS'); d.metrics.cards = [{ key: 'pe', tone: 'none' }].concat(d.metrics.cards.filter((c) => c !== 'pe' && !(c && c.key === 'pe')));
  const html = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<div class="k">P\/E \(TTM\)<\/div><div class="v">/.test(html), 'tone none → .v has no class (catalogue default neu suppressed)');
}
// fix round 1 (N-3 ruling): evsales pairs with revenuePerShare only ⇒ de/fre render on exit pe, evsales on revenuePerShare
{
  const d = load('ZTS'); d.scenarios.driver = 'de'; d.fundamentals.dePerShare = 3.3;
  const html = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<span>DE\/หุ้น [+−][0-9.]+%\/ปี<\/span>/.test(html) && /DE\/หุ้น ฐาน ~/.test(html), 'driver de → "DE/หุ้น" labels');
  d.scenarios.driver = 'fre'; d.fundamentals.frePerShare = 1.7;
  const h2 = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<span>FRE\/หุ้น [+−][0-9.]+%\/ปี<\/span>/.test(h2) && /FRE\/หุ้น ฐาน ~/.test(h2), 'driver fre → "FRE/หุ้น" labels');
}
{
  const d = load('ZTS'); d.scenarios.driver = 'revenuePerShare'; d.scenarios.exitMetric = 'evsales'; d.fundamentals.netDebt = 1e9;
  const html = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<span>EV\/Sales ออก<\/span>/.test(html) && /<span>รายได้\/หุ้น [+−][0-9.]+%\/ปี<\/span>/.test(html), 'exitMetric evsales → "EV/Sales ออก" (driver revenuePerShare)');
}

// Plan 4b Task 2 — mdesc for stages · exitDp print (brief's doc/SEEDS = load('ZTS')/seeds here)
{
  const d = load('ZTS');
  d.legs[1] = { method: 'dcf', label: 'DCF', role: 'fv', family: 'rg', inputs: { stages: [{ years: 5, g: 7 }, { years: 5, g: 4 }], tg: 3, r: 8.5, rfCurrency: d.currency } };
  d.fvWeights = null; d.fundamentals.fcf = d.fundamentals.fcf || 2.3e9; d.fundamentals.shares = d.fundamentals.shares || 4.3e8;
  d.legs.forEach((l) => { if (l.role !== 'context' && !l.family) l.family = l.method === 'pe' ? 'market' : 'rg'; });
  const v = C.compute(d, { seeds });
  t(/โต 7%\/ปี 5 ปี → 4%\/ปี 5 ปี · โตถาวร 3% · r 8\.5%/.test(R.mdesc(d.legs[1], v)), 'mdesc prints the stage schedule (no "undefined"): ' + R.mdesc(d.legs[1], v));
  d.scenarios.exitDp = 1; d.scenarios.cases[0].exitMultiple = 17.25;
  const html = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<span>P\/E ออก<\/span><span>17\.3x<\/span>/.test(html), 'exitDp 1 → exit multiple printed as 17.3x');
  d.scenarios.exitDp = 0;
  t(/<span>P\/E ออก<\/span><span>17x<\/span>/.test(R.toV2Source(d, C.compute(d, { seeds }))), 'exitDp 0 → 17x');
  delete d.scenarios.exitDp;
  t(/<span>P\/E ออก<\/span><span>17\.25x<\/span>/.test(R.toV2Source(d, C.compute(d, { seeds }))), 'exitDp absent → exitMultiple printed as-is (today\'s output)');
}

// Plan 4b Task 6b — chartHint · hintNote · retNote print only when present · SRC_NAME.author
{
  const d = load('ZTS'); delete d.scenarios.hintNote; if (d.text) delete d.text.chartHint;
  const v = C.compute(d, { seeds }), src = R.toV2Source(d, v);
  t(src.includes('<h2>ราคาย้อนหลัง ~1 ปี</h2><div class="hint">โดยประมาณ</div>'), 'absent chartHint → §2 hint exactly "โดยประมาณ"');
  t(/<div class="hint">จากจุดเข้า \{\{rd:px\}\} • EPS ฐาน ~\{\{rd:baseEps\}\}\{\{rd:scnNote\}\}<\/div>/.test(src), 'absent hintNote → §6 hint ends with {{rd:scnNote}} as today');
  t(src.includes('<div class="ret {{rd:sc2retClass}}">{{rd:sc2ret}}</div>'), 'absent retNote → .ret prints only the token');
  d.text = Object.assign({}, d.text, { chartHint: 'A' }); d.scenarios.hintNote = 'B'; d.scenarios.cases[1].retNote = 'C ~{{px}}';
  const s2 = R.toV2Source(d, C.compute(d, { seeds }));
  t(s2.includes('<div class="hint">โดยประมาณ A</div>'), 'chartHint → "โดยประมาณ A"');
  t(/~\{\{rd:baseEps\}\} B\{\{rd:scnNote\}\}<\/div>/.test(s2), 'hintNote → " B" before {{rd:scnNote}} (review I-4 — base qualifiers stay on the base, not on "รวมปันผล")');
  t(s2.includes('<div class="ret {{rd:sc2retClass}}">{{rd:sc2ret}} C ~{{rd:px}}</div>'), 'retNote → after the token, rendered through pr() (v3 token → rd twin)');
  t(s2.includes('<div class="ret {{rd:sc1retClass}}">{{rd:sc1ret}}</div>'), 'retNote is per case');
  d.scenarios.hintNote = 'x & y'; t(R.toV2Source(d, C.compute(d, { seeds })).includes(' x &amp; y{{rd:scnNote}}</div>'), 'hintNote escaped through pr()');
}
{
  const d = load('ZTS'); const i = d.legs.findIndex((l) => l.method === 'pe');
  d.legs[i].inputs.multiple = 38; d.legs[i].inputs.multipleSource = 'author'; delete d.legs[i].inputs.medianWindow;
  const v = C.compute(d, { seeds });
  // brief wrote "× P/E 38.0x (…)" — the pe mdesc format is "× P/E เป้าหมาย ~38x (<source>)"; the source label is what this pins
  t(/× P\/E เป้าหมาย ~38x \(ผู้วิเคราะห์กำหนด\)/.test(R.mdesc(d.legs[i], v)), "pe leg with multipleSource 'author' → (ผู้วิเคราะห์กำหนด): " + R.mdesc(d.legs[i], v));
  t.eq(R.SRC_NAME && R.SRC_NAME.author, 'ผู้วิเคราะห์กำหนด', 'SRC_NAME.author');
}
// Plan 4c-prep Task 2 (D2) — labels from base/baseLabel · new enum labels · absent ⇒ unchanged
{
  const d = load('ZTS'); const before = R.toV2Source(d, C.compute(d, { seeds }));
  d.fundamentals.epsForward = 6.8; d.legs[0].inputs.base = 'epsForward'; d.legs[0].baseLabel = 'FY2026E consensus';
  const src = R.toV2Source(d, C.compute(d, { seeds }));
  t(src.includes('EPS FY2026E consensus (forward) $6.80 × P/E เป้าหมาย ~28x'), 'forward base prints its own label and the forward EPS', (src.match(/<div class="mdesc">[^<]*/) || [''])[0]);
  delete d.legs[0].baseLabel;
  t(R.toV2Source(d, C.compute(d, { seeds })).includes('EPS (forward) $6.80 ×'), 'forward base without baseLabel → "EPS (forward)"');
  const f = load('ZTS'); f.fundamentals.fy = { period: 'FY2025', eps: 6.5 }; f.legs[0].inputs.base = 'epsFy';
  t(R.toV2Source(f, C.compute(f, { seeds })).includes('EPS FY2025 $6.50 ×'), 'epsFy base prints the fy period');
  const z = load('ZTS');
  t.eq(R.toV2Source(z, C.compute(z, { seeds })), before, 'fields absent → toV2Source byte-identical');
}
{
  const d = load('ZTS'); d.fundamentals.ebitda = 3.2e9; d.scenarios.driver = 'ebitdaPerShare'; d.scenarios.exitMetric = 'evebitda';
  d.scenarios.cases.forEach((c, i) => { c.exitMultiple = [14, 16, 18][i]; });
  const src = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<span>EBITDA\/หุ้น \+8%\/ปี<\/span>/.test(src) && /<span>EV\/EBITDA ออก<\/span>/.test(src) && /EBITDA\/หุ้น ฐาน ~/.test(src), 'driver ebitdaPerShare / exit evebitda labels');
  const r = load('ZTS'); r.fundamentals.ffoBasis = 'coreFfo'; r.fundamentals.ffoPerShare = 4; r.legs[0] = { method: 'pffo', label: 'P/Core FFO', inputs: { multiple: 20, multipleSource: 'peer' } };
  t(R.toV2Source(r, C.compute(r, { seeds })).includes('P/Core FFO 20x (ค่ากลางกลุ่มเทียบ)'), 'coreFfo → "P/Core FFO" in the pffo mdesc');
}
// Plan 4c-prep Task 3 (D3) — carry fields render where v2 printed them · absent ⇒ byte-identical
{
  const z = load('ZTS'); const before = R.toV2Source(z, C.compute(z, { seeds }));
  const d = load('ZTS'); d.meta.sectorLine = 'NYSE · Animal Health'; d.text = { legendNote: 'จุดแดง = งบออก' };
  d.verdict = { extraCells: [{ k: 'จุดทยอยสะสม', v: 'ต่ำกว่า {{fv}}' }, { k: 'คะแนนคุณภาพ', v: 'สูง' }] };
  const src = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<\/span>\n    <\/div>\n    <div style="font-size:12\.5px;opacity:\.85;margin-top:6px">NYSE · Animal Health<\/div>\n    <h1>/.test(src), 'sectorLine: small line between the tags and h1');
  t(/จุดสำคัญ<\/span>\n        <span>จุดแดง = งบออก<\/span>\n      <\/div>/.test(src), 'legendNote: 4th legend span');
  t(/เป้านักวิเคราะห์ 12 ด\.[\s\S]*?<\/div><\/div>\n        <div class="vcell"><div class="k">จุดทยอยสะสม<\/div><div class="v">ต่ำกว่า \{\{rd:fv\}\}<\/div><\/div>\n        <div class="vcell"><div class="k">คะแนนคุณภาพ<\/div><div class="v">สูง<\/div><\/div>\n      <\/div>/.test(src), 'extraCells: vcells after the analyst cell, tokens rendered');
  const html = expandReport(src);
  t.eq(CR.checkHtml(html, 'ZTS.html', { source: src }).errors.map((e) => `${e.id} ${e.msg}`), [], 'carry fields: full v2 gate — zero errors');
  t.eq(R.toV2Source(z, C.compute(z, { seeds })), before, 'fields absent → byte-identical');
}
t.done();
