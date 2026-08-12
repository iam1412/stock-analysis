# Stock Tag System — Design Spec

**วันที่:** 12 สิงหาคม 2569 (2026-08-12) · **สถานะ:** อนุมัติแล้ว รอทำ
**ขอบเขต:** ระบบ tag เอกลักษณ์หุ้นทั้งเว็บ — คลังคำศัพท์ · การติด tag 908 ตัว · แสดงผลหน้ารายงาน · กรอง/ค้นหาหน้าแรก · หน้า `/tag/<slug>` · gate + test

---

## 1. ปัญหา

หน้ารายงานแต่ละตัวมีป้าย 3 อันในหัวเรื่อง (`<span class="tag">`) — วัดจากไฟล์จริงทั้ง 908 ไฟล์:

| ตัวชี้วัด | ค่าจริง |
|---|---|
| รายงาน | 908 ไฟล์ |
| ป้ายต่อไฟล์ | **3 span เป๊ะทุกไฟล์** (exchange · sector · niche) |
| ค่าป้ายไม่ซ้ำ | **2,248 ค่า** จาก 2,724 span |
| ค่าที่ปรากฏครั้งเดียว | **2,084 ค่า (93%)** |
| gate ที่ตรวจป้าย | **ไม่มีเลย** |

ป้ายเป็น free-text ล้วน — `Aerospace & Defense` กับ `Aerospace &amp; Defense` นับเป็นคนละค่า ⇒ **จัดกลุ่มไม่ได้โดยธรรมชาติ** ต้องสร้างคลังคำศัพท์ใหม่ ไม่ใช่ normalize ของเดิม

**เป้าหมาย:** ให้หุ้นทุกตัวมี tag ที่จับกลุ่มได้ · คลิก tag แล้วเห็นหุ้นทั้งกลุ่ม · ค้นหา "AI" แล้วได้รายการหุ้น AI ทั้งหมด

---

## 2. ข้อจำกัดที่กำหนดสถาปัตยกรรม

### 2.1 hash churn (ข้อจำกัดหลัก)

[build.js:569](../../../build.js) — `updated` ของแต่ละรายงานมาจาก `freshHash(content)` ของไฟล์ HTML

> **ถ้าเขียน tag ลงไฟล์รายงานทั้ง 908 ตัว → ทุกตัวได้ `updated` = วันเดียวกันพร้อมกัน**

ผลกระทบ 3 ชั้น:
1. หน้าแรกเรียง "ล่าสุด" ยุบเป็นเรียงตามชื่อย่อ (tie-break)
2. กฎ dedup ≤7 วัน (CLAUDE.md §3.1) มองว่าทั้งคลังสด → **บล็อกการวิเคราะห์ซ้ำทั้งเว็บ 1 สัปดาห์**
3. staleness 45/120 วัน (W09) รีเซ็ตยกชุด

⇒ **ห้ามแตะไฟล์ใน `reports/`** ตรงกับกฎรีโปที่มีอยู่: *"การตกแต่งทุกอย่าง inject ตอน build — ห้ามแก้ไฟล์รายงานเพื่อเรื่องดีไซน์"* (CLAUDE.md §10)

### 2.2 โครงป้ายในไฟล์จริง

วัดแล้วทั้ง 908 ไฟล์: span ทั้ง 3 อยู่ **ติดกันเป็นบล็อกเดียว** เสมอ · span แรกเป็นป้ายตลาด · 891 ตัวรูปแบบ `<EXCHANGE>: <SYMBOL>` ตรงเป๊ะ · **17 ตัวมีข้อความพิเศษ**:

```
NASDAQ: ASML (ADR)        NYSE: CCJ / TSX: CCO       OTC Markets: FANUY (ADR)
NASDAQ: GOOGL / GOOG      NYSE American: IMO         NASDAQ: LANC → MZTI
```

⇒ กติกา inject: **เก็บข้อความ span แรกไว้เป๊ะ ๆ ห้าม parse** แค่ห่อเป็นลิงก์ · แทนเฉพาะ span 2–3

### 2.3 check-site มองไฟล์ราก dist ว่าเป็นรายงาน

[check-site.js:204](../../../test/check-site.js) — `readdirSync(DIST)` ไม่ recursive และไฟล์ `.html` ทุกไฟล์ในราก `dist/` ที่ไม่ใช่ `index.html` ถูกนับเป็นรายงาน

⇒ **หน้า tag ต้องอยู่ `dist/tag/<slug>.html`** ไม่ใช่ราก ไม่งั้น gate ฟ้อง "รายงานเกินใน dist"

### 2.4 check-reports เป็น per-file ล้วน

`checkHtml(html, name)` ตรวจทีละไฟล์ · `npm test -- <SYM>` กรองเหลือไฟล์เดียว ⇒ **check ระดับคลัง (bijection/orphan/min-members) ใส่ใน CHECKS ไม่ได้** จะ false-fire ตอนรันไฟล์เดียว → ต้องแยก runner

