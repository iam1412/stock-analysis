# census การย้าย v1 → v2 (ระยะ 2 ส่วน C)

อัปเดต: 14/9/2569 18:10:50 (Asia/Bangkok)

| ผล | ใบ |
|---|---|
| ย้ายได้ | 95 |
| ยังไม่ได้ (residue) | 5 |
| รวม | 100 |

## เหตุผล residue (นับต่อชนิด)

| เหตุผล | ใบ | ตัวอย่าง (≤10) |
|---|---|---|
| จำนวนช่อง %/ปี ไม่เท่าเดิม | 1 | ACN |
| site vcellFv match ≠ N | 1 | AEM |
| กรอบ FV สองที่ไม่ตรงกัน | 1 | ALLE |
| ค่าไม่ตรงชั้น N | 1 | AMKR |
| site vcellTgt match ≠ N | 1 | BABA |

## site ที่คง literal (นับต่อชนิด)

| site | ใบ | ตัวอย่าง (≤10) |
|---|---|---|
| psCard — ไม่มีการ์ดที่ตัดสินได้ | 95 | A AAI AAON AAPL ABBNY ABBV ABNB ABT ACE ACMR … |
| yieldCard — รูปตัวเลขต่าง ("N%" ≠ "N%") | 52 | A AAON AAPL ABBNY ABBV ABT ACN ADI ADM ADP … |
| pbvCard — ไม่มีการ์ดที่ตัดสินได้ | 52 | AAOI AAPL ABBNY ABBV ACE ACMR ACN ADBE ADI ADP … |
| peCard — ไม่มีการ์ดที่ตัดสินได้ | 44 | A AAOI ABNB ABT ACE ADP ADVANC ADVICE AEE AEHR … |
| scnNote — ไม่พบ | 34 | AAOI AAPL ABNB ACMR ACN ADBE ADI ADSK AEHR AEVA … |
| yieldCard — ไม่มีการ์ดที่ตัดสินได้ | 31 | AAOI ABNB ACE ACMR ADBE ADSK AEHR AEVA AIG AKAM … |
| mcapCard — รูปตัวเลขต่าง ("$NB" ≠ "$NB") | 29 | AAON ABBNY ABBV ABNB ACMR ACN ADBE ADP AEE AIT … |
| tgtCard — ไม่พบรูป "เป้า (+%)" | 19 | AAOI AAPL ABBNY ACMR ACN ADBE ADI ADSK AEHR ALAB … |
| scn | 18 | AAI ADM ADVICE AEE AEONTS AFL AIG AMATAV AME AON … |
| peCard — รูปตัวเลขต่าง ("N" ≠ "N") | 16 | AAPL ABBNY ACMR ACN ADI ADSK AMAT AMD ANET AOT … |
| zone — ราคาโซนสะสม N ≠ FV N (ผู้เขียนตั้งเอง) | 15 | AAOI ACMR ACN ADBE ADI ADSK ALAB AMKR ANET APH … |
| pbvCard — รูปตัวเลขต่าง ("N" ≠ "N") | 14 | A AAON ABNB ABT AEP AME AMGN AON AOS APD … |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N พันล้าน") | 9 | AAI AHC ANI APURE ASIAN ASK ASW BAFS BBIK |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้าน" ≠ "฿N หมื่นล้าน") | 6 | ACE AURA AWC AYUD BAM BCH |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N พันล้าน") | 3 | ADVICE AMATAV AU |
| mcapCard — ไม่มีการ์ดที่ตัดสินได้ | 3 | ARM ASML AVGO |
| mcapCard — รูปตัวเลขต่าง ("$N ล้านล้าน" ≠ "$NT") | 2 | AAPL AMZN |
| mcapCard — รูปตัวเลขต่าง ("$N B" ≠ "$NB") | 2 | ADM AIG |
| fvBoxRange — กรอบใน fv-box ไม่ตรง values/ไม่มีสัญลักษณ์สกุลเงินครบ | 1 | AAOI |
| psCard — รูปตัวเลขต่าง ("N" ≠ "N") | 1 | AEHR |
| mcapCard — รูปตัวเลขต่าง ("฿N" ≠ "฿N หมื่นล้าน") | 1 | AEONTS |
| hintEps — ไม่พบ | 1 | AER |
| mcapCard — รูปตัวเลขต่าง ("$NB" ≠ "$NM") | 1 | AEVA |
| mcapCard — รูปตัวเลขต่าง ("฿NB" ≠ "฿N หมื่นล้าน") | 1 | AMATA |
| disc | 1 | AMATAV |
| mcapCard — รูปตัวเลขต่าง ("฿N ล้านล้าน" ≠ "฿N แสนล้าน") | 1 | AOT |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N หมื่นล้าน") | 1 | AP |
| mcapCard — รูปตัวเลขต่าง ("$N" ≠ "$NB") | 1 | B |
| mcapCard — รูปตัวเลขต่าง ("฿N พันล้าน" ≠ "฿N แสนล้าน") | 1 | BAY |

