# เกณฑ์จบระยะ 2 — ผลวัดจริง 14 ก.ย. 2569

> วัดบน worktree `stock-analyzer-audit-9678cd` สาขา `claude/audit-p2-f-prose` (ส่วน A–E merge main แล้ว · ส่วน F = สาขานี้) · เวลาไทย (UTC+7)
> เกณฑ์ 3 ข้อมาจาก spec §6 แถว **"2 · แก้ต้นตอ"**: `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md`
> ★ **ทุกตัวเลขในไฟล์นี้วัดใหม่บนสาขานี้** ไม่ได้ลอกจาก ledger · ทุกช่อง "คำสั่ง" คัดลอกไปรันซ้ำได้ตรง ๆ จากรากรีโป
> ★ คลังวันที่วัด: **865 ใบ v2 · 43 ใบ v1** (rev ของ census: `migration-v2-census.{json,md}` โฟลเดอร์เดียวกัน)

## 0. สรุป — ผ่าน 3/3

| # | เกณฑ์ (spec §6 แถว "2") | ค่าที่วัดได้ | ผล |
|---|---|---|---|
| 1 | **สำเนาต่อค่า = 1** | ใบ v2 **865 ใบ** · ใบที่ยังมี literal ใน site บังคับ **0** · pseudo-error `V2TOKENS` ยิง **0/908** บน gate จริง | ✅ |
| 2 | **regex ถอดค่า = 0 ใน cron/gate (ทาง v2)** — ใช้ถ้อยคำแคบตาม ruling Task 12 **R5** | `test/v2-path-test.js` **355/355 ผ่าน** — ค่าของช่องสำเนามาจาก JSON · cron ไม่เขียนช่องสำเนาด้วย regex · regex ที่เหลือเป็นตัวตรวจความสอดคล้อง | ✅ (ตามนิยาม R5) |
| 3 | **`--heal-derived` ไม่จำเป็นอีก** | `node tools/update-prices.js --heal-derived` → **`heal-derived: 0/908 ไฟล์มีค่าค้าง • แก้ 0 จุด`** (ทั้ง v1 และ v2) | ✅ |

**ตัวเลขประกอบ** (ข้อ 5): coverage ต่ำสุด **47/68** (v2) / 47/71 (v1) · warning รวม **247** (W22 ไม่ลด · W23 109→105) · residue v1 **43 ใบ 7 ชนิด** · cron รอบแรกบน v2 = **patch 0 ใบ · patch-failed 0** (อธิบายไว้ตรง ๆ ว่าทำไมจึงยังไม่ใช่หลักฐานของ write path)

---

## 1. เกณฑ์ 1 — สำเนาต่อค่า = 1

**นิยามที่ใช้วัด:** ใบ v2 ต้องมี token `{{rd:…}}` ที่ **ทุก site บังคับ** ในไฟล์ต้นฉบับ (ก่อน `expandReport`) —
ไม่ใช่ "ไม่มีตัวเลขที่ไหนเลย" (การ์ดบางใบคง literal ไว้โดยตั้งใจ และ `patchDerived` ยังเขียนทับได้)
site บังคับ 6 ช่องคือช่องที่ **cron ทาง v2 ไม่มีตัวเขียน HTML ให้แล้ว** ⇒ กลับเป็น literal เมื่อไร ค่าค้างถาวร:
`.px` → `{{rd:px}}` · `.chg` → `{{rd:chg}}` · วันที่ราคาใน `<header>` → `{{rd:priceDate}}` · `#pxIn` → `{{rd:pxNum}}` ·
`.big` → `{{rd:mos}}` · class ของกล่อง verdict → `{{rd:mosClass}}`

**กลไกบังคับ = pseudo-error `V2TOKENS`** (`test/check-reports.js` · รายการ site เป็นเจ้าของเดียวที่ `RV.REQUIRED_TOKEN_SITES` ใน `tools/report-values.js`)
— pseudo-id แบบเดียวกับ `V2SCHEMA`/`EXPAND`: อยู่นอกตาราง `CHECKS` ⇒ **ไม่มี E-code ใหม่ · ไม่ขยับจำนวน 48 error + 19 warning ที่ `gen-docs` นับ**
(residual ที่ยอมรับ เหมือน `V2SCHEMA`: ไม่ถูกนับในเลข "N/48" ของไฟล์นั้น)

