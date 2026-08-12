# Stock Tag System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้หุ้นทั้ง 908 ตัวมี tag ธีมการลงทุนจากคลังคำศัพท์ที่ควบคุมได้ 80–120 คำ · คลิก tag → หน้ารวมหุ้นในธีมนั้น · ค้นหา "AI" → เห็นรายการหุ้น AI ทั้งหมด

**Architecture:** เก็บ tag เป็น sidecar JSON 2 ไฟล์ที่ราก (`tags-vocab.json` = คลัง · `tags.json` = การติดต่อหุ้น) แล้ว **inject ตอน build ลง `dist/` เท่านั้น ไม่แตะไฟล์ใน `reports/`** เพราะ `freshHash` จะทำให้ `updated` ของทั้ง 908 ไฟล์เด้งพร้อมกัน (พังการเรียงหน้าแรก + dedup 7 วัน + staleness) · โมดูลกลาง `tools/tag-lib.js` เป็นที่เดียวที่รู้ schema — build/gate/CLI เรียกใช้ร่วมกัน

**Tech Stack:** Node ≥20.19 · ไม่มี dependency ภายนอก (กติการีโป) · CommonJS · Cloudflare Workers Static Assets

**Spec:** [docs/superpowers/specs/2026-08-12-stock-tag-system-design.md](../specs/2026-08-12-stock-tag-system-design.md)

## Global Constraints

- **ห้ามแก้ไฟล์ใน `reports/` เด็ดขาด** — ทุกอย่าง inject ตอน build ลง `dist/` (spec §2.1)
- **`freshHash` ต้องไม่ขึ้นกับ tag** — เปลี่ยน `tags.json` แล้ว `updated` ของทุกรายงานต้องไม่ขยับ
- **หน้า tag ต้องอยู่ `dist/tag/`** ห้ามอยู่รากของ `dist/` — `check-site.js:204` มองไฟล์ `.html` ในรากว่าเป็นรายงาน (spec §2.3)
- **build ผ่อนปรน / gate บังคับ** — หุ้นไม่มี tag → build คงป้ายเดิม+log ไม่ throw · การบังคับอยู่ที่ E40 + `tags-test`
- **`tools/tag-apply.js` เป็นทางเข้าเดียวที่เขียน `tags.json`** — ห้ามแก้มือ ห้าม worker เขียนเอง (บทเรียน `seeds.json` race)
- `matchTagQuery` ต้องเป็น **ES5 pure function ไม่มี closure** — ถูก embed เป็นข้อความลงสคริปต์หน้า index ที่รันในเบราว์เซอร์
- slug ต้องตรง `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` · tag ต่อหุ้น 1–3 · ขั้นต่ำ 3 หุ้นต่อ tag
- ทุก commit ลงท้าย `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **ห้าม push จนกว่าเจ้าของจะอ่านรายงานสรุป (Task 12)** — งานนี้เป็นการแก้โครงสร้างระบบ ไม่เข้าขอบเขต auto-push (CLAUDE.md §5)
- รันเทสด้วย `node test/<file>.js` — ทุกไฟล์เทสใช้ helper `ok(cond, desc)` แบบเดียวกับที่มีอยู่ และ `process.exit(1)` เมื่อ fail

---

## File Structure

| ไฟล์ | สร้าง/แก้ | หน้าที่เดียว |
|---|---|---|
| `tags-vocab.json` | สร้าง | คลังคำศัพท์ที่อนุมัติแล้ว (ข้อมูล) |
| `tags.json` | สร้าง | symbol → slug[] + คิวขอคำศัพท์ (ข้อมูล) |
| `tools/tag-lib.js` | สร้าง | **ที่เดียวที่รู้ schema tag** — โหลด/ตรวจ/จับคู่คำค้น |
| `tools/tag-apply.js` | สร้าง | CLI ทางเข้าเดียวที่เขียน `tags.json` |
| `test/tags-test.js` | สร้าง | ความถูกต้องของข้อมูล tag ระดับคลัง |
| `test/tag-apply-test.js` | สร้าง | พฤติกรรม CLI (ปฏิเสธ input เสียโดยไม่เขียนไฟล์) |
| `build.js` | แก้ | inject แถว tag · `data-tags` · สคริปต์กรอง/ค้นหา · สร้างหน้า `dist/tag/*` · sitemap |
| `_template/dashboard.css` | แก้ | `.tag` เป็นลิงก์ได้ |
| `test/check-reports.js` | แก้ | E40 · W13 · `opts.tagData` |
| `test/self-test.js` | แก้ | พิสูจน์ว่า E40/W13 ยิงจริง |
| `test/build-test.js` | แก้ | `renderTagRow` · `matchTagQuery` · `freshHash` ไม่ขึ้นกับ tag |
| `test/check-site.js` | แก้ | ลิงก์ tag ไม่ตาย · หน้า tag ครบ · ไม่มีไฟล์หลุดมาที่ราก dist |
| `package.json` | แก้ | `test:tags` · `test:tagapply` · `verify` 13 ขั้น |
| `_template/skeleton-{th,us}.html` | แก้ | ตัด `{{SECTOR_TAG}}` / `{{NICHE_TAG}}` |
| `.claude/skills/stock-analyzer/SKILL.md` · `_template/agent-prompt.md` | แก้ | lifecycle ของ tag ต่อโหมด |
| `CLAUDE.md` · `docs/templates.md` · `docs/quality-gate.md` | แก้ | เอกสาร |

**ลำดับบังคับ:** Task 1–6 พัฒนาโค้ดด้วย **คลัง seed 12 slug + หุ้นตัวอย่าง 20 ตัว** เพื่อให้เทสรันได้จริง → Task 7 แทนคลัง seed ด้วยคลังจริง ~100 → Task 8 ติด tag ครบ 908 → Task 9 เปิด gate

---

### Task 1: `tools/tag-lib.js` — โมดูลกลางที่รู้ schema

**Files:**
- Create: `tools/tag-lib.js`
- Create: `tags-vocab.json` (seed 12 slug)
- Create: `tags.json` (โครงเปล่า)
- Test: `test/tags-test.js`
- Modify: `package.json` (เพิ่ม script `test:tags`)

**Interfaces:**
- Consumes: ไม่มี (งานแรก)
- Produces:
  - `loadVocab(file?) → { version:number, list:Array<{slug,label,aliases:string[],desc:string}>, bySlug:Map<string,object> }`
  - `loadTags(file?) → { vocabVersion:number, tags:Record<string,string[]>, requests:Array<object> }`
  - `validateVocab(vocab) → string[]` (ว่าง = ผ่าน)
  - `validateAssignment(symbol, slugs, vocab) → string[]`
  - `tagsOf(symbol, tagData) → string[]`
  - `membersOf(tagData) → Map<string, string[]>`
  - `matchTagQuery(q, vocabList) → string[]` (ES5 pure — ถูก embed ลงเบราว์เซอร์)
  - ค่าคงที่: `VOCAB_FILE`, `TAGS_FILE`, `SLUG_RE`, `MAX_TAGS`, `MIN_MEMBERS`

- [ ] **Step 1: สร้างไฟล์ข้อมูลตั้งต้น**

`tags-vocab.json` — คลัง seed สำหรับพัฒนา (Task 7 จะแทนด้วยของจริง) เลือกให้ครอบหุ้นที่มีอยู่จริงและมีเคสทดสอบครบ (ธีมที่มีคำว่า `ai`, ธีมภาษาไทย, ธีมที่ label มี `&`):

```json
{
  "version": 1,
  "tags": [
    { "slug": "ai-datacenter", "label": "AI Data Center", "aliases": ["ai", "เอไอ", "ดาต้าเซ็นเตอร์", "data center", "hyperscaler"], "desc": "ผู้ได้ประโยชน์จากการสร้างคลัสเตอร์ AI" },
    { "slug": "optical-photonics", "label": "Optical & Photonics", "aliases": ["optical", "photonics", "cpo", "transceiver", "ออปติก"], "desc": "ชิ้นส่วนและระบบส่งข้อมูลด้วยแสง" },
    { "slug": "semiconductor-mfg", "label": "Semiconductor Manufacturing", "aliases": ["semiconductor", "semi", "foundry", "wafer", "เซมิคอนดักเตอร์"], "desc": "ผู้ผลิตชิปและเครื่องมือผลิตชิป" },
    { "slug": "power-grid", "label": "Power Grid & Electrification", "aliases": ["grid", "electrification", "transmission", "ไฟฟ้า", "สายส่ง"], "desc": "โครงข่ายไฟฟ้าและอุปกรณ์แปลงจ่ายไฟ" },
    { "slug": "nuclear-smr", "label": "Nuclear & SMR", "aliases": ["nuclear", "smr", "uranium", "นิวเคลียร์", "ยูเรเนียม"], "desc": "พลังงานนิวเคลียร์และเตาปฏิกรณ์ขนาดเล็ก" },
    { "slug": "glp-1", "label": "GLP-1 & Obesity", "aliases": ["glp-1", "glp1", "obesity", "ลดน้ำหนัก", "เบาหวาน"], "desc": "ยากลุ่ม GLP-1 และห่วงโซ่การผลิต" },
    { "slug": "medical-devices", "label": "Medical Devices", "aliases": ["medical device", "devices", "เครื่องมือแพทย์"], "desc": "อุปกรณ์และเครื่องมือทางการแพทย์" },
    { "slug": "cybersecurity", "label": "Cybersecurity", "aliases": ["cyber", "security", "ไซเบอร์", "ความปลอดภัย"], "desc": "ซอฟต์แวร์และบริการความมั่นคงปลอดภัยไซเบอร์" },
    { "slug": "defense-rearm", "label": "Defense & Rearmament", "aliases": ["defense", "defence", "aerospace", "กลาโหม", "การบิน"], "desc": "อุตสาหกรรมป้องกันประเทศและการบิน" },
    { "slug": "thai-consumption", "label": "การบริโภคในประเทศไทย", "aliases": ["thai consumption", "อุปโภคบริโภค", "ค้าปลีก", "retail"], "desc": "ธุรกิจที่รายได้ผูกกับกำลังซื้อในประเทศไทย" },
    { "slug": "thai-tourism", "label": "ท่องเที่ยวไทย", "aliases": ["tourism", "hotel", "airline", "ท่องเที่ยว", "โรงแรม"], "desc": "ธุรกิจที่รายได้ผูกกับนักท่องเที่ยวเข้าไทย" },
    { "slug": "dividend-income", "label": "Dividend & Income", "aliases": ["dividend", "aristocrat", "reit", "ปันผล", "กองทรัสต์"], "desc": "หุ้นที่จุดขายหลักคือกระแสเงินปันผลสม่ำเสมอ" }
  ]
}
```

`tags.json` — โครงเปล่า:

```json
{
  "vocabVersion": 1,
  "tags": {},
  "requests": []
}
```

- [ ] **Step 2: เขียนเทสที่ยังไม่ผ่าน — schema + validate**

สร้าง `test/tags-test.js`:

```js
#!/usr/bin/env node
'use strict';
/**
 * tags-test.js — ความถูกต้องของข้อมูล tag (tags-vocab.json + tags.json)
 * ตรวจสิ่งที่ check-reports (per-file) มองไม่เห็น: bijection ทั้งสองทาง · dangling slug ·
 * alias ชนกัน · ขนาดกลุ่ม · ความสอดคล้องกับ symbol-map
 * รัน: node test/tags-test.js  (npm run test:tags)
 */
const fs = require('fs');
const path = require('path');
const T = require('../tools/tag-lib.js');

const ROOT = path.join(__dirname, '..');
let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };

console.log('\n🏷  tags-test: ความถูกต้องของข้อมูล tag\n');

// ── A) schema ของคลัง ──
const vocab = T.loadVocab();
ok(T.validateVocab(vocab).length === 0, 'tags-vocab.json ผ่าน schema: ' + (T.validateVocab(vocab)[0] || ''));
ok(vocab.list.length > 0, `คลังมี ${vocab.list.length} slug`);

// slug ซ้ำ / รูปแบบผิด / label ว่าง — ใช้ fixture สังเคราะห์
const mkVocab = (list) => ({ version: 1, list, bySlug: new Map(list.map((e) => [e.slug, e])) });
const E = (slug, label, aliases) => ({ slug, label, aliases: aliases || [], desc: 'd' });

ok(T.validateVocab(mkVocab([E('a-b', 'A'), E('a-b', 'B')])).some((m) => /ซ้ำ/.test(m)), 'จับ slug ซ้ำในคลัง');
ok(T.validateVocab(mkVocab([E('A-B', 'A')])).some((m) => /รูปแบบ/.test(m)), 'จับ slug ที่มีตัวพิมพ์ใหญ่');
ok(T.validateVocab(mkVocab([E('a b', 'A')])).some((m) => /รูปแบบ/.test(m)), 'จับ slug ที่มีช่องว่าง');
ok(T.validateVocab(mkVocab([E('a-b', '')])).some((m) => /label/.test(m)), 'จับ label ว่าง');
ok(T.validateVocab(mkVocab([E('a-b', 'A', ['x']), E('c-d', 'C', ['x'])])).some((m) => /alias/.test(m)),
   'จับ alias ที่ชนกันข้าม slug');

// ── B) validateAssignment ──
const V = mkVocab([E('ai-datacenter', 'AI Data Center', ['ai']), E('power-grid', 'Power Grid', ['grid'])]);
ok(T.validateAssignment('LITE', ['ai-datacenter'], V).length === 0, 'assignment ถูกต้อง → ไม่มี error');
ok(T.validateAssignment('LITE', ['ไม่มีจริง'], V).some((m) => /ไม่อยู่ในคลัง/.test(m)), 'จับ slug นอกคลัง');
ok(T.validateAssignment('LITE', [], V).some((m) => /อย่างน้อย 1/.test(m)), 'จับ 0 slug');
ok(T.validateAssignment('LITE', ['ai-datacenter', 'power-grid', 'ai-datacenter', 'power-grid'], V)
   .some((m) => /เกิน 3/.test(m)), 'จับเกิน 3 slug');
ok(T.validateAssignment('LITE', ['ai-datacenter', 'ai-datacenter'], V).some((m) => /ซ้ำ/.test(m)), 'จับ slug ซ้ำกันเอง');

