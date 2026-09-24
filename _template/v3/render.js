'use strict';
/**
 * render.js — template เดียวของรายงาน v3 → สร้าง "ต้นฉบับรูป v2" ในหน่วยความจำ
 * (stock-meta + report-data v2 + token {{rd:…}} + marker) แล้วให้ build.js เดินทางเดิมทุกขั้น
 * ⇒ dashboard.css / engine.js / decorateReport / injectTA / gate v2 ใช้ต่อได้โดยไม่แก้
 * DOM/class คัดจาก _template/skeleton-th.html (ห้ามคิด class ใหม่ ยกเว้น .xtab ของ extras)
 * ทุก string จาก JSON ที่ไปลง HTML แบบ prose ผ่าน esc() หรือ renderProse() เสมอ · สี gdots/theme ผ่าน allowlist
 * tools/safe-values.js ที่ schema (ต้นทาง) และ build.js (ปลายทาง) · JSON ใน <script type="application/json">
 * ผ่าน jsonScript() ที่แปลง '<' เป็น \u003c (ชั้นที่สอง — open-item #50)
 */
const RV = require('../../tools/report-values.js');
const P = require('../../tools/v3/prose.js');
const K = require('../../tools/v3/cards.js');
const S = require('../../tools/v3/schema.js');
const X = require('../../tools/v3/extras.js');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const METHOD_NAME = { pe: 'P/E', pbv: 'P/BV', ps: 'P/S', evsales: 'EV/Sales', evebitda: 'EV/EBITDA', pfcf: 'P/FCF', fcfyield: 'FCF Yield',
  pffo: 'P/FFO', ddm: 'DDM / Gordon Growth', ddm2: 'DDM 2 ระยะ', dcf: 'DCF', ri: 'Residual Income', declared: 'มูลค่าประกาศ' };
const SRC_NAME = { median5y: 'มัธยฐาน 5 ปี', median10y: 'มัธยฐาน 10 ปี', peer: 'ค่ากลางกลุ่มเทียบ', justified: 'justified', sector: 'ค่ากลางเซกเตอร์', current: 'ตัวคูณปัจจุบัน' };
// Plan 2a Task 9 (§3.6 J) — ป้าย FFO/AFFO ของขา pffo · driver ffo · exit pffo
const ffoLabel = (doc) => ({ ffo: 'FFO', affo: 'AFFO' }[doc.fundamentals.ffoBasis || 'ffo']);
const dot = (c) => `<div style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block;margin:0 3px"></div>`;
// JSON ใน <script> ห้ามมี '<' ดิบ (กัน </script> ปิดแท็กก่อนเวลา) — '<' โผล่ได้เฉพาะในสตริง JSON ⇒ \u003c ยัง parse เป็นค่าเดิม
const jsonScript = (s) => String(s).replace(/</g, '\\u003c');

