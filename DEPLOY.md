# Deploy ขึ้น Cloudflare Workers (Static Assets)

เว็บนี้เป็น static site — Cloudflare ดึงโค้ดจาก GitHub → รัน `npm run build` → `wrangler deploy`
เสิร์ฟไฟล์ในโฟลเดอร์ `dist/` เป็นเว็บ static (assets-only Worker ไม่ต้องมีโค้ด Worker)

## โครงสร้างโปรเจกต์

```
stock-analysis/
├─ reports/            ← วางไฟล์รายงานหุ้นแต่ละตัวไว้ที่นี่
│  ├─ GOOGL.html
│  ├─ AAPL.html
│  └─ ...
├─ build.js            ← สคริปต์ build
├─ package.json        ← npm run build
├─ wrangler.toml       ← [assets] directory = "./dist"
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
https://stock-analysis.<subdomain>.workers.dev            → หน้ารวมรายงาน (index)
https://stock-analysis.<subdomain>.workers.dev/GOOGL.html → รายงาน GOOGL
https://stock-analysis.<subdomain>.workers.dev/GOOGL      → ได้เหมือนกัน (clean URL)
```

> Workers Static Assets รองรับ clean URL อัตโนมัติ (`html_handling = "auto-trailing-slash"`):
> ไฟล์ `GOOGL.html` เปิดได้ทั้ง `/GOOGL` (เสิร์ฟตรง) และ `/GOOGL.html` (redirect ไป `/GOOGL`)

## รัน build ในเครื่อง (ทดสอบ)

```bash
npm run build      # หรือ: node build.js
open dist/index.html
```

ไม่ต้องติดตั้ง dependency ใด ๆ (ใช้แค่ Node.js ≥ 18)

---

## ตั้งค่าบน Cloudflare (ครั้งเดียว)

### วิธี A — เชื่อม GitHub ผ่าน Dashboard (แนะนำ)

1. เข้า **Cloudflare Dashboard → Workers & Pages → Create → Workers → Import a repository**
2. เลือก repo `iam1412/stock-analysis`
3. ตั้งค่า build:

   | ช่อง | ค่า |
   |------|-----|
   | **Build command** | `npm run build` |
   | **Deploy command** | `npx wrangler deploy` |
   | **Production branch** | `main` |

4. กด **Save and Deploy**

`wrangler.toml` ในรีโปกำหนด `[assets] directory = "./dist"` ไว้แล้ว → `wrangler deploy` จะอัปโหลดไฟล์ใน `dist/` ให้อัตโนมัติ
หลังจากนี้ทุกครั้งที่ `git push` ขึ้น `main` → Cloudflare build & deploy ใหม่อัตโนมัติ

### วิธี B — Deploy ตรงจากเครื่องด้วย Wrangler CLI

```bash
npm install -g wrangler
wrangler login
npm run build
wrangler deploy        # อ่าน [assets] จาก wrangler.toml
```

---

## หมายเหตุ: ถ้าอยากใช้ Cloudflare Pages แทน Workers

ลบ/เปลี่ยน `wrangler.toml` เป็น `pages_build_output_dir = "dist"` แล้วสร้างโปรเจกต์แบบ
**Workers & Pages → Pages → Connect to Git** (Build command `npm run build`, Output dir `dist`)
จะได้ URL `https://stock-analysis.pages.dev` แทน

ผูก custom domain ได้ที่ตั้งค่าโปรเจกต์ → **Custom domains / Routes**
