# GUI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin ทั้งเว็บ (908 รายงาน + หน้าแรก) เป็นระบบ brand-forward ตาม spec `docs/superpowers/specs/2026-08-11-gui-redesign-design.md` โดยไม่แตะไฟล์ `reports/*.html` แม้แต่ไฟล์เดียว

**Architecture:** สีต่อหุ้น derive ใน Node ตอน build (`deriveTheme()` → hex ตรง ๆ เติมผ่าน `fillTokens` slot `__RD_*__` เดิม) · โครงนำเสนอใหม่ (section nav, ถอดอีโมจิ) inject เป็น static string ใน `decorateReport()` เฉพาะ dist · หน้าแรกเขียน template ใหม่ใน build.js (ไทล์สี + toggle ตาราง = CSS 2 โหมดบน DOM เดียว)

**Tech Stack:** Node ≥20.19, zero-dependency build, `tools/brandtheme.js` (mixHex/contrast/effectiveHex — มีอยู่แล้ว), quality gate 10 ขั้น

## Global Constraints

- ❌ ห้ามแก้ `reports/*.html` · ❌ ห้ามเปลี่ยน schema `reports.json` (manifest เขียนเฉพาะ field เดิม)
- ❌ ห้ามเปลี่ยนชื่อ class/id ใด ๆ: `.chg .px .sub .gauge .metric .card .vmethod .fv-box .mos-verdict .scn .cr .verdict .vgrid .vcell .zone .disc .s-head .n` + `#priceChart #gbar #mCur #mFair #pxIn #mosOut #stock-meta #report-data` + `.ta-*`
- การ์ดหน้าแรกต้องคง: `<a class="card"` (attribute แรก) + `href="./<SYM>.html"` + `data-market` + `data-mos data-upside data-pe data-yield data-roe` + `data-search` (สัญญา `check-site.js:127`)
- ตัวหนังสือขาวอยู่บน `accentDark`/`--badge` เท่านั้น ห้ามบน `accent` ดิบ (386/908 ตก AA)
- muted = `#5f6675` (ไม่ใช่ `#6b7280`) · soft = mix(accent 10%, #fff) — ค่าที่วัดแล้ว 0/905 ตก
- ป้าย gauge `.marker .lab` สูง ≤24px (font 11px, padding 3px 9px) — คงการแยกชั้น `fairLabelTop:-58px`
- อีโมจิ: ถอดเฉพาะ 5 ช่องประดับ (🐻⚖️🚀🧮💡⚠️) · **เก็บ** ธง 🇹🇭🇺🇸, ตัวนับ 👁👍👎
- ทุก task จบด้วย commit · **ห้าม push ทุกกรณี** — งานนี้อยู่นอก auto-push scope, push หลังเจ้าของดูของจริงแล้วเท่านั้น
- คำสั่งอ้างบรรทัด build.js อิง HEAD ปัจจุบัน (`cb239e52`) — ถ้าเลื่อนให้ grep หา anchor ที่ให้ไว้แทน

---

### Task 1: `deriveTheme()` + token ใหม่ใน `renderHead()`

**Files:**
- Modify: `build.js` (บน: requires · ~72: หลัง `THEME_DEFAULTS` · ~84: `renderHead` · ~400: `module.exports`)
- Test: `test/build-test.js` (ต่อท้ายส่วน expandReport tests, ~บรรทัด 165)

**Interfaces:**
- Consumes: `tools/brandtheme.js` → `mixHex(base, color, t)` (= base + (color−base)×t), `hexToRgb(hex)`, `effectiveHex(value, bgHex)`
- Produces: `deriveTheme(theme) → { tintBg, tintCard, line, line2, soft, shadow, shadowLg }` (hex/สตริง CSS) — Task 2 (gate), Task 3 (CSS slots), Task 6 (landing) ใช้ต่อ · export ผ่าน `module.exports`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน** — ต่อท้ายบล็อกเทสต์ expandReport ใน `test/build-test.js`:

```js
// ── deriveTheme: token สีที่ derive ตอน build (GUI redesign ส.ค. 2026 — spec §3.2) ──
{
  const bt = require('../tools/brandtheme.js');
  const t = { accent: '#31a60d', accentDark: '#23760a' };
  const dv = b.deriveTheme(t);
  ok(dv.tintBg === bt.mixHex('#f4f5f7', '#31a60d', 0.07), 'deriveTheme: tintBg = mix(accent 7%, #f4f5f7)');
  ok(dv.tintBg === '#e6efe7', 'deriveTheme: tintBg ค่าจริงของ #31a60d = #e6efe7');
  ok(dv.tintCard === bt.mixHex('#ffffff', '#31a60d', 0.04), 'deriveTheme: tintCard = mix(accent 4%, #fff)');
  ok(dv.line === bt.mixHex('#e6e8ec', '#31a60d', 0.14), 'deriveTheme: line = mix(accent 14%, #e6e8ec)');
  ok(dv.line2 === bt.mixHex('#d8dbe1', '#31a60d', 0.26), 'deriveTheme: line2 = mix(accent 26%, #d8dbe1)');
  ok(dv.soft === bt.mixHex('#ffffff', '#31a60d', 0.10), 'deriveTheme: soft = mix(accent 10%, #fff) — 13% ตก AA (GNRC/HLI)');
  ok(dv.shadow === '0 1px 2px rgba(49,166,13,.12),0 10px 30px rgba(49,166,13,.13)', 'deriveTheme: shadow = เงาย้อม rgb ของ accent');
  ok(dv.shadowLg === '0 2px 4px rgba(49,166,13,.14),0 18px 46px rgba(49,166,13,.18)', 'deriveTheme: shadowLg');
  ok(b.deriveTheme({ accent: 'rgb(49,166,13)' }).tintBg === dv.tintBg, 'deriveTheme: accent รูป rgb() เท่า hex (ผ่าน effectiveHex)');
  ok(/^#[0-9a-f]{6}$/i.test(b.deriveTheme(undefined).tintBg), 'deriveTheme: ไม่มี theme → THEME_DEFAULTS ไม่ throw');
  const head = b.renderHead(t);
  ok(!head.includes('__RD_TINTBG__') && !head.includes('__RD_SOFT__'), 'renderHead: token ใหม่ถูกเติมหมด ไม่เหลือ __RD_*__ ค้าง');
  ok(head.includes('Kanit'), 'FONT_LINKS มี Kanit');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

Run: `node test/build-test.js`
Expected: FAIL — `b.deriveTheme is not a function`

- [ ] **Step 3: implement ใน `build.js`**

3a. บนสุด (ใกล้ requires เดิม): `const bt = require('./tools/brandtheme.js');`

3b. ต่อท้าย `THEME_DEFAULTS` (anchor: `const _partialCache = {};`) — แทรกก่อนบรรทัดนั้น:

```js
// ── โทนสีต่อหุ้นที่ "คำนวณตอน build" (spec 2026-08-11 §3.2) — คาย hex ตรง ๆ ไม่พึ่ง color-mix() ──
// ทำใน Node เพื่อ (1) ไม่ผูกกับ browser support (2) ใช้ pattern fillTokens เดิม (3) gate ตรวจ contrast ได้ (E38)
// ★ ค่าวัดจริงทั้ง 905 ธีม: soft ต้อง 10% (13% ทำ accentDark/soft ตก AA — GNRC 4.46, HLI 4.47)
function deriveTheme(theme) {
  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  const A = bt.effectiveHex(t.accent, '#ffffff'); // รับ rgb()/hsl() ด้วย — validateReportData ปล่อยผ่านรูปพวกนี้
  const [r, g, b] = bt.hexToRgb(A);
  return {
    tintBg:   bt.mixHex('#f4f5f7', A, 0.07),
    tintCard: bt.mixHex('#ffffff', A, 0.04),
    line:     bt.mixHex('#e6e8ec', A, 0.14),
    line2:    bt.mixHex('#d8dbe1', A, 0.26),
    soft:     bt.mixHex('#ffffff', A, 0.10),
    shadow:   `0 1px 2px rgba(${r},${g},${b},.12),0 10px 30px rgba(${r},${g},${b},.13)`,
    shadowLg: `0 2px 4px rgba(${r},${g},${b},.14),0 18px 46px rgba(${r},${g},${b},.18)`,
  };
}
```

3c. ใน `renderHead()` เพิ่มบรรทัดแรกของฟังก์ชันหลัง `const t = ...`: `const dv = deriveTheme(t);` แล้วเติม map ของ `fillTokens`:

```js
    __RD_TINTBG__: dv.tintBg, __RD_TINTCARD__: dv.tintCard, __RD_LINE__: dv.line,
    __RD_LINE2__: dv.line2, __RD_SOFT__: dv.soft, __RD_SHADOW__: dv.shadow, __RD_SHADOWLG__: dv.shadowLg,
```

3d. `FONT_LINKS` (build.js:66) — แทน href ด้วย:

```
https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600&family=Sarabun:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap
```

3e. `module.exports` (build.js:400): เพิ่ม `deriveTheme`

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `node test/build-test.js`
Expected: PASS ทุกข้อ (ของเดิม + ใหม่)

- [ ] **Step 5: Commit**

```bash
git add build.js test/build-test.js && git commit -m "feat: deriveTheme() — โทนสีต่อหุ้นคำนวณตอน build (spec §3.2)"
```

---

### Task 2: Gate E38 ตรวจคู่สีที่ derive + เคส self-test

**Files:**
- Modify: `test/check-reports.js:301-325` (ใน fn ของ E38)
- Test: `test/self-test.js` (~บรรทัด 237 ต่อท้ายบล็อก E38 เดิม)

**Interfaces:**
- Consumes: `deriveTheme` จาก `../build.js` (Task 1) · `bt`, `chk`, `t`, `resolveColor` ที่มีอยู่ในไฟล์แล้ว
- Produces: E38 fail = build/push ถูกบล็อก เมื่อ theme ใดทำคู่ derive ตก AA

- [ ] **Step 1: เขียนเคส self-test ที่ยังไม่ผ่าน** — ต่อท้ายบล็อก `── E38` ใน `test/self-test.js` (หลังบรรทัด `reject('E38', ... toUpperCase() ...)`):

```js
// ── E38: คู่สีที่ derive ตอน build (GUI redesign ส.ค. 2026 — spec §3.4) ──
expect('E38', 'error', mutJson('report-data', (d) => { d.theme = d.theme || {}; d.theme.accentDark = '#8aa5c8'; }), 'accentDark อ่อน (ฟ้าหม่น) — ขาวบน accentDark ~2.4:1 → ต้องจับ E38');
reject('E38', mutJson('report-data', (d) => { d.theme = d.theme || {}; d.theme.accent = '#0a7a3d'; d.theme.accentDark = '#0a5c2e'; }), 'ธีมเขียวเข้มมาตรฐาน — ทุกคู่ derive ผ่าน → ต้องไม่ฟ้อง E38');
```

- [ ] **Step 2: รันให้เห็นว่าตก**

Run: `node test/self-test.js`
Expected: FAIL เคส `accentDark อ่อน` (checker ยังไม่มีเช็คนี้ — ยกเว้นคู่เดิมจับได้เอง: ถ้า PASS ตั้งแต่ยังไม่แก้ ให้เปลี่ยนค่าเป็น `#9db8d9` แล้วรันซ้ำให้ FAIL ก่อน)

- [ ] **Step 3: แก้ E38 ใน `test/check-reports.js`**

3a. เพิ่ม require (บรรทัดใกล้ `const { resolveColor } = require('../tools/fix-contrast.js');`):
`const { deriveTheme } = require('../build.js');`

3b. ในฟังก์ชัน E38 — **แทน**บรรทัดเดิม `chk('accentDark บน blue-soft (.fv-box)', bt.effectiveHex(t.accentDark, '#e8f0fe'), '#e8f0fe', bt.AA.text);` ด้วย:

```js
    // ── คู่สีที่ derive ตอน build (spec 2026-08-11 §3.4) — CSS ใหม่ย้อมพื้น/เส้น/ชิปด้วย accent ──
    const dv = deriveTheme(t);
    chk('ink บน tintBg (พื้นหน้า)', '#14161c', dv.tintBg, bt.AA.text);
    chk('muted บน tintCard', '#5f6675', dv.tintCard, bt.AA.text);
    chk('accentDark บน soft (.fv-box/ชิป)', bt.effectiveHex(t.accentDark, dv.soft), dv.soft, bt.AA.text);
    chk('ขาวบน accentDark (ปุ่ม/ไทล์/ป้าย gauge)', '#ffffff', bt.effectiveHex(t.accentDark, '#ffffff'), bt.AA.text);
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน + gate จริงทั้งฐาน**

Run: `node test/self-test.js && npm run check`
Expected: self-test PASS ทุกเคส · check-reports **0 error ทั้ง 908** (ค่าที่ล็อกใน spec วัดมาแล้วว่า 0 ตก — ถ้ามีตัวตก = สูตรใน Task 1 พิมพ์ผิด ห้ามแก้เกณฑ์ ให้กลับไปเทียบสูตรกับ spec)

- [ ] **Step 5: Commit**

```bash
git add test/check-reports.js test/self-test.js && git commit -m "feat: E38 ตรวจคู่สี derive (ink/tintBg, muted/tintCard, accentDark/soft, white/accentDark)"
```

---

### Task 3: เขียน `_template/dashboard.css` ใหม่ (brand-forward)

**Files:**
- Modify: `_template/dashboard.css` (แทนทั้งไฟล์)

**Interfaces:**
- Consumes: token slot เดิม 11 + ใหม่ 7 จาก Task 1 · ชื่อ class/id เดิมทุกตัว (Global Constraints)
- Produces: ไฟล์ CSS ที่ `renderHead()` inject — รวม style ของ `#secnav` ที่ Task 4 จะสร้าง markup

- [ ] **Step 1: แทนเนื้อไฟล์ทั้งหมดด้วย CSS นี้** (จุดตัดสินใจฝังในคอมเมนต์ — อ่านก่อนแก้อะไร):

```css
/* ══ BRAND-FORWARD (spec 2026-08-11) ══════════════════════════════════════
   สีแบรนด์ต่อหุ้นเป็นตัวนำทั้งหน้า — พื้น/เส้น/เงา/ชิปย้อมด้วย accent (token derive ตอน build)
   กฎเหล็ก: ตัวหนังสือขาวอยู่บน accentDark/--badge เท่านั้น (E38 §3.4) · ห้ามบน accent ดิบ
   ป้าย gauge สูง ≤24px — คงการแยกชั้น fairLabelTop:-58px (spec §5.5)
   ══════════════════════════════════════════════════════════════════════ */
:root{
  --bg:__RD_TINTBG__; --card:#ffffff; --card-2:__RD_TINTCARD__; --ink:#14161c; --muted:#5f6675;
  --line:__RD_LINE__; --line-2:__RD_LINE2__;
  --blue:__RD_ACCENT__; --blue-d:__RD_ACCENTD__; --red:#d92d20; --yellow:#b45309; --orange:#c2410c; --green:#067647;
  --green-soft:#e7f6ee; --red-soft:#fdeceb; --amber-soft:#fdf3e2; --blue-soft:__RD_SOFT__;
  --dark-grad:__RD_DARKGRAD__; --glow:__RD_GLOW__; --sub-col:__RD_SUBCOL__; --header-muted:__RD_HMUTED__;
  --chg-bg:__RD_CHGBG__; --chg-fg:__RD_CHGFG__; --badge:__RD_BADGE__;
  --verdict-text:__RD_VTEXT__; --vcell-k:__RD_VCELLK__;
  --shadow:__RD_SHADOW__; --shadow-lg:__RD_SHADOWLG__;
  --display:'Kanit',system-ui,sans-serif; --monoff:'IBM Plex Mono',ui-monospace,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun','Noto Sans Thai',system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);line-height:1.68;-webkit-font-smoothing:antialiased}
.mono{font-family:var(--monoff);font-variant-numeric:tabular-nums}
.wrap{max-width:1120px;margin:0 auto;padding:20px 16px 72px}

/* ── Header: บล็อกสีแบรนด์ ราคาเป็นพระเอก ── */
header{background:var(--dark-grad);border-radius:26px;padding:30px 32px 28px;color:#fff;position:relative;overflow:hidden;box-shadow:var(--shadow-lg)}
header::after{content:"";position:absolute;right:-70px;top:-120px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,var(--glow),transparent 66%)}
.gdots{display:inline-flex;gap:6px;margin-bottom:14px;position:relative;z-index:2}
.gdots span{width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 3px rgba(255,255,255,.13)}
.tag{display:inline-block;font-family:var(--display);font-size:11.5px;font-weight:500;padding:4px 12px;border-radius:99px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(6px);margin-right:6px;position:relative;z-index:2}
h1{font-family:var(--display);font-size:36px;font-weight:600;letter-spacing:-.8px;line-height:1.2;margin:12px 0 5px;position:relative;z-index:2}
.sub{color:var(--sub-col);font-size:14.5px;line-height:1.6;max-width:70ch;font-weight:300;position:relative;z-index:2}
.price-row{display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;margin-top:24px;position:relative;z-index:2}
.px{font-family:var(--display);font-size:62px;font-weight:600;letter-spacing:-2.5px;line-height:.95;font-variant-numeric:tabular-nums}
.px small{font-family:var(--monoff);font-size:13px;font-weight:600;color:rgba(255,255,255,.62);margin-left:9px;letter-spacing:.04em}
.chg{font-family:var(--display);font-weight:600;font-size:15px;padding:6px 14px;border-radius:99px;background:var(--chg-bg);color:var(--chg-fg);margin-bottom:4px}
.px-meta{font-family:var(--monoff);font-size:11px;color:var(--header-muted);margin-left:auto;text-align:right;line-height:1.8}

/* ── Section nav (markup inject ใน decorateReport — Task 4) ── */
#secnav{position:sticky;top:0;z-index:80;background:__RD_TINTBG__f2;background:color-mix(in srgb,__RD_TINTBG__ 92%,transparent);backdrop-filter:blur(14px);margin:14px -16px 0;padding:9px 16px;border-bottom:1px solid var(--line)}
#secnav .sn-in{max-width:1120px;margin:0 auto;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
#secnav .sn-in::-webkit-scrollbar{display:none}
#secnav a{display:flex;align-items:center;gap:7px;white-space:nowrap;padding:7px 14px;text-decoration:none;font-family:var(--display);font-size:12.5px;font-weight:400;border-radius:99px;color:var(--muted);border:1px solid transparent;transition:all .14s ease}
#secnav a b{font-family:var(--monoff);font-weight:600;font-size:10.5px;opacity:.6}
#secnav a:hover{background:var(--card);border-color:var(--line);color:var(--ink)}
#secnav a.on{background:var(--blue-d);color:#fff;font-weight:500;border-color:var(--blue-d)}
#secnav a.on b{opacity:.85}
section{scroll-margin-top:62px}

/* ── Section head: เลขในกล่องสี --badge (ขาวบน badge = คู่ที่ E38 ตรวจอยู่แล้ว) ── */
section{margin-top:36px}
.s-head{display:flex;align-items:center;gap:12px;margin:0 6px 15px}
.s-head .n{width:31px;height:31px;border-radius:10px;background:var(--badge);color:#fff;display:grid;place-items:center;font-family:var(--display);font-size:15px;font-weight:600;flex:none}
.s-head h2{font-family:var(--display);font-size:20px;font-weight:600;letter-spacing:-.4px}
.s-head .hint{font-family:var(--monoff);font-size:11px;color:var(--muted);margin-left:auto;text-align:right}

/* ── Metrics ── */
.grid{display:grid;gap:12px}
.g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
.metric{background:var(--card);border:1px solid var(--line);border-radius:17px;padding:16px 17px;box-shadow:var(--shadow);position:relative;overflow:hidden;transition:transform .16s ease,box-shadow .16s ease}
.metric::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--blue);opacity:0;transition:opacity .16s}
.metric:hover{transform:translateY(-2px);box-shadow:var(--shadow-lg)}
.metric:hover::before{opacity:1}
.metric .k{font-size:12px;color:var(--muted);font-weight:500;display:flex;align-items:center;gap:5px}
.metric .v{font-family:var(--display);font-size:26px;font-weight:600;margin-top:4px;letter-spacing:-1px;line-height:1.2;font-variant-numeric:tabular-nums}
.metric .d{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.5;font-weight:300}
.pos{color:var(--green)} .neg{color:var(--red)} .neu{color:var(--yellow)}
.pill{font-family:var(--monoff);font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;vertical-align:middle}
.pill.g{background:var(--green-soft);color:var(--green)} .pill.r{background:var(--red-soft);color:var(--red)} .pill.a{background:var(--amber-soft);color:var(--yellow)}

.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:var(--shadow)}

/* ── Chart ── */
.chart-wrap{padding:8px 4px 0}
.legend{display:flex;gap:20px;font-size:12px;color:var(--muted);margin-top:13px;flex-wrap:wrap}
.legend i{display:inline-block;width:14px;height:4px;border-radius:99px;vertical-align:middle;margin-right:7px}

/* ── Gauge — ★ ป้ายสูง ≤24px: font 11px + padding 3x9 (spec §5.5) ── */
.gauge{margin:10px 0 4px}
.gbar{position:relative;height:48px;border-radius:14px;overflow:hidden;background:linear-gradient(90deg,#067647 0%,#12a05f 22%,#e0a418 46%,#d92d20 100%)}
.gbar .seg-label{position:absolute;top:50%;transform:translate(-50%,-50%);font-family:var(--display);font-size:10.5px;font-weight:500;color:#fff;background:rgba(0,0,0,.4);padding:2px 9px;border-radius:99px;white-space:nowrap}
.marker{position:absolute;top:-6px;bottom:-6px;width:3px;background:#12141a;border-radius:99px}
.marker .lab{position:absolute;top:-34px;left:50%;transform:translateX(-50%);background:#12141a;color:#fff;font-family:var(--monoff);font-size:11px;font-weight:600;padding:3px 9px;border-radius:7px;white-space:nowrap}
.marker .lab::after{content:"";position:absolute;bottom:-4px;left:50%;transform:translateX(-50%) rotate(45deg);width:8px;height:8px;background:inherit}
.marker.cur{background:var(--blue)} .marker.cur .lab{background:var(--blue-d)}
.scale{display:flex;justify-content:space-between;font-family:var(--monoff);font-size:11px;color:var(--muted);margin-top:15px}

/* ── Valuation ── */
.vmethod{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 0;border-bottom:1px solid var(--line)}
.vmethod:last-child{border-bottom:none}
.vmethod .mname{font-family:var(--display);font-weight:500;font-size:15.5px}
.vmethod .mdesc{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.55;font-weight:300;max-width:64ch}
.vmethod .mval{font-family:var(--display);font-size:22px;font-weight:600;text-align:right;letter-spacing:-.7px;font-variant-numeric:tabular-nums;white-space:nowrap}
.fv-box{margin-top:17px;background:var(--blue-soft);border:1px solid var(--line-2);border-radius:17px;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.fv-box .l{font-family:var(--display);font-size:13.5px;color:var(--blue-d);font-weight:500}
.fv-box .r{font-family:var(--display);font-size:36px;font-weight:600;color:var(--blue-d);letter-spacing:-1.5px;font-variant-numeric:tabular-nums;line-height:1}

/* ── MOS ── */
.mos-verdict{border-radius:18px;padding:20px 22px;margin-bottom:15px;display:flex;align-items:center;gap:18px}
.mos-verdict.bad{background:var(--red-soft)} .mos-verdict.ok{background:var(--amber-soft)} .mos-verdict.good{background:var(--green-soft)}
.mos-verdict .big{font-family:var(--display);font-size:42px;font-weight:600;letter-spacing:-2px;flex:none;line-height:1;font-variant-numeric:tabular-nums}
.mos-verdict.bad .big{color:var(--red)} .mos-verdict.ok .big{color:var(--yellow)} .mos-verdict.good .big{color:var(--green)}
.mos-verdict .txt{font-size:13.5px;line-height:1.65;color:var(--ink);font-weight:300}
.mos-verdict .txt b{font-family:var(--display);font-size:15px;font-weight:500}
.calc{margin-top:17px;border:1.5px dashed var(--line-2);border-radius:17px;padding:17px 19px;background:var(--card-2)}
.calc label{font-family:var(--display);font-size:13px;color:var(--ink);font-weight:500;display:block;margin-bottom:8px}
.calc-row{display:flex;gap:13px;align-items:center;flex-wrap:wrap}
.calc input{font-family:var(--display);font-size:19px;font-weight:600;border:2px solid var(--line-2);border-radius:13px;padding:8px 13px;width:150px;outline:none;background:#fff;color:var(--ink);font-variant-numeric:tabular-nums}
.calc input:focus{border-color:var(--blue-d)}
.calc-out{font-size:14px;font-weight:500;color:var(--ink)}

/* ── Scenarios (หัวสี: bear/bull ใช้สีสถานะ · base ใช้ accentDark — ขาวทับได้ทุกตัว) ── */
.scn{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.scn .col{border:1px solid var(--line);border-radius:19px;overflow:hidden;background:var(--card);box-shadow:var(--shadow)}
.scn .top{padding:12px 17px;color:#fff;font-family:var(--display);font-size:14px;font-weight:500;display:flex;justify-content:space-between;align-items:center;gap:8px}
.scn .bear .top{background:var(--red)} .scn .base .top{background:var(--blue-d)} .scn .bull .top{background:var(--green)}
.scn .body{padding:17px}
.scn .tgt{font-family:var(--display);font-size:30px;font-weight:600;letter-spacing:-1.3px;line-height:1.05;font-variant-numeric:tabular-nums}
.scn .ret{font-family:var(--display);font-size:14px;font-weight:500;margin-top:3px}
.scn ul{list-style:none;margin-top:13px;font-size:12px;color:var(--muted)}
.scn li{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--line)}
.scn li:last-child{border:none}
.scn li span:last-child{font-weight:600;color:var(--ink);text-align:right}

/* ── Catalyst / Risk ── */
.cr{display:grid;grid-template-columns:1fr 1fr;gap:15px}
.cr .box{border-radius:20px;padding:20px 22px;border:1px solid var(--line);box-shadow:var(--shadow)}
.cr .box.cat{background:linear-gradient(170deg,var(--green-soft),#fff 60%)}
.cr .box.risk{background:linear-gradient(170deg,var(--red-soft),#fff 60%)}
.cr h3{font-family:var(--display);font-size:16px;font-weight:600;display:flex;align-items:center;gap:10px;margin-bottom:13px}
.cr .ic{width:27px;height:27px;border-radius:9px;display:grid;place-items:center;font-size:12px;flex:none;color:#fff}
.cr .cat .ic{background:var(--green)} .cr .risk .ic{background:var(--red)}
.cr ul{list-style:none}
.cr li{font-size:13px;padding:9px 0;border-bottom:1px solid var(--line);display:flex;gap:10px;color:var(--ink);line-height:1.6;font-weight:300}
.cr li:last-child{border:none}
.cr li::before{content:"";width:7px;height:7px;border-radius:50%;margin-top:8px;flex:none}
.cr .cat li::before{background:var(--green)} .cr .risk li::before{background:var(--red)}
.cr li b{font-family:var(--display);font-weight:500}

/* ── Verdict ── */
.verdict{background:var(--dark-grad);color:#fff;border-radius:24px;padding:30px 32px;box-shadow:var(--shadow-lg);position:relative;overflow:hidden}
.verdict::after{content:"";position:absolute;right:-80px;bottom:-120px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,var(--glow),transparent 68%)}
.verdict h2{font-family:var(--display);font-size:24px;font-weight:600;margin-bottom:8px;letter-spacing:-.5px;position:relative;z-index:2}
.verdict p{color:var(--verdict-text);font-size:14px;margin-bottom:18px;line-height:1.7;font-weight:300;max-width:70ch;position:relative;z-index:2}
.vgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:6px;position:relative;z-index:2}
.vcell{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:15px;padding:14px 16px}
.vcell .k{font-size:12px;color:var(--vcell-k);font-weight:400;opacity:.85}
.vcell .v{font-family:var(--display);font-size:18px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.zone{margin-top:18px;font-size:13.5px;color:var(--verdict-text);background:rgba(255,255,255,.08);border-left:4px solid #ffd180;border-radius:0 13px 13px 0;padding:13px 17px;line-height:1.7;font-weight:300;position:relative;z-index:2}
.zone b{color:#fff;font-family:var(--display);font-weight:500}

.disc{margin-top:28px;font-size:12px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:17px;padding:17px 19px;line-height:1.75;font-weight:300}
.disc b{color:var(--ink);font-weight:600}
footer{text-align:center;font-size:11.5px;color:var(--muted);margin-top:24px}
footer a{color:var(--blue-d)}

/* ── มือถือ (spec §4.1 + §5.5: 3 breakpoint · tap ≥44px) ── */
@media(max-width:1024px){ .wrap{max-width:920px} }
@media(max-width:760px){
  .g4{grid-template-columns:repeat(2,1fr)} .g3{grid-template-columns:repeat(2,1fr)}
  .scn{grid-template-columns:1fr} .cr{grid-template-columns:1fr} .vgrid{grid-template-columns:1fr}
  .px{font-size:46px} h1{font-size:26px} .px-meta{margin-left:0;text-align:left;width:100%}
  header{padding:24px 20px;border-radius:20px} .verdict{padding:24px 20px;border-radius:20px}
  .ta-btn,.ta-tog,.votebar .vbtn{min-height:44px}
  .calc input{min-height:44px}
  #secnav a{min-height:44px}
}
@media(max-width:480px){
  .g4,.g3,.g2{grid-template-columns:1fr}
  .px{font-size:40px} h1{font-size:23px}
  .metric .v{font-size:23px}
}

/* ── TA chart (โทนเดียวกับหน้า — จอสว่าง) ── */
.ta-box{margin-top:2px}
.ta-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px;align-items:center}
.ta-chip{font-size:11.5px;font-family:var(--monoff);padding:4px 11px;border-radius:99px;border:1px solid var(--line);color:var(--muted);background:var(--card-2)}
.ta-chip.pos{color:var(--green);border-color:#b7e0ca;background:var(--green-soft)}
.ta-chip.neg{color:var(--red);border-color:#f5c9c5;background:var(--red-soft)}
.ta-attr{font-size:11px;color:var(--muted);margin-left:auto}
.ta-attr a{color:inherit}
.ta-toolbar{display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:9px;align-items:center}
.ta-tgroup{display:inline-flex;gap:2px;background:var(--card-2);border:1px solid var(--line);border-radius:99px;padding:3px}
.ta-acts{margin-left:auto}
.ta-btn{font-size:11.5px;font-family:var(--monoff);border:0;background:transparent;color:var(--muted);padding:4px 11px;border-radius:99px;cursor:pointer;line-height:1.4}
.ta-btn:hover{background:var(--blue-soft);color:var(--blue-d)}
.ta-btn.on{background:var(--blue-d);color:#fff;font-weight:600}  /* ★ ขาวบน accentDark — ห้าม var(--blue) (386/908 ตก AA) */
.ta-btn:disabled{opacity:.45;cursor:wait}
.ta-legend{position:absolute;top:6px;left:8px;z-index:3;font-size:11px;font-family:var(--monoff);color:var(--muted);background:rgba(255,255,255,.8);border-radius:7px;padding:1px 7px;pointer-events:none;white-space:nowrap}
.ta-legend b{color:var(--ink);font-weight:600}
.ta-toggles{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
.ta-tog{font-size:11px;font-family:var(--monoff);border:1px solid var(--line);background:#fff;color:var(--ink);padding:3px 11px;border-radius:99px;cursor:pointer}
.ta-tog.off{color:var(--muted);background:var(--card-2);text-decoration:line-through}
@media print{.ta-box{display:none}#priceChart{display:block!important}#secnav{display:none}}
```

หมายเหตุ implement:
- บรรทัด `#secnav{...background:__RD_TINTBG__f2;...}` ใช้ 2 ชั้น: hex+alpha (`f2` = 95%) เป็น fallback แล้วทับด้วย `color-mix` — ถ้า `__RD_TINTBG__` เป็น hex 6 หลักเสมอ (ใช่ — มาจาก mixHex) รูป `#rrggbbf2` ถูกต้อง
- `.marker .lab::after` ใช้ `background:inherit` — ป้าย fair (พื้น `#12141a`) กับ cur (พื้น `--blue-d`) ได้ลูกศรสีตรงเอง ไม่ต้อง override แยก

- [ ] **Step 2: รัน gate ชุดที่แตะ CSS**

Run: `npm run build && node test/build-test.js && node test/engine-exec.js && node test/skeleton-test.js && node test/check-site.js`
Expected: PASS ทั้งหมด (ชื่อ class ไม่เปลี่ยน gate จึงไม่รู้สึก) — ถ้า engine-exec ตก แปลว่าไปแตะ id ที่ engine ใช้

- [ ] **Step 3: เปิดดูจริง**

Run: preview `http://localhost:8788/ZTS.html` (เขียว), `/CPN.html` (แดง), `/AAPL.html` (ฟ้า) — พื้นหลังต้องย้อมโทนต่างกัน 3 หน้า · gauge/กราฟ/เครื่องคิดเลขทำงาน

- [ ] **Step 4: Commit**

```bash
git add _template/dashboard.css && git commit -m "feat: dashboard.css ใหม่ — brand-forward, token derive, มือถือ 3 breakpoint (spec §4)"
```

---

### Task 4: inject section nav + ถอดอีโมจิ ใน `decorateReport()`

**Files:**
- Modify: `build.js` (~:279 ก่อน `injectShareMeta` · ~:322 `decorateReport` · ~:400 exports)
- Test: `test/build-test.js`

**Interfaces:**
- Consumes: `esc()` (มีใน build.js) · CSS `#secnav` จาก Task 3
- Produces: `stripDecorEmoji(html)`, `injectSectionNav(html)` — dist เท่านั้น (สาย `decorateReport`) · export ทั้งคู่

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน** — ต่อท้าย `test/build-test.js`:

```js
// ── stripDecorEmoji + injectSectionNav (GUI redesign — spec §4.3) ──
{
  const src = '<div class="top"><span>🐻 Bear</span></div><label>🧮 ลองคำนวณ MOS</label>' +
    '<div class="zone">💡 <b>กลยุทธ์:</b> x</div><div class="disc"><b>⚠️ คำเตือน:</b> y</div>' +
    '<p>ปกติ 🚀 ในเนื้อความต้องอยู่</p>';
  const out = b.stripDecorEmoji(src);
  ok(out.includes('<span>Bear</span>'), 'stripDecorEmoji: 🐻 ออกจากป้ายฉาก');
  ok(out.includes('<label>ลองคำนวณ MOS</label>'), 'stripDecorEmoji: 🧮 ออกจาก calc label');
  ok(out.includes('<div class="zone"><b>กลยุทธ์:</b>'), 'stripDecorEmoji: 💡 ออกจาก zone');
  ok(out.includes('<b>คำเตือน:</b>'), 'stripDecorEmoji: ⚠️ ออกจาก disc');
  ok(out.includes('ปกติ 🚀 ในเนื้อความต้องอยู่'), 'stripDecorEmoji: อีโมจิใน prose ห้ามหาย (ยิงเฉพาะ 5 ช่อง)');

  const doc = '<div class="wrap"><header>H</header>' +
    '<section><div class="s-head"><div class="n">1</div><h2>ข้อมูลสำคัญ (Key Metrics)</h2></div></section>' +
    '<section><div class="s-head"><div class="n">2</div><h2>ราคา</h2></div></section>' +
    '<section><div class="s-head"><div class="n">3</div><h2>มูลค่า</h2></div></section>' +
    '</div></body>';
  const nav = b.injectSectionNav(doc);
  ok(nav.includes('id="secnav"'), 'injectSectionNav: มี nav');
  ok(nav.indexOf('id="secnav"') > nav.indexOf('</header>'), 'injectSectionNav: nav อยู่หลัง header');
  ok(nav.includes('<section id="sec1">'), 'injectSectionNav: section ได้ id');
  ok(nav.includes('>ข้อมูลสำคัญ</a>') || /<a[^>]*>(<b>1<\/b>)?ข้อมูลสำคัญ<\/a>/.test(nav), 'injectSectionNav: ตัดวงเล็บอังกฤษออกจากชื่อ');
  ok(b.injectSectionNav('<header>H</header><section><h2>เดียว</h2></section>') .includes('secnav') === false, 'injectSectionNav: <3 section (legacy) → ไม่แทรก');
}
```

- [ ] **Step 2: รันให้ตก** — `node test/build-test.js` → FAIL `stripDecorEmoji is not a function`

- [ ] **Step 3: implement ใน build.js** (วางเหนือ `injectShareMeta`):

```js
// ── ถอดอีโมจิประดับ (spec §4.3) — ยิงเฉพาะ 5 ช่องที่รู้จักจาก skeleton ห้ามกวาดทั้งเอกสาร ──
// (build ไม่มี DOM parser — กวาดทั้งไฟล์จะกินอีโมจิที่ analyst ตั้งใจใช้ใน prose catalyst/risk ด้วย)
const EMOJI_SLOTS = [
  [/(<div class="top"><span>)\s*(?:🐻|⚖️|⚖|🚀)\s*/gu, '$1'],   // ป้ายฉาก Bear/Base/Bull
  [/(<label>)\s*🧮\s*/gu, '$1'],                                  // calc label
  [/(<div class="zone">)\s*💡\s*/gu, '$1'],                       // กลยุทธ์
  [/(<b>)\s*⚠️?\s*(คำเตือน)/gu, '$1$2'],                          // disclaimer
  [/(<h3><span class="ic">[▲▼]<\/span>)\s*[\u{1F300}-\u{1FAFF}]\s*/gu, '$1'], // cr h3 (กันเผื่อรายงานเก่าบางใบ)
];
function stripDecorEmoji(html) {
  for (const [re, rep] of EMOJI_SLOTS) html = html.replace(re, rep);
  return html;
}

// ── section nav แบบ static (spec §4.3) — สร้างตอน build: ใช้ได้แม้ JS ปิด · scroll-spy เป็น enhancement ──
function injectSectionNav(html) {
  const secs = [];
  let i = 0;
  html = html.replace(/<section>(\s*<div class="s-head">[\s\S]*?<h2>([\s\S]*?)<\/h2>)/g, (m, rest, title) => {
    const id = 'sec' + (++i);
    secs.push({ id, title: title.replace(/<[^>]*>/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim() });
    return `<section id="${id}">` + rest;
  });
  if (secs.length < 3) return html; // รายงาน legacy/โครงไม่ครบ → ไม่แทรก (อย่าเดา)
  const nav = `<nav id="secnav" aria-label="สารบัญรายงาน"><div class="sn-in">` +
    secs.map((s, j) => `<a href="#${s.id}"><b>${j + 1}</b>${esc(s.title)}</a>`).join('') +
    `</div></nav>`;
  const spy = `<script>(function(){var L=[].slice.call(document.querySelectorAll('#secnav a')),S=L.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))});if(!('IntersectionObserver'in window))return;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var i=S.indexOf(e.target);L.forEach(function(a,j){a.classList.toggle('on',i===j)})})},{rootMargin:'-62px 0px -70% 0px'});S.forEach(function(s){if(s)io.observe(s)})})();</script>`;
  const hi = html.indexOf('</header>');
  if (hi === -1) return html;
  html = html.slice(0, hi + 9) + '\n' + nav + html.slice(hi + 9);
  const bi = html.toLowerCase().lastIndexOf('</body>');
  return bi === -1 ? html + spy : html.slice(0, bi) + spy + '\n' + html.slice(bi);
}
```