console.log('\n' + '─'.repeat(50));
console.log(`tags-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ ข้อมูล tag มีปัญหา\n'); process.exit(1); }
console.log('\n✅ ข้อมูล tag ถูกต้อง\n'); process.exit(0);
```

- [ ] **Step 3: รันเทสให้แน่ใจว่าล้มเหลว**

```bash
node test/tags-test.js
```

Expected: FAIL — `Cannot find module '../tools/tag-lib.js'`

- [ ] **Step 4: เขียน `tools/tag-lib.js`**

```js
'use strict';
/**
 * tag-lib.js — ที่เดียวที่รู้ว่า tag ถูกเก็บยังไง
 *
 * เหตุผลที่แยกเป็นโมดูล: build.js (inject+หน้า tag) · check-reports.js (E40/W13) ·
 * tag-apply.js (CLI) · tags-test.js ต้องอ่าน schema เดียวกัน — เขียนซ้ำ 4 ที่แล้ววันหนึ่ง
 * schema เปลี่ยน ตัวที่หลุดจะ "ไม่เจอ" แบบเงียบ ๆ ไม่ throw (บทเรียนเดียวกับ report-meta.js)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VOCAB_FILE = path.join(ROOT, 'tags-vocab.json');
const TAGS_FILE = path.join(ROOT, 'tags.json');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TAGS = 3;      // เพดาน tag ต่อหุ้น
const MIN_MEMBERS = 3;   // ขั้นต่ำสมาชิกต่อ tag (ต่ำกว่านี้ = warning — กัน singleton กลับมา)

function loadVocab(file) {
  const raw = JSON.parse(fs.readFileSync(file || VOCAB_FILE, 'utf8'));
  const list = Array.isArray(raw.tags) ? raw.tags : [];
  return { version: Number(raw.version) || 0, list, bySlug: new Map(list.map((e) => [e.slug, e])) };
}

function loadTags(file) {
  const raw = JSON.parse(fs.readFileSync(file || TAGS_FILE, 'utf8'));
  return {
    vocabVersion: Number(raw.vocabVersion) || 0,
    tags: raw.tags && typeof raw.tags === 'object' ? raw.tags : {},
    requests: Array.isArray(raw.requests) ? raw.requests : [],
  };
}

/** ตรวจคลัง — คืนรายการข้อความ error (ว่าง = ผ่าน) */
function validateVocab(vocab) {
  const errs = [], seenSlug = new Set(), seenAlias = new Map();
  for (const e of vocab.list) {
    if (!e || typeof e.slug !== 'string' || !SLUG_RE.test(e.slug)) { errs.push(`slug รูปแบบผิด: ${JSON.stringify(e && e.slug)}`); continue; }
    if (seenSlug.has(e.slug)) errs.push(`slug ซ้ำในคลัง: ${e.slug}`);
    seenSlug.add(e.slug);
    if (typeof e.label !== 'string' || !e.label.trim()) errs.push(`${e.slug}: label ว่าง`);
    for (const a of (e.aliases || [])) {
      const k = String(a).toLowerCase().trim();
      if (!k) continue;
      if (seenAlias.has(k) && seenAlias.get(k) !== e.slug) errs.push(`alias "${k}" ชนกัน: ${seenAlias.get(k)} กับ ${e.slug}`);
      seenAlias.set(k, e.slug);
    }
  }
  return errs;
}

/** ตรวจการติด tag ของหุ้นตัวหนึ่ง — คืนรายการข้อความ error (ว่าง = ผ่าน) */
function validateAssignment(symbol, slugs, vocab) {
  const errs = [];
  if (!Array.isArray(slugs) || slugs.length < 1) { errs.push(`${symbol}: ต้องมี tag อย่างน้อย 1 ตัว`); return errs; }
  if (slugs.length > MAX_TAGS) errs.push(`${symbol}: มี ${slugs.length} tag เกิน ${MAX_TAGS}`);
  if (new Set(slugs).size !== slugs.length) errs.push(`${symbol}: มี slug ซ้ำกันเอง`);
  for (const s of slugs) if (!vocab.bySlug.has(s)) errs.push(`${symbol}: slug "${s}" ไม่อยู่ในคลัง`);
  return errs;
}

const tagsOf = (symbol, tagData) => (tagData && tagData.tags && tagData.tags[symbol]) || [];

/** slug → รายชื่อหุ้น (เรียงชื่อ) */
function membersOf(tagData) {
  const m = new Map();
  for (const sym of Object.keys(tagData.tags).sort()) {
    for (const s of tagData.tags[sym]) { if (!m.has(s)) m.set(s, []); m.get(s).push(sym); }
  }
  return m;
}

/**
 * matchTagQuery — จับคู่คำค้นกับ tag
 * ★ ES5 ล้วน ไม่มี closure — build.js เอา String(matchTagQuery) ไปฝังในสคริปต์หน้า index
 *   ที่รันในเบราว์เซอร์ ⇒ ห้ามใช้ const/let/arrow/spread และห้ามอ้างตัวแปรนอกฟังก์ชัน
 * ละติน = ต้องขึ้นต้นคำ (กัน "ai" ไปแมตช์ Thailand/retail/chain)
 * ไทย    = substring (ภาษาไทยไม่มีเว้นวรรคระหว่างคำ — alias ไทยต้องเป็นคำเฉพาะพอ)
 */
function matchTagQuery(q, vocabList) {
  var s = String(q == null ? '' : q).toLowerCase().replace(/\s+/g, ' ').trim();
  if (s.length < 2) return [];
  var words = s.split(' '), out = [];
  for (var i = 0; i < vocabList.length; i++) {
    var e = vocabList[i];
    var hay = [String(e.label)].concat(e.aliases || []);
    var allOk = true;
    for (var w = 0; w < words.length; w++) {
      var needle = words[w], hit = false;
      for (var h = 0; h < hay.length && !hit; h++) {
        var t = String(hay[h]).toLowerCase();
        if (/[฀-๿]/.test(needle)) { if (t.indexOf(needle) !== -1) hit = true; }
        else {
          var at = t.indexOf(needle);
          while (at !== -1) {
            if (at === 0 || /[^a-z0-9]/.test(t.charAt(at - 1))) { hit = true; break; }
            at = t.indexOf(needle, at + 1);
          }
        }
      }
      if (!hit) { allOk = false; break; }
    }
    if (allOk) out.push(e.slug);
  }
  return out;
}

module.exports = {
  loadVocab, loadTags, validateVocab, validateAssignment, tagsOf, membersOf, matchTagQuery,
  VOCAB_FILE, TAGS_FILE, SLUG_RE, MAX_TAGS, MIN_MEMBERS,
};
```

- [ ] **Step 5: รันเทสให้ผ่าน**

```bash
node test/tags-test.js
```

Expected: PASS — `tags-test: 13/13 ผ่าน`

- [ ] **Step 6: เพิ่ม npm script**

ใน `package.json` ส่วน `scripts` เพิ่มบรรทัดหลัง `"test:prep"`:

```json
    "test:tags": "node test/tags-test.js",
```

> ยัง **ไม่** ใส่ใน `verify` — เพราะ check ความครบ 908 ตัวจะเข้ามาใน Task 9 หลังติด tag ครบแล้ว ถ้าใส่ตอนนี้ verify จะแดงตลอดเฟส 1–3

- [ ] **Step 7: Commit**

```bash
git add tools/tag-lib.js tags-vocab.json tags.json test/tags-test.js package.json && git commit -m "$(printf 'feat: tag-lib โมดูลกลางที่รู้ schema tag + คลัง seed 12 slug\n\nที่เดียวที่รู้ว่า tag เก็บยังไง — build/gate/CLI เรียกร่วมกัน กันปัญหาแบบ\nreport-meta.js (schema เปลี่ยนแล้วตัวที่หลุดไม่ throw แต่ไม่เจอเงียบ ๆ)\n\nmatchTagQuery เขียน ES5 ล้วนไม่มี closure เพราะ build จะเอาไปฝังในสคริปต์\nหน้า index ที่รันในเบราว์เซอร์ · ละตินต้องขึ้นต้นคำ (กัน "ai" แมตช์ Thailand)\nไทยใช้ substring (ไม่มีเว้นวรรคระหว่างคำ)\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 2: `tools/tag-apply.js` — CLI ทางเข้าเดียวที่เขียน `tags.json`

**Files:**
- Create: `tools/tag-apply.js`
- Test: `test/tag-apply-test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `tag-lib.js` → `loadVocab`, `loadTags`, `validateAssignment`, `TAGS_FILE`
- Produces:
  - CLI: `node tools/tag-apply.js <SYM> <slug…>` · `--keep` · `--request "<ธีม>"` · `--rename <OLD> <NEW>` · `--prune`
  - export `applyTags({ symbol, slugs, vocab, data, reportsDir }) → { ok:boolean, errors:string[], data:object }` (pure — ไม่แตะดิสก์)
  - export `writeTags(data, file)` (เขียน atomic + key เรียง)

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `test/tag-apply-test.js`:

```js
#!/usr/bin/env node
'use strict';
/**
 * tag-apply-test.js — พฤติกรรมของ CLI ที่เขียน tags.json
 * หัวใจ: input เสีย = ไม่เขียนไฟล์เลย (ไม่ใช่เขียนบางส่วน) เพราะไฟล์นี้เป็น
 * source of truth ของ tag ทั้งเว็บ — เขียนพังครึ่งทางแล้ว gate จะฟ้อง 908 บรรทัด
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../tools/tag-apply.js');

let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };

console.log('\n🧪 tag-apply-test: CLI เขียน tags.json\n');

// sandbox: reports ปลอม 2 ไฟล์ + คลังปลอม
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tagapply-'));
const repDir = path.join(tmp, 'reports');
fs.mkdirSync(repDir);
fs.writeFileSync(path.join(repDir, 'AAA.html'), '<html></html>');
fs.writeFileSync(path.join(repDir, 'BBB.html'), '<html></html>');
const list = [
  { slug: 'ai-datacenter', label: 'AI Data Center', aliases: ['ai'], desc: 'd' },
  { slug: 'power-grid', label: 'Power Grid', aliases: ['grid'], desc: 'd' },
];
const vocab = { version: 1, list, bySlug: new Map(list.map((e) => [e.slug, e])) };
const fresh = () => ({ vocabVersion: 1, tags: { AAA: ['ai-datacenter'] }, requests: [] });

// ── ปฏิเสธ input เสีย — ต้องไม่แตะ data ──
{
  const d = fresh();
  const r = A.applyTags({ symbol: 'AAA', slugs: ['ไม่มีจริง'], vocab, data: d, reportsDir: repDir });
  ok(!r.ok && r.errors.some((m) => /ไม่อยู่ในคลัง/.test(m)), 'slug นอกคลัง → ปฏิเสธ');
  ok(JSON.stringify(d.tags) === JSON.stringify({ AAA: ['ai-datacenter'] }), 'slug นอกคลัง → data เดิมไม่ถูกแตะ');
}
{
  const d = fresh();
  ok(!A.applyTags({ symbol: 'AAA', slugs: ['ai-datacenter', 'power-grid', 'ai-datacenter', 'power-grid'], vocab, data: d, reportsDir: repDir }).ok, '4 slug → ปฏิเสธ');
  ok(!A.applyTags({ symbol: 'AAA', slugs: ['ai-datacenter', 'ai-datacenter'], vocab, data: d, reportsDir: repDir }).ok, 'slug ซ้ำ → ปฏิเสธ');
  ok(!A.applyTags({ symbol: 'AAA', slugs: [], vocab, data: d, reportsDir: repDir }).ok, '0 slug → ปฏิเสธ');
  ok(!A.applyTags({ symbol: 'ZZZ', slugs: ['ai-datacenter'], vocab, data: d, reportsDir: repDir }).ok, 'ไม่มีไฟล์รายงาน → ปฏิเสธ');
}

// ── สำเร็จ ──
{
  const d = fresh();
  const r = A.applyTags({ symbol: 'BBB', slugs: ['power-grid', 'ai-datacenter'], vocab, data: d, reportsDir: repDir });
  ok(r.ok && JSON.stringify(r.data.tags.BBB) === JSON.stringify(['power-grid', 'ai-datacenter']), 'ติด tag สำเร็จ (คงลำดับที่สั่ง)');
}

// ── rename / prune / request ──
{
  const d = fresh();
  const r = A.renameSymbol(d, 'AAA', 'CCC');
  ok(r.tags.CCC && !r.tags.AAA, '--rename ย้าย key');
  ok(JSON.stringify(r.tags.CCC) === JSON.stringify(['ai-datacenter']), '--rename คงค่าเดิม');
}
{
  const d = fresh();
  d.tags.GONE = ['power-grid'];
  const r = A.pruneMissing(d, repDir);
  ok(!r.data.tags.GONE && r.data.tags.AAA, '--prune ลบเฉพาะ entry ที่ไม่มีไฟล์');
  ok(r.removed.length === 1 && r.removed[0] === 'GONE', '--prune รายงานตัวที่ลบ');
}
{
  const d = fresh();
  const r = A.addRequest(d, 'BBB', 'LiDAR ยานยนต์', '2026-08-14', 'UPDATE');
  ok(r.requests.length === 1 && r.requests[0].symbol === 'BBB', '--request ต่อท้ายคิว');
  ok(JSON.stringify(r.tags) === JSON.stringify({ AAA: ['ai-datacenter'] }), '--request ไม่แตะ tags');
}

// ── เขียนไฟล์: atomic + key เรียง + ปิดท้าย newline ──
{
  const f = path.join(tmp, 'tags.json');
  const d = { vocabVersion: 1, tags: { ZZZ: ['power-grid'], AAA: ['ai-datacenter'] }, requests: [] };
  A.writeTags(d, f);
  const txt = fs.readFileSync(f, 'utf8');
  ok(txt.endsWith('\n'), 'ไฟล์ปิดท้ายด้วย newline');
  ok(txt.indexOf('"AAA"') < txt.indexOf('"ZZZ"'), 'key เรียงตามตัวอักษร (diff อ่านง่าย)');
  ok(JSON.parse(txt).tags.AAA.length === 1, 'JSON parse กลับได้');
  ok(!fs.existsSync(f + '.tmp'), 'ไม่มีไฟล์ .tmp ค้าง');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + '─'.repeat(50));
console.log(`tag-apply-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ tag-apply.js มีพฤติกรรมผิด\n'); process.exit(1); }
console.log('\n✅ tag-apply.js ถูกต้อง\n'); process.exit(0);
```

- [ ] **Step 2: รันเทสให้แน่ใจว่าล้มเหลว**

```bash
node test/tag-apply-test.js
```

Expected: FAIL — `Cannot find module '../tools/tag-apply.js'`

- [ ] **Step 3: เขียน `tools/tag-apply.js`**

```js
#!/usr/bin/env node
'use strict';
/**
 * tag-apply.js — ทางเข้าเดียวที่เขียน tags.json
 *
 * ★ ห้ามแก้ tags.json ด้วยมือ และห้าม worker agent เขียนเอง
 *   เหตุผล: tools/pick-brand.js เป็น read-modify-write ไม่มี lock — รันขนาน 2 ตัว
 *   entry ทับหายโดย gate จับไม่ได้ (CLAUDE.md §10) ไฟล์นี้จึงถูกออกแบบให้
 *   controller รันทีละตัวแบบ sequential เท่านั้น
 *
 * ใช้:
 *   node tools/tag-apply.js <SYM> <slug…>          ติด/แทน tag
 *   node tools/tag-apply.js <SYM> --keep           ยืนยันคงเดิม (ไม่เขียนไฟล์)
 *   node tools/tag-apply.js <SYM> --request "ธีม"  เข้าคิวขอคำศัพท์ใหม่
 *   node tools/tag-apply.js --rename <OLD> <NEW>   ย้าย key ตาม symbol-map
 *   node tools/tag-apply.js --prune                ลบ entry ที่ไม่มีไฟล์รายงานแล้ว
 * exit 0 = สำเร็จ, 1 = ปฏิเสธ (ไม่เขียนไฟล์เลย)
 */
const fs = require('fs');
const path = require('path');
const T = require('./tag-lib.js');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');

/** ติด tag — pure: คืน data ใหม่ ไม่แตะดิสก์ · input เสีย = data เดิมไม่ถูกแตะเลย */
function applyTags({ symbol, slugs, vocab, data, reportsDir }) {
  const errors = T.validateAssignment(symbol, slugs, vocab);
  if (!fs.existsSync(path.join(reportsDir || REPORTS_DIR, symbol + '.html'))) {
    errors.push(`${symbol}: ไม่มีไฟล์ reports/${symbol}.html`);
  }
  if (errors.length) return { ok: false, errors, data };
  const next = { ...data, tags: { ...data.tags, [symbol]: slugs.slice() } };
  return { ok: true, errors: [], data: next };
}

function renameSymbol(data, oldSym, newSym) {
  if (!data.tags[oldSym]) return data;
  const tags = { ...data.tags, [newSym]: data.tags[oldSym] };
  delete tags[oldSym];
  return { ...data, tags };
}

function pruneMissing(data, reportsDir) {
  const dir = reportsDir || REPORTS_DIR;
  const tags = {}, removed = [];
  for (const sym of Object.keys(data.tags)) {
    if (fs.existsSync(path.join(dir, sym + '.html'))) tags[sym] = data.tags[sym];
    else removed.push(sym);
  }
  return { data: { ...data, tags }, removed };
}

function addRequest(data, symbol, theme, at, mode) {
  return { ...data, requests: data.requests.concat([{ symbol, theme, at, mode: mode || 'NEW' }]) };
}

/** เขียนแบบ atomic (temp → rename) + key เรียง — ล้มกลางคันแล้วไฟล์เดิมไม่เสียหาย */
function writeTags(data, file) {
  const target = file || T.TAGS_FILE;
  const tags = {};
  for (const k of Object.keys(data.tags).sort()) tags[k] = data.tags[k];
  const out = JSON.stringify({ vocabVersion: data.vocabVersion, tags, requests: data.requests }, null, 2) + '\n';
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, target);
}

