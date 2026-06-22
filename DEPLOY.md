# Deploy ขึ้น Cloudflare Pages

เว็บนี้เป็น static site — Cloudflare จะดึงโค้ดจาก GitHub แล้ว build & deploy ให้อัตโนมัติทุกครั้งที่ push

## โครงสร้างโปรเจกต์

```
stock-analysis/
├─ reports/            ← วางไฟล์รายงานหุ้นแต่ละตัวไว้ที่นี่
│  ├─ GOOGL.html
│  ├─ AAPL.html
│  └─ ...
├─ build.js            ← สคริปต์ build
├─ package.json
├─ wrangler.toml       ← กำหนด output dir = dist
├─ _headers            ← HTTP headers
└─ dist/               ← ผลลัพธ์ build (gitignore — Cloudflare สร้างเอง)
```

## build.js ทำอะไร

1. สแกนไฟล์รายงาน `reports/<SYMBOL>.html` ทั้งหมด
2. ดึงชื่อบริษัท/title จากแต่ละไฟล์ มาสร้างหน้า `index.html` (รวมรายงานทั้งหมด)
3. คัดลอกรายงานแบบ **flatten** ลง `dist/` (เอาออกจากโฟลเดอร์ย่อย) + คัดลอก `_headers`

> **เพิ่มหุ้นใหม่:** วางไฟล์ `reports/<SYMBOL>.html` แล้ว push — หน้า index อัปเดตการ์ดเองตอน build

## URL หลัง deploy

เพราะ build flatten ไฟล์ลง root ของ `dist/` รายงานจึงเข้าถึงได้ที่ root:

```
https://stock-analysis.pages.dev            → หน้ารวมรายงาน (index)
https://stock-analysis.pages.dev/GOOGL.html → รายงาน GOOGL
https://stock-analysis.pages.dev/GOOGL      → ได้เหมือนกัน (clean URL ของ Cloudflare)
```

> Cloudflare Pages รองรับ clean URL อัตโนมัติ: ไฟล์ `GOOGL.html` เปิดได้ทั้ง `/GOOGL.html` และ `/GOOGL`
> (เรียก `/GOOGL.html` จะ redirect ไป `/GOOGL` ให้เอง)

## รัน build ในเครื่อง (ทดสอบ)

```bash
npm run build      # หรือ: node build.js
open dist/index.html
```

ไม่ต้องติดตั้ง dependency ใด ๆ (ใช้แค่ Node.js ≥ 18)

---

## ตั้งค่าบน Cloudflare (ครั้งเดียว)

### วิธี A — เชื่อม GitHub ผ่าน Dashboard (แนะนำ)

1. เข้า **Cloudflare Dashboard → Workers & Pages → Create → Pages**
2. เลือก **Connect to Git** แล้วเลือก repo `iam1412/stock-analysis`
3. ตั้งค่า build:

   | ช่อง | ค่า |
   |------|-----|
   | **Framework preset** | `None` |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | **Production branch** | `main` |

4. กด **Save and Deploy**

เสร็จแล้วทุกครั้งที่ `git push` ขึ้น `main` → Cloudflare build และ deploy ใหม่อัตโนมัติ
(push branch อื่น = ได้ Preview URL แยก)

> ไฟล์ `wrangler.toml` ในรีโปกำหนด `pages_build_output_dir = "dist"` ไว้แล้ว
> ถ้า Cloudflare อ่านไฟล์นี้ ช่อง "Build output directory" จะถูกตั้งให้อัตโนมัติ

### วิธี B — Deploy ตรงด้วย Wrangler CLI (ไม่ผ่าน Git)

```bash
npm install -g wrangler
wrangler login
npm run build
wrangler pages deploy dist --project-name stock-analysis
```

---

ผูก custom domain ได้ที่ **Pages project → Custom domains**