```bash
# (ก) นับใบ v2/v1 + ใบที่ยังมี literal ใน site บังคับ — อ่าน source ตรง ๆ ไม่ผ่าน gate
rtk proxy node -e '
const fs=require("fs"),path=require("path"),RM=require("./tools/report-meta.js"),RV=require("./tools/report-values.js");
let v2=0,v1=0,bad=[];
for(const f of fs.readdirSync("reports").filter(f=>/\.html$/i.test(f)).sort()){
  const s=fs.readFileSync(path.join("reports",f),"utf8"),r=RM.readReportData(s);
  if(!(r.ok&&RV.isV2(r.data))){v1++;continue}
  v2++; const m=RV.missingTokenSites(s); if(m.length)bad.push(`${f}: ${m.map(x=>x.id).join(",")}`);
}
console.log(`v2 ${v2} ใบ · v1 ${v1} ใบ · ใบที่ยังมี literal ใน site บังคับ ${bad.length}`);
if(bad.length)console.log(bad.join("\n"));'

# (ข) ยืนยันด้วย gate จริงทั้งคลัง (เส้นทางที่ pre-push/verify ใช้)
rtk proxy node test/check-reports.js 2>&1 | grep -c "V2TOKENS"     # → 0
```

**ผล 14 ก.ย. 2569:**

```
v2 865 ใบ · v1 43 ใบ · ใบที่ยังมี literal ใน site บังคับ 0
V2TOKENS จาก gate จริง: 0
```

**พิสูจน์ว่า check ไม่ใช่ของหลอก** (ไม่ได้ผ่านเพราะไม่ยิงอะไรเลย):

- `test/self-test.js` มีเคส mutate **ครบทั้ง 6 site** — แทน token ด้วย literal รูปที่ token นั้น render ออกมาจริง (ใบยัง render/ผ่าน check อื่นได้ปกติ ⇒ พิสูจน์ว่าเดิม "ผ่านเงียบ")
  แล้วยืนยัน 3 อย่างต่อ site: `missingTokenSites` ชี้เฉพาะ site นั้น · `checkHtml` ยิง `V2TOKENS` · ข้อความ error ระบุชื่อช่อง
- ปิด check (`if (ctx.v2)` → `if (false)`) แล้วรัน `node test/self-test.js`: **ตก 7 เคส** (6 mutant + เคส "หน้าที่ render แล้ว + ไม่ส่ง `opts.source` → ต้องยิง") · เปิดคืน = 479/479 ผ่าน
- ไม่ false-positive: fixture v2 ทั้ง 7 ใบ (`test/fixtures/*-v2.html`) และ **skeleton ทั้ง TH/US** มี token ครบทั้ง 6 site

> **ข้อจำกัดที่ประกาศ:** `V2TOKENS` อ่าน `ctx.source` — ผู้เรียกที่ไม่ส่ง `opts.source` จะเห็นทุก site เป็น literal แล้วยิงทั้งใบ
> (พฤติกรรมเดียวกับ `E44` โดยตั้งใจ) · ทาง production ส่ง source ครบทุกเส้นแล้ว: `checkFile` (gate) · `gateCheck` (cron) · `tools/migrate-v2.js`

---

## 2. เกณฑ์ 2 — regex ถอดค่าจาก HTML บนทาง v2

**ถ้อยคำที่ใช้ (ruling Task 12 R5 — ห้ามเขียนว่า "regex = 0"):**

> บนใบ v2 **ค่าของช่องสำเนามาจาก JSON** · **cron ไม่ได้เขียนช่องสำเนาด้วย regex** · การอ่านหน้าที่ render แล้วด้วย regex
> **ยังมีอยู่** แต่เป็น **ตัวตรวจความสอดคล้องเท่านั้น ไม่ใช่วิธีตัดสินค่า**

```bash
rtk proxy node test/v2-path-test.js      # → v2-path-test: 355/355 ผ่าน
```

**ผล:** `355/355 ผ่าน`

