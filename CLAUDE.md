# Stock Analysis — Project Rules

รีโปนี้เก็บ **รายงานวิเคราะห์หุ้น** เป็นไฟล์ HTML แล้ว build เป็นเว็บ static
deploy อัตโนมัติบน **Cloudflare Workers (Static Assets)** ผ่านการเชื่อม GitHub

---

## 1. โครงสร้างโฟลเดอร์

```
stock-analysis/
├─ reports/            # ★ ต้นฉบับรายงานหุ้น — 1 ไฟล์ = 1 หุ้น
│  ├─ GOOGL.html
│  ├─ AAPL.html
│  └─ <SYMBOL>.html
├─ build.js            # สแกน reports/ → สร้าง index.html → flatten ลง dist/
├─ package.json        # npm run build
├─ wrangler.toml       # Workers Static Assets ([assets] directory = "./dist")
├─ _headers            # HTTP headers (ต้นฉบับ — แก้ที่นี่ที่เดียว)
├─ .gitignore
├─ DEPLOY.md           # คู่มือ deploy บน Cloudflare
├─ CLAUDE.md           # ไฟล์นี้
└─ dist/               # ⚠️ build output (gitignore) — generate เอง ห้ามแก้มือ
```

**ไฟล์ที่ห้ามแก้มือ** (สร้างอัตโนมัติทุกครั้งที่ build):
- `dist/` ทั้งโฟลเดอร์ (รวม `dist/index.html`, `dist/<SYMBOL>.html`, `dist/_headers`)
- หน้า `index.html` ถูกสร้างจาก `build.js` — ถ้าจะปรับหน้า landing ให้แก้ที่ template ใน `build.js`

---

## 2. การวิเคราะห์หุ้น (skill `/stock-analyzer`)

เมื่อผู้ใช้สั่งวิเคราะห์หุ้น (เช่น "วิเคราะห์ GOOGL", "analyze AAPL"):

1. เรียก skill **`/stock-analyzer`** ทำตาม workflow ของมัน (รวบรวมข้อมูล ≥3 แหล่ง →
   คำนวณ Fair Value 3 วิธี → Margin of Safety → Return projection → สร้าง dashboard HTML)
2. **Export ไฟล์ผลลัพธ์เป็น `reports/<SYMBOL>.html`** เสมอ
   - ใช้ **ชื่อย่อหุ้นตัวพิมพ์ใหญ่** เป็นชื่อไฟล์: `GOOGL.html`, `AAPL.html`, `PTT.html`
   - ⚠️ **override default ของ skill** ที่ตั้งชื่อ `[SYMBOL]_analysis.html` / save ลง outputs
     → ในโปรเจกต์นี้ให้ใช้ `reports/<SYMBOL>.html` เท่านั้น (เพื่อให้ URL สั้น เรียกง่าย)
3. รัน `node build.js` ตรวจว่า build ผ่าน (index.html อัปเดต, ไฟล์ flatten ถูกต้อง)
4. **Auto-push** (ดูข้อ 4)

> **URL ปลายทาง:** `https://<worker>.workers.dev/<SYMBOL>.html` (และ `/<SYMBOL>` ก็เข้าได้)

---

## 3. วิเคราะห์หลายหุ้นพร้อมกัน (parallel agents)

ถ้าผู้ใช้สั่งวิเคราะห์ **หลายตัวพร้อมกัน** (เช่น "วิเคราะห์ GOOGL AAPL MSFT"):

- **spawn 1 Agent ต่อ 1 หุ้น** ส่ง tool call หลายตัวในข้อความเดียวเพื่อรันขนานกัน
- แต่ละ agent ทำ full analysis ของหุ้นตัวเองตาม workflow `/stock-analyzer`
  แล้วเขียนผลลง **`reports/<SYMBOL>.html` ของตัวเองเท่านั้น** (คง 1 ไฟล์/1 หุ้น)
- **ห้ามให้ agent แต่ละตัว push เอง** → รอทุก agent เสร็จก่อน แล้ว main session
  ทำ `node build.js` + **commit + push ครั้งเดียว** (กัน git race/conflict)

---

## 4. Auto-push (กฎสำคัญ)

**หลังวิเคราะห์หุ้นเสร็จ หรือมีการสร้าง/แก้ไขไฟล์ใน `reports/` → ให้ commit + push ขึ้น `main` อัตโนมัติทันที โดยไม่ต้องถามยืนยัน**

ลำดับที่ต้องทำ:
```bash
node build.js                      # 1. ตรวจ build ผ่าน (กัน HTML พัง)
git add -A                         # 2. stage
git pull --rebase origin main      # 3. sync กันชนกับ remote
git commit -m "<message>"          # 4. commit
git push origin main               # 5. push → Cloudflare build & deploy เอง
```

**รูปแบบ commit message:**
- หุ้นใหม่:  `analyze: add <SYMBOL> stock analysis`
- อัปเดต:   `analyze: update <SYMBOL> stock analysis`
- หลายตัว:  `analyze: add GOOGL, AAPL, MSFT stock analysis`
- ลงท้ายด้วย:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

> ขอบเขต auto-push: ใช้กับงานวิเคราะห์หุ้น/ไฟล์ใน `reports/`
> การแก้โครงสร้างระบบ (build.js, wrangler.toml ฯลฯ) ให้สรุปการเปลี่ยนแปลงก่อน push ตามปกติ

---

## 5. Build & Deploy

- **Build:** `npm run build` (= `node build.js`) — ไม่มี dependency, ต้องใช้ Node ≥ 18
- **Deploy:** Cloudflare รัน build แล้ว `wrangler deploy` อัตโนมัติเมื่อ push เข้า `main`
- เว็บนี้เป็น **Worker (Static Assets)** ไม่ใช่ Pages — deploy ด้วย `wrangler deploy`
  (อย่าเปลี่ยนไปใช้ `wrangler pages deploy`) รายละเอียดใน `DEPLOY.md`

---

## 6. ข้อห้าม / ข้อควรระวัง

- ❌ อย่า commit `dist/`, `node_modules/`, `.DS_Store` (อยู่ใน `.gitignore` แล้ว)
- ❌ อย่าแก้ไฟล์ใน `dist/` โดยตรง — แก้ที่ต้นฉบับ (`reports/`, `build.js`, `_headers`)
- ❌ อย่าตั้งชื่อไฟล์รายงานเป็นตัวพิมพ์เล็กหรือเว้นวรรค — ใช้ `<SYMBOL>.html` พิมพ์ใหญ่
- ✅ ทุกรายงานต้องมี disclaimer "ไม่ใช่คำแนะนำการลงทุน" (skill ใส่ให้อยู่แล้ว)
- ✅ ระบุ "ราคา ณ วันที่ + แหล่งที่มา" ในรายงานเสมอ