ใน `decorateReport()` — แทรก 2 บรรทัดแรกก่อน `injectShareMeta`:

```js
function decorateReport(html, r) {
  const model = r.aiModel || AI_MODEL;
  let h = stripDecorEmoji(html);
  h = injectSectionNav(h);
  h = injectShareMeta(h, r);
  ...
```

เพิ่ม `stripDecorEmoji, injectSectionNav` ใน `module.exports`

- [ ] **Step 4: รันให้ผ่าน + ตรวจ dist จริง**

Run: `node test/build-test.js && npm run build && rtk proxy grep -c 'id="secnav"' dist/ZTS.html && rtk proxy grep -c '🐻' dist/ZTS.html || true`
Expected: build-test PASS · `secnav` = 1 · `🐻` = 0 ใน dist (แต่ `rtk proxy grep -c '🐻' reports/ZTS.html` ยังเป็น 1 — ต้นฉบับไม่ถูกแตะ)

- [ ] **Step 5: รัน verify เต็ม** — `npm run verify` → ผ่าน 10 ขั้น (check-site สแกน dist ที่มี nav แล้ว — CONTAINER_TAGS มี `nav` ไม่อยู่ในลิสต์แต่เช็คนั้นเป็น security scan ของ href/src เท่านั้น ถ้าตกให้อ่าน error ก่อนแก้ อย่าเดา)