---

## 3. สถาปัตยกรรม

### 3.1 การตัดสินใจ: sidecar JSON + build-time injection

เก็บ tag เป็น **ไฟล์ JSON committed** ไม่ใช่ database เพราะ:
- tag เปลี่ยนตอนวิเคราะห์เท่านั้น ไม่เปลี่ยน runtime — ไม่ต้องการ write path ตอน serve
- เว็บเป็น static asset ล้วน (Worker แตะแค่ `/api/*`) — ใส่ D1/DO = เพิ่ม latency + failure mode ให้หน้าแรกโดยไม่ได้อะไรกลับ
- มีแบบอย่างในรีโปแล้ว: `tools/seeds.json` (สีแบรนด์) · `tools/symbol-map.json` · `price-flags.json`

**ทางเลือกที่พิจารณาแล้วตัดทิ้ง:**

| ทางเลือก | เหตุผลที่ไม่เอา |
|---|---|
| เขียน tag ลง HTML + แก้ `freshHash` ให้ strip บล็อก tag | ทำได้ (เทคนิคเดียวกับ `ai-model`) แต่ได้ diff 908 ไฟล์ + เสี่ยง regex พลาดกับ header 17 ตัวที่ผิดแบบ แลกกับข้อดี = ไม่มี |
| D1 / Durable Object | tag ไม่ใช่ข้อมูล runtime · ไม่ต้องการ index · เพิ่ม deploy surface + จุดล้มให้หน้าแรก |
| ไฟล์เดียวรวม vocab + assignment | vocab ต้อง freeze/รีวิว แต่ assignment เปลี่ยนทุกการวิเคราะห์ — คนละอายุการใช้งาน ต้องแยก |

### 3.2 ไฟล์และ schema

**`tags-vocab.json`** (ราก · คลังคำศัพท์ที่อนุมัติแล้ว · แก้ผ่านการรีวิวเท่านั้น)

```jsonc
{
  "version": 1,
  "tags": [
    {
      "slug": "ai-datacenter",              // ASCII kebab — ใช้เป็น URL
      "label": "AI Data Center",            // ข้อความบนป้าย (ไทย/อังกฤษตามที่คนเรียกจริง)
      "aliases": ["ai", "เอไอ", "ดาต้าเซ็นเตอร์", "data center", "hyperscaler"],
      "desc": "ผู้ได้ประโยชน์จากการสร้างคลัสเตอร์ AI"   // ใช้บนหน้า /tag/<slug>
    }
  ]
}
```

**`tags.json`** (ราก · การติด tag ต่อหุ้น · controller เขียนคนเดียว)

```jsonc
{
  "vocabVersion": 1,                        // เวอร์ชันคลังที่ใช้ตอนติดครั้งล่าสุด
  "tags": {
    "LITE": ["ai-datacenter", "optical-photonics"],
    "CPN":  ["thai-consumption", "retail-property"]
  },
  "requests": [                             // คิวขอเพิ่มคำศัพท์ รอเจ้าของรีวิว
    { "symbol": "XYZ", "theme": "LiDAR ยานยนต์", "at": "2026-08-14", "mode": "UPDATE" }
  ]
}
```

**กติกาการเขียน (บทเรียน `seeds.json` race):**
`tools/pick-brand.js` เป็น read-modify-write ที่ไม่มี lock — รันขนาน 2 ตัว entry ทับหาย (CLAUDE.md §10)
⇒ **worker ห้ามเขียน `tags.json` เอง** ทุกกรณี · controller เขียนคนเดียวผ่าน `tools/tag-apply.js` แบบ sequential

### 3.3 `tools/tag-apply.js` (เครื่องมือใหม่ — ทางเข้าเดียวที่เขียน tags.json)

```bash
node tools/tag-apply.js <SYM> <slug> [<slug> …]     # ติด/แทน tag
node tools/tag-apply.js <SYM> --keep                # ยืนยันคงเดิม (bump ไม่มีอะไรเปลี่ยน)
node tools/tag-apply.js <SYM> --request "<ธีม>"     # เพิ่มคิวขอคำศัพท์ใหม่
node tools/tag-apply.js --rename <OLD> <NEW>        # ย้าย key ตาม symbol-map
node tools/tag-apply.js --prune                     # ลบ entry ที่ไม่มีไฟล์รายงานแล้ว
```

validate ก่อนเขียนเสมอ: slug ∈ vocab · 1–3 ตัว · ไม่ซ้ำ · มีไฟล์ `reports/<SYM>.html` จริง
เขียนแบบ atomic (เขียน temp แล้ว rename) · ผิดข้อใดข้อหนึ่ง = **ไม่เขียนไฟล์เลย** พร้อมบอกเหตุผล

---

## 4. แกนของ tag + กติกาคลังคำศัพท์

