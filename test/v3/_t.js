'use strict';
// assert counter แบบเดียวกับ test/report-values-test.js — หนึ่ง instance ต่อไฟล์ test
module.exports = function makeT(name) {
  let n = 0, fails = 0;
  const t = (c, m) => { n++; if (!c) { fails++; console.error('✗ [' + name + '] ' + m); } };
  t.eq = (a, b, m) => t(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  t.near = (a, b, tol, m) => t(typeof a === 'number' && Math.abs(a - b) <= tol, `${m}: got ${a} want ${b}±${tol}`);
  t.throws = (fn, re, m) => {
    try { fn(); t(false, m + ': did not throw'); }
    catch (e) { t(re.test(e.message), `${m}: wrong error "${e.message}"`); }
  };
  t.done = () => { console.log(`${fails ? '✗' : '✓'} ${name}: ${n - fails}/${n}`); if (fails) process.exitCode = 1; };
  return t;
};