module.exports = { applyTags, renameSymbol, pruneMissing, addRequest, writeTags };

// ---------- CLI ----------
function main() {
  const argv = process.argv.slice(2);
  const die = (msgs) => { for (const m of msgs) console.error('  ✗ ' + m); console.error('\n❌ ไม่เขียนไฟล์\n'); process.exit(1); };
  const vocab = T.loadVocab();
  let data = T.loadTags();
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 10);

  if (argv[0] === '--prune') {
    const r = pruneMissing(data, REPORTS_DIR);
    writeTags(r.data, T.TAGS_FILE);
    console.log(r.removed.length ? `✅ ลบ ${r.removed.length} entry: ${r.removed.join(', ')}` : '✅ ไม่มี entry ค้าง');
    return;
  }
  if (argv[0] === '--rename') {
    if (argv.length !== 3) die(['ใช้: --rename <OLD> <NEW>']);
    writeTags(renameSymbol(data, argv[1], argv[2]), T.TAGS_FILE);
    console.log(`✅ ย้าย ${argv[1]} → ${argv[2]}`);
    return;
  }
  const symbol = (argv[0] || '').toUpperCase();
  if (!symbol) die(['ต้องระบุ <SYM>']);
  if (argv[1] === '--keep') { console.log(`✅ ${symbol}: คงเดิม (${T.tagsOf(symbol, data).join(', ') || 'ยังไม่มี tag'})`); return; }
  if (argv[1] === '--request') {
    if (!argv[2]) die(['--request ต้องตามด้วยข้อความธีม']);
    writeTags(addRequest(data, symbol, argv[2], today, 'UPDATE'), T.TAGS_FILE);
    console.log(`✅ เข้าคิวขอคำศัพท์: ${symbol} — ${argv[2]}`);
    return;
  }
  const r = applyTags({ symbol, slugs: argv.slice(1), vocab, data, reportsDir: REPORTS_DIR });
  if (!r.ok) die(r.errors);
  writeTags(r.data, T.TAGS_FILE);
  console.log(`✅ ${symbol}: ${argv.slice(1).join(' · ')}`);
}

if (require.main === module) main();
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
node test/tag-apply-test.js
```

Expected: PASS — `tag-apply-test: 16/16 ผ่าน`

- [ ] **Step 5: ติด tag ให้หุ้นตัวอย่าง 20 ตัวเพื่อใช้พัฒนา Task 3–6**

```bash
for x in "LITE ai-datacenter optical-photonics" "COHR ai-datacenter optical-photonics" "AAOI ai-datacenter optical-photonics" "AAON ai-datacenter power-grid" "GNRC power-grid" "AAPL ai-datacenter" "ASML semiconductor-mfg" "CCJ nuclear-smr" "ABBV glp-1 dividend-income" "ABBNY power-grid" "A medical-devices" "ABNB thai-tourism" "AAI thai-consumption" "CPN thai-consumption" "BBL thai-consumption dividend-income" "IMO nuclear-smr" "JD thai-consumption" "NOK cybersecurity" "BABA thai-consumption" "GOOGL ai-datacenter cybersecurity"; do node tools/tag-apply.js $x || echo "SKIP $x"; done
```

Expected: บรรทัด `✅ <SYM>: …` ตัวไหนไม่มีไฟล์รายงานจะขึ้น `SKIP` — ยอมรับได้ ขอให้ได้อย่างน้อย 15 ตัว

```bash
node -e "const t=require('./tools/tag-lib.js').loadTags();console.log('ติดแล้ว',Object.keys(t.tags).length,'ตัว')"
```

- [ ] **Step 6: Commit**

```bash
git add tools/tag-apply.js test/tag-apply-test.js tags.json package.json && git commit -m "$(printf 'feat: tag-apply.js — ทางเข้าเดียวที่เขียน tags.json + ติด tag หุ้นตัวอย่าง 20 ตัว\n\nออกแบบให้ input เสีย = ไม่เขียนไฟล์เลย (ไม่ใช่เขียนบางส่วน) และเขียนแบบ atomic\nเพราะไฟล์นี้เป็น source of truth ของ tag ทั้งเว็บ\n\nห้ามแก้ tags.json ด้วยมือ/ห้าม worker เขียนเอง — pick-brand.js เป็นตัวอย่างของ\nread-modify-write ไม่มี lock ที่ทำ entry หายเมื่อรันขนาน (CLAUDE.md §10)\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

เพิ่มใน `package.json` ส่วน `scripts`:

```json
    "test:tagapply": "node test/tag-apply-test.js",
```

---

### Task 3: inject แถว tag ในหน้ารายงาน (dist)

**Files:**
- Modify: `build.js` (เพิ่ม `renderTagRow`, เรียกใน `decorateReport` ที่บรรทัด 447–458, export เพิ่ม)
- Modify: `_template/dashboard.css:27` (`.tag` รองรับการเป็นลิงก์)
- Test: `test/build-test.js` (ต่อท้ายก่อนบล็อกสรุป)

**Interfaces:**
- Consumes: `tag-lib.js` → `loadVocab`, `loadTags`, `tagsOf`
- Produces: `renderTagRow(html, { symbol, market, tagData, vocab }) → string`
  - 3 span (รายงานเดิม) → เก็บอันแรก แทนอัน 2–3 ด้วยชิป
  - 1 span (skeleton ใหม่) → เก็บอันแรก ต่อชิปท้าย
  - จำนวนอื่น / ไม่มี tag → คืน html เดิมไม่แตะ
  - ชิป href = `/tag/<slug>` · ป้ายตลาด href = `/?market=TH|US` (จาก `market` เท่านั้น ไม่ derive จากข้อความ)

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

ต่อท้าย `test/build-test.js` **ก่อน** บล็อก `console.log('\n' + '─'.repeat(50));`:

```js
// ── renderTagRow: แทนป้าย 2-3 ด้วยชิปจาก tags.json (dist เท่านั้น) ──
{
  const list = [
    { slug: 'ai-datacenter', label: 'AI Data Center', aliases: ['ai', 'เอไอ'], desc: 'd' },
    { slug: 'optical-photonics', label: 'Optical & Photonics', aliases: ['optical'], desc: 'd' },
    { slug: 'thai-consumption', label: 'การบริโภคในประเทศไทย', aliases: ['ค้าปลีก'], desc: 'd' },
  ];
  const vocab = { version: 1, list, bySlug: new Map(list.map((e) => [e.slug, e])) };
  const tagData = { vocabVersion: 1, tags: { LITE: ['ai-datacenter', 'optical-photonics'], CPN: ['thai-consumption'] }, requests: [] };
  const row = (spans) => `<header><div class="gdots"></div>\n    <div>\n      ${spans.map((s) => `<span class="tag">${s}</span>`).join('\n      ')}\n    </div>\n    <h1>X</h1></header>`;

  const out = b.renderTagRow(row(['NASDAQ: LITE', 'Technology • Optical', 'AI DC • CPO']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(out.includes('<a class="tag" href="/tag/ai-datacenter">AI Data Center</a>'), 'renderTagRow: ชิป tag เป็นลิงก์ /tag/<slug>');
  ok(out.includes('Optical &amp; Photonics'), 'renderTagRow: label ที่มี & ถูก escape');
  ok(out.includes('href="/?market=US"') && out.includes('NASDAQ: LITE'), 'renderTagRow: ป้ายตลาดเป็นลิงก์ ข้อความเดิม');
  ok(!out.includes('Technology • Optical') && !out.includes('AI DC • CPO'), 'renderTagRow: ป้าย free-text เดิมถูกแทนหมด');
  ok((out.match(/class="tag"/g) || []).length === 3, 'renderTagRow: ได้ 3 ป้าย (ตลาด + 2 tag)');

  // 17 เคส exchange พิเศษ — ข้อความต้องคงเป๊ะ ห้าม parse
  ['NASDAQ: ASML (ADR)', 'NYSE: CCJ / TSX: CCO', 'OTC Markets: FANUY (ADR)', 'NASDAQ: LANC → MZTI'].forEach((ex) => {
    const o = b.renderTagRow(row([ex, 'a', 'b']), { symbol: 'LITE', market: 'US', tagData, vocab });
    ok(o.includes('>' + ex + '<'), `renderTagRow: exchange พิเศษคงข้อความเป๊ะ — ${ex}`);
  });

  // market mapping มาจาก metrics.market ไม่ใช่ข้อความ (CCJ มี "TSX" ในข้อความแต่เป็นหุ้น US)
  const oCcj = b.renderTagRow(row(['NYSE: CCJ / TSX: CCO', 'a', 'b']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(oCcj.includes('href="/?market=US"'), 'renderTagRow: market มาจาก metrics.market ไม่ใช่ข้อความ exchange');
  const oTh = b.renderTagRow(row(['SET: CPN', 'a', 'b']), { symbol: 'CPN', market: 'TH', tagData, vocab });
  ok(oTh.includes('href="/?market=TH"') && oTh.includes('การบริโภคในประเทศไทย'), 'renderTagRow: หุ้นไทย → /?market=TH + label ไทย');

  // skeleton ใหม่ (1 span) → ต่อชิปท้าย
  const o1 = b.renderTagRow(row(['NASDAQ: LITE']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok((o1.match(/class="tag"/g) || []).length === 3, 'renderTagRow: 1 span (skeleton ใหม่) → ต่อชิปเป็น 3 ป้าย');

  // ไม่มี entry → คงป้ายเดิมครบ ไม่ throw (build ผ่อนปรน · gate บังคับ)
  const oNone = b.renderTagRow(row(['NYSE: ZZZ', 'Sector เดิม', 'Niche เดิม']), { symbol: 'ZZZ', market: 'US', tagData, vocab });
  ok(oNone.includes('Sector เดิม') && oNone.includes('Niche เดิม'), 'renderTagRow: ไม่มี entry → คงป้ายเดิม ไม่ throw');

  // จำนวน span ผิดแบบ → ไม่แตะ
  const o2 = b.renderTagRow(row(['NASDAQ: LITE', 'a']), { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(o2.includes('>a<'), 'renderTagRow: 2 span (โครงไม่รู้จัก) → ไม่แตะ');

  // idempotent
  const twice = b.renderTagRow(out, { symbol: 'LITE', market: 'US', tagData, vocab });
  ok(twice === out, 'renderTagRow: รันซ้ำได้ผลเท่าเดิม (idempotent)');
}

// ── freshHash ต้องไม่ขึ้นกับ tag — พิสูจน์ว่าไม่มี hash churn (spec §2.1) ──
{
  const src = doc('Claude Sonnet 5', WF);
  const h1 = b.freshHash(src);
  const h2 = b.freshHash(src); // tags.json เปลี่ยนไม่มีผล — freshHash รับแค่เนื้อไฟล์ต้นฉบับ
  ok(h1 === h2, 'freshHash: ขึ้นกับเนื้อไฟล์ต้นฉบับเท่านั้น');
  ok(b.freshHash(src.replace('<h1>X</h1>', '<h1>Y</h1>')) !== h1, 'freshHash: เนื้อหาเปลี่ยนจริง → hash เปลี่ยน');
}
```

- [ ] **Step 2: รันเทสให้แน่ใจว่าล้มเหลว**

```bash
node test/build-test.js
```

Expected: FAIL — `b.renderTagRow is not a function`

- [ ] **Step 3: เขียน `renderTagRow` ใน `build.js`**

แทรก **ก่อน** `function decorateReport(html, r) {` (บรรทัด ~447):

```js
// ── แถวป้ายบนหัวรายงาน: ป้ายตลาด (คงข้อความเดิม) + ชิป tag จาก tags.json ─────────
// inject เฉพาะใน dist — ไฟล์ต้นฉบับใน reports/ ไม่ถูกแตะ เพราะ freshHash จะทำให้
// updated ของทั้ง 908 ไฟล์เด้งพร้อมกัน (พังการเรียงหน้าแรก + dedup 7 วัน + staleness)
const TAG_RUN_RE = /(?:<span class="tag">[^<]*<\/span>\s*)+/;
const MARKET_HREF = { TH: '/?market=TH', US: '/?market=US' };
function renderTagRow(html, { symbol, market, tagData, vocab }) {
  const m = html.match(TAG_RUN_RE);
  if (!m) return html;
  const spans = [...m[0].matchAll(/<span class="tag">([^<]*)<\/span>/g)].map((x) => x[1]);
  // 3 span = รายงานเดิม (ตลาด+sector+niche) · 1 span = skeleton ใหม่ (ตลาดอย่างเดียว)
  // จำนวนอื่น = โครงที่ยังไม่รู้จัก → ไม่แตะ ปล่อยให้ gate เป็นตัวฟ้อง
  if (spans.length !== 3 && spans.length !== 1) return html;
  const slugs = tagData ? tagData.tags[symbol] || [] : [];
  if (!slugs.length) return html;                       // ไม่มี tag → คงป้ายเดิม (gate E40 เป็นตัวบังคับ)
  const href = MARKET_HREF[market];
  const mkt = href
    ? `<a class="tag" href="${href}">${esc(spans[0])}</a>`
    : `<span class="tag">${esc(spans[0])}</span>`;
  const chips = slugs
    .filter((s) => vocab.bySlug.has(s))
    .map((s) => `<a class="tag" href="/tag/${s}">${esc(vocab.bySlug.get(s).label)}</a>`);
  return html.replace(TAG_RUN_RE, [mkt, ...chips].join('\n      ') + '\n    ');
}
```

