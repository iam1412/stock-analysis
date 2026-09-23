'use strict';
// รัน test ทุกไฟล์ของ v3 ใน process เดียว — แต่ละไฟล์ตั้ง process.exitCode = 1 เองเมื่อพัง
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'v3');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.test.js')).sort()) require(path.join(dir, f));
