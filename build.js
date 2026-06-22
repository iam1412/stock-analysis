#!/usr/bin/env node
/**
 * build.js — สร้างหน้าเว็บ static สำหรับ Cloudflare Workers (Static Assets)
 *
 * โครงสร้างต้นฉบับ:
 *   reports/<SYMBOL>.html   ← วางไฟล์รายงานหุ้นแต่ละตัวไว้ในโฟลเดอร์นี้
 *
 * ทำงาน:
 *   1. สแกนไฟล์รายงานทั้งหมดใน reports/
 *   2. ดึง metadata (title / ชื่อบริษัท) จากแต่ละไฟล์
 *   3. ติดตามวันที่อัปเดตผ่าน reports.json (ถ้าเนื้อหาไฟล์เปลี่ยน → ประทับเวลาใหม่)
 *   4. สร้างหน้า index.html (เรียงหุ้นที่อัปเดตล่าสุดขึ้นก่อน) + reports.json (manifest)
 *   5. คัดลอกรายงานแบบ flatten ลง dist/ → เข้าถึงที่ /<SYMBOL>.html และ /<SYMBOL>
 *
 * รันด้วย:  node build.js   (หรือ npm run build)  — ไม่ต้องติดตั้ง dependency ใด ๆ
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const REPORTS_DIR = path.join(ROOT, 'reports');
const OUT = path.join(ROOT, 'dist');
const MANIFEST = path.join(ROOT, 'reports.json'); // committed — เก็บ hash/วันที่อัปเดตของแต่ละรายงาน

const CONTACT_EMAIL = 'somchai.s@de.co.th';
const ASSET_DIRS = new Set(['assets', 'public', 'static', 'img', 'images', 'css', 'js', 'fonts']);

const log = (...a) => console.log('[build]', ...a);
const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;'); // ปลอดภัยสำหรับใส่ใน attribute
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

function extractMeta(html, symbol) {
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = stripTags(titleM && titleM[1]) || symbol;
  const name = stripTags(h1M && h1M[1]) || title;
  return { title, name };
}

// แทรกแถบติดต่อ + ลิงก์กลับหน้ารวม + ตัวนับยอดวิว + ปุ่ม Like/Dislike ในแต่ละหน้ารายงาน
// ถ้ามี <footer> เดิมอยู่แล้ว → ต่อท้ายเข้าไปข้างใน (ขึ้นบรรทัดใหม่) ไม่สร้าง footer ซ้อน
function injectContactFooter(html) {
  const views = `<span class="views" id="viewCount" hidden> · 👁 <b id="viewNum">0</b> ครั้ง</span>`;
  const vote =
    `<span class="votebar" id="voteBar" hidden> · ` +
    `<button class="vbtn" id="likeBtn" type="button">👍 <b id="likeNum">0</b></button> ` +
    `<button class="vbtn" id="dislikeBtn" type="button">👎 <b id="dislikeNum">0</b></button></span>`;
  const link =
    `<a href="/" style="color:#1a73e8;text-decoration:none">← ดูรายงานทั้งหมด</a> · ` +
    `ติดต่อ <a href="mailto:${CONTACT_EMAIL}" style="color:#1a73e8;text-decoration:none">${CONTACT_EMAIL}</a>${views}${vote}`;

  const fi = html.toLowerCase().lastIndexOf('</footer>');
  if (fi !== -1) {
    return html.slice(0, fi) + `<br>${link}` + html.slice(fi); // ต่อท้ายใน <footer> เดิม
  }
  // ไม่มี footer เดิม → ใส่ footer ใหม่ก่อน </body>
  const bar =
    `\n<footer style="max-width:1080px;margin:0 auto;padding:14px 16px 40px;text-align:center;` +
    `font-family:'Sarabun',system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:#5f6675">${link}</footer>\n`;
  const bi = html.toLowerCase().lastIndexOf('</body>');
  return bi === -1 ? html + bar : html.slice(0, bi) + bar + html.slice(bi);
}

// แทรก <style> ของปุ่มโหวตเข้าไปใน <head>
function injectVoteStyle(html) {
  const style =
    `\n<style>.votebar .vbtn{font:inherit;cursor:pointer;border:1px solid #d7dbe2;background:#fff;` +
    `border-radius:8px;padding:1px 8px;margin-left:4px;color:#5f6675;line-height:1.9}` +
    `.votebar .vbtn:hover{border-color:#1a73e8;color:#1a73e8}` +
    `.votebar .vbtn.on{border-color:#1a73e8;background:#e8f0fe;color:#1557b0;font-weight:600}</style>\n`;
  const hi = html.toLowerCase().lastIndexOf('</head>');
  return hi === -1 ? style + html : html.slice(0, hi) + style + html.slice(hi);
}

// แทรกสคริปต์ นับยอดวิว + จัดการ Like/Dislike (inline, same-origin) ก่อน </body> — ฝัง symbol ตอน build
// view: POST ครั้งแรกของ session แล้ว GET ครั้งถัด ๆ (กันนับซ้ำด้วย sessionStorage)
// vote: เก็บสถานะโหวตของผู้ใช้ใน localStorage แล้วส่ง from→to ให้ server คำนวณ delta (∈ -1..1) เอง (กันยิงเลขมั่ว)
function injectViewVoteScript(html, symbol) {
  const S = JSON.stringify(symbol);
  const script =
    `\n<script>(function(){` +
    `function gid(i){return document.getElementById(i)}` +
    `var S=${S},vk="vc:"+S,lk="vote:"+S;` +
    `var num=gid("viewNum"),box=gid("viewCount"),bar=gid("voteBar");` +
    `var lb=gid("likeBtn"),db=gid("dislikeBtn"),ln=gid("likeNum"),dn=gid("dislikeNum");` +
    `function getVote(){try{return localStorage.getItem(lk)}catch(e){return null}}` +
    `function setVote(v){try{v?localStorage.setItem(lk,v):localStorage.removeItem(lk)}catch(e){}}` +
    `var vote=getVote();` +
    `function hi(){if(lb)lb.className="vbtn"+(vote==="like"?" on":"");if(db)db.className="vbtn"+(vote==="dislike"?" on":"")}` +
    `function fill(d){if(!d)return;` +
    `if(typeof d.count==="number"&&num){num.textContent=d.count.toLocaleString();if(box)box.hidden=false;}` +
    `if(typeof d.likes==="number"&&ln)ln.textContent=d.likes.toLocaleString();` +
    `if(typeof d.dislikes==="number"&&dn)dn.textContent=d.dislikes.toLocaleString();` +
    `if(bar)bar.hidden=false;hi();}` +
    `var seen=null;try{seen=sessionStorage.getItem(vk)}catch(e){}` +
    `fetch("/api/views/"+encodeURIComponent(S),{method:seen?"GET":"POST"})` +
    `.then(function(r){return r.json()}).then(function(d){fill(d);try{sessionStorage.setItem(vk,"1")}catch(e){}}).catch(function(){});` +
    `var busy=false;function send(to){if(busy)return;busy=true;var from=vote||"none";` +
    `fetch("/api/vote/"+encodeURIComponent(S)+"?from="+from+"&to="+to,{method:"POST"})` +
    `.then(function(r){return r.json()}).then(function(d){vote=(to==="none")?null:to;setVote(vote);fill(d);})` +
    `.catch(function(){}).then(function(){busy=false;});}` +
    `if(lb)lb.addEventListener("click",function(){send(vote==="like"?"none":"like")});` +
    `if(db)db.addEventListener("click",function(){send(vote==="dislike"?"none":"dislike")});` +
    `})();</script>\n`;
  const bi = html.toLowerCase().lastIndexOf('</body>');
  return bi === -1 ? html + script : html.slice(0, bi) + script + html.slice(bi);
}

// ตกแต่งไฟล์รายงานก่อนเขียนลง dist: footer ติดต่อ + ตัวนับยอดวิว + ปุ่ม Like/Dislike
function decorateReport(html, symbol) {
  return injectViewVoteScript(injectVoteStyle(injectContactFooter(html)), symbol);
}

// ---- 1) เตรียมโฟลเดอร์ dist ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---- 2) โหลด manifest เดิม (เพื่อรักษาวันที่อัปเดตของไฟล์ที่ไม่เปลี่ยน) ----
const prev = {};
if (fs.existsSync(MANIFEST)) {
  try {
    for (const r of JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))) prev[r.symbol] = r;
  } catch {
    log('⚠️  อ่าน reports.json เดิมไม่ได้ — สร้างใหม่');
  }
}
const nowISO = new Date().toISOString();

// ---- 3) อ่านรายงานจาก reports/ → flatten ลง dist/ ----
const reports = [];
if (fs.existsSync(REPORTS_DIR)) {
  for (const entry of fs.readdirSync(REPORTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.html$/i.test(entry.name)) continue;

    const src = path.join(REPORTS_DIR, entry.name);
    const content = fs.readFileSync(src, 'utf8');
    const symbol = entry.name.replace(/\.html$/i, '');
    const h = hash(content);
    const old = prev[symbol];
    const updated = old && old.hash === h && old.updated ? old.updated : nowISO; // เปลี่ยน → ประทับเวลาใหม่

    reports.push({ symbol, file: entry.name, ...extractMeta(content, symbol), updated, hash: h });
    fs.writeFileSync(path.join(OUT, entry.name), decorateReport(content, symbol)); // hash อิงต้นฉบับ, footer+ตัวนับใส่เฉพาะใน dist
    log('report:', entry.name, updated === nowISO ? '(updated)' : '');
  }
} else {
  log('⚠️  ไม่พบโฟลเดอร์ reports/ — สร้างแล้ววางไฟล์ <SYMBOL>.html ไว้ในนั้น');
}

// เรียงตามวันที่อัปเดตล่าสุดก่อน, เสมอกันเรียงตามชื่อย่อ
reports.sort((a, b) =>
  a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.symbol.localeCompare(b.symbol)
);

// ---- 4) เขียน manifest ----
// ตัวที่ root (committed): มี hash ไว้ตรวจการเปลี่ยนแปลงรอบหน้า
fs.writeFileSync(
  MANIFEST,
  JSON.stringify(reports.map(({ symbol, file, name, title, updated, hash }) => ({ symbol, file, name, title, updated, hash })), null, 2) + '\n'
);
// ตัว public ใน dist (เสิร์ฟที่ /reports.json) — ไม่ใส่ hash, เพิ่ม url
fs.writeFileSync(
  path.join(OUT, 'reports.json'),
  JSON.stringify(reports.map(({ symbol, file, name, title, updated }) => ({ symbol, file, name, title, updated, url: '/' + file })), null, 2) + '\n'
);

// ---- 5) คัดลอก assets + ไฟล์พิเศษของ Cloudflare ----
for (const nm of fs.readdirSync(ROOT)) {
  const p = path.join(ROOT, nm);
  if (ASSET_DIRS.has(nm.toLowerCase()) && fs.statSync(p).isDirectory()) {
    fs.cpSync(p, path.join(OUT, nm), { recursive: true });
    log('assets:', nm + '/');
  }
}
for (const special of ['_headers', '_redirects']) {
  const src = path.join(ROOT, special);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(OUT, special));
    log('special:', special);
  }
}

if (reports.length === 0) log('⚠️  ไม่มีรายงานให้ build');

// ---- 6) สร้างการ์ดรายงาน ----
const fmtDate = (iso) => (iso || '').slice(0, 10); // YYYY-MM-DD (ชัดเจน ไม่สับสนปี พ.ศ./ค.ศ.)

const cards = reports.map((r) => `
      <a class="card" data-search="${escAttr((r.symbol + ' ' + r.name + ' ' + r.title).toLowerCase())}" href="./${encodeURIComponent(r.file)}">
        <div class="badge">${esc(r.symbol)}</div>
        <div class="cname">${esc(r.name)}</div>
        <div class="ctitle">${esc(r.title)}</div>
        <div class="cmeta"><span class="go">เปิดรายงาน →</span><span class="cviews" data-sym="${escAttr(r.symbol)}" hidden>👁 <b class="v">0</b> · 👍 <b class="l">0</b></span><span class="cdate">${fmtDate(r.updated)}</span></div>
      </a>`).join('\n');

// ช่องค้นหา + ข้อความ "ไม่พบ" + สคริปต์กรอง (เฉพาะเมื่อมีรายงาน)
const searchBox = reports.length ? `
    <div class="search">
      <input id="q" type="search" placeholder="ค้นหาหุ้น… ชื่อย่อ หรือ ชื่อบริษัท" autocomplete="off" spellcheck="false" aria-label="ค้นหาหุ้น">
    </div>` : '';

const noResult = reports.length ? `
    <div class="noresult" id="noresult" hidden>ไม่พบหุ้นที่ตรงกับ “<span id="qterm"></span>”</div>` : '';

// สคริปต์หน้า index: ค้นหา + แบ่งหน้า (PAGE ตัว/หน้า) + เติมยอดวิวต่อการ์ด (batch ครั้งเดียว)
const PAGE_SIZE = 12; // จำนวนหุ้นต่อหน้า — ปรับที่นี่จุดเดียว
const searchScript = reports.length ? `
  <script>
    (function () {
      var PAGE = ${PAGE_SIZE};
      var q = document.getElementById('q');
      var cards = [].slice.call(document.querySelectorAll('.card'));
      var nr = document.getElementById('noresult');
      var term = document.getElementById('qterm');
      var pager = document.getElementById('pager');
      var page = 1, filtered = cards;

      function pages() { return Math.max(1, Math.ceil(filtered.length / PAGE)); }
      function render() {
        var tp = pages(); if (page > tp) page = tp;
        cards.forEach(function (c) { c.style.display = 'none'; });
        filtered.slice((page - 1) * PAGE, page * PAGE).forEach(function (c) { c.style.display = ''; });
        nr.hidden = !(q.value.trim() && filtered.length === 0);
        term.textContent = q.value;
        drawPager(tp);
      }
      function drawPager(tp) {
        if (tp <= 1) { pager.innerHTML = ''; return; }
        var h = '<button class="pg" data-go="prev"' + (page <= 1 ? ' disabled' : '') + '>\\u2039</button>';
        for (var i = 1; i <= tp; i++) h += '<button class="pg' + (i === page ? ' on' : '') + '" data-go="' + i + '">' + i + '</button>';
        h += '<button class="pg" data-go="next"' + (page >= tp ? ' disabled' : '') + '>\\u203a</button>';
        pager.innerHTML = h;
      }
      pager.addEventListener('click', function (e) {
        var b = e.target.closest('[data-go]'); if (!b) return;
        var g = b.getAttribute('data-go'), tp = pages();
        page = g === 'prev' ? Math.max(1, page - 1) : g === 'next' ? Math.min(tp, page + 1) : parseInt(g, 10);
        render(); window.scrollTo(0, 0);
      });
      q.addEventListener('input', function () {
        var v = q.value.toLowerCase().trim();
        filtered = v ? cards.filter(function (c) { return c.getAttribute('data-search').indexOf(v) !== -1; }) : cards;
        page = 1; render();
      });

      // โหลดยอดวิว + likes ทั้งหมดครั้งเดียว (read-only ไม่นับเพิ่ม) แล้วเติมลงการ์ด
      fetch('/api/views').then(function (r) { return r.json(); }).then(function (map) {
        [].slice.call(document.querySelectorAll('.cviews')).forEach(function (s) {
          var e = (map && map[s.getAttribute('data-sym')]) || {};
          var v = s.querySelector('.v'), l = s.querySelector('.l');
          if (v) v.textContent = (e.c || 0).toLocaleString();
          if (l) l.textContent = (e.l || 0).toLocaleString();
          s.hidden = false;
        });
      }).catch(function () {});

      render();
    })();
  </script>` : '';

// แถบเลขหน้า (เฉพาะเมื่อมีรายงาน) — สคริปต์ด้านบนเติมปุ่มให้
const pagerEl = reports.length ? `\n    <div class="pager" id="pager"></div>` : '';

const emptyState = `
      <div class="empty">
        <p>ยังไม่มีรายงานในโฟลเดอร์นี้</p>
        <p class="hint">เพิ่มไฟล์ <code>reports/&lt;SYMBOL&gt;.html</code> แล้ว build ใหม่</p>
      </div>`;

// ---- 7) เขียน index.html ----
const indexHtml = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stock Analysis — รวมรายงานวิเคราะห์หุ้น</title>
<meta name="description" content="รวมรายงานวิเคราะห์หุ้น (Fair Value, Margin of Safety, จุดเข้าซื้อ)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#eef1f5; --card:#fff; --ink:#1a1d23; --muted:#5f6675; --line:#e4e8ee;
    --blue:#1a73e8; --blue-d:#1557b0;
    --shadow:0 1px 3px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.06);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Sarabun','Noto Sans Thai',system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
  .mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
  .wrap{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
  header{background:linear-gradient(135deg,#202938 0%,#2c3a52 60%,#1557b0 140%);border-radius:20px;padding:32px 28px;color:#fff;position:relative;overflow:hidden;box-shadow:var(--shadow)}
  header::after{content:"";position:absolute;right:-40px;top:-40px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(66,133,244,.35),transparent 70%)}
  .tag{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,.14);margin-bottom:12px}
  h1{font-size:30px;font-weight:800;letter-spacing:-.5px}
  .sub{color:#c7d2e4;font-size:14.5px;margin-top:4px}
  .search{margin-top:18px}
  .search input{width:100%;font-family:inherit;font-size:15px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;box-shadow:var(--shadow);outline:none;-webkit-appearance:none}
  .search input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(26,115,232,.15)}
  .search input::placeholder{color:var(--muted)}
  .noresult{text-align:center;color:var(--muted);padding:32px;font-size:14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:24px}
  .card{display:flex;flex-direction:column;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;text-decoration:none;color:inherit;box-shadow:var(--shadow);transition:transform .15s ease,box-shadow .15s ease}
  .card:hover{transform:translateY(-3px);box-shadow:0 4px 12px rgba(16,24,40,.10),0 14px 32px rgba(16,24,40,.10)}
  .badge{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:13px;color:var(--blue-d);background:#e8f0fe;align-self:flex-start;padding:3px 10px;border-radius:8px}
  .cname{font-size:18px;font-weight:700;margin-top:6px}
  .ctitle{font-size:13px;color:var(--muted);flex:1}
  .cmeta{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
  .go{font-size:13.5px;font-weight:600;color:var(--blue)}
  .cdate{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--muted)}
  .cviews{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--muted)}
  .cviews b{font-weight:600;color:var(--ink)}
  .empty{grid-column:1/-1;text-align:center;padding:48px;background:var(--card);border:1px dashed var(--line);border-radius:16px;color:var(--muted)}
  .empty .hint{font-size:13px;margin-top:6px}
  .empty code{font-family:'IBM Plex Mono',monospace;background:#eef1f5;padding:2px 6px;border-radius:6px}
  .pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:28px}
  .pg{font-family:inherit;font-size:13px;min-width:34px;height:34px;padding:0 9px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;cursor:pointer;box-shadow:var(--shadow)}
  .pg.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600}
  .pg:disabled{opacity:.4;cursor:default}
  .pg:hover:not(:disabled):not(.on){border-color:var(--blue);color:var(--blue)}
  footer{margin-top:32px;text-align:center;color:var(--muted);font-size:12.5px}
  footer a{color:var(--blue);text-decoration:none}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="tag">📊 Stock Analysis</span>
      <h1>รายงานวิเคราะห์หุ้น</h1>
      <div class="sub">Fair Value · Margin of Safety · จุดเข้าซื้อ · ผลตอบแทนคาดการณ์ — รวม ${reports.length} รายงาน</div>
    </header>${searchBox}
    <div class="grid">
${reports.length ? cards : emptyState}
    </div>${noResult}${pagerEl}
    <footer>
      อัปเดตล่าสุด ${fmtDate(nowISO)} · สร้างด้วย build.js · ติดต่อ <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br>
      ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน
    </footer>
  </div>${searchScript}
</body>
</html>
`;

fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml, 'utf8');
log(`✅ สร้าง dist/ เสร็จ — ${reports.length} รายงาน + index.html + reports.json`);