> `esc(spans[0])` ปลอดภัยกับ idempotency: รอบสองแถวเป็น `<a class="tag">` ซึ่ง `TAG_RUN_RE` (จับเฉพาะ `<span class="tag">`) ไม่แมตช์ → คืนค่าเดิม

- [ ] **Step 4: เรียกใช้ใน `decorateReport` + โหลดข้อมูล tag**

เพิ่มใกล้ต้นไฟล์ `build.js` หลังบรรทัด `const bt = require(...)` (หา `require` ก้อนบนสุด):

```js
const tagLib = require('./tools/tag-lib.js');
// โหลดครั้งเดียวต่อ process — ไฟล์หายก็ build ต่อได้ (ระบบ tag ยังไม่ติดตั้ง = ไม่มีชิป)
const TAG_VOCAB = (() => { try { return tagLib.loadVocab(); } catch { return { version: 0, list: [], bySlug: new Map() }; } })();
const TAG_DATA = (() => { try { return tagLib.loadTags(); } catch { return { vocabVersion: 0, tags: {}, requests: [] }; } })();
```

แก้ `decorateReport` (บรรทัด ~447) เพิ่มบรรทัดหลัง `h = injectSectionNav(h);`:

```js
  h = renderTagRow(h, { symbol: r.symbol, market: (r.metrics && r.metrics.market) || null, tagData: TAG_DATA, vocab: TAG_VOCAB });
```

เพิ่ม `renderTagRow` เข้า `module.exports` (บรรทัด ~526) ต่อท้ายรายการเดิม:

```js
module.exports = { extractMeta, extractMetrics, freshHash, injectModelCredit, injectContactFooter, injectTA, parseJsonScript, decorateReport, renderTagRow, pickHighlight, computeLeaders, HL_DEFS, AI_MODEL, AI_MAKER, expandReport, renderHead, renderEngine, validateReportData, THEME_DEFAULTS, deriveTheme, stripDecorEmoji, injectSectionNav };
```

- [ ] **Step 5: ทำให้ `.tag` เป็นลิงก์ได้**

แก้ `_template/dashboard.css` บรรทัด 27 — เติมท้าย selector เดิมและเพิ่มกฎใหม่:

```css
.tag{display:inline-block;font-family:var(--display);font-size:11.5px;font-weight:600;padding:4px 12px;border-radius:99px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(6px);margin-right:6px;position:relative;z-index:2}
a.tag{text-decoration:none;color:inherit;transition:background .14s,border-color .14s}
a.tag:hover{background:rgba(255,255,255,.28);border-color:rgba(255,255,255,.3)}
a.tag:focus-visible{outline:2px solid rgba(255,255,255,.8);outline-offset:2px}
```

- [ ] **Step 6: รันเทสให้ผ่าน**

```bash
node test/build-test.js
```

Expected: PASS — บรรทัด `✓ renderTagRow: …` ครบ 15 รายการ

- [ ] **Step 7: ตรวจว่า build จริงไม่พัง + hash ไม่ขยับ**

```bash
node -e "const m=JSON.parse(require('fs').readFileSync('reports.json','utf8'));require('fs').writeFileSync('/tmp/h-before.json',JSON.stringify(m.map(r=>[r.symbol,r.hash,r.updated])))" && node build.js >/dev/null && node -e "const a=JSON.parse(require('fs').readFileSync('/tmp/h-before.json','utf8')),m=JSON.parse(require('fs').readFileSync('reports.json','utf8'));const b=m.map(r=>[r.symbol,r.hash,r.updated]);const d=a.filter((x,i)=>JSON.stringify(x)!==JSON.stringify(b[i]));console.log(d.length?'❌ hash/updated เปลี่ยน '+d.length+' ตัว: '+JSON.stringify(d.slice(0,3)):'✅ hash + updated ทั้ง '+a.length+' ตัวไม่ขยับ')"
```

Expected: `✅ hash + updated ทั้ง 908 ตัวไม่ขยับ`

```bash
grep -c 'href="/tag/' dist/LITE.html
```

Expected: `2`

- [ ] **Step 8: Commit**