// Finding 3 (postreview) — mdesc EPS ต้องระบุฐานให้ตรง: override.eps = "EPS ปรับ" (ไม่ใช่ TTM ของจริง)
// ไม่งั้นตาม fundamentals.epsBasis (gaap-ttm/adj-ttm/fy) — เดิม mdesc พิมพ์ "EPS (TTM)" ตายตัวแม้ eps มาจาก override
const EPS_BASIS_LABEL = { 'gaap-ttm': 'EPS (TTM)', 'adj-ttm': 'EPS adj. (TTM)', fy: 'EPS (FY)', ifrs: 'EPS IFRS (TTM)' };
function epsLabel(leg, view) {
  if (leg.override && leg.override.eps != null) return 'EPS ปรับ';
  const basis = view.doc.fundamentals.epsBasis;
  // ไม่เดา: ฐานที่ไม่รู้จัก = ข้อมูลผิด (schema บังคับ enum เมื่อมี eps) — fallback เงียบเป็น "EPS (TTM)" จะพิมพ์ฐานผิดให้คนอ่าน
  if (!Object.prototype.hasOwnProperty.call(EPS_BASIS_LABEL, basis)) {
    throw new Error(`fundamentals.epsBasis: ${JSON.stringify(basis)} ไม่รู้จัก (ต้องเป็น ${Object.keys(EPS_BASIS_LABEL).join('/')})`);
  }
  return EPS_BASIS_LABEL[basis];
}
function mdesc(leg, view) {
  const m = (v) => view.cur + RV.fmtPrice(v);
  const i = leg.inputs, b = { ...view.doc.fundamentals, ...(leg.override || {}) };
  const src = i.medianWindow ? ` (มัธยฐาน ${i.medianWindow})` : i.multipleSource ? ` (${SRC_NAME[i.multipleSource]})` : '';
  const rng = i.multipleRange ? ` · กรอบ ${i.multipleRange[0]}–${i.multipleRange[1]}x` : '';
  // R7 — 'current': ตัวคูณสดจากราคาวันนี้ (หน้า v3 build ใหม่จาก JSON ทุกครั้ง จึงไม่ค้าง) · ตัวตั้งเดียวกับ compute (S.CURRENT_BASE + override)
  const live = i.multipleSource === 'current';
  const mult = live ? (view.d.px / b[S.CURRENT_BASE[leg.method]]).toFixed(1) : i.multiple;
  switch (leg.method) {
    case 'pe': return live ? `${epsLabel(leg, view)} ${m(b.eps)} × P/E ปัจจุบัน ${mult}x`
      : `${epsLabel(leg, view)} ${m(b.eps)} × P/E เป้าหมาย ~${mult}x${src}${rng}`;
    case 'pbv': return i.multipleSource != null ? `BVPS ${m(b.bvps)} × P/BV ${live ? 'ปัจจุบัน ' : ''}${mult}x${live ? '' : src}${rng}`
      : `P/BV เหมาะสม = (ROE ${b.roe}% − g ${i.g}%)/(r ${i.r}% − g ${i.g}%) ≈ ${((b.roe - i.g) / (i.r - i.g)).toFixed(2)} × BVPS ${m(b.bvps)}`;
    case 'ddm': return `D₁ = ปันผล ${m(b.dps)} × (1+g); g ${i.g}%, r ${i.r}%`;
    case 'ddm2': return `D₁ ${m(i.d1)} โต ${i.g1}%/ปี ${i.years1} ปี แล้ว ${i.g2}%/ปี · r ${i.r}% · `
      + (i.horizon == null ? 'มูลค่าปลายงวดแบบ Gordon' : `${i.horizon} งวด ไม่มีมูลค่าปลายงวด`);
    // FCF = ยอดงบรวม (fundamentals/override) → สกุลงบ (view.stmtCur) เหมือนการ์ด FCF · ค่าขา (.mval) เป็นสกุลราคา (compute แปลงด้วย fx แล้ว)
    case 'dcf': return `FCF ${RV.fmtBig(b.fcf, view.stmtCur || view.cur)} โต ${i.g1}%/ปี ${i.years1} ปี · โตถาวร ${i.tg}% · r ${i.r}%`;
    case 'ri': return `BVPS ${m(b.bvps)} · ROE ${b.roe}% vs r ${i.r}% · ${i.years} ปี · payout ${i.payout}%`;
    case 'fcfyield': return `FCF/หุ้น ÷ yield เป้าหมาย ${i.yield}%`;
    case 'declared': return `ค่าประกาศ (${i.basis})` + (i.extrasRef != null ? ' — ดูตารางประกอบ' : '');
    default: return `${leg.method === 'pffo' ? `P/${ffoLabel(view.doc)}` : METHOD_NAME[leg.method]} ${live ? 'ปัจจุบัน ' : ''}${mult}x${live ? '' : src}${rng}`;
  }
}

