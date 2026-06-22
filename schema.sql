-- schema.sql — ตาราง D1 สำหรับนับยอดวิว + Like/Dislike รายหุ้น (ติดตั้งใหม่)
-- ใช้ครั้งเดียวตอนตั้งระบบ:
--   local:  npx wrangler d1 execute stockai_d1 --local  --file=./schema.sql
--   remote: npx wrangler d1 execute stockai_d1 --remote --file=./schema.sql
-- (Workers Builds ไม่รัน migration ให้ → ต้อง execute เองครั้งแรก; ตารางคงอยู่ถาวรหลังจากนั้น)
--
-- ★ ถ้าตาราง views มีอยู่แล้วจากก่อนเพิ่ม Like/Dislike → ใช้ migrate-votes.sql แทน (เพิ่มเฉพาะคอลัมน์)

CREATE TABLE IF NOT EXISTS views (
  symbol   TEXT PRIMARY KEY,         -- ชื่อย่อหุ้นพิมพ์ใหญ่ เช่น GOOGL, BBL
  count    INTEGER NOT NULL DEFAULT 0,  -- ยอดเข้าชม
  likes    INTEGER NOT NULL DEFAULT 0,  -- 👍
  dislikes INTEGER NOT NULL DEFAULT 0,  -- 👎
  updated  TEXT                      -- ISO timestamp ของการอัปเดตล่าสุด
);