`test/v2-path-test.js` เป็นตัวพิสูจน์เชิงกลไก (ไม่ใช่การอ่านโค้ดด้วยตา): แทน `RM.*`/`DV.*` ทีละตัวด้วย stub ที่ throw/คืนค่าผิด
แล้วยืนยันว่า **ผลของ gate/cron ทาง v2 ไม่เปลี่ยน** — ถ้าค่ามาจาก regex เส้นทางจะพัง · เสริมด้วย mutation **หลัง expand**
(`values.px ×1.5` → E30 · `×0.5` → E19/E30/E43 · `priceDate` → E27) ซึ่งฟ้องได้เฉพาะเมื่อ gate อ่าน JSON จริง

**regex ที่ยัง "อ่าน" หน้าที่ render แล้ว (เปิดเผยตรง ๆ ไม่ซ่อน):**

| จุด | ทำอะไร | ทำไมไม่ขัดเกณฑ์ |
|---|---|---|
| `patchDerived` บน view (`derivedPassV2`) | เขียนการ์ด P/E · Market Cap · P/S · ปันผล % · P/BV · % เป้า · หมวด 6 ที่ยัง literal | ช่องเหล่านี้ **ยังไม่ใช่ token** (ตัดสินฐานไม่ได้/ผู้เขียนเลือกฐานเอง) — ไม่ใช่ "ช่องสำเนา" ของ `values` · ชนกับ token เมื่อไร **token ชนะ** (keep-map) |
| `v2DateTripwire` | อ่านวันที่ราคาทุกจุดหลัง render แล้วเทียบ `values.priceDate` | เป็น **ตัวตรวจ** — ไม่ตรง = throw → `patch-failed` ไม่ใช่การตัดสินค่า |
| คู่ manifest ของ gate (W22/W23) | เทียบค่าเดียวกันที่เขียนไว้หลายที่ | เป็น **ตัวตรวจความสอดคล้อง** ล้วน |

---

## 3. เกณฑ์ 3 — `--heal-derived` ไม่จำเป็นอีก

```bash
rtk proxy node tools/update-prices.js --heal-derived | tail -4
```

**ผล 14 ก.ย. 2569:**

```
heal-derived: 0/908 ไฟล์มีค่าค้าง • แก้ 0 จุด
(dry-run — ใส่ --write เพื่อเขียนจริง)
```

**0/908 ครอบคลุมทั้งคลัง** — ทั้ง 865 ใบ v2 และ 43 ใบ v1 ที่เหลือ ⇒ **ไม่มี residue ค้างให้ระยะ 3 ในข้อนี้**

> ★ **แก้ความคาดหมายของ brief (เขียนไว้ 12–13 ก.ย. ก่อนส่วน D เสร็จ):** brief คาดว่าผลจะเป็น `0 ใบมีค่าค้าง · ข้าม v2 N ใบ`
> และให้เขียนใน `price-refresh.md` ว่า `--heal-derived` "ใช้กับ v1 เท่านั้น" — **ทั้งสองข้อไม่ตรงโค้ดจริง**
> `healDerived` เดินทาง v2 เต็มรูปแบบ (`proseTokensIfNew` → `derivedPassV2` → กระจก `stock-meta`) โดยใช้ `values.px` เป็นตัวตั้ง
> และเป็นทางที่ worker/controller ใช้เคลียร์ **E44** ตอนเขียนใบใหม่ ⇒ เอกสารเขียนตามพฤติกรรมจริง ไม่ใช่ตาม brief

**ตรึงไว้ด้วยเทส (ไม่ใช่วัดครั้งเดียวแล้วจบ)** — `test/update-prices-test.js` เคส **N1**:

- **N1(ก)** fixture v2 ทั้ง 7 ใบสะอาด → `--heal-derived` = **no-op** (`touched 0` + ไฟล์เท่าเดิมทุก byte)
- **N1(ข)** SRE ที่ `stock-meta.pe`/`dividendYield` เสีย → **E41 + W19 ยิง** → heal `--write` → **หาย** และค่าที่คืนมาคือ **ฐานของการ์ดเดิม**
  (`pe 24.1` · `yield 3.1`) ไม่ใช่ค่าที่ derive จาก `values` (SRE ไม่มี `values.eps` ⇒ กระจกที่เขียน `pe` จาก values จะได้ `null`)
  → heal ซ้ำ **`touched 0` และ E41/W19 ยังคงหาย** (converged)