**แกนเดียว: ธีม/เรื่องราวการลงทุน** — ตอบ *"หุ้นตัวนี้เล่นเรื่องอะไร"* ไม่ใช่ *"อยู่หมวดไหน"*

```
✅  ai-datacenter · glp-1 · nuclear-smr · cybersecurity · thai-tourism
    power-grid · optical-photonics · defense-rearm · pet-economy
❌  Technology · Financial Services · Healthcare        ← category ไม่ใช่ tag
```

| กติกา | ค่า |
|---|---|
| tag ต่อหุ้น | **2–3** (เป้า) · 1 ได้เมื่อไม่มีธีมที่ซื่อสัตย์พอ → W13 ขึ้นให้รีวิว **ห้ามยัด tag ขยะให้ครบ** |
| ขนาดคลัง | **80–120 slug** |
| ขั้นต่ำสมาชิก | **3 หุ้น/tag** — กันย้อนกลับไปเป็น singleton 2,084 ค่า |
| ค่าเฉลี่ยที่คาด | 908 × 2.5 ÷ 100 ≈ **23 หุ้น/tag** |
| slug | `^[a-z0-9-]+$` · ไม่ซ้ำ |
| alias | ไม่ชนกันข้าม slug (กันชิปค้นหากำกวม) |

หุ้นที่ไม่มีธีมชัด (แบงก์ภูมิภาค/อาหารพื้นบ้าน) → คลังต้องมีธีมกว้างรองรับ เช่น `thai-consumption`, `dividend-income-th`

---

## 5. แสดงผลบนหน้ารายงาน

`decorateReport()` เขียนแถวป้ายใหม่ตอน build (เฉพาะใน `dist/` — ไฟล์ต้นฉบับไม่ถูกแตะ):

```
เดิม:  [NASDAQ: LITE] [Technology • Optical Components] [AI Data Center • CPO Laser]
ใหม่:  [NASDAQ: LITE] [AI Data Center] [Optical & Photonics]
        └→ /?market=US  └→ /tag/ai-datacenter  └→ /tag/optical-photonics
```

- **ชิป tag ชี้หน้า `/tag/<slug>` ไม่ใช่ `/?tag=`** — ลิงก์ภายในจาก 908 หน้ารายงานไปหน้า tag เป็น crawlable link ที่ Google เดินตามได้ ส่วน query param มักไม่ถูก index ⇒ ได้ทั้ง UX และ SEO จากลิงก์ชุดเดียว (`?tag=` ยังใช้อยู่ แต่เป็นสถานะตัวกรองของหน้าแรก §6)
- span แรก: **ข้อความคงเดิมเป๊ะ** ห่อเป็น `<a>` · ปลายทางมาจาก `metrics.market` (TH/US) **ไม่ derive จากข้อความ** — กันเคส `NYSE: CCJ / TSX: CCO`
- span 2–3: แทนด้วยชิปจาก `tags.json` (จำนวนตามที่ติดจริง 1–3 อัน)
- `.tag` เป็น CSS pill อยู่แล้ว → เพิ่มแค่ `text-decoration:none;color:inherit` + hover ไม่แตะระบบดีไซน์
- หุ้นไม่มี entry ใน `tags.json` → **throw ดังๆ ตอน build** ไม่ปล่อยแถวว่างเงียบ ๆ

---

## 6. หน้าแรก — กรองและลิงก์

ต่อยอดจากสคริปต์เดิมที่มี `marketOK()` / `searchOK()` อยู่แล้ว ([build.js:800](../../../build.js)):

- การ์ดได้ attribute ใหม่ `data-tags="ai-datacenter optical-photonics"`
- เพิ่ม `tagOK(c)` เข้า `recompute()` — กรองฝั่ง client ทั้งหมด **ไม่ต้องแก้ Worker เลย**
- อ่าน `?tag=` / `?market=` ตอนโหลด · `history.replaceState` ตอนเปลี่ยนตัวกรอง ⇒ ลิงก์แชร์ได้
- ชิปตัวกรองที่ทำงานอยู่ `🏷 AI Data Center · 37 หุ้น ✕`
- แถว "แท็กยอดนิยม" ~12 อันไว้ให้เดินสำรวจ
- `reports.json` (ทั้งตัวราก และตัว public ใน dist) ได้ฟิลด์ `tags: string[]` เพิ่ม — build เขียนเอง

---

## 7. ค้นหา

### 7.1 กับดักที่ต้องเลี่ยง

ช่องค้นหาปัจจุบันเป็น `indexOf` substring บน `data-search` — **ถ้ายัด tag เข้าไปตรง ๆ พิมพ์ "ai" จะแมตช์ Thailand, chain, airline, Dubai, retail** ทั้งหมด

### 7.2 วิธี

แยก `data-tags` ออกจาก `data-search` แล้วแมตช์ด้วยฟังก์ชัน pure ที่เทสได้:

