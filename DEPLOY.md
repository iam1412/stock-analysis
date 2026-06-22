# Deploy ขึ้น Cloudflare Pages

เว็บนี้เป็น static site — Cloudflare ดึงโค้ดจาก GitHub → รัน `npm run build` → เอาไฟล์ใน `dist/` ไป deploy

> ⚠️ **โปรเจกต์นี้เป็น Pages project** ต้อง deploy ด้วย `wrangler pages deploy` เท่านั้น
> ห้ามใช้ `wrangler deploy` (เป็นคำสั่งของ Workers — จะ error `Missing entry-point`)

## โครงสร้างโปรเจกต์

```
stock-analysis/
├─ reports/            ← วางไฟล์รายงานหุ้นแต่ละตัวไว้ที่นี่
│  ├─ GOOGL.html
│  ├─ AAPL.html
│  └─ ...
├─ build.js            ← สคริปต์ build
├─ package.json        ← npm run build
├─ wrangler.toml       ← pages_build_output_dir = "dist"
├─ _headers            ← HTTP headers
└─ dist/               ← ผลลัพธ์ build (gitignore — Cloudflare สร้างเอง)
```

## build.js ทำอะไร

1. สแกนไฟล์รายงาน `reports/<SYMBOL>.html` ทั้งหมด
2. ดึงชื่อบริษัท/title จากแต่ละไฟล์ มาสร้างหน้า `index.html` (รวมรายงานทั้งหมด)
3. คัดลอกรายงานแบบ **flatten** ลง `dist/` (เอาออกจากโฟลเดอร์ย่อย) + คัดลอก `_headers`

> **เพิ่มหุ้นใหม่:** วางไฟล์ `reports/<SYMBOL>.html` แล้ว push — หน้า index อัปเดตการ์ดเองตอน build

## URL หลัง deploy

```
https://stock-analysis.pages.dev            → หน้ารวมรายงาน (index)
https://stock-analysis.pages.dev/GOOGL.html → รายงาน GOOGL
https://stock-analysis.pages.dev/GOOGL      → ได้เหมือนกัน (clean URL ของ Pages)
```

## รัน build ในเครื่อง (ทดสอบ)

```bash
npm run build      # หรือ: node build.js
open dist/index.html
```

ไม่ต้องติดตั้ง dependency ใด ๆ (ใช้แค่ Node.js ≥ 18)

---

## ตั้งค่าบน Cloudflare

### ✅ วิธีที่ถูก: ตั้ง build settings ของ Pages project

ใน **Pages project → Settings → Builds & deployments**:

| ช่อง | ค่า |
|------|-----|
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Deploy command** (ถ้ามีช่องนี้) | `npx wrangler pages deploy dist` |
| **Production branch** | `main` |

> **จุดที่ทำให้ deploy fail ก่อนหน้านี้:** ช่อง Deploy command ถูกตั้งเป็น `npx wrangler deploy`
> ให้แก้เป็น **`npx wrangler pages deploy dist`** (เติมคำว่า `pages`)
> หรือถ้าเป็น Pages Git แบบดั้งเดิมที่ไม่มีช่อง Deploy command → แค่ตั้ง Build output directory = `dist` ก็พอ (Pages deploy ให้เอง)

### Deploy ตรงจากเครื่องด้วย Wrangler CLI

```bash
npm install -g wrangler
wrangler login
npm run build
wrangler pages deploy dist --project-name stock-analysis   # ← pages deploy, ไม่ใช่ deploy เฉย ๆ
```

---

ผูก custom domain ได้ที่ **Pages project → Custom domains**