เคสนี้คือ **residual ของ re-review ส่วน D**: กระจก `stock-meta` ของทาง v2 ต้องเขียนแค่ `price/mos/upside/fairValue`
และ **ห้ามทับ `pe`/`dividendYield` ที่ pass derived เพิ่งเขียน** — เดิมไม่มีเทสไหนเดินทาง `--heal-derived` จนถึงกระจกบนไฟล์จริง
พิสูจน์ว่า discriminate: ใส่ mutant (กระจกเขียน `pe`/`dividendYield` จาก `values`) แล้ว **N1(ก) ตก 5 ใบ · N1(ข) ตก** (DDOG `pe` 75 → 453.7 · SRE `pe` → null)

---

## 4. ของที่ปิดเพิ่มในส่วน F (ไม่ใช่การวัด — เป็นงานที่ carry มาจาก final review ส่วน D)

| # | สิ่งที่ปิด | ที่อยู่ |
|---|---|---|
| 1 | `V2TOKENS` — check โครงสร้างถาวร + เคส self-test mutate ครบ 6 site | `tools/report-values.js` (`REQUIRED_TOKEN_SITES`/`missingTokenSites`) · `tools/report-meta.js` (`PX_TOKEN_RE` — parser-lint บังคับให้ regex `.px` มีเจ้าของเดียว) · `test/check-reports.js` · `test/self-test.js` |
| 2 | เอกสารทาง cron v2 (pass derived บน view · keep-map · tripwire → `patch-failed` · กระจก stock-meta · ถ้อยคำ R5) | `docs/price-refresh.md` หัวข้อ "ใบ v2" · `CLAUDE.md` §9 บรรทัดแรกของลิสต์ |
| 3 | เทสตรึงกระจก `healDerived` ไม่ทับ `pe`/`dividendYield` | `test/update-prices-test.js` เคส **N1** |
| 4 | วงเล็บทวนวันที่ที่ parser อ่านไม่ออก → **note** (เดิมเงียบสนิททาง v2) | `tools/update-prices.js` (`v2DateEdits` + `derivedPassV2.notes` → `patchReport.notes` → บรรทัด log ของ cron) · เทส **N2** |

**ข้อ 4 อธิบายเพิ่ม:** `parenDateAfter` อ่าน `(11 กย. 2569 ตลาดปิด)` ไม่ออก (เดือน `กย.` ไม่อยู่ในคลังชื่อเดือน) ⇒ ทาง v2 เดิม
**ไม่มี edit และ tripwire ก็ข้าม** ⇒ วันเก่าค้างในวงเล็บถาวรโดยไม่มีใครเห็น · v1 ฟ้องเป็น note มาตลอด ⇒ ทาง v2 ฟ้องเท่ากันแล้ว
**เป็น note ไม่ใช่ throw** โดยตั้งใจ (เขียนวงเล็บไม่ได้ ≠ ทั้งใบ patch ไม่ได้) · **คลังวันนี้ 0 ใบเข้าเคสนี้** — ปิดช่องว่าง ไม่ใช่แก้บั๊กที่กำลังเกิด

---

## 5. ตัวเลขประกอบ (brief ข้อท้ายของ Step 1)

### 5.1 coverage — "ช่องต่ำสุด" ก่อน/หลัง

```bash
rtk proxy node test/check-reports.js > cr.txt 2>&1
rtk proxy tail -4 cr.txt                                   # บรรทัดสรุป
rtk proxy node -e '
const fs=require("fs");const L=fs.readFileSync("cr.txt","utf8").split("\n");
const g={};for(const l of L){const m=l.match(/ช่อง (\d+)\/(\d+)/);if(!m)continue;(g[m[2]]=g[m[2]]||[]).push(+m[1]);}
for(const d of Object.keys(g)){const a=g[d].sort((x,y)=>x-y);
console.log(`ตัวหาร ${d}: ${a.length} ใบ · ต่ำสุด ${a[0]} · มัธยฐาน ${a[Math.floor(a.length/2)]} · สูงสุด ${a[a.length-1]} · เฉลี่ย ${(a.reduce((s,x)=>s+x,0)/a.length).toFixed(2)}`);}'
```