```
matchTagQuery(q, vocab) → slug[]

normalize : trim → toLowerCase → ยุบช่องว่างซ้ำ
q สั้นกว่า 2 ตัวอักษร → []
haystack ของแต่ละ entry = [label, ...aliases]

needle ที่เป็นอักษรละติน → ต้อง "ขึ้นต้นคำ"
    (อยู่ตำแหน่ง 0 หรือ ตัวหน้าเป็นอักขระที่ไม่ใช่ตัวอักษร/ตัวเลข: ช่องว่าง - • / ( ) )
needle ที่มีอักขระไทย   → substring ธรรมดา (ภาษาไทยไม่มีเว้นวรรคระหว่างคำ
                          — alias ไทยต้องเป็นคำเฉพาะพอ ความเสี่ยง false positive ต่ำ)
q หลายคำ ("data cen")   → ทุกคำต้องแมตช์ใน haystack เดียวกัน
```

พฤติกรรมที่ผู้ใช้เห็น:

```
พิมพ์ "AI"  →  ┌ 🏷 แท็ก: AI Data Center · 37 หุ้น  [ดูทั้งหมด] ┐   ← ชิปเสนอแท็ก
               └ ผลลัพธ์ = ชื่อที่มี "ai" ∪ หุ้นในแท็ก AI      ┘
คลิก [ดูทั้งหมด] → กรองเฉพาะแท็ก → URL = /?tag=ai-datacenter
```

union ไม่ทำให้ผลเดิมหาย — หุ้นที่ชื่อมี "ai" (AAI, Thai Union) ยังโผล่เหมือนเดิม

---

## 8. หน้า `/tag/<slug>` (เฟส 5 — อยู่ในรอบนี้)

สร้างตอน build ที่ **`dist/tag/<slug>.html`** (ต้องเป็นโฟลเดอร์ย่อย — §2.3)

- สร้างเฉพาะ slug ที่มีสมาชิก ≥1 (ไม่สร้างหน้าเปล่าเข้า sitemap)
- เนื้อหา: `<h1>` = label · คำอธิบายจาก `desc` · การ์ดหุ้นสมาชิกทั้งหมด (ใช้ตัวสร้างการ์ดชุดเดียวกับหน้าแรก) · ลิงก์กลับหน้าแรก
- `<title>` · `<meta name="description">` · `<link rel="canonical" href="<SITE_ORIGIN>/tag/<slug>">` · og tags
- เข้า `sitemap.xml` ทุกหน้า
- **ลิงก์ไขว้:** ชิปบนหน้ารายงาน → `/tag/<slug>` (§5) · หน้า tag มีปุ่ม "เปิดในหน้ารวม →" ชี้ `/?tag=<slug>` เพื่อใช้ตัวเรียง/ตัวกรอง metric ของหน้าแรก · หน้า tag แสดง tag อื่นที่เกี่ยวข้อง (slug ที่มีสมาชิกทับซ้อนมากที่สุด 5 อันดับ) เพื่อให้กราฟลิงก์ภายในเชื่อมถึงกัน

---

## 9. Tag lifecycle

Tag เป็นฟังก์ชันของ **ธุรกิจ** ไม่ใช่ของ **ราคา** — รีโปขีดเส้นนี้ไว้แล้วที่ [SKILL.md:18](../../../.claude/skills/stock-analyzer/SKILL.md) (`drift/mos-flip` = *"ตลาดขยับ ไม่ใช่ธุรกิจเปลี่ยน"*)

| เหตุการณ์ | ธุรกิจเปลี่ยน? | ทำอะไรกับ tag |
|---|:--:|---|
| **NEW** (หุ้นใหม่) | — | ติด tag ใหม่ · ไม่มี entry = E40 error |
| **UPDATE เต็ม** (STEP 5B) | ✅ อาจ | **ทบทวนบังคับ** — เป็นขั้นตอนหนึ่งของ SKILL |
| **UPDATE-LIGHT** (STEP 5C) | ❌ | **ห้ามแตะ** — นิยามคือ "ราคาขยับแรงแต่ไม่มีสัญญาณธุรกิจเปลี่ยน" |
| 5C ยกระดับเป็น UPDATE เต็ม (EPS เกิน ±2%) | ✅ | กลับไปใช้กฎ UPDATE |
| **cron `update-prices.js`** รายวัน | ❌ | ไม่แตะ — patch แค่ตัวเลขโครงสร้าง |
| ticker rename (BKI→BKIH, LANC→MZTI) | ❌ | `tag-apply.js --rename` ตาม `symbol-map.json` |
| ลบรายงาน (delisted/not-on-exchange) | — | `tag-apply.js --prune` ไม่งั้นค้างเป็น orphan |
| เพิ่ม slug ใหม่เข้าคลัง | — | bump `version` → backfill sweep (§9.3) |

### 9.1 "ทบทวน" ≠ "เขียนทับได้อิสระ"