```bash
git add build.js _template/dashboard.css test/build-test.js && git commit -m "$(printf 'feat: inject แถวป้าย tag ในหน้ารายงาน (dist เท่านั้น)\n\nแทนป้าย free-text 2 อันด้วยชิปจาก tags.json · ป้ายตลาดคงข้อความเดิมเป๊ะ\nแค่ห่อเป็นลิงก์ — 17 รายงานมีข้อความพิเศษ (ADR/dual-listing/rename)\nจึงห้าม parse · ปลายทางมาจาก metrics.market ไม่ใช่ข้อความ (CCJ มี TSX\nในข้อความแต่เป็นหุ้น US)\n\nชิปชี้ /tag/<slug> ไม่ใช่ query param เพราะเป็น crawlable link ที่ Google\nเดินตามได้ · ยืนยัน hash + updated ทั้ง 908 ตัวไม่ขยับ (ไม่แตะ reports/)\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: `data-tags` บนการ์ด + ฟิลด์ `tags` ใน manifest + ตัวกรอง tag หน้าแรก

**Files:**
- Modify: `build.js` (การ์ด ~685 · manifest ~600/605 · สคริปต์ index ~800)
- Test: `test/build-test.js`

**Interfaces:**
- Consumes: `TAG_DATA`, `TAG_VOCAB` จาก Task 3
- Produces: การ์ดมี `data-tags="slug1 slug2"` · `reports.json` ทุก record มี `tags: string[]` · หน้าแรกรับ `?tag=<slug>` และ `?market=TH|US`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

ต่อท้าย `test/build-test.js` ก่อนบล็อกสรุป:

```js
// ── manifest + การ์ด index ต้องพก tag ──
{
  const man = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'reports.json'), 'utf8'));
  ok(man.every((r) => Array.isArray(r.tags)), 'reports.json: ทุก record มีฟิลด์ tags เป็น array');
  const lite = man.find((r) => r.symbol === 'LITE');
  ok(!lite || lite.tags.length >= 1, 'reports.json: LITE มี tag อย่างน้อย 1 ตัว');
}
```

- [ ] **Step 2: รันเทสให้แน่ใจว่าล้มเหลว**

```bash
node test/build-test.js
```

Expected: FAIL — `reports.json: ทุก record มีฟิลด์ tags เป็น array`

- [ ] **Step 3: เติม `tags` ลง record + manifest**

ใน `build.js` หา `const rec = { symbol, file: entry.name, ...extractMeta(...` (บรรทัด ~572) แล้วเพิ่มบรรทัดถัดไป:

```js
    rec.tags = tagLib.tagsOf(symbol, TAG_DATA);
```

แก้ manifest ทั้งสองก้อน (บรรทัด ~600 และ ~605) เพิ่ม `tags`:

```js
  JSON.stringify(reports.map(({ symbol, file, name, title, desc, updated, hash, metrics, tags }) => ({ symbol, file, name, title, desc, updated, hash, metrics, tags })), null, 2) + '\n'
```

```js
  JSON.stringify(reports.map(({ symbol, file, name, title, desc, updated, metrics, tags }) => ({ symbol, file, name, title, desc, updated, url: '/' + file, metrics, tags })), null, 2) + '\n'
```

- [ ] **Step 4: เติม `data-tags` บนการ์ด**

หา `const cardHtml = reports.map((r) => {` (บรรทัด ~682) เพิ่มก่อน `return`:

```js
  const tagAttr = (r.tags && r.tags.length) ? ` data-tags="${escAttr(r.tags.join(' '))}"` : '';
```

แล้วเติม `${tagAttr}` เข้าใน `<a class="card" …>` ต่อจาก `${marketAttr(r.metrics)}`:

```js
      <a class="card" style="--c:${c};--cd:${cd}" data-search="${escAttr((r.symbol + ' ' + r.name + ' ' + r.title + ' ' + (r.desc || '')).toLowerCase())}"${metricAttrs(r.metrics)}${marketAttr(r.metrics)}${tagAttr} href="./${encodeURIComponent(r.file)}">
```

- [ ] **Step 5: เพิ่ม `tagOK` + อ่าน URL param ในสคริปต์หน้า index**

ใน `searchScript` หา `var page = 1, market = 'all', orderMode = 'updated', selected = [];` แล้วแทนด้วย:

```js
      var page = 1, market = 'all', orderMode = 'updated', selected = [], tag = '';
      // ตัวกรองเริ่มต้นจาก URL — ลิงก์ ?tag=/?market= จากหน้ารายงานและหน้า tag ต้องมาถึงพร้อมกรองแล้ว
      (function () {
        var p = new URLSearchParams(location.search);
        var t = p.get('tag'); if (t && /^[a-z0-9-]+$/.test(t)) tag = t;
        var mk = p.get('market'); if (mk === 'TH' || mk === 'US') market = mk;
      })();
```

หา `function marketOK(c) {` แล้วเพิ่มฟังก์ชันถัดไป:

```js
      function tagOK(c) {
        if (!tag) return true;
        var v = c.getAttribute('data-tags');
        return !!v && (' ' + v + ' ').indexOf(' ' + tag + ' ') !== -1;
      }
```

แก้ `recompute()` บรรทัดกรอง:

```js
        filtered = cards.filter(function (c) { return marketOK(c) && tagOK(c) && searchOK(c); });
```

เพิ่มการซิงก์ URL — ต่อท้าย `recompute()` ก่อนปิดฟังก์ชัน:

```js
        var qs = [];
        if (tag) qs.push('tag=' + tag);
        if (market !== 'all') qs.push('market=' + market);
        history.replaceState(null, '', qs.length ? '?' + qs.join('&') : location.pathname);
```

- [ ] **Step 6: เพิ่มชิปแสดงตัวกรองที่ทำงานอยู่**

เพิ่มค่าคงที่ก่อน `searchScript` (หลัง `const noResult = …`):

```js
// คลังคำศัพท์ที่หน้า index ต้องใช้ (slug/label/aliases เท่านั้น — ตัด desc ทิ้ง ลดขนาดหน้า)
const tagVocabJson = JSON.stringify(TAG_VOCAB.list.map((e) => ({ slug: e.slug, label: e.label, aliases: e.aliases || [] })));
const activeTagBar = `
    <div class="tagbar" id="tagbar" hidden></div>`;
```

ใส่ `${activeTagBar}` ในเทมเพลตหน้า ต่อจาก `${noResult}` (หา `${noResult}` ใน template string ท้ายไฟล์)

ในสคริปต์ index เพิ่มหลังบล็อกอ่าน URL param:

```js
      var TAG_VOCAB = ${tagVocabJson};
      var tagbar = document.getElementById('tagbar');
      function labelOf(slug) {
        for (var i = 0; i < TAG_VOCAB.length; i++) if (TAG_VOCAB[i].slug === slug) return TAG_VOCAB[i].label;
        return slug;
      }
      function drawTagBar() {
        if (!tag) { tagbar.hidden = true; tagbar.innerHTML = ''; return; }
        tagbar.hidden = false;
        tagbar.innerHTML = '<span class="tchip on">\\uD83C\\uDFF7 ' + labelOf(tag) +
          ' <b>' + filtered.length + '</b> หุ้น <button type="button" class="tx" data-clear="1" aria-label="ล้างตัวกรองแท็ก">\\u2715</button></span>';
      }
      tagbar.addEventListener('click', function (e) {
        if (!e.target.closest('[data-clear]')) return;
        tag = ''; page = 1; recompute(); render(); drawTagBar();
      });
```

เรียก `drawTagBar()` ต่อท้ายทุกที่ที่เรียก `render()` ในตัว initialize (บรรทัดสุดท้ายของ IIFE) — หา `recompute(); render();` ตอนเริ่มแล้วเปลี่ยนเป็น:

```js
      recompute(); render(); drawTagBar();
```

เพิ่ม CSS ในบล็อก `<style>` ของหน้า index (ใกล้ `.search{`):

```css
  .tagbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
  .tchip{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:6px 12px;border-radius:99px;background:var(--card);box-shadow:var(--shadow);color:var(--ink)}
  .tchip b{font-weight:700}
  .tchip .tx{border:0;background:transparent;cursor:pointer;font-size:14px;line-height:1;color:var(--muted);padding:0 2px}
  .tchip .tx:hover{color:var(--ink)}
```

- [ ] **Step 7: รันเทสให้ผ่าน**

```bash
node build.js >/dev/null && node test/build-test.js
```

Expected: PASS

```bash
grep -c 'data-tags=' dist/index.html
```

Expected: จำนวน ≥ 15 (เท่าหุ้นที่ติด tag แล้ว)

- [ ] **Step 8: Commit**

```bash
git add build.js test/build-test.js reports.json && git commit -m "$(printf 'feat: การ์ด index พก data-tags + manifest มีฟิลด์ tags + ตัวกรอง ?tag=\n\nกรองฝั่ง client ทั้งหมด ต่อยอด marketOK/searchOK เดิม — ไม่ต้องแก้ Worker เลย\nซิงก์ตัวกรองกลับ URL ด้วย replaceState ⇒ ลิงก์ที่แชร์ออกไปเปิดมาแล้วกรองไว้แล้ว\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 5: ค้นหาด้วย tag (ชิปเสนอแท็ก + union ผลลัพธ์)

**Files:**
- Modify: `build.js` (embed `matchTagQuery` + แก้ `searchOK`/`recompute`)
- Test: `test/build-test.js`

**Interfaces:**
- Consumes: `tagLib.matchTagQuery` (Task 1) · `TAG_VOCAB`
- Produces: พิมพ์คำค้น → ผลลัพธ์ = ชื่อที่แมตช์ ∪ สมาชิกของ tag ที่แมตช์ · ชิป "แท็ก: X · N หุ้น" คลิกแล้วกรองเฉพาะ tag

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน — การ embed ฟังก์ชันลงหน้าเว็บ**

> ℹ️ **พฤติกรรมการจับคู่ของ `matchTagQuery` ถูกเทสครบแล้วใน `test/tags-test.js` (Task 1 — 21 assertion รวม static check บังคับ ES5-purity) ห้ามเขียนซ้ำที่นี่** สิ่งที่ task นี้ต้องพิสูจน์คือ **ฟังก์ชันเดินทางไปถึงหน้าเว็บได้จริงและยังทำงานเหมือนเดิมหลังถูก serialize** ซึ่งเป็นคนละเรื่องกัน

ต่อท้าย `test/build-test.js` ก่อนบล็อกสรุป:

```js
// ── การ embed matchTagQuery ลงสคริปต์หน้า index ──
// ตรรกะการจับคู่มีเทสครบใน test/tags-test.js แล้ว — ที่นี่ตรวจว่า "ข้อความฟังก์ชัน"
// ที่ถูก String() ไปฝังในหน้าเว็บ ยังกินได้และให้ผลเท่ากับตัวจริงใน Node
{
  const T = require('../tools/tag-lib.js');
  const src = String(T.matchTagQuery);
  ok(/^function matchTagQuery\s*\(/.test(src.trim()), 'embed: serialize แล้วยังเป็น function declaration (ฝังใน <script> ได้ตรง ๆ)');

  // ประกอบใหม่จากข้อความ เหมือนที่เบราว์เซอร์ทำ แล้วต้องได้ผลเท่ากับตัวจริง
  const revived = new Function(src + '; return matchTagQuery;')();
  const list = [
    { slug: 'ai-datacenter', label: 'AI Data Center', aliases: ['ai', 'เอไอ', 'data center'] },
    { slug: 'thai-tourism', label: 'ท่องเที่ยวไทย', aliases: ['airline', 'ท่องเที่ยว'] },
  ];
  ['ai', 'air', 'data cen', 'เอไอ', 'xyz', 'a'].forEach((q) => {
    ok(JSON.stringify(revived(q, list)) === JSON.stringify(T.matchTagQuery(q, list)),
       `embed: ผลจากข้อความที่ฝัง = ผลจากตัวจริง (q="${q}")`);
  });
}
```

- [ ] **Step 2: รันเทสให้แน่ใจว่าล้มเหลว**

```bash
node test/build-test.js
```

Expected: PASS — เทสชุดนี้ตรวจ `tag-lib.js` ที่มีอยู่แล้ว จึงผ่านทันที **ถ้าข้อไหนไม่ผ่าน แปลว่า `matchTagQuery` ไม่ปลอดภัยต่อการ embed ให้แก้ `tools/tag-lib.js` ก่อนไป Step 3** (ห้ามแก้เทสให้เข้ากับพฤติกรรมที่ผิด) · red step จริงของ task นี้อยู่ที่ Step 4 ซึ่งตรวจว่าฟังก์ชันไปโผล่ใน `dist/index.html`

- [ ] **Step 3: embed `matchTagQuery` + ชิปเสนอแท็กในสคริปต์ index**

ใน `build.js` เพิ่มค่าคงที่ข้าง `tagVocabJson`:

```js
// ฝังฟังก์ชันเดียวกับที่เทสใน Node ลงหน้าเว็บ — ห้ามเขียนตรรกะจับคู่ซ้ำสองที่
const matchTagQuerySrc = String(tagLib.matchTagQuery);
```

ในสคริปต์หน้า index เพิ่มหลัง `var TAG_VOCAB = …;`:

```js
      ${matchTagQuerySrc}
      // ผลค้นหา = ชื่อ/คำโปรยที่มีคำค้น ∪ สมาชิกของแท็กที่คำค้นแมตช์
      // (แยก data-tags ออกจาก data-search โดยตั้งใจ — ถ้ายัด tag ลง data-search
      //  ซึ่งเป็น indexOf substring พิมพ์ "ai" จะแมตช์ Thailand/retail/chain ทั้งหมด)
      var qTags = [];
      function suggestTags() {
        qTags = q.value.trim() ? matchTagQuery(q.value, TAG_VOCAB) : [];
      }
```

แก้ `searchOK`:

```js
      function searchOK(c) {
        var v = q.value.toLowerCase().trim();
        if (!v) return true;
        if (c.getAttribute('data-search').indexOf(v) !== -1) return true;
        if (!qTags.length) return false;
        var ct = c.getAttribute('data-tags');
        if (!ct) return false;
        for (var i = 0; i < qTags.length; i++) if ((' ' + ct + ' ').indexOf(' ' + qTags[i] + ' ') !== -1) return true;
        return false;
      }
```

แก้ `recompute()` ให้เรียก `suggestTags()` เป็นบรรทัดแรก:

```js
      function recompute() {
        suggestTags();
        filtered = cards.filter(function (c) { return marketOK(c) && tagOK(c) && searchOK(c); });
```

แก้ `drawTagBar()` ให้แสดงชิปเสนอแท็กเมื่อยังไม่ได้กรอง:

```js
      function drawTagBar() {
        if (tag) {
          tagbar.hidden = false;
          tagbar.innerHTML = '<span class="tchip on">\\uD83C\\uDFF7 ' + labelOf(tag) +
            ' <b>' + filtered.length + '</b> หุ้น <button type="button" class="tx" data-clear="1" aria-label="ล้างตัวกรองแท็ก">\\u2715</button></span>';
          return;
        }
        if (!qTags.length) { tagbar.hidden = true; tagbar.innerHTML = ''; return; }
        var h = '';
        for (var i = 0; i < qTags.length && i < 4; i++) {
          var cnt = 0;
          for (var j = 0; j < cards.length; j++) {
            var ct = cards[j].getAttribute('data-tags');
            if (ct && (' ' + ct + ' ').indexOf(' ' + qTags[i] + ' ') !== -1) cnt++;
          }
          h += '<button type="button" class="tchip" data-pick="' + qTags[i] + '">\\uD83C\\uDFF7 แท็ก: ' +
               labelOf(qTags[i]) + ' <b>' + cnt + '</b> หุ้น</button>';
        }
        tagbar.hidden = !h; tagbar.innerHTML = h;
      }
```

แก้ตัวจัดการคลิกบน tagbar ให้รองรับทั้งล้างและเลือก:

```js
      tagbar.addEventListener('click', function (e) {
        var pick = e.target.closest('[data-pick]');
        if (pick) { tag = pick.getAttribute('data-pick'); q.value = ''; page = 1; recompute(); render(); drawTagBar(); return; }
        if (e.target.closest('[data-clear]')) { tag = ''; page = 1; recompute(); render(); drawTagBar(); }
      });
```

เพิ่ม CSS ให้ชิปที่กดได้:

```css
  button.tchip{border:0;cursor:pointer;font-family:'Sarabun',sans-serif}
  button.tchip:hover{box-shadow:var(--shadow),0 0 0 2px rgba(19,21,27,.1)}
```

หา event listener ของช่องค้นหา (`q.addEventListener('input', …)`) แล้วเพิ่ม `drawTagBar();` ต่อจาก `render();`

- [ ] **Step 4: รันเทสให้ผ่าน + ตรวจในเบราว์เซอร์**

```bash
node build.js >/dev/null && node test/build-test.js && grep -c 'function matchTagQuery' dist/index.html
```

Expected: PASS แล้วตามด้วย `1`

- [ ] **Step 5: Commit**

```bash
git add build.js test/build-test.js && git commit -m "$(printf 'feat: ค้นหาด้วย tag — ชิปเสนอแท็ก + union กับผลค้นหาชื่อ\n\nแยก data-tags ออกจาก data-search โดยตั้งใจ: data-search เป็น indexOf substring\nถ้ายัด tag ลงไปด้วย พิมพ์ "ai" จะแมตช์ Thailand/retail/chain/Dubai ทั้งหมด\ntag จึงแมตช์แบบขึ้นต้นคำ (ละติน) และ substring (ไทย ซึ่งไม่มีเว้นวรรค)\n\nembed matchTagQuery ตัวเดียวกับที่เทสใน Node ผ่าน String(fn) — ห้ามเขียน\nตรรกะจับคู่ซ้ำสองที่แล้วปล่อยให้ drift\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 6: หน้า `/tag/<slug>` + ตรวจใน check-site

**Files:**
- Modify: `build.js` (เพิ่มขั้นสร้างหน้า tag หลังบล็อก sitemap ~628)
- Modify: `test/check-site.js`

**Interfaces:**
- Consumes: `TAG_VOCAB`, `TAG_DATA`, `cardHtml`/ตัวสร้างการ์ด
- Produces: `dist/tag/<slug>.html` ทุก slug ที่มีสมาชิก ≥1 · export `checkTagPages(DIST, ROOT) → { errors, warnings }` จาก check-site

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เพิ่มฟังก์ชันใน `test/check-site.js` ก่อน `function main()`:

```js
// ---- หน้า tag (dist/tag/<slug>.html) ----
// ★ ต้องอยู่ในโฟลเดอร์ย่อยเท่านั้น — coverage check ข้างบนมองไฟล์ .html ในราก dist
//   ว่าเป็น "รายงาน" ⇒ วางที่รากจะถูกฟ้องว่าเป็นรายงานค้าง
function checkTagPages(DIST, ROOT) {
  const r = { errors: [], warnings: [] };
  const T = require('../tools/tag-lib.js');
  let vocab, data;
  try { vocab = T.loadVocab(); data = T.loadTags(); }
  catch (e) { r.errors.push(`อ่านไฟล์ tag ไม่ได้: ${e.message}`); return r; }

  const members = T.membersOf(data);
  const tagDir = path.join(DIST, 'tag');
  const want = [...members.keys()].filter((s) => vocab.bySlug.has(s)).sort();
  const have = fs.existsSync(tagDir)
    ? fs.readdirSync(tagDir).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '')).sort()
    : [];

  for (const s of want) if (!have.includes(s)) r.errors.push(`ไม่มีหน้า dist/tag/${s}.html (มีสมาชิก ${members.get(s).length} ตัว)`);
  for (const s of have) {
    if (!members.has(s)) { r.errors.push(`dist/tag/${s}.html ไม่มีสมาชิกเลย (หน้าเปล่าไม่ควรเข้า sitemap)`); continue; }
    const html = fs.readFileSync(path.join(tagDir, s + '.html'), 'utf8');
    const cards = (html.match(/class="card"/g) || []).length;
    if (cards !== members.get(s).length) r.errors.push(`tag/${s}: การ์ด ${cards} ใบ แต่มีสมาชิก ${members.get(s).length} ตัว`);
    if ((html.match(/<h1[^>]*>/gi) || []).length !== 1) r.errors.push(`tag/${s}: ต้องมี <h1> เดียว`);
    if (!/<title>[^<]+<\/title>/i.test(html)) r.errors.push(`tag/${s}: ไม่มี <title>`);
  }

  // ลิงก์ tag บนหน้ารายงานต้องไม่ตายสักเส้น
  for (const f of fs.readdirSync(DIST).filter((f) => /\.html$/i.test(f) && f.toLowerCase() !== 'index.html')) {
    const html = fs.readFileSync(path.join(DIST, f), 'utf8');
    for (const m of html.matchAll(/href="\/tag\/([a-z0-9-]+)"/g)) {
      if (!have.includes(m[1])) r.errors.push(`${f}: ลิงก์ /tag/${m[1]} ไม่มีหน้าปลายทาง`);
    }
  }
  return r;
}
```

เรียกใช้ใน `main()` — เพิ่มหลังบรรทัด `add('site (ta chart)', …)`:

```js
  add('site (tag pages)', checkTagPages(DIST, ROOT));
```

และเพิ่ม `checkTagPages` เข้า `module.exports` ท้ายไฟล์:

```js
module.exports = { checkSecurityStructure, checkRender, checkModelCredit, checkMetricsCards, checkTaBundle, checkTagPages };
```

- [ ] **Step 2: รันเทสให้แน่ใจว่าล้มเหลว**

```bash
node build.js >/dev/null && node test/check-site.js
```

Expected: FAIL — `✗ ไม่มีหน้า dist/tag/ai-datacenter.html (มีสมาชิก N ตัว)`

- [ ] **Step 3a: คำนวณรายชื่อ slug ก่อนบล็อก sitemap**

⚠️ **ลำดับในไฟล์สำคัญ:** `cardHtml` ถูกนิยามที่บรรทัด ~682 ซึ่ง **อยู่หลัง** บล็อก sitemap (~608–628) ⇒ โค้ดสร้างหน้า tag ต้องอยู่ท้ายไฟล์ แต่ sitemap ต้องรู้รายชื่อ slug ตั้งแต่ต้น จึงแยกเป็น 2 ก้อน

แทรก **ก่อน** บรรทัด `// ---- 4.5) sitemap.xml` (~608):

```js
// รายชื่อ tag ที่จะมีหน้าจริง — คำนวณตรงนี้เพราะ sitemap (ข้อ 4.5) ต้องใช้
// ส่วนตัวหน้าถูกสร้างท้ายไฟล์ (ข้อ 7) เพราะต้องรอ cardHtml + INDEX_STYLE
const tagMembers = tagLib.membersOf(TAG_DATA);
const tagPageSlugs = [...tagMembers.keys()].filter((s) => TAG_VOCAB.bySlug.has(s)).sort();
```

- [ ] **Step 3b: แยกบล็อก `<style>` ของหน้า index ออกเป็นตัวแปร**

หน้า tag ใช้ CSS การ์ดชุดเดียวกับหน้าแรก — แยกออกมาใช้ซ้ำ ไม่ก๊อป

แทรก **ก่อน** `const indexHtml = \`<!DOCTYPE html>` (บรรทัด ~985) แล้วย้ายบล็อก `<style>…</style>` ทั้งก้อน (บรรทัด ~1007 ถึงบรรทัด `</style>` ~1151) ออกมาเป็น:

```js
// CSS หน้า index — แยกเป็นตัวแปรเพราะหน้า /tag/<slug> ใช้การ์ดชุดเดียวกัน
const INDEX_STYLE = `<style>
  :root{
  … (เนื้อ CSS เดิมทั้งหมด ไม่แก้ไข) …
</style>`;
```

แล้วใน `indexHtml` แทนบล็อกเดิมด้วย `${INDEX_STYLE}`

รันตรวจว่า CSS ไม่หาย:

```bash
node build.js >/dev/null && grep -c 'grid-template-columns' dist/index.html
```

Expected: ≥1 (ถ้าเป็น 0 แปลว่าย้าย CSS พลาด)

- [ ] **Step 3c: สร้างหน้า tag ท้ายไฟล์**

แทรก **หลัง** `fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml, 'utf8');` (บรรทัด ~1177) และ **ก่อน** บรรทัด `log('✅ สร้าง dist/ เสร็จ …')`:

```js
// ---- 7) หน้า /tag/<slug> — ทางเข้าจาก Google + หน้ารวมหุ้นในธีมเดียวกัน ----
// ★ ต้องอยู่ dist/tag/ ไม่ใช่รากของ dist — check-site มองไฟล์ .html ในรากว่าเป็น "รายงาน"
// ★ การ์ดหน้าแรกใช้ href="./<SYM>.html" (relative) — บนหน้าที่ลึก 1 ชั้นจะกลายเป็น
//   /tag/<SYM>.html = 404 ทุกใบ ⇒ ต้องแปลงเป็น absolute ก่อนฝัง
const bySymbol = new Map(reports.map((r) => [r.symbol, r]));
if (tagPageSlugs.length) {
  fs.mkdirSync(path.join(OUT, 'tag'), { recursive: true });
  // แท็กที่เกี่ยวข้อง = slug ที่มีสมาชิกทับซ้อนมากที่สุด (ลิงก์ภายในให้กราฟเชื่อมถึงกัน)
  const relatedOf = (slug) => {
    const mine = new Set(tagMembers.get(slug));
    return tagPageSlugs
      .filter((s) => s !== slug)
      .map((s) => ({ s, n: tagMembers.get(s).filter((x) => mine.has(x)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n).slice(0, 5).map((x) => x.s);
  };
  for (const slug of tagPageSlugs) {
    const ent = TAG_VOCAB.bySlug.get(slug);
    const syms = tagMembers.get(slug).filter((s) => bySymbol.has(s));
    const idxOf = new Map(reports.map((r, i) => [r.symbol, i]));
    // href="./X.html" → href="/X.html" — หน้า tag ลึก 1 ชั้น relative link จะพังทุกใบ
    const cardsHtml = syms.slice().sort((a, b) => idxOf.get(a) - idxOf.get(b))
      .map((s) => cardHtml[idxOf.get(s)].replace(/href="\.\//g, 'href="/')).join('\n');
    const url = `${SITE_ORIGIN}/tag/${slug}`;
    const pageTitle = `หุ้นกลุ่ม ${ent.label} — รวม ${syms.length} ตัว | วิเคราะห์หุ้น`;
    const related = relatedOf(slug);
    fs.writeFileSync(path.join(OUT, 'tag', slug + '.html'), `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${escAttr(ent.desc + ' — รวมรายงานวิเคราะห์ ' + syms.length + ' ตัว')}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escAttr(pageTitle)}">
<meta property="og:description" content="${escAttr(ent.desc)}">
<meta property="og:image" content="${OG_IMAGE}">
${FONT_LINKS}
${INDEX_STYLE}
</head>
<body>
  <div class="wrap">
    <header class="hd">
      <p class="crumb"><a href="/">← หน้าแรก</a></p>
      <h1>🏷 ${esc(ent.label)}</h1>
      <p class="lead">${esc(ent.desc)} · <b>${syms.length}</b> รายงาน</p>
      <p class="crumb"><a href="/?tag=${slug}">เปิดในหน้ารวม (เรียง/กรองตาม MOS · P/E · ปันผล) →</a></p>
    </header>
    <div class="grid">
${cardsHtml}
    </div>
    ${related.length ? `<nav class="related"><span>แท็กที่เกี่ยวข้อง:</span> ${related.map((s) => `<a class="tchip" href="/tag/${s}">${esc(TAG_VOCAB.bySlug.get(s).label)}</a>`).join(' ')}</nav>` : ''}
  </div>
</body>
</html>
`);
  }
  log('tag pages:', tagPageSlugs.length + ' หน้า → dist/tag/');
}
```

เพิ่ม URL หน้า tag เข้า sitemap — เติมใน `sitemapEntries` (บรรทัด ~610) ต่อจากรายการหุ้น ใช้ `tagPageSlugs` ที่คำนวณไว้แล้วใน Step 3a:

```js
  ...tagPageSlugs.map((s) =>
    `  <url><loc>${SITE_ORIGIN}/tag/${s}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`
  ),
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
node build.js >/dev/null && node test/check-site.js
```

Expected: PASS — `✅ เว็บไซต์ผ่าน`

```bash
ls dist/tag/ | head && grep -c '<loc>https://gaohoon.com/tag/' dist/sitemap.xml && ls dist/*.html | wc -l
```

Expected: รายชื่อไฟล์ slug · จำนวน url tag ใน sitemap · จำนวนไฟล์รากยังเป็น 909 (908 รายงาน + index)

ตรวจว่าลิงก์การ์ดบนหน้า tag ไม่พัง (บั๊กที่เจอง่ายที่สุดของหน้าลึก 1 ชั้น):

```bash
node -e "
const fs=require('fs');const f=fs.readdirSync('dist/tag')[0];
const h=fs.readFileSync('dist/tag/'+f,'utf8');
const rel=(h.match(/href=\"\.\//g)||[]).length;
const abs=(h.match(/class=\"card\"[^>]*href=\"\/[A-Z]/g)||[]).length;
console.log(rel?'❌ ยังมี relative href '+rel+' จุด → คลิกการ์ดจะ 404':'✅ ลิงก์การ์ดเป็น absolute ครบ ('+abs+' ใบ)');
"
```

Expected: `✅ ลิงก์การ์ดเป็น absolute ครบ (N ใบ)`

- [ ] **Step 5: Commit**

```bash
git add build.js test/check-site.js && git commit -m "$(printf 'feat: หน้า /tag/<slug> + เข้า sitemap + ตรวจลิงก์ตายใน check-site\n\nวางใน dist/tag/ ไม่ใช่รากของ dist — check-site.js:204 อ่านไฟล์ .html ในราก\nแล้วถือว่าเป็นรายงาน วางผิดที่จะถูกฟ้องว่าเป็นรายงานค้าง\n\nตรวจสามชั้น: หน้าครบทุก slug ที่มีสมาชิก · จำนวนการ์ดตรงกับจำนวนสมาชิกเป๊ะ ·\nลิงก์ /tag/ ทุกเส้นบนหน้ารายงานมีปลายทางจริง (908 หน้า x 2-3 ลิงก์)\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 7: สร้างคลังคำศัพท์จริง (เฟส 1) — **มี checkpoint ของเจ้าของ**

**Files:**
- Modify: `tags-vocab.json` (แทนคลัง seed 12 ด้วยของจริง ~100)

**Interfaces:**
- Consumes: `reports.json` (symbol · name · desc) · ป้าย free-text เดิมในไฟล์รายงาน
- Produces: `tags-vocab.json` version 1 ที่ผ่าน `validateVocab` และเจ้าของอนุมัติ

- [ ] **Step 1: ดึงวัตถุดิบทั้งหมดออกมาเป็นไฟล์เดียว**

```bash
node -e "
const fs=require('fs');
const man=JSON.parse(fs.readFileSync('reports.json','utf8'));
const dec=s=>s.replace(/&amp;/g,'&').replace(/&bull;/g,'•').replace(/&nbsp;/g,' ');
const out=man.map(r=>{
  const h=fs.readFileSync('reports/'+r.file,'utf8');
  const sp=[...h.matchAll(/<span class=\"tag\">([^<]*)<\/span>/g)].map(x=>dec(x[1].trim())).slice(1);
  return [r.symbol, r.metrics&&r.metrics.market||'?', r.name, sp.join(' | '), (r.desc||'').slice(0,160)].join('\t');
});
fs.writeFileSync('/tmp/tag-corpus.tsv', out.join('\n'));
console.log('เขียน /tmp/tag-corpus.tsv —', out.length, 'บรรทัด');
"
```

Expected: `เขียน /tmp/tag-corpus.tsv — 908 บรรทัด`

- [ ] **Step 2: จัดกลุ่มเป็นธีม**

อ่าน `/tmp/tag-corpus.tsv` แล้วจัดกลุ่มหุ้นเป็นธีมการลงทุน โดยยึดกติกาใน spec §4:

- **แกนเดียว = ธีม/เรื่องราวการลงทุน** ไม่ใช่ category (`Technology`/`Healthcare`/`Financials` ห้ามเป็น slug) และไม่ใช่ขนาด (`Large-cap`)
- ธีมหนึ่งต้องมีสมาชิก **≥3 ตัว** — ธีมที่นึกออกแต่มีหุ้นตัวเดียวให้ยุบรวมกับธีมใกล้เคียง
- ทุกหุ้นใน 908 ตัวต้องหาที่ลงได้อย่างน้อย 1 ธีมโดยไม่ต้องฝืน — ถ้าหุ้นกลุ่มไหนลงไม่ได้เลย แปลว่าคลังยังขาดธีมกว้าง (เช่น `thai-consumption`, `dividend-income`)
- `aliases` ต้องมีทั้งคำอังกฤษและไทยที่คนน่าจะพิมพ์ค้นหาจริง และ **ห้ามชนกันข้าม slug**

เขียนผลลงทับ `tags-vocab.json` ตาม schema เดิม (`version` คงเป็น `1`)

- [ ] **Step 3: ตรวจคลังด้วยเครื่องมือ**

```bash
node test/tags-test.js && node -e "
const T=require('./tools/tag-lib.js');const v=T.loadVocab();
console.log('slug ทั้งหมด:',v.list.length);
const bad=v.list.filter(e=>/^(technology|healthcare|financials|industrials|utilities|energy|materials|large-cap|mid-cap|small-cap|mega-cap)$/i.test(e.slug.replace(/-/g,' ')));
console.log(bad.length?'❌ พบ slug ที่เป็น category/ขนาด: '+bad.map(e=>e.slug).join(', '):'✅ ไม่มี slug ที่เป็น category/ขนาด');
"
```

Expected: `tags-test: N/N ผ่าน` · `slug ทั้งหมด: 80–120` · `✅ ไม่มี slug ที่เป็น category/ขนาด`

- [ ] **Step 4: ★ CHECKPOINT — เสนอคลังให้เจ้าของ freeze**

สรุปให้เจ้าของ: จำนวน slug · ตัวอย่าง 15 ธีมแรกพร้อมจำนวนหุ้นที่คาดว่าจะเข้ากลุ่ม · ธีมที่ลังเล · **ถ้าเกิน 120 ต้องเสนอตัวเลขพร้อมเหตุผล ห้ามยัดให้ลงกรอบและห้ามปล่อยบานเอง** (spec §4.2)

**หยุดรอคำอนุมัติ — ห้ามไป Task 8 ก่อนได้รับ**

- [ ] **Step 5: Commit**

แทน `N` ด้วยจำนวน slug จริงที่ได้จาก Step 3:

```bash
N=$(node -e "console.log(require('./tools/tag-lib.js').loadVocab().list.length)") && git add tags-vocab.json && git commit -m "$(printf 'feat: คลังคำศัพท์ tag จริง — %s ธีมการลงทุน (เจ้าของอนุมัติแล้ว)\n\nจัดกลุ่มจากป้าย free-text เดิม 2,248 ค่า + คำโปรยธุรกิจ 908 ตัว เป็นธีมที่มี\nสมาชิก >=3 ตัว · ไม่มี slug ที่เป็น category (Technology/Healthcare) หรือ\nขนาด (Large-cap) ตามกติกา spec ss4\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>' "$N")"
```

---

### Task 8: ติด tag ครบ 908 ตัว (เฟส 3)

**Files:**
- Modify: `tags.json`

**Interfaces:**
- Consumes: `tags-vocab.json` (Task 7) · `reports.json`
- Produces: `tags.json.tags` มีครบ 908 symbol ทุกตัวมี 1–3 slug ที่อยู่ในคลัง

- [ ] **Step 1: แบ่งงานเป็นแบตช์**

```bash
node -e "
const fs=require('fs');
const man=JSON.parse(fs.readFileSync('reports.json','utf8'));
const dec=s=>s.replace(/&amp;/g,'&').replace(/&bull;/g,'•');
const rows=man.map(r=>{
  const h=fs.readFileSync('reports/'+r.file,'utf8');
  const sp=[...h.matchAll(/<span class=\"tag\">([^<]*)<\/span>/g)].map(x=>dec(x[1].trim())).slice(1);
  return {sym:r.symbol,mkt:(r.metrics&&r.metrics.market)||'?',name:r.name,old:sp.join(' | '),desc:(r.desc||'').slice(0,200)};
});
fs.mkdirSync('/tmp/tagbatch',{recursive:true});
const N=40;
for(let i=0;i<rows.length;i+=N){
  fs.writeFileSync('/tmp/tagbatch/b'+String(i/N+1).padStart(2,'0')+'.json', JSON.stringify(rows.slice(i,i+N),null,1));
}
console.log('แบตช์',Math.ceil(rows.length/N),'ไฟล์ ที่ /tmp/tagbatch/');
"
```

Expected: `แบตช์ 23 ไฟล์ ที่ /tmp/tagbatch/`

- [ ] **Step 2: ติด tag ทีละแบตช์**

สำหรับแต่ละไฟล์แบตช์ อ่านหุ้น 40 ตัว (symbol · ตลาด · ชื่อ · ป้ายเดิม · คำโปรย) พร้อม `tags-vocab.json` แล้วเลือก **1–3 slug จากคลังเท่านั้น** ให้แต่ละตัว

กติกา:
- ห้ามคิด slug ใหม่ — ถ้าไม่มีธีมไหนเข้ากันเลยให้บันทึกไว้แล้วรายงานท้ายงาน (จะเข้าคิว `--request`)
- เป้า 2–3 slug ต่อตัว · ติด 1 ได้เมื่อไม่มีธีมที่สองที่ซื่อสัตย์ **ห้ามยัดให้ครบ**
- ถ้าใช้ subagent: **pin `model:"sonnet"` ทุก call** ตาม CLAUDE.md §3.2 (ไม่ pin = ได้ Opus โดยไม่ตั้งใจ) · **subagent ห้ามเขียน `tags.json` เอง** ต้องคืนผลเป็นข้อความให้ controller เขียนผ่าน `tag-apply.js` แบบ sequential เท่านั้น (บทเรียน `seeds.json` race)

เขียนผลลง `/tmp/tagbatch/assign-bNN.txt` **บรรทัดละ 1 หุ้น** รูปแบบ `<SYM> <slug> [<slug>] [<slug>]` เช่น:

```
LITE ai-datacenter optical-photonics
CPN thai-consumption retail-property
BBL thai-banking dividend-income
```

แล้ว apply ทีละแบตช์ (sequential — ห้ามรันขนาน ไฟล์ `tags.json` มี writer ได้ทีละตัว):

```bash
while read -r line; do [ -z "$line" ] && continue; node tools/tag-apply.js $line || echo "FAIL: $line"; done < /tmp/tagbatch/assign-b01.txt
```

Expected: บรรทัด `✅ <SYM>: …` ครบ 40 บรรทัด ไม่มี `FAIL:` — ถ้ามี `FAIL:` ให้แก้ slug ให้ตรงคลังแล้วรันเฉพาะบรรทัดนั้นซ้ำ

- [ ] **Step 3: ตรวจความครบหลังทุกแบตช์**

```bash
node -e "
const fs=require('fs'),T=require('./tools/tag-lib.js');
const d=T.loadTags(),v=T.loadVocab();
const syms=fs.readdirSync('reports').filter(f=>/\.html\$/i.test(f)).map(f=>f.replace(/\.html\$/i,''));
const miss=syms.filter(s=>!d.tags[s]);
const errs=[];for(const s of Object.keys(d.tags))errs.push(...T.validateAssignment(s,d.tags[s],v));
const m=T.membersOf(d);const thin=[...m].filter(([k,a])=>a.length<T.MIN_MEMBERS);
console.log('ติดแล้ว',Object.keys(d.tags).length,'/',syms.length,'· ยังขาด',miss.length);
console.log('error',errs.length, errs.slice(0,5));
console.log('tag ที่มีสมาชิก <3:',thin.length, thin.slice(0,8).map(x=>x[0]+'('+x[1].length+')'));
console.log('tag ที่ยังไม่มีใครใช้:',v.list.filter(e=>!m.has(e.slug)).map(e=>e.slug));
"
```

Expected (เมื่อจบทุกแบตช์): `ติดแล้ว 908 / 908 · ยังขาด 0` · `error 0`

- [ ] **Step 4: จัดการ tag ที่สมาชิกน้อยเกิน**

`tag ที่มีสมาชิก <3` และ `tag ที่ยังไม่มีใครใช้` ต้องแก้ที่คลัง ไม่ใช่ยัดหุ้นเพิ่ม — ยุบรวมกับธีมใกล้เคียงหรือลบ slug ออกจาก `tags-vocab.json` แล้วรัน `tag-apply.js` ใหม่เฉพาะหุ้นที่กระทบ

รันข้อ 3 ซ้ำจนได้ `tag ที่มีสมาชิก <3: 0` และ `tag ที่ยังไม่มีใครใช้: []`

- [ ] **Step 5: build + verify เต็ม**

```bash
node build.js >/dev/null && node test/tags-test.js && node test/check-site.js
```

Expected: ผ่านทั้งหมด · หน้า tag ครบตามจำนวน slug

- [ ] **Step 6: ยืนยันอีกครั้งว่า hash ไม่ขยับ**

```bash
git diff --stat reports.json | tail -1
```

Expected: มีเฉพาะการเพิ่มฟิลด์ `tags` — **ถ้าเห็น `updated` เปลี่ยนหลายร้อยบรรทัด แปลว่ามีอะไรไปแตะไฟล์ใน `reports/` ให้หยุดและหาสาเหตุ**

- [ ] **Step 7: Commit**

```bash
git add tags.json tags-vocab.json reports.json && git commit -m "$(printf 'feat: ติด tag ครบ 908 ตัว\n\nแบ่ง 23 แบตช์ x 40 ตัว อ่านจาก reports.json (มี desc ครบอยู่แล้ว) ไม่เปิดไฟล์\nHTML สักไฟล์ ไม่ fetch ราคา/งบ ไม่แตะเลขการเงิน\n\nทุก slug มาจากคลังที่ freeze แล้ว · ทุก tag มีสมาชิก >=3 · ไม่มี slug ที่ไม่มี\nใครใช้ · ยืนยัน hash + updated ของทั้ง 908 รายงานไม่ขยับ\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 9: เปิด gate — E40 · W13 · self-test · verify 13 ขั้น

**Files:**
- Modify: `test/check-reports.js` (`buildCtx` ~98 · `checkHtml` ~392 · เพิ่ม CHECKS 2 รายการ)
- Modify: `test/self-test.js`
- Modify: `test/tags-test.js` (เพิ่ม corpus checks)
- Modify: `package.json`

**Interfaces:**
- Consumes: `tag-lib.js` · `tags.json` ที่ครบแล้ว (Task 8)
- Produces: `buildCtx(html, name, opts)` · `checkHtml(html, name, opts)` โดย `opts.tagData` / `opts.vocab` เป็นช่องให้ self-test ฉีดข้อมูลปลอม

- [ ] **Step 1: เขียนเทส self-test ที่ยังไม่ผ่าน**

ต่อท้าย `test/self-test.js` ก่อนบล็อกสรุป:

```js
// ── E40 / W13: ความถูกต้องของ tag ต่อหุ้น ──
// E40/W13 อ่าน tag จากไฟล์บนดิสก์ ไม่ใช่จาก HTML ⇒ mutation แบบแก้สตริงฉีดไม่ได้
// จึงต้องฉีดผ่าน opts.tagData (ช่องที่ออกแบบไว้ให้เทสโดยเฉพาะ)
{
  const T = require('../tools/tag-lib.js');
  const list = [
    { slug: 'thai-consumption', label: 'การบริโภคในประเทศไทย', aliases: ['ค้าปลีก'], desc: 'd' },
    { slug: 'dividend-income', label: 'Dividend & Income', aliases: ['ปันผล'], desc: 'd' },
  ];
  const vocab = { version: 1, list, bySlug: new Map(list.map((e) => [e.slug, e])) };
  const mk = (slugs) => ({ vocabVersion: 1, tags: slugs ? { BBL: slugs } : {}, requests: [] });
  const run = (slugs) => checkHtml(BASE, 'BBL.html', { tagData: mk(slugs), vocab });

  const good = run(['thai-consumption', 'dividend-income']);
  ok(!errIds(good).has('E40'), 'E40: tag ถูกต้อง → ไม่ยิง');
  ok(!allIds(good).has('W13'), 'W13: มี 2 tag → ไม่ยิง');

  ok(errIds(run(null)).has('E40'), 'E40: ไม่มี entry ใน tags.json → ยิง');
  ok(errIds(run(['ไม่มีจริง'])).has('E40'), 'E40: slug นอกคลัง → ยิง');
  ok(errIds(run(['thai-consumption', 'dividend-income', 'thai-consumption', 'dividend-income'])).has('E40'), 'E40: เกิน 3 slug → ยิง');
  ok(errIds(run(['thai-consumption', 'thai-consumption'])).has('E40'), 'E40: slug ซ้ำกันเอง → ยิง');

  const one = run(['thai-consumption']);
  ok(allIds(one).has('W13'), 'W13: มี tag เดียว → ยิง');
  ok(!errIds(one).has('E40'), 'W13: มี tag เดียว → E40 ไม่ยิง (เป็น warning ไม่ใช่ error)');
}
```

> `BASE` = ตัวแปรที่ self-test ใช้เก็บ HTML ของ BBL หลัง `expandReport` — ถ้าชื่อในไฟล์ต่างจากนี้ให้ใช้ชื่อเดิมของไฟล์

- [ ] **Step 2: รันเทสให้แน่ใจว่าล้มเหลว**

```bash
node test/self-test.js
```

Expected: FAIL — `✗ E40: ไม่มี entry ใน tags.json → ยิง`

- [ ] **Step 3: เพิ่ม `opts` เข้า `buildCtx`/`checkHtml`**

ใน `test/check-reports.js` เพิ่ม require ที่หัวไฟล์:

```js
const TAG = require('../tools/tag-lib.js');
// โหลดครั้งเดียวต่อ process — self-test จะฉีดของปลอมผ่าน opts.tagData แทน
let _tagCache = null;
function tagDefaults() {
  if (!_tagCache) {
    try { _tagCache = { tagData: TAG.loadTags(), vocab: TAG.loadVocab() }; }
    catch { _tagCache = { tagData: null, vocab: null }; }
  }
  return _tagCache;
}
```

แก้ `buildCtx` (บรรทัด 98):

```js
function buildCtx(html, name, opts) {
  const o = opts || {};
  const d = tagDefaults();
  const tagData = o.tagData !== undefined ? o.tagData : d.tagData;
  const vocab = o.vocab !== undefined ? o.vocab : d.vocab;
  const text = visible(html);
```

แล้วเพิ่ม 2 ฟิลด์ในอ็อบเจกต์ที่ `return` (ต่อจาก `symbol:`):

```js
    tagData,
    vocab,
```

แก้ `checkHtml` (บรรทัด 392):

```js
function checkHtml(html, name, opts) {
  const ctx = buildCtx(html, name, opts);
```

- [ ] **Step 4: เพิ่ม E40 + W13 เข้า `CHECKS`**

เพิ่มท้ายอาร์เรย์ `CHECKS` (หลัง W12 ก่อน `];`):

```js
  // ── E40: หุ้นต้องมี tag ที่ถูกต้องใน tags.json ──
  // ระบบ tag เก็บแยกเป็น sidecar (ไม่ฝังในไฟล์รายงาน) เพราะเขียนลงไฟล์จะทำให้
  // freshHash ของทั้ง 908 ไฟล์เปลี่ยนพร้อมกัน → updated เด้งยกชุด (spec §2.1)
  // ⇒ ความถูกต้องจึงตรวจที่นี่แทน · build ตั้งใจให้ผ่อนปรน (คงป้ายเดิม) ตัวบังคับคือ check นี้
  { id: 'E40', level: 'error', label: 'tag ของหุ้นถูกต้อง (tags.json)', fn: (c) => {
    if (!c.tagData || !c.vocab) return null;              // ยังไม่ติดตั้งระบบ tag → ไม่ฟ้อง
    const slugs = c.tagData.tags[c.symbol];
    if (!slugs) return `ไม่มี ${c.symbol} ใน tags.json — ติดด้วย: node tools/tag-apply.js ${c.symbol} <slug…>`;
    const errs = TAG.validateAssignment(c.symbol, slugs, c.vocab);
    return errs.length ? errs.join(' ; ') : null;
  } },

  // ── W13: หุ้นมี tag เดียว — อาจหาธีมที่สองได้ (ไม่บังคับ ห้ามยัด tag ขยะให้ครบ) ──
  { id: 'W13', level: 'warn', label: 'หุ้นควรมี tag 2–3 ตัว', fn: (c) => {
    if (!c.tagData || !c.vocab) return null;
    const slugs = c.tagData.tags[c.symbol];
    return (slugs && slugs.length === 1) ? `มี tag เดียว (${slugs[0]}) — ทบทวนว่ามีธีมที่สองไหม` : null;
  } },
```

- [ ] **Step 5: รันเทสให้ผ่าน**

```bash
node test/self-test.js && node test/check-reports.js | tail -5
```

Expected: self-test ผ่านทั้งหมด · check-reports สรุป `908/908 ไฟล์ผ่าน • error 0`

- [ ] **Step 6: เพิ่ม corpus checks ใน `tags-test.js`**

แทรกก่อนบล็อกสรุปของ `test/tags-test.js`:

```js
// ── C) corpus: reports/ ↔ tags.json ↔ คลัง (ตรวจสองทาง) ──
const data = T.loadTags();
const syms = fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, ''));
const symSet = new Set(syms);

const missing = syms.filter((s) => !data.tags[s]);
ok(missing.length === 0, `ทุกรายงานมี tag (ขาด ${missing.length}: ${missing.slice(0, 5).join(', ')})`);

const orphans = Object.keys(data.tags).filter((s) => !symSet.has(s));
ok(orphans.length === 0, `ไม่มี entry ค้างของหุ้นที่ลบไปแล้ว (พบ ${orphans.length}: ${orphans.slice(0, 5).join(', ')})`);

const dangling = [];
for (const s of Object.keys(data.tags)) for (const g of data.tags[s]) if (!vocab.bySlug.has(g)) dangling.push(`${s}→${g}`);
ok(dangling.length === 0, `ไม่มี slug ที่หลุดจากคลัง (พบ ${dangling.length}: ${dangling.slice(0, 5).join(', ')})`);

const assignErrs = [];
for (const s of Object.keys(data.tags)) assignErrs.push(...T.validateAssignment(s, data.tags[s], vocab));
ok(assignErrs.length === 0, `ทุกหุ้นมี 1–3 tag ไม่ซ้ำ (พบ ${assignErrs.length}: ${assignErrs[0] || ''})`);

// key ต้องไม่เป็นชื่อเก่าที่ย้ายไปแล้วตาม symbol-map (จับ rename ที่ลืมย้าย key)
{
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'symbol-map.json'), 'utf8')); } catch {}
  const stale = Object.keys(data.tags).filter((s) => map[s] && !symSet.has(s));
  ok(stale.length === 0, `ไม่มี key ที่เป็นชื่อเก่าใน symbol-map (พบ ${stale.join(', ')})`);
}

// ── D) warning ระดับคลัง ──
const members = T.membersOf(data);
const thin = [...members].filter(([, a]) => a.length < T.MIN_MEMBERS);
if (thin.length) console.log(`  ⚠ tag ที่มีสมาชิก <${T.MIN_MEMBERS}: ${thin.map(([k, a]) => k + '(' + a.length + ')').join(', ')}`);
const unused = vocab.list.filter((e) => !members.has(e.slug)).map((e) => e.slug);
if (unused.length) console.log(`  ⚠ slug ในคลังที่ไม่มีใครใช้: ${unused.join(', ')}`);
if (data.vocabVersion < vocab.version) console.log(`  ⚠ vocabVersion ${data.vocabVersion} < คลัง ${vocab.version} — ยังไม่ backfill slug ใหม่`);
if (data.requests.length) console.log(`  ⚠ คิวขอคำศัพท์รอรีวิว ${data.requests.length} รายการ`);
```

- [ ] **Step 7: อัปเดต verify เป็น 13 ขั้น**

แก้ `package.json`:

```json
    "verify": "node test/update-prices-test.js && node test/dead-ticker-test.js && node test/tag-apply-test.js && node test/tags-test.js && node test/check-reports.js && node test/self-test.js && node test/ohlc-test.js && node test/ta-engine-test.js && node build.js && node test/build-test.js && node test/engine-exec.js && node test/skeleton-test.js && node test/check-site.js"
```

- [ ] **Step 8: รัน verify เต็ม**

```bash
npm run verify 2>&1 | tail -20
```

Expected: ผ่านครบ 13 ขั้น จบด้วย `✅ เว็บไซต์ผ่าน`

- [ ] **Step 9: Commit**

```bash
git add test/check-reports.js test/self-test.js test/tags-test.js package.json && git commit -m "$(printf 'feat: เปิด gate ระบบ tag — E40 + W13 + corpus checks + verify 13 ขั้น\n\nE40 ต่อไฟล์ (npm test -- <SYM> ยังใช้ได้) · corpus check แยกไป tags-test\nเพราะ checkHtml เป็น per-file — ใส่รวมกันจะ false-fire ตอนกรองไฟล์เดียว\n\nเพิ่ม opts.tagData/opts.vocab ใน buildCtx/checkHtml ให้ self-test ฉีดข้อมูล\nปลอมได้ — ไม่งั้น mutation จะ no-op เงียบ ซึ่งกติกา fixture ห้ามไว้\nค่าเริ่มต้นไม่เปลี่ยนพฤติกรรมเดิม (CLI ยังเรียก 2 อาร์กิวเมนต์)\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 10: เอกสาร + skeleton + lifecycle ของ tag ใน SKILL

**Files:**
- Modify: `_template/skeleton-th.html:47` · `_template/skeleton-us.html` (แถว tag)
- Modify: `.claude/skills/stock-analyzer/SKILL.md`
- Modify: `_template/agent-prompt.md`
- Modify: `CLAUDE.md` (§8 · §10)
- Modify: `docs/templates.md` · `docs/quality-gate.md`

**Interfaces:**
- Consumes: ทุก Task ก่อนหน้า
- Produces: กติกาที่ทำให้ระบบไม่เน่าเมื่อวิเคราะห์หุ้นรอบถัดไป

- [ ] **Step 1: ตัดป้าย free-text ออกจาก skeleton ทั้งสองไฟล์**

`_template/skeleton-us.html` แถว tag เดิม:

```html
    <div>
      <span class="tag">{{EXCHANGE}}: {{SYMBOL}}</span>
      <span class="tag">{{SECTOR_TAG}}</span>
      <span class="tag">{{NICHE_TAG}}</span>
    </div>
```

แทนด้วย:

```html
    <!-- ป้ายธีมการลงทุนถูก inject ตอน build จาก tags.json (ห้ามเขียนป้ายเพิ่มในไฟล์นี้)
         ติด tag ด้วย: node tools/tag-apply.js <SYMBOL> <slug…>  — slug ต้องมีใน tags-vocab.json
         หุ้นที่ยังไม่ติด tag จะถูก E40 ฟ้องตอน npm run verify และ push ไม่ได้ -->
    <div>
      <span class="tag">{{EXCHANGE}}: {{SYMBOL}}</span>
    </div>
```

ทำแบบเดียวกันกับ `_template/skeleton-th.html` (ป้ายแรกคือ `SET: {{SYMBOL}}`)

- [ ] **Step 2: รัน skeleton-test**

```bash
node test/skeleton-test.js 2>&1 | tail -5
```

Expected: ผ่าน — ถ้า fail เพราะ test อ้าง `{{SECTOR_TAG}}`/`{{NICHE_TAG}}` ให้ลบการอ้างนั้นออกจาก `test/skeleton-test.js` แล้วรันใหม่

- [ ] **Step 3: เพิ่ม lifecycle ของ tag ลง SKILL.md**

ใน `.claude/skills/stock-analyzer/SKILL.md`:

STEP 5A (โหมด NEW) — เพิ่มข้อท้ายรายการสิ่งที่ต้องทำ:

```markdown
6. **ติด tag ธีมการลงทุน** — เลือก 2–3 slug จาก `tags-vocab.json` (ห้ามคิด slug ใหม่)
   แล้วรายงานท้ายงานเป็นบรรทัด `TAGS: <slug> <slug>` — **ห้ามเขียน `tags.json` เอง**
   (ไฟล์เดียวหลาย writer = entry ทับหาย แบบเดียวกับ `pick-brand.js`) controller เป็นคนรัน
   `node tools/tag-apply.js <SYM> <slug…>` ให้ · ไม่มีธีมไหนเข้ากันเลย → **หยุดถาม controller**
   (ปล่อยไปจะทำ E40 ตกและ push ไม่ได้)
```

STEP 5B (โหมด UPDATE) — เพิ่มข้อ:

```markdown
**ทบทวน tag (บังคับทุกครั้ง):** ค่าตั้งต้นคือ **คงเดิม** — เปลี่ยนได้เฉพาะเมื่อธุรกิจเปลี่ยนธีมจริง
(ขาย/ซื้อกิจการ · เปลี่ยนธุรกิจหลัก · spinoff) ราคาขยับไม่นับ · รายงานท้ายงานบรรทัดเดียว:
- `TAGS: คงเดิม`
- `TAGS: เปลี่ยน — <เหตุผล + ธีมที่ควรเป็น>` (บอกเป็นคำอธิบายได้ ไม่ต้องรู้ slug)
ต้องการธีมที่ยังไม่มีในคลัง → บอก controller ให้เข้าคิวด้วย `tag-apply.js <SYM> --request "<ธีม>"`
```

STEP 5C (โหมด UPDATE-LIGHT) — เพิ่มบรรทัดในรายการ "ทำแค่นี้":

```markdown
- **ห้ามแตะ tag** — UPDATE-LIGHT คือ "ราคาขยับแรงแต่ไม่มีสัญญาณธุรกิจเปลี่ยน" และ tag เป็น
  ฟังก์ชันของธุรกิจไม่ใช่ของราคา · ถ้ายกระดับเป็น UPDATE เต็ม (EPS เกิน ±2%) ให้ใช้กฎ STEP 5B
```

STEP 0 — เพิ่มในรายการเหตุผลของคิว price-flags:

```markdown
- ticker เปลี่ยนชื่อ → หลังแก้ `tools/symbol-map.json` ต้องย้าย key ใน `tags.json` ด้วย:
  `node tools/tag-apply.js --rename <OLD> <NEW>` · ลบรายงาน (delisted) → `node tools/tag-apply.js --prune`
```

- [ ] **Step 4: เพิ่มบล็อก tag ใน agent-prompt.md**

ใน `_template/agent-prompt.md` เพิ่มบล็อกที่ controller เติมค่า (ใกล้บล็อก `FUNDAMENTALS`):

```markdown
=== TAGS ปัจจุบัน ===
{{CURRENT_TAGS}}
```

พร้อมคำอธิบายใต้บล็อก:

```markdown
> ว่างเปล่า = หุ้นใหม่ยังไม่มี tag (โหมด NEW — เลือก 2–3 slug จาก `tags-vocab.json`)
> มีค่า = โหมด UPDATE ให้ **ทบทวนบังคับ** แต่ค่าตั้งต้นคือคงเดิม
> ★ ห้ามเขียน `tags.json` เอง — คืนเป็นบรรทัด `TAGS: …` ให้ controller เขียนแทน
```

- [ ] **Step 5: อัปเดต CLAUDE.md**

§8 บรรทัดรายการ gate — แทนด้วย:

```markdown
13 ขั้น ต้องผ่านทั้งหมดก่อน push (pre-push hook บังคับซ้ำ):
`update-prices-test` → `dead-ticker-test` → `tag-apply-test` → `tags-test` → `check-reports` (40 error + 13 warning) → `self-test` → `ohlc-test` → `ta-engine-test` → `build` → `build-test` → `engine-exec` → `skeleton-test` → `check-site`
```

§10 — เพิ่มหัวข้อย่อย:

```markdown
- **ระบบ tag ธีมการลงทุน** — `tags-vocab.json` (คลังที่อนุมัติแล้ว) + `tags.json` (symbol → slug) inject ตอน build ลง `dist/` เท่านั้น · **ห้ามเขียน tag ลงไฟล์รายงาน** (freshHash จะทำให้ `updated` ของทั้ง 908 ไฟล์เด้งพร้อมกัน → พังการเรียงหน้าแรก + dedup 7 วัน + staleness) · **`tools/tag-apply.js` เป็นทางเข้าเดียวที่เขียน `tags.json`** ห้ามแก้มือ ห้าม worker เขียนเอง (race แบบ `pick-brand.js`) · lifecycle: NEW ติดใหม่ · UPDATE ทบทวนบังคับ (ค่าตั้งต้นคงเดิม) · UPDATE-LIGHT + cron ราคา **ไม่แตะ** · rename → `--rename` · ลบรายงาน → `--prune` → **`docs/templates.md`**
```

- [ ] **Step 6: อัปเดต docs**

`docs/templates.md` — เพิ่มหัวข้อ "ระบบ tag" อธิบาย schema ทั้งสองไฟล์ · ตัวอย่าง entry · คำสั่ง `tag-apply.js` ทุกโหมด · กติกาแกนธีม (ไม่ใช่ category/ขนาด) · ขั้นต่ำ 3 สมาชิก

`docs/quality-gate.md` — เพิ่ม E40 และ W13 ในรายการ E-code พร้อมเงื่อนไขและวิธีแก้

เพิ่ม runbook "เพิ่ม slug ใหม่เข้าคลัง" ใน `docs/templates.md`:

```markdown
### เพิ่มธีมใหม่เข้าคลัง (backfill)
1. เพิ่ม entry ใน `tags-vocab.json` แล้ว bump `version`
2. `npm run test:tags` จะขึ้น warning ว่า `vocabVersion` ตามหลัง = ยังไม่ backfill
3. หา "หุ้นที่ควรได้ธีมใหม่" จากคำโปรยใน `reports.json` แล้วรัน `tag-apply.js` ทีละตัว
   (ไม่ต้องรอให้หุ้นถูก re-analyze ทีละตัวข้ามปี)
4. bump `vocabVersion` ใน `tags.json` ให้เท่ากับ `version` ของคลัง → warning หาย
```

- [ ] **Step 7: รัน verify เต็ม**

```bash
npm run verify 2>&1 | tail -15
```

Expected: ผ่านครบ 13 ขั้น

- [ ] **Step 8: Commit**

```bash
git add _template/ .claude/skills/stock-analyzer/SKILL.md CLAUDE.md docs/ test/skeleton-test.js && git commit -m "$(printf 'docs: lifecycle ของ tag ใน SKILL/skeleton/agent-prompt + เอกสาร gate\n\nskeleton ตัด SECTOR_TAG/NICHE_TAG ออก (ป้ายธีม inject ตอน build)\nNEW ติด tag ใหม่ · UPDATE ทบทวนบังคับแต่ค่าตั้งต้นคงเดิม · UPDATE-LIGHT และ\ncron ราคาไม่แตะ เพราะ tag เป็นฟังก์ชันของธุรกิจไม่ใช่ของราคา\n\nworker ห้ามเขียน tags.json เอง — คืนบรรทัด TAGS: ให้ controller เขียนผ่าน\ntag-apply.js แบบ sequential\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 11: SEO ของหน้า tag + ตรวจครบ (เฟส 5)

**Files:**
- Modify: `test/check-site.js` (`checkTagPages` เพิ่มการตรวจ canonical/sitemap/ไฟล์หลุดราก)

**Interfaces:**
- Consumes: หน้า tag จาก Task 6 · sitemap จาก Task 6
- Produces: การตรวจ SEO ครบตาม spec §11.5 ข้อ 42–45

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เพิ่มใน `checkTagPages` ของ `test/check-site.js` ก่อน `return r;`:

```js
  // SEO: canonical + og + อยู่ใน sitemap
  const sitemap = fs.existsSync(path.join(DIST, 'sitemap.xml')) ? fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8') : '';
  const inMap = new Set([...sitemap.matchAll(/<loc>[^<]*\/tag\/([a-z0-9-]+)<\/loc>/g)].map((m) => m[1]));
  for (const s of have) {
    const html = fs.readFileSync(path.join(tagDir, s + '.html'), 'utf8');
    if (!new RegExp(`<link rel="canonical" href="https://[^"]+/tag/${s}">`).test(html)) r.errors.push(`tag/${s}: canonical ไม่ถูกต้อง`);
    if (!/property="og:title"/.test(html)) r.errors.push(`tag/${s}: ไม่มี og:title`);
    if (!inMap.has(s)) r.errors.push(`tag/${s}: ไม่อยู่ใน sitemap.xml`);
  }
  const dupMap = [...sitemap.matchAll(/<loc>[^<]*\/tag\/([a-z0-9-]+)<\/loc>/g)].map((m) => m[1]);
  if (dupMap.length !== new Set(dupMap).size) r.errors.push('sitemap.xml: URL หน้า tag ซ้ำ');

  // ★ ไฟล์ tag ต้องไม่หลุดมาที่รากของ dist (จะถูก coverage check ฟ้องว่าเป็นรายงานค้าง)
  const rootHtml = fs.readdirSync(DIST).filter((f) => /\.html$/i.test(f) && f.toLowerCase() !== 'index.html').length;
  const srcCount = fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => /\.html$/i.test(f)).length;
  if (rootHtml !== srcCount) r.errors.push(`ไฟล์ .html ในราก dist มี ${rootHtml} ไม่เท่ากับรายงาน ${srcCount} — มีไฟล์หลุดมาที่ราก?`);
```

- [ ] **Step 2: รันให้เห็นสถานะ**

```bash
node build.js >/dev/null && node test/check-site.js 2>&1 | tail -10
```

Expected: ผ่าน (Task 6 ใส่ canonical/og/sitemap ไว้แล้ว) — ถ้า fail ให้แก้ตามข้อความ error ใน `build.js` แล้วรันใหม่

- [ ] **Step 3: ตรวจหน้า tag ในเบราว์เซอร์จริง**

```bash
npx wrangler dev --port 8788
```

เปิด `http://localhost:8788/tag/<slug ตัวใดตัวหนึ่ง>` แล้วยืนยันด้วยตา: การ์ดขึ้นครบ · ปุ่ม "เปิดในหน้ารวม" พาไป `/?tag=<slug>` แล้วหน้าแรกกรองไว้แล้ว · ชิปบนหน้ารายงานคลิกแล้วมาหน้า tag ได้ · โหมดมืดอ่านออก

- [ ] **Step 4: Commit**

```bash
git add test/check-site.js build.js && git commit -m "$(printf 'feat: ตรวจ SEO หน้า tag — canonical/og/sitemap + กันไฟล์หลุดรากของ dist\n\nนับไฟล์ .html ในราก dist เทียบกับจำนวนรายงาน — ถ้าวันหนึ่งมีใครเผลอเขียน\nหน้า tag ลงรากแทน dist/tag/ coverage check จะฟ้องว่าเป็นรายงานค้าง\nซึ่งอ่านไม่ออกว่าต้นเหตุคืออะไร เทสนี้ชี้ตรงจุด\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 12: รายงานสรุปให้เจ้าของ — **ห้าม push ก่อนได้รับอนุมัติ**

**Files:** ไม่แก้ไฟล์

- [ ] **Step 1: รัน verify เต็มครั้งสุดท้าย**

```bash
npm run verify 2>&1 | tail -25
```

Expected: ผ่านครบ 13 ขั้น

- [ ] **Step 2: รวบรวมตัวเลขจริงสำหรับรายงาน**

```bash
node -e "
const fs=require('fs'),T=require('./tools/tag-lib.js');
const v=T.loadVocab(),d=T.loadTags(),m=T.membersOf(d);
const sizes=[...m.values()].map(a=>a.length).sort((a,b)=>b-a);
const cnt=Object.values(d.tags).map(a=>a.length);
console.log('slug ในคลัง       :',v.list.length);
console.log('หุ้นที่ติด tag     :',Object.keys(d.tags).length);
console.log('tag เฉลี่ยต่อหุ้น  :',(cnt.reduce((a,b)=>a+b,0)/cnt.length).toFixed(2));
console.log('หุ้นที่มี tag เดียว:',cnt.filter(x=>x===1).length);
console.log('สมาชิกต่อ tag     : สูงสุด',sizes[0],'· มัธยฐาน',sizes[Math.floor(sizes.length/2)],'· ต่ำสุด',sizes[sizes.length-1]);
console.log('หน้า tag ที่สร้าง  :',fs.readdirSync('dist/tag').length);
console.log('คิวขอคำศัพท์      :',d.requests.length);
"
```

```bash
git diff --stat main...HEAD | tail -3 && git log --oneline main..HEAD | wc -l
```

- [ ] **Step 3: ยืนยันว่าไม่มีไฟล์ใน `reports/` ถูกแตะ**

```bash
git diff --name-only main...HEAD | grep -c '^reports/' || echo "0 — ไม่มีไฟล์รายงานถูกแก้ ✅"
```

Expected: `0 — ไม่มีไฟล์รายงานถูกแก้ ✅`

- [ ] **Step 4: เขียนรายงานสรุปให้เจ้าของ**

ครอบ: จำนวน slug สุดท้ายเทียบกรอบ 80–120 · การกระจายสมาชิกต่อ tag · หุ้นที่ได้ tag เดียวและเหตุผล · คิวขอคำศัพท์ที่รอรีวิว · หน้าใหม่ที่จะเกิดบนเว็บ · ยืนยันว่า `hash`/`updated` ของ 908 รายงานไม่ขยับ · สิ่งที่ยังไม่ได้ทำ (ถ้ามี)

- [ ] **Step 5: หยุด — รอเจ้าของอ่านและอนุมัติ**

**ห้ามรัน `git push` จนกว่าเจ้าของจะยืนยัน** — งานนี้แก้โครงสร้างระบบ (build.js · gate · CLAUDE.md · docs) ไม่เข้าขอบเขต auto-push ตาม CLAUDE.md §5 และเจ้าของสั่งไว้ชัดว่าจะอ่านรายงานก่อน

เมื่อได้รับอนุมัติ:

```bash
npm run verify && git pull --rebase origin main && git push origin HEAD:main
```

---

## หมายเหตุการทำงาน

- **Task 7 และ Task 8 มี checkpoint ของเจ้าของ** — Task 7 Step 4 ต้องหยุดรอ freeze คลังก่อนไป Task 8 เพราะการติด tag 908 ตัวด้วยคลังที่ยังไม่นิ่งคือการทำงานซ้ำทั้งหมด
- **ถ้า Task 8 พบว่าคลังไม่พอ** (มีหุ้นกลุ่มใหญ่ที่ไม่มีธีมเข้ากัน) ให้กลับไป Task 7 เพิ่มธีม แล้วรัน Task 8 ต่อจากแบตช์ที่ค้าง — ไม่ต้องเริ่มใหม่ทั้งหมด
- **เจอ rate limit ตอนใช้ subagent ใน Task 8** → ลดจำนวนที่รันขนานลงครึ่งหนึ่ง (CLAUDE.md §3.3)
- ทุก Task จบด้วย commit เดียว — ถ้า commit ไหนต้องแก้ตามผลเทส ให้ `git commit --amend` ไม่สร้าง commit ซ่อม