- [ ] **Step 6: Commit**

```bash
git add build.js test/build-test.js && git commit -m "feat: inject section nav + ถอดอีโมจิประดับตอน build (dist เท่านั้น — spec §4.3)"
```

---

### Task 5: ถอดอีโมจิออกจาก skeleton ทั้งสอง

**Files:**
- Modify: `_template/skeleton-th.html:197,210,223,183,274,281` · `_template/skeleton-us.html` (บรรทัดเทียบเท่า)

**Interfaces:**
- Consumes/Produces: ไม่มี — เนื้อ content เท่านั้น ห้ามแตะโครง (invariant spec §2: markup ทรงเดียว)

- [ ] **Step 1: แก้ทั้ง 2 ไฟล์** — จุดแก้ (เหมือนกันทั้ง th/us):

| เดิม | ใหม่ |
|---|---|
| `<span>🐻 Bear</span>` | `<span>Bear</span>` |
| `<span>⚖️ Base</span>` | `<span>Base</span>` |
| `<span>🚀 Bull</span>` | `<span>Bull</span>` |
| `<label>🧮 ลองคำนวณ MOS เอง` | `<label>ลองคำนวณ MOS เอง` |
| `💡 <b>กลยุทธ์:</b>` | `<b>กลยุทธ์:</b>` |
| `<b>⚠️ คำเตือน:</b>` | `<b>คำเตือน:</b>` |

