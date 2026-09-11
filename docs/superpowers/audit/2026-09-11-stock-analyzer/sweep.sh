#!/bin/sh
# sweep ราคาสังเคราะห์ — พิสูจน์ว่า gate/cron ไม่ขึ้นกับราคาของวัน (phase0-exit §1 · เกณฑ์จบระยะ 1 หลัง W→E)
# ใช้: PRICES="0.5 1.0 3.0" SWEEP_DIR=/tmp/sweep sh docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh
# เขียน reports/AAPL.html + BBL.html จริงผ่าน patchReport (เส้นทางเดียวกับ cron) แล้ว npm run verify ทุกราคา · คืนไฟล์ด้วย git checkout -- (ห้าม stash)
set -eu
PRICES="${PRICES:-0.5 0.7 0.85 0.95 1.0 1.05 1.15 1.3 1.5 1.8 2.2 3.0}"
SWEEP_DIR="${SWEEP_DIR:-/tmp/sweep-$$}"
mkdir -p "$SWEEP_DIR"
trap 'git checkout -- reports/AAPL.html reports/BBL.html reports.json' EXIT
fails=0
for p in $PRICES; do
  node -e "
const U=require('./tools/update-prices.js');const fs=require('fs');const {readStockMeta}=require('./tools/report-meta.js');
for(const s of ['AAPL','BBL']){const h=fs.readFileSync('reports/'+s+'.html','utf8');const px=readStockMeta(h).price*$p;
const t=new Date();const dateParts={day:t.getUTCDate(),monIdx:t.getUTCMonth(),yearCE:t.getUTCFullYear()};   // วันนี้เสมอ — รันซ้ำอีกหลายสัปดาห์ต้องไม่ล้มด้วย E27 (ราคาเก่า >120 วัน)
fs.writeFileSync('reports/'+s+'.html',U.patchReport(h,{newPrice:+px.toFixed(2),dateParts,chartData:null}).html)}"
  if npm run verify >"$SWEEP_DIR/sweep-$p.log" 2>&1; then echo "×$p ok  $(grep -o 'error [0-9]* • warning [0-9]*' "$SWEEP_DIR/sweep-$p.log" | head -1)"; else echo "×$p FAIL (ดู $SWEEP_DIR/sweep-$p.log)"; fails=$((fails+1)); fi
  git checkout -- reports/AAPL.html reports/BBL.html reports.json
done
echo "sweep fails=$fails"
[ "$fails" -eq 0 ]