ถ้าทุก UPDATE เปลี่ยน tag ได้ตามใจ คลังจะ drift กลับไปเป็น 2,248 ค่าเดิมภายในไม่กี่เดือน:

- **ค่าตั้งต้น = คงเดิมเสมอ** — ต้องยืนยันพร้อมเหตุผลถึงจะเปลี่ยนได้
- worker เลือกได้เฉพาะ slug ที่มีในคลัง
- คิดว่าต้องมี slug ใหม่ → `--request` เข้าคิวรอเจ้าของรีวิว **ไม่ apply เอง**
- ยกเว้นกรณีเดียวที่ต้องหยุดถามทันที: **หุ้น NEW ที่ไม่มี slug ไหนในคลังเข้ากันเลย** (ปล่อยไปจะทำ E40 ตกและ push ไม่ได้)

### 9.2 ต้นทุนต่อหุ้น ≈ 0

ไม่ยัดคลัง ~100 บรรทัดลง prompt worker ทุกใบ (= ~2k token × ทุกการวิเคราะห์ตลอดไป) เพราะ UPDATE ส่วนใหญ่ธีมไม่เปลี่ยน

prompt พก tag ปัจจุบันไปบรรทัดเดียว:

```
=== TAGS ปัจจุบัน === AI Data Center · Optical & Photonics
```

worker คืนบรรทัดเดียวตอนจบ:

```
TAGS: คงเดิม                                        ← กรณีปกติ ~95%
TAGS: เปลี่ยน — ขายธุรกิจ optical ออก หันไปทำ LiDAR ยานยนต์
```

controller เห็น "เปลี่ยน" ค่อยเปิดคลังแล้วรัน `tag-apply.js` ในชุดคำสั่ง verify+push เดิมตาม CLAUDE.md §3.4 — **ไม่เพิ่ม turn**

### 9.3 กันระบบเน่าเมื่อคลังโต

`tags.json.vocabVersion` < `tags-vocab.json.version` = ยังไม่ backfill → warning
เมื่อเพิ่ม slug ใหม่ (เช่น `quantum-computing`) รัน classification pass **เฉพาะ slug ใหม่** ข้ามทั้งคลัง แล้ว bump — ถูกกว่ารอบแรกมาก ไม่ต้องรอให้หุ้นถูก re-analyze ทีละตัวข้ามปี

---

## 10. Quality gate

E01–E39 และ W01–W12 ถูกใช้แล้ว ⇒ code ใหม่เริ่มที่ **E40 / W13**

### 10.1 ต่อไฟล์ — เพิ่มใน `test/check-reports.js`

| id | ระดับ | ตรวจอะไร |
|---|---|---|
| **E40** | error | หุ้นนี้มี entry ใน `tags.json` · มี 1–3 slug · ทุก slug ∈ คลัง · ไม่ซ้ำกันเอง |
| **W13** | warn | หุ้นมี tag เดียว (ควรรีวิวว่าหาธีมที่สองได้ไหม) |

per-file ⇒ `npm test -- <SYM>` ยังใช้ได้ตามปกติ

### 10.2 ระดับคลัง — ไฟล์ใหม่ `test/tags-test.js`

แยกออกมาเพราะ §2.4 (`checkHtml` เป็น per-file · corpus check จะ false-fire ตอนกรองไฟล์เดียว)

| ตรวจ | ระดับ |
|---|---|
| ทุก `reports/<SYM>.html` มี entry ใน `tags.json` | error |
| ทุก key ใน `tags.json` มีไฟล์รายงานจริง (orphan หลังลบหุ้น delisted) | error |
| ทุก slug ที่ถูกใช้ ∈ คลัง (dangling ref หลัง rename/ลบ slug) | error |
| slug ในคลังไม่ซ้ำ · ตรง `^[a-z0-9-]+$` · `label` ไม่ว่าง | error |
| alias ไม่ชนกันข้าม slug | error |
| key ใน `tags.json` ไม่ใช่ชื่อเก่าที่อยู่ใน `symbol-map.json` (rename ที่ลืมย้าย key) | error |
| tag มีสมาชิก <3 | warn |
| slug ในคลังที่ไม่มีใครใช้ | warn |
| `vocabVersion` < `version` ของคลัง (ยังไม่ backfill) | warn |
| `requests[]` ไม่ว่าง (คิวรอรีวิว) | warn |

### 10.3 verify chain

เพิ่มเป็น **13 ขั้น** (เดิม 11) — `tag-apply-test` → `tags-test` แทรกก่อน `check-reports` เพราะ E40 พึ่งความถูกต้องของไฟล์ tag และไฟล์ tag พึ่งความถูกต้องของเครื่องมือที่เขียนมัน:

```
update-prices-test → dead-ticker-test → tag-apply-test → tags-test → check-reports
→ self-test → ohlc-test → ta-engine-test → build → build-test → engine-exec
→ skeleton-test → check-site
```