| | ก่อน (จบระยะ 1 · 12 ก.ย.) | หลัง (14 ก.ย.) |
|---|---|---|
| ตัวหาร | **70** ทุกใบ | **68** (v2 · 865 ใบ) · **71** (v1 · 43 ใบ) |
| ช่องต่ำสุด | 46/70 (FANG) | **47/68 (BRK-B)** · v1 ต่ำสุด 47/71 |
| มัธยฐาน | 58 | 57 (v2) · 59 (v1) |

★ **ตัวหารขยับเพราะสคีมา ไม่ใช่เพราะ gate อ่านได้น้อยลง**: ใบ v2 ไม่มีแถว `v2: null` อยู่จริง (`gauge.fair` · `chart.fairLine` · วันที่ในวงเล็บ)
⇒ `extractAll` นับเป็น `omitted` ไม่ใช่ "หาย" (70 → 68) · ฝั่ง v1 เพิ่มเป็น 71 เพราะระยะ 2 เพิ่มแถว manifest ใหม่
⇒ **เทียบเลขต่ำสุดข้ามระยะตรง ๆ ไม่ได้** ต้องดูคู่กับตัวหาร

### 5.2 warning รวม — ก่อน/หลัง (W22/W23 ลดกี่ใบ)

```bash
rtk proxy node test/check-reports.js 2>&1 | grep -o "⚠ \[W[0-9]*\]" | sort | uniq -c
```

| รหัส | จบระยะ 1 (12 ก.ย.) | 14 ก.ย. (สาขานี้) | ต่าง |
|---|---|---|---|
| W05 | 1 | 1 | — |
| W15 | 96 | 95 | −1 |
| W21 | 11 | 11 | — |
| **W22** | **24** | **24** | **0 (ไม่ลด)** |
| **W23** | **109** | **105** | **−4** |
| W24 | — (ยังไม่มีรหัส) | **11** | +11 (รหัสใหม่ Task 17) |
| **รวม** | **241** | **247** | **+6** |

★ **W22 ไม่ลดเลย** — ต้องพูดตรง ๆ: การย้ายเป็น v2 ไม่ได้ซ่อมคู่ที่ไม่ตรงกัน มัน**กันไม่ให้เกิดคู่ใหม่**
คู่ 24 ใบที่เหลือคือของที่ขัดกันอยู่ก่อนย้าย (และเป็นเหตุผลที่ 43 ใบยังย้ายไม่ได้ — ดู §5.3)
⇒ **W22 ไม่ถูกยกเป็น error ในระยะนี้** (Task 16: v1 = 43 > 0) — open-item **#36**
★ warning **รวมเพิ่ม 6** ไม่ใช่ลด: W24 เป็นรหัสใหม่ที่เปิด fail-open ของประตูวันที่ E44 ให้เห็น (11 ใบที่ footer อ่านไม่ออก — ของเก่าที่เคยเงียบ)

### 5.3 residue — 43 ใบ v1 พร้อมชนิด

```bash
rtk proxy node -e '
const c=require("./docs/superpowers/audit/2026-09-11-stock-analyzer/migration-v2-census.json");
const bad=Object.values(c.bySym).filter(e=>!e.ok);
const g={};for(const e of bad)(g[e.reason]=g[e.reason]||[]).push(e.sym);
console.log("residue",bad.length);
for(const[k,v]of Object.entries(g).sort((a,b)=>b[1].length-a[1].length))console.log(`${String(v.length).padStart(2)}  ${k}  — ${v.join(" ")}`);'
```

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| **ค่าที่โชว์ ≠ FV ของไฟล์เอง** (legend/mFair ต่างเกิน 0.5%) | 17 | COHU CTAS DTM DXCM FORM GNTX HMPRO LPLA RELX SHANG SWK TER TT VLTO VRTX WFC SAPPE |
| **site match ≠ 1** (หาไม่เจอ/เจอหลายที่) | 9 | BABA STX VRT (vcellTgt) · FANG MPC MU (legend) · AEM BTG (vcellFv) · MXL (summary) |
| **จำนวนช่อง %/ปี ไม่เท่าเดิม** | 5 | ACN JMT RS SCGD SNNP |
| **ค่าไม่ตรงชั้น 1** (f36/f50) | 4 | AMKR LWLG MTI TMAN |
| **cron-diff v1-unstable** (v1 เองไม่นิ่งบน grid ราคา) | 4 | BNY PTG THCOM WWD |
| **กรอบ FV สองที่ไม่ตรงกัน** | 2 | ALLE POET |
| **FV ไม่ตรงกันเอง** (`chart.fairLine` ≠ `report-data.fv`) | 2 | PNC TEAM |