function extrasHtml(doc, view, after) {
  return doc.extras.filter((x) => x.after === after).map((x) => {
    const pr = (s) => P.renderProse(s, view, { mode: 'v2src' });
    const cell = (c, j) => (typeof c === 'number' ? esc(X.fmtCell(c, x.columns && x.columns[j], view)) : pr(c));
    const ncol = Math.max(x.headers.length, ...x.rows.map((r) => (Array.isArray(r) ? r.length : r.kind === 'total' ? r.cells.length : 1)));
    const head = x.headers.length ? `<tr>${x.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : '';
    const row = (r) => (Array.isArray(r) ? `<tr>${r.map((c, j) => `<td>${cell(c, j)}</td>`).join('')}</tr>`
      : r.kind === 'total' ? `<tr>${r.cells.map((c, j) => `<td><b>${cell(c, j)}</b></td>`).join('')}</tr>`
        : `<tr><td colspan="${ncol}">${pr(r.text)}</td></tr>`);
    let rows = x.rows.map(row).join('');
    if (x.fx) {
      const f = doc.fundamentals, tot = X.tableTotal(x).total;
      rows += `<tr><td colspan="${ncol}">แปลงเป็น ${esc(doc.currency)} ที่ ${esc(f.reportCurrency + doc.currency)} ${f.fx}: <b>${esc(view.cur + RV.fmtPrice(tot * f.fx))}</b></td></tr>`;
    }
    const note = x.note ? `<p class="xnote">${pr(x.note)}</p>` : '';
    return `\n  <section>\n    <div class="card"><h3>${esc(x.title)}</h3><table class="xtab">${head}${rows}</table>${note}</div>\n  </section>`;
  }).join('');
}

// หัว §3 + ป้ายกล่อง FV — ruling R6 (valHint: ป้ายกล่องเป็นกลาง ไม่ให้คำที่ generate ขัดกับ hint ของผู้เขียน) · §3.6 C (family) · §3.6 I (ขา context ไม่นับ)
function valHintParts(doc, view) {
  if (doc.text && doc.text.valHint) return { hint: P.renderProse(doc.text.valHint, view, { mode: 'v2src' }), box: 'มูลค่าเหมาะสม (Fair Value)' };
  const fv = view.legs.filter((l) => l.role === 'fv'), nCtx = view.legs.length - fv.length;
  const fams = new Set(fv.map((l) => l.family).filter(Boolean));
  const byFamily = !doc.fvWeights && fams.size > 0;
  const word = byFamily ? 'เฉลี่ยตามตระกูล' : doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย';
  const hint = (byFamily ? `เฉลี่ย ${fams.size} ตระกูล (${fv.length} วิธี)` : `${word} ${fv.length} วิธี`) + (nCtx ? ` · +${nCtx} บริบท` : '');
  return { hint, box: `มูลค่าเหมาะสม${word} (Fair Value)` };
}

function toV2Source(doc, view) {
  const pr = (s) => P.renderProse(s, view, { mode: 'v2src' });
  const T = doc.text || {}; const vh = valHintParts(doc, view);
  const m = doc.meta, d = view.d, s = doc.scenarios, TH = doc.currency === 'THB';
  // ลำดับ = S.cardEntries (custom แทรกได้ด้วย "custom:<i>") · tone → class สีเดิม (.v pos|neg|neu) — ไม่มี markup ใน JSON (§3.6 H)
  const noteOf = (k) => doc.metrics.notes && doc.metrics.notes[k];
  const cards = S.cardEntries(doc.metrics).map((e) => {
    if (e.custom != null) {
      const c = doc.metrics.custom[e.custom];
      return { k: esc(c.label), v: pr(c.value), d: c.note ? pr(c.note) : '', cls: e.tone || '' };
    }
    const c = K.renderCard(e.key, view), note = noteOf(e.key);
    return { k: esc(c.k), v: esc(c.v), d: esc(c.d) + (note ? (c.d ? ' · ' : '') + pr(note) : ''), cls: e.tone || c.cls };
  });
  const cardHtml = cards.map((c) => `<div class="metric"><div class="k">${c.k}</div><div class="v${c.cls ? ' ' + c.cls : ''}">${c.v}</div><div class="d">${c.d}</div></div>`).join('\n      ');
  const legsHtml = view.legs.map((l, i) => `<div class="vmethod">
        <div><div class="mname">${i + 1}. ${esc(l.label)}${l.role === 'context' ? ' (บริบท — ไม่นับใน FV)' : ''}</div><div class="mdesc">${esc(mdesc(doc.legs[i], view))}${l.note ? ' — ' + pr(l.note) : ''}</div></div>
        <div class="mval">${esc(view.cur + RV.fmtPrice(l.value))}</div>
      </div>`).join('\n      ');
  // Review Focus #2 — ป้ายเกจเรียงค่าจากน้อยไปมากเสมอ (E26)
  const scale = [
    { v: d.mos30, tok: '{{rd:mos30}}', lab: 'MOS 30%' }, { v: d.mos20, tok: '{{rd:mos20}}', lab: 'MOS 20%' },
    { v: d.fv, tok: '{{rd:fv}}', lab: 'Fair Value' }, { v: d.values.fvHigh, tok: '{{rd:fvHigh}}', lab: 'กรอบบน FV' },
  ].concat(doc.analyst ? [{ v: doc.analyst.target, tok: '{{rd:analystTgt}}', lab: 'เป้าเฉลี่ย Analyst' }] : [])
    .sort((a, b) => a.v - b.v)
    .map((x, i, arr) => `<span${i === 0 ? '' : i === arr.length - 1 ? ' style="text-align:right"' : ' style="text-align:center"'}>${x.tok}<br><small>${x.lab}</small></span>`).join('\n          ');
  const FFO = ffoLabel(doc);
  const drv = { eps: 'EPS', ffo: FFO, revenuePerShare: 'รายได้/หุ้น', bvps: 'BVPS', fcfPerShare: 'FCF/หุ้น' }[s.driver];
  const ex = { pe: 'P/E', ps: 'P/S', pbv: 'P/BV', pffo: `P/${FFO}`, pfcf: 'P/FCF' }[s.exitMetric];
  const col = (i, cls, name) => {
    const sc = view.scn[i];
    // Finding 4 (postreview) — เลขลบใช้ minus glyph U+2212 (ตามธรรมเนียม v2) ไม่ใช่ ASCII hyphen
    const g = sc.growth >= 0 ? `+${sc.growth}` : `−${Math.abs(sc.growth)}`;
    return `<div class="col ${cls}">
        <div class="top"><span>${name}</span><span>${drv} ${g}%/ปี</span></div>
        <div class="body">
          <div class="tgt">{{rd:sc${i + 1}tgt}}</div>
          <div class="ret {{rd:sc${i + 1}retClass}}">{{rd:sc${i + 1}ret}}</div>
          <ul>
            <li><span>${drv} ปี ${s.years}</span><span>~${esc(view.cur + RV.fmtPrice(sc.driverEnd))}</span></li>
            <li><span>${ex} ออก</span><span>${sc.exitMultiple}x</span></li>${sc.divCum != null ? `
            <li><span>ปันผลรวม ${s.years} ปี</span><span>~{{rd:sc${i + 1}div}}</span></li>` : ''}
            <li><span>สถานการณ์</span><span>${pr(sc.desc)}</span></li>
          </ul>
        </div>
      </div>`;
  };
  const li = (xs) => xs.map((x) => `<li>${pr(x)}</li>`).join('\n          ');
  const an = doc.analyst;
  const analystCell = an
    ? `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v" style="color:#a5d6a7">~{{rd:analystTgt}} (${esc(an.rating)} · ${an.n != null ? an.n + ' ราย' : 'n/a'})</div></div>`
    : `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v">ไม่มีข้อมูล</div></div>`;
  const tags = [`${esc(m.exchange)}: ${esc(doc.symbol)}`].concat((m.headerTags || []).map(esc)).map((x) => `<span class="tag">${x}</span>`).join('\n      ');
  const r52 = doc.market.range52w;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>วิเคราะห์หุ้น ${esc(m.company)} (${esc(doc.symbol)}) — Stock Analysis Dashboard</title>
<meta name="ai-model" content="${esc(m.aiModel)}">
<script type="application/json" id="stock-meta">
${jsonScript(JSON.stringify(view.sm))}
</script>
<script type="application/json" id="report-data">
${jsonScript(RV.styledRD(view.rd))}
</script>
<!--TEMPLATE:STYLE-->
</head>
<body>
<div class="wrap">

  <header>
    <div class="gdots">${view.gdots.map(dot).join('')}</div>
    <div>
      ${tags}
    </div>
    <h1>${esc(m.company)} (${esc(doc.symbol)})</h1>
    <div class="sub">${pr(m.sub)}</div>
    <div class="price-row">
      <div>
        <div class="px">{{rd:px}}<small>(${esc(doc.symbol)})</small></div>
      </div>
      <div class="chg">{{rd:chg}}</div>
      <div class="px-meta">
        ราคา ณ {{rd:priceDate}}${m.priceNote ? ` (${pr(m.priceNote)})` : ''}<br>${r52 ? `
        กรอบ 52 สัปดาห์ ${esc(view.cur + RV.fmtPrice(r52.lo))} – ${esc(view.cur + RV.fmtPrice(r52.hi))}<br>` : ''}
        ที่มา: ${m.sources.map(esc).join(', ')}
      </div>
    </div>
  </header>

  <section>
    <div class="s-head"><div class="n">1</div><h2>ข้อมูลสำคัญ (Key Metrics)</h2>${doc.metrics.hint ? `<div class="hint">${pr(doc.metrics.hint)}</div>` : ''}</div>
    <div class="grid g4">
      ${cardHtml}
    </div>${T.metricsNote ? `\n    <p style="font-size:12.5px;color:var(--muted);margin-top:12px;line-height:1.6">${pr(T.metricsNote)}</p>` : ''}
  </section>${extrasHtml(doc, view, 'metrics')}

  <section>
    <div class="s-head"><div class="n">2</div><h2>ราคาย้อนหลัง ~1 ปี</h2><div class="hint">โดยประมาณ</div></div>
    <div class="card">
      <div class="chart-wrap">
        <svg id="priceChart" viewBox="0 0 920 300" style="width:100%;height:auto"></svg>
      </div>
      <div class="legend">
        <span><i style="background:var(--blue)"></i>ราคา ${esc(doc.symbol)}</span>
        <span><i style="background:#1e8e3e"></i>มูลค่าเหมาะสม {{rd:fv}}</span>
        <span><i style="background:#ea4335;height:8px;width:8px;border-radius:50%"></i>จุดสำคัญ</span>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:12px;line-height:1.6">
        ${pr(doc.prose.chart)}
      </p>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">3</div><h2>การประเมินมูลค่า (Valuation)</h2><div class="hint">${vh.hint}</div></div>
    <div class="card">
      ${T.valIntro ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.6">${pr(T.valIntro)}</p>\n      ` : ''}${legsHtml}
      <div class="fv-box">
        <div class="l">${vh.box}<br><span style="font-weight:400;font-size:12px;color:var(--muted)">กรอบ {{rd:fvLow}} – {{rd:fvHigh}}</span></div>
        <div class="r">{{rd:fv}}</div>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:12px;line-height:1.6">
        ${pr(doc.prose.valuation)}
      </p>
    </div>
  </section>${extrasHtml(doc, view, 'valuation')}

  <section>
    <div class="s-head"><div class="n">4</div><h2>ราคาปัจจุบัน vs โซนต่างๆ</h2></div>
    <div class="card">
      <div class="gauge">
        <div class="gbar" id="gbar">
          <div class="marker cur" id="mCur"><div class="lab">ปัจจุบัน {{rd:px}}</div></div>
          <div class="marker" id="mFair"><div class="lab" style="background:#067647">เหมาะสม {{rd:fv}}</div></div>
        </div>
        <div class="scale">
          ${scale}
        </div>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:18px;line-height:1.6">
        ${pr(doc.prose.gauge)}
      </p>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">5</div><h2>Margin of Safety (ส่วนเผื่อความปลอดภัย)</h2></div>
    <div class="card">
      <div class="mos-verdict {{rd:mosClass}}">
        <div class="big">{{rd:mos}}</div>
        <div class="txt">${pr(doc.prose.mos)}</div>
      </div>
      <div class="grid g3">
        <div class="metric"><div class="k">จุดซื้อ MOS 20%</div><div class="v pos">{{rd:mos20}}</div><div class="d">โซนน่าสนใจสำหรับ value</div></div>
        <div class="metric"><div class="k">จุดซื้อ MOS 30%</div><div class="v pos">{{rd:mos30}}</div><div class="d">โซนถูกมาก (deep value)</div></div>
        <div class="metric"><div class="k">โซนเริ่มทยอยสะสม</div><div class="v neu">&lt; {{rd:fv}}</div><div class="d">ใกล้/ต่ำกว่ามูลค่าเหมาะสม</div></div>
      </div>
      <div class="calc">
        <label>ลองคำนวณ MOS เอง — ใส่ราคาที่สนใจ (${TH ? 'บาท' : 'USD'})</label>
        <div class="calc-row">
          <input id="pxIn" class="mono" type="number" value="{{rd:pxNum}}" step="${TH ? '0.05' : '0.5'}">
          <div class="calc-out" id="mosOut"></div>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">6</div><h2>คาดการณ์ผลตอบแทน ${s.years} ปี</h2><div class="hint">จากจุดเข้า {{rd:px}}${s.driver === 'eps' ? ' • EPS ฐาน ~{{rd:baseEps}}' : ` • ${drv} ฐาน ~${esc(view.cur + RV.fmtPrice(view.scn[0].driverStart))}`}{{rd:scnNote}}</div></div>
    <div class="scn">
      ${col(0, 'bear', 'Bear')}
      ${col(1, 'base', 'Base')}
      ${col(2, 'bull', 'Bull')}
    </div>
    <p style="font-size:12.5px;color:var(--muted);margin-top:14px;line-height:1.6;padding:0 4px">
      ${pr(s.note)}
    </p>
  </section>${extrasHtml(doc, view, 'scenarios')}

  <section>
    <div class="s-head"><div class="n">7</div><h2>ปัจจัยบวก & ความเสี่ยง</h2></div>
    <div class="cr">
      <div class="box cat">
        <h3><span class="ic">▲</span>Catalysts — ปัจจัยหนุน</h3>
        <ul>
          ${li(doc.catalysts)}
        </ul>
      </div>
      <div class="box risk">
        <h3><span class="ic">▼</span>Risks — ความเสี่ยง</h3>
        <ul>
          ${li(doc.risks)}
        </ul>
      </div>
    </div>
  </section>${extrasHtml(doc, view, 'catalysts')}

  <section>
    <div class="s-head"><div class="n">8</div><h2>สรุปภาพรวม</h2></div>
    <div class="verdict">
      <h2>${pr(doc.prose.verdictHeadline)}</h2>
      <p>${pr(doc.prose.verdictBody)}</p>
      <div class="vgrid">
        <div class="vcell"><div class="k">มูลค่าเหมาะสม</div><div class="v">{{rd:fv}} <span style="font-size:12px;color:#cab9a8">({{rd:fvLow}}–{{rd:fvHigh}})</span></div></div>
        <div class="vcell"><div class="k">ส่วนต่างจากราคา</div><div class="v {{rd:mosClass}}">MOS ~ {{rd:mos}}</div></div>
        ${analystCell}
      </div>
      <div class="zone">
        <b>กลยุทธ์:</b> ${pr(doc.prose.strategy)}
      </div>
    </div>
  </section>

  <div class="disc">
    <b>คำเตือน:</b> รายงานนี้จัดทำเพื่อการศึกษาและเป็นข้อมูลประกอบการตัดสินใจเท่านั้น <b>ไม่ใช่คำแนะนำให้ซื้อหรือขายหลักทรัพย์</b>
    ตัวเลข valuation อิงสมมติฐานที่อาจคลาดเคลื่อน โดยเฉพาะ${T.disclaimerAssump ? pr(T.disclaimerAssump) : ' P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต'}
    ราคาหุ้นมีความผันผวนสูง ผู้ลงทุนควรศึกษาข้อมูลเพิ่มเติมและพิจารณาความเสี่ยงของตนเองก่อนตัดสินใจ • ${pr(doc.prose.disclaimerSources)}
  </div>
  <footer>Stock Analysis Dashboard • ข้อมูล ณ ${esc(view.analysisDateText)} • สร้างด้วย stock-analyzer workflow</footer>

</div>

<!--TEMPLATE:ENGINE-->
</body>
</html>
`;
}

module.exports = { toV2Source, mdesc, jsonScript };