> CLAUDE.md §8 เขียนว่า "39 error + 11 warning" แต่ของจริงคือ 39 E + **12 W** — แก้ตัวเลขให้ตรงตอนอัปเดตเอกสารด้วย

---

## 11. Test cases

### 11.1 `test/build-test.js` — unit ของฟังก์ชัน inject

| # | เคส | คาดหวัง |
|---|---|---|
| 1 | หุ้นปกติ 2 tag | span แรกเป็น `<a href="/?market=US">` ข้อความเดิม · ชิป 2 อันเป็น `<a href="/tag/<slug>">` |
| 2 | exchange พิเศษ 3 แบบ (`ASML (ADR)` · `CCJ / TSX: CCO` · `FANUY (ADR)`) | ข้อความคงเดิม **เป๊ะตัวอักษรต่อตัวอักษร** |
| 3 | market mapping | SET/MAI → `/?market=TH` · NYSE/NASDAQ/OTC/TSX → `/?market=US` · **derive จาก `metrics.market` ไม่ใช่ข้อความ** (เคส CCJ มี "TSX" ในข้อความแต่เป็นหุ้น US) |
| 4 | label มี `&` `<` `"` | escape ถูกต้อง ไม่หลุดเป็น markup |
| 5 | หุ้นไม่มี entry ใน `tags.json` | **throw** พร้อมชื่อ symbol (ไม่เงียบ) |
| 6 | รายงานที่มี tag span ≠ 3 | **throw** (กัน regex กินผิดตำแหน่ง) |
| 7 | inject ซ้ำ 2 รอบ | ผลเท่ากัน (idempotent) |
| 8 | **`freshHash` ไม่ขึ้นกับ tag** — คำนวณ hash ของ source เดิม แล้วเปลี่ยน `tags.json` แล้วคำนวณซ้ำ | **เท่ากันเป๊ะ** — พิสูจน์ว่า tag ไม่ทำให้ `updated` ขยับ (§2.1) · เสริมด้วยการตรวจครั้งเดียวตอนเฟส 2: `hash` ทั้ง 908 รายการใน `reports.json` ต้องไม่เปลี่ยนจากก่อนลงระบบ |
| 9 | การ์ด index | มี `data-tags` ครบ · `reports.json` มีฟิลด์ `tags` |
| 10 | `matchTagQuery("ai")` | ได้ `ai-datacenter` · **ไม่ได้** slug ที่ label มี "ai" กลางคำ (`thai-consumption`, `retail-*`) |
| 11 | `matchTagQuery("เอไอ")` | แมตช์ผ่าน alias ไทย |
| 12 | `matchTagQuery("data cen")` | แมตช์หลายคำแบบ prefix |
| 13 | `matchTagQuery("xyz")` / `matchTagQuery("a")` | คืน `[]` ทั้งคู่ (ไม่แมตช์ / สั้นเกิน) |
| 14 | ค้นชื่อเดิมยังทำงาน | หุ้นที่ชื่อมี "ai" (AAI, Thai Union) ยังอยู่ในผลลัพธ์ (union ไม่กลืนผลเดิม) |

### 11.2 `test/tags-test.js` — corpus (ทุกข้อใน §10.2 เป็นเคสทดสอบในตัว)

รันกับข้อมูลจริงทั้งคลัง + fixture สังเคราะห์สำหรับด้านลบ:

| # | เคส | คาดหวัง |
|---|---|---|
| 15 | ข้อมูลจริงทั้งคลัง | ผ่าน 0 error |
| 16 | fixture: ลบ entry ของหุ้นหนึ่งออก | จับได้ (bijection ทาง 1) |
| 17 | fixture: เพิ่ม key ที่ไม่มีไฟล์รายงาน | จับได้ (orphan) |
| 18 | fixture: slug ที่ไม่มีในคลัง | จับได้ (dangling) |
| 19 | fixture: slug ซ้ำในคลัง / slug มีตัวพิมพ์ใหญ่ | จับได้ทั้งคู่ |
| 20 | fixture: alias เดียวกันอยู่ 2 slug | จับได้ |
| 21 | fixture: key เป็นชื่อเก่าที่อยู่ใน `symbol-map.json` | จับได้ |
| 22 | fixture: tag มีสมาชิก 2 ตัว | warn (ไม่ใช่ error) |
| 23 | fixture: `vocabVersion` < `version` | warn |

### 11.3 `test/self-test.js` — meta-test พิสูจน์ว่า E40/W13 ยิงจริง

ตามกติกา fixture ที่มีอยู่: derive จากรายงานจริง ณ ตอนรัน · **mutation ที่ apply แล้วไม่เปลี่ยนอะไร = fail ทันที**