- [ ] **Step 2: ตรวจ** — `node test/skeleton-test.js` → PASS (เทสต์ไม่ assert อีโมจิ — ตรวจแล้วตอนเขียน spec) และ `rtk proxy grep -c '🐻\|🧮\|💡' _template/skeleton-th.html` → 0

- [ ] **Step 3: Commit**

```bash
git add _template/skeleton-th.html _template/skeleton-us.html && git commit -m "chore: ถอดอีโมจิประดับออกจาก skeleton — รายงานใหม่ไม่ใส่กลับ (spec §4.3)"
```

---

### Task 6: หน้าแรกใหม่ — ไทล์สี + toggle ตาราง

**Files:**
- Modify: `build.js` — (a) loop รายงาน ~:449 (thread accent) · (b) `cards` template ~:543 · (c) `sortBar` ~:570 · (d) `indexHtml` `<style>` ~:781 · (e) `searchScript` ~:591 · (f) header markup ~:848

**Interfaces:**
- Consumes: `rec.accent`/`rec.accentDark` (ใส่ในข้อ a) · `deriveTheme` ไม่ใช้ที่นี่ (การ์ดใช้ inline `--c/--cd` พอ)
- Produces: `dist/index.html` ที่คงสัญญาการ์ด §5.1.2 ครบ · `reports.json` schema เดิมเป๊ะ

