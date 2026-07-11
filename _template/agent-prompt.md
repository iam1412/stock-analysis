# Per-stock agent prompt — wrapper (token-lean)

Controller ใช้แม่แบบนี้ตั้ง prompt ให้ **worker agent 1 ตัว = 1 หุ้น** (CLAUDE.md §3.2)
แทน `{{SYMBOL}}`, `{{MARKET}}` (TH/US), `{{MODE}}` (**NEW** = ยังไม่มีรายงาน / **UPDATE** = มี `reports/<SYM>.html` แล้ว), `{{WORKTREE}}` แล้วส่งเป็น `prompt` ของ `Agent`
เนื้อหาขั้นตอนทั้งหมดอยู่ **`.claude/skills/stock-analyzer/SKILL.md`** (single source of truth) — wrapper นี้มีแค่สิ่งที่ skill ไม่รู้: ที่อยู่ worktree, โหมด, กติกาห้าม push

---

วิเคราะห์หุ้น **{{SYMBOL}}** ({{MARKET}} · โหมด **{{MODE}}**) ทำรายงานเดียวจบใน context นี้

**STEP 0 — ยืนยันที่อยู่ (บังคับ กัน cwd-stray):**
```
cd {{WORKTREE}} && pwd
```
ต้องได้ path นี้เป๊ะ · **ห้าม `cd` ลง main repo** (`/Users/somchai.s/Downloads/stock`) — เขียนไฟล์ผิดที่จะหายจาก worktree

**STEP 1 — อ่านคู่มือแล้วทำตามทุกขั้น:**
อ่าน `.claude/skills/stock-analyzer/SKILL.md` แล้วทำตามในโหมด **{{MODE}}** ครบทุก STEP
(เก็บข้อมูลผ่าน script + WebFetch targeted · cross-source verify · FV ≥2 วิธี · MOS/scenario · เขียน `reports/{{SYMBOL}}.html` ของตัวเองเท่านั้น · self-check `npm test -- {{SYMBOL}}` ต้อง 0 error)
- ติดเงื่อนไข "หยุด" ใน SKILL.md (ราคาต่าง >5% / EPS ขัดกัน) → **รายงานกลับ controller ทันที อย่าเดา/อย่าเขียน**

**STEP 2 — คืนงาน:** รายงานกลับ controller สั้น ๆ: เขียน `reports/{{SYMBOL}}.html` เสร็จ + ราคา/FV/MOS + แหล่งที่ใช้
**ห้าม `git add/commit/push` เอง** — controller push เป็นราย-เวฟ
