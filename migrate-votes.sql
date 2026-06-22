-- migrate-votes.sql — เพิ่มคอลัมน์ Like/Dislike ให้ตาราง views ที่มีอยู่เดิม (รันครั้งเดียว)
--   remote: npx wrangler d1 execute stockai_d1 --remote --file=./migrate-votes.sql
--   local:  npx wrangler d1 execute stockai_d1 --local  --file=./migrate-votes.sql
--
-- ⚠️ ถ้าเจอ error "duplicate column name" = มีคอลัมน์อยู่แล้ว ข้ามได้เลย (ไม่ต้องทำซ้ำ)
--    ถ้าเพิ่งสร้างตารางด้วย schema.sql เวอร์ชันใหม่ (มีคอลัมน์ครบแล้ว) ก็ไม่ต้องรันไฟล์นี้

ALTER TABLE views ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE views ADD COLUMN dislikes INTEGER NOT NULL DEFAULT 0;