- [ ] **Step 1: thread สีเข้า record** — ใน loop ที่มี `rd` (anchor: บรรทัด `injectTA(decorateReport(expandReport(content), rec), ...)` ~:449) — ก่อน push record เพิ่ม:

```js
    // สีแบรนด์ไปการ์ดหน้าแรก — in-memory เท่านั้น (spec §5.2.1: ห้ามลง reports.json)
    const _th = { ...THEME_DEFAULTS, ...((rd && rd.theme) || {}) };
    rec.accent = bt.effectiveHex(_th.accent, '#ffffff');
    rec.accentDark = bt.effectiveHex(_th.accentDark, '#ffffff');
```

ตรวจว่า manifest writer (~:470 `JSON.stringify(reports.map(({ symbol, file, ... }) => ...))`) ใช้ destructuring รายชื่อ field → `accent` ไม่หลุดลงไฟล์เอง (ห้ามเพิ่มชื่อใหม่ใน map นั้น)

- [ ] **Step 2: การ์ดใหม่** — แทน template ใน `const cards = reports.map(...)`:

```js
const cards = reports.map((r) => {
  const blurb = r.desc || r.title;
  const c = escAttr(r.accent || THEME_DEFAULTS.accent), cd = escAttr(r.accentDark || THEME_DEFAULTS.accentDark);
  return `
      <a class="card" style="--c:${c};--cd:${cd}" data-search="${escAttr((r.symbol + ' ' + r.name + ' ' + r.title + ' ' + (r.desc || '')).toLowerCase())}"${metricAttrs(r.metrics)}${marketAttr(r.metrics)} href="./${encodeURIComponent(r.file)}">
        <div class="ctop"><div class="badge">${esc(r.symbol)}</div>${marketFlag(r.metrics)}</div>
        <div class="cbody">
          <div class="cname">${esc(r.name)}</div>
          <div class="ctitle" title="${escAttr(blurb)}">${esc(blurb)}</div>${highlightChip(r.metrics)}${metricStrip(r.metrics)}
          <div class="cmeta"><span class="go">เปิดรายงาน →</span><span class="cviews" data-sym="${escAttr(r.symbol)}" hidden>👁 <b class="v">0</b> · 👍 <b class="l">0</b> · 👎 <b class="d">0</b></span><span class="cdate">${fmtDate(r.updated)}</span></div>
        </div>
      </a>`;
}).join('\n');
```