★ ทั้ง 43 ใบเป็น **"ตัวเลขในใบขัดกันเองอยู่ก่อนย้าย"** ไม่ใช่บั๊กของ migrator — migrator ปฏิเสธถูกแล้ว (ย้ายไป = เลือกค่าให้ผู้เขียนโดยพลการ)
⇒ งานระยะ 3 ข้อ **E(ข)(1)**: แก้ต้นเหตุรายชนิด → migrate ซ้ำ → v1 = 0 → ลบโค้ดทาง v1 ใน cron/gate/manifest → W22 → E

### 5.4 cron รอบแรกบนคลัง v2

**ผลจริง (run `34853640500` · dispatch 14 ก.ย. ~21:14 +07 · main `1263d971` = คอมมิตแรกที่มี 865 ใบ v2):**

```
gate 908/908 · error 0 · warning 236
เขียนแล้ว: อัปเดต 0 · ไม่เปลี่ยน 235 · ข้ามเพราะตลาดเปิด 670 · freeze 3
  (MTI mos-sign-flip · RS/SSP drift-gt-15pct — ชุดเดียวกับรอบ 17:50 ไม่เกี่ยวกับ v2)
patch-rejected / patch-failed: 0 ทั้งล็อก
```

★ **อ่านผลนี้ให้ตรง:** `patch-failed 0` เป็นจริง แต่ **รอบนี้ patch ไปจริง 0 ใบ** (670 ใบข้ามเพราะตลาด US ยังเปิด · 235 ใบราคาไม่ขยับ)
⇒ **ยังไม่ใช่หลักฐานของ write path บน v2** · หลักฐานที่มีอยู่จริงมาจากที่อื่น: Task 14/14a เทียบพฤติกรรม cron ของ **ทุกใบที่ย้าย**
กับ v1 บน **กริดราคา 61 จุด** ในหน่วยความจำ และเดิน 20 วัน ±2% — gate ตก 0 · throw 0
⇒ **ยกเป็น open-item**: รอบ cron ตามกำหนดรอบถัดไปที่ราคาขยับจริงบนคลัง v2 คือ checkpoint สด รอบแรก (ruling ส่วน E ใน ledger ระบุไว้แล้ว)

---

## 6. `npm run verify` — 18/18

```
update-prices-test 417 passed · dead-ticker-test 51 · tag-apply-test 57/57 · queue-test 330/330 · docs-test ผ่าน
prep-stock-test 115 · tags-test 68/68 · report-values-test 99/99 · v2-path-test 355/355
check-reports 908/908 · error 0 · warning 247 · ช่องต่ำสุด 47/68 (BRK-B)
self-test 479/479 · ohlc-test ผ่าน · ta-engine-test ผ่าน · build · build-test 160/160
engine-exec 908/908 · skeleton-test 51/51 · check-site error 0 warning 0
```

---

## 7. สิ่งที่ **ไม่ได้** ทำในระยะ 2 (ยกไประยะ 3 โดยตั้งใจ)

- residue v1 **43 ใบ** → แก้ต้นเหตุรายชนิดแล้ว migrate ซ้ำ → ลบโค้ดทาง v1 (`V1_READ` · `patchReport` ฝั่งเขียน HTML · fixture v1) · **W22 → E**
- prose เก่าที่ค่าไม่ตรงราคาปัจจุบัน — `E44` ปิดเฉพาะ **ใบใหม่** (footer ≥ `RV.PROSE_TOKEN_SINCE`) · ของเก่า (W15 95 ใบ · W23 105 ใบ · footer อ่านไม่ออก 11 ใบ) = กวาดเชิงกล + fix-on-touch ระยะ 3
- การ์ด/หมวด 6 ที่ตัดสินฐานไม่ได้ยังคง literal — `patchDerived` ดูแลต่อเหมือนเดิม
- `W21` → E (healer ต้องเป็นคน) · ย้ายช่องที่มีสำเนาเดียวอยู่แล้ว (EPS/BVPS/…) เข้า `values` (ไม่ใช่สำเนา — YAGNI)
