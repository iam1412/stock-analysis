'use strict';
/**
 * earnings-calendar-test.js — เทส offline ของ tools/earnings-calendar.js (WS6 ข้อ 2)
 * ★ ห้ามยิง network: ทุกเคสฉีด fetchNext/fetchImpl เอง · require จาก test/queue-test.js (ไม่เพิ่มขั้น verify)
 * คืน Promise — queue-test ต้องรอก่อนนับ tally (แบบเดียวกับ Task 4)
 */
module.exports = function earningsCalendarTest(ok) {
  const EC = require('../tools/earnings-calendar.js');

  // ── roll: next ที่ผ่านไปแล้วกลายเป็น last (ไม่มีแหล่งไหนให้ "วันประกาศครั้งล่าสุด" ตรง ๆ จึงสะสมเอง) ──
  ok(EC.roll({ last: null, next: '2026-08-01' }, '2026-11-01', '2026-09-12').last === '2026-08-01', 'roll: next ที่ผ่านไปแล้วกลายเป็น last');
  ok(EC.roll({ last: '2026-05-01', next: '2026-11-01' }, '2026-11-01', '2026-09-12').last === '2026-05-01', 'roll: next ยังไม่ถึง → last คงเดิม');
  ok(EC.roll(null, null, '2026-09-12').last === null && EC.roll(null, null, '2026-09-12').next === null, 'roll: ไม่มีข้อมูล → null ทั้งคู่ (นโยบายอายุอย่างเดียว)');
  ok(EC.roll({ last: '2026-05-01', next: '2026-09-12' }, null, '2026-09-12').last === '2026-09-12', 'roll: next = วันนี้พอดี → นับว่าออกแล้ว');
  ok(EC.roll({ last: '2026-05-01', next: '2026-11-01' }, null, '2026-09-12').next === null, 'roll: รอบนี้ไม่มีวันใหม่ → next = null (ไม่ค้างของเก่า)');

  // ── build ──
  const fetchNext = async (ysym) => ({ 'AAPL': '2026-10-29', 'ADVANC.BK': null })[ysym];
  return EC.build({ symbols: [['AAPL', 'AAPL'], ['ADVANC', 'ADVANC.BK']], prev: { symbols: { AAPL: { last: null, next: '2026-07-30' } } }, today: '2026-09-12', fetchNext, delayMs: 0 })
    .then((c) => {
      ok(c.symbols.AAPL.last === '2026-07-30' && c.symbols.AAPL.next === '2026-10-29', 'build: AAPL roll next เก่าเป็น last + next ใหม่');
      ok(c.symbols.ADVANC.last === null && c.symbols.ADVANC.next === null, 'build: ไม่มีวันที่ → null (ไม่ throw)');
      ok(c.stats.total === 2 && c.stats.dated === 1 && c.stats.nodate === 1 && /^\d{4}-\d{2}-\d{2}/.test(c.updatedAt), 'build: stats + updatedAt');
      ok(c.stats.th.total === 1 && c.stats.th.dated === 0 && c.stats.us.total === 1 && c.stats.us.dated === 1, 'build: แยกสถิติ TH (.BK) / US — ตัวตัดสิน fallback');
      ok(Object.keys(c.symbols).join(' ') === 'AAPL ADVANC', 'build: เรียง symbol ตามที่ป้อน (deterministic — diff รายสัปดาห์อ่านรู้เรื่อง)');

      // ── ★ "ถามไม่ได้" ≠ "ถามแล้วไม่มี" (รีวิว Task 17) — ยิงล้มต้องยก prev.next มาต่อ ไม่ใช่ลบทิ้ง ──
      //   last เกิดได้ทางเดียวคือ next ที่เก็บไว้เดินผ่านวัน ⇒ ถ้ารอบสุดท้ายก่อนวันประกาศล้มแล้วเราล้าง next
      //   วันนั้นหายถาวร + escalation ไม่เคยเกิด (เงียบสนิท) — เคสนี้คือรอบที่สำคัญที่สุดของหุ้นแต่ละตัวพอดี
      const prevF = { symbols: {
        BOOM1: { last: null, next: '2026-09-01' },         // เลยวันแล้ว + ยิงล้ม → ต้องกลายเป็น last
        BOOM2: { last: '2026-05-01', next: '2026-09-20' }, // ยังไม่ถึง + ยิงล้ม → ต้องอุ้ม next ไว้ต่อ
        GONE: { last: null, next: '2026-11-01' },          // ยิงสำเร็จแต่ไม่มีวันที่ = คำตอบจริง → ล้าง next
      } };
      const flaky = async (y) => { if (/^BOOM/.test(y)) throw new Error('quoteSummary HTTP 500'); return null; };
      return EC.build({ symbols: [['BOOM1', 'BOOM1'], ['BOOM2', 'BOOM2'], ['GONE', 'GONE']], prev: prevF, today: '2026-09-12', fetchNext: flaky, delayMs: 0 })
        .then((c) => {
          ok(c.symbols.BOOM1.last === '2026-09-01', 'build: ยิงล้ม + next เก่าเลยวันแล้ว → ยัง roll เป็น last ได้ (ไม่หลุดหาย)');
          ok(c.symbols.BOOM1.next === '2026-09-01', 'build: ยิงล้ม → อุ้ม prev.next ไว้ (ไม่ล้างเป็น null)');
          ok(c.symbols.BOOM2.next === '2026-09-20' && c.symbols.BOOM2.last === '2026-05-01', 'build: ยิงล้ม + next เก่ายังไม่ถึง → อุ้มไว้ทั้ง next และ last เดิม');
          ok(c.symbols.GONE.next === null && c.symbols.GONE.last === null, 'build: ยิงสำเร็จแต่ไม่มีวันที่ = คำตอบจริง → ล้าง next เก่า');
          ok(c.stats.failed === 2 && c.stats.nodate === 1 && c.stats.dated === 0, 'build: ยิงล้มนับใน failed เท่านั้น ไม่ปนกับ nodate (ไม่เจือจางตัวเลขที่ใช้ตัดสิน fallback)');
          ok(c.stats.total === c.stats.dated + c.stats.nodate + c.stats.failed, 'build: total = dated + nodate + failed');
          ok(c.stats.th.failed === 0 && c.stats.us.failed === 2, 'build: failed แยก TH/US ด้วย');
          // เกณฑ์ fallback = nodate / (total − failed) — ตัวหารไม่รวมตัวที่ถามไม่ได้
          ok(EC.nodateRatio(c.stats) === 1, 'nodateRatio: 1 nodate จาก 1 ตัวที่ถามสำเร็จ = 100% (ตัวที่ล้มไม่อยู่ในตัวหาร)');
          ok(EC.nodateRatio({ total: 908, nodate: 189, failed: 0 }).toFixed(4) === '0.2081', 'nodateRatio: ตรงกับตัวเลขรอบจริง 189/908');
          ok(EC.nodateRatio({ total: 5, nodate: 0, failed: 5 }) === 1, 'nodateRatio: ถามไม่ได้ทั้งหมด (ตัวหาร 0) → 1 = ไม่ผ่าน ไม่ใช่ 0');
        });
    })
    .then(() => {
      // build: ยิงล้มติดกันเกิน ABORT_AFTER = หยุดทั้งรอบ (session ตาย/โดนบล็อก — ไม่ไล่ให้ครบ 908 ตัวด้วย backoff)
      let calls = 0;
      const boom = async () => { calls++; throw new Error('quoteSummary HTTP 401'); };
      const syms = Array.from({ length: 40 }, (_, i) => ['S' + i, 'S' + i]);
      return EC.build({ symbols: syms, prev: null, today: '2026-09-12', fetchNext: boom, delayMs: 0 })
        .then(() => ok(false, 'build: ล้มติดกัน → ต้อง throw'))
        .catch((e) => {
          ok(/ติดกัน/.test(e.message), 'build: ล้มติดกันเกินเกณฑ์ → throw (ไม่ไล่จนครบ)', e.message);
          ok(calls <= EC.ABORT_AFTER + 1, `build: หยุดที่ ~${EC.ABORT_AFTER} call (ยิงจริง ${calls})`);
        });
    })
    .then(() => {
      // ── parser ของ quoteSummary ──
      const mk = (j, status) => async () => ({ ok: status == null || status < 400, status: status || 200, json: async () => j });
      const j = { quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ raw: 1793318400, fmt: '2026-10-29' }] } } }] } };
      const sess = { cookie: 'c', crumb: 'x' };
      return EC.fetchNextEarnings('AAPL', sess, mk(j)).then((d) => {
        // ★ raw 1793318400 = เที่ยงคืน UTC ของ 30 ต.ค. แต่ fmt (เวลาตลาด) = 29 ต.ค. ⇒ ต้องเชื่อ fmt ก่อน
        ok(d === '2026-10-29', 'fetchNextEarnings: อ่าน earningsDate[0] → ISO (fmt ชนะ raw ที่เป็น UTC midnight)', String(d));
        const jRawOnly = { quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ raw: 1793318400 }] } } }] } };
        return EC.fetchNextEarnings('AAPL', sess, mk(jRawOnly));
      }).then((d) => {
        ok(d === '2026-10-30', 'fetchNextEarnings: ไม่มี fmt → ถอยไปใช้ raw (UTC)', String(d));
        const jEmpty = { quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [] } } }] } };
        return EC.fetchNextEarnings('ADVANC.BK', sess, mk(jEmpty));
      }).then((d) => {
        ok(d === null, 'fetchNextEarnings: earningsDate ว่าง → null');
        return EC.fetchNextEarnings('NOPE', sess, mk({ quoteSummary: { result: null } }, 404));
      }).then((d) => {
        ok(d === null, 'fetchNextEarnings: HTTP 404 (ไม่รู้จัก ticker) → null ไม่ throw (ไม่ retry เปล่า ๆ)');
        let threw = null;
        return EC.fetchNextEarnings('AAPL', sess, mk({}, 401)).catch((e) => { threw = e.message; })
          .then(() => ok(/401/.test(threw || ''), 'fetchNextEarnings: HTTP 401 (crumb ตาย) → throw ให้ withRetry ลองใหม่', String(threw)));
      });
    })
    .then(() => {
      // ── load: ไม่มีไฟล์ = { symbols: {} } (นโยบายอายุอย่างเดียว ไม่ throw) ──
      const cal = EC.load('/ไม่มีไฟล์นี้/earnings-calendar.json');
      ok(cal && cal.symbols && Object.keys(cal.symbols).length === 0, 'load: ไม่มีไฟล์ → { symbols: {} }');
      ok(typeof EC.FILE === 'string' && /earnings-calendar\.json$/.test(EC.FILE), 'FILE: ชี้ earnings-calendar.json ที่ราก');
    });
};
