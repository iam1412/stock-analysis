/* MOCKUP B — inject: ถอดอีโมจิ + sticky section nav (สไตล์หนังสือพิมพ์) */
(function () {
  'use strict';

  var EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu;
  document.querySelectorAll('.scn .top span:first-child, .calc label, .zone, .disc b, .cr h3').forEach(function (el) {
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 3) n.nodeValue = n.nodeValue.replace(EMOJI, '').replace(/^\s+/, ' ');
    });
  });
  document.querySelectorAll('.scn .top span:first-child').forEach(function (s) { s.textContent = s.textContent.trim(); });

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

  var st = document.createElement('style');
  st.textContent = '#secnav{position:sticky;top:0;z-index:80;background:rgba(246,243,236,.94);' +
    'backdrop-filter:blur(10px);border-bottom:1px solid var(--line-2);margin:0 -26px;padding:0 26px}' +
    '#secnav .sn-in{max-width:940px;margin:0 auto;display:flex;gap:0;overflow-x:auto;scrollbar-width:none}' +
    '#secnav .sn-in::-webkit-scrollbar{display:none}' +
    '#secnav a{display:flex;align-items:baseline;gap:7px;white-space:nowrap;padding:13px 15px;text-decoration:none;' +
    "font-family:'Sarabun',sans-serif;font-size:12.5px;font-weight:400;" +
    'color:var(--muted);border-bottom:2px solid transparent;transition:color .12s,border-color .12s}' +
    "#secnav a b{font-family:'Noto Serif Thai',serif;font-weight:600;font-size:12px;opacity:.5}" +
    '#secnav a:hover{color:var(--ink)}' +
    '#secnav a.on{color:var(--ink);border-bottom-color:var(--rule);font-weight:600}' +
    '#secnav a.on b{opacity:1;color:var(--blue-d)}' +
    'section{scroll-margin-top:56px}' +
    '@media(max-width:820px){#secnav{margin:0 -18px;padding:0 18px}#secnav a{padding:12px 11px;font-size:12px}}';
  document.head.appendChild(st);

  var links = [].slice.call(nav.querySelectorAll('a'));
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = secs.indexOf(e.target);
      links.forEach(function (a, j) { a.classList.toggle('on', i === j); });
    });
  }, { rootMargin: '-56px 0px -72% 0px' });
  secs.forEach(function (s) { io.observe(s); });

  var hdr = document.querySelector('.wrap > header');
  if (hdr) hdr.insertAdjacentElement('afterend', nav);
})();