| # | mutation | คาดหวัง |
|---|---|---|
| 24 | baseline (BBL สะอาด) | E40 ไม่ยิง · W13 ไม่ยิง |
| 25 | ลบ entry ของ BBL ออกชั่วคราว | **E40 ยิง** |
| 26 | ใส่ slug ที่ไม่มีในคลัง | **E40 ยิง** |
| 27 | ใส่ 4 slug | **E40 ยิง** |
| 28 | ใส่ slug ซ้ำกัน 2 ตัว | **E40 ยิง** |
| 29 | เหลือ slug เดียว | **W13 ยิง · E40 ไม่ยิง** |

### 11.4 `test/tag-apply-test.js` — เครื่องมือเขียนไฟล์ (ไฟล์ใหม่)

| # | เคส | คาดหวัง |
|---|---|---|
| 30 | slug นอกคลัง | ปฏิเสธ · **ไม่เขียนไฟล์** |
| 31 | 4 slug / slug ซ้ำ / 0 slug | ปฏิเสธทั้งหมด |
| 32 | symbol ที่ไม่มีไฟล์รายงาน | ปฏิเสธ |
| 33 | `--rename OLD NEW` | key ย้าย · ค่าเดิมคงอยู่ · OLD หายไป |
| 34 | `--prune` | ลบเฉพาะ entry ที่ไม่มีไฟล์ · ตัวอื่นไม่กระทบ |
| 35 | `--request` | ต่อท้าย `requests[]` · ไม่แตะ `tags` |
| 36 | เขียนสำเร็จ | JSON ยัง parse ได้ · key เรียงคงที่ (diff อ่านง่าย) · ปิดท้ายด้วย newline |
| 37 | เขียนล้มเหลวกลางคัน | ไฟล์เดิมไม่เสียหาย (atomic rename) |

### 11.5 `test/check-site.js` — ระดับ dist (ของจริงหลัง build)

| # | เคส | คาดหวัง |
|---|---|---|
| 38 | ทุกหน้ารายงานใน dist | มีชิปเป็น `<a href="/tag/<slug>">` ครบตาม `tags.json` · ไม่มี `{{` ค้าง |
| 39 | href ทุกอันบนชิป | มีไฟล์ `dist/tag/<slug>.html` อยู่จริง (**ไม่มีลิงก์ตายสักเส้น** — 908 หน้า × 2–3 ลิงก์) |
| 40 | หน้า `/tag/<slug>.html` | มีครบทุก slug ที่มีสมาชิก ≥1 · **ไม่มี slug ที่ไม่มีสมาชิก** |
| 41 | จำนวนการ์ดในแต่ละหน้า tag | = จำนวนสมาชิกของ slug นั้นเป๊ะ |
| 42 | หน้า tag | มี `<title>` · `<h1>` เดียว · canonical ชี้ `<SITE_ORIGIN>/tag/<slug>` |
| 43 | `sitemap.xml` | มีหน้า tag ครบ ไม่ซ้ำ |
| 44 | **ไม่มีไฟล์ tag หลุดมาที่ราก `dist/`** | จำนวนไฟล์รากยังเท่ากับจำนวนรายงาน + index (§2.3) |
| 45 | index.html | ทุกการ์ดมี `data-tags` · แถวแท็กยอดนิยมชี้ slug ที่มีจริง |

---

## 12. แผนงาน

| เฟส | งาน | ผลลัพธ์ | เกณฑ์ผ่าน |
|---|---|---|---|
| **1** | สร้างคลังจากสำมะโน 2,248 ป้ายเดิม + คำโปรย 908 ตัว → จัดกลุ่มเป็น ~100 ธีม | `tags-vocab.json` | **★ เจ้าของรีวิว + freeze** |
| **2** | ท่อ: `tag-apply.js` · build inject · **หน้า `/tag/<slug>` แบบพื้นฐาน** · UI หน้าแรก · ค้นหา · CSS — spike กับ 1 รายงานแล้วรัน gate เต็มก่อน แล้วขยายเป็น seed ~20 ตัว | build.js, tags.json (seed) | เทส 1–14, 30–37, 40–41, 44 ผ่าน · `npm run verify` ผ่าน |
| **3** | ติด tag ครบ 908 ตัว — batch ละ ~40 หุ้น (อ่าน symbol+ชื่อ+คำโปรย+ป้ายเดิมจาก `reports.json`) ~23 batch · pin `model:"sonnet"` ตาม CLAUDE.md §3.2 · controller เขียนไฟล์ sequential | `tags.json` เต็ม | 908/908 · เทส 15–23 ผ่าน |
| **4** | gate: E40 · W13 · `tags-test.js` · self-test · skeleton · SKILL.md · agent-prompt.md · docs | ระบบกันเน่า | เทส 24–29 ผ่าน · verify 13 ขั้นผ่าน |
| **5** | SEO ของหน้า tag: canonical · og · sitemap · ลิงก์ไขว้ + tag ที่เกี่ยวข้อง | ~100 หน้าพร้อม index | เทส 38–39, 42–43, 45 ผ่าน |