## ใบที่ศักราชของ .disc ต่างจากหัวรายงาน (note `dateEra normalize`)

- APH

## ผลตอบแทนฉาก %/ปี ที่ข้อความเปลี่ยนหลังย้าย (หมวด 6 · เปิดเผยเท่านั้น ไม่ใช่เกณฑ์ผ่าน/ตกใหม่ — ดู TOLERANCE.f34/f35)

| ชนิด | จุด (คอลัมน์) | ใบ |
|---|---|---|
| รูปเลขเปลี่ยนแต่ค่าเท่าเดิม (form) | 46 | — |
| ค่าจริงขยับ (value) | 10 | 6 |

### ใบที่ %/ปี ขยับค่าจริง (ก่อน → หลัง ต่อคอลัมน์)

- AEHR: bull +16.6%/ปี → +16%/ปี
- AMATA: base null → +11%/ปี · bull null → +25%/ปี
- AMZN: bear −12.5%/ปี → −12%/ปี · bull +14.5%/ปี → +14%/ปี
- ANET: base −1%/ปี → −1.4%/ปี
- ASW: bear null → +1.6%/ปี · base null → +17%/ปี · bull null → +33%/ปี
- AZN: bull +21.5%/ปี → +21%/ปี

## cron differential v1 ↔ v2 (`--cron-diff` · grid ราคา ×0.85–×1.15 ทีละ 0.005 · 61 จุด)

เทียบผล `patchReport` ของ v1 ต้นฉบับกับ v2 ที่ราคา/วันที่เดียวกัน: stock-meta (price/mos/upside/fairValue/pe/dividendYield) ·
ตัวเลขที่มองเห็น · error/warning ของ gate — ใบที่ต่างนอกเหนือ "รูป" = residue (ไม่เขียน)

| ผล | ใบ |
|---|---|
| ตรวจ | 95 |
| ผ่าน | 95 |
| ตก (ไม่เขียน) | 0 |
| ผ่านแต่ต่างแค่รูป | 76 |

### ตกตามชนิด

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| — | 0 | |

### ต่างแค่รูป (เขียนได้ · เปิดเผยให้เจ้าของตัดสิน)

| ชนิด | ใบ | รายชื่อ |
|---|---|---|
| รูปทศนิยมหมวด 6 เปลี่ยน (เช่น 3.5→3) | 71 | A AAOI AAON AAPL ABBNY ABBV ABNB ABT ACE ADBE ADI ADP ADVANC AEHR AEP AER AEVA AHC AIT AJG AKAM ALAB ALC ALGN ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APG APH APP APURE AR ARE ARES AS ASIAN ASW ATO ATS AUR AURA AVAV AVGO AVY AWK AWR AXON AXP AYUD AZN AZO BAC BALL BAX BAY BBIK BBL BCH |
| รูปตัวเลขอื่น (เช่น ราคา 278→277.58 · หน่วย ล้านล้าน→แสนล้าน · ศักราช) | 22 | AAOI AAPL ACMR ADBE ADI ADSK ADVANC AEONTS ALAB ALGN AMAT AMD AMZN ANET APH APP ARE ARM ASML AVGO AYUD BBL |
| สีช่อง .ret ของ v1 ค้าง — v2 คิดสีตามเครื่องหมาย | 50 | A AAOI AAPL ABBNY ABBV ABNB ABT ADBE ADI ADVANC AEP AEVA AHC AIT AJG ALAB ALL ALNY AMAT AMATA AMCR AMD AMGN AMP AMRZ AMT AMZN ANET ANI AOS AP APD APURE AR ARE ARES ASW ATO AVY AWK AWR AXP AYUD AZO BAC BALL BAY BBIK BBL BCH |

### ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ)

เกณฑ์: ห่างไม่เกิน GAP_REL 1.2% (ชั้น 1 ของ migrator) · cron ไม่แตะทั้งสองฝั่ง · มากสุดที่พบ 0.39%

| ชนิด | ใบ | มากสุด | รายชื่อ |
|---|---|---|---|
| ค่าต่างที่มีอยู่ก่อน patch (migration ยอมรับ) | 2 | 0.39% | AEE ANI |

- AEE: «เหมาะสม $106.55 $ ▯ MOS 30% $85.24 MOS 20% $» 74.59 → 74.58 (0.01%)
- ANI: «เหมาะสม ฿3.65 ฿ ▯ MOS 30% ฿2.92 MOS 20% ฿3» 2.56 → 2.55 (0.39%)

### ใบที่ผ่านโดยใช้ข้อยกเว้นของตัวเทียบ (ไม่เปลี่ยนผลตัดสิน — เปิดเผยให้ตรวจ)

