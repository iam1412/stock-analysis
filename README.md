# 📊 Stock Analysis

รวม **รายงานวิเคราะห์หุ้น** (Fair Value, Margin of Safety, จุดเข้าซื้อ, ผลตอบแทนคาดการณ์)
เป็นเว็บ static — แต่ละหุ้น 1 ไฟล์ HTML แล้ว deploy อัตโนมัติบน Cloudflare Workers

> ⚠️ ข้อมูลทั้งหมดเพื่อการศึกษาเท่านั้น **ไม่ใช่คำแนะนำการลงทุน**

## 🔗 เว็บไซต์

```
https://stock-analysis.<your-subdomain>.workers.dev/          → หน้ารวมรายงาน
https://stock-analysis.<your-subdomain>.workers.dev/GOOGL     → รายงาน GOOGL
https://stock-analysis.<your-subdomain>.workers.dev/GOOGL.html
```
*(แก้ลิงก์ด้านบนเป็น URL จริงของคุณหลัง deploy)*

API/manifest รายชื่อหุ้นทั้งหมด: [`/reports.json`](reports.json)

## 📁 โครงสร้าง

```
reports/<SYMBOL>.html   # ★ รายงานหุ้น (1 ไฟล์ = 1 หุ้น)
build.js                # สร้าง index.html + reports.json → flatten ลง dist/
reports.json            # manifest (auto-generated, เก็บวันที่อัปเดต)
test/check-reports.js   # quality gate — ตรวจรายงานก่อน push (npm test)
test/self-test.js       # meta-test ของ checker (npm run test:self)
.githooks/pre-push      # บล็อก git push อัตโนมัติถ้า gate ไม่ผ่าน
wrangler.toml           # Cloudflare Workers (Static Assets)
_headers                # HTTP headers
DEPLOY.md               # คู่มือ deploy
CLAUDE.md               # กฎสำหรับ Claude (workflow วิเคราะห์/auto-push)
```

## ➕ เพิ่มหุ้นใหม่

```bash
# 1. วางไฟล์รายงาน (ชื่อย่อหุ้นตัวพิมพ์ใหญ่)
reports/AAPL.html

# 2. push — Cloudflare build & deploy ให้เอง
git add -A && git commit -m "analyze: add AAPL stock analysis" && git push
```
หน้า index จะเพิ่มการ์ดหุ้นใหม่ + เรียงตัวที่อัปเดตล่าสุดขึ้นบนสุดให้อัตโนมัติ

## 🛠 พัฒนา / ทดสอบในเครื่อง

```bash
npm test           # ★ quality gate — ตรวจคุณภาพรายงานทุกไฟล์ (ต้องผ่านก่อน push)
npm run build      # = node build.js (ไม่ต้องติดตั้ง dependency, Node ≥ 18)
open dist/index.html
```

## ✅ Quality gate (ตรวจก่อนเผยแพร่)

`npm test` ตรวจทุก `reports/<SYMBOL>.html` ว่า **โครงสร้างครบ + ตัวเลขสอดคล้องกันเอง + ไม่มี placeholder ค้าง**
(เช่น ค่า `FV` ในเครื่องคิดเลขตรงกับ Fair Value, `MOS = (FV−ราคา)/FV`, มี disclaimer/แหล่งที่มา) — มี error เมื่อไหร่ push ไม่ได้

```bash
npm test                 # ตรวจทั้งหมด        npm test -- BBL   # เฉพาะบางตัว
npm run test:self        # ทดสอบ checker เองว่ายังจับ bug ได้
git config core.hooksPath .githooks   # เปิดใช้ pre-push hook (ครั้งเดียวต่อ clone)
```

## 🚀 Deploy

deploy อัตโนมัติเมื่อ push เข้า `main` (Cloudflare Workers + Static Assets)
รายละเอียดการตั้งค่าครั้งแรกดูที่ [DEPLOY.md](DEPLOY.md)

## ✉️ ติดต่อ

somchai.s@de.co.th