> ⚠️ **ลำดับบังคับ:** ชิปบนหน้ารายงานชี้ `/tag/<slug>` (§5) ⇒ **หน้า tag ต้องเกิดพร้อมชิปในเฟส 2** ไม่ใช่เฟส 5 ไม่งั้นได้ลิงก์ตายทั้งเว็บระหว่างเฟส 2–4 · เฟส 5 เหลือเฉพาะงาน SEO ที่ต่อยอดบนหน้าที่มีอยู่แล้ว

**ต้นทุนเฟส 3 ต่ำ:** อ่านจาก `reports.json` ที่มี `desc` ครบอยู่แล้ว → ไม่เปิดไฟล์ HTML สักไฟล์ · ไม่ fetch ราคา/งบ · ไม่แตะเลขการเงิน

---

## 13. เอกสาร/ไฟล์ที่ต้องแก้

| ไฟล์ | แก้อะไร |
|---|---|
| `build.js` | อ่าน 2 ไฟล์ tag · `renderTagRow()` ใน `decorateReport` · `data-tags` บนการ์ด · `tagOK`/URL param ในสคริปต์ index · `matchTagQuery` · แถวแท็กยอดนิยม · ฟิลด์ `tags` ใน manifest · สร้าง `dist/tag/*` + sitemap |
| `tools/tag-apply.js` | **ใหม่** — ทางเข้าเดียวที่เขียน `tags.json` |
| `test/tags-test.js` · `test/tag-apply-test.js` | **ใหม่** |
| `test/check-reports.js` | E40 · W13 |
| `test/self-test.js` · `test/build-test.js` · `test/check-site.js` | เคสตาม §11 |
| `package.json` | `test:tags` · `test:tagapply` · `verify` เป็น **13 ขั้น** |
| `_template/skeleton-{th,us}.html` | ตัด `{{SECTOR_TAG}}` / `{{NICHE_TAG}}` เหลือ exchange |
| `_template/dashboard.css` | `.tag` เป็นลิงก์ (`text-decoration:none` + hover) |
| `.claude/skills/stock-analyzer/SKILL.md` | STEP 5A ติด tag · STEP 5B ทบทวนบังคับ · STEP 5C ห้ามแตะ · บรรทัด `TAGS:` ตอนคืนงาน |
| `_template/agent-prompt.md` | บล็อก `=== TAGS ปัจจุบัน ===` · **ห้าม worker เขียน `tags.json`** |
| `CLAUDE.md` | §8 verify **13 ขั้น** (+แก้ "11 warning" → 12 ให้ตรงของจริง) · §10 ระบบ tag |
| `docs/templates.md` · `docs/quality-gate.md` | schema tag · E40/W13 |

---

## 14. ความเสี่ยงและการถอย

| ความเสี่ยง | การรับมือ |
|---|---|
| **คุณภาพคลังคำศัพท์** — หยาบไปกลายเป็น category · ละเอียดไปได้ singleton อีก | เฟส 1 มี checkpoint ให้เจ้าของ freeze ก่อนติดจริง 908 ตัว · กติกาขั้นต่ำ 3 สมาชิกบังคับผ่าน gate |
| ป้ายเดิม 2 อันหายจากหน้าจอ | ยังอยู่ในไฟล์ต้นฉบับครบ — **ถอยได้ด้วยการลบโค้ด inject** ไม่ต้องกู้ข้อมูล |
| worker เขียน `tags.json` ขนานกันจน entry หาย | ห้ามเด็ดขาดใน SKILL + agent-prompt · ทางเข้าเดียวคือ `tag-apply.js` ที่ controller รัน sequential |
| tag ค้างหลังลบหุ้น delisted | `--prune` + gate จับ orphan เป็น error |
| หน้า tag หลุดมาที่ราก dist → gate ฟ้องเป็นรายงานเกิน | บังคับ `dist/tag/` + เทสข้อ 44 |
| งานนี้แก้โครงสร้างระบบ | **ไม่เข้าขอบเขต auto-push (CLAUDE.md §5)** — สรุปให้เจ้าของดูก่อน push ทุกครั้ง |

---

## 15. ข้อสมมติที่ยืนยันแล้ว

1. **"วิเคราะห์ใหม่ทุกตัว" = classification pass** ไม่ใช่ re-run stock-analyzer — เลขการเงิน/ราคา/FV ไม่ถูกแตะ
2. ป้ายเดิม sector/niche **ถูกแทนที่ในการแสดงผล** (ต้นฉบับไม่แตะ)
3. แกน tag = **ธีม/เรื่องราวการลงทุน** อย่างเดียว (ไม่เอาสไตล์ลงทุน/ขนาด/อุตสาหกรรม)
4. **UPDATE เต็มบังคับทบทวน tag**
5. **เฟส 5 อยู่ในรอบนี้**
