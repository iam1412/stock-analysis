# Deploy ขึ้น Cloudflare Workers (Static Assets)

เว็บนี้เป็น static site — Cloudflare ดึงโค้ดจาก GitHub → รัน `npm run build` → `wrangler deploy`
เสิร์ฟไฟล์ในโฟลเดอร์ `dist/` เป็นเว็บ static (assets-only Worker ไม่ต้องมีโค้ด Worker)

## โครงสร้างโปรเจกต์

```
stock-analysis/
├─ reports/            ← วางไฟล์รายงานหุ้นแต่ละตัวไว้ที่นี่
│  ├─ GOOGL.html
│  └─ ...
├─ build.js            ← สคริปต์ build
├─ package.json        ← npm run build
├─ wrangler.toml       ← [assets] directory = "./dist"
├─ _headers            ← HTTP headers
└─ dist/               ← ผลลัพธ์ build (gitignore — Cloudflare สร้างเอง)
```

## build.js ทำอะไร

1. สแกนไฟล์รายงาน `reports/<SYMBOL>.html` ทั้งหมด
2. สร้างหน้า `index.html` (รวมรายงาน) จาก metadata ของแต่ละไฟล์
3. คัดลอกรายงานแบบ **flatten** ลง `dist/` + คัดลอก `_headers`

> **เพิ่มหุ้นใหม่:** วางไฟล์ `reports/<SYMBOL>.html` แล้ว push — หน้า index อัปเดตเองตอน build

## URL หลัง deploy

```
https://stock-ai.dotent.workers.dev/            → หน้ารวมรายงาน
https://stock-ai.dotent.workers.dev/GOOGL.html  → รายงาน GOOGL
https://stock-ai.dotent.workers.dev/GOOGL       → ได้เหมือนกัน (clean URL)
```

## รัน build ในเครื่อง (ทดสอบ)

```bash
npm run build      # หรือ: node build.js
open dist/index.html
```

ไม่ต้องติดตั้ง dependency ใด ๆ (ใช้แค่ Node.js ≥ 18)

---

## ตั้งค่าบน Cloudflare (UI ใหม่ — ใช้ Workers)

### 1. ลบโปรเจกต์เดิมที่พังก่อน (กันชื่อชนกัน)

**Workers & Pages** → คลิกโปรเจกต์ `stock-analysis` → **Settings** → ล่างสุด → **Delete**
(ลบให้หมดทุกตัวที่ชื่อ `stock-analysis`)

### 2. สร้าง Worker จาก GitHub

**Workers & Pages → Create → Workers → Import a repository** (หรือ "Deploy from Git")
→ เลือก repo `iam1412/stock-analysis`

### 3. ตั้งค่า build

| ช่อง | ค่า |
|------|-----|
| **Build command** | `npm run build` |
| **Deploy command** | `npx wrangler deploy` |
| **Branch** | `main` |

`wrangler.toml` มี `[assets] directory = "./dist"` อยู่แล้ว → `wrangler deploy` จะอัปโหลดไฟล์ใน `dist/` เป็นเว็บ static อัตโนมัติ

### 4. กด Save and Deploy

หลังจากนี้ทุกครั้งที่ push ขึ้น `main` → Cloudflare build & deploy ใหม่อัตโนมัติ

---

### Deploy ตรงจากเครื่อง (สำรอง)

```bash
npm install -g wrangler
wrangler login
npm run build
wrangler deploy        # อ่าน [assets] จาก wrangler.toml
```

ผูก custom domain ได้ที่ **Worker → Settings → Domains & Routes**