★ สัญญา §5.1.2: `class="card"` ยังเป็น attribute แรก · `style` มาก่อน `data-*`/`href` — regex `<a class="card"[^>]*href="\./SYM\.html"` ยัง match · ใน `highlightChip` ตัด `<span class="hl-ic">${h.icon}</span>` ออก (spec §5.1.1 — ชิปมีสี+ค่า+คำอธิบายแล้ว)

- [ ] **Step 3: ชิปเรียงเป็นข้อความล้วน** — ใน `sortBar` เอาอีโมจินำหน้าออกทุกปุ่ม (`🕒 ล่าสุด`→`ล่าสุด`, `👍 ไลก์`→`ไลก์`, `👁 วิว`→`วิว`, `🛡️ MOS`→`MOS`, `📈 Upside`→`Upside`, `⚖️ P/E`→`P/E`, `💰 Yield`→`Yield`, `📊 ROE`→`ROE`) · `marketBar` **คงธง** 🇹🇭🇺🇸 · เพิ่ม view toggle ต่อท้าย `sortBar` (ใน div เดียวกัน หลัง ROE):

```html
      <span class="sortsep" aria-hidden="true"></span>
      <span id="viewtoggle" role="group" aria-label="รูปแบบการแสดงผล"><button type="button" class="viewbtn on" data-view="tiles">ไทล์</button><button type="button" class="viewbtn" data-view="table">ตาราง</button></span>
```

- [ ] **Step 4: แทน `<style>` ของ indexHtml ทั้งก้อน** ด้วย:

```css
  :root{
    --bg:#eef0f3; --card:#fff; --ink:#13151b; --ink-2:#3c424e; --muted:#5f6675;
    --line:#e5e7eb; --line-2:#d4d8de;
    --shadow:0 1px 2px rgba(16,24,40,.05),0 6px 18px rgba(16,24,40,.07);
    --shadow-lg:0 3px 8px rgba(16,24,40,.09),0 20px 46px rgba(16,24,40,.16);
    --display:'Kanit',system-ui,sans-serif; --monoff:'IBM Plex Mono',ui-monospace,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Sarabun',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.68;-webkit-font-smoothing:antialiased}
  .mono{font-family:var(--monoff)}
  .wrap{max-width:1280px;margin:0 auto;padding:22px 20px 72px}
  /* header ดำ + สเปกตรัมสีแบรนด์จริง — หน้าแรกโมโนโครม สีทั้งหมดมาจากการ์ด (spec §5.1) */
  header{background:#12141a;border-radius:26px;padding:0;color:#fff;position:relative;overflow:hidden;box-shadow:var(--shadow-lg)}
  #spectrum{display:flex;height:8px;width:100%}
  #spectrum i{flex:1;height:100%}
  .hd-in{padding:30px 34px 32px}
  .tag{display:inline-block;font-family:var(--monoff);font-size:10.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:12px}
  h1{font-family:var(--display);font-size:38px;font-weight:600;letter-spacing:-1.1px;line-height:1.15}
  .sub{color:rgba(255,255,255,.62);font-size:14.5px;margin-top:8px;font-weight:300;max-width:64ch}
  .hd-stats{display:flex;flex-wrap:wrap;gap:26px;margin-top:22px;padding-top:20px;border-top:1px solid rgba(255,255,255,.12)}
  .hd-stats div{display:flex;flex-direction:column;gap:2px}
  .hd-stats .n{font-family:var(--display);font-size:25px;font-weight:600;letter-spacing:-.8px;line-height:1;font-variant-numeric:tabular-nums}
  .hd-stats .l{font-family:var(--monoff);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.45)}
  .search{margin-top:20px;position:relative}
  .search input{width:100%;font-family:'Sarabun',sans-serif;font-size:15.5px;color:var(--ink);background:var(--card);border:0;border-radius:16px;padding:15px 18px;box-shadow:var(--shadow);outline:none;-webkit-appearance:none;transition:box-shadow .14s}
  .search input:focus{box-shadow:var(--shadow),0 0 0 3px rgba(19,21,27,.14)}
  .search input::placeholder{color:var(--muted)}
  .noresult{text-align:center;color:var(--muted);padding:40px;font-size:14px}
  .sortbar,.marketbar{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:13px}
  .sortlab{font-family:var(--monoff);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);margin-right:5px}
  .sortsep{width:1px;align-self:stretch;background:var(--line-2);margin:3px 4px}
  .sortbtn,.mktbtn,.viewbtn{font-family:'Sarabun',sans-serif;font-size:13px;color:var(--ink-2);background:var(--card);border:0;border-radius:99px;padding:7px 15px;cursor:pointer;box-shadow:var(--shadow);transition:all .14s}
  .sortbtn:hover:not(.on),.mktbtn:hover:not(.on),.viewbtn:hover:not(.on){color:var(--ink);transform:translateY(-1px)}
  .sortbtn.on,.mktbtn.on,.viewbtn.on{background:var(--ink);color:#fff;font-weight:500}
  .mktbtn .mc{font-family:var(--monoff);font-size:10.5px;opacity:.55;margin-left:3px}
  .mktbtn.on .mc{opacity:.75}
  /* ── ไทล์ (default) ── */
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(276px,1fr));gap:18px;margin-top:26px}
  #thead{display:none}
  .card{--c:#6b7280;--cd:#4b5563;display:flex;flex-direction:column;background:var(--card);border:0;border-radius:20px;padding:0;text-decoration:none;color:inherit;box-shadow:var(--shadow);position:relative;overflow:hidden;transition:transform .18s ease,box-shadow .18s ease}
  .card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
  .ctop{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--cd);padding:17px 20px 15px;position:relative;overflow:hidden}
  .ctop::after{content:"";position:absolute;right:-38px;top:-58px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,var(--c),transparent 68%);opacity:.75}
  .badge{font-family:var(--display);font-weight:600;font-size:23px;letter-spacing:-.6px;color:#fff;position:relative;z-index:2;line-height:1.15}
  .cflag{font-size:15px;line-height:1;flex:none;position:relative;z-index:2}
  .cbody{display:flex;flex-direction:column;padding:15px 20px 16px;flex:1}
  .cname{font-family:var(--display);font-size:16px;font-weight:500;line-height:1.35;letter-spacing:-.25px}
  .ctitle{font-size:12.5px;color:var(--muted);line-height:1.45;font-weight:300;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;min-height:calc(1.45em * 2);margin-top:4px}
  .hl{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;max-width:100%;margin-top:11px;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:500;line-height:1.3;border:1px solid transparent}
  .hl .hl-v{font-family:var(--monoff);font-weight:600;white-space:nowrap}
  .hl .hl-d{font-weight:300;opacity:.92;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hl-val{background:#e7f6ee;color:#066a41;border-color:#bde3ce}
  .hl-qual{background:#f2ecfb;color:#61369a;border-color:#ddd0f2}
  .hl-inc{background:#fdf3e2;color:#9a5500;border-color:#f6dfb4}
  .hl-cheap{background:#e4f3f7;color:#0a6579;border-color:#bfe3ec}
  .hl.lead{box-shadow:0 0 0 2px rgba(230,179,21,.24)}
  .cmetrics{display:flex;flex-wrap:wrap;gap:3px 12px;margin-top:11px;font-family:var(--monoff);font-size:10.5px;color:var(--muted);line-height:1.6}
  .cmetrics .cm b{font-weight:600;color:var(--ink-2)}
  .cmetrics .cm.on{color:var(--cd)} .cmetrics .cm.on b{color:var(--cd)}
  .cmeta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}
  .go{font-family:var(--display);font-size:13px;font-weight:500;color:var(--cd)}
  .cdate,.cviews{font-family:var(--monoff);font-size:10.5px;color:var(--muted)}
  .cviews b{font-weight:600;color:var(--ink-2)}
  /* ── โหมดตาราง (toggle · ≥901px เท่านั้น — spec §5.2) ── */
  @media(min-width:901px){
    .grid.is-table{--cols:104px minmax(190px,2.2fr) repeat(5,68px) 88px;display:block;background:var(--card);border:1px solid var(--line-2);border-radius:16px;overflow:hidden;box-shadow:var(--shadow)}
    .grid.is-table #thead{display:grid;grid-template-columns:var(--cols);gap:0 14px;align-items:center;padding:11px 18px;background:#fafbfc;border-bottom:1px solid var(--line-2);position:sticky;top:0;z-index:5;font-family:var(--monoff);font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted)}
    .grid.is-table #thead .num{text-align:right}
    .grid.is-table .card{display:grid;grid-template-columns:var(--cols);gap:0 14px;align-items:center;border:0;border-bottom:1px solid var(--line);border-left:3px solid var(--c);border-radius:0;padding:10px 18px 10px 15px;box-shadow:none;overflow:visible}
    .grid.is-table .card:hover{transform:none;box-shadow:none;background:#fafbfc}
    .grid.is-table .ctop{display:flex;background:none;padding:0;overflow:visible}
    .grid.is-table .ctop::after{display:none}
    .grid.is-table .badge{font-family:var(--monoff);font-size:12px;color:var(--cd);letter-spacing:.02em}
    .grid.is-table .cflag{font-size:12px;opacity:.8}
    .grid.is-table .cbody{display:contents}
    .grid.is-table .cname{font-size:13.5px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .grid.is-table .ctitle,.grid.is-table .hl,.grid.is-table .go,.grid.is-table .cviews{display:none}
    .grid.is-table .cmetrics{display:contents}
    .grid.is-table .cmetrics .cm{font-size:0;text-align:right;white-space:nowrap;overflow:hidden}
    .grid.is-table .cmetrics .cm b{font-size:11.5px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
    .grid.is-table .cmeta{display:flex;justify-content:flex-end;margin:0;padding:0;border:0}
  }
  .empty{grid-column:1/-1;text-align:center;padding:56px;background:var(--card);border-radius:20px;color:var(--muted);box-shadow:var(--shadow)}
  .empty .hint{font-size:13px;margin-top:6px}
  .empty code{font-family:var(--monoff);background:var(--bg);padding:2px 7px;border-radius:6px}
  .pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:34px}
  .pg{font-family:var(--monoff);font-size:12.5px;min-width:38px;height:38px;padding:0 11px;border:0;background:var(--card);color:var(--ink-2);border-radius:11px;cursor:pointer;box-shadow:var(--shadow);transition:all .14s}
  .pg.on{background:var(--ink);color:#fff;font-weight:600}
  .pg:disabled{opacity:.35;cursor:default}
  .pg:hover:not(:disabled):not(.on){color:var(--ink);transform:translateY(-1px)}
  .pg-gap{display:flex;align-items:flex-end;min-width:20px;height:38px;color:var(--muted);font-size:13px;justify-content:center}
  footer{margin-top:40px;text-align:center;color:var(--muted);font-size:12px;line-height:1.9;font-weight:300}
  footer a{color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--line-2)}
  footer b{font-weight:500;color:var(--ink-2)}
  /* ── มือถือ (spec §5.5: tap ≥44px · แถบกรองเลื่อนแถวเดียว) ── */
  @media(max-width:820px){
    .wrap{padding:16px 15px 60px}
    .hd-in{padding:24px 22px 26px} h1{font-size:29px} header{border-radius:20px}
    .hd-stats{gap:18px} .hd-stats .n{font-size:21px}
    .grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
    .badge{font-size:20px} .ctop{padding:15px 17px 13px} .cbody{padding:13px 17px 14px}
  }
  @media(max-width:760px){
    .sortbar,.marketbar{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;margin-left:-15px;margin-right:-15px;padding-left:15px;padding-right:15px}
    .sortbar::-webkit-scrollbar,.marketbar::-webkit-scrollbar{display:none}
    .sortbtn,.mktbtn,.viewbtn{min-height:44px;flex:none}
    .pg{min-height:44px;min-width:44px}
    .search input{min-height:48px}
  }
  @media(max-width:480px){ .grid{grid-template-columns:1fr} h1{font-size:25px} .hd-stats{gap:14px 20px} }
```