| ข้อยกเว้น | ใบ | รายชื่อ |
|---|---|---|
| ผลต่างที่มีก่อน patch — รูปหรือค่า (≤ GAP_REL · ค่าต่างรายใบอยู่ในหมวดด้านบน) | 24 | AAOI AAPL ACMR ADBE ADI ADSK AEE AEONTS AFL ALAB ALL AMAT AMD AMZN ANET ANI APH APP ARM ASML AVGO AVY AXP BBL |
| %/ปี ต่างตามรูปของ "รวม" (ทั้งสองฝั่ง = f(รวมที่โชว์)) | 18 | AAOI ABT ADBE AEHR ALC ALNY AMATA AMRZ AMZN ASW AUR AVAV AVGO AZN BALL BAY BBIK BBL |
| วงเล็บทวนวันที่ล้วน (migrator ลบ · f11) | 1 | AZN |
| หน่วยใหญ่ของเงินต่างกัน ค่าเดียวกัน | 1 | ADVANC |
| ปีคนละศักราช (2569 ↔ 2026) | 1 | APH |

<details><summary>ตัวอย่างรูปทศนิยมหมวด 6 ต่อใบ (v1 → v2 ที่ตัวคูณแรกที่พบ)</summary>

- A: +8.8%→+9% (×0.85)
- AAOI: +16.1%→+16% (×0.85)
- AAON: +221.8%→+222% (×0.85)
- AAPL: +2%→+1.6% (×0.895)
- ABBNY: -23.6%→-24% (×0.85)
- ABBV: +23.2%→+23% (×0.85)
- ABNB: +35.2%→+35% (×0.85)
- ABT: +8.3%→+8% (×0.85)
- ACE: -14.4%→-14% (×0.85)
- ADBE: +12.1%→+12% (×0.85)
- ADI: -1%→-1.4% (×0.85)
- ADP: +40.4%→+40% (×0.85)
- ADVANC: +50.5%→+51% (×0.85)
- AEHR: -67.7%→-68% (×0.85)
- AEP: +2%→+1.7% (×1.02)
- AER: -14.7%→-15% (×0.85)
- AEVA: -84.1%→-84% (×0.85)
- AHC: -19.1%→-19% (×0.85)
- AIT: -25.1%→-25% (×0.85)
- AJG: +2%→+1.7% (×1.09)
- AKAM: -16.9%→-17% (×0.85)
- ALAB: +2%→+1.6% (×1.07)
- ALC: +53.7%→+54% (×0.85)
- ALGN: +68.5%→+68% (×0.85)
- ALL: +2%→+1.9% (×0.855)
- ALNY: -35.9%→-36% (×0.85)
- AMAT: +12.7%→+13% (×0.85)
- AMATA: +11.9%→+12% (×0.85)
- AMCR: +12.2%→+12% (×0.85)
- AMD: +2%→+1.6% (×0.895)
- AMGN: +7.9%→+8% (×0.85)
- AMP: +2%→+1.5% (×0.945)
- AMRZ: +8.6%→+9% (×0.85)
- AMT: +2%→+1.7% (×1.07)
- AMZN: -7.9%→-8% (×0.85)
- ANET: +2%→+1.6% (×0.915)
- ANI: -7.8%→-8% (×0.85)
- AOS: +17.2%→+17% (×0.85)
- AP: +2%→+1.7% (×1.105)
- APD: +2%→+1.5% (×0.92)
- APG: -31.4%→-31% (×0.85)
- APH: +2%→+1.6% (×1.11)
- APP: -3.7%→-4% (×0.85)
- APURE: -23.9%→-24% (×0.85)
- AR: -32.4%→-32% (×0.85)
- ARE: 2%→+1.9% (×1.055)
- ARES: +2.8%→+3% (×0.85)
- AS: -49.5%→-49% (×0.85)
- ASIAN: -20.8%→-21% (×0.85)
- ASW: 7.4%→+7% (×0.85)
- ATO: +39.2%→+39% (×0.85)
- ATS: -17.8%→-18% (×0.85)
- AUR: -95.2%→-95% (×0.85)
- AURA: +73.8%→+74% (×0.85)
- AVAV: -29.2%→-29% (×0.85)
- AVGO: +11.3%→+11% (×0.85)
- AVY: +53.4%→+53% (×0.85)
- AWK: +2%→+1.7% (×1.1)
- AWR: +2.8%→+3% (×0.85)
- AXON: +43.9%→+44% (×0.85)
- AXP: +25.6%→+26% (×0.85)
- AYUD: +1%→+1.4% (×0.855)
- AZN: -12.8%→-13% (×0.85)
- AZO: +17.1%→+17% (×0.85)
- BAC: +4.1%→+4% (×0.85)
- BALL: +6.7%→+7% (×0.85)
- BAX: -30.5%→-30% (×0.85)
- BAY: +24.3%→+24% (×0.85)
- BBIK: +15.4%→+15% (×0.85)
- BBL: +2.6%→+3% (×0.85)
- BCH: +2%→+1.7% (×0.865)

</details>
