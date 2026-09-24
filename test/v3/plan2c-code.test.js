'use strict';
// Plan 2c-i Task 1 — small code: ship --no-push · prep NEW extraBlock · fetch-facts/pick-brand/themeOf wording
// ★ offline · temp dirs only · never touches reports/ .queue/ tags.json seeds.json
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const t = require('./_t.js')('plan2c-code');
const ROOT = path.join(__dirname, '..', '..');

// (1) prep NEW extraBlock — through the existing child harness (QUEUE_DIR injected; run/medianBlock faked)
{ const child = path.join(__dirname, '_prep-child.js');
  const q = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-2c-prep-'));
  const r = cp.spawnSync(process.execPath, [child, 'ok'], { encoding: 'utf8', env: { ...process.env, QUEUE_DIR: q } });
  const md = fs.readFileSync(path.join(q, 'prep', 'ZZZQ.md'), 'utf8');
  t(r.status === 0, `prep NEW ok (exit ${r.status}) ${r.stderr.slice(-200)}`);
  t(/★ ใบ NEW เขียนเป็น v3 — ทำตาม SKILL STEP 5V/.test(md), 'prep NEW .md carries the STEP 5V pointer line');
  t(!/update-prices\.js --write --force/.test(md), 'prep NEW .md has no update-prices --write --force hint');
  t(/\.queue\/prep\/ZZZQ\.json/.test(md), 'prep NEW .md names the sidecar path');
  fs.rmSync(q, { recursive: true, force: true }); }
{ const child = path.join(__dirname, '_prep-child.js');
  const q = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-2c-prep-'));
  const r = cp.spawnSync(process.execPath, [child, 'fail-run'], { encoding: 'utf8', env: { ...process.env, QUEUE_DIR: q } });
  const md = fs.readFileSync(path.join(q, 'prep', 'ZZZQ.md'), 'utf8');
  t(r.status === 0 && !/★ ใบ NEW เขียนเป็น v3/.test(md), 'prep NEW without a sidecar → no 5V pointer (init would refuse)');
  t(!/update-prices\.js --write --force/.test(md), 'prep NEW (degraded) still has no update-prices hint');
  fs.rmSync(q, { recursive: true, force: true }); }

// (2) ship --no-push — pure helper: the decision is a function of options, not of git state
{ const SH = require('../../tools/queue/ship.js');
  t(typeof SH.shouldPush === 'function', 'ship.js exports shouldPush(o)');
  t(SH.shouldPush({}) === true && SH.shouldPush({ noPush: false }) === true, 'shouldPush default = true (v2 behaviour unchanged)');
  t(SH.shouldPush({ noPush: true }) === false, 'shouldPush({noPush:true}) = false'); }
{ const src = fs.readFileSync(path.join(ROOT, 'tools', 'queue.js'), 'utf8');
  t(/--no-push/.test(src) && /noPush/.test(src), 'queue.js parses --no-push into noPush');
  // ★ match the ACTUAL usage token of `ship` in tools/queue.js (read the file first — it may be `ship <SYM>` or `ship <SYMBOL>`); adjust this regex to it
  t(/ship <SYM(?:BOL)?>[^\n]*--no-push/.test(src), 'queue.js usage line documents --no-push'); }

// (3) fetch-facts text-mode wording — no longer tells a worker to paste into report-data
{ const src = fs.readFileSync(path.join(ROOT, 'tools', 'fetch-facts.js'), 'utf8');
  t(!/chart \(วางใน report-data/.test(src), 'fetch-facts: "chart (วางใน report-data" wording removed');
  t(/v3/.test(src) && /report\.js save|sidecar/.test(src), 'fetch-facts: chart line names the v3 path'); }

// (4) pick-brand stdout — v3 note present, v2 copy block kept
{ const src = fs.readFileSync(path.join(ROOT, 'tools', 'pick-brand.js'), 'utf8');
  t(/ใบ v3: ไม่ต้อง copy/.test(src), 'pick-brand: v3 note line present');
  t(/GDOTS/.test(src), 'pick-brand: v2 GDOTS copy block kept'); }

// (5) themeOf message — no "หรือ themeLegacy" on the NEW path
{ const C = require('../../tools/v3/compute.js');
  const IO = require('../../tools/v3/io.js');
  const doc = IO.read(path.join(ROOT, 'test', 'fixtures', 'v3', 'ZTS-real.json'));
  const d2 = JSON.parse(JSON.stringify(doc)); delete d2.meta.themeLegacy;
  let msg = '';
  try { C.compute(d2, { seeds: {} }); } catch (e) { msg = e.message; }
  t(/pick-brand/.test(msg) && /seeds\.json/.test(msg), `themeOf message names pick-brand + seeds.json (${msg.slice(0, 80)})`);
  t(/save ปฏิเสธบนใบ NEW/.test(msg), 'themeOf message says themeLegacy is refused on NEW');
  t(!/หรือ themeLegacy/.test(msg), 'themeOf message no longer offers "หรือ themeLegacy" as the fix'); }

t.done();