- [ ] **Step 5: header markup + spectrum + stats + thead** — ใน `indexHtml`:

5a. เหนือ `const indexHtml` เพิ่ม:

```js
// สเปกตรัมหัวเว็บ = สีแบรนด์จริงของทุกหุ้น เรียงตาม hue (spec §5.1) — โมโนโครมทั้งหน้า สีมาจากหุ้นเท่านั้น
const hueOf = (hex) => {
  const [r, g, b] = bt.hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return -1;
  const d = mx - mn;
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
const _spectrumSrc = reports.map((r) => r.accent).filter(Boolean).filter((c) => hueOf(c) >= 0).sort((a, b) => hueOf(a) - hueOf(b));
const spectrum = _spectrumSrc.filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 96)) === 0).slice(0, 96);
const spectrumHtml = spectrum.length ? `<div id="spectrum">${spectrum.map((c) => `<i style="background:${escAttr(c)}"></i>`).join('')}</div>` : '';
```

5b. แทน header เดิมใน template:

```html
    <header>${spectrumHtml}<div class="hd-in">
      <span class="tag">Stock Analysis</span>
      <h1>รายงานวิเคราะห์หุ้น</h1>
      <div class="sub">Fair Value · Margin of Safety · จุดเข้าซื้อ · ผลตอบแทนคาดการณ์ 3 ปี</div>
      <div class="hd-stats">
        <div><span class="n">${reports.length}</span><span class="l">รายงาน</span></div>
        <div><span class="n">${mktCount.TH}</span><span class="l">ตลาดไทย</span></div>
        <div><span class="n">${mktCount.US}</span><span class="l">ตลาดสหรัฐ</span></div>
        <div><span class="n">${fmtDate(nowISO)}</span><span class="l">อัปเดตล่าสุด</span></div>
      </div>
    </div></header>${searchBox}${marketBar}${sortBar}
```

(`mktCount` ประกาศอยู่เหนือ `marketBar` แล้ว — ถ้าอยู่หลังจุดใช้ ให้ย้ายการประกาศขึ้น) และใน `<div class="grid">` เพิ่มหัวตารางก่อน cards:

```html
    <div class="grid">
      <div id="thead" aria-hidden="true"><span></span><span>บริษัท</span><span class="num">MOS</span><span class="num">Upside</span><span class="num">P/E</span><span class="num">Yield</span><span class="num">ROE</span><span class="num">อัปเดต</span></div>
${reports.length ? cards : emptyState}
```

- [ ] **Step 6: toggle JS** — ใน `searchScript` (ใน IIFE เดียวกับ search) เพิ่มก่อนปิด:

```js
      // ── view toggle ไทล์ ⇄ ตาราง (spec §5.2) — <900px บังคับไทล์ (CSS จำกัดที่ media อยู่แล้ว) ──
      var vt = document.getElementById('viewtoggle');
      if (vt) {
        var setView = function (v) {
          grid.classList.toggle('is-table', v === 'table');
          [].forEach.call(vt.querySelectorAll('.viewbtn'), function (b) { b.classList.toggle('on', b.getAttribute('data-view') === v); });
          try { localStorage.setItem('idxview', v); } catch (e) {}
        };
        vt.addEventListener('click', function (e) { var b = e.target.closest('.viewbtn'); if (b) setView(b.getAttribute('data-view')); });
        var saved = 'tiles';
        try { saved = localStorage.getItem('idxview') || 'tiles'; } catch (e) {}
        if (saved === 'table') setView('table');
      }
```

- [ ] **Step 7: ตรวจสัญญา + verify เต็ม**

Run: `npm run build && node -e "const h=require('fs').readFileSync('dist/index.html','utf8');const m=h.match(/<a class=\"card\"[^>]*href=\"\.\/ZTS\.html\"[^>]*>/);if(!m)throw new Error('การ์ดผิดสัญญา');['data-market','data-mos','style=\"--c:'].forEach(k=>{if(!m[0].includes(k))throw new Error('ขาด '+k)});console.log('card contract ✅')" && node -e "const r=JSON.parse(require('fs').readFileSync('reports.json','utf8'));const k=Object.keys(r[0]).sort().join(',');if(k!=='desc,file,hash,metrics,name,symbol,title,updated')throw new Error('manifest schema เปลี่ยน: '+k);console.log('manifest schema ✅')" && npm run verify`
Expected: card contract ✅ · manifest schema ✅ · verify ผ่าน 10 ขั้น

- [ ] **Step 8: ดูจริง** — `http://localhost:8788/` ไทล์สีต่างกันต่อหุ้น · กด "ตาราง" → คอลัมน์ตรงหัว · ค้นหา/กรอง/เรียง/แบ่งหน้า ทำงาน · reload คงโหมดเดิม (localStorage)

- [ ] **Step 9: Commit**

```bash
git add build.js && git commit -m "feat: หน้าแรกไทล์สี + view toggle ตาราง + สเปกตรัม/สถิติ (spec §5)"
```

---

### Task 7: เก็บกวาด + verify เต็ม + audit มือถือแบบวัด + เปิดให้เจ้าของดู

**Files:**
- Delete: `_mockup/` ทั้งโฟลเดอร์ · `tools/mockup.js` · `tools/mockup-index.js` (นั่งร้านเลือกดีไซน์ — spec §6)
- Keep: `.claude/launch.json`

- [ ] **Step 1: ลบนั่งร้าน** — `rm -rf _mockup tools/mockup.js tools/mockup-index.js` (ไฟล์พวกนี้ untracked — ไม่ต้อง git rm)

- [ ] **Step 2: verify เต็ม + build ใหม่** — `npm run verify` → ผ่าน 10 ขั้น

- [ ] **Step 3: audit มือถือแบบวัด (spec §9.3b)** — เปิด preview 375×812 แล้ววัดด้วย JS ทั้ง `/(ทั้ง 2 โหมดไม่ต้อง — มือถือมีแต่ไทล์)` และ `/ZTS.html`, `/CPN.html`:

```js
// รันใน console/javascript_tool — ทุกหน้า ต้องได้ overflow:0, smallTaps:0
var out=[...document.querySelectorAll('body *')].filter(e=>{const b=e.getBoundingClientRect();if(b.width<=0||b.right<=innerWidth+1)return false;let p=e.parentElement;while(p){const o=getComputedStyle(p).overflowX;if(o==='auto'||o==='scroll')return false;p=p.parentElement}return true});
var taps=[...document.querySelectorAll('a,button,input')].filter(e=>{const b=e.getBoundingClientRect();return b.height>0&&b.height<44});
JSON.stringify({overflow:out.length, smallTaps:taps.length});
```

และวัดป้าย gauge ที่ใบ marker ชิดกัน (BH หรือ TER): rect เต็มของ `#mCur .lab` กับ `#mFair .lab` — ต้อง `hOverlap===0 || vOverlap===0`

- [ ] **Step 4: เกณฑ์เสร็จข้อ 4 ของ spec** — เปิดรายงานสีต่างกัน ≥5 ใบ (ZTS เขียว / CPN แดง / AAPL ฟ้า / CAT ทอง / FIVE บานเย็น) ดูว่าอ่านออกทุกใบ ไม่มีจุดสีตีกัน

- [ ] **Step 5: Commit + สรุปให้เจ้าของ**

```bash
git add -A && git commit -m "chore: ลบนั่งร้าน mockup — จบงาน implement GUI redesign"
```

แล้วเปิด `http://localhost:8788/` ให้เจ้าของดูของจริงทั้งระบบ — **หยุดรอเจ้าของอนุมัติก่อน push** (`npm run verify && git push origin HEAD:main` เป็นคำสั่งของเจ้าของ ไม่ใช่ของ agent)
