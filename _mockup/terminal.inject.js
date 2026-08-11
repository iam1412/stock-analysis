/* MOCKUP A — inject: สิ่งที่ CSS ล้วนทำไม่ได้
   1) ถอดอีโมจิ (ตัวบอก "AI template" ที่ดังที่สุด) → แทนด้วยป้าย mono
   2) sticky section nav — แก้ปัญหา "หน้ายาว 4,400px หาข้อมูลไม่เจอ"
   รันหลัง engine วาดเสร็จ (script อยู่ท้าย body) จึงย้าย DOM ได้ปลอดภัย */
(function () {
  'use strict';

  // ── 1. ถอดอีโมจิออกจาก label ที่ engine ไม่ได้ใช้อ่านค่า ──
  var EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu;
  document.querySelectorAll('.scn .top span:first-child, .calc label, .zone, .disc b, .cr h3').forEach(function (el) {
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 3) n.nodeValue = n.nodeValue.replace(EMOJI, '').replace(/^\s+/, ' ');
    });
  });
  // ป้ายฉาก: 🐻 Bear → [ BEAR ]
  document.querySelectorAll('.scn .col').forEach(function (col) {
    var s = col.querySelector('.top span:first-child');
    if (s) s.textContent = s.textContent.trim();
  });

  // ── 2. sticky nav จากหัวข้อ section จริง ──
  var secs = [].slice.call(document.querySelectorAll('section'));
  if (!secs.length) return;
  var nav = document.createElement('nav');
  nav.id = 'secnav';
  nav.innerHTML = '<div class="sn-in">' + secs.map(function (s, i) {
    s.id = 'sec' + i;
    var h = s.querySelector('.s-head h2');
    return '<a href="#sec' + i + '" data-i="' + i + '"><b>' + (i + 1) + '</b>' +
      (h ? h.textContent.replace(/\s*\(.*?\)\s*/g, '').trim() : '') + '</a>';
  }).join('') + '</div>';
  document.body.appendChild(nav);

  var st = document.createElement('style');
  st.textContent = '#secnav{position:sticky;top:0;z-index:80;background:rgba(11,14,19,.92);' +
    'backdrop-filter:blur(12px);border-bottom:1px solid var(--line);margin:0 -18px 0;padding:0 18px}' +
    '#secnav .sn-in{max-width:1180px;margin:0 auto;display:flex;gap:2px;overflow-x:auto;scrollbar-width:none}' +
    '#secnav .sn-in::-webkit-scrollbar{display:none}' +
    '#secnav a{display:flex;align-items:center;gap:7px;white-space:nowrap;padding:12px 13px;text-decoration:none;' +
    "font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;" +
    'color:var(--muted);border-bottom:2px solid transparent;transition:color .12s,border-color .12s}' +
    '#secnav a b{font-weight:600;opacity:.55}' +
    '#secnav a:hover{color:var(--ink-2)}' +
    '#secnav a.on{color:var(--blue);border-bottom-color:var(--blue)}' +
    '#secnav a.on b{opacity:1}' +
    'section{scroll-margin-top:52px}' +
    '@media(max-width:820px){#secnav a{padding:11px 10px;font-size:10px}}';
  document.head.appendChild(st);

  // ── highlight section ที่กำลังอ่าน ──
  var links = [].slice.call(nav.querySelectorAll('a'));
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = secs.indexOf(e.target);
      links.forEach(function (a, j) { a.classList.toggle('on', i === j); });
    });
  }, { rootMargin: '-52px 0px -72% 0px' });
  secs.forEach(function (s) { io.observe(s); });

  // ต้องอยู่ใน flow ถัดจาก header ถึงจะ sticky ได้ (position:fixed จะทับเนื้อหา)
  var hdr = document.querySelector('.wrap > header');
  if (hdr) hdr.insertAdjacentElement('afterend', nav);
})();
