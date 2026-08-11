/* MOCKUP C — inject: ถอดอีโมจิ + sticky section nav (แบบชิปสีแบรนด์) */
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
  st.textContent = '#secnav{position:sticky;top:0;z-index:80;background:color-mix(in srgb,var(--blue) 6%,rgba(255,255,255,.9));' +
    'backdrop-filter:blur(14px);margin:14px -18px 0;padding:9px 18px;border-bottom:1px solid var(--line)}' +
    '#secnav .sn-in{max-width:1120px;margin:0 auto;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}' +
    '#secnav .sn-in::-webkit-scrollbar{display:none}' +
    '#secnav a{display:flex;align-items:center;gap:7px;white-space:nowrap;padding:7px 14px;text-decoration:none;' +
    "font-family:'Kanit',sans-serif;font-size:12.5px;font-weight:400;border-radius:99px;" +
    'color:var(--muted);border:1px solid transparent;transition:all .14s ease}' +
    "#secnav a b{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:10.5px;opacity:.6}" +
    '#secnav a:hover{background:var(--card);border-color:var(--line);color:var(--ink)}' +
    '#secnav a.on{background:var(--blue);color:#fff;font-weight:500;border-color:var(--blue);' +
    'box-shadow:0 3px 10px color-mix(in srgb,var(--blue) 38%,transparent)}' +
    '#secnav a.on b{opacity:.85}' +
    'section{scroll-margin-top:62px}' +
    '@media(max-width:820px){#secnav a{padding:11px 14px;font-size:12px;min-height:44px}}';
  document.head.appendChild(st);

  var links = [].slice.call(nav.querySelectorAll('a'));
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = secs.indexOf(e.target);
      links.forEach(function (a, j) { a.classList.toggle('on', i === j); });
    });
  }, { rootMargin: '-62px 0px -72% 0px' });
  secs.forEach(function (s) { io.observe(s); });

  var hdr = document.querySelector('.wrap > header');
  if (hdr) hdr.insertAdjacentElement('afterend', nav);
})();
